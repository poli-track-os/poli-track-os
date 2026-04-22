import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProposalStats, useProposals } from '@/hooks/use-proposals';

const {
  fromMock,
  rpcMock,
  selectMock,
  orderMock,
  rangeMock,
  eqMock,
} = vi.hoisted(() => {
  const rpcMock = vi.fn();
  const rangeMock = vi.fn();
  const eqMock = vi.fn(() => ({ order: orderMock, eq: eqMock, range: rangeMock }));
  const orderMock = vi.fn(() => ({ range: rangeMock, eq: eqMock }));
  const selectMock = vi.fn(() => ({ order: orderMock, eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));

  return {
    fromMock,
    rpcMock,
    selectMock,
    orderMock,
    rangeMock,
    eqMock,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}));

function makeProposalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'proposal-default',
    title: 'Default proposal',
    official_title: null,
    status: 'adopted',
    proposal_type: 'bill',
    jurisdiction: 'federal',
    country_code: 'DE',
    country_name: 'Germany',
    vote_date: null,
    submitted_date: '2026-04-22',
    sponsors: [],
    affected_laws: [],
    evidence_count: 1,
    summary: null,
    policy_area: 'finance',
    source_url: null,
    data_source: 'official_record',
    created_at: '2026-04-22T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
    ...overrides,
  };
}

function ProposalsProbe() {
  const { data = [], isLoading } = useProposals({ countryCode: 'IT', page: 2, pageSize: 1000 });
  if (isLoading) return <div>loading</div>;
  const hasItaly = data.some((proposal) => proposal.country_code === 'IT');
  return <div>{`${data.length}:${hasItaly}`}</div>;
}

function ProposalStatsProbe() {
  const { data, isLoading } = useProposalStats();
  if (isLoading) return <div>loading</div>;
  const countries = data?.byCountry.map((country) => country.code).join(',') || '';
  return <div>{`${data?.total || 0}:${countries}`}</div>;
}

function renderWithQueryClient(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe('proposal pagination hooks', () => {
  beforeEach(() => {
    fromMock.mockClear();
    rpcMock.mockReset();
    selectMock.mockClear();
    orderMock.mockClear();
    eqMock.mockClear();
    rangeMock.mockReset();
  });

  it('loads the requested filtered proposals page beyond the first 1000-row page', async () => {
    const secondPage = [
      makeProposalRow({
        id: 'proposal-italy-extra',
        country_code: 'IT',
        country_name: 'Italy',
        title: 'Italian Proposal Extra',
      }),
    ];

    rangeMock.mockImplementation(async (from: number) => ({
      data: from === 1000 ? secondPage : [],
      error: null,
    }));

    renderWithQueryClient(<ProposalsProbe />);

    await waitFor(() => {
      expect(screen.getByText('1:true')).toBeInTheDocument();
    });

    expect(rangeMock).toHaveBeenCalledWith(1000, 1999);
  });

  it('loads proposal stats from the database rollup instead of paginating the whole table', async () => {
    rpcMock.mockResolvedValue({
      data: {
        total: 1001,
        byCountry: [
          { code: 'DE', name: 'Germany', count: 1000 },
          { code: 'PT', name: 'Portugal', count: 1 },
        ],
        byStatus: [{ name: 'adopted', count: 1001 }],
        byArea: [{ name: 'energy', count: 1 }],
      },
      error: null,
    });

    renderWithQueryClient(<ProposalStatsProbe />);

    await waitFor(() => {
      expect(screen.getByText('1001:DE,PT')).toBeInTheDocument();
    });

    expect(rpcMock).toHaveBeenCalledWith('get_proposal_stats');
    expect(rangeMock).not.toHaveBeenCalled();
  });
});
