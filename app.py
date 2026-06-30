import os
import io
import csv
from datetime import date, datetime, timedelta
from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_file, render_template, render_template_string, redirect, url_for, abort
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from config import Config
from db import db
from models import Contact, OutreachOrg, Activity, User, AuditLog, CaseStudy
from schemas import ContactSchema
from utils import (
    read_uploaded_file, clean_dataframe, clean_outreach_orgs,
    looks_like_contacts_sheet, looks_like_orgs_sheet,
)
from sqlalchemy import or_, and_, func

load_dotenv()

# Error monitoring is opt-in: only initializes if SENTRY_DSN is set, so the
# app runs exactly as before for local dev or anyone who hasn't created a
# Sentry account. Without this, the only way to learn about a production
# error is a user reporting it.
_sentry_dsn = os.environ.get('SENTRY_DSN')
if _sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.flask import FlaskIntegration
    sentry_sdk.init(
        dsn=_sentry_dsn,
        integrations=[FlaskIntegration()],
        traces_sample_rate=0.0,  # error tracking only, not performance tracing
        send_default_pii=False,  # this app holds contact PII -- don't forward any of it
    )

login_manager = LoginManager()
login_manager.login_view = 'login'

# In-memory storage -- fine for brute-force protection on a single login
# form, but each gunicorn worker process counts independently (no shared
# Redis), so the effective limit across the whole fleet is up to
# (per-worker limit x worker count), not a hard global ceiling. Good
# enough to stop naive password guessing; revisit with a shared store
# (e.g. Redis) if that gap ever matters.
limiter = Limiter(key_func=get_remote_address, default_limits=[])


def parse_multi_param(name):
    """Several filters (county, tag, org_tag) are multi-select -- the
    frontend sends the chosen values as a single comma-joined query param
    (e.g. county=Dallas,Tarrant or tag=Chamber,Clergy)."""
    raw = request.args.get(name, type=str)
    if not raw:
        return []
    return [v.strip() for v in raw.split(',') if v.strip()]


def split_multi(value):
    """Normalizes a tag/org_tag/county value that may arrive as a list, a
    comma-joined string, or a single plain string (e.g. from a JSON body)
    into a list."""
    if not value:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if v and str(v).strip()]
    return [v.strip() for v in str(value).split(',') if v.strip()]


def county_filter_clause(counties):
    """Matches if ANY selected county appears as one of the comma-separated
    entries in Contact.county, not just an exact whole-field match --
    e.g. selecting "Dallas" should also match a contact filed under
    "Dallas, Tarrant"."""
    if not counties:
        return None
    clauses = []
    for c in counties:
        clauses.append(or_(
            Contact.county.ilike(c),
            Contact.county.ilike(f"{c}, %"),
            Contact.county.ilike(f"%, {c}"),
            Contact.county.ilike(f"%, {c}, %"),
        ))
    return or_(*clauses)


def contact_incomplete_clause():
    """A contact counts as incomplete when there's no way to reach them --
    no email AND no phone of either kind. Mirrors the "Incomplete"/
    "Complete" flag shown on the contact detail panel (see `incomplete` in
    showContactDetail() in app.js), so the dashboard stat and the per-
    contact flag never disagree. Contact.data_complete is unused here --
    nothing in the UI ever sets it, so it was permanently 0%."""
    no_email = or_(Contact.email.is_(None), Contact.email == '')
    no_phone = and_(
        or_(Contact.phone_office.is_(None), Contact.phone_office == ''),
        or_(Contact.phone_cell.is_(None), Contact.phone_cell == ''),
    )
    return and_(no_email, no_phone)


def filtered_contacts_query(q=None, tag=None, county=None, contact_id=None, org_tag=None, followup=None, favorites_only=False):
    """Shared filter logic for /api/contacts and the export endpoints, so
    exports always match what's currently shown on screen.

    `tag` filters Contact.tag (People view categories). `org_tag` filters by
    organizations whose OutreachOrg.tag matches (Organizations view categories)
    -- the two category sets use different names for the same kind of group,
    so org_tag is resolved to organization names first rather than treated as
    a Contact.tag value.

    `followup` is 'never' (no Activity at all) or a number of days as a
    string ('30'/'60'/'90') meaning "no Activity logged in that many days,
    including never" -- a contact with no activity at all always counts as
    overdue, regardless of the threshold.
    """
    query = Contact.query
    if contact_id:
        query = query.filter(Contact.id == contact_id)
    if q:
        like = f"%{q}%"
        full_name = func.coalesce(Contact.first_name, '') + ' ' + func.coalesce(Contact.last_name, '')
        query = query.filter(or_(
            full_name.ilike(like),
            Contact.organization.ilike(like),
            Contact.title.ilike(like),
            Contact.email.ilike(like),
            Contact.county.ilike(like),
        ))
    if tag:
        tags = split_multi(tag)
        if tags:
            query = query.filter(Contact.tag.in_(tags))
    if org_tag:
        org_tags = split_multi(org_tag)
        org_names = [o[0].lower() for o in db.session.query(OutreachOrg.organization).filter(OutreachOrg.tag.in_(org_tags)).all() if o[0]]
        if not org_names:
            return query.filter(False)
        query = query.filter(func.lower(Contact.organization).in_(org_names))
    if county:
        counties = split_multi(county)
        clause = county_filter_clause(counties)
        if clause is not None:
            query = query.filter(clause)
    if followup:
        last_contacted = (
            db.session.query(Activity.contact_id, func.max(Activity.contacted_on).label('last_contacted'))
            .group_by(Activity.contact_id)
            .subquery()
        )
        query = query.outerjoin(last_contacted, last_contacted.c.contact_id == Contact.id)
        if followup == 'never':
            query = query.filter(last_contacted.c.last_contacted.is_(None))
        else:
            try:
                cutoff = date.today() - timedelta(days=int(followup))
            except (TypeError, ValueError):
                cutoff = None
            if cutoff is not None:
                query = query.filter(or_(
                    last_contacted.c.last_contacted.is_(None),
                    last_contacted.c.last_contacted < cutoff,
                ))
    if favorites_only:
        query = query.filter(Contact.is_favorite == True)
    return query


def log_audit(action, entity_type, entity_id=None, entity_label=None, details=None):
    """Records who did what, for the admin-only Audit Log page. Commits on
    its own -- callers should already have committed the actual change, so
    a failure here never rolls back the change it's describing."""
    entry = AuditLog(
        user_id=current_user.id if current_user.is_authenticated else None,
        actor_name=current_user.display_name if current_user.is_authenticated else 'System',
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_label=entity_label,
        details=details,
    )
    db.session.add(entry)
    db.session.commit()


ACTION_LABELS = {
    'contact_created': 'Added contact',
    'contact_updated': 'Edited contact',
    'contact_deleted': 'Deleted contact',
    'spreadsheet_sync': 'Synced spreadsheet',
    'user_created': 'Created user login',
    'password_reset': 'Reset password for',
    'case_study_created': 'Added case study',
    'case_study_updated': 'Edited case study',
    'case_study_deleted': 'Deleted case study',
    'case_study_uploaded': 'Uploaded case study file(s)',
}


