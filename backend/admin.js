import express from "express";
import fetch from "node-fetch";

const admin = express.Router();

// Auth simple por header
admin.use((req,res,next)=>{
  const token = req.headers["x-admin-key"];
  if(token !== process.env.ADMIN_KEY) return res.status(403).json({error:"No autorizado"});
  next();
});

// Pedidos recientes desde Printful
admin.get("/orders", async (req,res)=>{
  try{
    const r = await fetch("https://api.printful.com/orders", {
      headers: { Authorization:`Bearer ${process.env.PRINTFUL_API_KEY}` }
    });
    const data = await r.json().catch(()=>({}));
    if(!r.ok) return res.status(r.status).json(data);
    res.json(data);
  }catch(e){
    res.status(500).json({error:String(e)});
  }
});

export default admin;