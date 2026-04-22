import { describe, expect, it } from 'vitest';
import { buildProposalFromPspCzEntry, isPspCzBillType } from '@/lib/psp-cz-helpers';

describe('isPspCzBillType', () => {
  it('keeps Czech law proposals and budgets', () => {
    expect(isPspCzBillType('Poslanecký návrh zákona')).toBe(true);
    expect(isPspCzBillType('Vládní návrh zákona')).toBe(true);
    expect(isPspCzBillType('Státní rozpočet')).toBe(true);
    expect(isPspCzBillType('Usnesení výboru')).toBe(false);
  });
});

describe('buildProposalFromPspCzEntry', () => {
  it('maps a current-term Czech MP bill', () => {
    const row = buildProposalFromPspCzEntry({
      printNumber: '4',
      title: 'Novela z. o daních z příjmů',
      typeLabel: 'Poslanecký návrh zákona',
      sourceUrl: 'https://www.psp.cz/sqw/historie.sqw?o=10&t=4',
    }, 'Skupina poslanců (Olga Richterová, Ivan Bartoš) předložila sněmovní návrh zákona 15. 10. 2025. Stav projednávání ke dni: 21. dubna 2026.');

    expect(row).toMatchObject({
      status: 'parliamentary_deliberation',
      submitted_date: '2025-10-15',
      sponsors: ['Olga Richterová', 'Ivan Bartoš'],
      source_url: 'https://www.psp.cz/sqw/historie.sqw?o=10&t=4',
      data_source: 'psp_cz',
    });
  });

  it('extracts regional sponsor names from the official wording', () => {
    const row = buildProposalFromPspCzEntry({
      printNumber: '141',
      title: 'Novela z. o rozpočtovém určení daní',
      typeLabel: 'Návrh zákona zastupitelstva kraje',
      sourceUrl: 'https://www.psp.cz/sqw/historie.sqw?o=10&T=141',
    }, 'Zastupitelstvo Pardubického kraje předložilo sněmovně návrh zákona 12. 3. 2026. Vláda zaslala stanovisko 21. 4. 2026.');

    expect(row).toMatchObject({
      submitted_date: '2026-03-12',
      sponsors: ['Zastupitelstvo Pardubického kraje'],
    });
  });
});
