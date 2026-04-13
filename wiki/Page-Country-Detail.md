# Country detail (`/country/:id`)

A single country's page. It now acts as the main overview for that country's political landscape, combining parliament composition, geographic metadata, and recent proposals.

## What you see

- Country header with name, flag, continent, key counts, Wikipedia summary, and quick jump links.
- Country facts rail with capital, leadership, population/area when available, a hover-expand country-shape map, and a static globe locator.
- A separate `People at the top of the pyramid` section in that same rail for clickable top officeholders such as head of state, head of government, finance, health, education, economy, secretary-of-state style roles, and military leadership when available. The UI prefers internal actor pages when the person is already tracked and falls back to Wikipedia/Wikidata links otherwise.
- Parliament composition organized by party instead of one flat list.
- Party sections now include Wikimedia/Wikidata-backed descriptions and party leadership when a reliable match exists.
- Search/filter bar for actors, roles, parties, and committees inside that country.
- Collapsible party sections plus party-composition sidebar links.
- Party hover descriptions derived from tracked members and committees.
- Recent proposals filtered to the same country.
- Links from each party section to a country-scoped party detail page.

## Data sources used

| Hook | Query |
|---|---|
| `useCountryStats()` | Global roll-up (used for the stats banner) |
| `usePoliticiansByCountry(cc)` | `politicians WHERE country_code = ?` |
| `useCountryMetadata(cc, name)` | Wikimedia/Wikidata runtime metadata lookup for country facts |
| `usePartiesMetadata(name, parties)` | Wikimedia/Wikidata runtime metadata lookup for country-page party summaries |
| `useProposalsByCountry(cc)` | `proposals WHERE country_code = ? ORDER BY submitted_date DESC LIMIT 20` |

Leadership cards are assembled from two sources:

- tracked politicians in the local dataset whose roles look like executive/state offices
- Wikimedia/Wikidata officeholders as a fallback for missing positions

Equivalent roles for the same person are deduplicated by leadership category. If both sources point at the same officeholder, the page keeps the canonical office label (`Head of State`, `Head of Government`) while still preferring the internal actor page when that person already exists locally.

Party metadata uses the same Wikimedia/Wikidata source family, but only for labels that look like real parties; placeholders such as independents or unaligned buckets are left on the local derived summary to avoid bad matches.

The `:id` param in the URL is the lowercased ISO2 country code (e.g. `/country/de`). It is uppercased before the query.

## Code

- Route: `/country/:id` → `src/pages/CountryDetail.tsx`
- Related route: `/country/:countryId/party/:partyId` → `src/pages/PartyDetail.tsx`
