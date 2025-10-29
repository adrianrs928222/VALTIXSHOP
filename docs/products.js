// ============================================================
// VALTIX – Ficha de producto (SKU) sincronizada con Printful
// ============================================================
const BACKEND_URL = "https://valtixshop.onrender.com";

const $  = s => document.querySelector(s);
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

function money(n){ return `${Number(n).toFixed(2)} €`; }
function getSku(){ const u=new URL(location.href); return u.searchParams.get("sku"); }
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
function subtotal(){ return cart.reduce((s,i)=> s + (Number(i.price)*i.qty), 0); }
function renderCart(){
  const count = cart.reduce((s,i)=>s+i.qty,0);
  const countEl=$("#cartCount"); if(countEl) countEl.textContent=count;
  const box=$("#cartItems"); if(!box) return;
  box.innerHTML="";
  if(!cart.length){ box.innerHTML=`<p style="color:#666">Tu carrito está vacío.</p>`; }
  else{
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

function buildGallery(imgs){
  const mainImg = $("#mainImg"); const thumbs=$("#thumbs");
  mainImg.src = imgs[0] || ""; mainImg.alt = "Imagen principal del producto";
  thumbs.innerHTML = imgs.map((u,i)=>`<img src="${u}" data-idx="${i}" class="${i===0?"active":""}" alt="Vista ${i+1}">`).join("");
  thumbs.querySelectorAll("img").forEach(img=>{
    img.addEventListener("click", ()=>{
      thumbs.querySelectorAll("img").forEach(i=>i.classList.remove("active"));
      img.classList.add("active"); mainImg.src = img.src;
    });
  });
}

function availableColorsOf(p){
  return Object.entries(p.colors||{})
    .filter(([,meta]) => meta && meta.sizes && Object.keys(meta.sizes).length)
    .map(([name]) => name);
}
function sizeNamesOf(p, color){ return Object.keys(p.colors?.[color]?.sizes||{}); }

function renderProduct(p){
  $("#pName").textContent = p.name;
  $("#pPrice").textContent = money(p.price);

  const colorsPF = availableColorsOf(p);
  let selColor = colorsPF[0] || null;
  let selSize  = selColor ? sizeNamesOf(p, selColor)[0] : null;

  const cw = $("#colorWrap");
  cw.innerHTML = colorsPF.map((c,idx)=>`
    <button class="color-circle ${idx===0?"active":""}" title="${c}" data-color="${c}" style="background-color:${p.colors[c]?.hex || "#ddd"}"></button>
  `).join("");
  cw.querySelectorAll(".color-circle").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      cw.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      selColor = btn.dataset.color;
      const imgs = (p.colors[selColor]?.images||[]);
      buildGallery(imgs.length?imgs:[p.colors[selColor]?.image || p.image].filter(Boolean));
      buildSizes();
      updateBtn();
    });
  });

  const sw = $("#sizeWrap");
  function buildSizes(){
    const sizes = sizeNamesOf(p, selColor);
    selSize = sizes[0] || null;
    sw.innerHTML = sizes.map((sz,idx)=>`
      <button class="option-btn ${idx===0?"active":""}" data-sz="${sz}">${sz}</button>
    `).join("");
    sw.querySelectorAll(".option-btn").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        sw.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selSize = btn.dataset.sz; updateBtn();
      });
    });
  }

  function updateBtn(){
    const can = !!(selColor && selSize && p.colors?.[selColor]?.sizes?.[selSize]);
    $("#addBtn").disabled = !can;
  }

  // Inicial
  const initImgs = (p.colors[selColor]?.images||[]);
  buildGallery(initImgs.length?initImgs:[p.colors[selColor]?.image || p.image].filter(Boolean));
  buildSizes(); updateBtn();

  $("#addBtn").addEventListener("click", ()=>{
    if(!(selColor && selSize)) return;
    const vid = p.colors[selColor].sizes[selSize];
    addToCart({
      sku: `${p.sku}_${selColor}_${selSize}`,
      name: `${p.name} ${selColor} ${selSize}`,
      price: p.price,
      image: $("#mainImg").src,
      variant_id: vid
    });
    openCart();
  });
}

async function loadAndRender(){
  const sku = getSku();
  if(!sku){ alert("SKU no especificado"); return; }
  document.title = `VALTIX – Ficha de Producto`;

  let products = [];
  try{
    const res = await fetch(`${BACKEND_URL}/api/printful/products?refresh=1`, { cache:"no-store" });
    const data = await res.json();
    products = data?.products || [];
  }catch(e){ console.error(e); }

  const p = products.find(x => String(x.sku) === String(sku));
  if(!p){ document.body.innerHTML = "<div class='container' style='padding:40px'>Producto no encontrado.</div>"; return; }

  renderProduct(p);

  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#drawerBackdrop")?.addEventListener("click", closeCart);
  $("#clearCart")?.addEventListener("click", ()=>{ cart=[]; saveCart(); });
  $("#checkoutBtn")?.addEventListener("click", async ()=>{
    if(!cart.length) return alert("Tu carrito está vacío.");
    const items = cart.map(i=>({ variant_id:i.variant_id, quantity:i.qty, sku:i.sku, name:i.name, price:Number(i.price) }));
    try{
      const res = await fetch(`${BACKEND_URL}/checkout`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ items }) });
      const data = await res.json();
      if(data?.url) window.location.href = data.url; else alert("No se pudo iniciar el pago.");
    }catch(e){ console.error(e); alert("Error de conexión con el servidor."); }
  });
  renderCart();
}

document.addEventListener("DOMContentLoaded", loadAndRender);