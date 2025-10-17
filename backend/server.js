import express from "express";
import cors from "cors";
import Stripe from "stripe";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();

// ====== CORS ======
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://adrianrs928222.github.io";
app.use(cors({ origin: ALLOWED_ORIGIN }));

// ====== STRIPE ======
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ====== DISPONIBILIDAD (cache en memoria) ======
const availabilityCache = {
  // "variant_id": true|false|null
  data: {},
  updatedAt: null
};

function isUnavailableMessage(msg = "") {
  const m = String(msg).toLowerCase();
  return /unavailable|discontinued|invalid variant|out of stock|not available/.test(m);
}

async function probeVariantsAvailability(variantIds = []) {
  if (!variantIds.length) return {};

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
      name: "Availability Probe"
    })),
    confirm: false // NO fabrica
  };

  const r = await fetch("https://api.printful.com/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await r.json();

  if (r.ok) {
    const out = {};
    for (const v of variantIds) out[String(v)] = true;
    return out;
  }

  const out = {};
  const msg = data?.error?.message || "";
  const flag = isUnavailableMessage(msg) ? false : null;
  for (const v of variantIds) out[String(v)] = flag;
  return out;
}

// ====== WEBHOOK (ANTES de express.json) ======
app.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
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
          variant_id: String(i.variant_id),
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
        confirm: true // MODO REAL
      };

      const r = await fetch("https://api.printful.com/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await r.json();
      if (!r.ok) {
        console.error("Printful error:", data);
      } else {
        console.log("✅ Printful pedido creado:", data?.result?.id || data);
      }
    } catch (e) {
      console.error("Printful create order error:", e);
    }
  }

  res.json({ received: true });
});

// ====== JSON BODY (después del webhook) ======
app.use(express.json());

// ====== HEALTH ======
app.get("/health", (_, res) => res.json({ ok: true }));

// ====== CHECKOUT ======
app.post("/checkout", async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    const cartMetadata = items.map(i => ({
      sku: i.sku,
      name: i.name,
      quantity: Number(i.quantity || i.qty || 1),
      price: Number(i.price),
      variant_id: i.variant_id ? String(i.variant_id) : ""
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      shipping_address_collection: { allowed_countries: ["ES", "PT", "FR", "DE", "IT"] },
      line_items: items.map(item => ({
        price_data: {
          currency: "eur",
          product_data: { name: item.name },
          unit_amount: Math.round(Number(item.price) * 100)
        },
        quantity: Number(item.quantity || item.qty || 1)
      })),
      success_url: "https://adrianrs928222.github.io/VALTIXSHOP/",
      cancel_url: "https://adrianrs928222.github.io/VALTIXSHOP/",
      metadata: { cart: JSON.stringify(cartMetadata) }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ====== DISPONIBILIDAD: on-demand ======
app.post("/availability", async (req, res) => {
  try {
    const { variant_ids = [] } = req.body;
    if (!Array.isArray(variant_ids) || !variant_ids.length) {
      return res.status(400).json({ ok:false, error:"variant_ids requerido" });
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

    return res.json({
      ok: true,
      updatedAt: availabilityCache.updatedAt,
      availability: { ...fromCache, ...fresh }
    });
  } catch (e) {
    console.error("availability error:", e);
    return res.status(500).json({ ok:false, error:String(e) });
  }
});

// ====== DISPONIBILIDAD: refresh (cron) ======
app.post("/refresh-availability", async (req, res) => {
  try {
    const { variant_ids = [] } = req.body;

    const ids = Array.from(new Set(
      (Array.isArray(variant_ids) && variant_ids.length ? variant_ids : Object.keys(availabilityCache.data))
        .map(String)
    ));

    if (!ids.length) {
      return res.json({ ok:true, message:"No hay variant_ids que refrescar aún." });
    }

    const chunkSize = 20;
    const result = {};
    for (let i=0; i<ids.length; i+=chunkSize) {
      const slice = ids.slice(i, i+chunkSize);
      const part = await probeVariantsAvailability(slice);
      Object.assign(result, part);
      Object.assign(availabilityCache.data, part);
      availabilityCache.updatedAt = new Date().toISOString();
    }

    return res.json({ ok:true, updatedAt: availabilityCache.updatedAt, availability: result });
  } catch (e) {
    console.error("refresh-availability error:", e);
    return res.status(500).json({ ok:false, error:String(e) });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Backend VALTIX en puerto ${PORT}`));