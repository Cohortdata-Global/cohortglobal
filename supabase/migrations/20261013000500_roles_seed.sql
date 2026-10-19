-- =============================================================================
-- CohortGlobal — 0500 Role and permission seed (D2)
-- Change permissions here (or with a new migration); no application code change needed.
-- See docs/permissions.md for the human-readable matrix.
-- =============================================================================

insert into public.roles (code, scope, name, description, sort_order) values
  ('SUPER_ADMIN',       'PLATFORM',   'Super Admin',       'Runs the platform. Approves and invites agencies, invites staff.', 10),
  ('PROJECT_MANAGER',   'PLATFORM',   'Project Manager',   'Creates projects and decides applications.', 20),
  ('QC_LEAD',           'PLATFORM',   'QC Lead',           'Manages the QC queue and reviewers (Part 2).', 30),
  ('QC_REVIEWER',       'PLATFORM',   'QC Reviewer',       'Reviews assigned submissions (Part 2).', 40),
  ('STAFF',             'PLATFORM',   'CohortData staff',  'Membership marker for CohortData employees. Grants nothing by itself.', 90),
  ('AGENCY_OWNER',      'AGENCY',     'Agency Owner',      'Oversees the agency. Same powers as the Manager, and manages the Manager.', 10),
  ('AGENCY_MANAGER',    'AGENCY',     'Agency Manager',    'Runs the agency day to day.', 20),
  ('AGENCY_MEMBER',     'AGENCY',     'Agency Member',     'Agency employee. Works on projects assigned by the agency.', 30),
  ('DIRECT_FREELANCER', 'INDIVIDUAL', 'Direct Freelancer', 'Individual contributor without an agency.', 10);

insert into public.permissions (code, scope, description) values
  -- Parent team
  ('platform.settings',          'PLATFORM', 'Change platform settings'),
  ('staff.invite',               'PLATFORM', 'Invite CohortData staff'),
  ('staff.manage',               'PLATFORM', 'Change or revoke staff roles, suspend users'),
  ('user.view_all',              'PLATFORM', 'View all users'),
  ('agency.view_all',            'PLATFORM', 'View all agencies and their profiles'),
  ('agency.decide',              'PLATFORM', 'Approve or reject agency sign-ups'),
  ('agency.invite',              'PLATFORM', 'Invite agencies to the platform'),
  ('agency.manage',              'PLATFORM', 'Edit, suspend, reactivate, deactivate agencies; manage agency people'),
  ('agency_request.decide',      'PLATFORM', 'Approve or reject agency change, deactivation and transfer requests'),
  ('project.view_all',           'PLATFORM', 'View all projects, including drafts'),
  ('project.manage',             'PLATFORM', 'Create, edit and change the status of projects'),
  ('project.questions.relock',   'PLATFORM', 'Change application questions after applications exist (new version)'),
  ('project.invite_agency',      'PLATFORM', 'Invite an agency to a project'),
  ('application.view_all',       'PLATFORM', 'View all applications'),
  ('application.decide',         'PLATFORM', 'Approve or reject applications'),
  ('contract.countersign',       'PLATFORM', 'Countersign contracts for CohortData'),
  ('assignment.revoke',          'PLATFORM', 'Revoke an approved project assignment'),
  ('audit.view_all',             'PLATFORM', 'View the platform-wide audit log'),
  ('qc.queue.view',              'PLATFORM', 'View the QC queue (Part 2)'),
  -- Agency (always checked against the user's own agency)
  ('org.view',                   'AGENCY',   'View the agency dashboard and profile'),
  ('org.members.view',           'AGENCY',   'View agency members and invitations'),
  ('org.members.invite',         'AGENCY',   'Invite agency members'),
  ('org.members.manage',         'AGENCY',   'Suspend, reactivate or remove agency members'),
  ('org.manager.manage',         'AGENCY',   'Invite or remove the Agency Manager'),
  ('org.profile.request_change', 'AGENCY',   'Request changes to the company profile and documents'),
  ('org.deactivation.request',   'AGENCY',   'Request deactivation of the agency'),
  ('org.ownership.request',      'AGENCY',   'Request transfer of ownership to the Manager'),
  ('org.projects.apply',         'AGENCY',   'Apply to projects for the agency'),
  ('org.contract.sign',          'AGENCY',   'Sign project contracts for the agency'),
  ('org.members.assign',         'AGENCY',   'Assign members to approved projects'),
  ('org.links.manage',           'AGENCY',   'Create and revoke public submission links (Part 2)'),
  ('org.audit.view',             'AGENCY',   'View the agency''s own audit history'),
  ('org.submissions.view_all',   'AGENCY',   'View all of the agency''s submissions (Part 2)'),
  ('member.work',                'AGENCY',   'View and work on assigned projects'),
  -- Individual
  ('individual.projects.apply',  'INDIVIDUAL', 'Apply to projects as an individual'),
  ('individual.contract.sign',   'INDIVIDUAL', 'Sign own project contracts');

insert into public.role_permissions (role_code, permission_code)
select 'SUPER_ADMIN', code from public.permissions where scope = 'PLATFORM';

insert into public.role_permissions (role_code, permission_code) values
  ('PROJECT_MANAGER', 'user.view_all'),
  ('PROJECT_MANAGER', 'agency.view_all'),
  ('PROJECT_MANAGER', 'project.view_all'),
  ('PROJECT_MANAGER', 'project.manage'),
  ('PROJECT_MANAGER', 'project.invite_agency'),
  ('PROJECT_MANAGER', 'application.view_all'),
  ('PROJECT_MANAGER', 'application.decide'),
  ('PROJECT_MANAGER', 'contract.countersign'),
  ('PROJECT_MANAGER', 'assignment.revoke'),
  ('PROJECT_MANAGER', 'qc.queue.view'),
  ('QC_LEAD',         'project.view_all'),
  ('QC_LEAD',         'qc.queue.view'),
  ('QC_REVIEWER',     'project.view_all'),
  ('QC_REVIEWER',     'qc.queue.view');

insert into public.role_permissions (role_code, permission_code)
select r.role_code, p.code
from (values ('AGENCY_OWNER'), ('AGENCY_MANAGER')) as r(role_code)
cross join public.permissions p
where p.scope = 'AGENCY' and p.code <> 'member.work'
  and not (r.role_code = 'AGENCY_MANAGER' and p.code in (
    'org.manager.manage', 'org.deactivation.request', 'org.ownership.request', 'org.contract.sign'));

insert into public.role_permissions (role_code, permission_code) values
  ('AGENCY_MEMBER', 'member.work'),
  ('DIRECT_FREELANCER', 'individual.projects.apply'),
  ('DIRECT_FREELANCER', 'individual.contract.sign');
