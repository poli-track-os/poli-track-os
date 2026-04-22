# API & MCP Access Plan

> **Status**: planning doc, not yet executed.
> **Owner**: @poli-track-os maintainers.
> **Last revised**: 2026-04-15.

This document specifies how to expose **every piece of data and every per-page
output** in Poli-Track via two complementary surfaces:

1. A **machine-readable HTTP API** — stable, versioned, typed, cacheable,
   public by default.
2. An **MCP server** (Model Context Protocol) — so LLM agents (Claude
   Desktop, Cursor, ChatGPT plugins, custom agents) can query Poli-Track as
   a first-class tool.

The goal: anything a human can see by clicking around the website, an
automated consumer can fetch with one or two calls and a stable URI.

---

## 1. Success criteria

A. **Parity with the frontend.** For every route the SPA has, there is an
   API endpoint that returns the same composite data shape. A consumer can
   reconstruct the view without running any React code.

B. **One-call per-page.** The big pages (ActorDetail, CountryDetail,
   Budgets) return fully-populated responses. No N+1 round trips required.

C. **MCP-compliant.** The MCP server works in Claude Desktop via stdio AND
   as a remote Streamable HTTP endpoint. Tools, resources, and prompts are
   all exposed.

D. **Typed client out of the box.** An auto-generated TypeScript client
   package gives consumers end-to-end types for every endpoint.

E. **Public by default, rate-limited at the edge.** No API key required for
   reasonable read volumes. Heavy consumers get a key.

F. **Every response carries provenance.** Trust level, source URL, fetched-
   at timestamp, schema version.

G. **Idempotent, cacheable.** Pure GET endpoints with `Cache-Control` and
   `ETag` so a CDN can front the whole thing.

---

## 2. What's already free today

Before we build anything, it's important to name what Supabase already gives
us, because we shouldn't re-invent it:

### 2.1 PostgREST — raw table access
- **URL**: `https://{project}.supabase.co/rest/v1/{table}`
- **Auth**: `apikey: {publishable_key}` header (public read-only).
- **Features**: filters (`?country_code=eq.DE`), embeds (`select=*,politicians(*)`),
  ordering, pagination, full-text search on indexed columns, insertion
  (with service role), upsert on conflict.
- **Tables exposed today**: everything under `public.*` — `politicians`,
  `political_events`, `politician_finances`, `politician_investments`,
  `politician_positions`, `politician_associations`, `proposals`,
  `country_metadata`, `country_demographics`, `government_expenditure`,
  `cofog_functions`, `lobby_organisations`, `lobby_spend`, `lobby_meetings`,
  `entities`, `entity_aliases`, `relationships`, `claims`, `sources`,
  `raw_tweets`, `scrape_runs`.
- **Gaps**:
  - No composition — consumers have to do N+1.
  - No discoverability — there's no OpenAPI / GraphQL schema to point an
    LLM at.
  - No rate limiting beyond Supabase's platform defaults.
  - No provenance envelope around responses.

### 2.2 pg_graphql — GraphQL (Supabase built-in, often disabled by default)
- **URL**: `https://{project}.supabase.co/graphql/v1`
- **Enable via**: `CREATE EXTENSION IF NOT EXISTS pg_graphql;` (migration M-200)
- **Features**: schema auto-generated from the database, type-safe, one
  endpoint, clients compose their own queries, supports cursors and nested
  embeds.
- **Why we want it**: It's basically free compared to the effort of building
  an OpenAPI API. Enables third-party tooling (Apollo, urql, relay) to
  connect natively.
- **Why it's not enough**: Still raw-table oriented; no server-side
  composition for the page-level views; less discoverable to LLMs than
  named tools.

### 2.3 Supabase Realtime — change feed (NOT in scope for this plan)
- Poli-Track is a read-heavy, batch-updated platform. Realtime is not worth
  the complexity for now. Explicitly out of scope.

