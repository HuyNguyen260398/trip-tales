import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegSingleton: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

/** Lazily load ffmpeg.wasm. Picks the threaded core only when cross-origin isolated. */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (!loadingPromise) {
    loadingPromise = (async () => {
      const ff = new FFmpeg();
      const mt = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
      const base = mt
        ? "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm"
        : "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      await ff.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
        ...(mt
          ? { workerURL: await toBlobURL(`${base}/ffmpeg-core.worker.js`, "text/javascript") }
          : {}),
      });
      ffmpegSingleton = ff;
      return ff;
    })();
  }
  return loadingPromise;
}

/** Trim a clip to `trimSec`, normalize to `width×height` portrait canvas and a common codec. */
export async function trimAndNormalize(
  ff: FFmpeg,
  input: Blob,
  outName: string,
  trimSec: number,
  height: number,
  width: number
): Promise<string> {
  const inName = `in_${outName}`;
  await ff.writeFile(inName, await fetchFile(input));
  try {
    const code = await ff.exec([
      "-i", inName,
      "-t", String(trimSec),
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=30,setsar=1`,
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
      "-an", // strip clip audio; music is added at the end
      outName,
    ]);
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
  } finally {
    try { await ff.deleteFile(inName); } catch { /* best-effort */ }
  }
  return outName;
}

/** Concatenate normalized parts (same codec/resolution) into one silent video. */
export async function concatParts(ff: FFmpeg, parts: string[], out: string): Promise<string> {
  const list = parts.map((p) => `file '${p}'`).join("\n");
  await ff.writeFile("concat.txt", new TextEncoder().encode(list));
  try {
    const code = await ff.exec(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", out]);
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
  } finally {
    try { await ff.deleteFile("concat.txt"); } catch { /* best-effort */ }
  }
  return out;
}

/** Mux a music track over the (silent) concatenated video, ending at video length. */
export async function muxAudio(ff: FFmpeg, video: string, music: Blob, out: string): Promise<Blob> {
  await ff.writeFile("music.bin", await fetchFile(music));
  let blob: Blob;
  try {
    const code = await ff.exec([
      "-i", video, "-i", "music.bin",
      "-c:v", "copy", "-c:a", "aac", "-shortest",
      "-map", "0:v:0", "-map", "1:a:0",
      out,
    ]);
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
    const data = await ff.readFile(out);
    if (typeof data === "string") throw new Error("ffmpeg readFile returned string for binary output");
    blob = new Blob([(data.buffer as ArrayBuffer).slice(0)], { type: "video/mp4" });
  } finally {
    try { await ff.deleteFile("music.bin"); } catch { /* best-effort */ }
    try { await ff.deleteFile(out); } catch { /* best-effort */ }
  }
  return blob;
}
