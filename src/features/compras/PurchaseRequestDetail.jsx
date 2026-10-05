import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Copy,
  File,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Send,
  Trash2,
  UserPlus,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { supabase } from "@/supabaseClient";
import PortalProveedorActividad from "./PortalProveedorActividad";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import Cargando from "@/components/ui/Cargando";
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
  COMMENT_ATTACHMENT_MAX_COUNT,
  normalizeCommentAttachments,
  normalizePurchaseRequestAttachments,
  uploadRequestCommentAttachments,
  validatePurchaseAttachment,
  usernameOf,
} from "@/features/compras/purchaseRequestsApi";
import { printPurchaseRequest } from "@/features/compras/printPurchaseRequest";
import { ordenLineasDesdePedido, supplierPurchaseLines } from "@/features/materiales/proveedorPedido";
import CopiarOcProveedor from "@/components/CopiarOcProveedor";
import logoK from "@/assets/logos/logo-k.png";
import { useResponsive } from "@/hooks/useResponsive";
import {
  ITEM_TONOS,
  ORIGENES,
  PRIORIDADES,
  RECORRIDO,
  UNIDADES,
  diasDesde,
  estadoDe,
  fmtFecha,
  fmtFechaHora,
  fmtPesos,
  prioridadDe,
} from "./modulo";
import { Avatar, Aviso, Modal, Tag, Vacio } from "./ui";

// Solo tratamos como enlace/imagen lo que sea una URL http(s) absoluta y válida.
// Evita que un valor basura (path relativo inventado por el bot) navegue el SPA al menú.
const isHttpUrl = (u) => {
  if (typeof u !== "string") return false;
  try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:"; }
  catch { return false; }
};