### 2.4 One custom edge function exists today
- **`entity`** — returns a Markdown card for a single entity at
  `GET /functions/v1/entity?kind={kind}&slug={slug}&format=markdown|json`.
  This is the PROTOTYPE for the shape we'll use for all page endpoints.

---

## 3. Architecture

### 3.1 Three-layer API stack

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3: Per-page aggregators                                   │
│   /functions/v1/page/actor/{id}                                 │
│   /functions/v1/page/country/{code}                             │
│   /functions/v1/page/proposal/{id}                              │
│   /functions/v1/page/budget/{country}/{year}                    │
│   ...                                                           │
│                                                                 │
│ Composite views. Built on top of Layer 1+2. Returns the same    │
│ data shapes the React pages need, plus a stable envelope.       │
└─────────────────────────────────────────────────────────────────┘
                              ↓ reads from
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2: Canonical entity + graph API                           │
│   /functions/v1/entity?kind=...&slug=...      (Markdown + JSON) │
│   /functions/v1/graph?seed=...&depth=2        (nodes + edges)   │
│   /functions/v1/timeline?subject_id=...&from=...&to=...         │
│   /functions/v1/search?q=...&kind=...         (global search)   │
│                                                                 │
│ Works on the canonical graph tables: entities,                  │
│ relationships, claims. Kind-agnostic.                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓ reads from
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: Raw data                                               │
│   /rest/v1/{table}       (PostgREST — already free)             │
│   /graphql/v1            (pg_graphql — enable via migration)    │
│                                                                 │
│ Direct table access. Use when Layer 2/3 doesn't fit.            │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 MCP server shape

