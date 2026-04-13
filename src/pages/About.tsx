import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { SourceBadge } from '@/components/SourceBadge';

const About = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8 max-w-3xl">
        <div className="brutalist-border-b pb-2 mb-6">
          <h1 className="text-lg font-extrabold tracking-tight">ABOUT & LIMITS</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            What this app does today, what lives in this repo, and where the current limits still are.
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h3 className="font-mono text-xs font-bold text-muted-foreground mb-2">WHAT POLI TRACK CURRENTLY IS</h3>
            <div className="brutalist-border p-4 bg-secondary/30">
              <p className="mb-2">
                Poli Track is a pre-alpha, open-source web client for exploring <strong>EU political data</strong>. The current UI
                exposes politician profiles, proposal tracking, relationship views, country coverage pages, and comparative dashboards
                backed by the connected Supabase tables.
              </p>
              <p>
                This repository contains the frontend, shared domain types, tests, and Supabase schema migrations. It does
                not yet contain a polished end-to-end ingestion system that third parties should treat as production-grade.
              </p>
            </div>
          </section>

          <section>
            <h3 className="font-mono text-xs font-bold text-muted-foreground mb-2">CURRENT PRODUCT SURFACE</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">POLITICIAN PROFILES</div>
                <p className="text-xs text-muted-foreground">
                  Profiles can include role, party, committee data, event history, finances, investments, positions, and
                  close associates when those fields exist in the backing tables.
                </p>
              </div>
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">LEGISLATIVE PROPOSALS</div>
                <p className="text-xs text-muted-foreground">
                  Proposal cards and detail pages expose title, status, sponsors, affected laws, policy area, timing,
                  and source links when available.
                </p>
              </div>
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">RELATIONSHIPS</div>
                <p className="text-xs text-muted-foreground">
                  Network and hierarchy views derive from the stored actor, party, and association records already available
                  in the app. These views are exploratory, not canonical political-science outputs.
                </p>
              </div>
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">DATA DASHBOARDS</div>
                <p className="text-xs text-muted-foreground">
                  The data page computes comparative metrics from the stored dataset plus a small local EU reference table
                  for population, GDP, and area-based views.
                </p>
              </div>
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">SEARCH & COUNTRY VIEWS</div>
                <p className="text-xs text-muted-foreground">
                  Site search and country pages are driven by the live dataset, not placeholder labels, so country names,
                  counts, and proposal filters stay consistent across routes.
                </p>
              </div>
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">SOURCE LABELS</div>
                <p className="text-xs text-muted-foreground">
                  The UI distinguishes between official material, fact-level fields, estimates, and model-derived summaries
                  where the app has enough metadata to do so.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-mono text-xs font-bold text-muted-foreground mb-2">PROVENANCE MODEL</h3>
            <div className="brutalist-border">
              <div className="px-3 py-2 brutalist-border-b bg-secondary font-mono text-xs font-bold">
                LABELS USED IN THE UI
              </div>
              <div className="px-3 py-2 brutalist-border-b text-sm space-y-1">
                <p>
                  These badges communicate how a field or section should be read. They are a presentation contract, not a
                  claim that every record has complete provenance coverage yet.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <SourceBadge label="Official" type="official" />
                  <SourceBadge label="Fact" type="fact" />
                  <SourceBadge label="Estimate" type="estimate" />
                  <SourceBadge label="Model" type="model" />
                </div>
              </div>
              <div className="px-3 py-2 text-sm">
                The current frontend links out to source URLs when those URLs exist in the dataset. Some records also include
                Wikipedia-derived enrichment, party/position estimates, or other modeled summaries that should be treated as
                provisional rather than definitive.
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-mono text-xs font-bold text-muted-foreground mb-2">ARCHITECTURE TODAY</h3>
            <div className="brutalist-border p-4 bg-secondary/30 space-y-2">
              <p><strong>1. Frontend</strong> — React, Vite, and React Router render the SPA shell and route-level pages.</p>
              <p><strong>2. Data access</strong> — TanStack Query hooks fetch public read models from Supabase directly in the browser.</p>
              <p><strong>3. Shared contracts</strong> — App-level actor/event/changelog types live in a dedicated domain module instead of mock fixtures.</p>
              <p><strong>4. Backend assets in repo</strong> — The repository includes Supabase SQL migrations, but not a finished ingestion worker stack.</p>
            </div>
          </section>

          <section>
            <h3 className="font-mono text-xs font-bold text-muted-foreground mb-2">CURRENT LIMITS</h3>
            <ul className="space-y-1 font-mono text-xs">
              <li>× Coverage is only as complete as the connected Supabase dataset.</li>
              <li>× Not every record has the same enrichment depth, provenance detail, or refresh cadence.</li>
              <li>× Some comparative views rely on local reference data and derived estimates.</li>
              <li>× This repo is not a voting guide, recommendation engine, or policy advisory product.</li>
              <li>× The repository is not yet a complete public ingestion platform that outside contributors can operate independently.</li>
            </ul>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default About;
