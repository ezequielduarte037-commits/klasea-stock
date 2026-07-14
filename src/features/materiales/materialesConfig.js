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

function isMissingColumn(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return error.code === "42703" || msg.includes("could not find") || msg.includes("column");
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

// ── Proveedores alternativos por material (cada uno con su precio) ───────────
// El proveedor principal vive en panol_materiales; acá van las alternativas.
// Tolerante: {} si la tabla aún no existe.
export async function fetchProveedoresMaterialMap() {
  const { ok, rows } = await pagedSafe("panol_material_proveedores", "material_id, proveedor_id, precio, moneda", "material_id");
  const proveedorIds = [...new Set(rows.map((row) => row.proveedor_id).filter(Boolean))];
  const proveedorById = new Map();
  if (proveedorIds.length) {
    try {
      const { data, error } = await supabase
        .from("panol_proveedores")
        .select("id, nombre, tipo, rubros, sede, perfil, compite_con")
        .in("id", proveedorIds);
      if (error) throw error;
      for (const proveedor of data ?? []) proveedorById.set(proveedor.id, proveedor);
    } catch (error) {
      if (!isMissingTable(error) && !isMissingColumn(error)) throw error;
    }
  }
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.material_id)) map.set(r.material_id, []);
    const proveedor = proveedorById.get(r.proveedor_id) || null;
    map.get(r.material_id).push({
      proveedor_id: r.proveedor_id,
      precio: r.precio,
      moneda: r.moneda,
      proveedor,
      tipo: proveedor?.tipo || null,
      rubros: proveedor?.rubros || null,
      sede: proveedor?.sede || null,
      perfil: proveedor?.perfil || null,
      compite_con: proveedor?.compite_con || null,
    });
  }
  return { ok, map };
}

