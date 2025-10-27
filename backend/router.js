// router.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* ========= Cache simple (1h) ========= */
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1 hora
let productCache = { time: 0, data: [] };

/* ========= Helpers ========= */
async function pfGet(path) {
  const url = `${PRINTFUL_API}${path}`;
  const res = await fetch(url, { headers: PF_HEADERS });

  let payload = null;
  try { payload = await res.json(); } catch {}

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

/* ========= Normalizador robusto (colores + tallas + imagen por color) ========= */
function normalizeProduct(detail) {
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  // Precio mínimo entre variantes
  const prices = variants.map(v => parseFloat(v.retail_price)).filter(n => !Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : 0;

  // Normalizador de nombre de color
  const normColor = (raw = "") => {
    const base = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
    if (!base) return "";
    if (/black heather|heather black/.test(base)) return "Black";
    if (/athletic heather|dark heather/.test(base)) return "Gray";
    return base.replace(/\b\w/g, c => c.toUpperCase());
  };

  const colors = {};

  for (const v of variants) {
    const product = v?.product || {};
    const rawName = v?.name || "";

    // Color desde color_name, color o parte izquierda de "Color/Size"
    let color =
      normColor(product.color_name) ||
      normColor(product.color) ||
      normColor(rawName.split("/")[0]) ||
      "Color único";

    // Talla desde product.size o parte derecha de "Color/Size"
    let size =
      String(product.size || "").trim() ||
      String(rawName.includes("/") ? rawName.split("/").pop() : "").trim() ||
      `VAR_${v.variant_id}`;

    if (!colors[color]) colors[color] = { image: null, sizes: {} };

    // Imagen priorizada por archivos mockup/preview de la variante
    const fromFiles =
      v?.files?.find(f => f.preview_url)?.preview_url ||
      v?.files?.find(f => f.thumbnail_url)?.thumbnail_url ||
      v?.files?.find(f => f.url)?.url ||
      null;

    const variantImage = fromFiles || product.image || sp?.thumbnail_url || null;

    if (!colors[color].image && variantImage) {
      colors[color].image = variantImage; // garantizamos una imagen por color
    }

    colors[color].sizes[size] = v.variant_id;
  }

  // Portada segura
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

/* ========= Endpoints ========= */

// Catálogo normalizado con caché (1h)
router.get("/api/printful/products", async (req, res) => {
  try {
    if (!process.env.PRINTFUL_API_KEY) {
      return res.status(500).json({ error: "PRINTFUL_API_KEY no configurada en el servidor" });
    }

    const now = Date.now();
    if (now - productCache.time < PRODUCT_CACHE_TTL && productCache.data.length) {
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
    res.json({ products, cached: false });
  } catch (err) {
    console.error("PF /products error:", err.message);
    res.status(500).json({ error: String(err.message) });
  }
});

// Lista cruda (debug)
router.get("/api/printful/raw-list", async (req, res) => {
  try {
    const data = await pfGet(`/store/products?limit=50&offset=0`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

export default router;