import { describe, expect, it } from "vitest";
import {
  buildEnrichmentUpdate,
  candidateMatchesPolitician,
  extractWikipediaTitleFromUrl,
  parseBirthYear,
  parseCommittees,
  parseInOfficeSince,
  parseInfobox,
  parsePartyName,
  parseTwitterHandle,
  type EnrichmentSourceData,
  type ExistingPoliticianForEnrichment,
} from "../../supabase/functions/enrich-wikipedia/parsers";

// Realistic infobox snippet — values contain the wiki templates and pipes
// that broke the previous regex.
const SAMPLE_INFOBOX = `
{{Infobox officeholder
| name = Jane Example
| birth_date = {{birth date and age|1971|3|14|df=y}}
| birth_place = [[London]], [[England]]
| party = [[Labour Party (UK)|Labour]]
| office = [[Member of Parliament]]
| term_start = {{start date|2019|12|12|df=y}}
| term_end =
| spouse = John Example
| occupation = Lawyer
| twitter = JaneExampleMP
| committees = Treasury Select Committee, Justice Committee
}}
`;

describe("parseInfobox — regex no longer truncates at the first pipe", () => {
  it("captures wiki templates that contain pipes", () => {
    const ib = parseInfobox(SAMPLE_INFOBOX);
    expect(ib).not.toBeNull();
    expect(ib!.birth_date).toContain("birth date and age");
    expect(ib!.birth_date).toContain("1971");
    expect(ib!.birth_date).toContain("3");
    expect(ib!.birth_date).toContain("14");
  });

  it("captures piped wiki links inside party value", () => {
    const ib = parseInfobox(SAMPLE_INFOBOX)!;
    // The raw value should contain the full link, including the pipe.
    expect(ib.party).toContain("Labour Party (UK)");
    expect(ib.party).toContain("Labour");
  });

  it("captures term_start template with year/month/day pipes", () => {
    const ib = parseInfobox(SAMPLE_INFOBOX)!;
    expect(ib.term_start).toContain("2019");
    expect(ib.term_start).toContain("12");
  });

  it("returns null when the infobox is empty or missing", () => {
    expect(parseInfobox("{{Infobox officeholder\n}}")).toBeNull();
    expect(parseInfobox("")).toBeNull();
  });

  it("does NOT capture the next field's value when the current field is empty", () => {
    // Regression for a real bug: a politician with `| term_end =\n| birth_date = ...`
    // used to capture term_end as `| birth_date = {{...}}`. The fix: the post-equals
    // whitespace allowance must be horizontal-only, not generic `\s*`.
    const sample = `
{{Infobox officeholder
| name = Jane Example
| term_end =
| birth_date = {{birth date and age|1981|12|8|df=y}}
| signature =
| religion =
}}
`;
    const ib = parseInfobox(sample);
    expect(ib).not.toBeNull();
    // term_end should NOT be present (it was empty)
    expect(ib!.term_end).toBeUndefined();
    // birth_date SHOULD be present and contain the actual template
    expect(ib!.birth_date).toContain('birth date and age');
    expect(ib!.birth_date).toContain('1981');
    // religion should NOT be present (it was empty)
    expect(ib!.religion).toBeUndefined();
  });
});

describe("derived field parsers", () => {
  it("parseBirthYear extracts the year from {{birth date|YYYY|MM|DD}}", () => {
    expect(parseBirthYear("{{birth date|1971|3|14}}")).toBe(1971);
    expect(parseBirthYear("{{birth date and age|1960|5|12|df=y}}")).toBe(1960);
    expect(parseBirthYear("born 12 May 1960 (aged 65)")).toBe(1960);
    expect(parseBirthYear("")).toBeNull();
    expect(parseBirthYear("not a year")).toBeNull();
    // Reject 3-digit and out-of-range years.
    expect(parseBirthYear("year 999")).toBeNull();
    expect(parseBirthYear("year 2200")).toBeNull();
  });

  it("parseInOfficeSince handles {{start date|YYYY|MM|DD}}", () => {
    expect(parseInOfficeSince("{{start date|2019|12|12|df=y}}")).toBe("2019-12-12");
    expect(parseInOfficeSince("2024-05-01")).toBe("2024-05-01");
    expect(parseInOfficeSince("2024")).toBe("2024-01-01");
    expect(parseInOfficeSince("")).toBeNull();
  });

  it("parsePartyName handles piped wiki links", () => {
    expect(parsePartyName("[[Labour Party (UK)|Labour]]")).toBe("Labour");
    expect(parsePartyName("[[Conservative Party (UK)]]")).toBe("Conservative Party");
    expect(parsePartyName("{{partyname|labour}}")).toBeNull();
    expect(parsePartyName("Independent")).toBe("Independent");
  });

  it("parseTwitterHandle extracts the handle from a piped infobox value", () => {
    expect(parseTwitterHandle("JaneExampleMP")).toBe("JaneExampleMP");
    expect(parseTwitterHandle("@jane_mp")).toBe("jane_mp");
    expect(parseTwitterHandle("[[twitter]]")).toBeNull();
  });

  it("parseCommittees splits comma-separated values", () => {
    expect(parseCommittees("Treasury Select Committee, Justice Committee")).toEqual([
      "Treasury Select Committee",
      "Justice Committee",
    ]);
    expect(parseCommittees("")).toEqual([]);
  });
});

describe("extractWikipediaTitleFromUrl", () => {
  it("decodes percent-encoded titles", () => {
    expect(
      extractWikipediaTitleFromUrl("https://en.wikipedia.org/wiki/Angela_Merkel"),
    ).toBe("Angela_Merkel");
    expect(
      extractWikipediaTitleFromUrl("https://en.wikipedia.org/wiki/Angela%20Merkel"),
    ).toBe("Angela Merkel");
    expect(extractWikipediaTitleFromUrl(null)).toBeNull();
    expect(extractWikipediaTitleFromUrl("https://example.com")).toBeNull();
  });
});

