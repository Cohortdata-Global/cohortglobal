import "server-only";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createUserClient } from "@/server/db/user-client";
import { syncCurrentClerkUser } from "@/server/auth/sync-user";
import { timed } from "@/server/perf";
import type { Permission, RoleCode } from "@/lib/access";

export type OrgStatus = "DRAFT" | "PENDING_VERIFICATION" | "CHANGES_REQUESTED" | "ACTIVE" | "REJECTED" | "SUSPENDED" | "DEACTIVATED";

export type Viewer = {
  clerkUserId: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
    phoneE164: string | null;
    countryCode: string | null;
    timezone: string;
    registrationPath: "STAFF" | "AGENCY" | "FREELANCER" | null;
    status: "ACTIVE" | "SUSPENDED" | "DELETED";
  };
  membership: { id: string; role: RoleCode; status: "ACTIVE" | "SUSPENDED" | "REMOVED" } | null;
  organization: {
    id: string;
    type: "PLATFORM" | "AGENCY";
    name: string;
    status: OrgStatus;
    statusReason: string | null;
    reapplyAfter: string | null;
  } | null;
  roles: RoleCode[];
  permissions: Permission[];
};

type ContextJson = {
  user: null | {
    id: string; email: string; full_name: string | null; avatar_url: string | null; phone_e164: string | null;
    country_code: string | null; timezone: string; registration_path: Viewer["user"]["registrationPath"]; status: Viewer["user"]["status"];
  };
  membership: null | { id: string; role: RoleCode; status: "ACTIVE" | "SUSPENDED" | "REMOVED" };
  organization: null | { id: string; type: "PLATFORM" | "AGENCY"; name: string; status: OrgStatus; status_reason: string | null; reapply_after: string | null };
  roles: RoleCode[];
  permissions: Permission[];
};

async function loadContext(): Promise<ContextJson> {
  const db = await createUserClient();
  const { data, error } = await db.rpc("get_my_context");
  if (error) throw new Error(`Could not load your account: ${error.message}`);
  return data as ContextJson;
}

/** The signed-in person with their organization, roles and permissions. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const { userId } = await timed("clerk auth()", auth());
  if (!userId) return null;
  let ctx = await timed("db get_my_context", loadContext());
  if (!ctx.user) {
    await timed("first-visit user sync (Clerk API)", syncCurrentClerkUser());
    ctx = await loadContext();
  }
  if (!ctx.user) return null;
  return {
    clerkUserId: userId,
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      fullName: ctx.user.full_name,
      avatarUrl: ctx.user.avatar_url,
      phoneE164: ctx.user.phone_e164,
      countryCode: ctx.user.country_code,
      timezone: ctx.user.timezone || "UTC",
      registrationPath: ctx.user.registration_path,
      status: ctx.user.status,
    },
    membership: ctx.membership,
    organization: ctx.organization
      ? {
          id: ctx.organization.id,
          type: ctx.organization.type,
          name: ctx.organization.name,
          status: ctx.organization.status,
          statusReason: ctx.organization.status_reason,
          reapplyAfter: ctx.organization.reapply_after,
        }
      : null,
    roles: ctx.roles ?? [],
    permissions: ctx.permissions ?? [],
  };
});

export function can(viewer: Viewer | null, permission: Permission): boolean {
  return !!viewer && viewer.permissions.includes(permission);
}

/** True when the viewer has at least one of the permissions. */
export function canAny(viewer: Viewer | null, permissions: Permission[]): boolean {
  return permissions.some((p) => can(viewer, p));
}

/** Who can open the projects console: all projects, or only assigned ones (Project Managers, ID-52). */
export const PROJECT_CONSOLE: Permission[] = ["project.view_all", "project.view_assigned"];
/** Who can open a project's applications: all-projects staff, or a project's own managers. */
export const APPLICATIONS_CONSOLE: Permission[] = ["application.view_all", "application.decide"];

/** Where a person belongs after signing in. Mirrors the registration paths (architecture 5.2). */
export function homeFor(viewer: Viewer | null): string {
  if (!viewer) return "/sign-in";
  if (viewer.user.status !== "ACTIVE") return "/account/suspended";
  const org = viewer.organization;
  if (org?.type === "PLATFORM") return viewer.membership?.status === "ACTIVE" ? "/admin" : "/account/suspended";
  if (org?.type === "AGENCY") {
    if (viewer.membership?.status !== "ACTIVE") return "/account/suspended";
    if (viewer.membership.role === "AGENCY_MEMBER") return "/work";
    if (["DRAFT", "PENDING_VERIFICATION", "CHANGES_REQUESTED", "REJECTED"].includes(org.status)) return "/onboarding/agency";
    return "/agency";
  }
  if (viewer.roles.includes("DIRECT_FREELANCER")) return "/work";
  return "/onboarding";
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  if (viewer.user.status !== "ACTIVE") redirect("/account/suspended");
  return viewer;
}

/** For pages: redirect people without the permission back to their own home. */
export async function requirePermission(permission: Permission): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!can(viewer, permission)) redirect(homeFor(viewer));
  return viewer;
}

/** For pages: like requirePermission, with any one of several permissions. */
export async function requireAnyPermission(permissions: Permission[]): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!canAny(viewer, permissions)) redirect(homeFor(viewer));
  return viewer;
}

export type Surface = "admin" | "agency" | "work";

/** Layout guard: each surface belongs to one kind of account. */
export async function requireSurface(surface: Surface): Promise<Viewer> {
  const viewer = await requireViewer();
  const home = homeFor(viewer);
  const belongs =
    (surface === "admin" && home === "/admin") ||
    (surface === "agency" && home === "/agency") ||
    (surface === "work" && home === "/work");
  if (!belongs) redirect(home);
  return viewer;
}
