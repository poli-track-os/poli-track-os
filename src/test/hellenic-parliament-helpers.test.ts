import { describe, expect, it } from 'vitest';
import {
  buildProposalFromHellenicParliamentEntry,
  normalizeHellenicParliamentStatus,
} from '@/lib/hellenic-parliament-helpers';

describe('normalizeHellenicParliamentStatus', () => {
  it('maps Greek parliamentary phases into proposal states', () => {
    expect(normalizeHellenicParliamentStatus('Κατατεθέντα')).toBe('consultation');
    expect(normalizeHellenicParliamentStatus('Επεξεργασία στις Επιτροπές')).toBe('committee');
    expect(normalizeHellenicParliamentStatus('1η Ανάγνωση')).toBe('committee');
    expect(normalizeHellenicParliamentStatus('Ολοκλήρωση')).toBe('adopted');
  });
});

describe('buildProposalFromHellenicParliamentEntry', () => {
  it('maps a submitted Greek law proposal from the official list/detail pages', () => {
    const row = buildProposalFromHellenicParliamentEntry({
      lawId: '8c0aad10-ca1a-4f07-b97c-b41900d62149',
      title: 'Θεσμικό Πλαίσιο Αναγνώρισης και Ρύθμισης της Κατ΄ Οίκον Εκπαίδευσης.',
      typeLabel: 'Πρόταση νόμου',
      ministry: 'Παιδείας, Θρησκευμάτων και Αθλητισμού',
      committee: null,
      phaseLabel: 'Κατατεθέντα',
      phaseDate: '26/03/2026',
      detailUrl: 'https://www.hellenicparliament.gr/Nomothetiko-Ergo/Katatethenta-Nomosxedia?law_id=8c0aad10-ca1a-4f07-b97c-b41900d62149',
    }, {
      title: 'Θεσμικό Πλαίσιο Αναγνώρισης και Ρύθμισης της Κατ΄ Οίκον Εκπαίδευσης.',
      typeLabel: 'Πρόταση νόμου',
      ministry: 'Παιδείας, Θρησκευμάτων και Αθλητισμού',
      committee: 'Διαρκής Επιτροπή Μορφωτικών Υποθέσεων',
      phaseLabel: 'Κατατεθέντα',
      phaseDate: '26/03/2026',
      fekNumber: null,
      lawNumber: null,
    });

    expect(row).toMatchObject({
      status: 'consultation',
      submitted_date: '2026-03-26',
      sponsors: [],
      policy_area: 'education',
      source_url: 'https://www.hellenicparliament.gr/Nomothetiko-Ergo/Anazitisi-Nomothetikou-Ergou?law_id=8c0aad10-ca1a-4f07-b97c-b41900d62149',
      data_source: 'hellenic_parliament',
    });
  });

  it('classifies Greek budget legislation and keeps enacted dates', () => {
    const row = buildProposalFromHellenicParliamentEntry({
      lawId: 'budget-law',
      title: 'Κύρωση του Απολογισμού του Κράτους οικονομικού έτους 2024',
      typeLabel: 'Σχέδιο νόμου',
      ministry: 'Εθνικής Οικονομίας και Οικονομικών',
      committee: null,
      phaseLabel: 'Ολοκλήρωση',
      phaseDate: '25/01/2025',
      detailUrl: 'https://www.hellenicparliament.gr/en/Nomothetiko-Ergo/Psifisthenta-Nomoschedia?law_id=budget-law',
    }, {
      title: 'Κύρωση του Απολογισμού του Κράτους οικονομικού έτους 2024',
      typeLabel: 'Σχέδιο νόμου',
      ministry: 'Εθνικής Οικονομίας και Οικονομικών',
      committee: 'Διαρκής Επιτροπή Οικονομικών Υποθέσεων',
      phaseLabel: 'Ολοκλήρωση',
      phaseDate: '25/01/2025',
      fekNumber: "10 Α'/25.01.2025",
      lawNumber: '5000',
    });

    expect(row).toMatchObject({
      status: 'adopted',
      proposal_type: 'budget',
      vote_date: '2025-01-25',
      submitted_date: '2025-01-25',
      sponsors: ['Εθνικής Οικονομίας και Οικονομικών'],
      policy_area: 'finance',
    });
  });
});
