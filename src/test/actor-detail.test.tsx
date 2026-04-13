import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ActorDetail from '@/pages/ActorDetail';
import { resolvePoliticalPosition } from '@/lib/political-positioning';

const baseMockPolitician = {
  id: 'ventura',
  name: 'André Ventura',
  partyId: 'CH',
  party: 'CH',
  partyName: 'Chega',
  partyAbbreviation: 'CH',
  canton: 'Portugal',
  cityId: 'lisbon',
  countryId: 'pt',
  role: 'Party Leader',
  jurisdiction: 'federal',
  committees: [],
  recentVotes: [],
  revisionId: 'rev-ventur',
  updatedAt: '2026-04-13T10:00:00Z',
  wikipediaSummary: 'Portuguese politician and leader of Chega.',
  wikipediaUrl: 'https://en.wikipedia.org/wiki/Andr%C3%A9_Ventura',
  wikipediaData: {
    description: 'Portuguese politician',
  },
  dataSource: 'official_record',
  sourceUrl: 'https://www.parlamento.pt/example-record',
  sourceAttribution: {
    role: {
      source_label: 'Assembly of the Republic',
      source_type: 'official_record',
      source_url: 'https://www.parlamento.pt/example-record',
    },
  },
};

let mockPolitician: any = { ...baseMockPolitician };
let mockPosition = resolvePoliticalPosition({
  ideology_label: 'Centrist / Unclassified',
  data_source: 'party_family_mapping',
  economic_score: -0.8,
  social_score: 1.6,
  eu_integration_score: 2.7,
  environmental_score: 0.7,
  immigration_score: 1.5,
  key_positions: {
    eu_federalism: 'neutral',
    climate_action: 'moderate',
  },
}, 'Chega', 'CH', 'PT');
const mockWikipediaFallback = vi.fn(() => ({
  data: null,
}));

vi.mock('@/hooks/use-politicians', () => ({
  usePolitician: () => ({
    data: mockPolitician,
    isLoading: false,
  }),
  usePoliticianEvents: () => ({ data: [] }),
  usePoliticianFinances: () => ({ data: null }),
  usePoliticianInvestments: () => ({ data: [] }),
  usePoliticianPosition: () => ({
    data: mockPosition,
  }),
  useAllPositions: () => ({ data: [] }),
  usePoliticianAssociates: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-proposals', () => ({
  useProposalsByCountry: () => ({
    data: [],
  }),
  statusLabels: {},
  statusColors: {},
}));

vi.mock('@/hooks/use-wikipedia-page', () => ({
  useWikipediaPageSummary: () => mockWikipediaFallback(),
}));

vi.mock('@/hooks/use-country-metadata', () => ({
  useCountryMetadata: () => ({
    data: {
      countryCode: 'PT',
      countryName: 'Portugal',
      flagEmoji: '🇵🇹',
      capital: 'Lisbon',
      headOfState: 'Marcelo Rebelo de Sousa',
      headOfGovernment: 'Luís Montenegro',
      officeholders: [
        {
          office: 'Head of State',
          personName: 'Marcelo Rebelo de Sousa',
          personUrl: 'https://en.wikipedia.org/wiki/Marcelo_Rebelo_de_Sousa',
        },
      ],
      wikipediaUrl: 'https://en.wikipedia.org/wiki/Portugal',
    },
  }),
}));

vi.mock('@/hooks/use-party-metadata', () => ({
  usePartyMetadata: () => ({
    data: {
      partyName: 'Chega',
      politicalPosition: 'right-wing populist',
      ideologies: ['national conservatism'],
      leaders: [
        {
          name: 'André Ventura',
          url: 'https://en.wikipedia.org/wiki/Andr%C3%A9_Ventura',
        },
      ],
      officialWebsite: 'https://partidochega.pt',
      summary: 'Chega is a Portuguese right-wing populist political party.',
      wikipediaUrl: 'https://en.wikipedia.org/wiki/Chega',
    },
  }),
}));

