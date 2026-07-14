create or replace function public.create_project_with_owner(
  p_actor_id uuid,
  p_name text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_base_slug text;
  v_slug text;
  v_project_id uuid;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Project names must be between 2 and 120 characters'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  if not (
    exists (
      select 1
      from auth.users
      where id = p_actor_id
        and raw_app_meta_data @> '{"project_creator": true}'::jsonb
    )
    or exists (
      select 1
      from public.memberships
      where user_id = p_actor_id and role = 'project_owner'
    )
  ) then
    raise exception 'Project creation is not allowed for this account'
      using errcode = '42501';
  end if;

  v_base_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then
    v_base_slug := 'project';
  end if;
  v_base_slug := left(v_base_slug, 48);
  v_slug := v_base_slug;

  while exists (select 1 from public.projects where slug = v_slug) loop
    v_slug := left(v_base_slug, 39) || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
  end loop;

  insert into public.projects (name, slug)
  values (v_name, v_slug)
  returning id into v_project_id;

  insert into public.memberships (project_id, user_id, role)
  values (v_project_id, p_actor_id, 'project_owner');

  return v_project_id;
end;
$$;

revoke all on function public.create_project_with_owner(uuid, text) from public, anon, authenticated;
grant execute on function public.create_project_with_owner(uuid, text) to service_role;
