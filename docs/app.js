// docs/app.js
// Local-first images (sin depender de Printful)

// ===== Config =====
const BACKEND_URL = "https://valtixshop.onrender.com";
const CHECKOUT_PATH = "/checkout";
const CDN_BASE = (window.CDN_BASE || "").replace(/\/+$/, "") + (window.CDN_BASE ? "/" : "");

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let cart = JSON.parse(localStorage.getItem("cart") || "[]");
let allProducts = [];

// ===== Util =====
function setYear(){ const y=$("#year"); if (y) y.textContent = new Date().getFullYear(); }
function money(n){ return `${Number(n).toFixed(2)} €`; }
function getActiveCategory(){ const h=location.hash||""; return h.startsWith("#c/") ? decodeURIComponent(h.slice(3)) : "all"; }
function productSlug(p){ return String(p?.name||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }
function colorSlug(n){ return String(n||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }
function imgUrl(path){ if(!path) return ""; if (/^https?:\/\//i.test(path)) return path; return CDN_BASE + (path.startsWith("/") ? path.slice(1) : path); }

function headWithTimeout(url, ms=1200){
  return new Promise((resolve) => {
    const ctrl = new AbortController();
    const t = setTimeout(()=>{ try{ctrl.abort();}catch{} resolve(null); }, ms);
    fetch(url, { method:"HEAD", cache:"no-store", signal: ctrl.signal })
      .then(r=>{ clearTimeout(t); resolve(r && r.ok ? r : null); })
      .catch(()=>{ clearTimeout(t); resolve(null); });
  });
}

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

// ===== Promo =====
function startPromo(){
  try{
    const textEl=$(".promo-text"); if(!textEl) return;
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
  }catch(e){ console.error("PromoBox error:", e); }
}

// ===== Data =====
async function loadProducts(){
  const grid = $("#grid");
  try{
    const res = await fetch(`${BACKEND_URL}/api/printful/products`);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const { products } = await res.json();
    allProducts = Array.isArray(products) ? products : [];
    try { renderProducts(); } catch(e){
      console.error("Render grid error:", e);
      if (grid) grid.innerHTML="<p>Error al mostrar productos.</p>";
    }
  }catch(e){
    console.error("❌ Error al cargar productos:", e);
    if (grid) grid.innerHTML = "<p>Error al cargar productos.</p>";
  }
}

// ===== Render =====
function updateActiveNavLink(){
  const cat = getActiveCategory();
  $$("#main-nav a").forEach(a=>{
    const href = a.getAttribute("href") || "";
    const match = href.startsWith("#c/") ? href.slice(3) : "";
    a.classList.toggle("active", cat!=="all" && match===cat);
  });
}
function filtered(){
  const cat=getActiveCategory();
  if (cat==="all") return allProducts;
  return allProducts.filter(p => (p.categories||[]).includes(cat));
}

function renderProducts(){
  const grid=$("#grid"); if(!grid) return;
  grid.innerHTML="";
  const list = filtered();
  if(!list.length){ grid.innerHTML=`<p style="color:#777">Aún no hay productos.</p>`; return; }

  list.forEach(p=>{
    const colors = p.colors || {};
    const colorNames = Object.keys(colors);
    const firstColor = colorNames[0] || null;

    const firstLocal = (firstColor && (colors[firstColor].image || colors[firstColor].local_candidates?.[0])) || "img/placeholder.jpg";

    const card=document.createElement("div");
    card.className="card";
    card.innerHTML=`
      <button class="card-link" data-open>
        <img class="card-img" src="${ imgUrl(firstLocal) }" alt="${p.name}">
      </button>
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">${money(p.price)}</p>
        <button class="btn btn-alt" data-open>Ver producto</button>
      </div>
    `;
    card.querySelectorAll("[data-open]").forEach(b=> b.addEventListener("click",()=> openProductModal(p)));
    grid.appendChild(card);
  });

  updateActiveNavLink();
  updateBreadcrumbsSchema();
}

// ===== Modal Producto =====
const modal = $("#productModal");
const pmImg = $("#pmImg");
const pmTitle = $("#pmTitle");
const pmPrice = $("#pmPrice");
const pmColors = $("#pmColors");
const pmColorName = $("#pmColorName");
const pmSizes = $("#pmSizes");

let modalState = { product:null, color:null, size:null };

async function pickBestLocal(prod, colorName){
  try{
    const col = prod.colors?.[colorName];
    const first = col?.image || (Array.isArray(col?.local_candidates) ? col.local_candidates[0] : null);
    if (first){
      const u = imgUrl(first);
      const ok = await headWithTimeout(u, 1200);
      if (ok) return u;
    }
    if (Array.isArray(col?.local_candidates) && col.local_candidates.length){
      for (const rel of col.local_candidates.slice(1,3)){
        const url = imgUrl(rel);
        const ok = await headWithTimeout(url, 1200);
        if (ok) return url;
      }
    }
    return imgUrl("img/placeholder.jpg");
  }catch(e){
    console.error("pickBestLocal error:", e);
    return imgUrl("img/placeholder.jpg");
  }
}

function openProductModal(prod){
  modalState.product = prod;
  pmTitle.textContent = prod.name;
  pmPrice.textContent = money(prod.price);

  const colorNames = Object.keys(prod.colors||{});
  modalState.color = colorNames[0] || null;

  pmColors.innerHTML = colorNames.map((c,i)=>{
    const hex = prod.colors[c]?.hex || "#dddddd";
    const es = prod.colors[c]?.label_es || c;
    return `<button class="color-circle ${i===0?"active":""}" data-color="${c}" title="${es}" style="background-color:${hex}"></button>`;
  }).join("");

  pmColors.querySelectorAll(".color-circle").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      try{
        pmColors.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        modalState.color = btn.dataset.color;
        pmColorName.textContent = prod.colors[modalState.color]?.label_es || modalState.color;
        const url = await pickBestLocal(prod, modalState.color);
        pmImg.src = url;
        renderSizesCurrent();
      }catch(e){ console.error("Color change error:", e); }
    });
  });

  pmColorName.textContent = modalState.color ? (prod.colors[modalState.color]?.label_es || modalState.color) : "";
  pickBestLocal(prod, modalState.color).then(u=> pmImg.src = u).catch(()=>{ pmImg.src = imgUrl("img/placeholder.jpg"); });

  renderSizesCurrent();

  modal.classList.add("open");
  modal.setAttribute("aria-hidden","false");
}

