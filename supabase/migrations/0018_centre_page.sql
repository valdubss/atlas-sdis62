-- 0018 — Onglet « Mon centre » (lot B) : fil d'un centre, lecture des
-- couvertures, comptage des consultations.

-- Fil d'un centre : publications de centre validées, même forme que le fil
-- départemental (post_to_json), curseur (published_at, id).
create or replace function public.get_center_feed(
  p_center_id  uuid,
  p_limit      int default 10,
  p_cursor_at  timestamptz default null,
  p_cursor_id  uuid default null
)
returns setof jsonb language sql stable as $$
  select public.post_to_json(p)
  from public.posts p
  where p.scope = 'center' and p.center_id = p_center_id
    and p.status = 'published' and p.deleted_at is null and p.published_at <= now()
    and (p_cursor_at is null
         or p.published_at < p_cursor_at
         or (p.published_at = p_cursor_at and p.id < p_cursor_id))
  order by p.published_at desc, p.id desc
  limit greatest(1, least(p_limit, 50));
$$;
revoke all on function public.get_center_feed(uuid, int, timestamptz, uuid) from public;
grant execute on function public.get_center_feed(uuid, int, timestamptz, uuid) to authenticated;

-- Les photos de couverture des centres (et celles proposées) sont lisibles par
-- tous les agents connectés.
drop policy if exists media_select_center_cover on public.media;
create policy media_select_center_cover on public.media for select to authenticated
  using (exists (select 1 from public.centers c where c.cover_media_id = media.id or c.pending_cover_media_id = media.id));

-- Consultation d'une page (une ligne par agent, par jour et par cible).
create or replace function public.record_page_view(p_kind text, p_target uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into public.page_views (kind, target_id, user_id)
  values (p_kind, coalesce(p_target, '00000000-0000-0000-0000-000000000000'), auth.uid())
  on conflict do nothing;
$$;
revoke all on function public.record_page_view(text, uuid) from public;
grant execute on function public.record_page_view(text, uuid) to authenticated;

-- Une proposition de centre prévient les éditeurs dans l'app (cloche).
create or replace function public.notify_center_proposal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_center text; v_text text;
begin
  if new.scope <> 'center' or new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'pending' then return new; end if;
  select name into v_center from public.centers where id = new.center_id;
  v_text := coalesce(new.title, left(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g'), 120));
  insert into public.notifications (user_id, kind, title, body, url)
  select pr.id, 'post', 'Proposition · ' || coalesce(v_center, 'centre'), v_text, '/studio/centres'
  from public.profiles pr where pr.role in ('editor', 'admin') and pr.is_active;
  return new;
end $$;
drop trigger if exists posts_notify_center_proposal on public.posts;
create trigger posts_notify_center_proposal after insert or update of status on public.posts
  for each row execute function public.notify_center_proposal();
