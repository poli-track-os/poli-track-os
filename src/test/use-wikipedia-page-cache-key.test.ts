import { describe, expect, it } from "vitest";
import { deriveNameFromWikipediaUrl } from "../lib/person-display";

// The cache key for useWikipediaPageSummary is now the canonical
// title returned by deriveNameFromWikipediaUrl, not the raw URL.
// All URL variations of the same Wikipedia page must resolve to the
// SAME title so React Query collapses them into one cache entry.

describe("useWikipediaPageSummary cache key — URL variations collapse to one title", () => {
  it("underscore vs space encoding yields the same title", () => {
    const a = deriveNameFromWikipediaUrl("https://en.wikipedia.org/wiki/Angela_Merkel");
    const b = deriveNameFromWikipediaUrl("https://en.wikipedia.org/wiki/Angela%20Merkel");
    expect(a).toBe(b);
    expect(a).toBe("Angela Merkel");
  });

  it("trailing query string does not change the title", () => {
    const a = deriveNameFromWikipediaUrl("https://en.wikipedia.org/wiki/Angela_Merkel");
    const b = deriveNameFromWikipediaUrl("https://en.wikipedia.org/wiki/Angela_Merkel?foo=bar");
    expect(a).toBe(b);
  });

  it("trailing hash does not change the title", () => {
    const a = deriveNameFromWikipediaUrl("https://en.wikipedia.org/wiki/Angela_Merkel");
    const b = deriveNameFromWikipediaUrl("https://en.wikipedia.org/wiki/Angela_Merkel#early-life");
    expect(a).toBe(b);
  });

  it("invalid URL returns undefined", () => {
    expect(deriveNameFromWikipediaUrl("not a url")).toBeUndefined();
  });
});
