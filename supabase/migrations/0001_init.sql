-- =============================================================================
-- Flash 62 — migration 0001 : schéma initial, rôles, RLS, triggers métier
-- =============================================================================
-- Conventions :
--   * toutes les tables sont dans le schéma public, RLS activée ;
--   * les helpers auth_role() / is_editor() / is_admin() sont SECURITY DEFINER
--     pour éviter la récursion RLS sur profiles ;
--   * les règles métier (3 épinglés max, un niveau de réponse, rate limiting,
--     audit) vivent dans des triggers, pas dans l'UI.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "unaccent";

-- -----------------------------------------------------------------------------
-- 1. Types énumérés
-- -----------------------------------------------------------------------------
create type public.user_role      as enum ('admin', 'editor', 'reader');
create type public.post_type      as enum ('photo', 'video', 'article', 'text', 'poll');
create type public.post_status    as enum ('draft', 'scheduled', 'published', 'archived');
create type public.author_display as enum ('service_com', 'agent');
create type public.media_kind     as enum ('image', 'video');
create type public.media_status   as enum ('uploading', 'processing', 'ready', 'failed');
create type public.reaction_kind  as enum ('clap', 'fire', 'heart', 'muscle');
create type public.comment_status as enum ('visible', 'hidden', 'deleted');
create type public.report_status  as enum ('open', 'resolved', 'dismissed');
create type public.story_status   as enum ('draft', 'scheduled', 'published', 'expired', 'archived');
create type public.notification_kind as enum ('push_pinned', 'push_category', 'email_digest');
create type public.queue_status   as enum ('pending', 'sent', 'failed');

-- -----------------------------------------------------------------------------
-- 2. Utilitaires génériques
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- array_to_string est STABLE ; un wrapper IMMUTABLE est nécessaire pour une
-- colonne générée tsvector.
create or replace function public.tags_to_text(p_tags text[])
returns text language sql immutable parallel safe as $$
  select coalesce(array_to_string(p_tags, ' '), '')
$$;

create or replace function public.slugify(p_text text)
returns text language sql immutable parallel safe as $$
  select trim(both '-' from regexp_replace(lower(unaccent(coalesce(p_text, ''))), '[^a-z0-9]+', '-', 'g'))
$$;

-- -----------------------------------------------------------------------------
-- 3. Référentiels administrés
-- -----------------------------------------------------------------------------
create table public.centers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('app_name',              '"Flash 62"'),
  ('allowed_email_domains', '["sdis62.fr"]'),
  ('digest_enabled',        'false'),
  ('digest_weekday',        '1'),
  ('digest_hour',           '7');

insert into public.categories (name, slug, sort_order) values
  ('Intervention',     'intervention',     10),
  ('Vie des centres',  'vie-des-centres',  20),
  ('Formation',        'formation',        30),
  ('RH',               'rh',               40),
  ('Sport',            'sport',            50),
  ('Cérémonie',        'ceremonie',        60),
  ('Prévention',       'prevention',       70),
  ('Divers',           'divers',           80);

-- -----------------------------------------------------------------------------
-- 4. Utilisateurs
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  first_name  text not null default '',
  last_name   text not null default '',
  center_id   uuid references public.centers (id) on delete set null,
  role        public.user_role not null default 'reader',
  avatar_key  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_first_name_len check (char_length(first_name) <= 60),
  constraint profiles_last_name_len  check (char_length(last_name)  <= 60)
);
create index profiles_center_idx on public.profiles (center_id);
create index profiles_role_idx   on public.profiles (role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_settings (
  user_id                   uuid primary key references public.profiles (id) on delete cascade,
  push_pinned               boolean not null default true,
  push_followed_categories  boolean not null default true,
  digest_email              boolean not null default true,
  theme                     text not null default 'system' check (theme in ('system', 'light', 'dark')),
  updated_at                timestamptz not null default now()
);
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

create table public.category_follows (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, category_id)
);

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---- Helpers d'autorisation (SECURITY DEFINER : lecture de profiles sans RLS)
create or replace function public.auth_role()
returns public.user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and is_active
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'admin', false)
$$;

