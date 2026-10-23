import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/server/env";

/**
 * Service-role client. It BYPASSES row-level security.
 *
 * Allowed uses only (docs/architecture.md section 6.4, enforced by the
 * no-restricted-imports lint rule in eslint.config.mjs):
 *   - Clerk webhook and the signed-in user self-sync (src/server/auth/sync-user.ts)
 *   - invitation preview before sign-in (src/server/invitations/preview.ts)
 *   - sending queued emails (src/server/email/outbox.ts)
 *   - storing and signing agency documents (src/server/storage/documents.ts)
 *   - collection files and public-link sessions (src/server/collect/**, ID-55)
 *   - the Super Admin bootstrap script (scripts/bootstrap-super-admin.mjs)
 *
 * Every caller must authorize the operation first.
 */
let client: SupabaseClient | null = null;

export function systemClient(): SupabaseClient {
  if (!client) {
    const env = serverEnv();
    client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
