import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createUserClient } from "@/server/db/user-client";
import { signedDocumentUrl } from "@/server/storage/documents";
import { getTranslations } from "next-intl/server";

/**
 * Opens an agency document. The row is read with the user's identity, so RLS
 * decides whether this person may see it; only then is a 60-second link signed.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [{ userId }, t] = await Promise.all([auth(), getTranslations("documentsRoute")]);
  if (!userId) return new NextResponse(t("signIn"), { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(t("notFound"), { status: 404 });
  const db = await createUserClient();
  const { data } = await db.from("agency_documents").select("storage_bucket,storage_path,status").eq("id", id).maybeSingle();
  if (!data || data.status === "REMOVED") return new NextResponse(t("notFound"), { status: 404 });
  const url = await signedDocumentUrl(data.storage_bucket, data.storage_path);
  if (!url) return new NextResponse(t("unavailable"), { status: 502 });
  return NextResponse.redirect(url, { status: 302 });
}
