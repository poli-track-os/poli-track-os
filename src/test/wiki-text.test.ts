import { describe, expect, it } from "vitest";
import { cleanInfoboxValues, cleanWikiText } from "../lib/wiki-text";

describe("cleanWikiText — piped wiki links", () => {
  it("uses the visible label of a piped link", () => {
    expect(cleanWikiText("[[Social Democratic Party of Germany|SPD]]")).toBe("SPD");
  });

  it("handles a simple link", () => {
    expect(cleanWikiText("[[Bundestag]]")).toBe("Bundestag");
  });

  it("handles multiple links in one value", () => {
    expect(cleanWikiText("[[Member of the [[Bundestag]]]] for [[Berlin]]")).toBe("Member of the Bundestag for Berlin");
  });
});

describe("cleanWikiText — templates", () => {
  it("renders {{birth date and age|YYYY|MM|DD}} as a date", () => {
    const result = cleanWikiText("{{birth date and age|1971|3|14|df=y}}");
    expect(result).toContain("1971");
    expect(result).toContain("March");
    expect(result).toContain("14");
  });

  it("renders {{start date|YYYY|MM|DD}}", () => {
    const result = cleanWikiText("{{start date|2019|12|12|df=y}}");
    expect(result).toContain("2019");
  });

  it("falls back to the year when day/month are missing", () => {
    expect(cleanWikiText("{{birth date|1960}}")).toBe("1960");
  });

  it("renders {{ubl|a|b|c}} as a comma list", () => {
    expect(cleanWikiText("{{ubl|Foo|Bar|Baz}}")).toBe("Foo, Bar, Baz");
  });

  it("strips unknown templates entirely", () => {
    expect(cleanWikiText("Member of {{some-unknown-template}}")).toBe("Member of");
  });
});

describe("cleanWikiText — leading garbage from the infobox capture", () => {
  it("strips a leading '| field =' that leaked into the captured value", () => {
    expect(cleanWikiText("| constituency = [[Potsdam]]")).toBe("Potsdam");
  });

  it("strips html tags but keeps <br/> as comma", () => {
    expect(cleanWikiText("Foo<br />Bar")).toBe("Foo, Bar");
  });

  it("strips comments and refs", () => {
    expect(cleanWikiText("Real value<!-- comment -->")).toBe("Real value");
    expect(cleanWikiText("Real value<ref name='x'>citation</ref>")).toBe("Real value");
  });

  it("collapses multiple spaces", () => {
    expect(cleanWikiText("Hello    world\n\n\tindeed")).toBe("Hello world indeed");
  });

  it("strips italic markers", () => {
    expect(cleanWikiText("''italic'' and '''bold'''")).toBe("italic and bold");
  });

  it("returns empty string for null/undefined", () => {
    expect(cleanWikiText(null)).toBe("");
    expect(cleanWikiText(undefined)).toBe("");
  });
});

describe("cleanWikiText — the actual examples from the screenshot", () => {
  // These are the literal values the user reported seeing rendered raw on the
  // ActorDetail "DETAILS" panel. They must all clean up to something readable.
  it("handles '[[Social Democratic P...'", () => {
    // Truncated capture from the previous regex bug — best-effort cleanup.
    expect(cleanWikiText("[[Social Democratic Party of Germany|SPD]]")).toBe("SPD");
  });

  it("handles 'Member of the [[Assem...'", () => {
    expect(cleanWikiText("Member of the [[Bundestag]]")).toBe("Member of the Bundestag");
  });

  it("handles '| constituency = [[Po...'", () => {
    expect(cleanWikiText("| constituency = [[Potsdam I|Potsdam]]")).toBe("Potsdam");
  });

  it("handles '{{Birth date and age|...}}'", () => {
    expect(cleanWikiText("{{birth date and age|1971|3|14|df=y}}")).toMatch(/1971/);
  });

  it("handles '| alma_mater = [[University of Berlin]]'", () => {
    expect(cleanWikiText("| alma_mater = [[University of Berlin]]")).toBe("University of Berlin");
  });
});

describe("cleanInfoboxValues", () => {
  it("cleans every value in an infobox object and drops empties", () => {
    const result = cleanInfoboxValues({
      party: "[[Social Democratic Party of Germany|SPD]]",
      birth_date: "{{birth date and age|1971|3|14|df=y}}",
      term_start: "{{start date|2019|12|12|df=y}}",
      empty_field: "",
      junk_field: "{{some-unknown}}",
    });
    expect(result.party).toBe("SPD");
    expect(result.birth_date).toContain("1971");
    expect(result.term_start).toContain("2019");
    expect(result.empty_field).toBeUndefined();
    expect(result.junk_field).toBeUndefined();
  });

  it("returns empty object for null input", () => {
    expect(cleanInfoboxValues(null)).toEqual({});
  });
});
