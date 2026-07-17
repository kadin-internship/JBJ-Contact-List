"""Add the extended contact columns introduced for the new spreadsheet format.

New columns: salutation, middle_initial, suffix, email_secondary, industry,
email_status, phone_personal, phone_misc, street, city, state, zip_code,
website, duns_number, b2gnow_vendor_number, cmbl_status, certification_type,
dba_name, certifying_agency.

Safe to run more than once -- columns that already exist are skipped.

Run locally:
    .venv/bin/python scripts/add_new_contact_columns.py

Run against production:
    DATABASE_URL=<connection string> .venv/bin/python scripts/add_new_contact_columns.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, text
from app import create_app
from db import db

NEW_COLUMNS = [
    ('salutation',           'VARCHAR(32)'),
    ('middle_initial',       'VARCHAR(64)'),
    ('suffix',               'VARCHAR(32)'),
    ('email_secondary',      'VARCHAR(320)'),
    ('industry',             'VARCHAR(128)'),
    ('email_status',         'VARCHAR(64)'),
    ('phone_personal',       'VARCHAR(64)'),
    ('phone_misc',           'VARCHAR(64)'),
    ('street',               'VARCHAR(256)'),
    ('city',                 'VARCHAR(128)'),
    ('state',                'VARCHAR(64)'),
    ('zip_code',             'VARCHAR(20)'),
    ('website',              'VARCHAR(512)'),
    ('duns_number',          'VARCHAR(64)'),
    ('b2gnow_vendor_number', 'VARCHAR(64)'),
    ('cmbl_status',          'VARCHAR(64)'),
    ('certification_type',   'VARCHAR(256)'),
    ('dba_name',             'VARCHAR(256)'),
    ('certifying_agency',    'VARCHAR(256)'),
]

app = create_app()
with app.app_context():
    inspector = inspect(db.engine)
    existing = {c['name'] for c in inspector.get_columns('contacts')}

    added = []
    skipped = []
    for col_name, col_type in NEW_COLUMNS:
        if col_name in existing:
            skipped.append(col_name)
        else:
            db.session.execute(text(f'ALTER TABLE contacts ADD COLUMN {col_name} {col_type}'))
            added.append(col_name)

    if added:
        db.session.commit()
        print(f'Added {len(added)} column(s): {", ".join(added)}')
    if skipped:
        print(f'Already existed ({len(skipped)}): {", ".join(skipped)}')
    if not added and not skipped:
        print('Nothing to do.')
