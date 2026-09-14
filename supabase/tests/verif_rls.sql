-- =============================================================================
-- Vérification manuelle de la RLS (à coller dans l'éditeur SQL Supabase).
-- Tout est exécuté dans une transaction annulée à la fin : rien n'est persisté.
-- Chaque ligne "OK" confirme une règle ; une ligne "ECHEC" signale un problème.
-- =============================================================================
begin;

do $$
declare
  v_reader uuid := gen_random_uuid();
  v_editor uuid := gen_random_uuid();
  v_post   uuid;
  v_ok     boolean;
begin
  -- 1. Création de deux utilisateurs (déclenche handle_new_user)
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_reader, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test.lecteur@sdis62.fr', '', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Test","last_name":"Lecteur"}', now(), now()),
    (v_editor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test.editeur@sdis62.fr', '', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Test","last_name":"Éditeur"}', now(), now());

  update public.profiles set role = 'editor' where id = v_editor;

  -- 2. Domaine non autorisé refusé
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'intrus@gmail.com', '', now(), '{}', '{}', now(), now());
    raise notice 'ECHEC : un e-mail hors domaine a été accepté';
  exception when others then
    raise notice 'OK : domaine non autorisé refusé (%)', sqlerrm;
  end;

  -- 3. Un éditeur crée un post publié
  perform set_config('request.jwt.claims', json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into public.posts (type, title, body, status, author_id)
  values ('text', 'Annonce de test', 'Corps', 'published', v_editor)
  returning id into v_post;
  raise notice 'OK : éditeur peut publier (post %)', v_post;

  -- 4. Le lecteur ne peut pas créer de post
  perform set_config('request.jwt.claims', json_build_object('sub', v_reader, 'role', 'authenticated')::text, true);
  begin
    insert into public.posts (type, title, status) values ('text', 'Pirate', 'published');
    raise notice 'ECHEC : un lecteur a pu créer un post';
  exception when insufficient_privilege or others then
    raise notice 'OK : lecteur ne peut pas créer de post (%)', sqlerrm;
  end;

  -- 5. Le lecteur peut réagir et commenter
  insert into public.reactions (post_id, user_id, kind) values (v_post, v_reader, 'fire');
  insert into public.comments (post_id, user_id, body) values (v_post, v_reader, 'Bravo à tous !');
  raise notice 'OK : lecteur peut réagir et commenter';

  -- 6. Le lecteur ne peut pas réagir au nom d'un autre
  begin
    insert into public.reactions (post_id, user_id, kind) values (v_post, v_editor, 'clap');
    raise notice 'ECHEC : réaction au nom d''un autre acceptée';
  exception when others then
    raise notice 'OK : réaction au nom d''un autre refusée';
  end;

  -- 7. Le lecteur ne peut pas changer son rôle
  begin
    update public.profiles set role = 'admin' where id = v_reader;
    select role = 'reader' into v_ok from public.profiles where id = v_reader;
    if v_ok then
      raise notice 'OK : changement de rôle ignoré/refusé';
    else
      raise notice 'ECHEC : un lecteur a pu changer son rôle';
    end if;
  exception when others then
    raise notice 'OK : changement de rôle refusé (%)', sqlerrm;
  end;

  -- 8. Le lecteur ne voit pas le journal d'audit
  perform set_config('role', 'authenticated', true);
  if (select count(*) from public.audit_log) = 0 then
    raise notice 'OK : journal d''audit invisible pour un lecteur';
  else
    raise notice 'ECHEC : journal d''audit visible par un lecteur';
  end if;

  perform set_config('role', 'postgres', true);
end $$;

rollback;
