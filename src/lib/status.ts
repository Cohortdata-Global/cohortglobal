/**
 * Colour tones for workflow statuses. The words for each status live in
 * src/messages/en.json under "labels.status" (B4, ID-49); see src/i18n/labels.ts.
 */
export type Tone = "neutral" | "info" | "positive" | "attention" | "critical" | "brand";

const TONE: Record<string, Tone> = {
  PENDING_VERIFICATION: "attention", CHANGES_REQUESTED: "attention", ACTIVE: "positive", REJECTED: "critical",
  SUSPENDED: "attention", DEACTIVATED: "neutral", REMOVED: "neutral",
  DRAFT: "neutral", PUBLISHED: "positive", PAUSED: "attention", COMPLETED: "info", ARCHIVED: "neutral",
  PENDING: "attention", APPROVED: "positive", WITHDRAWN: "neutral",
  AWAITING_SIGNATURE: "attention", AWAITING_COUNTERSIGNATURE: "info", REVOKED: "critical",
  ACCEPTED: "positive", EXPIRED: "neutral", CANCELLED: "neutral", ASSIGNED: "brand", UNASSIGNED: "neutral",
};

export function statusTone(status: string | null | undefined): Tone {
  return (status && TONE[status]) || "neutral";
}

export const DOCUMENT_TYPES = ["REGISTRATION_CERTIFICATE", "TAX_CERTIFICATE", "OWNER_ID", "BANK_LETTER", "OTHER"] as const;
export const DATA_TYPES = ["AUDIO", "IMAGE", "VIDEO", "DOCUMENT", "PDF", "MIXED"] as const;
export const ANSWER_TYPES = ["SHORT_TEXT", "LONG_TEXT", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "YES_NO"] as const;
export const APPLICANT_TYPES = ["AGENCY", "INDIVIDUAL", "BOTH"] as const;
