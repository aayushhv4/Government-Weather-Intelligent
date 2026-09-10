# Krishi Setu — API & Data Contract

Krishi Setu has **no traditional REST backend**. Its data contract is:

1. **Supabase (PostgreSQL)** for persistent state — accessed from the frontend via the Supabase JS client.
2. **One Supabase Edge Function** (`refresh-gov-feed`) that populates the government mandi price cache server-side.
3. **A client-side `state` object** that mirrors the same entities in demo mode so the product works fully offline.

## Supabase tables (from `backend/supabase/migrations/`)

| Migration | Tables / purpose |
| --- | --- |
| `001_schema.sql` | Core: `profiles`, `crops`, `inventory_batches`, `lots`, `offers`, `orders`, `payments` |
| `002_admin_governance.sql` | Admin: users registry, sellers, buyers, listings oversight, investigations, audit log, alerts |
| `003_repair_profiles.sql` | Profile integrity / constraints fixes |
| `004_gov_feed_cache.sql` | `gov_mandi_feed_cache` — the read source for the market page |
| `005_seed_demo_data.sql` | Seed rows so the app has data on first connect |

Apply in numeric order. The raw schema exports these were distilled from live in `database/schema/`.

## Edge function: `refresh-gov-feed`

- **Purpose:** fetch daily mandi price records from the official AGMARKNET API (data.gov.in) and upsert them into `gov_mandi_feed_cache`.
- **Trigger:** scheduled (cron) — see `backend/supabase/README.md` for the schedule snippet.
- **Secret:** `GOV_API_KEY` (free data.gov.in mini-API key).
- **Deploy:** `supabase functions deploy refresh-gov-feed --no-verify-jwt`
- **Field mapping** in the function mirrors exactly what the frontend reads (`market`, `crop`, `variety`, `min_price`, `max_price`, `modal_price`, `arrival_date`, `state`, `district`).

## Frontend consumption points

The frontend reads only two backend surfaces:

- **Gov feed:** `market` page → `renderGovtPriceFeed()` → reads `gov_mandi_feed_cache` → falls back to bundled offline rows when offline or in demo mode.
- **Auth:** `performAuth` → Supabase auth + `profiles` fetch → falls back to demo personas.

Everything else (inventory, lots, offers, orders, admin registries) currently runs on the client-side `state` object with clearly marked swap points where Supabase CRUD would plug in.

## Environment

| Variable | Where used |
| --- | --- |
| `SUPABASE_URL` | Frontend client bootstrap (inline in HTML today) |
| `SUPABASE_ANON_KEY` | Frontend client bootstrap (inline in HTML today; `DEMO_MODE` activates when absent/invalid) |
| `GOV_API_KEY` | Supabase secret for `refresh-gov-feed` (never in the frontend) |

## Notes

- No secrets are exposed client-side beyond the standard Supabase **anon (publishable)** key, which is designed for frontend use.
- There is intentionally **no fake external API integration**: retail channels deep-link to the platforms' official partner pages, and the logistics GPS map is a labelled mock until a map provider key is added.