/**
 * ============================================================
 * VALTIX Backend API
 * ------------------------------------------------------------
 * Servidor Express para integraciones con:
 *  - Printful (catálogo + pedidos)
 *  - Stripe (checkout + webhooks)
 *  - CORS controlado
 * ============================================================
 */

import express from "express";
import cors from "cors";
import Stripe from "stripe";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import router from "./router.js"; // Rutas Printful

const app = express();

/* ============================================================
   🔒 CONFIGURACIÓN DE CORS
   Solo permite dominios oficiales de producción y pruebas.
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

// Preflight CORS
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
   💳 STRIPE CONFIG
============================================================ */
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

/* ============================================================
   🧩 PRINTFUL CONFIG
============================================================ */
const PRINTFUL_KEY = process.env.PRINTFUL_API_KEY || "";
const availabilityCache = { data: {}, updatedAt: null };

// Helper para detectar errores de disponibilidad
const isUnavailableMessage = msg =>
  /unavailable|discontinued|invalid variant|out of stock|not available/i.test(String(msg));

/* ============================================================
   🔍 PROBAR DISPONIBILIDAD DE VARIANTES EN PRINTFUL
============================================================ */
async function probeVariantsAvailability(variantIds = []) {
  if (!variantIds.length) return {};

  if (!PRINTFUL_KEY) {
    const fallback = {};
    variantIds.forEach(v => (fallback[v] = null));
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
    items: variantIds.map(v => ({
      variant_id: String(v),
      quantity: 1,
      name: "Availability Probe",
    })),
    confirm: false,
  };

  try {
    const r = await fetch("https://api.printful.com/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PRINTFUL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (r.ok) {
      const success = {};
      variantIds.forEach(v => (success[v] = true));
      return success;
    }

    const data = await r.json().catch(() => ({}));
    const flag = isUnavailableMessage(data?.error?.message || "") ? false : null;
    const output = {};
    variantIds.forEach(v => (output[v] = flag));
    return output;
  } catch (e) {
    console.error("❌ Error al probar disponibilidad:", e);
    const out = {};
    variantIds.forEach(v => (out[v] = null));
    return out;
  }
}

/* ============================================================
   ⚡ STRIPE WEBHOOK (RAW BODY)
============================================================ */
app.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !WEBHOOK_SECRET) return res.json({ received: true, disabled: true });

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("❌ Error de firma del webhook:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ Pedido completado
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    try {
      const cart = session.metadata?.cart ? JSON.parse(session.metadata.cart) : [];
      const cd = session.customer_details || {};
      const address = cd.address || {};

      const items = cart
        .map(i => ({
          variant_id: String(i.variant_id || ""),
          quantity: Number(i.quantity || 1),
          name: i.name || "Producto VALTIX",
        }))
        .filter(it => !!it.variant_id);

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
          headers: {
            Authorization: `Bearer ${PRINTFUL_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) console.error("❌ Error al crear pedido en Printful:", data);
        else console.log("✅ Pedido Printful creado:", data?.result?.id || data);
      }
    } catch (e) {
      console.error("❌ Error creando pedido Printful:", e);
    }
  }

  res.json({ received: true });
});

/* ============================================================
   📦 BODY PARSER (JSON NORMAL)
============================================================ */
app.use(express.json());

/* ============================================================
   💚 HEALTH CHECK
============================================================ */
app.get("/health", (_, res) => {
  res.json({ ok: true, allowedOrigins: ALLOWED_ORIGINS });
});

/* ============================================================
   💳 CHECKOUT STRIPE
============================================================ */
app.post("/checkout", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Falta STRIPE_SECRET_KEY" });

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: "El carrito está vacío." });

    const cartMetadata = items.map(i => ({
      sku: i.sku,
      name: i.name,
      quantity: Number(i.quantity || 1),
      price: Number(i.price),
      variant_id: String(i.variant_id || ""),
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      shipping_address_collection: { allowed_countries: ["ES", "PT", "FR", "DE", "IT"] },
      line_items: items.map(item => ({
        quantity: Number(item.quantity || 1),
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
    console.error("❌ Error en checkout:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   🔎 DISPONIBILIDAD DE VARIANTES
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

    res.json({
      ok: true,
      updatedAt: availabilityCache.updatedAt,
      availability: { ...fromCache, ...fresh },
    });
  } catch (e) {
    console.error("❌ Error en availability:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ============================================================
   🧭 RUTAS PRINTFUL (router.js)
============================================================ */
app.use(router);

/* ============================================================
   🚀 ARRANQUE DEL SERVIDOR
============================================================ */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Servidor VALTIX iniciado en puerto ${PORT}`);
  console.log(`🌐 Orígenes permitidos: ${ALLOWED_ORIGINS.join(", ")}`);
});