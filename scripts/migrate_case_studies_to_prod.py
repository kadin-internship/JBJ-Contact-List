"""Copies all case studies (including file attachments) from the local
SQLite database into the production Neon database.

Run once:
    DATABASE_URL=<production url> .venv/bin/python scripts/migrate_case_studies_to_prod.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from config import Config

# Local SQLite
local_url = f"sqlite:///{os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'contacts.db')}"
local_engine = create_engine(local_url)

# Production Neon
prod_url = os.environ.get('DATABASE_URL')
if not prod_url:
    print('ERROR: Set DATABASE_URL to the production connection string.')
    sys.exit(1)
prod_engine = create_engine(prod_url)

with local_engine.connect() as local_conn, prod_engine.connect() as prod_conn:
    rows = local_conn.execute(text(
        'SELECT title, client, sector, file_name, file_mimetype, file_data, extracted_text, challenges, solution, results, created_at FROM case_studies ORDER BY id'
    )).fetchall()

    print(f'Found {len(rows)} case studies locally. Copying to production...')
    inserted = skipped = 0

    for row in rows:
        # Skip if a record with the same title and file_name already exists in prod
        exists = prod_conn.execute(text(
            'SELECT 1 FROM case_studies WHERE title = :title AND file_name = :file_name LIMIT 1'
        ), {'title': row.title, 'file_name': row.file_name}).fetchone()

        if exists:
            skipped += 1
            continue

        prod_conn.execute(text(
            '''INSERT INTO case_studies
               (title, client, sector, file_name, file_mimetype, file_data, extracted_text, challenges, solution, results, created_at)
               VALUES (:title, :client, :sector, :file_name, :file_mimetype, :file_data, :extracted_text, :challenges, :solution, :results, :created_at)'''
        ), {
            'title':          row.title,
            'client':         row.client,
            'sector':         row.sector,
            'file_name':      row.file_name,
            'file_mimetype':  row.file_mimetype,
            'file_data':      row.file_data,
            'extracted_text': row.extracted_text,
            'challenges':     row.challenges,
            'solution':       row.solution,
            'results':        row.results,
            'created_at':     row.created_at,
        })
        inserted += 1

    prod_conn.commit()
    print(f'Done. {inserted} inserted, {skipped} skipped (already existed).')
