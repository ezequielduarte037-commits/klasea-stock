export const OBRA_PAGE_SIZE = 50;

export const obraThemeScope = { "--amber": "var(--violet)", "--amber-soft": "var(--violet-soft)", "--amber-border": "var(--violet-border)", "--amber-deep": "var(--violet-deep)" };

// Presentation only: never change the source rows or the order used by purchases.
export function paginateObraGroups(groups, requestedPage, pageSize = OBRA_PAGE_SIZE) {
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(pageCount, Math.trunc(Number(requestedPage)) || 1));
  const start = (page - 1) * pageSize;
  let offset = 0;
  const pageGroups = [];
  for (const group of groups) {
    const from = Math.max(0, start - offset);
    const to = Math.min(group.rows.length, start + pageSize - offset);
    if (to > from) pageGroups.push({ ...group, rows: group.rows.slice(from, to), allRows: group.rows, offset: offset + from });
    offset += group.rows.length;
  }
  return { groups: pageGroups, page, pageCount, total, start: total ? start + 1 : 0, end: Math.min(start + pageSize, total) };
}

export function toggleObraSelection(selected, rows) {
  const next = new Set(selected);
  const remove = rows.length > 0 && rows.every((row) => next.has(row.id));
  rows.forEach((row) => remove ? next.delete(row.id) : next.add(row.id));
  return next;
}

// "Sin rubro", "Sin categoría" y el rubro vacío son lo mismo: falta clasificar.
// Mostrarlos como grupos distintos partía la lista en dos montoncitos iguales.
export function rubroDeFila(row) {
  const rubro = String(row?.rubro || "").trim();
  return !rubro || /^sin (rubro|categor[ií]a)$/i.test(rubro) ? "Sin rubro" : rubro;
}

// Alfabético, con lo que falta clasificar ("Sin rubro", "Sin proveedor"…) al final.
export function compararEtiquetaGrupo(a = "", b = "") {
  const sinA = /^sin /i.test(a) || a === "Sin clasificar";
  const sinB = /^sin /i.test(b) || b === "Sin clasificar";
  if (sinA !== sinB) return sinA ? 1 : -1;
  return a.localeCompare(b, "es", { sensitivity: "base" });
}

/**
 * Ordena las filas por una columna de la planilla. `valores` trae cómo leer
 * las columnas calculadas (falta, estado) sin atar este archivo a la pantalla.
 * Lo vacío va siempre al final, suba o baje el orden.
 */
export function ordenarFilas(rows, { key, dir = 1 } = {}, valores = {}) {
  if (!key) return rows;
  const leer = valores[key] || ((row) => row[key]);
  const conValor = rows.map((row, index) => ({ row, index, v: leer(row) }));
  const vacio = (v) => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));
  conValor.sort((a, b) => {
    const va = vacio(a.v), vb = vacio(b.v);
    if (va || vb) return va === vb ? a.index - b.index : va ? 1 : -1;
    const cmp = typeof a.v === "number" && typeof b.v === "number"
      ? a.v - b.v
      : String(a.v).localeCompare(String(b.v), "es", { sensitivity: "base", numeric: true });
    return cmp * dir || a.index - b.index;
  });
  return conValor.map((item) => item.row);
}

export function obraPageNumbers(page, pageCount) {
  return [...new Set([1, page - 1, page, page + 1, pageCount])].filter((number) => number > 0 && number <= pageCount).sort((a, b) => a - b);
}
