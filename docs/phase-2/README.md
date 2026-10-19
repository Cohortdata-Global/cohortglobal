# Phase 2: Data collection, QC and delivery (plan)

Status: **2A done (2026-10-19)**; next 2B. Owner's answers to Q32–Q41 are recorded in `docs/Decisions/confirmed-decisions.md` ("Collection answers").

| Sub-phase | Status |
|---|---|
| Operations Manager + PMs per project (owner request, ID-52) | ✅ 2026-10-19 |
| 2A Storage door + collection setup builder (ID-53) | ✅ 2026-10-19 (not yet seen in a browser) |
| 2B Logged-in collection | Next |
| 2C–2G | Planned |
Builds on Phase 1: agencies, staff, projects, applications, contracts and member assignment all exist and are tested.

## 1. The whole picture

```
PHASE 1 (done)                                PHASE 2 (this plan)
──────────────                                ────────────────────
PM creates project ─► publishes ─► agency /   PM adds the DATA REQUIREMENTS
direct freelancer applies ─► PM approves ─►   (files, metadata form, consent, quotas, limits)
contract signed + countersigned ─► WORK OPEN            │
                                                         ▼
                        ┌──────────── WHO COLLECTS ─────────────┐
                        │ Agency Member (logged in, /work)       │
                        │ Agency Freelancer (public link /c/…)   │
                        │ Direct Freelancer (logged in, /work)   │
                        └───────────────────┬────────────────────┘
                                            ▼
              SESSION: fill form ─► consent (if needed) ─► upload files ─► Submit
                                            ▼
              AUTOMATED CHECKS: file type/size/duration, metadata rules,
              duplicates (hash, email, phone, ID) ─► auto-reject  | soft flags ─► QC
                                            ▼
              QC QUEUE (per project) ─► QC Lead assigns ─► QC Reviewer decides
                    Approve │ Request resubmission (remark) │ Reject (remark)
                                            ▼
              APPROVED ─► DELIVERY BATCH (manifest + files) ─► downloaded / delivered
```

## 2. Step by step

