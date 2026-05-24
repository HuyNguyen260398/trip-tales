/**
 * A hand-built minimal JPEG carrying real EXIF metadata, for exercising the
 * actual `exifr` library (not a mock). Encodes:
 *   - DateTimeOriginal = 2026:04:07 09:00:00
 *   - GPS 35.0° N, 139.0° E  →  latitude 35, longitude 139
 *
 * exifr only reads metadata, so the pixel stream can be empty — this is enough
 * to prove GPS coordinates are extracted end-to-end.
 */
export function gpsJpegBytes(): Uint8Array {
  const tiff = Buffer.alloc(178); // big-endian "MM"
  tiff.write("MM", 0, "ascii");
  tiff.writeUInt16BE(0x002a, 2);
  tiff.writeUInt32BE(8, 4); // IFD0 @8

  // IFD0 (2 entries): Exif IFD pointer + GPS IFD pointer
  tiff.writeUInt16BE(2, 8);
  tiff.writeUInt16BE(0x8769, 10); tiff.writeUInt16BE(4, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt32BE(38, 18); // Exif IFD @38
  tiff.writeUInt16BE(0x8825, 22); tiff.writeUInt16BE(4, 24); tiff.writeUInt32BE(1, 26); tiff.writeUInt32BE(56, 30); // GPS IFD @56
  tiff.writeUInt32BE(0, 34);

  // Exif IFD (1 entry): DateTimeOriginal ASCII(20) @110
  tiff.writeUInt16BE(1, 38);
  tiff.writeUInt16BE(0x9003, 40); tiff.writeUInt16BE(2, 42); tiff.writeUInt32BE(20, 44); tiff.writeUInt32BE(110, 48);
  tiff.writeUInt32BE(0, 52);

  // GPS IFD (4 entries): LatRef, Lat, LngRef, Lng
  tiff.writeUInt16BE(4, 56);
  tiff.writeUInt16BE(0x0001, 58); tiff.writeUInt16BE(2, 60); tiff.writeUInt32BE(2, 62); tiff.writeUInt8(0x4e, 66); // "N"
  tiff.writeUInt16BE(0x0002, 70); tiff.writeUInt16BE(5, 72); tiff.writeUInt32BE(3, 74); tiff.writeUInt32BE(130, 78); // lat rationals @130
  tiff.writeUInt16BE(0x0003, 82); tiff.writeUInt16BE(2, 84); tiff.writeUInt32BE(2, 86); tiff.writeUInt8(0x45, 90); // "E"
  tiff.writeUInt16BE(0x0004, 94); tiff.writeUInt16BE(5, 96); tiff.writeUInt32BE(3, 98); tiff.writeUInt32BE(154, 102); // lng rationals @154
  tiff.writeUInt32BE(0, 106);

  // Data area
  tiff.write("2026:04:07 09:00:00\0", 110, "latin1");
  tiff.writeUInt32BE(35, 130); tiff.writeUInt32BE(1, 134); tiff.writeUInt32BE(0, 138); tiff.writeUInt32BE(1, 142); tiff.writeUInt32BE(0, 146); tiff.writeUInt32BE(1, 150); // 35/1,0/1,0/1
  tiff.writeUInt32BE(139, 154); tiff.writeUInt32BE(1, 158); tiff.writeUInt32BE(0, 162); tiff.writeUInt32BE(1, 166); tiff.writeUInt32BE(0, 170); tiff.writeUInt32BE(1, 174); // 139/1,0/1,0/1

  const app1Payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const app1Len = app1Payload.length + 2;
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff]), // APP1 marker + length
    app1Payload,
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
  return new Uint8Array(jpeg);
}
