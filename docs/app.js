// ===== Config backend
const BACKEND_URL = "https://valtixshop.onrender.com";  // Render (o tu Hostinger API)

// ===== Helpers
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
let products = [];
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

function money(n){ return `${Number(n).toFixed(2)} €`; }
function getActiveCategory(){ const h=location.hash||""; return h.startsWith("#c/") ? decodeURIComponent(h.slice(3)) : "all"; }
function setYear(){ const y=$("#year"); if (y) y.textContent = new Date().getFullYear(); }

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

function openCart(){ $("#drawerBackdrop").classList.add("show"); $("#cartDrawer").classList.add("open"); $("#cartDrawer").setAttribute("aria-hidden","false"); renderCart(); }
function closeCart(){ $("#drawerBackdrop").classList.remove("show"); $("#cartDrawer").classList.remove("open"); $("#cartDrawer").setAttribute("aria-hidden","true"); }

// ===== Checkout
async function goCheckout(){
  if(!cart.length) return alert("Tu carrito está vacío.");
  const items = cart.map(i=>({ variant_id:i.variant_id, quantity:i.qty, sku:i.sku, name:i.name, price:Number(i.price) }));
  try{
    const res = await fetch(`${BACKEND_URL}/checkout`, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ items })
    });
    const data = await res.json();
    if(data?.url) window.location.href = data.url;
    else alert("No se pudo iniciar el pago.");
  }catch(e){ console.error(e); alert("Error de conexión con el servidor."); }
}

// ===== Data
async function loadProducts(){
  const grid = $("#grid");
  try{
    const res = await fetch(`${BACKEND_URL}/api/printful/products`, { cache:"no-store" });
    const data = await res.json();
    products = data?.products || [];
    renderProducts();
  }catch(e){
    console.error("❌ Error al cargar productos:", e);
    if (grid) grid.innerHTML = "<p style='color:#c00;font-weight:700'>Error al cargar productos.</p>";
  }
}

function availableColorsOf(p){
  return Object.entries(p.colors||{})
    .filter(([,meta]) => meta && meta.sizes && Object.keys(meta.sizes).length)
    .map(([name]) => name);
}
function sizeNamesOf(p,color){ return Object.keys(p.colors?.[color]?.sizes||{}); }

// ===== Quick View
const QV = {
  el: $("#quickView"),
  backdrop: $("#qvBackdrop"),
  title: $("#qvTitle"),
  img: $("#qvImg"),
  price: $("#qvPrice"),
  colors: $("#qvColors"),
  sizes: $("#qvSizes"),
  add: $("#qvAdd"),
  link: $("#qvLink"),
  sku: null,
  product: null,
  selColor: null,
  selSize: null
};

