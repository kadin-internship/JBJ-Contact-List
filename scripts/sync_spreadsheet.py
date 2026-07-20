"""Import a spreadsheet directly to the database from your local machine.

Processing happens here, only SQL writes go to the server -- no HTTP
timeout, no Render memory limit.

Usage:
    # Local database
    .venv/bin/python scripts/sync_spreadsheet.py path/to/file.xlsx

    # Production database
    DATABASE_URL="<render-connection-string>" .venv/bin/python scripts/sync_spreadsheet.py path/to/file.xlsx

    # Also mark contacts missing from the file as Inactive
    DATABASE_URL="..." .venv/bin/python scripts/sync_spreadsheet.py path/to/file.xlsx --archive-missing
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
from app import create_app, _import_contacts, _import_orgs
from utils import looks_like_contacts_sheet, looks_like_orgs_sheet
from db import db


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith('-'):
        print(__doc__)
        sys.exit(1)

    filepath = args[0]
    archive_missing = '--archive-missing' in args

    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        sys.exit(1)

    print(f"Reading {filepath} ...")
    ext = os.path.splitext(filepath)[1].lower()
    try:
        if ext in ('.xls', '.xlsx', '.xlsm'):
            sheets = pd.read_excel(filepath, dtype=str, engine='openpyxl', sheet_name=None)
        else:
            df = pd.read_csv(filepath, dtype=str)
            sheets = {'Sheet1': df}
    except Exception as exc:
        print(f"Could not read file: {exc}")
        sys.exit(1)

    total_rows = sum(len(df) for df in sheets.values() if df is not None)
    print(f"Loaded {total_rows} rows across {len(sheets)} sheet(s).")
    if archive_missing:
        print("archive-missing mode ON -- contacts absent from the file will be marked Inactive.")
    print()

    app = create_app()
    with app.app_context():
        contacts_result = {'inserted': 0, 'updated': 0, 'skipped': 0}
        orgs_result     = {'inserted': 0, 'updated': 0, 'skipped': 0}

        for sheet_name, df in sheets.items():
            if df is None or df.empty:
                continue
            print(f"  Processing sheet '{sheet_name}' ({len(df)} rows) ...")
            if looks_like_contacts_sheet(df):
                _import_contacts(df, contacts_result, archive_missing=archive_missing)
            elif looks_like_orgs_sheet(df):
                _import_orgs(df, orgs_result)
            else:
                print(f"  Skipping '{sheet_name}' -- not recognized as contacts or organizations.")

        print("\nCommitting to database ...")
        db.session.commit()
        print("Done!\n")

        c = contacts_result
        o = orgs_result
        print(f"Contacts:      {c['inserted']} new, {c['updated']} updated, {c['skipped']} unchanged", end='')
        if c.get('archived'):
            print(f", {c['archived']} marked Inactive", end='')
        print()
        print(f"Organizations: {o['inserted']} new, {o['updated']} updated, {o['skipped']} unchanged")


if __name__ == '__main__':
    main()
