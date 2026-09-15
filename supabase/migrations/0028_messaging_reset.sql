-- =============================================================================
-- ATLAS — migration 0028 : messagerie vide au départ
--   Décision du 15/09/2026 : aucun canal créé d'office (ni général, ni par
--   groupement, ni par centre). Seuls les groupes créés par les éditeurs
--   avec le « + » existent. Toutes les conversations existantes sont effacées.
-- =============================================================================

-- Plus de création automatique de canaux depuis le référentiel
drop trigger if exists groupings_channel on public.groupings;
drop trigger if exists centers_channel on public.centers;
drop function if exists public.groupings_channel();
drop function if exists public.centers_channel();

-- Les messages système n'ont plus de sens quand le canal disparaît (suppression d'un groupe)
create or replace function public.channel_members_system()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type public.channel_type;
begin
  select type into v_type from public.channels where id = coalesce(new.channel_id, old.channel_id);
  if v_type is null or v_type <> 'group' then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.added_by is not null and new.added_by <> new.profile_id then
      perform public.system_message(new.channel_id, public.display_name(new.added_by) || ' a ajouté ' || public.display_name(new.profile_id));
    end if;
  elsif tg_op = 'UPDATE' and new.left_at is not null and old.left_at is null then
    perform public.system_message(new.channel_id, public.display_name(new.profile_id) || ' a quitté le groupe');
  elsif tg_op = 'UPDATE' and new.left_at is null and old.left_at is not null then
    perform public.system_message(new.channel_id, public.display_name(new.profile_id) || ' a rejoint le groupe');
  elsif tg_op = 'DELETE' then
    perform public.system_message(old.channel_id, public.display_name(old.profile_id) || ' a été retiré du groupe');
  end if;
  return coalesce(new, old);
end $$;

-- Remise à zéro complète, enfants d'abord
delete from public.message_reactions;
delete from public.channel_reads;
delete from public.channel_messages;
delete from public.channel_members;
delete from public.channels;
delete from public.notification_queue where kind = 'push_message'::public.notification_kind;
delete from public.notification_deferred where kind = 'push_message';
delete from public.notifications where kind = 'message';
