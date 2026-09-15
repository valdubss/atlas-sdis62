-- 0019 — Annuaire (lot C) : recherche tolérante aux fautes (centres, services,
-- agents visibles), sans données supplémentaires sur les agents.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Texte normalisé pour la recherche : minuscules, sans accents.
-- (unaccent peut être installé dans le schéma public ou extensions selon le projet :
--  on ne qualifie pas l'appel et on fixe le chemin de recherche)
create or replace function public.norm_text(p text)
returns text language sql immutable parallel safe set search_path = public, extensions as $$
  select lower(unaccent(coalesce(p, '')));
$$;

-- Recherche de l'annuaire. SECURITY INVOKER : la RLS s'applique (profils actifs,
-- et seuls ceux qui ont coché « visible dans l'annuaire » sont retournés).
create or replace function public.search_directory(p_q text, p_limit int default 20)
returns jsonb language plpgsql stable set search_path = public, extensions as $$
declare
  q text := public.norm_text(trim(p_q));
  lim int := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if q = '' or char_length(q) < 2 then
    return jsonb_build_object('centers', '[]'::jsonb, 'services', '[]'::jsonb, 'people', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'centers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'name', c.name, 'type', c.type, 'city', c.city, 'phone', c.phone,
        'lat', c.lat, 'lng', c.lng, 'grouping', g.name) order by s.rank desc, c.name)
      from (
        select c.id,
               greatest(
                 case when public.norm_text(c.name) like q || '%' then 1.0 when public.norm_text(c.name) like '%' || q || '%' then 0.9 else 0 end,
                 case when public.norm_text(c.city) like q || '%' then 0.8 when public.norm_text(c.city) like '%' || q || '%' then 0.7 else 0 end,
                 word_similarity(q, public.norm_text(c.name)),
                 word_similarity(q, public.norm_text(coalesce(c.city, '')))) as rank
        from public.centers c where c.is_active
      ) s
      join public.centers c on c.id = s.id
      left join public.groupings g on g.id = c.grouping_id
      where s.rank >= 0.45
      limit lim
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'slug', v.slug, 'name', v.name, 'short_description', v.short_description, 'phone', v.phone) order by s.rank desc, v.name)
      from (
        select v.id,
               greatest(
                 case when public.norm_text(v.name) like '%' || q || '%' then 0.9 else 0 end,
                 case when public.norm_text(v.short_description) like '%' || q || '%' then 0.7 else 0 end,
                 case when exists (select 1 from unnest(v.contact_reasons) r where public.norm_text(r) like '%' || q || '%') then 0.75 else 0 end,
                 word_similarity(q, public.norm_text(v.name)),
                 word_similarity(q, public.norm_text(coalesce(v.short_description, '')))) as rank
        from public.services v where v.is_active
      ) s
      join public.services v on v.id = s.id
      where s.rank >= 0.45
      limit lim
    ), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'job_title', p.job_title,
        'work_phone', p.work_phone, 'avatar_key', p.avatar_key,
        'center', case when c.id is null then null else jsonb_build_object('name', c.name, 'slug', c.slug) end,
        'service', case when v.id is null then null else jsonb_build_object('name', v.name, 'slug', v.slug) end
      ) order by s.rank desc, p.last_name, p.first_name)
      from (
        select p.id,
               greatest(
                 case when public.norm_text(p.first_name || ' ' || p.last_name) like '%' || q || '%'
                        or public.norm_text(p.last_name || ' ' || p.first_name) like '%' || q || '%' then 0.9 else 0 end,
                 case when public.norm_text(p.job_title) like '%' || q || '%' then 0.7 else 0 end,
                 word_similarity(q, public.norm_text(p.first_name || ' ' || p.last_name))) as rank
        from public.profiles p
        where p.directory_visible and p.is_active
      ) s
      join public.profiles p on p.id = s.id
      left join public.centers c on c.id = p.center_id
      left join public.services v on v.id = p.service_id
      where s.rank >= 0.5
      limit lim
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.search_directory(text, int) from public;
grant execute on function public.search_directory(text, int) to authenticated;

-- Consultations : purge à 13 mois (avec la maintenance existante des vues)
create or replace function public.purge_page_views()
returns void language sql security definer set search_path = public as $$
  delete from public.page_views where day < current_date - interval '13 months';
$$;
revoke all on function public.purge_page_views() from public;
grant execute on function public.purge_page_views() to service_role;
