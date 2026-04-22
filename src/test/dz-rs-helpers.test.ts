import { describe, expect, it } from 'vitest';
import { buildDzRsSourceUrl, buildProposalFromDzRsRecord } from '@/lib/dz-rs-helpers';

describe('buildProposalFromDzRsRecord', () => {
  it('maps an in-process Slovenian bill from the current bulk feed', () => {
    const row = buildProposalFromDzRsRecord({
      KARTICA_PREDPISA: {
        UNID: 'PZ|F099DF1AA02565EEC1258DD5004AE51B',
        KARTICA_MANDAT: '10',
        KARTICA_NAZIV: 'Zakon o spremembah in dopolnitvah Zakona o Državnem svetu',
        KARTICA_DATUM: '2026-04-10',
        KARTICA_PREDLAGATELJ: 'Skupina poslank in poslancev (prvopodpisana Janja Sluga)',
        KARTICA_POSTOPEK: 'skrajšani',
        KARTICA_FAZA_POSTOPKA: 'obravnava postopka - skrajšani postopek',
        KARTICA_KLJUCNE_BESEDE: 'državni svet',
      },
    });

    expect(row).toMatchObject({
      status: 'parliamentary_deliberation',
      submitted_date: '2026-04-10',
      sponsors: ['Skupina poslank in poslancev (prvopodpisana Janja Sluga)'],
      source_url: buildDzRsSourceUrl('PZ|F099DF1AA02565EEC1258DD5004AE51B', '10'),
      data_source: 'dz_rs',
    });
  });

  it('maps an adopted Slovenian bill from a historical mandate file', () => {
    const row = buildProposalFromDzRsRecord({
      KARTICA_PREDPISA: {
        UNID: 'PZ2|C12563A400339077C125640300330667',
        KARTICA_MANDAT: '2',
        KARTICA_KONEC_POSTOPKA: '1',
        KARTICA_NAZIV: 'Zakon o spremembah zakona o osnovni šoli',
        KARTICA_DATUM: '1996-12-13',
        KARTICA_PREDLAGATELJ: 'skupina poslancev (Gaber dr. Slavko)',
        KARTICA_FAZA_POSTOPKA: 'sprejet predlog',
        KARTICA_KLJUCNE_BESEDE: 'osnovnošolsko izobraževanje',
      },
    });

    expect(row).toMatchObject({
      status: 'adopted',
      submitted_date: '1996-12-13',
      source_url: buildDzRsSourceUrl('PZ2|C12563A400339077C125640300330667', '2'),
    });
  });
});
