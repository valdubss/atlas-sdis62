-- =============================================================================
-- 0012 — Agenda : événements du service (remplace l'onglet Galerie)
-- -----------------------------------------------------------------------------
-- Le service communication publie des événements (cérémonies, exercices,
-- JSP, congrès…) ; les agents les consultent et peuvent les ajouter à leur
-- calendrier (fichier .ics). Pas de notification push : elles restent
-- réservées aux publications.
-- =============================================================================

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  location     text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  post_id      uuid references public.posts (id) on delete set null,
  status       text not null default 'published',
  author_id    uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint events_title_len   check (char_length(title) between 1 and 120),
  constraint events_desc_len    check (description is null or char_length(description) <= 2000),
  constraint events_loc_len     check (location is null or char_length(location) <= 160),
  constraint events_status      check (status in ('draft', 'published')),
  constraint events_range       check (ends_at is null or ends_at >= starts_at)
);
create index events_starts_idx on public.events (starts_at) where deleted_at is null;
create index events_post_idx on public.events (post_id) where post_id is not null;

create trigger events_set_updated_at before update on public.events for each row execute function public.set_updated_at();
create trigger audit_events after insert or update or delete on public.events for each row execute function public.audit_trigger();

alter table public.events enable row level security;

-- Agents : événements publiés et non supprimés ; éditeurs : tout
create policy events_select on public.events for select to authenticated
  using ((status = 'published' and deleted_at is null) or public.is_editor());
create policy events_editor on public.events for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

-- -----------------------------------------------------------------------------
-- Commentaires : un agent peut supprimer les siens (les réponses suivent)
-- -----------------------------------------------------------------------------
create policy comments_delete_own on public.comments for delete to authenticated
  using (user_id = auth.uid());
