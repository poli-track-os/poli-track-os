import { describe, expect, it } from 'vitest';
import { buildProposalFromSaeimaLvRow, normalizeSaeimaLvStatus } from '@/lib/saeima-lv-helpers';

describe('normalizeSaeimaLvStatus', () => {
  it('maps Latvian status labels into proposal states', () => {
    expect(normalizeSaeimaLvStatus('Izsludināts')).toBe('adopted');
    expect(normalizeSaeimaLvStatus('Nodošana komisijām')).toBe('committee');
    expect(normalizeSaeimaLvStatus('2.lasījums')).toBe('parliamentary_deliberation');
    expect(normalizeSaeimaLvStatus('Noraidīts')).toBe('rejected');
  });
});

describe('buildProposalFromSaeimaLvRow', () => {
  it('maps a Latvian government bill from the official registry', () => {
    const row = buildProposalFromSaeimaLvRow({
      term: '14',
      reference: '8/Lp14',
      title: 'Grozījums Kredītiestāžu likumā',
      statusLabel: 'Nodošana komisijām',
      unid: '437056E82681FC86C22588FD00384D3C',
    }, {
      submittedDate: '2022-11-17',
      lastActionDate: '2022-11-23',
      sponsors: ['Ministru kabinets'],
      responsibleCommittee: 'Budžeta un finanšu (nodokļu) komisija',
    });

    expect(row).toMatchObject({
      status: 'committee',
      sponsors: ['Ministru kabinets'],
      submitted_date: '2022-11-17',
      policy_area: 'finance',
      data_source: 'saeima_lv',
    });
  });

  it('classifies budget proposals from title keywords', () => {
    const row = buildProposalFromSaeimaLvRow({
      term: '13',
      reference: '100/Lp13',
      title: 'Par valsts budžetu 2021. gadam',
      statusLabel: 'Izsludināts',
      unid: 'ABCDEF123456',
    }, {
      submittedDate: '2020-10-15',
      lastActionDate: '2020-12-28',
      sponsors: ['Ministru kabinets'],
      responsibleCommittee: 'Budžeta un finanšu (nodokļu) komisija',
    });

    expect(row).toMatchObject({
      proposal_type: 'budget',
      status: 'adopted',
      vote_date: '2020-12-28',
    });
  });
});
