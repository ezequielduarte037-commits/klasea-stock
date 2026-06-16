import * as XLSX from "xlsx";

export const MODELOS = ["37", "52", "55"];

export const TARGET_SECTORES = [
  { sheet: "LAMINACIÓN", nombre: "Laminación", orden: 1 },
  { sheet: "VARIOS Y CARPINTERIA", nombre: "Carpintería y Varios", orden: 2 },
  { sheet: "SANITARIOS", nombre: "Sanitarios", orden: 3 },
  { sheet: "ELECTRICIDAD", nombre: "Electricidad", orden: 4 },
  { sheet: "MECANICA", nombre: "Mecánica", orden: 5 },
  { sheet: "VIDRIOS", nombre: "Vidrios", orden: 6 },
  { sheet: "TAPICERIA", nombre: "Tapicería", orden: 7 },
  { sheet: "GRIFERÍAS", nombre: "Griferías", orden: 8 },
  { sheet: "HERRAJES", nombre: "Herrajes", orden: 9 },
];

const TARGET_BY_NORMALIZED_SHEET = new Map(TARGET_SECTORES.map((s) => [norm(s.sheet), s]));

export function norm(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeDescription(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function asText(value) {
  const s = String(value ?? "").trim();
  return s ? s.replace(/\s+/g, " ") : null;
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || !/^-?\d+([.,]\d+)?$/.test(raw)) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function detectModel(headerValue) {
  if (typeof headerValue === "number" && MODELOS.includes(String(headerValue))) {
    return String(headerValue);
  }
  const s = norm(headerValue);
  const m = s.match(/^(\d{2})(\b|[^0-9])/);
  return m && MODELOS.includes(m[1]) ? m[1] : null;
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) => row.some((cell) => norm(cell).includes("descripcion")));
}

function mapColumns(header) {
  const cols = {
    codigo: -1,
    proveedor: -1,
    descripcion: -1,
    unidad: -1,
    precio: -1,
    modelos: {},
  };

  header.forEach((cell, idx) => {
    const h = norm(cell);
    const model = detectModel(cell);
    if (model && cols.modelos[model] == null) cols.modelos[model] = idx;
    if (cols.descripcion < 0 && h.includes("descripcion")) cols.descripcion = idx;
    if (cols.proveedor < 0 && h.includes("proveedor")) cols.proveedor = idx;
    if (cols.codigo < 0 && h.includes("codigo")) cols.codigo = idx;
    if (cols.unidad < 0 && (h === "um" || h.includes("unidad"))) cols.unidad = idx;
    if (cols.precio < 0 && h.includes("precio")) cols.precio = idx;
  });

  return cols;
}

function isTitleRow(description) {
  const d = norm(description);
  return !d || d === "listado de elementos" || d === "descripcion";
}

function parseSheet(rows, sector) {
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) {
    return { sector, headerIndex: -1, materiales: [], warnings: ["No se encontró encabezado con Descripción."] };
  }

  const header = rows[headerIndex] ?? [];
  const cols = mapColumns(header);
  if (cols.descripcion < 0) {
    return { sector, headerIndex, materiales: [], warnings: ["No se encontró la columna Descripción."] };
  }

  const byDescription = new Map();
  const warnings = [];

  for (let r = headerIndex + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const descripcion = normalizeDescription(row[cols.descripcion]);
    if (isTitleRow(descripcion)) continue;

    const key = norm(descripcion);
    let item = byDescription.get(key);
    if (!item) {
      item = {
        descripcion,
        proveedor: cols.proveedor >= 0 ? asText(row[cols.proveedor]) : null,
        codigo: cols.codigo >= 0 ? asText(row[cols.codigo]) : null,
        unidad_medida: cols.unidad >= 0 ? asText(row[cols.unidad]) : null,
        precio_unitario: cols.precio >= 0 ? asNumber(row[cols.precio]) : null,
        cantidades: {},
        sourceRow: r + 1,
      };
      byDescription.set(key, item);
    } else {
      item.proveedor ||= cols.proveedor >= 0 ? asText(row[cols.proveedor]) : null;
      item.codigo ||= cols.codigo >= 0 ? asText(row[cols.codigo]) : null;
      item.unidad_medida ||= cols.unidad >= 0 ? asText(row[cols.unidad]) : null;
      item.precio_unitario ??= cols.precio >= 0 ? asNumber(row[cols.precio]) : null;
    }

    for (const modelo of MODELOS) {
      const col = cols.modelos[modelo];
      if (col == null) continue;
      const cantidad = asNumber(row[col]);
      if (cantidad != null && cantidad > 0) item.cantidades[modelo] = cantidad;
    }
  }

  return { sector, headerIndex, materiales: [...byDescription.values()], warnings };
}

export function parseMaterialesWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "array", raw: true, cellDates: false });
  const sectores = [];
  const skipped = [];

  for (const sheetName of workbook.SheetNames) {
    const sector = TARGET_BY_NORMALIZED_SHEET.get(norm(sheetName));
    if (!sector) {
      skipped.push(sheetName);
      continue;
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
    const parsed = parseSheet(rows, { ...sector, sheetName });
    sectores.push(parsed);
  }

  const totalMateriales = sectores.reduce((acc, s) => acc + s.materiales.length, 0);
  const totalCantidades = sectores.reduce(
    (acc, s) => acc + s.materiales.reduce((sum, m) => sum + Object.keys(m.cantidades).length, 0),
    0,
  );

  return {
    sectores,
    skipped,
    totalMateriales,
    totalCantidades,
    stats: {
      sectores: sectores.length,
      materiales: totalMateriales,
      cantidades: totalCantidades,
      hojas_salteadas: skipped,
    },
  };
}

export function toBomMap(material) {
  const out = { 37: "", 52: "", 55: "" };
  for (const row of material?.modelos ?? []) {
    if (MODELOS.includes(String(row.modelo))) out[row.modelo] = row.cantidad ?? "";
  }
  return out;
}

export function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
