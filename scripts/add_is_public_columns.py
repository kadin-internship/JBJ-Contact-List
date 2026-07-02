"""One-time migration: adds is_public to email_templates and flyer_templates.

Run locally first, then against production before deploying the code that
uses these columns:

    .venv/bin/python scripts/add_is_public_columns.py

    DATABASE_URL=<production url> .venv/bin/python scripts/add_is_public_columns.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from config import Config

database_url = os.environ.get('DATABASE_URL') or Config.SQLALCHEMY_DATABASE_URI
engine = create_engine(database_url)
is_postgres = engine.dialect.name == 'postgresql'

with engine.connect() as conn:
    if is_postgres:
        conn.execute(text('ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE'))
        conn.execute(text('ALTER TABLE flyer_templates ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE'))
    else:
        from sqlalchemy import inspect as sa_inspect
        et_cols = [c['name'] for c in sa_inspect(engine).get_columns('email_templates')]
        ft_cols = [c['name'] for c in sa_inspect(engine).get_columns('flyer_templates')]
        if 'is_public' not in et_cols:
            conn.execute(text('ALTER TABLE email_templates ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT 0'))
        if 'is_public' not in ft_cols:
            conn.execute(text('ALTER TABLE flyer_templates ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT 0'))
    conn.commit()
    print('Done. is_public added to email_templates and flyer_templates.')
