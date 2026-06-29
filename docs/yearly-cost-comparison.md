# Contact Hub: Yearly Cost Options

A plain-language comparison of what it costs to run the Contact Hub
app for an office using it all day, every workday — to help decide
which option fits the budget. Numbers are estimates based on typical
usage, not an exact bill; real costs may land a bit above or below
these.

**Assumption used throughout:** one office, in use 8 hours a day, 5
days a week (the usage pattern most offices have).

## The three things being paid for

| | What it is, in plain terms |
|---|---|
| **Render** | The computer that runs the website itself — what people type into their browser to open the app. |
| **Neon** | The database — where every contact, organization, and login is actually stored. |
| **Anthropic AI** | The "Draft Email" button's writing assistant. Optional to use, but it's the one feature billed by how often it's actually used, not a flat monthly fee. |

---

## Part 1: Hosting + Database (the main cost)

This is the core decision — how much breathing room to pay for. The
**Free** row is included to show why it isn't a real option for daily
office use, not because it's a recommendation.

| Option | Render plan | Database plan | What you get | **Monthly** | **Yearly** |
|---|---|---|---|---|---|
| ❌ Free | Render **Free** | Neon **Free** | Falls asleep after 15 minutes of no one using it, and takes up to a minute to "wake up" on the next visit. Runs out of included database usage within days of real office use. **Not usable for a daily-use office app.** | **$0** | **$0** |
| 💰 Cheapest workable | Render **Standard** | Neon **Launch** | Always-on, no waking-up delay. Handles a full office's daily use, with less room to grow before needing to upgrade again. | **~$47** | **~$564** |
| ✅ Recommended | Render **Pro** | Neon **Launch** | Always-on, noticeably more breathing room — comfortably handles growth in staff or contacts for a while without revisiting this decision. | **~$127** | **~$1,524** |
| 🚀 Premium | Render **Pro Plus** | Neon **Scale** | Maximum headroom and speed. Worth it only if the team or contact list is expected to grow significantly, or speed under heavy use matters a lot. | **~$275** | **~$3,300** |

### What each plan name actually means

| Plan | What it physically gives you | Listed price |
|---|---|---|
| Render Free | Shared, basic computer; pauses when unused | $0/month |
| Render Standard | A dedicated, always-on computer — moderate power | $25/month flat |
| Render Pro | A dedicated, always-on computer — roughly 4x the power of Standard | $85/month flat |
| Render Pro Plus | A dedicated, always-on computer — roughly 8x the power of Standard | $175/month flat |
| Neon Free | Small shared database, pauses when unused, capped usage | $0/month |
| Neon Launch | Full-size database, no pausing issues, billed by actual use | usage-based (~$22-42/month here) |
| Neon Scale | Same as Launch but with more built-in room to grow and priority support | usage-based, ~2x Launch's rate (~$100/month here) |

### How to actually get each one

1. **Render** (the website hosting): log into the Render dashboard at
   render.com → open the **jbj-contact-hub** service → **Settings** →
   **Instance Type** → choose Standard, Pro, or Pro Plus → confirm. No
   code changes needed; takes effect on the next restart.
2. **Neon** (the database): log into the Neon dashboard at neon.com →
   open the project → **Billing** → upgrade from Free to **Launch** (or
   **Scale**) → set the autoscale maximum (how big it's allowed to grow
   automatically — higher for Recommended/Premium, lower for Cheapest
   Workable).

Both of these are billing decisions made directly in each company's own
dashboard — not something that requires touching the app's code.

---

## Part 2: The AI add-on features (separate, optional)

These costs are billed by how much they're actually used — they don't
change based on which hosting option above is chosen.

### Draft Email

There are two quality/price levels to choose from:

| AI Option | Exact model | Quality | Monthly (heavy daily use) | Yearly |
|---|---|---|---|---|
| 💰 Haiku (cheaper) | Claude Haiku 4.5 | Good — fine for routine drafts | ~$7–9 | ~$84–108 |
| ✅ Sonnet (current setting) | Claude Sonnet 4.6 | Better writing quality | ~$20–27 | ~$240–324 |

"Heavy use" here means someone clicks "Draft Email" about 100 times a
day across the whole office — realistically most offices will use it
far less, so actual cost is likely lower than shown.

**How to get/switch this:** unlike Render and Neon, this isn't a
dashboard setting — it's one line in the app's code (which AI model
name it asks for). The billing account (Anthropic) is already set up
and already in use; switching between Haiku and Sonnet just changes
which model that account is billed for per request. This is a quick
change for whoever maintains the app's code, not something done in a
billing dashboard.

### Flyer/Post Generator

One click produces a finished social post or flyer image: an AI text
step writes the headline/body, and a separate AI image step paints the
background. Both run automatically per click — there's no quality
choice to make here, it's already set to the cheapest workable option.

| Step | Exact model | Cost per flyer/post |
|---|---|---|
| Writes the headline/body text | Claude Sonnet 4.6 | ~$0.003 |
| Paints the background image | OpenAI gpt-image-1-mini (low quality) | ~$0.005 |
| **Combined, per flyer/post** | | **~$0.008** |

| Usage | Monthly | Yearly |
|---|---|---|
| Light (~5 a day) | ~$0.90 | ~$10–11 |
| Regular (~20 a day) | ~$3.50 | ~$40–45 |
| Heavy (~50 a day) | ~$9 | ~$100–110 |

This is small enough that it's not worth a "which option" decision —
even heavy daily use across the whole office stays under $10/month.

**How to get this:** unlike Draft Email, this needs a *second*,
separate billing account — at platform.openai.com — in addition to the
existing Anthropic one, since the image-generation step runs on
OpenAI's models rather than Claude's. One-time setup (create an
account, add a payment method, generate an API key); after that it's
billed automatically per use, same as Draft Email.

---

## Put together: full yearly cost examples

| Combination | Monthly | **Yearly** |
|---|---|---|
| Cheapest workable + Haiku AI | ~$54–56 | **~$650–670/year** |
| Recommended + Sonnet AI | ~$147–154 | **~$1,760–1,850/year** |
| Premium + Sonnet AI | ~$295–302 | **~$3,540–3,620/year** |

Adding the Flyer/Post Generator on top of any of these is a small,
separate add-on: roughly **+$10 to +$110/year**, depending on how often
the office uses it (see the table above).

## A few other costs, for completeness

- **Automatic nightly backups** of the database: $0 — covered by free
  allowances on the tools used.
- **A custom web address** (e.g. `contacts.jbjmanagement.com` instead
  of the current `jbj-contact-hub.onrender.com`): optional, roughly
  **$12/year** if wanted later — purely cosmetic, not required.

---

*Estimates current as of June 2026, based on each provider's published
pricing. Actual usage-based costs (database and AI) will vary with
real office activity — check the provider billing dashboards after the
first month or two to confirm these estimates are tracking accurately.*
