import { describe, expect, it } from "vitest";
import { collectionSchema, faceVideoTemplate } from "@/lib/collection";
import { allowedExtensions, checkProfile, contactFrom, slotFor } from "@/lib/collect-profile";

const config = collectionSchema.parse(faceVideoTemplate());

describe("contributor profile (2B/2C)", () => {
  it("reports missing and invalid answers", () => {
    const { problems } = checkProfile(config, { full_name: "Lina", email: "not-an-email", gender: "Robot" });
    expect(problems.email).toBe("badEmail");
    expect(problems.gender).toBe("badOption");
    expect(problems.age_group).toBe("required");
  });

  it("cleans answers and finds the contact", () => {
    const { values, problems } = checkProfile(config, {
      full_name: " Lina Putri ", email: "Lina@Mail.COM", gender: "Female", age_group: "18-29", nationality: "Indonesia",
      skin_tone: "Medium", background: "Indoor", light_condition: "Mixed Lighting", device: "Android phone", accessory: "None", extra: "ignored",
    });
    expect(problems).toEqual({});
    expect(values.full_name).toBe("Lina Putri");
    expect(values.extra).toBeUndefined();
    expect(contactFrom(config, values)).toEqual({ name: "Lina Putri", email: "lina@mail.com" });
  });

  it("knows which files each upload box takes", () => {
    const video = slotFor(config, "FILE", "video")!;
    expect(allowedExtensions("FILE", video)).toContain("mov");
    const front = slotFor(config, "ID_FRONT", "id_front")!;
    expect(front.maxMb).toBe(30);
    expect(allowedExtensions("ID_FRONT", front)).toEqual(["jpg", "jpeg", "png"]);
    expect(slotFor(config, "FILE", "nope")).toBeNull();
  });
});
