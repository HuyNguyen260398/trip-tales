import type { Segment } from "./storyboard";
import { createCanvasRender } from "./canvasRenderer";
import { createAudioMix } from "./audioMixer";
import { pickRecorderMime } from "./codec";

export interface RenderedReel {
  blob: Blob;
  mime: string;
  durationSec: number;
}

export class CodecUnsupportedError extends Error {
  constructor() {
    super("No supported MediaRecorder video codec on this browser.");
  }
}

/**
 * Render the storyboard to a canvas, capture its stream, mix in music, record
 * with MediaRecorder, and resolve a video blob. Throws CodecUnsupportedError if
 * the browser can't record any candidate format.
 */
export async function renderReel(
  segs: Segment[],
  musicSrc: string
): Promise<RenderedReel> {
  const mime = pickRecorderMime();
  if (!mime) throw new CodecUnsupportedError();

  // Resume AudioContext NOW — before any slow async work — so the user-gesture
  // window (≈1 s on iOS Safari) hasn't expired when audio playback starts.
  const audioCtx = new AudioContext();
  await audioCtx.resume();

  // Load bitmaps and decode audio in parallel — independent I/O, no reason to serial.
  const [render, audio] = await Promise.all([
    createCanvasRender(segs),
    createAudioMix(musicSrc, audioCtx),
  ]);

  const stream = render.canvas.captureStream(30);
  stream.addTrack(audio.audioTrack);

  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  recorder.start();
  audio.start();
  await render.play();
  audio.stop();
  recorder.stop();

  return { blob: await done, mime, durationSec: render.durationSec };
}
