/* ============================================================
   VALTIX PRODUCT VIEW – Robust v2
   - Carga por SKU con timeout y reintento desde /products
   - Galería por color (Printful), selector colores + tallas
   - Zoom suave, errores visibles, UX tipo Nike/Zara
============================================================ */

const BACKEND_URL = "https://valtixshop.onrender.com";
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function money(n){ return `${Number(n).toFixed(2)} €`; }
function qsParam(k){ return new URLSearchParams(location.search).get(k); }

function showMsg(html){ const c=$("#productSection"); if(c) c.innerHTML = `<div style="padding:2rem;text-align:center;color:#555">${html}</div>`; }
function timeoutFetch(url, opts={}, ms=12000){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), ms);
  return fetch(url, { ...opts, signal: ctl.signal }).finally(()=>clearTimeout(t));
}

/* ========== Cargar producto con fallback ========== */
async function loadProduct(){
  const sku = qsParam("sku");
  if(!sku){ return showMsg("❌ Falta el parámetro <b>sku</b> en la URL."); }

  showMsg("Cargando producto…");

  try{
    const r = await timeoutFetch(`${BACKEND_URL}/api/printful/product?sku=${encodeURIComponent(sku)}`, { cache:"no-store" });
    const j = await r.json();
    if(r.ok && j?.product){ renderProduct(j.product); return; }
    console.warn("Producto no resuelto por /product, respuesta:", j);
  }catch(e){
    console.warn("Fallo /product:", e);
  }

  try{
    const r2 = await timeoutFetch(`${BACKEND_URL}/api/printful/products?refresh=1`, { cache:"no-store" });
    const j2 = await r2.json();
    const p = (j2?.products||[]).find(x => String(x.sku)===String(sku) || String(x.id)===String(sku));
    if(p){ renderProduct(p); return; }
    return showMsg("❌ Producto no encontrado. Verifica el <b>SKU</b> de Printful (external_id) y vuelve a intentar.");
  }catch(e){
    console.error("Fallo /products:", e);
    return showMsg("❌ Error de conexión con el servidor. Vuelve a intentarlo en unos segundos.");
  }
}

/* ========== Render de ficha ========== */
function renderProduct(p){
  const wrap = $("#productSection");
  const colorNames = Object.keys(p.colors||{});
  if(!colorNames.length){ return showMsg("Este artículo no tiene variantes activas en Printful."); }

  let selectedColor = colorNames[0];
  let selectedSize  = Object.keys(p.colors[selectedColor].sizes||{})[0] || null;

  wrap.innerHTML = `
    <div class="product-container">
      <div class="product-gallery">
        <div class="main-img-wrap">
          <img id="mainImage" alt="${escapeHtml(p.name)}" loading="lazy">
        </div>
        <div class="thumbs" id="thumbs"></div>
      </div>

      <div class="product-info">
        <h1 class="pname">${escapeHtml(p.name)}</h1>
        <p class="pprice">${money(p.price)}</p>

        <div class="field">
          <div style="font-weight:700;margin-bottom:.4rem;">Color</div>
          <div class="color-selector" id="colorWrap"></div>
        </div>

        <div class="field">
          <div style="font-weight:700;margin-bottom:.4rem;">Talla</div>
          <div class="size-selector" id="sizeWrap"></div>
        </div>

        <button id="addToCartBtn" class="btn">Añadir al carrito</button>

        <div class="desc">
          <h3>Detalles del producto</h3>
          <p>Diseño exclusivo VALTIX. Fabricado bajo demanda por Printful con materiales premium.</p>

          <h3>Talla y ajuste</h3>
          <p>- Elige tu talla habitual. Si dudas entre dos, te recomendamos la superior.<br>
             - Consulta la guía de tallas en el checkout si está disponible.<br>
             - Los colores pueden variar ligeramente según tu pantalla.</p>

          <h3>Devoluciones y envíos</h3>
          <p>- Producción bajo demanda. Aceptamos devoluciones por defectos de fabricación.<br>
             - Envíos a toda Europa en pedidos superiores a 60€.</p>
        </div>
      </div>
    </div>
  `;

  buildColorSelector(p, selectedColor, (newColor)=>{
    selectedColor = newColor;
    selectedSize = Object.keys(p.colors[selectedColor].sizes||{})[0] || null;
    buildGallery(p, selectedColor);
    buildSizeSelector(p, selectedColor, selectedSize, (sz)=>{ selectedSize = sz; });
  });
  buildGallery(p, selectedColor);
  buildSizeSelector(p, selectedColor, selectedSize, (sz)=>{ selectedSize = sz; });

  $("#addToCartBtn").addEventListener("click", ()=>{
    if(!selectedColor || !selectedSize){
      alert("Selecciona color y talla."); return;
    }
    const vid = p.colors[selectedColor].sizes[selectedSize];
    if(!vid){ alert("Variante no disponible."); return; }

    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const sku = `${p.sku}_${selectedColor}_${selectedSize}`;
    const idx = cart.findIndex(i=>i.sku===sku);
    if(idx>=0) cart[idx].qty++;
    else cart.push({
      sku,
      name: `${p.name} (${selectedColor}, ${selectedSize})`,
      price: p.price,
      image: p.colors[selectedColor].image || p.image,
      variant_id: vid,
      qty: 1
    });
    localStorage.setItem("cart", JSON.stringify(cart));
    alert("✅ Añadido al carrito");
  });
}

