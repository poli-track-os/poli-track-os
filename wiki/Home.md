# Poli-Track Wiki

Welcome to the Poli-Track wiki. This wiki documents what the app does, how its data gets in, and how each page of the site is supposed to be used.

![Poli-Track header](../docs/screenshots/header.png)

## What Poli-Track is

Poli-Track is an open-source explorer for European political data: members of parliament (EU + national), political parties, parliamentary proposals, politician finances, national budgets, lobbying activity, and the relationships between them. Everything is backed by Supabase; data lands in Postgres through a stack of Node scripts and Supabase edge functions and is exposed publicly (read-only) through the Supabase REST/GraphQL endpoints, a set of per-page HTTP aggregators, and an MCP server.

## Start here

- [Running locally](Running-Locally) — clone, install, env vars.
- [Architecture](Architecture) — frontend + backend topology.
- [Data model](Data-Model) — Postgres tables and how they fit together.
- [Ingestion pipeline](Ingestion-Pipeline) — scripts + edge functions.

## The pages

| Page | Route | What it's for |
|---|---|---|
| [Home](Page-Home) | `/` | Global search, recent activity, platform stats |
| [Explore](Page-Explore) | `/explore` | Country coverage overview |
| [Country detail](Page-Country-Detail) | `/country/:id` | One country's parliament + proposals |
| [Party detail](Page-Party-Detail) | `/country/:countryId/party/:partyId` | Country-scoped party roster |
| [Actors](Page-Actors) | `/actors` | All tracked politicians |
| [Actor detail](Page-Actor-Detail) | `/actors/:id` | Single politician profile |
| [Proposals](Page-Proposals) | `/proposals` | Proposal list with filters |
| [Proposal detail](Page-Proposal-Detail) | `/proposals/:id` | Single proposal view |
| [Relationships](Page-Relationships) | `/relationships` | Graph of party / committee ties |
| [Data](Page-Data) | `/data` | Comparative dashboards |
| [Budgets](Page-Budgets) | `/budgets` | National budget explorer (Eurostat COFOG) |
| [Lobby](Page-Lobby) | `/lobby` | EU Transparency Register money trail |
| [Timeline](Page-Timeline) | `/timeline` | Cross-politician event stream |
| [About](Page-About) | `/about` | Methodology and scope |

## Data sources

Every row in Poli-Track is traceable to a public upstream source. The pages below document each one — what it provides, which ingestion script writes it, which tables it populates, refresh cadence, and attribution.

| Source | Script / function | Main tables |
|---|---|---|
| [Parltrack](Data-Source-Parltrack) | `scripts/sync-parltrack.ts` | `politicians`, `political_events`, `proposals`, `claims` |
| [LobbyFacts](Data-Source-LobbyFacts) | `scripts/sync-lobbyfacts.ts`, `scripts/sync-lobby-meetings.ts` | `lobby_organisations`, `lobby_spend`, `lobby_meetings` |
| [Eurostat](Data-Source-Eurostat) | `scripts/sync-eurostat-budgets.ts`, `scripts/sync-eurostat-macro.ts` | `government_expenditure`, `country_demographics`, `cofog_functions` |
| [GDELT](Data-Source-GDELT) | `scripts/sync-gdelt.ts` | `political_events` |
| [EU Parliament](Data-Source-EU-Parliament) | `supabase/functions/scrape-eu-parliament`, `scrape-mep-*` | `politicians`, `political_events` |
| [EUR-Lex](Data-Source-EURLex) | `supabase/functions/scrape-eu-legislation` | `proposals` |
| [Bundestag DIP](Data-Source-Bundestag-DIP) | `scripts/sync-bundestag-dip.ts` | `proposals` |
| [Assemblée Nationale](Data-Source-Assemblee-Nationale) | `scripts/sync-assemblee-nationale.ts` | `proposals` |
| [Parlamento PT](Data-Source-Parlamento-PT) | `scripts/sync-parlamento-pt.ts` | `proposals` |
| [Congreso ES](Data-Source-Congreso-ES) | `scripts/sync-congreso-es.ts` | `proposals` |
| [Oireachtas](Data-Source-Oireachtas) | `scripts/sync-oireachtas.ts` | `proposals` |
| [Sejm](Data-Source-Sejm) | `scripts/sync-sejm.ts` | `proposals` |
| [Riksdag](Data-Source-Riksdag) | `scripts/sync-riksdag.ts` | `proposals` |
| [Tweede Kamer](Data-Source-Tweedekamer) | `scripts/sync-tweedekamer.ts` | `proposals` |
| [Wikipedia](Data-Source-Wikipedia) | `supabase/functions/enrich-wikipedia` | `politicians` (enrichment) |
| [Wayback Machine](Data-Source-Wayback-Machine) | `scripts/import-archive-twitter.ts` | `raw_tweets` |

## External API & MCP

Poli-Track ships a public read API and an MCP (Model Context Protocol) server on top of the same data model. Use these when you want programmatic access instead of scraping the SPA.

- [API reference](API-Reference) — HTTP endpoints, envelope shape, content negotiation (`application/json` + `text/markdown`).
- [MCP server](MCP-Server) — named tools (`get_politician`, `get_country`, `search_proposals`, …) for Claude Desktop, Cursor, and remote agents.

## Development

- [Contributing](https://github.com/poli-track-os/poli-track-os/blob/main/CONTRIBUTING.md)
- Full architecture doc: [ARCHITECTURE.md](https://github.com/poli-track-os/poli-track-os/blob/main/ARCHITECTURE.md)
- Full ingestion doc: [INGESTION.md](https://github.com/poli-track-os/poli-track-os/blob/main/INGESTION.md)
- Repository overview: [REPOSITORY_OVERVIEW.md](https://github.com/poli-track-os/poli-track-os/blob/main/REPOSITORY_OVERVIEW.md)
