import { describe, expect, it } from 'vitest';
import { buildParliamentBgSourceUrl, buildProposalFromParliamentBgRow } from '@/lib/parliament-bg-helpers';

describe('buildProposalFromParliamentBgRow', () => {
  it('maps an in-process Bulgarian bill with named sponsors', () => {
    const row = buildProposalFromParliamentBgRow({
      L_Act_id: 166895,
      L_Act_date: '2026-03-18 00:00:00',
      L_Act_date2: '0001-01-01 00:00:00',
      L_ActL_title: 'Законопроект за допълнение на Закона за предучилищното и училищното образование',
      L_ActL_final: '',
      withdrawn: false,
      imp_list: [
        {
          A_ns_MP_id: 4905,
          A_ns_MPL_Name1: 'ПЕТЪР',
          A_ns_MPL_Name2: 'ВАСИЛЕВ',
          A_ns_MPL_Name3: 'КЬОСЕВ',
        },
      ],
      dist_list: [],
      stan_list: [],
      stan_list2: [],
      activity: [],
    });

    expect(row).toMatchObject({
      status: 'consultation',
      submitted_date: '2026-03-18',
      sponsors: ['ПЕТЪР ВАСИЛЕВ КЬОСЕВ'],
      source_url: buildParliamentBgSourceUrl(166895),
      data_source: 'parliament_bg',
    });
  });

  it('maps an adopted Bulgarian bill from promulgation fields', () => {
    const row = buildProposalFromParliamentBgRow({
      L_Act_id: 165170,
      L_Act_date: '2023-11-06 00:00:00',
      L_Act_date2: '2023-12-07 00:00:00',
      L_Act_dv_iss: '105',
      L_Act_dv_year: 2023,
      L_ActL_title: 'Законопроект за изменение и допълнение на Закона за счетоводството',
      L_ActL_final: 'Закон за изменение и допълнение на Закона за счетоводството',
      withdrawn: false,
      imp_list_min: [{ A_ns_C_id: 6167 }],
      activity: [{ id: 1 }],
    });

    expect(row).toMatchObject({
      status: 'adopted',
      submitted_date: '2023-11-06',
      vote_date: '2023-12-07',
      sponsors: ['A_ns_C_id:6167'],
      source_url: buildParliamentBgSourceUrl(165170),
    });
  });
});
