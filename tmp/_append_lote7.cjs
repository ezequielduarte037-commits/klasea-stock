const fs = require("fs");
const path = "scripts/catalog-image-curated.sources.json";
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
const existing = new Set(manifest.entries.map((e) => e.materialId));
const lote7 = [
  {
    materialId: "b0076cd8-0c30-49f3-bdb6-eccbef197c13",
    expectedDescription: "SOPAPA CLICK PIAZZA NEGRA SC4348E",
    model: "Piazza SC434NE sopapa click negro",
    sourceName: "Piazza",
    sourcePage: "https://www.piazzagriferia.com/producto/sc434ne/",
    sourceTokens: ["SC434", "Negro"],
    imageProof: "embedded",
    imageUrl: "https://www.piazzagriferia.com/wp-content/uploads/2025/08/SC434NE.jpg",
  },
  {
    materialId: "efd691c6-8d1c-437b-aca2-d273b7e0ab03",
    expectedDescription: "Botón malacate Footswitch · Footswitch Quick italy con tapa inox",
    model: "Quick 915/CX footswitch tapa inox AISI 316",
    sourceName: "Aquafax",
    sourcePage: "https://www.aquafax.co.uk/products/quick-915-foot-switch-for-anchor-lowering-lifting-150a-stainless-q-fp915-cx",
    sourceTokens: ["915/CX", "Quick"],
    imageProof: "embedded",
    imageUrl: "https://d1blekj7w4kc3j.cloudfront.net/images/presets/product_page_full/catalogue/products/Q-FP915.CX.jpg",
  },
  {
    materialId: "dbb3e9a4-0fee-443d-9643-722212d95a53",
    expectedDescription: "cable gws 10, 30m (garmin)",
    model: "Garmin NMEA 2000 backbone/GWS 10 mast cable 30m 010-11171-01",
    sourceName: "Hudson Marine Electronics",
    sourcePage: "https://hudsonmarine.co.uk/products/garmin-nmea2000-backbone-cable-30m-replacement-mast-cable-for-gws-10-wind-transducer-010-11171-01",
    sourceTokens: ["010-11171-01", "GWS"],
    imageProof: "embedded",
    imageUrl: "https://hudsonmarine.co.uk/cdn/shop/files/legacy-d8daa7c1.jpg?v=1781902556",
  },
  {
    materialId: "03799ebb-10c9-450d-95e1-bf34ac973c9f",
    expectedDescription: "TV  43\" · Samsung T5300",
    model: "Samsung 43 T5300 FHD Smart TV / UN43T5300APXPA",
    sourceName: "Samsung Latinoamérica",
    sourcePage: "https://www.samsung.com/latin/tvs/full-hd-tv/t5300-43-inch-full-hd-smart-tv-un43t5300apxpa/",
    sourceTokens: ["Samsung", "T5300", "43"],
    imageProof: "embedded",
    imageUrl: "https://images.samsung.com/is/image/samsung/latin-fhd-t5300-un43t5300apxpa-frontblack-thumb-229166471",
  },
  {
    materialId: "2a4d059a-0d89-4a11-b819-2a026f2589b1",
    expectedDescription: "VALVULA DE DESVIO \"Y\" MATROMARINE ITALIANA",
    model: "Matromarine Y-valve 6000200025",
    sourceName: "BigShip",
    sourcePage: "https://www.bigship.com/catalogue/vie-a-bord/wc-accessoires/accessoires-de-wc/matromarine-vanne-y-3-voies-cadenassable",
    sourceTokens: ["Matromarine", "6000200025"],
    imageProof: "embedded",
    imageUrl: "https://bigship-media.riashop.app/images/1500x1200/93061.jpg",
  },
];
const added = [];
for (const entry of lote7) {
  if (existing.has(entry.materialId)) {
    console.error("skip duplicate", entry.materialId);
    continue;
  }
  manifest.entries.push(entry);
  existing.add(entry.materialId);
  added.push(entry.expectedDescription);
}
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync("tmp/_lote7_added.json", JSON.stringify({ count: added.length, added }, null, 2));
console.log("added", added.length, "total", manifest.entries.length);
