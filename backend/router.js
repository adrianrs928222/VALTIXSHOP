import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const PRINTFUL_API = "https://api.printful.com";
const PF_HEADERS = {
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY || ""}`,
  "Content-Type": "application/json",
};

/* ============================================================
   Caché en memoria
============================================================ */
let productCache = { time: 0, data: [] };
const PRODUCT_CACHE_TTL = 60 * 60 * 1000; // 1h

/* ============================================================
   Utilidades: colores (HEX) + parsing color/talla
============================================================ */
function hexFromName(name = "") {
  const k = String(name).trim().toLowerCase().replace(/\s+/g, " ");
  const COLOR_MAP = {
    // EN
    "black":"#000000","black heather":"#1f1f1f","charcoal":"#36454f","dark gray":"#555555",
    "gray":"#808080","athletic heather":"#a7a7a7","silver":"#c0c0c0","ash":"#b2b2b2",
    "white":"#ffffff","ivory":"#fffff0","cream":"#fffdd0","beige":"#f5f5dc","sand":"#c2b280",
    "navy":"#001f3f","midnight navy":"#001a33","blue":"#0057ff","royal":"#4169e1",
    "light blue":"#87cefa","sky blue":"#87ceeb","cyan":"#00ffff","teal":"#008080",
    "green":"#008000","forest":"#0b3d02","forest green":"#0b3d02","olive":"#556b2f","mint":"#98ff98",
    "red":"#ff0000","maroon":"#800000","burgundy":"#800020","wine":"#722f37",
    "orange":"#ff7f00","rust":"#b7410e","gold":"#ffd700","yellow":"#ffea00","mustard":"#e1ad01",
    "purple":"#800080","violet":"#8a2be2","lavender":"#b57edc","magenta":"#ff00ff","pink":"#ffc0cb",
    "brown":"#5c4033","chocolate":"#7b3f00","khaki":"#bdb76b",
    // ES
    "negro":"#000000","blanco":"#ffffff","gris":"#808080","azul":"#0057ff","rojo":"#ff0000",
    "verde":"#008000","amarillo":"#ffea00","naranja":"#ff7f00","morado":"#800080","rosa":"#ffc0cb",
    "burdeos":"#800020","beige":"#f5f5dc","marrón":"#5c4033","caqui":"#bdb76b","oro":"#ffd700",
    // Comunes Printful
    "heather grey":"#a7a7a7","heather gray":"#a7a7a7","charcoal heather":"#3c3c3c","sand dune":"#c2b280"
  };
  return COLOR_MAP[k] || null;
}

const STOPWORDS =
  /(unisex|men'?s|women'?s|youth|kids|premium|classic|heavyweight|lightweight|hoodie|sweatshirt|t[-\s]?shirt|tee|tank|long[-\s]?sleeve|crewneck|pullover|zip[-\s]?hoodie|embroidery|printed|eco|recycled|cap|beanie|hat|snapback)/gi;

function cleanToken(s = "") {
  return s.replace(/\s*\|\s*/g, " ").replace(STOPWORDS, "").replace(/\s{2,}/g, " ").trim();
}

/** Extrae { color, size, hex } desde campos nativos o desde v.name
 * Soporta formatos: "… | Forest Green / S", "… - Black / 2XL", etc.
 */
function extractColorAndSize(v) {
  const product = v?.product || {};
  const raw = String(v?.name || "").trim();

  let color = product.color_name || product.color || "";
  let size  = product.size || "";

  if ((!color || !size) && raw) {
    const parts = raw.split("/").map(s => s.trim());
    if (!size && parts.length >= 2) size = parts[parts.length - 1];
    let left = parts[0] || raw;
    left = left.split("|").pop().split("-").pop();
    left = cleanToken(left);
    if (!color && left) color = left;
  }

  if (!size) {
    const m = raw.match(/(?:^|\/|\s)(XS|S|M|L|XL|2XL|3XL|4XL|5XL|XXL|XXXL|\d{2})\s*$/i);
    if (m) size = m[1].toUpperCase();
  }

  color = color ? color.replace(/\b\w/g, c => c.toUpperCase()) : "Color Único";
  size  = size  ? size.toUpperCase() : `VAR_${v.variant_id}`;

  let hex = product.hex_code || product.color_code || null;
  if (hex && /^#?[0-9A-Fa-f]{3,6}$/.test(hex)) hex = hex.startsWith("#") ? hex : `#${hex}`;
  if (!hex) hex = hexFromName(color);

  return { color, size, hex };
}

/* ============================================================
   Categorías
============================================================ */
function detectCategories(name = "") {
  const n = name.toLowerCase();
  if (/(tee|t-shirt|camiseta)/.test(n)) return ["camisetas"];
  if (/(hoodie|sudadera)/.test(n)) return ["sudaderas"];
  if (/(pant|pantal[oó]n|leggings|jogger)/.test(n)) return ["pantalones"];
  if (/(shoe|sneaker|zapatilla|bota)/.test(n)) return ["zapatos"];
  if (/(cap|gorra|beanie|gorro)/.test(n)) return ["accesorios"];
  return ["otros"];
}

