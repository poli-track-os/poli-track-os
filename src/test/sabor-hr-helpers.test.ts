import { describe, expect, it } from 'vitest';
import { buildProposalFromSaborHrEntry, buildSaborHrSourceUrl, normalizeSaborHrStatus } from '@/lib/sabor-hr-helpers';

describe('normalizeSaborHrStatus', () => {
  it('maps Croatian parliamentary statuses conservatively', () => {
    expect(normalizeSaborHrStatus('zaključena rasprava')).toBe('parliamentary_deliberation');
    expect(normalizeSaborHrStatus('u proceduri')).toBe('parliamentary_deliberation');
    expect(normalizeSaborHrStatus('donesen')).toBe('adopted');
    expect(normalizeSaborHrStatus('odbijen')).toBe('rejected');
    expect(normalizeSaborHrStatus('povučen')).toBe('withdrawn');
  });
});

describe('buildProposalFromSaborHrEntry', () => {
  it('maps a Croatian law proposal from official list/detail fields', () => {
    const row = buildProposalFromSaborHrEntry({
      proposalCode: 'PZE 285',
      title: 'Prijedlog zakona o zaštiti osoba uključenih u javno djelovanje',
      legislature: 'XI',
      session: '10',
      readingLabel: '1.',
      sponsor: 'Vlada RH',
      statusLabel: 'zaključena rasprava',
      detailUrl: 'https://edoc.sabor.hr/Views/AktView.aspx?type=HTML&id=2031316',
    }, {
      proposalNumber: '285',
      euAligned: 'Da',
      procedureType: 'redovni',
      policyArea: 'Zaštita imovine i osoba',
      globalStatus: 'zaključena rasprava',
      readings: ['1. čitanje'],
      sponsor: 'Vlada RH',
      committees: ['Odbor za zakonodavstvo'],
      signature: 'XI-813/2026',
      readingStatus: 'zaključena rasprava',
    });

    expect(row).toMatchObject({
      status: 'parliamentary_deliberation',
      proposal_type: 'bill',
      submitted_date: '2026-01-01',
      sponsors: ['Vlada RH'],
      source_url: buildSaborHrSourceUrl('https://edoc.sabor.hr/Views/AktView.aspx?type=HTML&id=2031316'),
      data_source: 'sabor_hr',
    });
  });

  it('classifies Croatian budget proposals', () => {
    const row = buildProposalFromSaborHrEntry({
      proposalCode: 'PZ 44',
      title: 'Konačni prijedlog državnog proračuna Republike Hrvatske za 2024. godinu',
      legislature: 'X',
      session: '4',
      readingLabel: '2.',
      sponsor: 'Vlada RH',
      statusLabel: 'donesen',
      detailUrl: 'https://edoc.sabor.hr/Views/AktView.aspx?type=HTML&id=2000000',
    }, {
      proposalNumber: '44',
      euAligned: 'Ne',
      procedureType: 'hitni',
      policyArea: 'Državni proračun',
      globalStatus: 'donesen',
      readings: ['1. čitanje', '2. čitanje'],
      sponsor: 'Vlada RH',
      committees: [],
      signature: 'X-99/2023',
      readingStatus: 'donesen',
    });

    expect(row).toMatchObject({
      proposal_type: 'budget',
      status: 'adopted',
      policy_area: 'finance',
      submitted_date: '2023-01-01',
    });
  });
});
