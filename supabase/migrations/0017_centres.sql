-- =============================================================================
-- 0017 — Vie des centres : référentiel, rôle référent, propositions, RLS
-- -----------------------------------------------------------------------------
-- Principe : le fil départemental (posts.scope = 'departmental') est étanche.
-- Un contenu de centre (scope = 'center') n'y entre que par promote_center_post,
-- qui crée un post départemental distinct. Voir docs/ARCHITECTURE-CENTRES.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Référentiel : groupements, centres (colonnes), services
-- -----------------------------------------------------------------------------
create table public.groupings (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  constraint groupings_name_len check (char_length(name) between 1 and 80)
);

alter table public.centers
  add column if not exists grouping_id uuid references public.groupings (id) on delete set null,
  add column if not exists type public.center_type not null default 'cis',
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists cover_media_id uuid references public.media (id) on delete set null,
  add column if not exists presentation text,
  add column if not exists chief_id uuid references public.profiles (id) on delete set null,
  add column if not exists displayed_headcount int,
  add column if not exists pending_cover_media_id uuid references public.media (id) on delete set null,
  add column if not exists pending_presentation text,
  add column if not exists pending_by uuid references public.profiles (id) on delete set null,
  add column if not exists pending_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
alter table public.centers drop constraint if exists centers_presentation_len;
alter table public.centers add constraint centers_presentation_len check (presentation is null or char_length(presentation) <= 600);
alter table public.centers drop constraint if exists centers_pending_presentation_len;
alter table public.centers add constraint centers_pending_presentation_len check (pending_presentation is null or char_length(pending_presentation) <= 600);
create index if not exists centers_grouping_idx on public.centers (grouping_id, sort_order);
drop trigger if exists centers_set_updated_at on public.centers;
create trigger centers_set_updated_at before update on public.centers for each row execute function public.set_updated_at();

create table public.services (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null unique,
  short_description text,
  mission           text,
  contact_reasons   text[] not null default '{}',
  manager_id        uuid references public.profiles (id) on delete set null,
  phone             text,
  email             text,
  address           text,
  grouping_id       uuid references public.groupings (id) on delete set null,
  sort_order        int not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint services_name_len check (char_length(name) between 1 and 120),
  constraint services_short_len check (short_description is null or char_length(short_description) <= 140),
  constraint services_mission_len check (mission is null or char_length(mission) <= 2000),
  constraint services_reasons_max check (cardinality(contact_reasons) <= 3)
);
create trigger services_set_updated_at before update on public.services for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Profils : service, fonction, annuaire, présentation
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists service_id uuid references public.services (id) on delete set null,
  add column if not exists job_title text,
  add column if not exists directory_visible boolean not null default false,
  add column if not exists work_phone text,
  add column if not exists present_me boolean not null default false,
  add column if not exists center_joined_at date;
alter table public.profiles drop constraint if exists profiles_job_title_len;
alter table public.profiles add constraint profiles_job_title_len check (job_title is null or char_length(job_title) <= 60);
alter table public.profiles drop constraint if exists profiles_work_phone_len;
alter table public.profiles add constraint profiles_work_phone_len check (work_phone is null or char_length(work_phone) <= 30);
create index if not exists profiles_center_idx on public.profiles (center_id) where center_id is not null;

create or replace function public.profiles_center_joined()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.center_id is not null then new.center_joined_at := current_date; end if;
  elsif new.center_id is distinct from old.center_id then
    new.center_joined_at := case when new.center_id is null then null else current_date end;
  end if;
  return new;
end $$;
drop trigger if exists profiles_center_joined on public.profiles;
create trigger profiles_center_joined before insert or update of center_id on public.profiles
  for each row execute function public.profiles_center_joined();

