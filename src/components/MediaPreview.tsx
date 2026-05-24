"use client";

import { useEffect, useState } from "react";
import { readBlob } from "@/lib/opfs";
import { toDisplayBlob } from "@/lib/thumbnail";

export default function MediaPreview({
  thumbOrPath,
  onClose,
}: {
  thumbOrPath: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let u: string | null = null;
    let cancelled = false;
    readBlob(thumbOrPath)
      .then((blob) => toDisplayBlob(blob, thumbOrPath))
      .then((displayable) => {
        if (cancelled) return;
        u = URL.createObjectURL(displayable);
        setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [thumbOrPath]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      )}
    </div>
  );
}
