import {
  ActNotFoundError,
  UpstreamError,
  type ActStatus,
  type UpstreamSearchResponse,
} from "./types.js";

const SEARCH_URL = "https://www.riigiteataja.ee/public-api/api/v1/otsing/tervik-tekst";
const ACT_BASE = "https://www.riigiteataja.ee/public-api/api/v1/akt";

// Acts and search results change infrequently. Bump this one constant to change
// cache lifetime.
export const CACHE_TTL_SECONDS = 600;

// Verified live: the search endpoint returns 30 results per page and searchAfter
// is a pure zero-based offset.
export const PAGE_SIZE = 30;

export type SearchParams = {
  query: string;
  query2: string;
  operator: "AND" | "OR";
  inText: boolean;
  inTitle: boolean;
  morph: boolean;
  status: ActStatus;
  oldestFirst: boolean;
  page: number;
};

// Europe/Tallinn local midnight as an ISO string. The status breakdown counts only
// populate when validDate is sent. Offset is +02:00 in winter, +03:00 in summer.
export function tallinnValidDate(now: Date): string {
  const asUtc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const asTallinn = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tallinn" }));
  const offsetHours = Math.round((asTallinn.getTime() - asUtc.getTime()) / 3_600_000);
  const offset = offsetHours === 3 ? "+03:00" : "+02:00";
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tallinn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // en-CA formats as YYYY-MM-DD
  return `${ymd}T00:00:00.000${offset}`;
}

export function buildSearchBody(p: SearchParams, now: Date): unknown {
  return {
    general: {
      searchText: p.query,
      searchText2: p.query2,
      searchInText: p.inText,
      searchInTitle: p.inTitle,
      logicalOperator: p.operator,
      morphSearch: p.morph,
      searchAfter: (p.page - 1) * PAGE_SIZE,
      sort: "kehtivuseAlgus",
      sortAscending: p.oldestFirst,
    },
    precise: {
      status: p.status,
      validDate: tallinnValidDate(now),
      excludedFilterList: [],
    },
  };
}

// Synthetic GET cache key. The Cache API keys on a GET Request, but search is POST,
// so we encode the user-facing params into a fake GET URL. validDate is excluded:
// the 10-minute TTL is far shorter than a day, so it cannot cause stale counts.
function searchCacheKey(p: SearchParams): Request {
  const u = new URL("https://cache.riigiteataja.local/search");
  u.searchParams.set("q", p.query);
  u.searchParams.set("q2", p.query2);
  u.searchParams.set("op", p.operator);
  u.searchParams.set("it", String(p.inText));
  u.searchParams.set("ti", String(p.inTitle));
  u.searchParams.set("mo", String(p.morph));
  u.searchParams.set("st", p.status);
  u.searchParams.set("of", String(p.oldestFirst));
  u.searchParams.set("pg", String(p.page));
  return new Request(u.toString(), { method: "GET" });
}

export async function searchActs(p: SearchParams, now: Date): Promise<UpstreamSearchResponse> {
  const cache = caches.default;
  const cacheKey = searchCacheKey(p);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return (await cached.json()) as UpstreamSearchResponse;
  }

  let res: Response;
  try {
    res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(buildSearchBody(p, now)),
    });
  } catch (err) {
    throw new UpstreamError("Search request failed", { cause: err });
  }
  if (!res.ok) {
    throw new UpstreamError(`Search returned HTTP ${res.status}`);
  }

  const text = await res.text();
  let parsed: UpstreamSearchResponse;
  try {
    parsed = JSON.parse(text) as UpstreamSearchResponse;
  } catch (err) {
    throw new UpstreamError("Search returned invalid JSON", { cause: err });
  }

  await cache.put(
    cacheKey,
    new Response(text, {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_TTL_SECONDS}` },
    }),
  );
  return parsed;
}

export async function fetchActXml(id: string): Promise<string> {
  const url = `${ACT_BASE}/${encodeURIComponent(id)}/blob-xml`;
  const cache = caches.default;
  const cacheKey = new Request(url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    return await cached.text();
  }

  let res: Response;
  try {
    res = await fetch(new Request(url, { method: "GET", headers: { Accept: "application/xml" } }));
  } catch (err) {
    throw new UpstreamError("Act request failed", { cause: err });
  }

  // The XML endpoint returns JSON for errors even though we asked for XML.
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const errText = await res.text();
    let message = `Act request failed with HTTP ${res.status}`;
    let code: number | undefined = res.status;
    try {
      const j = JSON.parse(errText) as { code?: number; message?: string };
      if (typeof j.message === "string") message = j.message;
      if (typeof j.code === "number") code = j.code;
    } catch {
      // Non-JSON body despite a JSON content-type; keep the defaults.
    }
    if (code === 404) throw new ActNotFoundError(id, message);
    throw new UpstreamError(message);
  }

  if (!res.ok) {
    throw new UpstreamError(`Act returned HTTP ${res.status}`);
  }

  const xml = await res.text();
  await cache.put(
    cacheKey,
    new Response(xml, {
      headers: { "Content-Type": "application/xml", "Cache-Control": `max-age=${CACHE_TTL_SECONDS}` },
    }),
  );
  return xml;
}