create or replace function public.is_editor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() in ('editor', 'admin'), false)
$$;

create or replace function public.is_allowed_email(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.app_settings s,
         jsonb_array_elements_text(s.value) d(domain)
    where s.key = 'allowed_email_domains'
      and lower(split_part(p_email, '@', 2)) = lower(d.domain)
  )
$$;

revoke all on function public.auth_role()            from public;
revoke all on function public.is_admin()             from public;
revoke all on function public.is_editor()            from public;
revoke all on function public.is_allowed_email(text) from public;
grant execute on function public.auth_role()            to authenticated, service_role;
grant execute on function public.is_admin()             to authenticated, service_role;
grant execute on function public.is_editor()            to authenticated, service_role;
grant execute on function public.is_allowed_email(text) to anon, authenticated, service_role;

-- ---- Création automatique du profil, refus des domaines non autorisés
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_first text := coalesce(new.raw_user_meta_data ->> 'first_name', '');
  v_last  text := coalesce(new.raw_user_meta_data ->> 'last_name', '');
begin
  if not public.is_allowed_email(new.email) then
    raise exception 'DOMAINE_NON_AUTORISE: %', split_part(new.email, '@', 2)
      using errcode = 'P0001';
  end if;

  insert into public.profiles (id, email, first_name, last_name)
  values (new.id, lower(new.email), left(v_first, 60), left(v_last, 60));

  insert into public.user_settings (user_id) values (new.id);

  -- Miroir du rôle dans le JWT (app_metadata) pour le middleware et les clients natifs.
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                        || jsonb_build_object('role', 'reader', 'is_active', true)
  where id = new.id;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- Protection des champs sensibles du profil + synchro app_metadata
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email then
      raise exception 'MODIFICATION_INTERDITE: role, is_active et email sont réservés aux administrateurs'
        using errcode = '42501';
    end if;
  end if;

  if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                          || jsonb_build_object('role', new.role::text, 'is_active', new.is_active)
    where id = new.id;
  end if;

  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- -----------------------------------------------------------------------------
-- 5. Journal d'audit et rate limiting
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_actor_idx  on public.audit_log (actor_id, created_at desc);

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id text;
begin
  v_id := coalesce(
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id') else (to_jsonb(new) ->> 'id') end,
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'key') else (to_jsonb(new) ->> 'key') end
  );
  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_profiles   after update on public.profiles   for each row
  when (old.role is distinct from new.role or old.is_active is distinct from new.is_active)
  execute function public.audit_trigger();
create trigger audit_categories after insert or update or delete on public.categories for each row execute function public.audit_trigger();
create trigger audit_centers    after insert or update or delete on public.centers    for each row execute function public.audit_trigger();
create trigger audit_settings   after insert or update or delete on public.app_settings for each row execute function public.audit_trigger();

create table public.rate_limit_events (
  user_id     uuid not null,
  bucket      text not null,
  created_at  timestamptz not null default now()
);
create index rate_limit_events_idx on public.rate_limit_events (user_id, bucket, created_at desc);

