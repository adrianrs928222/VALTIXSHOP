import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* ===== Caché global ===== */
let productCache = { time: 0, data: [] };
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1h

/* ===== Helpers ===== */
async function pfGet(path) {
  const r = await fetch(`${PRINTFUL_API}${path}`, { headers: PF_HEADERS });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Printful ${path} -> ${r.status} ${JSON.stringify(json)}`);
  return json;
}

async function fetchAllProducts() {
  const all = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await pfGet(`/store/products?limit=${limit}&offset=${offset}`);
    const items = res?.result || [];
    all.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}

function detectCategory(name = "") {
  const n = name.toLowerCase();
  if (/(tee|camiseta)/.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera)/.test(n)) return ["sudaderas"];
  if (/(pant|pantal)/.test(n)) return ["pantalones"];
  if (/(shoe|zapatilla)/.test(n)) return ["zapatos"];
  if (/(cap|gorra)/.test(n)) return ["accesorios"];
  return ["otros"];
}

/* ===== Normalizador ===== */
function normalize(detail) {
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  const prices = variants.map(v => +v.retail_price || 0).filter(Boolean);
  const price = Math.min(...prices);

  const colors = {};
  for (const v of variants) {
    const prod = v.product || {};
    const name = String(prod.color_name || prod.color || "Único").trim();
    const color = name.charAt(0).toUpperCase() + name.slice(1);
    const size = prod.size || "Único";

    const img = (v.files || []).find(f => f.type === "preview" && f.preview_url)?.preview_url
      || (v.files || []).find(f => f.preview_url)?.preview_url
      || sp?.thumbnail_url;

    if (!colors[color]) colors[color] = { image: img, hex: prod.color_code || null, sizes: {} };
    colors[color].sizes[size] = v.variant_id;
  }

  return {
    id: sp.id,
    sku: sp.external_id || String(sp.id),
    name: sp.name,
    price,
    image: sp.thumbnail_url,
    categories: detectCategory(sp.name),
    colors,
  };
}

/* ===== Endpoints ===== */
router.get("/api/printful/products", async (_, res) => {
  try {
    const now = Date.now();
    if (productCache.data.length && now - productCache.time < PRODUCT_CACHE_TTL)
      return res.json({ products: productCache.data, cached: true });

    const list = await fetchAllProducts();
    const details = await Promise.all(list.map(p => pfGet(`/store/products/${p.id}`)));
    const products = details.map(normalize);
    productCache = { time: now, data: products };
    res.json({ products, cached: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

router.get("/api/printful/product", async (req, res) => {
  try {
    const sku = req.query.sku;
    if (!sku) return res.status(400).json({ error: "Falta SKU" });
    const list = await fetchAllProducts();
    const found = list.find(p => String(p.external_id) === String(sku) || String(p.id) === String(sku));
    if (!found) return res.status(404).json({ error: "No encontrado" });
    const detail = await pfGet(`/store/products/${found.id}`);
    res.json({ product: normalize(detail) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;