# Data source: Assemblée Nationale (NosDéputés)

French National Assembly legislative proposals.

## Upstream URL & license

- URL: <https://www.nosdeputes.fr/>
- Data license: CC-BY-SA, maintained by the Regards Citoyens association.
- Attribution: "Source: NosDéputés.fr / Regards Citoyens (CC-BY-SA)".

## What it provides

NosDéputés is a civic-tech republication of the Assemblée Nationale's proceedings with a clean JSON API. Poli-Track uses two endpoints:

- **Deputy list per legislature** — the roster for a given term (e.g. `legislature=17`).
- **Legislative texts per deputy** — `propositions de loi` with author, party group, and text URL.

This yields rich sponsor + party (group) attribution on French rows, which the Assemblée Nationale's own API does not provide in a machine-friendly shape today.

## Ingestion script

[scripts/sync-assemblee-nationale.ts](../scripts/sync-assemblee-nationale.ts)

```bash
node --experimental-strip-types scripts/sync-assemblee-nationale.ts --apply --legislature 17 --max-pages 50
```

Maps deputy texts via `buildProposalFromDeputeTexte` / `buildProposalFromTexteloi` in [src/lib/assemblee-helpers.ts](../src/lib/assemblee-helpers.ts).

## Tables populated

- `proposals` — French proposals with `country_code='FR'` and `data_source='assemblee_nationale'`.
- `scrape_runs` — one row per run.

## Refresh cadence

On demand. Because NosDéputés is a civic project, refreshes follow their ingestion cadence — typically weekly.

## Known quirks / rate limits

- Coverage is tied to a specific `legislature` term. To pull older terms you need separate invocations.
- NosDéputés throttles aggressively; `--max-pages` exists to avoid being banned mid-run.
- "Proposition de loi" is only one of several text kinds; committee reports and rapports are not currently pulled.
- Names come in accented form — normalization is kept upstream.

## Attribution requirements

Any public use must credit both "Assemblée Nationale" (the primary source) and "NosDéputés.fr / Regards Citoyens" (the CC-BY-SA republisher) and carry the share-alike notice.
