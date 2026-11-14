import { useLayoutEffect, useRef, useState } from "react";
import {
  HOJA_MOSTRADOR,
  codigoDeBarras,
  codigoQR,
  tamanoCodigo,
  tamanoNombre,
} from "./etiquetasCore";

/**
 * Cómo se ve una etiqueta y una hoja. Lo mismo se dibuja en la vista previa
 * (achicado con `Escala`) y en la capa de impresión (a tamaño real), así lo
 * que se ve en pantalla es lo que sale de la impresora.
 *
 * Los colores son de papel (negro sobre blanco) y no del tema: la etiqueta se
 * imprime igual con la app en oscuro o en claro.
 */

// 1 mm en píxeles CSS (96 px por pulgada): para escalar la vista previa.
const PX_POR_MM = 96 / 25.4;

// La hoja mide un pelo menos que la página: si mide exacto, el redondeo de la
// impresora a veces empuja una página en blanco entre hoja y hoja.
const AJUSTE_ALTO_MM = 0.3;

const mm = (v) => `${v}mm`;

export function Barras({ grafico, className = "", style = null }) {
  if (!grafico) return null;
  return (
    <svg
      className={className}
      viewBox={grafico.viewBox}
      width={mm(grafico.anchoMm)}
      height={mm(grafico.altoMm)}
      style={{ ...style, width: mm(grafico.anchoMm), height: mm(grafico.altoMm) }}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Código de barras ${grafico.texto}`}
    >
      <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
      <path d={grafico.d} fill="#000" />
    </svg>
  );
}

export function QR({ grafico, className = "" }) {
  if (!grafico) return null;
  return (
    <svg
      className={className}
      viewBox={grafico.viewBox}
      width={mm(grafico.ladoMm)}
      height={mm(grafico.ladoMm)}
      style={{ width: mm(grafico.ladoMm), height: mm(grafico.ladoMm) }}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR ${grafico.texto}`}
    >
      <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
      <path d={grafico.d} fill="#000" />
    </svg>
  );
}

/** Una etiqueta de estante. `formato` es una entrada de FORMATOS. */
export function Etiqueta({ etiqueta, formato }) {
  const f = formato;
  const barras = codigoDeBarras(etiqueta.codigo, f.barras);
  const qr = codigoQR(etiqueta.codigo, { ladoMm: f.qrMm });
  const termica = f.key === "termica";
  return (
    <div
      className={`cns-etq${termica ? " is-termica" : ""}`}
      style={{
        width: mm(f.etiqueta.ancho),
        height: mm(f.etiqueta.alto),
        padding: `${mm(f.relleno.v)} ${mm(f.relleno.h)}`,
      }}
    >
      <div className="cns-etq-nombre" style={{ fontSize: `${tamanoNombre(etiqueta.nombre, f.key)}pt` }}>
        {etiqueta.nombre}
      </div>
      <div className="cns-etq-datos">
        <div className="cns-etq-codigo" style={{ fontSize: `${tamanoCodigo(etiqueta.codigo, f.key)}pt` }}>{etiqueta.codigo}</div>
        {etiqueta.proveedorCodigo && (
          <div className="cns-etq-linea">Prov. <b>{etiqueta.proveedorCodigo}</b></div>
        )}
        {/* En la de 40 × 30 «Sin ubicación» no entra: va solo la unidad. */}
        <div className="cns-etq-linea">
          Por {etiqueta.unidad}
          {(etiqueta.ubicacion || !termica) && <>{" · "}<b>{etiqueta.ubicacion || "Sin ubicación"}</b></>}
        </div>
      </div>
      <QR grafico={qr} className="cns-etq-qr" />
      {/* Barras de borde a borde: el blanco del papel completa la zona blanca. */}
      <Barras
        grafico={barras}
        className="cns-etq-barras"
        style={f.barras.alBorde ? { marginInline: `-${f.relleno.h}mm` } : null}
      />
    </div>
  );
}

/** Una página: una hoja A4 de 24 o una etiqueta térmica suelta. */
export function PaginaEtiquetas({ hoja, formato, pantalla = false }) {
  const f = formato;
  return (
    <div
      className={`cns-etq-pagina${pantalla ? " is-pantalla" : ""}`}
      style={{ width: mm(f.pagina.ancho), height: mm(f.pagina.alto - AJUSTE_ALTO_MM) }}
    >
      <div
        className="cns-etq-grilla"
        style={{
          top: mm(f.margenSuperior),
          gridTemplateColumns: `repeat(${f.columnas}, ${mm(f.etiqueta.ancho)})`,
          gridTemplateRows: `repeat(${f.filas}, ${mm(f.etiqueta.alto)})`,
        }}
      >
        {hoja.celdas.map((celda, i) => (
          <div key={i} className={`cns-etq-celda is-${celda.tipo}`}>
            {celda.tipo === "etiqueta" && <Etiqueta etiqueta={celda.etiqueta} formato={f} />}
            {pantalla && celda.tipo === "usada" && <span className="cns-etq-usada">usada</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Hoja de mostrador: 40 consumibles con barras grandes, para la carpeta. */
export function PaginaMostrador({ items, titulo, pantalla = false }) {
  const h = HOJA_MOSTRADOR;
  return (
    <div
      className={`cns-etq-pagina is-mostrador${pantalla ? " is-pantalla" : ""}`}
      style={{ width: mm(h.pagina.ancho), height: mm(h.pagina.alto - AJUSTE_ALTO_MM), padding: mm(h.margen) }}
    >
      <div className="cns-etq-mos-titulo">{titulo}</div>
      <div
        className="cns-etq-mos-grilla"
        style={{ gridTemplateRows: `repeat(${h.filas}, minmax(0, 1fr))` }}
      >
        {items.map((e) => (
          <div key={e.codigo} className="cns-etq-mos-fila">
            <div className="cns-etq-mos-texto">
              <div className="cns-etq-mos-nombre">{e.nombre}</div>
              <div className="cns-etq-mos-codigo">{e.codigo} · por {e.unidad}</div>
            </div>
            <Barras grafico={codigoDeBarras(e.codigo, h.barras)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Achica una página para que entre en el ancho disponible sin deformarla: se
 * dibuja en milímetros reales y se escala con transform. `max` limita el
 * agrandado (una etiqueta térmica sola no tiene que ocupar toda la pantalla).
 */
export function Escala({ anchoMm, altoMm, max = 1, children }) {
  const ref = useRef(null);
  const [escala, setEscala] = useState(0.4);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof ResizeObserver === "undefined") return undefined;
    // El observador avisa apenas empieza a mirar, así que también da la
    // primera medida.
    const ro = new ResizeObserver(() => {
      const ancho = el.clientWidth;
      if (ancho > 0) setEscala(Math.min(max, ancho / (anchoMm * PX_POR_MM)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchoMm, max]);
  return (
    <div ref={ref} className="cns-etq-escala" style={{ height: altoMm * PX_POR_MM * escala }}>
      <div style={{ width: mm(anchoMm), height: mm(altoMm), transform: `scale(${escala})`, transformOrigin: "0 0" }}>
        {children}
      </div>
    </div>
  );
}

export function EstilosEtiquetas() {
  return <style href="klasea-cns-etiquetas" precedence="default">{CSS_ETIQUETAS}</style>;
}

// Medidas en mm y pt porque se imprimen a tamaño real. Todo con prefijo
// .cns-etq: este CSS queda cargado mientras la pestaña está abierta.
const CSS_ETIQUETAS = `
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
