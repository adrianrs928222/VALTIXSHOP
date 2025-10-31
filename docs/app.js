const BACKEND_URL = "https://valtixshop.onrender.com";

const $ = s => document.querySelector(s);
const grid = $("#grid");
let products = [];
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

const money = n => `${Number(n).toFixed(2)} €`;
const setFade = (img, on=true)=> img && img.classList.toggle("img-fade", !!on);

// ====== Fetch productos (agrupados + mockups por color) ======
async function loadProducts(){
  const r = await fetch(`${BACKEND_URL}/api/printful/products?refresh=1`, { cache:"no-store" });
  const d = await r.json();
  products = Array.isArray(d.products) ? d.products : [];
  renderGrid();
}

// ====== Render catálogo ======
function renderGrid(){
  if(!products.length){ grid.innerHTML = `<p style="color:#777">Sin productos.</p>`; return; }
  grid.innerHTML = "";
  products.forEach(p=>{
    const firstColor = Object.keys(p.colors||{})[0];
    const img = (firstColor && p.colors[firstColor]?.image) || p.image;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-img-wrap"><img class="card-img" src="${img}" alt="${p.name}"></div>
      <div class="card-body">
        <h3 class="card-title">${p.name}</h3>
        <p class="card-price">${money(p.price)}</p>
        <div class="options color-selector" role="group" aria-label="Colores">
          ${Object.entries(p.colors||{}).map(([cn,meta],idx)=>`
            <button class="color-circle ${idx===0?"active":""}" title="${cn}"
              data-color="${cn}" style="background-color:${meta.hex||"#ddd"};"></button>
          `).join("")}
        </div>
        <div class="options sizes" role="group" aria-label="Tallas"></div>
        <div class="grid-2" style="margin-top:8px">
          <button class="btn qv-btn">Añadir al carrito</button>
          <button class="btn btn-alt share-btn">Compartir</button>
        </div>
      </div>
    `;

    const imgEl = card.querySelector(".card-img");
    const colorsMap = p.colors || {};
    let selectedColor = firstColor;
    let selectedSize = Object.keys(colorsMap[firstColor]?.sizes||{})[0] || null;

    // pintar tallas
    const sizesWrap = card.querySelector(".sizes");
    const renderSizes = ()=>{
      const sizeEntries = Object.keys(colorsMap[selectedColor]?.sizes||{});
      sizesWrap.innerHTML = sizeEntries.map(sz=>`
        <button class="option-btn ${sz===selectedSize?"active":""}" data-sz="${sz}">${sz}</button>
      `).join("");
      sizesWrap.querySelectorAll(".option-btn").forEach(btn=>{
        btn.onclick = ()=>{ 
          sizesWrap.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
          btn.classList.add("active");
          selectedSize = btn.dataset.sz;
        };
      });
    };
    renderSizes();

    // cambia mockup al elegir color
    card.querySelectorAll(".color-circle").forEach(btn=>{
      btn.onclick = ()=>{
        card.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedColor = btn.dataset.color;

        const newSrc = colorsMap[selectedColor]?.image || p.image;
        setFade(imgEl, true);
        imgEl.src = newSrc;
        imgEl.onload = ()=> setFade(imgEl, false);

        // primera talla del nuevo color
        selectedSize = Object.keys(colorsMap[selectedColor]?.sizes||{})[0] || null;
        renderSizes();
      };
    });

    // Quick View
    card.querySelector(".qv-btn").onclick = ()=> buildAndOpenQV(p);
    card.querySelector(".card-img-wrap").onclick = ()=> buildAndOpenQV(p);
    card.querySelector(".card-title").onclick = ()=> buildAndOpenQV(p);

    // Compartir
    card.querySelector(".share-btn").onclick = async ()=>{
      const slug = p.slug || (p.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+p.id);
      const url = `${location.origin}${location.pathname}#p/${slug}`;
      try{ await navigator.clipboard.writeText(url); alert("Enlace copiado ✅"); }
      catch{ prompt("Copia el enlace:", url); }
    };

    grid.appendChild(card);
  });
}

