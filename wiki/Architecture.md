# Architecture

Poli-Track is a single-page React app that reads directly from a Supabase Postgres instance. A small set of Supabase edge functions (Deno) ingests data from public sources on a schedule.

## Topology

```
┌──────────────────────────────────────────────────────────────┐
│                    External public sources                    │
│  europarl.europa.eu   wikipedia.org   digitallibrary.un.org   │
│  ec.europa.eu (press RSS)                                     │
└───────────────┬──────────────────────────────────────────────┘
                │
                v
┌──────────────────────────────────────────────────────────────┐
│              Supabase Edge Functions (Deno)                    │
│                                                               │
│  scrape-eu-parliament ────┐                                   │
│  scrape-national-parliament ├──> enrich-wikipedia             │
│  scrape-twitter (press RSS)│                                   │
│  scrape-un-votes           │                                   │
│  seed-positions            │                                   │
│  seed-associations         │                                   │
└───────────────┬──────────────────────────────────────────────┘
                │ service-role writes
                v
┌──────────────────────────────────────────────────────────────┐
│                   Supabase Postgres                            │
│                                                               │
│  politicians · political_events · proposals                    │
│  politician_finances · politician_investments                  │
│  politician_positions · politician_associations                │
│  data_sources · scrape_runs                                    │
│                                                               │
│  RLS: every table has a permissive SELECT policy for anon.    │
│  Writes only via service-role key (edge functions).           │
└───────────────┬──────────────────────────────────────────────┘
                │ anon key
                v
┌──────────────────────────────────────────────────────────────┐
│                   React SPA (Vite + TS)                        │
│                                                               │
│  TanStack Query hooks → src/hooks/use-politicians.ts           │
│                         src/hooks/use-proposals.ts             │
│  Pages → src/pages/*.tsx                                       │
│  Components → src/components/*.tsx                             │
└──────────────────────────────────────────────────────────────┘
```

## Provider stack

```
<QueryClientProvider>
  <TooltipProvider>
    <BrowserRouter>
      <Routes>
        /                → Index
        /explore         → Explore
        /country/:id     → CountryDetail
        /actors          → Actors
        /actors/:id      → ActorDetail
        /proposals       → Proposals
        /proposals/:id   → ProposalDetail
        /relationships   → Relationships
        /data            → Data
        /about           → About
        *                → NotFound
      </Routes>
    </BrowserRouter>
    <Toaster />
    <Sonner />
  </TooltipProvider>
</QueryClientProvider>
```

## Why Supabase

- **Row-Level Security** gives us a public read API with no hand-written backend.
- **Edge Functions** are a single deploy target for the ingestion pipeline, invoked either via the GitHub Action or directly from the dashboard.
- **Generated TypeScript types** (`src/integrations/supabase/types.ts`) mean every query is typed against the actual schema.

## Where to look for what

| Concern | File(s) |
|---|---|
| Routing | `src/App.tsx` |
| Header / layout | `src/components/SiteHeader.tsx`, `src/components/SiteFooter.tsx` |
| Data fetching | `src/hooks/use-politicians.ts`, `src/hooks/use-proposals.ts` |
| Domain types | `src/data/domain.ts`, `src/integrations/supabase/types.ts` |
| Schema | `supabase/migrations/*.sql` |
| Ingestion | `supabase/functions/*/index.ts` |
| Frontend build | `vite.config.ts`, `tsconfig*.json` |
| CI | `.github/workflows/ci.yml` |
| Ingestion scheduler | `.github/workflows/ingest.yml` |

The full architecture document with diagrams, design tokens, and per-component notes is in [ARCHITECTURE.md](https://github.com/poli-track-os/poli-track-os/blob/main/ARCHITECTURE.md).
