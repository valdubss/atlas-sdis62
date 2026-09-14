-- =============================================================================
-- Flash 62 — données de démarrage (facultatif, environnement de dev / recette)
-- À exécuter après les migrations : supabase db reset applique seed.sql
-- automatiquement ; sinon collez ce fichier dans l'éditeur SQL du dashboard.
-- =============================================================================

insert into public.centers (name, slug, sort_order) values
  ('Direction départementale',   'direction',        0),
  ('Service communication',      'communication',    1),
  ('CIS Arras',                  'cis-arras',        10),
  ('CIS Béthune',                'cis-bethune',      20),
  ('CIS Boulogne-sur-Mer',       'cis-boulogne',     30),
  ('CIS Calais',                 'cis-calais',       40),
  ('CIS Lens',                   'cis-lens',         50),
  ('CIS Saint-Omer',             'cis-saint-omer',   60),
  ('CIS Montreuil-sur-Mer',      'cis-montreuil',    70),
  ('CIS Berck',                  'cis-berck',        80)
on conflict (slug) do nothing;
