import { handleRpc, type JsonRpcRequest } from "./mcp.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, _env: unknown, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed. POST JSON-RPC to this endpoint.", {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    }

    // Batch request: respond with an array of the non-null responses.
    if (Array.isArray(payload)) {
      const responses = (await Promise.all((payload as JsonRpcRequest[]).map(handleRpc))).filter((r) => r !== null);
      if (responses.length === 0) return new Response("", { status: 202, headers: CORS_HEADERS });
      return json(responses);
    }

    const response = await handleRpc(payload as JsonRpcRequest);
    if (response === null) return new Response("", { status: 202, headers: CORS_HEADERS });
    return json(response);
  },
};
