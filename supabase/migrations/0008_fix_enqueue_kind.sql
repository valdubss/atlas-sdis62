-- =============================================================================
-- 0008 — Correctif : mise en ligne d'une publication impossible
-- -----------------------------------------------------------------------------
-- Le trigger enqueue_post_notification (0006) insérait la valeur de `kind`
-- via une expression CASE de type text ; Postgres refuse la conversion
-- implicite vers l'enum notification_kind (erreur 42804), ce qui bloquait
-- toute publication depuis l'application de 0006. Cast explicite ajouté.
-- =============================================================================

create or replace function public.enqueue_post_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_text text;
begin
  if new.status = 'published' and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    v_text := coalesce(new.title, left(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g'), 120));
    insert into public.notification_queue (kind, payload)
    values (
      (case when new.pinned_at is not null then 'push_pinned' else 'push_category' end)::public.notification_kind,
      jsonb_build_object(
        'post_id', new.id,
        'slug', new.slug,
        'title', case when new.pinned_at is not null then 'À la une' else 'Nouvelle publication' end,
        'body', v_text,
        'url', '/post/' || new.slug
      )
    );
  end if;
  return new;
end $$;
