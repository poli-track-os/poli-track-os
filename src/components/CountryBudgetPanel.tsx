// Compact country-level budget panel. Drops into CountryDetail and links
// out to the full /budgets explorer. Uses the same hooks as Budgets.tsx
// so the data is shared in the React Query cache.

import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip } from 'recharts';
import {
  buildBreakdownForYear,
  buildBudgetYearSummary,
  useCofogFunctions,
  useCountryDemographics,
  useGovernmentExpenditure,
} from '@/hooks/use-government-expenditure';
import { Landmark } from 'lucide-react';

interface Props {
  countryCode: string;
}

function formatEur(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(2)}T`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}B`;
  return `€${value.toFixed(0)}M`;
}

function formatSignedEur(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatEur(value)}`;
}

const CountryBudgetPanel = ({ countryCode }: Props) => {
  const upper = countryCode.toUpperCase();
  const { data: expenditure = [] } = useGovernmentExpenditure(upper);
  const { data: demographics = [] } = useCountryDemographics(upper);
  const { data: cofogFunctions = [] } = useCofogFunctions();

  if (expenditure.length === 0) return null;

  // Pick the latest year that has the GFTOT row (otherwise we'd display a
  // partial year with weird sparseness).
  const yearsWithTotal = expenditure
    .filter((r) => r.cofog_code === 'GFTOT' && r.amount_million_eur !== null)
    .map((r) => r.year);
  if (yearsWithTotal.length === 0) return null;
  const year = Math.max(...yearsWithTotal);

  const breakdown = buildBreakdownForYear(expenditure, demographics, year)
    .filter((b) => b.cofog_code !== 'GFTOT')
    .sort((a, b) => (b.amount_million_eur ?? 0) - (a.amount_million_eur ?? 0))
    .slice(0, 6);
  const summary = buildBudgetYearSummary(expenditure, demographics, year);

  const total = expenditure.find((r) => r.year === year && r.cofog_code === 'GFTOT')?.amount_million_eur ?? null;
  const colorByCofog: Record<string, string> = {};
  for (const f of cofogFunctions) colorByCofog[f.code] = f.color || 'hsl(220, 20%, 50%)';

  return (
    <section className="brutalist-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-mono text-xs font-bold flex items-center gap-2">
          <Landmark className="w-3.5 h-3.5" />
          GOVERNMENT BUDGET · {year}
        </h2>
        <Link
          to={`/budgets?country=${upper}&year=${year}`}
          className="text-[10px] font-mono text-accent hover:underline"
        >
          full breakdown →
        </Link>
      </div>

      {total !== null && (
        <div className="font-mono text-xs text-muted-foreground mb-3">
          total expenditure: <span className="font-bold text-foreground">{formatEur(Number(total))}</span>
        </div>
      )}

      {summary && (
        <div className="font-mono text-[10px] text-muted-foreground mb-3 space-y-1">
          {summary.is_provisional && (
            <div>
              latest year is <span className="font-bold text-warning">provisional</span>
            </div>
          )}
          {summary.previous_year && summary.delta_million_eur !== null && (
            <div>
              vs {summary.previous_year}: <span className="font-bold text-foreground">{formatSignedEur(summary.delta_million_eur)}</span>
            </div>
          )}
          {summary.top_function_label && summary.top_function_share_pct !== null && (
            <div>
              largest function: <span className="font-bold text-foreground">{summary.top_function_label}</span> ({summary.top_function_share_pct.toFixed(1)}%)
            </div>
          )}
          {(summary.largest_increase_label || summary.largest_decrease_label) && (
            <div>
              {summary.largest_increase_label && summary.largest_increase_million_eur !== null
                ? `biggest rise: ${summary.largest_increase_label} ${formatSignedEur(summary.largest_increase_million_eur)}`
                : ''}
              {summary.largest_increase_label && summary.largest_decrease_label ? ' · ' : ''}
              {summary.largest_decrease_label && summary.largest_decrease_million_eur !== null
                ? `biggest fall: ${summary.largest_decrease_label} ${formatSignedEur(summary.largest_decrease_million_eur)}`
                : ''}
            </div>
          )}
        </div>
      )}

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={breakdown} layout="vertical" margin={{ left: 10, right: 10 }}>
          <XAxis type="number" tickFormatter={(v) => formatEur(v)} tick={{ fontSize: 9, fontFamily: 'JetBrains Mono' }} />
          <YAxis type="category" dataKey="cofog_label" width={120} tick={{ fontSize: 9, fontFamily: 'JetBrains Mono' }} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const row = payload[0].payload as (typeof breakdown)[number];
              return (
                <div className="brutalist-border bg-card p-2 font-mono text-xs">
                  <div className="font-bold">{row.cofog_label}</div>
                  <div>{formatEur(row.amount_million_eur)}</div>
                  {row.pct_of_gdp !== null && <div>{row.pct_of_gdp.toFixed(1)}% of GDP</div>}
                </div>
              );
            }}
          />
          <Bar dataKey="amount_million_eur">
            {breakdown.map((b) => (
              <Cell key={b.cofog_code} fill={colorByCofog[b.cofog_code] || 'hsl(220, 20%, 50%)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-2 font-mono text-[9px] text-muted-foreground">
        Source: Eurostat <code>gov_10a_exp</code>
      </div>
    </section>
  );
};

export default CountryBudgetPanel;
