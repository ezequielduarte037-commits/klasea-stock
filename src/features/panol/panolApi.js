import { supabase } from "@/supabaseClient";
import { materialMatchScore } from "@/features/panol/materialMatch";

// ─────────────────────────────────────────────────────────────────────────────
// API del módulo Pedidos / Recepción a Pañol.
// Toda escritura pasa por RPCs `security definer` (panol_crear_envio,
// panol_marcar_items, panol_set_estado) para mantener atómicos: items + eventos
// (historial) + recálculo del estado de cabecera. Ver migración del módulo.
// ─────────────────────────────────────────────────────────────────────────────

export const SEDES_PANOL = ["Pampa", "Chubut"];

// Normaliza sedes historicas como "Chubut 2120" o "Stock Pampa".
export function canonicalPanolSede(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (text.includes("chubut")) return "Chubut";
  if (text.includes("pampa")) return "Pampa";
  return "";
}

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

function isMissingTable(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return error.code === "42P01" || msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("not found");
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function numericValue(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

async function fetchProfilesMap(ids = []) {
  const cleanIds = [...new Set(ids.filter(isUuidLike))];
  const byId = new Map();
  if (!cleanIds.length) return byId;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,username")
      .in("id", cleanIds);
    if (error) throw error;
    for (const profile of data ?? []) byId.set(profile.id, profile);
  } catch {
    byId.clear();
  }
  return byId;
}

function transferMovementKey(row, mode = "out") {
  const materialKey = row.material_id || [
    String(row.codigo || "").trim().toLowerCase(),
    normalizeSearch(row.descripcion || ""),
  ].filter(Boolean).join(":");
  const origin = mode === "in" ? row.obra_origen_id : row.obra_id;
  const destination = mode === "in" ? row.obra_id : row.egreso_destino_obra_id;
  const amount = numericValue(mode === "in" ? row.cantidad : row.cantidad_egresada || row.cantidad, 0);
  return [
    materialKey || "material",
    origin || "stock",
    destination || "stock",
    String(row.stock_sede || "").trim().toLowerCase(),
    Number(Math.round(amount * 1000) / 1000),
  ].join("|");
}

export function retiradoPorEsNombreCompleto(value = "") {
  const words = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.replace(/[^A-Za-zÀ-ÿ]/g, ""))
    .filter((word) => word.length >= 2);
  return words.length >= 2;
}

export function retiradoPorNombreCompletoError(value = "") {
  if (retiradoPorEsNombreCompleto(value)) return "";
  return "Completá nombre y apellido de la persona que retira.";
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

// Conectores/palabras que no aportan a la b\u00fasqueda (los cargan distinto entre \u00edtems).
const SEARCH_STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "con", "para", "por", "y", "o", "a", "en", "un", "una", "que", "al", "sin"]);

// Match por palabras: cada palabra "\u00fatil" del t\u00e9rmino debe estar en el texto (en
// cualquier orden). As\u00ed "caja de" encuentra "caja ducha 800 gph". T\u00e9rminos muy cortos
// (ej. un c\u00f3digo) caen a substring simple.
function modeloFromObraCodigo(codigo = "") {
  return String(codigo || "").trim().toUpperCase().match(/^([A-Z]*\d+)/)?.[1] || "";
}

