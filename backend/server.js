import express from "express";
import cors from "cors";
import Stripe from "stripe";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import router from "./router.js";      // rutas Printful (la versión con catálogo por variant_id)
import adminRouter from "./admin.js";  // tu admin

const app = express();

// Conf Render/proxy
app.set("trust proxy", 1);

/* ================= CORS ================= */
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

/* ============== Seguridad/Perf/Logs ============== */
app.use(helmet({ contentSecurityPolicy: false })); // para que GitHub Pages no choque con CSP
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "tiny"));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 180 });
app.use(limiter);

/* ============== Stripe config ============== */
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

/* ============== Webhook (RAW antes de express.json) ============== */
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

/* ============== JSON normal después del webhook ============== */
app.use(express.json());

/* ============== Health ============== */
app.get("/health", (_, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "dev",
    uptime: process.uptime(),
    allowedOrigins: ALLOWED_ORIGINS
  });
});

/* ============== Tu lógica de checkout/availability ============== */
// … (deja tus rutas /checkout y /availability exactamente como las tenías)

/* ============== Rutas admin y Printful ============== */
app.use("/admin", adminRouter);
app.use(router);

/* ============== 404 + handler ============== */
app.use((req,res)=> res.status(404).json({ error: "Not Found" }));
app.use((err,req,res,next)=>{
  console.error("⚠️ Handler error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

/* ============== Start ============== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ VALTIX server on ${PORT}`));