# Poli-Track MCP Server

> **Status**: pre-alpha. Tools are stable; transports may churn.

The Poli-Track MCP server gives any [Model Context Protocol](https://modelcontextprotocol.io/) client direct access to the Poli-Track dataset via a small set of typed, schema-validated tools. Claude Desktop, Cursor, VS Code Copilot (with MCP extension), and custom agents can all use it.

Data access is public and read-only. The server is a thin wrapper around the [Poli-Track HTTP API](./api.md); no database credentials are needed.

---

## Two ways to run it

### 1. stdio — local binary (recommended for Claude Desktop / Cursor)

The stdio transport runs Poli-Track as a child process of your MCP client. Zero network overhead, no public endpoint, and the client manages the lifecycle.

Install via npm (publishing pending):

```bash
npm install -g @poli-track-os/mcp-server
```

Or use `npx` (no install):

```bash
npx -y @poli-track-os/mcp-server
```

Configure **Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "poli-track": {
      "command": "npx",
      "args": ["-y", "@poli-track-os/mcp-server"],
      "env": {
        "POLI_TRACK_API_BASE": "https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1"
      }
    }
  }
}
```

Restart Claude Desktop. The `poli-track` server should appear in the MCP menu with 11 tools, 4 prompts, and 1 resource.

Configure **Cursor** — add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "poli-track": {
      "command": "npx",
      "args": ["-y", "@poli-track-os/mcp-server"],
      "env": { "POLI_TRACK_API_BASE": "https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1" }
    }
  }
}
```

### 2. Streamable HTTP — remote endpoint

If your MCP client supports remote servers, point it at:

```
https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1/mcp
```

The endpoint is a stateless JSON-RPC 2.0 surface (no sessions, no SSE). Features supported: `initialize`, `tools/list`, `tools/call`, `prompts/list`, `prompts/get`, `resources/list`, `resources/read`, `ping`. Authentication is optional; set `Authorization: Bearer <api_key>` only if you have a maintainer-issued key.

---

## Tools

All tools return both a Markdown summary (for the model to read) and `structuredContent` (the raw envelope from the underlying API, so downstream code can consume the typed fields).

| Tool | Input | Purpose |
|---|---|---|
| `search_politicians` | `query?`, `country?`, `limit?`, `offset?` | Paginated politicians list. |
| `get_politician` | `id` | Full dossier (events, finances, associates, lobby meetings, committees, country, party). |
| `get_country` | `code` | Country composite (politicians by party, proposals, budget). |
| `search_proposals` | `query?`, `country?`, `status?`, `area?`, `limit?`, `offset?` | Unified proposals list. |
| `get_proposal` | `id` | Proposal detail with sponsors + related events. |
| `get_budget` | `country`, `year?` | Eurostat COFOG snapshot. |
| `get_lobby_org` | `transparency_id` | Lobby org with spend history + meetings. |
| `get_entity_card` | `kind`, `slug` | Canonical entity Markdown card. |
| `search_entities` | `query`, `kind?`, `limit?` | Global search across the canonical graph. |
| `get_timeline` | `subject_id?`, `country?`, `event_type?`, `from?`, `to?`, `limit?`, `cursor?` | Keyset-paginated event stream. |
| `get_graph` | `seed`, `depth?`, `limit?`, `predicates?` | BFS slice rooted at an entity. |

Source files live in [`mcp-server/src/tools/`](../mcp-server/src/tools/). Each tool is a thin wrapper over one Layer 2/3 HTTP endpoint — no data access logic inside the MCP server itself.

---

## Prompts

Reusable investigative templates that appear in the client's "suggested prompts" menu.

| Prompt | Arguments | What it does |
|---|---|---|
| `investigate_politician` | `name_or_id` | Assembles a 1-page briefing: committees, lobby relationships, recent events. |
| `compare_countries` | `countries`, `topic` | Side-by-side Markdown comparison table. |
| `trace_money_flow` | `lobby_org` | Lobby org → meetings → votes chain of evidence. |
| `find_committee_members` | `committee` | Current committee members with lobby context. |

Each prompt emits a structured system message that tells the model which tools to call in which order. See [`mcp-server/src/prompts.ts`](../mcp-server/src/prompts.ts).

---

## Example session

**User**: "Give me a briefing on MEP Jane Example."

The agent:
1. Calls `search_politicians({ query: "Jane Example" })` → gets the UUID.
2. Calls `get_politician({ id: "<uuid>" })` → reads events, lobby meetings, finances in one round trip.
3. For each of the top 3 lobby orgs they met with, calls `get_lobby_org({ transparency_id: "..." })` to see declared spend.
4. Writes a 200-word markdown briefing with inline citations to `source_url` fields.

All four API round trips complete in well under a second because the per-page aggregator is a single SQL fan-out.

---

## Running locally

```bash
git clone https://github.com/poli-track-os/poli-track-os.git
cd poli-track-os/mcp-server
npm install
npm run build
POLI_TRACK_API_BASE=https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1 node dist/stdio.js
```

Or in dev mode with hot reload:

```bash
POLI_TRACK_API_BASE=https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1 npx tsx src/stdio.ts
```

Point a local MCP client at the binary. The [`@modelcontextprotocol/inspector`](https://github.com/modelcontextprotocol/inspector) tool is the easiest way to poke at tools interactively:

```bash
npx @modelcontextprotocol/inspector node dist/stdio.js
```

---

## Data quality and trust

Every tool response includes a `provenance` array from the underlying API. Use `trust_level` to decide how much weight to put on any given field:

1. **Official record** — parliament/commission/transparency register
2. **Reputable aggregator** — Parltrack, LobbyFacts, curated Wikipedia
3. **Community curation** — auto-imported Wikipedia, press RSS
4. **LLM extraction** — structured output from Claude over raw text

The server does not filter responses by trust level — it surfaces everything and lets the caller decide. When building agents that act on this data (e.g. publishing briefings), we recommend requiring trust level ≤ 2 for any factual claim.

---

## Known limitations

- **No write surface.** There is no way to submit corrections via MCP. File an issue at [github.com/poli-track-os/poli-track-os](https://github.com/poli-track-os/poli-track-os) instead.
- **No sampling / elicitation.** The server doesn't ask the client to run completions or request input.
- **Stateless only.** The Streamable HTTP transport does not currently support sessions or SSE — every request is independent. Upgrade to the SDK's stateful transport is planned for when we need resumability.
- **No realtime.** Poli-Track is batch-updated; subscribe to the [releases RSS](https://github.com/poli-track-os/poli-track-os/releases.atom) if you want change notifications.

---

## Related

- [Poli-Track HTTP API](./api.md) — the underlying HTTP surface this server wraps.
- [`mcp-server/README.md`](../mcp-server/README.md) — package-level install instructions.
- [`API_MCP_PLAN.md`](../API_MCP_PLAN.md) — the design doc this implementation follows.
- [Model Context Protocol spec](https://modelcontextprotocol.io/specification)
