"use client";

import { useState } from "react";
import { updateMedia } from "@/lib/media";
import { dayKeyFromEpoch } from "@/lib/dayKey";
import type { Media } from "@/lib/types";

export default function MediaEditDialog({
  media,
  onClose,
}: {
  media: Media;
  onClose: () => void;
}) {
  const [date, setDate] = useState(dayKeyFromEpoch(media.takenAt));
  const [lat, setLat] = useState(media.lat?.toString() ?? "");
  const [lng, setLng] = useState(media.lng?.toString() ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 lg:items-center lg:justify-center"
      onClick={onClose}
    >
      {/* Bottom sheet on phones; centered modal from lg up. */}
      <div
        className="w-full rounded-t-2xl bg-neutral-900 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:max-w-md lg:rounded-2xl lg:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-medium">Edit metadata</h2>
        <label className="mb-3 flex flex-col gap-1 text-sm">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg bg-neutral-800 p-3"
          />
        </label>
        <div className="mb-4 flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Latitude
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              className="rounded-lg bg-neutral-800 p-3"
              placeholder="35.0"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Longitude
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              className="rounded-lg bg-neutral-800 p-3"
              placeholder="139.0"
            />
          </label>
        </div>
        <button
          onClick={async () => {
            // Local-noon avoids the date shifting across the UTC boundary.
            const takenAt = new Date(`${date}T12:00:00`).getTime();
            await updateMedia(media.id, {
              takenAt,
              dayKey: date,
              lat: Number.isFinite(Number(lat)) ? Number(lat) : undefined,
              lng: Number.isFinite(Number(lng)) ? Number(lng) : undefined,
            });
            onClose();
          }}
          className="w-full rounded-xl bg-white p-3 font-medium text-neutral-950"
        >
          Save
        </button>
      </div>
    </div>
  );
}
