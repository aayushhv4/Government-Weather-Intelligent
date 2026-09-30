-- ===========================================================================
-- 001_weather_intelligence.sql
-- Panchayat Weather Intelligence (SIH26074)
-- Localized Agro-Meteorological Decision Support Platform
--
-- Adds the five tables named in the PRD:
--   panchayats · weather_inputs · downscaled_forecasts · validation_runs · advisories
--
-- Design decisions (PRD S7, S9):
--   * Geometry is stored as GeoJSON inside JSONB — NO PostGIS dependency.
--   * Every forecast-bearing row carries `source_type`, restricted by CHECK to
--     the three PRD provenance values: official | historical_reference |
--     simulated_demo. A fallback can only ever downgrade within this set.
--   * `validation_runs` stores the per-baseline metrics, the skill score, the
--     git SHA and the model version, so a metric can never exist without a
--     reproducible run behind it.
--   * Nothing here alters or renames existing tables.
--
-- Idempotent: safe to re-run with `supabase db push` or the SQL editor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. panchayats — administrative layer
-- ---------------------------------------------------------------------------
create table if not exists public.panchayats (
  panchayat_id    text primary key,                 -- e.g. LGD-271033
  lgd_code        text not null,
  name            text not null,
  block_id        text not null,
  block_name      text,
  district        text,
  state           text,
  area_km2        double precision not null check (area_km2 > 0),
  area_weight     double precision check (area_weight >= 0 and area_weight <= 1),
  elevation_m     double precision,
  slope_deg       double precision,
  aspect_deg      double precision,
  land_cover      text,
  ndvi            double precision,
  centroid_lat    double precision,
  centroid_lon    double precision,
  geometry        jsonb not null,                   -- GeoJSON Polygon
  boundary_source text not null,                    -- disclosed source string
  boundary_source_type text not null default 'simulated_demo'
    check (boundary_source_type in ('official','historical_reference','simulated_demo')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists panchayats_block_idx on public.panchayats (block_id);

-- ---------------------------------------------------------------------------
-- 2. weather_inputs — the coarse block forecast that was submitted
-- ---------------------------------------------------------------------------
create table if not exists public.weather_inputs (
  id           bigint generated always as identity primary key,
  block_id     text not null,
  source_type  text not null default 'simulated_demo'
    check (source_type in ('official','historical_reference','simulated_demo')),
  day_count    integer not null default 0,
  forecast     jsonb not null default '[]'::jsonb,   -- [{date,t_max_c,t_min_c,rainfall_mm}]
  received_at  timestamptz not null default now()
);

create index if not exists weather_inputs_block_idx
  on public.weather_inputs (block_id, received_at desc);

-- ---------------------------------------------------------------------------
-- 3. downscaled_forecasts — one row per Panchayat per valid date
-- ---------------------------------------------------------------------------
create table if not exists public.downscaled_forecasts (
  id             bigint generated always as identity primary key,
  block_id       text not null,
  panchayat_id   text not null references public.panchayats (panchayat_id) on delete cascade,
  valid_date     date not null,
  lead_days      integer not null default 1,
  t_max_c        double precision not null,
  range_low_c    double precision,                  -- indicative, uncalibrated
  range_high_c   double precision,
  rainfall_mm    double precision,
  confidence     text not null check (confidence in ('high','medium','low')),
  top_features   jsonb,                             -- [{feature, contribution}]
  source_type    text not null
    check (source_type in ('official','historical_reference','simulated_demo')),
  model_version  text not null,
  boundary_source text,
  properties     jsonb not null default '{}'::jsonb,
  geometry       jsonb,
  generated_at   timestamptz not null default now(),
  unique (block_id, panchayat_id, valid_date, model_version)
);

create index if not exists downscaled_forecasts_lookup_idx
  on public.downscaled_forecasts (block_id, valid_date);

-- ---------------------------------------------------------------------------
-- 4. validation_runs — one row per scripted validation run
-- ---------------------------------------------------------------------------
create table if not exists public.validation_runs (
  id                    bigint generated always as identity primary key,
  validation_type       text not null,               -- reanalysis_hindcast | station_holdout
  train_period          text,
  test_period           text,
  split                 text,                        -- blocked temporal (no random splits)
  model_version         text not null,
  git_sha               text,
  seed                  integer not null default 42,
  sample_counts         jsonb,
  metrics               jsonb,                       -- {B1_block_copy:{mae,...}, ...}
  skill_vs_block_copy   double precision,
  lopo                  jsonb,
  consistency_check     jsonb,
  track_b               jsonb,
  reference_dataset     text,
  disclaimer            text,
  created_at            timestamptz not null default now()
);

create index if not exists validation_runs_model_idx
  on public.validation_runs (model_version, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. advisories — rules-layer output handed to Market / Logistics
-- ---------------------------------------------------------------------------
create table if not exists public.advisories (
  id            bigint generated always as identity primary key,
  block_id      text not null,
  panchayat_id  text not null,
  crop          text not null,
  valid_date    date,
  risk_level    text not null default 'none'
    check (risk_level in ('high','medium','low','none')),
  rule_version  text,
  message       text,
  action        text,
  handoff       jsonb,                               -- {market:{page}, logistics:{page}, ...}
  source_type   text not null
    check (source_type in ('official','historical_reference','simulated_demo')),
  model_version text,
  created_at    timestamptz not null default now()
);

create index if not exists advisories_lookup_idx
  on public.advisories (block_id, panchayat_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Forecast and advisory data is read-only to the app (anon/authenticated).
-- Writes are performed only by the weather service using the service-role key,
-- which bypasses RLS by design. The service-role key is never shipped to the
-- browser (PRD S18).
-- ---------------------------------------------------------------------------
alter table public.panchayats            enable row level security;
alter table public.weather_inputs        enable row level security;
alter table public.downscaled_forecasts  enable row level security;
alter table public.validation_runs       enable row level security;
alter table public.advisories            enable row level security;

drop policy if exists "Public can read panchayats" on public.panchayats;
create policy "Public can read panchayats"
  on public.panchayats for select to anon, authenticated using (true);

drop policy if exists "Public can read validation runs" on public.validation_runs;
create policy "Public can read validation runs"
  on public.validation_runs for select to anon, authenticated using (true);

drop policy if exists "Public can read downscaled forecasts" on public.downscaled_forecasts;
create policy "Public can read downscaled forecasts"
  on public.downscaled_forecasts for select to anon, authenticated using (true);

drop policy if exists "Public can read advisories" on public.advisories;
create policy "Public can read advisories"
  on public.advisories for select to anon, authenticated using (true);

-- weather_inputs holds submitted coarse forecasts only; no public read policy
-- is created, so it stays service-role-only unless an operator adds one.

-- ---------------------------------------------------------------------------
-- No seed rows are inserted. Licence and provenance strings are documented in
-- `docs/WEATHER_INTELLIGENCE.md`, and this migration deliberately inserts no
-- forecast values or metrics: those must come from a scripted run, never from
-- SQL literals.
-- ---------------------------------------------------------------------------
