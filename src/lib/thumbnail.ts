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
      // heic2any failed; fall through to placeholder
    }
  }

  // Attempt 3: both canvas-decode paths failed.
  // For HEIC: return the original file so the <img> element can try the
  // browser's native codec (Chrome 105+ on macOS, Safari/iOS natively).
  // For any other format that somehow fails: fall back to a placeholder.
  if (!bitmap) return isHeic(file) ? file : placeholderBlob();

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
