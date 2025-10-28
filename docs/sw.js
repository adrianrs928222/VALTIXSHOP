const CACHE = "valtix-v1";
self.addEventListener("install", e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll([
      "./",
      "./index.html",
      "./style.css",
      "./product.js",
      "./images.json",
      "./producto.html"
    ]))
  );
});
self.addEventListener("fetch", e=>{
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});