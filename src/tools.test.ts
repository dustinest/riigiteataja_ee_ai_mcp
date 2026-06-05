import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TOOLS, getTool } from "./tools.js";

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
}

beforeEach(() => stubCaches());
afterEach(() => vi.restoreAllMocks());

describe("tool registry", () => {
  it("exposes the three tools with JSON schemas", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["search_acts", "get_act", "get_act_metadata"]);
    for (const t of TOOLS) {
      expect(t.inputSchema).toHaveProperty("type", "object");
      expect(typeof t.description).toBe("string");
    }
  });
});

describe("search_acts", () => {
  it("returns normalized acts with pagination and counts", async () => {
    const payload = {
      koik: 45,
      kehtivad: 30,
      kehtetud: 0,
      joustuvad: 15,
      results: [
        { id: 112052026006, title: "Halduskohtumenetluse seadustik", abbreviation: "HKMS", reportStatus: "KEHTIV", contexts: [] },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
    const out = await getTool("search_acts")!.handler({ query: "kuritegu" });
    const s = out.structured as any;
    expect(s.total).toBe(45);
    expect(s.page).toBe(1);
    expect(s.pageSize).toBe(30);
    expect(s.hasMore).toBe(true);
    expect(s.counts).toEqual({ inForce: 30, repealed: 0, enteringIntoForce: 15 });
    expect(s.acts[0].id).toBe("112052026006");
    expect(typeof out.text).toBe("string");
  });

  it("rejects an invalid status with a schema error", async () => {
    await expect(getTool("search_acts")!.handler({ query: "x", status: "KEHTIV" })).rejects.toBeTruthy();
  });
});

describe("get_act", () => {
  it("returns a detail with text", async () => {
    const xml = "<oigusakt><metaandmed><valjaandja>Riigikogu</valjaandja><dokumentLiik>seadus</dokumentLiik></metaandmed><aktinimi><nimi><pealkiri>Test</pealkiri></nimi></aktinimi><sisu><tavatekst>Hello body</tavatekst></sisu></oigusakt>";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml, { status: 200, headers: { "content-type": "application/xml" } })));
    const out = await getTool("get_act")!.handler({ id: "123" });
    const s = out.structured as any;
    expect(s.found).toBe(true);
    expect(s.act.title).toBe("Test");
    expect(s.act.text).toContain("Hello body");
  });

  it("returns a clean not-found result on a JSON 404", async () => {
    const body = JSON.stringify({ code: 404, message: "Sellist akti ei leitud: 999" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 404, headers: { "content-type": "application/json" } })));
    const out = await getTool("get_act")!.handler({ id: "999" });
    expect((out.structured as any).found).toBe(false);
    expect(out.isError).toBe(true);
  });
});

describe("get_act_metadata", () => {
  it("returns header fields without text", async () => {
    const xml = "<oigusakt><metaandmed><valjaandja>Riigikogu</valjaandja></metaandmed><aktinimi><nimi><pealkiri>Test</pealkiri></nimi></aktinimi><sisu><tavatekst>Body</tavatekst></sisu></oigusakt>";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml, { status: 200, headers: { "content-type": "application/xml" } })));
    const out = await getTool("get_act_metadata")!.handler({ id: "123" });
    const s = out.structured as any;
    expect(s.found).toBe(true);
    expect(s.act.title).toBe("Test");
    expect(s.act.text).toBeUndefined();
  });
});
