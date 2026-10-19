/**
 * Bulk invite by CSV (plan B1, ID-47): the sample file, a small CSV reader and
 * row checks. Shared by the browser (preview) and the server action (limit).
 */

export const BULK_INVITE_MAX = 100;

/** Column names in the CSV file. The explanations live in messages (bulkInvite.columns). */
export const BULK_COLUMNS = [
  { key: "name", required: false },
  { key: "email", required: true },
  { key: "role", required: false },
  { key: "message", required: false },
] as const;

/** The sample file people download, fill in and upload again. */
export function sampleCsv(allowManager: boolean): string {
  const rows = [
    "name,email,role,message",
    "Darshan Kumar,darshan.kumar@example.com,Member,Welcome to the team!",
    "Priya Shah,priya.shah@example.com,Member,",
    "Arjun Rao,arjun.rao@example.com,Member,You'll start on the Hindi speech project.",
  ];
  if (allowManager) rows.push('Meera Iyer,meera.iyer@example.com,Manager,"Please manage our projects, members and invitations."');
  return rows.join("\r\n") + "\r\n";
}

/** Reads CSV text (quotes, commas inside quotes, CRLF, a leading BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Why a row can't be invited. The words for each code live in messages (bulkInvite.problems). */
export type RowProblem =
  | { code: "emailMissing" } | { code: "emailInvalid" } | { code: "duplicate" } | { code: "roleUnknown"; role: string }
  | { code: "managerNotAllowed" } | { code: "oneManager" } | { code: "nameTooLong" } | { code: "messageTooLong" };

/** Why the whole file can't be read. Words in messages (bulkInvite.fileErrors). */
export type FileError = { code: "empty" } | { code: "noEmailColumn" } | { code: "noRows" } | { code: "tooMany"; max: number; count: number };

export type PreviewRow = {
  line: number; name: string; email: string; role: "AGENCY_MEMBER" | "AGENCY_MANAGER"; message: string; problem?: RowProblem;
};

const HEADER_ALIASES: Record<string, string> = {
  name: "name", "full name": "name", fullname: "name",
  email: "email", "e-mail": "email", mail: "email", "email address": "email",
  role: "role", "invite as": "role",
  message: "message", note: "message",
};

/** Turns the file into rows, each with a problem code when it can't be invited. */
export function readInviteFile(text: string, opts: { allowManager: boolean }): { rows: PreviewRow[]; error?: FileError } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], error: { code: "empty" } };
  const header = table[0]!.map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? "");
  const col = (k: string) => header.indexOf(k);
  if (col("email") < 0) return { rows: [], error: { code: "noEmailColumn" } };
  const body = table.slice(1);
  if (body.length === 0) return { rows: [], error: { code: "noRows" } };
  if (body.length > BULK_INVITE_MAX) return { rows: [], error: { code: "tooMany", max: BULK_INVITE_MAX, count: body.length } };

  const seen = new Set<string>();
  let managers = 0;
  const rows = body.map((cells, i): PreviewRow => {
    const get = (k: string) => (col(k) >= 0 ? (cells[col(k)] ?? "").trim() : "");
    const email = get("email").toLowerCase();
    const roleText = get("role").toLowerCase();
    const role = roleText === "manager" ? "AGENCY_MANAGER" : "AGENCY_MEMBER";
    const row: PreviewRow = { line: i + 2, name: get("name"), email, role, message: get("message") };
    if (!email) row.problem = { code: "emailMissing" };
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) row.problem = { code: "emailInvalid" };
    else if (seen.has(email)) row.problem = { code: "duplicate" };
    else if (roleText && roleText !== "member" && roleText !== "manager") row.problem = { code: "roleUnknown", role: get("role") };
    else if (role === "AGENCY_MANAGER" && !opts.allowManager) row.problem = { code: "managerNotAllowed" };
    else if (role === "AGENCY_MANAGER" && ++managers > 1) row.problem = { code: "oneManager" };
    else if (row.name.length > 120) row.problem = { code: "nameTooLong" };
    else if (row.message.length > 500) row.problem = { code: "messageTooLong" };
    if (email) seen.add(email);
    return row;
  });
  return { rows };
}
