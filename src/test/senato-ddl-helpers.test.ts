import { describe, expect, it } from 'vitest';
import { buildProposalFromSenatoDdlRow, normalizeSenatoDdlStatus } from '@/lib/senato-ddl-helpers';

describe('normalizeSenatoDdlStatus', () => {
  it('maps the official Italian chamber statuses conservatively', () => {
    expect(normalizeSenatoDdlStatus("da assegn. a commis.")).toBe('committee');
    expect(normalizeSenatoDdlStatus("all'esame assemblea")).toBe('parliamentary_deliberation');
    expect(normalizeSenatoDdlStatus('approvato definitivamente. Legge')).toBe('adopted');
    expect(normalizeSenatoDdlStatus('respinto')).toBe('rejected');
  });
});

describe('buildProposalFromSenatoDdlRow', () => {
  it('maps a regular Italian bill and strips presenter honorifics', () => {
    const row = buildProposalFromSenatoDdlRow({
      idFase: '60064',
      legislatura: '19',
      ramo: 'C',
      numeroFase: '2880',
      titolo: 'Disposizioni in materia di organizzazione e funzionamento della Commissione centrale per gli esercenti le professioni sanitarie',
      natura: 'ordinaria',
      stato: 'da assegn. a commis.',
      dataStato: '2026-04-15',
      dataPresentazione: '2026-04-15',
    }, ['On. Maria Rossi', 'On. Maria Rossi', 'Governo']);

    expect(row).toMatchObject({
      status: 'committee',
      proposal_type: 'bill',
      submitted_date: '2026-04-15',
      sponsors: ['Maria Rossi', 'Governo'],
      data_source: 'senato_ddl',
    });
  });

  it('classifies budget laws from title keywords', () => {
    const row = buildProposalFromSenatoDdlRow({
      idFase: '50001',
      legislatura: '18',
      ramo: 'S',
      numeroFase: '1200',
      titolo: 'Bilancio di previsione dello Stato per l anno finanziario 2025 e bilancio pluriennale per il triennio 2025-2027',
      natura: 'ordinaria',
      stato: 'approvato definitivamente. Legge',
      dataStato: '2025-12-28',
      dataPresentazione: '2025-10-21',
    }, ['Governo']);

    expect(row).toMatchObject({
      proposal_type: 'budget',
      status: 'adopted',
      vote_date: '2025-12-28',
      policy_area: 'finance',
    });
  });
});
