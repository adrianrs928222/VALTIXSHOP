// app.js
// VALTIX – Catálogo + Carrito + Disponibilidad + Quick View + Deep Link (#p/<slug>)

const BACKEND_URL = "https://valtixshop.onrender.com";
const CHECKOUT_PATH = "/checkout";

// Helpers
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let products = [];
let availability = {}; // { [variant_id]: true|false|null }
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

// ===== Utilidades
function money(n){ return `${Number(n).toFixed(2)} €`; }
function getActiveCategory(){ const h=location.hash||""; return h.startsWith("#c/") ? decodeURIComponent(h.slice(3)) : "all"; }
function setYear(){ const y=$("#year"); if (y) y.textContent = new Date().getFullYear(); }
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }
function subtotal(){ return cart.reduce((s,i)=> s + (Number(i.price)*i.qty), 0); }

function getHashSlug(){
  const h = location.hash || "";
  if (h.startsWith("#p/")) return decodeURIComponent(h.slice(3)); // #p/<slug>
  return null;
}
function setHashSlug(slug){
  if (!slug) return;
  const target = `#p/${encodeURIComponent(slug)}`;
  if (location.hash !== target) location.hash = target;
}

// ===== Promo adaptativa
function setPromoText(){
  const box=$("#promoBox"); const textEl=box?.querySelector(".promo-text"); if(!box||!textEl) return;
  const msgsMobile=["🚚 Envíos a toda Europa en pedidos > 60€"];
  const msgsDesktop=["🚚 Envíos a toda Europa en pedidos > 60€","📦 Entrega estimada 2–7 días en Europa"];
  const msgs = (window.innerWidth <= 520) ? msgsMobile : msgsDesktop;
  let i=0; const show=()=>{ textEl.textContent=msgs[i]; i=(i+1)%msgs.length; };
  show(); setInterval(show,7000);
}

// ===== Breadcrumbs JSON-LD
function updateBreadcrumbsSchema(){
  const el = $("#breadcrumbs-jsonld"); if(!el) return;
  const base = {
    "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Inicio","item":"https://adrianrs928222.github.io/VALTIXSHOP/"}
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

// ===== Disponibilidad (sondeo backend)
async function fetchAvailability(variantIds){
  if (!variantIds.length) return {};
  try{
    const res = await fetch(`${BACKEND_URL}/availability`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ variant_ids: variantIds })
    });
    const data = await res.json();
    if (data?.ok && data.availability) return data.availability;
  }catch(e){ console.error("❌ availability:", e); }
  const out={}; variantIds.forEach(v=>out[v]=null); return out;
}

