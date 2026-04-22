# Proposal detail

Single proposal view.

## What it shows

The proposal dossier page. It renders a full record for one row of the `proposals` table: user-facing title and official title, status/type/jurisdiction badges, a summary paragraph, the key lifecycle dates, sponsor list, list of affected laws, the evidence count, and a link to the upstream source document.

## Route

`/proposals/:id`

## Data sources

- `proposals` — single-row query by `id`.

Depending on which country the proposal belongs to, it was originally ingested by one of the per-country scripts listed on [Proposals](Page-Proposals).

## React components

- Page: [ProposalDetail.tsx](../src/pages/ProposalDetail.tsx)
- Hooks: [useProposal](../src/hooks/use-proposals.ts)

## API equivalent

`GET /functions/v1/page/proposal/{id}` — proposal + sponsor politicians resolved to entities + affected laws + country. See [API reference](API-Reference).

## MCP tool equivalent

`get_proposal({ id })` — same shape. See [MCP server](MCP-Server).

## Screenshots

(not captured yet)

## Known issues

- `sponsors[]` and `affected_laws[]` are freeform `text[]` arrays. Sponsor strings have not been resolved to `politicians.id`, so cross-linking from this page into actor profiles is not yet possible for most rows.
- `status` is a free text column, not an enum. Values differ across sources (`committee` / `Erste Lesung` / `adopted` / `rejected`).
- Some rows are missing `vote_date` entirely because the source's publication model only exposes submission dates.