function withDerivedModelo(obra = {}) {
  return { ...obra, modelo: obra.modelo || modeloFromObraCodigo(obra.codigo) };
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

async function fetchBarcodeRowsForMaterialIds(materialIds = []) {
  const ids = [...new Set(materialIds.filter(Boolean))];
  if (!ids.length) return new Map();
  try {
    const byMaterial = new Map();
    for (let from = 0; from < ids.length; from += 500) {
      const chunk = ids.slice(from, from + 500);
      const { data, error } = await supabase
        .from("panol_material_codigos_barra")
        .select("id,material_id,codigo,etiqueta,activo")
        .in("material_id", chunk)
        .eq("activo", true);
      if (error) throw error;
      for (const row of data ?? []) {
        const list = byMaterial.get(row.material_id) ?? [];
        list.push(row);
        byMaterial.set(row.material_id, list);
      }
    }
    return byMaterial;
  } catch (error) {
    if (isMissingTable(error) || isMissingColumn(error)) return new Map();
    throw error;
  }
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
  return hydrateEnvioItemMaterials(data);
}

async function hydrateEnvioItemMaterials(envio) {
  const items = envio?.items || [];
  const materialIds = [...new Set(items.map((item) => item.material_id).filter(Boolean))];
  if (!materialIds.length) return envio;

  let materiales = [];
  try {
    const { data, error } = await supabase
      .from("panol_materiales")
      .select("id,codigo_barra,codigo,descripcion,unidad_medida,ubicacion,ubicacion_obs")
      .in("id", materialIds);
    if (error) throw error;
    materiales = data ?? [];
  } catch (error) {
    if (!isMissingColumn(error)) return envio;
    const { data, error: fallbackError } = await supabase
      .from("panol_materiales")
      .select("id,codigo,descripcion,unidad_medida")
      .in("id", materialIds);
    if (fallbackError) return envio;
    materiales = data ?? [];
  }

  const materialById = new Map(materiales.map((material) => [material.id, material]));
  const codigosByMaterial = await fetchBarcodeRowsForMaterialIds(materialIds);
  return {
    ...envio,
    items: items.map((item) => {
      const material = item.material || materialById.get(item.material_id) || null;
      const codigos = material ? codigosByMaterial.get(material.id) ?? [] : [];
      const hydratedMaterial = material ? { ...material, codigos_barra: codigos } : null;
      return {
        ...item,
        material: hydratedMaterial,
        codigo_barra: item.codigo_barra ?? hydratedMaterial?.codigo_barra ?? codigos[0]?.codigo ?? null,
      };
    }),
  };
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

  ({ data, error } = await runSelect("*, panol_envio:panol_envios(id,titulo,sede,destino,created_at,created_by,recibido_por)"));
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
      // Escalera de selects de más completo a más viejo: la pantalla tiene que
      // seguir funcionando en un entorno donde las migraciones nuevas todavía
      // no se aplicaron, mostrando menos en vez de romper.
      let res = await supabase
        .from("panol_materiales")
        .select("id,proveedor,categoria_id,codigo_barra,ubicacion,ubicacion_obs,variantes,stock_minimo,imagen_url,notas,verificacion_estado,verificado_at,verificacion_nota,verificacion_problemas")
        .in("id", materialIds);
      if (res.error && isMissingColumn(res.error)) {
        res = await supabase
          .from("panol_materiales")
          .select("id,proveedor,categoria_id,codigo_barra,ubicacion,ubicacion_obs,variantes,stock_minimo,imagen_url,notas")
          .in("id", materialIds);
      }
      if (res.error && isMissingColumn(res.error)) {
        res = await supabase
          .from("panol_materiales")
          .select("id,proveedor,categoria_id,codigo_barra,ubicacion,ubicacion_obs,variantes,stock_minimo")
          .in("id", materialIds);
      }
      if (res.error && isMissingColumn(res.error)) {
        res = await supabase
          .from("panol_materiales")
          .select("id,proveedor,categoria_id,codigo_barra,ubicacion,ubicacion_obs,variantes")
          .in("id", materialIds);
      }
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
    const codigosByMaterial = await fetchBarcodeRowsForMaterialIds(materialIds);
    for (const mat of materiales) {
      materialById.set(mat.id, { ...mat, codigos_barra: codigosByMaterial.get(mat.id) ?? [] });
    }
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
  const egresoActorById = await fetchProfilesMap([
    ...rows.map((row) => row.egreso_por),
    ...rows.map((row) => row.created_by),
    ...rows.map((row) => row.panol_envio?.recibido_por),
    ...rows.map((row) => row.panol_envio?.created_by),
  ]);
  const transferActorByKey = new Map();
  for (const row of rows) {
    if (row.source !== "transferencia_egreso" || !isUuidLike(row.egreso_por)) continue;
    const actor = egresoActorById.get(row.egreso_por) || null;
    if (actor) transferActorByKey.set(transferMovementKey(row, "out"), actor);
  }
  const hydrated = rows.map((row) => {
    const meta = materialById.get(row.material_id) || null;
    const request = row.purchase_request_id ? requestById.get(row.purchase_request_id) || null : null;
    const categoriaId = row.categoria_id || meta?.categoria_id || null;
    const directActor = isUuidLike(row.egreso_por) ? egresoActorById.get(row.egreso_por) || null : null;
    const transferActor = row.source === "transferencia_ingreso" ? transferActorByKey.get(transferMovementKey(row, "in")) || null : null;
    const envioReceivedActor = isUuidLike(row.panol_envio?.recibido_por) ? egresoActorById.get(row.panol_envio.recibido_por) || null : null;
    const envioCreatedActor = isUuidLike(row.panol_envio?.created_by) ? egresoActorById.get(row.panol_envio.created_by) || null : null;
    // Quién hizo ESTE movimiento. Sólo el actor directo o el de la transferencia
    // son eso; los del envío son otra cosa —quién lo armó y quién lo recibió— y
    // usarlos de reemplazo hacía que la pantalla atribuyera movimientos a gente
    // que no los hizo: como los envíos los crea casi siempre la misma persona,
    // aparecía "haciendo" egresos de todo el pañol.
    //
    // Cuando el dato no está, se dice que no está. Un nombre inventado es peor
    // que un campo vacío: obliga a desconfiar también de los que sí son ciertos.
    // egreso_por sólo significa algo si la fila ES una salida. Hay filas de
    // ingreso —source 'matriz', estado 'pendiente'— que lo traen cargado igual,
    // arrastrado de otro lado, y usarlo ahí hacía que un ingreso figurara hecho
    // por alguien que no lo tocó.
    //
    // Se conserva quién RECIBIÓ el envío: en un ingreso esa persona sí es la que
    // hizo el movimiento. Lo que se saca es quién lo CREÓ, que es otra cosa —
    // armar un envío desde técnica no es moverlo en el pañol.
    const esSalida = row.estado === "egresado"
      || String(row.source || "").startsWith("egreso")
      || String(row.source || "").startsWith("transferencia_egreso");
    // Para un ingreso el autor es quien creó el renglón. Va último porque las
    // otras fuentes son más específicas, pero es la única que existe en los
    // ingresos generados desde Materiales.
    const creadorActor = isUuidLike(row.created_by) ? egresoActorById.get(row.created_by) || null : null;
    const egresoActor = (esSalida ? directActor : null) || transferActor || envioReceivedActor || creadorActor;
    const envioActor = envioCreatedActor;
    return {
      ...row,
      obra: row.obra_id ? obrasById.get(row.obra_id) || null : null,
      egreso_actor: egresoActor,
      // El texto crudo de egreso_por (cuentas viejas cargadas a mano) también se
      // limita a las salidas, por lo mismo.
      egreso_por_nombre: egresoActor?.username
        || (esSalida && !isUuidLike(row.egreso_por) ? row.egreso_por || "" : ""),
      // El dato del envío se conserva, pero etiquetado como lo que es. Sirve
      // para rastrear de dónde salió el material sin fingir que esa persona
      // hizo el movimiento.
      envio_actor_nombre: envioActor?.username || "",
      request,
      es_adicional: row.es_adicional ?? request?.es_adicional ?? false,
      proveedor: row.proveedor || meta?.proveedor || "",
      codigo_barra: row.codigo_barra || meta?.codigo_barra || meta?.codigos_barra?.[0]?.codigo || "",
      codigos_barra: meta?.codigos_barra || [],
      variantes: Array.isArray(meta?.variantes) ? meta.variantes : [],
      ubicacion: meta?.ubicacion || null,
      ubicacion_obs: meta?.ubicacion_obs || null,
      stock_minimo: meta?.stock_minimo ?? null,
      imagen_url: meta?.imagen_url || null,
      notas: meta?.notas || null,
      // Revisión del maestro. Si la migración todavía no corrió, meta no las
      // trae y todo queda "pendiente", que es la lectura correcta.
      verificacion_estado: meta?.verificacion_estado || "pendiente",
      verificado_at: meta?.verificado_at || null,
      verificacion_nota: meta?.verificacion_nota || null,
      verificacion_problemas: meta?.verificacion_problemas || [],
      categoria_id: categoriaId,
      categoria_nombre: row.categoria_nombre || (categoriaId ? categoriaById.get(categoriaId) : "") || "",
    };
  });
  const sedeCanonica = canonicalPanolSede(sede);
  return sedeCanonica
    ? hydrated.filter((row) => canonicalPanolSede(row.panol_envio?.sede || row.stock_sede) === sedeCanonica)
    : hydrated;
}

const CATALOG_MINI_SELECT_FULL =
  "id,categoria_id,codigo,codigo_barra,descripcion,alias,proveedor,notas,imagen_url,unidad_medida,precio_unitario,moneda,activo,es_requisito,ubicacion,ubicacion_obs,variantes,variantes_precios";
const CATALOG_MINI_SELECT_STOCK =
  `${CATALOG_MINI_SELECT_FULL},stock_minimo`;
const CATALOG_MINI_SELECT_NOVARPRE =
  "id,categoria_id,codigo,codigo_barra,descripcion,alias,proveedor,notas,imagen_url,unidad_medida,precio_unitario,moneda,activo,es_requisito,ubicacion,ubicacion_obs,variantes";
const CATALOG_MINI_SELECT_MIN =
  "id,categoria_id,codigo,descripcion,proveedor,unidad_medida,precio_unitario,moneda,activo";

// El catálogo entero (para pantallas que sí lo necesitan). Con fallback por columnas faltantes.
async function fetchPanolCatalogAllRows() {
  for (const select of [CATALOG_MINI_SELECT_STOCK, CATALOG_MINI_SELECT_FULL, CATALOG_MINI_SELECT_NOVARPRE, CATALOG_MINI_SELECT_MIN]) {
    try {
      return await fetchPaged("panol_materiales", select, { order: "descripcion", limit: 1000 });
    } catch (error) {
      if (!isMissingColumn(error)) return [];
    }
  }
  return [];
}

// Escapa el término para meterlo en un ILIKE dentro de un .or() (comas/paréntesis/comodines rompen el parseo).
function escapeIlikeTerm(value = "") {
  return String(value).replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

// Búsqueda SERVER-SIDE: la base filtra por el token más selectivo y devuelve solo candidatos.
// Esto es lo que evita bajar todo el catálogo en cada búsqueda (clave con internet lenta de pañol).
// Devuelve null si no se pudo (para caer al catálogo completo sin romper).
async function fetchPanolCatalogSearchRows(term) {
  const tokens = term.split(" ").filter((t) => t.length >= 2 && !SEARCH_STOPWORDS.has(t));
  // El token más largo suele ser el más discriminante (evita traer medio catálogo).
  const picks = [...tokens]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4)
    .map(escapeIlikeTerm)
    .filter(Boolean);
  const fields = ["descripcion", "alias", "notas", "codigo", "codigo_barra"];
  const clauses = fields.flatMap((field) => picks.map((pick) => `${field}.ilike.%${pick}%`));
  const searchOr = clauses.join(",");
  if (!picks.length) return null;
  const attempts = [
    { select: CATALOG_MINI_SELECT_STOCK, or: searchOr },
    { select: CATALOG_MINI_SELECT_FULL, or: searchOr },
    { select: CATALOG_MINI_SELECT_NOVARPRE, or: searchOr },
    { select: CATALOG_MINI_SELECT_MIN, or: clauses.filter((clause) => !clause.startsWith("notas.") && !clause.startsWith("alias.")).join(",") },
  ];
  for (const attempt of attempts) {
    try {
      const { data, error } = await supabase
        .from("panol_materiales")
        .select(attempt.select)
        .or(attempt.or)
        .limit(400);
      if (error) throw error;
      return data ?? [];
    } catch (error) {
      if (!isMissingColumn(error)) return null;
    }
  }
  return null;
}

export async function fetchPanolCatalogMini({ q = "", limit = 80 } = {}) {
  const term = normalizeSearch(q);

  let rows = null;
  if (term) rows = await fetchPanolCatalogSearchRows(term);
  if (rows == null) rows = await fetchPanolCatalogAllRows(); // sin término, o si la búsqueda server-side falló

  const codigosByMaterial = await fetchBarcodeRowsForMaterialIds(rows.map((row) => row.id));
  const withCodes = rows.map((row) => ({ ...row, codigos_barra: codigosByMaterial.get(row.id) ?? [] }));
  const active = withCodes.filter((row) => row.activo !== false);
  let filtered = term
    ? active.filter((row) => materialMatchScore(row, term) >= 42)
    : active;

  // Si la base no encuentra "flaps" porque existe "flap", o "parabrisas"
  // porque quedo escrito "para brisas", hacemos una segunda pasada completa.
  if (term && !filtered.length && rows.length < 5000) {
    const allRows = await fetchPanolCatalogAllRows();
    const allCodes = await fetchBarcodeRowsForMaterialIds(allRows.map((row) => row.id));
    const allWithCodes = allRows.map((row) => ({ ...row, codigos_barra: allCodes.get(row.id) ?? [] }));
    filtered = allWithCodes
      .filter((row) => row.activo !== false)
      .filter((row) => materialMatchScore(row, term) >= 42);
  }
  const ranked = term
    ? filtered
      .map((row) => ({ row, score: materialMatchScore(row, term) }))
      .sort((a, b) => b.score - a.score || String(a.row.descripcion || "").localeCompare(String(b.row.descripcion || ""), "es", { numeric: true }))
    : filtered.map((row) => ({ row, score: 0 }));

  return ranked
    .slice(0, limit)
    .map(({ row, score }) => ({
      id: row.id,
      categoria_id: row.categoria_id || null,
      codigo: row.codigo || "",
      codigo_barra: row.codigo_barra || row.codigos_barra?.[0]?.codigo || "",
      codigos_barra: row.codigos_barra || [],
      descripcion: row.descripcion || "",
      activo: row.activo !== false,
      es_requisito: row.es_requisito === true,
      proveedor: row.proveedor || "",
      alias: row.alias || "",
      notas: row.notas || "",
      observaciones: row.observaciones || "",
      unidad: row.unidad_medida || "unidad",
      precio_unitario: row.precio_unitario ?? "",
      moneda: row.moneda || "ARS",
      ubicacion: row.ubicacion || null,
      ubicacion_obs: row.ubicacion_obs || null,
      imagen_url: row.imagen_url || null,
      variantes: Array.isArray(row.variantes) ? row.variantes : [],
      variantes_precios: row.variantes_precios ?? {},
      stock_minimo: row.stock_minimo ?? null,
      _score: score,
    }));
}

export async function actualizarStockMinimoPanol(materialId, stockMinimo) {
  if (!materialId) throw new Error("El material no está vinculado al catálogo.");
  const value = stockMinimo === null || stockMinimo === ""
    ? null
    : Number(String(stockMinimo).replace(",", "."));
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    throw new Error("El stock mínimo debe ser un número mayor o igual a cero.");
  }
  const { data, error } = await supabase.rpc("panol_set_stock_minimo", {
    p_material_id: materialId,
    p_stock_minimo: value,
  });
  if (error) throw error;
  invalidatePanolCatalogFullCache();
  return data;
}

