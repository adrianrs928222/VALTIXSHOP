(function(){
  const $ = (sel, el=document) => el.querySelector(sel);
  const state = { cart: [] };
  const BACKEND = "https://una-tienda1.onrender.com";

  const format = v => "€" + v.toFixed(2);
  const byHashCategory = () => (location.hash.startsWith("#c/") ? location.hash.slice(3) : "");

  function renderGrid() {
    const grid = $("#grid"); grid.innerHTML = "";
    const cat = byHashCategory();
    const items = window.PRODUCTS.filter(p => !cat || p.categories.includes(cat));
    items.forEach(p => {
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <img class="card-img" src="${p.image}" alt="${p.name}" loading="lazy" width="800" height="800" />
        <div class="card-body">
          <h3 class="card-title">${p.name}</h3>
          <p class="card-price">${format(p.price)}</p>
          <button class="btn">Añadir al carrito</button>
        </div>`;
      card.querySelector(".btn").addEventListener("click", () => addToCart(p));
      grid.appendChild(card);
    });
  }

  function addToCart(p) {
    const idx = state.cart.findIndex(x => x.sku === p.sku);
    if (idx >= 0) state.cart[idx].quantity += 1;
    else state.cart.push({ name: p.name, price: p.price, sku: p.sku, image: p.image, quantity: 1 });
    updateCartUI();
  }

  function updateCartUI() {
    $("#cartCount").textContent = state.cart.length;
    const ci = $("#cartItems"); ci.innerHTML = "";
    let subtotal = 0;
    state.cart.forEach(item => {
      subtotal += item.price * item.quantity;
      const row = document.createElement("div");
      row.className = "drawer-item";
      row.innerHTML = `
        <img src="${item.image}" alt="${item.name}" width="64" height="64" loading="lazy"/>
        <div style="flex:1">
          <div style="font-weight:600">${item.name}</div>
          <div style="color:#6b6b6b">${format(item.price)}</div>
          <div class="qty" style="margin-top:8px">
            <button class="dec">−</button>
            <span>${item.quantity}</span>
            <button class="inc">+</button>
            <button class="rm" style="margin-left:auto">Eliminar</button>
          </div>
        </div>`;
      row.querySelector(".dec").onclick = () => { item.quantity = Math.max(1, item.quantity-1); updateCartUI(); };
      row.querySelector(".inc").onclick = () => { item.quantity += 1; updateCartUI(); };
      row.querySelector(".rm").onclick  = () => { state.cart = state.cart.filter(x => x.sku !== item.sku); updateCartUI(); };
      ci.appendChild(row);
    });
    $("#subtotal").textContent = format(subtotal);
    $("#checkoutBtn").disabled = state.cart.length === 0;
  }

  const openDrawer = () => { $("#drawer").classList.add("open"); $("#backdrop").classList.add("show"); };
  const closeDrawer = () => { $("#drawer").classList.remove("open"); $("#backdrop").classList.remove("show"); };
  $("#openCart").onclick = openDrawer;
  $("#closeCart").onclick = closeDrawer;
  $("#backdrop").onclick = closeDrawer;

  $("#checkoutBtn").onclick = async () => {
    try {
      const r = await fetch(BACKEND + "/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: state.cart })
      });
      const data = await r.json();
      if (data && data.url) location.href = data.url;
      else alert("No se pudo iniciar el pago.");
    } catch (e) {
      alert("Error conectando con el servidor.");
    }
  };

  $("#year").textContent = new Date().getFullYear();
  window.addEventListener("hashchange", renderGrid);
  renderGrid();
  updateCartUI();
})();