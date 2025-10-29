// ============================================================
// VALTIX – App principal (catálogo + carrito + vista rápida)
// - Toggle menú móvil
// - Carga de productos desde backend Printful
// - Fallback demo si el backend falla (para no ver la página vacía)
// ============================================================

// ===== Config
const BACKEND_URL = "https://valtixshop.onrender.com";
const CHECKOUT_PATH = "/checkout";

// ===== Helpers
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
let products = [];
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

function money(n){ return `${Number(n).toFixed(2)} €`; }
function getActiveCategory(){ const h=location.hash||""; return h.startsWith("#c/") ? decodeURIComponent(h.slice(3)) : "all"; }
function setYear(){ const y=$("#year"); if (y) y.textContent = new Date().getFullYear(); }

// ===== Breadcrumbs
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

// ===== Data (con fallback demo)
async function loadProducts(){
  const grid = $("#grid");
  try{
    const res = await fetch(`${BACKEND_URL}/api/printful/products?refresh=1`, { cache:"no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    products = Array.isArray(data?.products) ? data.products : [];
    if (!products.length) {
      grid.innerHTML = `<p style="color:#777">No hay productos añadidos en Printful o falta la API key en el backend.</p>`;
      return;
    }
    renderProducts();
  }catch(e){
    console.error("❌ Error al cargar productos:", e);
    // Fallback mínimo para poder probar UI aunque el backend falle
    products = [{
      sku: "DEMO-1",
      name: "Valtix V",
      price: 28.50,
      image: "./img/valtix-v__negro.jpg",
      categories: ["sudaderas"],
      colors: {
        "Negro": { hex:"#222", image:"./img/valtix-v__negro.jpg", images:["./img/valtix-v__negro.jpg"], sizes:{ "S":111,"M":112,"L":113,"XL":114,"2XL":115,"3XL":116 } },
        "Verde": { hex:"#2e7d32", image:"./img/valtix-v__verde.jpg", images:["./img/valtix-v__verde.jpg"], sizes:{ "S":121,"M":122,"L":123 } }
      },
      variant_map: {}
    }];
    renderProducts();
  }
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
    const colorNames = Object.keys(p.colors || {});
    const firstColor = colorNames[0] || null;

    let selectedColor = firstColor;
    let selectedSize =
      (selectedColor && Object.keys(p.colors[selectedColor].sizes)[0]) || null;

    const card=document.createElement("div");
    card.className="card";
    card.innerHTML=`
      <div class="card-img-wrap">
        <img class="card-img" src="${ (selectedColor && p.colors[selectedColor].image) || p.image }" alt="${p.name}">
      </div>
      <div class="card-body">
        <h3 class="card-title"><a href="./producto.html?sku=${encodeURIComponent(p.sku)}" class="card-link">${p.name}</a></h3>
        <p class="card-price">${money(p.price)}</p>
        <div class="stock-line"><span class="stock-badge ok">En stock</span></div>

        <div class="options color-selector" role="group" aria-label="Colores">
          ${colorNames.map((cn,idx)=>`
            <button class="color-circle ${idx===0?"active":""}" title="${cn}" data-color="${cn}" style="background-color:${p.colors[cn]?.hex || "#ddd"};"></button>
          `).join("")}
        </div>

        <div class="options" role="group" aria-label="Tallas" data-sizes></div>

        <div class="grid-2">
          <button class="btn add-btn" data-sku="${p.sku}">Añadir al carrito</button>
          <a class="btn btn-alt" href="./producto.html?sku=${encodeURIComponent(p.sku)}">Ver ficha</a>
        </div>
      </div>
    `;

    const imgEl = card.querySelector(".card-img");
    const sizesWrap = card.querySelector("[data-sizes]");

    function renderSizes(){
      const sizes = selectedColor ? Object.keys(p.colors[selectedColor].sizes) : [];
      selectedSize = sizes[0] || null;
      sizesWrap.innerHTML = sizes.map((sz,idx)=>`
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
    renderSizes();

    // Cambiar foto al elegir color
    card.querySelectorAll(".color-circle").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        card.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedColor = btn.dataset.color;
        imgEl.src = p.colors[selectedColor]?.image || p.image;
        renderSizes();
      });
    });

    // Add to cart
    card.querySelector(".add-btn").addEventListener("click", ()=>{
      if (!selectedColor || !selectedSize) return;
      const vid = p.colors[selectedColor].sizes[selectedSize];
      addToCart({
        sku: `${p.sku}_${selectedColor}_${selectedSize}`,
        name: `${p.name} ${selectedColor} ${selectedSize}`,
        price: p.price,
        image: p.colors[selectedColor]?.image || p.image,
        variant_id: vid
      });
      openCart();
    });

    grid.appendChild(card);
  });

  updateActiveNavLink();
  updateBreadcrumbsSchema();
}

// ===== Cart
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

// ===== Menú activo (FIX)
function updateActiveNavLink(){
  const cat = getActiveCategory();
  $$("#main-nav a").forEach(a=>{
    const href = a.getAttribute("href") || "";
    const match = href.startsWith("#c/") ? href.slice(3) : "";
    a.classList.toggle("active", cat!=="all" && match===cat);
  });
}

// ===== Promo (igual que antes)
function startPromo(){
  const box=$("#promoBox"); const textEl=box?.querySelector(".promo-text"); if(!box||!textEl) return;
  if(window.innerWidth <= 520){
    textEl.textContent = "🚚 Envíos a toda Europa en pedidos superiores a 60€";
  } else {
    const msgs=[
      "Compra hoy y recibe en Europa en 2–7 días 📦",
      "🚚 Envíos a toda Europa en pedidos superiores a 60€"
    ];
    let i=0; const show=()=>{ textEl.textContent=msgs[i]; i=(i+1)%msgs.length; };
    show(); setInterval(show,8000);
  }
}

// ===== Init
document.addEventListener("DOMContentLoaded", async ()=>{
  setYear();
  startPromo();

  // --- Toggle menú móvil
  const mt = document.getElementById("menu-toggle");
  const nav = document.getElementById("main-nav");
  if (mt && nav) {
    mt.addEventListener("click", () => {
      nav.classList.toggle("show");
      const open = nav.classList.contains("show");
      mt.setAttribute("aria-expanded", String(open));
    });
  }

  await loadProducts();
  renderCart();

  $("#goCatalog")?.addEventListener("click",(e)=>{ e.preventDefault(); $("#catalogo")?.scrollIntoView({behavior:"smooth"}); });
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", clearCart);
  $("#checkoutBtn")?.addEventListener("click", goCheckout);

  window.addEventListener("hashchange", ()=>{ renderProducts(); updateActiveNavLink(); });
  updateActiveNavLink();
});