// Cache de sesión del catálogo completo. El ingreso manual (EnviarAPanolModal en modo
// remito) necesita TODO el catálogo local para escanear códigos, detectar duplicados y
// auto-vincular; y esa pantalla se remonta seguido (cada guardado/borrador). Sin cache
// rebajaba ~todos los materiales cada vez → era la espera de ~30s que se repetía.
let _panolCatalogFullCache = null;
let _panolCatalogFullAt = 0;
const PANOL_CATALOG_FULL_TTL_MS = 3 * 60 * 1000;

export async function fetchPanolCatalogFull({ force = false } = {}) {
  if (!force && _panolCatalogFullCache && Date.now() - _panolCatalogFullAt < PANOL_CATALOG_FULL_TTL_MS) {
    return _panolCatalogFullCache;
  }
  const rows = await fetchPanolCatalogMini({ q: "", limit: 5000 });
  _panolCatalogFullCache = rows;
  _panolCatalogFullAt = Date.now();
  return rows;
}

// Llamar tras crear/editar un material para que el próximo fetch traiga los cambios.
export function invalidatePanolCatalogFullCache() {
  _panolCatalogFullCache = null;
  _panolCatalogFullAt = 0;
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
    // Nunca clasificar por posición: la primera categoría puede ser cualquier
    // rubro real (por ejemplo "Cintas y film"). Sin una categoría genérica
    // explícita, el producto queda sin clasificar para revisión humana.
    return preferred?.id || null;
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
  ubicacion = null,
  ubicacion_obs = null,
  notas = null,
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
    ubicacion: ubicacion || null,
    ubicacion_obs: String(ubicacion_obs || "").trim() || null,
    notas: String(notas || "").trim() || null,
    origen: "remito",
    revisado: false,
    activo: true,
  };
  let { data, error } = await supabase
    .from("panol_materiales")
    .insert(patch)
    .select("id,categoria_id,codigo,descripcion,proveedor,unidad_medida,precio_unitario,moneda,activo,ubicacion,ubicacion_obs")
    .single();
  if (error && isMissingColumn(error)) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.origen;
    delete fallbackPatch.revisado;
    delete fallbackPatch.ubicacion;
    delete fallbackPatch.ubicacion_obs;
    delete fallbackPatch.notas;
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
    ubicacion: data.ubicacion || ubicacion || null,
    ubicacion_obs: data.ubicacion_obs || ubicacion_obs || null,
  };
}

