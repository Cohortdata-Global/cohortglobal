import { describe, expect, it } from "vitest";
import { formatBytes, formatDate, initials, pluralize, timeAgo, toCsv } from "@/lib/utils";

describe("toCsv", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(toCsv([{ a: 'x,"y"', b: "line\nbreak" }])).toBe('a,b\n"x,""y""","line\nbreak"');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(toCsv([{ a: "=HYPERLINK(1)", b: "+91 98765", c: "@x", d: "-1" }])).toBe("a,b,c,d\n'=HYPERLINK(1),'+91 98765,'@x,'-1");
  });
  it("joins arrays and blanks out null", () => {
    expect(toCsv([{ a: ["x", "y"], b: null }])).toBe("a,b\nx; y,");
  });
  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});

describe("formatting helpers", () => {
  it("initials", () => {
    expect(initials("Ana Maria Souza")).toBe("AS");
    expect(initials("  ")).toBe("?");
    expect(initials(null, "-")).toBe("-");
  });
  it("pluralize", () => {
    expect(pluralize(1, "question")).toBe("1 question");
    expect(pluralize(3, "entry", "entries")).toBe("3 entries");
  });
  it("formatBytes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
  });
  it("formatDate uses the viewer's timezone", () => {
    expect(formatDate("2026-10-13T20:30:00Z", "Asia/Kolkata")).toBe("14 Oct 2026");
    expect(formatDate("2026-10-13T20:30:00Z", "America/Sao_Paulo")).toBe("13 Oct 2026");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not a date")).toBe("—");
  });
  it("timeAgo", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    expect(timeAgo("2026-10-13T11:00:00Z", now)).toBe("1 hour ago");
    expect(timeAgo("2026-10-10T12:00:00Z", now)).toBe("3 days ago");
  });
});
