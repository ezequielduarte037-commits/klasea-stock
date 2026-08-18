// Capa de datos del módulo RRHH.
// Tablas: rrhh_contratistas, rrhh_empleados, rrhh_marcaciones, rrhh_import_batches, rrhh_config.

import { supabase } from "@/supabaseClient";

const EMPLEADO_BASE_SELECT =
  "id, dni, nombre, grupo, sede, ficha, activo, notas, contratista_id, contratista:rrhh_contratistas(id, nombre)";

export const EMPLEADO_SELECT =
  `${EMPLEADO_BASE_SELECT}, nfc_uid, foto_url, nfc_asignado_at, nfc_asignado_por`;

const EMPLEADO_OFICIO_SELECT =
  `${EMPLEADO_SELECT}, oficio_id, oficio:rrhh_oficios(id, nombre)`;

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
    oficio_id: row.oficio_id ?? null,
    oficio: row.oficio ?? null,
  }));
}

export async function fetchEmpleados() {
  const rich = await supabase
    .from("rrhh_empleados")
    .select(EMPLEADO_OFICIO_SELECT)
    .order("nombre");
  if (!rich.error) return rich.data ?? [];
  if (!isMissingColumn(rich.error)) throw rich.error;

  const withNfc = await supabase
    .from("rrhh_empleados")
    .select(EMPLEADO_SELECT)
    .order("nombre");
  if (!withNfc.error) return withNfcDefaults(withNfc.data);
  if (!isMissingColumn(withNfc.error)) throw withNfc.error;

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
  let { data, error } = await supabase
    .from("rrhh_empleados")
    .select(EMPLEADO_OFICIO_SELECT)
    .eq("nfc_uid", clean)
    .maybeSingle();
  if (error && isMissingColumn(error)) {
    ({ data, error } = await supabase
      .from("rrhh_empleados")
      .select(EMPLEADO_SELECT)
      .eq("nfc_uid", clean)
      .maybeSingle());
  }
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

export async function fetchMarcacionesEmpleado(empleadoId, desde, hasta) {
  if (!empleadoId) return [];
  const { data, error } = await supabase
    .from("rrhh_marcaciones")
    .select("id, empleado_id, fecha, entrada, salida, fichadas, editado_por, sede")
    .eq("empleado_id", empleadoId)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((m) => (m.editado_por ? m : { ...m, ...resolverEntradaSalida(m) }));
}

export async function fetchJustificaciones(desde, hasta, { empleadoId = null } = {}) {
  let legacyQuery = supabase
    .from("rrhh_justificaciones")
    .select("empleado_id, fecha, motivo")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (empleadoId) legacyQuery = legacyQuery.eq("empleado_id", empleadoId);
  const { data: legacy, error } = await legacyQuery;
  if (error) throw error;

  let periodosQuery = supabase
    .from("rrhh_ausencias")
    .select("id, empleado_id, tipo, desde, hasta, detalle, estado, created_by, created_at")
    .eq("estado", "activo")
    .lte("desde", hasta)
    .gte("hasta", desde);
  if (empleadoId) periodosQuery = periodosQuery.eq("empleado_id", empleadoId);
  const periodos = await periodosQuery;

  // Compatibilidad mientras se aplica la migracion: las justificaciones
  // historicas siguen funcionando aunque la tabla nueva aun no exista.
  if (periodos.error) {
    if (isMissingTable(periodos.error)) return legacy ?? [];
    throw periodos.error;
  }

  const merged = new Map();
  for (const row of expandirAusencias(periodos.data, desde, hasta)) {
    merged.set(`${row.empleado_id}:${row.fecha}`, row);
  }
  // Una justificacion puntual tiene prioridad sobre un periodo general.
  for (const row of legacy ?? []) merged.set(`${row.empleado_id}:${row.fecha}`, row);
  return [...merged.values()];
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

async function requireAttendanceManager() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData?.user?.id) throw new Error("No se pudo identificar al usuario.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.is_admin && !["admin", "rrhh", "administracion"].includes(profile?.role)) {
    throw new Error("Solo RRHH o un administrador pueden modificar el presentismo.");
  }
  return authData.user.id;
}