export async function setProveedoresMaterial(materialId, lista) {
  const { error: delErr } = await supabase.from("panol_material_proveedores").delete().eq("material_id", materialId);
  if (delErr) throw delErr;
  const seen = new Set();
  const rows = (lista || [])
    .filter((p) => p.proveedor_id && !seen.has(p.proveedor_id) && seen.add(p.proveedor_id))
    .map((p) => ({ material_id: materialId, proveedor_id: p.proveedor_id, precio: p.precio === "" || p.precio == null ? null : Number(p.precio), moneda: p.moneda || null }));
  if (rows.length) {
    const { error } = await supabase.from("panol_material_proveedores").insert(rows);
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

export async function fetchMatrizCondicionantes() {
  const cond = await pagedSafe(
    "panol_matriz_condicionantes",
    "id, modelo, nombre, tipo, descripcion, activo_por_defecto, activo, orden, created_at, updated_at",
    "orden",
  );
  if (!cond.ok) return { ok: false, condicionantes: [] };
  const itemsRes = await pagedSafe(
    "panol_matriz_condicionante_items",
    "id, condicionante_id, material_id, descripcion, cantidad, unidad, tipo_item, notas, activo, orden, created_at, updated_at",
    "orden",
  );
  const materialIds = [...new Set(itemsRes.rows.map((item) => item.material_id).filter(Boolean))];
  const materialById = new Map();
  if (materialIds.length) {
    try {
      const { data, error } = await supabase
        .from("panol_materiales")
        .select("id, descripcion, codigo, unidad_medida, proveedor")
        .in("id", materialIds);
      if (error) throw error;
      for (const material of data ?? []) materialById.set(material.id, material);
    } catch (error) {
      if (!isMissingTable(error) && !isMissingColumn(error)) throw error;
    }
  }
  const byCond = new Map();
  for (const item of itemsRes.rows) {
    if (!byCond.has(item.condicionante_id)) byCond.set(item.condicionante_id, []);
    byCond.get(item.condicionante_id).push({
      ...item,
      material: item.material_id ? materialById.get(item.material_id) || null : null,
    });
  }
  const condicionantes = cond.rows
    .sort((a, b) => String(a.modelo).localeCompare(String(b.modelo), "es", { numeric: true }) || (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, "es"))
    .map((row) => ({ ...row, items: byCond.get(row.id) ?? [] }));
  return { ok: true, condicionantes };
}

export async function crearMatrizCondicionante(payload) {
  const row = {
    modelo: String(payload.modelo || "").replace(/^K/i, "").trim(),
    nombre: String(payload.nombre || "").trim(),
    tipo: payload.tipo || "opcional_estandar",
    descripcion: String(payload.descripcion || "").trim() || null,
    activo_por_defecto: payload.activo_por_defecto ?? true,
    orden: payload.orden ?? 0,
  };
  if (!row.modelo) throw new Error("Elegí una línea/modelo.");
  if (!row.nombre) throw new Error("El nombre del condicionante es obligatorio.");
  const { error } = await supabase
    .from("panol_matriz_condicionantes")
    .upsert(row, { onConflict: "modelo,nombre" });
  if (error) throw error;
}

export async function actualizarMatrizCondicionante(id, patch) {
  const clean = {};
  for (const key of ["modelo", "nombre", "tipo", "descripcion", "activo_por_defecto", "activo", "orden"]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) clean[key] = patch[key];
  }
  if (Object.prototype.hasOwnProperty.call(clean, "modelo")) clean.modelo = String(clean.modelo || "").replace(/^K/i, "").trim();
  if (Object.prototype.hasOwnProperty.call(clean, "nombre")) clean.nombre = String(clean.nombre || "").trim();
  if (Object.prototype.hasOwnProperty.call(clean, "descripcion")) clean.descripcion = String(clean.descripcion || "").trim() || null;
  clean.updated_at = new Date().toISOString();
  const { error } = await supabase.from("panol_matriz_condicionantes").update(clean).eq("id", id);
  if (error) throw error;
}

export async function borrarMatrizCondicionante(id) {
  const { error } = await supabase.from("panol_matriz_condicionantes").delete().eq("id", id);
  if (error) throw error;
}

export async function agregarMatrizCondicionanteItem(payload) {
  const row = {
    condicionante_id: payload.condicionante_id,
    material_id: payload.material_id || null,
    descripcion: String(payload.descripcion || "").trim(),
    cantidad: payload.cantidad === "" || payload.cantidad == null ? null : Number(String(payload.cantidad).replace(",", ".")),
    unidad: String(payload.unidad || "").trim() || null,
    tipo_item: payload.tipo_item || "matriz",
    notas: String(payload.notas || "").trim() || null,
    orden: payload.orden ?? 0,
  };
  if (!row.condicionante_id) throw new Error("Falta el condicionante.");
  if (!row.descripcion) throw new Error("La descripción del ítem es obligatoria.");
  if (row.cantidad != null && !Number.isFinite(row.cantidad)) throw new Error("Cantidad inválida.");
  const { error } = await supabase.from("panol_matriz_condicionante_items").insert(row);
  if (error) throw error;
}

export async function borrarMatrizCondicionanteItem(id) {
  const { error } = await supabase.from("panol_matriz_condicionante_items").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchObraMatrizCondicionantes(obraId) {
  if (!obraId) return { ok: true, map: new Map(), rows: [] };
  const { ok, rows } = await pagedSafe(
    "panol_obra_matriz_condicionantes",
    "obra_id, condicionante_id, activo, notas, created_at, updated_at",
    "condicionante_id",
  );
  const filtered = rows.filter((row) => row.obra_id === obraId);
  return {
    ok,
    rows: filtered,
    map: new Map(filtered.map((row) => [row.condicionante_id, row])),
  };
}

export async function setObraMatrizCondicionante(obraId, condicionanteId, activo, notas = null) {
  if (!obraId || !condicionanteId) throw new Error("Falta obra o condicionante.");
  const { error } = await supabase
    .from("panol_obra_matriz_condicionantes")
    .upsert({
      obra_id: obraId,
      condicionante_id: condicionanteId,
      activo: !!activo,
      notas,
      updated_at: new Date().toISOString(),
    }, { onConflict: "obra_id,condicionante_id" });
  if (error) throw error;
}
