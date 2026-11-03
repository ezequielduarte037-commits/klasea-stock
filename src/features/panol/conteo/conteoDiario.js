/*
 * Conteo diario del pañol: qué 20 productos se cuentan hoy y contra qué número
 * se comparan. La base guarda la lista y aplica los ajustes
 * (migración 20261103120000_panol_conteo_diario.sql); la elección vive acá
 * porque necesita la misma cuenta de stock que el resto de las pantallas.
 *
 * Reparto (propuesta del 03/11/2026):
 *   7 de los más movidos (A, cada 30 días) · 5 intermedios (B, cada 90)
 *   5 del resto (C, cada 180) · 3 por evento (negativo, ubicaciones que no
 *   cierran, ficha con problema). Lo que quedó sin contar ayer va primero.
 */
import { qty, rowObraId, rowSede } from "../stockGrupos.js";
import { rowDelta, rowMovementAt } from "../panolMovimientos.js";

export const CONTEO_CUPOS = { evento: 3, A: 7, B: 5, C: 5 };
export const CONTEO_TOTAL = 20;
export const CONTEO_CADA_DIAS = { A: 30, B: 90, C: 180 };
const DIA_MS = 86400000;
const VENTANA_MOVIMIENTO_DIAS = 90;
const EVENTO_REPOSO_DIAS = 7;

export const CONTEO_ESTADOS = {
  pendiente: { label: "Por contar", tono: "cyan" },
  ok: { label: "Coincide", tono: "green" },
  ajustado: { label: "Ajustado", tono: "blue" },
  recontar: { label: "Segundo conteo", tono: "violet" },
  revisar: { label: "A revisar", tono: "red" },
  descartado: { label: "Descartado", tono: "dim" },
  pasado: { label: "Pasó al día siguiente", tono: "dim" },
};

export const CONTEO_CLASES = {
  A: "Mucho movimiento",
  B: "Movimiento medio",
  C: "Poco movimiento",
  evento: "Por evento",
  arrastre: "Quedó de otro día",
};

