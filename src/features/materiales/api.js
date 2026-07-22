import { supabase } from "@/supabaseClient";
import { MODELOS, norm } from "./materialesParser";
import {
  fetchAreasMap,
  fetchCondicionMap,
  fetchProveedoresMaterialMap,
  setProveedoresMaterial,
} from "./materialesConfig";
import { barcodeKey } from "./materialBarcodes";

const PAGE = 1000;
const VARIANTE_BASE = "standard";
const BUCKET_COMPROBANTES = "panol-comprobantes";
const BUCKET_MATERIALES = "panol-materiales";

export function isMissingTable(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("not found")
  );
}

function isMissingColumn(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    msg.includes("could not find") ||
    msg.includes("column")
  );
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

async function fetchMaterialesCatalogo() {
  const baseSelect =
    "id, categoria_id, proveedor_id, codigo, descripcion, alias, proveedor, unidad_medida, precio_unitario, moneda, imagen_url, links, revisado, origen, notas, activo, es_consumible, batch_id, created_at, codigo_barra, ubicacion, ubicacion_obs";
  const baseSelectNoLinks =
    "id, categoria_id, proveedor_id, codigo, descripcion, alias, proveedor, unidad_medida, precio_unitario, moneda, imagen_url, revisado, origen, notas, activo, es_consumible, batch_id, created_at, codigo_barra, ubicacion, ubicacion_obs";
  try {
    return (
      await fetchPaged(
        "panol_materiales",
        `${baseSelect}, variantes, variantes_precios`,
        "descripcion",
      )
    ).map((row) => ({
      ...row,
      variantes_precios: row.variantes_precios ?? {},
    }));
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
    try {
      return (
        await fetchPaged(
          "panol_materiales",
          `${baseSelectNoLinks}, variantes`,
          "descripcion",
        )
      ).map((row) => ({
        ...row,
        links: row.links ?? [],
        variantes: row.variantes ?? [],
        variantes_precios: row.variantes_precios ?? {},
      }));
    } catch (error2) {
      if (!isMissingColumn(error2)) throw error2;
      const fallbackSelect =
        "id, categoria_id, proveedor_id, codigo, descripcion, proveedor, unidad_medida, precio_unitario, moneda, imagen_url, revisado, origen, notas, activo, es_consumible, batch_id, created_at, codigo_barra";
      return (
        await fetchPaged("panol_materiales", fallbackSelect, "descripcion")
      ).map((row) => ({
        ...row,
        alias: null,
        links: [],
        variantes: [],
        variantes_precios: {},
        ubicacion: null,
        ubicacion_obs: null,
        es_consumible: row.es_consumible ?? false,
      }));
    }
  }
}

async function fetchMaterialCodigosBarraRows() {
  try {
    return await fetchPaged(
      "panol_material_codigos_barra",
      "id, material_id, codigo, etiqueta, variante, activo, created_at, updated_at",
      "codigo",
    );
  } catch (error) {
    if (isMissingTable(error) || isMissingColumn(error)) {
      try {
        return await fetchPaged(
          "panol_material_codigos_barra",
          "id, material_id, codigo, etiqueta, activo, created_at, updated_at",
          "codigo",
        );
      } catch {
        return [];
      }
    }
    throw error;
  }
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

export function normalizeUnidadMedida(value, fallback = "unidad") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const key = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
  const aliases = {
    u: "unidad",
    un: "unidad",
    uni: "unidad",
    unid: "unidad",
    unidad: "unidad",
    unidades: "unidad",
    uds: "unidad",
    ud: "unidad",
    und: "unidad",
    pza: "unidad",
    pieza: "unidad",
    piezas: "unidad",
    m: "metro",
    mt: "metro",
    mts: "metro",
    mtr: "metro",
    mtrs: "metro",
    metro: "metro",
    metros: "metro",
    cm: "cm",
    centimetro: "cm",
    centimetros: "cm",
    mm: "mm",
    milimetro: "mm",
    milimetros: "mm",
    kg: "kg",
    kgs: "kg",
    kilo: "kg",
    kilos: "kg",
    kilogramo: "kg",
    kilogramos: "kg",
    g: "g",
    gr: "g",
    grs: "g",
    gramo: "g",
    gramos: "g",
    l: "litro",
    lt: "litro",
    lts: "litro",
    litro: "litro",
    litros: "litro",
    pie: "pies",
    pies: "pies",
    ft: "pies",
    caja: "caja",
    cajas: "caja",
    rollo: "rollo",
    rollos: "rollo",
    par: "par",
    pares: "par",
    juego: "juego",
    juegos: "juego",
    kit: "juego",
    kits: "juego",
    placa: "placa",
    placas: "placa",
    plancha: "placa",
    planchas: "placa",
    hoja: "hoja",
    hojas: "hoja",
    barra: "barra",
    barras: "barra",
    bolsa: "bolsa",
    bolsas: "bolsa",
    lata: "lata",
    latas: "lata",
    tubo: "tubo",
    tubos: "tubo",
    m2: "m2",
    "m²": "m2",
    metro2: "m2",
    metros2: "m2",
    "metro cuadrado": "m2",
    "metros cuadrados": "m2",
    m3: "m3",
    "m³": "m3",
    metro3: "m3",
    metros3: "m3",
    "metro cubico": "m3",
    "metros cubicos": "m3",
  };
  return aliases[key] || raw.toLowerCase();
}

function normalizeVariantes(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n;]+/);
  const seen = new Set();
  return raw
    .flatMap((item) => String(item || "").split(/\s*\/\s*/))
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = norm(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Info por variante: mapa { "23L": { precio, moneda, codigo } } en la columna variantes_precios.
// Guarda entradas que tengan precio Y/O código (para nombres de variante conocidos si se pasan).
export function normalizeVariantesPrecios(value, nombres = null) {
  const src =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const permit = nombres
    ? new Set((nombres || []).map((n) => String(n).trim().toLowerCase()))
    : null;
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    const nombre = String(k || "").trim();
    if (!nombre) continue;
    if (permit && !permit.has(nombre.toLowerCase())) continue;
    const precioRaw =
      v == null || v.precio === "" || v.precio == null
        ? null
        : Number(String(v.precio).replace(",", "."));
    const precio = Number.isFinite(precioRaw) ? precioRaw : null;
    const codigo = String(v?.codigo || "").trim();
    const proveedorId = String(v?.proveedor_id || "").trim();
    const proveedor = String(v?.proveedor || "").trim();
    const imagenUrl = String(v?.imagen_url || v?.imagenUrl || "").trim();
    if (imagenUrl && precio == null && !codigo) {
      out[nombre] = { imagen_url: imagenUrl };
      continue;
    }
    if (precio == null && !codigo) continue; // sin precio ni código → no se guarda
    const entry = {};
    if (precio != null) {
      entry.precio = precio;
      entry.moneda = v?.moneda === "USD" ? "USD" : "ARS";
    }
    if (codigo) entry.codigo = codigo;
    if (proveedorId) entry.proveedor_id = proveedorId;
    if (proveedor) entry.proveedor = proveedor;
    if (imagenUrl) entry.imagen_url = imagenUrl;
    out[nombre] = entry;
  }
  return out;
}

// Precio de una variante puntual (para autocompletar al elegirla).
export function variantePrecio(material, nombre) {
  const mapa = material?.variantes_precios;
  if (!mapa || !nombre) return null;
  const hit = mapa[nombre] || mapa[String(nombre).trim()];
  if (!hit || hit.precio == null) return null;
  return {
    amount: Number(hit.precio),
    moneda: hit.moneda === "USD" ? "USD" : "ARS",
  };
}

// Código de una variante puntual (para autocompletar al elegirla).
export function varianteCodigo(material, nombre) {
  const mapa = material?.variantes_precios;
  if (!mapa || !nombre) return "";
  const hit = mapa[nombre] || mapa[String(nombre).trim()];
  return hit?.codigo ? String(hit.codigo) : "";
}

// Precio de la variante más cara (peor caso, para el costo total mientras no se define cuál va).
export function variantePrecioMax(material) {
  const mapa = material?.variantes_precios;
  if (!mapa || typeof mapa !== "object") return null;
  let best = null;
  for (const v of Object.values(mapa)) {
    const amount = v?.precio == null ? null : Number(v.precio);
    if (amount == null || !Number.isFinite(amount)) continue;
    if (!best || amount > best.amount)
      best = { amount, moneda: v?.moneda === "USD" ? "USD" : "ARS" };
  }
  return best;
}

