import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import DataCoverageExplorer from '@/components/DataCoverageExplorer';
import { ProvenanceBar } from '@/components/SourceBadge';
import { useThemeModeContext } from '@/lib/theme-mode-context';
import { getAvailabilityHeatmapCellStyle } from '@/lib/data-availability-heatmap';
import { buildCoverageModel } from '@/lib/data-coverage';
import { getIdeologyColor, getIdeologyFamily, resolvePoliticalPosition } from '@/lib/political-positioning';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ScatterChart, Scatter, ZAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ReferenceLine,
} from 'recharts';
import { X } from 'lucide-react';

const COLORS = [
  'hsl(215, 30%, 45%)', 'hsl(0, 55%, 45%)', 'hsl(150, 40%, 40%)',
  'hsl(45, 70%, 50%)', 'hsl(280, 30%, 50%)', 'hsl(180, 40%, 40%)',
  'hsl(30, 60%, 50%)', 'hsl(330, 40%, 45%)', 'hsl(100, 35%, 45%)',
  'hsl(200, 50%, 50%)',
];

// EU country reference data — fallback constant kept for charts that run
// inside `useDataStats` (a TanStack Query that can't easily depend on
// another hook). The live, DB-backed version is exposed via
// `useEuReferenceData()` from src/hooks/use-government-expenditure.ts and
// is preferred for any new charts. The mechanical migration of every
// reference here to the live hook is queued in ROADMAP.md §10 Phase 1f.
const EU_COUNTRY_DATA: Record<string, { population: number; gdp: number; area: number }> = {
  DE: { population: 84_482_000, gdp: 4_456, area: 357_022 },
  FR: { population: 68_170_000, gdp: 3_049, area: 551_695 },
  IT: { population: 58_850_000, gdp: 2_186, area: 301_340 },
  ES: { population: 48_345_000, gdp: 1_582, area: 505_990 },
  PL: { population: 37_750_000, gdp: 842, area: 312_696 },
  RO: { population: 19_038_000, gdp: 351, area: 238_397 },
  NL: { population: 17_811_000, gdp: 1_092, area: 41_543 },
  BE: { population: 11_686_000, gdp: 624, area: 30_528 },
  CZ: { population: 10_827_000, gdp: 335, area: 78_871 },
  GR: { population: 10_394_000, gdp: 239, area: 131_957 },
  PT: { population: 10_379_000, gdp: 287, area: 92_212 },
  SE: { population: 10_551_000, gdp: 593, area: 450_295 },
  HU: { population: 9_597_000, gdp: 203, area: 93_028 },
  AT: { population: 9_158_000, gdp: 516, area: 83_879 },
  BG: { population: 6_447_000, gdp: 114, area: 110_879 },
  DK: { population: 5_946_000, gdp: 404, area: 42_943 },
  FI: { population: 5_563_000, gdp: 300, area: 338_424 },
  SK: { population: 5_428_000, gdp: 127, area: 49_035 },
  IE: { population: 5_194_000, gdp: 545, area: 70_273 },
  HR: { population: 3_855_000, gdp: 82, area: 56_594 },
  LT: { population: 2_860_000, gdp: 77, area: 65_300 },
  SI: { population: 2_116_000, gdp: 68, area: 20_273 },
  LV: { population: 1_884_000, gdp: 43, area: 64_559 },
  EE: { population: 1_366_000, gdp: 41, area: 45_228 },
  CY: { population: 1_260_000, gdp: 32, area: 9_251 },
  LU: { population: 672_000, gdp: 87, area: 2_586 },
  MT: { population: 542_000, gdp: 20, area: 316 },
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="brutalist-border p-2 sm:p-4 bg-card">
      <div className="text-xl sm:text-3xl font-extrabold tracking-tighter">{value}</div>
      <div className="text-[9px] sm:text-xs font-mono text-muted-foreground uppercase mt-0.5 sm:mt-1">{label}</div>
      {sub && <div className="text-[9px] sm:text-xs text-muted-foreground mt-0.5 hidden sm:block">{sub}</div>}
    </div>
  );
}

// === Detail Panel (click to expand) ===
function DetailPanel({ data, onClose }: { data: { title: string; rows: Array<{ label: string; value: string | number; bar?: number; color?: string }> } | null; onClose: () => void }) {
  if (!data) return null;
  return (
    <div className="brutalist-border bg-card p-4 mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-mono text-xs font-bold">{data.title}</h4>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-1.5">
        {data.rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2 font-mono text-xs">
            <span className="text-muted-foreground min-w-[120px]">{row.label}</span>
            <span className="font-bold">{row.value}</span>
            {row.bar !== undefined && (
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden ml-2">
                <div className="h-full rounded-full" style={{ width: `${Math.min(row.bar, 100)}%`, backgroundColor: row.color || 'hsl(var(--primary))' }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// === Rich Tooltips ===

function RichBarTooltip({ active, payload, label, totalLabel, totalValue, extra }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const val = payload[0]?.value;
  const pct = totalValue ? ((val / totalValue) * 100).toFixed(1) : null;
  return (
    <div className="brutalist-border bg-background p-3 text-xs font-mono shadow-lg min-w-[180px]">
      <p className="font-bold text-sm mb-1">{d?.fullName || d?.name || label}</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Count</span>
          <span className="font-bold">{val?.toLocaleString?.() ?? val}</span>
        </div>
        {pct && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Share</span>
            <span>{pct}%</span>
          </div>
        )}
        {totalValue && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{totalLabel || 'Total'}</span>
            <span>{totalValue?.toLocaleString?.() ?? totalValue}</span>
          </div>
        )}
        {d?.population && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Population</span>
            <span>{(d.population / 1_000_000).toFixed(1)}M</span>
          </div>
        )}
        {d?.gdp && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">GDP</span>
            <span>${d.gdp}B</span>
          </div>
        )}
        {d?.perMillion !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Per Million</span>
            <span>{d.perMillion}</span>
          </div>
        )}
        {d?.perBillion !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Per $B GDP</span>
            <span>{d.perBillion}</span>
          </div>
        )}
        {d?.gdpPerPolitician !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">GDP/Politician</span>
            <span>${d.gdpPerPolitician}B</span>
          </div>
        )}
        {d?.avgSalary !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Avg Salary</span>
            <span>€{d.avgSalary.toLocaleString()}</span>
          </div>
        )}
        {d?.count !== undefined && d?.value !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Holdings</span>
            <span>{d.count}</span>
          </div>
        )}
        {extra?.(d)}
      </div>
      <div className="mt-2 pt-1 border-t border-border text-[10px] text-muted-foreground">
        Click bar for full breakdown
      </div>
    </div>
  );
}

function RichPieTooltip({ active, payload, totalValue }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  const val = d?.value;
  const pct = totalValue ? ((val / totalValue) * 100).toFixed(1) : ((d?.percent || 0) * 100).toFixed(1);
  return (
    <div className="brutalist-border bg-background p-3 text-xs font-mono shadow-lg min-w-[180px]">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d?.payload?.fill || d?.color }} />
        <span className="font-bold text-sm">{d?.name}</span>
      </div>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Value</span>
          <span className="font-bold">{val?.toLocaleString?.() ?? val}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Share</span>
          <span>{pct}%</span>
        </div>
        {totalValue && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Total</span>
            <span>{totalValue?.toLocaleString?.() ?? totalValue}</span>
          </div>
        )}
        {d?.payload?.count !== undefined && d?.payload?.value !== undefined && (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Holdings</span>
              <span>{d.payload.count}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Value</span>
              <span>€{(d.payload.value / 1000).toFixed(0)}K</span>
            </div>
          </>
        )}
      </div>
      <div className="mt-2 pt-1 border-t border-border text-[10px] text-muted-foreground">
        Click slice for details
      </div>
    </div>
  );
}

function RichScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="brutalist-border bg-background p-3 text-xs font-mono shadow-lg min-w-[200px]">
      <p className="font-bold text-sm mb-1">{d?.fullName || d?.ideology || d?.name}</p>
      <div className="space-y-0.5">
        {d?.gdp !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">GDP</span>
            <span>${d.gdp}B</span>
          </div>
        )}
        {d?.politicians !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Politicians</span>
            <span>{d.politicians}</span>
          </div>
        )}
        {d?.population !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Population</span>
            <span>{typeof d.population === 'number' && d.population < 1000 ? `${d.population.toFixed(1)}M` : d.population?.toLocaleString?.()}</span>
          </div>
        )}
        {d?.x !== undefined && (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Economic</span>
              <span>{d.x > 0 ? '+' : ''}{d.x} ({d.x > 2 ? 'Right' : d.x < -2 ? 'Left' : 'Centre'})</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Social</span>
              <span>{d.y > 0 ? '+' : ''}{d.y} ({d.y > 2 ? 'Auth' : d.y < -2 ? 'Liberal' : 'Moderate'})</span>
            </div>
          </>
        )}
        {d?.gdpPerPolitician !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">GDP per Politician</span>
            <span>${(d.gdp / d.politicians).toFixed(1)}B</span>
          </div>
        )}
      </div>
    </div>
  );
}

