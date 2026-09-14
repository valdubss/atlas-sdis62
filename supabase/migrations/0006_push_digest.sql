-- =============================================================================
-- ATLAS — migration 0006 : notifications push et digest
-- =============================================================================

-- Préférence : être notifié de toute nouvelle publication (les catégories étant
-- masquées, c'est le réglage principal ; push_pinned reste pour les épinglés).
alter table public.user_settings add column if not exists push_new_posts boolean not null default true;

-- -----------------------------------------------------------------------------
-- 1. File de notifications : une entrée par publication mise en ligne
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_post_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_text text;
begin
  if new.status = 'published' and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    v_text := coalesce(new.title, left(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g'), 120));
    insert into public.notification_queue (kind, payload)
    values (
      case when new.pinned_at is not null then 'push_pinned' else 'push_category' end,
      jsonb_build_object(
        'post_id', new.id,
        'slug', new.slug,
        'title', case when new.pinned_at is not null then 'À la une' else 'Nouvelle publication' end,
        'body', v_text,
        'url', '/post/' || new.slug
      )
    );
  end if;
  return new;
end $$;

drop trigger if exists posts_enqueue_notification on public.posts;
create trigger posts_enqueue_notification
  after insert or update of status, pinned_at on public.posts
  for each row execute function public.enqueue_post_notification();

-- -----------------------------------------------------------------------------
-- 2. Statistiques pour le studio (éditeurs)
-- -----------------------------------------------------------------------------
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
    'sent_7d', (select count(*) from public.notification_queue where status = 'sent' and sent_at > now() - interval '7 days')
  );
end $$;
revoke all on function public.get_notification_stats() from public;
grant execute on function public.get_notification_stats() to authenticated, service_role;

-- Purge de la file (entrées traitées de plus de 30 jours)
create or replace function public.purge_notification_queue()
returns void language sql security definer set search_path = public as $$
  delete from public.notification_queue where status <> 'pending' and created_at < now() - interval '30 days'
$$;
