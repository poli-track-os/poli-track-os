import { describe, expect, it } from "vitest";
import {
  buildEventRowFromActivity,
  buildVoteBundlesFromDossier,
  extractPartyHistory,
  iterateActivityEntries,
  normalizeTimestamp,
  parseParltrackLine,
  STABLE_UNKNOWN_TIMESTAMP,
  type ParltrackActivity,
  type ParltrackMep,
} from "../lib/parltrack-helpers";

describe("parseParltrackLine", () => {
  it("returns null for framing lines", () => {
    expect(parseParltrackLine("[")).toBeNull();
    expect(parseParltrackLine("]")).toBeNull();
    expect(parseParltrackLine("")).toBeNull();
    expect(parseParltrackLine("  \n")).toBeNull();
  });

  it("parses the first record line with '[{...}' prefix", () => {
    expect(parseParltrackLine('[{"UserID":12345,"Name":{"full":"Jane Doe"}}')).toEqual({
      UserID: 12345,
      Name: { full: "Jane Doe" },
    });
  });

  it("parses subsequent record lines (comma-prefixed)", () => {
    expect(parseParltrackLine(',{"UserID":67890}')).toEqual({ UserID: 67890 });
  });

  it("parses record lines without a prefix (no framing)", () => {
    expect(parseParltrackLine('{"UserID":100}')).toEqual({ UserID: 100 });
  });
});

describe("normalizeTimestamp", () => {
  it("handles YYYY-MM-DD by assuming midnight UTC", () => {
    expect(normalizeTimestamp("2024-05-15")).toBe("2024-05-15T00:00:00Z");
  });

  it("handles ISO timestamps", () => {
    expect(normalizeTimestamp("2024-05-15T14:30:00Z")).toBe("2024-05-15T14:30:00.000Z");
  });

  it("handles offset timestamps", () => {
    expect(normalizeTimestamp("2024-05-15 14:30:00+02:00")).toBe("2024-05-15T12:30:00.000Z");
  });

  it("falls back to stable epoch on garbage", () => {
    expect(normalizeTimestamp("not a date")).toBe(STABLE_UNKNOWN_TIMESTAMP);
    expect(normalizeTimestamp("")).toBe(STABLE_UNKNOWN_TIMESTAMP);
  });
});

describe("buildEventRowFromActivity", () => {
  it("builds a legislation_sponsored row from a REPORT entry", () => {
    const row = buildEventRowFromActivity("pol-1", "12345", "REPORT", {
      ts: "2024-01-15",
      title: "on the proposal for a regulation on widgets",
      reference: "A9-0042/2024",
      committee: ["JURI"],
      dossiers: ["2023/0123(COD)"],
      url: "https://europarl.europa.eu/doceo/document/A-9-2024-0042_EN.html",
    });
    expect(row).not.toBeNull();
    expect(row!.event_type).toBe("legislation_sponsored");
    expect(row!.title).toBe("A9-0042/2024: on the proposal for a regulation on widgets");
    expect(row!.source).toBe("parliamentary_record");
    expect(row!.trust_level).toBe(1);
    expect(row!.event_timestamp).toBe("2024-01-15T00:00:00Z");
    expect(row!.source_url).toBe("https://europarl.europa.eu/doceo/document/A-9-2024-0042_EN.html");
    expect(row!.entities).toContain("#JURI");
  });

  it("uses speech event_type for SPEECH entries", () => {
    const row = buildEventRowFromActivity("pol-1", "12345", "SPEECH", {
      ts: "2024-02-10",
      title: "Intervention on digital services act trilogue",
      url: "https://europarl.europa.eu/speech/xyz",
    });
    expect(row!.event_type).toBe("speech");
  });

  it("uses public_statement for QUESTION entries", () => {
    const row = buildEventRowFromActivity("pol-1", "12345", "QUESTION", {
      ts: "2024-03-01",
      title: "Written question on fisheries policy",
      reference: "E-000123/2024",
      url: "https://europarl.europa.eu/question/xyz",
    });
    expect(row!.event_type).toBe("public_statement");
  });

  it("returns null for an empty entry", () => {
    expect(buildEventRowFromActivity("p", "1", "REPORT", {})).toBeNull();
  });

  it("falls back to stable epoch when ts is missing", () => {
    const row = buildEventRowFromActivity("pol-1", "12345", "REPORT", {
      title: "unknown date",
      reference: "A9-0099/2024",
    });
    expect(row!.event_timestamp).toBe(STABLE_UNKNOWN_TIMESTAMP);
  });
});

describe("iterateActivityEntries", () => {
  it("yields interesting activity categories only", () => {
    const activity: ParltrackActivity = {
      mep_id: 12345,
      REPORT: [{ ts: "2024-01-15", title: "R1" }],
      'REPORT-SHADOW': [{ ts: "2024-02-10", title: "RS1" }],
      SPEECH: [{ ts: "2024-03-05", title: "S1" }, { ts: "2024-04-01", title: "S2" }],
      UNKNOWN_CATEGORY: [{ title: "ignored" }],
    } as unknown as ParltrackActivity;
    const entries = Array.from(iterateActivityEntries(activity));
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.category)).toEqual(["REPORT", "REPORT-SHADOW", "SPEECH", "SPEECH"]);
  });
});

describe("extractPartyHistory", () => {
  it("turns Groups + Constituencies into claims with valid windows", () => {
    const mep: ParltrackMep = {
      UserID: 12345,
      Groups: [
        { Organization: "S&D", role: "member", start: "2019-07-02", end: "2024-07-15" },
        { Organization: "S&D", role: "member", start: "2024-07-16" },
      ],
      Constituencies: [
        { country: "Germany", party: "SPD", start: "2019-07-02", end: "2024-07-15" },
        { country: "Germany", party: "SPD", start: "2024-07-16" },
      ],
    };
    const history = extractPartyHistory(mep);
    const groups = history.filter((h) => h.key === "political_group");
    const parties = history.filter((h) => h.key === "party");
    expect(groups).toHaveLength(2);
    expect(parties).toHaveLength(2);
    expect(groups[0].valid_from).toBe("2019-07-02T00:00:00Z");
    expect(groups[0].valid_to).toBe("2024-07-15T00:00:00Z");
    expect(groups[1].valid_to).toBeNull();
  });
});

describe("buildVoteBundlesFromDossier", () => {
  it("normalizes dossier votes into event/group/record bundles", () => {
    const bundles = buildVoteBundlesFromDossier({
      votes: [{
        ts: "2026-03-01",
        rcv_id: 123,
        url: "https://example.test/vote",
        votes: {
          "+": { total: 2, groups: { EPP: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] } },
          "-": { total: 1, groups: { SND: [{ id: 3, name: "Carol" }] } },
          "0": { total: 1, groups: { Greens: [{ id: 4, name: "Dan" }] } },
        },
      }],
    });
    expect(bundles).toHaveLength(1);
    expect(bundles[0].source_event_id).toBe("123");
    expect(bundles[0].for_count).toBe(2);
    expect(bundles[0].against_count).toBe(1);
    expect(bundles[0].abstain_count).toBe(1);
    expect(bundles[0].groups).toHaveLength(3);
    expect(bundles[0].records).toHaveLength(4);
  });
});