// ====== Quick View ======
function buildAndOpenQV(p){
  const m = $("#qvModal"), b = $("#qvBackdrop");
  const img = $("#qvImg"), name=$("#qvName"), price=$("#qvPrice");
  const wrapC=$("#qvColors"), wrapS=$("#qvSizes"), add=$("#qvAdd"), share=$("#qvShare");

  name.textContent = p.name;
  price.textContent = money(p.price);

  const colorsMap = p.colors || {};
  const colorNames = Object.keys(colorsMap);
  let selectedColor = colorNames[0] || null;
  let selectedSize  = selectedColor ? Object.keys(colorsMap[selectedColor].sizes||{})[0] : null;

  const setImg = (src)=>{ setFade(img, true); img.src = src; img.onload = ()=> setFade(img, false); };
  setImg((selectedColor && colorsMap[selectedColor]?.image) || p.image);

  // colores
  wrapC.innerHTML = colorNames.map((cn,idx)=>`
    <button class="color-circle ${idx===0?"active":""}" data-color="${cn}"
      title="${cn}" style="background-color:${colorsMap[cn].hex||"#ddd"};"></button>
  `).join("");
  wrapC.querySelectorAll(".color-circle").forEach(btn=>{
    btn.onclick = ()=>{
      wrapC.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      selectedColor = btn.dataset.color;
      setImg(colorsMap[selectedColor]?.image || p.image);
      const firstSz = Object.keys(colorsMap[selectedColor].sizes||{})[0] || null;
      selectedSize = firstSz;
      renderSizes();
      updateAdd();
    };
  });

  // tallas
  function renderSizes(){
    const sizes = Object.keys(colorsMap[selectedColor]?.sizes||{});
    wrapS.innerHTML = sizes.map(sz=>`
      <button class="option-btn ${sz===selectedSize?"active":""}" data-sz="${sz}">${sz}</button>
    `).join("");
    wrapS.querySelectorAll(".option-btn").forEach(btn=>{
      btn.onclick = ()=>{
        wrapS.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        selectedSize = btn.dataset.sz;
        updateAdd();
      };
    });
  }
  renderSizes();

  function updateAdd(){ add.disabled = !(selectedColor && selectedSize); }
  updateAdd();

  add.onclick = ()=>{
    const vid = colorsMap[selectedColor].sizes[selectedSize];
    addToCart({
      sku: `${p.sku}_${selectedColor}_${selectedSize}`,
      name: `${p.name} ${selectedColor} ${selectedSize}`,
      price: p.price,
      image: colorsMap[selectedColor]?.image || p.image,
      variant_id: vid,
      qty: 1
    });
    closeQV();
  };

  share.onclick = async ()=>{
    const slug = p.slug || (p.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+p.id);
    const url = `${location.origin}${location.pathname}#p/${slug}`;
    try{ await navigator.clipboard.writeText(url); alert("Enlace copiado ✅"); }
    catch{ prompt("Copia el enlace:", url); }
  };

  $("#qvClose").onclick = closeQV;
  b.onclick = closeQV;
  openQV();
}

function openQV(){ $("#qvBackdrop").classList.add("show"); $("#qvModal").classList.add("open"); }
function closeQV(){ $("#qvBackdrop").classList.remove("show"); $("#qvModal").classList.remove("open"); }

// ====== Carrito básico ======
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); }
function addToCart(item){
  const idx = cart.findIndex(i=>i.sku===item.sku && i.variant_id===item.variant_id);
  if (idx>=0) cart[idx].qty += item.qty || 1;
  else cart.push({ ...item, qty: item.qty||1 });
  saveCart();
  alert("Añadido al carrito ✅");
}

// ====== Init ======
document.addEventListener("DOMContentLoaded", loadProducts);