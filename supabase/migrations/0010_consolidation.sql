-- =============================================================================
-- 0010 — Consolidation : sondages, index, médias, file, garde-fous
-- -----------------------------------------------------------------------------
-- Correctifs issus de l'audit de consolidation (septembre 2026) :
--  1. résultats de sondage faux pour les agents (RLS sur poll_votes) ;
--  2. suppression de compte RGPD impossible dès qu'un média existe ;
--  3. index manquants (politiques media_select, modération, statistiques) ;
--  4. un éditeur peut masquer son propre commentaire ;
--  5. les brouillons n'occupent plus les 3 places d'épinglage ;
--  6. audit des publications sans corps ni index de recherche ;
--  7. 30 photos par publication ;
--  8. statut « processing » pour la file de notifications (pas de doublon) ;
--  9. purge des médias orphelins ;
-- 10. galerie : doublons de couverture d'article et pagination par image.
-- =============================================================================

-- 1. Comptages de sondage indépendants de la RLS (un agent ne voit que son vote)
create or replace function public.poll_total_votes(p_post_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.poll_votes v where v.poll_id = p_post_id
$$;
create or replace function public.poll_option_votes(p_option_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.poll_votes v where v.option_id = p_option_id
$$;
revoke all on function public.poll_total_votes(uuid) from public;
revoke all on function public.poll_option_votes(uuid) from public;
grant execute on function public.poll_total_votes(uuid) to authenticated, service_role;
grant execute on function public.poll_option_votes(uuid) to authenticated, service_role;

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

-- 2. Un média peut survivre à son propriétaire (anonymisation RGPD)
alter table public.media alter column owner_id drop not null;

-- 3. Index manquants
create index if not exists post_media_media_idx on public.post_media (media_id);
create index if not exists posts_cover_media_idx on public.posts (cover_media_id) where cover_media_id is not null;
create index if not exists stories_media_idx on public.stories (media_id);
create index if not exists story_series_cover_idx on public.story_series (cover_media_id) where cover_media_id is not null;
create index if not exists story_highlights_cover_idx on public.story_highlights (cover_media_id) where cover_media_id is not null;
create index if not exists story_highlight_items_story_idx on public.story_highlight_items (story_id);
create index if not exists comment_reports_comment_idx on public.comment_reports (comment_id);
create index if not exists poll_votes_option_idx on public.poll_votes (option_id);
create index if not exists feedback_user_idx on public.feedback (user_id);
create index if not exists post_views_first_idx on public.post_views (first_viewed_at);
create index if not exists media_status_created_idx on public.media (status, created_at);

-- 4. Commentaires : un éditeur peut aussi masquer les siens
create or replace function public.comments_before_update()
returns trigger language plpgsql as $$
begin
  if public.is_editor() then
    if new.user_id is distinct from auth.uid() and new.body is distinct from old.body then
      raise exception 'MODIFICATION_INTERDITE: un éditeur ne modifie pas le texte d''un agent' using errcode = '42501';
    end if;
    if new.post_id is distinct from old.post_id or new.parent_id is distinct from old.parent_id or new.user_id is distinct from old.user_id then
      raise exception 'MODIFICATION_INTERDITE' using errcode = '42501';
    end if;
    if new.body is distinct from old.body then
      new.edited_at := now();
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

-- 5. Épinglage : seules les publications en ligne ou programmées comptent
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

  if new.pinned_at is not null and new.status in ('published', 'scheduled')
     and (tg_op = 'INSERT' or old.pinned_at is null or old.status not in ('published', 'scheduled')) then
    select count(*) into v_pinned
    from public.posts p
    where p.pinned_at is not null and p.deleted_at is null and p.status in ('published', 'scheduled') and p.id <> new.id;
    if v_pinned >= 3 then
      raise exception 'LIMITE_EPINGLES: 3 posts épinglés maximum' using errcode = 'P0003';
    end if;
  end if;

  return new;
end $$;

-- 6. Audit : sans corps ni vecteur de recherche (volumineux, inutiles)
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
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'body' - 'search' end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'body' - 'search' end
  );
  return coalesce(new, old);
end $$;

-- 7. 30 photos par publication
create or replace function public.post_media_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.post_media where post_id = new.post_id) >= 30 then
    raise exception 'LIMITE_MEDIAS: 30 images maximum par post' using errcode = 'P0004';
  end if;
  return new;
