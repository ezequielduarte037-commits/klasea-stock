import { addProductionDays, getDesmoldeReference, parseISODate, toISODate } from "@/features/obras/fechasEngine";

// Plan de una obra a partir de su desmolde (S0) y de la plantilla de su línea.
//
// Cada etapa trae su `cronograma` (getProductionStageSchedule): si la plantilla
// le da una semana respecto del desmolde, esa es la fecha. Si no la tiene, la
// etapa va a continuación de la anterior y queda marcada como "sugerida"; cuando
// ninguna etapa de la línea está ubicada, la de casco termina en S0.
//
// El avance se mide por etapa y pesa por su duración: una etapa terminada suma
// todos sus días, una con tareas suma la parte tildada y una en curso sin tareas
// suma la mitad. Así una obra se puede llevar sólo con el estado de las etapas.

const MS_DIA = 86_400_000;

export function hoyLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function normalizarEstadoEtapa(valor) {
  const v = String(valor || "").toLowerCase();
  if (["completado", "completada", "finalizada", "terminada"].includes(v)) return "completado";
  if (["en_curso", "en_progreso", "iniciada"].includes(v)) return "en_curso";
  if (["bloqueado", "bloqueada"].includes(v)) return "bloqueado";
  return "pendiente";
}

export const diasEntre = (a, b) => (a && b ? Math.round((b.getTime() - a.getTime()) / MS_DIA) : null);

const ES_CASCO = (nombre) => /casco/i.test(nombre || "") && !/matriz|llegada/i.test(nombre || "");

export function planDeObra({ obra, etapas = [], tareasPorEtapa = new Map(), periodos = [], hoy = hoyLocal() }) {
  const ref = getDesmoldeReference(obra);
  const s0 = ref.projected || null;
  const base = s0 || parseISODate(obra?.fecha_inicio);
  const vacio = {
    s0, s0Fuente: ref.source, etapas: [], inicio: null, fin: null, actual: null, enCursoPlan: [],
    reportada: false, hechoHasta: null, avance: null, atraso: 0, paraConfirmar: [],
    tieneSugeridas: false, terminadas: 0, totalTareas: 0, tareasHechas: 0,
  };
  if (!etapas.length) return { ...vacio, sinPlantilla: true };

  const dur = (e) => Math.max(1, Math.round(Number(e.cronograma?.durationDays ?? e.dias_estimados ?? 0) || 0));
  const items = etapas.map((e) => {
    const c = e.cronograma || {};
    return c.plannedStart
      ? { ini: c.plannedStart, fin: c.plannedEnd && c.plannedEnd > c.plannedStart ? c.plannedEnd : addProductionDays(c.plannedStart, dur(e), periodos), sug: false }
      : null;
  });

  if (!base && items.every((x) => !x)) return { ...vacio, sinFechas: true, etapasSinFecha: etapas };

  const ninguna = items.every((x) => !x);
  const ancla = ninguna && s0 ? etapas.findIndex((e) => ES_CASCO(e.nombre)) : -1;
  if (ancla >= 0) {
    items[ancla] = { ini: addProductionDays(s0, -dur(etapas[ancla]), periodos), fin: s0, sug: true };
    for (let i = ancla - 1; i >= 0; i--) {
      const fin = items[i + 1].ini;
      items[i] = { ini: addProductionDays(fin, -dur(etapas[i]), periodos), fin, sug: true };
    }
  }
  const arranque = base || items.find(Boolean)?.ini;
  for (let i = 0; i < items.length; i++) {
    if (items[i]) continue;
    const ini = i ? items[i - 1].fin : arranque;
    items[i] = { ini, fin: addProductionDays(ini, dur(etapas[i]), periodos), sug: true };
  }

  let pesoTotal = 0, pesoHecho = 0, totalTareas = 0, tareasHechas = 0, reportada = false, hechoHasta = null;
  const lista = etapas.map((etapa, idx) => {
    const { ini, fin, sug } = items[idx];
    const estado = normalizarEstadoEtapa(etapa.estado);
    const tareas = (tareasPorEtapa.get(etapa.id) || []).filter((t) => t.estado !== "cancelada");
    const total = tareas.length;
    const hechas = tareas.filter((t) => t.estado === "finalizada").length;
    const enProgreso = tareas.filter((t) => t.estado === "en_progreso").length;
    const progreso = estado === "completado" ? 1 : total ? hechas / total : estado === "en_curso" ? 0.5 : 0;
    const peso = Math.max(1, diasEntre(ini, fin) || 1);
    pesoTotal += peso; pesoHecho += peso * progreso;
    totalTareas += total; tareasHechas += hechas;
    if (estado !== "pendiente" || hechas > 0) reportada = true;
    if (progreso > 0) {
      const hasta = new Date(ini.getTime() + (fin.getTime() - ini.getTime()) * progreso);
      if (!hechoHasta || hasta > hechoHasta) hechoHasta = hasta;
    }
    return {
      etapa, idx, id: etapa.id, nombre: etapa.nombre, ini, fin, sug,
      iniISO: toISODate(ini), finISO: toISODate(fin),
      offset: etapa.cronograma?.offsetWeeks ?? null,
      estado, total, hechas, enProgreso, progreso,
      vencida: estado === "pendiente" && fin <= hoy,
      enPlanHoy: ini <= hoy && hoy < fin,
    };
  });

  const inicio = new Date(Math.min(...lista.map((e) => e.ini.getTime())));
  const fin = new Date(Math.max(...lista.map((e) => e.fin.getTime())));
  const enCursoPlan = lista.filter((e) => e.enPlanHoy);
  const actual = enCursoPlan.length ? enCursoPlan.reduce((a, b) => (b.ini > a.ini ? b : a)) : null;
  const primeraAbierta = lista.find((e) => e.estado !== "completado") || null;
  const atraso = reportada && primeraAbierta && !primeraAbierta.sug && hoy > primeraAbierta.fin
    ? diasEntre(primeraAbierta.fin, hoy) : 0;

  return {
    ...vacio,
    etapas: lista, inicio, fin, actual, enCursoPlan, primeraAbierta,
    reportada, hechoHasta, atraso,
    avance: reportada ? Math.round((pesoHecho / Math.max(1, pesoTotal)) * 100) : null,
    paraConfirmar: lista.filter((e) => e.vencida && !e.sug),
    tieneSugeridas: lista.some((e) => e.sug),
    terminadas: lista.filter((e) => e.estado === "completado").length,
    totalTareas, tareasHechas,
  };
}

// Estado corto de la obra para la lista: una etiqueta y un tono.
export function estadoDeObra(obra, plan) {
  if (obra?.estado === "pausada") return { tono: "violeta", texto: "Pausada" };
  if (obra?.estado === "terminada") return { tono: "verde", texto: "Terminada" };
  if (plan.sinPlantilla) return { tono: "neutro", texto: "Sin etapas" };
  if (plan.sinFechas) return { tono: "cian", texto: "Falta desmolde" };
  if (!plan.reportada) return { tono: "neutro", texto: "Sin reportes" };
  if (plan.atraso > 7) return { tono: "rojo", texto: `${plan.atraso} d de atraso` };
  if (!plan.primeraAbierta) return { tono: "verde", texto: "Etapas completas" };
  return { tono: "verde", texto: "Al día" };
}
