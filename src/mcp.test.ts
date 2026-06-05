import { describe, it, expect } from "vitest";
import { handleRpc } from "./mcp.js";

describe("handleRpc", () => {
  it("answers initialize with protocol and server info", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(r).not.toBeNull();
    expect((r as any).result.serverInfo.name).toBe("riigi-teataja");
    expect((r as any).result.capabilities).toHaveProperty("tools");
  });

  it("returns null for notifications/initialized", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  });

  it("lists the three tools", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect((r as any).result.tools.map((t: any) => t.name)).toEqual(["search_acts", "get_act", "get_act_metadata"]);
  });

  it("answers ping with an empty result", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 3, method: "ping" });
    expect((r as any).result).toEqual({});
  });

  it("errors on an unknown tool", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope", arguments: {} } });
    expect((r as any).error.code).toBe(-32602);
  });

  it("errors on an unknown method", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 5, method: "frobnicate" });
    expect((r as any).error.code).toBe(-32601);
  });
});
