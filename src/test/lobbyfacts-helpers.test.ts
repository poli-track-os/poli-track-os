import { describe, expect, it } from "vitest";
import {
  parseLobbyfactsDatacard,
  parseLobbyfactsSearchPage,
} from "../lib/lobbyfacts-helpers";

const SEARCH_HTML = `
<html><body>
  <ul class="results">
    <li>
      <a href="/datacard/fleishman-hillard?rid=56047191389-84">Fleishman-Hillard</a>
      <span>12,730,000€</span>
      <span>FTE: 45.0</span>
    </li>
    <li>
      <a href="/datacard/meta-platforms-ireland-limited-and-its-various-subsidiaries?rid=28666427835-74">Meta Platforms Ireland Limited and its various subsidiaries</a>
      <span>10.000.000€+</span>
      <span>FTE: 16.95</span>
    </li>
    <li>
      <a href="/datacard/cefic---european-chemical-industry-council?rid=64879142323-90">CEFIC - European Chemical Industry Council</a>
      <span>10.000.000€+</span>
      <span>FTE: 46.7</span>
    </li>
  </ul>
</body></html>
`;

const DATACARD_HTML = `
<html><body>
<h1>Fleishman-Hillard</h1>
<dl>
  <dt>Category:</dt><dd>Professional consultancies</dd>
  <dt>Head office country:</dt><dd>Belgium</dd>
  <dt>Head office address:</dt><dd>Rue Belliard 40, Brussels 1040, Belgium</dd>
  <dt>First registration:</dt><dd>2009-03-17</dd>
  <dt>Last updated:</dt><dd>2026-04-03</dd>
  <dt>Full-time equivalent:</dt><dd>45.0</dd>
  <dt>EP accreditation:</dt><dd>59</dd>
  <dt>High level Commission meetings:</dt><dd>80</dd>
</dl>
<a href="http://www.fleishmanhillard.eu" class="external">Fleishman-Hillard website</a>
<table class="spend">
  <tr><td>2010</td><td>7,121,154€</td></tr>
  <tr><td>2011</td><td>9,915,957€</td></tr>
  <tr><td>2022</td><td>10,170,000€</td></tr>
  <tr><td>2025</td><td>12,730,000€</td></tr>
</table>
</body></html>
`;

describe("parseLobbyfactsSearchPage", () => {
  it("extracts each unique organisation by datacard rid", () => {
    const entries = parseLobbyfactsSearchPage(SEARCH_HTML);
    expect(entries).toHaveLength(3);
    expect(entries[0].name).toBe("Fleishman-Hillard");
    expect(entries[0].transparencyId).toBe("56047191389-84");
    expect(entries[1].name).toContain("Meta");
    expect(entries[1].transparencyId).toBe("28666427835-74");
    expect(entries[2].name).toContain("CEFIC");
  });

  it("captures spend label and FTE within the row window", () => {
    const entries = parseLobbyfactsSearchPage(SEARCH_HTML);
    expect(entries[0].approxSpendLabel).toContain("12,730,000");
    expect(entries[0].fte).toBe(45);
    expect(entries[1].fte).toBeCloseTo(16.95);
  });

  it("dedupes repeated anchors with the same rid", () => {
    const dupe = SEARCH_HTML + SEARCH_HTML;
    expect(parseLobbyfactsSearchPage(dupe)).toHaveLength(3);
  });
});

describe("parseLobbyfactsDatacard", () => {
  it("extracts the basic fields", () => {
    const card = parseLobbyfactsDatacard(DATACARD_HTML, "56047191389-84");
    expect(card.name).toBe("Fleishman-Hillard");
    expect(card.transparencyId).toBe("56047191389-84");
    expect(card.category).toBe("Professional consultancies");
    expect(card.countryOfHq).toBe("Belgium");
    expect(card.registeredAt).toBe("2009-03-17");
    expect(card.lastUpdatedTr).toBe("2026-04-03");
    expect(card.fteCount).toBeCloseTo(45.0);
    expect(card.epAccreditations).toBe(59);
    expect(card.highLevelCommissionMeetings).toBe(80);
    expect(card.website).toBe("http://www.fleishmanhillard.eu");
  });

  it("extracts spend history rows in ascending year order", () => {
    const card = parseLobbyfactsDatacard(DATACARD_HTML, "56047191389-84");
    expect(card.spendByYear).toHaveLength(4);
    expect(card.spendByYear[0]).toEqual({ year: 2010, amountEur: 7121154 });
    expect(card.spendByYear[3]).toEqual({ year: 2025, amountEur: 12730000 });
  });

  it("handles missing fields gracefully", () => {
    const card = parseLobbyfactsDatacard("<h1>Sparse Org</h1>", "999");
    expect(card.name).toBe("Sparse Org");
    expect(card.transparencyId).toBe("999");
    expect(card.category).toBeNull();
    expect(card.spendByYear).toEqual([]);
  });
});
