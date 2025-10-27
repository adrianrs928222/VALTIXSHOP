// app.js
// ===== Config =====
const BACKEND_URL = "https://valtixshop.onrender.com";
const CHECKOUT_PATH = "/checkout";

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ===== Estado =====
let cart = JSON.parse(localStorage.getItem("cart") || "[]");
let CATALOG = []; // productos Printful normalizados

// ===== Util =====
function setYear(){ const y=$("#year"); if (y) y.textContent = new Date().getFullYear(); }
function money(n){ return `${Number(n||0).toFixed(2)} €`; }
function getActiveCategory(){ const h=location.hash||""; return h.startsWith("#c/") ? decodeURIComponent(h.slice(3)) : "all"; }
function slug(s){ return String(s||"").toLowerCase().trim().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }
function productSlug(p){ return slug(p.name); }
function colorSlug(c){ return slug(c); }

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

// ===== Carga de productos =====
async function loadProducts(){
  try{
    const res = await fetch(`${BACKEND_URL}/api/printful/products`);
    const data = await res.json();
    CATALOG = data?.products || [];
    renderList();
  }catch(e){
    console.error("❌ Error al cargar productos:", e);
    const grid = $("#grid");
    if (grid) grid.innerHTML = "<p>Error al cargar productos.</p>";
  }
}

// ===== Render lista =====
function updateActiveNavLink(){
  const cat = getActiveCategory();
  $$("#main-nav a").forEach(a=>{
    const href = a.getAttribute("href") || "";
    const match = href.startsWith("#c/") ? href.slice(3) : "";
    a.classList.toggle("active", cat!=="all" && match===cat);
  });
}

function gridCardHTML(p){
  const colors = p.colors || {};
  const colorNames = Object.keys(colors);
  // Usa la primera imagen disponible
  const firstColor = colorNames[0];
  const img = (firstColor && colors[firstColor]?.image) || p.image;

  return `
    <div class="card">
      <img class="card-img" src="${img}" alt="${p.name}">
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">${money(p.price)}</p>
        <button class="btn view-btn" data-slug="${productSlug(p)}">Ver producto</button>
      </div>
    </div>
  `;
}

function renderList(){
  const grid=$("#grid"); if(!grid) return;
  grid.innerHTML="";

  const cat=getActiveCategory();
  const list=(cat==="all") ? CATALOG : CATALOG.filter(p=>Array.isArray(p.categories)&&p.categories.includes(cat));

  if (!list.length){
    grid.innerHTML=`<p style="color:#777">No hay productos en esta categoría.</p>`;
  } else {
    grid.innerHTML = list.map(gridCardHTML).join("");
  }

  grid.querySelectorAll(".view-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const slug = btn.dataset.slug;
      const prod = CATALOG.find(p=>productSlug(p)===slug);
      openDetail(prod);
    });
  });

  updateActiveNavLink();
  updateBreadcrumbsSchema();
}

// ===== Drawer / Carrito =====
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

// ===== Detalle de producto (modal dinámico) =====
const PD = {
  el: null, overlay: null, main: null, thumbs: null, title: null, price: null,
  colors: null, sizes: null, add: null, close: null
};

