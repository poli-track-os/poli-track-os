import { describe, expect, it } from 'vitest';
import { buildProposalFromOfficialNotice } from '@/lib/assemblee-helpers';

describe('buildProposalFromOfficialNotice', () => {
  it('maps official Assemblee notice JSON into a proposal row', () => {
    const row = buildProposalFromOfficialNotice(
      {
        uid: 'PIONANR5L17B2659',
        denominationStructurelle: 'Proposition de loi',
        cycleDeVie: {
          chrono: {
            dateDepot: '2026-04-14T00:00:00.000+02:00',
          },
        },
        titres: {
          titrePrincipal: 'proposition de loi visant a instaurer un moratoire de trois ans',
          titrePrincipalCourt: 'Instaurer un moratoire de trois ans',
        },
        auteurs: {
          auteur: {
            acteur: {
              acteurRef: 'PA793664',
            },
          },
        },
        coSignataires: {
          coSignataire: [
            {
              acteur: {
                acteurRef: 'PA610968',
              },
            },
          ],
        },
      },
      'https://www.assemblee-nationale.fr/dyn/17/textes/l17b2659_proposition-loi',
    );

    expect(row).toMatchObject({
      title: 'Instaurer un moratoire de trois ans',
      official_title: 'proposition de loi visant a instaurer un moratoire de trois ans',
      proposal_type: 'bill',
      country_code: 'FR',
      submitted_date: '2026-04-14',
      sponsors: ['PA793664', 'PA610968'],
      source_url: 'https://www.assemblee-nationale.fr/dyn/17/textes/l17b2659_proposition-loi',
      data_source: 'assemblee_nationale',
    });
  });
});