```
┌─────────────────────────────────────────────────────────────────┐
│ MCP server (mcp-server/)                                        │
│                                                                 │
│ Runs two ways:                                                  │
│   1. stdio binary — for Claude Desktop, Cursor, local agents   │
│      invoked via `npx @poli-track/mcp-server` or a single      │
│      entry in `claude_desktop_config.json`                     │
│   2. Streamable HTTP endpoint — for remote agents, deployed as │
│      `/functions/v1/mcp` (Supabase edge function)              │
│                                                                 │
│ Backed by: the same Layer 2/3 HTTP API above. The MCP server    │
│ is a THIN wrapper — it does not re-implement data access, it    │
│ calls /functions/v1/page/*, /entity, /graph, /timeline, etc.    │
│ and adapts them to the MCP tool/resource/prompt spec.           │
│                                                                 │
│ Primitives:                                                     │
│   • Tools     → named, schema-typed, LLM-invokable functions   │
│   • Resources → URIs the LLM can fetch (entity cards, pages)    │
│   • Prompts   → reusable investigative templates                │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Response envelope (applies to every Layer 2/3 endpoint)

Every response follows one of two shapes. Content negotiation via the
`Accept` header:

**`Accept: application/json`** (default):
```json
{
  "ok": true,
  "data": { /* page-specific payload */ },
  "meta": {
    "fetched_at": "2026-04-15T13:42:00Z",
    "schema_version": "1",
    "cache_ttl_seconds": 300,
    "row_counts": { "politicians": 1, "events": 42, "lobby_meetings": 3 }
  },
  "provenance": [
    { "kind": "politician", "id": "...", "source_url": "https://www.europarl...", "data_source": "eu_parliament", "trust_level": 1 },
    { "kind": "events",     "source_url": "https://parltrack.org/meps/12345", "data_source": "parltrack", "trust_level": 1 }
  ]
}
```

**`Accept: text/markdown`**:
Same data, rendered as a deterministic Markdown document (same shape as the
existing `entity` endpoint). Optimized for LLM prompts.

**Errors** (any content type):
```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "No politician with id=...",
    "http_status": 404
  },
  "meta": { "fetched_at": "..." }
}
```

---

## 4. Per-page endpoint inventory

One endpoint per SPA route. Same data shape the React hook tree assembles,
flattened into one response.

| SPA route | Endpoint | Primary joins | Notes |
|---|---|---|---|
| `/` | `GET /functions/v1/page/home` | recent politicians (top 12 by updated_at), country stats, top 5 proposals, top 10 countries by coverage | Drives the landing page. Cached 5 min. |
| `/explore` | `GET /functions/v1/page/explore` | country stats grouped by continent, top N politicians per country | Cached 15 min. |
| `/country/:code` | `GET /functions/v1/page/country/{code}` | country metadata, politicians grouped by party, proposals, leadership entries, budget snapshot (latest year) | The ActorDetail-class endpoint for countries. |
| `/country/:countryId/party/:partyId` | `GET /functions/v1/page/party/{country}/{party}` | politicians in party, proposals, party metadata, top committees | |
| `/actors` | `GET /functions/v1/page/actors?country=&query=&limit=&offset=` | paginated politician list with country/party filters | List view. |
| `/actors/:id` | `GET /functions/v1/page/actor/{id}` | **the big one** — politician + events + finances + investments + positions + associates + lobby meetings + country proposals + wikipedia fallback + committees (with EP URLs) + source attribution | Should be the canonical reference for "everything about a politician". |
| `/proposals` | `GET /functions/v1/page/proposals?country=&status=&area=&limit=&offset=` | paginated proposals with filters + stats sidebar | |
| `/proposals/:id` | `GET /functions/v1/page/proposal/{id}` | proposal + sponsor politicians (resolved to entities) + affected laws + country | |
| `/relationships` | `GET /functions/v1/page/relationships?country=&view=clusters\|tree\|connections` | positions grouped by ideology family, country breakdown, party alliances | |
| `/data` | `GET /functions/v1/page/data` | coverage ledger, stats by country/status/area, demographics, aggregates | Heavy; cached 30 min. |
| `/budgets` | `GET /functions/v1/page/budget/{country}/{year?}` | government_expenditure for country/year + demographics + cross-country health comparison | |
| `/lobby` | `GET /functions/v1/page/lobby?limit=&search=` | top lobby orgs by declared spend | |
| `/lobby/:transparencyId` | `GET /functions/v1/page/lobby/{transparency_id}` | one org with full spend history + meetings + entity card | New — currently no SPA route for per-org detail. |
| `/timeline` | `GET /functions/v1/page/timeline?type=&source=&country=&subject_id=&from=&to=&page=` | paginated political_events with filters | Same shape Timeline.tsx uses. |

Plus the **canonical graph** endpoints (Layer 2) which cut across all routes:

| Endpoint | Purpose |
|---|---|
| `GET /functions/v1/entity?kind=&slug=&format=markdown\|json` | Already built. Canonical entity card. |
| `GET /functions/v1/search?q=&kind=&limit=` | Global search across entities (with type-ahead shape). |
| `GET /functions/v1/graph?seed=&depth=1\|2\|3&predicates=...` | Returns `{nodes, edges}` for force-directed rendering. |
| `GET /functions/v1/timeline?subject_id=&predicate=&from=&to=` | Filtered event stream. Overlaps with `/page/timeline` but cross-entity. |
| `GET /functions/v1/claim?entity_id=&key=` | All claims about one fact, across sources and trust levels. |

---

## 5. MCP server — concrete design

### 5.1 Project layout

```
mcp-server/
├── package.json                # @poli-track/mcp-server, published to npm
├── src/
│   ├── server.ts               # MCP server entry, creates Server instance
│   ├── transports/
│   │   ├── stdio.ts            # bin entry for `npx @poli-track/mcp-server`
│   │   └── http.ts             # handler used by /functions/v1/mcp edge fn
│   ├── api-client.ts           # thin wrapper around fetch() + base URL
│   ├── tools/
│   │   ├── search-politicians.ts
│   │   ├── get-politician.ts
│   │   ├── get-country.ts
│   │   ├── get-proposal.ts
│   │   ├── get-budget.ts
│   │   ├── get-lobby-org.ts
│   │   ├── get-entity-card.ts
│   │   ├── search-entities.ts
│   │   └── get-timeline.ts
│   ├── resources/
│   │   ├── entity.ts           # poli-track://entity/{kind}/{slug}
│   │   ├── politician.ts       # poli-track://politician/{id}
│   │   ├── proposal.ts         # poli-track://proposal/{id}
│   │   ├── country.ts          # poli-track://country/{code}
│   │   └── budget.ts           # poli-track://country/{code}/budget/{year}
│   └── prompts/
│       ├── investigate-politician.ts
│       ├── compare-countries.ts
│       ├── trace-money-flow.ts
│       └── find-committee-members.ts
└── README.md                   # install + Claude Desktop config snippet
```

### 5.2 Tools (full list with signatures)

Tools are JSON-schema-typed. The SDK handles validation; we just declare them.

```typescript
// Name                      Input schema                        Returns
search_politicians({         query?: string,                     { results: PoliticianSummary[] }
                             country?: ISO2,
                             party?: string,
                             limit?: number (default 20) })