def format_audit_details(action, details):
    """Turns an AuditLog row's raw `details` JSON into a one-line, readable
    summary for the audit log page -- the shape of `details` differs per
    action (a field-diff for edits, import counts for a sync, etc)."""
    d = details or {}
    if action == 'contact_updated':
        parts = []
        for field, change in d.items():
            parts.append(f"{field}: \"{change.get('old') or ''}\" → \"{change.get('new') or ''}\"")
        return '; '.join(parts)
    if action == 'spreadsheet_sync':
        c = d.get('contacts', {})
        o = d.get('organizations', {})
        return (
            f"Contacts: {c.get('inserted', 0)} new, {c.get('updated', 0)} updated · "
            f"Organizations: {o.get('inserted', 0)} new, {o.get('updated', 0)} updated"
        )
    if action == 'user_created':
        return 'Admin access' if d.get('is_admin') else 'Standard access'
    if action == 'case_study_uploaded':
        titles = d.get('titles') or []
        return f"{d.get('count', len(titles))} file(s): {', '.join(titles[:5])}{'...' if len(titles) > 5 else ''}"
    return ''


def format_audit_summary(entry):
    """Builds the one-line "what happened" summary shown per row on the
    Audit Log page, e.g. 'Edited contact Jane Doe -- title: "" -> "Mayor"'."""
    action_label = ACTION_LABELS.get(entry.action, entry.action)
    line = f"{action_label} {entry.entity_label}" if entry.entity_label else action_label
    detail = format_audit_details(entry.action, entry.details)
    return f"{line} — {detail}" if detail else line


def _bootstrap_admin_user():
    """Create one admin account from env vars if no user exists yet.

    Render's Shell tab (the obvious way to run create_user.py against the
    production database) needs a paid plan. This lets the very first
    account get created from env vars set in Render's free Environment
    tab instead. Only fires while the users table is empty, so it can't
    be replayed later to reset someone's password.
    """
    if User.query.count() > 0:
        return
    username = os.environ.get('BOOTSTRAP_ADMIN_USERNAME')
    password = os.environ.get('BOOTSTRAP_ADMIN_PASSWORD')
    if not username or not password:
        return
    display_name = os.environ.get('BOOTSTRAP_ADMIN_DISPLAY_NAME', username)
    user = User(username=username, display_name=display_name, is_admin=True)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()


def _import_contacts(df, result):
    """Upsert a People-sheet DataFrame into Contact, accumulating
    inserted/updated/skipped counts into `result`. Matches existing rows
    by email when present; rows without an email (allowed since
    Contact.email is optional) are matched by name+organization instead,
    since there's no other reliable natural key."""
    cleaned = clean_dataframe(df)
    for row in cleaned:
        email = (row.get('email') or '').strip()
        if email:
            existing = Contact.query.filter(func.lower(Contact.email) == email.lower()).first()
        else:
            existing = Contact.query.filter(
                func.lower(Contact.first_name) == (row.get('first_name') or '').lower(),
                func.lower(Contact.last_name) == (row.get('last_name') or '').lower(),
                func.lower(Contact.organization) == (row.get('organization') or '').lower(),
            ).first()
        if existing:
            changed = False
            for field in ['first_name', 'last_name', 'organization', 'title', 'phone_office', 'phone_cell', 'active', 'county', 'notes', 'tag']:
                val = row.get(field)
                if val and (getattr(existing, field) in (None, '', False)):
                    setattr(existing, field, val)
                    changed = True
            existing_lists = existing.lists or []
            new_lists = row.get('lists') or []
            merged = list(dict.fromkeys(existing_lists + new_lists))
            if merged != existing_lists:
                existing.lists = merged
                changed = True
            if existing.data_complete != bool(row.get('data_complete')):
                existing.data_complete = bool(row.get('data_complete'))
                changed = True
            if changed:
                db.session.add(existing)
                result['updated'] += 1
            else:
                result['skipped'] += 1
        else:
            c = Contact(
                tag=row.get('tag') or None,
                organization=row.get('organization') or None,
                first_name=row.get('first_name') or None,
                last_name=row.get('last_name') or None,
                title=row.get('title') or None,
                phone_office=row.get('phone_office') or None,
                phone_cell=row.get('phone_cell') or None,
                email=email or None,
                active=row.get('active') or None,
                lists=row.get('lists') or [],
                county=row.get('county') or None,
                notes=row.get('notes') or None,
                data_complete=bool(row.get('data_complete')),
            )
            db.session.add(c)
            result['inserted'] += 1


def _import_orgs(df, result):
    """Upsert an Organizations-sheet DataFrame into OutreachOrg, matching
    existing rows by (tag, organization)."""
    cleaned = clean_outreach_orgs(df)
    for row in cleaned:
        existing = OutreachOrg.query.filter_by(tag=row['tag'], organization=row['organization']).first()
        if existing:
            changed = False
            if row.get('updated') and existing.updated != row['updated']:
                existing.updated = row['updated']
                changed = True
            if row.get('notes') and existing.notes != row['notes']:
                existing.notes = row['notes']
                changed = True
            if changed:
                db.session.add(existing)
                result['updated'] += 1
            else:
                result['skipped'] += 1
        else:
            rec = OutreachOrg(tag=row['tag'], organization=row['organization'], updated=row.get('updated'), notes=row.get('notes'))
            db.session.add(rec)
            result['inserted'] += 1


