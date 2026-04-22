# API reference

Poli-Track exposes every piece of data that powers the SPA through three layers. Full machine-readable spec: [openapi.yaml](https://github.com/poli-track-os/poli-track-os/blob/main/openapi.yaml). Design doc: [API_MCP_PLAN.md](https://github.com/poli-track-os/poli-track-os/blob/main/API_MCP_PLAN.md).

## Three layers

```
Layer 3  /functions/v1/page/*        per-page aggregators    "fetch everything about X"
Layer 2  /functions/v1/entity        canonical graph         kind-agnostic cards + timeline + graph
         /functions/v1/search        global search
         /functions/v1/graph         {nodes, edges}
         /functions/v1/timeline      filtered event stream
Layer 1  /rest/v1/{table}            PostgREST raw tables    filters, embeds, pagination
         /graphql/v1                 pg_graphql              schema-typed queries
```

Use Layer 1 when PostgREST already fits. Use Layer 2 when you want kind-agnostic graph navigation. Use Layer 3 when you want the same composite shape the React pages use, in one call.

## Response envelope

Every Layer 2 / Layer 3 endpoint returns the same envelope, and supports content negotiation between JSON and Markdown:

```json
{
  "ok": true,
  "data":    { ... },
  "meta":    { "fetched_at": "...", "schema_version": "1", "cache_ttl_seconds": 300, "row_counts": { ... } },
  "provenance": [
    { "kind": "politician", "source_url": "...", "data_source": "eu_parliament", "trust_level": 1 }
  ]
}
```

With `Accept: text/markdown` the same data comes back as a deterministic Markdown card optimized for LLM prompts. Errors carry a `{ ok: false, error: { code, message, http_status } }` shape.

All endpoints are public, CORS `*`, idempotent GETs, and emit `Cache-Control` + `ETag`. Heavy consumers can attach `Authorization: Bearer <api_key>` for higher rate limits; no key is required for normal read volumes.

## Per-page endpoints (Layer 3)

| SPA route | Endpoint | Wiki page |
|---|---|---|
| `/` | `GET /functions/v1/page/home` | [Home](Page-Home) |
| `/explore` | `GET /functions/v1/page/explore` | [Explore](Page-Explore) |
| `/country/:code` | `GET /functions/v1/page/country/{code}` | [Country detail](Page-Country-Detail) |
| `/country/:c/party/:p` | `GET /functions/v1/page/party/{country}/{party}` | [Party detail](Page-Party-Detail) |
| `/actors` | `GET /functions/v1/page/actors?country=&query=&limit=&offset=` | [Actors](Page-Actors) |
| `/actors/:id` | `GET /functions/v1/page/actor/{id}` | [Actor detail](Page-Actor-Detail) |
| `/proposals` | `GET /functions/v1/page/proposals?country=&status=&area=&limit=&offset=` | [Proposals](Page-Proposals) |
| `/proposals/:id` | `GET /functions/v1/page/proposal/{id}` | [Proposal detail](Page-Proposal-Detail) |
| `/relationships` | `GET /functions/v1/page/relationships?country=&view=clusters\|tree\|connections` | [Relationships](Page-Relationships) |
| `/data` | `GET /functions/v1/page/data` | [Data](Page-Data) |
| `/budgets` | `GET /functions/v1/page/budget/{country}/{year?}` | [Budgets](Page-Budgets) |
| `/lobby` | `GET /functions/v1/page/lobby?limit=&search=` | [Lobby](Page-Lobby) |
| `/timeline` | `GET /functions/v1/page/timeline?type=&source=&country=&subject_id=&from=&to=&page=` | [Timeline](Page-Timeline) |

## Canonical graph endpoints (Layer 2)

| Endpoint | Purpose |
|---|---|
| `GET /functions/v1/entity?kind=&slug=&format=markdown\|json` | Canonical entity card — person, party, country, proposal, committee, lobby_org, institution |
| `GET /functions/v1/search?q=&kind=&limit=` | Global search across canonical entities |
| `GET /functions/v1/graph?seed=&depth=1\|2\|3&predicates=...` | `{ nodes, edges }` for graph rendering |
| `GET /functions/v1/timeline?subject_id=&predicate=&from=&to=` | Filtered `political_events` stream (cross-entity) |
| `GET /functions/v1/claim?entity_id=&key=` | All claims about one fact, across sources and trust levels |

## Raw tables (Layer 1)

Every table under `public.*` is readable via PostgREST at `${baseUrl}/rest/v1/{table}` with the publishable (anon) key. Writes are service-role only. The Supabase project's auto-generated OpenAPI is available at `${baseUrl}/rest/v1/` and the pg_graphql endpoint at `${baseUrl}/graphql/v1` mirrors the same schema.

Tables you can hit directly:

`politicians`, `political_events`, `proposals`, `politician_finances`, `politician_investments`, `politician_positions`, `politician_associations`, `country_metadata`, `country_demographics`, `government_expenditure`, `cofog_functions`, `lobby_organisations`, `lobby_spend`, `lobby_meetings`, `entities`, `entity_aliases`, `relationships`, `claims`, `sources`, `raw_tweets`, `scrape_runs`, `data_sources`.

Schema reference: [Data model](Data-Model).

## Related pages

- [MCP server](MCP-Server) — named tool wrappers on top of the API.
- [Ingestion pipeline](Ingestion-Pipeline) — where rows come from before they hit the API.
