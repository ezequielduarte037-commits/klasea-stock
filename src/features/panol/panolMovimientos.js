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
