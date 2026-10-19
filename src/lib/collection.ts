import { z } from "zod";

/**
 * Collection setup (Phase 2A, ID-53): what a project collects and how the
 * contributor page looks. One JSON document per version, stored in
 * project_collection_versions. The same schema checks the PM's builder in the
 * browser and the server action; the database checks ownership and size.
 *
 * Modelled on the first real brief (AIxBlock face-video job, owner 2026-10-19):
 * profile fields with fixed options, guides shown for chosen options, quotas
 * that limit which options are still open, consent with a signature, one video,
 * and an ID document (eKYC).
 */

export const FIELD_TYPES = ["text", "email", "phone", "date", "number", "select"] as const;
export const FILE_KINDS = ["video", "image", "audio"] as const;
export const SIGNATURE_MODES = ["either", "draw", "type", "none"] as const;
export const BACK_SIDE = ["optional", "required", "none"] as const;

/** Accepted file extensions per kind (the browser picker and the server check use these). */
export const KIND_EXTENSIONS: Record<(typeof FILE_KINDS)[number], string[]> = {
  video: ["mp4", "mov", "m4v", "webm"],
  image: ["jpg", "jpeg", "png", "webp", "heic"],
  audio: ["mp3", "m4a", "wav", "aac", "ogg"],
};

const key = z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, "fieldKey");
const label = z.string().trim().min(1, "labelRequired").max(120);
const longText = (max: number) => z.string().max(max).optional().default("");
const optionalUrl = z.string().trim().max(500).refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "httpsUrl").optional().default("");

export const conditionSchema = z.object({ field: key, value: z.string().trim().min(1).max(120) });

export const fieldSchema = z.object({
  key,
  label,
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(true),
  /** Used by the duplicate checks (same email, phone or ID in this project). */
  identity: z.boolean().default(false),
  /** Shown to QC reviewers (Q36: shown by default; the PM can hide fields). */
  qcVisible: z.boolean().default(true),
  help: longText(300),
  options: z.array(z.string().trim().min(1).max(120)).max(60).default([]),
});

export const guideSchema = z.object({
  id: z.string().min(1).max(40),
  title: label,
  /** Shown when ALL conditions match the contributor's choices, e.g. Background = Indoor and Light = Mixed. */
  when: z.array(conditionSchema).min(1, "guideCondition").max(4),
  description: longText(2000),
  imageIds: z.array(z.string().uuid()).max(6).default([]),
  videoUrl: optionalUrl,
});

export const quotaSchema = z.object({
  id: z.string().min(1).max(40),
  when: z.array(conditionSchema).min(1, "quotaCondition").max(6),
  target: z.number().int().min(1).max(1_000_000),
});

export const fileSlotSchema = z.object({
  key,
  label,
  kind: z.enum(FILE_KINDS),
  required: z.boolean().default(true),
  maxMb: z.number().int().min(1).max(5000),
  minSeconds: z.number().int().min(0).max(36000).nullable().default(null),
  maxSeconds: z.number().int().min(1).max(36000).nullable().default(null),
  notice: longText(1000),
});

