const {spawnSync}=require("child_process");
const fs=require("fs");
const searches=[
  "Hafele","Orbis","Autoterm","Flojet","ParMax","Par-Max","WX15","WX15","Simrad","GO7","GO12","NSS","Volvo","2280","Sardegna","Opacmare","Sleipner","Bennett","Apollo","SG-F","WX150","codo","solenoide","Quick","Piazza","Delta","Gaona","MG23","microondas","F600","H5000","QLED"
];
const out=[];
for (const search of searches) {
  const r=spawnSync("node",["scripts/catalog-image-specific-candidates.mjs","--search="+search,"--limit=12"],{encoding:"utf8"});
  try {
    const j=JSON.parse(r.stdout);
    for (const row of j.rows||[]) {
      if (row.imagen_url) continue;
      out.push({search, id:row.id, d:row.descripcion, code:row.codigo, sp:row.specificity, prov:row.proveedor});
    }
  } catch(e) {}
}
const uniq=new Map();
for (const row of out) if (!uniq.has(row.id)) uniq.set(row.id,row);
const rows=[...uniq.values()].sort((a,b)=>b.sp-a.sp);
fs.writeFileSync("tmp/_lote8_pool.json", JSON.stringify(rows,null,2));
console.log("unique no-image", rows.length);
console.log(rows.slice(0,40).map(r=>`${r.sp}|${r.d}|${r.id}|${r.code||""}`).join("\n"));