def extract_case_study_text(file_storage):
    """Pulls raw text out of an uploaded .pdf or .docx for the case-study
    importer to hand to Claude. Returns (text, error) -- exactly one is
    None. Native Google Docs aren't readable here (no Drive API access);
    the user has to export them to .docx or PDF first via Drive's
    Download menu, same as old binary .doc files."""
    filename = file_storage.filename or ''
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

    if ext == 'pdf':
        from pypdf import PdfReader
        try:
            reader = PdfReader(file_storage.stream)
            text = '\n'.join((page.extract_text() or '') for page in reader.pages)
        except Exception as e:
            return None, f'Could not read this PDF: {e}'
    elif ext == 'docx':
        from docx import Document as DocxReader
        try:
            doc = DocxReader(file_storage.stream)
            text = '\n'.join(p.text for p in doc.paragraphs)
        except Exception as e:
            return None, f'Could not read this Word document: {e}'
    else:
        return None, (
            f'Unsupported file type ".{ext or "unknown"}" -- only .pdf and .docx are supported. '
            'Native Google Docs need to be exported first (File > Download > Microsoft Word or PDF).'
        )

    text = text.strip()
    if len(text) < 30:
        return None, 'Could not find readable text in this file (it may be a scanned/image-only PDF).'
    return text, None


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    db.init_app(app)
    login_manager.init_app(app)
    limiter.init_app(app)

    with app.app_context():
        db.create_all()
        _bootstrap_admin_user()

    contact_schema = ContactSchema()
    contacts_schema = ContactSchema(many=True)

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # Every page and API route requires login except the login page itself
    # and static assets -- gated centrally here instead of decorating each
    # of the ~20 routes individually, so a newly added route can't
    # accidentally end up unprotected.
    @app.before_request
    def require_login():
        if request.endpoint in (None, 'login', 'static'):
            return None
        if not current_user.is_authenticated:
            if request.path.startswith('/api/'):
                return jsonify({'error': 'authentication required'}), 401
            return redirect(url_for('login', next=request.path))

    @app.route('/login', methods=['GET', 'POST'])
    @limiter.limit("10 per minute", methods=["POST"])
    def login():
        if current_user.is_authenticated:
            return redirect(url_for('index'))
        error = None
        username = ''
        if request.method == 'POST':
            username = (request.form.get('username') or '').strip()
            password = request.form.get('password') or ''
            user = User.query.filter_by(username=username).first()
            if user and user.check_password(password):
                login_user(user, remember=True)
                next_path = request.args.get('next')
                return redirect(next_path or url_for('index'))
            error = 'Invalid username or password.'
        return render_template('login.html', error=error, username=username)

    @app.errorhandler(429)
    def too_many_login_attempts(e):
        # Only /login is rate-limited today, so a generic handler is safe;
        # revisit this if another route ever gets its own limit.
        return render_template(
            'login.html',
            error='Too many login attempts. Please wait a minute and try again.',
            username=''
        ), 429

    @app.route('/logout')
    def logout():
        logout_user()
        return redirect(url_for('login'))

    @app.route('/')
    def index():
        # Serve single-page frontend
        return render_template('index.html')

    @app.route('/profile/<int:contact_id>')
    def profile(contact_id):
        return render_template('profile.html', contact_id=contact_id)

    @app.route('/case-studies')
    def case_studies_list():
        q = request.args.get('q', type=str)
        sector = request.args.get('sector', type=str)
        page = request.args.get('page', default=1, type=int)
        limit = 12

        query = CaseStudy.query
        if q:
            like = f"%{q}%"
            query = query.filter(or_(
                CaseStudy.title.ilike(like),
                CaseStudy.client.ilike(like),
                CaseStudy.sector.ilike(like),
                CaseStudy.challenges.ilike(like),
                CaseStudy.solution.ilike(like),
                CaseStudy.results.ilike(like),
                CaseStudy.extracted_text.ilike(like),
            ))
        if sector:
            query = query.filter(CaseStudy.sector == sector)

        total = query.count()
        pages = max(1, (total + limit - 1) // limit)
        page = max(1, min(page, pages))
        items = query.order_by(CaseStudy.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
        sectors = [s[0] for s in db.session.query(CaseStudy.sector)
                   .filter(CaseStudy.sector.isnot(None), CaseStudy.sector != '')
                   .distinct().order_by(CaseStudy.sector).all()]

        return render_template(
            'case_studies.html', items=items, total=total, page=page, pages=pages,
            q=q or '', sector=sector or '', sectors=sectors,
        )

    @app.route('/case-studies/new')
    def case_study_new_form():
        if not current_user.is_admin:
            return redirect(url_for('case_studies_list'))
        return render_template('case_study_form.html', case_study=None)

    @app.route('/case-studies/upload')
    def case_study_upload_form():
        if not current_user.is_admin:
            return redirect(url_for('case_studies_list'))
        return render_template('case_study_upload.html')

    @app.route('/case-studies/<int:case_study_id>')
    def case_study_detail(case_study_id):
        cs = CaseStudy.query.get_or_404(case_study_id)
        return render_template('case_study_detail.html', cs=cs)

    @app.route('/case-studies/<int:case_study_id>/file')
    def case_study_file(case_study_id):
        cs = CaseStudy.query.get_or_404(case_study_id)
        if not cs.file_data:
            abort(404)
        return send_file(
            io.BytesIO(cs.file_data),
            mimetype=cs.file_mimetype or 'application/octet-stream',
            as_attachment=True,
            download_name=cs.file_name or f'case-study-{cs.id}',
        )

    @app.route('/case-studies/<int:case_study_id>/edit')
    def case_study_edit_form(case_study_id):
        if not current_user.is_admin:
            return redirect(url_for('case_studies_list'))
        cs = CaseStudy.query.get_or_404(case_study_id)
        return render_template('case_study_form.html', case_study=cs)

    @app.route('/admin')
    def admin():
        if not current_user.is_admin:
            return redirect(url_for('index'))
        return render_template('admin.html')

    @app.route('/admin/users')
    def manage_users():
        if not current_user.is_admin:
            return redirect(url_for('index'))
        users = User.query.order_by(User.username).all()
        return render_template('users.html', users=users)

    @app.route('/admin/audit')
    def audit_log():
        if not current_user.is_admin:
            return redirect(url_for('index'))
        page = request.args.get('page', default=1, type=int)
        limit = 50
        query = AuditLog.query.order_by(AuditLog.created_at.desc())
        total = query.count()
        rows = query.offset((page - 1) * limit).limit(limit).all()
        pages = max(1, (total + limit - 1) // limit)
        entries = [{
            'created_at': e.created_at,
            'actor_name': e.actor_name,
            'summary': format_audit_summary(e),
        } for e in rows]
        return render_template('audit.html', entries=entries, page=page, pages=pages)

    @app.route('/admin/analytics')
    def analytics():
        if not current_user.is_admin:
            return redirect(url_for('index'))

        def ranked(rows):
            """[(label, count), ...] -> [{'label','count','pct'}, ...], pct relative to the top row."""
            top = rows[0][1] if rows else 0
            return [{'label': label, 'count': count, 'pct': round(100 * count / top) if top else 0}
                    for label, count in rows]

        total_contacts = Contact.query.count()
        total_orgs = OutreachOrg.query.count()
        total_activities = Activity.query.count()
        incomplete_count = Contact.query.filter(contact_incomplete_clause()).count()
        data_complete_pct = round(100 * (total_contacts - incomplete_count) / total_contacts) if total_contacts else 0

        contacted_ids = {r[0] for r in db.session.query(Activity.contact_id)
                          .filter(Activity.contact_id.isnot(None)).distinct().all()}
        never_contacted = max(0, total_contacts - len(contacted_ids))

        today = date.today()
        activities_30d = Activity.query.filter(Activity.contacted_on >= today - timedelta(days=30)).count()
        audit_cutoff = datetime.utcnow() - timedelta(days=30)
        audit_30d = AuditLog.query.filter(AuditLog.created_at >= audit_cutoff).count()

        # Weekly outreach trend, oldest to newest, last 12 weeks.
        weeks_back = 12
        trend_start = today - timedelta(weeks=weeks_back)
        contacted_dates = [d for (d,) in db.session.query(Activity.contacted_on)
                           .filter(Activity.contacted_on >= trend_start).all() if d]
        week_counts = [0] * weeks_back
        for d in contacted_dates:
            idx = weeks_back - 1 - (today - d).days // 7
            if 0 <= idx < weeks_back:
                week_counts[idx] += 1
        max_week = max(week_counts) if week_counts else 0
        weekly_trend = []
        for idx, c in enumerate(week_counts):
            weeks_ago = weeks_back - 1 - idx
            week_end = today - timedelta(days=weeks_ago * 7)
            week_start = week_end - timedelta(days=6)
            weekly_trend.append({
                'count': c,
                'pct': round(100 * c / max_week) if max_week else 0,
                'week_start': week_start.isoformat(),
                'week_end': week_end.isoformat(),
            })

        by_employee = ranked(
            db.session.query(Activity.employee_name, func.count(Activity.id))
            .group_by(Activity.employee_name)
            .order_by(func.count(Activity.id).desc()).limit(10).all()
        )

        by_channel = ranked(
            db.session.query(Activity.channel, func.count(Activity.id))
            .group_by(Activity.channel)
            .order_by(func.count(Activity.id).desc()).all()
        )
        for row in by_channel:
            row['label'] = row['label'] or 'Unspecified'

        # Contact.county can hold several comma-separated counties in one
        # field (see /api/counties) -- split those apart so each county
        # name is counted on its own instead of every combination being a
        # separate bucket.
        county_counts = {}
        county_rows = (db.session.query(Contact.county, func.count(Activity.id))
                        .join(Activity, Activity.contact_id == Contact.id)
                        .filter(Contact.county.isnot(None), Contact.county != '')
                        .group_by(Contact.county).all())
        for county_str, count in county_rows:
            for part in county_str.split(','):
                part = part.strip()
                if part:
                    county_counts[part] = county_counts.get(part, 0) + count
        by_county = ranked(sorted(county_counts.items(), key=lambda kv: -kv[1])[:10])

        by_action = ranked(
            db.session.query(AuditLog.action, func.count(AuditLog.id))
            .filter(AuditLog.created_at >= audit_cutoff)
            .group_by(AuditLog.action)
            .order_by(func.count(AuditLog.id).desc()).all()
        )
        for row in by_action:
            row['action'] = row['label']
            row['label'] = ACTION_LABELS.get(row['label'], row['label'])

        return render_template(
            'analytics.html',
            total_contacts=total_contacts,
            total_orgs=total_orgs,
            total_activities=total_activities,
            activities_30d=activities_30d,
            never_contacted=never_contacted,
            data_complete_pct=data_complete_pct,
            audit_30d=audit_30d,
            weekly_trend=weekly_trend,
            by_employee=by_employee,
            by_channel=by_channel,
            by_county=by_county,
            by_action=by_action,
        )

    @app.route('/api/analytics/activities', methods=['GET'])
    def analytics_activities():
        """Backs the click-to-drill-down on the Analytics dashboard --
        given one of the breakdown dimensions (employee/channel/county) or a
        week range from the trend chart, returns the actual outreach entries
        behind that number, including who the contact was."""
        if not current_user.is_admin:
            return jsonify({'error': 'admin only'}), 403

        employee = request.args.get('employee', type=str)
        channel = request.args.get('channel', type=str)
        county = request.args.get('county', type=str)
        week_start = request.args.get('week_start', type=str)
        week_end = request.args.get('week_end', type=str)

        query = Activity.query.options(db.joinedload(Activity.contact))
        if employee:
            query = query.filter(Activity.employee_name == employee)
        if channel:
            if channel == 'Unspecified':
                query = query.filter(or_(Activity.channel.is_(None), Activity.channel == ''))
            else:
                query = query.filter(Activity.channel == channel)
        if county:
            query = query.join(Contact, Activity.contact_id == Contact.id).filter(Contact.county.ilike(f'%{county}%'))
        if week_start and week_end:
            query = query.filter(Activity.contacted_on >= week_start, Activity.contacted_on <= week_end)

        rows = query.order_by(Activity.contacted_on.desc()).limit(200).all()
        activities = []
        for a in rows:
            contact = a.contact
            contact_name = f"{contact.first_name or ''} {contact.last_name or ''}".strip() if contact else ''
            activities.append({
                'employee_name': a.employee_name,
                'channel': a.channel,
                'contacted_on': a.contacted_on.isoformat() if a.contacted_on else None,
                'summary': a.summary,
                'contact_name': contact_name or None,
                'contact_email': contact.email if contact else None,
                'organization': a.organization or (contact.organization if contact else None),
            })
        return jsonify({'count': len(activities), 'activities': activities})

    @app.route('/api/analytics/audit-entries', methods=['GET'])
    def analytics_audit_entries():
        """Backs the click-to-drill-down on the Analytics dashboard's Admin
        Activity breakdown -- same idea as analytics_activities(), but for
        AuditLog rows instead of outreach Activity rows."""
        if not current_user.is_admin:
            return jsonify({'error': 'admin only'}), 403

        action = request.args.get('action', type=str)
        query = AuditLog.query.filter(AuditLog.created_at >= datetime.utcnow() - timedelta(days=30))
        if action:
            query = query.filter(AuditLog.action == action)

        rows = query.order_by(AuditLog.created_at.desc()).limit(200).all()
        entries = [{
            'created_at': e.created_at.isoformat() if e.created_at else None,
            'actor_name': e.actor_name,
            'summary': format_audit_summary(e),
        } for e in rows]
        return jsonify({'count': len(entries), 'entries': entries})

    @app.route('/api/users', methods=['POST'])
    def create_user_api():
        # Lets an admin create more employee logins from the browser, so
        # only the very first account ever needs the env-var bootstrap above.
        if not current_user.is_admin:
            return jsonify({'error': 'admin only'}), 403
        data = request.get_json(force=True) or {}
        username = (data.get('username') or '').strip()
        password = data.get('password') or ''
        display_name = (data.get('display_name') or '').strip() or username
        is_admin = bool(data.get('is_admin'))
        if not username or not password:
            return jsonify({'error': 'username and password are required'}), 400
        if len(password) < 8:
            return jsonify({'error': 'password must be at least 8 characters'}), 400
        if User.query.filter_by(username=username).first():
            return jsonify({'error': 'that username is already taken'}), 409
        user = User(username=username, display_name=display_name, is_admin=is_admin)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        log_audit('user_created', 'user', user.id, username, {'is_admin': is_admin})
        return jsonify(user.to_dict()), 201

    @app.route('/api/users/<int:user_id>/reset-password', methods=['POST'])
    def reset_user_password(user_id):
        # There's no self-service "forgot password" flow (no email service
        # configured) -- an admin resetting it here is the only path today.
        if not current_user.is_admin:
            return jsonify({'error': 'admin only'}), 403
        data = request.get_json(silent=True) or {}
        password = data.get('password') or ''
        if len(password) < 8:
            return jsonify({'error': 'password must be at least 8 characters'}), 400
        user = User.query.get_or_404(user_id)
        user.set_password(password)
        db.session.commit()
        log_audit('password_reset', 'user', user.id, user.username)
        return jsonify({'ok': True})

    def _case_study_fields(data):
        return {
            'title': (data.get('title') or '').strip(),
            'client': (data.get('client') or '').strip() or None,
            'sector': (data.get('sector') or '').strip() or None,
            'challenges': (data.get('challenges') or '').strip() or None,
            'solution': (data.get('solution') or '').strip() or None,
            'results': (data.get('results') or '').strip() or None,
        }

    @app.route('/api/case-studies', methods=['POST'])
    def create_case_study():
        if not current_user.is_admin:
            return jsonify({'error': 'admin only'}), 403
        fields = _case_study_fields(request.get_json(force=True) or {})
        if not fields['title']:
            return jsonify({'error': 'title is required'}), 400
        cs = CaseStudy(**fields)
        db.session.add(cs)
        db.session.commit()
        log_audit('case_study_created', 'case_study', cs.id, cs.title)
        return jsonify(cs.to_dict()), 201

    @app.route('/api/case-studies/<int:case_study_id>', methods=['PUT'])
    def update_case_study(case_study_id):
        if not current_user.is_admin:
            return jsonify({'error': 'admin only'}), 403
        cs = CaseStudy.query.get_or_404(case_study_id)
        fields = _case_study_fields(request.get_json(force=True) or {})
        if not fields['title']:
            return jsonify({'error': 'title is required'}), 400
        for key, value in fields.items():
            setattr(cs, key, value)
        db.session.commit()
        log_audit('case_study_updated', 'case_study', cs.id, cs.title)
        return jsonify(cs.to_dict())

    @app.route('/api/case-studies/<int:case_study_id>', methods=['DELETE'])
    def delete_case_study(case_study_id):
        if not current_user.is_admin:
            return jsonify({'error': 'admin only'}), 403
        cs = CaseStudy.query.get_or_404(case_study_id)
        label = cs.title
        db.session.delete(cs)
        db.session.commit()
        log_audit('case_study_deleted', 'case_study', case_study_id, label)
        return jsonify({'deleted': True})

    @app.route('/api/case-studies/upload', methods=['POST'])
    def upload_case_study_files():
        """Stores uploaded PDF/Word files as-is (downloadable later) and
        best-effort extracts their text for search -- no AI involved.
        Title defaults to the filename; sector/client/challenges/solution/
        results are left blank for the admin to fill in later via Edit if
        they want that level of detail."""
        if not current_user.is_admin:
            return jsonify({'error': 'admin only'}), 403

        files = request.files.getlist('files')
        if not files:
            return jsonify({'error': 'No files uploaded.'}), 400
        if len(files) > 15:
            return jsonify({'error': 'Upload at most 15 files at a time.'}), 400

        results = []
        created_titles = []
        for f in files:
            filename = f.filename or 'Untitled'
            file_bytes = f.read()
            if not file_bytes:
                results.append({'filename': filename, 'success': False, 'error': 'Empty file.'})
                continue
            f.stream.seek(0)
            text, extract_error = extract_case_study_text(f)

            title = filename.rsplit('.', 1)[0].replace('_', ' ').replace('-', ' ').strip() or filename
            cs = CaseStudy(
                title=title,
                file_data=file_bytes,
                file_name=filename,
                file_mimetype=f.mimetype or 'application/octet-stream',
                extracted_text=text,
            )
            db.session.add(cs)
            db.session.commit()
            created_titles.append(cs.title)
            results.append({
                'filename': filename, 'success': True, 'id': cs.id, 'title': cs.title,
                'text_extracted': bool(text),
                'note': None if text else (extract_error or 'File stored, but text could not be extracted for search.'),
            })

        if created_titles:
            log_audit('case_study_uploaded', 'case_study', None, None, {'count': len(created_titles), 'titles': created_titles})

        return jsonify({'results': results})

    @app.route('/api/contacts', methods=['GET'])
    def list_contacts():
        q = request.args.get('q', type=str)
        tag = parse_multi_param('tag')
        county = parse_multi_param('county')
        followup = request.args.get('followup', type=str)
        favorites_only = request.args.get('favorites_only', type=str) in ('1', 'true', 'True')
        page = request.args.get('page', default=1, type=int)
        limit = request.args.get('limit', default=25, type=int)

        query = filtered_contacts_query(q=q, tag=tag, county=county, followup=followup, favorites_only=favorites_only)

        total = query.count()
        results = query.order_by(Contact.added.desc()).offset((page - 1) * limit).limit(limit).all()
        contacts = contacts_schema.dump(results)

        # Batched per-page lookup of outreach recency, not per-contact --
        # this page has at most `limit` rows, so one extra query here is
        # cheap regardless of how many contacts exist in total.
        contact_ids = [c.id for c in results]
        if contact_ids:
            rows = (
                db.session.query(Activity.contact_id, Activity.channel, func.max(Activity.contacted_on))
                .filter(Activity.contact_id.in_(contact_ids))
                .group_by(Activity.contact_id, Activity.channel)
                .all()
            )
            last_contacted = {}
            last_emailed = {}
            for cid, channel, latest in rows:
                if latest and (cid not in last_contacted or latest > last_contacted[cid]):
                    last_contacted[cid] = latest
                if channel == 'Email' and latest and (cid not in last_emailed or latest > last_emailed[cid]):
                    last_emailed[cid] = latest
            for c in contacts:
                lc = last_contacted.get(c['id'])
                le = last_emailed.get(c['id'])
                c['last_contacted_on'] = lc.isoformat() if lc else None
                c['last_emailed_on'] = le.isoformat() if le else None

        return jsonify({
            'page': page,
            'limit': limit,
            'total': total,
            'contacts': contacts
        })

    @app.route('/api/contacts/<int:contact_id>', methods=['GET'])
    def get_contact(contact_id):
        c = Contact.query.get_or_404(contact_id)
        return jsonify(contact_schema.dump(c))

    @app.route('/api/contacts/<int:contact_id>', methods=['PUT'])
    def update_contact(contact_id):
        c = Contact.query.get_or_404(contact_id)
        data = request.get_json() or {}
        new_email = (data.get('email') or '').strip() or None
        if 'email' in data and new_email and new_email != c.email:
            conflict = Contact.query.filter(func.lower(Contact.email) == new_email.lower(), Contact.id != contact_id).first()
            if conflict:
                return jsonify({'error': 'email exists', 'id': conflict.id}), 409

        changes = {}
        if 'email' in data and new_email != c.email:
            changes['email'] = {'old': c.email, 'new': new_email}
        for field in ['first_name','last_name','organization','title','phone_office','phone_cell','active','county','notes','tag']:
            if field in data:
                old = getattr(c, field)
                new = data.get(field)
                if old != new:
                    changes[field] = {'old': old, 'new': new}
                setattr(c, field, new)
        if 'email' in data:
            c.email = new_email
        if 'lists' in data:
            new_lists = data.get('lists') or []
            if (c.lists or []) != new_lists:
                changes['lists'] = {'old': c.lists or [], 'new': new_lists}
            c.lists = new_lists
        if 'data_complete' in data:
            new_dc = bool(data.get('data_complete'))
            if bool(c.data_complete) != new_dc:
                changes['data_complete'] = {'old': bool(c.data_complete), 'new': new_dc}
            c.data_complete = new_dc
        db.session.add(c)
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': 'database error', 'details': str(e)}), 500
        if changes:
            label = f"{c.first_name or ''} {c.last_name or ''}".strip() or c.email or f'#{c.id}'
            log_audit('contact_updated', 'contact', c.id, label, changes)
        return jsonify(contact_schema.dump(c))

    @app.route('/api/contacts/<int:contact_id>', methods=['DELETE'])
    def delete_contact(contact_id):
        if not current_user.is_admin:
            return jsonify({'error': 'admin only'}), 403
        c = Contact.query.get_or_404(contact_id)
        label = f"{c.first_name or ''} {c.last_name or ''}".strip() or c.email or f'#{c.id}'
        # No ON DELETE CASCADE on activities.contact_id -- deleting the
        # contact's own outreach log entries first avoids a FK violation
        # on Postgres (SQLite doesn't enforce this by default, but
        # Postgres does).
        Activity.query.filter_by(contact_id=c.id).delete()
        db.session.delete(c)
        db.session.commit()
        log_audit('contact_deleted', 'contact', contact_id, label)
        return jsonify({'deleted': True})

    @app.route('/api/contacts/<int:contact_id>/favorite', methods=['PUT'])
    def toggle_contact_favorite(contact_id):
        # Deliberately not run through update_contact()'s change-diffing --
        # starring something is a personal/team organizing action, not a
        # data edit worth cluttering the Audit Log over.
        c = Contact.query.get_or_404(contact_id)
        data = request.get_json(silent=True) or {}
        c.is_favorite = bool(data.get('is_favorite'))
        db.session.commit()
        return jsonify({'id': c.id, 'is_favorite': c.is_favorite})

    @app.route('/api/contacts', methods=['POST'])
    def create_contact():
        data = request.get_json() or {}
        email = (data.get('email') or '').strip() or None
        force = bool(data.get('force_create'))
        if email:
            existing = Contact.query.filter(func.lower(Contact.email) == email.lower()).first()
            if existing:
                return jsonify({'error': 'email exists', 'id': existing.id}), 409
        if not force:
            first_name = (data.get('first_name') or '').strip()
            last_name = (data.get('last_name') or '').strip()
            organization = (data.get('organization') or '').strip()
            if first_name and last_name and organization:
                possible_dup = Contact.query.filter(
                    func.lower(Contact.first_name) == first_name.lower(),
                    func.lower(Contact.last_name) == last_name.lower(),
                    func.lower(Contact.organization) == organization.lower(),
                ).first()
                if possible_dup:
                    return jsonify({
                        'warning': 'possible_duplicate',
                        'id': possible_dup.id,
                        'message': f'A contact named {first_name} {last_name} at {organization} already exists. Add anyway?',
                    }), 409
        c = Contact(
            email=email,
            first_name=data.get('first_name') or None,
            last_name=data.get('last_name') or None,
            organization=data.get('organization') or None,
            title=data.get('title') or None,
            phone_office=data.get('phone_office') or None,
            phone_cell=data.get('phone_cell') or None,
            active=data.get('active') or None,
            lists=data.get('lists') or [],
            county=data.get('county') or None,
            notes=data.get('notes') or None,
            tag=data.get('tag') or None,
            data_complete=bool(data.get('data_complete')),
        )
        db.session.add(c)
        db.session.commit()
        label = f"{c.first_name or ''} {c.last_name or ''}".strip() or c.email or f'#{c.id}'
        log_audit('contact_created', 'contact', c.id, label)
        return jsonify(contact_schema.dump(c)), 201

    @app.route('/api/contacts/<int:contact_id>/activity', methods=['GET'])
    def list_contact_activity(contact_id):
        Contact.query.get_or_404(contact_id)
        rows = Activity.query.filter_by(contact_id=contact_id) \
            .order_by(Activity.contacted_on.desc(), Activity.created_at.desc()).all()
        return jsonify({'activity': [a.to_dict() for a in rows]})

    @app.route('/api/contacts/<int:contact_id>/activity', methods=['POST'])
    def create_contact_activity(contact_id):
        c = Contact.query.get_or_404(contact_id)
        data = request.get_json(silent=True) or {}
        summary = (data.get('summary') or '').strip()
        if not summary:
            return jsonify({'error': 'summary is required'}), 400
        a = Activity(
            contact_id=c.id,
            organization=c.organization,
            employee_name=current_user.display_name,
            channel=data.get('channel') or None,
            summary=summary,
            contacted_on=date.fromisoformat(data['contacted_on']) if data.get('contacted_on') else date.today(),
        )
        db.session.add(a)
        db.session.commit()
        return jsonify(a.to_dict()), 201

    @app.route('/api/organizations/<organization>/activity', methods=['GET'])
    def list_org_activity(organization):
        rows = Activity.query.filter(func.lower(Activity.organization) == organization.lower()) \
            .order_by(Activity.contacted_on.desc(), Activity.created_at.desc()).all()
        return jsonify({'activity': [a.to_dict() for a in rows]})

    @app.route('/api/organizations/<organization>/activity', methods=['POST'])
    def create_org_activity(organization):
        data = request.get_json(silent=True) or {}
        summary = (data.get('summary') or '').strip()
        if not summary:
            return jsonify({'error': 'summary is required'}), 400
        a = Activity(
            contact_id=None,
            organization=organization,
            employee_name=current_user.display_name,
            channel=data.get('channel') or None,
            summary=summary,
            contacted_on=date.fromisoformat(data['contacted_on']) if data.get('contacted_on') else date.today(),
        )
        db.session.add(a)
        db.session.commit()
        return jsonify(a.to_dict()), 201

    @app.route('/api/activity/<int:activity_id>', methods=['DELETE'])
    def delete_activity(activity_id):
        a = Activity.query.get_or_404(activity_id)
        db.session.delete(a)
        db.session.commit()
        return jsonify({'ok': True})

    @app.route('/api/stats', methods=['GET'])
    def stats():
        total = Contact.query.count()
        incomplete = Contact.query.filter(contact_incomplete_clause()).count()
        organizations = OutreachOrg.query.count()
        complete_pct = round(100 * (total - incomplete) / total) if total else 0
        per_tag = db.session.query(Contact.tag, func.count(Contact.id)).group_by(Contact.tag).all()
        per_county = db.session.query(Contact.county, func.count(Contact.id)).group_by(Contact.county).all()
        return jsonify({
            'total': total,
            'incomplete': incomplete,
            'organizations': organizations,
            'complete_pct': complete_pct,
            'by_tag': {k if k else '': v for k, v in per_tag},
            'by_county': {k if k else '': v for k, v in per_county}
        })

    @app.route('/api/tags', methods=['GET'])
    def tags():
        tags = [t[0] for t in db.session.query(Contact.tag).distinct().all()]
        return jsonify(sorted([t for t in tags if t]))

    @app.route('/api/categories', methods=['GET'])
    def categories():
        # Categories map to tags with counts
        rows = db.session.query(Contact.tag, func.count(Contact.id)).group_by(Contact.tag).all()
        return jsonify([{'tag': r[0], 'count': r[1]} for r in rows])

    @app.route('/api/section-categories', methods=['GET'])
    def section_categories():
        # Categories for the Sections/outreach-checklist page (its own tag set,
        # separate from Contact.tag since the two sheets label categories differently).
        tags = [t[0] for t in db.session.query(OutreachOrg.tag).distinct().all()]
        return jsonify(sorted([t for t in tags if t]))

    @app.route('/api/section-stats', methods=['GET'])
    def section_stats():
        total = OutreachOrg.query.count()
        contact_orgs = set(
            (o[0] or '').lower() for o in db.session.query(Contact.organization).filter(Contact.organization != None).all()
        )
        org_names = db.session.query(OutreachOrg.organization).all()
        no_contact = sum(1 for o in org_names if o[0].lower() not in contact_orgs)
        return jsonify({'total': total, 'no_contact': no_contact})

    @app.route('/api/counties', methods=['GET'])
    def counties():
        # Contact.county can hold several comma-separated counties in one
        # string (e.g. "Dallas, Tarrant, Collin") -- split those apart so
        # each county name is offered exactly once in the filter, instead
        # of every distinct combination showing up as its own option.
        rows = db.session.query(Contact.county).filter(Contact.county.isnot(None), Contact.county != '').distinct().all()
        names = set()
        for (val,) in rows:
            for part in (val or '').split(','):
                part = part.strip()
                if part:
                    names.add(part)
        return jsonify(sorted(names))

    @app.route('/api/sections', methods=['GET'])
    def sections():
        """Organizations view: the outreach checklist (OutreachOrg: category,
        org, last-touched date, notes) cross-referenced against the live
        Contact table by organization name, returned as a flat paginated list
        (same shape as /api/contacts) with every matching contact at that
        organization -- not just one "primary" contact -- so coworkers who
        share an organization show up together.

        Supports optional filters: q (text), tag (category), county, page, limit.
        """
        q = request.args.get('q', type=str)
        tag_filter = parse_multi_param('tag')
        county = parse_multi_param('county')
        page = request.args.get('page', default=1, type=int)
        limit = request.args.get('limit', default=25, type=int)

        org_query = OutreachOrg.query
        if tag_filter:
            org_query = org_query.filter(OutreachOrg.tag.in_(tag_filter))
        if q:
            like = f"%{q}%"
            org_query = org_query.filter(or_(OutreachOrg.organization.ilike(like), OutreachOrg.tag.ilike(like), OutreachOrg.notes.ilike(like)))

        rows = org_query.order_by(OutreachOrg.tag, OutreachOrg.organization).all()

        # Fetch every relevant contact in one query and group by lowercased
        # organization name in Python, instead of issuing a query per
        # organization -- that N+1 pattern was the main reason this endpoint
        # felt slow/unresponsive with ~280 organizations.
        contacts_query = Contact.query
        county_clause = county_filter_clause(county)
        if county_clause is not None:
            contacts_query = contacts_query.filter(county_clause)
        contacts_by_org = {}
        for c in contacts_query.order_by(Contact.first_name, Contact.last_name).all():
            if not c.organization:
                continue
            contacts_by_org.setdefault(c.organization.lower(), []).append(c)

        items = []
        for org_row in rows:
            org = org_row.organization
            org_contacts = contacts_by_org.get(org.lower(), [])
            if county and not org_contacts:
                # no contacts in the requested county for this org; skip it
                continue
            items.append({
                'tag': org_row.tag or 'Other',
                'organization': org,
                'contact_count': len(org_contacts),
                'latest_updated': org_row.updated,
                'contacts': [{
                    'id': c.id,
                    'name': f"{c.first_name or ''} {c.last_name or ''}".strip(),
                    'title': c.title or '',
                    'email': c.email or '',
                    'phone_cell': c.phone_cell or '',
                    'phone_office': c.phone_office or '',
                } for c in org_contacts],
                'notes': org_row.notes or ''
            })

        # sort by last-touched date desc (untouched orgs sort last)
        items.sort(key=lambda it: it['latest_updated'] or date(1970, 1, 1), reverse=True)

        total = len(items)
        start = (page - 1) * limit
        page_items = items[start:start + limit]
        for it in page_items:
            it['latest_updated'] = it['latest_updated'].isoformat() if it['latest_updated'] else None

        return jsonify({'page': page, 'limit': limit, 'total': total, 'organizations': page_items})

    @app.route('/api/upload', methods=['POST'])
    def upload():
        # Accepts a CSV (People only) or an Excel workbook -- a workbook
        # can have a People tab and a separate Organizations tab (matching
        # the original spreadsheet's shape); each sheet is classified by
        # its columns and upserted with the matching importer.
        if not current_user.is_admin:
            return jsonify({'error': 'admin only'}), 403
        if 'file' not in request.files:
            return jsonify({'error': 'file is required (form field `file`)'}), 400
        f = request.files['file']
        try:
            sheets = read_uploaded_file(f)
        except Exception as e:
            return jsonify({'error': str(e)}), 400

        contacts_result = {'inserted': 0, 'updated': 0, 'skipped': 0}
        orgs_result = {'inserted': 0, 'updated': 0, 'skipped': 0}

        for df in sheets.values():
            if df is None or df.empty:
                continue
            if looks_like_contacts_sheet(df):
                _import_contacts(df, contacts_result)
            elif looks_like_orgs_sheet(df):
                _import_orgs(df, orgs_result)
            # Sheets that match neither shape (e.g. an instructions tab)
            # are silently ignored rather than guessed at.

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': 'database error', 'details': str(e)}), 500

        log_audit('spreadsheet_sync', 'sync', None, f.filename, {
            'contacts': contacts_result,
            'organizations': orgs_result,
        })
        return jsonify({'contacts': contacts_result, 'organizations': orgs_result})

    @app.route('/api/export', methods=['GET'])
    def export():
        q = request.args.get('q', type=str)
        tag = parse_multi_param('tag')
        org_tag = parse_multi_param('org_tag')
        county = parse_multi_param('county')
        followup = request.args.get('followup', type=str)
        favorites_only = request.args.get('favorites_only', type=str) in ('1', 'true', 'True')
        contact_id = request.args.get('id', type=int)
        rows = filtered_contacts_query(q=q, tag=tag, org_tag=org_tag, county=county, contact_id=contact_id, followup=followup, favorites_only=favorites_only).order_by(Contact.added.desc()).all()

        # stream CSV
        si = io.StringIO()
        writer = csv.writer(si)
        header = ['id','tag','organization','first_name','last_name','title','phone_office','phone_cell','email','added','active','lists','county','notes','data_complete']
        writer.writerow(header)
        for r in rows:
            writer.writerow([
                r.id, r.tag, r.organization, r.first_name, r.last_name, r.title,
                r.phone_office, r.phone_cell, r.email, r.added.isoformat() if r.added else '',
                r.active, (','.join(r.lists) if r.lists else ''), r.county, r.notes, int(bool(r.data_complete))
            ])
        si.seek(0)
        return send_file(io.BytesIO(si.getvalue().encode('utf-8')), mimetype='text/csv', as_attachment=True, download_name='contacts_export.csv')

    @app.route('/api/export/emails', methods=['GET'])
    def export_emails():
        """Flat, de-duplicated list of email addresses for the current filter,
        meant for pasting into the BCC field of a mass email."""
        q = request.args.get('q', type=str)
        tag = parse_multi_param('tag')
        org_tag = parse_multi_param('org_tag')
        county = parse_multi_param('county')
        followup = request.args.get('followup', type=str)
        favorites_only = request.args.get('favorites_only', type=str) in ('1', 'true', 'True')
        rows = filtered_contacts_query(q=q, tag=tag, org_tag=org_tag, county=county, followup=followup, favorites_only=favorites_only).all()

        emails = []
        seen = set()
        for r in rows:
            if not r.email:
                continue
            # some legacy records store multiple addresses separated by '|'
            for part in r.email.split('|'):
                addr = part.strip()
                if addr and addr.lower() not in seen:
                    seen.add(addr.lower())
                    emails.append(addr)

        return jsonify({'count': len(emails), 'emails': emails, 'joined': ', '.join(emails)})

    @app.route('/api/export/docx', methods=['GET'])
    def export_docx():
        from docx import Document

        q = request.args.get('q', type=str)
        tag = parse_multi_param('tag')
        org_tag = parse_multi_param('org_tag')
        county = parse_multi_param('county')
        followup = request.args.get('followup', type=str)
        favorites_only = request.args.get('favorites_only', type=str) in ('1', 'true', 'True')
        rows = filtered_contacts_query(q=q, tag=tag, org_tag=org_tag, county=county, followup=followup, favorites_only=favorites_only).order_by(Contact.organization, Contact.last_name).all()

        doc = Document()
        title = ', '.join(tag) if tag else (', '.join(org_tag) if org_tag else 'Contacts')
        doc.add_heading(title, level=1)
        doc.add_paragraph(f'{len(rows)} contact(s)')

        table = doc.add_table(rows=1, cols=5)
        table.style = 'Light Grid Accent 1'
        hdr = table.rows[0].cells
        hdr[0].text, hdr[1].text, hdr[2].text, hdr[3].text, hdr[4].text = 'Name', 'Title', 'Organization', 'Email', 'Phone'
        for r in rows:
            cells = table.add_row().cells
            cells[0].text = f"{r.first_name or ''} {r.last_name or ''}".strip()
            cells[1].text = r.title or ''
            cells[2].text = r.organization or ''
            cells[3].text = r.email or ''
            cells[4].text = r.phone_office or r.phone_cell or ''

        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        safe_name = (tag or org_tag or 'contacts').replace('/', '-').replace(' ', '_')
        return send_file(buf, mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                          as_attachment=True, download_name=f'{safe_name}_export.docx')

    @app.route('/api/draft-email', methods=['POST'])
    def draft_email():
        import anthropic

        data = request.get_json(silent=True) or {}
        prompt = (data.get('prompt') or '').strip()
        if not prompt:
            return jsonify({'error': 'Describe the email you want to draft.'}), 400

        api_key = os.environ.get('ANTHROPIC_API_KEY')
        if not api_key:
            return jsonify({'error': 'ANTHROPIC_API_KEY is not configured on the server.'}), 500

        q = data.get('q')
        tag = data.get('tag')
        org_tag = data.get('org_tag')
        county = data.get('county')
        followup = data.get('followup')
        favorites_only = bool(data.get('favorites_only'))
        rows = filtered_contacts_query(q=q, tag=tag, org_tag=org_tag, county=county, followup=followup, favorites_only=favorites_only).all()
        orgs = sorted({r.organization for r in rows if r.organization})

        context_lines = [f"{len(rows)} recipient(s) in this group."]
        if tag:
            context_lines.append(f'Category/tag filter: {tag}.')
        if org_tag:
            context_lines.append(f'Organization category filter: {org_tag}.')
        if county:
            context_lines.append(f'County filter: {county}.')
        if q:
            context_lines.append(f'Search filter: "{q}".')
        if followup == 'never':
            context_lines.append("This group has never been contacted before -- this would be a first outreach, not a check-in.")
        elif followup:
            context_lines.append(f"This group hasn't been contacted in {followup}+ days -- consider a warmer, re-engaging tone rather than a routine update.")
        if orgs:
            sample = ', '.join(orgs[:8])
            context_lines.append(f'Sample organizations: {sample}{"..." if len(orgs) > 8 else "."}')

        system = (
            "You draft outreach emails for JBJ Management, sent to community contacts "
            "(elected officials, organizations, clergy, chambers of commerce, etc). Write "
            "a complete, professional but warm email with a subject line and body, tailored "
            "to the recipient group described. Use \"[Name]\" as a placeholder for the "
            "individual recipient's name. Do not invent specific facts (dates, addresses, "
            "times) the user didn't provide -- use a placeholder like [DATE] or [LOCATION] "
            "instead. Output only the subject line and email body, no commentary."
        )
        user_message = "Recipient group:\n" + "\n".join(context_lines) + f"\n\nEmail request: {prompt}"

        try:
            client = anthropic.Anthropic(api_key=api_key)
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=system,
                messages=[{"role": "user", "content": user_message}],
            )
        except anthropic.APIStatusError as e:
            return jsonify({'error': f'Claude API error: {e.message}'}), 502
        except Exception as e:
            return jsonify({'error': str(e)}), 502

        draft = next((b.text for b in response.content if b.type == 'text'), '')
        return jsonify({'draft': draft, 'recipient_count': len(rows)})

    @app.route('/api/generate-flyer', methods=['POST'])
    def generate_flyer():
        import json
        import base64
        import anthropic
        import openai
        from PIL import Image, ImageDraw, ImageFont

        data = request.get_json(silent=True) or {}
        prompt = (data.get('prompt') or '').strip()
        fmt = data.get('format') if data.get('format') in ('square', 'portrait') else 'square'
        if not prompt:
            return jsonify({'error': 'Describe what the post or flyer is about.'}), 400

        anthropic_key = os.environ.get('ANTHROPIC_API_KEY')
        openai_key = os.environ.get('OPENAI_API_KEY')
        if not anthropic_key:
            return jsonify({'error': 'ANTHROPIC_API_KEY is not configured on the server.'}), 500
        if not openai_key:
            return jsonify({'error': 'OPENAI_API_KEY is not configured on the server.'}), 500

        width, height = (1024, 1536) if fmt == 'portrait' else (1024, 1024)

        copy_system = (
            "You write short marketing copy for a single social media post or printed "
            "flyer image for JBJ Management, a community/government-relations firm. "
            'Respond with ONLY valid JSON, no commentary or markdown fences, in this '
            'exact shape: {"headline": "...", "body": "..."}. The headline must be 3-7 '
            "words, punchy, no ending period. The body must be 1-2 short sentences, 25 "
            "words or fewer. Do not invent specific dates, addresses, or prices the user "
            "didn't provide -- use a placeholder like [DATE] if one seems needed."
        )
        raw_text = ''
        try:
            claude = anthropic.Anthropic(api_key=anthropic_key)
            copy_response = claude.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=200,
                system=copy_system,
                messages=[{"role": "user", "content": prompt}],
            )
            raw_text = next((b.text for b in copy_response.content if b.type == 'text'), '{}').strip()
            if raw_text.startswith('```'):
                raw_text = raw_text.strip('`')
                if raw_text.startswith('json'):
                    raw_text = raw_text[4:]
            parsed = json.loads(raw_text)
            headline = (parsed.get('headline') or '').strip() or 'JBJ Management'
            body = (parsed.get('body') or '').strip()
        except anthropic.APIStatusError as e:
            return jsonify({'error': f'Claude API error: {e.message}'}), 502
        except Exception:
            headline = raw_text[:60] or 'JBJ Management'
            body = ''

        visual_prompt = (
            f"A clean, professional background graphic for a "
            f"{'printed flyer' if fmt == 'portrait' else 'social media post'} about: "
            f"{prompt}. Style: modern, minimal, photo-realistic or tasteful abstract "
            "design. Color palette: deep maroon red, black, and soft dusty rose accents "
            "on white or light background. Leave clear open, uncluttered space in the "
            "lower third of the image for text to be added afterward. Absolutely no "
            "text, words, letters, or numbers anywhere in the image."
        )
        try:
            oai_client = openai.OpenAI(api_key=openai_key)
            img_response = oai_client.images.generate(
                model="gpt-image-1-mini",
                prompt=visual_prompt,
                size=f"{width}x{height}",
                quality="low",
            )
            img_bytes = base64.b64decode(img_response.data[0].b64_json)
        except openai.APIStatusError as e:
            return jsonify({'error': f'OpenAI image API error: {e.message}'}), 502
        except Exception as e:
            return jsonify({'error': str(e)}), 502

        base_img = Image.open(io.BytesIO(img_bytes)).convert('RGBA')
        if base_img.size != (width, height):
            base_img = base_img.resize((width, height))
        overlay = Image.new('RGBA', base_img.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        fonts_dir = os.path.join(os.path.dirname(__file__), 'static', 'fonts')
        headline_font = ImageFont.truetype(
            os.path.join(fonts_dir, 'ArchivoBlack-Regular.ttf'),
            56 if fmt == 'portrait' else 48,
        )
        body_font = ImageFont.truetype(os.path.join(fonts_dir, 'Inter-Variable.ttf'), 28)
        try:
            body_font.set_variation_by_name('Regular')
        except Exception:
            pass

        margin = 60
        max_width = width - margin * 2

        def wrap_text(text, font, max_w):
            lines, cur = [], ''
            for word in text.split():
                trial = (cur + ' ' + word).strip()
                if draw.textlength(trial, font=font) <= max_w:
                    cur = trial
                else:
                    if cur:
                        lines.append(cur)
                    cur = word
            if cur:
                lines.append(cur)
            return lines

        headline_lines = wrap_text(headline, headline_font, max_width)
        body_lines = wrap_text(body, body_font, max_width) if body else []
        line_gap = 10
        headline_h = len(headline_lines) * (headline_font.size + line_gap)
        body_h = len(body_lines) * (body_font.size + 8) if body_lines else 0
        band_height = min(height, headline_h + body_h + 80)
        band_top = height - band_height

        draw.rectangle([0, band_top, width, height], fill=(20, 0, 2, 175))

        y = band_top + 36
        for line in headline_lines:
            draw.text((margin, y), line, font=headline_font, fill=(255, 255, 255, 255))
            y += headline_font.size + line_gap
        y += 8
        for line in body_lines:
            draw.text((margin, y), line, font=body_font, fill=(240, 240, 240, 255))
            y += body_font.size + 8

        final = Image.alpha_composite(base_img, overlay).convert('RGB')
        buf = io.BytesIO()
        final.save(buf, format='PNG')
        final_b64 = base64.b64encode(buf.getvalue()).decode('ascii')

        return jsonify({
            'image': f'data:image/png;base64,{final_b64}',
            'headline': headline,
            'body': body,
        })

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), threaded=True)
