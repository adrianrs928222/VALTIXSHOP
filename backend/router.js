// backend/router.js
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
    files?.[0]?.preview_url ||
    files?.[0]?.thumbnail_url ||
    files?.[0]?.url ||
    null
  );
}

/* ========== Normalizador con COLORES + TALLAS ========== */
function normalizeProduct(detail) {
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  // precio mínimo visible
  const prices = variants
    .map(v => parseFloat(v.retail_price))
    .filter(n => !Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : undefined;

  // Agrupar por color -> cada color tendrá su imagen y su mapa de tallas
  const colors = {}; // { "Black": { image, sizes: {S: 123, M: 124, ...} } }
  for (const v of variants) {
    const raw = v?.name || "";
    const product = v?.product || {};

    // color detectado
    let color =
      (product.color_name || product.color || "").toString().trim();
    if (!color && raw.includes("/")) color = raw.split("/")[0].trim();
    if (!color) color = "Default";

    // talla detectada
    let size = (product.size || "").toString().trim();
    if (!size && raw.includes("/")) size = raw.split("/").pop().trim();
    if (!size) size = `VAR_${v.variant_id}`;

    if (!colors[color]) colors[color] = { image: null, sizes: {} };

    // imagen para el color (primera que encontremos)
    if (!colors[color].image) {
      colors[color].image = firstPreview(v.files) || sp?.thumbnail_url || null;
    }

    // asignar talla -> variant_id
    colors[color].sizes[size] = v.variant_id;
  }

  // imagen de portada (primer color disponible)
  const firstColor = Object.keys(colors)[0];
  const cover =
    (firstColor && colors[firstColor]?.image) ||
    sp?.thumbnail_url ||
    firstPreview(variants?.[0]?.files) ||
    "https://via.placeholder.com/800x800.png?text=VALTIX";

  // Para compatibilidad: un variant_map simple (primer color)
  const variant_map =
    firstColor ? { ...colors[firstColor].sizes } : {};

  return {
    id: (sp?.id && String(sp.id)) || (sp?.external_id || `pf_${Date.now()}`),
    name: sp?.name || "Producto Printful",
    price: typeof price === "number" ? Number(price.toFixed(2)) : undefined,
    image: cover,
    sku: sp?.external_id || String(sp?.id || ""),
    categories: detectCategories(sp?.name || ""),
    // NUEVO
    colors,        // { "Black": { image, sizes { S: 111, M: 112 } }, ... }
    variant_map,   // compat
  };
}

/* ========== Endpoints ========== */
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

// Debug crudo opcional
router.get("/api/printful/raw-list", async (req, res) => {
  try { res.json(await pfGet(`/store/products?limit=50&offset=0`)); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

export default router;