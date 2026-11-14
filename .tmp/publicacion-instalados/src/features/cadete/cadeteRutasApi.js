import { supabase } from "@/supabaseClient";
import { createCajaChicaEntry } from "@/features/compras/cajaChicaApi";
import { fetchPurchaseRequests } from "@/features/compras/purchaseRequestsApi";

// Hoja de ruta del cadete. Compras arma la ruta del día (paradas manuales o desde
// pedidos aprobados) y el cadete la ejecuta desde el celu: marca cada parada, carga
// el importe + foto del remito, y eso le genera el gasto en SU caja chica (owner_id).

const RUTAS = "cadete_rutas";
const PARADAS = "cadete_ruta_paradas";
const BUCKET = "panol-materiales"; // bucket público reusado para las fotos de comprobante

function isMissingTable(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return error?.code === "42P01" || msg.includes("schema cache") || msg.includes("does not exist");
}
function clean(v) { const t = String(v ?? "").trim(); return t || null; }
function num(v) { if (v === "" || v == null) return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; }
async function uid() { const { data } = await supabase.auth.getSession(); return data?.session?.user?.id || null; }

// Pedidos abiertos de compras (para armar paradas desde lo que hay que retirar).
export async function fetchPedidosParaRuta() {
  let rows = [];
  try { rows = await fetchPurchaseRequests(); } catch { return []; }
  return (rows || [])
    .filter((r) => !["recibido", "cancelado"].includes(r.status))
    .map((r) => ({
      id: r.id,
      title: r.title || "Pedido",
      status: r.status || "",
      proveedor: r.proveedor || "",
      obra_codigo: r.project?.codigo || "",
      priority: r.priority || "",
      created_at: r.created_at || "",
    }));
}

export async function fetchCadetes() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, role, is_admin, sede")
    .eq("role", "cadete")
    .order("username");
  if (error) throw error;
  return data || [];
}

export async function fetchRutas({ cadeteId = null, desde = null, hasta = null, limit = 150 } = {}) {
  let q = supabase
    .from(RUTAS)
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (cadeteId) q = q.eq("cadete_id", cadeteId);
  if (desde) q = q.gte("fecha", desde);
  if (hasta) q = q.lte("fecha", hasta);
  const { data, error } = await q;
  if (error) { if (isMissingTable(error)) return { rows: [], missingTable: true }; throw error; }
  return { rows: data || [], missingTable: false };
}

export async function fetchParadas(rutaId) {
  if (!rutaId) return [];
  const { data, error } = await supabase
    .from(PARADAS)
    .select("*")
    .eq("ruta_id", rutaId)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) { if (isMissingTable(error)) return []; throw error; }
  return data || [];
}

