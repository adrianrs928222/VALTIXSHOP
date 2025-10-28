// ============================================================
// VALTIX Product Page
// - Colores y tallas 1:1 con Printful (variant_id real)
// - Galería con imágenes manuales por color (sin afectar envíos)
// - Checkout intacto via backend -> Stripe -> Webhook -> Printful
// ============================================================

// ===== Config
const BACKEND_URL = "https://valtixshop.onrender.com";

// ===== Imágenes manuales por color (edita libremente).
// NO agrega colores: solo sustituye imagen/galería si el color YA existe en Printful.
const MANUAL_IMAGES = {
  // "VALTIX-TEE-001": {
  //   "verde": [
  //     "https://i.postimg.cc/hvtPyh8x/unisex-premium-sweatshirt-forest-green-front-690008790b167.jpg",
  //     "https://cdn.mi-tienda.com/sku001/black_2.jpg"
  //   ],
  //   "White": [
  //     "https://cdn.mi-tienda.com/sku001/white_1.jpg"
  //   ]
  // }
};

// ===== Helpers DOM / util
const $  = s => document.querySelector(s);
function money(n){ return `${Number(n).toFixed(2)} €`; }
function getSku(){ const u=new URL(location.href); return u.searchParams.get("sku"); }

// ===== Carrito (idéntico a tu app para mantener UX)
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

// ===== PF util
function availableColorsOf(p){
  // Solo colores entregados por el backend (Printful normalizado) con tallas
  return Object.entries(p.colors||{})
    .filter(([,meta]) => meta && meta.sizes && Object.keys(meta.sizes).length)
    .map(([name]) => name);
}
function sizeNamesOf(p,color){ return Object.keys(p.colors?.[color]?.sizes||{}); }

// ===== Render ficha
function renderProduct(p){
  // 1) Texto y precio
  $("#pName").textContent = p.name;
  $("#pPrice").textContent = money(p.price);

  // 2) Estado de selección inicial
  const colorsPF = availableColorsOf(p);
  let selColor   = colorsPF[0] || null;
  let selSize    = selColor ? sizeNamesOf(p, selColor)[0] : null;

  // 3) Selector de colores (hex Printful si existe; si no, pill con iniciales)
  const cw = $("#colorWrap");
  cw.innerHTML = colorsPF.map((c,idx)=>{
    const hex = p.colors[c]?.hex || "";
    const style = hex
      ? `style="background-color:${hex}"`
      : `style="background:#eee;color:#111;display:grid;place-items:center;font-weight:800"`
    const content = hex ? "" : c.slice(0,2).toUpperCase();
    return `<button class="color-circle ${idx===0?"active":""}" title="${c}" data-color="${c}" ${style}>${content}</button>`;
  }).join("");

  cw.querySelectorAll(".color-circle").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      cw.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      selColor = btn.dataset.color;   // Nombre EXACTO de Printful
      buildSizes();
      buildGallery();
      updateAddBtn();
    });
  });

  // 4) Selector de tallas (por color, 1:1 con Printful)
  const sw = $("#sizeWrap");
  function buildSizes(){
    const sizes = sizeNamesOf(p, selColor);
    selSize = sizes[0] || null;
    sw.innerHTML = sizes.map((sz,idx)=>`
      <button class="option-btn ${idx===0?"active":""}" data-sz="${sz}">${sz}</button>
    `).join("");
    sw.querySelectorAll(".option-btn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        sw.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selSize = btn.dataset.sz;
        updateAddBtn();
      });
    });
  }

  // 5) Galería: imágenes manuales por color si existen; si no, imagen PF del color
  const mainImg = $("#mainImg");
  const thumbs  = $("#thumbs");

  function buildGallery(){
    const manual = (MANUAL_IMAGES[p.sku] && MANUAL_IMAGES[p.sku][selColor]) || null;
    const fallback = p.colors?.[selColor]?.image || p.image;
    const imgs = (manual && manual.length) ? manual : [fallback].filter(Boolean);

    mainImg.src = imgs[0] || "";
    mainImg.alt = `${p.name} - ${selColor}`;

    thumbs.innerHTML = imgs.map((u,idx)=>`<img src="${u}" data-idx="${idx}" class="${idx===0?"active":""}" alt="Vista ${idx+1}">`).join("");
    thumbs.querySelectorAll("img").forEach(img=>{
      img.addEventListener("click", ()=>{
        thumbs.querySelectorAll("img").forEach(i=>i.classList.remove("active"));
        img.classList.add("active");
        mainImg.src = img.src;
      });
    });
  }

  function updateAddBtn(){
    const btn = $("#addBtn");
    const can = !!(selColor && selSize && p.colors?.[selColor]?.sizes?.[selSize]);
    btn.disabled = !can;
  }

  // 6) Inicializa
  buildSizes();
  buildGallery();
  updateAddBtn();

  // 7) Añadir al carrito con variant_id REAL (envío correcto)
  $("#addBtn").addEventListener("click", ()=>{
    if(!(selColor && selSize)) return;
    const vid = p.colors[selColor].sizes[selSize]; // variant_id Printful
    addToCart({
      sku: `${p.sku}_${selColor}_${selSize}`,
      name: `${p.name} ${selColor} ${selSize}`,
      price: p.price,
      image: $("#mainImg").src, // lo que ve el cliente (manual o PF)
      variant_id: vid
    });
    openCart();
  });
}

// ===== Carga datos y eventos carrito
async function loadAndRender(){
  const sku = getSku();
  if(!sku){ alert("SKU no especificado"); return; }

  // (Opcional) Cargar JSON externo con imágenes manuales
  // try{
  //   const r = await fetch("./images.json",{cache:"no-store"});
  //   Object.assign(MANUAL_IMAGES, await r.json());
  // }catch{}

  let products = [];
  try{
    const res = await fetch(`${BACKEND_URL}/api/printful/products`, { cache:"no-store" });
    const data = await res.json();
    products = data?.products || [];
  }catch(e){ console.error(e); }

  const p = products.find(x => x.sku === sku);
  if(!p){ alert("Producto no encontrado."); return; }

  renderProduct(p);

  // Drawer carrito
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", ()=>{ cart=[]; saveCart(); });
  $("#checkoutBtn")?.addEventListener("click", goCheckout);
  renderCart();
}

document.addEventListener("DOMContentLoaded", loadAndRender);