export async function guardarAusenciasProgramadas({ empleadoIds, desde, hasta, tipo, detalle }) {
  const ids = [...new Set((empleadoIds ?? []).filter(Boolean))];
  if (!ids.length) throw new Error("Selecciona al menos una persona.");
  if (!desde || !hasta || hasta < desde) throw new Error("El periodo seleccionado no es valido.");
  await requireAttendanceManager();

  const { data, error } = await supabase.rpc("rrhh_crear_ausencias", {
    p_empleado_ids: ids,
    p_desde: desde,
    p_hasta: hasta,
    p_tipo: tipo,
    p_detalle: String(detalle ?? "").trim() || null,
  });
  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (error.code === "PGRST202" || msg.includes("rrhh_crear_ausencias")) {
      throw new Error("Falta aplicar la migracion de periodos de ausencia en Supabase.");
    }
    throw error;
  }
  return expandirAusencias(data, desde, hasta);
}

const AUSENCIA_LABELS = {
  reposo: "Reposo",
  vacaciones: "Vacaciones",
  licencia: "Licencia",
  tramite: "Tramite",
  otro: "Ausencia justificada",
};

function expandirAusencias(periodos, desdeFiltro, hastaFiltro) {
  const rows = [];
  for (const periodo of periodos ?? []) {
    const desde = periodo.desde > desdeFiltro ? periodo.desde : desdeFiltro;
    const hasta = periodo.hasta < hastaFiltro ? periodo.hasta : hastaFiltro;
    const label = AUSENCIA_LABELS[periodo.tipo] ?? AUSENCIA_LABELS.otro;
    const detalle = String(periodo.detalle ?? "").trim();
    const motivo = detalle ? `${label}: ${detalle}` : label;
    for (let fecha = desde; fecha <= hasta; fecha = addDays(fecha, 1)) {
      rows.push({
        empleado_id: periodo.empleado_id,
        fecha,
        motivo,
        origen: "periodo",
        ausencia_id: periodo.id,
        ausencia_tipo: periodo.tipo,
        ausencia_desde: periodo.desde,
        ausencia_hasta: periodo.hasta,
        created_by: periodo.created_by ?? null,
        created_at: periodo.created_at ?? null,
      });
    }
  }
  return rows;
}

