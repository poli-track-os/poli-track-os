import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountryStats, usePoliticians } from '@/hooks/use-politicians';

const {
  fromMock,
  selectMock,
  orderMock,
  rangeMock,
} = vi.hoisted(() => {
  const rangeMock = vi.fn();
  const orderMock = vi.fn(() => ({ range: rangeMock }));
  const selectMock = vi.fn(() => ({ order: orderMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));

  return {
    fromMock,
    selectMock,
    orderMock,
    rangeMock,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromMock,
  },
}));

function makePoliticianRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'actor-default',
    biography: null,
    birth_year: null,
    committees: null,
    continent: 'Europe',
    country_code: 'DE',
    country_name: 'Germany',
    created_at: '2026-04-22T00:00:00.000Z',
    data_source: 'wikipedia',
    enriched_at: null,
    entity_id: null,
    external_id: null,
    in_office_since: null,
    jurisdiction: 'federal',
    name: 'Actor Default',
    party_abbreviation: null,
    party_name: null,
    photo_url: null,
    role: 'Politician',
    source_attribution: {},
    source_url: null,
    twitter_handle: null,
    updated_at: '2026-04-22T00:00:00.000Z',
    wikipedia_data: null,
    wikipedia_image_url: null,
    wikipedia_summary: null,
    wikipedia_url: null,
    ...overrides,
  };
}

function PoliticiansProbe() {
  const { data = [], isLoading } = usePoliticians();
  if (isLoading) return <div>loading</div>;
  const hasSergio = data.some((actor) => actor.name === 'Sergio Mattarella');
  return <div>{`${data.length}:${hasSergio}`}</div>;
}

function CountryStatsProbe() {
  const { data = [], isLoading } = useCountryStats();
  if (isLoading) return <div>loading</div>;
  const italy = data.find((country) => country.code === 'IT');
  return <div>{italy ? `${italy.code}:${italy.actorCount}` : 'missing-it'}</div>;
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

describe('politicians pagination hooks', () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
    orderMock.mockClear();
    rangeMock.mockReset();
  });

  it('loads actor rows beyond the first 1000-record page', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => makePoliticianRow({
      id: `actor-${index}`,
      name: `Actor ${index.toString().padStart(4, '0')}`,
    }));
    const secondPage = [
      makePoliticianRow({
        id: 'actor-sergio',
        name: 'Sergio Mattarella',
        country_code: 'IT',
        country_name: 'Italy',
        role: 'Head of State',
      }),
    ];

    rangeMock.mockImplementation(async (from: number) => ({
      data: from === 0 ? firstPage : from === 1000 ? secondPage : [],
      error: null,
    }));

    renderWithQueryClient(<PoliticiansProbe />);

    await waitFor(() => {
      expect(screen.getByText('1001:true')).toBeInTheDocument();
    });

    expect(rangeMock).toHaveBeenCalledTimes(2);
  });

  it('builds country stats from every politicians page, not only the first page', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      country_code: 'DE',
      country_name: 'Germany',
      continent: 'Europe',
      party_name: index % 2 === 0 ? 'CDU' : 'SPD',
    }));
    const secondPage = [
      {
        country_code: 'IT',
        country_name: 'Italy',
        continent: 'Europe',
        party_name: null,
      },
    ];

    rangeMock.mockImplementation(async (from: number) => ({
      data: from === 0 ? firstPage : from === 1000 ? secondPage : [],
      error: null,
    }));

    renderWithQueryClient(<CountryStatsProbe />);

    await waitFor(() => {
      expect(screen.getByText('IT:1')).toBeInTheDocument();
    });

    expect(rangeMock).toHaveBeenCalledTimes(2);
  });
});
