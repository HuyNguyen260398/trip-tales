import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegSingleton: FFmpeg | null = null;

/** Lazily load ffmpeg.wasm. Picks the threaded core only when cross-origin isolated. */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
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
}

/** Trim a clip to `trimSec`, normalize to `height` and a common codec. */
export async function trimAndNormalize(
  ff: FFmpeg,
  input: Blob,
  outName: string,
  trimSec: number,
  height: number
): Promise<string> {
  const inName = `in_${outName}`;
  await ff.writeFile(inName, await fetchFile(input));
  await ff.exec([
    "-i", inName,
    "-t", String(trimSec),
    "-vf", `scale=-2:${height},fps=30,setsar=1`,
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-an", // strip clip audio; music is added at the end
    outName,
  ]);
  await ff.deleteFile(inName);
  return outName;
}

/** Concatenate normalized parts (same codec/resolution) into one silent video. */
export async function concatParts(ff: FFmpeg, parts: string[], out: string): Promise<string> {
  const list = parts.map((p) => `file '${p}'`).join("\n");
  await ff.writeFile("concat.txt", new TextEncoder().encode(list));
  await ff.exec(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", out]);
  return out;
}

/** Mux a music track over the (silent) concatenated video, ending at video length. */
export async function muxAudio(ff: FFmpeg, video: string, music: Blob, out: string): Promise<Blob> {
  await ff.writeFile("music.mp3", await fetchFile(music));
  await ff.exec([
    "-i", video, "-i", "music.mp3",
    "-c:v", "copy", "-c:a", "aac", "-shortest",
    "-map", "0:v:0", "-map", "1:a:0",
    out,
  ]);
  const data = await ff.readFile(out);
  // readFile returns FileData = Uint8Array | string; for binary output it is always Uint8Array.
  // Slice to a plain ArrayBuffer so TypeScript is satisfied (SharedArrayBuffer is not a BlobPart).
  const ab: ArrayBuffer =
    typeof data === "string"
      ? new TextEncoder().encode(data).buffer
      : (data.buffer as ArrayBuffer).slice(0);
  return new Blob([ab], { type: "video/mp4" });
}
