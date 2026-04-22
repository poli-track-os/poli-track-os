import { describe, expect, it } from "vitest";
import { slugifyPartyName } from "../lib/party-summary";

describe("slugifyPartyName — NFD normalization", () => {
  it("folds umlauts to their base letters", () => {
    expect(slugifyPartyName("Bündnis 90/Die Grünen")).toBe("bundnis-90-die-grunen");
  });

  it("folds accents", () => {
    expect(slugifyPartyName("Bloc Québécois")).toBe("bloc-quebecois");
  });

  it("preserves ASCII parties unchanged", () => {
    expect(slugifyPartyName("Labour Party")).toBe("labour-party");
    expect(slugifyPartyName("PVV")).toBe("pvv");
  });

  it("strips punctuation", () => {
    expect(slugifyPartyName("P.S.D.")).toBe("p-s-d");
  });

  it("collapses whitespace", () => {
    expect(slugifyPartyName("  Front   National  ")).toBe("front-national");
  });
});
