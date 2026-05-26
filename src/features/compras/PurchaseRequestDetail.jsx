import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
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
import {
  addRequestComment,
  addRequestFollower,
  fetchPurchaseRequestDetail,
  isPurchaseManager,
  removeRequestFollower,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  deletePurchaseRequest,
  updatePurchaseRequest,
  uploadInvoice,
  usernameOf,
} from "@/features/compras/purchaseRequestsApi";
import { printPurchaseRequest } from "@/features/compras/printPurchaseRequest";
import logoK from "@/assets/logos/logo-k.png";

const C = {
  bg: "#09090b",
  panel: "rgba(255,255,255,0.035)",
  panel2: "rgba(255,255,255,0.055)",
  panel3: "rgba(255,255,255,0.075)",
  border: "rgba(255,255,255,0.08)",
  border2: "rgba(255,255,255,0.14)",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  dim: "#71717a",
  blue: "#60a5fa",
  amber: "#f59e0b",
  green: "#10b981",
  red: "#ef4444",
  violet: "#8b5cf6",
  teal: "#2dd4bf",
  mono: "'JetBrains Mono', monospace",
  sans: "'Outfit', system-ui, sans-serif",
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
      gap: 5,
      color,
      background: `${color}16`,
      border: `1px solid ${color}33`,
      borderRadius: 7,
      padding: "4px 9px",
      fontSize: 10,
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
        fontSize: 10,
        fontWeight: 800,
        flexShrink: 0,
        letterSpacing: 0,
      }}>
        {initials || "?"}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        <div style={{ color: C.dim, fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}>
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
  background: "rgba(255,255,255,0.03)",
  color: C.muted,
  cursor: "pointer",
  flexShrink: 0,
  transition: "all .12s",
};

const inputStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 8,
  padding: "9px 10px",
  outline: "none",
  fontSize: 12,
  fontFamily: C.sans,
};

