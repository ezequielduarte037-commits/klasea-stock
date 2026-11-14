import { rowIsAnulado } from "../../panol/panolMovimientos.js";

const esRemito = (row) => row?.source === "remito" || row?.snapshot_tipo === "remito";
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
