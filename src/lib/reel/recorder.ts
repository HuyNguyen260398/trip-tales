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

  const render = await createCanvasRender(segs);
  const stream = render.canvas.captureStream(30);
  const audio = await createAudioMix(musicSrc);
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
