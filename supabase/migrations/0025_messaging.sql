-- =============================================================================
-- ATLAS — migration 0025 : messagerie de travail (lot 6 v3)
--   Canaux fixes (général, un par groupement, un par centre) + groupes créés par
--   les éditeurs. Aucune conversation 1‑à‑1. Les agents « reader » n'ont aucun
--   accès sauf invitation dans un groupe.
-- =============================================================================

-- Valeur d'enum ajoutée ici, jamais utilisée dans cette transaction (trigger seulement)
alter type public.notification_kind add value if not exists 'push_message';

create type public.channel_type as enum ('general', 'grouping', 'center', 'group');
create type public.channel_member_role as enum ('admin', 'member');
create type public.message_type as enum ('text', 'media', 'system', 'voice');

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
create table public.channels (
  id                      uuid primary key default gen_random_uuid(),
  type                    public.channel_type not null,
  name                    text not null check (char_length(name) between 1 and 40),
  subject                 text check (subject is null or char_length(subject) <= 120),
  photo_key               text,
  grouping_id             uuid unique references public.groupings (id) on delete cascade,
  center_id               uuid unique references public.centers (id) on delete cascade,
  created_by              uuid references public.profiles (id) on delete set null,
  ends_at                 timestamptz,
  read_only               boolean not null default false,
  archived_at             timestamptz,
  reminded_at             timestamptz,
  members_can_post_media  boolean not null default true,
  last_message_at         timestamptz,
  created_at              timestamptz not null default now(),
  constraint channels_grouping_scope check ((type = 'grouping') = (grouping_id is not null)),
  constraint channels_center_scope   check ((type = 'center') = (center_id is not null)),
  constraint channels_group_subject  check (type <> 'group' or subject is not null)
);
create unique index channels_general_idx on public.channels ((type)) where type = 'general';
create index channels_last_idx on public.channels (last_message_at desc nulls last);
create trigger audit_channels after insert or update or delete on public.channels for each row execute function public.audit_trigger();

-- Membres des groupes ; pour les canaux fixes, la ligne ne porte que les préférences
create table public.channel_members (
  channel_id     uuid not null references public.channels (id) on delete cascade,
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  added_by       uuid references public.profiles (id) on delete set null,
  added_at       timestamptz not null default now(),
  role           public.channel_member_role not null default 'member',
  notifications  text not null default 'all' check (notifications in ('all', 'mentions', 'none')),
  pinned         boolean not null default false,
  muted_until    timestamptz,
  hidden_until   timestamptz,
  left_at        timestamptz,
  primary key (channel_id, profile_id)
);
create index channel_members_profile_idx on public.channel_members (profile_id) where left_at is null;

create table public.channel_messages (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references public.channels (id) on delete cascade,
  author_id    uuid references public.profiles (id) on delete set null,
  type         public.message_type not null default 'text',
  body         text check (body is null or char_length(body) <= 4000),
  media        jsonb,                 -- [{key, kind image|video|file, mime, name, size, width, height, poster_key, duration_s}]
  reply_to_id  uuid references public.channel_messages (id) on delete set null,
  mentions     uuid[] not null default '{}',
  mention_all  boolean not null default false,
  voice        jsonb,                 -- {key, mime, duration_s, waveform[64], transcript}
  pinned_at    timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint channel_messages_content check (type = 'system' or body is not null or media is not null or voice is not null)
);
create index channel_messages_channel_idx on public.channel_messages (channel_id, created_at desc);
create index channel_messages_pinned_idx on public.channel_messages (channel_id) where pinned_at is not null;
create index channel_messages_search_idx on public.channel_messages using gin (to_tsvector('french', coalesce(body, '')));

