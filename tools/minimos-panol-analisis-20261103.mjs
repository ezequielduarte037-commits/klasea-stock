// Análisis de consumo para proponer stock mínimo (03/11/2026). Lee lo que bajó
// minimos-panol-datos-20261103.mjs y deja una fila por material en perfil.json.
import fs from 'node:fs';
import { buildProductGroups } from '../src/features/panol/stockGrupos.js';
import { rowHasRecordedEgreso, rowIsAnulado, rowSource } from '../src/features/panol/panolMovimientos.js';

const dir = process.argv[2];
const read = (name) => JSON.parse(fs.readFileSync(`${dir}/${name}.json`, 'utf8'));
const materiales = read('materiales');
const categorias = read('categorias');
const snapshot = read('snapshot');
const movs = read('movs');
const cstock = read('cstock');
const config = read('config');

const HOY = new Date('2026-11-03T20:00:00Z');
const DIA = 86400000;
const num = (v, f = 0) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : f; };
const catById = new Map(categorias.map((c) => [c.id, c]));
const cfgById = new Map(config.map((c) => [c.material_id, c]));
const stockCons = new Map(cstock.map((s) => [s.material_id, s]));
const matById = new Map(materiales.map((m) => [m.id, m]));

// Salidas que son consumo. Las transferencias y reclasificaciones mueven stock
// entre obras/sedes/productos: no son consumo.
const NO_CONSUMO = new Set(['transferencia_egreso', 'transferencia_ingreso', 'reclasificacion_egreso', 'reclasificacion_ingreso', 'conteo_fisico_reversion', 'egreso_migracion_producto', 'egreso_regularizacion_identidad', 'ajuste_ubicacion']);

const perfil = new Map();
function p(id) {
  if (!perfil.has(id)) perfil.set(id, { salidas: [], precios: [], porObra: new Map(), obras: new Set(), obrasConStock: new Set(), ingresosLibres: 0, ingresosObra: 0, enMatriz: false, matrizObras: new Set() });
  return perfil.get(id);
}

for (const row of snapshot) {
  if (!row.material_id || rowIsAnulado(row)) continue;
  const m = matById.get(row.material_id);
  if (!m) continue;
  const src = rowSource(row);
  const x = p(row.material_id);
  const precio = num(row.precio_unitario, 0);
  if (precio > 0) x.precios.push(String(row.moneda || 'ARS').toUpperCase() === 'USD' ? precio : precio / 1540);
  if (src === 'matriz' || src === 'obra_matriz') { x.enMatriz = true; if (row.obra_id) x.matrizObras.add(row.obra_id); }
  if (src === 'solicitud_consumible_retiro') {
    // Retiros de consumibles en papel (ago–oct): consumo, aunque quedaron "pendiente".
    x.salidas.push({ at: row.created_at, cant: Math.abs(num(row.cantidad, 1)), obra: row.obra_id, legado: true });
    if (row.obra_id) x.obras.add(row.obra_id);
    continue;
  }
  if (['remito', 'stock_general', 'manual', 'conteo_fisico', 'compra'].includes(src) && ['en_panol', 'recibido', 'parcial', 'egresado'].includes(row.estado)) {
    if (row.obra_id) x.ingresosObra += 1; else x.ingresosLibres += 1;
  }
  if (NO_CONSUMO.has(src)) continue;
  if (!rowHasRecordedEgreso(row)) continue;
  const cant = Math.abs(num(row.cantidad_egresada, num(row.cantidad, 1)));
  const destino = row.egreso_destino_obra_id || row.obra_id || null;
  x.salidas.push({ at: row.egreso_at || row.updated_at || row.created_at, cant, obra: destino });
  if (destino) { x.obras.add(destino); x.porObra.set(destino, (x.porObra.get(destino) || 0) + cant); }
}

for (const mv of movs) {
  if (mv.anulado_at || mv.tipo !== 'retiro') continue;
  const x = p(mv.material_id);
  x.salidas.push({ at: mv.created_at, cant: Math.abs(num(mv.cantidad, 0)), obra: mv.obra_id, nuevo: true });
  if (mv.obra_id) x.obras.add(mv.obra_id);
}

