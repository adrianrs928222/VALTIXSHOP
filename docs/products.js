// products.js
// VALTIX — catálogo con vistas múltiples e imágenes locales

window.products = [
  {
    id: "sudadera-valtix",
    name: "Sudadera Valtix Edition",
    price: 36.50,
    sku: "sudadera_valtix_black",
    categories: ["sudaderas"],
    colors: {
      "Negra": {
        image: "./img/sudadera_front.jpg",
        side_image: "./img/sudadera_side.jpg",
        url: "https://adrianrs928222.github.io/VALTIXSHOP/#producto/sudadera-black",
        sizes: {
          "S": "68f8b9bca9496",
          "M": "68f8b9bca9441",
          "L": "68f8b9bca9475",
          "XL": "68f8b9bca94a1",
          "2XL": "68f8b9bca94c2"
        }
      }
    }
  },

  {
    id: "camiseta-premium",
    name: "Camiseta Premium Blanca",
    price: 29.99,
    sku: "tee_white_180",
    categories: ["camisetas"],
    colors: {
      "Blanca": {
        image: "./img/camiseta_front.jpg",
        side_image: "./img/camiseta_side.jpg",
        url: "https://adrianrs928222.github.io/VALTIXSHOP/#producto/camiseta-blanca",
        sizes: {
          "S": 1111111001,
          "M": 1111111002,
          "L": 1111111003,
          "XL": 1111111004,
          "XXL": 1111111005
        }
      }
    }
  }
];