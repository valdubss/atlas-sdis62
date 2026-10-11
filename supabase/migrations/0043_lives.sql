-- 0043 — Le Direct : fil minute par minute (texte, photos) ouvert par le service communication
-- pendant une opération ou une cérémonie, épinglé en tête du fil tant qu'il est actif, avec
-- vidéo en direct facultative (Bunny Stream, clé RTMP) ; un seul Direct actif à la fois ;
-- à la clôture, une publication récapitulative est générée.

create table if not exists public.lives (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) between 1 and 120),
  location       text check (location is null or char_length(location) <= 160),
  center_id      uuid references public.centers (id) on delete set null,
  status         text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  video          boolean not null default false,
  started_at     timestamptz,
  ended_at       timestamptz,
  recap_post_id  uuid references public.posts (id) on delete set null,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
-- Un seul Direct actif à la fois
create unique index if not exists lives_single_active on public.lives ((true)) where status = 'live' and deleted_at is null;
create index if not exists lives_recent_idx on public.lives (created_at desc) where deleted_at is null;

create table if not exists public.live_entries (
  id          uuid primary key default gen_random_uuid(),
  live_id     uuid not null references public.lives (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  body        text check (body is null or char_length(body) <= 600),
  media_id    uuid references public.media (id) on delete set null,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint live_entries_content check (body is not null or media_id is not null)
);
create index if not exists live_entries_live_idx on public.live_entries (live_id, created_at desc) where deleted_at is null;

alter table public.lives enable row level security;
alter table public.live_entries enable row level security;

-- Lecture : tout agent voit les Directs en cours ou terminés ; le service com voit tout
drop policy if exists lives_select on public.lives;
create policy lives_select on public.lives for select to authenticated
  using (deleted_at is null and (status in ('live', 'ended') or public.is_editor()));
drop policy if exists lives_editor on public.lives;
create policy lives_editor on public.lives for all to authenticated
  using (public.is_editor()) with check (public.is_editor());
drop policy if exists live_entries_select on public.live_entries;
create policy live_entries_select on public.live_entries for select to authenticated
  using (deleted_at is null and exists (select 1 from public.lives l where l.id = live_id and l.deleted_at is null and (l.status in ('live', 'ended') or public.is_editor())));
drop policy if exists live_entries_editor on public.live_entries;
create policy live_entries_editor on public.live_entries for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

drop trigger if exists lives_set_updated_at on public.lives;
create trigger lives_set_updated_at before update on public.lives for each row execute function public.set_updated_at();
drop trigger if exists audit_lives on public.lives;
create trigger audit_lives after insert or update or delete on public.lives for each row execute function public.audit_trigger();

-- Temps réel : entrées et changements d'état poussés aux lecteurs
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'lives') then
    alter publication supabase_realtime add table public.lives;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'live_entries') then
    alter publication supabase_realtime add table public.live_entries;
  end if;
end $$;

-- Lancement : push à tous (file des notifications) + cloche
alter table public.notifications drop constraint if exists notifications_kind;
alter table public.notifications add constraint notifications_kind
  check (kind in ('post', 'flash', 'reply', 'event', 'story_reply', 'center', 'directory', 'message', 'membership', 'coeditor', 'note', 'mention', 'live'));

create or replace function public.lives_announce()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live') and new.deleted_at is null then
    insert into public.notification_queue (kind, payload)
    values ('push_flash'::public.notification_kind, jsonb_build_object(
      'flash_id', new.id,
      'title', '🔴 En direct : ' || new.title,
      'body', coalesce(new.location, 'Suivez le direct dans ATLAS'),
      'url', '/direct/' || new.id::text
    ));
    perform public.notify_all('live', 'En direct : ' || new.title, coalesce(new.location, ''), '/direct/' || new.id::text, new.created_by);
  end if;
  return new;
end $$;
drop trigger if exists lives_announce on public.lives;
create trigger lives_announce after insert or update of status on public.lives for each row execute function public.lives_announce();
