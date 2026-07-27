import { supabase } from "@/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Solicitudes de preparación a pañol.
//
//   panol_solicitudes       → la cabecera del papel (N° pañol, obra, quién pide)
//     └ panol_solicitud_items → lo que pañol va armando, con estado por ítem
//
// La firma de retiro vive en la misma cabecera (retirado_*): pasa una sola vez
// por solicitud y se imprime junto con ella como comprobante.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const txt = (v) => {
  const s = String(v ?? "").trim();
  return s || null;
};

/* ── vocabulario compartido con la UI y con el imprimible ─────────────────── */

export const SOLICITUD_ESTADOS = [
  { value: "borrador", label: "Borrador", color: "#a1a1aa" },
  // La arma el solicitante desde su usuario y la manda; pañol todavía no la
  // tomó. Es el estado que separa "lo estoy escribiendo" de "está en la cola".
  { value: "enviada", label: "Enviada", color: "#8b5cf6" },
  { value: "preparando", label: "Preparando", color: "#f59e0b" },
  { value: "listo", label: "Listo para retirar", color: "#3b82f6" },
  { value: "entregado", label: "Entregado", color: "#10b981" },
  { value: "cancelado", label: "Cancelada", color: "#ef4444" },
];

export const ITEM_ESTADOS = [
  { value: "pendiente", label: "Pendiente", color: "#a1a1aa" },
  { value: "preparado", label: "Preparado", color: "#10b981" },
  { value: "faltante", label: "Falta stock", color: "#ef4444" },
  { value: "reemplazado", label: "Reemplazado", color: "#a78bfa" },
];

export const PRIORIDADES = [
  { value: "normal", label: "Normal", color: "#a1a1aa" },
  { value: "urgente", label: "Urgente", color: "#ef4444" },
];

// Los mismos que están tildados en el papel: si se cambian acá, hay que
// cambiarlos también en SolicitudPanolPrintable o dejan de coincidir.
export const SECTORES = ["Laminación", "Pintura", "Mecánica", "Electricidad", "Carpintería", "Sanitarios", "Otro"];
export const TIPOS = ["Consumibles", "Materiales", "Herramientas"];

export const estadoMeta = (value) =>
  SOLICITUD_ESTADOS.find((e) => e.value === value) || SOLICITUD_ESTADOS[0];
export const itemEstadoMeta = (value) =>
  ITEM_ESTADOS.find((e) => e.value === value) || ITEM_ESTADOS[0];

const SOLICITUD_COLS =
  "id, numero, obra_id, obra_texto, sede_origen, sector, prioridad, fecha_pedido, fecha_retiro, " +
  "solicita, retira, tipo, tarea, observaciones, notas_panol, preparado_por, estado, origen, " +
  "retirado_por_id, retirado_por_nombre, retirado_por_dni, retirado_metodo, " +
  "retirado_nfc_uid, retirado_at, created_by, created_at, updated_at";

const ITEM_COLS =
  "id, solicitud_id, material_id, descripcion, codigo, cantidad, unidad, observacion, estado, orden, " +
  "es_consumible, faltante_auto, stock_disponible_al_marcar";

