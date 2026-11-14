/**
 * Productos a crear: lo que entró al pañol sin ficha en el catálogo.
 *
 * Desde el 19/10/2026 pañol no da de alta productos de los barcos (sólo
 * consumibles). Si en un remito llega algo que no está en el catálogo, el
 * renglón entra igual, sin producto, y queda acá para que Técnica lo cree o lo
 * vincule a uno existente. También aparecen los renglones viejos sin producto.
 *
 * Un "producto a crear" son los renglones del ledger sin `material_id` con la
 * misma descripción y código (la misma identidad que usa el stock maestro).
 * El saldo sale de la cuenta canónica (rowDelta).
 */

import { productKey, rowObraLabel, rowSede } from "./stockGrupos.js";
import { rowCountsAsStock, rowDelta, rowHasRecordedEgreso, rowIsAnulado, rowIsLocationChange, rowMovementAt } from "./panolMovimientos.js";

const DIA = 86_400_000;
export const DIAS_RECIENTES = 60;

/** Un movimiento real (stock o salida) sin producto del catálogo ni requisito. */
export function renglonSinProducto(row = {}) {
  if (row.material_id || row.requisito_material_id) return false;
  if (!String(row.descripcion || "").trim()) return false;
  if (rowIsLocationChange(row) || rowIsAnulado(row)) return false;
  return rowCountsAsStock(row) || rowHasRecordedEgreso(row);
}

/**
 * Agrupa los renglones sin producto. Se muestra lo que todavía tiene saldo y lo
 * que se movió en los últimos `dias` (aunque ya haya salido, vincularlo deja
 * el kardex completo). Lo más reciente primero.
 */
export function productosACrear(rows = [], { ahora = Date.now(), dias = DIAS_RECIENTES } = {}) {
  const grupos = new Map();
  for (const row of rows) {
    if (!renglonSinProducto(row)) continue;
    const key = productKey(row, "todas");
    let g = grupos.get(key);
    if (!g) {
      g = {
        key,
        descripcion: String(row.descripcion).trim(),
        codigo: String(row.codigo || "").trim(),
        unidad: row.unidad || "unidad",
        proveedor: String(row.proveedor || "").trim(),
        enStock: 0,
        filas: [],
        sedes: new Set(),
        obras: new Set(),
        ultimo: null,
        quien: "",
      };
      grupos.set(key, g);
    }
    g.filas.push(row);
    g.enStock += rowDelta(row);
    if (!g.proveedor && row.proveedor) g.proveedor = String(row.proveedor).trim();
    if (rowSede(row)) g.sedes.add(rowSede(row));
    if (row.obra_id) g.obras.add(rowObraLabel(row));
    const at = rowMovementAt(row);
    if (at && (!g.ultimo || new Date(at) > new Date(g.ultimo))) {
      g.ultimo = at;
      g.quien = row.egreso_por_nombre || row.created_by_nombre || "";
    }
  }
  const desde = ahora - dias * DIA;
  return [...grupos.values()]
    .map((g) => ({
      ...g,
      enStock: Math.round(g.enStock * 1000) / 1000,
      sedes: [...g.sedes].sort(),
      obras: [...g.obras].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
      ids: g.filas.map((f) => f.id).filter(Boolean),
    }))
    .filter((g) => g.enStock > 0.0001 || (g.ultimo && new Date(g.ultimo).getTime() >= desde))
    .sort((a, b) => new Date(b.ultimo || 0) - new Date(a.ultimo || 0));
}

/** Fichas provisionales anteriores al circuito sin ficha, con movimientos reales. */
export function fichasPanolPorConfirmar(catalogo = [], rows = [], { ahora = Date.now(), dias = DIAS_RECIENTES } = {}) {
  const catalogoById = new Map(catalogo.filter((m) => m.revisado !== true && m.activo !== false && !m.es_consumible && !m.es_requisito).map((m) => [m.id, m]));
  const grupos = new Map();
  for (const row of rows) {
    const material = catalogoById.get(row.material_id);
    if (!material || rowIsAnulado(row) || rowIsLocationChange(row) || !(rowCountsAsStock(row) || rowHasRecordedEgreso(row))) continue;
    let g = grupos.get(material.id);
    if (!g) {
      g = { key: `ficha:${material.id}`, materialId: material.id, descripcion: material.descripcion, codigo: material.codigo || "", unidad: material.unidad_medida || "unidad", proveedor: material.proveedor || "", quien: material.created_by_nombre || "Pañol", enStock: 0, ids: [], sedes: new Set(), obras: new Set(), descripcionesIngreso: new Set(), ultimo: null };
      grupos.set(material.id, g);
    }
    g.ids.push(row.id);
    g.enStock += rowDelta(row);
    if (rowSede(row)) g.sedes.add(rowSede(row));
    if (row.obra_id) g.obras.add(rowObraLabel(row));
    if (row.descripcion && row.descripcion !== material.descripcion) g.descripcionesIngreso.add(row.descripcion);
    const at = rowMovementAt(row);
    if (at && (!g.ultimo || new Date(at) > new Date(g.ultimo))) g.ultimo = at;
  }
  const desde = ahora - dias * DIA;
  return [...grupos.values()].filter((g) => g.enStock > 0.0001 || (g.ultimo && new Date(g.ultimo).getTime() >= desde))
    .map((g) => ({ ...g, enStock: Math.round(g.enStock * 1000) / 1000, sedes: [...g.sedes].sort(), obras: [...g.obras].sort(), descripcionesIngreso: [...g.descripcionesIngreso] }))
    .sort((a, b) => new Date(b.ultimo || 0) - new Date(a.ultimo || 0));
}

/** ¿Puede este perfil dar de alta productos de los barcos? Pañol, no. */
export function puedeCrearProductosDeBarco(profile) {
  if (!profile) return false;
  if (profile.is_admin) return true;
  return String(profile.role || "").toLowerCase() !== "panol";
}
