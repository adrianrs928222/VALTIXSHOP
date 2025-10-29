const BACKEND_URL = "https://valtixshop.onrender.com";
const $ = s => document.querySelector(s);

function money(n){return `${Number(n).toFixed(2)} €`;}

document.addEventListener("DOMContentLoaded", async () => {
  const sku = new URL(location).searchParams.get("sku");
  if (!sku) { location.href="./"; return; }

  const r = await fetch(`${BACKEND_URL}/api/printful/product?sku=${sku}`,{cache:"no-store"});
  const data = await r.json();
  const p = data?.product;
  if (!p) return alert("Producto no encontrado.");

  $("#pName").textContent = p.name;
  $("#pSku").textContent = `SKU ${p.sku}`;
  $("#pPrice").textContent = money(p.price);

  // Colores
  const colors = Object.keys(p.colors || {});
  let selColor = colors[0];
  const cw = $("#colorWrap");
  cw.innerHTML = colors.map((c,i)=>{
    const hex=p.colors[c]?.hex||"#ddd";
    return `<button class="color-circle ${!i?"active":""}" data-c="${c}" style="background:${hex}" title="${c}"></button>`;
  }).join("");
  $("#pColor").textContent = selColor;

  // Tallas
  const sw = $("#sizeWrap");
  function buildSizes() {
    const sizes = Object.keys(p.colors[selColor]?.sizes||{});
    sw.innerHTML = sizes.map((sz,i)=>
      `<button class="option-btn ${!i?"active":""}" data-sz="${sz}">${sz}</button>`).join("");
  }
  buildSizes();

  cw.querySelectorAll(".color-circle").forEach(btn=>{
    btn.addEventListener("click",()=>{
      cw.querySelectorAll(".color-circle").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      selColor=btn.dataset.c;
      $("#pColor").textContent=selColor;
      buildSizes();
      updateImage();
    });
  });

  // Galería
  const main=$("#mainImg"), thumbs=$("#thumbs");
  function updateImage(){
    const img=p.colors[selColor]?.image||p.image;
    main.src=img;
    thumbs.innerHTML=`<img src="${img}" class="active" loading="lazy">`;
  }
  updateImage();

  // Añadir al carrito
  $("#addBtn").disabled=false;
  $("#addBtn").addEventListener("click",()=>{
    const selSize = sw.querySelector(".option-btn.active")?.dataset.sz;
    const vid = p.colors[selColor].sizes[selSize];
    alert(`Añadido al carrito:\n${p.name} - ${selColor} (${selSize})`);
  });
});