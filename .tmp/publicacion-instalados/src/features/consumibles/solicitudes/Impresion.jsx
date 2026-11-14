import { useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { fmtCantidad } from "@/features/consumibles/api";
import { codigoVisible, destinoSolicitud, fechaCorta } from "./solicitudesLogica";

/**
 * Lo que se imprime: la hoja de preparación (A4, ordenada por ubicación para
 * recorrer el pañol una sola vez) y, al pie, la etiqueta para la bolsa.
 * Sin firmas ni condiciones: es la lista y nada más.
 *
 * La capa vive en <body> solo mientras dura la impresión (como en Etiquetas):
 * su @media print oculta el resto de la app y su @page fija el papel. Los
 * selectores que ocultan la app dependen de la marca `sol-imprimiendo` en
 * <html>, que se saca al desmontar: no queda nada global.
 */
export default function CapaImpresion({ trabajo }) {
  useLayoutEffect(() => {
    document.documentElement.classList.add("sol-imprimiendo");
    return () => document.documentElement.classList.remove("sol-imprimiendo");
  }, []);

  const { solicitud: s, renglones, libres, sede, impresoEn } = trabajo;
  const destino = destinoSolicitud(s);
  const retira = s.retira || s.solicita || "";
  const total = renglones.length + libres.length;

  return createPortal(
    <div className="sol-impresion" aria-hidden="true">
      <style>{CSS_IMPRESION}</style>
      <div className="imp-hoja">
        <header className="imp-cab">
          <div>
            <div className="imp-eyebrow">Solicitud a pañol · {sede}</div>
            <div className="imp-n">N° {s.numero}</div>
          </div>
          <div className="imp-cab-der">
            {s.prioridad === "urgente" ? <div className="imp-urgente">URGENTE</div> : null}
            <div className="imp-retiro">Retiro {s.fecha_retiro ? `${fechaCorta(s.fecha_retiro)} · 7 h` : "sin día"}</div>
          </div>
        </header>

        <dl className="imp-meta">
          <div><dt>Obra / sector</dt><dd>{[s.obra?.codigo || s.obra_texto, s.sector].filter(Boolean).join(" · ") || destino}</dd></div>
          <div><dt>Solicita</dt><dd>{s.solicita || "—"}</dd></div>
          <div><dt>Retira</dt><dd>{s.retira || "—"}</dd></div>
          {s.tarea ? <div className="is-ancho"><dt>Tarea</dt><dd>{s.tarea}</dd></div> : null}
          {s.observaciones ? <div className="is-ancho"><dt>Observaciones</dt><dd>{s.observaciones}</dd></div> : null}
        </dl>

        <table className="imp-tabla">
          <thead>
            <tr>
              <th className="imp-check" aria-label="Listo" />
              <th>Ubicación</th>
              <th>Código</th>
              <th>Producto</th>
              <th className="imp-der">Cant.</th>
              <th>Unidad</th>
            </tr>
          </thead>
          <tbody>
            {renglones.map((r) => (
              <tr key={r.id}>
                <td className="imp-check"><span className="imp-casilla" /></td>
                <td className="imp-mono imp-ubic">{r.ubicacion || "—"}</td>
                <td className="imp-mono">{codigoVisible(r.item, r) || "—"}</td>
                <td>{r.descripcion}</td>
                <td className="imp-mono imp-der imp-cant">{fmtCantidad(r.cantidad)}</td>
                <td>{r.item?.unidad || r.unidad || ""}</td>
              </tr>
            ))}
            {libres.length ? (
              <tr className="imp-separador"><td colSpan={6}>Escritos a mano, sin producto elegido</td></tr>
            ) : null}
            {libres.map((r) => (
              <tr key={r.id}>
                <td className="imp-check"><span className="imp-casilla" /></td>
                <td className="imp-mono">—</td>
                <td className="imp-mono">—</td>
                <td>{r.descripcion}</td>
                <td className="imp-mono imp-der imp-cant">{fmtCantidad(r.cantidad)}</td>
                <td>{r.unidad || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="imp-pie">{total === 1 ? "1 renglón" : `${total} renglones`} · impreso {impresoEn}</div>

        <div className="imp-etiqueta">
          <div className="imp-etiqueta-ayuda">Recortar y pegar en la bolsa</div>
          <div className="imp-etiqueta-n">N° {s.numero}</div>
          <div className="imp-etiqueta-quien">{retira || "—"}</div>
          <div className="imp-etiqueta-datos">
            <span>{destino}</span>
            <span>Retiro {s.fecha_retiro ? `${fechaCorta(s.fecha_retiro)} · 7 h` : "sin día"}</span>
            {s.prioridad === "urgente" ? <strong>URGENTE</strong> : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const CSS_IMPRESION = `
  @page { size: A4 portrait; margin: 12mm; }
  @media screen { .sol-impresion { display: none !important; } }
  @media print {
    html.sol-imprimiendo, html.sol-imprimiendo body {
      background: #fff !important; margin: 0 !important; padding: 0 !important;
      min-height: 0 !important; height: auto !important; overflow: visible !important;
    }
    html.sol-imprimiendo body > *:not(.sol-impresion) { display: none !important; }
    .sol-impresion { display: block !important; }
  }
  .sol-impresion { color: #000; background: #fff; font-family: 'Outfit', system-ui, sans-serif; font-size: 11pt; }
  .sol-impresion .imp-mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
  .sol-impresion .imp-cab { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; padding-bottom: 8px; border-bottom: 2px solid #000; }
  .sol-impresion .imp-eyebrow { font-size: 9.5pt; text-transform: uppercase; letter-spacing: .06em; color: #444; }
  .sol-impresion .imp-n { font-family: 'JetBrains Mono', monospace; font-size: 24pt; font-weight: 700; line-height: 1.1; }
  .sol-impresion .imp-cab-der { text-align: right; display: grid; gap: 4px; justify-items: end; }
  .sol-impresion .imp-retiro { font-size: 13pt; font-weight: 600; }
  .sol-impresion .imp-urgente { border: 2px solid #000; padding: 1px 8px; font-weight: 700; letter-spacing: .08em; }
  .sol-impresion .imp-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 14px; margin: 10px 0 12px; }
  .sol-impresion .imp-meta div.is-ancho { grid-column: 1 / -1; }
  .sol-impresion .imp-meta dt { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; color: #555; }
  .sol-impresion .imp-meta dd { margin: 1px 0 0; font-size: 11.5pt; font-weight: 600; }
  .sol-impresion .imp-tabla { width: 100%; border-collapse: collapse; }
  .sol-impresion .imp-tabla th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; color: #444; border-bottom: 1.5px solid #000; padding: 4px 6px; }
  .sol-impresion .imp-tabla td { border-bottom: 1px solid #bbb; padding: 7px 6px; vertical-align: middle; }
  .sol-impresion .imp-tabla tr { break-inside: avoid; page-break-inside: avoid; }
  .sol-impresion .imp-check { width: 9mm; }
  .sol-impresion .imp-casilla { display: inline-block; width: 5mm; height: 5mm; border: 1.5px solid #000; border-radius: 1mm; }
  .sol-impresion .imp-ubic { font-weight: 700; font-size: 12pt; white-space: nowrap; }
  .sol-impresion .imp-cant { font-weight: 700; font-size: 12pt; }
  .sol-impresion .imp-der { text-align: right; }
  .sol-impresion .imp-separador td { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; color: #444; padding-top: 12px; border-bottom: 1.5px solid #000; }
  .sol-impresion .imp-pie { margin-top: 6px; font-size: 9pt; color: #555; }
  .sol-impresion .imp-etiqueta {
    margin-top: 14mm; width: 95mm; padding: 6mm; border: 1.5px dashed #000; border-radius: 3mm;
    break-inside: avoid; page-break-inside: avoid; display: grid; gap: 2mm;
  }
  .sol-impresion .imp-etiqueta-ayuda { font-size: 8pt; color: #555; text-transform: uppercase; letter-spacing: .05em; }
  .sol-impresion .imp-etiqueta-n { font-family: 'JetBrains Mono', monospace; font-size: 30pt; font-weight: 700; line-height: 1; }
  .sol-impresion .imp-etiqueta-quien { font-size: 16pt; font-weight: 700; }
  .sol-impresion .imp-etiqueta-datos { display: flex; flex-wrap: wrap; gap: 2mm 6mm; font-size: 12pt; font-weight: 600; }
`;
