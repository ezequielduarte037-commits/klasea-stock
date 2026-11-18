import fs from 'node:fs';
import {calcularPlanillaDeLinea,cargarBasePlanilla} from '../src/features/compras/planillaObrasApi.js';
const ids={
  '43 12V':['6d14a23a-1e7a-4661-ab6d-07e9872f9eb2','6a0afd2f-71a1-4159-8cc4-16e15d26ad57'],
  '31395-4012':['ca73afec-3c5d-4507-ae50-feb188081410'],
  '14A':['1cea6ed1-4dc2-4ec1-8da0-7cba5c9bfa1c'],
  '10':['895e8fc5-60e9-44bf-baeb-54dbe2c509bb','adc7bd8f-fe7e-4cf3-bf35-5212e176c354'],
  '35A':['9f04de6f-b777-41f0-8876-40e62510d848'],
  '37A':['d553e65c-1370-4101-a848-e71d52f864e5'],
  '4187':['2d98e85a-bde0-421c-a0f0-61697283eee1'],
};
const base=await cargarBasePlanilla({obrasSelect:'id,codigo,linea_nombre,estado,fecha_inicio,fecha_fin_estimada,botada_real,bahia_pampa,solo_stock'});
const lines=[...new Set(base.obras.filter(o=>o.estado==='activa' && !o.solo_stock && o.linea_nombre).map(o=>o.linea_nombre))];
const results=await Promise.all(lines.map(l=>calcularPlanillaDeLinea(l,{base,sinSecundarios:true})));
const matches=[];
const materialIds=new Set(Object.values(ids).flat());
for(const d of results){
  for(const f of d.filas){
    for(const [obraId,celda] of Object.entries(f.porObra)){
      const o=base.obras.find(o=>o.id===obraId);
      if(!o||o.solo_stock)continue;
      const code=Object.entries(ids).find(([code,vals])=>vals.some(id=>[f.id,f.requisitoId,celda.requisitoId,celda.productoMaterialId].includes(id)))?.[0];
      if(!code) continue;
      matches.push({code,obra:o,fila:{id:f.id,descripcion:f.descripcion,enPanolLibre:f.enPanolLibre,libreFamilia:f.enPanolLibreFamilia,proveedor:f.proveedor},celda});
    }
  }
}
fs.writeFileSync('.tmp/aviso-85732-planilla.json',JSON.stringify({matches,catalog:base.materiales.filter(m=>materialIds.has(m.id)),matrix:base.modelos.filter(m=>materialIds.has(m.material_id)||materialIds.has(m.producto_predeterminado_id))},null,2));
console.log(JSON.stringify({lineas:lines,matching:matches.length}));
