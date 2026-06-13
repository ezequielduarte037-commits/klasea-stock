// Capa de datos del módulo RRHH.
// Tablas: rrhh_contratistas, rrhh_empleados, rrhh_marcaciones, rrhh_import_batches, rrhh_config.

import { supabase } from "@/supabaseClient";

export const EMPLEADO_SELECT =
  "id, dni, nombre, grupo, ficha, activo, notas, contratista_id, contratista:rrhh_contratistas(id, nombre)";

// Error típico cuando todavía no se corrió el SQL en el dashboard.
export function isMissingTable(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return error.code === "42P01" || msg.includes("does not exist") || msg.includes("schema cache");
}

export async function fetchEmpleados() {
  const { data, error } = await supabase
    .from("rrhh_empleados")
    .select(EMPLEADO_SELECT)
    .order("nombre");
  if (error) throw error;
  return data ?? [];
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
      .select("id, empleado_id, fecha, entrada, salida, fichadas, editado_por")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function fetchConfig() {
  const { data, error } = await supabase.from("rrhh_config").select("clave, valor");
  if (error) throw error;
  const cfg = {};
  for (const row of data ?? []) cfg[row.clave] = row.valor;
  return {
    jornada_min: Number(cfg.jornada_min ?? 540),          // lun-vie: 7 a 16 = 9 h
    jornada_sabado_min: Number(cfg.jornada_sabado_min ?? 0), // sábado: todo extra
    tolerancia_tarde: String(cfg.tolerancia_tarde ?? "07:10"), // después: pierde presentismo
  };
}

export async function saveConfig(clave, valor) {
  const { error } = await supabase
    .from("rrhh_config")
    .upsert({ clave, valor: String(valor) }, { onConflict: "clave" });
  if (error) throw error;
}

export async function fetchBatches() {
  const { data, error } = await supabase
    .from("rrhh_import_batches")
    .select("id, filename, periodo_desde, periodo_hasta, stats, created_at")
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

// Duración trabajada de una marcación (min) — null si no tiene salida.
export function duracionMin(m) {
  const e = timeToMin(m.entrada);
  const s = timeToMin(m.salida);
  if (e == null || s == null) return null;
  return Math.max(0, s - e);
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
  return cfg.jornada_min;
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
