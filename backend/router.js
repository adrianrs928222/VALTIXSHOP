import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

let productCache = { time: 0, data: [] };
const PRODUCT_CACHE_TTL = 60 * 60 * 1000;

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
  if (/(tee|t[-\s]?shirt|camiseta)/.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera)/.test(n)) return ["sudaderas"];
  if (/(pant|pantal[oó]n|leggings|jogger)/.test(n)) return ["pantalones"];
  if (/(shoe|sneaker|zapatilla|bota)/.test(n)) return ["zapatos"];
  if (/(cap|gorra|beanie|gorro)/.test(n)) return ["accesorios"];
  return ["otros"];
}
function hexFromName(name=""){
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
    brown:"#5c4033","chocolate":"#7b3f00","khaki:"#bdb76b",
    // ES
    negro:"#000000", blanco:"#ffffff", gris:"#808080", azul:"#0057ff", rojo:"#ff0000",
    verde:"#008000", amarillo:"#ffea00", naranja:"#ff7f00", morado:"#800080", rosa:"#ffc0cb",
    burdeos:"#800020", beige:"#f5f5dc", marrón:"#5c4033", caqui:"#bdb76b", oro:"#ffd700"
  };
  return map[k] || null;
}

function normalize(detail){
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  const prices = variants.map(v=>parseFloat(v.retail_price)).filter(n=>!Number.isNaN(n));
  const price  = prices.length ? Math.min(...prices) : 0;

  const cap = s => String(s||"").toLowerCase().replace(/\s+/g," ").replace(/\b\w/g,c=>c.toUpperCase());
  const colors = {};

  for (const v of variants){
    const prod = v?.product || {};
    const raw  = String(v?.name || "").trim();

    let color = prod.color_name || prod.color || "";
    if (!color && raw.includes("/")) color = raw.split("/")[0].split("-").pop().trim();
    if (!color && raw.includes("-")) color = raw.split("-").pop().trim();
    if (!color) color = "Único";
    color = cap(color);

    let hex = prod.hex_code || prod.color_code || null;
    if (hex && /^#?[0-9A-Fa-f]{3,6}$/.test(hex)) hex = hex.startsWith("#") ? hex : `#${hex}`;
    if (!hex) hex = hexFromName(color);

    let size = prod.size || "";
    if (!size && raw.includes("/")) size = raw.split("/").pop().trim();
    if (!size) size = `VAR_${v.variant_id}`;

    const img =
      (v?.files||[]).find(f=>f.type==="preview" && f.preview_url)?.preview_url ||
      (v?.files||[]).find(f=>f.preview_url)?.preview_url ||
      (v?.files||[]).find(f=>f.thumbnail_url)?.thumbnail_url ||
      (v?.files||[]).find(f=>f.url)?.url ||
      sp?.thumbnail_url || null;

    if (!colors[color]) colors[color] = { hex, image: img, sizes:{} };
    if (!colors[color].image && img) colors[color].image = img;
    colors[color].sizes[size] = v.variant_id;
  }

  const firstColor = Object.keys(colors)[0];
  const cover =
    (firstColor && colors[firstColor]?.image) ||
    sp?.thumbnail_url ||
    "https://i.postimg.cc/k5ZGwR5W/producto1.png";

  return {
    id: String(sp?.id || ""),
    sku: sp?.external_id || String(sp?.id || ""),
    name: sp?.name || "Producto Printful",
    price: Number(price.toFixed(2)),
    image: cover,
    categories: detectCategories(sp?.name || ""),
    colors
  };
}

router.get("/api/printful/products", async (req, res) => {
  try{
    if (!process.env.PRINTFUL_API_KEY) return res.status(500).json({ error: "PRINTFUL_API_KEY no configurada" });
    const now = Date.now();
    const force = String(req.query.refresh||"") === "1";

    if (!force && productCache.data.length && now - productCache.time < PRODUCT_CACHE_TTL) {
      return res.json({ products: productCache.data, cached:true });
    }

    const list = await fetchAllSyncedProducts();
    if (!list.length) return res.json({ products: [], note:"Sin productos añadidos a tienda en Printful." });

    const details = await Promise.all(list.map(p => pfGet(`/store/products/${p.id}`)));
    const products = details.map(normalize);

    productCache = { time: now, data: products };
    res.json({ products, cached:false });
  }catch(e){
    console.error("PF /products error:", e);
    res.status(500).json({ error:String(e.message||e) });
  }
});

router.get("/api/printful/product", async (req,res)=>{
  try{
    if (!process.env.PRINTFUL_API_KEY) return res.status(500).json({ error: "PRINTFUL_API_KEY no configurada" });
    const sku = String(req.query.sku||"").trim();
    if (!sku) return res.status(400).json({ error:"sku requerido" });

    const list = await fetchAllSyncedProducts();
    const found = list.find(p => String(p.external_id)===sku || String(p.id)===sku);
    if (!found) return res.status(404).json({ error:"Producto no encontrado" });

    const detail = await pfGet(`/store/products/${found.id}`);
    return res.json({ product: normalize(detail) });
  }catch(e){
    res.status(500).json({ error:String(e.message||e) });
  }
});

router.post("/api/printful/refresh",(req,res)=>{
  productCache = { time:0, data:[] };
  res.json({ ok:true, msg:"caché invalidada" });
});

export default router;