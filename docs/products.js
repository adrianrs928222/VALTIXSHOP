// product.js
// VALTIX – Ficha de producto: carga por SKU, selectores color/talla, stock y carrito

const BACKEND_URL = "https://valtixshop.onrender.com";

const $  = s => document.querySelector(s);
let availability = {};   // { [variant_id]: true|false|null }
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }
function addToCart(item){
  const idx = cart.findIndex(i=>i.sku===item.sku && i.variant_id===item.variant_id);
  if (idx>=0) cart[idx].qty += 1; else cart.push({ ...item, qty:1 });
  saveCart();
}
function subtotal(){ return cart.reduce((s,i)=> s + (Number(i.price)*i.qty), 0); }
function money(n){ return `${Number(n).toFixed(2)} €`; }

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
        <img src="${i.image}" alt="${i.name}" loading="lazy" decoding="async">
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
      minus.addEventListener("click", ()=>{
        const it = cart.find(x=>x.sku===i.sku && x.variant_id===i.variant_id);
        if(!it) return; it.qty -= 1; if(it.qty<=0) cart = cart.filter(x=>!(x.sku===i.sku && x.variant_id===i.variant_id));
        saveCart();
      });
      plus.addEventListener("click", ()=>{ const it = cart.find(x=>x.sku===i.sku && x.variant_id===i.variant_id); if(!it) return; it.qty += 1; saveCart(); });
      box.appendChild(row);
    });
  }
  $("#subtotal").textContent = money(subtotal());
}

function openCart(){ $("#drawerBackdrop").classList.add("show"); $("#cartDrawer").classList.add("open"); $("#cartDrawer").setAttribute("aria-hidden","false"); renderCart(); }
function closeCart(){ $("#drawerBackdrop").classList.remove("show"); $("#cartDrawer").classList.remove("open"); $("#cartDrawer").setAttribute("aria-hidden","true"); }

async function fetchAvailability(variantIds){
  if (!variantIds.length) return {};
  try{
    const res = await fetch(`${BACKEND_URL}/availability`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ variant_ids: variantIds })
    });
    const data = await res.json();
    if (data?.ok && data.availability) return data.availability;
  }catch(e){ console.error("❌ availability:", e); }
  const out={}; variantIds.forEach(v=>out[v]=null); return out;
}

