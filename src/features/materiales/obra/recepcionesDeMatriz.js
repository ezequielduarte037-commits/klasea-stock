import { rowIsAnulado } from "../../panol/panolMovimientos.js";

// La recepción de una compra para la obra (source "compra") es un ingreso
// igual que un remito: Pañol y las revisiones ya la cuentan así. Si no, se
// quedaba con la fila y su cantidad pasaba a ser lo que "pide" la matriz (55-4:
// 20 bisagras compradas tapaban las 22 que pide la matriz).
const esRemito = (row) => ["remito", "compra"].includes(row?.source) || ["remito", "compra"].includes(row?.snapshot_tipo);
const esAdicional = (row) => row?.es_adicional === true || ["addon", "adicional_obra"].includes(row?.source) || row?.bucket?.key === "addon";

/** Una recepción acredita mercadería; nunca cambia lo que requiere la matriz. */
export function separarRecepcionesDeMatriz(liveRows, snapshots, { keyOf, esSoloMovimiento, tieneAdicional }) {
  const necesidades = new Map();
  for (const row of [...liveRows, ...snapshots]) {
    if (esRemito(row) || esAdicional(row) || esSoloMovimiento(row)) continue;
    const key = keyOf(row);
    if (!necesidades.has(key)) necesidades.set(key, []);
    necesidades.get(key).push(row);
  }
  return snapshots.map((row) => {
    if (!esRemito(row) || esAdicional(row) || tieneAdicional(row)) return row;
    const anclas = necesidades.get(keyOf(row));
    if (!anclas?.length) return row;
    const duplicada = !!row.panol_envio_item_id && anclas.some((ancla) => ancla.panol_envio_item_id === row.panol_envio_item_id);
    const anulada = rowIsAnulado({ ...row, notas: row.obs, egreso_nota: row.egreso_nota });
    return { ...row, soloMovimientoDeMatriz: true, omitirMovimientoDeMatriz: duplicada || anulada };
  });
}
