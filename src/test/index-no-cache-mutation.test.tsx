import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import Index from "../pages/Index";

// Mock the hooks so we can pass a controlled, frozen array reference and
// observe whether the page mutates it. Object.freeze is the strongest
// possible assertion: any in-place .sort() will throw a TypeError.

vi.mock("@/hooks/use-politicians", () => {
  const countryStats = Object.freeze([
    Object.freeze({ code: "DE", name: "Germany", continent: "Europe", actorCount: 80, parties: ["A", "B"], partyCount: 2 }),
    Object.freeze({ code: "FR", name: "France",  continent: "Europe", actorCount: 50, parties: ["C"],     partyCount: 1 }),
    Object.freeze({ code: "ES", name: "Spain",   continent: "Europe", actorCount: 30, parties: ["D"],     partyCount: 1 }),
    Object.freeze({ code: "IT", name: "Italy",   continent: "Europe", actorCount: 60, parties: ["E", "F"], partyCount: 2 }),
  ]);
  return {
    usePoliticians: () => ({ data: [] }),
    useCountryStats: () => ({ data: countryStats }),
  };
});

vi.mock("@/hooks/use-proposals", () => ({
  useProposals: () => ({ data: [] }),
  useProposalTotalCount: () => ({ data: 0 }),
}));

vi.mock("@/components/SiteHeader", () => ({ default: () => null }));
vi.mock("@/components/SiteFooter", () => ({ default: () => null }));
vi.mock("@/components/SearchBar", () => ({ default: () => null }));
vi.mock("@/components/ActorCard", () => ({ default: () => null }));

describe("Index page does not mutate the React Query cache reference", () => {
  it("renders without throwing on a frozen countryStats array", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    expect(() =>
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Index />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    ).not.toThrow();

    // Wait one tick to make sure useMemo evaluated.
    await waitFor(() => {
      expect(true).toBe(true);
    });
  });
});
