import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

let productCache = { time: 0, data: [] };
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1h

async function pfGet(path) {
  const res = await fetch(`${PRINTFUL_API}${path}`, { headers: PF_HEADERS });
  let json = null; try { json = await res.json(); } catch {}
  if (!res.ok) {
    const msg = json?.error || json || (await res.text().catch(()=>"" ));
    throw new Error(`Printful GET ${path} -> ${res.status} ${JSON.stringify(msg)}`);
  }
  return json;
}

async function fetchAllSyncedProducts() {
  const limit = 100;
  let offset = 0;
  const all = [];
  while (true) {
    const data = await pfGet(`/store/products?limit=${limit}&offset=${offset}`);
    const items = data?.result || [];
    all.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}

const toTitle = (s="") => s.trim().toLowerCase().replace(/\s+/g," ").replace(/\b\w/g,c=>c.toUpperCase());
const colorHexFromName = (name="")=>{
  const k = String(name).trim().toLowerCase();
  const map = { black:"#000", white:"#fff", navy:"#001f3f", blue:"#0057ff", red:"#f00", green:"#080", gray:"#888", grey:"#888", beige:"#f5f5dc", brown:"#5c4033", yellow:"#ffd700", orange:"#ff7f00", pink:"#ffc0cb", purple:"#800080" };
  return map[k] || null;
};
const bestImageFromFiles = (files=[])=>{
  const byType=(t)=>files.find(f=>String(f?.type||"").toLowerCase()===t && (f.preview_url||f.thumbnail_url||f.url));
  return (
    byType("preview")?.preview_url ||
    files.find(f=>f.preview_url)?.preview_url ||
    files.find(f=>f.thumbnail_url)?.thumbnail_url ||
    files.find(f=>f.url)?.url || null
  );
};

/* ============ Normaliza UN “sync_product” de Printful ============ */
function normalizeFromSyncDetail(detail){
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];
  if (!sp) return null;

  const colors = {};
  const prices = [];
  const rawNames = []; // para debug

  for (const v of variants){
    const prod = v?.product || {};
    const raw = String(v?.name || "");
    rawNames.push(raw);

    // color from product.color_name OR from the left part of v.name ("Agave / S")
    let colorName = prod.color_name || prod.color || "";
    if (!colorName && raw.includes("/")) colorName = raw.split("/")[0].trim();
    if (!colorName && raw.includes("-")) colorName = raw.split("-")[0].trim();
    if (!colorName) colorName = "Color Único";
    colorName = toTitle(colorName);

    // size
    let size = prod.size || "";
    if (!size && raw.includes("/")) size = raw.split("/").pop().trim();
    if (!size) size = "Único";

    const img = bestImageFromFiles(v?.files||[]) || prod.image || sp?.thumbnail_url || null;
    const hex = (prod.hex_code && `#${String(prod.hex_code).replace(/^#/,"")}`) || colorHexFromName(colorName) || null;

    if (!colors[colorName]) colors[colorName] = { hex, image: img, images: [], sizes:{} };
    if (!colors[colorName].image && img) colors[colorName].image = img;
    if (img) colors[colorName].images.push(img);
    colors[colorName].sizes[size] = v.variant_id;

    const rp = parseFloat(v.retail_price);
    if (!Number.isNaN(rp)) prices.push(rp);
  }

  // imagen fallback
  const firstImg = Object.values(colors).find(c=>c.image)?.image || sp?.thumbnail_url || null;
  Object.values(colors).forEach(c=>{ if(!c.image) c.image = firstImg; });

  const price = prices.length ? Math.min(...prices) : 0;

  // “rootName” (parte común antes del primer “/” o “ - ”)
  const name = sp?.name || "Producto";
  const rootName = toTitle(name.split("/")[0].split("-")[0].trim());
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")}-${sp?.id}`;

  return {
    id: String(sp?.id || ""),
    name,
    rootName,           // <- lo usaremos para agrupar “hermanos”
    price: Number(price.toFixed(2)),
    image: firstImg,
    sku: sp?.external_id || String(sp?.id || ""),
    categories: ["otros"], // opcional: puedes llamar a detectCategories(name)
    colors,                // { "Agave": {...}, "Adobe": {...} }
    variant_map: {},
    slug,
    __rawNames: rawNames   // solo para debug
  };
}

/* ============ FUSIÓN: combina productos “hermanos” por rootName ============ */
function mergeByRoot(products){
  const map = new Map();
  for (const p of products){
    const key = p.rootName || p.name;
    if (!map.has(key)) {
      map.set(key, { ...p, name: key, colors: { ...p.colors } });
      continue;
    }
    const acc = map.get(key);
    // precio mínimo
    acc.price = Math.min(acc.price || Infinity, p.price || Infinity);
    // imagen de portada (la que ya tenga o la del nuevo)
    acc.image = acc.image || p.image;
    // fusionar colores
    for (const [cname, meta] of Object.entries(p.colors||{})){
      if (!acc.colors[cname]) acc.colors[cname] = { hex: meta.hex, image: meta.image, images:[...meta.images], sizes: { ...meta.sizes } };
      else {
        // mantener primera image si existe; añadir extras
        if (!acc.colors[cname].image && meta.image) acc.colors[cname].image = meta.image;
        acc.colors[cname].images.push(...(meta.images||[]));
        acc.colors[cname].sizes = { ...acc.colors[cname].sizes, ...meta.sizes };
      }
    }
  }
  // generar variant_map inicial con el primer color de cada agrupado
  for (const p of map.values()){
    const firstColor = Object.keys(p.colors||{})[0];
    p.variant_map = firstColor ? { ...p.colors[firstColor].sizes } : {};
  }
  return Array.from(map.values());
}

/* ===================== Endpoints ===================== */

router.get("/api/printful/products", async (req,res)=>{
  try{
    if (!process.env.PRINTFUL_API_KEY) {
      return res.status(500).json({ error:"PRINTFUL_API_KEY no configurada" });
    }
    res.setHeader("Cache-Control","no-store");

    const force = String(req.query.refresh||"")==="1";
    const debug = String(req.query.debug||"")==="1";
    const now = Date.now();

    if (!force && !debug && now - productCache.time < PRODUCT_CACHE_TTL && productCache.data.length){
      return res.json({ products: productCache.data, cached:true });
    }

    const list = await fetchAllSyncedProducts();
    const details = await Promise.all(list.map(p=>pfGet(`/store/products/${p.id}`)));
    const normalized = details.map(normalizeFromSyncDetail).filter(Boolean);

    if (debug) {
      // Modo diagnóstico: te enseño cómo vienen los nombres y cómo agrupo
      return res.json({
        debug: true,
        count_raw: normalized.length,
        roots: normalized.map(p=>({ id:p.id, name:p.name, root:p.rootName, raw:p.__rawNames?.slice(0,6)||[] }))
      });
    }

    // Fusión por rootName (clave)
    const merged = mergeByRoot(normalized);

    productCache = { time: now, data: merged };
    res.json({ products: merged, cached:false, refreshed:force });
  }catch(err){
    console.error("PF /products error:", err);
    res.status(500).json({ error:String(err.message||err) });
  }
});

router.post("/api/printful/refresh",(req,res)=>{
  productCache = { time:0, data:[] };
  res.json({ ok:true, msg:"Caché invalidada" });
});

export default router;