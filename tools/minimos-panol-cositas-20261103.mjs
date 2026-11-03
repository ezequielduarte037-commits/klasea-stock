// Cuarta vuelta de los mínimos de barco (03/11/2026). Ezequiel: "codos de
// bronce y esas cosas en 0 deberían tener un mínimo; son cositas que si no hay
// una sola no se puede avanzar; lo mismo con pasacascos". La vuelta anterior
// pedía que el pañol las hubiera recibido en dos barcos, y estas piezas casi
// nunca quedan registradas.
//
// Regla: ferretería de barco barata (hasta USD 50 o sin precio) que hoy está en
// 0, con alguna señal de uso real (en la matriz de 3+ obras activas, salió a
// 2+ obras o hay stock libre) → lo de un barco según la matriz, mínimo 2, sin
// pasar de ~USD 150 parados por ítem. No baja nada que ya tenga más.
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { rowIsAnulado, rowSource } from '../src/features/panol/panolMovimientos.js';
XLSX.set_fs(fs);

const [dir, sqlPath, xlsxPath] = process.argv.slice(2);
const read = (n) => JSON.parse(fs.readFileSync(`${dir}/${n}.json`, 'utf8'));
const perfil = read('perfil');
const snapshot = read('snapshot');
const actual = new Map(read('minactual').map((r) => [r.id, r.min]));
const manuales = new Set(fs.readFileSync(`${dir}/manuales.txt`, 'utf8').split(/\s+/).filter(Boolean));
const num = (v, f = 0) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : f; };
const techo = (x) => Math.ceil(x - 1e-9);
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const redondo = (n) => (n <= 10 ? techo(n) : n <= 50 ? techo(n / 5) * 5 : techo(n / 10) * 10);

// Cuánto lleva cada barco según la matriz de las obras activas.
const porObra = new Map();
for (const r of snapshot) {
  if (rowSource(r) !== 'matriz' || r.obra?.estado !== 'activa' || rowIsAnulado(r) || !r.material_id) continue;
  if (!porObra.has(r.material_id)) porObra.set(r.material_id, new Map());
  const m = porObra.get(r.material_id);
  m.set(r.obra_id, (m.get(r.obra_id) || 0) + Math.max(0, num(r.cantidad, 1)));
}

const COSITA = /\bcodo|racor|cupla|entrerrosca|niple|\bt[eé]e?\b|\bte bronce|tap[oó]n|\btapa (bronce|de bronce)|reducci[oó]n|buje reduc|pasacasco|v[aá]lvula|miniesf|esf[eé]rica|cuchara|grasera|empalme|uni[oó]n|conector|abrazadera|espiga|terminal|fusible|bornera|precinto|grillete|c[aá]ncamo|sapito|omega|bisagra|levantapiso|pist[oó]n|llave de paso|llave esclusa|rejilla|virola|adaptador/i;
const NO = /\bL\s*=|a medida|plano|chapa|corte|flap|sistema|linear|actuador|cableado|buje de (goma|bronce)|brazo|timón|tim[oó]n|eje/i;
const RUBROS_NO = /^(Maderas|Vidrios|Herrería|Laminación|Consumibles)/;

const cambios = [];
for (const f of perfil) {
  // Las fichas de requisito no tienen stock propio: el mínimo va al producto concreto.
  if (f.consumible || f.requisito || manuales.has(f.id) || actual.get(f.id) !== 0) continue;
  if (RUBROS_NO.test(f.rubro) || !COSITA.test(f.descripcion) || NO.test(f.descripcion)) continue;
  if (f.precioUsd != null && f.precioUsd > 50) continue;
  const obras = porObra.get(f.id);
  const nMatriz = obras?.size || 0;
  const senal = nMatriz >= 3 || f.obras >= 2 || (f.stockLibre ?? 0) > 0;
  if (!senal) continue;
  const porBarco = nMatriz ? mediana([...obras.values()]) : Math.max(1, f.porBarco || 1);
  let minimo = Math.max(2, redondo(porBarco));
  if (f.precioUsd > 0) minimo = Math.max(2, Math.min(minimo, Math.floor(150 / f.precioUsd)));
  const donde = nMatriz ? `en la matriz de ${nMatriz} obras activas, ${porBarco} por barco` : f.obras >= 2 ? `salió a ${f.obras} obras` : `hay ${f.stockLibre} en stock`;
  cambios.push({
    id: f.id, codigo: f.codigo, descripcion: f.descripcion, rubro: f.rubro, unidad: f.unidad,
    minimo, stock: f.stockLibre ?? 0, precio: f.precioUsd,
    motivo: `Pieza chica que frena el trabajo si falta: ${donde}${f.precioUsd != null ? ` · USD ${f.precioUsd}` : ''}`,
  });
}