// ===== Datos
async function loadProducts(){
  const grid = $("#grid");
  try{
    const res = await fetch(`${BACKEND_URL}/api/printful/products?refresh=1`, { cache:"no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    products = Array.isArray(data?.products) ? data.products : [];
    if (!products.length) {
      grid.innerHTML = `<p style="color:#777">No hay productos añadidos en Printful o falta la API key.</p>`;
      return;
    }
    // Variante → disponibilidad
    const allVariantIds = [];
    products.forEach(p=>{
      Object.values(p.colors||{}).forEach(c=>{
        Object.values(c.sizes||{}).forEach(vid=>{ if (vid) allVariantIds.push(String(vid)); });
      });
    });
    const unique = [...new Set(allVariantIds)];
    availability = await fetchAvailability(unique);
    renderProducts();

    // Si hay slug en hash, abrir Quick View directo
    const slug = getHashSlug();
    if (slug) openProductBySlug(slug);
  }catch(e){
    console.error("❌ Error al cargar productos:", e);
    if (grid) grid.innerHTML = "<p style='color:#c00;font-weight:700'>Error al cargar productos.</p>";
  }
}

// ===== Carrito
function addToCart(item){
  const idx = cart.findIndex(i=>i.sku===item.sku && i.variant_id===item.variant_id);
  if (idx>=0) cart[idx].qty += 1; else cart.push({ ...item, qty:1 });
  saveCart();
}
function changeQty(sku, vid, delta){
  const it = cart.find(i=>i.sku===sku && i.variant_id===vid); if(!it) return;
  it.qty += delta; if(it.qty<=0) cart = cart.filter(i=>!(i.sku===sku && i.variant_id===vid));
  saveCart();
}
function clearCart(){ cart = []; saveCart(); }
function renderCart(){
  const count = cart.reduce((s,i)=>s+i.qty,0);
  const countEl=$("#cartCount"); if(countEl) countEl.textContent=count;
  const box=$("#cartItems"); if(!box) return;

  box.innerHTML="";
  if(!cart.length){
    box.innerHTML=`<p style="color:#666">Tu carrito está vacío.</p>`;
  }else{
    cart.forEach(i=>{
      const row=document.createElement("div");
      row.className="drawer-item";
      row.innerHTML=`
        <img src="${i.image}" alt="${i.name}" loading="lazy" decoding="async">
        <div style="flex:1">
          <div style="font-weight:700">${i.name}</div>
          <div class="qty">
            <button aria-label="Quitar">-</button>
            <span>${i.qty}</span>
            <button aria-label="Añadir">+</button>
          </div>
          <div style="color:#666">${money(i.price)}</div>
        </div>
      `;
      const [minus, , plus] = row.querySelectorAll(".qty button, .qty span");
      minus.addEventListener("click", ()=> changeQty(i.sku, i.variant_id, -1));
      plus.addEventListener("click",  ()=> changeQty(i.sku, i.variant_id,  1));
      box.appendChild(row);
    });
  }
  $("#subtotal").textContent = money(subtotal());
}

// ===== Drawer
function openCart(){ $("#drawerBackdrop").classList.add("show"); $("#cartDrawer").classList.add("open"); $("#cartDrawer").setAttribute("aria-hidden","false"); renderCart(); }
function closeCart(){ $("#drawerBackdrop").classList.remove("show"); $("#cartDrawer").classList.remove("open"); $("#cartDrawer").setAttribute("aria-hidden","true"); }

// ===== Checkout
async function goCheckout(){
  if(!cart.length) return alert("Tu carrito está vacío.");
  const items = cart.map(i=>({ variant_id:i.variant_id, quantity:i.qty, sku:i.sku, name:i.name, price:Number(i.price) }));
  try{
    const res = await fetch(`${BACKEND_URL}${CHECKOUT_PATH}`, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ items })
    });
    const data = await res.json();
    if(data?.url) window.location.href = data.url;
    else alert("No se pudo iniciar el pago.");
  }catch(e){ console.error(e); alert("Error de conexión con el servidor."); }
}

// ===== Quick View (estado y helpers)
let QV = { product: null, selectedColor: null, selectedSize: null };
function openQV(){ $("#qvBackdrop").classList.add("show"); $("#qvModal").classList.add("open"); $("#qvModal").setAttribute("aria-hidden","false"); }
function closeQV(){ $("#qvBackdrop").classList.remove("show"); $("#qvModal").classList.remove("open"); $("#qvModal").setAttribute("aria-hidden","true"); QV={product:null,selectedColor:null,selectedSize:null}; }

// Deep Link → abrir por slug
function openProductBySlug(slug){
  const p = products.find(x => x.slug === slug);
  if (!p) return; // slug inválido
  buildAndOpenQV(p);
}

// Copiar enlace
async function copyShareURL(slug){
  try{
    const url = `${location.origin}${location.pathname}#p/${encodeURIComponent(slug)}`;
    await navigator.clipboard.writeText(url);
    const btn = $("#qvShare");
    if (btn){ btn.textContent = "¡Enlace copiado!"; setTimeout(()=>btn.textContent="Compartir", 1400); }
  }catch{ alert("No se pudo copiar el enlace"); }
}