// Fecha local AAAA-MM-DD (el lote es "de hoy" en Argentina, no en UTC).
export function fechaLocal(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Generador chico y determinista: dos equipos que arman la lista del mismo día
// eligen lo mismo aunque la base se quede con la primera.
function semilla(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function azar(seed) {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Movimientos del producto en los últimos 90 días: la medida de "cuánto se usa". */
export function movimientosRecientes(group, now = new Date()) {
  const desde = now.getTime() - VENTANA_MOVIMIENTO_DIAS * DIA_MS;
  return (group.rows || []).filter((row) => {
    if (Math.abs(rowDelta(row)) < 0.0001) return false;
    const ts = rowMovementAt(row);
    return ts && new Date(ts).getTime() >= desde;
  }).length;
}

/**
 * Clase A/B/C de cada producto con stock, por movimiento (y valor en USD cuando
 * lo hay, porque muchas fichas no tienen precio). A = 15 % de arriba, B = 30 %.
 */
export function clasificarABC(groups = [], now = new Date()) {
  const puntaje = groups.map((group) => ({
    group,
    score: movimientosRecientes(group, now) + (qty(group.valueUsd, 0) > 0 ? Math.log10(1 + qty(group.valueUsd, 0)) * 2 : 0),
  })).sort((a, b) => b.score - a.score || String(a.group.label).localeCompare(String(b.group.label), "es"));
  const n = puntaje.length;
  const corteA = Math.ceil(n * 0.15);
  const corteB = Math.ceil(n * 0.45);
  const clases = new Map();
  puntaje.forEach((item, index) => {
    clases.set(item.group.material.id, index < corteA ? "A" : index < corteB ? "B" : "C");
  });
  return clases;
}

function motivoEvento(group) {
  if (group.negativo) return "Stock negativo en el sistema";
  if (group.locationImbalance) return "Las ubicaciones no cierran";
  if (group.verificacion === "problema") return "Ficha marcada con problema";
  return "";
}

/**
 * Arma la lista del día.
 *   groups: buildProductGroups de las filas de la sede (sin consumibles).
 *   ultimoConteo: Map material_id → fecha del último conteo terminado.
 *   arrastre: renglones de días anteriores que quedaron sin contar
 *             ([{ material_id, fecha }]).
 * Devuelve [{ material_id, clase, motivo, unidad }].
 */
export function elegirConteoDelDia(groups = [], { ultimoConteo = new Map(), arrastre = [], sede = "", fecha = fechaLocal(), now = new Date(), total = CONTEO_TOTAL } = {}) {
  const contables = groups.filter((group) => group.material?.id && !group.esRequisito);
  const byId = new Map(contables.map((group) => [group.material.id, group]));
  const elegidos = new Map();
  const agregar = (group, clase, motivo) => {
    if (!group || elegidos.size >= total || elegidos.has(group.material.id)) return;
    elegidos.set(group.material.id, { material_id: group.material.id, clase, motivo: motivo || CONTEO_CLASES[clase], unidad: group.unidad || "unidad" });
  };

  for (const item of arrastre) {
    agregar(byId.get(item.material_id), "arrastre", item.fecha ? `Quedó del ${item.fecha.split("-").reverse().slice(0, 2).join("/")}` : CONTEO_CLASES.arrastre);
  }

  const diasDesde = (materialId) => {
    const at = ultimoConteo.get(materialId);
    return at ? (now.getTime() - new Date(at).getTime()) / DIA_MS : Infinity;
  };
  const rand = azar(semilla(`${sede}|${fecha}`));
  const orden = (lista) => lista
    .map((group) => ({ group, dias: diasDesde(group.material.id), r: rand() }))
    .sort((a, b) => (b.dias === a.dias ? a.r - b.r : b.dias - a.dias))
    .map((item) => item.group);

  // Eventos: lo dudoso, salvo que se haya contado en la última semana.
  const eventos = orden(contables.filter((group) => motivoEvento(group) && diasDesde(group.material.id) > EVENTO_REPOSO_DIAS));
  eventos.slice(0, CONTEO_CUPOS.evento).forEach((group) => agregar(group, "evento", motivoEvento(group)));

  const conStock = contables.filter((group) => qty(group.total, 0) > 0.0001);
  const clases = clasificarABC(conStock, now);
  const vencidos = { A: [], B: [], C: [] };
  for (const group of conStock) {
    const clase = clases.get(group.material.id);
    if (diasDesde(group.material.id) > CONTEO_CADA_DIAS[clase]) vencidos[clase].push(group);
  }
  const ordenados = { A: orden(vencidos.A), B: orden(vencidos.B), C: orden(vencidos.C) };
  for (const clase of ["A", "B", "C"]) {
    ordenados[clase].slice(0, CONTEO_CUPOS[clase]).forEach((group) => agregar(group, clase));
  }
  // Si una clase no llenó su cupo, se completa con lo vencido de las otras y,
  // al final, con lo que hace más tiempo no se cuenta.
  for (const clase of ["A", "B", "C"]) ordenados[clase].forEach((group) => agregar(group, clase));
  orden(conStock).forEach((group) => agregar(group, clases.get(group.material.id)));

  return [...elegidos.values()];
}

/**
 * Lo que dice el sistema para un material en una sede, con las filas del
 * ledger de ese material: total físico (lo libre más lo reservado a obras,
 * porque se cuenta todo lo que hay en el estante) y lo libre.
 */
export function teoricoEnSede(rows = [], materialId, sede) {
  let total = 0;
  let libre = 0;
  for (const row of rows) {
    if (row.material_id !== materialId || rowSede(row) !== sede) continue;
    const delta = rowDelta(row);
    total += delta;
    if (!rowObraId(row)) libre += delta;
  }
  return { total: Math.round(total * 10000) / 10000, libre: Math.round(libre * 10000) / 10000 };
}

/** Exactitud: de lo contado y cerrado, cuánto dio igual al sistema. */
export function exactitud(items = []) {
  const cerrados = items.filter((item) => ["ok", "ajustado", "revisar", "descartado"].includes(item.estado));
  if (!cerrados.length) return null;
  const ok = cerrados.filter((item) => item.estado === "ok").length;
  return { cerrados: cerrados.length, ok, porcentaje: Math.round((ok / cerrados.length) * 100) };
}
