-- 0040 — Journal des erreurs côté appareil (Administration → Journal) et publication différée
-- « dès la fin de l'envoi des médias » (brouillon marqué, publié par l'app ou le cron).

-- 1. Erreurs remontées par les téléphones et navigateurs (route /api/journal/client, clé de
--    service) : lisibles par les administrateurs, purgées après 30 jours.
create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  message     text not null,
  stack       text,
  url         text,
  user_agent  text,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
drop policy if exists client_errors_admin on public.client_errors;
create policy client_errors_admin on public.client_errors for select to authenticated using (public.is_admin());

create or replace function public.purge_client_errors()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.client_errors where created_at < now() - interval '30 days';
$$;
revoke all on function public.purge_client_errors() from public;

-- 2. Publication différée : « Publier » pendant que les médias s'envoient encore enregistre un
--    brouillon marqué ; l'app (fin d'envoi) ou le cron le publie dès que tout est prêt.
alter table public.posts add column if not exists publish_when_ready boolean not null default false;
comment on column public.posts.publish_when_ready is 'Brouillon à publier automatiquement dès que tous ses médias sont prêts';
create index if not exists posts_publish_when_ready_idx on public.posts (publish_when_ready) where publish_when_ready;
