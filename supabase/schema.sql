create table if not exists public.naka_app_data (
  id text primary key check (
    id in (
      'nakahasite_users',
      'nakahasite_orders',
      'nakahasite_settings',
      'nakahasite_spareparts'
    )
  ),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.naka_app_data enable row level security;
revoke all on public.naka_app_data from anon, authenticated;
grant all on public.naka_app_data to service_role;

insert into storage.buckets (id, name, public)
values ('nakahasite-private', 'nakahasite-private', false)
on conflict (id) do update set public = false;
