# Krishi Setu — Database

This folder holds the **raw working copies** of the Supabase/PostgreSQL schema scripts used while building the app.

## Files (in execution order for a fresh setup)

| File | Contents |
| --- | --- |
| `database.txt` | STEP 0 demo auth users + the main application schema (tables for profiles, inventory, lots, offers, orders, payments) |
| `database part 2.txt` | Core Supabase schema — extensions (pgcrypto), tables, and RLS foundations |
| `database part 3.txt` | Repair / migration script — removes the failing `auth.users → profiles` trigger that can surface as “Database error saving new user” |
| `database 4.txt` | Admin & Supervisor governance schema (registries, investigations, audit, alerts) |
| `database 5.txt` | `gov_mandi_feed_cache` table (single-row JSONB cache for the government mandi price feed) |

## Relationship to `backend/supabase/migrations/`

The **authoritative, versioned** schema lives in `backend/supabase/migrations/001–005`, distilled from these raw scripts and ordered so they apply cleanly with the Supabase CLI (`supabase db push`). Use those for deployment:

```
backend/supabase/migrations/001_schema.sql
backend/supabase/migrations/002_admin_governance.sql
backend/supabase/migrations/003_repair_profiles.sql
backend/supabase/migrations/004_gov_feed_cache.sql
backend/supabase/migrations/005_seed_demo_data.sql
```

These raw exports are kept for reference and manual SQL-Editor execution, not for active development.

## Notes

- Supabase **Auth** is the source of truth for users — no passwords are ever stored in application tables.
- Row Level Security (RLS) is used throughout; the edge function `refresh-gov-feed` writes to `gov_mandi_feed_cache` with a service role.
- Do not edit SQL here without updating the matching migration in `backend/supabase/migrations/`.