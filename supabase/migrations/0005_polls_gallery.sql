-- =============================================================================
-- ATLAS — migration 0005 : sondages et galerie
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Vote (une seule fois, sondage ouvert) : renvoie le sondage à jour
-- -----------------------------------------------------------------------------
create or replace function public.vote_poll(p_post_id uuid, p_option_id uuid)
returns jsonb language plpgsql as $$
declare
  v_closes timestamptz;
begin
  select closes_at into v_closes from public.polls where post_id = p_post_id;
  if not found then
    raise exception 'SONDAGE_INTROUVABLE' using errcode = 'P0009';
  end if;
  if v_closes is not null and v_closes <= now() then
    raise exception 'SONDAGE_CLOS' using errcode = 'P0010';
  end if;
  if exists (select 1 from public.poll_votes where poll_id = p_post_id and user_id = auth.uid()) then
    raise exception 'DEJA_VOTE' using errcode = 'P0011';
  end if;

  -- La RLS d'insertion vérifie que le post est publié et que l'option appartient au sondage.
  insert into public.poll_votes (poll_id, option_id, user_id) values (p_post_id, p_option_id, auth.uid());

  return (select (public.post_to_json(p) -> 'poll') from public.posts p where p.id = p_post_id);
end $$;

revoke all on function public.vote_poll(uuid, uuid) from public;
grant execute on function public.vote_poll(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Galerie : toutes les images des publications publiées, paginées par curseur
-- -----------------------------------------------------------------------------
create or replace function public.get_gallery(
  p_limit      int default 30,
  p_cursor_at  timestamptz default null,
  p_cursor_id  uuid default null
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
    select p2.id, p2.cover_media_id, -1 from public.posts p2 where p2.cover_media_id is not null
  ) x
  join public.posts p on p.id = x.post_id
  join public.media m on m.id = x.media_id
  where p.status = 'published' and p.deleted_at is null and p.published_at <= now()
    and m.kind = 'image' and m.status = 'ready'
    and (p_cursor_at is null
         or p.published_at < p_cursor_at
         or (p.published_at = p_cursor_at and p.id < p_cursor_id))
  order by p.published_at desc, p.id desc, x.position
  limit greatest(1, least(p_limit, 90))
$$;

revoke all on function public.get_gallery(int, timestamptz, uuid) from public;
grant execute on function public.get_gallery(int, timestamptz, uuid) to authenticated, service_role;
