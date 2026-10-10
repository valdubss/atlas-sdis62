-- =============================================================================
-- 0032 — RGPD complet et stockage resserré (suite de la revue sécurité)
--  1. export_user_data : toutes les données personnelles d'un agent (messagerie,
--     stories, retours, rattachement, notifications, consultations, appareils).
--  2. anonymize_user_data : traite chaque table liée (effacement des traces
--     personnelles, anonymisation des contenus publiés) avant de retirer le profil,
--     sans dépendre des cascades ni des garde-fous des triggers.
--  3. Bucket « media » : un envoi direct (TUS) n'est accepté que pour un média
--     déclaré au préalable par l'agent lui-même (ligne media en cours), types et
--     taille bornés au niveau du bucket.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Export
-- -----------------------------------------------------------------------------
create or replace function public.export_user_data(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and auth.uid() <> p_user_id then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'exported_at',        now(),
    'profile',            (select to_jsonb(p) - 'avatar_key' from public.profiles p where p.id = p_user_id),
    'settings',           (select to_jsonb(s) from public.user_settings s where s.user_id = p_user_id),
    'profile_history',    (select coalesce(jsonb_agg(to_jsonb(h) order by h.changed_at), '[]') from public.profile_history h where h.profile_id = p_user_id),
    'membership_requests',(select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at), '[]') from public.membership_requests r where r.profile_id = p_user_id),
    'center_follows',     (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.center_follows f where f.profile_id = p_user_id),
    'center_referents',   (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.center_referents r where r.profile_id = p_user_id),
    'follows',            (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.category_follows f where f.user_id = p_user_id),
    'reactions',          (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.reactions r where r.user_id = p_user_id),
    'comments',           (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]') from public.comments c where c.user_id = p_user_id),
    'reports',            (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.comment_reports c where c.reporter_id = p_user_id),
    'bookmarks',          (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.bookmarks b where b.user_id = p_user_id),
    'poll_votes',         (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.poll_votes v where v.user_id = p_user_id),
    'post_views',         (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.post_views v where v.user_id = p_user_id),
    'page_views',         (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.page_views v where v.user_id = p_user_id),
    'story_views',        (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.story_views v where v.user_id = p_user_id),
    'story_reactions',    (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.story_reactions r where r.user_id = p_user_id),
    'story_poll_votes',   (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.story_poll_votes v where v.user_id = p_user_id),
    'story_answers',      (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from public.story_question_answers a where a.user_id = p_user_id),
    'story_replies',      (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.story_replies r where r.user_id = p_user_id),
    'posts_authored',     (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'status', p.status, 'created_at', p.created_at)), '[]') from public.posts p where p.author_id = p_user_id),
    'posts_coedited',     (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.post_editors e where e.profile_id = p_user_id),
    'events_authored',    (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at)), '[]') from public.events e where e.author_id = p_user_id),
    'media_owned',        (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'created_at', m.created_at)), '[]') from public.media m where m.owner_id = p_user_id),
    'channels',           (select coalesce(jsonb_agg(jsonb_build_object('channel_id', cm.channel_id, 'joined_at', cm.added_at, 'left_at', cm.left_at)), '[]') from public.channel_members cm where cm.profile_id = p_user_id),
    'messages',           (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'channel_id', m.channel_id, 'body', m.body, 'created_at', m.created_at) order by m.created_at), '[]') from public.channel_messages m where m.author_id = p_user_id),
    'message_reactions',  (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.message_reactions r where r.profile_id = p_user_id),
    'feedback',           (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'category', f.category, 'description', f.description, 'status', f.status, 'created_at', f.created_at)), '[]') from public.feedback f where f.user_id = p_user_id),
    'notifications',      (select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at), '[]') from public.notifications n where n.user_id = p_user_id),
    'push_devices',       (select coalesce(jsonb_agg(jsonb_build_object('user_agent', s.user_agent, 'created_at', s.created_at)), '[]') from public.push_subscriptions s where s.user_id = p_user_id),
    'push_opens',         (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from public.push_opens o where o.user_id = p_user_id)
  );
end $$;

