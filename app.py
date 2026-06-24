import os
import io
import csv
from datetime import date
from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_file, render_template, render_template_string, redirect, url_for
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from config import Config
from db import db
from models import Contact, OutreachOrg, Activity, User
from schemas import ContactSchema
from utils import read_uploaded_file, clean_dataframe
from sqlalchemy import or_, func

load_dotenv()

login_manager = LoginManager()
login_manager.login_view = 'login'


def filtered_contacts_query(q=None, tag=None, county=None, contact_id=None, org_tag=None):
    """Shared filter logic for /api/contacts and the export endpoints, so
    exports always match what's currently shown on screen.

    `tag` filters Contact.tag (People view categories). `org_tag` filters by
    organizations whose OutreachOrg.tag matches (Organizations view categories)
    -- the two category sets use different names for the same kind of group,
    so org_tag is resolved to organization names first rather than treated as
    a Contact.tag value.
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
        query = query.filter(Contact.tag == tag)
    if org_tag:
        org_names = [o[0].lower() for o in db.session.query(OutreachOrg.organization).filter(OutreachOrg.tag == org_tag).all() if o[0]]
        if not org_names:
            return query.filter(False)
        query = query.filter(func.lower(Contact.organization).in_(org_names))
    if county:
        query = query.filter(Contact.county == county)
    return query


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    db.init_app(app)
    login_manager.init_app(app)

    with app.app_context():
        db.create_all()

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

    @app.route('/admin')
    def admin():
        return render_template('admin.html')

    @app.route('/api/contacts', methods=['GET'])
    def list_contacts():
        q = request.args.get('q', type=str)
        tag = request.args.get('tag', type=str)
        county = request.args.get('county', type=str)
        page = request.args.get('page', default=1, type=int)
        limit = request.args.get('limit', default=25, type=int)

        query = filtered_contacts_query(q=q, tag=tag, county=county)

        total = query.count()
        results = query.order_by(Contact.added.desc()).offset((page - 1) * limit).limit(limit).all()
        return jsonify({
            'page': page,
            'limit': limit,
            'total': total,
            'contacts': contacts_schema.dump(results)
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
            conflict = Contact.query.filter(Contact.email == new_email, Contact.id != contact_id).first()
            if conflict:
                return jsonify({'error': 'email exists', 'id': conflict.id}), 409
        for field in ['first_name','last_name','organization','title','phone_office','phone_cell','active','county','notes','tag']:
            if field in data:
                setattr(c, field, data.get(field))
        if 'email' in data:
            c.email = new_email
        if 'lists' in data:
            c.lists = data.get('lists') or []
        if 'data_complete' in data:
            c.data_complete = bool(data.get('data_complete'))
        db.session.add(c)
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': 'database error', 'details': str(e)}), 500
        return jsonify(contact_schema.dump(c))

    @app.route('/api/contacts', methods=['POST'])
    def create_contact():
        data = request.get_json() or {}
        email = (data.get('email') or '').strip() or None
        if email:
            existing = Contact.query.filter_by(email=email).first()
            if existing:
                return jsonify({'error':'email exists', 'id': existing.id}), 409
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
        incomplete = Contact.query.filter(Contact.data_complete == False).count()
        per_tag = db.session.query(Contact.tag, func.count(Contact.id)).group_by(Contact.tag).all()
        per_county = db.session.query(Contact.county, func.count(Contact.id)).group_by(Contact.county).all()
        return jsonify({
            'total': total,
            'incomplete': incomplete,
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
        rows = db.session.query(OutreachOrg.tag, func.count(OutreachOrg.id)).group_by(OutreachOrg.tag).all()
        return jsonify([{'tag': r[0], 'count': r[1]} for r in rows])

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
        rows = db.session.query(Contact.county, func.count(Contact.id)).group_by(Contact.county).all()
        return jsonify([{'county': r[0] or '', 'count': r[1]} for r in rows])

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
        tag_filter = request.args.get('tag', type=str)
        county = request.args.get('county', type=str)
        page = request.args.get('page', default=1, type=int)
        limit = request.args.get('limit', default=25, type=int)

        org_query = OutreachOrg.query
        if tag_filter:
            org_query = org_query.filter(OutreachOrg.tag == tag_filter)
        if q:
            like = f"%{q}%"
            org_query = org_query.filter(or_(OutreachOrg.organization.ilike(like), OutreachOrg.tag.ilike(like), OutreachOrg.notes.ilike(like)))

        rows = org_query.order_by(OutreachOrg.tag, OutreachOrg.organization).all()

        # Fetch every relevant contact in one query and group by lowercased
        # organization name in Python, instead of issuing a query per
        # organization -- that N+1 pattern was the main reason this endpoint
        # felt slow/unresponsive with ~280 organizations.
        contacts_query = Contact.query
        if county:
            contacts_query = contacts_query.filter(Contact.county.ilike(f"%{county}%"))
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
        if 'file' not in request.files:
            return jsonify({'error': 'file is required (form field `file`)'}), 400
        f = request.files['file']
        try:
            df = read_uploaded_file(f)
        except Exception as e:
            return jsonify({'error': str(e)}), 400

        cleaned = clean_dataframe(df)

        inserted = 0
        updated = 0
        skipped = 0
        for _, row in cleaned.iterrows():
            email = str(row['email']).strip()
            if not email:
                skipped += 1
                continue
            existing = Contact.query.filter_by(email=email).first()
            if existing:
                # Update non-empty fields
                changed = False
                for field in ['first_name', 'last_name', 'organization', 'title', 'phone_office', 'phone_cell', 'active', 'county', 'notes', 'tag']:
                    val = row.get(field)
                    if val and (getattr(existing, field) in (None, '', False)):
                        setattr(existing, field, val)
                        changed = True
                # merge lists
                existing_lists = existing.lists or []
                new_lists = row.get('lists') or []
                merged = list(dict.fromkeys(existing_lists + new_lists))
                if merged != existing_lists:
                    existing.lists = merged
                    changed = True
                # data_complete update
                if existing.data_complete != bool(row.get('data_complete')):
                    existing.data_complete = bool(row.get('data_complete'))
                    changed = True
                if changed:
                    db.session.add(existing)
                    updated += 1
                else:
                    skipped += 1
            else:
                c = Contact(
                    tag=row.get('tag') or None,
                    organization=row.get('organization') or None,
                    first_name=row.get('first_name') or None,
                    last_name=row.get('last_name') or None,
                    title=row.get('title') or None,
                    phone_office=row.get('phone_office') or None,
                    phone_cell=row.get('phone_cell') or None,
                    email=email,
                    active=row.get('active') or None,
                    lists=row.get('lists') or [],
                    county=row.get('county') or None,
                    notes=row.get('notes') or None,
                    data_complete=bool(row.get('data_complete')),
                )
                db.session.add(c)
                inserted += 1

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': 'database error', 'details': str(e)}), 500

        return jsonify({'inserted': inserted, 'updated': updated, 'skipped': skipped, 'processed': len(cleaned)})

    @app.route('/api/export', methods=['GET'])
    def export():
        q = request.args.get('q', type=str)
        tag = request.args.get('tag', type=str)
        org_tag = request.args.get('org_tag', type=str)
        county = request.args.get('county', type=str)
        contact_id = request.args.get('id', type=int)
        rows = filtered_contacts_query(q=q, tag=tag, org_tag=org_tag, county=county, contact_id=contact_id).order_by(Contact.added.desc()).all()

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
        tag = request.args.get('tag', type=str)
        org_tag = request.args.get('org_tag', type=str)
        county = request.args.get('county', type=str)
        rows = filtered_contacts_query(q=q, tag=tag, org_tag=org_tag, county=county).all()

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
        tag = request.args.get('tag', type=str)
        org_tag = request.args.get('org_tag', type=str)
        county = request.args.get('county', type=str)
        rows = filtered_contacts_query(q=q, tag=tag, org_tag=org_tag, county=county).order_by(Contact.organization, Contact.last_name).all()

        doc = Document()
        title = tag or org_tag or 'Contacts'
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
        rows = filtered_contacts_query(q=q, tag=tag, org_tag=org_tag, county=county).all()
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

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), threaded=True)
