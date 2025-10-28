// router.js
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

// ====== Colores (HEX y etiqueta ES) ======
const COLOR_MAP = {
  Adobe:        { hex:"#A6654E", es:"Adobe" },
  Black:        { hex:"#000000", es:"Negro" },
  White:        { hex:"#FFFFFF", es:"Blanco" },
  "French Navy":{ hex:"#031A44", es:"Azul marino" },
  "Heather Grey":{ hex:"#B3B7BD", es:"Gris jaspeado" },
  Natural:      { hex:"#EFE9E2", es:"Natural" },
  Burgundy:     { hex:"#800020", es:"Burdeos" },
  "Bottle Green":{ hex:"#0B3D02", es:"Verde botella" },
  "Royal Blue": { hex:"#4169E1", es:"Azul royal" },
  "Light Pink": { hex:"#F4C2C2", es:"Rosa claro" },
  Navy:         { hex:"#001F3F", es:"Azul marino" },
  Grey:         { hex:"#808080", es:"Gris" },
  Gray:         { hex:"#808080", es:"Gris" },
  Red:          { hex:"#FF0000", es:"Rojo" },
  Blue:         { hex:"#0057FF", es:"Azul" },
  Green:        { hex:"#008000", es:"Verde" },
  Yellow:       { hex:"#FFEA00", es:"Amarillo" },
  Pink:         { hex:"#FFC0CB", es:"Rosa" },
  Orange:       { hex:"#FFA500", es:"Naranja" },
  Beige:        { hex:"#F5F5DC", es:"Beis" },
  Brown:        { hex:"#5C4033", es:"Marrón" },
};

// ====== Override manual de categorías por NOMBRE (normalizado) ======
const CATEGORY_OVERRIDE = {
  // "Sudadera Negra Logo Amarillo": ["sudaderas"],
};

// ====== OVERRIDE MANUAL DE IMÁGENES (por producto y color, usando slugs) ======
const IMAGE_OVERRIDE = {
  // Ejemplo solicitado:
  "sudadera-negra-logo-verde": {
    "verde": "/img/sudadera_verde.jpg",
    "azul-marino": "/img/sudadera-negra-logo-amarillo__azul-marino.jpg"
  },
  // Añade más aquí:
  // "camiseta-premium-blanca-180g": { "blanco": "/img/camiseta-premium-blanca-180g__blanco.jpg" }
};

