-- =============================================================================
-- 0048 — Date de naissance dans la liste des agents (première connexion)
-- -----------------------------------------------------------------------------
-- Le matricule seul se trouve facilement : la première connexion exige aussi la
-- date de naissance inscrite dans la liste importée par les administrateurs.
-- Matricule inconnu, date absente ou différente : même refus, rien ne part.
-- La table agents_registry reste réservée aux administrateurs (RLS) et au serveur
-- (clé service) : la date n'est jamais lisible par les agents.
-- =============================================================================

alter table public.agents_registry add column if not exists birth_date date;

comment on column public.agents_registry.birth_date is
  'Date de naissance de l''agent, exigée à la première connexion ; lue par le serveur et les administrateurs seulement.';
