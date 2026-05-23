"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { getTrip, updateTrip, deleteTrip } from "@/lib/trips";
import TripForm from "@/components/TripForm";

function TripDetail() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const trip = useLiveQuery(() => (id ? getTrip(id) : undefined), [id]);
  const [editing, setEditing] = useState(false);

  if (!id) return <p className="text-neutral-500">No trip selected.</p>;
  if (trip === undefined) return <p className="text-neutral-500">Loading…</p>;
  if (trip === null || !trip) return <p className="text-neutral-500">Trip not found.</p>;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] lg:max-w-4xl">
      <button onClick={() => router.push("/")} className="self-start text-sm text-neutral-400">
        ← All trips
      </button>

      {editing ? (
        <TripForm
          initial={trip}
          submitLabel="Save changes"
          onSubmit={async (values) => {
            await updateTrip(trip.id, values);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <h1 className="text-2xl font-semibold">{trip.name}</h1>
          <p className="text-neutral-500">{trip.startDate} → {trip.endDate}</p>
          {/* Day timeline + import land here in M2; map link in M3. */}
          <div className="mt-2 flex gap-2">
            <button onClick={() => setEditing(true)} className="rounded-xl bg-neutral-800 px-4 py-2 text-sm">
              Edit
            </button>
            <button
              onClick={async () => {
                if (confirm(`Delete "${trip.name}"? This removes its media too.`)) {
                  await deleteTrip(trip.id);
                  router.push("/");
                }
              }}
              className="rounded-xl bg-red-900/60 px-4 py-2 text-sm text-red-100"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </main>
  );
}

export default function TripPage() {
  return (
    <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}>
      <TripDetail />
    </Suspense>
  );
}
