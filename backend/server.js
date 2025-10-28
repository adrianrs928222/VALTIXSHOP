import express from "express";
import cors from "cors";
import Stripe from "stripe";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import nodemailer from "nodemailer";

import router from "./router.js";
import admin from "./admin.js";

const app = express();

/* ================== CORS ================== */
/* Permite configurar dominios extra por ENV (coma-separados) */
const DEFAULT_ORIGINS = [
  "https://adrianrs928222.github.io",   // GitHub Pages
  "https://valtixshop.onrender.com"     // Backend (Render) o panel
];
const EXTRA_ORIGINS = (process.env.FRONTEND_ORIGINS || "")
  .split(",").map(s=>s.trim()).filter(Boolean);
// Ejemplo FRONTEND_ORIGINS: https://shop.tudominio.com,https://tudominio.com

const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ORIGINS, ...EXTRA_ORIGINS])];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`🚫 Origen no permitido: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature", "x-admin-key"],
  })
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature, x-admin-key");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ================== Stripe / Printful ================== */
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const PRINTFUL_KEY = process.env.PRINTFUL_API_KEY || "";

/* ================== Email transport (Gmail o Hostinger) ================== */
function buildTransporter(){
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) return null;

  // Si defines MAIL_HOST (p.ej. smtp.hostinger.com) usa SMTP genérico
  if (process.env.MAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 465),
      secure: String(process.env.MAIL_SECURE || "true") === "true",
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
    });
  }

  // Por defecto: Gmail (requiere App Password)
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
  });
}

/* ========== WEBHOOK STRIPE (raw antes de express.json) ========== */
app.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !WEBHOOK_SECRET) return res.json({ received: true, disabled: true });

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("❌ Error firma webhook:", err.message);
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
          variant_id: String(i.variant_id || ""),
          quantity: Number(i.quantity || 1),
          name: i.name || "Producto VALTIX",
        }))
        .filter(it => !!it.variant_id);

      // Crear pedido en Printful
      if (items.length && PRINTFUL_KEY) {
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
            Authorization: `Bearer ${PRINTFUL_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) console.error("❌ Error pedido Printful:", data);
        else console.log("✅ Pedido Printful creado:", data?.result?.id || data);
      }

      // Email post-compra (si hay config)
      if (cd.email) {
        const transporter = buildTransporter();
        if (transporter) {
          try {
            await transporter.sendMail({
              from: process.env.MAIL_FROM || `"VALTIX Shop" <${process.env.MAIL_USER}>`,
              to: cd.email,
              subject: "Confirmación de pedido VALTIX",
              html: `
                <h2>¡Gracias por tu compra!</h2>
                <p>Tu pedido está en proceso. Te avisaremos cuando se envíe.</p>
                <p><strong>Resumen:</strong></p>
                <ul>
                  ${cart.map(i=>`<li>${i.name} × ${i.quantity}</li>`).join("")}
                </ul>
                <p>Soporte: soporte@valtix.com</p>
              `
            });
            console.log("📧 Email de confirmación enviado a", cd.email);
          } catch(e){
            console.error("❌ Error enviando email:", e.message);
          }
        }
      }
    } catch (e) {
      console.error("❌ Error creando pedido/Email:", e);
    }
  }
  res.json({ received: true });
});

/* ========= Body parser normal DESPUÉS del webhook raw ========= */
app.use(express.json());

/* ================== Health ================== */
app.get("/health", (_, res) => {
  res.json({ ok: true, allowedOrigins: ALLOWED_ORIGINS });
});

/* ================== Checkout ================== */
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

/* ================== Rutas ================== */
app.use(router);           // /api/printful/…
app.use("/admin", admin);  // /admin/orders (protegido)

/* ================== Start ================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Servidor VALTIX en puerto ${PORT}`);
  console.log(`🌐 CORS → ${ALLOWED_ORIGINS.join(", ")}`);
});