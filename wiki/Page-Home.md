# Home

The landing page for Poli-Track.

## What it shows

The landing page exists to orient a cold visitor in three moves: let them type a name into a global search box, show them what data has moved recently, and prove the platform is populated with live counts. It is intentionally dense rather than decorative — the Index page doubles as a control panel for everyone working on the data.

You get a search bar across the top, a "recently updated" panel of politicians ordered by `updated_at DESC`, a sidebar of the latest proposals ordered by `submitted_date DESC`, and a small stats panel showing how many politicians, countries, and proposals are tracked right now.

## Route

`/`

## Data sources

- `politicians` — drives both the search index and the "recently updated" panel.
- `proposals` — latest-proposals sidebar, ordered by submission date.
- `politicians` grouped by country — platform stats box (country + party count per country).

## React components

- Page: [Index.tsx](../src/pages/Index.tsx)
- Hooks: [usePoliticians](../src/hooks/use-politicians.ts), [useCountryStats](../src/hooks/use-politicians.ts), [useProposals](../src/hooks/use-proposals.ts)
- Components: [SearchBar.tsx](../src/components/SearchBar.tsx), [ActorCard.tsx](../src/components/ActorCard.tsx), [ProposalCard.tsx](../src/components/ProposalCard.tsx)

Search is client-side only. It filters already-fetched politicians by name and country, and proposals by title/official title/summary — there is no full-text server round-trip.

## API equivalent

`GET /functions/v1/page/home` — returns the same composite shape (recent politicians, country stats, latest proposals, top countries by coverage). Documented in [API reference](API-Reference).

## MCP tool equivalent

There is no dedicated `get_home` tool; agents should call `search_politicians`, `search_proposals`, or `get_entity_card` directly. See [MCP server](MCP-Server).

## Screenshots

![Home page](../docs/screenshots/home.png)

## Known issues

- Search is in-memory over whatever `usePoliticians()` has already loaded. Rows past the initial page are not searchable until the user scrolls.
- The "platform stats" box is computed from `useCountryStats()`, which groups politicians client-side. If Supabase returns a paginated subset, the numbers will be under-counted.
- "Recently updated" mixes enrichment updates (Wikipedia) with ingestion writes, so a row can top the list even if nothing new happened in the real world.
