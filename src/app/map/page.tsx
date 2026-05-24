"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PhotoMap from "@/components/PhotoMap";

function MapView() {
  const router = useRouter();
  const tripId = useSearchParams().get("trip") ?? "";
  if (!tripId) return <p className="p-6 text-neutral-500">No trip selected.</p>;

  return (
    // Full-bleed: fills the content region beside the desktop sidebar; on mobile the
    // translucent bottom nav floats over the map's bottom edge (Maps-app style).
    <main className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={() => router.push(`/trip?id=${tripId}`)} className="text-sm text-neutral-400">
          ← Trip
        </button>
        <h1 className="text-lg font-medium">Map</h1>
      </header>
      <div className="flex-1">
        <PhotoMap tripId={tripId} />
      </div>
    </main>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}>
      <MapView />
    </Suspense>
  );
}