-- -----------------------------------------------------------------------------
-- 3. Référents et centres suivis
-- -----------------------------------------------------------------------------
create table public.center_referents (
  id          uuid primary key default gen_random_uuid(),
  center_id   uuid not null references public.centers (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  since       date not null default current_date,
  ended_at    date,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index center_referents_center_idx on public.center_referents (center_id) where is_active;
create index center_referents_profile_idx on public.center_referents (profile_id) where is_active;
create unique index center_referents_active_uniq on public.center_referents (center_id, profile_id) where is_active;

create table public.center_follows (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  center_id   uuid not null references public.centers (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, center_id)
);
create or replace function public.center_follows_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.center_follows f where f.profile_id = new.profile_id) >= 3 then
    raise exception 'LIMITE_SUIVIS: 3 centres suivis au maximum' using errcode = 'P0020';
  end if;
  return new;
end $$;
create trigger center_follows_limit before insert on public.center_follows for each row execute function public.center_follows_limit();

/** Vrai si l'utilisateur est référent actif du centre. */
create or replace function public.is_referent_of(p_center_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.center_referents r
    where r.center_id = p_center_id and r.profile_id = auth.uid() and r.is_active
  )
$$;
/** Vrai si l'utilisateur est référent actif d'au moins un centre. */
create or replace function public.is_referent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.center_referents r where r.profile_id = auth.uid() and r.is_active)
$$;
revoke all on function public.is_referent_of(uuid) from public;
revoke all on function public.is_referent() from public;
grant execute on function public.is_referent_of(uuid) to authenticated, service_role;
grant execute on function public.is_referent() to authenticated, service_role;

-- Le rôle « referent » du profil suit la table des référents (source de vérité)
-- Le garde-fou des profils laisse passer la synchronisation du rôle (drapeau de transaction)
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and coalesce(current_setting('atlas.role_sync', true), '') <> '1' then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email then
      raise exception 'MODIFICATION_INTERDITE: role, is_active et email sont réservés aux administrateurs'
        using errcode = '42501';
    end if;
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.onboarded_at is distinct from old.onboarded_at then
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                          || jsonb_build_object('role', new.role::text, 'is_active', new.is_active, 'onboarded', new.onboarded_at is not null)
    where id = new.id;
  end if;

  return new;
end $$;

create or replace function public.sync_referent_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_profile uuid := coalesce(new.profile_id, old.profile_id);
begin
  perform set_config('atlas.role_sync', '1', true);
  if exists (select 1 from public.center_referents r where r.profile_id = v_profile and r.is_active) then
    update public.profiles set role = 'referent' where id = v_profile and role = 'reader';
  else
    update public.profiles set role = 'reader' where id = v_profile and role = 'referent';
  end if;
  return coalesce(new, old);
end $$;
create trigger center_referents_sync_role after insert or update or delete on public.center_referents
  for each row execute function public.sync_referent_role();

-- -----------------------------------------------------------------------------
-- 4. Publications de centre : colonnes, garde-fous, vue
-- -----------------------------------------------------------------------------
alter table public.posts
  add column if not exists scope public.post_scope not null default 'departmental',
  add column if not exists submitted_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists moderation_message text,
  add column if not exists promoted_from_id uuid references public.posts (id) on delete set null;
alter table public.posts drop constraint if exists posts_center_scope;
alter table public.posts add constraint posts_center_scope check (scope = 'departmental' or center_id is not null);
alter table public.posts drop constraint if exists posts_moderation_len;
alter table public.posts add constraint posts_moderation_len check (moderation_message is null or char_length(moderation_message) <= 500);
alter table public.posts drop constraint if exists posts_center_types;
alter table public.posts add constraint posts_center_types check (scope = 'departmental' or type in ('photo', 'text', 'video'));
create index if not exists posts_center_scope_idx on public.posts (center_id, status, published_at desc) where scope = 'center';
create index if not exists posts_pending_idx on public.posts (created_at) where status = 'pending';

create or replace view public.center_posts as
  select * from public.posts where scope = 'center';

