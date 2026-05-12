/**
 * Safe homepage fetch + HTML → text extraction for the Business Profile
 * Agent. Designed for one-shot calls per business, NOT for crawling.
 *
 * Safety rails:
 *   - 10-second hard timeout (AbortController)
 *   - 1MB response size cap (large pages = scammy or asset-heavy)
 *   - Reject non-HTML content types (PDFs, images, etc.)
 *   - User-Agent that identifies AVYN so the host can block us cleanly
 *   - Only follows HTTP(S); rejects file://, gopher://, etc.
 *   - Truncates extracted text to 18KB so Anthropic spend is predictable
 *
 * Returns a normalized `{ text, finalUrl }` on success or `{ error }` on
 * any failure. Caller never sees raw HTML.
 */

export type FetchResult =
  | { ok: true; text: string; finalUrl: string; bytesRead: number }
  | { ok: false; error: string };

const MAX_BYTES = 1_024 * 1_024; // 1MB
const MAX_TEXT_CHARS = 18_000;    // ~4-5k tokens for Claude
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "AVYN-Commerce-ProfileBot/1.0 (+https://avyncommerce.com/about)";

function normalizeUrl(input: string): string | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  // If no protocol, default to https://
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProtocol);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // Strip query/fragment — homepage only.
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Crude but effective HTML → plain text. Strips scripts/styles/svg
 * entirely, removes tags, decodes a few common entities, collapses
 * whitespace. Good enough for "what does this business sell" context
 * for Claude. NOT a real DOM parser.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Replace block-level tags with newlines so paragraphs survive
    .replace(/<\/?(p|div|section|article|header|footer|main|nav|h[1-6]|li|tr|td|th|br|hr)\b[^>]*>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode a small set of common entities (full decode requires a real parser)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Pull <title> + first <meta description> separately — these tend to
 * be the highest-signal text on a homepage and the model gives them
 * more weight when surfaced explicitly.
 */
function extractTitleAndDescription(html: string): { title: string; description: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const descMatch = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html)
    ?? /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i.exec(html);
  return {
    title: (titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    description: (descMatch?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
  };
}

export async function fetchHomepageText(urlInput: string): Promise<FetchResult> {
  const url = normalizeUrl(urlInput);
  if (!url) return { ok: false, error: "Invalid URL" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ctype.includes("html") && !ctype.includes("xml") && ctype !== "") {
      return { ok: false, error: `Non-HTML content-type: ${ctype}` };
    }

    // Stream-read with a byte cap — many CMSes serve 5MB pages.
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, error: "No response body" };
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let bytesRead = 0;
    let html = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_BYTES) {
        // Decode what we have and bail — usually enough to get the head + above-fold
        html += decoder.decode(value, { stream: false });
        break;
      }
      html += decoder.decode(value, { stream: true });
    }
    // Flush decoder
    html += decoder.decode();

    const { title, description } = extractTitleAndDescription(html);
    const body = htmlToText(html);
    // Compose: title + meta description + body — gives Claude an
    // "executive summary" header before the wall of text.
    const composed = [
      title ? `<TITLE>${title}</TITLE>` : "",
      description ? `<META_DESCRIPTION>${description}</META_DESCRIPTION>` : "",
      body,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, MAX_TEXT_CHARS);

    return {
      ok: true,
      text: composed,
      finalUrl: res.url || url,
      bytesRead,
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: `Timeout after ${FETCH_TIMEOUT_MS}ms` };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
