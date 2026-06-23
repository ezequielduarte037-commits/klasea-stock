import { supabase } from "@/supabaseClient";

const TABLE = "purchase_cashbox_entries";
const CLOSURES_TABLE = "purchase_cashbox_closures";

function isMissingTable(error, table = TABLE) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return error?.code === "42P01" || msg.includes(table) || msg.includes("schema cache");
}

function cleanText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeEntry(entry = {}) {
  const tipo = entry.tipo === "ingreso" ? "ingreso" : "egreso";
  const importe = Number(entry.importe || 0);
  return {
    fecha: entry.fecha || new Date().toISOString().slice(0, 10),
    proveedor: cleanText(entry.proveedor),
    detalle: cleanText(entry.detalle) || "(sin detalle)",
    centro_costo: cleanText(entry.centro_costo),
    tipo,
    importe: Number.isFinite(importe) ? importe : 0,
    moneda: entry.moneda === "USD" ? "USD" : "ARS",
    notas: cleanText(entry.notas),
    cierre_id: entry.cierre_id || null,
  };
}

function normalizeClosure(cierre = {}) {
  return {
    nombre: cleanText(cierre.nombre) || "Cierre caja chica",
    fecha_desde: cierre.fecha_desde || null,
    fecha_hasta: cierre.fecha_hasta || null,
    estado: cierre.estado === "cerrado" ? "cerrado" : "abierto",
    notas: cleanText(cierre.notas),
  };
}

export async function fetchCajaChicaClosures({ limit = 80 } = {}) {
  const { data, error } = await supabase
    .from(CLOSURES_TABLE)
    .select("*")
    .order("fecha_desde", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTable(error, CLOSURES_TABLE)) return { rows: [], missingTable: true };
    throw error;
  }

  return { rows: data || [], missingTable: false };
}

export async function fetchCajaChicaEntries({ limit = 600, cierreId = null } = {}) {
  let query = supabase
    .from(TABLE)
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cierreId) query = query.eq("cierre_id", cierreId);

  const { data, error } = await query;

  if (error) {
    if (isMissingTable(error)) return { rows: [], missingTable: true };
    throw error;
  }

  return { rows: data || [], missingTable: false };
}

export async function createCajaChicaClosure(cierre) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const userId = sessionData?.session?.user?.id || null;
  const { data, error } = await supabase
    .from(CLOSURES_TABLE)
    .insert({ ...normalizeClosure(cierre), created_by: userId })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateCajaChicaClosure(id, patch) {
  const { data, error } = await supabase
    .from(CLOSURES_TABLE)
    .update(normalizeClosure(patch))
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function createCajaChicaEntry(entry) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const userId = sessionData?.session?.user?.id || null;
  const payload = {
    ...normalizeEntry(entry),
    created_by: userId,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function createCajaChicaEntries(entries = []) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const userId = sessionData?.session?.user?.id || null;
  const payload = entries
    .map((entry) => ({ ...normalizeEntry(entry), created_by: userId }))
    .filter((entry) => entry.importe > 0 && entry.detalle);

  if (!payload.length) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select("*");

  if (error) throw error;
  return data || [];
}

export async function deleteCajaChicaEntry(id) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id);

  if (error) throw error;
}
