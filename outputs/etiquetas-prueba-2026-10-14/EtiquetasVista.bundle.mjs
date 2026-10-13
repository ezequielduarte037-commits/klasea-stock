// src/features/consumibles/etiquetas/EtiquetasVista.jsx
import { useLayoutEffect, useRef, useState } from "react";

// src/features/consumibles/etiquetas/etiquetasCore.js
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
var HOJA_MOSTRADOR = {
  pagina: { ancho: 210, alto: 297 },
  margen: 8,
  columnas: 2,
  filas: 20,
  porHoja: 40,
  barras: { altoMm: 9.5, moduloMaxMm: 0.42, anchoMaxMm: 50 }
};
var ZONA_BLANCA_MODULOS = 10;
var MODULO_MINIMO_MM = 0.25;
var redondear = (n, dec = 3) => Math.round(n * 10 ** dec) / 10 ** dec;
function patronCode128(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  const salida = {};
  try {
    JsBarcode(salida, t, { format: "CODE128" });
  } catch {
    return null;
  }
  const patron = (salida.encodings ?? []).map((e) => e.data).join("");
  return /^[01]+$/.test(patron) ? patron : null;
}
function pathDeBarras(patron, desplazamiento) {
  let d = "";
  let x = 0;
  while (x < patron.length) {
    if (patron[x] !== "1") {
      x += 1;
      continue;
    }
    let w = 1;
    while (patron[x + w] === "1") w += 1;
    d += `M${x + desplazamiento} 0h${w}v1h-${w}z`;
    x += w;
  }
  return d;
}
var cacheBarras = /* @__PURE__ */ new Map();
function codigoDeBarras(texto, { altoMm = 8, moduloMaxMm = 0.4, anchoMaxMm = 60, pasoMm = null, zonaMinima = ZONA_BLANCA_MODULOS } = {}) {
  const clave = `${texto}|${altoMm}|${moduloMaxMm}|${anchoMaxMm}|${pasoMm}|${zonaMinima}`;
  if (cacheBarras.has(clave)) return cacheBarras.get(clave);
  const patron = patronCode128(texto);
  if (!patron) return null;
  for (let zona = ZONA_BLANCA_MODULOS; zona >= Math.min(zonaMinima, ZONA_BLANCA_MODULOS); zona -= 1) {
    const modulos = patron.length + 2 * zona;
    let modulo = Math.min(moduloMaxMm, anchoMaxMm / modulos);
    if (pasoMm) modulo = Math.floor(modulo / pasoMm + 1e-9) * pasoMm;
    if (modulo < MODULO_MINIMO_MM - 1e-9) continue;
    const resultado = {
      texto: String(texto).trim(),
      patron,
      modulos,
      zona,
      moduloMm: redondear(modulo, 4),
      anchoMm: redondear(modulos * modulo, 4),
      altoMm,
      viewBox: `0 0 ${modulos} 1`,
      d: pathDeBarras(patron, zona),
      legible: true
    };
    cacheBarras.set(clave, resultado);
    return resultado;
  }
  return null;
}
var MARGEN_QR_MODULOS = 4;
var NIVEL_QR = "Q";
var cacheQR = /* @__PURE__ */ new Map();
function codigoQR(texto, { ladoMm = 12, margen = MARGEN_QR_MODULOS, nivel = NIVEL_QR } = {}) {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  const clave = `${t}|${ladoMm}|${margen}|${nivel}`;
  if (cacheQR.has(clave)) return cacheQR.get(clave);
  let qr;
  try {
    qr = QRCode.create(t, { errorCorrectionLevel: nivel });
  } catch {
    return null;
  }
  const n = qr.modules.size;
  const total = n + 2 * margen;
  let d = "";
  for (let fila = 0; fila < n; fila += 1) {
    let col = 0;
    while (col < n) {
      if (!qr.modules.get(fila, col)) {
        col += 1;
        continue;
      }
      let w = 1;
      while (col + w < n && qr.modules.get(fila, col + w)) w += 1;
      d += `M${col + margen} ${fila + margen}h${w}v1h-${w}z`;
      col += w;
    }
  }
  const resultado = {
    texto: t,
    version: qr.version,
    nivel,
    tamano: n,
    margen,
    modulos: total,
    ladoMm,
    moduloMm: redondear(ladoMm / total, 4),
    viewBox: `0 0 ${total} ${total}`,
    d
  };
  cacheQR.set(clave, resultado);
  return resultado;
}
var limpio = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
function tamanoNombre(nombre, formatoKey = "a4") {
  const n = limpio(nombre).length;
  const escala = formatoKey === "termica" ? [[16, 10], [24, 9], [34, 8], [Infinity, 7.5]] : [[14, 13], [22, 11.5], [32, 10], [Infinity, 9]];
  return escala.find(([max]) => n <= max)[1];
}
function tamanoCodigo(codigo, formatoKey = "a4") {
  if (formatoKey !== "termica") return 15;
  const n = limpio(codigo).length;
  return n <= 6 ? 14 : n <= 8 ? 12 : 10.5;
}

