# Actor detail (`/actors/:id`)

Single-politician profile. This is the richest page in the app — it pulls from six different tables.

## What you see

- **Header** — name, role, party, country, portrait, in-office date, Wikipedia link.
- **Biography** — first ~3000 characters of the Wikipedia article plus the infobox description line, if enriched.
- **Event timeline** — git-log-style list from `political_events`, newest first. Event types get short badges (`VOTE`, `STMT`, `JOIN`, ...).
- **Finances** — most recent year of declared salary, side income, assets, property, debts.
- **Investments** — individual holdings ranked by estimated value.
- **Political compass** — `PoliticalCompass.tsx` plots the politician's economic/social axes.
- **Policy radar** — `PolicyRadar.tsx` shows priority scores per policy area.
- **Associates** — strongest relationships from `politician_associations` (party allies, committee colleagues), both directions.
- **Proposals by country** — recent proposals from the same jurisdiction for context.

## Data sources used

| Hook | Table |
|---|---|
| `usePolitician(id)` | `politicians` |
| `usePoliticianEvents(id)` | `political_events` |
| `usePoliticianFinances(id)` | `politician_finances` |
| `usePoliticianInvestments(id)` | `politician_investments` |
| `usePoliticianPosition(id)` | `politician_positions` |
| `usePoliticianAssociates(id)` | `politician_associations` (joined both directions) |
| `useProposalsByCountry(cc)` | `proposals` (for the country context box) |

## Evidence tags

Event types carry a `source` badge (e.g. `OFFICIAL`, `NEWS`, `PARLIAMENT`) with color mapping defined in [`src/data/domain.ts`](https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/blob/main/src/data/domain.ts).

## Code

- Route: `/actors/:id` → `src/pages/ActorDetail.tsx`
- Charts: `src/components/ActorCharts.tsx`, `src/components/PoliticalCompass.tsx`, `src/components/PolicyRadar.tsx`
- Timeline: `src/components/ActorTimeline.tsx`
- Provenance: `src/components/SourceBadge.tsx`
