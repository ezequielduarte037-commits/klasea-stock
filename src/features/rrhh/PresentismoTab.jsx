// Presentismo: vista por dia o rango, ausentes, anomalias y justificaciones.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import {
  addDays,
  diaSemana,
  downloadCsv,
  duracionMin,
  fetchJustificaciones,
  fetchMarcaciones,
  fmtFecha,
  fmtFechaCorta,
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
const XLSX_GROUP = "D9EAF7";
const XLSX_HEADER = "D9EAD3";
const XLSX_SECTION = "E7E6E6";

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
    const effectiveRow = ["title", "meta", "section", "group", "header", "tarde", "ausente", "empty"].includes(kind)
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
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${XLSX_YELLOW}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${XLSX_RED}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${XLSX_GROUP}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${XLSX_HEADER}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${XLSX_SECTION}"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFB7B7B7"/></left><right style="thin"><color rgb="FFB7B7B7"/></right><top style="thin"><color rgb="FFB7B7B7"/></top><bottom style="thin"><color rgb="FFB7B7B7"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
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
  const [justModal, setJustModal] = useState(null);

  const d1 = modo === "dia" ? fecha : desde;
  const d2 = modo === "dia" ? fecha : hasta;

  useEffect(() => {
    let alive = true;
    setMarcas(null);
    setError(null);
    Promise.all([fetchMarcaciones(d1, d2), fetchJustificaciones(d1, d2)])
      .then(([rows, justs]) => {
        if (!alive) return;
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
        emp,
        fecha: m.fecha,
        sede: m.sede,
        entrada,
        salida,
        min,
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
    if (soloAnomalias) rows = rows.filter(r => r.sinSalida || r.tarde);
    return [...rows].sort((a, b) =>
      a.fecha !== b.fecha ? a.fecha.localeCompare(b.fecha) : safeText(a.emp.nombre).localeCompare(safeText(b.emp.nombre), "es"));
  }, [filas, filtroSede, filtroGrupo, q, soloAnomalias]);

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
      anomalias: filtradas.filter(r => r.sinSalida || r.tarde).length,
      ausentesJustificados: ausentes.filter(r => r.justificacion).length,
    };
  }, [filtradas, ausentes]);

  async function guardarMotivo(empleadoId, fechaJust, motivo) {
    const saved = await guardarJustificacion(empleadoId, fechaJust, motivo);
    setJustificaciones(prev => {
      const key = keyJust(empleadoId, fechaJust);
      const clean = prev.filter(j => keyJust(j.empleado_id, j.fecha) !== key);
      return saved ? [...clean, saved] : clean;
    });
    setJustModal(null);
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
      [r.sinSalida ? "sin salida" : null, r.tarde ? "tarde" : null].filter(Boolean).join(", "),
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
        estado: r.tarde ? "TARDE" : "OK",
        observaciones: obs,
      };
    };

    const toAbsentRow = (emp, fechaIso) => {
      const justificacion = justByKey.get(keyJust(emp.id, fechaIso));
      const names = splitNombreCompleto(emp.nombre);
      return {
        kind: "ausente",
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
    background: on ? "rgba(59,130,246,0.13)" : C.s0,
    border: `1px solid ${on ? "rgba(59,130,246,0.35)" : C.b0}`,
    color: on ? "#60a5fa" : C.t2,
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <button style={selSt(modo === "dia")} onClick={() => setModo("dia")}>Por dia</button>
        <button style={selSt(modo === "rango")} onClick={() => setModo("rango")}>Rango</button>
        {modo === "dia" ? (
          <>
            <button style={BTN} onClick={() => setFecha(addDays(fecha, -1))}>‹</button>
            <input type="date" style={INP} value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} />
            <button style={BTN} onClick={() => setFecha(addDays(fecha, 1))}>›</button>
            {fecha !== hoy && <button style={BTN} onClick={() => setFecha(hoy)}>Hoy</button>}
          </>
        ) : (
          <>
            <input type="date" style={INP} value={desde} onChange={e => e.target.value && setDesde(e.target.value)} />
            <span style={{ color: C.t2, fontSize: 12 }}>→</span>
            <input type="date" style={INP} value={hasta} onChange={e => e.target.value && setHasta(e.target.value)} />
          </>
        )}
        <div style={{ flex: 1 }} />
        <button style={BTN_PRIMARY} onClick={exportarXlsx}>⬇ Exportar XLSX</button>
        <button style={BTN} onClick={exportar}>⬇ Exportar CSV</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
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
        <input style={{ ...INP, flex: 1, minWidth: 150 }} placeholder="Buscar nombre o DNI..." value={q} onChange={e => setQ(e.target.value)} />
        <button style={selSt(soloAnomalias)} onClick={() => setSoloAnomalias(v => !v)}>⚠ Solo anomalías</button>
      </div>

      {error && <ErrorBox error={error} />}
      {!error && filtradas == null && <Cargando />}

      {filtradas != null && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <KpiCard label={modo === "dia" ? "Presentes" : "Personas"} value={stats.presentes} color={C.green} />
            <KpiCard label="Casa" value={stats.casa} color="#60a5fa" />
            <KpiCard label="Contratistas" value={stats.contr} color="#fbbf24" />
            {modo === "dia" && <KpiCard label="Ausentes" value={ausentes.length} color={ausentes.length ? "#f87171" : C.green} sub={stats.ausentesJustificados ? `${stats.ausentesJustificados} just.` : ""} />}
            <KpiCard label="Anomalias" value={stats.anomalias} color={stats.anomalias ? C.amber : C.green} sub="sin salida / tarde" />
          </div>

          {filtradas.length === 0 ? (
            <div style={{ color: C.t2, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Sin marcaciones para este filtro.</div>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
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
                  {filtradas.map(r => (
                    <tr key={r.key}>
                      {modo === "rango" && <Td mono color={C.t2}>{fmtFechaCorta(r.fecha)}</Td>}
                      <Td>
                        {r.emp.nombre}
                        <span style={{ fontSize: 11, color: C.t2, fontFamily: C.mono, marginLeft: 8 }}>{r.emp.dni}</span>
                      </Td>
                      <Td color={r.sede ? C.t1 : C.t2}>{r.sede ?? "—"}</Td>
                      <Td><GrupoBadge grupo={r.emp.grupo} contratistaNombre={r.emp.contratista?.nombre} /></Td>
                      <Td right mono color={r.tarde ? C.amber : C.t0}>{r.entrada ?? "—"}</Td>
                      <Td right mono>{r.salida ?? "—"}</Td>
                      <Td right mono color={r.min != null ? C.t0 : C.t2}>{r.min != null ? minToHM(r.min) : "—"}</Td>
                      <Td style={{ whiteSpace: "normal", minWidth: 190 }}>
                        {r.tarde && <span style={{ fontSize: 11, color: C.amber, marginRight: 6 }}>tarde</span>}
                        {r.sinSalida && <span style={{ fontSize: 11, color: "#f87171", marginRight: 6 }}>sin salida</span>}
                        {r.justificacion && <span title={r.justificacion.motivo} style={{ fontSize: 11, color: C.green, marginRight: 6 }}>justificada</span>}
                        <button
                          type="button"
                          style={{ ...BTN, padding: "3px 8px", fontSize: 11 }}
                          onClick={() => setJustModal({ emp: r.emp, fecha: r.fecha, actual: r.justificacion })}
                        >
                          {r.justificacion ? "Editar" : "Justificar"}
                        </button>
                      </Td>
                      {esAdmin && (
                        <Td>
                          <button
                            type="button"
                            style={{ ...BTN, padding: "3px 8px", fontSize: 11, color: "#f87171", border: "1px solid rgba(248,113,113,0.35)" }}
                            onClick={() => borrarEmpleado(r.emp)}
                          >
                            Borrar
                          </button>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {modo === "dia" && ausentes.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: "#f87171", fontWeight: 700, marginBottom: 8 }}>
                Ausentes ({ausentes.length}) — {fmtFecha(fecha)}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ausentes.map(({ emp, justificacion }) => (
                  <div key={emp.id} style={{ fontSize: 12, color: C.t1, background: C.s0, border: `1px solid ${justificacion ? "rgba(16,185,129,0.28)" : C.b0}`, padding: "5px 11px", borderRadius: 7, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    {emp.nombre}
                    {emp.sede && <span style={{ fontSize: 11, color: C.t2 }}>{emp.sede}</span>}
                    <GrupoBadge grupo={emp.grupo} contratistaNombre={emp.contratista?.nombre} />
                    <span style={{ fontSize: 11, color: justificacion ? C.green : "#f87171" }}>
                      ausente{justificacion ? " (justificada)" : ""}
                    </span>
                    <button
                      type="button"
                      style={{ ...BTN, padding: "2px 7px", fontSize: 11 }}
                      onClick={() => setJustModal({ emp, fecha, actual: justificacion })}
                    >
                      {justificacion ? "Editar" : "Justificar"}
                    </button>
                    {esAdmin && (
                      <button
                        type="button"
                        style={{ ...BTN, padding: "2px 7px", fontSize: 11, color: "#f87171", border: "1px solid rgba(248,113,113,0.35)" }}
                        onClick={() => borrarEmpleado(emp)}
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {justModal && (
        <JustificacionModal
          data={justModal}
          onClose={() => setJustModal(null)}
          onSave={guardarMotivo}
        />
      )}
    </div>
  );
}

function JustificacionModal({ data, onClose, onSave }) {
  const [motivo, setMotivo] = useState(data.actual?.motivo ?? "");
  const [saving, setSaving] = useState(false);
  const canSave = motivo.trim() || data.actual;

  async function guardar() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(data.emp.id, data.fecha, motivo);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2200, background: "var(--overlay-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 20, width: "min(430px,94vw)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.t0, marginBottom: 6 }}>Falta justificada</div>
        <div style={{ fontSize: 12, color: C.t2, marginBottom: 14 }}>{data.emp.nombre} · {fmtFecha(data.fecha)}</div>
        <textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Motivo..."
          autoFocus
          style={{ ...INP, width: "100%", minHeight: 86, resize: "vertical", marginBottom: 12 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={saving || !canSave} onClick={guardar} style={{ ...BTN_PRIMARY, flex: 1, opacity: saving || !canSave ? 0.55 : 1 }}>
            {saving ? "Guardando..." : motivo.trim() ? "Guardar" : "Quitar justificación"}
          </button>
          <button onClick={onClose} style={BTN}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
