import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* =========================
   Caché en memoria
========================= */
let productCache = {
  time: 0,
  data: [],              // productos normalizados
  rawIds: [],            // ids de Printful cacheados (para invalidaciones finas si hiciera falta)
};
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1h

/* =========================
   Helpers de red
========================= */
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

/* =========================
   Clasificación de categorías
========================= */
function detectCategories(name = "") {
  const n = String(name).toLowerCase();
  if (/(tee|t[-\s]?shirt|camiseta)/i.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera)/i.test(n)) return ["sudaderas"];
  if (/(pant|pantal[oó]n|leggings|jogger)/i.test(n)) return ["pantalones"];
  if (/(shoe|sneaker|zapatilla|bota)/i.test(n)) return ["zapatos"];
  if (/(cap|gorra|beanie|gorro)/i.test(n)) return ["accesorios"];
  return ["otros"];
}

/* =========================
   Color → HEX (map amplio)
   Se respeta hex_code nativo si existe.
========================= */
function colorHexFromName(name = "") {
  const k = String(name).trim().toLowerCase().replace(/\s+/g, " ");
  const map = {
    black:"#000000","black heather":"#1f1f1f","charcoal":"#36454f","dark gray":"#555555",
    grey:"#808080","gray":"#808080","athletic heather":"#a7a7a7","silver":"#c0c0c0","ash":"#b2b2b2",
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
    burdeos:"#800020", beige:"#f5f5dc", marrón:"#5c4033", caqui:"#bdb76b", oro:"#ffd700",
    marino:"#001f3f", crema:"#fffdd0", celeste:"#87cefa"
  };
  return map[k] || null;
}

/* =========================
   Orden de tallas
========================= */
const SIZE_ORDER = ["2XS","XXS","XS","S","M","L","XL","2XL","XXL","3XL","4XL","5XL","OS","ONE SIZE","Única","U","Talla Única"];
function sortSizes(a, b) {
  const A = String(a).toUpperCase();
  const B = String(b).toUpperCase();
  const ia = SIZE_ORDER.indexOf(A);
  const ib = SIZE_ORDER.indexOf(B);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  // fallback alfanumérico
  return A.localeCompare(B, "es", { numeric: true });
}

