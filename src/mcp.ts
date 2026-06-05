import { getTool, TOOLS } from "./tools.js";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "riigi-teataja", version: "1.0.0" };

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
};

function result(id: string | number, value: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id: string | number, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// Dispatch one JSON-RPC message. Returns null for notifications (no id), which get no response.
export async function handleRpc(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const isNotification = msg.id === undefined;

  switch (msg.method) {
    case "initialize": {
      const requested = (msg.params?.protocolVersion as string) ?? PROTOCOL_VERSION;
      return result(msg.id!, {
        protocolVersion: requested,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }

    case "notifications/initialized":
      return null;

    case "ping":
      return isNotification ? null : result(msg.id!, {});

    case "tools/list":
      return result(msg.id!, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });

    case "tools/call": {
      const name = msg.params?.name as string | undefined;
      const args = (msg.params?.arguments as unknown) ?? {};
      const tool = name ? getTool(name) : undefined;
      if (!tool) return error(msg.id!, -32602, `Unknown tool: ${name}`);
      try {
        const out = await tool.handler(args);
        return result(msg.id!, {
          content: [{ type: "text", text: out.text }],
          structuredContent: out.structured,
          isError: out.isError ?? false,
        });
      } catch (err) {
        // Surface tool failures as an isError result (graceful degradation), not a protocol error.
        const message = err instanceof Error ? err.message : "Tool execution failed";
        return result(msg.id!, { content: [{ type: "text", text: message }], isError: true });
      }
    }

    default:
      if (isNotification) return null;
      return error(msg.id!, -32601, `Method not found: ${msg.method}`);
  }
}
