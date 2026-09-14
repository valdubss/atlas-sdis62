-- =============================================================================
-- 0009 — Observabilité de la file de notifications
-- -----------------------------------------------------------------------------
-- `stats` : résumé lisible de l'envoi (« 12/14 envoyés, 2 expirés ») écrit par
-- dispatchNotifications, consultable dans Studio → Paramètres.
-- =============================================================================

alter table public.notification_queue add column if not exists stats text;

-- Statistiques enrichies pour Studio → Paramètres : dernier envoi et échecs 7 j
create or replace function public.get_notification_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_editor() then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'subscribers', (select count(distinct user_id) from public.push_subscriptions),
    'devices',     (select count(*) from public.push_subscriptions),
    'digest_recipients', (
      select count(*) from public.profiles p join public.user_settings s on s.user_id = p.id
      where p.is_active and s.digest_email
    ),
    'pending', (select count(*) from public.notification_queue where status = 'pending'),
    'sent_7d', (select count(*) from public.notification_queue where status = 'sent' and sent_at > now() - interval '7 days'),
    'failed_7d', (select count(*) from public.notification_queue where status = 'failed' and created_at > now() - interval '7 days'),
    'last', (
      select jsonb_build_object('kind', kind, 'status', status, 'at', coalesce(sent_at, created_at), 'stats', coalesce(stats, error))
      from public.notification_queue where kind in ('push_pinned', 'push_category')
      order by created_at desc limit 1
    )
  );
end $$;
