import "server-only";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/server/env";

/**
 * AD-1: normal database access runs as the signed-in user.
 * The Clerk session token is sent to Supabase, which verifies it (Clerk
 * third-party auth). RLS policies and the database functions then see the
 * user's Clerk id in auth.jwt()->>'sub'.
 *
 * Use this client for every request made on behalf of a user.
 * Cached per request, so pages and layouts share one client.
 */
export const createUserClient = cache(async (): Promise<SupabaseClient> => {
  const env = serverEnv();
  const { getToken } = await auth();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    accessToken: async () => (await getToken()) ?? null,
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
});
