// ===== Config =====
const BACKEND_URL = "https://valtixshop.onrender.com";
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

// ===== Carga de productos desde backend =====
async function loadProducts(){
  try{
    const res = await fetch(`${BACKEND_URL}/api/printful/products`);
    const { products } = await res.json();
    window.products = products || [];
    console.log("✅ Productos cargados:", products.length);
    await fetchAvailability();
    handleHash();
  }catch(e){
    console.error("❌ Error al cargar productos:", e);
    document.getElementById("grid").innerHTML = "<p>Error al cargar productos.</p>";
  }
}

// ===== Disponibilidad (Printful) =====
let availability = {}; 

function collectVariantIds() {
  const ids = [];
  if (Array.isArray(window.products)) {
    window.products.forEach(p => {
      if (p?.variant_id) ids.push(String(p.variant_id));
      if (p?.variant_map) Object.values(p.variant_map).forEach(v => ids.push(String(v)));
    });
  }
  return [...new Set(ids)];
}

async function fetchAvailability() {
  const variant_ids = collectVariantIds();
  if (!variant_ids.length) return;
  try {
    const r = await fetch(`${BACKEND_URL}/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant_ids })
    });
    const data = await r.json();
    if (data?.ok) availability = data.availability || {};
  } catch (e) { console.error("fetchAvailability error:", e); }
}

async function refreshAvailability() {
  const variant_ids = collectVariantIds();
  if (!variant_ids.length) return;
  try {
    const r = await fetch(`${BACKEND_URL}/refresh-availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant_ids })
    });
    const data = await r.json();
    if (data?.ok) availability = data.availability || {};
  } catch (e) { console.error("refreshAvailability error:", e); }
}

function getStockFlag(variant_id) {
  const v = availability?.[String(variant_id)];
  return v;
}

// ===== Render productos (con tallas y stock) =====
function renderProducts(){
  const grid=$("#grid"); if(!grid) return;
  grid.innerHTML="";

  if(!Array.isArray(window.products) || !products.length){
    grid.innerHTML=`<p style="color:#777">Aún no hay productos en Printful.</p>`;
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
        <div class="stock-line"><span class="stock-badge" data-stock>Consultando…</span></div>
        ${sizes.length?`<div class="options" role="group" aria-label="Tallas">${sizeBtns}</div>`:""}
        <button class="btn add-btn" data-sku="${p.sku}">Añadir al carrito</button>
      </div>
    `;

    let selectedSize = sizes.length ? sizes[0] : null;
    const btns = card.querySelectorAll(".option-btn");
    btns.forEach(btn=>{
      if(btn.dataset.sz===selectedSize) btn.classList.add("active");
      btn.addEventListener("click", ()=>{
        btns.forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedSize = btn.dataset.sz;
        updateStockBadge();
      });
    });

    function currentVariantId(){
      if (p.variant_map && selectedSize && p.variant_map[selectedSize]) return p.variant_map[selectedSize];
      return p.variant_id || null;
    }
    function updateStockBadge(){
      const badge = card.querySelector("[data-stock]");
      const vid = currentVariantId();
      const flag = vid ? getStockFlag(vid) : null;
      badge.classList.remove("ok","no","unknown");
      if (flag === true){
        badge.textContent = "En stock";
        badge.classList.add("ok");
      } else if (flag === false){
        badge.textContent = "Sin stock";
        badge.classList.add("no");
      } else {
        badge.textContent = "Consultando…";
        badge.classList.add("unknown");
      }
    }
    updateStockBadge();

    card.querySelector(".add-btn").addEventListener("click", ()=>{
      const prod = products.find(x=>x.sku===p.sku);
      if(!prod) return;
      let variant_id = prod.variant_id;
      if (prod.variant_map && selectedSize && prod.variant_map[selectedSize]){
        variant_id = prod.variant_map[selectedSize];
      }
      addToCart({
        sku: prod.sku + (selectedSize?`_${selectedSize}`:""),
        name: `${prod.name}${selectedSize?` — ${selectedSize}`:""}`,
        price: prod.price,
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
  const countEl=$("#cartCount"); if(countEl) countEl.textContent=count;
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
  $("#subtotal").textContent = money(subtotal());
}

// ===== Drawer =====
function openCart(){ $("#drawerBackdrop").classList.add("show"); $("#cartDrawer").classList.add("open"); $("#cartDrawer").setAttribute("aria-hidden","false"); }
function closeCart(){ $("#drawerBackdrop").classList.remove("show"); $("#cartDrawer").classList.remove("open"); $("#cartDrawer").setAttribute("aria-hidden","true"); }

// ===== Checkout (Stripe) =====
async function goCheckout(){
  if(!cart.length) return alert("Tu carrito está vacío.");
  const items = cart.map(i=>({ variant_id:i.variant_id, quantity:i.qty, sku:i.sku, name:i.name, price:Number(i.price) }));
  try{
    const res = await fetch(`${BACKEND_URL}${CHECKOUT_PATH}`, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ items })
    });
    const data = await res.json();
    if(data?.url) window.location.href = data.url;
    else alert("No se pudo iniciar el pago. Intenta más tarde.");
  }catch(e){ console.error(e); alert("Error de conexión con el servidor."); }
}

// ===== Promo =====
function startPromo(){
  const box=$("#promoBox"); const textEl=$(".promo-text"); if(!box||!textEl) return;
  if(window.innerWidth <= 520){
    textEl.textContent = "🚚 Envíos GRATIS en pedidos superiores a 60€";
  } else {
    const msgs=[
      "Compra hoy y recibe en España o en cualquier parte del mundo 🌍",
      "🚚 Envíos GRATIS en pedidos superiores a 60€"
    ];
    let i=0; const show=()=>{ textEl.textContent=msgs[i]; i=(i+1)%msgs.length; };
    show(); setInterval(show,8000);
  }
}

// ===== Router =====
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

// ===== Menú =====
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
document.addEventListener("DOMContentLoaded", async ()=>{
  setYear();
  setupHamburger();
  startPromo();
  await loadProducts(); 
  renderCart();

  $("#goCatalog")?.addEventListener("click",(e)=>{ e.preventDefault(); $("#catalogo")?.scrollIntoView({behavior:"smooth"}); });
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", clearCart);
  $("#checkoutBtn")?.addEventListener("click", goCheckout);

  window.addEventListener("hashchange", ()=>{ handleHash(); updateActiveNavLink(); });

  setInterval(async ()=>{
    await refreshAvailability();
    renderProducts();
  }, 43200000);
});