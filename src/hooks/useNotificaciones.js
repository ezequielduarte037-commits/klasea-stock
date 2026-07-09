import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import useAlertas from "@/hooks/useAlertas";

const CLOSED_ENVIO_STATES = ["recibido", "cerrado", "cancelado"];
const COMPRA_ACTION_STATES = ["nuevo", "en_revision", "cotizando", "comprado"];
const AVISO_ACTIVE_STATES = ["nuevo", "visto", "en_proceso"];
const POLL_MS = 4 * 60 * 1000;

const RECEPCION_ROLES = new Set(["panol", "admin"]);
const PRODUCCION_ROLES = new Set(["admin", "oficina"]);
const COMPRAS_ROLES = new Set(["compras", "admin", "tecnica", "oficina", "panol"]);

function storageKey(profile) {
  return `klasea.notificaciones.leidas.${profile?.id || profile?.username || "anon"}`;
}

function readLeidas(profile) {
  if (typeof window === "undefined" || !profile) return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(profile));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeLeidas(profile, set) {
  if (typeof window === "undefined" || !profile) return;
  try {
    window.localStorage.setItem(storageKey(profile), JSON.stringify([...set].slice(-500)));
  } catch {
    // LocalStorage puede fallar por cuota o modo privado; no bloquea la app.
  }
}

function roleOf(profile) {
  if (profile?.is_admin) return "admin";
  return profile?.role || "";
}

function canRecepcion(profile) {
  return RECEPCION_ROLES.has(roleOf(profile));
}

function canProduccion(profile) {
  return PRODUCCION_ROLES.has(roleOf(profile));
}

function canCompras(profile) {
  return COMPRAS_ROLES.has(roleOf(profile));
}

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
  const labels = {
    nuevo: "Nuevo",
    en_revision: "En revision",
    cotizando: "Cotizando",
    comprado: "Comprado",
  };
  return labels[status] || status || "Activo";
}

function estadoItemLabel(status) {
  const labels = {
    pendiente: "Pendiente",
    en_panol: "Enviado a panol",
    pedido: "Pedido",
    recibido: "Recibido",
    cancelado: "Cancelado",
  };
  return labels[status] || status || "Actualizado";
}

function gravedadCompra(row = {}) {
  if (row.status === "comprado" || row.status === "recibido") return "success";
  if (row.status === "en_revision" || row.status === "cotizando") return "warning";
  if (row.status === "cancelado") return "critical";
  if (row.priority === "urgente") return "critical";
  if (row.priority === "alta" || row.status === "nuevo") return "warning";
  return "info";
}

function gravedadItem(status) {
  if (status === "recibido") return "success";
  if (status === "cancelado") return "critical";
  if (status === "pedido") return "warning";
  return "info";
}

function gravedadAviso(row = {}) {
  if (row.prioridad === "urgente") return "critical";
  if (row.prioridad === "alta" || row.estado === "nuevo") return "warning";
  return "info";
}

function latestChangedItem(items = []) {
  return [...items]
    .filter((item) => item.status && item.status !== "pendiente")
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0] || null;
}

