// Seguimiento de una persona entre dos fechas: qué día vino, cuál faltó, cuál
// llegó tarde y cuál se fue en el medio.
//
// Las reglas son las MISMAS que usa la pestaña Presentismo (tarde por
// tolerancia, salidas reconstruidas desde las fichadas crudas, justificaciones
// puntuales o por período). Si acá dijeran otra cosa, el papel y la pantalla se
// contradirían y no habría forma de saber cuál vale.
import {
  addDays,
  diaSemana,
  duracionMin,
  extraFueraVentanaMin,
  hhmm,
  jornadaDelDia,
  timeToMin,
  tramosDelDia,
} from "./api";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function nombreDia(fechaIso) {
  return DIAS[diaSemana(fechaIso)] ?? "";
}

export function rangoDeFechas(desde, hasta) {
  const out = [];
  if (!desde || !hasta || desde > hasta) return out;
  // Tope de seguridad: un rango mal tipeado (2020→2026) no puede colgar el navegador.
  for (let f = desde, i = 0; f <= hasta && i < 800; f = addDays(f, 1), i += 1) out.push(f);
  return out;
}

/**
 * Arma el detalle día por día y el resumen del período.
 *
 * @param {object}   empleado
 * @param {Array}    marcaciones     filas de rrhh_marcaciones de esa persona
 * @param {Array}    justificaciones filas ya expandidas por día (fetchJustificaciones)
 * @param {object}   config          rrhh_config (jornada, tolerancia)
 */
export function armarSeguimiento({ empleado, marcaciones = [], justificaciones = [], config = {}, desde, hasta }) {
  const tardeMin = timeToMin(config.tolerancia_tarde) ?? 430;
  const porFecha = new Map(marcaciones.map((m) => [String(m.fecha).slice(0, 10), m]));
  const justPorFecha = new Map(justificaciones.map((j) => [String(j.fecha).slice(0, 10), j]));

  const dias = rangoDeFechas(desde, hasta).map((fecha) => {
    const m = porFecha.get(fecha) ?? null;
    const justificacion = justPorFecha.get(fecha) ?? null;
    // Domingo siempre es no laborable; el sábado depende de la config (en el
    // astillero suele ser 0 y todo lo que se trabaja ahí es extra).
    const esLaborable = jornadaDelDia(fecha, config) > 0;

    if (!m) {
      return {
        fecha,
        dia: nombreDia(fecha),
        entrada: "",
        salida: "",
        minutos: null,
        extras: null,
        // Faltar un domingo no es faltar. Marcarlo como ausencia infla el informe
        // y le saca valor a las ausencias de verdad.
        estado: esLaborable ? (justificacion ? "justificada" : "ausente") : "no laborable",
        justificacion,
        salidasEnJornada: [],
        observaciones: justificacion?.motivo ? [justificacion.motivo] : [],
      };
    }

    const entrada = hhmm(m.entrada);
    const salida = hhmm(m.salida);
    const tarde = esLaborable && entrada != null && timeToMin(entrada) > tardeMin;
    const { ausencias } = tramosDelDia(m.fichadas);
    const observaciones = [];
    if (tarde) observaciones.push(`Llegó ${entrada}`);
    if (entrada && !salida) observaciones.push("Sin salida");
    if (!entrada && salida) observaciones.push("Sin entrada");
    for (const a of ausencias) observaciones.push(`Salió ${a.desde}–${a.hasta}`);
    if (justificacion?.motivo) observaciones.push(justificacion.motivo);

    return {
      fecha,
      dia: nombreDia(fecha),
      entrada: entrada || "",
      salida: salida || "",
      minutos: duracionMin(m),
      extras: extraFueraVentanaMin(m, config),
      estado: tarde ? "tarde" : "presente",
      justificacion,
      salidasEnJornada: ausencias,
      observaciones,
    };
  });

  const cuenta = (fn) => dias.filter(fn).length;
  const suma = (fn) => dias.reduce((acc, d) => acc + (fn(d) || 0), 0);

  return {
    empleado,
    desde,
    hasta,
    dias,
    resumen: {
      // Dias que cuentan para el informe: los habiles mas los feriados o
      // sabados que la persona igual vino a trabajar. Un domingo en blanco no
      // entra ni como presente ni como falta.
      diasComputados: cuenta((d) => d.estado !== "no laborable"),
      presentes: cuenta((d) => d.estado === "presente" || d.estado === "tarde"),
      ausentes: cuenta((d) => d.estado === "ausente"),
      justificadas: cuenta((d) => d.estado === "justificada"),
      tarde: cuenta((d) => d.estado === "tarde"),
      sinSalida: cuenta((d) => d.observaciones.includes("Sin salida")),
      // Días en los que se fue y volvió: el dato que no se ve en entrada/salida.
      diasConSalida: cuenta((d) => d.salidasEnJornada.length > 0),
      minutosTrabajados: suma((d) => d.minutos),
      minutosExtra: suma((d) => d.extras),
    },
  };
}
