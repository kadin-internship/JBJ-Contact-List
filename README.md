# JBJ Management Contact Hub

Flask + SQLite backend for contact management. Handles large messy CSV/Excel uploads and performs cleaning, deduplication, and simple search.

Quick start

1. Create virtualenv and install:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
2. Run the server:
```bash
export FLASK_APP=app.py
python app.py
```
3. Upload via POST `/api/upload` with form field `file` (CSV or Excel).

Endpoints

- `GET /api/contacts?q=SEARCH&tag=FILTER&page=1&limit=25` — search and pagination
- `GET /api/contacts/:id` — contact by id
- `GET /api/stats` — global stats
- `GET /api/tags` — distinct tags
- `GET /api/categories` — tags with counts
- `POST /api/upload` — upload CSV/Excel file (multipart form field `file`)
- `GET /api/export` — download CSV export

Data cleaning rules

- Remove rows where Email empty or `#REF!`, Active=="Inactive", First+Last empty, Organization `#REF!`
- Trim whitespace, phone → digits only
- `Lists` column split into JSON array (`,` or `;` separators)
- Deduplicate by email; upsert existing records
- Flag `data_complete` when email & (first or last) & organization & (office or cell phone) present

Notes

- Database file: `contacts.db` in project root by default.
- Maroon branding: simple index page with maroon header.
# JBJ-Contact-List
