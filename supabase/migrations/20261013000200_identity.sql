-- =============================================================================
-- CohortGlobal — 0200 Identity, organizations, roles, invitations (D1, D2, D5)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Roles and permissions (D2). Data-driven so roles can change without code.
-- ---------------------------------------------------------------------------
create table public.roles (
  code        text primary key,
  scope       text not null check (scope in ('PLATFORM', 'AGENCY', 'INDIVIDUAL')),
  name        text not null,
  description text not null default '',
  sort_order  int  not null default 100,
  unique (code, scope)
);

create table public.permissions (
  code        text primary key,
  scope       text not null check (scope in ('PLATFORM', 'AGENCY', 'INDIVIDUAL')),
  description text not null
);

create table public.role_permissions (
  role_code       text not null references public.roles(code) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

-- ---------------------------------------------------------------------------
-- Users (D1). One row per Clerk account. Business tables reference users.id.
-- ---------------------------------------------------------------------------
create table public.users (
  id                uuid primary key default gen_random_uuid(),
  clerk_user_id     text not null unique,
  email             text not null check (email = lower(email) and position('@' in email) > 1),
  full_name         text,
  avatar_url        text,
  phone_e164        text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  country_code      text check (country_code ~ '^[A-Z]{2}$'),
  timezone          text not null default 'UTC',
  -- How the person entered the platform. NULL until onboarding or an invitation decides it.
  registration_path text check (registration_path in ('STAFF', 'AGENCY', 'FREELANCER')),
  status            text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'DELETED')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index users_email_active_key on public.users (email) where status <> 'DELETED';
create trigger users_touch before update on public.users for each row execute function app.touch_updated_at();

-- User-scoped roles: parent-team roles (PLATFORM) and DIRECT_FREELANCER (INDIVIDUAL).
create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  role_code   text not null,
  role_scope  text not null check (role_scope in ('PLATFORM', 'INDIVIDUAL')),
  granted_by  uuid references public.users(id),
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid references public.users(id),
  foreign key (role_code, role_scope) references public.roles(code, scope)
);
create unique index user_roles_active_key on public.user_roles (user_id, role_code) where revoked_at is null;
-- Confirmed decision #16: exactly one Super Admin for now.
create unique index user_roles_single_super_admin on public.user_roles (role_code)
  where role_code = 'SUPER_ADMIN' and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Organizations (D1): CohortData (PLATFORM) and agencies (AGENCY).
-- ---------------------------------------------------------------------------
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (type in ('PLATFORM', 'AGENCY')),
  name             text not null check (length(trim(name)) between 2 and 160),
  status           text not null check (status in ('PENDING_VERIFICATION', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'DEACTIVATED')),
  source           text not null default 'SELF_SIGNUP' check (source in ('SELF_SIGNUP', 'INVITED', 'SYSTEM')),
  created_by       uuid references public.users(id),
  approved_at      timestamptz,
  approved_by      uuid references public.users(id),
  rejected_at      timestamptz,
  reapply_after    timestamptz,
  status_reason    text,
  status_changed_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index organizations_single_platform on public.organizations ((true)) where type = 'PLATFORM';
create index organizations_type_status_idx on public.organizations (type, status);
create trigger organizations_touch before update on public.organizations for each row execute function app.touch_updated_at();

-- Company details for agencies (#12). Edited only through approved change requests (#7).
create table public.agency_profiles (
  organization_id     uuid primary key references public.organizations(id) on delete cascade,
  legal_name          text,
  country_code        text check (country_code ~ '^[A-Z]{2}$'),
  registration_number text,
  tax_id              text,
  website_url         text,
  contact_name        text,
  contact_email       text check (contact_email is null or contact_email = lower(contact_email)),
  contact_phone_e164  text check (contact_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  address             text,
  description         text,
  languages           text[] not null default '{}',
  team_size           int check (team_size is null or team_size >= 0),
  submitted_at        timestamptz,
  updated_at          timestamptz not null default now()
);
create trigger agency_profiles_touch before update on public.agency_profiles for each row execute function app.touch_updated_at();

create table public.agency_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  document_type    text not null check (document_type in ('REGISTRATION_CERTIFICATE', 'TAX_CERTIFICATE', 'OWNER_ID', 'BANK_LETTER', 'OTHER')),
  file_name        text not null,
  storage_bucket   text not null,
  storage_path     text not null unique,
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes > 0),
  -- ACTIVE: part of the approved profile. PENDING: waiting for a change request decision.
  status           text not null default 'ACTIVE' check (status in ('ACTIVE', 'PENDING', 'REJECTED', 'REMOVED')),
  request_id       uuid,
  uploaded_by      uuid not null references public.users(id),
  created_at       timestamptz not null default now()
);
create index agency_documents_org_idx on public.agency_documents (organization_id, status);

