import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import useAlertas from "@/hooks/useAlertas";
import {
  audienciaAviso,
  audienciaCompra,
  audienciaLogistica,
  audienciaProduccion,
  audienciaRecepcion,
  esAccionPropia,
  gravedadAviso,
  gravedadCompra,
  gravedadItem,
  gravedadLogistica,
  gravedadRecepcion,
  isComprasOperativo,
  operationalRole,
  puedeVerCompras,
  puedeVerLogistica,
  puedeVerProduccion,
  puedeVerRecepcion,
  sedeOperativa,
  userIdOf,
} from "@/lib/notificacionesAudience";

/**
 * La campanita.
 *
 * No hay tabla de notificaciones: la lista se deriva de lo abierto ahora.
 * Audiencia y prioridad viven en `notificacionesAudience.js`.
 *
 *  1. UNA COSA, UNA NOTIFICACIÓN por pedido (último movimiento ajeno).
 *  2. LO QUE HACÉS VOS NO ES NOVEDAD (cuando hay autor).
 *  3. ADMIN ≠ suscripción a todo: pesa la relación con el evento.
 */

const CLOSED_ENVIO_STATES = ["recibido", "cerrado", "cancelado"];
const COMPRA_ACTION_STATES = ["nuevo", "en_revision", "cotizando", "comprado"];
const COMPRA_TERMINAL_STATES = ["recibido", "cancelado"];
const COMPRA_TERMINAL_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const AVISO_ACTIVE_STATES = ["nuevo", "visto", "en_proceso"];

const MAX_EN_PANEL = 60;

function storageKey(profile) {
  return `klasea.notificaciones.vistas.${profile?.id || profile?.username || "anon"}`;
}

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
    const podado = Object.entries(mapa)
      .sort((a, b) => new Date(b[1] || 0) - new Date(a[1] || 0))
      .slice(0, 300);
    window.localStorage.setItem(storageKey(profile), JSON.stringify(Object.fromEntries(podado)));
  } catch {
    // Cuota llena o modo privado.
  }
}

function fmtDateValue(row = {}) {
  return row.updated_at || row.created_at || new Date().toISOString();
}

function estadoCompraLabel(status) {
  const labels = {
    nuevo: "Nuevo",
    en_revision: "En revisión",
    cotizando: "Cotizando",
    comprado: "Comprado",
    recibido: "Recibido",
    cancelado: "Cancelado",
  };
  return labels[status] || status || "Activo";
}

function estadoItemLabel(status) {
  const labels = {
    pendiente: "Pendiente", en_panol: "Enviado a pañol", pedido: "Pedido",
    parcial: "Parcial", recibido: "Recibido", cancelado: "Cancelado",
  };
  return labels[status] || status || "Actualizado";
}

function nombreDe(perfil) {
  const nombre = String(perfil?.username || "").trim();
  return nombre || null;
}

/**
 * Último movimiento del pedido que NO hizo el usuario.
 * Comentario, estado del pedido y renglón compiten por fecha.
 */
