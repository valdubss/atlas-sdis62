-- =============================================================================
-- ATLAS — migration 0002 : auto-réparation du profil
-- Crée le profil d'un utilisateur authentifié qui n'en a pas (compte créé avant
-- la migration 0001, ou via le dashboard Supabase), si son adresse est autorisée.
-- Appelée par l'application au chargement quand le profil est introuvable.
-- =============================================================================

create or replace function public.ensure_profile()
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_row   public.profiles;
begin
  if v_uid is null then
    raise exception 'NON_AUTHENTIFIE' using errcode = '42501';
  end if;

  select * into v_row from public.profiles where id = v_uid;
  if found then
    return v_row;
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null or not public.is_allowed_email(v_email) then
    raise exception 'DOMAINE_NON_AUTORISE' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, email) values (v_uid, lower(v_email))
  returning * into v_row;
  insert into public.user_settings (user_id) values (v_uid) on conflict do nothing;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                        || jsonb_build_object('role', 'reader', 'is_active', true)
  where id = v_uid;

  return v_row;
end $$;

revoke all on function public.ensure_profile() from public;
grant execute on function public.ensure_profile() to authenticated;