export async function guardarCorreccionMarcacion({ id, empleadoId, fecha, entrada, salida, sede }) {
  if (!empleadoId || !fecha) throw new Error("Falta empleado o fecha.");

  const normalizarHora = (value) => {
    const clean = String(value ?? "").trim();
    if (!clean) return null;
    const normalized = hhmm(clean);
    if (!normalized) throw new Error(`Horario invalido: ${clean}`);
    return normalized;
  };

  const editorId = await requireAttendanceManager();

  const payload = {
    empleado_id: empleadoId,
    fecha,
    entrada: normalizarHora(entrada),
    salida: normalizarHora(salida),
    editado_por: editorId,
    ...(sede ? { sede } : {}),
  };
  const select = "id, empleado_id, fecha, entrada, salida, fichadas, editado_por, sede";

  if (id) {
    const { data, error } = await supabase
      .from("rrhh_marcaciones")
      .update(payload)
      .eq("id", id)
      .select(select)
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("rrhh_marcaciones")
    .upsert({ ...payload, fichadas: [] }, { onConflict: "empleado_id,fecha" })
    .select(select)
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

// Dos fichadas casi pegadas son la misma: pasa cuando alguien apoya la tarjeta
// dos veces o el lector la lee doble. No es una salida y una entrada.
const FICHADA_DUPLICADA_MIN = 3;
// Cuánto tiene que durar un hueco para considerarse una salida de verdad. 45
// minutos deja pasar el café y el baño, y engancha la ida al médico o al banco,
// que es lo que interesa ver.
const AUSENCIA_MIN = 45;

/**
 * Reconstruye el día a partir de las fichadas crudas: en qué tramos estuvo y en
 * qué huecos no. entrada/salida sólo guardan la primera y la última, así que un
 * día de 07 · 10 · 12 · 16 se veía igual que uno de 07 a 16 corrido.
 *
 * Devuelve tramos (bloques trabajados) y ausencias (huecos largos entre tramos).
 * Un día normal de dos fichadas devuelve un tramo y ninguna ausencia.
 */
export function tramosDelDia(fichadas) {
  const arr = normalizePunches(fichadas);
  if (arr.length < 2) return { tramos: [], ausencias: [], impar: arr.length === 1 };

  // Colapsar las repetidas antes de emparejar: si no, un doble fichaje parte el
  // día en dos tramos falsos.
  const limpias = [];
  for (const t of arr) {
    const previa = limpias[limpias.length - 1];
    if (previa && timeToMin(t) - timeToMin(previa) <= FICHADA_DUPLICADA_MIN) continue;
    limpias.push(t);
  }

  // Se emparejan de a dos en orden: entra, sale, entra, sale.
  const tramos = [];
  for (let i = 0; i + 1 < limpias.length; i += 2) {
    tramos.push({ desde: limpias[i], hasta: limpias[i + 1] });
  }
  // Cantidad impar: la última quedó sin cerrar (se olvidó de fichar la salida).
  const impar = limpias.length % 2 === 1;

  const ausencias = [];
  for (let i = 1; i < tramos.length; i++) {
    const desde = tramos[i - 1].hasta;
    const hasta = tramos[i].desde;
    const minutos = timeToMin(hasta) - timeToMin(desde);
    if (minutos >= AUSENCIA_MIN) ausencias.push({ desde, hasta, minutos });
  }

  return { tramos, ausencias, impar };
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

/* ── Foto del empleado (validación visual en pañol) ───────────────────────── */

const BUCKET_FOTOS = "rrhh-fotos";

/**
 * Sube la foto de un empleado y deja la URL en `foto_url`.
 *
 * La foto es lo que le da valor real a la tarjeta NFC: sin cara, una tarjeta
 * prestada o clonada pasa desapercibida. Se guarda una sola foto vigente por
 * empleado (el archivo viejo queda en el bucket como historial).
 *
 * `archivo` puede ser un Blob (cámara) o un File (subida manual).
 */
export async function subirFotoEmpleado(empleadoId, archivo) {
  if (!empleadoId) throw new Error("Falta el empleado.");
  if (!archivo) throw new Error("Falta la foto.");

  const ext = archivo.type === "image/png" ? "png" : archivo.type === "image/webp" ? "webp" : "jpg";
  const path = `${empleadoId}/${Date.now()}.${ext}`;

  const { error: upError } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(path, archivo, { upsert: false, contentType: archivo.type || "image/jpeg" });
  if (upError) {
    if (String(upError.message || "").toLowerCase().includes("bucket")) {
      throw new Error(`Falta crear el bucket "${BUCKET_FOTOS}" en Supabase (ver SQL de fotos de empleados).`);
    }
    throw upError;
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path);

  const { error: updError } = await supabase
    .from("rrhh_empleados")
    .update({ foto_url: publicUrl })
    .eq("id", empleadoId);
  if (updError) throw updError;

  return publicUrl;
}

/** Saca la foto del empleado (no borra el archivo, solo desvincula). */
export async function quitarFotoEmpleado(empleadoId) {
  const { error } = await supabase.from("rrhh_empleados").update({ foto_url: null }).eq("id", empleadoId);
  if (error) throw error;
}

// ─── Oficios, asignación a obra y reglas de retiro ───────────────────────────
// El vínculo material↔oficio NO es por material: cada material ya tiene su
// categoría (Mecánica, Electricidad, Herrería…), así que el oficio habilita
// categorías. Son decenas de filas en vez de miles.

export async function fetchOficios() {
  const { data, error } = await supabase
    .from("rrhh_oficios")
    .select("id, nombre, descripcion, activo, orden")
    .order("orden")
    .order("nombre");
  if (error) throw error;
  return data ?? [];
}

export async function crearOficio({ nombre, descripcion = null }) {
  const limpio = String(nombre || "").trim();
  if (!limpio) throw new Error("El oficio necesita un nombre.");
  const { data, error } = await supabase
    .from("rrhh_oficios")
    .insert({ nombre: limpio, descripcion })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchOficioCategorias() {
  const { data, error } = await supabase
    .from("rrhh_oficio_categorias")
    .select("oficio_id, categoria_id");
  if (error) throw error;
  return data ?? [];
}

/** Reemplaza de una las categorías habilitadas para un oficio. */
export async function guardarCategoriasDeOficio(oficioId, categoriaIds = []) {
  if (!oficioId) throw new Error("Falta el oficio.");
  const { error: delError } = await supabase
    .from("rrhh_oficio_categorias")
    .delete()
    .eq("oficio_id", oficioId);
  if (delError) throw delError;
  const filas = [...new Set(categoriaIds.filter(Boolean))].map((categoria_id) => ({
    oficio_id: oficioId,
    categoria_id,
  }));
  if (!filas.length) return [];
  const { data, error } = await supabase
    .from("rrhh_oficio_categorias")
    .insert(filas)
    .select();
  if (error) throw error;
  return data ?? [];
}

/** Asignaciones vigentes (hasta = null). Con nombre de obra y de oficio. */
export async function fetchAsignacionesVigentes() {
  const { data, error } = await supabase
    .from("rrhh_empleado_obras")
    .select("id, empleado_id, obra_id, desde, hasta, notas, obra:produccion_obras(id, codigo, estado, linea_nombre)")
    .is("hasta", null)
    .order("desde", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Guarda en una sola operación el oficio de la persona y todas sus obras
 * vigentes. La RPC es transaccional; el fallback permite usar la pantalla si
 * todavía no se refrescó el schema cache después de aplicar la migración. */
export async function guardarFichaOperativaEmpleado({ empleadoId, oficioId = null, obraIds = [] } = {}) {
  if (!empleadoId) throw new Error("Falta el empleado.");
  const obras = [...new Set((obraIds || []).filter(Boolean))];
  const { data, error } = await supabase.rpc("rrhh_guardar_ficha_operativa", {
    p_empleado_id: empleadoId,
    p_oficio_id: oficioId || null,
    p_obra_ids: obras,
  });
  if (!error) return data;

  const message = String(error.message || "").toLowerCase();
  const missingRpc = error.code === "PGRST202" || message.includes("rrhh_guardar_ficha_operativa");
  if (!missingRpc) throw error;

  const oficioUpdate = await supabase
    .from("rrhh_empleados")
    .update({ oficio_id: oficioId || null })
    .eq("id", empleadoId);
  if (oficioUpdate.error) throw oficioUpdate.error;

  const current = await supabase
    .from("rrhh_empleado_obras")
    .select("id, obra_id")
    .eq("empleado_id", empleadoId)
    .is("hasta", null);
  if (current.error) throw current.error;

  const wanted = new Set(obras);
  const existing = new Set((current.data || []).map((row) => row.obra_id));
  const closeIds = (current.data || []).filter((row) => !wanted.has(row.obra_id)).map((row) => row.id);
  const addIds = obras.filter((obraId) => !existing.has(obraId));

  if (closeIds.length) {
    const closed = await supabase
      .from("rrhh_empleado_obras")
      .update({ hasta: new Date().toISOString().slice(0, 10) })
      .in("id", closeIds);
    if (closed.error) throw closed.error;
  }
  if (addIds.length) {
    const inserted = await supabase
      .from("rrhh_empleado_obras")
      .insert(addIds.map((obra_id) => ({ empleado_id: empleadoId, obra_id })));
    if (inserted.error) throw inserted.error;
  }
  return { ok: true, fallback: true };
}

/** Aplica un oficio y/o un conjunto de obras a varias personas. La RPC nueva
 * mantiene la operacion atomica. El fallback reutiliza la RPC individual para
 * que la pantalla siga funcionando mientras Supabase refresca el schema. */
export async function guardarFichasOperativasEmpleados({
  empleadoIds = [],
  aplicarOficio = false,
  oficioId = null,
  obraIds = [],
  modoObras = "conservar",
} = {}) {
  const empleados = [...new Set((empleadoIds || []).filter(Boolean))];
  const obras = [...new Set((obraIds || []).filter(Boolean))];
  if (!empleados.length) throw new Error("Selecciona al menos una persona.");
  if (!aplicarOficio && modoObras === "conservar") throw new Error("No hay cambios para aplicar.");

  const { data, error } = await supabase.rpc("rrhh_guardar_fichas_operativas", {
    p_empleado_ids: empleados,
    p_aplicar_oficio: !!aplicarOficio,
    p_oficio_id: aplicarOficio ? oficioId || null : null,
    p_obra_ids: obras,
    p_modo_obras: modoObras,
  });
  if (!error) return data;

  const message = String(error.message || "").toLowerCase();
  const missingRpc = error.code === "PGRST202" || message.includes("rrhh_guardar_fichas_operativas");
  if (!missingRpc) throw error;

  const [employeeResult, assignmentResult] = await Promise.all([
    supabase.from("rrhh_empleados").select("id, oficio_id").in("id", empleados),
    supabase.from("rrhh_empleado_obras").select("empleado_id, obra_id").in("empleado_id", empleados).is("hasta", null),
  ]);
  if (employeeResult.error) throw employeeResult.error;
  if (assignmentResult.error) throw assignmentResult.error;

  const employeeById = new Map((employeeResult.data || []).map((row) => [row.id, row]));
  const worksByEmployee = new Map();
  (assignmentResult.data || []).forEach((row) => {
    if (!worksByEmployee.has(row.empleado_id)) worksByEmployee.set(row.empleado_id, new Set());
    worksByEmployee.get(row.empleado_id).add(row.obra_id);
  });

  const jobs = empleados.map((empleadoId) => {
    const actuales = worksByEmployee.get(empleadoId) || new Set();
    const siguientes = modoObras === "reemplazar"
      ? obras
      : modoObras === "agregar"
        ? [...new Set([...actuales, ...obras])]
        : [...actuales];
    return () => guardarFichaOperativaEmpleado({
      empleadoId,
      oficioId: aplicarOficio ? oficioId || null : employeeById.get(empleadoId)?.oficio_id || null,
      obraIds: siguientes,
    });
  });

  for (let index = 0; index < jobs.length; index += 12) {
    await Promise.all(jobs.slice(index, index + 12).map((job) => job()));
  }
  return { ok: true, empleados: empleados.length, fallback: true };
}

export async function asignarEmpleadoAObra({ empleadoId, obraId, oficioId = null, notas = null }) {
  if (!empleadoId || !obraId) throw new Error("Faltan el empleado o la obra.");
  const { data, error } = await supabase
    .from("rrhh_empleado_obras")
    .insert({ empleado_id: empleadoId, obra_id: obraId, oficio_id: oficioId, notas })
    .select("id, empleado_id, obra_id, oficio_id, desde, hasta")
    .single();
  if (error) {
    // El índice único deja una sola asignación vigente por empleado y obra.
    if (String(error.code) === "23505") {
      throw new Error("Ese empleado ya está asignado a esa obra.");
    }
    throw error;
  }
  return data;
}

/** Cierra la asignación en vez de borrarla: el historial es el que después
 *  permite saber quién estaba en qué obra el mes pasado. */
export async function cerrarAsignacion(id, hasta = null) {
  if (!id) return;
  const fecha = hasta || new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("rrhh_empleado_obras")
    .update({ hasta: fecha })
    .eq("id", id);
  if (error) throw error;
}

/** Veredicto del retiro. Devuelve [{ material_id, estado, motivo }].
 *  estado: ok | otra_obra | otro_oficio | sin_datos. No bloquea nada. */
export async function evaluarRetiro(empleadoId, materialIds = []) {
  const ids = [...new Set(materialIds.filter(Boolean))];
  if (!empleadoId || !ids.length) return [];
  const { data, error } = await supabase.rpc("panol_evaluar_retiro", {
    p_empleado_id: empleadoId,
    p_material_ids: ids,
  });
  if (error) {
    // Si la migración todavía no se aplicó, no romper el egreso.
    if (String(error.message || "").includes("panol_evaluar_retiro")) return [];
    throw error;
  }
  return data ?? [];
}