const r = {};
for (const c of cambios) r[c.rubro] = (r[c.rubro] || 0) + 1;
console.log({ cositas: cambios.length, aReponer: cambios.filter((c) => c.stock <= c.minimo).length, usd: Math.round(cambios.reduce((a, c) => a + (c.precio || 0) * c.minimo, 0)), porRubro: r });
fs.writeFileSync(`${dir}/cositas.json`, JSON.stringify(cambios, null, 1));

if (sqlPath) {
  const lit = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
  fs.writeFileSync(sqlPath, `-- Cuarta vuelta de los mínimos de barco (03/11/2026). Ezequiel: los codos de
-- bronce, pasacascos y esas cositas no pueden estar en 0: si falta una sola
-- no se puede avanzar. Ferretería de barco barata (hasta USD 50) con señal de
-- uso real pasa de 0 a lo de un barco según la matriz (mínimo 2, tope ~USD 150
-- por ítem). Cálculo en tools/minimos-panol-cositas-20261103.mjs.
--
-- Sólo cambia los que siguen en 0 y nunca tuvieron un mínimo cargado a mano.

begin;

create temp table zz_minimos (material_id uuid primary key, minimo numeric, motivo text) on commit drop;
insert into zz_minimos (material_id, minimo, motivo) values
${cambios.map((c) => `  (${lit(c.id)}::uuid, ${c.minimo}, ${lit(c.motivo)})`).join(',\n')};

update public.panol_materiales m
set stock_minimo = z.minimo
from zz_minimos z
where m.id = z.material_id
  and m.stock_minimo = 0
  and not exists (
    select 1 from public.panol_materiales_audit a
    where a.material_id = m.id and a.campo = 'stock_minimo' and a.origen not like 'minimos_%'
  );

update public.panol_materiales_audit a
set origen = 'minimos_cositas_20261103',
    contexto = coalesce(a.contexto, '{}'::jsonb) || jsonb_build_object('motivo', z.motivo)
from zz_minimos z
where a.material_id = z.material_id
  and a.campo = 'stock_minimo'
  and a.contexto->>'txid' = txid_current()::text;

commit;
`);
}

// La planilla junta la vuelta estándar con esta: es el estado final de lo de barco.
if (xlsxPath) {
  const estandar = new Map(read('estandar').map((c) => [c.id, c]));
  for (const c of cambios) estandar.set(c.id, c);
  const filas = [...estandar.values()]
    .sort((a, b) => (b.minimo > 0) - (a.minimo > 0) || a.rubro.localeCompare(b.rubro, 'es') || a.descripcion.localeCompare(b.descripcion, 'es', { numeric: true }))
    .map((c) => ({ Rubro: c.rubro, Código: c.codigo || '', Descripción: c.descripcion, Unidad: c.unidad, Mínimo: c.minimo, 'Stock libre hoy': c.stock, 'A reponer': c.minimo > 0 && c.stock <= c.minimo ? 'Sí' : '', 'USD unit.': c.precio ?? '', Motivo: c.motivo }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 55 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 9 }, { wch: 90 }];
  hoja['!autofilter'] = { ref: hoja['!ref'] };
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Mínimos de barco');
  XLSX.writeFile(libro, xlsxPath);
}