const CATALOG_CREATION_ORIGINS = new Set(["remito", "conteo", "manual", "addon_obra", "egreso", "stock", "stock_general"]);

export async function fetchPanolMaterialCreations({ limit = 300 } = {}) {
  try {
    let { data, error } = await supabase
      .from("panol_materiales")
      .select("id, descripcion, codigo, proveedor, unidad_medida, origen, notas, created_at, batch_id, created_by")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error && isMissingColumn(error)) {
      const retry = await supabase
        .from("panol_materiales")
        .select("id, descripcion, codigo, proveedor, unidad_medida, origen, notas, created_at, batch_id")
        .order("created_at", { ascending: false })
        .limit(limit);
      data = retry.data;
      error = retry.error;
    }
    if (error) return [];
    const rows = (data ?? []).filter((row) => {
      const origen = String(row.origen || "manual").toLowerCase();
      return !row.batch_id && CATALOG_CREATION_ORIGINS.has(origen);
    });
    const profilesById = await fetchProfilesMap(rows.map((row) => row.created_by));
    return rows.map((row) => ({
      ...row,
      created_by_actor: isUuidLike(row.created_by) ? profilesById.get(row.created_by) || null : null,
      created_by_nombre: profilesById.get(row.created_by)?.username || "",
    }));
  } catch {
    return [];
  }
}

export async function guardarUbicacionMaterial(materialId, { ubicacion = null, ubicacionObs = null } = {}) {
  if (!materialId) return null;
  const patch = {
    ubicacion: ubicacion || null,
    ubicacion_obs: String(ubicacionObs || "").trim() || null,
  };
  const { error } = await supabase
    .from("panol_materiales")
    .update(patch)
    .eq("id", materialId);
  if (error) {
    if (isMissingColumn(error)) throw new Error("Falta correr el SQL de ubicaciones del pañol.");
    throw error;
  }
  return patch;
}

export async function registrarCambioUbicacionMaterial(material = null, {
  ubicacionAnterior = null,
  ubicacionNueva = null,
  ubicacionObs = null,
  sede = null,
  obraId = null,
  esAdicional = false,
} = {}) {
  const materialId = material?.id || null;
  const desc = String(material?.descripcion || "").trim();
  if (!materialId && !desc) return null;
  const from = String(ubicacionAnterior || "").trim() || "sin ubicar";
  const to = String(ubicacionNueva || "").trim() || "sin ubicar";
  const obs = String(ubicacionObs || "").trim();
  const nota = [`Ubicacion: ${from} -> ${to}`, obs ? `Obs: ${obs}` : ""].filter(Boolean).join(" · ");
  const payload = {
    obra_id: obraId || null,
    material_id: materialId,
    descripcion: desc || null,
    codigo: String(material?.codigo || "").trim() || null,
    cantidad: 0,
    unidad: material?.unidad || material?.unidad_medida || "unidad",
    proveedor: String(material?.proveedor || "").trim() || null,
    tipo: "ajuste_ubicacion",
    tipo_label: "Ajuste ubicacion",
    notas: nota,
    source: "ajuste_ubicacion",
    estado: "en_panol",
    recepcion_estado: "recibido",
    recepcion_updated_at: new Date().toISOString(),
    stock_sede: sede || null,
    stock_nota: nota,
    es_adicional: !!esAdicional,
  };
  const { data, error } = await supabase
    .from("panol_obra_materiales_snapshot")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data?.id || null;
}

