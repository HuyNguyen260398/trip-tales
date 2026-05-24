/**
 * Output container/codec candidates in preference order. Safari historically
 * records MP4/H.264; Chromium prefers WebM. We try MP4 first for portability,
 * then fall back.
 */
export const CANDIDATE_MIMES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

/** First MediaRecorder mime the runtime supports, or null if none/no recorder. */
export function pickRecorderMime(): string | null {
  const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== "function") return null;
  for (const mime of CANDIDATE_MIMES) {
    if (MR.isTypeSupported(mime)) return mime;
  }
  return null;
}

/** File extension for a chosen mime. */
export function extForMime(mime: string): string {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}
