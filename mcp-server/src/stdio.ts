#!/usr/bin/env node
// stdio binary entry for `@poli-track-os/mcp-server`.
//
// Invoked by Claude Desktop / Cursor / any MCP client via:
//   npx -y @poli-track-os/mcp-server
// with POLI_TRACK_API_BASE in the environment.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const apiBase = process.env.POLI_TRACK_API_BASE;
if (!apiBase) {
  console.error(
    "POLI_TRACK_API_BASE is required. Example:\n" +
      "  POLI_TRACK_API_BASE=https://<project>.supabase.co/functions/v1 npx @poli-track-os/mcp-server",
  );
  process.exit(1);
}

const server = createServer({
  apiBase,
  apiKey: process.env.POLI_TRACK_API_KEY,
  name: "poli-track",
  version: process.env.npm_package_version ?? "0.1.0",
});

const transport = new StdioServerTransport();
server.connect(transport).then(
  () => {
    // Intentionally silent — stdout is reserved for MCP JSON-RPC frames.
    console.error("[poli-track-mcp] stdio transport connected");
  },
  (err: unknown) => {
    console.error("[poli-track-mcp] failed to start:", err);
    process.exit(1);
  },
);

process.on("SIGINT", () => {
  void server.close().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void server.close().finally(() => process.exit(0));
});
