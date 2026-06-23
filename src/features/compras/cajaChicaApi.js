import { supabase } from "@/supabaseClient";

const TABLE = "purchase_cashbox_entries";

function isMissingTable(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return error?.code === "42P01" || msg.includes(TABLE) || msg.includes("schema cache");
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
  };
}

export async function fetchCajaChicaEntries({ limit = 600 } = {}) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTable(error)) return { rows: [], missingTable: true };
    throw error;
  }

  return { rows: data || [], missingTable: false };
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