function ensureDetailDOM(){
  if (PD.el) return;
  const overlay = document.createElement("div");
  overlay.className = "pd-overlay";
  overlay.innerHTML = `
    <div class="pd-panel" role="dialog" aria-modal="true" aria-label="Detalle de producto">
      <button class="pd-close" aria-label="Cerrar">✕</button>
      <div class="pd-header">
        <h3 class="pd-title"></h3>
        <span class="pd-price"></span>
      </div>
      <div class="pd-gallery">
        <img id="pdMain" class="pd-main" alt="">
        <div>
          <div id="pdThumbs" class="pd-row"></div>
          <div id="pdColors" class="pd-row"></div>
          <div class="pd-row"><strong>Talla</strong></div>
          <div id="pdSizes" class="pd-row"></div>
          <div class="pd-footer">
            <button id="pdAdd" class="btn">Añadir al carrito</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  PD.overlay = overlay;
  PD.el = overlay.querySelector(".pd-panel");
  PD.main = overlay.querySelector("#pdMain");
  PD.thumbs = overlay.querySelector("#pdThumbs");
  PD.colors = overlay.querySelector("#pdColors");
  PD.sizes = overlay.querySelector("#pdSizes");
  PD.add = overlay.querySelector("#pdAdd");
  PD.title = overlay.querySelector(".pd-title");
  PD.price = overlay.querySelector(".pd-price");
  PD.close = overlay.querySelector(".pd-close");

  PD.close.addEventListener("click", ()=> {
    PD.overlay.classList.remove("show");
    PD.el.setAttribute("aria-hidden","true");
  });
  PD.overlay.addEventListener("click", (e)=> {
    if (e.target === PD.overlay){
      PD.overlay.classList.remove("show");
      PD.el.setAttribute("aria-hidden","true");
    }
  });
}

async function pickBestImage(prod, colorName){
  const col = prod.colors?.[colorName];
  if (col && Array.isArray(col.local_candidates)){
    for (const url of col.local_candidates){
      try{
        const res = await fetch(url, { method:"HEAD", cache:"no-store" });
        if (res.ok) return url;
      }catch{}
    }
  }
  return (col?.image) || prod.image;
}

function updateBreadcrumbsSchemaDetail(name){
  const el = $("#breadcrumbs-jsonld"); if(!el) return;
  const base = {
    "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      { "@type":"ListItem","position":1,"name":"Inicio","item":"https://adrianrs928222.github.io/VALTIXSHOP/" },
      { "@type":"ListItem","position":2,"name":"Producto","item":"https://adrianrs928222.github.io/VALTIXSHOP/#" },
      { "@type":"ListItem","position":3,"name":name }
    ]
  };
  el.textContent = JSON.stringify(base);
}

function openDetail(prod){
  if (!prod) return;
  ensureDetailDOM();

  const colorNames = Object.keys(prod.colors||{});
  let selectedColor = colorNames[0] || null;
  let selectedSize = selectedColor ? Object.keys(prod.colors[selectedColor]?.sizes||{})[0] : Object.keys(prod.variant_map||{})[0] || null;

  PD.title.textContent = prod.name;
  PD.price.textContent = money(prod.price);

  (async ()=>{
    const first = await pickBestImage(prod, selectedColor);
    PD.main.src = first;
    PD.main.alt = prod.name;
    PD.thumbs.innerHTML = [first, prod.image].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).map((u,i)=>`<img data-idx="${i}" src="${u}" alt="Vista ${i+1}">`).join("");
    PD.thumbs.querySelectorAll("img").forEach(img=> img.addEventListener("click", ()=>{ PD.main.src = img.src; }));
  })();

  // ===== Colores (todos, scroll en móvil)
  PD.colors.innerHTML = `
    <div class="pd-row"><strong>Color</strong></div>
    <div class="pd-colors-scroll" id="pdColorsScroll">
      ${colorNames.map((cn,idx)=>{
        const hex = prod.colors[cn]?.hex || "#ddd";
        const es  = prod.colors[cn]?.label_es || cn;
        return `
          <div class="pd-color">
            <button class="color-circle ${idx===0?"active":""}" data-color="${cn}" title="${es} (${cn})" aria-label="${es}" style="background:${hex}"></button>
            <span class="color-name" data-for="${cn}" style="display:${idx===0?"inline":"none"}">${es}</span>
          </div>`;
      }).join("")}
    </div>
  `;

  function showColorName(cn){
    PD.colors.querySelectorAll(".color-name").forEach(n=> n.style.display="none");
    const el = PD.colors.querySelector(`.color-name[data-for="${CSS.escape(cn)}"]`);
    if (el) el.style.display = "inline";
  }

  PD.colors.querySelectorAll(".color-circle").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      PD.colors.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      selectedColor = btn.dataset.color;
      showColorName(selectedColor);

      const best = await pickBestImage(prod, selectedColor);
      PD.main.src = best;

      renderSizes();
    });
  });

  // ===== Tallas
  function renderSizes(){
    const sizes = (selectedColor && prod.colors[selectedColor]?.sizes)
      ? Object.keys(prod.colors[selectedColor].sizes)
      : Object.keys(prod.variant_map||{});
    selectedSize = sizes[0] || null;
    PD.sizes.innerHTML = sizes.map((sz,idx)=>`
      <button class="option-btn ${idx===0?"active":""}" data-sz="${sz}" aria-label="Talla ${sz}">${sz}</button>
    `).join("");
    PD.sizes.querySelectorAll(".option-btn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        PD.sizes.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedSize = btn.dataset.sz;
      });
    });
  }
  renderSizes();

  // ===== CTA con check animado + cierre + abrir carrito
  PD.add.onclick = () => {
    const vid =
      (selectedColor && prod.colors[selectedColor]?.sizes?.[selectedSize])
        ? prod.colors[selectedColor].sizes[selectedSize]
        : (prod.variant_map?.[selectedSize] || null);

    if (!vid) { alert("Variante no disponible."); return; }

    const es = prod.colors[selectedColor]?.label_es || selectedColor || "";

    addToCart({
      sku: prod.sku + (selectedColor ? `_${selectedColor}` : "") + (selectedSize ? `_${selectedSize}` : ""),
      name: `${prod.name}${selectedColor ? ` ${es}` : ""}${selectedSize ? ` — ${selectedSize}` : ""}`,
      price: prod.price,
      image: PD.main.src,
      variant_id: String(vid),
    });

    const prevHTML = PD.add.innerHTML;
    PD.add.classList.add("success");
    PD.add.innerHTML = `<span class="tick" aria-hidden="true">✓</span> Añadido`;
    PD.add.disabled = true;

    setTimeout(() => {
      PD.overlay.classList.remove("show");
      PD.el.setAttribute("aria-hidden", "true");
    }, 250);

    setTimeout(() => {
      openCart();
      PD.add.classList.remove("success");
      PD.add.innerHTML = prevHTML || "Añadir al carrito";
      PD.add.disabled = false;
    }, 600);
  };

  PD.overlay.classList.add("show");
  PD.el.setAttribute("aria-hidden","false");
  updateBreadcrumbsSchemaDetail(prod.name);
}

// ===== Menú responsive =====
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
  setYear();
  setupHamburger();
  startPromo();

  await loadProducts();
  renderCart();

  // Botón "Ver catálogo" => siempre mostrar TODO
  $("#goCatalog")?.addEventListener("click", (e) => {
    e.preventDefault();
    history.replaceState(null, "", "#");
    renderList();
    updateActiveNavLink();
    $("#catalogo")?.scrollIntoView({ behavior: "smooth" });
  });

  // Carrito
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", clearCart);
  $("#checkoutBtn")?.addEventListener("click", goCheckout);

  window.addEventListener("hashchange", ()=>{ renderList(); updateActiveNavLink(); });
  updateActiveNavLink();
});