# Data source: Riksdag

Swedish parliament documents.

## Upstream URL & license

- URL: <https://data.riksdagen.se>
- License: Open data published by the Riksdag, free re-use with attribution.

## What it provides

The Riksdag open data API publishes structured documents (`dokumentlista`) with title, submission date, document type, party attribution, and URLs back to riksdagen.se. Poli-Track uses the propositions / motions endpoint.

## Ingestion script

[scripts/sync-riksdag.ts](../scripts/sync-riksdag.ts) — paginates the document list and maps each row via `buildProposalFromRiksdagDocument` in [src/lib/riksdag-helpers.ts](../src/lib/riksdag-helpers.ts).

```bash
node --experimental-strip-types scripts/sync-riksdag.ts --apply --max-pages 40 --size 100
```

## Tables populated

- `proposals` — Swedish documents with `country_code='SE'` and `data_source='riksdag'`.
- `scrape_runs` — one row per run.

## Refresh cadence

On demand. Full current backfill fetches ~2,000 rows.

## Known quirks / rate limits

- The JSON response sometimes returns a single `dokument` object instead of an array when there's only one result; the helper handles both shapes.
- "Proposition" (government bill), "motion" (MP motion), and "betänkande" (committee report) all share the documents endpoint; the script currently keeps them all.
- Pagination uses an opaque `@nasta_sida` URL rather than a numeric page; the script follows that link until it is empty or the cap is hit.

## Attribution requirements

Credit "Sveriges riksdag" with a link to <https://data.riksdagen.se>.
