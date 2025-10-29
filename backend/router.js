import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* ========= Caché ========= */
let productCache = { time: 0, data: [] };
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1h

/* ========= Helpers ========= */
async function pfGet(path) {
  const r = await fetch(`${PRINTFUL_API}${path}`, { headers: PF_HEADERS });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Printful ${path} -> ${r.status} ${JSON.stringify(json)}`);
  return json;
}
async function fetchAllSyncedProducts() {
  const all = []; let offset = 0; const limit = 100;
  while (true) {
    const res = await pfGet(`/store/products?limit=${limit}&offset=${offset}`);
    const items = res?.result || [];
    all.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}
function detectCategories(name=""){
  const n = name.toLowerCase();
  if (/(tee|t[- ]?shirt|camiseta)/.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera)/.test(n)) return ["sudaderas"];
  if (/(pant|pantal)/.test(n)) return ["pantalones"];
  if (/(shoe|zapatilla|bota)/.test(n)) return ["zapatos"];
  if (/(cap|gorra|beanie|gorro)/.test(n)) return ["accesorios"];
  return ["otros"];
}
const SIZE_ORDER = ["2XS","XXS","XS","S","M","L","XL","2XL","XXL","3XL","4XL","5XL","OS","ONE SIZE","Única","U"];
function sortSizes(a,b){
  const A=a.toUpperCase(),B=b.toUpperCase();
  const ia=SIZE_ORDER.indexOf(A), ib=SIZE_ORDER.indexOf(B);
  if(ia!==-1&&ib!==-1) return ia-ib;
  if(ia!==-1) return -1; if(ib!==-1) return 1;
  return A.localeCompare(B,"es",{numeric:true});
}

/* ========= Normalizador (colores/hex/sizes/imgs) ========= */
function normalize(detail){
  const sp = detail?.result?.sync_product;
  const vars = detail?.result?.sync_variants || [];

  const prices = vars.map(v=>+v.retail_price||0).filter(Boolean);
  const price  = prices.length ? Math.min(...prices) : 0;

  const colors = {}; // { "Black": { hex, image, sizes:{S:123,...} } }
  for(const v of vars){
    const prod = v.product || {};
    // Color name
    let colorName = prod.color_name || prod.color || "Único";
    colorName = colorName.trim();
    const colorDisplay = colorName.charAt(0).toUpperCase() + colorName.slice(1);
    // Hex
    let hex = prod.hex_code || prod.color_code || v.color_code || null;
    if (hex && /^#?[0-9A-Fa-f]{3,6}$/.test(hex)) hex = hex.startsWith("#") ? hex : `#${hex}`;
    // Size
    const size = (prod.size || "Único").trim();
    // Image priorizando preview de variante
    const img =
      (v.files||[]).find(f=>f.type==="preview" && f.preview_url)?.preview_url ||
      (v.files||[]).find(f=>f.preview_url)?.preview_url ||
      (v.files||[]).find(f=>f.thumbnail_url)?.thumbnail_url ||
      sp?.thumbnail_url || null;

    if(!colors[colorDisplay]) colors[colorDisplay] = { hex, image: img, sizes:{} };
    if(!colors[colorDisplay].image && img) colors[colorDisplay].image = img;
    if(!colors[colorDisplay].hex && hex) colors[colorDisplay].hex = hex;
    colors[colorDisplay].sizes[size] = v.variant_id;
  }
  // order sizes
  Object.keys(colors).forEach(c=>{
    const ordered = {};
    Object.keys(colors[c].sizes).sort(sortSizes).forEach(s=>ordered[s]=colors[c].sizes[s]);
    colors[c].sizes = ordered;
  });

  const firstColor = Object.keys(colors)[0];
  const cover = (firstColor && colors[firstColor].image) || sp?.thumbnail_url || null;

  return {
    id: sp.id,
    sku: sp.external_id || String(sp.id),
    name: sp.name,
    price: +price.toFixed(2),
    image: cover,
    categories: detectCategories(sp.name),
    colors
  };
}

/* ========= Endpoints ========= */

// Listado (con caché)
router.get("/api/printful/products", async (req,res)=>{
  try{
    const force = String(req.query.refresh||"")==="1";
    const now = Date.now();
    if(!force && productCache.data.length && now - productCache.time < PRODUCT_CACHE_TTL){
      return res.json({ products: productCache.data, cached:true });
    }
    const list = await fetchAllSyncedProducts();
    const details = await Promise.all(list.map(p=>pfGet(`/store/products/${p.id}`)));
    const products = details.map(normalize);
    productCache = { time: now, data: products };
    res.json({ products, cached:false });
  }catch(e){
    console.error("PF /products", e);
    res.status(500).json({ error:String(e) });
  }
});

// Ficha por SKU (rápido para producto.html)
router.get("/api/printful/product", async (req,res)=>{
  try{
    const sku = String(req.query.sku||"").trim();
    if(!sku) return res.status(400).json({ error:"Falta sku" });
    const list = await fetchAllSyncedProducts();
    const found = list.find(p=>String(p.external_id)===sku || String(p.id)===sku);
    if(!found) return res.status(404).json({ error:"No encontrado" });
    const detail = await pfGet(`/store/products/${found.id}`);
    res.json({ product: normalize(detail) });
  }catch(e){
    console.error("PF /product", e);
    res.status(500).json({ error:String(e) });
  }
});

// Invalidar caché manual
router.post("/api/printful/refresh",(req,res)=>{
  productCache = { time:0, data:[] };
  res.json({ ok:true });
});

export default router;