describe('ActorDetail page', () => {
  it('replaces the legacy centrist bucket with the stricter Chega estimate', async () => {
    mockPolitician = { ...baseMockPolitician };
    mockPosition = resolvePoliticalPosition({
      ideology_label: 'Centrist / Unclassified',
      data_source: 'party_family_mapping',
      economic_score: -0.8,
      social_score: 1.6,
      eu_integration_score: 2.7,
      environmental_score: 0.7,
      immigration_score: 1.5,
      key_positions: {
        eu_federalism: 'neutral',
        climate_action: 'moderate',
      },
    }, 'Chega', 'CH', 'PT');
    mockWikipediaFallback.mockReturnValue({ data: null });

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/actors/ventura']}
      >
        <Routes>
          <Route path="/actors/:id" element={<ActorDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'André Ventura' })).toBeInTheDocument();
    expect(screen.getByText('Right-wing populist')).toBeInTheDocument();
    expect(screen.getByText('restrictive')).toBeInTheDocument();
    expect(screen.getByText('eurosceptic')).toBeInTheDocument();
    expect(screen.getByText('Estimated from party affiliation and party-family mapping. This is not a person-specific voting model.')).toBeInTheDocument();
    expect(screen.queryByText('Centrist / Unclassified')).not.toBeInTheDocument();
    expect(screen.queryByText(/^neutral$/i)).not.toBeInTheDocument();
  });

  it('falls back to live Wikipedia summary data when the stored row is empty', async () => {
    mockPolitician = {
      ...baseMockPolitician,
      photoUrl: undefined,
      wikipediaSummary: undefined,
      wikipediaData: undefined,
    };
    mockPosition = resolvePoliticalPosition({
      ideology_label: 'Centrist / Unclassified',
      data_source: 'party_family_mapping',
      economic_score: -0.8,
      social_score: 1.6,
      eu_integration_score: 2.7,
      environmental_score: 0.7,
      immigration_score: 1.5,
      key_positions: {
        eu_federalism: 'neutral',
        climate_action: 'moderate',
      },
    }, 'Chega', 'CH', 'PT');
    mockWikipediaFallback.mockReturnValue({
      data: {
        canonicalUrl: 'https://en.wikipedia.org/wiki/Andr%C3%A9_Ventura',
        description: 'Portuguese politician and lawyer',
        extract: 'Live Wikipedia fallback biography.',
        imageUrl: 'https://upload.wikimedia.org/fallback.jpg',
      },
    });

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/actors/ventura']}
      >
        <Routes>
          <Route path="/actors/:id" element={<ActorDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Live Wikipedia fallback biography.')).toBeInTheDocument();
    expect(screen.getByText('Portuguese politician and lawyer')).toBeInTheDocument();
    expect(screen.getByAltText('André Ventura')).toBeInTheDocument();
  });

  it('renders dossier context for sparse actors even without events or finances', async () => {
    mockPolitician = {
      ...baseMockPolitician,
      committees: [],
      wikipediaSummary: 'Stored biography',
    };
    mockPosition = {
      ideology_label: 'Unclassified',
      data_source: 'unclassified_party_profile',
      key_positions: {},
    };
    mockWikipediaFallback.mockReturnValue({ data: null });

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/actors/ventura']}
      >
        <Routes>
          <Route path="/actors/:id" element={<ActorDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('PROFILE DOSSIER')).toBeInTheDocument();
    expect(screen.getByText('COUNTRY CONTEXT')).toBeInTheDocument();
    expect(screen.getByText('PARTY CONTEXT')).toBeInTheDocument();
    expect(screen.getByText('RECORD SOURCES')).toBeInTheDocument();
    expect(screen.getByText('COVERAGE SNAPSHOT')).toBeInTheDocument();
    expect(screen.getByText('Lisbon')).toBeInTheDocument();
    expect(screen.getByText('Chega is a Portuguese right-wing populist political party.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Head of state Marcelo Rebelo de Sousa' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Party website →' })).toBeInTheDocument();
    expect(screen.getByText(/party-family mapping does not classify it/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Assembly of the Republic/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Open source record' })).toBeInTheDocument();
  });
});
