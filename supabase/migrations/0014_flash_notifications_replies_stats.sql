-- =============================================================================
-- 0014 — Flash urgent, notifications dans l'app, réponses aux stories, statistiques
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Flash : message prioritaire en bandeau, push forcé (préférences ignorées)
-- -----------------------------------------------------------------------------
create table public.flashes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  level       text not null default 'urgent',
  url         text,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint flashes_title_len check (char_length(title) between 1 and 120),
  constraint flashes_body_len  check (body is null or char_length(body) <= 600),
  constraint flashes_level     check (level in ('info', 'urgent')),
  constraint flashes_range     check (ends_at > starts_at)
);
create index flashes_active_idx on public.flashes (ends_at) where deleted_at is null;
create trigger audit_flashes after insert or update or delete on public.flashes for each row execute function public.audit_trigger();
alter table public.flashes enable row level security;
create policy flashes_select on public.flashes for select to authenticated
  using ((deleted_at is null and starts_at <= now() and ends_at > now()) or public.is_editor());
create policy flashes_editor on public.flashes for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

alter type public.notification_kind add value if not exists 'push_flash';

-- -----------------------------------------------------------------------------
-- 2. Notifications dans l'app (cloche) : une ligne par destinataire
-- -----------------------------------------------------------------------------
create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  url         text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  constraint notifications_kind check (kind in ('post', 'flash', 'reply', 'event', 'story_reply'))
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id = auth.uid());

/** Diffuse une notification à tous les agents actifs (sauf éventuellement un). */
create or replace function public.notify_all(p_kind text, p_title text, p_body text, p_url text, p_except uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, url)
  select p.id, p_kind, p_title, p_body, p_url
  from public.profiles p
  where p.is_active and (p_except is null or p.id <> p_except)
$$;
revoke all on function public.notify_all(text, text, text, text, uuid) from public;

/** Marque toutes les notifications lues ; renvoie le nombre mis à jour. */
create or replace function public.mark_notifications_read()
returns int language plpgsql as $$
declare v int;
begin
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
  get diagnostics v = row_count;
  return v;
end $$;
revoke all on function public.mark_notifications_read() from public;
grant execute on function public.mark_notifications_read() to authenticated;

/** Purge : notifications lues de plus de 30 jours, non lues de plus de 90 jours. */
create or replace function public.purge_notifications()
returns void language sql security definer set search_path = public as $$
  delete from public.notifications
  where (read_at is not null and read_at < now() - interval '30 days')
     or created_at < now() - interval '90 days'
$$;
revoke all on function public.purge_notifications() from public;
grant execute on function public.purge_notifications() to service_role;

-- Publication mise en ligne : file push (existant) + notification à chaque agent
create or replace function public.enqueue_post_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_text text;
begin
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

-- Flash créé : push forcé + notification à tous
create or replace function public.enqueue_flash()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.deleted_at is null and new.starts_at <= now() + interval '1 minute' then
    insert into public.notification_queue (kind, payload)
    values ('push_flash'::public.notification_kind, jsonb_build_object(
      'flash_id', new.id,
      'title', case when new.level = 'urgent' then '⚠️ ' || new.title else new.title end,
      'body', coalesce(new.body, ''),
      'url', coalesce(new.url, '/')
    ));
    perform public.notify_all('flash', new.title, new.body, coalesce(new.url, '/'), null);
  end if;
  return new;
end $$;
create trigger flashes_enqueue after insert on public.flashes for each row execute function public.enqueue_flash();

-- Réponse à un commentaire : l'auteur du commentaire parent est prévenu
create or replace function public.notify_comment_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_parent_user uuid;
  v_slug text;
  v_name text;
begin
  if new.parent_id is null then return new; end if;
  select c.user_id into v_parent_user from public.comments c where c.id = new.parent_id;
  if v_parent_user is null or v_parent_user = new.user_id then return new; end if;
  select p.slug into v_slug from public.posts p where p.id = new.post_id;
  select trim(pr.first_name || ' ' || pr.last_name) into v_name from public.profiles pr where pr.id = new.user_id;
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_parent_user, 'reply', coalesce(nullif(v_name, ''), 'Un agent') || ' a répondu à votre commentaire', left(new.body, 140), '/post/' || v_slug);
  return new;
end $$;
create trigger comments_notify_reply after insert on public.comments for each row execute function public.notify_comment_reply();

-- Rappel d'événement (la veille) : appelé par l'entretien quotidien
create or replace function public.notify_events_tomorrow()
returns int language plpgsql security definer set search_path = public as $$
declare v int := 0; r record;
begin
  for r in
    select e.id, e.title, e.location, e.starts_at
    from public.events e
    where e.status = 'published' and e.deleted_at is null
      and (e.starts_at at time zone 'Europe/Paris')::date = ((now() at time zone 'Europe/Paris')::date + 1)
      and not exists (select 1 from public.notifications n where n.kind = 'event' and n.url = '/agenda#' || e.id::text)
  loop
    perform public.notify_all('event', 'Demain : ' || r.title, coalesce(r.location, ''), '/agenda#' || r.id::text, null);
    v := v + 1;
  end loop;
  return v;
