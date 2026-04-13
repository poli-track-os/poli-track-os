import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import DataCoverageExplorer from '@/components/DataCoverageExplorer';
import {
  buildCoverageModel,
  type CoveragePoliticianRow,
} from '@/lib/data-coverage';

function makePolitician(overrides: Partial<CoveragePoliticianRow>): CoveragePoliticianRow {
  return {
    id: 'person-default',
    name: 'Default Person',
    role: 'Member of Parliament',
    country_code: 'DE',
    country_name: 'Germany',
    party_name: 'Independent',
    party_abbreviation: 'IND',
    biography: 'Stored biography',
    photo_url: 'https://example.com/photo.jpg',
    wikipedia_url: 'https://en.wikipedia.org/wiki/Default_Person',
    wikipedia_summary: 'Stored Wikipedia summary',
    wikipedia_image_url: 'https://example.com/wiki.jpg',
    enriched_at: '2026-04-13T12:00:00Z',
    birth_year: 1980,
    twitter_handle: 'defaultperson',
    ...overrides,
  };
}

describe('DataCoverageExplorer', () => {
  it('tracks coverage by people, parties, and countries with searchable tabs', () => {
    const politicians = [
      makePolitician({
        id: 'ada',
        name: 'Ada Complete',
        country_code: 'DE',
        country_name: 'Germany',
        party_name: 'Progressive Union',
        party_abbreviation: 'PU',
      }),
      makePolitician({
        id: 'bruno',
        name: 'Bruno Sparse',
        role: 'Finance Minister',
        country_code: 'PT',
        country_name: 'Portugal',
        party_name: 'Green Alliance',
        party_abbreviation: 'GA',
        biography: null,
        wikipedia_summary: null,
        photo_url: null,
        wikipedia_image_url: null,
        twitter_handle: null,
      }),
      makePolitician({
        id: 'clara',
        name: 'Clara Null',
        role: 'Committee Chair',
        country_code: 'PT',
        country_name: 'Portugal',
        party_name: 'Green Alliance',
        party_abbreviation: 'GA',
        biography: null,
        photo_url: null,
        wikipedia_url: null,
        wikipedia_summary: null,
        wikipedia_image_url: null,
        enriched_at: null,
        birth_year: null,
        twitter_handle: null,
      }),
    ];

    const coverage = buildCoverageModel({
      politicians,
      financeIds: new Set(['ada', 'bruno']),
      investmentIds: new Set(['ada']),
      positionIds: new Set(['ada', 'bruno']),
    });

    render(
      <MemoryRouter>
        <DataCoverageExplorer coverage={coverage} theme="light" />
      </MemoryRouter>,
    );

    expect(screen.getByText('COVERAGE LEDGER')).toBeInTheDocument();
    expect(screen.getByText('PEOPLE (3)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clara Null' })).toBeInTheDocument();
    expect(screen.getByText('Biography')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search coverage ledger'), {
      target: { value: 'bruno' },
    });

    expect(screen.getByRole('link', { name: 'Bruno Sparse' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Clara Null' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'PARTIES (2)' }));
    expect(screen.getByRole('link', { name: 'Green Alliance' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search coverage ledger'), {
      target: { value: 'portugal' },
    });

    expect(screen.getByRole('link', { name: 'Green Alliance' })).toBeInTheDocument();
    expect(screen.getByText('Portugal (PT)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'COUNTRIES (2)' }));
    expect(screen.getByRole('link', { name: 'Portugal' })).toBeInTheDocument();
    expect(screen.getByText('PT')).toBeInTheDocument();
  });
});
