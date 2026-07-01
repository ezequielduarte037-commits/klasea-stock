import { supabase } from "@/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// API del módulo Pedidos / Recepción a Pañol.
// Toda escritura pasa por RPCs `security definer` (panol_crear_envio,
// panol_marcar_items, panol_set_estado) para mantener atómicos: items + eventos
// (historial) + recálculo del estado de cabecera. Ver migración del módulo.
// ─────────────────────────────────────────────────────────────────────────────

export const SEDES_PANOL = ["Pampa", "Chubut"];

export const ENVIO_ESTADOS = ["borrador", "enviado", "en_preparacion", "parcial", "recibido", "cerrado", "cancelado"];
export const ITEM_ESTADOS = ["pendiente", "recibido", "parcial", "sin_info", "falta_stock", "rechazado"];

// Estados de ítem que cuentan como "aviso operativo" (Pañol detectó un problema).
export const ITEM_ESTADOS_PROBLEMA = ["sin_info", "falta_stock", "rechazado"];

export const ITEM_ESTADO_META = {
  pendiente:   { label: "Pendiente",   color: "#9ca3af", bg: "rgba(156,163,175,0.12)", border: "rgba(156,163,175,0.30)" },
  recibido:    { label: "Recibido",    color: "#34d399", bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.30)" },
  parcial:     { label: "Parcial",     color: "#a78bfa", bg: "rgba(139,92,246,0.12)",  border: "rgba(139,92,246,0.30)" },
  sin_info:    { label: "Sin info",    color: "#60a5fa", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.30)" },
  falta_stock: { label: "Falta stock", color: "#fbbf24", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.30)" },
  rechazado:   { label: "Rechazado",   color: "#f87171", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.30)" },
};

export const ENVIO_ESTADO_META = {
  borrador:       { label: "Borrador",       color: "#9ca3af" },
  enviado:        { label: "Enviado",        color: "#fbbf24" },
  en_preparacion: { label: "En preparación", color: "#60a5fa" },
  parcial:        { label: "Parcial",        color: "#a78bfa" },
  recibido:       { label: "Recibido",       color: "#34d399" },
  cerrado:        { label: "Cerrado",        color: "#6b7280" },
  cancelado:      { label: "Cancelado",      color: "#f87171" },
};

function isMissingColumn(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return error.code === "42703" || msg.includes("could not find") || msg.includes("column");
}

