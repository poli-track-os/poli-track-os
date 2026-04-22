# MCP server

Poli-Track ships an MCP (Model Context Protocol) server that lets LLM agents query the same data the SPA and [API reference](API-Reference) expose — via named, schema-typed tools instead of ad-hoc HTTP calls.

## What MCP is

[Model Context Protocol](https://modelcontextprotocol.io/) is an open spec for connecting LLMs to external tools and data. A server declares three primitives:

- **Tools** — named functions with JSON-Schema input/output that the LLM can invoke.
- **Resources** — URI-addressable read-only data (e.g. `poli-track://politician/{uuid}`).
- **Prompts** — reusable investigative templates the server exposes to the host app as "suggested prompts".

An MCP client (Claude Desktop, Cursor, or a custom agent) connects once, sees the tool list, and then the model decides when to call which tool. No per-query scraping, no prompt-engineering a URL.

## Why a journalist or researcher would use it

The fastest way to answer "who lobbied X on Y" or "how did country Z spend on health relative to GDP over the last decade" is to connect Claude Desktop to Poli-Track once and then ask in plain language. The model calls `search_politicians`, `get_lobby_org`, and `get_budget` for you, and every result carries provenance (source URL, trust level, fetched-at timestamp) so the answer is auditable.

Concretely:

- You can ask "find current members of the ECON EP committee and summarise disclosed lobby meetings for each" and the LLM will fan out tool calls on its own.
- You can ask "compare DE and FR defence spend as a share of GDP in 2022" and get a table back with cited COFOG rows.
- Every response can be re-requested as Markdown, which is what the LLM feeds back into its own reasoning.

## Layout

The server lives at [mcp-server/](https://github.com/poli-track-os/poli-track-os/tree/main/mcp-server). Design doc: [API_MCP_PLAN.md](https://github.com/poli-track-os/poli-track-os/blob/main/API_MCP_PLAN.md). It is a thin wrapper — it does not re-implement data access, it calls the Layer 2/3 HTTP endpoints from [API reference](API-Reference) and adapts them to MCP.

## Tools

| Tool | Purpose | Wraps |
|---|---|---|
| `search_politicians({ query?, country?, party?, limit? })` | Type-ahead politician search | `/page/actors` |
| `get_politician({ id })` | Full composite profile (events, finances, investments, positions, associates, lobby meetings, country proposals) | `/page/actor/{id}` |
| `get_country({ code })` | Country dossier (politicians by party, proposals, budget, leadership) | `/page/country/{code}` |
| `search_proposals({ query?, country?, status?, area?, from?, to?, limit? })` | Proposal search with filters | `/page/proposals` |
| `get_proposal({ id })` | One proposal with sponsors, affected laws, linked events | `/page/proposal/{id}` |
| `get_budget({ country, year? })` | COFOG breakdown + demographics + per-capita / per-GDP | `/page/budget/{country}/{year?}` |
| `get_lobby_org({ transparency_id })` | One lobby org with spend history, meetings, linked politicians | `/page/lobby/{transparency_id}` |
| `get_entity_card({ kind, slug, format? })` | Canonical Markdown / JSON card for any entity | `/entity` |
| `search_entities({ query, kind?, limit? })` | Global cross-kind search | `/search` |
| `get_timeline({ subject_id?, event_type?, country?, from?, to?, limit? })` | Filtered `political_events` stream | `/timeline` |
| `get_voting_record({ politician_id })` | Votes + summary for one politician | (backed by Parltrack activities) |
| `get_committee_members({ name })` | Members of a given EP committee | (backed by `scrape-mep-committees`) |

Source files live under [mcp-server/src/tools/](https://github.com/poli-track-os/poli-track-os/tree/main/mcp-server/src/tools).

## Resources

URI-addressable, MIME-typed reads. The LLM picks `text/markdown` for cards and `application/json` for structured data.

```
poli-track://entity/person/{slug}              → Markdown card
poli-track://entity/party/{slug}               → Markdown card
poli-track://entity/country/{code}             → Markdown card
poli-track://entity/proposal/{slug}            → Markdown card
poli-track://entity/lobby_org/{slug}           → Markdown card

poli-track://politician/{uuid}                 → Full JSON (Layer 3)
poli-track://proposal/{uuid}                   → Full JSON
poli-track://country/{iso2}/budget/{year}      → Full JSON
poli-track://country/{iso2}/politicians        → Paginated politicians list

poli-track://timeline?subject_id={uuid}&from=  → Filtered events
poli-track://graph?seed={entity_id}&depth=2    → Graph slice
```

## Prompts

Reusable templates shipped with the server and surfaced in the LLM host as "suggested prompts":

- `investigate_politician({ name_or_id })`
- `compare_countries({ countries, topic })`
- `trace_money_flow({ lobby_org_name })`
- `find_committee_members({ committee })`

## Transports

Two ways to run the server:

- **stdio** — published as `@poli-track/mcp-server`. Drop one entry into `claude_desktop_config.json` and Claude Desktop / Cursor will launch it via `npx`. No HTTP server needed.
- **Streamable HTTP** — deployed as the `/functions/v1/mcp` Supabase edge function for remote agents that can't run a local process.

Claude Desktop config snippet:

```json
{
  "mcpServers": {
    "poli-track": {
      "command": "npx",
      "args": ["-y", "@poli-track/mcp-server"],
      "env": {
        "POLI_TRACK_API_BASE": "https://<project>.supabase.co/functions/v1",
        "POLI_TRACK_API_KEY": "optional"
      }
    }
  }
}
```

## Related pages

- [API reference](API-Reference) — the underlying HTTP surface each tool wraps.
- [Ingestion pipeline](Ingestion-Pipeline) — where the data these tools return comes from.
