import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "./db";
import { saveReel, listReelsByTrip, getReelForDay } from "./reels";

beforeEach(async () => {
  await db.reels.clear();
});

const writeBlob = vi.fn(async (path: string) => path);

describe("saveReel", () => {
  it("writes the blob to OPFS and stores a reel record", async () => {
    const blob = new Blob(["x"], { type: "video/mp4" });
    const reel = await saveReel(
      { tripId: "t", dayKey: "2026-04-07", musicId: "sunrise", durationSec: 8, blob, ext: "mp4" },
      { writeBlob }
    );
    expect(writeBlob).toHaveBeenCalledOnce();
    expect(reel.opfsPath).toMatch(/\.mp4$/);
    expect(await getReelForDay("t", "2026-04-07")).toMatchObject({ musicId: "sunrise" });
  });

  it("replaces an existing reel for the same day", async () => {
    const mk = (music: string) => ({
      tripId: "t", dayKey: "2026-04-07", musicId: music, durationSec: 8,
      blob: new Blob(["x"]), ext: "mp4",
    });
    await saveReel(mk("a"), { writeBlob });
    await saveReel(mk("b"), { writeBlob });
    const reels = await listReelsByTrip("t");
    expect(reels).toHaveLength(1);
    expect(reels[0].musicId).toBe("b");
  });
});
