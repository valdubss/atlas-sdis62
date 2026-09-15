-- =============================================================================
-- ATLAS — migration 0026 : Mon centre, annuaire, profil (lot 7 v3)
--   historique des modifications de fiche (propositions multi-champs des
--   référents), historique de profil (centre, statut), changement de centre.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Modifications de fiche proposées par les référents, décidées par la com
-- -----------------------------------------------------------------------------
create table if not exists public.center_changes (
  id           uuid primary key default gen_random_uuid(),
  center_id    uuid not null references public.centers (id) on delete cascade,
  field        text not null check (field in ('presentation', 'cover_media_id', 'phone', 'email', 'address', 'displayed_headcount')),
  old_value    text,
  new_value    text,
  proposed_by  uuid references public.profiles (id) on delete set null,
  proposed_at  timestamptz not null default now(),
  decided_by   uuid references public.profiles (id) on delete set null,
  decided_at   timestamptz,
  decision     text not null default 'pending' check (decision in ('pending', 'accepted', 'declined')),
  note         text check (note is null or char_length(note) <= 300)
);
create index if not exists center_changes_center_idx on public.center_changes (center_id, proposed_at desc);
create index if not exists center_changes_pending_idx on public.center_changes (decision) where decision = 'pending';
alter table public.center_changes enable row level security;
drop policy if exists center_changes_select on public.center_changes;
create policy center_changes_select on public.center_changes for select to authenticated
  using (public.is_editor() or proposed_by = auth.uid() or public.is_referent_of(center_id));
drop policy if exists center_changes_editor on public.center_changes;
create policy center_changes_editor on public.center_changes for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
-- L'insertion passe par propose_center_changes (valeur précédente capturée, limite)

