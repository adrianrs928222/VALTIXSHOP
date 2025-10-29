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
const catalogVariantCache = new Map(); // variant_id -> { size, color, color_code, product_id }

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

async function fetchCatalogVariant(variantId) {
  if (catalogVariantCache.has(variantId)) return catalogVariantCache.get(variantId);
  const data = await pfGet(`/products/variant/${variantId}`);
  const v = data?.result?.variant || {};
  const out = {
    size: v.size || "",
    color: v.color || "",
    color_code: v.color_code || null,
    product_id: v.product_id || null,
  };
  catalogVariantCache.set(variantId, out);
  return out;
}

async function fetchCatalogVariantsBatch(variantIds = []) {
  const unique = [...new Set(variantIds.map(String))];
  const result = {};
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

function detectCategories(name=""){
  const n = name.toLowerCase();
  if (/(tee|t-shirt|camiseta)/i.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera)/i.test(n)) return ["sudaderas"];
  if (/(pant|pantal[oó]n|leggings|jogger)/i.test(n)) return ["pantalones"];
  if (/(shoe|sneaker|zapatilla|bota)/i.test(n)) return ["zapatos"];
  if (/(cap|gorra|beanie|gorro)/i.test(n)) return ["accesorios"];
  return ["otros"];
}

function slugify(s=""){
  return String(s)
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}

function normalizeProduct(detail, catalogMap){
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  const prices = variants.map(v=>parseFloat(v.retail_price)).filter(n=>!Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : 0;

  const colors = {}; // { [Color]: { hex, image, sizes: { [Size]: variant_id } } }

  for (const v of variants){
    const vid = String(v?.variant_id || "");
    if (!vid) continue;

    const cv = catalogMap[vid] || {};
    const colorName = String(cv.color || "Color Único").trim();
    const size = String(cv.size || "").trim() || `VAR_${vid}`;

    let hex = cv.color_code ? (String(cv.color_code).startsWith("#") ? cv.color_code : `#${cv.color_code}`) : null;

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

  const firstColor = Object.keys(colors)[0];
  const cover =
    (firstColor && colors[firstColor]?.image) ||
    sp?.thumbnail_url ||
    "https://i.postimg.cc/k5ZGwR5W/producto1.png";

  const variant_map = firstColor ? { ...colors[firstColor].sizes } : {};

  return {
    id: String(sp?.id || sp?.external_id || `pf_${Date.now()}`),
    pid: String(sp?.id || ""),
    name: sp?.name || "Producto Printful",
    slug: slugify(`${sp?.name || "producto"}-${sp?.id || ""}`),
    price: Number(price.toFixed(2)),
    image: cover,
    sku: sp?.external_id || String(sp?.id || ""),
    categories: detectCategories(sp?.name || ""),
    colors,
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

    const list = await fetchAllSyncedProducts();
    if (!list.length){
      productCache = { time: now, data: [] };
      return res.json({ products: [], note:"No hay productos 'añadidos a tienda' en Printful." });
    }

    const details = await Promise.all(list.map(p=>pfGet(`/store/products/${p.id}`)));

    const allVariantIds = [];
    for (const d of details){
      const vs = d?.result?.sync_variants || [];
      vs.forEach(v => { if (v?.variant_id) allVariantIds.push(String(v.variant_id)); });
    }
    const catalogMap = await fetchCatalogVariantsBatch(allVariantIds);

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