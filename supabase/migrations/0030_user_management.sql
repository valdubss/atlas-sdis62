-- =============================================================================
-- 0030 — Gestion des utilisateurs consolidée
-- -----------------------------------------------------------------------------
--  1. Centres : contacts de validation (chef de centre, responsable com) en texte
--     libre, saisis par un administrateur ; e-mail de repli pour les services.
--  2. Rattachement validé : un agent demande à rejoindre un centre ou un service,
--     le chef (ou le responsable com, ou le service communication) accepte par
--     e-mail (jeton signé, 7 jours) ou dans l'app. Le profil n'est rattaché qu'à
--     l'acceptation. Les administrateurs rattachent directement depuis le Studio.
--  3. Co-rédacteurs : un éditeur ajoute des agents sur une publication ; ils en
--     modifient le contenu sans publier, épingler ni supprimer.
--  4. Réactions activables ou non par publication (comme les commentaires).
--  5. Événements : ceux d'un centre ne sont visibles que par ses membres ; le
--     chef de centre et le responsable com les créent directement.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Contacts de validation
-- -----------------------------------------------------------------------------
alter table public.centers
  add column if not exists chief_name text,
  add column if not exists chief_email text,
  add column if not exists com_name text,
  add column if not exists com_email text;
alter table public.centers drop constraint if exists centers_contacts_len;
alter table public.centers add constraint centers_contacts_len check (
  (chief_name is null or char_length(chief_name) <= 120) and (chief_email is null or char_length(chief_email) <= 160)
  and (com_name is null or char_length(com_name) <= 120) and (com_email is null or char_length(com_email) <= 160));

insert into public.app_settings (key, value) values ('membership_fallback_email', '"jdubois@sdis62.fr"')
on conflict (key) do nothing;

/** L'agent connecté est membre (rattaché) du centre. */
create or replace function public.is_member_of_center(p_center uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.center_id = p_center and p.is_active)
$$;

/** Chef du centre : profil désigné, ou adresse e-mail saisie par l'administrateur. */
create or replace function public.is_center_chief(p_center uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.centers c join public.profiles p on p.id = auth.uid()
    where c.id = p_center and p.is_active
      and (c.chief_id = p.id or (c.chief_email is not null and lower(c.chief_email) = lower(p.email))))
$$;

