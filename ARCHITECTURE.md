# Poli Track Architecture

> Status: pre-alpha | Package: `poli-track` | Runtime: Node >=22, npm >=10

## System overview

Poli Track is a React single-page application for exploring EU political data. The frontend talks directly to Supabase using public read credentials, and the repository also carries the schema migrations that define the backing tables.

The important architectural truth is simple:

1. The repo is a web client plus database schema history.
2. The live UI reads from Supabase-backed tables, not from bundled mock fixtures.
3. The repo now includes both Supabase edge functions and a scheduled Node sync for official national rosters.

## Request and data flow

```text
Browser
  -> React Router route
  -> page component
  -> TanStack Query hook
  -> Supabase client
  -> public tables in Supabase
  -> mapped view models
  -> cards, charts, and detail views
```

Shared app contracts live in [`src/data/domain.ts`](./src/data/domain.ts). Those types are intentionally separate from runtime data fetching so the frontend does not depend on a mock-data file for production behavior.

## Key routes

| Route | Purpose | Primary data sources |
| --- | --- | --- |
| `/` | Home dashboard with search, recent actors, proposal highlights, country coverage | `usePoliticians`, `useCountryStats`, `useProposals` |
| `/explore` | Country coverage overview | `useCountryStats`, `usePoliticians` |
| `/country/:id` | Country detail page | `useCountryStats`, `usePoliticiansByCountry`, `useCountryMetadata`, `usePartiesMetadata`, `useProposalsByCountry` |
| `/country/:countryId/party/:partyId` | Country-scoped party detail page | `usePoliticiansByCountry`, `useCountryStats`, `useCountryMetadata`, `usePartyMetadata`, `useProposalsByCountry` |
| `/actors` | Politician directory | `usePoliticians` |
| `/actors/:id` | Politician detail page | `usePolitician`, events, finances, investments, positions, associates, proposals by country |
| `/proposals` | Proposal listing with URL-backed filters | `useProposals`, `useProposalStats` |
| `/proposals/:id` | Proposal detail view | `useProposal` |
| `/relationships` | Relationship graphs and hierarchy views | `usePoliticians`, `useCountryStats`, `useAllPositions` |
| `/data` | Comparative dashboards | `usePoliticians`, `useCountryStats`, `useProposalStats`, proposal/politician datasets plus local EU reference constants |
| `/about` | Truthful product and methodology summary | static copy |

## Repository map

```text
src/
  App.tsx                       Root providers and router
  components/                   Shared layout, cards, charts, provenance UI
  data/domain.ts                Shared domain contracts and label maps
  hooks/
    use-politicians.ts          Politician, event, finance, associate, country queries
    use-proposals.ts            Proposal queries and aggregate stats
  integrations/supabase/
    client.ts                   Environment-backed Supabase client
    types.ts                    Generated database typings
  pages/                        Route-level screens
  test/                         Vitest coverage for shell and key route behavior

supabase/
  migrations/                   Schema history for the connected backend
```

## Frontend structure

### App shell

- [`src/App.tsx`](./src/App.tsx) mounts `QueryClientProvider` and `BrowserRouter`.
- The app shell also owns the persistent day/night theme toggle and applies the root `dark` class for the Tailwind/CSS variable palette.
- Layout is handled at the page level with `SiteHeader` and `SiteFooter`.
- There is no longer a bundled toast/tooltip scaffold or generated UI kit in the live app path.

### Data access

- TanStack Query is the single server-state layer.
- `use-politicians.ts` maps Supabase rows into app-facing `Actor` and `ActorEvent` shapes.
- `use-proposals.ts` exposes proposal lists, detail queries, and aggregate stats.
- Route components compose these hooks directly; there is no extra service layer yet.

### Shared contracts

- [`src/data/domain.ts`](./src/data/domain.ts) contains the app-facing actor, event, and changelog types plus display label maps.
- This separation exists to keep production code independent from any fixture dataset.

### Page responsibilities

- Listing pages mostly filter or sort already-fetched query results.
- Detail pages perform the narrow additional queries required for richer views.
- The `Data` page also combines live query data with a local EU reference table for comparative metrics such as population and GDP-derived ratios.

## Backend assets in this repo

This repo includes SQL migrations under [`supabase/migrations/`](./supabase/migrations/) and the generated TypeScript database types under [`src/integrations/supabase/types.ts`](./src/integrations/supabase/types.ts).

It does not currently include:

- a single unified worker runtime for every upstream source
- a contributor-ready local backend bootstrap beyond the Supabase credentials used by the web app

## Configuration

The frontend expects:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Local setup uses [`.env.example`](./.env.example).

- `.env` is git-ignored and is intended for local overrides only.
- `.env.example` contains the public read defaults used by CI and the default local setup path.
- Forks or alternate deployments should override `.env` locally instead of editing tracked secrets files.

## Quality gates

The canonical verification command is:

```bash
npm run check
```

That expands to:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Current limitations

- Dataset quality is defined by the connected Supabase project, not by guarantees in this repo alone.
- Some sections show modeled or estimated values alongside factual records; the UI labels those categories where metadata exists.
- Comparative dashboards rely partly on local reference constants, not solely on database tables.
- The repo is production-hygiene focused, but it is still pre-alpha product software.
