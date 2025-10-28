// ===== Config =====
const BACKEND_URL = "https://api.valtixshop.com"; // Render o VPS
const CHECKOUT_PATH = "/checkout";

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let cart = JSON.parse(localStorage.getItem("cart") || "[]");

// ===== Util =====
function setYear(){ const y=$("#year"); if (y) y.textContent = new Date().getFullYear(); }
function money(n){ return `${Number(n).toFixed(2)} €`; }
function getActiveCategory(){ const h=location.hash||""; return h.startsWith("#c/") ? decodeURIComponent(h.slice(3)) : "all"; }
function productSlug(p){ return (p?.name||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }
function colorSlug(c){ return String(c||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }

// ===== SEO: Breadcrumbs =====
function updateBreadcrumbsSchema(){
  const el = $("#breadcrumbs-jsonld"); if(!el) return;
  const base = {
    "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      { "@type":"ListItem","position":1,"name":"Inicio","item":"https://www.valtixshop.com/" }
    ]
  };
  const cat = getActiveCategory();
  if (cat!=="all"){
    base.itemListElement.push({
      "@type":"ListItem","position":2,"name":cat.charAt(0).toUpperCase()+cat.slice(1),
      "item":`https://www.valtixshop.com/#c/${encodeURIComponent(cat)}`
    });
  }
  el.textContent = JSON.stringify(base);
}

// ===== Carga de productos =====
async function loadProducts(){
  const grid = $("#grid");
  try{
    const res = await fetch(`${BACKEND_URL}/api/printful/products?refresh=1`, { cache:"no-store" });
    const { products } = await res.json();
    window.products = products || [];
    renderProducts();
  }catch(e){
    console.error("❌ Error al cargar productos:", e);
    if (grid) grid.innerHTML = "<p>Error al cargar productos.</p>";
  }
}

// ===== pickBestImage (local srcset + fallback) =====
async function pickBestImage(prod, colorName){
  const col = prod.colors?.[colorName];
  // 1) Local candidates con src base
  if (col && Array.isArray(col.local_candidates)){
    for (const url of col.local_candidates){
      try{
        const head = await fetch(url, { method:"HEAD", cache:"no-store" });
        if (head.ok) return url;
      }catch{}
    }
  }
  // 2) Printful/fallback
  return (col?.image) || prod.image;
}

// ===== Render productos =====
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
    const colors = p.colors || {};
    const colorNames = Object.keys(colors);
    let selectedColor = colorNames[0] || null;

    const card=document.createElement("div");
    card.className="card";

    const firstURL = (selectedColor && colors[selectedColor]?.image) || p.image;
    const imgHTML = `
      <img class="card-img" 
           src="${firstURL}" 
           alt="${p.name}"
           loading="lazy">
    `;

    card.innerHTML=`
      ${imgHTML}
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">${money(p.price)}</p>

        <div class="options color-selector" role="group" aria-label="Colores">
          ${colorNames.map((cn,idx)=>{
            const hex = colors[cn]?.hex || "#ddd";
            const title = colors[cn]?.label_es || cn;
            return `<button class="color-circle ${idx===0?"active":""}" title="${title}" data-color="${cn}" style="background-color:${hex};"></button>`;
          }).join("")}
        </div>

        <div class="options" role="group" aria-label="Tallas" data-sizes></div>

        <button class="btn add-btn" data-sku="${p.sku}">Añadir al carrito</button>
      </div>
    `;

    const imgEl = card.querySelector(".card-img");
    const sizesWrap = card.querySelector("[data-sizes]");

    function renderSizes(){
      const map = colors[selectedColor]?.sizes || p.variant_map || {};
      const currentSizes = Object.keys(map);
      sizesWrap.innerHTML = currentSizes.map((sz,idx)=>`
        <button class="option-btn ${idx===0?"active":""}" data-sz="${sz}">${sz}</button>
      `).join("");
      sizesWrap.querySelectorAll(".option-btn").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          sizesWrap.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
          btn.classList.add("active");
        });
      });
    }
    renderSizes();

    async function updateImage(){
      const url = await pickBestImage(p, selectedColor);
      imgEl.src = url;
    }

    card.querySelectorAll(".color-circle").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        card.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedColor = btn.dataset.color;
        updateImage();
        renderSizes();
      });
    });

    // Add to cart
    card.querySelector(".add-btn").addEventListener("click", ()=>{
      const map = colors[selectedColor]?.sizes || p.variant_map || {};
      const selectedSize = (sizesWrap.querySelector(".option-btn.active")?.dataset?.sz) || Object.keys(map)[0];
      const variant_id = map[selectedSize];
      if (!variant_id) return;

      const colorLabel = selectedColor ? ` ${selectedColor}` : "";
      const sizeLabel = selectedSize ? ` — ${selectedSize}` : "";

      addToCart({
        sku: `${p.sku}_${colorSlug(selectedColor)}_${selectedSize}`,
        name: `${p.name}${colorLabel}${sizeLabel}`,
        price: p.price,
        image: imgEl.src,
        variant_id
      });
      openCart();
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
function openCart(){ $("#drawerBackdrop").classList.add("show"); $("#cartDrawer").classList.add("open"); $("#cartDrawer").setAttribute("aria-hidden","false"); renderCart(); }
function closeCart(){ $("#drawerBackdrop").classList.remove("show"); $("#cartDrawer").classList.remove("open"); $("#cartDrawer").setAttribute("aria-hidden","true"); }

// ===== Checkout =====
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

// ===== Promo / Router / Nav =====
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

  // Carrito
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", clearCart);
  $("#checkoutBtn")?.addEventListener("click", goCheckout);

  window.addEventListener("hashchange", ()=>{ renderProducts(); updateActiveNavLink(); });
  updateActiveNavLink();
});