function htmlToText(value) {
  const raw = String(value || "");
  if (!raw) return "";
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function copyPlainText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function attachmentExtension(attachment) {
  const name = String(attachment?.name || attachment?.path || attachment?.url || "");
  const cleanName = name.split("?")[0].split("#")[0];
  const part = cleanName.includes(".") ? cleanName.split(".").pop() : "";
  return String(part || "").toLowerCase().slice(0, 8);
}

function isImageAttachment(attachment) {
  if (String(attachment?.type || "").toLowerCase().startsWith("image/")) return true;
  return ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"].includes(attachmentExtension(attachment));
}

function isImageFile(file) {
  return isImageAttachment({ name: file?.name, type: file?.type });
}

function fmtFileSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function AttachmentTypeIcon({ attachment, size = 18 }) {
  const ext = attachmentExtension(attachment);
  if (isImageAttachment(attachment)) return <ImageIcon size={size} />;
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return <FileSpreadsheet size={size} />;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return <FileArchive size={size} />;
  if (["pdf", "doc", "docx", "txt", "rtf"].includes(ext)) return <FileText size={size} />;
  return <File size={size} />;
}

function AttachmentCard({ attachment, onOpenImage }) {
  const [downloading, setDownloading] = useState(false);
  if (!isHttpUrl(attachment?.url)) return null;

  const name = attachment.name || `Archivo.${attachmentExtension(attachment) || "adjunto"}`;
  const ext = attachmentExtension(attachment);
  const size = fmtFileSize(attachment.size);

  async function downloadAttachment() {
    if (downloading) return;
    setDownloading(true);
    try {
      // El atributo `download` se ignora en enlaces de otro dominio (el bucket
      // de Supabase) y Windows termina usando el UUID del objeto. Bajamos el
      // blob y generamos un enlace local para conservar el nombre del archivo
      // con el que fue adjuntado al pedido.
      let blob = null;
      if (attachment.path) {
        const { data, error } = await supabase.storage
          .from("purchase-request-photos")
          .download(attachment.path);
        if (error) throw error;
        blob = data;
      } else {
        const response = await fetch(attachment.url);
        if (!response.ok) throw new Error("No se pudo descargar el archivo.");
        blob = await response.blob();
      }
      if (!blob) throw new Error("El archivo descargado está vacío.");

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = name;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch {
      // Mantiene una salida para adjuntos históricos cuya ruta ya no se puede
      // leer con el SDK, sin bloquear el acceso al documento.
      window.open(attachment.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  if (isImageAttachment(attachment)) {
    return (
      <button type="button" className="cmp-adj-img" onClick={() => onOpenImage?.(attachment)} title={`Ampliar ${name}`}>
        <img src={attachment.url} alt={name} loading="lazy" />
        <span>{name}</span>
      </button>
    );
  }

  return (
    <button type="button" className="cmp-adj" onClick={downloadAttachment} disabled={downloading} title={`Descargar ${name}`}>
      <span className="ic"><AttachmentTypeIcon attachment={attachment} size={16} /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="nom">{name}</span>
        <span className="det">{[ext || "archivo", size].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="bajar">{downloading ? "Bajando…" : "Descargar"}</span>
    </button>
  );
}

function ChatImageViewer({ attachment, onClose }) {
  useEffect(() => {
    if (!attachment) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [attachment, onClose]);

  if (!attachment) return null;
  return (
    <div className="cmp-visor" role="dialog" aria-modal="true" aria-label={`Imagen adjunta: ${attachment.name}`} onClick={onClose}>
      <button type="button" className="cmp-btn-ic cerrar" onClick={onClose} aria-label="Cerrar imagen" title="Cerrar"><X size={19} /></button>
      <div onClick={(event) => event.stopPropagation()} style={{ display: "grid", gap: 9, justifyItems: "center", maxWidth: "96vw" }}>
        <img src={attachment.url} alt={attachment.name || "Imagen adjunta"} />
        <div style={{ color: "var(--muted)", fontSize: 12 }}>{attachment.name || "Imagen adjunta"}</div>
      </div>
    </div>
  );
}

// El recorrido del pedido en grande. Para Compras cada paso es un botón que
// cambia el estado; para quien pidió es sólo lectura: dónde está su pedido.
function PasosPedido({ status, onCambiar, deshabilitado }) {
  const actual = RECORRIDO.findIndex((e) => e.value === status);
  const cancelado = status === "cancelado";
  const tono = estadoDe(status).tono;
  return (
    <div className={`cmp-pasos${cancelado ? " cancelado" : ""}`} data-tono={tono} role={onCambiar ? "radiogroup" : "list"} aria-label="Estado del pedido">
      {RECORRIDO.map((paso, i) => {
        const Icon = paso.Icon;
        const clase = `cmp-pasito${!cancelado && i < actual ? " hecho" : ""}${!cancelado && i === actual ? " actual" : ""}${!cancelado && i <= actual ? " pintado" : ""}`;
        const contenido = (
          <>
            <span className="bola"><Icon size={15} strokeWidth={2.3} /></span>
            <span className="nom">{paso.corto || paso.label}</span>
          </>
        );
        return onCambiar ? (
          <button
            key={paso.value}
            type="button"
            role="radio"
            aria-checked={i === actual}
            className={clase}
            disabled={deshabilitado || i === actual}
            title={`Pasar a ${paso.label}: ${paso.ayuda}`}
            onClick={() => onCambiar(paso.value)}
          >
            {contenido}
          </button>
        ) : (
          <div key={paso.value} role="listitem" className={clase} aria-current={i === actual ? "step" : undefined}>{contenido}</div>
        );
      })}
    </div>
  );
}

function Dato({ etiqueta, children, tono, mono = false }) {
  return (
    <div className="cmp-dato">
      <span>{etiqueta}</span>
      <span className={`v${mono ? " mono" : ""}`} data-tono={tono}>{children}</span>
    </div>
  );
}

function PersonaFila({ user, rol, tono = "neutro", onQuitar }) {
  const nombre = usernameOf(user);
  return (
    <div className="cmp-persona-fila">
      <Avatar nombre={nombre} tono={tono} grande />
      <span style={{ minWidth: 0 }}>
        <b>{nombre}</b>
        <small>{rol}</small>
      </span>
      {onQuitar && (
        <button type="button" className="cmp-btn-ic chico peligro" onClick={onQuitar} title="Quitar de la copia" aria-label={`Quitar a ${nombre} de la copia`}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

export default function PurchaseRequestDetail({ requestId, profile, users = [], onBack, onRequestUpdated, onDeleteLocal }) {
  const { isMobile } = useResponsive();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Distinto de `error`: la solicitud no está, y eso no es una falla que haya
  // que reportar como tal. Pasa con los links de avisos viejos.
  const [noExiste, setNoExiste] = useState(false);
  const [message, setMessage] = useState("");
  const [commentFiles, setCommentFiles] = useState([]);
  const [openChatImage, setOpenChatImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [newFollowerId, setNewFollowerId] = useState("");
  const [items, setItems] = useState([]);
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
  const [editSupplierDescription, setEditSupplierDescription] = useState("");
  const [editSupplierCode, setEditSupplierCode] = useState("");
  /**
   * Diálogo de costos y entrega. Cuando el pedido ya se compró y falta el
   * importe real, el lateral lo dice en cian: `actual_amount` vacío es lo que
   * deja en cero el gasto mensual del tablero.
   */
  const [costosOpen, setCostosOpen] = useState(false);
  const [panolModal, setPanolModal] = useState(false);
  const [enviosPanol, setEnviosPanol] = useState([]); // envíos a pañol vinculados a este pedido
  const [savingFollowerWa, setSavingFollowerWa] = useState(false);
  const bottomRef = useRef(null);
  const previousCommentCountRef = useRef(null);
  const commentFileRef = useRef(null);
  const commentFilesRef = useRef([]);
  const reloadTimer = useRef(null);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    commentFilesRef.current = commentFiles;
  }, [commentFiles]);

  useEffect(() => () => {
    commentFilesRef.current.forEach((item) => {
      if (item.preview) URL.revokeObjectURL(item.preview);
    });
  }, []);

  const manager = isPurchaseManager(profile);
  // Ya se compró y no se anotó cuánto salió: es lo que falta hacer en esta
  // pantalla, y es la razón por la que el gasto del tablero da cero.
  const faltaImporte = ["comprado", "recibido"].includes(request?.status)
    && request?.actual_amount == null;
  const requestAttachments = useMemo(
    () => normalizePurchaseRequestAttachments(request || {}),
    [request],
  );
  const itemsParaPanol = useMemo(
    () => items.filter((it) => !["en_panol", "recibido", "cancelado"].includes(it.status)),
    [items]
  );
  // Renglones para la OC que se le manda al proveedor: van con su denominación
  // y su código, sin nada del circuito interno.
  const lineasOcProveedor = useMemo(
    () => ordenLineasDesdePedido(items, { proveedorPorDefecto: request?.proveedor || "" }),
    [items, request?.proveedor],
  );
  const canSendToPanol = manager && request?.status === "comprado" && itemsParaPanol.length > 0;
  const panolPrefill = useMemo(() => {
    if (!request) return null;
    return {
      titulo: request.title,
      origen: "compra",
      purchaseRequestId: request.id,
      obraId: request.project_id || null,
      items: itemsParaPanol.map((it) => ({
        descripcion: it.description,
        codigo: it.codigo || it.code || "",
        cantidad: it.quantity,
        unidad: it.unit,
        material_id: it.material_id || "",
        requisito_material_id: it.requisito_material_id || it.material_id || "",
        purchase_request_item_id: it.id,
      })),
    };
  }, [request, itemsParaPanol]);
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
  const safeDescriptionHtml = useMemo(
    // El editor guarda los espacios como &nbsp;: con eso el renglón no tiene dónde
    // cortar y el navegador partía las palabras por la mitad ("p / ara").
    () => DOMPurify.sanitize(String(request?.description ?? ""), { USE_PROFILES: { html: true } }).replace(/&nbsp;|\u00a0/g, " "),
    [request?.description],
  );

  useEffect(() => {
    setDescriptionOpen(false);
  }, [requestId]);

  async function load() {
    if (!requestId) return;
    setError("");
    setLoading(true);
    try {
      const [data, itemsData, enviosData, waPreference] = await Promise.all([
        fetchPurchaseRequestDetail(requestId),
        fetchRequestItems(requestId),
        fetchEnviosDePedido(requestId).catch(() => []),
        fetchRequestFollowerWhatsappPreference(requestId).catch(() => null),
      ]);
      // Un link de un aviso puede apuntar a un pedido que ya borraron, o a uno
      // que RLS no deja ver a quien abrió el mail. Los dos llegan igual -sin
      // fila- y hay que contarlo, no tirarle el error de la base por la cara.
      if (!data) {
        setRequest(null);
        setNoExiste(true);
        return;
      }
      setNoExiste(false);

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
      setEnviosPanol(enviosData);
    } catch (err) {
      setError(err.message || "No se pudo cargar la solicitud.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    previousCommentCountRef.current = null;
    load();
  }, [requestId]);

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

  // Se cuenta recién con el pedido cargado: si no, el primer valor era 0 (mientras
  // cargaba) y al abrir saltaba siempre hasta el final de la conversación.
  const cantidadComentarios = request ? (request.comments?.length ?? 0) : null;
  useEffect(() => {
    if (cantidadComentarios == null) return;
    const nextCount = cantidadComentarios;
    if (previousCommentCountRef.current === null) {
      previousCommentCountRef.current = nextCount;
      return;
    }
    if (nextCount > previousCommentCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    previousCommentCountRef.current = nextCount;
  }, [cantidadComentarios]);

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

          // "Recibido" en Compras es únicamente un estado comercial.
          // El ingreso físico y el stock de laminación se registran exclusivamente
          // desde el panel de Laminación, donde se confirma la cantidad realmente recibida.
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

  function buildCopyText() {
    const lines = [];
    const priorityLabel = REQUEST_PRIORITIES.find((p) => p.value === request.priority)?.label || request.priority;
    const statusLabel = REQUEST_STATUSES.find((s) => s.value === request.status)?.label || request.status;
    const destino = request.project?.codigo || request.destino || "";
    const description = htmlToText(request.description);

    lines.push(`Pedido: ${request.title || "Sin titulo"}`);
    if (destino) lines.push(`Destino/obra: ${destino}`);
    if (priorityLabel) lines.push(`Prioridad: ${priorityLabel}`);
    if (statusLabel) lines.push(`Estado: ${statusLabel}`);
    if (request.needed_at) {
      lines.push(`Necesario para: ${new Date(request.needed_at).toLocaleDateString("es-AR")}`);
    }
    if (description && items.length === 0) {
      lines.push("");
      lines.push("Descripcion:");
      lines.push(description);
    }

    lines.push("");
    lines.push(`Items (${items.length}):`);
    if (!items.length) {
      lines.push("- Sin items cargados.");
    } else {
      let lineNumber = 0;
      items.forEach((item) => {
        supplierPurchaseLines(item).forEach((line) => {
          lineNumber += 1;
          const qty = line.quantity ? [line.quantity, line.unit].filter(Boolean).join(" ").trim() : "";
          const suffix = qty ? ` - ${qty}` : "";
          const code = line.code ? ` (${line.code})` : "";
          lines.push(`${lineNumber}. ${line.description}${code}${suffix}`);
        });
        if (item.destination) lines.push(`   Destino: ${item.destination}`);
        if (item.notes) lines.push(`   Nota: ${item.notes}`);
        if (isHttpUrl(item.link_url)) lines.push(`   Link: ${item.link_url}`);
        if (isHttpUrl(item.image_url)) lines.push(`   Foto: ${item.image_url}`);
      });
    }

    return lines.join("\n").trim();
  }

  async function handleCopyPurchaseText() {
    try {
      await copyPlainText(buildCopyText());
      toast.success(items.length > 0
        ? `Pedido copiado con ${items.length} items.`
        : "Pedido copiado.");
    } catch {
      toast.error("No se pudo copiar el pedido.");
    }
  }

  async function sendComment(e) {
    e.preventDefault();
    if (!message.trim() && !commentFiles.length) return;
    setSending(true);
    setError("");
    try {
      const body = message.trim();
      const attachments = await uploadRequestCommentAttachments(
        request.id,
        commentFiles.map((item) => item.file),
        profile?.id,
      );
      await addRequestComment(request.id, body, users, attachments);
      const notificationBody = body || `${attachments.length} archivo${attachments.length === 1 ? "" : "s"} adjunto${attachments.length === 1 ? "" : "s"}`;
      notifyComprasEmail({
        type: "new_message",
        requestId: request.id,
        requestTitle: request.title,
        changedBy: profile?.id,
        createdByName: profile?.username || "Usuario",
        message: notificationBody,
      });
      notifyWaUpdate({
        requestId: request.id,
        eventType: "comment",
        actorId: profile?.id,
        payload: { body: notificationBody, attachmentCount: attachments.length, actorName: profile?.username || "Usuario" },
      });
      setMessage("");
      commentFiles.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview);
      });
      setCommentFiles([]);
      await load();
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  function addCommentFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) {
      toast.error("Seleccioná al menos un archivo.");
      return;
    }

    try {
      incoming.forEach(validatePurchaseAttachment);
    } catch (validationError) {
      toast.error(validationError.message);
      return;
    }

    const existingKeys = new Set(commentFiles.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
    const uniqueIncoming = incoming.filter((file) => !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`));
    const available = Math.max(0, COMMENT_ATTACHMENT_MAX_COUNT - commentFiles.length);
    if (!available) {
      toast.error(`Podés adjuntar hasta ${COMMENT_ATTACHMENT_MAX_COUNT} archivos por mensaje.`);
      return;
    }
    if (uniqueIncoming.length > available) {
      toast.info(`Se agregaron ${available} archivos; el máximo por mensaje es ${COMMENT_ATTACHMENT_MAX_COUNT}.`);
    }
    const selected = uniqueIncoming.slice(0, available).map((file) => ({
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      file,
      preview: isImageFile(file) ? URL.createObjectURL(file) : "",
    }));
    setCommentFiles((current) => [...current, ...selected]);
  }

  function removeCommentFile(id) {
    setCommentFiles((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return current.filter((item) => item.id !== id);
    });
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
    setEditSupplierDescription(item.supplier_description || "");
    setEditSupplierCode(item.supplier_code || "");
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
        supplier_description: editSupplierDescription.trim() || null,
        supplier_code: editSupplierCode.trim() || null,
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
      <div className="cmp-det">
        <div className="cmp-det-cab">
          <div className="cmp-det-l1">
            <button type="button" className="cmp-btn-ic" onClick={onBack} aria-label="Volver"><ArrowLeft size={16} /></button>
          </div>
        </div>
        <Cargando llenar texto="Abriendo el pedido…" />
      </div>
    );
  }

  if (noExiste) {
    return (
      <div className="cmp-det">
        <div className="cmp-det-cab">
          <div className="cmp-det-l1">
            <button type="button" className="cmp-btn-ic" onClick={onBack} aria-label="Volver"><ArrowLeft size={16} /></button>
          </div>
        </div>
        <Vacio
          icono={FileText}
          titulo="No encontramos este pedido"
          texto="Puede que lo hayan borrado después de que te llegó el aviso, o que no tengas permiso para verlo. Si creés que deberías verlo, pedile a Compras que te sume en copia."
        >
          <button type="button" className="ui-btn ui-btn-suave" onClick={onBack}><ArrowLeft size={15} /> Volver a Compras</button>
        </Vacio>
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="cmp-det">
        <div className="cmp-det-cab">
          <div className="cmp-det-l1">
            <button type="button" className="cmp-btn-ic" onClick={onBack} aria-label="Volver"><ArrowLeft size={16} /></button>
          </div>
        </div>
        <div style={{ padding: 20 }}><Aviso tono="rojo">{error}</Aviso></div>
      </div>
    );
  }

  const comments = request?.comments || [];
  const followers = request?.followers || [];
  const estado = estadoDe(request.status);
  const prioridad = prioridadDe(request.priority);
  const origen = ORIGENES[request.source];
  const destino = request.project?.codigo || request.destino || "";
  const cerrado = ["recibido", "cancelado"].includes(request.status);
  const entregaVencida = request.estimated_delivery_at && !cerrado && diasDesde(request.estimated_delivery_at) > 0;
  const necesarioVencido = request.needed_at && !cerrado && diasDesde(request.needed_at) > 0;
  const conCostos = manager && ["cotizando", "comprado", "recibido"].includes(request.status);
  const pendientesItems = items.filter((it) => !["recibido", "cancelado"].includes(it.status)).length;

  async function cambiarEstado(status) {
    if (status === "recibido") {
      const pend = items.filter((it) => !["recibido", "cancelado"].includes(it.status));
      if (pend.length) {
        const ok = await confirm({
          title: "Ítems sin recibir",
          message: `Este pedido todavía tiene ${pend.length} ítem${pend.length === 1 ? "" : "s"} sin recibir. ¿Marcar el pedido como Recibido igual?`,
          confirmLabel: "Marcar recibido igual",
          tone: "danger",
        });
        if (!ok) return;
      }
    }
    if (status === "cancelado") {
      const ok = await confirm({
        title: "Cancelar el pedido",
        message: `«${request.title}» pasa a Cancelado y sale de los abiertos. Se avisa a quien lo pidió. Se puede reabrir después.`,
        confirmLabel: "Cancelar pedido",
        cancelLabel: "Volver",
        tone: "danger",
      });
      if (!ok) return;
    }
    patchRequest({ status });
  }

  async function eliminarPedido() {
    const ok = await confirm({
      title: "Eliminar pedido",
      message: `Vas a eliminar «${request.title}». Se borran también sus ítems, mensajes y copias.`,
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
  }

  // Campo que se guarda al salir (onBlur), como siempre: el valor se escribe en
  // el estado local y recién al soltar el campo se manda a la base.
  const campo = (key, { tipo = "text", aNumero = false, aFechaISO = false, placeholder = "" } = {}) => ({
    ...(tipo === "textarea" ? {} : { type: tipo }),
    className: `ui-input${tipo === "number" ? " num" : ""}`,
    placeholder,
    value: aFechaISO ? (request[key] ? String(request[key]).slice(0, 10) : "") : (request[key] ?? ""),
    onChange: (e) => {
      const raw = e.target.value;
      const val = raw === "" ? null : aNumero ? Number(raw) : aFechaISO ? new Date(raw).toISOString() : raw;
      setRequest((prev) => ({ ...prev, [key]: val }));
    },
    onBlur: () => { if (request[key] !== undefined) patchRequest({ [key]: request[key] }); },
  });

  const tieneDescripcion = Boolean(String(request.description || "").replace(/<[^>]*>/g, "").trim());
  const verAvisoPanol = manager || enviosPanol.length > 0;

  return (
    <div className="cmp-det">
      {/* ── Encabezado: qué es, de quién y dónde está ── */}
      <header className="cmp-det-cab">
        <div className="cmp-det-l1">
          <button type="button" className="cmp-btn-ic" onClick={onBack} title="Volver" aria-label="Volver a la lista"><ArrowLeft size={16} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="cmp-det-tit">
              {request.title}
              {request.priority !== "media" && <Tag tono={prioridad.tono}>{prioridad.label}</Tag>}
              {origen && <Tag tono={origen.tono}>{origen.label}</Tag>}
              {request.es_adicional && <Tag tono="verde">Adicional</Tag>}
            </h1>
            <div className="cmp-det-meta">
              {destino && <span className="obra">{destino}</span>}
              <span>Pidió {usernameOf(request.creator)} · {fmtFechaHora(request.created_at)}</span>
              {request.source_ref && <span>#{request.source_ref}</span>}
            </div>
          </div>
          <div className="cmp-det-acc">
            <button type="button" className="cmp-btn-ic" title="Imprimir" aria-label="Imprimir el pedido" onClick={() => printPurchaseRequest({ ...request, items }, logoK)}>
              <Printer size={15} />
            </button>
            {(manager || profile?.id === request.created_by) && (
              <button type="button" className="cmp-btn-ic peligro" title="Eliminar pedido" aria-label="Eliminar pedido" onClick={eliminarPedido}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>

        <div className="cmp-det-recorrido">
          <PasosPedido status={request.status} onCambiar={manager ? cambiarEstado : null} />
          <div className="cmp-det-ahora" data-tono={estado.tono}>
            {request.status === "cancelado" ? (
              <>
                <b>Cancelado.</b> No se va a comprar.
                {manager && <button type="button" className="cmp-link" onClick={() => patchRequest({ status: "nuevo" })}>Reabrir</button>}
              </>
            ) : (
              <>
                <b>{estado.label}:</b> {estado.ayuda.toLowerCase()}.
                {request.needed_at && !cerrado && <> Se necesita para el <b className={necesarioVencido ? "rojo" : ""}>{fmtFecha(request.needed_at)}</b>.</>}
                {request.estimated_delivery_at && !cerrado && <> Entrega estimada <b className={entregaVencida ? "rojo" : ""}>{fmtFecha(request.estimated_delivery_at)}</b>.</>}
                {manager && !cerrado && (
                  <button type="button" className="cmp-link peligro" onClick={() => cambiarEstado("cancelado")}>Cancelar pedido</button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <div className="cmp-det-cuerpo">
        <section className="cmp-det-main">
          <div className="cmp-det-scroll">
            {error && <Aviso tono="rojo" onCerrar={() => setError("")}>{error}</Aviso>}

            {/* Lo que escribió quien pidió, sin un recuadro con título: es el
                mensaje del pedido, no una sección más. */}
            {tieneDescripcion && (
              <div className="cmp-desc">
                <div className={`cmp-html${descriptionIsLong && !descriptionOpen ? " plegada" : ""}`}>
                  {/<[a-z!/][\s\S]*>/i.test(request.description)
                    ? <div dangerouslySetInnerHTML={{ __html: safeDescriptionHtml }} />
                    : <div style={{ whiteSpace: "pre-wrap" }}>{request.description}</div>}
                </div>
                {descriptionIsLong && (
                  <button type="button" className="cmp-link" onClick={() => setDescriptionOpen((v) => !v)}>
                    {descriptionOpen ? "Ver menos" : "Ver todo"}
                  </button>
                )}
              </div>
            )}
            {requestAttachments.length > 0 && (
              <div className="cmp-adjuntos">
                {requestAttachments.map((attachment, index) => (
                  <AttachmentCard key={`${attachment.url}-${index}`} attachment={attachment} onOpenImage={setOpenChatImage} />
                ))}
              </div>
            )}

            {/* ── Ítems: lo que hay que comprar ── */}
            <div className="cmp-det-sec">
              <div className="cmp-det-sec-cab">
                <b>Ítems</b>
                {items.length > 0 && <span className="cmp-grupo-n">{items.length}</span>}
                {items.length > 0 && pendientesItems < items.length && <span className="cmp-ayuda">{items.length - pendientesItems} cerrados</span>}
                <span className="cmp-sp" />
                {manager && <CopiarOcProveedor lineas={lineasOcProveedor} necesarioPara={request.needed_at} label="OC proveedor" iconSize={13} />}
                <button type="button" className="cmp-btn-ic chico" onClick={handleCopyPurchaseText} title="Copiar el pedido completo" aria-label="Copiar el pedido completo"><Copy size={13} /></button>
                {canEditItems && !showAddItem && (
                  <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => setShowAddItem(true)}><Plus size={13} /> Ítem</button>
                )}
              </div>

              {showAddItem && (
                <form onSubmit={handleAddItem} className="cmp-item-alta">
                  <input className="ui-input" autoFocus value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)} placeholder="Qué es (ej.: bisagra inox chica)" aria-label="Descripción del ítem" />
                  <input className="ui-input num" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} placeholder="Cant." aria-label="Cantidad" inputMode="decimal" />
                  <select className="ui-input" value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} aria-label="Unidad">
                    {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <button type="submit" className="ui-btn ui-btn-primario chico" disabled={!newItemDesc.trim()}>Agregar</button>
                  <button type="button" className="cmp-btn-ic chico" onClick={() => { setShowAddItem(false); setNewItemDesc(""); setNewItemQty(""); }} aria-label="Cancelar"><X size={14} /></button>
                </form>
              )}

              {!items.length && !showAddItem ? (
                <p className="cmp-ayuda">{tieneDescripcion ? "Sin ítems cargados: lo que se pide está escrito arriba." : "Este pedido no tiene ítems cargados."}</p>
              ) : (
                <div className="cmp-items-det">
                  {items.map((item) => {
                    const st = ITEM_STATUSES.find((s) => s.value === item.status) || ITEM_STATUSES[0];
                    const tono = ITEM_TONOS[item.status] || "neutro";
                    const isEditing = editingItem?.id === item.id;
                    return (
                      <div key={item.id} className={`cmp-item${isEditing ? " editando" : ""}`}>
                        {canEditItems ? (
                          <select className="ui-input estado" data-tono={tono} value={item.status} onChange={(e) => handleUpdateItemStatus(item, e.target.value)} aria-label={`Estado de ${item.description}`}>
                            {ITEM_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        ) : (
                          <span className="cmp-estado" data-tono={tono}>{st.label}</span>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div className="nom">
                            {item.description}
                            {(item.quantity || item.unit) && <span className="cant">{item.quantity} {item.unit}</span>}
                          </div>
                          {(item.received_quantity || item.supplier_description || item.supplier_code || item.supplier_components?.length > 0 || isHttpUrl(item.image_url) || isHttpUrl(item.link_url) || item.notes || item.catalog_source === "panol") && (
                            <div className="meta">
                              {/* Lo que realmente llegó: sin esto una entrega parcial se veía igual que una completa. */}
                              {item.received_quantity && <span className="cmp-estado" data-tono={tono}>Llegó {item.received_quantity}</span>}
                              {item.catalog_source === "panol" && item.material_id && <span className="cmp-tag" data-tono="teal">Del catálogo</span>}
                              {/* "> 0" y no el largo a secas: supplier_components vale [] por defecto y
                                  {0 && …} React lo dibuja como un "0" suelto. */}
                              {(item.supplier_description || item.supplier_code || item.supplier_components?.length > 0) && (
                                <span className="prov" title="Así se copia e imprime para el proveedor">
                                  Para el proveedor: {item.supplier_description || `${item.supplier_components.length} renglones desglosados`}{item.supplier_code ? ` · ${item.supplier_code}` : ""}
                                </span>
                              )}
                              {isHttpUrl(item.image_url) && <a href={item.image_url} target="_blank" rel="noreferrer"><ImageIcon size={12} /> Foto</a>}
                              {isHttpUrl(item.link_url) && <a href={item.link_url} target="_blank" rel="noreferrer"><Paperclip size={12} /> Enlace</a>}
                              {item.notes && <span className="nota">{item.notes}</span>}
                            </div>
                          )}
                        </div>
                        {canEditItems && (
                          <div className="acc">
                            <button type="button" className="cmp-btn-ic chico" onClick={() => (isEditing ? setEditingItem(null) : startEditItem(item))} title={isEditing ? "Cerrar" : "Editar ítem"} aria-label={isEditing ? "Cerrar edición" : `Editar ${item.description}`}>
                              {isEditing ? <X size={14} /> : <Pencil size={13} />}
                            </button>
                            <button type="button" className="cmp-btn-ic chico peligro" onClick={() => handleDeleteItem(item.id)} title="Eliminar ítem" aria-label={`Eliminar ${item.description}`}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}

                        {isEditing && (
                          <form onSubmit={handleSaveItem} className="cmp-item-editar cmp-form">
                            <label className="cmp-campo c6"><span>Nombre del ítem</span>
                              <input className="ui-input" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Ej.: bisagra de inox chica" />
                            </label>
                            <label className="cmp-campo"><span>Cantidad</span>
                              <input className="ui-input num" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} placeholder="12" />
                            </label>
                            <label className="cmp-campo"><span>Unidad</span>
                              <input className="ui-input" value={editUnit} onChange={(e) => setEditUnit(e.target.value)} placeholder="unidad" list="cmp-unidades" />
                              <datalist id="cmp-unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
                            </label>
                            <label className="cmp-campo c4"><span>Nombre para el proveedor</span>
                              <input className="ui-input" value={editSupplierDescription} onChange={(e) => setEditSupplierDescription(e.target.value)} placeholder="Opcional: se usa al copiar e imprimir" />
                            </label>
                            <label className="cmp-campo c2"><span>Código del proveedor</span>
                              <input className="ui-input num" value={editSupplierCode} onChange={(e) => setEditSupplierCode(e.target.value)} placeholder="Opcional" />
                            </label>
                            <label className="cmp-campo c6"><span>Enlace</span>
                              <input className="ui-input" value={editLinkUrl} onChange={(e) => setEditLinkUrl(e.target.value)} placeholder="https://…" />
                            </label>
                            <label className="cmp-campo c6"><span>Foto del producto</span>
                              <span className="cmp-drop" style={{ padding: "8px 12px" }}>
                                <ImageIcon size={16} />
                                <span style={{ flex: 1, minWidth: 0 }}><b>{editImageFile ? editImageFile.name : isHttpUrl(item.image_url) ? "Reemplazar la foto" : "Subir una foto"}</b></span>
                                {isHttpUrl(item.image_url) && !editImageFile && <img src={item.image_url} loading="lazy" alt="" style={{ height: 30, borderRadius: 5 }} />}
                                <input type="file" accept="image/*" hidden onChange={(e) => setEditImageFile(e.target.files?.[0] || null)} />
                              </span>
                            </label>
                            <label className="cmp-campo c6"><span>Notas</span>
                              <textarea className="ui-input" rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notas u observaciones del ítem" />
                            </label>
                            <div className="cmp-campo c6" style={{ justifyItems: "end" }}>
                              <button type="submit" className="ui-btn ui-btn-primario chico">Guardar ítem</button>
                            </div>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <PortalProveedorActividad requestId={request?.id} />

            {/* ── Conversación ── */}
            <div className="cmp-det-sec">
              <div className="cmp-det-sec-cab">
                <b>Conversación</b>
                {comments.length > 0 && <span className="cmp-grupo-n">{comments.length}</span>}
              </div>
              {comments.length === 0 ? (
                <p className="cmp-ayuda">Todavía no hay mensajes. Preguntá o aclarás lo que haga falta; con <span className="mono">@usuario</span> sumás a alguien.</p>
              ) : (
                <div className="cmp-chat">
                  {comments.map((comment) => {
                    const mio = comment.author_id === profile?.id;
                    const adjuntos = normalizeCommentAttachments(comment.attachments);
                    return (
                      <div key={comment.id} className={`cmp-msg${mio ? " mio" : ""}`}>
                        <div className="cmp-msg-burbuja">
                          <div className="cmp-msg-cab">
                            <Avatar nombre={usernameOf(comment.author)} tono={mio ? "azul" : "neutro"} />
                            <b>{usernameOf(comment.author)}</b>
                            {(comment.mentions || []).length > 0 && <span className="menc"><Users size={11} /> {comment.mentions.length}</span>}
                            <span className="hora">{fmtFechaHora(comment.created_at)}</span>
                          </div>
                          {comment.body && <p>{comment.body}</p>}
                          {adjuntos.length > 0 && (
                            <div className="cmp-adjuntos" style={{ marginTop: comment.body ? 8 : 0 }}>
                              {adjuntos.map((a, index) => <AttachmentCard key={`${a.url}-${index}`} attachment={a} onOpenImage={setOpenChatImage} />)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div ref={bottomRef} />
          </div>

          <form className="cmp-escribir" onSubmit={sendComment}>
            {commentFiles.length > 0 && (
              <div className="cmp-escribir-archivos">
                {commentFiles.map((item) => (
                  <div key={item.id} className={`cmp-escribir-archivo${item.preview ? " foto" : ""}`}>
                    {item.preview ? (
                      <img src={item.preview} alt={item.file.name} />
                    ) : (
                      <>
                        <span style={{ color: "var(--blue)", flexShrink: 0 }}><AttachmentTypeIcon attachment={item.file} size={18} /></span>
                        <span style={{ minWidth: 0 }}>
                          <span className="nom">{item.file.name}</span>
                          <span className="det">{[attachmentExtension(item.file) || "archivo", fmtFileSize(item.file.size)].filter(Boolean).join(" · ")}</span>
                        </span>
                      </>
                    )}
                    <button type="button" className="cmp-btn-ic chico quitar" onClick={() => removeCommentFile(item.id)} aria-label={`Quitar ${item.file.name}`} title="Quitar"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={commentFileRef}
              type="file"
              multiple
              hidden
              onChange={(event) => { addCommentFiles(event.target.files); event.target.value = ""; }}
            />
            <button
              type="button"
              className="cmp-btn-ic"
              onClick={() => commentFileRef.current?.click()}
              disabled={sending || commentFiles.length >= COMMENT_ATTACHMENT_MAX_COUNT}
              aria-label="Adjuntar archivos"
              title="Adjuntar archivos"
            >
              <Paperclip size={17} />
            </button>
            <textarea
              className="ui-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={(event) => {
                const pastedImages = Array.from(event.clipboardData?.files || []).filter((file) => String(file.type || "").startsWith("image/"));
                if (pastedImages.length) {
                  event.preventDefault();
                  addCommentFiles(pastedImages);
                }
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendComment(e); }}
              placeholder={isMobile ? "Escribir un mensaje…" : "Escribir un mensaje o mencionar con @usuario · Ctrl+Enter para enviar"}
              rows={2}
              aria-label="Mensaje"
            />
            <button type="submit" className="ui-btn ui-btn-primario cmp-enviar" disabled={sending || (!message.trim() && !commentFiles.length)} title={sending ? "Enviando…" : "Enviar"} aria-label="Enviar mensaje">
              {sending ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
            </button>
          </form>
        </section>

        {/* ── Lado: datos, costos, pañol y personas ── */}
        <aside className="cmp-det-lado">
          <div className="cmp-lado-card">
            <div className="cmp-lado-tit">Datos del pedido</div>
            <div className="cmp-dato apilado">
              <span>Prioridad</span>
              {canEditPriority ? (
                <div className="cmp-seg chica" role="radiogroup" aria-label="Prioridad">
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      role="radio"
                      aria-checked={request.priority === p.value}
                      className={request.priority === p.value ? "on" : ""}
                      data-tono={request.priority === p.value && p.value !== "media" ? p.tono : undefined}
                      onClick={() => { if (p.value !== request.priority) patchRequest({ priority: p.value }); }}
                      title={p.value === request.priority ? undefined : "El cambio se publica en la conversación y se avisa a Compras"}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : (
                <span><Tag tono={prioridad.tono}>{prioridad.label}</Tag></span>
              )}
            </div>
            {manager ? (
              <label className="cmp-dato apilado">
                <span>Proveedor</span>
                <input
                  className="ui-input"
                  placeholder="Ej.: Maderas Tigre"
                  value={request.proveedor || ""}
                  onChange={(e) => { const valor = e.target.value; setRequest((prev) => ({ ...prev, proveedor: valor })); }}
                  onBlur={() => {
                    const next = (request.proveedor || "").trim() || null;
                    setRequest((prev) => ({ ...prev, proveedor: next }));
                    patchRequest({ proveedor: next });
                  }}
                />
              </label>
            ) : request.proveedor ? (
              <Dato etiqueta="Proveedor">{request.proveedor}</Dato>
            ) : null}
            {destino && <Dato etiqueta={request.project?.codigo ? "Obra" : "Destino"} mono>{destino}</Dato>}
            {request.needed_at && <Dato etiqueta="Se necesita" mono tono={necesarioVencido ? "rojo" : "cian"}>{fmtFecha(request.needed_at)}</Dato>}
            {request.delivered_at && <Dato etiqueta="Llegó" mono tono="verde">{fmtFecha(request.delivered_at)}</Dato>}
          </div>

          {conCostos ? (
            <div className="cmp-lado-card">
              <div className="cmp-lado-tit">
                Costos y entrega
                <span className="cmp-sp" />
                <button type="button" className="cmp-link" onClick={() => setCostosOpen(true)}>{faltaImporte ? "Cargar" : "Editar"}</button>
              </div>
              {faltaImporte && <p className="cmp-lado-nota" data-tono="cian">Ya se compró y falta el importe real: es lo que alimenta el gasto del tablero.</p>}
              <Dato etiqueta="Cotizado" mono tono={request.estimated_amount != null ? "cian" : undefined}>{fmtPesos(request.estimated_amount)}</Dato>
              {["comprado", "recibido"].includes(request.status) && (
                <Dato etiqueta="Real" mono tono={request.actual_amount == null ? undefined : request.estimated_amount != null && request.actual_amount > request.estimated_amount ? "rojo" : "verde"}>
                  {request.actual_amount == null ? "falta" : fmtPesos(request.actual_amount)}
                </Dato>
              )}
              {request.estimated_delivery_at && <Dato etiqueta="Entrega estimada" mono tono={entregaVencida ? "rojo" : undefined}>{fmtFecha(request.estimated_delivery_at)}</Dato>}
              {request.invoice_url && <a className="cmp-link" href={request.invoice_url} target="_blank" rel="noreferrer">Ver el comprobante</a>}
            </div>
          ) : (!manager && (request.estimated_delivery_at || request.actual_amount != null)) ? (
            <div className="cmp-lado-card">
              <div className="cmp-lado-tit">Entrega</div>
              {request.estimated_delivery_at && <Dato etiqueta="Entrega estimada" mono tono={entregaVencida ? "rojo" : undefined}>{fmtFecha(request.estimated_delivery_at)}</Dato>}
            </div>
          ) : null}

          {verAvisoPanol && (
            <div className="cmp-lado-card">
              <div className="cmp-lado-tit"><Warehouse size={13} /> Aviso de ingreso a pañol</div>
              {enviosPanol.length === 0 ? (
                <p className="cmp-lado-nota">
                  {canSendToPanol
                    ? "Ya se compró: avisale al pañol qué va a llegar para que lo reciba."
                    : !manager ? "Todavía no se avisó al pañol."
                      : request.status !== "comprado" ? "Se avisa al pañol cuando el pedido está Comprado."
                        : "No hay ítems cargados para avisar: sumalos y aparece el botón."}
                </p>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {enviosPanol.map((e) => {
                    const r = resumenItems(e.items || []);
                    const em = ENVIO_ESTADO_META[e.estado] ?? { label: e.estado };
                    return (
                      <div key={e.id} className="cmp-envio">
                        <span style={{ minWidth: 0 }}>
                          <span className="nom">Aviso enviado · {e.sede}</span>
                          <span className="cmp-ayuda" style={{ display: "block" }}>{r.recibidos} de {r.total} recibidos</span>
                        </span>
                        <span className="cmp-estado" style={{ color: em.color, borderColor: "var(--border)", background: "var(--panel-2)" }}>{em.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {canSendToPanol && (
                <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => setPanolModal(true)}>
                  <Send size={13} /> {enviosPanol.length ? "Avisar lo que falta" : "Enviar aviso de ingreso"}
                </button>
              )}
            </div>
          )}

          <div className="cmp-lado-card">
            <div className="cmp-lado-tit"><Users size={13} /> Quiénes siguen el pedido</div>
            <PersonaFila user={request.creator} rol="Lo pidió" tono="verde" />
            {request.assignee && <PersonaFila user={request.assignee} rol="Compras" tono="cian" />}
            {followers.map((f) => (
              <PersonaFila
                key={f.user_id}
                user={f.profile}
                rol={`En copia${f.profile?.role ? ` · ${f.profile.role}` : ""}`}
                tono="azul"
                onQuitar={manager || profile?.id === request.created_by ? () => handleRemoveFollower(f.user_id) : null}
              />
            ))}
            {myFollower && (
              <button
                type="button"
                className={`ui-btn chico ${followerWaEnabled ? "ui-btn-fantasma" : "ui-btn-suave"}`}
                onClick={handleToggleFollowerWhatsapp}
                disabled={savingFollowerWa}
                title={followerWaEnabled ? "El bot te avisa cuando Compras actualiza este pedido" : "Si tenés el bot vinculado, te llegan estados, mensajes e ítems"}
              >
                {followerWaEnabled ? <BellOff size={13} /> : <Bell size={13} />}
                {savingFollowerWa ? "Guardando…" : followerWaEnabled ? "No avisarme por WhatsApp" : "Avisarme por WhatsApp"}
              </button>
            )}
            <div className="cmp-sumar-copia">
              <select className="ui-input" value={newFollowerId} onChange={(e) => setNewFollowerId(e.target.value)} aria-label="Sumar a alguien en copia">
                <option value="">Sumar a alguien en copia…</option>
                {availableFollowers.map((user) => <option key={user.id} value={user.id}>{usernameOf(user)} ({user.role})</option>)}
              </select>
              <button type="button" className="ui-btn ui-btn-suave chico" onClick={handleAddFollower} disabled={!newFollowerId}><UserPlus size={13} /> Sumar</button>
            </div>
          </div>
        </aside>
      </div>

      {panolModal && (
        <EnviarAPanolModal
          open={panolModal}
          profile={profile}
          prefill={panolPrefill}
          onClose={(saved) => { setPanolModal(false); if (saved) load(); }}
        />
      )}

      {/* ── Costos y recepción: se cargan en un diálogo, no ocupan la pantalla ── */}
      {costosOpen && conCostos && (
        <Modal
          icono={Receipt}
          tono={faltaImporte ? "cian" : "verde"}
          titulo="Costos y entrega"
          sub="Se guarda cada campo al salir de él."
          onCerrar={() => setCostosOpen(false)}
          pie={<button type="button" className="ui-btn ui-btn-primario" onClick={() => setCostosOpen(false)}>Listo</button>}
        >
          <div className="cmp-form">
            <label className="cmp-campo c2"><span>Monto cotizado $</span>
              <input {...campo("estimated_amount", { tipo: "number", aNumero: true, placeholder: "0" })} step="0.01" min="0" />
            </label>
            {["comprado", "recibido"].includes(request.status) && (
              <>
                <label className="cmp-campo c2"><span>Monto real $</span>
                  <input {...campo("actual_amount", { tipo: "number", aNumero: true, placeholder: "0" })} step="0.01" min="0" />
                </label>
                <label className="cmp-campo c2"><span>Entrega estimada</span>
                  <input {...campo("estimated_delivery_at", { tipo: "date" })} />
                </label>
              </>
            )}
          </div>
          {request.estimated_amount != null && request.actual_amount != null && (
            <Aviso tono={request.actual_amount <= request.estimated_amount ? "verde" : "rojo"}>
              Cotizado {fmtPesos(request.estimated_amount)} · real {fmtPesos(request.actual_amount)}
              {request.actual_amount > request.estimated_amount && <> · <b>{fmtPesos(request.actual_amount - request.estimated_amount)} por encima</b></>}
            </Aviso>
          )}
          {request.status === "recibido" && (
            <div className="cmp-form">
              <div className="cmp-campo c6 cmp-rotulo" style={{ marginTop: 4 }}>Recepción</div>
              <label className="cmp-campo"><span>Cantidad recibida</span>
                <input {...campo("received_quantity", { placeholder: "Ej.: 10 unidades, 3 m²" })} />
              </label>
              <label className="cmp-campo"><span>Fecha de recepción</span>
                <input {...campo("delivered_at", { tipo: "date", aFechaISO: true })} />
              </label>
              <label className="cmp-campo c6"><span>Notas de recepción</span>
                <textarea {...campo("receipt_notes", { tipo: "textarea", placeholder: "Cómo llegó, novedades, observaciones…" })} rows={2} />
              </label>
              <div className="cmp-campo c6">
                <span>Factura o comprobante</span>
                {request.invoice_url ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <a className="ui-btn ui-btn-suave chico" href={request.invoice_url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><ImageIcon size={13} /> Ver comprobante</a>
                    <button
                      type="button"
                      className="cmp-btn-ic chico peligro"
                      aria-label="Quitar comprobante"
                      onClick={async () => {
                        const ok = await confirm({ title: "Quitar comprobante", message: "El archivo de la factura se desvincula del pedido.", confirmLabel: "Quitar", tone: "danger" });
                        if (!ok) return;
                        await patchRequest({ invoice_url: null, invoice_path: null });
                        toast.success("Comprobante quitado");
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : (
                  <label className="cmp-drop">
                    <Paperclip size={16} />
                    <span><b>Subir factura o PDF</b><small>Queda guardada con el pedido</small></span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      hidden
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
        </Modal>
      )}

      <ChatImageViewer attachment={openChatImage} onClose={() => setOpenChatImage(null)} />
    </div>
  );
}