-- -----------------------------------------------------------------------------
-- 2. Anonymisation / suppression
-- -----------------------------------------------------------------------------
create or replace function public.anonymize_user_data(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  -- Les garde-fous de contenu (commentaires, messages, rattachement) laissent passer l'anonymisation
  perform set_config('atlas.membership', '1', true);
  perform set_config('atlas.role_sync', '1', true);

  -- Traces personnelles : effacées
  delete from public.reactions              where user_id = p_user_id;
  delete from public.bookmarks              where user_id = p_user_id;
  delete from public.poll_votes             where user_id = p_user_id;
  delete from public.post_views             where user_id = p_user_id;
  delete from public.page_views             where user_id = p_user_id;
  delete from public.story_views            where user_id = p_user_id;
  delete from public.story_reactions        where user_id = p_user_id;
  delete from public.story_poll_votes       where user_id = p_user_id;
  delete from public.story_question_answers where user_id = p_user_id;
  delete from public.story_replies          where user_id = p_user_id;
  delete from public.category_follows       where user_id = p_user_id;
  delete from public.center_follows         where profile_id = p_user_id;
  delete from public.push_subscriptions     where user_id = p_user_id;
  delete from public.push_opens             where user_id = p_user_id;
  delete from public.notification_deferred  where user_id = p_user_id;
  delete from public.notifications          where user_id = p_user_id;
  delete from public.user_settings          where user_id = p_user_id;
  delete from public.membership_requests    where profile_id = p_user_id;
  delete from public.post_editors           where profile_id = p_user_id;
  delete from public.center_referents       where profile_id = p_user_id;
  delete from public.message_reactions      where profile_id = p_user_id;
  delete from public.channel_reads          where profile_id = p_user_id;
  delete from public.channel_members        where profile_id = p_user_id;
  delete from public.rate_limit_events      where user_id = p_user_id;

  -- Contenus conservés, auteur anonymisé (commentaires, messages, publications, médias, retours)
  update public.comments             set user_id = null       where user_id = p_user_id;
  update public.comment_reports      set reporter_id = null   where reporter_id = p_user_id;
  update public.comment_reports      set resolved_by = null   where resolved_by = p_user_id;
  update public.channel_messages     set author_id = null     where author_id = p_user_id;
  update public.channels             set created_by = null    where created_by = p_user_id;
  update public.channel_members      set added_by = null      where added_by = p_user_id;
  update public.posts                set author_id = null, author_display = 'service_com' where author_id = p_user_id;
  update public.posts                set lock_by = null, lock_at = null where lock_by = p_user_id;
  update public.posts                set submitted_by = null  where submitted_by = p_user_id;
  update public.posts                set reviewed_by = null   where reviewed_by = p_user_id;
  update public.post_versions        set saved_by = null      where saved_by = p_user_id;
  update public.post_review_comments set author_id = null     where author_id = p_user_id;
  update public.post_editors         set added_by = null      where added_by = p_user_id;
  update public.events               set author_id = null     where author_id = p_user_id;
  update public.events               set submitted_by = null  where submitted_by = p_user_id;
  update public.events               set reviewed_by = null   where reviewed_by = p_user_id;
  update public.stories              set author_id = null     where author_id = p_user_id;
  update public.story_series         set created_by = null    where created_by = p_user_id;
  update public.media                set owner_id = null      where owner_id = p_user_id;
  update public.media_subtitles      set updated_by = null    where updated_by = p_user_id;
  update public.feedback             set user_id = null       where user_id = p_user_id;
  update public.feedback             set handled_by = null    where handled_by = p_user_id;
  update public.flashes              set created_by = null    where created_by = p_user_id;
  update public.incidents            set created_by = null    where created_by = p_user_id;
  update public.center_changes       set proposed_by = null   where proposed_by = p_user_id;
  update public.center_changes       set decided_by = null    where decided_by = p_user_id;
  update public.center_referents     set created_by = null    where created_by = p_user_id;
  update public.membership_requests  set decided_by = null    where decided_by = p_user_id;
  update public.profile_history      set changed_by = null    where changed_by = p_user_id;
  update public.centers              set chief_id = null      where chief_id = p_user_id;
  update public.centers              set pending_by = null    where pending_by = p_user_id;
  update public.services             set manager_id = null    where manager_id = p_user_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'anonymize', 'profiles', p_user_id::text);
  delete from public.profiles where id = p_user_id;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Bucket « media » : envoi direct lié à un média déclaré, types et taille bornés
-- -----------------------------------------------------------------------------
drop policy if exists media_tus_insert on storage.objects;
create policy media_tus_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in ('originals', 'videos', 'posters')
    and exists (
      select 1 from public.media m
      where m.owner_id = auth.uid() and m.status in ('uploading', 'processing')
        and m.id::text = split_part(split_part(name, '/', 2), '.', 1)));
drop policy if exists media_tus_update on storage.objects;
create policy media_tus_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] in ('originals', 'videos', 'posters') and owner = auth.uid())
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in ('originals', 'videos', 'posters')
    and exists (
      select 1 from public.media m
      where m.owner_id = auth.uid() and m.status in ('uploading', 'processing')
        and m.id::text = split_part(split_part(name, '/', 2), '.', 1)));

-- Limites du bucket (s'appliquent à tous les envois, serveur compris) : 60 Mo par objet,
-- images, vidéos MP4/MOV, dérivés WebP/JPEG, HLS, sous-titres, flux TUS sans type déclaré.
update storage.buckets
set file_size_limit = 62914560,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif', 'image/gif',
      'video/mp4', 'video/quicktime', 'video/mp2t', 'video/MP2T',
      'application/vnd.apple.mpegurl', 'application/x-mpegurl', 'application/x-mpegURL',
      'text/vtt', 'text/vtt; charset=utf-8', 'application/octet-stream']
where id = 'media';
