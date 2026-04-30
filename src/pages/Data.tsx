import { useState } from 'react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import DataCoverageExplorer from '@/components/DataCoverageExplorer';
import { ProvenanceBar } from '@/components/SourceBadge';
import { useThemeModeContext } from '@/lib/theme-mode-context';
import { getAvailabilityHeatmapCellStyle } from '@/lib/data-availability-heatmap';
import { getIdeologyColor } from '@/lib/political-positioning';
import { EU_COUNTRY_DATA, useDataStats } from '@/hooks/use-data-observatory';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ScatterChart, Scatter, ZAxis, LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ReferenceLine,
} from 'recharts';
import { X } from 'lucide-react';

const COLORS = [
  'hsl(215, 30%, 45%)', 'hsl(0, 55%, 45%)', 'hsl(150, 40%, 40%)',
  'hsl(45, 70%, 50%)', 'hsl(280, 30%, 50%)', 'hsl(180, 40%, 40%)',
  'hsl(30, 60%, 50%)', 'hsl(330, 40%, 45%)', 'hsl(100, 35%, 45%)',
  'hsl(200, 50%, 50%)',
];

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="brutalist-border p-2 sm:p-4 bg-card">
      <div className="text-xl sm:text-3xl font-extrabold tracking-tighter">{value}</div>
      <div className="text-[9px] sm:text-xs font-mono text-muted-foreground uppercase mt-0.5 sm:mt-1">{label}</div>
      {sub && <div className="text-[9px] sm:text-xs text-muted-foreground mt-0.5 hidden sm:block">{sub}</div>}
    </div>
  );
}

function EmptyDataPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="brutalist-border bg-card p-4 min-h-[220px] flex flex-col justify-center">
      <div className="font-mono text-sm font-bold">{title}</div>
      <p className="font-mono text-xs text-muted-foreground mt-2 max-w-xl">{detail}</p>
    </div>
  );
}

