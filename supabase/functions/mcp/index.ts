// POST /functions/v1/mcp
//
// Stateless MCP Streamable HTTP endpoint. Implements a minimal subset of
// the JSON-RPC 2.0 surface so remote MCP clients (any agent that speaks
// Streamable HTTP) can list and call Poli-Track's tools without having
// to run the Node stdio binary locally.
//
// Why a hand-rolled router instead of @modelcontextprotocol/sdk? The
// SDK's StreamableHTTPServerTransport is written for Node's
// IncomingMessage/ServerResponse; Deno's Fetch-style Request/Response
// doesn't plug in cleanly, and the feature surface we need is small.
// Sessions, SSE streams, resumability, and tasks are all deferred —
// stateless JSON-only is enough for most agent use cases. Clients who
// want the rich SDK features can point Claude Desktop at the Node stdio
// binary instead.
//
// This file is INTENTIONALLY self-contained and does NOT import from the
// Node `mcp-server/` package. Deno can't resolve the `./types.js`
// extension-less imports that package uses, so we duplicate the tool
// registry here. That's fine — every tool is a thin passthrough around a
// Layer 2/3 endpoint, so there's very little real logic to duplicate.

import { CORS_HEADERS } from "../_shared/envelope.ts";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_NAME = "poli-track";
const SERVER_VERSION = "0.1.0";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResult {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

function ok(id: string | number | null, result: unknown): JsonRpcResult {
  return { jsonrpc: "2.0", id, result };
}
function err(id: string | number | null, code: number, message: string): JsonRpcError {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// ----------------------------------------------------------------------
// Tool registry — declarative. Each tool maps arguments to an API call.
// ----------------------------------------------------------------------

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // Given the parsed arguments, returns the path + query params to call.
  // The router then fetches the envelope and wraps it in an MCP tool result.
  plan: (args: Record<string, unknown>) => { path: string; query?: Record<string, unknown>; accept?: string };
}

function uuidSchema(description = "UUID primary key") {
  return { type: "string", format: "uuid", description };
}
function iso2Schema(description = "ISO-3166 alpha-2 country code") {
  return { type: "string", minLength: 2, maxLength: 2, description };
}

const TOOLS: ToolDef[] = [
  {
    name: "search_politicians",
    title: "Search politicians",
    description:
      "List politicians (MEPs and national parliamentarians) optionally filtered by country and name substring. Returns a paginated array of politician summaries.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Substring to match against politician name." },
        country: iso2Schema(),
        limit: { type: "integer", minimum: 1, maximum: 200, default: 20 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
    },
    plan: (a) => ({
      path: "/page/actors",
      query: {
        query: a.query,
        country: typeof a.country === "string" ? a.country.toUpperCase() : undefined,
        limit: a.limit,
        offset: a.offset,
      },
    }),
  },
  {
    name: "get_politician",
    title: "Get politician dossier",
    description:
      "Return the full dossier for one politician: biographical fields, recent events, finances, investments, associates, lobby meetings, committees, country and party context.",
    inputSchema: {
      type: "object",
      properties: { id: uuidSchema("Politician UUID") },
      required: ["id"],
    },
    plan: (a) => ({ path: `/page/actor/${encodeURIComponent(String(a.id))}` }),
  },
  {
    name: "get_country",
    title: "Get country dossier",
    description:
      "Return a composite country page: metadata, politicians by party, party metadata, recent proposals, latest budget snapshot.",
    inputSchema: {
      type: "object",
      properties: { code: iso2Schema() },
      required: ["code"],
    },
    plan: (a) => ({ path: `/page/country/${encodeURIComponent(String(a.code).toUpperCase())}` }),
  },
  {
    name: "search_proposals",
    title: "Search parliamentary proposals",
    description:
      "Search the unified proposals table (EP legislation, national bills, motions) filtered by country, status, policy area, and text.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        country: iso2Schema(),
        status: { type: "string", description: "consultation|committee|plenary|adopted|rejected|withdrawn|pending_vote" },
        area: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 30 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
    },
    plan: (a) => ({
      path: "/page/proposals",
      query: {
        query: a.query,
        country: typeof a.country === "string" ? a.country.toUpperCase() : undefined,
        status: a.status,
        area: a.area,
        limit: a.limit,
        offset: a.offset,
      },
    }),
  },
  {
    name: "get_proposal",
    title: "Get proposal detail",
    description:
      "Return full detail for a single parliamentary proposal: title, status, sponsors, affected laws, submission/vote dates, source URL.",
    inputSchema: {
      type: "object",
      properties: { id: uuidSchema() },
      required: ["id"],
    },
    plan: (a) => ({ path: `/page/proposal/${encodeURIComponent(String(a.id))}` }),
  },
  {
    name: "get_budget",
    title: "Get country budget snapshot",
    description:
      "Eurostat COFOG snapshot for a country and year: total spend, per-function breakdown, time series, demographics.",
    inputSchema: {
      type: "object",
      properties: {
        country: iso2Schema(),
        year: { type: "integer", minimum: 2000, maximum: 2100 },
      },
      required: ["country"],
    },
    plan: (a) => ({
      path: `/page/budget/${encodeURIComponent(String(a.country).toUpperCase())}`,
      query: { year: a.year },
    }),
  },
  {
    name: "get_lobby_org",
    title: "Get lobby organisation",
    description:
      "Lobby organisation detail: declared category, declared annual spend history, meetings with politicians. Sourced from LobbyFacts / EU Transparency Register.",
    inputSchema: {
      type: "object",
      properties: { transparency_id: { type: "string", description: "EU Transparency Register ID." } },
      required: ["transparency_id"],
    },
    plan: (a) => ({ path: `/page/lobby/${encodeURIComponent(String(a.transparency_id))}` }),
  },
  {
    name: "get_entity_card",
    title: "Get canonical entity card",
    description:
      "Deterministic Markdown + JSON card for one canonical entity: aliases, claims, incoming and outgoing relationships, recent events.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["person", "party", "country", "proposal", "committee", "lobby_org", "institution"],
        },
        slug: { type: "string" },
      },
      required: ["kind", "slug"],
    },
    plan: (a) => ({
      path: "/entity",
      query: { kind: a.kind, slug: a.slug, format: "markdown" },
      accept: "text/markdown",
    }),
  },
  {
    name: "search_entities",
    title: "Search the canonical graph",
    description:
      "Global search over canonical entities and their aliases (Wikidata QIDs, MEP IDs, ISO codes, ...). Returns ranked hits.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 2 },
        kind: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      required: ["query"],
    },
    plan: (a) => ({
      path: "/search",
      query: { q: a.query, kind: a.kind, limit: a.limit },
    }),
  },
  {
    name: "get_timeline",
    title: "Get political event timeline",
    description:
      "Paginated, keyset-sorted stream of political events (speeches, votes, committee reports, press, social media) filtered by any combination of subject, country, type, and date range.",
    inputSchema: {
      type: "object",
      properties: {
        subject_id: uuidSchema("Filter by politician UUID"),
        country: iso2Schema(),
        event_type: { type: "string" },
        from: { type: "string", description: "ISO date lower bound, inclusive." },
        to: { type: "string", description: "ISO date upper bound, inclusive." },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        cursor: { type: "string", description: "Opaque keyset cursor from a previous response." },
      },
    },
    plan: (a) => ({ path: "/timeline", query: { ...a } }),
  },
  {
    name: "get_graph",
    title: "Get graph slice",
    description:
      "Bounded BFS graph slice rooted at a canonical entity. Traverses outgoing and incoming relationships up to `depth`.",
    inputSchema: {
      type: "object",
      properties: {
        seed: uuidSchema("Entity UUID"),
        depth: { type: "integer", minimum: 1, maximum: 3, default: 1 },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
        predicates: { type: "string", description: "Comma-separated list of relationship predicates." },
      },
      required: ["seed"],
    },
    plan: (a) => ({ path: "/graph", query: { ...a } }),
  },
];

