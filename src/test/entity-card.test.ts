import { describe, expect, it } from "vitest";
import { renderEntityCard, type EntityCardInput } from "../lib/entity-card";

const baseInput = (overrides: Partial<EntityCardInput> = {}): EntityCardInput => ({
  entity: {
    id: "00000000-0000-0000-0000-000000000001",
    kind: "person",
    canonical_name: "Jane Example",
    slug: "jane-example-12345678",
    summary: "German MEP, Social Democratic Party.",
    first_seen_at: "2026-04-14T18:00:00Z",
  },
  aliases: [
    { scheme: "ep_mep", value: "12345", trust_level: 1 },
    { scheme: "wikidata", value: "Q98765", trust_level: 2 },
    { scheme: "twitter_handle", value: "janeexample", trust_level: 3 },
    { scheme: "name", value: "jane example", trust_level: 4 },
  ],
  claims: [
    { key: "party", value: { s: "SPD" }, value_type: "string", valid_from: "2019-07-02T00:00:00Z", valid_to: null, data_source: "ep_xml", trust_level: 1 },
    { key: "birth_year", value: { n: 1971 }, value_type: "number", valid_from: null, valid_to: null, data_source: "wikipedia", trust_level: 2 },
    { key: "in_office_since", value: { d: "2019-07-02" }, value_type: "date", valid_from: "2019-07-02T00:00:00Z", valid_to: null, data_source: "ep_xml", trust_level: 1 },
  ],
  relationshipsOut: [
    { predicate: "member_of", object: { id: "p2", kind: "party", canonical_name: "SPD", slug: "de-spd" }, valid_from: "2019-07-02T00:00:00Z", valid_to: null, role: "member" },
    { predicate: "voted_on", object: { id: "p3", kind: "proposal", canonical_name: "Digital Services Act", slug: "proposal-dsa-2022" }, valid_from: "2022-07-05T00:00:00Z", valid_to: null, role: null },
  ],
  relationshipsIn: [
    { predicate: "party_ally", subject: { id: "p4", kind: "person", canonical_name: "Max Mustermann", slug: "max-mustermann-abcdef00" }, valid_from: null, valid_to: null },
  ],
  recentEvents: [
    { event_type: "vote", title: "Voted YES on A9-0042/2024", event_timestamp: "2024-03-15T14:30:00Z", source: "parltrack", source_url: "https://parltrack.org/votes/123" },
    { event_type: "speech", title: "Intervention on the Energy Charter Treaty", event_timestamp: "2024-02-10T11:00:00Z", source: "parltrack", source_url: null },
  ],
  ...overrides,
});

describe("renderEntityCard — header + summary", () => {
  it("opens with the canonical name and kind", () => {
    const md = renderEntityCard(baseInput());
    expect(md).toMatch(/^# Jane Example/);
    expect(md).toContain("**Kind**: person");
    expect(md).toContain("`jane-example-12345678`");
  });

  it("includes the summary line", () => {
    expect(renderEntityCard(baseInput())).toContain("German MEP, Social Democratic Party.");
  });
});

describe("renderEntityCard — identifiers", () => {
  it("groups aliases by scheme", () => {
    const md = renderEntityCard(baseInput());
    expect(md).toContain("## Identifiers");
    expect(md).toContain("**ep_mep**: 12345");
    expect(md).toContain("**wikidata**: Q98765");
    expect(md).toContain("**twitter_handle**: janeexample");
  });
});

describe("renderEntityCard — facts", () => {
  it("renders each claim key with its value", () => {
    const md = renderEntityCard(baseInput());
    expect(md).toContain("**party**: SPD");
    expect(md).toContain("**birth_year**: 1971");
    expect(md).toContain("**in_office_since**: 2019-07-02");
  });

  it("displays valid_from..present range when valid_to is null", () => {
    const md = renderEntityCard(baseInput());
    expect(md).toMatch(/2019-07-02–present/);
  });

  it("picks the highest-trust claim per key when there are duplicates", () => {
    const input = baseInput({
      claims: [
        { key: "party", value: { s: "Wikipedia guess" }, value_type: "string", valid_from: null, valid_to: null, data_source: "wikipedia", trust_level: 3 },
        { key: "party", value: { s: "Official roster value" }, value_type: "string", valid_from: null, valid_to: null, data_source: "official_record", trust_level: 1 },
      ],
    });
    const md = renderEntityCard(input);
    expect(md).toContain("**party**: Official roster value");
    expect(md).not.toContain("Wikipedia guess");
  });
});

describe("renderEntityCard — relationships", () => {
  it("renders outgoing relationships grouped by predicate", () => {
    const md = renderEntityCard(baseInput());
    expect(md).toContain("## Outgoing relationships");
    expect(md).toContain("### member_of");
    expect(md).toContain("[SPD](/entity/party/de-spd)");
    expect(md).toContain("### voted_on");
    expect(md).toContain("[Digital Services Act](/entity/proposal/proposal-dsa-2022)");
  });

  it("renders incoming relationships in their own section", () => {
    const md = renderEntityCard(baseInput());
    expect(md).toContain("## Incoming relationships");
    expect(md).toContain("[Max Mustermann](/entity/person/max-mustermann-abcdef00)");
  });
});

describe("renderEntityCard — timeline", () => {
  it("lists events with date and link", () => {
    const md = renderEntityCard(baseInput());
    expect(md).toContain("## Recent timeline");
    expect(md).toContain("**2024-03-15**");
    expect(md).toContain("Voted YES on A9-0042/2024");
    expect(md).toContain("(https://parltrack.org/votes/123)");
  });
});

describe("renderEntityCard — empty sections are omitted", () => {
  it("does not render Identifiers when aliases is empty", () => {
    const md = renderEntityCard(baseInput({ aliases: [] }));
    expect(md).not.toContain("## Identifiers");
  });

  it("does not render outgoing relationships section when empty", () => {
    const md = renderEntityCard(baseInput({ relationshipsOut: [] }));
    expect(md).not.toContain("## Outgoing relationships");
  });

  it("still renders the footer", () => {
    const md = renderEntityCard(baseInput({ aliases: [], claims: [], relationshipsOut: [], relationshipsIn: [], recentEvents: [] }));
    expect(md).toContain("First observed by Poli-Track");
  });
});
