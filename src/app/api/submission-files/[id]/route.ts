import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { createUserClient } from "@/server/db/user-client";
import { signedFileUrl } from "@/server/collect/core";

/**
 * Opens a collected file (video, photo, signature, ID). The row is read with the
 * user's identity, so RLS decides (ID-55: ID documents only for CohortData staff
 * and the uploader); only then is a 10-minute link signed. Never cached.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [{ userId }, t] = await Promise.all([auth(), getTranslations("documentsRoute")]);
  if (!userId) return new NextResponse(t("signIn"), { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(t("notFound"), { status: 404 });
  const db = await createUserClient();
  const { data } = await db.from("submission_files").select("storage_bucket,storage_path").eq("id", id).maybeSingle();
  if (!data) return new NextResponse(t("notFound"), { status: 404 });
  const url = await signedFileUrl(data.storage_bucket, data.storage_path, 600);
  if (!url) return new NextResponse(t("unavailable"), { status: 502 });
  const res = NextResponse.redirect(url, { status: 302 });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