const PAGE_SIZE = 1000;
const DATA_SECTION_LINKS = [
  { id: 'observatory-overview', label: 'OVERVIEW' },
  { id: 'coverage-ledger', label: 'COVERAGE' },
  { id: 'financial-transparency', label: 'FINANCE' },
  { id: 'political-orientation', label: 'ORIENTATION' },
  { id: 'legislative-tracker', label: 'LEGISLATION' },
];

async function fetchAllPages<T>(fetchPage: (from: number, to: number) => Promise<T[]>) {
  const rows: T[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const chunk = await fetchPage(offset, offset + PAGE_SIZE - 1);
    rows.push(...chunk);

    if (chunk.length < PAGE_SIZE) break;
  }

  return rows;
}

// === Data hook (unchanged logic, extracted for clarity) ===
function useDataStats() {
  return useQuery({
    queryKey: ['data-stats'],
    queryFn: async () => {
      const [politicians, events, allPoliticians, eventTypeData, financesData, investmentsData, positionsData, proposalsData] = await Promise.all([
        supabase.from('politicians').select('id', { count: 'exact', head: true }),
        supabase.from('political_events').select('id', { count: 'exact', head: true }),
        fetchAllPages<any>(async (from, to) => {
          const { data, error } = await supabase
            .from('politicians')
            .select('id, name, role, country_code, country_name, biography, photo_url, wikipedia_url, wikipedia_summary, wikipedia_image_url, enriched_at, birth_year, twitter_handle, party_name, party_abbreviation, jurisdiction')
            .order('id', { ascending: true })
            .range(from, to);
          if (error) throw error;
          return data || [];
        }),
        fetchAllPages<any>(async (from, to) => {
          const { data, error } = await supabase
            .from('political_events')
            .select('event_type')
            .order('id', { ascending: true })
            .range(from, to);
          if (error) throw error;
          return data || [];
        }),
        fetchAllPages<any>(async (from, to) => {
          const { data, error } = await supabase
            .from('politician_finances')
            .select('politician_id, annual_salary, side_income, declared_assets, property_value, salary_source')
            .order('politician_id', { ascending: true })
            .range(from, to);
          if (error) throw error;
          return data || [];
        }),
        fetchAllPages<any>(async (from, to) => {
          const { data, error } = await supabase
            .from('politician_investments')
            .select('politician_id, company_name, sector, estimated_value, investment_type')
            .order('politician_id', { ascending: true })
            .range(from, to);
          if (error) throw error;
          return data || [];
        }),
        fetchAllPages<any>(async (from, to) => {
          const { data, error } = await supabase
            .from('politician_positions')
            .select('economic_score, social_score, ideology_label, eu_integration_score, environmental_score, immigration_score, education_priority, science_priority, healthcare_priority, defense_priority, economy_priority, justice_priority, social_welfare_priority, environment_priority, data_source, key_positions, politician_id, politicians!inner(party_name, party_abbreviation, country_code)')
            .order('politician_id', { ascending: true })
            .range(from, to);
          if (error) throw error;
          return data || [];
        }),
        fetchAllPages<any>(async (from, to) => {
          const { data, error } = await supabase
            .from('proposals')
            .select('country_code, country_name, status, policy_area, proposal_type, jurisdiction')
            .order('id', { ascending: true })
            .range(from, to);
          if (error) throw error;
          return data || [];
        }),
      ]);

      // Country breakdown
      const countryCounts: Record<string, { count: number; code: string }> = {};
      allPoliticians.forEach((p: any) => {
        if (!p.country_name) return;
        if (!countryCounts[p.country_name]) countryCounts[p.country_name] = { count: 0, code: p.country_code };
        countryCounts[p.country_name].count++;
      });
      const byCountry = Object.entries(countryCounts)
        .map(([name, { count, code }]) => ({ name, count, code }))
        .sort((a, b) => b.count - a.count);

      // EP Group breakdown
      const groupCounts: Record<string, number> = {};
      allPoliticians.forEach((p: any) => {
        const group = p.party_name || 'Unknown';
        const short = group
          .replace("Group of the European People's Party (Christian Democrats)", 'EPP')
          .replace('Group of the Progressive Alliance of Socialists and Democrats in the European Parliament', 'S&D')
          .replace('Renew Europe Group', 'Renew')
          .replace('Group of the Greens/European Free Alliance', 'Greens/EFA')
          .replace('European Conservatives and Reformists Group', 'ECR')
          .replace('The Left group in the European Parliament - GUE/NGL', 'The Left')
          .replace('Patriots for Europe Group', 'Patriots')
          .replace('Europe of Sovereign Nations Group', 'ESN')
          .replace('Non-attached Members', 'Non-attached');
        groupCounts[short] = (groupCounts[short] || 0) + 1;
      });
      const byGroup = Object.entries(groupCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Jurisdiction breakdown
      const jurisdictions: Record<string, number> = {};
      allPoliticians.forEach((p: any) => {
        const j = p.jurisdiction || 'unknown';
        jurisdictions[j] = (jurisdictions[j] || 0) + 1;
      });
      const byJurisdiction = Object.entries(jurisdictions)
        .map(([name, count]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), count }))
        .sort((a, b) => b.count - a.count);

      // Event types
      const eventTypes: Record<string, number> = {};
      eventTypeData.forEach((e: any) => {
        const t = e.event_type || 'unknown';
        eventTypes[t] = (eventTypes[t] || 0) + 1;
      });
      const byEventType = Object.entries(eventTypes)
        .map(([name, count]) => ({ name: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), count }))
        .sort((a, b) => b.count - a.count);

      // Enrichment stats
      const enriched = allPoliticians.filter((p: any) => p.enriched_at).length;
      const total = allPoliticians.length;

      // National parties
      const nationalParties: Record<string, { count: number; country: string }> = {};
      allPoliticians.forEach((p: any) => {
        const party = p.party_name;
        if (!party) return;
        if (!nationalParties[party]) nationalParties[party] = { count: 0, country: p.country_name };
        nationalParties[party].count++;
      });

      // === Cross-referenced data ===
      // Politicians per million people
      const perCapita = byCountry
        .filter(c => EU_COUNTRY_DATA[c.code])
        .map(c => {
          const ref = EU_COUNTRY_DATA[c.code];
          return {
            name: c.code,
            fullName: c.name,
            count: c.count,
            population: ref.population,
            gdp: ref.gdp,
            area: ref.area,
            perMillion: parseFloat(((c.count / ref.population) * 1_000_000).toFixed(1)),
          };
        })
        .sort((a, b) => b.perMillion - a.perMillion);

      // Politicians per $B GDP
      const perGdp = byCountry
        .filter(c => EU_COUNTRY_DATA[c.code])
        .map(c => {
          const ref = EU_COUNTRY_DATA[c.code];
          return {
            name: c.code,
            fullName: c.name,
            count: c.count,
            gdp: ref.gdp,
            population: ref.population,
            perBillion: parseFloat((c.count / ref.gdp).toFixed(2)),
          };
        })
        .sort((a, b) => b.perBillion - a.perBillion);

      // Scatter: GDP vs Politicians (bubble = population)
      const scatterData = byCountry
        .filter(c => EU_COUNTRY_DATA[c.code])
        .map(c => {
          const ref = EU_COUNTRY_DATA[c.code];
          return {
            name: c.code,
            fullName: c.name,
            gdp: ref.gdp,
            politicians: c.count,
            population: ref.population / 1_000_000,
          };
        });

      // Representation index: normalized score combining per-capita and per-GDP.
      //
      // Guard against an empty intersection between byCountry and the
      // hard-coded EU_COUNTRY_DATA reference table (e.g. a non-EU
      // deployment): `Math.max(...[])` returns -Infinity, which would
      // make every per-capita ratio NaN once divided through, and
      // `toFixed(0)` would render "NaN". Skip the section entirely when
      // there is no overlap.
      const safeMax = (arr: number[]): number => {
        const finite = arr.filter((n) => Number.isFinite(n) && n > 0);
        return finite.length === 0 ? 0 : Math.max(...finite);
      };
      const maxPerCap = safeMax(perCapita.map((c) => c.perMillion));
      const maxPerGdp = safeMax(perGdp.map((c) => c.perBillion));
      const topAbsolute = byCountry[0]?.count ?? 0;
      const representationIndex = (maxPerCap > 0 && maxPerGdp > 0 && topAbsolute > 0)
        ? byCountry
            .filter((c) => EU_COUNTRY_DATA[c.code])
            .map((c) => {
              const ref = EU_COUNTRY_DATA[c.code];
              const pCap = (c.count / ref.population) * 1_000_000;
              const pGdp = c.count / ref.gdp;
              const pArea = (c.count / ref.area) * 10_000;
              return {
                name: c.code,
                fullName: c.name,
                perCapita: parseFloat(((pCap / maxPerCap) * 100).toFixed(0)),
                perGdp: parseFloat(((pGdp / maxPerGdp) * 100).toFixed(0)),
                density: parseFloat(Math.min(100, pArea * 5).toFixed(0)),
                absolute: parseFloat(((c.count / topAbsolute) * 100).toFixed(0)),
              };
            })
            .sort((a, b) => (b.perCapita + b.perGdp) - (a.perCapita + a.perGdp))
            .slice(0, 8)
        : [];

      // GDP per politician (how much economic output per tracked politician)
      const gdpPerPol = byCountry
        .filter(c => EU_COUNTRY_DATA[c.code] && c.count > 0)
        .map(c => {
          const ref = EU_COUNTRY_DATA[c.code];
          return {
            name: c.code,
            fullName: c.name,
            gdpPerPolitician: parseFloat((ref.gdp / c.count).toFixed(1)),
            count: c.count,
            gdp: ref.gdp,
          };
        })
        .sort((a, b) => b.gdpPerPolitician - a.gdpPerPolitician);

      // === Financial data analysis ===
      const finances = financesData;
      const invData = investmentsData;

      // Salary distribution buckets
      const salaryBuckets = [
        { range: '< €80K', min: 0, max: 80000, count: 0 },
        { range: '€80-120K', min: 80000, max: 120000, count: 0 },
        { range: '€120-150K', min: 120000, max: 150000, count: 0 },
        { range: '€150-200K', min: 150000, max: 200000, count: 0 },
        { range: '> €200K', min: 200000, max: Infinity, count: 0 },
      ];
      finances.forEach((f: any) => {
        if (!f.annual_salary) return;
        const bucket = salaryBuckets.find(b => f.annual_salary >= b.min && f.annual_salary < b.max);
        if (bucket) bucket.count++;
      });
      const salaryDistribution = salaryBuckets.map(b => ({ name: b.range, count: b.count, min: b.min, max: b.max }));

      // Investment sectors
      const sectorTotals: Record<string, { value: number; count: number }> = {};
      invData.forEach((inv: any) => {
        const s = inv.sector || 'Other';
        if (!sectorTotals[s]) sectorTotals[s] = { value: 0, count: 0 };
        sectorTotals[s].value += inv.estimated_value || 0;
        sectorTotals[s].count++;
      });
      const bySector = Object.entries(sectorTotals)
        .map(([name, { value, count }]) => ({ name, value: Math.round(value), count }))
        .sort((a, b) => b.value - a.value);

      // Top invested companies
      const companyTotals: Record<string, { value: number; count: number; sector: string }> = {};
      invData.forEach((inv: any) => {
        const c = inv.company_name;
        if (!companyTotals[c]) companyTotals[c] = { value: 0, count: 0, sector: inv.sector || '' };
        companyTotals[c].value += inv.estimated_value || 0;
        companyTotals[c].count++;
      });
      const topCompanies = Object.entries(companyTotals)
        .map(([name, { value, count, sector }]) => ({ name, value: Math.round(value), investors: count, sector }))
        .sort((a, b) => b.investors - a.investors)
        .slice(0, 15);

      // Average salary by source (EP vs National)
      const salaryBySource: Record<string, { total: number; count: number }> = {};
      finances.forEach((f: any) => {
        const src = f.salary_source || 'Unknown';
        if (!salaryBySource[src]) salaryBySource[src] = { total: 0, count: 0 };
        salaryBySource[src].total += f.annual_salary || 0;
        salaryBySource[src].count++;
      });
      const avgSalaryBySource = Object.entries(salaryBySource)
        .map(([name, { total, count }]) => ({ name, avgSalary: Math.round(total / count), count }))
        .sort((a, b) => b.avgSalary - a.avgSalary);

      // Side income stats
      const withSideIncome = finances.filter((f: any) => (f.side_income || 0) > 0);
      const totalInvestmentValue = invData.reduce((s: number, inv: any) => s + (inv.estimated_value || 0), 0);

      // === Political orientation data ===
      const positions = positionsData.map((position: any) =>
        resolvePoliticalPosition(
          position,
          position.politicians?.party_name,
          position.politicians?.party_abbreviation,
          position.politicians?.country_code,
        ),
      );
      
      // Ideology distribution
      const ideologyCounts: Record<string, number> = {};
      positions.forEach((p: any) => {
        const label = getIdeologyFamily(p?.ideology_label);
        ideologyCounts[label] = (ideologyCounts[label] || 0) + 1;
      });
      const byIdeology = Object.entries(ideologyCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // Economic vs Social scatter (sampled for performance)
      const compassSample = positions
        .filter((p: any) => Number.isFinite(Number(p?.economic_score)) && Number.isFinite(Number(p?.social_score)))
        .filter((_: any, i: number) => i % 3 === 0) // sample every 3rd
        .map((p: any) => ({
          x: Number(p.economic_score),
          y: Number(p.social_score),
          ideology: getIdeologyFamily(p.ideology_label),
        }));

      const averagePriority = (field: string) => {
        const values = positions
          .map((position: any) => Number(position?.[field]))
          .filter((value: number) => Number.isFinite(value));
        if (values.length === 0) return 0;
        return parseFloat((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
      };

      // Average policy priorities across all politicians with a classified estimate
      const avgPriorities = positions.length > 0 ? [
        { domain: 'Education', value: averagePriority('education_priority') },
        { domain: 'Science', value: averagePriority('science_priority') },
        { domain: 'Healthcare', value: averagePriority('healthcare_priority') },
        { domain: 'Defense', value: averagePriority('defense_priority') },
        { domain: 'Economy', value: averagePriority('economy_priority') },
        { domain: 'Justice', value: averagePriority('justice_priority') },
        { domain: 'Social Welfare', value: averagePriority('social_welfare_priority') },
        { domain: 'Environment', value: averagePriority('environment_priority') },
      ] : [];

      // EU integration distribution. Use explicit predicate functions
      // instead of [min, max) half-open intervals so the boundary cases
      // match the label intent: a politician with eu_integration_score
      // = -5 is "Strong Eurosceptic" (≤ -5), not "Eurosceptic". The
      // previous version had v=-5 falling into "Eurosceptic" because
      // the bucket [-10, -5) excluded -5 itself.
      const euBuckets: { range: string; test: (v: number) => boolean; count: number }[] = [
        { range: 'Strong Eurosceptic', test: (v) => v <= -5, count: 0 },
        { range: 'Eurosceptic', test: (v) => v > -5 && v < -1, count: 0 },
        { range: 'Neutral', test: (v) => v >= -1 && v <= 1, count: 0 },
        { range: 'Pro-EU', test: (v) => v > 1 && v < 5, count: 0 },
        { range: 'Strong Pro-EU', test: (v) => v >= 5, count: 0 },
      ];
      positions.forEach((p: any) => {
        if (!Number.isFinite(Number(p?.eu_integration_score))) return;
        const v = Number(p.eu_integration_score);
        const bucket = euBuckets.find((b) => b.test(v));
        if (bucket) bucket.count++;
      });
      const euDistribution = euBuckets.map(b => ({ name: b.range, count: b.count }));

      // === Data Availability / Transparency Gap ===
      const allPols = allPoliticians;
      const financeIds = new Set(finances.map((f: any) => f.politician_id));
      const investIds = new Set(invData.map((i: any) => i.politician_id));
      const positionIds = new Set(positionsData.map((p: any) => p.politician_id || ''));
      const coverage = buildCoverageModel({
        politicians: allPols,
        financeIds,
        investmentIds: investIds,
        positionIds,
      });
      
      const availByCountry: Record<string, { total: number; bio: number; photo: number; wiki: number; enriched: number; finance: number; invest: number; position: number; birth: number; twitter: number }> = {};
      allPols.forEach((p: any) => {
        const key = p.country_code;
        if (!availByCountry[key]) availByCountry[key] = { total: 0, bio: 0, photo: 0, wiki: 0, enriched: 0, finance: 0, invest: 0, position: 0, birth: 0, twitter: 0 };
        const a = availByCountry[key];
        a.total++;
        if (p.biography) a.bio++;
        if (p.photo_url) a.photo++;
        if (p.wikipedia_url) a.wiki++;
        if (p.enriched_at) a.enriched++;
        if (p.birth_year) a.birth++;
        if (p.twitter_handle) a.twitter++;
        if (financeIds.has(p.id)) a.finance++;
        if (investIds.has(p.id)) a.invest++;
      });
      
      const dataAvailability = Object.entries(availByCountry)
        .filter(([code]) => EU_COUNTRY_DATA[code])
        .map(([code, a]) => {
          const fields = [a.bio, a.photo, a.wiki, a.enriched, a.finance, a.birth];
          const avgCompleteness = a.total > 0 ? fields.reduce((s, v) => s + v / a.total, 0) / fields.length * 100 : 0;
          const gapScore = 100 - avgCompleteness;
          return {
            code,
            name: byCountry.find(c => c.code === code)?.name || code,
            total: a.total,
            bioRate: a.total > 0 ? Math.round((a.bio / a.total) * 100) : 0,
            photoRate: a.total > 0 ? Math.round((a.photo / a.total) * 100) : 0,
            wikiRate: a.total > 0 ? Math.round((a.wiki / a.total) * 100) : 0,
            financeRate: a.total > 0 ? Math.round((a.finance / a.total) * 100) : 0,
            investRate: a.total > 0 ? Math.round((a.invest / a.total) * 100) : 0,
            enrichedRate: a.total > 0 ? Math.round((a.enriched / a.total) * 100) : 0,
            birthRate: a.total > 0 ? Math.round((a.birth / a.total) * 100) : 0,
            twitterRate: a.total > 0 ? Math.round((a.twitter / a.total) * 100) : 0,
            completeness: Math.round(avgCompleteness),
            gap: Math.round(gapScore),
          };
        })
        .sort((a, b) => b.gap - a.gap);

      // === Proposal data ===
      const proposals = proposalsData;
      const proposalsByCountry: Record<string, { code: string; name: string; count: number }> = {};
      const proposalsByStatus: Record<string, number> = {};
      const proposalsByArea: Record<string, number> = {};
      const proposalsByType: Record<string, number> = {};
      proposals.forEach((p: any) => {
        if (!proposalsByCountry[p.country_code]) proposalsByCountry[p.country_code] = { code: p.country_code, name: p.country_name, count: 0 };
        proposalsByCountry[p.country_code].count++;
        proposalsByStatus[p.status] = (proposalsByStatus[p.status] || 0) + 1;
        if (p.policy_area) proposalsByArea[p.policy_area] = (proposalsByArea[p.policy_area] || 0) + 1;
        proposalsByType[p.proposal_type] = (proposalsByType[p.proposal_type] || 0) + 1;
      });

      return {
        totalPoliticians: politicians.count || 0,
        totalEvents: events.count || 0,
        totalCountries: byCountry.length,
        totalParties: Object.keys(nationalParties).length,
        enriched,
        enrichmentPct: total > 0 ? Math.round((enriched / total) * 100) : 0,
        byCountry,
        byGroup,
        byJurisdiction,
        byEventType,
        perCapita,
        perGdp,
        scatterData,
        representationIndex,
        gdpPerPol,
        // Financial
        salaryDistribution,
        bySector,
        topCompanies,
        avgSalaryBySource,
        sideIncomeCount: withSideIncome.length,
        sideIncomePct: finances.length > 0 ? Math.round((withSideIncome.length / finances.length) * 100) : 0,
        totalInvestmentValue,
        totalInvestments: invData.length,
        politiciansWithInvestments: new Set(invData.map((i: any) => i.politician_id)).size,
        // Political orientation
        byIdeology,
        compassSample,
        avgPriorities,
        euDistribution,
        totalPositions: positions.length,
        // Proposals
        totalProposals: proposals.length,
        proposalsByCountry: Object.values(proposalsByCountry).sort((a, b) => b.count - a.count),
        proposalsByStatus: Object.entries(proposalsByStatus).map(([name, count]) => ({ name: name.replace(/\b\w/g, c => c.toUpperCase()), count })).sort((a, b) => b.count - a.count),
        proposalsByArea: Object.entries(proposalsByArea).map(([name, count]) => ({ name: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), count })).sort((a, b) => b.count - a.count),
        proposalsByType: Object.entries(proposalsByType).map(([name, count]) => ({ name: name.replace(/\b\w/g, c => c.toUpperCase()), count })).sort((a, b) => b.count - a.count),
        proposalCountries: Object.keys(proposalsByCountry).length,
        dataAvailability,
        coverage,
      };
    },
  });
}

