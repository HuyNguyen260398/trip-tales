import { describe, it, expect } from "vitest";
import { dayKeyFromEpoch } from "./dayKey";

describe("dayKeyFromEpoch", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    // Build an epoch from explicit local components to stay TZ-independent.
    const ms = new Date(2026, 3, 7, 10, 30).getTime(); // 2026-04-07 local
    expect(dayKeyFromEpoch(ms)).toBe("2026-04-07");
  });

  it("zero-pads month and day", () => {
    const ms = new Date(2026, 0, 3, 0, 0).getTime(); // 2026-01-03 local
    expect(dayKeyFromEpoch(ms)).toBe("2026-01-03");
  });

  it("uses local time, not UTC, for a late-evening timestamp", () => {
    const ms = new Date(2026, 5, 15, 23, 59).getTime(); // local June 15
    expect(dayKeyFromEpoch(ms)).toBe("2026-06-15");
  });
});