async function actorId() {
  const { data: { session } = {} } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOLICITUDES
   ═══════════════════════════════════════════════════════════════════════════ */

// Listado para la barra lateral. Trae sólo el conteo de ítems por estado (no
// los ítems enteros): la lista muestra el progreso "12/18 preparados" y con
// traer las filas completas de 200 solicitudes el payload se iba de las manos.
export async function fetchSolicitudes({ estado = "", obraId = "", q = "", limit = 200, soloMias = false } = {}) {
  let query = supabase
    .from("panol_solicitudes")
    .select(`${SOLICITUD_COLS}, obra:produccion_obras(id, codigo, descripcion), items:panol_solicitud_items(id, estado)`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (estado) query = query.eq("estado", estado);
  if (obraId) query = query.eq("obra_id", obraId);
  // El que pide ve sólo lo suyo. La RLS ya lo obliga, pero filtrar acá también
  // evita mostrarle una lista vacía sin explicación cuando la policy recorta.
  if (soloMias) {
    const uid = await actorId();
    if (uid) query = query.eq("created_by", uid);
  }

  const termino = String(q ?? "").trim();
  if (termino) {
    // El número se busca aparte porque es int: un `ilike` sobre una columna
    // numérica revienta en PostgREST.
    const comoNumero = /^\d+$/.test(termino) ? `,numero.eq.${termino}` : "";
    // La coma y los paréntesis son separadores de la sintaxis de PostgREST: si
    // llegan crudos desde el buscador, el filtro se parte al medio y la query
    // vuelve un error raro en vez de "sin resultados".
    const like = `%${termino.replace(/[%,()]/g, " ")}%`;
    query = query.or(
      `solicita.ilike.${like},retira.ilike.${like},obra_texto.ilike.${like},sector.ilike.${like},tarea.ilike.${like}${comoNumero}`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((s) => {
    const items = s.items ?? [];
    return {
      ...s,
      items: undefined,
      totalItems: items.length,
      itemsListos: items.filter((i) => i.estado === "preparado" || i.estado === "reemplazado").length,
      itemsFaltantes: items.filter((i) => i.estado === "faltante").length,
    };
  });
}

export async function fetchSolicitud(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from("panol_solicitudes")
    .select(`${SOLICITUD_COLS}, obra:produccion_obras(id, codigo, descripcion)`)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data ?? null;
}

export async function crearSolicitud(datos = {}) {
  const fila = {
    obra_id: datos.obra_id || null,
    obra_texto: txt(datos.obra_texto),
    sede_origen: datos.sede_origen === "Chubut" ? "Chubut" : datos.sede_origen === "Pampa" ? "Pampa" : null,
    sector: txt(datos.sector),
    prioridad: datos.prioridad === "urgente" ? "urgente" : "normal",
    fecha_pedido: datos.fecha_pedido || new Date().toISOString().slice(0, 10),
    fecha_retiro: datos.fecha_retiro || null,
    solicita: txt(datos.solicita),
    retira: txt(datos.retira),
    tipo: Array.isArray(datos.tipo) ? datos.tipo.filter(Boolean) : [],
    tarea: txt(datos.tarea),
    observaciones: txt(datos.observaciones),
    notas_panol: txt(datos.notas_panol),
    preparado_por: txt(datos.preparado_por),
    // Dos arranques distintos según quién la crea:
    //   · pañol digitalizando un papel → "preparando", porque ya lo tiene en la
    //     mano y arranca a armar el pedido.
    //   · el solicitante desde su usuario → "borrador", que todavía la está
    //     escribiendo y la manda cuando termina.
    estado: datos.estado || "preparando",
    // 'papel' = digitalizada del formulario impreso · 'digital' = la cargó el
    // que pide · 'foto_ia' = salió de leer una foto. Sirve para saber, dentro de
    // unos meses, qué camino usa la gente de verdad.
    origen: datos.origen || "papel",
    created_by: await actorId(),
  };
  if (!fila.solicita && !fila.obra_id && !fila.obra_texto) {
    throw new Error("Cargá al menos quién pide o para qué obra es.");
  }
  const { data, error } = await supabase
    .from("panol_solicitudes")
    .insert(fila)
    .select("id, numero")
    .single();
  if (error) throw error;
  return data;
}

// El solicitante la manda a pañol. A partir de acá deja de poder editarla: la
// RLS sólo lo deja tocar las suyas en 'borrador' o 'enviada', y pañol la toma
// pasándola a 'preparando'.
export async function enviarSolicitud(id) {
  if (!id) return;
  const { error } = await supabase
    .from("panol_solicitudes")
    .update({ estado: "enviada", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function actualizarSolicitud(id, patch = {}) {
  if (!id) return;
  const clean = {};
  if (patch.obra_id !== undefined) clean.obra_id = patch.obra_id || null;
  if (patch.obra_texto !== undefined) clean.obra_texto = txt(patch.obra_texto);
  if (patch.sede_origen !== undefined) {
    clean.sede_origen = patch.sede_origen === "Chubut" ? "Chubut" : patch.sede_origen === "Pampa" ? "Pampa" : null;
  }
  if (patch.sector !== undefined) clean.sector = txt(patch.sector);
  if (patch.prioridad !== undefined) clean.prioridad = patch.prioridad === "urgente" ? "urgente" : "normal";
  if (patch.fecha_pedido !== undefined) clean.fecha_pedido = patch.fecha_pedido || null;
  if (patch.fecha_retiro !== undefined) clean.fecha_retiro = patch.fecha_retiro || null;
  if (patch.solicita !== undefined) clean.solicita = txt(patch.solicita);
  if (patch.retira !== undefined) clean.retira = txt(patch.retira);
  if (patch.tipo !== undefined) clean.tipo = Array.isArray(patch.tipo) ? patch.tipo.filter(Boolean) : [];
  if (patch.tarea !== undefined) clean.tarea = txt(patch.tarea);
  // Pasa a 'foto_ia' cuando se aplica un borrador leído de una foto: queda
  // registrado que esos datos no los tipeó una persona.
  if (patch.origen !== undefined) clean.origen = patch.origen;
  if (patch.observaciones !== undefined) clean.observaciones = txt(patch.observaciones);
  if (patch.notas_panol !== undefined) clean.notas_panol = txt(patch.notas_panol);
  if (patch.preparado_por !== undefined) clean.preparado_por = txt(patch.preparado_por);
  if (patch.estado !== undefined) clean.estado = patch.estado;
  if (!Object.keys(clean).length) return;
  const { error } = await supabase.from("panol_solicitudes").update(clean).eq("id", id);
  if (error) throw error;
}

export async function cambiarEstadoSolicitud(id, estado) {
  return actualizarSolicitud(id, { estado });
}

export async function borrarSolicitud(id) {
  if (!id) return;
  const { error } = await supabase.from("panol_solicitudes").delete().eq("id", id);
  if (error) throw error;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ÍTEMS
   ═══════════════════════════════════════════════════════════════════════════ */

export async function fetchItems(solicitudId) {
  if (!solicitudId) return [];
  const { data, error } = await supabase
    .from("panol_solicitud_items")
    .select(ITEM_COLS)
    .eq("solicitud_id", solicitudId)
    .order("orden", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// El orden nuevo arranca donde terminó el anterior para que los ítems queden en
// el orden en que pañol los fue armando (que es el orden del papel).
async function proximoOrden(solicitudId) {
  const { data } = await supabase
    .from("panol_solicitud_items")
    .select("orden")
    .eq("solicitud_id", solicitudId)
    .order("orden", { ascending: false })
    .limit(1);
  return (data?.[0]?.orden ?? -1) + 1;
}

// Alta desde el catálogo (MaterialPicker devuelve varios de una).
export async function agregarItemsDesdeCatalogo(solicitudId, materiales = []) {
  if (!solicitudId) throw new Error("Falta la solicitud.");
  const validos = (materiales || []).filter((m) => m?.id);
  if (!validos.length) return 0;
  const base = await proximoOrden(solicitudId);
  const filas = validos.map((m, i) => ({
    solicitud_id: solicitudId,
    material_id: m.id,
    // Se congela lo que decía el catálogo al momento de cargarlo.
    descripcion: m.descripcion || "Material",
    codigo: m.codigo || null,
    cantidad: num(m.cantidad) || 1,
    unidad: m.unidad || m.unidad_medida || null,
    es_consumible: !!m.es_consumible,
    estado: "pendiente",
    orden: base + i,
  }));
  const { error } = await supabase.from("panol_solicitud_items").insert(filas);
  if (error) throw error;
  return filas.length;
}

// Alta a mano: lo que el papel pide y no está en el catálogo.
export async function agregarItemLibre(
  solicitudId,
  { descripcion, cantidad = 1, unidad = null, observacion = null, es_consumible = false } = {}
) {
  if (!solicitudId) throw new Error("Falta la solicitud.");
  const desc = String(descripcion ?? "").trim();
  if (!desc) throw new Error("El ítem necesita una descripción.");
  const orden = await proximoOrden(solicitudId);
  const { data, error } = await supabase
    .from("panol_solicitud_items")
    .insert({
      solicitud_id: solicitudId,
      material_id: null,
      descripcion: desc,
      cantidad: num(cantidad) || 1,
      unidad: txt(unidad),
      observacion: txt(observacion),
      es_consumible: !!es_consumible,
      estado: "pendiente",
      orden,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarItem(id, patch = {}) {
  if (!id) return;
  const clean = {};
  if (patch.descripcion !== undefined) clean.descripcion = String(patch.descripcion ?? "").trim() || "Material";
  if (patch.codigo !== undefined) clean.codigo = txt(patch.codigo);
  if (patch.cantidad !== undefined) clean.cantidad = num(patch.cantidad);
  if (patch.unidad !== undefined) clean.unidad = txt(patch.unidad);
  if (patch.observacion !== undefined) clean.observacion = txt(patch.observacion);
  if (patch.estado !== undefined) clean.estado = patch.estado;
  if (patch.orden !== undefined) clean.orden = num(patch.orden);
  if (!Object.keys(clean).length) return;
  const { error } = await supabase.from("panol_solicitud_items").update(clean).eq("id", id);
  if (error) throw error;
}

export async function quitarItem(id) {
  if (!id) return;
  const { error } = await supabase.from("panol_solicitud_items").delete().eq("id", id);
  if (error) throw error;
}

// Marca todos los pendientes de una vez. Es el caso normal: pañol arma el
// pedido completo y recién ahí lo pasa a "listo".
export async function marcarTodosPreparados(solicitudId) {
  if (!solicitudId) return 0;
  const { data, error } = await supabase
    .from("panol_solicitud_items")
    .update({ estado: "preparado" })
    .eq("solicitud_id", solicitudId)
    .eq("estado", "pendiente")
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RETIRO / FIRMA
   ═══════════════════════════════════════════════════════════════════════════ */

// Registra quién se llevó el pedido y cómo se lo identificó. Deja la solicitud
// en "entregado" en el mismo update: no hay retiro sin entrega.
export async function registrarRetiro(id, { empleado = null, nombre = "", metodo = "manual", nfcUid = null } = {}) {
  if (!id) throw new Error("Falta la solicitud.");
  const nombreFinal = txt(empleado?.nombre ?? nombre);
  if (!nombreFinal) throw new Error("Falta identificar a la persona que retira.");

  const { data, error } = await supabase.rpc("panol_confirmar_retiro_solicitud", {
    p_solicitud_id: id,
    p_empleado_id: empleado?.id || null,
    p_nombre: nombreFinal,
    p_dni: txt(empleado?.dni),
    p_metodo: metodo === "nfc" ? "nfc" : "manual",
    p_nfc_uid: txt(nfcUid),
  });
  if (error) throw error;
  if (data?.ok === false) throw new Error(data.message || "No se pudo confirmar el retiro.");
  return data;
}

// Deshacer revierte también los movimientos de stock vinculados.
export async function anularRetiro(id) {
  if (!id) return;
  const { data, error } = await supabase.rpc("panol_anular_retiro_solicitud", {
    p_solicitud_id: id,
  });
  if (error) throw error;
  if (data?.ok === false) throw new Error(data.message || "No se pudo deshacer el retiro.");
  return data;
}

// Lista corta para el retiro manual (cuando no hay lector NFC a mano). Se pide
// sólo lo que se muestra: el maestro de RRHH tiene fotos y contratistas que acá
// no hacen falta.
export async function fetchPersonasRetiro() {
  const { data, error } = await supabase
    .from("rrhh_empleados")
    .select("id, nombre, dni, sede, activo")
    .neq("activo", false)
    .order("nombre");
  if (error) throw error;
  return data ?? [];
}
