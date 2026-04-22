import { describe, expect, it } from 'vitest';
import {
  buildCameraActSourceUrl,
  buildProposalFromCameraActRow,
  normalizeCameraActStatus,
} from '@/lib/camera-helpers';

describe('normalizeCameraActStatus', () => {
  it('maps official Camera state labels into proposal states', () => {
    expect(normalizeCameraActStatus(['In corso di esame in Commissione'], null)).toBe('committee');
    expect(normalizeCameraActStatus(['In discussione'], null)).toBe('parliamentary_deliberation');
    expect(normalizeCameraActStatus(['Respinto in Assemblea'], null)).toBe('rejected');
    expect(normalizeCameraActStatus([], 'Legge 106 del 18 luglio 2025 pubblicata nella Gazzetta Ufficiale')).toBe('adopted');
  });
});

describe('buildProposalFromCameraActRow', () => {
  it('maps an in-progress Camera proposal from official SPARQL data', () => {
    const row = buildProposalFromCameraActRow({
      attoUri: 'http://dati.camera.it/ocd/attocamera.rdf/ac19_1004',
      legislature: '19',
      identifier: '1004',
      title: ' CERRETO ed altri: "Modifiche al codice penale e altre disposizioni in materia di illeciti agro-alimentari" (1004) ',
      initiativeType: 'Parlamentare',
      submittedDate: '20230316',
      description: null,
    }, ['CERRETO Marco', 'TRANCASSINI Paolo'], ['Da assegnare', 'Assegnato', 'In corso di esame in Commissione']);

    expect(row).toMatchObject({
      status: 'committee',
      proposal_type: 'bill',
      submitted_date: '2023-03-16',
      sponsors: ['CERRETO Marco', 'TRANCASSINI Paolo'],
      policy_area: 'agriculture',
      source_url: buildCameraActSourceUrl('19', '1004'),
      data_source: 'camera_atti',
    });
  });

  it('maps adopted Camera laws and keeps the promulgation date', () => {
    const row = buildProposalFromCameraActRow({
      attoUri: 'http://dati.camera.it/ocd/attocamera.rdf/ac19_153',
      legislature: '19',
      identifier: '153',
      title: ' SERRACCHIANI: &quot;Disposizioni concernenti la conservazione del posto di lavoro e i permessi retribuiti per esami e cure mediche in favore dei lavoratori affetti da malattie oncologiche, invalidanti e croniche&quot; (153) ',
      initiativeType: 'Parlamentare',
      submittedDate: '20221013',
      description: 'Legge 106 del 18 luglio 2025 pubblicata nella Gazzetta Ufficiale n. 171 del 25 luglio 2025',
    }, ['SERRACCHIANI Debora'], ['Approvato definitivamente dal Senato. Legge']);

    expect(row).toMatchObject({
      status: 'adopted',
      vote_date: '2025-07-18',
      submitted_date: '2022-10-13',
      sponsors: ['SERRACCHIANI Debora'],
      policy_area: 'health',
    });
  });
});
