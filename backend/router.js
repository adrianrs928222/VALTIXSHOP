import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* =========================
   Cache
========================= */
let productCache = { time: 0, data: [] };
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1h

/* =========================
   Helpers HTTP
========================= */
async function pfGet(path) {
  const r = await fetch(`${PRINTFUL_API}${path}`, { headers: PF_HEADERS });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`Printful GET ${path} -> ${r.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function fetchAllSyncedProducts() {
  const all = [];
  const limit = 100;
  let offset = 0;
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
   Category detector
========================= */
function detectCategories(name = "") {
  const n = name.toLowerCase();
  if (/(tee|t[-\s]?shirt|camiseta)/.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera)/.test(n)) return ["sudaderas"];
  if (/(pant|pantal[oó]n|leggings|jogger)/.test(n)) return ["pantalones"];
  if (/(shoe|sneaker|zapatilla|bota)/.test(n)) return ["zapatos"];
  if (/(cap|gorra|beanie|gorro)/.test(n)) return ["accesorios"];
  return ["otros"];
}

/* =========================
   Color helpers
========================= */
function hexFromName(name = "") {
  const k = String(name).trim().toLowerCase().replace(/\s+/g, " ");
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
    brown:"#5c4033","chocolate":"#7b3f00","khaki:"#bdb76b",
    // ES
    negro:"#000000", blanco:"#ffffff", gris:"#808080", azul:"#0057ff", rojo:"#ff0000",
    verde:"#008000", amarillo:"#ffea00", naranja:"#ff7f00", morado:"#800080", rosa:"#ffc0cb",
    burdeos:"#800020", beige:"#f5f5dc", marrón:"#5c4033", caqui:"#bdb76b", oro:"#ffd700",
    // comunes Printful
    "forest green":"#0b3d02","heather grey":"#a7a7a7","heather gray":"#a7a7a7",
    "athletic heather":"#a7a7a7","sand dune":"#c2b280","charcoal heather":"#3c3c3c"
  };
  return map[k] || null;
}

const STOPWORDS = /(unisex|men'?s|women'?s|youth|kids|premium|classic|heavyweight|lightweight|hoodie|sweatshirt|t[-\s]?shirt|tee|tank|long[-\s]?sleeve|crewneck|pullover|zip[-\s]?hoodie|embroidery|printed|eco|recycled|cap|beanie|hat|snapback)/gi;

function cleanToken(s = "") {
  return s
    .replace(/\s*\|\s*/g, " ")      // quitar separador " | "
    .replace(STOPWORDS, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Extrae {color,size} desde:
 * - v.product.color_name / v.product.color / v.product.size
 * - v.name: "Unisex Premium Sweatshirt | Forest Green / S"
 * - v.name: "Hoodie - Black / 2XL"
 */
function extractColorAndSize(v) {
  const product = v?.product || {};
  const raw = String(v?.name || "").trim();

  // 1) campos directos
  let color =
    product.color_name ||
    product.color ||
    "";
  let size =
    product.size ||
    "";

  // 2) si falta, intentar por "… | COLOR / SIZE"
  if ((!color || !size) && raw) {
    // split por "/"
    const parts = raw.split("/").map(s => s.trim());
    if (!size && parts.length >= 2) {
      size = parts[parts.length - 1];
    }
    // el color suele estar antes de "/" y después de "|" o "-" finales
    let left = parts[0] || raw;
    // coger último segmento tras "|" o "-"
    left = left.split("|").pop().split("-").pop();
    left = cleanToken(left);
    if (!color && left) color = left;
  }

  // 3) fallback: si aun no hay talla, buscar patrón
  if (!size) {
    const m = raw.match(/(?:^|\/|\s)([X]{0,3}S|M|L|XL|2XL|3XL|4XL|5XL|XXL|XXXL|\d{2})\s*$/i);
    if (m) size = m[1].toUpperCase();
  }

  // 4) normaliza
  color = color ? color.replace(/\b\w/g, c => c.toUpperCase()) : "Color Único";
  size  = size  ? size.toUpperCase() : `VAR_${v.variant_id}`;

  // HEX
  let hex = product.hex_code || product.color_code || null;
  if (hex && /^#?[0-9A-Fa-f]{3,6}$/.test(hex)) hex = hex.startsWith("#") ? hex : `#${hex}`;
  if (!hex) hex = hexFromName(color);

  return { color, size, hex };
}