// ===== Render catálogo
function renderProducts(){
  const grid=$("#grid"); if(!grid) return;
  grid.innerHTML="";

  if(!Array.isArray(products) || !products.length){
    grid.innerHTML=`<p style="color:#777">Aún no hay productos disponibles.</p>`;
    return;
  }

  const cat=getActiveCategory();
  const list=(cat==="all") ? products : products.filter(p=>Array.isArray(p.categories)&&p.categories.includes(cat));

  list.forEach(p=>{
    // Filtrar colores sin stock
    const colorEntries = Object.entries(p.colors||{});
    const filteredColors = colorEntries
      .map(([name,meta])=>{
        const sizeEntries = Object.entries(meta.sizes||{});
        const hasAvail = sizeEntries.some(([,vid])=>{
          const a = availability[String(vid)];
          return a === true || a === null;
        });
        return hasAvail ? [name,meta] : null;
      })
      .filter(Boolean);

    if (!filteredColors.length) return;

    const colorsMap  = Object.fromEntries(filteredColors);
    const colorNames = Object.keys(colorsMap);
    let selectedColor = colorNames[0] || null;

    // primera talla disponible del color seleccionado
    let selectedSize = (()=>{
      const sizes = Object.entries(colorsMap[selectedColor].sizes||{});
      const firstAvail = sizes.find(([,vid])=>{
        const a = availability[String(vid)];
        return a === true || a === null;
      });
      return firstAvail ? firstAvail[0] : (sizes[0]?.[0] || null);
    })();

    const card=document.createElement("div");
    card.className="card";
    card.innerHTML=`
      <div class="card-img-wrap">
        <img class="card-img" src="${ colorsMap[selectedColor]?.image || p.image }" alt="${p.name}" loading="lazy" decoding="async">
      </div>
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">${money(p.price)}</p>
        <div class="stock-line"><span class="stock-badge ok">En stock</span></div>

        <div class="options color-selector" role="group" aria-label="Colores">
          ${colorNames.map((cn,idx)=>{
            const meta = colorsMap[cn];
            const sizeEntries = Object.entries(meta.sizes||{});
            const anyAvail = sizeEntries.some(([,vid])=>{
              const a = availability[String(vid)];
              return a === true || a === null;
            });
            const disabled = anyAvail ? "" : "disabled";

            // Mockup por color en el dot; fallback al HEX.
            const styleInline = meta?.image
              ? `background-image:url('${meta.image}'); background-size:cover; background-position:center;`
              : `background-color:${meta?.hex || "#ddd"};`;

            return `
              <button class="color-circle ${idx===0?"active":""}" ${disabled}
                title="${cn}" data-color="${cn}"
                style="${styleInline}"></button>
            `;
          }).join("")}
        </div>

        <div class="options" role="group" aria-label="Tallas" data-sizes></div>

        <div class="grid-2">
          <button class="btn qv-btn" data-id="${p.id}">Añadir al carrito</button>
          <button class="btn btn-alt share-btn" type="button">Compartir</button>
        </div>
      </div>
    `;

    const imgEl = card.querySelector(".card-img");
    const sizesWrap = card.querySelector("[data-sizes]");

    function renderSizes(){
      const sizeEntries = Object.entries(colorsMap[selectedColor].sizes||{});
      sizesWrap.innerHTML = sizeEntries.map(([sz,vid])=>{
        const a = availability[String(vid)];
        const isAvail = (a === true || a === null);
        const active = (sz===selectedSize) && isAvail ? "active" : "";
        const disabledAttr = isAvail ? "" : "disabled";
        return `<button class="option-btn ${active}" data-sz="${sz}" ${disabledAttr}>${sz}</button>`;
      }).join("");

      // si la seleccion actual está agotada, elige la primera disponible
      const currentVid = colorsMap[selectedColor].sizes[selectedSize];
      if (availability[String(currentVid)] === false) {
        const firstOk = Object.entries(colorsMap[selectedColor].sizes||{}).find(([,vid])=>{
          const a = availability[String(vid)];
          return a === true || a === null;
        });
        selectedSize = firstOk ? firstOk[0] : null;
      }

      sizesWrap.querySelectorAll(".option-btn").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          if (btn.hasAttribute("disabled")) return;
          sizesWrap.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
          btn.classList.add("active");
          selectedSize = btn.dataset.sz;
        });
      });
    }
    renderSizes();

    // Cambiar foto al elegir color (usa mockup por color)
    card.querySelectorAll(".color-circle").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        if (btn.hasAttribute("disabled")) return;
        card.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedColor = btn.dataset.color;
        imgEl.src = colorsMap[selectedColor]?.image || p.image;

        // seleccionar primera talla disponible del nuevo color
        const sizeEntries = Object.entries(colorsMap[selectedColor].sizes||{});
        const firstOk = sizeEntries.find(([,vid])=>{
          const a = availability[String(vid)];
          return a === true || a === null;
        });
        selectedSize = firstOk ? firstOk[0] : (sizeEntries[0]?.[0] || null);

        renderSizes();
      });
    });

    // Abrir Vista Rápida
    card.querySelector(".card-img-wrap").addEventListener("click", (e)=>{ e.preventDefault(); buildAndOpenQV(p); });
    card.querySelector(".card-title").addEventListener("click", (e)=>{ e.preventDefault(); buildAndOpenQV(p); });
    card.querySelector(".qv-btn")?.addEventListener("click", ()=> buildAndOpenQV(p));

    // Compartir
    card.querySelector(".share-btn")?.addEventListener("click", async ()=>{
      setHashSlug(p.slug);
      await copyShareURL(p.slug);
    });

    grid.appendChild(card);
  });

  updateActiveNavLink();
  updateBreadcrumbsSchema();
}

