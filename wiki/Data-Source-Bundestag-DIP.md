# Data source: Bundestag DIP

German federal legislative proposals.

## Upstream URL & license

- URL: <https://search.dip.bundestag.de/api/v1>
- API docs: <https://dip.bundestag.api.bund.dev/>
- License: Bundestag-provided open data, free re-use with attribution.
- Key required: `BUNDESTAG_DIP_API_KEY` (request at `parlamentsdokumentation@bundestag.de`).

## What it provides

The Dokumentations- und Informationssystem für Parlamentarische Vorgänge (DIP) is the Bundestag's legislative metadata API. Poli-Track reads the `vorgang` (proceedings) endpoint, which carries:

- Title (with full Fraktion attribution in the `initiative` field)
- Status through the legislative process
- Wahlperiode (electoral term)
- Document references and URLs back to `bundestag.de`

The richer party attribution on German rows — "SPD / Grüne / FDP" rather than "Coalition" — comes from the Bundestag's own initiative field rather than from inference.

## Ingestion script

[scripts/sync-bundestag-dip.ts](../scripts/sync-bundestag-dip.ts) — pages through the DIP `vorgang` list and maps each row via `buildProposalFromVorgang` in [src/lib/bundestag-dip-helpers.ts](../src/lib/bundestag-dip-helpers.ts).

```bash
node --experimental-strip-types scripts/sync-bundestag-dip.ts --apply --wahlperiode 20 --max-pages 50
```

Requires `BUNDESTAG_DIP_API_KEY` in the environment.

## Tables populated

- `proposals` — German federal proposals with `country_code='DE'` and `data_source='bundestag_dip'`.
- `scrape_runs` — one row per run.

## Refresh cadence

On demand. Default per-run cap is 50 pages.

## Known quirks / rate limits

- DIP requires an API key; there is no anonymous access. Keep the key out of commits.
- The `initiative` field is free text — the helper parses Fraktion abbreviations out of it but unusual wording can slip through as "Unknown".
- The API paginates deeply; a full historical backfill takes multiple runs.
- Status vocabulary is German; no translation layer is applied before storage.

## Attribution requirements

Credit "Deutscher Bundestag — DIP" on any public rendering of the data.
