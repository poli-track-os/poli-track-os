# Actor detail

Single-politician profile — the richest page in the app.

## What it shows

Actor detail is the one place where every per-politician dataset converges. It pulls from six tables plus live Wikipedia and lays them out in a single vertical dossier: header → biography → event timeline → finances → investments → political compass → policy radar → associates → country context.

Concretely:

- **Header** — name, role, party, country, portrait, in-office date, Wikipedia link.
- **Biography** — first ~3,000 characters of the Wikipedia article plus the infobox description line, if enrichment has run.
- **Event timeline** — git-log-style list from `political_events`, newest first. Types get short badges (`VOTE`, `STMT`, `JOIN`, …).
- **Finances** — most recent year of declared salary, side income, assets, property, debts.
- **Investments** — individual holdings ranked by estimated value.
- **Political compass** — plots the politician on an economic × social axis.
- **Policy radar** — priority scores across eight policy areas.
- **Associates** — strongest ties from `politician_associations` (party allies, committee colleagues), both directions.
- **Proposals by country** — a sidebar of recent proposals from the same jurisdiction for context.

Event types carry a `source` badge (`OFFICIAL`, `NEWS`, `PARLIAMENT`, …) with colors defined in [src/data/domain.ts](../src/data/domain.ts).

## Route

`/actors/:id`

## Data sources

- `politicians` — header, biography, wiki enrichment fields.
- `political_events` — timeline.
- `politician_finances` — latest-year declared finances.
- `politician_investments` — individual holdings.
- `politician_positions` — compass + radar data.
- `politician_associations` — associates, joined both directions.
- `proposals` — same-country context block.
- Wikipedia REST (live) — biography fallback when the stored summary is short.

## React components

- Page: [ActorDetail.tsx](../src/pages/ActorDetail.tsx)
- Hooks: [usePolitician](../src/hooks/use-politicians.ts), [usePoliticianEvents](../src/hooks/use-politicians.ts), [usePoliticianFinances](../src/hooks/use-politicians.ts), [usePoliticianInvestments](../src/hooks/use-politicians.ts), [usePoliticianPosition](../src/hooks/use-politicians.ts), [useAllPositions](../src/hooks/use-politicians.ts), [usePoliticianAssociates](../src/hooks/use-politicians.ts), [useCountryMetadata](../src/hooks/use-country-metadata.ts), [usePartyMetadata](../src/hooks/use-party-metadata.ts), [useWikipediaPageSummary](../src/hooks/use-wikipedia-page.ts), [useProposalsByCountry](../src/hooks/use-proposals.ts)
- Charts: [ActorCharts.tsx](../src/components/ActorCharts.tsx), [PoliticalCompass.tsx](../src/components/PoliticalCompass.tsx), [PolicyRadar.tsx](../src/components/PolicyRadar.tsx)
- Timeline: [ActorTimeline.tsx](../src/components/ActorTimeline.tsx)
- Provenance: [SourceBadge.tsx](../src/components/SourceBadge.tsx)

## API equivalent

`GET /functions/v1/page/actor/{id}` — politician + events + finances + investments + positions + associates + lobby meetings + country proposals + Wikipedia fallback + committees + source attribution, all in one call. See [API reference](API-Reference).

## MCP tool equivalent

`get_politician({ id })` — same composite response. Pairs well with `get_voting_record({ politician_id })` and `get_timeline({ subject_id })`. See [MCP server](MCP-Server).

## Screenshots

(not captured yet)

## Known issues

- Wikipedia disambiguation is best-effort. Common names can occasionally resolve to the wrong article; guardrails are documented in [INGESTION.md](https://github.com/poli-track-os/poli-track-os/blob/main/INGESTION.md).
- `politician_investments` is currently sparse or empty for most actors — coverage depends on the source parliament publishing a structured declaration (see [data availability snapshot](https://github.com/poli-track-os/poli-track-os/blob/main/docs/DATA_AVAILABILITY_SNAPSHOT.md)).
- The compass/radar defaults to a party-family fallback via `buildEstimatedPoliticalPosition()` when `politician_positions` has no row, which the UI labels as an estimate — do not treat it as a measurement.
- UN-vote events are country-level and are attributed to every politician from that country with `trust_level=1`; the timeline marks this clearly but it is not a per-MEP roll-call.
