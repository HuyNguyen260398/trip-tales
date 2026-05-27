export interface Track {
  id: string;
  title: string;
  /** public path served statically. */
  src: string;
}

export const TRACKS: Track[] = [
  { id: "sunrise", title: "Sunrise", src: "/music/sunrise.wav" },
  { id: "wander", title: "Wander", src: "/music/wander.wav" },
  { id: "drift", title: "Drift", src: "/music/drift.wav" },
  { id: "pulse", title: "Pulse", src: "/music/pulse.wav" },
  { id: "glow", title: "Glow", src: "/music/glow.wav" },
];

export function getTrack(id: string): Track | undefined {
  return TRACKS.find((t) => t.id === id);
}
