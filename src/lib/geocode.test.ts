import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "./db";
import { reverseGeocodeCached, geoKey } from "./geocache";

beforeEach(async () => {
  await db.geocache.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("geoKey", () => {
  it("rounds coordinates to ~100m so nearby points share a cache entry", () => {
    expect(geoKey(35.681236, 139.767125)).toBe(geoKey(35.681244, 139.767180));
  });
});

describe("reverseGeocodeCached", () => {
  it("calls Nominatim once then serves from cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ address: { city: "Tokyo", country: "Japan" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const a = await reverseGeocodeCached(35.68, 139.76);
    const b = await reverseGeocodeCached(35.68, 139.76);

    expect(a).toBe("Tokyo, Japan");
    expect(b).toBe("Tokyo, Japan");
    expect(fetchMock).toHaveBeenCalledTimes(1); // second hit was cached
  });

  it("returns null on network failure (caller falls back to manual name)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await reverseGeocodeCached(1, 2)).toBeNull();
  });
});