function openQV(p){
  QV.product = p; QV.sku = p.sku;
  QV.title.textContent = p.name;
  QV.price.textContent = money(p.price);
  QV.link.href = `./producto.html?sku=${encodeURIComponent(p.sku)}`;

  const colors = availableColorsOf(p);
  QV.selColor = colors[0] || null;
  QV.colors.innerHTML = colors.map((c,idx)=>{
    const hex = p.colors[c]?.hex || "";
    const style = hex ? `style="background-color:${hex}"` : `style="background:#eee"`;
    return `<button class="color-circle ${idx===0?"active":""}" data-c="${c}" ${style}></button>`;
  }).join("");
  QV.colors.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      QV.colors.querySelectorAll("button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      QV.selColor = btn.dataset.c;
      drawQVImage(); drawQVSizes(); updateQVBtn();
    });
  });

  drawQVImage();
  drawQVSizes();
  updateQVBtn();

  QV.add.onclick = ()=>{
    const vid = p.colors[QV.selColor].sizes[QV.selSize];
    addToCart({
      sku: `${p.sku}_${QV.selColor}_${QV.selSize}`,
      name: `${p.name} ${QV.selColor} ${QV.selSize}`,
      price: p.price,
      image: QV.img.src,
      variant_id: vid
    });
    closeQV();
    openCart();
  };

  QV.backdrop.classList.add("show");
  QV.el.classList.add("open");
  QV.el.setAttribute("aria-hidden","false");
}
function closeQV(){
  QV.backdrop.classList.remove("show");
  QV.el.classList.remove("open");
  QV.el.setAttribute("aria-hidden","true");
}
function drawQVImage(){
  const p = QV.product;
  const url = p.colors?.[QV.selColor]?.image || p.image;
  QV.img.src = url;
  QV.img.alt = `${p.name} - ${QV.selColor}`;
}
function drawQVSizes(){
  const p = QV.product;
  const sizes = sizeNamesOf(p, QV.selColor);
  QV.selSize = sizes[0] || null;
  QV.sizes.innerHTML = sizes.map((sz,idx)=>`
    <button class="option-btn ${idx===0?"active":""}" data-sz="${sz}">${sz}</button>
  `).join("");
  QV.sizes.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      QV.sizes.querySelectorAll("button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      QV.selSize = btn.dataset.sz;
      updateQVBtn();
    });
  });
}
function updateQVBtn(){
  const p = QV.product;
  const can = !!(QV.selColor && QV.selSize && p.colors?.[QV.selColor]?.sizes?.[QV.selSize]);
  QV.add.disabled = !can;
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
    const colors = availableColorsOf(p);
    const firstColor = colors[0] || null;

    const card=document.createElement("div");
    card.className="card";
    const href = `./producto.html?sku=${encodeURIComponent(p.sku)}`;
    card.innerHTML=`
      <a class="card-img-wrap" href="${href}" aria-label="Ver ${p.name}">
        <img class="card-img" src="${ (firstColor && p.colors[firstColor].image) || p.image }" alt="${p.name}">
      </a>
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">${money(p.price)}</p>
        <div class="stock-line"><span class="stock-badge ok">En stock</span></div>

        <div class="options color-selector" role="group" aria-label="Colores">
          ${colors.map((cn,idx)=>`
            <button class="color-circle ${idx===0?"active":""}" title="${cn}" data-color="${cn}" style="background-color:${p.colors[cn]?.hex || "#ddd"};"></button>
          `).join("")}
        </div>

        <div class="options" role="group" aria-label="Tallas" data-sizes></div>

        <div style="display:flex; gap:8px">
          <a class="btn btn-alt" href="${href}">Ver ficha</a>
          <button class="btn add-btn" data-sku="${p.sku}">Añadir</button>
          <button class="btn btn-alt" data-qv>Vista rápida</button>
        </div>
      </div>
    `;

    const imgEl = card.querySelector(".card-img");
    const sizesWrap = card.querySelector("[data-sizes]");
    let selectedColor = firstColor;
    let selectedSize = selectedColor ? Object.keys(p.colors[selectedColor].sizes)[0] : null;

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

    // Add to cart (desde card)
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

    // Quick View
    card.querySelector("[data-qv]").addEventListener("click", ()=> openQV(p));

    grid.appendChild(card);
  });

  updateActiveNavLink();
  updateBreadcrumbsSchema();
}

function updateActiveNavLink(){
  const cat = getActiveCategory();
  $$("#main-nav a").forEach(a=>{
    const href = a.getAttribute("href") || "";
    const match = href.startsWith("#c/") ? href.slice(3) : "";
    a.classList.toggle("active", cat!=="all" && match===cat);
  });
}

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

// ===== Init
document.addEventListener("DOMContentLoaded", async ()=>{
  setYear();
  await loadProducts();
  renderCart();

  $("#goCatalog")?.addEventListener("click",(e)=>{ e.preventDefault(); $("#catalogo")?.scrollIntoView({behavior:"smooth"}); });
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#qvBackdrop")?.addEventListener("click", closeQV);
  $("#qvClose")?.addEventListener("click", closeQV);
  $("#clearCart")?.addEventListener("click", clearCart);
  $("#checkoutBtn")?.addEventListener("click", goCheckout);

  window.addEventListener("hashchange", ()=>{ renderProducts(); updateActiveNavLink(); });
  updateActiveNavLink();
});