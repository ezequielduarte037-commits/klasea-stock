import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Archive,
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronRight,
  CheckCircle2,
  Clock,
  Filter,
  ImagePlus,
  Inbox,
  LayoutGrid,
  LayoutList,
  Package,
  Plus,
  MessageSquare,
  Search,
  ShoppingCart,
  Table2,
  Trash2,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { CardSkeleton, RowSkeleton, Skeleton, SkeletonStyles } from "@/components/ui/Skeleton";
import AdditionalPurchasesPanel from "@/features/compras/AdditionalPurchasesPanel";
import CajaChicaPanel from "@/features/compras/CajaChicaPanel";
import CadeteRutaScreen from "@/features/cadete/CadeteRutaScreen";
import PurchaseRequestDetail from "@/features/compras/PurchaseRequestDetail";
import PurchaseLogPanel from "@/features/compras/PurchaseLogPanel";
import {
  addRequestItem,
  addComprasAvisoComentario,
  createComprasAviso,
  createPurchaseRequest,
  deleteComprasAviso,
  fetchComprasAvisos,
  fetchAnalyticsStats,
  fetchMonthlySpending,
  fetchOverdueRequests,
  fetchProfiles,
  fetchProjects,
  fetchPurchaseRequests,
  isPurchaseManager,
  notifyComprasEmail,
  notifyWaUpdate,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  updateComprasAviso,
  usernameOf,
} from "@/features/compras/purchaseRequestsApi";

import "react-quill-new/dist/quill.snow.css";
import { C } from "@/theme";

// Quill pesa ~80kB minificado y solo se usa al crear pedido (rol no-manager).
// Cargarlo lazy ahorra carga inicial para compras/admin que abren la lista.
const ReactQuill = lazy(() => import("react-quill-new"));

const QUILL_MODULES = {
  toolbar: [
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ color: [] }, { background: [] }],
    ["link", "clean"],
  ],
};

const extractText = (html) => {
  if (!html) return "";
  const tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
};

const statusColors = {
  nuevo: C.blue,
  en_revision: C.violet,
  cotizando: C.amber,
  comprado: C.teal,
  recibido: C.green,
  cancelado: C.red,
};

const statusDotColors = {
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
const EMPTY_ARRAY = [];

const inputStyle = {
  width: "100%",
  background: C.panel,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 8,
  padding: "9px 10px",
  outline: "none",
  fontSize: 13,
  fontFamily: C.sans,
};

const labelStyle = {
  color: C.dim,
  fontSize: 10,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  fontWeight: 750,
  marginBottom: 6,
};

function fmtDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function Chip({ children, color = C.blue, size = "sm" }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      flexShrink: 0,
      color,
      background: `${color}16`,
      border: `1px solid ${color}30`,
      borderRadius: 6,
      padding: size === "xs" ? "2px 5px" : "3px 7px",
      fontSize: size === "xs" ? 8 : 9,
      fontWeight: 800,
      letterSpacing: 0.9,
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function StatusDot({ status }) {
  const color = statusDotColors[status] || C.dim;
  return (
    <span style={{
      display: "inline-block",
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: color,
      boxShadow: `0 0 5px ${color}80`,
      flexShrink: 0,
    }} />
  );
}

function SectionTitle({ icon, title, count }) {
  const Icon = icon;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Icon size={15} color={C.blue} />
      <h3 style={{ margin: 0, fontSize: 14, color: C.text, fontWeight: 750 }}>{title}</h3>
      {count !== undefined && (
        <span style={{
          color: C.dim,
          fontSize: 11,
          fontFamily: C.mono,
          background: C.panel2,
          border: `1px solid ${C.border}`,
          borderRadius: 5,
          padding: "1px 6px",
        }}>{count}</span>
      )}
    </div>
  );
}

function RequestCard({ request, onClick, isUnread }) {
  const dotColor = statusDotColors[request.status] || C.blue;
  const color = statusColors[request.status] || C.blue;
  const isArchived = ARCHIVED_STATUSES.includes(request.status);

  return (
    <button
      type="button"
      onClick={onClick}
      className="purchase-card"
      style={{
        width: "100%",
        textAlign: "left",
        border: `1px solid ${isArchived ? C.border : C.border}`,
        background: C.panel,
        color: C.text,
        borderRadius: 10,
        padding: 0,
        cursor: "pointer",
        overflow: "hidden",
        opacity: isArchived ? 0.6 : 1,
        transition: "all .15s",
        display: "grid",
        gridTemplateColumns: "4px 1fr",
      }}
    >
      <div style={{ background: color, height: "100%" }} />

      <div style={{ padding: "10px 12px", display: "grid", gap: 6, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <StatusDot status={request.status} />
          <span style={{
            fontSize: 14, fontWeight: 750, color: C.text,
            flex: "1 1 auto", minWidth: 0, display: "block",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {request.title}
          </span>
          {isUnread && <span title="Mensaje nuevo" style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, boxShadow: `0 0 6px ${dotColor}`, flexShrink: 0, animation: "pulse-dot 1.4s ease-in-out infinite" }} />}
          <span style={{ marginLeft: "auto", flexShrink: 0 }}>
            <Chip color={priorityColors[request.priority]} size="xs">
              {REQUEST_PRIORITIES.find((p) => p.value === request.priority)?.label || request.priority}
            </Chip>
          </span>
        </div>

        <div style={{ color: C.dim, fontSize: 11, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <span>{usernameOf(request.creator)}</span>
          {(request.project?.codigo || request.destino) && <><span style={{ color: C.border2 }}>·</span><span style={{ fontFamily: C.mono, color: C.muted }}>{request.project?.codigo || request.destino}</span></>}
          <span style={{ color: C.border2 }}>·</span>
          <span>{fmtDate(request.created_at)}</span>
        </div>

        {request.description && (
          <div style={{
            color: C.muted, fontSize: 12, lineHeight: 1.4,
            overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
          }}>
            {extractText(request.description)}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase",
            color, background: `${color}14`, border: `1px solid ${color}28`,
            borderRadius: 5, padding: "1px 5px",
          }}>
            {REQUEST_STATUSES.find((s) => s.value === request.status)?.label || request.status}
          </span>
          <span style={{ flex: 1 }} />
          {(request.followers?.length || 0) > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: C.dim, fontSize: 10 }}>
              <Users size={10} /> {request.followers.length}
            </span>
          )}
          {request.photo_url && <ImagePlus size={10} color={C.dim} />}
        </div>
      </div>
    </button>
  );
}

const SOURCE_COLORS = {
  laminacion: "#2dd4bf",
  madera: "#f59e0b",
  inventario: "#8b5cf6",
  adicionales: "#34d399",
};
const SOURCE_LABELS = {
  laminacion: "Laminación",
  madera: "Madera",
  inventario: "Inventario",
  adicionales: "Adicionales",
};

function RequestRow({ request, onClick, isUnread }) {
  const dotColor = statusDotColors[request.status] || C.blue;
  const color = statusColors[request.status] || C.blue;
  const isArchived = ARCHIVED_STATUSES.includes(request.status);
  const srcColor = SOURCE_COLORS[request.source] || null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="purchase-row"
      style={{
        width: "100%",
        textAlign: "left",
        border: "none",
        borderLeft: `3px solid ${color}`,
        background: C.panel,
        color: C.text,
        borderRadius: 7,
        padding: "9px 13px",
        cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        alignItems: "center",
        gap: 10,
        opacity: isArchived ? 0.55 : 1,
        transition: "all .12s",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, minWidth: 0 }}>
          <span style={{
            fontSize: 14, fontWeight: 700, color: C.text,
            flex: "1 1 auto", minWidth: 0, display: "block",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {request.title}
          </span>
          {isUnread && <span title="Mensaje nuevo" style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, boxShadow: `0 0 6px ${dotColor}`, flexShrink: 0, animation: "pulse-dot 1.4s ease-in-out infinite" }} />}
          {srcColor && (
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: srcColor }}>
              {SOURCE_LABELS[request.source] || request.source}
            </span>
          )}
          <span style={{ marginLeft: "auto", flexShrink: 0, color: priorityColors[request.priority], fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
            {REQUEST_PRIORITIES.find((p) => p.value === request.priority)?.label || request.priority}
          </span>
        </div>
        <div style={{ fontSize: 11, color: C.dim }}>
          {usernameOf(request.creator)}
          {(request.project?.codigo || request.destino) ? ` · ${request.project?.codigo || request.destino}` : ""}
          {request.proveedor ? ` · ${request.proveedor}` : ""}
          {request.source_ref ? ` · #${request.source_ref}` : ""}
        </div>
      </div>

      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase",
        color, background: `${color}14`, border: `1px solid ${color}28`,
        borderRadius: 5, padding: "2px 7px",
      }}>
        {REQUEST_STATUSES.find((s) => s.value === request.status)?.label || request.status}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, whiteSpace: "nowrap" }}>
          {fmtDate(request.created_at)}
        </span>
        {request.photo_url && <ImagePlus size={11} color={C.dim} />}
        {(request.followers?.length || 0) > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: C.dim, fontSize: 10, fontFamily: C.mono }}>
            <Users size={10} /> {request.followers.length}
          </span>
        )}
      </div>
    </button>
  );
}

function StatChip({ label, count, color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="stat-chip"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        border: "none",
        background: active ? `${color}14` : C.panel,
        color: active ? color : C.dim,
        borderRadius: 5,
        padding: "3px 8px",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: active ? 750 : 600,
        fontFamily: C.sans,
        whiteSpace: "nowrap",
        transition: "all .12s",
        letterSpacing: "0.3px",
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{
          fontFamily: C.mono,
          fontSize: 11,
          color: active ? color : C.dim,
          opacity: 0.65,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

function ViewToggle({ viewMode, setViewMode }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      padding: 1,
      overflow: "hidden",
    }}>
      {[
        { value: "grid", label: "grid" },
        { value: "list", label: "list" },
      ].map(({ value }) => (
        <button
          key={value}
          type="button"
          onClick={() => setViewMode(value)}
          title={value === "grid" ? "Cuadrícula" : "Lista"}
          style={{
            display: "grid",
            placeItems: "center",
            width: 28,
            height: 28,
            border: "none",
            background: viewMode === value ? C.panel2 : "transparent",
            color: viewMode === value ? C.text : C.dim,
            cursor: "pointer",
            transition: "all .12s",
          }}
        >
          {value === "grid" ? <LayoutGrid size={12} /> : <LayoutList size={12} />}
        </button>
      ))}
    </div>
  );
}

const emptyForm = {
  title: "",
  description: "",
  priority: "media",
  project_id: "",
  destino: "",      // texto libre: obra (se resuelve a project_id) o destino libre (ej. Stock Chubut 2120)
  needed_at: "",
};

const STOCK_DESTINOS = ["Stock Chubut 2120", "Stock Pampa 1050"];
const CREATE_DRAFT_PREFIX = "purchase-request-create-draft";