// src/features/consumibles/etiquetas/EtiquetasVista.jsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var PX_POR_MM = 96 / 25.4;
var AJUSTE_ALTO_MM = 0.3;
var mm = (v) => `${v}mm`;
function Barras({ grafico, className = "", style = null }) {
  if (!grafico) return null;
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      className,
      viewBox: grafico.viewBox,
      width: mm(grafico.anchoMm),
      height: mm(grafico.altoMm),
      style: { ...style, width: mm(grafico.anchoMm), height: mm(grafico.altoMm) },
      preserveAspectRatio: "none",
      shapeRendering: "crispEdges",
      role: "img",
      "aria-label": `C\xF3digo de barras ${grafico.texto}`,
      children: [
        /* @__PURE__ */ jsx("rect", { x: "0", y: "0", width: "100%", height: "100%", fill: "#fff" }),
        /* @__PURE__ */ jsx("path", { d: grafico.d, fill: "#000" })
      ]
    }
  );
}
function QR({ grafico, className = "" }) {
  if (!grafico) return null;
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      className,
      viewBox: grafico.viewBox,
      width: mm(grafico.ladoMm),
      height: mm(grafico.ladoMm),
      style: { width: mm(grafico.ladoMm), height: mm(grafico.ladoMm) },
      shapeRendering: "crispEdges",
      role: "img",
      "aria-label": `QR ${grafico.texto}`,
      children: [
        /* @__PURE__ */ jsx("rect", { x: "0", y: "0", width: "100%", height: "100%", fill: "#fff" }),
        /* @__PURE__ */ jsx("path", { d: grafico.d, fill: "#000" })
      ]
    }
  );
}
function Etiqueta({ etiqueta, formato }) {
  const f = formato;
  const barras = codigoDeBarras(etiqueta.codigo, f.barras);
  const qr = codigoQR(etiqueta.codigo, { ladoMm: f.qrMm });
  const termica = f.key === "termica";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `cns-etq${termica ? " is-termica" : ""}`,
      style: {
        width: mm(f.etiqueta.ancho),
        height: mm(f.etiqueta.alto),
        padding: `${mm(f.relleno.v)} ${mm(f.relleno.h)}`
      },
      children: [
        /* @__PURE__ */ jsx("div", { className: "cns-etq-nombre", style: { fontSize: `${tamanoNombre(etiqueta.nombre, f.key)}pt` }, children: etiqueta.nombre }),
        /* @__PURE__ */ jsxs("div", { className: "cns-etq-datos", children: [
          /* @__PURE__ */ jsx("div", { className: "cns-etq-codigo", style: { fontSize: `${tamanoCodigo(etiqueta.codigo, f.key)}pt` }, children: etiqueta.codigo }),
          etiqueta.proveedorCodigo && /* @__PURE__ */ jsxs("div", { className: "cns-etq-linea", children: [
            "Prov. ",
            /* @__PURE__ */ jsx("b", { children: etiqueta.proveedorCodigo })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "cns-etq-linea", children: [
            "Por ",
            etiqueta.unidad,
            (etiqueta.ubicacion || !termica) && /* @__PURE__ */ jsxs(Fragment, { children: [
              " \xB7 ",
              /* @__PURE__ */ jsx("b", { children: etiqueta.ubicacion || "Sin ubicaci\xF3n" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx(QR, { grafico: qr, className: "cns-etq-qr" }),
        /* @__PURE__ */ jsx(
          Barras,
          {
            grafico: barras,
            className: "cns-etq-barras",
            style: f.barras.alBorde ? { marginInline: `-${f.relleno.h}mm` } : null
          }
        )
      ]
    }
  );
}
function PaginaEtiquetas({ hoja, formato, pantalla = false }) {
  const f = formato;
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: `cns-etq-pagina${pantalla ? " is-pantalla" : ""}`,
      style: { width: mm(f.pagina.ancho), height: mm(f.pagina.alto - AJUSTE_ALTO_MM) },
      children: /* @__PURE__ */ jsx(
        "div",
        {
          className: "cns-etq-grilla",
          style: {
            top: mm(f.margenSuperior),
            gridTemplateColumns: `repeat(${f.columnas}, ${mm(f.etiqueta.ancho)})`,
            gridTemplateRows: `repeat(${f.filas}, ${mm(f.etiqueta.alto)})`
          },
          children: hoja.celdas.map((celda, i) => /* @__PURE__ */ jsxs("div", { className: `cns-etq-celda is-${celda.tipo}`, children: [
            celda.tipo === "etiqueta" && /* @__PURE__ */ jsx(Etiqueta, { etiqueta: celda.etiqueta, formato: f }),
            pantalla && celda.tipo === "usada" && /* @__PURE__ */ jsx("span", { className: "cns-etq-usada", children: "usada" })
          ] }, i))
        }
      )
    }
  );
}
function PaginaMostrador({ items, titulo, pantalla = false }) {
  const h = HOJA_MOSTRADOR;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `cns-etq-pagina is-mostrador${pantalla ? " is-pantalla" : ""}`,
      style: { width: mm(h.pagina.ancho), height: mm(h.pagina.alto - AJUSTE_ALTO_MM), padding: mm(h.margen) },
      children: [
        /* @__PURE__ */ jsx("div", { className: "cns-etq-mos-titulo", children: titulo }),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "cns-etq-mos-grilla",
            style: { gridTemplateRows: `repeat(${h.filas}, minmax(0, 1fr))` },
            children: items.map((e) => /* @__PURE__ */ jsxs("div", { className: "cns-etq-mos-fila", children: [
              /* @__PURE__ */ jsxs("div", { className: "cns-etq-mos-texto", children: [
                /* @__PURE__ */ jsx("div", { className: "cns-etq-mos-nombre", children: e.nombre }),
                /* @__PURE__ */ jsxs("div", { className: "cns-etq-mos-codigo", children: [
                  e.codigo,
                  " \xB7 por ",
                  e.unidad
                ] })
              ] }),
              /* @__PURE__ */ jsx(Barras, { grafico: codigoDeBarras(e.codigo, h.barras) })
            ] }, e.codigo))
          }
        )
      ]
    }
  );
}
function Escala({ anchoMm, altoMm, max = 1, children }) {
  const ref = useRef(null);
  const [escala, setEscala] = useState(0.4);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return void 0;
    if (typeof ResizeObserver === "undefined") return void 0;
    const ro = new ResizeObserver(() => {
      const ancho = el.clientWidth;
      if (ancho > 0) setEscala(Math.min(max, ancho / (anchoMm * PX_POR_MM)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchoMm, max]);
  return /* @__PURE__ */ jsx("div", { ref, className: "cns-etq-escala", style: { height: altoMm * PX_POR_MM * escala }, children: /* @__PURE__ */ jsx("div", { style: { width: mm(anchoMm), height: mm(altoMm), transform: `scale(${escala})`, transformOrigin: "0 0" }, children }) });
}
function EstilosEtiquetas() {
  return /* @__PURE__ */ jsx("style", { href: "klasea-cns-etiquetas", precedence: "default", children: CSS_ETIQUETAS });
}
var CSS_ETIQUETAS = `
  .cns-etq-pagina {
    position: relative; overflow: hidden; flex-shrink: 0;
    background: #fff; color: #000;
    font-family: 'Outfit', system-ui, sans-serif; font-weight: 400;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .cns-etq-pagina.is-pantalla { box-shadow: var(--elev-1); }
  .cns-etq-grilla { position: absolute; left: 0; display: grid; }
  .cns-etq-celda { position: relative; overflow: hidden; }
  /* En pantalla se marca el troquel de cada etiqueta; en papel no se imprime. */
  .cns-etq-pagina.is-pantalla .cns-etq-celda { outline: 0.25mm dashed var(--border-2); outline-offset: -0.125mm; }
  .cns-etq-pagina.is-pantalla .cns-etq-celda.is-usada { background: repeating-linear-gradient(135deg, var(--panel-solid) 0 2mm, var(--panel-solid-2) 2mm 4mm); }
  .cns-etq-usada {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    font-size: 9pt; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .08em;
  }

  .cns-etq {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas: "nombre nombre" "datos qr" "barras barras";
    column-gap: 2.5mm; row-gap: 0.8mm;
    overflow: hidden; background: #fff; color: #000;
  }
  .cns-etq-nombre {
    grid-area: nombre;
    font-weight: 650; line-height: 1.08; letter-spacing: 0.01em; text-transform: uppercase;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2;
    overflow: hidden; overflow-wrap: anywhere;
  }
  .cns-etq-datos { grid-area: datos; align-self: center; min-width: 0; }
  .cns-etq-codigo {
    font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 700;
    font-size: 15pt; line-height: 1; letter-spacing: 0.02em; margin-bottom: 1mm;
  }
  .cns-etq-linea {
    font-size: 7pt; line-height: 1.25; color: #000;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cns-etq-linea b { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 600; }
  .cns-etq-qr { grid-area: qr; align-self: center; display: block; }
  .cns-etq-barras { grid-area: barras; justify-self: center; display: block; }
  .cns-etq.is-termica { column-gap: 1.5mm; row-gap: 0.6mm; }
  .cns-etq.is-termica .cns-etq-nombre { line-height: 1.05; -webkit-line-clamp: 3; line-clamp: 3; }
  .cns-etq.is-termica .cns-etq-codigo { margin-bottom: 0.6mm; letter-spacing: 0; }
  .cns-etq.is-termica .cns-etq-linea { font-size: 6.5pt; }

  .cns-etq-pagina.is-mostrador { display: flex; flex-direction: column; }
  .cns-etq-mos-titulo {
    flex: 0 0 auto; height: 6mm; display: flex; align-items: flex-start; justify-content: space-between;
    font-size: 9pt; font-weight: 600; color: #000;
  }
  .cns-etq-mos-grilla {
    flex: 1 1 auto; min-height: 0;
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: column;
    column-gap: 6mm;
  }
  .cns-etq-mos-fila {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 3mm;
    border-bottom: 0.2mm solid #d5d9df; min-height: 0; overflow: hidden;
  }
  .cns-etq-mos-nombre {
    font-size: 9.5pt; font-weight: 600; line-height: 1.1; text-transform: uppercase;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden;
  }
  .cns-etq-mos-codigo {
    font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 7pt; color: #333; margin-top: 0.5mm;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cns-etq-escala { position: relative; width: 100%; overflow: hidden; }
`;
export {
  Barras,
  Escala,
  EstilosEtiquetas,
  Etiqueta,
  PaginaEtiquetas,
  PaginaMostrador,
  QR
};
