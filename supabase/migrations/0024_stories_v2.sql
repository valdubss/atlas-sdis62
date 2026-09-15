-- =============================================================================
-- ATLAS — migration 0024 : stories v2 (lot 5 v3)
--   réactions, sondage et question superposés, à-la-une (titre court, ordre,
--   couverture), vues qualifiées (complétion, passage à la suivante), stats.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Réactions aux stories : les quatre réactions du fil, visibles de la com
-- -----------------------------------------------------------------------------
create table if not exists public.story_reactions (
  story_id    uuid not null references public.stories (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        public.reaction_kind not null,
  created_at  timestamptz not null default now(),
  primary key (story_id, user_id)
);
create index if not exists story_reactions_story_idx on public.story_reactions (story_id, kind);
alter table public.story_reactions enable row level security;

drop policy if exists story_reactions_own on public.story_reactions;
create policy story_reactions_own on public.story_reactions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.stories s where s.id = story_id and s.status = 'published' and s.expires_at > now()));
drop policy if exists story_reactions_select on public.story_reactions;
create policy story_reactions_select on public.story_reactions for select to authenticated
  using (user_id = auth.uid() or public.is_editor());
drop policy if exists story_reactions_editor_delete on public.story_reactions;
create policy story_reactions_editor_delete on public.story_reactions for delete to authenticated
  using (public.is_editor());

/** Pose, change ou retire (p_kind null) sa réaction à une story. */
create or replace function public.set_story_reaction(p_story_id uuid, p_kind text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_kind public.reaction_kind;
begin
  if auth.uid() is null then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  if not exists (select 1 from public.stories s where s.id = p_story_id and s.status = 'published' and s.expires_at > now()) then
    raise exception 'STORY_INDISPONIBLE' using errcode = 'P0001';
  end if;
  if p_kind is null then
    delete from public.story_reactions where story_id = p_story_id and user_id = auth.uid();
    return jsonb_build_object('mine', null);
  end if;
  v_kind := p_kind::public.reaction_kind;
  insert into public.story_reactions (story_id, user_id, kind) values (p_story_id, auth.uid(), v_kind)
  on conflict (story_id, user_id) do update set kind = excluded.kind, created_at = now();
  return jsonb_build_object('mine', v_kind);
end $$;

-- -----------------------------------------------------------------------------
-- 2. Sondage superposé (un par story, 2 à 4 options), position relative
-- -----------------------------------------------------------------------------
create table if not exists public.story_polls (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null unique references public.stories (id) on delete cascade,
  question    text not null check (char_length(question) between 1 and 80),
  options     jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4),
  x           numeric(4,3) not null default 0.5 check (x between 0 and 1),
  y           numeric(4,3) not null default 0.62 check (y between 0 and 1),
  w           numeric(4,3) not null default 0.8 check (w between 0.3 and 1),
  created_at  timestamptz not null default now()
);
alter table public.story_polls enable row level security;
drop policy if exists story_polls_select on public.story_polls;
create policy story_polls_select on public.story_polls for select to authenticated
  using (exists (select 1 from public.stories s where s.id = story_id));