function normalizeSearch(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNullableNumber(value = "") {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function fetchPaged(table, select, { order = "id", limit = 1000 } = {}) {
  const out = [];
  for (let from = 0; ; from += limit) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(order)
      .range(from, from + limit - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < limit) break;
  }
  return out;
}

// Resumen de estados de los ítems de un envío (para KPIs y chips de la bandeja).
export function resumenItems(items = []) {
  const total = items.length;
  const by = {};
  for (const e of ITEM_ESTADOS) by[e] = 0;
  for (const it of items) by[it.estado] = (by[it.estado] ?? 0) + 1;
  const recibidos = by.recibido ?? 0;
  const problemas = ITEM_ESTADOS_PROBLEMA.reduce((s, e) => s + (by[e] ?? 0), 0);
  const pendientes = by.pendiente ?? 0;
  return { total, by, recibidos, problemas, pendientes, pctRecibido: total ? Math.round((recibidos / total) * 100) : 0 };
}

// ─── Lecturas ─────────────────────────────────────────────────────────────────
export async function fetchEnvios({ sede = null, estados = null } = {}) {
  let q = supabase
    .from("panol_envios")
    .select("*, obra:produccion_obras(id,codigo), items:panol_envio_items(id,estado)")
    .order("created_at", { ascending: false });
  if (sede) q = q.eq("sede", sede);
  if (estados?.length) q = q.in("estado", estados);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchEnvio(id) {
  const { data, error } = await supabase
    .from("panol_envios")
    .select("*, obra:produccion_obras(id,codigo), items:panol_envio_items(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchEventos(envioId) {
  const { data, error } = await supabase
    .from("panol_envio_eventos")
    .select("*, actor:profiles(id,username)")
    .eq("envio_id", envioId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Envíos vinculados a un pedido de compras (para el panel "Estado en Pañol").
export async function fetchEnviosDePedido(purchaseRequestId) {
  const { data, error } = await supabase
    .from("panol_envios")
    .select("*, items:panol_envio_items(id,estado)")
    .eq("purchase_request_id", purchaseRequestId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchEnviosRegistro({ limit = 80 } = {}) {
  const { data, error } = await supabase
    .from("panol_envios")
    .select(`
      *,
      obra:produccion_obras(id,codigo),
      items:panol_envio_items(*),
      eventos:panol_envio_eventos(*, actor:profiles(id,username))
    `)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((envio) => ({
    ...envio,
    items: envio.items ?? [],
    eventos: [...(envio.eventos ?? [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  }));
}

export async function fetchLinkedPurchaseRequestForEnvio(envioId) {
  if (!envioId) return null;
  const { data, error } = await supabase
    .rpc("panol_get_linked_purchase_request", { p_envio: envioId })
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function fetchMaterialesEgreso({ sede = null, estados = ["en_panol", "recibido", "parcial", "problema"] } = {}) {
  let data;
  let error;
  const runSelect = (select) => supabase
    .from("panol_obra_materiales_snapshot")
    .select(select)
    .in("estado", estados)
    .order("updated_at", { ascending: false });

  ({ data, error } = await runSelect("*, panol_envio:panol_envios(id,titulo,sede,destino,created_at)"));
  if (error && isMissingColumn(error)) {
    ({ data, error } = await runSelect("*"));
  }
  if (error) throw error;
  const rows = data ?? [];
  const materialIds = [...new Set(rows.map((row) => row.material_id).filter(Boolean))];
  const materialById = new Map();
  const categoriaById = new Map();
  if (materialIds.length) {
    let materiales = [];
    try {
      const res = await supabase
        .from("panol_materiales")
        .select("id,proveedor,categoria_id")
        .in("id", materialIds);
      if (res.error) throw res.error;
      materiales = res.data ?? [];
    } catch (metaError) {
      if (!isMissingColumn(metaError)) {
        materiales = [];
      } else {
        try {
          const res = await supabase
            .from("panol_materiales")
            .select("id,proveedor")
            .in("id", materialIds);
          if (!res.error) materiales = res.data ?? [];
        } catch {
          materiales = [];
        }
      }
    }
    for (const mat of materiales) materialById.set(mat.id, mat);
    const categoriaIds = [...new Set(materiales.map((mat) => mat.categoria_id).filter(Boolean))];
    if (categoriaIds.length) {
      try {
        const { data: categorias, error: catError } = await supabase
          .from("panol_categorias")
          .select("id,nombre")
          .in("id", categoriaIds);
        if (!catError) {
          for (const cat of categorias ?? []) categoriaById.set(cat.id, cat.nombre);
        }
      } catch {
        // La categoria es informativa para filtros; si falla, el stock sigue cargando.
      }
    }
  }
  const obraIds = [...new Set(rows.map((row) => row.obra_id).filter(Boolean))];
  let obrasById = new Map();
  if (obraIds.length) {
    try {
      const obras = await fetchObrasEgreso();
      obrasById = new Map(obras.filter((obra) => obraIds.includes(obra.id)).map((obra) => [obra.id, obra]));
    } catch {
      obrasById = new Map();
    }
  }
  const requestIds = [...new Set(rows.map((row) => row.purchase_request_id).filter(Boolean))];
  const requestById = new Map();
  if (requestIds.length) {
    try {
      const { data: requests, error: requestError } = await supabase
        .from("purchase_requests")
        .select("id,title,description,es_adicional,project_id,destino")
        .in("id", requestIds);
      if (requestError) throw requestError;
      for (const request of requests ?? []) requestById.set(request.id, request);
    } catch (requestError) {
      if (!isMissingColumn(requestError)) {
        // El detalle del pedido es informativo; el stock no debe caer por esto.
        requestById.clear();
      } else {
        try {
          const { data: requests } = await supabase
            .from("purchase_requests")
            .select("id,title,description,project_id,destino")
            .in("id", requestIds);
          for (const request of requests ?? []) requestById.set(request.id, { ...request, es_adicional: false });
        } catch {
          requestById.clear();
        }
      }
    }
  }
  const hydrated = rows.map((row) => {
    const meta = materialById.get(row.material_id) || null;
    const request = row.purchase_request_id ? requestById.get(row.purchase_request_id) || null : null;
    const categoriaId = row.categoria_id || meta?.categoria_id || null;
    return {
      ...row,
      obra: row.obra_id ? obrasById.get(row.obra_id) || null : null,
      request,
      es_adicional: row.es_adicional ?? request?.es_adicional ?? false,
      proveedor: row.proveedor || meta?.proveedor || "",
      categoria_id: categoriaId,
      categoria_nombre: row.categoria_nombre || (categoriaId ? categoriaById.get(categoriaId) : "") || "",
    };
  });
  return sede ? hydrated.filter((row) => (row.panol_envio?.sede || row.stock_sede) === sede) : hydrated;
}

export async function fetchPanolCatalogMini({ q = "", limit = 80 } = {}) {
  let rows = [];
  try {
    rows = await fetchPaged(
      "panol_materiales",
      "id,categoria_id,codigo,descripcion,proveedor,unidad_medida,precio_unitario,moneda,activo",
      { order: "descripcion", limit: 1000 },
    );
  } catch {
    return [];
  }
  const term = normalizeSearch(q);
  const active = rows.filter((row) => row.activo !== false);
  const filtered = term
    ? active.filter((row) => normalizeSearch([row.descripcion, row.codigo, row.proveedor].filter(Boolean).join(" ")).includes(term))
    : active;
  return filtered
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      categoria_id: row.categoria_id || null,
      codigo: row.codigo || "",
      descripcion: row.descripcion || "",
      proveedor: row.proveedor || "",
      unidad: row.unidad_medida || "unidad",
      precio_unitario: row.precio_unitario ?? "",
      moneda: row.moneda || "ARS",
    }));
}

async function fetchDefaultPanolCategoriaId() {
  try {
    const { data, error } = await supabase
      .from("panol_categorias")
      .select("id,nombre,orden")
      .order("orden", { ascending: true })
      .order("nombre", { ascending: true })
      .limit(80);
    if (error) throw error;
    const rows = data ?? [];
    const preferred = rows.find((row) => {
      const key = normalizeSearch(row.nombre);
      return ["sin categoria", "varios", "otros", "general"].includes(key);
    });
    return (preferred || rows[0])?.id || null;
  } catch {
    return null;
  }
}

export async function crearPanolCatalogMaterial({
  descripcion,
  codigo = "",
  unidad = "unidad",
  proveedor = "",
  precio_unitario = null,
  moneda = "ARS",
  categoria_id = null,
} = {}) {
  const cleanDesc = String(descripcion || "").trim();
  if (!cleanDesc) throw new Error("Cargá una descripción para crear el material.");
  const categoriaId = categoria_id || await fetchDefaultPanolCategoriaId();
  const patch = {
    categoria_id: categoriaId,
    codigo: String(codigo || "").trim().toUpperCase() || null,
    descripcion: cleanDesc,
    proveedor: String(proveedor || "").trim() || null,
    unidad_medida: unidad || "unidad",
    precio_unitario: toNullableNumber(precio_unitario),
    moneda: moneda === "USD" ? "USD" : "ARS",
    origen: "remito",
    revisado: false,
    activo: true,
  };
  let { data, error } = await supabase
    .from("panol_materiales")
    .insert(patch)
    .select("id,categoria_id,codigo,descripcion,proveedor,unidad_medida,precio_unitario,moneda,activo")
    .single();
  if (error && isMissingColumn(error)) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.origen;
    delete fallbackPatch.revisado;
    const retry = await supabase
      .from("panol_materiales")
      .insert(fallbackPatch)
      .select("id,categoria_id,codigo,descripcion,proveedor,unidad_medida,precio_unitario,moneda,activo")
      .single();
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  return {
    id: data.id,
    categoria_id: data.categoria_id || null,
    codigo: data.codigo || "",
    descripcion: data.descripcion || cleanDesc,
    proveedor: data.proveedor || "",
    unidad: data.unidad_medida || unidad || "unidad",
    precio_unitario: data.precio_unitario ?? "",
    moneda: data.moneda || moneda || "ARS",
  };
}

export async function crearPanolCatalogMaterialParaEgreso({
  descripcion,
  codigo = "",
  unidad = "unidad",
  proveedor = "",
  precio_unitario = null,
  moneda = "ARS",
  categoria_id = null,
} = {}) {
  const cleanDesc = String(descripcion || "").trim();
  if (!cleanDesc) throw new Error("Carga una descripcion para crear el material.");
  const { data, error } = await supabase.rpc("panol_crear_catalog_material", {
    p_descripcion: cleanDesc,
    p_codigo: String(codigo || "").trim() || null,
    p_unidad: unidad || "unidad",
    p_proveedor: String(proveedor || "").trim() || null,
    p_precio_unitario: toNullableNumber(precio_unitario),
    p_moneda: moneda === "USD" ? "USD" : "ARS",
    p_categoria_id: categoria_id || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    id: row?.id,
    categoria_id: row?.categoria_id || null,
    codigo: row?.codigo || "",
    descripcion: row?.descripcion || cleanDesc,
    proveedor: row?.proveedor || "",
    unidad: row?.unidad || row?.unidad_medida || unidad || "unidad",
    precio_unitario: row?.precio_unitario ?? "",
    moneda: row?.moneda || moneda || "ARS",
  };
}

function scorePedidoMaterial(item, material, query) {
  const itemText = normalizeSearch([item.description, item.destination, item.request?.title].filter(Boolean).join(" "));
  const materialText = normalizeSearch([material?.descripcion, material?.codigo].filter(Boolean).join(" "));
  const q = normalizeSearch(query);
  if (material?.id && item.material_id === material.id) return 100;
  if (material?.codigo && normalizeSearch(item.description).includes(normalizeSearch(material.codigo))) return 92;
  if (q && itemText.includes(q)) return 88;
  if (!materialText) return 0;
  const tokens = materialText.split(" ").filter((token) => token.length > 2);
  const shared = tokens.filter((token) => itemText.includes(token)).length;
  if (shared >= Math.min(3, tokens.length)) return 78;
  if (shared >= 2) return 66;
  return 0;
}

async function fetchPedidoItemsForRecepcion() {
  const fullSelect = `
    id, request_id, description, quantity, unit, status, destination, material_id, catalog_source, notes, created_at,
    request:purchase_requests(id,title,status,priority,project_id,created_at,description,es_adicional,project:produccion_obras(id,codigo,linea_nombre,modelo))
  `;
  const fallbackSelect = `
    id, request_id, description, quantity, unit, status, material_id, notes, created_at,
    request:purchase_requests(id,title,status,priority,project_id,created_at,description,project:produccion_obras(id,codigo))
  `;
  try {
    return await fetchPaged("purchase_request_items", fullSelect, { order: "created_at", limit: 1000 });
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
    return await fetchPaged("purchase_request_items", fallbackSelect, { order: "created_at", limit: 1000 });
  }
}

async function fetchPanolEnvioItemsForRecepcion({ sede = null } = {}) {
  const fullSelect = `
    id, envio_id, purchase_request_item_id, obra_snapshot_item_id, codigo, descripcion, cantidad, unidad, estado, nota, created_at, updated_at,
    envio:panol_envios(id,titulo,sede,destino,origen,estado,obra_id,created_at)
  `;
  const fallbackSelect = `
    id, envio_id, purchase_request_item_id, codigo, descripcion, cantidad, unidad, estado, nota, created_at, updated_at,
    envio:panol_envios(id,titulo,sede,destino,origen,estado,obra_id,created_at)
  `;
  let rows;
  try {
    rows = await fetchPaged("panol_envio_items", fullSelect, { order: "created_at", limit: 1000 });
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
    rows = await fetchPaged("panol_envio_items", fallbackSelect, { order: "created_at", limit: 1000 });
  }
  return sede ? rows.filter((row) => row.envio?.sede === sede) : rows;
}

function scorePanolEnvioItem(item, material, query) {
  return scorePedidoMaterial({
    description: item.descripcion,
    destination: item.envio?.destino,
    material_id: null,
    request: { title: item.envio?.titulo },
  }, material, query);
}

async function buildPanolEnvioMatches({ material = null, q = "", sede = null, limit = 60 } = {}) {
  const rows = await fetchPanolEnvioItemsForRecepcion({ sede });
  const openRows = rows.filter((item) => {
    if (["recibido", "rechazado"].includes(item.estado)) return false;
    if (["recibido", "cerrado", "cancelado"].includes(item.envio?.estado)) return false;
    return true;
  });
  const scored = openRows
    .map((item) => ({ item, score: scorePanolEnvioItem(item, material, q) }))
    .filter((row) => row.score >= 60)
    .sort((a, b) => b.score - a.score || String(b.item.created_at ?? "").localeCompare(String(a.item.created_at ?? "")))
    .slice(0, limit);

  const snapshotIds = scored.map(({ item }) => item.obra_snapshot_item_id).filter(Boolean);
  const snapshotById = new Map();
  if (snapshotIds.length) {
    try {
      const { data, error } = await supabase
        .from("panol_obra_materiales_snapshot")
        .select("id,obra_id,estado,cantidad,unidad,material_id,es_adicional")
        .in("id", snapshotIds);
      if (!error) {
        for (const row of data ?? []) snapshotById.set(row.id, row);
      }
    } catch {
      // Si no hay snapshot, igual sugerimos el item de recepcion.
    }
  }

  const obraIds = [...new Set(scored.map(({ item }) => {
    const snapshot = item.obra_snapshot_item_id ? snapshotById.get(item.obra_snapshot_item_id) : null;
    return snapshot?.obra_id || item.envio?.obra_id || null;
  }).filter(Boolean))];
  let obrasById = new Map();
  if (obraIds.length) {
    try {
      const obras = await fetchObrasEgreso();
      obrasById = new Map(obras.filter((obra) => obraIds.includes(obra.id)).map((obra) => [obra.id, obra]));
    } catch {
      obrasById = new Map();
    }
  }

  return scored.map(({ item, score }) => {
    const snapshot = item.obra_snapshot_item_id ? snapshotById.get(item.obra_snapshot_item_id) : null;
    const obraId = snapshot?.obra_id || item.envio?.obra_id || null;
    const obra = obraId ? obrasById.get(obraId) || null : null;
    return {
      id: `recepcion:${item.id}`,
      source: "recepcion",
      source_label: "Recepcion",
      panol_envio_item_id: item.id,
      envio_id: item.envio_id,
      request_id: item.envio_id,
      request_title: item.envio?.titulo || "Pedido en recepcion",
      request_status: item.envio?.estado || "",
      priority: "",
      description: item.descripcion || "",
      quantity: item.cantidad || "",
      unit: item.unidad || "unidad",
      status: item.estado || "",
      destination: item.envio?.destino || "",
      material_id: snapshot?.material_id || null,
      obra_id: obraId,
      obra_codigo: obra?.codigo || item.envio?.destino || "Sin obra",
      linea_nombre: obra?.linea_nombre || obra?.modelo || "",
      obra_snapshot_item_id: item.obra_snapshot_item_id || null,
      purchase_request_item_id: item.purchase_request_item_id || null,
      snapshot_estado: snapshot?.estado || null,
      es_adicional: snapshot?.es_adicional ?? false,
      created_at: item.created_at || item.updated_at || item.envio?.created_at || "",
      score,
    };
  });
}

export async function fetchRecepcionPedidoMatches({ material = null, q = "", limit = 60, sede = null } = {}) {
  const rows = await fetchPedidoItemsForRecepcion();
  const openRows = rows.filter((item) => {
    if (["recibido", "cancelado", "en_panol"].includes(item.status)) return false;
    if (["recibido", "cancelado"].includes(item.request?.status)) return false;
    return true;
  });

  const scored = openRows
    .map((item) => ({ item, score: scorePedidoMaterial(item, material, q) }))
    .filter((row) => row.score >= 60)
    .sort((a, b) => b.score - a.score || String(b.item.created_at ?? "").localeCompare(String(a.item.created_at ?? "")));

  const itemIds = scored.slice(0, limit).map(({ item }) => item.id).filter(Boolean);
  const snapshotByItem = new Map();
  if (itemIds.length) {
    try {
      const { data, error } = await supabase
        .from("panol_obra_materiales_snapshot")
        .select("id,purchase_request_item_id,obra_id,estado,cantidad,unidad,es_adicional")
        .in("purchase_request_item_id", itemIds);
      if (!error) {
        for (const row of data ?? []) snapshotByItem.set(row.purchase_request_item_id, row);
      }
    } catch {
      // Snapshot puede no existir todavia; el modal sigue funcionando con el item de compra.
    }
  }

  const compraMatches = scored.map(({ item, score }) => {
    const snapshot = snapshotByItem.get(item.id);
    const obra = item.request?.project || null;
    return {
      id: item.id,
      source: "compra",
      source_label: "Compras",
      purchase_request_item_id: item.id,
      request_id: item.request_id,
      request_title: item.request?.title || "Pedido sin titulo",
      request_status: item.request?.status || "",
      priority: item.request?.priority || "",
      description: item.description || "",
      quantity: item.quantity || "",
      unit: item.unit || "unidad",
      status: item.status || "",
      destination: item.destination || "",
      material_id: item.material_id || null,
      obra_id: snapshot?.obra_id || item.request?.project_id || null,
      obra_codigo: obra?.codigo || item.destination || "Sin obra",
      linea_nombre: obra?.linea_nombre || obra?.modelo || "",
      obra_snapshot_item_id: snapshot?.id || null,
      snapshot_estado: snapshot?.estado || null,
      es_adicional: snapshot?.es_adicional ?? item.request?.es_adicional ?? false,
      request_detail: item.request?.description || "",
      created_at: item.created_at || item.request?.created_at || "",
      score,
    };
  });
  const recepcionMatches = await buildPanolEnvioMatches({ material, q, sede, limit });
  return [...recepcionMatches, ...compraMatches]
    .sort((a, b) => b.score - a.score || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, limit);
}

export async function fetchObrasEgreso() {
  try {
    const { data, error } = await supabase
      .from("produccion_obras")
      .select("id,codigo,estado,linea_nombre,modelo")
      .order("codigo");
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
    const { data, error: fallbackError } = await supabase
      .from("produccion_obras")
      .select("id,codigo,estado")
      .order("codigo");
    if (fallbackError) throw fallbackError;
    return data ?? [];
  }
}

export async function ingresarStockGeneral({ material = null, cantidad, sede = null, nota = null, esAdicional = false } = {}) {
  const qty = Number(String(cantidad ?? "").replace(",", "."));
  if (!material?.id && !String(material?.descripcion || "").trim()) throw new Error("Elegí un material.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cargá una cantidad válida.");
  const { data, error } = await supabase.rpc("panol_ingresar_stock_general", {
    p_material_id: material.id || null,
    p_descripcion: String(material.descripcion || "").trim(),
    p_codigo: String(material.codigo || "").trim() || null,
    p_cantidad: qty,
    p_unidad: material.unidad || material.unidad_medida || "unidad",
    p_sede: sede || null,
    p_nota: String(nota || "").trim() || null,
    p_es_adicional: !!esAdicional,
  });
  if (error) throw error;
  return data;
}

// ─── Escrituras (RPCs) ──────────────────────────────────────────────────────
export async function egresarProducto({
  material = null,
  descripcion = "",
  codigo = "",
  cantidad,
  unidad = "unidad",
  sede = null,
  obraId = null,
  destinoObraId = null,
  nota = null,
  retiradoPor = null,
  sectorDestino = null,
  esAdicional = false,
} = {}) {
  const qty = Number(String(cantidad ?? "").replace(",", "."));
  const desc = String(descripcion || material?.descripcion || "").trim();
  if (!material?.id && !desc) throw new Error("Elegi o crea un material.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Carga una cantidad valida.");
  const { data, error } = await supabase.rpc("panol_egresar_producto", {
    p_material_id: material?.id || null,
    p_descripcion: desc || null,
    p_codigo: String(codigo || material?.codigo || "").trim() || null,
    p_cantidad: qty,
    p_unidad: unidad || material?.unidad || material?.unidad_medida || "unidad",
    p_sede: sede || null,
    p_obra_id: obraId || null,
    p_destino_obra_id: destinoObraId || null,
    p_nota: String(nota || "").trim() || null,
    p_retirado_por: String(retiradoPor || "").trim() || null,
    p_sector_destino: String(sectorDestino || "").trim() || null,
    p_es_adicional: !!esAdicional,
  });
  if (error) throw error;
  return data;
}

export async function transferirProducto({
  material = null,
  descripcion = "",
  codigo = "",
  cantidad,
  unidad = "unidad",
  sede = null,
  obraOrigenId = null,
  obraDestinoId = null,
  nota = null,
  retiradoPor = null,
  esAdicional = false,
} = {}) {
  const qty = Number(String(cantidad ?? "").replace(",", "."));
  const desc = String(descripcion || material?.descripcion || "").trim();
  if (!obraDestinoId) throw new Error("Elegí una obra destino.");
  if (!material?.id && !desc) throw new Error("Elegi o crea un material.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Carga una cantidad valida.");
  const { data, error } = await supabase.rpc("panol_transferir_producto", {
    p_material_id: material?.id || null,
    p_descripcion: desc || null,
    p_codigo: String(codigo || material?.codigo || "").trim() || null,
    p_cantidad: qty,
    p_unidad: unidad || material?.unidad || material?.unidad_medida || "unidad",
    p_sede: sede || null,
    p_obra_origen_id: obraOrigenId || null,
    p_obra_destino_id: obraDestinoId,
    p_nota: String(nota || "").trim() || null,
    p_retirado_por: String(retiradoPor || "").trim() || null,
    p_es_adicional: !!esAdicional,
  });
  if (error) throw error;
  return data;
}

export async function marcarMovimientoAnulado(snapshotId, nota = null) {
  if (!snapshotId) return null;
  const { data, error } = await supabase.rpc("panol_marcar_movimiento_anulado", {
    p_snapshot_id: snapshotId,
    p_nota: String(nota || "").trim() || null,
  });
  if (error) throw error;
  return data;
}

export async function crearEnvio({
  titulo, sede, prioridad = "media", obraId = null, destino = null,
  observaciones = null, origen = "manual", purchaseRequestId = null,
  purchaseLogId = null, items = [],
}) {
  const { data, error } = await supabase.rpc("panol_crear_envio", {
    p_titulo: titulo,
    p_sede: sede,
    p_prioridad: prioridad,
    p_obra_id: obraId,
    p_destino: destino,
    p_observaciones: observaciones,
    p_origen: origen,
    p_purchase_request_id: purchaseRequestId,
    p_items: items.map((it) => ({
      descripcion: it.descripcion ?? it.description ?? "",
      codigo: it.codigo ?? it.code ?? null,
      cantidad: it.cantidad ?? it.quantity ?? null,
      unidad: it.unidad ?? it.unit ?? "unidad",
      obra_id: it.obra_id ?? it.obraId ?? null,
      material_id: it.material_id ?? it.materialId ?? null,
      proveedor: it.proveedor ?? null,
      rubro: it.rubro ?? null,
      tipo: it.tipo ?? null,
      tipo_label: it.tipo_label ?? it.tipoLabel ?? null,
      recepcion_estado: it.recepcion_estado ?? it.recepcionEstado ?? null,
      purchase_request_item_id: it.purchase_request_item_id ?? it.purchaseRequestItemId ?? null,
      obra_snapshot_item_id: it.obra_snapshot_item_id ?? it.obraSnapshotItemId ?? null,
      precio_unitario: it.precio_unitario ?? it.precioUnitario ?? null,
      moneda: it.moneda ?? null,
      es_adicional: it.es_adicional ?? it.esAdicional ?? null,
    })),
  });
  if (error) throw error;

  // Vínculo envío ↔ compra cargada (purchase_log): permite que "Gasto por obra"
  // cuente el costo una sola vez (lo aporta la compra, no el envío). Best-effort:
  // si la columna todavía no existe (SQL sin correr), no rompe el flujo.
  if (data && purchaseLogId) {
    try {
      const { error: linkErr } = await supabase
        .from("panol_envios")
        .update({ purchase_log_id: purchaseLogId })
        .eq("id", data);
      if (linkErr && import.meta.env?.DEV) {
        console.warn("[panol] no se pudo vincular envío con compra:", linkErr.message);
      }
    } catch { /* columna purchase_log_id aún no creada — se ignora */ }
  }

  return data; // id del envío creado
}

export async function marcarItems(itemIds, estado, { nota = null, cantidadRecibida = null } = {}) {
  const { error } = await supabase.rpc("panol_marcar_items", {
    p_item_ids: itemIds,
    p_estado: estado,
    p_nota: nota,
    p_cant_recibida: cantidadRecibida,
  });
  if (error) throw error;
}

export async function setEstadoEnvio(envioId, estado) {
  const { error } = await supabase.rpc("panol_set_estado", { p_envio: envioId, p_estado: estado });
  if (error) throw error;
}

export async function egresarMaterialesObra(ids = [], { nota = null, retiradoPor = null, sectorDestino = null, destinoObraId = null, cantidades = {} } = {}) {
  const p_snapshot_ids = ids.filter(Boolean);
  if (!p_snapshot_ids.length) return 0;
  const { data, error } = await supabase.rpc("panol_egresar_obra_materiales", {
    p_snapshot_ids,
    p_nota: String(nota || "").trim() || null,
    p_retirado_por: String(retiradoPor || "").trim() || null,
    p_sector_destino: String(sectorDestino || "").trim() || null,
    p_destino_obra_id: destinoObraId || null,
    p_cantidades: cantidades || {},
  });
  if (error) throw error;
  return data ?? p_snapshot_ids.length;
}

export async function deleteEnvio(envioId) {
  const { error } = await supabase
    .from("panol_envios")
    .delete()
    .eq("id", envioId);
  if (error) throw error;
}

// Mensaje simple entre Pañol y Compras (queda en el historial del envío).
export async function updateEnvioItemPrice(itemId, { precio_unitario = null, moneda = "ARS" } = {}) {
  const raw = precio_unitario === "" || precio_unitario === undefined ? null : precio_unitario;
  const price = raw === null ? null : Number(raw);
  if (raw !== null && !Number.isFinite(price)) throw new Error("Precio invalido.");

  const { error } = await supabase
    .from("panol_envio_items")
    .update({
      precio_unitario: raw === null ? null : price,
      moneda: raw === null ? null : (moneda === "USD" ? "USD" : "ARS"),
    })
    .eq("id", itemId);
  if (error) throw error;
}

export async function comentarEnvio(envioId, texto) {
  const t = String(texto || "").trim();
  if (!t) return;
  const { error } = await supabase.rpc("panol_comentar_envio", { p_envio: envioId, p_texto: t });
  if (error) throw error;
}
