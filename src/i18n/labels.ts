import { useTranslations } from "next-intl";

/**
 * Names for codes stored in the database (statuses, roles, document types…).
 * The words live in src/messages/en.json under "labels"; code that only has a
 * code (from the database) asks here for the words in the viewer's language.
 * Server pages that are async use getLabels() from ./labels-server instead.
 */
type Translator = { (key: string): string; has(key: string): boolean };

function humanize(code: string) {
  return code.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function makeLabels(raw: unknown) {
  const t = raw as Translator;
  const pick = (group: string) => (code: string | null | undefined): string => {
    if (!code) return "—";
    const key = `${group}.${code}`;
    return t.has(key) ? t(key) : humanize(code);
  };
  return {
    status: pick("status"),
    role: pick("role"),
    docType: pick("docType"),
    applicantType: pick("applicantType"),
    dataType: pick("dataType"),
    answerType: pick("answerType"),
    entity: pick("entity"),
    requestType: pick("requestType"),
    /** The headline role shown under the person's name in the top bar. */
    primaryRole(roles: string[], membershipRole?: string | null): string {
      const staff = ["SUPER_ADMIN", "OPERATIONS_MANAGER", "PROJECT_MANAGER", "QC_LEAD", "QC_REVIEWER"].find((r) => roles.includes(r));
      if (staff) return this.role(staff);
      if (membershipRole && membershipRole !== "STAFF") return this.role(membershipRole);
      if (roles.includes("DIRECT_FREELANCER")) return this.role("DIRECT_FREELANCER");
      return t("role.NEW_ACCOUNT");
    },
  };
}

export type Labels = ReturnType<typeof makeLabels>;

export function useLabels(): Labels {
  return makeLabels(useTranslations("labels"));
}
