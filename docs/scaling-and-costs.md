# Scaling & cost plan: supporting 50+ employees

(For a non-technical, presentation-ready version of the cost numbers,
see `docs/yearly-cost-comparison.md`.)

Goal: the app should stay responsive with 50+ employees using it at once,
with comfortable headroom for the contact list and traffic to keep
growing -- not the bare minimum that just barely avoids crashing.

This is a planning document, not a bill -- the usage-based numbers
(database compute, AI drafting) are estimates based on typical usage
patterns, not a quote. Check the actual provider dashboards after the
first month and adjust.

## What was actually wrong (fixed for free, already done)

Before any plan upgrade, the app had one serious bug: **gunicorn was
running with its default single worker**, which handles exactly one
request at a time. Every other request queues up behind it. With 50
people using the app, that alone would make it feel like it's hanging or
crashing, regardless of how much is spent on hosting.

Fixed in `render.yaml` (no cost, already committed):

```
gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 5 --threads 4 --worker-class gthread --timeout 60
```

5 worker processes x 4 threads each = 20 requests handled at once.
Threads (not just more workers) matter here because most of this app's
work is waiting on the database or the Anthropic API, not crunching
numbers -- threads handle that "waiting" far more cheaply than full
worker processes. 20 concurrent slots comfortably covers 50 employees
in practice, since they're not all clicking at the exact same instant;
it's bursty, not perfectly simultaneous.

Database connection limits were also checked and are **not** a
bottleneck at any tier -- even Neon's smallest compute size allows 100+
direct connections, far more than 5 workers' worth of connection pools
will ever use.

## What still needs a paid plan, and why

| Problem on the free tier | Effect with 50 users |
|---|---|
| Render free web service: 512 MB RAM, 0.1 CPU | Not enough headroom for 5 worker processes; gets slow/OOM under real load |
| Free services **spin down after 15 minutes idle** | First request after any quiet period (lunch, evenings) hangs ~30-60 seconds while it wakes back up |
| Neon free database: 100 compute-hours/month, 0.5 GB storage, scales to zero when idle | A full business day of 50 people querying the database burns through the monthly compute allowance in days, and 0.5 GB fills up fast once the contact list keeps growing |

## Recommended tiers (comfortable headroom)

| Service | Plan | Specs | Cost |
|---|---|---|---|
| Render (web hosting) | **Pro** | 4 GB RAM, 2 CPU, no spin-down | **$85/month** flat |
| Neon (Postgres database) | **Launch** | No compute-hour or storage cap, autoscale up to ~4 CU | **~$35-50/month**, usage-based |
| GitHub Actions (nightly backup) | Free tier | ~10 min/month used of 2,000 free | **$0** |
| iCloud Drive (local backup copy) | Existing plan | Backups are a few MB/day | **$0** (uses storage you already have) |
| Anthropic API (Draft Email feature) | Pay-per-use | ~$0.01 per drafted email | **~$5-15/month** at moderate use |
| **Total** | | | **~$125-150/month** |

A cheaper "bare minimum" alternative, if budget is the deciding factor:
Render **Standard** ($25/month, 2 GB RAM, 1 CPU) instead of Pro, and Neon
**Launch** with autoscale capped lower (1-2 CU). That would likely run
**~$65-85/month** total, and should still hold up for 50 users -- it
just has less room before the next conversation about upgrading again.

### Why Pro over Standard for headroom

Standard (2 GB/1 CPU) would very likely handle 50 concurrent users fine
for typical browsing/searching/editing. Pro (4 GB/2 CPU) is recommended
specifically for headroom: it gives room to bump gunicorn's worker count
further as the team or contact list grows, and avoids needing to
re-visit this decision soon. If budget is tight, Standard is a
reasonable place to start and can be upgraded later with zero code
changes -- it's a dashboard setting, not a deploy.

### Why Neon Launch, and the estimate range

Neon's pricing is usage-based: $0.106 per compute-hour and $0.35 per GB
of storage per month, with no minimum spend. The $35-50/month estimate
assumes the database is actively serving queries for roughly a full
business day, most days of the month, with the compute autoscaling up
during busier moments -- a reasonable guess for 50 active employees, but
real usage could land outside that range in either direction. Storage
cost is negligible by comparison (a few dollars even at several GB).

## Anthropic API cost (Draft Email)

The "Draft Email" feature calls Claude. There are two reasonable model
choices for this task -- drafting a templated outreach email from given
context isn't a heavy reasoning task, so the cheaper model is a real
option, not just a downgrade. Currently using Sonnet 4.6; Haiku 4.5 is
the cheaper alternative. Open discussion point for the team:

| Model | Price (input/output per million tokens) | Cost per draft* | 100 drafts/day |
|---|---|---|---|
| **Sonnet 4.6** (current) | $3 / $15 | ~$0.009 | ~$20-27/month |
| **Haiku 4.5** | $1 / $5 | ~$0.003 | ~$7-9/month |

\* Based on a typical drafted email (~800 input tokens of context, ~450
output tokens of drafted text).

```
Sonnet: 100/day x $0.009 = ~$0.90/day -> ~$27/mo (30 days) or ~$20/mo (22 business days)
Haiku:  100/day x $0.003 = ~$0.30/day -> ~$9/mo  (30 days) or ~$7/mo  (22 business days)
```

Even the more expensive option (Sonnet) isn't a number that meaningfully
changes the overall budget -- this is a discussion about whether the
extra polish is worth ~$15-20/month at heavy use, not about whether the
feature is affordable. It's also the one feature here with no usage
cap, so it's worth keeping an eye on the Anthropic billing dashboard if
adoption is much heavier than expected. If cost certainty matters more
than convenience, a simple per-user daily cap could be added later; not
done here since current usage doesn't justify the added complexity.

## Anthropic + OpenAI API cost (Flyer/Post Generator)

The "Create Flyer/Post" feature makes two API calls per click: Claude
drafts the headline/body text, then OpenAI's `gpt-image-1-mini` (at
`quality="low"`, the cheapest tier) paints a text-free background image
that the text gets composited onto. Both are already the cheapest
reasonable model/quality choice for this task -- there's no
Haiku-vs-Sonnet-style tradeoff to make here.

| Step | Model | Cost per flyer/post |
|---|---|---|
| Headline/body text | Claude Sonnet 4.6 | ~$0.003 |
| Background image | OpenAI gpt-image-1-mini, low quality | ~$0.005 |
| **Combined** | | **~$0.008** |

```
20 flyers/day x ~22 business days/month x $0.008 = ~$3.50/month (~$40-45/year)
50 flyers/day x ~22 business days/month x $0.008 = ~$9/month    (~$100-110/year)
```

Negligible next to the hosting/database cost either way. The one new
operational requirement: this needs a second, separate billing account
at platform.openai.com (its own API key, `OPENAI_API_KEY`) in addition
to the existing Anthropic account, since the image step runs on OpenAI
rather than Claude.

## What you need to actually do

Everything above the cost table is **already committed to this repo**
(the gunicorn fix). The plan upgrades themselves are billing decisions
and have to happen in each provider's own dashboard, not from here:

1. **Render**: Dashboard -> jbj-contact-hub -> Settings -> Instance Type
   -> choose Standard or Pro.
2. **Neon**: Dashboard -> Billing -> upgrade from Free to Launch, and set
   the autoscale max (2 CU for the cheaper path, 4 CU for more headroom).

Neither of these requires touching `render.yaml`'s `plan: free` line or
any code -- changing that file's plan field could trigger a billing
change automatically on the next deploy, so it's left as-is
intentionally; do the upgrade in each dashboard directly.