-- Lève une exception si l'utilisateur courant dépasse p_max actions dans p_window.
create or replace function public.check_rate_limit(p_bucket text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    return;
  end if;
  select count(*) into v_count
  from public.rate_limit_events
  where user_id = auth.uid() and bucket = p_bucket and created_at > now() - p_window;

  if v_count >= p_max then
    raise exception 'LIMITE_ATTEINTE: trop d''actions (%), réessayez plus tard', p_bucket
      using errcode = 'P0002';
  end if;

  insert into public.rate_limit_events (user_id, bucket) values (auth.uid(), p_bucket);
end $$;

create or replace function public.purge_rate_limit_events()
returns void language sql security definer set search_path = public as $$
  delete from public.rate_limit_events where created_at < now() - interval '1 day'
$$;

-- -----------------------------------------------------------------------------
-- 6. Médias
-- -----------------------------------------------------------------------------
create table public.media (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete set null,
  kind          public.media_kind not null,
  status        public.media_status not null default 'uploading',
  mime          text not null,
  size_bytes    bigint not null check (size_bytes >= 0),
  original_key  text not null unique,
  variants      jsonb not null default '{}'::jsonb,   -- {thumb, medium, full} → clés S3 WebP
  poster_key    text,
  width         int,
  height        int,
  duration_s    numeric(8,2),
  alt           text not null default '',
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint media_alt_len check (char_length(alt) <= 300)
);
create index media_owner_idx  on public.media (owner_id);
create index media_status_idx on public.media (status);
create trigger media_set_updated_at before update on public.media for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. Posts
-- -----------------------------------------------------------------------------
create table public.posts (
  id               uuid primary key default gen_random_uuid(),
  type             public.post_type not null,
  slug             text not null unique,
  title            text,
  excerpt          text,
  body             text,
  category_id      uuid references public.categories (id) on delete set null,
  center_id        uuid references public.centers (id) on delete set null,
  tags             text[] not null default '{}',
  author_id        uuid references public.profiles (id) on delete set null,
  author_display   public.author_display not null default 'service_com',
  status           public.post_status not null default 'draft',
  scheduled_at     timestamptz,
  published_at     timestamptz,
  pinned_at        timestamptz,
  comments_enabled boolean not null default true,
  cover_media_id   uuid references public.media (id) on delete set null,
  search           tsvector generated always as (
                     setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
                     setweight(to_tsvector('french', coalesce(excerpt, '')), 'B') ||
                     setweight(to_tsvector('simple', public.tags_to_text(tags)), 'B') ||
                     setweight(to_tsvector('french', coalesce(body, '')), 'C')
                   ) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint posts_title_len   check (char_length(title)   <= 200),
  constraint posts_excerpt_len check (char_length(excerpt) <= 500),
  constraint posts_body_len    check (char_length(body)    <= 50000),
  constraint posts_tags_count  check (cardinality(tags)    <= 10),
  constraint posts_scheduled_needs_date check (status <> 'scheduled' or scheduled_at is not null),
  constraint posts_published_needs_date check (status <> 'published' or published_at is not null)
);
create index posts_feed_idx     on public.posts (status, published_at desc, id desc) where deleted_at is null;
create index posts_pinned_idx   on public.posts (pinned_at desc) where pinned_at is not null and deleted_at is null;
create index posts_category_idx on public.posts (category_id);
create index posts_center_idx   on public.posts (center_id);
create index posts_search_idx   on public.posts using gin (search);
create index posts_tags_idx     on public.posts using gin (tags);
create index posts_scheduled_idx on public.posts (scheduled_at) where status = 'scheduled';

create trigger posts_set_updated_at before update on public.posts for each row execute function public.set_updated_at();
create trigger audit_posts after insert or update or delete on public.posts for each row execute function public.audit_trigger();

-- Slug automatique + limite de 3 posts épinglés
create or replace function public.posts_before_write()
returns trigger language plpgsql as $$
declare
  v_base  text;
  v_slug  text;
  v_n     int := 0;
  v_pinned int;
begin
  if new.slug is null or new.slug = '' then
    v_base := public.slugify(coalesce(new.title, to_char(now(), 'YYYY-MM-DD') || '-' || new.type::text));
    if v_base = '' then v_base := new.type::text; end if;
    v_slug := v_base;
    while exists (select 1 from public.posts p where p.slug = v_slug and p.id <> new.id) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    end loop;
    new.slug := v_slug;
  end if;

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  if new.pinned_at is not null and (tg_op = 'INSERT' or old.pinned_at is null) then
    select count(*) into v_pinned
    from public.posts p
    where p.pinned_at is not null and p.deleted_at is null and p.id <> new.id;
    if v_pinned >= 3 then
      raise exception 'LIMITE_EPINGLES: 3 posts épinglés maximum' using errcode = 'P0003';
    end if;
  end if;

  return new;
end $$;

create trigger posts_before_write
  before insert or update on public.posts
  for each row execute function public.posts_before_write();

create table public.post_media (
  post_id    uuid not null references public.posts (id) on delete cascade,
  media_id   uuid not null references public.media (id) on delete cascade,
  position   int  not null default 0,
  alt        text,
  crop       jsonb,
  primary key (post_id, media_id),
  constraint post_media_alt_len check (char_length(alt) <= 300)
);
create index post_media_post_idx on public.post_media (post_id, position);

create or replace function public.post_media_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.post_media where post_id = new.post_id) >= 20 then
    raise exception 'LIMITE_MEDIAS: 20 images maximum par post' using errcode = 'P0004';
  end if;
  return new;