function StatusStepper({ current, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {REQUEST_STATUSES.map((s, i) => {
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
              fontSize: 10,
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
      fontSize: 12,
      fontWeight: 600,
      margin: "0 0 12px",
    }}>
      <Icon size={14} />
      {isReceived ? "Este pedido fue recibido y está archivado." : "Este pedido fue cancelado y está archivado."}
    </div>
  );
}

export default function PurchaseRequestDetail({ requestId, profile, users = [], onBack, onRequestUpdated, onDeleteLocal }) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [newFollowerId, setNewFollowerId] = useState("");
  const bottomRef = useRef(null);

  const manager = isPurchaseManager(profile);

  async function load() {
    if (!requestId) return;
    setError("");
    setLoading(true);
    try {
      const data = await fetchPurchaseRequestDetail(requestId);
      setRequest(data);
    } catch (err) {
      setError(err.message || "No se pudo cargar la solicitud.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [requestId]);

  useEffect(() => {
    if (!requestId) return undefined;
    const channel = supabase.channel(`purchase-request-${requestId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_requests", filter: `id=eq.${requestId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "request_followers", filter: `request_id=eq.${requestId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "request_comments", filter: `request_id=eq.${requestId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

  async function patchRequest(patch) {
    setError("");
    try {
      if (patch.status === "recibido" && !patch.delivered_at) {
        patch.delivered_at = new Date().toISOString();
      }
      const data = await updatePurchaseRequest(request.id, patch);
      setRequest((prev) => ({ ...prev, ...data }));
      onRequestUpdated?.();
    } catch (err) {
      setError(err.message);
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

  async function sendComment(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError("");
    try {
      await addRequestComment(request.id, message, users);
      setMessage("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, color: C.dim, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${C.border2}`, borderTopColor: C.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        Cargando solicitud...
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
        select option { background: #0f0f12; color: #f4f4f5; }
        textarea:focus, select:focus, input:focus { border-color: rgba(96,165,250,0.42) !important; }
        .pr-chat-scroll::-webkit-scrollbar { width: 4px; }
        .pr-chat-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 99px; }
        .pr-aside::-webkit-scrollbar { width: 4px; }
        .pr-aside::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 99px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .icon-btn:hover { background: rgba(255,255,255,0.07) !important; color: #f4f4f5 !important; }

        /* Estilos para renderizar el HTML enriquecido que viene de Quill */
        .quill-content ul, .quill-content ol { padding-left: 20px; margin: 6px 0; }
        .quill-content p { margin: 0 0 6px 0; }
        .quill-content p:last-child { margin: 0; }
        .quill-content a { color: #60a5fa; text-decoration: underline; }
      `}</style>

      <header style={{
        borderBottom: `1px solid ${C.border}`,
        background: "rgba(12,12,14,0.95)",
      }}>
        <div style={{
          minHeight: 64,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderBottom: manager ? `1px solid ${C.border}` : "none",
        }}>
          <button type="button" onClick={onBack} title="Volver" className="icon-btn" style={iconButtonStyle}>
            <ArrowLeft size={15} />
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <StatusDot status={request.status} />
              <h2 style={{ margin: 0, color: C.text, fontSize: 16, fontWeight: 800, letterSpacing: -0.3 }}>
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
            <div style={{ marginTop: 4, color: C.dim, fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={11} />
              Creado por {usernameOf(request.creator)} el {fmtDateTime(request.created_at)}
              {request.project?.codigo ? ` · Proyecto ${request.project.codigo}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              title="Imprimir en formato Webmail"
              className="icon-btn"
              style={iconButtonStyle}
              onClick={() => printPurchaseRequest(request, logoK)}
            >
              <Printer size={14} />
            </button>

            {(manager || profile?.id === request.created_by) && (
              <button
                type="button"
                title="Eliminar pedido localmente"
                className="icon-btn"
                style={{ ...iconButtonStyle, color: C.red }}
                onClick={async () => {
                  if (window.confirm("¿Seguro que querés eliminar este pedido?")) {
                    try {
                      await deletePurchaseRequest(request.id);
                      if (onDeleteLocal) onDeleteLocal(request.id);
                      onBack();
                    } catch (e) {
                      alert("Error al eliminar: " + (e.message || "desconocido"));
                    }
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {manager && (
          <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
                Estado
              </div>
              <StatusStepper current={request.status} onChange={(status) => patchRequest({ status })} />
            </div>

            <div style={{ flexShrink: 0, minWidth: 160 }}>
              <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
                Proveedor (Simulado)
              </div>
              <input
                type="text"
                placeholder="Ej: Maderas Tigre"
                value={request.proveedor || ""}
                onChange={(e) => {
                  const valor = e.target.value;
                  setRequest((prev) => ({ ...prev, proveedor: valor }));
                }}
                style={inputStyle}
              />
            </div>

            <div style={{ flexShrink: 0 }}>
              <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
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
                      onClick={() => patchRequest({ priority: p.value })}
                      style={{
                        border: `1px solid ${isActive ? color + "55" : C.border}`,
                        background: isActive ? `${color}14` : "transparent",
                        color: isActive ? color : C.dim,
                        borderRadius: 7,
                        padding: "5px 9px",
                        cursor: "pointer",
                        fontSize: 10,
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

        {manager && (request.status === "cotizando" || request.status === "comprado" || request.status === "recibido") && (
          <div style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            display: "grid",
            gap: 12,
          }}>
            <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", fontWeight: 750 }}>
              Costos y seguimiento
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {(request.status === "cotizando" || request.status === "comprado" || request.status === "recibido") && (
                <div>
                  <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
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
                  <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
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
                  <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
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
                fontSize: 11,
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
          </div>
        )}

        {manager && request.status === "recibido" && (
          <div style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            display: "grid",
            gap: 12,
          }}>
            <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", fontWeight: 750 }}>
              Recepción
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
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
                <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
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
              <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
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
              <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 750, marginBottom: 6 }}>
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
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    <ImageIcon size={13} /> Ver comprobante
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm("¿Eliminar comprobante?")) return;
                      await patchRequest({ invoice_url: null, invoice_path: null });
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
                  fontSize: 12,
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
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 300px",
        overflow: "hidden",
      }}>
        <section style={{ minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr auto", borderRight: `1px solid ${C.border}` }}>

          <div style={{
            padding: 16,
            borderBottom: `1px solid ${C.border}`,
            display: "grid",
            gridTemplateColumns: request.photo_url ? "1fr 160px" : "1fr",
            gap: 14,
          }}>
            <div>
              {ARCHIVED_STATUSES.includes(request.status) && <ArchivedBanner status={request.status} />}
              <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 7, fontWeight: 750 }}>
                Descripción
              </div>
              
              {/* Aquí renderizamos el HTML en lugar de texto plano */}
              <div className="quill-content" style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, whiteSpace: "normal" }}>
                {request.description ? (
                  <div dangerouslySetInnerHTML={{ __html: request.description }} />
                ) : (
                  <span style={{ fontStyle: "italic", color: C.dim }}>Sin descripción.</span>
                )}
              </div>

              {request.needed_at && (
                <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, color: C.amber, fontSize: 11, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, padding: "4px 8px" }}>
                  <Clock size={12} />
                  Necesario para: {new Date(request.needed_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </div>
              )}
            </div>
            {request.photo_url && (
              <a href={request.photo_url} target="_blank" rel="noreferrer" style={{
                display: "block",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                overflow: "hidden",
                background: C.panel,
                minHeight: 110,
              }}>
                <img src={request.photo_url} alt={request.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </a>
            )}
          </div>

          <div className="pr-chat-scroll" style={{ minHeight: 0, overflowY: "auto", padding: "16px 18px" }}>
            {comments.length === 0 ? (
              <div style={{
                height: "100%",
                minHeight: 180,
                display: "grid",
                placeItems: "center",
                color: C.dim,
                border: `1px dashed ${C.border}`,
                borderRadius: 8,
                background: "rgba(255,255,255,0.015)",
                fontSize: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MessageSquare size={15} />
                  Sin mensajes todavía
                </div>
              </div>
            ) : (
              comments.map((comment) => {
                const isMine = comment.author_id === profile?.id;
                return (
                  <div key={comment.id} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: 12 }}>
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
                          fontSize: 9,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}>
                          {usernameOf(comment.author).slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>{usernameOf(comment.author)}</span>
                        <span style={{ color: C.dim, fontSize: 10, marginLeft: "auto" }}>{fmtDateTime(comment.created_at)}</span>
                        {(comment.mentions || []).length > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.amber, fontSize: 10 }}>
                            <Users size={11} /> {comment.mentions.length}
                          </span>
                        )}
                      </div>
                      <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
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
              background: "rgba(12,12,14,0.84)",
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

        <aside className="pr-aside" style={{ minHeight: 0, overflowY: "auto", padding: 14, display: "grid", gap: 16, alignContent: "start" }}>
          {error && (
            <div style={{ color: "#fca5a5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", padding: 10, borderRadius: 8, fontSize: 12 }}>
              {error}
            </div>
          )}

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.muted, fontSize: 11, fontWeight: 750, marginBottom: 10, letterSpacing: 0.5 }}>
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
          </div>

          <div style={{ padding: 10, border: `1px solid ${C.border}`, borderRadius: 9, background: C.panel }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.muted, fontSize: 11, fontWeight: 750, marginBottom: 9 }}>
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
                  fontSize: 12,
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
            <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 750, marginBottom: 2 }}>
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
                  fontSize: 11,
                }}>
                  {new Date(request.estimated_delivery_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  {!["recibido", "cancelado"].includes(request.status) && new Date(request.estimated_delivery_at) < new Date() && " ⚠"}
                </span>
              </MetaRow>
            )}
            {request.delivered_at && (
              <MetaRow icon={<CheckCircle2 size={12} />} label="Recibido">
                <span style={{ color: C.green, fontWeight: 600, fontFamily: C.mono, fontSize: 11 }}>
                  {new Date(request.delivered_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </span>
              </MetaRow>
            )}
            <MetaRow icon={<ImageIcon size={12} />} label="Foto">
              {request.photo_url
                ? <a href={request.photo_url} target="_blank" rel="noreferrer" style={{ color: C.blue, fontSize: 11, textDecoration: "none" }}>Ver adjunto</a>
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
            {request.project?.codigo && (
              <MetaRow icon={<Paperclip size={12} />} label="Proyecto">
                <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11 }}>{request.project.codigo}</span>
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
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
      <span style={{ color: C.dim, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: C.dim, minWidth: 60 }}>{label}</span>
      <span style={{ marginLeft: "auto" }}>{children}</span>
    </div>
  );
}