const URL_FILTER_KEYS = ["q", "status", "priority", "creator", "project", "dateFrom", "dateTo"];
const MANAGER_TABS = ["pendientes", "lista", "dashboard", "avisos", "registro", "adicionales", "caja", "ruta"];

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from, to = new Date()) {
  const a = dateOnly(from);
  const b = dateOnly(to);
  if (!a || !b) return null;
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function requestDueDate(request) {
  return request?.estimated_delivery_at || request?.needed_at || null;
}

function attentionTextForRequest(request, unread) {
  const due = requestDueDate(request);
  const overdueDays = due ? daysBetween(due) : null;
  if (unread) return { label: "Comentario sin leer", color: C.violet, score: 95 };
  if (overdueDays != null && overdueDays > 0) return { label: `Vencido hace ${overdueDays}d`, color: C.red, score: 90 };
  if (request.priority === "urgente") return { label: "Urgente", color: C.red, score: 85 };
  if (request.priority === "alta") return { label: "Alta prioridad", color: C.amber, score: 74 };
  if (request.status === "comprado") return { label: "Comprado, falta cerrar", color: C.teal, score: 58 };
  if (request.status === "nuevo") return { label: "Nuevo", color: C.blue, score: 45 };
  return { label: REQUEST_STATUSES.find((s) => s.value === request.status)?.label || request.status, color: statusColors[request.status] || C.dim, score: 20 };
}

function buildComprasInbox(requests = [], avisos = [], unreadIds = new Set()) {
  const openRequests = requests.filter((request) => !ARCHIVED_STATUSES.includes(request.status));
  const today = dateOnly(new Date());
  const dueSoon = (request) => {
    const due = dateOnly(requestDueDate(request));
    if (!due || !today) return false;
    const diff = Math.floor((due - today) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 2;
  };
  const activeAvisos = avisos.filter((aviso) => AVISO_ACTIVE_STATUSES.includes(aviso.estado));
  const sortedRequests = (list) => [...list].sort((a, b) => {
    const am = attentionTextForRequest(a, unreadIds.has(a.id));
    const bm = attentionTextForRequest(b, unreadIds.has(b.id));
    return bm.score - am.score || new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
  });

  return {
    openRequests,
    activeAvisos,
    unreadRequests: sortedRequests(openRequests.filter((request) => unreadIds.has(request.id))),
    criticalRequests: sortedRequests(openRequests.filter((request) => {
      const overdue = requestDueDate(request) && daysBetween(requestDueDate(request)) > 0;
      return overdue || request.priority === "urgente";
    })),
    reviewRequests: sortedRequests(openRequests.filter((request) => ["nuevo", "en_revision"].includes(request.status) || unreadIds.has(request.id) || dueSoon(request))),
    boughtRequests: sortedRequests(openRequests.filter((request) => request.status === "comprado")),
  };
}

function ComprasCompanion({ requests, onOpenNew }) {
  const openRequests = requests.filter((request) => !ARCHIVED_STATUSES.includes(request.status));
  const nuevos = openRequests.filter((request) => request.status === "nuevo").length;
  const urgentes = openRequests.filter((request) => request.priority === "urgente").length;
  const vencidos = openRequests.filter((request) => {
    const due = requestDueDate(request);
    return due && (daysBetween(due) || 0) > 0;
  }).length;

  const estado = vencidos || urgentes
    ? { mood: "alerta", label: vencidos ? `${vencidos} vencido${vencidos === 1 ? "" : "s"}` : `${urgentes} urgente${urgentes === 1 ? "" : "s"}`, color: C.red, face: "•︵•" }
    : nuevos >= 8
      ? { mood: "triste", label: `${nuevos} nuevos esperan`, color: C.amber, face: "•︵•" }
      : nuevos > 0
        ? { mood: "atento", label: `${nuevos} nuevo${nuevos === 1 ? "" : "s"}`, color: C.blue, face: "•ᴗ•" }
        : { mood: "feliz", label: "Bandeja al día", color: C.green, face: "^‿^" };

  return (
    <button
      type="button"
      className="compras-companion"
      onClick={onOpenNew}
      title={estado.mood === "feliz" ? "La bandeja está al día" : "Ver pedidos nuevos"}
      aria-label={`${estado.label}. ${estado.mood === "feliz" ? "La bandeja está al día" : "Abrir pedidos nuevos"}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        border: `1px solid ${estado.color}38`,
        background: `${estado.color}10`,
        color: C.text,
        borderRadius: 9,
        padding: "4px 8px 4px 5px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{
        width: 25,
        height: 25,
        display: "grid",
        placeItems: "center",
        borderRadius: 8,
        background: `${estado.color}20`,
        color: estado.color,
        fontSize: 10,
        fontWeight: 900,
        fontFamily: C.mono,
        lineHeight: 1,
      }}>{estado.face}</span>
      <span style={{ display: "grid", gap: 1, textAlign: "left" }}>
        <span style={{ color: estado.color, fontSize: 9, letterSpacing: 0.8, fontWeight: 900, textTransform: "uppercase" }}>Comprín</span>
        <span style={{ color: C.dim, fontSize: 10.5, fontWeight: 700 }}>{estado.label}</span>
      </span>
    </button>
  );
}

// Compatibilidad con la primera versión del compañero; la versión visible es V2.
void ComprasCompanion;

function ComprasCompanionV2({ requests, onOpenNew }) {
  const open = requests.filter((r) => !ARCHIVED_STATUSES.includes(r.status));
  const count = (status) => open.filter((r) => r.status === status).length;
  const nuevos = count("nuevo");
  const revision = count("en_revision");
  const cotizando = count("cotizando");
  const comprados = count("comprado");
  const urgentes = open.filter((r) => r.priority === "urgente").length;
  const vencidos = open.filter((r) => requestDueDate(r) && (daysBetween(requestDueDate(r)) || 0) > 0).length;
  const alert = vencidos > 0 || urgentes > 0;
  const mood = alert ? "alerta" : nuevos >= 8 ? "triste" : nuevos > 0 ? "atento" : "feliz";
  const color = alert ? C.red : mood === "triste" ? C.amber : mood === "atento" ? C.blue : C.green;
  const label = vencidos > 0 ? `${vencidos} vencido${vencidos === 1 ? "" : "s"}` : urgentes > 0 ? `${urgentes} urgente${urgentes === 1 ? "" : "s"}` : nuevos > 0 ? `${nuevos} nuevo${nuevos === 1 ? "" : "s"}` : "Bandeja al día";

  return (
    <button type="button" className="compras-companion compras-companion-v2" onClick={() => onOpenNew("nuevo")} title="Abrir resumen de Compras" aria-label={`${label}. Abrir resumen de Compras`} style={{ borderColor: `${color}38`, background: `${color}10` }}>
      <span className={`compras-bot compras-bot-${mood}`} style={{ "--bot-color": color }}>
        <span className="compras-bot-antenna" />
        <span className="compras-bot-face"><span className="compras-bot-eye" /><span className="compras-bot-eye" /><span className="compras-bot-mouth" /></span>
      </span>
      <span className="compras-companion-copy">
        <span style={{ color, fontSize: 9, letterSpacing: 0.8, fontWeight: 900, textTransform: "uppercase" }}>Comprín</span>
        <strong>{label}</strong>
        <small>{nuevos} nuevos · {revision} revisión · {cotizando} cotizando</small>
        <small>{comprados} por recibir{urgentes ? ` · ${urgentes} urgentes` : ""}</small>
      </span>
    </button>
  );
}

void ComprasCompanionV2;

function createDraftKey(userId) {
  return `${CREATE_DRAFT_PREFIX}:${userId || "anon"}`;
}

const SAVED_DRAFTS_PREFIX = "purchase-request-saved-drafts";
const SAVED_DRAFTS_MAX = 4;
const SAVED_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 1 mes: se borran solos

function savedDraftsKey(userId) {
  return `${SAVED_DRAFTS_PREFIX}:${userId || "anon"}`;
}

function loadSavedDrafts(userId) {
  try {
    const raw = localStorage.getItem(savedDraftsKey(userId));
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    const vivos = list.filter((d) => {
      const t = Date.parse(d?.savedAt || "");
      return Number.isFinite(t) && now - t < SAVED_DRAFT_TTL_MS;
    });
    if (vivos.length !== list.length) {
      try { localStorage.setItem(savedDraftsKey(userId), JSON.stringify(vivos)); } catch { /* localStorage opcional */ }
    }
    return vivos;
  } catch {
    return [];
  }
}

function writeSavedDrafts(userId, list) {
  try { localStorage.setItem(savedDraftsKey(userId), JSON.stringify(list)); } catch { /* localStorage opcional */ }
}

function draftTitleFrom(body) {
  const t = cleanDraftText(body?.form?.title);
  if (t) return t.slice(0, 60);
  const it = Array.isArray(body?.createItems) && body.createItems[0];
  const itTxt = it ? cleanDraftText(it.description) : "";
  if (itTxt) return itTxt.slice(0, 60);
  const nd = cleanDraftText(body?.newItem?.description);
  if (nd) return nd.slice(0, 60);
  return "Pedido sin título";
}

function cleanDraftText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPendingItemDraft({ description, quantity, link }) {
  return !!(
    String(description || "").trim()
    || String(quantity || "").trim()
    || String(link || "").trim()
  );
}

function hasCreateDraftContent(snapshot) {
  const form = snapshot?.form || {};
  const item = snapshot?.newItem || {};
  return !!(
    String(form.title || "").trim()
    || cleanDraftText(form.description)
    || String(form.destino || "").trim()
    || String(form.needed_at || "").trim()
    || String(form.project_id || "").trim()
    || (form.priority && form.priority !== "media")
    || (snapshot?.ccUserIds || []).length
    || (snapshot?.createItems || []).length
    || hasPendingItemDraft(item)
  );
}

function formatDraftTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export default function PurchaseRequestsScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const [avisosError, setAvisosError] = useState("");
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(() => searchParams.get("open") || null);
  const [selectedAvisoId, setSelectedAvisoId] = useState(() => searchParams.get("aviso") || null);
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get("tab");
    return tab === "cc" || tab === "avisos" ? tab : "mine";
  });
  const [showNew, setShowNew] = useState(true);
  const [photoFile, setPhotoFile] = useState(null);
  const [ccUserIds, setCcUserIds] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [userSearch, setUserSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [readMap, setReadMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pr_readMap") || "{}"); } catch { return {}; }
  });
  const [managerTab, setManagerTab] = useState(() => {
    const tab = searchParams.get("tab");
    return MANAGER_TABS.includes(tab) ? tab : "pendientes";
  });
  const [analytics, setAnalytics] = useState(null);
  const [monthlySpending, setMonthlySpending] = useState([]);
  const [overdueItems, setOverdueItems] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [createItems, setCreateItems] = useState([]);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemQty, setNewItemQty] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("unidad");
  const [newItemLink, setNewItemLink] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [savedDrafts, setSavedDrafts] = useState([]);
  const [itemDraftWarning, setItemDraftWarning] = useState("");
  const submittingRef = useRef(false);
  const lastDraftJsonRef = useRef("");

  const [filters, setFilters] = useState(() => ({
    q:        searchParams.get("q")        || "",
    status:   searchParams.get("status")   || "activos",
    priority: searchParams.get("priority") || "todos",
    creator:  searchParams.get("creator")  || "todos",
    project:  searchParams.get("project")  || "todos",
    dateFrom: searchParams.get("dateFrom") || "",
    dateTo:   searchParams.get("dateTo")   || "",
  }));

  const manager = isPurchaseManager(profile);
  const canCreateAvisos = manager || ["tecnica", "oficina", "panol"].includes(profile?.role);
  const pendingItemDraft = hasPendingItemDraft({
    description: newItemDesc,
    quantity: newItemQty,
    link: newItemLink,
  });
  const createDraftHasContent = hasCreateDraftContent({
    form,
    ccUserIds,
    createItems,
    newItem: { description: newItemDesc, quantity: newItemQty, unit: newItemUnit, link: newItemLink },
  });

  useEffect(() => {
    if (!profile?.id) return;
    setDraftReady(false);
    lastDraftJsonRef.current = "";
    try {
      const raw = localStorage.getItem(createDraftKey(profile.id));
      const draft = raw ? JSON.parse(raw) : null;
      if (draft && hasCreateDraftContent(draft)) {
        setForm({ ...emptyForm, ...(draft.form || {}) });
        setCcUserIds(Array.isArray(draft.ccUserIds) ? draft.ccUserIds : []);
        setCreateItems(Array.isArray(draft.createItems) ? draft.createItems : []);
        setNewItemDesc(draft.newItem?.description || "");
        setNewItemQty(draft.newItem?.quantity || "");
        setNewItemUnit(draft.newItem?.unit || "unidad");
        setNewItemLink(draft.newItem?.link || "");
        setDraftSavedAt(draft.savedAt || null);
      } else {
        setDraftSavedAt(null);
      }
    } catch {
      setDraftSavedAt(null);
    } finally {
      setDraftReady(true);
    }
  }, [profile?.id]);

  // Lista de borradores guardados a mano (varios) + purga de los de más de 1 mes.
  useEffect(() => {
    if (!profile?.id) { setSavedDrafts([]); return; }
    setSavedDrafts(loadSavedDrafts(profile.id));
  }, [profile?.id]);

  useEffect(() => {
    if (!draftReady || !profile?.id) return;
    const body = {
      form,
      ccUserIds,
      createItems,
      newItem: {
        description: newItemDesc,
        quantity: newItemQty,
        unit: newItemUnit,
        link: newItemLink,
      },
    };
    const key = createDraftKey(profile.id);
    if (!hasCreateDraftContent(body)) {
      try { localStorage.removeItem(key); } catch { /* localStorage opcional */ }
      lastDraftJsonRef.current = "";
      setDraftSavedAt(null);
      return;
    }
    const json = JSON.stringify(body);
    if (json === lastDraftJsonRef.current) return;
    const savedAt = new Date().toISOString();
    try {
      localStorage.setItem(key, JSON.stringify({ ...body, savedAt }));
      lastDraftJsonRef.current = json;
      setDraftSavedAt(savedAt);
    } catch { /* localStorage opcional */ }
  }, [
    draftReady,
    profile?.id,
    form,
    ccUserIds,
    createItems,
    newItemDesc,
    newItemQty,
    newItemUnit,
    newItemLink,
  ]);

  // Sincronizar filtros + tab + pedido abierto a la URL para que sean
  // compartibles/back-friendly. También permite deep-link tipo ?open=<id>.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    URL_FILTER_KEYS.forEach((k) => {
      const v = filters[k];
      // status default es "activos" → no se escribe; el resto (incluido "todos") sí persiste
      const isDefault = (k === "status") ? v === "activos" : v === "todos";
      if (v && !isDefault) next.set(k, v);
      else next.delete(k);
    });
    if (manager) {
      if (managerTab !== "pendientes") next.set("tab", managerTab);
      else next.delete("tab");
    } else if (activeTab !== "mine") next.set("tab", activeTab);
    else next.delete("tab");
    if (selectedId) next.set("open", selectedId);
    else next.delete("open");
    if (((manager && managerTab === "avisos") || (!manager && activeTab === "avisos")) && selectedAvisoId) next.set("aviso", selectedAvisoId);
    else next.delete("aviso");
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeTab, selectedId, selectedAvisoId, manager, managerTab]);

  function markRead(requestId, lastAuthorId) {
    if (lastAuthorId) {
      setReadMap((prev) => {
        const next = { ...prev, [requestId]: lastAuthorId };
        localStorage.setItem("pr_readMap", JSON.stringify(next));
        return next;
      });
    }
  }

  const unreadIds = useMemo(() => {
    const set = new Set();
    for (const r of requests) {
      if (r.last_comment_author_id && r.last_comment_author_id !== profile?.id && r.last_comment_author_id !== readMap[r.id]) {
        set.add(r.id);
      }
    }
    return set;
  }, [requests, readMap, profile?.id]);

  const comprasInbox = useMemo(() => buildComprasInbox(requests, avisos, unreadIds), [requests, avisos, unreadIds]);
  const comprasAttentionCount = useMemo(() => {
    const ids = new Set();
    comprasInbox.unreadRequests.forEach((request) => ids.add(request.id));
    comprasInbox.criticalRequests.forEach((request) => ids.add(request.id));
    comprasInbox.reviewRequests.forEach((request) => ids.add(request.id));
    comprasInbox.activeAvisos.forEach((aviso) => ids.add(`aviso:${aviso.id}`));
    return ids.size;
  }, [comprasInbox]);

  useEffect(() => {
    if (manager) setShowNew(false);
  }, [manager]);

  async function loadAll() {
    setError("");
    setAvisosError("");
    setLoading(true);
    try {
      const [reqRows, userRows, projectRows, avisoRows] = await Promise.all([
        fetchPurchaseRequests(),
        fetchProfiles(),
        fetchProjects(),
        fetchComprasAvisos().catch((err) => {
          setAvisosError(err.message || "No se pudieron cargar los avisos.");
          return [];
        }),
      ]);
      setRequests(reqRows);
      setUsers(userRows);
      setProjects(projectRows);
      setAvisos(avisoRows);
    } catch (err) {
      setError(err.message || "No se pudo cargar compras.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!manager || managerTab !== "dashboard") return;
    setAnalyticsLoading(true);
    Promise.all([
      fetchAnalyticsStats(),
      fetchMonthlySpending(),
      fetchOverdueRequests(),
    ])
      .then(([stats, spending, overdue]) => {
        setAnalytics(stats);
        setMonthlySpending(spending);
        setOverdueItems(overdue);
      })
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  }, [manager, managerTab, requests]);

  const mine = useMemo(() => requests.filter((r) => r.created_by === profile?.id), [requests, profile?.id]);
  const copied = useMemo(() => requests.filter((r) => (r.followers || []).some((f) => f.user_id === profile?.id)), [requests, profile?.id]);
  const myAvisos = useMemo(() => avisos.filter((aviso) => aviso.created_by === profile?.id), [avisos, profile?.id]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return requests.filter((request) => {
      if (filters.status === "activos") {
        if (ARCHIVED_STATUSES.includes(request.status)) return false;   // recibido/cancelado = archivado
      } else if (filters.status !== "todos" && request.status !== filters.status) {
        return false;
      }
      if (filters.priority !== "todos" && request.priority !== filters.priority) return false;
      if (filters.creator !== "todos" && request.created_by !== filters.creator) return false;
      if (filters.project !== "todos") {
        if (filters.project.startsWith("dest:")) {
          if ((request.destino || "") !== filters.project.slice(5)) return false;
        } else if (request.project_id !== filters.project) return false;
      }
      if (filters.dateFrom && request.created_at?.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && request.created_at?.slice(0, 10) > filters.dateTo) return false;
      if (!q) return true;
      const haystack = `${request.title || ""} ${request.description || ""} ${request.creator?.username || ""} ${request.project?.codigo || ""} ${request.destino || ""} ${request.proveedor || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [requests, filters]);

  const userFiltered = useMemo(() => {
    const base = activeTab === "mine" ? mine : copied;
    let list = showArchived ? base : base.filter((r) => !ARCHIVED_STATUSES.includes(r.status));
    const q = userSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        `${r.title || ""} ${r.description || ""} ${r.project?.codigo || ""} ${r.destino || ""} ${r.proveedor || ""}`.toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeTab, mine, copied, showArchived, userSearch]);

  const archivedCount = useMemo(() => {
    const base = activeTab === "mine" ? mine : copied;
    return base.filter((r) => ARCHIVED_STATUSES.includes(r.status)).length;
  }, [activeTab, mine, copied]);

  const visibleList = manager ? filtered : userFiltered;

  // Agrupado por estado siguiendo el flujo de compras (Nuevo → En revisión →
  // Cotizando → Comprado → Recibido → Cancelado). Los archivados (recibido/
  // cancelado) caen al final solos. En la vista personal (mis pedidos / copiados)
  // se agrupa siempre; en la del manager solo cuando ve "Activos" o "Todos"
  // (si filtra por un estado puntual son todas iguales y no tiene sentido agrupar).
  const grouped = useMemo(() => {
    const shouldGroup = manager
      ? (filters.status === "activos" || filters.status === "todos")
      : true;
    if (!shouldGroup) return [{ value: "_all", label: null, items: visibleList }];
    return REQUEST_STATUSES
      .map((s) => ({ value: s.value, label: s.label, items: visibleList.filter((r) => r.status === s.value) }))
      .filter((g) => g.items.length > 0);
  }, [visibleList, filters.status, manager]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.q) n++;
    if (filters.status !== "todos" && filters.status !== "activos") n++;
    if (filters.priority !== "todos") n++;
    if (filters.creator !== "todos") n++;
    if (filters.project !== "todos") n++;
    if (filters.dateFrom) n++;
    if (filters.dateTo) n++;
    return n;
  }, [filters]);

  function clearFilters() {
    setFilters({
      q: "", status: "activos", priority: "todos", creator: "todos",
      project: "todos", dateFrom: "", dateTo: "",
    });
  }

  const statusStats = useMemo(() =>
    REQUEST_STATUSES.map((s) => ({
      ...s,
      count: requests.filter((r) => r.status === s.value).length,
    })),
    [requests],
  );

  const avisoNuevoCount = useMemo(() =>
    avisos.filter((aviso) => aviso.estado === "nuevo").length,
    [avisos],
  );

  function resetCreateDraft(showToast = false) {
    try {
      if (profile?.id) localStorage.removeItem(createDraftKey(profile.id));
    } catch { /* localStorage opcional */ }
    lastDraftJsonRef.current = "";
    setDraftSavedAt(null);
    setForm(emptyForm);
    setCcUserIds([]);
    setPhotoFile(null);
    setCreateItems([]);
    setNewItemDesc("");
    setNewItemQty("");
    setNewItemUnit("unidad");
    setNewItemLink("");
    setItemDraftWarning("");
    if (showToast) toast.success("Borrador descartado.");
  }

  function currentDraftBody() {
    return {
      form,
      ccUserIds,
      createItems,
      newItem: { description: newItemDesc, quantity: newItemQty, unit: newItemUnit, link: newItemLink },
    };
  }

  function guardarBorrador() {
    if (!profile?.id) return;
    const body = currentDraftBody();
    if (!hasCreateDraftContent(body)) {
      toast.warning("No hay nada para guardar todavía.");
      return;
    }
    const entry = {
      id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `d${Date.now()}`,
      savedAt: new Date().toISOString(),
      title: draftTitleFrom(body),
      body,
    };
    const next = [entry, ...savedDrafts].slice(0, SAVED_DRAFTS_MAX);
    writeSavedDrafts(profile.id, next);
    setSavedDrafts(next);
    resetCreateDraft(false);
    toast.success("Borrador guardado. Lo retomás desde la lista de abajo.");
  }

  function retomarBorrador(id) {
    const d = savedDrafts.find((x) => x.id === id);
    if (!d) return;
    const b = d.body || {};
    setForm({ ...emptyForm, ...(b.form || {}) });
    setCcUserIds(Array.isArray(b.ccUserIds) ? b.ccUserIds : []);
    setCreateItems(Array.isArray(b.createItems) ? b.createItems : []);
    setNewItemDesc(b.newItem?.description || "");
    setNewItemQty(b.newItem?.quantity || "");
    setNewItemUnit(b.newItem?.unit || "unidad");
    setNewItemLink(b.newItem?.link || "");
    const next = savedDrafts.filter((x) => x.id !== id);
    writeSavedDrafts(profile?.id, next);
    setSavedDrafts(next);
    setShowNew(true);
    toast.success("Borrador retomado. Quedó cargado arriba.");
  }

  function eliminarBorrador(id) {
    const next = savedDrafts.filter((x) => x.id !== id);
    writeSavedDrafts(profile?.id, next);
    setSavedDrafts(next);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!form.title.trim()) {
      setError("El título es obligatorio.");
      toast.warning("El título es obligatorio.");
      return;
    }
    if (pendingItemDraft) {
      const msg = newItemDesc.trim()
        ? "Tenes un item escrito sin agregar. Toca el + azul para sumarlo al pedido."
        : "Hay datos de un item sin descripcion. Completalo y toca el + azul, o vacia esos campos.";
      setItemDraftWarning(msg);
      toast.warning(msg);
      return;
    }
    setSaving(true);
    setError("");
    submittingRef.current = true;
    try {
      // Resolver el campo libre: si coincide con una obra → project_id; si no → destino libre.
      const destTxt = (form.destino || "").trim();
      const obraMatch = destTxt && projects.find((p) => (p.codigo || "").toLowerCase() === destTxt.toLowerCase());
      const formResuelto = {
        ...form,
        project_id: obraMatch ? obraMatch.id : null,
        destino: obraMatch ? null : (destTxt || null),
      };
      const request = await createPurchaseRequest({ form: formResuelto, ccUserIds, photoFile });
      if (createItems.length) {
        await Promise.all(createItems.map((item) => addRequestItem(request.id, item)));
      }
      notifyComprasEmail({
        type: "new_request",
        requestId: request.id,
        requestTitle: form.title,
        changedBy: profile?.id,
        createdByName: profile?.username || "Usuario",
        source: form.source || undefined,
      });
      toast.success("Solicitud creada. Compras fue notificado.");
      resetCreateDraft(false);
      setShowNew(false);
      await loadAll();
      setSelectedId(request.id);
    } catch (err) {
      const msg = err.message || "No se pudo crear la solicitud.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  function addCreateItem() {
    const desc = newItemDesc.trim();
    if (!desc) {
      if (newItemQty.trim() || newItemLink.trim()) {
        const msg = "Completa la descripcion del item antes de agregarlo.";
        setItemDraftWarning(msg);
        toast.warning(msg);
      }
      return;
    }
    setCreateItems((prev) => [...prev, { description: desc, quantity: newItemQty.trim() || null, unit: newItemUnit, link_url: newItemLink.trim() || null }]);
    setNewItemDesc("");
    setNewItemQty("");
    setNewItemUnit("unidad");
    setNewItemLink("");
    setItemDraftWarning("");
  }

  function removeCreateItem(i) {
    setCreateItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function convertAvisoToRequest(aviso) {
    const destino = aviso.project?.codigo || aviso.destino || "";
    setForm({
      ...emptyForm,
      title: aviso.titulo || aviso.material || "Aviso a compras",
      description: aviso.detalle || aviso.titulo || "",
      priority: aviso.prioridad || "media",
      project_id: aviso.project_id || "",
      destino,
    });
    setCreateItems(aviso.material ? [{
      description: aviso.material,
      quantity: null,
      unit: "unidad",
      link_url: null,
    }] : []);
    setNewItemDesc("");
    setNewItemQty("");
    setNewItemUnit("unidad");
    setNewItemLink("");
    setItemDraftWarning("");
    setShowNew(true);
    setManagerTab("lista");
    toast.success("Aviso cargado como borrador de pedido.");
  }

  function toggleCc(userId) {
    setCcUserIds((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
  }

  if (selectedId) {
    return (
      <div style={{ position: "fixed", inset: 0, background: C.bg }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", height: "100%" }}>
          <Sidebar profile={profile} signOut={signOut} />
          <PurchaseRequestDetail
            requestId={selectedId}
            profile={profile}
            users={users}
            onBack={() => setSelectedId(null)}
            onRequestUpdated={loadAll}
            onDeleteLocal={(id) => {
              setRequests((prev) => prev.filter((r) => r.id !== id));
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, color: C.text, fontFamily: C.sans, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        select option { background: var(--panel-solid); color: var(--text); }
        input:focus, select:focus, textarea:focus {
          border-color: rgba(96,165,250,0.42) !important;
          box-shadow: 0 0 0 3px rgba(96,165,250,0.08);
        }
        @keyframes pr-card-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .purchase-card, .purchase-row {
          animation: pr-card-in .22s cubic-bezier(.22,1,.36,1) both;
        }
        .purchase-card:hover {
          background: var(--panel-2) !important;
          border-color: var(--border-2) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px var(--shadow);
        }
        .purchase-card { transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease !important; }
        .purchase-card:active { transform: translateY(0); transition-duration: .05s !important; }
        .purchase-row:hover {
          background: var(--panel-2) !important;
          border-color: var(--border-2) !important;
        }
        .purchase-row { transition: background .14s ease, border-color .14s ease; }
        .purchase-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .purchase-scroll::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }
        .stat-chip { transition: opacity .14s ease, background .14s ease, color .14s ease; }
        .stat-chip:hover { opacity: .85; }
        .compras-companion { transition: transform .16s ease, box-shadow .16s ease, filter .16s ease; }
        .compras-companion:hover { transform: translateY(-1px); box-shadow: 0 7px 18px var(--shadow); filter: saturate(1.08); }
        .compras-companion:active { transform: translateY(0); }
        .compras-companion-v2 { display: inline-flex; align-items: center; gap: 8px; border-width: 1px; border-style: solid; border-radius: 10px; padding: 4px 9px 4px 5px; cursor: pointer; color: var(--text); white-space: nowrap; }
        .compras-companion-copy { display: grid; gap: 1px; text-align: left; }
        .compras-companion-copy strong { color: var(--text); font-size: 10.5px; font-weight: 800; }
        .compras-companion-copy small { color: var(--dim); font-size: 9.5px; font-weight: 650; }
        .compras-bot { position: relative; width: 29px; height: 31px; display: grid; place-items: end center; flex: 0 0 auto; }
        .compras-bot-antenna { position: absolute; top: 0; left: 13px; width: 3px; height: 7px; background: var(--bot-color); border-radius: 3px; }
        .compras-bot-antenna::before { content: ""; position: absolute; top: -3px; left: -2px; width: 7px; height: 7px; border-radius: 50%; background: var(--bot-color); box-shadow: 0 0 7px var(--bot-color); }
        .compras-bot-face { position: relative; width: 29px; height: 23px; border: 2px solid var(--bot-color); border-radius: 9px 9px 7px 7px; background: color-mix(in srgb, var(--bot-color) 12%, var(--panel)); box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--bot-color) 12%, transparent); }
        .compras-bot-eye { position: absolute; top: 7px; width: 4px; height: 4px; border-radius: 50%; background: var(--bot-color); }
        .compras-bot-eye:first-child { left: 7px; }
        .compras-bot-eye:nth-child(2) { right: 7px; }
        .compras-bot-mouth { position: absolute; left: 10px; bottom: 4px; width: 7px; height: 3px; border-bottom: 2px solid var(--bot-color); border-radius: 50%; }
        .compras-bot-alerta .compras-bot-mouth, .compras-bot-triste .compras-bot-mouth { transform: rotate(180deg); bottom: 3px; }
        .compras-bot-alerta .compras-bot-eye { height: 3px; border-radius: 0; transform: rotate(35deg); }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: .75; }
        
        /* Ajustes para ReactQuill */
        .ql-toolbar.ql-snow {
          border: none !important;
          border-bottom: 1px solid var(--border) !important;
          background: var(--panel) !important;
          padding: 8px 12px !important;
        }
        .ql-container.ql-snow {
          border: none !important;
          font-family: 'Outfit', sans-serif !important;
          font-size: 14px !important;
          color: var(--text) !important;
        }
        .ql-editor {
          min-height: 180px !important; /* Más alto para mayor comodidad */
          padding: 14px !important;
        }
        .ql-editor.ql-blank::before {
          color: var(--dim) !important; /* Placeholder oscuro */
          font-style: normal !important;
        }
        .ql-snow .ql-stroke { stroke: var(--muted) !important; }
        .ql-snow .ql-fill, .ql-snow .ql-stroke.ql-fill { fill: var(--muted) !important; }
        .ql-snow.ql-toolbar button:hover .ql-stroke { stroke: var(--text) !important; }
        .ql-snow.ql-toolbar button:hover .ql-fill { fill: var(--text) !important; }
        .ql-snow.ql-toolbar button.ql-active .ql-stroke { stroke: var(--blue) !important; }
        .ql-snow.ql-toolbar button.ql-active .ql-fill { fill: var(--blue) !important; }
        /* Dropdowns de color */
        .ql-snow .ql-picker { color: var(--muted) !important; }
        .ql-snow .ql-picker-options { background-color: var(--panel-solid-2) !important; border: 1px solid var(--border) !important; }
        /* Tooltip de links */
        .ql-snow .ql-tooltip {
          background-color: var(--panel-solid-2) !important;
          border: 1px solid var(--border) !important;
          color: var(--text) !important;
          box-shadow: 0 4px 12px var(--shadow) !important;
        }
        .ql-snow .ql-tooltip input[type="text"] {
          background-color: var(--panel) !important;
          border: 1px solid var(--border) !important;
          color: var(--text) !important;
        }
        .ql-snow .ql-tooltip a { color: var(--blue) !important; }
        [data-theme="light"] .ql-snow .ql-stroke { stroke: #27272a !important; }
        [data-theme="light"] .ql-snow .ql-fill,
        [data-theme="light"] .ql-snow .ql-stroke.ql-fill { fill: #27272a !important; }
        [data-theme="hc"] .ql-toolbar.ql-snow,
        [data-theme="hc"] .ql-container.ql-snow {
          background: #000 !important;
          border-color: var(--border-2) !important;
        }
        @media (max-width: 900px) {
          .purchase-topbar {
            height: auto !important;
            min-height: 50px !important;
            flex-wrap: wrap !important;
            padding-top: 8px !important;
            padding-bottom: 8px !important;
          }
          .purchase-tabs {
            order: 3;
            width: 100%;
            overflow-x: auto;
            padding-bottom: 2px;
          }
          .purchase-card:hover {
            transform: none !important;
          }
          .purchase-scroll {
            -webkit-overflow-scrolling: touch;
          }
          .ql-editor {
            min-height: 140px !important;
          }
        }
      `}</style>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", height: "100%", overflow: "hidden" }}>
        <Sidebar profile={profile} signOut={signOut} />

        <main style={{ minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>

          <header style={{
            display: "grid",
            gap: 0,
            background: C.topbar,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <div className="purchase-topbar" style={{
              height: 50,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: isMobile ? "10px 12px 8px 62px" : "0 16px",
            }}>
              <div style={{
                width: 30, height: 30,
                display: "grid", placeItems: "center",
                borderRadius: 7,
                color: C.amber,
                background: "rgba(245,158,11,0.12)",
                border: "1px solid rgba(245,158,11,0.25)",
              }}>
                <ShoppingCart size={16} />
              </div>
              <h1 style={{ margin: 0, fontSize: 14, color: C.text, fontWeight: 800 }}>
                {manager ? "Gestión de Compras" : "Pedidos a Compras"}
              </h1>

              {manager && (
                <div className="purchase-tabs" style={{ display: "flex", gap: 2, marginLeft: isMobile ? 0 : 10 }}>
                  <TabBtn active={managerTab === "pendientes"} onClick={() => setManagerTab("pendientes")}>
                    <Bell size={12} /> Pendientes
                    {comprasAttentionCount > 0 && (
                      <span style={{ fontFamily: C.mono, fontSize: 10, color: managerTab === "pendientes" ? C.text : C.amber }}>
                        {comprasAttentionCount}
                      </span>
                    )}
                  </TabBtn>
                  <TabBtn active={managerTab === "lista"} onClick={() => setManagerTab("lista")}>
                    <LayoutList size={12} /> Lista
                  </TabBtn>
                  <TabBtn active={managerTab === "dashboard"} onClick={() => setManagerTab("dashboard")}>
                    <BarChart3 size={12} /> Dashboard
                  </TabBtn>
                  <TabBtn active={managerTab === "avisos"} onClick={() => setManagerTab("avisos")}>
                    <AlertTriangle size={12} /> Avisos
                    {avisoNuevoCount > 0 && (
                      <span style={{ fontFamily: C.mono, fontSize: 10, color: managerTab === "avisos" ? C.text : C.amber }}>
                        {avisoNuevoCount}
                      </span>
                    )}
                  </TabBtn>
                  <TabBtn active={managerTab === "adicionales"} onClick={() => setManagerTab("adicionales")}>
                    <Table2 size={12} /> Adicionales
                  </TabBtn>
                  <TabBtn active={managerTab === "registro"} onClick={() => setManagerTab("registro")}>
                    <Package size={12} /> Registro
                  </TabBtn>
                  <TabBtn active={managerTab === "caja"} onClick={() => setManagerTab("caja")}>
                    <Wallet size={12} /> Caja chica
                  </TabBtn>
                  <TabBtn active={managerTab === "ruta"} onClick={() => setManagerTab("ruta")}>
                    <Truck size={12} /> Hoja de ruta
                  </TabBtn>
                </div>
              )}

              <div style={{ flex: 1 }} />

              {!manager && (
                <button type="button" onClick={() => setShowNew((v) => !v)} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  border: `1px solid ${showNew ? C.blue + "55" : C.border2}`,
                  background: showNew ? "rgba(96,165,250,0.1)" : C.panel2,
                  color: showNew ? C.blue : C.text,
                  borderRadius: 7, padding: "7px 11px", cursor: "pointer",
                  fontSize: 12, fontWeight: 750,
                  transition: "all .13s",
                }}>
                  {showNew ? <X size={13} /> : <Plus size={13} />}
                  {showNew ? "Cancelar" : "Nuevo pedido"}
                </button>
              )}
            </div>

            {manager && managerTab === "lista" && (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "5px 16px 7px", overflowX: "auto",
                  borderTop: `1px solid ${C.border}`,
                }}>
                  <StatChip label="Activos" count={requests.filter((r) => !ARCHIVED_STATUSES.includes(r.status)).length} color={C.green}
                    active={filters.status === "activos"}
                    onClick={() => setFilters((f) => ({ ...f, status: "activos" }))} />
                  <StatChip label="Todos" count={requests.length} color={C.muted}
                    active={filters.status === "todos"}
                    onClick={() => setFilters((f) => ({ ...f, status: "todos" }))} />
                  {statusStats.map((s) => (
                    <StatChip key={s.value} label={s.label} count={s.count} color={statusColors[s.value]}
                      active={filters.status === s.value}
                      onClick={() => setFilters((f) => ({ ...f, status: f.status === s.value ? "todos" : s.value }))} />
                  ))}
                </div>

                <div style={{
                  padding: "7px 16px 9px",
                  display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                  borderTop: `1px solid ${C.border}`,
                }}>
                  <div style={{ position: "relative", flex: "1 1 160px", minWidth: 140 }}>
                    <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.dim, pointerEvents: "none" }} />
                    <input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                      placeholder="Buscar..." style={{ ...inputStyle, paddingLeft: 28, paddingTop: 7, paddingBottom: 7, fontSize: 13 }} />
                  </div>
                  <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} style={{ ...inputStyle, flex: "0 0 120px", paddingTop: 7, paddingBottom: 7, fontSize: 13 }}>
                    <option value="todos">Prioridad</option>
                    {REQUEST_PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  <select value={filters.creator} onChange={(e) => setFilters((f) => ({ ...f, creator: e.target.value }))} style={{ ...inputStyle, flex: "0 0 120px", paddingTop: 7, paddingBottom: 7, fontSize: 13 }}>
                    <option value="todos">Creador</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{usernameOf(user)}</option>)}
                  </select>
                  <select value={filters.project} onChange={(e) => setFilters((f) => ({ ...f, project: e.target.value }))} style={{ ...inputStyle, flex: "0 0 110px", paddingTop: 7, paddingBottom: 7, fontSize: 13 }}>
                    <option value="todos">Destino</option>
                    <optgroup label="Obras">
                      {projects.map((project) => <option key={project.id} value={project.id}>{project.codigo}</option>)}
                    </optgroup>
                    {(() => {
                      const destinos = [...new Set(requests.map((r) => r.destino).filter(Boolean))].sort();
                      return destinos.length > 0 ? (
                        <optgroup label="Stock / destinos">
                          {destinos.map((d) => <option key={`dest:${d}`} value={`dest:${d}`}>{d}</option>)}
                        </optgroup>
                      ) : null;
                    })()}
                  </select>
                  <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} style={{ ...inputStyle, flex: "0 0 120px", paddingTop: 7, paddingBottom: 7, fontSize: 13 }} />
                  <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} style={{ ...inputStyle, flex: "0 0 120px", paddingTop: 7, paddingBottom: 7, fontSize: 13 }} />
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      title="Quitar todos los filtros"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        border: `1px solid ${C.amber}44`,
                        background: `${C.amber}10`,
                        color: C.amber,
                        borderRadius: 6,
                        padding: "6px 9px",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <X size={11} />
                      Limpiar {activeFilterCount}
                    </button>
                  )}
                  <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
                </div>
              </>
            )}
          </header>

          <div style={{
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : (showNew ? "480px 1fr" : "0 1fr"),
            transition: "grid-template-columns .18s ease",
            overflow: isMobile ? "auto" : "hidden",
          }}>
            <aside className="purchase-scroll" style={{
              overflowY: "auto",
              borderRight: showNew && !isMobile ? `1px solid ${C.border}` : "none",
              padding: showNew ? (isMobile ? "12px 12px calc(88px + env(safe-area-inset-bottom, 0px))" : 14) : 0,
              height: "100%",
              minHeight: 0,
              display: isMobile && !showNew ? "none" : "block",
            }}>
              {showNew && (
                <form onSubmit={handleCreate} style={{ display: "grid", gap: 13 }}>
                  <SectionTitle icon={Plus} title="Nuevo pedido" count="" />
                  {createDraftHasContent && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      border: `1px solid ${C.border}`,
                      background: C.panel,
                      borderRadius: 8,
                      padding: "8px 9px",
                      marginTop: -8,
                    }}>
                      <span style={{ color: C.green, fontSize: 12, fontWeight: 800 }}>
                        Borrador guardado{formatDraftTime(draftSavedAt) ? ` - ${formatDraftTime(draftSavedAt)}` : ""}
                      </span>
                      <span style={{ color: C.dim, fontSize: 11, flex: "1 1 140px" }}>
                        Se recupera solo si salis y volves.
                      </span>
                      <button
                        type="button"
                        onClick={guardarBorrador}
                        title="Guardar este pedido como borrador aparte para retomarlo cuando quieras"
                        style={{
                          border: `1px solid ${C.blue}`,
                          background: "transparent",
                          color: C.blue,
                          borderRadius: 6,
                          padding: "5px 10px",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        Guardar borrador
                      </button>
                      <button
                        type="button"
                        onClick={() => resetCreateDraft(true)}
                        style={{
                          border: `1px solid ${C.border}`,
                          background: C.panelSolid,
                          color: C.dim,
                          borderRadius: 6,
                          padding: "5px 8px",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 750,
                        }}
                      >
                        Descartar
                      </button>
                    </div>
                  )}

                  {savedDrafts.length > 0 && (
                    <div style={{
                      border: `1px solid ${C.border}`, background: C.panel, borderRadius: 10,
                      padding: "9px 10px", marginTop: -6, display: "grid", gap: 7,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>
                        Borradores guardados · {savedDrafts.length}/{SAVED_DRAFTS_MAX}
                        <span style={{ color: C.muted, fontWeight: 600, textTransform: "none", letterSpacing: 0 }}> — se borran solos al mes</span>
                      </div>
                      {savedDrafts.map((d) => (
                        <div key={d.id} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 9px",
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</div>
                            <div style={{ fontSize: 10.5, color: C.dim }}>{formatDraftTime(d.savedAt)}</div>
                          </div>
                          <button type="button" onClick={() => retomarBorrador(d.id)} style={{
                            border: `1px solid ${C.blue}`, background: "transparent", color: C.blue,
                            borderRadius: 6, padding: "5px 11px", cursor: "pointer", fontSize: 11.5, fontWeight: 800,
                          }}>Retomar</button>
                          <button type="button" onClick={() => eliminarBorrador(d.id)} title="Borrar este borrador" style={{
                            border: `1px solid ${C.border}`, background: "transparent", color: C.dim,
                            borderRadius: 6, padding: "5px 9px", cursor: "pointer", fontSize: 12, fontWeight: 800,
                          }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <div style={labelStyle}>Título</div>
                    <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} placeholder="¿Qué necesitás comprar?" />
                  </div>

                  <div>
                    <div style={labelStyle}>Descripción</div>
                    <div style={{
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      overflow: "hidden"
                    }}>
                      <Suspense fallback={
                        <div style={{ padding: 14, color: C.dim, fontSize: 13 }}>
                          Cargando editor…
                        </div>
                      }>
                        <ReactQuill
                          theme="snow"
                          value={form.description}
                          onChange={(value) => setForm((f) => ({ ...f, description: value }))}
                          modules={QUILL_MODULES}
                          placeholder="Detalle del producto, cantidades, especificaciones..."
                        />
                      </Suspense>
                    </div>
                  </div>

                  {/* ─── CREATE ITEMS ─────────────────────────────── */}
                  <div>
                    <div style={labelStyle}>Items del pedido</div>
                    <div style={{
                      border: `1px solid ${itemDraftWarning ? C.amber : C.border}`,
                      borderRadius: 8,
                      background: C.panel,
                      overflow: "hidden",
                    }}>
                      {createItems.map((item, i) => (
                        <div key={i} style={{
                          display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr) auto" : "1fr 60px auto",
                          gap: 6, alignItems: "center",
                          padding: "6px 8px",
                          borderBottom: `1px solid ${C.border}`,
                          fontSize: 13,
                        }}>
                          <div>
                            <span style={{ color: C.text }}>{item.description}</span>
                            {item.link_url && (
                              <a href={item.link_url} target="_blank" rel="noreferrer" style={{
                                display: "inline-flex", alignItems: "center", gap: 3,
                                marginLeft: 6, color: C.amber, fontSize: 10, textDecoration: "none",
                              }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                Enlace
                              </a>
                            )}
                          </div>
                          <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 12 }}>
                            {item.quantity} {item.unit}
                          </span>
                          <button type="button" onClick={() => removeCreateItem(i)}
                            style={{ padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontSize: 12,
                              border: `1px solid transparent`, background: "transparent", color: C.dim }}>✕</button>
                        </div>
                      ))}
                      <div style={{
                        display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr) 84px" : "1fr 70px 100px auto",
                        gap: 5, padding: 7,
                      }}>
                        <div style={{ display: "grid", gap: 3 }}>
                          <input value={newItemDesc} onChange={e => { setNewItemDesc(e.target.value); if (itemDraftWarning) setItemDraftWarning(""); }}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCreateItem(); } }}
                            placeholder="Descripción del ítem"
                            style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
                          <input value={newItemLink} onChange={e => { setNewItemLink(e.target.value); if (itemDraftWarning) setItemDraftWarning(""); }}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCreateItem(); } }}
                            placeholder="Enlace (opcional)"
                            style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.amber, fontSize: 12 }} />
                        </div>
                        <input value={newItemQty} onChange={e => { setNewItemQty(e.target.value); if (itemDraftWarning) setItemDraftWarning(""); }}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCreateItem(); } }}
                          placeholder="Cant."
                          style={{ padding: "6px 8px", minHeight: isMobile ? 42 : undefined, borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
                        <select value={newItemUnit} onChange={e => { setNewItemUnit(e.target.value); if (itemDraftWarning) setItemDraftWarning(""); }}
                          style={{ padding: "6px 8px", minHeight: isMobile ? 42 : undefined, borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}>
                          <option value="unidad">unidad</option>
                          <option value="par">par</option>
                          <option value="juego">juego</option>
                          <option value="metro">metro</option>
                          <option value="pies">pies</option>
                          <option value="m²">m²</option>
                          <option value="kg">kg</option>
                          <option value="litro">litro</option>
                        </select>
                        <button type="button" onClick={addCreateItem}
                          style={{ padding: "6px 10px", minHeight: isMobile ? 42 : undefined, borderRadius: 5, cursor: "pointer", fontSize: 12,
                            border: `1px solid ${C.blue}`, background: "rgba(59,130,246,0.15)", color: C.blue, fontWeight: 600 }}>+</button>
                      </div>
                      {itemDraftWarning && (
                        <div style={{
                          color: C.amber,
                          background: `${C.amber}12`,
                          borderTop: `1px solid ${C.amber}33`,
                          padding: "7px 9px",
                          fontSize: 12,
                          fontWeight: 750,
                        }}>
                          {itemDraftWarning}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={labelStyle}>Prioridad</div>
                      <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} style={inputStyle}>
                        {REQUEST_PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={labelStyle}>Necesario para</div>
                      <input type="date" value={form.needed_at} onChange={(e) => setForm((f) => ({ ...f, needed_at: e.target.value }))} style={inputStyle} />
                    </div>
                  </div>

                  <div>
                    <div style={labelStyle}>Destino</div>
                    <input
                      value={form.destino}
                      onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))}
                      list="pr-destino-options"
                      placeholder="Obra (ej. 37-36) o destino libre (ej. Stock Chubut 2120)"
                      autoComplete="off"
                      style={inputStyle}
                    />
                    <datalist id="pr-destino-options">
                      {projects.map((project) => <option key={project.id} value={project.codigo} />)}
                      {STOCK_DESTINOS.map((d) => <option key={d} value={d} />)}
                    </datalist>
                  </div>

                  <div>
                    <div style={labelStyle}>Foto adjunta</div>
                    <label style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      border: `1px dashed ${photoFile ? C.blue + "55" : C.border2}`,
                      borderRadius: 8,
                      padding: 11,
                      color: photoFile ? C.blue : C.dim,
                      cursor: "pointer",
                      background: photoFile ? "rgba(96,165,250,0.05)" : C.panel,
                      transition: "all .13s",
                    }}>
                      <ImagePlus size={15} />
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
                        {photoFile?.name || "Seleccionar imagen"}
                      </span>
                      <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
                    </label>
                  </div>

                  <div>
                    <div style={labelStyle}>Usuarios en copia</div>
                    <div style={{
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      background: C.panel,
                      overflow: "hidden",
                    }}>
                      <div style={{ padding: "4px 6px", borderBottom: `1px solid ${C.border}` }}>
                        <input
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          placeholder="Buscar usuario..."
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                        />
                      </div>
                      <div style={{ maxHeight: 180, overflowY: "auto", padding: 4 }}>
                        {(() => {
                          const filtered = users.filter((u) => u.id !== profile?.id && (userSearch ? u.username?.toLowerCase().includes(userSearch.toLowerCase()) : true));
                          const recent = JSON.parse(localStorage.getItem("pr_recent_cc") || "[]");
                          const sorted = [...filtered].sort((a, b) => {
                            const aIdx = recent.indexOf(a.id);
                            const bIdx = recent.indexOf(b.id);
                            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                            if (aIdx !== -1) return -1;
                            if (bIdx !== -1) return 1;
                            return 0;
                          });
                          return sorted.length === 0 ? (
                            <div style={{ color: C.dim, fontSize: 12, padding: "12px 8px", textAlign: "center" }}>
                              {userSearch ? "Sin resultados" : "No hay usuarios disponibles"}
                            </div>
                          ) : sorted.map((user) => (
                            <label key={user.id} style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "6px 7px",
                              borderRadius: 7,
                              cursor: "pointer",
                              background: ccUserIds.includes(user.id) ? "rgba(96,165,250,0.1)" : "transparent",
                              transition: "background .1s",
                            }}>
                              <input type="checkbox" checked={ccUserIds.includes(user.id)} onChange={() => {
                                toggleCc(user.id);
                                const recents = JSON.parse(localStorage.getItem("pr_recent_cc") || "[]");
                                const updated = [user.id, ...recents.filter((id) => id !== user.id)].slice(0, 10);
                                localStorage.setItem("pr_recent_cc", JSON.stringify(updated));
                              }} />
                              <span style={{ color: C.text, fontSize: 13 }}>{usernameOf(user)}</span>
                              <span style={{ color: C.dim, fontSize: 11, textTransform: "uppercase", marginLeft: "auto" }}>{user.role}</span>
                            </label>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div style={{ color: "#fca5a5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", padding: 9, borderRadius: 8, fontSize: 13 }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      border: "none",
                      borderRadius: 8,
                      background: saving ? C.panel2 : "var(--text)",
                      color: saving ? C.dim : C.bg,
                      padding: isMobile ? "14px 12px" : "11px 12px",
                      cursor: saving ? "default" : "pointer",
                      fontWeight: 800,
                      fontSize: 13,
                      fontFamily: C.sans,
                      transition: "all .13s",
                      position: isMobile ? "sticky" : "static",
                      bottom: isMobile ? "calc(10px + env(safe-area-inset-bottom, 0px))" : undefined,
                      zIndex: isMobile ? 5 : undefined,
                      boxShadow: isMobile ? "0 14px 36px var(--shadow-strong)" : "none",
                    }}
                  >
                    {saving ? "Guardando..." : "Crear solicitud"}
                  </button>
                </form>
              )}
            </aside>

            <section style={{ minHeight: 0, display: isMobile && showNew ? "none" : "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>

              {!manager && (
                <div style={{
                  padding: "10px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderBottom: `1px solid ${C.border}`,
                  background: C.topbarSoft,
                  flexWrap: "wrap",
                }}>
                  <button type="button" onClick={() => setActiveTab("mine")} style={tabStyle(activeTab === "mine")}>
                    <Inbox size={13} /> Mis pedidos
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: activeTab === "mine" ? C.blue : C.dim }}>
                      {mine.filter((r) => !ARCHIVED_STATUSES.includes(r.status)).length}
                    </span>
                  </button>
                  <button type="button" onClick={() => setActiveTab("cc")} style={tabStyle(activeTab === "cc")}>
                    <Users size={13} /> En copia
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: activeTab === "cc" ? C.blue : C.dim }}>
                      {copied.filter((r) => !ARCHIVED_STATUSES.includes(r.status)).length}
                    </span>
                  </button>
                  <button type="button" onClick={() => { setActiveTab("avisos"); setShowNew(false); }} style={tabStyle(activeTab === "avisos")}>
                    <AlertTriangle size={13} /> Mis avisos
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: activeTab === "avisos" ? C.blue : C.dim }}>
                      {myAvisos.filter((aviso) => AVISO_ACTIVE_STATUSES.includes(aviso.estado)).length}
                    </span>
                  </button>

                  {activeTab !== "avisos" && (
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ position: "relative" }}>
                        <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim, pointerEvents: "none" }} />
                        <input
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          placeholder="Buscar pedido..."
                          style={{ ...inputStyle, paddingLeft: 30 }}
                        />
                      </div>
                    </div>
                  )}

                  {activeTab !== "avisos" && archivedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowArchived((v) => !v)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        border: `1px solid ${showArchived ? C.amber + "55" : C.border}`,
                        background: showArchived ? "rgba(245,158,11,0.1)" : "transparent",
                        color: showArchived ? C.amber : C.dim,
                        borderRadius: 8,
                        padding: "7px 11px",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                        transition: "all .13s",
                      }}
                    >
                      <Archive size={13} />
                      {showArchived ? "Ocultar archivados" : `Ver archivados (${archivedCount})`}
                    </button>
                  )}

                  {activeTab !== "avisos" && <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />}
                </div>
              )}

              <div className="purchase-scroll" style={{ minHeight: 0, overflowY: "auto", padding: isMobile ? "12px 12px calc(18px + env(safe-area-inset-bottom, 0px))" : 16 }}>
                {manager && managerTab === "pendientes" ? (
                  <PendingComprasPanel
                    requests={requests}
                    avisos={avisos}
                    inbox={comprasInbox}
                    unreadIds={unreadIds}
                    loading={loading}
                    error={error || avisosError}
                    onSelectRequest={(id) => setSelectedId(id)}
                    onSelectAviso={(id) => {
                      setSelectedAvisoId(id);
                      setManagerTab("avisos");
                    }}
                    onGoList={(patch = {}) => {
                      setFilters((current) => ({ ...current, ...patch }));
                      setManagerTab("lista");
                    }}
                  />
                ) : manager && managerTab === "adicionales" ? (
                  <AdditionalPurchasesPanel
                    profile={profile}
                    projects={projects}
                    requests={requests}
                    onSelectRequest={(id) => setSelectedId(id)}
                    onRequestCreated={loadAll}
                  />
                ) : manager && managerTab === "avisos" ? (
                  <AvisosPanel
                    profile={profile}
                    avisos={avisos}
                    projects={projects}
                    users={users}
                    selectedId={selectedAvisoId}
                    error={avisosError}
                    canManage
                    canCreate
                    onSelect={setSelectedAvisoId}
                    onRefresh={loadAll}
                    onConvertToRequest={convertAvisoToRequest}
                  />
                ) : manager && managerTab === "registro" ? (
                  <PurchaseLogPanel profile={profile} />
                ) : manager && managerTab === "caja" ? (
                  <CajaChicaPanel profile={profile} />
                ) : manager && managerTab === "ruta" ? (
                  <CadeteRutaScreen embedded profile={profile} />
                ) : manager && managerTab === "dashboard" ? (
                  <DashboardErrorBoundary fallback="Probá recargar la página.">
                    <DashboardView
                      analytics={analytics}
                      monthlySpending={monthlySpending}
                      overdueItems={overdueItems}
                      loading={analyticsLoading}
                      requests={requests}
                      onSelectRequest={(id) => setSelectedId(id)}
                    />
                  </DashboardErrorBoundary>
                ) : !manager && activeTab === "avisos" ? (
                  <AvisosPanel
                    profile={profile}
                    avisos={myAvisos}
                    projects={projects}
                    users={users}
                    selectedId={selectedAvisoId}
                    error={avisosError}
                    canManage={false}
                    canCreate={canCreateAvisos}
                    title="Mis avisos"
                    onSelect={setSelectedAvisoId}
                    onRefresh={loadAll}
                    onConvertToRequest={null}
                  />
                ) : (
                  <>
                    {manager ? (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "0 0 8px", fontSize: 12,
                      }}>
                        <span style={{ color: C.muted, fontWeight: 700 }}>Todas las solicitudes</span>
                        <span style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>{visibleList.length}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ color: C.dim, fontSize: 11 }}>
                          {unreadIds.size > 0 && <><span style={{ color: C.violet, fontWeight: 700, fontFamily: C.mono }}>{unreadIds.size}</span> sin leer · </>}
                          <span style={{ color: C.amber, fontWeight: 700, fontFamily: C.mono }}>
                            {requests.filter((r) => r.status === "nuevo" || r.status === "en_revision" || r.status === "cotizando").length}
                          </span> pendientes · <span style={{ color: C.red, fontWeight: 700, fontFamily: C.mono }}>
                            {requests.filter((r) => r.priority === "urgente" && !["recibido", "cancelado"].includes(r.status)).length}
                          </span> urgentes
                        </span>
                      </div>
                    ) : (
                      <>
                        <SectionTitle
                          icon={Inbox}
                          title={activeTab === "mine" ? "Mis pedidos" : "Pedidos en copia"}
                          count={visibleList.length}
                        />
                        {unreadIds.size > 0 && (
                          <div style={{ fontSize: 11, color: C.dim, marginTop: -6, marginBottom: 6 }}>
                            <span style={{ color: C.violet, fontWeight: 700, fontFamily: C.mono }}>{unreadIds.size}</span> sin leer
                          </div>
                        )}
                      </>
                    )}

                    {loading ? (
                      <>
                        <SkeletonStyles />
                        {viewMode === "grid" ? (
                          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
                            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: 5 }}>
                            {Array.from({ length: 7 }).map((_, i) => <RowSkeleton key={i} />)}
                          </div>
                        )}
                      </>
                    ) : error && !showNew ? (
                      <div style={{ color: "#fca5a5", padding: 18 }}>{error}</div>
                    ) : visibleList.length === 0 ? (
                      <div style={{
                        minHeight: 240,
                        display: "grid",
                        placeItems: "center",
                        border: `1px dashed ${C.border}`,
                        borderRadius: 12,
                        color: C.dim,
                        background: "rgba(255,255,255,0.012)",
                        fontSize: 13,
                        textAlign: "center",
                        padding: 28,
                      }}>
                        <div style={{ display: "grid", justifyItems: "center", gap: 10, maxWidth: 320 }}>
                          <div style={{
                            width: 48, height: 48, borderRadius: 12,
                            display: "grid", placeItems: "center",
                            background: "rgba(245,158,11,0.08)",
                            border: "1px solid rgba(245,158,11,0.18)",
                            color: C.amber,
                          }}>
                            <ShoppingCart size={20} />
                          </div>
                          <div style={{ color: C.muted, fontWeight: 700, fontSize: 14 }}>
                            No hay solicitudes para mostrar
                          </div>
                          {!manager ? (
                            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
                              {activeTab === "mine"
                                ? "Cuando crees un pedido aparecerá acá."
                                : "Cuando te sumen como copia a un pedido, lo vas a ver acá."}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
                              No hay pedidos que coincidan con los filtros actuales.
                            </div>
                          )}
                          {!manager && archivedCount > 0 && !showArchived && (
                            <button
                              type="button"
                              onClick={() => setShowArchived(true)}
                              style={{
                                marginTop: 4,
                                background: "transparent",
                                border: `1px solid ${C.border2}`,
                                color: C.blue,
                                fontSize: 12,
                                fontWeight: 700,
                                borderRadius: 7,
                                padding: "6px 12px",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <Archive size={12} />
                              Ver {archivedCount} archivado{archivedCount > 1 ? "s" : ""}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 18 }}>
                        {grouped.map((g) => (
                          <div key={g.value}>
                            {g.label && (
                              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px" }}>
                                <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColors[g.value] || C.dim, boxShadow: `0 0 6px ${statusColors[g.value] || C.dim}66` }} />
                                <span style={{ fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 800, color: C.muted }}>{g.label}</span>
                                <span style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>{g.items.length}</span>
                                <span style={{ flex: 1, height: 1, background: C.border, marginLeft: 4 }} />
                              </div>
                            )}
                            {viewMode === "grid" ? (
                              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
                                {g.items.map((request) => (
                                  <RequestCard key={request.id} request={request} isUnread={unreadIds.has(request.id)} onClick={() => { markRead(request.id, request.last_comment_author_id); setSelectedId(request.id); }} />
                                ))}
                              </div>
                            ) : (
                              <div style={{ display: "grid", gap: 5 }}>
                                {g.items.map((request) => (
                                  <RequestRow key={request.id} request={request} isUnread={unreadIds.has(request.id)} onClick={() => { markRead(request.id, request.last_comment_author_id); setSelectedId(request.id); }} />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-dot { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(0.75); } }
      `}</style>
    </div>
  );
}

function PendingComprasPanel({ requests = [], avisos = [], inbox, unreadIds, loading, error, onSelectRequest, onSelectAviso, onGoList }) {
  const { isMobile } = useResponsive();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("todo");
  const data = inbox || buildComprasInbox(requests, avisos, unreadIds);
  const openRequests = data.openRequests || EMPTY_ARRAY;
  const reviewRequests = data.reviewRequests || EMPTY_ARRAY;
  const urgentRequests = openRequests.filter((request) => request.priority === "urgente");
  const overdueRequests = openRequests.filter((request) => requestDueDate(request) && daysBetween(requestDueDate(request)) > 0);
  const activeAvisos = data.activeAvisos || EMPTY_ARRAY;

  const sections = useMemo(() => {
    const base = [
      {
        key: "criticos",
        title: "Criticos",
        subtitle: "Vencidos o urgentes",
        color: C.red,
        icon: AlertTriangle,
        items: data.criticalRequests || EMPTY_ARRAY,
        type: "request",
      },
      {
        key: "revisar",
        title: "A revisar",
        subtitle: "Nuevos, en revision o con comentario pendiente",
        color: C.blue,
        icon: Inbox,
        items: reviewRequests,
        type: "request",
      },
      {
        key: "avisos",
        title: "Avisos abiertos",
        subtitle: "Mensajes internos que compras tiene que resolver",
        color: C.violet,
        icon: MessageSquare,
        items: activeAvisos,
        type: "aviso",
      },
      {
        key: "comprados",
        title: "Comprados por cerrar",
        subtitle: "Comprado, falta recepcion/cierre",
        color: C.teal,
        icon: CheckCircle2,
        items: data.boughtRequests || EMPTY_ARRAY,
        type: "request",
      },
    ];

    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matchRequest = (request) => {
      if (!terms.length) return true;
      const haystack = `${request.title || ""} ${extractText(request.description || "")} ${request.creator?.username || ""} ${request.assignee?.username || ""} ${request.project?.codigo || ""} ${request.destino || ""} ${request.proveedor || ""}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    };
    const matchAviso = (aviso) => {
      if (!terms.length) return true;
      const haystack = `${aviso.titulo || ""} ${aviso.detalle || ""} ${aviso.material || ""} ${aviso.creator?.username || ""} ${aviso.project?.codigo || ""} ${aviso.destino || ""}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    };

    return base
      .filter((section) => scope === "todo" || section.key === scope)
      .map((section) => ({
        ...section,
        items: section.items.filter(section.type === "aviso" ? matchAviso : matchRequest),
      }))
      .filter((section) => section.items.length > 0 || scope !== "todo");
  }, [activeAvisos, data, q, reviewRequests, scope]);

  const totalVisible = sections.reduce((sum, section) => sum + section.items.length, 0);

  const kpis = [
    {
      label: "A revisar",
      value: reviewRequests.length,
      color: C.blue,
      icon: Inbox,
      onClick: () => setScope("revisar"),
    },
    {
      label: "Urgentes",
      value: urgentRequests.length,
      color: urgentRequests.length ? C.red : C.green,
      icon: AlertTriangle,
      onClick: () => onGoList({ status: "activos", priority: "urgente" }),
    },
    {
      label: "Vencidos",
      value: overdueRequests.length,
      color: overdueRequests.length ? C.red : C.green,
      icon: Clock,
      onClick: () => setScope("criticos"),
    },
    {
      label: "Avisos abiertos",
      value: activeAvisos.length,
      color: activeAvisos.length ? C.violet : C.green,
      icon: MessageSquare,
      onClick: () => setScope("avisos"),
    },
  ];

  const scopeButtons = [
    ["todo", "Todo", totalVisible],
    ["criticos", "Criticos", data.criticalRequests?.length || 0],
    ["revisar", "A revisar", reviewRequests.length],
    ["avisos", "Avisos", activeAvisos.length],
    ["comprados", "Comprados", data.boughtRequests?.length || 0],
  ];

  function requestCard(request, tone) {
    const attention = attentionTextForRequest(request, unreadIds.has(request.id));
    const statusLabel = REQUEST_STATUSES.find((s) => s.value === request.status)?.label || request.status;
    const priorityLabel = REQUEST_PRIORITIES.find((p) => p.value === request.priority)?.label || request.priority;
    const destination = request.project?.codigo || request.destino || "Sin destino";
    return (
      <button
        key={request.id}
        type="button"
        onClick={() => onSelectRequest(request.id)}
        style={{
          border: `1px solid ${C.border}`,
          borderLeft: `4px solid ${attention.color || tone}`,
          background: C.panel,
          color: C.text,
          borderRadius: 10,
          padding: "10px 12px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 10,
          alignItems: "center",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {request.title}
            </span>
            {unreadIds.has(request.id) && <span style={{ width: 7, height: 7, borderRadius: 99, background: C.violet, boxShadow: `0 0 8px ${C.violet}` }} />}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5, color: C.dim, fontSize: 11 }}>
            <span>{destination}</span>
            <span style={{ color: C.border2 }}>/</span>
            <span>{usernameOf(request.creator)}</span>
            <span style={{ color: C.border2 }}>/</span>
            <span>{statusLabel}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
            <Chip color={attention.color || tone} size="xs">{attention.label}</Chip>
            {["alta", "urgente"].includes(request.priority) && <Chip color={priorityColors[request.priority] || C.dim} size="xs">{priorityLabel}</Chip>}
          </div>
        </div>
        <ChevronRight size={16} color={C.dim} />
      </button>
    );
  }

  function avisoCard(aviso, tone) {
    const status = avisoStatusMeta(aviso.estado);
    const priority = REQUEST_PRIORITIES.find((p) => p.value === aviso.prioridad)?.label || aviso.prioridad || "Media";
    return (
      <button
        key={aviso.id}
        type="button"
        onClick={() => onSelectAviso(aviso.id)}
        style={{
          border: `1px solid ${C.border}`,
          borderLeft: `4px solid ${status.color || tone}`,
          background: C.panel,
          color: C.text,
          borderRadius: 10,
          padding: "10px 12px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 10,
          alignItems: "center",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {aviso.titulo || aviso.material || "Aviso a compras"}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5, color: C.dim, fontSize: 11 }}>
            <span>{aviso.project?.codigo || aviso.destino || "Sin destino"}</span>
            <span style={{ color: C.border2 }}>/</span>
            <span>{aviso.creator?.username || "Sin creador"}</span>
            <span style={{ color: C.border2 }}>/</span>
            <span>{fmtDate(aviso.created_at)}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
            <Chip color={status.color} size="xs">{status.label}</Chip>
            <Chip color={priorityColors[aviso.prioridad] || C.blue} size="xs">{priority}</Chip>
          </div>
        </div>
        <ChevronRight size={16} color={C.dim} />
      </button>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <SkeletonStyles />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", fontWeight: 850 }}>Compras</div>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, color: C.text, fontWeight: 900 }}>Bandeja de pendientes</h2>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
            {openRequests.length} pedidos abiertos / {activeAvisos.length} avisos activos
          </div>
        </div>
        <button
          type="button"
          onClick={() => onGoList({ status: "activos", priority: "todos" })}
          style={{
            border: `1px solid ${C.border}`,
            background: C.panel,
            color: C.text,
            borderRadius: 8,
            padding: "8px 11px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <LayoutList size={13} />
          Ver lista completa
        </button>
      </div>

      {error && (
        <div style={{ border: `1px solid ${C.amber}44`, background: `${C.amber}10`, color: C.amber, borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 750 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        {kpis.map((kpi) => {
          const KpiIcon = kpi.icon;
          return (
            <button
              key={kpi.label}
              type="button"
              onClick={kpi.onClick}
              style={{
                border: `1px solid ${C.border}`,
                background: C.panel,
                borderRadius: 12,
                padding: 12,
                display: "grid",
                gap: 9,
                textAlign: "left",
                cursor: "pointer",
                color: C.text,
                minHeight: 92,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 850 }}>{kpi.label}</span>
                <KpiIcon size={15} color={kpi.color} />
              </div>
              <div style={{ color: kpi.color, fontSize: 25, lineHeight: 1, fontWeight: 950, fontFamily: C.mono }}>{kpi.value}</div>
            </button>
          );
        })}
      </div>

      <div style={{
        border: `1px solid ${C.border}`,
        background: C.topbarSoft,
        borderRadius: 12,
        padding: 10,
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
      }}>
        <div style={{ position: "relative", flex: "1 1 260px", minWidth: 180 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Buscar pendiente, obra, proveedor, usuario..."
            style={{ ...inputStyle, paddingLeft: 31, background: C.bg }}
          />
        </div>
        {scopeButtons.map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setScope(value)}
            style={{
              border: `1px solid ${scope === value ? C.blue + "55" : C.border}`,
              background: scope === value ? `${C.blue}14` : C.panel,
              color: scope === value ? C.blue : C.dim,
              borderRadius: 8,
              padding: "7px 9px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 850,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {label}
            <span style={{ fontFamily: C.mono, fontSize: 11 }}>{count}</span>
          </button>
        ))}
      </div>

      {sections.length === 0 || totalVisible === 0 ? (
        <div style={{ border: `1px dashed ${C.border}`, background: C.panel, borderRadius: 12, minHeight: 220, display: "grid", placeItems: "center", color: C.dim, textAlign: "center", padding: 24 }}>
          <div style={{ display: "grid", justifyItems: "center", gap: 9 }}>
            <CheckCircle2 size={26} color={C.green} />
            <div style={{ color: C.text, fontSize: 15, fontWeight: 900 }}>No hay pendientes para estos filtros</div>
            <div style={{ maxWidth: 360, fontSize: 12, lineHeight: 1.45 }}>
              Cuando aparezcan pedidos nuevos, urgentes, vencidos o avisos abiertos, van a quedar agrupados aca.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(330px, 1fr))", gap: 12, alignItems: "start" }}>
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <section key={section.key} style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "11px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 9 }}>
                  <Icon size={15} color={section.color} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 900 }}>{section.title}</div>
                    <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{section.subtitle}</div>
                  </div>
                  <span style={{ color: section.color, fontFamily: C.mono, fontSize: 13, fontWeight: 900 }}>{section.items.length}</span>
                </div>
                <div style={{ padding: 10, display: "grid", gap: 8 }}>
                  {section.items.length === 0 ? (
                    <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: 18, color: C.dim, fontSize: 12, textAlign: "center" }}>
                      Sin resultados
                    </div>
                  ) : section.items.slice(0, 12).map((item) => (
                    section.type === "aviso" ? avisoCard(item, section.color) : requestCard(item, section.color)
                  ))}
                  {section.items.length > 12 && (
                    <div style={{ color: C.dim, fontSize: 11, textAlign: "center", padding: "2px 0 4px" }}>
                      +{section.items.length - 12} mas. Usar busqueda o lista completa.
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

const AVISO_STATUSES = [
  { value: "nuevo", label: "Nuevo", color: C.blue },
  { value: "visto", label: "Visto", color: C.violet },
  { value: "en_proceso", label: "En proceso", color: C.amber },
  { value: "resuelto", label: "Resuelto", color: C.green },
  { value: "descartado", label: "Descartado", color: C.red },
];

const AVISO_ACTIVE_STATUSES = ["nuevo", "visto", "en_proceso"];

function avisoStatusMeta(status) {
  return AVISO_STATUSES.find((s) => s.value === status) || AVISO_STATUSES[0];
}

function AvisosPanel({
  profile,
  avisos,
  projects,
  selectedId,
  error,
  canManage = false,
  canCreate = false,
  title = "Avisos a compras",
  onSelect,
  onRefresh,
  onConvertToRequest,
}) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const [filters, setFilters] = useState({ q: "", estado: "activos", prioridad: "todos" });
  const [comment, setComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    detalle: "",
    material: "",
    destino: "",
    prioridad: "media",
  });

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return (avisos || []).filter((aviso) => {
      if (filters.estado === "activos") {
        if (!AVISO_ACTIVE_STATUSES.includes(aviso.estado)) return false;
      } else if (filters.estado === "archivados") {
        if (AVISO_ACTIVE_STATUSES.includes(aviso.estado)) return false;
      } else if (filters.estado !== "todos" && aviso.estado !== filters.estado) {
        return false;
      }
      if (filters.prioridad !== "todos" && aviso.prioridad !== filters.prioridad) return false;
      if (!q) return true;
      const haystack = [
        aviso.titulo,
        aviso.detalle,
        aviso.material,
        aviso.destino,
        aviso.project?.codigo,
        aviso.creator?.username,
        aviso.source_ref,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [avisos, filters]);

  const selected = useMemo(() => {
    if (!filtered.length && !avisos.length) return null;
    return avisos.find((aviso) => aviso.id === selectedId)
      || filtered[0]
      || avisos[0]
      || null;
  }, [avisos, filtered, selectedId]);

  useEffect(() => {
    if (!selectedId && selected?.id) onSelect?.(selected.id);
  }, [selectedId, selected?.id, onSelect]);

  const activeCount = avisos.filter((aviso) => AVISO_ACTIVE_STATUSES.includes(aviso.estado)).length;
  const archivedCount = avisos.length - activeCount;
  const showListPane = !isMobile || !mobileDetailOpen;
  const showDetailPane = !isMobile || mobileDetailOpen;

  function selectAviso(id) {
    onSelect?.(id);
    if (isMobile) setMobileDetailOpen(true);
  }

  async function handleCreateAviso(e) {
    e.preventDefault();
    if (!form.titulo.trim()) {
      toast.warning("Cargá un título para el aviso.");
      return;
    }
    setCreating(true);
    try {
      const destinoTxt = form.destino.trim();
      const projectMatch = destinoTxt
        ? projects.find((project) => String(project.codigo || "").toLowerCase() === destinoTxt.toLowerCase())
        : null;
      const aviso = await createComprasAviso({
        ...form,
        project_id: projectMatch?.id || null,
        destino: projectMatch ? null : destinoTxt,
      });
      notifyComprasEmail({
        type: "nuevo_aviso",
        avisoId: aviso.id,
        requestTitle: aviso.titulo,
        message: aviso.detalle || aviso.material || "",
        changedBy: profile?.id,
        createdByName: profile?.username || "Usuario",
        source: "web",
      });
      toast.success("Aviso creado.");
      setForm({ titulo: "", detalle: "", material: "", destino: "", prioridad: "media" });
      setShowCreate(false);
      await onRefresh?.();
      onSelect?.(aviso.id);
    } catch (err) {
      toast.error(err.message || "No se pudo crear el aviso.");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatus(nextStatus) {
    if (!selected) return;
    if (!canManage) return;
    const oldStatus = selected.estado;
    setSavingStatus(true);
    try {
      await updateComprasAviso(selected.id, { estado: nextStatus });
      notifyWaUpdate({
        avisoId: selected.id,
        eventType: "aviso_status",
        actorId: profile?.id,
        payload: {
          oldStatus,
          newStatus: nextStatus,
          actorName: profile?.username || "Compras",
        },
      });
      toast.success("Estado actualizado.");
      await onRefresh?.();
    } catch (err) {
      toast.error(err.message || "No se pudo actualizar el aviso.");
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleComment(e) {
    e.preventDefault();
    if (!selected || !comment.trim()) return;
    setSavingComment(true);
    try {
      await addComprasAvisoComentario(selected.id, comment);
      notifyWaUpdate({
        avisoId: selected.id,
        eventType: "aviso_comment",
        actorId: profile?.id,
        payload: {
          body: comment.trim(),
          actorName: profile?.username || "Usuario",
        },
      });
      setComment("");
      await onRefresh?.();
    } catch (err) {
      toast.error(err.message || "No se pudo guardar el comentario.");
    } finally {
      setSavingComment(false);
    }
  }

  async function handleDeleteAviso() {
    if (!selected || !canManage) return;
    const ok = window.confirm(`¿Borrar definitivamente el aviso "${selected.titulo}"?\n\nEsto elimina también el seguimiento y no queda archivado.`);
    if (!ok) return;
    try {
      await deleteComprasAviso(selected.id);
      toast.success("Aviso eliminado.");
      onSelect?.(null);
      await onRefresh?.();
    } catch (err) {
      toast.error(err.message || "No se pudo borrar el aviso.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <SectionTitle icon={AlertTriangle} title={title} count={filtered.length} />
        <span style={{ flex: 1 }} />
        {canCreate && (
          <button type="button" onClick={() => setShowCreate((v) => !v)} style={smallActionButton(showCreate ? C.amber : C.blue)}>
            {showCreate ? <X size={13} /> : <Plus size={13} />}
            {showCreate ? "Cerrar" : "Nuevo aviso"}
          </button>
        )}
      </div>

      {error && (
        <div style={{ border: `1px solid ${C.red}44`, background: `${C.red}10`, color: C.red, borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 650 }}>
          {error}
        </div>
      )}

      {canCreate && showCreate && (
        <form onSubmit={handleCreateAviso} style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr 130px", gap: 10 }}>
            <div>
              <div style={labelStyle}>Título</div>
              <input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} placeholder="Ej. Falta extintor reglamentario" style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Material / tema</div>
              <input value={form.material} onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))} placeholder="Extintor, chaleco, baterías..." style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Prioridad</div>
              <select value={form.prioridad} onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value }))} style={inputStyle}>
                {REQUEST_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.5fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <div style={labelStyle}>Obra / destino</div>
              <input value={form.destino} onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))} list="aviso-destinos" placeholder="K55-4 o Stock Pampa 1050" style={inputStyle} />
              <datalist id="aviso-destinos">
                {projects.map((project) => <option key={project.id} value={project.codigo} />)}
                {STOCK_DESTINOS.map((d) => <option key={d} value={d} />)}
              </datalist>
            </div>
            <div>
              <div style={labelStyle}>Detalle</div>
              <input value={form.detalle} onChange={(e) => setForm((f) => ({ ...f, detalle: e.target.value }))} placeholder="Contexto o aclaración para compras" style={inputStyle} />
            </div>
            <button type="submit" disabled={creating} style={{ ...smallActionButton(C.green, true), opacity: creating ? 0.6 : 1 }}>
              <CheckCircle2 size={13} />
              {creating ? "Guardando..." : "Crear"}
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
          <input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Buscar aviso, obra, material..." style={{ ...inputStyle, paddingLeft: 30 }} />
        </div>
        <select value={filters.estado} onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))} style={{ ...inputStyle, flex: "0 0 145px" }}>
          <option value="activos">Activos ({activeCount})</option>
          <option value="todos">Todos</option>
          {archivedCount > 0 && <option value="archivados">Archivados ({archivedCount})</option>}
          {AVISO_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filters.prioridad} onChange={(e) => setFilters((f) => ({ ...f, prioridad: e.target.value }))} style={{ ...inputStyle, flex: "0 0 130px" }}>
          <option value="todos">Prioridad</option>
          {REQUEST_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(300px, 0.95fr) minmax(360px, 1.25fr)",
        gap: 12,
        minHeight: 0,
      }}>
        {showListPane && (
          <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
            {filtered.length === 0 ? (
              <div style={{ border: `1px dashed ${C.border}`, borderRadius: 12, padding: 26, color: C.dim, textAlign: "center", fontSize: 13 }}>
                No hay avisos para mostrar.
              </div>
            ) : filtered.map((aviso) => (
              <AvisoListItem
                key={aviso.id}
                aviso={aviso}
                active={selected?.id === aviso.id}
                onClick={() => selectAviso(aviso.id)}
              />
            ))}
          </div>
        )}

        {showDetailPane && (
          <AvisoDetail
            aviso={selected}
            comment={comment}
            setComment={setComment}
            savingComment={savingComment}
            savingStatus={savingStatus}
            canManage={canManage}
            onStatus={handleStatus}
            onComment={handleComment}
            onConvertToRequest={onConvertToRequest}
            onDelete={handleDeleteAviso}
            onBack={isMobile ? () => setMobileDetailOpen(false) : null}
          />
        )}
      </div>
    </div>
  );
}

function AvisoListItem({ aviso, active, onClick }) {
  const status = avisoStatusMeta(aviso.estado);
  const prioColor = priorityColors[aviso.prioridad] || C.blue;
  return (
    <button type="button" onClick={onClick} style={{
      textAlign: "left",
      border: `1px solid ${active ? C.blue + "66" : C.border}`,
      background: active ? C.panelSolid2 : C.panelSolid,
      borderRadius: 10,
      padding: 12,
      color: C.text,
      cursor: "pointer",
      display: "grid",
      gap: 8,
      fontFamily: C.sans,
      boxShadow: active ? `inset 3px 0 0 ${C.blue}` : `inset 3px 0 0 ${C.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {aviso.titulo}
          </div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {aviso.material || "Sin material"} · {aviso.project?.codigo || aviso.destino || "Sin destino"}
          </div>
        </div>
        <Chip color={prioColor}>{aviso.prioridad || "media"}</Chip>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <Chip color={status.color}>{status.label}</Chip>
        <span style={{ color: C.dim, fontSize: 11 }}>{aviso.origen || "web"}</span>
        <span style={{ color: C.dim, fontSize: 11 }}>·</span>
        <span style={{ color: C.dim, fontSize: 11 }}>{fmtDate(aviso.created_at)}</span>
        {aviso.creator?.username && <span style={{ color: C.muted, fontSize: 11, marginLeft: "auto" }}>{aviso.creator.username}</span>}
      </div>
    </button>
  );
}

function AvisoDetail({ aviso, comment, setComment, savingComment, savingStatus, canManage, onStatus, onComment, onConvertToRequest, onDelete, onBack }) {
  if (!aviso) {
    return (
      <div style={{ border: `1px dashed ${C.border}`, borderRadius: 12, minHeight: 260, display: "grid", placeItems: "center", color: C.dim, fontSize: 13 }}>
        Seleccioná un aviso para ver el seguimiento.
      </div>
    );
  }
  const status = avisoStatusMeta(aviso.estado);
  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", minHeight: 360 }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            width: "100%",
            border: "none",
            borderBottom: `1px solid ${C.border}`,
            background: C.panelSolid,
            color: C.blue,
            padding: "10px 12px",
            textAlign: "left",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: C.sans,
          }}
        >
          Volver a avisos
        </button>
      )}
      <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.text, fontSize: 18, fontWeight: 850, lineHeight: 1.2 }}>{aviso.titulo}</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 5 }}>
              {aviso.project?.codigo || aviso.destino || "Sin destino"} · {aviso.creator?.username || aviso.source_ref || "Sin creador"} · {fmtDate(aviso.created_at)}
            </div>
          </div>
          <Chip color={status.color}>{status.label}</Chip>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Chip color={priorityColors[aviso.prioridad] || C.blue}>Prioridad {aviso.prioridad || "media"}</Chip>
          <Chip color={C.teal}>{aviso.origen || "web"}</Chip>
          {aviso.material && <Chip color={C.amber}>{aviso.material}</Chip>}
        </div>
        {aviso.detalle && (
          <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.45, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 9, padding: 10 }}>
            {aviso.detalle}
          </div>
        )}
        {canManage && (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
            {AVISO_STATUSES.map((s) => (
              <button key={s.value} type="button" disabled={savingStatus || aviso.estado === s.value} onClick={() => onStatus(s.value)} style={{
                border: `1px solid ${aviso.estado === s.value ? s.color + "66" : C.border}`,
                background: aviso.estado === s.value ? `${s.color}16` : "transparent",
                color: aviso.estado === s.value ? s.color : C.dim,
                borderRadius: 7,
                padding: "6px 9px",
                cursor: savingStatus || aviso.estado === s.value ? "default" : "pointer",
                fontSize: 12,
                fontWeight: 750,
              }}>
                {s.label}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            {onConvertToRequest && (
              <button type="button" onClick={() => onConvertToRequest?.(aviso)} style={smallActionButton(C.blue)}>
                <ShoppingCart size={13} />
                Convertir en pedido
              </button>
            )}
            <button type="button" onClick={onDelete} style={smallActionButton(C.red)}>
              <Trash2 size={13} />
              Borrar
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <MessageSquare size={14} color={C.blue} />
          <span style={{ color: C.text, fontSize: 13, fontWeight: 800 }}>Seguimiento</span>
          <span style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>{aviso.comentarios?.length || 0}</span>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {(aviso.comentarios || []).length === 0 ? (
            <div style={{ color: C.dim, fontSize: 12, padding: "12px 0" }}>Sin comentarios todavía.</div>
          ) : aviso.comentarios.map((c) => (
            <div key={c.id} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 10, background: C.panel2 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5 }}>
                <span style={{ color: C.text, fontWeight: 800, fontSize: 12 }}>{c.author?.username || "Usuario"}</span>
                <span style={{ color: C.dim, fontSize: 11 }}>{fmtDate(c.created_at)}</span>
              </div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{c.body}</div>
            </div>
          ))}
        </div>
        <form onSubmit={onComment} style={{ display: "grid", gap: 8 }}>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Agregar comentario de seguimiento..." style={{ ...inputStyle, resize: "vertical" }} />
          <button type="submit" disabled={savingComment || !comment.trim()} style={{ ...smallActionButton(C.green, true), justifySelf: "end", opacity: savingComment || !comment.trim() ? 0.55 : 1 }}>
            <MessageSquare size={13} />
            {savingComment ? "Guardando..." : "Comentar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function smallActionButton(color, solid = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: `1px solid ${color}44`,
    background: solid ? color : `${color}10`,
    color: solid ? "#08080a" : color,
    borderRadius: 8,
    padding: "7px 11px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    fontFamily: C.sans,
    whiteSpace: "nowrap",
  };
}

const DASHBOARD_PRIORITY_COLORS = {
  baja: C.dim,
  media: C.blue,
  alta: C.amber,
  urgente: C.red,
};

function StatCard({ label, value, color, icon, subtitle, trend }) {
  const Icon = icon;
  const hasTrend = Array.isArray(trend) && trend.length > 1;
  return (
    <div style={{
      padding: "15px 16px",
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      background: C.panel,
      minWidth: 0,
      display: "grid",
      gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {Icon && (
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: C.panel2,
            border: `1px solid ${C.border}`,
            color,
            flexShrink: 0,
          }}>
            <Icon size={15} />
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: C.muted, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 750, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {label}
          </div>
          <div style={{ color: C.text, fontSize: 24, fontWeight: 800, fontFamily: C.mono, marginTop: 2, lineHeight: 1 }}>
            {value}
          </div>
        </div>
        {hasTrend && (
          <div style={{ width: 86, height: 34, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {subtitle && (
        <div style={{ color: C.dim, fontSize: 11, borderTop: `1px solid ${C.border}`, paddingTop: 8, lineHeight: 1.35 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

class DashboardErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: 400, display: "grid", placeItems: "center", color: "var(--dim)", fontSize: 13 }}>
          Error al cargar el dashboard. {this.props.fallback}
        </div>
      );
    }
    return this.props.children;
  }
}

function DashboardView({ analytics, monthlySpending, overdueItems, loading, requests, onSelectRequest }) {
  const totals = analytics || {
    totalEstimated: 0,
    totalActual: 0,
    pending: 0,
    urgentes: 0,
    avgDays: 0,
    totalRequests: 0,
  };

  const dashboard = useMemo(() => {
    const list = requests || [];
    const monthly = monthlySpending || [];
    const overdue = overdueItems || [];
    const open = list.filter((r) => !ARCHIVED_STATUSES.includes(r.status));
    const statusCounts = REQUEST_STATUSES.reduce((acc, s) => ({ ...acc, [s.value]: 0 }), {});

    for (const request of list) {
      statusCounts[request.status] = (statusCounts[request.status] || 0) + 1;
    }

    const openCounts = {
      nuevo: open.filter((r) => r.status === "nuevo").length,
      en_revision: open.filter((r) => r.status === "en_revision").length,
      cotizando: open.filter((r) => r.status === "cotizando").length,
      comprado: open.filter((r) => r.status === "comprado").length,
    };

    const urgentPending = open
      .filter((r) => r.priority === "urgente")
      .sort((a, b) => new Date(a.estimated_delivery_at || a.needed_at || a.created_at || 0) - new Date(b.estimated_delivery_at || b.needed_at || b.created_at || 0));

    const quotePending = open.filter((r) => ["nuevo", "en_revision"].includes(r.status));
    const activeEstimated = open.reduce((sum, r) => sum + (Number(r.estimated_amount) || 0), 0);
    const activeActual = open.reduce((sum, r) => sum + (Number(r.actual_amount) || 0), 0);

    const statusFunnelData = ["nuevo", "en_revision", "cotizando", "comprado", "recibido"].map((status) => {
      const meta = REQUEST_STATUSES.find((s) => s.value === status);
      return {
        status,
        label: meta?.label || status,
        count: statusCounts[status] || 0,
        color: statusColors[status] || C.dim,
      };
    });

    const priorityData = REQUEST_PRIORITIES.map((p) => ({
      name: p.label,
      value: open.filter((r) => r.priority === p.value).length,
      color: DASHBOARD_PRIORITY_COLORS[p.value] || C.dim,
    })).filter((d) => d.value > 0);

    function topGroups(getKey) {
      const map = new Map();
      for (const request of open) {
        const key = getKey(request);
        map.set(key, (map.get(key) || 0) + 1);
      }
      return [...map.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
    }

    function monthKey(date) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }

    function monthLabel(key) {
      const [year, month] = key.split("-").map(Number);
      return new Date(year, month - 1, 1).toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
    }

    const monthlyMap = new Map(monthly.map((row) => [row.month, Number(row.total) || 0]));
    const sortedMonths = [...monthlyMap.keys()].sort();
    const anchorKey = sortedMonths[sortedMonths.length - 1] || monthKey(new Date());
    const [anchorYear, anchorMonth] = anchorKey.split("-").map(Number);
    const anchor = new Date(anchorYear, anchorMonth - 1, 1);
    const monthlyTrend = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      const key = monthKey(date);
      monthlyTrend.push({
        month: key,
        label: monthLabel(key),
        total: monthlyMap.get(key) || 0,
      });
    }

    const completed = list.filter((r) => ["comprado", "recibido"].includes(r.status) && r.created_at && r.updated_at);
    const cycleMap = new Map();
    const cycleDays = [];

    for (const request of completed) {
      const created = new Date(request.created_at);
      const updated = new Date(request.updated_at);
      if (Number.isNaN(created.getTime()) || Number.isNaN(updated.getTime())) continue;
      const key = monthKey(updated);
      const days = Math.max(0, Math.round((updated - created) / (1000 * 60 * 60 * 24)));
      const bucket = cycleMap.get(key) || [];
      bucket.push(days);
      cycleDays.push(days);
      cycleMap.set(key, bucket);
    }

    const cycleMonths = [...cycleMap.keys()].sort();
    const cycleAnchorKey = cycleMonths[cycleMonths.length - 1] || monthKey(new Date());
    const [cycleYear, cycleMonth] = cycleAnchorKey.split("-").map(Number);
    const cycleAnchor = new Date(cycleYear, cycleMonth - 1, 1);
    const cycleTrend = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(cycleAnchor.getFullYear(), cycleAnchor.getMonth() - i, 1);
      const key = monthKey(date);
      const values = cycleMap.get(key) || [];
      cycleTrend.push({
        month: key,
        label: monthLabel(key),
        value: values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : 0,
      });
    }

    return {
      open,
      openCounts,
      urgentPending,
      quotePending,
      activeEstimated,
      activeActual,
      statusFunnelData,
      priorityData,
      creatorData: topGroups((r) => usernameOf(r.creator) || "Sin usuario"),
      projectData: topGroups((r) => r.project?.codigo || r.destino || "Sin obra"),
      monthlyTrend,
      cycleTrend,
      avgCycleDays: cycleDays.length ? Math.round(cycleDays.reduce((sum, days) => sum + days, 0) / cycleDays.length) : 0,
      overdueItems: overdue,
    };
  }, [monthlySpending, overdueItems, requests]);

  const formatMoney = (value) => `$${Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
  const formatCompactMoney = (value) => {
    const n = Number(value || 0);
    if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}k`;
    return `$${n}`;
  };
  const budgetDiff = totals.totalEstimated - totals.totalActual;
  const openBudgetDiff = dashboard.activeEstimated - dashboard.activeActual;
  const chartTooltipStyle = {
    background: C.panelSolid,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    fontSize: 12,
  };
  const chartAxisTick = { fill: C.dim, fontSize: 11 };
  const panelStyle = {
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    background: C.panel,
    padding: 14,
    minWidth: 0,
  };
  const panelTitleStyle = {
    color: C.muted,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: 750,
  };
  const maxStatusCount = Math.max(...dashboard.statusFunnelData.map((d) => d.count), 1);
  const hasMonthlySpend = dashboard.monthlyTrend.some((d) => d.total > 0);
  const priorityTotal = dashboard.priorityData.reduce((sum, d) => sum + d.value, 0);
  const avgDays = dashboard.avgCycleDays || totals.avgDays || 0;
  const openSubtitle = `${dashboard.openCounts.nuevo} nuevos / ${dashboard.openCounts.cotizando} cotizando / ${dashboard.openCounts.comprado} por recibir`;
  const quoteSubtitle = `${dashboard.openCounts.nuevo} nuevos / ${dashboard.openCounts.en_revision} en revision`;

  function emptyState(text) {
    return (
      <div style={{ minHeight: 150, display: "grid", placeItems: "center", color: C.dim, fontSize: 12, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
        {text}
      </div>
    );
  }

  function requestMeta(item) {
    const creator = usernameOf(item.creator);
    const project = item.project?.codigo || item.destino || "Sin obra";
    return `${creator} / ${project}`;
  }

  function actionItem(item, tone, rightLabel) {
    const statusLabel = REQUEST_STATUSES.find((s) => s.value === item.status)?.label || item.status;
    const priorityLabel = REQUEST_PRIORITIES.find((p) => p.value === item.priority)?.label || item.priority;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelectRequest(item.id)}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "center",
          gap: 12,
          width: "100%",
          textAlign: "left",
          border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${tone}`,
          background: C.panel2,
          borderRadius: 9,
          padding: "10px 12px",
          cursor: "pointer",
          color: C.text,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.title}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4, color: C.dim, fontSize: 11 }}>
            <span>{requestMeta(item)}</span>
            <span style={{ color: C.border2 }}>/</span>
            <span style={{ color: tone, fontWeight: 700 }}>{priorityLabel}</span>
            <span style={{ color: C.border2 }}>/</span>
            <span>{statusLabel}</span>
          </div>
        </div>
        <span style={{
          color: tone,
          fontSize: 11,
          fontWeight: 800,
          fontFamily: C.mono,
          whiteSpace: "nowrap",
        }}>
          {rightLabel}
        </span>
      </button>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {[0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </div>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div style={{ minHeight: 400, display: "grid", placeItems: "center", color: C.dim, fontSize: 13 }}>
        Sin datos disponibles
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={panelTitleStyle}>Gestion de compras</div>
          <h2 style={{ margin: "4px 0 0", color: C.text, fontSize: 20, fontWeight: 850, letterSpacing: 0 }}>
            Tablero operativo
          </h2>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: C.dim, fontSize: 12 }}>
          <span>Solicitudes: <strong style={{ color: C.text, fontFamily: C.mono }}>{totals.totalRequests}</strong></span>
          <span>Remanente: <strong style={{ color: budgetDiff >= 0 ? C.green : C.red, fontFamily: C.mono }}>{formatMoney(Math.abs(budgetDiff))}</strong></span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <StatCard
          label="Pedidos abiertos"
          value={dashboard.open.length}
          color={C.amber}
          icon={ShoppingCart}
          subtitle={openSubtitle}
        />
        <StatCard
          label="Urgentes sin resolver"
          value={dashboard.urgentPending.length}
          color={dashboard.urgentPending.length > 0 ? C.red : C.green}
          icon={Package}
          subtitle={dashboard.urgentPending.length > 0 ? "Requieren seguimiento hoy" : "Sin urgentes pendientes"}
        />
        <StatCard
          label="Pendiente de cotizar"
          value={dashboard.quotePending.length}
          color={dashboard.quotePending.length > 0 ? C.violet : C.green}
          icon={Filter}
          subtitle={quoteSubtitle}
        />
        <StatCard
          label="Tiempo medio"
          value={`${avgDays}d`}
          color={avgDays <= 3 ? C.green : avgDays <= 7 ? C.amber : C.red}
          icon={Clock}
          subtitle="Nuevo -> recibido"
          trend={dashboard.cycleTrend}
        />
      </div>

      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={panelTitleStyle}>Funnel de estados</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Nuevo / En revision / Cotizando / Comprado / Recibido</div>
          </div>
          <BarChart3 size={18} color={C.blue} />
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={dashboard.statusFunnelData} layout="vertical" margin={{ top: 4, right: 24, left: 6, bottom: 4 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} domain={[0, maxStatusCount]} stroke={C.border} tick={chartAxisTick} />
            <YAxis type="category" dataKey="label" width={88} stroke={C.border} tick={chartAxisTick} />
            <Tooltip
              cursor={{ fill: C.panel2 }}
              contentStyle={chartTooltipStyle}
              labelStyle={{ color: C.text, fontWeight: 700 }}
              formatter={(value) => [`${value} pedidos`, "Cantidad"]}
            />
            <Bar dataKey="count" radius={[0, 7, 7, 0]} barSize={22}>
              {dashboard.statusFunnelData.map((entry) => <Cell key={entry.status} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={panelTitleStyle}>Tendencia mensual</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>Gasto real registrado en los ultimos 6 meses</div>
          </div>
          <div style={{ color: hasMonthlySpend ? C.green : C.dim, fontSize: 18, fontWeight: 850, fontFamily: C.mono }}>
            {formatMoney(dashboard.monthlyTrend.reduce((sum, d) => sum + d.total, 0))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={dashboard.monthlyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke={C.border} tick={chartAxisTick} />
            <YAxis stroke={C.border} tick={chartAxisTick} tickFormatter={formatCompactMoney} width={58} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={{ color: C.text, fontWeight: 700 }}
              formatter={(value) => [formatMoney(value), "Gastado"]}
            />
            <Area type="monotone" dataKey="total" stroke={C.blue} fill={C.blue} fillOpacity={0.14} strokeWidth={2} dot={{ r: 3, fill: C.blue }} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        <div style={panelStyle}>
          <div style={{ ...panelTitleStyle, marginBottom: 12 }}>Por prioridad</div>
          {dashboard.priorityData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value) => [`${value} pedidos`, "Cantidad"]}
                  />
                  <Pie data={dashboard.priorityData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3}>
                    {dashboard.priorityData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "grid", gap: 7 }}>
                {dashboard.priorityData.map((entry) => (
                  <div key={entry.name} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.muted }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: entry.color, flexShrink: 0 }} />
                      {entry.name}
                    </span>
                    <span style={{ color: C.text, fontFamily: C.mono, fontWeight: 800 }}>{entry.value}</span>
                  </div>
                ))}
                <div style={{ color: C.dim, fontSize: 11, borderTop: `1px solid ${C.border}`, paddingTop: 7 }}>
                  {priorityTotal} pedidos abiertos clasificados
                </div>
              </div>
            </>
          ) : emptyState("Sin pedidos abiertos")}
        </div>

        <div style={panelStyle}>
          <div style={{ ...panelTitleStyle, marginBottom: 12 }}>Top creadores</div>
          {dashboard.creatorData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dashboard.creatorData} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} stroke={C.border} tick={chartAxisTick} />
                <YAxis type="category" dataKey="name" width={92} stroke={C.border} tick={chartAxisTick} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => [`${value} pedidos`, "Cantidad"]} />
                <Bar dataKey="value" fill={C.violet} radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : emptyState("Sin creadores activos")}
        </div>

        <div style={panelStyle}>
          <div style={{ ...panelTitleStyle, marginBottom: 12 }}>Top obras</div>
          {dashboard.projectData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dashboard.projectData} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} stroke={C.border} tick={chartAxisTick} />
                <YAxis type="category" dataKey="name" width={86} stroke={C.border} tick={chartAxisTick} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => [`${value} pedidos`, "Cantidad"]} />
                <Bar dataKey="value" fill={C.teal} radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : emptyState("Sin obras activas")}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Clock size={14} color={C.red} />
            <span style={{ color: C.red, fontSize: 13, fontWeight: 800 }}>
              Vencidos ({dashboard.overdueItems.length})
            </span>
          </div>
          <div style={{ display: "grid", gap: 7 }}>
            {dashboard.overdueItems.length > 0
              ? dashboard.overdueItems.slice(0, 8).map((item) => {
                  const daysOverdue = Math.ceil((new Date() - new Date(item.estimated_delivery_at)) / (1000 * 60 * 60 * 24));
                  return actionItem(item, C.red, `-${daysOverdue}d`);
                })
              : emptyState("Sin pedidos vencidos")}
          </div>
        </div>

        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Package size={14} color={C.amber} />
            <span style={{ color: C.amber, fontSize: 13, fontWeight: 800 }}>
              Urgentes pendientes ({dashboard.urgentPending.length})
            </span>
          </div>
          <div style={{ display: "grid", gap: 7 }}>
            {dashboard.urgentPending.length > 0
              ? dashboard.urgentPending.slice(0, 8).map((item) => {
                  const due = item.estimated_delivery_at || item.needed_at;
                  const label = due ? fmtDate(due) : "Sin fecha";
                  return actionItem(item, C.amber, label);
                })
              : emptyState("Sin urgentes pendientes")}
          </div>
        </div>
      </div>

      <div style={{
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        background: C.panel,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        fontSize: 11,
        color: C.dim,
      }}>
        <span>{totals.totalRequests} solicitudes totales / {dashboard.open.length} abiertas</span>
        {totals.totalActual > 0 && (
          <span style={{ color: C.muted }}>
            Remanente total: <strong style={{ color: budgetDiff >= 0 ? C.green : C.red, fontFamily: C.mono }}>{formatMoney(Math.abs(budgetDiff))}</strong>
          </span>
        )}
        {dashboard.activeEstimated > 0 && (
          <span style={{ color: C.muted }}>
            Remanente abierto: <strong style={{ color: openBudgetDiff >= 0 ? C.green : C.red, fontFamily: C.mono }}>{formatMoney(Math.abs(openBudgetDiff))}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
function tabStyle(active) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: `1px solid ${active ? C.border2 : C.border}`,
    background: active ? C.panel2 : "transparent",
    color: active ? C.text : C.dim,
    borderRadius: 8,
    padding: "7px 11px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 750,
    transition: "all .12s",
  };
}

function TabBtn({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      border: "none",
      background: "transparent",
      color: active ? C.text : C.dim,
      cursor: "pointer",
      padding: "6px 10px",
      fontSize: 12,
      fontWeight: active ? 750 : 600,
      fontFamily: C.sans,
      borderRadius: 6,
      transition: "all .12s",
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
    }}>
      {children}
    </button>
  );
}
