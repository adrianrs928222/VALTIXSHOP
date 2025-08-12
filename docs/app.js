// ===== Config =====
const BACKEND_URL = "https://una-tienda1.onrender.com";
const CHECKOUT_PATH = "/create-checkout-session";

const $ = s => document.querySelector(s);
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

// ===== Util =====
const money = n => `${Number(n).toFixed(2)} €`;
const getCat = () => (location.hash.startsWith("#c/") ? decodeURIComponent(location.hash.slice(3)) : "all");

// ===== Render productos =====
function renderProducts(){
  const grid = $("#grid");
  if (!grid) return;

  grid.innerHTML = "";
  if (!Array.isArray(window.products) || !products.length){
    grid.innerHTML = `<p style="color:#777">Aún no hay productos. Añádelos en <code>products.js</code>.</p>`;
    return;
  }

  const cat = getCat();
  const list = (cat === "all") ? products : products.filter(p => p.categories?.includes(cat));

  list.forEach(p=>{
    const sizes = p.variant_map ? Object.keys(p.variant_map) : [];
    const sizeBtns = sizes.map((s,i)=>`<button class="option-btn${i===0?" active":""}" data-sz="${s}" aria-pressed="${i===0?'true':'false'}">${s}</button>`).join("");

    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <figure class="card-media">
        <img class="card-img" src="${p.image}" alt="${p.alt || p.name}" loading="lazy">
      </figure>
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">${money(p.price)}</p>
        ${sizes.length ? `<div class="options" role="group" aria-label="Tallas">${sizeBtns}</div>` : ""}
        <button class="btn add-btn" data-sku="${p.sku}">Añadir al carrito</button>
      </div>
    `;

    // Abrir visor al tocar la imagen
    card.querySelector(".card-img").addEventListener("click", ()=> openZoom(p.image, p.alt || p.name));

    // Selección de talla
    let selected = sizes[0] || null;
    card.querySelectorAll(".option-btn").forEach(btn=>{
      btn.addEventListener("click",(e)=>{
        e.stopPropagation(); e.preventDefault();
        card.querySelectorAll(".option-btn").forEach(b=>{ b.classList.remove("active"); b.setAttribute("aria-pressed","false"); });
        btn.classList.add("active"); btn.setAttribute("aria-pressed","true");
        selected = btn.dataset.sz;
      });
    });

    // Añadir al carrito
    card.querySelector(".add-btn").addEventListener("click",(e)=>{
      e.preventDefault();
      let variant_id = p.variant_id;
      if (p.variant_map && selected) variant_id = p.variant_map[selected];
      addToCart({
        sku: p.sku + (selected ? `_${selected}` : ""),
        name: `${p.name}${selected ? ` — ${selected}` : ""}`,
        price: p.price,
        image: p.image,
        variant_id
      });
    });

    grid.appendChild(card);
  });
}

// ===== Carrito =====
function renderCart(){
  const box = $("#cartItems");
  const countEl = $("#cartCount");
  const totalEl = $("#subtotal");
  if (!box || !countEl || !totalEl) return;

  box.innerHTML = "";
  const count = cart.reduce((s,i)=>s+i.qty,0);
  countEl.textContent = count;

  if (!cart.length){
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
          <div style="color:#666">${money(i.price)}</div>
        </div>
      `;
      const [minus,,plus] = row.querySelectorAll(".qty button, .qty span");
      minus.addEventListener("click", ()=> changeQty(i.sku, i.variant_id, -1));
      plus .addEventListener("click", ()=> changeQty(i.sku, i.variant_id,  1));
      box.appendChild(row);
    });
  }
  totalEl.textContent = money(cart.reduce((s,i)=> s + i.qty*Number(i.price), 0));
}
function addToCart(item){
  const idx = cart.findIndex(i=> i.sku===item.sku && i.variant_id===item.variant_id);
  if (idx>=0) cart[idx].qty += 1; else cart.push({ ...item, qty:1 });
  saveCart(); openCart();
}
function changeQty(sku, vid, d){
  const it = cart.find(i=> i.sku===sku && i.variant_id===vid); if(!it) return;
  it.qty += d; if (it.qty<=0) cart = cart.filter(i=> !(i.sku===sku && i.variant_id===vid));
  saveCart();
}
function clearCart(){ cart = []; saveCart(); }
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }

