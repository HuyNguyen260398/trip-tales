export interface Track {
  id: string;
  title: string;
  /** public path served statically. */
  src: string;
}

export const TRACKS: Track[] = [
  { id: "sunrise", title: "Sunrise", src: "/music/sunrise.mp3" },
  { id: "wander", title: "Wander", src: "/music/wander.mp3" },
];

export function getTrack(id: string): Track | undefined {
  return TRACKS.find((t) => t.id === id);
}
