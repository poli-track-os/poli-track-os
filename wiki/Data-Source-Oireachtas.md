# Data source: Oireachtas

Irish parliament bills API.

## Upstream URL & license

- URL: <https://api.oireachtas.ie>
- License: Open Data, free re-use with attribution to "Houses of the Oireachtas".

## What it provides

The Oireachtas API publishes structured JSON for bills with title, sponsor, status, stage, chamber, short title, and URLs back to oireachtas.ie. The `/v1/legislation` endpoint is paginated with `limit` + `skip`.

## Ingestion script

[scripts/sync-oireachtas.ts](../scripts/sync-oireachtas.ts) — paginates the legislation endpoint and maps each row via `buildProposalFromOireachtasBill` in [src/lib/oireachtas-helpers.ts](../src/lib/oireachtas-helpers.ts).

```bash
node --experimental-strip-types scripts/sync-oireachtas.ts --apply --max-pages 40 --limit 50
```

## Tables populated

- `proposals` — Irish bills with `country_code='IE'` and `data_source='oireachtas'`.
- `scrape_runs` — one row per run.

## Refresh cadence

On demand. Full current backfill takes ~40 pages of 50 rows.

## Known quirks / rate limits

- The API's pagination count (`head.counts.resultCount`) can drift slightly from the list length; the script trusts the actual array for dedup.
- Bills have multiple "stages" (`firstHouse`, `secondHouse`, ...) — Poli-Track flattens to one `status` string per row.
- Some rows have a null sponsor; Irish private-member bills without a recorded author fall back to `"Houses of the Oireachtas"`.

## Attribution requirements

Credit "Houses of the Oireachtas" with a link to <https://www.oireachtas.ie/>.
