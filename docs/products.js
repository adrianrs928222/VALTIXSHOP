/* ============================================================
   VALTIX PRODUCT VIEW – v2.0 “Zara/Nike Style”
   Sincronizado automáticamente con Printful
   ============================================================ */

const BACKEND_URL = "https://valtixshop.onrender.com";

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function money(n) {
  return `${Number(n).toFixed(2)} €`;
}

function qsParam(name) {
  return new URLSearchParams(location.search).get(name);
}

/* ---------- Render principal ---------- */
async function loadProduct() {
  const sku = qsParam("sku");
  if (!sku) {
    $("#productSection").innerHTML = "<p>Error: falta SKU</p>";
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/printful/product?sku=${sku}`, { cache: "no-store" });
    const data = await res.json();
    if (!data?.product) throw new Error("Producto no encontrado");
    renderProduct(data.product);
  } catch (err) {
    console.error("❌ Error cargando producto:", err);
    $("#productSection").innerHTML = "<p>Error al cargar producto.</p>";
  }
}

/* ---------- Render UI ---------- */
function renderProduct(p) {
  const container = $("#productSection");
  const colorNames = Object.keys(p.colors || {});
  const firstColor = colorNames[0];
  let selectedColor = firstColor;
  let selectedSize = firstColor ? Object.keys(p.colors[firstColor].sizes)[0] : null;

  const mainImg = p.colors[firstColor]?.image || p.image;
  const sizes = selectedColor ? Object.keys(p.colors[selectedColor].sizes) : [];

  container.innerHTML = `
    <div class="product-gallery">
      <div class="main-image">
        <img id="mainImage" src="${mainImg}" alt="${p.name}" loading="lazy">
      </div>
      <div class="thumbs">
        ${colorNames.map(cn => `
          <img src="${p.colors[cn]?.image || mainImg}"
               class="thumb ${cn === selectedColor ? "active" : ""}"
               title="${cn}" data-color="${cn}" loading="lazy">
        `).join("")}
      </div>
    </div>

    <div class="product-info">
      <h1 class="product-title">${p.name}</h1>
      <p class="product-price">${money(p.price)}</p>

      <div class="color-selector">
        ${colorNames.map((cn, idx) => `
          <button class="color-circle ${idx===0?"active":""}"
                  style="background-color:${p.colors[cn]?.hex || "#ddd"}"
                  title="${cn}" data-color="${cn}">
          </button>
        `).join("")}
      </div>

      <div class="size-selector">
        ${sizes.map((sz, idx)=>`
          <button class="size-btn ${idx===0?"active":""}" data-sz="${sz}">${sz}</button>
        `).join("")}
      </div>

      <button id="addToCartBtn" class="btn-primary">Añadir al carrito</button>

      <div class="product-desc">
        <h3>Detalles del producto</h3>
        <p>Prenda premium de la colección oficial VALTIX, fabricada bajo demanda en materiales de alta calidad por Printful.</p>

        <h3>Talla y ajuste</h3>
        <ul>
          <li>Elige tu talla habitual. Si dudas entre dos, te recomendamos la superior.</li>
          <li>Consulta la guía de tallas durante el checkout.</li>
          <li>Los colores pueden variar ligeramente según tu pantalla.</li>
        </ul>

        <h3>Devoluciones y envíos</h3>
        <ul>
          <li>Envíos a toda Europa en pedidos superiores a 60€.</li>
          <li>Los productos se fabrican bajo demanda. No se aceptan devoluciones salvo defecto.</li>
          <li>Entrega estándar estimada: 5–10 días laborales.</li>
        </ul>
      </div>
    </div>
  `;

  // Interacciones dinámicas
  const mainImage = $("#mainImage");

  // Color selector (botones circulares)
  $$(".color-circle").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".color-circle").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedColor = btn.dataset.color;

      // cambia imagen principal y miniaturas
      const img = p.colors[selectedColor]?.image || p.image;
      mainImage.src = img;
      renderSizes();
      updateThumbs();
    });
  });

  // Miniaturas
  function updateThumbs() {
    const thumbs = $$(".thumb");
    thumbs.forEach(t => {
      t.classList.toggle("active", t.dataset.color === selectedColor);
    });
  }

  $$(".thumb").forEach(t => {
    t.addEventListener("click", () => {
      const color = t.dataset.color;
      selectedColor = color;
      mainImage.src = p.colors[color]?.image || p.image;
      updateThumbs();
      renderSizes();
    });
  });

  // Tallas
  function renderSizes() {
    const wrap = $(".size-selector");
    const sizes = selectedColor ? Object.keys(p.colors[selectedColor].sizes) : [];
    wrap.innerHTML = sizes.map((sz, idx)=>`
      <button class="size-btn ${idx===0?"active":""}" data-sz="${sz}">${sz}</button>
    `).join("");

    $$(".size-btn").forEach(b=>{
      b.addEventListener("click", ()=>{
        $$(".size-btn").forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        selectedSize = b.dataset.sz;
      });
    });
  }

  renderSizes();

  // Añadir al carrito
  $("#addToCartBtn").addEventListener("click", ()=>{
    if(!selectedColor || !selectedSize) return alert("Selecciona color y talla");
    const vid = p.colors[selectedColor].sizes[selectedSize];
    const item = {
      sku: `${p.sku}_${selectedColor}_${selectedSize}`,
      name: `${p.name} (${selectedColor}, ${selectedSize})`,
      price: p.price,
      image: p.colors[selectedColor]?.image || p.image,
      variant_id: vid,
      qty: 1
    };

    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const idx = cart.findIndex(i=>i.sku===item.sku);
    if(idx>=0) cart[idx].qty++;
    else cart.push(item);
    localStorage.setItem("cart", JSON.stringify(cart));
    alert("Añadido al carrito ✅");
  });

  // Zoom elegante
  mainImage.addEventListener("mousemove", e => {
    const { left, top, width, height } = mainImage.getBoundingClientRect();
    const x = ((e.pageX - left) / width) * 100;
    const y = ((e.pageY - top) / height) * 100;
    mainImage.style.transformOrigin = `${x}% ${y}%`;
    mainImage.style.transform = "scale(1.8)";
  });

  mainImage.addEventListener("mouseleave", ()=>{
    mainImage.style.transform = "scale(1)";
  });
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", loadProduct);