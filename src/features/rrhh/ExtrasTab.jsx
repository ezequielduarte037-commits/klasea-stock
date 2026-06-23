// Horas extras por rango: compara lo trabajado contra la jornada esperada
// (lun-vie / sábado configurables; domingo todo cuenta como extra).
import { useEffect, useMemo, useState } from "react";
import { C } from "@/theme";
import {
  addDays, diaSemana, downloadCsv, duracionMin, fetchMarcaciones, fmtFecha, fmtFechaCorta,
  hhmm, hoyIso, minToHM, SEDES, timeToMin,
} from "./api";
import { BTN, Cargando, ErrorBox, GrupoBadge, INP, KpiCard, Td, Th } from "./ui";

const EXTRA_DESDE = "16:00";
const INICIO_CONTEO = "07:00";
const EXTRA_MINIMA_MIN = 30;
const EXTRA_BLOQUE_MIN = 30; // las extras se cuentan POR DÍA en bloques de media hora (floor); < 30 min = 0

function safeText(value) {
  return String(value ?? "").toLowerCase();
}

// Redondea las extras de un día hacia abajo a media hora: 2 min = 0, 35 = 30, 65 = 60.
function redondearExtra(min) {
  return Math.floor(Math.max(0, min) / EXTRA_BLOQUE_MIN) * EXTRA_BLOQUE_MIN;
}

function extraOperativaMin(m) {
  const entrada = timeToMin(m.entrada);
  const salida = timeToMin(m.salida);
  if (entrada == null || salida == null) return 0;
  const dow = diaSemana(m.fecha);
  const inicioConteo = timeToMin(INICIO_CONTEO) ?? 420;
  let bruto;
  if (dow === 6) bruto = Math.max(0, salida - Math.max(entrada, inicioConteo));
  else if (dow === 0) bruto = 0;
  else {
    const desde = timeToMin(EXTRA_DESDE) ?? 975;
    bruto = Math.max(0, salida - Math.max(entrada, desde));
  }
  return redondearExtra(bruto);
}

function nombreContratista(emp) {
  return emp?.contratista?.nombre || "Sin jefe asignado";
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
  if (kind === "extra") return 6;
  if (kind === "empty") return 7;
  return 0;
}

