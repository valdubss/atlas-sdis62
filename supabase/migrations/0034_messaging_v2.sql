-- =============================================================================
-- 0034 — Messagerie v2 : fiabilité et fluidité
--  - édition d'un message par son auteur (15 min), `edited_at`
--  - rattrapage après une coupure (messages créés, modifiés ou supprimés depuis)
--  - lecture d'un message par identifiant (temps réel incrémental, rejeu par client_id)
--  - accusés de lecture en temps réel (channel_reads publié, identité de réplication complète)
--  - pushs : une par minute et par conversation, et toujours une pour une mention
-- =============================================================================

alter table public.channel_messages add column if not exists edited_at timestamptz;

-- Auteur non éditeur : modifie son texte ou supprime dans les 15 minutes ; rien d'autre
create or replace function public.channel_messages_guard()
returns trigger language plpgsql as $$
begin
  if not public.is_editor() then
    if new.media is distinct from old.media or new.voice is distinct from old.voice
       or new.pinned_at is distinct from old.pinned_at or new.channel_id <> old.channel_id or new.type <> old.type
       or new.reply_to_id is distinct from old.reply_to_id or new.mentions <> old.mentions or new.mention_all <> old.mention_all then
      raise exception 'ACCES_REFUSE' using errcode = '42501';
    end if;
    if new.body is distinct from old.body then
      if old.author_id is distinct from auth.uid() or old.deleted_at is not null or old.type <> 'text' then
        raise exception 'ACCES_REFUSE' using errcode = '42501';
      end if;
      if old.created_at < now() - interval '15 minutes' then
        raise exception 'DELAI_DEPASSE: un message ne peut être modifié que dans les 15 minutes' using errcode = 'P0001';
      end if;
      new.edited_at := now();
    end if;
    if new.deleted_at is not null and old.deleted_at is null and old.created_at < now() - interval '15 minutes' then
      raise exception 'DELAI_DEPASSE: un message ne peut être supprimé que dans les 15 minutes' using errcode = 'P0001';
    end if;
  elsif new.body is distinct from old.body and old.deleted_at is null then
    new.edited_at := now();
  end if;
  return new;
end $$;

create or replace function public.message_to_json(m public.channel_messages)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'channel_id', m.channel_id, 'type', m.type,
    'body', case when m.deleted_at is not null then null else m.body end,
    'media', case when m.deleted_at is not null then null else m.media end,
    'voice', case when m.deleted_at is not null then null else m.voice end,
    'mentions', to_jsonb(m.mentions), 'mention_all', m.mention_all,
    'pinned_at', m.pinned_at, 'deleted_at', m.deleted_at, 'created_at', m.created_at,
    'edited_at', m.edited_at, 'client_id', m.client_id,
    'author', (select jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_key', p.avatar_key, 'role', p.role)
               from public.profiles p where p.id = m.author_id),
    'reply_to', (select jsonb_build_object('id', r.id, 'type', r.type, 'body', case when r.deleted_at is not null then null else left(r.body, 120) end,
                   'author', public.display_name(r.author_id), 'has_media', r.media is not null)
                 from public.channel_messages r where r.id = m.reply_to_id),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('emoji', x.emoji, 'count', x.n, 'mine', x.mine) order by x.n desc)
                   from (select emoji, count(*) as n, bool_or(profile_id = auth.uid()) as mine from public.message_reactions where message_id = m.id group by emoji) x), '[]'::jsonb)
  )
$$;

/** Un message par identifiant (RLS : membres du canal seulement). */
create or replace function public.message_by_id(p_id uuid)
returns jsonb language sql stable as $$
  select public.message_to_json(m) from public.channel_messages m where m.id = p_id
$$;

/** Rattrapage : tout ce qui a été créé, modifié ou supprimé depuis p_after (ordre chronologique). */
create or replace function public.channel_messages_since(p_channel uuid, p_after timestamptz, p_limit int default 200)
returns setof jsonb language sql stable as $$
  select public.message_to_json(m)
  from public.channel_messages m
  where m.channel_id = p_channel
    and (m.created_at > p_after or m.edited_at > p_after or m.deleted_at > p_after or m.pinned_at > p_after)
  order by m.created_at asc
  limit greatest(1, least(p_limit, 500))
$$;

