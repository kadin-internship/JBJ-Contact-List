"""One-time schema change: adds file_data, file_name, file_mimetype, and
extracted_text to the existing case_studies table. db.create_all() only
creates brand-new tables -- it never alters an existing one -- and
unlike the original CaseStudy table (created fresh by an earlier
deploy), these are new columns on a table that already exists in
production, so they need a manual ALTER TABLE same as any other column
addition. Safe to run more than once: checks first whether each column
already exists and skips it if so.

Run locally for the local SQLite database:
    .venv/bin/python scripts/add_case_study_file_columns.py

Run against production (paste the connection string directly into your
own terminal, not into chat):
    DATABASE_URL=<production connection string> .venv/bin/python scripts/add_case_study_file_columns.py

Run this BEFORE deploying app.py changes that reference these columns --
the app will error on any case-study query if the code expects them
before they exist.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, text

from app import create_app
from db import db

app = create_app()
with app.app_context():
    inspector = inspect(db.engine)
    existing_columns = [c['name'] for c in inspector.get_columns('case_studies')]
    is_postgres = db.engine.dialect.name == 'postgresql'
    blob_type = 'BYTEA' if is_postgres else 'BLOB'

    column_defs = {
        'file_data': blob_type,
        'file_name': 'VARCHAR(256)',
        'file_mimetype': 'VARCHAR(128)',
        'extracted_text': 'TEXT',
    }

    added_any = False
    for name, sql_type in column_defs.items():
        if name in existing_columns:
            print(f'{name} column already exists -- nothing to do.')
            continue
        db.session.execute(text(f'ALTER TABLE case_studies ADD COLUMN {name} {sql_type}'))
        db.session.commit()
        print(f'Added {name} column to case_studies.')
        added_any = True

    if not added_any:
        print('All columns already present.')
