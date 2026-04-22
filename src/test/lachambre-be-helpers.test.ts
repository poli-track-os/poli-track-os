import { describe, expect, it } from 'vitest';
import { buildProposalFromLaChambreDossier } from '@/lib/lachambre-be-helpers';

describe('buildProposalFromLaChambreDossier', () => {
  it('maps a pending Belgian proposal from Chamber XML', () => {
    const row = buildProposalFromLaChambreDossier({
      TITLE: {
        TITLE_LONG: {
          TITLE_LONG_textF: 'Proposition de loi visant à préserver l’intégrité physique.',
          TITLE_LONG_textN: 'Wetsvoorstel tot vrijwaring van de fysieke integriteit.',
        },
      },
      SITU: {
        SITUK_textF: 'PENDANT CHAMBRE',
        SITUK_textN: 'HANGEND KAMER',
      },
      BICAM: {
        MAINDOC: {
          DEPOTDAT: '20240725',
          AUTEURM: [
            {
              AUTEURM_FORNAAM: 'Sarah',
              AUTEURM_FAMNAAM: 'Schlitz',
              AUTEURM_PARTY: 'Ecolo-Groen',
            },
          ],
        },
      },
    }, 'https://www.lachambre.be/FLWB/xml/56/56K0077.xml');

    expect(row).toMatchObject({
      status: 'parliamentary_deliberation',
      submitted_date: '2024-07-25',
      sponsors: ['Sarah Schlitz (Ecolo-Groen)'],
      source_url: 'https://www.lachambre.be/FLWB/xml/56/56K0077.xml',
      data_source: 'lachambre_be',
    });
  });

  it('maps a withdrawn Belgian proposal', () => {
    const row = buildProposalFromLaChambreDossier({
      TITLE: {
        TITLE_LONG: {
          TITLE_LONG_textN: 'Wetsvoorstel houdende diverse bepalingen',
        },
      },
      SITU: {
        SITUK_textF: 'RETIRE',
        SITUK_textN: 'INGETROKKEN',
      },
      BICAM: {
        MAINDOC: {
          DEPOTDAT: '20200110',
          ENVOI: '20200305',
        },
      },
    }, 'https://www.lachambre.be/FLWB/xml/55/55K0001.xml');

    expect(row).toMatchObject({
      status: 'withdrawn',
      submitted_date: '2020-01-10',
      vote_date: '2020-03-05',
    });
  });
});
