# Proposals

All tracked parliamentary proposals.

## What it shows

Proposals is the main cross-country legislation index. It lists every bill, referendum, initiative, and counter-proposal that the ingestion pipelines have picked up, with filters for country, status, and policy area. Filter state lives in the URL query string (`?country=&status=&area=`) so a URL is shareable.

The page renders:

- A filter bar with country, status, and policy area selectors.
- A grid of proposal cards showing title, status, jurisdiction, and submission date.
- A sidebar of stats: total tracked, breakdown by country, by status, and by policy area.

Clicking any card opens [Proposal detail](Page-Proposal-Detail).

## Route

`/proposals`

## Data sources

- `proposals` — main query, with optional `WHERE country_code=`, `status=`, `policy_area=` clauses.
- `proposals` aggregates (JS side) — totals and groupings for the sidebar.

Proposal rows land via multiple ingestion pipelines — see [Parltrack](Data-Source-Parltrack), [EUR-Lex](Data-Source-EURLex), [Bundestag DIP](Data-Source-Bundestag-DIP), [Assemblée Nationale](Data-Source-Assemblee-Nationale), [Parlamento PT](Data-Source-Parlamento-PT), [Congreso ES](Data-Source-Congreso-ES), [Oireachtas](Data-Source-Oireachtas), [Sejm](Data-Source-Sejm), [Riksdag](Data-Source-Riksdag), and [Tweede Kamer](Data-Source-Tweedekamer).

## React components

- Page: [Proposals.tsx](../src/pages/Proposals.tsx)
- Hooks: [useProposals](../src/hooks/use-proposals.ts), [useProposalStats](../src/hooks/use-proposals.ts)
- Components: [ProposalCard.tsx](../src/components/ProposalCard.tsx)

`statusLabels` and `statusColors` live alongside the hooks in [use-proposals.ts](../src/hooks/use-proposals.ts).

## API equivalent

`GET /functions/v1/page/proposals?country=&status=&area=&limit=&offset=` — paginated proposals with filters and a stats sidebar. See [API reference](API-Reference).

## MCP tool equivalent

`search_proposals({ query?, country?, status?, area?, from?, to?, limit? })`. See [MCP server](MCP-Server).

## Screenshots

![Proposals page](../docs/screenshots/proposals.png)

## Known issues

- Proposal counts per country are extremely uneven — caps like `--max-pages` in the sync scripts mean some countries look "small" only because ingestion was run with a low budget.
- Source semantics vary: some upstreams include non-bill artefacts (motions, committee reports). Each country helper filters as strictly as possible but the status enum mixes across regimes.
- Policy area classification for non-EUR-Lex sources is best-effort keyword matching; it can miss translated titles.
- See [DATA_AVAILABILITY_SNAPSHOT.md](https://github.com/poli-track-os/poli-track-os/blob/main/docs/DATA_AVAILABILITY_SNAPSHOT.md) for current row counts per `data_source`.
