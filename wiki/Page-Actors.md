# Actors

The directory of every tracked politician.

## What it shows

Actors is a filterable dense grid over the entire `politicians` table, used either as a rolodex or as the start of an investigation. Each card shows name, role, party, country, and the last update timestamp, and clicks through to [Actor detail](Page-Actor-Detail).

There is a name-and-country filter bar at the top. Filter state is held in React component state — it is not persisted to the URL on this page (unlike [Proposals](Page-Proposals)).

## Route

`/actors`

## Data sources

- `politicians` — `ORDER BY name`, the one and only query.

## React components

- Page: [Actors.tsx](../src/pages/Actors.tsx)
- Hooks: [usePoliticians](../src/hooks/use-politicians.ts)
- Components: [ActorCard.tsx](../src/components/ActorCard.tsx)

Rows are mapped from the raw Supabase shape to the app's `Actor` type via `mapPoliticianToActor` in [use-politicians.ts](../src/hooks/use-politicians.ts). That mapping is where defaults like `party = party_abbreviation ?? party_name ?? 'Independent'` happen.

## API equivalent

`GET /functions/v1/page/actors?country=&query=&limit=&offset=` — paginated politician list with country + query filters. See [API reference](API-Reference).

## MCP tool equivalent

`search_politicians({ query?, country?, party?, limit? })` — see [MCP server](MCP-Server).

## Screenshots

![Actors page](../docs/screenshots/actors.png)

## Known issues

- No server-side pagination. The whole `politicians` table (~1,600 rows as of the latest [data availability snapshot](https://github.com/poli-track-os/poli-track-os/blob/main/docs/DATA_AVAILABILITY_SNAPSHOT.md)) is fetched up front, then filtered in memory. This will stop scaling once coverage expands.
- Filter state is not URL-backed, so deep-linking to "Actors filtered by Germany" is not possible yet.
- The card grid has no explicit sorting control; ordering comes entirely from Supabase's `ORDER BY name`.
