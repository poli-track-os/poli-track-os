import { describe, expect, it } from 'vitest';
import { buildFolketingProposalSourceUrl, buildProposalFromFolketingSag } from '@/lib/folketinget-helpers';

describe('buildProposalFromFolketingSag', () => {
  it('maps an adopted budget bill into a proposal row', () => {
    const row = buildProposalFromFolketingSag(
      {
        id: 103080,
        titel: 'Forslag til finanslov for finansaaret 2026.',
        titelkort: 'Om finanslov for finansaaret 2026.',
        resume: 'Finanslovsforslaget fastlaegger de samlede statslige udgifter og indtaegter.',
        statsbudgetsag: true,
        lovnummer: 'B 2',
        afstemningskonklusion: 'Forslaget er vedtaget.',
      },
      {
        statusLabel: 'Vedtaget',
        sponsors: ['Nicolai Wammen'],
        submittedDate: '2025-10-07',
      },
    );

    expect(row).toMatchObject({
      title: 'Om finanslov for finansaaret 2026.',
      official_title: 'Forslag til finanslov for finansaaret 2026.',
      status: 'adopted',
      proposal_type: 'bill',
      country_code: 'DK',
      submitted_date: '2025-10-07',
      sponsors: ['Nicolai Wammen'],
      policy_area: 'finance',
      data_source: 'folketinget',
      source_url: buildFolketingProposalSourceUrl(103080),
    });
  });

  it('maps a withdrawn non-budget bill and deduplicates sponsors', () => {
    const row = buildProposalFromFolketingSag(
      {
        id: 74278,
        titel: 'Forslag til lov om aendring af udlaendingeloven.',
        titelkort: 'Om aendring af udlaendingeloven.',
        resume: null,
        statsbudgetsag: false,
        opdateringsdato: '2025-02-01T08:00:00',
      },
      {
        statusLabel: 'Tilbagetaget',
        sponsors: ['Pia Olsen Dyhr', 'Pia Olsen Dyhr', 'Carolina Magdalene Maier'],
      },
    );

    expect(row).toMatchObject({
      status: 'withdrawn',
      submitted_date: '2025-02-01',
      sponsors: ['Pia Olsen Dyhr', 'Carolina Magdalene Maier'],
      policy_area: 'migration',
      source_url: buildFolketingProposalSourceUrl(74278),
    });
    expect(row?.summary).toBe('Forslag til lov om aendring af udlaendingeloven.');
  });
});
