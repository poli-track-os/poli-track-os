# Changelog

All notable changes to this project should be documented in this file.

The format is intentionally simple while the project is pre-alpha.

## [Unreleased]

### Added — unified data platform (ROADMAP.md execution, 2026-04-15)

**Data sources**
- **Eurostat COFOG** (`gov_10a_exp`) — government expenditure by function, ingested via `scripts/sync-eurostat-budgets.ts`. **8,899 rows** covering EU27 + EU27 aggregate × 1995-2024 × 11 COFOG categories.
- **Eurostat macro** (`nama_10_gdp` + `demo_pjan`) — GDP and population, ingested via `scripts/sync-eurostat-macro.ts`. **1,745 rows**. Retires the hard-coded `EU_COUNTRY_DATA` constant in `Data.tsx` (hook lives at `src/hooks/use-government-expenditure.ts`).
- **Parltrack** (`ep_meps.json.zst`, `ep_mep_activities.json.zst`) — nightly EP dumps via `scripts/sync-parltrack.ts`. Streams via the `zstd` binary, parses the framed-NDJSON format. Wrote **14,085 political_events** (rapporteur reports, opinions, motions, speeches, questions) and updated **718 MEPs**. Replaces the broken `scrape-mep-reports` pipeline (S-10 in roadmap, EP URL moved upstream).
- **LobbyFacts.eu** (CC-BY 4.0) — `scripts/sync-lobbyfacts.ts` scrapes the Transparency Register search pages + datacards into `lobby_organisations` and `lobby_spend`. **30 lobby orgs** seeded so far; live spend-history regex needs follow-up tuning to the production HTML.
- **GDELT v1 daily exports** — `scripts/sync-gdelt.ts` filters one day of global news events by politician name match.
- **Internet Archive Wayback Machine** — `scripts/import-archive-twitter.ts` walks per-handle CDX snapshots and extracts archived tweets into `raw_tweets`.
- **LLM event extraction (build-only)** — `scripts/llm-extract-events.ts` reads `raw_tweets`, calls Claude tool-use against the `prompts/event-extraction-v1.md` template, writes `political_events` with `data_source='llm_extraction'`. Hard `MAX_USD_PER_RUN` ceiling required, never auto-runs.

**Schema (26 new migrations on 2026-04-15)**
- Canonical graph: `entities`, `entity_aliases`, `relationships`, `claims`, `sources` with bitemporal `valid_from`/`valid_to` and provenance.
- Domain: `government_expenditure`, `cofog_functions` (seeded with 11 COFOG codes), `country_demographics`, `lobby_organisations`, `lobby_spend`, `lobby_meetings`, `raw_tweets`.
- Bitemporal extension on `political_events` (`valid_from`, `valid_to`, `extraction_model`, `extraction_confidence`).
- `entity_id` FK columns on `politicians` and `proposals`.
- 11 new `data_source_type` enum values: `parltrack`, `transparency_register`, `lobbyfacts`, `eurostat_cofog`, `eurostat_macro`, `integrity_watch`, `gdelt`, `archive_twitter`, `llm_extraction`, `opencorporates`, `transparency_international`.

**Unification layer (Phase 3)**
- `scripts/seed-graph.ts` projects `politicians`, `proposals`, `lobby_organisations`, countries, and parties into `entities` + `entity_aliases`. Builds `relationships` from `politician_associations` and `lobby_meetings`. Builds `claims` from politician scalar facts (party, birth_year, in_office_since, twitter_handle). Backfills `politicians.entity_id` and `proposals.entity_id`. **1,598 entities, 1,479 aliases, 64,127 relationships, 3,530 claims** seeded.
- `supabase/functions/entity/index.ts` — `GET /functions/v1/entity?kind={kind}&slug={slug}` returns a deterministic LLM-friendly Markdown card stitched from the canonical graph. Powered by the pure `renderEntityCard` helper in `src/lib/entity-card.ts`.

