# Relationships

Graph and hierarchy views over politician-to-politician ties.

## What it shows

Relationships is the graph explorer. It renders the `politician_associations` table in three different views — ideology clusters, direct connections, and a tree — with filters for country, party, and jurisdiction. Each node is a politician; edge thickness is `politician_associations.strength`.

Clicking any node jumps to that politician's [Actor detail](Page-Actor-Detail) page.

## Route

`/relationships`

## Data sources

- `politicians` — node set.
- `politician_positions` — ideology family for clustering.
- `politician_associations` — edges, joined both directions (`politician_id` / `associate_id`).

The default seed data for associations comes from the `seed-associations` edge function, which infers ties from same-party and same-committee membership (strength 6 for party, 7 for committee) rather than from ingested vote co-sponsorship.

## React components

- Page: [Relationships.tsx](../src/pages/Relationships.tsx)
- Hooks: [usePoliticians](../src/hooks/use-politicians.ts), [useCountryStats](../src/hooks/use-politicians.ts), [useAllPositions](../src/hooks/use-politicians.ts), [usePoliticianAssociates](../src/hooks/use-politicians.ts)

## API equivalent

`GET /functions/v1/page/relationships?country=&view=clusters|tree|connections` — positions grouped by ideology family, country breakdown, party alliances. See [API reference](API-Reference).

## MCP tool equivalent

`get_graph({ seed, depth, predicates? })` — returns `{ nodes, edges }` for force-directed rendering around a seed entity. See [MCP server](MCP-Server).

## Screenshots

![Relationships page](../docs/screenshots/relationships.png)

## Known issues

- Ties are seeded, not observed. Until a real co-sponsorship ingester is wired in, every edge is a "same party" or "same committee" inference with a fixed strength.
- Ideology clustering depends on `politician_positions`; politicians with no position row (or with the `Unclassified` fallback) land in a noisy middle cluster.
- Force-directed rendering is heavy once the filtered graph exceeds ~500 nodes; the country filter is the recommended entry point.
