/**
 * Instruction and example videos are usually YouTube links (as in the first brief).
 * YouTube links are embedded in privacy mode (youtube-nocookie.com, allowed by the CSP);
 * any other https link is shown as a plain "Open video" link.
 */
export function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else if (/^\/(embed|shorts|live)\//.test(u.pathname)) id = u.pathname.split("/")[2] ?? null;
    }
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}
