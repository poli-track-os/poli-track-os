# Data source: Sejm

Polish parliament prints (druki).

## Upstream URL & license

- URL: <https://api.sejm.gov.pl>
- License: Open data published by the Kancelaria Sejmu; attribution to "Sejm Rzeczypospolitej Polskiej".

## What it provides

The Sejm REST API exposes "prints" (druki) — the document artefacts of each legislative initiative — scoped to a `term` (current is 10). Each print has a number, title, submission date, author / sponsor, and URL back to sejm.gov.pl.

## Ingestion script

[scripts/sync-sejm.ts](../scripts/sync-sejm.ts) — paginates the prints endpoint for a given term and maps each row via `buildProposalFromSejmPrint` in [src/lib/sejm-helpers.ts](../src/lib/sejm-helpers.ts).

```bash
node --experimental-strip-types scripts/sync-sejm.ts --apply --max-pages 40 --limit 200
node --experimental-strip-types scripts/sync-sejm.ts --apply --term 10
```

## Tables populated

- `proposals` — Polish prints with `country_code='PL'` and `data_source='sejm'`.
- `scrape_runs` — one row per run.

## Refresh cadence

On demand. The current Sejm term is set as the default; historical terms require explicit `--term`.

## Known quirks / rate limits

- "Druk" ≠ "bill" one-to-one. A single legislative initiative can spawn multiple prints (original, amended, committee-report variant). Poli-Track stores each as a separate proposal row.
- Titles are Polish-language; no translation layer.
- The API does not expose a stable global print ID; dedup uses `source_url`.

## Attribution requirements

Credit "Sejm Rzeczypospolitej Polskiej" with a link to the original print URL.
