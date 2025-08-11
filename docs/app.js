const productGrid = document.getElementById("grid");
const cartCount = document.getElementById("cartCount");
const cartItemsContainer = document.getElementById("cartItems");
const cartTotal = document.getElementById("subtotal");

let cart = JSON.parse(localStorage.getItem("cart")) || [];

function renderProducts() {
  productGrid.innerHTML = "";
  products.forEach(prod => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img src="${prod.image}" alt="${prod.name}" class="card-img">
      <div class="card-body">
        <h3 class="card-title">${prod.name}</h3>
        <p class="card-price">${prod.price.toFixed(2)} €</p>
        <button class="btn" onclick="addToCart('${prod.sku}')">Añadir al carrito</button>
      </div>
    `;
    productGrid.appendChild(card);
  });
}

function addToCart(sku) {
  const product = products.find(p => p.sku === sku);
  if (!product) return;
  
  const existing = cart.find(item => item.sku === sku);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...product, qty: 1 });
  }
  
  saveCart();
}

function removeFromCart(sku) {
  cart = cart.filter(item => item.sku !== sku);
  saveCart();
}

function changeQty(sku, delta) {
  const item = cart.find(i => i.sku === sku);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) removeFromCart(sku);
  saveCart();
}

function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCart();
}

function renderCart() {
  cartItemsContainer.innerHTML = "";
  let total = 0;

  cart.forEach(item => {
    total += item.price * item.qty;
    const div = document.createElement("div");
    div.className = "drawer-item";
    div.innerHTML = `
      <img src="${item.image}" alt="${item.name}">
      <div style="flex:1;">
        <div>${item.name}</div>
        <div>${item.price.toFixed(2)} €</div>
        <div class="qty">
          <button onclick="changeQty('${item.sku}', -1)">-</button>
          <span>${item.qty}</span>
          <button onclick="changeQty('${item.sku}', 1)">+</button>
        </div>
      </div>
    `;
    cartItemsContainer.appendChild(div);
  });

  cartCount.textContent = cart.reduce((sum, item) => sum + item.qty, 0);
  cartTotal.textContent = `${total.toFixed(2)} €`;
}

function toggleCart() {
  document.getElementById("backdrop").classList.toggle("show");
  document.getElementById("drawer").classList.toggle("open");
}

document.getElementById("openCart").addEventListener("click", toggleCart);
document.getElementById("closeCart").addEventListener("click", toggleCart);

async function checkout() {
  if (cart.length === 0) return alert("Tu carrito está vacío.");

  try {
    const res = await fetch("https://una-tienda1.onrender.com/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cart })
    });

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("Error al iniciar el pago.");
    }
  } catch (err) {
    console.error(err);
    alert("Error de conexión con el servidor.");
  }
}

renderProducts();
renderCart();

/* ===== Promo vertical con emojis ===== */
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