import { describe, expect, it } from "vitest";
import {
  committeeKeyFor,
  type Politician,
} from "../../supabase/functions/seed-associations/parsers";

const make = (overrides: Partial<Politician>): Politician => ({
  id: "p",
  country_code: "DE",
  data_source: null,
  jurisdiction: null,
  party_abbreviation: null,
  party_name: null,
  committees: null,
  ...overrides,
});

describe("committeeKeyFor — country-scoped for national MPs, global for MEPs", () => {
  it("scopes Bundestag committees by country", () => {
    const bundestagMember = make({ country_code: "DE", data_source: "parliamentary_record" });
    expect(committeeKeyFor(bundestagMember, "Committee on Foreign Affairs")).toBe(
      "DE|committee on foreign affairs",
    );
  });

  it("scopes UK national committees by country", () => {
    const ukMember = make({ country_code: "GB", data_source: "parliamentary_record" });
    expect(committeeKeyFor(ukMember, "Committee on Foreign Affairs")).toBe(
      "GB|committee on foreign affairs",
    );
  });

  it("uses the global EU key for MEPs", () => {
    const mep = make({ country_code: "DE", data_source: "eu_parliament" });
    expect(committeeKeyFor(mep, "Committee on Foreign Affairs")).toBe(
      "eu|committee on foreign affairs",
    );
  });

  it("recognizes EU jurisdiction even without eu_parliament data_source", () => {
    const meplike = make({ country_code: "FR", jurisdiction: "eu" });
    expect(committeeKeyFor(meplike, "Subcommittee on Security and Defence")).toBe(
      "eu|subcommittee on security and defence",
    );
  });

  it("does NOT pair a Bundestag member with a UK MP for an English-translated committee", () => {
    const bundestag = make({ country_code: "DE", data_source: "parliamentary_record" });
    const uk = make({ country_code: "GB", data_source: "parliamentary_record" });
    expect(committeeKeyFor(bundestag, "Foreign Affairs Committee")).not.toBe(
      committeeKeyFor(uk, "Foreign Affairs Committee"),
    );
  });

  it("DOES pair two MEPs from different countries on the same EP committee", () => {
    const germanMep = make({ country_code: "DE", data_source: "eu_parliament" });
    const frenchMep = make({ country_code: "FR", data_source: "eu_parliament" });
    expect(committeeKeyFor(germanMep, "Committee on Foreign Affairs")).toBe(
      committeeKeyFor(frenchMep, "Committee on Foreign Affairs"),
    );
  });
});
