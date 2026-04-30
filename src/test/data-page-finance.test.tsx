import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Data from '@/pages/Data';

const useDataStatsMock = vi.hoisted(() => vi.fn());

vi.mock('@/components/SiteHeader', () => ({ default: () => null }));
vi.mock('@/components/SiteFooter', () => ({ default: () => null }));
vi.mock('@/components/DataCoverageExplorer', () => ({ default: () => <div>Coverage stub</div> }));
vi.mock('@/components/SourceBadge', () => ({ ProvenanceBar: () => null }));
vi.mock('@/lib/theme-mode-context', () => ({ useThemeModeContext: () => ({ theme: 'light' }) }));

vi.mock('recharts', () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    BarChart: passthrough,
    Bar: passthrough,
    CartesianGrid: () => null,
    Cell: () => null,
    Legend: () => null,
    Line: () => null,
    LineChart: passthrough,
    Pie: passthrough,
    PieChart: passthrough,
    PolarAngleAxis: () => null,
    PolarGrid: () => null,
    PolarRadiusAxis: () => null,
    Radar: () => null,
    RadarChart: passthrough,
    ReferenceLine: () => null,
    ResponsiveContainer: passthrough,
    Scatter: passthrough,
    ScatterChart: passthrough,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
    ZAxis: () => null,
  };
});

vi.mock('@/hooks/use-data-observatory', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-data-observatory')>('@/hooks/use-data-observatory');
  return {
    ...actual,
    useDataStats: () => useDataStatsMock(),
  };
});

function makeStats() {
  return {
    totalPoliticians: 2,
    totalEvents: 2,
    totalCountries: 1,
    totalParties: 1,
    enriched: 1,
    enrichmentPct: 50,
    byCountry: [{ code: 'DE', name: 'Germany', count: 2 }],
    byGroup: [{ name: 'EPP', count: 2 }],
    byJurisdiction: [{ name: 'Eu', count: 2 }],
    byEventType: [{ name: 'Financial Disclosure', count: 2 }],
    perCapita: [{ name: 'DE', fullName: 'Germany', count: 2, population: 84_482_000, gdp: 4456, area: 357_022, perMillion: 0.1 }],
    perGdp: [{ name: 'DE', fullName: 'Germany', count: 2, gdp: 4456, population: 84_482_000, perBillion: 0.01 }],
    scatterData: [{ name: 'DE', fullName: 'Germany', gdp: 4456, politicians: 2, population: 84.5 }],
    representationIndex: [{ name: 'DE', fullName: 'Germany', perCapita: 100, perGdp: 100, density: 1, absolute: 100 }],
    gdpPerPol: [{ name: 'DE', fullName: 'Germany', gdpPerPolitician: 2228, count: 2, gdp: 4456 }],
    salaryDistribution: [
      { name: '< €80K', count: 0, min: 0, max: 80000 },
      { name: '€80-120K', count: 0, min: 80000, max: 120000 },
      { name: '€120-150K', count: 2, min: 120000, max: 150000 },
      { name: '€150-200K', count: 0, min: 150000, max: 200000 },
      { name: '> €200K', count: 0, min: 200000, max: Infinity },
    ],
    bySector: [],
    topCompanies: [],
    avgSalaryBySource: [{ name: 'European Parliament MEP salary', avgSalary: 135063, count: 2 }],
    financialDisclosureCount: 2,
    financialDisclosurePct: 100,
    salaryDataCount: 2,
    officeCompensationCount: 2107,
    officeCompensationCountries: 161,
    officeCompensationOfficialCount: 2053,
    officePayLatestByCountry: [
      { countryCode: 'DE', countryName: 'Germany', officeType: 'member_of_parliament', officeTitle: 'Bundestag member', amount: 130554, currency: 'EUR', year: 2024 },
    ],
    officePayTrend: [{ year: 2024, 'DE MP': 130554 }],
    officePayTrendKeys: ['DE MP'],
    sideIncomeCount: 0,
    sideIncomePct: 0,
    totalInvestmentValue: 0,
    totalInvestments: 0,
    politiciansWithInvestments: 0,
    byIdeology: [{ name: 'Centrist', count: 2 }],
    compassSample: [{ x: 0, y: 0, ideology: 'Centrist' }],
    avgPriorities: [{ domain: 'Economy', value: 5 }],
    euDistribution: [{ name: 'Neutral', count: 2 }],
    totalPositions: 2,
    totalProposals: 1,
    proposalsByCountry: [{ code: 'DE', name: 'Germany', count: 1 }],
    proposalsByStatus: [{ name: 'Adopted', count: 1 }],
    proposalsByArea: [{ name: 'Finance', count: 1 }],
    proposalsByType: [{ name: 'Directive', count: 1 }],
    proposalCountries: 1,
    dataAvailability: [{
      code: 'DE',
      name: 'Germany',
      total: 2,
      bioRate: 100,
      photoRate: 100,
      wikiRate: 100,
      financeRate: 100,
      investRate: 0,
      enrichedRate: 50,
      birthRate: 100,
      twitterRate: 50,
      completeness: 92,
      gap: 8,
    }],
    coverage: {
      summary: { fullyCoveredPeople: 0, peopleWithGaps: 0, criticalGaps: 0, totalPeople: 0, trackedFields: 0 },
      countries: [],
      parties: [],
      people: [],
    },
  };
}

describe('Data finance section', () => {
  it('shows salary disclosure counts and an explicit investment pending state', () => {
    useDataStatsMock.mockReturnValue({ data: makeStats(), isLoading: false });

    render(<Data />);

    expect(screen.getByText(/FINANCIAL TRANSPARENCY/)).toBeInTheDocument();
    expect(screen.getAllByText('Financial Disclosures').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getByText('Salary Records')).toBeInTheDocument();
    expect(screen.getByText('Public Office Pay Rows')).toBeInTheDocument();
    expect(screen.getByText('Countries With Pay')).toBeInTheDocument();
    expect(screen.getByText('LATEST PAY BY COUNTRY AND ROLE')).toBeInTheDocument();
    expect(screen.getAllByText('DE').length).toBeGreaterThan(0);
    expect(screen.getByText('Investment extraction pending')).toBeInTheDocument();
    expect(screen.getByText('No parsed investment positions')).toBeInTheDocument();
    expect(screen.getByText('No sector holdings yet')).toBeInTheDocument();
  });

  it('does not draw value charts when holdings have no disclosed valuation', () => {
    useDataStatsMock.mockReturnValue({
      data: {
        ...makeStats(),
        totalInvestments: 2,
        politiciansWithInvestments: 2,
        bySector: [{ name: 'Other', value: 0, count: 2 }],
        topCompanies: [{ name: 'Example Holding', value: 0, investors: 1, sector: 'Other' }],
      },
      isLoading: false,
    });

    render(<Data />);

    expect(screen.getByText('Holdings parsed without valuations')).toBeInTheDocument();
    expect(screen.getByText('Example Holding')).toBeInTheDocument();
  });
});
