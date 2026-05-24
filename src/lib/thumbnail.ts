const MAX_EDGE = 512;
const QUALITY = 0.8;

function isHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function looksHeic(blob: Blob, pathHint: string): boolean {
  return /heic|heif/i.test(blob.type) || /\.hei[cf]$/i.test(pathHint);
}

/** Attempt to decode a blob to ImageBitmap; returns null instead of throwing. */
async function tryDecode(blob: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/**
 * Decode blob via an HTMLImageElement and draw it to a scaled JPEG canvas.
 * Only works in browsers with native HEIC support (Safari/iOS).
 * Returns null if the browser cannot load the image or the canvas produces no blob.
 */
function tryDecodeViaImg(blob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w0, naturalHeight: h0 } = img;
      if (!w0 || !h0) { resolve(null); return; }
      const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
      const w = Math.round(w0 * scale);
      const h = Math.round(h0 * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => resolve(b), "image/jpeg", QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** 1×1 neutral-gray JPEG — always a valid displayable blob. */
function placeholderBlob(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#525252";
  ctx.fillRect(0, 0, 1, 1);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("placeholder failed"))),
      "image/jpeg",
      0.5
    )
  );
}

export async function makeThumbnail(file: File): Promise<Blob> {
  // Attempt 1: browser-native decode — handles JPEG/PNG/WebP everywhere,
  // and HEIC in Safari/iOS where it is natively supported.
  let bitmap = await tryDecode(file);

  // Attempt 2: heic-to for HEIC when the browser cannot decode natively
  // (Chrome/Firefox/Edge). Uses libheif 1.21+ which supports modern iPhone HEIC.
  if (!bitmap && isHeic(file)) {
    try {
      const { heicTo } = await import("heic-to");
      const jpegBlob = await heicTo({ blob: file, type: "image/jpeg", quality: QUALITY });
      bitmap = await tryDecode(jpegBlob);
    } catch {
      // heic-to failed; fall through
    }
  }

  // Got a decoded bitmap — scale to JPEG.
  if (bitmap) {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        QUALITY
      )
    );
  }

  // Attempt 3: <img>-element decode — last resort for Safari where
  // createImageBitmap may block HEIC but <img> renders it natively.
  if (isHeic(file)) {
    const imgBlob = await tryDecodeViaImg(file);
    if (imgBlob) return imgBlob;
  }

  // Attempt 4: all decode paths failed.
  // Return the original file for HEIC so Safari's <img> can still try it.
  return isHeic(file) ? file : placeholderBlob();
}

/**
 * Convert a blob to a browser-displayable form for the full-size preview.
 * HEIC blobs are converted to JPEG via heic-to (libheif 1.21+).
 * Non-HEIC blobs are returned as-is.
 *
 * Chrome/Edge do not support HEIC in <img> elements — heic-to is the only
 * reliable decode path on those browsers. Safari renders HEIC natively so
 * the typed raw-blob fallback covers it.
 *
 * Chromium's OPFS getFile() returns blobs with type="" regardless of extension,
 * so we re-wrap with image/heic before processing.
 */
export async function toDisplayBlob(blob: Blob, pathHint = ""): Promise<Blob> {
  if (!looksHeic(blob, pathHint)) return blob;
  // OPFS blobs have type="" in Chromium — supply the MIME type so Object URLs
  // route to the correct codec and heic-to can detect the format.
  const heicBlob = blob.type ? blob : new Blob([blob], { type: "image/heic" });
  try {
    const { heicTo } = await import("heic-to");
    return await heicTo({ blob: heicBlob, type: "image/jpeg", quality: 0.92 });
  } catch {
    // heic-to failed; return typed blob for Safari's native HEIC rendering
    return heicBlob;
  }
}