export function normalizeMaterialLinks(value) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  return raw
    .map((item) => ({
      label: String(item?.label || item?.titulo || "").trim(),
      url: String(item?.url || item?.link || "").trim(),
      nota: String(item?.nota || item?.notes || "").trim(),
    }))
    .filter((item) => item.url)
    .filter((item) => {
      const key = item.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function precioVigente(material) {
  return (
    material?.ultimo_precio ??
    (material?.precio_unitario != null
      ? {
          precio_unitario: material.precio_unitario,
          moneda: material.moneda,
          fecha: null,
          proveedor: material.proveedor,
          proveedor_id: material.proveedor_id,
          fuente: "catalogo",
        }
      : null)
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
export async function crearCategoria(
  nombre,
  { parentId = null, orden = 0 } = {},
) {
  const { data, error } = await supabase
    .from("panol_categorias")
    .insert({ nombre: nombre.trim(), parent_id: parentId, orden })
    .select("id, nombre, orden, parent_id")
    .single();
  if (error) throw error;
  return data;
}

export async function renombrarCategoria(id, nombre) {
  const { error } = await supabase
    .from("panol_categorias")
    .update({ nombre: nombre.trim() })
    .eq("id", id);
  if (error) throw error;
}

// Borra un subsector y reasigna sus materiales al sector padre (no se pierden).
export async function borrarSubsector(id, parentId) {
  if (parentId) {
    await supabase
      .from("panol_materiales")
      .update({ categoria_id: parentId })
      .eq("categoria_id", id);
    await supabase
      .from("panol_material_categorias")
      .update({ categoria_id: parentId })
      .eq("categoria_id", id);
  }
  const { error } = await supabase
    .from("panol_categorias")
    .delete()
    .eq("id", id);
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
    .select(
      "id, nombre, cuit, email, telefono, notas, activo, tipo, rubros, sede, perfil, compite_con",
    )
    .order("nombre");
  if (error) throw error;
  return data ?? [];
}

export async function fetchMaterialAudit(materialId, limit = 80) {
  if (!materialId) return [];
  const cleanLimit = Math.min(Math.max(Number(limit) || 80, 1), 200);
  const { data, error } = await supabase
    .from("panol_materiales_audit")
    .select(
      "id, material_id, material_descripcion, campo, valor_anterior, valor_nuevo, actor_id, origen, contexto, created_at",
    )
    .eq("material_id", materialId)
    .order("created_at", { ascending: false })
    .limit(cleanLimit);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data ?? [];
}

const MATERIAL_AUDIT_RESTORE_FIELDS = new Set([
  "descripcion",
  "proveedor",
  "proveedor_id",
  "categoria_id",
  "codigo",
  "codigo_barra",
  "unidad_medida",
  "precio_unitario",
  "moneda",
  "variantes",
  "notas",
  "imagen_url",
  "revisado",
  "activo",
]);

export async function restaurarMaterialAuditChange(auditRow) {
  const materialId = auditRow?.material_id;
  const campo = auditRow?.campo;
  if (!materialId)
    throw new Error("No se puede restaurar: el material ya no existe.");
  if (!MATERIAL_AUDIT_RESTORE_FIELDS.has(campo))
    throw new Error("Ese campo no se puede restaurar desde el historial.");

  let value = auditRow.valor_anterior;
  if (campo === "descripcion") {
    value = String(value || "").trim();
    if (!value) throw new Error("No se puede restaurar una descripcion vacia.");
  } else if (campo === "precio_unitario") {
    value = toNullableNumber(value);
  } else if (campo === "variantes") {
    value = normalizeVariantes(value);
  } else if (campo === "activo" || campo === "revisado") {
    value = Boolean(value);
  } else if (value === "") {
    value = null;
  }

  const { error } = await supabase
    .from("panol_materiales")
    .update({ [campo]: value })
    .eq("id", materialId);
  if (error) throw error;
}

export async function fetchComprobantes() {
  const comprobantes = await fetchPaged(
    "panol_comprobantes",
    "id, proveedor_id, proveedor, numero, fecha, moneda, archivo_url, estado, total, created_at",
    "created_at",
  );
  const items = await fetchPaged(
    "panol_comprobante_items",
    "id, comprobante_id, material_id, descripcion, descripcion_original, cantidad, precio_unitario, total, aplicado",
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
    .sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
    );
}

export async function fetchCatalogo() {
  const [
    categorias,
    materiales,
    codigosBarra,
    modelos,
    batches,
    precios,
    imagenes,
    proveedores,
    comprobantes,
    areasRes,
    condRes,
    provMatRes,
  ] = await Promise.all([
    fetchCategorias(),
    fetchMaterialesCatalogo(),
    fetchMaterialCodigosBarraRows(),
    fetchPaged(
      "panol_material_modelo",
      "id, material_id, modelo, cantidad, variante",
      "id",
    ),
    fetchBatches(),
    fetchPaged(
      "panol_precios",
      "id, material_id, proveedor_id, proveedor, precio_unitario, moneda, fuente, comprobante_id, fecha, created_at",
      "created_at",
    ),
    fetchPaged(
      "panol_material_imagenes",
      "id, material_id, url, nombre, created_at",
      "created_at",
    ),
    fetchProveedores(),
    fetchComprobantes(),
    fetchAreasMap(), // tolerante: {} si la tabla aún no existe
    fetchCondicionMap(), // tolerante
    fetchProveedoresMaterialMap(), // tolerante: proveedores alternativos por material
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
    list.sort((a, b) =>
      String(b.fecha ?? b.created_at ?? "").localeCompare(
        String(a.fecha ?? a.created_at ?? ""),
      ),
    );
  }
  const imagenesByMaterial = new Map();
  for (const row of imagenes) {
    const list = imagenesByMaterial.get(row.material_id) ?? [];
    list.push(row);
    imagenesByMaterial.set(row.material_id, list);
  }
  for (const list of imagenesByMaterial.values()) {
    list.sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
    );
  }
  const codigosByMaterial = new Map();
  for (const row of codigosBarra) {
    if (!row.material_id || row.activo === false) continue;
    const list = codigosByMaterial.get(row.material_id) ?? [];
    list.push(row);
    codigosByMaterial.set(row.material_id, list);
  }

  return {
    categorias,
    precios,
    materiales: materiales.map((m) => {
      const historial = preciosByMaterial.get(m.id) ?? [];
      const imgs = imagenesByMaterial.get(m.id) ?? [];
      // Áreas = categoría principal + las extra de la M2M (un mismo ítem en varias áreas).
      const extra = areasRes.map.get(m.id);
      const areas = [
        ...new Set(
          [m.categoria_id, ...(extra ? [...extra] : [])].filter(Boolean),
        ),
      ];
      return {
        ...m,
        modelos: modelosByMaterial.get(m.id) ?? [],
        precio_historial: historial,
        ultimo_precio: historial[0] ?? null,
        imagenes: imgs,
        imagen_url: m.imagen_url || imgs[0]?.url || null,
        links: normalizeMaterialLinks(m.links),
        variantes: normalizeVariantes(m.variantes),
        codigos_barra: codigosByMaterial.get(m.id) ?? [],
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

export async function agregarCodigoBarraMaterial(
  materialId,
  codigo,
  { etiqueta = "", variante = null } = {},
) {
  const clean = String(codigo || "").trim();
  if (!materialId) throw new Error("Falta el material.");
  if (!clean) throw new Error("Cargá un código de barras.");

  try {
    const { data, error } = await supabase
      .from("panol_material_codigos_barra")
      .insert({
        material_id: materialId,
        codigo: clean,
        etiqueta: String(etiqueta || "").trim() || null,
        variante: variante || null,
        activo: true,
      })
      .select(
        "id, material_id, codigo, etiqueta, variante, activo, created_at, updated_at",
      )
      .single();
    if (error) throw error;

    try {
      const { data: material } = await supabase
        .from("panol_materiales")
        .select("codigo_barra")
        .eq("id", materialId)
        .maybeSingle();
      if (!String(material?.codigo_barra || "").trim()) {
        await supabase
          .from("panol_materiales")
          .update({ codigo_barra: clean })
          .eq("id", materialId);
      }
    } catch {
      // El campo legacy es solo compatibilidad: si falla, el código nuevo ya quedó guardado.
    }
    return data;
  } catch (error) {
    if (!(isMissingTable(error) || isMissingColumn(error))) throw error;
    const { error: legacyError } = await supabase
      .from("panol_materiales")
      .update({ codigo_barra: clean })
      .eq("id", materialId);
    if (legacyError) throw legacyError;
    return {
      id: null,
      material_id: materialId,
      codigo: clean,
      etiqueta: etiqueta || "Principal",
      activo: true,
      legacy: true,
    };
  }
}

export async function eliminarCodigoBarraMaterial({
  id = null,
  materialId = null,
  codigo = "",
} = {}) {
  const clean = String(codigo || "").trim();
  if (id) {
    try {
      const { error } = await supabase
        .from("panol_material_codigos_barra")
        .delete()
        .eq("id", id);
      if (error) throw error;
    } catch (error) {
      if (!(isMissingTable(error) || isMissingColumn(error))) throw error;
    }
  } else if (materialId && clean) {
    try {
      const { error } = await supabase
        .from("panol_material_codigos_barra")
        .delete()
        .eq("material_id", materialId)
        .eq("codigo", clean);
      if (error) throw error;
    } catch (error) {
      if (!(isMissingTable(error) || isMissingColumn(error))) throw error;
    }
  }

  if (materialId && clean) {
    const { data } = await supabase
      .from("panol_materiales")
      .select("codigo_barra")
      .eq("id", materialId)
      .maybeSingle();
    if (barcodeKey(data?.codigo_barra) === barcodeKey(clean)) {
      const { error } = await supabase
        .from("panol_materiales")
        .update({ codigo_barra: null })
        .eq("id", materialId);
      if (error) throw error;
    }
  }
}

function modeloFromObraCodigo(codigo) {
  const prefix = String(codigo ?? "")
    .trim()
    .split("-")[0]
    ?.replace(/^K/i, "");
  return MODELOS.includes(prefix) ? prefix : null;
}

function normalizeObraAvance(row) {
  const modelo = MODELOS.includes(String(row?.modelo ?? ""))
    ? String(row.modelo)
    : modeloFromObraCodigo(row?.codigo);
  return { ...row, modelo };
}

function isMissingModeloColumn(error) {
  const msg = String(error?.message ?? "").toLowerCase();
  return (
    error?.code === "42703" ||
    msg.includes("modelo") ||
    (msg.includes("column") && msg.includes("produccion_obras"))
  );
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

// Addons por obra (opcionales/adicionales). Tolerante: [] si la tabla aún no existe.
export async function fetchAddonsObra(obraId) {
  if (!obraId) return [];
  try {
    const { data, error } = await supabase
      .from("panol_obra_addons")
      .select("*")
      .eq("obra_id", obraId)
      .order("created_at");
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export async function fetchAddonsMaterial(materialId) {
  if (!materialId) return [];
  try {
    const { data, error } = await supabase
      .from("panol_obra_addons")
      .select("*")
      .eq("material_id", materialId)
      .order("created_at");
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

const ADDON_FIELDS = new Set([
  "obra_id",
  "material_id",
  "descripcion",
  "cantidad",
  "proveedor",
  "tipo",
  "observaciones",
  "codigo",
  "unidad",
  "categoria_id",
  "proveedor_id",
  "precio_unitario",
  "moneda",
  "imagen_url",
  "links",
  "codigo_barra",
  "variantes",
  "estado",
]);

function addonPayload(fields = {}, includeObraId = true) {
  const payload = Object.fromEntries(
    Object.entries(fields).filter(
      ([key]) => ADDON_FIELDS.has(key) && (includeObraId || key !== "obra_id"),
    ),
  );
  for (const key of [
    "obra_id",
    "material_id",
    "categoria_id",
    "proveedor_id",
  ]) {
    if (payload[key] === "") payload[key] = null;
  }
  if ("cantidad" in payload)
    payload.cantidad = toNullableNumber(payload.cantidad) ?? 1;
  if ("precio_unitario" in payload)
    payload.precio_unitario = toNullableNumber(payload.precio_unitario);
  if (payload.moneda === "") payload.moneda = null;
  return payload;
}

function legacyAddonPayload(payload = {}, includeObraId = true) {
  return addonPayload(
    {
      obra_id: payload.obra_id,
      descripcion: payload.descripcion,
      cantidad: payload.cantidad,
      proveedor: payload.proveedor,
      tipo: payload.tipo,
      observaciones: payload.observaciones,
    },
    includeObraId,
  );
}

export async function crearAddon(obraId, fields) {
  const payload = addonPayload({ obra_id: obraId, ...fields });
  let { error } = await supabase.from("panol_obra_addons").insert(payload);
  if (error && isMissingColumn(error)) {
    const retry = await supabase
      .from("panol_obra_addons")
      .insert(legacyAddonPayload(payload));
    error = retry.error;
  }
  if (error) throw error;
}

export async function actualizarAddon(id, fields) {
  if (!id) throw new Error("Falta el adicional.");
  const payload = addonPayload(fields, false);
  let { error } = await supabase
    .from("panol_obra_addons")
    .update(payload)
    .eq("id", id);
  if (error && isMissingColumn(error)) {
    const retry = await supabase
      .from("panol_obra_addons")
      .update(legacyAddonPayload(payload, false))
      .eq("id", id);
    error = retry.error;
  }
  if (error) throw error;
}

function addonSnapshotMovible(row = {}) {
  const recepcionEstado = String(row.recepcion_estado || "").toLowerCase();
  if (
    ["recibido", "parcial", "sin_info", "falta_stock", "rechazado"].includes(
      recepcionEstado,
    )
  )
    return false;
  const estado = String(row.estado || "").toLowerCase();
  return !["en_panol", "recibido", "egresado"].includes(estado);
}

export async function reasignarAddon(id, obraId, meta = {}) {
  if (!id) throw new Error("Falta el adicional.");
  if (!obraId) throw new Error("Elegí una obra destino.");
  const { error } = await supabase
    .from("panol_obra_addons")
    .update({ obra_id: obraId })
    .eq("id", id);
  if (error) throw error;

  const materialId = meta?.materialId || null;
  const fromObraId = meta?.fromObraId || null;
  if (!materialId || !fromObraId || fromObraId === obraId) return;
  try {
    let query = supabase
      .from("panol_obra_materiales_snapshot")
      .select("id, estado, recepcion_estado, descripcion, codigo, unidad")
      .eq("obra_id", fromObraId)
      .eq("material_id", materialId)
      .or("tipo.eq.addon,source.eq.addon");
    if (meta.descripcion) query = query.eq("descripcion", meta.descripcion);
    const { data, error: snapError } = await query;
    if (snapError) return;
    const ids = (data ?? [])
      .filter(addonSnapshotMovible)
      .map((row) => row.id)
      .filter(Boolean);
    if (!ids.length) return;
    const { error: updateError } = await supabase
      .from("panol_obra_materiales_snapshot")
      .update({ obra_id: obraId })
      .in("id", ids);
    if (updateError && !isMissingTable(updateError)) throw updateError;
  } catch (snapError) {
    if (!isMissingTable(snapError) && !isMissingColumn(snapError))
      throw snapError;
  }
}

export async function borrarAddon(id, { snapshotId = null } = {}) {
  const { error } = await supabase
    .from("panol_obra_addons")
    .delete()
    .eq("id", id);
  if (error) throw error;
  if (snapshotId) await borrarObraSnapshotRows([snapshotId]);
}

export async function borrarObraSnapshotRows(ids = []) {
  const cleanIds = ids.filter(Boolean);
  if (!cleanIds.length) return;
  try {
    const { error } = await supabase
      .from("panol_obra_materiales_snapshot")
      .delete()
      .in("id", cleanIds);
    if (error && !isMissingTable(error)) throw error;
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
}

export async function fetchObraMaterialSnapshot(obraId) {
  if (!obraId) return [];
  try {
    const { data, error } = await supabase
      .from("panol_obra_materiales_snapshot")
      .select("*")
      .eq("obra_id", obraId)
      .order("orden", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) return [];
    return await withRecepcionDetalle(data ?? []);
  } catch {
    return [];
  }
}

const STOCK_LIBRE_ESTADOS = new Set(["en_panol", "recibido", "parcial"]);

function stockLibreSnapshotKey(row) {
  const materialId = row?.material_id ?? row?.materialId ?? null;
  if (materialId) return `material:${materialId}`;
  const textKey = norm(
    `${row?.descripcion || ""}|${row?.codigo || ""}|${row?.unidad || row?.unidad_medida || ""}`,
  );
  return textKey ? `text:${textKey}` : "";
}

export async function fetchStockLibrePanolMateriales() {
  try {
    const { data, error } = await supabase
      .from("panol_obra_materiales_snapshot")
      .select(
        "id, material_id, descripcion, codigo, cantidad, cantidad_egresada, unidad, estado, source, stock_sede",
      )
      .is("obra_id", null);
    if (error) return [];

    const map = new Map();
    for (const row of data ?? []) {
      const key = stockLibreSnapshotKey(row);
      if (!key) continue;
      const estado = String(row.estado || "").toLowerCase();
      const source = String(row.source || "").toLowerCase();
      const isSalida =
        estado === "egresado" ||
        source.startsWith("egreso") ||
        source === "transferencia_egreso";
      const cantidad = Math.abs(
        toNullableNumber(row.cantidad_egresada) ??
          toNullableNumber(row.cantidad) ??
          0,
      );
      const delta = isSalida
        ? -cantidad
        : STOCK_LIBRE_ESTADOS.has(estado)
          ? (toNullableNumber(row.cantidad) ?? 0) -
            (toNullableNumber(row.cantidad_egresada) ?? 0)
          : 0;
      if (!delta) continue;
      const current = map.get(key) || {
        key,
        material_id: row.material_id || null,
        descripcion: row.descripcion || "",
        codigo: row.codigo || "",
        unidad: row.unidad || "unidad",
        cantidad: 0,
        sedes: {},
      };
      current.cantidad += delta;
      const sede = row.stock_sede || "Sin sede";
      current.sedes[sede] = (current.sedes[sede] || 0) + delta;
      map.set(key, current);
    }

    return [...map.values()]
      .map((item) => ({
        ...item,
        cantidad: Math.max(0, item.cantidad),
        sedes: Object.fromEntries(
          Object.entries(item.sedes)
            .map(([sede, qty]) => [sede, Math.max(0, qty)])
            .filter(([, qty]) => qty > 0),
        ),
      }))
      .filter((item) => item.cantidad > 0);
  } catch {
    return [];
  }
}

function snapshotEstadoFromRecepcion(estado) {
  if (
    [
      "pendiente",
      "recibido",
      "parcial",
      "sin_info",
      "falta_stock",
      "rechazado",
    ].includes(estado)
  )
    return "en_panol";
  return null;
}

function estadoListadoObra(row) {
  const estado =
    snapshotEstadoFromRecepcion(row?.recepcion_estado) ||
    row?.estado ||
    "pendiente";
  if (estado === "egresado") return "egresado";
  if (estado === "pedido" || estado === "comprado") return "comprado";
  if (
    [
      "en_panol",
      "recibido",
      "parcial",
      "problema",
      "sin_info",
      "falta_stock",
      "rechazado",
    ].includes(estado)
  )
    return "en_panol";
  return "pendiente";
}

function latestRecepcionItem(items = []) {
  return (
    [...items].sort((a, b) => {
      const ad = new Date(
        a.marcado_at || a.updated_at || a.created_at || 0,
      ).getTime();
      const bd = new Date(
        b.marcado_at || b.updated_at || b.created_at || 0,
      ).getTime();
      return bd - ad;
    })[0] || null
  );
}

async function fetchRecepcionItemsForSnapshots(rows = []) {
  const snapshotIds = rows.map((row) => row.id).filter(Boolean);
  const requestItemIds = rows
    .map((row) => row.purchase_request_item_id)
    .filter(Boolean);
  if (!snapshotIds.length && !requestItemIds.length) return [];

  const select =
    "id, envio_id, purchase_request_item_id, obra_snapshot_item_id, estado, cantidad_recibida, nota, marcado_at, updated_at, created_at, envio:panol_envios(id,titulo,estado,sede,created_at)";
  try {
    let q = supabase.from("panol_envio_items").select(select);
    const filters = [];
    if (snapshotIds.length)
      filters.push(`obra_snapshot_item_id.in.(${snapshotIds.join(",")})`);
    if (requestItemIds.length)
      filters.push(`purchase_request_item_id.in.(${requestItemIds.join(",")})`);
    q = q.or(filters.join(",")).order("created_at", { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    if (!isMissingColumn(error) || !requestItemIds.length) return [];
    const { data, error: fallbackError } = await supabase
      .from("panol_envio_items")
      .select(
        "id, envio_id, purchase_request_item_id, estado, cantidad_recibida, nota, marcado_at, updated_at, created_at, envio:panol_envios(id,titulo,estado,sede,created_at)",
      )
      .in("purchase_request_item_id", requestItemIds)
      .order("created_at", { ascending: false });
    if (fallbackError) return [];
    return data ?? [];
  }
}

async function withRecepcionDetalle(rows = []) {
  if (!rows.length) return rows;
  const recepcionItems = await fetchRecepcionItemsForSnapshots(rows);
  if (!recepcionItems.length) return rows;

  const bySnapshot = new Map();
  const byPurchaseItem = new Map();
  for (const item of recepcionItems) {
    if (item.obra_snapshot_item_id) {
      const list = bySnapshot.get(item.obra_snapshot_item_id) ?? [];
      list.push(item);
      bySnapshot.set(item.obra_snapshot_item_id, list);
    }
    if (item.purchase_request_item_id) {
      const list = byPurchaseItem.get(item.purchase_request_item_id) ?? [];
      list.push(item);
      byPurchaseItem.set(item.purchase_request_item_id, list);
    }
  }

  return rows.map((row) => {
    const linked = [
      ...(bySnapshot.get(row.id) ?? []),
      ...(byPurchaseItem.get(row.purchase_request_item_id) ?? []),
    ];
    const unique = [...new Map(linked.map((item) => [item.id, item])).values()];
    const latest = latestRecepcionItem(unique);
    if (!latest) return row;
    return {
      ...row,
      estado:
        row.estado === "egresado"
          ? row.estado
          : snapshotEstadoFromRecepcion(latest.estado) || row.estado,
      panol_envio_id: latest.envio_id || row.panol_envio_id || null,
      panol_envio_item_id: latest.id || row.panol_envio_item_id || null,
      recepcion_estado: latest.estado || row.recepcion_estado || null,
      recepcion_cantidad_recibida:
        latest.cantidad_recibida ?? row.recepcion_cantidad_recibida ?? null,
      recepcion_nota: latest.nota ?? row.recepcion_nota ?? null,
      recepcion_updated_at:
        latest.marcado_at ||
        latest.updated_at ||
        row.recepcion_updated_at ||
        null,
      recepcion_envio: latest.envio || null,
      recepcion_items: unique,
    };
  });
}

function snapshotPayloadFromRows(obraId, rows = []) {
  return rows
    .filter((row) => String(row?.descripcion || "").trim())
    .map((row, index) => ({
      obra_id: obraId,
      material_id:
        row.materialId ?? row.material_id ?? row.material?.id ?? null,
      descripcion: String(row.descripcion || "").trim(),
      codigo: row.codigo || null,
      cantidad: toNullableNumber(row.cantidad),
      unidad: row.unidad || row.unidad_medida || "unidad",
      proveedor:
        row.proveedor && row.proveedor !== "Sin proveedor"
          ? row.proveedor
          : null,
      rubro: row.rubro || null,
      tipo: row.bucket?.key || row.tipo_key || row.tipo || "base",
      tipo_label: row.bucket?.label || row.tipo_label || row.tipo || "Base",
      precio_unitario:
        row.precio?.amount ?? toNullableNumber(row.precio_unitario),
      moneda: row.precio?.moneda || row.moneda || null,
      notas: row.obs || row.notas || null,
      source: row.source || "matriz",
      orden: index,
      estado: row.estadoObra || row.estado || "pendiente",
      variante: row.variante || row.variante_obra || null,
    }));
}

function snapshotPayloadWithoutVariant(rows = []) {
  return rows.map((row) => {
    const clean = { ...row };
    delete clean.variante;
    return clean;
  });
}

function snapshotPayloadKey(row) {
  const materialId = row?.material_id ?? row?.materialId ?? null;
  const kind =
    row?.tipo || row?.tipo_key || row?.bucket?.key || row?.source || "";
  if (kind === "addon" || row?.source === "addon") {
    const textKey = norm(
      `${row?.descripcion || ""}|${row?.codigo || ""}|${row?.unidad || row?.unidad_medida || ""}`,
    );
    return textKey ? `addon:${textKey}` : "";
  }
  if (materialId) return `material:${materialId}`;
  const textKey = norm(
    `${row?.descripcion || ""}|${row?.codigo || ""}|${row?.unidad || row?.unidad_medida || ""}`,
  );
  return textKey ? `text:${textKey}` : "";
}

export async function ensureObraMaterialSnapshot(obraId, rows = []) {
  if (!obraId) return [];
  try {
    const existing = await fetchObraMaterialSnapshot(obraId);
    const payload = snapshotPayloadFromRows(obraId, rows);
    if (!payload.length) return existing;

    if (existing.length) {
      const existingKeys = new Set(
        existing.map(snapshotPayloadKey).filter(Boolean),
      );
      const missing = payload.filter((row) => {
        const key = snapshotPayloadKey(row);
        return key && !existingKeys.has(key);
      });
      if (!missing.length) return existing;
      let { error } = await supabase
        .from("panol_obra_materiales_snapshot")
        .insert(missing);
      if (error && isMissingColumn(error)) {
        const retry = await supabase
          .from("panol_obra_materiales_snapshot")
          .insert(snapshotPayloadWithoutVariant(missing));
        error = retry.error;
      }
      if (error) return existing;
      return await fetchObraMaterialSnapshot(obraId);
    }

    let { error } = await supabase
      .from("panol_obra_materiales_snapshot")
      .insert(payload);
    if (error && isMissingColumn(error)) {
      const retry = await supabase
        .from("panol_obra_materiales_snapshot")
        .insert(snapshotPayloadWithoutVariant(payload));
      error = retry.error;
    }
    if (error) return [];
    return await fetchObraMaterialSnapshot(obraId);
  } catch {
    return [];
  }
}

export async function ensureObraMaterialSnapshotRow(obraId, row) {
  if (!obraId) throw new Error("Falta la obra.");
  const payload = snapshotPayloadFromRows(obraId, [row])[0];
  if (!payload) throw new Error("Falta el item de obra.");

  let query = await supabase
    .from("panol_obra_materiales_snapshot")
    .insert(payload)
    .select("*")
    .single();

  if (query.error && isMissingColumn(query.error)) {
    query = await supabase
      .from("panol_obra_materiales_snapshot")
      .insert(snapshotPayloadWithoutVariant([payload])[0])
      .select("*")
      .single();
  }

  if (query.error) throw query.error;
  return query.data;
}

export async function reemplazarObraMaterialSnapshotSeguro(obraId, rows = []) {
  if (!obraId) return [];
  const existing = await fetchObraMaterialSnapshot(obraId);
  const locked = existing.some(
    (row) =>
      row.purchase_request_id ||
      row.panol_envio_id ||
      row.panol_envio_item_id ||
      row.recepcion_items?.length ||
      !["pendiente", null, undefined, ""].includes(row.estado),
  );
  if (locked)
    throw new Error(
      "La lista ya tiene compras/recepcion/movimientos vinculados. No se puede regenerar sin perder trazabilidad.",
    );

  const payload = snapshotPayloadFromRows(obraId, rows);
  if (!payload.length) return [];

  const { error: delError } = await supabase
    .from("panol_obra_materiales_snapshot")
    .delete()
    .eq("obra_id", obraId);
  if (delError) throw delError;

  let { error } = await supabase
    .from("panol_obra_materiales_snapshot")
    .insert(payload);
  if (error && isMissingColumn(error)) {
    const retry = await supabase
      .from("panol_obra_materiales_snapshot")
      .insert(snapshotPayloadWithoutVariant(payload));
    error = retry.error;
  }
  if (error) throw error;
  return await fetchObraMaterialSnapshot(obraId);
}

export async function updateObraSnapshotRows(ids = [], patch = {}) {
  const cleanIds = ids.filter(Boolean);
  if (!cleanIds.length) return;
  try {
    const { error } = await supabase
      .from("panol_obra_materiales_snapshot")
      .update(patch)
      .in("id", cleanIds);
    if (error && !isMissingTable(error)) throw error;
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
}

function isMissingFunction(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42883" ||
    msg.includes("function") ||
    msg.includes("schema cache")
  );
}

export async function asignarVarianteObraSnapshot(snapshotId, variante = "") {
  if (!snapshotId) throw new Error("Falta el item de obra.");
  const value = String(variante || "").trim() || null;
  const { data, error } = await supabase.rpc(
    "panol_asignar_variante_snapshot",
    {
      p_snapshot_id: snapshotId,
      p_variante: value,
    },
  );
  if (!error) return data;
  if (!(isMissingFunction(error) || isMissingColumn(error))) throw error;
  await updateObraSnapshotRows([snapshotId], { variante: value });
  return null;
}

export async function cambiarEstadoObraSnapshot(snapshotId, estado, nota = "") {
  if (!snapshotId) throw new Error("Falta el item de obra.");
  const { data, error } = await supabase.rpc("panol_cambiar_estado_snapshot", {
    p_snapshot_id: snapshotId,
    p_estado: estado,
    p_nota: String(nota || "").trim() || null,
  });
  if (error) {
    if (
      !(
        isMissingTable(error) ||
        isMissingColumn(error) ||
        String(error.message || "").includes("function")
      )
    )
      throw error;
    await updateObraSnapshotRows([snapshotId], { estado });
    return null;
  }
  return data;
}

export async function fetchObraSnapshotAudit(snapshotId, limit = 50) {
  if (!snapshotId) return [];
  try {
    const { data, error } = await supabase
      .from("panol_obra_materiales_snapshot_audit")
      .select(
        "id, snapshot_id, obra_id, material_id, descripcion, campo, valor_anterior, valor_nuevo, nota, origen, created_at, actor:profiles(id, username, role, is_admin)",
      )
      .eq("snapshot_id", snapshotId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      if (isMissingTable(error) || isMissingColumn(error)) return [];
      throw error;
    }
    return data ?? [];
  } catch (error) {
    if (isMissingTable(error) || isMissingColumn(error)) return [];
    throw error;
  }
}

export async function fetchObrasAvance() {
  try {
    let rows;
    try {
      rows = await fetchProduccionObras(
        "id, codigo, estado, linea_nombre, modelo",
        true,
      );
    } catch (error) {
      if (!isMissingModeloColumn(error)) throw error;
      rows = await fetchProduccionObras(
        "id, codigo, estado, linea_nombre",
        true,
      );
    }

    if (!rows.length) {
      try {
        rows = await fetchProduccionObras(
          "id, codigo, estado, linea_nombre, modelo",
          false,
        );
      } catch (error) {
        if (!isMissingModeloColumn(error)) throw error;
        rows = await fetchProduccionObras(
          "id, codigo, estado, linea_nombre",
          false,
        );
      }
    }

    return await withObrasRecepcion(rows.map(normalizeObraAvance));
  } catch (error) {
    if (isMissingTable(error)) return [];
    return [];
  }
}

function resumenRecepcionSnapshot(rows = []) {
  const out = {
    total: rows.length,
    pendiente: 0,
    comprado: 0,
    en_panol: 0,
    egresado: 0,
  };
  for (const row of rows) {
    const estado = estadoListadoObra(row);
    out[estado] = (out[estado] ?? 0) + 1;
  }
  out.abiertos = out.total - out.egresado;
  out.conMovimiento = out.total - out.pendiente;
  return out;
}

async function withObrasRecepcion(rows = []) {
  if (!rows.length) return rows;
  const obraIds = rows.map((row) => row.id).filter(Boolean);
  try {
    const { data, error } = await supabase
      .from("panol_obra_materiales_snapshot")
      .select("obra_id, estado, recepcion_estado")
      .in("obra_id", obraIds);
    if (error) return rows;
    const byObra = new Map();
    for (const item of data ?? []) {
      const list = byObra.get(item.obra_id) ?? [];
      list.push(item);
      byObra.set(item.obra_id, list);
    }
    return rows.map((row) => ({
      ...row,
      materiales_recepcion: resumenRecepcionSnapshot(byObra.get(row.id) ?? []),
    }));
  } catch {
    return rows;
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

export async function promoverCandidato(
  id,
  accion,
  { materialId = null, categoriaId = null } = {},
) {
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
      missing.push({
        nombre: sector.sector.nombre,
        orden: sector.sector.orden,
      });
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
    unidad_medida: normalizeUnidadMedida(
      existing?.unidad_medida || item.unidad_medida,
      null,
    ),
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
    if (
      typeof cantidad === "number" &&
      Number.isFinite(cantidad) &&
      cantidad > 0
    ) {
      rows.push({
        material_id: materialId,
        modelo,
        variante: VARIANTE_BASE,
        cantidad,
      });
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
  const existentes = await fetchPaged(
    "panol_materiales",
    "id, categoria_id, codigo, descripcion, proveedor, unidad_medida, precio_unitario, moneda, revisado, origen, notas, activo",
    "descripcion",
  );
  const existingBySectorAndDesc = new Map();
  for (const material of existentes) {
    if (!categoriaIds.has(material.categoria_id)) continue;
    existingBySectorAndDesc.set(
      `${material.categoria_id}::${norm(material.descripcion)}`,
      material,
    );
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
          .update(
            materialPatchFromParsed(item, categoria.id, batch.id, existing),
          )
          .eq("id", existing.id);
        if (error) throw error;
        stats.actualizados += 1;
      } else {
        const { data, error } = await supabase
          .from("panol_materiales")
          .insert(materialPatchFromParsed(item, categoria.id, batch.id))
          .select(
            "id, categoria_id, codigo, descripcion, proveedor, unidad_medida, precio_unitario, moneda, revisado, origen, notas, activo",
          )
          .single();
        if (error) throw error;
        materialId = data.id;
        existingBySectorAndDesc.set(key, data);
        stats.creados += 1;
      }

      stats.cantidades_upsert += await upsertModelos(
        materialId,
        item.cantidades,
      );
    }
  }

  await supabase
    .from("panol_import_batches")
    .update({ stats })
    .eq("id", batch.id);
  return stats;
}

export async function guardarMaterial(material, cantidades, { revisado } = {}) {
  const patch = {
    categoria_id: material.categoria_id,
    proveedor_id: material.proveedor_id || null,
    codigo: material.codigo || null,
    descripcion: material.descripcion?.trim(),
    proveedor: material.proveedor || null,
    unidad_medida: normalizeUnidadMedida(material.unidad_medida, null),
    precio_unitario: toNullableNumber(material.precio_unitario),
    moneda: material.moneda || null,
    imagen_url: material.imagen_url || null,
    links: normalizeMaterialLinks(material.links),
    notas: material.notas || null,
    variantes: normalizeVariantes(material.variantes),
    variantes_precios:
      material.variantes_precios === undefined
        ? undefined
        : normalizeVariantesPrecios(
            material.variantes_precios,
            material.variantes,
          ),
    alias: material.alias || null,
    activo: material.activo ?? true,
    codigo_barra: material.codigo_barra || null,
    // Solo se incluye si viene definido, para no pisar el flag al editar otros campos.
    ...(material.es_consumible !== undefined
      ? { es_consumible: !!material.es_consumible }
      : {}),
  };
  if (revisado != null) patch.revisado = revisado;

  let { error } = await supabase
    .from("panol_materiales")
    .update(patch)
    .eq("id", material.id);
  if (error && isMissingColumn(error)) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.variantes;
    delete fallbackPatch.variantes_precios;
    delete fallbackPatch.links;
    delete fallbackPatch.alias;
    const retry = await supabase
      .from("panol_materiales")
      .update(fallbackPatch)
      .eq("id", material.id);
    error = retry.error;
  }
  if (error) throw error;
  await guardarCantidades(material.id, cantidades);
}

export async function actualizarMaterialDatos(material, { revisado } = {}) {
  if (!material?.id) throw new Error("Falta el material.");
  const patch = {
    categoria_id: material.categoria_id,
    proveedor_id: material.proveedor_id || null,
    codigo: material.codigo || null,
    descripcion: material.descripcion?.trim(),
    proveedor: material.proveedor || null,
    unidad_medida: normalizeUnidadMedida(material.unidad_medida, null),
    precio_unitario: toNullableNumber(material.precio_unitario),
    moneda: material.moneda || null,
    imagen_url: material.imagen_url || null,
    links: normalizeMaterialLinks(material.links),
    notas: material.notas || null,
    variantes: normalizeVariantes(material.variantes),
    variantes_precios:
      material.variantes_precios === undefined
        ? undefined
        : normalizeVariantesPrecios(
            material.variantes_precios,
            material.variantes,
          ),
    alias: material.alias || null,
    activo: material.activo ?? true,
    codigo_barra: material.codigo_barra || null,
    // Solo se incluye si viene definido, para no pisar el flag al editar otros campos.
    ...(material.es_consumible !== undefined
      ? { es_consumible: !!material.es_consumible }
      : {}),
  };
  if (revisado != null) patch.revisado = revisado;

  let { error } = await supabase
    .from("panol_materiales")
    .update(patch)
    .eq("id", material.id);
  if (error && isMissingColumn(error)) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.variantes;
    delete fallbackPatch.variantes_precios;
    delete fallbackPatch.links;
    delete fallbackPatch.alias;
    const retry = await supabase
      .from("panol_materiales")
      .update(fallbackPatch)
      .eq("id", material.id);
    error = retry.error;
  }
  if (error) throw error;
}

/**
 * Guarda SOLO las variantes de un material (la lista y su info por variante).
 *
 * Update puntual a propósito: el autoguardado del catálogo no debe reescribir el
 * resto de las columnas, así no pisa cambios que otro usuario haya hecho en el
 * mismo material mientras esta fila estaba abierta.
 */
export async function guardarVariantesMaterial(
  materialId,
  variantes,
  variantesPrecios,
) {
  if (!materialId) throw new Error("Falta el material.");
  const lista = normalizeVariantes(variantes);
  const patch = { variantes: lista };
  if (variantesPrecios !== undefined) {
    patch.variantes_precios = normalizeVariantesPrecios(
      variantesPrecios,
      lista,
    );
  }

  let { error } = await supabase
    .from("panol_materiales")
    .update(patch)
    .eq("id", materialId);
  if (error && isMissingColumn(error)) {
    // Base sin la columna de precios por variante: guardamos al menos la lista.
    const retry = await supabase
      .from("panol_materiales")
      .update({ variantes: lista })
      .eq("id", materialId);
    error = retry.error;
  }
  if (error) throw error;
}

export async function crearMaterial(material, cantidades = {}) {
  let { data, error } = await supabase
    .from("panol_materiales")
    .insert({
      categoria_id: material.categoria_id,
      proveedor_id: material.proveedor_id || null,
      codigo: material.codigo || null,
      descripcion: material.descripcion?.trim(),
      proveedor: material.proveedor || null,
      unidad_medida: normalizeUnidadMedida(material.unidad_medida, null),
      precio_unitario: toNullableNumber(material.precio_unitario),
      moneda: material.moneda || null,
      imagen_url: material.imagen_url || null,
      links: normalizeMaterialLinks(material.links),
      variantes: normalizeVariantes(material.variantes),
      variantes_precios:
        material.variantes_precios === undefined
          ? undefined
          : normalizeVariantesPrecios(
              material.variantes_precios,
              material.variantes,
            ),
      alias: material.alias || null,
      notas: material.notas || null,
      origen: material.origen || "manual",
      codigo_barra: material.codigo_barra || null,
      revisado: material.revisado ?? true,
      activo: true,
      es_consumible: !!material.es_consumible,
    })
    .select("id")
    .single();
  if (error && isMissingColumn(error)) {
    const retry = await supabase
      .from("panol_materiales")
      .insert({
        categoria_id: material.categoria_id,
        proveedor_id: material.proveedor_id || null,
        codigo: material.codigo || null,
        descripcion: material.descripcion?.trim(),
        proveedor: material.proveedor || null,
        unidad_medida: normalizeUnidadMedida(material.unidad_medida, null),
        precio_unitario: toNullableNumber(material.precio_unitario),
        moneda: material.moneda || null,
        imagen_url: material.imagen_url || null,
        origen: material.origen || "manual",
        revisado: material.revisado ?? true,
        activo: true,
      })
      .select("id")
      .single();
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  await guardarCantidades(data.id, cantidades);
  return data.id;
}

/**
 * Alta rápida de material desde el flujo de conteo. Acepta los mismos campos
 * "chicos" que el editor completo del catálogo (proveedor, código, precio,
 * alias, observaciones) para no tener que volver después a completarlos.
 * Devuelve el objeto material completo (no solo el ID).
 */
export async function crearMaterialRapido({
  descripcion,
  categoriaId = null,
  unidadMedida = "unidad",
  proveedor = "",
  codigo = "",
  precioUnitario = null,
  moneda = "ARS",
  alias = "",
  notas = "",
  variantes = [],
  variantesPrecios = {},
  imagenUrl = null,
  links = [],
  esConsumible = false,
} = {}) {
  if (!String(descripcion || "").trim())
    throw new Error("Cargá una descripción.");
  if (!categoriaId)
    throw new Error("Elegí un rubro para el material (es obligatorio).");
  const id = await crearMaterial({
    descripcion: String(descripcion).trim(),
    categoria_id: categoriaId,
    unidad_medida: normalizeUnidadMedida(unidadMedida, "unidad"),
    proveedor: String(proveedor || "").trim() || null,
    codigo: String(codigo || "").trim() || null,
    precio_unitario: precioUnitario,
    moneda: moneda || "ARS",
    alias: String(alias || "").trim() || null,
    notas: String(notas || "").trim() || null,
    variantes,
    variantes_precios: variantesPrecios,
    imagen_url: imagenUrl || null,
    links,
    revisado: false,
    origen: "conteo",
    es_consumible: !!esConsumible,
  });
  const { data, error } = await supabase
    .from("panol_materiales")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return {
    ...data,
    variantes: normalizeVariantes(data.variantes),
    codigos_barra: [],
    modelos: [],
    areas: [data.categoria_id].filter(Boolean),
  };
}

/** Guarda solo el campo de observaciones (notas) de un material, sin tocar nada más. */
export async function actualizarNotasMaterial(materialId, notas) {
  if (!materialId) return;
  const { error } = await supabase
    .from("panol_materiales")
    .update({ notas: String(notas || "").trim() || null })
    .eq("id", materialId);
  if (error) throw error;
}

export async function guardarCantidades(materialId, cantidades = {}) {
  const rows = [];
  const toDelete = [];
  for (const modelo of MODELOS) {
    const raw = cantidades[modelo];
    const n = raw === "" || raw == null ? null : Number(raw);
    if (n != null && Number.isFinite(n) && n > 0) {
      rows.push({
        material_id: materialId,
        modelo,
        variante: VARIANTE_BASE,
        cantidad: n,
      });
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
  await supabase
    .from("panol_materiales")
    .update({ categoria_id: principal })
    .eq("id", materialId);
  await supabase
    .from("panol_material_categorias")
    .delete()
    .eq("material_id", materialId);
  const extra = limpios
    .slice(1)
    .map((categoria_id) => ({ material_id: materialId, categoria_id }));
  if (extra.length)
    await supabase.from("panol_material_categorias").insert(extra);
}

export async function borrarMaterial(materialId) {
  const { error: bomError } = await supabase
    .from("panol_material_modelo")
    .delete()
    .eq("material_id", materialId);
  if (bomError) throw bomError;
  const { error } = await supabase
    .from("panol_materiales")
    .delete()
    .eq("id", materialId);
  if (error) throw error;
}

export async function archivarMateriales(materialIds = []) {
  const ids = [...new Set((materialIds || []).filter(Boolean))];
  if (!ids.length) return 0;
  const { error } = await supabase
    .from("panol_materiales")
    .update({ activo: false })
    .in("id", ids);
  if (error) throw error;
  return ids.length;
}

function sortedMaterialPair(a, b) {
  const pair = [a, b].filter(Boolean).map(String).sort();
  return pair.length === 2 && pair[0] !== pair[1] ? pair : null;
}

function materialPairs(materialIds = []) {
  const ids = [
    ...new Set((materialIds || []).filter(Boolean).map(String)),
  ].sort();
  const rows = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      rows.push({ material_a_id: ids[i], material_b_id: ids[j] });
    }
  }
  return rows;
}

export async function fetchMaterialDuplicateDecisions() {
  try {
    const rows = await fetchPaged(
      "panol_material_duplicate_decisions",
      "material_a_id, material_b_id, decision",
      "created_at",
    );
    return rows
      .filter((row) => row.decision === "not_duplicate")
      .map((row) => {
        const pair = sortedMaterialPair(row.material_a_id, row.material_b_id);
        return pair ? `${pair[0]}:${pair[1]}` : "";
      })
      .filter(Boolean);
  } catch (error) {
    if (isMissingTable(error) || isMissingColumn(error)) return [];
    throw error;
  }
}

export async function marcarMaterialesNoDuplicados(
  materialIds = [],
  { groupKey = "", reason = "" } = {},
) {
  const rows = materialPairs(materialIds).map((row) => ({
    ...row,
    decision: "not_duplicate",
    group_key: groupKey || null,
    reason: reason || null,
  }));
  if (!rows.length) return 0;
  const { error } = await supabase
    .from("panol_material_duplicate_decisions")
    .upsert(rows, { onConflict: "material_a_id,material_b_id" });
  if (error) {
    if (isMissingTable(error) || isMissingColumn(error)) return 0;
    throw error;
  }
  return rows.length;
}

export async function guardarProveedor(proveedor) {
  const patch = {
    nombre: proveedor.nombre?.trim(),
    cuit: proveedor.cuit || null,
    email: proveedor.email || null,
    telefono: proveedor.telefono || null,
    notas: proveedor.notas || null,
    tipo: proveedor.tipo || null,
    rubros: proveedor.rubros || null,
    sede: proveedor.sede || null,
    perfil: proveedor.perfil || null,
    compite_con: proveedor.compite_con || null,
    activo: proveedor.activo ?? true,
  };
  if (!patch.nombre) throw new Error("El nombre del proveedor es obligatorio.");
  if (proveedor.id) {
    const { error } = await supabase
      .from("panol_proveedores")
      .update(patch)
      .eq("id", proveedor.id);
    if (error) throw error;
    return proveedor.id;
  }
  const { data, error } = await supabase
    .from("panol_proveedores")
    .insert(patch)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function bajaProveedor(id) {
  const { error } = await supabase
    .from("panol_proveedores")
    .update({ activo: false })
    .eq("id", id);
  if (error) throw error;
}

export async function uploadMaterialImage(materialId, file) {
  if (!materialId || !file) throw new Error("Falta material o archivo.");
  const ext = file.name?.split(".").pop() || "jpg";
  const path = `${materialId}/${Date.now()}-${safeFilePart(file.name || `imagen.${ext}`)}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_MATERIALES)
    .upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET_MATERIALES).getPublicUrl(path);
  const { data: row, error: imgError } = await supabase
    .from("panol_material_imagenes")
    .insert({
      material_id: materialId,
      url: publicUrl,
      nombre: file.name || path,
    })
    .select("id, material_id, url, nombre, created_at")
    .single();
  if (imgError) throw imgError;
  const { error: matError } = await supabase
    .from("panol_materiales")
    .update({ imagen_url: publicUrl })
    .eq("id", materialId);
  if (matError) throw matError;
  return row;
}

export async function uploadMaterialVariantImage(
  materialId,
  variantName,
  file,
) {
  if (!materialId || !variantName || !file)
    throw new Error("Falta material, variante o archivo.");
  const ext = file.name?.split(".").pop() || "jpg";
  const variant = safeFilePart(variantName);
  const path = `${materialId}/variantes/${variant}/${Date.now()}-${safeFilePart(file.name || `imagen.${ext}`)}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_MATERIALES)
    .upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET_MATERIALES).getPublicUrl(path);
  return { url: publicUrl, path };
}

export async function uploadComprobanteFile(file) {
  if (!file) return null;
  const path = `comprobantes/${Date.now()}-${safeFilePart(file.name || "comprobante")}`;
  const { error } = await supabase.storage
    .from(BUCKET_COMPROBANTES)
    .upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function guardarComprobante(comprobante, file = null) {
  const archivoPath = file
    ? await uploadComprobanteFile(file)
    : comprobante.archivo_url || null;
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
      .select(
        "id, proveedor_id, proveedor, numero, fecha, moneda, archivo_url, estado, total, created_at",
      )
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("panol_comprobantes")
    .insert(patch)
    .select(
      "id, proveedor_id, proveedor, numero, fecha, moneda, archivo_url, estado, total, created_at",
    )
    .single();
  if (error) throw error;
  return data;
}

export async function guardarComprobanteItem(item) {
  const patch = {
    comprobante_id: item.comprobante_id,
    material_id: item.material_id || null,
    descripcion: item.descripcion?.trim(),
    // Conservamos el texto leído del comprobante aunque luego se edite o se
    // vincule a otro material del catálogo.
    descripcion_original: (
      item.descripcion_original ||
      item.descripcion ||
      ""
    ).trim(),
    cantidad: toNullableNumber(item.cantidad),
    precio_unitario: toNullableNumber(item.precio_unitario),
    total: toNullableNumber(item.total),
    aplicado: item.aplicado ?? false,
  };
  if (!patch.comprobante_id) throw new Error("Primero guardá el comprobante.");
  if (!patch.descripcion)
    throw new Error("La descripción del ítem es obligatoria.");

  if (item.id) {
    const { data, error } = await supabase
      .from("panol_comprobante_items")
      .update(patch)
      .eq("id", item.id)
      .select(
        "id, comprobante_id, material_id, descripcion, descripcion_original, cantidad, precio_unitario, total, aplicado",
      )
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("panol_comprobante_items")
    .insert(patch)
    .select(
      "id, comprobante_id, material_id, descripcion, descripcion_original, cantidad, precio_unitario, total, aplicado",
    )
    .single();
  if (error) throw error;
  return data;
}

export async function guardarComprobanteItems(comprobanteId, items = []) {
  const saved = [];
  for (const item of items) {
    saved.push(
      await guardarComprobanteItem({ ...item, comprobante_id: comprobanteId }),
    );
  }
  return saved;
}

export async function borrarComprobanteItem(id) {
  const { error } = await supabase
    .from("panol_comprobante_items")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function aplicarPreciosComprobante(comprobante, items) {
  if (!comprobante?.id) throw new Error("Falta comprobante.");
  const fecha = comprobante.fecha || new Date().toISOString().slice(0, 10);
  const usable = (items ?? []).filter(
    (item) => item.material_id && !item.aplicado,
  );
  let actualizados = 0;
  const appliedIds = new Set();

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

    const { error: matError } = await supabase
      .from("panol_materiales")
      .update(materialPatch)
      .eq("id", item.material_id);
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
    appliedIds.add(item.id);
  }

  const total = (items ?? []).reduce(
    (sum, item) => sum + (toNullableNumber(item.total) ?? 0),
    0,
  );
  const hasPendingLines = (items ?? []).some(
    (item) => !item.aplicado && !appliedIds.has(item.id),
  );
  const { error: compError } = await supabase
    .from("panol_comprobantes")
    .update({ estado: hasPendingLines ? "borrador" : "procesado", total })
    .eq("id", comprobante.id);
  if (compError) throw compError;

  return {
    actualizados,
    omitidos: usable.length - actualizados,
    pendientes: hasPendingLines,
    total,
  };
}

export async function leerComprobanteConIA(file) {
  if (!file) throw new Error("Subí una foto del comprobante primero.");
  if (!file.type.startsWith("image/"))
    throw new Error("La lectura con IA sólo funciona con imágenes.");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1)
    binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const { data, error } = await supabase.functions.invoke(
    "extraer-comprobante",
    {
      body: { image_base64: base64, mime_type: file.type },
    },
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// Lee un presupuesto desde TEXTO pegado o archivo (imagen/PDF) → { proveedor, items[] }.
export async function leerPresupuestoConIA({
  text = "",
  file = null,
  sectores = [],
} = {}) {
  let body;
  if (text && text.trim()) {
    body = { text: text.trim() };
  } else if (file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1)
      binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const isPDF =
      file.type === "application/pdf" ||
      (file.name || "").toLowerCase().endsWith(".pdf");
    body = isPDF
      ? {
          base64,
          mime_type: "application/pdf",
          filename: file.name || "presupuesto.pdf",
        }
      : { image_base64: base64, mime_type: file.type || "image/jpeg" };
  } else {
    throw new Error("Pegá el texto del presupuesto o subí un archivo.");
  }
  if (Array.isArray(sectores) && sectores.length) body.sectores = sectores;
  const { data, error } = await supabase.functions.invoke(
    "extraer-comprobante",
    { body },
  );
  if (error) {
    // El mensaje real de la función viene en el body de la respuesta (no en error.message).
    let detalle = "";
    try {
      const r = await error.context?.json?.();
      detalle = r?.error || "";
    } catch {
      /* ignore */
    }
    if (!detalle) {
      try {
        detalle = await error.context?.text?.();
      } catch {
        /* ignore */
      }
    }
    throw new Error(
      detalle || error.message || "No se pudo leer el presupuesto.",
    );
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Actualiza el precio vigente de un material (historial tolerante) y, opcionalmente,
// corrige su sector (categoria_id) si venía mal clasificado.
export async function aplicarPrecioMaterial(
  materialId,
  {
    precio,
    moneda = "ARS",
    proveedor = null,
    proveedor_id = null,
    categoria_id = null,
  } = {},
) {
  if (!materialId) return false;
  const pu = toNullableNumber(precio);
  const mon = moneda || "ARS";
  const patch = {};
  if (pu != null) {
    patch.precio_unitario = pu;
    patch.moneda = mon;
    patch.proveedor = proveedor || null;
    patch.proveedor_id = proveedor_id || null;
  }
  if (categoria_id) patch.categoria_id = categoria_id;
  if (!Object.keys(patch).length) return false;
  const { error: matErr } = await supabase
    .from("panol_materiales")
    .update(patch)
    .eq("id", materialId);
  if (matErr) throw matErr;
  if (pu != null) {
    try {
      await supabase.from("panol_precios").insert({
        material_id: materialId,
        proveedor_id: proveedor_id || null,
        proveedor: proveedor || null,
        precio_unitario: pu,
        moneda: mon,
        fuente: "presupuesto",
        fecha: new Date().toISOString().slice(0, 10),
      });
    } catch {
      /* historial opcional */
    }
  }
  return true;
}

// Promotes the chosen supplier to the current quote while retaining prior suppliers
// as alternatives for comparison on the material.
export async function registrarOfertaMaterial(
  material,
  proveedor,
  { precio, moneda = "ARS" } = {},
) {
  if (!material?.id) throw new Error("Falta el material.");
  if (!proveedor?.id) throw new Error("Elegí un proveedor.");
  const pu = toNullableNumber(precio);
  if (pu == null || pu < 0) throw new Error("Cargá un precio válido.");

  const alternatives = new Map();
  for (const item of material.proveedores_lista || []) {
    if (item?.proveedor_id && item.proveedor_id !== proveedor.id)
      alternatives.set(item.proveedor_id, {
        proveedor_id: item.proveedor_id,
        precio: item.precio,
        moneda: item.moneda,
      });
  }
  if (material.proveedor_id && material.proveedor_id !== proveedor.id) {
    alternatives.set(material.proveedor_id, {
      proveedor_id: material.proveedor_id,
      precio: material.precio_unitario,
      moneda: material.moneda || "ARS",
    });
  }

  await aplicarPrecioMaterial(material.id, {
    precio: pu,
    moneda,
    proveedor: proveedor.nombre,
    proveedor_id: proveedor.id,
  });
  await setProveedoresMaterial(material.id, [...alternatives.values()]);
}

/**
 * Asigna el proveedor PRINCIPAL a varios materiales de una sola vez, sin exigir
 * precio (aplicarPrecioMaterial sólo setea el proveedor cuando hay precio, así
 * que no sirve para la asignación masiva de la bandeja "Sin proveedor").
 *
 * No toca precios ni proveedores alternativos: sólo completa quién provee.
 * Devuelve la cantidad de materiales actualizados.
 */
export async function asignarProveedorPrincipalMasivo(materialIds, proveedor) {
  const ids = [...new Set((materialIds || []).filter(Boolean))];
  if (!ids.length) return 0;
  if (!proveedor?.id) throw new Error("Elegí un proveedor.");

  // En tandas: un .in() con miles de ids revienta el límite de la URL.
  const LOTE = 200;
  let total = 0;
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    const { error } = await supabase
      .from("panol_materiales")
      .update({ proveedor_id: proveedor.id, proveedor: proveedor.nombre ?? null })
      .in("id", lote);
    if (error) throw error;
    total += lote.length;
  }
  return total;
}

export async function asociarProveedorMaterial(
  material,
  proveedor,
  { precio = null, moneda = null } = {},
) {
  if (!material?.id) throw new Error("Falta el material.");
  if (!proveedor?.id) throw new Error("Elegí un proveedor.");
  if (material.proveedor_id === proveedor.id) return;
  const alternatives = new Map();
  for (const item of material.proveedores_lista || []) {
    if (item?.proveedor_id)
      alternatives.set(item.proveedor_id, {
        proveedor_id: item.proveedor_id,
        precio: item.precio,
        moneda: item.moneda,
      });
  }
  alternatives.set(proveedor.id, {
    proveedor_id: proveedor.id,
    precio: toNullableNumber(precio),
    moneda: moneda || null,
  });
  await setProveedoresMaterial(material.id, [...alternatives.values()]);
}

// A variant quote belongs to the selected variant and must not overwrite the base price.
export async function guardarPrecioVarianteMaterial(
  material,
  variante,
  { precio, moneda = "ARS", proveedor = null } = {},
) {
  if (!material?.id || !variante)
    throw new Error("Falta el material o la variante.");
  const pu = toNullableNumber(precio);
  if (pu == null || pu < 0) throw new Error("Cargá un precio válido.");
  const current =
    material.variantes_precios && typeof material.variantes_precios === "object"
      ? material.variantes_precios
      : {};
  const previous = current[variante] || {};
  await guardarVariantesMaterial(
    material.id,
    material.variantes || [variante],
    {
      ...current,
      [variante]: {
        ...previous,
        precio: pu,
        moneda,
        proveedor_id: proveedor?.id || previous.proveedor_id || null,
        proveedor: proveedor?.nombre || previous.proveedor || null,
      },
    },
  );
}

// Setea la cantidad del BOM de un material para una línea/modelo, sin tocar las demás.
export async function setCantidadModelo(materialId, modelo, cantidad) {
  const n = toNullableNumber(cantidad);
  if (!materialId || !modelo) return;
  if (n == null || n <= 0) {
    await quitarCantidadModelo(materialId, modelo);
    return;
  }
  const { error } = await supabase.from("panol_material_modelo").upsert(
    {
      material_id: materialId,
      modelo: String(modelo),
      variante: VARIANTE_BASE,
      cantidad: n,
    },
    { onConflict: "material_id,modelo,variante" },
  );
  if (error) throw error;
}

export async function quitarCantidadModelo(materialId, modelo) {
  if (!materialId || !modelo) return;
  const { error } = await supabase
    .from("panol_material_modelo")
    .delete()
    .eq("material_id", materialId)
    .eq("modelo", String(modelo))
    .eq("variante", VARIANTE_BASE);
  if (error) throw error;
}

/* ── Calibración de peso por pieza (balanza) ──────────────────────────────── */

/**
 * Consumibles del catálogo con su estado de calibración de peso.
 * Se usa en la pantalla de calibración y para avisar cuáles faltan.
 */
export async function fetchConsumiblesPeso() {
  const cols =
    "id, descripcion, codigo, unidad_medida, es_consumible, peso_unitario_g, peso_muestra_piezas, peso_calibrado_at";
  const { data, error } = await supabase
    .from("panol_materiales")
    .select(cols)
    .eq("es_consumible", true)
    .neq("activo", false)
    .order("descripcion");
  if (error) throw error;
  return data ?? [];
}

export async function fetchConsumiblesPanol() {
  const cols =
    "id, categoria_id, proveedor_id, codigo, codigo_barra, descripcion, alias, proveedor, unidad_medida, precio_unitario, moneda, notas, activo, es_consumible, peso_unitario_g, peso_muestra_piezas, peso_calibrado_at";
  let { data, error } = await supabase
    .from("panol_materiales")
    .select(cols)
    .eq("es_consumible", true)
    .neq("activo", false)
    .order("descripcion");
  if (error && isMissingColumn(error)) {
    const retry = await supabase
      .from("panol_materiales")
      .select(
        "id, categoria_id, proveedor_id, codigo, codigo_barra, descripcion, alias, proveedor, unidad_medida, precio_unitario, moneda, notas, activo, es_consumible",
      )
      .eq("es_consumible", true)
      .neq("activo", false)
      .order("descripcion");
    data = retry.data;
    error = retry.error;
    if (!error)
      data = (data ?? []).map((row) => ({
        ...row,
        es_consumible: true,
        peso_unitario_g: null,
        peso_muestra_piezas: null,
        peso_calibrado_at: null,
      }));
  }
  if (error && isMissingColumn(error)) {
    throw new Error("Falta correr el SQL de consumibles y peso unitario.");
  }
  if (error) throw error;

  const rows = data ?? [];
  const codigos = await fetchMaterialCodigosBarraRows();
  const ids = new Set(rows.map((row) => row.id).filter(Boolean));
  const codigosByMaterial = new Map();
  for (const codigo of codigos) {
    if (!ids.has(codigo.material_id) || codigo.activo === false) continue;
    const list = codigosByMaterial.get(codigo.material_id) ?? [];
    list.push(codigo);
    codigosByMaterial.set(codigo.material_id, list);
  }

  return rows.map((row) => ({
    ...row,
    unidad_medida: normalizeUnidadMedida(row.unidad_medida, "unidad"),
    codigos_barra: codigosByMaterial.get(row.id) ?? [],
  }));
}

export async function crearConsumiblePanol({
  descripcion = "",
  categoriaId = null,
  unidadMedida = "unidad",
  proveedor = "",
  codigo = "",
  codigoBarra = "",
  notas = "",
} = {}) {
  const material = await crearMaterialRapido({
    descripcion,
    categoriaId,
    unidadMedida,
    proveedor,
    codigo,
    notas,
    esConsumible: true,
  });
  const cleanBarcode = String(codigoBarra || "").trim();
  const codigos = [];
  if (cleanBarcode)
    codigos.push(
      await agregarCodigoBarraMaterial(material.id, cleanBarcode, {
        etiqueta: "Principal",
      }),
    );
  return { ...material, es_consumible: true, codigos_barra: codigos };
}

export async function actualizarConsumiblePanol(materialId, fields = {}) {
  if (!materialId) throw new Error("Falta el consumible.");
  const patch = {
    descripcion: String(fields.descripcion || "").trim(),
    categoria_id: fields.categoria_id || null,
    proveedor: String(fields.proveedor || "").trim() || null,
    codigo: String(fields.codigo || "").trim() || null,
    unidad_medida: normalizeUnidadMedida(fields.unidad_medida, "unidad"),
    notas: String(fields.notas || "").trim() || null,
    es_consumible: true,
    activo: fields.activo ?? true,
  };
  if (!patch.descripcion)
    throw new Error("Cargá la descripción del consumible.");

  let { data, error } = await supabase
    .from("panol_materiales")
    .update(patch)
    .eq("id", materialId)
    .select(
      "id, categoria_id, proveedor_id, codigo, codigo_barra, descripcion, alias, proveedor, unidad_medida, precio_unitario, moneda, notas, activo, es_consumible, peso_unitario_g, peso_muestra_piezas, peso_calibrado_at",
    )
    .single();
  if (error && isMissingColumn(error)) {
    const fallback = { ...patch };
    delete fallback.es_consumible;
    const retry = await supabase
      .from("panol_materiales")
      .update(fallback)
      .eq("id", materialId)
      .select(
        "id, categoria_id, proveedor_id, codigo, codigo_barra, descripcion, alias, proveedor, unidad_medida, precio_unitario, moneda, notas, activo",
      )
      .single();
    data = retry.data
      ? {
          ...retry.data,
          es_consumible: true,
          peso_unitario_g: null,
          peso_muestra_piezas: null,
          peso_calibrado_at: null,
        }
      : retry.data;
    error = retry.error;
  }
  if (error) throw error;
  return {
    ...data,
    unidad_medida: normalizeUnidadMedida(data.unidad_medida, "unidad"),
  };
}

export async function sacarConsumiblePanol(materialId) {
  if (!materialId) throw new Error("Falta el consumible.");
  const { error } = await supabase
    .from("panol_materiales")
    .update({ es_consumible: false })
    .eq("id", materialId);
  if (error) throw error;
}

export async function guardarPesoUnitarioDirecto(materialId, pesoUnitarioG) {
  const g = toNullableNumber(String(pesoUnitarioG ?? "").replace(",", "."));
  if (!materialId) throw new Error("Falta el consumible.");
  if (g == null || g <= 0) throw new Error("Cargá un peso unitario válido.");
  const { data, error } = await supabase
    .from("panol_materiales")
    .update({
      peso_unitario_g: g,
      peso_muestra_piezas: null,
      peso_calibrado_at: new Date().toISOString(),
    })
    .eq("id", materialId)
    .select("id, peso_unitario_g, peso_muestra_piezas, peso_calibrado_at")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Guarda el peso unitario calculado a partir de una muestra pesada.
 * `gramosMuestra` es el peso NETO de `piezas` unidades.
 */
export async function guardarPesoUnitario(
  materialId,
  { gramosMuestra, piezas },
) {
  const g = Number(gramosMuestra);
  const n = Number(piezas);
  if (!Number.isFinite(g) || g <= 0)
    throw new Error("El peso de la muestra no es válido.");
  if (!Number.isFinite(n) || n <= 0)
    throw new Error("La cantidad de piezas no es válida.");
  const { data, error } = await supabase
    .from("panol_materiales")
    .update({
      peso_unitario_g: g / n,
      peso_muestra_piezas: Math.round(n),
      peso_calibrado_at: new Date().toISOString(),
    })
    .eq("id", materialId)
    .select("id, peso_unitario_g, peso_muestra_piezas, peso_calibrado_at")
    .single();
  if (error) throw error;
  return data;
}

/** Borra la calibración de un producto (por si quedó mal cargada). */
export async function borrarPesoUnitario(materialId) {
  const { error } = await supabase
    .from("panol_materiales")
    .update({
      peso_unitario_g: null,
      peso_muestra_piezas: null,
      peso_calibrado_at: null,
    })
    .eq("id", materialId);
  if (error) throw error;
}
