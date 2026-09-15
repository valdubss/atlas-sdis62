-- 0020 — Vidéo (lot 1 v3) : transcodage HLS multi-qualité, poster, sous-titres,
-- paliers de lecture.

-- -----------------------------------------------------------------------------
-- 1. État vidéo, orientation, HLS, poster
-- -----------------------------------------------------------------------------
create type public.video_status as enum ('uploaded', 'processing', 'ready', 'failed');
create type public.media_orientation as enum ('portrait', 'landscape', 'square');

alter table public.media
  add column if not exists video_status public.video_status,
  add column if not exists video_error text,
  add column if not exists orientation public.media_orientation,
  add column if not exists hls_key text,                                -- master.m3u8
  add column if not exists renditions jsonb not null default '[]'::jsonb, -- [{height, bandwidth, key}]
  add column if not exists hls_files text[] not null default '{}',      -- toutes les clés HLS (purge)
  add column if not exists poster_source text not null default 'auto' check (poster_source in ('auto', 'upload', 'timecode')),
  add column if not exists poster_time_s numeric(8,2),
  add column if not exists transcode_started_at timestamptz,
  add column if not exists transcode_attempts int not null default 0;

-- Vidéos déjà en ligne : considérées comme « uploaded » pour être transcodées
-- par le cron (le MP4 original reste lisible en attendant).
update public.media set video_status = 'uploaded'
  where kind = 'video' and status = 'ready' and video_status is null;
update public.media set orientation = case
    when width is null or height is null then null
    when width > height then 'landscape'::public.media_orientation
    when width < height then 'portrait'::public.media_orientation
    else 'square'::public.media_orientation end
  where kind = 'video' and orientation is null;

create index if not exists media_video_pending_idx on public.media (updated_at)
  where kind = 'video' and video_status in ('uploaded', 'processing');

-- -----------------------------------------------------------------------------
-- 2. Sous-titres (une piste par langue ; importés ou générés, édités ligne à ligne)
-- -----------------------------------------------------------------------------
create table public.media_subtitles (
  id          uuid primary key default gen_random_uuid(),
  media_id    uuid not null references public.media (id) on delete cascade,
  lang        text not null default 'fr',
  source      text not null default 'upload' check (source in ('upload', 'auto', 'manual')),
  cues        jsonb not null default '[]'::jsonb,   -- [{start, end, text}] en secondes
  vtt_key     text,                                  -- fichier publié
  status      text not null default 'draft' check (status in ('draft', 'published')),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (media_id, lang)
);
alter table public.media_subtitles enable row level security;
create policy media_subtitles_select on public.media_subtitles for select to authenticated
  using (status = 'published' or public.is_editor() or exists (select 1 from public.media m where m.id = media_id and m.owner_id = auth.uid()));
create policy media_subtitles_editor on public.media_subtitles for all to authenticated
  using (public.is_editor() or exists (select 1 from public.media m where m.id = media_id and m.owner_id = auth.uid()))
  with check (public.is_editor() or exists (select 1 from public.media m where m.id = media_id and m.owner_id = auth.uid()));
create trigger media_subtitles_set_updated_at before update on public.media_subtitles for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Sérialisation : le lecteur reçoit HLS, orientation, sous-titres publiés
-- -----------------------------------------------------------------------------
create or replace function public.media_to_json(m public.media)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'kind', m.kind, 'variants', m.variants, 'poster_key', m.poster_key,
    'width', m.width, 'height', m.height, 'alt', m.alt, 'mime', m.mime,
    'original_key', m.original_key, 'duration_s', m.duration_s,
    'orientation', m.orientation, 'hls_key', m.hls_key, 'video_status', m.video_status,
    'subtitles_key', (select s.vtt_key from public.media_subtitles s where s.media_id = m.id and s.status = 'published' and s.vtt_key is not null order by s.lang limit 1)
  )
$$;

