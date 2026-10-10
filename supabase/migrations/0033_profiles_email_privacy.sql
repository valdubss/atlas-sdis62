-- =============================================================================
-- 0033 — Adresses e-mail des agents réservées au service communication
-- -----------------------------------------------------------------------------
-- La table profiles reste lisible par tout agent connecté (RLS inchangée) mais
-- la colonne email n'est plus accordée au rôle authenticated : un compte
-- compromis ne peut plus exfiltrer l'annuaire des adresses. Les éditeurs et
-- administrateurs lisent les adresses via la vue profiles_editor (vide pour
-- les autres). L'agent lui-même lit son adresse dans son jeton de session.
-- Les fonctions security definer (export RGPD, affichage des noms, e-mails de
-- rattachement) ne sont pas concernées : elles s'exécutent avec les droits du
-- propriétaire.
-- =============================================================================

revoke select on public.profiles from anon, authenticated;
grant select (id, first_name, last_name, center_id, service_id, job_title, directory_visible, work_phone, present_me,
              center_joined_at, role, avatar_key, is_active, onboarded_at, created_at, updated_at)
  on public.profiles to authenticated;

-- Vue réservée aux éditeurs et administrateurs : toutes les colonnes, adresse comprise.
-- Exécutée avec les droits du propriétaire (pas de RLS) : le filtre is_editor() fait foi.
create or replace view public.profiles_editor as
  select p.* from public.profiles p where public.is_editor();
revoke all on public.profiles_editor from public, anon;
grant select on public.profiles_editor to authenticated, service_role;
