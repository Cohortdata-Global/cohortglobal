-- Implementation decision ID-31: a suspended or deactivated agency keeps read
-- access to its records, but can't assign members to projects.
-- assign_member already checks the assignment, project and member; this trigger
-- adds the agency status check in one place so every insert path is covered.

create or replace function app.guard_member_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organizations where id = new.organization_id and status = 'ACTIVE') then
    perform app.fail('CG409', 'Your agency must be active to assign members.');
  end if;
  return new;
end;
$$;

create trigger member_assignments_agency_active
  before insert on public.member_assignments
  for each row execute function app.guard_member_assignment();

revoke all on function app.guard_member_assignment() from public;
