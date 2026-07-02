from datetime import datetime, date
from sqlalchemy import Index
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from db import db


class User(db.Model, UserMixin):
    """An employee login. Accounts are created via create_user.py -- there's
    no public registration since this is an internal tool."""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, index=True, nullable=False)
    display_name = db.Column(db.String(120), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'display_name': self.display_name,
            'is_admin': bool(self.is_admin),
        }


class Contact(db.Model):
    __tablename__ = 'contacts'

    id = db.Column(db.Integer, primary_key=True)
    tag = db.Column(db.String(128), index=True, nullable=True)
    organization = db.Column(db.String(256), nullable=True)
    first_name = db.Column(db.String(128), nullable=True)
    last_name = db.Column(db.String(128), nullable=True)
    title = db.Column(db.String(256), nullable=True)
    phone_office = db.Column(db.String(64), nullable=True)
    phone_cell = db.Column(db.String(64), nullable=True)
    email = db.Column(db.String(320), unique=True, index=True, nullable=True)
    added = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    active = db.Column(db.String(32), nullable=True)
    lists = db.Column(db.JSON, nullable=True)
    county = db.Column(db.String(128), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    data_complete = db.Column(db.Boolean, default=False, nullable=False)
    is_favorite = db.Column(db.Boolean, default=False, nullable=False, index=True)
    # Set when someone clicks the unsubscribe link in a sent email -- the
    # email builder's send route excludes these contacts, but the rest of
    # the app (exports, Draft Email, the main list) still shows them.
    # unsubscribe_token is the lookup key for that link (not the contact's
    # id) so the link can't be used to guess-unsubscribe other contacts.
    unsubscribed = db.Column(db.Boolean, default=False, nullable=False, index=True)
    unsubscribe_token = db.Column(db.String(64), unique=True, nullable=True, index=True)

    __table_args__ = (
        Index('ix_contacts_name', 'first_name', 'last_name'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'tag': self.tag,
            'organization': self.organization,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'title': self.title,
            'phone_office': self.phone_office,
            'phone_cell': self.phone_cell,
            'email': self.email,
            'added': self.added.isoformat() if self.added else None,
            'active': self.active,
            'lists': self.lists or [],
            'county': self.county,
            'notes': self.notes,
            'data_complete': bool(self.data_complete),
            'is_favorite': bool(self.is_favorite),
            'unsubscribed': bool(self.unsubscribed),
        }


class OutreachOrg(db.Model):
    """Organization-level outreach checklist (category + org + last-touched date + notes),
    distinct from the per-person Contact table. Backs the Sections page."""
    __tablename__ = 'outreach_orgs'

    id = db.Column(db.Integer, primary_key=True)
    tag = db.Column(db.String(128), index=True, nullable=False)
    organization = db.Column(db.String(256), nullable=False)
    updated = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    __table_args__ = (
        Index('ix_outreach_orgs_tag_org', 'tag', 'organization'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'tag': self.tag,
            'organization': self.organization,
            'updated': self.updated.isoformat() if self.updated else None,
            'notes': self.notes,
        }


class AuditLog(db.Model):
    """Who did what -- contact/org changes, spreadsheet syncs, user-account
    changes. actor_name is a snapshot of the user's display name at the time
    of the action, so the log stays readable even if that account is later
    renamed or removed."""
    __tablename__ = 'audit_log'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)
    actor_name = db.Column(db.String(120), nullable=False)
    action = db.Column(db.String(64), nullable=False, index=True)
    entity_type = db.Column(db.String(32), nullable=False, index=True)
    entity_id = db.Column(db.Integer, nullable=True)
    entity_label = db.Column(db.String(256), nullable=True)
    details = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'actor_name': self.actor_name,
            'action': self.action,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'entity_label': self.entity_label,
            'details': self.details,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Activity(db.Model):
    """A logged outreach touchpoint. Lets staff see, before reaching out,
    whether someone (or an organization) has already been contacted --
    by whom, when, and what was discussed."""
    __tablename__ = 'activities'

    id = db.Column(db.Integer, primary_key=True)
    contact_id = db.Column(db.Integer, db.ForeignKey('contacts.id'), nullable=True, index=True)
    organization = db.Column(db.String(256), nullable=True, index=True)
    employee_name = db.Column(db.String(128), nullable=False)
    channel = db.Column(db.String(32), nullable=True)
    summary = db.Column(db.Text, nullable=False)
    contacted_on = db.Column(db.Date, nullable=False, default=date.today)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    contact = db.relationship('Contact', backref=db.backref('activities', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': self.id,
            'contact_id': self.contact_id,
            'organization': self.organization,
            'employee_name': self.employee_name,
            'channel': self.channel,
            'summary': self.summary,
            'contacted_on': self.contacted_on.isoformat() if self.contacted_on else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class CaseStudy(db.Model):
    """A past-project writeup (challenge/solution/results) staff can browse
    or reference when prepping outreach. Add/edit/delete is admin-only --
    viewing is open to everyone logged in, same as the rest of the app."""
    __tablename__ = 'case_studies'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(256), nullable=False)
    client = db.Column(db.String(256), nullable=True)
    sector = db.Column(db.String(128), index=True, nullable=True)
    challenges = db.Column(db.Text, nullable=True)
    solution = db.Column(db.Text, nullable=True)
    results = db.Column(db.Text, nullable=True)
    # Uploaded-file path: the original file is kept as-is (downloadable via
    # /case-studies/<id>/file) and its text is best-effort extracted for
    # search -- no AI involved. Manually-typed entries leave these null.
    file_data = db.Column(db.LargeBinary, nullable=True)
    file_name = db.Column(db.String(256), nullable=True)
    file_mimetype = db.Column(db.String(128), nullable=True)
    extracted_text = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'client': self.client,
            'sector': self.sector,
            'challenges': self.challenges,
            'solution': self.solution,
            'results': self.results,
            'has_file': bool(self.file_data),
            'file_name': self.file_name,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class EmailTemplate(db.Model):
    """A saved email design built in the drag-and-drop email builder --
    blocks is an ordered list of {type, ...props} dicts the builder's
    canvas renders from and the HTML-email renderer turns into the real
    sent message."""
    __tablename__ = 'email_templates'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(256), nullable=False)
    subject = db.Column(db.String(512), nullable=True)
    blocks = db.Column(db.JSON, nullable=False, default=list)
    is_public = db.Column(db.Boolean, default=False, nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_by = db.relationship('User', foreign_keys=[created_by_id], lazy='joined')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'subject': self.subject,
            'blocks': self.blocks or [],
            'is_public': self.is_public,
            'created_by_id': self.created_by_id,
            'created_by_name': self.created_by.display_name if self.created_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class FlyerTemplate(db.Model):
    """A saved flyer/social-post design built in the free-canvas flyer
    builder -- elements is an ordered list of {type, x, y, width, height,
    ...props} dicts, array order doubling as stacking (z) order."""
    __tablename__ = 'flyer_templates'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(256), nullable=False)
    format = db.Column(db.String(16), nullable=False, default='square')  # 'square' | 'portrait'
    elements = db.Column(db.JSON, nullable=False, default=list)
    is_public = db.Column(db.Boolean, default=False, nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_by = db.relationship('User', foreign_keys=[created_by_id], lazy='joined')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'format': self.format,
            'elements': self.elements or [],
            'is_public': self.is_public,
            'created_by_id': self.created_by_id,
            'created_by_name': self.created_by.display_name if self.created_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class FlyerAsset(db.Model):
    """An uploaded image used by an Image element in the flyer builder.
    Stored as bytes in Postgres, same reasoning as CaseStudy.file_data --
    Render's free plan has no persistent disk for a filesystem upload path."""
    __tablename__ = 'flyer_assets'

    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.LargeBinary, nullable=False)
    mimetype = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'mimetype': self.mimetype,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class EmailSend(db.Model):
    """The operational record of one real send -- recipient/sent/failed
    counts and status, so a stuck or partial send (e.g. the Render dyno
    restarting mid-send) is visible and diagnosable. Separate from
    AuditLog, which records that a send happened for the Audit Log page;
    this is the queryable per-send detail AuditLog.details isn't suited for."""
    __tablename__ = 'email_sends'

    id = db.Column(db.Integer, primary_key=True)
    template_id = db.Column(db.Integer, db.ForeignKey('email_templates.id'), nullable=True)
    sent_by_name = db.Column(db.String(120), nullable=False)
    subject = db.Column(db.String(512), nullable=True)
    filter_snapshot = db.Column(db.JSON, nullable=True)
    recipient_count = db.Column(db.Integer, nullable=False, default=0)
    sent_count = db.Column(db.Integer, nullable=False, default=0)
    failed_count = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(32), nullable=False, default='pending')  # pending|sending|completed|failed
    error = db.Column(db.Text, nullable=True)
    started_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'template_id': self.template_id,
            'sent_by_name': self.sent_by_name,
            'subject': self.subject,
            'filter_snapshot': self.filter_snapshot,
            'recipient_count': self.recipient_count,
            'sent_count': self.sent_count,
            'failed_count': self.failed_count,
            'status': self.status,
            'error': self.error,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }
