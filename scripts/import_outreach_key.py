#!/usr/bin/env python3
import sys
import csv
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import create_app
from db import db
from models import OutreachOrg

IN = Path('/Users/kadinlee-smith/Downloads/2026-06-12_MasterOutreachList - OutreachListKey.csv')
if not IN.exists():
    print('Missing', IN)
    raise SystemExit(1)


def parse_date(s):
    s = (s or '').strip()
    if not s:
        return None
    for fmt in ('%m/%d/%Y', '%m/%d/%y'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


app = create_app()
with app.app_context():
    inserted = 0
    updated = 0
    skipped = 0
    seen = {}  # (tag, org_lower) -> OutreachOrg instance, for in-file de-duplication

    with IN.open('r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            tag = (row.get('Column 1') or '').strip()
            org = (row.get('Organization Name') or '').strip()
            updated_val = parse_date(row.get('Updated'))
            notes = (row.get('Notes') or '').strip() or None

            if not tag or not org:
                skipped += 1
                continue

            key = (tag, org.lower())
            if key in seen:
                # merge: prefer the row with more information rather than
                # creating a duplicate entry for the same org
                existing = seen[key]
                if updated_val and not existing.updated:
                    existing.updated = updated_val
                if notes and not existing.notes:
                    existing.notes = notes
                continue

            existing = OutreachOrg.query.filter_by(tag=tag, organization=org).first()
            if existing:
                changed = False
                if updated_val and existing.updated != updated_val:
                    existing.updated = updated_val
                    changed = True
                if notes and existing.notes != notes:
                    existing.notes = notes
                    changed = True
                seen[key] = existing
                if changed:
                    db.session.add(existing)
                    updated += 1
                else:
                    skipped += 1
            else:
                rec = OutreachOrg(tag=tag, organization=org, updated=updated_val, notes=notes)
                db.session.add(rec)
                seen[key] = rec
                inserted += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print('DB error:', e)
        raise SystemExit(1)

    print(f'Inserted={inserted} updated={updated} skipped={skipped}')