create table public.message_reactions (
  message_id  uuid not null references public.channel_messages (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  emoji       text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🔥')),
  created_at  timestamptz not null default now(),
  primary key (message_id, profile_id)
);

create table public.channel_reads (
  channel_id            uuid not null references public.channels (id) on delete cascade,
  profile_id            uuid not null references public.profiles (id) on delete cascade,
  last_read_at          timestamptz not null default now(),
  last_read_message_id  uuid references public.channel_messages (id) on delete set null,
  primary key (channel_id, profile_id)
);

-- -----------------------------------------------------------------------------
-- 2. Appartenance calculée par rôle (canaux fixes) ou par ligne (groupes)
-- -----------------------------------------------------------------------------
create or replace function public.is_channel_member(p_channel uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel and (
      public.is_editor()
      or (c.type = 'group' and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.profile_id = auth.uid() and m.left_at is null))
      or (c.type = 'general' and public.is_referent())
      or (c.type = 'grouping' and exists (
            select 1 from public.center_referents r join public.centers ce on ce.id = r.center_id
            where r.profile_id = auth.uid() and r.is_active and ce.grouping_id = c.grouping_id))
      or (c.type = 'center' and public.is_referent_of(c.center_id))
    )
  )
$$;

/** Vrai si l'agent a accès à la messagerie (entrée « Messages » de la barre basse). */
create or replace function public.can_use_messaging()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_editor() or public.is_referent()
    or exists (select 1 from public.channel_members m join public.channels c on c.id = m.channel_id
               where m.profile_id = auth.uid() and m.left_at is null and c.type = 'group' and c.archived_at is null)
$$;

/** Destinataires d'un canal (identifiants), pour les notifications et les accusés. */
create or replace function public.channel_recipients(p_channel uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct p.id
  from public.channels c
  join public.profiles p on p.is_active
  where c.id = p_channel and (
    p.role in ('editor', 'admin')
    or (c.type = 'group' and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.profile_id = p.id and m.left_at is null))
    or (c.type = 'general' and exists (select 1 from public.center_referents r where r.profile_id = p.id and r.is_active))
    or (c.type = 'grouping' and exists (
          select 1 from public.center_referents r join public.centers ce on ce.id = r.center_id
          where r.profile_id = p.id and r.is_active and ce.grouping_id = c.grouping_id))
    or (c.type = 'center' and exists (select 1 from public.center_referents r where r.profile_id = p.id and r.is_active and r.center_id = c.center_id))
  )
$$;

create or replace function public.can_post_in(p_channel uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_channel_member(p_channel)
     and exists (select 1 from public.channels c where c.id = p_channel and not c.read_only and c.archived_at is null)
$$;

-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------
alter table public.channels          enable row level security;
alter table public.channel_members   enable row level security;
alter table public.channel_messages  enable row level security;
alter table public.message_reactions enable row level security;
alter table public.channel_reads     enable row level security;

-- `created_by = auth.uid()` : la ligne tout juste insérée est renvoyée (RETURNING) même si
-- is_channel_member (stable, instantané du début de l'instruction) ne la voit pas encore.
create policy channels_select on public.channels for select to authenticated using (public.is_channel_member(id) or created_by = auth.uid());
create policy channels_insert on public.channels for insert to authenticated
  with check (public.is_editor() and type = 'group' and created_by = auth.uid());
create policy channels_update on public.channels for update to authenticated
  using (public.is_editor()) with check (public.is_editor());

create policy channel_members_select on public.channel_members for select to authenticated using (public.is_channel_member(channel_id));
create policy channel_members_insert on public.channel_members for insert to authenticated
  with check (
    (public.is_editor() and exists (select 1 from public.channels c where c.id = channel_id and c.type = 'group'))
    or (profile_id = auth.uid() and public.is_channel_member(channel_id)
        and exists (select 1 from public.channels c where c.id = channel_id and c.type <> 'group'))
  );
create policy channel_members_update on public.channel_members for update to authenticated
  using (public.is_editor() or profile_id = auth.uid()) with check (public.is_editor() or profile_id = auth.uid());
create policy channel_members_delete on public.channel_members for delete to authenticated using (public.is_editor());

-- Un membre ne modifie que ses préférences (et peut quitter) ; jamais son rôle
create or replace function public.channel_members_guard()
returns trigger language plpgsql as $$
begin
  if not public.is_editor() then
    if new.role <> old.role or new.added_by is distinct from old.added_by or new.added_at <> old.added_at then
      raise exception 'ACCES_REFUSE' using errcode = '42501';
    end if;
    if old.left_at is not null and new.left_at is null then
      raise exception 'ACCES_REFUSE' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger channel_members_guard before update on public.channel_members for each row execute function public.channel_members_guard();

create policy channel_messages_select on public.channel_messages for select to authenticated using (public.is_channel_member(channel_id));
create policy channel_messages_insert on public.channel_messages for insert to authenticated
  with check (
    author_id = auth.uid() and type <> 'system' and public.can_post_in(channel_id)
    and (type <> 'media' or public.is_editor() or exists (select 1 from public.channels c where c.id = channel_id and c.members_can_post_media))
  );
create policy channel_messages_update on public.channel_messages for update to authenticated
  using (public.is_editor() or author_id = auth.uid()) with check (public.is_editor() or author_id = auth.uid());

-- Auteur non éditeur : suppression dans les 15 minutes seulement, rien d'autre
create or replace function public.channel_messages_guard()
returns trigger language plpgsql as $$
begin
  if not public.is_editor() then
    if new.body is distinct from old.body or new.media is distinct from old.media or new.voice is distinct from old.voice
       or new.pinned_at is distinct from old.pinned_at or new.channel_id <> old.channel_id or new.type <> old.type
       or new.reply_to_id is distinct from old.reply_to_id or new.mentions <> old.mentions or new.mention_all <> old.mention_all then
      raise exception 'ACCES_REFUSE' using errcode = '42501';
    end if;
    if new.deleted_at is not null and old.deleted_at is null and old.created_at < now() - interval '15 minutes' then
      raise exception 'DELAI_DEPASSE: un message ne peut être supprimé que dans les 15 minutes' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger channel_messages_guard before update on public.channel_messages for each row execute function public.channel_messages_guard();

create policy message_reactions_select on public.message_reactions for select to authenticated
  using (exists (select 1 from public.channel_messages m where m.id = message_id and public.is_channel_member(m.channel_id)));
create policy message_reactions_own on public.message_reactions for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and exists (select 1 from public.channel_messages m where m.id = message_id and public.can_post_in(m.channel_id)));

create policy channel_reads_select on public.channel_reads for select to authenticated using (public.is_channel_member(channel_id));
create policy channel_reads_own on public.channel_reads for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.is_channel_member(channel_id));

