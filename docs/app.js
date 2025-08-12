// ===== Config =====
const BACKEND_URL = "https://una-tienda1.onrender.com"; // Render
const CHECKOUT_PATH = "/create-checkout-session";

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let cart = JSON.parse(localStorage.getItem("cart") || "[]");

// ===== Util =====
function setYear(){ const y=$("#year"); if (y) y.textContent = new Date().getFullYear(); }
function money(n){ return `${Number(n).toFixed(2)} €`; }
function getActiveCategory(){
  const h=location.hash||"";
  return h.startsWith("#c/") ? decodeURIComponent(h.slice(3)) : "all";
}

// ===== SEO: Breadcrumbs =====
function getProductById(id){ return (window.products || []).find(p => p.id === id); }

function updateBreadcrumbsSchema(){
  const el = $("#breadcrumbs-jsonld"); if(!el) return;
  const base = {
    "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      { "@type":"ListItem","position":1,"name":"Inicio","item":"https://adrianrs928222.github.io/VALTIXSHOP/" }
    ]
  };
  const h = location.hash || "";
  if (h.startsWith("#c/")){
    const cat = decodeURIComponent(h.slice(3));
    base.itemListElement.push({
      "@type":"ListItem","position":2,"name":cat.charAt(0).toUpperCase()+cat.slice(1),
      "item":`https://adrianrs928222.github.io/VALTIXSHOP/#c/${encodeURIComponent(cat)}`
    });
  }
  if (h.startsWith("#p/")){
    const id = decodeURIComponent(h.slice(3));
    const p = getProductById(id);
    if (p){
      base.itemListElement.push(
        { "@type":"ListItem","position":2,"name":"Catálogo","item":"https://adrianrs928222.github.io/VALTIXSHOP/#catalogo" },
        { "@type":"ListItem","position":3,"name":p.name,"item":`https://adrianrs928222.github.io/VALTIXSHOP/#p/${encodeURIComponent(id)}` }
      );
    }
  }
  el.textContent = JSON.stringify(base);
}

