// ===== Config =====
const BACKEND_URL = "https://valtixshop.onrender.com";
const CHECKOUT_PATH = "/checkout";

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let cart = JSON.parse(localStorage.getItem("cart") || "[]");
let PRODUCTS = [];

// ===== Util =====
const slug = s => String(s||"").toLowerCase().trim()
  .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");

function setYear(){ const y=$("#year"); if (y) y.textContent = new Date().getFullYear(); }
function money(n){ return `${Number(n).toFixed(2)} €`; }
function getActiveCategory(){ const h=location.hash||""; return h.startsWith("#c/") ? decodeURIComponent(h.slice(3)) : "all"; }
function clamp(str, n=80){ return String(str||"").length>n ? String(str).slice(0,n-1)+"…" : str; }

// ===== SEO: Breadcrumbs =====
function updateBreadcrumbsSchemaList(){
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
function updateBreadcrumbsSchemaDetail(prodName){
  const el = $("#breadcrumbs-jsonld"); if(!el) return;
  const cat = getActiveCategory();
  const list = [
    { "@type":"ListItem","position":1,"name":"Inicio","item":"https://adrianrs928222.github.io/VALTIXSHOP/" }
  ];
  if (cat!=="all"){
    list.push({
      "@type":"ListItem","position":2,"name":cat.charAt(0).toUpperCase()+cat.slice(1),
      "item":`https://adrianrs928222.github.io/VALTIXSHOP/#c/${encodeURIComponent(cat)}`
    });
  }
  list.push({
    "@type":"ListItem","position": list.length+1,
    "name": prodName,
    "item": `https://adrianrs928222.github.io/VALTIXSHOP/#p/${slug(prodName)}`
  });
  const json = { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement": list };
  el.textContent = JSON.stringify(json);
}

// ===== Promo =====
function startPromo(){
  const box=$("#promoBox"); const textEl=$(".promo-text"); if(!box||!textEl) return;
  const msgs=[
    "Compra hoy y recibe en España o en cualquier parte del mundo 🌍",
    "🚚 Envíos GRATIS en pedidos superiores a 60€"
  ];
  let i=0; const show=()=>{ textEl.textContent=msgs[i]; i=(i+1)%msgs.length; };
  show(); setInterval(show, 8000);
}

// ===== Menu/Hamburguesa =====
function setupHamburger(){
  const btn = $("#menu-toggle");
  const nav = $("#main-nav");
  if(!btn || !nav) return;

  btn.addEventListener("click", ()=>{
    nav.classList.toggle("show");
    const expanded = btn.getAttribute("aria-expanded")==="true";
    btn.setAttribute("aria-expanded", String(!expanded));
  });

  nav.addEventListener("click", e=>{
    if(e.target.tagName==="A" && window.innerWidth<=900){
      nav.classList.remove("show");
      btn.setAttribute("aria-expanded","false");
    }
  });

  window.addEventListener("resize", ()=>{
    if(window.innerWidth>900){
      nav.classList.remove("show");
      btn.setAttribute("aria-expanded","false");
    }
  });
}
function updateActiveNavLink(){
  const cat = getActiveCategory();
  $$("#main-nav a").forEach(a=>{
    const href = a.getAttribute("href") || "";
    const match = href.startsWith("#c/") ? href.slice(3) : "";
    a.classList.toggle("active", cat!=="all" && match===cat);
  });
}

// ===== Productos =====
async function loadProducts(){
  const grid = $("#grid");
  try{
    const res = await fetch(`${BACKEND_URL}/api/printful/products?refresh=1`, { cache:"no-store" });
    const data = await res.json();
    PRODUCTS = data?.products || [];
    routerRender();
  }catch(e){
    console.error("❌ Error al cargar productos:", e);
    if (grid) grid.innerHTML = "<p>Error al cargar productos.</p>";
  }
}

function renderList(){
  const grid=$("#grid"); if(!grid) return;
  grid.innerHTML="";

  if(!Array.isArray(PRODUCTS) || !PRODUCTS.length){
    grid.innerHTML=`<p style="color:#777">Aún no hay productos en Printful.</p>`;
    return;
  }

  const cat=getActiveCategory();
  const list=(cat==="all") ? PRODUCTS : PRODUCTS.filter(p=>Array.isArray(p.categories)&&p.categories.includes(cat));

  list.forEach(p=>{
    const colors = p.colors || {};
    const colorNames = Object.keys(colors);
    const coverImg = (colorNames.length ? colors[colorNames[0]]?.image : null) || p.image;

    const card=document.createElement("div");
    card.className="card";
    card.innerHTML=`
      <a href="#p/${slug(p.name)}" class="card-img-link" aria-label="${p.name}">
        <img class="card-img" src="${coverImg}" alt="${p.name}">
      </a>
      <div class="card-body">
        <h3 class="card-title">${clamp(p.name, 60)}</h3>
        <p class="card-price">${money(p.price)}</p>

        ${colorNames.length ? `
          <div class="color-selector" role="group" aria-label="Colores">
            ${colorNames.slice(0,6).map((cn,idx)=>{
              const hex = colors[cn]?.hex || "#ddd";
              return `<span class="color-circle ${idx===0?"active":""}" title="${cn}" style="background:${hex}"></span>`;
            }).join("")}
            ${colorNames.length>6 ? `<span style="font-size:.85rem;color:#666">+${colorNames.length-6}</span>` : ""}
          </div>` : ""}

        <a class="btn btn-alt" href="#p/${slug(p.name)}">Ver producto</a>
      </div>
    `;
    grid.appendChild(card);
  });

  updateBreadcrumbsSchemaList();
  updateActiveNavLink();
}

/* ====== PRODUCT DETAIL (overlay) ====== */
const PD = {
  el: $("#pdOverlay"),
  title: $("#pdTitle"),
  price: $("#pdPrice"),
  main: $("#pdMain"),
  thumbs: $("#pdThumbs"),
  colors: $("#pdColors"),
  sizes: $("#pdSizes"),
  add: $("#pdAdd"),
  close: $("#pdClose"),
};

function openDetail(prod){
  if (!prod) return;

  // Estado seleccionado
  const colorNames = Object.keys(prod.colors||{});
  let selectedColor = colorNames[0] || null;
  let selectedSize = selectedColor ? Object.keys(prod.colors[selectedColor]?.sizes||{})[0] : Object.keys(prod.variant_map||{})[0] || null;

  // Título y precio
  PD.title.textContent = prod.name;
  PD.price.textContent = money(prod.price);

  // Galería
  const gallery = [];
  if (selectedColor && prod.colors[selectedColor]?.image) gallery.push(prod.colors[selectedColor].image);
  if (prod.image) gallery.push(prod.image);
  const uniq = Array.from(new Set(gallery.filter(Boolean)));
  PD.main.src = uniq[0] || "";
  PD.main.alt = prod.name;
  PD.thumbs.innerHTML = uniq.map((u,i)=>`<img data-idx="${i}" src="${u}" alt="Vista ${i+1}">`).join("");
  PD.thumbs.querySelectorAll("img").forEach(img=>{
    img.addEventListener("click", ()=>{ PD.main.src = img.src; });
  });

  // Colores (swatches)
  PD.colors.innerHTML = colorNames.map((cn,idx)=>{
    const hex = prod.colors[cn]?.hex || "#ddd";
    return `<button class="color-circle ${idx===0?"active":""}" data-color="${cn}" title="${cn}" style="background:${hex}"></button>`;
  }).join("");
  PD.colors.querySelectorAll(".color-circle").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      PD.colors.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      selectedColor = btn.dataset.color;

      // refresh galería principal
      const imgs = [];
      if (prod.colors[selectedColor]?.image) imgs.push(prod.colors[selectedColor].image);
      if (prod.image) imgs.push(prod.image);
      const uimgs = Array.from(new Set(imgs.filter(Boolean)));
      PD.main.src = uimgs[0] || "";
      PD.thumbs.innerHTML = uimgs.map((u,i)=>`<img data-idx="${i}" src="${u}" alt="Vista ${i+1}">`).join("");
      PD.thumbs.querySelectorAll("img").forEach(img=>{
        img.addEventListener("click", ()=>{ PD.main.src = img.src; });
      });

      // refrescar tallas
      renderSizes();
    });
  });

  function renderSizes(){
    const sizes = (selectedColor && prod.colors[selectedColor]?.sizes)
      ? Object.keys(prod.colors[selectedColor].sizes)
      : Object.keys(prod.variant_map||{});
    selectedSize = sizes[0] || null;
    PD.sizes.innerHTML = sizes.map((sz,idx)=>`
      <button class="option-btn ${idx===0?"active":""}" data-sz="${sz}" aria-label="Talla ${sz}">${sz}</button>
    `).join("");
    PD.sizes.querySelectorAll(".option-btn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        PD.sizes.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedSize = btn.dataset.sz;
      });
    });
  }
  renderSizes();

  // Añadir al carrito
  PD.add.onclick = ()=>{
    const vid = (selectedColor && prod.colors[selectedColor]?.sizes?.[selectedSize])
      ? prod.colors[selectedColor].sizes[selectedSize]
      : (prod.variant_map?.[selectedSize] || null);
    if (!vid) return alert("Variante no disponible.");
    addToCart({
      sku: prod.sku + (selectedColor?`_${selectedColor}`:"") + (selectedSize?`_${selectedSize}`:""),
      name: `${prod.name}${selectedColor?` ${selectedColor}`:""}${selectedSize?` — ${selectedSize}`:""}`,
      price: prod.price,
      image: (selectedColor && prod.colors[selectedColor]?.image) || prod.image,
      variant_id: String(vid)
    });
    openCart();
  };

  // Mostrar overlay
  PD.el.classList.add("show");
  PD.el.setAttribute("aria-hidden","false");
  updateBreadcrumbsSchemaDetail(prod.name);
}

