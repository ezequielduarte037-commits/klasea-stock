// Presentismo: vista por dia o rango, ausentes, anomalias y justificaciones.
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarOff,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileSpreadsheet,
  Info,
  Save,
  Search,
  Stethoscope,
  Timer,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import {
  addDays,
  diaSemana,
  downloadCsv,
  duracionMin,
  fetchJustificaciones,
  fetchMarcaciones,
  fetchMarcacionesEmpleado,
  fmtFecha,
  fmtFechaCorta,
  guardarAusenciasProgramadas,
  guardarCorreccionMarcacion,
  guardarJustificacion,
  hhmm,
  hoyIso,
  minToHM,
  SEDES,
  timeToMin,
} from "./api";
import { BTN, BTN_PRIMARY, Cargando, ErrorBox, GrupoBadge, INP, KpiCard, Td, Th } from "./ui";

const keyJust = (empleadoId, fecha) => `${empleadoId}::${fecha}`;
const XLSX_YELLOW = "FFFF00";
const XLSX_RED = "FFC7CE";
const XLSX_GREEN = "C6EFCE";
const XLSX_GROUP = "D9EAF7";
const XLSX_HEADER = "D9EAD3";
const XLSX_SECTION = "E7E6E6";
const AUSENCIA_TIPOS = ["Reposo", "Vacaciones", "Licencia", "Trámite", "Otro"];

function initials(nombre) {
  return safeText(nombre)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase() || "?";
}

function EmpleadoAvatar({ emp, size = 30, justified = false }) {
  const foto = String(emp?.foto_url ?? "").trim();
  return (
    <span
      title={emp?.nombre || "Empleado"}
      style={{
        width: size,
        height: size,
        borderRadius: size >= 38 ? 11 : 8,
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        flexShrink: 0,
        fontSize: size >= 38 ? 11 : 9,
        fontWeight: 800,
        color: justified ? C.green : C.blue,
        background: justified ? C.greenL : C.blueL,
        border: `1px solid ${justified ? C.greenB : C.blueB}`,
      }}
    >
      {foto ? <img src={foto} alt={`Foto de ${emp?.nombre || "empleado"}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(emp?.nombre)}
    </span>
  );
}

function sameGrupo(row, filtroGrupo) {
  const emp = row.emp ?? row;
  if (filtroGrupo === "casa") return emp.grupo === "casa";
  if (filtroGrupo === "sin_asignar") return emp.grupo === "sin_asignar";
  if (filtroGrupo === "contratistas") return emp.grupo === "contratista";
  if (filtroGrupo.startsWith("c:")) return emp.contratista_id === filtroGrupo.slice(2);
  return true;
}

function safeText(value) {
  return String(value ?? "").trim();
}

function splitNombreCompleto(nombre) {
  const parts = safeText(nombre).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { nombre: parts[0] ?? "", apellido: "" };
  return { nombre: parts[0], apellido: parts.slice(1).join(" ") };
}

function nombreContratista(emp) {
  return emp?.contratista?.nombre || "Sin jefe asignado";
}

function rangoFechas(desde, hasta) {
  const out = [];
  let cur = desde;
  while (cur && cur <= hasta) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function buildFichasSheet({ title, periodo, rows, includeJefe }) {
  const headers = includeJefe
    ? ["Fecha", "Nombre", "Apellido", "Entrada", "Salida", "Sede", "Jefe", "Estado", "Observaciones"]
    : ["Fecha", "Nombre", "Apellido", "Entrada", "Salida", "Sede", "Estado", "Observaciones"];
  const aoa = [];
  const kinds = [];
  const add = (row, kind = "normal") => {
    aoa.push(row);
    kinds.push(kind);
  };

  add(["Registros de entradas y salidas"], "title");
  add([`Hora de exportacion: ${new Date().toLocaleString("es-AR")}`], "meta");
  add([`Periodo: ${periodo}`], "meta");
  add([], "blank");
  add([title], "section");
  add(headers, "header");

  if (!rows.length) {
    add(["Sin registros para este filtro."], "empty");
  } else {
    for (const row of rows) {
      if (row.kind === "group") {
        add([row.label], "group");
        continue;
      }
      const base = [
        fmtFecha(row.fecha),
        row.nombre,
        row.apellido,
        row.entrada,
        row.salida,
        row.sede,
      ];
      if (includeJefe) base.push(row.jefe);
      base.push(row.estado, row.observaciones);
      add(base, row.kind);
    }
  }

  return {
    aoa,
    kinds,
    colCount: headers.length,
    merges: [
      [1, 1, 1, headers.length],
      [2, 1, 2, headers.length],
      [3, 1, 3, headers.length],
      [5, 1, 5, headers.length],
    ],
    cols: [
      12,
      18,
      28,
      14,
      14,
      12,
      ...(includeJefe ? [28] : []),
      18,
      32,
    ],
  };
}

function xmlEsc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m - 1) / 26);
  }
  return s;
}

function cellRef(row, col) {
  return `${colName(col)}${row}`;
}

function mergeRef([r1, c1, r2, c2]) {
  return `${cellRef(r1, c1)}:${cellRef(r2, c2)}`;
}

function styleId(kind) {
  if (kind === "title") return 1;
  if (kind === "meta") return 2;
  if (kind === "section") return 3;
  if (kind === "header") return 4;
  if (kind === "group") return 5;
  if (kind === "tarde") return 6;
  if (kind === "ausente_justificado") return 9;
  if (kind === "ausente") return 7;
  if (kind === "empty") return 8;
  return 0;
}

function sheetXml(sheet) {
  const cols = sheet.cols.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("");
  const rows = sheet.aoa.map((row, ri) => {
    const r = ri + 1;
    const kind = sheet.kinds[ri] ?? "normal";
    const style = styleId(kind);
    const effectiveRow = ["title", "meta", "section", "group", "header", "tarde", "ausente", "ausente_justificado", "empty"].includes(kind)
      ? Array.from({ length: sheet.colCount }, (_, i) => row[i] ?? "")
      : row;
    const cells = effectiveRow.map((value, ci) => {
      const c = ci + 1;
      return `<c r="${cellRef(r, c)}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
    }).join("");
    return `<row r="${r}" ht="${kind === "group" ? 22 : 18}" customHeight="1">${cells}</row>`;
  }).join("");
  const merges = sheet.merges.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${mergeRef(m)}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${cols}</cols>
  <sheetData>${rows}</sheetData>
  ${merges}
</worksheet>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>
    <font><sz val="11"/><color rgb="FF666666"/><name val="Calibri"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${XLSX_YELLOW}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${XLSX_RED}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${XLSX_GROUP}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${XLSX_HEADER}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${XLSX_SECTION}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${XLSX_GREEN}"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFB7B7B7"/></left><right style="thin"><color rgb="FFB7B7B7"/></right><top style="thin"><color rgb="FFB7B7B7"/></top><bottom style="thin"><color rgb="FFB7B7B7"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="7" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/>
