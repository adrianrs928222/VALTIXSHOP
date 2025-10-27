import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* ========== Cache ========== */
let productCache = { time: 0, data: [] };
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1 hora

/* ========== Helpers ========== */
async function pfGet(path) {
  const url = `${PRINTFUL_API}${path}`;
  const res = await fetch(url, { headers: PF_HEADERS });

  let payload = null;
  try {
    payload = await res.json();
  } catch {}

  if (!res.ok) {
    const msg = payload?.error || payload || (await res.text().catch(() => ""));
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

function detectCategories(name = "") {
  const n = name.toLowerCase();
  if (/(tee|t-shirt|camiseta)/i.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera)/i.test(n)) return ["sudaderas"];
  if (/(pant|pantal[oó]n|leggings|jogger)/i.test(n)) return ["pantalones"];
  if (/(shoe|sneaker|zapatilla|bota)/i.test(n)) return ["zapatos"];
  if (/(cap|gorra|beanie|gorro)/i.test(n)) return ["accesorios"];
  return ["otros"];
}

/* ========== Normalizador ========== */
function normalizeProduct(detail) {
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  // Precio base
  const prices = variants.map(v => parseFloat(v.retail_price)).filter(n => !Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : 0;

  // Agrupar por color
  const colors = {};
  for (const v of variants) {
    const product = v?.product || {};
    const raw = v?.name || "";

    let color = (product.color_name || product.color || "").trim();
    if (!color && raw.includes("/")) color = raw.split("/")[0].trim();
    if (!color) color = "Color único";

    let size = (product.size || "").trim();
    if (!size && raw.includes("/")) size = raw.split("/").pop().trim();
    if (!size) size = `VAR_${v.variant_id}`;

    // extraer HEX si existe
    let hex = null;
    const hexMatch = product.hex_code || v?.color_code || v?.color_hex;
    if (hexMatch && /^#?[0-9A-Fa-f]{3,6}$/.test(hexMatch)) {
      hex = hexMatch.startsWith("#") ? hexMatch : `#${hexMatch}`;
    }

    // extraer imagen
    const variantImage =
      v?.files?.find(f => f.preview_url)?.preview_url ||
      v?.files?.find(f => f.thumbnail_url)?.thumbnail_url ||
      product.image ||
      sp?.thumbnail_url ||
      "https://i.postimg.cc/k5ZGwR5W/producto1.png";

    if (!colors[color]) {
      colors[color] = { hex, image: variantImage, sizes: {} };
    }
    colors[color].sizes[size] = v.variant_id;
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
    colors,
    variant_map,
  };
}

/* ========== Endpoints ========== */

// 🛍️ Productos Printful (con refresco manual y caché)
router.get("/api/printful/products", async (req, res) => {
  try {
    if (!process.env.PRINTFUL_API_KEY) {
      return res.status(500).json({ error: "PRINTFUL_API_KEY no configurada en el servidor" });
    }

    res.setHeader("Cache-Control", "no-store");
    const now = Date.now();
    const force = String(req.query.refresh || "") === "1";

    if (!force && now - productCache.time < PRODUCT_CACHE_TTL && productCache.data.length) {
      return res.json({ products: productCache.data, cached: true });
    }

    const list = await fetchAllSyncedProducts();
    if (!list.length) {
      productCache = { time: now, data: [] };
      return res.json({ products: [], note: "No hay productos 'añadidos a tienda' en Printful." });
    }

    const details = await Promise.all(list.map(p => pfGet(`/store/products/${p.id}`)));
    const products = details.map(normalizeProduct);

    productCache = { time: now, data: products };
    res.json({ products, cached: false, refreshed: force });
  } catch (err) {
    console.error("PF /products error:", err.message);
    res.status(500).json({ error: String(err.message) });
  }
});

// 🔄 Endpoint para borrar caché manualmente
router.post("/api/printful/refresh", (req, res) => {
  productCache = { time: 0, data: [] };
  res.json({ ok: true, msg: "Caché invalidada correctamente" });
});

export default router;