/* =========================
   Normalizador
========================= */
function normalize(detail) {
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  const prices = variants.map(v => parseFloat(v.retail_price)).filter(n => !Number.isNaN(n));
  const price  = prices.length ? Math.min(...prices) : 0;

  const colors = {};

  for (const v of variants) {
    const { color, size, hex } = extractColorAndSize(v);

    // imagen por variante
    const img =
      (v?.files || []).find(f => f.type === "preview" && f.preview_url)?.preview_url ||
      (v?.files || []).find(f => f.preview_url)?.preview_url ||
      (v?.files || []).find(f => f.thumbnail_url)?.thumbnail_url ||
      (v?.files || []).find(f => f.url)?.url ||
      sp?.thumbnail_url || null;

    if (!colors[color]) colors[color] = { hex, image: img, sizes: {} };
    if (!colors[color].image && img) colors[color].image = img;
    colors[color].sizes[size] = v.variant_id;
  }

  const firstColor = Object.keys(colors)[0];
  const cover =
    (firstColor && colors[firstColor]?.image) ||
    sp?.thumbnail_url ||
    "https://i.postimg.cc/k5ZGwR5W/producto1.png";

  return {
    id: String(sp?.id || ""),
    sku: sp?.external_id || String(sp?.id || ""),
    name: sp?.name || "Producto Printful",
    price: Number(price.toFixed(2)),
    image: cover,
    categories: detectCategories(sp?.name || ""),
    colors,
  };
}

/* =========================
   Endpoints
========================= */
router.get("/api/printful/products", async (req, res) => {
  try {
    if (!process.env.PRINTFUL_API_KEY) {
      return res.status(500).json({ error: "PRINTFUL_API_KEY no configurada" });
    }
    const now = Date.now();
    const force = String(req.query.refresh || "") === "1";

    if (!force && productCache.data.length && now - productCache.time < PRODUCT_CACHE_TTL) {
      return res.json({ products: productCache.data, cached: true });
    }

    const list = await fetchAllSyncedProducts();
    if (!list.length) return res.json({ products: [], note: "Sin productos añadidos a tienda en Printful." });

    const details = await Promise.all(list.map(p => pfGet(`/store/products/${p.id}`)));
    const products = details.map(normalize);

    productCache = { time: now, data: products };
    res.json({ products, cached: false });
  } catch (e) {
    console.error("PF /products error:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.get("/api/printful/product", async (req, res) => {
  try {
    if (!process.env.PRINTFUL_API_KEY) return res.status(500).json({ error: "PRINTFUL_API_KEY no configurada" });
    const sku = String(req.query.sku || "").trim();
    if (!sku) return res.status(400).json({ error: "sku requerido" });

    const list = await fetchAllSyncedProducts();
    const found = list.find(p => String(p.external_id) === sku || String(p.id) === sku);
    if (!found) return res.status(404).json({ error: "Producto no encontrado" });

    const detail = await pfGet(`/store/products/${found.id}`);
    return res.json({ product: normalize(detail) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/api/printful/refresh", (req, res) => {
  productCache = { time: 0, data: [] };
  res.json({ ok: true, msg: "caché invalidada" });
});

/* Opcional: endpoint debug para ver cómo se parsean variantes por SKU */
router.get("/api/printful/debug", async (req, res) => {
  try {
    const sku = String(req.query.sku || "").trim();
    if (!sku) return res.status(400).json({ error: "sku requerido" });
    const list = await fetchAllSyncedProducts();
    const found = list.find(p => String(p.external_id) === sku || String(p.id) === sku);
    if (!found) return res.status(404).json({ error: "Producto no encontrado" });
    const detail = await pfGet(`/store/products/${found.id}`);

    const parsed = (detail?.result?.sync_variants || []).map(v => {
      const { color, size, hex } = extractColorAndSize(v);
      return {
        variant_id: v.variant_id,
        name: v.name,
        product_fields: v.product,
        parsed: { color, size, hex }
      };
    });
    res.json({ sku, parsed });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

export default router;