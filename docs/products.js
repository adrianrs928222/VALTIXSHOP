const BACKEND_URL = "https://valtixshop.onrender.com";
const $ = s => document.querySelector(s);
function money(n){ return `${Number(n).toFixed(2)} €`; }
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }
function addToCart(i){ const k=cart.findIndex(x=>x.sku===i.sku&&x.variant_id===i.variant_id); if(k>=0) cart[k].qty++; else cart.push({...i,qty:1}); saveCart();}
function changeQty(sku,id,d){const i=cart.find(x=>x.sku===sku&&x.variant_id===id);if(!i)return;i.qty+=d;if(i.qty<=0)cart=cart.filter(x=>x!==i);saveCart();}
function subtotal(){return cart.reduce((s,i)=>s+i.price*i.qty,0);}
function renderCart(){const c=cart.reduce((s,i)=>s+i.qty,0);$("#cartCount").textContent=c;$("#cartItems").innerHTML=cart.map(i=>`
<div class="drawer-item">
<img src="${i.image}"><div style="flex:1"><b>${i.name}</b>
<div class="qty"><button>-</button><span>${i.qty}</span><button>+</button></div>
<div>${money(i.price)}</div></div></div>`).join("")||"<p>Tu carrito está vacío.</p>";
$("#subtotal").textContent=money(subtotal());
$$(".qty button").forEach((b,_,a)=>{b.addEventListener("click",()=>changeQty(a[1].parentElement.previousElementSibling?.textContent,i.variant_id,b.textContent==="+"?1:-1));});}
function openCart(){ $("#drawerBackdrop").classList.add("show"); $("#cartDrawer").classList.add("open"); renderCart(); }
function closeCart(){ $("#drawerBackdrop").classList.remove("show"); $("#cartDrawer").classList.remove("open"); }

async function loadProduct(){
  const sku=new URL(location).searchParams.get("sku");
  if(!sku)return;
  const r=await fetch(`${BACKEND_URL}/api/printful/product?sku=${sku}`); const {product}=await r.json();
  $("#pName").textContent=product.name; $("#pPrice").textContent=money(product.price);
  const colors=Object.keys(product.colors||{}); let selC=colors[0]; let selS=null;
  const cw=$("#colorWrap"); cw.innerHTML=colors.map((c,i)=>`<button class="color-circle ${i?"":"active"}" data-c="${c}" style="background-color:${product.colors[c].hex||"#ddd"}"></button>`).join("");
  const sw=$("#sizeWrap");
  function drawSizes(){ const s=Object.keys(product.colors[selC].sizes); selS=s[0]; sw.innerHTML=s.map((x,i)=>`<button class="option-btn ${i?"":"active"}" data-s="${x}">${x}</button>`).join(""); }
  drawSizes();
  const img=$("#mainImg"),th=$("#thumbs");
  function drawImg(){const url=product.colors[selC].image||product.image;img.src=url;th.innerHTML=`<img src="${url}" class="active">`;}
  drawImg();
  cw.querySelectorAll(".color-circle").forEach(b=>b.addEventListener("click",()=>{cw.querySelectorAll("button").forEach(x=>x.classList.remove("active"));b.classList.add("active");selC=b.dataset.c;drawSizes();drawImg();}));
  sw.addEventListener("click",e=>{if(e.target.dataset.s){sw.querySelectorAll("button").forEach(x=>x.classList.remove("active"));e.target.classList.add("active");selS=e.target.dataset.s;}});
  $("#addBtn").addEventListener("click",()=>{const vid=product.colors[selC].sizes[selS];addToCart({sku:product.sku,name:`${product.name} ${selC} ${selS}`,price:product.price,image:product.colors[selC].image||product.image,variant_id:vid});openCart();});
}

document.addEventListener("DOMContentLoaded",()=>{loadProduct();$("#openCart").onclick=openCart;$("#closeCart").onclick=closeCart;$("#drawerBackdrop").onclick=closeCart;$("#checkoutBtn").onclick=()=>alert("Stripe listo 💳");});