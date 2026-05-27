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
  Users,
  X,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { CardSkeleton, RowSkeleton, Skeleton, SkeletonStyles } from "@/components/ui/Skeleton";
import PurchaseRequestDetail from "@/features/compras/PurchaseRequestDetail";
import PurchaseLogPanel from "@/features/compras/PurchaseLogPanel";
import {
  addRequestItem,
  createPurchaseRequest,
  deletePurchaseRequest,
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
  updatePurchaseRequest,
  usernameOf,
} from "@/features/compras/purchaseRequestsApi";

import "react-quill-new/dist/quill.snow.css";

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
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 8,
  padding: "9px 10px",
  outline: "none",
  fontSize: 12,
  fontFamily: C.sans,
};

const labelStyle = {
  color: C.dim,
  fontSize: 9,
  letterSpacing: 1.7,
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
      <h3 style={{ margin: 0, fontSize: 13, color: C.text, fontWeight: 750 }}>{title}</h3>
      {count !== undefined && (
        <span style={{
          color: C.dim,
          fontSize: 10,
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

function RequestCard({ request, onClick, profile, isUnread }) {
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

      <div style={{ padding: "10px 12px", display: "grid", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusDot status={request.status} />
          <span style={{
            fontSize: 13, fontWeight: 750, color: C.text,
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

        <div style={{ color: C.dim, fontSize: 10, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <span>{usernameOf(request.creator)}</span>
          {request.project?.codigo && <><span style={{ color: C.border2 }}>·</span><span style={{ fontFamily: C.mono, color: C.muted }}>{request.project.codigo}</span></>}
          <span style={{ color: C.border2 }}>·</span>
          <span>{fmtDate(request.created_at)}</span>
        </div>

        {request.description && (
          <div style={{
            color: C.muted, fontSize: 11, lineHeight: 1.4,
            overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
          }}>
            {extractText(request.description)}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
          <span style={{
            fontSize: 8, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase",
            color, background: `${color}14`, border: `1px solid ${color}28`,
            borderRadius: 5, padding: "1px 5px",
          }}>
            {REQUEST_STATUSES.find((s) => s.value === request.status)?.label || request.status}
          </span>
          <span style={{ flex: 1 }} />
          {(request.followers?.length || 0) > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: C.dim, fontSize: 9 }}>
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
};
const SOURCE_LABELS = {
  laminacion: "Laminación",
  madera: "Madera",
  inventario: "Inventario",
};

function RequestRow({ request, onClick, profile, isUnread }) {
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{
            fontSize: 13, fontWeight: 700, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {request.title}
          </span>
          {isUnread && <span title="Mensaje nuevo" style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, boxShadow: `0 0 6px ${dotColor}`, flexShrink: 0, animation: "pulse-dot 1.4s ease-in-out infinite" }} />}
          {srcColor && (
            <span style={{ fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: srcColor }}>
              {SOURCE_LABELS[request.source] || request.source}
            </span>
          )}
          <span style={{ color: priorityColors[request.priority], fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {REQUEST_PRIORITIES.find((p) => p.value === request.priority)?.label || request.priority}
          </span>
        </div>
        <div style={{ fontSize: 10, color: C.dim }}>
          {usernameOf(request.creator)}
          {request.project?.codigo ? ` · ${request.project.codigo}` : ""}
          {request.proveedor ? ` · ${request.proveedor}` : ""}
          {request.source_ref ? ` · #${request.source_ref}` : ""}
        </div>
      </div>

      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase",
        color, background: `${color}14`, border: `1px solid ${color}28`,
        borderRadius: 5, padding: "2px 7px",
      }}>
        {REQUEST_STATUSES.find((s) => s.value === request.status)?.label || request.status}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: C.dim, fontFamily: C.mono, whiteSpace: "nowrap" }}>
          {fmtDate(request.created_at)}
        </span>
        {request.photo_url && <ImagePlus size={11} color={C.dim} />}
        {(request.followers?.length || 0) > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: C.dim, fontSize: 9, fontFamily: C.mono }}>
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
        fontSize: 10,
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
          fontSize: 10,
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
        { value: "grid", Icon: LayoutGrid },
        { value: "list", Icon: LayoutList },
      ].map(({ value, Icon }) => (
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
          <Icon size={12} />
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
  needed_at: "",
};

const URL_FILTER_KEYS = ["q", "status", "priority", "creator", "project", "dateFrom", "dateTo"];

export default function PurchaseRequestsScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
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
  const [managerTab, setManagerTab] = useState("lista");
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
    status:   searchParams.get("status")   || "todos",
    priority: searchParams.get("priority") || "todos",
    creator:  searchParams.get("creator")  || "todos",
    project:  searchParams.get("project")  || "todos",
    dateFrom: searchParams.get("dateFrom") || "",
    dateTo:   searchParams.get("dateTo")   || "",
  }));

  // Sincronizar filtros + tab a la URL para que sean compartibles/back-friendly
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    URL_FILTER_KEYS.forEach((k) => {
      const v = filters[k];
      if (v && v !== "todos") next.set(k, v);
      else next.delete(k);
    });
    if (activeTab !== "mine") next.set("tab", activeTab);
    else next.delete("tab");
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeTab]);

  const manager = isPurchaseManager(profile);

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
  }, [managerTab, requests]);

  const mine = useMemo(() => requests.filter((r) => r.created_by === profile?.id), [requests, profile?.id]);
  const copied = useMemo(() => requests.filter((r) => (r.followers || []).some((f) => f.user_id === profile?.id)), [requests, profile?.id]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return requests.filter((request) => {
      if (filters.status !== "todos" && request.status !== filters.status) return false;
      if (filters.priority !== "todos" && request.priority !== filters.priority) return false;
      if (filters.creator !== "todos" && request.created_by !== filters.creator) return false;
      if (filters.project !== "todos" && request.project_id !== filters.project) return false;
      if (filters.dateFrom && request.created_at?.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && request.created_at?.slice(0, 10) > filters.dateTo) return false;
      if (!q) return true;
      const haystack = `${request.title || ""} ${request.description || ""} ${request.creator?.username || ""} ${request.project?.codigo || ""} ${request.proveedor || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [requests, filters]);

  const userFiltered = useMemo(() => {
    const base = activeTab === "mine" ? mine : copied;
    let list = showArchived ? base : base.filter((r) => !ARCHIVED_STATUSES.includes(r.status));
    const q = userSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        `${r.title || ""} ${r.description || ""} ${r.project?.codigo || ""} ${r.proveedor || ""}`.toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeTab, mine, copied, showArchived, userSearch]);

  const archivedCount = useMemo(() => {
    const base = activeTab === "mine" ? mine : copied;
    return base.filter((r) => ARCHIVED_STATUSES.includes(r.status)).length;
  }, [activeTab, mine, copied]);

  const visibleList = manager ? filtered : userFiltered;

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.q) n++;
    if (filters.status !== "todos") n++;
    if (filters.priority !== "todos") n++;
    if (filters.creator !== "todos") n++;
    if (filters.project !== "todos") n++;
    if (filters.dateFrom) n++;
    if (filters.dateTo) n++;
    return n;
  }, [filters]);

  function clearFilters() {
    setFilters({
      q: "", status: "todos", priority: "todos", creator: "todos",
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
      const request = await createPurchaseRequest({ form, ccUserIds, photoFile });
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
        select option { background: #0f0f12; color: #f4f4f5; }
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
          background: rgba(255,255,255,0.055) !important;
          border-color: rgba(255,255,255,0.18) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.32);
        }
        .purchase-card { transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease !important; }
        .purchase-card:active { transform: translateY(0); transition-duration: .05s !important; }
        .purchase-row:hover {
          background: rgba(255,255,255,0.055) !important;
          border-color: rgba(255,255,255,0.18) !important;
        }
        .purchase-row { transition: background .14s ease, border-color .14s ease; }
        .purchase-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .purchase-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 99px; }
        .stat-chip { transition: opacity .14s ease, background .14s ease, color .14s ease; }
        .stat-chip:hover { opacity: .85; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
        
        /* Ajustes para ReactQuill MODO OSCURO */
        .ql-toolbar.ql-snow {
          border: none !important;
          border-bottom: 1px solid rgba(255,255,255,0.08) !important;
          background: rgba(255,255,255,0.02) !important;
          padding: 8px 12px !important;
        }
        .ql-container.ql-snow {
          border: none !important;
          font-family: 'Outfit', sans-serif !important;
          font-size: 13px !important;
          color: #f4f4f5 !important;
        }
        .ql-editor {
          min-height: 180px !important; /* Más alto para mayor comodidad */
          padding: 14px !important;
        }
        .ql-editor.ql-blank::before {
          color: #71717a !important; /* Placeholder oscuro */
          font-style: normal !important;
        }
        /* Invertir colores de los iconos para fondo oscuro */
        .ql-snow .ql-stroke { stroke: #a1a1aa !important; }
        .ql-snow .ql-fill, .ql-snow .ql-stroke.ql-fill { fill: #a1a1aa !important; }
        .ql-snow.ql-toolbar button:hover .ql-stroke { stroke: #f4f4f5 !important; }
        .ql-snow.ql-toolbar button:hover .ql-fill { fill: #f4f4f5 !important; }
        .ql-snow.ql-toolbar button.ql-active .ql-stroke { stroke: #60a5fa !important; }
        .ql-snow.ql-toolbar button.ql-active .ql-fill { fill: #60a5fa !important; }
        /* Dropdowns de color */
        .ql-snow .ql-picker { color: #a1a1aa !important; }
        .ql-snow .ql-picker-options { background-color: #0f0f12 !important; border: 1px solid rgba(255,255,255,0.1) !important; }
        /* Tooltip de links */
        .ql-snow .ql-tooltip {
          background-color: #0f0f12 !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          color: #f4f4f5 !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
        }
        .ql-snow .ql-tooltip input[type="text"] {
          background-color: rgba(255,255,255,0.05) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          color: #f4f4f5 !important;
        }
        .ql-snow .ql-tooltip a { color: #60a5fa !important; }
      `}</style>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", height: "100%", overflow: "hidden" }}>
        <Sidebar profile={profile} signOut={signOut} />

        <main style={{ minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>

          <header style={{
            display: "grid",
            gap: 0,
            background: "rgba(12,12,14,0.95)",
            borderBottom: `1px solid ${C.border}`,
          }}>
            <div style={{
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
                <div style={{ display: "flex", gap: 2, marginLeft: 10 }}>
                  <TabBtn active={managerTab === "lista"} onClick={() => setManagerTab("lista")}>
                    <LayoutList size={12} /> Lista
                  </TabBtn>
                  <TabBtn active={managerTab === "dashboard"} onClick={() => setManagerTab("dashboard")}>
                    <BarChart3 size={12} /> Dashboard
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
                  fontSize: 11, fontWeight: 750,
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
                      placeholder="Buscar..." style={{ ...inputStyle, paddingLeft: 28, paddingTop: 7, paddingBottom: 7, fontSize: 12 }} />
                  </div>
                  <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} style={{ ...inputStyle, flex: "0 0 120px", paddingTop: 7, paddingBottom: 7, fontSize: 12 }}>
                    <option value="todos">Prioridad</option>
                    {REQUEST_PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  <select value={filters.creator} onChange={(e) => setFilters((f) => ({ ...f, creator: e.target.value }))} style={{ ...inputStyle, flex: "0 0 120px", paddingTop: 7, paddingBottom: 7, fontSize: 12 }}>
                    <option value="todos">Creador</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{usernameOf(user)}</option>)}
                  </select>
                  <select value={filters.project} onChange={(e) => setFilters((f) => ({ ...f, project: e.target.value }))} style={{ ...inputStyle, flex: "0 0 100px", paddingTop: 7, paddingBottom: 7, fontSize: 12 }}>
                    <option value="todos">Proyecto</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.codigo}</option>)}
                  </select>
                  <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} style={{ ...inputStyle, flex: "0 0 120px", paddingTop: 7, paddingBottom: 7, fontSize: 12 }} />
                  <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} style={{ ...inputStyle, flex: "0 0 120px", paddingTop: 7, paddingBottom: 7, fontSize: 12 }} />
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
                        fontSize: 11,
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
            gridTemplateColumns: showNew ? "480px 1fr" : "0 1fr",
            transition: "grid-template-columns .18s ease",
            overflow: "hidden",
          }}>
            <aside className="purchase-scroll" style={{
              overflowY: "auto",
              borderRight: showNew ? `1px solid ${C.border}` : "none",
              padding: showNew ? 14 : 0,
              height: "100%",
              minHeight: 0,
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
                        <div style={{ padding: 14, color: C.dim, fontSize: 12 }}>
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
                          fontSize: 12,
                        }}>
                          <div>
                            <span style={{ color: C.text }}>{item.description}</span>
                            {item.link_url && (
                              <a href={item.link_url} target="_blank" rel="noreferrer" style={{
                                display: "inline-flex", alignItems: "center", gap: 3,
                                marginLeft: 6, color: C.amber, fontSize: 9, textDecoration: "none",
                              }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                Enlace
                              </a>
                            )}
                          </div>
                          <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 11 }}>
                            {item.quantity} {item.unit}
                          </span>
                          <button type="button" onClick={() => removeCreateItem(i)}
                            style={{ padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontSize: 11,
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
                            style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }} />
                          <input value={newItemLink} onChange={e => setNewItemLink(e.target.value)}
                            placeholder="Enlace (opcional)"
                            style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.amber, fontSize: 11 }} />
                        </div>
                        <input value={newItemQty} onChange={e => setNewItemQty(e.target.value)}
                          placeholder="Cant."
                          style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }} />
                        <select value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)}
                          style={{ padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}>
                          <option value="unidad">unidad</option>
                          <option value="par">par</option>
                          <option value="metro">metro</option>
                          <option value="m²">m²</option>
                          <option value="kg">kg</option>
                          <option value="litro">litro</option>
                        </select>
                        <button type="button" onClick={addCreateItem}
                          style={{ padding: "6px 10px", borderRadius: 5, cursor: "pointer", fontSize: 11,
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
                    <div style={labelStyle}>Proyecto / casco</div>
                    <select value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))} style={inputStyle}>
                      <option value="">Sin proyecto</option>
                      {projects.map((project) => <option key={project.id} value={project.id}>{project.codigo}</option>)}
                    </select>
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
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
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
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}
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
                            <div style={{ color: C.dim, fontSize: 11, padding: "12px 8px", textAlign: "center" }}>
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
                              <span style={{ color: C.text, fontSize: 12 }}>{usernameOf(user)}</span>
                              <span style={{ color: C.dim, fontSize: 10, textTransform: "uppercase", marginLeft: "auto" }}>{user.role}</span>
                            </label>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div style={{ color: "#fca5a5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", padding: 9, borderRadius: 8, fontSize: 12 }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      border: "none",
                      borderRadius: 8,
                      background: saving ? C.panel2 : "#f4f4f5",
                      color: saving ? C.dim : "#08080a",
                      padding: "11px 12px",
                      cursor: saving ? "default" : "pointer",
                      fontWeight: 800,
                      fontSize: 12,
                      fontFamily: C.sans,
                      transition: "all .13s",
                    }}
                  >
                    {saving ? "Guardando..." : "Crear solicitud"}
                  </button>
                </form>
              )}
            </aside>

            <section style={{ minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>

              {!manager && (
                <div style={{
                  padding: "10px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderBottom: `1px solid ${C.border}`,
                  background: "rgba(12,12,14,0.72)",
                  flexWrap: "wrap",
                }}>
                  <button type="button" onClick={() => setActiveTab("mine")} style={tabStyle(activeTab === "mine")}>
                    <Inbox size={13} /> Mis pedidos
                    <span style={{ fontFamily: C.mono, fontSize: 10, color: activeTab === "mine" ? C.blue : C.dim }}>
                      {mine.filter((r) => !ARCHIVED_STATUSES.includes(r.status)).length}
                    </span>
                  </button>
                  <button type="button" onClick={() => setActiveTab("cc")} style={tabStyle(activeTab === "cc")}>
                    <Users size={13} /> En copia
                    <span style={{ fontFamily: C.mono, fontSize: 10, color: activeTab === "cc" ? C.blue : C.dim }}>
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
                        fontSize: 11,
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
                {manager && managerTab === "registro" ? (
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
                        padding: "0 0 8px", fontSize: 11,
                      }}>
                        <span style={{ color: C.muted, fontWeight: 700 }}>Todas las solicitudes</span>
                        <span style={{ color: C.dim, fontSize: 10, fontFamily: C.mono }}>{visibleList.length}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ color: C.dim, fontSize: 10 }}>
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
                          <div style={{ fontSize: 10, color: C.dim, marginTop: -6, marginBottom: 6 }}>
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
                        fontSize: 12,
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
                          <div style={{ color: C.muted, fontWeight: 700, fontSize: 13 }}>
                            No hay solicitudes para mostrar
                          </div>
                          {!manager ? (
                            <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}>
                              {activeTab === "mine"
                                ? "Cuando crees un pedido aparecerá acá."
                                : "Cuando te sumen como copia a un pedido, lo vas a ver acá."}
                            </div>
                          ) : (
                            <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}>
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
                                fontSize: 11,
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
                    ) : viewMode === "grid" ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
                        {visibleList.map((request) => (
                          <RequestCard key={request.id} request={request} profile={profile} isUnread={unreadIds.has(request.id)} onClick={() => { markRead(request.id, request.last_comment_author_id); setSelectedId(request.id); }} />
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 5 }}>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto",
                          alignItems: "center",
                          gap: 10,
                          padding: "4px 16px",
                          color: C.dim,
                          fontSize: 9,
                          letterSpacing: 1.5,
                          textTransform: "uppercase",
                          fontWeight: 750,
                        }}>
                          <span>Solicitud</span>
                          <span style={{ textAlign: "center", width: 60 }}>Estado</span>
                          <span style={{ textAlign: "right", width: 80 }}>Fecha</span>
                        </div>
                        {visibleList.map((request) => (
                          <RequestRow key={request.id} request={request} profile={profile} isUnread={unreadIds.has(request.id)} onClick={() => { markRead(request.id, request.last_comment_author_id); setSelectedId(request.id); }} />
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
  baja: "#71717a",
  media: "#60a5fa",
  alta: "#f59e0b",
  urgente: "#ef4444",
};

function StatCard({ label, value, color, icon, subtitle }) {
  const Icon = icon;
  return (
    <div style={{
      padding: "14px 16px",
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      background: C.panel,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        {Icon && (
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: `${color}16`,
            border: `1px solid ${color}30`,
            color,
          }}>
            <Icon size={15} />
          </div>
        )}
        <div>
          <div style={{ color: C.muted, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>
            {label}
          </div>
          <div style={{ color: C.text, fontSize: 22, fontWeight: 800, fontFamily: C.mono, marginTop: 1 }}>
            {value}
          </div>
        </div>
      </div>
      {subtitle && (
        <div style={{ color: C.dim, fontSize: 10, borderTop: `1px solid ${C.border}`, paddingTop: 7, marginTop: 2 }}>
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
        <div style={{ minHeight: 400, display: "grid", placeItems: "center", color: "#71717a", fontSize: 12 }}>
          Error al cargar el dashboard. {this.props.fallback}
        </div>
      );
    }
    return this.props.children;
  }
}

function DashboardView({ analytics, monthlySpending, overdueItems, loading, requests, onSelectRequest }) {
  if (loading) {
    return (
      <div style={{ minHeight: 400, display: "grid", placeItems: "center", color: C.dim, fontSize: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${C.border2}`, borderTopColor: C.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Cargando dashboard...
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div style={{ minHeight: 400, display: "grid", placeItems: "center", color: C.dim, fontSize: 12 }}>
        Sin datos disponibles
      </div>
    );
  }

  const budgetDiff = analytics.totalEstimated - analytics.totalActual;
  const priorityData = [
    { name: "Baja", value: requests.filter((r) => r.priority === "baja" && !["recibido", "cancelado"].includes(r.status)).length, color: "#71717a" },
    { name: "Media", value: requests.filter((r) => r.priority === "media" && !["recibido", "cancelado"].includes(r.status)).length, color: "#60a5fa" },
    { name: "Alta", value: requests.filter((r) => r.priority === "alta" && !["recibido", "cancelado"].includes(r.status)).length, color: "#f59e0b" },
    { name: "Urgente", value: requests.filter((r) => r.priority === "urgente" && !["recibido", "cancelado"].includes(r.status)).length, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <StatCard
          label="Pendientes"
          value={analytics.pending}
          color={C.amber}
          icon={ShoppingCart}
          subtitle={`${analytics.urgentes} urgentes sin resolver`}
        />
        <StatCard
          label="Presupuestado"
          value={`$${Number(analytics.totalEstimated).toLocaleString("es-AR", { minimumFractionDigits: 0 })}`}
          color={C.blue}
          icon={Filter}
        />
        <StatCard
          label="Gastado"
          value={`$${Number(analytics.totalActual).toLocaleString("es-AR", { minimumFractionDigits: 0 })}`}
          color={analytics.totalActual > analytics.totalEstimated ? C.red : C.green}
          icon={ShoppingCart}
          subtitle={
            analytics.totalEstimated > 0
              ? analytics.totalActual <= analytics.totalEstimated
                ? `${((analytics.totalActual / analytics.totalEstimated) * 100).toFixed(0)}% del presupuesto`
                : `${((analytics.totalActual / analytics.totalEstimated - 1) * 100).toFixed(0)}% excedente`
              : ""
          }
        />
        <StatCard
          label="Tiempo promedio"
          value={`${analytics.avgDays}d`}
          color={analytics.avgDays <= 3 ? C.green : analytics.avgDays <= 7 ? C.amber : C.red}
          icon={Clock}
          subtitle="Nuevo → Comprado/Recibido"
        />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: monthlySpending.length && priorityData.length ? "1fr 1fr" : "1fr", gap: 12 }}>
        {monthlySpending.length > 0 && (
          <div style={{
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            background: C.panel,
            padding: 14,
          }}>
            <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", fontWeight: 750, marginBottom: 12 }}>
              Gasto mensual
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {(() => {
                const maxTotal = Math.max(...monthlySpending.map(d => d.total));
                return monthlySpending.map((d) => (
                  <div key={d.month} style={{ display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: C.dim, fontFamily: C.mono, textAlign: "right" }}>
                      {d.month}
                    </span>
                    <div style={{ height: 20, borderRadius: 4, background: C.border, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.max(2, (d.total / maxTotal) * 100)}%`, background: C.blue, borderRadius: 4, transition: "width .4s" }} />
                    </div>
                    <span style={{ fontSize: 9, color: C.muted, fontFamily: C.mono }}>
                      ${Number(d.total).toLocaleString("es-AR", { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {priorityData.length > 0 && (
          <div style={{
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            background: C.panel,
            padding: 14,
          }}>
            <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", fontWeight: 750, marginBottom: 12 }}>
              Pendientes por prioridad
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {(() => {
                const maxVal = Math.max(...priorityData.map(d => d.value));
                return priorityData.map((d) => (
                  <div key={d.name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, display: "inline-block", flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: C.muted }}>{d.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 80, height: 14, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.max(2, (d.value / maxVal) * 100)}%`, background: d.color, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, color: C.text, fontWeight: 700, fontFamily: C.mono, minWidth: 20, textAlign: "right" }}>{d.value}</span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Overdue Items */}
      {overdueItems.length > 0 && (
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          background: C.panel,
          padding: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Clock size={14} color={C.red} />
            <span style={{ color: C.red, fontSize: 12, fontWeight: 750, letterSpacing: 0.5 }}>
              Pedidos vencidos ({overdueItems.length})
            </span>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {overdueItems.map((item) => {
              const daysOverdue = Math.ceil(
                (new Date() - new Date(item.estimated_delivery_at)) / (1000 * 60 * 60 * 24),
              );
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectRequest(item.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    border: `1px solid ${C.border}`,
                    background: "rgba(239,68,68,0.04)",
                    borderRadius: 8,
                    padding: "9px 12px",
                    cursor: "pointer",
                    color: C.text,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                      {usernameOf(item.creator)} · {item.project?.codigo || "Sin proyecto"}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10,
                    color: C.red,
                    fontWeight: 700,
                    fontFamily: C.mono,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: 5,
                    padding: "2px 7px",
                  }}>
                    -{daysOverdue}d
                  </span>
                  <span style={{
                    ...priorityColors[item.priority],
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}>
                    {REQUEST_PRIORITIES.find((p) => p.value === item.priority)?.label || item.priority.toLowerCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom stats */}
      <div style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        background: C.panel,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 10,
        color: C.dim,
      }}>
        <span>{analytics.totalRequests} solicitudes totales</span>
        {analytics.totalActual > 0 && (
          <span style={{ color: C.muted }}>
            Presupuesto remanente: <strong style={{ color: budgetDiff >= 0 ? C.green : C.red, fontFamily: C.mono }}>
              ${Math.abs(budgetDiff).toLocaleString("es-AR", { minimumFractionDigits: 0 })}
            </strong> {budgetDiff >= 0 ? "disponibles" : "excedidos"}
          </span>
        )}
        {overdueItems.length > 0 && (
          <span style={{ color: C.red }}>
            {overdueItems.length} pedido{overdueItems.length > 1 ? "s" : ""} vencido{overdueItems.length > 1 ? "s" : ""}
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
    fontSize: 12,
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
      fontSize: 11,
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
