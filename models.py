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
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