/** Responsable communication du centre : référent désigné, ou adresse saisie. */
create or replace function public.is_center_com(p_center uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_referent_of(p_center) or exists (
    select 1 from public.centers c join public.profiles p on p.id = auth.uid()
    where c.id = p_center and p.is_active and c.com_email is not null and lower(c.com_email) = lower(p.email))
$$;

/** Peut agir pour le centre : service communication, chef de centre, responsable com. */
create or replace function public.can_manage_center(p_center uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_editor() or public.is_center_chief(p_center) or public.is_center_com(p_center)
$$;

revoke all on function public.is_member_of_center(uuid) from public;
revoke all on function public.is_center_chief(uuid) from public;
revoke all on function public.is_center_com(uuid) from public;
revoke all on function public.can_manage_center(uuid) from public;
grant execute on function public.is_member_of_center(uuid), public.is_center_chief(uuid), public.is_center_com(uuid), public.can_manage_center(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Demandes de rattachement
-- -----------------------------------------------------------------------------
create table if not exists public.membership_requests (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  center_id       uuid references public.centers (id) on delete cascade,
  service_id      uuid references public.services (id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  recipient_email text,
  requested_at    timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  decided_at      timestamptz,
  decided_by      uuid references public.profiles (id) on delete set null,
  decided_via     text check (decided_via in ('email', 'app', 'admin', 'system')),
  note            text check (note is null or char_length(note) <= 400),
  constraint membership_requests_target check ((center_id is null) <> (service_id is null))
);
create unique index if not exists membership_requests_pending_idx on public.membership_requests (profile_id) where status = 'pending';
create index if not exists membership_requests_center_idx on public.membership_requests (center_id, status) where center_id is not null;
create index if not exists membership_requests_service_idx on public.membership_requests (service_id, status) where service_id is not null;

-- Jetons des liens e-mail, jamais lisibles par l'app (ni par l'agent)
create table if not exists public.membership_tokens (
  request_id uuid primary key references public.membership_requests (id) on delete cascade,
  token_hash text not null unique
);
revoke all on public.membership_tokens from anon, authenticated;

alter table public.membership_requests enable row level security;
alter table public.membership_tokens enable row level security;
drop policy if exists membership_requests_select on public.membership_requests;
create policy membership_requests_select on public.membership_requests for select to authenticated
  using (profile_id = auth.uid() or public.is_editor() or (center_id is not null and public.can_manage_center(center_id)));

alter table public.notifications drop constraint if exists notifications_kind;
alter table public.notifications add constraint notifications_kind
  check (kind in ('post', 'flash', 'reply', 'event', 'story_reply', 'center', 'directory', 'message', 'membership', 'coeditor'));

/** Nom affichable d'un profil. */
create or replace function public.profile_display_name(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), p.email) from public.profiles p where p.id = p_id
$$;

/** Destinataires en app d'une demande pour un centre (chef, responsable com, référents). */
create or replace function public.center_manager_ids(p_center uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct p.id
  from public.centers c
  join public.profiles p on p.is_active and (
    p.id = c.chief_id
    or (c.chief_email is not null and lower(p.email) = lower(c.chief_email))
    or (c.com_email is not null and lower(p.email) = lower(c.com_email))
    or exists (select 1 from public.center_referents r where r.center_id = c.id and r.profile_id = p.id and r.is_active))
  where c.id = p_center
$$;

/**
 * L'agent demande son rattachement. Annule sa demande en attente précédente.
 * Renvoie le jeton (une seule fois) et le destinataire : le serveur envoie l'e-mail.
 */
create or replace function public.request_membership(p_center uuid default null, p_service uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := auth.uid();
  v_center record; v_service record;
  v_recipient text; v_fallback text; v_token text; v_id uuid; v_target text; v_kind text;
begin
  if v_me is null then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  if (p_center is null) = (p_service is null) then raise exception 'CIBLE_INVALIDE' using errcode = 'P0001'; end if;
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

  -- Notification dans l'app aux responsables qui ont un compte
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

/** Applique une décision (interne). */
create or replace function public.apply_membership_decision(p_request uuid, p_accept boolean, p_note text, p_by uuid, p_via text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_target text; v_url text;
begin
  select * into r from public.membership_requests where id = p_request for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', r.status); end if;
  if r.expires_at < now() then
    update public.membership_requests set status = 'expired', decided_at = now(), decided_via = 'system' where id = p_request;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if r.center_id is not null then
    select name into v_target from public.centers where id = r.center_id; v_url := '/centre';
  else
    select name into v_target from public.services where id = r.service_id; v_url := '/centre';
  end if;

  update public.membership_requests
  set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now(), decided_by = p_by, decided_via = p_via, note = nullif(left(coalesce(p_note, ''), 400), '')
  where id = p_request;

  if p_accept then
    perform set_config('atlas.membership', '1', true);
    update public.profiles
    set center_id = r.center_id, service_id = r.service_id,
        center_joined_at = case when r.center_id is not null then current_date else center_joined_at end
    where id = r.profile_id;
    insert into public.notifications (user_id, kind, title, body, url)
    values (r.profile_id, 'membership', 'Bienvenue à ' || v_target, 'Votre rattachement a été accepté.', v_url);
  else
    insert into public.notifications (user_id, kind, title, body, url)
    values (r.profile_id, 'membership', 'Rattachement à ' || v_target || ' refusé', coalesce(nullif(left(coalesce(p_note, ''), 400), ''), 'Rapprochez-vous de votre chef de centre.'), '/profil/centre');
  end if;
  return jsonb_build_object('ok', true, 'status', case when p_accept then 'accepted' else 'declined' end,
    'requester_name', public.profile_display_name(r.profile_id), 'requester_email', (select email from public.profiles where id = r.profile_id),
    'target_name', v_target, 'profile_id', r.profile_id);
end $$;

/** Décision par lien e-mail (jeton) : appelée par le serveur avec la clé service_role. */
create or replace function public.decide_membership_by_token(p_token text, p_accept boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_request uuid;
begin
  select request_id into v_request from public.membership_tokens where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if v_request is null then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  return public.apply_membership_decision(v_request, p_accept, p_note, null, 'email');
end $$;

/** Aperçu d'une demande par jeton (page de confirmation du lien e-mail). */
create or replace function public.peek_membership_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  select q.*, public.profile_display_name(q.profile_id) as requester_name,
         (select email from public.profiles where id = q.profile_id) as requester_email,
         coalesce((select name from public.centers where id = q.center_id), (select name from public.services where id = q.service_id)) as target_name
  into r
  from public.membership_requests q join public.membership_tokens t on t.request_id = q.id
  where t.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  return jsonb_build_object('ok', true, 'id', r.id, 'status', case when r.status = 'pending' and r.expires_at < now() then 'expired' else r.status end,
    'requester_name', r.requester_name, 'requester_email', r.requester_email, 'target_name', r.target_name, 'requested_at', r.requested_at, 'expires_at', r.expires_at);
end $$;

/** Décision dans l'app : chef / responsable com du centre, ou service communication ; services : administrateurs et éditeurs. */
create or replace function public.decide_membership(p_request uuid, p_accept boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if auth.uid() is null then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  select * into r from public.membership_requests where id = p_request;
  if not found then raise exception 'DEMANDE_INTROUVABLE' using errcode = 'P0001'; end if;
  if r.center_id is not null then
    if not public.can_manage_center(r.center_id) then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  elsif not public.is_editor() then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  return public.apply_membership_decision(p_request, p_accept, p_note, auth.uid(), case when public.is_admin() then 'admin' else 'app' end);
end $$;

/** L'agent retire sa demande en attente. */
create or replace function public.cancel_membership_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.membership_requests set status = 'cancelled', decided_at = now(), decided_via = 'system'
  where id = p_request and profile_id = auth.uid() and status = 'pending';
end $$;

/** Expiration (cron) : les demandes de plus de 7 jours sans réponse. */
create or replace function public.expire_membership_requests()
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  with e as (
    update public.membership_requests set status = 'expired', decided_at = now(), decided_via = 'system'
    where status = 'pending' and expires_at < now() returning profile_id
  )
  insert into public.notifications (user_id, kind, title, body, url)
  select profile_id, 'membership', 'Demande de rattachement expirée', 'Personne n''a répondu en sept jours. Vous pouvez la renouveler depuis votre profil.', '/profil/centre' from e;
  get diagnostics v = row_count;
  return v;
end $$;

revoke all on function public.request_membership(uuid, uuid) from public;
revoke all on function public.apply_membership_decision(uuid, boolean, text, uuid, text) from public;
revoke all on function public.decide_membership_by_token(text, boolean, text) from public;
revoke all on function public.peek_membership_by_token(text) from public;
revoke all on function public.decide_membership(uuid, boolean, text) from public;
revoke all on function public.cancel_membership_request(uuid) from public;
revoke all on function public.expire_membership_requests() from public;
revoke all on function public.center_manager_ids(uuid) from public;
revoke all on function public.profile_display_name(uuid) from public;
grant execute on function public.request_membership(uuid, uuid), public.decide_membership(uuid, boolean, text), public.cancel_membership_request(uuid) to authenticated, service_role;
grant execute on function public.decide_membership_by_token(text, boolean, text), public.peek_membership_by_token(text), public.expire_membership_requests(), public.apply_membership_decision(uuid, boolean, text, uuid, text) to service_role;
grant execute on function public.center_manager_ids(uuid), public.profile_display_name(uuid) to authenticated, service_role;

-- Le rattachement n'est plus modifiable par l'agent lui-même : il passe par une demande
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and coalesce(current_setting('atlas.role_sync', true), '') <> '1' then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email then
      raise exception 'MODIFICATION_INTERDITE: role, is_active et email sont réservés aux administrateurs'
        using errcode = '42501';
    end if;
    if coalesce(current_setting('atlas.membership', true), '') <> '1'
       and (new.center_id is distinct from old.center_id or new.service_id is distinct from old.service_id) then
      raise exception 'RATTACHEMENT_SOUMIS_A_VALIDATION: le rattachement passe par une demande validée par le chef de centre'
        using errcode = '42501';
    end if;
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.onboarded_at is distinct from old.onboarded_at then
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                          || jsonb_build_object('role', new.role::text, 'is_active', new.is_active, 'onboarded', new.onboarded_at is not null)
    where id = new.id;
  end if;

  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Co-rédacteurs
-- -----------------------------------------------------------------------------
create table if not exists public.post_editors (
  post_id    uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
create index if not exists post_editors_profile_idx on public.post_editors (profile_id);
alter table public.post_editors enable row level security;

create or replace function public.is_post_coeditor(p_post uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.post_editors e where e.post_id = p_post and e.profile_id = auth.uid())
$$;
revoke all on function public.is_post_coeditor(uuid) from public;
grant execute on function public.is_post_coeditor(uuid) to authenticated, service_role;

drop policy if exists post_editors_select on public.post_editors;
create policy post_editors_select on public.post_editors for select to authenticated using (public.is_editor() or profile_id = auth.uid());
drop policy if exists post_editors_editor on public.post_editors;
create policy post_editors_editor on public.post_editors for all to authenticated using (public.is_editor()) with check (public.is_editor());

drop policy if exists posts_coeditor_select on public.posts;
create policy posts_coeditor_select on public.posts for select to authenticated using (deleted_at is null and public.is_post_coeditor(id));
drop policy if exists posts_coeditor_update on public.posts;
create policy posts_coeditor_update on public.posts for update to authenticated using (public.is_post_coeditor(id)) with check (public.is_post_coeditor(id));
drop policy if exists post_media_coeditor on public.post_media;
create policy post_media_coeditor on public.post_media for all to authenticated using (public.is_post_coeditor(post_id)) with check (public.is_post_coeditor(post_id));
drop policy if exists polls_coeditor on public.polls;
create policy polls_coeditor on public.polls for all to authenticated using (public.is_post_coeditor(post_id)) with check (public.is_post_coeditor(post_id));
drop policy if exists poll_options_coeditor on public.poll_options;
create policy poll_options_coeditor on public.poll_options for all to authenticated using (public.is_post_coeditor(poll_id)) with check (public.is_post_coeditor(poll_id));
drop policy if exists post_versions_coeditor on public.post_versions;
create policy post_versions_coeditor on public.post_versions for select to authenticated using (public.is_post_coeditor(post_id));
drop policy if exists media_insert_coeditor_video on public.media;
create policy media_insert_coeditor_video on public.media for insert to authenticated
  with check (owner_id = auth.uid() and kind = 'video' and exists (select 1 from public.post_editors e where e.profile_id = auth.uid()));

-- Notification à l'agent ajouté
create or replace function public.post_editors_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  select coalesce(nullif(title, ''), 'Publication sans titre') into v_title from public.posts where id = new.post_id;
  insert into public.notifications (user_id, kind, title, body, url)
  values (new.profile_id, 'coeditor', 'Vous êtes co-rédacteur : ' || v_title, coalesce(public.profile_display_name(new.added_by), 'Le service communication') || ' vous a ajouté. Modifiez le texte et les médias depuis le Studio.', '/studio/posts/' || new.post_id::text);
  return new;
end $$;
drop trigger if exists post_editors_notify on public.post_editors;
create trigger post_editors_notify after insert on public.post_editors for each row execute function public.post_editors_notify();

-- Garde-fous : le co-rédacteur modifie le contenu, jamais l'état de publication
create or replace function public.posts_center_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_editor boolean := public.is_editor();
begin
  if auth.uid() is null then return new; end if; -- service_role / éditeur SQL

  if not v_editor and tg_op = 'UPDATE' and public.is_post_coeditor(old.id) then
    if new.status is distinct from old.status or new.scheduled_at is distinct from old.scheduled_at
       or new.published_at is distinct from old.published_at or new.pinned_at is distinct from old.pinned_at
       or new.deleted_at is distinct from old.deleted_at or new.author_id is distinct from old.author_id
       or new.author_display is distinct from old.author_display or new.scope is distinct from old.scope
       or new.center_id is distinct from old.center_id or new.submitted_by is distinct from old.submitted_by
       or new.promoted_from_id is distinct from old.promoted_from_id then
      raise exception 'ACCES_REFUSE: un co-rédacteur modifie le contenu, sans publier ni supprimer' using errcode = '42501';
    end if;
    return new;
  end if;

  if not v_editor then
    -- Un non-éditeur n'écrit jamais dans le fil départemental
    if new.scope = 'departmental' then
      raise exception 'ACCES_REFUSE: fil départemental réservé au service communication' using errcode = '42501';
    end if;
    if not public.is_referent_of(new.center_id) then
      raise exception 'ACCES_REFUSE: vous n''êtes pas référent de ce centre' using errcode = '42501';
    end if;
    if new.status <> 'pending' then
      raise exception 'ACCES_REFUSE: seule une proposition en attente est possible' using errcode = '42501';
    end if;
    if new.pinned_at is not null or new.promoted_from_id is not null then
      raise exception 'ACCES_REFUSE' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.submitted_by := auth.uid();
      new.author_id := auth.uid();
      new.author_display := 'agent';
      if (select count(*) from public.posts p where p.submitted_by = auth.uid() and p.status = 'pending' and p.deleted_at is null) >= 10 then
        raise exception 'LIMITE_PROPOSITIONS: 10 propositions en attente au maximum' using errcode = 'P0021';
      end if;
    else
      if old.status <> 'pending' or old.submitted_by is distinct from auth.uid() then
        raise exception 'ACCES_REFUSE: proposition déjà traitée' using errcode = '42501';
      end if;
      new.submitted_by := old.submitted_by;
      new.center_id := old.center_id;
      new.reviewed_by := null; new.reviewed_at := null; new.moderation_message := old.moderation_message;
    end if;
  else
    -- Éditeur : traçabilité de la validation / du refus
    if tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('published', 'declined') then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
      if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
    end if;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Réactions activables par publication
-- -----------------------------------------------------------------------------
alter table public.posts add column if not exists reactions_enabled boolean not null default true;

create or replace function public.toggle_reaction(p_post_id uuid, p_kind public.reaction_kind)
returns jsonb language plpgsql as $$
declare
  v_current public.reaction_kind;
begin
  if not exists (select 1 from public.posts p where p.id = p_post_id and p.reactions_enabled) then
    raise exception 'REACTIONS_DESACTIVEES' using errcode = 'P0001';
  end if;
  select kind into v_current from public.reactions
  where post_id = p_post_id and user_id = auth.uid();

  if v_current = p_kind then
    delete from public.reactions where post_id = p_post_id and user_id = auth.uid();
  elsif v_current is null then
    insert into public.reactions (post_id, user_id, kind) values (p_post_id, auth.uid(), p_kind);
  else
    update public.reactions set kind = p_kind, created_at = now()
    where post_id = p_post_id and user_id = auth.uid();
  end if;

  return jsonb_build_object(
    'reaction_counts', (
      select coalesce(jsonb_object_agg(r.kind, r.n), '{}'::jsonb)
      from (select kind, count(*) n from public.reactions where post_id = p_post_id group by kind) r
    ),
    'my_reaction', (
      select kind from public.reactions where post_id = p_post_id and user_id = auth.uid()
    )
  );
end $$;

create or replace function public.set_reaction(p_post_id uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_kind public.reaction_kind;
begin
  if auth.uid() is null then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  if not exists (select 1 from public.posts p where p.id = p_post_id and p.status = 'published' and p.deleted_at is null) then
    raise exception 'PUBLICATION_INDISPONIBLE' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.posts p where p.id = p_post_id and p.reactions_enabled) then
    raise exception 'REACTIONS_DESACTIVEES' using errcode = 'P0001';
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

create or replace function public.post_to_json(p public.posts)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id',               p.id,
    'type',             p.type,
    'slug',             p.slug,
    'title',            p.title,
    'location',         p.location,
    'scope',            p.scope,
    'center_id',        p.center_id,
    'submitted_by',     p.submitted_by,
    'moderation_message', p.moderation_message,
    'promoted_from_id', p.promoted_from_id,
    'excerpt',          p.excerpt,
    'body',             p.body,
    'tags',             to_jsonb(p.tags),
    'status',           p.status,
    'published_at',     p.published_at,
    'scheduled_at',     p.scheduled_at,
    'pinned_at',        p.pinned_at,
    'comments_enabled', p.comments_enabled,
    'reactions_enabled', p.reactions_enabled,
    'author_id',        p.author_id,
    'author_display',   p.author_display,
    'category', (
      select jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
      from public.categories c where c.id = p.category_id
    ),
    'center', (
      select jsonb_build_object('id', ce.id, 'name', ce.name, 'slug', ce.slug)
      from public.centers ce where ce.id = p.center_id
    ),
    'author', (
      select jsonb_build_object(
        'name', case when p.author_display = 'service_com' then 'Service Communication'
                     else trim(pr.first_name || ' ' || pr.last_name) end,
        'avatar_key', case when p.author_display = 'service_com' then null else pr.avatar_key end
      )
      from public.profiles pr where pr.id = p.author_id
    ),
    'cover', (
      select public.media_to_json(m)
      from public.media m where m.id = p.cover_media_id and m.status = 'ready'
    ),
    'media', coalesce((
      select jsonb_agg(public.media_to_json(m) || jsonb_build_object('alt', coalesce(pm.alt, m.alt), 'position', pm.position, 'caption', pm.caption) order by pm.position)
      from public.post_media pm join public.media m on m.id = pm.media_id
      where pm.post_id = p.id and m.status = 'ready'
    ), '[]'::jsonb),
    'poll', (
      select jsonb_build_object(
        'question', pl.question,
        'closes_at', pl.closes_at,
        'total_votes', public.poll_total_votes(pl.post_id),
        'my_option_id', (select v.option_id from public.poll_votes v where v.poll_id = pl.post_id and v.user_id = auth.uid()),
        'options', (
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'label', o.label, 'position', o.position,
            'votes', public.poll_option_votes(o.id)
          ) order by o.position)
          from public.poll_options o where o.poll_id = pl.post_id
        )
      )
      from public.polls pl where pl.post_id = p.id
    ),
    'reaction_counts', (
      select coalesce(jsonb_object_agg(r.kind, r.n), '{}'::jsonb)
      from (select kind, count(*) n from public.reactions where post_id = p.id group by kind) r
    ),
    'comment_count', (
      select count(*) from public.comments c where c.post_id = p.id and c.status = 'visible'
    ),
    'my_reaction', (
      select r.kind from public.reactions r where r.post_id = p.id and r.user_id = auth.uid()
    ),
    'is_bookmarked', exists (
      select 1 from public.bookmarks b where b.post_id = p.id and b.user_id = auth.uid()
    )
  )
$$;

-- -----------------------------------------------------------------------------
-- 5. Événements : visibilité par centre, création directe par les responsables
-- -----------------------------------------------------------------------------
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (
    public.is_editor()
    or (center_id is not null and public.can_manage_center(center_id))
    or (status = 'published' and deleted_at is null and (center_id is null or public.is_member_of_center(center_id)))
  );
drop policy if exists events_manager_all on public.events;
create policy events_manager_all on public.events for all to authenticated
  using (center_id is not null and public.can_manage_center(center_id))
  with check (center_id is not null and public.can_manage_center(center_id));

create or replace function public.events_center_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_editor() then
    if tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('published', 'declined') then
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    end if;
    return new;
  end if;
  if new.center_id is null then
    raise exception 'ACCES_REFUSE: événement réservé à vos centres' using errcode = '42501';
  end if;
  -- Chef de centre ou responsable com : création directe, visible des membres du centre
  if public.is_center_chief(new.center_id) or public.is_center_com(new.center_id) then
    if new.status not in ('draft', 'published') then
      raise exception 'ACCES_REFUSE: un événement de centre est publié ou en brouillon' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then new.author_id := auth.uid(); new.submitted_by := auth.uid(); end if;
    if tg_op = 'UPDATE' then new.center_id := old.center_id; end if;
    new.reviewed_by := null; new.reviewed_at := null; new.moderation_message := null;
    return new;
  end if;
  raise exception 'ACCES_REFUSE: événement réservé au chef de centre et au responsable communication' using errcode = '42501';
end $$;

-- Membres du centre prévenus d'un nouvel événement publié
create or replace function public.events_center_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.center_id is null or new.status <> 'published' or new.deleted_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' and old.deleted_at is null then return new; end if;
  insert into public.notifications (user_id, kind, title, body, url)
  select p.id, 'event', 'Événement du centre : ' || new.title,
         to_char(new.starts_at at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI') || coalesce(' · ' || new.location, ''),
         '/centre#semaine'
  from public.profiles p left join public.user_settings s on s.user_id = p.id
  where p.center_id = new.center_id and p.is_active and p.id is distinct from new.author_id and coalesce(s.push_agenda, true);
  return new;
end $$;
drop trigger if exists events_center_notify on public.events;
create trigger events_center_notify after insert or update of status, deleted_at on public.events
  for each row execute function public.events_center_notify();

-- Rappel de la veille : événements du département pour tous, du centre pour ses membres
create or replace function public.notify_events_tomorrow()
returns int language plpgsql security definer set search_path = public as $$
declare v int := 0; r record;
begin
  for r in
    select e.id, e.title, e.location, e.starts_at, e.center_id
    from public.events e
    where e.status = 'published' and e.deleted_at is null
      and (e.starts_at at time zone 'Europe/Paris')::date = ((now() at time zone 'Europe/Paris')::date + 1)
      and not exists (select 1 from public.notifications n where n.kind = 'event' and n.url = case when e.center_id is null then '/agenda#' else '/centre#' end || e.id::text)
  loop
    insert into public.notifications (user_id, kind, title, body, url)
    select p.id, 'event', 'Demain : ' || r.title, coalesce(r.location, ''), case when r.center_id is null then '/agenda#' else '/centre#' end || r.id::text
    from public.profiles p
    left join public.user_settings s on s.user_id = p.id
    where p.is_active and coalesce(s.push_agenda, true) and (r.center_id is null or p.center_id = r.center_id);
    v := v + 1;
  end loop;
  return v;
end $$;
