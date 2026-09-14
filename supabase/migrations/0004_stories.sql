-- =============================================================================
-- ATLAS — migration 0004 : stories (bandeau, viewer, vues, à-la-une)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sérialisation d'un média (partagée avec les posts)
-- -----------------------------------------------------------------------------
create or replace function public.media_to_json(m public.media)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'kind', m.kind, 'variants', m.variants, 'poster_key', m.poster_key,
    'width', m.width, 'height', m.height, 'alt', m.alt, 'mime', m.mime,
    'original_key', m.original_key, 'duration_s', m.duration_s
  )
$$;

-- -----------------------------------------------------------------------------
-- 2. Sérialisation d'une story (SECURITY INVOKER : respecte la RLS)
--    `views` n'est significatif que pour un éditeur (RLS sur story_views).
-- -----------------------------------------------------------------------------
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
    'views',           (select count(*) from public.story_views v where v.story_id = s.id)
  )
$$;

-- -----------------------------------------------------------------------------
-- 3. Bandeau : séries actives (non vues d'abord) + à-la-une actifs
-- -----------------------------------------------------------------------------
create or replace function public.get_story_bar()
returns jsonb language plpgsql as $$
begin
  perform public.publish_scheduled();

  return jsonb_build_object(
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'kind', 'series', 'title', x.title, 'count', x.n, 'all_seen', x.all_seen, 'latest_at', x.latest_at,
        'cover', (
          select public.media_to_json(m) from public.media m
          where m.id = coalesce(x.cover_media_id, x.first_media_id)
        )
      ) order by x.all_seen asc, x.latest_at desc)
      from (
        select ss.id, ss.title, ss.cover_media_id,
               count(*) as n,
               bool_and(exists (select 1 from public.story_views v where v.story_id = s.id and v.user_id = auth.uid())) as all_seen,
               max(s.published_at) as latest_at,
               (array_agg(s.media_id order by s.position, s.published_at))[1] as first_media_id
        from public.story_series ss
        join public.stories s on s.series_id = ss.id
          and s.status = 'published' and s.published_at <= now() and s.expires_at > now()
        group by ss.id
      ) x
    ), '[]'::jsonb),
    'highlights', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'kind', 'highlight', 'title', h.title, 'count', (select count(*) from public.story_highlight_items i where i.highlight_id = h.id),
        'all_seen', true, 'latest_at', null,
        'cover', (
          select public.media_to_json(m) from public.media m
          where m.id = coalesce(h.cover_media_id, (
            select s.media_id from public.story_highlight_items i join public.stories s on s.id = i.story_id
            where i.highlight_id = h.id order by i.position limit 1))
        )
      ) order by h.position, h.created_at)
      from public.story_highlights h
      where h.is_active and exists (select 1 from public.story_highlight_items i where i.highlight_id = h.id)
    ), '[]'::jsonb)
  );
end $$;

-- -----------------------------------------------------------------------------
-- 4. Stories d'une série active ou d'un à-la-une
-- -----------------------------------------------------------------------------
create or replace function public.get_story_items(p_series_id uuid default null, p_highlight_id uuid default null)
returns setof jsonb language sql stable as $$
  select public.story_to_json(s)
  from public.stories s
  where (p_series_id is not null and s.series_id = p_series_id
         and s.status = 'published' and s.published_at <= now() and s.expires_at > now())
  order by s.position, s.published_at
$$;

create or replace function public.get_highlight_items(p_highlight_id uuid)
returns setof jsonb language sql stable as $$
  select public.story_to_json(s)
  from public.story_highlight_items i
  join public.stories s on s.id = i.story_id
  where i.highlight_id = p_highlight_id
  order by i.position, s.published_at
$$;

-- -----------------------------------------------------------------------------
-- 5. Vue d'une story (une par personne)
-- -----------------------------------------------------------------------------
create or replace function public.record_story_view(p_story_id uuid)
returns void language sql as $$
  insert into public.story_views (story_id, user_id) values (p_story_id, auth.uid())
  on conflict do nothing
$$;

-- Studio : une story par id, quel que soit son statut (RLS éditeur)
create or replace function public.get_story_by_id(p_id uuid)
returns jsonb language sql stable as $$
  select public.story_to_json(s) from public.stories s where s.id = p_id limit 1
$$;

-- -----------------------------------------------------------------------------
-- 6. Droits
-- -----------------------------------------------------------------------------
revoke all on function public.media_to_json(public.media) from public;
revoke all on function public.story_to_json(public.stories) from public;
revoke all on function public.get_story_bar() from public;
revoke all on function public.get_story_items(uuid, uuid) from public;
revoke all on function public.get_highlight_items(uuid) from public;
revoke all on function public.record_story_view(uuid) from public;
revoke all on function public.get_story_by_id(uuid) from public;

grant execute on function public.media_to_json(public.media) to authenticated, service_role;
grant execute on function public.story_to_json(public.stories) to authenticated, service_role;
grant execute on function public.get_story_bar() to authenticated, service_role;
grant execute on function public.get_story_items(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_highlight_items(uuid) to authenticated, service_role;
grant execute on function public.record_story_view(uuid) to authenticated;
grant execute on function public.get_story_by_id(uuid) to authenticated, service_role;

-- Suppression d'une story : les vues et les liens à-la-une suivent (cascade déjà en place) ;
-- une série sans story reste disponible pour les prochaines publications.
