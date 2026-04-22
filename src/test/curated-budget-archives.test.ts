import { describe, expect, it } from 'vitest';
import {
  CURATED_BUDGET_ARCHIVES,
  buildProposalFromCuratedBudgetArchive,
} from '@/lib/curated-budget-archives';

describe('buildProposalFromCuratedBudgetArchive', () => {
  it('maps curated budget archive rows into finance proposals', () => {
    const row = buildProposalFromCuratedBudgetArchive(
      CURATED_BUDGET_ARCHIVES.find((entry) => entry.countryCode === 'HU' && entry.submittedDate === '2025-05-06')!,
    );

    expect(row).toMatchObject({
      country_code: 'HU',
      proposal_type: 'budget',
      status: 'adopted',
      submitted_date: '2025-05-06',
      data_source: 'hungary_budget_archive',
      policy_area: 'finance',
    });
  });

  it('keeps Cyprus budget-law deposit pages as consultation records', () => {
    const row = buildProposalFromCuratedBudgetArchive(
      CURATED_BUDGET_ARCHIVES.find((entry) => entry.countryCode === 'CY' && entry.submittedDate === '2025-10-02')!,
    );

    expect(row).toMatchObject({
      country_code: 'CY',
      status: 'consultation',
      proposal_type: 'budget',
      submitted_date: '2025-10-02',
      data_source: 'cyprus_budget_archive',
    });
  });
});