end $$;
create trigger post_media_limit before insert on public.post_media for each row execute function public.post_media_limit();

-- ---- Sondages
create table public.polls (
  post_id    uuid primary key references public.posts (id) on delete cascade,
  question   text not null check (char_length(question) between 1 and 300),
  closes_at  timestamptz
);

create table public.poll_options (
  id        uuid primary key default gen_random_uuid(),
  poll_id   uuid not null references public.polls (post_id) on delete cascade,
  label     text not null check (char_length(label) between 1 and 120),
  position  int  not null default 0
);
create index poll_options_poll_idx on public.poll_options (poll_id, position);

create table public.poll_votes (
  poll_id     uuid not null references public.polls (post_id) on delete cascade,
  option_id   uuid not null references public.poll_options (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (poll_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 8. Stories
-- -----------------------------------------------------------------------------
create table public.story_series (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 1 and 80),
  cover_media_id  uuid references public.media (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create table public.stories (
  id               uuid primary key default gen_random_uuid(),
  series_id        uuid not null references public.story_series (id) on delete cascade,
  media_id         uuid not null references public.media (id) on delete restrict,
  author_id        uuid references public.profiles (id) on delete set null,
  overlay          jsonb,                       -- {text, position, style}
  link_post_id     uuid references public.posts (id) on delete set null,
  display_seconds  int not null default 7 check (display_seconds between 3 and 15),
  status           public.story_status not null default 'draft',
  scheduled_at     timestamptz,
  published_at     timestamptz,
  expires_at       timestamptz,
  position         int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index stories_series_idx  on public.stories (series_id, position);
create index stories_active_idx  on public.stories (status, expires_at);
create trigger stories_set_updated_at before update on public.stories for each row execute function public.set_updated_at();
create trigger audit_stories after insert or update or delete on public.stories for each row execute function public.audit_trigger();

create or replace function public.stories_before_write()
returns trigger language plpgsql as $$
declare
  v_duration numeric;
  v_kind public.media_kind;
begin
  select duration_s, kind into v_duration, v_kind from public.media where id = new.media_id;
  if v_kind = 'video' and coalesce(v_duration, 0) > 30 then
    raise exception 'VIDEO_TROP_LONGUE: une story vidéo dure 30 s maximum' using errcode = 'P0005';
  end if;

  if new.status = 'published' then
    if new.published_at is null then new.published_at := now(); end if;
    if new.expires_at is null then new.expires_at := new.published_at + interval '48 hours'; end if;
  end if;
  return new;
end $$;
create trigger stories_before_write before insert or update on public.stories for each row execute function public.stories_before_write();

create table public.story_highlights (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 1 and 80),
  cover_media_id  uuid references public.media (id) on delete set null,
  position        int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create trigger audit_story_highlights after insert or update or delete on public.story_highlights for each row execute function public.audit_trigger();

create table public.story_highlight_items (
  highlight_id  uuid not null references public.story_highlights (id) on delete cascade,
  story_id      uuid not null references public.stories (id) on delete cascade,
  position      int not null default 0,
  primary key (highlight_id, story_id)
);

create table public.story_views (
  story_id   uuid not null references public.stories (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (story_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 9. Interactions
-- -----------------------------------------------------------------------------
create table public.reactions (
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        public.reaction_kind not null,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index reactions_post_idx on public.reactions (post_id, kind);

create or replace function public.reactions_rate_limit()
returns trigger language plpgsql as $$
begin
  perform public.check_rate_limit('reactions', 60, interval '1 minute');
  return new;
end $$;
create trigger reactions_rate_limit before insert or update on public.reactions for each row execute function public.reactions_rate_limit();

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid references public.profiles (id) on delete set null,   -- null = agent supprimé (RGPD)
  parent_id   uuid references public.comments (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  status      public.comment_status not null default 'visible',
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);
create index comments_post_idx   on public.comments (post_id, created_at);
create index comments_parent_idx on public.comments (parent_id);
create index comments_user_idx   on public.comments (user_id);

create or replace function public.comments_before_insert()
returns trigger language plpgsql as $$
declare
  v_parent public.comments%rowtype;
  v_enabled boolean;
begin
  select comments_enabled into v_enabled from public.posts where id = new.post_id;
  if not coalesce(v_enabled, false) then
    raise exception 'COMMENTAIRES_DESACTIVES' using errcode = 'P0006';
  end if;

  if new.parent_id is not null then
    select * into v_parent from public.comments where id = new.parent_id;
    if v_parent.id is null or v_parent.post_id <> new.post_id then
      raise exception 'PARENT_INVALIDE' using errcode = 'P0007';
    end if;
    if v_parent.parent_id is not null then
      raise exception 'UN_SEUL_NIVEAU: impossible de répondre à une réponse' using errcode = 'P0008';
    end if;
  end if;

  perform public.check_rate_limit('comments', 10, interval '5 minutes');
  return new;
end $$;
create trigger comments_before_insert before insert on public.comments for each row execute function public.comments_before_insert();

-- Un lecteur ne modifie que le corps de son propre commentaire (< 15 min) ;
-- un éditeur ne modifie que le statut.
create or replace function public.comments_before_update()
returns trigger language plpgsql as $$
begin
  if public.is_editor() and new.user_id is distinct from auth.uid() then
    if new.body is distinct from old.body then
      raise exception 'MODIFICATION_INTERDITE: un éditeur ne modifie pas le texte d''un agent' using errcode = '42501';
    end if;
  else
    if new.status is distinct from old.status
       or new.post_id is distinct from old.post_id
       or new.parent_id is distinct from old.parent_id
       or new.user_id is distinct from old.user_id then
      raise exception 'MODIFICATION_INTERDITE' using errcode = '42501';
    end if;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger comments_before_update before update on public.comments for each row execute function public.comments_before_update();
create trigger audit_comments after update on public.comments for each row
  when (old.status is distinct from new.status)
  execute function public.audit_trigger();

create table public.comment_reports (
  id           uuid primary key default gen_random_uuid(),
  comment_id   uuid not null references public.comments (id) on delete cascade,
  reporter_id  uuid references public.profiles (id) on delete set null,
  reason       text not null check (char_length(reason) between 1 and 500),
  status       public.report_status not null default 'open',
  resolved_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index comment_reports_status_idx on public.comment_reports (status, created_at desc);

create or replace function public.comment_reports_rate_limit()
returns trigger language plpgsql as $$
begin
  perform public.check_rate_limit('reports', 5, interval '1 hour');
  return new;
end $$;
create trigger comment_reports_rate_limit before insert on public.comment_reports for each row execute function public.comment_reports_rate_limit();

create table public.bookmarks (
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index bookmarks_user_idx on public.bookmarks (user_id, created_at desc);

create table public.post_views (
  post_id          uuid not null references public.posts (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  first_viewed_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 10. File de notifications
-- -----------------------------------------------------------------------------
create table public.notification_queue (
  id          bigint generated always as identity primary key,
  kind        public.notification_kind not null,
  payload     jsonb not null,
  status      public.queue_status not null default 'pending',
  attempts    int not null default 0,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  error       text
);
create index notification_queue_pending_idx on public.notification_queue (created_at) where status = 'pending';

-- -----------------------------------------------------------------------------
-- 11. RGPD : export et anonymisation
-- -----------------------------------------------------------------------------
create or replace function public.export_user_data(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile',     (select to_jsonb(p) from public.profiles p where p.id = p_user_id),
    'settings',    (select to_jsonb(s) from public.user_settings s where s.user_id = p_user_id),
    'follows',     (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.category_follows f where f.user_id = p_user_id),
    'reactions',   (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.reactions r where r.user_id = p_user_id),
    'comments',    (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.comments c where c.user_id = p_user_id),
    'reports',     (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.comment_reports c where c.reporter_id = p_user_id),
    'bookmarks',   (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.bookmarks b where b.user_id = p_user_id),
    'poll_votes',  (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.poll_votes v where v.user_id = p_user_id),
    'post_views',  (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.post_views v where v.user_id = p_user_id),
    'story_views', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.story_views v where v.user_id = p_user_id)
  );
end $$;

-- Anonymise puis supprime le profil ; la suppression du compte auth.users est
-- faite par l'API admin (service role) après appel de cette fonction.
create or replace function public.anonymize_user_data(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  update public.comments set user_id = null where user_id = p_user_id;
  update public.comment_reports set reporter_id = null where reporter_id = p_user_id;
  delete from public.reactions        where user_id = p_user_id;
  delete from public.bookmarks        where user_id = p_user_id;
  delete from public.poll_votes       where user_id = p_user_id;
  delete from public.post_views       where user_id = p_user_id;
  delete from public.story_views      where user_id = p_user_id;
  delete from public.category_follows where user_id = p_user_id;
  delete from public.push_subscriptions where user_id = p_user_id;
  delete from public.user_settings    where user_id = p_user_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'anonymize', 'profiles', p_user_id::text);
  delete from public.profiles where id = p_user_id;
end $$;

revoke all on function public.export_user_data(uuid)    from public;
revoke all on function public.anonymize_user_data(uuid) from public;
grant execute on function public.export_user_data(uuid)    to authenticated, service_role;
grant execute on function public.anonymize_user_data(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 12. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.centers               enable row level security;
alter table public.categories            enable row level security;
alter table public.app_settings          enable row level security;
alter table public.profiles              enable row level security;
alter table public.user_settings         enable row level security;
alter table public.category_follows      enable row level security;
alter table public.push_subscriptions    enable row level security;
alter table public.audit_log             enable row level security;
alter table public.rate_limit_events     enable row level security;
alter table public.media                 enable row level security;
alter table public.posts                 enable row level security;
alter table public.post_media            enable row level security;
alter table public.polls                 enable row level security;
alter table public.poll_options          enable row level security;
alter table public.poll_votes            enable row level security;
alter table public.story_series          enable row level security;
alter table public.stories               enable row level security;
alter table public.story_highlights      enable row level security;
alter table public.story_highlight_items enable row level security;
alter table public.story_views           enable row level security;
alter table public.reactions             enable row level security;
alter table public.comments              enable row level security;
alter table public.comment_reports       enable row level security;
alter table public.bookmarks             enable row level security;
alter table public.post_views            enable row level security;
alter table public.notification_queue    enable row level security;

-- Référentiels : lecture par tout utilisateur connecté, écriture admin
create policy centers_select on public.centers for select to authenticated using (true);
create policy centers_admin  on public.centers for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy categories_select on public.categories for select to authenticated using (true);
create policy categories_admin  on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy app_settings_select on public.app_settings for select to authenticated using (true);
create policy app_settings_admin  on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profils
create policy profiles_select on public.profiles for select to authenticated
  using (is_active or id = auth.uid() or public.is_editor());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Préférences, abonnements : lignes propres uniquement
create policy user_settings_own on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_settings_admin_select on public.user_settings for select to authenticated using (public.is_admin());

create policy category_follows_own on public.category_follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Audit : lecture admin, éditeurs voient leurs propres actions ; aucune écriture directe
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_admin() or (public.is_editor() and actor_id = auth.uid()));

-- rate_limit_events, notification_queue : aucune politique → accès service_role uniquement

-- Médias
create policy media_select on public.media for select to authenticated
  using (
    public.is_editor()
    or owner_id = auth.uid()
    or exists (
      select 1 from public.post_media pm
      join public.posts p on p.id = pm.post_id
      where pm.media_id = media.id and p.status = 'published' and p.deleted_at is null
    )
    or exists (
      select 1 from public.posts p
      where p.cover_media_id = media.id and p.status = 'published' and p.deleted_at is null
    )
    or exists (
      select 1 from public.stories s
      where s.media_id = media.id and (
        (s.status = 'published' and s.expires_at > now())
        or exists (
          select 1 from public.story_highlight_items hi
          join public.story_highlights h on h.id = hi.highlight_id
          where hi.story_id = s.id and h.is_active
        )
      )
    )
    or exists (select 1 from public.story_series ss where ss.cover_media_id = media.id)
    or exists (select 1 from public.story_highlights h where h.cover_media_id = media.id and h.is_active)
  );
create policy media_editor on public.media for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

-- Posts
create policy posts_select_published on public.posts for select to authenticated
  using (status = 'published' and published_at <= now() and deleted_at is null);
create policy posts_editor on public.posts for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create policy post_media_select on public.post_media for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_media.post_id));  -- hérite de la RLS de posts
create policy post_media_editor on public.post_media for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create policy polls_select on public.polls for select to authenticated
  using (exists (select 1 from public.posts p where p.id = polls.post_id));
create policy polls_editor on public.polls for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create policy poll_options_select on public.poll_options for select to authenticated
  using (exists (select 1 from public.polls p where p.post_id = poll_options.poll_id));
create policy poll_options_editor on public.poll_options for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create policy poll_votes_select_own on public.poll_votes for select to authenticated
  using (user_id = auth.uid() or public.is_editor());
create policy poll_votes_insert on public.poll_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.polls pl
      join public.posts p on p.id = pl.post_id
      where pl.post_id = poll_votes.poll_id
        and p.status = 'published' and p.deleted_at is null
        and (pl.closes_at is null or pl.closes_at > now())
    )
    and exists (select 1 from public.poll_options o where o.id = poll_votes.option_id and o.poll_id = poll_votes.poll_id)
  );

-- Stories
create policy story_series_select on public.story_series for select to authenticated using (true);
create policy story_series_editor on public.story_series for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create policy stories_select on public.stories for select to authenticated
  using (
    public.is_editor()
    or (status = 'published' and published_at <= now() and expires_at > now())
    or exists (
      select 1 from public.story_highlight_items hi
      join public.story_highlights h on h.id = hi.highlight_id
      where hi.story_id = stories.id and h.is_active
    )
  );
create policy stories_editor on public.stories for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create policy story_highlights_select on public.story_highlights for select to authenticated
  using (is_active or public.is_editor());
create policy story_highlights_editor on public.story_highlights for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create policy story_highlight_items_select on public.story_highlight_items for select to authenticated
  using (exists (select 1 from public.story_highlights h where h.id = story_highlight_items.highlight_id));
create policy story_highlight_items_editor on public.story_highlight_items for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create policy story_views_insert_own on public.story_views for insert to authenticated
  with check (user_id = auth.uid());
create policy story_views_select on public.story_views for select to authenticated
  using (user_id = auth.uid() or public.is_editor());

-- Réactions, favoris, vues : lignes propres ; lecture agrégée par fonctions (lot b)
create policy reactions_select on public.reactions for select to authenticated using (true);
create policy reactions_own on public.reactions for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = reactions.post_id and p.status = 'published' and p.deleted_at is null)
  );

create policy bookmarks_own on public.bookmarks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy post_views_insert_own on public.post_views for insert to authenticated
  with check (user_id = auth.uid());
create policy post_views_select on public.post_views for select to authenticated
  using (user_id = auth.uid() or public.is_editor());

-- Commentaires
create policy comments_select on public.comments for select to authenticated
  using (
    public.is_editor()
    or (status = 'visible' and exists (select 1 from public.posts p where p.id = comments.post_id))
  );
create policy comments_insert on public.comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = comments.post_id and p.status = 'published' and p.deleted_at is null)
  );
create policy comments_update_own on public.comments for update to authenticated
  using (user_id = auth.uid() and created_at > now() - interval '15 minutes')
  with check (user_id = auth.uid());
create policy comments_moderate on public.comments for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
create policy comments_delete_admin on public.comments for delete to authenticated
  using (public.is_admin());

create policy comment_reports_insert on public.comment_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy comment_reports_editor on public.comment_reports for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

-- -----------------------------------------------------------------------------
-- 13. Droits par défaut
-- -----------------------------------------------------------------------------
revoke all on public.rate_limit_events  from anon, authenticated;
revoke all on public.notification_queue from anon, authenticated;
revoke all on public.audit_log          from anon;
grant select on public.audit_log to authenticated;
