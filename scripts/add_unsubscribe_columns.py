"""One-time schema change: adds unsubscribed and unsubscribe_token to the
existing contacts table. db.create_all() only creates brand-new tables --
it never alters an existing one -- so new columns on an already-deployed
table need a manual ALTER TABLE same as any other column addition. Safe
to run more than once: checks first whether each column already exists
and skips it if so.

Run locally for the local SQLite database:
    .venv/bin/python scripts/add_unsubscribe_columns.py

Run against production (paste the connection string directly into your
own terminal, not into chat):
    DATABASE_URL=<production connection string> .venv/bin/python scripts/add_unsubscribe_columns.py

Run this BEFORE deploying app.py changes that reference these columns --
the app will error on any contact query if the code expects them before
they exist.
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
    existing_columns = [c['name'] for c in inspector.get_columns('contacts')]
    is_postgres = db.engine.dialect.name == 'postgresql'
    bool_default = 'DEFAULT FALSE' if is_postgres else 'DEFAULT 0'

    if 'unsubscribed' in existing_columns:
        print('unsubscribed column already exists -- nothing to do.')
    else:
        db.session.execute(text(f'ALTER TABLE contacts ADD COLUMN unsubscribed BOOLEAN NOT NULL {bool_default}'))
        db.session.commit()
        print('Added unsubscribed column to contacts.')

    if 'unsubscribe_token' in existing_columns:
        print('unsubscribe_token column already exists -- nothing to do.')
    else:
        db.session.execute(text('ALTER TABLE contacts ADD COLUMN unsubscribe_token VARCHAR(64)'))
        db.session.commit()
        print('Added unsubscribe_token column to contacts.')

    existing_indexes = [ix['name'] for ix in inspector.get_indexes('contacts')]
    if 'ix_contacts_unsubscribe_token' in existing_indexes:
        print('ix_contacts_unsubscribe_token index already exists -- nothing to do.')
    else:
        db.session.execute(text(
            'CREATE UNIQUE INDEX ix_contacts_unsubscribe_token ON contacts (unsubscribe_token)'
        ))
        db.session.commit()
        print('Added unique index on contacts.unsubscribe_token.')
