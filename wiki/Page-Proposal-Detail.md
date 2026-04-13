# Proposal detail (`/proposals/:id`)

Single proposal view.

## What you see

- Status, type, and jurisdiction badges.
- Title and official title.
- Summary paragraph.
- Key facts: vote date, submission date, sponsors list, affected laws list, evidence count.
- Link to the external source (`source_url`).

## Data sources used

| Hook | Table |
|---|---|
| `useProposal(id)` | `proposals WHERE id = ?` |

## Code

- Route: `/proposals/:id` → `src/pages/ProposalDetail.tsx`
