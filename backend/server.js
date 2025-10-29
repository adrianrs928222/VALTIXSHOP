/**
 * VALTIX Backend API
 * - Printful (catálogo/pedidos)
 * - Stripe (checkout/webhook)
 * - CORS
 */
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import router from "./router.js";

const app = express();

/* ===== CORS ===== */
const ALLOWED_ORIGINS = [
  "https://adrianrs928222.github.io",
  "https://valtixshop.onrender.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];
app.use(cors({
  origin(origin, cb){
    if(!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null,true);
    return cb(new Error(`Origen no permitido: ${origin}`));
  },
  credentials:true,
  methods:["GET","POST","OPTIONS"],
  allowedHeaders:["Content-Type","Authorization","Stripe-Signature"]
}));
app.use((req,res,next)=>{
  const origin = req.headers.origin;
  if(origin && ALLOWED_ORIGINS.includes(origin)){
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary","Origin");
  }
  res.header("Access-Control-Allow-Credentials","true");
  res.header("Access-Control-Allow-Headers","Content-Type, Authorization, Stripe-Signature");
  res.header("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  if(req.method==="OPTIONS") return res.sendStatus(204);
  next();
});

/* ===== Stripe ===== */
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

/* ===== Printful ===== */
const PRINTFUL_KEY = process.env.PRINTFUL_API_KEY || "";

/* ===== Webhook Stripe ===== */
app.post("/webhook", bodyParser.raw({type:"application/json"}), async (req,res)=>{
  if(!stripe || !WEBHOOK_SECRET) return res.json({received:true, disabled:true});
  const sig = req.headers["stripe-signature"];
  let event;
  try{ event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET); }
  catch(err){ console.error("Webhook Error:", err.message); return res.status(400).send(`Webhook Error: ${err.message}`); }

  if(event.type==="checkout.session.completed"){
    const session = event.data.object;
    try{
      const cart = session.metadata?.cart ? JSON.parse(session.metadata.cart) : [];
      const cd = session.customer_details || {}; const address = cd.address || {};
      const items = cart.map(i=>({ variant_id:String(i.variant_id||""), quantity:Number(i.quantity||1), name: i.name||"VALTIX" })).filter(x=>x.variant_id);
      if(items.length && PRINTFUL_KEY){
        const payload = {
          recipient: {
            name: cd.name || "Cliente VALTIX",
            address1: address.line1 || "Dirección",
            city: address.city || "Ciudad",
            country_code: (address.country || "ES").toUpperCase(),
            zip: address.postal_code || "00000"
          },
          items, confirm:true
        };
        const r = await fetch("https://api.printful.com/orders", {
          method:"POST",
          headers:{ Authorization:`Bearer ${PRINTFUL_KEY}`, "Content-Type":"application/json" },
          body: JSON.stringify(payload)
        });
        const data = await r.json().catch(()=> ({}));
        if(!r.ok) console.error("Printful order error:", data);
        else console.log("Printful order OK:", data?.result?.id || data);
      }
    }catch(e){ console.error("Printful create error:", e); }
  }
  res.json({received:true});
});

app.use(express.json());

/* ===== Health ===== */
app.get("/health", (_,res)=> res.json({ ok:true, allowedOrigins:ALLOWED_ORIGINS }));

/* ===== Checkout ===== */
app.post("/checkout", async (req,res)=>{
  try{
    if(!stripe) return res.status(500).json({ error:"Falta STRIPE_SECRET_KEY" });
    const items = Array.isArray(req.body.items)? req.body.items : [];
    if(!items.length) return res.status(400).json({ error:"El carrito está vacío." });

    const cartMetadata = items.map(i=>({
      sku:i.sku, name:i.name, quantity:Number(i.quantity||1), price:Number(i.price), variant_id:String(i.variant_id||"")
    }));

    const session = await stripe.checkout.sessions.create({
      mode:"payment",
      payment_method_types:["card"],
      shipping_address_collection:{ allowed_countries:["ES","PT","FR","DE","IT"] },
      line_items: items.map(item=>({
        quantity:Number(item.quantity||1),
        price_data:{
          currency:"eur",
          product_data:{ name:String(item.name||"Producto") },
          unit_amount: Math.round(Number(item.price||0)*100)
        }
      })),
      success_url: "https://adrianrs928222.github.io/VALTIXSHOP/success.html",
      cancel_url:  "https://adrianrs928222.github.io/VALTIXSHOP/cancel.html",
      metadata: { cart: JSON.stringify(cartMetadata) }
    });

    res.json({ url: session.url });
  }catch(err){
    console.error("Checkout error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===== Rutas Printful (catálogo normalizado) ===== */
app.use(router);

/* ===== Start ===== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> {
  console.log(`✅ VALTIX backend en puerto ${PORT}`);
});