// VALTIX ─ Productos (1 por categoría) conectados con Printful
// Nota: cambia los variant_id por los tuyos reales de Printful.
// Asegúrate de usar los mismos SKU en tu backend (PRINTFUL_VARIANTS).

const products = [
  {
    id: "tee-white",
    name: "Camiseta Blanca Premium",
    price: 29.99,
    image: "./assets/tee.jpg",              // reemplaza la imagen en /docs/assets/
    sku: "camiseta_blanca_premium",        // <- debe coincidir con el backend
    variant_id: 1234567890,                // <- tu ID de Printful
    categories: ["camisetas"]
  },
  {
    id: "hoodie-black",
    name: "Sudadera Negra con Capucha",
    price: 49.99,
    image: "./assets/hoodie.jpg",
    sku: "sudadera_negra_capucha",
    variant_id: 2234567890,
    categories: ["sudaderas"]
  },
  {
    id: "pants-black",
    name: "Pantalón Negro Elegante",
    price: 39.99,
    image: "./assets/pants.jpg",
    sku: "pantalon_negro_lino",
    variant_id: 3234567890,
    categories: ["pantalones"]
  },
  {
    id: "shoes-black",
    name: "Zapatillas Negras Minimal",
    price: 59.99,
    image: "./assets/shoes.jpg",
    sku: "zapatillas_negras_minimal",
    variant_id: 4234567890,
    categories: ["zapatos"]
  },
  {
    id: "cap-black",
    name: "Gorra Negra VALTIX",
    price: 19.99,
    image: "./assets/cap.jpg",
    sku: "gorra_negra_valtix",
    variant_id: 5234567890,
    categories: ["accesorios"]
  }
];