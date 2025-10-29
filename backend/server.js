/**
 * VALTIX Backend API — Express (Printful + Stripe) con seguridad y perf
 */
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import router from "./router.js";      // Printful catalog + products
import adminRouter from "./admin.js";  // Admin API (pedidos)

const app = express();
app.set("trust proxy", 1);

/* ========================= CORS ========================= */
const ALLOWED_ORIGINS = [
  "https://adrianrs928222.github.io",
  "https://valtixshop.onrender.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
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

/* ================== Seguridad / Perf / Logs ================== */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "tiny"));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 180 });
app.use(limiter);

/* ======================== Stripe ======================== */
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

/* ===== Webhook Stripe (RAW antes de express.json) ===== */
app.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !WEBHOOK_SECRET) return res.json({ received: true, disabled: true });
  const sig = req.headers["stripe-signature"];
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);

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

        if (items.length && process.env.PRINTFUL_API_KEY) {
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
          const r = await fetch("https://api.printful.com/orders", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            console.error("❌ Error Printful order:", data);
          } else {
            console.log("✅ Pedido Printful creado");
          }
        }
      } catch (e) { console.error("❌ Error creando pedido Printful:", e); }
    }
    res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook signature:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

/* ===== JSON normal después del webhook ===== */
app.use(express.json());

/* ======================== Health ======================== */
app.get("/health", (_, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "dev",
    uptime: process.uptime(),
    allowedOrigins: ALLOWED_ORIGINS
  });
});

/* ==================== Checkout Stripe =================== */
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

/* ================== Disponibilidad variantes ================== */
const availabilityCache = { data: {}, updatedAt: null };
const PRINTFUL_KEY = process.env.PRINTFUL_API_KEY || "";

const isUnavailableMessage = msg =>
  /unavailable|discontinued|invalid variant|out of stock|not available/i.test(String(msg));

async function probeVariantsAvailability(variantIds = []) {
  if (!variantIds.length) return {};
  if (!PRINTFUL_KEY) {
    const fallback = {}; variantIds.forEach(v => (fallback[v] = null)); return fallback;
  }
  const payload = {
    recipient: { name: "VALTIX Probe", address1: "Test 1", city: "Madrid", country_code: "ES", zip: "28001" },
    items: variantIds.map(v => ({ variant_id: String(v), quantity: 1, name: "Availability Probe" })),
    confirm: false,
  };
  try {
    const r = await fetch("https://api.printful.com/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${PRINTFUL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) { const ok={}; variantIds.forEach(v=>ok[v]=true); return ok; }
    const data = await r.json().catch(() => ({}));
    const flag = isUnavailableMessage(data?.error?.message || "") ? false : null;
    const out = {}; variantIds.forEach(v => (out[v] = flag)); return out;
  } catch { const out = {}; variantIds.forEach(v => (out[v] = null)); return out; }
}

app.post("/availability", async (req, res) => {
  try {
    const { variant_ids = [] } = req.body || {};
    if (!Array.isArray(variant_ids) || !variant_ids.length)
      return res.status(400).json({ ok: false, error: "variant_ids requerido" });

    const fromCache = {}, missing = [];
    for (const v of variant_ids) {
      const k = String(v);
      if (k in availabilityCache.data) fromCache[k] = availabilityCache.data[k]; else missing.push(k);
    }

    let fresh = {};
    if (missing.length) {
      fresh = await probeVariantsAvailability(missing);
      Object.assign(availabilityCache.data, fresh);
      availabilityCache.updatedAt = new Date().toISOString();
    }

    res.json({ ok: true, updatedAt: availabilityCache.updatedAt, availability: { ...fromCache, ...fresh } });
  } catch (e) {
    console.error("❌ Error en availability:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ================= Rutas Admin y Printful ================= */
app.use("/admin", adminRouter);
app.use(router);

/* ================= 404 + Handler ================= */
app.use((req,res)=> res.status(404).json({ error: "Not Found" }));
app.use((err,req,res,next)=>{
  console.error("⚠️ Handler error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

/* ================= Start ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ VALTIX server on ${PORT}`));