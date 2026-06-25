"""One-time migration: copy every row out of the local SQLite contacts.db
into a separate database (e.g. a free Neon/Supabase Postgres instance).

Run locally -- not on Render -- so the destination connection string
never has to pass through chat, logs, or a deploy log:

    TARGET_DATABASE_URL=<paste connection string directly into your own
    terminal, not into chat> .venv/bin/python scripts/migrate_sqlite_to_postgres.py

Refuses to run if the target already has rows in any of these tables,
so re-running it can't silently duplicate or overwrite data.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask
from sqlalchemy import text
from config import Config
from db import db
from models import User, Contact, OutreachOrg, Activity

MODELS_IN_ORDER = [User, Contact, OutreachOrg, Activity]


def make_app(database_url):
    app = Flask(__name__)
    app.config.from_object(Config)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    db.init_app(app)
    return app


def row_values(obj, model):
    return {c.name: getattr(obj, c.name) for c in model.__table__.columns}


def fix_postgres_sequences(app):
    """After inserting rows with explicit ids, the id sequence Postgres
    uses for *new* rows hasn't moved -- bump it past the highest id we
    just copied so the next contact added through the app doesn't
    collide with an existing row."""
    with app.app_context():
        if db.engine.dialect.name != 'postgresql':
            return
        for model in MODELS_IN_ORDER:
            table = model.__table__.name
            db.session.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {table}), 1))"
            ))
        db.session.commit()


def main():
    source_url = os.environ.get('SOURCE_DATABASE_URL') or Config.SQLALCHEMY_DATABASE_URI
    target_url = os.environ.get('TARGET_DATABASE_URL')
    if not target_url:
        print('Set TARGET_DATABASE_URL to the destination connection string.')
        sys.exit(1)

    source_app = make_app(source_url)
    target_app = make_app(target_url)

    with target_app.app_context():
        db.create_all()
        for model in MODELS_IN_ORDER:
            if model.query.count() > 0:
                print(f'Target already has rows in "{model.__tablename__}" -- '
                      f'refusing to run, to avoid duplicating data.')
                sys.exit(1)

    for model in MODELS_IN_ORDER:
        with source_app.app_context():
            rows = [row_values(obj, model) for obj in model.query.all()]
        with target_app.app_context():
            for row in rows:
                db.session.add(model(**row))
            db.session.commit()
        print(f'Copied {len(rows)} rows into "{model.__tablename__}".')

    fix_postgres_sequences(target_app)
    print('Done.')


if __name__ == '__main__':
    main()
