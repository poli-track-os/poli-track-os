# Party detail (`/country/:countryId/party/:partyId`)

A country-scoped party page. This route exists so party groupings on the country page have a dedicated destination instead of being only a collapsed section.

## What you see

- Party header with country context, member counts, Wikimedia/Wikidata-backed description, and party leadership when available.
- Member cards for the politicians currently tracked under that party within the selected country.
- Country-level proposal context for the same country.
- Sidebar facts such as leader(s), political position, ideology, founding year, website, country, capital, head of government, top roles, and top committees.

## Data sources used

| Hook | Query |
|---|---|
| `usePoliticiansByCountry(countryId)` | `politicians WHERE country_code = ?` |
| `useCountryStats()` | Country labels and continent roll-up |
| `useCountryMetadata(countryCode, countryName)` | Wikimedia/Wikidata runtime metadata lookup |
| `usePartyMetadata(partyName, countryName)` | Wikimedia/Wikidata runtime metadata lookup for party summary, leaders, and profile data |
| `useProposalsByCountry(countryCode)` | `proposals WHERE country_code = ? ORDER BY submitted_date DESC LIMIT 20` |

## Code

- Route: `/country/:countryId/party/:partyId` → `src/pages/PartyDetail.tsx`
