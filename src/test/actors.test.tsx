import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Actors from '@/pages/Actors';

vi.mock('@/hooks/use-politicians', () => ({
  usePoliticians: () => ({
    data: [
      {
        id: 'actor-1',
        name: 'André Ventura',
        partyId: 'CH',
        party: 'CH',
        partyName: 'Chega',
        partyAbbreviation: 'CH',
        canton: 'Portugal',
        cityId: 'city-1',
        countryId: 'pt',
        role: 'Party Leader',
        jurisdiction: 'federal',
        committees: ['Budget Oversight'],
        recentVotes: [],
        revisionId: 'rev-ventura',
        updatedAt: '2026-04-13T10:00:00Z',
      },
      {
        id: 'actor-2',
        name: 'Ana Ribeiro',
        partyId: 'PS',
        party: 'PS',
        partyName: 'Partido Socialista',
        partyAbbreviation: 'PS',
        canton: 'Portugal',
        cityId: 'city-2',
        countryId: 'pt',
        role: 'Member of Parliament',
        jurisdiction: 'federal',
        committees: ['Health Committee'],
        recentVotes: [],
        revisionId: 'rev-ribeir',
        updatedAt: '2026-04-13T10:00:00Z',
      },
      {
        id: 'actor-3',
        name: 'Sven Berg',
        partyId: 'V',
        party: 'V',
        partyName: 'The Left',
        partyAbbreviation: 'V',
        canton: 'Sweden',
        cityId: 'city-3',
        countryId: 'se',
        role: 'Committee Chair',
        jurisdiction: 'federal',
        committees: ['Environment Committee'],
        recentVotes: [],
        revisionId: 'rev-svenbe',
        updatedAt: '2026-04-13T10:00:00Z',
      },
    ],
    isLoading: false,
  }),
}));

describe('Actors page', () => {
  it('renders a local search bar and filters actors by party and committee text', async () => {
    render(
      <MemoryRouter>
        <Actors />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Filter actors')).toBeInTheDocument();
    expect(screen.getByText('Showing all 3 tracked actors')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter actors'), {
      target: { value: 'chega' },
    });

    await waitFor(() => {
      expect(screen.getByText('Showing 1 of 3 tracked actors')).toBeInTheDocument();
      expect(screen.getByText('André Ventura')).toBeInTheDocument();
      expect(screen.queryByText('Ana Ribeiro')).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Filter actors'), {
      target: { value: 'environment' },
    });

    await waitFor(() => {
      expect(screen.getByText('Sven Berg')).toBeInTheDocument();
      expect(screen.queryByText('André Ventura')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'PT (2)' }));
    fireEvent.change(screen.getByLabelText('Filter actors'), {
      target: { value: 'health' },
    });

    await waitFor(() => {
      expect(screen.getByText('Showing 1 of 2 tracked actors')).toBeInTheDocument();
      expect(screen.getByText('Ana Ribeiro')).toBeInTheDocument();
      expect(screen.queryByText('Sven Berg')).not.toBeInTheDocument();
    });
  });
});
