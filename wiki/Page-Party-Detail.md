# Party detail

A country-scoped party page.

## What it shows

Party detail exists so each party listed on [Country detail](Page-Country-Detail) has a dedicated destination instead of being only a collapsed section. It shows who belongs to the party in this country, what proposals are moving through the local parliament, and a sidebar of Wikidata-derived party profile data (leaders, political position, ideology, founding year, website).

You see:

- Party header with country context, member counts, Wikimedia/Wikidata-backed description, and party leadership when available.
- Member cards for the politicians currently tracked under that party in that country.
- Country-level proposal context (same query as Country detail).
- Sidebar facts: leader(s), political position, ideology, founding year, website, country, capital, head of government, top roles, top committees.

## Route

`/country/:countryId/party/:partyId`

## Data sources

- `politicians` — `WHERE country_code = ?`, filtered in-memory by party.
- `proposals` — `WHERE country_code = ? ORDER BY submitted_date DESC LIMIT 20`.
- `country_metadata` — capital, flag, demographics, leadership fallback.
- Wikimedia/Wikidata (live) — party summary, leaders, profile data.

## React components

- Page: [PartyDetail.tsx](../src/pages/PartyDetail.tsx)
- Hooks: [usePoliticiansByCountry](../src/hooks/use-politicians.ts), [useCountryStats](../src/hooks/use-politicians.ts), [useCountryMetadata](../src/hooks/use-country-metadata.ts), [usePartyMetadata](../src/hooks/use-party-metadata.ts), [useProposalsByCountry](../src/hooks/use-proposals.ts)

## API equivalent

`GET /functions/v1/page/party/{country}/{party}` — politicians in party, proposals, party metadata, top committees. See [API reference](API-Reference).

## MCP tool equivalent

No dedicated `get_party` tool yet; use `get_country({ code })` and filter the `politicians_by_party` field, or call `get_entity_card({ kind: "party", slug })` for the canonical card. See [MCP server](MCP-Server).

## Screenshots

(not captured yet)

## Known issues

- Party membership is inferred from `politicians.party_name` / `party_abbreviation` as strings — there is no foreign key. Spelling variants (case, accents, translations) show up as separate parties.
- Wikidata party lookups sometimes resolve to disambiguation hubs for common words ("Green", "Left"); the page uses an exclusion list to suppress those matches but cannot catch every edge case.
- The URL `partyId` is a slug, not a stable identifier. Renaming a party upstream will break bookmarks.
