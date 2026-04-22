import { describe, expect, it } from 'vitest';
import {
  buildNrsrSkSourceUrl,
  buildProposalFromNrsrSkEntry,
  isNrsrSkBillCategory,
  normalizeNrsrSkStatus,
  parseNrsrSkDate,
} from '@/lib/nrsr-sk-helpers';

describe('parseNrsrSkDate', () => {
  it('parses Slovak dotted dates', () => {
    expect(parseNrsrSkDate('2. 4. 2026')).toBe('2026-04-02');
    expect(parseNrsrSkDate('17. 1. 2025')).toBe('2025-01-17');
  });
});

describe('normalizeNrsrSkStatus', () => {
  it('maps official Slovak lifecycle labels into proposal states', () => {
    expect(normalizeNrsrSkStatus('Evidencia', null)).toBe('parliamentary_deliberation');
    expect(normalizeNrsrSkStatus('Výber poradcov k NZ', null)).toBe('parliamentary_deliberation');
    expect(normalizeNrsrSkStatus('Rokovanie vo výboroch', null)).toBe('committee');
    expect(normalizeNrsrSkStatus('Uzavretá úloha', null)).toBe('rejected');
    expect(normalizeNrsrSkStatus('III. čítanie', '17. 1. 2025')).toBe('adopted');
  });
});

describe('isNrsrSkBillCategory', () => {
  it('keeps only real bill categories from the official search table', () => {
    expect(isNrsrSkBillCategory('Novela zákona')).toBe(true);
    expect(isNrsrSkBillCategory('Návrh zákona o štátnom rozpočte')).toBe(true);
    expect(isNrsrSkBillCategory('Správa')).toBe(false);
    expect(isNrsrSkBillCategory('Iný typ')).toBe(false);
  });
});

describe('buildProposalFromNrsrSkEntry', () => {
  it('maps an in-flight Slovak bill from the official list/detail pages', () => {
    const row = buildProposalFromNrsrSkEntry({
      masterId: '10747',
      title: 'Návrh poslancov Národnej rady Slovenskej republiky Mariána ČAUČÍKA, Milana MAJERSKÉHO a Andrey TURČANOVEJ na vydanie zákona, ktorým sa dopĺňa zákon č. 442/2002 Z. z. o verejných vodovodoch a verejných kanalizáciách',
      printNumber: '1281',
      statusLabel: 'Výber poradcov k NZ',
      deliveredDate: '2. 4. 2026',
      approvedDate: null,
      proposers: 'M. Čaučík, M. Majerský, A. Turčanová',
      categoryLabel: 'Novela zákona',
      sourceUrl: buildNrsrSkSourceUrl('10747'),
    }, {
      processState: 'Výber poradcov k NZ',
      title: 'Návrh poslancov Národnej rady Slovenskej republiky Mariána ČAUČÍKA, Milana MAJERSKÉHO a Andrey TURČANOVEJ na vydanie zákona, ktorým sa dopĺňa zákon č. 442/2002 Z. z. o verejných vodovodoch a verejných kanalizáciách',
      categoryLabel: 'Novela zákona',
      printNumber: '1281',
      deliveredDate: '2. 4. 2026',
      proposers: 'poslanci NR SR (M. Čaučík, M. Majerský, A. Turčanová)',
    });

    expect(row).toMatchObject({
      status: 'parliamentary_deliberation',
      proposal_type: 'bill',
      submitted_date: '2026-04-02',
      sponsors: ['M. Čaučík', 'M. Majerský', 'A. Turčanová'],
      policy_area: 'environment',
      source_url: 'https://www.nrsr.sk/web/Default.aspx?sid=zakony/zakon&MasterID=10747',
      data_source: 'nrsr_sk',
    });
  });

  it('classifies adopted Slovak budget bills from official approval dates', () => {
    const row = buildProposalFromNrsrSkEntry({
      masterId: '10146',
      title: 'Návrh zákona o štátnom rozpočte na rok 2025',
      printNumber: '980',
      statusLabel: 'III. čítanie',
      deliveredDate: '10. 10. 2024',
      approvedDate: '17. 1. 2025',
      proposers: 'vláda (Ministerstvo životného prostredia SR)',
      categoryLabel: 'Návrh zákona o štátnom rozpočte',
      sourceUrl: buildNrsrSkSourceUrl('10146'),
    }, {
      processState: 'Uzavretá úloha',
      title: 'Návrh zákona o štátnom rozpočte na rok 2025',
      categoryLabel: 'Návrh zákona o štátnom rozpočte',
      printNumber: '980',
      deliveredDate: '10. 10. 2024',
      proposers: 'vláda (Ministerstvo životného prostredia SR)',
    });

    expect(row).toMatchObject({
      status: 'adopted',
      proposal_type: 'budget',
      vote_date: '2025-01-17',
      submitted_date: '2024-10-10',
      sponsors: ['vláda (Ministerstvo životného prostredia SR)'],
      policy_area: 'finance',
    });
  });
});
