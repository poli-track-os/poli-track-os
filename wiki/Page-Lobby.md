# Lobby

EU Transparency Register money trail.

## What it shows

The Lobby page is a compact "who is spending how much lobbying the EU institutions" view, backed by [LobbyFacts](Data-Source-LobbyFacts). It renders the top 50 registered organisations by declared spend, with an in-memory filter for name / category / country of HQ, a top-15 bar chart, and a grid of org cards.

Every card shows the organisation's declared category, country of HQ, and a link out to the upstream LobbyFacts datacard. The footer of the page always states the source (LobbyFacts.eu) and licence (CC-BY 4.0) so attribution is present even if a user screenshots a single card.

If the `lobby_organisations` table is empty, the page renders a friendly empty state with the exact sync command to run locally.

## Route

`/lobby`

## Data sources

- `lobby_organisations` — registered organisations with category and HQ country.
- `lobby_spend` — per-year declared spend extracted from datacard `graph_info` JSON.
- `lobby_meetings` — populated separately by `scripts/sync-lobby-meetings.ts`; most rows today are Commission-side meetings that do not map to a tracked politician.

See [LobbyFacts](Data-Source-LobbyFacts) for the ingestion pipeline and attribution requirements.

## React components

- Page: [Lobby.tsx](../src/pages/Lobby.tsx)
- Hooks: [useTopLobbyOrgs](../src/hooks/use-lobby.ts), [useTotalLobbyOrgs](../src/hooks/use-lobby.ts)

## API equivalent

- `GET /functions/v1/page/lobby?limit=&search=` — top lobby orgs by declared spend.
- `GET /functions/v1/page/lobby/{transparency_id}` — one org with full spend history, meetings, and its entity card (per-org route planned, not yet wired into the SPA).

See [API reference](API-Reference).

## MCP tool equivalent

`get_lobby_org({ transparency_id })` → `{ organisation, spend_history, meetings, linked_politicians }`. See [MCP server](MCP-Server).

## Screenshots

(not captured yet)

## Known issues

- Coverage is deliberately partial — `sync-lobbyfacts.ts` is typically run with `--max-orgs` to keep iteration fast. The footer count and the top-50 chart reflect only the rows that have been ingested so far.
- Spend amounts are self-declared by registered organisations in the EU Transparency Register. They are neither audited nor normalized across reporting periods.
- `lobby_meetings` is currently dominated by Commission-side meetings; only a handful of rows have been mapped to a `politician_id` (see [data availability snapshot](https://github.com/poli-track-os/poli-track-os/blob/main/docs/DATA_AVAILABILITY_SNAPSHOT.md)).
