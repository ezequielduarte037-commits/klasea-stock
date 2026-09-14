const fs=require("fs");
const path="scripts/catalog-image-curated.sources.json";
const manifest=JSON.parse(fs.readFileSync(path,"utf8"));
const existing=new Set(manifest.entries.map(e=>e.materialId));
const more=[
  {
    materialId:"ee4907f6-c15e-476c-bacf-a4981ba991ef",
    expectedDescription:"Rejilla D60 Obturable Negra - Calefactor Autoterm",
    model:"Autoterm deflector closable Ø60mm black EU/4099",
    sourceName:"Autoterm Schweiz",
    sourcePage:"https://autoterm.ch/deflector-closable-o-60mm-incl-flange.html?language=en",
    sourceTokens:["Autoterm","closable","60"],
    imageProof:"embedded",
    imageUrl:"https://autoterm.ch/images/product_images/original_images/EU_4099-601.jpg"
  },
  {
    materialId:"d98179e7-c15c-4c02-bb97-187c72a2f428",
    expectedDescription:"Rejilla D60 Orientable Negra - Calefactor Autoterm",
    model:"Autoterm grille Ø60mm 30° black EU/P4943",
    sourceName:"Autoterm Schweiz",
    sourcePage:"https://autoterm.ch/grille-o-60-mm-30.html?language=en",
    sourceTokens:["Autoterm","60","30"],
    imageProof:"embedded",
    imageUrl:"https://autoterm.ch/images/product_images/original_images/DE007A1.jpg"
  },
  {
    materialId:"b2830c16-2f31-4bb0-9b7e-60368c734e8b",
    expectedDescription:"Rejilla D90 Obturable Negra - Calefactor Autoterm",
    model:"Autoterm deflector closable Ø90mm black EU/P4108",
    sourceName:"Autoterm Schweiz",
    sourcePage:"https://autoterm.ch/deflector-closable-o-90mm-incl-flange.html?language=en",
    sourceTokens:["Autoterm","closable","90"],
    imageProof:"embedded",
    imageUrl:"https://autoterm.ch/images/product_images/original_images/EU_P4108-90.jpg"
  }
];
const added=[];
for(const e of more){
  if(existing.has(e.materialId)){console.error("dup",e.materialId);continue;}
  manifest.entries.push(e); existing.add(e.materialId); added.push(e.expectedDescription);
}
fs.writeFileSync(path, JSON.stringify(manifest,null,2)+"\n");
console.log("added",added.length,"total",manifest.entries.length);
