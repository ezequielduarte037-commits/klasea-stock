const fs=require('fs');
const j=JSON.parse(fs.readFileSync('scripts/catalog-image-curated.sources.json','utf8'));
const out={
  cwd:process.cwd(),
  entries:j.entries.length,
  lote7: fs.existsSync('tmp/lote7-preview')?fs.readdirSync('tmp/lote7-preview'):[],
  reports: fs.existsSync('tmp')?fs.readdirSync('tmp').filter(f=>f.includes('lote')).slice(-20):[],
  last5: j.entries.slice(-5).map(e=>({id:e.materialId,d:e.expectedDescription,status:e.status}))
};
fs.writeFileSync('tmp/_state_lote7.json', JSON.stringify(out,null,2));
console.error('wrote');
