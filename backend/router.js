// router.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* =======================
   Caché simple en memoria
======================= */
let productCache = { time: 0, data: [] };
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1h

/* =======================
   Helpers Printful
======================= */
async function pfGet(path) {
  const res = await fetch(`${PRINTFUL_API}${path}`, { headers: PF_HEADERS });
  let json = null;
  try { json = await res.json(); } catch {}
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

function detectCategories(name=""){
  const n = String(name||"").toLowerCase();
  if (/(tee|t-shirt|camiseta)/i.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera|sweatshirt)/i.test(n)) return ["sudaderas"];
  if (/(pant|pantal[oó]n|leggings|jogger)/i.test(n)) return ["pantalones"];
  if (/(shoe|sneaker|zapatilla|bota)/i.test(n)) return ["zapatos"];
  if (/(cap|gorra|beanie|gorro|bag|tote)/i.test(n)) return ["accesorios"];
  return ["otros"];
}

function toTitle(s=""){ return s.trim().toLowerCase().replace(/\s+/g," ").replace(/\b\w/g,c=>c.toUpperCase()); }

function colorHexFromName(name=""){
  const k = String(name).trim().toLowerCase();
  const map = {
    black:"#000000","black heather":"#1f1f1f","charcoal":"#36454f","dark gray":"#555555",
    gray:"#808080","athletic heather":"#a7a7a7","silver":"#c0c0c0","ash":"#b2b2b2",
    white:"#ffffff","ivory":"#fffff0","cream":"#fffdd0","beige":"#f5f5dc","sand":"#c2b280",
    navy:"#001f3f","midnight navy":"#001a33","blue":"#0057ff","royal":"#4169e1",
    "light blue":"#87cefa","sky blue":"#87ceeb","cyan":"#00ffff","teal":"#008080",
    green:"#008000","forest":"#0b3d02","olive":"#556b2f","mint":"#98ff98",
    red:"#ff0000","maroon":"#800000","burgundy":"#800020","wine":"#722f37",
    orange:"#ff7f00","rust":"#b7410e","gold":"#ffd700","yellow":"#ffea00","mustard":"#e1ad01",
    purple:"#800080","violet":"#8a2be2","lavender":"#b57edc","magenta":"#ff00ff","pink":"#ffc0cb",
    brown:"#5c4033","chocolate":"#7b3f00","khaki":"#bdb76b",
    // ES
    negro:"#000000", blanco:"#ffffff", gris:"#808080", azul:"#0057ff", rojo:"#ff0000",
    verde:"#008000", amarillo:"#ffea00", naranja:"#ff7f00", morado:"#800080", rosa:"#ffc0cb",
    burdeos:"#800020", beige:"#f5f5dc", marrón:"#5c4033", caqui:"#bdb76b", oro:"#ffd700"
  };
  return map[k] || null;
}

// Mejor imagen a partir de files
function bestImageFromFiles(files=[]){
  const findType = (t)=> files.find(f => String(f?.type||"").toLowerCase()===t && (f.preview_url||f.thumbnail_url||f.url));
  const byPreview = findType("preview");
  const byMockup  = findType("mockup");
  const byDefault = findType("default");
  const anyPrev   = files.find(f=>f.preview_url);
  const anyThumb  = files.find(f=>f.thumbnail_url);
  const anyUrl    = files.find(f=>f.url);
  return (
    byPreview?.preview_url ||
    byMockup?.preview_url ||
    byDefault?.preview_url ||
    anyPrev?.preview_url ||
    anyThumb?.thumbnail_url ||
    anyUrl?.url ||
    null
  );
}

/* =======================
   Normalizador: COLORES + IMÁGENES + TALLAS
======================= */
function normalizeProduct(detail){
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];
  if (!sp) return null;

  const colors = {}; // { ColorName: { hex, image, images[], sizes:{size:variantId} } }
  const prices = [];

  for (const v of variants){
    const prod = v?.product || {};
    const rawName = String(v?.name || "");

    // Detectar color
    let colorName = prod.color_name || prod.color || "";
    if (!colorName && rawName.includes("/")) colorName = rawName.split("/")[0].trim();
    if (!colorName && rawName.includes("-")) colorName = rawName.split("-")[0].trim();
    if (!colorName) colorName = "Color Único";
    colorName = toTitle(colorName);

    // Detectar talla
    let size = prod.size || "";
    if (!size && rawName.includes("/")) size = rawName.split("/").pop().trim();
    if (!size) size = "Único";

    // Imagen por variante → imagen por color
    const img = bestImageFromFiles(v?.files||[]) || prod.image || sp?.thumbnail_url || null;

    const hex = (prod.hex_code && `#${String(prod.hex_code).replace(/^#/,"")}`) || colorHexFromName(colorName) || null;

    if (!colors[colorName]) colors[colorName] = { hex, image: img, images: [], sizes:{} };
    if (!colors[colorName].image && img) colors[colorName].image = img;
    if (img) colors[colorName].images.push(img);
    colors[colorName].sizes[size] = v.variant_id;

    const rp = parseFloat(v.retail_price);
    if (!Number.isNaN(rp)) prices.push(rp);
  }

  // Fallback imagen
  const firstImg = Object.values(colors).find(c=>!!c.image)?.image || sp?.thumbnail_url || "https://i.postimg.cc/k5ZGwR5W/producto1.png";
  Object.values(colors).forEach(c=>{ if(!c.image) c.image = firstImg; });

  const price = prices.length ? Math.min(...prices) : 0;

  // Slug compartible estable
  const slug = `${String(sp?.name||"producto").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")}-${sp?.id||Date.now()}`;

  // Variante inicial (primer color)
  const firstColor = Object.keys(colors)[0];
  const variant_map = firstColor ? { ...colors[firstColor].sizes } : {};

  return {
    id: String(sp?.id || ""),
    name: sp?.name || "Producto Printful",
    price: Number(price.toFixed(2)),
    image: firstImg,
    sku: sp?.external_id || String(sp?.id || ""),
    categories: detectCategories(sp?.name || ""),
    colors,        // { "Agave": { hex, image, images[], sizes:{S:123,...} }, ... }
    variant_map,
    slug
  };
}

/* =======================
   Endpoints
======================= */
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
    const products = details.map(normalizeProduct).filter(Boolean);

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