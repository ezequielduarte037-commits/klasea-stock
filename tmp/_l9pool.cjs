const {spawnSync}=require("child_process");
const fs=require("fs");
const searches=[
  "BGH","B223","Clevers","Iriarte","Gaona","Delta","Bennett","Lenco","Maxwell","Flojet","Rule","Blue Sea","Victron","Sardegna","7003","Opacmare","Sleipner","JL","M3-770","M6-770","Fusion","Apollo","7.7","Par-Max","ParMax","5GPM","WX15","WX1504","WX1522","Quick","solenoide","Volvo","22427242","24712786","H5000","Q6","microondas","picaporte","bisagra","Hafele","246","Orbis","OXFP","6360","7715","Marinco"
];
const out=[];
for (const search of searches) {
  const r=spawnSync("node",["scripts/catalog-image-specific-candidates.mjs","--search="+search,"--limit=10"],{encoding:"utf8"});
  try {
    const j=JSON.parse(r.stdout);
    for (const row of j.rows||[]) {
      if (row.imagen_url) continue;
      out.push({search, id:row.id, d:row.descripcion, code:row.codigo, sp:row.specificity, prov:row.proveedor});
    }
  } catch {}
}
const uniq=new Map();
for (const row of out) if (!uniq.has(row.id)) uniq.set(row.id, row);
const rows=[...uniq.values()].sort((a,b)=>b.sp-a.sp);
fs.writeFileSync("tmp/_lote9_pool.json", JSON.stringify(rows,null,2));
console.log("unique", rows.length);
console.log(rows.slice(0,45).map(r=>`${r.sp}|${r.d}|${r.id.slice(0,8)}|${r.code||""}`).join("\n"));
