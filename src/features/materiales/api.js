import { supabase } from "@/supabaseClient";
import { MODELOS, norm } from "./materialesParser";
import { fetchAreasMap, fetchCondicionMap, fetchProveedoresMaterialMap } from "./materialesConfig";

const PAGE = 1000;
const VARIANTE_BASE = "standard";
const BUCKET_COMPROBANTES = "panol-comprobantes";
const BUCKET_MATERIALES = "panol-materiales";

export function isMissingTable(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return error.code === "42P01" || msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("not found");
}

async function fetchPaged(table, select, orderColumn = "id") {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderColumn)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function safeFilePart(value) {
  return String(value || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
}

function toNullableNumber(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function precioVigente(material) {
  return material?.ultimo_precio ?? (
    material?.precio_unitario != null
      ? {
          precio_unitario: material.precio_unitario,
          moneda: material.moneda,
          fecha: null,
          proveedor: material.proveedor,
          proveedor_id: material.proveedor_id,
          fuente: "catalogo",
        }
      : null
  );
}

export function precioDesactualizado(material) {
  const precio = precioVigente(material);
  if (!precio?.precio_unitario) return true;
  if (!precio.fecha) return true;
  const date = new Date(precio.fecha);
  if (Number.isNaN(date.getTime())) return true;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return date < sixMonthsAgo;
}

export async function fetchCategorias() {
  // parent_id permite subdivisiones (sector padre → subsectores). Puede no existir
  // todavía la columna: si falla, reintentamos sin ella para no romper la pantalla.
  let { data, error } = await supabase
    .from("panol_categorias")
    .select("id, nombre, orden, parent_id")
    .order("orden", { ascending: true, nullsFirst: false })
    .order("nombre");
  if (error && String(error.message || "").includes("parent_id")) {
    const retry = await supabase
      .from("panol_categorias")
      .select("id, nombre, orden")
      .order("orden", { ascending: true, nullsFirst: false })
      .order("nombre");
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  return (data ?? []).map((c) => ({ ...c, parent_id: c.parent_id ?? null }));
}

// Crea un sector (parentId null) o subsector (parentId = id del padre).
export async function crearCategoria(nombre, { parentId = null, orden = 0 } = {}) {
  const { data, error } = await supabase
    .from("panol_categorias")
    .insert({ nombre: nombre.trim(), parent_id: parentId, orden })
    .select("id, nombre, orden, parent_id")
    .single();
  if (error) throw error;
  return data;
}

export async function renombrarCategoria(id, nombre) {
  const { error } = await supabase.from("panol_categorias").update({ nombre: nombre.trim() }).eq("id", id);
  if (error) throw error;
}

// Borra un subsector y reasigna sus materiales al sector padre (no se pierden).
export async function borrarSubsector(id, parentId) {
  if (parentId) {
    await supabase.from("panol_materiales").update({ categoria_id: parentId }).eq("categoria_id", id);
    await supabase.from("panol_material_categorias").update({ categoria_id: parentId }).eq("categoria_id", id);
  }
  const { error } = await supabase.from("panol_categorias").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchBatches() {
  const { data, error } = await supabase
    .from("panol_import_batches")
    .select("id, filename, stats, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function fetchProveedores() {
  const { data, error } = await supabase
    .from("panol_proveedores")
    .select("id, nombre, cuit, email, telefono, notas, activo")
    .order("nombre");
  if (error) throw error;
  return data ?? [];
}

export async function fetchComprobantes() {
  const comprobantes = await fetchPaged(
    "panol_comprobantes",
    "id, proveedor_id, proveedor, numero, fecha, moneda, archivo_url, estado, total, created_at",
    "created_at",
  );
  const items = await fetchPaged(
    "panol_comprobante_items",
    "id, comprobante_id, material_id, descripcion, cantidad, precio_unitario, total, aplicado",
    "id",
  );
  const itemsByComprobante = new Map();
  for (const item of items) {
    const list = itemsByComprobante.get(item.comprobante_id) ?? [];
    list.push(item);
    itemsByComprobante.set(item.comprobante_id, list);
  }
  return comprobantes
    .map((c) => ({ ...c, items: itemsByComprobante.get(c.id) ?? [] }))
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

export async function fetchCatalogo() {
  const [categorias, materiales, modelos, batches, precios, imagenes, proveedores, comprobantes, areasRes, condRes, provMatRes] = await Promise.all([
    fetchCategorias(),
    fetchPaged("panol_materiales", "id, categoria_id, proveedor_id, codigo, descripcion, proveedor, unidad_medida, precio_unitario, moneda, imagen_url, revisado, origen, notas, activo, batch_id, created_at", "descripcion"),
    fetchPaged("panol_material_modelo", "id, material_id, modelo, cantidad, variante", "id"),
    fetchBatches(),
    fetchPaged("panol_precios", "id, material_id, proveedor_id, proveedor, precio_unitario, moneda, fuente, comprobante_id, fecha, created_at", "created_at"),
    fetchPaged("panol_material_imagenes", "id, material_id, url, nombre, created_at", "created_at"),
    fetchProveedores(),
    fetchComprobantes(),
    fetchAreasMap(),                 // tolerante: {} si la tabla aún no existe
    fetchCondicionMap(),             // tolerante
    fetchProveedoresMaterialMap(),   // tolerante: proveedores alternativos por material
  ]);

  const modelosByMaterial = new Map();
  for (const row of modelos) {
    if (!MODELOS.includes(String(row.modelo))) continue;
    const list = modelosByMaterial.get(row.material_id) ?? [];
    list.push(row);
    modelosByMaterial.set(row.material_id, list);
  }
  const preciosByMaterial = new Map();
  for (const row of precios) {
    const list = preciosByMaterial.get(row.material_id) ?? [];
    list.push(row);
    preciosByMaterial.set(row.material_id, list);
  }
  for (const list of preciosByMaterial.values()) {
    list.sort((a, b) => String(b.fecha ?? b.created_at ?? "").localeCompare(String(a.fecha ?? a.created_at ?? "")));
  }
  const imagenesByMaterial = new Map();
  for (const row of imagenes) {
    const list = imagenesByMaterial.get(row.material_id) ?? [];
    list.push(row);
    imagenesByMaterial.set(row.material_id, list);
  }
  for (const list of imagenesByMaterial.values()) {
    list.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  }

  return {
    categorias,
    materiales: materiales.map((m) => {
      const historial = preciosByMaterial.get(m.id) ?? [];
      const imgs = imagenesByMaterial.get(m.id) ?? [];
      // Áreas = categoría principal + las extra de la M2M (un mismo ítem en varias áreas).
      const extra = areasRes.map.get(m.id);
      const areas = [...new Set([m.categoria_id, ...(extra ? [...extra] : [])].filter(Boolean))];
      return {
        ...m,
        modelos: modelosByMaterial.get(m.id) ?? [],
        precio_historial: historial,
        ultimo_precio: historial[0] ?? null,
        imagenes: imgs,
        imagen_url: m.imagen_url || imgs[0]?.url || null,
        areas,
        proveedores_lista: provMatRes.map.get(m.id) ?? [],
        condicion_valor_id: condRes.map.get(m.id) ?? null,
      };
    }),
    batches,
    proveedores,
    comprobantes,
  };
}

function modeloFromObraCodigo(codigo) {
  const prefix = String(codigo ?? "").trim().split("-")[0]?.replace(/^K/i, "");
  return MODELOS.includes(prefix) ? prefix : null;
}

function normalizeObraAvance(row) {
  const modelo = MODELOS.includes(String(row?.modelo ?? "")) ? String(row.modelo) : modeloFromObraCodigo(row?.codigo);
  return { ...row, modelo };
}

function isMissingModeloColumn(error) {
  const msg = String(error?.message ?? "").toLowerCase();
  return error?.code === "42703" || msg.includes("modelo") || (msg.includes("column") && msg.includes("produccion_obras"));
}

async function fetchProduccionObras(select, onlyActive = true) {
  let query = supabase
    .from("produccion_obras")
    .select(select)
    .order("codigo", { ascending: true });
  if (onlyActive) query = query.eq("estado", "activa");
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchObrasAvance() {
  try {
    let rows;
    try {
      rows = await fetchProduccionObras("id, codigo, estado, linea_nombre, modelo", true);
    } catch (error) {
      if (!isMissingModeloColumn(error)) throw error;
      rows = await fetchProduccionObras("id, codigo, estado, linea_nombre", true);
    }

    if (!rows.length) {
      try {
        rows = await fetchProduccionObras("id, codigo, estado, linea_nombre, modelo", false);
      } catch (error) {
        if (!isMissingModeloColumn(error)) throw error;
        rows = await fetchProduccionObras("id, codigo, estado, linea_nombre", false);
      }
    }

    return rows.map(normalizeObraAvance);
  } catch (error) {
    if (isMissingTable(error)) return [];
    return [];
  }
}

export async function cosecharCandidatos() {
  const { data, error } = await supabase.rpc("panol_cosechar_candidatos");
  if (error) throw error;
  return data ?? 0;
}

export async function fetchCandidatos({ estado = "pendiente" } = {}) {
  try {
    let query = supabase
      .from("panol_material_candidatos")
      .select("*")
      .order("created_at", { ascending: false });
    if (estado) query = query.eq("estado", estado);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

export async function promoverCandidato(id, accion, { materialId = null, categoriaId = null } = {}) {
  const { data, error } = await supabase.rpc("panol_promover_candidato", {
    p_id: id,
    p_accion: accion,
    p_material_id: materialId,
    p_categoria_id: categoriaId,
  });
  if (error) throw error;
  return data ?? null;
}

async function ensureCategorias(parsed) {
  let categorias = await fetchCategorias();
  const byName = new Map(categorias.map((c) => [norm(c.nombre), c]));
  const missing = [];

  for (const sector of parsed.sectores) {
    if (!byName.has(norm(sector.sector.nombre))) {
      missing.push({ nombre: sector.sector.nombre, orden: sector.sector.orden });
    }
  }

  if (missing.length) {
    const { error } = await supabase.from("panol_categorias").insert(missing);
    if (error) throw error;
    categorias = await fetchCategorias();
  }

  return new Map(categorias.map((c) => [norm(c.nombre), c]));
}

function materialPatchFromParsed(item, categoriaId, batchId, existing = null) {
  return {
    categoria_id: categoriaId,
    codigo: existing?.codigo || item.codigo || null,
    descripcion: existing?.descripcion || item.descripcion,
    proveedor_id: existing?.proveedor_id ?? null,
    proveedor: existing?.proveedor || item.proveedor || null,
    unidad_medida: existing?.unidad_medida || item.unidad_medida || null,
    precio_unitario: existing?.precio_unitario ?? item.precio_unitario ?? null,
    moneda: existing?.moneda ?? null,
    revisado: existing?.revisado ?? false,
    origen: existing?.origen || "import",
    notas: existing?.notas ?? null,
    activo: existing?.activo ?? true,
    batch_id: batchId,
  };
}

async function upsertModelos(materialId, cantidades) {
  const rows = [];
  for (const modelo of MODELOS) {
    const cantidad = cantidades?.[modelo];
    if (typeof cantidad === "number" && Number.isFinite(cantidad) && cantidad > 0) {
      rows.push({ material_id: materialId, modelo, variante: VARIANTE_BASE, cantidad });
    }
  }
  if (!rows.length) return 0;
  const { error } = await supabase
    .from("panol_material_modelo")
    .upsert(rows, { onConflict: "material_id,modelo,variante" });
  if (error) throw error;
  return rows.length;
}

export async function importarCatalogo(parsed, filename) {
  const categoriaByName = await ensureCategorias(parsed);

  const { data: batch, error: batchError } = await supabase
    .from("panol_import_batches")
    .insert({ filename, stats: parsed.stats })
    .select("id")
    .single();
  if (batchError) throw batchError;

  const categorias = [...categoriaByName.values()];
  const categoriaIds = new Set(categorias.map((c) => c.id));
  const existentes = await fetchPaged("panol_materiales", "id, categoria_id, codigo, descripcion, proveedor, unidad_medida, precio_unitario, moneda, revisado, origen, notas, activo", "descripcion");
  const existingBySectorAndDesc = new Map();
  for (const material of existentes) {
    if (!categoriaIds.has(material.categoria_id)) continue;
    existingBySectorAndDesc.set(`${material.categoria_id}::${norm(material.descripcion)}`, material);
  }

  const stats = {
    ...parsed.stats,
    creados: 0,
    actualizados: 0,
    cantidades_upsert: 0,
  };

  for (const sector of parsed.sectores) {
    const categoria = categoriaByName.get(norm(sector.sector.nombre));
    if (!categoria) continue;

    for (const item of sector.materiales) {
      const key = `${categoria.id}::${norm(item.descripcion)}`;
      const existing = existingBySectorAndDesc.get(key);
      let materialId = existing?.id;

      if (existing) {
        const { error } = await supabase
          .from("panol_materiales")
          .update(materialPatchFromParsed(item, categoria.id, batch.id, existing))
          .eq("id", existing.id);
        if (error) throw error;
        stats.actualizados += 1;
      } else {
        const { data, error } = await supabase
          .from("panol_materiales")
          .insert(materialPatchFromParsed(item, categoria.id, batch.id))
          .select("id, categoria_id, codigo, descripcion, proveedor, unidad_medida, precio_unitario, moneda, revisado, origen, notas, activo")
          .single();
        if (error) throw error;
        materialId = data.id;
        existingBySectorAndDesc.set(key, data);
        stats.creados += 1;
      }

      stats.cantidades_upsert += await upsertModelos(materialId, item.cantidades);
    }
  }

  await supabase.from("panol_import_batches").update({ stats }).eq("id", batch.id);
  return stats;
}

export async function guardarMaterial(material, cantidades, { revisado } = {}) {
  const patch = {
    categoria_id: material.categoria_id,
    proveedor_id: material.proveedor_id || null,
    codigo: material.codigo || null,
    descripcion: material.descripcion?.trim(),
    proveedor: material.proveedor || null,
    unidad_medida: material.unidad_medida || null,
    precio_unitario: toNullableNumber(material.precio_unitario),
    moneda: material.moneda || null,
    imagen_url: material.imagen_url || null,
    notas: material.notas || null,
    activo: material.activo ?? true,
  };
  if (revisado != null) patch.revisado = revisado;

  const { error } = await supabase.from("panol_materiales").update(patch).eq("id", material.id);
  if (error) throw error;
  await guardarCantidades(material.id, cantidades);
}

export async function crearMaterial(material, cantidades = {}) {
  const { data, error } = await supabase
    .from("panol_materiales")
    .insert({
      categoria_id: material.categoria_id,
      proveedor_id: material.proveedor_id || null,
      codigo: material.codigo || null,
      descripcion: material.descripcion?.trim(),
      proveedor: material.proveedor || null,
      unidad_medida: material.unidad_medida || null,
      precio_unitario: toNullableNumber(material.precio_unitario),
      moneda: material.moneda || null,
      imagen_url: material.imagen_url || null,
      origen: "manual",
      revisado: material.revisado ?? true,
      activo: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  await guardarCantidades(data.id, cantidades);
  return data.id;
}

export async function guardarCantidades(materialId, cantidades = {}) {
  const rows = [];
  const toDelete = [];
  for (const modelo of MODELOS) {
    const raw = cantidades[modelo];
    const n = raw === "" || raw == null ? null : Number(raw);
    if (n != null && Number.isFinite(n) && n > 0) {
      rows.push({ material_id: materialId, modelo, variante: VARIANTE_BASE, cantidad: n });
    } else {
      toDelete.push(modelo);
    }
  }

  if (rows.length) {
    const { error } = await supabase
      .from("panol_material_modelo")
      .upsert(rows, { onConflict: "material_id,modelo,variante" });
    if (error) throw error;
  }

  for (const modelo of toDelete) {
    const { error } = await supabase
      .from("panol_material_modelo")
      .delete()
      .eq("material_id", materialId)
      .eq("modelo", modelo)
      .eq("variante", VARIANTE_BASE);
    if (error) throw error;
  }
}

// Sincroniza los sectores de un material: el primero es el principal (panol_materiales.categoria_id);
// los demás van como "extra" en la M2M panol_material_categorias (de ahí sale m.areas → multi-sector).
export async function setSectoresMaterial(materialId, ids) {
  if (!materialId) return;
  const limpios = [...new Set((ids || []).filter(Boolean))];
  const principal = limpios[0] ?? null;
  await supabase.from("panol_materiales").update({ categoria_id: principal }).eq("id", materialId);
  await supabase.from("panol_material_categorias").delete().eq("material_id", materialId);
  const extra = limpios.slice(1).map((categoria_id) => ({ material_id: materialId, categoria_id }));
  if (extra.length) await supabase.from("panol_material_categorias").insert(extra);
}

export async function borrarMaterial(materialId) {
  const { error: bomError } = await supabase.from("panol_material_modelo").delete().eq("material_id", materialId);
  if (bomError) throw bomError;
  const { error } = await supabase.from("panol_materiales").delete().eq("id", materialId);
  if (error) throw error;
}

export async function guardarProveedor(proveedor) {
  const patch = {
    nombre: proveedor.nombre?.trim(),
    cuit: proveedor.cuit || null,
    email: proveedor.email || null,
    telefono: proveedor.telefono || null,
    notas: proveedor.notas || null,
    activo: proveedor.activo ?? true,
  };
  if (!patch.nombre) throw new Error("El nombre del proveedor es obligatorio.");
  if (proveedor.id) {
    const { error } = await supabase.from("panol_proveedores").update(patch).eq("id", proveedor.id);
    if (error) throw error;
    return proveedor.id;
  }
  const { data, error } = await supabase.from("panol_proveedores").insert(patch).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function bajaProveedor(id) {
  const { error } = await supabase.from("panol_proveedores").update({ activo: false }).eq("id", id);
  if (error) throw error;
}

export async function uploadMaterialImage(materialId, file) {
  if (!materialId || !file) throw new Error("Falta material o archivo.");
  const ext = file.name?.split(".").pop() || "jpg";
  const path = `${materialId}/${Date.now()}-${safeFilePart(file.name || `imagen.${ext}`)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET_MATERIALES).upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;
  const { data: { publicUrl } } = supabase.storage.from(BUCKET_MATERIALES).getPublicUrl(path);
  const { data: row, error: imgError } = await supabase
    .from("panol_material_imagenes")
    .insert({ material_id: materialId, url: publicUrl, nombre: file.name || path })
    .select("id, material_id, url, nombre, created_at")
    .single();
  if (imgError) throw imgError;
  const { error: matError } = await supabase.from("panol_materiales").update({ imagen_url: publicUrl }).eq("id", materialId);
  if (matError) throw matError;
  return row;
}

export async function uploadComprobanteFile(file) {
  if (!file) return null;
  const path = `comprobantes/${Date.now()}-${safeFilePart(file.name || "comprobante")}`;
  const { error } = await supabase.storage.from(BUCKET_COMPROBANTES).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function guardarComprobante(comprobante, file = null) {
  const archivoPath = file ? await uploadComprobanteFile(file) : comprobante.archivo_url || null;
  const patch = {
    proveedor_id: comprobante.proveedor_id || null,
    proveedor: comprobante.proveedor || null,
    numero: comprobante.numero || null,
    fecha: comprobante.fecha || null,
    moneda: comprobante.moneda || "ARS",
    archivo_url: archivoPath,
    estado: comprobante.estado || "borrador",
    total: toNullableNumber(comprobante.total),
  };

  if (comprobante.id) {
    const { data, error } = await supabase
      .from("panol_comprobantes")
      .update(patch)
      .eq("id", comprobante.id)
      .select("id, proveedor_id, proveedor, numero, fecha, moneda, archivo_url, estado, total, created_at")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("panol_comprobantes")
    .insert(patch)
    .select("id, proveedor_id, proveedor, numero, fecha, moneda, archivo_url, estado, total, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function guardarComprobanteItem(item) {
  const patch = {
    comprobante_id: item.comprobante_id,
    material_id: item.material_id || null,
    descripcion: item.descripcion?.trim(),
    cantidad: toNullableNumber(item.cantidad),
    precio_unitario: toNullableNumber(item.precio_unitario),
    total: toNullableNumber(item.total),
    aplicado: item.aplicado ?? false,
  };
  if (!patch.comprobante_id) throw new Error("Primero guardá el comprobante.");
  if (!patch.descripcion) throw new Error("La descripción del ítem es obligatoria.");

  if (item.id) {
    const { data, error } = await supabase
      .from("panol_comprobante_items")
      .update(patch)
      .eq("id", item.id)
      .select("id, comprobante_id, material_id, descripcion, cantidad, precio_unitario, total, aplicado")
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("panol_comprobante_items")
    .insert(patch)
    .select("id, comprobante_id, material_id, descripcion, cantidad, precio_unitario, total, aplicado")
    .single();
  if (error) throw error;
  return data;
}

export async function guardarComprobanteItems(comprobanteId, items = []) {
  const saved = [];
  for (const item of items) {
    saved.push(await guardarComprobanteItem({ ...item, comprobante_id: comprobanteId }));
  }
  return saved;
}

export async function borrarComprobanteItem(id) {
  const { error } = await supabase.from("panol_comprobante_items").delete().eq("id", id);
  if (error) throw error;
}

export async function aplicarPreciosComprobante(comprobante, items) {
  if (!comprobante?.id) throw new Error("Falta comprobante.");
  const fecha = comprobante.fecha || new Date().toISOString().slice(0, 10);
  const usable = (items ?? []).filter((item) => item.material_id && !item.aplicado);
  let actualizados = 0;

  for (const item of usable) {
    const precio = toNullableNumber(item.precio_unitario);
    if (precio == null) continue;

    const proveedorTexto = comprobante.proveedor || null;
    const moneda = comprobante.moneda || "ARS";
    const materialPatch = {
      precio_unitario: precio,
      moneda,
      proveedor: proveedorTexto,
      proveedor_id: comprobante.proveedor_id || null,
    };

    const { error: matError } = await supabase.from("panol_materiales").update(materialPatch).eq("id", item.material_id);
    if (matError) throw matError;

    const { error: priceError } = await supabase.from("panol_precios").insert({
      material_id: item.material_id,
      proveedor_id: comprobante.proveedor_id || null,
      proveedor: proveedorTexto,
      precio_unitario: precio,
      moneda,
      fuente: "comprobante",
      comprobante_id: comprobante.id,
      fecha,
    });
    if (priceError) throw priceError;

    const { error: itemError } = await supabase
      .from("panol_comprobante_items")
      .update({ aplicado: true })
      .eq("id", item.id);
    if (itemError) throw itemError;

    actualizados += 1;
  }

  const total = (items ?? []).reduce((sum, item) => sum + (toNullableNumber(item.total) ?? 0), 0);
  const { error: compError } = await supabase
    .from("panol_comprobantes")
    .update({ estado: "procesado", total })
    .eq("id", comprobante.id);
  if (compError) throw compError;

  return { actualizados, omitidos: usable.length - actualizados, total };
}

export async function leerComprobanteConIA(file) {
  if (!file) throw new Error("Subí una foto del comprobante primero.");
  if (!file.type.startsWith("image/")) throw new Error("La lectura con IA sólo funciona con imágenes.");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const { data, error } = await supabase.functions.invoke("extraer-comprobante", {
    body: { image_base64: base64, mime_type: file.type },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// Lee un presupuesto desde TEXTO pegado o archivo (imagen/PDF) → { proveedor, items[] }.
export async function leerPresupuestoConIA({ text = "", file = null, sectores = [] } = {}) {
  let body;
  if (text && text.trim()) {
    body = { text: text.trim() };
  } else if (file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const isPDF = file.type === "application/pdf" || (file.name || "").toLowerCase().endsWith(".pdf");
    body = isPDF
      ? { base64, mime_type: "application/pdf", filename: file.name || "presupuesto.pdf" }
      : { image_base64: base64, mime_type: file.type || "image/jpeg" };
  } else {
    throw new Error("Pegá el texto del presupuesto o subí un archivo.");
  }
  if (Array.isArray(sectores) && sectores.length) body.sectores = sectores;
  const { data, error } = await supabase.functions.invoke("extraer-comprobante", { body });
  if (error) {
    // El mensaje real de la función viene en el body de la respuesta (no en error.message).
    let detalle = "";
    try { const r = await error.context?.json?.(); detalle = r?.error || ""; } catch { /* ignore */ }
    if (!detalle) { try { detalle = await error.context?.text?.(); } catch { /* ignore */ } }
    throw new Error(detalle || error.message || "No se pudo leer el presupuesto.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Actualiza el precio vigente de un material (historial tolerante) y, opcionalmente,
// corrige su sector (categoria_id) si venía mal clasificado.
export async function aplicarPrecioMaterial(materialId, { precio, moneda = "ARS", proveedor = null, proveedor_id = null, categoria_id = null } = {}) {
  if (!materialId) return false;
  const pu = toNullableNumber(precio);
  const mon = moneda || "ARS";
  const patch = {};
  if (pu != null) { patch.precio_unitario = pu; patch.moneda = mon; patch.proveedor = proveedor || null; patch.proveedor_id = proveedor_id || null; }
  if (categoria_id) patch.categoria_id = categoria_id;
  if (!Object.keys(patch).length) return false;
  const { error: matErr } = await supabase.from("panol_materiales").update(patch).eq("id", materialId);
  if (matErr) throw matErr;
  if (pu != null) {
    try {
      await supabase.from("panol_precios").insert({
        material_id: materialId, proveedor_id: proveedor_id || null, proveedor: proveedor || null,
        precio_unitario: pu, moneda: mon, fuente: "presupuesto", fecha: new Date().toISOString().slice(0, 10),
      });
    } catch { /* historial opcional */ }
  }
  return true;
}

// Setea la cantidad del BOM de un material para una línea/modelo, sin tocar las demás.
export async function setCantidadModelo(materialId, modelo, cantidad) {
  const n = toNullableNumber(cantidad);
  if (!materialId || !modelo || n == null || n <= 0) return;
  const { error } = await supabase
    .from("panol_material_modelo")
    .upsert({ material_id: materialId, modelo: String(modelo), variante: VARIANTE_BASE, cantidad: n }, { onConflict: "material_id,modelo,variante" });
  if (error) throw error;
}
