// ===== Config =====
const BACKEND_URL = "https://una-tienda1.onrender.com"; // tu Render
const CHECKOUT_PATH = "/create-checkout-session";

const $ = s => document.querySelector(s);
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

// ===== Util =====
const money = n => `${Number(n).toFixed(2)} €`;
const getCat = () => (location.hash.startsWith("#c/") ? decodeURIComponent(location.hash.slice(3)) : "all");

// ===== Render productos con tallas y modal imagen =====
function renderProducts(){
  const grid = $("#grid");
  if (!grid) return;

  grid.innerHTML = "";
  const cat = getCat();
  const list = (cat === "all") ? window.products : window.products.filter(p => p.categories?.includes(cat));

  list.forEach(p => {
    const sizes = p.variant_map ? Object.keys(p.variant_map) : [];
    const sizeBtns = sizes.map((s, i) =>
      `<button class="option-btn${i===0?" active":""}" data-sz="${s}" aria-pressed="${i===0?'true':'false'}">${s}</button>`
    ).join("");

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

    // abrir modal al tocar imagen
    card.querySelector(".card-img").addEventListener("click", () => openZoom(p.image, p.alt || p.name));

    // seleccionar talla
    let selected = sizes[0] || null;
    card.querySelectorAll(".option-btn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        card.querySelectorAll(".option-btn").forEach(b=>{ b.classList.remove("active"); b.setAttribute("aria-pressed","false"); });
        btn.classList.add("active"); btn.setAttribute("aria-pressed","true"); selected = btn.dataset.sz;
      });
    });

    // añadir al carrito
    card.querySelector(".add-btn").addEventListener("click", ()=>{
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

  if (!cart.length) {
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
      const btns = row.querySelectorAll(".qty button");
      btns[0].addEventListener("click", ()=> changeQty(i.sku, i.variant_id, -1));
      btns[1].addEventListener("click", ()=> changeQty(i.sku, i.variant_id,  1));
      box.appendChild(row);
    });
  }
  totalEl.textContent = money(cart.reduce((s,i)=> s + i.qty * Number(i.price), 0));
}

function addToCart(item){
  const idx = cart.findIndex(i => i.sku === item.sku && i.variant_id === item.variant_id);
  if (idx >= 0) cart[idx].qty += 1; else cart.push({ ...item, qty: 1 });
  saveCart(); openCart();
}
function changeQty(sku, vid, d){
  const it = cart.find(i => i.sku === sku && i.variant_id === vid); if (!it) return;
  it.qty += d; if (it.qty <= 0) cart = cart.filter(i => !(i.sku===sku && i.variant_id===vid));
  saveCart();
}
function clearCart(){ cart = []; saveCart(); }
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }

// ===== Drawer =====
function openCart(){ $("#drawerBackdrop").classList.add("show"); $("#cartDrawer").classList.add("open"); }
function closeCart(){ $("#drawerBackdrop").classList.remove("show"); $("#cartDrawer").classList.remove("open"); }

// ===== Checkout (Stripe) =====
async function goCheckout(){
  if (!cart.length) return alert("Tu carrito está vacío.");
  const items = cart.map(i=>({ variant_id:i.variant_id, quantity:i.qty, sku:i.sku, name:i.name, price:Number(i.price) }));
  try{
    const r = await fetch(`${BACKEND_URL}${CHECKOUT_PATH}`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ items }) });
    const data = await r.json();
    if (data?.url) window.location.href = data.url; else alert("No se pudo iniciar el pago.");
  }catch(e){ console.error(e); alert("Error de conexión con el servidor."); }
}

// ===== Router (categorías / legales simples) =====
function handleHash(){ renderProducts(); }

// ===== Promo (si la usas) =====
function startPromo(){
  const box = $("#promoBox"); const tx = $("#promoText");
  if (!box || !tx) return;
  const msgs = [
    "Compra hoy y recibe en España o en cualquier parte del mundo 🌍",
    "🚚 Envío GRATIS en pedidos superiores a 60€"
  ];
  let i=0; const show=()=>{ tx.textContent = msgs[i]; i=(i+1)%msgs.length; };
  show(); setInterval(show, 8000);
}

// ===== Modal Imagen (encaja en la caja y oculta loader) =====
const modal = document.createElement("div");
modal.className = "modal";
modal.innerHTML = `
  <div class="modal-backdrop" data-close></div>
  <div class="modal-content">
    <button class="modal-close" aria-label="Cerrar" data-close>✕</button>
    <div class="modal-stage">
      <img id="modalImg" alt="">
      <div class="modal-loading" aria-hidden="false"></div>
    </div>
  </div>
`;
document.body.appendChild(modal);
const modalImg = modal.querySelector("#modalImg");
const loading  = modal.querySelector(".modal-loading");

function lockScroll(){ document.documentElement.style.overflow="hidden"; }
function unlockScroll(){ document.documentElement.style.overflow=""; }

function openZoom(src, alt){
  modal.classList.add("show");
  lockScroll();
  loading.removeAttribute("aria-hidden");     // mostrar loader
  modalImg.onload  = ()=> loading.setAttribute("aria-hidden","true");
  modalImg.onerror = ()=> loading.setAttribute("aria-hidden","true");
  modalImg.src = src; modalImg.alt = alt || "";
}
function closeZoom(){
  modal.classList.remove("show");
  unlockScroll();
  modalImg.removeAttribute("src"); // evita flashes
}
modal.addEventListener("click", (e)=>{ if (e.target.dataset.close !== undefined) closeZoom(); });
document.addEventListener("keydown", (e)=>{ if (e.key === "Escape") closeZoom(); });

// ===== Init =====
document.addEventListener("DOMContentLoaded", ()=>{
  renderProducts(); renderCart(); startPromo();

  // CTA
  document.getElementById("goCatalog")?.addEventListener("click",(e)=>{ e.preventDefault(); document.getElementById("catalogo")?.scrollIntoView({behavior:"smooth"}); });

  // Carrito
  document.getElementById("openCart")?.addEventListener("click", openCart);
  document.getElementById("closeCart")?.addEventListener("click", closeCart);
  document.getElementById("drawerBackdrop")?.addEventListener("click", closeCart);
  document.getElementById("clearCart")?.addEventListener("click", clearCart);
  document.getElementById("checkoutBtn")?.addEventListener("click", goCheckout);

  // Categorías con hash
  window.addEventListener("hashchange", handleHash);
});