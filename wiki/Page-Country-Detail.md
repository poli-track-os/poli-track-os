# Country detail

A single country's dossier — parliament, leadership, and legislation in one view.

## What it shows

This is the main overview for a country's political landscape. It combines parliament composition (grouped by party rather than flat), key geographic and demographic facts, clickable top officeholders, and recent proposals from the same jurisdiction. Whenever a tracked actor exists locally, the page prefers the internal [Actor detail](Page-Actor-Detail) link; otherwise it falls back to Wikipedia/Wikidata.

Specifically, the page renders:

- A header with the country name, flag, continent, key counts, and a Wikipedia summary line.
- A facts rail with capital, leadership, population/area when available, a hover-expand country-shape map, and a static globe locator.
- A "People at the top of the pyramid" block listing heads of state and government, finance, health, education, economy, secretaries of state, and military leadership when available.
- Parliament composition organized by party, with Wikimedia/Wikidata-backed party descriptions and leadership.
- A search/filter bar for actors, roles, parties, and committees inside that country.
- Collapsible party sections plus a party-composition sidebar, with party descriptions derived from tracked members and committees.
- A recent proposals section filtered to the same `country_code`.
- Links from each party section out to the country-scoped [Party detail](Page-Party-Detail) page.

Leadership cards are assembled from two sources — tracked politicians whose roles look executive, plus Wikimedia/Wikidata officeholders as a fallback. Equivalent roles for the same person are deduplicated by leadership category.

## Route

`/country/:id` (the `:id` param is the lowercased ISO2 country code; it is uppercased before the Supabase query).

## Data sources

- `politicians` — `WHERE country_code = ?`, drives parliament composition and the in-country search.
- `proposals` — `WHERE country_code = ? ORDER BY submitted_date DESC LIMIT 20`, drives the "recent proposals" section.
- `country_metadata` — cached country facts (capital, leaders, demographics, officeholders JSONB).
- Wikimedia/Wikidata (live fetch, fallback) — country and party metadata when the cache is empty.

## React components

- Page: [CountryDetail.tsx](../src/pages/CountryDetail.tsx)
- Related route: [PartyDetail.tsx](../src/pages/PartyDetail.tsx)
- Hooks: [useCountryStats](../src/hooks/use-politicians.ts), [usePoliticiansByCountry](../src/hooks/use-politicians.ts), [useCountryMetadata](../src/hooks/use-country-metadata.ts), [usePartiesMetadata](../src/hooks/use-party-metadata.ts), [useProposalsByCountry](../src/hooks/use-proposals.ts)
- Country loader (fallback): [country-metadata-live.ts](../src/lib/country-metadata-live.ts)

## API equivalent

`GET /functions/v1/page/country/{code}` — country metadata, politicians grouped by party, proposals, leadership entries, and a latest-year budget snapshot in a single call. See [API reference](API-Reference).

## MCP tool equivalent

`get_country({ code })` — returns the same composite shape as the page aggregator. See [MCP server](MCP-Server).

## Screenshots

(not captured yet)

## Known issues

- Party metadata is only looked up for labels that look like real parties. Placeholders like "Independent" / "Unaligned" intentionally stay on the local derived summary to avoid bad Wikidata matches.
- Country metadata is cached in `country_metadata` and refreshed by the `sync-country-metadata` edge function with a default `staleAfterHours` of 144 h. Values can be up to six days behind Wikidata.
- "Top officeholders" depends on Wikidata having the role; a missing P39 statement on Wikidata leaves a slot blank.
