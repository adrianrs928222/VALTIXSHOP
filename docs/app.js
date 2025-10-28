// ===== CONFIGURACIÓN =====
const BACKEND_URL = "https://valtixshop.onrender.com";
const CHECKOUT_PATH = "/checkout";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let cart = JSON.parse(localStorage.getItem("cart") || "[]");

// ===== UTILIDADES =====
function setYear() {
  const y = $("#year");
  if (y) y.textContent = new Date().getFullYear();
}
function money(n) {
  return `${Number(n).toFixed(2)} €`;
}
function slugify(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
}
function getActiveCategory() {
  const h = location.hash || "";
  return h.startsWith("#c/") ? decodeURIComponent(h.slice(3)) : "all";
}

// ===== SEO: Breadcrumbs =====
function updateBreadcrumbsSchema() {
  const el = $("#breadcrumbs-jsonld");
  if (!el) return;
  const base = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Inicio",
        item: "https://adrianrs928222.github.io/VALTIXSHOP/",
      },
    ],
  };
  const cat = getActiveCategory();
  if (cat !== "all") {
    base.itemListElement.push({
      "@type": "ListItem",
      position: 2,
      name: cat.charAt(0).toUpperCase() + cat.slice(1),
      item: `https://adrianrs928222.github.io/VALTIXSHOP/#c/${encodeURIComponent(cat)}`,
    });
  }
  el.textContent = JSON.stringify(base);
}

// ===== CARGA DE PRODUCTOS =====
async function loadProducts() {
  const grid = $("#grid");
  try {
    const res = await fetch(`${BACKEND_URL}/api/printful/products`);
    const { products } = await res.json();
    window.products = products || [];
    renderProducts();
  } catch (e) {
    console.error("❌ Error al cargar productos:", e);
    if (grid) grid.innerHTML = "<p>Error al cargar productos.</p>";
  }
}

