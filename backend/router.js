import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* ---------- Caché ---------- */
let productCache = { time: 0, data: [] };
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1h

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

function detectCategories(name=""){
  const n = name.toLowerCase();
  if (/(tee|t-shirt|camiseta)/i.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera)/i.test(n)) return ["sudaderas"];
  if (/(pant|pantal[oó]n|leggings|jogger)/i.test(n)) return ["pantalones"];
  if (/(shoe|sneaker|zapatilla|bota)/i.test(n)) return ["zapatos"];
  if (/(cap|gorra|beanie|gorro)/i.test(n)) return ["accesorios"];
  return ["otros"];
}

/* ---------- Color → HEX (map amplio + códigos nativos) ---------- */
function colorHexFromName(name=""){
  const k = String(name).trim().toLowerCase().replace(/\s+/g," ");
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

/* ---------- Normalizador robusto: COLORES (HEX) + FOTO POR COLOR + TALLAS ---------- */
function normalizeProduct(detail){
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  // precio base
  const prices = variants.map(v=>parseFloat(v.retail_price)).filter(n=>!Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : 0;

  const cap = s => String(s||"").toLowerCase().replace(/\s+/g," ").replace(/\b\w/g,c=>c.toUpperCase());
  const colors = {};

  for (const v of variants){
    const product = v?.product || {};
    const raw = String(v?.name || "").trim();

    // --- COLOR ---
    let colorName =
      product.color_name || product.color || "";
    if (!colorName && raw.includes("/")) colorName = raw.split("/")[0].split("-").pop().trim();
    if (!colorName && raw.includes("-")) colorName = raw.split("-").pop().trim();
    if (!colorName) colorName = "Color Único";
    colorName = cap(colorName);

    // HEX: nativo (color_code/hex_code) o por nombre
    let hex = product.hex_code || v?.color_code || v?.color_hex || null;
    if (hex && /^#?[0-9A-Fa-f]{3,6}$/.test(hex)) hex = hex.startsWith("#") ? hex : `#${hex}`;
    if (!hex) hex = colorHexFromName(colorName);

    // --- TALLA ---
    let size = product.size || "";
    if (!size && raw.includes("/")) size = raw.split("/").pop().trim();
    if (!size) size = `VAR_${v.variant_id}`;

    // --- IMAGEN POR COLOR ---
    const fromFiles =
      (v?.files||[]).find(f=>f.type==="preview" && f.preview_url)?.preview_url ||
      (v?.files||[]).find(f=>f.preview_url)?.preview_url ||
      (v?.files||[]).find(f=>f.thumbnail_url)?.thumbnail_url ||
      (v?.files||[]).find(f=>f.url)?.url ||
      product.image ||
      sp?.thumbnail_url ||
      null;

    if (!colors[colorName]) colors[colorName] = { hex, image: fromFiles, sizes:{} };
    if (!colors[colorName].image && fromFiles) colors[colorName].image = fromFiles;
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
    name: sp?.name || "Producto Printful",
    price: Number(price.toFixed(2)),
    image: cover,
    sku: sp?.external_id || String(sp?.id || ""),
    categories: detectCategories(sp?.name || ""),
    colors,       // { "Navy": {hex:"#001f3f", image:"...", sizes:{S:123,...}} , ... }
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
    const products = details.map(normalizeProduct);

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
