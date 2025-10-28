/**
 * ============================================================
 * VALTIX Product Page  (manteniendo el nombre: product.js)
 * - Carga images.json (manual)
 * - Colores/tallas 1:1 con Printful (variant_id real)
 * - Galería por color (case-insensitive) + lazy loading thumbs
 * - Selector con HEX forzado si falta
 * - Checkout via backend (Stripe) + Drawer carrito
 * - SEO JSON-LD (BreadcrumbList + Product) + <meta> dinámico
 * ============================================================
 */

const BACKEND_URL = "https://valtixshop.onrender.com";

// Helpers
const $  = s => document.querySelector(s);
function money(n){ return `${Number(n).toFixed(2)} €`; }
function getSku(){ const u=new URL(location.href); return u.searchParams.get("sku"); }

// Carrito
let cart = JSON.parse(localStorage.getItem("cart") || "[]");
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
async function goCheckout(){
  if(!cart.length) return alert("Tu carrito está vacío.");
  const items = cart.map(i=>({ variant_id:i.variant_id, quantity:i.qty, sku:i.sku, name:i.name, price:Number(i.price) }));
  try{
    const res = await fetch(`${BACKEND_URL}/checkout`, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ items })
    });
    const data = await res.json();
    if(data?.url) window.location.href = data.url;
    else alert("No se pudo iniciar el pago.");
  }catch(e){ console.error(e); alert("Error de conexión con el servidor."); }
}

// PF util
function availableColorsOf(p){
  return Object.entries(p.colors||{})
    .filter(([,meta]) => meta && meta.sizes && Object.keys(meta.sizes).length)
    .map(([name]) => name);
}
function sizeNamesOf(p,color){ return Object.keys(p.colors?.[color]?.sizes||{}); }

// images.json (manual) + lookup
const MANUAL_IMAGES = {};
function manualImagesFor(sku, color){
  const bucket = MANUAL_IMAGES[sku] || {};
  const key = Object.keys(bucket).find(k => k.toLowerCase().trim() === String(color).toLowerCase().trim());
  return key ? bucket[key] : null;
}

// Color HEX adicional
const COLOR_HEX_CLIENT = {
  "verde":"#008000","negro":"#000000","blanco":"#ffffff","gris":"#808080",
  "azul":"#0057ff","navy":"#001f3f","rojo":"#ff0000","burdeos":"#800020",
  "morado":"#800080","rosa":"#ffc0cb","amarillo":"#ffea00","naranja":"#ff7f00",
  "beige":"#f5f5dc","marrón":"#5c4033","oliva":"#556b2f","oro":"#ffd700"
};
function hexFromNameClient(name){
  const k = String(name||"").trim().toLowerCase();
  return COLOR_HEX_CLIENT[k] || null;
}

// SEO helpers
function setBreadcrumbsJSONLD(sku){
  const el = document.getElementById("breadcrumbs-jsonld");
  if(!el) return;
  el.textContent = JSON.stringify({
    "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Inicio","item":"https://adrianrs928222.github.io/VALTIXSHOP/"},
      {"@type":"ListItem","position":2,"name": sku}
    ]
  });
}
function setProductJSONLD({name, sku, price, currency="EUR", image, brand="VALTIX", color, size}){
  const el = document.getElementById("product-jsonld");
  if(!el) return;
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": name,
    "sku": sku,
    "image": Array.isArray(image) ? image : [image],
    "brand": { "@type":"Brand", "name": brand },
    "offers": {
      "@type": "Offer",
      "url": location.href,
      "priceCurrency": currency,
      "price": String(Number(price).toFixed(2)),
      "availability": "https://schema.org/InStock"
    }
  };
  if(color) data.color = color;
  if(size)  data.size  = size;
  el.textContent = JSON.stringify(data);
}

