-- 0029 — Suppression d'un compte : le garde-fou des commentaires acceptait toute
-- modification sauf le changement d'auteur, y compris la mise à null déclenchée
-- par la suppression du compte (on delete set null) et par anonymize_user_data().
-- Résultat : impossible de supprimer un utilisateur ayant commenté
-- (MODIFICATION_INTERDITE levé pendant la cascade). L'anonymisation est désormais
-- autorisée : auteur retiré (null) sans autre changement de contenu.

create or replace function public.comments_before_update()
returns trigger language plpgsql as $$
begin
  -- Anonymisation (suppression du compte, RGPD) : seul l'auteur passe à null
  if old.user_id is not null and new.user_id is null
     and new.body is not distinct from old.body
     and new.post_id is not distinct from old.post_id
     and new.parent_id is not distinct from old.parent_id then
    return new;
  end if;

  if public.is_editor() then
    if new.user_id is distinct from auth.uid() and new.body is distinct from old.body then
      raise exception 'MODIFICATION_INTERDITE: un éditeur ne modifie pas le texte d''un agent' using errcode = '42501';
    end if;
    if new.post_id is distinct from old.post_id or new.parent_id is distinct from old.parent_id or new.user_id is distinct from old.user_id then
      raise exception 'MODIFICATION_INTERDITE' using errcode = '42501';
    end if;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  else
    if new.status is distinct from old.status
       or new.post_id is distinct from old.post_id
       or new.parent_id is distinct from old.parent_id
       or new.user_id is distinct from old.user_id then
      raise exception 'MODIFICATION_INTERDITE' using errcode = '42501';
    end if;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  return new;
end $$;
