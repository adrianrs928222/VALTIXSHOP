import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  "Authorization": `Bearer ${process.env.PRINTFUL_API_KEY}`,
  "Content-Type": "application/json"
};

async function pfGet(path) {
  const res = await fetch(`${PRINTFUL_API}${path}`, { headers: PF_HEADERS });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Printful ${path} -> ${res.status} ${txt}`);
  }
  return res.json();
}

async function fetchAllSyncedProducts() {
  const limit = 100;
  let offset = 0;
  let all = [];
  while (true) {
    const data = await pfGet(`/store/products?limit=${limit}&offset=${offset}`);
    const items = data?.result || [];
    all = all.concat(items);
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}

async function mapWithLimit(items, limit, fn) {
  const ret = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return ret;
}

function normalizeProduct(detail) {
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  const prices = variants
    .map(v => parseFloat(v.retail_price))
    .filter(n => !Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : undefined;

  const image =
    sp?.thumbnail_url ||
    variants[0]?.files?.[0]?.preview_url ||
    variants[0]?.files?.[0]?.thumbnail_url ||
    variants[0]?.files?.[0]?.url ||
    "https://via.placeholder.com/800x800.png?text=VALTIX";

  const sku = sp?.external_id || sp?.id?.toString() || `pf_${Date.now()}`;

  const nameLower = (sp?.name || "").toLowerCase();
  let categories = ["otros"];
  if (/(tee|t-shirt|camiseta)/i.test(nameLower)) categories = ["camisetas"];
  else if (/(hoodie|sudadera)/i.test(nameLower)) categories = ["sudaderas"];
  else if (/(pant|pantal[oó]n|leggings|jogger)/i.test(nameLower)) categories = ["pantalones"];
  else if (/(shoe|sneaker|zapatilla|bota)/i.test(nameLower)) categories = ["zapatos"];
  else if (/(cap|gorra|beanie|gorro)/i.test(nameLower)) categories = ["accesorios"];

  const variant_map = {};
  for (const v of variants) {
    const rawName = v?.name || "";
    let size = null;
    if (rawName.includes("/")) size = rawName.split("/").pop().trim();
    if (!size && v?.product?.size) size = String(v.product.size).trim();
    if (!size) size = `VAR_${v.variant_id}`;
    variant_map[size] = v.variant_id;
  }

  return {
    id: (sp?.id && String(sp.id)) || sku,
    name: sp?.name || "Producto Printful",
    price: typeof price === "number" ? Number(price.toFixed(2)) : undefined,
    image,
    sku,
    categories,
    variant_map
  };
}

router.get("/api/printful/products", async (req, res) => {
  try {
    const list = await fetchAllSyncedProducts();
    if (!list.length) return res.json({ products: [] });

    const details = await mapWithLimit(list, 5, async (p) => pfGet(`/store/products/${p.id}`));
    const products = details.map(normalizeProduct);

    res.json({ products });
  } catch (err) {
    console.error("PF /products error:", err.message);
    res.status(500).json({ error: "No se pudo obtener productos de Printful" });
  }
});

export default router;