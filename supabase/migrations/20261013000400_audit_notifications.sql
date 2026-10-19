-- =============================================================================
-- CohortGlobal — 0400 Audit, workflow history, notifications, email outbox (D10)
-- =============================================================================

-- Append-only audit log (#30, #31). organization_id scopes what an agency can see.
create table public.audit_logs (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default now(),
  actor_user_id   uuid references public.users(id),
  actor_kind      text not null default 'USER' check (actor_kind in ('USER', 'SYSTEM')),
  action          text not null,
  entity_type     text not null,
  entity_id       uuid,
  organization_id uuid references public.organizations(id) on delete set null,
  summary         text not null,
  metadata        jsonb not null default '{}'::jsonb
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, occurred_at desc);
create index audit_logs_org_idx on public.audit_logs (organization_id, occurred_at desc);

create or replace function app.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'CG403', message = 'Audit records cannot be changed or deleted.';
end;
$$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function app.audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function app.audit_logs_immutable();

-- Status changes of workflow records (who, when, from, to, why).
create table public.workflow_events (
  id              bigint generated always as identity primary key,
  entity_type     text not null,
  entity_id       uuid not null,
  organization_id uuid references public.organizations(id) on delete set null,
  subject_user_id uuid references public.users(id),
  from_status     text,
  to_status       text not null,
  actor_user_id   uuid references public.users(id),
  reason          text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index workflow_events_entity_idx on public.workflow_events (entity_type, entity_id, created_at);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  href       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Emails are queued in the same transaction as the business action and sent by the
-- server afterwards. A failed email never undoes the action.
create table public.email_outbox (
  id                  uuid primary key default gen_random_uuid(),
  to_email            text not null,
  template            text not null,
  payload             jsonb not null default '{}'::jsonb,
  status              text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  attempts            int not null default 0,
  last_error          text,
  provider_message_id text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz
);
create index email_outbox_pending_idx on public.email_outbox (status, created_at) where status = 'PENDING';
