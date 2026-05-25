"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { mediaByDay } from "@/lib/media";
import { buildStoryboard, DEFAULT_REEL_OPTS } from "@/lib/reel/storyboard";
import { renderReel, CodecUnsupportedError } from "@/lib/reel/recorder";
import { extForMime } from "@/lib/reel/codec";
import { saveReel, getReelForDay } from "@/lib/reels";
import { objectUrl } from "@/lib/opfs";
import { TRACKS } from "@/lib/music";

type Status = "idle" | "rendering" | "error";

export default function ReelBuilder({ tripId, dayKey }: { tripId: string; dayKey: string }) {
  const groups = useLiveQuery(() => mediaByDay(tripId), [tripId]);
  const existing = useLiveQuery(() => getReelForDay(tripId, dayKey), [tripId, dayKey]);
  const [musicId, setMusicId] = useState(TRACKS[0]?.id ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const day = groups?.find((g) => g.dayKey === dayKey);
  const photoCount = day?.items.filter((m) => m.type === "photo").length ?? 0;

  useEffect(() => {
    if (!existing) return;
    console.log("[ReelBuilder] existing reel updated — musicId:", existing.musicId, "opfsPath:", existing.opfsPath);
    let u: string | null = null;
    objectUrl(existing.opfsPath).then((x) => { u = x; setPreviewUrl(x); });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [existing]);

  async function handleRender() {
    if (!day) return;
    const track = TRACKS.find((t) => t.id === musicId);
    if (!track) return;
    console.log("[ReelBuilder] handleRender — musicId:", musicId, "track.src:", track.src);
    setStatus("rendering");
    setError(null);
    try {
      const segs = buildStoryboard(day.items, DEFAULT_REEL_OPTS);
      const { blob, mime, durationSec } = await renderReel(segs, track.src);
      await saveReel({ tripId, dayKey, musicId, durationSec, blob, ext: extForMime(mime) });
      setStatus("idle");
    } catch (e) {
      console.error("Reel render error:", e);
      setStatus("error");
      setError(e instanceof CodecUnsupportedError
        ? "Your browser can't record video. Try Safari or Chrome."
        : "Reel render failed. Try fewer photos.");
    }
  }

  async function handleShare() {
    if (!existing) return;
    const blob = await (await fetch(previewUrl!)).blob();
    const file = new File([blob], `${dayKey}.${extForMime(blob.type || "video/mp4")}`, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Triptales — ${dayKey}` });
    } else {
      const a = document.createElement("a");
      a.href = previewUrl!;
      a.download = file.name;
      a.click();
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex flex-col gap-4 lg:w-72 lg:shrink-0">
        <p className="text-sm text-neutral-400">{photoCount} photo{photoCount !== 1 ? "s" : ""} this day</p>

        <label className="flex flex-col gap-1 text-sm">
          Music
          <select value={musicId} onChange={(e) => setMusicId(e.target.value)}
            className="rounded-lg bg-neutral-900 p-3">
            {TRACKS.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>

        <button onClick={handleRender} disabled={status === "rendering" || photoCount === 0}
          className="rounded-xl bg-white p-3 font-medium text-neutral-950 disabled:opacity-40">
          {status === "rendering" ? "Rendering…" : existing ? "Re-render reel" : "Make reel"}
        </button>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {previewUrl && (
        <div className="flex flex-1 flex-col gap-2">
          <video src={previewUrl} controls playsInline className="w-full rounded-xl bg-black" />
          <button onClick={handleShare} className="rounded-xl bg-neutral-800 p-3 text-sm">
            Share / download
          </button>
        </div>
      )}
    </div>
  );
}
