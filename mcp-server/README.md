# @poli-track-os/mcp-server

Model Context Protocol server for [Poli-Track](https://github.com/poli-track-os/poli-track-os) — the open-source EU political data explorer.

Exposes 11 tools, 4 prompts, and 1 resource to any MCP-compatible LLM client (Claude Desktop, Cursor, VS Code Copilot via MCP extensions, custom agents). All data is public and read-only. The server is a thin wrapper over the [Poli-Track HTTP API](../docs/api.md); no database credentials are needed.

## Install

### Claude Desktop / Cursor (stdio)

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop. The `poli-track` server should appear with 11 tools and 4 prompts.

### Remote HTTP (Streamable HTTP transport)

If your MCP client supports remote HTTP servers, point it at:

```
https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1/mcp
```

Stateless, no auth required for reasonable volume.

## Tools

| Tool | Purpose |
|---|---|
| `search_politicians` | List politicians optionally filtered by country and name substring. |
| `get_politician` | Full dossier: events, finances, associates, lobby meetings, committees, country and party context. |
| `get_country` | Country composite: politicians by party, proposals, latest budget snapshot. |
| `search_proposals` | Unified proposals table filtered by country, status, policy area, text. |
| `get_proposal` | Full proposal detail with sponsors and related events. |
| `get_budget` | Eurostat COFOG budget snapshot for a country + year. |
| `get_lobby_org` | Lobby organisation detail: spend history + meetings. |
| `get_entity_card` | Canonical entity Markdown card (person, party, country, proposal, lobby_org, ...). |
| `search_entities` | Global search across the canonical graph. |
| `get_timeline` | Paginated keyset-sorted stream of political events. |
| `get_graph` | Bounded BFS graph slice rooted at a canonical entity. |

## Prompts

| Prompt | Purpose |
|---|---|
| `investigate_politician` | Assembles a dossier on one politician via multiple tool calls. |
| `compare_countries` | Side-by-side comparison on a named topic. |
| `trace_money_flow` | Lobby org → meetings → voting record chain of evidence. |
| `find_committee_members` | Current members of an EP or national committee with lobby context. |

## Development

```bash
cd mcp-server
npm install
npm run build
POLI_TRACK_API_BASE=https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1 node dist/stdio.js
```

The server reads MCP JSON-RPC frames from stdin and writes responses to stdout. Use [`@modelcontextprotocol/inspector`](https://github.com/modelcontextprotocol/inspector) to poke at it interactively.

## License

MIT. See [LICENSE](../LICENSE) in the parent repo.
