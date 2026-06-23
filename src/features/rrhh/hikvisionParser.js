// Parser del export "AllReport" del fichero Hikvision (.xls BIFF viejo).
// Lee la hoja "Attendance Record": una fila por empleado, una columna por día
// del período, y en cada celda las fichadas del día apiladas ("06:45\n16:00\n").
//
// Estructura observada del archivo real (índices 0-based, sin header):
//   fila 2: "Create Time:2026/06/12 13:56:51"
//   fila 3: "Made Date:2026/06/10-2026/06/12"   ← rango del período
//   fila 4: Employee ID | Name | Department | 10 | 11 | 12 ...  ← días del mes
//   fila 6+: datos (la 5 es subheader vacío)
//
// Employee ID = DNI = rrhh_empleados.dni (la llave de cruce con el maestro).

import * as XLSX from "xlsx";

const TIME_RE = /^\d{1,2}:\d{2}$/;

function pad2(n) { return String(n).padStart(2, "0"); }

function parseMadeDate(text) {
  // "Made Date:2026/06/10-2026/06/12"
  const m = String(text ?? "").match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return {
    desde: { y: +m[1], mo: +m[2], d: +m[3] },
    hasta: { y: +m[4], mo: +m[5], d: +m[6] },
  };
}

function isoOf({ y, mo, d }) { return `${y}-${pad2(mo)}-${pad2(d)}`; }

// Un número de día de columna → fecha completa, resolviendo cruces de mes
// (ej. período 28/05-04/06: día 29 → mayo, día 02 → junio).
function dayToDate(day, periodo) {
  const { desde, hasta } = periodo;
  if (desde.y === hasta.y && desde.mo === hasta.mo) {
    return isoOf({ y: desde.y, mo: desde.mo, d: day });
  }
  return day >= desde.d
    ? isoOf({ y: desde.y, mo: desde.mo, d: day })
    : isoOf({ y: hasta.y, mo: hasta.mo, d: day });
}

const GAP_SALIDA_MIN = 60; // fichadas más cercanas que esto = mismo evento (duplicado del fichero), no salida
function fichaToMin(s) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(s || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function parsePunches(cell) {
  if (cell == null) return [];
  return String(cell)
    .split(/[\n\r]+/)
    .map(s => s.trim())
    .filter(s => TIME_RE.test(s))
    .map(s => (s.length === 4 ? `0${s}` : s)); // 7:04 → 07:04
}

/**
 * Parsea el ArrayBuffer de un AllReport_*.xls.
 * Devuelve { periodo: {desde, hasta}, dias: [...], empleados: [{dni, nombre, marcaciones: [...]}] }
 * donde cada marcación es { fecha, entrada, salida, fichadas }.
 * Lanza Error con mensaje en español si el formato no es el esperado.
 */
export function parseHikvisionReport(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: false });

  const sheetName = wb.SheetNames.find(n => /attendance\s*record/i.test(n));
  if (!sheetName) {
    throw new Error(`No encontré la hoja "Attendance Record". Hojas del archivo: ${wb.SheetNames.join(", ")}. ¿Es el export "AllReport" del Hikvision?`);
  }

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: null });

  // Período: buscar "Made Date:" en las primeras filas
  let periodo = null;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    for (const cell of rows[i] ?? []) {
      const p = parseMadeDate(cell);
      if (p) { periodo = p; break; }
    }
    if (periodo) break;
  }
  if (!periodo) throw new Error('No encontré el rango de fechas ("Made Date:...") en el archivo.');

  // Header: fila que empieza con "Employee ID"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    if (String(rows[i]?.[0] ?? "").trim().toLowerCase() === "employee id") { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error('No encontré la fila de encabezados ("Employee ID").');

  // Columnas de día: celdas numéricas (1-31) después de Department
  const header = rows[headerIdx];
  const dayCols = []; // [{col, fecha}]
  for (let c = 3; c < header.length; c++) {
    const v = header[c];
    if (v == null || v === "") continue;
    const day = Number(String(v).trim());
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      dayCols.push({ col: c, fecha: dayToDate(day, periodo) });
    }
  }
  if (!dayCols.length) throw new Error("No encontré columnas de días en el encabezado.");

  const empleados = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const dni = String(r[0] ?? "").trim();
    const nombre = String(r[1] ?? "").replace(/\s+/g, " ").trim();
    if (!/^\d{5,10}$/.test(dni) || !nombre) continue; // subheaders / filas basura

    const marcaciones = [];
    for (const { col, fecha } of dayCols) {
      const fichadas = parsePunches(r[col]);
      if (!fichadas.length) continue; // sin fichadas ese día = ausente, no se crea fila
      const ult = fichadas[fichadas.length - 1];
      const eMin = fichaToMin(fichadas[0]);
      const uMin = fichaToMin(ult);
      const salida = fichadas.length >= 2 && eMin != null && uMin != null && uMin - eMin >= GAP_SALIDA_MIN ? ult : null;
      marcaciones.push({ fecha, entrada: fichadas[0], salida, fichadas });
    }
    empleados.push({ dni, nombre, marcaciones });
  }

  if (!empleados.length) throw new Error("El archivo no tiene filas de empleados con datos.");

  return {
    periodo: { desde: isoOf(periodo.desde), hasta: isoOf(periodo.hasta) },
    dias: dayCols.map(d => d.fecha),
    empleados,
    totalMarcaciones: empleados.reduce((acc, e) => acc + e.marcaciones.length, 0),
  };
}