export default function useNotificaciones(profile) {
  const role = roleOf(profile);
  const enabled = !!profile && role !== "cliente";
  const [envios, setEnvios] = useState([]);
  const [compras, setCompras] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const [loadingRecepcion, setLoadingRecepcion] = useState(false);
  const [loadingCompras, setLoadingCompras] = useState(false);
  const [loadingAvisos, setLoadingAvisos] = useState(false);
  const [leidas, setLeidas] = useState(() => readLeidas(profile));
  const {
    alertas,
    loading: loadingAlertas,
    resolverAlerta,
    recargar: recargarAlertas,
  } = useAlertas();

  useEffect(() => {
    setLeidas(readLeidas(profile));
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
        .select("*")
        .not("estado", "in", `("${CLOSED_ENVIO_STATES.join('","')}")`)
        .order("created_at", { ascending: false });

      const sede = roleOf(profile) === "panol" ? sedeCuenta(profile) : "";
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
      const { data, error } = await supabase
        .from("purchase_requests")
        .select(`
          id,
          title,
          status,
          priority,
          created_at,
          updated_at,
          proveedor,
          created_by,
          last_comment_at,
          last_comment_author_id,
          project:produccion_obras!purchase_requests_project_id_fkey(id,codigo),
          followers:request_followers(user_id, notify_whatsapp),
          items:purchase_request_items(id, description, status, created_at, updated_at)
        `)
        .in("status", COMPRA_ACTION_STATES)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      const rows = data ?? [];
      setCompras(isComprasManager(profile)
        ? rows
        : rows.filter((row) => row.created_by === profile?.id || (row.followers || []).some((f) => f.user_id === profile?.id)));
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
          id,
          titulo,
          detalle,
          material,
          destino,
          prioridad,
          estado,
          created_by,
          created_at,
          updated_at,
          project:produccion_obras!compras_avisos_project_id_fkey(id,codigo)
        `)
        .in("estado", AVISO_ACTIVE_STATES)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      const rows = data ?? [];
      setAvisos(isComprasManager(profile)
        ? rows
        : rows.filter((row) => row.created_by === profile?.id));
    } catch {
      setAvisos([]);
    } finally {
      setLoadingAvisos(false);
    }
  }, [enabled, profile]);

  useEffect(() => {
    cargarRecepcion();
    cargarCompras();
    cargarAvisos();

    const interval = window.setInterval(() => {
      cargarRecepcion();
      cargarCompras();
      cargarAvisos();
    }, POLL_MS);

    const channels = [];
    if (enabled && canRecepcion(profile)) {
      channels.push(
        supabase
          .channel(`rt-notif-panol-envios-${profile?.id || "anon"}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "panol_envios" }, cargarRecepcion)
          .subscribe(),
      );
    }
    if (enabled && canCompras(profile)) {
      channels.push(
        supabase
          .channel(`rt-notif-compras-${profile?.id || "anon"}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "purchase_requests" }, cargarCompras)
          .on("postgres_changes", { event: "*", schema: "public", table: "request_followers" }, cargarCompras)
          .on("postgres_changes", { event: "*", schema: "public", table: "compras_avisos" }, cargarAvisos)
          .subscribe(),
      );
    }

    return () => {
      window.clearInterval(interval);
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [cargarAvisos, cargarCompras, cargarRecepcion, enabled, profile]);

  const notificaciones = useMemo(() => {
    if (!enabled) return [];
    const out = [];

    if (canRecepcion(profile)) {
      for (const envio of envios) {
        const titulo = envio.titulo || envio.codigo || envio.numero || "Envio a recepcion";
        const sede = envio.sede ? ` - ${envio.sede}` : "";
        const destino = envio.destino || envio.origen || envio.proveedor || "";
        out.push({
          id: `recepcion:${envio.id}:${fmtDateValue(envio)}`,
          tipo: "recepcion",
          gravedad: envio.estado === "parcial" ? "warning" : "info",
          titulo: "Recepcion pendiente",
          detalle: `${titulo}${destino ? ` - ${destino}` : ""}${sede}`,
          fecha: fmtDateValue(envio),
          ruta: "/recepcion-panol",
          meta: { envio },
        });
      }
    }

    if (canProduccion(profile)) {
      for (const alerta of alertas) {
        out.push({
          id: `produccion:${alerta.id}`,
          tipo: "produccion",
          gravedad: alerta.gravedad || "info",
          titulo: "Alerta de produccion",
          detalle: alerta.mensaje || "Alerta activa",
          fecha: alerta.created_at,
          ruta: "/obras",
          meta: { alerta },
        });
      }
    }

    if (canCompras(profile)) {
      for (const compra of compras) {
        const obra = compra.project?.codigo ? ` - ${compra.project.codigo}` : "";
        const hasCommentUpdate = compra.last_comment_author_id && compra.last_comment_author_id !== profile?.id;
        const latestItem = latestChangedItem(compra.items);

        if (hasCommentUpdate) {
          out.push({
            id: `compras-chat:${compra.id}:${compra.last_comment_at || compra.updated_at || compra.created_at || ""}:${compra.last_comment_author_id || ""}`,
            tipo: "compras",
            gravedad: "info",
            titulo: "Mensaje en pedido",
            detalle: `${compra.title || "Pedido de compra"}${obra}`,
            fecha: compra.last_comment_at || compra.updated_at || compra.created_at,
            ruta: `/compras?open=${compra.id}`,
            meta: { compra },
          });
        }

        if (latestItem) {
          out.push({
            id: `compras-item:${compra.id}:${latestItem.id}:${latestItem.updated_at || latestItem.created_at || ""}:${latestItem.status}`,
            tipo: "compras",
            gravedad: gravedadItem(latestItem.status),
            titulo: "Item actualizado",
            detalle: `${latestItem.description || "Item"} - ${estadoItemLabel(latestItem.status)}${obra}`,
            fecha: latestItem.updated_at || latestItem.created_at || compra.updated_at || compra.created_at,
            ruta: `/compras?open=${compra.id}`,
            meta: { compra, item: latestItem },
          });
        }

        if (compra.status !== "nuevo") {
          out.push({
            id: `compras-estado:${compra.id}:${compra.updated_at || compra.created_at || ""}:${compra.status}`,
            tipo: "compras",
            gravedad: gravedadCompra(compra),
            titulo: "Estado de pedido",
            detalle: `${compra.title || "Pedido de compra"} - ${estadoCompraLabel(compra.status)}${obra}`,
            fecha: compra.updated_at || compra.created_at,
            ruta: `/compras?open=${compra.id}`,
            meta: { compra },
          });
        }
      }

      for (const aviso of avisos) {
        const obra = aviso.project?.codigo ? ` - ${aviso.project.codigo}` : "";
        const material = aviso.material ? ` - ${aviso.material}` : "";
        out.push({
          id: `aviso:${aviso.id}:${aviso.updated_at || aviso.created_at || ""}`,
          tipo: "compras",
          gravedad: gravedadAviso(aviso),
          titulo: "Aviso a compras",
          detalle: `${aviso.titulo || "Aviso"}${material}${obra}`,
          fecha: aviso.updated_at || aviso.created_at,
          ruta: `/compras?tab=avisos&aviso=${aviso.id}`,
          meta: { aviso },
        });
      }
    }

    return out.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }, [alertas, avisos, compras, enabled, envios, profile]);

  const markLeido = useCallback((id) => {
    if (!id) return;
    setLeidas((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeLeidas(profile, next);
      return next;
    });
  }, [profile]);

  const markTodoLeido = useCallback(() => {
    setLeidas((prev) => {
      const next = new Set(prev);
      notificaciones.forEach((notif) => next.add(notif.id));
      writeLeidas(profile, next);
      return next;
    });
  }, [notificaciones, profile]);

  const lista = useMemo(
    () => notificaciones.filter((notif) => !leidas.has(notif.id)).map((notif) => ({ ...notif, leida: false })),
    [leidas, notificaciones],
  );

  const unreadCount = lista.length;

  return {
    loading: loadingRecepcion || loadingCompras || loadingAvisos || (canProduccion(profile) && loadingAlertas),
    lista,
    unreadCount,
    markLeido,
    markTodoLeido,
    resolverAlerta,
    recargar: () => {
      cargarRecepcion();
      cargarCompras();
      cargarAvisos();
      if (canProduccion(profile)) recargarAlertas?.();
    },
  };
}
