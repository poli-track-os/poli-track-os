import { describe, expect, it } from "vitest";
import {
  buildMatchIndexes,
  buildMutationPlan,
  buildSourceAttribution,
  getMatch,
  type ExistingPoliticianRow,
} from "../lib/official-roster-sync-helpers";
import type { OfficialRosterRecord } from "../lib/official-rosters";

const baseRecord: OfficialRosterRecord = {
  recordId: "de-bundestag:11005000",
  name: "Andreas Müller",
  alternateNames: [],
  biography: "Official Bundestag biography.",
  birthYear: 1970,
  committees: ["Committee on Budget"],
  countryCode: "DE",
  countryName: "Germany",
  jurisdiction: "federal",
  role: "Member of Bundestag",
  photoUrl: null,
  partyName: "Test Party",
  partyAbbreviation: "TP",
  inOfficeSince: null,
  constituency: null,
  sourceLabel: "Bundestag MdB-Stammdaten",
  sourceUrl: "https://www.bundestag.de/abgeordnete/biografien/M/mueller-andreas-12345",
  datasetUrl: "https://www.bundestag.de/resource/blob/472878/MdB-Stammdaten.zip",
  twitterHandle: null,
};

const baseRow = (overrides: Partial<ExistingPoliticianRow>): ExistingPoliticianRow => ({
  biography: null,
  birth_year: null,
  committees: null,
  id: "00000000-0000-0000-0000-000000000001",
  country_code: "DE",
  country_name: "Germany",
  data_source: null,
  enriched_at: null,
  external_id: null,
  in_office_since: null,
  jurisdiction: null,
  name: "Andreas Müller",
  party_abbreviation: null,
  party_name: null,
  photo_url: null,
  role: null,
  source_attribution: null,
  source_url: null,
  twitter_handle: null,
  ...overrides,
});

describe("getMatch — uses hoisted indexes (no per-record rebuild)", () => {
  it("matches by external_id when available", () => {
    const row = baseRow({ id: "row-1", external_id: "de-bundestag:11005000" });
    const idx = buildMatchIndexes([row]);
    const result = getMatch(idx, baseRecord);
    expect(result.matchedBy).toBe("external_id");
    expect(result.row?.id).toBe("row-1");
  });

  it("matches by source_attribution.record_id when external_id is missing", () => {
    const row = baseRow({
      id: "row-2",
      source_attribution: {
        _official_record: { record_id: "de-bundestag:11005000" },
      },
    });
    const idx = buildMatchIndexes([row]);
    const result = getMatch(idx, baseRecord);
    expect(result.matchedBy).toBe("source_attribution");
    expect(result.row?.id).toBe("row-2");
  });

  it("falls back to name when nothing else matches", () => {
    const row = baseRow({ id: "row-3", name: "Andreas Müller" });
    const idx = buildMatchIndexes([row]);
    const result = getMatch(idx, baseRecord);
    expect(result.matchedBy).toBe("name");
    expect(result.row?.id).toBe("row-3");
  });

  it("refuses to match if the name is ambiguous (two rows with the same name)", () => {
    const a = baseRow({ id: "row-4", name: "Andreas Müller" });
    const b = baseRow({ id: "row-5", name: "Andreas Müller" });
    const idx = buildMatchIndexes([a, b]);
    const result = getMatch(idx, baseRecord);
    expect(result.matchedBy).toBe("none");
    expect(result.row).toBeNull();
  });
});

