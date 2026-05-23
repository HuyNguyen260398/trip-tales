import exifr from "exifr";

export interface ParsedExif {
  /** epoch ms, if a capture date was present. */
  takenAt?: number;
  lat?: number;
  lng?: number;
}

export async function parseExif(file: File): Promise<ParsedExif> {
  try {
    const data = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "latitude", "longitude"],
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