// ===== Render productos (grid) =====
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
      <a class="card-link" href="#p/${p.id}">
        <img class="card-img" src="${p.image}" alt="${p.alt || p.name}">
      </a>
      <div class="card-body">
        <a class="card-link" href="#p/${p.id}">
          <h3 class="card-title">${p.name}</h3>
        </a>
        <p class="card-price">${money(p.price)}</p>
        ${sizes.length?`<div class="options" role="group" aria-label="Tallas">${sizeBtns}</div>`:""}
        <button class="btn add-btn" data-sku="${p.sku}">Añadir al carrito</button>
      </div>
    `;

    // selección de talla en tarjeta
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

    // añadir al carrito desde tarjeta
    const addBtn = card.querySelector(".add-btn");
    addBtn.addEventListener("click", (e)=>{
      e.preventDefault();
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
}

// ===== Detalle de producto =====
function renderProductDetail(id){
  const p = getProductById(id);
  const sec = $("#product-detail");
  if(!p || !sec){ location.hash = ""; return; }

  // Oculta catálogo, muestra ficha
  $("#catalogo")?.setAttribute("hidden","true");
  sec.removeAttribute("hidden");

  $("#detail-img").src = p.image;
  $("#detail-img").alt = p.alt || p.name;
  $("#detail-title").textContent = p.name;
  $("#detail-price").textContent = money(p.price);

  // Tallas
  const sizesWrap = $("#detail-sizes");
  sizesWrap.innerHTML = "";
  let selected = null;
  if (p.variant_map){
    const sizes = Object.keys(p.variant_map);
    selected = sizes[0];
    sizes.forEach((sz,ix)=>{
      const b = document.createElement("button");
      b.className = "option-btn" + (ix===0 ? " active" : "");
      b.textContent = sz; b.dataset.sz = sz;
      b.addEventListener("click", ()=>{
        sizesWrap.querySelectorAll(".option-btn").forEach(x=>x.classList.remove("active"));
        b.classList.add("active"); selected = sz;
      });
      sizesWrap.appendChild(b);
    });
  }

  // Comprar
  $("#detail-add").onclick = ()=>{
    let variant_id = p.variant_id;
    if(p.variant_map && selected) variant_id = p.variant_map[selected];
    addToCart({
      sku: p.sku + (selected?`_${selected}`:""),
      name: `${p.name}${selected?` — ${selected}`:""}`,
      price: p.price,
      image: p.image,
      variant_id
    });
  };

  // Volver
  $("#detail-back").onclick = (e)=>{
    e.preventDefault();
    sec.setAttribute("hidden","true");
    $("#catalogo")?.removeAttribute("hidden");
    history.back();
  };

  // Zoom PRO: abrir modal
  $("#detail-zoom").onclick = ()=>{
    window.__openZoom($("#detail-img").src);
  };
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

// Drawer
function openCart(){ $("#drawerBackdrop").classList.add("show"); $("#cartDrawer").classList.add("open"); $("#cartDrawer").setAttribute("aria-hidden","false"); }
function closeCart(){ $("#drawerBackdrop").classList.remove("show"); $("#cartDrawer").classList.remove("open"); $("#cartDrawer").setAttribute("aria-hidden","true"); }

// Checkout Stripe
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

// Router
function handleHash(){
  const h=location.hash || "";

  // Legales (si las usas en otras secciones)
  if (h.startsWith("#info/")){
    $("#product-detail")?.setAttribute("hidden","true");
    $("#catalogo")?.removeAttribute("hidden");
    renderProducts(); updateBreadcrumbsSchema(); return;
  }

  // Categoría
  if (h.startsWith("#c/")){
    $("#product-detail")?.setAttribute("hidden","true");
    $("#catalogo")?.removeAttribute("hidden");
    renderProducts(); updateBreadcrumbsSchema(); return;
  }

  // Ficha producto
  if (h.startsWith("#p/")){
    const id = decodeURIComponent(h.slice(3));
    renderProductDetail(id);
    updateBreadcrumbsSchema(); return;
  }

  // Home
  $("#product-detail")?.setAttribute("hidden","true");
  $("#catalogo")?.removeAttribute("hidden");
  renderProducts(); updateBreadcrumbsSchema();
}

// Promo rotatoria
function startPromo(){
  const box=$("#promoBox"); const textEl=$(".promo-text"); if(!box||!textEl) return;
  const msgs=[
    "✨ Calidad premium en cada prenda",
    "🚚 Envío gratuito en pedidos superiores a 60€",
    "💳 Pago seguro con Stripe"
  ];
  let i=0; const show=()=>{ textEl.textContent=msgs[i]; i=(i+1)%msgs.length; };
  show(); setInterval(show,8000);
}

// ====== ZOOM PRO ======
(function(){
  const modal = document.getElementById("imgModal");
  const modalImg = document.getElementById("modalImg");
  const modalClose = document.getElementById("modalClose");
  const backdrop = document.querySelector(".modal-backdrop");
  const canvas = document.querySelector(".modal-canvas");
  const loading = document.getElementById("modalLoading");
  const btnIn = document.getElementById("zoomIn");
  const btnOut = document.getElementById("zoomOut");
  const btnReset = document.getElementById("zoomReset");

  let scale=1, minScale=1, maxScale=4;
  let tx=0, ty=0;
  let isPointerDown=false, lastX=0, lastY=0;
  let pointers=new Map();

  function openZoom(src){
    modal.classList.add("show");
    modal.setAttribute("aria-hidden","false");
    loading.removeAttribute("aria-hidden");
    // reset
    scale=1; tx=0; ty=0; applyTransform(true);
    modalImg.onload = ()=> loading.setAttribute("aria-hidden","true");
    modalImg.onerror = ()=> loading.setAttribute("aria-hidden","true");
    modalImg.src = src;
    document.addEventListener("keydown", onKey);
  }
  function closeZoom(){
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden","true");
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e){
    if (e.key==="Escape") closeZoom();
    if (e.key==="+" || e.key==="=") zoomAt(canvas.clientWidth/2, canvas.clientHeight/2, 1.2);
    if (e.key==="-" || e.key==="_") zoomAt(canvas.clientWidth/2, canvas.clientHeight/2, 1/1.2);
    if (e.key==="0") resetView();
  }

  function applyTransform(){
    const bounds = getBounds();
    tx = Math.min(bounds.maxX, Math.max(bounds.minX, tx));
    ty = Math.min(bounds.maxY, Math.max(bounds.minY, ty));
    modalImg.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${scale})`;
  }
  function getBounds(){
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const extraX = (cw * scale - cw)/2;
    const extraY = (ch * scale - ch)/2;
    return { minX: -extraX, maxX: extraX, minY: -extraY, maxY: extraY };
  }
  function zoomAt(cx, cy, factor){
    const prevScale = scale;
    scale = Math.min(maxScale, Math.max(minScale, scale * factor));
    const s = scale / prevScale;
    const rect = canvas.getBoundingClientRect();
    const dx = cx - rect.left - rect.width/2 - tx;
    const dy = cy - rect.top  - rect.height/2 - ty;
    tx -= dx * (s - 1);
    ty -= dy * (s - 1);
    applyTransform();
  }
  function resetView(){ scale=1; tx=0; ty=0; applyTransform(true); }

  // Pointer + pinch
  canvas.addEventListener("pointerdown", (e)=>{
    canvas.setPointerCapture(e.pointerId);
    isPointerDown = true; lastX = e.clientX; lastY = e.clientY;
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    canvas.classList.add("grabbing");
  });
  canvas.addEventListener("pointermove", (e)=>{
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});

    // Pinch (2 dedos)
    if (pointers.size === 2){
      const [p1, p2] = [...pointers.values()];
      if (!p1 || !p2) return;
      const prevDist = distance(p1.prevX ?? p1.x, p1.prevY ?? p1.y, p2.prevX ?? p2.x, p2.prevY ?? p2.y);
      const currDist = distance(p1.x, p1.y, p2.x, p2.y);
      if (prevDist){
        const factor = currDist/prevDist;
        zoomAt((p1.x+p2.x)/2, (p1.y+p2.y)/2, factor);
      }
      p1.prevX = p1.x; p1.prevY = p1.y; p2.prevX = p2.x; p2.prevY = p2.y;
      return;
    }

    // Drag (1 dedo/ratón)
    if(!isPointerDown || pointers.size>1) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    tx += dx; ty += dy;
    applyTransform();
  });
  canvas.addEventListener("pointerup", (e)=>{
    pointers.delete(e.pointerId);
    isPointerDown=false; canvas.classList.remove("grabbing");
  });
  canvas.addEventListener("pointercancel", (e)=>{
    pointers.delete(e.pointerId);
    isPointerDown=false; canvas.classList.remove("grabbing");
  });
  function distance(x1,y1,x2,y2){ const dx=x2-x1, dy=y2-y1; return Math.hypot(dx,dy); }

  // Rueda
  canvas.addEventListener("wheel", (e)=>{
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
    zoomAt(e.clientX, e.clientY, factor);
  }, { passive:false });

  // Doble click/tap
  let lastTap=0;
  canvas.addEventListener("click", (e)=>{
    const now = Date.now();
    if (now - lastTap < 300){
      const targetScale = (scale===1) ? 2 : 1;
      const factor = targetScale/scale;
      zoomAt(e.clientX, e.clientY, factor);
    }
    lastTap = now;
  });

  // Controles
  $("#zoomIn").addEventListener("click", ()=> zoomAt(canvas.clientWidth/2, canvas.clientHeight/2, 1.2));
  $("#zoomOut").addEventListener("click",()=> zoomAt(canvas.clientWidth/2, canvas.clientHeight/2, 1/1.2));
  $("#zoomReset").addEventListener("click", resetView);

  document.querySelector(".modal-backdrop").addEventListener("click", closeZoom);
  $("#modalClose").addEventListener("click", closeZoom);

  // Exponer global
  window.__openZoom = openZoom;
})();

