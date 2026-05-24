export interface AudioMix {
  audioTrack: MediaStreamTrack;
  start: () => void;
  stop: () => void;
}

/**
 * Decode a music file and expose it as a MediaStreamTrack to feed into the
 * recorder, plus start/stop controls. The track loops so short songs cover the
 * whole reel.
 */
export async function createAudioMix(src: string): Promise<AudioMix> {
  const ctx = new AudioContext();
  const buf = await fetch(src).then((r) => r.arrayBuffer());
  const audioBuffer = await ctx.decodeAudioData(buf);

  const dest = ctx.createMediaStreamDestination();
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  source.connect(dest);

  return {
    audioTrack: dest.stream.getAudioTracks()[0],
    start: () => {
      ctx.resume();
      source.start();
    },
    stop: () => {
      try { source.stop(); } catch { /* already stopped */ }
      ctx.close();
    },
  };
}
