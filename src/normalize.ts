import type { ActMatch, ActSummary, UpstreamContext, UpstreamResult } from "./types.js";
import type { ActDetail, ActMetadata } from "./types.js";
import { parseActXml, collectText } from "./xml.js";

const NAMED_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&bdquo;": "„",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&ndash;": "–",
  "&mdash;": "—",
  "&hellip;": "…",
};

// Convert an HTML fragment to readable plain text: block tags become newlines,
// remaining tags are dropped, entities are decoded, whitespace is collapsed.
// U+0001 is used internally as a block-boundary marker during processing.
export function htmlToText(html: string): string {
  // Mark block-element boundaries before stripping, so we can distinguish them
  // from whitespace that was in the original source (which collapses to a space).
  let s = html
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\x01")
    .replace(/<br\s*\/?>/gi, "\x01")
    .replace(/<[^>]+>/g, ""); // inline tags become empty - no extra spaces
  s = s.replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)));
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)));
  for (const [entity, ch] of Object.entries(NAMED_ENTITIES)) {
    s = s.split(entity).join(ch);
  }
  s = s.split("&amp;").join("&"); // decode ampersand last to avoid double-decoding
  s = s
    .replace(/[ \t\n\r\f\v]+/g, " ") // collapse all source whitespace including raw newlines
    .replace(/ *\x01 */g, "\x01")     // trim spaces around block markers
    .replace(/\x01+/g, "\n")          // convert block markers to newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
}

export function actUrl(id: string): string {
  return `https://www.riigiteataja.ee/akt/${id}`;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// Build a human-readable structural path, e.g. "ptk 22, § 240 lg 2 p 5".
// Chapter-level parts are comma-joined; the paragraph cluster is space-joined.
export function buildLocation(ctx: UpstreamContext): string | null {
  const prefixParts: string[] = [];
  if (str(ctx.osa)) prefixParts.push(`osa ${ctx.osa}`);
  if (str(ctx.peatykk)) prefixParts.push(`ptk ${ctx.peatykk}`);
  if (str(ctx.jagu)) prefixParts.push(`jagu ${ctx.jagu}`);
  if (str(ctx.jaotis)) prefixParts.push(`jaotis ${ctx.jaotis}`);

  let cluster = "";
  if (str(ctx.paragraph)) {
    cluster = `§ ${ctx.paragraph}`;
    if (str(ctx.loige)) cluster += ` lg ${ctx.loige}`;
    if (str(ctx.punkt)) cluster += ` p ${ctx.punkt}`;
  }

  const segments = [...prefixParts];
  if (cluster) segments.push(cluster);
  if (segments.length === 0) return null;
  return segments.join(", ");
}

export function toActMatch(ctx: UpstreamContext): ActMatch {
  return {
    snippet: htmlToText(ctx.html ?? ""),
    sectionTitle: str(ctx.title),
    location: buildLocation(ctx),
  };
}

export function toActSummary(r: UpstreamResult): ActSummary {
  const id = String(r.id);
  return {
    id,
    title: str(r.title) ?? "",
    abbreviation: str(r.abbreviation),
    issuer: str(r.reportIssuer),
    type: str(r.reportType),
    status: str(r.reportStatus),
    validFrom: str(r.reportDateStart),
    validTo: str(r.reportDateEnd),
    url: actUrl(id),
    matches: (r.contexts ?? []).map(toActMatch),
  };
}

// The parsed XML tree is genuinely dynamic; we navigate known paths defensively.
type AnyObj = Record<string, any>; // eslint not configured; any is intentional for XML nav

function parseActHeader(xml: string, id: string): ActMetadata {
  const root = parseActXml(xml) as AnyObj;
  const akt: AnyObj = root?.oigusakt ?? {};
  const meta: AnyObj = akt.metaandmed ?? {};
  return {
    id,
    title: str(akt?.aktinimi?.nimi?.pealkiri) ?? "",
    issuer: str(meta?.valjaandja),
    type: str(meta?.dokumentLiik),
    publishedAt: str(meta?.avaldamismarge?.avaldamineKuupaev),
    validFrom: str(meta?.kehtivus?.kehtivuseAlgus),
    url: actUrl(id),
  };
}

export function xmlToActMetadata(xml: string, id: string): ActMetadata {
  return parseActHeader(xml, id);
}

export function xmlToActDetail(xml: string, id: string): ActDetail {
  const header = parseActHeader(xml, id);
  const root = parseActXml(xml) as AnyObj;
  const text = collectText(root?.oigusakt?.sisu)
    .map(htmlToText)
    .filter((s) => s.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { ...header, text };
}
