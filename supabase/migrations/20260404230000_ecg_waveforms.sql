-- Full ECG waveforms (voltage samples in mV) from Apple Watch; separate from health_samples (classification).

create table if not exists public.ecg_waveforms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hk_sample_uuid text not null,
  recorded_at timestamptz not null,
  sampling_frequency_hz double precision,
  classification_code int,
  voltages_mv double precision[] not null,
  created_at timestamptz not null default now()
);

create unique index if not exists ecg_waveforms_user_hk_uuid
  on public.ecg_waveforms (user_id, hk_sample_uuid);

create index if not exists ecg_waveforms_user_recorded
  on public.ecg_waveforms (user_id, recorded_at desc);

alter table public.ecg_waveforms enable row level security;

create policy "ecg_waveforms_select_own"
  on public.ecg_waveforms for select
  using (auth.uid() = user_id);

create policy "ecg_waveforms_insert_own"
  on public.ecg_waveforms for insert
  with check (auth.uid() = user_id);

create policy "ecg_waveforms_update_own"
  on public.ecg_waveforms for update
  using (auth.uid() = user_id);

create policy "ecg_waveforms_delete_own"
  on public.ecg_waveforms for delete
  using (auth.uid() = user_id);
