import { describe, it, expect, vi, beforeEach } from "vitest";

const parse = vi.hoisted(() => vi.fn());
vi.mock("exifr", () => ({ default: { parse }, parse }));

import { parseExif } from "./exif";

beforeEach(() => parse.mockReset());

function fileOf(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("parseExif", () => {
  it("maps DateTimeOriginal + GPS to takenAt/lat/lng", async () => {
    parse.mockResolvedValue({
      DateTimeOriginal: new Date(2026, 3, 7, 9, 0),
      latitude: 35.0,
      longitude: 139.0,
    });
    const r = await parseExif(fileOf("a.jpg", "image/jpeg"));
    expect(r.takenAt).toBe(new Date(2026, 3, 7, 9, 0).getTime());
    expect(r.lat).toBe(35.0);
    expect(r.lng).toBe(139.0);
  });

  it("returns undefined fields when metadata is missing (stripped HEIC→JPEG)", async () => {
    parse.mockResolvedValue({});
    const r = await parseExif(fileOf("b.jpg", "image/jpeg"));
    expect(r.takenAt).toBeUndefined();
    expect(r.lat).toBeUndefined();
    expect(r.lng).toBeUndefined();
  });

  it("never throws — returns empty result if exifr rejects", async () => {
    parse.mockRejectedValueOnce(new Error("bad file"));
    const r = await parseExif(fileOf("c.jpg", "image/jpeg"));
    expect(r).toEqual({});
  });
});
