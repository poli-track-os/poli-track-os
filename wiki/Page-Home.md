# Home (`/`)

The landing page. Three purposes:

1. **Global search** — look up a politician, proposal, or country by name.
2. **Recent activity** — the most recently updated politicians and latest proposals.
3. **Platform stats** — live counts of tracked politicians, countries, and proposals.

![Home page](../docs/screenshots/home.png)

## What you see

- **Search bar** across the top. Filters over `politicians.name`, `proposals.title/official_title/summary`, and `politicians.country_name` in memory.
- **Recently updated** panel — politicians ordered by `updated_at DESC`, linking to [Actor Detail](Page-Actor-Detail).
- **Latest proposals** sidebar — `proposals` ordered by `submitted_date DESC`, linking to [Proposal Detail](Page-Proposal-Detail).
- **Platform status** — a small stats box showing counts per entity, powered by `useCountryStats` and `useProposalStats`.

## Data sources used

| Hook | Table |
|---|---|
| `usePoliticians()` | `politicians` |
| `useCountryStats()` | `politicians` (grouped by country) |
| `useProposals()` | `proposals` |

## Code

- Route: `/` → `src/pages/Index.tsx`
- Search: `src/components/SearchBar.tsx`
- Cards: `src/components/ActorCard.tsx`, `src/components/ProposalCard.tsx`
