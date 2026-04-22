import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { SourceBadge } from '@/components/SourceBadge';
import { ExternalLink } from 'lucide-react';

const About = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8 max-w-3xl">
        <div className="brutalist-border-b pb-2 mb-6">
          <h1 className="text-lg font-extrabold tracking-tight">ABOUT & LIMITS</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            What this platform is, which sources it reads from, and where the limits still are.
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h3 className="font-mono text-xs font-bold text-muted-foreground mb-2">WHAT POLI-TRACK IS</h3>
            <div className="brutalist-border p-4 bg-secondary/30">
              <p className="mb-2">
                Poli-Track is an open-source, time-based knowledge layer over European political data. It unifies a
                dozen public sources — the European Parliament, national parliaments, Eurostat, the EU Transparency
                Register, Parltrack, Wikipedia/Wikidata, and more — into one searchable, graph-navigable view of who
                governs, how they vote, how they spend, and who lobbies them.
              </p>
              <p>
                Everything here is public data. The browser reads directly from a Supabase-backed Postgres instance
                over a public read-only policy. No login, no tracking, no recommendation engine.
              </p>
            </div>
          </section>

          <section>
            <h3 className="font-mono text-xs font-bold text-muted-foreground mb-2">PRODUCT SURFACE</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">POLITICIAN PROFILES</div>
                <p className="text-xs text-muted-foreground">
                  Biography, committees (linked to their EP pages), financial disclosures, investments,
                  political compass, policy radar, timeline, lobby contacts, and all external links.
                </p>
              </div>
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">LEGISLATIVE PROPOSALS</div>
                <p className="text-xs text-muted-foreground">
                  EUR-Lex secondary legislation plus national-parliament proposals (DE Bundestag DIP,
                  FR Assemblée via nosdeputes.fr, and Wikidata-sourced national legislation).
                </p>
              </div>
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">BUDGETS · /budgets</div>
                <p className="text-xs text-muted-foreground">
                  Eurostat COFOG general government expenditure by function, 1995–present, EU27 + aggregate.
                  Country-over-time trend reading, current-year functional breakdown, composition-over-time shares,
                  and year-over-year change by function.
                </p>
              </div>
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">LOBBY · /lobby</div>
                <p className="text-xs text-muted-foreground">
                  EU Transparency Register organisations via LobbyFacts.eu. Top spenders, per-org profiles,
                  disclosed MEP meetings embedded on each politician's page.
                </p>
              </div>
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">TIMELINE · /timeline</div>
                <p className="text-xs text-muted-foreground">
                  Unified paginated view over every tracked political event across all sources,
                  filterable by event type and source.
                </p>
              </div>
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">RELATIONSHIPS · /relationships</div>
                <p className="text-xs text-muted-foreground">
                  Cluster views by ideology family, party alliances, and committee co-membership.
                </p>
              </div>
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">DATA · /data</div>
                <p className="text-xs text-muted-foreground">
                  Comparative dashboards across all 27 EU member states: proposals by country/status/area,
                  politicians by party family, per-capita and per-GDP ratios, data-coverage heatmap.
                </p>
              </div>
              <div className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold mb-1">LLM / GRAPH API</div>
                <p className="text-xs text-muted-foreground">
                  Every entity (person, party, country, committee, proposal, lobby org) resolves to a
                  canonical Markdown card via <code>/functions/v1/entity?kind=…&slug=…</code> — designed
                  for LLM tool-use and graph traversal.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-mono text-xs font-bold text-muted-foreground mb-2">DATA SOURCES</h3>
            <div className="brutalist-border">
              <div className="px-3 py-2 brutalist-border-b bg-secondary font-mono text-xs font-bold">
                UPSTREAM FEEDS
              </div>
              <ul className="px-3 py-2 text-xs space-y-1.5">
                <li>
                  <a href="https://www.europarl.europa.eu/meps/en/full-list/xml" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    European Parliament MEP directory <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— 718 current MEPs, country, party, committees.
                </li>
                <li>
                  <a href="https://parltrack.org/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    Parltrack <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— nightly EP activity dumps (reports, speeches, questions). ODBL v1.0.
                </li>
                <li>
                  <a href="https://ec.europa.eu/eurostat/web/government-finance-statistics" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    Eurostat COFOG (<code>gov_10a_exp</code>) <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— government expenditure by function, EU27 1995–present.
                </li>
                <li>
                  <a href="https://ec.europa.eu/eurostat/web/national-accounts/data/database" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    Eurostat macro <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— GDP (<code>nama_10_gdp</code>) and population (<code>demo_pjan</code>) by country-year.
                </li>
                <li>
                  <a href="https://www.lobbyfacts.eu/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    LobbyFacts.eu <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— EU Transparency Register republication, CC-BY 4.0.
                </li>
                <li>
                  <a href="https://eur-lex.europa.eu/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    EUR-Lex <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— EU secondary legislation via SPARQL.
                </li>
                <li>
                  <a href="https://dip.bundestag.de/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    Bundestag DIP <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— German legislative documentation, with Fraktion attribution.
                </li>
                <li>
                  <a href="https://www.nosdeputes.fr/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    nosdeputes.fr / Regards Citoyens <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— French Assemblée nationale propositions de loi, CC-BY-SA.
                </li>
                <li>
                  <a href="https://www.parlamento.pt/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    Assembleia da República biografico JSON <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— Portuguese Assembly deputies.
                </li>
                <li>
                  <a href="https://www.bundestag.de/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    Bundestag MdB-Stammdaten <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— German federal deputies roster.
                </li>
                <li>
                  <a href="https://en.wikipedia.org/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    Wikipedia + Wikidata <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— biographical enrichment, infobox parsing, QID linking, legislation cross-referencing.
                </li>
                <li>
                  <a href="https://digitallibrary.un.org/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    UN Digital Library <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— UN General Assembly country-level voting records.
                </li>
                <li>
                  <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                    GDELT v1 events <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}— daily global news events with politician name-matching.
                </li>
              </ul>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground mt-2">
              Full ingestion reference: see <code>INGESTION.md</code> and <code>ROADMAP.md</code> in the repository.
            </p>
          </section>

          <section>
            <h3 className="font-mono text-xs font-bold text-muted-foreground mb-2">ARCHITECTURAL PRINCIPLES</h3>
            <div className="brutalist-border p-4 bg-secondary/30 space-y-2">
              <p>
                <strong>Bitemporal:</strong> every fact carries a <em>valid-time</em> window (when it was true in the world)
                and an <em>observed-at</em> timestamp (when we learned it). Past states are reconstructable.
              </p>
              <p>
                <strong>Provenance-first:</strong> every row points back to the exact upstream document via
                <code>data_source</code>, <code>source_url</code>, and a 1–4 <code>trust_level</code>. LLM-extracted
                rows additionally record the model and prompt-template hash.
              </p>
              <p>
                <strong>Graph-ready:</strong> a canonical <code>entities</code> table plus typed
                <code>relationships</code> and key/value <code>claims</code> give every tracked thing a stable
                graph node, regardless of kind. Domain tables project into the graph via entity id columns.
              </p>
              <p>
                <strong>Idempotent:</strong> every ingestion script is re-runnable without duplicating. Unique
                indices on <code>(politician_id, source_url, event_timestamp)</code>, <code>(country_code, year, cofog_code)</code>, etc.
              </p>
              <p>
                <strong>LLM-navigable:</strong> entities resolve to deterministic Markdown cards via a public HTTP
                endpoint, short enough to fit in a prompt, rich enough to answer most questions.
              </p>
            </div>
          </section>

          <section>
            <h3 className="font-mono text-xs font-bold text-muted-foreground mb-2">PROVENANCE LABELS</h3>
            <div className="brutalist-border">
              <div className="px-3 py-2 brutalist-border-b bg-secondary font-mono text-xs font-bold">
                LABELS USED IN THE UI
              </div>
              <div className="px-3 py-2 brutalist-border-b text-sm space-y-1">
                <p>
                  Badges communicate how a field should be read. They are a presentation contract, not a claim
                  that every record has complete provenance coverage yet.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <SourceBadge label="Official" type="official" />
                  <SourceBadge label="Fact" type="fact" />
                  <SourceBadge label="Estimate" type="estimate" />
                  <SourceBadge label="Model" type="model" />
                </div>
              </div>
              <div className="px-3 py-2 text-sm">
                Trust levels (1–4) indicate how directly the data was sourced: 1 = official primary, 2 =
                authoritative secondary, 3 = derived/heuristic (e.g. Wikipedia), 4 = LLM-inferred.
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-mono text-xs font-bold text-muted-foreground mb-2">CURRENT LIMITS</h3>
            <ul className="space-y-1 font-mono text-xs">
              <li>× Coverage varies by country and by table. EU27 is well-served; non-EU and historical data is patchier.</li>
              <li>× Eurostat COFOG has a 12–18 month lag. The newest published year is often flagged provisional.</li>
              <li>× National budgets here are <em>implemented</em> (Eurostat), not <em>proposed</em> (which live in ministry PDFs across 24 languages).</li>
              <li>× Individual MEP expense data is not itemized publicly. We track financial disclosures (DPI/DCI) and lobby meetings, not per-receipt spending.</li>
              <li>× LLM-extracted events are marked trust-level 4 and should be treated as leads, not facts.</li>
              <li>× The platform is pre-alpha. Dataset quality comes from the upstream sources; we expose them as-is and flag what we don't know.</li>
              <li>× This is not a voting guide, recommendation engine, or policy advisory product.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-mono text-xs font-bold text-muted-foreground mb-2">OPEN SOURCE</h3>
            <div className="brutalist-border p-4 bg-secondary/30 text-xs">
              <p className="mb-2">
                All code, schema migrations, ingestion scripts, and documentation are MIT-licensed and live at{' '}
                <a href="https://github.com/poli-track-os/poli-track-os" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                  github.com/poli-track-os/poli-track-os <ExternalLink className="w-3 h-3" />
                </a>.
              </p>
              <p>
                Issues, contributions, and corrections welcome. See <code>CONTRIBUTING.md</code> and{' '}
                <code>ROADMAP.md</code> for what's next.
              </p>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default About;
