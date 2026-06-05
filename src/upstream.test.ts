import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  tallinnValidDate,
  buildSearchBody,
  searchActs,
  fetchActXml,
  PAGE_SIZE,
  type SearchParams,
} from "./upstream.js";
import { ActNotFoundError, UpstreamError } from "./types.js";

const baseParams: SearchParams = {
  query: "kuritegu",
  query2: "",
  operator: "AND",
  inText: true,
  inTitle: true,
  morph: false,
  status: "KEHTIVAD_KEHTETUTETA",
  oldestFirst: false,
  page: 1,
};

function stubCaches() {
  const store = new Map<string, Response>();
  (globalThis as unknown as { caches: unknown }).caches = {
    default: {
      async match(req: Request) {
        const r = store.get(req.url);
        return r ? r.clone() : undefined;
      },
      async put(req: Request, res: Response) {
        store.set(req.url, res.clone());
      },
    },
  };
  return store;
}

beforeEach(() => {
  stubCaches();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("tallinnValidDate", () => {
  it("uses +03:00 in summer", () => {
    expect(tallinnValidDate(new Date("2026-07-01T10:00:00Z"))).toBe("2026-07-01T00:00:00.000+03:00");
  });
  it("uses +02:00 in winter", () => {
    expect(tallinnValidDate(new Date("2026-01-15T10:00:00Z"))).toBe("2026-01-15T00:00:00.000+02:00");
  });
});

describe("buildSearchBody", () => {
  it("maps params to the upstream body with fixed sort and page offset", () => {
    const body = buildSearchBody({ ...baseParams, page: 3 }, new Date("2026-07-01T10:00:00Z")) as any;
    expect(body.general.searchText).toBe("kuritegu");
    expect(body.general.logicalOperator).toBe("AND");
    expect(body.general.sort).toBe("kehtivuseAlgus");
    expect(body.general.sortAscending).toBe(false);
    expect(body.general.searchAfter).toBe((3 - 1) * PAGE_SIZE);
    expect(body.precise.status).toBe("KEHTIVAD_KEHTETUTETA");
    expect(body.precise.excludedFilterList).toEqual([]);
  });
  it("sets sortAscending true when oldestFirst is true", () => {
    const body = buildSearchBody({ ...baseParams, oldestFirst: true }, new Date()) as any;
    expect(body.general.sortAscending).toBe(true);
  });
});

describe("searchActs", () => {
  it("POSTs and returns the parsed response", async () => {
    const payload = { koik: 45, kehtivad: 30, kehtetud: 0, joustuvad: 15, results: [{ id: 1 }] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await searchActs(baseParams, new Date());
    expect(r.koik).toBe(45);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/otsing/tervik-tekst");
    expect(init.method).toBe("POST");
  });
  it("serves a repeat identical search from cache", async () => {
    const payload = { koik: 1, kehtivad: 1, kehtetud: 0, joustuvad: 0, results: [] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await searchActs(baseParams, new Date());
    await searchActs(baseParams, new Date());
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("throws UpstreamError on non-200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(searchActs(baseParams, new Date())).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("fetchActXml", () => {
  it("returns XML text on success", async () => {
    const fetchMock = vi.fn(async () => new Response("<oigusakt/>", { status: 200, headers: { "content-type": "application/xml" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchActXml("123")).toBe("<oigusakt/>");
  });
  it("throws ActNotFoundError on a JSON 404", async () => {
    const body = JSON.stringify({ code: 404, error: "Not Found", message: "Sellist akti ei leitud: 999" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 404, headers: { "content-type": "application/json" } })));
    await expect(fetchActXml("999")).rejects.toBeInstanceOf(ActNotFoundError);
  });
});
