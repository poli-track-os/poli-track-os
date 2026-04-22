import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "@/App";
import { THEME_STORAGE_KEY } from "@/hooks/use-theme-mode";

vi.mock("@/hooks/use-politicians", () => ({
  usePoliticians: () => ({
    data: [
      {
        id: "actor-1",
        name: "Ada Lovelace",
        partyId: "party-1",
        party: "IND",
        canton: "Berlin",
        cityId: "city-1",
        countryId: "de",
        role: "MEP",
        jurisdiction: "federal",
        committees: ["Budget"],
        recentVotes: [],
        revisionId: "rev-actor1",
        updatedAt: "2026-04-12T10:00:00Z",
      },
    ],
    isLoading: false,
  }),
  useCountryStats: () => ({
    data: [
      {
        code: "DE",
        name: "Germany",
        continent: "Europe",
        actorCount: 1,
        partyCount: 1,
        parties: ["Independent"],
      },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-proposals", () => ({
  useProposals: () => ({
    data: [
      {
        id: "proposal-1",
        title: "Digital Services Reform",
        official_title: "Digital Services Reform",
        status: "adopted",
        proposal_type: "directive",
        jurisdiction: "eu",
        country_code: "EU",
        country_name: "European Union",
        vote_date: null,
        submitted_date: "2026-04-10",
        sponsors: ["European Commission"],
        affected_laws: [],
        evidence_count: 4,
        summary: "Summary",
        policy_area: "technology",
        source_url: null,
        created_at: "2026-04-10T00:00:00Z",
        updated_at: "2026-04-10T00:00:00Z",
      },
    ],
    isLoading: false,
  }),
  useProposalTotalCount: () => ({
    data: 1,
    isLoading: false,
  }),
}));

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
  });

  it("renders the project shell and primary navigation", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "POLI·TRACK" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HOME" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PROPOSALS" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ACTORS" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "RELATIONSHIPS" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ABOUT" })).toBeInTheDocument();
  });

  it("toggles night mode from the footer switch and persists it", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: "POLI·TRACK" });

    const switchControl = screen.getByRole("switch", { name: "Night mode" });
    expect(switchControl).toHaveAttribute("aria-checked", "false");
    expect(switchControl.closest("footer")).toContainElement(switchControl);

    fireEvent.click(switchControl);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });

    expect(switchControl).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("honors a stored night-mode preference on load", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(<App />);

    await screen.findByRole("heading", { name: "POLI·TRACK" });

    const switchControl = screen.getByRole("switch", { name: "Night mode" });
    expect(switchControl).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
