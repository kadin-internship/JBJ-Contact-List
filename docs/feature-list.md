# Contact Hub: Everything It Does

A complete list of the Contact Hub's features, grouped by what they're
for. For a running history of *when* each one was added and why, see
`CHANGELOG.md`.

## Contact & organization management

- **People view** — every contact (name, organization, title, phone,
  email, county, tags), full-text search, filterable.
- **Organizations view** — the outreach checklist grouped by category
  and organization, cross-referenced with every contact at that
  organization so coworkers sharing one show up together.
- Multi-select filtering by **Tag/Category** and **County** (handles
  contacts tagged with more than one county correctly).
- **Favorites** — a shared, team-wide star on any contact (not personal
  — everyone sees the same favorites), plus a toolbar toggle to filter
  down to just those.
- **Duplicate detection** — warns ("Add Anyway?") on a likely-duplicate
  name + organization match; blocks exact email duplicates outright
  (case-insensitive).
- Add and edit contacts and organizations directly in the app.
- Admin-only **spreadsheet sync** — bulk-import or update from an Excel
  workbook (separate People and Organizations tabs).

## Outreach tracking

- **Outreach Activity Log** — per-contact and per-organization history
  of who reached out, when, via what channel, and what was discussed.
- **"Needs Follow-up" filter** — Never Contacted, or no contact in
  30/60/90+ days.
- **Outreach recency on cards** — "last contact" and "last email" shown
  right on each card, no click-through required.

## AI-powered tools

- **Draft Email** — Claude drafts an outreach email scoped to whatever
  filter is currently active, and adjusts its tone automatically when
  the group is overdue for follow-up.
- **Flyer/Post Generator** — one click produces a finished social post
  or printed flyer: Claude writes the headline/body copy, OpenAI paints
  an on-brand background image, and the text is composited on top
  afterward so it's always crisp and correctly spelled.

## Reporting & accountability (admin-only)

- **Analytics dashboard** — totals, data-completeness %, a 12-week
  outreach trend, and breakdowns by employee, channel, county, and
  admin activity. Every bar is clickable to drill into the actual
  records behind that number.
- **Audit Log** — a plain-language history of every contact add/edit,
  spreadsheet sync, and user-account change, with who did it and
  exactly what changed.

## Meeting scheduler

Share a public booking link (`/book`) so contacts can schedule meetings directly without back-and-forth emails. Set your available days, hours, and slot length in Admin → Meeting Scheduler. Bookings trigger a SendGrid confirmation email automatically, and upcoming and past bookings are viewable in the admin dashboard.

## Landing pages

Create branded lead capture pages (Admin → Landing Pages) with a title, subtitle, body text, and custom colors. Each page gets a shareable public URL at `/p/your-slug`. When someone submits the form, they're automatically added as a contact (or matched to an existing one), an activity note is logged, and they can be dropped straight into a pipeline stage.

## Admin tools

- **Manage Users** — create employee logins; admin-initiated password
  reset (there's no self-service "forgot password," since no email
  service is configured).
- **Sync Spreadsheet** — the bulk-import tool described above.

## Exports

- CSV, a de-duplicated email list (for pasting into a BCC field), or a
  Word document — all scoped to whatever filter is currently active.

## Security & reliability

- Every page and API route requires an employee login; no public
  self-registration.
- Login is rate-limited (10 attempts/minute) against password guessing.
- Optional error monitoring (Sentry) — opt-in, and the app behaves
  exactly the same if it's left unconfigured.
- Automated nightly backups of the production database (GitHub Actions
  → iCloud Drive), in addition to the original local backup.
- A 34-test automated test suite covering login, contacts, filters,
  audit logging, and analytics, so changes can be checked before they
  reach production.

---

*Current as of July 2026. See `CHANGELOG.md` for the detailed,
dated history behind each item above.*
