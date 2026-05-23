"use client";

import { useState } from "react";
import type { Trip } from "@/lib/types";

export interface TripFormValues {
  name: string;
  startDate: string;
  endDate: string;
}

export default function TripForm({
  initial,
  submitLabel = "Save",
  onSubmit,
}: {
  initial?: Partial<Trip>;
  submitLabel?: string;
  onSubmit: (values: TripFormValues) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const valid = name.trim() && startDate && endDate && startDate <= endDate;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ name: name.trim(), startDate, endDate });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Trip name
        <input
          className="rounded-lg bg-neutral-900 p-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Tokyo spring"
          required
        />
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Start
          <input type="date" className="rounded-lg bg-neutral-900 p-3"
            value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          End
          <input type="date" className="rounded-lg bg-neutral-900 p-3"
            value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </label>
      </div>
      <button
        type="submit"
        disabled={!valid}
        className="rounded-xl bg-white p-3 font-medium text-neutral-950 disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </form>
  );
}
