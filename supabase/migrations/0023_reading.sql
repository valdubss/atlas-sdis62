-- 0023 — Fil, carrousel, articles (lot 4 v3) : légendes par photo, LQIP,
-- lecture qualifiée, recherche globale.

-- -----------------------------------------------------------------------------
-- 1. Légende par photo, aperçu flou (LQIP)
-- -----------------------------------------------------------------------------
alter table public.post_media add column if not exists caption text;
alter table public.post_media drop constraint if exists post_media_caption_len;
alter table public.post_media add constraint post_media_caption_len check (caption is null or char_length(caption) <= 200);
alter table public.media add column if not exists lqip text;   -- data:image/webp;base64,… (20 px)

create or replace function public.media_to_json(m public.media)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'kind', m.kind, 'variants', m.variants, 'poster_key', m.poster_key,
    'width', m.width, 'height', m.height, 'alt', m.alt, 'mime', m.mime,
    'original_key', m.original_key, 'duration_s', m.duration_s,
    'orientation', m.orientation, 'hls_key', m.hls_key, 'video_status', m.video_status,
    'lqip', m.lqip,
    'subtitles_key', (select s.vtt_key from public.media_subtitles s where s.media_id = m.id and s.status = 'published' and s.vtt_key is not null order by s.lang limit 1)
  )
$$;

-- post_to_json : la légende de chaque photo accompagne le média
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
      select public.media_to_json(m)
      from public.media m where m.id = p.cover_media_id and m.status = 'ready'
    ),
    'media', coalesce((
      select jsonb_agg(public.media_to_json(m) || jsonb_build_object('alt', coalesce(pm.alt, m.alt), 'position', pm.position, 'caption', pm.caption) order by pm.position)
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

-- -----------------------------------------------------------------------------
-- 2. Lecture qualifiée : affichage (vue) < lecture (50 % pendant 2 s, ou 80 % d'un article) < interaction
-- -----------------------------------------------------------------------------
alter table public.post_views
  add column if not exists read boolean not null default false,
  add column if not exists interacted boolean not null default false;

create or replace function public.record_post_read(p_post_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.post_views (post_id, user_id, read) select p_post_id, auth.uid(), true where auth.uid() is not null
  on conflict (post_id, user_id) do update set read = true;
$$;
revoke all on function public.record_post_read(uuid) from public;
grant execute on function public.record_post_read(uuid) to authenticated;

-- Interaction : réaction, commentaire, favori ou vote marquent la vue
create or replace function public.mark_post_interacted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_post uuid := coalesce(new.post_id, (select pl.post_id from public.polls pl where pl.post_id = new.poll_id));
begin
  if v_post is null or auth.uid() is null then return new; end if;
  insert into public.post_views (post_id, user_id, read, interacted) values (v_post, auth.uid(), true, true)
  on conflict (post_id, user_id) do update set read = true, interacted = true;
  return new;
end $$;
drop trigger if exists reactions_interacted on public.reactions;
create trigger reactions_interacted after insert on public.reactions for each row execute function public.mark_post_interacted();
drop trigger if exists comments_interacted on public.comments;
create trigger comments_interacted after insert on public.comments for each row execute function public.mark_post_interacted();
drop trigger if exists bookmarks_interacted on public.bookmarks;
create trigger bookmarks_interacted after insert on public.bookmarks for each row execute function public.mark_post_interacted();

-- Statistiques : affichage, lecture, interaction par publication
create or replace function public.studio_reading_stats(p_days int default 30)
returns jsonb language sql security definer set search_path = public as $$
  select case when public.is_editor() then jsonb_build_object(
    'totals', (select jsonb_build_object('viewed', count(*), 'read', count(*) filter (where read), 'interacted', count(*) filter (where interacted))
               from public.post_views v where v.first_viewed_at > now() - make_interval(days => greatest(1, least(p_days, 365)))),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object('post_id', p.id, 'title', p.title, 'type', p.type, 'published_at', p.published_at,
        'viewed', (select count(*) from public.post_views v where v.post_id = p.id),
        'read', (select count(*) from public.post_views v where v.post_id = p.id and v.read),
        'interacted', (select count(*) from public.post_views v where v.post_id = p.id and v.interacted)) order by p.published_at desc)
      from public.posts p
      where p.status = 'published' and p.deleted_at is null and p.published_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
    ), '[]'::jsonb)
  ) else '{}'::jsonb end
$$;
revoke all on function public.studio_reading_stats(int) from public;
grant execute on function public.studio_reading_stats(int) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Recherche globale : publications (index plein texte + tolérance), annuaire
-- -----------------------------------------------------------------------------
create or replace function public.search_all(p_q text, p_limit int default 8)
returns jsonb language plpgsql stable set search_path = public, extensions as $$
declare
  q text := public.norm_text(trim(p_q));
  lim int := greatest(1, least(coalesce(p_limit, 8), 20));
  v_dir jsonb;
begin
  if q = '' or char_length(q) < 2 then
    return jsonb_build_object('posts', '[]'::jsonb, 'centers', '[]'::jsonb, 'services', '[]'::jsonb, 'people', '[]'::jsonb);
  end if;
  v_dir := public.search_directory(p_q, lim);
  return jsonb_build_object(
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title, 'type', p.type, 'published_at', p.published_at,
               'excerpt', left(regexp_replace(coalesce(p.excerpt, p.body, ''), '\s+', ' ', 'g'), 120)) order by s.rank desc, p.published_at desc)
      from (
        select p.id,
               greatest(
                 case when p.search @@ websearch_to_tsquery('french', p_q) then 1.0 else 0 end,
                 case when public.norm_text(p.title) like '%' || q || '%' then 0.9 else 0 end,
                 word_similarity(q, public.norm_text(coalesce(p.title, ''))),
                 word_similarity(q, public.norm_text(left(coalesce(p.body, ''), 400))) * 0.8) as rank
        from public.posts p
        where p.status = 'published' and p.deleted_at is null and p.published_at <= now() and p.scope = 'departmental'
      ) s
      join public.posts p on p.id = s.id
      where s.rank >= 0.45
      limit lim
    ), '[]'::jsonb),
    'centers', coalesce(v_dir->'centers', '[]'::jsonb),
    'services', coalesce(v_dir->'services', '[]'::jsonb),
    'people', coalesce(v_dir->'people', '[]'::jsonb)
  );
end $$;
revoke all on function public.search_all(text, int) from public;
grant execute on function public.search_all(text, int) to authenticated;
