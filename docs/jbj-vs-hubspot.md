# JBJ Contact Hub vs. HubSpot

A one-page comparison for explaining why JBJ built its own tool instead
of buying HubSpot (or a similar commercial CRM) — and why that's a
deliberate choice, not a stopgap.

## The short version

HubSpot is built to be everything for everyone — sales pipelines, ad
campaign tracking, landing pages, lead scoring, email marketing
automation. JBJ Management doesn't run sales pipelines or ad campaigns;
it runs community and government-relations outreach. **The Contact Hub
is purpose-built for that one job**, which is exactly why it can do it
well for a fraction of HubSpot's cost — there's no large, unused
platform to pay for underneath the features that actually get used.

## Cost: what each one actually charges

| | JBJ Contact Hub | HubSpot Marketing Hub |
|---|---|---|
| Entry price | $0 (Free tier — not usable day-to-day, see `yearly-cost-comparison.md`) | $0 (Free — capped at 2,000 contacts) |
| Cheapest *workable* tier | **~$47–56/month** (Standard hosting + database + Haiku AI) | **Starter, $7/seat/month** — but capped at 1,000 marketing contacts, far below JBJ's list size |
| Cheapest tier with real automation/reporting | *(already included at every paid tier)* | **Professional, $800/month** (3 seats, 2,000 contacts) **+ a $3,000 one-time onboarding fee** |
| Tier that could actually hold JBJ's ~14,000 contacts | **~$127–154/month** (Recommended hosting + database + Sonnet AI) | **Enterprise, $3,600/month** (5 seats, only 10,000 of the 14,000 contacts included — the rest is custom overage pricing) **+ a $7,000 one-time onboarding fee** |
| Yearly, realistic comparison | **~$650–1,850/year** depending on tier (see `yearly-cost-comparison.md`) | **~$43,200/year minimum** at Enterprise, before onboarding fees and contact overage |

*HubSpot figures are from its published pricing page; confirm current numbers directly with HubSpot before quoting them externally, since SaaS pricing changes without notice.*

## What the Contact Hub does that HubSpot doesn't (because HubSpot wasn't built for this job)

- **County-aware filtering** — Texas counties, multi-select, matching how JBJ actually segments its outreach territory. HubSpot has no concept of this; it would have to be rebuilt as a generic custom property.
- **An Outreach Checklist by organization** (the Organizations view) — cross-referenced against every person at that org, so coworkers sharing an organization show up together. HubSpot's "Companies" object is closer, but isn't built around a checklist of *should we have contacted this org* with a category breakdown.
- **An audit log of every contact edit, addition, and spreadsheet sync** — in plain language, including exactly which fields changed. HubSpot's audit/activity logging is an Enterprise-tier feature.
- **One-click AI flyer/post generation**, tuned to JBJ's brand colors and fonts — not a HubSpot feature at any tier.
- **Total data ownership** — the database is JBJ's own Postgres instance, not locked inside a vendor's platform with export limits.

## What HubSpot has that the Contact Hub doesn't (and whether that matters)

- **Email sequence / drip automation** — deliberately not built. Automated mass outreach reads as spam for community and government contacts, where a personal touch is the actual asset. This is a case where HubSpot's core strength is the wrong tool for JBJ's relationships.
- **Landing pages, ad campaign tracking, lead scoring** — sales/marketing-funnel features with no equivalent use case at JBJ. Not worth building.
- **A large third-party integration marketplace** (Salesforce, Slack, hundreds of others) — genuinely a gap if JBJ ever needs to connect to other software. Worth revisiting only if a specific integration becomes a real need.
- **Auto-logged emails** (Gmail/Outlook sync logs sent emails automatically) — a real, useful gap. This is the next reasonable feature to close (see "Auto-logging outreach from sent emails" on the feature roadmap).

## Bottom line

At JBJ's contact-list size, matching HubSpot tier-for-tier would cost
roughly **20–65x more per year** than the Contact Hub's comparable
tiers — for a platform mostly built around sales and marketing
workflows JBJ doesn't run. The honest pitch isn't "as good as HubSpot
at everything"; it's **as good as HubSpot at the outreach workflows
JBJ actually has, at a small fraction of the price, with a couple of
specific, closeable gaps** (auto-logged emails, third-party
integrations) rather than a long list of missing features.

---

*Estimates current as of June 2026. HubSpot pricing sourced from its
public pricing page; verify current figures directly before
presenting them as final numbers, since SaaS pricing changes without
notice.*
