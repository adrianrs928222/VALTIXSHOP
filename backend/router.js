import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* ---------- Cachés ---------- */
let productCache = { time: 0, data: [] };
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1h

// cache catálogo de variantes para evitar N llamadas repetidas
const catalogVariantCache = new Map(); // key: variant_id -> { color, color_code, size, product_id }

/* ---------- Helpers ---------- */
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

/** Consulta el catálogo por variant_id: devuelve { color, color_code, size, product_id } */
async function fetchCatalogVariant(variantId) {
  if (catalogVariantCache.has(variantId)) return catalogVariantCache.get(variantId);
  const data = await pfGet(`/products/variant/${variantId}`);
  // estructura: { result: { variant: { id, size, color, color_code, product_id, ... } } }
  const v = data?.result?.variant || {};
  const out = {
    size: v.size || "",
    color: v.color || "",
    color_code: v.color_code || null, // suele venir como HEX sin "#"
    product_id: v.product_id || null,
  };
  catalogVariantCache.set(variantId, out);
  return out;
}

/** Batch: dado un array de variant_ids (string/number), devuelve {id: info} */
async function fetchCatalogVariantsBatch(variantIds = []) {
  const unique = [...new Set(variantIds.map(String))];
  const result = {};
  // paraleliza pero limita un poco (simple throttle)
  const chunkSize = 12;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const slice = unique.slice(i, i + chunkSize);
    const chunk = await Promise.all(
      slice.map(async (id) => {
        try { return [id, await fetchCatalogVariant(id)]; }
        catch (e) { console.error("Catalog variant error", id, e.message); return [id, null]; }
      })
    );
    for (const [id, info] of chunk) result[id] = info;
  }
  return result;
}

/* ---------- Clasificador simple por nombre de producto ---------- */
function detectCategories(name=""){
  const n = name.toLowerCase();
  if (/(tee|t-shirt|camiseta)/i.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera)/i.test(n)) return ["sudaderas"];
  if (/(pant|pantal[oó]n|leggings|jogger)/i.test(n)) return ["pantalones"];
  if (/(shoe|sneaker|zapatilla|bota)/i.test(n)) return ["zapatos"];
  if (/(cap|gorra|beanie|gorro)/i.test(n)) return ["accesorios"];
  return ["otros"];
}

/* ---------- Normalizador FINAL usando catálogo oficial ---------- */
function normalizeProduct(detail, catalogMap){
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  // precio base (mínimo retail)
  const prices = variants.map(v=>parseFloat(v.retail_price)).filter(n=>!Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : 0;

  const colors = {}; // { [Color Name]: { hex, image, sizes: { [Size]: variant_id } } }

  for (const v of variants){
    const vid = String(v?.variant_id || "");
    if (!vid) continue;

    // Datos oficiales del catálogo
    const cv = catalogMap[vid] || {};
    const colorName = String(cv.color || "Color Único").trim();
    const size = String(cv.size || "").trim() || `VAR_${vid}`;
    // HEX directo del catálogo (color_code) o null
    let hex = cv.color_code ? (cv.color_code.startsWith("#") ? cv.color_code : `#${cv.color_code}`) : null;

    // Imagen preferida de esa variante (preview del file)
    const fromFiles =
      (v?.files||[]).find(f=>f.type==="preview" && f.preview_url)?.preview_url ||
      (v?.files||[]).find(f=>f.preview_url)?.preview_url ||
      (v?.files||[]).find(f=>f.thumbnail_url)?.thumbnail_url ||
      (v?.files||[]).find(f=>f.url)?.url ||
      null;

    if (!colors[colorName]) colors[colorName] = { hex, image: fromFiles, sizes:{} };
    if (!colors[colorName].image && fromFiles) colors[colorName].image = fromFiles;
    if (!colors[colorName].hex && hex) colors[colorName].hex = hex;

    colors[colorName].sizes[size] = vid;
  }

  // Portada: primera imagen de color o miniatura de producto
  const firstColor = Object.keys(colors)[0];
  const cover =
    (firstColor && colors[firstColor]?.image) ||
    sp?.thumbnail_url ||
    "https://i.postimg.cc/k5ZGwR5W/producto1.png";

  const variant_map = firstColor ? { ...colors[firstColor].sizes } : {};

  return {
    id: String(sp?.id || sp?.external_id || `pf_${Date.now()}`),
    name: sp?.name || "Producto Printful",
    price: Number(price.toFixed(2)),
    image: cover,
    sku: sp?.external_id || String(sp?.id || ""),
    categories: detectCategories(sp?.name || ""),
    colors,      // ← ahora viene 1:1 con el catálogo oficial
    variant_map,
  };
}

/* ---------- Endpoints ---------- */
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

    // 1) Lista de productos de la tienda
    const list = await fetchAllSyncedProducts();
    if (!list.length){
      productCache = { time: now, data: [] };
      return res.json({ products: [], note:"No hay productos 'añadidos a tienda' en Printful." });
    }

    // 2) Detalles de cada producto
    const details = await Promise.all(list.map(p=>pfGet(`/store/products/${p.id}`)));

    // 3) Recolectar TODOS los variant_id para pedir al catálogo oficial
    const allVariantIds = [];
    for (const d of details){
      const vs = d?.result?.sync_variants || [];
      vs.forEach(v => { if (v?.variant_id) allVariantIds.push(String(v.variant_id)); });
    }
    const catalogMap = await fetchCatalogVariantsBatch(allVariantIds);

    // 4) Normalizar con datos oficiales de color/size/hex por variant_id
    const products = details.map(detail => normalizeProduct(detail, catalogMap));

    productCache = { time: now, data: products };
    res.json({ products, cached:false, refreshed:force });
  }catch(err){
    console.error("PF /products error:", err.message);
    res.status(500).json({ error:String(err.message) });
  }
});

router.post("/api/printful/refresh",(req,res)=>{
  productCache = { time:0, data:[] };
  res.json({ ok:true, msg:"Caché invalidada" });
});

export default router;