end $$;

-- 8. File : statut « processing » (réservation par le distributeur)
alter type public.queue_status add value if not exists 'processing';

-- 9. Médias orphelins : lignes jamais finalisées (24 h) ou prêtes mais
--    rattachées à rien depuis 7 jours. Supprime les lignes et renvoie les clés
--    de stockage à effacer (l'application efface les objets).
create or replace function public.purge_orphan_media()
returns table (id uuid, keys text[]) language sql security definer set search_path = public as $$
  with victims as (
    select m.id, m.original_key, m.poster_key, m.variants
    from public.media m
    where (m.status <> 'ready' and m.created_at < now() - interval '24 hours')
       or (
         m.status = 'ready' and m.created_at < now() - interval '7 days'
         and not exists (select 1 from public.post_media pm where pm.media_id = m.id)
         and not exists (select 1 from public.posts p where p.cover_media_id = m.id)
         and not exists (select 1 from public.stories s where s.media_id = m.id)
         and not exists (select 1 from public.story_series ss where ss.cover_media_id = m.id)
         and not exists (select 1 from public.story_highlights h where h.cover_media_id = m.id)
         and not exists (select 1 from public.feedback f where f.screenshot_key is not null and f.screenshot_key like '%' || m.id::text || '%')
       )
  ),
  deleted as (
    delete from public.media m using victims v where m.id = v.id returning v.id, v.original_key, v.poster_key, v.variants
  )
  select d.id,
         array_remove(array[d.original_key, d.poster_key] || coalesce((select array_agg(value) from jsonb_each_text(coalesce(d.variants, '{}'::jsonb))), '{}'), null)
  from deleted d
$$;
revoke all on function public.purge_orphan_media() from public;
grant execute on function public.purge_orphan_media() to service_role;

-- 10. Galerie : pas de doublon pour la couverture d'article, curseur par image
drop function if exists public.get_gallery(int, timestamptz, uuid);
create or replace function public.get_gallery(
  p_limit      int default 30,
  p_cursor_at  timestamptz default null,
  p_cursor_id  uuid default null,
  p_cursor_pos int default null
)
returns setof jsonb language sql stable as $$
  select jsonb_build_object(
    'media', public.media_to_json(m),
    'post', jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title, 'published_at', p.published_at),
    'position', x.position
  )
  from (
    select pm.post_id, pm.media_id, pm.position from public.post_media pm
    union all
    select p2.id, p2.cover_media_id, -1 from public.posts p2
    where p2.cover_media_id is not null
      and not exists (select 1 from public.post_media pm2 where pm2.post_id = p2.id and pm2.media_id = p2.cover_media_id)
  ) x
  join public.posts p on p.id = x.post_id
  join public.media m on m.id = x.media_id
  where p.status = 'published' and p.deleted_at is null and p.published_at <= now()
    and m.kind = 'image' and m.status = 'ready'
    and (p_cursor_at is null
         or p.published_at < p_cursor_at
         or (p.published_at = p_cursor_at and p.id < p_cursor_id)
         or (p.published_at = p_cursor_at and p.id = p_cursor_id and x.position > coalesce(p_cursor_pos, -2)))
  order by p.published_at desc, p.id desc, x.position
  limit greatest(1, least(p_limit, 90))
$$;
revoke all on function public.get_gallery(int, timestamptz, uuid, int) from public;
grant execute on function public.get_gallery(int, timestamptz, uuid, int) to authenticated, service_role;