describe("buildMutationPlan — external_id guard", () => {
  it("does NOT write external_id on a name-only match", () => {
    const row = baseRow({ id: "row-3", name: "Andreas Müller" });
    const plan = buildMutationPlan(row, baseRecord, "name");
    expect(plan.action).toBe("update");
    expect(plan.payload.external_id).toBeUndefined();
    expect(plan.changedFields).not.toContain("external_id");
  });

  it("writes external_id when matched by source_attribution and existing was null", () => {
    const row = baseRow({
      id: "row-2",
      external_id: null,
      source_attribution: { _official_record: { record_id: "de-bundestag:11005000" } },
    });
    const plan = buildMutationPlan(row, baseRecord, "source_attribution");
    expect(plan.payload.external_id).toBe("de-bundestag:11005000");
    expect(plan.changedFields).toContain("external_id");
  });

  it("does NOT write external_id when matched by external_id (already set)", () => {
    const row = baseRow({ id: "row-1", external_id: "de-bundestag:11005000" });
    const plan = buildMutationPlan(row, baseRecord, "external_id");
    expect(plan.payload.external_id).toBeUndefined();
  });

  it("does NOT clobber a DIFFERENT existing external_id on a name match", () => {
    // This is the worst-case scenario the bug description warned about.
    // Row already has external_id 'wikidata:Q12345' from Wikipedia
    // enrichment. We get a name-only match against an official roster
    // record. The script must NOT overwrite the existing external_id.
    const row = baseRow({
      id: "row-9",
      external_id: "wikidata:Q12345",
      name: "Andreas Müller",
    });
    const plan = buildMutationPlan(row, baseRecord, "name");
    expect(plan.payload.external_id).toBeUndefined();
    expect(plan.changedFields).not.toContain("external_id");
  });

  it("brand new INSERT writes external_id from recordId", () => {
    const plan = buildMutationPlan(null, baseRecord, "none");
    expect(plan.action).toBe("insert");
    expect((plan.payload as { external_id: string }).external_id).toBe("de-bundestag:11005000");
  });

  it("fills official biography/birth year gaps and stamps enriched_at", () => {
    const row = baseRow({ id: "row-10", external_id: "de-bundestag:11005000" });
    const plan = buildMutationPlan(row, baseRecord, "external_id");
    expect(plan.payload.biography).toBe("Official Bundestag biography.");
    expect(plan.payload.birth_year).toBe(1970);
    expect(plan.payload.committees).toEqual(["Committee on Budget"]);
    expect(typeof plan.payload.enriched_at).toBe("string");
  });

  it("does not clobber an existing biography when only filling other gaps", () => {
    const row = baseRow({
      id: "row-11",
      external_id: "de-bundestag:11005000",
      biography: "Existing biography",
      birth_year: null,
    });
    const plan = buildMutationPlan(row, baseRecord, "external_id");
    expect(plan.payload.biography).toBeUndefined();
    expect(plan.payload.birth_year).toBe(1970);
  });

  it("drops stale country leadership attribution when the official identity differs", () => {
    const row = baseRow({
      id: "row-12",
      external_id: "de-bundestag:11005000",
      source_attribution: {
        continent: {
          record_id: "country_leadership:DE:head_of_government:Q123",
          source_type: "wikipedia",
        },
        _country_leadership: {
          record_id: "country_leadership:DE:head_of_government:Q123",
          person_name: "Olaf Scholz",
        },
      },
    });
    const plan = buildMutationPlan(row, baseRecord, "external_id");
    const sourceAttribution = plan.payload.source_attribution as Record<string, unknown>;
    expect(sourceAttribution._country_leadership).toBeUndefined();
    expect(sourceAttribution.continent).toBeUndefined();
    expect(sourceAttribution._official_record).toBeDefined();
  });

  it("does not emit a fake source_attribution-only update when nothing actually changed", () => {
    const row = baseRow({
      id: "row-13",
      biography: baseRecord.biography,
      birth_year: baseRecord.birthYear,
      committees: baseRecord.committees,
      data_source: "official_record",
      enriched_at: "2026-04-23T00:00:00.000Z",
      external_id: "de-bundestag:11005000",
      in_office_since: baseRecord.inOfficeSince,
      jurisdiction: baseRecord.jurisdiction,
      name: baseRecord.name,
      party_abbreviation: baseRecord.partyAbbreviation,
      party_name: baseRecord.partyName,
      photo_url: baseRecord.photoUrl,
      role: baseRecord.role,
      source_url: baseRecord.sourceUrl,
      source_attribution: buildSourceAttribution(null, baseRecord, []),
      twitter_handle: baseRecord.twitterHandle,
    });
    const plan = buildMutationPlan(row, baseRecord, "external_id");
    expect(plan.payload).toEqual({});
    expect(plan.changedFields).toEqual([]);
  });
});
