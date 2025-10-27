import express from "express";
import fetch from "node-fetch";

const router = express.Router();

/* ================== Config Printful ================== */
const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* ================== Cache ================== */
let productCache = { time: 0, data: [] };
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1h

/* ================== Color map oficial (HEX exactos) ================== */
/* Añade o ajusta aquí tus colores tal como aparecen en Printful */
const COLOR_MAP = {
  "Adobe":        "#A6654E",
  "Black":        "#000000",
  "White":        "#FFFFFF",
  "French Navy":  "#031A44",
  "Heather Grey": "#B3B7BD",
  "Natural":      "#EFE9E2",
  "Burgundy":     "#800020",
  "Bottle Green": "#0B3D02",
  "Royal Blue":   "#4169E1",
  "Light Pink":   "#F4C2C2",
  // comunes (fallbacks)
  "Navy":         "#001F3F",
  "Grey":         "#808080",
  "Gray":         "#808080",
  "Red":          "#FF0000",
  "Blue":         "#0057FF",
  "Green":        "#008000",
  "Yellow":       "#FFEA00",
  "Pink":         "#FFC0CB",
  "Orange":       "#FFA500",
  "Beige":        "#F5F5DC",
  "Brown":        "#5C4033",
};

function colorHexFromName(name = "") {
  const exact = COLOR_MAP[name?.trim()] || null;
  if (exact) return exact;

  // fallback por “familia” de color (nombre en minúsculas)
  const k = String(name || "").trim().toLowerCase();
  const map = {
    "black":"#000000","white":"#ffffff","navy":"#001f3f","grey":"#808080","gray":"#808080",
    "red":"#ff0000","blue":"#0057ff","green":"#008000","yellow":"#ffea00","pink":"#ffc0cb",
    "orange":"#ffa500","beige":"#f5f5dc","brown":"#5c4033","natural":"#efe9e2"
  };
  return map[k] || "#dddddd";
}

/* ================== Helpers ================== */
async function pfGet(path) {
  const res = await fetch(`${PRINTFUL_API}${path}`, { headers: PF_HEADERS });
  let payload = null;
  try { payload = await res.json(); } catch {}
  if (!res.ok) {
    const msg = payload?.error || payload || (await res.text().catch(()=>"" ));
    throw new Error(`Printful GET ${path} -> ${res.status} ${JSON.stringify(msg)}`);
  }
  return payload;
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

function capWords(s){
  return String(s||"").toLowerCase().replace(/\s+/g," ").replace(/\b\w/g,c=>c.toUpperCase());
}
function normName(s){
  return capWords(String(s||"").replace(/[-_]/g," ").replace(/\s+/g," ").trim());
}

function detectCategories(name=""){
  const n = String(name).toLowerCase();
  if (/(tee|t-shirt|camiseta)/i.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera)/i.test(n)) return ["sudaderas"];
  if (/(pant|pantal[oó]n|leggings|jogger)/i.test(n)) return ["pantalones"];
  if (/(shoe|sneaker|zapatilla|bota)/i.test(n)) return ["zapatos"];
  if (/(cap|gorra|beanie|gorro)/i.test(n)) return ["accesorios"];
  return ["otros"];
}

