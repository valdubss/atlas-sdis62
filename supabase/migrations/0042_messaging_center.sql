-- 0042 — Messagerie de centre : tout agent rattaché à un centre peut ouvrir une conversation,
-- mais seulement avec les membres de son centre (chef de centre et responsable com compris).
-- Le service communication garde la main sur tout le SDIS. Aucune conversation entre agents de
-- centres différents : la liste proposée, la création du groupe et l'ajout de membres le
-- vérifient en base.

-- Même centre (non nul) que l'agent connecté
create or replace function public.same_center(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles me join public.profiles other on other.id = p_profile
    where me.id = auth.uid() and me.center_id is not null and other.center_id = me.center_id and other.is_active
  )
$$;
revoke all on function public.same_center(uuid) from public;
grant execute on function public.same_center(uuid) to authenticated, service_role;

-- Accès à la messagerie : service com, référents, invités d'un groupe, et tout agent rattaché à un centre
create or replace function public.can_use_messaging()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_editor() or public.is_referent()
    or exists (select 1 from public.channel_members m join public.channels c on c.id = m.channel_id
               where m.profile_id = auth.uid() and m.left_at is null and c.type = 'group' and c.archived_at is null)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.center_id is not null)
$$;

-- Personnes proposables : service com → tout le SDIS ; agent → les membres de son centre
create or replace function public.messaging_directory(p_q text default null)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_key', p.avatar_key, 'role', p.role,
    'center', (select ce.name from public.centers ce where ce.id = p.center_id),
    'grouping', (select g.name from public.centers ce join public.groupings g on g.id = ce.grouping_id where ce.id = p.center_id),
    'is_referent', exists (select 1 from public.center_referents r where r.profile_id = p.id and r.is_active),
    'is_chief', exists (select 1 from public.centers ce where ce.id = p.center_id and (ce.chief_id = p.id or (ce.chief_email is not null and lower(ce.chief_email) = lower(p.email)))),
    'is_com', exists (select 1 from public.centers ce where ce.id = p.center_id and ce.com_email is not null and lower(ce.com_email) = lower(p.email))
  ) order by p.last_name, p.first_name), '[]'::jsonb)
  from public.profiles p
  where p.is_active and p.id <> auth.uid()
    and (public.is_editor() or public.same_center(p.id))
    and (p_q is null or p_q = '' or unaccent(p.first_name || ' ' || p.last_name) ilike '%' || unaccent(p_q) || '%')
$$;

-- Création d'un groupe : service com, ou tout agent admis à la messagerie
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels for insert to authenticated
  with check (type = 'group' and created_by = auth.uid() and public.can_use_messaging());

-- Le créateur d'un groupe peut en modifier les informations (nom, objet, photo, fin)
drop policy if exists channels_update on public.channels;
create policy channels_update on public.channels for update to authenticated
  using (public.is_editor() or (type = 'group' and created_by = auth.uid()))
  with check (public.is_editor() or (type = 'group' and created_by = auth.uid()));

-- Membres : le service com ajoute qui il veut ; un agent n'ajoute, dans son propre groupe,
-- que lui-même et des agents de son centre
drop policy if exists channel_members_insert on public.channel_members;
create policy channel_members_insert on public.channel_members for insert to authenticated
  with check (
    (public.is_editor() and exists (select 1 from public.channels c where c.id = channel_id and c.type = 'group'))
    or (exists (select 1 from public.channels c where c.id = channel_id and c.type = 'group' and c.created_by = auth.uid())
        and (profile_id = auth.uid() or public.same_center(profile_id)))
    or (profile_id = auth.uid() and public.is_channel_member(channel_id)
        and exists (select 1 from public.channels c where c.id = channel_id and c.type <> 'group'))
  );