function closeDetail(){
  PD.el.classList.remove("show");
  PD.el.setAttribute("aria-hidden","true");
  updateBreadcrumbsSchemaList();
}

// Click cerrar
PD.close?.addEventListener("click", ()=>{
  closeDetail();
  // Volver a la categoría actual
  const cat = getActiveCategory();
  history.replaceState(null, "", cat==="all" ? "#" : `#c/${encodeURIComponent(cat)}`);
});
// Cerrar al hacer click fuera
PD.el?.addEventListener("click", (e)=>{
  if (e.target === PD.el) PD.close.click();
});

function getProductBySlug(s){
  const name = s.replace(/-/g," ").trim();
  // mejor por slug comparando
  return PRODUCTS.find(p => slug(p.name) === s) || null;
}

// ===== Router: lista (categorías) y detalle (#p/<slug>) =====
function routerRender(){
  const h = location.hash||"";
  const detailMatch = h.match(/^#p\/([^/?#]+)/);
  if (detailMatch){
    const sl = detailMatch[1];
    const prod = getProductBySlug(sl);
    renderList(); // tener el grid detrás
    if (prod) openDetail(prod); else closeDetail();
  } else {
    closeDetail();
    renderList();
  }
}

// ===== Carrito =====
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }
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
function subtotal(){ return cart.reduce((s,i)=> s + (Number(i.price)*i.qty), 0); }

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
        <img src="${i.image}" alt="${i.name}">
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

