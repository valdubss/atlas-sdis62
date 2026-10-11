-- 0041 — Documents utiles (fiches réflexes, hors ligne sur demande), participation aux
-- événements de l'agenda (« Je participe », liste pour le service com et le chef de centre),
-- mentions @ dans les commentaires (notification de la personne citée).

-- -----------------------------------------------------------------------------
-- 1. Documents : partagés à tout le SDIS, gérés par le service communication
-- -----------------------------------------------------------------------------
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 140),
  category     text not null default 'Général' check (char_length(category) between 1 and 60),
  description  text check (description is null or char_length(description) <= 500),
  kind         text not null check (kind in ('pdf', 'image')),
  file_key     text not null,
  file_name    text check (file_name is null or char_length(file_name) <= 200),
  file_size    bigint not null default 0 check (file_size >= 0),
  sort_order   int not null default 0,
  published    boolean not null default true,
  author_id    uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists documents_list_idx on public.documents (category, sort_order, title) where deleted_at is null;
alter table public.documents enable row level security;
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (deleted_at is null and (published or public.is_editor()));
drop policy if exists documents_editor on public.documents;
create policy documents_editor on public.documents for all to authenticated
  using (public.is_editor()) with check (public.is_editor());
drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();
drop trigger if exists audit_documents on public.documents;
create trigger audit_documents after insert or update or delete on public.documents for each row execute function public.audit_trigger();

-- -----------------------------------------------------------------------------
-- 2. Participation aux événements
-- -----------------------------------------------------------------------------
create table if not exists public.event_participations (
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_participations_user_idx on public.event_participations (user_id);
alter table public.event_participations enable row level security;
drop policy if exists event_participations_select on public.event_participations;
create policy event_participations_select on public.event_participations for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_editor()
    or exists (select 1 from public.events e where e.id = event_id and e.center_id is not null and public.can_manage_center(e.center_id))
  );
drop policy if exists event_participations_insert on public.event_participations;
create policy event_participations_insert on public.event_participations for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.events e where e.id = event_id and e.status = 'published' and e.deleted_at is null));
drop policy if exists event_participations_delete on public.event_participations;
create policy event_participations_delete on public.event_participations for delete to authenticated
  using (user_id = auth.uid());

-- Nombre de participants et participation de l'agent, pour une liste d'événements
create or replace function public.events_participation(p_events uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', e,
    'count', (select count(*) from public.event_participations ep where ep.event_id = e),
    'mine', exists (select 1 from public.event_participations ep where ep.event_id = e and ep.user_id = auth.uid())
  )), '[]'::jsonb)
  from unnest(p_events) as e;
$$;
revoke all on function public.events_participation(uuid[]) from public;
grant execute on function public.events_participation(uuid[]) to authenticated, service_role;

-- Liste nominative : service communication, ou chef / responsable com du centre de l'événement
create or replace function public.event_participants(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_center uuid;
begin
  select center_id into v_center from public.events where id = p_event;
  if not (public.is_editor() or (v_center is not null and public.can_manage_center(v_center))) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', nullif(trim(p.first_name || ' ' || p.last_name), ''),
      'center', c.name,
      'avatar_key', p.avatar_key,
      'at', ep.created_at
    ) order by p.last_name, p.first_name)
    from public.event_participations ep
    join public.profiles p on p.id = ep.user_id
    left join public.centers c on c.id = p.center_id
    where ep.event_id = p_event
  ), '[]'::jsonb);
end $$;
revoke all on function public.event_participants(uuid) from public;
grant execute on function public.event_participants(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Mentions dans les commentaires
-- -----------------------------------------------------------------------------
create table if not exists public.comment_mentions (
  comment_id  uuid not null references public.comments (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  primary key (comment_id, user_id)
);
alter table public.comment_mentions enable row level security;
drop policy if exists comment_mentions_insert on public.comment_mentions;
create policy comment_mentions_insert on public.comment_mentions for insert to authenticated
  with check (exists (select 1 from public.comments c where c.id = comment_id and c.user_id = auth.uid()));
drop policy if exists comment_mentions_select on public.comment_mentions;
create policy comment_mentions_select on public.comment_mentions for select to authenticated
  using (user_id = auth.uid() or public.is_editor() or exists (select 1 from public.comments c where c.id = comment_id and c.user_id = auth.uid()));

alter table public.notifications drop constraint if exists notifications_kind;
alter table public.notifications add constraint notifications_kind
  check (kind in ('post', 'flash', 'reply', 'event', 'story_reply', 'center', 'directory', 'message', 'membership', 'coeditor', 'note', 'mention'));

-- La personne citée est prévenue (cloche), sauf si elle se cite elle-même
create or replace function public.notify_comment_mention()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_body text;
  v_post uuid;
  v_slug text;
  v_name text;
begin
  select c.user_id, c.body, c.post_id into v_author, v_body, v_post from public.comments c where c.id = new.comment_id;
  if v_author is null or v_author = new.user_id then return new; end if;
  select p.slug into v_slug from public.posts p where p.id = v_post;
  select trim(pr.first_name || ' ' || pr.last_name) into v_name from public.profiles pr where pr.id = v_author;
  insert into public.notifications (user_id, kind, title, body, url)
  values (new.user_id, 'mention', coalesce(nullif(v_name, ''), 'Un agent') || ' vous a mentionné', left(v_body, 140), '/post/' || v_slug);
  return new;
end $$;
drop trigger if exists comment_mentions_notify on public.comment_mentions;
create trigger comment_mentions_notify after insert on public.comment_mentions for each row execute function public.notify_comment_mention();
