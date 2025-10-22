import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* ========== Helpers ========== */
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

function firstPreview(files = []) {
  return (
    files?.find(f => f.preview_url)?.preview_url ||
    files?.find(f => f.thumbnail_url)?.thumbnail_url ||
    files?.find(f => f.url)?.url ||
    null
  );
}

/* ========== Normalizador con COLORES + TALLAS + IMAGENES PERSONALIZADAS ========== */
function normalizeProduct(detail) {
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  // Precio base (mínimo entre variantes)
  const prices = variants
    .map(v => parseFloat(v.retail_price))
    .filter(n => !Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : 0;

  // --- Agrupar por color ---
  const colors = {};
  for (const v of variants) {
    const product = v?.product || {};
    const raw = v?.name || "";

    // Detectar color real de Printful
    let color = (product.color_name || product.color || "").trim();
    if (!color && raw.includes("/")) color = raw.split("/")[0].trim();
    if (!color) color = "Color único";

    // Detectar talla
    let size = (product.size || "").trim();
    if (!size && raw.includes("/")) size = raw.split("/").pop().trim();
    if (!size) size = `VAR_${v.variant_id}`;

    if (!colors[color]) colors[color] = { image: null, sizes: {} };

    // Imagen del color: preferencia -> variant.files.preview_url -> thumbnail_url -> personalizada
    const variantImage =
      v?.files?.find(f => f.preview_url)?.preview_url ||
      v?.files?.find(f => f.thumbnail_url)?.thumbnail_url ||
      product.image ||
      sp?.thumbnail_url ||
      null;

    // Imagen personalizada por defecto si no existe
    if (!colors[color].image) {
      colors[color].image =
        variantImage ||
        "https://i.postimg.cc/k5ZGwR5W/producto1.png"; // 🖼️ imagen personalizada fallback
    }

    colors[color].sizes[size] = v.variant_id;
  }

  // Imagen principal (primer color)
  const firstColor = Object.keys(colors)[0];
  const cover =
    (firstColor && colors[firstColor]?.image) ||
    sp?.thumbnail_url ||
    "https://i.postimg.cc/k5ZGwR5W/producto1.png"; // 🖼️ fallback global

  const variant_map =
    firstColor ? { ...colors[firstColor].sizes } : {};

  return {
    id: String(sp?.id || sp?.external_id || `pf_${Date.now()}`),
    name: sp?.name || "Producto Printful",
    price: Number(price.toFixed(2)),
    image: cover,
    sku: sp?.external_id || String(sp?.id || ""),
    categories: detectCategories(sp?.name || ""),
    colors,       // Colores reales de Printful
    variant_map   // Compatibilidad con app.js
  };
}

/* ========== Endpoints ========== */

// Obtener todos los productos sincronizados de Printful
router.get("/api/printful/products", async (req, res) => {
  try {
    if (!process.env.PRINTFUL_API_KEY) {
      return res.status(500).json({ error: "PRINTFUL_API_KEY no configurada en el servidor" });
    }

    const list = await fetchAllSyncedProducts();
    if (!list.length) {
      return res.json({ products: [], note: "No hay productos 'añadidos a tienda' en Printful." });
    }

    const details = await Promise.all(list.map(p => pfGet(`/store/products/${p.id}`)));
    const products = details.map(normalizeProduct);

    res.json({ products });
  } catch (err) {
    console.error("PF /products error:", err.message);
    res.status(500).json({ error: String(err.message) });
  }
});

// Endpoint de depuración cruda (lista sin procesar)
router.get("/api/printful/raw-list", async (req, res) => {
  try {
    const data = await pfGet(`/store/products?limit=50&offset=0`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

export default router;