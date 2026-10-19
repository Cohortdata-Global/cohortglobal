import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once. In Phase 1 the browser never talks to
 * Supabase directly: every query runs on the server with the user's Clerk token.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().optional().default("CohortGlobal <no-reply@cohortglobal.local>"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default("http://localhost:3000"),
  AGENCY_DOCUMENTS_BUCKET: z.string().optional().default("agency-documents"),
});

let cached: z.infer<typeof schema> | null = null;

export function serverEnv() {
  if (!cached) {
    const major = Number(process.versions.node.split(".")[0]);
    if (major < 22) {
      throw new Error(`CohortGlobal needs Node 22 or newer (this is Node ${process.versions.node}). Run: nvm install 22 && nvm use 22`);
    }
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Missing or invalid environment variables: ${missing}. See .env.example.`);
    }
    cached = parsed.data;
  }
  return cached;
}
