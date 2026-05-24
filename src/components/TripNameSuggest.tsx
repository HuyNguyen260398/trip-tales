"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { listMediaByTrip } from "@/lib/media";
import { centroid } from "@/lib/cluster";
import { reverseGeocodeCached } from "@/lib/geocache";
import { updateTrip } from "@/lib/trips";

export default function TripNameSuggest({ tripId }: { tripId: string }) {
  const media = useLiveQuery(() => listMediaByTrip(tripId), [tripId]);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    if (!media) return;
    const c = centroid(media);
    let cancelled = false;
    Promise.resolve(c ? reverseGeocodeCached(c.lat, c.lng) : null).then((label) => {
      if (!cancelled) setSuggestion(label);
    });
    return () => { cancelled = true; };
  }, [media]);

  if (!suggestion) return null;

  return (
    <div className="flex items-center justify-between rounded-xl bg-neutral-900 p-3 text-sm">
      <span className="text-neutral-400">Looks like <b className="text-neutral-100">{suggestion}</b></span>
      <button
        onClick={() => updateTrip(tripId, { location: suggestion, name: suggestion })}
        className="rounded-lg bg-white px-3 py-1.5 font-medium text-neutral-950"
      >
        Use as name
      </button>
    </div>
  );
}
