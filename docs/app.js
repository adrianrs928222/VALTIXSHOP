// ===== Config =====
const BACKEND_URL = "https://una-tienda1.onrender.com";
const CHECKOUT_PATH = "/checkout";

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let cart = JSON.parse(localStorage.getItem("cart") || "[]");

// ===== Util =====
function setYear(){ const y=$("#year"); if (y) y.textContent = new Date().getFullYear(); }
function money(n){ return `${Number(n).toFixed(2)} €`; }
function getActiveCategory(){ const h=location.hash||""; return h.startsWith("#c/") ? decodeURIComponent(h.slice(3)) : "all"; }

// ===== SEO: Breadcrumbs =====
function updateBreadcrumbsSchema(){
  const el = $("#breadcrumbs-jsonld"); if(!el) return;
  const base = {
    "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      { "@type":"ListItem","position":1,"name":"Inicio","item":"https://adrianrs928222.github.io/VALTIXSHOP/" }
    ]
  };
  const cat = getActiveCategory();
  if (cat!=="all"){
    base.itemListElement.push({
      "@type":"ListItem","position":2,"name":cat.charAt(0).toUpperCase()+cat.slice(1),
      "item":`https://adrianrs928222.github.io/VALTIXSHOP/#c/${encodeURIComponent(cat)}`
    });
  }
  el.textContent = JSON.stringify(base);
}

// ===== Disponibilidad (API backend) =====
async function fetchAvailabilityForMap(variantMap) {
  const ids = Object.values(variantMap || {}).map(String).filter(Boolean);
  if (!ids.length) return {};
  try {
    const r = await fetch(`${BACKEND_URL}/availability`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ variant_ids: ids })
    });
    const data = await r.json();
    return data?.availability || {};
  } catch {
    return {};
  }
}

async function verifyCartAvailability(cartItems){
  const ids = cartItems.map(i => i.variant_id).filter(Boolean).map(String);
  if (!ids.length) return []; // si no hay variant_ids válidos, evita llamada inútil
  const r = await fetch(`${BACKEND_URL}/availability`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ variant_ids: ids })
  });
  const data = await r.json();
  const bad = [];
  for (const it of cartItems) {
    const vid = String(it.variant_id || "");
    if (!vid) continue;
    const st = data?.availability?.[vid];
    if (st === false) bad.push(it.name);
  }
  return bad;
}

// ===== Render productos (con tallas) =====
function renderProducts(){
  const grid=$("#grid"); if(!grid) return;
  grid.innerHTML="";

  if(!Array.isArray(window.products) || !products.length){
    grid.innerHTML=`<p style="color:#777">Aún no hay productos. Añádelos en <code>products.js</code>.</p>`;
    return;
  }

  const cat=getActiveCategory();
  const list=(cat==="all") ? products : products.filter(p=>Array.isArray(p.categories)&&p.categories.includes(cat));

  list.forEach(p=>{
    const sizes = p.variant_map ? Object.keys(p.variant_map) : [];
    const sizeBtns = sizes.map((sz,idx)=>`<button class="option-btn" data-sz="${sz}" ${idx===0?"aria-pressed='true'":""}>${sz}</button>`).join("");

    const card=document.createElement("div");
    card.className="card";
    card.innerHTML=`
      <img class="card-img" src="${p.image}" alt="${p.name}">
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">${money(p.price)}</p>
        ${sizes.length?`<div class="options" role="group" aria-label="Tallas">${sizeBtns}</div>`:""}
        <button class="btn add-btn" data-sku="${p.sku}">Añadir al carrito</button>
      </div>
    `;

    // selección de talla
    let selectedSize = sizes.length ? sizes[0] : null;
    const btns = card.querySelectorAll(".option-btn");
    btns.forEach(btn=>{
      if(btn.dataset.sz===selectedSize) btn.classList.add("active");
      btn.addEventListener("click", ()=>{
        btns.forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedSize = btn.dataset.sz;
      });
    });

    // autodesactivar tallas sin stock
    if (sizes.length && p.variant_map) {
      fetchAvailabilityForMap(p.variant_map).then(avMap => {
        sizes.forEach(sz => {
          const vid = String(p.variant_map[sz]);
          const isAvailable = avMap[vid];
          const btn = card.querySelector(`.option-btn[data-sz="${sz}"]`);
          if (!btn) return;
          if (isAvailable === false) {
            btn.disabled = true;
            btn.title = "Sin stock temporalmente";
            btn.classList.add("disabled");
            if (selectedSize === sz) {
              const firstEnabled = [...card.querySelectorAll(".option-btn")].find(b => !b.disabled);
              if (firstEnabled) firstEnabled.click();
            }
          }
        });
      });
    }

    // add to cart
    card.querySelector(".add-btn").addEventListener("click", ()=>{
      const prod = products.find(x=>x.sku===p.sku);
      if(!prod) return;

      let variant_id = prod.variant_id || null;
      if (prod.variant_map && selectedSize && prod.variant_map[selectedSize]){
        variant_id = String(prod.variant_map[selectedSize]);
      }

      addToCart({
        sku: prod.sku + (selectedSize?`_${selectedSize}`:""),
        name: `${prod.name}${selectedSize?` — ${selectedSize}`:""}`,
        price: Number(prod.price),
        image: prod.image,
        variant_id
      });
    });

    grid.appendChild(card);
  });

  updateActiveNavLink();
  updateBreadcrumbsSchema();
}

