/* ============================================================
   VALTIX PRODUCT VIEW – v3.0 “Nike/Zara Gallery”
   - Carrusel con múltiples imágenes por color (Printful)
   - Zoom suave en la principal
   - Selector color+talla con variant_id real
   ============================================================ */

const BACKEND_URL = "https://valtixshop.onrender.com";
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function money(n){ return `${Number(n).toFixed(2)} €`; }
function getSku(){ return new URLSearchParams(location.search).get("sku"); }

document.addEventListener("DOMContentLoaded", init);

async function init(){
  const sku = getSku();
  if(!sku){ location.href="./"; return; }

  try{
    const r = await fetch(`${BACKEND_URL}/api/printful/product?sku=${sku}`, { cache:"no-store" });
    const data = await r.json();
    if(!data?.product) throw new Error("Producto no encontrado");
    renderProduct(data.product);
  }catch(e){
    console.error(e);
    const box = document.getElementById("productSection") || document.body;
    box.innerHTML = "<p style='color:#c00;font-weight:700'>Error cargando producto.</p>";
  }
}

function renderProduct(p){
  // Estado
  const colors = Object.keys(p.colors||{});
  let selColor = colors[0] || null;
  let selSize  = selColor ? Object.keys(p.colors[selColor].sizes||{})[0] : null;

  // Layout
  const host = $("#productSection") || document.body;
  host.innerHTML = `
    <div class="product-gallery">
      <div class="main-image"><img id="mainImg" alt="${p.name}"></div>
      <div id="thumbs" class="thumbs"></div>
    </div>
    <div class="product-info">
      <h1 class="product-title" id="pName">${p.name}</h1>
      <div class="product-price" id="pPrice">${money(p.price)}</div>

      <div class="color-selector" id="colorWrap" aria-label="Colores"></div>
      <div class="size-selector" id="sizeWrap" aria-label="Tallas"></div>

      <button id="addBtn" class="btn-primary" disabled>Añadir al carrito</button>

      <div class="product-desc">
        <h3>Detalles del producto</h3>
        <p>Streetwear premium VALTIX fabricado bajo demanda con Printful. Materiales de calidad, producción responsable.</p>
        <h3>Talla y ajuste</h3>
        <ul>
          <li>Elige tu talla habitual; si dudas entre dos, selecciona la superior.</li>
          <li>Guía de tallas disponible durante el checkout.</li>
        </ul>
        <h3>Devoluciones y envíos</h3>
        <ul>
          <li>Envíos a toda Europa en pedidos superiores a 60€.</li>
          <li>Tiempo estimado: producción 2–5 días + envío 3–7 días.</li>
          <li>Devoluciones por defecto de fabricación o impresión.</li>
        </ul>
      </div>
    </div>
  `;

  // Construir selectores
  buildColors();
  buildSizes();
  buildGallery();
  updateAddBtn();

  // Eventos
  $("#addBtn").addEventListener("click", ()=>{
    if(!(selColor && selSize)) return;
    const vid = p.colors[selColor].sizes[selSize];
    const item = {
      sku: `${p.sku}_${selColor}_${selSize}`,
      name: `${p.name} ${selColor} ${selSize}`,
      price: p.price,
      image: p.colors[selColor]?.image || p.image,
      variant_id: vid, qty:1
    };
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const idx  = cart.findIndex(i=>i.sku===item.sku && i.variant_id===item.variant_id);
    if(idx>=0) cart[idx].qty += 1; else cart.push(item);
    localStorage.setItem("cart", JSON.stringify(cart));
    alert("Añadido al carrito ✅");
  });

  /* ---------- helpers UI ---------- */
  function buildColors(){
    const cw = $("#colorWrap");
    cw.innerHTML = colors.map((c,idx)=>{
      const hex = p.colors[c]?.hex || "#ddd";
      return `<button class="color-circle ${idx===0?"active":""}" title="${c}" data-c="${c}" style="background:${hex}"></button>`;
    }).join("");
    $$("#colorWrap .color-circle").forEach(btn=>{
      btn.addEventListener("click",()=>{
        $$("#colorWrap .color-circle").forEach(x=>x.classList.remove("active"));
        btn.classList.add("active");
        selColor = btn.dataset.c;
        selSize  = Object.keys(p.colors[selColor].sizes||{})[0] || null;
        buildSizes();
        buildGallery();
        updateAddBtn();
      });
    });
  }

  function buildSizes(){
    const sw = $("#sizeWrap");
    const sizes = selColor ? Object.keys(p.colors[selColor].sizes||{}) : [];
    sw.innerHTML = sizes.map((sz,idx)=>`
      <button class="size-btn ${idx===0?"active":""}" data-sz="${sz}">${sz}</button>
    `).join("");
    $$("#sizeWrap .size-btn").forEach(btn=>{
      btn.addEventListener("click",()=>{
        $$("#sizeWrap .size-btn").forEach(x=>x.classList.remove("active"));
        btn.classList.add("active");
        selSize = btn.dataset.sz;
        updateAddBtn();
      });
    });
  }

  function buildGallery(){
    const imgs = (p.colors[selColor]?.images && p.colors[selColor].images.length)
      ? p.colors[selColor].images
      : [p.colors[selColor]?.image || p.image].filter(Boolean);

    const main = $("#mainImg");
    main.src = imgs[0] || "";
    main.alt = `${p.name} - ${selColor}`;

    const thumbs = $("#thumbs");
    thumbs.innerHTML = imgs.map((u,idx)=>`
      <img src="${u}" class="thumb ${idx===0?"active":""}" data-idx="${idx}" alt="Vista ${idx+1}" loading="lazy">
    `).join("");

    // Miniaturas → principal
    $$("#thumbs .thumb").forEach(t=>{
      t.addEventListener("click",()=>{
        $$("#thumbs .thumb").forEach(x=>x.classList.remove("active"));
        t.classList.add("active");
        main.src = t.getAttribute("src");
      });
    });

    // Zoom suave
    enableZoom(main);
  }

  function updateAddBtn(){
    $("#addBtn").disabled = !(selColor && selSize && p.colors?.[selColor]?.sizes?.[selSize]);
  }
}

/* ---------- Zoom helper ---------- */
function enableZoom(imgEl){
  imgEl.style.transition = "transform .15s ease";
  imgEl.style.transformOrigin = "center center";
  imgEl.addEventListener("mousemove", (e)=>{
    const r = imgEl.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    imgEl.style.transformOrigin = `${x}% ${y}%`;
    imgEl.style.transform = "scale(1.8)";
  });
  imgEl.addEventListener("mouseleave", ()=>{
    imgEl.style.transform = "scale(1)";
  });
}