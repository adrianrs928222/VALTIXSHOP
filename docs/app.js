// ===== Config =====
const BACKEND_URL = "https://valtixshop.onrender.com";
const CHECKOUT_PATH = "/checkout";

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let cart = JSON.parse(localStorage.getItem("cart") || "[]");

function setYear(){ const y=$("#year"); if (y) y.textContent = new Date().getFullYear(); }
function money(n){ return `${Number(n).toFixed(2)} €`; }
function getActiveCategory(){ const h=location.hash||""; return h.startsWith("#c/") ? decodeURIComponent(h.slice(3)) : "all"; }

function updateBreadcrumbsSchema(){
  const el = $("#breadcrumbs-jsonld"); if(!el) return;
  const base = {
    "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      { "@type":"ListItem","position":1,"name":"Inicio","item":"https://adrianrs928222.github.io/VALTIXSHOP/" }
    ]
  };
  const cat = getActiveCategory();
  if (cat!=="all"){
    base.itemListElement.push({
      "@type":"ListItem","position":2,"name":cat.charAt(0).toUpperCase()+cat.slice(1),
      "item":`https://adrianrs928222.github.io/VALTIXSHOP/#c/${encodeURIComponent(cat)}`
    });
  }
  el.textContent = JSON.stringify(base);
}

async function loadProducts(){
  try{
    const res = await fetch(`${BACKEND_URL}/api/printful/products`);
    const { products } = await res.json();
    window.products = products || [];
    console.log("✅ Productos cargados:", products.length);
    renderProducts();
  }catch(e){
    console.error("❌ Error al cargar productos:", e);
    document.getElementById("grid").innerHTML = "<p>Error al cargar productos.</p>";
  }
}

// ===== Render productos (color + talla) =====
function renderProducts(){
  const grid=$("#grid"); if(!grid) return;
  grid.innerHTML="";

  if(!Array.isArray(window.products) || !products.length){
    grid.innerHTML=`<p style="color:#777">Aún no hay productos en Printful.</p>`;
    return;
  }

  const cat=getActiveCategory();
  const list=(cat==="all") ? products : products.filter(p=>Array.isArray(p.categories)&&p.categories.includes(cat));

  list.forEach(p=>{
    const colors = p.colors || {};
    const colorNames = Object.keys(colors).filter(c => c && c !== "Color único");
    let selectedColor = colorNames[0] || null;
    const sizeKeys = (selectedColor && colors[selectedColor]?.sizes)
      ? Object.keys(colors[selectedColor].sizes)
      : Object.keys(p.variant_map || {});
    let selectedSize = sizeKeys[0] || null;

    const card=document.createElement("div");
    card.className="card";
    card.innerHTML=`
      <img class="card-img" src="${ colors[selectedColor]?.image || p.image }" alt="${p.name}">
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">${money(p.price)}</p>
        <div class="stock-line"><span class="stock-badge ok" data-stock>En stock</span></div>

        ${colorNames.length ? `
          <div class="options color-selector" role="group" aria-label="Colores">
            ${colorNames.map((cn,idx)=>`
              <button 
                class="color-circle ${idx===0?"active":""}" 
                title="${cn}" 
                data-color="${cn}" 
                style="background-color:${cn.toLowerCase()};"
              ></button>
            `).join("")}
          </div>` : ""}

        <div class="options" role="group" aria-label="Tallas" data-sizes></div>

        <button class="btn add-btn" data-sku="${p.sku}">Añadir al carrito</button>
      </div>
    `;

    const imgEl = card.querySelector(".card-img");
    const sizesWrap = card.querySelector("[data-sizes]");

    function renderSizes(){
      const currentSizes = (selectedColor && colors[selectedColor]?.sizes)
        ? Object.keys(colors[selectedColor].sizes)
        : Object.keys(p.variant_map || {});
      selectedSize = currentSizes[0];
      sizesWrap.innerHTML = currentSizes.map((sz,idx)=>`
        <button class="option-btn ${idx===0?"active":""}" data-sz="${sz}">${sz}</button>
      `).join("");
      sizesWrap.querySelectorAll(".option-btn").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          sizesWrap.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
          btn.classList.add("active");
          selectedSize = btn.dataset.sz;
        });
      });
    }

    function currentVariantId(){
      if (selectedColor && colors[selectedColor]?.sizes?.[selectedSize]) {
        return colors[selectedColor].sizes[selectedSize];
      }
      if (p?.variant_map && selectedSize && p.variant_map[selectedSize]) return p.variant_map[selectedSize];
      return p.variant_id || null;
    }

    // Cambiar color
    card.querySelectorAll(".color-circle").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        card.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedColor = btn.dataset.color;
        imgEl.src = colors[selectedColor]?.image || p.image;
        renderSizes();
      });
    });

    renderSizes();

    card.querySelector(".add-btn").addEventListener("click", ()=>{
      const vid = currentVariantId();
      if (!vid) return;
      const colorLabel = selectedColor ? ` ${selectedColor}` : "";
      const sizeLabel = selectedSize ? ` — ${selectedSize}` : "";
      addToCart({
        sku: p.sku + (selectedColor?`_${selectedColor}`:"") + (selectedSize?`_${selectedSize}`:""),
        name: `${p.name}${colorLabel}${sizeLabel}`,
        price: p.price,
        image: colors[selectedColor]?.image || p.image,
        variant_id: vid
      });
    });

    grid.appendChild(card);
  });
}

// ===== Carrito =====
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }
function addToCart(item){
  const idx = cart.findIndex(i=>i.sku===item.sku && i.variant_id===item.variant_id);
  if (idx>=0) cart[idx].qty += 1; else cart.push({ ...item, qty:1 });
  saveCart();
}

// Inicialización
document.addEventListener("DOMContentLoaded", async ()=>{
  setYear();
  await loadProducts();
  renderCart();
});