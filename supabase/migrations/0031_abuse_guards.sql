-- =============================================================================
-- 0031 — Garde-fous d'abus (suite de la revue sécurité)
--  - demandes de rattachement : 3 par agent et par jour (chaque demande envoie un e-mail)
--  - messagerie : 60 messages par minute et par agent, comme les commentaires
--  - fonctions d'entretien : exécutables par service_role seulement
-- =============================================================================

create or replace function public.request_membership(p_center uuid default null, p_service uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := auth.uid();
  v_center record; v_service record;
  v_recipient text; v_fallback text; v_token text; v_id uuid; v_target text; v_kind text;
begin
  if v_me is null then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  if (p_center is null) = (p_service is null) then raise exception 'CIBLE_INVALIDE' using errcode = 'P0001'; end if;
  -- Trois demandes par jour : chaque demande déclenche un e-mail au chef de centre
  perform public.check_rate_limit('membership', 3, interval '1 day');
  select value #>> '{}' into v_fallback from public.app_settings where key = 'membership_fallback_email';
  if p_center is not null then
    select * into v_center from public.centers where id = p_center and is_active;
    if not found then raise exception 'CENTRE_INTROUVABLE' using errcode = 'P0001'; end if;
    if exists (select 1 from public.profiles where id = v_me and center_id = p_center) then raise exception 'DEJA_RATTACHE' using errcode = 'P0001'; end if;
    v_recipient := coalesce(nullif(v_center.chief_email, ''), nullif(v_center.com_email, ''), v_fallback);
    v_target := v_center.name; v_kind := 'center';
  else
    select * into v_service from public.services where id = p_service and is_active;
    if not found then raise exception 'SERVICE_INTROUVABLE' using errcode = 'P0001'; end if;
    if exists (select 1 from public.profiles where id = v_me and service_id = p_service) then raise exception 'DEJA_RATTACHE' using errcode = 'P0001'; end if;
    v_recipient := coalesce(nullif(v_service.email, ''), v_fallback);
    v_target := v_service.name; v_kind := 'service';
  end if;

  update public.membership_requests set status = 'cancelled', decided_at = now(), decided_via = 'system'
  where profile_id = v_me and status = 'pending';

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.membership_requests (profile_id, center_id, service_id, recipient_email)
  values (v_me, p_center, p_service, v_recipient) returning id into v_id;
  insert into public.membership_tokens (request_id, token_hash) values (v_id, encode(extensions.digest(v_token, 'sha256'), 'hex'));

  if p_center is not null then
    insert into public.notifications (user_id, kind, title, body, url)
    select m, 'membership', public.profile_display_name(v_me) || ' demande à rejoindre ' || v_target, 'Acceptez ou refusez depuis la page du centre.', '/centre/' || v_center.slug || '#demandes'
    from public.center_manager_ids(p_center) m where m <> v_me;
  else
    insert into public.notifications (user_id, kind, title, body, url)
    select p.id, 'membership', public.profile_display_name(v_me) || ' demande à rejoindre ' || v_target, 'Acceptez ou refusez depuis Studio → Centres.', '/studio/centres/demandes'
    from public.profiles p where p.is_active and p.role = 'admin' and p.id <> v_me;
  end if;

  return jsonb_build_object('id', v_id, 'token', v_token, 'recipient_email', v_recipient, 'target_name', v_target, 'target_kind', v_kind,
    'requester_name', public.profile_display_name(v_me), 'requester_email', (select email from public.profiles where id = v_me));
end $$;

-- Messagerie : même limite que les commentaires
create or replace function public.channel_messages_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    perform public.check_rate_limit('messages', 60, interval '1 minute');
  end if;
  return new;
end $$;
drop trigger if exists channel_messages_rate_limit on public.channel_messages;
create trigger channel_messages_rate_limit before insert on public.channel_messages
  for each row execute function public.channel_messages_rate_limit();

-- Fonctions d'entretien : service_role seulement (check_rate_limit reste appelable en interne)
revoke all on function public.purge_rate_limit_events() from public, anon, authenticated;
revoke all on function public.purge_notification_queue() from public, anon, authenticated;
grant execute on function public.purge_rate_limit_events(), public.purge_notification_queue() to service_role;
revoke all on function public.check_rate_limit(text, int, interval) from public, anon;
grant execute on function public.check_rate_limit(text, int, interval) to authenticated, service_role;
