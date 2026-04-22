import { describe, expect, it } from 'vitest';
import { buildVoteBundlesFromRiksdagRows, extractReportCodeFromDocumentStatus } from '@/lib/riksdag-helpers';

describe('extractReportCodeFromDocumentStatus', () => {
  it('extracts committee report code from behandlas_i value', () => {
    const code = extractReportCodeFromDocumentStatus({
      dokumentstatus: {
        dokforslag: {
          forslag: [{ behandlas_i: '2025/26:AU10' }],
        },
      },
    });
    expect(code).toBe('AU10');
  });
});

describe('buildVoteBundlesFromRiksdagRows', () => {
  it('aggregates member-level votes into event/group/record bundles', () => {
    const bundles = buildVoteBundlesFromRiksdagRows([
      { votering_id: 'vote-1', namn: 'Alice', parti: 'S', rost: 'Ja', systemdatum: '2026-03-04 16:36:21' },
      { votering_id: 'vote-1', namn: 'Bob', parti: 'M', rost: 'Nej', systemdatum: '2026-03-04 16:36:21' },
      { votering_id: 'vote-1', namn: 'Carol', parti: 'S', rost: 'Avstår', systemdatum: '2026-03-04 16:36:21' },
      { votering_id: 'vote-1', namn: 'Dave', parti: 'M', rost: 'Frånvarande', systemdatum: '2026-03-04 16:36:21' },
    ]);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].for_count).toBe(1);
    expect(bundles[0].against_count).toBe(1);
    expect(bundles[0].abstain_count).toBe(1);
    expect(bundles[0].absent_count).toBe(1);
    expect(bundles[0].records).toHaveLength(4);
  });
});
