import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Content-Security-Policy (S8, ID-51): which sites the browser may load scripts,
 * styles, images and connections from. Report-only first: the browser logs anything
 * it would block (DevTools console) but blocks nothing. Set CSP_ENFORCE=1 once the
 * console shows no violations across sign-in, upload and the main screens.
 */
function host(url: string | undefined): string | null {
  try { return url ? new URL(url).host : null; } catch { return null; }
}
/** Clerk's frontend API host is encoded in the publishable key ("pk_test_<base64 host$>"). */
function clerkHost(): string | null {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  try { return Buffer.from(key.split("_")[2] ?? "", "base64").toString("utf8").replace(/\$$/, "") || null; } catch { return null; }
}
const supabase = host(process.env.NEXT_PUBLIC_SUPABASE_URL);
const clerk = clerkHost();
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${clerk ? ` https://${clerk}` : ""} https://*.clerk.accounts.dev https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://img.clerk.com${supabase ? ` https://${supabase}` : ""}`,
  "font-src 'self' data:",
  // Contributor videos play from short-lived storage links (Phase 2).
  `media-src 'self' blob:${supabase ? ` https://${supabase}` : ""}`,
  `connect-src 'self'${supabase ? ` https://${supabase} wss://${supabase}` : ""}${clerk ? ` https://${clerk}` : ""} https://*.clerk.accounts.dev https://clerk-telemetry.com${dev ? " ws:" : ""}`,
  // YouTube (privacy mode) for project instruction videos (ID-53).
  `frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com${clerk ? ` https://${clerk}` : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: process.env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Browsers only ever talk to the live site over HTTPS (ignored on http://localhost).
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Agency documents are uploaded through a Server Action (max 10 MB each, see ID-12).
    serverActions: { bodySizeLimit: "11mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
