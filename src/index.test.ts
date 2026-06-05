import { describe, it, expect } from "vitest";
import worker from "./index.js";

const ctx = {} as ExecutionContext;

describe("worker fetch", () => {
  it("answers OPTIONS with 204 and CORS headers", async () => {
    const res = await worker.fetch(new Request("https://x/", { method: "OPTIONS" }), {}, ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("rejects GET with 405", async () => {
    const res = await worker.fetch(new Request("https://x/", { method: "GET" }), {}, ctx);
    expect(res.status).toBe(405);
  });

  it("handles a single JSON-RPC request", async () => {
    const req = new Request("https://x/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const res = await worker.fetch(req, {}, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.result.tools).toHaveLength(3);
  });

  it("returns 202 for a notification", async () => {
    const req = new Request("https://x/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    const res = await worker.fetch(req, {}, ctx);
    expect(res.status).toBe(202);
  });

  it("returns a parse error on bad JSON", async () => {
    const req = new Request("https://x/", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{ not json" });
    const res = await worker.fetch(req, {}, ctx);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe(-32700);
  });
});
