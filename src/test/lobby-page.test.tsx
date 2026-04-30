import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Lobby from '@/pages/Lobby';

type MockLobbyOrg = {
  id: string;
  name: string;
  transparency_id: string;
  category: string;
  country_of_hq: string;
  latestSpend: number;
  latestSpendYear: number;
  website: string;
};

type MockInfluenceSummary = {
  overview: {
    filings_total: number;
    clients_total: number;
    actors_total: number;
    companies_total: number;
    contacts_total: number;
    money_rows_total: number;
    recorded_amount_total: number;
  };
  topInfluenceSpenders: Array<{
    id: string;
    name: string;
    amount: number;
    principalCountryCode: string;
    sector: string;
    sourceUrl: string;
  }>;
  topInfluenceTargets: Array<{ name: string; count: number }>;
};

const lobbyHookState = vi.hoisted(() => ({
  orgs: [] as MockLobbyOrg[],
  total: 0,
  influence: null as MockInfluenceSummary | null,
}));

vi.mock('@/components/SiteHeader', () => ({ default: () => null }));
vi.mock('@/components/SiteFooter', () => ({ default: () => null }));

vi.mock('recharts', () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: passthrough,
    BarChart: passthrough,
    Bar: passthrough,
    Cell: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

vi.mock('@/hooks/use-lobby', () => ({
  useTopLobbyOrgs: () => ({
    isLoading: false,
    data: lobbyHookState.orgs,
  }),
  useTotalLobbyOrgs: () => ({ data: lobbyHookState.total }),
  useLobbyInfluenceSummary: () => ({
    isLoading: false,
    data: lobbyHookState.influence,
  }),
}));

const exampleInfluenceSummary = (): MockInfluenceSummary => ({
  overview: {
    filings_total: 704,
    clients_total: 330,
    actors_total: 401,
    companies_total: 0,
    contacts_total: 438,
    money_rows_total: 569,
    recorded_amount_total: 1_492_851_490,
  },
  topInfluenceSpenders: [
    {
      id: 'client-1',
      name: 'Example Industries',
      amount: 1_200_000_000,
      principalCountryCode: 'CN',
      sector: 'Technology',
      sourceUrl: 'https://example.com/filing',
    },
  ],
  topInfluenceTargets: [{ name: 'US Congress', count: 25 }],
});

describe('Lobby page', () => {
  beforeEach(() => {
    lobbyHookState.total = 30;
    lobbyHookState.orgs = [
      {
        id: 'lobby-1',
        name: 'Example EU Association',
        transparency_id: '123',
        category: 'Trade association',
        country_of_hq: 'BE',
        latestSpend: 1_500_000,
        latestSpendYear: 2025,
        website: 'https://example.org',
      },
    ];
    lobbyHookState.influence = exampleInfluenceSummary();
  });

  it('merges legacy lobby data with the global influence registry', () => {
    render(
      <MemoryRouter>
        <Lobby />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'LOBBY & INFLUENCE MONEY TRAIL' })).toBeInTheDocument();
    expect(screen.getByText('EU REGISTERED ORGS')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('INFLUENCE FILINGS')).toBeInTheDocument();
    expect(screen.getByText('704')).toBeInTheDocument();
    expect(screen.getByText('DISCLOSED CONTACTS')).toBeInTheDocument();
    expect(screen.getByText('438')).toBeInTheDocument();
    expect(screen.getByText('GLOBAL INFLUENCE REGISTRY')).toBeInTheDocument();
    expect(screen.getByText('Example Industries')).toBeInTheDocument();
    expect(screen.getByText('US Congress')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'OPEN DASHBOARD' })).toHaveAttribute('href', '/influence');
  });

  it('shows registry panels even when the legacy lobby table has no rows', () => {
    lobbyHookState.total = 0;
    lobbyHookState.orgs = [];
    lobbyHookState.influence = exampleInfluenceSummary();

    render(
      <MemoryRouter>
        <Lobby />
      </MemoryRouter>,
    );

    expect(screen.queryByText('No lobby or influence records ingested yet.')).not.toBeInTheDocument();
    expect(screen.getByText('Example Industries')).toBeInTheDocument();
    expect(screen.getByText('US Congress')).toBeInTheDocument();
  });
});
