-- =============================================================================
-- CohortGlobal — 0300 Projects, applications, contracts, assignments (D3, D4, D5)
-- =============================================================================

create table public.projects (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,23}$'),
  title              text not null check (length(trim(title)) between 3 and 200),
  summary            text not null default '',
  description        text not null default '',
  data_type          text not null default 'VIDEO' check (data_type in ('AUDIO', 'IMAGE', 'VIDEO', 'DOCUMENT', 'PDF', 'MIXED')),
  applicant_type     text not null default 'BOTH' check (applicant_type in ('AGENCY', 'INDIVIDUAL', 'BOTH')),
  visibility         text not null default 'PUBLIC' check (visibility in ('PUBLIC', 'INVITE_ONLY')),
  status             text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'PAUSED', 'COMPLETED', 'ARCHIVED')),
  opens_at           timestamptz,
  closes_at          timestamptz,
  required_languages text[] not null default '{}',
  required_countries text[] not null default '{}',
  requires_ekyc      boolean not null default false,
  target_count       int check (target_count is null or target_count > 0),
  -- Part 2 settings kept as flexible JSON (#35, #39, #40): submission limits, file size, metadata fields.
  collection_settings jsonb not null default '{}'::jsonb,
  question_version   int not null default 1,
  status_reason      text,
  published_at       timestamptz,
  created_by         uuid not null references public.users(id),
  updated_by         uuid references public.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint projects_dates check (closes_at is null or opens_at is null or closes_at > opens_at)
);
create index projects_status_idx on public.projects (status, applicant_type);
create trigger projects_touch before update on public.projects for each row execute function app.touch_updated_at();

-- Configuration history: a snapshot each time a published project changes.
create table public.project_versions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  version     int not null,
  snapshot    jsonb not null,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  unique (project_id, version)
);

-- Application questions, versioned (#21, #22).
create table public.project_questions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  version      int not null,
  position     int not null,
  prompt       text not null check (length(trim(prompt)) between 2 and 500),
  help_text    text,
  answer_type  text not null check (answer_type in ('SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'YES_NO')),
  options      jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  required     boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (project_id, version, position)
);

-- Contract templates, one current template per project, versioned (#27).
create table public.project_contract_templates (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  version     int not null,
  title       text not null,
  body        text not null check (length(trim(body)) >= 20),
  body_sha256 text not null,
  created_by  uuid not null references public.users(id),
  created_at  timestamptz not null default now(),
  unique (project_id, version)
);

-- Parent team invites an agency to a project (#19). The agency still applies.
create table public.project_invitations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invited_by      uuid not null references public.users(id),
  message         text,
  created_at      timestamptz not null default now(),
  unique (project_id, organization_id)
);

create table public.project_applications (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  applicant_kind   text not null check (applicant_kind in ('AGENCY', 'INDIVIDUAL')),
  organization_id  uuid references public.organizations(id),
  user_id          uuid references public.users(id),
  submitted_by     uuid not null references public.users(id),
  question_version int not null,
  via_invitation   boolean not null default false,
  status           text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  submitted_at     timestamptz not null default now(),
  decided_by       uuid references public.users(id),
  decided_at       timestamptz,
  decision_reason  text,
  constraint applications_applicant check (
    (applicant_kind = 'AGENCY' and organization_id is not null and user_id is null)
    or (applicant_kind = 'INDIVIDUAL' and user_id is not null and organization_id is null)
  )
);
create unique index applications_one_open_agency on public.project_applications (project_id, organization_id)
  where organization_id is not null and status in ('PENDING', 'APPROVED');
create unique index applications_one_open_individual on public.project_applications (project_id, user_id)
  where user_id is not null and status in ('PENDING', 'APPROVED');
create index applications_project_status_idx on public.project_applications (project_id, status);
create index applications_org_idx on public.project_applications (organization_id, status);

create table public.application_answers (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.project_applications(id) on delete cascade,
  question_id    uuid not null references public.project_questions(id),
  value          jsonb not null,
  unique (application_id, question_id)
);

-- Created when an application is approved. Work starts only when ACTIVE,
-- after the applicant signs and CohortData countersigns (#29).
create table public.project_assignments (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  application_id       uuid not null unique references public.project_applications(id),
  organization_id      uuid references public.organizations(id),
  user_id              uuid references public.users(id),
  contract_template_id uuid not null references public.project_contract_templates(id),
  status               text not null default 'AWAITING_SIGNATURE'
                       check (status in ('AWAITING_SIGNATURE', 'AWAITING_COUNTERSIGNATURE', 'ACTIVE', 'REVOKED', 'COMPLETED')),
  activated_at         timestamptz,
  revoked_at           timestamptz,
  revoked_by           uuid references public.users(id),
  revoke_reason        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint assignments_party check ((organization_id is null) <> (user_id is null))
);
create unique index assignments_one_live_agency on public.project_assignments (project_id, organization_id)
  where organization_id is not null and status <> 'REVOKED';
create unique index assignments_one_live_individual on public.project_assignments (project_id, user_id)
  where user_id is not null and status <> 'REVOKED';
create index assignments_org_idx on public.project_assignments (organization_id, status);
create trigger assignments_touch before update on public.project_assignments for each row execute function app.touch_updated_at();

-- Click-to-accept signatures (#26). Both parties sign the exact same text (hash).
create table public.contract_signatures (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.project_assignments(id) on delete cascade,
  template_id    uuid not null references public.project_contract_templates(id),
  party          text not null check (party in ('APPLICANT', 'COHORTDATA')),
  signer_user_id uuid not null references public.users(id),
  signer_name    text not null check (length(trim(signer_name)) >= 2),
  signer_role    text not null,
  body_sha256    text not null,
  ip_address     text,
  user_agent     text,
  signed_at      timestamptz not null default now(),
  unique (assignment_id, party)
);

-- An agency assigns its Members to an ACTIVE project assignment (agency-internal).
create table public.member_assignments (
  id                    uuid primary key default gen_random_uuid(),
  project_assignment_id uuid not null references public.project_assignments(id) on delete cascade,
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  membership_id         uuid not null references public.organization_memberships(id) on delete cascade,
  user_id               uuid not null references public.users(id) on delete cascade,
  status                text not null default 'ASSIGNED' check (status in ('ASSIGNED', 'UNASSIGNED')),
  assigned_by           uuid not null references public.users(id),
  assigned_at           timestamptz not null default now(),
  unassigned_by         uuid references public.users(id),
  unassigned_at         timestamptz
);
create unique index member_assignments_one_live on public.member_assignments (project_assignment_id, user_id) where status = 'ASSIGNED';
create index member_assignments_user_idx on public.member_assignments (user_id, status);
