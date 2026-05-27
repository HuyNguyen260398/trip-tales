import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const OUT = "out";
const exts = new Set([".html", ".js", ".css", ".webmanifest", ".png", ".woff2"]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return exts.has(p.slice(p.lastIndexOf("."))) ? [p] : [];
  });
}

const urls = walk(OUT)
  .map((p) => "/" + relative(OUT, p).split("\\").join("/"))
  .map((u) => (u.endsWith("/index.html") ? u.replace(/index\.html$/, "") : u));

writeFileSync(join(OUT, "precache-manifest.json"), JSON.stringify([...new Set(urls)], null, 2));
console.log(`precache: ${urls.length} assets`);
