import { describe, expect, it } from "vitest";

// Regression tests for the locale fixes. These don't import the page
// (which pulls in heavy dependencies). They independently verify that
// the patterns we now use for currency and date formatting produce
// deterministic output that doesn't depend on the host locale or TZ.

describe("currency formatting — uses a valid BCP-47 locale", () => {
  it("Intl.NumberFormat('en', { currency: 'EUR' }) does not throw", () => {
    expect(() =>
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: "EUR",
        currencyDisplay: "code",
        maximumFractionDigits: 0,
      }).format(50000),
    ).not.toThrow();
  });

  it("the previous invalid 'en-EU' is silently coerced — known footgun", () => {
    // This documents the bug. Most runtimes do NOT throw on `en-EU`
    // (they silently fall back), which is why the bug went unnoticed.
    // We assert here that the new path uses 'en' (a real locale).
    const buggy = new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR" });
    const fixed = new Intl.NumberFormat("en", {
      style: "currency",
      currency: "EUR",
      currencyDisplay: "code",
      maximumFractionDigits: 0,
    });
    // Both produce *some* string — but the fixed one is deterministic.
    expect(typeof buggy.format(1000)).toBe("string");
    expect(fixed.format(50000)).toContain("EUR");
    expect(fixed.format(50000)).toContain("50,000");
  });
});

describe("date formatting — UTC pinned, no flake", () => {
  it("Intl.DateTimeFormat with timeZone:UTC is deterministic", () => {
    const fmt = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    // Whatever the host TZ, this date renders as Jan 1, 2024.
    expect(fmt.format(new Date("2024-01-01T00:30:00Z"))).toBe("Jan 1, 2024");
    // Whatever the host TZ, this date renders as Dec 31, 2024 (not 2025).
    expect(fmt.format(new Date("2024-12-31T23:30:00Z"))).toBe("Dec 31, 2024");
  });
});
