# Poli-Track HTTP API

> **Status**: pre-alpha. Schema version `1`. Best-effort; no SLA.

Poli-Track exposes every piece of data on [poli-track.org](https://poli-track.org) via a public, read-only HTTP API. No authentication is required for reasonable volumes. Every endpoint is cacheable at the edge.

**Base URL**: `https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1`

For an LLM-friendly version of this surface, see [MCP Server](./mcp.md).

---

## Layers

The API has three layers. Use whichever is cheapest for your task.

### Layer 1 — Raw tables (PostgREST + GraphQL)

Any table under `public.*` is directly reachable via Supabase's built-in surfaces.

- **PostgREST** — `GET https://zygnkwyogazhwxfeatfc.supabase.co/rest/v1/{table}`
  - Auto-generated OpenAPI at [`/rest/v1/`](https://zygnkwyogazhwxfeatfc.supabase.co/rest/v1/)
  - Supports filters (`?country_code=eq.DE`), embeds (`select=*,politicians(*)`), pagination, ordering.
  - Requires `apikey` header. Use the project's publishable (anon) key for read-only access.
- **pg_graphql** — `POST https://zygnkwyogazhwxfeatfc.supabase.co/graphql/v1`
  - Enabled in migration `20260415140000_enable_pg_graphql.sql`.
  - Standard GraphQL — schema is auto-generated from the database.

Use these when you need a single table or a raw join. Use Layer 2/3 when you want composed data with provenance.

### Layer 2 — Canonical entity graph

Kind-agnostic endpoints over the `entities`, `entity_aliases`, `relationships`, `claims`, and `political_events` tables. Good for cross-entity queries and LLM navigation.

| Endpoint | Purpose |
|---|---|
| [`GET /entity`](#get-entity) | One canonical entity card (Markdown or JSON). |
| [`GET /search`](#get-search) | Global search over entities and aliases. |
| [`GET /graph`](#get-graph) | BFS slice of the relationship graph around a seed. |
| [`GET /timeline`](#get-timeline) | Cross-entity political-event stream. |

### Layer 3 — Per-page aggregators

One endpoint per SPA route. Each returns the exact composite shape the corresponding React page assembles from its hooks. Good for "fetch everything about X" consumers.

All Layer 3 routes live under `/page/*`. See [per-page routes](#per-page-routes).

---

## Response envelope

Every Layer 2/3 endpoint returns the same JSON envelope:

```json
{
  "ok": true,
  "data": { /* endpoint-specific payload */ },
  "meta": {
    "fetched_at": "2026-04-15T13:42:00Z",
    "schema_version": "1",
    "cache_ttl_seconds": 300,
    "row_counts": { "events": 42, "lobby_meetings": 3 }
  },
  "provenance": [
    {
      "kind": "politician",
      "id": "…",
      "data_source": "parltrack",
      "source_url": "https://parltrack.org/meps/…",
      "trust_level": 1
    }
  ]
}
```

**Errors** return HTTP 4xx/5xx with:

```json
{
  "ok": false,
  "error": { "code": "NOT_FOUND", "message": "…", "http_status": 404 },
  "meta": { "fetched_at": "…", "schema_version": "1" }
}
```

### Content negotiation

Endpoints that support Markdown (the `entity` card, `page/actor/{id}`, `page/country/{code}`) accept `Accept: text/markdown`. Otherwise the default is `application/json`.

### Caching

All successful responses send `Cache-Control: public, max-age={ttl}` and a strong `ETag`. Clients using `If-None-Match` get a 304 with no body. Typical TTLs:

| Surface | TTL |
|---|---|
| Entity card | 10 min |
| Actor dossier | 5 min |
| Country / party / proposal pages | 5-10 min |
| Budget snapshot | 1 hour |
| Home / explore / data pages | 5-30 min |
| Search | 1 min |

### CORS

All GET endpoints send `Access-Control-Allow-Origin: *`. Browsers can call the API directly.

### Rate limits

Public reads are rate-limited by IP at the Supabase edge (~60 req/min per IP in the current configuration). Heavy consumers can request an API key — see [authentication](#authentication). Note: the `api_keys` table is planned but not yet enforced; until it ships, everything is on the IP bucket.

### Authentication

None required by default. An `Authorization: Bearer <api_key>` header is honored for higher rate limits once keys are issued. API keys are minted by maintainers via `scripts/issue-api-key.ts` (not yet shipped).

---

## Layer 2 endpoints

### `GET /entity`

Returns a canonical entity card.

**Query params**
| Name | Type | Required | Description |
|---|---|---|---|
| `kind` | string | yes | One of `person`, `party`, `country`, `proposal`, `committee`, `lobby_org`, `institution`. |
| `slug` | string | yes | Entity slug. |
| `format` | `json`\|`markdown` | no | Defaults to `json` unless `Accept: text/markdown`. |

**Example**
```bash
curl 'https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1/entity?kind=person&slug=jane-example-12345678'
curl -H 'Accept: text/markdown' 'https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1/entity?kind=party&slug=de-spd'
```

**Data shape** (`data.*`)

```
entity              { id, kind, canonical_name, slug, summary, first_seen_at }
aliases             [ { scheme, value, trust_level } ]
claims              [ { key, value, valid_from, valid_to, data_source, trust_level } ]
relationships_out   [ { predicate, object, valid_from, valid_to, role } ]
relationships_in    [ { predicate, subject, valid_from, valid_to } ]
recent_events       [ { event_type, title, event_timestamp, source, source_url } ]
markdown            string  (rendered card, deterministic)
```

---

### `GET /search`

Global search across `entities.canonical_name` and `entity_aliases.value`.

**Query params**
| Name | Type | Required | Description |
|---|---|---|---|
| `q` | string (>=2 chars) | yes | Substring to match. |
| `kind` | string | no | Restrict to one entity kind. |
| `limit` | int | no | Default 20, max 100. |

Scoring heuristic: exact name = 100, name prefix = 80, name contains = 60, alias exact = 70, alias contains = 40.

**Example**
```bash
curl 'https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1/search?q=merkel&kind=person'
```

---

### `GET /graph`

Bounded BFS slice of the relationship graph.

**Query params**
| Name | Type | Required | Description |
|---|---|---|---|
| `seed` | UUID | yes | Entity id to root the traversal at. |
| `depth` | int 1–3 | no | BFS depth. Default 1. |
| `limit` | int | no | Max node count. Default 100, max 500. |
| `predicates` | csv | no | Restrict to specific relationship predicates. |

Returns `{ seed, depth, nodes: Node[], edges: Edge[] }`. Edges are pruned so both endpoints are present in the node set.

---

### `GET /timeline`

Paginated keyset-sorted stream of `political_events`.

**Query params**
| Name | Type | Description |
|---|---|---|
| `subject_id` | UUID | Filter by `politicians.id`. |
| `country` | ISO-2 | Joins `politicians.country_code`. |
| `event_type` | string | Exact match. |
| `source` | string | Exact match. |
| `from` / `to` | ISO date | Inclusive bounds on `event_timestamp`. |
| `limit` | int | Default 50, max 200. |
| `cursor` | string | Opaque keyset cursor from a previous response. |

Returns `{ events, next_cursor }`. Pass `next_cursor` back as `cursor` to paginate.

---

## Per-page routes

One endpoint per SPA route. Every response is an [envelope](#response-envelope).

| SPA route | Endpoint | Cache TTL |
|---|---|---|
| `/` | `GET /page/home` | 300s |
| `/explore` | `GET /page/explore` | 900s |
| `/country/:code` | `GET /page/country/{code}` | 600s |
| `/country/:country/party/:party` | `GET /page/party/{country}/{party}` | 600s |
| `/actors` | `GET /page/actors?country=&query=&limit=&offset=` | 300s |
| `/actors/:id` | `GET /page/actor/{id}` | 300s |
| `/proposals` | `GET /page/proposals?country=&status=&area=&query=&limit=&offset=` | 300s |
| `/proposals/:id` | `GET /page/proposal/{id}` | 300s |
| `/relationships` | `GET /page/relationships` | 900s |
| `/data` | `GET /page/data` | 1800s |
| `/budgets` | `GET /page/budget/{country}?year=` | 3600s |
| `/lobby` | `GET /page/lobby?search=&limit=` | 600s |
| `/lobby/:transparency_id` | `GET /page/lobby/{transparency_id}` | 600s |
| `/timeline` | `GET /page/timeline?type=&source=&country=&subject_id=&from=&to=&limit=&cursor=` | 120s |

### Flagship example: `GET /page/actor/{id}`

The largest aggregator. Replaces ~10 frontend round-trips.

```bash
curl 'https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1/page/actor/<uuid>' | jq .
```

**Data shape**
```
politician         Row<politicians>
events             Row<political_events>[]
finances           Row<politician_finances> | null     (latest year only)
investments        Row<politician_investments>[]
position           Row<politician_positions> | null    (latest row)
associates         [ ...politician_associations, direction: "incoming"|"outgoing" ]
lobby_meetings     Row<lobby_meetings> joined with lobby_organisations
committees         string[]
country            Row<country_metadata> | null
party              Row<party_metadata> | null
```

### Flagship example: `GET /page/country/{code}`

```bash
curl 'https://zygnkwyogazhwxfeatfc.supabase.co/functions/v1/page/country/DE' | jq .data.budget_latest
```

**Data shape**
```
country                  Row<country_metadata>
politicians              Row<politicians>[]
politicians_by_party     Record<abbr, Row<politicians>[]>
parties                  Record<abbr, Row<party_metadata>>
proposals                Row<proposals>[] (most recent 100)
budget_latest            { year, total_million_eur, breakdown: [...] } | null
demographics             Row<country_demographics>[] (last 10 years)
```

---

## Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `MISSING_PARAM` | 400 | Required query or path param absent. |
| `QUERY_TOO_SHORT` | 400 | Search query must be ≥2 characters. |
| `BAD_CURSOR` | 400 | Timeline cursor is not a valid keyset token. |
| `NOT_FOUND` | 404 | Entity, politician, proposal, or lobby org not in DB. |
| `QUERY_FAILED` | 500 | Underlying Postgres query failed. Inspect `error.message`. |
| `SERVER_MISCONFIGURED` | 500 | Supabase credentials missing in the edge environment. |
| `INTERNAL_ERROR` | 500 | Unhandled exception in handler. |

---

## Provenance

Every successful envelope includes a `provenance` array listing the primary data sources behind the response. Use `data_source`, `source_url`, and `trust_level` to decide how much weight to put on any particular field.

Trust levels:
1. **Official record** — parliament/commission/transparency register
2. **Reputable aggregator** — Parltrack, LobbyFacts, Wikipedia (curated)
3. **Community curation** — Wikipedia (auto-imported), press RSS
4. **LLM extraction** — structured output from Claude over raw text

---

## Typed clients

A generated TypeScript client package is planned at `@poli-track-os/client` (not yet published). Until then, consumers can generate one from `openapi.yaml` at the repo root:

```bash
npx openapi-typescript openapi.yaml -o types.ts
```

---

## Changelog

- **2026-04-15** — Initial public API: envelope helper, 14 per-page aggregators, Layer 2 graph endpoints, MCP server. Schema version `1`.

---

## Related

- [`openapi.yaml`](../openapi.yaml) — machine-readable spec.
- [MCP Server](./mcp.md) — the same data as an MCP tool surface for LLMs.
- [DATA_PIPELINES_TRANSPARENCY.md](./DATA_PIPELINES_TRANSPARENCY.md) — how rows get into the DB in the first place.
- [REPOSITORY_OVERVIEW.md](../REPOSITORY_OVERVIEW.md) — full repo tour.