export const collectionSchema = z.object({
  intro: z.object({
    notice: longText(3000),
    instructions: longText(8000),
    videoUrl: optionalUrl,
  }),
  fields: z.array(fieldSchema).min(1, "oneField").max(40),
  guides: z.array(guideSchema).max(80).default([]),
  quotas: z.array(quotaSchema).max(500).default([]),
  consent: z.object({
    enabled: z.boolean(),
    title: z.string().trim().max(200).default("Agreement & Consent"),
    text: longText(30000),
    checkboxLabel: z.string().trim().max(400).default(""),
    signature: z.enum(SIGNATURE_MODES).default("either"),
  }),
  files: z.array(fileSlotSchema).min(1, "oneFile").max(10),
  ekyc: z.object({
    enabled: z.boolean(),
    note: longText(1000),
    backSide: z.enum(BACK_SIDE).default("optional"),
    maxMb: z.number().int().min(1).max(50).default(30),
  }),
  limits: z.object({
    /** Fixed by decision #37/session rule: 5 hours. Shown, not edited. */
    sessionHours: z.literal(5).default(5),
    maxPerContributor: z.number().int().min(1).max(1000).nullable().default(1),
  }),
}).superRefine((c, ctx) => {
  const keys = new Set<string>();
  c.fields.forEach((f, i) => {
    if (keys.has(f.key)) ctx.addIssue({ code: "custom", message: "duplicateKey", path: ["fields", i, "key"] });
    keys.add(f.key);
    if (f.type === "select" && f.options.length < 2) ctx.addIssue({ code: "custom", message: "twoOptions", path: ["fields", i, "options"] });
    if (new Set(f.options).size !== f.options.length) ctx.addIssue({ code: "custom", message: "duplicateOption", path: ["fields", i, "options"] });
  });
  const fileKeys = new Set<string>();
  c.files.forEach((f, i) => {
    if (fileKeys.has(f.key)) ctx.addIssue({ code: "custom", message: "duplicateKey", path: ["files", i, "key"] });
    fileKeys.add(f.key);
    if (f.minSeconds != null && f.maxSeconds != null && f.minSeconds > f.maxSeconds) {
      ctx.addIssue({ code: "custom", message: "durationOrder", path: ["files", i, "maxSeconds"] });
    }
  });
  const selects = new Map(c.fields.filter((f) => f.type === "select").map((f) => [f.key, new Set(f.options)]));
  const checkConditions = (list: { field: string; value: string }[], path: (string | number)[]) => {
    list.forEach((w, j) => {
      const options = selects.get(w.field);
      if (!options) ctx.addIssue({ code: "custom", message: "conditionField", path: [...path, j, "field"] });
      else if (!options.has(w.value)) ctx.addIssue({ code: "custom", message: "conditionValue", path: [...path, j, "value"] });
    });
  };
  c.guides.forEach((g, i) => checkConditions(g.when, ["guides", i, "when"]));
  c.quotas.forEach((q, i) => checkConditions(q.when, ["quotas", i, "when"]));
  if (c.consent.enabled && c.consent.text.trim().length < 20) ctx.addIssue({ code: "custom", message: "consentText", path: ["consent", "text"] });
});

export type CollectionConfig = z.output<typeof collectionSchema>;
export type CollectionInput = z.input<typeof collectionSchema>;
export type CollectionField = CollectionConfig["fields"][number];
export type Guide = CollectionConfig["guides"][number];
export type Quota = CollectionConfig["quotas"][number];
export type FileSlot = CollectionConfig["files"][number];

/** Guides that match the contributor's current choices, in the PM's order. */
export function matchingGuides(config: Pick<CollectionConfig, "guides">, values: Record<string, string>): Guide[] {
  return config.guides.filter((g) => g.when.every((w) => values[w.field] === w.value));
}

/** Quota rules that a set of answers falls into. */
export function matchingQuotas(config: Pick<CollectionConfig, "quotas">, values: Record<string, string>): Quota[] {
  return config.quotas.filter((q) => q.when.every((w) => values[w.field] === w.value));
}

/**
 * Options still open for one field given the other choices (the "Only these options are
 * available for your demographic" rule). An option is closed when every quota rule it
 * would fall into is full. Fields without quota rules stay fully open.
 * `filled` maps quota id → approved-or-pending count (Phase 2D fills this in).
 */
