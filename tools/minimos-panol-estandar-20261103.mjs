// Tercera vuelta de los mínimos de barco (03/11/2026). Ezequiel: "hay
// muchísimos en 0; las TV siempre se van a necesitar. Usá un criterio propio,
// no sólo los movimientos". Acá la necesidad sale de la matriz: lo que va en
// casi todos los barcos se necesita siempre, aunque el sistema no haya visto
// las salidas (gran parte del material puesto nunca se registró).
//
// Por requisito de matriz:
//   - en cuántas obras activas está y cuánto lleva cada barco (mediana);
//   - qué producto concreto se está comprando (el último que entró): el
//     mínimo va ahí, que es donde está el stock;
//   - precio (mediana en USD de ese producto, o del requisito).
// Reglas (en orden):
//   - Herrería, Vidrios, Maderas, a medida: 0 (se fabrican por barco).
//   - Menos de 4 obras activas con el ítem y poco movimiento: 0.
//   - Más de USD 1.500: 0 (se compra planificado por barco).
//   - USD 300–1.500: 1 de repuesto si va en 6 obras o más.
//   - USD 100–300: lo de un barco (mín. 1); 2 barcos si va en 10 obras o más, tope USD 900.
//   - Hasta USD 100: lo de dos barcos, tope USD 600 parados; ferretería al menos 4.
// Lo que salió a 4 obras o más en 90 días sin estar en la matriz mantiene la
// regla de movimiento de la vuelta anterior.
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { rowIsAnulado, rowSource } from '../src/features/panol/panolMovimientos.js';
XLSX.set_fs(fs);

const [dir, sqlPath, xlsxPath] = process.argv.slice(2);
const read = (n) => JSON.parse(fs.readFileSync(`${dir}/${n}.json`, 'utf8'));
const materiales = read('materiales');
const snapshot = read('snapshot');
const perfil = new Map(read('perfil').map((f) => [f.id, f]));
const manuales = new Set(fs.readFileSync(`${dir}/manuales.txt`, 'utf8').split(/\s+/).filter(Boolean));
const mat = new Map(materiales.map((m) => [m.id, m]));
const num = (v, f = 0) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : f; };
const techo = (x) => Math.ceil(x - 1e-9);
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const fmt = (n) => Number(Math.round(n * 100) / 100).toLocaleString('es-AR');
const redondo = (n) => (n <= 10 ? techo(n) : n <= 50 ? techo(n / 5) * 5 : techo(n / 10) * 10);

// Precio por material (USD).
const precios = new Map();
for (const r of snapshot) {
  const p = num(r.precio_unitario, 0);
  if (!r.material_id || p <= 0) continue;
  const usd = String(r.moneda || 'ARS').toUpperCase() === 'USD' ? p : p / 1540;
  if (!precios.has(r.material_id)) precios.set(r.material_id, []);
  precios.get(r.material_id).push(usd);
}
const precioDe = (id) => (precios.has(id) ? Math.round(mediana(precios.get(id))) : null);

// Necesidad por requisito, desde la matriz de obras activas.
const req = new Map();
for (const r of snapshot) {
  if (rowSource(r) !== 'matriz' || r.obra?.estado !== 'activa' || rowIsAnulado(r)) continue;
  const id = r.requisito_material_id || r.material_id;
  if (!id) continue;
  if (!req.has(id)) req.set(id, { obras: new Map(), lineas: new Set(), productos: new Set() });
  const x = req.get(id);
  x.obras.set(r.obra_id, (x.obras.get(r.obra_id) || 0) + Math.max(0, num(r.cantidad, 1)));
  x.lineas.add(String(r.obra?.codigo || '').split('-')[0]);
  if (r.material_id) x.productos.add(r.material_id);
}

// Producto concreto que se está usando para cada requisito: el de la última
// entrada física (remito, compra, conteo) o, si no hubo, el de la matriz.
const ultimoIngreso = new Map();
const obrasConIngreso = new Map();
for (const r of snapshot) {
  const src = rowSource(r);
  if (!['remito', 'compra', 'stock_general', 'manual', 'conteo_fisico', 'matriz', 'obra_matriz'].includes(src)) continue;
  if (src === 'matriz' && !['recibido', 'en_panol', 'egresado'].includes(r.estado)) continue;
  const rid = r.requisito_material_id || r.material_id;
  if (!rid || !r.material_id || mat.get(r.material_id)?.es_requisito) continue;
  const at = r.recepcion_updated_at || r.created_at;
  if (r.obra_id) { if (!obrasConIngreso.has(rid)) obrasConIngreso.set(rid, new Set()); obrasConIngreso.get(rid).add(r.obra_id); }
  const prev = ultimoIngreso.get(rid);
  if (!prev || at > prev.at) ultimoIngreso.set(rid, { at, material_id: r.material_id });
}

