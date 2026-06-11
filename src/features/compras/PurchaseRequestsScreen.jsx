import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Archive,
  BarChart3,
  Clock,
  Filter,
  ImagePlus,
  Inbox,
  LayoutGrid,
  LayoutList,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Table2,
  Users,
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
import PurchaseRequestDetail from "@/features/compras/PurchaseRequestDetail";
import PurchaseLogPanel from "@/features/compras/PurchaseLogPanel";
import {
  addRequestItem,
  createPurchaseRequest,
  fetchAnalyticsStats,
  fetchMonthlySpending,
  fetchOverdueRequests,
  fetchProfiles,
  fetchProjects,
  fetchPurchaseRequests,
  isPurchaseManager,
  notifyComprasEmail,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
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

const URL_FILTER_KEYS = ["q", "status", "priority", "creator", "project", "dateFrom", "dateTo"];
const MANAGER_TABS = ["lista", "dashboard", "registro", "adicionales"];

export default function PurchaseRequestsScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(() => searchParams.get("open") || null);
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") === "cc" ? "cc" : "mine");
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
    return MANAGER_TABS.includes(tab) ? tab : "lista";
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
  const submittingRef = useRef(false);

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
      if (managerTab !== "lista") next.set("tab", managerTab);
      else next.delete("tab");
    } else if (activeTab !== "mine") next.set("tab", activeTab);
    else next.delete("tab");
    if (selectedId) next.set("open", selectedId);
    else next.delete("open");
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeTab, selectedId, manager, managerTab]);

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

  useEffect(() => {
    if (manager) setShowNew(false);
  }, [manager]);

  async function loadAll() {
    setError("");
    setLoading(true);
    try {
      const [reqRows, userRows, projectRows] = await Promise.all([
        fetchPurchaseRequests(),
        fetchProfiles(),
        fetchProjects(),
      ]);
      setRequests(reqRows);
      setUsers(userRows);
      setProjects(projectRows);
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

  // Agrupado por estado cuando se ve "Activos" o "Todos" (manager). En un estado
  // puntual no agrupa (todas son del mismo). Mantiene el orden del flujo de compras.
  const grouped = useMemo(() => {
    const shouldGroup = manager && (filters.status === "activos" || filters.status === "todos");
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

  async function handleCreate(e) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!form.title.trim()) {
      setError("El título es obligatorio.");
      toast.warning("El título es obligatorio.");
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
      setForm(emptyForm);
      setCcUserIds([]);
      setPhotoFile(null);
      setCreateItems([]);
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
    if (!desc) return;
    setCreateItems((prev) => [...prev, { description: desc, quantity: newItemQty.trim() || null, unit: newItemUnit, link_url: newItemLink.trim() || null }]);
    setNewItemDesc("");
    setNewItemQty("");
    setNewItemUnit("unidad");
    setNewItemLink("");
  }

  function removeCreateItem(i) {
    setCreateItems((prev) => prev.filter((_, idx) => idx !== i));
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
        select option { background: #0f0f12; color: var(--text); }
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
              padding: isMobile ? "0 12px 0 52px" : "0 16px",
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
                  <TabBtn active={managerTab === "lista"} onClick={() => setManagerTab("lista")}>
                    <LayoutList size={12} /> Lista
                  </TabBtn>
                  <TabBtn active={managerTab === "dashboard"} onClick={() => setManagerTab("dashboard")}>
                    <BarChart3 size={12} /> Dashboard
                  </TabBtn>
                  <TabBtn active={managerTab === "adicionales"} onClick={() => setManagerTab("adicionales")}>
                    <Table2 size={12} /> Adicionales
                  </TabBtn>
                  <TabBtn active={managerTab === "registro"} onClick={() => setManagerTab("registro")}>
                    <Package size={12} /> Registro
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
            overflow: "hidden",
          }}>
            <aside className="purchase-scroll" style={{
              overflowY: "auto",
              borderRight: showNew && !isMobile ? `1px solid ${C.border}` : "none",
              padding: showNew ? (isMobile ? 12 : 14) : 0,
              height: "100%",
              minHeight: 0,
              display: isMobile && !showNew ? "none" : "block",
            }}>
              {showNew && (
                <form onSubmit={handleCreate} style={{ display: "grid", gap: 13 }}>
                  <SectionTitle icon={Plus} title="Nuevo pedido" count="" />

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
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      background: C.panel,
                      overflow: "hidden",
                    }}>
                      {createItems.map((item, i) => (
                        <div key={i} style={{
                          display: "grid", gridTemplateColumns: "1fr 60px auto",
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
                        display: "grid", gridTemplateColumns: "1fr 70px 100px auto",
                        gap: 5, padding: 7,
                      }}>
                        <div style={{ display: "grid", gap: 3 }}>
                          <input value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCreateItem(); } }}
                            placeholder="Descripción del ítem"
                            style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
                          <input value={newItemLink} onChange={e => setNewItemLink(e.target.value)}
                            placeholder="Enlace (opcional)"
                            style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.amber, fontSize: 12 }} />
                        </div>
                        <input value={newItemQty} onChange={e => setNewItemQty(e.target.value)}
                          placeholder="Cant."
                          style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
                        <select value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)}
                          style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}>
                          <option value="unidad">unidad</option>
                          <option value="par">par</option>
                          <option value="metro">metro</option>
                          <option value="m²">m²</option>
                          <option value="kg">kg</option>
                          <option value="litro">litro</option>
                        </select>
                        <button type="button" onClick={addCreateItem}
                          style={{ padding: "6px 10px", borderRadius: 5, cursor: "pointer", fontSize: 12,
                            border: `1px solid ${C.blue}`, background: "rgba(59,130,246,0.15)", color: C.blue, fontWeight: 600 }}>+</button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                      color: saving ? C.dim : "#08080a",
                      padding: "11px 12px",
                      cursor: saving ? "default" : "pointer",
                      fontWeight: 800,
                      fontSize: 13,
                      fontFamily: C.sans,
                      transition: "all .13s",
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

                  {archivedCount > 0 && (
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

                  <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
                </div>
              )}

              <div className="purchase-scroll" style={{ minHeight: 0, overflowY: "auto", padding: 16 }}>
                {manager && managerTab === "adicionales" ? (
                  <AdditionalPurchasesPanel
                    profile={profile}
                    projects={projects}
                    requests={requests}
                    onSelectRequest={(id) => setSelectedId(id)}
                    onRequestCreated={loadAll}
                  />
                ) : manager && managerTab === "registro" ? (
                  <PurchaseLogPanel profile={profile} />
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
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
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
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
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
