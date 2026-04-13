# Proposals (`/proposals`)

All tracked parliamentary proposals. Filterable by country, status, and policy area.

![Proposals page](../docs/screenshots/proposals.png)

## What you see

- Filter bar for country, status, and policy area (stored in URL query string so filter state is shareable).
- Grid of proposal cards showing title, status, jurisdiction, and submission date.
- Click a card to open [Proposal Detail](Page-Proposal-Detail).
- Sidebar stats: total tracked, breakdown by country, status, and policy area.

## Data sources used

| Hook | Query |
|---|---|
| `useProposals({ countryCode, status, policyArea })` | `proposals` with optional WHERE clauses |
| `useProposalStats()` | `proposals` aggregated in JS |

Both hooks live in [`src/hooks/use-proposals.ts`](https://github.com/poli-track-os/poli-track-os/blob/main/src/hooks/use-proposals.ts). The status and type labels (`ADOPTED`, `REJECTED`, `COMMITTEE`, etc.) come from `statusLabels` in that file.

## Code

- Route: `/proposals` → `src/pages/Proposals.tsx`
- Card: `src/components/ProposalCard.tsx`
