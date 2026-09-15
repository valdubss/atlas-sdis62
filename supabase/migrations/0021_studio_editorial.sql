-- 0021 — Studio (lot 2 v3) : calendrier éditorial, brouillons partagés
-- (verrou, sauvegarde automatique, versions), relecture, upload robuste.

-- -----------------------------------------------------------------------------
-- 1. Brouillons partagés : verrou d'édition, versions, relecture
-- -----------------------------------------------------------------------------
alter table public.posts
  add column if not exists lock_by uuid references public.profiles (id) on delete set null,
  add column if not exists lock_at timestamptz,
  add column if not exists autosave_at timestamptz,
  -- Relecture : 'none' | 'requested' | 'approved' | 'returned' (le statut de publication reste draft/scheduled/published)
  add column if not exists review_status text not null default 'none' check (review_status in ('none', 'requested', 'approved', 'returned')),
  add column if not exists review_requested_to uuid references public.profiles (id) on delete set null,
  add column if not exists review_requested_by uuid references public.profiles (id) on delete set null,
  add column if not exists review_requested_at timestamptz,
  add column if not exists review_decided_by uuid references public.profiles (id) on delete set null,
  add column if not exists review_decided_at timestamptz;

create table public.post_versions (
  id          bigint generated always as identity primary key,
  post_id     uuid not null references public.posts (id) on delete cascade,
  version     int not null,
  snapshot    jsonb not null,           -- {title, location, excerpt, body, tags, type}
  saved_by    uuid references public.profiles (id) on delete set null,
  saved_at    timestamptz not null default now(),
  unique (post_id, version)
);
create index post_versions_post_idx on public.post_versions (post_id, version desc);
alter table public.post_versions enable row level security;
create policy post_versions_editor on public.post_versions for all to authenticated using (public.is_editor()) with check (public.is_editor());

create table public.post_review_comments (
  id          bigint generated always as identity primary key,
  post_id     uuid not null references public.posts (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index post_review_comments_post_idx on public.post_review_comments (post_id, created_at);
alter table public.post_review_comments enable row level security;
-- Commentaires internes : invisibles des agents (éditeurs seulement)
create policy post_review_comments_editor on public.post_review_comments for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- Versions : une ligne à chaque changement de contenu, 30 conservées par publication
create or replace function public.posts_version_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_next int;
begin
  if tg_op = 'UPDATE' and old.title is not distinct from new.title and old.body is not distinct from new.body
     and old.excerpt is not distinct from new.excerpt and old.location is not distinct from new.location
     and old.tags is not distinct from new.tags then
    return new;
  end if;
  select coalesce(max(version), 0) + 1 into v_next from public.post_versions where post_id = new.id;
  insert into public.post_versions (post_id, version, snapshot, saved_by)
  values (new.id, v_next, jsonb_build_object('type', new.type, 'title', new.title, 'location', new.location, 'excerpt', new.excerpt, 'body', new.body, 'tags', to_jsonb(new.tags)), auth.uid());
  delete from public.post_versions where post_id = new.id and version <= v_next - 30;
  return new;
end $$;
drop trigger if exists posts_version_snapshot on public.posts;
create trigger posts_version_snapshot after insert or update of title, body, excerpt, location, tags on public.posts
  for each row execute function public.posts_version_snapshot();

-- Relecture : une publication en relecture ne se publie qu'une fois validée (sauf administrateur)
create or replace function public.posts_review_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('published', 'scheduled') and old.status is distinct from new.status
     and new.review_status = 'requested' and not public.is_admin() then
    raise exception 'RELECTURE_EN_COURS: validation par un éditeur requise avant publication' using errcode = 'P0030';
  end if;
  -- Une nouvelle demande efface la décision précédente ; une décision est datée et signée
  if new.review_status = 'requested' and old.review_status is distinct from 'requested' then
    new.review_requested_by := auth.uid(); new.review_requested_at := now();
    new.review_decided_by := null; new.review_decided_at := null;
  elsif new.review_status in ('approved', 'returned') and old.review_status is distinct from new.review_status then
    new.review_decided_by := auth.uid(); new.review_decided_at := now();
  end if;
  return new;
end $$;
drop trigger if exists posts_review_guard on public.posts;
create trigger posts_review_guard before update on public.posts for each row execute function public.posts_review_guard();

-- Notification dans l'app au relecteur (demande) et au demandeur (décision)
create or replace function public.notify_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text := coalesce(new.title, 'Publication sans titre');
begin
  if new.review_status = 'requested' and old.review_status is distinct from 'requested' and new.review_requested_to is not null then
    insert into public.notifications (user_id, kind, title, body, url)
    values (new.review_requested_to, 'post', 'Relecture demandée', v_title, '/studio/posts/' || new.id);
  elsif new.review_status in ('approved', 'returned') and old.review_status is distinct from new.review_status and new.review_requested_by is not null then
    insert into public.notifications (user_id, kind, title, body, url)
    values (new.review_requested_by, 'post', case when new.review_status = 'approved' then 'Relecture validée' else 'Relecture : retour' end, v_title, '/studio/posts/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists posts_notify_review on public.posts;
create trigger posts_notify_review after update of review_status on public.posts for each row execute function public.notify_review();

-- -----------------------------------------------------------------------------
-- 2. Upload robuste : empreinte de fichier (doublons), origine du texte alternatif
-- -----------------------------------------------------------------------------
alter table public.media
  add column if not exists fingerprint text,
  add column if not exists alt_source text not null default 'manual' check (alt_source in ('manual', 'assisted'));
create index if not exists media_fingerprint_idx on public.media (fingerprint) where fingerprint is not null;

-- Envois reprenables (TUS) directement par l'éditeur ou le référent connecté :
-- politiques de stockage limitées aux dossiers d'originaux du bucket « media ».
drop policy if exists media_tus_insert on storage.objects;
create policy media_tus_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] in ('originals', 'videos', 'posters')
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active));
drop policy if exists media_tus_update on storage.objects;
create policy media_tus_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] in ('originals', 'videos', 'posters') and owner = auth.uid())
  with check (bucket_id = 'media' and (storage.foldername(name))[1] in ('originals', 'videos', 'posters'));
