// Capa de datos del módulo RRHH.
// Tablas: rrhh_contratistas, rrhh_empleados, rrhh_marcaciones, rrhh_import_batches, rrhh_config.

import { supabase } from "@/supabaseClient";

const EMPLEADO_BASE_SELECT =
  "id, dni, nombre, grupo, sede, ficha, activo, notas, contratista_id, contratista:rrhh_contratistas(id, nombre)";

export const EMPLEADO_SELECT =
  `${EMPLEADO_BASE_SELECT}, nfc_uid, foto_url, nfc_asignado_at, nfc_asignado_por`;

export const SEDES = ["Pampa", "Chubut"];

// Error típico cuando todavía no se corrió el SQL en el dashboard.
export function isMissingTable(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return error.code === "42P01" || msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("not found");
}

export function isMissingColumn(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return error.code === "42703" || msg.includes("column") && (msg.includes("does not exist") || msg.includes("schema cache"));
}

export function normalizeNfcUid(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^0-9a-z]/gi, "")
    .toUpperCase();
}

function withNfcDefaults(rows) {
  return (rows ?? []).map((row) => ({
    ...row,
    nfc_uid: row.nfc_uid ?? null,
    foto_url: row.foto_url ?? null,
    nfc_asignado_at: row.nfc_asignado_at ?? null,
    nfc_asignado_por: row.nfc_asignado_por ?? null,
  }));
}

export async function fetchEmpleados() {
  const rich = await supabase
    .from("rrhh_empleados")
    .select(EMPLEADO_SELECT)
    .order("nombre");
  if (!rich.error) return rich.data ?? [];
  if (!isMissingColumn(rich.error)) throw rich.error;

  const { data, error } = await supabase
    .from("rrhh_empleados")
    .select(EMPLEADO_BASE_SELECT)
    .order("nombre");
  if (error) throw error;
  return withNfcDefaults(data);
}

export async function buscarEmpleadoPorNfc(uid) {
  const clean = normalizeNfcUid(uid);
  if (!clean) return null;
  const { data, error } = await supabase
    .from("rrhh_empleados")
    .select(EMPLEADO_SELECT)
    .eq("nfc_uid", clean)
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) {
      throw new Error("Falta correr la migracion NFC de RRHH para poder leer tarjetas.");
    }
    throw error;
  }
  return data ?? null;
}

export async function fetchContratistas() {
  const { data, error } = await supabase
    .from("rrhh_contratistas")
    .select("id, nombre, dni, celular, activo")
    .order("nombre");
  if (error) throw error;
  return data ?? [];
}

export async function fetchMarcaciones(desde, hasta) {
  // Paginado: un mes de 250 personas son ~7500 filas y PostgREST corta en 1000.
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("rrhh_marcaciones")
      .select("id, empleado_id, fecha, entrada, salida, fichadas, editado_por, sede")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  // Corrige salidas falsas por fichadas duplicadas. Las editadas a mano se respetan.
  return out.map((m) => (m.editado_por ? m : { ...m, ...resolverEntradaSalida(m) }));
}

export async function fetchJustificaciones(desde, hasta) {
  const { data, error } = await supabase
    .from("rrhh_justificaciones")
    .select("empleado_id, fecha, motivo")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (error) throw error;
  return data ?? [];
}

export async function fetchConfig() {
  const { data, error } = await supabase.from("rrhh_config").select("clave, valor");
  if (error) throw error;
  const cfg = {};
  for (const row of data ?? []) cfg[row.clave] = row.valor;
  const horaInicio = String(cfg.hora_inicio ?? "07:00");
  const horaFin = String(cfg.hora_fin ?? "16:00");
  return {
    jornada_min: Number(cfg.jornada_min ?? Math.max(0, (timeToMin(horaFin) ?? 960) - (timeToMin(horaInicio) ?? 420))),
    jornada_sabado_min: Number(cfg.jornada_sabado_min ?? 0), // sábado: todo extra
    tolerancia_tarde: String(cfg.tolerancia_tarde ?? "07:10"), // después: pierde presentismo
    hora_inicio: horaInicio,
    hora_fin: horaFin,
  };
}

export async function saveConfig(clave, valor) {
  const { error } = await supabase
    .from("rrhh_config")
    .upsert({ clave, valor: String(valor) }, { onConflict: "clave" });
  if (error) throw error;
}