const RADIAN = Math.PI / 180;
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }: any) => {
  if (percent < 0.04) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-mono font-bold">
      {name.length > 8 ? name.slice(0, 7) + '…' : name}
    </text>
  );
};

const Data = () => {
  const { data: stats, isLoading } = useDataStats();
  const { theme } = useThemeModeContext();
  const [detail, setDetail] = useState<{ title: string; rows: Array<{ label: string; value: string | number; bar?: number; color?: string }> } | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container py-12 text-center font-mono text-muted-foreground">Loading data…</div>
        <SiteFooter />
      </div>
    );
  }

  if (!stats) return null;

  const total = stats.byJurisdiction.reduce((s, j) => s + j.count, 0);
  const jurisdictionWithTotal = stats.byJurisdiction.map(j => ({ ...j, total }));
  const eventTotal = stats.byEventType.reduce((s, e) => s + e.count, 0);
  const eventsWithTotal = stats.byEventType.map(e => ({ ...e, total: eventTotal }));

  const handleBarClick = (data: any, _index: any, chartTitle: string, extra?: Record<string, string | number>) => {
    if (!data) return;
    const d = data.payload || data;
    const ref = EU_COUNTRY_DATA[d.code || d.name];
    const rows: Array<{ label: string; value: string | number; bar?: number; color?: string }> = [
      { label: 'Value', value: (d.count ?? d.perMillion ?? d.perBillion ?? d.gdpPerPolitician ?? d.avgSalary ?? d.value ?? 0).toLocaleString() },
    ];
    if (d.fullName) rows.unshift({ label: 'Country', value: d.fullName });
    if (ref) {
      rows.push({ label: 'Population', value: `${(ref.population / 1_000_000).toFixed(1)}M` });
      rows.push({ label: 'GDP', value: `$${ref.gdp}B` });
      rows.push({ label: 'Area', value: `${ref.area.toLocaleString()} km²` });
      if (d.count) {
        rows.push({ label: 'Per Million', value: ((d.count / ref.population) * 1_000_000).toFixed(1) });
        rows.push({ label: 'Per $B GDP', value: (d.count / ref.gdp).toFixed(2) });
      }
    }
    if (d.avgSalary) rows.push({ label: 'Sample Size', value: `${d.count} politicians` });
    if (d.investors) rows.push({ label: 'Investors', value: d.investors });
    if (d.sector) rows.push({ label: 'Sector', value: d.sector });
    if (extra) Object.entries(extra).forEach(([k, v]) => rows.push({ label: k, value: v }));
    
    // Add percentage bar
    const maxVal = d.count ?? d.perMillion ?? d.perBillion ?? d.gdpPerPolitician ?? 0;
    if (maxVal > 0) {
      rows.forEach(r => { if (r.label === 'Value') r.bar = 100; });
    }

    setDetail({ title: `${chartTitle}: ${d.fullName || d.name || d.range || ''}`, rows });
  };

  const handlePieClick = (data: any, chartTitle: string) => {
    if (!data) return;
    const rows: Array<{ label: string; value: string | number; bar?: number; color?: string }> = [
      { label: 'Category', value: data.name },
      { label: 'Count', value: data.count ?? data.value ?? 0 },
    ];
    if (data.total) rows.push({ label: 'Total', value: data.total });
    if (data.total) rows.push({ label: 'Share', value: `${((data.count || data.value) / data.total * 100).toFixed(1)}%`, bar: ((data.count || data.value) / data.total) * 100 });
    if (data.value && data.count) {
      rows.push({ label: 'Total Value', value: `€${(data.value / 1000).toFixed(0)}K` });
      rows.push({ label: 'Holdings', value: data.count });
    }
    setDetail({ title: `${chartTitle}: ${data.name}`, rows });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container py-4 sm:py-8 space-y-6 sm:space-y-8">
        <div id="observatory-overview">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter">DATA OBSERVATORY</h1>
          <p className="text-xs sm:text-sm font-mono text-muted-foreground mt-1">
            Live statistics from {stats.totalPoliticians.toLocaleString()} politicians across {stats.totalCountries} EU countries.
            Click any bar, slice, or point for an in-depth breakdown.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 font-mono text-[10px] sm:text-xs">
          {DATA_SECTION_LINKS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="brutalist-border px-3 py-2 bg-card hover:bg-secondary transition-colors"
            >
              {section.label}
            </a>
          ))}
        </div>

        {/* Detail panel (shown on click) */}
        <DetailPanel data={detail} onClose={() => setDetail(null)} />

        {/* Summary Stats */}
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <StatCard label="Politicians" value={stats.totalPoliticians.toLocaleString()} />
          <StatCard label="Countries" value={stats.totalCountries} />
          <StatCard label="Parties" value={stats.totalParties} />
          <StatCard label="Events" value={stats.totalEvents.toLocaleString()} />
          <StatCard label="Wikipedia" value={`${stats.enrichmentPct}%`} sub={`${stats.enriched} enriched`} />
          <StatCard label="MEPs" value={stats.byJurisdiction.find(j => j.name === 'Eu')?.count || 0} />
        </div>

        <DataCoverageExplorer coverage={stats.coverage} theme={theme} />

        {/* Row 1: Politicians per Country */}
        <section>
          <h2 className="text-lg font-extrabold tracking-tight mb-4 font-mono">POLITICIANS PER COUNTRY</h2>
          <div className="brutalist-border bg-card p-4">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={stats.byCountry} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="code" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip content={<RichBarTooltip totalValue={stats.totalPoliticians} totalLabel="Total Politicians" />} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} className="cursor-pointer"
                  onClick={(d, i) => handleBarClick(d, i, 'Politicians per Country')} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* NEW: Per Capita + Per GDP side by side */}
        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">POLITICIANS PER MILLION PEOPLE</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Political representation density — smaller countries have higher ratios</p>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={stats.perCapita} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip content={<RichBarTooltip />} />
                  <Bar dataKey="perMillion" fill="hsl(150, 40%, 40%)" radius={[2, 2, 0, 0]} className="cursor-pointer"
                    onClick={(d, i) => handleBarClick(d, i, 'Per Capita Representation')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">POLITICIANS PER $B GDP</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Political density relative to economic output</p>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={stats.perGdp} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip content={<RichBarTooltip />} />
                  <Bar dataKey="perBillion" fill="hsl(45, 70%, 50%)" radius={[2, 2, 0, 0]} className="cursor-pointer"
                    onClick={(d, i) => handleBarClick(d, i, 'Per GDP Representation')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* NEW: GDP vs Politicians Scatter */}
        <section>
          <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">GDP vs POLITICAL REPRESENTATION</h2>
          <p className="text-xs font-mono text-muted-foreground mb-4">Bubble size = population (millions). Click a bubble for details.</p>
          <div className="brutalist-border bg-card p-4">
            <ResponsiveContainer width="100%" height={420}>
              <ScatterChart margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" dataKey="gdp" name="GDP ($B)" tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" label={{ value: 'GDP ($B)', position: 'insideBottom', offset: -5, style: { fontSize: 11, fontFamily: 'monospace' } }} />
                <YAxis type="number" dataKey="politicians" name="Politicians" tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" label={{ value: 'Politicians', angle: -90, position: 'insideLeft', style: { fontSize: 11, fontFamily: 'monospace' } }} />
                <ZAxis type="number" dataKey="population" range={[40, 400]} />
                <Tooltip content={<RichScatterTooltip />} />
                <Scatter data={stats.scatterData} fill="hsl(var(--primary))" fillOpacity={0.7} stroke="hsl(var(--primary))" strokeWidth={1} className="cursor-pointer"
                  onClick={(d: any) => handleBarClick(d, 0, 'Country Detail')} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* NEW: GDP per Politician */}
        <section>
          <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">GDP PER TRACKED POLITICIAN ($B)</h2>
          <p className="text-xs font-mono text-muted-foreground mb-4">Economic output per politician — higher means fewer politicians relative to GDP</p>
          <div className="brutalist-border bg-card p-4">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={stats.gdpPerPol} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip content={<RichBarTooltip />} />
                <Bar dataKey="gdpPerPolitician" fill="hsl(280, 30%, 50%)" radius={[2, 2, 0, 0]} className="cursor-pointer"
                  onClick={(d, i) => handleBarClick(d, i, 'GDP per Politician')} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* NEW: Representation Radar */}
        <section>
          <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">REPRESENTATION INDEX — TOP 8 COUNTRIES</h2>
          <p className="text-xs font-mono text-muted-foreground mb-4">Normalized scores across per-capita, per-GDP, density, and absolute count</p>
          <div className="brutalist-border bg-card p-4">
            <ResponsiveContainer width="100%" height={420}>
              <RadarChart data={stats.representationIndex}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'monospace', fill: 'hsl(var(--foreground))' }} />
                <PolarRadiusAxis tick={{ fontSize: 9, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                <Radar name="Per Capita" dataKey="perCapita" stroke="hsl(150, 40%, 40%)" fill="hsl(150, 40%, 40%)" fillOpacity={0.15} />
                <Radar name="Per GDP" dataKey="perGdp" stroke="hsl(45, 70%, 50%)" fill="hsl(45, 70%, 50%)" fillOpacity={0.15} />
                <Radar name="Density" dataKey="density" stroke="hsl(280, 30%, 50%)" fill="hsl(280, 30%, 50%)" fillOpacity={0.15} />
                <Radar name="Absolute" dataKey="absolute" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
                <Legend formatter={(v: string) => <span className="text-xs font-mono">{v}</span>} />
                <Tooltip content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="brutalist-border bg-background p-3 text-xs font-mono shadow-lg min-w-[200px]">
                      <p className="font-bold text-sm mb-1">{d?.fullName || d?.name}</p>
                      {payload.map((p: any, i: number) => (
                        <div key={i} className="flex justify-between gap-4">
                          <span style={{ color: p.stroke }}>{p.name}</span>
                          <span className="font-bold">{p.value}</span>
                        </div>
                      ))}
                    </div>
                  );
                }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Row: EP Groups + Jurisdiction */}
        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-4 font-mono">EP POLITICAL GROUPS</h2>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={stats.byGroup} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontFamily: 'monospace' }} width={80} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip content={<RichBarTooltip totalValue={stats.totalPoliticians} totalLabel="Total Politicians" />} />
                  <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 2, 2, 0]} className="cursor-pointer"
                    onClick={(d, i) => handleBarClick(d, i, 'EP Group')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-4 font-mono">BY JURISDICTION</h2>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={380}>
                <PieChart>
                  <Pie data={jurisdictionWithTotal} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={140} label={renderCustomLabel} labelLine={false}
                    onClick={(d) => handlePieClick(d, 'Jurisdiction')}>
                    {jurisdictionWithTotal.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} className="cursor-pointer" />
                    ))}
                  </Pie>
                  <Tooltip content={<RichPieTooltip totalValue={total} />} />
                  <Legend formatter={(v: string) => <span className="text-xs font-mono">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Event Types + Country table */}
        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-4 font-mono">EVENT TYPES</h2>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={eventsWithTotal} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={renderCustomLabel} labelLine={false}
                    onClick={(d) => handlePieClick(d, 'Event Type')}>
                    {eventsWithTotal.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} className="cursor-pointer" />
                    ))}
                  </Pie>
                  <Tooltip content={<RichPieTooltip totalValue={eventTotal} />} />
                  <Legend formatter={(v: string) => <span className="text-xs font-mono">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-4 font-mono">COUNTRY BREAKDOWN</h2>
            <div className="brutalist-border bg-card overflow-hidden">
              <div className="max-h-[340px] overflow-y-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      <th className="text-left p-2 font-bold">COUNTRY</th>
                      <th className="text-right p-2 font-bold">COUNT</th>
                      <th className="text-right p-2 font-bold">PER 1M</th>
                      <th className="text-left p-2 font-bold w-1/4">DIST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byCountry.map((c, i) => {
                      const ref = EU_COUNTRY_DATA[c.code];
                      const perM = ref ? ((c.count / ref.population) * 1_000_000).toFixed(1) : '—';
                      return (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer"
                          onClick={() => handleBarClick({ ...c, fullName: c.name }, 0, 'Country Detail')}>
                          <td className="p-2">{c.code} {c.name}</td>
                          <td className="p-2 text-right font-bold">{c.count}</td>
                          <td className="p-2 text-right text-muted-foreground">{perM}</td>
                          <td className="p-2">
                            <div className="h-3 bg-muted rounded-sm overflow-hidden">
                              <div className="h-full bg-primary rounded-sm" style={{ width: `${(c.count / stats.byCountry[0].count) * 100}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {/* EP Groups table */}
        <section>
          <h2 className="text-lg font-extrabold tracking-tight mb-4 font-mono">EP GROUP MEMBERSHIP</h2>
          <div className="brutalist-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-bold">EP GROUP</th>
                    <th className="text-right p-3 font-bold">MEMBERS</th>
                    <th className="text-right p-3 font-bold">% OF TOTAL</th>
                    <th className="text-left p-3 font-bold w-1/2">SHARE</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byGroup.map((g, i) => {
                    const pct = ((g.count / stats.totalPoliticians) * 100).toFixed(1);
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer"
                        onClick={() => setDetail({
                          title: `EP Group: ${g.name}`,
                          rows: [
                            { label: 'Members', value: g.count },
                            { label: 'Share of Total', value: `${pct}%`, bar: parseFloat(pct) },
                            { label: 'Total Politicians', value: stats.totalPoliticians },
                            { label: 'Rank', value: `#${i + 1} of ${stats.byGroup.length}` },
                          ],
                        })}>
                        <td className="p-3 font-medium">{g.name}</td>
                        <td className="p-3 text-right font-bold">{g.count}</td>
                        <td className="p-3 text-right text-muted-foreground">{pct}%</td>
                        <td className="p-3">
                          <div className="h-4 bg-muted rounded-sm overflow-hidden">
                            <div className="h-full rounded-sm" style={{ width: `${(g.count / stats.byGroup[0].count) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* === DATA AVAILABILITY / TRANSPARENCY GAP === */}
        <div className="brutalist-border-b pb-2 mt-4">
          <h2 className="text-xl font-extrabold tracking-tighter font-mono">🔍 DATA AVAILABILITY GAP</h2>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            Missing data per country — higher gaps may indicate lower institutional transparency or limited open data infrastructure
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">TRANSPARENCY GAP SCORE</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">% of key fields missing — biography, photo, finances, Wikipedia, birth year</p>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={stats.dataAvailability} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="code" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip content={({ active, payload }: any) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="brutalist-border bg-background p-3 text-xs font-mono shadow-lg min-w-[220px]">
                        <p className="font-bold text-sm mb-1">{d.name} ({d.code})</p>
                        <div className="space-y-0.5">
                          <div className="flex justify-between"><span className="text-muted-foreground">Politicians</span><span>{d.total}</span></div>
                          <div className="flex justify-between font-bold" style={{ color: 'hsl(0, 55%, 45%)' }}><span>Gap Score</span><span>{d.gap}%</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Completeness</span><span>{d.completeness}%</span></div>
                          <div className="mt-1 pt-1 border-t border-border space-y-0.5">
                            <div className="flex justify-between"><span className="text-muted-foreground">Biography</span><span>{d.bioRate}%</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Photo</span><span>{d.photoRate}%</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Wikipedia</span><span>{d.wikiRate}%</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Finances</span><span>{d.financeRate}%</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Birth Year</span><span>{d.birthRate}%</span></div>
                          </div>
                        </div>
                        <div className="mt-2 pt-1 border-t border-border text-[10px] text-muted-foreground">Click bar for breakdown</div>
                      </div>
                    );
                  }} />
                  <Bar dataKey="gap" radius={[2, 2, 0, 0]} className="cursor-pointer"
                    onClick={(p: any) => {
                      if (!p) return;
                      setDetail({
                        title: `Data Gap: ${p.name} (${p.code})`,
                        rows: [
                          { label: 'Politicians', value: p.total },
                          { label: 'Gap Score', value: `${p.gap}%`, bar: p.gap, color: 'hsl(0, 55%, 45%)' },
                          { label: 'Completeness', value: `${p.completeness}%`, bar: p.completeness, color: 'hsl(142, 50%, 40%)' },
                          { label: 'Biography Available', value: `${p.bioRate}%`, bar: p.bioRate },
                          { label: 'Photo Available', value: `${p.photoRate}%`, bar: p.photoRate },
                          { label: 'Wikipedia Linked', value: `${p.wikiRate}%`, bar: p.wikiRate },
                          { label: 'Financial Data', value: `${p.financeRate}%`, bar: p.financeRate },
                          { label: 'Investment Data', value: `${p.investRate}%`, bar: p.investRate },
                          { label: 'Enriched', value: `${p.enrichedRate}%`, bar: p.enrichedRate },
                          { label: 'Birth Year', value: `${p.birthRate}%`, bar: p.birthRate },
                          { label: 'Twitter/X', value: `${p.twitterRate}%`, bar: p.twitterRate },
                        ],
                      });
                    }}>
                    {stats.dataAvailability.map((d: any, i: number) => (
                      <Cell key={i} fill={d.gap > 60 ? 'hsl(0, 55%, 45%)' : d.gap > 30 ? 'hsl(38, 80%, 50%)' : 'hsl(142, 50%, 40%)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">FIELD-BY-FIELD BREAKDOWN</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Data availability % per country — colored by completeness</p>
            <div className="brutalist-border bg-card overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      <th className="text-left p-2 font-bold">COUNTRY</th>
                      <th className="text-center p-2 font-bold" title="Biography">BIO</th>
                      <th className="text-center p-2 font-bold" title="Photo">📷</th>
                      <th className="text-center p-2 font-bold" title="Wikipedia">WIKI</th>
                      <th className="text-center p-2 font-bold" title="Financial data">💰</th>
                      <th className="text-center p-2 font-bold" title="Birth year">🎂</th>
                      <th className="text-right p-2 font-bold">GAP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.dataAvailability.map((d: any, i: number) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer"
                        onClick={() => setDetail({
                          title: `Data Gap: ${d.name} (${d.code})`,
                          rows: [
                            { label: 'Politicians', value: d.total },
                            { label: 'Gap Score', value: `${d.gap}%`, bar: d.gap, color: 'hsl(0, 55%, 45%)' },
                            { label: 'Biography', value: `${d.bioRate}%`, bar: d.bioRate },
                            { label: 'Photo', value: `${d.photoRate}%`, bar: d.photoRate },
                            { label: 'Wikipedia', value: `${d.wikiRate}%`, bar: d.wikiRate },
                            { label: 'Finances', value: `${d.financeRate}%`, bar: d.financeRate },
                            { label: 'Twitter/X', value: `${d.twitterRate}%`, bar: d.twitterRate },
                          ],
                        })}>
                        <td className="p-2">{d.code}</td>
                        <td className="p-2 text-center" style={getAvailabilityHeatmapCellStyle(d.bioRate, theme)}>{d.bioRate}%</td>
                        <td className="p-2 text-center" style={getAvailabilityHeatmapCellStyle(d.photoRate, theme)}>{d.photoRate}%</td>
                        <td className="p-2 text-center" style={getAvailabilityHeatmapCellStyle(d.wikiRate, theme)}>{d.wikiRate}%</td>
                        <td className="p-2 text-center" style={getAvailabilityHeatmapCellStyle(d.financeRate, theme)}>{d.financeRate}%</td>
                        <td className="p-2 text-center" style={getAvailabilityHeatmapCellStyle(d.birthRate, theme)}>{d.birthRate}%</td>
                        <td className="p-2 text-right font-bold" style={{ color: d.gap > 60 ? 'hsl(0, 55%, 45%)' : d.gap > 30 ? 'hsl(38, 80%, 50%)' : 'hsl(142, 50%, 40%)' }}>{d.gap}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {/* === FINANCIAL TRANSPARENCY SECTION === */}
        <div id="financial-transparency" className="brutalist-border-b pb-2 mt-4">
          <h2 className="text-xl font-extrabold tracking-tighter font-mono">💰 FINANCIAL TRANSPARENCY</h2>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            Salary, investments, and financial interests across {stats.totalPoliticians} politicians
          </p>
        </div>

        {/* Financial summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Investment Value" value={`€${(stats.totalInvestmentValue / 1_000_000).toFixed(1)}M`} />
          <StatCard label="Disclosed Investments" value={stats.totalInvestments} sub={`${stats.politiciansWithInvestments} politicians`} />
          <StatCard label="With Side Income" value={`${stats.sideIncomePct}%`} sub={`${stats.sideIncomeCount} politicians`} />
          <StatCard label="Investment Sectors" value={stats.bySector.length} />
        </div>

        {/* Salary distribution + Avg salary by source */}
        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">SALARY DISTRIBUTION</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">How politician salaries are distributed across income brackets</p>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.salaryDistribution} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip content={<RichBarTooltip totalValue={stats.salaryDistribution.reduce((s: any, b: any) => s + b.count, 0)} totalLabel="Total with salary data" />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} className="cursor-pointer"
                    onClick={(p: any) => {
                      if (!p) return;
                      setDetail({
                        title: `Salary Range: ${p.name}`,
                        rows: [
                          { label: 'Politicians', value: p.count },
                          { label: 'Range', value: p.name },
                          { label: 'Share', value: `${((p.count / stats.salaryDistribution.reduce((s: number, b: any) => s + b.count, 0)) * 100).toFixed(1)}%` },
                        ],
                      });
                    }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">AVERAGE SALARY BY SOURCE</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">EP Parliament vs National Government compensation</p>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.avgSalaryBySource} layout="vertical" margin={{ top: 5, right: 20, left: 120, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontFamily: 'monospace' }} width={120} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip content={<RichBarTooltip />} />
                  <Bar dataKey="avgSalary" fill="hsl(150, 40%, 40%)" radius={[0, 2, 2, 0]} className="cursor-pointer"
                    onClick={(p: any) => {
                      if (!p) return;
                      setDetail({
                        title: `Salary Source: ${p.name}`,
                        rows: [
                          { label: 'Average Salary', value: `€${p.avgSalary.toLocaleString()}` },
                          { label: 'Sample Size', value: `${p.count} politicians` },
                          { label: 'Source', value: p.name },
                        ],
                      });
                    }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Investment by sector + Top companies */}
        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">INVESTMENT BY SECTOR</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Where politicians put their money — total disclosed value per sector</p>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie data={stats.bySector} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={130} innerRadius={50}
                    onClick={(d) => handlePieClick(d, 'Investment Sector')}>
                    {stats.bySector.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} className="cursor-pointer" />
                    ))}
                  </Pie>
                  <Tooltip content={<RichPieTooltip totalValue={stats.totalInvestmentValue} />} />
                  <Legend formatter={(v: string) => <span className="text-xs font-mono">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">MOST POPULAR INVESTMENTS</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Companies with the most politician-investors</p>
            <div className="brutalist-border bg-card overflow-hidden">
              <div className="max-h-[390px] overflow-y-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      <th className="text-left p-2 font-bold">COMPANY</th>
                      <th className="text-left p-2 font-bold">SECTOR</th>
                      <th className="text-right p-2 font-bold">INVESTORS</th>
                      <th className="text-right p-2 font-bold">TOTAL VALUE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topCompanies.map((c: any, i: number) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer"
                        onClick={() => setDetail({
                          title: `Company: ${c.name}`,
                          rows: [
                            { label: 'Company', value: c.name },
                            { label: 'Sector', value: c.sector || 'N/A' },
                            { label: 'Politician Investors', value: c.investors },
                            { label: 'Total Value', value: `€${(c.value / 1000).toFixed(0)}K` },
                            { label: 'Avg per Investor', value: c.investors > 0 ? `€${(c.value / c.investors / 1000).toFixed(0)}K` : '—' },
                          ],
                        })}>
                        <td className="p-2 font-medium">{c.name}</td>
                        <td className="p-2"><span className="px-1.5 py-0.5 rounded text-[10px] bg-muted">{c.sector}</span></td>
                        <td className="p-2 text-right font-bold">{c.investors}</td>
                        <td className="p-2 text-right text-muted-foreground">€{(c.value / 1000).toFixed(0)}K</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {/* Sector holdings bar chart */}
        <section>
          <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">HOLDINGS PER SECTOR</h2>
          <p className="text-xs font-mono text-muted-foreground mb-4">Number of individual investment positions by sector</p>
          <div className="brutalist-border bg-card p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.bySector} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" angle={-30} textAnchor="end" interval={0} tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip content={<RichBarTooltip totalValue={stats.totalInvestments} totalLabel="Total Holdings" />} />
                <Bar dataKey="count" fill="hsl(280, 30%, 50%)" radius={[2, 2, 0, 0]} className="cursor-pointer"
                  onClick={(p: any) => {
                    if (!p) return;
                    setDetail({
                      title: `Sector: ${p.name}`,
                      rows: [
                        { label: 'Holdings', value: p.count },
                        { label: 'Total Value', value: `€${(p.value / 1000).toFixed(0)}K` },
                        { label: 'Avg per Holding', value: p.count > 0 ? `€${(p.value / p.count / 1000).toFixed(0)}K` : '—' },
                      ],
                    });
                  }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Political Ideology & Orientation */}
        <section id="political-orientation">
          <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">POLITICAL ORIENTATION</h2>
          <p className="text-xs font-mono text-muted-foreground mb-4">
            Multi-axis political positioning based on party family mapping (Chapel Hill Expert Survey methodology) · {stats.totalPositions} profiles
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Political Compass scatter */}
            <div>
              <h3 className="text-sm font-mono font-bold mb-2">POLITICAL COMPASS</h3>
              <p className="text-xs text-muted-foreground mb-2">Economic Left↔Right vs Social Liberal↔Authoritarian. Hover for ideology details.</p>
              <div className="brutalist-border bg-card p-4">
                <ResponsiveContainer width="100%" height={350}>
                  <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" dataKey="x" domain={[-10, 10]} name="Economic"
                      tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))"
                      label={{ value: '← Left — Right →', position: 'bottom', fontSize: 10, fontFamily: 'monospace', fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis type="number" dataKey="y" domain={[-10, 10]} name="Social"
                      tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))"
                      label={{ value: '← Liberal — Auth →', angle: -90, position: 'left', fontSize: 10, fontFamily: 'monospace', fill: 'hsl(var(--muted-foreground))' }} />
                    <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeOpacity={0.4} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeOpacity={0.4} />
                    <Tooltip content={<RichScatterTooltip />} />
                    <Scatter data={stats.compassSample} className="cursor-pointer"
                      onClick={(d: any) => {
                        setDetail({
                          title: `Ideology: ${d.ideology}`,
                          rows: [
                            { label: 'Economic Score', value: `${d.x > 0 ? '+' : ''}${d.x}`, bar: ((d.x + 10) / 20) * 100 },
                            { label: 'Social Score', value: `${d.y > 0 ? '+' : ''}${d.y}`, bar: ((d.y + 10) / 20) * 100 },
                            { label: 'Quadrant', value: `${d.x > 0 ? 'Right' : 'Left'}-${d.y > 0 ? 'Auth' : 'Liberal'}` },
                            { label: 'Ideology', value: d.ideology },
                          ],
                        });
                      }}>
                      {stats.compassSample.map((d: any, i: number) => (
                        <Cell key={i} fill={getIdeologyColor(d.ideology)} opacity={0.5} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {Object.entries({
                    'Social Democrat': getIdeologyColor('Social Democrat'),
                    'Green / Ecologist': getIdeologyColor('Green / Ecologist'),
                    'Democratic Socialist': getIdeologyColor('Democratic Socialist'),
                    'Christian Democrat / Centre-Right': getIdeologyColor('Christian Democrat / Centre-Right'),
                    Liberal: getIdeologyColor('Liberal'),
                    Centrist: getIdeologyColor('Centrist'),
                    'National Conservative': getIdeologyColor('National Conservative'),
                    'Right-Wing Populist': getIdeologyColor('Right-Wing Populist'),
                    Unclassified: getIdeologyColor('Unclassified'),
                  }).map(([label, color]) => (
                    <div key={label} className="flex items-center gap-1 text-[9px] font-mono">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Ideology distribution */}
            <div>
              <h3 className="text-sm font-mono font-bold mb-2">IDEOLOGY DISTRIBUTION</h3>
              <p className="text-xs text-muted-foreground mb-2">Number of politicians per ideology family</p>
              <div className="brutalist-border bg-card p-4">
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={stats.byIdeology} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 9, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip content={<RichBarTooltip totalValue={stats.totalPositions} totalLabel="Total Mapped" />} />
                    <Bar dataKey="count" radius={[0, 2, 2, 0]} className="cursor-pointer"
                      onClick={(p: any) => {
                        if (!p) return;
                        setDetail({
                          title: `Ideology: ${p.name}`,
                          rows: [
                            { label: 'Politicians', value: p.count },
                            { label: 'Share', value: `${((p.count / stats.totalPositions) * 100).toFixed(1)}%`, bar: (p.count / stats.totalPositions) * 100 },
                            { label: 'Total Mapped', value: stats.totalPositions },
                          ],
                        });
                      }}>
                      {stats.byIdeology.map((d: any, i: number) => (
                        <Cell key={i} fill={getIdeologyColor(d.name)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Average policy priorities radar */}
            <div>
              <h3 className="text-sm font-mono font-bold mb-2">AVERAGE POLICY PRIORITIES</h3>
              <p className="text-xs text-muted-foreground mb-2">Mean priority score across all tracked politicians (0-10)</p>
              <div className="brutalist-border bg-card p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={stats.avgPriorities} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="domain" tick={{ fontSize: 10, fontFamily: 'monospace', fill: 'hsl(var(--muted-foreground))' }} />
                    <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 9 }} tickCount={6} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip content={({ active, payload }: any) => {
                      if (!active || !payload?.[0]) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="brutalist-border bg-background p-3 text-xs font-mono shadow-lg min-w-[180px]">
                          <div className="font-bold text-sm mb-1">{d.domain}</div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Avg Priority</span>
                            <span className="font-bold">{d.value}/10</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Sample</span>
                            <span>{stats.totalPositions} politicians</span>
                          </div>
                          <div className="mt-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${(d.value / 10) * 100}%` }} />
                          </div>
                        </div>
                      );
                    }} />
                    <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* EU Integration distribution */}
            <div>
              <h3 className="text-sm font-mono font-bold mb-2">EU INTEGRATION STANCE</h3>
              <p className="text-xs text-muted-foreground mb-2">Distribution of pro-EU vs eurosceptic positions</p>
              <div className="brutalist-border bg-card p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.euDistribution} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip content={<RichBarTooltip totalValue={stats.euDistribution.reduce((s: any, b: any) => s + b.count, 0)} totalLabel="Total Mapped" />} />
                    <Bar dataKey="count" radius={[2, 2, 0, 0]} className="cursor-pointer"
                      onClick={(p: any) => {
                        if (!p) return;
                        const euTotal = stats.euDistribution.reduce((s: number, b: any) => s + b.count, 0);
                        setDetail({
                          title: `EU Stance: ${p.name}`,
                          rows: [
                            { label: 'Politicians', value: p.count },
                            { label: 'Share', value: `${((p.count / euTotal) * 100).toFixed(1)}%`, bar: (p.count / euTotal) * 100 },
                            { label: 'Category', value: p.name },
                            { label: 'Total Mapped', value: euTotal },
                          ],
                        });
                      }}>
                      {stats.euDistribution.map((_: any, i: number) => {
                        const euColors = ['hsl(0, 55%, 45%)', 'hsl(25, 60%, 50%)', 'hsl(0, 0%, 55%)', 'hsl(215, 45%, 50%)', 'hsl(215, 60%, 40%)'];
                        return <Cell key={i} fill={euColors[i]} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        {/* === LEGISLATIVE TRACKER === */}
        <div id="legislative-tracker" className="brutalist-border-b pb-2 mt-4">
          <h2 className="text-xl font-extrabold tracking-tighter font-mono">📜 LEGISLATIVE TRACKER</h2>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            {stats.totalProposals} proposals across {stats.proposalCountries} jurisdictions
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Proposals" value={stats.totalProposals} />
          <StatCard label="Countries" value={stats.proposalCountries} />
          <StatCard label="Adopted" value={stats.proposalsByStatus.find((s: any) => s.name === 'Adopted')?.count || 0} />
          <StatCard label="Policy Areas" value={stats.proposalsByArea.length} />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">PROPOSALS BY COUNTRY</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Legislative activity per jurisdiction</p>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={stats.proposalsByCountry} margin={{ top: 5, right: 5, left: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="code" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip content={<RichBarTooltip totalValue={stats.totalProposals} totalLabel="Total Proposals" />} />
                  <Bar dataKey="count" fill="hsl(var(--accent))" radius={[2, 2, 0, 0]} className="cursor-pointer"
                    onClick={(d, i) => handleBarClick(d, i, 'Proposals by Country')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">BY STATUS</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Current legislative status of tracked proposals</p>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={stats.proposalsByStatus} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontFamily: 'monospace' }} width={80} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip content={<RichBarTooltip totalValue={stats.totalProposals} totalLabel="Total Proposals" />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 2, 2, 0]} className="cursor-pointer"
                    onClick={(d, i) => handleBarClick(d, i, 'Proposals by Status')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">BY POLICY AREA</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Distribution of proposals across policy domains</p>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={stats.proposalsByArea} layout="vertical" margin={{ top: 5, right: 20, left: 100, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontFamily: 'monospace' }} width={100} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip content={<RichBarTooltip totalValue={stats.totalProposals} totalLabel="Total Proposals" />} />
                  <Bar dataKey="count" fill="hsl(150, 40%, 40%)" radius={[0, 2, 2, 0]} className="cursor-pointer"
                    onClick={(d, i) => handleBarClick(d, i, 'Proposals by Policy Area')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">BY TYPE</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Directives, regulations, bills, referendums</p>
            <div className="brutalist-border bg-card p-4">
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie data={stats.proposalsByType} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={120} label={renderCustomLabel} labelLine={false}
                    onClick={(d) => handlePieClick(d, 'Proposal Type')}>
                    {stats.proposalsByType.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} className="cursor-pointer" />
                    ))}
                  </Pie>
                  <Tooltip content={<RichPieTooltip totalValue={stats.totalProposals} />} />
                  <Legend formatter={(v: string) => <span className="text-xs font-mono">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Data Sources */}
        <section>
          <h2 className="text-lg font-extrabold tracking-tight mb-4 font-mono">DATA SOURCES</h2>
          <div className="grid sm:grid-cols-5 gap-3">
            <a href="https://www.europarl.europa.eu" target="_blank" rel="noopener noreferrer" className="brutalist-border p-4 bg-card hover:bg-secondary transition-colors">
              <div className="text-sm font-bold">European Parliament</div>
              <div className="text-xs font-mono text-muted-foreground mt-1">718 MEPs · XML directory</div>
              <div className="text-xs text-accent mt-2">europarl.europa.eu →</div>
            </a>
            <a href="https://en.wikipedia.org" target="_blank" rel="noopener noreferrer" className="brutalist-border p-4 bg-card hover:bg-secondary transition-colors">
              <div className="text-sm font-bold">Wikipedia</div>
              <div className="text-xs font-mono text-muted-foreground mt-1">{stats.enriched} enriched · REST API</div>
              <div className="text-xs text-accent mt-2">en.wikipedia.org →</div>
            </a>
            <a href="https://www.europarl.europa.eu/meps/en/declarations" target="_blank" rel="noopener noreferrer" className="brutalist-border p-4 bg-card hover:bg-secondary transition-colors">
              <div className="text-sm font-bold">Financial Disclosures</div>
              <div className="text-xs font-mono text-muted-foreground mt-1">{stats.totalInvestments} positions tracked</div>
              <div className="text-xs text-accent mt-2">Declarations of interest →</div>
            </a>
            <a href="https://ec.europa.eu" target="_blank" rel="noopener noreferrer" className="brutalist-border p-4 bg-card hover:bg-secondary transition-colors">
              <div className="text-sm font-bold">Public RSS Feeds</div>
              <div className="text-xs font-mono text-muted-foreground mt-1">{stats.totalEvents} events · EU sources</div>
              <div className="text-xs text-accent mt-2">ec.europa.eu →</div>
            </a>
            <a href="https://eur-lex.europa.eu" target="_blank" rel="noopener noreferrer" className="brutalist-border p-4 bg-card hover:bg-secondary transition-colors">
              <div className="text-sm font-bold">Legislative Tracker</div>
              <div className="text-xs font-mono text-muted-foreground mt-1">{stats.totalProposals} proposals · {stats.proposalCountries} countries</div>
              <div className="text-xs text-accent mt-2">EUR-Lex + national sources →</div>
            </a>
          </div>
          <ProvenanceBar sources={[
            { label: 'European Parliament', url: 'https://www.europarl.europa.eu/', type: 'official' },
            { label: 'EUR-Lex', url: 'https://eur-lex.europa.eu/', type: 'official' },
            { label: 'Chapel Hill Expert Survey', url: 'https://www.chesdata.eu/', type: 'model' },
            { label: 'Wikipedia', url: 'https://en.wikipedia.org/', type: 'official' },
          ]} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Data;
