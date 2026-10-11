-- =============================================================================
-- 0038 — Mot de passe obligatoire
--  Supabase donne un mot de passe aléatoire à tout compte créé sans mot de passe :
--  la colonne auth.users.encrypted_password ne dit donc pas si l'agent en a choisi
--  un. ATLAS le note lui-même dans profiles.password_set_at (accueil, profil,
--  administrateur) et le recopie dans le jeton (app_metadata.password_set) : le
--  proxy renvoie tout agent sans mot de passe vers l'écran qui le lui fait choisir.
--  Les e-mails (première connexion, mot de passe oublié) partent exclusivement par
--  le transport d'ATLAS : Supabase n'en envoie plus aucun.
-- =============================================================================

-- Première version de cette migration (drapeau d'après encrypted_password) : retirée
drop trigger if exists auth_users_password_flag on auth.users;
drop function if exists public.auth_users_password_flag();

alter table public.profiles add column if not exists password_set_at timestamptz;

-- Comptes existants : les éditeurs et administrateurs ont tous défini leur mot de passe ;
-- les lecteurs arrivés par lien le choisiront à leur prochaine visite
update public.profiles set password_set_at = coalesce(password_set_at, now()) where role in ('editor', 'admin');

/** L'agent connecté vient de définir son mot de passe. */
create or replace function public.mark_password_set()
returns void language sql security definer set search_path = public as $$
  update public.profiles set password_set_at = now() where id = auth.uid()
$$;
revoke all on function public.mark_password_set() from public;
grant execute on function public.mark_password_set() to authenticated, service_role;

-- Miroir dans le jeton (les autres triggers fusionnent app_metadata sans écraser cette clé)
create or replace function public.profiles_password_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('password_set', new.password_set_at is not null)
  where id = new.id;
  return new;
end $$;
drop trigger if exists profiles_password_flag on public.profiles;
create trigger profiles_password_flag after insert or update of password_set_at on public.profiles
  for each row execute function public.profiles_password_flag();

update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('password_set', p.password_set_at is not null)
from public.profiles p where p.id = u.id;
