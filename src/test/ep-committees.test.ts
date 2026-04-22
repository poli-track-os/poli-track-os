import { describe, expect, it } from "vitest";
import {
  resolveEpCommitteeAbbr,
  resolveEpCommitteeUrl,
} from "../lib/ep-committees";

describe("resolveEpCommitteeUrl — canonical committee names", () => {
  it("maps ENVI to the standard URL", () => {
    expect(resolveEpCommitteeUrl("Committee on the Environment, Public Health and Food Safety"))
      .toBe("https://www.europarl.europa.eu/committees/en/envi/home/highlights");
  });

  it("maps the short ENVI variant the MEP homepage exposes", () => {
    expect(resolveEpCommitteeUrl("Committee on the Environment, Climate and Food Safety"))
      .toBe("https://www.europarl.europa.eu/committees/en/envi/home/highlights");
  });

  it("handles Transport and Tourism", () => {
    expect(resolveEpCommitteeUrl("Committee on Transport and Tourism"))
      .toBe("https://www.europarl.europa.eu/committees/en/tran/home/highlights");
  });

  it("handles Civil Liberties", () => {
    expect(resolveEpCommitteeUrl("Committee on Civil Liberties, Justice and Home Affairs"))
      .toBe("https://www.europarl.europa.eu/committees/en/libe/home/highlights");
  });

  it("handles curly apostrophe in Women's Rights", () => {
    expect(resolveEpCommitteeUrl("Committee on Women\u2019s Rights and Gender Equality"))
      .toBe("https://www.europarl.europa.eu/committees/en/femm/home/highlights");
  });
});

describe("resolveEpCommitteeUrl — delegations fall through to the index", () => {
  it("maps Delegation to the EU-Chile Joint Parliamentary Committee to the index", () => {
    const url = resolveEpCommitteeUrl("Delegation to the EU-Chile Joint Parliamentary Committee");
    expect(url).toBe("https://www.europarl.europa.eu/delegations/en/list-delegations/chairs");
  });

  it("maps Delegation for relations with the United States to the index", () => {
    const url = resolveEpCommitteeUrl("Delegation for relations with the United States");
    expect(url).toBe("https://www.europarl.europa.eu/delegations/en/list-delegations/chairs");
  });

  it("maps Euro-Latin American Parliamentary Assembly to the index", () => {
    const url = resolveEpCommitteeUrl("Delegation to the Euro-Latin American Parliamentary Assembly");
    expect(url).toBe("https://www.europarl.europa.eu/delegations/en/list-delegations/chairs");
  });
});

describe("resolveEpCommitteeUrl — unknown names", () => {
  it("returns null for a completely unknown string", () => {
    expect(resolveEpCommitteeUrl("Not a real committee")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(resolveEpCommitteeUrl("")).toBeNull();
  });
});

describe("resolveEpCommitteeAbbr", () => {
  it("returns the 3-letter uppercase abbreviation", () => {
    expect(resolveEpCommitteeAbbr("Committee on Foreign Affairs")).toBe("AFET");
    expect(resolveEpCommitteeAbbr("Committee on Budgets")).toBe("BUDG");
    expect(resolveEpCommitteeAbbr("Committee on Fisheries")).toBe("PECH");
  });

  it("returns null for unknown names", () => {
    expect(resolveEpCommitteeAbbr("Random committee")).toBeNull();
  });
});
