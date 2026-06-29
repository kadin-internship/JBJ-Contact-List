"""One-time schema change: adds Contact.is_favorite to an existing
database. db.create_all() only creates brand-new tables -- it never
alters an existing one -- so a new column on an already-deployed table
needs a manual ALTER TABLE. Safe to run more than once: checks first
whether the column already exists and does nothing if so.

Run locally for the local SQLite database:
    .venv/bin/python scripts/add_favorite_column.py

Run against production (paste the connection string directly into your
own terminal, not into chat):
    DATABASE_URL=<production connection string> .venv/bin/python scripts/add_favorite_column.py

Run this BEFORE deploying app.py changes that reference is_favorite --
the app will error on any contact query if the code expects the column
before it exists.
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
    columns = [c['name'] for c in inspector.get_columns('contacts')]
    if 'is_favorite' in columns:
        print('is_favorite column already exists -- nothing to do.')
    else:
        default_clause = 'DEFAULT FALSE' if db.engine.dialect.name == 'postgresql' else 'DEFAULT 0'
        db.session.execute(text(f'ALTER TABLE contacts ADD COLUMN is_favorite BOOLEAN NOT NULL {default_clause}'))
        db.session.commit()
        print('Added is_favorite column to contacts.')
