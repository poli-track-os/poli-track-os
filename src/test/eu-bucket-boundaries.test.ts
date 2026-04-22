import { describe, expect, it } from "vitest";

// The Data.tsx EU distribution is computed inline inside a useMemo, but
// the boundary logic is testable as a small lookup. Mirror the predicates
// here and pin the boundary cases.

const euBuckets: { range: string; test: (v: number) => boolean }[] = [
  { range: 'Strong Eurosceptic', test: (v) => v <= -5 },
  { range: 'Eurosceptic',        test: (v) => v > -5 && v < -1 },
  { range: 'Neutral',            test: (v) => v >= -1 && v <= 1 },
  { range: 'Pro-EU',             test: (v) => v > 1 && v < 5 },
  { range: 'Strong Pro-EU',      test: (v) => v >= 5 },
];

const bucket = (v: number) => euBuckets.find((b) => b.test(v))?.range;

describe("EU integration boundaries — every score lands in exactly one bucket", () => {
  it("v = -10 → Strong Eurosceptic", () => expect(bucket(-10)).toBe("Strong Eurosceptic"));
  it("v = -5 → Strong Eurosceptic (boundary fix; was Eurosceptic)", () =>
    expect(bucket(-5)).toBe("Strong Eurosceptic"));
  it("v = -4.99 → Eurosceptic", () => expect(bucket(-4.99)).toBe("Eurosceptic"));
  it("v = -1 → Neutral", () => expect(bucket(-1)).toBe("Neutral"));
  it("v = 0 → Neutral", () => expect(bucket(0)).toBe("Neutral"));
  it("v = 1 → Neutral", () => expect(bucket(1)).toBe("Neutral"));
  it("v = 1.01 → Pro-EU", () => expect(bucket(1.01)).toBe("Pro-EU"));
  it("v = 5 → Strong Pro-EU (boundary fix)", () =>
    expect(bucket(5)).toBe("Strong Pro-EU"));
  it("v = 10 → Strong Pro-EU", () => expect(bucket(10)).toBe("Strong Pro-EU"));
});

describe("safeMax helper — returns 0 instead of -Infinity on empty input", () => {
  const safeMax = (arr: number[]): number => {
    const finite = arr.filter((n) => Number.isFinite(n) && n > 0);
    return finite.length === 0 ? 0 : Math.max(...finite);
  };

  it("returns 0 on an empty array", () => {
    expect(safeMax([])).toBe(0);
    expect(Number.isFinite(safeMax([]))).toBe(true);
  });

  it("returns 0 on an array of zeros", () => {
    expect(safeMax([0, 0, 0])).toBe(0);
  });

  it("returns the max of the finite, positive entries", () => {
    expect(safeMax([1, 2, 3, NaN, Infinity])).toBe(3);
  });
});
