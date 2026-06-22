import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  MessageSquare,
  Paperclip,
  Printer,
  Send,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Skeleton, SkeletonStyles } from "@/components/ui/Skeleton";
import EnviarAPanolModal from "@/features/panol/EnviarAPanolModal";
import { fetchEnviosDePedido, ENVIO_ESTADO_META, resumenItems } from "@/features/panol/panolApi";
import {
  addRequestComment,
  addRequestFollower,
  fetchPurchaseRequestDetail,
  fetchRequestItems,
  fetchRequestFollowerWhatsappPreference,
  addRequestItem,
  updateRequestItem,
  deleteRequestItem,
  isPurchaseManager,
  ITEM_STATUSES,
  removeRequestFollower,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  deletePurchaseRequest,
  notifyComprasEmail,
  notifyWaUpdate,
  propagateAdditionalFromRequest,
  setRequestFollowerWhatsapp,
  updatePurchaseRequest,
  uploadInvoice,
  uploadItemImage,
  usernameOf,
} from "@/features/compras/purchaseRequestsApi";
import { printPurchaseRequest } from "@/features/compras/printPurchaseRequest";
import logoK from "@/assets/logos/logo-k.png";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";

// Solo tratamos como enlace/imagen lo que sea una URL http(s) absoluta y válida.
// Evita que un valor basura (path relativo inventado por el bot) navegue el SPA al menú.
const isHttpUrl = (u) => {
  if (typeof u !== "string") return false;
  try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:"; }
  catch { return false; }
};

const statusColors = {
  nuevo: C.blue,
  en_revision: C.violet,
  cotizando: C.amber,
  comprado: C.teal,
  recibido: C.green,
  cancelado: C.red,
};

const priorityColors = {
  baja: C.dim,
  media: C.blue,
  alta: C.amber,
  urgente: C.red,
};

const ARCHIVED_STATUSES = ["recibido", "cancelado"];

function fmtDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Pill({ children, color = C.blue }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      flexShrink: 0,
      gap: 5,
      color,
      background: `${color}16`,
      border: `1px solid ${color}33`,
      borderRadius: 7,
      padding: "4px 9px",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.9,
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function StatusDot({ status }) {
  const color = statusColors[status] || C.dim;
  return (
    <span style={{
      display: "inline-block",
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: color,
      boxShadow: `0 0 6px ${color}80`,
      flexShrink: 0,
    }} />
  );
}

function PersonChip({ user, tone = "default", onRemove }) {
  const name = usernameOf(user);
  const initials = name.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const color = tone === "creator" ? C.green : tone === "buyer" ? C.amber : C.blue;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 8px",
      borderRadius: 8,
      background: C.panel,
      border: `1px solid ${C.border}`,
      minWidth: 0,
    }}>
      <div style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        display: "grid",
        placeItems: "center",
        background: `${color}18`,
        color,
        fontSize: 11,
        fontWeight: 800,
        flexShrink: 0,
        letterSpacing: 0,
      }}>
        {initials || "?"}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        <div style={{ color: C.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
          {tone === "creator" ? "creador" : tone === "buyer" ? "compras" : user?.role || "usuario"}
        </div>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} title="Quitar del CC" style={iconButtonStyle}>
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

const iconButtonStyle = {
  width: 29,
  height: 29,
  borderRadius: 7,
  display: "grid",
  placeItems: "center",
  border: `1px solid ${C.border}`,
  background: "var(--panel)",
  color: C.muted,
  cursor: "pointer",
  flexShrink: 0,
  transition: "all .12s",
};

const inputStyle = {
  width: "100%",
  background: "var(--panel)",
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 8,
  padding: "9px 10px",
  outline: "none",
  fontSize: 13,
  fontFamily: C.sans,
};

function StatusStepper({ current, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {REQUEST_STATUSES.map((s) => {
        const color = statusColors[s.value];
        const isActive = current === s.value;
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            title={s.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              border: `1px solid ${isActive ? color + "66" : C.border}`,
              background: isActive ? `${color}14` : "transparent",
              color: isActive ? color : C.dim,
              borderRadius: 7,
              padding: "5px 9px",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              transition: "all .13s",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: isActive ? color : C.dim,
              display: "inline-block",
              opacity: isActive ? 1 : 0.4,
            }} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function ArchivedBanner({ status }) {
  if (!ARCHIVED_STATUSES.includes(status)) return null;
  const isReceived = status === "recibido";
  const color = isReceived ? C.green : C.red;
  const Icon = isReceived ? CheckCircle2 : Archive;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 14px",
      background: `${color}0d`,
      border: `1px solid ${color}30`,
      borderRadius: 8,
      color,
      fontSize: 13,
      fontWeight: 600,
      margin: "0 0 12px",
    }}>
      <Icon size={14} />
      {isReceived ? "Este pedido fue recibido y está archivado." : "Este pedido fue cancelado y está archivado."}
    </div>
  );
}

export default function PurchaseRequestDetail({ requestId, profile, users = [], onBack, onRequestUpdated, onDeleteLocal }) {
  const { isMobile } = useResponsive();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // En mobile el panel lateral (involucrados / copia / detalles) arranca oculto
  // y se muestra con un botón, para priorizar título + descripción + chat.
  const [showSideMobile, setShowSideMobile] = useState(false);
  const [sending, setSending] = useState(false);
  const [newFollowerId, setNewFollowerId] = useState("");
  const [items, setItems] = useState([]);
  const [generatedMovements, setGeneratedMovements] = useState([]);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemQty, setNewItemQty] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("unidad");
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editImageFile, setEditImageFile] = useState(null);
  const [editNotes, setEditNotes] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [costosOpen, setCostosOpen] = useState(false); // bloque costos/recepción colapsado por defecto
  const [panolModal, setPanolModal] = useState(false);
  const [enviosPanol, setEnviosPanol] = useState([]); // envíos a pañol vinculados a este pedido
  const [savingFollowerWa, setSavingFollowerWa] = useState(false);
  const bottomRef = useRef(null);
  const reloadTimer = useRef(null);
  const toast = useToast();
  const confirm = useConfirm();

  const manager = isPurchaseManager(profile);
  const itemsParaPanol = useMemo(
    () => items.filter((it) => !["en_panol", "recibido", "cancelado"].includes(it.status)),
    [items]
  );
  const canSendToPanol = manager && request?.status === "comprado" && itemsParaPanol.length > 0;
  const myFollower = useMemo(
    () => (request?.followers || []).find((item) => item.user_id === profile?.id),
    [request?.followers, profile?.id],
  );
  const followerWaEnabled = !!myFollower?.notify_whatsapp;
  const descriptionIsLong = useMemo(() => {
    const text = String(request?.description ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .trim();
    return text.length > 520 || (text.match(/\n/g) || []).length > 9;
  }, [request?.description]);

  useEffect(() => {
    setDescriptionOpen(false);
  }, [requestId]);

  async function fetchGeneratedMovementsForRequest(id) {
    const { data, error: movementsError } = await supabase
      .from("laminacion_movimientos")
      .select("id,material_id,tipo,cantidad,fecha,proveedor,obra,observaciones,created_at, laminacion_materiales(nombre,unidad)")
      .ilike("observaciones", `%PR-${id}%`)
      .order("created_at", { ascending: false });
    if (movementsError) throw movementsError;
    return data ?? [];
  }

  async function load() {
    if (!requestId) return;
    setError("");
    setLoading(true);
    try {
      const [data, itemsData, movementsData, enviosData, waPreference] = await Promise.all([
        fetchPurchaseRequestDetail(requestId),
        fetchRequestItems(requestId),
        fetchGeneratedMovementsForRequest(requestId),
        fetchEnviosDePedido(requestId).catch(() => []),
        fetchRequestFollowerWhatsappPreference(requestId).catch(() => null),
      ]);
      const requestData = waPreference
        ? {
            ...data,
            followers: (data.followers || []).map((item) =>
              item.user_id === waPreference.user_id
                ? {
                    ...item,
                    notify_whatsapp: waPreference.notify_whatsapp,
                    notify_whatsapp_at: waPreference.notify_whatsapp_at,
                  }
                : item,
            ),
          }
        : data;
      setRequest(requestData);
      setItems(itemsData);
      setGeneratedMovements(movementsData);
      setEnviosPanol(enviosData);
    } catch (err) {
      setError(err.message || "No se pudo cargar la solicitud.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [requestId]);

  useEffect(() => {
    if (!requestId) return undefined;
    // Realtime puede disparar muchos eventos seguidos; agrupamos en una sola recarga.
    const scheduleReload = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        reloadTimer.current = null;
        load();
      }, 350);
    };
    const channel = supabase.channel(`purchase-request-${requestId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_requests",      filter: `id=eq.${requestId}` },        scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "request_followers",      filter: `request_id=eq.${requestId}` }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "request_comments",       filter: `request_id=eq.${requestId}` }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_request_items", filter: `request_id=eq.${requestId}` }, scheduleReload)
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [requestId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [request?.comments?.length]);

  const involvedIds = useMemo(() => {
    const ids = new Set([request?.created_by, request?.assigned_to]);
    (request?.followers || []).forEach((f) => ids.add(f.user_id));
    return ids;
  }, [request]);

  const availableFollowers = users.filter((user) => !involvedIds.has(user.id));

  // Creador + CC + assignee también pueden editar prioridad (no solo compras/admin).
  const canEditPriority = manager || involvedIds.has(profile?.id);

  async function patchRequest(patch) {
    setError("");
    try {
      // Capturar valores previos para detectar cambios de status / prioridad / amounts
      const oldStatus = request.status;
      const oldPriority = request.priority;
      const oldEstimated = request.estimated_amount;
      const oldActual = request.actual_amount;
      const oldDelivery = request.estimated_delivery_at;
      const oldReceivedQty = request.received_quantity;

      if (patch.status === "recibido" && !patch.delivered_at) {
        patch.delivered_at = new Date().toISOString();
      }

      const data = await updatePurchaseRequest(request.id, patch);
      setRequest((prev) => ({ ...prev, ...data }));

      const actorName = profile?.username || "Usuario";

      // ── Cambio de estado ──────────────────────────────────────────────
      if (patch.status && patch.status !== oldStatus) {
        const newLabel = REQUEST_STATUSES.find((s) => s.value === patch.status)?.label || patch.status;
        toast.success(`Estado actualizado: ${newLabel}`);
        notifyComprasEmail({
          type: "status_update",
          requestId: request.id,
          requestTitle: request.title,
          changedBy: profile?.id,
          createdByName: actorName,
          newStatus: patch.status,
          oldStatus,
        });
        notifyWaUpdate({
          requestId: request.id,
          eventType: "status",
          actorId: profile?.id,
          payload: { oldStatus, newStatus: patch.status, actorName },
        });

        // Notif especial "recibido" — incluye cantidad recibida si la hay
        if (patch.status === "recibido") {
          notifyWaUpdate({
            requestId: request.id,
            eventType: "received",
            actorId: profile?.id,
            payload: {
              quantity: patch.received_quantity ?? request.received_quantity ?? "",
              notes: patch.receipt_notes ?? request.receipt_notes ?? "",
              actorName,
            },
          });

          try {
            const { data: materialized, error: materializeError } = await supabase.functions.invoke("materialize-received", {
              body: { requestId: request.id },
            });
            if (materializeError) throw materializeError;
            const created = Number(materialized?.created ?? 0);
            const skipped = Number(materialized?.skipped ?? 0);
            toast.success(`Ingresos generados: ${created} creados, ${skipped} sin destino reconocido.`);
            const nextMovements = await fetchGeneratedMovementsForRequest(request.id);
            setGeneratedMovements(nextMovements);
          } catch (materializeErr) {
            console.warn("No se pudo materializar el pedido recibido:", materializeErr);
            toast.warning("Pedido recibido, pero no se pudieron generar ingresos automáticos.");
          }
        }
      }

      // ── Cambio de prioridad ───────────────────────────────────────────
      if (patch.priority && patch.priority !== oldPriority) {
        const oldPLabel = REQUEST_PRIORITIES.find((p) => p.value === oldPriority)?.label || oldPriority || "?";
        const newPLabel = REQUEST_PRIORITIES.find((p) => p.value === patch.priority)?.label || patch.priority;
        toast.success(`Prioridad: ${newPLabel}`);

        try {
          await addRequestComment(
            request.id,
            `Cambié la prioridad de ${oldPLabel} a ${newPLabel}.`,
            users,
          );
        } catch (e) {
          console.warn("No se pudo registrar el cambio de prioridad como comentario:", e);
          toast.warning("Prioridad cambiada, pero no se pudo publicar el mensaje en el chat.");
        }

        notifyComprasEmail({
          type: "priority_update",
          requestId: request.id,
          requestTitle: request.title,
          changedBy: profile?.id,
          createdByName: actorName,
          newPriority: patch.priority,
          oldPriority,
          newPriorityLabel: newPLabel,
          oldPriorityLabel: oldPLabel,
        });
        notifyWaUpdate({
          requestId: request.id,
          eventType: "priority",
          actorId: profile?.id,
          payload: { oldPriority, newPriority: patch.priority, actorName },
        });
      }

      // ── Cotización (monto estimado) ──────────────────────────────────
      if (patch.estimated_amount !== undefined && patch.estimated_amount !== oldEstimated && patch.estimated_amount !== null) {
        notifyWaUpdate({
          requestId: request.id,
          eventType: "amount",
          actorId: profile?.id,
          payload: { kind: "estimated", amount: patch.estimated_amount, actorName },
        });
      }

      // ── Costo real (cuando se compró) ────────────────────────────────
      if (patch.actual_amount !== undefined && patch.actual_amount !== oldActual && patch.actual_amount !== null) {
        notifyWaUpdate({
          requestId: request.id,
          eventType: "amount",
          actorId: profile?.id,
          payload: { kind: "actual", amount: patch.actual_amount, actorName },
        });
      }

      // ── Adicionales: propagar el precio del pedido a sus renglones ────
      if ((patch.actual_amount !== undefined && patch.actual_amount !== oldActual)
        || (patch.estimated_amount !== undefined && patch.estimated_amount !== oldEstimated)) {
        propagateAdditionalFromRequest({ ...request, ...patch }).then((r) => {
          if (r?.created) toast.success("Sumado a Adicionales de la obra con el precio.");
          else if (r?.updated) toast.success("Precio sincronizado en Adicionales.");
        }).catch(() => {});
      }

      // ── Fecha estimada de entrega ────────────────────────────────────
      if (patch.estimated_delivery_at !== undefined && patch.estimated_delivery_at !== oldDelivery && patch.estimated_delivery_at) {
        notifyWaUpdate({
          requestId: request.id,
          eventType: "delivery_date",
          actorId: profile?.id,
          payload: { date: patch.estimated_delivery_at, actorName },
        });
      }

      // ── Cantidad recibida (si se actualiza sin cambio de status) ─────
      if (patch.received_quantity !== undefined && patch.received_quantity !== oldReceivedQty && patch.received_quantity && patch.status !== "recibido" && oldStatus === "recibido") {
        notifyWaUpdate({
          requestId: request.id,
          eventType: "received",
          actorId: profile?.id,
          payload: { quantity: patch.received_quantity, notes: patch.receipt_notes || "", actorName },
        });
      }

      onRequestUpdated?.();
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "No se pudo actualizar el pedido.");
    }
  }

  async function handleAddFollower() {
    if (!newFollowerId) return;
    setError("");
    try {
      await addRequestFollower(request.id, newFollowerId);
      setNewFollowerId("");
      await load();
      onRequestUpdated?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveFollower(userId) {
    setError("");
    try {
      await removeRequestFollower(request.id, userId);
      await load();
      onRequestUpdated?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleFollowerWhatsapp() {
    if (!myFollower || savingFollowerWa) return;
    const next = !followerWaEnabled;
    setSavingFollowerWa(true);
    setError("");
    try {
      const updated = await setRequestFollowerWhatsapp(request.id, next);
      setRequest((prev) => ({
        ...prev,
        followers: (prev?.followers || []).map((item) =>
          item.user_id === profile?.id
            ? {
                ...item,
                notify_whatsapp: updated.notify_whatsapp,
                notify_whatsapp_at: updated.notify_whatsapp_at,
              }
            : item,
        ),
      }));
      toast.success(next
        ? "Listo: el bot te va a avisar las novedades de este pedido."
        : "Notificaciones por WhatsApp desactivadas para este pedido.");
      onRequestUpdated?.();
    } catch (err) {
      const msg = err.message || "No se pudo cambiar la notificacion por WhatsApp.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingFollowerWa(false);
    }
  }

  async function sendComment(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError("");
    try {
      const body = message.trim();
      await addRequestComment(request.id, message, users);
      notifyComprasEmail({
        type: "new_message",
        requestId: request.id,
        requestTitle: request.title,
        changedBy: profile?.id,
        createdByName: profile?.username || "Usuario",
        message: body,
      });
      notifyWaUpdate({
        requestId: request.id,
        eventType: "comment",
        actorId: profile?.id,
        payload: { body, actorName: profile?.username || "Usuario" },
      });
      setMessage("");
      await load();
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  const canEditItems = manager || request?.created_by === profile?.id;

  async function handleAddItem(e) {
    e.preventDefault();
    if (!newItemDesc.trim()) return;
    setError("");
    try {
      await addRequestItem(request.id, {
        description: newItemDesc.trim(),
        quantity: newItemQty.trim() || null,
        unit: newItemUnit,
      });
      setNewItemDesc("");
      setNewItemQty("");
      setNewItemUnit("unidad");
      setShowAddItem(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdateItemStatus(item, status) {
    setError("");
    try {
      const oldStatus = item.status;
      await updateRequestItem(item.id, { status });
      await load();
      if (status !== oldStatus) {
        notifyWaUpdate({
          requestId: request.id,
          eventType: "item_status",
          actorId: profile?.id,
          payload: {
            itemDescription: item.description,
            oldStatus,
            newStatus: status,
            actorName: profile?.username || "Usuario",
          },
        });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteItem(itemId) {
    const ok = await confirm({
      title: "Eliminar ítem",
      message: "El ítem se borra del pedido. No se puede deshacer.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    setError("");
    try {
      await deleteRequestItem(itemId);
      await load();
      toast.success("Ítem eliminado");
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "No se pudo eliminar el ítem.");
    }
  }

  function startEditItem(item) {
    setEditingItem(item);
    setEditLinkUrl(item.link_url || "");
    setEditImageFile(null);
    setEditNotes(item.notes || "");
    setEditDescription(item.description || "");
    setEditQuantity(item.quantity != null ? String(item.quantity) : "");
    setEditUnit(item.unit || "");
  }

  async function handleSaveItem(e) {
    e.preventDefault();
    if (!editingItem) return;
    const description = editDescription.trim();
    if (!description) { setError("El nombre del ítem no puede quedar vacío."); return; }
    setError("");
    try {
      const patch = {
        description,
        quantity: editQuantity.trim() || null,
        unit: editUnit.trim() || null,
        link_url: editLinkUrl.trim() || null,
        notes: editNotes.trim() || null,
      };
      if (editImageFile) {
        const { imageUrl, imagePath } = await uploadItemImage(editImageFile, request.id);
        patch.image_url = imageUrl;
        patch.image_path = imagePath;
      }
      await updateRequestItem(editingItem.id, patch);
      setEditingItem(null);
      setEditImageFile(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div style={{ height: "100%", background: C.bg, color: C.text, fontFamily: C.sans, display: "grid", gridTemplateRows: "auto 1fr", overflow: isMobile ? "auto" : "hidden" }}>
        <SkeletonStyles />
        <header style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.topbar }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Skeleton width={29} height={29} radius={7} />
            <div style={{ display: "grid", gap: 6, flex: 1 }}>
              <Skeleton width="45%" height={15} />
              <Skeleton width="30%" height={10} />
            </div>
            <Skeleton width={29} height={29} radius={7} />
          </div>
        </header>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 300px", overflow: isMobile ? "auto" : "hidden" }}>
          <section style={{ padding: 16, borderRight: isMobile ? "none" : `1px solid ${C.border}`, display: "grid", gap: 12, alignContent: "start" }}>
            <Skeleton width="20%" height={9} />
            <Skeleton width="92%" height={12} />
            <Skeleton width="88%" height={12} />
            <Skeleton width="64%" height={12} />
            <div style={{ marginTop: 14 }}><Skeleton width="14%" height={9} /></div>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={42} radius={6} />
            ))}
          </section>
          <aside style={{ padding: 14, display: isMobile ? "none" : "grid", gap: 14, alignContent: "start" }}>
            <Skeleton width="50%" height={11} />
            <Skeleton width="100%" height={40} radius={8} />
            <Skeleton width="100%" height={40} radius={8} />
            <Skeleton width="60%" height={11} />
            <Skeleton width="100%" height={86} radius={9} />
          </aside>
        </div>
      </div>
    );
  }

  if (error && !request) {
    return (
      <div style={{ padding: 24, color: C.text, fontFamily: C.sans }}>
        <button type="button" onClick={onBack} style={{ ...iconButtonStyle, marginBottom: 14 }}><ArrowLeft size={15} /></button>
        {error}
      </div>
    );
  }

  const comments = request?.comments || [];
  const followers = request?.followers || [];

  return (
    <div style={{
      height: "100%",
      display: "grid",
      gridTemplateRows: "auto 1fr",
      background: C.bg,
      color: C.text,
      fontFamily: C.sans,
      overflow: "hidden",
    }}>
      <style>{`
        select option { background: var(--panel-solid); color: var(--text); }
        textarea:focus, select:focus, input:focus {
          border-color: rgba(96,165,250,0.42) !important;
          box-shadow: 0 0 0 3px rgba(96,165,250,0.08);
        }
        .pr-chat-scroll::-webkit-scrollbar { width: 4px; }
        .pr-chat-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
        .pr-aside::-webkit-scrollbar { width: 4px; }
        .pr-aside::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pr-msg-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .pr-message { animation: pr-msg-in .22s ease-out both; }
        .icon-btn:hover { background: var(--panel-2) !important; color: var(--text) !important; }

        /* Estilos para renderizar el HTML enriquecido que viene de Quill */
        .quill-content ul, .quill-content ol { padding-left: 20px; margin: 6px 0; }
        .quill-content p { margin: 0 0 6px 0; }
        .quill-content p:last-child { margin: 0; }
        .quill-content a { color: #60a5fa; text-decoration: underline; }
      `}</style>

      <header style={{
        borderBottom: `1px solid ${C.border}`,
        background: C.topbar,
      }}>
        <div style={{
          minHeight: 64,
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          flexWrap: isMobile ? "wrap" : "nowrap",
          gap: isMobile ? 8 : 12,
          // En mobile el botón hamburguesa del Sidebar flota arriba-izquierda;
          // padding-left para que el botón "volver" no quede debajo de él.
          padding: isMobile ? "10px 12px 10px 50px" : "10px 16px",
          borderBottom: manager ? `1px solid ${C.border}` : "none",
        }}>
          <button type="button" onClick={onBack} title="Volver" className="icon-btn" style={iconButtonStyle}>
            <ArrowLeft size={15} />
          </button>
          {/* En mobile el título baja a su propia línea (order 2 + base 100%);
              las acciones quedan arriba a la derecha. */}
          <div style={{ minWidth: 0, flex: isMobile ? "1 1 100%" : 1, order: isMobile ? 2 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <StatusDot status={request.status} />
              <h2 style={{
                margin: 0,
                color: C.text,
                fontSize: isMobile ? 14 : 16,
                fontWeight: isMobile ? 700 : 800,
                lineHeight: isMobile ? 1.25 : 1.2,
                letterSpacing: -0.3,
                flex: "1 1 auto",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: isMobile ? "normal" : "nowrap",
              }}>
                {request.title}
              </h2>
              {!manager && (
                <>
                  <Pill color={statusColors[request.status]}>
                    {REQUEST_STATUSES.find((s) => s.value === request.status)?.label || request.status}
                  </Pill>
                  <Pill color={priorityColors[request.priority]}>
                    {REQUEST_PRIORITIES.find((p) => p.value === request.priority)?.label || request.priority}
                  </Pill>
                </>
              )}
            </div>
            <div style={{ marginTop: 4, color: C.dim, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={11} />
              Creado por {usernameOf(request.creator)} el {fmtDateTime(request.created_at)}
              {request.project?.codigo ? ` · Proyecto ${request.project.codigo}` : request.destino ? ` · ${request.destino}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: isMobile ? "auto" : 0 }}>
            <button
              type="button"
              title="Imprimir en formato Webmail"
              className="icon-btn"
              style={iconButtonStyle}
              onClick={() => printPurchaseRequest({ ...request, items }, logoK)}
            >
              <Printer size={14} />
            </button>

            {(manager || profile?.id === request.created_by) && (
              <button
                type="button"
                title="Eliminar pedido"
                className="icon-btn"
                style={{ ...iconButtonStyle, color: C.red }}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Eliminar pedido",
                    message: `Vas a eliminar “${request.title}”. Se borran también sus ítems, mensajes y CC.`,
                    confirmLabel: "Eliminar",
                    tone: "danger",
                  });
                  if (!ok) return;
                  try {
                    await deletePurchaseRequest(request.id);
                    if (onDeleteLocal) onDeleteLocal(request.id);
                    toast.success("Pedido eliminado");
                    onBack();
                  } catch (e) {
                    toast.error("Error al eliminar: " + (e.message || "desconocido"));
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {manager && (
          <div style={{ padding: "10px 16px", display: "flex", alignItems: isMobile ? "stretch" : "center", gap: 12, flexWrap: "wrap", flexDirection: isMobile ? "column" : "row" }}>
            <div style={{ flex: 1, minWidth: 0, maxWidth: "100%", overflowX: "auto" }}>
              <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
                Estado
              </div>
              <StatusStepper current={request.status} onChange={(status) => patchRequest({ status })} />
            </div>

            <div style={{ flexShrink: 0, minWidth: isMobile ? 0 : 160 }}>
              <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
                Proveedor
              </div>
              <input
                type="text"
                placeholder="Ej: Maderas Tigre"
                value={request.proveedor || ""}
                onChange={(e) => {
                  const valor = e.target.value;
                  setRequest((prev) => ({ ...prev, proveedor: valor }));
                }}
                onBlur={() => {
                  const next = (request.proveedor || "").trim() || null;
                  setRequest((prev) => ({ ...prev, proveedor: next }));
                  patchRequest({ proveedor: next });
                }}
                style={inputStyle}
              />
            </div>

            <div style={{ flexShrink: 0 }}>
              <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
                Prioridad
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {REQUEST_PRIORITIES.map((p) => {
                  const color = priorityColors[p.value];
                  const isActive = request.priority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => {
                        if (p.value === request.priority) return;
                        patchRequest({ priority: p.value });
                      }}
                      style={{
                        border: `1px solid ${isActive ? color + "55" : C.border}`,
                        background: isActive ? `${color}14` : "transparent",
                        color: isActive ? color : C.dim,
                        borderRadius: 7,
                        padding: "5px 9px",
                        cursor: isActive ? "default" : "pointer",
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        transition: "all .13s",
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Barra independiente de prioridad para creador / CC que no son compras */}
        {!manager && canEditPriority && (
          <div style={{
            padding: "9px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            borderTop: `1px solid ${C.border}`,
            background: "rgba(255,255,255,0.012)",
          }}>
            <span style={{
              color: C.dim,
              fontSize: 10,
              letterSpacing: 1.1,
              textTransform: "uppercase",
              fontWeight: 750,
            }}>
              Prioridad
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {REQUEST_PRIORITIES.map((p) => {
                const color = priorityColors[p.value];
                const isActive = request.priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      if (p.value === request.priority) return;
                      patchRequest({ priority: p.value });
                    }}
                    style={{
                      border: `1px solid ${isActive ? color + "55" : C.border}`,
                      background: isActive ? `${color}14` : "transparent",
                      color: isActive ? color : C.dim,
                      borderRadius: 7,
                      padding: "5px 10px",
                      cursor: isActive ? "default" : "pointer",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                      transition: "all .13s",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <span style={{ flex: 1 }} />
            <span style={{ color: C.dim, fontSize: 11 }}>
              El cambio se publica en el chat y se notifica a compras.
            </span>
          </div>
        )}

        {manager && (request.status === "cotizando" || request.status === "comprado" || request.status === "recibido") && (
          <div style={{
            padding: "10px 16px",
            borderBottom: `1px solid ${C.border}`,
            display: "grid",
            gap: costosOpen ? 12 : 0,
          }}>
            <button type="button" onClick={() => setCostosOpen((o) => !o)} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "2px 0",
            }}>
              <span style={{ color: C.dim, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 750 }}>
                Costos y recepción
              </span>
              <span style={{ color: C.blue, fontSize: 11, fontWeight: 700 }}>
                {costosOpen ? "▾ ocultar" : "▸ cargar precio / recepción"}
              </span>
            </button>

            {costosOpen && (<>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
              {(request.status === "cotizando" || request.status === "comprado" || request.status === "recibido") && (
                <div>
                  <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
                    Monto cotizado $
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={request.estimated_amount ?? ""}
                    onChange={(e) => {
                      const val = e.target.value === "" ? null : Number(e.target.value);
                      setRequest((prev) => ({ ...prev, estimated_amount: val }));
                    }}
                    onBlur={() => {
                      if (request.estimated_amount !== undefined) {
                        patchRequest({ estimated_amount: request.estimated_amount });
                      }
                    }}
                    style={inputStyle}
                  />
                </div>
              )}

              {(request.status === "comprado" || request.status === "recibido") && (
                <div>
                  <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
                    Monto real $
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={request.actual_amount ?? ""}
                    onChange={(e) => {
                      const val = e.target.value === "" ? null : Number(e.target.value);
                      setRequest((prev) => ({ ...prev, actual_amount: val }));
                    }}
                    onBlur={() => {
                      if (request.actual_amount !== undefined) {
                        patchRequest({ actual_amount: request.actual_amount });
                      }
                    }}
                    style={inputStyle}
                  />
                </div>
              )}

              {(request.status === "comprado" || request.status === "recibido") && (
                <div>
                  <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
                    Fecha entrega estimada
                  </div>
                  <input
                    type="date"
                    value={request.estimated_delivery_at || ""}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      setRequest((prev) => ({ ...prev, estimated_delivery_at: val }));
                    }}
                    onBlur={() => {
                      if (request.estimated_delivery_at !== undefined) {
                        patchRequest({ estimated_delivery_at: request.estimated_delivery_at });
                      }
                    }}
                    style={inputStyle}
                  />
                </div>
              )}
            </div>

            {request.estimated_amount !== null && request.actual_amount !== null && (
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 10px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                background: request.actual_amount <= request.estimated_amount
                  ? "rgba(16,185,129,0.1)"
                  : "rgba(239,68,68,0.1)",
                border: `1px solid ${request.actual_amount <= request.estimated_amount
                  ? "rgba(16,185,129,0.25)"
                  : "rgba(239,68,68,0.25)"}`,
                color: request.actual_amount <= request.estimated_amount ? C.green : C.red,
                alignSelf: "flex-start",
              }}>
                {request.actual_amount <= request.estimated_amount ? "✓" : "▲"} Presupuesto: ${Number(request.estimated_amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })} · Real: ${Number(request.actual_amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                {request.actual_amount > request.estimated_amount && (
                  <span style={{ fontWeight: 800 }}>
                    (${(request.actual_amount - request.estimated_amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })} excedente)
                  </span>
                )}
              </div>
            )}
            </>)}
          </div>
        )}

        {manager && request.status === "recibido" && costosOpen && (
          <div style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            display: "grid",
            gap: 12,
          }}>
            <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 750 }}>
              Recepción
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
                  Cantidad recibida
                </div>
                <input
                  type="text"
                  placeholder="Ej: 10 unidades, 3 m²"
                  value={request.received_quantity || ""}
                  onChange={(e) => {
                    const val = e.target.value || null;
                    setRequest((prev) => ({ ...prev, received_quantity: val }));
                  }}
                  onBlur={() => {
                    if (request.received_quantity !== undefined) {
                      patchRequest({ received_quantity: request.received_quantity });
                    }
                  }}
                  style={inputStyle}
                />
              </div>

              <div>
                <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
                  Fecha recepción
                </div>
                <input
                  type="date"
                  value={request.delivered_at ? request.delivered_at.slice(0, 10) : new Date().toISOString().slice(0, 10)}
                  onChange={(e) => {
                    const val = e.target.value ? new Date(e.target.value).toISOString() : null;
                    setRequest((prev) => ({ ...prev, delivered_at: val }));
                  }}
                  onBlur={() => {
                    if (request.delivered_at !== undefined) {
                      patchRequest({ delivered_at: request.delivered_at });
                    }
                  }}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
                Notas de recepción
              </div>
              <textarea
                placeholder="Estado del pedido, novedades, observaciones..."
                value={request.receipt_notes || ""}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setRequest((prev) => ({ ...prev, receipt_notes: val }));
                }}
                onBlur={() => {
                  if (request.receipt_notes !== undefined) {
                    patchRequest({ receipt_notes: request.receipt_notes });
                  }
                }}
                rows={2}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4 }}
              />
            </div>

            <div>
              <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
                Factura / comprobante
              </div>
              {request.invoice_url ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <a
                    href={request.invoice_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      color: C.blue,
                      background: "rgba(96,165,250,0.08)",
                      border: `1px solid rgba(96,165,250,0.2)`,
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    <ImageIcon size={13} /> Ver comprobante
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Eliminar comprobante",
                        message: "El archivo de la factura se desvincula del pedido.",
                        confirmLabel: "Eliminar",
                        tone: "danger",
                      });
                      if (!ok) return;
                      await patchRequest({ invoice_url: null, invoice_path: null });
                      toast.success("Comprobante eliminado");
                    }}
                    style={{
                      ...iconButtonStyle,
                      color: C.red,
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ) : (
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px dashed ${C.border2}`,
                  borderRadius: 8,
                  padding: 11,
                  color: C.dim,
                  cursor: "pointer",
                  background: C.panel,
                  fontSize: 13,
                }}>
                  <Paperclip size={14} />
                  Subir factura / PDF
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const { invoiceUrl, invoicePath } = await uploadInvoice(file, profile?.id || request.created_by);
                        await patchRequest({ invoice_url: invoiceUrl, invoice_path: invoicePath });
                      } catch (err) {
                        setError(err.message || "No se pudo subir el comprobante.");
                      }
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        )}
      </header>

      <div style={{
        minHeight: 0,
        // En mobile usamos flujo de bloque (no grid) para que sección y aside
        // se apilen sin pisarse. El contenedor scrollea como una sola página.
        display: isMobile ? "block" : "grid",
        gridTemplateColumns: isMobile ? undefined : "minmax(0, 1fr) 300px",
        overflow: isMobile ? "auto" : "hidden",
      }}>
        <section style={{
          minHeight: 0,
          display: isMobile ? "block" : "grid",
          gridTemplateRows: isMobile ? undefined : "auto 1fr auto",
          borderRight: isMobile ? "none" : `1px solid ${C.border}`,
        }}>

          <div style={{
            padding: isMobile ? 12 : 16,
            borderBottom: `1px solid ${C.border}`,
            display: "grid",
            gridTemplateColumns: isMobile || !(request.photo_urls?.length || request.photo_url) ? "1fr" : "1fr 160px",
            gap: 14,
          }}>
            <div>
              {ARCHIVED_STATUSES.includes(request.status) && <ArchivedBanner status={request.status} />}
              <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 7, fontWeight: 750 }}>
                Descripción
              </div>
              
              {/* Las descripciones del editor rico son HTML; las que vienen de los
                  flujos (ej. la vista email de Laminación) son texto plano con saltos
                  de línea. Detectamos cuál es: si tiene tags HTML lo renderizamos como
                  HTML; si es texto plano lo mostramos con pre-wrap (respeta los \n y
                  además evita el riesgo de innerHTML con texto del usuario). */}
              <div className="quill-content" style={{
                color: C.muted,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: "normal",
                maxHeight: descriptionIsLong && !descriptionOpen ? 210 : "none",
                overflow: descriptionIsLong && !descriptionOpen ? "hidden" : "visible",
                border: descriptionIsLong ? `1px solid ${C.border}` : "none",
                background: descriptionIsLong ? C.panel : "transparent",
                borderRadius: descriptionIsLong ? 9 : 0,
                padding: descriptionIsLong ? "10px 12px" : 0,
              }}>
                {request.description ? (
                  /<[a-z!/][\s\S]*>/i.test(request.description) ? (
                    <div dangerouslySetInnerHTML={{ __html: request.description }} />
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap" }}>{request.description}</div>
                  )
                ) : (
                  <span style={{ fontStyle: "italic", color: C.dim }}>Sin descripción.</span>
                )}
              </div>
              {descriptionIsLong && (
                <button
                  type="button"
                  onClick={() => setDescriptionOpen(v => !v)}
                  style={{
                    marginTop: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 9px",
                    borderRadius: 7,
                    border: `1px solid ${C.border}`,
                    background: C.panel,
                    color: C.blue,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 750,
                    fontFamily: C.sans,
                  }}
                >
                  {descriptionOpen ? "Replegar descripcion" : "Ver descripcion completa"}
                </button>
              )}

              {request.needed_at && (
                <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, color: C.amber, fontSize: 12, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, padding: "4px 8px" }}>
                  <Clock size={12} />
                  Necesario para: {new Date(request.needed_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </div>
              )}

              {/* ── Estado en Pañol (módulo de recepción) ─────────────────── */}
              {(manager || enviosPanol.length > 0) && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: enviosPanol.length ? 8 : 0 }}>
                    <div style={{ flex: 1, color: C.dim, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 750 }}>Estado en Pañol</div>
                    {canSendToPanol && (
                      <button type="button" onClick={() => setPanolModal(true)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 7, border: "1px solid rgba(96,165,250,0.35)", background: "rgba(96,165,250,0.12)", color: C.blue, cursor: "pointer", fontSize: 12, fontWeight: 750, fontFamily: C.sans }}>
                        <Send size={12} /> Enviar a Pañol
                      </button>
                    )}
                  </div>
                  {enviosPanol.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.dim }}>Todavía no se envió a pañol.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {enviosPanol.map(e => {
                        const r = resumenItems(e.items || []);
                        const em = ENVIO_ESTADO_META[e.estado] ?? { label: e.estado, color: C.dim };
                        return (
                          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: em.color, flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.titulo} · {e.sede}</span>
                            <span style={{ fontSize: 11, color: C.muted }}>{r.recibidos}/{r.total}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: em.color, background: `${em.color}1c`, border: `1px solid ${em.color}44`, borderRadius: 999, padding: "1px 8px" }}>{em.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {panolModal && (
                <EnviarAPanolModal
                  open={panolModal}
                  profile={profile}
                  prefill={{
                    titulo: request.title,
                    origen: "compra",
                    purchaseRequestId: request.id,
                    obraId: request.project_id || null,
                    items: itemsParaPanol.map(it => ({ descripcion: it.description, cantidad: it.quantity, unidad: it.unit, purchase_request_item_id: it.id })),
                  }}
                  onClose={(saved) => { setPanolModal(false); if (saved) load(); }}
                />
              )}
            </div>
            {(() => {
              const photos = (request.photo_urls?.length ? request.photo_urls
                : request.photo_url ? [request.photo_url] : []).filter(isHttpUrl);
              if (photos.length === 0) return null;
              const multi = photos.length > 1;
              return (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignContent: "flex-start" }}>
                  {photos.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noreferrer" style={{
                      display: "block",
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      overflow: "hidden",
                      background: C.panel,
                      width: multi ? "calc(50% - 3px)" : "100%",
                      height: multi ? 74 : undefined,
                      minHeight: multi ? undefined : 110,
                    }}>
                      <img src={u} loading="lazy" alt={`${request.title} ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </a>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="pr-chat-scroll" style={{ minHeight: 0, overflowY: isMobile ? "visible" : "auto", padding: isMobile ? "12px" : "16px 18px" }}>

            {/* ─── ITEMS ──────────────────────────────────────────────── */}
            <div style={{ marginBottom: items.length || showAddItem ? 20 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ color: C.dim, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 750 }}>Items</span>
                {items.length > 0 && <span style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>{items.length}</span>}
                <span style={{ flex: 1 }} />
                {canEditItems && !showAddItem && (
                  <button type="button" onClick={() => setShowAddItem(true)} style={{
                    padding: "2px 10px", borderRadius: 5, cursor: "pointer", fontSize: 11,
                    border: `1px solid ${C.border}`, background: C.panel, color: C.muted,
                  }}>+ Item</button>
                )}
              </div>

              {showAddItem && (
                <form onSubmit={handleAddItem} style={{
                  display: "grid", gridTemplateColumns: isMobile ? "1fr 70px auto" : "1fr 70px 100px auto",
                  gap: 6, marginBottom: 10,
                  padding: 10, borderRadius: 8, border: `1px solid ${C.border}`,
                  background: C.panel,
                }}>
                  <input value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)}
                    placeholder="Descripción del ítem"
                    style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
                  <input value={newItemQty} onChange={e => setNewItemQty(e.target.value)}
                    placeholder="Cant."
                    style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
                  <select value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)}
                    style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}>
                    <option value="unidad">unidad</option>
                    <option value="par">par</option>
                    <option value="juego">juego</option>
                    <option value="metro">metro</option>
                    <option value="pies">pies</option>
                    <option value="m²">m²</option>
                    <option value="kg">kg</option>
                    <option value="litro">litro</option>
                  </select>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="submit" style={{
                      padding: "6px 10px", borderRadius: 5, cursor: "pointer", fontSize: 12,
                      border: `1px solid ${C.blue}`, background: "rgba(59,130,246,0.15)", color: C.blue, fontWeight: 600,
                    }}>Agregar</button>
                    <button type="button" onClick={() => { setShowAddItem(false); setNewItemDesc(""); setNewItemQty(""); }}
                      style={{ padding: "6px 8px", borderRadius: 5, cursor: "pointer", fontSize: 12,
                        border: `1px solid ${C.border}`, background: "transparent", color: C.dim }}>✕</button>
                  </div>
                </form>
              )}

              {items.map((item) => {
                const st = ITEM_STATUSES.find(s => s.value === item.status) || ITEM_STATUSES[0];
                const isEditing = editingItem?.id === item.id;
                return (
                  <div key={item.id} style={{
                    display: "grid", gap: 6,
                    padding: "8px 10px", marginBottom: 4,
                    borderRadius: 6, border: `1px solid ${isEditing ? C.blue + "55" : C.border}`,
                    background: isEditing ? "rgba(59,130,246,0.04)" : C.panel,
                    transition: "all .12s",
                  }}>
                    <div style={{
                      display: "grid", gridTemplateColumns: "auto 1fr auto auto",
                      gap: 10, alignItems: "center",
                    }}>
                      <select
                        value={item.status}
                        onChange={e => handleUpdateItemStatus(item, e.target.value)}
                        disabled={!canEditItems}
                        style={{
                          padding: "2px 22px 2px 8px",
                          borderRadius: 5, fontSize: 11, fontWeight: 700,
                          border: `1px solid ${st.color}44`,
                          background: `${st.color}15`,
                          color: st.color,
                          cursor: canEditItems ? "pointer" : "default",
                          appearance: canEditItems ? "auto" : "none",
                          WebkitAppearance: canEditItems ? "auto" : "none",
                        }}>
                        {ITEM_STATUSES.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      <div>
                        <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{item.description}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                          {(item.quantity || item.unit) && (
                            <span style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>
                              {item.quantity} {item.unit}
                            </span>
                          )}
                          {isHttpUrl(item.image_url) && (
                            <a href={item.image_url} target="_blank" rel="noreferrer" style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              color: C.blue, fontSize: 10, textDecoration: "none",
                            }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                              Foto
                            </a>
                          )}
                          {isHttpUrl(item.link_url) && (
                            <a href={item.link_url} target="_blank" rel="noreferrer" style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              color: C.amber, fontSize: 10, textDecoration: "none",
                            }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                              Enlace
                            </a>
                          )}
                          {item.notes && (
                            <span style={{ color: C.dim, fontSize: 11, fontStyle: "italic" }}>{item.notes}</span>
                          )}
                        </div>
                      </div>
                      {canEditItems && (
                        <button type="button" onClick={() => isEditing ? setEditingItem(null) : startEditItem(item)}
                          title="Editar ítem"
                          style={{
                            padding: "3px 7px", borderRadius: 4, cursor: "pointer", fontSize: 11,
                            border: `1px solid ${C.border}`, background: "transparent", color: isEditing ? C.blue : C.dim,
                          }}>{isEditing ? "✕" : "✎"}</button>
                      )}
                      {canEditItems && (
                        <button type="button" onClick={() => handleDeleteItem(item.id)}
                          title="Eliminar ítem"
                          style={{
                            padding: 3, borderRadius: 4, cursor: "pointer", fontSize: 12,
                            border: `1px solid transparent`, background: "transparent", color: C.dim,
                          }}>✕</button>
                      )}
                    </div>

                    {isEditing && (
                      <form onSubmit={handleSaveItem} style={{
                        display: "grid", gap: 6,
                        padding: "8px 10px", marginTop: 2,
                        borderRadius: 6, border: `1px solid ${C.border}`,
                        background: C.panel2,
                      }}>
                        <div>
                          <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 3, fontWeight: 700 }}>
                            Nombre del ítem
                          </div>
                          <input value={editDescription} onChange={e => setEditDescription(e.target.value)}
                            placeholder="Ej: bisagra de inox pequeña"
                            style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, fontWeight: 600 }} />
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 3, fontWeight: 700 }}>
                              Cantidad
                            </div>
                            <input value={editQuantity} onChange={e => setEditQuantity(e.target.value)}
                              placeholder="12"
                              style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
                          </div>
                          <div style={{ width: 130 }}>
                            <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 3, fontWeight: 700 }}>
                              Unidad
                            </div>
                            <input value={editUnit} onChange={e => setEditUnit(e.target.value)}
                              placeholder="unidad" list="item-units"
                              style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
                            <datalist id="item-units">
                              {["unidad", "kg", "metro", "pies", "m²", "litro", "lata", "rollo", "par", "juego", "caja", "tubo", "bolsa"].map(u => <option key={u} value={u} />)}
                            </datalist>
                          </div>
                        </div>
                        <div>
                          <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 3, fontWeight: 700 }}>
                            Enlace / Link
                          </div>
                          <input value={editLinkUrl} onChange={e => setEditLinkUrl(e.target.value)}
                            placeholder="https://ejemplo.com/producto"
                            style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
                        </div>
                        <div>
                          <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 3, fontWeight: 700 }}>
                            Foto del producto
                          </div>
                          <label style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "6px 8px", borderRadius: 5, border: `1px dashed ${C.border}`,
                            background: C.bg, cursor: "pointer", fontSize: 13, color: C.dim,
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                            {editImageFile ? editImageFile.name : isHttpUrl(item.image_url) ? "Reemplazar foto" : "Subir foto"}
                            <input type="file" accept="image/*" onChange={e => setEditImageFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
                            {isHttpUrl(item.image_url) && !editImageFile && (
                              <img src={item.image_url} loading="lazy" alt="" style={{ height: 28, borderRadius: 4, marginLeft: "auto" }} />
                            )}
                            {editImageFile && (
                              <span style={{ marginLeft: "auto", color: C.green, fontSize: 11 }}>✓</span>
                            )}
                          </label>
                        </div>
                        <div>
                          <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 3, fontWeight: 700 }}>
                            Notas
                          </div>
                          <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                            placeholder="Notas u observaciones del ítem"
                            rows={2}
                            style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, resize: "vertical" }} />
                        </div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button type="submit" style={{
                            padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 12,
                            border: `1px solid ${C.blue}`, background: "rgba(59,130,246,0.15)", color: C.blue, fontWeight: 600,
                          }}>Guardar</button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>

            {request.status === "recibido" && (
              <div style={{
                marginBottom: 20,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                background: C.panel,
                overflow: "hidden",
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 11px",
                  borderBottom: `1px solid ${C.border}`,
                  background: C.panel2,
                  color: C.green,
                  fontSize: 12,
                  fontWeight: 850,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}>
                  <CheckCircle2 size={14} />
                  Ingresos generados
                  <span style={{ marginLeft: "auto", color: C.dim, fontFamily: C.mono, fontSize: 11 }}>
                    {generatedMovements.length}
                  </span>
                </div>
                {generatedMovements.length === 0 ? (
                  <div style={{ padding: 12, color: C.dim, fontSize: 13 }}>
                    No hay ingresos automáticos registrados para este pedido.
                  </div>
                ) : (
                  <div style={{ display: "grid" }}>
                    {generatedMovements.map((mv) => (
                      <div
                        key={mv.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) auto",
                          gap: 10,
                          padding: "9px 11px",
                          borderTop: `1px solid ${C.border}`,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: C.text, fontSize: 13, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {mv.laminacion_materiales?.nombre || "Material de laminación"}
                          </div>
                          <div style={{ color: C.dim, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {mv.obra || "Sin obra"} · {mv.proveedor || "Sin proveedor"} · {mv.fecha ? new Date(`${mv.fecha}T00:00:00`).toLocaleDateString("es-AR") : "Sin fecha"}
                          </div>
                        </div>
                        <div style={{ color: C.green, fontFamily: C.mono, fontSize: 12, fontWeight: 850, whiteSpace: "nowrap" }}>
                          +{mv.cantidad} {mv.laminacion_materiales?.unidad || ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {comments.length === 0 ? (
              <div style={{
                height: "100%",
                minHeight: 180,
                display: "grid",
                placeItems: "center",
                color: C.dim,
                border: `1px dashed ${C.border}`,
                borderRadius: 10,
                background: "rgba(255,255,255,0.012)",
                fontSize: 13,
                padding: 24,
                textAlign: "center",
              }}>
                <div style={{ display: "grid", justifyItems: "center", gap: 8 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    display: "grid", placeItems: "center",
                    background: "rgba(96,165,250,0.08)",
                    border: "1px solid rgba(96,165,250,0.18)",
                    color: C.blue,
                  }}>
                    <MessageSquare size={16} />
                  </div>
                  <div style={{ color: C.muted, fontWeight: 700, fontSize: 13 }}>Sin mensajes todavía</div>
                  <div style={{ fontSize: 12, color: C.dim, maxWidth: 280 }}>
                    Pedile precisiones a compras o etiquetá con <span style={{ color: C.amber, fontFamily: C.mono }}>@usuario</span> para sumar a alguien.
                  </div>
                </div>
              </div>
            ) : (
              comments.map((comment) => {
                const isMine = comment.author_id === profile?.id;
                return (
                  <div key={comment.id} className="pr-message" style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: 12 }}>
                    <div style={{
                      width: "min(640px, 86%)",
                      borderRadius: 10,
                      border: `1px solid ${isMine ? "rgba(96,165,250,0.22)" : C.border}`,
                      background: isMine ? "rgba(96,165,250,0.07)" : C.panel,
                      padding: "10px 13px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          background: isMine ? "rgba(96,165,250,0.2)" : C.panel2,
                          color: isMine ? C.blue : C.muted,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 10,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}>
                          {usernameOf(comment.author).slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{usernameOf(comment.author)}</span>
                        <span style={{ color: C.dim, fontSize: 11, marginLeft: "auto" }}>{fmtDateTime(comment.created_at)}</span>
                        {(comment.mentions || []).length > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.amber, fontSize: 11 }}>
                            <Users size={11} /> {comment.mentions.length}
                          </span>
                        )}
                      </div>
                      <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                        {comment.body}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={sendComment}
            style={{
              borderTop: `1px solid ${C.border}`,
              padding: 12,
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 10,
              background: C.topbarSoft,
            }}
          >
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  sendComment(e);
                }
              }}
              placeholder="Escribir mensaje o mencionar con @usuario · Ctrl+Enter para enviar"
              rows={3}
              style={{ ...inputStyle, resize: "none", lineHeight: 1.4 }}
            />
            <button
              type="submit"
              disabled={sending || !message.trim()}
              title="Enviar"
              style={{
                ...iconButtonStyle,
                width: 44,
                height: "100%",
                color: sending || !message.trim() ? C.dim : C.blue,
                opacity: sending || !message.trim() ? 0.45 : 1,
              }}
            >
              <Send size={17} />
            </button>
          </form>
        </section>

        {/* Mobile: botón para mostrar/ocultar el panel lateral (involucrados/copia) */}
        {isMobile && (
          <button
            type="button"
            onClick={() => setShowSideMobile((v) => !v)}
            style={{
              width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "12px 16px",
              border: "none",
              borderTop: `1px solid ${C.border}`,
              background: C.topbarSoft,
              color: C.muted,
              fontSize: 13, fontWeight: 700, fontFamily: C.sans,
              cursor: "pointer",
            }}
          >
            <Users size={14} />
            {showSideMobile ? "Ocultar involucrados y copia" : "Ver involucrados y copia"}
            {(followers.length > 0) && (
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>· {followers.length + 1}</span>
            )}
          </button>
        )}

        <aside className="pr-aside" style={{
          minHeight: 0,
          overflowY: "auto",
          padding: isMobile ? "12px" : 14,
          display: isMobile && !showSideMobile ? "none" : "grid",
          gap: 16,
          alignContent: "start",
          borderTop: isMobile ? `1px solid ${C.border}` : "none",
        }}>
          {error && (
            <div style={{ color: "#fca5a5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", padding: 10, borderRadius: 8, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.muted, fontSize: 12, fontWeight: 750, marginBottom: 10, letterSpacing: 0.5 }}>
              <Users size={13} /> Involucrados
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <PersonChip user={request.creator} tone="creator" />
              {request.assignee && <PersonChip user={request.assignee} tone="buyer" />}
              {followers.map((item) => (
                <PersonChip
                  key={item.user_id}
                  user={item.profile}
                  onRemove={manager || profile?.id === request.created_by ? () => handleRemoveFollower(item.user_id) : null}
                />
              ))}
            </div>
            {myFollower && (
              <div style={{
                marginTop: 10,
                border: `1px solid ${followerWaEnabled ? C.green + "55" : C.border}`,
                background: followerWaEnabled ? `${C.green}12` : C.panel,
                borderRadius: 9,
                padding: 10,
                display: "grid",
                gap: 8,
              }}>
                <button
                  type="button"
                  onClick={handleToggleFollowerWhatsapp}
                  disabled={savingFollowerWa}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    border: `1px solid ${followerWaEnabled ? C.green + "66" : C.blue + "55"}`,
                    background: followerWaEnabled ? C.green : C.panelSolid,
                    color: followerWaEnabled ? C.bg : C.blue,
                    borderRadius: 8,
                    padding: "8px 10px",
                    cursor: savingFollowerWa ? "default" : "pointer",
                    opacity: savingFollowerWa ? 0.65 : 1,
                    fontSize: 12,
                    fontWeight: 800,
                    fontFamily: C.sans,
                  }}
                >
                  {followerWaEnabled ? <BellOff size={13} /> : <Bell size={13} />}
                  {savingFollowerWa
                    ? "Guardando..."
                    : followerWaEnabled
                      ? "No avisarme por WhatsApp"
                      : "Notificarme por WhatsApp"}
                </button>
                <div style={{ color: followerWaEnabled ? C.green : C.dim, fontSize: 11, lineHeight: 1.35 }}>
                  {followerWaEnabled
                    ? "El bot te avisa cuando compras actualice este pedido."
                    : "Si tenes el bot vinculado, vas a recibir cambios de estado, mensajes e items."}
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: 10, border: `1px solid ${C.border}`, borderRadius: 9, background: C.panel }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.muted, fontSize: 12, fontWeight: 750, marginBottom: 9 }}>
              <UserPlus size={13} /> Agregar en copia
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <select value={newFollowerId} onChange={(e) => setNewFollowerId(e.target.value)} style={inputStyle}>
                <option value="">Seleccionar usuario</option>
                {availableFollowers.map((user) => (
                  <option key={user.id} value={user.id}>{usernameOf(user)} ({user.role})</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddFollower}
                disabled={!newFollowerId}
                style={{
                  border: `1px solid ${newFollowerId ? C.border2 : C.border}`,
                  background: newFollowerId ? C.panel2 : "transparent",
                  color: newFollowerId ? C.text : C.dim,
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: newFollowerId ? "pointer" : "default",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: C.sans,
                  transition: "all .13s",
                }}
              >
                Sumar al pedido
              </button>
            </div>
          </div>

          <div style={{ padding: 10, border: `1px solid ${C.border}`, borderRadius: 9, background: C.panel, display: "grid", gap: 8 }}>
            <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 750, marginBottom: 2 }}>
              Detalles
            </div>
            <MetaRow icon={<CheckCircle2 size={12} />} label="Estado">
              <span style={{ color: statusColors[request.status] || C.muted, fontWeight: 700 }}>
                {REQUEST_STATUSES.find((s) => s.value === request.status)?.label || request.status}
              </span>
            </MetaRow>
            <MetaRow icon={<Paperclip size={12} />} label="Prioridad">
              <span style={{ color: priorityColors[request.priority] || C.muted, fontWeight: 700 }}>
                {REQUEST_PRIORITIES.find((p) => p.value === request.priority)?.label || request.priority}
              </span>
            </MetaRow>
            {request.proveedor && (
              <MetaRow icon={<Users size={12} />} label="Proveedor">
                <span style={{ color: C.blue, fontWeight: 700 }}>{request.proveedor}</span>
              </MetaRow>
            )}
            {request.estimated_amount !== null && (
              <MetaRow icon={<Paperclip size={12} />} label="Cotizado">
                <span style={{ color: C.amber, fontWeight: 700, fontFamily: C.mono }}>
                  ${Number(request.estimated_amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </MetaRow>
            )}
            {request.actual_amount !== null && (
              <MetaRow icon={<Paperclip size={12} />} label="Real">
                <span style={{
                  color: (request.estimated_amount !== null && request.actual_amount > request.estimated_amount) ? C.red : C.green,
                  fontWeight: 700,
                  fontFamily: C.mono,
                }}>
                  ${Number(request.actual_amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </MetaRow>
            )}
            {request.estimated_delivery_at && (
              <MetaRow icon={<Clock size={12} />} label="Entrega est.">
                <span style={{
                  color: !["recibido", "cancelado"].includes(request.status) && new Date(request.estimated_delivery_at) < new Date() ? C.red : C.text,
                  fontWeight: 600,
                  fontFamily: C.mono,
                  fontSize: 12,
                }}>
                  {new Date(request.estimated_delivery_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  {!["recibido", "cancelado"].includes(request.status) && new Date(request.estimated_delivery_at) < new Date() && " ⚠"}
                </span>
              </MetaRow>
            )}
            {request.delivered_at && (
              <MetaRow icon={<CheckCircle2 size={12} />} label="Recibido">
                <span style={{ color: C.green, fontWeight: 700, fontFamily: C.mono, fontSize: 12 }}>
                  {new Date(request.delivered_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </span>
              </MetaRow>
            )}
            <MetaRow icon={<ImageIcon size={12} />} label="Foto">
              {(request.photo_urls?.length || request.photo_url)
                ? <a href={(request.photo_urls?.[0]) || request.photo_url} target="_blank" rel="noreferrer" style={{ color: C.blue, fontSize: 12, textDecoration: "none" }}>
                    {request.photo_urls?.length > 1 ? `Ver ${request.photo_urls.length} adjuntos` : "Ver adjunto"}
                  </a>
                : <span style={{ color: C.dim }}>Sin adjunto</span>
              }
            </MetaRow>
            {request.needed_at && (
              <MetaRow icon={<Clock size={12} />} label="Necesario">
                <span style={{ color: C.amber, fontWeight: 600 }}>
                  {new Date(request.needed_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </span>
              </MetaRow>
            )}
            {(request.project?.codigo || request.destino) && (
              <MetaRow icon={<Paperclip size={12} />} label={request.project?.codigo ? "Proyecto" : "Destino"}>
                <span style={{ color: C.text, fontFamily: C.mono, fontSize: 12 }}>{request.project?.codigo || request.destino}</span>
              </MetaRow>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function MetaRow({ icon, label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13 }}>
      <span style={{ color: C.dim, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: C.dim, minWidth: 60 }}>{label}</span>
      <span style={{ marginLeft: "auto" }}>{children}</span>
    </div>
  );
}