// Construir y abrir QV para un producto dado
function buildAndOpenQV(p){
  setHashSlug(p.slug);

  const colorsMap = p.colors || {};
  const colorNames = Object.keys(colorsMap);
  QV.product = p;
  QV.selectedColor = colorNames[0] || null;

  const entries0 = Object.entries(colorsMap[QV.selectedColor]?.sizes||{});
  const firstOk0 = entries0.find(([,vid])=> (availability[String(vid)]===true || availability[String(vid)]===null));
  QV.selectedSize  = firstOk0 ? firstOk0[0] : (entries0[0]?.[0] || null);

  $("#qvName").textContent = p.name;
  $("#qvPrice").textContent = money(p.price);
  $("#qvImg").src = colorsMap[QV.selectedColor]?.image || p.image;
  $("#qvImg").alt = p.name;

  // Colores con mockup en los dots
  const qvColors = $("#qvColors");
  qvColors.innerHTML = Object.entries(colorsMap).map(([cn,meta])=>{
    const anyAvail = Object.values(meta.sizes||{}).some(vid=>{
      const a = availability[String(vid)];
      return a===true || a===null;
    });
    if(!anyAvail) return "";
    const active = (cn===QV.selectedColor) ? "active":"";
    const styleInline = meta?.image
      ? `background-image:url('${meta.image}'); background-size:cover; background-position:center;`
      : `background-color:${meta?.hex||"#ddd"};`;
    return `<button class="color-circle ${active}" title="${cn}" data-color="${cn}" style="${styleInline}"></button>`;
  }).join("");

  qvColors.querySelectorAll(".color-circle").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      qvColors.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      QV.selectedColor = btn.dataset.color;
      $("#qvImg").src = colorsMap[QV.selectedColor]?.image || p.image;
      const entries = Object.entries(colorsMap[QV.selectedColor].sizes||{});
      const firstOk = entries.find(([,vid])=> (availability[String(vid)]===true || availability[String(vid)]===null));
      QV.selectedSize = firstOk ? firstOk[0] : (entries[0]?.[0] || null);
      renderQVSizes();
      updateQVCTA();
    });
  });

  function renderQVSizes(){
    const entries = Object.entries(colorsMap[QV.selectedColor].sizes||{});
    $("#qvSizes").innerHTML = entries.map(([sz,vid])=>{
      const a = availability[String(vid)];
      const isAvail = (a===true || a===null);
      const disabledAttr = isAvail ? "" : "disabled";
      const active = (sz===QV.selectedSize && isAvail) ? "active" : "";
      return `<button class="option-btn ${active}" data-sz="${sz}" ${disabledAttr}>${sz}</button>`;
    }).join("");
    $("#qvSizes").querySelectorAll(".option-btn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        if (btn.hasAttribute("disabled")) return;
        $("#qvSizes").querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        QV.selectedSize = btn.dataset.sz;
        updateQVCTA();
      });
    });
  }
  function updateQVCTA(){
    const vid = colorsMap[QV.selectedColor].sizes[QV.selectedSize];
    const a = availability[String(vid)];
    const btn = $("#qvAdd");
    if (!vid || a===false){ btn.disabled=true; btn.textContent="Agotado"; return; }
    btn.disabled=false; btn.textContent="Añadir al carrito";
  }
  renderQVSizes(); updateQVCTA();

  $("#qvAdd").onclick = ()=>{
    const vid = colorsMap[QV.selectedColor].sizes[QV.selectedSize];
    const a = availability[String(vid)];
    if (a===false) return;
    addToCart({
      sku: `${p.sku}_${QV.selectedColor}_${QV.selectedSize}`,
      name: `${p.name} ${QV.selectedColor} ${QV.selectedSize}`,
      price: p.price,
      image: colorsMap[QV.selectedColor]?.image || p.image,
      variant_id: vid
    });
    openCart();
  };

  $("#qvShare").onclick = async ()=> { await copyShareURL(p.slug); };

  openQV();
}

