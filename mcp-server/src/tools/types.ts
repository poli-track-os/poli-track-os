import type { z } from "zod";
import type { ApiClient } from "../api-client.js";

// Shape every tool in the Poli-Track MCP server follows. Pure data so
// both the Node stdio transport and the Deno edge-function HTTP transport
// can consume the same definitions.
//
// A ToolDef is converted into an `McpServer.registerTool()` call by the
// Node entry point, and into a manual JSON-RPC `tools/list` + `tools/call`
// dispatch by the Deno edge function.

export interface ToolContext {
  api: ApiClient;
}

export interface ToolResult {
  // Deterministic Markdown string shown to the user and the model.
  text: string;
  // Structured JSON data. Matches the shape returned by the underlying
  // Layer 2/3 endpoint. Tools should return structured data so the LLM
  // can reason over the raw fields in addition to the Markdown summary.
  structured?: Record<string, unknown>;
  isError?: boolean;
}

export interface ToolDef<S extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  handler: (input: { [K in keyof S]: z.infer<S[K]> }, ctx: ToolContext) => Promise<ToolResult>;
}
