import { describe, expect, it } from "vitest";
import {
  mapEventCodeToType,
  matchesPolitician,
  normalizeForGdeltMatch,
  parseGdeltLine,
} from "../lib/gdelt-helpers";

// A real-shaped GDELT v1 row: 58 tab-separated columns. We only assert on
// the columns we actually consume.
function buildRow(overrides: Partial<Record<number, string>> = {}): string {
  const cols = new Array(58).fill('');
  cols[0] = '1234567890';
  cols[1] = '20240315';
  cols[6] = 'ANGELA MERKEL';
  cols[16] = 'EUROPEAN UNION';
  cols[26] = '043';
  cols[33] = '5.0';
  cols[52] = '2.5';
  cols[57] = 'https://example.com/story';
  for (const [k, v] of Object.entries(overrides)) cols[Number(k)] = v;
  return cols.join('\t');
}

describe("parseGdeltLine", () => {
  it("extracts the relevant columns from a row", () => {
    const event = parseGdeltLine(buildRow());
    expect(event).not.toBeNull();
    expect(event!.globalEventId).toBe('1234567890');
    expect(event!.sqlDate).toBe('2024-03-15');
    expect(event!.actor1Name).toBe('ANGELA MERKEL');
    expect(event!.actor2Name).toBe('EUROPEAN UNION');
    expect(event!.eventCode).toBe('043');
    expect(event!.goldsteinScale).toBe(5);
    expect(event!.avgTone).toBe(2.5);
    expect(event!.sourceUrl).toBe('https://example.com/story');
  });

  it("returns null on rows with too few columns", () => {
    expect(parseGdeltLine('a\tb\tc')).toBeNull();
  });

  it("returns null on rows with a malformed date", () => {
    expect(parseGdeltLine(buildRow({ 1: 'XXXXXXXX' }))).toBeNull();
  });
});

describe("normalizeForGdeltMatch", () => {
  it("folds accents and uppercases, keeping only letter tokens", () => {
    expect(normalizeForGdeltMatch('Angela Merkel')).toEqual(['ANGELA', 'MERKEL']);
    expect(normalizeForGdeltMatch('José Manuel Barroso')).toEqual(['JOSE', 'MANUEL', 'BARROSO']);
  });

  it("filters out short tokens", () => {
    expect(normalizeForGdeltMatch('Le Pen')).toEqual(['PEN']);
  });
});

describe("matchesPolitician", () => {
  it("matches when all tokens are present as whole words", () => {
    expect(matchesPolitician('ANGELA MERKEL', ['ANGELA', 'MERKEL'])).toBe(true);
    expect(matchesPolitician('FORMER CHANCELLOR ANGELA MERKEL OF GERMANY', ['ANGELA', 'MERKEL'])).toBe(true);
  });

  it("rejects partial-word matches", () => {
    // "MERKE" should NOT match "MERKEL"
    expect(matchesPolitician('ANGELA MERKE', ['ANGELA', 'MERKEL'])).toBe(false);
    // Substring containment must not match
    expect(matchesPolitician('MERKELHOF SOLUTIONS', ['MERKEL'])).toBe(false);
  });

  it("rejects when only some tokens match", () => {
    expect(matchesPolitician('ANGELA SMITH', ['ANGELA', 'MERKEL'])).toBe(false);
  });

  it("returns false for null/empty inputs", () => {
    expect(matchesPolitician(null, ['ANGELA', 'MERKEL'])).toBe(false);
    expect(matchesPolitician('ANGELA MERKEL', [])).toBe(false);
  });
});

describe("mapEventCodeToType", () => {
  it("maps CAMEO 04x to foreign_meeting", () => {
    expect(mapEventCodeToType('043')).toBe('foreign_meeting');
    expect(mapEventCodeToType('045')).toBe('foreign_meeting');
  });

  it("maps CAMEO 01x to public_statement", () => {
    expect(mapEventCodeToType('010')).toBe('public_statement');
  });

  it("falls back to media_appearance", () => {
    expect(mapEventCodeToType(null)).toBe('media_appearance');
    expect(mapEventCodeToType('999')).toBe('media_appearance');
  });
});