// Stock libre del maestro, con la misma cuenta que la pantalla.
const filasBarco = snapshot.filter((r) => r.material_id && !matById.get(r.material_id)?.es_consumible);
const grupos = buildProductGroups(filasBarco, 'todas');
const libreById = new Map();
for (const g of grupos) {
  const id = g.material?.id || g.rows?.[0]?.material_id;
  if (!id) continue;
  const prev = libreById.get(id) || { libre: 0, total: 0, reservado: 0 };
  prev.libre += g.stockLibre ?? g.total; prev.total += g.total; prev.reservado += g.stockReservado || 0;
  libreById.set(id, prev);
}

const filas = [];
for (const m of materiales) {
  if (m.activo === false) continue;
  const x = perfil.get(m.id) || p(m.id);
  const cat = catById.get(m.categoria_id);
  const padre = cat?.parent_id ? catById.get(cat.parent_id) : null;
  const salidas = x.salidas.filter((s) => s.at);
  const ts = salidas.map((s) => new Date(s.at).getTime());
  const primera = ts.length ? Math.min(...ts) : null;
  const semanas = new Set(salidas.map((s) => Math.floor((new Date(s.at).getTime() - Date.UTC(2026, 6, 6)) / (7 * DIA))));
  const ultimos90 = salidas.filter((s) => HOY - new Date(s.at) <= 90 * DIA);
  const nuevos = salidas.filter((s) => s.nuevo);
  const cfg = cfgById.get(m.id);
  const sc = stockCons.get(m.id);
  const lb = libreById.get(m.id);
  filas.push({
    id: m.id,
    codigo: m.codigo,
    descripcion: m.descripcion,
    unidad: cfg?.unidad_entrega || m.unidad_medida || 'unidad',
    rubro: [padre?.nombre, cat?.nombre].filter(Boolean).join(' / '),
    proveedor: m.proveedor || cfg?.proveedor_nombre || '',
    consumible: m.es_consumible === true,
    requisito: m.es_requisito === true,
    minimoActual: m.stock_minimo,
    eventos: salidas.length,
    eventos90: ultimos90.length,
    cant90: ultimos90.reduce((a, s) => a + s.cant, 0),
    cantTotal: salidas.reduce((a, s) => a + s.cant, 0),
    eventosNuevos: nuevos.length,
    cantNuevos: nuevos.reduce((a, s) => a + s.cant, 0),
    semanasConSalida: semanas.size,
    primeraSalida: primera ? new Date(primera).toISOString().slice(0, 10) : null,
    ultimaSalida: ts.length ? new Date(Math.max(...ts)).toISOString().slice(0, 10) : null,
    obras: x.obras.size,
    obras90: new Set(ultimos90.map((s) => s.obra).filter(Boolean)).size,
    enMatriz: x.enMatriz,
    matrizObras: x.matrizObras.size,
    ingresosLibres: x.ingresosLibres,
    ingresosObra: x.ingresosObra,
    porBarco: (() => { const v = [...x.porObra.values()].sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : 0; })(),
    precioUsd: (() => { const v = [...x.precios].sort((a, b) => a - b); return v.length ? Math.round(v[Math.floor((v.length - 1) / 2)]) : null; })(),
    retiros: x.salidas.filter((s) => s.nuevo).map((s) => s.cant),
    maxRetiro: salidas.reduce((a, s) => Math.max(a, s.cant), 0),
    stockLibre: m.es_consumible ? (sc?.stock ?? null) : (lb ? Math.round(lb.libre * 100) / 100 : 0),
    stockTotal: m.es_consumible ? (sc?.stock ?? null) : (lb ? Math.round(lb.total * 100) / 100 : 0),
    contado: m.es_consumible ? Boolean(sc?.ultimo_conteo_at) : null,
    loteCompra: cfg?.lote_compra ?? null,
    factorCompra: cfg?.factor_compra ?? null,
    unidadCompra: cfg?.unidad_compra ?? null,
    stockMaximo: cfg?.stock_maximo ?? null,
    costoArs: cfg?.costo_unitario_ars ?? null,
    favorito: cfg?.favorito_orden ?? null,
  });
}
fs.writeFileSync(`${dir}/perfil.json`, JSON.stringify(filas, null, 1));
console.log('materiales activos', filas.length, 'con salidas', filas.filter((f) => f.eventos).length);
