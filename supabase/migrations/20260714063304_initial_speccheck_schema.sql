create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active_version_id uuid,
  created_at timestamptz not null default now()
);

create table public.memberships (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'reviewer', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.specification_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  filename text not null,
  markdown text not null,
  content_hash text not null,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, content_hash, created_at)
);

alter table public.projects
  add constraint projects_active_version_fk
  foreign key (active_version_id) references public.specification_versions(id)
  on delete set null;

create table public.review_cards (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.specification_versions(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  risk text not null check (risk in ('discussion', 'high_risk', 'blocker')),
  state text not null default 'open' check (state in ('open', 'closed')),
  state_version integer not null default 0 check (state_version >= 0),
  block_start integer not null check (block_start >= 0),
  block_end integer not null check (block_end > block_start),
  selected_text text,
  selection_start integer,
  selection_end integer,
  created_by uuid not null references public.profiles(id),
  resolution_summary text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (selected_text is null and selection_start is null and selection_end is null)
    or
    (selected_text is not null and selection_start is not null and selection_end is not null and selection_end >= selection_start)
  )
);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.review_cards(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now()
);

create table public.card_transitions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.review_cards(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  from_state text not null check (from_state in ('open', 'closed')),
  to_state text not null check (to_state in ('open', 'closed')),
  resolution_summary text,
  state_version integer not null,
  created_at timestamptz not null default now()
);

create table public.specification_approvals (
  version_id uuid primary key references public.specification_versions(id) on delete cascade,
  approved_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  source_kind text not null check (source_kind in ('card_created', 'message_added')),
  source_id uuid not null,
  subject text not null,
  text_body text not null,
  html_body text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error text,
  smtp_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_kind, source_id, recipient_user_id)
);

create index memberships_user_idx on public.memberships(user_id, project_id);
create index versions_project_idx on public.specification_versions(project_id, created_at desc);
create index cards_version_idx on public.review_cards(version_id, block_start, created_at);
create index cards_open_blocker_idx on public.review_cards(version_id) where state = 'open' and risk = 'blocker';
create index messages_card_idx on public.conversation_messages(card_id, created_at, id);
create index transitions_card_idx on public.card_transitions(card_id, created_at, id);
create index email_jobs_claim_idx on public.email_jobs(status, available_at, lease_expires_at) where status in ('pending', 'processing');

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.memberships enable row level security;
alter table public.specification_versions enable row level security;
alter table public.review_cards enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.card_transitions enable row level security;
alter table public.specification_approvals enable row level security;
alter table public.email_jobs enable row level security;

-- Domain data is intentionally backend-only. The browser uses Supabase Auth but
-- reaches these tables exclusively through the Express API.
revoke all on public.profiles, public.projects, public.memberships,
  public.specification_versions, public.review_cards, public.conversation_messages,
  public.card_transitions, public.specification_approvals, public.email_jobs
  from anon, authenticated;
grant all on public.profiles, public.projects, public.memberships,
  public.specification_versions, public.review_cards, public.conversation_messages,
  public.card_transitions, public.specification_approvals, public.email_jobs
  to service_role;

