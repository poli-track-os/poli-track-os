# Data source: LobbyFacts

Republication of the EU Transparency Register.

## Upstream URL & license

- URL: <https://www.lobbyfacts.eu/>
- License: CC-BY 4.0. Attribution goes to ALTER-EU; attribution is rendered directly in the [Lobby page](Page-Lobby) footer as "EU Transparency Register data via LobbyFacts.eu (CC-BY 4.0)".

## What it provides

LobbyFacts republishes the EU Transparency Register with useful extras: normalized organisation names, per-org "datacards" with full declared-spend history, a search index across ~16,700 registered organisations, and CSV exports of Commission-side meetings. Poli-Track uses it for:

- Organisation directory (name, category, country of HQ, transparency ID, registration dates).
- Declared-spend history extracted from the datacard `graph_info` JSON.
- Commission-side lobby meetings (organisation ↔ Commissioner date stream).

## Ingestion script

Two scripts:

- [scripts/sync-lobbyfacts.ts](../scripts/sync-lobbyfacts.ts) — pages the LobbyFacts `search-all` listing, then fetches each org's datacard and parses spend history out of the embedded JSON.
- [scripts/sync-lobby-meetings.ts](../scripts/sync-lobby-meetings.ts) — ingests the LobbyFacts CSV exports of Commission meetings.

```bash
node --experimental-strip-types scripts/sync-lobbyfacts.ts --apply --max-orgs 200
node --experimental-strip-types scripts/sync-lobby-meetings.ts --apply
```

The `--max-orgs` flag is a courtesy cap; a full backfill touches the whole register and takes roughly an hour.

## Tables populated

- `lobby_organisations` — one row per registered org.
- `lobby_spend` — declared spend history (organisation × year × amount).
- `lobby_meetings` — Commission meetings; occasionally mapped to `politician_id` when the counterpart can be resolved.
- `scrape_runs` — one row per run.

## Refresh cadence

LobbyFacts refreshes alongside the underlying Transparency Register. In practice the Poli-Track ingester is run on demand; see [DATA_AVAILABILITY_SNAPSHOT.md](https://github.com/poli-track-os/poli-track-os/blob/main/docs/DATA_AVAILABILITY_SNAPSHOT.md) for current counts.

## Known quirks / rate limits

- `sync-lobbyfacts.ts` depends on `search-all` pages that return a limited window of organisations per crawl — partial runs produce partial coverage.
- Spend history lives in `graph_info` JSON embedded in the datacard HTML; that markup changes occasionally and the parser (`parseLobbyfactsDatacard`) has to be updated when it does.
- The Commission-meetings CSV is dominated by rows where the counterpart is a Commissioner or DG, not a tracked politician. Only a handful of rows in `lobby_meetings` currently have a non-null `politician_id`.
- The scraper uses a polite `User-Agent` identifying Poli-Track; keep that header honest if you modify the script.

## Attribution requirements

Any redistribution of LobbyFacts data must carry a CC-BY 4.0 notice and credit ALTER-EU. See <https://www.lobbyfacts.eu/about>.
