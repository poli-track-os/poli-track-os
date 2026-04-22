# Data source: Parlamento PT (Voto Aberto)

Portuguese Assembleia da República legislative initiatives.

## Upstream URL & license

- URL: <https://api.votoaberto.org>
- API base: `https://api.votoaberto.org/api/v1`
- License: Voto Aberto is a civic-tech republication; attribution to the project and to the Assembleia da República as the primary source.

## What it provides

The Voto Aberto API wraps the Assembleia da República's legislative system, exposing initiatives (iniciativas) with structured JSON including title, submission date, status, author / party, and links back to parlamento.pt. It is the cleanest way to reach Portuguese bills programmatically today.

## Ingestion script

[scripts/sync-parlamento-pt.ts](../scripts/sync-parlamento-pt.ts) — paginates the initiatives endpoint and maps each row via `buildProposalFromParlamentoPt` in [src/lib/parlamento-pt-helpers.ts](../src/lib/parlamento-pt-helpers.ts).

```bash
node --experimental-strip-types scripts/sync-parlamento-pt.ts --apply --max-pages 20 --limit 100
```

## Tables populated

- `proposals` — Portuguese proposals with `country_code='PT'` and `data_source='parlamento_pt'`.
- `scrape_runs` — one row per run.

## Refresh cadence

On demand. Typical runs use `--max-pages 20`.

## Known quirks / rate limits

- The API occasionally returns detail documents with a mismatched schema vs. the list endpoint — the mapper tolerates missing keys.
- `status` is Portuguese-language free text.
- Party attribution comes from the `autoria` field which can list multiple parties as a comma-separated string.

## Attribution requirements

Credit "Assembleia da República" (primary) and "Voto Aberto" (republisher) when rendering data.
