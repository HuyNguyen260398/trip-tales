"use client";

import { useEffect, useState } from "react";
import { objectUrl } from "@/lib/opfs";
import type { Media } from "@/lib/types";

export default function MediaThumb({ media }: { media: Media }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let revoked: string | null = null;
    objectUrl(media.thumbPath)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        revoked = u;
        setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [media.thumbPath]);

  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-neutral-800">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      )}
      {media.type === "video" && (
        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-xs">▶</span>
      )}
      {media.lat === undefined && (
        <span className="absolute left-1 top-1 rounded bg-amber-500/80 px-1 text-[10px] text-black">
          no GPS
        </span>
      )}
    </div>
  );
}
