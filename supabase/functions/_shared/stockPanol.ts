/**
 * Stock físico del pañol, para las edge functions.
 *
 * Es la misma cuenta que `src/features/panol/panolMovimientos.js` (la lógica
 * canónica que usan todas las pantallas). Está copiada porque una edge function
 * no puede importar código de `src/`. Si se toca allá, se toca acá: si no, el
 * robot dice un número y la pantalla otro. `stockPanol.test.mjs` compara las dos
 * contra la base.
 */

export type FilaLedger = {
  material_id?: string | null;
  requisito_material_id?: string | null;
  estado?: string | null;
  recepcion_estado?: string | null;
  cantidad?: number | string | null;
  cantidad_egresada?: number | string | null;
  source?: string | null;
  stock_sede?: string | null;
  panol_envio_id?: string | null;
};

const IN_STOCK_STATES = new Set(["en_panol", "recibido", "parcial"]);
const RECEIVED_STATES = new Set(["recibido", "parcial"]);
const DIRECT_STOCK_SOURCES = new Set(["stock_general", "remito", "transferencia_ingreso", "ajuste_ingreso", "reclasificacion_ingreso"]);

function qtyNum(value: unknown, fallback = 0): number {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function rowSource(row: FilaLedger): string {
  return String(row.source || "").trim().toLowerCase();
}

function rowIsEgreso(row: FilaLedger): boolean {
  const source = rowSource(row);
  return source.startsWith("egreso")
    || source.startsWith("transferencia_egreso")
    || source === "reclasificacion_egreso"
    || source === "conteo_fisico_reversion";
}

function rowIsLocationChange(row: FilaLedger): boolean {
  return rowSource(row) === "ajuste_ubicacion";
}

function rowIsDirectStock(row: FilaLedger): boolean {
  const source = rowSource(row);
  return DIRECT_STOCK_SOURCES.has(source) || source.startsWith("stock_") || source.startsWith("transferencia_ingreso");
}

function rowCountsAsStock(row: FilaLedger): boolean {
  if (rowIsLocationChange(row)) return false;
  if (!IN_STOCK_STATES.has(String(row.estado || ""))) return false;
  const recepcion = String(row.recepcion_estado || "").trim();
  if (RECEIVED_STATES.has(recepcion)) return true;
  if (rowIsDirectStock(row)) return true;
  return false;
}

/** Cuánto suma (o resta) una fila del ledger. Igual que `rowDelta` de la app. */
export function rowDelta(row: FilaLedger): number {
  if (rowCountsAsStock(row)) return qtyNum(row.cantidad, 1);
  if (rowIsEgreso(row)) return -Math.abs(qtyNum(row.cantidad_egresada, qtyNum(row.cantidad, 1)));
  return 0;
}

/**
 * Total y desglose por sede de un material. Igual que `stockPorMaterial` de la
 * app: la sede de la fila, si no la del envío, si no "Sin sede".
 */
export function stockDeMaterial(
  materialId: string,
  filas: FilaLedger[],
  sedeDeEnvio: Map<string, string> = new Map(),
): { total: number; porSede: Map<string, number> } {
  let total = 0;
  const porSede = new Map<string, number>();
  for (const fila of filas) {
    if (fila.material_id !== materialId && fila.requisito_material_id !== materialId) continue;
    const delta = rowDelta(fila);
    if (!delta) continue;
    const sede = fila.stock_sede || (fila.panol_envio_id ? sedeDeEnvio.get(fila.panol_envio_id) : "") || "Sin sede";
    total += delta;
    porSede.set(sede, (porSede.get(sede) ?? 0) + delta);
  }
  const redondeo = (n: number) => Math.round(n * 1000) / 1000;
  return { total: redondeo(total), porSede: new Map([...porSede].map(([s, n]) => [s, redondeo(n)])) };
}
