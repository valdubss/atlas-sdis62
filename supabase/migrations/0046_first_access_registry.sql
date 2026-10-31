-- 0046 — Première connexion par matricule : référentiel des agents (liste fournie par le SDIS),
-- matricule / e-mail personnel / statut sur le profil, mot de passe temporaire envoyé sur
-- l'adresse personnelle, mode de première connexion choisi dans les réglages.

-- 1. Référentiel des agents autorisés (importé par les administrateurs). Lu par le serveur
--    (clé service_role) à la première connexion : un matricule absent est refusé avant tout envoi.
create table if not exists public.agents_registry (
  matricule    text primary key,
  email        text,                       -- adresse @sdis62.fr attendue (facultative)
  last_name    text,
  first_name   text,
  center_name  text,
  status       text check (status in ('spv', 'spp', 'jsp', 'pats')),
  note         text,
  imported_at  timestamptz not null default now()
);
create index if not exists agents_registry_email_idx on public.agents_registry (lower(email));
alter table public.agents_registry enable row level security;
drop policy if exists agents_registry_admin on public.agents_registry;
create policy agents_registry_admin on public.agents_registry for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 2. Profil : matricule (identifiant de connexion possible), e-mail personnel, statut,
--    échéance du mot de passe temporaire.
alter table public.profiles
  add column if not exists matricule text,
  add column if not exists personal_email text,
  add column if not exists status text check (status in ('spv', 'spp', 'jsp', 'pats')),
  add column if not exists temp_password_expires_at timestamptz;
create unique index if not exists profiles_matricule_key on public.profiles (upper(matricule)) where matricule is not null;
-- Lecture par les agents connectés : matricule et statut (les droits sont donnés colonne par
-- colonne depuis la migration 0033 ; l'adresse personnelle reste réservée au serveur et aux admins)
grant select (matricule, status) on public.profiles to authenticated;
grant update (status) on public.profiles to authenticated;

-- Le matricule et l'échéance ne se modifient pas depuis l'app (serveur et administrateurs seulement)
create or replace function public.profiles_identity_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.matricule is distinct from old.matricule
       or new.temp_password_expires_at is distinct from old.temp_password_expires_at then
      raise exception 'MODIFICATION_INTERDITE: matricule réservé aux administrateurs' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_identity_guard on public.profiles;
create trigger profiles_identity_guard before update of matricule, temp_password_expires_at on public.profiles
  for each row execute function public.profiles_identity_guard();

-- 3. Réglage : mode de première connexion. "link" = lien e-mail (comportement actuel),
--    "registry" = matricule + e-mail SDIS + e-mail personnel, mot de passe temporaire.
insert into public.app_settings (key, value) values ('auth_first_access', '"link"') on conflict (key) do nothing;
