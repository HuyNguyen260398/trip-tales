import exifr from "exifr";

export interface ParsedExif {
  /** epoch ms, if a capture date was present. */
  takenAt?: number;
  lat?: number;
  lng?: number;
}

export async function parseExif(file: File): Promise<ParsedExif> {
  try {
    // `latitude`/`longitude` are SYNTHETIC keys exifr only computes after it
    // reads the raw GPS coordinate tags — they are not real tags, so passing
    // them to `pick` silently leaves the GPS block disabled and coordinates are
    // never extracted. Request the blocks explicitly instead: the EXIF date
    // tags, and the GPS coordinate tags (1=LatRef, 2=Lat, 3=LngRef, 4=Lng,
    // which is exactly what exifr.gps() uses), which makes exifr derive
    // `latitude`/`longitude`. Works the same for HEIC and JPEG.
    const data = await exifr.parse(file, {
      exif: { pick: ["DateTimeOriginal", "CreateDate"] },
      gps: { pick: [1, 2, 3, 4] },
    });
    if (!data) return {};
    const date: Date | undefined = data.DateTimeOriginal ?? data.CreateDate;
    const result: ParsedExif = {};
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      result.takenAt = date.getTime();
    }
    if (typeof data.latitude === "number") result.lat = data.latitude;
    if (typeof data.longitude === "number") result.lng = data.longitude;
    return result;
  } catch {
    return {};
  }
}
