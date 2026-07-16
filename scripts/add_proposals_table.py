"""One-time schema migration: creates the `proposals` table in an existing
production database. db.create_all() only creates tables that don't exist,
so running this is safe -- if the table already exists it does nothing.

Run locally:
    .venv/bin/python scripts/add_proposals_table.py

Run against production (set DATABASE_URL to the Render/Heroku connection string):
    DATABASE_URL=<production connection string> .venv/bin/python scripts/add_proposals_table.py

Run this BEFORE deploying any code that references the Proposal model, otherwise
the app will 500 on any proposal route when the table doesn't exist.
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
    existing_tables = inspector.get_table_names()

    if 'proposals' in existing_tables:
        print('proposals table already exists -- nothing to do.')
    else:
        # Let SQLAlchemy create it from the model definition
        db.create_all()
        # Verify it was created
        inspector2 = inspect(db.engine)
        if 'proposals' in inspector2.get_table_names():
            print('proposals table created successfully.')
        else:
            print('ERROR: proposals table was not created. Check models.py.')
            sys.exit(1)

    # Report columns
    cols = [c['name'] for c in inspector.get_columns('proposals')] if 'proposals' in existing_tables else \
           [c['name'] for c in inspect(db.engine).get_columns('proposals')]
    print(f'proposals columns: {", ".join(cols)}')
