import type { Media } from "../types";
import { buildStoryboard, DEFAULT_REEL_OPTS, storyboardDuration } from "./storyboard";
import { createCanvasRender } from "./canvasRenderer";
import { pickRecorderMime } from "./codec";
import { CodecUnsupportedError } from "./recorder";
import { buildConcatPlan, type VideoReelOptions } from "./concatPlan";
import { getFFmpeg, trimAndNormalize, concatParts, muxAudio } from "./ffmpeg";
import { readBlob } from "../opfs";

/** Record the photo slideshow as a silent video blob (audio added later by mux). */
async function renderSilentPhotos(media: Media[]): Promise<Blob | null> {
  const segs = buildStoryboard(media, DEFAULT_REEL_OPTS);
  if (segs.length === 0) return null;
  const mime = pickRecorderMime();
  if (!mime) throw new CodecUnsupportedError();

  const render = await createCanvasRender(segs);
  const stream = render.canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((res) => (recorder.onstop = () => res(new Blob(chunks, { type: mime }))));
  recorder.start();
  await render.play();
  recorder.stop();
  return await done;
}

export interface VideoReelResult {
  blob: Blob;
  durationSec: number;
}

/**
 * Build a reel that includes both photos and video clips:
 * render photos → trim/normalize clips → concat [photos, ...clips] → mux music.
 */
export async function renderVideoReel(
  media: Media[],
  musicSrc: string,
  opts: VideoReelOptions
): Promise<VideoReelResult> {
  const plan = buildConcatPlan(media, opts);
  const ff = await getFFmpeg();

  // Fix 3: hoist storyboard computation once to avoid duplicate work.
  const storyboard = buildStoryboard(media, DEFAULT_REEL_OPTS);
  const photoDurationSec = storyboardDuration(storyboard);

  const parts: string[] = [];
  try {
    if (plan.hasPhotos) {
      const photosBlob = await renderSilentPhotos(media);
      if (photosBlob) {
        // Fix 2: pass "photos.mp4" as outName; ffmpeg detects the actual container
        // format from content headers rather than the filename, so WebM bytes written
        // as "in_photos.mp4" are still demuxed correctly.
        const norm = await trimAndNormalize(ff, photosBlob, "photos.mp4", photoDurationSec, plan.maxHeight);
        parts.push(norm);
      }
    }

    for (let i = 0; i < plan.clips.length; i++) {
      const clip = plan.clips[i];
      const blob = await readBlob(clip.opfsPath);
      parts.push(await trimAndNormalize(ff, blob, `clip${i}.mp4`, clip.trimSec, plan.maxHeight));
    }

    // Fix 4: guard against nothing to render.
    if (parts.length === 0) throw new Error("No renderable content");

    const concatenated = await concatParts(ff, parts, "concat.mp4");
    const music = await fetch(musicSrc).then((r) => r.blob());
    const blob = await muxAudio(ff, concatenated, music, "reel.mp4");

    // Duration ≈ photo slideshow + sum of clip caps.
    const durationSec = (plan.hasPhotos ? photoDurationSec : 0) + plan.clips.reduce((s, c) => s + c.trimSec, 0);
    return { blob, durationSec };
  } finally {
    // Fix 1: cleanup runs on both success and error paths.
    for (const p of [...parts, "concat.mp4", "reel.mp4", "music.mp3"]) {
      await ff.deleteFile(p).catch(() => {});
    }
  }
}
