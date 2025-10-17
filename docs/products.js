// products.js
// VALTIX — 1 producto por categoría con tallas (variant_map)
// ✅ IMPORTANTE: los variant_id deben ir en STRING.
// ⚠️ CAMBIAR los que estén marcados como EJEMPLO por tus IDs reales de Printful.

window.products = [
  // CAMISETAS (EJEMPLO: sustituye por tus IDs reales)
  {
    id: "tee-white-180",
    name: "Camiseta Premium Blanca 180g",
    price: 29.99,
    image: "https://via.placeholder.com/800x800.png?text=Camiseta+VALTIX+Blanca",
    sku: "tee_white_180",
    categories: ["camisetas"],
    variant_map: {
      "S":   "1111111001", // ⚠️ EJEMPLO
      "M":   "1111111002", // ⚠️ EJEMPLO
      "L":   "1111111003", // ⚠️ EJEMPLO
      "XL":  "1111111004", // ⚠️ EJEMPLO
      "XXL": "1111111005"  // ⚠️ EJEMPLO
    }
  },

  // SUDADERAS (REAL: IDs de Printful ya configurados)
  {
    id: "hoodie-black-classic",
    name: "Sudadera Negra Logo Amarillo",
    price: 49.99,
    image: "https://i.postimg.cc/k5ZGwR5W/producto1.png",
    sku: "Sudadera Negra Logo Amarillo",
    categories: ["sudaderas"],
    variant_map: {
      "S":  "68f207f94459f3",
      "M":  "68f207f9445a96",
      "L":  "68f207f9445b22",
      "XL": "68f207f9445ba2"
      // añade "2XL": "xxxxxxxxxxxxxx" si la tienes
    }
  },

  // PANTALONES (EJEMPLO)
  {
    id: "pants-black-elegant",
    name: "Pantalón Negro Elegante",
    price: 39.99,
    image: "https://via.placeholder.com/800x800.png?text=Pantalon+VALTIX+Negro",
    sku: "pants_black_elegant",
    categories: ["pantalones"],
    variant_map: {
      "S":  "3333333001", // ⚠️ EJEMPLO
      "M":  "3333333002", // ⚠️ EJEMPLO
      "L":  "3333333003", // ⚠️ EJEMPLO
      "XL": "3333333004"  // ⚠️ EJEMPLO
    }
  },

  // ZAPATOS (EJEMPLO)
  {
    id: "sneaker-black-min",
    name: "Zapatillas Minimal Negras",
    price: 59.99,
    image: "https://via.placeholder.com/800x800.png?text=Zapatillas+VALTIX+Negras",
    sku: "sneaker_black_min",
    categories: ["zapatos"],
    variant_map: {
      "EU40": "4444444040", // ⚠️ EJEMPLO
      "EU41": "4444444041", // ⚠️ EJEMPLO
      "EU42": "4444444042", // ⚠️ EJEMPLO
      "EU43": "4444444043"  // ⚠️ EJEMPLO
    }
  },

  // ACCESORIOS (EJEMPLO)
  {
    id: "cap-logo-black",
    name: "Gorra VALTIX Logo",
    price: 19.99,
    image: "https://via.placeholder.com/800x800.png?text=Gorra+VALTIX",
    sku: "cap_valtix_logo_black",
    categories: ["accesorios"],
    variant_map: {
      "Única": "5555555001" // ⚠️ EJEMPLO
    }
  }
];
