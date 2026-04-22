import { describe, expect, it } from "vitest";
import { bucketEventsByMonth, countVotePattern } from "../components/ActorCharts";
import type { ActorEvent } from "../data/domain";

const event = (overrides: Partial<ActorEvent>): ActorEvent => ({
  id: "e1",
  actorId: "a1",
  hash: "h1",
  timestamp: "2024-06-15T12:00:00Z",
  type: "vote",
  title: "",
  description: "",
  evidenceCount: 1,
  ...overrides,
});

describe("bucketEventsByMonth — UTC, not local time", () => {
  it("buckets a UTC-near-midnight event in the correct UTC month", () => {
    // 2024-01-01T00:30:00Z. In US/Pacific (UTC-8) this is 2023-12-31.
    // The previous parser used getMonth() (local) and put this in
    // December 2023. The fix uses getUTCMonth() so it always lands in
    // January 2024 — regardless of the test runner's TZ.
    const events: ActorEvent[] = [event({ timestamp: "2024-01-01T00:30:00Z" })];
    const buckets = bucketEventsByMonth(events);
    expect(buckets).toEqual([{ month: "2024-01", count: 1 }]);
  });

  it("buckets a UTC-near-midnight event in the correct UTC month at the other extreme", () => {
    // 2024-12-31T23:30:00Z. Berlin (UTC+1) sees this as 2025-01-01 00:30
    // local. UTC bucketing must keep it in 2024-12.
    const events: ActorEvent[] = [event({ timestamp: "2024-12-31T23:30:00Z" })];
    expect(bucketEventsByMonth(events)).toEqual([{ month: "2024-12", count: 1 }]);
  });

  it("counts multiple events in the same UTC month", () => {
    const events: ActorEvent[] = [
      event({ timestamp: "2024-06-01T00:00:00Z" }),
      event({ timestamp: "2024-06-30T23:59:59Z" }),
      event({ timestamp: "2024-07-01T00:00:00Z" }),
    ];
    expect(bucketEventsByMonth(events)).toEqual([
      { month: "2024-06", count: 2 },
      { month: "2024-07", count: 1 },
    ]);
  });
});

describe("countVotePattern — word boundaries", () => {
  it("counts YES votes correctly", () => {
    expect(countVotePattern([event({ title: "voted YES on motion X" })])).toEqual([
      { name: "YES", value: 1 },
    ]);
  });

  it("does NOT count YESTERDAY as YES", () => {
    expect(countVotePattern([event({ title: "YESTERDAY voted on motion X" })])).toEqual([]);
  });

  it("does NOT count NOTIFICATION as NO", () => {
    expect(countVotePattern([event({ title: "NOTIFICATION received" })])).toEqual([]);
  });

  it("counts NO and ABSTAIN", () => {
    const events: ActorEvent[] = [
      event({ title: "voted NO on motion Y" }),
      event({ title: "voted to ABSTAIN" }),
    ];
    expect(countVotePattern(events)).toEqual([
      { name: "NO", value: 1 },
      { name: "ABSTAIN", value: 1 },
    ]);
  });

  it("ignores non-vote events", () => {
    const events: ActorEvent[] = [event({ type: "speech", title: "voted YES" })];
    expect(countVotePattern(events)).toEqual([]);
  });
});
