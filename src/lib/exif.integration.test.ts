// Integration test: exercises the REAL `exifr` library (no mock) to prove that
// parseExif actually extracts GPS. The unit test in exif.test.ts mocks exifr and
// therefore cannot catch wrong exifr options (e.g. GPS never being requested).
import { describe, it, expect } from "vitest";
import { parseExif } from "./exif";
import { gpsJpegBytes } from "../test/gpsImage";

describe("parseExif (real exifr)", () => {
  it("extracts GPS latitude/longitude from a geo-tagged image", async () => {
    const file = new File([gpsJpegBytes()], "photo.jpg", { type: "image/jpeg" });
    const r = await parseExif(file);
    expect(r.lat).toBeCloseTo(35.0, 5);
    expect(r.lng).toBeCloseTo(139.0, 5);
  });

  it("also extracts the capture date from the same image", async () => {
    const file = new File([gpsJpegBytes()], "photo.jpg", { type: "image/jpeg" });
    const r = await parseExif(file);
    expect(r.takenAt).toBeDefined();
  });
});