**New frontend pages**
- `/budgets` — country selector + year selector + 4 Recharts visualizations of COFOG expenditure (breakdown by function, 20-year stacked area, per-capita, cross-country health % of GDP).
- `/lobby` — top lobby orgs by declared spend with bar chart + searchable card grid.
- `/timeline` — paginated explorer over `political_events` with type/source filters and per-page text search.
- New nav entries for `/budgets`, `/lobby`, `/timeline`.

**Embeds on existing pages**
- `CountryBudgetPanel` (mini treemap-equivalent) embedded in `CountryDetail` aside.
- `ActorLobbyPanel` (lobby contacts list) embedded in `ActorDetail`.

**Frontend infrastructure**
- `cleanInfoboxValues` / `cleanWikiText` (`src/lib/wiki-text.ts`) for rendering MediaWiki source fragments as readable strings (templates, piped links, leaked field prefixes).
- `useGovernmentExpenditure`, `useCountryDemographics`, `useCofogFunctions`, `useExpenditureByFunction`, `useEuReferenceData` hooks.
- `useTopLobbyOrgs`, `useLobbyMeetingsForPolitician`, `useLobbyOrg`, `useLobbySpendForOrg`, `useTotalLobbyOrgs` hooks.
- `useTimeline` hook (in `Timeline.tsx`).

**Pure helper modules + tests**
- `src/lib/jsonstat-parser.ts` (8 tests) — Eurostat JSON-stat decoder.
- `src/lib/parltrack-helpers.ts` (15 tests) — Parltrack record + activity entry parsers.
- `src/lib/lobbyfacts-helpers.ts` (6 tests) — LobbyFacts search + datacard parsers.
- `src/lib/gdelt-helpers.ts` (12 tests) — GDELT v1 row parser + politician matcher.
- `src/lib/wayback-helpers.ts` (7 tests) — Wayback CDX response + Twitter HTML extractor.
- `src/lib/wiki-text.ts` (21 tests) — MediaWiki source cleanup.
- `src/lib/entity-card.ts` (12 tests) — entity Markdown renderer.
- `src/hooks/use-government-expenditure.ts` (7 tests) — buildBreakdownForYear, buildTimeSeries.

**Tooling**
- `scripts/check-data-integrity.ts` — runs read-only consistency checks; exits non-zero if anything fails. Suitable for cron monitoring.
- `scripts/clean-wiki-infobox.ts` — idempotent backfill that walks `politicians.wikipedia_data.infobox` and rewrites stored MediaWiki source as cleaned values.
- New edge function `scrape-press-rss` (copy of `scrape-twitter`) staged for the rename. The old `scrape-twitter` stays deployed until all callers are migrated.

### Fixed

- **Wikipedia infobox parser regression**: `enrich-wikipedia` was capturing the next field's value as the current field's value when the current field was empty. Rewrote `parseInfobox` as a line-based brace-balanced walker. New regression test pinned in `edge-enrich-wikipedia.test.ts`. All 722 enriched politicians backfilled in place.
- **ActorDetail layout overflow**: PARTY CONTEXT / COUNTRY CONTEXT / OFFICE RECORD key/value rows had no `min-w-0 break-words` on the value spans, causing long values like "liberalism, federalisation of the European Union" to overflow horizontally into adjacent columns. All rows now use `shrink-0` labels and `min-w-0 break-words` values.

### Changed

- `politicians`, `proposals`, `political_events` now carry `entity_id` / bitemporal columns.
- The full `npm run check` pipeline runs against **209 tests across 33 files**.

### Known limitations going forward

- LobbyFacts spend-history regex was tuned against a fixture; needs adjustment for the live HTML format. Currently inserts org rows but no spend rows.
- Parltrack `dossiers` and `votes` ingestion is scaffolded but not run on this pass; only `meps` and `mep_activities` are wired into `scripts/sync-parltrack.ts`.
- Integrity Watch per-MEP scraper is in the roadmap (§4.6) but not yet built; deferred behind LobbyFacts.
- `/graph` explorer, search-bar upgrade to `entities`, and the `/entity/:kind/:slug` interactive React page are deferred (the Markdown card endpoint is live).
- LLM extraction script is build-only — never auto-runs, requires `MAX_USD_PER_RUN` env var to even start.
