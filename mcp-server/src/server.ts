// Factory that produces a fully-registered McpServer. Used by:
//   - src/stdio.ts  (Node stdio binary for Claude Desktop / Cursor)
//   - the future remote HTTP transport (Deno edge function or any Node host)
//
// The Node-side transport is the only thing that differs between the
// local binary and a remote deployment — tools, prompts, and resources
// are all identical.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiClient } from "./api-client.js";
import { ALL_TOOLS } from "./tools/index.js";
import { ALL_PROMPTS } from "./prompts.js";

export interface CreateServerOptions {
  apiBase: string;
  apiKey?: string;
  name?: string;
  version?: string;
}

export function createServer(options: CreateServerOptions): McpServer {
  const api = new ApiClient({ baseUrl: options.apiBase, apiKey: options.apiKey });
  const server = new McpServer(
    {
      name: options.name ?? "poli-track",
      version: options.version ?? "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
      },
    },
  );

  for (const tool of ALL_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, never>,
      },
      async (input: Record<string, unknown>) => {
        try {
          const result = await tool.handler(input as never, { api });
          return {
            content: [{ type: "text", text: result.text }],
            ...(result.structured ? { structuredContent: result.structured } : {}),
            ...(result.isError ? { isError: true } : {}),
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text", text: `Error: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }

  for (const prompt of ALL_PROMPTS) {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
        argsSchema: prompt.argsSchema as Record<string, never>,
      },
      (args: Record<string, string>) => prompt.handler(args),
    );
  }

  // Static resource that describes the API itself. Clients can read this
  // to discover the base URL and the list of available pages without
  // calling a tool.
  server.registerResource(
    "poli-track-api-info",
    "poli-track://api-info",
    {
      title: "Poli-Track API info",
      description: "Base URL, version, and a short description of the Poli-Track HTTP API.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "poli-track://api-info",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              name: "Poli-Track",
              version: options.version ?? "0.1.0",
              api_base: options.apiBase,
              docs: "https://github.com/poli-track-os/poli-track-os/blob/main/docs/api.md",
              mcp_docs: "https://github.com/poli-track-os/poli-track-os/blob/main/docs/mcp.md",
              notes:
                "Public read API. Rate-limited by IP. Use get_entity_card for LLM-optimized Markdown renderings of any canonical entity.",
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  return server;
}
