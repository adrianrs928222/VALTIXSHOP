import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import bodyParser from "body-parser";
import router from "./router.js";

const app = express();

const ALLOWED_ORIGINS = [
  "https://adrianrs928222.github.io",
  "https://adrianrs928222.github.io/VALTIXSHOP",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(morgan("tiny"));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  }
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(bodyParser.json());
app.use(rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true }));

app.get("/health", (_req,res)=> res.json({ ok:true, time:new Date().toISOString() }));

app.use("/", router);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Servidor VALTIX en puerto ${PORT}`));