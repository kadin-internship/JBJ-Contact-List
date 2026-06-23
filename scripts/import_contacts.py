#!/usr/bin/env python3
import sys
import csv
from pathlib import Path

# Make sure project root is on sys.path so imports work when executed from /scripts
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import create_app
from db import db
from models import Contact

IN = Path('imports/cleaned_contacts.csv')
if not IN.exists():
    print('Missing', IN)
    raise SystemExit(1)

app = create_app()
with app.app_context():
    inserted = 0
    skipped = 0
    updated = 0
    with IN.open('r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            email = (row.get('email') or '').strip().lower()
            raw = (row.get('raw') or '').strip()
            if not email:
                skipped += 1
                continue
            existing = Contact.query.filter_by(email=email).first()
            if existing:
                skipped += 1
                continue
            # minimal parsing: try to extract name tokens before email in raw
            first_name = None
            last_name = None
            organization = None
            # Heuristic: split raw by email to get left side
            left = raw.split(email)[0]
            parts = left.replace('\t', ' ').split('  ')
            # fallback split
            tokens = [p.strip() for p in left.split() if p.strip()]
            if tokens:
                # try to find two capitalized words as name
                for i in range(len(tokens)-1):
                    if tokens[i][0].isupper() and tokens[i+1][0].isupper() and len(tokens[i])>1:
                        first_name = tokens[i]
                        last_name = tokens[i+1]
                        break
                # organization = first few tokens if first token is Tag like 'Advocacy' or 'Chamber'
                if tokens[0].istitle() or tokens[0].upper()==tokens[0]:
                    organization = tokens[0]
            c = Contact(email=email, notes=raw, first_name=first_name, last_name=last_name, organization=organization, data_complete=False)
            db.session.add(c)
            inserted += 1
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print('DB error:', e)
        raise SystemExit(1)

    print(f'Inserted={inserted} skipped={skipped} updated={updated}')
