-- SpecCheck intentionally has only two project roles. This migration upgrades
-- databases created with the earlier four-role prototype and rewrites every
-- privileged database function so authorization is enforced below the API.

alter table public.memberships drop constraint memberships_role_check;

update public.memberships
set role = case
  when role = 'owner' then 'project_owner'
  else 'project_member'
end;

alter table public.memberships add constraint memberships_role_check
  check (role in ('project_owner', 'project_member'));

alter table public.project_invitations drop constraint project_invitations_role_check;

update public.project_invitations set role = 'project_member';

alter table public.project_invitations add constraint project_invitations_role_check
  check (role = 'project_member');

do $$
declare
  v_function record;
  v_definition text;
  v_original_definition text;
begin
  for v_function in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_specification_version',
        'create_review_card',
        'add_review_message',
        'transition_review_card',
        'approve_specification',
        'add_project_invitation'
      )
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    v_original_definition := v_definition;

    if v_function.proname = 'create_specification_version' then
      v_definition := replace(v_definition, 'role = ''owner''', 'role = ''project_owner''');
    elsif v_function.proname in ('create_review_card', 'add_review_message') then
      v_definition := replace(
        v_definition,
        'm.role in (''owner'', ''reviewer'', ''member'')',
        'm.role in (''project_owner'', ''project_member'')'
      );
    elsif v_function.proname = 'transition_review_card' then
      v_definition := replace(
        v_definition,
        'm.role in (''owner'', ''reviewer'', ''member'')',
        'm.role = ''project_owner'''
      );
    elsif v_function.proname = 'approve_specification' then
      v_definition := replace(
        v_definition,
        'm.role in (''owner'', ''reviewer'')',
        'm.role = ''project_owner'''
      );
    elsif v_function.proname = 'add_project_invitation' then
      v_definition := replace(v_definition, 'm.role = ''owner''', 'm.role = ''project_owner''');
      v_definition := replace(
        v_definition,
        'p_role not in (''reviewer'', ''member'', ''viewer'')',
        'p_role <> ''project_member'''
      );
    end if;

    if v_definition = v_original_definition then
      raise exception 'role rewrite failed for function %', v_function.proname;
    end if;

    execute v_definition;
  end loop;
end;
$$;

revoke all on function public.create_specification_version(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.create_review_card(uuid, uuid, text, text, text, integer, integer, text, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.add_review_message(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.transition_review_card(uuid, uuid, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.approve_specification(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.add_project_invitation(uuid, uuid, uuid, text, text, boolean, text)
  from public, anon, authenticated;

grant execute on function public.create_specification_version(uuid, uuid, text, text, text, text)
  to service_role;
grant execute on function public.create_review_card(uuid, uuid, text, text, text, integer, integer, text, integer, integer, text)
  to service_role;
grant execute on function public.add_review_message(uuid, uuid, text, text)
  to service_role;
grant execute on function public.transition_review_card(uuid, uuid, integer, text, text)
  to service_role;
grant execute on function public.approve_specification(uuid, uuid)
  to service_role;
grant execute on function public.add_project_invitation(uuid, uuid, uuid, text, text, boolean, text)
  to service_role;
