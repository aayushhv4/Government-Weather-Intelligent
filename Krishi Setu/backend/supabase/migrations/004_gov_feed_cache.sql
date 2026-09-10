create table if not exists public.gov_mandi_feed_cache (
  id boolean primary key default true check (id),
  records jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  source text not null default 'data.gov.in AGMARKNET',
  updated_at timestamptz not null default now()
);

alter table public.gov_mandi_feed_cache enable row level security;

drop policy if exists "Public can read mandi feed cache"
on public.gov_mandi_feed_cache;

create policy "Public can read mandi feed cache"
  on public.gov_mandi_feed_cache
  for select
  to anon, authenticated
  using (true);

insert into public.gov_mandi_feed_cache (
  id, records, fetched_at, source
)
values (
  true, '[]'::jsonb, now(), 'data.gov.in AGMARKNET'
)
on conflict (id) do nothing;
