// Datos de Memorias. La memoria vive en obra_memorias (una fila por barco, una
// columna por campo). Lo que no tiene columna (notas de casi todos los campos)
// va en `extras` si la migración 20261005120000 está aplicada.
//
// Los adicionales del cliente son los de la lista de la obra
// (panol_obra_addons, los mismos que se cargan en Materiales) y las opciones de
// línea son los condicionantes de la matriz: así lo que se define en la memoria
// llega a Compras y al pañol sin cargarlo dos veces.
import { supabase } from "@/supabaseClient";
import { crearAddon, ensureObraMaterialSnapshot } from "@/features/materiales/api";
import {
  fetchMatrizCondicionantes,
  fetchObraMatrizCondicionantes,
  setObraMatrizCondicionante,
} from "@/features/materiales/materialesConfig";
import { sinTildes } from "./acabados";

// Columnas conocidas por si la tabla todavía no tiene filas para leerlas.
const COLUMNAS_BASE = [
  "id", "obra_codigo", "obra_id", "propietario", "constructor", "motorizacion", "color_casco",
  "grupo_electrogeno", "cabina", "madera_muebles", "piso", "alfombra", "color_mesadas",
  "tapiceria_mamparos", "tapiceria_dinette", "tapiceria_respaldos", "tapiceria_exterior",
  "color_acolchados", "loneria_toldo_proa", "loneria_cobertor", "color_cerramientos", "loneria_otros",
  "electronica", "tv_camarote", "tv_cockpit", "adicionales", "teca_tipo", "starlink", "sternthruster",
  "fabricadora_hielo", "radar", "pluma", "planchada", "mesa_fly", "aire_acondicionado", "calefactor",
  "bow_thruster", "plotter", "faro", "flaps", "starlink_obs", "sternthruster_obs",
  "fabricadora_hielo_obs", "radar_obs", "pluma_obs", "updated_at", "created_at", "nombre_barco", "audio",
];

