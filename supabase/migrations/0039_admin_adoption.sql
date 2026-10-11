-- =============================================================================
-- 0039 — Espace d'administration : tableau de bord d'adoption
--  Chiffres réservés aux administrateurs : comptes, inscriptions par semaine,
--  agents jamais connectés, centres sans contact ou sans membre, demandes en
--  attente. Lit auth.users (dernière connexion) en SECURITY DEFINER.
-- =============================================================================

create or replace function public.admin_adoption_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  select jsonb_build_object(
    'generated_at', now(),
    'accounts', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'active', (select count(*) from public.profiles where is_active),
      'onboarded', (select count(*) from public.profiles where onboarded_at is not null),
      'with_password', (select count(*) from public.profiles where password_set_at is not null),
      'readers', (select count(*) from public.profiles where role = 'reader' and is_active),
      'editors', (select count(*) from public.profiles where role = 'editor' and is_active),
      'admins', (select count(*) from public.profiles where role = 'admin' and is_active),
      'referents', (select count(*) from public.profiles where role = 'referent' and is_active),
      'new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'new_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
      'never_signed_in', (select count(*) from auth.users u join public.profiles p on p.id = u.id where u.last_sign_in_at is null and p.is_active),
      'seen_7d', (select count(*) from auth.users u join public.profiles p on p.id = u.id where u.last_sign_in_at > now() - interval '7 days'),
      'seen_30d', (select count(*) from auth.users u join public.profiles p on p.id = u.id where u.last_sign_in_at > now() - interval '30 days'),
      'attached', (select count(*) from public.profiles where is_active and (center_id is not null or service_id is not null)),
      'unattached', (select count(*) from public.profiles where is_active and center_id is null and service_id is null)),
    'weekly', (
      select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'signups', coalesce(s.n, 0), 'active', coalesce(a.n, 0)) order by w.week), '[]'::jsonb)
      from (select generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as week) w
      left join (select date_trunc('week', created_at) as week, count(*) as n from public.profiles where created_at > now() - interval '12 weeks' group by 1) s on s.week = w.week
      left join (select date_trunc('week', u.last_sign_in_at) as week, count(*) as n from auth.users u where u.last_sign_in_at > now() - interval '12 weeks' group by 1) a on a.week = w.week),
    'centers', jsonb_build_object(
      'total', (select count(*) from public.centers where is_active),
      'without_contact', (select count(*) from public.centers where is_active and chief_email is null and com_email is null),
      'without_members', (select count(*) from public.centers c where c.is_active and not exists (select 1 from public.profiles p where p.center_id = c.id and p.is_active)),
      'with_notes', (select count(distinct center_id) from public.center_notes where deleted_at is null),
      'list_without_contact', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'members', (select count(*) from public.profiles p where p.center_id = c.id and p.is_active)) order by c.name), '[]'::jsonb)
                               from public.centers c where c.is_active and c.chief_email is null and c.com_email is null)),
    'requests', jsonb_build_object(
      'pending', (select count(*) from public.membership_requests where status = 'pending'),
      'accepted_30d', (select count(*) from public.membership_requests where status = 'accepted' and decided_at > now() - interval '30 days'),
      'declined_30d', (select count(*) from public.membership_requests where status = 'declined' and decided_at > now() - interval '30 days')),
    'content', jsonb_build_object(
      'posts_30d', (select count(*) from public.posts where status = 'published' and published_at > now() - interval '30 days' and deleted_at is null),
      'notes_30d', (select count(*) from public.center_notes where published_at > now() - interval '30 days' and deleted_at is null),
      'messages_7d', (select count(*) from public.channel_messages where created_at > now() - interval '7 days' and deleted_at is null),
      'comments_30d', (select count(*) from public.comments where created_at > now() - interval '30 days'),
      'push_devices', (select count(*) from public.push_subscriptions))
  ) into v;
  return v;
end $$;
revoke all on function public.admin_adoption_stats() from public;
grant execute on function public.admin_adoption_stats() to authenticated, service_role;

/** Dernière connexion de comptes (liste d'identifiants) — administrateurs seulement. */
create or replace function public.admin_last_sign_in(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_admin()
    then coalesce((select jsonb_object_agg(u.id, u.last_sign_in_at) from auth.users u where u.id = any (p_ids)), '{}'::jsonb)
    else '{}'::jsonb end
$$;
revoke all on function public.admin_last_sign_in(uuid[]) from public;
grant execute on function public.admin_last_sign_in(uuid[]) to authenticated, service_role;
