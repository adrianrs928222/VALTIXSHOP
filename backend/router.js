// router.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* ========== Helpers ========== */
async function pfGet(path, { retries = 2, retryDelayMs = 500 } = {}) {
  const url = `${PRINTFUL_API}${path}`;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: PF_HEADERS });

      let payload = null;
      try {
        payload = await res.json();
      } catch {
        // ignore parse errors
      }

      if (!res.ok) {
        const msg =
          payload?.error ||
          payload ||
          (await res.text().catch(() => ""));
        throw new Error(
          `Printful GET ${path} -> ${res.status} ${JSON.stringify(msg)}`
        );
      }
      return payload;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
        continue;
      }
      throw lastErr;
    }
  }
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
  const n = String(name).toLowerCase();
  if (/(tee|t-shirt|camiseta)/i.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera)/i.test(n)) return ["sudaderas"];
  if (/(pant|pantal[oó]n|leggings|jogger)/i.test(n)) return ["pantalones"];
  if (/(shoe|sneaker|zapatilla|bota)/i.test(n)) return ["zapatos"];
  if (/(cap|gorra|beanie|gorro)/i.test(n)) return ["accesorios"];
  return ["otros"];
}

function normalizeProduct(detail) {
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];
  const prices = variants
    .map((v) => parseFloat(v.retail_price))
    .filter((n) => !Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : 0;

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

    if (!colors[color]) colors[color] = { image: null, sizes: {} };

    const variantImage =
      v?.files?.find((f) => f.preview_url)?.preview_url ||
      v?.files?.find((f) => f.thumbnail_url)?.thumbnail_url ||
      product.image ||
      sp?.thumbnail_url ||
      null;

    if (!colors[color].image) {
      colors[color].image =
        variantImage || "https://i.postimg.cc/k5ZGwR5W/producto1.png";
    }

    colors[color].sizes[size] = String(v.variant_id);
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

// Productos normalizados (paginables en respuesta)
router.get("/api/printful/products", async (req, res) => {
  try {
    if (!process.env.PRINTFUL_API_KEY) {
      return res
        .status(500)
        .json({ error: "PRINTFUL_API_KEY no configurada en el servidor" });
    }

    const list = await fetchAllSyncedProducts();
    if (!list.length) {
      return res.json({
        total: 0,
        offset: 0,
        limit: 0,
        products: [],
        note: "No hay productos 'añadidos a tienda' en Printful.",
      });
    }

    const details = await Promise.all(
      list.map((p) => pfGet(`/store/products/${p.id}`))
    );
    const products = details.map(normalizeProduct);

    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const slice = products.slice(offset, offset + limit);

    res.json({
      total: products.length,
      offset,
      limit,
      products: slice,
    });
  } catch (err) {
    console.error("PF /products error:", err.message);
    res.status(500).json({ error: String(err.message) });
  }
});

// Producto individual normalizado
router.get("/api/printful/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const detail = await pfGet(`/store/products/${encodeURIComponent(id)}`);
    const product = normalizeProduct(detail);
    res.json({ product });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

// Lista cruda (nativa de Printful)
router.get("/api/printful/raw-list", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const data = await pfGet(`/store/products?limit=${limit}&offset=${offset}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

export default router;