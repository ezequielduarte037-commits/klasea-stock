import { zipSync, strToU8 } from "fflate";

/**
 * Escritor de XLSX con estilos.
 *
 * POR QUE NO SHEETJS. El proyecto ya trae `xlsx` (SheetJS), pero el build
 * community NO ESCRIBE ESTILOS: los colores y las negritas son una funcion de
 * la version paga. Se le pueden poner `s` a las celdas y las descarta en
 * silencio, asi que el archivo sale plano aunque el codigo parezca completo —
 * verificado abriendo el zip generado: el color nunca aparece en styles.xml.
 *
 * Ancho de columna, merges y autofiltro si los escribe, pero eso solo no
 * alcanza para una planilla presentable.
 *
 * Asi que el .xlsx se arma a mano. Es un zip con un puñado de XML y fflate ya
 * estaba en el proyecto para comprimirlo.
 */

const esc = (v) => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
  // Excel rechaza el archivo entero si aparece un caracter de control.
  // eslint-disable-next-line no-control-regex -- son justo los que hay que sacar
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

export function colLetra(indice) {
  let n = indice + 1;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

export const celdaRef = (fila, columna) => `${colLetra(columna)}${fila + 1}`;

/** Excel cuenta los dias desde 1900, con el bug del 29/2/1900 incluido. */
function fechaSerie(fecha) {
  const ms = fecha.getTime() - fecha.getTimezoneOffset() * 60000;
  return ms / 86400000 + 25569;
}

/**
 * Junta los formatos que se usan y devuelve el styles.xml.
 *
 * Un formato es { fuente, fondo, borde, alineacion, formatoNumero }. Se
 * deduplican por su firma para no escribir cientos de estilos iguales.
 */
class Estilos {
  constructor() {
    this.fuentes = [{ sz: 11, name: "Calibri" }];
    this.rellenos = [{ patron: "none" }, { patron: "gray125" }];
    this.bordes = [{}];
    this.numeros = [];
    this.formatos = [{ f: 0, r: 0, b: 0, n: 0, a: null }];
    this.indice = new Map();
  }

  idDe(lista, valor, comparar) {
    const clave = JSON.stringify(valor);
    for (let i = 0; i < lista.length; i += 1) if (comparar(lista[i], valor, clave)) return i;
    lista.push(valor);
    return lista.length - 1;
  }

  registrar(estilo = {}) {
    const clave = JSON.stringify(estilo);
    if (this.indice.has(clave)) return this.indice.get(clave);

    const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const f = estilo.fuente ? this.idDe(this.fuentes, estilo.fuente, igual) : 0;
    const r = estilo.fondo ? this.idDe(this.rellenos, { patron: "solid", color: estilo.fondo }, igual) : 0;
    const b = estilo.borde ? this.idDe(this.bordes, estilo.borde, igual) : 0;
    let n = 0;
    if (estilo.formatoNumero) {
      const yaEsta = this.numeros.findIndex((x) => x.codigo === estilo.formatoNumero);
      n = yaEsta >= 0 ? this.numeros[yaEsta].id : (() => {
        const id = 164 + this.numeros.length;
        this.numeros.push({ id, codigo: estilo.formatoNumero });
        return id;
      })();
    }
    this.formatos.push({ f, r, b, n, a: estilo.alineacion || null });
    const id = this.formatos.length - 1;
    this.indice.set(clave, id);
    return id;
  }

  xml() {
    const fuentes = this.fuentes.map((x) => `<font>${x.b ? "<b/>" : ""}${x.i ? "<i/>" : ""}`
      + `<sz val="${x.sz || 11}"/>`
      + `${x.color ? `<color rgb="FF${x.color}"/>` : "<color theme=\"1\"/>"}`
      + `<name val="${x.name || "Calibri"}"/></font>`).join("");

    const rellenos = this.rellenos.map((x) => (x.patron === "solid"
      ? `<fill><patternFill patternType="solid"><fgColor rgb="FF${x.color}"/><bgColor indexed="64"/></patternFill></fill>`
      : `<fill><patternFill patternType="${x.patron}"/></fill>`)).join("");

    const lado = (l, nombre) => (l ? `<${nombre} style="${l.estilo || "thin"}"><color rgb="FF${l.color || "D0D7DE"}"/></${nombre}>` : `<${nombre}/>`);
    const bordes = this.bordes.map((x) => `<border>${lado(x.izq, "left")}${lado(x.der, "right")}`
      + `${lado(x.arriba, "top")}${lado(x.abajo, "bottom")}<diagonal/></border>`).join("");

    const numeros = this.numeros.length
      ? `<numFmts count="${this.numeros.length}">${this.numeros.map((x) => `<numFmt numFmtId="${x.id}" formatCode="${esc(x.codigo)}"/>`).join("")}</numFmts>`
      : "";

    const xfs = this.formatos.map((x) => {
      const al = x.a
        ? `<alignment${x.a.h ? ` horizontal="${x.a.h}"` : ""}${x.a.v ? ` vertical="${x.a.v}"` : ""}`
          + `${x.a.wrap ? ' wrapText="1"' : ""}${x.a.rot ? ` textRotation="${x.a.rot}"` : ""}/>`
        : "";
      return `<xf numFmtId="${x.n}" fontId="${x.f}" fillId="${x.r}" borderId="${x.b}" xfId="0"`
        + ` applyFont="1" applyFill="1" applyBorder="1"${x.n ? ' applyNumberFormat="1"' : ""}`
        + `${al ? ' applyAlignment="1"' : ""}>${al}</xf>`;
    }).join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numeros}<fonts count="${this.fuentes.length}">${fuentes}</fonts><fills count="${this.rellenos.length}">${rellenos}</fills><borders count="${this.bordes.length}">${bordes}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.formatos.length}">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

function hojaXml(hoja, estilos) {
  const filas = hoja.filas.map((celdas, f) => {
    const alto = hoja.altos?.[f];
    const cuerpo = celdas.map((celda, c) => {
      if (celda == null || celda === "") return "";
      const valor = typeof celda === "object" ? celda.v : celda;
      const s = typeof celda === "object" && celda.s != null ? ` s="${estilos.registrar(celda.s)}"` : "";
      const ref = celdaRef(f, c);
      if (valor == null || valor === "") return s ? `<c r="${ref}"${s}/>` : "";
      if (valor instanceof Date) return `<c r="${ref}"${s}>${`<v>${fechaSerie(valor)}</v>`}</c>`;
      if (typeof valor === "number" && Number.isFinite(valor)) return `<c r="${ref}"${s}><v>${valor}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(valor)}</t></is></c>`;
    }).join("");
    return `<row r="${f + 1}"${alto ? ` ht="${alto}" customHeight="1"` : ""}>${cuerpo}</row>`;
  }).join("");

  const cols = hoja.anchos?.length
    ? `<cols>${hoja.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  // La vista congelada: el encabezado y la columna del material quedan fijos.
  const panes = hoja.congelar
    ? `<pane xSplit="${hoja.congelar.col}" ySplit="${hoja.congelar.fila}" topLeftCell="${celdaRef(hoja.congelar.fila, hoja.congelar.col)}" activePane="bottomRight" state="frozen"/>`
    : "";
  const merges = hoja.merges?.length
    ? `<mergeCells count="${hoja.merges.length}">${hoja.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  const filtro = hoja.autofiltro ? `<autoFilter ref="${hoja.autofiltro}"/>` : "";
  const ultima = celdaRef(Math.max(0, hoja.filas.length - 1), Math.max(0, (hoja.anchos?.length || 1) - 1));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${ultima}"/><sheetViews><sheetView workbookViewId="0"${hoja.activa ? ' tabSelected="1"' : ""}>${panes}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${filas}</sheetData>${filtro}${merges}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

/**
 * Arma el libro y lo descarga.
 * hojas: [{ nombre, filas, anchos, merges, congelar, autofiltro, altos }]
 */
export function descargarXlsx(nombreArchivo, hojas) {
  const estilos = new Estilos();
  const cuerpos = hojas.map((h) => hojaXml(h, estilos));

  const archivos = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    // styles.xml se arma AL FINAL: recien ahi se sabe que formatos se usaron.
    "xl/styles.xml": strToU8(estilos.xml()),
  };
  cuerpos.forEach((xml, i) => { archivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml); });

  const zip = zipSync(archivos, { level: 6 });
  const blob = new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
