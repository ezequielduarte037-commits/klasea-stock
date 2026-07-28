const MS_DIA = 86_400_000;
export const PRODUCTION_STAGE_OFFSET_PREFIX = "linea_proceso:";

export function parseISODate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addDays(date, days) {
  if (!date) return null;
  return new Date(date.getTime() + Number(days || 0) * MS_DIA);
}

function isSameOrBefore(a, b) {
  return a.getTime() <= b.getTime();
}

export function normalizeNonWorkingPeriods(periods = []) {
  return periods
    .map((period) => {
      const start = parseISODate(period?.fecha_desde);
      const end = parseISODate(period?.fecha_hasta);
      if (!start || !end) return null;
      return start <= end ? { ...period, start, end } : { ...period, start: end, end: start };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

export function nonWorkingDaysCount(periods = []) {
  const uniqueDays = new Set();
  normalizeNonWorkingPeriods(periods).forEach((period) => {
    let guard = 0;
    for (let day = new Date(period.start); isSameOrBefore(day, period.end) && guard < 20_000; day = addDays(day, 1)) {
      uniqueDays.add(toISODate(day));
      guard += 1;
    }
  });
  return uniqueDays.size;
}

function isDateInNormalizedPeriods(date, normalizedPeriods) {
  const time = new Date(date).setHours(0, 0, 0, 0);
  return normalizedPeriods.some((period) => (
    time >= period.start.getTime() && time <= period.end.getTime()
  ));
}

export function isNonWorkingDate(date, periods = []) {
  if (!date) return false;
  return isDateInNormalizedPeriods(date, normalizeNonWorkingPeriods(periods));
}

/**
 * Suma días productivos, salteando vacaciones/pausas cargadas para la obra.
 * Mantiene la semántica histórica de "días corridos": fines de semana cuentan;
 * solamente se excluyen los períodos declarados de forma explícita.
 */
export function addProductionDays(date, days, periods = []) {
  if (!date) return null;
  const amount = Number(days || 0);
  if (!Number.isFinite(amount)) return new Date(date);
  const normalized = normalizeNonWorkingPeriods(periods);
  const direction = amount < 0 ? -1 : 1;
  let current = new Date(date);
  current.setHours(0, 0, 0, 0);
  let remaining = Math.abs(amount);
  let guard = 0;

  while (isDateInNormalizedPeriods(current, normalized) && guard < 20_000) {
    current = addDays(current, direction);
    guard += 1;
  }
  while (remaining > 0 && guard < 20_000) {
    const step = Math.min(1, remaining);
    current = addDays(current, direction * step);
    if (!isDateInNormalizedPeriods(current, normalized)) remaining -= step;
    guard += 1;
  }
  return current;
}

export function productionStageOffsetKey(processId) {
  return `${PRODUCTION_STAGE_OFFSET_PREFIX}${processId}`;
}

export function relativeWeekLabel(value) {
  const weeks = Number(value);
  if (!Number.isFinite(weeks)) return "Sin ubicar";
  if (weeks === 0) return "S0";
  return `S${weeks > 0 ? "+" : "−"}${Math.abs(weeks)}`;
}

export function productionStageOffsetsMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.evento_key?.startsWith(PRODUCTION_STAGE_OFFSET_PREFIX)) continue;
    const processId = row.evento_key.slice(PRODUCTION_STAGE_OFFSET_PREFIX.length);
    const weeks = Number(row.semanas);
    if (processId && Number.isFinite(weeks)) map.set(processId, weeks);
  }
  return map;
}

export function toISODate(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Única regla para obtener la semana cero operativa de una obra.
 * El desmolde real prevalece sobre el estimado y atraso_dias desplaza la
 * proyección sin alterar la fecha base, igual que en el módulo Fechas.
 */
export function getDesmoldeReference(obra, override = {}) {
  const estimated = Object.prototype.hasOwnProperty.call(override, "desmolde_estimado")
    ? override.desmolde_estimado
    : obra?.desmolde_estimado;
  const real = Object.prototype.hasOwnProperty.call(override, "desmolde_real")
    ? override.desmolde_real
    : obra?.desmolde_real;
  const delayDays = Number(
    Object.prototype.hasOwnProperty.call(override, "atraso_dias")
      ? override.atraso_dias
      : obra?.atraso_dias,
  ) || 0;
  const effective = real || estimated || null;
  const base = parseISODate(effective);

  return {
    estimated: estimated || null,
    real: real || null,
    effective,
    base,
    projected: addDays(base, delayDays),
    delayDays,
    source: real ? "real" : estimated ? "estimado" : null,
  };
}

/**
 * Ventana planificada de una etapa de producción, siempre relativa al
 * desmolde operativo de la obra. El offset pertenece a la etapa del modelo:
 * -3 = comienza tres semanas antes; +6 = seis semanas después.
 */
export function getProductionStageSchedule({
  obra,
  etapa,
  proceso,
  offsetWeeks,
  nonWorkingPeriods = [],
  today = new Date(),
} = {}) {
  const reference = getDesmoldeReference(obra);
  const weeks = Number(offsetWeeks);
  const configured = Number.isFinite(weeks);
  const durationDays = Math.max(0, Number(etapa?.dias_estimados ?? proceso?.dias_estimados ?? 0) || 0);
  const rawCalculatedStart = configured && reference.projected
    ? addDays(reference.projected, weeks * 7)
    : null;
  const calculatedStart = configured && reference.projected
    ? addProductionDays(reference.projected, weeks * 7, nonWorkingPeriods)
    : null;
  const manualStart = parseISODate(etapa?.fecha_inicio);
  const manualEnd = parseISODate(etapa?.fecha_fin_estimada);
  const plannedStart = manualStart || calculatedStart;
  const rawCalculatedEnd = plannedStart ? addDays(plannedStart, durationDays) : null;
  const calculatedEnd = plannedStart ? addProductionDays(plannedStart, durationDays, nonWorkingPeriods) : null;
  const plannedEnd = manualEnd || calculatedEnd;
  const deadline = plannedEnd || plannedStart;
  const current = new Date(today);
  current.setHours(0, 0, 0, 0);
  const state = String(etapa?.estado || "pendiente").toLowerCase();
  const completed = ["completado", "completada", "finalizada", "terminada"].includes(state);
  const actualEnd = parseISODate(etapa?.fecha_fin_real || etapa?.fecha_fin);
  const comparison = completed && actualEnd ? actualEnd : current;
  const delayDays = deadline && comparison > deadline
    ? Math.max(0, Math.round((comparison.getTime() - deadline.getTime()) / MS_DIA))
    : 0;

  return {
    configured,
    usesManualStart: !!manualStart,
    usesManualEnd: !!manualEnd,
    offsetWeeks: configured ? weeks : null,
    relativeLabel: relativeWeekLabel(configured ? weeks : null),
    phase: !configured ? null : weeks < 0 ? "pre" : weeks > 0 ? "post" : "desmolde",
    reference,
    durationDays,
    nonWorkingPeriods: normalizeNonWorkingPeriods(nonWorkingPeriods),
    nonWorkingDays: nonWorkingDaysCount(nonWorkingPeriods),
    calendarAdjusted: (!manualStart && rawCalculatedStart?.getTime() !== calculatedStart?.getTime())
      || (!manualEnd && rawCalculatedEnd?.getTime() !== calculatedEnd?.getTime()),
    plannedStart,
    plannedEnd,
    plannedStartISO: toISODate(plannedStart),
    plannedEndISO: toISODate(plannedEnd),
    deadline,
    overdue: !completed && delayDays > 0,
    delayDays,
  };
}
