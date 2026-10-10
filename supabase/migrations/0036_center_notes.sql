-- =============================================================================
-- 0036 — Notes de service : fil interne d'un centre
--  Second fil sur la page du centre, réservé à ses membres : documents PDF ou
--  images publiés directement par le chef de centre, le responsable
--  communication (ou référent) du centre, et le service communication.
--  Ni réactions ni commentaires. Membres prévenus (cloche + push « mon centre »).
-- =============================================================================

create table if not exists public.center_notes (
  id            uuid primary key default gen_random_uuid(),
  center_id     uuid not null references public.centers (id) on delete cascade,
  author_id     uuid references public.profiles (id) on delete set null,
  title         text not null check (char_length(title) between 1 and 140),
  body          text check (body is null or char_length(body) <= 2000),
  kind          text not null check (kind in ('pdf', 'image')),
  file_key      text not null,
  file_name     text check (file_name is null or char_length(file_name) <= 200),
  file_size     bigint not null default 0 check (file_size >= 0),
  width         int,
  height        int,
  pinned        boolean not null default false,
  published_at  timestamptz not null default now(),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists center_notes_center_idx on public.center_notes (center_id, pinned desc, published_at desc) where deleted_at is null;

alter table public.center_notes enable row level security;

-- Lecture : membres du centre, chef / responsable com, service communication
drop policy if exists center_notes_select on public.center_notes;
create policy center_notes_select on public.center_notes for select to authenticated
  using (deleted_at is null and (public.is_member_of_center(center_id) or public.can_manage_center(center_id)));

-- Écriture : chef de centre, responsable com (ou référent), service communication
drop policy if exists center_notes_manage on public.center_notes;
create policy center_notes_manage on public.center_notes for all to authenticated
  using (public.can_manage_center(center_id)) with check (public.can_manage_center(center_id));

-- Rôle d'un auteur pour l'affichage (« Chef de centre », « Responsable com », « Service communication »)
create or replace function public.center_author_role(p_center uuid, p_profile uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.profiles p where p.id = p_profile and p.role in ('editor', 'admin')) then 'service_com'
    when exists (select 1 from public.centers c join public.profiles p on p.id = p_profile
                 where c.id = p_center and (c.chief_id = p.id or (c.chief_email is not null and lower(c.chief_email) = lower(p.email)))) then 'chief'
    when exists (select 1 from public.center_referents r where r.center_id = p_center and r.profile_id = p_profile and r.is_active)
      or exists (select 1 from public.centers c join public.profiles p on p.id = p_profile
                 where c.id = p_center and c.com_email is not null and lower(c.com_email) = lower(p.email)) then 'com'
    else null end
$$;
revoke all on function public.center_author_role(uuid, uuid) from public;
grant execute on function public.center_author_role(uuid, uuid) to authenticated, service_role;

-- Notes d'un centre avec auteur et rôle (RLS appliquée dans la fonction : membres et responsables seulement)
create or replace function public.center_notes_list(p_center uuid, p_limit int default 50)
returns setof jsonb language sql stable as $$
  select jsonb_build_object(
    'id', n.id, 'center_id', n.center_id, 'title', n.title, 'body', n.body, 'kind', n.kind,
    'file_key', n.file_key, 'file_name', n.file_name, 'file_size', n.file_size, 'width', n.width, 'height', n.height,
    'pinned', n.pinned, 'published_at', n.published_at,
    'author', case when n.author_id is null then null else (select jsonb_build_object(
        'id', p.id, 'name', nullif(trim(p.first_name || ' ' || p.last_name), ''), 'avatar_key', p.avatar_key,
        'role', public.center_author_role(n.center_id, p.id)) from public.profiles p where p.id = n.author_id) end)
  from public.center_notes n
  where n.center_id = p_center and n.deleted_at is null
  order by n.pinned desc, n.published_at desc
  limit greatest(1, least(p_limit, 200))
$$;
revoke all on function public.center_notes_list(uuid, int) from public;
grant execute on function public.center_notes_list(uuid, int) to authenticated, service_role;

-- Notifications : cloche pour chaque membre (sauf l'auteur) + push « Nouveautés de mon centre »
alter table public.notifications drop constraint if exists notifications_kind;
alter table public.notifications add constraint notifications_kind
  check (kind in ('post', 'flash', 'reply', 'event', 'story_reply', 'center', 'directory', 'message', 'membership', 'coeditor', 'note'));

create or replace function public.notify_center_note()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_center public.centers%rowtype; v_url text;
begin
  select * into v_center from public.centers where id = new.center_id;
  v_url := '/centre/' || v_center.slug || '?onglet=notes';
  insert into public.notifications (user_id, kind, title, body, url)
  select p.id, 'note', 'Note de service · ' || v_center.name, left(new.title, 200), v_url
  from public.profiles p where p.center_id = new.center_id and p.is_active and p.id is distinct from new.author_id;
  insert into public.notification_queue (kind, payload, dedupe_key)
  values ('push_center'::public.notification_kind, jsonb_build_object(
    'note_id', new.id, 'center_id', new.center_id, 'title', 'Note de service · ' || v_center.name,
    'body', left(new.title, 140), 'url', v_url), 'note:' || new.id);
  return new;
end $$;
drop trigger if exists center_notes_notify on public.center_notes;
create trigger center_notes_notify after insert on public.center_notes for each row execute function public.notify_center_note();

-- Export RGPD : les notes publiées par l'agent
-- (export_user_data agrège déjà les tables principales ; les notes restent liées au centre et
--  perdent seulement leur auteur à la suppression du compte : author_id → null.)
