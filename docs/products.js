// ===== Config
const BACKEND_URL = "https://valtixshop.onrender.com";
const $ = s => document.querySelector(s);

// ===== Carrito (igual catálogo)
let cart = JSON.parse(localStorage.getItem("cart") || "[]");
function money(n){ return `${Number(n).toFixed(2)} €`; }
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }
function addToCart(i){ const k=cart.findIndex(x=>x.sku===i.sku&&x.variant_id===i.variant_id); if(k>=0) cart[k].qty++; else cart.push({...i,qty:1}); saveCart();}
function changeQty(sku,id,d){const i=cart.find(x=>x.sku===sku&&x.variant_id===id); if(!i)return; i.qty+=d; if(i.qty<=0) cart=cart.filter(x=>x!==i); saveCart();}
function subtotal(){return cart.reduce((s,i)=>s+i.price*i.qty,0);}
function renderCart(){
  const c=cart.reduce((s,i)=>s+i.qty,0); $("#cartCount").textContent=c;
  const box=$("#cartItems"); if(!box) return;
  box.innerHTML=cart.map(i=>`
    <div class="drawer-item">
      <img src="${i.image}" alt="${i.name}">
      <div style="flex:1">
        <div style="font-weight:700">${i.name}</div>
        <div class="qty"><button>-</button><span>${i.qty}</span><button>+</button></div>
        <div style="color:#666">${money(i.price)}</div>
      </div>
    </div>`).join("") || "<p>Tu carrito está vacío.</p>";
  $("#subtotal").textContent=money(subtotal());
}
function openCart(){ $("#drawerBackdrop").classList.add("show"); $("#cartDrawer").classList.add("open"); renderCart(); }
function closeCart(){ $("#drawerBackdrop").classList.remove("show"); $("#cartDrawer").classList.remove("open"); }

// ===== Util
const colorNamesOf = p => Object.keys(p.colors||{});
const sizeNamesOf  = (p,c) => Object.keys(p.colors?.[c]?.sizes||{});

// ===== SEO helpers
function setMeta(id, val){ const el=document.getElementById(id); if(el) el.setAttribute(el.tagName.startsWith("META")?"content":"content", val); }
function updateSEO(p, imgUrl){
  const url = location.href;
  const title = `${p.name} – VALTIX`;
  const desc  = `Compra ${p.name} de VALTIX. Envíos a toda Europa en pedidos superiores a 60€`;

  // OG / Twitter
  const set = (id,v)=>{ const el = document.getElementById(id); if(!el) return; el.setAttribute("content", v); };
  set("ogTitle", title); set("ogDesc", desc); set("ogImage", imgUrl||p.image); set("ogUrl", url);
  set("twTitle", title); set("twDesc", desc); set("twImage", imgUrl||p.image);
  document.title = title;

  // JSON-LD
  const offer = {
    "@type":"Offer", "priceCurrency":"EUR", "price": String(p.price.toFixed(2)),
    "availability":"http://schema.org/InStock", "url": url
  };
  const jsonld = {
    "@context":"https://schema.org", "@type":"Product",
    "name": p.name, "sku": p.sku, "image": [imgUrl||p.image],
    "description": desc, "brand": { "@type":"Brand", "name":"VALTIX" }, "offers": offer
  };
  const s = document.getElementById("jsonld-product");
  if (s) s.textContent = JSON.stringify(jsonld);
}

// ===== Render ficha
function renderProduct(p){
  $("#pName").textContent = p.name;
  $("#pPrice").textContent = money(p.price);
  $("#pSku").textContent   = `SKU ${p.sku || p.id || "-"}`;

  let colors = colorNamesOf(p);
  if (!colors.length) colors = ["Único"];
  let selColor = colors[0] || "Único";
  let selSize  = sizeNamesOf(p, selColor)[0] || Object.keys(p.colors?.[selColor]?.sizes||{Única:null})[0];

  // Colores
  const cw=$("#colorWrap");
  cw.innerHTML = colors.length>1
    ? colors.map((c,i)=>`<button class="color-circle ${i?"":"active"}" data-c="${c}" style="background-color:${p.colors[c]?.hex||"#ddd"}" title="${c}"></button>`).join("")
    : `<span class="stock-badge">Color único</span>`;
  $("#pColor").textContent = selColor;

  // Tallas
  const sw=$("#sizeWrap");
  function buildSizes(){
    const sizes = sizeNamesOf(p, selColor);
    if (!sizes.length){ sw.innerHTML = `<span class="stock-badge">Talla única</span>`; return; }
    selSize = sizes[0];
    sw.innerHTML = sizes.map((sz,i)=>`<button class="option-btn ${i?"":"active"}" data-sz="${sz}">${sz}</button>`).join("");
    sw.querySelectorAll(".option-btn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        sw.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selSize = btn.dataset.sz; updateAddBtn();
      });
    });
  }

  // Galería (simple pero sólida)
  const mainImg=$("#mainImg"), thumbs=$("#thumbs");
  function buildGallery(){
    const url = p.colors?.[selColor]?.image || p.image;
    mainImg.src = url; mainImg.alt = `${p.name} - ${selColor}`;
    updateSEO(p, url);
    thumbs.innerHTML = `<img src="${url}" class="active" alt="Vista 1" loading="lazy">`;
  }

  function updateAddBtn(){
    const can = !!(p.colors?.[selColor]?.sizes?.[selSize]);
    $("#addBtn").disabled = !can;
  }

  // Eventos color
  cw.querySelectorAll(".color-circle").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      cw.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      selColor = btn.dataset.c;
      $("#pColor").textContent = selColor;
      buildSizes(); buildGallery(); updateAddBtn();
    });
  });

  // Inicializa
  buildSizes(); buildGallery(); updateAddBtn();

  // Añadir al carrito
  $("#addBtn").addEventListener("click", ()=>{
    const vid = p.colors?.[selColor]?.sizes?.[selSize];
    if(!vid) return;
    addToCart({
      sku: `${p.sku}_${selColor}_${selSize}`,
      name: `${p.name} ${selColor} ${selSize}`,
      price: p.price,
      image: $("#mainImg").src,
      variant_id: vid
    });
    openCart();
  });

  // Carrito
  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", ()=>{ cart=[]; saveCart(); });
  $("#checkoutBtn")?.addEventListener("click", async ()=>{
    if(!cart.length) return alert("Tu carrito está vacío.");
    const items = cart.map(i=>({ variant_id:i.variant_id, quantity:i.qty, sku:i.sku, name:i.name, price:Number(i.price) }));
    const res = await fetch(`${BACKEND_URL}/checkout`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ items })});
    const data = await res.json(); if(data?.url) location.href=data.url;
  });
  renderCart();
}

// ===== Load
async function loadProduct(){
  const sku=new URL(location).searchParams.get("sku");
  if(!sku){ location.href="./"; return; }
  try{
    const r=await fetch(`${BACKEND_URL}/api/printful/product?sku=${encodeURIComponent(sku)}`,{cache:"no-store"});
    if(!r.ok) throw 0;
    const {product}=await r.json();
    renderProduct(product);
  }catch(e){
    const r2=await fetch(`${BACKEND_URL}/api/printful/products`,{cache:"no-store"});
    const data=await r2.json();
    const p=(data?.products||[]).find(x=>String(x.sku)===String(sku));
    if(p) renderProduct(p); else alert("Producto no encontrado");
  }
}
document.addEventListener("DOMContentLoaded", loadProduct);