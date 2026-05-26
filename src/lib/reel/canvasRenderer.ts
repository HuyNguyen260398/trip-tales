import type { Segment } from "./storyboard";
import { kenBurnsScale } from "./kenburns";
import { readBlob } from "../opfs";
import { toDisplayBlob } from "../thumbnail";

const WIDTH = 720;
const HEIGHT = 1280; // portrait reel, 720p cap

async function loadBitmaps(segs: Segment[]): Promise<Map<string, ImageBitmap>> {
  const map = new Map<string, ImageBitmap>();
  for (const s of segs) {
    const raw = await readBlob(s.opfsPath);
    const blob = await toDisplayBlob(raw, s.opfsPath);
    map.set(s.mediaId, await createImageBitmap(blob));
  }
  return map;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  bmp: ImageBitmap,
  scale: number
) {
  const baseScale = Math.max(WIDTH / bmp.width, HEIGHT / bmp.height) * scale;
  const w = bmp.width * baseScale;
  const h = bmp.height * baseScale;
  ctx.drawImage(bmp, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
}

export interface ReelRender {
  canvas: HTMLCanvasElement;
  durationSec: number;
  /** Plays the slideshow to completion, resolving when the last frame is drawn. */
  play: () => Promise<void>;
}

export async function createCanvasRender(segs: Segment[]): Promise<ReelRender> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const bitmaps = await loadBitmaps(segs);
  const durationSec = segs.length ? segs[segs.length - 1].endSec : 0;

  function drawAt(elapsed: number) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const s of segs) {
      if (elapsed < s.startSec || elapsed > s.endSec) continue;
      const local = (elapsed - s.startSec) / (s.endSec - s.startSec);
      const bmp = bitmaps.get(s.mediaId)!;
      // Crossfade: fade in over the segment's first 0.5s, out over its last 0.5s.
      const fade = Math.min(1, (elapsed - s.startSec) / 0.5, (s.endSec - elapsed) / 0.5);
      ctx.globalAlpha = Math.max(0, fade);
      drawCover(ctx, bmp, kenBurnsScale(s.zoomIn, local));
      ctx.globalAlpha = 1;
    }
  }

  function play(): Promise<void> {
    return new Promise((resolve) => {
      const startTs = performance.now();
      const frame = (now: number) => {
        const elapsed = (now - startTs) / 1000;
        drawAt(elapsed);
        if (elapsed >= durationSec) {
          bitmaps.forEach((b) => b.close());
          resolve();
        } else {
          requestAnimationFrame(frame);
        }
      };
      requestAnimationFrame(frame);
    });
  }

  return { canvas, durationSec, play };
}
