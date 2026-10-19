import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import { makeLabels } from "@/i18n/labels";
import { statusTone } from "@/lib/status";

/** A tiny stand-in for next-intl's translator, reading en.json directly. */
function translator(ns: Record<string, unknown>) {
  const get = (key: string) => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], ns);
  const t = (key: string) => String(get(key));
  t.has = (key: string) => typeof get(key) === "string";
  return t;
}

describe("status labels and tones", () => {
  const labels = makeLabels(translator(en.labels));

  it("maps known statuses to words and tones", () => {
    expect(labels.status("PENDING_VERIFICATION")).toBe("Waiting for approval");
    expect(statusTone("PENDING_VERIFICATION")).toBe("attention");
    expect(labels.status("PUBLISHED")).toBe("Open");
    expect(labels.status("CHANGES_REQUESTED")).toBe("Changes asked");
  });

  it("falls back to readable words for unknown codes", () => {
    expect(labels.status("SOME_NEW_STATE")).toBe("Some new state");
    expect(statusTone("SOME_NEW_STATE")).toBe("neutral");
    expect(labels.status(null)).toBe("—");
  });

  it("names roles and document types", () => {
    expect(labels.role("AGENCY_OWNER")).toBe("Owner");
    expect(labels.docType("OWNER_ID")).toBe("Owner ID");
    expect(labels.primaryRole(["SUPER_ADMIN"], null)).toBe("Super Admin");
    expect(labels.primaryRole([], null)).toBe("New account");
  });
});
