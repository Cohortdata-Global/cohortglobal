/**
 * Role and permission codes. The source of truth is the database seed
 * (supabase/migrations/20261013000500_roles_seed.sql). These types only help
 * the editor; the server always checks the permissions the database returns.
 */
export type RoleCode =
  | "SUPER_ADMIN" | "OPERATIONS_MANAGER" | "PROJECT_MANAGER" | "QC_LEAD" | "QC_REVIEWER" | "STAFF"
  | "AGENCY_OWNER" | "AGENCY_MANAGER" | "AGENCY_MEMBER" | "DIRECT_FREELANCER";

export type Permission =
  | "platform.settings" | "staff.invite" | "staff.manage" | "user.view_all"
  | "agency.view_all" | "agency.decide" | "agency.invite" | "agency.manage" | "agency_request.decide"
  | "project.view_all" | "project.view_assigned" | "project.assign_managers" | "project.manage" | "project.questions.relock" | "project.invite_agency"
  | "application.view_all" | "application.decide" | "contract.countersign" | "assignment.revoke"
  | "audit.view_all" | "qc.queue.view"
  | "org.view" | "org.members.view" | "org.members.invite" | "org.members.manage" | "org.manager.manage"
  | "org.profile.request_change" | "org.deactivation.request" | "org.ownership.request" | "org.projects.apply"
  | "org.contract.sign" | "org.members.assign" | "org.links.manage" | "org.audit.view" | "org.submissions.view_all"
  | "member.work" | "individual.projects.apply" | "individual.contract.sign";

export const STAFF_ROLES: RoleCode[] = ["OPERATIONS_MANAGER", "PROJECT_MANAGER", "QC_LEAD", "QC_REVIEWER"];

// Role names live in src/messages/en.json (labels.role); see useLabels()/getLabels().
