import { describe, expect, it } from 'vitest';
import { buildParlamentAtSourceUrl, buildProposalFromParlamentAtRow } from '@/lib/parlament-at-helpers';

const HEADERS = [
  { feld_name: 'DATUM' },
  { feld_name: 'PFAD' },
  { feld_name: 'STATUS' },
  { feld_name: 'HIS_URL' },
  { feld_name: 'DATUM_VON' },
  { feld_name: 'PAD_INTERN' },
  { feld_name: 'THEMEN' },
  { feld_name: 'SW' },
  { feld_name: 'EUROVOC' },
  { feld_name: 'VOTE_TEXT' },
];

describe('buildProposalFromParlamentAtRow', () => {
  it('maps an adopted Austrian government bill row', () => {
    const row = buildProposalFromParlamentAtRow(HEADERS, [
      '2025-11-18',
      'Abgabenänderungsgesetz 2025 – AbgÄG 2025',
      '5',
      '/gegenstand/XXVIII/I/294',
      '2025-11-18T00:00:00',
      '["32506"]',
      '["Budget und Finanzen"]',
      '["Steuern und Gebühren"]',
      '["Steuerwesen"]',
      'Dafür: V, S, N, G, Dagegen: F',
    ]);

    expect(row).toMatchObject({
      title: 'Abgabenänderungsgesetz 2025 – AbgÄG 2025',
      status: 'adopted',
      country_code: 'AT',
      submitted_date: '2025-11-18',
      vote_date: '2025-11-18',
      sponsors: ['PAD_INTERN:32506'],
      policy_area: 'finance',
      source_url: buildParlamentAtSourceUrl('/gegenstand/XXVIII/I/294'),
      data_source: 'parlament_at',
    });
  });

  it('maps a committee-stage Austrian bill row', () => {
    const row = buildProposalFromParlamentAtRow(HEADERS, [
      '2008-08-13',
      'Veräußerung von unbeweglichem Bundesvermögen',
      '2',
      '/gegenstand/XXIII/I/676',
      '2008-08-13T00:00:00',
      '[]',
      '["Budget und Finanzen"]',
      '["Bundesvermögen"]',
      '["öffentliches Eigentum"]',
      '',
    ]);

    expect(row).toMatchObject({
      status: 'committee',
      submitted_date: '2008-08-13',
      vote_date: null,
      source_url: buildParlamentAtSourceUrl('/gegenstand/XXIII/I/676'),
    });
  });
});
