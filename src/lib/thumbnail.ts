const MAX_EDGE = 512;
const QUALITY = 0.8;

function isHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
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
 * Chrome 105+ on macOS supports HEIC in <img> even though createImageBitmap
 * blocks it — the two paths use different codec stacks. Returns null if the
 * browser cannot load the image or the canvas produces no blob.
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

  // Attempt 2: heic2any for HEIC when the browser cannot decode natively
  // (Chrome/Firefox). heic2any is best-effort — it uses an older libheif
  // that may not support all HEIC profiles, so we fall through on failure.
  if (!bitmap && isHeic(file)) {
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: QUALITY });
      const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
      bitmap = await tryDecode(jpegBlob);
    } catch {
      // heic2any failed; fall through
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

  // Attempt 3: <img>-element decode for HEIC.
  // Chrome 105+ macOS supports HEIC natively in <img> but not in
  // createImageBitmap. Loading via HTMLImageElement then drawing to canvas
  // gives us a proper JPEG thumbnail without needing heic2any.
  if (isHeic(file)) {
    const imgBlob = await tryDecodeViaImg(file);
    if (imgBlob) return imgBlob;
  }

  // Attempt 4: all decode paths failed.
  // Return the original file for HEIC so the <img> element in the UI can
  // still try the browser's native codec as a last resort.
  // For any other format: neutral placeholder.
  return isHeic(file) ? file : placeholderBlob();
}
