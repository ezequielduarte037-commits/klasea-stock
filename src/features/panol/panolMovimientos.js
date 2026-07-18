export function fmtDate(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function rowMovementAt(row = {}) {
  return row.egreso_at || row.recepcion_updated_at || row.updated_at || row.created_at || null;
}

export function rowIsAnulado(row = {}) {
  return [row.notas, row.egreso_nota, row.source, row.recepcion_nota, row.stock_nota]
    .some((value) => String(value || "").toLowerCase().includes("[anulado]"));
}

/* ── Cálculo de stock (lógica CANÓNICA, copiada de StockWmsPanel) ──────────────
 *
 * El stock no se guarda: se calcula sumando el ledger (panol_obra_materiales_snapshot).
 * Estas funciones definen QUÉ fila suma, cuál resta y cuál no cuenta.
 *
 * Viven acá para que todas las pantallas den EL MISMO número. Antes cada pantalla
 * tenía su copia y alcanzaba con que una divergiera para mostrar un stock distinto
 * al de al lado. Ojo: StockWmsPanel / StockPanolScreen / MapaPanolTab todavía
 * tienen su copia local y habría que migrarlas a estas.
 */

const IN_STOCK_STATES = new Set(["en_panol", "recibido", "parcial"]);
const RECEIVED_STATES = new Set(["recibido", "parcial"]);
const DIRECT_STOCK_SOURCES = new Set(["stock_general", "remito", "transferencia_ingreso", "ajuste_ingreso"]);

function qtyNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function rowSource(row = {}) {
  return String(row.source || "").trim();
}

export function rowIsEgreso(row = {}) {
  const source = rowSource(row);
  return !!row.egreso_destino_obra_id
    || row.estado === "egresado"
    || source.startsWith("egreso")
    || source.startsWith("transferencia_egreso");
}

export function rowIsLocationChange(row = {}) {
  return rowSource(row) === "ajuste_ubicacion";
}

export function rowIsDirectStock(row = {}) {
  const source = rowSource(row);
  return DIRECT_STOCK_SOURCES.has(source) || source.startsWith("stock_") || source.startsWith("transferencia_ingreso");
}

export function rowCountsAsStock(row = {}) {
  if (rowIsLocationChange(row)) return false;
  if (!IN_STOCK_STATES.has(row.estado)) return false;
  const recepcion = String(row.recepcion_estado || "").trim();
  if (RECEIVED_STATES.has(recepcion)) return true;
  if (rowIsDirectStock(row)) return true;
  return false;
}

/**
 * Cuánto suma (o resta) una fila del ledger al stock disponible.
 * Lo que no es stock ni egreso devuelve 0 — por ejemplo lo que está en tránsito:
 * NO se cuenta hasta que se recibe.
 */
export function rowDelta(row = {}) {
  if (rowCountsAsStock(row)) return qtyNum(row.cantidad, 1);
  if (rowIsEgreso(row)) return -Math.abs(qtyNum(row.cantidad_egresada, qtyNum(row.cantidad, 1)));
  return 0;
}

/** Agrupa el stock del ledger por material_id, con desglose por sede. */
export function stockPorMaterial(rows = []) {
  const byId = new Map();
  for (const row of rows) {
    if (!row.material_id) continue;
    const delta = rowDelta(row);
    const actual = byId.get(row.material_id) ?? { total: 0, sedes: new Map(), movimientos: 0 };
    const sede = row.stock_sede || row.panol_envio?.sede || "Sin sede";
    actual.total += delta;
    actual.sedes.set(sede, (actual.sedes.get(sede) ?? 0) + delta);
    actual.movimientos += 1;
    byId.set(row.material_id, actual);
  }
  return byId;
}
