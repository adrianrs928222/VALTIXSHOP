// =======================
// Config (ajusta tu backend Render)
// =======================
const BACKEND_URL = "https://una-tienda1.onrender.com";
const CHECKOUT_PATH = "/create-checkout-session";

// =======================
// Helpers
// =======================
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// =======================
/* Estado */
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

// =======================
// Util
// =======================
function setYear(){
  const y = $("#year");
  if (y) y.textContent = new Date().getFullYear();
}

function getActiveCategory(){
  const h = location.hash || "";
  if (h.startsWith("#c/")) return decodeURIComponent(h.slice(3));
  return "all";
}

// =======================
// SEO: Breadcrumbs + Product schema
// =======================
function updateBreadcrumbsSchema(){
  const el = $("#breadcrumbs-jsonld");
  if (!el) return;

  const base = {
    "@context":"https://schema.org",
    "@type":"BreadcrumbList",
    "itemListElement":[
      { "@type":"ListItem","position":1,"name":"Inicio","item":"https://adrianrs928222.github.io/VALTIXSHOP/" }
    ]
  };

  const cat = getActiveCategory();
  if (cat !== "all"){
    const pretty = cat.charAt(0).toUpperCase() + cat.slice(1);
    base.itemListElement.push({
      "@type":"ListItem","position":2,"name":pretty,
      "item":`https://adrianrs928222.github.io/VALTIXSHOP/#c/${encodeURIComponent(cat)}`
    });
  }
  el.textContent = JSON.stringify(base);
}

function injectProductSchemas(list){
  // Limpia anteriores
  document.querySelectorAll('script[data-prod-schema="1"]').forEach(n => n.remove());
  // Inyecta uno por producto visible
  list.forEach(p=>{
    const data = {
      "@context":"https://schema.org",
      "@type":"Product",
      "name": p.name,
      "image": [p.image],
      "sku": p.sku,
      "brand": { "@type":"Brand","name":"VALTIX" },
      "offers": {
        "@type":"Offer",
        "priceCurrency":"EUR",
        "price": Number(p.price).toFixed(2),
        "availability":"https://schema.org/InStock",
        "url":"https://adrianrs928222.github.io/VALTIXSHOP/"
      }
    };
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.dataset.prodSchema = "1";
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  });
}

// =======================
// Render de productos
// =======================
function renderProducts(){
  const grid = $("#grid");
  if (!grid) return;

  grid.innerHTML = "";

  if (!Array.isArray(window.products)){
    grid.innerHTML = `<p style="color:#777">Aún no hay productos. Añade objetos en <code>products.js</code>.</p>`;
    return;
  }

  const cat  = getActiveCategory();
  const list = (cat==="all")
    ? products
    : products.filter(p => Array.isArray(p.categories) && p.categories.includes(cat));

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

  // Eventos "Añadir al carrito"
  $$("#grid .btn").forEach(btn=>{
    btn.addEventListener("click",(e)=>{
      const sku = e.currentTarget.getAttribute("data-sku");
      const prod = products.find(x=>x.sku===sku);
      if (prod) addToCart(prod);
    });
  });

  // SEO Product schema de los visibles
  injectProductSchemas(list);
}

// =======================
// Carrito
// =======================
function saveCart(){
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCart();
}

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

function clearCart(){
  cart = [];
  saveCart();
}

function subtotal(){
  return cart.reduce((s,i)=> s + (Number(i.price)*i.qty), 0);
}

function renderCart(){
  // contador
  const count = cart.reduce((s,i)=>s+i.qty,0);
  const countEl = $("#cartCount");
  if (countEl) countEl.textContent = count;

  const box = $("#cartItems");
  if (!box) return;
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
      plus.addEventListener("click",  ()=> changeQty(i.sku,  1));
      box.appendChild(row);
    });
  }

  const sub = $("#subtotal");
  if (sub) sub.textContent = `${subtotal().toFixed(2)} €`;
}

// =======================
// Drawer carrito
// =======================
function openCart(){
  $("#drawerBackdrop")?.classList.add("show");
  $("#cartDrawer")?.classList.add("open");
  $("#cartDrawer")?.setAttribute("aria-hidden","false");
}
function closeCart(){
  $("#drawerBackdrop")?.classList.remove("show");
  $("#cartDrawer")?.classList.remove("open");
  $("#cartDrawer")?.setAttribute("aria-hidden","true");
}

// =======================
// Checkout (Stripe vía Render)
// =======================
async function goCheckout(){
  if (cart.length===0) return alert("Tu carrito está vacío.");

  const items = cart.map(i => ({
    variant_id: i.variant_id,   // Printful
    quantity: i.qty,
    sku: i.sku,
    name: i.name,
    price: Number(i.price)
  }));

  try{
    const res = await fetch(`${BACKEND_URL}${CHECKOUT_PATH}`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ items })
    });
    const data = await res.json();
    if (data && data.url){
      window.location.href = data.url; // Stripe Checkout
    } else {
      alert("No se pudo iniciar el pago. Inténtalo más tarde.");
    }
  }catch(err){
    console.error(err);
    alert("Error de conexión con el servidor.");
  }
}

// =======================
// Router: categorías / legales
// =======================
function handleHash(){
  const h = location.hash;

  // Páginas legales (si las usas)
  const pages = {
    "#info/aviso-legal":"#legal-aviso",
    "#info/politica-compras":"#legal-compras",
    "#info/privacidad":"#legal-privacidad"
  };
  Object.values(pages).forEach(sel => { const el = document.querySelector(sel); if (el) el.hidden = true; });
  if (pages[h]){
    const el = document.querySelector(pages[h]);
    if (el){ el.hidden = false; window.scrollTo({ top: el.offsetTop-60, behavior:"smooth" }); }
    updateBreadcrumbsSchema();
    return;
  }

  // Catálogo
  renderProducts();
  updateBreadcrumbsSchema();
}

// =======================
// Promo (recuadro) lenta y visible
// =======================
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
  box.textContent = msgs[0];
  box.classList.add("show");
  setInterval(()=>{
    i = (i+1) % msgs.length;
    box.textContent = msgs[i];
    box.classList.remove("show");
    void box.offsetWidth; // reinicia animación
    box.classList.add("show");
  }, 6000);
}

// =======================
// Init
// =======================
document.addEventListener("DOMContentLoaded", ()=>{
  setYear();
  handleHash();         // pinta catálogo (y filtra si hay #c/...)
  renderCart();
  startPromo();

  // CTA "Ver Catálogo" -> scroll suave
  const cta = document.querySelector('.cta[href="#catalogo"]');
  if (cta){
    cta.addEventListener("click", (e)=>{
      e.preventDefault();
      $("#catalogo")?.scrollIntoView({ behavior:"smooth" });
    });
  }

  // Carrito listeners
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", clearCart);
  $("#checkoutBtn")?.addEventListener("click", goCheckout);

  // Hash router
  window.addEventListener("hashchange", handleHash);
});