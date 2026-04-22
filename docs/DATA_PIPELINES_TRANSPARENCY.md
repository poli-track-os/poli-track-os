# Data Pipelines Transparency

This file documents every active ingestion pipeline, where data comes from, what tables are written, and the current known constraints.

## Pipeline Inventory

### Script pipelines (`scripts/*.ts`)

| Pipeline | Script | Upstream source | Main tables |
|---|---|---|---|
| Lobby register | `scripts/sync-lobbyfacts.ts` | [LobbyFacts](https://www.lobbyfacts.eu/) (EU Transparency Register republish) | `lobby_organisations`, `lobby_spend`, `scrape_runs` |
| Lobby meetings | `scripts/sync-lobby-meetings.ts` | LobbyFacts CSV exports per organisation | `lobby_meetings`, `scrape_runs` |
| Parltrack | `scripts/sync-parltrack.ts` | [Parltrack dumps](https://parltrack.org/dumps) | `politicians`, `political_events`, `proposals`, `claims`, `scrape_runs` |
| Bundestag proposals | `scripts/sync-bundestag-dip.ts` | Bundestag DIP API | `proposals`, `scrape_runs` |
| Assemblee proposals | `scripts/sync-assemblee-nationale.ts` | NosDeputes API | `proposals`, `scrape_runs` |
| Portugal proposals | `scripts/sync-parlamento-pt.ts` | api.votoaberto.org | `proposals`, `scrape_runs` |
| Spain proposals | `scripts/sync-congreso-es.ts` | Congreso open-data JSON | `proposals`, `scrape_runs` |
| Ireland proposals | `scripts/sync-oireachtas.ts` | api.oireachtas.ie | `proposals`, `scrape_runs` |
| Poland proposals | `scripts/sync-sejm.ts` | api.sejm.gov.pl | `proposals`, `scrape_runs` |
| Sweden proposals | `scripts/sync-riksdag.ts` | data.riksdagen.se | `proposals`, `scrape_runs` |
| Netherlands proposals | `scripts/sync-tweedekamer.ts` | Tweede Kamer OData | `proposals`, `scrape_runs` |
| Eurostat budgets | `scripts/sync-eurostat-budgets.ts` | Eurostat | budget tables and metadata |
| Eurostat macro | `scripts/sync-eurostat-macro.ts` | Eurostat | macro tables and metadata |
| Official rosters | `scripts/sync-official-rosters.ts` | Official parliament roster sources | `politicians` and related mappings |
| GDELT events | `scripts/sync-gdelt.ts` | GDELT | event/entity staging tables |

### Edge-function pipelines (`supabase/functions/*/index.ts`)

| Function | Upstream source | Main outputs |
|---|---|---|
| `scrape-eu-parliament` | European Parliament feeds/API | `politicians` |
| `scrape-eu-legislation` | EUR-Lex / EU legislation feed | `proposals` |
| `scrape-mep-declarations` | EP declarations pages | `politician_finances`, `politician_investments` |
| `scrape-mep-reports` | EP report data | `political_events` |
| `scrape-mep-committees` | EP committee data | committee linkage tables |
| `scrape-un-votes` | UN voting data sources | vote/event tables |
| `scrape-twitter` | configured twitter/archive sources | raw/normalized tweet tables |
| `scrape-press-rss` | RSS feeds | `political_events` staging |
| `scrape-national-parliament` | national parliament source adapters | national event/proposal staging |
| `enrich-wikipedia` | Wikipedia API | `politicians` enrichment fields |
| `sync-country-metadata` | country metadata sources | country metadata tables |
| `seed-positions` | internal mapping/seed logic | `politician_positions` |
| `seed-associations` | internal association extraction | relationship tables |
| `entity` | canonical entity composition | canonical entity tables |

## Known Data Quality and Coverage Constraints

### Lobby pipeline
- `sync-lobbyfacts.ts` currently depends on `search-all` pages that return a limited window of organisations per crawl.
- Spend history is extracted from `graph_info` JSON in datacards.
- `lobby_meetings` remains empty when no meeting ingestion source is run for politician-linked disclosures.

### National proposals
- Proposal counts are source-dependent and uneven per country.
- Some sources include many non-bill artefacts; each country helper filters as strictly as possible, but source semantics vary.

### Positions and financial assets
- `politician_investments` can be sparse/empty depending on declaration coverage and extraction quality.
- Position model quality depends on source completeness and mapping rules in `seed-positions`.

## Operational Rules Used by Pipelines

- All pipelines write provenance (`data_source`, `source_url`) wherever supported.
- Writes are idempotent via `upsert` and uniqueness keys (`source_url` or source-specific compound keys).
- `scrape_runs` logging is attempted for every apply run.
- `increment_total_records` is called for tracked source types when successful.

## How To Reproduce Ingestion Locally

Examples:

- Lobby:  
  `node --experimental-strip-types scripts/sync-lobbyfacts.ts --apply --max-orgs 200`
- Portugal proposals:  
  `node --experimental-strip-types scripts/sync-parlamento-pt.ts --apply --max-pages 20 --limit 100`
- Spain proposals:  
  `node --experimental-strip-types scripts/sync-congreso-es.ts --apply`
- Ireland proposals:  
  `node --experimental-strip-types scripts/sync-oireachtas.ts --apply --max-pages 40 --limit 50`
- Poland proposals:  
  `node --experimental-strip-types scripts/sync-sejm.ts --apply --max-pages 40 --limit 200`
- Sweden proposals:  
  `node --experimental-strip-types scripts/sync-riksdag.ts --apply --max-pages 40 --size 100`
- Netherlands proposals:  
  `node --experimental-strip-types scripts/sync-tweedekamer.ts --apply --max-pages 40 --top 200`

## Audit Scope

This file documents pipeline topology and expected writes. For current row counts and live coverage, see `docs/DATA_AVAILABILITY_SNAPSHOT.md`.
