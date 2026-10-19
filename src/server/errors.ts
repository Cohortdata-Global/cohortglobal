/**
 * Turns database and API errors into short messages people can act on.
 * Database functions raise CohortGlobal codes (CG401, CG403, CG404, CG409, CG422)
 * with human-readable messages; those are shown as they are.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string; detail?: string }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

type DbError = { code?: string; message?: string } | null | undefined;

/** Generic words for unexpected errors; callRpc passes the translated ones (B4). */
export type ErrorWords = { fallback: string; noAccess: string; exists: string; sessionExpired: string };
const ENGLISH: ErrorWords = {
  fallback: "Something went wrong. Try again, and contact CohortData support if it keeps happening.",
  noAccess: "You don't have access to do that.",
  exists: "That already exists.",
  sessionExpired: "Your session expired. Sign in again.",
};

export function messageFor(error: DbError, words: ErrorWords = ENGLISH): string {
  if (!error) return words.fallback;
  const code = error.code ?? "";
  // Database rules (CG codes) carry their own message; see docs on translating them (ID-49).
  if (code.startsWith("CG") && error.message) return error.message;
  if (code === "42501") return words.noAccess;
  if (code === "23505") return words.exists;
  if (code === "PGRST301" || code === "PGRST302") return words.sessionExpired;
  return words.fallback;
}

export function fail(error: DbError, words?: ErrorWords): { ok: false; error: string; code?: string } {
  if (error && !(error.code ?? "").startsWith("CG")) {
    // Unexpected errors are logged on the server without personal data.
    console.error("[cohortglobal] unexpected error", { code: error.code, message: error.message });
  }
  return { ok: false, error: messageFor(error, words), code: error?.code };
}

/** A success message: a short title, or a title plus one line about what happens next. */
export type SuccessMessage = string | { title: string; detail?: string };

export function ok<T>(data: T, message?: SuccessMessage): { ok: true; data: T; message?: string; detail?: string } {
  if (message && typeof message === "object") return { ok: true, data, message: message.title, detail: message.detail };
  return { ok: true, data, message };
}

export function invalid(fieldErrors: Record<string, string>, error = "Check the highlighted fields.") {
  return { ok: false as const, error, code: "CG422", fieldErrors };
}

/** Field problems from zod. `field` turns message keys into words (serverText().field). */
export function zodFieldErrors(issues: { path: (string | number)[]; message: string }[], field: (m: string) => string = (m) => m): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = field(issue.message);
  }
  return out;
}