/* ========== Subcomponentes ========== */
function buildColorSelector(p, activeColor, onChange){
  const cw = $("#colorWrap");
  const colors = Object.keys(p.colors||{});
  cw.innerHTML = colors.map((c)=>`
    <button class="color-circle ${c===activeColor?"active":""}" title="${escapeHtml(c)}"
            data-color="${escapeHtml(c)}"
            style="background-color:${p.colors[c]?.hex || "#ddd"}"></button>
  `).join("");

  cw.querySelectorAll(".color-circle").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      cw.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      onChange(btn.dataset.color);
    });
  });
}

function buildSizeSelector(p, color, activeSize, onChange){
  const sw = $("#sizeWrap");
  const sizes = Object.keys(p.colors[color].sizes||{});
  if(!sizes.length){
    sw.innerHTML = `<div style="color:#a00">Sin tallas disponibles para este color.</div>`;
    return;
  }
  sw.innerHTML = sizes.map(sz=>`
    <button class="size-btn ${sz===activeSize?"active":""}" data-sz="${escapeHtml(sz)}">${escapeHtml(sz)}</button>
  `).join("");

  sw.querySelectorAll(".size-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      sw.querySelectorAll(".size-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      onChange(btn.dataset.sz);
    });
  });
}

function buildGallery(p, color){
  const main = $("#mainImage");
  const thumbs = $("#thumbs");
  const imgs = (p.colors[color]?.images || []).filter(Boolean);
  const list = imgs.length ? imgs : [p.colors[color]?.image || p.image].filter(Boolean);

  main.src = list[0] || "";
  thumbs.innerHTML = list.map((u,i)=>`
    <img src="${u}" class="thumb ${i===0?"active":""}" data-url="${u}" loading="lazy">
  `).join("");

  thumbs.querySelectorAll(".thumb").forEach(t=>{
    t.addEventListener("click", ()=>{
      thumbs.querySelectorAll(".thumb").forEach(x=>x.classList.remove("active"));
      t.classList.add("active");
      main.src = t.dataset.url;
    });
  });

  main.style.transition = "transform .25s ease";
  main.addEventListener("mousemove", e=>{
    const r = main.getBoundingClientRect();
    const x = ((e.clientX - r.left)/r.width)*100;
    const y = ((e.clientY - r.top)/r.height)*100;
    main.style.transformOrigin = `${x}% ${y}%`;
    main.style.transform = "scale(1.7)";
  });
  main.addEventListener("mouseleave", ()=>{ main.style.transform = "scale(1)"; });
}

/* ========== Util ========== */
function escapeHtml(s=""){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ========== Init ========== */
document.addEventListener("DOMContentLoaded", loadProduct);