export async function vincularMovimientosAMaterial(snapshotIds = [], materialId) {
  const ids = [...new Set((snapshotIds || []).filter(Boolean))];
  if (!ids.length || !materialId) return 0;
  const { error } = await supabase
    .from("panol_obra_materiales_snapshot")
    .update({ material_id: materialId })
    .in("id", ids);
  if (error) throw error;
  return ids.length;
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
  if (material?.id && item.material_id === material.id) return 100;
  // Usar el mismo matcher que el catálogo. Antes esta pantalla sólo
  // comparaba substrings exactos y no encontraba "flap" vs. "flaps" ni
  // "parabrisas" vs. "para brisas".
  return materialMatchScore(
    {
      descripcion: item.description,
      codigo: item.codigo,
      notas: item.notes,
      observaciones: item.notes,
    },
    {
      descripcion: [material?.descripcion, query].filter(Boolean).join(" "),
      alias: material?.alias,
      notas: material?.notas,
      codigo: material?.codigo,
      codigo_barra: material?.codigo_barra,
    },
  );
}

async function fetchPedidoItemsForRecepcion() {
  const fullSelect = `
    id, request_id, description, quantity, unit, status, destination, material_id, catalog_source, notes, created_at,
    request:purchase_requests(id,title,status,priority,project_id,created_at,description,es_adicional,project:produccion_obras(id,codigo,linea_nombre))
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

async function buildPanolEnvioMatches({ material = null, q = "", sede = null, limit = 60, matchAll = false } = {}) {
  const rows = await fetchPanolEnvioItemsForRecepcion({ sede });
  const openRows = rows.filter((item) => {
    if (["recibido", "rechazado"].includes(item.estado)) return false;
    if (["recibido", "cerrado", "cancelado"].includes(item.envio?.estado)) return false;
    return true;
  });
  const scored = (matchAll
    ? openRows.map((item) => ({ item, score: 100 }))
    : openRows
        .map((item) => ({ item, score: scorePanolEnvioItem(item, material, q) }))
        .filter((row) => row.score >= 60)
        .sort((a, b) => b.score - a.score || String(b.item.created_at ?? "").localeCompare(String(a.item.created_at ?? "")))
  ).slice(0, limit);

  const snapshotIds = scored.map(({ item }) => item.obra_snapshot_item_id).filter(Boolean);
  const snapshotById = new Map();
  if (snapshotIds.length) {
    try {
      const { data, error } = await supabase
        .from("panol_obra_materiales_snapshot")
        .select("id,obra_id,estado,cantidad,unidad,material_id,es_adicional,variante")
        .in("id", snapshotIds);
      if (error) throw error;
      for (const row of data ?? []) snapshotById.set(row.id, row);
    } catch (error) {
      if (!isMissingColumn(error)) {
        // Si no hay snapshot, igual sugerimos el item de recepcion.
      } else {
        try {
          const { data, error: fallbackError } = await supabase
            .from("panol_obra_materiales_snapshot")
            .select("id,obra_id,estado,cantidad,unidad,material_id,es_adicional")
            .in("id", snapshotIds);
          if (!fallbackError) {
            for (const row of data ?? []) snapshotById.set(row.id, row);
          }
        } catch {
          // Si no hay snapshot, igual sugerimos el item de recepcion.
        }
      }
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
      variante: snapshot?.variante || "",
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
        .select("id,purchase_request_item_id,obra_id,estado,cantidad,unidad,es_adicional,variante")
        .in("purchase_request_item_id", itemIds);
      if (error) throw error;
      for (const row of data ?? []) snapshotByItem.set(row.purchase_request_item_id, row);
    } catch (error) {
      if (!isMissingColumn(error)) {
        // Snapshot puede no existir todavia; el modal sigue funcionando con el item de compra.
      } else {
        try {
          const { data, error: fallbackError } = await supabase
            .from("panol_obra_materiales_snapshot")
            .select("id,purchase_request_item_id,obra_id,estado,cantidad,unidad,es_adicional")
            .in("purchase_request_item_id", itemIds);
          if (!fallbackError) {
            for (const row of data ?? []) snapshotByItem.set(row.purchase_request_item_id, row);
          }
        } catch {
          // Snapshot puede no existir todavia; el modal sigue funcionando con el item de compra.
        }
      }
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
      variante: snapshot?.variante || "",
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

// Avisos de recepción = SOLO los envíos que compras/técnica mandan a pañol
// (panol_envios) que todavía no se recibieron. NO son los pedidos de compra crudos:
// eso puede no estar comprado aún y no corresponde que el pañol lo vea.
export async function fetchRecepcionAvisosAbiertos({ sede = null, limit = 1000 } = {}) {
  return buildPanolEnvioMatches({ sede, matchAll: true, limit });
}

export async function fetchObrasEgreso() {
  try {
    const { data, error } = await supabase
      .from("produccion_obras")
      .select("id,codigo,estado,linea_nombre")
      .order("codigo");
    if (error) throw error;
    return (data ?? []).map(withDerivedModelo);
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
    const { data, error: fallbackError } = await supabase
      .from("produccion_obras")
      .select("id,codigo,estado")
      .order("codigo");
    if (fallbackError) throw fallbackError;
    return (data ?? []).map(withDerivedModelo);
  }
}

export async function ingresarStockGeneral({ material = null, cantidad, sede = null, nota = null, esAdicional = false, obraId = null, variante = null } = {}) {
  const qty = Number(String(cantidad ?? "").replace(",", "."));
  if (!material?.id && !String(material?.descripcion || "").trim()) throw new Error("Elegí un material.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cargá una cantidad válida.");
  const base = {
    p_material_id: material.id || null,
    p_descripcion: String(material.descripcion || "").trim(),
    p_codigo: String(material.codigo || "").trim() || null,
    p_cantidad: qty,
    p_unidad: material.unidad || material.unidad_medida || "unidad",
    p_sede: sede || null,
    p_nota: String(nota || "").trim() || null,
    p_es_adicional: !!esAdicional,
    p_obra_id: obraId || null,
  };
  const varClean = String(variante || "").trim() || null;
  let { data, error } = await supabase.rpc("panol_ingresar_stock_general", { ...base, p_variante: varClean });
  // Si el RPC todavía no tiene el parámetro p_variante, reintenta sin él (transición).
  if (error && (error.code === "PGRST202" || String(error.message || "").toLowerCase().includes("could not find the function"))) {
    ({ data, error } = await supabase.rpc("panol_ingresar_stock_general", base));
  }
  if (error) throw error;
  return data;
}

// ─── Escrituras (RPCs) ──────────────────────────────────────────────────────
export async function registrarConteoFisico({ material = null, cantidad, sede = null, obraId = null, nota = null, movimiento = "ingreso", variante = null } = {}) {
  const qty = Number(String(cantidad ?? "").replace(",", "."));
  if (!material?.id && !String(material?.descripcion || "").trim()) throw new Error("Elegi un material.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Carga una cantidad valida.");
  const base = {
    p_material_id: material.id || null,
    p_descripcion: String(material.descripcion || "").trim(),
    p_codigo: String(material.codigo || "").trim() || null,
    p_cantidad: qty,
    p_unidad: material.unidad || material.unidad_medida || "unidad",
    p_sede: sede || null,
    p_obra_id: obraId || null,
    p_nota: String(nota || "").trim() || null,
    p_movimiento: movimiento === "egreso" ? "egreso" : "ingreso",
  };
  const varClean = String(variante || "").trim() || null;
  let { data, error } = await supabase.rpc("panol_registrar_conteo_fisico", { ...base, p_variante: varClean });
  // Fallback si el RPC todavía no tiene p_variante (hasta correr el SQL nuevo).
  if (error && (error.code === "PGRST202" || String(error.message || "").toLowerCase().includes("could not find the function"))) {
    ({ data, error } = await supabase.rpc("panol_registrar_conteo_fisico", base));
  }
  if (error) throw error;
  return data;
}

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
  variante = null,
} = {}) {
  const qty = Number(String(cantidad ?? "").replace(",", "."));
  const desc = String(descripcion || material?.descripcion || "").trim();
  if (!material?.id && !desc) throw new Error("Elegi o crea un material.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Carga una cantidad valida.");
  const base = {
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
  };
  const varClean = String(variante || "").trim() || null;
  let { data, error } = await supabase.rpc("panol_egresar_producto", { ...base, p_variante: varClean });
  // Si el RPC todavía no tiene el parámetro p_variante, reintenta sin él (transición).
  if (error && (error.code === "PGRST202" || String(error.message || "").toLowerCase().includes("could not find the function"))) {
    ({ data, error } = await supabase.rpc("panol_egresar_producto", base));
  }
  if (error) throw error;
  return data;
}

export async function registrarRetiroConsumible({
  material = null,
  cantidadGramos,
  sede = null,
  retiradoPor = null,
  sectorDestino = null,
  nota = null,
} = {}) {
  const gramos = Number(String(cantidadGramos ?? "").replace(",", "."));
  const desc = String(material?.descripcion || "").trim();
  if (!material?.id && !desc) throw new Error("Elegi un consumible.");
  if (!Number.isFinite(gramos) || gramos <= 0) throw new Error("Carga un peso valido en gramos.");
  const pesoTxt = `${Math.round(gramos * 1000) / 1000} g`;
  const detalle = [`Retiro temporal de consumible por peso: ${pesoTxt}`, String(nota || "").trim()].filter(Boolean).join(" · ");
  const payload = {
    obra_id: null,
    material_id: material?.id || null,
    descripcion: desc,
    codigo: String(material?.codigo || "").trim() || null,
    cantidad: 0,
    cantidad_egresada: 0,
    unidad: material?.unidad || material?.unidad_medida || "unidad",
    proveedor: String(material?.proveedor || "").trim() || null,
    tipo: "consumible",
    tipo_label: "Retiro consumible",
    notas: detalle,
    source: "consumible_retiro",
    estado: "en_panol",
    recepcion_estado: null,
    recepcion_updated_at: new Date().toISOString(),
    egreso_at: new Date().toISOString(),
    egreso_nota: detalle,
    retirado_por: String(retiradoPor || "").trim() || null,
    sector_destino: String(sectorDestino || "").trim() || null,
    stock_sede: sede || null,
    stock_nota: `Peso retirado: ${pesoTxt}`,
    es_adicional: false,
  };
  let { data, error } = await supabase
    .from("panol_obra_materiales_snapshot")
    .insert(payload)
    .select("id")
    .single();
  if (error && isMissingColumn(error)) {
    const fallback = { ...payload };
    delete fallback.cantidad_egresada;
    delete fallback.retirado_por;
    delete fallback.sector_destino;
    delete fallback.stock_sede;
    delete fallback.stock_nota;
    delete fallback.es_adicional;
    const retry = await supabase
      .from("panol_obra_materiales_snapshot")
      .insert(fallback)
      .select("id")
      .single();
    data = retry.data;
    error = retry.error;
  }
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
  variante = null,
} = {}) {
  const qty = Number(String(cantidad ?? "").replace(",", "."));
  const desc = String(descripcion || material?.descripcion || "").trim();
  if (!obraDestinoId) throw new Error("Elegí una obra destino.");
  if (!material?.id && !desc) throw new Error("Elegi o crea un material.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Carga una cantidad valida.");
  const base = {
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
  };
  const varClean = String(variante || "").trim() || null;
  let { data, error } = await supabase.rpc("panol_transferir_producto", { ...base, p_variante: varClean });
  if (error && (error.code === "PGRST202" || String(error.message || "").toLowerCase().includes("could not find the function"))) {
    ({ data, error } = await supabase.rpc("panol_transferir_producto", base));
  }
  if (error) throw error;
  return data;
}

// Libera stock asignado a una obra devolviéndolo a stock general (destino = null).
// Reusa la RPC de transferencia; requiere que la RPC permita destino nulo.
export async function liberarProductoAStock({
  material = null,
  descripcion = "",
  codigo = "",
  cantidad,
  unidad = "unidad",
  sede = null,
  obraOrigenId = null,
  nota = null,
  retiradoPor = null,
  esAdicional = false,
} = {}) {
  const qty = Number(String(cantidad ?? "").replace(",", "."));
  const desc = String(descripcion || material?.descripcion || "").trim();
  if (!obraOrigenId) throw new Error("No hay obra de origen para liberar.");
  if (!material?.id && !desc) throw new Error("Elegi o crea un material.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Carga una cantidad valida.");
  const { data, error } = await supabase.rpc("panol_transferir_producto", {
    p_material_id: material?.id || null,
    p_descripcion: desc || null,
    p_codigo: String(codigo || material?.codigo || "").trim() || null,
    p_cantidad: qty,
    p_unidad: unidad || material?.unidad || material?.unidad_medida || "unidad",
    p_sede: sede || null,
    p_obra_origen_id: obraOrigenId,
    p_obra_destino_id: null,
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
      requisito_material_id: it.requisito_material_id ?? it.requisitoMaterialId ?? null,
      proveedor: it.proveedor ?? null,
      rubro: it.rubro ?? null,
      tipo: it.tipo ?? null,
      tipo_label: it.tipo_label ?? it.tipoLabel ?? null,
      recepcion_estado: it.recepcion_estado ?? it.recepcionEstado ?? null,
      purchase_request_item_id: it.purchase_request_item_id ?? it.purchaseRequestItemId ?? null,
      obra_snapshot_item_id: it.obra_snapshot_item_id ?? it.obraSnapshotItemId ?? null,
      variante: it.variante ?? it.variant ?? null,
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

// ─── Devoluciones ────────────────────────────────────────────────────────────
// Material que salió del pañol, se probó y volvió fallado. Queda apartado —no
// vuelve a stock— y Compras decide si se manda a reparar o se reclama la
// reposición. La obra queda con la cantidad en reclamo hasta que vuelva sano.

export const DEVOLUCION_MOTIVOS = [
  ["defectuoso", "Vino defectuoso"],
  ["roto", "Llegó roto"],
  ["no_corresponde", "No es lo que se pidió"],
  ["sobrante", "Sobró / no se usó"],
  ["otro", "Otro"],
];

export const DEVOLUCION_ESTADOS = {
  devuelto: { label: "Para decidir", abierto: true },
  en_reparacion: { label: "En reparación", abierto: true },
  esperando_reposicion: { label: "Esperando reposición", abierto: true },
  reparado: { label: "Reparado", abierto: false },
  repuesto: { label: "Repuesto", abierto: false },
  nota_credito: { label: "Nota de crédito", abierto: false },
  rechazado: { label: "Rechazado", abierto: false },
  descartado: { label: "Descartado", abierto: false },
};

// Qué hace falta con lo devuelto. Lo elige quien la recibe: el pañolero sabe si
// tiene arreglo o si hay que reclamar el reemplazo. Compras igual recibe el
// aviso y es quien gestiona.
export const DEVOLUCION_NECESITA = [
  ["esperando_reposicion", "Necesita reposición"],
  ["en_reparacion", "Se manda a arreglar"],
  ["devuelto", "A definir con Compras"],
];

// De quién es la culpa. Es lo que separa un reclamo de una pérdida propia: si
// lo rompimos nosotros el material igual se aparta y se registra, pero no se le
// puede pedir nada al proveedor. Mezclarlos infla el total del reclamo y lo
// vuelve inservible para llamar por teléfono.
export const DEVOLUCION_RESPONSABLE = [
  ["proveedor", "Vino fallado"],
  ["nosotros", "Lo rompimos nosotros"],
  ["sin_definir", "Todavía no se sabe"],
];

export const RESPONSABLE_META = {
  proveedor: { label: "Vino fallado", corto: "Del proveedor", reclamable: true },
  nosotros: { label: "Lo rompimos nosotros", corto: "Nuestra", reclamable: false },
  sin_definir: { label: "Sin definir", corto: "Sin definir", reclamable: false },
};

// A dónde va cuando se manda a arreglar. No es lo mismo devolvérselo al que lo
// vendió (garantía, no se paga) que llevarlo a un taller (se paga) o arreglarlo
// acá (cuesta horas nuestras).
export const DEVOLUCION_DESTINO_TIPO = [
  ["proveedor", "Al proveedor que lo vendió"],
  ["taller", "A un taller de afuera"],
  ["interno", "Lo arreglamos acá"],
];

export const DESTINO_TIPO_META = {
  proveedor: { label: "Al proveedor", ph: "Ej: Rincón del Herraje", ayuda: "Va por garantía: no debería costarnos nada." },
  taller: { label: "Taller externo", ph: "Ej: Trimer", ayuda: "Nos lo van a cobrar. Anotá el costo cuando lo sepas." },
  interno: { label: "Taller propio", ph: "Ej: Herrería / Gustavo", ayuda: "Lo arregla gente nuestra: cuesta horas, no plata." },
};

/** Registra una devolución: la abre en el estado que corresponda, deja la
 *  cantidad en reclamo en la obra y avisa a Compras, todo en una transacción. */
export async function registrarDevolucion({
  snapshotId, cantidad, motivo = "defectuoso", detalle = null,
  necesita = "devuelto", responsable = "sin_definir",
}) {
  if (!snapshotId) throw new Error("Falta el egreso de origen.");
  const cant = Number(cantidad);
  if (!Number.isFinite(cant) || cant <= 0) throw new Error("La cantidad devuelta tiene que ser mayor a cero.");
  const { data, error } = await supabase.rpc("panol_registrar_devolucion", {
    p_snapshot_id: snapshotId,
    p_cantidad: cant,
    p_motivo: motivo,
    p_detalle: detalle,
    p_necesita: necesita,
    p_responsable: responsable,
  });
  if (error) throw error;
  return data;
}

export async function resolverDevolucion(id, estado, {
  proveedorId = null, destino = null, notas = null,
  destinoTipo = null, responsable = null, costoReparacion = null,
} = {}) {
  if (!id || !estado) throw new Error("Faltan datos para resolver la devolución.");
  const costo = costoReparacion === null || costoReparacion === "" ? null : Number(costoReparacion);
  const { error } = await supabase.rpc("panol_resolver_devolucion", {
    p_devolucion_id: id,
    p_estado: estado,
    p_proveedor_id: proveedorId,
    p_destino: destino,
    p_notas: notas,
    p_destino_tipo: destinoTipo,
    p_responsable: responsable,
    p_costo_reparacion: Number.isFinite(costo) ? costo : null,
  });
  if (error) throw error;
}

/** Notas de seguimiento de una devolución, de la más nueva a la más vieja. */
export async function fetchDevolucionNotas(devolucionId) {
  if (!devolucionId) return [];
  const { data, error } = await supabase
    .from("panol_devoluciones_notas")
    .select("id, texto, estado_en_ese_momento, created_at, autor:autor_id(username)")
    .eq("devolucion_id", devolucionId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []).map((fila) => ({ ...fila, autor_nombre: fila.autor?.username || "" }));
}

export async function agregarNotaDevolucion(devolucionId, texto) {
  if (!devolucionId) throw new Error("Falta la devolución.");
  if (!String(texto || "").trim()) throw new Error("La nota no puede estar vacía.");
  const { data, error } = await supabase.rpc("panol_devolucion_nota", {
    p_devolucion_id: devolucionId,
    p_texto: String(texto).trim(),
  });
  if (error) throw error;
  return data;
}

/* ── Revisión del stock maestro ─────────────────────────────────────────── */

// Los tres estados posibles de un producto en la revisión. "Pendiente" no es un
// problema, es trabajo sin hacer: separarlos es lo que permite que el contador
// de pendientes efectivamente baje.
export const VERIFICACION_META = {
  pendiente: { label: "Sin revisar", corto: "Sin revisar" },
  ok: { label: "Revisado", corto: "Revisado" },
  problema: { label: "Con problema", corto: "Problema" },
};

// Los problemas se tipifican y no se escriben libres. Un texto suelto obliga a
// leer ítem por ítem para saber si hay que ir a buscar la pieza, corregir una
// etiqueta o sacar una foto; y como cada uno lo escribe distinto, no se puede
// contar. Al terminar la pasada la pregunta útil es "¿de qué tipo son?",
// porque de ahí sale qué arreglar para que no vuelva a pasar.
export const VERIFICACION_PROBLEMAS = [
  ["ubicacion", "No está donde dice", "La ficha marca un lugar y la pieza está en otro."],
  ["cantidad", "La cantidad no cierra", "Lo que hay en el estante no es lo que dice el sistema."],
  ["descripcion", "No se entiende qué es", "El nombre no alcanza para reconocerlo con la pieza en la mano."],
  ["codigo", "El código no coincide", "La etiqueta de la caja dice otra cosa, o no tiene."],
  ["foto", "Falta la foto", "Sin imagen no se puede identificar desde la pantalla."],
  ["duplicado", "Está cargado dos veces", "El mismo producto figura con dos fichas distintas."],
  ["no_existe", "No se encontró", "Está en el sistema pero no aparece en el pañol."],
  ["otro", "Otro", "Algo que no entra en los anteriores. Hay que explicarlo."],
];

export const PROBLEMA_LABEL = Object.fromEntries(
  VERIFICACION_PROBLEMAS.map(([clave, label]) => [clave, label]),
);

/** Marca la revisión de un producto y de paso corrige sus datos. Un solo viaje:
 *  si fueran dos, la mitad de las veces se corrige y no se marca. */
export async function verificarMaterial(materialId, estado, {
  nota = null, ubicacion = null, ubicacionObs = null, descripcion = null,
  problemas = [], cantidadContada = null, cantidadSistema = null,
} = {}) {
  if (!materialId) throw new Error("Falta el producto.");
  const lista = Array.isArray(problemas) ? problemas.filter(Boolean) : [];
  if (estado === "problema" && !lista.length) {
    throw new Error("Elegí al menos un tipo de problema.");
  }
  if (estado === "problema" && lista.includes("otro") && !String(nota || "").trim()) {
    throw new Error('Si elegís "Otro" hay que escribir qué pasa.');
  }
  const num = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const base = {
    p_material_id: materialId,
    p_estado: estado,
    p_nota: nota,
    p_ubicacion: ubicacion,
    p_ubicacion_obs: ubicacionObs,
    p_descripcion: descripcion,
  };
  let { error } = await supabase.rpc("panol_verificar_material", {
    ...base,
    p_problemas: lista,
    p_cantidad_contada: num(cantidadContada),
    p_cantidad_sistema: num(cantidadSistema),
  });
  // Si la base todavía tiene la firma vieja (sin tipos de problema ni conteo),
  // se reintenta con los seis parámetros originales. Sin esto, la llamada falla
  // entera y no se guarda NADA —ni la ubicación ni la revisión—, que es
  // indistinguible de "el botón no anda". Mismo patrón que egresarProducto.
  const faltaLaFuncion = error
    && (error.code === "PGRST202"
      || String(error.message || "").toLowerCase().includes("could not find the function"));
  if (faltaLaFuncion) {
    ({ error } = await supabase.rpc("panol_verificar_material", base));
  }
  if (error) throw error;
}

/** Cuántos van y cuántos faltan. Se calcula en la base: contar en el navegador
 *  daría sólo los productos que entraron en la página actual. */
export async function fetchVerificacionAvance() {
  const { data, error } = await supabase
    .from("panol_verificacion_avance")
    .select("*")
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data ?? null;
}

/** Historial de revisiones de un producto. */
export async function fetchVerificacionesMaterial(materialId) {
  if (!materialId) return [];
  const { data, error } = await supabase
    .from("panol_material_verificaciones")
    .select("id, estado, nota, problemas, ubicacion, cantidad_contada, cantidad_sistema, created_at, autor:verificado_por(username)")
    .eq("material_id", materialId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    if (isMissingTable(error) || isMissingColumn(error)) return [];
    throw error;
  }
  return (data ?? []).map((fila) => ({ ...fila, autor_nombre: fila.autor?.username || "" }));
}

/** Panel de devoluciones. Trae días y valor ya calculados desde la vista. */
export async function fetchDevoluciones({ soloAbiertas = true } = {}) {
  let query = supabase
    .from("panol_devoluciones_panel")
    .select("*")
    .order("devuelto_at", { ascending: false });
  if (soloAbiertas) {
    query = query.in("estado", ["devuelto", "en_reparacion", "esperando_reposicion"]);
  }
  const { data, error } = await query;
  if (error) {
    // Si la migración todavía no corrió, la pantalla muestra vacío en vez de romper.
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data ?? [];
}
