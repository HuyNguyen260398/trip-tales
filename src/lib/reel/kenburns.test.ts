import { describe, it, expect } from "vitest";
import { kenBurnsScale } from "./kenburns";

describe("kenBurnsScale", () => {
  it("zoom-in starts at 1.0 and ends at the max scale", () => {
    expect(kenBurnsScale(true, 0)).toBeCloseTo(1.0, 5);
    expect(kenBurnsScale(true, 1)).toBeCloseTo(1.12, 5);
  });

  it("zoom-out starts at max scale and ends at 1.0", () => {
    expect(kenBurnsScale(false, 0)).toBeCloseTo(1.12, 5);
    expect(kenBurnsScale(false, 1)).toBeCloseTo(1.0, 5);
  });

  it("is linear at the midpoint", () => {
    expect(kenBurnsScale(true, 0.5)).toBeCloseTo(1.06, 5);
  });

  it("clamps progress outside [0,1]", () => {
    expect(kenBurnsScale(true, -1)).toBeCloseTo(1.0, 5);
    expect(kenBurnsScale(true, 2)).toBeCloseTo(1.12, 5);
  });
});
