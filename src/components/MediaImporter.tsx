"use client";

import { useRef, useState } from "react";
import { importMedia } from "@/lib/media";

export default function MediaImporter({ tripId }: { tripId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (!files.length) return;
          setProgress({ done: 0, total: files.length });
          await importMedia(tripId, files, (done, total) => setProgress({ done, total }));
          setProgress(null);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={progress !== null}
        className="w-full rounded-xl bg-white p-3 font-medium text-neutral-950 disabled:opacity-50"
      >
        {progress ? `Importing ${progress.done}/${progress.total}…` : "Add photos & videos"}
      </button>
    </div>
  );
}
