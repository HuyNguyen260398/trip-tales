export interface AudioMix {
  audioTrack: MediaStreamTrack;
  start: () => void;
  stop: () => void;
}

/**
 * Decode a music file and expose it as a MediaStreamTrack to feed into the
 * recorder, plus start/stop controls. The track loops so short songs cover the
 * whole reel.
 *
 * Pass an already-resumed AudioContext so the caller can capture the user-gesture
 * window before any slow async work (OPFS reads, HEIC conversion) expires it.
 */
export async function createAudioMix(src: string, ctx: AudioContext): Promise<AudioMix> {
  console.log("[audioMixer] createAudioMix — fetching:", src);
  const dest = ctx.createMediaStreamDestination();

  let source: AudioBufferSourceNode | null = null;
  try {
    const buf = await fetch(src).then((r) => r.arrayBuffer());
    console.log("[audioMixer] decoded audio buffer, byteLength:", buf.byteLength);
    const audioBuffer = await ctx.decodeAudioData(buf);
    source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    source.connect(dest);
  } catch (e) {
    // Corrupted or missing audio file — reel renders silently rather than failing.
    console.warn("Audio decode failed, reel will have no music:", e);
  }

  return {
    audioTrack: dest.stream.getAudioTracks()[0],
    start: () => { source?.start(); },
    stop: () => {
      try { source?.stop(); } catch { /* already stopped */ }
      ctx.close();
    },
  };
}
