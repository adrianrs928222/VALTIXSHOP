// app.js actualizado completo

// Año actual en el footer const year = new Date().getFullYear(); document.getElementById("year").textContent = year;

// Menú hamburguesa const menuToggle = document.getElementById("menuToggle"); const navMenu = document.getElementById("navMenu"); menuToggle?.addEventListener("click", () => { navMenu.classList.toggle("show"); });

// Carrito drawer const cartDrawer = document.getElementById("cartDrawer"); const openCart = document.getElementById("openCart"); const closeCart = document.getElementById("closeCart"); const drawerBackdrop = document.getElementById("drawerBackdrop");

function toggleDrawer(open) { cartDrawer.setAttribute("aria-hidden", !open); cartDrawer.classList.toggle("open", open); drawerBackdrop.classList.toggle("show", open); }

openCart?.addEventListener("click", () => toggleDrawer(true)); closeCart?.addEventListener("click", () => toggleDrawer(false)); drawerBackdrop?.addEventListener("click", () => toggleDrawer(false));

// Navegación interna desde botón CTA const goCatalog = document.getElementById("goCatalog"); goCatalog?.addEventListener("click", (e) => { e.preventDefault(); document.getElementById("catalogo").scrollIntoView({ behavior: "smooth" }); });

// Promo animada const promoText = document.querySelector(".promo-text"); if (promoText) { const mensajes = [ "🔥 ENVÍOS GRATIS desde 60€", "🚀 NUEVA COLECCIÓN YA DISPONIBLE", "💳 Compra segura con Stripe", "🌍 Envíos internacionales" ]; let i = 0; setInterval(() => { promoText.textContent = mensajes[i]; i = (i + 1) % mensajes.length; }, 8000); }

// Renderizado de productos desde products.js if (typeof products !== 'undefined') { const grid = document.getElementById("grid"); const cartItems = document.getElementById("cartItems"); const subtotal = document.getElementById("subtotal"); const cartCount = document.getElementById("cartCount"); const clearCart = document.getElementById("clearCart");

let cart = [];

function renderProducts() { grid.innerHTML = ""; products.forEach((product, index) => { const card = document.createElement("div"); card.className = "card"; card.innerHTML = <img src="${product.img}" alt="${product.name}" class="card-img" /> <div class="card-body"> <h4 class="card-title">${product.name}</h4> <p class="card-price">${product.price.toFixed(2)} €</p> <div class="options"> ${product.sizes.map(size =><button class="option-btn">${size}</button>).join('')} </div> <button class="btn add-to-cart" data-index="${index}">Añadir al carrito</button> </div> ; grid.appendChild(card); }); }

function renderCart() { cartItems.innerHTML = ""; let total = 0; cart.forEach((item, i) => { total += item.price; const el = document.createElement("div"); el.className = "drawer-item"; el.innerHTML = <img src="${item.img}" alt="${item.name}" /> <div> <strong>${item.name}</strong><br /> <small>${item.price.toFixed(2)} €</small> </div>; cartItems.appendChild(el); }); subtotal.textContent = ${total.toFixed(2)} €; cartCount.textContent = cart.length; }

grid?.addEventListener("click", (e) => { if (e.target.classList.contains("add-to-cart")) { const i = e.target.getAttribute("data-index"); cart.push(products[i]); renderCart(); toggleDrawer(true); } if (e.target.classList.contains("option-btn")) {