// Render ficha
function renderProduct(p){
  // Texto y precio
  $("#pName").textContent = p.name;
  $("#pPrice").textContent = money(p.price);

  // SEO <title> y metas base
  document.title = `${p.name} – VALTIX`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", `${p.name} disponible en varios colores y tallas en VALTIX.`);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", `${p.name} – VALTIX`);

  const colorsPF = availableColorsOf(p);
  let selColor   = colorsPF[0] || null;
  let selSize    = selColor ? sizeNamesOf(p, selColor)[0] : null;

  // Selector de colores
  const cw = $("#colorWrap");
  cw.innerHTML = colorsPF.map((c,idx)=>{
    const hex = p.colors[c]?.hex || hexFromNameClient(c) || "";
    const style = hex
      ? `style="background-color:${hex}"`
      : `style="background:#eee;color:#111;display:grid;place-items:center;font-weight:800"`;
    const content = hex ? "" : c.slice(0,2).toUpperCase();
    return `<button class="color-circle ${idx===0?"active":""}" title="${c}" data-color="${c}" aria-pressed="${idx===0}" ${style}>${content}</button>`;
  }).join("");

  cw.querySelectorAll(".color-circle").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      cw.querySelectorAll(".color-circle").forEach(b=>{ b.classList.remove("active"); b.setAttribute("aria-pressed","false"); });
      btn.classList.add("active"); btn.setAttribute("aria-pressed","true");
      selColor = btn.dataset.color;
      buildSizes();
      buildGallery();
      updateAddBtn();
      setProductJSONLD({
        name: p.name, sku: p.sku, price: p.price,
        image: [$("#mainImg").src, ...[...document.querySelectorAll("#thumbs img")].map(i=>i.src || i.dataset.src)],
        color: selColor, size: selSize
      });
    });
  });

  // Selector de tallas
  const sw = $("#sizeWrap");
  function buildSizes(){
    const sizes = sizeNamesOf(p, selColor);
    selSize = sizes[0] || null;
    sw.innerHTML = sizes.map((sz,idx)=>`
      <button class="option-btn ${idx===0?"active":""}" data-sz="${sz}" aria-pressed="${idx===0}">${sz}</button>
    `).join("");
    sw.querySelectorAll(".option-btn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        sw.querySelectorAll(".option-btn").forEach(b=>{ b.classList.remove("active"); b.setAttribute("aria-pressed","false"); });
        btn.classList.add("active"); btn.setAttribute("aria-pressed","true");
        selSize = btn.dataset.sz;
        updateAddBtn();
        setProductJSONLD({
          name: p.name, sku: p.sku, price: p.price,
          image: [$("#mainImg").src, ...[...document.querySelectorAll("#thumbs img")].map(i=>i.src || i.dataset.src)],
          color: selColor, size: selSize
        });
      });
    });
  }

  // Galería (con lazy para thumbs)
  const mainImg = $("#mainImg");
  const thumbs  = $("#thumbs");

  function buildGallery(){
    const manual = manualImagesFor(p.sku, selColor);
    const fallback = p.colors?.[selColor]?.image || p.image;
    const imgs = (manual && manual.length) ? manual : [fallback].filter(Boolean);

    mainImg.src = imgs[0] || "";
    mainImg.alt = `${p.name} - ${selColor}`;
    document.querySelector('meta[property="og:image"]')?.setAttribute("content", mainImg.src);

    thumbs.innerHTML = imgs.map((u,idx)=>`
      <img src="${idx===0 ? u : ''}" data-src="${u}" loading="lazy" class="${idx===0?'active':''}" alt="Vista ${idx+1}">
    `).join("");

    const observer = new IntersectionObserver(entries=>{
      entries.forEach(e=>{
        if(e.isIntersecting){
          const img = e.target;
          if(!img.src) img.src = img.dataset.src;
          observer.unobserve(img);
        }
      });
    });
    thumbs.querySelectorAll("img").forEach(i => observer.observe(i));

    thumbs.querySelectorAll("img").forEach(img=>{
      img.addEventListener("click", ()=>{
        thumbs.querySelectorAll("img").forEach(i=>i.classList.remove("active"));
        img.classList.add("active");
        mainImg.src = img.src || img.dataset.src;
        setProductJSONLD({
          name: p.name, sku: p.sku, price: p.price,
          image: [$("#mainImg").src, ...[...document.querySelectorAll("#thumbs img")].map(i=>i.src || i.dataset.src)],
          color: selColor, size: selSize
        });
      });
    });

    setProductJSONLD({
      name: p.name, sku: p.sku, price: p.price,
      image: imgs, color: selColor, size: selSize
    });
  }

  function updateAddBtn(){
    const btn = $("#addBtn");
    const can = !!(selColor && selSize && p.colors?.[selColor]?.sizes?.[selSize]);
    btn.disabled = !can;
  }

  // Init
  buildSizes();
  buildGallery();
  updateAddBtn();

  $("#addBtn").addEventListener("click", ()=>{
    if(!(selColor && selSize)) return;
    const vid = p.colors[selColor].sizes[selSize];
    addToCart({
      sku: `${p.sku}_${selColor}_${selSize}`,
      name: `${p.name} ${selColor} ${selSize}`,
      price: p.price,
      image: $("#mainImg").src,
      variant_id: vid
    });
    openCart();
  });

  setBreadcrumbsJSONLD(p.sku);
}

// Carga
async function loadAndRender(){
  const sku = getSku();
  if(!sku){ alert("SKU no especificado"); return; }

  try{
    const r = await fetch("images.json",{cache:"no-store"});
    if (r.ok) Object.assign(MANUAL_IMAGES, await r.json());
  }catch{}

  let products = [];
  try{
    const res = await fetch(`${BACKEND_URL}/api/printful/products`, { cache:"no-store" });
    const data = await res.json();
    products = data?.products || [];
  }catch(e){ console.error(e); }

  const p = products.find(x => x.sku === sku);
  if(!p){ alert("Producto no encontrado."); return; }

  renderProduct(p);

  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", ()=>{ cart=[]; saveCart(); });
  $("#checkoutBtn")?.addEventListener("click", goCheckout);
  renderCart();
}

document.addEventListener("DOMContentLoaded", loadAndRender);