get_politician({ id: UUID })  → { politician, events, finances, associates, lobby_meetings, ... }

get_country({ code: ISO2 })   → { country, politicians_by_party, proposals, budget, leadership }

search_proposals({           query?: string,                     { results: ProposalSummary[] }
                             country?: ISO2,
                             status?: string,
                             area?: string,
                             from?: date,
                             to?: date,
                             limit?: number })

get_proposal({ id: UUID })    → { proposal, sponsors, affected_laws, linked_events }

get_budget({ country: ISO2,  year?: number (default: latest) })
                              → { total, breakdown: [{cofog, amount, pct_gdp, pct_total, per_capita}], demographics }

get_lobby_org({              → { organisation, spend_history, meetings, linked_politicians }
                transparency_id: string })

get_entity_card({ kind, slug, format?: "markdown"|"json" })
                              → { entity, aliases, claims, relationships, timeline }

search_entities({            → { results: EntityHit[] }
                query: string,
                kind?: EntityKind,
                limit?: number })

get_timeline({               → { events: PoliticalEvent[], next_page_cursor? }
                subject_id?: UUID,
                event_type?: string,
                country?: ISO2,
                from?: date,
                to?: date,
                limit?: number })

get_voting_record({          → { votes: [{proposal, vote, date}], summary }
                politician_id: UUID })

get_committee_members({      → { committee, members: PoliticianSummary[] }
                name: string })
```

Each tool is a thin wrapper around a Layer 2/3 endpoint. **No data access
logic lives in the MCP server itself** — it's purely schema + translation.

### 5.3 Resources (URI-addressable read-only data)

```
poli-track://entity/person/jane-example-abcd1234          → Markdown card
poli-track://entity/party/de-spd                          → Markdown card
poli-track://entity/country/de                            → Markdown card
poli-track://entity/proposal/proposal-dsa-2022            → Markdown card
poli-track://entity/lobby_org/lobby-meta-platforms-xyz    → Markdown card

poli-track://politician/{uuid}                            → Full JSON (Layer 3)
poli-track://proposal/{uuid}                              → Full JSON
poli-track://country/{iso2}/budget/{year}                 → Full JSON
poli-track://country/{iso2}/politicians                   → Paginated politicians list

poli-track://timeline?subject_id={uuid}&from=...&to=...   → Filtered events
poli-track://graph?seed={entity_id}&depth=2               → Graph slice
```

Resources have MIME types — `text/markdown` for cards, `application/json` for
structured data. The LLM chooses which format to request.

### 5.4 Prompts (reusable investigative templates)

```typescript
investigate_politician({ name_or_id }) →
  System prompt + arguments for:
  "You are investigating {name_or_id}. Use get_politician, get_voting_record,
   get_lobby_org to surface: 1) committee assignments, 2) who has lobbied them,
   3) how they voted on the three biggest recent proposals. Report with inline
   citations to poli-track URIs."

compare_countries({ countries: ISO2[], topic }) →
  "Compare {countries} on {topic}. Use get_budget, get_timeline, and
   get_entity_card. Produce a markdown report with a table of budget
   allocation, recent proposals, and named politicians in government on each
   side."

