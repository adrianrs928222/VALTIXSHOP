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
    renderProducts();
    hydrateDeepLink(); // si viene #p/<slug>/<color> hace scroll a la tarjeta
  }catch(e){
    console.error("❌ Error al cargar productos:", e);
    if (grid) grid.innerHTML = "<p>Error al cargar productos.</p>";
  }
}

/* Explota cada producto en N “sub-productos” por color */
function explodeByColor(list){
  const out = [];
  for (const p of list){
    const colors = p.colors || {};
    const colorNames = Object.keys(colors);
    if (!colorNames.length){
      out.push({ ...p, _isColorCard:false, _color:null, _sizes:p.variant_map||{} });
      continue;
    }
    for (const cn of colorNames){
      const c = colors[cn] || {};
      out.push({
        id: `${p.id}__${slug(cn)}`,
        name: `${p.name} — ${cn}`,
        baseName: p.name,
        price: p.price,
        image: c.image || p.image,
        sku: `${p.sku}__${slug(cn)}`,
        categories: p.categories || [],
        _isColorCard: true,
        _color: { name: cn, hex: c.hex || null, image: c.image || null },
        _sizes: c.sizes || {},           // talla -> variant_id
        _link: `#p/${slug(p.name)}/${encodeURIComponent(cn)}`
      });
    }
  }
  return out;
}

function renderProducts(){
  const grid=$("#grid"); if(!grid) return;
  grid.innerHTML="";

  if(!Array.isArray(PRODUCTS) || !PRODUCTS.length){
    grid.innerHTML=`<p style="color:#777">Aún no hay productos en Printful.</p>`;
    return;
  }

  const cat=getActiveCategory();
  const list=(cat==="all") ? PRODUCTS : PRODUCTS.filter(p=>Array.isArray(p.categories)&&p.categories.includes(cat));

  // 👉 Catálogo “profesional”: una tarjeta por color
  const exploded = explodeByColor(list);

  exploded.forEach(p=>{
    // Preparar tallas iniciales
    const sizeKeys = Object.keys(p._sizes||{});
    let selectedSize = sizeKeys[0] || null;

    const card=document.createElement("div");
    card.className="card";
    card.id = p._link ? `card-${slug(p.id)}` : `card-${slug(p.name)}`;
    const swatchStyle = p._color?.hex
      ? `background:${p._color.hex};`
      : (p._color?.image ? `background-image:url('${p._color.image}');background-size:cover;background-position:center;` : `background:#ddd;`);

    card.innerHTML=`
      <a href="${p._link||'#'}" class="card-img-link" aria-label="${p.name}">
        <img class="card-img" src="${p.image}" alt="${p.name}">
      </a>
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:8px;justify-content:space-between">
          <h3 class="card-title" style="margin:0">${clamp(p.name, 60)}</h3>
          ${p._isColorCard ? `<span class="color-circle" title="${p._color.name}" style="${swatchStyle}; width:18px;height:18px;border:2px solid #ddd"></span>` : ``}
        </div>
        <p class="card-price">${money(p.price)}</p>

        <div class="options" role="group" aria-label="Tallas" data-sizes></div>

        <div style="display:flex;gap:8px">
          ${p._link ? `<a class="btn btn-alt" href="${p._link}">Ver</a>` : ``}
          <button class="btn add-btn" data-sku="${p.sku}">Añadir</button>
        </div>
      </div>
    `;

    const sizesWrap = card.querySelector("[data-sizes]");
    function renderSizes(){
      if (!sizeKeys.length){
        sizesWrap.innerHTML = `<span style="color:#888">Talla única</span>`;
        return;
      }
      sizesWrap.innerHTML = sizeKeys.map((sz,idx)=>`
        <button class="option-btn ${idx===0?"active":""}" data-sz="${sz}" aria-label="Talla ${sz}">${sz}</button>
      `).join("");
      sizesWrap.querySelectorAll(".option-btn").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          sizesWrap.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
          btn.classList.add("active");
          selectedSize = btn.dataset.sz;
        });
      });
    }
    renderSizes();

    function currentVariantId(){
      if (selectedSize && p._sizes && p._sizes[selectedSize]) return p._sizes[selectedSize];
      return null;
    }

    // Add
    card.querySelector(".add-btn").addEventListener("click", ()=>{
      const vid = currentVariantId();
      if (!vid) return alert("Variante no disponible.");
      const sizeLabel = selectedSize ? ` — ${selectedSize}` : "";
      addToCart({
        sku: p.sku + (p._color?`_${slug(p._color.name)}`:"") + (selectedSize?`_${selectedSize}`:""),
        name: `${p.name}${sizeLabel}`,
        price: p.price,
        image: p.image,
        variant_id: String(vid)
      });
      openCart();
    });

    grid.appendChild(card);
  });

  updateActiveNavLink();
  updateBreadcrumbsSchema();
}

/* Deep-link: #p/<slug-nombre>/<Color> → hace scroll a la tarjeta correspondiente */
function hydrateDeepLink(){
  const m = (location.hash||"").match(/^#p\/([^/]+)\/(.+)$/);
  if (!m) return;
  const [, prodSlug, colorEnc] = m;
  const color = decodeURIComponent(colorEnc);
  const card = $(`#card-${prodSlug}__${slug(color)}`) || $(`[id*="${prodSlug}"]`);
  if (card) card.scrollIntoView({behavior:"smooth", block:"center"});
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
  startPromo();

  await loadProducts();
  renderCart();

  $("#goCatalog")?.addEventListener("click",(e)=>{ e.preventDefault(); $("#catalogo")?.scrollIntoView({behavior:"smooth"}); });

  // Carrito
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", clearCart);
  $("#checkoutBtn")?.addEventListener("click", goCheckout);

  window.addEventListener("hashchange", ()=>{ renderProducts(); updateActiveNavLink(); hydrateDeepLink(); });
  updateActiveNavLink();
});