import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import useAlertas from "@/hooks/useAlertas";

/**
 * La campanita.
 *
 * No hay tabla de notificaciones: la lista se deriva de lo que está abierto en
 * este momento. Eso está bien -no hay que mantener un log- pero obliga a ser
 * explícito en tres cosas que antes no lo eran, y que eran todo el problema:
 *
 *  1. UNA COSA, UNA NOTIFICACIÓN. Antes cada pedido abierto podía emitir tres
 *     a la vez: "Mensaje en pedido", "Item actualizado" y "Estado de pedido",
 *     los tres con la misma fecha. En las cuentas de admin eran 55 avisos para
 *     31 pedidos: 24 puros duplicados. Ahora cada pedido emite como mucho UNO,
 *     el de su último movimiento real.
 *
 *  2. LO QUE HACÉS VOS NO ES UNA NOVEDAD. Antes sólo los comentarios miraban
 *     el autor; los cambios de estado no, porque la base no guardaba quién los
 *     hacía. Con status_changed_by (migración 20260915230000) ya se puede.
 *     Autor nulo = proceso automático: avisa igual, porque no hay forma de
 *     saber que hayas sido vos.
 *
 *  3. CADA AVISO A QUIEN LE SIRVE. La cola de recepción del pañol es la lista
 *     de trabajo del pañol, no del dueño del astillero: un admin recibía los
 *     18 envíos abiertos sin poder ni querer hacer nada con ellos. Ahora
 *     recepción es de pañol, y los avisos a compras son de compras -al admin
 *     le llegan sólo los urgentes-.
 *
 * Y el "leído" ahora funciona. Antes la identidad de la notificación incluía
 * updated_at, así que cualquier cambio en la fila -aunque fuera de otro campo-
 * la resucitaba como no leída. Ahora cada cosa tiene una clave estable y lo que
 * se guarda es "la vi hasta tal fecha": si pasa algo nuevo después vuelve, y si
 * no, se queda leída.
 */

const CLOSED_ENVIO_STATES = ["recibido", "cerrado", "cancelado"];
const COMPRA_ACTION_STATES = ["nuevo", "en_revision", "cotizando", "comprado"];
const AVISO_ACTIVE_STATES = ["nuevo", "visto", "en_proceso"];

// Recepción salió de acá a propósito: es la lista de trabajo del pañol.
const RECEPCION_ROLES = new Set(["panol"]);
const PRODUCCION_ROLES = new Set(["admin", "oficina"]);
const COMPRAS_ROLES = new Set(["compras", "admin", "tecnica", "oficina", "panol"]);
const LOGISTICA_ROLES = new Set(["compras", "admin", "tecnica", "administracion"]);

const MAX_EN_PANEL = 60;

function storageKey(profile) {
  return `klasea.notificaciones.vistas.${profile?.id || profile?.username || "anon"}`;
}

/** Mapa { clave: fechaISO }: hasta cuándo vio el usuario cada cosa. */
function readVistas(profile) {
  if (typeof window === "undefined" || !profile) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(profile));
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

function writeVistas(profile, mapa) {
  if (typeof window === "undefined" || !profile) return;
  try {
    // Sólo las 300 más recientes: lo viejo ya no está abierto, así que no puede
    // volver a aparecer, y el storage tiene cuota.
    const podado = Object.entries(mapa)
      .sort((a, b) => new Date(b[1] || 0) - new Date(a[1] || 0))
      .slice(0, 300);
    window.localStorage.setItem(storageKey(profile), JSON.stringify(Object.fromEntries(podado)));
  } catch {
    // Cuota llena o modo privado: la sesión sigue andando sin recordar.
  }
}

function roleOf(profile) {
  if (profile?.is_admin) return "admin";
  return profile?.role || "";
}

function canRecepcion(profile) { return RECEPCION_ROLES.has(roleOf(profile)); }
function canProduccion(profile) { return PRODUCCION_ROLES.has(roleOf(profile)); }
function canCompras(profile) { return COMPRAS_ROLES.has(roleOf(profile)); }
function canLogistica(profile) { return LOGISTICA_ROLES.has(roleOf(profile)); }

function isComprasManager(profile) {
  const role = roleOf(profile);
  return role === "admin" || role === "compras";
}

function sedeCuenta(profile) {
  const sede = String(profile?.sede || "").trim();
  if (!sede || sede.toLowerCase() === "ambas") return "";
  return sede;
}

