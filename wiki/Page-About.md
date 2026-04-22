# About

Methodology page.

## What it shows

The About page is static editorial copy. It exists to set expectations: what Poli-Track classifies as a fact, how trust levels work, how corrections are recorded, and — most importantly — what Poli-Track is deliberately **not** (a voting guide, a recommendation engine, a live dashboard, a complete ingestion platform).

Specifically the page covers:

- The source hierarchy — which upstream sources carry which trust level.
- Evidence classification — `FACT`, `INFERENCE`, `FORECAST`, `UNKNOWN`.
- Correction policy — how revisions are recorded in `political_events` and `scrape_runs`.
- The "what it's not" list — explicit non-goals.

## Route

`/about`

## Data sources

None. The page is static copy.

## React components

- Page: [About.tsx](../src/pages/About.tsx)

## API equivalent

No aggregator endpoint — the text is rendered from the React component only. See [API reference](API-Reference) for the rest of the surface.

## MCP tool equivalent

None. See [MCP server](MCP-Server) for tools covering data, not editorial text.

## Screenshots

![About page](../docs/screenshots/about.png)

## Known issues

- When the methodology changes in code (e.g. trust-level definitions in the ingesters), this page has to be updated by hand — it is not generated from the schema.
