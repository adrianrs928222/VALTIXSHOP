/* ============================================================
   VALTIX PRODUCT VIEW 2.0 – Sincronizado con Printful
   ------------------------------------------------------------
   - Galería completa por color (Printful)
   - Selector de colores y tallas
   - Zoom suave tipo Nike
   - Añadir al carrito localStorage
   ============================================================ */

const BACKEND_URL = "https://valtixshop.onrender.com";
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function money(n) { return `${Number(n).toFixed(2)} €`; }
function qsParam(name) { return new URLSearchParams(location.search).get(name); }

/* ---------- Cargar producto ---------- */
async function loadProduct() {
  const sku = qsParam("sku");
  const cont = $("#productSection");

  if (!sku) return cont.innerHTML = `<p>❌ Falta SKU.</p>`;

  try {
    const res = await fetch(`${BACKEND_URL}/api/printful/product?sku=${sku}`, { cache: "no-store" });
    const data = await res.json();
    if (!data?.product) throw new Error("No encontrado");
    renderProduct(data.product);
  } catch (e) {
    console.error(e);
    cont.innerHTML = `<p style="color:red">Error al cargar producto.</p>`;
  }
}

/* ---------- Render ficha ---------- */
function renderProduct(p) {
  const colorNames = Object.keys(p.colors || {});
  const firstColor = colorNames[0];
  let selectedColor = firstColor;
  let selectedSize = Object.keys(p.colors[firstColor]?.sizes || {})[0];

  const main = $("#productSection");
  const imgs = p.colors[firstColor]?.images || [p.image];

  main.innerHTML = `
  <div class="product-container">
    <div class="product-gallery">
      <div class="main-img-wrap">
        <img id="mainImage" src="${imgs[0]}" alt="${p.name}" loading="lazy">
      </div>
      <div class="thumbs">
        ${imgs.map((u,i)=>`
          <img src="${u}" class="thumb ${i===0?"active":""}" data-url="${u}" loading="lazy">
        `).join("")}
      </div>
    </div>

    <div class="product-info">
      <h1 class="pname">${p.name}</h1>
      <p class="pprice">${money(p.price)}</p>

      <div class="color-selector">
        ${colorNames.map((c,i)=>`
          <button class="color-circle ${i===0?"active":""}"
                  title="${c}" data-color="${c}"
                  style="background-color:${p.colors[c]?.hex || "#ddd"}"></button>
        `).join("")}
      </div>

      <div class="size-selector"></div>
      <button id="addToCartBtn" class="btn">Añadir al carrito</button>

      <div class="desc">
        <h3>Detalles</h3>
        <p>Diseño exclusivo VALTIX fabricado bajo demanda en Printful con materiales premium. 
        <br>Envíos a toda Europa en pedidos superiores a 60€.</p>

        <h3>Devoluciones</h3>
        <p>Los productos se fabrican bajo demanda. Solo se admiten devoluciones por defectos de fabricación.</p>
      </div>
    </div>
  </div>
  `;

  const mainImg = $("#mainImage");

  // Miniaturas
  $$(".thumb").forEach(t=>{
    t.addEventListener("click", ()=>{
      $$(".thumb").forEach(x=>x.classList.remove("active"));
      t.classList.add("active");
      mainImg.src = t.dataset.url;
    });
  });

  // Selector de color
  $$(".color-circle").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      $$(".color-circle").forEach(x=>x.classList.remove("active"));
      btn.classList.add("active");
      selectedColor = btn.dataset.color;
      selectedSize = Object.keys(p.colors[selectedColor].sizes)[0];

      // Actualizar galería
      const imgs = p.colors[selectedColor]?.images || [p.image];
      const thumbs = $(".thumbs");
      thumbs.innerHTML = imgs.map((u,i)=>`
        <img src="${u}" class="thumb ${i===0?"active":""}" data-url="${u}" loading="lazy">
      `).join("");
      mainImg.src = imgs[0];
      $$(".thumb").forEach(t=>{
        t.addEventListener("click", ()=>{
          $$(".thumb").forEach(x=>x.classList.remove("active"));
          t.classList.add("active");
          mainImg.src = t.dataset.url;
        });
      });

      renderSizes(p, selectedColor);
    });
  });

  // Zoom
  mainImg.addEventListener("mousemove", e=>{
    const { left, top, width, height } = mainImg.getBoundingClientRect();
    const x = ((e.pageX - left)/width)*100;
    const y = ((e.pageY - top)/height)*100;
    mainImg.style.transformOrigin = `${x}% ${y}%`;
    mainImg.style.transform = "scale(1.7)";
  });
  mainImg.addEventListener("mouseleave", ()=> mainImg.style.transform = "scale(1)");

  renderSizes(p, selectedColor);

  $("#addToCartBtn").addEventListener("click", ()=>{
    if(!selectedColor || !selectedSize) return alert("Selecciona color y talla");
    const vid = p.colors[selectedColor].sizes[selectedSize];
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const sku = `${p.sku}_${selectedColor}_${selectedSize}`;
    const idx = cart.findIndex(i=>i.sku===sku);
    if(idx>=0) cart[idx].qty++;
    else cart.push({
      sku, name:`${p.name} (${selectedColor}, ${selectedSize})`,
      price:p.price, image:p.colors[selectedColor].image, variant_id:vid, qty:1
    });
    localStorage.setItem("cart", JSON.stringify(cart));
    alert("✅ Añadido al carrito");
  });
}

/* ---------- Render tallas ---------- */
function renderSizes(p, color){
  const wrap = $(".size-selector");
  const sizes = Object.keys(p.colors[color].sizes || {});
  wrap.innerHTML = sizes.map((sz,i)=>`
    <button class="size-btn ${i===0?"active":""}" data-sz="${sz}">${sz}</button>
  `).join("");
  $$(".size-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      $$(".size-btn").forEach(x=>x.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", loadProduct);