-- -----------------------------------------------------------------------------
-- 4. Canaux fixes : général (migration), un par groupement et par centre (triggers)
-- -----------------------------------------------------------------------------
insert into public.channels (type, name, subject) values ('general', 'Général', 'Service communication et référents')
on conflict do nothing;

create or replace function public.groupings_channel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.channels (type, name, grouping_id) values ('grouping', left(new.name, 40), new.id) on conflict (grouping_id) do update set name = excluded.name;
  return new;
end $$;
create trigger groupings_channel after insert or update of name on public.groupings for each row execute function public.groupings_channel();

create or replace function public.centers_channel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_active then
    insert into public.channels (type, name, center_id) values ('center', left(new.name, 40), new.id) on conflict (center_id) do update set name = excluded.name;
  end if;
  return new;
end $$;
create trigger centers_channel after insert or update of name, is_active on public.centers for each row execute function public.centers_channel();

insert into public.channels (type, name, grouping_id) select 'grouping', left(g.name, 40), g.id from public.groupings g on conflict (grouping_id) do nothing;
insert into public.channels (type, name, center_id) select 'center', left(c.name, 40), c.id from public.centers c where c.is_active on conflict (center_id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Triggers : dernier message, messages système, notifications
-- -----------------------------------------------------------------------------
create or replace function public.display_name(p_profile uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), 'Un agent') from public.profiles p where p.id = p_profile
$$;