/* ================== Normalizador por producto ================== */
/* Extrae color y talla desde “Nombre / Color / Talla” y genera:
   colors = { [ColorName]: { hex, image, sizes: { [Size]: variant_id } } }
*/
function normalizeDetail(detail){
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  const prices = variants.map(v=>parseFloat(v.retail_price)).filter(n=>!Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : 0;

  const colors = {};

  for (const v of variants) {
    const product = v?.product || {};
    const raw = String(v?.name || "").trim();

    // Parse robusto del nombre: “Nombre / Color / Talla”
    let colorName = "";
    let size = "";

    if (raw.includes("/")) {
      const segs = raw.split("/").map(s=>s.trim()).filter(Boolean);
      if (segs.length >= 2) {
        size = segs[segs.length - 1];
        colorName = segs[segs.length - 2];
      }
    }

    // fallbacks
    if (!colorName) colorName = product.color_name || product.color || "";
    if (!colorName && raw.includes("-")) colorName = raw.split("-").pop().trim();
    if (!colorName) colorName = "Color Único";
    colorName = capWords(colorName);

    if (!size) size = product.size || `VAR_${v.variant_id}`;

    // HEX prioritario (el que mande Printful) y si no, mapeo propio
    let hex = product.hex_code || v?.color_code || v?.color_hex || null;
    if (hex && /^#?[0-9A-Fa-f]{3,6}$/.test(hex)) hex = hex.startsWith("#") ? hex : `#${hex}`;
    if (!hex) hex = colorHexFromName(colorName);

    // Imagen de variante (preferencias)
    const vImg =
      (v?.files||[]).find(f=>f.type==="preview" && f.preview_url)?.preview_url ||
      (v?.files||[]).find(f=>f.preview_url)?.preview_url ||
      (v?.files||[]).find(f=>f.thumbnail_url)?.thumbnail_url ||
      (v?.files||[]).find(f=>f.url)?.url ||
      product.image || sp?.thumbnail_url || null;

    if (!colors[colorName]) colors[colorName] = { hex, image: vImg, sizes: {} };
    if (!colors[colorName].image && vImg) colors[colorName].image = vImg;
    colors[colorName].sizes[size] = v.variant_id;
  }

  const firstColor = Object.keys(colors)[0];
  const cover =
    (firstColor && colors[firstColor]?.image) ||
    sp?.thumbnail_url ||
    "https://i.postimg.cc/k5ZGwR5W/producto1.png";

  const variant_map = firstColor ? { ...colors[firstColor].sizes } : {};

  return {
    id: String(sp?.id || sp?.external_id || `pf_${Date.now()}`),
    name: normName(sp?.name || "Producto Printful"),
    price: Number(price.toFixed(2)),
    image: cover,
    sku: sp?.external_id || String(sp?.id || ""),
    categories: detectCategories(sp?.name || ""),
    colors,
    variant_map,
  };
}

/* ================== Fusión por nombre (si colores están como productos separados) ================== */
function mergeByName(list){
  const map = new Map();
  for (const p of list){
    const key = normName(p.name);
    if (!map.has(key)){
      map.set(key, { ...p, id:key, sku:key, colors: { ...p.colors } });
      continue;
    }
    const tgt = map.get(key);
    // precio mínimo
    tgt.price = Math.min(tgt.price, p.price);
    // portada si falta
    if (!tgt.image && p.image) tgt.image = p.image;
    // fusionar colores/tallas
    for (const [cName, cData] of Object.entries(p.colors||{})){
      if (!tgt.colors[cName]) tgt.colors[cName] = { hex: cData.hex || null, image: cData.image || tgt.image, sizes:{} };
      if (!tgt.colors[cName].image && cData.image) tgt.colors[cName].image = cData.image;
      Object.assign(tgt.colors[cName].sizes, cData.sizes||{});
    }
  }
  return Array.from(map.values());
}

/* ================== Endpoints ================== */
router.get("/api/printful/products", async (req,res)=>{
  try{
    if (!process.env.PRINTFUL_API_KEY) {
      return res.status(500).json({ error:"PRINTFUL_API_KEY no configurada en el servidor" });
    }
    res.setHeader("Cache-Control","no-store");

    const force = String(req.query.refresh||"")==="1";
    const now = Date.now();
    if (!force && now - productCache.time < PRODUCT_CACHE_TTL && productCache.data.length){
      return res.json({ products: productCache.data, cached:true });
    }

    const list = await fetchAllSyncedProducts(); // solo “Añadidos a tienda”
    if (!list.length){
      productCache = { time: now, data: [] };
      return res.json({ products: [], note:"No hay productos 'añadidos a tienda' en Printful." });
    }

    const details = await Promise.all(list.map(p=>pfGet(`/store/products/${p.id}`)));
    const normalized = details.map(normalizeDetail);
    const merged = mergeByName(normalized);

    productCache = { time: now, data: merged };
    res.json({ products: merged, cached:false, refreshed:force });
  }catch(err){
    console.error("PF /products error:", err.message);
    res.status(500).json({ error:String(err.message) });
  }
});

// Invalida la caché manualmente
router.post("/api/printful/refresh",(req,res)=>{
  productCache = { time:0, data:[] };
  res.json({ ok:true, msg:"Caché invalidada" });
});

// Depuración: ver cómo quedó un producto concreto tras normalización
router.get("/api/printful/debug", (req,res)=>{
  const q = String(req.query.name||"").trim().toLowerCase();
  const matches = (productCache.data||[]).filter(p=>p.name.toLowerCase().includes(q));
  res.json({ query:q, matches });
});

export default router;