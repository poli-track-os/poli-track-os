import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountryMetadata } from '@/hooks/use-country-metadata';

const {
  maybeSingleMock,
  eqMock,
  selectMock,
  fromMock,
  loadCountryMetadataMock,
} = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const loadCountryMetadataMock = vi.fn();

  return {
    maybeSingleMock,
    eqMock,
    selectMock,
    fromMock,
    loadCountryMetadataMock,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock('@/lib/country-metadata-live', () => ({
  countryCodeToFlagEmoji: (countryCode: string) => countryCode.toUpperCase(),
  loadCountryMetadata: loadCountryMetadataMock,
}));

function Probe() {
  const { data, isLoading } = useCountryMetadata('de', 'Germany');

  if (isLoading) {
    return <div>loading</div>;
  }

  return <div>{`${data?.dataSource}:${data?.countryName}:${data?.capital}`}</div>;
}

describe('useCountryMetadata', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
    eqMock.mockClear();
    selectMock.mockClear();
    fromMock.mockClear();
    loadCountryMetadataMock.mockReset();
  });

  it('falls back to live metadata when the stored cache query errors', async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'relation "country_metadata" does not exist' },
    });
    loadCountryMetadataMock.mockResolvedValue({
      countryCode: 'DE',
      countryName: 'Germany',
      flagEmoji: '🇩🇪',
      capital: 'Berlin',
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('live:Germany:Berlin')).toBeInTheDocument();
    });

    expect(fromMock).toHaveBeenCalledWith('country_metadata');
    expect(loadCountryMetadataMock).toHaveBeenCalledWith('DE', 'Germany');
  });
});
