-- =============================================================================
-- Bulk invite by CSV (plan B1, ID-47)
-- - Invitations can carry the invitee's name (shown in the list and the email).
-- - The hourly invitation limit rises from 40 to 100 per person (ID-40), so an
--   agency can invite a full team from one CSV file (up to 100 rows).
-- =============================================================================

alter table public.invitations add column invitee_name text check (invitee_name is null or length(invitee_name) <= 120);

drop function public.create_invitation(text, text, uuid, text, text, text);

create or replace function public.create_invitation(
  p_purpose text, p_email text, p_organization_id uuid default null, p_role_code text default null,
  p_agency_name text default null, p_message text default null, p_invitee_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_email text := lower(trim(p_email));
  v_existing public.users;
  v_org public.organizations;
  v_id uuid;
  v_token text := app.new_token();
  v_expires timestamptz := now() + interval '7 days';   -- confirmed #18
begin
  perform app.check_invite_permission(p_purpose, p_organization_id);
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.fail('CG422', 'Enter a valid email address.');
  end if;

  if p_purpose in ('AGENCY_MANAGER', 'AGENCY_MEMBER') then
    select * into v_org from public.organizations where id = p_organization_id and type = 'AGENCY';
    if not found then perform app.fail('CG404', 'Agency not found.'); end if;
    if v_org.status <> 'ACTIVE' then perform app.fail('CG409', 'Only approved, active agencies can invite people.'); end if;
  end if;

  if p_purpose = 'AGENCY_MANAGER' then
    if exists (select 1 from public.organization_memberships where organization_id = p_organization_id
               and role = 'AGENCY_MANAGER' and status <> 'REMOVED') then
      perform app.fail('CG409', 'This agency already has a Manager. An agency can have only one.');
    end if;
    if exists (select 1 from public.invitations where organization_id = p_organization_id
               and purpose = 'AGENCY_MANAGER' and status = 'PENDING' and expires_at > now()) then
      perform app.fail('CG409', 'A Manager invitation is already pending for this agency.');
    end if;
  end if;

  if length(trim(coalesce(p_invitee_name, ''))) > 120 then
    perform app.fail('CG422', 'Keep the name under 120 characters.');
  end if;

  if p_purpose = 'AGENCY_OWNER' and app.jtext(jsonb_build_object('n', p_agency_name), 'n') is null then
    perform app.fail('CG422', 'Agency name is required.');
  end if;

  -- The invitee must not already belong somewhere or be a direct freelancer.
  select * into v_existing from public.users where email = v_email and status <> 'DELETED';
  if v_existing.id is not null then
    if exists (select 1 from public.organization_memberships where user_id = v_existing.id and status <> 'REMOVED') then
      perform app.fail('CG409', 'This person already belongs to an organization.');
    end if;
    if v_existing.registration_path = 'FREELANCER' then
      perform app.fail('CG409', 'This email belongs to a direct freelancer. They must delete that account before joining.');
    end if;
  end if;

  -- Expire stale invitations for this email, then refuse if one is still open.
  update public.invitations set status = 'EXPIRED' where email = v_email and status = 'PENDING' and expires_at <= now();
  if exists (select 1 from public.invitations where email = v_email and status = 'PENDING') then
    perform app.fail('CG409', 'This email already has a pending invitation. Resend or revoke it instead.');
  end if;

  insert into public.invitations (purpose, email, invitee_name, organization_id, agency_name, role_code, message, invited_by, expires_at)
  values (p_purpose, v_email, nullif(trim(p_invitee_name), ''), p_organization_id, nullif(trim(p_agency_name), ''),
          case when p_purpose = 'PLATFORM_STAFF' then p_role_code end, nullif(trim(p_message), ''), v_user, v_expires)
  returning id into v_id;
  insert into public.invitation_tokens (invitation_id, token_hash) values (v_id, app.hash_token(v_token));

  perform app.audit('invitation.created', 'invitation', v_id, p_organization_id,
    format('Invited %s (%s)', v_email, p_purpose), jsonb_build_object('purpose', p_purpose, 'role', p_role_code));
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

revoke execute on function public.create_invitation(text, text, uuid, text, text, text, text) from public, anon;
grant execute on function public.create_invitation(text, text, uuid, text, text, text, text) to authenticated;

create or replace function app.limit_invitation_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.invitations
        where invited_by = new.invited_by and created_at > now() - interval '1 hour') >= 100 then
      perform app.fail('CG429', 'Too many invitations in the last hour (the limit is 100). Try again later.');
    end if;
  elsif tg_op = 'UPDATE' and new.send_count > old.send_count and new.send_count > 5 then
    perform app.fail('CG429', 'This invitation has been sent 5 times. Revoke it and invite again if needed.');
  end if;
  return new;
end;
$$;