// ===== RENDER PRODUCTOS =====
function renderProducts() {
  const grid = $("#grid");
  if (!grid) return;
  grid.innerHTML = "";

  if (!Array.isArray(window.products) || !products.length) {
    grid.innerHTML = `<p style="color:#777">Aún no hay productos en Printful.</p>`;
    return;
  }

  const cat = getActiveCategory();
  const list = cat === "all" ? products : products.filter((p) => Array.isArray(p.categories) && p.categories.includes(cat));

  list.forEach((p) => {
    const colors = p.colors || {};
    const colorNames = Object.keys(colors).length ? Object.keys(colors) : ["Único"];
    let selectedColor = colorNames[0] || "Único";

    const sizes = colors[selectedColor]?.sizes ? Object.keys(colors[selectedColor].sizes) : Object.keys(p.variant_map || {});
    let selectedSize = sizes[0] || null;

    const slugProduct = slugify(p.name);

    // === Aquí se fuerza imagen local ===
    const localImage = `img/${slugProduct}__${slugify(selectedColor)}.jpg`;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img class="card-img" src="${localImage}" alt="${p.name}">
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">${money(p.price)}</p>
        <div class="options color-selector" role="group" aria-label="Colores">
          ${colorNames
            .map(
              (cn, idx) => `
            <button 
              class="color-circle ${idx === 0 ? "active" : ""}" 
              title="${cn}" 
              data-color="${cn}" 
              style="background-color:${cn.toLowerCase()};"
            ></button>`
            )
            .join("")}
        </div>
        <div class="options" role="group" aria-label="Tallas" data-sizes></div>
        <button class="btn add-btn" data-sku="${p.sku}">Añadir al carrito</button>
      </div>
    `;

    const imgEl = card.querySelector(".card-img");
    const sizesWrap = card.querySelector("[data-sizes]");

    function renderSizes() {
      sizesWrap.innerHTML = sizes
        .map(
          (sz, idx) => `
        <button class="option-btn ${idx === 0 ? "active" : ""}" data-sz="${sz}">${sz}</button>`
        )
        .join("");
      sizesWrap.querySelectorAll(".option-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          sizesWrap.querySelectorAll(".option-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          selectedSize = btn.dataset.sz;
        });
      });
    }

    renderSizes();

    // === Selector de color ===
    card.querySelectorAll(".color-circle").forEach((btn) => {
      btn.addEventListener("click", () => {
        card.querySelectorAll(".color-circle").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedColor = btn.dataset.color;
        const newImage = `img/${slugProduct}__${slugify(selectedColor)}.jpg`;
        imgEl.src = newImage;
      });
    });

    // === Añadir al carrito ===
    card.querySelector(".add-btn").addEventListener("click", () => {
      addToCart({
        sku: `${p.sku}_${selectedColor}_${selectedSize}`,
        name: `${p.name} (${selectedColor} - ${selectedSize})`,
        price: p.price,
        image: `img/${slugProduct}__${slugify(selectedColor)}.jpg`,
        variant_id: colors[selectedColor]?.sizes?.[selectedSize] || null,
      });
      openCart();
    });

    grid.appendChild(card);
  });

  updateActiveNavLink();
  updateBreadcrumbsSchema();
}

// ===== CARRITO =====
function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCart();
}
function addToCart(item) {
  const idx = cart.findIndex((i) => i.sku === item.sku);
  if (idx >= 0) cart[idx].qty += 1;
  else cart.push({ ...item, qty: 1 });
  saveCart();
}
function changeQty(sku, delta) {
  const it = cart.find((i) => i.sku === sku);
  if (!it) return;
  it.qty += delta;
  if (it.qty <= 0) cart = cart.filter((i) => i.sku !== sku);
  saveCart();
}
function clearCart() {
  cart = [];
  saveCart();
}
function subtotal() {
  return cart.reduce((s, i) => s + Number(i.price) * i.qty, 0);
}
function renderCart() {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  $("#cartCount").textContent = count;
  const box = $("#cartItems");
  box.innerHTML = "";
  if (!cart.length) box.innerHTML = `<p style="color:#666">Tu carrito está vacío.</p>`;
  else {
    cart.forEach((i) => {
      const row = document.createElement("div");
      row.className = "drawer-item";
      row.innerHTML = `
        <img src="${i.image}" alt="${i.name}">
        <div style="flex:1">
          <div style="font-weight:700">${i.name}</div>
          <div class="qty">
            <button>-</button>
            <span>${i.qty}</span>
            <button>+</button>
          </div>
          <div style="color:#666">${money(i.price)}</div>
        </div>`;
      const [minus, , plus] = row.querySelectorAll(".qty button, .qty span");
      minus.addEventListener("click", () => changeQty(i.sku, -1));
      plus.addEventListener("click", () => changeQty(i.sku, 1));
      box.appendChild(row);
    });
  }
  $("#subtotal").textContent = money(subtotal());
}

// ===== DRAWER =====
function openCart() {
  $("#drawerBackdrop").classList.add("show");
  $("#cartDrawer").classList.add("open");
  renderCart();
}
function closeCart() {
  $("#drawerBackdrop").classList.remove("show");
  $("#cartDrawer").classList.remove("open");
}

// ===== CHECKOUT =====
async function goCheckout() {
  if (!cart.length) return alert("Tu carrito está vacío.");
  const items = cart.map((i) => ({
    variant_id: i.variant_id,
    quantity: i.qty,
    sku: i.sku,
    name: i.name,
    price: i.price,
  }));
  try {
    const res = await fetch(`${BACKEND_URL}${CHECKOUT_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (data?.url) window.location.href = data.url;
    else alert("No se pudo iniciar el pago.");
  } catch (e) {
    alert("Error de conexión.");
  }
}

// ===== NAVEGACIÓN =====
function setupHamburger() {
  const btn = $("#menu-toggle");
  const nav = $("#main-nav");
  btn.addEventListener("click", () => {
    nav.classList.toggle("show");
    btn.setAttribute("aria-expanded", nav.classList.contains("show"));
  });
}
function updateActiveNavLink() {
  const cat = getActiveCategory();
  $$("#main-nav a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    const match = href.startsWith("#c/") ? href.slice(3) : "";
    a.classList.toggle("active", cat !== "all" && match === cat);
  });
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", async () => {
  setYear();
  setupHamburger();
  await loadProducts();
  renderCart();

  $("#openCart").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#drawerBackdrop").addEventListener("click", closeCart);
  $("#clearCart").addEventListener("click", clearCart);
  $("#checkoutBtn").addEventListener("click", goCheckout);
  window.addEventListener("hashchange", () => {
    renderProducts();
    updateActiveNavLink();
  });
});