export function openOptions(config: CollectionConfig, field: CollectionField, values: Record<string, string>, filled: Record<string, number> = {}): string[] {
  const rulesForField = config.quotas.filter((q) => q.when.some((w) => w.field === field.key));
  if (rulesForField.length === 0) return field.options;
  return field.options.filter((option) => {
    const trial = { ...values, [field.key]: option };
    const relevant = rulesForField.filter((q) => q.when.every((w) => trial[w.field] === undefined || trial[w.field] === "" || trial[w.field] === w.value));
    if (relevant.length === 0) return false; // no quota mentions this option: it isn't wanted
    return relevant.some((q) => (filled[q.id] ?? 0) < q.target);
  });
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const EMPTY_COLLECTION: CollectionInput = {
  intro: { notice: "", instructions: "", videoUrl: "" },
  fields: [
    { key: "full_name", label: "Full name", type: "text", required: true, identity: false, qcVisible: true, help: "", options: [] },
    { key: "email", label: "Email", type: "email", required: true, identity: true, qcVisible: true, help: "", options: [] },
  ],
  guides: [],
  quotas: [],
  consent: { enabled: false, title: "Agreement & Consent", text: "", checkboxLabel: "", signature: "either" },
  files: [{ key: "video", label: "Your video", kind: "video", required: true, maxMb: 50, minSeconds: null, maxSeconds: null, notice: "" }],
  ekyc: { enabled: false, note: "", backSide: "optional", maxMb: 30 },
  limits: { sessionHours: 5, maxPerContributor: 1 },
};

/**
 * Starting point that mirrors the first real brief: a face video with demographic
 * fields, lighting and skin-tone guides, biometric consent and eKYC. The PM edits it.
 */
export function faceVideoTemplate(): CollectionInput {
  const select = (k: string, l: string, options: string[], help = "") =>
    ({ key: k, label: l, type: "select" as const, required: true, identity: false, qcVisible: true, help, options });
  return {
    intro: {
      notice:
        "Our platform is responsible for collecting your data, managing your consent and keeping to data-protection rules.\n\n" +
        "This opportunity was shared with you by an agency or local coordinator. That agency is your contact for payment, rates, timelines and day-to-day questions. " +
        "All payment for your participation comes from the agency that recruited you. CohortData does not pay individual contributors directly.",
      instructions:
        "Record one face video with your phone's own camera app.\n\n" +
        "1. Sit facing the camera, face fully visible, nothing covering it.\n" +
        "2. Follow the lighting guide for the options you choose.\n" +
        "3. Keep the phone still. Record for 15 to 25 seconds.\n" +
        "4. Upload the original file from your gallery.",
      videoUrl: "",
    },
    fields: [
      { key: "full_name", label: "Full name", type: "text", required: true, identity: false, qcVisible: true, help: "", options: [] },
      { key: "email", label: "Email", type: "email", required: true, identity: true, qcVisible: true, help: "", options: [] },
      select("gender", "Gender", ["Male", "Female"]),
      select("age_group", "Age group", ["18-29", "30-39", "40-49", "50+"]),
      select("nationality", "Nationality", ["India", "Indonesia", "Brazil", "Saudi Arabia", "United Arab Emirates", "Singapore"]),
      select("skin_tone", "Skin tone", ["Light", "Medium", "Dark"], "Use the skin tone guide to choose."),
      select("background", "Background", ["Indoor", "Outdoor"]),
      select("light_condition", "Light condition", ["Natural Light", "Mixed Lighting", "Low Light"]),
      select("device", "Device", ["iPhone", "Android phone"]),
      select("accessory", "Accessory type", ["None", "Glasses", "Hat", "Face mask"]),
    ],
    guides: [
      { id: newId("g"), title: "Lighting guide: Indoor + Mixed Lighting", when: [{ field: "background", value: "Indoor" }, { field: "light_condition", value: "Mixed Lighting" }],
        description: "Sit beside an open window on a bright day, with one side of your face lit by daylight and the other side in visible shadow. Do not use any artificial light.", imageIds: [], videoUrl: "" },
      { id: newId("g"), title: "Lighting guide: Indoor + Natural Light", when: [{ field: "background", value: "Indoor" }, { field: "light_condition", value: "Natural Light" }],
        description: "Face a window so daylight falls evenly on your whole face. Turn off indoor lights.", imageIds: [], videoUrl: "" },
      { id: newId("g"), title: "Skin tone guide: Light", when: [{ field: "skin_tone", value: "Light" }], description: "Skin tone level 1 to 3 on the Monk scale.", imageIds: [], videoUrl: "" },
      { id: newId("g"), title: "Skin tone guide: Medium", when: [{ field: "skin_tone", value: "Medium" }], description: "Skin tone level 4 to 6 on the Monk scale.", imageIds: [], videoUrl: "" },
      { id: newId("g"), title: "Skin tone guide: Dark", when: [{ field: "skin_tone", value: "Dark" }], description: "Skin tone level 7 to 10 on the Monk scale.", imageIds: [], videoUrl: "" },
      { id: newId("g"), title: "Accessory guide: None", when: [{ field: "accessory", value: "None" }], description: "Please do not wear anything on your face or head if you choose “None”.", imageIds: [], videoUrl: "" },
    ],
    quotas: [],
    consent: {
      enabled: true,
      title: "Agreement & Consent",
      text: "BIOMETRIC DATA COLLECTION AND PROCESSING CONSENT FORM\n\nReplace this with the consent text from CohortData's legal team for this project.",
      checkboxLabel: "I have read the consent agreement above and have the right and authority to enter into it without anyone else's permission.",
      signature: "either",
    },
    files: [{
      key: "video", label: "Upload your video", kind: "video", required: true, maxMb: 50, minSeconds: 15, maxSeconds: 25,
      notice: "Use your phone's built-in camera to record, then upload straight from your gallery. Do not record in a browser or another app, and do not send the video through WhatsApp or a chat app before uploading.",
    }],
    ekyc: {
      enabled: true,
      note: "For compliance we need to confirm you are in the country you chose. Upload a clear photo of your passport, ID card or driving licence. You may blur other details, but your name, face, country and birth year must stay visible.",
      backSide: "optional",
      maxMb: 30,
    },
    limits: { sessionHours: 5, maxPerContributor: 1 },
  };
}