### 2.1 Project data requirements (PM, before or after publishing)
- **Files to collect:** one or more "slots", e.g. "Selfie video, 15–25 s, MP4/MOV, up to 100 MB" and "3 photos, JPG". Per slot: kind (video, photo, audio, document), count, allowed types, max size (#39, per project), min/max duration for video/audio.
- **Metadata form:** fields the contributor fills (name, email, phone, date of birth, gender, age group, nationality, device, …). Stored as flexible JSON with key fields indexed (#40). Fields can be required, and some are marked as **identity fields** used for duplicate checks.
- **Consent / eKYC:** on or off per project; versioned consent text; the contributor ticks and types their name (#consent).
- **Quotas:** total target, optional targets per segment (e.g. 50% female, ages 18–30), per-contributor limit, per-link limit (#35).
- **Instructions:** text plus optional example images/videos shown before upload.
- Requirements are versioned like questions: editing after submissions exist creates a new version; old submissions keep the version they used.

### 2.2 Who collects and how
| Collector | How they get in | What they see |
|---|---|---|
| Agency Member | Logs in; Manager assigned them to the project (Phase 1) | `/work`: their assigned projects, "New submission", their own submissions and remarks |
| Agency Freelancer | Public link from Owner/Manager: `/c/<token>`, one person per link (#34), valid 24 h, session 5 h | Instructions, form, upload, their own result while the session is open (#33). No account, no email code (#32) |
| Direct Freelancer | Logs in; approved + contract signed (Phase 1) | Same as Agency Member |

Agency Owner/Manager see every submission of their agency, per project, with status and remarks. They create and revoke links; the Super Admin can revoke any link (#36).

### 2.3 Session and upload
1. **Start** a session (logged-in: button; link: opening the link). A session lasts 5 hours.
2. **Fill the form** (validated in the browser and again on the server).
3. **Consent**, if the project needs it.
4. **Upload** each file **straight from the phone to storage** with resumable uploads (TUS): a dropped connection continues where it stopped. The app server never carries the video.
5. **Submit.** Files are locked; the submission becomes `SUBMITTED` and the checks run.
- Unfinished sessions keep their progress until the session ends; then uploaded files are cleaned up.

### 2.4 Automated checks (seconds after submit)
| Check | Result |
|---|---|
| File type, size, count per slot | Fail → auto-reject with a clear reason |
| Video/audio duration, resolution (read in the browser, re-checked on the server where possible) | Fail → auto-reject |
| Metadata required fields and formats | Fail → cannot submit (shown in the form) |
| Same file hash, email, phone or ID number already in this project (#38) | Auto-reject: "Duplicate" |
| Same name + date of birth; same device, different names; same name + phone, different email (#38) | Goes to QC with a **flag** the reviewer sees |
| Quota already full for that segment | Cannot start / cannot submit, with a message |

### 2.5 QC
- **Queue per project** with filters (agency, flags, age, segment).
- **QC Lead** assigns: pick items → pick reviewer, or "assign next N to each reviewer" (round-robin). Can reassign and see each reviewer's load.
- **QC Reviewer** sees only items assigned to them: media player / image viewer, metadata, automated-check results and flags. Decision:
  - **Approve**
  - **Request resubmission** with remark + reason codes → the contributor fixes and resubmits (link sessions reopen with a fresh 5 h, capped at link expiry, #37)
  - **Reject** with remark + reason codes (final)
- Remarks reach: members and direct freelancers in `/work` + email; link freelancers on the link page only (#33); the agency Owner/Manager in their submissions list.
- PM and Super Admin can view the queue and progress; only QC roles decide (#43).
- **QC levels (Q32):** one level in v1; a Level 2 spot-check may come later.
- **Reviewer assignment (Q41):** the QC Lead assigns; "pick from the queue" is a later option.

### 2.6 Delivery
- PM (or Super Admin) creates a **delivery batch** from approved items (filter by date, segment, agency).
- The batch produces a **manifest** (CSV + JSON: one row per item with metadata, file names, checksums) and a ZIP or folder of files, downloadable through short-lived links.
- Batch states: `PACKAGED → DELIVERED` / `FAILED` (attempts kept). Items in a batch are locked from further changes.

### 2.7 Dashboards
- **PM:** per project — target vs collected vs approved, by segment and agency; QC backlog.
- **QC Lead:** queue size, per-reviewer load and speed, oldest waiting item.
- **Agency:** per project — submitted, in QC, approved, rejected, resubmission needed; per member/link.
- **Collector:** own submissions with status and remarks.

## 3. Storage: Supabase now, own server later

- **Now:** a private Supabase Storage bucket `submissions`. Path: `project/<project>/agency-or-individual/<org>/submission/<id>/<slot>-<n>.<ext>`.
- **Upload:** resumable TUS uploads directly to Supabase with a short-lived, per-session upload ticket (same pattern as agency documents, ID-39).
- **Viewing:** short-lived signed URLs (minutes), only for people allowed to see that submission.
- **Later move to the 2 TB server:** all storage calls go through one `StorageProvider` interface (`createUploadTicket`, `signedReadUrl`, `delete`, `copy`). Switching = a new adapter (e.g. MinIO/S3-compatible on the server) + a copy script. The database stores provider + path, so old and new files can live side by side during the move.
- **Supabase plan:** staying on Free for testing (Q33) with 3–4 MB videos: **50 MB per file, 1 GB total**. Pro ($25/month) gives 100 GB and files up to 500 GB. `STORAGE_FILE_LIMIT_MB` makes the builder warn above the plan's limit.
- **Resumable uploads (for 2B):** `tus-js-client` to `<supabase>/storage/v1/upload/resumable/sign` with headers `apikey` and `x-signature: <token from createSignedUploadUrl>`, 6 MB chunks. Works without a Supabase login, so it suits public-link freelancers too.

## 4. Data model (new tables, draft)

| Domain | Tables |
|---|---|
| Requirements | `project_requirements` (versioned JSON: slots, form, consent, quotas), `project_quotas` |
| Links | `submission_links` (hash, project, agency, creator, expires_at, status, max_submissions), `link_contributors` (one row per agency + normalized email/phone) |
| Sessions & submissions | `submission_sessions` (who/which link, started_at, ends_at, status), `submissions` (status, version, contributor, agency, metadata jsonb, key fields indexed), `submission_files` (slot, provider, path, size, mime, sha256, duration, width/height), `consent_records` |
| Checks | `submission_checks` (check, result, detail), `duplicate_keys` (project, kind, normalized value → submission) |
| QC | `qc_tasks` (submission, status, assigned_to, assigned_by, level), `qc_reviews` (decision, remark, reviewer), `rejection_reasons` (per project list), `qc_review_reasons` |
| Delivery | `delivery_batches`, `delivery_items`, `delivery_attempts` |

Same rules as Phase 1: read through RLS, every write through a `SECURITY DEFINER` function with a permission check, every change audited, pgTAP tests for each rule.

Submission states: `DRAFT → SUBMITTED → AUTO_REJECTED | IN_QC → APPROVED | RESUBMISSION_REQUESTED → (resubmitted) SUBMITTED | REJECTED`; `APPROVED → DELIVERED`.

## 5. Security rules to test
- An agency never sees another agency's submissions, links or files (database and storage).
- A member sees only their own submissions; a link freelancer only their own session (session cookie bound to the link).
- A reviewer sees only items assigned to them; the QC Lead sees the project queue; agencies never see reviewer names (proposed).
- Upload tickets work only for that session, slot, size and type, and expire.
- Expired or revoked links, paused projects, suspended agencies and revoked assignments stop new sessions and uploads immediately.
- File URLs are short-lived and never public.

## 6. Build order (sub-phases)

| Sub-phase | What | Rough time |
|---|---|---|
| 2A | Storage foundation (bucket, `StorageProvider`, TUS uploads, tickets) + data requirements builder for PMs | 2 days |
| 2B | Logged-in collection: `/work` sessions, form, consent, uploads, submit (members, direct freelancers) | 2 days |
| 2C | Public links: create/revoke, `/c/<token>` mobile page, link sessions, link contributors | 1.5 days |
| 2D | Automated checks and duplicates, quotas | 1.5 days |
| 2E | QC: queue, assignment, review screen, decisions, remarks, resubmission | 2.5 days |
| 2F | Delivery batches, manifests, dashboards for PM / QC Lead / agency | 1.5 days |
| 2G | Hardening: security tests, speed on phones, docs, two-account checks | 1 day |

About two weeks of build, plus the owner's testing.

## 7. Questions for the owner (answered 2026-10-19; kept for reference)

| ID | Question | Suggestion |
|---|---|---|
| Q32 (was Q27) | QC levels: one review, or Level 1 + Level 2? Is "Operations Manager" a new role? | One level in v1 + optional Level 2 sampling per project (e.g. 10%) by QC Lead; no new role yet |
| Q33 | Upgrade Supabase to Pro ($25/month) for video storage? | Yes, before 2B testing |
| Q34 | First real project to build around: what files (video/photo/audio), how long, how big? | Send one real brief |
| Q35 | Video checks: browser-read duration/resolution in v1, server re-check (ffprobe worker) later? | Yes |
| Q36 | Can reviewers see contributors' personal details (name, phone, email)? | Only fields the project marks "visible to QC"; identity fields hidden by default |
| Q37 | How long are rejected / auto-rejected files kept? | 30 days, then deleted; metadata kept |
| Q38 | Delivery format: ZIP download + CSV/JSON manifest enough for v1? | Yes |
| Q39 | Who creates delivery batches? | PM and Super Admin |
| Q40 | Can an agency Manager see each freelancer's submitted files, or status only? | Files and status for their own agency |
| Q41 | Reviewer assignment: manual + "assign next N" by QC Lead, or reviewers pull from the queue themselves? | QC Lead assigns (confirmed flow); "pull next" off |

## 8. How the first brief maps onto the setup (2A)

| On the AIxBlock page | In the collection setup |
|---|---|
| "Please read before proceeding" box | Before they start → Notice |
| Upload guide: View instructions / Watch video | Before they start → Instructions, Instruction video link |
| Full Name, Email | Profile fields (text, email; email has *Duplicate check*) |
| Gender, Age Group, Nationality, Skin tone, Background, Light Condition, Device, Accessory Type | Profile fields of type *Options* |
| "Only these options are available for your demographic" | Quotas: an option closes when every quota it falls into is full |
| Lighting Guide: Indoor + Mixed Lighting (image, video, description) | Guide with two conditions |
| Skin Tone Guide: Medium, Accessory Guide: None | Guides with one condition |
| Start Session → 5-hour window | Session and limits (fixed 5 hours) |
| Agreement & Consent, checkbox, Draw / Type signature | Consent (signature: draw or type) |
| Upload Your Video + red warning | Files to collect (video, warning text, length limits) |
| Identity Verification (eKYC): front required, back optional, max 30 MB | ID check (eKYC) |
