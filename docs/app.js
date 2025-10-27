// ========== VALTIX | App principal ==========

// Utilidades básicas
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Estado global
let allProducts = [];
let cart = [];

// Cargar productos desde backend (Render)
async function loadProducts() {
  try {
    const res = await fetch("https://valtixshop.onrender.com/api/printful/products");
    const data = await res.json();
    allProducts = data.products || [];
    renderProducts();
  } catch (err) {
    console.error("❌ Error al cargar productos:", err);
    $("#grid").innerHTML = `<p style="color:red;font-weight:700">Error al cargar productos</p>`;
  }
}

// Renderizar catálogo
function renderProducts() {
  const grid = $("#grid");
  grid.innerHTML = "";

  const cat = getActiveCategory();
  const filtered = cat === "all"
    ? allProducts
    : allProducts.filter(p => p.categories?.includes(cat));

  filtered.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";

    // Imagen principal (primer color)
    const firstColorKey = Object.keys(p.colors || {})[0];
    const firstColor = p.colors?.[firstColorKey];
    const imgURL = firstColor?.image || p.image;

    const img = document.createElement("img");
    img.src = imgURL;
    img.alt = p.name;
    img.className = "card-img";

    // Nombre y precio
    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `
      <h4 class="card-title">${p.name}</h4>
      <div class="card-price">${p.price.toFixed(2)} €</div>
    `;

    // Selector de colores (si hay)
    const colors = Object.entries(p.colors || {});
    if (colors.length > 1) {
      const colorSel = document.createElement("div");
      colorSel.className = "color-selector";
      colors.forEach(([name, info]) => {
        const btn = document.createElement("button");
        btn.className = "color-circle";
        btn.style.backgroundColor = info.hex;
        btn.title = name;
        btn.addEventListener("click", () => {
          img.src = info.image || imgURL;
          $$(".color-circle").forEach(c => c.classList.remove("active"));
          btn.classList.add("active");
        });
        colorSel.appendChild(btn);
      });
      body.appendChild(colorSel);
    }

    // Botón añadir
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Ver producto";
    btn.onclick = () => openProductModal(p);
    body.appendChild(btn);

    card.appendChild(img);
    card.appendChild(body);
    grid.appendChild(card);
  });

  updateActiveNavLink();
}

// Obtener categoría actual de la URL
function getActiveCategory() {
  const hash = location.hash;
  if (hash.startsWith("#c/")) return hash.replace("#c/", "");
  return "all";
}

// ======= Menú activo (FIX incluido) =======
function updateActiveNavLink() {
  const cat = getActiveCategory();
  $$("#main-nav a").forEach(a => {
    const href = a.getAttribute("href") || "";
    const match = href.startsWith("#c/") ? href.slice(3) : "";
    a.classList.toggle("active", cat !== "all" && match === cat);
  });
}

// Abrir modal de producto (simplificado)
function openProductModal(p) {
  const colorKeys = Object.keys(p.colors || {});
  const firstColor = p.colors?.[colorKeys[0]];
  const image = firstColor?.image || p.image;

  $("#grid").innerHTML = `
    <div class="card">
      <img src="${image}" alt="${p.name}" class="card-img" />
      <div class="card-body">
        <h3>${p.name}</h3>
        <p>${p.price.toFixed(2)} €</p>
        <p><span class="stock-badge ok">En stock</span></p>

        <div class="options" id="sizeOpts"></div>
        <button class="btn" id="addCart">Añadir al carrito</button>
      </div>
    </div>
  `;

  const sizeBox = $("#sizeOpts");
  Object.keys(firstColor?.sizes || {}).forEach(sz => {
    const b = document.createElement("button");
    b.className = "option-btn";
    b.textContent = sz;
    b.onclick = () => {
      $$(".option-btn").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      $("#addCart").onclick = () => addToCart(p, sz);
    };
    sizeBox.appendChild(b);
  });
}

// Añadir al carrito
function addToCart(p, size) {
  const item = { ...p, size };
  cart.push(item);
  updateCartCount();
  alert(`✅ Añadido: ${p.name} (${size})`);
}

// Actualizar contador del carrito
function updateCartCount() {
  $("#cartCount").textContent = cart.length;
}

// ======= Promo box =======
function startPromo() {
  const promos = [
    "✨ Nueva colección otoño 2025",
    "🚀 Envíos gratis desde 60 €",
    "🌍 Envíos internacionales disponibles"
  ];
  const promoBox = $("#promoBox");
  const promoText = $("#promoBox .promo-text");
  let i = 0;
  function next() {
    promoText.textContent = promos[i % promos.length];
    i++;
  }
  next();
  setInterval(next, 6000);
}

// ======= Eventos globales =======
document.addEventListener("DOMContentLoaded", () => {
  loadProducts();
  startPromo();

  $("#year").textContent = new Date().getFullYear();

  // Menú móvil
  $("#menu-toggle").addEventListener("click", () => {
    $("#main-nav").classList.toggle("show");
  });

  window.addEventListener("hashchange", renderProducts);
});