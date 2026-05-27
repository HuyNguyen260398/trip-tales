"use client";

import { useRouter } from "next/navigation";
import StorageMeter from "@/components/StorageMeter";

export default function SettingsPage() {
  const router = useRouter();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] lg:max-w-4xl">
      <button onClick={() => router.push("/")} className="self-start text-sm text-neutral-400">
        ← Home
      </button>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <StorageMeter />
      <p className="text-xs text-neutral-500">
        Triptales stores everything on this device. Maps © OpenStreetMap
        contributors. Music tracks are CC0.
      </p>
    </main>
  );
}
