import express from "express";
import cors from "cors";
import Stripe from "stripe";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();

// CORS solo desde GitHub Pages
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://adrianrs928222.github.io";
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// Stripe + Printful
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const PRINTFUL_API_KEY = process.env.PRINTFUL_API_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// SKU -> variant_id (cámbialos por los reales de tu Printful)
const PRINTFUL_VARIANTS = {
  camiseta_blanca_premium: 12345678,
  sudadera_negra_capucha: 23456789,
  pantalon_negro_lino: 34567890,
  zapatillas_negras_minimal: 45678901,
  gorra_negra_valtix: 56789012
};

app.get("/health", (_, res) => res.json({ ok: true }));

// Crear sesión de pago con Stripe
app.post("/checkout", async (req, res) => {
  try {
    const items = req.body.items || [];
    const cartMetadata = items.map(i => ({
      sku: i.sku,
      name: i.name,
      quantity: i.quantity || 1,
      price: i.price
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      shipping_address_collection: { allowed_countries: ["ES","PT","FR","DE","IT"] },
      line_items: items.map(item => ({
        price_data: {
          currency: "eur",
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100)
        },
        quantity: item.quantity || 1
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

// Webhook: cuando Stripe confirma el pago, creamos el pedido en Printful
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

      const items = cart.map(i => ({
        sync_variant_id: PRINTFUL_VARIANTS[i.sku],
        quantity: i.quantity || 1
      })).filter(x => !!x.sync_variant_id);

      const payload = {
        recipient: {
          name: cd.name || "Cliente VALTIX",
          address1: address.line1 || "Dirección",
          city: address.city || "Ciudad",
          country_code: (address.country || "ES").toUpperCase(),
          zip: address.postal_code || "00000"
        },
        items
      };

      const r = await fetch("https://api.printful.com/orders", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${PRINTFUL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) console.error("Printful error:", data);
      else console.log("Printful OK:", data?.result?.id || data);
    } catch (e) {
      console.error("Printful create order error:", e);
    }
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Backend VALTIX en puerto ${PORT}`));
