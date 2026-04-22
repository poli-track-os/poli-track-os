import { describe, expect, it } from "vitest";
import {
  buildCommitteeSourceUrl,
  mergeCommittees,
  slugifyCommitteeForUrl,
  STABLE_UNKNOWN_TIMESTAMP,
} from "../../supabase/functions/scrape-mep-committees/parsers";

describe("mergeCommittees — preserves existing on transient scrape", () => {
  it("keeps an existing committee that is missing from this run", () => {
    const { merged } = mergeCommittees(
      ["Committee on Foreign Affairs", "Committee on Budgets"],
      ["Committee on Foreign Affairs"], // Budgets dropped from the page this time
    );
    expect(merged).toEqual(["Committee on Foreign Affairs", "Committee on Budgets"]);
  });

  it("adds new memberships to the merged set", () => {
    const { merged, newMemberships } = mergeCommittees(
      ["Committee on Foreign Affairs"],
      ["Committee on Foreign Affairs", "Delegation to the United States"],
    );
    expect(merged).toEqual(["Committee on Foreign Affairs", "Delegation to the United States"]);
    expect(newMemberships).toEqual(["Delegation to the United States"]);
  });

  it("dedupes via case folding", () => {
    const { merged, newMemberships } = mergeCommittees(
      ["committee on Foreign affairs"],
      ["Committee on Foreign Affairs", "Committee on Budgets"],
    );
    // Existing is preserved with its casing; only Budgets is new.
    expect(merged).toEqual(["committee on Foreign affairs", "Committee on Budgets"]);
    expect(newMemberships).toEqual(["Committee on Budgets"]);
  });

  it("handles null/undefined existing", () => {
    expect(mergeCommittees(null, ["A", "B"]).merged).toEqual(["A", "B"]);
    expect(mergeCommittees(undefined, ["A"]).merged).toEqual(["A"]);
  });
});

describe("buildCommitteeSourceUrl — unique per (mep, committee)", () => {
  it("encodes committee into the URL fragment", () => {
    expect(buildCommitteeSourceUrl("12345", "Committee on Foreign Affairs")).toBe(
      "https://www.europarl.europa.eu/meps/en/12345#committee:committee-on-foreign-affairs",
    );
  });

  it("produces a different URL per committee for the same MEP", () => {
    const a = buildCommitteeSourceUrl("12345", "Committee on Budgets");
    const b = buildCommitteeSourceUrl("12345", "Committee on Industry");
    expect(a).not.toBe(b);
  });

  it("is reproducible — same input → same URL", () => {
    expect(buildCommitteeSourceUrl("12345", "Committee on Budgets")).toBe(
      buildCommitteeSourceUrl("12345", "Committee on Budgets"),
    );
  });

  it("slugifies special characters cleanly", () => {
    expect(slugifyCommitteeForUrl("Delegation for relations with the U.S.A.")).toBe(
      "delegation-for-relations-with-the-u-s-a",
    );
  });
});

describe("STABLE_UNKNOWN_TIMESTAMP — idempotency anchor", () => {
  it("is the Unix epoch", () => {
    expect(STABLE_UNKNOWN_TIMESTAMP).toBe("1970-01-01T00:00:00Z");
  });

  it("is referentially stable (no Date.now() leakage)", () => {
    expect(STABLE_UNKNOWN_TIMESTAMP).toBe(STABLE_UNKNOWN_TIMESTAMP);
  });
});
