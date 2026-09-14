const fs=require("fs");
const path="scripts/catalog-image-curated.sources.json";
const manifest=JSON.parse(fs.readFileSync(path,"utf8"));
const existing=new Set(manifest.entries.map(e=>e.materialId));
const lote8=[
  {
    materialId:"00a2d750-1c57-485c-9018-bb5fe180ee05",
    expectedDescription:"CODO QUICK CONNECT 15mm",
    model:"Whale WX1503B equal elbow 15mm Quick Connect",
    sourceName:"Boatersland Marine",
    sourcePage:"https://www.boatersland.com/whale-wx1503b-equal-elbow-15mm.html",
    sourceTokens:["WX1503B","Whale"],
    imageProof:"embedded",
    imageUrl:"https://www.boatersland.com/images/img/whale-wx1503b-equal-elbow-15mm.jpg"
  },
  {
    materialId:"ca73afec-3c5d-4507-ae50-feb188081410",
    expectedDescription:"Bomba agua JABSCO automática 3GPM + prefiltro",
    model:"Jabsco Par-Max 3 12V 3GPM 40PSI with strainer 31395-4012-3A",
    sourceName:"ProPride Marine",
    sourcePage:"https://propridemarine.com/jabsco-par-max-3-water-pressure-pump-12v-3-gpm-40-psi-p-n-31395-4012-3a/",
    sourceTokens:["31395-4012","Jabsco","3"],
    imageProof:"embedded",
    imageUrl:"https://cdn11.bigcommerce.com/s-dz6pzclfyw/images/stencil/1280x1280/products/160046/1553349/86614XL__67059__30763.1672856784.jpg?c=1"
  },
  {
    materialId:"9fa4d195-0da9-4d28-8463-32a2195d587d",
    expectedDescription:"TV  43\" · Samsung Full HD F600",
    model:"Samsung 43 F6000F Full HD Smart TV / UN43F6000FGXZD",
    sourceName:"Samsung Brasil",
    sourcePage:"https://www.samsung.com/br/tvs/full-hd-tv/f6000-43-inch-un43f6000fgxzd/",
    sourceTokens:["Samsung","F600","43"],
    imageProof:"embedded",
    imageUrl:"https://images.samsung.com/is/image/samsung/p6pim/br/un43f6000fgxzd/gallery/br-fhd-f6000-un43f6000fgxzd-545960225?$1164_776_PNG$"
  }
];
const added=[];
for (const e of lote8){
  if(existing.has(e.materialId)){console.error("dup",e.materialId);continue;}
  manifest.entries.push(e); existing.add(e.materialId); added.push(e.expectedDescription);
}
fs.writeFileSync(path, JSON.stringify(manifest,null,2)+"\n");
console.log("added",added.length,"total",manifest.entries.length);
