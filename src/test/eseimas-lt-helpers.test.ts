import { describe, expect, it } from 'vitest';
import { buildProposalFromESeimasLtEntry, normalizeESeimasLtStatus } from '@/lib/eseimas-lt-helpers';

describe('normalizeESeimasLtStatus', () => {
  it('maps Lithuanian status labels into proposal states', () => {
    expect(normalizeESeimasLtStatus('Priimtas teisės aktas')).toBe('adopted');
    expect(normalizeESeimasLtStatus('Atmestas')).toBe('rejected');
    expect(normalizeESeimasLtStatus('Atsiimtas')).toBe('withdrawn');
    expect(normalizeESeimasLtStatus('Registruotas')).toBe('consultation');
    expect(normalizeESeimasLtStatus('Svarstomas komitete')).toBe('parliamentary_deliberation');
  });
});

describe('buildProposalFromESeimasLtEntry', () => {
  it('maps an adopted Lithuanian bill from the official registry', () => {
    const row = buildProposalFromESeimasLtEntry({
      typeLabel: 'Įstatymo projektas',
      title: 'Biudžeto sandaros įstatymo Nr. I-430 pakeitimo įstatymo projektas',
      documentNumber: 'XIVP-1000',
      registeredAt: '2024-10-17',
      statusLabel: 'Priimtas teisės aktas',
      sponsorLabel: 'Lietuvos Respublikos Vyriausybė',
      detailUrl: 'https://e-seimas.lrs.lt/portal/legalAct/lt/TAP/example?positionInSearchResults=0',
    }, {
      typeLabel: 'Įstatymo projektas',
      registeredAt: '2024-10-17',
      statusLabel: 'Priimtas teisės aktas',
      sponsorLabel: 'Lietuvos Respublikos Vyriausybė',
      chronologyDates: ['2024-10-17', '2024-12-20'],
    });

    expect(row).toMatchObject({
      proposal_type: 'budget',
      status: 'adopted',
      submitted_date: '2024-10-17',
      vote_date: '2024-12-20',
      sponsors: ['Lietuvos Respublikos Vyriausybė'],
      policy_area: 'finance',
      data_source: 'eseimas_lt',
      source_url: 'https://e-seimas.lrs.lt/portal/legalAct/lt/TAP/example',
    });
  });

  it('keeps superseded variants as withdrawn official proposals', () => {
    const row = buildProposalFromESeimasLtEntry({
      typeLabel: 'Įstatymo projektas',
      title: 'Elektroninių ryšių įstatymo pakeitimo įstatymo projektas',
      documentNumber: 'XIVP-2000(2)',
      registeredAt: '2024-05-16',
      statusLabel: 'Senas variantas (kai užregistruotas kitas variantas)',
      sponsorLabel: 'Lietuvos Respublikos Seimas, Ekonomikos komitetas',
      detailUrl: 'https://e-seimas.lrs.lt/portal/legalAct/lt/TAP/example-2',
    }, {
      typeLabel: 'Įstatymo projektas',
      registeredAt: '2024-05-16',
      statusLabel: 'Senas variantas (kai užregistruotas kitas variantas)',
      sponsorLabel: 'Lietuvos Respublikos Seimas, Ekonomikos komitetas',
      chronologyDates: ['2024-05-16'],
    });

    expect(row).toMatchObject({
      status: 'withdrawn',
      proposal_type: 'bill',
      policy_area: 'digital',
      vote_date: '2024-05-16',
    });
  });
});
