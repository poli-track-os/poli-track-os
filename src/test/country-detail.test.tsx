import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CountryDetail from '@/pages/CountryDetail';

const usePoliticiansByCountryMock = vi.fn();
const useCountryStatsMock = vi.fn();
const useCountryMetadataMock = vi.fn();
const usePartiesMetadataMock = vi.fn();
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
  usePartiesMetadata: (countryName: string | undefined, partyNames: string[]) =>
    usePartiesMetadataMock(countryName, partyNames),
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

vi.mock('@/components/CountryMiniGlobe', () => ({
  default: ({ countryName }: { countryName: string }) => <div>Globe preview for {countryName}</div>,
}));

// CountryBudgetPanel hits TanStack Query hooks against the new
// government_expenditure / cofog_functions / country_demographics tables.
// Stub it for unit tests that focus on country-level rendering.
vi.mock('@/components/CountryBudgetPanel', () => ({
  default: () => <div data-testid="country-budget-panel-stub" />,
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

describe('CountryDetail page', () => {
  beforeEach(() => {
    usePoliticiansByCountryMock.mockReset();
    useCountryStatsMock.mockReset();
    useCountryMetadataMock.mockReset();
    usePartiesMetadataMock.mockReset();
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
        description: 'federal parliamentary republic in Europe',
        summary: 'Germany is a federal parliamentary republic in Central Europe.',
        capital: 'Berlin',
        sourceUpdatedAt: '2026-04-12T10:30:00Z',
        dataSource: 'supabase',
        headOfState: 'Frank-Walter Steinmeier',
        headOfGovernment: 'Markus Vogel',
        population: 84000000,
        areaKm2: 357588,
        coordinates: { lat: 52.52, lon: 13.405 },
        wikipediaUrl: 'https://en.wikipedia.org/wiki/Germany',
        officeholders: [
          {
            office: 'Head of State',
            personName: 'Frank-Walter Steinmeier',
            personUrl: 'https://en.wikipedia.org/wiki/Frank-Walter_Steinmeier',
          },
          {
            office: 'Head of Government',
            personName: 'Markus Vogel',
            personUrl: 'https://en.wikipedia.org/wiki/Markus_Vogel',
          },
          {
            office: 'Finance Minister',
            personName: 'Ada Lovelace',
            personUrl: 'https://en.wikipedia.org/wiki/Ada_Lovelace',
          },
          {
            office: 'Health Minister',
            personName: 'Clara Weiss',
            personUrl: 'https://en.wikipedia.org/wiki/Clara_Weiss',
          },
          {
            office: 'Secretary of Education',
            personName: 'Sofia Hartmann',
            personUrl: 'https://en.wikipedia.org/wiki/Sofia_Hartmann',
          },
          {
            office: 'Chief of Defence',
            personName: 'Erik Brandt',
            personUrl: 'https://en.wikipedia.org/wiki/Erik_Brandt',
          },
        ],
      },
    });

    usePartiesMetadataMock.mockReturnValue({
      data: {
        SPD: {
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
          wikipediaUrl: 'https://en.wikipedia.org/wiki/Social_Democratic_Party_of_Germany',
        },
        CDU: {
          partyName: 'CDU',
          countryName: 'Germany',
          description: 'centre-right Christian democratic political party in Germany',
          summary: 'The CDU is a Christian democratic political party in Germany.',
          leaders: [
            {
              name: 'Markus Vogel',
              url: 'https://en.wikipedia.org/wiki/Markus_Vogel',
            },
          ],
          ideologies: ['Christian democracy'],
          politicalPosition: 'centre-right',
          wikipediaUrl: 'https://en.wikipedia.org/wiki/Christian_Democratic_Union_of_Germany',
        },
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

  function renderPage() {
    return render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/country/de']}
      >
        <Routes>
          <Route path="/country/:id" element={<CountryDetail />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('groups politicians by party and restores recent proposals and country facts', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Germany' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'SPD' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'CDU' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Frank-Walter Steinmeier').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Markus Vogel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Digital Sovereignty Act').length).toBeGreaterThan(0);
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JUMP TO PROPOSALS' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Frank-Walter Steinmeier' })).toHaveAttribute('href', '/actors?country=de&q=Frank-Walter+Steinmeier');
    expect(screen.getByRole('link', { name: 'Open officeholder source for Frank-Walter Steinmeier' })).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Frank-Walter_Steinmeier');
    expect(screen.getAllByRole('link', { name: 'View Ada Lovelace' }).some((node) => node.getAttribute('href') === '/actors/actor-1')).toBe(true);
    expect(screen.getAllByRole('link', { name: 'View Markus Vogel' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'View Markus Vogel' })).toHaveAttribute('href', '/actors/actor-3');
    expect(screen.getByRole('link', { name: 'View Clara Weiss' })).toHaveAttribute('href', '/actors?country=de&q=Clara+Weiss');
    expect(screen.getByText('PEOPLE AT THE TOP OF THE PYRAMID')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Sofia Hartmann' })).toHaveAttribute('href', '/actors?country=de&q=Sofia+Hartmann');
    expect(screen.getByRole('link', { name: 'View Erik Brandt' })).toHaveAttribute('href', '/actors?country=de&q=Erik+Brandt');
    expect(screen.getByText('LAST UPDATED · Apr 12, 2026, 10:30 UTC')).toBeInTheDocument();
    expect(screen.getByText('CACHED · SUPABASE')).toBeInTheDocument();
    expect(screen.getAllByText('centre-left political party in Germany').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Party leader Ada Lovelace' })).toHaveAttribute('href', '/actors/actor-1');
    expect(screen.getByRole('link', { name: 'Open source for party leader Ada Lovelace' })).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Ada_Lovelace');
  });

  it('filters the actor list with the country search bar', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Filter actors in this country'), {
      target: { value: 'budget' },
    });

    await waitFor(() => {
      expect(screen.getByText('Showing 1 of 3 tracked actors')).toBeInTheDocument();
      expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
      expect(screen.queryByText('Greta Schulz')).not.toBeInTheDocument();
    });
  });

  it('derives a readable name from the Wikipedia link when Wikidata only returns an entity id', () => {
    useCountryMetadataMock.mockReturnValue({
      data: {
        countryCode: 'PT',
        countryName: 'Portugal',
        flagEmoji: '🇵🇹',
        capital: 'Lisbon',
        headOfGovernment: 'Q610788',
        officeholders: [
          {
            office: 'Prime Minister',
            personName: 'Q610788',
            personEntityId: 'Q610788',
            personUrl: 'https://en.wikipedia.org/wiki/Ant%C3%B3nio_Costa',
          },
        ],
      },
    });

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/country/pt']}
      >
        <Routes>
          <Route path="/country/:id" element={<CountryDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('António Costa').length).toBeGreaterThan(0);
    expect(screen.queryByText('Q610788')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View António Costa' })).toHaveAttribute(
      'href',
      '/actors?country=pt&q=Ant%C3%B3nio+Costa',
    );
    expect(screen.getByRole('link', { name: 'Open officeholder source for António Costa' })).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/wiki/Ant%C3%B3nio_Costa',
    );
  });

  it('matches officeholders to tracked actors by profile url when labels differ', () => {
    usePoliticiansByCountryMock.mockReturnValue({
      data: [
        makeActor({
          id: 'actor-cy-1',
          name: 'Nicos Christodoulides',
          countryId: 'cy',
          canton: 'Cyprus',
          role: 'President',
          wikipediaUrl: 'https://en.wikipedia.org/wiki/Nikos_Christodoulides',
          revisionId: 'rev-cy001',
        }),
      ],
      isLoading: false,
    });

    useCountryStatsMock.mockReturnValue({
      data: [
        { code: 'CY', name: 'Cyprus', continent: 'Europe', actorCount: 1, partyCount: 0, parties: [] },
      ],
    });

    useCountryMetadataMock.mockReturnValue({
      data: {
        countryCode: 'CY',
        countryName: 'Cyprus',
        capital: 'Nicosia',
        headOfState: 'Nicos Christodoulides',
        headOfGovernment: 'Nicos Christodoulides',
        officeholders: [
          {
            office: 'Head of State',
            personName: 'Nicos Christodoulides',
            personEntityId: 'Q48905549',
            personUrl: 'https://en.wikipedia.org/wiki/Nikos_Christodoulides',
          },
          {
            office: 'President',
            personName: 'Nikolas Papadopoulos',
            personEntityId: 'Q3161181',
            personUrl: 'https://en.wikipedia.org/wiki/Nikolas_Papadopoulos',
          },
          {
            office: "President of Citizens' Alliance (Cyprus)",
            personName: 'Giorgos Lillikas',
            personEntityId: 'Q694791',
            personUrl: 'https://en.wikipedia.org/wiki/Giorgos_Lillikas',
          },
        ],
      },
    });

    usePartiesMetadataMock.mockReturnValue({ data: {} });
    useProposalsByCountryMock.mockReturnValue({ data: [] });

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/country/cy']}
      >
        <Routes>
          <Route path="/country/:id" element={<CountryDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Head of state Nicos Christodoulides' })).toHaveAttribute('href', '/actors/actor-cy-1');
    expect(screen.queryByText('Nikolas Papadopoulos')).not.toBeInTheDocument();
    expect(screen.queryByText('Giorgos Lillikas')).not.toBeInTheDocument();
  });
});