/* ============================================================
   HTTP helpers a Printful
============================================================ */
async function pfGet(path) {
  const res = await fetch(`${PRINTFUL_API}${path}`, { headers: PF_HEADERS });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error || json || (await res.text().catch(() => ""));
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

/* ============================================================
   Normalización: colores + tallas + múltiples imágenes por color
============================================================ */
function normalizeProduct(detail) {
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  const prices = variants.map(v => parseFloat(v.retail_price)).filter(n => !Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : 0;

  const colors = {};

  for (const v of variants) {
    const { color, size, hex } = extractColorAndSize(v);

    // Reunir TODAS las imágenes posibles de la variante
    const fileImgs = (v?.files || []).flatMap(f => {
      const arr = [];
      if (f.preview_url)   arr.push(f.preview_url);
      if (f.thumbnail_url) arr.push(f.thumbnail_url);
      if (f.url)           arr.push(f.url);
      return arr;
    });
    const imgs = [...new Set(fileImgs)].filter(Boolean);

    const primary = imgs[0] || sp?.thumbnail_url || "https://i.postimg.cc/k5ZGwR5W/producto1.png";

    if (!colors[color]) colors[color] = { hex, image: primary, images: imgs.length ? imgs : [primary], sizes: {} };
    if (!colors[color].image && primary) colors[color].image = primary;

    // Fusionar imágenes nuevas (por si otras variantes del mismo color aportan más vistas)
    if (imgs.length) {
      const merged = new Set([...(colors[color].images || []), ...imgs]);
      colors[color].images = [...merged];
    }

    colors[color].sizes[size] = v.variant_id;
  }

  const firstColor = Object.keys(colors)[0];
  const cover = (firstColor && colors[firstColor]?.image) || sp?.thumbnail_url || null;

  return {
    id: String(sp?.id || sp?.external_id || `pf_${Date.now()}`),
    sku: sp?.external_id || String(sp?.id || ""),
    name: sp?.name || "Producto Printful",
    price: Number(price.toFixed(2)),
    image: cover,
    categories: detectCategories(sp?.name || ""),
    colors, // { "Navy": { hex, image, images:[], sizes:{S:123,...} }, ... }
  };
}

/* ============================================================
   Endpoints
============================================================ */

// Catálogo completo (usa caché; forzar con ?refresh=1)
router.get("/api/printful/products", async (req, res) => {
  try {
    if (!process.env.PRINTFUL_API_KEY) {
      return res.status(500).json({ error: "PRINTFUL_API_KEY no configurada en el servidor" });
    }

    const force = String(req.query.refresh || "") === "1";
    const now = Date.now();

    if (!force && productCache.data.length && now - productCache.time < PRODUCT_CACHE_TTL) {
      return res.json({ products: productCache.data, cached: true });
    }

    const list = await fetchAllSyncedProducts();
    const details = await Promise.all(list.map(p => pfGet(`/store/products/${p.id}`)));
    const products = details.map(normalizeProduct);

    productCache = { time: now, data: products };
    res.json({ products, cached: false });
  } catch (err) {
    console.error("PF /products error:", err.message);
    res.status(500).json({ error: String(err.message) });
  }
});

// Ficha individual por SKU (external_id o id)
router.get("/api/printful/product", async (req, res) => {
  try {
    const sku = String(req.query.sku || "").trim();
    if (!sku) return res.status(400).json({ error: "Falta parámetro sku" });

    // Intenta caché primero
    if (productCache.data.length) {
      const cached = productCache.data.find(p => p.sku === sku || p.id === sku);
      if (cached) return res.json({ product: cached });
    }

    // Resuelve contra listado de sincronizados
    const all = await fetchAllSyncedProducts();
    const found = all.find(p => String(p.external_id) === sku || String(p.id) === sku);
    if (!found) return res.status(404).json({ error: "Producto no encontrado" });

    const detail = await pfGet(`/store/products/${found.id}`);
    const product = normalizeProduct(detail);

    // Guarda en caché (al inicio)
    productCache.data = [product, ...productCache.data];
    res.json({ product });
  } catch (err) {
    console.error("PF /product error:", err.message);
    res.status(500).json({ error: String(err.message) });
  }
});

// Invalidar caché manualmente
router.post("/api/printful/refresh", (req, res) => {
  productCache = { time: 0, data: [] };
  res.json({ ok: true, msg: "Caché invalidada" });
});

// Debug del parseo por SKU (opcional)
router.get("/api/printful/debug", async (req, res) => {
  try {
    const sku = String(req.query.sku || "").trim();
    if (!sku) return res.status(400).json({ error: "sku requerido" });

    const all = await fetchAllSyncedProducts();
    const found = all.find(p => String(p.external_id) === sku || String(p.id) === sku);
    if (!found) return res.status(404).json({ error: "Producto no encontrado" });

    const detail = await pfGet(`/store/products/${found.id}`);
    const variants = detail?.result?.sync_variants || [];
    const parsed = variants.map(v => ({
      variant_id: v.variant_id,
      name: v.name,
      product_fields: v.product,
      parsed: extractColorAndSize(v),
      file_count: (v?.files || []).length
    }));

    res.json({ sku, parsed });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

export default router;