create or replace function public.system_message(p_channel uuid, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.channel_messages (channel_id, author_id, type, body) values (p_channel, null, 'system', left(p_body, 300))
$$;

create or replace function public.channel_messages_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_channel public.channels%rowtype;
  v_author text;
  v_preview text;
  v_uid uuid;
begin
  update public.channels set last_message_at = new.created_at where id = new.channel_id returning * into v_channel;
  if new.type = 'system' then return new; end if;

  v_author := public.display_name(new.author_id);
  v_preview := case new.type
    when 'voice' then 'Message vocal'
    when 'media' then coalesce(nullif(new.body, ''), 'Photo ou fichier')
    else coalesce(new.body, '') end;

  -- Une push par conversation et par tranche de 10 minutes (dedupe_key)
  insert into public.notification_queue (kind, payload, dedupe_key)
  values ('push_message'::public.notification_kind, jsonb_build_object(
    'channel_id', new.channel_id, 'message_id', new.id, 'author_id', new.author_id,
    'title', case when v_channel.type = 'group' then v_author || ' dans ' || v_channel.name else v_author || ' · ' || v_channel.name end,
    'body', left(v_preview, 140), 'url', '/messages/' || new.channel_id,
    'mentions', to_jsonb(new.mentions), 'mention_all', new.mention_all),
    'msg:' || new.channel_id || ':' || floor(extract(epoch from new.created_at) / 600)::bigint);

  -- Mentions : notification dans l'app pour les personnes citées (ou tout le monde)
  if new.mention_all then
    for v_uid in select public.channel_recipients(new.channel_id) loop
      if v_uid <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000'::uuid) then
        insert into public.notifications (user_id, kind, title, body, url)
        values (v_uid, 'message', v_author || ' a mentionné tout le monde', left(v_channel.name || ' : ' || v_preview, 200), '/messages/' || new.channel_id);
      end if;
    end loop;
  elsif array_length(new.mentions, 1) > 0 then
    -- Seules les personnes citées qui sont destinataires du canal (et existent) sont notifiées
    insert into public.notifications (user_id, kind, title, body, url)
    select r, 'message', v_author || ' vous a mentionné', left(v_channel.name || ' : ' || v_preview, 200), '/messages/' || new.channel_id
    from public.channel_recipients(new.channel_id) r
    where r = any (new.mentions) and r is distinct from new.author_id;
  end if;
  return new;
end $$;
create trigger channel_messages_after_insert after insert on public.channel_messages for each row execute function public.channel_messages_after_insert();

alter table public.notifications drop constraint if exists notifications_kind;
alter table public.notifications add constraint notifications_kind check (kind in ('post', 'flash', 'reply', 'event', 'story_reply', 'center', 'directory', 'message'));

create or replace function public.channel_members_system()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type public.channel_type;
begin
  select type into v_type from public.channels where id = coalesce(new.channel_id, old.channel_id);
  if v_type <> 'group' then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.added_by is not null and new.added_by <> new.profile_id then
      perform public.system_message(new.channel_id, public.display_name(new.added_by) || ' a ajouté ' || public.display_name(new.profile_id));
    end if;
  elsif tg_op = 'UPDATE' and new.left_at is not null and old.left_at is null then
    perform public.system_message(new.channel_id, public.display_name(new.profile_id) || ' a quitté le groupe');
  elsif tg_op = 'UPDATE' and new.left_at is null and old.left_at is not null then
    perform public.system_message(new.channel_id, public.display_name(new.profile_id) || ' a rejoint le groupe');
  elsif tg_op = 'DELETE' then
    perform public.system_message(old.channel_id, public.display_name(old.profile_id) || ' a été retiré du groupe');
  end if;
  return coalesce(new, old);
end $$;
create trigger channel_members_system after insert or update of left_at or delete on public.channel_members for each row execute function public.channel_members_system();

create or replace function public.channels_system()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type <> 'group' then return new; end if;
  if new.subject is distinct from old.subject then
    perform public.system_message(new.id, 'Objet du groupe : ' || coalesce(new.subject, ''));
  end if;
  if new.name <> old.name then
    perform public.system_message(new.id, 'Le groupe s''appelle désormais « ' || new.name || ' »');
  end if;
  if new.archived_at is not null and old.archived_at is null then
    perform public.system_message(new.id, 'Groupe archivé : lecture seule');
  end if;
  if new.ends_at is distinct from old.ends_at and new.ends_at is not null then
    perform public.system_message(new.id, 'Fin du groupe prévue le ' || to_char(new.ends_at at time zone 'Europe/Paris', 'DD/MM/YYYY'));
  end if;
  return new;
end $$;
create trigger channels_system after update on public.channels for each row execute function public.channels_system();

-- -----------------------------------------------------------------------------
-- 6. RPC : liste, pages de messages, lecture, recherche, transfert, export
-- -----------------------------------------------------------------------------
create or replace function public.message_to_json(m public.channel_messages)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'channel_id', m.channel_id, 'type', m.type,
    'body', case when m.deleted_at is not null then null else m.body end,
    'media', case when m.deleted_at is not null then null else m.media end,
    'voice', case when m.deleted_at is not null then null else m.voice end,
    'mentions', to_jsonb(m.mentions), 'mention_all', m.mention_all,
    'pinned_at', m.pinned_at, 'deleted_at', m.deleted_at, 'created_at', m.created_at,
    'author', (select jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_key', p.avatar_key, 'role', p.role)
               from public.profiles p where p.id = m.author_id),
    'reply_to', (select jsonb_build_object('id', r.id, 'type', r.type, 'body', case when r.deleted_at is not null then null else left(r.body, 120) end,
                   'author', public.display_name(r.author_id), 'has_media', r.media is not null)
                 from public.channel_messages r where r.id = m.reply_to_id),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('emoji', x.emoji, 'count', x.n, 'mine', x.mine) order by x.n desc)
                   from (select emoji, count(*) as n, bool_or(profile_id = auth.uid()) as mine from public.message_reactions where message_id = m.id group by emoji) x), '[]'::jsonb)
  )
