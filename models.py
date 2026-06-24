from datetime import datetime, date
from sqlalchemy import Index
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON
from db import db


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
    lists = db.Column(SQLITE_JSON, nullable=True)
    county = db.Column(db.String(128), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    data_complete = db.Column(db.Boolean, default=False, nullable=False)

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
