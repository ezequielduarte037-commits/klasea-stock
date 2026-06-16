export function fmtMoney(value, moneda) {
  if (value == null || value === "") return "Sin precio";
  const n = Number(value);
  if (!Number.isFinite(n)) return "Sin precio";
  const prefix = moneda === "USD" ? "USD " : moneda === "ARS" ? "$ " : "";
  return `${prefix}${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

export function fmtDate(value) {
  if (!value) return "sin fecha";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "sin fecha";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