function ultimoMovimiento(compra, yo) {
  const candidatos = [];

  if (compra.last_comment_at && !esAccionPropia(compra.last_comment_author_id, { id: yo })) {
    candidatos.push({
      kind: "comment",
      fecha: compra.last_comment_at,
      actor: nombreDe(compra.autor_comentario),
      titulo: "Nuevo mensaje",
      gravedad: "info",
      sufijo: "",
      requiereAccion: true,
    });
  }

  // status_changed_by null / ausente = sistema o autor desconocido → avisa.
  if (compra.status && compra.status !== "nuevo" && !esAccionPropia(compra.status_changed_by, { id: yo })) {
    candidatos.push({
      kind: "status",
      fecha: compra.status_changed_at || compra.updated_at || compra.created_at,
      actor: nombreDe(compra.autor_estado),
      titulo: "Estado actualizado",
      gravedad: gravedadCompra(compra),
      sufijo: `Nuevo estado: ${estadoCompraLabel(compra.status)}`,
      requiereAccion: compra.status === "en_revision" || compra.priority === "urgente",
    });
  }

  const item = [...(compra.items || [])]
    .filter((row) => row.status && row.status !== "pendiente" && !esAccionPropia(row.status_changed_by, { id: yo }))
    .sort((a, b) => new Date(b.status_changed_at || b.updated_at || b.created_at || 0)
                  - new Date(a.status_changed_at || a.updated_at || a.created_at || 0))[0];

  if (item) {
    candidatos.push({
      kind: "item",
      fecha: item.status_changed_at || item.updated_at || item.created_at,
      actor: null,
      titulo: "Renglón actualizado",
      gravedad: gravedadItem(item.status),
      sufijo: `${item.description || "Renglón"}: ${estadoItemLabel(item.status)}`,
      requiereAccion: item.status === "pedido" || item.status === "parcial",
    });
  }

  // Pedido nuevo en cola de Compras sin movimiento posterior: es trabajo a tomar.
  if (candidatos.length === 0 && compra.status === "nuevo" && compra.created_by !== yo) {
    candidatos.push({
      kind: "new",
      fecha: compra.created_at || compra.updated_at,
      actor: null,
      titulo: "Pedido nuevo",
      gravedad: gravedadCompra(compra),
      sufijo: compra.priority === "urgente" ? "Urgente y pendiente de tomar" : "Pendiente de tomar",
      requiereAccion: true,
    });
  }

  return candidatos.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))[0] || null;
}

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
  // Canales con nombre propio por instancia: ver el comentario en useAlertas.
  const instancia = useId().replace(/[^a-zA-Z0-9]/g, "");
  const role = operationalRole(profile);
  const enabled = !!profile && role !== "cliente";
  const yo = userIdOf(profile);

  const [envios, setEnvios] = useState([]);
  const [compras, setCompras] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const [logistica, setLogistica] = useState([]);
  const [loadingRecepcion, setLoadingRecepcion] = useState(false);
  const [loadingCompras, setLoadingCompras] = useState(false);
  const [loadingAvisos, setLoadingAvisos] = useState(false);
  const [loadingLogistica, setLoadingLogistica] = useState(false);
  const [vistas, setVistas] = useState(() => readVistas(profile));
  const [ready, setReady] = useState(false);
  const [freshEvents, setFreshEvents] = useState([]);
  const [initialLoadedKey, setInitialLoadedKey] = useState("");
  const knownKeysRef = useRef(new Map()); // clave → fecha ISO vista en bootstrap/refresh
  const bootstrappedRef = useRef(false);
  const readyAtRef = useRef(0);

  const loadKey = enabled
    ? `${profile?.id || profile?.username || "anon"}:${role}:${profile?.sede || ""}`
    : "";

  const verRecepcion = enabled && puedeVerRecepcion(profile);
  const verProduccion = enabled && puedeVerProduccion(profile);
  const verCompras = enabled && puedeVerCompras(profile);
  const verLogistica = enabled && puedeVerLogistica(profile);
  const colaCompras = isComprasOperativo(profile);

  const {
    alertas,
    loading: loadingAlertas,
    resolverAlerta,
    recargar: recargarAlertas,
  } = useAlertas(null, { enabled: verProduccion, summaryOnly: true });

  useEffect(() => {
    setVistas(readVistas(profile));
    knownKeysRef.current = new Map();
    bootstrappedRef.current = false;
    readyAtRef.current = 0;
    setReady(false);
    setFreshEvents([]);
    setInitialLoadedKey("");
  }, [profile]);

  const cargarRecepcion = useCallback(async () => {
    if (!verRecepcion) {
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

      const sede = sedeOperativa(profile);
      if (sede) query = query.eq("sede", sede);

      const { data, error } = await query.limit(25);
      if (error) throw error;
      setEnvios((data ?? []).filter((row) => audienciaRecepcion(row, profile).ok));
    } catch {
      setEnvios([]);
    } finally {
      setLoadingRecepcion(false);
    }
  }, [profile, verRecepcion]);

  const cargarCompras = useCallback(async () => {
    if (!verCompras) {
      setCompras([]);
      return;
    }
    setLoadingCompras(true);
    try {
      const pedir = ({ select, states, limit, applyFilter, updatedSince = null }) => {
        let q = supabase
          .from("purchase_requests")
          .select(select)
          .in("status", states)
          .order("updated_at", { ascending: false })
          .limit(limit);
        if (updatedSince) q = q.gte("updated_at", updatedSince);
        if (applyFilter) q = applyFilter(q);
        return q;
      };

      let applyFilter = null;
      if (!colaCompras && yo) {
        // Acotar en servidor: creador, asignado o seguido. Admin sin rol compras
        // también entra por acá; la escalación urgente se valida en cliente.
        const { data: follows } = await supabase
          .from("request_followers")
          .select("request_id")
          .eq("user_id", yo);
        const followIds = (follows || []).map((f) => f.request_id).filter(Boolean);
        applyFilter = (q) => {
          const parts = [`created_by.eq.${yo}`, `assigned_to.eq.${yo}`];
          if (followIds.length) parts.push(`id.in.(${followIds.join(",")})`);
          // Admin: también urgentes sin asignar (escalación).
          if (profile?.is_admin || role === "admin") {
            parts.push("and(priority.eq.urgente,assigned_to.is.null)");
          }
          return q.or(parts.join(","));
        };
      }

      const terminalSince = new Date(Date.now() - COMPRA_TERMINAL_LOOKBACK_MS).toISOString();
      const consultar = async (select) => Promise.all([
        pedir({
          select,
          states: COMPRA_ACTION_STATES,
          limit: colaCompras ? 40 : 30,
          applyFilter,
        }),
        pedir({
          select,
          states: COMPRA_TERMINAL_STATES,
          limit: colaCompras ? 20 : 15,
          applyFilter,
          updatedSince: terminalSince,
        }),
      ]);

      let resultados = await consultar(SELECT_COMPRAS_CON_AUTOR);
      let error = resultados.find((result) => result.error)?.error || null;
      if (error && faltaLaColumnaDeAutor(error)) {
        resultados = await consultar(SELECT_COMPRAS_SIN_AUTOR);
        error = resultados.find((result) => result.error)?.error || null;
      }
      if (error) throw error;

      const unicas = new Map();
      for (const result of resultados) {
        for (const row of result.data ?? []) unicas.set(row.id, row);
      }
      setCompras([...unicas.values()].filter((row) => audienciaCompra(row, profile).ok));
    } catch {
      setCompras([]);
    } finally {
      setLoadingCompras(false);
    }
  }, [colaCompras, profile, role, verCompras, yo]);

  const cargarAvisos = useCallback(async () => {
    // Sólo Compras (cola) o Admin (escalación urgente). Técnica/pañol no.
    if (!verCompras || (!colaCompras && !(profile?.is_admin || role === "admin"))) {
      setAvisos([]);
      return;
    }
    setLoadingAvisos(true);
    try {
      let query = supabase
        .from("compras_avisos")
        .select(`
          id, titulo, detalle, material, destino, prioridad, estado,
          created_by, created_at, updated_at,
          project:produccion_obras!compras_avisos_project_id_fkey(id,codigo)
        `)
        .in("estado", AVISO_ACTIVE_STATES)
        .order("updated_at", { ascending: false })
        .limit(40);

      if (!colaCompras) {
        query = query.eq("prioridad", "urgente");
      }

      const { data, error } = await query;
      if (error) throw error;
      setAvisos((data ?? []).filter((row) => audienciaAviso(row, profile).ok));
    } catch {
      setAvisos([]);
    } finally {
      setLoadingAvisos(false);
    }
  }, [colaCompras, profile, role, verCompras]);

  const cargarLogistica = useCallback(async () => {
    if (!verLogistica) {
      setLogistica([]);
      return;
    }
    setLoadingLogistica(true);
    try {
      let query = supabase
        .from("calendario_eventos")
        .select("id,carga,titulo,obra,estado,fecha,fecha_solicitada,fecha_propuesta,fecha_confirmada,hora_propuesta,hora_confirmada,tipo_transporte,proveedor_logistico,created_by,updated_at,created_at")
        .eq("clase", "solicitud_logistica")
        .order("updated_at", { ascending: false })
        .limit(30);

      if (colaCompras) {
        query = query.in("estado", ["solicitado", "fecha_aceptada"]);
      } else if (yo) {
        if (profile?.is_admin || role === "admin") {
          query = query.or(
            `and(created_by.eq.${yo},estado.in.(fecha_propuesta,confirmado)),and(created_by.is.null,estado.eq.solicitado)`,
          );
        } else {
          query = query.eq("created_by", yo).in("estado", ["fecha_propuesta", "confirmado"]);
        }
      } else {
        setLogistica([]);
        setLoadingLogistica(false);
        return;
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogistica((data || []).filter((row) => audienciaLogistica(row, profile).ok));
    } catch {
      setLogistica([]);
    } finally {
      setLoadingLogistica(false);
    }
  }, [colaCompras, profile, role, verLogistica, yo]);

  useEffect(() => {
    let active = true;
    const refreshAll = () => Promise.allSettled([
      cargarRecepcion(),
      cargarCompras(),
      cargarAvisos(),
      cargarLogistica(),
    ]);
    void refreshAll().then(() => {
      if (active) setInitialLoadedKey(loadKey);
    });

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
    if (verRecepcion) {
      channels.push(
        supabase
          .channel(`rt-notif-panol-envios-${yo || "anon"}-${instancia}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "panol_envios" }, () => schedule(cargarRecepcion))
          .subscribe(),
      );
    }
    if (verCompras) {
      const channel = supabase.channel(`rt-notif-compras-${yo || "anon"}-${instancia}`);
      channel.on("postgres_changes", { event: "*", schema: "public", table: "purchase_requests" }, () => schedule(cargarCompras));
      channel.on("postgres_changes", { event: "*", schema: "public", table: "request_followers" }, () => schedule(cargarCompras));
      if (colaCompras || profile?.is_admin || role === "admin") {
        channel.on("postgres_changes", { event: "*", schema: "public", table: "compras_avisos" }, () => schedule(cargarAvisos));
      }
      channels.push(channel.subscribe());
    }
    if (verLogistica) {
      channels.push(
        supabase
          .channel(`rt-notif-logistica-${yo || "anon"}-${instancia}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "calendario_eventos" }, () => schedule(cargarLogistica))
          .subscribe(),
      );
    }

    return () => {
      active = false;
      refreshTimers.forEach((timer) => window.clearTimeout(timer));
      refreshTimers.clear();
      window.clearInterval(safetyInterval);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("online", handleOnline);
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [
    cargarAvisos, cargarCompras, cargarLogistica, cargarRecepcion,
    colaCompras, instancia, loadKey, profile?.is_admin, role, verCompras, verLogistica, verRecepcion, yo,
  ]);

  const loading = loadingRecepcion || loadingCompras || loadingAvisos || loadingLogistica
    || (verProduccion && loadingAlertas);

  const notificaciones = useMemo(() => {
    if (!enabled) return [];
    const out = [];

    if (verRecepcion) {
      for (const envio of envios) {
        if (!audienciaRecepcion(envio, profile).ok) continue;
        const titulo = envio.titulo || "Envío a recepción";
        const destino = envio.destino || envio.origen || "";
        const sede = envio.sede ? ` · ${envio.sede}` : "";
        out.push({
          clave: `recepcion:${envio.id}`,
          tipo: "recepcion",
          gravedad: gravedadRecepcion(envio),
          titulo: "Recepción pendiente",
          detalle: `${titulo}${destino ? ` — ${destino}` : ""}${sede}`,
          actor: null,
          fecha: fmtDateValue(envio),
          ruta: "/recepcion-panol?tab=recepcion",
          requiereAccion: true,
          why: "sede-panol",
          meta: { envio },
        });
      }
    }

    if (verProduccion) {
      for (const alerta of alertas) {
        if (!audienciaProduccion(alerta, profile).ok) continue;
        out.push({
          clave: `produccion:${alerta.id}`,
          tipo: "produccion",
          gravedad: alerta.gravedad || "info",
          titulo: "Alerta de producción",
          detalle: alerta.mensaje || "Alerta activa",
          actor: null,
          fecha: alerta.created_at,
          ruta: "/obras",
          requiereAccion: alerta.gravedad === "critical" || alerta.gravedad === "warning",
          why: audienciaProduccion(alerta, profile).why,
          meta: { alerta },
        });
      }
    }

    if (verCompras) {
      for (const compra of compras) {
        if (!audienciaCompra(compra, profile).ok) continue;
        const movimiento = ultimoMovimiento(compra, yo);
        if (!movimiento) continue;
        const obra = compra.project?.codigo ? ` · Obra ${compra.project.codigo}` : "";
        const movimientoDetalle = movimiento.kind === "comment" && movimiento.actor
          ? `${movimiento.titulo} de ${movimiento.actor}`
          : movimiento.titulo;
        const cambio = movimiento.sufijo ? ` · ${movimiento.sufijo}` : "";
        out.push({
          clave: `compra:${compra.id}`,
          tipo: "compras",
          gravedad: movimiento.gravedad,
          titulo: compra.title || "Pedido de compra",
          detalle: `${movimientoDetalle}${cambio}${obra}`,
          actor: movimiento.actor,
          fecha: movimiento.fecha,
          ruta: `/compras?open=${compra.id}`,
          requiereAccion: !!movimiento.requiereAccion,
          why: audienciaCompra(compra, profile).why,
          meta: { compra, movimiento },
        });
      }

      for (const aviso of avisos) {
        if (!audienciaAviso(aviso, profile).ok) continue;
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
          requiereAccion: true,
          why: audienciaAviso(aviso, profile).why,
          meta: { aviso },
        });
      }
    }

    if (verLogistica) {
      for (const movement of logistica) {
        if (!audienciaLogistica(movement, profile).ok) continue;
        const manager = colaCompras;
        const proposed = movement.estado === "fecha_propuesta";
        const accepted = movement.estado === "fecha_aceptada";
        out.push({
          clave: `logistica:${movement.id}`,
          tipo: "logistica",
          gravedad: gravedadLogistica(movement, { comoManager: manager }),
          titulo: manager
            ? (accepted ? "Técnica aceptó la fecha" : "Nueva solicitud logística")
            : (proposed ? "Compras propuso otra fecha" : "Movimiento confirmado"),
          detalle: `${movement.carga || movement.titulo || "Movimiento"}${movement.obra ? ` · ${movement.obra}` : ""}`,
          actor: null,
          fecha: movement.updated_at || movement.created_at,
          ruta: `/calendario?open=${movement.id}`,
          requiereAccion: movement.estado !== "confirmado",
          why: audienciaLogistica(movement, profile).why,
          meta: { movement },
        });
      }
    }

    return out
      .map((item) => ({ ...item, id: `${item.clave}@${item.fecha || ""}` }))
      .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }, [
    alertas, avisos, colaCompras, compras, enabled, envios, logistica,
    profile, verCompras, verLogistica, verProduccion, verRecepcion, yo,
  ]);

  const marcarVista = useCallback((items) => {
    const lote = (Array.isArray(items) ? items : [items]).filter((item) => item?.clave);
    if (!lote.length) return;
    setVistas((prev) => {
      const next = { ...prev };
      for (const item of lote) {
        const previa = next[item.clave];
        if (!previa || new Date(item.fecha || 0) > new Date(previa)) {
          next[item.clave] = item.fecha || new Date().toISOString();
        }
      }
      writeVistas(profile, next);
      return next;
    });
  }, [profile]);

  const listaCompleta = useMemo(() => notificaciones
    .map((notif) => {
      const vistaHasta = vistas[notif.clave];
      const leida = !!vistaHasta && new Date(notif.fecha || 0) <= new Date(vistaHasta);
      return { ...notif, leida };
    }),
  [notificaciones, vistas]);

  const lista = useMemo(() => listaCompleta.slice(0, MAX_EN_PANEL), [listaCompleta]);

  const unreadCount = useMemo(() => lista.filter((notif) => !notif.leida).length, [lista]);

  // Bootstrap: la primera carga completa NO dispara toasts históricos.
  useEffect(() => {
    if (!enabled) return;
    if (initialLoadedKey !== loadKey) return;
    if (loading && !bootstrappedRef.current) return;

    const snapshot = new Map(listaCompleta.map((n) => [n.clave, n.fecha || ""]));

    if (!bootstrappedRef.current) {
      knownKeysRef.current = snapshot;
      bootstrappedRef.current = true;
      readyAtRef.current = Date.now();
      setReady(true);
      return;
    }

    const nuevas = listaCompleta.filter((n) => {
      if (n.leida) return false;
      const prev = knownKeysRef.current.get(n.clave);
      if (prev == null) {
        return new Date(n.fecha || 0).getTime() > readyAtRef.current;
      }
      return new Date(n.fecha || 0) > new Date(prev || 0);
    });
    if (nuevas.length) setFreshEvents(nuevas);
    knownKeysRef.current = snapshot;
  }, [enabled, initialLoadedKey, listaCompleta, loadKey, loading]);

  const consumeFreshEvents = useCallback(() => {
    setFreshEvents([]);
  }, []);

  const markTodoLeido = useCallback(() => {
    marcarVista(notificaciones);
  }, [marcarVista, notificaciones]);

  return {
    loading,
    ready,
    lista,
    unreadCount,
    freshEvents,
    consumeFreshEvents,
    markLeido: marcarVista,
    markTodoLeido,
    resolverAlerta,
    recargar: () => {
      cargarRecepcion();
      cargarCompras();
      cargarAvisos();
      cargarLogistica();
      if (verProduccion) recargarAlertas?.();
    },
  };
}