// ====== Helpers ======
function colorInfo(name=""){
  const key = String(name).trim();
  if (COLOR_MAP[key]) return COLOR_MAP[key];
  const k = key.toLowerCase();
  const fam = [
    { re:/black/, hex:"#000000", es:"Negro" },
    { re:/white|ivory|cream|natural/, hex:"#ffffff", es:"Blanco/Natural" },
    { re:/navy|marine/, hex:"#001f3f", es:"Azul marino" },
    { re:/royal|blue/, hex:"#0057ff", es:"Azul" },
    { re:/red|scarlet|crimson/, hex:"#ff0000", es:"Rojo" },
    { re:/green|forest|bottle/, hex:"#008000", es:"Verde" },
    { re:/yellow|gold/, hex:"#ffea00", es:"Amarillo" },
    { re:/pink|magenta|fuchsia/, hex:"#ffc0cb", es:"Rosa" },
    { re:/orange|coral/, hex:"#ffa500", es:"Naranja" },
    { re:/beige|sand|khaki|tan/, hex:"#f5f5dc", es:"Beis" },
    { re:/grey|gray|heather/, hex:"#808080", es:"Gris" },
    { re:/brown|chocolate|coffee/, hex:"#5c4033", es:"Marrón" },
    { re:/burgundy|wine/, hex:"#800020", es:"Burdeos" },
  ];
  for (const f of fam) if (f.re.test(k)) return { hex:f.hex, es:f.es };
  return { hex:"#dddddd", es:key || "Color" };
}
function capWords(s){
  return String(s||"").toLowerCase().replace(/\s+/g," ").replace(/\b\w/g,c=>c.toUpperCase());
}
function normName(s){
  return capWords(String(s||"").replace(/[-_]/g," ").replace(/\s+/g," ").trim());
}
function slug(s){
  return String(s||"").toLowerCase().trim()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
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

async function pfGet(path) {
  const r = await fetch(`${PRINTFUL_API}${path}`, { headers: PF_HEADERS });
  let json = null; try { json = await r.json(); } catch {}
  if (!r.ok) {
    const msg = json?.error || json || (await r.text().catch(()=>"" ));
    throw new Error(`Printful GET ${path} -> ${r.status} ${JSON.stringify(msg)}`);
  }
  return json;
}
async function fetchAllSyncedProducts() {
  const limit = 100; let offset = 0; const all = [];
  while (true) {
    const data = await pfGet(`/store/products?limit=${limit}&offset=${offset}`);
    const items = data?.result || [];
    all.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}
function firstPreview(files = []){
  return (
    files?.find(f=>f.type==="preview" && f.preview_url)?.preview_url ||
    files?.find(f=>f.preview_url)?.preview_url ||
    files?.find(f=>f.thumbnail_url)?.thumbnail_url ||
    files?.find(f=>f.url)?.url ||
    null
  );
}
async function hydrateVariant(v) {
  if (v?.files && v.files.length) return v;
  try {
    const det = await pfGet(`/store/variants/${v.variant_id}`);
    const rr = det?.result || {};
    return { ...v, product: rr.product || v.product, files: rr.files?.length ? rr.files : v.files };
  } catch { return v; }
}

async function normalizeDetail(detail){
  const sp = detail?.result?.sync_product;
  let variants = detail?.result?.sync_variants || [];
  variants = await Promise.all(variants.map(hydrateVariant));

  const prices = variants.map(v=>parseFloat(v.retail_price)).filter(n=>!Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : 0;

  const colors = {};
  for (const v of variants) {
    const product = v?.product || {};
    const raw = String(v?.name || "").trim();

    let colorName = "";
    let size = "";

    if (raw.includes("/")) {
      const segs = raw.split("/").map(s=>s.trim()).filter(Boolean);
      if (segs.length >= 2) {
        size = segs[segs.length - 1];
        colorName = segs[segs.length - 2];
      }
    }
    if (!colorName) colorName = product.color_name || product.color || "";
    if (!colorName && raw.includes("-")) colorName = raw.split("-").pop().trim();
    if (!colorName) colorName = "Color Único";
    colorName = capWords(colorName);
    if (!size) size = product.size || `VAR_${v.variant_id}`;

    let hex = product.hex_code || v?.color_code || v?.color_hex || null;
    if (hex && /^#?[0-9A-Fa-f]{3,6}$/.test(hex)) hex = hex.startsWith("#") ? hex : `#${hex}`;
    const ci = colorInfo(colorName);
    if (!hex) hex = ci.hex;

    const img = firstPreview(v?.files) || product.image || sp?.thumbnail_url || null;

    if (!colors[colorName]) colors[colorName] = { hex, label_es: ci.es, image: img, sizes: {} };
    if (!colors[colorName].image && img) colors[colorName].image = img;
    colors[colorName].sizes[size] = v.variant_id;
  }

  const firstColor = Object.keys(colors)[0];
  const cover = (firstColor && colors[firstColor]?.image) || sp?.thumbnail_url || "https://i.postimg.cc/k5ZGwR5W/producto1.png";

  // Sugerencias de imagen local (patrones estándar)
  const pSlug = slug(sp?.name || "");
  for (const [cName, obj] of Object.entries(colors)) {
    const cSlug = slug(cName);
    obj.local_candidates = [
      `/img/${pSlug}__${cSlug}.jpg`,
      `/img/${pSlug}__${cSlug}.png`,
      `/img/${pSlug}/${cSlug}.jpg`,
      `/img/${pSlug}/${cSlug}.png`,
    ];
  }

  // ===== Override manual absoluto si existe =====
  for (const [cName, obj] of Object.entries(colors)) {
    const cSlug = slug(cName);
    const custom = IMAGE_OVERRIDE[pSlug]?.[cSlug];
    if (custom) obj.image = custom;
  }

  const productNameNorm = normName(sp?.name || "");
  const categories = CATEGORY_OVERRIDE[productNameNorm] || detectCategories(sp?.name || "");

  return {
    id: String(sp?.id || sp?.external_id || `pf_${Date.now()}`),
    name: normName(sp?.name || "Producto Printful"),
    price: Number(price.toFixed(2)),
    image: cover,
    sku: sp?.external_id || String(sp?.id || ""),
    categories,
    colors,
    variant_map: firstColor ? { ...colors[firstColor].sizes } : {},
  };
}

function mergeByName(list){
  const map = new Map();
  for (const p of list){
    const key = normName(p.name);
    if (!map.has(key)){
      map.set(key, { ...p, id:key, sku:key, colors: { ...p.colors } });
      continue;
    }
    const tgt = map.get(key);
    tgt.price = Math.min(tgt.price, p.price);
    if (!tgt.image && p.image) tgt.image = p.image;
    for (const [cName, cData] of Object.entries(p.colors||{})){
      if (!tgt.colors[cName]) tgt.colors[cName] = { hex: cData.hex || null, label_es:cData.label_es||cName, image: cData.image || tgt.image, sizes:{} , local_candidates:cData.local_candidates||[]};
      if (!tgt.colors[cName].image && cData.image) tgt.colors[cName].image = cData.image;
      Object.assign(tgt.colors[cName].sizes, cData.sizes||{});
      if (Array.isArray(cData.local_candidates)) {
        tgt.colors[cName].local_candidates = Array.from(new Set([...(tgt.colors[cName].local_candidates||[]), ...cData.local_candidates]));
      }
    }
    const setCats = new Set([...(tgt.categories||[]), ...(p.categories||[])]);
    tgt.categories = Array.from(setCats);
  }
  return Array.from(map.values());
}

// ===== Endpoints =====
router.get("/api/printful/products", async (req,res)=>{
  try{
    if (!process.env.PRINTFUL_API_KEY) return res.status(500).json({ error:"PRINTFUL_API_KEY no configurada en el servidor" });
    res.setHeader("Cache-Control","no-store");

    const force = String(req.query.refresh||"")==="1";
    const now = Date.now();
    if (!force && now - productCache.time < PRODUCT_CACHE_TTL && productCache.data.length){
      return res.json({ products: productCache.data, cached:true });
    }

    const list = await fetchAllSyncedProducts();
    if (!list.length){
      productCache = { time: now, data: [] };
      return res.json({ products: [], note:"No hay productos 'añadidos a tienda' en Printful." });
    }

    const details = await Promise.all(list.map(p=>pfGet(`/store/products/${p.id}`)));
    const normalized = await Promise.all(details.map(normalizeDetail));
    const merged = mergeByName(normalized);

    productCache = { time: now, data: merged };
    res.json({ products: merged, cached:false, refreshed:force });
  }catch(err){
    console.error("PF /products error:", err.message);
    res.status(500).json({ error:String(err.message) });
  }
});

router.post("/api/printful/refresh",(req,res)=>{
  productCache = { time:0, data:[] };
  res.json({ ok:true, msg:"Caché invalidada" });
});

router.get("/api/printful/debug", (req,res)=>{
  const q = String(req.query.name||"").trim().toLowerCase();
  const matches = (productCache.data||[]).filter(p=>p.name.toLowerCase().includes(q));
  res.json({ query:q, matches });
});

export default router;