create or replace function public.create_specification_version(
  p_project_id uuid,
  p_actor_id uuid,
  p_title text,
  p_filename text,
  p_markdown text,
  p_content_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_version_id uuid;
begin
  if not exists (
    select 1 from public.memberships
    where project_id = p_project_id and user_id = p_actor_id and role = 'owner'
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.specification_versions (
    project_id, title, filename, markdown, content_hash, uploaded_by
  ) values (
    p_project_id, p_title, p_filename, p_markdown, p_content_hash, p_actor_id
  ) returning id into v_version_id;

  update public.projects set active_version_id = v_version_id where id = p_project_id;
  return v_version_id;
end;
$$;

create or replace function public.create_review_card(
  p_version_id uuid,
  p_actor_id uuid,
  p_title text,
  p_body text,
  p_risk text,
  p_block_start integer,
  p_block_end integer,
  p_selected_text text default null,
  p_selection_start integer default null,
  p_selection_end integer default null,
  p_web_base_url text default ''
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_card_id uuid;
  v_message_id uuid;
  v_project_id uuid;
  v_filename text;
begin
  select sv.project_id, sv.filename into v_project_id, v_filename
  from public.specification_versions sv
  join public.memberships m on m.project_id = sv.project_id and m.user_id = p_actor_id
  where sv.id = p_version_id and m.role in ('owner', 'reviewer', 'member');

  if v_project_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.review_cards (
    version_id, title, risk, block_start, block_end, selected_text,
    selection_start, selection_end, created_by
  ) values (
    p_version_id, p_title, p_risk, p_block_start, p_block_end, p_selected_text,
    p_selection_start, p_selection_end, p_actor_id
  ) returning id into v_card_id;

  insert into public.conversation_messages (card_id, author_id, body)
  values (v_card_id, p_actor_id, p_body)
  returning id into v_message_id;

  insert into public.email_jobs (
    project_id, recipient_user_id, recipient_email, source_kind, source_id,
    subject, text_body, html_body
  )
  select
    v_project_id,
    m.user_id,
    p.email,
    'card_created',
    v_message_id,
    'New SpecCheck review: ' || p_title,
    p_title || E'\n\n' || p_body || E'\n\n' || p_web_base_url || '/projects/' || v_project_id || '/versions/' || p_version_id || '?card=' || v_card_id,
    '<h2>' || replace(p_title, '<', '&lt;') || '</h2><p>' || replace(replace(p_body, '<', '&lt;'), E'\n', '<br>') || '</p><p><a href="' || p_web_base_url || '/projects/' || v_project_id || '/versions/' || p_version_id || '?card=' || v_card_id || '">Open review</a></p>'
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.project_id = v_project_id and m.user_id <> p_actor_id;

  return v_card_id;
end;
$$;

create or replace function public.add_review_message(
  p_card_id uuid,
  p_actor_id uuid,
  p_body text,
  p_web_base_url text default ''
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_message_id uuid;
  v_project_id uuid;
  v_version_id uuid;
  v_card_title text;
begin
  select sv.project_id, rc.version_id, rc.title
  into v_project_id, v_version_id, v_card_title
  from public.review_cards rc
  join public.specification_versions sv on sv.id = rc.version_id
  join public.memberships m on m.project_id = sv.project_id and m.user_id = p_actor_id
  where rc.id = p_card_id and m.role in ('owner', 'reviewer', 'member');

  if v_project_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.conversation_messages (card_id, author_id, body)
  values (p_card_id, p_actor_id, p_body)
  returning id into v_message_id;

  insert into public.email_jobs (
    project_id, recipient_user_id, recipient_email, source_kind, source_id,
    subject, text_body, html_body
  )
  select
    v_project_id,
    m.user_id,
    p.email,
    'message_added',
    v_message_id,
    'New reply: ' || v_card_title,
    p_body || E'\n\n' || p_web_base_url || '/projects/' || v_project_id || '/versions/' || v_version_id || '?card=' || p_card_id,
    '<p>' || replace(replace(p_body, '<', '&lt;'), E'\n', '<br>') || '</p><p><a href="' || p_web_base_url || '/projects/' || v_project_id || '/versions/' || v_version_id || '?card=' || p_card_id || '">Open conversation</a></p>'
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.project_id = v_project_id and m.user_id <> p_actor_id;

  return v_message_id;
end;
$$;

create or replace function public.transition_review_card(
  p_card_id uuid,
  p_actor_id uuid,
  p_expected_version integer,
  p_to_state text,
  p_resolution_summary text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_from_state text;
  v_risk text;
  v_next_version integer;
  v_version_id uuid;
  v_project_id uuid;
begin
  select rc.state, rc.risk, rc.state_version, rc.version_id, sv.project_id
  into v_from_state, v_risk, v_next_version, v_version_id, v_project_id
  from public.review_cards rc
  join public.specification_versions sv on sv.id = rc.version_id
  join public.memberships m on m.project_id = sv.project_id and m.user_id = p_actor_id
  where rc.id = p_card_id and m.role in ('owner', 'reviewer', 'member')
  for update of rc;

  if v_project_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_next_version <> p_expected_version then
    raise exception 'stale_state' using errcode = '40001';
  end if;
  if p_to_state not in ('open', 'closed') or p_to_state = v_from_state then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  if p_to_state = 'closed' and v_risk = 'blocker' and coalesce(trim(p_resolution_summary), '') = '' then
    raise exception 'resolution_required' using errcode = '22023';
  end if;

  v_next_version := v_next_version + 1;
  update public.review_cards
  set state = p_to_state,
      state_version = v_next_version,
      resolution_summary = case when p_to_state = 'closed' then p_resolution_summary else null end,
      closed_at = case when p_to_state = 'closed' then now() else null end,
      updated_at = now()
  where id = p_card_id;

  insert into public.card_transitions (
    card_id, actor_id, from_state, to_state, resolution_summary, state_version
  ) values (
    p_card_id, p_actor_id, v_from_state, p_to_state, p_resolution_summary, v_next_version
  );

  if p_to_state = 'open' and v_risk = 'blocker' then
    delete from public.specification_approvals where version_id = v_version_id;
  end if;

  return v_next_version;
end;
$$;

create or replace function public.approve_specification(
  p_version_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  select sv.project_id into v_project_id
  from public.specification_versions sv
  join public.memberships m on m.project_id = sv.project_id and m.user_id = p_actor_id
  where sv.id = p_version_id and m.role in ('owner', 'reviewer');

  if v_project_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.review_cards
    where version_id = p_version_id and risk = 'blocker' and state = 'open'
  ) then
    raise exception 'open_blockers' using errcode = '23514';
  end if;

  insert into public.specification_approvals (version_id, approved_by)
  values (p_version_id, p_actor_id)
  on conflict (version_id) do update
  set approved_by = excluded.approved_by, created_at = now();
end;
$$;

create or replace function public.claim_email_jobs(p_limit integer default 10)
returns setof public.email_jobs
language sql
security invoker
set search_path = ''
as $$
  with claimed as (
    select id
    from public.email_jobs
    where
      (status = 'pending' and available_at <= now())
      or
      (status = 'processing' and lease_expires_at < now())
    order by created_at
    for update skip locked
    limit greatest(1, least(p_limit, 50))
  )
  update public.email_jobs j
  set status = 'processing',
      attempts = attempts + 1,
      lease_expires_at = now() + interval '2 minutes'
  from claimed
  where j.id = claimed.id
  returning j.*;
$$;

create or replace function public.get_my_activity(p_actor_id uuid, p_limit integer default 100)
returns table (
  id text,
  project_id uuid,
  project_name text,
  version_id uuid,
  card_id uuid,
  kind text,
  actor_name text,
  summary text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from (
    select
      'card:' || rc.id::text as id,
      sv.project_id,
      p.name as project_name,
      rc.version_id,
      rc.id as card_id,
      'card'::text as kind,
      pr.display_name as actor_name,
      rc.title as summary,
      rc.created_at
    from public.review_cards rc
    join public.specification_versions sv on sv.id = rc.version_id
    join public.projects p on p.id = sv.project_id
    join public.profiles pr on pr.id = rc.created_by
    join public.memberships viewer on viewer.project_id = p.id and viewer.user_id = p_actor_id
    where rc.created_by = p_actor_id

    union all

    select
      'message:' || cm.id::text,
      sv.project_id,
      p.name,
      rc.version_id,
      rc.id,
      'message'::text,
      pr.display_name,
      left(cm.body, 240),
      cm.created_at
    from public.conversation_messages cm
    join public.review_cards rc on rc.id = cm.card_id
    join public.specification_versions sv on sv.id = rc.version_id
    join public.projects p on p.id = sv.project_id
    join public.profiles pr on pr.id = cm.author_id
    join public.memberships viewer on viewer.project_id = p.id and viewer.user_id = p_actor_id
    where cm.author_id = p_actor_id

    union all

    select
      'transition:' || ct.id::text,
      sv.project_id,
      p.name,
      rc.version_id,
      rc.id,
      case when ct.to_state = 'closed' then 'closed' else 'reopened' end,
      pr.display_name,
      coalesce(ct.resolution_summary, rc.title),
      ct.created_at
    from public.card_transitions ct
    join public.review_cards rc on rc.id = ct.card_id
    join public.specification_versions sv on sv.id = rc.version_id
    join public.projects p on p.id = sv.project_id
    join public.profiles pr on pr.id = ct.actor_id
    join public.memberships viewer on viewer.project_id = p.id and viewer.user_id = p_actor_id
    where ct.actor_id = p_actor_id
  ) activity
  order by created_at desc, id desc
  limit greatest(1, least(p_limit, 250));
$$;

revoke all on function public.create_specification_version(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_review_card(uuid, uuid, text, text, text, integer, integer, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.add_review_message(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.transition_review_card(uuid, uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.approve_specification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_email_jobs(integer) from public, anon, authenticated;
revoke all on function public.get_my_activity(uuid, integer) from public, anon, authenticated;

grant execute on function public.create_specification_version(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.create_review_card(uuid, uuid, text, text, text, integer, integer, text, integer, integer, text) to service_role;
grant execute on function public.add_review_message(uuid, uuid, text, text) to service_role;
grant execute on function public.transition_review_card(uuid, uuid, integer, text, text) to service_role;
grant execute on function public.approve_specification(uuid, uuid) to service_role;
grant execute on function public.claim_email_jobs(integer) to service_role;
grant execute on function public.get_my_activity(uuid, integer) to service_role;
