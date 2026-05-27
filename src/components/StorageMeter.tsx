"use client";

import { useEffect, useState } from "react";
import { requestPersistentStorage } from "@/lib/storage";

export default function StorageMeter() {
  const [usageMb, setUsageMb] = useState<number | null>(null);
  const [quotaMb, setQuotaMb] = useState<number | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      setUsageMb(Math.round((e.usage ?? 0) / 1e6));
      setQuotaMb(Math.round((e.quota ?? 0) / 1e6));
    });
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  return (
    <div className="rounded-xl bg-neutral-900 p-4 text-sm">
      <p className="font-medium">On-device storage</p>
      <p className="mt-1 text-neutral-400">
        {usageMb ?? "–"} MB used{quotaMb ? ` of ~${quotaMb} MB` : ""}
      </p>
      <p className="mt-1 text-neutral-400">
        Durable storage: {persisted === null ? "…" : persisted ? "granted" : "best-effort"}
      </p>
      {persisted === false && (
        <button onClick={() => requestPersistentStorage().then(setPersisted)}
          className="mt-2 rounded-lg bg-white px-3 py-1.5 text-neutral-950">
          Request durable storage
        </button>
      )}
      <p className="mt-3 text-xs text-neutral-500">
        iOS may clear web storage after weeks of inactivity. Export trips you want
        to keep — the zip is the durable copy.
      </p>
    </div>
  );
}