describe("candidateMatchesPolitician", () => {
  it("accepts a real politician page", () => {
    expect(
      candidateMatchesPolitician(
        "Angela Merkel",
        ["Politicians of Germany", "Members of the Bundestag", "Christian Democratic Union (Germany) politicians"],
        "Angela Merkel",
        "Germany",
      ),
    ).toBe(true);
  });

  it("rejects a list page", () => {
    expect(
      candidateMatchesPolitician(
        "List of members of the Bundestag",
        ["Bundestag", "Politicians of Germany"],
        "Angela Merkel",
        "Germany",
      ),
    ).toBe(false);
  });

  it("rejects a page with no shared name token", () => {
    expect(
      candidateMatchesPolitician(
        "Wolfgang Schäuble",
        ["Politicians of Germany"],
        "Angela Merkel",
        "Germany",
      ),
    ).toBe(false);
  });

  it("rejects a candidate that only shares a common first name", () => {
    expect(
      candidateMatchesPolitician(
        "Luís Montenegro",
        ["Prime ministers of Portugal", "Members of the Assembly of the Republic (Portugal)"],
        "Luís Gonçalves Pereira",
        "Portugal",
      ),
    ).toBe(false);
  });

  it("accepts a candidate that expands a short display name into a fuller legal name", () => {
    expect(
      candidateMatchesPolitician(
        "Miguel Costa Matos",
        ["Portuguese politicians", "Members of the Assembly of the Republic (Portugal)"],
        "Miguel Matos",
        "Portugal",
      ),
    ).toBe(true);
  });
});

// === The big behavioral test: buildEnrichmentUpdate must NOT clobber
// existing values that came from a higher-trust source. ===
describe("buildEnrichmentUpdate — never clobbers existing values", () => {
  const baseSource: EnrichmentSourceData = {
    wikiTitle: "Jane Example",
    wikiUrl: "https://en.wikipedia.org/wiki/Jane_Example",
    wikiImage: "https://upload.wikimedia.org/jane.jpg",
    summaryExtract: "Jane Example is a British politician.",
    summaryDescription: "British politician",
    fullExtract: "Jane Example (born 14 March 1971) is a British politician...",
    infobox: parseInfobox(SAMPLE_INFOBOX),
    categories: ["Living people", "Members of the Parliament of the United Kingdom for English constituencies"],
    wikidataId: "Q12345",
    coordinates: null,
  };

  it("preserves an EP-curated wikipedia_url over the Wikipedia guess", () => {
    const existing: ExistingPoliticianForEnrichment = {
      wikipedia_url: "https://www.europarl.europa.eu/meps/en/12345",
    };
    const update = buildEnrichmentUpdate(existing, baseSource, "2026-04-14T00:00:00Z");
    expect(update.wikipedia_url).toBe("https://www.europarl.europa.eu/meps/en/12345");
  });

  it("preserves an existing biography even if Wikipedia returned a new one", () => {
    const existing: ExistingPoliticianForEnrichment = {
      biography: "Curated biography from official source",
    };
    const update = buildEnrichmentUpdate(existing, baseSource, "2026-04-14T00:00:00Z");
    expect(update.biography).toBe("Curated biography from official source");
  });

  it("preserves an existing wikipedia_summary", () => {
    const existing: ExistingPoliticianForEnrichment = {
      wikipedia_summary: "Curated summary",
    };
    const update = buildEnrichmentUpdate(existing, baseSource, "2026-04-14T00:00:00Z");
    expect(update.wikipedia_summary).toBe("Curated summary");
  });

  it("preserves an existing photo_url (no MEP portrait clobber)", () => {
    const existing: ExistingPoliticianForEnrichment = {
      photo_url: "https://www.europarl.europa.eu/mepphoto/12345.jpg",
    };
    const update = buildEnrichmentUpdate(existing, baseSource, "2026-04-14T00:00:00Z");
    expect(update.photo_url).toBeUndefined();
  });

  it("preserves an existing external_id (no Wikidata clobber)", () => {
    const existing: ExistingPoliticianForEnrichment = {
      external_id: "12345",
    };
    const update = buildEnrichmentUpdate(existing, baseSource, "2026-04-14T00:00:00Z");
    expect(update.external_id).toBeUndefined();
  });

  it("fills empty fields from Wikipedia data", () => {
    const update = buildEnrichmentUpdate({}, baseSource, "2026-04-14T00:00:00Z");
    expect(update.wikipedia_url).toBe("https://en.wikipedia.org/wiki/Jane_Example");
    expect(update.biography).toContain("Jane Example");
    expect(update.photo_url).toBe("https://upload.wikimedia.org/jane.jpg");
    expect(update.external_id).toBe("Q12345");
    expect(update.birth_year).toBe(1971);
    expect(update.twitter_handle).toBe("JaneExampleMP");
    expect(update.in_office_since).toBe("2019-12-12");
    expect(update.party_name).toBe("Labour");
  });

  it("merges new wikipedia_data into existing wikipedia_data", () => {
    const existing: ExistingPoliticianForEnrichment = {
      wikipedia_data: { custom_key: "kept" },
    };
    const update = buildEnrichmentUpdate(existing, baseSource, "2026-04-14T00:00:00Z");
    const wd = update.wikipedia_data as Record<string, unknown>;
    expect(wd.custom_key).toBe("kept");
    expect(wd.wikidata_id).toBe("Q12345");
    expect(wd.last_fetched).toBe("2026-04-14T00:00:00Z");
  });
});
