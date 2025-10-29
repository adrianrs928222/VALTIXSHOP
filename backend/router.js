/* ---------- Normalizador robusto: COLORES (HEX) + FOTO POR COLOR + TALLAS ---------- */
function normalizeProduct(detail){
  const sp = detail?.result?.sync_product;
  const variants = detail?.result?.sync_variants || [];

  // precio base
  const prices = variants.map(v=>parseFloat(v.retail_price)).filter(n=>!Number.isNaN(n));
  const price = prices.length ? Math.min(...prices) : 0;

  const cap = s => String(s||"").toLowerCase().replace(/\s+/g," ").replace(/\b\w/g,c=>c.toUpperCase());
  const colors = {}; // {ColorName:{hex,image,sizes:{size:variantId}}}

  // Helper para sacar una buena imagen
  const bestImageFromFiles = (files=[])=>{
    const byType = (t)=> files.find(f => (f?.type||"").toLowerCase()===t && (f.preview_url||f.thumbnail_url||f.url));
    const fromPreview = byType("preview");
    const fromMockup  = byType("mockup"); // por si viniera así
    const anyWithPreview = files.find(f => f.preview_url);
    const anyWithThumb   = files.find(f => f.thumbnail_url);
    const anyWithUrl     = files.find(f => f.url);
    return (
      fromPreview?.preview_url ||
      fromMockup?.preview_url ||
      anyWithPreview?.preview_url ||
      anyWithThumb?.thumbnail_url ||
      anyWithUrl?.url ||
      null
    );
  };

  // 1) Recorremos variantes y consolidamos por color
  for (const v of variants){
    const product = v?.product || {};
    const raw = String(v?.name || "").trim();

    // --- COLOR ---
    let colorName = product.color_name || product.color || "";
    if (!colorName && raw.includes("/")) colorName = raw.split("/")[0].split("-").pop().trim();
    if (!colorName && raw.includes("-")) colorName = raw.split("-").pop().trim();
    if (!colorName) colorName = "Color Único";
    colorName = cap(colorName);

    // --- HEX ---
    let hex = product.hex_code || v?.color_code || v?.color_hex || null;
    if (hex && /^#?[0-9A-Fa-f]{3,6}$/.test(hex)) hex = hex.startsWith("#") ? hex : `#${hex}`;
    if (!hex) hex = colorHexFromName(colorName);

    // --- TALLA ---
    let size = product.size || "";
    if (!size && raw.includes("/")) size = raw.split("/").pop().trim();
    if (!size) size = `VAR_${v.variant_id}`;

    // --- IMAGEN ESPECÍFICA DE LA VARIANTE ---
    const imgFromFiles = bestImageFromFiles(v?.files||[]);
    const fallbackImg = product.image || sp?.thumbnail_url || null;
    const candidateImg = imgFromFiles || fallbackImg;

    if (!colors[colorName]) colors[colorName] = { hex, image: candidateImg, sizes:{} };
    // Si no había imagen para ese color aún, o la nueva es mejor (tiene preview), la ponemos
    if (!colors[colorName].image && candidateImg) colors[colorName].image = candidateImg;

    colors[colorName].sizes[size] = v.variant_id;
  }

  // 2) Relleno: si algún color quedó sin imagen pero otro del mismo producto sí tiene, usa la primera disponible
  const firstColorWithImg = Object.values(colors).find(c => !!c.image)?.image || sp?.thumbnail_url || "https://i.postimg.cc/k5ZGwR5W/producto1.png";
  Object.values(colors).forEach(c => { if (!c.image) c.image = firstColorWithImg; });

  const firstColorName = Object.keys(colors)[0];
  const cover =
    (firstColorName && colors[firstColorName]?.image) ||
    sp?.thumbnail_url ||
    "https://i.postimg.cc/k5ZGwR5W/producto1.png";

  const variant_map = firstColorName ? { ...colors[firstColorName].sizes } : {};

  // Slug compartible estable
  const slug =
    String(sp?.name || `pf-${sp?.id||""}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,"-")
      .replace(/(^-|-$)/g,"") + "-" + String(sp?.id||sp?.external_id||Date.now());

  return {
    id: String(sp?.id || sp?.external_id || `pf_${Date.now()}`),
    name: sp?.name || "Producto Printful",
    price: Number(price.toFixed(2)),
    image: cover,
    sku: sp?.external_id || String(sp?.id || ""),
    categories: detectCategories(sp?.name || ""),
    colors,       // { "Navy": {hex:"#001f3f", image:"...", sizes:{S:123,...}} , ... }
    variant_map,
    slug
  };
}