// scripts/generate-images-json.mjs
import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const DOCS = path.join(ROOT, "docs");
const IMG_DIR = path.join(DOCS, "img");
const OUT = path.join(DOCS, "images.json");

function prettyColorName(s) {
  const t = String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main(){
  const files = await fs.readdir(IMG_DIR).catch(()=>[]);
  const images = files.filter(f => /\.(png|jpe?g|webp)$/i.test(f));
  const out = {};

  for (const file of images){
    // Patrón: <SKU>__<color>(__lo-que-sea).ext
    const m = file.match(/^(.+?)__([^._]+)(?:__[^.]*)?\.(png|jpe?g|webp)$/i);
    if (!m) continue;

    const [, rawSku, rawColor] = m;
    const sku = rawSku.trim();
    const colorPretty = prettyColorName(rawColor);
    const relPath = `img/${file}`;

    out[sku] ??= {};
    out[sku][colorPretty] ??= [];
    if (!out[sku][colorPretty].includes(relPath)) {
      out[sku][colorPretty].push(relPath);
    }
  }

  const sorted = Object.fromEntries(
    Object.keys(out).sort().map(sku => [
      sku,
      Object.fromEntries(Object.keys(out[sku]).sort().map(c => [c, out[sku][c]]))
    ])
  );

  await fs.writeFile(OUT, JSON.stringify(sorted, null, 2), "utf8");
  console.log(`✅ Generado ${path.relative(ROOT, OUT)} con ${Object.keys(sorted).length} SKU(s).`);
}

main().catch(err=>{
  console.error("❌ Error generando images.json:", err);
  process.exit(1);
});