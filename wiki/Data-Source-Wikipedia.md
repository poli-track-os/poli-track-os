# Data source: Wikipedia

Biography, infobox, and party-metadata enrichment.

## Upstream URL & license

- URL: <https://en.wikipedia.org>
- APIs: Wikipedia REST summary (`/api/rest_v1/page/summary/{title}`), Action API (`?action=query&...`), and Wikidata SPARQL.
- License: Article text and summaries are CC-BY-SA 4.0; infobox data mirrored from Wikidata is CC0.

## What it provides

Wikipedia is the biographical enrichment layer that sits downstream of every roster ingester:

- Short summary (~300 chars) via the REST summary endpoint.
- Long biography text (~3,000 chars) pulled from the Action API.
- Main image URL.
- Parsed infobox fields (`birth_date`, `party`, `term_start`, `committees`, `twitter`, …).
- Wikidata coordinates, description, and cached JSON blob.

It also powers the party-metadata lookup used by [Country detail](Page-Country-Detail) and [Party detail](Page-Party-Detail).

## Ingestion function

The Deno edge function [supabase/functions/enrich-wikipedia/](../supabase/functions/enrich-wikipedia/).

Manual invocation:

```bash
curl -fsSL -X POST "$SUPABASE_URL/functions/v1/enrich-wikipedia" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"batchSize": 50}'
```

The function is also chained automatically by `scrape-eu-parliament` and `scrape-national-parliament` for newly-created politicians, with `parent_run_id` linking the child `scrape_runs` row back to the parent.

## Tables populated

- `politicians.*` enrichment columns (`wikipedia_url`, `wikipedia_summary`, `biography`, `wikipedia_image_url`, `wikipedia_data`, `enriched_at`, plus infobox-derived fields).
- `scrape_runs`, `data_sources` — run tracking.

## Refresh cadence

Runs automatically during every EU Parliament / national parliament scrape and on its own weekly via [.github/workflows/ingest.yml](https://github.com/poli-track-os/poli-track-os/blob/main/.github/workflows/ingest.yml).

## Known quirks / rate limits

- Self-throttled to ~5 requests/second with Retry-After handling.
- 90 s wall-clock cap — long-tail enrichment needs multiple runs.
- Disambiguation guard: requires shared name token (≥ 4 chars), politician categories, and a country tie before accepting a match. Common names can still occasionally resolve to the wrong article.
- Infobox parsing is regex-based; unusual formatting lands in `wikipedia_data` but does not populate structured columns.

## Attribution requirements

Wikipedia content is CC-BY-SA 4.0 — any redistribution must credit "Wikipedia contributors", include a link to the article, and carry the share-alike notice. Wikidata content is CC0 and can be re-used freely.
