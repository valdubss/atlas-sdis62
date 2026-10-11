-- 0044 — Direct vidéo depuis l'app (Cloudflare Stream, WebRTC) : adresses de lecture publiques
-- sur `lives`, secrets de diffusion (WHIP, RTMP, clé) dans `live_inputs`, lisibles par le seul
-- service communication.

alter table public.lives
  add column if not exists cf_input_id text,
  add column if not exists whep_url text,
  add column if not exists hls_url text;

create table if not exists public.live_inputs (
  live_id     uuid primary key references public.lives (id) on delete cascade,
  whip_url    text,
  rtmp_url    text,
  stream_key  text,
  created_at  timestamptz not null default now()
);
alter table public.live_inputs enable row level security;
drop policy if exists live_inputs_editor on public.live_inputs;
create policy live_inputs_editor on public.live_inputs for all to authenticated
  using (public.is_editor()) with check (public.is_editor());
