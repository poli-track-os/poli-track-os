# Timeline

Cross-politician event stream.

## What it shows

Timeline is the "git log for European politics" view. It is a paginated list of every row in `political_events`, ordered by `event_timestamp DESC`, with server-side filters for event type and source and a politician-country filter that joins through `politicians`.

You see:

- A filter bar for event type, source, and country.
- An in-memory text search over title / politician name / party on the current page.
- A dense list of events, each with its type badge, source badge, timestamp, politician, and the upstream `source_url`.
- Page controls. Page size is fixed at 100 events and pagination is offset-based via the `?page=N` query param.

The total count in the header is the full (filtered) row count from Supabase, not just the current page.

## Route

`/timeline`

## Data sources

- `political_events` — the core `SELECT … ORDER BY event_timestamp DESC` query.
- `politicians` (joined) — name, country, party for each event. The join switches to `!inner` when the country filter is active so events without a matching politician are excluded.
- `politicians` grouped by country — populates the country picker.

Events land from several pipelines — primarily [Parltrack](Data-Source-Parltrack), [GDELT](Data-Source-GDELT), the `scrape-twitter` / `scrape-press-rss` edge function, and [EU Parliament](Data-Source-EU-Parliament) (MEP reports / committees).

## React components

- Page: [Timeline.tsx](../src/pages/Timeline.tsx)
- Label maps: `eventTypeLabels`, `sourceLabels` in [src/data/domain.ts](../src/data/domain.ts)
- Date display: [date-display.ts](../src/lib/date-display.ts)
- Hooks: inline `useTimeline()` + [useCountryStats](../src/hooks/use-politicians.ts)

## API equivalent

`GET /functions/v1/page/timeline?type=&source=&country=&subject_id=&from=&to=&page=` — same shape as the SPA page. There is also a cross-entity `GET /functions/v1/timeline?subject_id=&predicate=&from=&to=` for graph navigation. See [API reference](API-Reference).

## MCP tool equivalent

`get_timeline({ subject_id?, event_type?, country?, from?, to?, limit? })`. See [MCP server](MCP-Server).

## Screenshots

(not captured yet)

## Known issues

- `political_events` has no uniform idempotency key across ingesters. Partial unique indexes exist on `(politician_id, source_url, event_timestamp)` but some sources leave `politician_id` null, and re-running an ingester can occasionally insert near-duplicate rows.
- Text search is per-page only. If you filter by country and search a name, matches on later pages will not show until you page forward.
- Offset pagination is cheap today but will degrade on large filters; prefer narrowing by event type / country before paging.
- The "source" enum mixes technical provenance (`parltrack`, `wikipedia`) with sociological provenance (`news`, `twitter`). Two events from the same upstream can land under different `source` values depending on which ingester wrote them.
