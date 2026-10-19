import { describe, expect, it } from "vitest";
import { parseCsv, readInviteFile, sampleCsv } from "./bulk-invite";

describe("bulk invite CSV", () => {
  it("reads quotes, commas inside quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿name,email\r\n"Rao, Arjun",a@x.com\r\n\r\n')).toEqual([["name", "email"], ["Rao, Arjun", "a@x.com"]]);
    expect(parseCsv('a,"say ""hi"""')).toEqual([["a", 'say "hi"']]);
  });

  it("accepts the sample file as it is", () => {
    const { rows, error } = readInviteFile(sampleCsv(true), { allowManager: true });
    expect(error).toBeUndefined();
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => !r.problem)).toBe(true);
    expect(rows[3]?.role).toBe("AGENCY_MANAGER");
  });

  it("flags bad rows with a reason code", () => {
    const csv = "Email,Role\nbad-email,Member\na@x.com,boss\na@x.com,\nb@x.com,Manager\n";
    const { rows } = readInviteFile(csv, { allowManager: false });
    expect(rows.map((r) => r.problem ?? "ok")).toEqual([
      { code: "emailInvalid" },
      { code: "roleUnknown", role: "boss" },
      { code: "duplicate" },
      { code: "managerNotAllowed" },
    ]);
  });

  it("needs an email column", () => {
    expect(readInviteFile("name\nDarshan\n", { allowManager: false }).error).toEqual({ code: "noEmailColumn" });
  });
});
