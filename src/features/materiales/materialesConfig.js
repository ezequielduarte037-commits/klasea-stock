// Multi-área (un material en varias áreas) + variantes/configurador
// (Motorización, Motor, Grupo electrógeno) + condición por material.
// TODO tolerante: si las tablas nuevas todavía no existen en Supabase, las
// funciones devuelven vacío / no hacen nada, así el módulo sigue andando hasta
// que se corra el SQL.
import { supabase } from "@/supabaseClient";

const PAGE = 1000;

// Local (evita import circular con api.js, que importa este archivo).
function isMissingTable(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return error.code === "42P01" || msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("not found");
}

async function pagedSafe(table, select, orderColumn) {
  const out = [];
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from(table).select(select).order(orderColumn).range(from, from + PAGE - 1);
      if (error) { if (isMissingTable(error)) return { ok: false, rows: [] }; throw error; }
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
  } catch (e) {
    if (isMissingTable(e)) return { ok: false, rows: [] };
    throw e;
  }
  return { ok: true, rows: out };
}

// ── Áreas (M2M material ↔ categoría) ────────────────────────────────────────
// Devuelve { ok, map: Map(materialId -> Set(categoriaId)) }
export async function fetchAreasMap() {
  const { ok, rows } = await pagedSafe("panol_material_categorias", "material_id, categoria_id", "material_id");
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.material_id)) map.set(r.material_id, new Set());
    map.get(r.material_id).add(r.categoria_id);
  }
  return { ok, map };
}

export async function setMaterialAreas(materialId, categoriaIds) {
  // Reemplaza el set de áreas extra del material (la categoría principal queda en panol_materiales.categoria_id).
  const { error: delErr } = await supabase.from("panol_material_categorias").delete().eq("material_id", materialId);
  if (delErr) throw delErr;
  const rows = [...new Set(categoriaIds)].filter(Boolean).map((categoria_id) => ({ material_id: materialId, categoria_id }));
  if (rows.length) {
    const { error } = await supabase.from("panol_material_categorias").insert(rows);
    if (error) throw error;
  }
}

// ── Opciones de configuración (dimensiones + valores) ────────────────────────
// Devuelve [{ id, nombre, orden, valores: [{id, valor, orden}] }]
export async function fetchOpciones() {
  const ops = await pagedSafe("panol_opciones", "id, nombre, orden", "orden");
  if (!ops.ok) return { ok: false, opciones: [] };
  const vals = await pagedSafe("panol_opcion_valores", "id, opcion_id, valor, orden", "orden");
  const byOpcion = new Map();
  for (const v of vals.rows) {
    if (!byOpcion.has(v.opcion_id)) byOpcion.set(v.opcion_id, []);
    byOpcion.get(v.opcion_id).push(v);
  }
  const opciones = ops.rows
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, "es"))
    .map((o) => ({ ...o, valores: (byOpcion.get(o.id) ?? []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)) }));
  return { ok: true, opciones };
}

export async function crearOpcion(nombre, orden = 0) {
  const { error } = await supabase.from("panol_opciones").insert({ nombre: nombre.trim(), orden });
  if (error) throw error;
}
export async function crearValor(opcionId, valor, orden = 0) {
  const { error } = await supabase.from("panol_opcion_valores").insert({ opcion_id: opcionId, valor: valor.trim(), orden });
  if (error) throw error;
}
export async function borrarValor(id) {
  const { error } = await supabase.from("panol_opcion_valores").delete().eq("id", id);
  if (error) throw error;
}
export async function borrarOpcion(id) {
  const { error } = await supabase.from("panol_opciones").delete().eq("id", id);
  if (error) throw error;
}

// ── Condición por material (null = aplica siempre) ───────────────────────────
// Devuelve { ok, map: Map(materialId -> opcion_valor_id) }
export async function fetchCondicionMap() {
  const { ok, rows } = await pagedSafe("panol_material_condicion", "material_id, opcion_valor_id", "material_id");
  return { ok, map: new Map(rows.map((r) => [r.material_id, r.opcion_valor_id])) };
}

export async function setMaterialCondicion(materialId, opcionValorId) {
  if (!opcionValorId) {
    const { error } = await supabase.from("panol_material_condicion").delete().eq("material_id", materialId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("panol_material_condicion")
    .upsert({ material_id: materialId, opcion_valor_id: opcionValorId }, { onConflict: "material_id" });
  if (error) throw error;
}