trace_money_flow({ lobby_org_name }) →
  "Trace the money flow for {lobby_org_name}. Use get_lobby_org to get spend
   history, then search_politicians for the politicians they met, then
   get_voting_record on each to see how they voted on relevant proposals."

find_committee_members({ committee }) →
  "Find current members of the {committee} EP committee. For each member,
   summarise their party, country, and any disclosed lobby meetings."
```

Prompts ship with the MCP server and appear in the LLM's "suggested prompts"
menu when the server is connected.

### 5.5 Transport choices

**stdio** (local):
- Binary published as `@poli-track/mcp-server`
- User adds one line to Claude Desktop's `claude_desktop_config.json`:
  ```json
  {
    "mcpServers": {
      "poli-track": {
        "command": "npx",
        "args": ["-y", "@poli-track/mcp-server"],
        "env": {
          "POLI_TRACK_API_BASE": "https://{project}.supabase.co/functions/v1",
          "POLI_TRACK_API_KEY": "optional, for heavy consumers"
        }
      }
    }
  }
  ```
- No HTTP server. Uses stdin/stdout. Cursor, Claude Desktop, VS Code Copilot
  (via MCP extensions), and self-hosted agents all support this.

**Streamable HTTP** (remote):
- Deployed as Supabase edge function `mcp` at `/functions/v1/mcp`
- Implements the MCP Streamable HTTP transport spec
  (https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- Stateless per request; server-sent events for streaming tool responses
- Served alongside the rest of the API, no extra infra
- Auth: optional `Authorization: Bearer {api_key}` header. Rate-limited per IP
  + per key.

Both transports share the SAME server class from `src/server.ts`; only the
transport adapter differs.

### 5.6 Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^latest-stable",
    "zod": "^3.x"
  }
}
```

The SDK handles tool-schema validation, transport framing, error
serialization, and message IDs. Zod is for declaring input schemas
compactly.

---

## 6. OpenAPI + typed client

### 6.1 OpenAPI spec

Store `openapi.yaml` at the repo root. It documents every Layer 2/3
endpoint. NOT auto-generated — hand-maintained so contributors have to
think about the contract when they change an endpoint.

PostgREST publishes its own OpenAPI at `/rest/v1/`. We do NOT merge these;
they're separate surfaces. We reference the PostgREST one from our spec as
"see raw tables at ...".

### 6.2 Typed TypeScript client

Package: `@poli-track/client` published to npm.

Generated from `openapi.yaml` via `openapi-typescript`. Rebuilt on every
spec change. Consumers install it:

```bash
npm install @poli-track/client
```

```typescript
import { createClient } from '@poli-track/client';
const poli = createClient({ baseUrl: 'https://{project}.supabase.co/functions/v1' });
const { data } = await poli.page.actor.get({ id: '...' });
```

Ships with full types, so autocomplete works in any editor.

### 6.3 Python client (future)

`poli-track-py` via `openapi-python-client`. Same generation, different
language. Optional — only build if there's demand.

---

## 7. Auth, rate limiting, caching

### 7.1 Default: public, rate-limited

- No auth required for reasonable volume (e.g. 60 requests / minute per IP).
- Rate-limiting at the Supabase edge function level via a simple
  IP-bucketing helper. Not Cloudflare — keeps it in one stack.
- Heavy consumers get an API key via a new `api_keys` table:

```sql
CREATE TABLE public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  key_hash        text not null unique,     -- sha256 of the key
  label           text not null,
  rate_limit_rpm  integer not null default 600,
  created_at      timestamptz default now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz
);
```

Keys are issued via an admin script, not a UI. Operator only.

### 7.2 Caching

- Every GET sends `Cache-Control: public, max-age={ttl}` with a sensible TTL
  per endpoint (5 min for home, 15 min for explore, 30 min for data, 1 hour
  for budgets, 24 hours for entity cards where the underlying data is
  nightly).
- `ETag` is a hash of the response body so clients can `If-None-Match`.
- Edge functions are stateless; caching happens at the Supabase edge +
  downstream CDN. No in-process cache.

