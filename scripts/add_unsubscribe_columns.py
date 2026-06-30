"""One-time schema change: adds unsubscribed and unsubscribe_token to the
existing contacts table. db.create_all() only creates brand-new tables --
it never alters an existing one -- so new columns on an already-deployed
table need a manual ALTER TABLE.

Safe to run more than once: uses Postgres's native "IF NOT EXISTS" clause
so the ALTER TABLE is a no-op if the columns already exist. This avoids
the false-positive bug that SQLAlchemy's inspector can give after
create_app()/db.create_all() runs -- the inspector reads from ORM metadata
(which knows about these columns from the model definition) rather than
querying the actual database, causing it to incorrectly report "already
exists" even when the columns were never added.

Run locally for the local SQLite database:
    .venv/bin/python scripts/add_unsubscribe_columns.py

Run against production (paste the connection string directly into your
own terminal, not into chat):
    DATABASE_URL=<production connection string> .venv/bin/python scripts/add_unsubscribe_columns.py

Run this BEFORE deploying app.py changes that reference these columns --
the app will error on any contact query if the code expects the column
before it exists.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text

from config import Config

database_url = os.environ.get('DATABASE_URL') or Config.SQLALCHEMY_DATABASE_URI
engine = create_engine(database_url)
is_postgres = engine.dialect.name == 'postgresql'

with engine.connect() as conn:
    if is_postgres:
        conn.execute(text(
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unsubscribed BOOLEAN NOT NULL DEFAULT FALSE'
        ))
        conn.execute(text(
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unsubscribe_token VARCHAR(64)'
        ))
        conn.execute(text(
            'CREATE UNIQUE INDEX IF NOT EXISTS ix_contacts_unsubscribe_token ON contacts (unsubscribe_token)'
        ))
    else:
        from sqlalchemy import inspect as sa_inspect
        cols = [c['name'] for c in sa_inspect(engine).get_columns('contacts')]
        if 'unsubscribed' not in cols:
            conn.execute(text('ALTER TABLE contacts ADD COLUMN unsubscribed BOOLEAN NOT NULL DEFAULT 0'))
        if 'unsubscribe_token' not in cols:
            conn.execute(text('ALTER TABLE contacts ADD COLUMN unsubscribe_token VARCHAR(64)'))
    conn.commit()
    print('Done.')
