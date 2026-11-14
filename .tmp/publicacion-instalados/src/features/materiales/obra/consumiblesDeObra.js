/**
 * Consumibles retirados para una obra.
 *
 * Los consumibles no son parte de la lista del barco (pedido de Ezequiel,
 * 03/11/2026): tienen su propio stock en Consumibles. La lista los saca y los
 * muestra aparte, como lo que se consumió. Hay dos registros:
 * - desde el 13/10/2026, `consumibles_movimientos` (retiros con obra);
 * - antes, renglones del snapshot de la obra (`solicitud_consumible_retiro` y
 *   retiros parciales), que quedaron colgados como "pendiente" en la lista.
 */
import { rowIsAnulado } from "../../panol/panolMovimientos.js";

function num(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Renglón del snapshot de una obra que pertenece a Consumibles y no a la lista del barco. */
export function esFilaDeConsumible(row, consumibleIds) {
  if (String(row?.source || "").toLowerCase() === "solicitud_consumible_retiro") return true;
  const materialId = row?.requisito_material_id || row?.material_id;
  return !!materialId && !!consumibleIds?.has(materialId);
}

/** Cuánto consumió la obra según un renglón viejo del snapshot (0 si no fue un retiro). */
export function consumoDeFilaVieja(row) {
  if (rowIsAnulado(row)) return 0;
  if (String(row?.source || "").toLowerCase() === "solicitud_consumible_retiro") return Math.abs(num(row.cantidad));
  if (String(row?.estado || "").toLowerCase() === "egresado") return Math.abs(num(row.cantidad_egresada) || num(row.cantidad));
  return 0;
}

/**
 * Agrupa por producto. `movimientos` son filas de consumibles_movimientos
 * (retiro suma, devolución resta; los anulados no cuentan) y `filasViejas`
 * renglones del snapshot ya filtrados con `esFilaDeConsumible`.
 */
export function agruparConsumidos({ movimientos = [], filasViejas = [] } = {}) {
  const porProducto = new Map();
  const sumar = (key, datos, cantidad, fecha, esRetiro) => {
    if (!cantidad) return;
    if (!porProducto.has(key)) porProducto.set(key, { key, ...datos, cantidad: 0, retiros: 0, ultimo: null });
    const item = porProducto.get(key);
    if (!item.descripcion && datos.descripcion) item.descripcion = datos.descripcion;
    item.cantidad += cantidad;
    if (esRetiro) item.retiros += 1;
    if (fecha && (!item.ultimo || fecha > item.ultimo)) item.ultimo = fecha;
  };

  for (const mov of movimientos) {
    if (mov?.anulado_at) continue;
    const tipo = String(mov?.tipo || "");
    if (tipo !== "retiro" && tipo !== "devolucion") continue;
    const material = mov.material || {};
    const cantidad = Math.abs(num(mov.cantidad)) * (tipo === "devolucion" ? -1 : 1);
    sumar(mov.material_id || `mov:${mov.id}`, {
      materialId: mov.material_id || null,
      descripcion: material.descripcion || "",
      unidad: material.config?.unidad_entrega || material.unidad_medida || "unidad",
    }, cantidad, mov.created_at || null, tipo === "retiro");
  }

  for (const row of filasViejas) {
    const cantidad = consumoDeFilaVieja(row);
    const materialId = row?.requisito_material_id || row?.material_id || null;
    sumar(materialId || `texto:${String(row?.descripcion || "").trim().toLowerCase()}`, {
      materialId,
      descripcion: row?.descripcion || "",
      unidad: row?.unidad || "unidad",
    }, cantidad, row?.egreso_at || row?.created_at || null, true);
  }

  return [...porProducto.values()]
    .filter((item) => item.cantidad > 0.0001)
    .sort((a, b) => String(b.ultimo || "").localeCompare(String(a.ultimo || "")) || a.descripcion.localeCompare(b.descripcion, "es"));
}
