-- 0022 — Notifications (lot 3 v3) : préférences détaillées, plage de silence,
-- une seule push par contenu, regroupement nocturne, ouvertures, statistiques.

-- -----------------------------------------------------------------------------
-- 1. Préférences
-- -----------------------------------------------------------------------------
alter table public.user_settings
  add column if not exists push_agenda boolean not null default true,        -- rappel la veille (dans l'app)
  add column if not exists push_messages text not null default 'all' check (push_messages in ('all', 'mentions', 'none')),
  add column if not exists quiet_start time not null default '21:00',
  add column if not exists quiet_end time not null default '07:00',
  add column if not exists hide_preview boolean not null default false;      -- push sans texte du message (messagerie)

-- -----------------------------------------------------------------------------
-- 2. Une seule push par contenu : clé de dédoublonnage calculée à l'insertion
-- -----------------------------------------------------------------------------
alter table public.notification_queue
  add column if not exists dedupe_key text,
  add column if not exists sent_count int not null default 0;   -- destinataires effectivement servis
create unique index if not exists notification_queue_dedupe_idx on public.notification_queue (dedupe_key) where dedupe_key is not null;

create or replace function public.notification_queue_dedupe()
returns trigger language plpgsql as $$
begin
  if new.dedupe_key is null then
    new.dedupe_key := new.kind::text || ':' || coalesce(
      new.payload->>'flash_id',
      case when new.payload ? 'user_id' then (new.payload->>'user_id') || ':' || coalesce(new.payload->>'post_id', new.payload->>'event_id', '') else null end,
      new.payload->>'post_id',
      new.payload->>'feedback_id');
    if new.dedupe_key = new.kind::text || ':' then new.dedupe_key := null; end if;
  end if;
  if new.dedupe_key is not null and exists (select 1 from public.notification_queue q where q.dedupe_key = new.dedupe_key) then
    return null; -- déjà en file ou déjà envoyée : jamais de rappel automatique
  end if;
  return new;
end $$;
drop trigger if exists notification_queue_dedupe on public.notification_queue;
create trigger notification_queue_dedupe before insert on public.notification_queue for each row execute function public.notification_queue_dedupe();

-- -----------------------------------------------------------------------------
-- 3. Pushs différées pendant la plage de silence (regroupées à la fin de la plage)
-- -----------------------------------------------------------------------------
create table public.notification_deferred (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  kind          text not null,
  payload       jsonb not null,
  deliver_after timestamptz not null,
  created_at    timestamptz not null default now()
);
create index notification_deferred_due_idx on public.notification_deferred (deliver_after);
alter table public.notification_deferred enable row level security; -- service_role seulement

-- -----------------------------------------------------------------------------
-- 4. Ouvertures de push (clic sur la notification), sans horodatage fin
-- -----------------------------------------------------------------------------
create table public.push_opens (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  tag      text not null,
  day      date not null default current_date,
  primary key (user_id, tag, day)
);
alter table public.push_opens enable row level security;
create policy push_opens_own on public.push_opens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.record_push_open(p_tag text)
returns void language sql security definer set search_path = public as $$
  insert into public.push_opens (user_id, tag) select auth.uid(), left(p_tag, 120) where auth.uid() is not null
  on conflict do nothing;
$$;
revoke all on function public.record_push_open(text) from public;
grant execute on function public.record_push_open(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Rappel d'agenda la veille : respecte la préférence de l'agent
-- -----------------------------------------------------------------------------
create or replace function public.notify_events_tomorrow()
returns int language plpgsql security definer set search_path = public as $$
declare v int := 0; r record;
begin
  for r in
    select e.id, e.title, e.location, e.starts_at
    from public.events e
    where e.status = 'published' and e.deleted_at is null and e.center_id is null
      and (e.starts_at at time zone 'Europe/Paris')::date = ((now() at time zone 'Europe/Paris')::date + 1)
      and not exists (select 1 from public.notifications n where n.kind = 'event' and n.url = '/agenda#' || e.id::text)
  loop
    insert into public.notifications (user_id, kind, title, body, url)
    select p.id, 'event', 'Demain : ' || r.title, coalesce(r.location, ''), '/agenda#' || r.id::text
    from public.profiles p
    left join public.user_settings s on s.user_id = p.id
    where p.is_active and coalesce(s.push_agenda, true);
    v := v + 1;
  end loop;
  return v;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Statistiques : activation des pushs par centre, ouverture par type de contenu
-- -----------------------------------------------------------------------------
create or replace function public.studio_notification_stats(p_days int default 30)
returns jsonb language sql security definer set search_path = public as $$
  select case when public.is_editor() then jsonb_build_object(
    'by_center', coalesce((
      select jsonb_agg(jsonb_build_object('center', c.name, 'agents', t.agents, 'subscribed', t.subscribed) order by c.name)
      from (
        select p.center_id, count(*) as agents,
               count(*) filter (where exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)) as subscribed
        from public.profiles p where p.is_active and p.center_id is not null group by p.center_id
      ) t join public.centers c on c.id = t.center_id
    ), '[]'::jsonb),
    'unattached', (select jsonb_build_object('agents', count(*), 'subscribed', count(*) filter (where exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)))
                   from public.profiles p where p.is_active and p.center_id is null),
    'by_kind', coalesce((
      select jsonb_agg(jsonb_build_object('kind', k.kind, 'pushes', k.pushes, 'sent', k.sent, 'opens', k.opens) order by k.kind)
      from (
        select q.kind::text as kind, count(*) as pushes, coalesce(sum(q.sent_count), 0) as sent,
               (select count(*) from public.push_opens o where o.tag in (select coalesce(q2.payload->>'post_id', q2.payload->>'flash_id') from public.notification_queue q2 where q2.kind = q.kind and q2.sent_at > now() - make_interval(days => p_days)))
                 as opens
        from public.notification_queue q
        where q.status = 'sent' and q.sent_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
          and q.kind::text like 'push_%'
        group by q.kind
      ) k
    ), '[]'::jsonb),
    'deferred_pending', (select count(*) from public.notification_deferred)
  ) else '{}'::jsonb end
$$;
revoke all on function public.studio_notification_stats(int) from public;
grant execute on function public.studio_notification_stats(int) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Distribution horaire (fin de plage de silence à l'heure près) : pg_cron + pg_net.
--    Vercel Hobby ne déclenche un cron qu'une fois par jour ; la base appelle
--    donc /api/cron/dispatch toutes les heures. À planifier une fois par un
--    administrateur :  select public.schedule_hourly_dispatch('https://…/api/cron/dispatch', '<CRON_SECRET>');
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.schedule_hourly_dispatch(p_url text, p_secret text)
returns text language plpgsql security definer set search_path = public, extensions, cron as $$
declare v_cmd text;
begin
  if not public.is_admin() and current_user <> 'postgres' then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'atlas-dispatch-hourly';
  v_cmd := format($f$select net.http_get(url := %L, headers := jsonb_build_object('Authorization', %L))$f$, p_url, 'Bearer ' || p_secret);
  perform cron.schedule('atlas-dispatch-hourly', '7 * * * *', v_cmd);
  return 'planifié : toutes les heures à h+07';
end $$;
revoke all on function public.schedule_hourly_dispatch(text, text) from public;
