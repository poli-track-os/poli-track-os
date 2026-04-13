import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Proposals from "@/pages/Proposals";

const useProposalsMock = vi.fn();
const useProposalStatsMock = vi.fn();

vi.mock("@/hooks/use-proposals", () => ({
  useProposals: (filters: unknown) => useProposalsMock(filters),
  useProposalStats: () => useProposalStatsMock(),
  statusLabels: {
    adopted: "ADOPTED",
    pending_vote: "PENDING VOTE",
  },
  statusColors: {
    adopted: "bg-green-500/10",
    pending_vote: "bg-destructive/10",
  },
}));

describe("Proposals page", () => {
  beforeEach(() => {
    useProposalsMock.mockReset();
    useProposalStatsMock.mockReset();

    useProposalsMock.mockReturnValue({
      data: [
        {
          id: "proposal-1",
          title: "Energy Transition Package",
          official_title: "Energy Transition Package",
          status: "adopted",
          proposal_type: "directive",
          jurisdiction: "eu",
          country_code: "DE",
          country_name: "Germany",
          vote_date: null,
          submitted_date: "2026-04-11",
          sponsors: ["Bundestag"],
          affected_laws: [],
          evidence_count: 3,
          summary: "Summary",
          policy_area: "energy",
          source_url: null,
          created_at: "2026-04-11T00:00:00Z",
          updated_at: "2026-04-11T00:00:00Z",
        },
      ],
      isLoading: false,
    });

    useProposalStatsMock.mockReturnValue({
      data: {
        total: 1,
        byCountry: [{ code: "DE", name: "Germany", count: 1 }],
        byStatus: [{ name: "adopted", count: 1 }],
        byArea: [{ name: "energy", count: 1 }],
      },
    });
  });

  it("hydrates filter state from the URL before querying", () => {
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={["/proposals?country=DE&status=adopted&area=energy"]}
      >
        <Routes>
          <Route path="/proposals" element={<Proposals />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(useProposalsMock).toHaveBeenCalledWith({
      countryCode: "DE",
      status: "adopted",
      policyArea: "energy",
    });

    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects[0].value).toBe("DE");
    expect(selects[1].value).toBe("adopted");
    expect(selects[2].value).toBe("energy");
    expect(screen.getAllByText("Energy Transition Package")).toHaveLength(2);
  });
});