function sheetXml(sheet) {
  const cols = sheet.cols.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("");
  const rows = sheet.aoa.map((row, ri) => {
    const r = ri + 1;
    const kind = sheet.kinds[ri] ?? "normal";
    const style = styleId(kind);
    const effectiveRow = ["title", "meta", "section", "group", "header", "empty"].includes(kind)
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
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${cols}</cols>
  <sheetData>${rows}</sheetData>
  ${merges}
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
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
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9EAD3"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFB7B7B7"/></left><right style="thin"><color rgb="FFB7B7B7"/></right><top style="thin"><color rgb="FFB7B7B7"/></top><bottom style="thin"><color rgb="FFB7B7B7"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
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
    const localBytes = new Uint8Array(local);
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
    centralParts.push(new Uint8Array(central), nameBytes);
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
  return new Blob([...localParts, ...centralParts, new Uint8Array(end)], {
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

function buildExtrasSheet({ title, periodo, rows, includeJefe }) {
  const headers = includeJefe
    ? ["Fecha", "DNI", "Empleado", "Sede", "Jefe", "Entrada", "Salida", "Horas", "Horas extra", "Observaciones"]
    : ["Fecha", "DNI", "Empleado", "Sede", "Entrada", "Salida", "Horas", "Horas extra", "Observaciones"];
  const aoa = [];
  const kinds = [];
  const add = (row, kind = "normal") => {
    aoa.push(row);
    kinds.push(kind);
  };

  add(["Reporte de horas extra"], "title");
  add([`Hora de exportacion: ${new Date().toLocaleString("es-AR")}`], "meta");
  add([`Periodo: ${periodo}`], "meta");
  add([`Regla: L-V desde ${EXTRA_DESDE}; sabados desde ${INICIO_CONTEO}; minimo ${EXTRA_MINIMA_MIN} minutos`], "meta");
  add([title], "section");
  add(headers, "header");

  if (!rows.length) {
    add(["Sin horas extra para este filtro."], "empty");
  } else {
    for (const row of rows) {
      if (row.kind === "group") {
        add([row.label], "group");
        continue;
      }
      const base = [
        fmtFecha(row.fecha),
        row.dni,
        row.empleado,
        row.sede,
      ];
      if (includeJefe) base.push(row.jefe);
      base.push(row.entrada, row.salida, row.horas, row.extra, row.obs);
      add(base, "extra");
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
      [4, 1, 4, headers.length],
      [5, 1, 5, headers.length],
    ],
    cols: [
      12,
      14,
      28,
      12,
      ...(includeJefe ? [28] : []),
      12,
      12,
      12,
      14,
      28,
    ],
  };
}

export default function ExtrasTab({ empleados, contratistas }) {
  const hoy = hoyIso();
  const [desde, setDesde] = useState(addDays(hoy, -13));
  const [hasta, setHasta] = useState(hoy);
  const [marcas, setMarcas] = useState(null);
  const [error, setError] = useState(null);
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [filtroSede, setFiltroSede] = useState("todas");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let alive = true;
    setMarcas(null); setError(null);
    fetchMarcaciones(desde, hasta)
      .then(rows => { if (alive) setMarcas(rows); })
      .catch(e => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [desde, hasta]);

  const empById = useMemo(() => new Map((empleados ?? []).map(e => [e.id, e])), [empleados]);

  // Agregado por empleado
  const filas = useMemo(() => {
    if (!marcas) return null;
    const map = new Map();
    for (const m of marcas) {
      if (filtroSede !== "todas" && m.sede !== filtroSede) continue;
      const emp = empById.get(m.empleado_id);
      if (!emp || emp.ficha === false) continue;
      const min = duracionMin(m);
      if (min == null) continue; // sin salida: no se puede computar
      const extra = extraOperativaMin(m);
      let row = map.get(emp.id);
      if (!row) { row = { emp, dias: 0, totalMin: 0, extraMin: 0, detalle: [] }; map.set(emp.id, row); }
      row.dias += 1;
      row.totalMin += min;
      row.extraMin += extra;
      row.detalle.push({ fecha: m.fecha, min, extra, entrada: m.entrada, salida: m.salida, sede: m.sede });
    }
    return [...map.values()]
      .filter(r => r.extraMin >= EXTRA_MINIMA_MIN)
      .sort((a, b) => b.extraMin - a.extraMin || safeText(a.emp.nombre).localeCompare(safeText(b.emp.nombre), "es"));
  }, [marcas, empById, filtroSede]);

  const filtradas = useMemo(() => {
    if (!filas) return null;
    let rows = filas;
    if (filtroGrupo === "casa") rows = rows.filter(r => r.emp.grupo === "casa");
    else if (filtroGrupo === "contratistas") rows = rows.filter(r => r.emp.grupo === "contratista");
    else if (filtroGrupo === "sin_asignar") rows = rows.filter(r => r.emp.grupo === "sin_asignar");
    else if (filtroGrupo.startsWith("c:")) rows = rows.filter(r => r.emp.contratista_id === filtroGrupo.slice(2));
    if (q.trim()) {
      const qq = safeText(q);
      rows = rows.filter(r => safeText(r.emp.nombre).includes(qq) || safeText(r.emp.dni).includes(qq));
    }
    return rows;
  }, [filas, filtroGrupo, q]);

  const totales = useMemo(() => {
    if (!filtradas) return null;
    return {
      extra: filtradas.reduce((a, r) => a + r.extraMin, 0),
      conExtra: filtradas.filter(r => r.extraMin > 0).length,
      personas: filtradas.length,
    };
  }, [filtradas]);

  function exportar() {
    if (!filtradas) return;
    downloadCsv(
      `horas_extras_${desde}_${hasta}.csv`,
      ["DNI", "Nombre", "Sede", "Grupo", "Contratista", "Días", "Horas totales", "Horas extra"],
      filtradas.map(r => [
        r.emp.dni, r.emp.nombre,
        filtroSede === "todas" ? "Todas" : filtroSede,
        r.emp.grupo === "casa" ? "Casa" : r.emp.grupo === "contratista" ? "Contratista" : "Sin asignar",
        r.emp.contratista?.nombre ?? "", r.dias, minToHM(r.totalMin), minToHM(r.extraMin),
      ]),
    );
  }

  function rowsEmpleado(r, includeJefe = false) {
    const out = [{
      kind: "group",
      label: `${r.emp.nombre} - Total extra ${minToHM(r.extraMin)} - ${r.dias} dia${r.dias !== 1 ? "s" : ""}`,
    }];
    const detalles = [...r.detalle]
      .filter(d => d.extra > 0)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (const d of detalles) {
      out.push({
        fecha: d.fecha,
        dni: r.emp.dni ?? "",
        empleado: r.emp.nombre ?? "",
        sede: d.sede ?? r.emp.sede ?? "",
        jefe: includeJefe ? nombreContratista(r.emp) : "",
        entrada: d.entrada ?? "",
        salida: d.salida ?? "",
        horas: minToHM(d.min),
        extra: minToHM(d.extra),
        obs: d.extra < EXTRA_MINIMA_MIN ? "Suma por acumulado del periodo" : "",
      });
    }
    return out;
  }

  function exportarXlsx() {
    if (!filtradas) return;
    const ordenadas = [...filtradas].sort((a, b) => safeText(a.emp.nombre).localeCompare(safeText(b.emp.nombre), "es"));

    const casaRows = [];
    for (const r of ordenadas.filter(row => row.emp.grupo === "casa")) {
      casaRows.push(...rowsEmpleado(r));
    }

    const contratistaRowsByJefe = new Map();
    for (const r of ordenadas.filter(row => row.emp.grupo === "contratista")) {
      const jefe = nombreContratista(r.emp);
      const list = contratistaRowsByJefe.get(jefe) ?? [];
      list.push(r);
      contratistaRowsByJefe.set(jefe, list);
    }

    const contratistaRows = [];
    for (const jefe of [...contratistaRowsByJefe.keys()].sort((a, b) => a.localeCompare(b, "es"))) {
      contratistaRows.push({ kind: "group", label: `JEFE: ${jefe}` });
      for (const r of contratistaRowsByJefe.get(jefe)) {
        contratistaRows.push(...rowsEmpleado(r, true));
      }
    }

    const periodo = `${fmtFecha(desde)} - ${fmtFecha(hasta)}`;
    exportStyledXlsx(`horas_extras_${desde}_${hasta}.xlsx`, [
      { name: "Casa", ...buildExtrasSheet({ title: "GENTE DE LA CASA", periodo, rows: casaRows, includeJefe: false }) },
      { name: "Contratistas", ...buildExtrasSheet({ title: "CONTRATISTAS", periodo, rows: contratistaRows, includeJefe: true }) },
    ]);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input type="date" style={INP} value={desde} onChange={e => e.target.value && setDesde(e.target.value)} />
        <span style={{ color: C.t2, fontSize: 12 }}>→</span>
        <input type="date" style={INP} value={hasta} onChange={e => e.target.value && setHasta(e.target.value)} />
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
        <input style={{ ...INP, flex: 1, minWidth: 140 }} placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
        <button style={BTN} onClick={exportarXlsx}>⬇ XLSX</button>
        <button style={BTN} onClick={exportar}>⬇ CSV</button>
      </div>

      <div style={{ fontSize: 12, color: C.t2, margin: "-4px 0 14px", lineHeight: 1.6 }}>
        Regla: lunes a viernes suma extra desde {EXTRA_DESDE}, sin importar si entro tarde. Antes de {INICIO_CONTEO} no cuenta para sabados. <strong>Las extras se cuentan por día en bloques de media hora</strong> (menos de 30 min no cuenta; 35 → 30; 65 → 60). Se muestran personas con al menos {EXTRA_MINIMA_MIN} minutos extra.
      </div>

      {error && <ErrorBox error={error} />}
      {!error && filtradas == null && <Cargando />}

      {filtradas != null && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <KpiCard label="Horas extra del rango" value={minToHM(totales.extra)} color={totales.extra > 0 ? C.amber : C.green} />
            <KpiCard label="Personas con extras" value={totales.conExtra} sub={`minimo ${EXTRA_MINIMA_MIN} min`} />
            <KpiCard label="Corte L-V" value={EXTRA_DESDE} sub="sabado todo extra" />
          </div>

          {filtradas.length === 0 ? (
            <div style={{ color: C.t2, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Sin datos en este rango.</div>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th>Empleado</Th><Th>Grupo</Th>
                    <Th right>Días</Th><Th right>Horas</Th><Th right>Extras</Th><Th> </Th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(r => (
                    <FilaExtra key={r.emp.id} r={r} open={openId === r.emp.id}
                      onToggle={() => setOpenId(openId === r.emp.id ? null : r.emp.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilaExtra({ r, open, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer" }}>
        <Td>
          {r.emp.nombre}
          <span style={{ fontSize: 11, color: C.t2, fontFamily: C.mono, marginLeft: 8 }}>{r.emp.dni}</span>
        </Td>
        <Td><GrupoBadge grupo={r.emp.grupo} contratistaNombre={r.emp.contratista?.nombre} /></Td>
        <Td right mono>{r.dias}</Td>
        <Td right mono>{minToHM(r.totalMin)}</Td>
        <Td right mono color={r.extraMin > 0 ? C.amber : C.t2} style={{ fontWeight: r.extraMin > 0 ? 700 : 400 }}>
          {minToHM(r.extraMin)}
        </Td>
        <Td color={C.t2}>{open ? "▾" : "▸"}</Td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ padding: "4px 12px 12px", borderBottom: `1px solid ${C.b0}`, background: "rgba(255,255,255,0.015)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {r.detalle.map(d => (
                <div key={d.fecha} style={{
                  fontSize: 11, fontFamily: C.mono, padding: "4px 9px", borderRadius: 6,
                  background: d.extra > 0 ? "rgba(245,158,11,0.08)" : C.s0,
                  border: `1px solid ${d.extra > 0 ? "rgba(245,158,11,0.25)" : C.b0}`,
                  color: d.extra > 0 ? C.amber : C.t2,
                }}>
                  {fmtFechaCorta(d.fecha)} · {hhmm(d.entrada) || "—"}{d.salida ? `–${hhmm(d.salida)}` : " · sin salida"}{d.extra > 0 && ` (+${minToHM(d.extra)})`}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
