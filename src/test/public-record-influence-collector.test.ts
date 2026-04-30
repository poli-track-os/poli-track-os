import { describe, expect, it } from 'vitest';
import {
  isConservativeFecOrganizationReceipt,
  normalizePublicRecordDate,
  isConservativeFecBulkReceipt,
  parseFecBulkDate,
  parseFecBulkLine,
  parseEgeMembers,
  parsePcastNames,
  parseStrongNames,
  selectLatestSecCompanyFacts,
  summarizeFoiaAnnualReportXml,
  yearFromPublicRecordDate,
} from '../lib/public-record-influence-parser';

describe('public-record influence collector parsers', () => {
  it('extracts PCAST appointment names from the White House paragraph shape', () => {
    const html = `
      <p>The following individuals have been appointed:</p>
      <p>Marc Andreessen<br>Sergey Brin<br>Safra Catz<br>Lisa Su<br>Mark Zuckerberg</p>
    `;

    const names = parsePcastNames(html);

    expect(names).toContain('Marc Andreessen');
    expect(names).toContain('Sergey Brin');
    expect(names).toContain('Lisa Su');
    expect(names).not.toContain('The following individuals have been appointed:');
  });

  it('extracts EU Chief Scientific Advisor names from strong-tag appointment records', () => {
    const html = `
      <p><strong>Dimitra Simeonidou</strong> joins <strong>Rémy Slama</strong>
      and <strong>Naomi Ellemers</strong> with <strong>Mangala Srinivas</strong>
      and <strong>Adam Izdebski</strong>.</p>
    `;

    expect(parseStrongNames(html, [])).toEqual([
      'Dimitra Simeonidou',
      'Rémy Slama',
      'Naomi Ellemers',
      'Mangala Srinivas',
      'Adam Izdebski',
    ]);
  });

  it('extracts EGE member names, role labels, and descriptions from list cards', () => {
    const html = `
      <div class="ecl-list-illustration__title">Barbara Prainsack</div>
      <div class="ecl-list-illustration__description"><div class="ecl">
        <p><strong>Chair</strong></p><p>Professor at the University of Vienna.</p>
      </div></div>
      <div class="ecl-list-illustration__title">Maria do Céu Patrão Neves</div>
      <div class="ecl-list-illustration__description"><div class="ecl">
        <p><strong>Vice-Chair</strong></p><p>Professor of Ethics.</p>
      </div></div>
    `;

    expect(parseEgeMembers(html)).toEqual([
      expect.objectContaining({ name: 'Barbara Prainsack', role: 'Chair' }),
      expect.objectContaining({ name: 'Maria do Céu Patrão Neves', role: 'Vice-Chair' }),
    ]);
  });

  it('filters FEC itemized receipts to conservative non-individual organisation records', () => {
    expect(isConservativeFecOrganizationReceipt({
      entity_type: 'ORG',
      contributor_name: 'ACME CORP',
      contribution_receipt_amount: 25000,
    })).toBe(true);
    expect(isConservativeFecOrganizationReceipt({
      entity_type: 'IND',
      contributor_name: 'Private Person',
      contribution_receipt_amount: 25000,
    })).toBe(false);
    expect(isConservativeFecOrganizationReceipt({
      entity_type: 'CAN',
      contributor_name: 'Candidate Name',
      contribution_receipt_amount: 25000,
    })).toBe(false);
  });

  it('selects latest annual SEC company facts from XBRL companyfacts payloads', () => {
    const facts = selectLatestSecCompanyFacts({
      facts: {
        'us-gaap': {
          Revenues: {
            units: {
              USD: [
                { form: '10-Q', fy: 2026, fp: 'Q1', filed: '2026-04-20', end: '2026-03-31', val: 100 },
                { form: '10-K', fy: 2025, fp: 'FY', filed: '2026-02-10', end: '2025-12-31', val: 1000 },
              ],
            },
          },
          NetIncomeLoss: {
            units: {
              USD: [
                { form: '10-K', fy: 2025, fp: 'FY', filed: '2026-02-10', end: '2025-12-31', val: 125 },
              ],
            },
          },
        },
      },
    }, 5);

    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ fact_key: 'Revenues', value: 1000, fiscal_period: 'FY' }),
      expect.objectContaining({ fact_key: 'NetIncomeLoss', value: 125 }),
    ]));
  });

  it('summarizes FOIA annual report XML without exposing request-level records', () => {
    const summary = summarizeFoiaAnnualReportXml(`
      <iepd:FoiaAnnualReport xmlns:iepd="x" xmlns:foia="y" xmlns:nc="z">
        <nc:DocumentCreationDate><nc:Date>2025-03-10</nc:Date></nc:DocumentCreationDate>
        <nc:Organization><nc:OrganizationName>Department of Justice</nc:OrganizationName></nc:Organization>
        <foia:DocumentFiscalYearDate>2024</foia:DocumentFiscalYearDate>
        <foia:ProcessingStatisticsReceivedQuantity>20</foia:ProcessingStatisticsReceivedQuantity>
        <foia:ProcessingStatisticsReceivedQuantity>120</foia:ProcessingStatisticsReceivedQuantity>
        <foia:ProcessingStatisticsProcessedQuantity>100</foia:ProcessingStatisticsProcessedQuantity>
        <foia:BacklogCurrentYearQuantity>7</foia:BacklogCurrentYearQuantity>
        <foia:TotalCostAmount>12345.67</foia:TotalCostAmount>
      </iepd:FoiaAnnualReport>
    `);

    expect(summary).toEqual(expect.objectContaining({
      agency_name: 'Department of Justice',
      fiscal_year: 2024,
      request_received_current_year: 120,
      request_processed_current_year: 100,
      backlog_current_year: 7,
      total_cost_amount: 12345.67,
    }));
  });

  it('normalizes public-record date formats before database writes', () => {
    expect(normalizePublicRecordDate('28/10/2021')).toBe('2021-10-28');
    expect(normalizePublicRecordDate('2026-04-07')).toBe('2026-04-07');
    expect(normalizePublicRecordDate('not a date')).toBeNull();
    expect(yearFromPublicRecordDate('28/10/2021')).toBe(2021);
  });

  it('parses conservative FEC bulk receipt rows without individual donors', () => {
    const row = parseFecBulkLine('C00000001|N|M2|P|123|15|ORG|ACME PAC|NEW YORK|NY|10001|||01312026|5000||T1|1|||999');
    expect(row).toEqual(expect.objectContaining({
      CMTE_ID: 'C00000001',
      ENTITY_TP: 'ORG',
      NAME: 'ACME PAC',
      TRANSACTION_AMT: '5000',
    }));
    expect(parseFecBulkDate(row.TRANSACTION_DT)).toBe('2026-01-31');
    expect(isConservativeFecBulkReceipt(row)).toBe(true);
    expect(isConservativeFecBulkReceipt({ ...row, ENTITY_TP: 'IND' })).toBe(false);
  });
});
