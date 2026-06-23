#!/usr/bin/env python3
import sys
import csv
from pathlib import Path

# ensure project root on path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import create_app
from db import db
from models import Contact

IN = Path('/Users/kadinlee-smith/Downloads/2026-06-12_MasterOutreachList - MasterOutreachList.csv')
if not IN.exists():
    print('Missing', IN)
    raise SystemExit(1)

def guess(colnames, targets):
    # return first column name that contains any target substring
    lower = {c.lower(): c for c in colnames}
    for t in targets:
        for k,v in lower.items():
            if t in k:
                return v
    return None

app = create_app()
with app.app_context():
    inserted = 0
    updated = 0
    skipped = 0
    with IN.open('r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames or []
        # guess mapping
        email_col = guess(cols, ['email'])
        first_col = guess(cols, ['first', 'first name'])
        last_col = guess(cols, ['last', 'last name'])
        org_col = guess(cols, ['organization', 'org', 'company', 'organization name'])
        title_col = guess(cols, ['title', 'position'])
        phone_office_col = guess(cols, ['phone office', 'office_phone', 'phone'])
        phone_cell_col = guess(cols, ['phone cell', 'cell', 'mobile'])
        tag_col = guess(cols, ['tag'])
        lists_col = guess(cols, ['lists', 'list'])
        county_col = guess(cols, ['county'])
        notes_col = guess(cols, ['notes', 'note'])

        print('Detected columns mapping:')
        for name,val in [('email',email_col),('first',first_col),('last',last_col),('org',org_col),('title',title_col)]:
            print(f'  {name}: {val}')

        for row in reader:
            email = (row.get(email_col) or '').strip().lower() if email_col else ''
            if not email:
                skipped += 1
                continue
            existing = Contact.query.filter_by(email=email).first()
            data = {
                'first_name': (row.get(first_col) or '').strip() if first_col else None,
                'last_name': (row.get(last_col) or '').strip() if last_col else None,
                'organization': (row.get(org_col) or '').strip() if org_col else None,
                'title': (row.get(title_col) or '').strip() if title_col else None,
                'phone_office': (row.get(phone_office_col) or '').strip() if phone_office_col else None,
                'phone_cell': (row.get(phone_cell_col) or '').strip() if phone_cell_col else None,
                'tag': (row.get(tag_col) or '').strip() if tag_col else None,
                'lists': [(s.strip()) for s in ((row.get(lists_col) or '')).split(',') if s.strip()] if lists_col else [],
                'county': (row.get(county_col) or '').strip() if county_col else None,
                'notes': (row.get(notes_col) or '').strip() if notes_col else None,
            }
            if existing:
                changed = False
                # Master CSV is the authoritative source: overwrite any
                # field it has a non-empty value for, rather than only
                # filling blanks (which let bad data from earlier imports
                # survive re-imports indefinitely).
                for k,v in data.items():
                    if v and getattr(existing, k) != v:
                        setattr(existing, k, v)
                        changed = True
                if changed:
                    db.session.add(existing)
                    updated += 1
                else:
                    skipped += 1
            else:
                c = Contact(email=email,
                            first_name=data['first_name'] or None,
                            last_name=data['last_name'] or None,
                            organization=data['organization'] or None,
                            title=data['title'] or None,
                            phone_office=data['phone_office'] or None,
                            phone_cell=data['phone_cell'] or None,
                            tag=data['tag'] or None,
                            lists=data['lists'] or [],
                            county=data['county'] or None,
                            notes=data['notes'] or None,
                            data_complete=False)
                db.session.add(c)
                inserted += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print('DB error:', e)
        raise SystemExit(1)

    print(f'Inserted={inserted} updated={updated} skipped={skipped}')
