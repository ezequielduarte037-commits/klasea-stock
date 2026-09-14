const {spawnSync}=require("child_process");
const fs=require("fs");
const searches=["Jabsco","Rule","Blue Sea","Victron","Piazza","Lenco","Maxwell","Garmin","Simrad","Whale"];
const out=[];
for (const search of searches) {
  const r=spawnSync("node",["scripts/catalog-image-specific-candidates.mjs","--search="+search,"--limit=15"],{encoding:"utf8"});
  try {
    const j=JSON.parse(r.stdout);
    for (const row of j.rows||[]) {
      if (row.imagen_url) continue;
      out.push({search, id:row.id, d:row.descripcion, code:row.codigo, sp:row.specificity, prov:row.proveedor});
    }
  } catch(e) { out.push({search, error:e.message, raw:(r.stdout||"").slice(0,200)}); }
}
fs.writeFileSync("tmp/_lote8_cands.json", JSON.stringify(out,null,2));
console.log("candidates", out.length);
console.log(out.filter(x=>x.sp>=8).slice(0,25).map(x=>`${x.sp} | ${x.d} | ${x.id}`).join("\n"));
