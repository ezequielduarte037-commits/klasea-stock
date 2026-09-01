import fs from "node:fs";
process.chdir("C:/klasea-stock");
const leer=(f)=>(fs.existsSync(f)?Object.fromEntries(fs.readFileSync(f,"utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];})):{});
const env={...leer(".env"),...leer(".env.local"),...leer(".env.backup.local")};
const U=(env.VITE_SUPABASE_URL||"").replace(/\/+$/,"");
const h={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`};
globalThis.__supa={};
const SC="C:/Users/ezequ/AppData/Local/Temp/claude/C--klasea-stock/6baff64e-3cb0-4bbf-a75e-d3eb0edadd3e/scratchpad";
const {createRequire}=await import("node:module"); const req=createRequire("C:/klasea-stock/package.json");
const esbuild=req("esbuild"), path=req("node:path");
await esbuild.build({entryPoints:["src/features/rrhh/api.js"],bundle:true,format:"esm",platform:"node",outfile:"_rh.mjs",logLevel:"error",
  alias:{"@/supabaseClient":SC+"/supabaseStub.js","@":path.resolve("src")}});
const api=await import("file:///C:/klasea-stock/_rh.mjs");
async function todo(t,sel){const o=[];for(let d=0;;d+=1000){const r=await fetch(`${U}/rest/v1/${t}?select=${encodeURIComponent(sel)}`,{headers:{...h,Range:`${d}-${d+999}`}});if(!r.ok)return o;const j=await r.json();if(!Array.isArray(j)||!j.length)break;o.push(...j);if(j.length<1000)break;}return o;}
const m=await todo("rrhh_marcaciones","empleado_id,fecha,entrada,salida,fichadas");
let conAusencia=0, minDeMas=0, diasComparables=0;
const casos=[];
for(const x of m){
  const d=api.tramosDelDia(x.fichadas);
  if(!d.tramos.length) continue;
  const actual=api.duracionMin(x);
  if(actual==null) continue;
  diasComparables++;
  const real=d.tramos.reduce((s,t)=>s+(api.timeToMin?api.timeToMin(t.hasta)-api.timeToMin(t.desde):0),0);
  const dif=actual-real;
  if(d.ausencias.length){ conAusencia++; minDeMas+=dif; if(casos.length<6) casos.push({f:x.fecha, act:actual, real, dif, aus:d.ausencias.map(a=>`${a.desde}-${a.hasta}`).join(" ")}); }
}
console.log(`\n${diasComparables} dias con entrada y salida`);
console.log(`${conAusencia} tienen una ausencia real en el medio`);
console.log(`horas contadas de mas: ${(minDeMas/60).toFixed(1)} h  (${minDeMas} min)`);
console.log(`\nejemplos:`);
for(const c of casos) console.log(`  ${c.f}  se cuenta ${(c.act/60).toFixed(1)}h · trabajo ${(c.real/60).toFixed(1)}h · sobran ${c.dif} min   ausente ${c.aus}`);