function formatLocalCurrency(value: number | null | undefined, currency = 'EUR') {
  if (value === null || value === undefined) return '—';
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString()} ${currency}`;
  }
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

const DATA_SECTION_LINKS = [
  { id: 'observatory-overview', label: 'OVERVIEW' },
  { id: 'coverage-ledger', label: 'COVERAGE' },
  { id: 'financial-transparency', label: 'FINANCE' },
  { id: 'political-orientation', label: 'ORIENTATION' },
  { id: 'legislative-tracker', label: 'LEGISLATION' },
];

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
  const officePayTrendKeys = stats.officePayTrendKeys || [];
  const officePayTrend = stats.officePayTrend || [];
  const officePayLatestByCountry = stats.officePayLatestByCountry || [];
  const wealthPayRatios = stats.wealthPayRatios || [];
  const totalDeclaredNetWorth = stats.totalDeclaredNetWorth || 0;

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
          <StatCard label="Financial Disclosures" value={stats.financialDisclosureCount} sub={`${stats.financialDisclosurePct}% politician coverage`} />
          <StatCard label="Salary Records" value={stats.salaryDataCount} sub="official standard salary" />
          <StatCard
            label="Disclosed Investments"
            value={stats.totalInvestments}
            sub={stats.totalInvestments > 0 ? `${stats.politiciansWithInvestments} politicians` : 'PDF extraction pending'}
          />
          <StatCard label="With Side Income" value={`${stats.sideIncomePct}%`} sub={`${stats.sideIncomeCount} politicians`} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Public Office Pay Rows" value={stats.officeCompensationCount || 0} sub={`${stats.officeCompensationOfficialCount || 0} official IPU rows`} />
          <StatCard label="Countries With Pay" value={stats.officeCompensationCountries || 0} sub="role-level compensation" />
          <StatCard label="Declared Wealth Rows" value={stats.declaredWealthCount || 0} sub="assets or debt disclosed" />
          <StatCard label="Comparable Wealth/Pay" value={stats.wealthPayRatioCount || 0} sub="net worth with salary" />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">DECLARED NET WORTH VS PAY</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Assets minus declared debt compared with annual public pay. This flags cases for review; it is not proof of misconduct.</p>
            {wealthPayRatios.length > 0 ? (
              <div className="brutalist-border bg-card overflow-hidden">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-card">
                    <tr className="border-b border-border">
                      <th className="text-left p-2 font-bold">PERSON</th>
                      <th className="text-right p-2 font-bold">NET WORTH</th>
                      <th className="text-right p-2 font-bold">PAY</th>
                      <th className="text-right p-2 font-bold">RATIO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wealthPayRatios.map((row: any) => (
                      <tr key={`${row.country}-${row.name}`} className="border-b border-border/50 hover:bg-muted/50">
                        <td className="p-2">
                          <div className="font-bold">{row.name}</div>
                          <div className="text-[10px] text-muted-foreground">{row.country}</div>
                        </td>
                        <td className="p-2 text-right font-bold">{formatLocalCurrency(row.netWorth, 'EUR')}</td>
                        <td className="p-2 text-right">{formatLocalCurrency(row.salary, 'EUR')}</td>
                        <td className="p-2 text-right font-bold">{row.ratio >= 10 ? row.ratio.toFixed(0) : row.ratio.toFixed(1)}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyDataPanel title="No comparable net-worth/pay rows yet" detail="Most disclosure regimes publish interests or salaries without downloadable asset values. Rows appear here only when public asset declarations include numeric values." />
            )}
          </section>

          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">OFFICE PAY COVERAGE</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Role-level salary collection status</p>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Trend Lines" value={officePayTrendKeys.length} sub="EUR-denominated MP series" />
              <StatCard label="Latest Role Rates" value={officePayLatestByCountry.length} sub="country/type records" />
              <StatCard label="Declared Net Worth" value={formatLocalCurrency(totalDeclaredNetWorth, 'EUR')} sub="public asset rows only" />
              <StatCard label="Asset Source Scope" value="Official" sub="no unsourced estimates" />
            </div>
          </section>
        </div>

        {/* Salary distribution + Avg salary by source */}
        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">SALARY DISTRIBUTION</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">How politician salaries are distributed across income brackets</p>
            {stats.salaryDataCount > 0 ? (
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
            ) : (
              <EmptyDataPanel title="No numeric salary rows" detail="Financial declaration records are present, but salary amounts have not been normalized into numeric fields yet." />
            )}
          </section>

          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">AVERAGE SALARY BY SOURCE</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">EP Parliament vs National Government compensation</p>
            {stats.avgSalaryBySource.length > 0 ? (
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
            ) : (
              <EmptyDataPanel title="No salary source breakdown" detail="Salary records exist only after a numeric amount is normalized from an official compensation source." />
            )}
          </section>
        </div>

        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">PUBLIC OFFICE PAY OVER TIME</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">
              Official IPU basic salary histories for the highest current EUR-denominated parliament member rates
            </p>
            {officePayTrend.length > 0 && officePayTrendKeys.length > 0 ? (
              <div className="brutalist-border bg-card p-4">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={officePayTrend} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `€${Math.round(Number(value) / 1000)}K`} />
                    <Tooltip formatter={(value: number, name: string) => [formatLocalCurrency(Number(value), 'EUR'), name]} />
                    <Legend formatter={(value: string) => <span className="text-xs font-mono">{value}</span>} />
                    {officePayTrendKeys.map((key: string, index: number) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyDataPanel title="No comparable pay trend yet" detail="Office-pay rows were collected, but no EUR-denominated member salary time series is available for the selected countries." />
            )}
          </section>

          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">LATEST PAY BY COUNTRY AND ROLE</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Latest normalized amount per country, office type, and source</p>
            {officePayLatestByCountry.length > 0 ? (
              <div className="brutalist-border bg-card overflow-hidden">
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full min-w-[520px] text-xs font-mono">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-bold">COUNTRY</th>
                        <th className="text-left p-2 font-bold">ROLE</th>
                        <th className="text-right p-2 font-bold">AMOUNT</th>
                        <th className="text-right p-2 font-bold">YEAR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {officePayLatestByCountry.slice(0, 120).map((row: any) => (
                        <tr key={`${row.countryCode}-${row.officeType}-${row.officeTitle}`} className="border-b border-border/50 hover:bg-muted/50">
                          <td className="p-2">
                            <div className="font-bold">{row.countryCode}</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{row.countryName}</div>
                          </td>
                          <td className="p-2">
                            <div className="font-bold">{String(row.officeType).replace(/_/g, ' ')}</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[220px]">{row.officeTitle}</div>
                          </td>
                          <td className="p-2 text-right font-bold">{formatLocalCurrency(row.amount, row.currency)}</td>
                          <td className="p-2 text-right">{row.year}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <EmptyDataPanel title="No public office pay rows" detail="Run the office compensation sync to collect role-level salaries, allowances, and leader pay." />
            )}
          </section>
        </div>

        {/* Investment by sector + Top companies */}
        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">INVESTMENT BY SECTOR</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Where politicians put their money — total disclosed value per sector</p>
            {stats.bySector.length > 0 && stats.totalInvestmentValue > 0 ? (
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
            ) : stats.bySector.length > 0 ? (
              <EmptyDataPanel
                title="Holdings parsed without valuations"
                detail={`${stats.totalInvestments} holdings or partnerships were extracted from public declarations, but the DPI form does not disclose market values for them.`}
              />
            ) : (
              <EmptyDataPanel title="Investment extraction pending" detail="Financial declaration PDFs are linked, but individual holdings require PDF text extraction and review before investment values are shown." />
            )}
          </section>

          <section>
            <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">MOST POPULAR INVESTMENTS</h2>
            <p className="text-xs font-mono text-muted-foreground mb-4">Companies with the most politician-investors</p>
            {stats.topCompanies.length > 0 ? (
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
                            { label: 'Total Value', value: c.value > 0 ? `€${(c.value / 1000).toFixed(0)}K` : 'not disclosed' },
                            { label: 'Avg per Investor', value: c.value > 0 && c.investors > 0 ? `€${(c.value / c.investors / 1000).toFixed(0)}K` : 'not disclosed' },
                          ],
                        })}>
                        <td className="p-2 font-medium">{c.name}</td>
                        <td className="p-2"><span className="px-1.5 py-0.5 rounded text-[10px] bg-muted">{c.sector}</span></td>
                        <td className="p-2 text-right font-bold">{c.investors}</td>
                        <td className="p-2 text-right text-muted-foreground">{c.value > 0 ? `€${(c.value / 1000).toFixed(0)}K` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            ) : (
              <EmptyDataPanel title="No parsed investment positions" detail="The source filings are tracked as financial disclosures; company-level holdings will appear here once the PDF parser extracts them." />
            )}
          </section>
        </div>

        {/* Sector holdings bar chart */}
        <section>
          <h2 className="text-lg font-extrabold tracking-tight mb-1 font-mono">HOLDINGS PER SECTOR</h2>
          <p className="text-xs font-mono text-muted-foreground mb-4">Number of individual investment positions by sector</p>
          {stats.bySector.length > 0 ? (
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
          ) : (
            <EmptyDataPanel title="No sector holdings yet" detail="Investment sector charts stay hidden until reviewed holdings are inserted into politician_investments." />
          )}
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
              <div className="text-xs font-mono text-muted-foreground mt-1">{stats.financialDisclosureCount} disclosures · {stats.totalInvestments} investments parsed</div>
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