function param(name){
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function pickFirstAvailable(colorMeta){
  const entries = Object.entries(colorMeta?.sizes||{});
  const firstOk = entries.find(([,vid])=>{
    const a = availability[String(vid)];
    return a === true || a === null;
  });
  return firstOk ? firstOk[0] : (entries[0]?.[0] || null);
}

async function main(){
  // Drawer
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", ()=>{ cart=[]; saveCart(); });

  renderCart();

  const sku = param("sku");
  if (!sku) {
    $("#pName").textContent = "Producto no encontrado";
    return;
  }

  // Cargar catálogo desde backend
  let products = [];
  try{
    const r = await fetch(`${BACKEND_URL}/api/printful/products`, { cache:"no-store" });
    const j = await r.json();
    products = j?.products || [];
  }catch(e){ console.error(e); }

  const product = products.find(p=>String(p.sku)===String(sku));
  if (!product) {
    $("#pName").textContent = "Producto no disponible";
    return;
  }

  // Calcular availability para todas las variantes del producto
  const allVariantIds = [];
  Object.values(product.colors||{}).forEach(c=>{
    Object.values(c.sizes||{}).forEach(vid=>{ if(vid) allVariantIds.push(String(vid)); });
  });
  availability = await fetchAvailability([...new Set(allVariantIds)]);

  // Rellenar UI
  $("#pName").textContent = product.name || "Producto";
  $("#pPrice").textContent = `${Number(product.price).toFixed(2)} €`;

  const gallery = [];
  Object.values(product.colors||{}).forEach(c=>{
    if (c?.image) gallery.push(c.image);
  });
  if (!gallery.length && product.image) gallery.push(product.image);

  const mainImg = $("#mainImg");
  const thumbs  = $("#thumbs");
  mainImg.src = gallery[0] || product.image;
  mainImg.alt = product.name;
  mainImg.loading = "eager"; mainImg.decoding = "async";

  thumbs.innerHTML = gallery.map((src,i)=>`
    <img src="${src}" alt="Vista ${i+1}" class="thumb" ${i===0?"data-active":""} loading="lazy" decoding="async">
  `).join("");
  thumbs.querySelectorAll(".thumb").forEach(img=>{
    img.addEventListener("click", ()=>{
      thumbs.querySelectorAll(".thumb").forEach(t=>t.removeAttribute("data-active"));
      img.setAttribute("data-active","");
      mainImg.src = img.src;
    });
  });

  // Selectores
  const colorWrap = $("#colorWrap");
  const sizeWrap  = $("#sizeWrap");
  const addBtn    = $("#addBtn");

  const colorNames = Object.keys(product.colors||{});
  let selectedColor = colorNames[0] || null;
  let selectedSize  = selectedColor ? pickFirstAvailable(product.colors[selectedColor]) : null;

  function renderColors(){
    colorWrap.innerHTML = colorNames.map((cn)=>{
      const meta = product.colors[cn];
      const anyAvail = Object.values(meta.sizes||{}).some(vid=>{
        const a = availability[String(vid)];
        return a===true || a===null;
      });
      if (!anyAvail) return ""; // oculta color sin stock
      const hex = meta?.hex || "#ddd";
      const active = (cn===selectedColor) ? "active" : "";
      return `<button class="color-circle ${active}" title="${cn}" data-color="${cn}" style="background-color:${hex};"></button>`;
    }).join("");

    colorWrap.querySelectorAll(".color-circle").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        colorWrap.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedColor = btn.dataset.color;
        const img = product.colors[selectedColor]?.image || product.image;
        if (img) mainImg.src = img;
        selectedSize = pickFirstAvailable(product.colors[selectedColor]);
        renderSizes();
        updateCTA();
      });
    });
  }

  function renderSizes(){
    const meta = product.colors[selectedColor];
    const entries = Object.entries(meta?.sizes||{});

    sizeWrap.innerHTML = entries.map(([sz,vid])=>{
      const a = availability[String(vid)];
      const isAvail = (a===true || a===null);
      const disabledAttr = isAvail ? "" : "disabled";
      const active = (sz===selectedSize && isAvail) ? "active" : "";
      return `<button class="option-btn ${active}" data-sz="${sz}" ${disabledAttr}>${sz}</button>`;
    }).join("");

    sizeWrap.querySelectorAll(".option-btn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        if (btn.hasAttribute("disabled")) return;
        sizeWrap.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedSize = btn.dataset.sz;
        updateCTA();
      });
    });
  }

  function updateCTA(){
    const vid = product.colors?.[selectedColor]?.sizes?.[selectedSize];
    const a = availability[String(vid)];
    if (!vid || a===false){
      addBtn.disabled = true;
      addBtn.textContent = "Agotado";
      return;
    }
    addBtn.disabled = false;
    addBtn.textContent = "Añadir al carrito";
  }

  renderColors();
  renderSizes();
  updateCTA();

  addBtn.addEventListener("click", ()=>{
    const vid = product.colors?.[selectedColor]?.sizes?.[selectedSize];
    if (!vid) return;
    const a = availability[String(vid)];
    if (a===false) return alert("Esa talla/color está agotada.");
    addToCart({
      sku: `${product.sku}_${selectedColor}_${selectedSize}`,
      name: `${product.name} ${selectedColor} ${selectedSize}`,
      price: product.price,
      image: product.colors?.[selectedColor]?.image || product.image,
      variant_id: vid
    });
    openCart();
  });

  // Menú móvil: cerrar al navegar/scroll
  const menu=document.querySelector('#main-nav');
  const t=document.querySelector('#menu-toggle');
  function closeMenu(){ menu?.classList.remove('show'); document.body.classList.remove('nav-open'); }
  t?.addEventListener('click', ()=>{ menu.classList.toggle('show'); document.body.classList.toggle('nav-open', menu.classList.contains('show')); });
  document.querySelectorAll('#main-nav a').forEach(a=>a.addEventListener('click', closeMenu));
  window.addEventListener('scroll', closeMenu);
}

document.addEventListener("DOMContentLoaded", main);