drop policy if exists story_polls_editor on public.story_polls;
create policy story_polls_editor on public.story_polls for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create table if not exists public.story_poll_votes (
  poll_id       uuid not null references public.story_polls (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  option_index  smallint not null check (option_index between 0 and 3),
  created_at    timestamptz not null default now(),
  primary key (poll_id, user_id)
);
alter table public.story_poll_votes enable row level security;
drop policy if exists story_poll_votes_select on public.story_poll_votes;
create policy story_poll_votes_select on public.story_poll_votes for select to authenticated
  using (user_id = auth.uid() or public.is_editor());
drop policy if exists story_poll_votes_editor_delete on public.story_poll_votes;
create policy story_poll_votes_editor_delete on public.story_poll_votes for delete to authenticated
  using (public.is_editor());
-- Les votes passent par vote_story_poll (une seule voix, story en ligne)

/** Répartition des votes : visible après avoir voté, ou par les éditeurs. */
create or replace function public.story_poll_counts(p_poll_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_n int; v_counts jsonb;
begin
  if auth.uid() is null then return null; end if;
  if not public.is_editor() and not exists (select 1 from public.story_poll_votes v where v.poll_id = p_poll_id and v.user_id = auth.uid()) then
    return null;
  end if;
  select jsonb_array_length(options) into v_n from public.story_polls where id = p_poll_id;
  if v_n is null then return null; end if;
  select jsonb_agg(coalesce(c.n, 0) order by i.idx) into v_counts
  from generate_series(0, v_n - 1) as i(idx)
  left join (select option_index, count(*) as n from public.story_poll_votes where poll_id = p_poll_id group by option_index) c on c.option_index = i.idx;
  return v_counts;
end $$;

create or replace function public.vote_story_poll(p_poll_id uuid, p_option int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  select jsonb_array_length(p.options) into v_n
  from public.story_polls p join public.stories s on s.id = p.story_id
  where p.id = p_poll_id and s.status = 'published' and s.expires_at > now();
  if v_n is null then raise exception 'STORY_INDISPONIBLE' using errcode = 'P0001'; end if;
  if p_option < 0 or p_option >= v_n then raise exception 'OPTION_INVALIDE' using errcode = 'P0001'; end if;
  insert into public.story_poll_votes (poll_id, user_id, option_index) values (p_poll_id, auth.uid(), p_option)
  on conflict (poll_id, user_id) do nothing;
  return jsonb_build_object(
    'my_vote', (select option_index from public.story_poll_votes where poll_id = p_poll_id and user_id = auth.uid()),
    'counts', public.story_poll_counts(p_poll_id));
end $$;

-- -----------------------------------------------------------------------------
-- 3. Question superposée (une par story) ; réponses lisibles des éditeurs seulement
-- -----------------------------------------------------------------------------
create table if not exists public.story_questions (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null unique references public.stories (id) on delete cascade,
  prompt      text not null check (char_length(prompt) between 1 and 80),
  x           numeric(4,3) not null default 0.5 check (x between 0 and 1),
  y           numeric(4,3) not null default 0.62 check (y between 0 and 1),
  created_at  timestamptz not null default now()
);
alter table public.story_questions enable row level security;
drop policy if exists story_questions_select on public.story_questions;
create policy story_questions_select on public.story_questions for select to authenticated
  using (exists (select 1 from public.stories s where s.id = story_id));
drop policy if exists story_questions_editor on public.story_questions;
create policy story_questions_editor on public.story_questions for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

create table if not exists public.story_question_answers (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.story_questions (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete set null,
  answer       text not null check (char_length(answer) between 1 and 200),
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists story_question_answers_q_idx on public.story_question_answers (question_id, created_at desc);
alter table public.story_question_answers enable row level security;
drop policy if exists story_question_answers_insert on public.story_question_answers;
create policy story_question_answers_insert on public.story_question_answers for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.story_questions q join public.stories s on s.id = q.story_id
    where q.id = question_id and s.status = 'published' and s.expires_at > now()));
drop policy if exists story_question_answers_editor on public.story_question_answers;
create policy story_question_answers_editor on public.story_question_answers for select to authenticated
  using (public.is_editor());
drop policy if exists story_question_answers_editor_write on public.story_question_answers;
create policy story_question_answers_editor_write on public.story_question_answers for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
drop policy if exists story_question_answers_editor_delete on public.story_question_answers;
create policy story_question_answers_editor_delete on public.story_question_answers for delete to authenticated
  using (public.is_editor());

create or replace function public.story_answers_rate_limit()
returns trigger language plpgsql as $$
begin
  perform public.check_rate_limit('story_answer', 20, interval '1 hour');
  return new;
end $$;
drop trigger if exists story_question_answers_rate on public.story_question_answers;
create trigger story_question_answers_rate before insert on public.story_question_answers
  for each row execute function public.story_answers_rate_limit();

-- -----------------------------------------------------------------------------
-- 4. À la une : titre court (16), réordonnancement, couverture
-- -----------------------------------------------------------------------------
alter table public.story_highlights drop constraint if exists story_highlights_title_short;
alter table public.story_highlights add constraint story_highlights_title_short check (char_length(title) <= 16) not valid;

create or replace function public.reorder_highlights(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_editor() then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  update public.story_highlights h set position = x.pos - 1
  from unnest(p_ids) with ordinality as x(id, pos) where h.id = x.id;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Vues qualifiées : progression (lot 1) + passage à la suivante
-- -----------------------------------------------------------------------------
alter table public.story_views add column if not exists advanced boolean not null default false;

/** Progression maximale atteinte (0–100) et passage manuel à la suivante. */
create or replace function public.record_story_progress(p_story_id uuid, p_pct int, p_advanced boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_pct smallint := greatest(0, least(100, coalesce(p_pct, 0)));
begin
  if auth.uid() is null then return; end if;
  insert into public.story_views (story_id, user_id, progress, advanced) values (p_story_id, auth.uid(), v_pct, coalesce(p_advanced, false))
  on conflict (story_id, user_id) do update
    set progress = greatest(public.story_views.progress, excluded.progress),
        advanced = public.story_views.advanced or excluded.advanced;
end $$;

-- -----------------------------------------------------------------------------
-- 6. story_to_json : réaction, sondage, question
-- -----------------------------------------------------------------------------
create or replace function public.story_to_json(s public.stories)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id',              s.id,
    'series_id',       s.series_id,
    'series_title',    (select ss.title from public.story_series ss where ss.id = s.series_id),
    'status',          s.status,
    'overlay',         s.overlay,
    'display_seconds', s.display_seconds,
    'scheduled_at',    s.scheduled_at,
    'published_at',    s.published_at,
    'expires_at',      s.expires_at,
    'position',        s.position,
    'media',           (select public.media_to_json(m) from public.media m where m.id = s.media_id),
    'link_post',       (select jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title)
                        from public.posts p where p.id = s.link_post_id and p.status = 'published' and p.deleted_at is null),
    'seen',            exists (select 1 from public.story_views v where v.story_id = s.id and v.user_id = auth.uid()),
    'views',           (select count(*) from public.story_views v where v.story_id = s.id),
    'replies',         (select count(*) from public.story_replies r where r.story_id = s.id),
    'reactions',       (select count(*) from public.story_reactions r where r.story_id = s.id),
    'my_reaction',     (select r.kind from public.story_reactions r where r.story_id = s.id and r.user_id = auth.uid()),
    'poll',            (select jsonb_build_object(
                          'id', p.id, 'question', p.question, 'options', p.options, 'x', p.x, 'y', p.y, 'w', p.w,
                          'my_vote', (select v.option_index from public.story_poll_votes v where v.poll_id = p.id and v.user_id = auth.uid()),
                          'counts', public.story_poll_counts(p.id))
                        from public.story_polls p where p.story_id = s.id),
    'question',        (select jsonb_build_object('id', q.id, 'prompt', q.prompt, 'x', q.x, 'y', q.y)
                        from public.story_questions q where q.story_id = s.id)
  )
$$;

-- -----------------------------------------------------------------------------
-- 7. Studio → Statistiques : stories (vues, complétion, passage, réactions, réponses)
-- -----------------------------------------------------------------------------
create or replace function public.studio_story_stats(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
begin
  if not public.is_editor() then raise exception 'ACCES_REFUSE' using errcode = '42501'; end if;
  return jsonb_build_object(
    'since', v_since,
    'totals', jsonb_build_object(
      'stories',   (select count(*) from public.stories where status in ('published', 'expired', 'archived') and published_at > v_since),
      'views',     (select count(*) from public.story_views v join public.stories s on s.id = v.story_id where s.published_at > v_since),
      'completed', (select count(*) from public.story_views v join public.stories s on s.id = v.story_id where s.published_at > v_since and v.progress >= 100),
      'advanced',  (select count(*) from public.story_views v join public.stories s on s.id = v.story_id where s.published_at > v_since and v.advanced),
      'reactions', (select count(*) from public.story_reactions r join public.stories s on s.id = r.story_id where s.published_at > v_since),
      'answers',   (select count(*) from public.story_question_answers a join public.story_questions q on q.id = a.question_id join public.stories s on s.id = q.story_id where s.published_at > v_since)
    ),
    'stories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'series_title', ss.title, 'text', s.overlay ->> 'text', 'published_at', s.published_at, 'status', s.status,
        'views', (select count(*) from public.story_views v where v.story_id = s.id),
        'completed', (select count(*) from public.story_views v where v.story_id = s.id and v.progress >= 100),
        'advanced', (select count(*) from public.story_views v where v.story_id = s.id and v.advanced),
        'reactions', (select coalesce(jsonb_object_agg(r.kind, r.n), '{}'::jsonb) from (select kind, count(*) as n from public.story_reactions where story_id = s.id group by kind) r),
        'poll_votes', (select count(*) from public.story_poll_votes v join public.story_polls p on p.id = v.poll_id where p.story_id = s.id),
        'answers', (select count(*) from public.story_question_answers a join public.story_questions q on q.id = a.question_id where q.story_id = s.id),
        'replies', (select count(*) from public.story_replies r where r.story_id = s.id)
      ) order by s.published_at desc)
      from public.stories s left join public.story_series ss on ss.id = s.series_id
      where s.status in ('published', 'expired', 'archived') and s.published_at > v_since
    ), '[]'::jsonb)
  );
end $$;

-- -----------------------------------------------------------------------------
-- 8. Droits
-- -----------------------------------------------------------------------------
revoke all on function public.set_story_reaction(uuid, text) from public;
revoke all on function public.story_poll_counts(uuid) from public;
revoke all on function public.vote_story_poll(uuid, int) from public;
revoke all on function public.reorder_highlights(uuid[]) from public;
revoke all on function public.record_story_progress(uuid, int, boolean) from public;
revoke all on function public.studio_story_stats(int) from public;
grant execute on function public.set_story_reaction(uuid, text) to authenticated;
grant execute on function public.story_poll_counts(uuid) to authenticated, service_role;
grant execute on function public.vote_story_poll(uuid, int) to authenticated;
grant execute on function public.reorder_highlights(uuid[]) to authenticated;
grant execute on function public.record_story_progress(uuid, int, boolean) to authenticated;
grant execute on function public.studio_story_stats(int) to authenticated;
