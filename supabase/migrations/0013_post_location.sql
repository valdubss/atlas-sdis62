-- =============================================================================
-- 0013 — Lieu d'une publication
-- -----------------------------------------------------------------------------
-- Champ libre (« Arras », « CIS Béthune », « Stade Bollaert ») affiché sous
-- l'auteur, façon Instagram. Facultatif, 120 caractères.
-- =============================================================================

alter table public.posts add column if not exists location text;
alter table public.posts drop constraint if exists posts_location_len;
alter table public.posts add constraint posts_location_len check (location is null or char_length(location) <= 120);

create or replace function public.post_to_json(p public.posts)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id',               p.id,
    'type',             p.type,
    'slug',             p.slug,
    'title',            p.title,
    'location',         p.location,
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