// ----------------------------------------------------------------------
// Prompts — declarative. Each returns a static user-message template.
// ----------------------------------------------------------------------

interface PromptDef {
  name: string;
  title: string;
  description: string;
  arguments: Array<{ name: string; description?: string; required?: boolean }>;
  render: (args: Record<string, string>) => string;
}

const PROMPTS: PromptDef[] = [
  {
    name: "investigate_politician",
    title: "Investigate a politician",
    description:
      "Assemble a dossier on one politician: committee assignments, lobby meetings, voting record, reputational signals.",
    arguments: [{ name: "name_or_id", description: "Politician name or UUID.", required: true }],
    render: ({ name_or_id }) =>
      [
        `Investigate the politician "${name_or_id}".`,
        "",
        "1. If the input isn't a UUID, call `search_politicians` to resolve it.",
        "2. Call `get_politician` and read events, lobby_meetings, finances, associates.",
        "3. For the top 3 lobby orgs they met with, call `get_lobby_org`.",
        "4. Produce a 1-page Markdown briefing with inline citations to `source_url` fields.",
      ].join("\n"),
  },
  {
    name: "compare_countries",
    title: "Compare countries on a topic",
    description: "Side-by-side comparison of countries on a named topic.",
    arguments: [
      { name: "countries", description: "Comma-separated ISO-2 codes, e.g. DE,FR,PT", required: true },
      { name: "topic", description: "Topic focus (budget|proposals|lobbying|policy area)", required: true },
    ],
    render: ({ countries, topic }) =>
      [
        `Compare countries [${countries}] on "${topic}".`,
        "",
        "For each country call `get_country`. If the topic is budget-related, also call `get_budget`. If legislative, call `search_proposals`.",
        "Return a Markdown table comparing 3-5 metrics plus a short prose summary.",
      ].join("\n"),
  },
  {
    name: "trace_money_flow",
    title: "Trace a lobby organisation's influence",
    description: "Follow the chain: lobby org → declared spend → meetings → votes.",
    arguments: [{ name: "lobby_org", description: "Org name or transparency ID.", required: true }],
    render: ({ lobby_org }) =>
      [
        `Trace money flow for "${lobby_org}".`,
        "",
        "1. If not already a transparency ID, call `search_entities` with kind=lobby_org.",
        "2. Call `get_lobby_org` and read spend_history and meetings.",
        "3. For the top 5 politicians they met, call `get_politician` and `get_timeline`.",
        "4. Produce a chain-of-evidence Markdown report with inline URL citations.",
      ].join("\n"),
  },
  {
    name: "find_committee_members",
    title: "Find committee members",
    description: "Current members of an EP or national committee with lobby context.",
    arguments: [{ name: "committee", description: "Committee name or acronym.", required: true }],
    render: ({ committee }) =>
      [
        `Find current members of committee "${committee}".`,
        "",
        "1. Call `search_politicians` to find those whose committees field includes the name.",
        "2. For each, call `get_politician` for lobby_meetings + recent events.",
        "3. Return a Markdown table: name, country, party, lobby meeting count, one-line summary.",
      ].join("\n"),
  },
];

