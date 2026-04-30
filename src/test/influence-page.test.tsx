import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Influence from '@/pages/Influence';

vi.mock('@/components/SiteHeader', () => ({ default: () => null }));
vi.mock('@/components/SiteFooter', () => ({ default: () => null }));

vi.mock('@/hooks/use-influence', () => ({
  formatInfluenceAmount: (value: number) => `USD ${value}`,
  useInfluenceOverview: () => ({
    isLoading: false,
    data: {
      overview: {
        filings_total: 2,
        clients_total: 1,
        actors_total: 1,
        companies_total: 1,
        contacts_total: 1,
        money_rows_total: 1,
        recorded_amount_total: 120000,
      },
      topSpenders: [{ id: 'client-1', name: 'Example Energy', amount: 120000, sector: 'Energy', principal_country_code: 'US' }],
      topTargets: [{ name: 'Congress', count: 3 }],
      contacts: [{
        id: 'contact-1',
        contact_date: '2025-01-01',
        target_name: 'Jane Official',
        target_institution: 'Congress',
        subject: 'Energy',
        data_source: 'us_lda',
      }],
    },
  }),
}));

describe('Influence page', () => {
  it('renders dashboard metrics and influence tables', () => {
    render(
      <MemoryRouter>
        <Influence />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'GLOBAL INFLUENCE REGISTRY' })).toBeInTheDocument();
    expect(screen.getByText('Example Energy')).toBeInTheDocument();
    expect(screen.getAllByText('Congress').length).toBeGreaterThan(0);
    expect(screen.getByText('Jane Official')).toBeInTheDocument();
  });
});
