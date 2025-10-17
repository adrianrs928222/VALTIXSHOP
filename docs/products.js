// products.js
// VALTIX — 1 producto por categoría con tallas (variant_map)
// ⚠️ Sustituye cada número de variant_id por tu ID real de Printful.

window.products = [
  // CAMISETAS
  {
    id: "tee-white-180",
    name: "Camiseta Premium Blanca 180g",
    price: 29.99,
    image: "https://via.placeholder.com/800x800.png?text=Camiseta+VALTIX+Blanca",
    sku: "tee_white_180",
    categories: ["camisetas"],
    // Tallas S–XXL (ejemplo). Cambia los IDs por los tuyos reales:
    variant_map: {
      "S":   1111111001,
      "M":   1111111002,
      "L":   1111111003,
      "XL":  1111111004,
      "XXL": 1111111005
    }
  },

  // SUDADERAS
  {
    id: "hoodie-black-classic",
    name: "Sudadera Negra Logo Amarillo",
    price: 49.99,
    image: "https://via.placeholder.com/800x800.png?text=Sudadera+VALTIX+Negra",
    sku: "Sudadera Negra Logo Amarillo",
    categories: ["sudaderas"],
    variant_map: {
      "S":  68f207f94459f3,
      "M":  68f207f9445a96,
      "L":  68f207f9445b22,
      "XL": 68f207f9445ba2
    }
  },

  // PANTALONES
  {
    id: "pants-black-elegant",
    name: "Pantalón Negro Elegante",
    price: 39.99,
    image: "https://via.placeholder.com/800x800.png?text=Pantalon+VALTIX+Negro",
    sku: "pants_black_elegant",
    categories: ["pantalones"],
    // Si tus pantalones usan letras, deja S–XL; si usan tallas numéricas, cámbialas (por ejemplo 30/32/34…)
    variant_map: {
      "S":  3333333001,
      "M":  3333333002,
      "L":  3333333003,
      "XL": 3333333004
    }
  },

  // ZAPATOS
  {
    id: "sneaker-black-min",
    name: "Zapatillas Minimal Negras",
    price: 59.99,
    image: "https://via.placeholder.com/800x800.png?text=Zapatillas+VALTIX+Negras",
    sku: "sneaker_black_min",
    categories: ["zapatos"],
    // Tallas EU de ejemplo:
    variant_map: {
      "EU40": 4444444040,
      "EU41": 4444444041,
      "EU42": 4444444042,
      "EU43": 4444444043
    }
  },

  // ACCESORIOS
  {
    id: "cap-logo-black",
    name: "Gorra VALTIX Logo",
    price: 19.99,
    image: "https://via.placeholder.com/800x800.png?text=Gorra+VALTIX",
    sku: "cap_valtix_logo_black",
    categories: ["accesorios"],
    // Talla única en accesorios:
    variant_map: {
      "Única": 5555555001
    }
  }
];
