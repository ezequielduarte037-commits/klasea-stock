// Parser del export "AllReport" del fichero Hikvision (.xls BIFF viejo).
// Lee la hoja "Attendance Record": una fila por empleado, una columna por dia
// del periodo, y en cada celda las fichadas del dia apiladas ("06:45\n16:00\n").
//
// Employee ID = DNI = rrhh_empleados.dni (la llave de cruce con el maestro).

import * as XLSX from "xlsx";

const TIME_RE = /^\d{1,2}:\d{2}$/;
const GAP_SALIDA_MIN = 60;
const MIN_VALID_PUNCH_MIN = 6 * 60;
const MAX_VALID_PUNCH_MIN = (19 * 60) + 59;
const SINGLE_PUNCH_AS_EXIT_MIN = 12 * 60;

function pad2(n) { return String(n).padStart(2, "0"); }

function parseMadeDate(text) {
  const m = String(text ?? "").match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return {
    desde: { y: +m[1], mo: +m[2], d: +m[3] },
    hasta: { y: +m[4], mo: +m[5], d: +m[6] },
  };
}

function isoOf({ y, mo, d }) { return `${y}-${pad2(mo)}-${pad2(d)}`; }

function dayToDate(day, periodo) {
  const { desde, hasta } = periodo;
  if (desde.y === hasta.y && desde.mo === hasta.mo) {
    return isoOf({ y: desde.y, mo: desde.mo, d: day });
  }
  return day >= desde.d
    ? isoOf({ y: desde.y, mo: desde.mo, d: day })
    : isoOf({ y: hasta.y, mo: hasta.mo, d: day });
}

function fichaToMin(s) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(s || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function normalizePunches(punches) {
  return [...new Set((punches ?? [])
    .map(s => String(s ?? "").trim())
    .filter(s => TIME_RE.test(s))
    .map(s => (s.length === 4 ? `0${s}` : s))
    .filter(s => {
      const min = fichaToMin(s);
      return min != null && min >= MIN_VALID_PUNCH_MIN && min <= MAX_VALID_PUNCH_MIN;
    }))]
    .sort((a, b) => fichaToMin(a) - fichaToMin(b));
}

function resolverEntradaSalida(fichadas) {
  const arr = normalizePunches(fichadas);
  if (!arr.length) return { entrada: null, salida: null, fichadas: [] };

  const primera = arr[0];
  const ultima = arr[arr.length - 1];
  const pMin = fichaToMin(primera);
  const uMin = fichaToMin(ultima);

  if (arr.length === 1) {
    return pMin >= SINGLE_PUNCH_AS_EXIT_MIN
      ? { entrada: null, salida: primera, fichadas: arr }
      : { entrada: primera, salida: null, fichadas: arr };
  }

  if (pMin >= SINGLE_PUNCH_AS_EXIT_MIN) {
    return { entrada: null, salida: ultima, fichadas: arr };
  }

  const salida = pMin != null && uMin != null && uMin - pMin >= GAP_SALIDA_MIN ? ultima : null;
  return { entrada: primera, salida, fichadas: arr };
}

function parsePunches(cell) {
  if (cell == null) return [];
  return normalizePunches(String(cell)
    .split(/[\n\r]+/)
    .map(s => s.trim()));
}

/**
 * Parsea el ArrayBuffer de un AllReport_*.xls.
 * Devuelve { periodo: {desde, hasta}, dias: [...], empleados: [{dni, nombre, marcaciones: [...]}] }
 * donde cada marcacion es { fecha, entrada, salida, fichadas }.
 * Lanza Error con mensaje en espanol si el formato no es el esperado.
 */
export function parseHikvisionReport(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: false });

  const sheetName = wb.SheetNames.find(n => /attendance\s*record/i.test(n));
  if (!sheetName) {
    throw new Error(`No encontre la hoja "Attendance Record". Hojas del archivo: ${wb.SheetNames.join(", ")}. Es el export "AllReport" del Hikvision?`);
  }

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: null });

  let periodo = null;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    for (const cell of rows[i] ?? []) {
      const p = parseMadeDate(cell);
      if (p) { periodo = p; break; }
    }
    if (periodo) break;
  }
  if (!periodo) throw new Error('No encontre el rango de fechas ("Made Date:...") en el archivo.');

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    if (String(rows[i]?.[0] ?? "").trim().toLowerCase() === "employee id") { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error('No encontre la fila de encabezados ("Employee ID").');

  const header = rows[headerIdx];
  const dayCols = [];
  for (let c = 3; c < header.length; c++) {
    const v = header[c];
    if (v == null || v === "") continue;
    const day = Number(String(v).trim());
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      dayCols.push({ col: c, fecha: dayToDate(day, periodo) });
    }
  }
  if (!dayCols.length) throw new Error("No encontre columnas de dias en el encabezado.");

  const empleados = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const dni = String(r[0] ?? "").trim();
    const nombre = String(r[1] ?? "").replace(/\s+/g, " ").trim();
    if (!/^\d{5,10}$/.test(dni) || !nombre) continue;

    const marcaciones = [];
    for (const { col, fecha } of dayCols) {
      const fichadas = parsePunches(r[col]);
      if (!fichadas.length) continue;
      marcaciones.push({ fecha, ...resolverEntradaSalida(fichadas) });
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
