"""One-time schema change: adds Contact.created_by_id (nullable FK to
users.id) to an existing database. db.create_all() only creates
brand-new tables -- it never alters an existing one -- so a new column
on an already-deployed table needs a manual ALTER TABLE. Safe to run
more than once: checks first whether the column already exists and
does nothing if so.

Every existing contact gets created_by_id = NULL, meaning nobody
"owns" it -- those rows become admin-only to edit. That's intentional:
there's no real record of who originally added pre-existing/imported
contacts, so they fall back to the same access level as before for
admins, and read-only for everyone else.

Run locally for the local SQLite database:
    .venv/bin/python scripts/add_created_by_column.py

Run against production (paste the connection string directly into your
own terminal, not into chat):
    DATABASE_URL=<production connection string> .venv/bin/python scripts/add_created_by_column.py

Run this BEFORE deploying app.py changes that reference created_by_id --
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
    if 'created_by_id' in columns:
        print('created_by_id column already exists -- nothing to do.')
    else:
        db.session.execute(text('ALTER TABLE contacts ADD COLUMN created_by_id INTEGER REFERENCES users(id)'))
        db.session.commit()
        print('Added created_by_id column to contacts (NULL for all existing rows).')
