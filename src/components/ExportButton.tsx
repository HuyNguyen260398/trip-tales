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

      // Web Share API on Chromium-macOS (e.g. Edge, Chrome) optimistically returns
      // canShare === true for file payloads but then rejects share() with
      // NotAllowedError because the platform has no file-share target. Treat any
      // non-Abort share failure as "platform can't share — download instead."
      // AbortError = user dismissed the share sheet → respect the cancel.
      let shared = false;
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: tripName });
          shared = true;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") shared = true;
        }
      }

      if (!shared) {
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
