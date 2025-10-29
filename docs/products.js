<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>VALTIX – Ficha de Producto</title>
  <link rel="stylesheet" href="./style.css"/>
</head>
<body>
  <header class="header">
    <div class="container header-inner">
      <a class="brand" href="./" aria-label="Inicio VALTIX">
        <span class="brand-logo">V</span><span class="brand-name">VALTIX</span>
      </a>
      <button id="menu-toggle" class="menu-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="main-nav">☰</button>
      <nav id="main-nav" class="nav" aria-label="Categorías">
        <a href="./#c/camisetas">Camisetas</a>
        <a href="./#c/sudaderas">Sudaderas</a>
        <a href="./#c/pantalones">Pantalones</a>
        <a href="./#c/zapatos">Zapatos</a>
        <a href="./#c/accesorios">Accesorios</a>
      </nav>
      <button id="openCart" class="cart-btn" aria-haspopup="dialog">
        Carrito <span id="cartCount" class="cart-count">0</span>
      </button>
    </div>
  </header>

  <main class="main prod">
    <div class="container prod-inner">
      <section class="gallery" aria-label="Galería de producto">
        <img id="mainImg" class="main-img" alt="Imagen principal del producto">
        <div id="thumbs" class="thumbs"></div>
      </section>

      <section aria-label="Detalles de producto">
        <h1 id="pName">Producto</h1>
        <div id="pPrice" class="card-price" style="font-size:1.1rem;"></div>

        <div class="options color-selector" id="colorWrap" role="group" aria-label="Colores"></div>
        <div class="options" id="sizeWrap" role="group" aria-label="Tallas"></div>

        <button id="addBtn" class="btn" disabled>Añadir al carrito</button>
        <div style="margin-top:12px;color:#666;font-size:.95rem">
          <ul style="margin:8px 0 0 18px">
            <li>Pago seguro con Stripe</li>
            <li>Envío 2–7 días en Europa*</li>
            <li>Devoluciones fáciles</li>
          </ul>
        </div>
      </section>
    </div>
  </main>

  <!-- Drawer carrito (reutilizado) -->
  <div class="drawer-backdrop" id="drawerBackdrop"></div>
  <aside id="cartDrawer" class="drawer" aria-hidden="true" aria-label="Carrito de compra">
    <div class="drawer-header">
      <h3>Tu carrito</h3>
      <button id="closeCart" aria-label="Cerrar carrito">✕</button>
    </div>
    <div id="cartItems" class="drawer-body"></div>
    <div class="drawer-footer">
      <div class="subtotal"><span>Subtotal</span><strong id="subtotal">0,00 €</strong></div>
      <button id="clearCart" class="btn btn-alt">Vaciar carrito</button>
      <button id="checkoutBtn" class="btn">Pagar</button>
    </div>
  </aside>

  <script src="./product.js?v=3" defer></script>
</body>
</html>