import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const EXCEL_DEFAULT = "D:/Descargas 2/K55 seguimiento (2).xlsx";
const SHEET = "K55_Listado_Stock";
const OUT_DIR = "exports/k55_integracion_preview";

function arg(name, fallback = "") {
  const key = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(key));
  return found ? found.slice(key.length) : fallback;
}

function text(value) {
  if (value == null) return "";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value).trim();
}

function norm(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00bd/g, "1/2")
    .replace(/\u00bc/g, "1/4")
    .replace(/\u00be/g, "3/4")
    .replace(/\bmilimetros?\b/g, "mm")
    .replace(/\bmetros?\b/g, "m")
    .replace(/\bunidades?\b/g, "unidad")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return norm(value)
    .split(/[^a-z0-9/"'.+-]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);
}

function jaccard(a, b) {
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
  if (!aa.size || !bb.size) return 0;
  let hit = 0;
  for (const item of aa) if (bb.has(item)) hit += 1;
  return hit / (aa.size + bb.size - hit);
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[;\n\r"]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
}

function writeCsv(file, rows, headers) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `\ufeff${headers.join(";")}\n${rows.map((row) => headers.map((h) => csvCell(row[h])).join(";")).join("\n")}`,
    "utf8",
  );
}

function parseCsv(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\ufeff/, "");
  const sep = raw.includes(";") ? ";" : ",";
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === "\"") {
        if (quoted && line[i + 1] === "\"") {
          cur += "\"";
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (ch === sep && !quoted) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = parseLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

function classify(flag) {
  const f = text(flag).toUpperCase().replace(/\s+/g, "");
  if (["STD", "OPC", "VAR", "ADC"].includes(f)) return f;
  if (f.includes("55-") && f.includes("OPC")) return "MIXTO";
  if (f.includes("55-")) return "OBRA_ESPECIFICA";
  return f ? "OTRO" : "SIN_CLASIFICAR";
}

function excelRows(excelPath) {
  const wb = xlsx.readFile(excelPath);
  const sheet = wb.Sheets[SHEET];
  if (!sheet) throw new Error(`No existe la hoja ${SHEET}`);
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  return rows
    .map((row, idx) => ({
      excel_row: idx + 2,
      cantidad: row.Cantidad ?? "",
      unidad: text(row.UM),
      flag_original: text(row["STD/OPC"]),
      clasificacion: classify(row["STD/OPC"]),
      item_original: text(row.Item),
      observacion: text(row["Obervacion"] || row["Obervación"]),
      proveedor: text(row.Proveedor),
      sistema_plano: text(row["Sistema/Plano"]),
      rubro: text(row.Rubro),
    }))
    .filter((row) => row.item_original);
}

function catalogDescription(row) {
  return row.descripcion || row.Descripcion || row.description || row.item || "";
}

function catalogId(row) {
  return row.material_id || row.id || row.ID || "";
}

function catalogK(row, model) {
  return row[`k${model}`] || row[`K${model}`] || row[`cant_k${model}`] || row[`cantidad_k${model}`] || "";
}

function buildPreview(excelPath, catalogPath) {
  const excel = excelRows(excelPath);
  const catalog = parseCsv(catalogPath).filter((row) => catalogId(row) && catalogDescription(row));
  const byNorm = new Map();
  for (const row of catalog) {
    const key = norm(catalogDescription(row));
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key).push(row);
  }

  const results = excel.map((row) => {
    const key = norm(row.item_original);
    const exact = byNorm.get(key) || [];
    const candidates = exact.length ? exact : catalog
      .map((cat) => ({ cat, score: jaccard(row.item_original, catalogDescription(cat)) }))
      .filter(({ score }) => score >= 0.58)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ cat, score }) => ({ ...cat, _score: score.toFixed(3) }));

    const best = candidates[0] || null;
    const matchType = exact.length === 1 ? "EXACTO"
      : exact.length > 1 ? "EXACTO_MULTIPLE"
        : candidates.length ? "PROBABLE"
          : "NUEVO";
    const action = matchType === "EXACTO" && row.clasificacion === "STD"
      ? "REUSAR_ID_Y_SET_K55"
      : matchType === "NUEVO" && row.clasificacion === "STD"
        ? "CREAR_MATERIAL_Y_SET_K55"
        : row.clasificacion === "STD" ? "REVISAR_ANTES_DE_MATRIZ" : "NO_MATRIZ";

    return {
      ...row,
      descripcion_normalizada: key,
      match_type: matchType,
      accion_sugerida: action,
      material_id_candidato: best ? catalogId(best) : "",
      descripcion_candidato: best ? catalogDescription(best) : "",
      score_candidato: best?._score || (matchType.startsWith("EXACTO") ? "1.000" : ""),
      k37_actual: best ? catalogK(best, "37") : "",
      k52_actual: best ? catalogK(best, "52") : "",
      k55_actual: best ? catalogK(best, "55") : "",
      cantidad_k55_excel: row.cantidad,
      motivo_revision: [
        matchType === "PROBABLE" ? "match difuso: no fusionar automatico" : "",
        matchType === "EXACTO_MULTIPLE" ? "varios materiales con misma descripcion normalizada" : "",
        row.clasificacion !== "STD" ? `clasificacion ${row.clasificacion}: no matriz base` : "",
        text(`${row.item_original} ${row.observacion}`).includes("??") ? "modelo/dato con ??" : "",
      ].filter(Boolean).join(" | "),
    };
  });

  const headers = [
    "excel_row", "clasificacion", "accion_sugerida", "match_type", "material_id_candidato",
    "descripcion_candidato", "score_candidato", "item_original", "cantidad_k55_excel",
    "unidad", "k37_actual", "k52_actual", "k55_actual", "proveedor", "rubro",
    "observacion", "flag_original", "motivo_revision",
  ];
  writeCsv(path.join(OUT_DIR, "10_match_catalogo_preview.csv"), results, headers);
  writeCsv(path.join(OUT_DIR, "11_exactos_reusar_set_k55.csv"), results.filter((r) => r.accion_sugerida === "REUSAR_ID_Y_SET_K55"), headers);
  writeCsv(path.join(OUT_DIR, "12_probables_revisar.csv"), results.filter((r) => r.match_type === "PROBABLE" || r.match_type === "EXACTO_MULTIPLE"), headers);
  writeCsv(path.join(OUT_DIR, "13_nuevos_std_crear_set_k55.csv"), results.filter((r) => r.accion_sugerida === "CREAR_MATERIAL_Y_SET_K55"), headers);
  return results;
}

const excelPath = arg("excel", EXCEL_DEFAULT);
const catalogPath = arg("catalog", "");
if (!catalogPath) {
  throw new Error("Uso: node scripts/k55-match-catalog-preview.mjs --catalog=exports/catalogo.csv [--excel=archivo.xlsx]");
}

const results = buildPreview(excelPath, catalogPath);
const counts = results.reduce((acc, row) => {
  acc[row.match_type] = (acc[row.match_type] || 0) + 1;
  return acc;
}, {});
console.log(JSON.stringify({ total: results.length, counts, outDir: path.resolve(OUT_DIR) }, null, 2));
