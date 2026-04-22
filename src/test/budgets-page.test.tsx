import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Budgets from '@/pages/Budgets';

const useGovernmentExpenditureMock = vi.fn();
const useCountryDemographicsMock = vi.fn();
const useAllGovernmentExpenditureMock = vi.fn();
const useAllCountryDemographicsMock = vi.fn();
const useCofogFunctionsMock = vi.fn();
const useCountryStatsMock = vi.fn();

vi.mock('@/components/SiteHeader', () => ({
  default: () => <div>Header stub</div>,
}));

vi.mock('@/components/SiteFooter', () => ({
  default: () => <div>Footer stub</div>,
}));

vi.mock('@/hooks/use-politicians', () => ({
  useCountryStats: () => useCountryStatsMock(),
}));

vi.mock('@/hooks/use-government-expenditure', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-government-expenditure')>('@/hooks/use-government-expenditure');
  return {
    ...actual,
    useGovernmentExpenditure: (countryCode: string | undefined, options?: { enabled?: boolean }) =>
      useGovernmentExpenditureMock(countryCode, options),
    useCountryDemographics: (countryCode: string | undefined, options?: { enabled?: boolean }) =>
      useCountryDemographicsMock(countryCode, options),
    useAllGovernmentExpenditure: (options?: { enabled?: boolean }) =>
      useAllGovernmentExpenditureMock(options),
    useAllCountryDemographics: (options?: { enabled?: boolean }) =>
      useAllCountryDemographicsMock(options),
    useCofogFunctions: () => useCofogFunctionsMock(),
  };
});