export async function traerObrasActivas() {
  const { data, error } = await supabase
    .from("produccion_obras")
    .select("id,codigo,estado,linea_nombre,descripcion,fecha_inicio,fecha_fin_estimada")
    .eq("estado", "activa")
    .order("codigo", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function traerMemorias() {
  const { data, error } = await supabase.from("obra_memorias").select("*");
  if (error) throw error;
  const filas = data || [];
  const columnas = new Set(filas.length ? Object.keys(filas[0]) : COLUMNAS_BASE);
  return { filas, columnas };
}

export async function traerPerfiles(ids) {
  const lista = [...new Set((ids || []).filter(Boolean))];
  if (!lista.length) return new Map();
  const { data } = await supabase.from("profiles").select("id,username,nombre_completo").in("id", lista);
  return new Map((data || []).map((p) => [p.id, p.nombre_completo || p.username || "Alguien"]));
}

const vacio = (v) => (typeof v === "string" ? (v.trim() === "" ? null : v) : v);

// Guarda sólo lo que cambió. Lo que tiene columna va a la columna; el resto a
// `extras` (si existe). Devuelve la fila guardada y las claves que no hubo
// dónde guardar.
export async function guardarCambios({ obra, fila, cambios, columnas }) {
  const payload = {};
  const extras = {};
  const sinLugar = [];
  for (const [key, valor] of Object.entries(cambios)) {
    if (columnas.has(key)) payload[key] = vacio(valor);
    else if (columnas.has("extras")) extras[key] = vacio(valor);
    else sinLugar.push(key);
  }
  if (Object.keys(extras).length) {
    const previos = fila?.extras && typeof fila.extras === "object" ? fila.extras : {};
    const juntos = { ...previos, ...extras };
    for (const k of Object.keys(juntos)) if (juntos[k] == null) delete juntos[k];
    payload.extras = juntos;
  }
  if (!Object.keys(payload).length) return { fila, sinLugar };

  let resultado;
  if (fila?.id) {
    if (!fila.obra_id && obra?.id) payload.obra_id = obra.id;
    resultado = await supabase.from("obra_memorias").update(payload).eq("id", fila.id).select("*").single();
  } else {
    resultado = await supabase
      .from("obra_memorias")
      .insert({ obra_codigo: obra.codigo, obra_id: obra.id, ...payload })
      .select("*")
      .single();
  }
  if (resultado.error) throw resultado.error;
  return { fila: resultado.data, sinLugar };
}

// Últimos cambios de la memoria (si la migración está aplicada).
export async function traerCambios(memoriaId) {
  if (!memoriaId) return { ok: true, cambios: [] };
  const { data, error } = await supabase
    .from("obra_memoria_cambios")
    .select("id,campo,antes,despues,user_id,created_at")
    .eq("memoria_id", memoriaId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) return { ok: false, cambios: [] };
  return { ok: true, cambios: data || [] };
}

// Avisa cuando alguien cambia una memoria. Cada pantalla usa su propio nombre
// de canal (dos canales con el mismo nombre rompen la suscripción).
export function escucharMemorias(nombre, alCambiar) {
  const canal = supabase
    .channel(`rt-memorias-${nombre}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "obra_memorias" }, alCambiar)
    .subscribe();
  return () => { supabase.removeChannel(canal); };
}

// ── Adicionales de la obra ─────────────────────────────────────────────────

// Cuántos adicionales tiene cada obra (para la portada).
export async function traerCantidadAdicionales() {
  const { data, error } = await supabase.from("panol_obra_addons").select("obra_id,tipo");
  if (error) return new Map();
  const mapa = new Map();
  for (const fila of data || []) mapa.set(fila.obra_id, (mapa.get(fila.obra_id) || 0) + 1);
  return mapa;
}

const claveTexto = (descripcion, codigo, unidad) => sinTildes(`${descripcion || ""}|${codigo || ""}|${unidad || ""}`);

// En qué anda cada renglón de la lista de la obra.
export function estadoDeRenglon(renglon) {
  const estado = String(renglon?.estado || "").toLowerCase();
  if (estado === "egresado") return { label: "A bordo", tono: "verde" };
  if (["en_panol", "recibido"].includes(estado)) return { label: "En pañol", tono: "azul" };
  if (estado === "parcial") return { label: "Llegó una parte", tono: "azul" };
  // En la lista de la obra "pedido" es comprado y todavía no recibido.
  if (["comprado", "pedido"].includes(estado)) return { label: "Comprado", tono: "violeta" };
  if (renglon?.purchase_request_id) return { label: "Pedido a Compras", tono: "cian" };
  return { label: "Falta comprar", tono: "neutro" };
}

// Los adicionales/opcionales de la obra con lo que pasó con cada uno (sale del
// renglón de la lista de la obra, si ya se generó).
export async function traerAdicionalesObra(obraId) {
  if (!obraId) return [];
  const [addons, renglones] = await Promise.all([
    supabase.from("panol_obra_addons").select("*").eq("obra_id", obraId).order("created_at"),
    supabase
      .from("panol_obra_materiales_snapshot")
      .select("id,descripcion,codigo,unidad,material_id,source,tipo,estado,purchase_request_id")
      .eq("obra_id", obraId)
      .or("source.eq.addon,tipo.eq.addon"),
  ]);
  if (addons.error) throw addons.error;
  const lista = renglones.data || [];
  return (addons.data || []).map((addon) => {
    const renglon = lista.find((r) => (addon.material_id && r.material_id === addon.material_id))
      || lista.find((r) => claveTexto(r.descripcion, r.codigo, r.unidad) === claveTexto(addon.descripcion, addon.codigo, addon.unidad || "unidad"))
      || lista.find((r) => sinTildes(r.descripcion) === sinTildes(addon.descripcion));
    return { ...addon, renglon: renglon || null, estado: estadoDeRenglon(renglon) };
  });
}

// Suma un adicional a la lista de la obra. Queda igual que si se cargara desde
// Materiales: Compras lo ve como adicional pendiente de compra.
export async function agregarAdicional(obra, { material = null, descripcion, cantidad = 1, tipo = "adicional", observaciones = "" }) {
  const texto = String(material?.descripcion || descripcion || "").trim();
  if (!obra?.id) throw new Error("La obra no está en Producción.");
  if (!texto) throw new Error("Escribí qué es el adicional.");
  const unidad = material?.unidad_medida || "unidad";
  const payload = {
    material_id: material?.id || null,
    descripcion: texto,
    cantidad: Number(cantidad) > 0 ? Number(cantidad) : 1,
    proveedor: material?.proveedor || null,
    tipo,
    observaciones: String(observaciones || "").trim() || "Cargado desde la memoria descriptiva",
    codigo: material?.codigo || null,
    unidad,
    categoria_id: material?.categoria_id || null,
    precio_unitario: material?.precio_unitario ?? null,
    moneda: material?.moneda || null,
    imagen_url: material?.imagen_url || null,
  };
  await crearAddon(obra.id, payload);

  // Si la lista de la obra ya se generó, se suma el renglón para que Compras
  // lo vea sin esperar a que alguien abra la obra en Materiales. Mismo renglón
  // (y misma clave) que arma Materiales: no se duplica.
  const { count } = await supabase
    .from("panol_obra_materiales_snapshot")
    .select("id", { count: "exact", head: true })
    .eq("obra_id", obra.id);
  if (count > 0) {
    await ensureObraMaterialSnapshot(obra.id, [{
      source: "addon",
      bucket: { key: "addon", label: tipo === "opcional" ? "Opcional" : "Adicional" },
      materialId: material?.id || null,
      descripcion: texto,
      codigo: material?.codigo || "",
      cantidad: payload.cantidad,
      unidad,
      proveedor: material?.proveedor || null,
      rubro: tipo === "opcional" ? "Opcionales" : "Adicionales",
      precio: { amount: material?.precio_unitario ?? null, moneda: material?.moneda || null },
      obs: payload.observaciones,
      estadoObra: "pendiente",
    }]);
  }
}

// ── Opciones de la línea (condicionantes de la matriz) ─────────────────────

export async function traerOpcionesLinea(modelo, obraId) {
  if (!modelo) return { ok: true, opciones: [] };
  const [matriz, obra] = await Promise.all([fetchMatrizCondicionantes(), fetchObraMatrizCondicionantes(obraId)]);
  if (!matriz.ok) return { ok: false, opciones: [] };
  const opciones = matriz.condicionantes
    .filter((c) => String(c.modelo) === String(modelo) && c.activo !== false)
    .map((c) => {
      const propia = obra.map.get(c.id);
      return {
        id: c.id,
        nombre: c.nombre,
        tipo: c.tipo,
        descripcion: c.descripcion,
        porDefecto: !!c.activo_por_defecto,
        activo: propia ? !!propia.activo : !!c.activo_por_defecto,
        tocada: !!propia,
        items: (c.items || []).filter((i) => i.activo !== false).length,
      };
    });
  return { ok: true, opciones };
}

export function cambiarOpcionLinea(obraId, opcionId, activo) {
  return setObraMatrizCondicionante(obraId, opcionId, activo);
}
