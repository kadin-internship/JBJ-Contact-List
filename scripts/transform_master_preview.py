#!/usr/bin/env python3
import pandas as pd
from pathlib import Path

IN = Path('/Users/kadinlee-smith/Downloads/2026-06-12_MasterOutreachList - MasterOutreachList.csv')
OUT = Path('imports/master_preview.csv')

if not IN.exists():
    print('Missing source:', IN)
    raise SystemExit(1)

df = pd.read_csv(IN, dtype=str, encoding='utf-8').fillna('')
# Map columns to cleaner expectations
df['Organization'] = df.get('Organization Name', '')
df['First Name'] = df.get('First Name','')
df['Last Name'] = df.get('Last Name','')
df['Email'] = df.get('Email','')
df['Title'] = df.get('Title','')
df['Phone Office'] = df.get('Phone Office','')
df['Phone Cell'] = df.get('Phone Cell','')
df['Lists'] = df.get('Lists','')
df['County'] = df.get('County','')
df['Active'] = df.get('Active','')
df['Notes'] = (df.get('Tag','').astype(str).str.strip() + ' ' + df.get('Added','').astype(str).str.strip()).str.strip()

cols=['Email','First Name','Last Name','Organization','Title','Phone Office','Phone Cell','Lists','County','Active','Notes']
for c in cols:
    if c not in df.columns:
        df[c] = ''
OUT.parent.mkdir(parents=True, exist_ok=True)
df[cols].to_csv(OUT, index=False)
print('Wrote', OUT, 'rows=', len(df))
