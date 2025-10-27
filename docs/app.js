// app.js
const BACKEND_URL = "https://valtixshop.onrender.com";
const CHECKOUT_PATH = "/checkout";

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

function setYear(){ const y=$("#year"); if (y) y.textContent = new Date().getFullYear(); }
function money(n){ return `${Number(n).toFixed(2)} €`; }
function getActiveCategory(){ const h=location.hash||""; return h.startsWith("#c/") ? decodeURIComponent(h.slice(3)) : "all"; }

function updateBreadcrumbsSchema(){
  const el = $("#breadcrumbs-jsonld"); if(!el) return;
  const base = {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Inicio","item":"https://adrianrs928222.github.io/VALTIXSHOP/"}]};
  const cat = getActiveCategory();
  if (cat!=="all"){
    base.itemListElement.push({"@type":"ListItem","position":2,"name":cat.charAt(0).toUpperCase()+cat.slice(1),"item":`https://adrianrs928222.github.io/VALTIXSHOP/#c/${encodeURIComponent(cat)}`});
  }
  el.textContent = JSON.stringify(base);
}

function swatchHex(name){
  const m = {
    negro:"#000000", black:"#000000", "black heather":"#1f1f1f", gris:"#808080", gray:"#808080", "athletic heather":"#a7a7a7",
    blanco:"#ffffff", white:"#ffffff", navy:"#001f3f", azul:"#0057ff", blue:"#0057ff", royal:"#4169e1", lightblue:"#87cefa",
    red:"#ff0000", rojo:"#ff0000", burgundy:"#800020", maroon:"#800000", pink:"#ffc0cb", fuchsia:"#ff00ff",
    green:"#008000", forest:"#0b3d02", olive:"#556b2f", mint:"#98ff98", yellow:"#ffd700", gold:"#ffd700",
    orange:"#ff7f00", sand:"#c2b280", cream:"#fffdd0", beige:"#f5f5dc", brown:"#5c4033", purple:"#800080", violet:"#8a2be2
  };
  const key = String(name||"").trim().toLowerCase().replace(/\s+/g," ");
  if (m[key]) return m[key];
  const k2 = key.replace(/\/.*$/,"").replace(/\(.+\)/g,"").trim();
  if (m[k2]) return m[k2];
  return null;
}

function renderProducts(){
  const grid=$("#grid"); if(!grid) return;
  grid.innerHTML="";
  if(!Array.isArray(window.products) || !window.products.length){
    grid.innerHTML=`<p style="color:#777">Aún no hay productos disponibles.</p>`;
    return;
  }
  const cat=getActiveCategory();
  const list=(cat==="all") ? products : products.filter(p=>Array.isArray(p.categories)&&p.categories.includes(cat));

  list.forEach(p=>{
    const colors = p.colors || {};
    const colorNames = Object.keys(colors).length ? Object.keys(colors) : ["Color único"];
    let selectedColor = colorNames[0];

    const initialSizes = (selectedColor && colors[selectedColor]?.sizes)
      ? Object.keys(colors[selectedColor].sizes)
      : Object.keys(p.variant_map || {});
    let selectedSize = initialSizes[0] || null;

    const mainImg = (cn)=> (colors[cn]?.image || p.image || "");
    const sideImg = (cn)=> (colors[cn]?.side_image || colors[cn]?.image || p.image || "");

    const card=document.createElement("div");
    card.className="card";
    card.innerHTML=`
      <div class="card-img-wrap">
        <img class="card-img main" src="${mainImg(selectedColor)}" alt="${p.name}">
        <img class="card-img hover" src="${sideImg(selectedColor)}" alt="${p.name}">
      </div>
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">${money(p.price)}</p>
        <div class="stock-line"><span class="stock-badge ok" data-stock>En stock</span></div>
        <div class="options color-selector" role="group" aria-label="Colores">
          ${colorNames.map((cn,idx)=>{
            const hx = swatchHex(cn);
            const img = colors[cn]?.image || "";
            const style = hx ? `background-color:${hx};` : (img ? `background-image:url('${img}');background-size:cover;background-position:center;` : `background:linear-gradient(45deg,#bbb,#eee);`);
            return `<button class="color-circle ${idx===0?"active":""}" title="${cn}" data-color="${cn}" style="${style}"></button>`;
          }).join("")}
        </div>
        <div class="options" role="group" aria-label="Tallas" data-sizes></div>
        <button class="btn add-btn" data-sku="${p.sku}">Añadir al carrito</button>
      </div>
    `;

    const mainEl = card.querySelector(".card-img.main");
    const hoverEl = card.querySelector(".card-img.hover");
    const sizesWrap = card.querySelector("[data-sizes]");

    function renderSizes(){
      const currentSizes = (selectedColor && colors[selectedColor]?.sizes)
        ? Object.keys(colors[selectedColor].sizes)
        : Object.keys(p.variant_map || {});
      selectedSize = currentSizes[0] || null;
      sizesWrap.innerHTML = currentSizes.map((sz,idx)=>`<button class="option-btn ${idx===0?"active":""}" data-sz="${sz}">${sz}</button>`).join("");
      sizesWrap.querySelectorAll(".option-btn").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          sizesWrap.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
          btn.classList.add("active");
          selectedSize = btn.dataset.sz;
        });
      });
    }

    function currentVariantId(){
      if (colors[selectedColor]?.sizes?.[selectedSize]) return colors[selectedColor].sizes[selectedSize];
      if (p?.variant_map && selectedSize && p.variant_map[selectedSize]) return p.variant_map[selectedSize];
      return p.variant_id || null;
    }

    card.querySelectorAll(".color-circle").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        card.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedColor = btn.dataset.color;
        mainEl.src = mainImg(selectedColor);
        hoverEl.src = sideImg(selectedColor);
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
        image: mainImg(selectedColor),
        variant_id: vid
      });
      openCart();
    });

    grid.appendChild(card);
  });

  updateActiveNavLink();
  updateBreadcrumbsSchema();
}

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

document.addEventListener("DOMContentLoaded", ()=>{
  setYear();
  setupHamburger();
  renderProducts();
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