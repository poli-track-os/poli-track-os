# Data source: Congreso ES

Spanish Congreso de los Diputados open data.

## Upstream URL & license

- URL: <https://www.congreso.es/>
- License: Spanish open-data re-use policy (Ley 37/2007, equivalent to CC-BY for public-sector information).

## What it provides

The Congreso open-data portal publishes structured JSON listings of legislative initiatives (iniciativas) with title, status, date, and author. Poli-Track pulls the full current list via [scripts/sync-congreso-es.ts](../scripts/sync-congreso-es.ts).

## Ingestion script

[scripts/sync-congreso-es.ts](../scripts/sync-congreso-es.ts) — fetches the JSON listing and maps each row via `buildProposalFromCongresoEs` in [src/lib/congreso-es-helpers.ts](../src/lib/congreso-es-helpers.ts).

```bash
node --experimental-strip-types scripts/sync-congreso-es.ts --apply
```

There is no page/limit flag — the script applies the full current payload in one shot.

## Tables populated

- `proposals` — Spanish proposals with `country_code='ES'` and `data_source='congreso_es'`.
- `scrape_runs` — one row per run.

## Refresh cadence

On demand.

## Known quirks / rate limits

- The Congreso listing is published as one large JSON file rather than a paginated API. Full runs are cheap but memory-heavy.
- `status` and `type` vocabularies are Spanish-language free text; they are stored verbatim.
- Historical coverage depends on what the portal currently exposes.

## Attribution requirements

Credit "Congreso de los Diputados — datos abiertos" when rendering data, and comply with Ley 37/2007 on the re-use of public-sector information.
