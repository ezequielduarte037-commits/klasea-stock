import { C } from "@/theme";
import logoK from "@/assets/logos/logo-k.png";
import { ClipboardList, Printer, X } from "lucide-react";
import { useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Solicitud de preparación a pañol — hoja A4.
//
// El mismo componente sirve para los dos extremos del circuito:
//   · sin `solicitud`  → hoja EN BLANCO para completar a mano (paso 1)
//   · con `solicitud`  → la MISMA hoja ya completa, para abrochar al papel
//                        original y firmar el retiro (paso 5)
//
// Criterio de diseño de la hoja en blanco: que el que pide escriba lo MENOS
// posible. Todo lo que se puede tildar va tildado (prioridad, sector, tipo), y
// no se pregunta dos veces lo mismo.
//
// OJO al tocar el alto: el contenedor tiene overflow hidden en 297mm exactos, o
// sea que si el contenido se pasa, se corta SIN AVISAR (te quedás sin el bloque
// de firmas y no te enterás hasta que sale impreso).
//
// Medido con estos bloques sobre A4 (área útil 277mm):
//   27 filas → 268.2mm  ✔ deja 8.8mm de colchón
//   28 filas → 274.2mm  ✔ pero al límite (2.8mm)
//   29 filas → 280.2mm  X se corta
//
// La hoja en blanco se dejó en 27 a propósito: 28 entra pero cualquier línea de
// texto que alguien agregue después rompe la hoja.
//
// La hoja COMPLETA usa 25 filas por hoja, no 27: al llenar las celdas de
// cabecera y el bloque de firma con texto real, cada una crece ~1mm por encima
// del alto declarado (el `height` de una celda de tabla es un mínimo, no un
// máximo) y se comen el colchón. Con 25 quedan ~20mm de aire, que aguantan el
// crecimiento sin cortar nada. Si hay más ítems que eso, se pagina en varias
// hojas A4 en vez de dejar que se corte.
// ─────────────────────────────────────────────────────────────────────────────

const ITEM_COUNT = 27;
const FILAS_HOJA_COMPLETA = 25;
const ITEM_ROW_H = "6mm";

const SECTORES = ["Laminación", "Pintura", "Mecánica", "Electricidad", "Carpintería", "Sanitarios", "Otro"];
const TIPOS = ["Consumibles", "Materiales", "Herramientas"];
const ESTADO_PANOL = ["Preparado", "Parcial", "Falta stock", "Consultar"];

// Estado de cada ítem → cómo se lee en el papel. La hoja no habla de "estados
// del sistema": dice lo que le sirve saber al que la recibe.
const ITEM_ESTADO_TEXTO = {
  preparado: "",
  pendiente: "pendiente",
  faltante: "FALTA STOCK",
  reemplazado: "reemplazado",
};

const paperTable = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const cell = {
  border: "1px solid #111827",
  padding: "4px 6px",
  verticalAlign: "top",
  boxSizing: "border-box",
};

const label = {
  fontSize: 8.5,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: "#334155",
  fontWeight: 900,
};

// Valor escrito por el sistema. Va en una sola línea y recortado: si se
// desborda a dos renglones la celda crece y se come el colchón de la hoja.
const valorLinea = {
  fontSize: 11,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.15,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const fmtFecha = (iso) => {
  if (!iso) return "";
  // Las fechas `date` vienen sin hora: se les pega T00:00:00 para que no se
  // corran un día por zona horaria al parsearlas.
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const fmtFechaHora = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })} ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
};

const nombreObra = (s) =>
  s?.obra?.codigo || s?.obra?.descripcion || s?.obra_texto || "";

/* ── celda con rótulo ─────────────────────────────────────────────────────── */
function FormCell({ title, valor, children, colSpan = 1, height = "8mm" }) {
  return (
    <td colSpan={colSpan} style={{ ...cell, height }}>
      <div style={label}>{title}</div>
      {valor ? <div style={{ ...valorLinea, marginTop: 3 }}>{valor}</div> : null}
      {children ? <div style={{ marginTop: 4 }}>{children}</div> : null}
    </td>
  );
}

