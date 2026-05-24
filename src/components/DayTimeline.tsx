"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { mediaByDay } from "@/lib/media";
import MediaThumb from "./MediaThumb";
import MediaEditDialog from "./MediaEditDialog";
import type { Media } from "@/lib/types";

export default function DayTimeline({ tripId }: { tripId: string }) {
  const groups = useLiveQuery(() => mediaByDay(tripId), [tripId]);
  const [editing, setEditing] = useState<Media | null>(null);

  if (groups === undefined) return <p className="text-neutral-500">Loading…</p>;
  if (groups.length === 0) {
    return <p className="text-neutral-500">No media yet. Add some to get started.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.dayKey}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-400">
              {g.dayKey} · {g.items.length} item{g.items.length > 1 ? "s" : ""}
            </h2>
            <Link href={`/reel?trip=${tripId}&day=${g.dayKey}`}
              className="text-xs text-blue-400">Make reel →</Link>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {g.items.map((m) => (
              <button key={m.id} onClick={() => setEditing(m)} className="text-left" aria-label={`Edit ${m.type} from ${m.dayKey}`}>
                <MediaThumb media={m} />
              </button>
            ))}
          </div>
        </section>
      ))}
      {editing && <MediaEditDialog media={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
