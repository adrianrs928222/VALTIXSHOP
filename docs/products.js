// products.js
// VALTIX — sincronización completa con Printful.
// Carga todos los productos directamente desde tu backend conectado a Printful.

(async function () {
  const BACKEND_URL = "https://valtixshop.onrender.com";
  const grid = document.querySelector("#grid");

  try {
    const res = await fetch(`${BACKEND_URL}/api/printful/products`);
    const data = await res.json();

    if (!data?.products?.length) {
      grid.innerHTML = `<p style="color:#666">No hay productos sincronizados desde Printful.</p>`;
      return;
    }

    window.products = data.products;
    console.log(`✅ ${data.products.length} productos cargados desde Printful`);
  } catch (err) {
    console.error("❌ Error al cargar productos de Printful:", err);
    grid.innerHTML = `<p style="color:#666">Error al conectar con Printful.</p>`;
  }
})();