function fmtDateValue(row = {}) {
  return row.updated_at || row.created_at || new Date().toISOString();
}

function estadoCompraLabel(status) {
  const labels = { nuevo: "Nuevo", en_revision: "En revisión", cotizando: "Cotizando", comprado: "Comprado" };
  return labels[status] || status || "Activo";
}

function estadoItemLabel(status) {
  const labels = {
    pendiente: "Pendiente", en_panol: "Enviado a pañol", pedido: "Pedido",
    parcial: "Parcial", recibido: "Recibido", cancelado: "Cancelado",
  };
  return labels[status] || status || "Actualizado";
}

function gravedadCompra(row = {}) {
  if (row.status === "comprado" || row.status === "recibido") return "success";
  if (row.status === "cancelado") return "critical";
  if (row.priority === "urgente") return "critical";
  if (row.status === "en_revision" || row.status === "cotizando") return "warning";
  if (row.priority === "alta" || row.status === "nuevo") return "warning";
  return "info";
}

function gravedadItem(status) {
  if (status === "recibido") return "success";
  if (status === "cancelado") return "critical";
  if (status === "pedido" || status === "parcial") return "warning";
  return "info";
}

function gravedadAviso(row = {}) {
  if (row.prioridad === "urgente") return "critical";
  if (row.prioridad === "alta" || row.estado === "nuevo") return "warning";
  return "info";
}

function nombreDe(perfil) {
  const nombre = String(perfil?.username || "").trim();
  return nombre || null;
}

/**
 * El último movimiento del pedido que NO hizo el usuario.
 *
 * Los tres candidatos -comentario, estado del pedido, estado de un renglón-
 * compiten por fecha y gana el más nuevo. Si todos son propios devuelve null y
 * el pedido no genera ninguna notificación.
 */
function ultimoMovimiento(compra, yo) {
  const candidatos = [];

  if (compra.last_comment_at && compra.last_comment_author_id && compra.last_comment_author_id !== yo) {
    candidatos.push({
      fecha: compra.last_comment_at,
      actor: nombreDe(compra.autor_comentario),
      titulo: "Mensaje en el pedido",
      gravedad: "info",
      sufijo: "",
    });
  }

  // status_changed_by puede no existir todavía -migración sin aplicar- o venir
  // null en las filas viejas. En los dos casos se avisa: no hay manera de saber
  // que el cambio haya sido propio.
  if (compra.status && compra.status !== "nuevo" && compra.status_changed_by !== yo) {
    candidatos.push({
      fecha: compra.status_changed_at || compra.updated_at || compra.created_at,
      actor: nombreDe(compra.autor_estado),
      titulo: "Cambió el estado del pedido",
      gravedad: gravedadCompra(compra),
      sufijo: ` — ${estadoCompraLabel(compra.status)}`,
    });
  }

  const item = [...(compra.items || [])]
    .filter((row) => row.status && row.status !== "pendiente" && row.status_changed_by !== yo)
    .sort((a, b) => new Date(b.status_changed_at || b.updated_at || b.created_at || 0)
                  - new Date(a.status_changed_at || a.updated_at || a.created_at || 0))[0];

  if (item) {
    candidatos.push({
      fecha: item.status_changed_at || item.updated_at || item.created_at,
      actor: null,
      titulo: "Se movió un renglón del pedido",
      gravedad: gravedadItem(item.status),
      sufijo: ` — ${item.description || "renglón"}: ${estadoItemLabel(item.status)}`,
    });
  }

  return candidatos.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))[0] || null;
}

/** Un pedido te importa si es tuyo, si lo seguís, o si atender la cola es tu trabajo. */
function compraMeImporta(compra, profile) {
  const yo = profile?.id;
  if (compra.created_by === yo) return true;
  if (compra.assigned_to === yo) return true;
  if ((compra.followers || []).some((f) => f.user_id === yo)) return true;
  return isComprasManager(profile);
}

/**
 * Los avisos a compras los resuelve compras. Al admin le llegan sólo los
 * urgentes: eran 12 por cuenta y ninguno pedía al dueño del astillero.
 */
function avisoMeImporta(aviso, profile) {
  if (aviso.created_by === profile?.id) return false;
  const rol = roleOf(profile);
  if (rol === "compras") return true;
  if (rol === "admin") return aviso.prioridad === "urgente" || aviso.prioridad === "alta";
  return false;
}

