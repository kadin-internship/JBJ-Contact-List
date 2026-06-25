# Changelog

What changed, and why. Add an entry here whenever the app changes —
newest at the top. This isn't a substitute for `git log` (which has the
full diffs); it's the "what would a non-technical teammate need to know"
summary, especially for anything that affects data, security, or how
staff use the app day to day.

## 2026-06-24 — Switched production database to free external Postgres

Render's free plan (which is what's actually in use) doesn't include a
persistent disk, so the `render.yaml` disk-based SQLite setup from
earlier today would have silently lost contacts and user accounts on
every restart or redeploy. Removed the disk dependency: production now
points `DATABASE_URL` at an external free Postgres database (Neon or
Supabase — both have a free tier that doesn't expire). Local development
is unaffected (still plain SQLite by default). Required dropping a
SQLite-only column type (`Contact.lists` was using
`sqlalchemy.dialects.sqlite.JSON`, which doesn't work on Postgres — moved
to the generic, dialect-agnostic `db.JSON`). Added
`scripts/migrate_sqlite_to_postgres.py` to copy existing local data
(contacts, organizations, activities, user accounts) into the new
database, and `psycopg2-binary` to `requirements.txt`. Updated `render.yaml`
and the "Deploying" section of `README.md` to match.

## 2026-06-24 — Shell-free account creation for Render

Turned out Render's Shell tab (the documented way to run `create_user.py`
in production) requires a paid plan, which blocked creating the first
login after deploying. Added two ways around it that don't need Shell on
any plan: (1) the app auto-creates one admin account on startup from
`BOOTSTRAP_ADMIN_USERNAME`/`BOOTSTRAP_ADMIN_PASSWORD` env vars if the
users table is still empty (set these for free in Render's dashboard,
under Environment), and (2) a new admin-only **Manage Users** page
(`/admin/users`, linked from the header for admins) so that first account
can create everyone else's login from the browser afterward. Updated the
"Deploying" section of `README.md` to match.

## 2026-06-24 — Made the app deployment-ready (Render)

Until now the app only ran on one laptop via Flask's dev server, so no
one else could use it. Added a production WSGI entrypoint (`wsgi.py` +
gunicorn), a `render.yaml` Render Blueprint (web service + a **persistent
disk** so SQLite survives redeploys), and hardened session cookies for
production (`SESSION_COOKIE_SECURE` when running on Render). Did not
actually deploy or create any production accounts/secrets — that
requires the account holder's own Render sign-up, billing, and secrets,
documented step-by-step in the new "Deploying" section of `README.md`,
including how to move the existing database onto the persistent disk and
create employee logins on production.

## 2026-06-24 — Automated daily database backup

`contacts.db` was removed from git the same day (see below), which meant
it had zero backup coverage. Added `scripts/backup_db.sh`, scheduled
daily via a macOS LaunchAgent (`com.jbjcontacts.backup`), which copies a
timestamped snapshot to a local `backups/` folder and to iCloud Drive
(so a copy exists off this machine), pruning anything older than 60 days.
Verified end-to-end by triggering the LaunchAgent manually. See the
Backup & Recovery section in `README.md` for how to check it's running
or restore from a backup.

## 2026-06-24 — Repo cleanup: scrubbed contact data out of git history

`contacts.db` and the raw import staging files (`data/`, `imports/`) had
been tracked in git since the first commit — meaning every commit
contained the full contact database (names, emails, phone numbers) and,
after the login feature landed, password hashes. Rewrote git history
(`git filter-repo`) to remove these from every commit before the first
push to GitHub, and added them to `.gitignore` so they can't get
re-tracked. Local backups of the stripped files were kept outside the
repo as a safety net.

**Operational note:** this means the contact database now lives *only*
on this machine, with no automatic backup. See the Backup & Recovery
section in `README.md`.

## 2026-06-24 — Employee login

Added per-employee accounts (Flask-Login, hashed passwords). Every page
and API route requires login, checked centrally so new routes are
protected by default. No public sign-up — accounts are created via
`create_user.py` from a terminal. The outreach-activity log now records
who logged an entry from the session instead of a free-text name field,
so one person can't log activity under someone else's name.

## 2026-06-24 — Merged Contacts and Sections tabs into one People/Organizations view

The app used to have two separate tabs (Contacts and Sections) with their
own search bars, filters, and export menus — which was the root cause of
several bugs earlier in the day (filters not working, stray cards showing
up, "Add Contact" silently not refreshing). Replaced both with one screen
and a People/Organizations toggle sharing a single search bar, category
filter, county filter, export menu, and pagination bar.

Organization cards used to show only one "primary" contact even when an
org had several people at it — now every org card lists everyone there,
so coworkers who share an organization show up together.

Also applied the JBJ Management brand color palette (maroon/black
primary, rose/gray/charcoal secondary) across the whole app, replacing
the placeholder maroon theme, plus a more polished home/login screen
treatment (glass card, logo, accent line) as a step toward an eventual
dedicated login page.

## 2026-06-24 — Outreach activity tracking

Added a log of outreach touchpoints per contact and per organization
(who reached out, when, via what channel, what was discussed), with a
"Contacted N times" badge shown before staff reach out again — so two
people don't independently contact the same person without knowing it.

## 2026-06-24 — AI email drafting, county filtering, Sections card UI

- Added a Claude-powered "Draft Email" feature that generates an outreach
  email scoped to whatever filter is currently active.
- Added a county filter to the main Contacts toolbar (previously only
  available on the Sections tab).
- Reworked the Sections tab to show every organization as a card
  immediately (like Contacts does), instead of a category-count summary
  list, and fixed an N+1 query bug that made it feel slow with ~280
  organizations.
- Made `Contact.email` optional (previously required at the database
  level) — a real schema migration since SQLite can't just drop a
  `NOT NULL` constraint in place; the `contacts` table was rebuilt with
  all 14,000+ existing rows preserved.

## 2026-06-23 — Initial contact import

First commit: Flask + SQLite app with the original contact list imported
from spreadsheets (`scripts/import_*.py`).
