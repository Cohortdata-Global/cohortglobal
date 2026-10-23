import { NextResponse, type NextRequest } from "next/server";
import { linkAssetUrl, lookupLink } from "@/server/collect/core";

/** Guide images on a public link page: only images of the link's own project, while the link exists. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const link = await lookupLink(token);
  const url = link && !link.revoked ? await linkAssetUrl(link, id) : null;
  if (!url) return new NextResponse("Not found", { status: 404 });
  const res = NextResponse.redirect(url, { status: 302 });
  res.headers.set("Cache-Control", "private, max-age=300");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
