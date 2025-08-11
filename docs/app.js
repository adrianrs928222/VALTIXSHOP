// =======================
// Variables y elementos
// =======================
const productGrid = document.getElementById("grid");
const cartCount = document.getElementById("cartCount");
let cart = JSON.parse(localStorage.getItem("cart")) || [];

// =======================
// Renderizar productos
// =======================
function renderProducts(category = null) {
  productGrid.innerHTML = "";
  let filtered = category
    ? products.filter(p => p.category === category)
    : products;

  filtered.forEach(prod => {
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

// =======================
// Carrito
// =======================
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
  updateCartUI();
}

function updateCartUI() {
  cartCount.textContent = cart.reduce((sum, item) => sum + item.qty, 0);
}

function vaciarCarrito() {
  cart = [];
  saveCart();
}

// =======================
// Checkout con Stripe
// =======================
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

// =======================
// Animación recuadro promo
// =======================
(function rotatePromo() {
  const promoBox = document.querySelector(".promo-box");
  if (!promoBox) return;

  const mensajes = [
    `<span class="badge">🇪🇸</span> Compra hoy y recibe en España <span class="sep">•</span> <span class="badge">🌍</span> o en cualquier parte del mundo`,
    `<span class="badge">🛒</span> Envíos rápidos y seguros <span class="sep">•</span> <span class="badge">🔥</span> Buena calidad garantizada`,
    `<span class="badge">💳</span> Pago 100% seguro <span class="sep">•</span> <span class="badge">📦</span> Entrega en tiempo récord`
  ];

  let i = 0;
  promoBox.innerHTML = mensajes[i];

  setInterval(() => {
    i = (i + 1) % mensajes.length;
    promoBox.classList.remove("swap");
    promoBox.innerHTML = mensajes[i];
    void promoBox.offsetWidth;
    promoBox.classList.add("swap");
  }, 7000); // más lento para que se lea bien
})();

// =======================
// Navegación de categorías
// =======================
window.addEventListener("hashchange", () => {
  const hash = location.hash.split("/")[1];
  renderProducts(hash);
});

document.addEventListener("DOMContentLoaded", () => {
  updateCartUI();
  renderProducts();

  // Botón "Catálogo"
  const ctaBtn = document.querySelector(".cta");
  if (ctaBtn) {
    ctaBtn.textContent = "Ver catálogo";
    ctaBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelector("#catalogo").scrollIntoView({ behavior: "smooth" });
    });
  }
});