// Promo rotatoria
function startPromo(){
  const box=$("#promoBox"); const textEl=$(".promo-text"); if(!box||!textEl) return;
  const msgs=[
    "✨ Calidad premium en cada prenda",
    "🚚 Envío gratuito en pedidos superiores a 60€",
    "💳 Pago seguro con Stripe"
  ];
  let i=0; const show=()=>{ textEl.textContent=msgs[i]; i=(i+1)%msgs.length; };
  show(); setInterval(show,8000);
}

// Init
document.addEventListener("DOMContentLoaded", ()=>{
  setYear();
  handleHash();
  renderCart();
  startPromo();

  // CTA
  $("#goCatalog")?.addEventListener("click",(e)=>{ e.preventDefault(); $("#catalogo")?.scrollIntoView({behavior:"smooth"}); });

  // Carrito
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", clearCart);
  $("#checkoutBtn")?.addEventListener("click", goCheckout);

  // Burger
  const burger = $("#burger"), nav=$("#nav");
  if (burger && nav){
    burger.addEventListener("click", ()=>{
      const open = nav.classList.toggle("open");
      burger.setAttribute("aria-expanded", open ? "true":"false");
    });
    nav.querySelectorAll("a").forEach(a=> a.addEventListener("click", ()=> {
      nav.classList.remove("open"); burger.setAttribute("aria-expanded","false");
    }));
  }

  window.addEventListener("hashchange", handleHash);
});