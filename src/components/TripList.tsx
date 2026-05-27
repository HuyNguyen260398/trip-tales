"use client";

import Link from "next/link";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { listTrips } from "@/lib/trips";
import { Spinner, EmptyState } from "./states";

export default function TripList() {
  const trips = useLiveQuery(() => listTrips(), []);

  if (trips === undefined) return <Spinner />;
  if (trips.length === 0) {
    return <EmptyState title="No trips yet" hint="Create your first one." />;
  }

  return (
    // Single column on phones; 2–3 columns as the viewport widens (desktop shell).
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {trips.map((t) => (
        <li key={t.id}>
          <Link
            href={`/trip?id=${t.id}`}
            className="block h-full rounded-xl bg-neutral-900 p-4 hover:bg-neutral-800 active:bg-neutral-800"
          >
            <span className="font-medium">{t.name}</span>
            <span className="block text-sm text-neutral-500">
              {t.startDate} → {t.endDate}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
