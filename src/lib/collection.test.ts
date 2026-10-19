import { describe, expect, it } from "vitest";
import { collectionSchema, EMPTY_COLLECTION, faceVideoTemplate, matchingGuides, openOptions, type CollectionConfig } from "@/lib/collection";

describe("collection setup", () => {
  it("accepts the empty starting point and the face-video template", () => {
    expect(collectionSchema.safeParse(EMPTY_COLLECTION).success).toBe(true);
    const r = collectionSchema.safeParse(faceVideoTemplate());
    expect(r.success).toBe(true);
  });

  it("rejects duplicate field keys and guides that point at unknown options", () => {
    const c = collectionSchema.parse(faceVideoTemplate());
    c.fields.push({ ...c.fields[0]! });
    c.guides[0] = { ...c.guides[0]!, when: [{ field: "background", value: "Space" }] };
    const r = collectionSchema.safeParse(c);
    expect(r.success).toBe(false);
    const messages = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(messages).toContain("duplicateKey");
    expect(messages).toContain("conditionValue");
  });

  it("shows the guides whose conditions all match", () => {
    const c = collectionSchema.parse(faceVideoTemplate());
    const titles = matchingGuides(c, { background: "Indoor", light_condition: "Mixed Lighting", skin_tone: "Medium", accessory: "None" }).map((g) => g.title);
    expect(titles).toEqual(["Lighting guide: Indoor + Mixed Lighting", "Skin tone guide: Medium", "Accessory guide: None"]);
  });

  it("closes options whose quotas are full and keeps fields without quotas open", () => {
    const c: CollectionConfig = collectionSchema.parse({
      ...faceVideoTemplate(),
      quotas: [
        { id: "q1", when: [{ field: "gender", value: "Male" }, { field: "nationality", value: "Indonesia" }], target: 2 },
        { id: "q2", when: [{ field: "gender", value: "Female" }, { field: "nationality", value: "Indonesia" }], target: 2 },
        { id: "q3", when: [{ field: "gender", value: "Female" }, { field: "nationality", value: "India" }], target: 1 },
      ],
    });
    const gender = c.fields.find((f) => f.key === "gender")!;
    const nationality = c.fields.find((f) => f.key === "nationality")!;
    const device = c.fields.find((f) => f.key === "device")!;
    // Nothing chosen yet, nothing filled: both genders open; only the nationalities that have quotas.
    expect(openOptions(c, gender, {})).toEqual(["Male", "Female"]);
    expect(openOptions(c, nationality, {})).toEqual(["India", "Indonesia"]);
    // Male chosen: only Indonesia has a Male quota.
    expect(openOptions(c, nationality, { gender: "Male" })).toEqual(["Indonesia"]);
    // Male Indonesia full: Male closes for Indonesians.
    expect(openOptions(c, gender, { nationality: "Indonesia" }, { q1: 2 })).toEqual(["Female"]);
    expect(openOptions(c, device, { gender: "Male" })).toEqual(device.options);
  });
});
