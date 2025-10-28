/**
 * ============================================================
 * VALTIX Backend API (server.js) — actualizado
 * ------------------------------------------------------------
 * - Express + CORS controlado
 * - Stripe (checkout + webhooks con RAW body)
 * - Printful (pedidos vía webhook + router de catálogo)
 * - Endpoint de disponibilidad de variantes (opcional)
 * ============================================================
 */

import express from "express";
import cors from "cors";
import Stripe from "stripe";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import router from "./router.js"; // Rutas Printful (catálogo normalizado, cache, etc.)

const app = express();

/* ============================================================
   🔧 Ajustes base
============================================================ */
app.set("trust proxy", 1);

/* ============================================================
   🔒 CORS — solo dominios autorizados
============================================================ */
const ALLOWED_ORIGINS = [
  "https://adrianrs928222.github.io",
  "https://valtixshop.onrender.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`🚫 Origen no permitido: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
  })
);

// Preflight y cabeceras
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ============================================================
   💳 STRIPE
============================================================ */
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

/* ============================================================
   🧩 PRINTFUL
============================================================ */
const PRINTFUL_KEY = process.env.PRINTFUL_API_KEY || "";
const availabilityCache = { data: {}, updatedAt: null };

const isUnavailableMessage = (msg = "") =>
  /unavailable|discontinued|invalid variant|out of stock|not available/i.test(String(msg));

/* ============================================================
   🔍 Probar disponibilidad de variantes en Printful (opcional)
============================================================ */
async function probeVariantsAvailability(variantIds = []) {
  if (!variantIds.length) return {};

  if (!PRINTFUL_KEY) {
    const fallback = {};
    variantIds.forEach((v) => (fallback[String(v)] = null));
    return fallback;
  }

  const payload = {
    recipient: {
      name: "VALTIX Probe",
      address1: "Test 1",
      city: "Madrid",
      country_code: "ES",
      zip: "28001",
    },
    items: variantIds.map((v) => ({
      variant_id: String(v),
      quantity: 1,
      name: "Availability Probe",
    })),
    confirm: false,
  };

  try {
    const r = await fetch("https://api.printful.com/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${PRINTFUL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (r.ok) {
      const out = {};
      variantIds.forEach((v) => (out[String(v)] = true));
      return out;
    }

    const data = await r.json().catch(() => ({}));
    const flag = isUnavailableMessage(data?.error?.message || "") ? false : null;
    const out = {};
    variantIds.forEach((v) => (out[String(v)] = flag));
    return out;
  } catch (e) {
    console.error("❌ probeVariantsAvailability error:", e);
    const out = {};
    variantIds.forEach((v) => (out[String(v)] = null));
    return out;
  }
}

/* ============================================================
   ⚡ Webhook Stripe — RAW body antes del JSON parser
============================================================ */
app.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !WEBHOOK_SECRET) return res.json({ received: true, disabled: true });

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("❌ Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    try {
      const cart = session.metadata?.cart ? JSON.parse(session.metadata.cart) : [];
      const cd = session.customer_details || {};
      const address = cd.address || {};

      const items = cart
        .map((i) => ({
          variant_id: i.variant_id ? String(i.variant_id) : "",
          quantity: Number(i.quantity || 1),
          name: i.name || "Producto VALTIX",
        }))
        .filter((it) => !!it.variant_id);

      if (!items.length) return res.json({ received: true });

      const payload = {
        recipient: {
          name: cd.name || "Cliente VALTIX",
          address1: address.line1 || "Dirección",
          city: address.city || "Ciudad",
          country_code: (address.country || "ES").toUpperCase(),
          zip: address.postal_code || "00000",
        },
        items,
        confirm: true,
      };

      if (PRINTFUL_KEY) {
        const r = await fetch("https://api.printful.com/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${PRINTFUL_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) console.error("❌ Printful error:", data);
        else console.log("✅ Pedido Printful creado:", data?.result?.id || data);
      }
    } catch (e) {
      console.error("❌ Error creando pedido en Printful:", e);
    }
  }

  res.json({ received: true });
});

/* ============================================================
   📦 Parser JSON (después del webhook)
============================================================ */
app.use(express.json({ limit: "1mb" }));

/* ============================================================
   💚 Health
============================================================ */
app.get("/health", (_, res) => res.json({ ok: true, allowedOrigins: ALLOWED_ORIGINS }));

/* ============================================================
   💳 Checkout Stripe
============================================================ */
app.post("/checkout", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Falta STRIPE_SECRET_KEY" });

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: "El carrito está vacío." });

    const cartMetadata = items.map((i) => ({
      sku: i.sku,
      name: i.name,
      quantity: Number(i.quantity || i.qty || 1),
      price: Number(i.price),
      variant_id: String(i.variant_id || ""),
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      shipping_address_collection: { allowed_countries: ["ES", "PT", "FR", "DE", "IT"] },
      line_items: items.map((item) => ({
        quantity: Number(item.quantity || item.qty || 1),
        price_data: {
          currency: "eur",
          product_data: { name: String(item.name || "Producto") },
          unit_amount: Math.round(Number(item.price || 0) * 100),
        },
      })),
      success_url: "https://adrianrs928222.github.io/VALTIXSHOP/success.html",
      cancel_url: "https://adrianrs928222.github.io/VALTIXSHOP/cancel.html",
      metadata: { cart: JSON.stringify(cartMetadata) },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("❌ Checkout error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   🔎 Disponibilidad de variantes (opcional)
============================================================ */
app.post("/availability", async (req, res) => {
  try {
    const { variant_ids = [] } = req.body || {};
    if (!Array.isArray(variant_ids) || !variant_ids.length)
      return res.status(400).json({ ok: false, error: "variant_ids requerido" });

    const fromCache = {};
    const missing = [];

    for (const v of variant_ids) {
      const key = String(v);
      if (key in availabilityCache.data) fromCache[key] = availabilityCache.data[key];
      else missing.push(key);
    }

    let fresh = {};
    if (missing.length) {
      fresh = await probeVariantsAvailability(missing);
      Object.assign(availabilityCache.data, fresh);
      availabilityCache.updatedAt = new Date().toISOString();
    }

    res.json({ ok: true, updatedAt: availabilityCache.updatedAt, availability: { ...fromCache, ...fresh } });
  } catch (e) {
    console.error("❌ availability error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ============================================================
   🧭 Rutas Printful (catálogo normalizado)
============================================================ */
app.use(router);

/* ============================================================
   🚀 Arranque
============================================================ */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Servidor VALTIX en puerto ${PORT}`);
  console.log(`🌐 Orígenes permitidos: ${ALLOWED_ORIGINS.join(", ")}`);
});