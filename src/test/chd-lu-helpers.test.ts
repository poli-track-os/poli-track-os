import { describe, expect, it } from 'vitest';
import { buildChdLuSourceUrl, buildProposalFromChdLuRow } from '@/lib/chd-lu-helpers';

describe('buildProposalFromChdLuRow', () => {
  it('maps a withdrawn Luxembourg proposition de loi', () => {
    const row = buildProposalFromChdLuRow({
      LAW_NUMBER: '1129',
      LAW_TYPE: 'PropositionDeLoi',
      LAW_DEPOSIT_DATE: '01/06/1965',
      LAW_EVACUATION_DATE: '30/11/1999',
      LAW_STATUS: 'Retire',
      LAW_TITLE: "Proposition de loi portant modification de l'art. 6 du code civil",
      LAW_CONTENT: 'Document de dépôt',
      LAW_AUTHORS: 'Monsieur Robert Krieps, Député',
    });

    expect(row).toMatchObject({
      status: 'withdrawn',
      submitted_date: '1965-06-01',
      vote_date: '1999-11-30',
      sponsors: ['Monsieur Robert Krieps, Député'],
      source_url: buildChdLuSourceUrl('1129'),
      data_source: 'chd_lu',
    });
  });

  it('maps an adopted Luxembourg projet de loi', () => {
    const row = buildProposalFromChdLuRow({
      LAW_NUMBER: '9999',
      LAW_TYPE: 'ProjetDeLoi',
      LAW_DEPOSIT_DATE: '05/03/2020',
      LAW_EVACUATION_DATE: '15/04/2021',
      LAW_STATUS: 'Publie',
      LAW_TITLE: 'Projet de loi relatif au budget de l’État',
      LAW_CONTENT: 'Texte du projet et exposé des motifs',
      LAW_AUTHORS: 'Monsieur le Ministre des Finances',
    });

    expect(row).toMatchObject({
      status: 'adopted',
      proposal_type: 'bill',
      submitted_date: '2020-03-05',
      vote_date: '2021-04-15',
      policy_area: 'finance',
      source_url: buildChdLuSourceUrl('9999'),
    });
  });
});
