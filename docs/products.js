// products.js
// VALTIX — sincronización completa desde Printful vía backend

(async function () {
  const BACKEND_URL = "https://valtixshop.onrender.com";
  const grid = document.querySelector("#grid");

  try {
    const res = await fetch(`${BACKEND_URL}/api/printful/products`);
    const data = await res.json();

    if (!data?.products?.length) {
      window.products = [];
      if (grid) grid.innerHTML = `<p style="color:#666">No hay productos sincronizados desde Printful.</p>`;
      return;
    }

    window.products = data.products;
    // Forzar re-render si app.js ya cargó
    if (typeof renderProducts === "function") renderProducts();
  } catch (err) {
    console.error("❌ Error al cargar productos de Printful:", err);
    window.products = window.products || [];
    if (grid && !window.products.length) {
      grid.innerHTML = `<p style="color:#666">Error al conectar con Printful.</p>`;
    }
  }
})();
