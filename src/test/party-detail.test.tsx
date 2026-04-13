import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PartyDetail from '@/pages/PartyDetail';

const usePoliticiansByCountryMock = vi.fn();
const useCountryStatsMock = vi.fn();
const useCountryMetadataMock = vi.fn();
const usePartyMetadataMock = vi.fn();
const useProposalsByCountryMock = vi.fn();

vi.mock('@/hooks/use-politicians', () => ({
  usePoliticiansByCountry: (countryCode: string | undefined) => usePoliticiansByCountryMock(countryCode),
  useCountryStats: () => useCountryStatsMock(),
}));

vi.mock('@/hooks/use-country-metadata', () => ({
  useCountryMetadata: (countryCode: string | undefined, countryName: string | undefined) =>
    useCountryMetadataMock(countryCode, countryName),
}));

vi.mock('@/hooks/use-party-metadata', () => ({
  usePartyMetadata: (partyName: string | undefined, countryName: string | undefined) =>
    usePartyMetadataMock(partyName, countryName),
}));

vi.mock('@/hooks/use-proposals', () => ({
  useProposalsByCountry: (countryCode: string | undefined) => useProposalsByCountryMock(countryCode),
  statusLabels: {
    adopted: 'ADOPTED',
  },
  statusColors: {
    adopted: 'bg-green-500/10',
  },
}));

function makeActor(overrides: Record<string, unknown>) {
  return {
    id: 'actor-default',
    name: 'Default Actor',
    partyId: 'party-default',
    party: 'Independent',
    canton: 'Germany',
    cityId: '',
    countryId: 'de',
    role: 'Member of Parliament',
    jurisdiction: 'federal' as const,
    committees: [],
    recentVotes: [],
    revisionId: 'rev-actor00',
    updatedAt: '2026-04-12T10:00:00Z',
    ...overrides,
  };
}

describe('PartyDetail page', () => {
  beforeEach(() => {
    usePoliticiansByCountryMock.mockReset();
    useCountryStatsMock.mockReset();
    useCountryMetadataMock.mockReset();
    usePartyMetadataMock.mockReset();
    useProposalsByCountryMock.mockReset();

    usePoliticiansByCountryMock.mockReturnValue({
      data: [
        makeActor({
          id: 'actor-1',
          name: 'Ada Lovelace',
          partyId: 'spd',
          party: 'SPD',
          role: 'Finance Minister',
          committees: ['Budget'],
          revisionId: 'rev-actor01',
        }),
        makeActor({
          id: 'actor-2',
          name: 'Greta Schulz',
          partyId: 'spd',
          party: 'SPD',
          role: 'Parliament Member',
          committees: ['Digital Affairs'],
          revisionId: 'rev-actor02',
        }),
        makeActor({
          id: 'actor-3',
          name: 'Markus Vogel',
          partyId: 'cdu',
          party: 'CDU',
          role: 'Chancellor',
          committees: ['Energy'],
          revisionId: 'rev-actor03',
        }),
      ],
      isLoading: false,
    });

    useCountryStatsMock.mockReturnValue({
      data: [
        {
          code: 'DE',
          name: 'Germany',
          continent: 'Europe',
          actorCount: 3,
          partyCount: 2,
          parties: ['SPD', 'CDU'],
        },
      ],
    });

    useCountryMetadataMock.mockReturnValue({
      data: {
        countryCode: 'DE',
        countryName: 'Germany',
        flagEmoji: '🇩🇪',
        capital: 'Berlin',
        headOfGovernment: 'Olaf Scholz',
      },
    });

    usePartyMetadataMock.mockReturnValue({
      data: {
        partyName: 'SPD',
        countryName: 'Germany',
        description: 'centre-left political party in Germany',
        summary: 'The SPD is a social democratic political party in Germany.',
        leaders: [
          {
            name: 'Ada Lovelace',
            url: 'https://en.wikipedia.org/wiki/Ada_Lovelace',
          },
        ],
        ideologies: ['social democracy'],
        politicalPosition: 'centre-left',
        foundedYear: 1875,
        officialWebsite: 'https://www.spd.de/',
        wikipediaUrl: 'https://en.wikipedia.org/wiki/Social_Democratic_Party_of_Germany',
      },
    });

    useProposalsByCountryMock.mockReturnValue({
      data: [
        {
          id: 'proposal-1',
          title: 'Digital Sovereignty Act',
          official_title: 'Digital Sovereignty Act',
          status: 'adopted',
          proposal_type: 'bill',
          jurisdiction: 'federal',
          country_code: 'DE',
          country_name: 'Germany',
          vote_date: null,
          submitted_date: '2026-04-10',
          sponsors: ['Bundestag'],
          affected_laws: [],
          evidence_count: 3,
          summary: 'A reform package for digital infrastructure.',
          policy_area: 'technology',
          source_url: null,
          created_at: '2026-04-10T00:00:00Z',
          updated_at: '2026-04-10T00:00:00Z',
        },
      ],
    });
  });

  it('renders a country-scoped party page with members and context', () => {
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/country/de/party/spd']}
      >
        <Routes>
          <Route path="/country/:countryId/party/:partyId" element={<PartyDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'SPD' })).toBeInTheDocument();
    expect(screen.getByText('centre-left political party in Germany')).toBeInTheDocument();
    expect(screen.getByText(/social democratic political party in Germany/i)).toBeInTheDocument();
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
    expect(screen.getByText('Greta Schulz')).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getAllByText('Digital Sovereignty Act').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Party leader Ada Lovelace' })).toHaveAttribute('href', '/actors/actor-1');
    expect(screen.getByText('social democracy')).toBeInTheDocument();
    expect(screen.getByText('1875')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /www\.spd\.de/i })).toHaveAttribute('href', 'https://www.spd.de/');
  });
});