end $$;
revoke all on function public.notify_events_tomorrow() from public;
grant execute on function public.notify_events_tomorrow() to service_role;

-- -----------------------------------------------------------------------------
-- 3. Réponses aux stories (emoji ou message, vers le service communication)
-- -----------------------------------------------------------------------------
create table public.story_replies (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null references public.stories (id) on delete cascade,
  user_id     uuid references public.profiles (id) on delete set null,
  emoji       text,
  message     text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  constraint story_replies_content check (emoji is not null or message is not null),
  constraint story_replies_emoji_len check (emoji is null or char_length(emoji) <= 8),
  constraint story_replies_msg_len check (message is null or char_length(message) <= 500)
);
create index story_replies_story_idx on public.story_replies (story_id, created_at desc);
create index story_replies_unread_idx on public.story_replies (read_at) where read_at is null;
alter table public.story_replies enable row level security;
create policy story_replies_insert on public.story_replies for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.stories s where s.id = story_id and s.status = 'published'));
create policy story_replies_select on public.story_replies for select to authenticated
  using (user_id = auth.uid() or public.is_editor());
create policy story_replies_editor on public.story_replies for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
create policy story_replies_delete_editor on public.story_replies for delete to authenticated using (public.is_editor());

-- Limitation : 30 réponses par heure et par agent
create or replace function public.story_replies_rate_limit()
returns trigger language plpgsql as $$
begin
  perform public.check_rate_limit('story_reply', 30, interval '1 hour');
  return new;
end $$;
create trigger story_replies_rate before insert on public.story_replies for each row execute function public.story_replies_rate_limit();

-- Nombre de réponses (éditeurs) dans story_to_json
create or replace function public.story_to_json(s public.stories)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id',              s.id,
    'series_id',       s.series_id,
    'series_title',    (select ss.title from public.story_series ss where ss.id = s.series_id),
    'status',          s.status,
    'overlay',         s.overlay,
    'display_seconds', s.display_seconds,
    'scheduled_at',    s.scheduled_at,
    'published_at',    s.published_at,
    'expires_at',      s.expires_at,
    'position',        s.position,
    'media',           (select public.media_to_json(m) from public.media m where m.id = s.media_id),
    'link_post',       (select jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title)
                        from public.posts p where p.id = s.link_post_id and p.status = 'published' and p.deleted_at is null),
    'seen',            exists (select 1 from public.story_views v where v.story_id = s.id and v.user_id = auth.uid()),
    'views',           (select count(*) from public.story_views v where v.story_id = s.id),
    'replies',         (select count(*) from public.story_replies r where r.story_id = s.id)
  )
$$;

-- -----------------------------------------------------------------------------
-- 4. Statistiques détaillées (Studio → Statistiques)
-- -----------------------------------------------------------------------------
create or replace function public.studio_post_stats(p_days int default 30)
returns jsonb language plpgsql as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
begin
  if not public.is_editor() then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'since', v_since,
    'agents', (select count(*) from public.profiles where is_active),
    'active_agents', (select count(distinct user_id) from public.post_views where first_viewed_at > v_since),
    'subscribers', (select count(distinct user_id) from public.push_subscriptions),
    'totals', jsonb_build_object(
      'posts',     (select count(*) from public.posts where status = 'published' and deleted_at is null and published_at > v_since),
      'views',     (select count(*) from public.post_views where first_viewed_at > v_since),
      'reactions', (select count(*) from public.reactions where created_at > v_since),
      'comments',  (select count(*) from public.comments where created_at > v_since and status = 'visible'),
      'bookmarks', (select count(*) from public.bookmarks where created_at > v_since),
      'story_views', (select count(*) from public.story_views where viewed_at > v_since),
      'push_sent', (select count(*) from public.notification_queue where status = 'sent' and sent_at > v_since and kind in ('push_pinned', 'push_category', 'push_flash'))
    ),
    'by_hour', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h.hour, 'views', h.views) order by h.hour)
      from (
        select extract(hour from first_viewed_at at time zone 'Europe/Paris')::int as hour, count(*) as views
        from public.post_views where first_viewed_at > v_since group by 1
      ) h
    ), '[]'::jsonb),
    'by_weekday', coalesce((
      select jsonb_agg(jsonb_build_object('dow', d.dow, 'views', d.views) order by d.dow)
      from (
        select extract(isodow from first_viewed_at at time zone 'Europe/Paris')::int as dow, count(*) as views
        from public.post_views where first_viewed_at > v_since group by 1
      ) d
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(t order by t.views desc, t.published_at desc)
      from (
        select p.id, p.slug, p.title, p.type, p.published_at,
               (select count(*) from public.post_views v where v.post_id = p.id) as views,
               (select count(*) from public.reactions r where r.post_id = p.id) as reactions,
               (select count(*) from public.comments c where c.post_id = p.id and c.status = 'visible') as comments,
               (select count(*) from public.bookmarks b where b.post_id = p.id) as bookmarks
        from public.posts p
        where p.status = 'published' and p.deleted_at is null and p.published_at > v_since
      ) t
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.studio_post_stats(int) from public;
grant execute on function public.studio_post_stats(int) to authenticated, service_role;