// ===== Menú activo
function updateActiveNavLink(){
  const cat = getActiveCategory();
  $$("#main-nav a").forEach(a=>{
    const href = a.getAttribute("href") || "";
    const match = href.startsWith("#c/") ? href.slice(3) : "";
    a.classList.toggle("active", cat!=="all" && match===cat);
  });
}

// ===== Init
document.addEventListener("DOMContentLoaded", async ()=>{
  const mt = document.getElementById("menu-toggle");
  const nav = document.getElementById("main-nav");
  if (mt && nav) {
    mt.addEventListener("click", () => {
      nav.classList.toggle("show");
      mt.setAttribute("aria-expanded", String(nav.classList.contains("show")));
      document.body.classList.toggle('nav-open', nav.classList.contains('show'));
    });
    $$("#main-nav a").forEach(a=>a.addEventListener('click', ()=>nav.classList.remove('show')));
    window.addEventListener('scroll', ()=>nav.classList.remove('show'));
  }

  setYear();
  setPromoText();

  // Quick View bindings globales
  $("#qvBackdrop")?.addEventListener("click", ()=>{
    closeQV();
    if (getHashSlug()) history.replaceState(null,"",`${location.pathname}${location.search}`);
  });
  $("#qvClose")?.addEventListener("click", ()=>{
    closeQV();
    if (getHashSlug()) history.replaceState(null,"",`${location.pathname}${location.search}`);
  });

  await loadProducts();
  renderCart();

  $("#goCatalog")?.addEventListener("click",(e)=>{ e.preventDefault(); $("#catalogo")?.scrollIntoView({behavior:"smooth"}); });
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", clearCart);
  $("#checkoutBtn")?.addEventListener("click", goCheckout);

  // Deep link / navegación con hash
  window.addEventListener("hashchange", ()=>{
    const slug = getHashSlug();
    if (slug) openProductBySlug(slug);
    else closeQV();
    renderProducts(); updateActiveNavLink();
  });

  updateActiveNavLink();
});