-- post_to_json : couverture et médias passent par media_to_json (mêmes champs)
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
      select jsonb_agg(public.media_to_json(m) || jsonb_build_object('alt', coalesce(pm.alt, m.alt), 'position', pm.position) order by pm.position)
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
-- 4. Paliers de lecture vidéo (25 / 50 / 75 / 100), sans horodatage fin
-- -----------------------------------------------------------------------------
alter table public.post_views add column if not exists progress smallint not null default 0 check (progress in (0, 25, 50, 75, 100));
alter table public.story_views add column if not exists progress smallint not null default 0 check (progress between 0 and 100);

create or replace function public.record_video_progress(p_post_id uuid, p_pct int)
returns void language plpgsql security definer set search_path = public as $$
declare v_pct smallint := case when p_pct >= 100 then 100 when p_pct >= 75 then 75 when p_pct >= 50 then 50 when p_pct >= 25 then 25 else 0 end;
begin
  if auth.uid() is null then return; end if;
  insert into public.post_views (post_id, user_id, progress) values (p_post_id, auth.uid(), v_pct)
  on conflict (post_id, user_id) do update set progress = greatest(public.post_views.progress, excluded.progress);
end $$;
revoke all on function public.record_video_progress(uuid, int) from public;
grant execute on function public.record_video_progress(uuid, int) to authenticated;

-- Statistiques : répartition des paliers par vidéo
create or replace function public.studio_video_stats(p_days int default 30)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'post_id', p.id, 'title', p.title, 'slug', p.slug, 'published_at', p.published_at,
      'views', (select count(*) from public.post_views v where v.post_id = p.id),
      'p25', (select count(*) from public.post_views v where v.post_id = p.id and v.progress >= 25),
      'p50', (select count(*) from public.post_views v where v.post_id = p.id and v.progress >= 50),
      'p75', (select count(*) from public.post_views v where v.post_id = p.id and v.progress >= 75),
      'p100', (select count(*) from public.post_views v where v.post_id = p.id and v.progress >= 100)
    ) order by p.published_at desc)
    from public.posts p
    where p.type = 'video' and p.status = 'published' and p.deleted_at is null
      and p.published_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
      and public.is_editor()
  ), '[]'::jsonb)
$$;
revoke all on function public.studio_video_stats(int) from public;
grant execute on function public.studio_video_stats(int) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Purge : les fichiers HLS et sous-titres suivent le média
-- -----------------------------------------------------------------------------
create or replace function public.purge_orphan_media()
returns table (id uuid, keys text[]) language sql security definer set search_path = public as $$
  with victims as (
    select m.id, m.original_key, m.poster_key, m.variants, m.hls_files
    from public.media m
    where (m.status <> 'ready' and m.created_at < now() - interval '24 hours')
       or (
         m.status = 'ready' and m.created_at < now() - interval '7 days'
         and not exists (
           select 1 from public.post_media pm join public.posts p on p.id = pm.post_id
           where pm.media_id = m.id and p.deleted_at is null
         )
         and not exists (select 1 from public.posts p where p.cover_media_id = m.id and p.deleted_at is null)
         and not exists (select 1 from public.stories s where s.media_id = m.id)
         and not exists (select 1 from public.story_series ss where ss.cover_media_id = m.id)
         and not exists (select 1 from public.story_highlights h where h.cover_media_id = m.id)
         and not exists (select 1 from public.feedback f where f.screenshot_key is not null and f.screenshot_key like '%' || m.id::text || '%')
       )
  ),
  detached as (
    delete from public.post_media pm using victims v where pm.media_id = v.id
  ),
  uncovered as (
    update public.posts p set cover_media_id = null from victims v where p.cover_media_id = v.id
  ),
  deleted as (
    delete from public.media m using victims v where m.id = v.id returning v.id, v.original_key, v.poster_key, v.variants, v.hls_files
  )
  select d.id,
         array_remove(array[d.original_key, d.poster_key, 'subtitles/' || d.id::text || '.fr.vtt'] || coalesce((select array_agg(value) from jsonb_each_text(coalesce(d.variants, '{}'::jsonb))), '{}') || coalesce(d.hls_files, '{}'), null)
  from deleted d
$$;
revoke all on function public.purge_orphan_media() from public;
grant execute on function public.purge_orphan_media() to service_role;