// Drawer
function openCart(){ $("#drawerBackdrop").classList.add("show"); $("#cartDrawer").classList.add("open"); }
function closeCart(){ $("#drawerBackdrop").classList.remove("show"); $("#cartDrawer").classList.remove("open"); }

// Checkout Stripe
async function goCheckout(){
  if (!cart.length) return alert("Tu carrito está vacío.");
  const items = cart.map(i=>({ variant_id:i.variant_id, quantity:i.qty, sku:i.sku, name:i.name, price:Number(i.price) }));
  try{
    const r = await fetch(`${BACKEND_URL}${CHECKOUT_PATH}`,{
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ items })
    });
    const data = await r.json();
    if (data?.url) window.location.href = data.url; else alert("No se pudo iniciar el pago.");
  }catch(e){ console.error(e); alert("Error de conexión con el servidor."); }
}

// ===== Promo (usa correctamente .promo-text) =====
function startPromo(){
  const box = $("#promoBox");
  const textEl = box?.querySelector(".promo-text");
  if (!box || !textEl) return;

  const msgs = [
    "✨ Calidad premium en cada prenda",
    "🚚 Envío gratuito en pedidos superiores a 60€",
    "💳 Pago seguro con Stripe"
  ];

  let i=0; const show=()=>{ textEl.textContent = msgs[i]; i=(i+1)%msgs.length; };
  show(); setInterval(show, 9000);
}

// ===== Modal imagen (reutiliza el HTML existente) =====
(function setupExistingModal(){
  const modal = document.getElementById("imgModal");
  const modalImg = document.getElementById("modalImg");
  const modalClose = document.getElementById("modalClose");
  const backdrop = modal?.querySelector(".modal-backdrop");
  const loading  = document.getElementById("modalLoading");

  if (!modal || !modalImg || !backdrop || !modalClose) {
    console.warn("Modal no encontrado. Revisa IDs: #imgModal, #modalImg, #modalClose, .modal-backdrop");
    return;
  }

  window.openZoom = function(src, alt=""){
    modal.classList.add("show");
    modal.setAttribute("aria-hidden","false");
    if (loading) loading.removeAttribute("aria-hidden"); // muestra loader

    modalImg.onload  = ()=> loading && loading.setAttribute("aria-hidden","true");
    modalImg.onerror = ()=> loading && loading.setAttribute("aria-hidden","true");

    modalImg.src = src;
    modalImg.alt = alt;
    document.addEventListener("keydown", onEsc);
  };

  function closeZoom(){
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden","true");
    document.removeEventListener("keydown", onEsc);
  }
  function onEsc(e){ if (e.key === "Escape") closeZoom(); }

  backdrop.addEventListener("click", closeZoom);
  modalClose.addEventListener("click", closeZoom);
})();

// ===== Init =====
document.addEventListener("DOMContentLoaded", ()=>{
  // año footer si lo necesitas
  const y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear();

  renderProducts();
  renderCart();
  startPromo();

  // CTA scroll
  document.getElementById("goCatalog")?.addEventListener("click",(e)=>{
    e.preventDefault();
    document.getElementById("catalogo")?.scrollIntoView({behavior:"smooth"});
  });

  // Carrito
  document.getElementById("openCart")?.addEventListener("click", openCart);
  document.getElementById("closeCart")?.addEventListener("click", closeCart);
  document.getElementById("drawerBackdrop")?.addEventListener("click", closeCart);
  document.getElementById("clearCart")?.addEventListener("click", clearCart);
  document.getElementById("checkoutBtn")?.addEventListener("click", goCheckout);

  // Categorías
  window.addEventListener("hashchange", renderProducts);
});