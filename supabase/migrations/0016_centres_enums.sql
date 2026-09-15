-- =============================================================================
-- 0016 — Vie des centres : valeurs d'énumérations (à exécuter seule, avant 0017)
-- -----------------------------------------------------------------------------
-- Postgres refuse d'utiliser une nouvelle valeur d'enum dans la transaction
-- qui l'a créée : cette migration ne contient que les ajouts d'enums.
-- =============================================================================

alter type public.user_role add value if not exists 'referent';
alter type public.post_status add value if not exists 'pending';
alter type public.post_status add value if not exists 'declined';
alter type public.notification_kind add value if not exists 'push_center';

do $$ begin
  create type public.center_type as enum ('cis', 'cs', 'cpi', 'cta_codis', 'direction', 'service');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.post_scope as enum ('departmental', 'center');
exception when duplicate_object then null; end $$;
