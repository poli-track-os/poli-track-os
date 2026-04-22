# Data source: EU Parliament

Official MEP roster plus per-MEP activity pages.

## Upstream URL & license

- URL: <https://www.europarl.europa.eu>
- MEP directory: `https://www.europarl.europa.eu/meps/en/full-list/xml`
- Per-MEP activity pages: `https://www.europarl.europa.eu/meps/en/{id}/...` (reports, committees, declarations)
- License: European Union legal notice — free re-use with attribution, per Commission Decision 2011/833/EU.

## What it provides

Three distinct surfaces under the europarl.europa.eu domain:

- **Full MEP XML** — one row per MEP with ID, name, country, national party, EP group, and photo URL.
- **Per-MEP home page** — committee memberships with title/abbreviation.
- **Per-MEP activity pages** — reports (with A-number, committee, date) and declarations (declaration PDF catalog).

The richer activity stream is now covered by [Parltrack](Data-Source-Parltrack); the EP scrapers remain as a fallback and for committee metadata that Parltrack does not carry.

## Ingestion script / function

All Deno edge functions under [supabase/functions/](../supabase/functions/):

- `scrape-eu-parliament` — full MEP XML → `politicians` (upsert by `external_id`), then chains `enrich-wikipedia` for the top 20 newly-created rows.
- `scrape-mep-committees` — committee regex on per-MEP home pages → `politicians.committees[]` + `political_events (committee_join)`.
- `scrape-mep-reports` — A-number + committee + date extraction → `political_events (legislation_sponsored)`.
- `scrape-mep-declarations` — catalogs declaration PDFs (target: `politician_finances` / `politician_investments`).

Manual invocation:

```bash
curl -fsSL -X POST "$SUPABASE_URL/functions/v1/scrape-eu-parliament" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"offset": 0, "batchSize": 200}'
```

See [Ingestion pipeline](Ingestion-Pipeline) for the other recipes.

## Tables populated

- `politicians` — MEP rows.
- `political_events` — `committee_join`, `legislation_sponsored`.
- `politician_finances`, `politician_investments` — via `scrape-mep-declarations` (roadmap).
- `scrape_runs`, `data_sources` — provenance tracking.

## Refresh cadence

Scheduled by [.github/workflows/ingest.yml](https://github.com/poli-track-os/poli-track-os/blob/main/.github/workflows/ingest.yml) every Monday 03:00 UTC alongside the rest of the edge functions.

## Known quirks / rate limits

- `scrape-mep-reports` is wall-clock bound (90 s) with a 150 ms per-request rate limit; large backfills require multiple invocations.
- Dedup for `political_events` uses a partial unique index on `(politician_id, source_url, event_timestamp)`.
- The MEP XML drops non-current MEPs — historical rosters need Parltrack instead.
- Committee abbreviations are regex-extracted and can occasionally catch non-committee acronyms.

## Attribution requirements

Credit "European Parliament" when reusing directory or activity content. The EP legal notice is at <https://www.europarl.europa.eu/legal-notice/en/>.
