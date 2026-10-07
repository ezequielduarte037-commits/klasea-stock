import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import {
  audienciaAviso,
  audienciaCompra,
  audienciaProduccion,
  audienciaRecepcion,
  esAccionPropia,
  gravedadAviso,
  gravedadCompra,
  gravedadItem,
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
import { cargarAvisosLogistica, notificacionLogistica } from "@/lib/notificacionesLogistica";
import { compararFechasNotificacion, lecturaDesdePush, lecturasParaSincronizar, mergeLecturas, normalizarLecturas, notificacionLeida } from "@/lib/notificacionesLecturas";
import { updatePushBadge } from "@/lib/pushNotifications";

/**
 * La campanita.
 *
 * La lista se deriva de la actividad operativa; las lecturas se sincronizan
 * por usuario y versión entre escritorio y celular.
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

const EMPTY_SOURCES = { envios: [], compras: [], avisos: [], logistica: [], alertas: [] };
const SOURCE_LABELS = {
  envios: "Recepción", compras: "Compras", avisos: "Avisos a compras", logistica: "Logística",
  alertas: "Producción", lecturas: "Lecturas",
};

function storageKey(profile) {
  return `klasea.notificaciones.vistas.${profile?.id || profile?.username || "anon"}`;
}

function readVistas(profile) {
  if (typeof window === "undefined" || !profile) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(profile));
    const obj = raw ? JSON.parse(raw) : {};
    return normalizarLecturas(obj);
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

// Los mismos títulos que manda el push (notificaciones_compras_encolar).
function tituloEstadoPedido(status) {
  const labels = {
    nuevo: "Pedido vuelto a la cola", en_revision: "Pedido en revisión", cotizando: "Pedido en cotización",
    comprado: "Pedido comprado", recibido: "Pedido recibido", cancelado: "Pedido cancelado",
  };
  return labels[status] || "Pedido actualizado";
}

function tituloEstadoMaterial(status) {
  const labels = {
    en_panol: "Material enviado a pañol", pedido: "Material pedido", parcial: "Material recibido en parte",
    recibido: "Material recibido", cancelado: "Material cancelado",
  };
  return labels[status] || "Material actualizado";
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
      titulo: tituloEstadoPedido(compra.status),
      gravedad: gravedadCompra(compra),
      sufijo: nombreDe(compra.autor_estado) ? `por ${nombreDe(compra.autor_estado)}` : "",
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
      titulo: tituloEstadoMaterial(item.status),
      gravedad: gravedadItem(item.status),
      sufijo: item.description || "",
      requiereAccion: item.status === "pedido" || item.status === "parcial",
    });
  }

  // Pedido nuevo en cola de Compras sin movimiento posterior: es trabajo a tomar.
  if (candidatos.length === 0 && compra.status === "nuevo" && compra.created_by !== yo) {
    candidatos.push({
      kind: "new",
      fecha: compra.created_at || compra.updated_at,
      actor: null,
      titulo: compra.priority === "urgente" ? "Nuevo pedido urgente" : "Nuevo pedido de compra",
      gravedad: gravedadCompra(compra),
      sufijo: "Falta tomarlo",
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
  const instancia = useId().replace(/[^a-zA-Z0-9]/g, "");
  const role = operationalRole(profile);
  const yo = userIdOf(profile);
  const enabled = !!yo && role !== "cliente" && profile?.activo !== false;
  // Cambiar un campo irrelevante del perfil no reinicia la lista ni el bootstrap.
  const recipient = useMemo(() => ({
    id: yo, role, sede: profile?.sede, is_admin: !!profile?.is_admin, is_demo: !!profile?.is_demo,
  }), [yo, role, profile?.sede, profile?.is_admin, profile?.is_demo]);
  const syncLecturas = enabled && !recipient.is_demo;
  const loadKey = enabled ? `${yo}:${role}:${recipient.sede || ""}:${recipient.is_admin}:${recipient.is_demo}` : "";
  const verRecepcion = enabled && puedeVerRecepcion(recipient);
  const verProduccion = enabled && puedeVerProduccion(recipient);
  const verCompras = enabled && puedeVerCompras(recipient);
  const verLogistica = enabled && puedeVerLogistica(recipient);
  const colaCompras = isComprasOperativo(recipient);

  const [sourceState, setSourceState] = useState(() => ({ key: loadKey, ...EMPTY_SOURCES }));
  const [statusState, setStatusState] = useState(() => ({ key: loadKey, sources: {} }));
  const [vistasState, setVistasState] = useState(() => ({ userId: yo, map: readVistas(recipient) }));
  const [initialLoadedKey, setInitialLoadedKey] = useState(null);
  const [readyKey, setReadyKey] = useState(null);
  const [freshState, setFreshState] = useState(() => ({ key: loadKey, events: [] }));
  const contextRef = useRef(loadKey);
  const contextRevisionRef = useRef(0);
  const nextRequestRef = useRef(0);
  const requestIdsRef = useRef({});
  const lecturasRef = useRef({ userId: yo, map: readVistas(recipient) });
  const remotoRef = useRef({ userId: yo, map: {} });
  const knownKeysRef = useRef(new Map());
  const bootstrappedRef = useRef(false);
  const readyAtRef = useRef(0);

  useEffect(() => {
    contextRef.current = loadKey;
    contextRevisionRef.current += 1;
    requestIdsRef.current = {};
    lecturasRef.current = { userId: yo, map: readVistas(recipient) };
    setVistasState({ userId: yo, map: lecturasRef.current.map });
    remotoRef.current = { userId: yo, map: {} };
    knownKeysRef.current = new Map();
    bootstrappedRef.current = false;
    readyAtRef.current = 0;
  }, [loadKey, recipient, yo]);

  const setSourceStatus = useCallback((source, patch) => {
    setStatusState((prev) => {
      const sources = prev.key === loadKey ? prev.sources : {};
      return { key: loadKey, sources: { ...sources, [source]: { ...sources[source], ...patch } } };
    });
  }, [loadKey]);

  const loadSource = useCallback(async (source, allowed, work) => {
    if (contextRef.current !== loadKey) return false;
    const request = ++nextRequestRef.current;
    requestIdsRef.current[source] = request;
    const isCurrent = () => contextRef.current === loadKey && requestIdsRef.current[source] === request;
    setSourceStatus(source, { loading: allowed, error: null });
    try {
      const data = allowed ? await work(isCurrent) : [];
      if (!isCurrent()) return false;
      setSourceState((prev) => ({
        ...(prev.key === loadKey ? prev : EMPTY_SOURCES), key: loadKey, [source]: data || [],
      }));
      setSourceStatus(source, { error: null });
      return true;
    } catch (error) {
      // Un error conserva la última carga válida del mismo usuario y se muestra.
      if (isCurrent()) setSourceStatus(source, { error });
      return false;
    } finally {
      if (isCurrent()) setSourceStatus(source, { loading: false });
    }
  }, [loadKey, setSourceStatus]);

  const cargarRecepcion = useCallback(() => loadSource("envios", verRecepcion, async () => {
    let query = supabase.from("panol_envios")
      .select("id,titulo,sede,destino,origen,estado,prioridad,created_by,created_at,updated_at")
      .not("estado", "in", `("${CLOSED_ENVIO_STATES.join('","')}")`)
      .order("created_at", { ascending: false });
    const sede = sedeOperativa(recipient);
    if (sede) query = query.eq("sede", sede);
    const { data, error } = await query.limit(50);
    if (error) throw error;
    return (data ?? []).filter((row) => audienciaRecepcion(row, recipient).ok);
  }), [loadSource, recipient, verRecepcion]);

  const cargarCompras = useCallback(() => loadSource("compras", verCompras, async () => {
    const pedir = ({ select, states, limit, applyFilter, updatedSince = null }) => {
      let query = supabase.from("purchase_requests").select(select).in("status", states)
        .order("updated_at", { ascending: false }).limit(limit);
      if (updatedSince) query = query.gte("updated_at", updatedSince);
      if (applyFilter) query = applyFilter(query);
      return query;
    };
    let applyFilter = null;
    if (!colaCompras) {
      const { data: follows, error: followsError } = await supabase.from("request_followers")
        .select("request_id").eq("user_id", yo);
      if (followsError) throw followsError;
      const followIds = (follows || []).map((f) => f.request_id).filter(Boolean);
      applyFilter = (query) => {
        const parts = [`created_by.eq.${yo}`, `assigned_to.eq.${yo}`];
        if (followIds.length) parts.push(`id.in.(${followIds.join(",")})`);
        if (recipient.is_admin || role === "admin") parts.push("and(priority.eq.urgente,assigned_to.is.null)");
        return query.or(parts.join(","));
      };
    }
    const updatedSince = new Date(Date.now() - COMPRA_TERMINAL_LOOKBACK_MS).toISOString();
    const consultar = (select) => Promise.all([
      pedir({ select, states: COMPRA_ACTION_STATES, limit: colaCompras ? 80 : 50, applyFilter }),
      pedir({ select, states: COMPRA_TERMINAL_STATES, limit: 40, applyFilter, updatedSince }),
    ]);
    let resultados = await consultar(SELECT_COMPRAS_CON_AUTOR);
    let error = resultados.find((result) => result.error)?.error;
    if (error && faltaLaColumnaDeAutor(error)) {
      resultados = await consultar(SELECT_COMPRAS_SIN_AUTOR);
      error = resultados.find((result) => result.error)?.error;
    }
    if (error) throw error;
    const unicas = new Map(resultados.flatMap(({ data }) => data || []).map((row) => [row.id, row]));
    return [...unicas.values()].filter((row) => audienciaCompra(row, recipient).ok);
  }), [colaCompras, loadSource, recipient, role, verCompras, yo]);

  const cargarAvisos = useCallback(() => loadSource("avisos",
    verCompras && (colaCompras || recipient.is_admin || role === "admin"), async () => {
      let query = supabase.from("compras_avisos").select(`
        id,titulo,detalle,material,destino,prioridad,estado,created_by,created_at,updated_at,
        project:produccion_obras!compras_avisos_project_id_fkey(id,codigo)
      `).in("estado", AVISO_ACTIVE_STATES).order("updated_at", { ascending: false }).limit(60);
      if (!colaCompras) query = query.eq("prioridad", "urgente");
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).filter((row) => audienciaAviso(row, recipient).ok);
    }), [colaCompras, loadSource, recipient, role, verCompras]);

  const cargarLogistica = useCallback(() => loadSource("logistica", verLogistica,
    () => cargarAvisosLogistica(supabase, recipient)), [loadSource, recipient, verLogistica]);

  const cargarAlertas = useCallback(() => loadSource("alertas", verProduccion, async () => {
    const { data, error } = await supabase.from("alertas")
      .select("id,obra_id,tipo,gravedad,mensaje,created_at")
      .eq("resuelta", false).order("created_at", { ascending: false }).limit(80);
    if (error) throw error;
    return (data || []).filter((row) => audienciaProduccion(row, recipient).ok);
  }), [loadSource, recipient, verProduccion]);

  const sincronizarLecturas = useCallback(async (lote, isCurrent) => {
    if (!syncLecturas) return;
    for (let start = 0; start < lote.length; start += 500) {
      if (!isCurrent()) return;
      const batch = lote.slice(start, start + 500);
      const { error } = await supabase.rpc("notificaciones_marcar_leidas", { p_lecturas: batch });
      if (error) throw error;
      if (!isCurrent()) return;
      remotoRef.current = { userId: yo, map: mergeLecturas(remotoRef.current.map, batch) };
    }
  }, [syncLecturas, yo]);

  const cargarLecturas = useCallback(() => loadSource("lecturas", syncLecturas, async (isCurrent) => {
    const cache = mergeLecturas(lecturasRef.current.map, readVistas(recipient));
    setVistasState({ userId: yo, map: cache });
    const { data, error } = await supabase.from("notificaciones_lecturas")
      .select("clave,leida_hasta").eq("user_id", yo).order("updated_at", { ascending: false }).limit(1000);
    if (error) throw error;
    if (!isCurrent()) return [];
    const remoto = normalizarLecturas(data);
    // Leer en escritorio durante esta consulta no pierde la lectura recién hecha.
    const local = mergeLecturas(lecturasRef.current.map, readVistas(recipient));
    const next = mergeLecturas(local, remoto);
    remotoRef.current = { userId: yo, map: mergeLecturas(remotoRef.current.map, remoto) };
    lecturasRef.current = { userId: yo, map: next };
    setVistasState({ userId: yo, map: next });
    writeVistas(recipient, next);
    await sincronizarLecturas(lecturasParaSincronizar(local, remotoRef.current.map), isCurrent);
    return [];
  }), [loadSource, recipient, sincronizarLecturas, syncLecturas, yo]);

  const recargar = useCallback(() => Promise.allSettled([
    cargarRecepcion(), cargarCompras(), cargarAvisos(), cargarLogistica(), cargarAlertas(), cargarLecturas(),
  ]), [cargarAlertas, cargarAvisos, cargarCompras, cargarLecturas, cargarLogistica, cargarRecepcion]);

  useEffect(() => {
    let active = true;
    void recargar().then(() => { if (active) setInitialLoadedKey(loadKey); });
    if (!enabled) return () => { active = false; };

    const refreshTimers = new Map();
    const schedule = (fn) => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(refreshTimers.get(fn));
      refreshTimers.set(fn, window.setTimeout(() => {
        refreshTimers.delete(fn);
        if (active) void fn();
      }, 500));
    };
    const handleVisible = () => { if (document.visibilityState === "visible") schedule(recargar); };
    const handleOnline = () => schedule(recargar);
    const handleStorage = (event) => {
      if (event.key !== storageKey(recipient)) return;
      const next = mergeLecturas(lecturasRef.current.map, readVistas(recipient));
      lecturasRef.current = { userId: yo, map: next };
      setVistasState({ userId: yo, map: next });
      schedule(cargarLecturas);
    };
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleVisible);
    window.addEventListener("storage", handleStorage);
    const safetyInterval = window.setInterval(() => schedule(recargar), 15 * 60 * 1000);
    const logisticaInterval = verLogistica ? window.setInterval(() => schedule(cargarLogistica), 60 * 1000) : null;
    const channels = [];
    if (verRecepcion) channels.push(supabase.channel(`rt-notif-panol-envios-${yo}-${instancia}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "panol_envios" }, () => schedule(cargarRecepcion)).subscribe());
    if (verCompras) {
      const channel = supabase.channel(`rt-notif-compras-${yo}-${instancia}`);
      for (const table of ["purchase_requests", "purchase_request_items", "request_comments", "request_followers"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, () => schedule(cargarCompras));
      }
      if (colaCompras || recipient.is_admin || role === "admin") {
        channel.on("postgres_changes", { event: "*", schema: "public", table: "compras_avisos" }, () => schedule(cargarAvisos));
      }
      channels.push(channel.subscribe());
    }
    if (verLogistica) channels.push(supabase.channel(`rt-notif-logistica-${yo}-${instancia}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calendario_eventos" }, () => schedule(cargarLogistica)).subscribe());
    if (verProduccion) channels.push(supabase.channel(`rt-notif-alertas-${yo}-${instancia}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "alertas" }, () => schedule(cargarAlertas)).subscribe());
    if (syncLecturas) channels.push(supabase.channel(`rt-notif-lecturas-${yo}-${instancia}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notificaciones_lecturas", filter: `user_id=eq.${yo}` }, () => schedule(cargarLecturas)).subscribe());
    return () => {
      active = false;
      refreshTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(safetyInterval);
      if (logisticaInterval) window.clearInterval(logisticaInterval);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleVisible);
      window.removeEventListener("storage", handleStorage);
      channels.forEach((channel) => supabase.removeChannel(channel));
      // Una respuesta pendiente del usuario anterior ya no puede escribir estado.
      if (contextRef.current === loadKey) requestIdsRef.current = {};
    };
  }, [
    cargarAlertas, cargarAvisos, cargarCompras, cargarLecturas, cargarLogistica, cargarRecepcion,
    colaCompras, enabled, instancia, loadKey, recargar, recipient, role, syncLecturas, verCompras, verLogistica,
    verProduccion, verRecepcion, yo,
  ]);

  // La clave en cada estado evita mostrar datos de la cuenta anterior incluso
  // durante el render previo a ejecutar los efectos del nuevo usuario.
  const { envios, compras, avisos, logistica, alertas } = sourceState.key === loadKey ? sourceState : EMPTY_SOURCES;
  const statuses = statusState.key === loadKey ? statusState.sources : {};
  const loading = enabled && (initialLoadedKey !== loadKey || Object.values(statuses).some((item) => item.loading));
  const vistas = useMemo(() => vistasState.userId === yo ? vistasState.map : {}, [vistasState, yo]);

  const notificaciones = useMemo(() => {
    if (!enabled) return [];
    const out = [];
    if (verRecepcion) for (const envio of envios) {
      if (!audienciaRecepcion(envio, recipient).ok) continue;
      const destino = envio.destino || envio.origen || "";
      out.push({
        clave: `recepcion:${envio.id}`, tipo: "recepcion", gravedad: gravedadRecepcion(envio),
        titulo: "Recepción pendiente",
        detalle: `${envio.titulo || "Envío a recepción"}${destino ? ` — ${destino}` : ""}${envio.sede ? ` · ${envio.sede}` : ""}`,
        actor: null, fecha: fmtDateValue(envio), ruta: "/recepcion-panol?tab=recepcion", requiereAccion: true,
        why: "sede-panol", meta: { envio },
      });
    }
    if (verProduccion) for (const alerta of alertas) {
      const audience = audienciaProduccion(alerta, recipient);
      if (!audience.ok) continue;
      out.push({
        clave: `produccion:${alerta.id}`, tipo: "produccion", gravedad: alerta.gravedad || "info",
        titulo: "Alerta de producción", detalle: alerta.mensaje || "Alerta activa", actor: null,
        fecha: alerta.created_at, ruta: "/obras", requiereAccion: ["critical", "warning"].includes(alerta.gravedad),
        why: audience.why, meta: { alerta },
      });
    }
    if (verCompras) {
      for (const compra of compras) {
        const audience = audienciaCompra(compra, recipient);
        if (!audience.ok) continue;
        const movimiento = ultimoMovimiento(compra, yo);
        if (!movimiento) continue;
        // Sin repetir la obra cuando el título del pedido ya la nombra.
        const codigo = compra.project?.codigo;
        const obra = codigo && !String(compra.title || "").includes(codigo) ? ` · Obra ${codigo}` : "";
        const detalle = movimiento.kind === "comment" && movimiento.actor
          ? `${movimiento.titulo} de ${movimiento.actor}` : movimiento.titulo;
        out.push({
          clave: `compra:${compra.id}`, tipo: "compras", gravedad: movimiento.gravedad,
          titulo: compra.title || "Pedido de compra", detalle: `${detalle}${movimiento.sufijo ? ` · ${movimiento.sufijo}` : ""}${obra}`,
          actor: movimiento.actor, fecha: movimiento.fecha, ruta: `/compras?open=${encodeURIComponent(compra.id)}`,
          requiereAccion: !!movimiento.requiereAccion, why: audience.why, meta: { compra, movimiento },
        });
      }
      for (const aviso of avisos) {
        const audience = audienciaAviso(aviso, recipient);
        if (!audience.ok) continue;
        out.push({
          clave: `aviso:${aviso.id}`, tipo: "compras", gravedad: gravedadAviso(aviso), titulo: "Aviso a compras",
          detalle: `${aviso.titulo || "Aviso"}${aviso.material ? ` — ${aviso.material}` : ""}${aviso.project?.codigo ? ` · ${aviso.project.codigo}` : ""}`,
          actor: null, fecha: aviso.updated_at || aviso.created_at,
          ruta: `/compras?tab=avisos&aviso=${encodeURIComponent(aviso.id)}`, requiereAccion: true,
          why: audience.why, meta: { aviso },
        });
      }
    }
    if (verLogistica) for (const movement of logistica) {
      const notif = notificacionLogistica(movement, recipient);
      if (notif) out.push(notif);
    }
    return out.map((item) => ({ ...item, id: `${item.clave}@${item.fecha || ""}` }))
      .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }, [alertas, avisos, compras, enabled, envios, logistica, recipient, verCompras, verLogistica, verProduccion, verRecepcion, yo]);

  const marcarVista = useCallback((items) => {
    if (!enabled || contextRef.current !== loadKey) return Promise.resolve({ ok: false });
    const lote = (Array.isArray(items) ? items : [items]).filter((item) => item?.clave);
    if (!lote.length) return Promise.resolve({ ok: true });
    const marks = normalizarLecturas(lote.map((item) => ({ clave: item.clave, leida_hasta: item.fecha || new Date().toISOString() })));
    const next = mergeLecturas(lecturasRef.current.map, marks);
    lecturasRef.current = { userId: yo, map: next };
    setVistasState({ userId: yo, map: next });
    writeVistas(recipient, next);
    const revision = contextRevisionRef.current;
    const isCurrent = () => contextRef.current === loadKey && contextRevisionRef.current === revision;
    return sincronizarLecturas(lecturasParaSincronizar(marks, remotoRef.current.map), isCurrent)
      .then(() => {
        if (isCurrent()) setSourceStatus("lecturas", { error: null });
        return { ok: true };
      }).catch((error) => {
        if (isCurrent()) setSourceStatus("lecturas", { error });
        // La lectura local se conserva y recargar reintenta la sincronización.
        return { ok: false, error };
      });
  }, [enabled, loadKey, recipient, setSourceStatus, sincronizarLecturas, yo]);

  const lista = useMemo(() => notificaciones.map((notif) => ({ ...notif, leida: notificacionLeida(notif, vistas) })), [notificaciones, vistas]);
  const unreadCount = useMemo(() => lista.filter((notif) => !notif.leida).length, [lista]);

  useEffect(() => {
    if (!enabled) updatePushBadge(0);
    else if (initialLoadedKey === loadKey) updatePushBadge(unreadCount);
  }, [enabled, initialLoadedKey, loadKey, unreadCount]);

  useEffect(() => {
    if (!enabled) return;
    const url = new URL(window.location.href);
    const lectura = lecturaDesdePush(url, yo);
    if (!lectura) return;
    void marcarVista(lectura);
    // El detalle conserva su parámetro open; sólo se consumen las marcas push.
    for (const key of ["_push_clave", "_push_fecha", "_push_user"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [enabled, marcarVista, yo]);

  useEffect(() => {
    if (!enabled || initialLoadedKey !== loadKey || (loading && !bootstrappedRef.current)) return;
    const snapshot = new Map(lista.map((n) => [n.clave, n.fecha || ""]));
    if (!bootstrappedRef.current) {
      knownKeysRef.current = snapshot;
      bootstrappedRef.current = true;
      readyAtRef.current = Date.now();
      setReadyKey(loadKey);
      return;
    }
    const nuevas = lista.filter((n) => {
      if (n.leida) return false;
      const prev = knownKeysRef.current.get(n.clave);
      return prev == null ? new Date(n.fecha || 0).getTime() >= readyAtRef.current - 30_000
        : compararFechasNotificacion(n.fecha, prev) > 0;
    });
    if (nuevas.length) setFreshState((prev) => {
      const pending = prev.key === loadKey ? prev.events : [];
      return { key: loadKey, events: [...new Map([...pending, ...nuevas].map((item) => [item.id, item])).values()] };
    });
    knownKeysRef.current = snapshot;
  }, [enabled, initialLoadedKey, lista, loadKey, loading]);

  const consumeFreshEvents = useCallback(() => setFreshState({ key: loadKey, events: [] }), [loadKey]);
  const markTodoLeido = useCallback(() => marcarVista(notificaciones), [marcarVista, notificaciones]);
  const resolverAlerta = useCallback(async (alertaId, resueltaPor) => {
    if (!enabled || contextRef.current !== loadKey) throw new Error("Actualizá la sesión antes de resolver la alerta.");
    const { error } = await supabase.from("alertas").update({
      resuelta: true, resuelta_en: new Date().toISOString(), resuelta_por: resueltaPor || yo,
    }).eq("id", alertaId).select("id").single();
    if (error) throw error;
    await cargarAlertas();
  }, [cargarAlertas, enabled, loadKey, yo]);

  const errorSources = Object.entries(statuses).filter(([, state]) => !!state.error).map(([source]) => SOURCE_LABELS[source]);
  const errorLecturas = !!statuses.lecturas?.error;
  return {
    loading, ready: enabled && readyKey === loadKey,
    errorLogistica: verLogistica && !!statuses.logistica?.error,
    loadingLogistica: !!statuses.logistica?.loading, recargarLogistica: cargarLogistica,
    errorSources, errorLecturas,
    errorCarga: errorSources.length ? `No pudimos actualizar: ${errorSources.join(", ")}.` : "",
    lista, unreadCount, freshEvents: freshState.key === loadKey ? freshState.events : [],
    consumeFreshEvents, markLeido: marcarVista, markTodoLeido, resolverAlerta, recargar,
  };
}