</styleSheet>`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pushU16(out, n) {
  out.push(n & 0xff, (n >>> 8) & 0xff);
}

function pushU32(out, n) {
  out.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
}

function bytesFromNumbers(nums) {
  return new Uint8Array(nums);
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);

    const local = [];
    pushU32(local, 0x04034b50);
    pushU16(local, 20);
    pushU16(local, 0);
    pushU16(local, 0);
    pushU16(local, 0);
    pushU16(local, 0);
    pushU32(local, crc);
    pushU32(local, dataBytes.length);
    pushU32(local, dataBytes.length);
    pushU16(local, nameBytes.length);
    pushU16(local, 0);
    const localBytes = bytesFromNumbers(local);
    localParts.push(localBytes, nameBytes, dataBytes);

    const central = [];
    pushU32(central, 0x02014b50);
    pushU16(central, 20);
    pushU16(central, 20);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU32(central, crc);
    pushU32(central, dataBytes.length);
    pushU32(central, dataBytes.length);
    pushU16(central, nameBytes.length);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU32(central, 0);
    pushU32(central, offset);
    centralParts.push(bytesFromNumbers(central), nameBytes);

    offset += localBytes.length + nameBytes.length + dataBytes.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = [];
  pushU32(end, 0x06054b50);
  pushU16(end, 0);
  pushU16(end, 0);
  pushU16(end, files.length);
  pushU16(end, files.length);
  pushU32(end, centralSize);
  pushU32(end, centralOffset);
  pushU16(end, 0);

  return new Blob([...localParts, ...centralParts, bytesFromNumbers(end)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportStyledXlsx(filename, sheets) {
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    {
      name: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>klasea-stock</dc:creator>
  <cp:lastModifiedBy>klasea-stock</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`,
    },
    {
      name: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>klasea-stock</Application>
</Properties>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets.map((sheet, i) => `<sheet name="${xmlEsc(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: "xl/styles.xml", content: stylesXml() },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(sheet) })),
  ];

  downloadBlob(filename, zipStore(files));
}

export default function PresentismoTab({ empleados, contratistas, config, esAdmin, onChanged }) {
  const hoy = hoyIso();
  const [modo, setModo] = useState("dia");
  const [fecha, setFecha] = useState(hoy);
  const [desde, setDesde] = useState(addDays(hoy, -6));
  const [hasta, setHasta] = useState(hoy);
  const [marcas, setMarcas] = useState(null);
  const [justificaciones, setJustificaciones] = useState([]);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [filtroSede, setFiltroSede] = useState("todas");
  const [soloAnomalias, setSoloAnomalias] = useState(false);
  const [vistaRapida, setVistaRapida] = useState("marcaciones");
  const [justModal, setJustModal] = useState(null);
  const [ausenciaModal, setAusenciaModal] = useState(false);
  const [seguimientoOpen, setSeguimientoOpen] = useState(false);

  const d1 = modo === "dia" ? fecha : desde;
  const d2 = modo === "dia" ? fecha : hasta;

  useEffect(() => {
    let alive = true;
    Promise.all([fetchMarcaciones(d1, d2), fetchJustificaciones(d1, d2)])
      .then(([rows, justs]) => {
        if (!alive) return;
        setError(null);
        setMarcas(rows);
        setJustificaciones(justs);
      })
      .catch(e => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [d1, d2]);

  const empById = useMemo(() => new Map((empleados ?? []).map(e => [e.id, e])), [empleados]);
  const justByKey = useMemo(() => new Map((justificaciones ?? []).map(j => [keyJust(j.empleado_id, j.fecha), j])), [justificaciones]);
  const tardeMin = timeToMin(config.tolerancia_tarde) ?? 430;

  const filas = useMemo(() => {
    if (!marcas) return null;
    const out = [];
    for (const m of marcas) {
      const emp = empById.get(m.empleado_id);
      if (!emp || emp.ficha === false) continue;
      const entrada = hhmm(m.entrada);
      const salida = hhmm(m.salida);
      const min = duracionMin(m);
      const esDiaHabil = diaSemana(m.fecha) !== 0;
      out.push({
        key: m.id,
        marcacion: m,
        emp,
        fecha: m.fecha,
        sede: m.sede,
        entrada,
        salida,
        min,
        sinEntrada: !entrada && !!salida,
        sinSalida: !!entrada && !salida,
        tarde: esDiaHabil && entrada != null && timeToMin(entrada) > tardeMin,
        fichadas: Array.isArray(m.fichadas) ? m.fichadas : [],
        justificacion: justByKey.get(keyJust(emp.id, m.fecha)) ?? null,
      });
    }
    return out;
  }, [marcas, empById, tardeMin, justByKey]);

  const filtradas = useMemo(() => {
    if (!filas) return null;
    let rows = filas;
    if (filtroSede !== "todas") rows = rows.filter(r => r.sede === filtroSede);
    rows = rows.filter(r => sameGrupo(r, filtroGrupo));
    if (q.trim()) {
      const qq = q.toLowerCase();
      rows = rows.filter(r => safeText(r.emp.nombre).toLowerCase().includes(qq) || safeText(r.emp.dni).includes(qq));
    }
    if (soloAnomalias) rows = rows.filter(r => r.sinEntrada || r.sinSalida || r.tarde);
    return [...rows].sort((a, b) =>
      a.fecha !== b.fecha ? a.fecha.localeCompare(b.fecha) : safeText(a.emp.nombre).localeCompare(safeText(b.emp.nombre), "es"));
  }, [filas, filtroSede, filtroGrupo, q, soloAnomalias]);

  const filasVista = useMemo(() => {
    if (!filtradas) return null;
    return vistaRapida === "tarde" ? filtradas.filter(row => row.tarde) : filtradas;
  }, [filtradas, vistaRapida]);

  const ausentes = useMemo(() => {
    if (modo !== "dia" || !filas) return [];
    const presentes = new Set(
      filas
        .filter(r => r.fecha === fecha && (filtroSede === "todas" || r.sede === filtroSede))
        .map(r => r.emp.id),
    );
    let rows = (empleados ?? []).filter(e => e.activo !== false && e.ficha !== false && !presentes.has(e.id));
    if (filtroSede !== "todas") rows = rows.filter(e => e.sede === filtroSede);
    rows = rows.filter(e => sameGrupo(e, filtroGrupo));
    if (q.trim()) {
      const qq = q.toLowerCase();
      rows = rows.filter(e => safeText(e.nombre).toLowerCase().includes(qq) || safeText(e.dni).includes(qq));
    }
    return rows
      .map(emp => ({ emp, justificacion: justByKey.get(keyJust(emp.id, fecha)) ?? null }))
      .sort((a, b) => safeText(a.emp.nombre).localeCompare(safeText(b.emp.nombre), "es"));
  }, [modo, filas, fecha, empleados, filtroSede, filtroGrupo, q, justByKey]);

  const stats = useMemo(() => {
    if (!filtradas) return null;
    const personas = new Set(filtradas.map(r => r.emp.id));
    return {
      presentes: personas.size,
      casa: new Set(filtradas.filter(r => r.emp.grupo === "casa").map(r => r.emp.id)).size,
      contr: new Set(filtradas.filter(r => r.emp.grupo === "contratista").map(r => r.emp.id)).size,
      anomalias: filtradas.filter(r => r.sinEntrada || r.sinSalida || r.tarde).length,
      ausentesJustificados: ausentes.filter(r => r.justificacion).length,
    };
  }, [filtradas, ausentes]);

  async function guardarRevision(data, values) {
    const { empleadoId, fecha: fechaJust, motivo, entrada, salida, horariosCambiaron, motivoCambio } = values;

    if (horariosCambiaron) {
      const savedMark = await guardarCorreccionMarcacion({
        id: data.marcacion?.id,
        empleadoId,
        fecha: fechaJust,
        entrada,
        salida,
        sede: data.marcacion?.sede ?? data.emp.sede,
      });
      setMarcas(prev => {
        const rows = prev ?? [];
        let found = false;
        const next = rows.map(row => {
          const same = row.id === savedMark.id || (row.empleado_id === empleadoId && row.fecha === fechaJust);
          if (!same) return row;
          found = true;
          return savedMark;
        });
        return found ? next : [...next, savedMark];
      });
    }

    if (motivoCambio) {
      const savedJustification = await guardarJustificacion(empleadoId, fechaJust, motivo);
      setJustificaciones(prev => {
        const key = keyJust(empleadoId, fechaJust);
        const clean = prev.filter(j => keyJust(j.empleado_id, j.fecha) !== key);
        return savedJustification ? [...clean, savedJustification] : clean;
      });
    }
    setJustModal(null);
  }

  async function guardarAusencia(values) {
    const saved = await guardarAusenciasProgramadas(values);
    setJustificaciones(prev => {
      const next = new Map((prev ?? []).map(row => [keyJust(row.empleado_id, row.fecha), row]));
      for (const row of saved) next.set(keyJust(row.empleado_id, row.fecha), row);
      return [...next.values()];
    });
    setAusenciaModal(false);
    setVistaRapida("ausentes");
  }

  async function borrarEmpleado(emp) {
    if (!esAdmin || !emp?.id) return;
    const ok = window.confirm(`¿Borrar a ${emp.nombre} del presentismo?\n\nSe marca como inactivo y deja de aparecer, sin borrar el historial.`);
    if (!ok) return;
    const { error: err } = await supabase
      .from("rrhh_empleados")
      .update({ activo: false, ficha: false })
      .eq("id", emp.id);
    if (err) {
      setError(err);
      return;
    }
    onChanged?.();
  }

  function exportar() {
    if (!filtradas) return;
    const presentRows = filtradas.map(r => [
      fmtFecha(r.fecha),
      r.emp.dni,
      r.emp.nombre,
      r.sede ?? r.emp.sede ?? "",
      r.emp.grupo === "casa" ? "Casa" : r.emp.grupo === "contratista" ? "Contratista" : "Sin asignar",
      r.emp.contratista?.nombre ?? "",
      r.entrada ?? "",
      r.salida ?? "",
      r.min != null ? minToHM(r.min) : "",
      r.justificacion ? "presente (justificada)" : "presente",
      [r.sinEntrada ? "sin entrada" : null, r.sinSalida ? "sin salida" : null, r.tarde ? "tarde" : null].filter(Boolean).join(", "),
      r.justificacion?.motivo ?? "",
    ]);
    const absentRows = modo === "dia" ? ausentes.map(r => [
      fmtFecha(fecha),
      r.emp.dni,
      r.emp.nombre,
      r.emp.sede ?? "",
      r.emp.grupo === "casa" ? "Casa" : r.emp.grupo === "contratista" ? "Contratista" : "Sin asignar",
      r.emp.contratista?.nombre ?? "",
      "",
      "",
      "",
      r.justificacion ? "ausente justificada" : "ausente injustificada",
      "",
      r.justificacion?.motivo ?? "",
    ]) : [];

    downloadCsv(
      `presentismo_${d1}_${d2}.csv`,
      ["Fecha", "DNI", "Nombre", "Sede", "Grupo", "Contratista", "Entrada", "Salida", "Horas", "Estado", "Observacion", "Motivo justificacion"],
      [...presentRows, ...absentRows],
    );
  }

  function exportarXlsx() {
    if (!filas) return;

    const query = q.trim().toLowerCase();
    const fechas = rangoFechas(d1, d2);
    const presentes = new Map();
    for (const r of filas) presentes.set(`${r.fecha}::${r.emp.id}`, r);

    const pasaFiltrosBase = (emp, sede) => {
      if (emp.activo === false || emp.ficha === false) return false;
      if (filtroSede !== "todas" && sede !== filtroSede) return false;
      if (!sameGrupo(emp, filtroGrupo)) return false;
      if (query) {
        const haystack = `${safeText(emp.nombre)} ${safeText(emp.dni)}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return emp.grupo === "casa" || emp.grupo === "contratista";
    };

    const toPresentRow = (r) => {
      const names = splitNombreCompleto(r.emp.nombre);
      const obs = [
        r.tarde ? "Tarde" : null,
        r.sinEntrada ? "Sin entrada" : null,
        r.sinSalida ? "Sin salida" : null,
        r.justificacion?.motivo || null,
      ].filter(Boolean).join(" · ");
      return {
        kind: r.tarde ? "tarde" : "normal",
        fecha: r.fecha,
        ...names,
        entrada: r.entrada || "",
        salida: r.salida || "",
        sede: r.sede ?? r.emp.sede ?? "",
        jefe: nombreContratista(r.emp),
        estado: r.sinEntrada ? "SIN ENTRADA" : r.sinSalida ? "SIN SALIDA" : r.tarde ? "TARDE" : "OK",
        observaciones: obs,
      };
    };

    const toAbsentRow = (emp, fechaIso) => {
      const justificacion = justByKey.get(keyJust(emp.id, fechaIso));
      const names = splitNombreCompleto(emp.nombre);
      return {
        kind: justificacion ? "ausente_justificado" : "ausente",
        fecha: fechaIso,
        ...names,
        entrada: "AUSENTE",
        salida: "",
        sede: emp.sede ?? "",
        jefe: nombreContratista(emp),
        estado: justificacion ? "AUSENTE JUSTIFICADO" : "AUSENTE",
        observaciones: justificacion?.motivo ?? "",
      };
    };

    const casaRows = [];
    const contratistaRowsByJefe = new Map();
    const empleadosOrdenados = [...(empleados ?? [])]
      .filter((emp) => pasaFiltrosBase(emp, emp.sede))
      .sort((a, b) => {
        const groupA = a.grupo === "casa" ? "0" : `1-${nombreContratista(a)}`;
        const groupB = b.grupo === "casa" ? "0" : `1-${nombreContratista(b)}`;
        return groupA !== groupB
          ? groupA.localeCompare(groupB, "es")
          : safeText(a.nombre).localeCompare(safeText(b.nombre), "es");
      });

    for (const fechaIso of fechas) {
      for (const emp of empleadosOrdenados) {
        const r = presentes.get(`${fechaIso}::${emp.id}`);
        const sede = r?.sede ?? emp.sede ?? "";
        if (!pasaFiltrosBase(emp, sede)) continue;

        const row = r ? toPresentRow(r) : toAbsentRow(emp, fechaIso);
        if (emp.grupo === "casa") {
          casaRows.push(row);
        } else if (emp.grupo === "contratista") {
          const jefe = nombreContratista(emp);
          const list = contratistaRowsByJefe.get(jefe) ?? [];
          list.push(row);
          contratistaRowsByJefe.set(jefe, list);
        }
      }
    }

    const contratistaRows = [];
    for (const jefe of [...contratistaRowsByJefe.keys()].sort((a, b) => a.localeCompare(b, "es"))) {
      contratistaRows.push({ kind: "group", label: `JEFE: ${jefe}` });
      contratistaRows.push(...contratistaRowsByJefe.get(jefe));
    }

    const periodo = `${fmtFecha(d1)} - ${fmtFecha(d2)}`;
    exportStyledXlsx(`fichas_${d1}_${d2}.xlsx`, [
      { name: "Casa", ...buildFichasSheet({ title: "GENTE DE LA CASA", periodo, rows: casaRows, includeJefe: false }) },
      { name: "Contratistas", ...buildFichasSheet({ title: "CONTRATISTAS", periodo, rows: contratistaRows, includeJefe: true }) },
    ]);
  }

  const selSt = (on) => ({
    ...BTN,
    padding: "6px 13px",
    background: on ? C.blueL : C.s0,
    border: `1px solid ${on ? C.blueB : C.b0}`,
    color: on ? C.blue : C.t2,
  });

  return (
    <div>
      <style>{`
        .presentismo-toolbar { background: var(--panel-solid); border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.03); }
        .presentismo-toolbar-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .presentismo-toolbar-row + .presentismo-toolbar-row { border-top: 1px solid var(--border); margin-top: 10px; padding-top: 10px; }
        .presentismo-date-nav { display: inline-flex; align-items: center; gap: 4px; padding: 3px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); }
        .presentismo-search { position: relative; flex: 1 1 280px; min-width: 190px; }
        .presentismo-search input { width: 100%; padding-left: 34px !important; }
        .presentismo-search svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--dim); pointer-events: none; }
        .presentismo-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); border: 1px solid var(--border); border-radius: 12px; background: var(--panel-solid); margin-bottom: 12px; overflow: hidden; }
        .presentismo-summary > * { border: 0 !important; border-radius: 0 !important; border-right: 1px solid var(--border) !important; }
        .presentismo-summary > *:last-child { border-right: 0 !important; }
        .presentismo-table-row { transition: background .15s ease; }
        .presentismo-table-row:hover { background: var(--panel-2); }
        .presentismo-action:hover { border-color: var(--border-2) !important; color: var(--text) !important; }
        .presentismo-absence { transition: border-color .15s ease, background .15s ease; }
        .presentismo-absence:hover { border-color: var(--border-2) !important; background: var(--panel-2) !important; }
        @media (max-width: 900px) {
          .presentismo-summary { grid-template-columns: repeat(3, minmax(110px, 1fr)); }
          .presentismo-summary > * { border-bottom: 1px solid var(--border) !important; }
        }
        @media (max-width: 640px) {
          .presentismo-toolbar { padding: 10px; }
          .presentismo-toolbar-row { align-items: stretch; }
          .presentismo-toolbar-row > select { flex: 1 1 145px; min-width: 0 !important; }
          .presentismo-date-nav { flex: 1 1 100%; justify-content: space-between; }
          .presentismo-date-nav input { flex: 1; min-width: 0; }
          .presentismo-export { flex: 1; justify-content: center; }
          .presentismo-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .presentismo-summary > * { border-right: 1px solid var(--border) !important; }
        }
      `}</style>

      <div className="presentismo-toolbar">
        <div className="presentismo-toolbar-row">
          <div style={{ display: "inline-flex", gap: 3, padding: 3, borderRadius: 9, background: C.s0, border: `1px solid ${C.b0}` }}>
            <button style={selSt(modo === "dia")} onClick={() => setModo("dia")}>Por día</button>
            <button style={selSt(modo === "rango")} onClick={() => { setModo("rango"); setVistaRapida("marcaciones"); }}>Rango</button>
          </div>
        {modo === "dia" ? (
          <div className="presentismo-date-nav">
            <button aria-label="Día anterior" title="Día anterior" style={{ ...BTN, padding: 6, border: 0, background: "transparent", display: "grid", placeItems: "center" }} onClick={() => setFecha(addDays(fecha, -1))}><ChevronLeft size={16} /></button>
            <CalendarDays size={15} color={C.t2} style={{ marginLeft: 2 }} />
            <input type="date" style={{ ...INP, border: 0, background: "transparent", padding: "5px 4px" }} value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} />
            <button aria-label="Día siguiente" title="Día siguiente" style={{ ...BTN, padding: 6, border: 0, background: "transparent", display: "grid", placeItems: "center" }} onClick={() => setFecha(addDays(fecha, 1))}><ChevronRight size={16} /></button>
            {fecha !== hoy && <button style={{ ...BTN, padding: "5px 9px" }} onClick={() => setFecha(hoy)}>Hoy</button>}
          </div>
        ) : (
          <div className="presentismo-date-nav">
            <CalendarDays size={15} color={C.t2} style={{ marginLeft: 5 }} />
            <input type="date" style={{ ...INP, border: 0, background: "transparent", padding: "5px 4px" }} value={desde} onChange={e => e.target.value && setDesde(e.target.value)} />
            <span style={{ color: C.t2, fontSize: 12 }}>a</span>
            <input type="date" style={{ ...INP, border: 0, background: "transparent", padding: "5px 4px" }} value={hasta} onChange={e => e.target.value && setHasta(e.target.value)} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button className="presentismo-export" style={{ ...BTN_PRIMARY, display: "inline-flex", alignItems: "center", gap: 7 }} onClick={exportarXlsx}><FileSpreadsheet size={15} /> Excel</button>
        <button className="presentismo-export" style={{ ...BTN, display: "inline-flex", alignItems: "center", gap: 7 }} onClick={exportar}><Download size={15} /> CSV</button>
        </div>

        <div className="presentismo-toolbar-row">
        <div className="presentismo-search">
          <Search size={15} />
          <input style={INP} placeholder="Buscar por nombre o DNI" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select style={{ ...INP, minWidth: 170 }} value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}>
          <option value="todos">Todos los grupos</option>
          <option value="casa">Gente de la casa</option>
          <option value="contratistas">Todos los contratistas</option>
          <option value="sin_asignar">Sin asignar</option>
          {(contratistas ?? []).map(c => <option key={c.id} value={`c:${c.id}`}>↳ {c.nombre}</option>)}
        </select>
        <select style={{ ...INP, minWidth: 140 }} value={filtroSede} onChange={e => setFiltroSede(e.target.value)}>
          <option value="todas">Todas las sedes</option>
          {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button style={{ ...selSt(soloAnomalias), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => setSoloAnomalias(v => !v)}><AlertTriangle size={14} /> Solo anomalías</button>
        </div>
      </div>

      {error && <ErrorBox error={error} />}
      {!error && filtradas == null && <Cargando />}

      {filtradas != null && (
        <>
          <div className="presentismo-summary">
            <KpiCard icon={UserCheck} label={modo === "dia" ? "Presentes" : "Personas"} value={stats.presentes} color={C.green} />
            <KpiCard label="Casa" value={stats.casa} color={C.blue} />
            <KpiCard label="Contratistas" value={stats.contr} color={C.amber} />
            {modo === "dia" && <KpiCard label="Ausentes" value={ausentes.length} color={ausentes.length ? C.red : C.green} sub={stats.ausentesJustificados ? `${stats.ausentesJustificados} just.` : ""} />}
            <KpiCard icon={AlertTriangle} label="Anomalías" value={stats.anomalias} color={stats.anomalias ? C.amber : C.green} sub="entrada, salida o demora" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
            <button type="button" style={{ ...selSt(vistaRapida === "marcaciones"), display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setVistaRapida("marcaciones")}>
              <Users size={14} /> Marcaciones
            </button>
            {modo === "dia" && (
              <button type="button" style={{ ...selSt(vistaRapida === "ausentes"), display: "inline-flex", alignItems: "center", gap: 6, color: vistaRapida === "ausentes" ? C.red : C.t2 }} onClick={() => setVistaRapida("ausentes")}>
                <CalendarOff size={14} /> Ver ausentes ({ausentes.length})
              </button>
            )}
            <button type="button" style={{ ...selSt(vistaRapida === "tarde"), display: "inline-flex", alignItems: "center", gap: 6, color: vistaRapida === "tarde" ? C.amber : C.t2 }} onClick={() => setVistaRapida("tarde")}>
              <Timer size={14} /> Llegadas tarde ({filtradas.filter(row => row.tarde).length})
            </button>
            <div style={{ flex: 1 }} />
            <button type="button" style={{ ...BTN, display: "inline-flex", alignItems: "center", gap: 7 }} onClick={() => setSeguimientoOpen(true)}>
              <Search size={14} /> Seguimiento por persona
            </button>
            {esAdmin && (
              <button type="button" style={{ ...BTN_PRIMARY, display: "inline-flex", alignItems: "center", gap: 7 }} onClick={() => setAusenciaModal(true)}>
                <Stethoscope size={14} /> Cargar reposo / vacaciones
              </button>
            )}
          </div>

          {vistaRapida !== "ausentes" && (filasVista.length === 0 ? (
            <div style={{ color: C.t2, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Sin marcaciones para este filtro.</div>
          ) : (
            <div style={{ background: C.panelSolid, border: `1px solid ${C.b0}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,.03)" }}>
              <div style={{ minHeight: 47, padding: "10px 13px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: `1px solid ${C.b0}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Users size={16} color={C.blue} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.t0 }}>Marcaciones</div>
                    <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>{filasVista.length} registros visibles</div>
                  </div>
                </div>
                {soloAnomalias && <span style={{ fontSize: 10, fontWeight: 700, color: C.amber, background: C.amberL, border: `1px solid ${C.amberB}`, borderRadius: 999, padding: "3px 8px" }}>Solo anomalías</span>}
              </div>
              <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {modo === "rango" && <Th>Fecha</Th>}
                    <Th>Empleado</Th>
                    <Th>Sede</Th>
                    <Th>Grupo</Th>
                    <Th right>Entrada</Th>
                    <Th right>Salida</Th>
                    <Th right>Horas</Th>
                    <Th>Obs.</Th>
                    {esAdmin && <Th>Acciones</Th>}
                  </tr>
                </thead>
                <tbody>
                  {filasVista.map(r => (
                    <tr className="presentismo-table-row" key={r.key}>
                      {modo === "rango" && <Td mono color={C.t2}>{fmtFechaCorta(r.fecha)}</Td>}
                      <Td>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <EmpleadoAvatar emp={r.emp} size={30} justified={!!r.justificacion} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontWeight: 650, color: C.t0 }}>{r.emp.nombre}</span>
                            <span style={{ display: "block", fontSize: 10, color: C.t2, fontFamily: C.mono, marginTop: 1 }}>{r.emp.dni}</span>
                          </span>
                        </div>
                      </Td>
                      <Td color={r.sede ? C.t1 : C.t2}>{r.sede ?? "—"}</Td>
                      <Td><GrupoBadge grupo={r.emp.grupo} contratistaNombre={r.emp.contratista?.nombre} /></Td>
                      <Td right mono color={r.tarde ? C.amber : C.t0}>{r.entrada ?? "—"}</Td>
                      <Td right mono>{r.salida ?? "—"}</Td>
                      <Td right mono color={r.min != null ? C.t0 : C.t2}>{r.min != null ? minToHM(r.min) : "—"}</Td>
                      <Td style={{ whiteSpace: "normal", minWidth: 190 }}>
                        {r.tarde && <span style={{ fontSize: 10, fontWeight: 700, color: C.amber, background: C.amberL, borderRadius: 5, padding: "2px 5px", marginRight: 5 }}>Tarde</span>}
                        {r.sinEntrada && <span style={{ fontSize: 10, fontWeight: 700, color: C.red, background: C.redL, borderRadius: 5, padding: "2px 5px", marginRight: 5 }}>Sin entrada</span>}
                        {r.sinSalida && <span style={{ fontSize: 10, fontWeight: 700, color: C.red, background: C.redL, borderRadius: 5, padding: "2px 5px", marginRight: 5 }}>Sin salida</span>}
                        {r.marcacion?.editado_por && <span title="Horario corregido manualmente" style={{ fontSize: 10, fontWeight: 700, color: C.blue, background: C.blueL, borderRadius: 5, padding: "2px 5px", marginRight: 5 }}>Manual</span>}
                        {r.justificacion && <span title={r.justificacion.motivo} style={{ fontSize: 10, fontWeight: 700, color: C.green, background: C.greenL, borderRadius: 5, padding: "2px 5px", marginRight: 5 }}>Justificada</span>}
                        <button
                          className="presentismo-action"
                          type="button"
                          style={{ ...BTN, padding: "3px 7px", fontSize: 10, background: "transparent" }}
                          onClick={() => setJustModal({ emp: r.emp, fecha: r.fecha, actual: r.justificacion, marcacion: r.marcacion })}
                        >
                          <Clock3 size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                          {r.justificacion ? "Revisar" : "Corregir / justificar"}
                        </button>
                      </Td>
                      {esAdmin && (
                        <Td>
                          <button
                            className="presentismo-action"
                            type="button"
                            aria-label={`Borrar a ${r.emp.nombre}`}
                            title="Borrar del presentismo"
                            style={{ ...BTN, padding: 5, color: C.red, border: `1px solid ${C.redB}`, background: "transparent", display: "grid", placeItems: "center" }}
                            onClick={() => borrarEmpleado(r.emp)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ))}

          {modo === "dia" && vistaRapida === "ausentes" && (
            <div style={{ background: C.panelSolid, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <AlertTriangle size={15} color={C.red} />
                <div style={{ fontSize: 12, color: C.t0, fontWeight: 700 }}>Ausentes</div>
                <span style={{ fontSize: 10, color: C.red, background: C.redL, border: `1px solid ${C.redB}`, borderRadius: 999, padding: "2px 7px" }}>{ausentes.length}</span>
                <span style={{ fontSize: 10, color: C.t2 }}>{fmtFecha(fecha)}</span>
              </div>
              {ausentes.length === 0 ? (
                <div style={{ padding: "38px 16px", textAlign: "center", color: C.t2, fontSize: 12 }}>No hay ausentes para estos filtros.</div>
              ) : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 8 }}>
                {ausentes.map(({ emp, justificacion }) => (
                  <div className="presentismo-absence" key={emp.id} style={{ minWidth: 0, minHeight: 64, color: C.t1, background: justificacion ? C.greenL : C.s0, border: `1px solid ${justificacion ? C.greenB : C.b0}`, padding: 10, borderRadius: 9, display: "flex", gap: 10, alignItems: "center" }}>
                    <EmpleadoAvatar emp={emp} size={40} justified={!!justificacion} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 650, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.nombre}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, overflow: "hidden" }}>
                        {emp.sede && <span style={{ fontSize: 10, color: C.t2 }}>{emp.sede}</span>}
                        <GrupoBadge grupo={emp.grupo} contratistaNombre={emp.contratista?.nombre} />
                      </div>
                      {justificacion && <div title={justificacion.motivo} style={{ marginTop: 5, color: C.green, fontSize: 10, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{justificacion.motivo}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      <button
                        className="presentismo-action"
                        type="button"
                        title={justificacion ? "Revisar jornada" : "Cargar horario o justificar ausencia"}
                        style={{ ...BTN, padding: "5px 7px", fontSize: 10, color: justificacion ? C.green : C.t1, background: "transparent" }}
                        onClick={() => setJustModal({ emp, fecha, actual: justificacion, marcacion: null })}
                      >
                        {justificacion ? <CheckCircle2 size={14} /> : "Justificar ausencia"}
                      </button>
                      {esAdmin && (
                        <button
                          className="presentismo-action"
                          type="button"
                          aria-label={`Borrar a ${emp.nombre}`}
                          title="Borrar del presentismo"
                          style={{ ...BTN, padding: 5, color: C.red, border: `1px solid ${C.redB}`, background: "transparent", display: "grid", placeItems: "center" }}
                          onClick={() => borrarEmpleado(emp)}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>}
            </div>
          )}
        </>
      )}

      {justModal && (
        <JustificacionModal
          data={justModal}
          canEditTime={esAdmin}
          onClose={() => setJustModal(null)}
          onSave={guardarRevision}
        />
      )}
      {ausenciaModal && (
        <AusenciaPeriodoModal
          empleados={empleados}
          initialDate={modo === "dia" ? fecha : d1}
          onClose={() => setAusenciaModal(false)}
          onSave={guardarAusencia}
        />
      )}
      {seguimientoOpen && (
        <SeguimientoPersonaModal
          empleados={empleados}
          config={config}
          onClose={() => setSeguimientoOpen(false)}
        />
      )}
    </div>
  );
}

function SeguimientoPersonaModal({ empleados, config, onClose }) {
  const [query, setQuery] = useState("");
  const [empleadoId, setEmpleadoId] = useState("");
  const [hasta, setHasta] = useState(() => hoyIso());
  const [desde, setDesde] = useState(() => addDays(hoyIso(), -29));
  const [marcaciones, setMarcaciones] = useState([]);
  const [justificaciones, setJustificaciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const empleado = useMemo(
    () => (empleados ?? []).find((emp) => emp.id === empleadoId) ?? null,
    [empleados, empleadoId],
  );

  const coincidencias = useMemo(() => {
    const term = safeText(query).toLowerCase();
    return [...(empleados ?? [])]
      .filter((emp) => emp.activo !== false && emp.ficha !== false)
      .filter((emp) => !term || `${emp.nombre} ${emp.dni} ${emp.sede}`.toLowerCase().includes(term))
      .sort((a, b) => safeText(a.nombre).localeCompare(safeText(b.nombre), "es"))
      .slice(0, 12);
  }, [empleados, query]);

  useEffect(() => {
    let alive = true;
    if (!empleadoId || !desde || !hasta || hasta < desde) {
      return () => { alive = false; };
    }

    Promise.all([
      fetchMarcacionesEmpleado(empleadoId, desde, hasta),
      fetchJustificaciones(desde, hasta, { empleadoId }),
    ])
      .then(([marks, justs]) => {
        if (!alive) return;
        setMarcaciones(marks ?? []);
        setJustificaciones(justs ?? []);
      })
      .catch((reason) => {
        if (alive) setError(reason?.message || "No se pudo cargar el seguimiento.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [empleadoId, desde, hasta]);

  const historial = useMemo(() => {
    if (!empleado) return [];
    const marksByDate = new Map((marcaciones ?? []).map((mark) => [mark.fecha, mark]));
    const justByDate = new Map((justificaciones ?? []).map((justificacion) => [justificacion.fecha, justificacion]));
    const tardeMin = timeToMin(config?.tolerancia_tarde) ?? 430;

    return rangoFechas(desde, hasta)
      .filter((day) => diaSemana(day) !== 0 && diaSemana(day) !== 6)
      .reverse()
      .map((day) => {
        const marcacion = marksByDate.get(day) ?? null;
        const justificacion = justByDate.get(day) ?? null;
        const entrada = hhmm(marcacion?.entrada);
        const salida = hhmm(marcacion?.salida);
        const tarde = entrada != null && timeToMin(entrada) > tardeMin;
        const incompleta = !!marcacion && (!entrada || !salida);
        const tipo = !marcacion ? (justificacion ? "justificada" : "ausente") : (incompleta ? "incompleta" : (tarde ? "tarde" : "presente"));

        return {
          fecha: day,
          tipo,
          marcacion,
          justificacion,
          entrada,
          salida,
          minutos: marcacion ? duracionMin(marcacion) : null,
        };
      });
  }, [config?.tolerancia_tarde, desde, empleado, justificaciones, marcaciones, hasta]);

  const resumen = useMemo(() => ({
    presentes: historial.filter((row) => row.marcacion).length,
    tardes: historial.filter((row) => row.tipo === "tarde").length,
    ausentes: historial.filter((row) => row.tipo === "ausente").length,
    justificadas: historial.filter((row) => row.tipo === "justificada").length,
  }), [historial]);

  const estadoUi = {
    presente: { label: "Presente", color: C.green, background: C.greenL, border: C.greenB },
    tarde: { label: "Llegada tarde", color: C.amber, background: C.amberL, border: C.amberB },
    incompleta: { label: "Marcacion incompleta", color: C.blue, background: C.blueL, border: C.blueB },
    justificada: { label: "Ausencia justificada", color: C.green, background: C.greenL, border: C.greenB },
    ausente: { label: "Ausente", color: C.red, background: C.redL, border: C.redB },
  };

  function seleccionar(emp) {
    setLoading(true);
    setError("");
    setEmpleadoId(emp.id);
    setQuery("");
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2250, background: "var(--overlay-strong)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(event) => event.stopPropagation()} style={{ width: "min(760px, 96vw)", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", borderRadius: 14, background: C.panelSolid, border: `1px solid ${C.b1}`, boxShadow: "0 24px 70px rgba(0,0,0,.28)" }}>
        <div style={{ minHeight: 62, padding: "14px 16px", display: "flex", alignItems: "center", gap: 11, borderBottom: `1px solid ${C.b0}` }}>
          <span style={{ width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 10, color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}` }}><Search size={17} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 750, color: C.t0 }}>Seguimiento por persona</div>
            <div style={{ marginTop: 3, color: C.t2, fontSize: 11 }}>Marcaciones, llegadas tarde, ausencias y justificaciones.</div>
          </div>
          <button type="button" aria-label="Cerrar seguimiento" title="Cerrar" onClick={onClose} style={{ ...BTN, padding: 6, display: "grid", placeItems: "center", background: "transparent" }}><X size={15} /></button>
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          {!empleado ? (
            <>
              <div className="presentismo-search" style={{ marginBottom: 10 }}>
                <Search size={15} />
                <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar persona por nombre o DNI" style={INP} />
              </div>
              <div style={{ border: `1px solid ${C.b0}`, borderRadius: 10, overflow: "hidden" }}>
                {coincidencias.map((emp) => (
                  <button key={emp.id} type="button" onClick={() => seleccionar(emp)} style={{ width: "100%", minHeight: 52, padding: "8px 10px", display: "flex", alignItems: "center", gap: 9, textAlign: "left", cursor: "pointer", background: "transparent", color: C.t0, border: 0, borderBottom: `1px solid ${C.b0}` }}>
                    <EmpleadoAvatar emp={emp} size={32} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 700 }}>{emp.nombre}</span>
                      <span style={{ display: "block", marginTop: 2, color: C.t2, fontSize: 10 }}>{emp.dni} {emp.sede ? `- ${emp.sede}` : ""}</span>
                    </span>
                    <ChevronRight size={15} color={C.t2} />
                  </button>
                ))}
                {!coincidencias.length && <div style={{ padding: 28, color: C.t2, fontSize: 12, textAlign: "center" }}>No encontramos una persona con esa busqueda.</div>}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 11, paddingBottom: 14, borderBottom: `1px solid ${C.b0}` }}>
                <EmpleadoAvatar emp={empleado} size={46} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: C.t0, fontSize: 15, fontWeight: 750 }}>{empleado.nombre}</div>
                  <div style={{ color: C.t2, fontSize: 11, marginTop: 3 }}>DNI {empleado.dni || "sin DNI"}{empleado.sede ? ` - ${empleado.sede}` : ""}</div>
                </div>
                <button type="button" onClick={() => { setEmpleadoId(""); setQuery(""); }} style={{ ...BTN, padding: "6px 9px", fontSize: 10 }}>Cambiar persona</button>
              </div>

              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center", padding: "12px 0" }}>
                <label style={{ display: "grid", gap: 4, color: C.t2, fontSize: 10, fontWeight: 700 }}>DESDE
                  <input type="date" value={desde} onChange={(event) => { const next = event.target.value; if (next && next <= hasta) { setLoading(true); setError(""); } setDesde(next); }} style={{ ...INP, fontSize: 12 }} />
                </label>
                <label style={{ display: "grid", gap: 4, color: C.t2, fontSize: 10, fontWeight: 700 }}>HASTA
                  <input type="date" value={hasta} onChange={(event) => { const next = event.target.value; if (next && next >= desde) { setLoading(true); setError(""); } setHasta(next); }} style={{ ...INP, fontSize: 12 }} />
                </label>
                <span style={{ color: C.t2, fontSize: 10, alignSelf: "end", paddingBottom: 8 }}>No incluye sabados ni domingos.</span>
              </div>

              {hasta < desde && <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 8, color: C.red, background: C.redL, border: `1px solid ${C.redB}`, fontSize: 11 }}>La fecha final debe ser igual o posterior a la inicial.</div>}
              {error && <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 8, color: C.red, background: C.redL, border: `1px solid ${C.redB}`, fontSize: 11 }}>{error}</div>}

              {loading ? <div style={{ padding: 34, textAlign: "center", color: C.t2, fontSize: 12 }}>Cargando seguimiento...</div> : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", overflow: "hidden", border: `1px solid ${C.b0}`, borderRadius: 10, marginBottom: 12 }}>
                    {[
                      ["Presentes", resumen.presentes, C.green],
                      ["Tardes", resumen.tardes, resumen.tardes ? C.amber : C.green],
                      ["Ausentes", resumen.ausentes, resumen.ausentes ? C.red : C.green],
                      ["Justificadas", resumen.justificadas, C.green],
                    ].map(([label, value, color]) => (
                      <div key={label} style={{ padding: "10px 11px", borderRight: `1px solid ${C.b0}` }}>
                        <div style={{ color, fontSize: 17, fontFamily: C.mono, fontWeight: 800 }}>{value}</div>
                        <div style={{ color: C.t2, fontSize: 9, fontWeight: 700, textTransform: "uppercase", marginTop: 3 }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ border: `1px solid ${C.b0}`, borderRadius: 10, overflow: "hidden" }}>
                    {historial.map((row) => {
                      const ui = estadoUi[row.tipo];
                      const detalle = row.marcacion
                        ? `${row.entrada || "sin entrada"} - ${row.salida || "sin salida"}${row.minutos != null ? ` (${minToHM(row.minutos)})` : ""}`
                        : row.justificacion?.motivo || "Sin marcacion registrada";
                      return (
                        <div key={row.fecha} style={{ minHeight: 48, padding: "8px 10px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.b0}` }}>
                          <span style={{ width: 70, color: C.t2, fontSize: 10, fontFamily: C.mono, flexShrink: 0 }}>{fmtFechaCorta(row.fecha)}</span>
                          <span style={{ color: ui.color, background: ui.background, border: `1px solid ${ui.border}`, borderRadius: 999, padding: "3px 7px", fontSize: 9, fontWeight: 800, flexShrink: 0 }}>{ui.label}</span>
                          <span title={detalle} style={{ minWidth: 0, color: C.t1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detalle}</span>
                        </div>
                      );
                    })}
                    {!historial.length && <div style={{ padding: 28, textAlign: "center", color: C.t2, fontSize: 12 }}>Elegí un rango valido para ver el historial.</div>}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function JustificacionModal({ data, canEditTime, onClose, onSave }) {
  const [motivo, setMotivo] = useState(data.actual?.motivo ?? "");
  const [entrada, setEntrada] = useState(hhmm(data.marcacion?.entrada) ?? "");
  const [salida, setSalida] = useState(hhmm(data.marcacion?.salida) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const originalEntrada = hhmm(data.marcacion?.entrada) ?? "";
  const originalSalida = hhmm(data.marcacion?.salida) ?? "";
  const originalMotivo = String(data.actual?.motivo ?? "").trim();
  const horariosCambiaron = entrada !== originalEntrada || salida !== originalSalida;
  const motivoCambio = motivo.trim() !== originalMotivo;
  const canSave = horariosCambiaron || motivoCambio;

  async function guardar() {
    if (!canSave) return;
    if (entrada && salida && timeToMin(salida) <= timeToMin(entrada)) {
      setError("La salida debe ser posterior al horario de entrada.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(data, {
        empleadoId: data.emp.id,
        fecha: data.fecha,
        motivo,
        entrada,
        salida,
        horariosCambiaron,
        motivoCambio,
      });
    } catch (e) {
      setError(e?.message || "No se pudo guardar la revisión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2200, background: "var(--overlay-strong)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 14, width: "min(520px,96vw)", overflow: "hidden", boxShadow: "0 24px 70px rgba(0,0,0,.28)" }}>
        <div style={{ minHeight: 62, padding: "14px 16px", display: "flex", alignItems: "center", gap: 11, borderBottom: `1px solid ${C.b0}` }}>
          <EmpleadoAvatar emp={data.emp} size={38} justified={!data.marcacion && !!data.actual} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 750, color: C.t0 }}>{data.marcacion ? "Revisar jornada" : "Justificar ausencia o cargar horario"}</div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>{data.emp.nombre} · {fmtFecha(data.fecha)}</div>
          </div>
          <button type="button" aria-label="Cerrar" title="Cerrar" onClick={onClose} style={{ ...BTN, padding: 6, display: "grid", placeItems: "center", background: "transparent" }}><X size={15} /></button>
        </div>

        <div style={{ padding: 16 }}>
          {canEditTime && (
            <>
              <div style={{ fontSize: 10, fontWeight: 750, color: C.t2, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Horarios del día</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <label style={{ display: "grid", gap: 6, fontSize: 11, color: C.t1 }}>
                  Entrada
                  <input type="time" value={entrada} onChange={e => setEntrada(e.target.value)} style={{ ...INP, width: "100%", fontFamily: C.mono, fontSize: 14 }} />
                </label>
                <label style={{ display: "grid", gap: 6, fontSize: 11, color: C.t1 }}>
                  Salida
                  <input type="time" value={salida} onChange={e => setSalida(e.target.value)} style={{ ...INP, width: "100%", fontFamily: C.mono, fontSize: 14 }} />
                </label>
              </div>

              <div style={{ margin: "12px 0", padding: "9px 10px", display: "flex", alignItems: "flex-start", gap: 8, borderRadius: 8, color: C.t2, background: C.blueL, border: `1px solid ${C.blueB}`, fontSize: 10, lineHeight: 1.45 }}>
                <Info size={14} color={C.blue} style={{ flexShrink: 0, marginTop: 1 }} />
                El horario corregido queda identificado como edición manual y no se reemplaza al volver a importar el fichero.
              </div>
            </>
          )}

          <label style={{ display: "grid", gap: 6, fontSize: 11, color: C.t1 }}>
            Justificación o aclaración
            {!data.marcacion && (
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                {AUSENCIA_TIPOS.map(tipo => (
                  <button key={tipo} type="button" style={{ ...BTN, padding: "4px 8px", fontSize: 10, color: motivo.startsWith(tipo) ? C.green : C.t2, borderColor: motivo.startsWith(tipo) ? C.greenB : C.b0, background: motivo.startsWith(tipo) ? C.greenL : "transparent" }} onClick={() => setMotivo(tipo)}>{tipo}</button>
                ))}
              </span>
            )}
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej.: olvidó fichar al ingresar; horario confirmado por encargado."
              style={{ ...INP, width: "100%", minHeight: 88, resize: "vertical" }}
            />
          </label>

          {error && <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 7, color: C.red, background: C.redL, border: `1px solid ${C.redB}`, fontSize: 11 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.b0}` }}>
            <button type="button" onClick={onClose} style={BTN}>Cancelar</button>
            <button type="button" disabled={saving || !canSave} onClick={guardar} style={{ ...BTN_PRIMARY, minWidth: 132, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: saving || !canSave ? 0.55 : 1 }}>
              <Save size={14} /> {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AusenciaPeriodoModal({ empleados, initialDate, onClose, onSave }) {
  const [tipo, setTipo] = useState("Reposo");
  const [desde, setDesde] = useState(initialDate);
  const [hasta, setHasta] = useState(initialDate);
  const [detalle, setDetalle] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const visibles = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (empleados ?? [])
      .filter(emp => emp.activo !== false && emp.ficha !== false)
      .filter(emp => !term || `${emp.nombre} ${emp.dni} ${emp.sede}`.toLowerCase().includes(term))
      .sort((a, b) => safeText(a.nombre).localeCompare(safeText(b.nombre), "es"));
  }, [empleados, query]);

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function seleccionarVisibles() {
    setSelected(prev => {
      const next = new Set(prev);
      const allSelected = visibles.length > 0 && visibles.every(emp => next.has(emp.id));
      for (const emp of visibles) {
        if (allSelected) next.delete(emp.id);
        else next.add(emp.id);
      }
      return next;
    });
  }

  async function guardar() {
    if (!selected.size) {
      setError("Selecciona al menos una persona.");
      return;
    }
    if (!desde || !hasta || hasta < desde) {
      setError("Revisa las fechas del periodo.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ empleadoIds: [...selected], desde, hasta, tipo, detalle });
    } catch (e) {
      setError(e?.message || "No se pudo guardar la ausencia.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2250, background: "var(--overlay-strong)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={event => event.stopPropagation()} style={{ width: "min(620px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 14, boxShadow: "0 24px 70px rgba(0,0,0,.28)" }}>
        <div style={{ minHeight: 62, padding: "14px 16px", display: "flex", alignItems: "center", gap: 11, borderBottom: `1px solid ${C.b0}` }}>
          <span style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 9, color: C.green, background: C.greenL, border: `1px solid ${C.greenB}` }}><CalendarOff size={17} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 750, color: C.t0 }}>Cargar ausencia justificada</div>
            <div style={{ marginTop: 3, color: C.t2, fontSize: 11 }}>Aplica reposo, vacaciones o licencia a una o varias personas.</div>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} style={{ ...BTN, padding: 6, display: "grid", placeItems: "center", background: "transparent" }}><X size={15} /></button>
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 9 }}>
            <label style={{ display: "grid", gap: 6, color: C.t1, fontSize: 11 }}>Tipo
              <select value={tipo} onChange={event => setTipo(event.target.value)} style={{ ...INP, width: "100%" }}>{AUSENCIA_TIPOS.map(value => <option key={value}>{value}</option>)}</select>
            </label>
            <label style={{ display: "grid", gap: 6, color: C.t1, fontSize: 11 }}>Desde
              <input type="date" value={desde} onChange={event => setDesde(event.target.value)} style={{ ...INP, width: "100%" }} />
            </label>
            <label style={{ display: "grid", gap: 6, color: C.t1, fontSize: 11 }}>Hasta
              <input type="date" value={hasta} onChange={event => setHasta(event.target.value)} style={{ ...INP, width: "100%" }} />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6, marginTop: 10, color: C.t1, fontSize: 11 }}>Detalle opcional
            <input value={detalle} onChange={event => setDetalle(event.target.value)} placeholder="Ej.: certificado médico entregado" style={{ ...INP, width: "100%" }} />
          </label>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.b0}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
              <div>
                <div style={{ color: C.t0, fontSize: 12, fontWeight: 700 }}>Personas</div>
                <div style={{ color: C.t2, fontSize: 10, marginTop: 2 }}>{selected.size} seleccionadas</div>
              </div>
              <button type="button" onClick={seleccionarVisibles} style={{ ...BTN, padding: "5px 8px", fontSize: 10 }}>Seleccionar visibles</button>
            </div>
            <div className="presentismo-search" style={{ marginBottom: 8 }}><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nombre o DNI" style={INP} /></div>
            <div style={{ maxHeight: 250, overflowY: "auto", border: `1px solid ${C.b0}`, borderRadius: 9 }}>
              {visibles.map(emp => (
                <label key={emp.id} style={{ minHeight: 42, padding: "7px 10px", display: "flex", alignItems: "center", gap: 9, cursor: "pointer", borderBottom: `1px solid ${C.b0}`, background: selected.has(emp.id) ? C.greenL : "transparent" }}>
                  <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggle(emp.id)} />
                  <EmpleadoAvatar emp={emp} size={30} />
                  <span style={{ minWidth: 0, flex: 1 }}><span style={{ display: "block", color: C.t0, fontSize: 11, fontWeight: 650 }}>{emp.nombre}</span><span style={{ display: "block", color: C.t2, fontSize: 9, marginTop: 2 }}>{emp.dni} · {emp.sede || "Sin sede"}</span></span>
                </label>
              ))}
              {!visibles.length && <div style={{ padding: 24, textAlign: "center", color: C.t2, fontSize: 11 }}>No hay personas para esta búsqueda.</div>}
            </div>
          </div>

          {error && <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 7, color: C.red, background: C.redL, border: `1px solid ${C.redB}`, fontSize: 11 }}>{error}</div>}
        </div>

        <div style={{ padding: "12px 16px", display: "flex", justifyContent: "flex-end", gap: 8, borderTop: `1px solid ${C.b0}` }}>
          <button type="button" onClick={onClose} style={BTN}>Cancelar</button>
          <button type="button" disabled={saving || !selected.size} onClick={guardar} style={{ ...BTN_PRIMARY, minWidth: 140, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: saving || !selected.size ? .55 : 1 }}><Save size={14} /> {saving ? "Guardando..." : "Guardar ausencia"}</button>
        </div>
      </div>
    </div>
  );
}