/** Garde-fous d'un post de centre (avant écriture). */
create or replace function public.posts_center_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_editor boolean := public.is_editor();
begin
  if auth.uid() is null then return new; end if; -- service_role / éditeur SQL

  if not v_editor then
    -- Un non-éditeur n'écrit jamais dans le fil départemental
    if new.scope = 'departmental' then
      raise exception 'ACCES_REFUSE: fil départemental réservé au service communication' using errcode = '42501';
    end if;
    if not public.is_referent_of(new.center_id) then
      raise exception 'ACCES_REFUSE: vous n''êtes pas référent de ce centre' using errcode = '42501';
    end if;
    if new.status <> 'pending' then
      raise exception 'ACCES_REFUSE: seule une proposition en attente est possible' using errcode = '42501';
    end if;
    if new.pinned_at is not null or new.promoted_from_id is not null then
      raise exception 'ACCES_REFUSE' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.submitted_by := auth.uid();
      new.author_id := auth.uid();
      new.author_display := 'agent';
      if (select count(*) from public.posts p where p.submitted_by = auth.uid() and p.status = 'pending' and p.deleted_at is null) >= 10 then
        raise exception 'LIMITE_PROPOSITIONS: 10 propositions en attente au maximum' using errcode = 'P0021';
      end if;
    else
      if old.status <> 'pending' or old.submitted_by is distinct from auth.uid() then
        raise exception 'ACCES_REFUSE: proposition déjà traitée' using errcode = '42501';
      end if;
      new.submitted_by := old.submitted_by;
      new.center_id := old.center_id;
      new.reviewed_by := null; new.reviewed_at := null; new.moderation_message := old.moderation_message;
    end if;
  else
    -- Éditeur : traçabilité de la validation / du refus
    if tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('published', 'declined') then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
      if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists posts_center_guard on public.posts;
create trigger posts_center_guard before insert or update on public.posts
  for each row execute function public.posts_center_guard();

-- Le trigger d'épinglage / slug existant (posts_before_write) reste en place.

