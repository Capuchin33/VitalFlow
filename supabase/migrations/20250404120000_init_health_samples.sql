-- VitalFlow: health time-series tied to auth.users

create table if not exists public.health_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  metric_type text not null,
  value double precision not null,
  unit text,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists health_samples_user_metric_time
  on public.health_samples (user_id, metric_type, recorded_at);

create index if not exists health_samples_user_recorded
  on public.health_samples (user_id, recorded_at desc);

alter table public.health_samples enable row level security;

create policy "health_samples_select_own"
  on public.health_samples for select
  using (auth.uid() = user_id);

create policy "health_samples_insert_own"
  on public.health_samples for insert
  with check (auth.uid() = user_id);

create policy "health_samples_update_own"
  on public.health_samples for update
  using (auth.uid() = user_id);

create policy "health_samples_delete_own"
  on public.health_samples for delete
  using (auth.uid() = user_id);