// Trae rutas + sus paradas en una sola llamada (para el listado con progreso).
export async function fetchRutasConParadas(opts = {}) {
  const { rows, missingTable } = await fetchRutas(opts);
  if (missingTable || !rows.length) return { rows, missingTable };
  const ids = rows.map((r) => r.id);
  const { data, error } = await supabase.from(PARADAS).select("*").in("ruta_id", ids);
  if (error) { if (isMissingTable(error)) return { rows, missingTable: false }; throw error; }
  const byRuta = new Map();
  for (const p of data || []) {
    if (!byRuta.has(p.ruta_id)) byRuta.set(p.ruta_id, []);
    byRuta.get(p.ruta_id).push(p);
  }
  const withParadas = rows.map((r) => ({
    ...r,
    paradas: (byRuta.get(r.id) || []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
  }));
  return { rows: withParadas, missingTable: false };
}

export async function createRuta({ fecha, cadeteId, titulo, notas } = {}) {
  const payload = {
    fecha: fecha || new Date().toISOString().slice(0, 10),
    cadete_id: cadeteId || null,
    creada_por: await uid(),
    titulo: clean(titulo),
    notas: clean(notas),
    estado: "abierta",
  };
  const { data, error } = await supabase.from(RUTAS).insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateRuta(id, patch = {}) {
  const allowed = { updated_at: new Date().toISOString() };
  if ("titulo" in patch) allowed.titulo = clean(patch.titulo);
  if ("notas" in patch) allowed.notas = clean(patch.notas);
  if ("estado" in patch) allowed.estado = patch.estado;
  if ("fecha" in patch) allowed.fecha = patch.fecha;
  if ("cadete_id" in patch) allowed.cadete_id = patch.cadete_id || null;
  const { data, error } = await supabase.from(RUTAS).update(allowed).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteRuta(id) {
  const { error } = await supabase.from(RUTAS).delete().eq("id", id);
  if (error) throw error;
}

function normParada(p = {}) {
  return {
    proveedor: clean(p.proveedor),
    direccion: clean(p.direccion),
    detalle: clean(p.detalle),
    orden: Number.isFinite(Number(p.orden)) ? Number(p.orden) : 0,
    request_id: p.request_id || null,
    request_item_id: p.request_item_id || null,
    moneda: p.moneda === "USD" ? "USD" : "ARS",
  };
}

export async function addParada(rutaId, fields = {}) {
  if (!rutaId) throw new Error("Falta la ruta.");
  const payload = { ruta_id: rutaId, estado: "pendiente", ...normParada(fields) };
  const { data, error } = await supabase.from(PARADAS).insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function addParadas(rutaId, list = [], startOrden = 0) {
  if (!rutaId) throw new Error("Falta la ruta.");
  const payload = list.map((f, i) => ({ ruta_id: rutaId, estado: "pendiente", ...normParada({ orden: startOrden + i, ...f }) }));
  if (!payload.length) return [];
  const { data, error } = await supabase.from(PARADAS).insert(payload).select("*");
  if (error) throw error;
  return data || [];
}

export async function updateParada(id, patch = {}) {
  const allowed = {};
  for (const k of ["proveedor", "direccion", "detalle"]) if (k in patch) allowed[k] = clean(patch[k]);
  if ("orden" in patch) allowed.orden = Number(patch.orden) || 0;
  if ("moneda" in patch) allowed.moneda = patch.moneda === "USD" ? "USD" : "ARS";
  const { data, error } = await supabase.from(PARADAS).update(allowed).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteParada(id) {
  const { error } = await supabase.from(PARADAS).delete().eq("id", id);
  if (error) throw error;
}

export async function uploadComprobanteParada(rutaId, file) {
  if (!file) return null;
  const ext = file.name?.split(".").pop() || "jpg";
  const safe = String(file.name || `remito.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `cadete-comprobantes/${rutaId || "sin-ruta"}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return publicUrl;
}

// Marca una parada. Si queda "hecho" con importe > 0, registra el egreso en la caja
// del cadete (owner_id = cadeteId) y guarda el vínculo caja_entry_id.
export async function marcarParada(parada, {
  estado,
  motivo = "",
  importe = null,
  moneda = "ARS",
  comprobante_url = null,
  cadeteId = null,
  cierreId = null,
} = {}) {
  const patch = {
    estado,
    motivo: estado === "no_pude" ? clean(motivo) : null,
    resuelto_at: estado === "pendiente" ? null : new Date().toISOString(),
  };
  const imp = num(importe);
  if (comprobante_url) patch.comprobante_url = comprobante_url;
  if (imp != null) { patch.importe = imp; patch.moneda = moneda === "USD" ? "USD" : "ARS"; }

  let cajaEntryId = parada.caja_entry_id || null;
  if (estado === "hecho" && imp && imp > 0 && !cajaEntryId && cadeteId) {
    try {
      const entry = await createCajaChicaEntry({
        fecha: new Date().toISOString().slice(0, 10),
        tipo: "egreso",
        proveedor: parada.proveedor || "",
        detalle: parada.detalle || parada.proveedor || "Compra en ruta",
        importe: imp,
        moneda: moneda === "USD" ? "USD" : "ARS",
        owner_id: cadeteId,
        cierre_id: cierreId || null,
      });
      cajaEntryId = entry?.id || null;
    } catch { /* si falla la caja, igual dejamos marcada la parada */ }
  }
  if (cajaEntryId) patch.caja_entry_id = cajaEntryId;

  const { data, error } = await supabase.from(PARADAS).update(patch).eq("id", parada.id).select("*").single();
  if (error) throw error;
  return data;
}
