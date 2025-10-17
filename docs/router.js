// backend/router.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

async function pfGet(path) {
  const url = `${PRINTFUL_API}${path}`;
  const res = await fetch(url, { headers: PF_HEADERS });
  let payload = null;
  try { payload = await res.json(); } catch {}
  if (!res.ok) {
    const msg = payload?.error || payload || (await res.text().catch(()=>"" ));
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

function normalizeProduct(detail) {
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];
  const prices = variants.map(v=>parseFloat(v.retail_price)).filter(n=>!Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : undefined;

  const variant_map = {};
  for (const v of variants) {
    const raw = v?.name || "";
    let size = raw.includes("/") ? raw.split("/").pop().trim() : null;
    if (!size && v?.product?.size) size = String(v.product.size).trim();
    if (!size) size = `VAR_${v.variant_id}`;
    variant_map[size] = v.variant_id;
  }

  const image =
    sp?.thumbnail_url ||
    variants?.[0]?.files?.[0]?.preview_url ||
    variants?.[0]?.files?.[0]?.thumbnail_url ||
    variants?.[0]?.files?.[0]?.url ||
    "https://via.placeholder.com/800x800.png?text=VALTIX";

  const nameLower = (sp?.name || "").toLowerCase();
  let categories = ["otros"];
  if (/(tee|t-shirt|camiseta)/i.test(nameLower)) categories = ["camisetas"];
  else if (/(hoodie|sudadera)/i.test(nameLower)) categories = ["sudaderas"];
  else if (/(pant|pantal[oó]n|leggings|jogger)/i.test(nameLower)) categories = ["pantalones"];
  else if (/(shoe|sneaker|zapatilla|bota)/i.test(nameLower)) categories = ["zapatos"];
  else if (/(cap|gorra|beanie|gorro)/i.test(nameLower)) categories = ["accesorios"];

  return {
    id: (sp?.id && String(sp.id)) || (sp?.external_id || `pf_${Date.now()}`),
    name: sp?.name || "Producto Printful",
    price: typeof price === "number" ? Number(price.toFixed(2)) : undefined,
    image,
    sku: sp?.external_id || String(sp?.id || ""),
    categories,
    variant_map,
  };
}

// GET /api/printful/products
router.get("/api/printful/products", async (req, res) => {
  try {
    if (!process.env.PRINTFUL_API_KEY) {
      return res.status(500).json({ error: "PRINTFUL_API_KEY no configurada" });
    }
    const list = await fetchAllSyncedProducts();
    if (!list.length) return res.json({ products: [], note: "No hay productos añadidos a tienda." });
    const details = await Promise.all(list.map(p => pfGet(`/store/products/${p.id}`)));
    const products = details.map(normalizeProduct);
    res.json({ products });
  } catch (err) {
    console.error("PF /products error:", err.message);
    res.status(500).json({ error: String(err.message) });
  }
});

// Debug crudo
router.get("/api/printful/raw-list", async (req, res) => {
  try { res.json(await pfGet(`/store/products?limit=10&offset=0`)); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

export default router;