/** Reason codes a QC reviewer can tick when rejecting or asking for a resubmission (2E, ID-56). Words in en.json → qc.reasons. */
export const REASON_CODES = ["FACE_CUT", "LIGHTING", "BLURRY", "WRONG_OPTIONS", "ACCESSORY", "BACKGROUND", "LENGTH", "DUPLICATE_PERSON", "EDITED", "OTHER"] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** Codes written by the automatic checks (submission_checks.check_code). Words in en.json → qc.checks. */
export const CHECK_CODES = ["all", "profile_missing", "profile_option", "duplicate_field", "duplicate_file", "file_size", "file_length", "same_name_dob", "same_name_phone"] as const;