-- Notifications : validation / refus → auteur ; publication → agents rattachés au centre
create or replace function public.notify_center_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_center text; v_text text;
begin
  if new.scope <> 'center' then return new; end if;
  select name into v_center from public.centers where id = new.center_id;
  v_text := coalesce(new.title, left(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g'), 120));
  if tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'published' then
    -- Auteur
    if new.submitted_by is not null then
      insert into public.notifications (user_id, kind, title, body, url)
      values (new.submitted_by, 'post', 'Votre proposition est publiée', v_text, '/centre/' || (select slug from public.centers where id = new.center_id));
    end if;
    -- Agents rattachés (jamais les centres suivis) : file push + cloche
    insert into public.notification_queue (kind, payload)
    values ('push_center'::public.notification_kind, jsonb_build_object(
      'post_id', new.id, 'center_id', new.center_id, 'title', v_center, 'body', v_text,
      'url', '/centre/' || (select slug from public.centers where id = new.center_id)));
    insert into public.notifications (user_id, kind, title, body, url)
    select p.id, 'post', v_center, v_text, '/centre/' || (select slug from public.centers where id = new.center_id)
    from public.profiles p where p.center_id = new.center_id and p.is_active and p.id is distinct from new.submitted_by;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'declined' and new.submitted_by is not null then
    insert into public.notifications (user_id, kind, title, body, url)
    values (new.submitted_by, 'post', 'Proposition non retenue', coalesce(new.moderation_message, v_text), '/profil/propositions');
    insert into public.notification_queue (kind, payload)
    values ('push_center'::public.notification_kind, jsonb_build_object(
      'post_id', new.id, 'user_id', new.submitted_by, 'title', 'Proposition non retenue',
      'body', coalesce(new.moderation_message, v_text), 'url', '/profil/propositions'));
  end if;
  return new;
end $$;
drop trigger if exists posts_notify_center on public.posts;
create trigger posts_notify_center after update on public.posts for each row execute function public.notify_center_post();

-- Le trigger de notification départementale ignore les posts de centre
create or replace function public.enqueue_post_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_text text;
begin
  if new.scope <> 'departmental' then return new; end if;
  if new.status = 'published' and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    v_text := coalesce(new.title, left(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g'), 120));
    insert into public.notification_queue (kind, payload)
    values (
      (case when new.pinned_at is not null then 'push_pinned' else 'push_category' end)::public.notification_kind,
      jsonb_build_object(
        'post_id', new.id,
        'slug', new.slug,
        'title', case when new.pinned_at is not null then 'À la une' else 'Nouvelle publication' end,
        'body', v_text,
        'url', '/post/' || new.slug
      )
    );
    perform public.notify_all('post', case when new.pinned_at is not null then 'À la une' else 'Nouvelle publication' end, v_text, '/post/' || new.slug, new.author_id);
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Événements de centre
-- -----------------------------------------------------------------------------
alter table public.events
  add column if not exists center_id uuid references public.centers (id) on delete cascade,
  add column if not exists submitted_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists moderation_message text;
alter table public.events drop constraint if exists events_status;
alter table public.events add constraint events_status check (status in ('draft', 'published', 'pending', 'declined'));
create index if not exists events_center_idx on public.events (center_id, starts_at) where center_id is not null;

create or replace function public.events_center_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_editor() then
    if tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('published', 'declined') then
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    end if;
    return new;
  end if;
  if new.center_id is null or not public.is_referent_of(new.center_id) then
    raise exception 'ACCES_REFUSE: événement réservé à vos centres' using errcode = '42501';
  end if;
  if new.status <> 'pending' then
    raise exception 'ACCES_REFUSE: seule une proposition en attente est possible' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.submitted_by := auth.uid(); new.author_id := auth.uid();
  elsif old.status <> 'pending' or old.submitted_by is distinct from auth.uid() then
    raise exception 'ACCES_REFUSE: proposition déjà traitée' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists events_center_guard on public.events;
create trigger events_center_guard before insert or update on public.events for each row execute function public.events_center_guard();

-- Agenda départemental : seuls les événements sans centre (les événements de
-- centre s'affichent sur la page du centre)
-- (fetchAgenda filtre center_id is null côté application)

-- -----------------------------------------------------------------------------
-- 6. Mise à jour proposée d'un centre par un référent (couverture, présentation)
-- -----------------------------------------------------------------------------
create or replace function public.centers_referent_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_editor() then return new; end if;
  if not public.is_referent_of(old.id) then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  -- Seules les colonnes « en attente » peuvent bouger
  if new.name is distinct from old.name or new.slug is distinct from old.slug or new.type is distinct from old.type
     or new.grouping_id is distinct from old.grouping_id or new.address is distinct from old.address
     or new.postal_code is distinct from old.postal_code or new.city is distinct from old.city
     or new.lat is distinct from old.lat or new.lng is distinct from old.lng or new.phone is distinct from old.phone
     or new.email is distinct from old.email or new.cover_media_id is distinct from old.cover_media_id
     or new.presentation is distinct from old.presentation or new.chief_id is distinct from old.chief_id
     or new.displayed_headcount is distinct from old.displayed_headcount or new.is_active is distinct from old.is_active
     or new.sort_order is distinct from old.sort_order then
    raise exception 'ACCES_REFUSE: proposez une mise à jour, la validation revient au service communication' using errcode = '42501';
  end if;
  new.pending_by := auth.uid();
  new.pending_at := now();
  return new;
end $$;
drop trigger if exists centers_referent_guard on public.centers;
create trigger centers_referent_guard before update on public.centers for each row execute function public.centers_referent_guard();

-- -----------------------------------------------------------------------------
-- 7. Préférences et consultations
-- -----------------------------------------------------------------------------
alter table public.user_settings add column if not exists push_center boolean not null default true;

create table public.page_views (
  kind       text not null check (kind in ('center', 'directory')),
  target_id  uuid,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null default current_date,
  primary key (kind, user_id, day, target_id)
);
alter table public.page_views alter column target_id set default '00000000-0000-0000-0000-000000000000';

-- -----------------------------------------------------------------------------
-- 8. Promotion au fil (éditeur) : post départemental distinct, lié
-- -----------------------------------------------------------------------------
create or replace function public.promote_center_post(p_post_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare src public.posts; v_center text; v_new uuid;
begin
  if not public.is_editor() then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  select * into src from public.posts where id = p_post_id and scope = 'center' and status = 'published' and deleted_at is null;
  if not found then
    raise exception 'INTROUVABLE: post de centre publié attendu' using errcode = 'P0022';
  end if;
  if exists (select 1 from public.posts where promoted_from_id = p_post_id and deleted_at is null) then
    raise exception 'DEJA_PROMU' using errcode = 'P0023';
  end if;
  select name into v_center from public.centers where id = src.center_id;
  insert into public.posts (type, title, location, body, tags, author_id, author_display, status, comments_enabled, center_id, scope, promoted_from_id, published_at)
  values (src.type, src.title, 'Vie des centres — ' || v_center, src.body,
          array_append(array_remove(src.tags, 'Dans les coulisses'), 'Dans les coulisses'),
          auth.uid(), 'service_com', 'published', src.comments_enabled, src.center_id, 'departmental', p_post_id, now())
  returning id into v_new;
  insert into public.post_media (post_id, media_id, position, alt)
  select v_new, pm.media_id, pm.position, pm.alt from public.post_media pm where pm.post_id = p_post_id;
  return v_new;
end $$;
revoke all on function public.promote_center_post(uuid) from public;
grant execute on function public.promote_center_post(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Sérialisation et fil départemental étanche
-- -----------------------------------------------------------------------------
create or replace function public.post_to_json(p public.posts)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id',               p.id,
    'type',             p.type,
    'slug',             p.slug,
    'title',            p.title,
    'location',         p.location,
    'scope',            p.scope,
    'center_id',        p.center_id,
    'submitted_by',     p.submitted_by,
    'moderation_message', p.moderation_message,
    'promoted_from_id', p.promoted_from_id,
    'excerpt',          p.excerpt,
    'body',             p.body,
    'tags',             to_jsonb(p.tags),
    'status',           p.status,
    'published_at',     p.published_at,
    'scheduled_at',     p.scheduled_at,
    'pinned_at',        p.pinned_at,
    'comments_enabled', p.comments_enabled,
    'author_display',   p.author_display,
    'category', (
      select jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
      from public.categories c where c.id = p.category_id
    ),
    'center', (
      select jsonb_build_object('id', ce.id, 'name', ce.name, 'slug', ce.slug)
      from public.centers ce where ce.id = p.center_id
    ),
    'author', (
      select jsonb_build_object(
        'name', case when p.author_display = 'service_com' then 'Service Communication'
                     else trim(pr.first_name || ' ' || pr.last_name) end,
        'avatar_key', case when p.author_display = 'service_com' then null else pr.avatar_key end
      )
      from public.profiles pr where pr.id = p.author_id
    ),
    'cover', (
      select jsonb_build_object('id', m.id, 'kind', m.kind, 'variants', m.variants,
                                'poster_key', m.poster_key, 'width', m.width, 'height', m.height,
                                'alt', m.alt, 'mime', m.mime, 'original_key', m.original_key)
      from public.media m where m.id = p.cover_media_id and m.status = 'ready'
    ),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'variants', m.variants, 'poster_key', m.poster_key,
        'width', m.width, 'height', m.height, 'alt', coalesce(pm.alt, m.alt), 'mime', m.mime,
        'original_key', m.original_key, 'duration_s', m.duration_s, 'position', pm.position
      ) order by pm.position)
      from public.post_media pm join public.media m on m.id = pm.media_id
      where pm.post_id = p.id and m.status = 'ready'
    ), '[]'::jsonb),
    'poll', (
      select jsonb_build_object(
        'question', pl.question,
        'closes_at', pl.closes_at,
        'total_votes', public.poll_total_votes(pl.post_id),
        'my_option_id', (select v.option_id from public.poll_votes v where v.poll_id = pl.post_id and v.user_id = auth.uid()),
        'options', (
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'label', o.label, 'position', o.position,
            'votes', public.poll_option_votes(o.id)
          ) order by o.position)
          from public.poll_options o where o.poll_id = pl.post_id
        )
      )
      from public.polls pl where pl.post_id = p.id
    ),
    'reaction_counts', (
      select coalesce(jsonb_object_agg(r.kind, r.n), '{}'::jsonb)
      from (select kind, count(*) n from public.reactions where post_id = p.id group by kind) r
    ),
    'comment_count', (
      select count(*) from public.comments c where c.post_id = p.id and c.status = 'visible'
    ),
    'my_reaction', (
      select r.kind from public.reactions r where r.post_id = p.id and r.user_id = auth.uid()
    ),
    'is_bookmarked', exists (
      select 1 from public.bookmarks b where b.post_id = p.id and b.user_id = auth.uid()
    )
  )
