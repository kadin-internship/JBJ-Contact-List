# JBJ Management Contact Hub

Internal contact-management tool for JBJ Management's public-relations
outreach. Flask + SQLite backend, single-page vanilla-JS frontend.

See `CHANGELOG.md` for a running history of what's changed and why.

## What it does

- **People view** — every individual contact (name, org, title, phone,
  email, county, tags), searchable and filterable.
- **Organizations view** — the outreach checklist grouped by category and
  organization, cross-referenced against People by organization name, so
  everyone who shares an organization shows up together.
- **Outreach activity log** — per-contact and per-organization history of
  who reached out, when, and what was discussed, so staff can check
  whether someone's already been contacted before reaching out again.
- **AI email drafting** — generates a draft outreach email (via Claude)
  scoped to whatever People/Organizations filter is currently active.
- **Export** — CSV, a de-duplicated email list (for BCC), or a Word doc,
  scoped to the current filter.
- **Login** — every page and API route requires an employee login (see
  "Creating employee accounts" below). No public self-registration.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in the project root (never committed — it's
gitignored) with:

```
SECRET_KEY=<random value, signs login sessions>
ANTHROPIC_API_KEY=<only needed for the Draft Email feature>
```

Generate a `SECRET_KEY` with `python3 -c "import secrets; print(secrets.token_hex(32))"`.

Run the server:

```bash
PORT=5050 .venv/bin/python app.py
```

## Creating employee accounts

There's no sign-up page on purpose. Create each employee's login from a
terminal so passwords never pass through chat, logs, or screen-share:

```bash
.venv/bin/python create_user.py
```

It asks for a username, display name (shown in the app and recorded on
every outreach-activity entry), and password.

## Data model

- `Contact` — one row per person (`app.py`/`models.py`). `email` is
  optional but unique when present.
- `OutreachOrg` — the per-organization outreach checklist (category, org
  name, last-touched date, notes). Cross-referenced with `Contact` by
  organization name, not a foreign key — the two sheets use different
  category names for the same kind of grouping (see the comment on
  `filtered_contacts_query` in `app.py`), so a People-view tag filter and
  an Organizations-view category filter are deliberately different lists.
- `Activity` — a logged outreach touchpoint, tied to a contact or an
  organization (or both).
- `User` — employee logins. Passwords are hashed (Werkzeug), never stored
  in plain text.

The database is SQLite (`contacts.db` in the project root). There's no
migration framework — `db.create_all()` creates missing tables on
startup, but it will **not** alter an existing table's columns. Schema
changes to existing tables (e.g. making a column nullable) need a manual
migration; see the "email made optional" entry in `CHANGELOG.md` for the
pattern used.

## Backup & recovery

**`contacts.db` is not in git** (it holds real contact PII and, as of the
login feature, password hashes — keeping it out of version control is
intentional, not an oversight).

A daily automated backup is set up via a macOS LaunchAgent
(`~/Library/LaunchAgents/com.jbjcontacts.backup.plist`, runs
`scripts/backup_db.sh` every day at 8pm while this Mac is logged in):

- Writes a timestamped copy to `backups/` (gitignored, local only) **and**
  to iCloud Drive (`~/Library/Mobile Documents/com~apple~CloudDocs/JBJContacts-Backups/`),
  so a copy exists off this machine.
- Prunes backups older than 60 days in both locations.
- Logs each run to `backups/backup.log`.

To check it's running: `launchctl list | grep jbjcontacts`. To run a
backup immediately: `launchctl start com.jbjcontacts.backup` or just
`bash scripts/backup_db.sh`.

**To restore**, stop the server, copy a backup over the live file, then
restart:

```bash
cp backups/contacts_<timestamp>.db contacts.db
```

This covers disk failure / accidental deletion on this machine, but it's
still a single Mac running a single LaunchAgent — if this machine is
retired or the user account changes, the schedule needs to be re-created
on whatever replaces it.

## Project layout

- `app.py` — all Flask routes/API endpoints.
- `models.py` — SQLAlchemy models (`Contact`, `OutreachOrg`, `Activity`, `User`).
- `templates/index.html` — the single-page app shell.
- `templates/login.html` — login page.
- `static/js/app.js` — all frontend logic (no framework).
- `static/css/style.css` — styling, including the JBJ brand palette (see
  the `:root` variables at the top).
- `create_user.py` — CLI for creating employee logins.
- `scripts/` — one-off data-import scripts used to load the original
  contact spreadsheets.