// ----------------------------------------------------------------------
// Dispatcher
// ----------------------------------------------------------------------

async function callApi(
  apiBase: string,
  path: string,
  query: Record<string, unknown> | undefined,
  accept: string,
): Promise<{ ok: boolean; body: unknown; status: number }> {
  const url = new URL(apiBase.replace(/\/+$/, "") + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), { headers: { Accept: accept } });
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/markdown")) {
    const text = await res.text();
    return { ok: res.ok, body: { markdown: text }, status: res.status };
  }
  try {
    const json = await res.json();
    return { ok: res.ok, body: json, status: res.status };
  } catch {
    return { ok: false, body: { error: { code: "BAD_RESPONSE", message: "Non-JSON response" } }, status: res.status };
  }
}

function renderToolResult(toolName: string, apiBody: unknown, markdown: boolean): {
  content: Array<{ type: string; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
} {
  if (markdown && apiBody && typeof apiBody === "object" && "markdown" in (apiBody as Record<string, unknown>)) {
    return {
      content: [{ type: "text", text: String((apiBody as { markdown: string }).markdown) }],
      structuredContent: apiBody as Record<string, unknown>,
    };
  }
  // JSON payload: surface the data field if envelope-shaped, else the whole body.
  const env = apiBody as { ok?: boolean; data?: unknown; error?: { message?: string } };
  if (env && env.ok === false) {
    return {
      content: [{ type: "text", text: `Error: ${env.error?.message ?? "unknown"}` }],
      isError: true,
    };
  }
  const data = (env && "data" in env ? env.data : env) as unknown;
  const text = "```json\n" + JSON.stringify(data, null, 2) + "\n```";
  return { content: [{ type: "text", text }], structuredContent: data as Record<string, unknown> };
}

async function handleRpc(req: JsonRpcRequest, apiBase: string): Promise<JsonRpcResult | JsonRpcError> {
  switch (req.method) {
    case "initialize":
      return ok(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          prompts: { listChanged: false },
          resources: { listChanged: false, subscribe: false },
        },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });

    case "notifications/initialized":
    case "ping":
      return ok(req.id, {});

    case "tools/list":
      return ok(req.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const p = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      if (!p.name) return err(req.id, -32602, "tools/call: 'name' is required");
      const tool = TOOLS.find((t) => t.name === p.name);
      if (!tool) return err(req.id, -32601, `unknown tool: ${p.name}`);
      try {
        const plan = tool.plan(p.arguments ?? {});
        const accept = plan.accept ?? "application/json";
        const r = await callApi(apiBase, plan.path, plan.query, accept);
        const result = renderToolResult(tool.name, r.body, accept.includes("markdown"));
        return ok(req.id, result);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return ok(req.id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    case "prompts/list":
      return ok(req.id, {
        prompts: PROMPTS.map((p) => ({
          name: p.name,
          title: p.title,
          description: p.description,
          arguments: p.arguments,
        })),
      });

    case "prompts/get": {
      const p = (req.params ?? {}) as { name?: string; arguments?: Record<string, string> };
      if (!p.name) return err(req.id, -32602, "prompts/get: 'name' is required");
      const prompt = PROMPTS.find((x) => x.name === p.name);
      if (!prompt) return err(req.id, -32601, `unknown prompt: ${p.name}`);
      return ok(req.id, {
        description: prompt.description,
        messages: [
          {
            role: "user",
            content: { type: "text", text: prompt.render(p.arguments ?? {}) },
          },
        ],
      });
    }

    case "resources/list":
      return ok(req.id, {
        resources: [
          {
            uri: "poli-track://api-info",
            name: "Poli-Track API info",
            description: "Base URL, version, and a short description of the API.",
            mimeType: "application/json",
          },
        ],
      });

    case "resources/read": {
      const p = (req.params ?? {}) as { uri?: string };
      if (p.uri === "poli-track://api-info") {
        return ok(req.id, {
          contents: [
            {
              uri: p.uri,
              mimeType: "application/json",
              text: JSON.stringify({
                name: "Poli-Track",
                version: SERVER_VERSION,
                docs: "https://github.com/poli-track-os/poli-track-os/blob/main/docs/api.md",
              }),
            },
          ],
        });
      }
      return err(req.id, -32601, `unknown resource: ${p.uri}`);
    }

    default:
      return err(req.id, -32601, `method not implemented: ${req.method}`);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed — POST only" } }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const apiBase =
    Deno.env.get("POLI_TRACK_API_BASE") ??
    `${new URL(request.url).origin}/functions/v1`;

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify(err(null, -32700, "Parse error")), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const batch = Array.isArray(body) ? body : [body];
  const results = await Promise.all(batch.map((r) => handleRpc(r, apiBase)));

  const replies = results.filter((r) => r.id !== null);
  const out = Array.isArray(body) ? replies : replies[0] ?? null;
  return new Response(JSON.stringify(out), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