/** Un référent propose plusieurs champs d'un coup : [{field, value}]. */
create or replace function public.propose_center_changes(p_center uuid, p_changes jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_row public.centers%rowtype; v_item jsonb; v_field text; v_value text; v_old text; v_n int := 0; v_pending int;
begin
  if auth.uid() is null or not (public.is_referent_of(p_center) or public.is_editor()) then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception 'PROPOSITION_VIDE' using errcode = 'P0001';
  end if;
  select count(*) into v_pending from public.center_changes where center_id = p_center and decision = 'pending';
  if v_pending + jsonb_array_length(p_changes) > 10 then
    raise exception 'LIMITE_PROPOSITIONS' using errcode = 'P0001';
  end if;
  select * into v_row from public.centers where id = p_center;
  for v_item in select * from jsonb_array_elements(p_changes) loop
    v_field := v_item ->> 'field';
    v_value := nullif(trim(v_item ->> 'value'), '');
    if v_field not in ('presentation', 'cover_media_id', 'phone', 'email', 'address', 'displayed_headcount') then
      raise exception 'CHAMP_INCONNU' using errcode = 'P0001';
    end if;
    v_old := case v_field
      when 'presentation' then v_row.presentation
      when 'cover_media_id' then v_row.cover_media_id::text
      when 'phone' then v_row.phone
      when 'email' then v_row.email
      when 'address' then v_row.address
      when 'displayed_headcount' then v_row.displayed_headcount::text end;
    if v_value is distinct from v_old then
      -- Une seule proposition en attente par champ : la précédente est remplacée
      update public.center_changes set decision = 'declined', decided_at = now(), note = 'Remplacée par une nouvelle proposition'
      where center_id = p_center and field = v_field and decision = 'pending';
      insert into public.center_changes (center_id, field, old_value, new_value, proposed_by)
      values (p_center, v_field, v_old, v_value, auth.uid());
      v_n := v_n + 1;
    end if;
  end loop;
  -- Compatibilité : la fiche garde un aperçu de la présentation / couverture en attente
  update public.centers set
    pending_presentation = (select new_value from public.center_changes where center_id = p_center and field = 'presentation' and decision = 'pending' order by proposed_at desc limit 1),
    pending_cover_media_id = (select new_value::uuid from public.center_changes where center_id = p_center and field = 'cover_media_id' and decision = 'pending' order by proposed_at desc limit 1),
    pending_by = auth.uid(), pending_at = now()
  where id = p_center;
  if v_n > 0 then
    insert into public.notifications (user_id, kind, title, body, url)
    select p.id, 'center', 'Fiche de centre à valider', v_row.name || ' : ' || v_n || ' modification' || case when v_n > 1 then 's proposées' else ' proposée' end, '/studio/centres/referentiel/centre/' || p_center
    from public.profiles p where p.role in ('editor', 'admin') and p.is_active;
  end if;
  return v_n;
end $$;

/** La com accepte (applique) ou écarte une modification ; l'auteur est prévenu. */
create or replace function public.decide_center_change(p_id uuid, p_accept boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.center_changes%rowtype; v_name text;
begin
  if not public.is_editor() then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  select * into v from public.center_changes where id = p_id and decision = 'pending';
  if v.id is null then raise exception 'INTROUVABLE' using errcode = 'P0001'; end if;
  if p_accept then
    execute format('update public.centers set %I = $1 where id = $2', v.field)
      using case v.field
        when 'cover_media_id' then v.new_value::uuid::text
        when 'displayed_headcount' then v.new_value::int::text
        else v.new_value end, v.center_id;
    -- Cast typé selon le champ
    if v.field = 'cover_media_id' then update public.centers set cover_media_id = v.new_value::uuid where id = v.center_id;
    elsif v.field = 'displayed_headcount' then update public.centers set displayed_headcount = v.new_value::int where id = v.center_id;
    end if;
  end if;
  update public.center_changes set decision = case when p_accept then 'accepted' else 'declined' end, decided_by = auth.uid(), decided_at = now(), note = left(p_note, 300)
  where id = p_id;
  update public.centers set
    pending_presentation = (select new_value from public.center_changes where center_id = v.center_id and field = 'presentation' and decision = 'pending' order by proposed_at desc limit 1),
    pending_cover_media_id = (select new_value::uuid from public.center_changes where center_id = v.center_id and field = 'cover_media_id' and decision = 'pending' order by proposed_at desc limit 1)
  where id = v.center_id;
  select name into v_name from public.centers where id = v.center_id;
  if v.proposed_by is not null then
    insert into public.notifications (user_id, kind, title, body, url)
    values (v.proposed_by, 'center', case when p_accept then 'Modification de fiche appliquée' else 'Modification de fiche non retenue' end,
            v_name || ' · ' || v.field || coalesce(' — ' || left(p_note, 200), ''), '/centre/' || (select slug from public.centers where id = v.center_id));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Historique de profil : centre / service de rattachement, rôle, statut
-- -----------------------------------------------------------------------------
create table if not exists public.profile_history (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  field       text not null check (field in ('center_id', 'service_id', 'role', 'is_active')),
  old_value   text,
  new_value   text,
  changed_at  timestamptz not null default now(),
  changed_by  uuid references public.profiles (id) on delete set null
);
create index if not exists profile_history_profile_idx on public.profile_history (profile_id, changed_at desc);
alter table public.profile_history enable row level security;
drop policy if exists profile_history_select on public.profile_history;
create policy profile_history_select on public.profile_history for select to authenticated
  using (profile_id = auth.uid() or public.is_editor());

create or replace function public.profiles_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.center_id is distinct from old.center_id then
    insert into public.profile_history (profile_id, field, old_value, new_value, changed_by) values (new.id, 'center_id', old.center_id::text, new.center_id::text, auth.uid());
  end if;
  if new.service_id is distinct from old.service_id then
    insert into public.profile_history (profile_id, field, old_value, new_value, changed_by) values (new.id, 'service_id', old.service_id::text, new.service_id::text, auth.uid());
  end if;
  if new.role is distinct from old.role then
    insert into public.profile_history (profile_id, field, old_value, new_value, changed_by) values (new.id, 'role', old.role::text, new.role::text, auth.uid());
  end if;
  if new.is_active is distinct from old.is_active then
    insert into public.profile_history (profile_id, field, old_value, new_value, changed_by) values (new.id, 'is_active', old.is_active::text, new.is_active::text, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists profiles_history on public.profiles;
create trigger profiles_history after update of center_id, service_id, role, is_active on public.profiles
  for each row execute function public.profiles_history();

/** Historique lisible (noms de centres / services résolus) pour le profil. */
create or replace function public.my_profile_history(p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'field', h.field, 'changed_at', h.changed_at,
    'old_label', case h.field when 'center_id' then (select name from public.centers where id::text = h.old_value)
                             when 'service_id' then (select name from public.services where id::text = h.old_value) else h.old_value end,
    'new_label', case h.field when 'center_id' then (select name from public.centers where id::text = h.new_value)
                             when 'service_id' then (select name from public.services where id::text = h.new_value) else h.new_value end
  ) order by h.changed_at desc), '[]'::jsonb)
  from (select * from public.profile_history where profile_id = auth.uid() order by changed_at desc limit greatest(1, least(p_limit, 100))) h
$$;

/** Mon activité : réactions, favoris, commentaires, propositions, messages (compteurs + derniers éléments). */
create or replace function public.my_activity()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reactions', (select count(*) from public.reactions where user_id = auth.uid()),
    'bookmarks', (select count(*) from public.bookmarks where user_id = auth.uid()),
    'comments', (select count(*) from public.comments where user_id = auth.uid() and status = 'visible'),
    'proposals', (select count(*) from public.posts where submitted_by = auth.uid() and deleted_at is null),
    'messages', (select count(*) from public.channel_messages where author_id = auth.uid() and deleted_at is null),
    'story_reactions', (select count(*) from public.story_reactions where user_id = auth.uid()),
    'recent_reactions', coalesce((select jsonb_agg(jsonb_build_object('post_id', p.id, 'slug', p.slug, 'title', p.title, 'kind', r.kind, 'at', r.created_at) order by r.created_at desc)
      from (select * from public.reactions where user_id = auth.uid() order by created_at desc limit 10) r join public.posts p on p.id = r.post_id and p.deleted_at is null), '[]'::jsonb),
    'recent_comments', coalesce((select jsonb_agg(jsonb_build_object('post_id', p.id, 'slug', p.slug, 'title', p.title, 'body', left(c.body, 120), 'at', c.created_at) order by c.created_at desc)
      from (select * from public.comments where user_id = auth.uid() and status = 'visible' order by created_at desc limit 10) c join public.posts p on p.id = c.post_id and p.deleted_at is null), '[]'::jsonb)
  )
$$;

-- -----------------------------------------------------------------------------
-- 3. Droits
-- -----------------------------------------------------------------------------
revoke all on function public.propose_center_changes(uuid, jsonb) from public;
revoke all on function public.decide_center_change(uuid, boolean, text) from public;
revoke all on function public.my_profile_history(int) from public;
revoke all on function public.my_activity() from public;
grant execute on function public.propose_center_changes(uuid, jsonb) to authenticated;
grant execute on function public.decide_center_change(uuid, boolean, text) to authenticated;
grant execute on function public.my_profile_history(int) to authenticated;
grant execute on function public.my_activity() to authenticated;
