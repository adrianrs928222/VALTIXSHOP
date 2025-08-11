/* ========= CONFIG ========= */
const BACKEND = "https://una-tienda1.onrender.com";

/* ========= SELECTORES ========= */
const gridEl = document.getElementById("grid");
const cartCountEl = document.getElementById("cartCount");
const backdropEl = document.getElementById("backdrop");
const drawerEl = document.getElementById("drawer");
const cartItemsEl = document.getElementById("cartItems");
const subtotalEl = document.getElementById("subtotal");
const openCartBtn = document.getElementById("openCart");
const closeCartBtn = document.getElementById("closeCart");
const checkoutBtn = document.getElementById("checkoutBtn");
const clearCartBtn = document.getElementById("clearCartBtn");

/* ========= ESTADO ========= */
let cart = JSON.parse(localStorage.getItem("cart")) || [];

/* ========= CATEGORÍAS POR HASH ========= */
// #c/camisetas, #c/sudaderas, #c/pantalones, #c/zapatos, #c/accesorios
function getCategoryFromHash(){
  if (!location.hash.startsWith("#c/")) return "";
  return decodeURIComponent(location.hash.replace("#c/","").trim());
}

/* ========= RENDER PRODUCTOS ========= */
function renderProducts(){
  if (!Array.isArray(products)) {
    gridEl.innerHTML = `<div style="padding:16px;border:1px dashed #eaeaea;border-radius:12px">No se han podido cargar los productos (products.js).</div>`;
    return;
  }

  const cat = getCategoryFromHash();
  const items = cat ? products.filter(p => (p.categories||[]).includes(cat)) : products;

  gridEl.innerHTML = "";
  if (items.length === 0){
    gridEl.innerHTML = `<div style="padding:16px;border:1px dashed #eaeaea;border-radius:12px">No hay productos en esta categoría.</div>`;
    return;
  }

  items.forEach(p => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <img class="card-img" src="${p.image}" alt="${p.name}" loading="lazy">
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">€${(p.price||0).toFixed(2)}</p>
        <button class="btn" data-sku="${p.sku}">Añadir al carrito</button>
      </div>
    `;
    card.querySelector(".btn").addEventListener("click", () => addToCart(p.sku));
    gridEl.appendChild(card);
  });
}

/* ========= CARRITO ========= */
function addToCart(sku){
  const p = products.find(x => x.sku === sku);
  if (!p) return;
  const found = cart.find(i => i.sku === sku);
  if (found) found.quantity += 1;
  else cart.push({ sku:p.sku, name:p.name, price:p.price, image:p.image, quantity:1 });
  saveCart();
}
function removeFromCart(sku){
  cart = cart.filter(i => i.sku !== sku);
  saveCart();
}
function changeQty(sku, delta){
  const i = cart.find(x => x.sku === sku);
  if (!i) return;
  i.quantity += delta;
  if (i.quantity <= 0) return removeFromCart(sku);
  saveCart();
}
function clearCart(){
  cart = [];
  saveCart();
}
function saveCart(){
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCart();
}
function renderCart(){
  cartItemsEl.innerHTML = "";
  let total = 0;

  cart.forEach(item => {
    total += (item.price||0) * item.quantity;
    const row = document.createElement("div");
    row.className = "drawer-item";
    row.innerHTML = `
      <img src="${item.image}" alt="${item.name}" loading="lazy">
      <div style="flex:1">
        <div style="font-weight:600">${item.name}</div>
        <div style="color:#6b6b6b">€${(item.price||0).toFixed(2)}</div>
        <div class="qty" style="margin-top:8px">
          <button onclick="changeQty('${item.sku}', -1)">−</button>
          <span>${item.quantity}</span>
          <button onclick="changeQty('${item.sku}', 1)">+</button>
          <button style="margin-left:auto" onclick="removeFromCart('${item.sku}')">Eliminar</button>
        </div>
      </div>
    `;
    cartItemsEl.appendChild(row);
  });

  cartCountEl.textContent = cart.reduce((s,i) => s + i.quantity, 0);
  subtotalEl.textContent = `€${total.toFixed(2)}`;
  checkoutBtn.disabled = cart.length === 0;
}

/* Exponer funciones globales para los onclick */
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.changeQty = changeQty;

/* ========= DRAWER ========= */
function openDrawer(){ backdropEl.classList.add("show"); drawerEl.classList.add("open"); }
function closeDrawer(){ backdropEl.classList.remove("show"); drawerEl.classList.remove("open"); }
openCartBtn && openCartBtn.addEventListener("click", openDrawer);
closeCartBtn && closeCartBtn.addEventListener("click", closeDrawer);
backdropEl && backdropEl.addEventListener("click", closeDrawer);

/* ========= CHECKOUT (Stripe via Render) ========= */
async function checkout(){
  if (cart.length === 0) return alert("Tu carrito está vacío.");
  try{
    const res = await fetch(`${BACKEND}/checkout`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ items: cart })
    });
    const data = await res.json();
    if (data && data.url) location.href = data.url;
    else alert("No se pudo iniciar el pago.");
  }catch(e){
    console.error(e);
    alert("Error conectando con el servidor.");
  }
}

/* Botones */
checkoutBtn && checkoutBtn.addEventListener("click", checkout);
clearCartBtn && clearCartBtn.addEventListener("click", clearCart);

/* ========= PROMO VERTICAL (4 mensajes) ========= */
(function promoVertical(){
  const box = document.querySelector(".promo-box");
  if (!box) return;

  const mensajes = [
    '🇪🇸📦 <strong>Envíos rápidos a toda España</strong>',
    '🌍🚀 <strong>Entrega internacional garantizada</strong>',
    '🛒✨ <strong>Compra fácil, pago 100% seguro</strong>',
    '💎👕 <strong>Buena calidad en cada prenda</strong>'
  ];

  let i = 0;
  function setMensaje(html){
    box.innerHTML = `<span class="msg">${html}</span>`;
  }
  setMensaje(mensajes[i]);
  setInterval(() => {
    i = (i + 1) % mensajes.length;
    setMensaje(mensajes[i]);
  }, 6500);
})();

/* ========= INIT ========= */
function init(){
  renderProducts();
  renderCart();
}
window.addEventListener("hashchange", renderProducts);
document.addEventListener("DOMContentLoaded", init);