/* ── casilla para tildar ──────────────────────────────────────────────────── */
// `marcado` pinta la cruz que en la hoja en blanco pone la persona a mano.
function Check({ text, ancho, marcado = false }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 10, whiteSpace: "nowrap", fontSize: 10 }}>
      <span style={{
        width: 10, height: 10, border: "1.4px solid #111827", display: "inline-flex", flexShrink: 0,
        alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, lineHeight: 1,
        color: "#111827",
      }}>
        {marcado ? "X" : ""}
      </span>
      <span style={{
        ...(ancho ? { display: "inline-block", minWidth: ancho, borderBottom: "1px solid #94a3b8" } : null),
        fontWeight: marcado ? 900 : 400,
      }}>
        {text}
      </span>
    </span>
  );
}

/* ── datos de cabecera ────────────────────────────────────────────────────── */
function InfoBlock({ solicitud }) {
  const s = solicitud;
  const tipos = Array.isArray(s?.tipo) ? s.tipo : [];
  // "Otro" sólo queda marcado si el sector cargado no es ninguno de los fijos.
  const sectorFijo = s?.sector && SECTORES.includes(s.sector) && s.sector !== "Otro";

  return (
    <table style={{ ...paperTable, marginTop: "3mm" }}>
      <colgroup>
        <col style={{ width: "25%" }} />
        <col style={{ width: "25%" }} />
        <col style={{ width: "50%" }} />
      </colgroup>
      <tbody>
        <tr>
          <FormCell title="Fecha del pedido" valor={fmtFecha(s?.fecha_pedido)} />
          <FormCell title="Fecha a retirar" valor={fmtFecha(s?.fecha_retiro)} />
          <FormCell title="Prioridad">
            <Check text="Normal" marcado={!!s && s.prioridad !== "urgente"} />
            <Check text="Urgente" marcado={s?.prioridad === "urgente"} />
            {!s && <span style={{ fontSize: 8.5, color: "#94a3b8" }}>· urgente sólo si frena la tarea</span>}
          </FormCell>
        </tr>
        <tr>
          <FormCell title="Obra / barco" valor={nombreObra(s)} />
          <FormCell title="Solicita" valor={s?.solicita || ""} />
          <FormCell title="Retira (si es otra persona)" valor={s?.retira || ""} />
        </tr>
        <tr>
          <FormCell title="Sector" colSpan={3} height="7mm">
            {SECTORES.map((x) => (
              <Check
                key={x}
                text={x === "Otro" && s?.sector && !sectorFijo ? s.sector : x}
                ancho={x === "Otro" ? "22mm" : undefined}
                marcado={x === "Otro" ? !!(s?.sector && !sectorFijo) : s?.sector === x}
              />
            ))}
          </FormCell>
        </tr>
        <tr>
          <FormCell title="Tipo de pedido" colSpan={3} height="7mm">
            {TIPOS.map((t) => <Check key={t} text={t} marcado={tipos.includes(t)} />)}
            {!s && <span style={{ fontSize: 8.5, color: "#94a3b8" }}>· se puede marcar más de uno</span>}
          </FormCell>
        </tr>
      </tbody>
    </table>
  );
}

