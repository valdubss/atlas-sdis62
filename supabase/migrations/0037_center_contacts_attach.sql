-- =============================================================================
-- 0037 — Chefs de centre et responsables com rattachés d'office
--  Le service communication saisit les adresses du chef de centre et du
--  responsable com sur la page de chaque CIS. Dès qu'un agent dont l'adresse
--  correspond existe (ou se connecte pour la première fois), son profil est
--  rattaché à ce centre, sans demande ni validation : il y publie les notes de
--  service et les événements, reste simple lecteur du fil départemental.
--  Les droits eux-mêmes restent calculés à chaque requête à partir des adresses
--  (is_center_chief / is_center_com) : changer une adresse change aussitôt qui
--  est responsable, l'ancien responsable redevient membre ordinaire.
-- =============================================================================

/** Centre dont p_email est le chef ou le responsable com (le premier par nom). */
create or replace function public.center_for_contact_email(p_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.centers c
  where p_email is not null and p_email <> ''
    and ((c.chief_email is not null and lower(c.chief_email) = lower(p_email))
      or (c.com_email is not null and lower(c.com_email) = lower(p_email)))
  order by c.is_active desc, c.name
  limit 1
$$;
revoke all on function public.center_for_contact_email(text) from public;
grant execute on function public.center_for_contact_email(text) to authenticated, service_role;

/** Rattache les profils dont l'adresse est celle d'un contact du centre (chef ou com). */
create or replace function public.attach_center_contacts(p_center uuid, p_notify boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_center public.centers%rowtype; r record;
begin
  select * into v_center from public.centers where id = p_center;
  if not found then return; end if;
  for r in
    select p.id, p.center_id, (lower(p.email) = lower(coalesce(v_center.chief_email, ''))) as is_chief
    from public.profiles p
    where p.is_active and p.email is not null
      and (lower(p.email) = lower(coalesce(v_center.chief_email, '')) or lower(p.email) = lower(coalesce(v_center.com_email, '')))
      and p.center_id is distinct from v_center.id
  loop
    update public.profiles set center_id = v_center.id, service_id = null where id = r.id;
    update public.membership_requests set status = 'cancelled', decided_at = now(), decided_via = 'system'
      where profile_id = r.id and status = 'pending';
    if p_notify then
      insert into public.notifications (user_id, kind, title, body, url)
      values (r.id, 'center', case when r.is_chief then 'Vous êtes chef de centre' else 'Vous êtes responsable communication' end,
            v_center.name || ' : vous publiez ses notes de service et ses événements, visibles de ses membres.',
            '/centre/' || v_center.slug || '?onglet=notes');
    end if;
  end loop;
end $$;
revoke all on function public.attach_center_contacts(uuid, boolean) from public;
grant execute on function public.attach_center_contacts(uuid, boolean) to service_role;

-- Adresses saisies ou modifiées sur un centre : rattachement immédiat des agents concernés
create or replace function public.centers_contacts_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.chief_email is distinct from old.chief_email or new.com_email is distinct from old.com_email then
    perform public.attach_center_contacts(new.id);
  end if;
  return new;
end $$;
drop trigger if exists centers_contacts_attach on public.centers;
create trigger centers_contacts_attach after insert or update of chief_email, com_email on public.centers
  for each row execute function public.centers_contacts_changed();

-- Nouveau profil (première connexion) : rattaché d'office si son adresse est celle d'un contact
create or replace function public.profiles_contact_attach()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_center uuid;
begin
  if new.center_id is null and new.service_id is null then
    v_center := public.center_for_contact_email(new.email);
    if v_center is not null then new.center_id := v_center; end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_contact_attach on public.profiles;
create trigger profiles_contact_attach before insert on public.profiles
  for each row execute function public.profiles_contact_attach();

-- Profils existants dont l'adresse est déjà saisie sur un centre : rattachés maintenant, sans notification
do $$
declare c record;
begin
  for c in select id from public.centers where chief_email is not null or com_email is not null loop
    perform public.attach_center_contacts(c.id, false);
  end loop;
end $$;