/** Lectures des membres d'un canal (coches « lu ») ; réservé aux membres. */
create or replace function public.channel_reads_state(p_channel uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_channel_member(p_channel)
    then coalesce((select jsonb_agg(jsonb_build_object('profile_id', r.profile_id, 'last_read_at', r.last_read_at)) from public.channel_reads r where r.channel_id = p_channel), '[]'::jsonb)
    else '[]'::jsonb end
$$;

revoke all on function public.message_by_id(uuid) from public;
revoke all on function public.channel_messages_since(uuid, timestamptz, int) from public;
revoke all on function public.channel_reads_state(uuid) from public;
grant execute on function public.message_by_id(uuid), public.channel_messages_since(uuid, timestamptz, int), public.channel_reads_state(uuid) to authenticated, service_role;

-- Temps réel : les lectures aussi, et les événements UPDATE/DELETE portent toutes les colonnes
-- (le filtre channel_id=eq.<id> s'applique alors aussi aux modifications et suppressions)
alter table public.channel_messages replica identity full;
alter table public.channel_reads replica identity full;
alter table public.message_reactions replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_reads') then
    alter publication supabase_realtime add table public.channel_reads;
  end if;
end $$;

-- Lecture de channel_reads par les membres (coches « lu ») ; écriture inchangée (lignes propres)
drop policy if exists channel_reads_select_members on public.channel_reads;
create policy channel_reads_select_members on public.channel_reads for select to authenticated
  using (public.is_channel_member(channel_id));

-- Pushs : une par minute et par conversation ; une mention passe toujours
create or replace function public.channel_messages_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_channel public.channels%rowtype;
  v_author text;
  v_preview text;
  v_uid uuid;
  v_mention boolean := new.mention_all or coalesce(array_length(new.mentions, 1), 0) > 0;
begin
  update public.channels set last_message_at = new.created_at where id = new.channel_id returning * into v_channel;
  if new.type = 'system' then return new; end if;

  v_author := public.display_name(new.author_id);
  v_preview := case new.type
    when 'voice' then 'Message vocal'
    when 'media' then coalesce(nullif(new.body, ''), 'Photo ou fichier')
    else coalesce(new.body, '') end;

  insert into public.notification_queue (kind, payload, dedupe_key)
  values ('push_message'::public.notification_kind, jsonb_build_object(
    'channel_id', new.channel_id, 'message_id', new.id, 'author_id', new.author_id,
    'title', case when v_channel.type = 'group' then v_author || ' dans ' || v_channel.name else v_author || ' · ' || v_channel.name end,
    'body', left(v_preview, 140), 'url', '/messages/' || new.channel_id,
    'mentions', to_jsonb(new.mentions), 'mention_all', new.mention_all),
    case when v_mention then 'msg:' || new.channel_id || ':' || new.id
         else 'msg:' || new.channel_id || ':' || floor(extract(epoch from new.created_at) / 60)::bigint end);

  if new.mention_all then
    for v_uid in select public.channel_recipients(new.channel_id) loop
      if v_uid <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000'::uuid) then
        insert into public.notifications (user_id, kind, title, body, url)
        values (v_uid, 'message', v_author || ' a mentionné tout le monde', left(v_channel.name || ' : ' || v_preview, 200), '/messages/' || new.channel_id);
      end if;
    end loop;
  elsif coalesce(array_length(new.mentions, 1), 0) > 0 then
    insert into public.notifications (user_id, kind, title, body, url)
    select r, 'message', v_author || ' vous a mentionné', left(v_channel.name || ' : ' || v_preview, 200), '/messages/' || new.channel_id
    from public.channel_recipients(new.channel_id) r
    where r = any (new.mentions) and r is distinct from new.author_id;
  end if;
  return new;
end $$;

-- Fiche du canal : les membres implicites (éditeurs et admins qui voient tout) sont signalés,
-- la double coche « Lu par tous » ne compte que les membres invités
create or replace function public.channel_info(p_channel uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', c.id, 'type', c.type, 'name', public.channel_title(c), 'subject', c.subject, 'photo_key', c.photo_key,
    'ends_at', c.ends_at, 'read_only', c.read_only, 'archived_at', c.archived_at, 'members_can_post_media', c.members_can_post_media,
    'created_by', c.created_by, 'created_at', c.created_at, 'last_message_at', c.last_message_at,
    'me', (select jsonb_build_object('role', m.role, 'notifications', m.notifications, 'pinned', m.pinned, 'muted_until', m.muted_until)
           from public.channel_members m where m.channel_id = c.id and m.profile_id = auth.uid()),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_key', p.avatar_key,
                  'job_title', p.job_title, 'center', (select ce.name from public.centers ce where ce.id = p.center_id),
                  'role', coalesce((select m.role::text from public.channel_members m where m.channel_id = c.id and m.profile_id = p.id and m.left_at is null),
                                   case when p.role in ('editor', 'admin') then 'admin' else 'member' end),
                  'implicit', c.type = 'group' and not exists (select 1 from public.channel_members m where m.channel_id = c.id and m.profile_id = p.id and m.left_at is null))
                  order by p.last_name, p.first_name), '[]'::jsonb)
                from public.channel_recipients(c.id) r join public.profiles p on p.id = r),
    'pinned', (select coalesce(jsonb_agg(public.message_to_json(m) order by m.pinned_at desc), '[]'::jsonb)
               from public.channel_messages m where m.channel_id = c.id and m.pinned_at is not null and m.deleted_at is null),
    'media_count', (select count(*) from public.channel_messages m where m.channel_id = c.id and m.media is not null and m.deleted_at is null)
  )
  from public.channels c where c.id = p_channel and public.is_channel_member(c.id)
$$;