/* ── tabla de items ───────────────────────────────────────────────────────── */
// `items` es la tanda que va en ESTA hoja; `desde` es el número con el que
// arranca la numeración (para que la hoja 2 siga en 26, 27, …).
function ItemsTable({ items = [], filas = ITEM_COUNT, desde = 0 }) {
  const th = { ...cell, padding: "3px 5px", fontSize: 9.5 };
  const renglones = Array.from({ length: filas }, (_, i) => items[i] ?? null);

  return (
    <table style={{ ...paperTable, fontSize: 10.5 }}>
      <colgroup>
        <col style={{ width: "6%" }} />
        <col style={{ width: "45%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "11%" }} />
        <col style={{ width: "29%" }} />
      </colgroup>
      <thead>
        <tr style={{ background: "#e5e7eb" }}>
          <th style={{ ...th, textAlign: "center" }}>#</th>
          <th style={{ ...th, textAlign: "left" }}>Material / consumible</th>
          <th style={{ ...th, textAlign: "center" }}>Cant.</th>
          <th style={{ ...th, textAlign: "center" }}>
            Unidad
            <div style={{ fontWeight: 400, fontSize: 7.5, color: "#64748b" }}>u · m · m² · kg · lt</div>
          </th>
          <th style={{ ...th, textAlign: "left" }}>Marca, medida u observación</th>
        </tr>
      </thead>
      <tbody>
        {renglones.map((item, i) => {
          const nro = desde + i + 1;
          const nota = [item?.observacion, ITEM_ESTADO_TEXTO[item?.estado] || ""].filter(Boolean).join(" · ");
          // Una sola línea por celda: dos renglones en un ítem descuadran el
          // alto de toda la hoja y se lleva puesto el bloque de firma.
          const linea = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 };
          return (
            <tr key={item?.id ?? `vacio-${nro}`}>
              <td style={{ ...cell, height: ITEM_ROW_H, textAlign: "center", color: item ? "#334155" : "#94a3b8", fontWeight: 700, fontSize: 9 }}>{nro}</td>
              <td style={cell}>
                {item && (
                  <div style={linea}>
                    {item.descripcion}
                    {item.codigo ? <span style={{ color: "#64748b", fontWeight: 400 }}> · {item.codigo}</span> : null}
                  </div>
                )}
              </td>
              <td style={{ ...cell, textAlign: "center", fontWeight: 800 }}>{item ? item.cantidad : ""}</td>
              <td style={{ ...cell, textAlign: "center" }}>{item?.unidad || ""}</td>
              <td style={cell}>{nota ? <div style={{ ...linea, fontWeight: item?.estado === "faltante" ? 900 : 400 }}>{nota}</div> : null}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── comprobante de retiro (abajo a la derecha) ───────────────────────────── */
// Es la razón de ser de la hoja completa: quién se lo llevó, cómo se lo
// identificó y cuándo. Si todavía no retiró, queda el espacio en blanco para
// firmar a mano.
function FirmaRetiro({ solicitud }) {
  const s = solicitud;
  if (!s?.retirado_at) {
    return <div style={{ ...label, fontSize: 8, color: "#94a3b8", marginTop: 3 }}>Firma o apoyá la tarjeta al retirar</div>;
  }
  return (
    <div style={{ marginTop: 3 }}>
      <div style={{ ...valorLinea, fontSize: 11.5, fontWeight: 900 }}>{s.retirado_por_nombre}</div>
      <div style={{ fontSize: 8.5, color: "#334155", marginTop: 1, lineHeight: 1.25 }}>
        {s.retirado_por_dni ? `DNI ${s.retirado_por_dni} · ` : ""}
        {s.retirado_metodo === "nfc" ? "Validado por tarjeta NFC" : "Confirmado en pañol (manual)"}
      </div>
      <div style={{ fontSize: 8.5, color: "#334155", fontWeight: 700 }}>{fmtFechaHora(s.retirado_at)}</div>
    </div>
  );
}

/* ── cierre: tarea, uso pañol y firmas ────────────────────────────────────── */
function BottomBlock({ solicitud }) {
  const s = solicitud;
  const tarea = [s?.tarea, s?.observaciones].filter(Boolean).join(" — ");
  const hayFaltantes = s?.__hayFaltantes;
  const todoPreparado = s?.__todoPreparado;

  return (
    <>
      <table style={{ ...paperTable, marginTop: "2.5mm" }}>
        <colgroup>
          <col style={{ width: "58%" }} />
          <col style={{ width: "42%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td style={{ ...cell, height: "15mm" }}>
              <div style={label}>Tarea a realizar / observaciones</div>
              {s ? (
                <>
                  {/* Alto tapado: un texto largo empujaría el bloque de firma
                      fuera de la hoja sin avisar. */}
                  <div style={{ fontSize: 9.5, color: "#0f172a", marginTop: 3, lineHeight: 1.3, maxHeight: "7mm", overflow: "hidden" }}>
                    {tarea}
                  </div>
                  {s.notas_panol && (
                    <div style={{ fontSize: 8.5, color: "#334155", marginTop: 2, lineHeight: 1.25, maxHeight: "4mm", overflow: "hidden" }}>
                      <b>Pañol:</b> {s.notas_panol}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: "#94a3b8", fontSize: 8.5, marginTop: 3 }}>
                  Ej: colocar paneles en casco 50, laminar tapa de motor, instalación eléctrica.
                </div>
              )}
            </td>
            <td style={{ ...cell, height: "15mm", background: "#f8fafc" }}>
              <div style={label}>Uso pañol</div>
              <div style={{ marginTop: 5, lineHeight: 1.9 }}>
                {ESTADO_PANOL.map((e) => (
                  <Check
                    key={e}
                    text={e}
                    marcado={
                      !s || !s.__conItems ? false
                        : e === "Preparado" ? !!todoPreparado
                        : e === "Falta stock" ? !!hayFaltantes
                        : e === "Parcial" ? !todoPreparado && !hayFaltantes
                        : false
                    }
                  />
                ))}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ ...paperTable, marginTop: "2mm" }}>
        <colgroup>
          <col style={{ width: "34%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "50%" }} />
        </colgroup>
        <tbody>
          <tr>
            <FormCell title="Preparado por (pañol)" height="11mm" valor={s?.preparado_por || ""} />
            <FormCell title="Hora entrega" height="11mm" valor={s?.retirado_at ? fmtFechaHora(s.retirado_at).split(" ")[1] : ""} />
            <td style={{ ...cell, height: "11mm" }}>
              <div style={label}>Firma o NFC de quien retira</div>
              <FirmaRetiro solicitud={s} />
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

/* ── una hoja A4 ──────────────────────────────────────────────────────────── */
// El bloque de cierre (tarea + uso pañol + firmas) va SÓLO en la última hoja:
// el comprobante de retiro es uno solo por solicitud, no uno por hoja.
function Hoja({ solicitud, items, filas, desde, indice, total, totalItems, preview }) {
  const s = solicitud;
  const esUltima = indice === total - 1;

  return (
    <section
      className="solicitud-panol-print-area"
      style={{
        width: "210mm",
        height: "297mm",
        margin: preview ? "18px auto" : 0,
        background: "#ffffff",
        color: "#0f172a",
        border: preview ? "1px solid #cbd5e1" : "none",
        borderRadius: preview ? 8 : 0,
        boxShadow: preview ? "0 18px 48px rgba(15, 23, 42, 0.18)" : "none",
        padding: "10mm 11mm",
        boxSizing: "border-box",
        overflow: "hidden",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <header style={{ display: "table", width: "100%", borderBottom: "3px solid #111827", paddingBottom: "2mm" }}>
        <div style={{ display: "table-cell", width: "12mm", verticalAlign: "middle" }}>
          <img src={logoK} alt="Klase A" style={{ width: "10mm", height: "10mm", objectFit: "contain", filter: "invert(1)" }} />
        </div>
        <div style={{ display: "table-cell", verticalAlign: "middle" }}>
          <div style={{ fontSize: 18, lineHeight: 1.05, fontWeight: 900, letterSpacing: -0.2 }}>
            Solicitud de preparación a pañol
          </div>
          <div style={{ color: "#475569", fontSize: 9.5, marginTop: 2 }}>
            {s
              ? `Preparada en pañol${total > 1 ? ` · hoja ${indice + 1} de ${total}` : ""}. Abrochar al papel original.`
              : "Completá y entregá en pañol. Marcá con una cruz lo que corresponda."}
          </div>
        </div>
        {/* Folio: en la hoja en blanco lo escribe pañol al recibir; en la hoja
            completa ya viene impreso y es el que conecta papel y sistema. */}
        <div style={{ display: "table-cell", width: "26mm", verticalAlign: "middle", textAlign: "right" }}>
          <div style={{ border: "1px solid #111827", padding: "2px 5px", textAlign: "left" }}>
            <div style={{ ...label, fontSize: 7.5 }}>N° pañol</div>
            <div style={{ height: "6mm", display: "flex", alignItems: "center", fontSize: 15, fontWeight: 900 }}>
              {s?.numero != null ? String(s.numero) : ""}
            </div>
          </div>
        </div>
      </header>

      <InfoBlock solicitud={s} />

      <div style={{ marginTop: "2.5mm" }}>
        <div style={{ display: "table", width: "100%", marginBottom: "1mm" }}>
          <div style={{ ...label, color: "#0f172a", display: "table-cell" }}>Items solicitados</div>
          <div style={{ color: "#64748b", fontSize: 8.5, display: "table-cell", textAlign: "right" }}>
            {s
              ? (total > 1 ? `Ítems ${desde + 1}–${desde + items.length} de ${totalItems}` : `${totalItems} ${totalItems === 1 ? "ítem" : "ítems"}`)
              : "Pañol completa código y ubicación si corresponde."}
          </div>
        </div>
        <ItemsTable items={items} filas={filas} desde={desde} />
      </div>

      {esUltima
        ? <BottomBlock solicitud={s} />
        // Las hojas intermedias no llevan el bloque de cierre (el comprobante de
        // retiro es uno solo), pero sin un hueco del mismo alto el pie les
        // quedaría trepado a la mitad de la hoja.
        : <div style={{ height: "30.5mm" }} />}

      <footer style={{ display: "table", width: "100%", marginTop: "2mm", paddingTop: "1.5mm", borderTop: "1px solid #cbd5e1", color: "#64748b", fontSize: 8.5 }}>
        <span style={{ display: "table-cell" }}>Klase A · Pañol</span>
        <span style={{ display: "table-cell", textAlign: "right" }}>
          {s ? "Comprobante de preparación y retiro" : "Solicitud manual para digitalizar en el sistema"}
        </span>
      </footer>
    </section>
  );
}

/* ── modal ────────────────────────────────────────────────────────────────── */
export default function SolicitudPanolPrintable({ open, onClose, solicitud = null, items = null }) {
  const hojasRef = useRef(null);

  if (!open) return null;

  const lista = Array.isArray(items) ? items : [];
  const completa = !!solicitud;
  const filasPorHoja = completa ? FILAS_HOJA_COMPLETA : ITEM_COUNT;

  // Paginado: si no entran, salen varias A4 en vez de cortarse.
  const totalHojas = completa ? Math.max(1, Math.ceil(lista.length / filasPorHoja)) : 1;
  const hojas = Array.from({ length: totalHojas }, (_, i) => ({
    indice: i,
    desde: i * filasPorHoja,
    items: lista.slice(i * filasPorHoja, (i + 1) * filasPorHoja),
  }));

  // Los tildes de "Uso pañol" salen del estado real de los ítems, no de un
  // campo aparte: es lo mismo que pañol tildaría a mano al cerrar la hoja.
  const datos = completa
    ? {
        ...solicitud,
        __conItems: lista.length > 0,
        __hayFaltantes: lista.some((i) => i.estado === "faltante"),
        __todoPreparado: lista.length > 0 && lista.every((i) => i.estado === "preparado" || i.estado === "reemplazado"),
      }
    : null;

  const print = () => {
    if (typeof window === "undefined" || !hojasRef.current) return;

    const printWindow = window.open("", "solicitud-panol-print", "width=900,height=1100");
    if (!printWindow) {
      window.alert("El navegador bloqueó la ventana de impresión. Habilitá las ventanas emergentes para este sitio.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Solicitud de preparación a pañol${datos?.numero != null ? ` N° ${datos.numero}` : ""}</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            * { box-sizing: border-box; }
            html, body {
              width: 210mm;
              min-width: 210mm;
              margin: 0;
              padding: 0;
              background: #fff;
              color: #0f172a;
              font-family: Arial, Helvetica, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .solicitud-panol-print-area {
              display: block !important;
              position: static !important;
              width: 210mm !important;
              min-width: 210mm !important;
              max-width: 210mm !important;
              height: 297mm !important;
              min-height: 297mm !important;
              max-height: 297mm !important;
              margin: 0 !important;
              padding: 10mm 11mm !important;
              border: 0 !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              overflow: hidden !important;
              background: #fff !important;
              /* Cada hoja es una página: sin esto, la 2 arranca pegada al pie
                 de la 1 y se desfasa todo el taco. */
              page-break-after: always;
              break-after: page;
            }
            .solicitud-panol-print-area:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            .solicitud-panol-print-area table {
              display: table !important;
              width: 100% !important;
              min-width: 100% !important;
              max-width: 100% !important;
              border-collapse: collapse !important;
              table-layout: fixed !important;
            }
            .solicitud-panol-print-area tr { display: table-row !important; }
            .solicitud-panol-print-area td,
            .solicitud-panol-print-area th { display: table-cell !important; }
          </style>
        </head>
        <body>${hojasRef.current.innerHTML}</body>
      </html>`);
    printWindow.document.close();

    const launchPrint = () => {
      printWindow.focus();
      printWindow.print();
    };

    if (printWindow.document.readyState === "complete") {
      window.setTimeout(launchPrint, 180);
    } else {
      printWindow.addEventListener("load", () => window.setTimeout(launchPrint, 180), { once: true });
    }
    printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Solicitud imprimible para pañol"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15, 23, 42, 0.58)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <div
        style={{
          width: "min(980px, 100%)",
          maxHeight: "96vh",
          overflow: "auto",
          background: C.panelSolid,
          color: C.text,
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
        }}
      >
        <div
          className="solicitud-panol-no-print"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            background: C.panelSolid,
            borderBottom: `1px solid ${C.border}`,
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <ClipboardList size={18} style={{ color: C.blue }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900 }}>
              {completa ? `Solicitud N° ${datos.numero} · hoja completa` : "Solicitud imprimible para pañol"}
            </div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>
              {completa
                ? `${lista.length} ${lista.length === 1 ? "ítem" : "ítems"} · ${totalHojas} ${totalHojas === 1 ? "hoja A4" : "hojas A4"}${datos.retirado_at ? " · con comprobante de retiro" : ""}`
                : `Hoja A4 · ${ITEM_COUNT} renglones para pedir materiales.`}
            </div>
          </div>
          <button
            type="button"
            onClick={print}
            style={{
              border: `1px solid ${C.greenB}`,
              background: C.greenL,
              color: C.green,
              borderRadius: 10,
              padding: "9px 12px",
              fontSize: 12,
              fontWeight: 900,
              fontFamily: C.sans,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <Printer size={15} />
            Imprimir
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar imprimible"
            style={{
              border: `1px solid ${C.border}`,
              background: C.panel,
              color: C.text,
              borderRadius: 10,
              padding: 9,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* El div envuelve las hojas para poder mandar todas juntas a imprimir
            con un solo innerHTML. */}
        <div ref={hojasRef}>
          {hojas.map((h) => (
            <Hoja
              key={h.indice}
              solicitud={datos}
              items={h.items}
              filas={filasPorHoja}
              desde={h.desde}
              indice={h.indice}
              total={totalHojas}
              totalItems={lista.length}
              preview
            />
          ))}
        </div>
      </div>
    </div>
  );
}
