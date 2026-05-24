"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReelBuilder from "@/components/ReelBuilder";

function ReelView() {
  const router = useRouter();
  const params = useSearchParams();
  const tripId = params.get("trip") ?? "";
  const dayKey = params.get("day") ?? "";
  if (!tripId || !dayKey) return <p className="p-6 text-neutral-500">Missing trip or day.</p>;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] lg:max-w-4xl">
      <button onClick={() => router.push(`/trip?id=${tripId}`)} className="self-start text-sm text-neutral-400">
        ← Trip
      </button>
      <h1 className="text-2xl font-semibold">Reel · {dayKey}</h1>
      <ReelBuilder tripId={tripId} dayKey={dayKey} />
    </main>
  );
}

export default function ReelPage() {
  return (
    <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}>
      <ReelView />
    </Suspense>
  );
}
