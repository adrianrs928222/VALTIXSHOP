import express from "express";
import cors from "cors";
import Stripe from "stripe";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();

/* ========================= CORS ========================= */
const envOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const fallbackOrigins = [
  "https://adrianrs928222.github.io",
  "https://valtixshop.onrender.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

const ALLOWED_ORIGINS = Array.from(new Set([...fallbackOrigins, ...envOrigins]));

app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`Origen no permitido: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"]
}));

// Cabeceras extra + preflight universal
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

/* ========================= Stripe ========================= */
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

/* ============ Cache de disponibilidad (Printful) ============ */
const availabilityCache = { data: {}, updatedAt: null };
const PRINTFUL_KEY = process.env.PRINTFUL_API_KEY || "";

const isUnavailableMessage = (msg = "") =>
  /unavailable|discontinued|invalid variant|out of stock|not available/i.test(String(msg));

/**
 * Estrategia práctica: probamos un pedido "falso" (confirm:false) para cada variant_id.
 * - Si responde OK -> lo consideramos en stock (true).
 * - Si devuelve error claro de no disponible -> false.
 * - Si no hay clave o respuesta ambigua -> null.
 */
async function probeVariantsAvailability(variantIds = []) {
  if (!variantIds.length) return {};
  if (!PRINTFUL_KEY) {
    const out = {}; for (const v of variantIds) out[String(v)] = null; return out;
  }

  const payload = {
    recipient: { name: "VALTIX Probe", address1: "Test 1", city: "Madrid", country_code: "ES", zip: "28001" },
    items: variantIds.map(v => ({ variant_id: String(v), quantity: 1, name: "Availability Probe" })),
    confirm: false
  };

  try {
    const r = await fetch("https://api.printful.com/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${PRINTFUL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Si OK, asumimos stock para todos los enviados
    if (r.ok) {
      const out = {};
      for (const v of variantIds) out[String(v)] = true;
      return out;
    }

    const data = await r.json().catch(() => ({}));
    const flag = isUnavailableMessage(data?.error?.message || "") ? false : null;
    const out = {};
    for (const v of variantIds) out[String(v)] = flag;
    return out;
  } catch (e) {
    console.error("probeVariantsAvailability error:", e);
    const out = {};
    for (const v of variantIds) out[String(v)] = null;
    return out;
  }
}

/* ============== Webhook Stripe (RAW antes de json) ============== */
app.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !WEBHOOK_SECRET) {
    // Si no está configurado, no rompemos OK (útil en desarrollo)
    return res.json({ received: true, disabled: true });
  }

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    try {
      const cart = session.metadata?.cart ? JSON.parse(session.metadata.cart) : [];
      const cd = session.customer_details || {};
      const address = cd.address || {};

      const items = cart
        .map(i => ({
          variant_id: i.variant_id ? String(i.variant_id) : "",
          quantity: Number(i.quantity || 1),
          name: i.name || "Producto VALTIX"
        }))
        .filter(it => !!it.variant_id);

      if (!items.length) {
        console.error("No hay items válidos con variant_id para Printful.");
        return res.json({ received: true });
      }

      const payload = {
        recipient: {
          name: cd.name || "Cliente VALTIX",
          address1: address.line1 || "Dirección",
          city: address.city || "Ciudad",
          country_code: (address.country || "ES").toUpperCase(),
          zip: address.postal_code || "00000"
        },
        items,
        confirm: true // modo real
      };

      if (!PRINTFUL_KEY) {
        console.warn("PRINTFUL_API_KEY no configurada; no se crea pedido.");
      } else {
        const r = await fetch("https://api.printful.com/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${PRINTFUL_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) console.error("Printful error:", data);
        else console.log("✅ Printful pedido creado:", data?.result?.id || data);
      }
    } catch (e) {
      console.error("Printful create order error:", e);
    }
  }

  res.json({ received: true });
});

/* ============== JSON body DESPUÉS del webhook ============== */
app.use(express.json());

/* ================= Health ================= */
app.get("/health", (_, res) => res.json({ ok: true, allowedOrigins: ALLOWED_ORIGINS }));

/* ================= Checkout (Stripe) ================= */
app.post("/checkout", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Falta STRIPE_SECRET_KEY" });

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: "El carrito (items) está vacío." });

    const cartMetadata = items.map(i => ({
      sku: i.sku,
      name: i.name,
      quantity: Number(i.quantity || i.qty || 1),
      price: Number(i.price),
      variant_id: i.variant_id ? String(i.variant_id) : ""
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      shipping_address_collection: { allowed_countries: ["ES", "PT", "FR", "DE", "IT"] },
      line_items: items.map(item => ({
        quantity: Number(item.quantity || item.qty || 1),
        price_data: {
          currency: "eur",
          product_data: { name: String(item.name || "Producto") },
          unit_amount: Math.round(Number(item.price || 0) * 100)
        }
      })),
      success_url: "https://adrianrs928222.github.io/VALTIXSHOP/success.html",
      cancel_url: "https://adrianrs928222.github.io/VALTIXSHOP/cancel.html",
      metadata: { cart: JSON.stringify(cartMetadata) }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ============== Disponibilidad on-demand ============== */
app.post("/availability", async (req, res) => {
  try {
    const { variant_ids = [] } = req.body || {};
    if (!Array.isArray(variant_ids) || !variant_ids.length) {
      return res.status(400).json({ ok: false, error: "variant_ids requerido" });
    }

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
    console.error("availability error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ============== Refresh disponibilidad (manual/cron) ============== */
app.post("/refresh-availability", async (req, res) => {
  try {
    const { variant_ids = [] } = req.body || {};
    const ids = Array.from(new Set((variant_ids.length ? variant_ids : Object.keys(availabilityCache.data)).map(String)));
    if (!ids.length) return res.json({ ok: true, message: "No hay variant_ids que refrescar aún." });

    const chunkSize = 20;
    const result = {};
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const part = await probeVariantsAvailability(slice);
      Object.assign(result, part);
    }
    Object.assign(availabilityCache.data, result);
    availabilityCache.updatedAt = new Date().toISOString();

    res.json({ ok: true, updatedAt: availabilityCache.updatedAt, availability: result });
  } catch (e) {
    console.error("refresh-availability error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ===================== Arranque ===================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Backend VALTIX en puerto ${PORT}`);
  console.log(`CORS permitido: ${ALLOWED_ORIGINS.join(", ")}`);
});