# Data source: Tweede Kamer

Dutch House of Representatives OData feed.

## Upstream URL & license

- URL: <https://gegevensmagazijn.tweedekamer.nl>
- Format: OData v4 (`/Zaak`, `/Activiteit`, `/Document`, `/Persoon`, …).
- License: Open data published by the Tweede Kamer, free re-use.

## What it provides

The Tweede Kamer "Gegevensmagazijn" is a full OData warehouse of Dutch parliamentary activity. Poli-Track reads the `Zaak` (case) entity — the proposal-level object — with title, status, submission date, and references back to tweedekamer.nl.

## Ingestion script

[scripts/sync-tweedekamer.ts](../scripts/sync-tweedekamer.ts) — paginates the `Zaak` endpoint using `$top` + `@odata.nextLink` and maps each row via `buildProposalFromTweedeKamerZaak` in [src/lib/tweedekamer-helpers.ts](../src/lib/tweedekamer-helpers.ts).

```bash
node --experimental-strip-types scripts/sync-tweedekamer.ts --apply --max-pages 40 --top 200
```

## Tables populated

- `proposals` — Dutch cases with `country_code='NL'` and `data_source='tweedekamer'`.
- `scrape_runs` — one row per run.

## Refresh cadence

On demand.

## Known quirks / rate limits

- OData is verbose; page sizes of 100–200 are the sweet spot. The default is 200 rows per page.
- A `Zaak` is not always a bill — it can be a motion, an urgent debate, or a procedural action. The helper filters aggressively but some non-bill rows still land.
- Dutch-language vocabulary throughout.
- Pagination uses `@odata.nextLink` rather than numeric skips; `--max-pages` is a safety cap.

## Attribution requirements

Credit "Tweede Kamer der Staten-Generaal" with a link to <https://www.tweedekamer.nl>.
