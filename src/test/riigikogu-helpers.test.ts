import { describe, expect, it } from 'vitest';
import { buildProposalFromRiigikoguDraft, buildRiigikoguSourceUrl, buildVoteBundleFromRiigikoguDraft } from '@/lib/riigikogu-helpers';

describe('buildProposalFromRiigikoguDraft', () => {
  it('maps an in-process Riigikogu draft bill into a proposal row', () => {
    const row = buildProposalFromRiigikoguDraft({
      uuid: 'df97ebe8-0562-451b-a2b8-2b9d36bfcd7c',
      title: 'Liiklusseaduse muutmise seadus',
      mark: 835,
      activeDraftStage: 'ESIMENE_LUGEMINE',
      activeDraftStatus: 'SAADETUD_I_LUGEMISELE',
      proceedingStatus: 'IN_PROCESS',
      activeDraftStatusDate: '2026-04-21',
      initiated: '2026-02-26',
      _links: {
        self: {
          href: 'https://api.riigikogu.ee/api/volumes/drafts/df97ebe8-0562-451b-a2b8-2b9d36bfcd7c',
        },
      },
    });

    expect(row).toMatchObject({
      title: 'Liiklusseaduse muutmise seadus',
      status: 'parliamentary_deliberation',
      country_code: 'EE',
      submitted_date: '2026-02-26',
      vote_date: null,
      data_source: 'riigikogu',
      source_url: buildRiigikoguSourceUrl(
        'https://api.riigikogu.ee/api/volumes/drafts/df97ebe8-0562-451b-a2b8-2b9d36bfcd7c',
        'df97ebe8-0562-451b-a2b8-2b9d36bfcd7c',
      ),
    });
  });

  it('maps a processed adopted Riigikogu bill and carries the final status date as vote date', () => {
    const row = buildProposalFromRiigikoguDraft({
      title: 'Riigi 2026. aasta eelarve seadus',
      activeDraftStage: 'VASTU_VOETUD',
      activeDraftStatus: 'AVALDATUD_RIIGITEATAJAS',
      proceedingStatus: 'PROCESSED',
      activeDraftStatusDate: '2026-12-15',
      initiated: '2026-09-30',
      _links: {
        self: {
          href: 'https://api.riigikogu.ee/api/volumes/drafts/example',
        },
      },
    });

    expect(row).toMatchObject({
      status: 'adopted',
      submitted_date: '2026-09-30',
      vote_date: '2026-12-15',
      policy_area: 'finance',
      source_url: 'https://api.riigikogu.ee/api/volumes/drafts/example?lang=EN',
    });
  });

  it('falls back to a UUID-based detail URL when the list row has no self link', () => {
    const row = buildProposalFromRiigikoguDraft({
      uuid: 'abc',
      title: 'Test seadus',
      proceedingStatus: 'IN_PROCESS',
      initiated: '2026-01-01',
    });

    expect(row?.source_url).toBe('https://api.riigikogu.ee/api/volumes/drafts/abc');
  });
});

describe('buildVoteBundleFromRiigikoguDraft', () => {
  it('emits a vote bundle for adopted final status rows', () => {
    const vote = buildVoteBundleFromRiigikoguDraft({
      uuid: 'draft-1',
      title: 'Eelarveseadus',
      activeDraftStage: 'VASTU_VOETUD',
      activeDraftStatus: 'AVALDATUD_RIIGITEATAJAS',
      activeDraftStatusDate: '2026-12-20',
      _links: { self: { href: 'https://api.riigikogu.ee/api/volumes/drafts/draft-1' } },
    });
    expect(vote).toMatchObject({
      chamber: 'Riigikogu',
      happened_at: '2026-12-20',
      result: 'adopted',
      vote_method: 'plenary',
    });
  });

  it('returns null for non-final statuses', () => {
    const vote = buildVoteBundleFromRiigikoguDraft({
      uuid: 'draft-2',
      title: 'Test',
      activeDraftStage: 'ESIMENE_LUGEMINE',
      activeDraftStatus: 'SAADETUD_I_LUGEMISELE',
      activeDraftStatusDate: '2026-01-10',
    });
    expect(vote).toBeNull();
  });
});
