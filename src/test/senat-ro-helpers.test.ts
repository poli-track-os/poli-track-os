import { describe, expect, it } from 'vitest';
import { buildProposalFromSenatRoEntry, normalizeSenatRoStatus } from '@/lib/senat-ro-helpers';

describe('normalizeSenatRoStatus', () => {
  it('maps Romanian Senate statuses conservatively', () => {
    expect(normalizeSenatRoStatus('în lucru, la comisii')).toBe('committee');
    expect(normalizeSenatRoStatus('înregistrat la Senat pt. dezbatere')).toBe('parliamentary_deliberation');
    expect(normalizeSenatRoStatus('promulgate')).toBe('adopted');
    expect(normalizeSenatRoStatus('Retras de către iniţiator')).toBe('withdrawn');
  });
});

describe('buildProposalFromSenatRoEntry', () => {
  it('maps a Romanian proposal from official search/detail fields', () => {
    const row = buildProposalFromSenatRoEntry({
      number: 'B171',
      year: '2026',
      title: 'Propunere legislativă pentru modificarea Ordonanței de urgență a Guvernului nr.33/2007',
      initiators: ['Burduja Sebastian-Ioan - deputat PNL', 'Constantinescu Sergiu-Mircea - deputat PSD'],
      statusLabel: 'înregistrat la Senat pt. dezbatere',
    }, {
      firstChamber: 'Senat',
      initiativeType: 'Propunere legislativă',
      initiators: ['Burduja Sebastian-Ioan - deputat PNL', 'Constantinescu Sergiu-Mircea - deputat PSD'],
      statusLabel: 'înregistrat la Senat pt. dezbatere',
      lawCharacter: '-',
      adoptionDeadline: null,
      procedureDates: ['23-03-2026'],
    });

    expect(row).toMatchObject({
      status: 'parliamentary_deliberation',
      submitted_date: '2026-03-23',
      sponsors: ['Burduja Sebastian-Ioan - deputat PNL', 'Constantinescu Sergiu-Mircea - deputat PSD'],
      data_source: 'senat_ro',
      source_url: 'https://www.senat.ro/Legis/Lista.aspx?nr_cls=B171&an_cls=2026',
    });
  });

  it('classifies Romanian budget laws', () => {
    const row = buildProposalFromSenatRoEntry({
      number: 'B100',
      year: '2024',
      title: 'Proiect de lege a bugetului de stat pe anul 2024',
      initiators: ['Guvernul'],
      statusLabel: 'promulgate',
    }, {
      firstChamber: 'Camera Deputaților',
      initiativeType: 'Proiect de lege',
      initiators: ['Guvernul'],
      statusLabel: 'promulgate',
      lawCharacter: 'Ordinară',
      adoptionDeadline: '15-12-2024',
      procedureDates: ['01-11-2024', '20-12-2024'],
    });

    expect(row).toMatchObject({
      proposal_type: 'budget',
      status: 'adopted',
      vote_date: '2024-12-20',
      policy_area: 'finance',
    });
  });

  it('falls back to the proposal year when the official detail page is broken', () => {
    const row = buildProposalFromSenatRoEntry({
      number: 'BP126',
      year: '2004',
      title: 'Propunere legislativă privind asociaţiile pensionarilor',
      initiators: ['Smaranda Dobrescu PSD', 'Dumitru Buzatu PSD'],
      statusLabel: 'Retras de către iniţiator',
    }, {
      firstChamber: null,
      initiativeType: null,
      initiators: ['Smaranda Dobrescu PSD', 'Dumitru Buzatu PSD'],
      statusLabel: 'Retras de către iniţiator',
      lawCharacter: null,
      adoptionDeadline: null,
      procedureDates: [],
    });

    expect(row).toMatchObject({
      status: 'withdrawn',
      submitted_date: '2004-01-01',
      vote_date: null,
      source_url: 'https://www.senat.ro/Legis/Lista.aspx?nr_cls=BP126&an_cls=2004',
    });
  });
});
