-- =============================================================================
-- ATLAS — migration 0003 : fil d'actualités, interactions, statistiques studio
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Publication des contenus programmés (appelée à la lecture du fil et par
--    pg_cron plus tard). SECURITY DEFINER : ne dépend pas de la RLS du lecteur.
-- -----------------------------------------------------------------------------
create or replace function public.publish_scheduled()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.posts
  set status = 'published', published_at = scheduled_at
  where status = 'scheduled' and scheduled_at <= now() and deleted_at is null;

  update public.stories
  set status = 'published', published_at = scheduled_at,
      expires_at = coalesce(expires_at, scheduled_at + interval '48 hours')
  where status = 'scheduled' and scheduled_at <= now();

  update public.stories
  set status = 'expired'
  where status = 'published' and expires_at <= now();
end $$;
revoke all on function public.publish_scheduled() from public;
grant execute on function public.publish_scheduled() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Sérialisation d'un post (format unique fil / page / studio)
--    SECURITY INVOKER : respecte la RLS de l'appelant.
-- -----------------------------------------------------------------------------
create or replace function public.post_to_json(p public.posts)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id',               p.id,
    'type',             p.type,
    'slug',             p.slug,
    'title',            p.title,
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
        'total_votes', (select count(*) from public.poll_votes v where v.poll_id = pl.post_id),
        'my_option_id', (select v.option_id from public.poll_votes v where v.poll_id = pl.post_id and v.user_id = auth.uid()),
        'options', (
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'label', o.label, 'position', o.position,
            'votes', (select count(*) from public.poll_votes v where v.option_id = o.id)
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

-- -----------------------------------------------------------------------------
-- 3. Fil paginé par curseur (published_at, id), filtres, recherche plein texte
-- -----------------------------------------------------------------------------
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
  where p.status = 'published' and p.deleted_at is null and p.published_at <= now()
    and p.pinned_at is not null
  order by p.pinned_at desc
  limit 3
$$;

create or replace function public.get_post(p_slug text)
returns jsonb language sql stable as $$
  select public.post_to_json(p) from public.posts p
  where p.slug = p_slug and p.deleted_at is null
  limit 1
$$;

-- Pour le studio : un post par id, quel que soit son statut (RLS éditeur)
create or replace function public.get_post_by_id(p_id uuid)
returns jsonb language sql stable as $$
  select public.post_to_json(p) from public.posts p where p.id = p_id limit 1
$$;

-- -----------------------------------------------------------------------------
-- 4. Interactions
-- -----------------------------------------------------------------------------
-- Réaction unique par personne : même emoji = retrait, autre emoji = remplacement.
create or replace function public.toggle_reaction(p_post_id uuid, p_kind public.reaction_kind)
returns jsonb language plpgsql as $$
declare
  v_current public.reaction_kind;
begin
  select kind into v_current from public.reactions
  where post_id = p_post_id and user_id = auth.uid();

  if v_current = p_kind then
    delete from public.reactions where post_id = p_post_id and user_id = auth.uid();
  elsif v_current is null then
    insert into public.reactions (post_id, user_id, kind) values (p_post_id, auth.uid(), p_kind);
  else
    update public.reactions set kind = p_kind, created_at = now()
    where post_id = p_post_id and user_id = auth.uid();
  end if;

  return jsonb_build_object(
    'reaction_counts', (
      select coalesce(jsonb_object_agg(r.kind, r.n), '{}'::jsonb)
      from (select kind, count(*) n from public.reactions where post_id = p_post_id group by kind) r
    ),
    'my_reaction', (
      select kind from public.reactions where post_id = p_post_id and user_id = auth.uid()
    )
  );
end $$;

create or replace function public.toggle_bookmark(p_post_id uuid)
returns boolean language plpgsql as $$
begin
  if exists (select 1 from public.bookmarks where post_id = p_post_id and user_id = auth.uid()) then
    delete from public.bookmarks where post_id = p_post_id and user_id = auth.uid();
    return false;
  end if;
  insert into public.bookmarks (post_id, user_id) values (p_post_id, auth.uid());
  return true;
end $$;

create or replace function public.record_post_view(p_post_id uuid)
returns void language sql as $$
  insert into public.post_views (post_id, user_id) values (p_post_id, auth.uid())
  on conflict do nothing
$$;

-- Commentaires d'un post avec auteur (nom, centre), racines puis réponses
create or replace function public.get_comments(p_post_id uuid)
returns setof jsonb language sql stable as $$
  select jsonb_build_object(
    'id', c.id,
    'post_id', c.post_id,
    'parent_id', c.parent_id,
    'body', c.body,
    'status', c.status,
    'created_at', c.created_at,
    'edited_at', c.edited_at,
    'is_mine', c.user_id = auth.uid(),
    'author', case when c.user_id is null then jsonb_build_object('name', 'Agent supprimé', 'center', null, 'avatar_key', null)
              else (select jsonb_build_object(
                      'name', nullif(trim(pr.first_name || ' ' || pr.last_name), ''),
                      'center', (select ce.name from public.centers ce where ce.id = pr.center_id),
                      'avatar_key', pr.avatar_key)
                    from public.profiles pr where pr.id = c.user_id) end
  )
  from public.comments c
  where c.post_id = p_post_id
  order by coalesce(c.parent_id, c.id), c.created_at
$$;

-- -----------------------------------------------------------------------------
-- 5. Statistiques studio
-- -----------------------------------------------------------------------------
create or replace function public.studio_stats()
returns jsonb language plpgsql as $$
begin
  if not public.is_editor() then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  perform public.publish_scheduled();

  return jsonb_build_object(
    'drafts',    (select count(*) from public.posts where status = 'draft' and deleted_at is null),
    'scheduled', (select count(*) from public.posts where status = 'scheduled' and deleted_at is null),
    'published', (select count(*) from public.posts where status = 'published' and deleted_at is null),
    'week', jsonb_build_object(
      'posts',     (select count(*) from public.posts where status = 'published' and deleted_at is null and published_at > now() - interval '7 days'),
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

-- -----------------------------------------------------------------------------
-- 6. Droits et temps réel
-- -----------------------------------------------------------------------------
revoke all on function public.post_to_json(public.posts) from public;
revoke all on function public.get_feed(int, timestamptz, uuid, text, text, text, boolean, text) from public;
revoke all on function public.get_pinned_posts() from public;
revoke all on function public.get_post(text) from public;
revoke all on function public.get_post_by_id(uuid) from public;
revoke all on function public.toggle_reaction(uuid, public.reaction_kind) from public;
revoke all on function public.toggle_bookmark(uuid) from public;
revoke all on function public.record_post_view(uuid) from public;
revoke all on function public.get_comments(uuid) from public;
revoke all on function public.studio_stats() from public;

grant execute on function public.post_to_json(public.posts) to authenticated, service_role;
grant execute on function public.get_feed(int, timestamptz, uuid, text, text, text, boolean, text) to authenticated, service_role;
grant execute on function public.get_pinned_posts() to authenticated, service_role;
grant execute on function public.get_post(text) to authenticated, service_role;
grant execute on function public.get_post_by_id(uuid) to authenticated, service_role;
grant execute on function public.toggle_reaction(uuid, public.reaction_kind) to authenticated;
grant execute on function public.toggle_bookmark(uuid) to authenticated;
grant execute on function public.record_post_view(uuid) to authenticated;
grant execute on function public.get_comments(uuid) to authenticated, service_role;
grant execute on function public.studio_stats() to authenticated, service_role;

-- Nouveaux commentaires en temps réel (postgres_changes, filtré par la RLS)
alter publication supabase_realtime add table public.comments;
alter table public.comments replica identity full;
