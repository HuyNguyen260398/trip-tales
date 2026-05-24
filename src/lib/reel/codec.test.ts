import { describe, it, expect, vi, afterEach } from "vitest";
import { pickRecorderMime, CANDIDATE_MIMES } from "./codec";

afterEach(() => vi.unstubAllGlobals());

describe("pickRecorderMime", () => {
  it("returns the first supported candidate in priority order", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (t: string) => t === CANDIDATE_MIMES[1],
    });
    expect(pickRecorderMime()).toBe(CANDIDATE_MIMES[1]);
  });

  it("returns null when none are supported", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
    expect(pickRecorderMime()).toBeNull();
  });

  it("returns null when MediaRecorder is unavailable", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(pickRecorderMime()).toBeNull();
  });
});
