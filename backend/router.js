// router.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

// ===================== Caché =====================
let productCache = { time: 0, data: [] };
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1h

// ===================== Helpers =====================
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
};

function bestImageFromFiles(files=[]){
  const byType=(t)=>files.find(f=>String(f?.type||"").toLowerCase()===t && (f.preview_url||f.thumbnail_url||f.url));
  return (
    byType("preview")?.preview_url ||
    files.find(f=>f.preview_url)?.preview_url ||
    files.find(f=>f.thumbnail_url)?.thumbnail_url ||
    files.find(f=>f.url)?.url || null
  );
}

// ============ Normaliza UN producto de Printful ============
function normalizeFromSyncDetail(detail){
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];
  if (!sp) return null;

  const colors = {};
  const prices = [];
  const rawNames = [];

  for (const v of variants){
    const prod = v?.product || {};
    const raw = String(v?.name || "");
    rawNames.push(raw);

    // COLOR
    let colorName = prod.color_name || prod.color || "";
    if (!colorName && raw.includes("/")) colorName = raw.split("/")[0].trim();
    if (!colorName && raw.includes("-")) colorName = raw.split("-")[0].trim();
    if (!colorName) colorName = "Color Único";
    colorName = toTitle(colorName);

    // TALLA
    let size = prod.size || "";
    if (!size && raw.includes("/")) size = raw.split("/").pop().trim();
    if (!size) size = "Único";

    // IMAGEN
    const img = bestImageFromFiles(v?.files||[]) || prod.image || sp?.thumbnail_url || null;
    const hex = (prod.hex_code && `#${String(prod.hex_code).replace(/^#/,"")}`) || colorHexFromName(colorName) || null;

    if (!colors[colorName]) colors[colorName] = { hex, image: img, images: [], sizes:{} };
    if (!colors[colorName].image && img) colors[colorName].image = img;
    if (img) colors[colorName].images.push(img);
    colors[colorName].sizes[size] = v.variant_id;

    const rp = parseFloat(v.retail_price);
    if (!Number.isNaN(rp)) prices.push(rp);
  }

  const firstImg = Object.values(colors).find(c=>c.image)?.image || sp?.thumbnail_url || null;
  Object.values(colors).forEach(c=>{ if(!c.image) c.image = firstImg; });

  const price = prices.length ? Math.min(...prices) : 0;
  const name = sp?.name || "Producto";
  const rootName = toTitle(name.split("/")[0].split("-")[0].trim());
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")}-${sp?.id}`;

  return {
    id: String(sp?.id || ""),
    name,
    rootName,
    price: Number(price.toFixed(2)),
    image: firstImg,
    sku: sp?.external_id || String(sp?.id || ""),
    categories: ["otros"],
    colors,
    variant_map: {},
    slug,
    __rawNames: rawNames
  };
}

// ============ Fusión por rootName ============
function mergeByRoot(products){
  const map = new Map();
  for (const p of products){
    const key = p.rootName || p.name;
    if (!map.has(key)) {
      map.set(key, { ...p, name: key, colors: { ...p.colors } });
      continue;
    }
    const acc = map.get(key);
    acc.price = Math.min(acc.price || Infinity, p.price || Infinity);
    acc.image = acc.image || p.image;
    for (const [cname, meta] of Object.entries(p.colors||{})){
      if (!acc.colors[cname]) acc.colors[cname] = { hex: meta.hex, image: meta.image, images:[...meta.images], sizes: { ...meta.sizes } };
      else {
        if (!acc.colors[cname].image && meta.image) acc.colors[cname].image = meta.image;
        acc.colors[cname].images.push(...(meta.images||[]));
        acc.colors[cname].sizes = { ...acc.colors[cname].sizes, ...meta.sizes };
      }
    }
  }
  for (const p of map.values()){
    const firstColor = Object.keys(p.colors||{})[0];
    p.variant_map = firstColor ? { ...p.colors[firstColor].sizes } : {};
  }
  return Array.from(map.values());
}

// ============ OVERRIDES con tus mockups por color ============
const CUSTOM_IMAGES = {
  // Cambia "Valtix V" por el nombre raíz de tu producto;
  // y pon la URL pública de tu imagen para cada color:
  "Valtix V": {
    "Agave": "https://adrianrs928222.github.io/VALTIXSHOP/assets/valtix-v/valtix-v_agave.jpg",
    "Adobe": "https://adrianrs928222.github.io/VALTIXSHOP/assets/valtix-v/valtix-v_adobe.jpg",
    "Black": "https://adrianrs928222.github.io/VALTIXSHOP/assets/valtix-v/valtix-v_black.jpg"
  }
};

function applyCustomImages(mergedProducts){
  for (const p of mergedProducts) {
    const byRoot = CUSTOM_IMAGES[p.rootName] || CUSTOM_IMAGES[p.name];
    if (!byRoot) continue;

    for (const [cname, meta] of Object.entries(p.colors || {})) {
      const customUrl = byRoot[cname];
      if (customUrl) {
        meta.image = customUrl;
        meta.images = [customUrl, ...(meta.images || [])];
      } else {
        // patrón automático opcional si nombras los ficheros por color
        const slugColor = cname.toLowerCase().replace(/\s+/g,'-');
        const autoUrl = `https://adrianrs928222.github.io/VALTIXSHOP/assets/valtix-v/valtix-v_${slugColor}.jpg`;
        meta.images = [autoUrl, ...(meta.images || [])];
        if (!meta.image) meta.image = autoUrl;
      }
    }
    const firstColor = Object.keys(p.colors||{})[0];
    if (firstColor && p.colors[firstColor]?.image) p.image = p.colors[firstColor].image;
  }
  return mergedProducts;
}

// ===================== Endpoints =====================
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
      return res.json({
        debug: true,
        count_raw: normalized.length,
        roots: normalized.map(p=>({ id:p.id, name:p.name, root:p.rootName, raw:p.__rawNames?.slice(0,6)||[] }))
      });
    }

    let merged = mergeByRoot(normalized);
    merged = applyCustomImages(merged);

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