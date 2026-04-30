import { describe, expect, it } from 'vitest';
import { parseMepFinancialDisclosureText } from '@/lib/mep-financial-disclosure-parser';

describe('MEP financial disclosure parser', () => {
  it('extracts current side income from section B and declaration date', () => {
    const parsed = parseMepFinancialDisclosureText(`
(A) Past activity
Occupation or Membership Generated income or other benefits
1. Former role 22300 EUR Monthly

(B) Outside activities
Field and nature of the activity, including name of the entity Generated income or other benefits
1. University teaching 6000 EUR Annual
2. Board advisory work 1500 EUR Quarterly

(C) Membership

(D) Holding

date: 25/06/2024
`);

    expect(parsed.declarationDate).toBe('2024-06-25');
    expect(parsed.sideIncomeEntries).toHaveLength(2);
    expect(parsed.sideIncomeByCurrency.EUR).toBe(7500);
    expect(parsed.entries.find((entry) => entry.description === 'Former role')?.section).toBe('A');
  });

  it('extracts holdings from section D without treating them as asset values', () => {
    const parsed = parseMepFinancialDisclosureText(`
(D) "Pursuant to Article 4(2)(d), I declare my holding in any company or partnership:"
Holding or Partnership with potential public policy implications
1. Example Consulting SRL 1000 RON Annual dividend
2. Family farm partnership
3. The company that 1200 EUR Monthly owns my social media platforms (Snepwind Limited).

(E) Support
`);

    expect(parsed.holdings.map((entry) => entry.description)).toEqual([
      'Example Consulting SRL dividend',
      'Family farm partnership',
      'The company that owns my social media platforms (Snepwind Limited).',
    ]);
    expect(parsed.holdings[0].amount).toBe(1000);
    expect(parsed.holdings[0].currency).toBe('RON');
    expect(parsed.sideIncomeByCurrency).toEqual({});
  });
});