drop policy if exists media_tus_select on storage.objects;
create policy media_tus_select on storage.objects for select to authenticated
  using (bucket_id = 'media');

-- -----------------------------------------------------------------------------
-- 3. Calendrier éditorial : tout ce qui a une date (ou pas encore)
-- -----------------------------------------------------------------------------
create or replace function public.studio_calendar(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_editor() then coalesce(jsonb_agg(x order by x->>'at'), '[]'::jsonb) else '[]'::jsonb end
  from (
    -- Publications : datées (programmée, publiée) ou sans date (brouillons)
    select jsonb_build_object('kind', 'post', 'id', p.id, 'title', coalesce(p.title, left(p.body, 60), 'Sans titre'), 'type', p.type::text,
             'status', case when p.review_status = 'requested' then 'in_review' else p.status::text end,
             'at', coalesce(p.published_at, p.scheduled_at), 'href', '/studio/posts/' || p.id) as x
    from public.posts p
    where p.deleted_at is null and p.scope = 'departmental' and p.status <> 'archived'
      and (coalesce(p.published_at, p.scheduled_at) is null or coalesce(p.published_at, p.scheduled_at) between p_from and p_to)
    union all
    select jsonb_build_object('kind', 'story', 'id', s.id, 'title', coalesce(s.overlay->>'text', ss.title, 'Story'), 'type', 'story',
             'status', s.status::text, 'at', coalesce(s.published_at, s.scheduled_at), 'href', '/studio/stories/' || s.id)
    from public.stories s left join public.story_series ss on ss.id = s.series_id
    where s.status in ('draft', 'scheduled', 'published')
      and (coalesce(s.published_at, s.scheduled_at) is null or coalesce(s.published_at, s.scheduled_at) between p_from and p_to)
    union all
    select jsonb_build_object('kind', 'flash', 'id', f.id, 'title', f.title, 'type', 'flash',
             'status', case when f.ends_at < now() then 'published' when f.starts_at > now() then 'scheduled' else 'published' end,
             'at', f.starts_at, 'href', '/studio/flash')
    from public.flashes f where f.deleted_at is null and f.starts_at between p_from and p_to
    union all
    select jsonb_build_object('kind', 'event', 'id', e.id, 'title', e.title, 'type', 'event',
             'status', case when e.status = 'published' then 'published' when e.status = 'pending' then 'in_review' else 'draft' end,
             'at', e.starts_at, 'href', '/studio/agenda/' || e.id)
    from public.events e where e.deleted_at is null and e.center_id is null and e.starts_at between p_from and p_to
  ) t
$$;
revoke all on function public.studio_calendar(timestamptz, timestamptz) from public;
grant execute on function public.studio_calendar(timestamptz, timestamptz) to authenticated;

-- Tableau de bord : compteur des relectures en attente
create or replace function public.studio_stats()
returns jsonb language plpgsql as $$
begin
  if not public.is_editor() then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  perform public.publish_scheduled();
  return jsonb_build_object(
    'drafts',    (select count(*) from public.posts where status = 'draft' and deleted_at is null and scope = 'departmental'),
    'scheduled', (select count(*) from public.posts where status = 'scheduled' and deleted_at is null),
    'published', (select count(*) from public.posts where status = 'published' and deleted_at is null and scope = 'departmental'),
    'in_review', (select count(*) from public.posts where review_status = 'requested' and deleted_at is null),
    'week', jsonb_build_object(
      'posts',     (select count(*) from public.posts where status = 'published' and published_at > now() - interval '7 days' and deleted_at is null),
      'reactions', (select count(*) from public.reactions where created_at > now() - interval '7 days'),
      'comments',  (select count(*) from public.comments where created_at > now() - interval '7 days' and status = 'visible'),
      'views',     (select count(*) from public.post_views where first_viewed_at > now() - interval '7 days')
    ),
    'top', coalesce((
      select jsonb_agg(t order by t.score desc)
      from (
        select p.id, p.slug, p.title, p.type, p.published_at,
               (select count(*) from public.reactions r where r.post_id = p.id) as reactions,
               (select count(*) from public.comments c where c.post_id = p.id and c.status = 'visible') as comments,
               (select count(*) from public.post_views v where v.post_id = p.id) as views,
               (select count(*) from public.reactions r where r.post_id = p.id) * 2
                 + (select count(*) from public.comments c where c.post_id = p.id and c.status = 'visible') * 3
                 + (select count(*) from public.post_views v where v.post_id = p.id) as score
        from public.posts p
        where p.status = 'published' and p.deleted_at is null
          and p.published_at > now() - interval '7 days'
        order by score desc
        limit 5
      ) t
    ), '[]'::jsonb)
  );
end $$;
