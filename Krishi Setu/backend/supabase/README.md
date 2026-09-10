# KrishiSetu — Supabase Deployment

The five original schema fragments (`database*.txt`) are consolidated here as
standard numbered migrations. **Content is identical to the project's own SQL**
— nothing was rewritten. The one genuinely missing server-side piece (the
government price-feed refresh) is provided as a template below.

## 1. Run the migrations (Supabase Dashboard → SQL Editor, in order)

| File | Purpose |
|---|---|
| `migrations/001_schema.sql` | Core schema: profiles, user_app_state, crop_lots, offers, transactions, saved_schemes, support_tickets, market_price_snapshots, triggers + RLS |
| `migrations/002_admin_governance.sql` | Supervisor/Admin governance: supervisor_roles, risk rules, alerts, investigations, audit log |
| `migrations/003_repair_profiles.sql` | Repair pass: removes the old auth trigger that can block sign-up; makes `profiles` idempotent |
| `migrations/004_gov_feed_cache.sql` | `gov_mandi_feed_cache` table + public read policy (this is what the app's Mandi Prices page reads) |
| `migrations/005_seed_demo_data.sql` | Demo auth users, profiles, lots, offers, transactions + trust-score recalculation |

Recommended order: **001 → 002 → 003 → 004 → 005**. Run `005` only if you want
the demo accounts (`ramesh.patil@krishisetu.demo`, etc.).

> Note: `001` installs an `on_auth_user_created` trigger that creates profiles;
> `003` deliberately removes it (sign-ups can fail when that trigger errors).
> The app creates/repairs the profile itself after authentication, so the
> trigger is not required.

## 2. Missing piece — populate `gov_mandi_feed_cache` (required for live gov prices)

The frontend only ever **reads** `gov_mandi_feed_cache` (`id = true`). Nothing
currently fills it, so until this is deployed the Mandi Prices page shows the
labelled fallback rows with a "Shared cache unavailable" pill.

Deploy the provided Edge Function:

1. Create a free **data.gov.in API key** → https://data.gov.in/developers/mini-api
2. Add it as a Supabase secret: Dashboard → Edge Functions → Secrets →
   `GOV_API_KEY = <your key>`
3. Deploy (Supabase CLI, from `supabase/`):
   `supabase functions deploy refresh-gov-feed --no-verify-jwt`
4. Test once: `curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/refresh-gov-feed`
5. Schedule it every hour (Dashboard → Database → Extensions → enable **pg_cron**, then run):

```sql
select cron.schedule(
  'refresh-gov-feed-hourly',
  '0 * * * *',
  $$ select net.http_post(
       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/refresh-gov-feed',
       headers := jsonb_build_object('Content-Type','application/json'),
       body := '{}'::jsonb
     ) $$
);
```

> ⚠️ Template status: this Edge Function follows the official data.gov.in /
> Supabase pattern and maps the API fields to exactly what the frontend reads,
> but it was **not executed against a live project in this environment**.
> Verify the field mapping on the first successful run and adjust the
> `limit`/filters if you want a narrower commodity set.

## 3. Still requires external credentials / manual steps

- **Live government feed**: the `GOV_API_KEY` (above) and deployment access to
  your Supabase project.
- **WhatsApp / SMS broadcast**: the app currently toggles a local preference
  flag only. A real gateway (e.g., WhatsApp Business Cloud API, MSG91, Twilio)
  needs its own account credentials and a small webhook/bridge — no gateway is
  configured in this project, so this remains a local mock by design.
- **Domain / SSL**: if KrishiSetu is hosted publicly for SIH, set up the domain.
  The public homepage is already indexable; the single-file dashboard app keeps
  its intentional `<meta name="robots" content="noindex, nofollow">` because it
  is the authenticated platform. `sitemap.xml`/`robots.txt` are optional extras.
- **Email confirmation**: if Supabase email confirmation is enabled, test
  accounts must be confirmed before first sign-in.
