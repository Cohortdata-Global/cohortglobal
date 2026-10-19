-- Flood protection for email-sending actions (2026-10-15, plan item S4).
-- At most 40 new invitations per person per hour, and at most 5 sends of one invitation.
-- Enforced in the database so it holds for every caller.

create or replace function app.limit_invitation_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.invitations
        where invited_by = new.invited_by and created_at > now() - interval '1 hour') >= 40 then
      perform app.fail('CG429', 'Too many invitations in the last hour. Try again later.');
    end if;
  elsif tg_op = 'UPDATE' and new.send_count > old.send_count and new.send_count > 5 then
    perform app.fail('CG429', 'This invitation has been sent 5 times. Revoke it and invite again if needed.');
  end if;
  return new;
end;
$$;

revoke execute on function app.limit_invitation_rate() from public, anon, authenticated;

create trigger invitations_rate_limit
  before insert or update of send_count on public.invitations
  for each row execute function app.limit_invitation_rate();