// ===== Drawer =====
function openCart(){ $("#drawerBackdrop").classList.add("show"); $("#cartDrawer").classList.add("open"); $("#cartDrawer").setAttribute("aria-hidden","false"); renderCart(); }
function closeCart(){ $("#drawerBackdrop").classList.remove("show"); $("#cartDrawer").classList.remove("open"); $("#cartDrawer").setAttribute("aria-hidden","true"); }

// ===== Checkout (Stripe) =====
async function goCheckout(){
  if(!cart.length) return alert("Tu carrito está vacío.");
  const items = cart.map(i=>({ variant_id:i.variant_id, quantity:i.qty, sku:i.sku, name:i.name, price:Number(i.price) }));
  try{
    const res = await fetch(`${BACKEND_URL}${CHECKOUT_PATH}`, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ items })
    });
    const data = await res.json();
    if(data?.url) window.location.href = data.url;
    else alert("No se pudo iniciar el pago. Intenta más tarde.");
  }catch(e){ console.error(e); alert("Error de conexión con el servidor."); }
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", async ()=>{
  setYear();
  setupHamburger();
  // Promo
  const box=$("#promoBox"), textEl=$(".promo-text");
  if(box && textEl){
    const msgs=["Compra hoy y recibe en España o en cualquier parte del mundo 🌍","🚚 Envíos GRATIS en pedidos superiores a 60€"];
    let i=0; const show=()=>{ textEl.textContent=msgs[i]; i=(i+1)%msgs.length; }; show(); setInterval(show,8000);
  }

  await loadProducts();

  $("#goCatalog")?.addEventListener("click",(e)=>{ e.preventDefault(); $("#catalogo")?.scrollIntoView({behavior:"smooth"}); });

  // Carrito
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", clearCart);
  $("#checkoutBtn")?.addEventListener("click", goCheckout);

  window.addEventListener("hashchange", routerRender);
  updateActiveNavLink();
});