$$;

create or replace function public.get_feed(
  p_limit        int default 10,
  p_cursor_at    timestamptz default null,
  p_cursor_id    uuid default null,
  p_category     text default null,   -- slug
  p_center       text default null,   -- slug
  p_q            text default null,
  p_bookmarked   boolean default false,
  p_tag          text default null
)
returns setof jsonb language plpgsql as $$
begin
  perform public.publish_scheduled();

  return query
  select public.post_to_json(p)
  from public.posts p
  left join public.categories c on c.id = p.category_id
  left join public.centers ce on ce.id = p.center_id
  where p.status = 'published' and p.deleted_at is null and p.published_at <= now()
    and p.scope = 'departmental'
    and (p_category is null or c.slug = p_category)
    and (p_center is null or ce.slug = p_center)
    and (p_tag is null or p_tag = any (p.tags))
    and (p_q is null or p_q = '' or p.search @@ websearch_to_tsquery('french', p_q))
    and (not p_bookmarked or exists (
      select 1 from public.bookmarks b where b.post_id = p.id and b.user_id = auth.uid()))
    and (p_cursor_at is null
         or p.published_at < p_cursor_at
         or (p.published_at = p_cursor_at and p.id < p_cursor_id))
  order by p.published_at desc, p.id desc
  limit greatest(1, least(p_limit, 50));