/* =========================
   Normalizador robusto
   - Colores case-insensitive
   - Merge de duplicados
   - HEX nativo > por nombre
========================= */
function normalizeProduct(detail) {
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  // precio base (mínimo retail de variantes)
  const prices = variants.map(v => parseFloat(v.retail_price)).filter(n => !Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : 0;

  const cap = s => String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const colors = {}; // { DisplayName: { key, hex, image, sizes:{size:variant_id} } }
  const colorKeyMap = {}; // lower → DisplayName elegido

  for (const v of variants) {
    const product = v?.product || {};
    const raw = String(v?.name || "").trim();

    // COLOR
    let colorName = product.color_name || product.color || "";
    if (!colorName && raw.includes("/")) colorName = raw.split("/")[0].split("-").pop().trim();
    if (!colorName && raw.includes("-")) colorName = raw.split("-").pop().trim();
    if (!colorName) colorName = "Color Único";
    const colorDisplay = cap(colorName);
    const colorKey = colorDisplay.toLowerCase();

    // HEX: nativo o por nombre
    let hex = product.hex_code || v?.color_code || v?.color_hex || null;
    if (hex && /^#?[0-9A-Fa-f]{3,6}$/.test(hex)) hex = hex.startsWith("#") ? hex : `#${hex}`;
    if (!hex) hex = colorHexFromName(colorDisplay);

    // TALLA
    let size = product.size || "";
    if (!size && raw.includes("/")) size = raw.split("/").pop().trim();
    if (!size) size = `VAR_${v.variant_id}`;

    // IMAGEN preferente por fichero de variante
    const fromFiles =
      (v?.files || []).find(f => f.type === "preview" && f.preview_url)?.preview_url ||
      (v?.files || []).find(f => f.preview_url)?.preview_url ||
      (v?.files || []).find(f => f.thumbnail_url)?.thumbnail_url ||
      (v?.files || []).find(f => f.url)?.url ||
      product.image ||
      sp?.thumbnail_url ||
      null;

    // Merge por color (case-insensitive)
    const displayName = colorKeyMap[colorKey] || colorDisplay;
    colorKeyMap[colorKey] = displayName;

    if (!colors[displayName]) colors[displayName] = { hex, image: fromFiles, sizes: {} };
    else {
      // preserva primera imagen; si no tenía, pone la nueva
      if (!colors[displayName].image && fromFiles) colors[displayName].image = fromFiles;
      // si el nuevo hex es válido y el anterior no, actualiza
      if (!colors[displayName].hex && hex) colors[displayName].hex = hex;
    }
    colors[displayName].sizes[size] = v.variant_id;
  }

  // ordena tallas dentro de cada color
  for (const c of Object.keys(colors)) {
    const sizes = Object.keys(colors[c].sizes).sort(sortSizes);
    const ordered = {};
    sizes.forEach(s => ordered[s] = colors[c].sizes[s]);
    colors[c].sizes = ordered;
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

/* =========================
   Carga y normaliza todo
========================= */
async function getNormalizedProducts(force = false) {
  const now = Date.now();
  if (!force && productCache.data.length && (now - productCache.time < PRODUCT_CACHE_TTL)) {
    return productCache.data;
  }

  const list = await fetchAllSyncedProducts();
  if (!list.length) {
    productCache = { time: now, data: [], rawIds: [] };
    return [];
  }

  const details = await Promise.all(list.map(p => pfGet(`/store/products/${p.id}`)));
  const products = details.map(normalizeProduct);

  productCache = { time: now, data: products, rawIds: list.map(l => l.id) };
  return products;
}

/* =========================
   Endpoints
========================= */

/**
 * GET /api/printful/products
 * Query opcionales:
 *  - q=texto           (búsqueda por nombre, case-insensitive)
 *  - category=camisetas|sudaderas|pantalones|zapatos|accesorios|otros
 *  - limit=20&offset=0 (paginación ligera)
 *  - refresh=1         (forzar recarga de caché)
 */
router.get("/api/printful/products", async (req, res) => {
  try {
    if (!process.env.PRINTFUL_API_KEY) {
      return res.status(500).json({ error: "PRINTFUL_API_KEY no configurada en el servidor" });
    }
    res.setHeader("Cache-Control", "no-store");

    const force = String(req.query.refresh || "") === "1";
    const q = String(req.query.q || "").trim().toLowerCase();
    const category = String(req.query.category || "").trim().toLowerCase();
    const limit = Math.min(Math.max(parseInt(req.query.limit || "0", 10) || 0, 0), 100);
    const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);

    const all = await getNormalizedProducts(force);

    // filtros
    let filtered = all;
    if (q) filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    if (category) filtered = filtered.filter(p => Array.isArray(p.categories) && p.categories.some(c => c.toLowerCase() === category));

    const total = filtered.length;

    // paginación
    const slice = (limit > 0) ? filtered.slice(offset, offset + limit) : filtered;

    return res.json({
      products: slice,
      total,
      offset,
      limit: (limit > 0) ? limit : undefined,
      cached: !force,
      refreshed: force || undefined
    });
  } catch (err) {
    console.error("PF /products error:", err.message);
    res.status(500).json({ error: String(err.message) });
  }
});

/**
 * GET /api/printful/product/:sku
 *      /api/printful/product?sku=...
 * Devuelve 1 producto por external_id (sku).
 */
router.get("/api/printful/product/:sku?", async (req, res) => {
  try {
    if (!process.env.PRINTFUL_API_KEY) {
      return res.status(500).json({ error: "PRINTFUL_API_KEY no configurada en el servidor" });
    }
    res.setHeader("Cache-Control", "no-store");

    const sku = String(req.params.sku || req.query.sku || "").trim();
    if (!sku) return res.status(400).json({ error: "sku requerido" });

    const all = await getNormalizedProducts(false);
    const p = all.find(x => String(x.sku).trim() === sku);
    if (!p) return res.status(404).json({ error: "Producto no encontrado" });

    return res.json({ product: p });
  } catch (e) {
    console.error("PF /product error:", e.message);
    res.status(500).json({ error: String(e.message) });
  }
});

/**
 * POST /api/printful/refresh
 * Invalida la caché para recargar en la siguiente llamada.
 */
router.post("/api/printful/refresh", (req, res) => {
  productCache = { time: 0, data: [], rawIds: [] };
  res.json({ ok: true, msg: "Caché invalidada" });
});

export default router;