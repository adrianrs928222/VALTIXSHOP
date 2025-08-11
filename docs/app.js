// ======= Config =======
const BACKEND_URL = "https://una-tienda1.onrender.com"; // tu Render
const CHECKOUT_PATH = "/create-checkout-session";

// ======= Helpers =======
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ======= Estado =======
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

// ======= Util =======
function setYear(){ const y=$("#year"); if (y) y.textContent = new Date().getFullYear(); }

// Categoría activa via hash (#c/...)
function getActiveCategory(){
  const h = location.hash || "";
  if (h.startsWith("#c/")) return decodeURIComponent(h.slice(3));
  return "all";
}

// ======= Render productos =======
function renderProducts(){
  const grid = $("#grid");
  if (!grid) return;
  grid.innerHTML = "";

  if (!Array.isArray(window.products)){
    grid.innerHTML = `<p style="color:#777">Aún no hay productos. Añade objetos en <code>products.js</code>.</p>`;
    return;
  }

  const cat = getActiveCategory();
  const list = cat === "all" ? products : products.filter(p => (p.categories||[]).includes(cat));

  list.forEach(p=>{
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img class="card-img" src="${p.image}" alt="${p.name}">
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">${Number(p.price).toFixed(2)} €</p>
        <button class="btn" data-sku="${p.sku}">Añadir al carrito</button>
      </div>
    `;
    grid.appendChild(card);
  });

  // Click en "Añadir al carrito"
  $$("#grid .btn").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      const sku = e.currentTarget.getAttribute("data-sku");
      const prod = products.find(x=>x.sku===sku);
      if (prod){ addToCart(prod); }
    });
  });
}

// ======= Carrito =======
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }

function addToCart(p){
  const idx = cart.findIndex(i=>i.sku===p.sku);
  if (idx>=0) cart[idx].qty += 1;
  else cart.push({ sku:p.sku, name:p.name, price:p.price, image:p.image, variant_id:p.variant_id, qty:1 });
  saveCart();
  openCart();
}

function changeQty(sku, delta){
  const item = cart.find(i=>i.sku===sku);
  if (!item) return;
  item.qty += delta;
  if (item.qty<=0) cart = cart.filter(i=>i.sku!==sku);
  saveCart();
}

function clearCart(){ cart = []; saveCart(); }

function subtotal(){ return cart.reduce((s,i)=> s + (Number(i.price)*i.qty), 0); }

function renderCart(){
  $("#cartCount").textContent = cart.reduce((s,i)=>s+i.qty,0);
  const box = $("#cartItems");
  box.innerHTML = "";

  if (cart.length===0){
    box.innerHTML = `<p style="color:#666">Tu carrito está vacío.</p>`;
  } else {
    cart.forEach(i=>{
      const row = document.createElement("div");
      row.className = "drawer-item";
      row.innerHTML = `
        <img src="${i.image}" alt="${i.name}">
        <div style="flex:1">
          <div style="font-weight:700">${i.name}</div>
          <div class="qty">
            <button aria-label="Quitar">-</button>
            <span>${i.qty}</span>
            <button aria-label="Añadir">+</button>
          </div>
          <div style="color:#666">${Number(i.price).toFixed(2)} €</div>
        </div>
      `;
      const [minus, , plus] = row.querySelectorAll(".qty button, .qty span");
      minus.addEventListener("click", ()=> changeQty(i.sku, -1));
      plus.addEventListener("click", ()=> changeQty(i.sku, 1));
      box.appendChild(row);
    });
  }
  $("#subtotal").textContent = `${subtotal().toFixed(2)} €`;
}

// ======= Drawer =======
function openCart(){
  $("#drawerBackdrop").classList.add("show");
  $("#cartDrawer").classList.add("open");
  $("#cartDrawer").setAttribute("aria-hidden","false");
}
function closeCart(){
  $("#drawerBackdrop").classList.remove("show");
  $("#cartDrawer").classList.remove("open");
  $("#cartDrawer").setAttribute("aria-hidden","true");
}

// ======= Checkout (Stripe vía Render) =======
async function goCheckout(){
  if (cart.length===0) return alert("Tu carrito está vacío.");

  // Enviamos solo lo necesario (sin exponer claves)
  const items = cart.map(i => ({
    variant_id: i.variant_id, // Printful
    quantity: i.qty,
    sku: i.sku,
    name: i.name,
    price: Number(i.price)
  }));

  try{
    const res = await fetch(`${BACKEND_URL}${CHECKOUT_PATH}`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ items })
    });
    const data = await res.json();
    if (data && data.url){
      window.location.href = data.url; // redirección a Stripe Checkout
    } else {
      alert("No se pudo iniciar el pago. Intenta más tarde.");
    }
  }catch(err){
    console.error(err);
    alert("Error de conexión con el servidor.");
  }
}

// ======= Navegación hash =======
function handleHash(){
  const h = location.hash;

  // Páginas legales
  const pages = {
    "#info/aviso-legal":"#legal-aviso",
    "#info/politica-compras":"#legal-compras",
    "#info/privacidad":"#legal-privacidad"
  };
  Object.values(pages).forEach(sel => { const el = document.querySelector(sel); if (el) el.hidden = true; });

  if (pages[h]){
    const el = document.querySelector(pages[h]);
    if (el){ el.hidden = false; window.scrollTo({top:el.offsetTop-60,behavior:"smooth"}); }
    return;
  }

  // Categorías del catálogo
  renderProducts();
}

// ======= Promo lenta =======
function startPromo(){
  const box = $("#promoBox");
  if (!box) return;
  const msgs = [
    "💎 Buena calidad en cada prenda",
    "🇪🇸📦 Envío 2–5 días en España",
    "🌍 Entrega internacional garantizada",
    "💳 Pago seguro con Stripe"
  ];
  let i = 0;
  setInterval(()=>{
    i = (i+1)%msgs.length;
    box.classList.remove("swap");
    box.textContent = msgs[i];
    void box.offsetWidth;
    box.classList.add("swap");
  }, 6000);
}

// ======= Init =======
document.addEventListener("DOMContentLoaded", ()=>{
  setYear();
  renderProducts();
  renderCart();
  startPromo();

  // CTA "Catálogo": scroll suave
  const goCatalog = $("#goCatalog");
  if (goCatalog){
    goCatalog.addEventListener("click", (e)=>{
      e.preventDefault();
      const sec = document.querySelector("#catalogo");
      if (sec) sec.scrollIntoView({ behavior:"smooth" });
    });
  }

  // Carrito
  $("#openCart").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#drawerBackdrop").addEventListener("click", closeCart);
  $("#clearCart").addEventListener("click", clearCart);
  $("#checkoutBtn").addEventListener("click", goCheckout);

  // Hash (categorías / legales)
  window.addEventListener("hashchange", handleHash);
});