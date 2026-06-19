import { supabase } from "@/supabaseClient";

const PRODUCT_SELECT = "id,codigo,nombre,unidad,categoria,aliases,activo,created_at,updated_at";

async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data?.session) throw new Error("No autenticado.");
  return data.session;
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanAliases(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((alias) => String(alias ?? "").trim())
      .filter(Boolean),
  )];
}

function productPayload(fields = {}) {
  const payload = {};
  if ("nombre" in fields) {
    const nombre = cleanText(fields.nombre);
    if (!nombre) throw new Error("El nombre del producto es obligatorio.");
    payload.nombre = nombre;
  }
  if ("codigo" in fields) payload.codigo = cleanText(fields.codigo);
  if ("unidad" in fields) payload.unidad = cleanText(fields.unidad) || "unidad";
  if ("categoria" in fields) payload.categoria = cleanText(fields.categoria);
  if ("aliases" in fields) payload.aliases = cleanAliases(fields.aliases);
  if ("activo" in fields) payload.activo = Boolean(fields.activo);
  return payload;
}

function escapeIlike(value) {
  return String(value).replace(/[%_]/g, "\\$&");
}

export async function buscarProductos(q) {
  await requireSession();
  const term = String(q ?? "").trim();
  if (!term) return [];
  const { data, error } = await supabase.rpc("productos_buscar", { p_q: term });
  if (error) throw error;
  return data ?? [];
}

export async function crearProducto({ nombre, codigo = null, unidad = "unidad", categoria = null, aliases = [] } = {}) {
  await requireSession();
  const payload = productPayload({ nombre, codigo, unidad, categoria, aliases, activo: true });
  const { data, error } = await supabase
    .from("productos")
    .insert(payload)
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function listarProductos({ q = "", activo = true } = {}) {
  await requireSession();
  const term = String(q ?? "").trim();

  let query = supabase
    .from("productos")
    .select(PRODUCT_SELECT)
    .order("nombre", { ascending: true })
    .limit(200);

  if (typeof activo === "boolean") query = query.eq("activo", activo);
  if (term) {
    const escaped = escapeIlike(term);
    query = query.or(`nombre.ilike.%${escaped}%,codigo.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function actualizarProducto(id, patch = {}) {
  await requireSession();
  if (!id) throw new Error("Falta el producto a actualizar.");
  const payload = productPayload(patch);
  const { data, error } = await supabase
    .from("productos")
    .update(payload)
    .eq("id", id)
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function fusionarProductos(idSobrevive, idsAbsorbidos = []) {
  await requireSession();
  if (!idSobrevive) throw new Error("Falta el producto que sobrevive.");
  const absorbidos = [...new Set(idsAbsorbidos.filter((id) => id && id !== idSobrevive))];
  if (!absorbidos.length) return null;

  const { data, error } = await supabase.rpc("productos_fusionar", {
    p_id_sobrevive: idSobrevive,
    p_ids_absorbidos: absorbidos,
  });
  if (error) throw error;
  return data ?? null;
}