end $$;

create or replace function public.get_pinned_posts()
returns setof jsonb language sql stable as $$
  select public.post_to_json(p)
  from public.posts p
  where p.status = 'published' and p.deleted_at is null and p.pinned_at is not null and p.published_at <= now()
    and p.scope = 'departmental'
  order by p.pinned_at desc
  limit 3
$$;

-- -----------------------------------------------------------------------------
-- 10. RLS
-- -----------------------------------------------------------------------------
alter table public.groupings enable row level security;
alter table public.services enable row level security;
alter table public.center_referents enable row level security;
alter table public.center_follows enable row level security;
alter table public.page_views enable row level security;

create policy groupings_select on public.groupings for select to authenticated using (true);
create policy groupings_editor on public.groupings for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy services_select on public.services for select to authenticated using (true);
create policy services_editor on public.services for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy center_referents_select on public.center_referents for select to authenticated using (true);
create policy center_referents_editor on public.center_referents for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy center_follows_own on public.center_follows for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy page_views_own on public.page_views for insert to authenticated with check (user_id = auth.uid());
create policy page_views_select on public.page_views for select to authenticated using (user_id = auth.uid() or public.is_editor());

-- Centres : lecture de tous ; référent : mise à jour « en attente » (trigger) ; éditeur : tout
drop policy if exists centers_select on public.centers;
create policy centers_select on public.centers for select to authenticated using (true);
create policy centers_editor on public.centers for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy centers_referent_update on public.centers for update to authenticated
  using (public.is_referent_of(id)) with check (public.is_referent_of(id));

