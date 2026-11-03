// Escribe la migración y la planilla de los mínimos propuestos (03/11/2026).
import fs from 'node:fs';
import * as XLSX from 'xlsx';
XLSX.set_fs(fs);

const [dir, sqlPath, xlsxPath] = process.argv.slice(2);
const propuesta = JSON.parse(fs.readFileSync(`${dir}/propuesta.json`, 'utf8'));
const lit = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;

const valores = propuesta.map((p) => `  (${lit(p.id)}::uuid, ${p.minimo}, ${lit(p.motivo)})`).join(',\n');
const sql = `-- Stock mínimo inicial del pañol (03/11/2026), pedido de Ezequiel: "poné
-- stocks mínimos ... según retiro y criterio de importancia; después los voy
-- corrigiendo". Cálculo en tools/minimos-panol-*-20261103.mjs.
--
-- Sólo toca lo que no tiene mínimo: los que cargaron Ezequiel (02–03/11) y
-- Tomás (19/10) a mano quedan como están, y si alguien carga uno mientras
-- tanto también se respeta. 0 = "no se tiene en stock, se compra por obra".
-- Sin ningún registro (ni salidas, ni matriz, ni stock) queda sin mínimo.
-- El motivo de cada valor queda en panol_materiales_audit.contexto.

begin;

create temp table zz_minimos (material_id uuid primary key, minimo numeric, motivo text) on commit drop;
insert into zz_minimos (material_id, minimo, motivo) values
${valores};

update public.panol_materiales m
set stock_minimo = z.minimo
from zz_minimos z
where m.id = z.material_id
  and m.stock_minimo is null;

update public.panol_materiales_audit a
set origen = 'minimos_iniciales_20261103',
    contexto = coalesce(a.contexto, '{}'::jsonb) || jsonb_build_object('motivo', z.motivo)
from zz_minimos z
where a.material_id = z.material_id
  and a.campo = 'stock_minimo'
  and a.contexto->>'txid' = txid_current()::text;

commit;
`;
fs.writeFileSync(sqlPath, sql);

const filas = [...propuesta]
  .sort((a, b) => a.tipo.localeCompare(b.tipo) || (b.minimo > 0) - (a.minimo > 0) || a.rubro.localeCompare(b.rubro, 'es') || a.descripcion.localeCompare(b.descripcion, 'es', { numeric: true }))
  .map((p) => ({
    Tipo: p.tipo,
    Rubro: p.rubro,
    Código: p.codigo || '',
    Descripción: p.descripcion,
    Unidad: p.unidad,
    Mínimo: p.minimo,
    'Stock libre hoy': p.stock == null ? 'sin contar' : p.stock,
    'A reponer': p.reponer ? 'Sí' : '',
    Motivo: p.motivo,
  }));
const hoja = XLSX.utils.json_to_sheet(filas);
hoja['!cols'] = [{ wch: 11 }, { wch: 30 }, { wch: 12 }, { wch: 55 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 80 }];
hoja['!autofilter'] = { ref: hoja['!ref'] };
const libro = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(libro, hoja, 'Mínimos');
XLSX.writeFile(libro, xlsxPath);
console.log('renglones', propuesta.length);