-- Requests from an agency that need the Super Admin: profile changes (#7),
-- deactivation (#10) and ownership transfer (#9).
create table public.agency_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type            text not null check (type in ('PROFILE_CHANGE', 'DEACTIVATION', 'OWNERSHIP_TRANSFER')),
  payload         jsonb not null default '{}'::jsonb,
  note            text,
  status          text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  requested_by    uuid not null references public.users(id),
  requested_at    timestamptz not null default now(),
  decided_by      uuid references public.users(id),
  decided_at      timestamptz,
  decision_note   text
);
create unique index agency_requests_one_pending on public.agency_requests (organization_id, type) where status = 'PENDING';
alter table public.agency_documents
  add constraint agency_documents_request_fk foreign key (request_id) references public.agency_requests(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Memberships (D1/D5). A user belongs to at most one organization.
-- role: STAFF (CohortData), AGENCY_OWNER, AGENCY_MANAGER, AGENCY_MEMBER.
-- ---------------------------------------------------------------------------
create table public.organization_memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  role            text not null references public.roles(code),
  status          text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'REMOVED')),
  invited_by      uuid references public.users(id),
  joined_at       timestamptz not null default now(),
  removed_at      timestamptz,
  removed_by      uuid references public.users(id),
  status_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- One organization per user (confirmed). Removed memberships are kept as history.
create unique index memberships_one_org_per_user on public.organization_memberships (user_id) where status <> 'REMOVED';
-- Exactly one Owner and at most one Manager per agency (confirmed #5, #8).
create unique index memberships_one_owner on public.organization_memberships (organization_id) where role = 'AGENCY_OWNER' and status <> 'REMOVED';
create unique index memberships_one_manager on public.organization_memberships (organization_id) where role = 'AGENCY_MANAGER' and status <> 'REMOVED';
create index memberships_org_idx on public.organization_memberships (organization_id, status);
create trigger memberships_touch before update on public.organization_memberships for each row execute function app.touch_updated_at();

-- Role must match the organization type.
create or replace function app.check_membership_role()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type text;
begin
  select type into v_type from public.organizations where id = new.organization_id;
  if v_type = 'PLATFORM' and new.role <> 'STAFF' then
    raise exception using errcode = 'CG422', message = 'CohortData memberships must use the STAFF role.';
  end if;
  if v_type = 'AGENCY' and new.role not in ('AGENCY_OWNER', 'AGENCY_MANAGER', 'AGENCY_MEMBER') then
    raise exception using errcode = 'CG422', message = 'Agency memberships must use an agency role.';
  end if;
  return new;
end;
$$;
create trigger memberships_check_role before insert or update of role, organization_id
  on public.organization_memberships for each row execute function app.check_membership_role();

-- Personal contributor details for direct freelancers and agency members.
create table public.contributor_profiles (
  user_id          uuid primary key references public.users(id) on delete cascade,
  date_of_birth    date check (date_of_birth is null or date_of_birth < current_date),
  gender           text check (gender in ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY')),
  nationality_code text check (nationality_code ~ '^[A-Z]{2}$'),
  native_language  text,
  other_languages  text[] not null default '{}',
  skills           text[] not null default '{}',
  linkedin_url     text,
  bio              text,
  updated_at       timestamptz not null default now()
);
create trigger contributor_profiles_touch before update on public.contributor_profiles for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Invitations. Tokens live in a separate table that no API role can read.
-- ---------------------------------------------------------------------------
create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  purpose         text not null check (purpose in ('PLATFORM_STAFF', 'AGENCY_OWNER', 'AGENCY_MANAGER', 'AGENCY_MEMBER')),
  email           text not null check (email = lower(email) and position('@' in email) > 1),
  organization_id uuid references public.organizations(id) on delete cascade,
  agency_name     text,
  role_code       text references public.roles(code),
  message         text,
  status          text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  invited_by      uuid not null references public.users(id),
  expires_at      timestamptz not null,
  send_count      int not null default 1,
  last_sent_at    timestamptz not null default now(),
  accepted_by     uuid references public.users(id),
  accepted_at     timestamptz,
  revoked_by      uuid references public.users(id),
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint invitations_shape check (
    (purpose = 'PLATFORM_STAFF' and organization_id is null and role_code in ('PROJECT_MANAGER', 'QC_LEAD', 'QC_REVIEWER'))
    or (purpose = 'AGENCY_OWNER' and organization_id is null and agency_name is not null and role_code is null)
    or (purpose in ('AGENCY_MANAGER', 'AGENCY_MEMBER') and organization_id is not null and role_code is null)
  )
);
-- One open invitation per email address avoids conflicting invitations.
create unique index invitations_one_pending_per_email on public.invitations (email) where status = 'PENDING';
create index invitations_org_idx on public.invitations (organization_id, status);

create table public.invitation_tokens (
  invitation_id uuid primary key references public.invitations(id) on delete cascade,
  token_hash    text not null unique,
  created_at    timestamptz not null default now()
);
