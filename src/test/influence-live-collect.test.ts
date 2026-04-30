import { describe, expect, it } from 'vitest';
import { flattenLdaFiling, keepOpenSanctionsRow } from '../../scripts/collect-live-influence';

describe('live influence collection helpers', () => {
  it('flattens nested LDA API filings into the normalized ingester shape', () => {
    const row = flattenLdaFiling({
      filing_uuid: 'lda-live-1',
      filing_year: 2026,
      filing_period: 'first_quarter',
      filing_document_url: 'https://lda.senate.gov/filings/public/filing/lda-live-1/print/',
      income: 120000,
      registrant: { id: 10, name: 'Example Lobbying LLC' },
      client: { id: 20, name: 'Example Foreign Company', country: 'AE' },
      foreign_entities: [{ country: 'AE' }],
      lobbying_activities: [
        {
          general_issue_code: 'TRD',
          general_issue_code_display: 'Trade',
          description: 'Trade and technology policy',
          government_entities: [{ name: 'U.S. House of Representatives' }, { name: 'Department of Commerce' }],
        },
      ],
    });

    expect(row).toMatchObject({
      filing_uuid: 'lda-live-1',
      registrant_name: 'Example Lobbying LLC',
      client_name: 'Example Foreign Company',
      principal_country_code: 'AE',
      amount: 120000,
      year: 2026,
      quarter: 1,
    });
    expect(row.issue_area).toContain('Trade');
    expect(row.target_institution).toContain('Department of Commerce');
  });

  it('keeps OpenSanctions rows only when target-country records are influence relevant', () => {
    expect(keepOpenSanctionsRow({
      schema: 'Person',
      datasets: ['wd_peps'],
      properties: { country: ['RU'], topics: ['role.pep'] },
    })).toBe(true);
    expect(keepOpenSanctionsRow({
      schema: 'Person',
      datasets: ['interpol_red_notices'],
      properties: { country: ['RU'], topics: ['wanted'] },
    })).toBe(false);
  });
});