$$;

create or replace function public.channel_messages_page(p_channel uuid, p_before timestamptz default null, p_limit int default 40)
returns setof jsonb language sql stable as $$
  select public.message_to_json(m)
  from public.channel_messages m
  where m.channel_id = p_channel and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit greatest(1, least(p_limit, 100))
$$;

create or replace function public.mark_channel_read(p_channel uuid, p_message_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_channel_member(p_channel) then return; end if;
  insert into public.channel_reads (channel_id, profile_id, last_read_at, last_read_message_id)
  values (p_channel, auth.uid(), now(), p_message_id)
  on conflict (channel_id, profile_id) do update set last_read_at = now(), last_read_message_id = coalesce(excluded.last_read_message_id, public.channel_reads.last_read_message_id);
end $$;

/** Nom du canal tel qu'affiché (les canaux fixes suivent le référentiel). */
create or replace function public.channel_title(c public.channels)
returns text language sql stable as $$
  select case c.type
    when 'grouping' then coalesce((select 'Groupement ' || g.name from public.groupings g where g.id = c.grouping_id), c.name)
    when 'center' then coalesce((select ce.name from public.centers ce where ce.id = c.center_id), c.name)
    else c.name end
$$;

create or replace function public.list_conversations()
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x.j order by x.pinned desc, x.last_at desc nulls last), '[]'::jsonb)
  from (
    select mm.pinned, coalesce(c.last_message_at, c.created_at) as last_at,
      jsonb_build_object(
        'id', c.id, 'type', c.type, 'name', public.channel_title(c), 'subject', c.subject, 'photo_key', c.photo_key,
        'ends_at', c.ends_at, 'read_only', c.read_only, 'archived_at', c.archived_at, 'last_message_at', c.last_message_at,
        'members_can_post_media', c.members_can_post_media, 'created_by', c.created_by,
        'pinned', mm.pinned, 'muted_until', mm.muted_until, 'notifications', mm.notifications, 'hidden_until', mm.hidden_until,
        'unread', (select count(*) from public.channel_messages m where m.channel_id = c.id and m.type <> 'system' and m.deleted_at is null
                   and m.author_id is distinct from auth.uid() and m.created_at > coalesce(rd.last_read_at, '1970-01-01'::timestamptz)),
        'mentioned', exists (select 1 from public.channel_messages m where m.channel_id = c.id and m.deleted_at is null
                   and m.created_at > coalesce(rd.last_read_at, '1970-01-01'::timestamptz) and (m.mention_all or auth.uid() = any (m.mentions))),
        'last_message', (select jsonb_build_object('type', m.type, 'body', case when m.deleted_at is not null then 'Message supprimé' else left(coalesce(m.body, case m.type when 'voice' then 'Message vocal' when 'media' then 'Photo ou fichier' else '' end), 120) end,
                           'author', case when m.type = 'system' then null else public.display_name(m.author_id) end, 'created_at', m.created_at)
                         from public.channel_messages m where m.channel_id = c.id order by m.created_at desc limit 1),
        'member_count', (select count(*) from public.channel_recipients(c.id)),
        'avatars', (select coalesce(jsonb_agg(jsonb_build_object('name', p.first_name || ' ' || p.last_name, 'avatar_key', p.avatar_key)), '[]'::jsonb)
                    from (select r from public.channel_recipients(c.id) r limit 4) rr join public.profiles p on p.id = rr.r)
      ) as j
    from public.channels c
    left join public.channel_members mm on mm.channel_id = c.id and mm.profile_id = auth.uid()
    left join public.channel_reads rd on rd.channel_id = c.id and rd.profile_id = auth.uid()
    where public.is_channel_member(c.id) and (mm.hidden_until is null or mm.hidden_until < now() or c.last_message_at > mm.hidden_until)
  ) x
