"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TripList from "@/components/TripList";
import TripForm from "@/components/TripForm";
import { createTrip } from "@/lib/trips";
import { requestPersistentStorage } from "@/lib/storage";

export default function Home() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    requestPersistentStorage();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] lg:max-w-4xl">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Triptales</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-neutral-950"
        >
          {creating ? "Cancel" : "New trip"}
        </button>
      </header>

      {creating && (
        <TripForm
          submitLabel="Create trip"
          onSubmit={async (values) => {
            const trip = await createTrip(values);
            setCreating(false);
            router.push(`/trip?id=${trip.id}`);
          }}
        />
      )}

      <TripList />
    </main>
  );
}