-- Posts : propositions du référent (en plus des politiques existantes)
create policy posts_select_own_pending on public.posts for select to authenticated
  using (submitted_by = auth.uid() and deleted_at is null);
create policy posts_referent_insert on public.posts for insert to authenticated
  with check (scope = 'center' and status = 'pending' and public.is_referent_of(center_id));
create policy posts_referent_update on public.posts for update to authenticated
  using (scope = 'center' and status = 'pending' and submitted_by = auth.uid())
  with check (scope = 'center' and status = 'pending' and submitted_by = auth.uid());
create policy posts_referent_delete on public.posts for delete to authenticated
  using (scope = 'center' and status = 'pending' and submitted_by = auth.uid());

-- Médias rattachés à une proposition
create policy post_media_referent on public.post_media for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_media.post_id and p.scope = 'center' and p.status = 'pending' and p.submitted_by = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_media.post_id and p.scope = 'center' and p.status = 'pending' and p.submitted_by = auth.uid()));
-- Un référent peut envoyer des vidéos (les agents restent limités aux images)
create policy media_insert_referent_video on public.media for insert to authenticated
  with check (owner_id = auth.uid() and kind = 'video' and public.is_referent());
-- Lecture des médias d'une proposition par les éditeurs : déjà couverte (is_editor)

-- Événements : propositions de centre
create policy events_select_own_pending on public.events for select to authenticated
  using (submitted_by = auth.uid() and deleted_at is null);
create policy events_referent_insert on public.events for insert to authenticated
  with check (center_id is not null and status = 'pending' and public.is_referent_of(center_id));
create policy events_referent_update on public.events for update to authenticated
  using (status = 'pending' and submitted_by = auth.uid()) with check (status = 'pending' and submitted_by = auth.uid());

-- Le rôle referent est un lecteur pour tout le reste (aucune politique ne teste le rôle « reader » explicitement)

-- Les vues héritent des politiques de posts (security_invoker)
alter view public.center_posts set (security_invoker = true);

-- -----------------------------------------------------------------------------
-- 11. Statistiques centres (Studio)
-- -----------------------------------------------------------------------------
create or replace function public.studio_center_stats(p_days int default 90)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
begin
  if not public.is_editor() then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  return jsonb_build_object(
    'referents', (select count(distinct profile_id) from public.center_referents where is_active),
    'centers_with_referent', (select count(distinct center_id) from public.center_referents where is_active),
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m.month, 'received', m.received, 'published', m.published, 'declined', m.declined) order by m.month)
      from (
        select to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
               count(*) as received,
               count(*) filter (where status = 'published') as published,
               count(*) filter (where status = 'declined') as declined
        from public.posts where scope = 'center' and created_at > v_since group by 1
      ) m
    ), '[]'::jsonb),
    'silent_centers', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'last', (select max(published_at) from public.posts p where p.center_id = c.id and p.scope = 'center' and p.status = 'published')) order by c.name)
      from public.centers c
      where c.is_active and c.type in ('cis', 'cs', 'cpi')
        and not exists (select 1 from public.posts p where p.center_id = c.id and p.scope = 'center' and p.status = 'published' and p.published_at > now() - interval '60 days')
    ), '[]'::jsonb),
    'center_page_views', (select count(*) from public.page_views where kind = 'center' and day > (v_since)::date),
    'directory_views', (select count(*) from public.page_views where kind = 'directory' and day > (v_since)::date)
  );
end $$;
revoke all on function public.studio_center_stats(int) from public;
grant execute on function public.studio_center_stats(int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 12. Données de démonstration : les centres existants deviennent des CIS
-- -----------------------------------------------------------------------------
update public.centers set type = 'cis' where type is null;