$$;

create or replace function public.messaging_unread_total()
returns int language sql stable as $$
  select coalesce(sum((select count(*) from public.channel_messages m where m.channel_id = c.id and m.type <> 'system' and m.deleted_at is null
                       and m.author_id is distinct from auth.uid() and m.created_at > coalesce(rd.last_read_at, '1970-01-01'::timestamptz)
                       and (mm.muted_until is null or mm.muted_until < now()))), 0)::int
  from public.channels c
  left join public.channel_members mm on mm.channel_id = c.id and mm.profile_id = auth.uid()
  left join public.channel_reads rd on rd.channel_id = c.id and rd.profile_id = auth.uid()
  where c.archived_at is null and public.is_channel_member(c.id)
$$;

/** Fiche d'un canal : membres (calculés ou invités), rôles, épinglés, compteur de médias. */
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
                                   case when p.role in ('editor', 'admin') then 'admin' else 'member' end))
                  order by p.last_name, p.first_name), '[]'::jsonb)
                from public.channel_recipients(c.id) r join public.profiles p on p.id = r),
    'pinned', (select coalesce(jsonb_agg(public.message_to_json(m) order by m.pinned_at desc), '[]'::jsonb)
               from public.channel_messages m where m.channel_id = c.id and m.pinned_at is not null and m.deleted_at is null),
    'media_count', (select count(*) from public.channel_messages m where m.channel_id = c.id and m.media is not null and m.deleted_at is null)
  )
  from public.channels c where c.id = p_channel and public.is_channel_member(c.id)
$$;

/** Personnes ayant lu un message (dernière lecture postérieure), hors auteur. */
create or replace function public.message_seen_by(p_message_id uuid)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.first_name || ' ' || p.last_name, 'avatar_key', p.avatar_key, 'at', r.last_read_at) order by r.last_read_at), '[]'::jsonb)
  from public.channel_messages m
  join public.channel_reads r on r.channel_id = m.channel_id and r.last_read_at >= m.created_at and r.profile_id is distinct from m.author_id
  join public.profiles p on p.id = r.profile_id
  where m.id = p_message_id and public.is_channel_member(m.channel_id)
$$;

create or replace function public.search_channel(p_channel uuid, p_q text, p_limit int default 30)
returns setof jsonb language sql stable set search_path = public, extensions as $$
  select public.message_to_json(m)
  from public.channel_messages m
  where m.channel_id = p_channel and m.deleted_at is null and m.body is not null and public.is_channel_member(p_channel)
    and (unaccent(m.body) ilike '%' || unaccent(p_q) || '%' or to_tsvector('french', m.body) @@ plainto_tsquery('french', p_q))
  order by m.created_at desc
  limit greatest(1, least(p_limit, 100))
$$;