/** El select completo falla mientras la migración 20260915230000 no esté aplicada. */
function faltaLaColumnaDeAutor(error) {
  const msg = String(error?.message || "");
  return msg.includes("status_changed_by")
    || msg.includes("status_changed_at")
    || msg.includes("autor_estado");
}

const SELECT_COMPRAS_BASE = `
  id, title, status, priority, created_at, updated_at, proveedor,
  created_by, assigned_to, last_comment_at, last_comment_author_id,
  project:produccion_obras!purchase_requests_project_id_fkey(id,codigo),
  autor_comentario:profiles!purchase_requests_last_comment_author_id_fkey(id,username),
  followers:request_followers(user_id, notify_whatsapp)
`;

const SELECT_COMPRAS_CON_AUTOR = `
  ${SELECT_COMPRAS_BASE},
  status_changed_at,
  status_changed_by,
  autor_estado:profiles!purchase_requests_status_changed_by_fkey(id,username),
  items:purchase_request_items(id, description, status, created_at, updated_at, status_changed_at, status_changed_by)
`;

const SELECT_COMPRAS_SIN_AUTOR = `
  ${SELECT_COMPRAS_BASE},
  items:purchase_request_items(id, description, status, created_at, updated_at)
`;

export default function useNotificaciones(profile) {
  const role = roleOf(profile);
  const enabled = !!profile && role !== "cliente";
  const [envios, setEnvios] = useState([]);
  const [compras, setCompras] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const [loadingRecepcion, setLoadingRecepcion] = useState(false);
  const [loadingCompras, setLoadingCompras] = useState(false);
  const [loadingAvisos, setLoadingAvisos] = useState(false);
  const [logistica, setLogistica] = useState([]);
  const [loadingLogistica, setLoadingLogistica] = useState(false);
  const [vistas, setVistas] = useState(() => readVistas(profile));
  const {
    alertas,
    loading: loadingAlertas,
    resolverAlerta,
    recargar: recargarAlertas,
  } = useAlertas(null, { enabled: canProduccion(profile), summaryOnly: true });

  useEffect(() => {
    setVistas(readVistas(profile));
  }, [profile]);

  const cargarRecepcion = useCallback(async () => {
    if (!enabled || !canRecepcion(profile)) {
      setEnvios([]);
      return;
    }
    setLoadingRecepcion(true);
    try {
      let query = supabase
        .from("panol_envios")
        .select("id,titulo,sede,destino,origen,estado,created_by,created_at,updated_at")
        .not("estado", "in", `("${CLOSED_ENVIO_STATES.join('","')}")`)
        .order("created_at", { ascending: false });

      const sede = sedeCuenta(profile);
      if (sede) query = query.eq("sede", sede);

      const { data, error } = await query.limit(25);
      if (error) throw error;
      setEnvios(data ?? []);
    } catch {
      setEnvios([]);
    } finally {
      setLoadingRecepcion(false);
    }
  }, [enabled, profile]);

  const cargarCompras = useCallback(async () => {
    if (!enabled || !canCompras(profile)) {
      setCompras([]);
      return;
    }
    setLoadingCompras(true);
    try {
      const pedir = (select) => supabase
        .from("purchase_requests")
        .select(select)
        .in("status", COMPRA_ACTION_STATES)
        .order("updated_at", { ascending: false })
        .limit(40);

      let { data, error } = await pedir(SELECT_COMPRAS_CON_AUTOR);
      if (error && faltaLaColumnaDeAutor(error)) {
        ({ data, error } = await pedir(SELECT_COMPRAS_SIN_AUTOR));
      }
      if (error) throw error;
      setCompras((data ?? []).filter((row) => compraMeImporta(row, profile)));
    } catch {
      setCompras([]);
    } finally {
      setLoadingCompras(false);
    }
  }, [enabled, profile]);

  const cargarAvisos = useCallback(async () => {
    if (!enabled || !canCompras(profile)) {
      setAvisos([]);
      return;
    }
    setLoadingAvisos(true);
    try {
      const { data, error } = await supabase
        .from("compras_avisos")
        .select(`
          id, titulo, detalle, material, destino, prioridad, estado,
          created_by, created_at, updated_at,
          project:produccion_obras!compras_avisos_project_id_fkey(id,codigo)
        `)
        .in("estado", AVISO_ACTIVE_STATES)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      setAvisos((data ?? []).filter((row) => avisoMeImporta(row, profile)));
    } catch {
      setAvisos([]);
    } finally {
      setLoadingAvisos(false);
    }
  }, [enabled, profile]);

  const cargarLogistica = useCallback(async () => {
    if (!enabled || !canLogistica(profile)) {
      setLogistica([]);
      return;
    }
    setLoadingLogistica(true);
    try {
      const manager = isComprasManager(profile);
      let query = supabase
        .from("calendario_eventos")
        .select("id,carga,titulo,obra,estado,fecha,fecha_solicitada,fecha_propuesta,fecha_confirmada,hora_propuesta,hora_confirmada,tipo_transporte,proveedor_logistico,created_by,updated_at,created_at")
        .eq("clase", "solicitud_logistica")
        .in("estado", manager ? ["solicitado", "fecha_aceptada"] : ["fecha_propuesta", "confirmado"])
        .order("updated_at", { ascending: false })
        .limit(30);
      if (!manager) query = query.eq("created_by", profile?.id);
      const { data, error } = await query;
      if (error) throw error;
      // Un movimiento que pediste vos y que sigue como lo dejaste no es novedad.
      setLogistica((data || []).filter((row) => !(manager && row.created_by === profile?.id)));
    } catch {
      // La migración logística puede no estar aplicada todavía.
      setLogistica([]);
    } finally {
      setLoadingLogistica(false);
    }
  }, [enabled, profile]);

  useEffect(() => {
    const refreshAll = () => {
      void cargarRecepcion();
      void cargarCompras();
      void cargarAvisos();
      void cargarLogistica();
    };
    refreshAll();

    const refreshTimers = new Map();
    const schedule = (fn) => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(refreshTimers.get(fn));
      refreshTimers.set(fn, window.setTimeout(() => {
        refreshTimers.delete(fn);
        void fn();
      }, 500));
    };

    const handleVisible = () => {
      if (document.visibilityState === "visible") schedule(refreshAll);
    };
    const handleOnline = () => schedule(refreshAll);
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("online", handleOnline);
    const safetyInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") schedule(refreshAll);
    }, 15 * 60 * 1000);

    const channels = [];
    if (enabled && canRecepcion(profile)) {
      channels.push(
        supabase
          .channel(`rt-notif-panol-envios-${profile?.id || "anon"}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "panol_envios" }, () => schedule(cargarRecepcion))
          .subscribe(),
      );
    }
    if (enabled && canCompras(profile)) {
      channels.push(
        supabase
          .channel(`rt-notif-compras-${profile?.id || "anon"}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "purchase_requests" }, () => schedule(cargarCompras))
          .on("postgres_changes", { event: "*", schema: "public", table: "request_followers" }, () => schedule(cargarCompras))
          .on("postgres_changes", { event: "*", schema: "public", table: "compras_avisos" }, () => schedule(cargarAvisos))
          .subscribe(),
      );
    }
    if (enabled && canLogistica(profile)) {
      channels.push(
        supabase
          .channel(`rt-notif-logistica-${profile?.id || "anon"}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "calendario_eventos" }, () => schedule(cargarLogistica))
          .subscribe(),
      );
    }

    return () => {
      refreshTimers.forEach((timer) => window.clearTimeout(timer));
      refreshTimers.clear();
      window.clearInterval(safetyInterval);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("online", handleOnline);
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [cargarAvisos, cargarCompras, cargarLogistica, cargarRecepcion, enabled, profile]);

  const notificaciones = useMemo(() => {
    if (!enabled) return [];
    const yo = profile?.id;
    const out = [];

    if (canRecepcion(profile)) {
      for (const envio of envios) {
        if (envio.created_by === yo) continue;
        const titulo = envio.titulo || "Envío a recepción";
        const destino = envio.destino || envio.origen || "";
        const sede = envio.sede ? ` · ${envio.sede}` : "";
        out.push({
          clave: `recepcion:${envio.id}`,
          tipo: "recepcion",
          gravedad: envio.estado === "parcial" ? "warning" : "info",
          titulo: "Recepción pendiente",
          detalle: `${titulo}${destino ? ` — ${destino}` : ""}${sede}`,
          actor: null,
          fecha: fmtDateValue(envio),
          ruta: "/recepcion-panol",
          meta: { envio },
        });
      }
    }

    if (canProduccion(profile)) {
      for (const alerta of alertas) {
        out.push({
          clave: `produccion:${alerta.id}`,
          tipo: "produccion",
          gravedad: alerta.gravedad || "info",
          titulo: "Alerta de producción",
          detalle: alerta.mensaje || "Alerta activa",
          actor: null,
          fecha: alerta.created_at,
          ruta: "/obras",
          meta: { alerta },
        });
      }
    }

    if (canCompras(profile)) {
      for (const compra of compras) {
        const movimiento = ultimoMovimiento(compra, yo);
        if (!movimiento) continue;
        const obra = compra.project?.codigo ? ` · ${compra.project.codigo}` : "";
        out.push({
          clave: `compra:${compra.id}`,
          tipo: "compras",
          gravedad: movimiento.gravedad,
          titulo: movimiento.titulo,
          detalle: `${compra.title || "Pedido de compra"}${movimiento.sufijo}${obra}`,
          actor: movimiento.actor,
          fecha: movimiento.fecha,
          ruta: `/compras?open=${compra.id}`,
          meta: { compra, movimiento },
        });
      }

      for (const aviso of avisos) {
        const obra = aviso.project?.codigo ? ` · ${aviso.project.codigo}` : "";
        const material = aviso.material ? ` — ${aviso.material}` : "";
        out.push({
          clave: `aviso:${aviso.id}`,
          tipo: "compras",
          gravedad: gravedadAviso(aviso),
          titulo: "Aviso a compras",
          detalle: `${aviso.titulo || "Aviso"}${material}${obra}`,
          actor: null,
          fecha: aviso.updated_at || aviso.created_at,
          ruta: `/compras?tab=avisos&aviso=${aviso.id}`,
          meta: { aviso },
        });
      }
    }

    if (canLogistica(profile)) {
      for (const movement of logistica) {
        const manager = isComprasManager(profile);
        const proposed = movement.estado === "fecha_propuesta";
        const accepted = movement.estado === "fecha_aceptada";
        out.push({
          clave: `logistica:${movement.id}`,
          tipo: "logistica",
          gravedad: movement.estado === "solicitado" ? "warning" : proposed ? "info" : accepted ? "warning" : "success",
          titulo: manager ? accepted ? "Técnica aceptó la fecha" : "Nueva solicitud logística" : proposed ? "Compras propuso otra fecha" : "Movimiento confirmado",
          detalle: `${movement.carga || movement.titulo || "Movimiento"}${movement.obra ? ` · ${movement.obra}` : ""}`,
          actor: null,
          fecha: movement.updated_at || movement.created_at,
          ruta: `/calendario?open=${movement.id}`,
          meta: { movement },
        });
      }
    }

    return out
      .map((item) => ({ ...item, id: `${item.clave}@${item.fecha || ""}` }))
      .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }, [alertas, avisos, compras, enabled, envios, logistica, profile]);

  const marcarVista = useCallback((items) => {
    const lote = (Array.isArray(items) ? items : [items]).filter((item) => item?.clave);
    if (!lote.length) return;
    setVistas((prev) => {
      const next = { ...prev };
      for (const item of lote) {
        const previa = next[item.clave];
        // Si ya la había visto más adelante, no retroceder.
        if (!previa || new Date(item.fecha || 0) > new Date(previa)) {
          next[item.clave] = item.fecha || new Date().toISOString();
        }
      }
      writeVistas(profile, next);
      return next;
    });
  }, [profile]);

  const markTodoLeido = useCallback(() => {
    marcarVista(notificaciones);
  }, [marcarVista, notificaciones]);

  /**
   * La lista incluye las leídas, en gris. Antes sólo traía las no leídas, así
   * que tocar "Leído" vaciaba el panel entero y no quedaba forma de volver a
   * mirar lo que ya habías visto.
   */
  const lista = useMemo(() => notificaciones
    .map((notif) => {
      const vistaHasta = vistas[notif.clave];
      const leida = !!vistaHasta && new Date(notif.fecha || 0) <= new Date(vistaHasta);
      return { ...notif, leida };
    })
    .slice(0, MAX_EN_PANEL),
  [notificaciones, vistas]);

  const unreadCount = useMemo(() => lista.filter((notif) => !notif.leida).length, [lista]);

  return {
    loading: loadingRecepcion || loadingCompras || loadingAvisos || loadingLogistica || (canProduccion(profile) && loadingAlertas),
    lista,
    unreadCount,
    markLeido: marcarVista,
    markTodoLeido,
    resolverAlerta,
    recargar: () => {
      cargarRecepcion();
      cargarCompras();
      cargarAvisos();
      cargarLogistica();
      if (canProduccion(profile)) recargarAlertas?.();
    },
  };
}