### 7.3 CORS

- `Access-Control-Allow-Origin: *` for all GET endpoints.
- Actors (POST/DELETE for the future admin key routes) require an
  authenticated origin.

---

## 8. Phased execution plan

### Phase A — Enable the free wins (1 day)
- [ ] M-200: enable `pg_graphql` via migration. Test against `/graphql/v1`.
- [ ] Write `openapi.yaml` stub with the existing `entity` endpoint +
      PostgREST cross-reference.
- [ ] Generate `@poli-track/client` from the stub. Don't publish yet.
- [ ] Write `docs/api.md` that documents (a) PostgREST base, (b) pg_graphql
      base, (c) the one custom endpoint, (d) where Layer 2/3 is going.

**Exit criteria**: pg_graphql live, OpenAPI stub committed, client generator
works locally.

### Phase B — Layer 2 canonical endpoints (2-3 days)
- [ ] `GET /functions/v1/search?q=&kind=` — global search over `entities`
      and `entity_aliases`.
- [ ] `GET /functions/v1/graph?seed=&depth=` — returns `{nodes, edges}`
      slice up to depth 3.
- [ ] `GET /functions/v1/timeline` — cross-entity timeline with
      pagination cursor.
- [ ] Extend the existing `entity` endpoint to return richer JSON via
      `?format=json`, and add `claims`, `relationships_out`,
      `relationships_in`, `recent_events` fields.
- [ ] All four endpoints follow the response envelope from §3.3.
- [ ] Vitest specs for the pure rendering helpers (not the edge function
      loop).

**Exit criteria**: you can hit the 4 endpoints, get envelope-shaped
responses, and see them in the OpenAPI spec.

### Phase C — Per-page aggregators (3-5 days)
- [ ] `GET /functions/v1/page/actor/{id}` — the big one. Composite shape
      matching `ActorDetail.tsx`.
- [ ] `GET /functions/v1/page/country/{code}` — composite shape matching
      `CountryDetail.tsx`.
