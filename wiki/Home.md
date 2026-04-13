# Poli-Track Wiki

Welcome to the Poli-Track wiki. This wiki documents what the app does, how its data gets in, and how each page of the site is supposed to be used.

![Poli-Track header](../docs/screenshots/header.png)

## What Poli-Track is

Poli-Track is an open-source explorer for European political data: members of parliament (EU + national), political parties, parliamentary proposals, politician finances, and the relationships between them. Everything is backed by Supabase and ingested through a small set of edge functions.

## Start here

- [Running locally](Running-Locally) — clone, install, env vars.
- [Architecture](Architecture) — frontend + backend topology.
- [Data model](Data-Model) — Postgres tables and how they fit together.
- [Ingestion pipeline](Ingestion-Pipeline) — where data comes from.

## The pages

| Page | Route | What it's for |
|---|---|---|
| [Home](Page-Home) | `/` | Global search, recent activity, platform stats |
| [Explore](Page-Explore) | `/explore` | Country coverage overview |
| [Country detail](Page-Country-Detail) | `/country/:id` | One country's parliament + proposals |
| [Actors](Page-Actors) | `/actors` | All tracked politicians |
| [Actor detail](Page-Actor-Detail) | `/actors/:id` | Single politician profile |
| [Proposals](Page-Proposals) | `/proposals` | Proposal list with filters |
| [Proposal detail](Page-Proposal-Detail) | `/proposals/:id` | Single proposal view |
| [Relationships](Page-Relationships) | `/relationships` | Graph of party / committee ties |
| [Data](Page-Data) | `/data` | Comparative dashboards |
| [About](Page-About) | `/about` | Methodology and scope |

## Development

- [Contributing](https://github.com/poli-track-os/poli-track-os/blob/main/CONTRIBUTING.md)
- Full architecture doc: [ARCHITECTURE.md](https://github.com/poli-track-os/poli-track-os/blob/main/ARCHITECTURE.md)
- Full ingestion doc: [INGESTION.md](https://github.com/poli-track-os/poli-track-os/blob/main/INGESTION.md)