describe('Budgets page', () => {
  beforeEach(() => {
    useGovernmentExpenditureMock.mockReset();
    useCountryDemographicsMock.mockReset();
    useAllGovernmentExpenditureMock.mockReset();
    useAllCountryDemographicsMock.mockReset();
    useCofogFunctionsMock.mockReset();
    useCountryStatsMock.mockReset();

    useGovernmentExpenditureMock.mockReturnValue({ data: [], isLoading: false });
    useCountryDemographicsMock.mockReturnValue({ data: [], isLoading: false });
    useAllGovernmentExpenditureMock.mockReturnValue({
      data: [
        {
          id: 'de-total',
          country_code: 'DE',
          year: 2022,
          cofog_code: 'GFTOT',
          cofog_label: 'Total expenditure',
          amount_million_eur: 500,
          pct_of_gdp: 20,
          pct_of_total_expenditure: null,
          sector: 'S13',
          na_item: 'TE',
          is_provisional: false,
          data_source: 'eurostat_cofog',
          source_url: null,
          fetched_at: '2026-04-22T00:00:00Z',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
        {
          id: 'de-total-2023',
          country_code: 'DE',
          year: 2023,
          cofog_code: 'GFTOT',
          cofog_label: 'Total expenditure',
          amount_million_eur: 540,
          pct_of_gdp: 21.6,
          pct_of_total_expenditure: null,
          sector: 'S13',
          na_item: 'TE',
          is_provisional: true,
          data_source: 'eurostat_cofog',
          source_url: null,
          fetched_at: '2026-04-22T00:00:00Z',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
        {
          id: 'de-health',
          country_code: 'DE',
          year: 2022,
          cofog_code: 'GF07',
          cofog_label: 'Health',
          amount_million_eur: 120,
          pct_of_gdp: 4.8,
          pct_of_total_expenditure: 24,
          sector: 'S13',
          na_item: 'TE',
          is_provisional: false,
          data_source: 'eurostat_cofog',
          source_url: null,
          fetched_at: '2026-04-22T00:00:00Z',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
        {
          id: 'de-health-2023',
          country_code: 'DE',
          year: 2023,
          cofog_code: 'GF07',
          cofog_label: 'Health',
          amount_million_eur: 130,
          pct_of_gdp: 5.2,
          pct_of_total_expenditure: 24.1,
          sector: 'S13',
          na_item: 'TE',
          is_provisional: true,
          data_source: 'eurostat_cofog',
          source_url: null,
          fetched_at: '2026-04-22T00:00:00Z',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
        {
          id: 'de-education',
          country_code: 'DE',
          year: 2022,
          cofog_code: 'GF09',
          cofog_label: 'Education',
          amount_million_eur: 100,
          pct_of_gdp: 4,
          pct_of_total_expenditure: 20,
          sector: 'S13',
          na_item: 'TE',
          is_provisional: false,
          data_source: 'eurostat_cofog',
          source_url: null,
          fetched_at: '2026-04-22T00:00:00Z',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
        {
          id: 'de-education-2023',
          country_code: 'DE',
          year: 2023,
          cofog_code: 'GF09',
          cofog_label: 'Education',
          amount_million_eur: 102,
          pct_of_gdp: 4.1,
          pct_of_total_expenditure: 18.9,
          sector: 'S13',
          na_item: 'TE',
          is_provisional: true,
          data_source: 'eurostat_cofog',
          source_url: null,
          fetched_at: '2026-04-22T00:00:00Z',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
        {
          id: 'fr-total',
          country_code: 'FR',
          year: 2022,
          cofog_code: 'GFTOT',
          cofog_label: 'Total expenditure',
          amount_million_eur: 700,
          pct_of_gdp: 28,
          pct_of_total_expenditure: null,
          sector: 'S13',
          na_item: 'TE',
          is_provisional: true,
          data_source: 'eurostat_cofog',
          source_url: null,
          fetched_at: '2026-04-22T00:00:00Z',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
        {
          id: 'fr-health',
          country_code: 'FR',
          year: 2022,
          cofog_code: 'GF07',
          cofog_label: 'Health',
          amount_million_eur: 140,
          pct_of_gdp: 5.6,
          pct_of_total_expenditure: 20,
          sector: 'S13',
          na_item: 'TE',
          is_provisional: true,
          data_source: 'eurostat_cofog',
          source_url: null,
          fetched_at: '2026-04-22T00:00:00Z',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
        {
          id: 'fr-education',
          country_code: 'FR',
          year: 2022,
          cofog_code: 'GF09',
          cofog_label: 'Education',
          amount_million_eur: 150,
          pct_of_gdp: 6,
          pct_of_total_expenditure: 21.4,
          sector: 'S13',
          na_item: 'TE',
          is_provisional: true,
          data_source: 'eurostat_cofog',
          source_url: null,
          fetched_at: '2026-04-22T00:00:00Z',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
      ],
      isLoading: false,
    });
    useAllCountryDemographicsMock.mockReturnValue({
      data: [
        {
          country_code: 'DE',
          year: 2022,
          population: 50_000_000,
          gdp_million_eur: 2_500,
          gdp_per_capita_eur: null,
          area_km2: null,
          data_source: 'eurostat_macro',
          source_url: null,
          fetched_at: '2026-04-22T00:00:00Z',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
        {
          country_code: 'DE',
          year: 2023,
          population: 50_000_000,
          gdp_million_eur: 2_500,
          gdp_per_capita_eur: null,
          area_km2: null,
          data_source: 'eurostat_macro',
          source_url: null,
          fetched_at: '2026-04-22T00:00:00Z',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
        {
          country_code: 'FR',
          year: 2022,
          population: 70_000_000,
          gdp_million_eur: 3_000,
          gdp_per_capita_eur: null,
          area_km2: null,
          data_source: 'eurostat_macro',
          source_url: null,
          fetched_at: '2026-04-22T00:00:00Z',
          created_at: '2026-04-22T00:00:00Z',
          updated_at: '2026-04-22T00:00:00Z',
        },
      ],
      isLoading: false,
    });
    useCofogFunctionsMock.mockReturnValue({
      data: [
        { code: 'GF07', label: 'Health', color: '#118ab2', icon: null, description: null, sort_order: 1 },
        { code: 'GF09', label: 'Education', color: '#ef476f', icon: null, description: null, sort_order: 2 },
      ],
    });
    useCountryStatsMock.mockReturnValue({
      data: [
        { code: 'DE', name: 'Germany', continent: 'Europe', actorCount: 0, partyCount: 0, parties: [] },
        { code: 'FR', name: 'France', continent: 'Europe', actorCount: 0, partyCount: 0, parties: [] },
      ],
    });
  });

  it('renders the global statistics mode with cross-country sections', async () => {
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/budgets?view=global']}
      >
        <Routes>
          <Route path="/budgets" element={<Budgets />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'PUBLIC BUDGET ATLAS' })).toBeInTheDocument();
    expect(screen.getByText('GLOBAL READOUT')).toBeInTheDocument();
    expect(screen.getByText('GLOBAL DISTRIBUTION STATISTICS')).toBeInTheDocument();
    expect(screen.getByText('FUNCTION STATISTICS · 2022')).toBeInTheDocument();
    expect(screen.getByText('COUNTRY RANKING · TOTAL SPEND · 2022')).toBeInTheDocument();
    expect(screen.getByText('2 countries report €1.2B of recorded expenditure in 2022.')).toBeInTheDocument();
    expect(screen.getByText('1 country has provisional data in the selected year, so the upper tail can still move.')).toBeInTheDocument();
    expect(screen.getByText('Mode is only shown when a value repeats exactly at source precision. Confidence intervals are 95% normal approximations for the mean across reporting countries.')).toBeInTheDocument();
    expect(screen.getAllByText('Germany').length).toBeGreaterThan(0);
    expect(screen.getAllByText('France').length).toBeGreaterThan(0);
  });
});
