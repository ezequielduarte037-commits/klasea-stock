import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cargarMarcasPdf } from "@/lib/pdfLogo";
import {
  ABAJO, GRIS, MARGEN, ROJO, cifras, encabezado, encabezadoContinuacion, fechaRotulo, pie, tablaKlasea,
} from "@/lib/pdfKlasea";
import { minToHM } from "./api";

// Informe de asistencia de una persona, para imprimir o adjuntar al legajo.
// Mismo papel que el resto (lib/pdfKlasea): cabecera, cifras y tabla.
//
// Recibe el MISMO historial que muestra el modal de Seguimiento por persona.
// No recalcula nada: si el papel dijera algo distinto que la pantalla, no
// habria forma de saber cual vale.

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function fmtFechaLarga(iso) {
  if (!iso) return "-";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
}

function fechaYDia(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return { corta: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`, dia: DIAS[new Date(y, m - 1, d).getDay()] ?? "" };
}

function safePart(s) {
  return String(s || "seguimiento")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 60);
}

// Mismas etiquetas que los chips del modal.
const ESTADO_LABEL = {
  presente: "Presente",
  tarde: "Llegada tarde",
  incompleta: "Marcación incompleta",
  justificada: "Ausencia justificada",
  ausente: "AUSENTE",
};

function detalleDeFila(row) {
  if (row.marcacion) {
    const horas = row.minutos != null ? ` (${minToHM(row.minutos)})` : "";
    return `${row.entrada || "sin entrada"} – ${row.salida || "sin salida"}${horas}`;
  }
  return row.justificacion?.motivo || "Sin marcación registrada";
}

export async function construirSeguimientoPdf({ empleado, desde, hasta, historial = [], resumen = {} }, { generadoPor = "", logo = undefined, logotipo = null } = {}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let marcas = { logo, logotipo };
  if (logo === undefined) {
    try { marcas = await cargarMarcasPdf(); } catch { marcas = { logo: null, logotipo: null }; }
  }
  const nombre = String(empleado?.nombre || "-");
  const ficha = [empleado?.dni ? `DNI ${empleado.dni}` : "", empleado?.sede || ""].filter(Boolean).join("   ·   ");

  let y = encabezado(doc, {
    seccion: "Recursos humanos",
    derecha: fechaRotulo(hasta),
    eyebrow: "Seguimiento de asistencia",
    titulo: nombre,
    subtitulo: `Del ${fmtFechaLarga(desde)} al ${fmtFechaLarga(hasta)}`,
    detalle: ficha,
    logo: marcas.logo,
    logotipo: marcas.logotipo,
  });

  // ── Resumen ────────────────────────────────────────────────────────────────
  // Las ausencias en rojo: es el número que se busca al abrir esta hoja.
  const ausentes = resumen.ausentes ?? 0;
  y = cifras(doc, {
    y,
    items: [
      { rotulo: "Presentes", valor: String(resumen.presentes ?? 0) },
      { rotulo: "Tardes", valor: String(resumen.tardes ?? 0) },
      { rotulo: "Ausentes", valor: String(ausentes), color: ausentes > 0 ? ROJO : undefined },
      { rotulo: "Justificadas", valor: String(resumen.justificadas ?? 0) },
      { rotulo: "Días hábiles", valor: String(historial.length) },
    ],
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  doc.text("No incluye sábados ni domingos.", MARGEN, y + 14);

  // ── Detalle ────────────────────────────────────────────────────────────────
  // En pantalla se lista del dia mas nuevo al mas viejo; en papel se lee mejor
  // en orden, de la primera fecha del rango a la ultima.
  const filas = [...historial].reverse();

  autoTable(doc, tablaKlasea({
    startY: y + 34,
    margin: { left: MARGEN, right: MARGEN, top: 80, bottom: ABAJO },
    head: [["Fecha", "Día", "Estado", "Detalle"]],
    body: filas.map((row) => {
      const { corta, dia } = fechaYDia(row.fecha);
      return [corta, dia, ESTADO_LABEL[row.tipo] || row.tipo, detalleDeFila(row)];
    }),
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 40, textColor: GRIS },
      2: { cellWidth: 128 },
      3: { cellWidth: "auto", textColor: GRIS },
    },
    // Una ausencia tiene que saltar a la vista sin leer la fila entera.
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (filas[data.row.index]?.tipo === "ausente") {
        data.cell.styles.textColor = ROJO;
        if (data.column.index === 2) data.cell.styles.fontStyle = "bold";
      }
    },
    willDrawPage: (data) => {
      if (data.pageNumber > 1) encabezadoContinuacion(doc, { seccion: "Asistencia", titulo: nombre, derecha: fechaRotulo(hasta) });
    },
  }));

  // ── Pie ────────────────────────────────────────────────────────────────────
  const emitido = new Date().toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  pie(doc, {
    izquierda: `Emitido el ${emitido}${generadoPor ? ` por ${generadoPor}` : ""}  ·  Fichero de acceso`,
  });

  return { doc, nombreArchivo: `seguimiento-${safePart(empleado?.nombre)}-${desde}_${hasta}.pdf` };
}

export async function exportSeguimientoPdf(datos, opciones = {}) {
  const { doc, nombreArchivo } = await construirSeguimientoPdf(datos, opciones);
  doc.save(nombreArchivo);
  return nombreArchivo;
}
