-- =============================================================================
-- ATLAS — migration 0007 : SSO, signalement intégré, accueil de première connexion
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Réglages d'authentification et adresse des signalements
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('auth_password_enabled',   'true'),
  ('auth_magic_link_enabled', 'true'),
  ('auth_sso_forced',         'false'),
  ('feedback_email',          '"contact.vdubois@gmail.com"')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Première connexion : profil prérempli depuis le SSO, accueil affiché une fois
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists onboarded_at timestamptz;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_full  text  := coalesce(v_meta ->> 'full_name', v_meta ->> 'name', '');
  v_first text  := coalesce(v_meta ->> 'given_name', v_meta ->> 'first_name', '');
  v_last  text  := coalesce(v_meta ->> 'family_name', v_meta ->> 'last_name', '');
begin
  if not public.is_allowed_email(new.email) then
    raise exception 'DOMAINE_NON_AUTORISE: %', split_part(new.email, '@', 2)
      using errcode = 'P0001';
  end if;

  -- Entra ID ne fournit parfois que "name" : on le découpe prénom / nom.
  if v_first = '' and v_last = '' and v_full <> '' then
    v_first := split_part(v_full, ' ', 1);
    v_last  := nullif(trim(substr(v_full, length(v_first) + 1)), '');
  end if;

  insert into public.profiles (id, email, first_name, last_name)
  values (new.id, lower(new.email), left(coalesce(v_first, ''), 60), left(coalesce(v_last, ''), 60));

  insert into public.user_settings (user_id) values (new.id);

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                        || jsonb_build_object('role', 'reader', 'is_active', true, 'onboarded', false)
  where id = new.id;

  return new;
end $$;

-- L'état « accueil terminé » est copié dans le JWT pour le middleware.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email then
      raise exception 'MODIFICATION_INTERDITE: role, is_active et email sont réservés aux administrateurs'
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

-- Les comptes existants n'ont pas à refaire l'accueil.
update public.profiles set onboarded_at = now() where onboarded_at is null;

-- -----------------------------------------------------------------------------
-- 3. Signalements
-- -----------------------------------------------------------------------------
create type public.feedback_category as enum ('bug', 'content', 'suggestion');
create type public.feedback_status   as enum ('new', 'seen', 'done');
alter type public.notification_kind add value if not exists 'email_feedback';

create table public.feedback (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles (id) on delete set null,
  category        public.feedback_category not null,
  description     text not null check (char_length(description) between 1 and 2000),
  screenshot_key  text,
  context         jsonb not null default '{}'::jsonb,   -- {path, user_agent, app_version, viewport}
  status          public.feedback_status not null default 'new',
  handled_by      uuid references public.profiles (id) on delete set null,
  handled_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index feedback_status_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

create policy feedback_insert_own on public.feedback for insert to authenticated
  with check (user_id = auth.uid());
create policy feedback_select on public.feedback for select to authenticated
  using (user_id = auth.uid() or public.is_editor());
create policy feedback_editor_update on public.feedback for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
create policy feedback_admin_delete on public.feedback for delete to authenticated
  using (public.is_admin());

-- 10 signalements par jour et par personne
create or replace function public.feedback_before_insert()
returns trigger language plpgsql as $$
begin
  perform public.check_rate_limit('feedback', 10, interval '1 day');
  return new;
end $$;
create trigger feedback_before_insert before insert on public.feedback for each row execute function public.feedback_before_insert();

-- E-mail au service communication à chaque nouveau signalement
create or replace function public.enqueue_feedback_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_queue (kind, payload)
  values ('email_feedback', jsonb_build_object('feedback_id', new.id));
  return new;
end $$;
create trigger feedback_enqueue_email after insert on public.feedback for each row execute function public.enqueue_feedback_email();

create trigger audit_feedback after update on public.feedback for each row
  when (old.status is distinct from new.status)
  execute function public.audit_trigger();

-- -----------------------------------------------------------------------------
-- 4. Médias : un agent peut envoyer ses propres images (capture d'écran d'un
--    signalement, photos d'une contribution au lot 6). Les vidéos restent éditeur.
-- -----------------------------------------------------------------------------
create policy media_insert_own_image on public.media for insert to authenticated
  with check (owner_id = auth.uid() and kind = 'image');
create policy media_update_own on public.media for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
