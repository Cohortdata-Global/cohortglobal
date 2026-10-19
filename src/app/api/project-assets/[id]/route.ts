import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createUserClient } from "@/server/db/user-client";
import { storage } from "@/server/storage/provider";
import { getTranslations } from "next-intl/server";

/**
 * Opens a guide image (ID-53). RLS decides whether this person may see the
 * project; only then is a 10-minute link signed. Guide images aren't personal
 * data, so the browser may cache the redirect for a few minutes.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [{ userId }, t] = await Promise.all([auth(), getTranslations("documentsRoute")]);
  if (!userId) return new NextResponse(t("signIn"), { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(t("notFound"), { status: 404 });
  const db = await createUserClient();
  const { data } = await db.from("project_assets").select("storage_bucket,storage_path").eq("id", id).maybeSingle();
  if (!data) return new NextResponse(t("notFound"), { status: 404 });
  const url = await storage.signedReadUrl(data.storage_bucket, data.storage_path, 600);
  if (!url) return new NextResponse(t("unavailable"), { status: 502 });
  const res = NextResponse.redirect(url, { status: 302 });
  res.headers.set("Cache-Control", "private, max-age=300");
  return res;
}
