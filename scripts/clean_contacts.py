#!/usr/bin/env python3
import re
import csv
from pathlib import Path

IN = Path('data/pasted_contacts.txt')
OUT_DIR = Path('imports')
OUT_DIR.mkdir(exist_ok=True)
OUT = OUT_DIR / 'cleaned_contacts.csv'

email_re = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')

with IN.open('r', encoding='utf-8') as f:
    lines = [l.rstrip('\n') for l in f if l.strip()]

if not lines:
    print('No data found in', IN)
    raise SystemExit(1)

# header detection
header = lines[0]
# split header by tabs or >=2 spaces
hdr_cols = re.split(r'\t+|\s{2,}', header)
# normalize header names
hdr_cols = [h.strip() for h in hdr_cols if h.strip()]
expected_cols = len(hdr_cols)
print('Detected header columns:', expected_cols, hdr_cols)

rows = []
for raw in lines[1:]:
    # try tab split first
    parts = re.split(r'\t+', raw)
    if len(parts) < expected_cols:
        parts = re.split(r'\s{2,}', raw)
    parts = [p.strip() for p in parts if p.strip()]
    # if still short, fallback to splitting by single space (risky)
    if len(parts) < expected_cols:
        parts = raw.split(' ')
        parts = [p.strip() for p in parts if p.strip()]

    # If parts longer than header, try to compress extras into the "Lists" field (near end)
    if len(parts) > expected_cols:
        # put extras into the column before last (Lists) or last if not present
        if 'Lists' in hdr_cols:
            lists_idx = hdr_cols.index('Lists')
            # merge all parts from lists_idx up to len(parts)-(expected_cols-lists_idx-1)
            suffix_count = expected_cols - lists_idx - 1
            if suffix_count < 0:
                suffix_count = 0
            merge_end = len(parts) - suffix_count
            merged = ' '.join(parts[lists_idx:merge_end])
            new_parts = parts[:lists_idx] + [merged] + parts[merge_end:]
            parts = new_parts
        else:
            # collapse extras into last column
            parts = parts[:expected_cols-1] + [' '.join(parts[expected_cols-1:])]

    # ensure length matches header by padding
    if len(parts) < expected_cols:
        parts += [''] * (expected_cols - len(parts))

    record = dict(zip(hdr_cols, parts))

    # find email anywhere in the raw line if not in expected column
    email = record.get('Email', '').strip()
    if not email or email.upper() in ('#REF!', '#N/A'):
        m = email_re.search(raw)
        if m:
            email = m.group(0)
            record['Email'] = email

    # normalize email
    if email:
        record['Email'] = email.strip().lower()

    # normalize phones (keep only digits)
    for ph in ('Phone', 'Phone Office', 'Phone Cell', 'Phone Office Phone', 'Phone Office Phone Cell'):
        if ph in record:
            record[ph] = re.sub(r'[^0-9+]', '', record[ph])

    rows.append(record)

# Deduplicate by email, keep first occurrence; drop rows missing email or with placeholder
seen = {}
cleaned = []
skipped = 0
for r in rows:
    email = r.get('Email', '').strip().lower()
    if not email or email in ('', '#ref!', '#n/a'):
        skipped += 1
        continue
    if email in seen:
        continue
    seen[email] = True
    cleaned.append(r)

# Prepare output columns: prefer header order, else common set
# Simpler output: produce deduped two-column CSV (email, raw)
OUT = OUT_DIR / 'cleaned_contacts.csv'
with OUT.open('w', newline='', encoding='utf-8') as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(['email', 'raw'])
    for r in cleaned:
        # write the extracted email and the original raw line as 'raw'
        writer.writerow([r.get('Email',''), r.get(''.join(hdr_cols[:3]), '') or ' '.join([r.get(c,'') for c in hdr_cols])])

print(f'Wrote {len(cleaned)} cleaned rows to {OUT}  (skipped {skipped} rows)')
