import { describe, expect, it } from 'vitest';
import {
  parseCuratedInfluenceMedia,
  parseEuTransparency,
  parseOpenCorporates,
  parseOpenSanctions,
  parsePublicAffiliations,
  parseUsFara,
  parseUsLda,
} from '@/lib/influence-ingest';

describe('influence ingesters', () => {
  it('projects US LDA rows into filings, clients, and money', () => {
    const bundle = parseUsLda([
      'filing_uuid,registrant_name,client_name,client_country,amount,year,quarter,issue_area,target_institution,source_url',
      'lda-1,Acme Lobbying,Example Energy,US,"$120,000",2025,1,Energy;Trade,Congress,https://lda.senate.gov/filing/lda-1',
    ].join('\n'));

    expect(bundle.clients).toHaveLength(1);
    expect(bundle.filings).toHaveLength(1);
    expect(bundle.money[0]).toMatchObject({ amount_exact: 120000, data_source: 'us_lda' });
    expect(bundle.filings[0].issue_areas).toEqual(['Energy', 'Trade']);
  });

  it('projects FARA rows into foreign-principal filings and contacts', () => {
    const bundle = parseUsFara([
      'registration_number,registrant_name,foreign_principal,foreign_principal_country,payment_amount,contact_name,target_institution,activity_date,activity,source_url',
      'fara-7,Global Advisors,Example Embassy,CN,50000,Jane Official,State Department,2025-02-10,Briefing,https://efile.fara.gov/docs/fara-7',
    ].join('\n'));

    expect(bundle.clients[0]).toMatchObject({ name: 'Example Embassy', is_foreign_principal: true, principal_country_code: 'CN' });
    expect(bundle.contacts[0]).toMatchObject({ target_name: 'Jane Official', target_institution: 'State Department' });
    expect(bundle.money[0].money_type).toBe('payment');
  });

  it('projects EU transparency rows into spend and meeting contacts', () => {
    const bundle = parseEuTransparency([
      'transparency_id,name,country_code,category,year,declared_amount_eur_low,declared_amount_eur_high,target_name,target_institution,meeting_date,subject',
      'eu-1,Example Association,BE,Trade,2024,10000,19999,Commissioner Example,European Commission,2024-06-01,Digital Markets',
    ].join('\n'));

    expect(bundle.actors[0]).toMatchObject({ external_id: 'eu-1', data_source: 'eu_transparency_register' });
    expect(bundle.money[0]).toMatchObject({ currency: 'EUR', amount_low: 10000, amount_high: 19999 });
    expect(bundle.contacts[0].subject).toBe('Digital Markets');
  });

  it('projects OpenCorporates companies and officers', () => {
    const bundle = parseOpenCorporates(JSON.stringify([
      {
        company: {
          name: 'Example Holdings Ltd',
          jurisdiction_code: 'gb',
          company_number: '123',
          current_status: 'Active',
          officers: [{ id: 'officer-1', name: 'Alex Director', position: 'Director' }],
        },
      },
    ]));

    expect(bundle.companies[0]).toMatchObject({ name: 'Example Holdings Ltd', registry: 'opencorporates' });
    expect(bundle.actors[0]).toMatchObject({ name: 'Alex Director', actor_kind: 'person' });
    expect(bundle.officers[0].role).toBe('Director');
  });

  it('projects OpenSanctions entities as PEP/state-linked influence actors', () => {
    const bundle = parseOpenSanctions('{"id":"Q1","caption":"Example PEP","schema":"Person","properties":{"country":["RU"]},"datasets":["peps"]}\n');

    expect(bundle.actors[0]).toMatchObject({
      name: 'Example PEP',
      country_code: 'RU',
      is_pep: true,
      data_source: 'opensanctions',
    });
  });

  it('keeps public affiliation claims private unless explicitly reviewed and visible', () => {
    const pending = parsePublicAffiliations([
      'subject_external_id,subject_name,affiliation_type,label,source_url',
      'person-1,Example Person,religion,Example Faith,https://example.test/bio',
    ].join('\n'));
    const approved = parsePublicAffiliations([
      'subject_external_id,subject_name,affiliation_type,label,source_url,review_status,visible',
      'person-1,Example Person,sect,Example Denomination,https://example.test/bio,approved,true',
    ].join('\n'));

    expect(pending.affiliations[0]).toMatchObject({ review_status: 'pending', visible: false });
    expect(approved.affiliations[0]).toMatchObject({ review_status: 'approved', visible: true });
    expect(approved.actors[0]).toMatchObject({ external_id: 'person-1', actor_kind: 'person' });
  });

  it('projects curated media claims without broad web crawling', () => {
    const bundle = parseCuratedInfluenceMedia([
      'claim_id,client_name,principal_country_code,target_name,target_institution,amount,currency,topic,source_url',
      'media-1,Example Strategic Comms,AE,Official Example,Parliament,250000,USD,defense,https://news.example/investigation',
    ].join('\n'));

    expect(bundle.clients[0]).toMatchObject({ name: 'Example Strategic Comms', principal_country_code: 'AE' });
    expect(bundle.contacts[0]).toMatchObject({ target_name: 'Official Example', target_institution: 'Parliament' });
    expect(bundle.money[0]).toMatchObject({ amount_exact: 250000, money_type: 'contract' });
  });
});
