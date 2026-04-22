import { describe, expect, it } from "vitest";
import {
  buildHydrationPlan,
  type PoliticianRow,
} from "../lib/wikipedia-hydration-helpers";

const baseRow = (overrides: Partial<PoliticianRow>): PoliticianRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  name: "Jane Example",
  source_url: null,
  wikipedia_url: "https://en.wikipedia.org/wiki/Jane_Example",
  wikipedia_summary: null,
  biography: null,
  wikipedia_image_url: null,
  wikipedia_data: null,
  enriched_at: null,
  photo_url: null,
  source_attribution: null,
  ...overrides,
});

const baseSummary = {
  title: "Jane Example",
  extract: "Jane Example is a British politician.",
  description: "British politician",
  originalimage: { source: "https://upload.wikimedia.org/jane.jpg" },
  content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Jane_Example" } },
};

describe("buildHydrationPlan — last_fetched is excluded from change detection", () => {
  it("populates an empty row", () => {
    const plan = buildHydrationPlan(
      baseRow({}),
      "https://en.wikipedia.org/wiki/Jane_Example",
      "https://en.wikipedia.org/wiki/Jane_Example",
      "Jane Example",
      baseSummary,
    );
    expect(plan).not.toBeNull();
    expect(plan!.payload.wikipedia_summary).toContain("Jane Example");
    expect(plan!.payload.biography).toContain("Jane Example");
    expect(plan!.payload.photo_url).toBe("https://upload.wikimedia.org/jane.jpg");
    expect(plan!.payload.wikipedia_data).toBeDefined();
  });

  it("returns null when nothing has changed apart from last_fetched", () => {
    // The "current state" already matches the new summary, so the only
    // difference is the per-run last_fetched. Without the volatile-key
    // strip, we'd write every politician on every run.
    const row = baseRow({
      wikipedia_url: "https://en.wikipedia.org/wiki/Jane_Example",
      wikipedia_summary: "Jane Example is a British politician.",
      biography: "Jane Example is a British politician.",
      wikipedia_image_url: "https://upload.wikimedia.org/jane.jpg",
      photo_url: "https://upload.wikimedia.org/jane.jpg",
      enriched_at: "2026-01-01T00:00:00Z",
      wikipedia_data: {
        title: "Jane Example",
        description: "British politician",
        last_fetched: "2025-12-31T00:00:00Z", // ← stale, would always diff
      },
    });
    const plan = buildHydrationPlan(
      row,
      "https://en.wikipedia.org/wiki/Jane_Example",
      "https://en.wikipedia.org/wiki/Jane_Example",
      "Jane Example",
      baseSummary,
    );
    expect(plan).toBeNull();
  });

  it("does write when wikipedia_data.title actually changed", () => {
    const row = baseRow({
      wikipedia_summary: "Jane Example is a British politician.",
      biography: "Jane Example is a British politician.",
      enriched_at: "2026-01-01T00:00:00Z",
      wikipedia_data: {
        title: "Jane Q. Example", // different title
        description: "British politician",
        last_fetched: "2025-12-31T00:00:00Z",
      },
    });
    const plan = buildHydrationPlan(
      row,
      "https://en.wikipedia.org/wiki/Jane_Example",
      "https://en.wikipedia.org/wiki/Jane_Example",
      "Jane Example",
      baseSummary,
    );
    expect(plan).not.toBeNull();
    expect(plan!.changedFields).toContain("wikipedia_data");
  });
});