const EXCLUIDO = /^(Maderas|Vidrios|Herrería)/;
// Lo que se hace o se corta para cada barco, o lo elige el cliente: no se stockea.
const A_MEDIDA = /\bL\s*=|a medida|\bK\d{2}\b.*\(\s*(medidas|largo)|elige|cliente|cableado|cerramiento|\blona\b|acr[ií]lico|tablero|puerta|\bmesa\b|espejo|deflector|direcci[oó]n|plano|chapa|\bcorte\b|recorte|\bbrida\b|tubo bowthruster|tapizad|colch|cortina|alfombra/i;
// Equipos que sin precio cargado no se stockean a ciegas.
const EQUIPO_CARO = /thruster|thurster|\bflap|inver|generador|malacate|heladera|aire acond|calefactor|bomba|inodoro|tanque|parrilla el|control doble|panel bow|silenciador|separador|termotanque|sello pss/i;
const FERRETERIA = /broncer|herraje|torniller|codo|racor|niple|entrerrosca|tee\b|cupla|abrazadera|conector|v[aá]lvula|bisagra|tornillo|grillete|terminal/i;

const propuesta = new Map(); // material_id → { minimo, motivo, ... }
const gruposConManual = new Set();
for (const [rid, x] of req) {
  const productos = new Set([rid, ...x.productos]);
  if ([...productos].some((id) => manuales.has(id))) { gruposConManual.add(rid); continue; }
  const nObras = x.obras.size;
  const porBarco = mediana([...x.obras.values()]) || 1;
  const destino = ultimoIngreso.get(rid)?.material_id || (mat.get(rid)?.es_requisito ? [...x.productos].find((id) => !mat.get(id)?.es_requisito) : rid);
  if (!destino || manuales.has(destino)) continue;
  const m = mat.get(destino);
  if (!m || m.activo === false || m.es_consumible) continue;
  const f = perfil.get(destino) || {};
  const rubro = f.rubro || '';
  const precio = precioDe(destino) ?? precioDe(rid);
  const lineas = [...x.lineas].filter(Boolean).sort().join(', ');
  const base = `En la matriz de ${nObras} obras activas (${lineas}), ${fmt(porBarco)} ${f.unidad || 'u'} por barco${precio != null ? ` · USD ${precio}` : ''}`;
  let minimo = 0;
  let motivo;
  if (EXCLUIDO.test(rubro)) motivo = /^Herrería/.test(rubro) ? 'Herrería: se fabrica por barco' : `${rubro.split(' /')[0]}: va por su circuito`;
  else if (A_MEDIDA.test(m.descripcion)) motivo = `${base} · a medida: se compra por barco`;
  else if (nObras < 5) motivo = `${base} · pocos barcos: se compra por obra`;
  else if ((obrasConIngreso.get(rid)?.size || 0) < 2 && nObras < 10) motivo = `${base} · el pañol casi no lo recibió: va directo a la obra`;
  else if (precio != null && precio > 1000) motivo = `${base} · caro: se compra planificado por barco`;
  else if (precio == null && EQUIPO_CARO.test(m.descripcion)) motivo = `${base} · equipo sin precio cargado: se compra por barco`;
  else if (precio != null && precio > 300) {
    if (nObras >= 8) { minimo = 1; motivo = `${base} · va en casi todos: uno de repuesto`; } else motivo = `${base} · caro y en pocos barcos: por obra`;
  } else if (precio == null || precio > 100) {
    // Sin precio se trata como intermedio: no se llena el pañol de algo que no se sabe cuánto vale.
    const barcos = 1;
    minimo = Math.max(1, techo(porBarco * barcos));
    if (precio != null) minimo = Math.max(1, Math.min(minimo, Math.floor(900 / precio)));
    else if (!/metro|kg|litro/i.test(f.unidad || '')) minimo = Math.min(minimo, 4);
    motivo = `${base} · ${barcos === 2 ? 'dos barcos' : 'un barco'}${precio == null ? ' (sin precio cargado)' : ''}`;
  } else {
    const rota = (f.obras90 || 0) >= 3;
    minimo = redondo(Math.max(porBarco * (rota ? 2 : 1), FERRETERIA.test(m.descripcion) || FERRETERIA.test(rubro) ? 4 : 1));
    if (precio > 0) minimo = Math.max(1, Math.min(minimo, redondo(600 / precio)));
    motivo = `${base} · ${rota ? 'dos barcos (se mueve seguido)' : 'un barco'}`;
  }
  const previo = propuesta.get(destino);
  if (!previo || minimo > previo.minimo) propuesta.set(destino, { minimo, motivo, precio, nObras, porBarco });
}

// Lo que se mueve mucho aunque no esté en la matriz: regla de movimiento.
for (const f of perfil.values()) {
  if (f.consumible || manuales.has(f.id) || propuesta.has(f.id)) continue;
  if (f.obras90 < 4 || f.eventos90 < 4 || EXCLUIDO.test(f.rubro)) continue;
  const precio = f.precioUsd;
  if (precio != null && precio > 300) continue;
  const minimo = precio != null && precio > 30 ? Math.max(1, Math.min(techo(f.porBarco), Math.floor(600 / precio))) : redondo(Math.max(2, 1.5 * f.porBarco));
  propuesta.set(f.id, { minimo, motivo: `Salió a ${f.obras90} obras en 90 días (${fmt(f.cant90)} ${f.unidad}, ${fmt(f.porBarco)} por barco)${precio != null ? ` · USD ${precio}` : ''}`, precio, nObras: f.obras90, porBarco: f.porBarco });
}

// Todo lo de barco sin mínimo manual: lo propuesto, o 0 si ya tenía valor automático.
const cambios = [];
for (const m of materiales) {
  if (m.activo === false || m.es_consumible || manuales.has(m.id)) continue;
  const p = propuesta.get(m.id);
  const f = perfil.get(m.id) || {};
  const nuevo = p ? p.minimo : (m.stock_minimo == null ? null : 0);
  if (nuevo == null) continue;
  cambios.push({
    id: m.id, codigo: m.codigo, descripcion: m.descripcion, rubro: f.rubro || '', unidad: f.unidad || m.unidad_medida || 'unidad',
    minimo: nuevo, motivo: p?.motivo || 'Ni estándar en la matriz ni con movimiento: se compra por obra',
    precio: p?.precio ?? f.precioUsd ?? null, stock: f.stockLibre ?? 0,
  });
}
const pos = cambios.filter((c) => c.minimo > 0);
const parado = pos.reduce((a, c) => a + (c.precio || 0) * c.minimo, 0);
console.log({ barcoPositivos: pos.length, barcoCero: cambios.length - pos.length, usdEnMinimos: Math.round(parado), sinPrecio: pos.filter((c) => c.precio == null).length, gruposConManual: gruposConManual.size, aReponer: pos.filter((c) => c.stock <= c.minimo).length });
fs.writeFileSync(`${dir}/estandar.json`, JSON.stringify(cambios, null, 1));

if (sqlPath) {
  const lit = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
  const valores = cambios.map((c) => `  (${lit(c.id)}::uuid, ${c.minimo}, ${lit(c.motivo)})`).join(',\n');
  fs.writeFileSync(sqlPath, `-- Tercera vuelta de los mínimos de barco (03/11/2026). Ezequiel: "hay
-- muchísimos en 0; las TV siempre se van a necesitar; usá un criterio propio,
-- no sólo los movimientos". La necesidad sale de la matriz de las obras
-- activas, el mínimo va al producto que se está comprando y el precio pone el
-- techo. Cálculo en tools/minimos-panol-estandar-20261103.mjs.
--
-- No toca los mínimos cargados a mano (todo material con un cambio de
-- stock_minimo que no venga de las cargas automáticas del 03/11).

begin;

create temp table zz_minimos (material_id uuid primary key, minimo numeric, motivo text) on commit drop;
insert into zz_minimos (material_id, minimo, motivo) values
${valores};

update public.panol_materiales m
set stock_minimo = z.minimo
from zz_minimos z
where m.id = z.material_id
  and m.stock_minimo is distinct from z.minimo
  and not exists (
    select 1 from public.panol_materiales_audit a
    where a.material_id = m.id and a.campo = 'stock_minimo' and a.origen not like 'minimos_%'
  );

update public.panol_materiales_audit a
set origen = 'minimos_estandar_20261103',
    contexto = coalesce(a.contexto, '{}'::jsonb) || jsonb_build_object('motivo', z.motivo)
from zz_minimos z
where a.material_id = z.material_id
  and a.campo = 'stock_minimo'
  and a.contexto->>'txid' = txid_current()::text;

commit;
`);
}

if (xlsxPath) {
  const filas = [...cambios]
    .sort((a, b) => (b.minimo > 0) - (a.minimo > 0) || a.rubro.localeCompare(b.rubro, 'es') || a.descripcion.localeCompare(b.descripcion, 'es', { numeric: true }))
    .map((c) => ({ Rubro: c.rubro, Código: c.codigo || '', Descripción: c.descripcion, Unidad: c.unidad, Mínimo: c.minimo, 'Stock libre hoy': c.stock, 'A reponer': c.minimo > 0 && c.stock <= c.minimo ? 'Sí' : '', 'USD unit.': c.precio ?? '', Motivo: c.motivo }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 55 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 9 }, { wch: 90 }];
  hoja['!autofilter'] = { ref: hoja['!ref'] };
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Mínimos de barco');
  XLSX.writeFile(libro, xlsxPath);
}
