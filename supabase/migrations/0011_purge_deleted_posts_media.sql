-- =============================================================================
-- 0011 — Libération du stockage : médias des publications supprimées
-- -----------------------------------------------------------------------------
-- Une publication supprimée est conservée en base (deleted_at, statut
-- « archived ») mais ses médias ne doivent plus retenir l'espace de stockage :
-- la purge quotidienne ne compte plus les références venant de publications
-- supprimées. Les fichiers sont effacés du stockage par l'application
-- (runMaintenance) après suppression des lignes.
-- =============================================================================

create or replace function public.purge_orphan_media()
returns table (id uuid, keys text[]) language sql security definer set search_path = public as $$
  with victims as (
    select m.id, m.original_key, m.poster_key, m.variants
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
    delete from public.media m using victims v where m.id = v.id returning v.id, v.original_key, v.poster_key, v.variants
  )
  select d.id,
         array_remove(array[d.original_key, d.poster_key] || coalesce((select array_agg(value) from jsonb_each_text(coalesce(d.variants, '{}'::jsonb))), '{}'), null)
  from deleted d
$$;
revoke all on function public.purge_orphan_media() from public;
grant execute on function public.purge_orphan_media() to service_role;
