alter table public.email_jobs drop constraint email_jobs_source_kind_check;
alter table public.email_jobs add constraint email_jobs_source_kind_check
  check (source_kind in ('card_created', 'message_added', 'project_invite'));

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('reviewer', 'member', 'viewer')),
  invited_by uuid not null references public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index project_invitations_project_email_idx
  on public.project_invitations(project_id, lower(email));
create index project_invitations_user_idx
  on public.project_invitations(invited_user_id, accepted_at);

alter table public.project_invitations enable row level security;
revoke all on public.project_invitations from anon, authenticated;
grant all on public.project_invitations to service_role;

create or replace function public.add_project_invitation(
  p_project_id uuid,
  p_actor_id uuid,
  p_invited_user_id uuid,
  p_email text,
  p_role text,
  p_send_app_email boolean,
  p_web_base_url text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invitation_id uuid;
  v_project_name text;
begin
  select p.name into v_project_name
  from public.projects p
  join public.memberships m on m.project_id = p.id
  where p.id = p_project_id and m.user_id = p_actor_id and m.role = 'owner';

  if v_project_name is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_role not in ('reviewer', 'member', 'viewer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.memberships
    where project_id = p_project_id and user_id = p_invited_user_id
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  insert into public.project_invitations (
    project_id, email, invited_user_id, role, invited_by
  ) values (
    p_project_id, lower(trim(p_email)), p_invited_user_id, p_role, p_actor_id
  ) returning id into v_invitation_id;

  insert into public.memberships (project_id, user_id, role)
  values (p_project_id, p_invited_user_id, p_role);

  if p_send_app_email then
    insert into public.email_jobs (
      project_id, recipient_user_id, recipient_email, source_kind, source_id,
      subject, text_body, html_body
    ) values (
      p_project_id,
      p_invited_user_id,
      lower(trim(p_email)),
      'project_invite',
      v_invitation_id,
      'You were added to ' || v_project_name || ' on SpecCheck',
      'You now have access to ' || v_project_name || E'.\n\nSign in: ' || p_web_base_url,
      '<h2>You were added to ' || replace(v_project_name, '<', '&lt;') || '</h2><p>Sign in to review the architecture specification.</p><p><a href="' || p_web_base_url || '">Open SpecCheck</a></p>'
    );
  end if;

  return v_invitation_id;
end;
$$;

revoke all on function public.add_project_invitation(uuid, uuid, uuid, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.add_project_invitation(uuid, uuid, uuid, text, text, boolean, text)
  to service_role;