- [ ] `GET /functions/v1/page/proposal/{id}`
- [ ] `GET /functions/v1/page/budget/{country}/{year?}`
- [ ] `GET /functions/v1/page/home`
- [ ] `GET /functions/v1/page/explore`
- [ ] `GET /functions/v1/page/actors` (list + filters)
- [ ] `GET /functions/v1/page/proposals` (list + filters)
- [ ] `GET /functions/v1/page/relationships`
- [ ] `GET /functions/v1/page/data`
- [ ] `GET /functions/v1/page/lobby`
- [ ] `GET /functions/v1/page/timeline` (wraps the Layer 2 timeline with
      the SPA's filter defaults)

Each endpoint gets:
- A vitest spec that shapes a fixture response
- A reference snapshot of the rendered Markdown form
- An entry in `openapi.yaml`

**Exit criteria**: every SPA route has a matching `page/*` endpoint. A
consumer can pipe `curl https://.../page/actor/{id}` | jq` and see the full
view.

### Phase D — Refactor frontend hooks to use the API (2-3 days, optional but strongly encouraged)
- [ ] Refactor `use-politicians.ts`, `use-proposals.ts`, etc. to call the
      new `/page/*` endpoints instead of doing raw table queries. This is
      the "single source of truth" move: one place defines the page shape,
      both the React hooks and the JSON API consume it.
- [ ] Keep raw table queries only where the frontend needs unique
      flexibility (e.g. the Timeline infinite scroll's cursor pagination).

**Exit criteria**: `npm run check` still green, frontend feature parity,
hooks are now thin API wrappers.

### Phase E — MCP server stdio transport (3-4 days)
- [ ] `mcp-server/` package scaffold with `@modelcontextprotocol/sdk`.
- [ ] Implement the 10 tools in §5.2, each as a thin call to the Layer 2/3
      endpoints.
- [ ] Implement the 5 resource URI handlers in §5.3.
- [ ] Implement the 4 prompts in §5.4.
- [ ] stdio transport entry with `bin` in `package.json`.
- [ ] Smoke-test by connecting from Claude Desktop:
      1. Add to `claude_desktop_config.json`
      2. Restart Claude Desktop
      3. Verify the `poli-track` server shows up with the 10 tools and 4
         prompts
      4. Run a real investigative prompt end to end
- [ ] Publish to npm as `@poli-track/mcp-server`.

**Exit criteria**: an MCP-compliant agent can run
`search_politicians({ country: "DE", query: "merkel" })` and get a typed,
enveloped response.

### Phase F — MCP Streamable HTTP transport (1-2 days)
- [ ] Supabase edge function `mcp` that wraps the same MCP server and
      implements the Streamable HTTP transport.
- [ ] CORS + rate limit.
- [ ] Document connection URL at `docs/api.md#remote-mcp`.

**Exit criteria**: a remote agent can connect to
`https://{project}.supabase.co/functions/v1/mcp` and get the same 10 tools.

### Phase G — Auth + rate limiting + cache headers (1-2 days)
- [ ] Migration for `api_keys` table.
- [ ] Admin script `scripts/issue-api-key.ts` (operator only, service role).
- [ ] Shared helper `src/lib/api-envelope.ts` that wraps any handler with
      envelope + caching headers + rate limit check.
- [ ] Apply to every Layer 2/3 endpoint.

**Exit criteria**: public users work, burst traffic is rate-limited, admin
can issue keys for heavy consumers.

### Phase H — Publication + docs (1 day)
- [ ] `docs/api.md` — comprehensive API reference (can start from
      `openapi.yaml` + hand-written examples).
- [ ] `docs/mcp.md` — MCP setup guide with Claude Desktop snippet, Cursor
      config, and a gallery of example tool calls.
- [ ] `npm publish @poli-track/client` and `@poli-track/mcp-server`.
- [ ] Blog post / GitHub release notes.
- [ ] Register the MCP server in the public registry
      (https://github.com/modelcontextprotocol/servers or whichever is the
      canonical index at publication time).

**Exit criteria**: a journalist or researcher can install
`@poli-track/client` or connect the MCP server in 60 seconds and start
writing queries.

---

## 9. Open questions for discussion

1. **pg_graphql or not?** Cheap to enable but adds a second surface
   contributors have to think about. My vote: yes, keep it as a power-user
   escape hatch.

2. **TypeScript-only clients, or also Python?** Python is where data
   journalists live. My vote: ship TS first, do Python after the API is
   stable and the OpenAPI spec has been used by a real consumer.

3. **One `/page/*` prefix vs no prefix?** I've written this as
   `/functions/v1/page/{route}` but Supabase edge functions get a flat
   namespace. We'd either (a) define one edge function per page (18+
   functions) or (b) one edge function `page` that routes internally. I
   recommend (b) — simpler deploys, shared envelope helper.

4. **Realtime subscriptions?** Out of scope as stated. Confirm we're OK
   with this.

5. **Rate limit implementation**: homegrown IP bucket in Postgres, or an
   upstash Redis, or Cloudflare Turnstile in front of the edge function?
   Cheapest: a `rate_limit_hits (ip, minute_bucket, count)` table + a
   before-hook that ups-and-checks. Scale limit: ~a few thousand RPM. If we
   need more, revisit.

6. **MCP auth for remote HTTP transport**: anonymous with IP rate limit,
   or require an `Authorization: Bearer` header even for reads? I lean
   anonymous — the data is public, auth just filters abusers. Heavy
   consumers still get keys.

7. **Should the MCP server be stateful?** Current spec says no. Claude
   Desktop supports session state but our data is read-only and deterministic,
   so sessions add no value. Keep it stateless.

8. **Discovery**: do we want an entry in the MCP registry right away,
   or wait until we have real users? My vote: register after Phase F so
   people find us when searching for "EU politics MCP".

9. **Naming**: `@poli-track/client` vs `@poli-track-os/client` vs
   `poli-track`. I lean `@poli-track-os/*` since that's the org name on
   GitHub.

10. **Webhook support for write surface?** There is no write surface
    today — everything is read-only + operator-run ingestion. If
    contributors want to submit corrections (e.g. "this politician's
    wikipedia link is wrong"), we'd need an auth story. Not in this plan;
    park it.

---

## 10. What this plan does NOT do

Explicit non-goals to prevent scope creep:

- **Realtime subscriptions.** Batch API only.
- **Write API for end users.** Contributions via PRs / operator scripts,
  not an API endpoint.
- **GraphQL for the composite page endpoints.** Those stay REST. pg_graphql
  is only for raw-table access.
- **Custom auth system.** Supabase Auth not enabled. `api_keys` is a flat
  table with a shared helper, not JWT-based.
- **SLA guarantees.** Pre-alpha. Best-effort.
- **Full-text search beyond what Postgres gives us.** No Algolia, Elastic,
  Typesense. If search quality becomes a real problem, add a trgm + ts_vector
  index and call it a day.
- **Per-endpoint telemetry.** A count in `scrape_runs`-style table if we
  want to track usage, nothing fancier.
- **SDKs for non-TS/Python languages.** Stable OpenAPI spec means anyone
  can generate their own. We won't hand-write Go/Rust/Ruby clients.

---

## 11. Reference: every current SPA data fetch, for completeness

This is the inventory we built the per-page endpoints against. If the list
of hooks changes, update this section so the API stays in lockstep.

### Hooks under `src/hooks/`

```
use-politicians.ts:
  usePoliticians()                            → /page/actors
  usePolitician(id)                           → /page/actor/{id}
  usePoliticianFinances(id)                   → embedded in /page/actor/{id}
  usePoliticianInvestments(id)                → embedded in /page/actor/{id}
  usePoliticianEvents(id)                     → embedded in /page/actor/{id}
  usePoliticianPosition(id)                   → embedded in /page/actor/{id}
  useAllPositions()                           → /page/relationships
  usePoliticianAssociates(id)                 → embedded in /page/actor/{id}
  usePoliticiansByCountry(code)               → embedded in /page/country/{code}
  useCountryStats()                           → /page/home + /page/explore + /page/actors

use-proposals.ts:
  useProposals(filters)                       → /page/proposals
  useProposal(id)                             → /page/proposal/{id}
  useProposalsByCountry(code)                 → embedded in /page/country/{code}
  useProposalsByPolicyAreas(areas)            → /page/proposals with ?area=
  useProposalStats()                          → embedded in /page/proposals

use-country-metadata.ts:
  useCountryMetadata(code, name)              → embedded in /page/country/{code}

use-party-metadata.ts:
  usePartyMetadata(party, country)            → embedded in /page/party/{country}/{party}
  usePartiesMetadata(country, parties)        → embedded in /page/country/{code}

use-wikipedia-page.ts:
  useWikipediaPageSummary(url)                → /page/actor/{id} uses this as a fallback

use-government-expenditure.ts:
  useGovernmentExpenditure(code)              → embedded in /page/budget/{country}
  useCofogFunctions()                         → static, can be embedded everywhere
  useCountryDemographics(code)                → embedded in /page/budget/{country}
  useExpenditureByFunction(cofog, year)       → embedded in /page/budget/{country}
  useEuReferenceData()                        → embedded in /page/data

use-lobby.ts:
  useTopLobbyOrgs(limit)                      → /page/lobby
  useLobbyOrg(transparency_id)                → /page/lobby/{transparency_id}
  useLobbySpendForOrg(lobby_id)               → embedded in /page/lobby/{transparency_id}
  useLobbyMeetingsForPolitician(politician_id)→ embedded in /page/actor/{id}
  useTotalLobbyOrgs()                         → /page/lobby

(Timeline uses its own inline useTimeline)    → /page/timeline
```

If a new hook ships in `src/hooks/`, this table must be updated and a
corresponding endpoint added.

---

*End of plan. Iterate freely; this is a living document.*
