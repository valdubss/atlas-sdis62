-- =============================================================================
-- ATLAS — migration 0027 : fiabilité et confiance (lot 8 v3)
--   incidents (page /etat), journal d'audit consultable, envois différés
--   idempotents (réactions, messages).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Incidents déclarés par un administrateur (affichés 90 jours sur /etat)
-- -----------------------------------------------------------------------------
create table if not exists public.incidents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 3 and 120),
  service      text not null check (service in ('app', 'db', 'storage', 'video', 'notifications', 'messaging')),
  started_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  note         text check (note is null or char_length(note) <= 1000),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists incidents_started_idx on public.incidents (started_at desc);
alter table public.incidents enable row level security;
drop policy if exists incidents_select on public.incidents;
create policy incidents_select on public.incidents for select to authenticated using (true);
drop policy if exists incidents_admin on public.incidents;
create policy incidents_admin on public.incidents for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop trigger if exists audit_incidents on public.incidents;
create trigger audit_incidents after insert or update or delete on public.incidents for each row execute function public.audit_trigger();

-- -----------------------------------------------------------------------------
-- 2. Journal d'audit : index par acteur / action / période, RPC paginée (éditeurs)
-- -----------------------------------------------------------------------------
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_action_idx on public.audit_log (action, created_at desc);

create or replace function public.studio_audit(p_actor uuid default null, p_action text default null, p_entity text default null, p_from timestamptz default null, p_to timestamptz default null, p_cursor bigint default null, p_limit int default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_editor() then coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'action', a.action, 'entity_type', a.entity_type, 'entity_id', a.entity_id, 'created_at', a.created_at,
      'actor', (select jsonb_build_object('id', p.id, 'name', p.first_name || ' ' || p.last_name) from public.profiles p where p.id = a.actor_id),
      'summary', coalesce(a.after ->> 'title', a.after ->> 'name', a.after ->> 'email', a.before ->> 'title', a.before ->> 'name', a.before ->> 'email', a.entity_id),
      'changed', case when a.action = 'update' and a.before is not null and a.after is not null then
        (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(a.after) k where a.after -> k is distinct from a.before -> k and k not in ('updated_at')) else '[]'::jsonb end
    ) order by a.id desc), '[]'::jsonb) else null end
  from (
    select * from public.audit_log
    where (p_actor is null or actor_id = p_actor)
      and (p_action is null or action = p_action)
      and (p_entity is null or entity_type = p_entity)
      and (p_from is null or created_at >= p_from)
      and (p_to is null or created_at < p_to)
      and (p_cursor is null or id < p_cursor)
    order by id desc
    limit greatest(1, least(p_limit, 200))
  ) a
$$;

/** Acteurs et types présents dans le journal (filtres). */
create or replace function public.studio_audit_facets()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_editor() then jsonb_build_object(
    'actors', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.first_name || ' ' || p.last_name) order by p.last_name)
                        from public.profiles p where p.id in (select distinct actor_id from public.audit_log where actor_id is not null)), '[]'::jsonb),
    'entities', coalesce((select jsonb_agg(distinct entity_type) from public.audit_log), '[]'::jsonb)
  ) else null end
$$;

-- -----------------------------------------------------------------------------
-- 3. Envois différés idempotents : réaction « posée » (pas basculée), message par client_id
-- -----------------------------------------------------------------------------
create or replace function public.set_reaction(p_post_id uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_kind public.reaction_kind;
begin
  if auth.uid() is null then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  if not exists (select 1 from public.posts p where p.id = p_post_id and p.status = 'published' and p.deleted_at is null) then
    raise exception 'PUBLICATION_INDISPONIBLE' using errcode = 'P0001';
  end if;
  if p_kind is null or p_kind = '' then
    delete from public.reactions where post_id = p_post_id and user_id = auth.uid();
  else
    v_kind := p_kind::public.reaction_kind;
    insert into public.reactions (post_id, user_id, kind) values (p_post_id, auth.uid(), v_kind)
    on conflict (post_id, user_id) do update set kind = excluded.kind;
  end if;
  return jsonb_build_object(
    'my_reaction', (select kind from public.reactions where post_id = p_post_id and user_id = auth.uid()),
    'reaction_counts', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) as n from public.reactions where post_id = p_post_id group by kind) x));
end $$;

alter table public.channel_messages add column if not exists client_id uuid;
create unique index if not exists channel_messages_client_idx on public.channel_messages (client_id) where client_id is not null;

-- -----------------------------------------------------------------------------
-- 4. État des services (pour /api/health) : file de notifications et vidéos en attente
-- -----------------------------------------------------------------------------
create or replace function public.health_snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'now', now(),
    'queue_pending', (select count(*) from public.notification_queue where status = 'pending'),
    'queue_failed_24h', (select count(*) from public.notification_queue where status = 'failed' and created_at > now() - interval '24 hours'),
    'last_sent_at', (select max(sent_at) from public.notification_queue where status = 'sent'),
    'video_processing', (select count(*) from public.media where kind = 'video' and video_status in ('uploaded', 'processing')),
    'video_failed_24h', (select count(*) from public.media where kind = 'video' and video_status = 'failed' and updated_at > now() - interval '24 hours'),
    'media_failed_24h', (select count(*) from public.media where status = 'failed' and updated_at > now() - interval '24 hours'),
    'open_incidents', (select count(*) from public.incidents where resolved_at is null)
  )
$$;

-- -----------------------------------------------------------------------------
-- 5. Droits
-- -----------------------------------------------------------------------------
revoke all on function public.studio_audit(uuid, text, text, timestamptz, timestamptz, bigint, int) from public;
revoke all on function public.studio_audit_facets() from public;
revoke all on function public.set_reaction(uuid, text) from public;
revoke all on function public.health_snapshot() from public;
grant execute on function public.studio_audit(uuid, text, text, timestamptz, timestamptz, bigint, int) to authenticated;
grant execute on function public.studio_audit_facets() to authenticated;
grant execute on function public.set_reaction(uuid, text) to authenticated;
grant execute on function public.health_snapshot() to service_role;
