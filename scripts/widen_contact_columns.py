"""Widen contact columns that real-world data has exceeded.

Professional credentials (suffix), combined addresses (street/city/zip),
and other fields can contain longer values than the original VARCHAR sizes.
All ALTER TABLE operations are safe to run more than once.

Run against production:
    DATABASE_URL="<connection string>" .venv/bin/python scripts/widen_contact_columns.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, text
from app import create_app
from db import db

WIDEN = [
    ('salutation',           'VARCHAR(64)'),
    ('middle_initial',       'VARCHAR(128)'),
    ('suffix',               'VARCHAR(256)'),
    ('email_secondary',      'VARCHAR(512)'),
    ('industry',             'VARCHAR(256)'),
    ('email_status',         'VARCHAR(128)'),
    ('phone_personal',       'VARCHAR(128)'),
    ('phone_misc',           'VARCHAR(128)'),
    ('street',               'VARCHAR(512)'),
    ('city',                 'VARCHAR(256)'),
    ('state',                'VARCHAR(128)'),
    ('zip_code',             'VARCHAR(128)'),
    ('duns_number',          'VARCHAR(128)'),
    ('b2gnow_vendor_number', 'VARCHAR(128)'),
    ('cmbl_status',          'VARCHAR(128)'),
    ('certification_type',   'VARCHAR(512)'),
    ('dba_name',             'VARCHAR(512)'),
    ('certifying_agency',    'VARCHAR(512)'),
]

app = create_app()
with app.app_context():
    for col, new_type in WIDEN:
        db.session.execute(text(f'ALTER TABLE contacts ALTER COLUMN {col} TYPE {new_type}'))
        print(f'  {col} -> {new_type}')
    db.session.commit()
    print('Done.')
