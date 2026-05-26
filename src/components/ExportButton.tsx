"use client";

import { useState } from "react";
import { exportTrip } from "@/lib/export";

export default function ExportButton({ tripId, tripName }: { tripId: string; tripName: string }) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const zip = await exportTrip(tripId);
      const file = new File([zip], `${tripName.replace(/\s+/g, "-")}.zip`, { type: "application/zip" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: tripName });
        } catch (e) {
          if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
        }
      } else {
        const url = URL.createObjectURL(zip);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={handleExport} disabled={busy}
      className="rounded-xl bg-neutral-800 px-4 py-2 text-sm disabled:opacity-50">
      {busy ? "Exporting…" : "Export trip"}
    </button>
  );
}