create or replace function public.forward_message(p_message uuid, p_to_channel uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_src public.channel_messages%rowtype; v_id uuid;
begin
  select * into v_src from public.channel_messages where id = p_message;
  if v_src.id is null or not public.is_channel_member(v_src.channel_id) or not public.can_post_in(p_to_channel) or v_src.deleted_at is not null or v_src.type = 'system' then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  if v_src.type = 'media' and not public.is_editor() and not exists (select 1 from public.channels c where c.id = p_to_channel and c.members_can_post_media) then
    raise exception 'ACCES_REFUSE' using errcode = '42501';
  end if;
  insert into public.channel_messages (channel_id, author_id, type, body, media, voice)
  values (p_to_channel, auth.uid(), v_src.type, v_src.body, v_src.media, v_src.voice) returning id into v_id;
  return v_id;
end $$;

create or replace function public.export_channel(p_channel uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when public.is_editor() and public.is_channel_member(p_channel) then
    coalesce(string_agg(
      to_char(m.created_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI') || ' — ' ||
      case when m.type = 'system' then '[système] ' else public.display_name(m.author_id) || ' : ' end ||
      case when m.deleted_at is not null then '[message supprimé]'
           else coalesce(m.body, '') || case when m.media is not null then ' [' || jsonb_array_length(m.media) || ' média(s)]' else '' end
                || case when m.voice is not null then ' [message vocal]' else '' end end,
      E'\n' order by m.created_at), '')
  else null end
  from public.channel_messages m where m.channel_id = p_channel
$$;

/** Préférences par conversation (ligne créée au besoin pour les canaux fixes). */
create or replace function public.set_channel_prefs(p_channel uuid, p_notifications text default null, p_pinned boolean default null, p_muted_until timestamptz default null, p_clear_mute boolean default false, p_hidden boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_channel_member(p_channel) then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  insert into public.channel_members (channel_id, profile_id, role) values (p_channel, auth.uid(), 'member')
  on conflict (channel_id, profile_id) do nothing;
  update public.channel_members set
    notifications = coalesce(p_notifications, notifications),
    pinned = coalesce(p_pinned, pinned),
    muted_until = case when p_clear_mute then null else coalesce(p_muted_until, muted_until) end,
    hidden_until = case when p_hidden is null then hidden_until when p_hidden then now() else null end
  where channel_id = p_channel and profile_id = auth.uid();
end $$;

/** Personnes proposables dans un groupe : service communication, référents par groupement, autres personnels. */
create or replace function public.messaging_directory(p_q text default null)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_key', p.avatar_key, 'role', p.role,
    'center', (select ce.name from public.centers ce where ce.id = p.center_id),
    'grouping', (select g.name from public.centers ce join public.groupings g on g.id = ce.grouping_id where ce.id = p.center_id),
    'is_referent', exists (select 1 from public.center_referents r where r.profile_id = p.id and r.is_active)
  ) order by p.last_name, p.first_name), '[]'::jsonb)
  from public.profiles p
  where public.is_editor() and p.is_active and p.id <> auth.uid()
    and (p_q is null or p_q = '' or unaccent(p.first_name || ' ' || p.last_name) ilike '%' || unaccent(p_q) || '%')
$$;

-- -----------------------------------------------------------------------------
-- 7. Entretien : rappel 48 h, archivage à l'échéance, purge 24 mois
-- -----------------------------------------------------------------------------
create or replace function public.messaging_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_reminded int := 0; v_archived int := 0; v_purged int := 0; v_keys jsonb := '[]'::jsonb; r record;
begin
  -- Rappel 48 h avant la fin (notification dans l'app + push regroupée) aux éditeurs et membres admin
  for r in select c.* from public.channels c where c.type = 'group' and c.archived_at is null and c.ends_at is not null
           and c.ends_at between now() and now() + interval '48 hours' and c.reminded_at is null loop
    insert into public.notifications (user_id, kind, title, body, url)
    select p.id, 'message', 'Fin du groupe dans 48 h', r.name || ' passera en lecture seule le ' || to_char(r.ends_at at time zone 'Europe/Paris', 'DD/MM à HH24:MI'), '/messages/' || r.id
    from public.channel_recipients(r.id) x join public.profiles p on p.id = x
    where p.role in ('editor', 'admin') or exists (select 1 from public.channel_members m where m.channel_id = r.id and m.profile_id = p.id and m.role = 'admin' and m.left_at is null);
    insert into public.notification_queue (kind, payload, dedupe_key)
    values ('push_message'::public.notification_kind, jsonb_build_object('channel_id', r.id, 'title', 'Fin du groupe dans 48 h', 'body', r.name, 'url', '/messages/' || r.id, 'admins_only', true), 'msg-end:' || r.id);
    update public.channels set reminded_at = now() where id = r.id;
    v_reminded := v_reminded + 1;
  end loop;
  -- Archivage à l'échéance
  update public.channels set read_only = true, archived_at = now() where type = 'group' and archived_at is null and ends_at is not null and ends_at <= now();
  get diagnostics v_archived = row_count;
  -- Purge des messages de plus de 24 mois (clés de médias renvoyées pour effacement)
  select coalesce(jsonb_agg(k), '[]'::jsonb) into v_keys from (
    select jsonb_array_elements(m.media) ->> 'key' as k from public.channel_messages m where m.created_at < now() - interval '24 months' and m.media is not null
    union all
    select m.voice ->> 'key' from public.channel_messages m where m.created_at < now() - interval '24 months' and m.voice is not null
    union all
    select jsonb_array_elements(m.media) ->> 'poster_key' from public.channel_messages m where m.created_at < now() - interval '24 months' and m.media is not null
  ) q where k is not null;
  delete from public.channel_messages where created_at < now() - interval '24 months';
  get diagnostics v_purged = row_count;
  return jsonb_build_object('reminded', v_reminded, 'archived', v_archived, 'purged', v_purged, 'keys', v_keys);
end $$;

/** Destinataires d'une push de messagerie avec leurs préférences (clé service_role). */
create or replace function public.channel_push_targets(p_channel uuid)
returns table (user_id uuid, notifications text, muted_until timestamptz, push_messages text, hide_preview boolean, is_admin boolean)
language sql stable security definer set search_path = public as $$
  select r as user_id,
         coalesce(m.notifications, 'all'), m.muted_until,
         coalesce(s.push_messages, 'all'), coalesce(s.hide_preview, false),
         (p.role in ('editor', 'admin') or coalesce(m.role = 'admin', false))
  from public.channel_recipients(p_channel) r
  join public.profiles p on p.id = r
  left join public.channel_members m on m.channel_id = p_channel and m.profile_id = r
  left join public.user_settings s on s.user_id = r
$$;

-- -----------------------------------------------------------------------------
-- 8. Temps réel et droits
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.channel_messages, public.message_reactions;

revoke all on function public.is_channel_member(uuid) from public;
revoke all on function public.can_use_messaging() from public;
revoke all on function public.channel_recipients(uuid) from public;
revoke all on function public.can_post_in(uuid) from public;
revoke all on function public.display_name(uuid) from public;
revoke all on function public.system_message(uuid, text) from public;
revoke all on function public.message_to_json(public.channel_messages) from public;
revoke all on function public.channel_messages_page(uuid, timestamptz, int) from public;
revoke all on function public.mark_channel_read(uuid, uuid) from public;
revoke all on function public.channel_title(public.channels) from public;
revoke all on function public.list_conversations() from public;
revoke all on function public.messaging_unread_total() from public;
revoke all on function public.channel_info(uuid) from public;
revoke all on function public.message_seen_by(uuid) from public;
revoke all on function public.search_channel(uuid, text, int) from public;
revoke all on function public.forward_message(uuid, uuid) from public;
revoke all on function public.export_channel(uuid) from public;
revoke all on function public.set_channel_prefs(uuid, text, boolean, timestamptz, boolean, boolean) from public;
revoke all on function public.messaging_directory(text) from public;
revoke all on function public.messaging_maintenance() from public;
revoke all on function public.channel_push_targets(uuid) from public;

grant execute on function public.is_channel_member(uuid) to authenticated, service_role;
grant execute on function public.can_use_messaging() to authenticated, service_role;
grant execute on function public.channel_recipients(uuid) to authenticated, service_role;
grant execute on function public.can_post_in(uuid) to authenticated, service_role;
grant execute on function public.display_name(uuid) to authenticated, service_role;
grant execute on function public.message_to_json(public.channel_messages) to authenticated, service_role;
grant execute on function public.channel_messages_page(uuid, timestamptz, int) to authenticated, service_role;
grant execute on function public.mark_channel_read(uuid, uuid) to authenticated;
grant execute on function public.channel_title(public.channels) to authenticated, service_role;
grant execute on function public.list_conversations() to authenticated;
grant execute on function public.messaging_unread_total() to authenticated;
grant execute on function public.channel_info(uuid) to authenticated, service_role;
grant execute on function public.message_seen_by(uuid) to authenticated;
grant execute on function public.search_channel(uuid, text, int) to authenticated;
grant execute on function public.forward_message(uuid, uuid) to authenticated;
grant execute on function public.export_channel(uuid) to authenticated;
grant execute on function public.set_channel_prefs(uuid, text, boolean, timestamptz, boolean, boolean) to authenticated;
grant execute on function public.messaging_directory(text) to authenticated;
grant execute on function public.messaging_maintenance() to service_role;
grant execute on function public.channel_push_targets(uuid) to service_role;
