import { supabase } from "@/supabaseClient";
import { canonicalPanolSede, SEDES_PANOL } from "@/features/panol/panolApi";

export { SEDES_PANOL, canonicalPanolSede };

const EPS = 0.0001;

export function validateCierreQuantities(values = {}) {
  const labels = { utilizado: "Utilizado", sobrante: "Sobrante", recibido: "Recibido", danado: "Dañado", aclaracion: "Aclaración" };
  const result = {};
  for (const [key, label] of Object.entries(labels)) {
    const raw = String(values[key] ?? "").trim().replace(",", ".");
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label}: ingresá una cantidad válida, mayor o igual a cero.`);
    if (Math.abs(value * 1000 - Math.round(value * 1000)) > 0.000001) throw new Error(`${label}: usá como máximo tres decimales.`);
    result[key] = value;
  }
  return result;
}

// Read every page; PostgREST may cap an otherwise unbounded select.
async function fetchAllCierreRows(makeQuery) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; ) {
    const { data, error } = await makeQuery().range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    if (!data?.length) return { data: rows, error: null };
    rows.push(...data);
    offset += data.length;
  }
}

function isMissingRelation(error) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return error.code === "42P01"
    || error.code === "PGRST202"
    || error.code === "PGRST205"
    || msg.includes("does not exist")
    || msg.includes("schema cache")
    || msg.includes("could not find the function")
    || msg.includes("could not find the table");
}

function qty(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function fmtCierreQty(value) {
  const n = qty(value, 0);
  if (Math.abs(n) < EPS) return "0";
  return Number(Math.round(n * 1000) / 1000).toLocaleString("es-AR", {
    maximumFractionDigits: 3,
  });
}

export function fmtCierreDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export const CIERRE_ESTADOS = {
  pendiente: { label: "Pendiente", color: "var(--violet)", bg: "var(--violet-soft)", border: "var(--violet-border)" },
  en_revision: { label: "En revisión", color: "var(--blue)", bg: "var(--blue-soft)", border: "var(--blue-border)" },
  conciliada: { label: "Conciliada", color: "var(--green)", bg: "var(--green-soft)", border: "var(--green-border)" },
};

export const ITEM_ESTADOS = {
  pendiente: { label: "Pendiente", color: "var(--violet)" },
  parcial: { label: "Parcial", color: "var(--violet)" },
  resuelto: { label: "Resuelto", color: "var(--green)" },
  excepcion: { label: "Excepción", color: "var(--red)" },
};

export const RESOLUCION_TIPOS = {
  utilizado: { label: "Utilizado / instalado", hint: "Queda documentado. No genera devolución ni ingreso." },
  sobrante_declarado: { label: "Sobrante por devolver", hint: "Declarado, todavía fuera del stock disponible." },
  recibido_panol: { label: "Recibido en pañol", hint: "Recepción física. Reserva: se libera. Egreso: ingresa al stock." },
  danado: { label: "Dañado / no reutilizable", hint: "Abre el circuito de devoluciones existente." },
  pendiente_aclaracion: { label: "Pendiente de aclaración", hint: "Queda con observación para seguimiento." },
};

function modeloDeObra(obra = {}) {
  const linea = String(obra.linea_nombre || obra.modelo || "").trim();
  if (linea) return linea.toUpperCase().replace(/^K?(\d+)$/, "K$1");
  const prefix = String(obra.codigo || "").trim().toUpperCase().split("-")[0];
  return prefix || "";
}

function decorateCierre(row = {}) {
  const obra = row.obra || {};
  return {
    ...row,
    obra,
    codigo: obra.codigo || "—",
    modelo: modeloDeObra(obra),
    obra_estado: obra.estado || row.obra_estado_al_generar || "",
    responsable_nombre: row.responsable?.username || "",
    conciliada_por_nombre: row.conciliada_por_profile?.username || "",
  };
}

const CIERRE_SELECT = `
  id, obra_id, ciclo, estado, fecha_terminacion, obra_estado_al_generar,
  responsable_id, items_pendientes, items_total, conciliada_at, conciliada_por,
  resumen, obra_reabierta_at, created_at, updated_at,
  obra:produccion_obras(id, codigo, linea_nombre, estado, fecha_fin_real),
  responsable:profiles!responsable_id(id, username)
`;

const CIERRE_SELECT_MIN = `
  id, obra_id, ciclo, estado, fecha_terminacion, obra_estado_al_generar,
  responsable_id, items_pendientes, items_total, conciliada_at, conciliada_por,
  resumen, obra_reabierta_at, created_at, updated_at,
  obra:produccion_obras(id, codigo, linea_nombre, estado, fecha_fin_real)
`;

async function hydrateProfiles(rows = []) {
  const ids = [...new Set(rows.flatMap((row) => [row.responsable_id, row.conciliada_por]).filter(Boolean))];
  if (!ids.length) return rows;
  const { data, error } = await supabase.from("profiles").select("id, username").in("id", ids);
  if (error) return rows;
  const byId = new Map((data || []).map((p) => [p.id, p]));
  return rows.map((row) => ({
    ...row,
    responsable: row.responsable || byId.get(row.responsable_id) || null,
    conciliada_por_profile: byId.get(row.conciliada_por) || null,
  }));
}

export async function fetchCierresObra({ estado = "abiertos" } = {}) {
  const applyFilter = (query) => {
    if (estado === "abiertos") return query.in("estado", ["pendiente", "en_revision"]);
    if (estado && estado !== "todas") return query.eq("estado", estado);
    return query;
  };
  const ordered = (select) => applyFilter(
    supabase.from("panol_obra_cierres").select(select)
      .order("fecha_terminacion", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }).order("id"),
  );
  let { data, error } = await fetchAllCierreRows(() => ordered(CIERRE_SELECT));
  if (error) {
    ({ data, error } = await fetchAllCierreRows(() => ordered(CIERRE_SELECT_MIN)));
  }
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (await hydrateProfiles(data || [])).map(decorateCierre);
}

export async function fetchCierreObra(cierreId) {
  if (!cierreId) return null;
  let { data, error } = await supabase.from("panol_obra_cierres").select(CIERRE_SELECT).eq("id", cierreId).maybeSingle();
  if (error) {
    ({ data, error } = await supabase.from("panol_obra_cierres").select(CIERRE_SELECT_MIN).eq("id", cierreId).maybeSingle());
  }
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  if (!data) return null;
  const [hydrated] = await hydrateProfiles([data]);
  return decorateCierre(hydrated);
}

export async function fetchCierreItems(cierreId) {
  if (!cierreId) return [];
  const { data, error } = await fetchAllCierreRows(() => supabase
    .from("panol_obra_cierre_items")
    .select("*")
    .eq("cierre_id", cierreId)
    // El cierre revisa únicamente saldo que sigue físicamente en pañol
    // asignado a la obra. Todo lo que ya egresó se considera entregado y no
    // forma parte de los sobrantes.
    .eq("tipo_origen", "reservado")
    .or("cantidad_reservada.gt.0,cantidad_recibida.gt.0,cantidad_aclaracion.gt.0")
    .order("descripcion").order("id"));
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  const rows = data || [];
  const materialIds = [...new Set(rows.map((row) => row.material_id).filter(Boolean))];
  if (!materialIds.length) return rows;

  // Un requisito de matriz describe una necesidad; no es una existencia fisica
  // que pueda liberarse como sobrante. El SQL nuevo ya los separa, y este filtro
  // evita mostrarlos como producto incluso mientras se actualiza el esquema.
  const { data: materials, error: materialsError } = await supabase
    .from("panol_materiales")
    .select("id,es_requisito")
    .in("id", materialIds);
  if (materialsError) {
    if (isMissingRelation(materialsError)) return rows;
    throw materialsError;
  }
  const requirementIds = new Set((materials || []).filter((row) => row.es_requisito).map((row) => row.id));
  return rows.filter((row) => !row.material_id || !requirementIds.has(row.material_id));
}

export async function fetchCierreRequisitosSinProducto(cierreId) {
  if (!cierreId) return [];
  const { data, error } = await supabase.rpc("panol_cierre_requisitos_sin_producto", {
    p_cierre_id: cierreId,
  });
  if (error) {
    if (isMissingRelation(error)) {
      throw new Error("Falta aplicar la migración que separa requisitos de matriz y productos sobrantes.");
    }
    throw error;
  }
  return data || [];
}

export async function fetchProductosCompatiblesCierre(requisitoIds = []) {
  const ids = [...new Set((requisitoIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const { data: links, error: linksError } = await supabase
    .from("panol_requisito_productos")
    .select("requisito_material_id,producto_material_id,variante_legacy")
    .in("requisito_material_id", ids)
    .eq("activo", true);
  if (linksError) {
    if (isMissingRelation(linksError)) return [];
    throw linksError;
  }

  const productIds = [...new Set((links || []).map((row) => row.producto_material_id).filter(Boolean))];
  if (!productIds.length) return [];
  const { data: products, error: productsError } = await supabase
    .from("panol_materiales")
    .select("id,descripcion,codigo,unidad_medida,proveedor,activo,es_requisito")
    .in("id", productIds);
  if (productsError) throw productsError;

  const byId = new Map((products || [])
    .filter((row) => row.activo !== false && !row.es_requisito)
    .map((row) => [row.id, row]));
  return (links || []).flatMap((link) => {
    const product = byId.get(link.producto_material_id);
    return product ? [{ ...link, producto: product }] : [];
  });
}

export async function identificarProductoCierre(cierreId, requisitoMaterialId, productoMaterialId) {
  if (!cierreId || !requisitoMaterialId || !productoMaterialId) {
    throw new Error("Elegí el producto físico antes de continuar.");
  }
  const { data, error } = await supabase.rpc("panol_cierre_identificar_producto", {
    p_cierre_id: cierreId,
    p_requisito_material_id: requisitoMaterialId,
    p_producto_material_id: productoMaterialId,
  });
  if (error) throw error;
  return data;
}

export async function fetchCierreResoluciones(cierreId) {
  if (!cierreId) return [];
  const { data, error } = await fetchAllCierreRows(() => supabase
    .from("panol_obra_cierre_resoluciones")
    .select("*, usuario:profiles!usuario_id(username)")
    .eq("cierre_id", cierreId)
    .order("created_at", { ascending: false }).order("id"));
  if (error) {
    const retry = await fetchAllCierreRows(() => supabase
      .from("panol_obra_cierre_resoluciones")
      .select("*")
      .eq("cierre_id", cierreId)
      .order("created_at", { ascending: false }).order("id"));
    if (retry.error) {
      if (isMissingRelation(retry.error) || isMissingRelation(error)) return [];
      throw retry.error;
    }
    return retry.data || [];
  }
  return (data || []).map((row) => ({ ...row, usuario_nombre: row.usuario?.username || "" }));
}

export async function fetchCierreEventos(cierreId) {
  if (!cierreId) return [];
  const { data, error } = await fetchAllCierreRows(() => supabase
    .from("panol_obra_cierre_eventos")
    .select("*, usuario:profiles!usuario_id(username)")
    .eq("cierre_id", cierreId)
    .order("created_at", { ascending: false }).order("id"));
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (data || []).map((row) => ({ ...row, usuario_nombre: row.usuario?.username || "" }));
}

export async function fetchCierresAbiertosPorObra() {
  const { data, error } = await fetchAllCierreRows(() => supabase
    .from("panol_obra_cierres")
    .select("id, obra_id, estado, items_pendientes")
    .in("estado", ["pendiente", "en_revision"]).order("id"));
  if (error) {
    if (isMissingRelation(error)) return new Map();
    throw error;
  }
  return new Map((data || []).map((row) => [row.obra_id, row]));
}

export async function fetchCierreCountPendientes() {
  const { data, error } = await supabase.rpc("panol_cierre_contar_pendientes");
  if (error) {
    if (isMissingRelation(error)) return 0;
    throw error;
  }
  return Number(data) || 0;
}

export async function asegurarCierreObra(obraId) {
  if (!obraId) return null;
  const { data, error } = await supabase.rpc("panol_generar_cierre_obra", { p_obra_id: obraId });
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  return data || null;
}

export async function sincronizarCierresTerminadas() {
  const { data, error } = await supabase.rpc("panol_cierre_sincronizar_terminadas");
  if (error) {
    if (isMissingRelation(error)) return 0;
    throw error;
  }
  return Number(data) || 0;
}

export async function refrescarCierreItems(cierreId) {
  if (!cierreId) return;
  const { error } = await supabase.rpc("panol_cierre_refrescar_items", { p_cierre_id: cierreId });
  if (error && !isMissingRelation(error)) throw error;
}

export async function asignarResponsableCierre(cierreId, responsableId) {
  const { error } = await supabase.rpc("panol_cierre_asignar_responsable", {
    p_cierre_id: cierreId,
    p_responsable_id: responsableId || null,
  });
  if (error) throw error;
}

export async function resolverCierreItem({
  itemId,
  utilizado = 0,
  sobrante = 0,
  recibido = 0,
  danado = 0,
  aclaracion = 0,
  observacion = "",
  sede = "",
  idempotencyKey = null,
} = {}) {
  if (!itemId) throw new Error("Falta el material a resolver.");
  const amounts = validateCierreQuantities({ utilizado, sobrante, recibido, danado, aclaracion });
  const { error } = await supabase.rpc("panol_cierre_resolver", {
    p_item_id: itemId,
    p_utilizado: amounts.utilizado,
    p_sobrante_declarado: amounts.sobrante,
    p_recibido: amounts.recibido,
    p_danado: amounts.danado,
    p_aclaracion: amounts.aclaracion,
    p_observacion: String(observacion || "").trim() || null,
    p_sede: canonicalPanolSede(sede) || null,
    p_idempotency_key: idempotencyKey || crypto.randomUUID(),
  });
  if (error) throw error;
}

export async function conciliarCierreObra(cierreId) {
  if (!cierreId) throw new Error("Falta la revisión.");
  const { data, error } = await supabase.rpc("panol_cierre_conciliar", { p_cierre_id: cierreId });
  if (error) throw error;
  return data;
}

export async function fetchOperadoresCierre() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, role")
    .in("role", ["panol", "admin", "tecnica", "oficina", "compras"])
    .order("username");
  if (error) throw error;
  return data || [];
}

export function puedeOperarCierre(profile) {
  if (!profile) return false;
  if (profile.is_admin) return true;
  return ["admin", "tecnica", "compras", "oficina", "panol"].includes(profile.role);
}

export function puedeConciliarExcepciones(profile) {
  if (!profile) return false;
  if (profile.is_admin) return true;
  return ["admin", "tecnica", "compras"].includes(profile.role);
}

export function itemPendienteConfirmar(item = {}) {
  return qty(item.cantidad_pendiente) > EPS && !item.saldo_conocido;
}