export async function guardarJustificacion(empleadoId, fecha, motivo) {
  const clean = String(motivo ?? "").trim();
  if (!empleadoId || !fecha) throw new Error("Falta empleado o fecha.");

  if (!clean) {
    const { error } = await supabase
      .from("rrhh_justificaciones")
      .delete()
      .eq("empleado_id", empleadoId)
      .eq("fecha", fecha);
    if (error) throw error;
    return null;
  }

  const payload = { empleado_id: empleadoId, fecha, motivo: clean };
  const upsert = await supabase
    .from("rrhh_justificaciones")
    .upsert(payload, { onConflict: "empleado_id,fecha" })
    .select("empleado_id, fecha, motivo")
    .single();
  if (!upsert.error) return upsert.data;

  const msg = String(upsert.error.message ?? "").toLowerCase();
  if (!msg.includes("unique") && !msg.includes("constraint") && !msg.includes("conflict")) throw upsert.error;

  const { data: updated, error: updateError } = await supabase
    .from("rrhh_justificaciones")
    .update({ motivo: clean })
    .eq("empleado_id", empleadoId)
    .eq("fecha", fecha)
    .select("empleado_id, fecha, motivo");
  if (updateError) throw updateError;
  if (updated?.length) return updated[0];

  const { data, error } = await supabase
    .from("rrhh_justificaciones")
    .insert(payload)
    .select("empleado_id, fecha, motivo")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchBatches() {
  const { data, error } = await supabase
    .from("rrhh_import_batches")
    .select("id, filename, periodo_desde, periodo_hasta, sede, stats, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

// ─── Helpers de tiempo ──────────────────────────────────────────────────────

export function hhmm(t) {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

export function timeToMin(t) {
  const s = hhmm(t);
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function minToHM(min) {
  if (min == null || Number.isNaN(min)) return "—";
  const neg = min < 0;
  const v = Math.abs(Math.round(min));
  return `${neg ? "-" : ""}${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

// Una salida sólo cuenta si está lo bastante lejos de la entrada. Fichadas más cercanas
// que esto son el MISMO evento repetido (el fichero a veces toma la cara 2-3 veces seguidas
// a la mañana, y eso no es una salida).
const GAP_SALIDA_MIN = 60;
const MIN_VALID_PUNCH_MIN = 6 * 60;
const MAX_VALID_PUNCH_MIN = (19 * 60) + 59;
const SINGLE_PUNCH_AS_EXIT_MIN = 12 * 60;

function normalizePunches(punches) {
  return [...new Set((punches ?? [])
    .map(hhmm)
    .filter(Boolean)
    .filter((t) => {
      const min = timeToMin(t);
      return min != null && min >= MIN_VALID_PUNCH_MIN && min <= MAX_VALID_PUNCH_MIN;
    }))]
    .sort((a, b) => timeToMin(a) - timeToMin(b));
}

// Recalcula entrada/salida desde las fichadas reales, descartando los duplicados del fichero.
// Si no hay fichadas (o fue editada a mano) se respeta lo guardado.
export function resolverEntradaSalida(m) {
  const raw = Array.isArray(m?.fichadas) ? m.fichadas.filter(Boolean) : [];
  if (!raw.length) return { entrada: hhmm(m?.entrada), salida: hhmm(m?.salida) };

  const arr = normalizePunches(raw);
  if (!arr.length) return { entrada: null, salida: null };

  const entrada = arr[0];
  const ultima = arr[arr.length - 1];
  const e = timeToMin(entrada);
  const u = timeToMin(ultima);

  if (arr.length === 1) {
    return e >= SINGLE_PUNCH_AS_EXIT_MIN
      ? { entrada: null, salida: entrada }
      : { entrada, salida: null };
  }

  if (e >= SINGLE_PUNCH_AS_EXIT_MIN) return { entrada: null, salida: ultima };

  const salida = e != null && u != null && u - e >= GAP_SALIDA_MIN ? ultima : null;
  return { entrada, salida };
}

// Duración trabajada de una marcación (min) — null si no tiene salida.
export function duracionMin(m) {
  const e = timeToMin(m.entrada);
  const s = timeToMin(m.salida);
  if (e == null || s == null) return null;
  return Math.max(0, s - e);
}

// Las extras cuentan en bloques de media hora: menos de 30 min no cuenta y se redondea
// hacia abajo (35→30, 65→60). Nunca resta por salir unos minutos antes (Math.max(0,...)).
const EXTRA_BLOQUE_MIN = 30;

export function extraFueraVentanaMin(m, cfg) {
  const entrada = timeToMin(m.entrada);
  const salida = timeToMin(m.salida);
  if (entrada == null || salida == null) return null;
  const trabajado = Math.max(0, salida - entrada);
  const dow = diaSemana(m.fecha);
  let bruto;
  if (dow === 0 || dow === 6) {
    bruto = trabajado; // sábado/domingo: todo extra
  } else {
    const inicio = timeToMin(cfg?.hora_inicio ?? "07:00") ?? 420;
    const fin = timeToMin(cfg?.hora_fin ?? "16:00") ?? 960;
    const antes = Math.max(0, Math.min(salida, inicio) - entrada);
    const despues = Math.max(0, salida - Math.max(entrada, fin));
    bruto = antes + despues;
  }
  const bloque = Number(cfg?.extra_bloque_min) > 0 ? Number(cfg.extra_bloque_min) : EXTRA_BLOQUE_MIN;
  return Math.floor(bruto / bloque) * bloque; // redondeo hacia abajo; < bloque = 0
}

export function diaSemana(fechaIso) {
  const [y, mo, d] = fechaIso.split("-").map(Number);
  return new Date(y, mo - 1, d).getDay(); // 0=domingo, 6=sábado
}

// Jornada esperada (min) para una fecha según config; domingo = 0 (todo es extra).
export function jornadaDelDia(fechaIso, cfg) {
  const dow = diaSemana(fechaIso);
  if (dow === 0) return 0;
  if (dow === 6) return cfg.jornada_sabado_min;
  const inicio = timeToMin(cfg?.hora_inicio ?? "07:00") ?? 420;
  const fin = timeToMin(cfg?.hora_fin ?? "16:00") ?? 960;
  return Math.max(0, fin - inicio);
}

export function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(fechaIso, n) {
  const [y, mo, d] = fechaIso.split("-").map(Number);
  const dt = new Date(y, mo - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function fmtFecha(fechaIso) {
  if (!fechaIso) return "—";
  const [y, mo, d] = fechaIso.split("-");
  return `${d}/${mo}/${y}`;
}

const DOW_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export function fmtFechaCorta(fechaIso) {
  const [, mo, d] = fechaIso.split("-");
  return `${DOW_LABEL[diaSemana(fechaIso)]} ${d}/${mo}`;
}

// ─── Export CSV (Excel AR usa ";") ──────────────────────────────────────────
export function downloadCsv(filename, headers, rows) {
  const cell = (v) => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [headers, ...rows].map(r => r.map(cell).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