// ===== Carrito =====
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }
function addToCart(item){
  const idx = cart.findIndex(i=>i.sku===item.sku && i.variant_id===item.variant_id);
  if (idx>=0) cart[idx].qty += 1; else cart.push({ ...item, qty:1 });
  saveCart(); openCart();
}
function changeQty(sku, vid, delta){
  const it = cart.find(i=>i.sku===sku && i.variant_id===vid); if(!it) return;
  it.qty += delta; if(it.qty<=0) cart = cart.filter(i=>!(i.sku===sku && i.variant_id===vid));
  saveCart();
}
function clearCart(){ cart = []; saveCart(); }
function subtotal(){ return cart.reduce((s,i)=> s + (Number(i.price)*i.qty), 0); }

function renderCart(){
  const count = cart.reduce((s,i)=>s+i.qty,0);
  const countEl=$("#cartCount"); if(countEl) countEl.textContent = String(count);
  const box=$("#cartItems"); if(!box) return;

  box.innerHTML="";
  if(!cart.length){
    box.innerHTML=`<p style="color:#666">Tu carrito está vacío.</p>`;
  }else{
    cart.forEach(i=>{
      const row=document.createElement("div");
      row.className="drawer-item";
      row.innerHTML=`
        <img src="${i.image}" alt="${i.name}">
        <div style="flex:1">
          <div style="font-weight:700">${i.name}</div>
          <div class="qty">
            <button aria-label="Quitar">-</button>
            <span>${i.qty}</span>
            <button aria-label="Añadir">+</button>
          </div>
          <div style="color:#666">${money(i.price)}</div>
        </div>
      `;
      const [minus, , plus] = row.querySelectorAll(".qty button, .qty span");
      minus.addEventListener("click", ()=> changeQty(i.sku, i.variant_id, -1));
      plus.addEventListener("click",  ()=> changeQty(i.sku, i.variant_id,  1));
      box.appendChild(row);
    });
  }
  const subt=$("#subtotal"); if (subt) subt.textContent = money(subtotal());
}

// ===== Drawer =====
function openCart(){ $("#drawerBackdrop")?.classList.add("show"); $("#cartDrawer")?.classList.add("open"); $("#cartDrawer")?.setAttribute("aria-hidden","false"); }
function closeCart(){ $("#drawerBackdrop")?.classList.remove("show"); $("#cartDrawer")?.classList.remove("open"); $("#cartDrawer")?.setAttribute("aria-hidden","true"); }

// ===== Checkout (Stripe) =====
async function goCheckout(){
  if(!cart.length) return alert("Tu carrito está vacío.");
  const items = cart.map(i=>({
    variant_id: i.variant_id ? String(i.variant_id) : null,
    quantity: Number(i.qty),
    sku: i.sku,
    name: i.name,
    price: Number(i.price)
  }));

  // Doble verificación: no cobrar si algo está sin stock
  const agotados = await verifyCartAvailability(items);
  if (agotados.length) {
    alert("Estas tallas están sin stock ahora mismo:\n- " + agotados.join("\n- "));
    return;
  }

  try{
    const res = await fetch(`${BACKEND_URL}${CHECKOUT_PATH}`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ items })
    });
    const data = await res.json();
    if(data?.url) window.location.href = data.url;
    else alert("No se pudo iniciar el pago. Intenta más tarde.");
  }catch(e){
    console.error(e);
    alert("Error de conexión con el servidor.");
  }
}

// ===== Router (categorías / legales) =====
function handleHash(){
  const h=location.hash;
  const pages={
    "#info/aviso-legal":"#legal-aviso",
    "#info/politica-compras":"#legal-compras",
    "#info/privacidad":"#legal-privacidad"
  };
  Object.values(pages).forEach(sel=>{ const el=document.querySelector(sel); if(el) el.hidden=true; });

  if(pages[h]){
    const el=document.querySelector(pages[h]); if(el){ el.hidden=false; window.scrollTo({top:el.offsetTop-60,behavior:"smooth"}); }
    updateBreadcrumbsSchema(); return;
  }
  renderProducts();
}

// ===== Menú hamburguesa =====
function setupHamburger(){
  const btn = $("#menu-toggle");
  const nav = $("#main-nav");
  if(!btn || !nav) return;

  btn.addEventListener("click", ()=>{
    nav.classList.toggle("show");
    const expanded = btn.getAttribute("aria-expanded")==="true";
    btn.setAttribute("aria-expanded", String(!expanded));
  });

  nav.addEventListener("click", e=>{
    if(e.target.tagName==="A" && window.innerWidth<=900){
      nav.classList.remove("show");
      btn.setAttribute("aria-expanded","false");
    }
  });

  window.addEventListener("resize", ()=>{
    if(window.innerWidth>900){
      nav.classList.remove("show");
      btn.setAttribute("aria-expanded","false");
    }
  });
}

// ===== Nav activo =====
function updateActiveNavLink(){
  const cat = getActiveCategory();
  $$("#main-nav a").forEach(a=>{
    const href = a.getAttribute("href") || "";
    const match = href.startsWith("#c/") ? href.slice(3) : "";
    a.classList.toggle("active", cat!=="all" && match===cat);
  });
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", ()=>{
  setYear();
  setupHamburger();
  handleHash();         // <- esto ya renderiza productos o legales
  renderCart();

  $("#goCatalog")?.addEventListener("click",(e)=>{ e.preventDefault(); $("#catalogo")?.scrollIntoView({behavior:"smooth"}); });

  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", clearCart);
  $("#checkoutBtn")?.addEventListener("click", goCheckout);

  window.addEventListener("hashchange", ()=>{ handleHash(); updateActiveNavLink(); });
});