function renderSizesCurrent(){
  const prod = modalState.product;
  const color = modalState.color;
  const sizes = Object.keys(prod.colors[color]?.sizes||prod.variant_map||{});
  modalState.size = sizes[0] || null;

  pmSizes.innerHTML = sizes.map((sz,i)=>`
    <button class="option-btn ${i===0?"active":""}" data-sz="${sz}">${sz}</button>
  `).join("");

  pmSizes.querySelectorAll(".option-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      pmSizes.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      modalState.size = btn.dataset.sz;
    });
  });
}

function currentVariantId(prod, color, size){
  const col = prod.colors?.[color];
  if (col?.sizes?.[size]) return col.sizes[size];
  if (prod?.variant_map?.[size]) return prod.variant_map[size];
  return null;
}

$("#pmAdd").addEventListener("click", ()=>{
  try{
    const p = modalState.product;
    const color = modalState.color;
    const size = modalState.size;
    const vid = currentVariantId(p, color, size);
    if (!vid) return alert("Selecciona talla/color válidos.");

    addToCart({
      sku: `${productSlug(p)}_${colorSlug(color)}_${size}`,
      name: `${p.name} ${color ? `· ${p.colors[color]?.label_es || color}` : ""} ${size?`· ${size}`:""}`,
      price: p.price,
      image: pmImg.src,
      variant_id: String(vid)
    });

    closeModal();
    openCart();
  }catch(e){ console.error("Add to cart error:", e); }
});

$("#pmClose").addEventListener("click", closeModal);
$("#productModal").addEventListener("click", e=>{ if (e.target.id==="productModal") closeModal(); });
function closeModal(){ modal.classList.remove("open"); modal.setAttribute("aria-hidden","true"); }

// ===== Carrito =====
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }
function addToCart(item){
  const idx = cart.findIndex(i=>i.sku===item.sku && i.variant_id===item.variant_id);
  if (idx>=0) cart[idx].qty += 1; else cart.push({ ...item, qty:1 });
  saveCart();
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
  const countEl=$("#cartCount"); if(countEl) countEl.textContent = count;
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
function openCart(){ $("#drawerBackdrop").classList.add("show"); $("#cartDrawer").classList.add("open"); $("#cartDrawer").setAttribute("aria-hidden","false"); renderCart(); }
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

// ===== Menú y navegación =====
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

// ===== Init =====
document.addEventListener("DOMContentLoaded", async ()=>{
  try{
    setYear();
    setupHamburger();
    startPromo();
    await loadProducts();

    $("#goCatalog")?.addEventListener("click",(e)=>{ e.preventDefault(); $("#catalogo")?.scrollIntoView({behavior:"smooth"}); });

    $("#openCart")?.addEventListener("click", openCart);
    $("#closeCart")?.addEventListener("click", closeCart);
    $("#drawerBackdrop")?.addEventListener("click", closeCart);
    $("#clearCart")?.addEventListener("click", clearCart);
    $("#checkoutBtn")?.addEventListener("click", goCheckout);

    window.addEventListener("hashchange", ()=>{ renderProducts(); updateActiveNavLink(); });
    updateActiveNavLink();
  }catch(e){
    console.error("INIT error:", e);
  }
});