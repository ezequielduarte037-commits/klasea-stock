import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Bike,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CloudRain,
  CloudSun,
  Clock3,
  FileClock,
  FileText,
  History,
  ImageIcon,
  MapPin,
  Merge,
  PackageOpen,
  Paperclip,
  Plus,
  Download,
  RefreshCw,
  Route,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  Truck,
  Upload,
  UserRound,
  Wind,
  X,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";
import {
  actualizarEstadoMovimiento,
  actualizarSolicitudLogistica,
  agruparMovimientos,
  cargarHistorialMovimiento,
  confirmarMovimiento,
  confirmarFechaAceptadaMovimiento,
  crearMovimientoManualLogistica,
  crearSolicitudLogistica,
  eliminarArchivoMovimiento,
  eliminarMovimientoLogistico,
  guardarCostoMovimiento,
  listarHitosCalendario,
  listarArchivosMovimiento,
  listarMovimientosLogisticos,
  listarObrasActivas,
  proponerFechaMovimiento,
  rechazarUnionMovimientos,
  responderFechaMovimiento,
  subirArchivosMovimiento,
} from "./calendarioLogisticaApi";

const TRANSPORTES = {
  flete: { label: "Flete", color: C.blue, soft: C.blueL, border: C.blueB, proveedores: ["Hugo", "Dani"] },
  camion: { label: "Camión", color: C.violet, soft: C.violetL, border: C.violetB, proveedores: ["Degiovani"] },
  hidrogrua: { label: "Hidrogrúa", color: C.teal, soft: C.tealL, border: C.tealB, proveedores: ["Hidrogrúas Flor"] },
  grua: { label: "Grúa", color: C.cyan, soft: C.cyanL, border: C.cyanB, proveedores: ["Grúas Delta", "Grúas Queco"] },
  motomensajeria: { label: "Motomensajería", color: C.orange, soft: "var(--orange-soft)", border: "var(--orange-border)", proveedores: [] },
  otro: { label: "Otro", color: C.muted, soft: C.panel2, border: C.border2, proveedores: [] },
};

const PLANTILLAS = [
  {
    codigo: "desmolde",
    nombre: "Desmolde",
    detalle: "2 grúas + 1 camión · Pampa a Chubut",
    modalidad: "traslado",
    carga: "Desmolde de casco / cubierta",
    transportes: [{ tipo: "grua", cantidad: 2, proveedor: "" }, { tipo: "camion", cantidad: 1, proveedor: "" }],
    paradas: [
      { tipo: "origen", lugar: "Galpón Pampa", direccion: "", recibe: "", telefono: "" },
      { tipo: "destino", lugar: "Galpón Chubut", direccion: "", recibe: "", telefono: "" },
    ],
  },
  {
    codigo: "traslado_techo",
    nombre: "Traslado de techo",
    detalle: "1 hidrogrúa realiza todo el traslado",
    modalidad: "traslado",
    carga: "Traslado de techo",
    transportes: [{ tipo: "hidrogrua", cantidad: 1, proveedor: "" }],
    paradas: [
      { tipo: "origen", lugar: "Galpón Pampa", direccion: "", recibe: "", telefono: "" },
      { tipo: "destino", lugar: "Galpón Chubut", direccion: "", recibe: "", telefono: "" },
    ],
  },
  {
    codigo: "trabajo_en_sitio",
    nombre: "Trabajo en un galpón",
    detalle: "Grúa o hidrogrúa sin traslado",
    modalidad: "trabajo_en_sitio",
    carga: "Trabajo de izaje",
    transportes: [{ tipo: "grua", cantidad: 1, proveedor: "" }],
    paradas: [{ tipo: "lugar", lugar: "", direccion: "", recibe: "", telefono: "" }],
  },
];

const ESTADOS = {
  solicitado: { label: "Pendiente de coordinación", short: "Pendiente", color: C.blue, soft: C.blueL, border: C.blueB },
  fecha_propuesta: { label: "Esperando respuesta", short: "A confirmar", color: C.violet, soft: C.violetL, border: C.violetB },
  fecha_aceptada: { label: "Aceptada · confirma Compras", short: "Aceptada", color: C.cyan, soft: C.cyanL, border: C.cyanB },
  confirmado: { label: "Confirmado", short: "Confirmado", color: C.green, soft: C.greenL, border: C.greenB },
  realizado: { label: "Realizado", short: "Realizado", color: C.teal, soft: C.tealL, border: C.tealB },
  cancelado: { label: "Cancelado", short: "Cancelado", color: C.red, soft: C.redL, border: C.redB },
};

const VISTAS = [
  { id: "agenda", label: "Agenda", icon: FileClock },
  { id: "calendario", label: "Calendario", icon: CalendarDays },
  { id: "solicitudes", label: "Solicitudes", icon: PackageOpen },
  { id: "costos", label: "Costos", icon: CircleDollarSign, managerOnly: true },
];

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CALENDAR_COLUMNS = "repeat(5,minmax(132px,1fr)) repeat(2,minmax(96px,.62fr))";
const ARCHIVO_CATEGORIAS = {
  remito: { label: "Remito", color: C.teal },
  factura: { label: "Factura", color: C.violet },
  foto: { label: "Foto", color: C.blue },
  otro: { label: "Otro archivo", color: C.muted },
};

function localDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MODULE_NOW = new Date();
const TODAY = localDate(MODULE_NOW);

function parseDate(value) {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateAdd(value, days) {
  const date = parseDate(value) || parseDate(TODAY);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function dateDiffHours(date, time) {
  if (!date) return Infinity;
  const target = new Date(`${date}T${time || "23:59"}:00`);
  return (target.getTime() - MODULE_NOW.getTime()) / 3600000;
}

function fmtFileSize(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function fmtDate(value, long = false) {
  const date = parseDate(value);
  if (!date) return "Sin fecha";
  return date.toLocaleDateString("es-AR", long
    ? { weekday: "short", day: "2-digit", month: "long" }
    : { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fmtMoney(value, currency = "ARS") {
  if (value == null || value === "") return "Sin cargar";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
}

function cleanTime(value) {
  return value ? String(value).slice(0, 5) : "";
}

function weatherLabel(code) {
  if (code === 0) return "Despejado";
  if (code <= 3) return "Parcialmente nublado";
  if (code === 45 || code === 48) return "Niebla";
  if (code >= 51 && code <= 82) return "Lluvia";
  if (code >= 95) return "Tormenta";
  return "Pronóstico";
}

function hasCrane(row) {
  return transportsOf(row).some((item) => item.tipo === "grua" || item.tipo === "hidrogrua");
}

function displayDate(row) {
  return row.fecha_confirmada || row.fecha_propuesta || row.fecha_solicitada || row.fecha;
}

function displayTime(row) {
  return cleanTime(row.hora_confirmada || row.hora_propuesta || row.hora_solicitada || row.hora);
}

function statusUi(status) {
  return ESTADOS[status] || ESTADOS.solicitado;
}

function transportUi(type) {
  return TRANSPORTES[type] || TRANSPORTES.otro;
}

function TransportIcon({ type, size = 14 }) {
  return type === "motomensajeria" ? <Bike size={size} /> : <Truck size={size} />;
}

function transportsOf(row) {
  if (Array.isArray(row?.transportes) && row.transportes.length) {
    return row.transportes.filter((item) => item?.tipo && Number(item.cantidad) > 0);
  }
  return [{ tipo: row?.tipo_transporte || "otro", cantidad: 1, proveedor: row?.proveedor_logistico || "" }];
}

function transportSummary(row, includeProviders = false) {
  return transportsOf(row).map((item) => {
    const base = `${Number(item.cantidad) || 1} ${transportUi(item.tipo).label}${Number(item.cantidad) > 1 ? "s" : ""}`;
    return includeProviders && item.proveedor ? `${base} · ${item.proveedor}` : base;
  }).join(" + ");
}

function providerSummary(row) {
  const names = [...new Set(transportsOf(row).map((item) => item.proveedor).filter(Boolean))];
  return names.join(" + ") || row?.proveedor_logistico || "Sin proveedor";
}

function actorName(profile) {
  return profile?.username || profile?.nombre_completo || "Sin registrar";
}

function routeLabel(row) {
  const stops = Array.isArray(row.paradas) ? row.paradas : [];
  if (!stops.length) return row.modalidad === "trabajo_en_sitio" ? "Lugar sin cargar" : "Recorrido sin cargar";
  if (row.modalidad === "trabajo_en_sitio") return `Trabajo en ${stops[0]?.lugar || stops[0]?.direccion || "lugar a confirmar"}`;
  return stops.map((stop) => stop.lugar || stop.direccion || "Parada").filter(Boolean).join(" → ");
}

function movementHeadline(row) {
  const resources = transportsOf(row);
  const transport = resources.length === 1 && Number(resources[0].cantidad || 1) === 1
    ? transportUi(resources[0].tipo).label
    : transportSummary(row);
  return `${transport} · ${row.carga || row.titulo || "Movimiento"}`;
}

function pairWasRejected(first, second) {
  return (first?.union_estado === "rechazada" && first?.viaje_sugerido_id === second?.id)
    || (second?.union_estado === "rechazada" && second?.viaje_sugerido_id === first?.id);
}

function sameTripCandidates(rows, draft, excludeId = null) {
  const draftDate = draft?.fechaSolicitada || displayDate(draft);
  if (!draftDate || draft.modalidad === "trabajo_en_sitio") return [];
  const wanted = new Set(transportsOf(draft).map((item) => item.tipo));
  const requested = parseDate(draftDate);
  return rows.filter((row) => {
    if (row.id === excludeId || row.estado === "cancelado" || row.estado === "realizado") return false;
    if (draft?.viaje_grupo_id && row.viaje_grupo_id === draft.viaje_grupo_id) return false;
    if (pairWasRejected(draft, row)) return false;
    if (row.modalidad === "trabajo_en_sitio" || !transportsOf(row).some((item) => wanted.has(item.tipo))) return false;
    const date = parseDate(displayDate(row));
    return date && Math.abs((date - requested) / 86400000) <= 1;
  }).slice(0, 4);
}

function StatusBadge({ status }) {
  const ui = statusUi(status);
  return (
    <span className="log-status" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 25, padding: "0 9px", borderRadius: 999, background: ui.soft, border: `1px solid ${ui.border}`, color: ui.color, fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap" }}>
      <span className={!["realizado", "cancelado"].includes(status) ? "log-status-dot is-live" : "log-status-dot"} style={{ width: 6, height: 6, borderRadius: 99, background: ui.color }} />
      {ui.label}
    </span>
  );
}

function TransportBadge({ row, compact = false }) {
  const type = transportsOf(row)[0]?.tipo;
  const ui = transportUi(type);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: ui.color, fontSize: compact ? 10.5 : 11.5, fontWeight: 850, minWidth: 0 }}>
      <TransportIcon type={type} size={compact ? 12 : 14} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{transportSummary(row, !compact)}</span>
    </span>
  );
}

function Kpi({ label, value, hint, tone = "blue", icon: Icon }) {
  const color = C[tone] || C.blue;
  const soft = C[`${tone}L`] || C.blueL;
  const border = C[`${tone}B`] || C.blueB;
  return (
    <div style={{ minWidth: 0, padding: "12px 14px", background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 13, display: "grid", gridTemplateColumns: "34px minmax(0,1fr)", gap: 10, alignItems: "center" }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", color, background: soft, border: `1px solid ${border}` }}>{createElement(Icon, { size: 17 })}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: C.text, fontFamily: C.mono, fontSize: 18, lineHeight: 1, fontWeight: 900 }}>{value}</span>
        <span style={{ display: "block", color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: ".1em", marginTop: 5 }}>{label}</span>
        {hint && <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</span>}
      </span>
    </div>
  );
}

function MiniMetric({ label, value, tone = "blue", icon: Icon }) {
  const color = C[tone] || C.blue;
  return (
    <span className="log-metric" style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 31, padding: "0 10px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, whiteSpace: "nowrap" }}>
      <span style={{ color, display: "inline-flex" }}>{createElement(Icon, { size: 13 })}</span>
      <b style={{ color: C.text, fontFamily: C.mono, fontSize: 12 }}>{value}</b>
      <span style={{ fontSize: 9.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: ".07em" }}>{label}</span>
    </span>
  );
}

function WeatherStrip({ weather }) {
  const today = weather[TODAY];
  if (!today) return null;
  const risky = Number(today.wind) >= 30;
  return (
    <span className="log-weather" title={`${weatherLabel(today.code)} · lluvia ${today.rain ?? 0}%`} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 31, padding: "0 10px", borderRadius: 9, border: `1px solid ${risky ? C.redB : C.cyanB}`, background: risky ? C.redL : C.cyanL, color: risky ? C.red : C.cyan, whiteSpace: "nowrap" }}>
      {Number(today.rain) >= 40 ? <CloudRain size={14} /> : <CloudSun size={14} />}
      <b style={{ fontFamily: C.mono, fontSize: 11.5 }}>{Math.round(today.max)}° / {Math.round(today.min)}°</b>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 850 }}><Wind size={12} /> {Math.round(today.wind)} km/h</span>
      <span style={{ color: C.dim, fontSize: 9.5 }}>San Fernando</span>
    </span>
  );
}

function LegacyEventCard({ row, compact = false }) {
  return (
    <div className="log-enter" style={{ width: "100%", padding: compact ? "9px 11px" : "11px 14px", display: "grid", gridTemplateColumns: compact ? "minmax(0,1fr)" : "76px minmax(0,1fr) auto", gap: 12, alignItems: "center", background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.violet}`, borderRadius: 11 }}>
      {!compact && <span style={{ textAlign: "center", paddingRight: 12, borderRight: `1px solid ${C.border}` }}><b style={{ display: "block", color: C.text, fontFamily: C.mono, fontSize: 15 }}>{cleanTime(row.hora) || "—"}</b><small style={{ color: C.dim, fontSize: 9.5 }}>{fmtDate(row.fecha)}</small></span>}
      <span style={{ minWidth: 0 }}><b style={{ display: "block", color: C.text, fontSize: 12.5 }}>{row.titulo}</b><span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 4 }}>{row.obra ? `${row.obra} · ` : ""}{row.notas || "Movimiento registrado en el calendario anterior"}</span></span>
      <span style={{ color: C.violet, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", whiteSpace: "nowrap" }}>Registro anterior</span>
    </div>
  );
}

function MovementCard({ row, onOpen, compact = false, index = 0, mergeHint = false }) {
  const ui = transportUi(transportsOf(row)[0]?.tipo);
  const shared = row.viaje_grupo_id;
  const separated = row.union_estado === "rechazada";
  return (
    <button type="button" className="log-card log-enter" onClick={() => onOpen(row)} style={{ animationDelay: `${Math.min(index, 8) * 35}ms`, minHeight: compact ? 92 : 104, width: "100%", textAlign: "left", padding: compact ? "13px" : "15px 16px", display: "grid", gridTemplateColumns: compact ? "minmax(0,1fr)" : "88px minmax(0,1fr) auto", gap: compact ? 10 : 16, alignItems: "center", background: `radial-gradient(circle at 2% 50%, ${ui.soft}, transparent 30%), ${C.panelSolid}`, border: `1px solid ${C.border}`, borderLeft: `4px solid ${ui.color}`, borderRadius: 15, color: C.text, cursor: "pointer", fontFamily: C.sans }}>
      {!compact && (
        <span style={{ minHeight: 68, display: "grid", placeItems: "center", alignContent: "center", textAlign: "center", padding: "8px 10px", borderRadius: 11, border: `1px solid ${ui.border}`, background: ui.soft }}>
          <span style={{ display: "block", color: ui.color, fontFamily: C.mono, fontSize: 19, lineHeight: 1, fontWeight: 950 }}>{displayTime(row) || "—"}</span>
          <span style={{ display: "block", color: C.muted, fontSize: 9.8, marginTop: 6, fontWeight: 800 }}>{fmtDate(displayDate(row))}</span>
        </span>
      )}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, display: "grid", placeItems: "center", color: ui.color, background: ui.soft, border: `1px solid ${ui.border}` }}><TransportIcon type={transportsOf(row)[0]?.tipo} size={15} /></span>
          <span style={{ color: C.text, fontSize: compact ? 14.5 : 15.5, lineHeight: 1.2, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{movementHeadline(row)}</span>
          {row.prioridad === "urgente" && <span style={{ color: C.red, fontSize: 9.5, fontWeight: 950, textTransform: "uppercase" }}>Urgente</span>}
          {row.origen_manual && <span style={{ padding: "3px 6px", borderRadius: 6, color: C.orange, background: "var(--orange-soft)", border: "1px solid var(--orange-border)", fontSize: 8.8, fontWeight: 950, textTransform: "uppercase" }}>Manual</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 9, minWidth: 0, flexWrap: "wrap" }}>
          {row.obra && <span style={{ padding: "3px 7px", borderRadius: 6, color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}`, fontFamily: C.mono, fontSize: 10.2, fontWeight: 900 }}>{row.obra}</span>}
          <span style={{ color: C.muted, fontSize: 10.5, display: "inline-flex", alignItems: "center", gap: 4 }}><UserRound size={11} /> {actorName(row.solicitante)}</span>
          <span style={{ color: C.muted, fontSize: 10.5, display: "inline-flex", alignItems: "center", gap: 4 }}><Truck size={11} /> {providerSummary(row)}</span>
          <span style={{ color: C.dim, fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}><Route size={11} /> {routeLabel(row)}</span>
        </span>
        {compact && <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 8 }}>{fmtDate(displayDate(row), true)} · {displayTime(row) || "Sin hora"}</span>}
      </span>
      <span style={{ display: "grid", justifyItems: "end", gap: 7 }}>
        <StatusBadge status={row.estado} />
        {shared ? <span style={{ color: C.green, fontSize: 9.5, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 4 }}><Merge size={12} /> Viaje unido</span> : mergeHint ? <span style={{ color: C.violet, fontSize: 9.5, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 4 }}><Merge size={12} /> Posible unión</span> : separated ? <span style={{ color: C.dim, fontSize: 9.5, fontWeight: 850 }}>Flete separado</span> : null}
        <ChevronRight size={17} color={C.dim} />
      </span>
    </button>
  );
}

const FIELD = { width: "100%", minHeight: 39, borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, color: C.text, padding: "8px 10px", outline: "none", fontFamily: C.sans, fontSize: 13 };
const LABEL = { display: "block", color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 5 };

function ModalShell({ title, subtitle, onClose, children, width = 720 }) {
  return (
    <div className="log-modal-backdrop" onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 12000, background: "var(--overlay-strong)", display: "grid", placeItems: "center", padding: 12 }}>
      <div className="log-modal-card" onMouseDown={(event) => event.stopPropagation()} style={{ width, maxWidth: "100%", maxHeight: "94vh", overflow: "hidden", display: "flex", flexDirection: "column", background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 18, boxShadow: "0 24px 80px var(--shadow-strong)" }}>
        <div style={{ padding: "15px 17px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>{title}</div>
            {subtitle && <div style={{ color: C.dim, fontSize: 11.5, marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", color: C.dim, background: C.panel, border: `1px solid ${C.border}`, cursor: "pointer" }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function emptyStop(type, lugar = "") {
  return { tipo: type, lugar, direccion: "", recibe: "", telefono: "" };
}

function requestInitial(row) {
  const onsite = row?.modalidad === "trabajo_en_sitio";
  const stops = Array.isArray(row?.paradas) && row.paradas.length >= (onsite ? 1 : 2)
    ? row.paradas
    : onsite ? [emptyStop("lugar")] : [emptyStop("origen", "Astillero"), emptyStop("destino")];
  return {
    modalidad: row?.modalidad || "traslado",
    plantillaCodigo: row?.plantilla_codigo || "",
    transportes: transportsOf(row?.id ? row : { tipo_transporte: "flete" }).map((item) => ({ ...item, proveedor: item.proveedor || "" })),
    obra: row?.obra || "",
    carga: row?.carga || row?.titulo || "",
    fechaSolicitada: row?.fecha_solicitada || TODAY,
    horaSolicitada: cleanTime(row?.hora_solicitada) || "08:00",
    paradas: stops,
    observaciones: row?.notas || "",
    urgente: row?.prioridad === "urgente",
    urgenteMotivo: row?.urgente_motivo || "",
    viajeSugeridoId: row?.viaje_sugerido_id || "",
    viajeGrupoId: row?.viaje_grupo_id || "",
    unionEstado: row?.union_estado || "sin_evaluar",
  };
}

function RequestModal({ row, rows, obras, profile, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => requestInitial(row));
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const urgentByTime = dateDiffHours(form.fechaSolicitada, form.horaSolicitada) < 48;
  const suggestions = useMemo(() => sameTripCandidates(rows, form, row?.id), [form, row?.id, rows]);
  const validStops = form.paradas.filter((stop) => stop.lugar.trim() || stop.direccion.trim());
  const minStops = form.modalidad === "trabajo_en_sitio" ? 1 : 2;
  const valid = form.transportes.length > 0 && form.carga.trim() && form.fechaSolicitada && validStops.length >= minStops;

  function applyTemplate(template) {
    setForm((prev) => ({
      ...prev,
      plantillaCodigo: template.codigo,
      modalidad: template.modalidad,
      carga: template.carga,
      transportes: template.transportes.map((item) => ({ ...item })),
      paradas: template.paradas.map((stop) => ({ ...stop })),
      viajeSugeridoId: "",
    }));
  }

  function setMode(mode) {
    setForm((prev) => {
      const stops = mode === "trabajo_en_sitio"
        ? [prev.paradas[0] || emptyStop("lugar")]
        : prev.paradas.length >= 2 ? prev.paradas : [prev.paradas[0] || emptyStop("origen", "Astillero"), emptyStop("destino")];
      return { ...prev, modalidad: mode, plantillaCodigo: "", paradas: stops, viajeSugeridoId: "" };
    });
  }

  function changeTransport(type, delta) {
    setForm((prev) => {
      const current = prev.transportes.find((item) => item.tipo === type);
      const nextQty = (Number(current?.cantidad) || 0) + delta;
      const transportes = nextQty <= 0
        ? prev.transportes.filter((item) => item.tipo !== type)
        : current
          ? prev.transportes.map((item) => item.tipo === type ? { ...item, cantidad: nextQty } : item)
          : [...prev.transportes, { tipo: type, cantidad: 1, proveedor: "" }];
      return { ...prev, transportes, plantillaCodigo: "", viajeSugeridoId: "" };
    });
  }

  function updateStop(index, key, value) {
    set("paradas", form.paradas.map((stop, idx) => idx === index ? { ...stop, [key]: value } : stop));
  }

  function addStop() {
    if (form.modalidad === "trabajo_en_sitio") return;
    const next = [...form.paradas];
    next.splice(Math.max(next.length - 1, 1), 0, emptyStop("parada"));
    set("paradas", next);
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const payload = { ...form, urgente: form.urgente || urgentByTime, paradas: validStops };
      if (row) await actualizarSolicitudLogistica(row.id, payload, profile);
      else await crearSolicitudLogistica(payload, profile);
      toast.success(row ? "Solicitud actualizada." : "Solicitud enviada a Compras.");
      onSaved();
    } catch (error) {
      toast.error(error.message || "No se pudo guardar la solicitud.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={row ? "Editar solicitud" : "Solicitar movimiento"} subtitle="Compras coordinará el transporte y confirmará el horario." onClose={onClose} width={820}>
      <div style={{ padding: 18, overflowY: "auto", display: "grid", gap: 18 }}>
        <section>
          <label style={LABEL}>Plantillas rápidas</label>
          <div className="log-template-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7 }}>
            {PLANTILLAS.map((template) => {
              const active = form.plantillaCodigo === template.codigo;
              return (
                <button key={template.codigo} type="button" onClick={() => applyTemplate(template)} style={{ padding: "10px 11px", borderRadius: 10, textAlign: "left", background: active ? C.blueL : C.panel, border: `1px solid ${active ? C.blueB : C.border}`, color: active ? C.blue : C.text, cursor: "pointer", fontFamily: C.sans }}>
                  <b style={{ display: "block", fontSize: 12.5 }}>{template.nombre}</b>
                  <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 4, lineHeight: 1.3 }}>{template.detalle}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          <button type="button" onClick={() => setMode("traslado")} style={{ padding: 10, borderRadius: 10, border: `1px solid ${form.modalidad === "traslado" ? C.blueB : C.border}`, background: form.modalidad === "traslado" ? C.blueL : C.panel, color: form.modalidad === "traslado" ? C.blue : C.dim, cursor: "pointer", fontWeight: 900 }}><Route size={15} /> Traslado entre lugares</button>
          <button type="button" onClick={() => setMode("trabajo_en_sitio")} style={{ padding: 10, borderRadius: 10, border: `1px solid ${form.modalidad === "trabajo_en_sitio" ? C.violetB : C.border}`, background: form.modalidad === "trabajo_en_sitio" ? C.violetL : C.panel, color: form.modalidad === "trabajo_en_sitio" ? C.violet : C.dim, cursor: "pointer", fontWeight: 900 }}><MapPin size={15} /> Trabajo en un solo lugar</button>
        </section>

        <section>
          <label style={LABEL}>Transportes y cantidades *</label>
          <div className="log-transport-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 7 }}>
            {Object.entries(TRANSPORTES).map(([key, item]) => {
              const quantity = Number(form.transportes.find((resource) => resource.tipo === key)?.cantidad) || 0;
              const active = quantity > 0;
              return (
                <div key={key} style={{ minHeight: 74, padding: 8, borderRadius: 10, background: active ? item.soft : C.panel, border: `1px solid ${active ? item.border : C.border}`, color: active ? item.color : C.dim, fontFamily: C.sans }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 11.5, fontWeight: active ? 900 : 700 }}><Truck size={15} />{item.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 24px", gap: 4, alignItems: "center", marginTop: 9 }}>
                    <button type="button" onClick={() => changeTransport(key, -1)} disabled={!active} style={{ width: 24, height: 24, borderRadius: 7, border: `1px solid ${active ? item.border : C.border}`, background: C.panelSolid, color: active ? item.color : C.dim, cursor: active ? "pointer" : "default" }}>−</button>
                    <b style={{ textAlign: "center", fontFamily: C.mono, fontSize: 13 }}>{quantity}</b>
                    <button type="button" onClick={() => changeTransport(key, 1)} style={{ width: 24, height: 24, borderRadius: 7, border: `1px solid ${item.border}`, background: C.panelSolid, color: item.color, cursor: "pointer" }}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={LABEL}>Obra / sector</label>
            <input style={FIELD} list="logistica-obras" value={form.obra} onChange={(event) => set("obra", event.target.value)} placeholder="Ej. K55-2 o Taller" />
            <datalist id="logistica-obras">{obras.map((obra) => <option key={obra.id} value={obra.codigo} />)}</datalist>
          </div>
          <div>
            <label style={LABEL}>{form.modalidad === "trabajo_en_sitio" ? "¿Qué trabajo se realiza? *" : "¿Qué se traslada? *"}</label>
            <input style={FIELD} value={form.carga} onChange={(event) => set("carga", event.target.value)} placeholder={form.modalidad === "trabajo_en_sitio" ? "Izaje de motor, trabajo con grúa..." : "Techo, motor, cubierta, piezas..."} autoFocus />
          </div>
        </section>

        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ ...LABEL, marginBottom: 0 }}>{form.modalidad === "trabajo_en_sitio" ? "Lugar del trabajo" : "Recorrido"}</label>
            {form.modalidad === "traslado" && <button type="button" onClick={addStop} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.border}`, background: C.panel, color: C.blue, borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 11.5, fontWeight: 850 }}><Plus size={13} /> Agregar parada</button>}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {form.paradas.map((stop, index) => (
              <div key={index} className="log-stop" style={{ display: "grid", gridTemplateColumns: "82px 1fr 1.35fr .85fr 34px", gap: 7, alignItems: "center", padding: 9, border: `1px solid ${C.border}`, borderRadius: 11, background: C.panel }}>
                <span style={{ color: form.modalidad === "trabajo_en_sitio" ? C.violet : index === 0 ? C.green : index === form.paradas.length - 1 ? C.blue : C.violet, fontSize: 10, fontWeight: 950, textTransform: "uppercase" }}>{form.modalidad === "trabajo_en_sitio" ? "Lugar" : index === 0 ? "Origen" : index === form.paradas.length - 1 ? "Destino" : `Parada ${index}`}</span>
                <input style={{ ...FIELD, minHeight: 35 }} value={stop.lugar} onChange={(event) => updateStop(index, "lugar", event.target.value)} placeholder="Lugar" />
                <input style={{ ...FIELD, minHeight: 35 }} value={stop.direccion} onChange={(event) => updateStop(index, "direccion", event.target.value)} placeholder="Dirección" />
                <input style={{ ...FIELD, minHeight: 35 }} value={stop.recibe} onChange={(event) => updateStop(index, "recibe", event.target.value)} placeholder="Quién recibe" />
                <button type="button" disabled={form.paradas.length <= minStops} onClick={() => set("paradas", form.paradas.filter((_, idx) => idx !== index))} style={{ width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, background: "transparent", color: form.paradas.length <= minStops ? C.dim : C.red, cursor: form.paradas.length <= minStops ? "default" : "pointer", opacity: form.paradas.length <= minStops ? .35 : 1 }}><X size={14} /></button>
              </div>
            ))}
          </div>
        </section>

        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={LABEL}>Fecha solicitada *</label>
            <input type="date" style={FIELD} value={form.fechaSolicitada} onChange={(event) => set("fechaSolicitada", event.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Horario requerido</label>
            <input type="time" style={FIELD} value={form.horaSolicitada} onChange={(event) => set("horaSolicitada", event.target.value)} />
          </div>
        </section>

        {urgentByTime && (
          <div style={{ display: "flex", gap: 9, padding: "10px 12px", borderRadius: 10, background: C.redL, border: `1px solid ${C.redB}`, color: C.red }}>
            <AlertTriangle size={17} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, lineHeight: 1.4 }}><b>Solicitud con menos de 48 horas.</b> Se enviará igual, marcada como urgente para que Compras pueda priorizarla.</div>
          </div>
        )}

        {suggestions.length > 0 && (
          <section style={{ padding: 12, borderRadius: 12, background: C.violetL, border: `1px solid ${C.violetB}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.violet, fontSize: 12, fontWeight: 950 }}><Merge size={15} /> Viajes que quizá se pueden aprovechar</div>
            <div style={{ color: C.dim, fontSize: 10.5, marginTop: 4 }}>Podés sugerir la unión. Compras revisará espacio y recorrido antes de aprobarla.</div>
            <div style={{ display: "grid", gap: 6, marginTop: 9 }}>
              {suggestions.map((candidate) => {
                const selected = form.viajeSugeridoId === candidate.id;
                return (
                  <button key={candidate.id} type="button" onClick={() => set("viajeSugeridoId", selected ? "" : candidate.id)} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", textAlign: "left", padding: "8px 10px", borderRadius: 9, background: selected ? C.panelSolid : "transparent", border: `1px solid ${selected ? C.violet : C.violetB}`, color: C.text, cursor: "pointer" }}>
                    <span style={{ minWidth: 0 }}><b style={{ fontSize: 12 }}>{movementHeadline(candidate)}</b><span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 3 }}>{fmtDate(displayDate(candidate))} · {candidate.obra || "Sin obra"} · {routeLabel(candidate)}</span></span>
                    <span style={{ color: C.violet, fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap" }}>{selected ? "Seleccionado" : "Sugerir unión"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <label style={LABEL}>Observaciones</label>
          <textarea style={{ ...FIELD, minHeight: 72, resize: "vertical" }} value={form.observaciones} onChange={(event) => set("observaciones", event.target.value)} placeholder="Medidas, cuidados de carga, teléfono, restricciones de horario..." />
        </section>
      </div>
      <div style={{ padding: "12px 17px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onClose} style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: "pointer", fontWeight: 800 }}>Cancelar</button>
        <button type="button" disabled={!valid || saving} onClick={save} style={{ padding: "9px 16px", borderRadius: 9, border: `1px solid ${valid ? C.blueB : C.border}`, background: valid ? C.blueL : C.panel, color: valid ? C.blue : C.dim, opacity: saving ? .65 : 1, cursor: valid && !saving ? "pointer" : "default", fontWeight: 950, display: "inline-flex", alignItems: "center", gap: 7 }}><Send size={14} /> {saving ? "Guardando..." : row ? "Guardar cambios" : "Enviar solicitud"}</button>
      </div>
    </ModalShell>
  );
}

function ManualMovementModal({ obras, profile, onClose, onSaved }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tipoTransporte: "motomensajeria",
    proveedor: "",
    carga: "",
    obra: "",
    fecha: TODAY,
    hora: "09:00",
    modalidad: "traslado",
    paradas: [emptyStop("origen"), emptyStop("destino")],
    costo: "",
    moneda: "ARS",
    costoDetalle: "",
    observaciones: "",
  });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const requiredStops = form.modalidad === "trabajo_en_sitio" ? 1 : 2;
  const validStops = form.paradas.filter((stop) => String(stop.lugar || "").trim());
  const valid = form.carga.trim() && form.fecha && validStops.length >= requiredStops;
  const type = transportUi(form.tipoTransporte);

  function setMode(modalidad) {
    setForm((current) => ({
      ...current,
      modalidad,
      paradas: modalidad === "trabajo_en_sitio" ? [emptyStop("lugar")] : [emptyStop("origen"), emptyStop("destino")],
    }));
  }

  function setStop(index, lugar) {
    setForm((current) => ({ ...current, paradas: current.paradas.map((stop, stopIndex) => stopIndex === index ? { ...stop, lugar } : stop) }));
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await crearMovimientoManualLogistica(form, profile);
      toast.success("Movimiento manual agregado al calendario.");
      onSaved();
    } catch (error) {
      toast.error(error.message || "No se pudo agregar el movimiento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Agregar movimiento manual" subtitle="Para movimientos coordinados directamente por Compras: motomensajería, retiros, trámites o fletes." onClose={onClose} width={650}>
      <div style={{ padding: 18, display: "grid", gap: 14, overflowY: "auto" }}>
        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={LABEL}>Tipo de transporte</label><select value={form.tipoTransporte} onChange={(event) => set("tipoTransporte", event.target.value)} style={{ ...FIELD, color: type.color }}>{Object.entries(TRANSPORTES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></div>
          <div><label style={LABEL}>Proveedor / responsable</label><input value={form.proveedor} onChange={(event) => set("proveedor", event.target.value)} list="manual-proveedores-logistica" style={FIELD} placeholder="Ej. mensajería, Hugo, Dani..." /><datalist id="manual-proveedores-logistica">{type.proveedores.map((provider) => <option key={provider} value={provider} />)}</datalist></div>
        </section>
        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1.3fr .7fr", gap: 10 }}>
          <div><label style={LABEL}>Título / qué se realiza *</label><input autoFocus value={form.carga} onChange={(event) => set("carga", event.target.value)} style={FIELD} placeholder="Retirar documentación, llevar repuestos..." /></div>
          <div><label style={LABEL}>Obra / sector</label><input value={form.obra} onChange={(event) => set("obra", event.target.value)} list="manual-obras-logistica" style={FIELD} placeholder="K85-3, Compras..." /><datalist id="manual-obras-logistica">{obras.map((obra) => <option key={obra.id} value={obra.codigo} />)}</datalist></div>
        </section>
        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={LABEL}>Fecha *</label><input type="date" value={form.fecha} onChange={(event) => set("fecha", event.target.value)} style={FIELD} /></div>
          <div><label style={LABEL}>Hora</label><input type="time" value={form.hora} onChange={(event) => set("hora", event.target.value)} style={FIELD} /></div>
        </section>
        <section>
          <label style={LABEL}>Modalidad</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><button onClick={() => setMode("traslado")} style={{ padding: 9, borderRadius: 9, border: `1px solid ${form.modalidad === "traslado" ? C.blueB : C.border}`, background: form.modalidad === "traslado" ? C.blueL : C.panel, color: form.modalidad === "traslado" ? C.blue : C.dim, cursor: "pointer", fontWeight: 900 }}><Route size={14} /> Traslado</button><button onClick={() => setMode("trabajo_en_sitio")} style={{ padding: 9, borderRadius: 9, border: `1px solid ${form.modalidad === "trabajo_en_sitio" ? C.violetB : C.border}`, background: form.modalidad === "trabajo_en_sitio" ? C.violetL : C.panel, color: form.modalidad === "trabajo_en_sitio" ? C.violet : C.dim, cursor: "pointer", fontWeight: 900 }}><MapPin size={14} /> Un solo lugar</button></div>
        </section>
        <section className="log-two" style={{ display: "grid", gridTemplateColumns: form.modalidad === "traslado" ? "1fr 1fr" : "1fr", gap: 10 }}>
          {form.paradas.map((stop, index) => <div key={`${stop.tipo}-${index}`}><label style={LABEL}>{form.modalidad === "trabajo_en_sitio" ? "Lugar del trabajo *" : index === 0 ? "Origen *" : "Destino *"}</label><input value={stop.lugar} onChange={(event) => setStop(index, event.target.value)} style={FIELD} placeholder={form.modalidad === "trabajo_en_sitio" ? "Galpón / dirección" : index === 0 ? "Desde dónde" : "Hacia dónde"} /></div>)}
        </section>
        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 10 }}>
          <div><label style={LABEL}>Costo</label><input type="number" min="0" step="0.01" value={form.costo} onChange={(event) => set("costo", event.target.value)} style={FIELD} placeholder="Importe opcional" /></div>
          <div><label style={LABEL}>Moneda</label><select value={form.moneda} onChange={(event) => set("moneda", event.target.value)} style={FIELD}><option>ARS</option><option>USD</option></select></div>
        </section>
        <div><label style={LABEL}>Detalle de costo / comprobante</label><input value={form.costoDetalle} onChange={(event) => set("costoDetalle", event.target.value)} style={FIELD} placeholder="Factura, referencia, forma de pago..." /></div>
        <div><label style={LABEL}>Observaciones</label><textarea value={form.observaciones} onChange={(event) => set("observaciones", event.target.value)} style={{ ...FIELD, minHeight: 68, resize: "vertical" }} placeholder="Indicaciones, contacto, documentación a retirar..." /></div>
      </div>
      <div style={{ padding: "12px 17px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}><button onClick={onClose} style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: "pointer", fontWeight: 850 }}>Cancelar</button><button disabled={!valid || saving} onClick={save} style={{ padding: "9px 15px", borderRadius: 9, border: `1px solid ${valid ? type.border : C.border}`, background: valid ? type.soft : C.panel, color: valid ? type.color : C.dim, cursor: valid && !saving ? "pointer" : "default", opacity: saving ? .6 : 1, fontWeight: 950 }}><Plus size={14} /> {saving ? "Guardando..." : "Agregar al calendario"}</button></div>
    </ModalShell>
  );
}

function CoordinationModal({ row, mode, profile, onClose, onSaved }) {
  const toast = useToast();
  const requestedDate = row.fecha_solicitada || row.fecha;
  const requestedTime = cleanTime(row.hora_solicitada || row.hora);
  const [resources, setResources] = useState(() => transportsOf(row).map((resource) => ({
    ...resource,
    proveedor: resource.proveedor || transportUi(resource.tipo).proveedores[0] || "",
  })));
  const [date, setDate] = useState(mode === "confirm" ? requestedDate : dateAdd(requestedDate, 1));
  const [time, setTime] = useState(requestedTime || "08:00");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = resources.length > 0 && resources.every((resource) => String(resource.proveedor || "").trim()) && date && time;

  function setProvider(index, proveedor) {
    setResources((prev) => prev.map((resource, idx) => idx === index ? { ...resource, proveedor } : resource));
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const payload = { transportes: resources, fecha: date, hora: time, mensaje: message.trim() };
      if (mode === "confirm") await confirmarMovimiento(row.id, payload, profile);
      else await proponerFechaMovimiento(row.id, payload, profile);
      toast.success(mode === "confirm" ? "Movimiento confirmado." : "Nueva fecha enviada al solicitante.");
      onSaved();
    } catch (error) {
      toast.error(error.message || "No se pudo actualizar el movimiento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={mode === "confirm" ? "Confirmar movimiento" : "Proponer otra fecha"} subtitle={`${row.carga} · solicitado por ${actorName(row.solicitante)}`} onClose={onClose} width={520}>
      <div style={{ padding: 18, display: "grid", gap: 14, overflowY: "auto" }}>
        <div>
          <label style={LABEL}>Proveedores por transporte *</label>
          <div style={{ display: "grid", gap: 7 }}>
            {resources.map((resource, index) => {
              const type = transportUi(resource.tipo);
              return (
                <div key={`${resource.tipo}-${index}`} style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr)", gap: 8, alignItems: "center", padding: 9, borderRadius: 10, border: `1px solid ${type.border}`, background: type.soft }}>
                  <b style={{ color: type.color, fontSize: 12 }}>{resource.cantidad} × {type.label}</b>
                  <div>
                    <input style={FIELD} list={`providers-${resource.tipo}-${index}`} value={resource.proveedor || ""} onChange={(event) => setProvider(index, event.target.value)} placeholder="Seleccionar o escribir proveedor" />
                    <datalist id={`providers-${resource.tipo}-${index}`}>{type.proveedores.map((name) => <option key={name} value={name} />)}</datalist>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={LABEL}>{mode === "confirm" ? "Fecha confirmada" : "Fecha propuesta"}</label><input type="date" style={FIELD} value={date} onChange={(event) => setDate(event.target.value)} /></div>
          <div><label style={LABEL}>Hora</label><input type="time" style={FIELD} value={time} onChange={(event) => setTime(event.target.value)} /></div>
        </div>
        {mode === "propose" && <div style={{ padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, fontSize: 11.5 }}>El solicitante deberá aceptar esta fecha. Después, Compras realizará la confirmación final del movimiento.</div>}
        <div><label style={LABEL}>Mensaje</label><textarea style={{ ...FIELD, minHeight: 68, resize: "vertical" }} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Disponibilidad, condiciones o aclaraciones..." /></div>
      </div>
      <div style={{ padding: "12px 17px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: "pointer", fontWeight: 800 }}>Cancelar</button>
        <button disabled={!valid || saving} onClick={save} style={{ padding: "9px 15px", borderRadius: 9, border: `1px solid ${mode === "confirm" ? C.greenB : C.violetB}`, background: mode === "confirm" ? C.greenL : C.violetL, color: mode === "confirm" ? C.green : C.violet, cursor: valid ? "pointer" : "default", opacity: valid ? 1 : .45, fontWeight: 950 }}>{saving ? "Guardando..." : mode === "confirm" ? "Confirmar" : "Enviar propuesta"}</button>
      </div>
    </ModalShell>
  );
}

function DetailPanel({ row, rows, profile, isManager, onClose, onReload, onEdit, onCoordinate }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [history, setHistory] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachmentCategory, setAttachmentCategory] = useState("remito");
  const [mergeCandidate, setMergeCandidate] = useState(null);
  const [mergeNote, setMergeNote] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [cost, setCost] = useState(row.costo ?? "");
  const [currency, setCurrency] = useState(row.moneda || "ARS");
  const [costDetail, setCostDetail] = useState(row.costo_detalle || "");
  const own = row.created_by === profile?.id;
  const candidates = sameTripCandidates(rows, { ...row, fechaSolicitada: displayDate(row) }, row.id);
  const sharedRows = row.viaje_grupo_id ? rows.filter((item) => item.id !== row.id && item.viaje_grupo_id === row.viaje_grupo_id) : [];

  useEffect(() => {
    let alive = true;
    Promise.all([
      cargarHistorialMovimiento(row.id),
      listarArchivosMovimiento(row.id),
    ]).then(([historyRows, fileRows]) => {
      if (!alive) return;
      setHistory(historyRows);
      setAttachments(fileRows);
    }).catch(() => {});
    return () => { alive = false; };
  }, [row.id]);

  async function action(work, success) {
    if (saving) return;
    setSaving(true);
    try {
      await work();
      toast.success(success);
      onReload();
    } catch (error) {
      toast.error(error.message || "No se pudo completar la acción.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMovement() {
    if (saving) return;
    setSaving(true);
    try {
      await eliminarMovimientoLogistico(row.id);
      toast.success("Movimiento eliminado.");
      onClose();
      onReload();
    } catch (error) {
      toast.error(error.message || "No se pudo eliminar el movimiento.");
      setSaving(false);
    }
  }

  async function uploadAttachments(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || uploading) return;
    setUploading(true);
    try {
      const uploaded = await subirArchivosMovimiento(row.id, files, attachmentCategory, profile);
      setAttachments((current) => [...uploaded, ...current]);
      toast.success(`${uploaded.length} archivo${uploaded.length === 1 ? " adjuntado" : "s adjuntados"}.`);
    } catch (error) {
      toast.error(error.message || "No se pudieron subir los archivos.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(file) {
    if (saving) return;
    setSaving(true);
    try {
      await eliminarArchivoMovimiento(file);
      setAttachments((current) => current.filter((item) => item.id !== file.id));
      toast.success("Archivo eliminado.");
    } catch (error) {
      toast.error(error.message || "No se pudo eliminar el archivo.");
    } finally {
      setSaving(false);
    }
  }

  async function decideMerge(accept) {
    if (!mergeCandidate || saving) return;
    setSaving(true);
    try {
      if (accept) {
        await agruparMovimientos(row, mergeCandidate, profile);
        toast.success("Los movimientos compartirán el mismo transporte.");
      } else {
        await rechazarUnionMovimientos(row, mergeCandidate, mergeNote, profile);
        toast.success("Se registró que estos movimientos requieren transportes separados.");
      }
      setMergeCandidate(null);
      setMergeNote("");
      onReload();
    } catch (error) {
      toast.error(error.message || "No se pudo guardar la decisión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="log-detail-backdrop" onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 11000, background: "var(--overlay)", display: "flex", justifyContent: "flex-end", padding: 8 }}>
      <aside onMouseDown={(event) => event.stopPropagation()} className="log-detail log-detail-sheet" style={{ width: 520, maxWidth: "100%", height: "100%", overflowY: "auto", background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 18, boxShadow: "-20px 0 70px var(--shadow-strong)", color: C.text }}>
        <div className="log-detail-header" style={{ position: "sticky", top: 0, zIndex: 2, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: C.topbar, backdropFilter: "blur(18px)", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}><button onClick={onClose} style={{ width: 31, height: 31, display: "grid", placeItems: "center", borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, cursor: "pointer" }}><ArrowRight size={16} /></button><div><div style={{ fontSize: 13.5, fontWeight: 950 }}>Detalle del movimiento</div><div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>Registro #{String(row.id).slice(0, 8)}</div></div></div>
          <StatusBadge status={row.estado} />
        </div>

        <div style={{ padding: 18, display: "grid", gap: 18 }}>
          <section className="log-detail-hero" style={{ padding: 15, margin: "-2px -2px 0", borderRadius: 14, border: `1px solid ${C.border}`, background: `radial-gradient(circle at 100% 0%, ${transportUi(transportsOf(row)[0]?.tipo).soft}, transparent 48%), ${C.panel}` }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 7px", borderRadius: 7, color: transportUi(transportsOf(row)[0]?.tipo).color, background: transportUi(transportsOf(row)[0]?.tipo).soft, border: `1px solid ${transportUi(transportsOf(row)[0]?.tipo).border}`, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}><TransportIcon type={transportsOf(row)[0]?.tipo} size={11} /> {row.modalidad === "trabajo_en_sitio" ? "Trabajo en sitio" : "Traslado"}</span>
            {row.origen_manual && <span style={{ display: "inline-flex", marginLeft: 6, padding: "4px 7px", borderRadius: 7, color: C.orange, background: "var(--orange-soft)", border: "1px solid var(--orange-border)", fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Carga manual</span>}
            <h2 style={{ margin: "9px 0 0", color: C.text, fontSize: 22, lineHeight: 1.2 }}>{movementHeadline(row)}</h2>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10, color: C.dim, fontSize: 11.5 }}>
              {row.obra && <span style={{ color: C.blue, fontFamily: C.mono, fontWeight: 900 }}>{row.obra}</span>}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><UserRound size={13} /> Pedido por {actorName(row.solicitante)}</span>
              {row.prioridad === "urgente" && <span style={{ color: C.red, fontWeight: 950 }}>Urgente</span>}
            </div>
          </section>

          {row.estado === "fecha_propuesta" && own && (
            <section style={{ padding: 13, borderRadius: 12, background: C.violetL, border: `1px solid ${C.violetB}` }}>
              <div style={{ color: C.violet, fontSize: 12.5, fontWeight: 950 }}>Compras propuso {fmtDate(row.fecha_propuesta, true)} a las {cleanTime(row.hora_propuesta)}</div>
              {row.propuesta_mensaje && <div style={{ color: C.muted, fontSize: 11.5, marginTop: 6 }}>{row.propuesta_mensaje}</div>}
              <div style={{ display: "flex", gap: 7, marginTop: 11 }}>
                <button disabled={saving} onClick={() => action(() => responderFechaMovimiento(row, true, profile), "Fecha aceptada. Compras debe realizar la confirmación final.")} style={{ flex: 1, padding: 9, borderRadius: 9, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 950 }}><Check size={14} /> Aceptar fecha</button>
                <button disabled={saving} onClick={() => action(() => responderFechaMovimiento(row, false, profile), "Propuesta rechazada. Compras fue avisado.")} style={{ flex: 1, padding: 9, borderRadius: 9, border: `1px solid ${C.redB}`, background: C.redL, color: C.red, cursor: "pointer", fontWeight: 950 }}><X size={14} /> Rechazar</button>
              </div>
            </section>
          )}

          {row.estado === "fecha_aceptada" && (
            <section style={{ padding: 13, borderRadius: 12, background: C.cyanL, border: `1px solid ${C.cyanB}` }}>
              <div style={{ color: C.cyan, fontSize: 12.5, fontWeight: 950 }}>Fecha aceptada por Técnica</div>
              <div style={{ color: C.muted, fontSize: 11.5, marginTop: 5 }}>{fmtDate(row.fecha_propuesta, true)} a las {cleanTime(row.hora_propuesta) || "sin hora"}. Falta la confirmación definitiva de Compras.</div>
              {isManager && <button disabled={saving} onClick={() => action(() => confirmarFechaAceptadaMovimiento(row, profile), "Movimiento confirmado definitivamente.")} style={{ width: "100%", marginTop: 11, padding: 10, borderRadius: 9, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 950 }}><CheckCircle2 size={15} /> Confirmar movimiento</button>}
            </section>
          )}

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ padding: 11, borderRadius: 10, background: C.panel, border: `1px solid ${C.border}` }}><span style={LABEL}>Fecha solicitada</span><b style={{ color: C.text, fontFamily: C.mono, fontSize: 13 }}>{fmtDate(row.fecha_solicitada)} · {cleanTime(row.hora_solicitada) || "Sin hora"}</b></div>
            <div style={{ padding: 11, borderRadius: 10, background: C.panel, border: `1px solid ${C.border}` }}><span style={LABEL}>{row.estado === "fecha_propuesta" ? "Fecha propuesta" : row.estado === "fecha_aceptada" ? "Aceptada · falta Compras" : "Fecha confirmada"}</span><b style={{ color: row.estado === "fecha_aceptada" ? C.cyan : row.fecha_confirmada ? C.green : row.fecha_propuesta ? C.violet : C.dim, fontFamily: C.mono, fontSize: 13 }}>{row.fecha_confirmada || row.fecha_propuesta ? `${fmtDate(row.fecha_confirmada || row.fecha_propuesta)} · ${cleanTime(row.hora_confirmada || row.hora_propuesta) || "Sin hora"}` : "Pendiente"}</b></div>
          </section>

          <section>
            <span style={LABEL}>{row.modalidad === "trabajo_en_sitio" ? "Lugar del trabajo" : "Recorrido"}</span>
            <div style={{ display: "grid", gap: 0 }}>
              {(row.paradas || []).map((stop, index) => (
                <div key={index} style={{ position: "relative", display: "grid", gridTemplateColumns: "26px minmax(0,1fr)", gap: 9, paddingBottom: index < row.paradas.length - 1 ? 15 : 0 }}>
                  {index < row.paradas.length - 1 && <span style={{ position: "absolute", left: 12, top: 22, bottom: 0, width: 1, background: C.border2 }} />}
                  <span style={{ width: 25, height: 25, borderRadius: 8, display: "grid", placeItems: "center", color: index === 0 ? C.green : index === row.paradas.length - 1 ? C.blue : C.violet, background: C.panel, border: `1px solid ${C.border}` }}><MapPin size={13} /></span>
                  <span style={{ minWidth: 0 }}><b style={{ color: C.text, fontSize: 12.5 }}>{stop.lugar || stop.direccion || `Parada ${index + 1}`}</b>{stop.direccion && stop.lugar && <span style={{ display: "block", color: C.dim, fontSize: 11, marginTop: 2 }}>{stop.direccion}</span>}{stop.recibe && <span style={{ display: "block", color: C.muted, fontSize: 10.5, marginTop: 3 }}>Recibe: {stop.recibe}{stop.telefono ? ` · ${stop.telefono}` : ""}</span>}</span>
                </div>
              ))}
            </div>
          </section>

          {row.notas && <section><span style={LABEL}>Observaciones</span><div style={{ padding: 11, borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{row.notas}</div></section>}

          <section style={{ padding: 13, borderRadius: 12, background: C.panel, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: attachments.length ? 10 : 0 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.text, fontSize: 12.5, fontWeight: 950 }}><Paperclip size={14} /> Documentación <small style={{ color: C.dim, fontFamily: C.mono }}>{attachments.length}</small></span>
              <span style={{ color: C.dim, fontSize: 9.5 }}>Fotos, PDF y archivos · hasta 50 MB</span>
            </div>
            {!!attachments.length && <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              {attachments.map((file) => {
                const category = ARCHIVO_CATEGORIAS[file.categoria] || ARCHIVO_CATEGORIAS.otro;
                const isImage = String(file.mime_type || "").startsWith("image/");
                const canRemove = isManager || file.created_by === profile?.id;
                return (
                  <div key={file.id} style={{ minWidth: 0, padding: "8px 9px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.panelSolid, display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 28, height: 28, borderRadius: 7, display: "grid", placeItems: "center", background: C.panel, color: category.color }}>{isImage ? <ImageIcon size={14} /> : <FileText size={14} />}</span>
                    <a href={file.url} target="_blank" rel="noreferrer" style={{ minWidth: 0, color: C.text, textDecoration: "none" }}><b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11.5 }}>{file.nombre}</b><small style={{ display: "block", color: C.dim, marginTop: 2 }}>{category.label}{fmtFileSize(file.size_bytes) ? ` · ${fmtFileSize(file.size_bytes)}` : ""}{file.autor?.username ? ` · ${file.autor.username}` : ""}</small></a>
                    {canRemove && <button disabled={saving} onClick={() => removeAttachment(file)} title="Eliminar archivo" style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid transparent", background: "transparent", color: C.red, cursor: "pointer", display: "grid", placeItems: "center" }}><Trash2 size={13} /></button>}
                  </div>
                );
              })}
            </div>}
            <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 7 }}>
              <select value={attachmentCategory} onChange={(event) => setAttachmentCategory(event.target.value)} style={{ ...FIELD, height: 35 }}>{Object.entries(ARCHIVO_CATEGORIAS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select>
              <button disabled={uploading} onClick={() => fileInputRef.current?.click()} style={{ minHeight: 35, borderRadius: 9, border: `1px dashed ${uploading ? C.border : C.blueB}`, background: uploading ? C.panel : C.blueL, color: uploading ? C.dim : C.blue, cursor: uploading ? "default" : "pointer", fontWeight: 900 }}><Upload size={14} /> {uploading ? "Subiendo..." : "Adjuntar archivos"}</button>
              <input ref={fileInputRef} type="file" multiple onChange={uploadAttachments} style={{ display: "none" }} />
            </div>
          </section>

          {isManager && row.estado === "solicitado" && (
            <section style={{ display: "grid", gap: 7 }}>
              <button onClick={() => onCoordinate("confirm")} style={{ padding: 10, borderRadius: 10, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 950 }}><CheckCircle2 size={15} /> Confirmar fecha solicitada</button>
              <button onClick={() => onCoordinate("propose")} style={{ padding: 10, borderRadius: 10, border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, cursor: "pointer", fontWeight: 950 }}><Clock3 size={15} /> Proponer otra fecha</button>
            </section>
          )}

          {!!sharedRows.length && (
            <section style={{ padding: 13, borderRadius: 12, border: `1px solid ${C.greenB}`, background: C.greenL }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.green, fontSize: 12.5, fontWeight: 950 }}><Merge size={15} /> Transporte compartido confirmado</div>
              {row.union_decidido_at && <div style={{ color: C.dim, fontSize: 9.8, marginTop: 4 }}>Decidió {actorName(row.union_decidido_por_perfil)} · {new Date(row.union_decidido_at).toLocaleString("es-AR")}</div>}
              <div style={{ display: "grid", gap: 5, marginTop: 9 }}>{sharedRows.map((item) => <div key={item.id} style={{ padding: "7px 9px", borderRadius: 8, background: C.panel, border: `1px solid ${C.greenB}` }}><b style={{ display: "block", color: C.text, fontSize: 11.5 }}>{movementHeadline(item)}</b><small style={{ display: "block", color: C.dim, marginTop: 2 }}>{item.obra || "Sin obra"} · {routeLabel(item)}</small></div>)}</div>
            </section>
          )}

          {row.union_estado === "rechazada" && row.union_observacion && (
            <section style={{ padding: 12, borderRadius: 11, border: `1px solid ${C.border}`, background: C.panel }}>
              <div style={{ color: C.muted, fontSize: 11.5, fontWeight: 950 }}><Truck size={14} /> Transporte separado</div>
              <div style={{ color: C.dim, fontSize: 10.5, marginTop: 4 }}>{row.union_observacion}</div>
              {row.union_decidido_at && <div style={{ color: C.dim, fontSize: 9.5, marginTop: 5 }}>Decidió {actorName(row.union_decidido_por_perfil)} · {new Date(row.union_decidido_at).toLocaleString("es-AR")}</div>}
            </section>
          )}

          {isManager && candidates.length > 0 && !mergeCandidate && !["realizado", "cancelado"].includes(row.estado) && (
            <section style={{ padding: 13, borderRadius: 12, border: `1px solid ${C.violetB}`, background: `linear-gradient(135deg, ${C.violetL}, ${C.panel})` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}><span><b style={{ display: "block", color: C.violet, fontSize: 12.5 }}>Posible viaje compartido</b><small style={{ display: "block", color: C.dim, marginTop: 3 }}>Coinciden fecha y tipo de transporte. Revisá espacio y recorrido.</small></span><Merge size={17} color={C.violet} /></div>
              <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                {candidates.map((candidate) => (
                  <button key={candidate.id} disabled={saving} onClick={() => { setMergeCandidate(candidate); setMergeNote(""); }} style={{ padding: "10px 11px", borderRadius: 9, border: `1px solid ${C.violetB}`, background: C.panelSolid, color: C.text, cursor: "pointer", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 10, textAlign: "left" }}><span style={{ minWidth: 0 }}><b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11.8 }}>{movementHeadline(candidate)}</b><small style={{ display: "block", color: C.dim, marginTop: 4 }}>{fmtDate(displayDate(candidate), true)} · {candidate.obra || "Sin obra"} · {routeLabel(candidate)}</small></span><span style={{ color: C.violet, fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap" }}>Comparar <ChevronRight size={12} /></span></button>
                ))}
              </div>
            </section>
          )}

          {isManager && mergeCandidate && (
            <section className="log-enter" style={{ padding: 14, borderRadius: 13, border: `1px solid ${C.violetB}`, background: C.violetL }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}><span><b style={{ display: "block", color: C.violet, fontSize: 13 }}>Evaluar unión de transportes</b><small style={{ display: "block", color: C.muted, marginTop: 3 }}>Compras confirma si ambas cargas entran y el recorrido es compatible.</small></span><button onClick={() => setMergeCandidate(null)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, cursor: "pointer" }}><X size={13} /></button></div>
              <div style={{ display: "grid", gap: 7, marginTop: 11 }}>
                {[row, mergeCandidate].map((item, index) => <div key={item.id} style={{ padding: 11, borderRadius: 10, border: `1px solid ${index === 0 ? C.blueB : C.violetB}`, background: C.panelSolid }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><span style={{ color: index === 0 ? C.blue : C.violet, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".1em" }}>{index === 0 ? "Movimiento actual" : "Movimiento a combinar"}</span><span style={{ color: C.dim, fontFamily: C.mono, fontSize: 9.5 }}>{fmtDate(displayDate(item))} · {displayTime(item) || "Sin hora"}</span></div><b style={{ display: "block", color: C.text, fontSize: 12.5, marginTop: 6 }}>{movementHeadline(item)}</b><div style={{ display: "grid", gap: 3, color: C.dim, fontSize: 10.5, marginTop: 6 }}><span><b style={{ color: C.muted }}>Obra:</b> {item.obra || "Sin obra"}</span><span><b style={{ color: C.muted }}>Recorrido:</b> {routeLabel(item)}</span><span><b style={{ color: C.muted }}>Proveedor:</b> {providerSummary(item)}</span></div></div>)}
              </div>
              <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, fontSize: 10.5 }}><AlertTriangle size={13} color={C.violet} /> El sistema detecta la coincidencia; Compras debe validar capacidad física y horarios.</div>
              <textarea value={mergeNote} onChange={(event) => setMergeNote(event.target.value)} placeholder="Observación opcional: no entra por volumen, recorridos incompatibles..." style={{ ...FIELD, minHeight: 62, marginTop: 9, resize: "vertical" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 9 }}>
                <button disabled={saving} onClick={() => decideMerge(false)} style={{ padding: 10, borderRadius: 9, border: `1px solid ${C.border2}`, background: C.panel, color: C.muted, cursor: "pointer", fontWeight: 900 }}><Truck size={14} /> Pedir otro flete</button>
                <button disabled={saving} onClick={() => decideMerge(true)} style={{ padding: 10, borderRadius: 9, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 950 }}><Merge size={14} /> Aceptar unión</button>
              </div>
            </section>
          )}

          {isManager && (
            <section style={{ padding: 13, borderRadius: 12, background: C.panel, border: `1px solid ${C.border}` }}>
              <span style={LABEL}>Costo del movimiento</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 82px", gap: 7 }}><input type="number" min="0" step="0.01" style={FIELD} value={cost} onChange={(event) => setCost(event.target.value)} placeholder="Importe" /><select style={FIELD} value={currency} onChange={(event) => setCurrency(event.target.value)}><option>ARS</option><option>USD</option></select></div>
              <input style={{ ...FIELD, marginTop: 7 }} value={costDetail} onChange={(event) => setCostDetail(event.target.value)} placeholder="Detalle, factura o referencia" />
              <button disabled={saving} onClick={() => action(() => guardarCostoMovimiento(row, { costo: cost, moneda: currency, detalle: costDetail }, profile), "Costo guardado.")} style={{ width: "100%", marginTop: 7, padding: 8, borderRadius: 9, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, cursor: "pointer", fontWeight: 900 }}><Banknote size={14} /> Guardar costo</button>
              {row.costo_updated_by && <div style={{ color: C.dim, fontSize: 10, marginTop: 7 }}>Última carga: {actorName(row.costo_por)}</div>}
            </section>
          )}

          <section style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {own && row.estado === "solicitado" && <button onClick={onEdit} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: "pointer", fontWeight: 850 }}>Editar solicitud</button>}
            {isManager && row.estado === "confirmado" && <button disabled={saving} onClick={() => action(() => actualizarEstadoMovimiento(row, "realizado", profile), "Movimiento marcado como realizado.")} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 850 }}>Marcar realizado</button>}
            {isManager && !["realizado", "cancelado"].includes(row.estado) && <button disabled={saving} onClick={() => action(() => actualizarEstadoMovimiento(row, "cancelado", profile), "Movimiento cancelado.")} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.redB}`, background: "transparent", color: C.red, cursor: "pointer", fontWeight: 850 }}>Cancelar movimiento</button>}
          </section>

          {isManager && (
            <section style={{ paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              {!deleteConfirm ? (
                <button disabled={saving} onClick={() => setDeleteConfirm(true)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid transparent", background: "transparent", color: C.red, cursor: "pointer", fontWeight: 850, display: "inline-flex", alignItems: "center", gap: 6 }}><Trash2 size={14} /> Eliminar movimiento</button>
              ) : (
                <div style={{ padding: 12, borderRadius: 11, border: `1px solid ${C.redB}`, background: C.redL }}>
                  <div style={{ color: C.red, fontSize: 12.5, fontWeight: 950 }}>¿Eliminar definitivamente “{row.carga || row.titulo}”?</div>
                  <div style={{ marginTop: 4, color: C.muted, fontSize: 11 }}>Se eliminarán este movimiento y su historial. Esta acción no se puede deshacer.</div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 7, marginTop: 11 }}>
                    <button disabled={saving} onClick={() => setDeleteConfirm(false)} style={{ padding: "8px 11px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: "pointer", fontWeight: 850 }}>Conservar</button>
                    <button disabled={saving} onClick={removeMovement} style={{ padding: "8px 11px", borderRadius: 8, border: `1px solid ${C.redB}`, background: C.red, color: "white", cursor: saving ? "default" : "pointer", opacity: saving ? .55 : 1, fontWeight: 950, display: "inline-flex", alignItems: "center", gap: 6 }}><Trash2 size={14} /> {saving ? "Eliminando..." : "Sí, eliminar"}</button>
                  </div>
                </div>
              )}
            </section>
          )}

          <section>
            <button onClick={() => setHistoryOpen((value) => !value)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", border: 0, borderTop: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", fontWeight: 900 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><History size={14} /> Historial completo</span><span>{historyOpen ? "Ocultar" : `${history.length} cambios`}</span></button>
            {historyOpen && <div style={{ display: "grid", gap: 8, paddingTop: 5 }}>{history.map((item) => <div key={item.id} style={{ paddingLeft: 12, borderLeft: `2px solid ${statusUi(item.estado_nuevo).border}` }}><div style={{ color: C.text, fontSize: 11.5, fontWeight: 850 }}>{String(item.accion || "Cambio").replaceAll("_", " ")}</div><div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>{actorName(item.actor)} · {new Date(item.created_at).toLocaleString("es-AR")}</div></div>)}</div>}
          </section>
        </div>
      </aside>
    </div>
  );
}

function MonthView({ month, rows, milestones, weather, mergeableIds, onOpen, onMonth }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - leading + 1;
    if (day < 1 || day > daysInMonth) return null;
    return localDate(new Date(year, monthIndex, day));
  });
  const byDate = new Map();
  rows.forEach((row) => {
    const key = displayDate(row);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(row);
  });
  const milestoneMap = new Map();
  milestones.forEach((row) => {
    if (!milestoneMap.has(row.fecha)) milestoneMap.set(row.fecha, []);
    milestoneMap.get(row.fecha).push(row);
  });
  const visibleMovements = rows.filter((row) => displayDate(row)?.startsWith(`${year}-${String(monthIndex + 1).padStart(2, "0")}`)).length;
  const visibleMilestones = milestones.filter((row) => row.fecha?.startsWith(`${year}-${String(monthIndex + 1).padStart(2, "0")}`)).length;

  return (
    <section className="log-calendar-shell log-view-enter" style={{ background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden", boxShadow: "0 18px 55px var(--shadow)" }}>
      <div className="log-calendar-top" style={{ minHeight: 68, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: `1px solid ${C.border}`, background: `linear-gradient(115deg, ${C.panelSolid}, ${C.topbarSoft})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
          <span className="log-month-icon" style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}` }}><CalendarDays size={18} /></span>
          <span style={{ minWidth: 0 }}><small style={{ display: "block", color: C.dim, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".13em" }}>Agenda logística</small><strong style={{ display: "block", color: C.text, fontSize: 17, lineHeight: 1.2, textTransform: "capitalize", marginTop: 2 }}>{MESES[monthIndex]} <span style={{ color: C.dim, fontFamily: C.mono, fontWeight: 700 }}>{year}</span></strong></span>
          <span className="log-month-summary" style={{ color: C.dim, fontSize: 10.5, marginLeft: 5 }}>{visibleMovements} movimiento{visibleMovements === 1 ? "" : "s"}{visibleMilestones ? ` · ${visibleMilestones} anteriores` : ""}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="log-soft-button" onClick={() => onMonth(parseDate(TODAY))} style={{ height: 31, padding: "0 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: "pointer", fontSize: 10.5, fontWeight: 850 }}>Hoy</button>
          <span style={{ display: "flex", padding: 3, borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel }}>
            <button className="log-icon-button" aria-label="Mes anterior" onClick={() => onMonth(new Date(year, monthIndex - 1, 1))} style={{ width: 29, height: 27, display: "grid", placeItems: "center", borderRadius: 7, border: 0, background: "transparent", color: C.muted, cursor: "pointer" }}><ChevronLeft size={15} /></button>
            <button className="log-icon-button" aria-label="Mes siguiente" onClick={() => onMonth(new Date(year, monthIndex + 1, 1))} style={{ width: 29, height: 27, display: "grid", placeItems: "center", borderRadius: 7, border: 0, background: "transparent", color: C.muted, cursor: "pointer" }}><ChevronRight size={15} /></button>
          </span>
        </div>
      </div>
      <div className="log-calendar" style={{ minWidth: 900 }}>
        <div className="log-weekdays" style={{ display: "grid", gridTemplateColumns: CALENDAR_COLUMNS, borderBottom: `1px solid ${C.border}`, background: C.panel }}>{DIAS.map((day, index) => <div key={day} style={{ padding: "9px 10px", color: index > 4 ? C.violet : C.dim, background: index > 4 ? C.violetL : "transparent", fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".14em", textAlign: "center" }}>{day}</div>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: CALENDAR_COLUMNS }}>
          {cells.map((date, index) => {
            const events = date ? byDate.get(date) || [] : [];
            const marks = date ? milestoneMap.get(date) || [] : [];
            const dayWeather = date ? weather[date] : null;
            const weekend = index % 7 > 4;
            const visibleMarks = Math.max(0, 4 - events.length);
            return (
              <div className={`log-calendar-cell${date === TODAY ? " is-today" : ""}${weekend ? " is-weekend" : ""}${!date ? " is-empty" : ""}`} key={index} style={{ minHeight: 126, padding: 8, borderRight: index % 7 !== 6 ? `1px solid ${C.border}` : 0, borderBottom: index < 35 ? `1px solid ${C.border}` : 0, background: !date ? C.panel : date === TODAY ? C.blueL : weekend ? C.panel : "transparent" }}>
                {date && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: date === TODAY ? C.blue : C.dim, fontFamily: C.mono, fontSize: 10.5, fontWeight: 900, marginBottom: 7 }}><span className="log-day-number" style={{ width: 24, height: 24, borderRadius: 8, display: "grid", placeItems: "center", background: date === TODAY ? C.blue : "transparent", color: date === TODAY ? "white" : weekend ? C.muted : C.dim }}>{parseDate(date).getDate()}</span>{dayWeather && <span title={`${weatherLabel(dayWeather.code)} · viento ${Math.round(dayWeather.wind)} km/h · lluvia ${dayWeather.rain ?? 0}%`} style={{ display: "inline-flex", alignItems: "center", gap: 3, color: Number(dayWeather.wind) >= 30 ? C.red : C.dim, fontSize: 8.5 }}>{Number(dayWeather.rain) >= 40 ? <CloudRain size={10} /> : <CloudSun size={10} />}{Math.round(dayWeather.max)}°</span>}</div>}
                {events.slice(0, 4).map((row) => { const ui = transportUi(transportsOf(row)[0]?.tipo); const state = statusUi(row.estado); const risky = hasCrane(row) && Number(dayWeather?.wind) >= 30; const canMerge = mergeableIds?.has(row.id); return <button className="log-event-pill" key={row.id} onClick={() => onOpen(row)} title={`${movementHeadline(row)} · ${routeLabel(row)}${canMerge ? " · Posible unión" : ""}${risky ? " · Revisar viento" : ""}`} style={{ width: "100%", display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: 5, textAlign: "left", overflow: "hidden", marginBottom: 4, padding: "5px 6px", borderRadius: 7, border: `1px solid ${risky ? C.redB : ui.border}`, borderLeft: `2px solid ${risky ? C.red : state.color}`, background: risky ? C.redL : ui.soft, color: risky ? C.red : C.text, cursor: "pointer", fontSize: 9.2, fontWeight: 850 }}><span style={{ color: risky ? C.red : ui.color, fontFamily: C.mono, fontSize: 8.7 }}>{displayTime(row) || "—"}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{movementHeadline(row)}</span>{canMerge && <Merge size={9} color={C.violet} />}</button>; })}
                {events.length > 4 && <div style={{ color: C.blue, fontSize: 8.8, fontWeight: 850, padding: "1px 4px" }}>+{events.length - 4} movimientos</div>}
                {marks.slice(0, visibleMarks).map((mark) => <div className="log-legacy-pill" key={mark.id} title={mark.notas || "Registro del calendario anterior"} style={{ marginTop: 4, padding: "4px 6px", borderRadius: 6, border: `1px dashed ${C.border2}`, background: C.panel2, color: C.muted, fontSize: 8.6, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>◇ {cleanTime(mark.hora) ? `${cleanTime(mark.hora)} · ` : ""}{mark.titulo}{mark.obra ? ` · ${mark.obra}` : ""}</div>)}
                {marks.length > visibleMarks && <div style={{ color: C.dim, fontSize: 8.5, marginTop: 3 }}>+{marks.length - visibleMarks} anteriores</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CostsView({ rows }) {
  const now = parseDate(TODAY);
  const [month, setMonth] = useState(localDate(new Date(now.getFullYear(), now.getMonth(), 1)).slice(0, 7));
  const monthRows = rows.filter((row) => displayDate(row)?.startsWith(month) && row.costo != null && row.estado !== "cancelado");
  const ars = monthRows.filter((row) => row.moneda !== "USD").reduce((sum, row) => sum + Number(row.costo || 0), 0);
  const usd = monthRows.filter((row) => row.moneda === "USD").reduce((sum, row) => sum + Number(row.costo || 0), 0);
  const byProvider = Object.entries(monthRows.reduce((acc, row) => {
    const key = providerSummary(row);
    if (!acc[key]) acc[key] = { count: 0, ars: 0, usd: 0 };
    acc[key].count += 1;
    acc[key][row.moneda === "USD" ? "usd" : "ars"] += Number(row.costo || 0);
    return acc;
  }, {})).sort((a, b) => (b[1].ars + b[1].usd) - (a[1].ars + a[1].usd));

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><div><h2 style={{ margin: 0, color: C.text, fontSize: 16 }}>Costos logísticos</h2><p style={{ margin: "4px 0 0", color: C.dim, fontSize: 11.5 }}>Movimientos con importe cargado, agrupados por mes y proveedor.</p></div><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} style={{ ...FIELD, width: 160 }} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}><Kpi label="Total ARS" value={fmtMoney(ars)} hint={`${monthRows.length} movimientos con costo`} tone="blue" icon={Banknote} /><Kpi label="Total USD" value={fmtMoney(usd, "USD")} hint="Registrado sin conversión" tone="green" icon={CircleDollarSign} /><Kpi label="Sin costo" value={rows.filter((row) => displayDate(row)?.startsWith(month) && row.costo == null && row.estado !== "cancelado").length} hint="Pendientes de completar" tone="violet" icon={AlertTriangle} /></div>
      <div className="log-cost-grid" style={{ display: "grid", gridTemplateColumns: "minmax(260px,.7fr) minmax(0,1.3fr)", gap: 12 }}>
        <section style={{ padding: 14, borderRadius: 13, background: C.panelSolid, border: `1px solid ${C.border}` }}><span style={LABEL}>Por proveedor</span><div style={{ display: "grid", gap: 7 }}>{byProvider.length ? byProvider.map(([name, data]) => <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.border}` }}><span><b style={{ color: C.text, fontSize: 12.5 }}>{name}</b><small style={{ display: "block", color: C.dim, marginTop: 2 }}>{data.count} movimientos</small></span><span style={{ textAlign: "right", fontFamily: C.mono, color: C.muted, fontSize: 11 }}>{data.ars ? fmtMoney(data.ars) : ""}{data.usd ? <small style={{ display: "block", color: C.green }}>{fmtMoney(data.usd, "USD")}</small> : null}</span></div>) : <div style={{ color: C.dim, fontSize: 12, padding: 20, textAlign: "center" }}>Sin costos cargados para este mes.</div>}</div></section>
        <section style={{ borderRadius: 13, background: C.panelSolid, border: `1px solid ${C.border}`, overflow: "hidden" }}><div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 12.5, fontWeight: 900 }}>Detalle mensual</div><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}><thead><tr>{["Fecha", "Movimiento", "Proveedor", "Solicitado por", "Costo"].map((head) => <th key={head} style={{ padding: "9px 11px", textAlign: "left", color: C.dim, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".08em", borderBottom: `1px solid ${C.border}` }}>{head}</th>)}</tr></thead><tbody>{monthRows.map((row) => <tr key={row.id}><td style={{ padding: 11, color: C.dim, fontFamily: C.mono, fontSize: 10.5, borderBottom: `1px solid ${C.border}` }}>{fmtDate(displayDate(row))}</td><td style={{ padding: 11, color: C.text, fontSize: 11.5, fontWeight: 800, borderBottom: `1px solid ${C.border}` }}>{row.carga}</td><td style={{ padding: 11, color: C.muted, fontSize: 11, borderBottom: `1px solid ${C.border}` }}>{providerSummary(row)}</td><td style={{ padding: 11, color: C.muted, fontSize: 11, borderBottom: `1px solid ${C.border}` }}>{actorName(row.solicitante)}</td><td style={{ padding: 11, color: C.green, fontFamily: C.mono, fontSize: 11, fontWeight: 900, borderBottom: `1px solid ${C.border}` }}>{fmtMoney(row.costo, row.moneda)}</td></tr>)}</tbody></table></div></section>
      </div>
    </div>
  );
}

function csvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportMovementsCsv(items, scopeLabel = "filtrado") {
  const headers = ["Fecha", "Hora", "Estado", "Transporte", "Proveedor", "Movimiento", "Obra", "Modalidad", "Recorrido", "Solicitado por", "Carga manual", "Unión de flete", "Costo", "Moneda", "Detalle de costo", "Observaciones"];
  const lines = items
    .slice()
    .sort((a, b) => `${displayDate(a)}${displayTime(a)}`.localeCompare(`${displayDate(b)}${displayTime(b)}`))
    .map((row) => [
      displayDate(row),
      displayTime(row),
      statusUi(row.estado).label,
      transportSummary(row),
      providerSummary(row),
      row.carga || row.titulo,
      row.obra || "",
      row.modalidad === "trabajo_en_sitio" ? "Trabajo en un lugar" : "Traslado",
      routeLabel(row),
      actorName(row.solicitante),
      row.origen_manual ? "Sí" : "No",
      row.viaje_grupo_id ? "Unido" : row.union_estado === "rechazada" ? "Transporte separado" : row.union_estado === "sugerida" ? "Pendiente de evaluar" : "",
      row.costo ?? "",
      row.moneda || "ARS",
      row.costo_detalle || "",
      row.notas || "",
    ].map(csvValue).join(";"));
  const blob = new Blob(["\uFEFF", [headers.map(csvValue).join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `logistica-${scopeLabel}-${TODAY}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function LogisticaCalendarioScreen({ profile, signOut }) {
  const { isMobile } = useResponsive(920);
  const role = profile?.is_admin ? "admin" : profile?.role;
  const isManager = role === "admin" || role === "compras";
  const canRequest = role === "admin" || role === "tecnica" || role === "administracion";
  const [rows, setRows] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [weather, setWeather] = useState({});
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState(() => isMobile ? "agenda" : "calendario");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("todos");
  const [transport, setTransport] = useState("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [obraFilter, setObraFilter] = useState("todos");
  const [providerFilter, setProviderFilter] = useState("todos");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [month, setMonth] = useState(() => parseDate(TODAY));
  const [selected, setSelected] = useState(null);
  const [requestModal, setRequestModal] = useState(null);
  const [manualModal, setManualModal] = useState(false);
  const [coordination, setCoordination] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [movementRows, oldEvents, activeWorks] = await Promise.all([
        listarMovimientosLogisticos(),
        listarHitosCalendario(),
        listarObrasActivas(),
      ]);
      setRows(movementRows);
      setMilestones(oldEvents);
      setObras(activeWorks);
      const openId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("open") : null;
      setSelected((current) => movementRows.find((row) => row.id === (current?.id || openId)) || null);
    } catch (loadError) {
      setError(loadError.message || "No se pudo cargar el calendario logístico.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    fetch("https://api.open-meteo.com/v1/forecast?latitude=-34.44&longitude=-58.56&daily=weathercode,temperature_2m_max,temperature_2m_min,windspeed_10m_max,precipitation_probability_max&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=16")
      .then((response) => response.json())
      .then((payload) => {
        if (!alive || !payload?.daily?.time) return;
        const next = {};
        payload.daily.time.forEach((date, index) => {
          next[date] = {
            code: payload.daily.weathercode[index],
            max: payload.daily.temperature_2m_max[index],
            min: payload.daily.temperature_2m_min[index],
            wind: payload.daily.windspeed_10m_max[index],
            rain: payload.daily.precipitation_probability_max?.[index] ?? 0,
          };
        });
        setWeather(next);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const channel = supabase.channel("calendario-logistica-ui")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendario_eventos" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      const date = displayDate(row);
      if (status !== "todos" && row.estado !== status) return false;
      if (transport !== "todos" && !transportsOf(row).some((item) => item.tipo === transport)) return false;
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      if (obraFilter !== "todos" && row.obra !== obraFilter) return false;
      if (providerFilter !== "todos" && !transportsOf(row).some((item) => item.proveedor === providerFilter) && row.proveedor_logistico !== providerFilter) return false;
      if (!term) return true;
      const haystack = [row.carga, row.titulo, row.obra, transportSummary(row, true), row.notas, actorName(row.solicitante), routeLabel(row)].join(" ").toLowerCase();
      return term.split(/\s+/).every((word) => haystack.includes(word));
    });
  }, [dateFrom, dateTo, obraFilter, providerFilter, query, rows, status, transport]);

  const filterOptions = useMemo(() => ({
    obras: [...new Set(rows.map((row) => row.obra).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    providers: [...new Set(rows.flatMap((row) => transportsOf(row).map((item) => item.proveedor)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
  }), [rows]);
  const advancedFilterCount = [dateFrom, dateTo, obraFilter !== "todos", providerFilter !== "todos"].filter(Boolean).length;
  const hasAnyFilters = !!query || status !== "todos" || transport !== "todos" || advancedFilterCount > 0;

  const agendaRows = useMemo(() => filtered
    .filter((row) => row.estado !== "cancelado" && (dateFrom ? displayDate(row) >= dateFrom : displayDate(row) >= TODAY))
    .sort((a, b) => `${displayDate(a)}${displayTime(a)}`.localeCompare(`${displayDate(b)}${displayTime(b)}`)), [dateFrom, filtered]);
  const groups = useMemo(() => {
    const acc = {};
    agendaRows.forEach((row) => {
      const key = displayDate(row);
      (acc[key] ||= { movements: [], legacy: [] }).movements.push(row);
    });
    if (status === "todos" && transport === "todos" && obraFilter === "todos" && providerFilter === "todos") {
      const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      milestones.filter((row) => row.fecha >= (dateFrom || TODAY) && (!dateTo || row.fecha <= dateTo)).forEach((row) => {
        const haystack = [row.titulo, row.obra, row.notas, row.tipo].join(" ").toLowerCase();
        if (words.length && !words.every((word) => haystack.includes(word))) return;
        (acc[row.fecha] ||= { movements: [], legacy: [] }).legacy.push(row);
      });
    }
    return acc;
  }, [agendaRows, dateFrom, dateTo, milestones, obraFilter, providerFilter, query, status, transport]);
  const metrics = useMemo(() => ({
    pending: rows.filter((row) => row.estado === "solicitado").length,
    proposals: rows.filter((row) => row.estado === "fecha_propuesta").length,
    accepted: rows.filter((row) => row.estado === "fecha_aceptada").length,
    week: rows.filter((row) => !["cancelado", "realizado"].includes(row.estado) && displayDate(row) >= TODAY && displayDate(row) <= dateAdd(TODAY, 7)).length,
    urgent: rows.filter((row) => row.prioridad === "urgente" && !["cancelado", "realizado"].includes(row.estado)).length,
  }), [rows]);
  const mergeableIds = useMemo(() => {
    const ids = new Set();
    rows.forEach((row) => {
      sameTripCandidates(rows, { ...row, fechaSolicitada: displayDate(row) }, row.id).forEach((candidate) => {
        ids.add(row.id);
        ids.add(candidate.id);
      });
    });
    return ids;
  }, [rows]);

  function closeAndReload() {
    setRequestModal(null);
    setManualModal(false);
    setCoordination(null);
    load();
  }

  function clearFilters() {
    setQuery("");
    setStatus("todos");
    setTransport("todos");
    setDateFrom("");
    setDateTo("");
    setObraFilter("todos");
    setProviderFilter("todos");
  }

  const availableViews = VISTAS.filter((item) => !item.managerOnly || isManager);

  return (
    <div className="logistics-root" style={{ position: "fixed", inset: 0, display: "flex", background: C.bg, color: C.text, fontFamily: C.sans, overflow: "hidden" }}>
      <style>{`
        *,*::before,*::after{box-sizing:border-box}
        @keyframes logFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes logSlideIn{from{opacity:.35;transform:translateX(24px) scale(.985)}to{opacity:1;transform:translateX(0) scale(1)}}
        @keyframes logModalIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes logBackdrop{from{opacity:0}to{opacity:1}}
        @keyframes logPulse{0%,100%{box-shadow:0 0 0 0 currentColor}50%{box-shadow:0 0 0 4px transparent}}
        @keyframes logSpin{to{transform:rotate(360deg)}}
        .log-main{background:radial-gradient(circle at 92% 4%,var(--blue-soft),transparent 24%),radial-gradient(circle at 12% 88%,var(--violet-soft),transparent 26%)}
        .log-view-enter,.log-enter{animation:logFadeUp .34s cubic-bezier(.2,.8,.2,1) both}
        .log-card{position:relative;overflow:hidden;transition:transform .18s cubic-bezier(.2,.8,.2,1),border-color .18s ease,box-shadow .18s ease,background .18s ease}
        .log-card::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,var(--blue-soft),transparent 72%);transform:translateX(-120%);opacity:0;transition:transform .55s ease,opacity .2s ease;pointer-events:none}
        .log-card:hover{transform:translateY(-2px);border-color:var(--border-2)!important;box-shadow:0 14px 34px var(--shadow)}
        .log-card:hover::after{transform:translateX(120%);opacity:.55}
        .log-card:active{transform:translateY(0) scale(.997)}
        .log-metric,.log-weather{transition:transform .16s ease,border-color .16s ease,background .16s ease}
        .log-metric:hover,.log-weather:hover{transform:translateY(-1px);border-color:var(--border-2)!important}
        .log-status-dot.is-live{animation:logPulse 2.2s ease-in-out infinite}
        .log-icon-button,.log-soft-button,.log-tab,.log-primary-action{transition:transform .15s ease,background .15s ease,color .15s ease,border-color .15s ease,box-shadow .15s ease}
        .log-icon-button:hover,.log-soft-button:hover{color:var(--text)!important;background:var(--panel-2)!important;transform:translateY(-1px)}
        .log-tab:hover{color:var(--text)!important;background:var(--panel-2)!important}
        .log-tab.is-active{box-shadow:0 5px 15px var(--shadow)}
        .log-primary-action:hover{transform:translateY(-1px);box-shadow:0 10px 24px var(--shadow-strong)}
        .log-primary-action:active{transform:translateY(0) scale(.98)}
        .log-event-pill{transition:transform .14s ease,filter .14s ease,box-shadow .14s ease}
        .log-event-pill:hover{transform:translateX(2px);filter:saturate(1.12);box-shadow:0 5px 14px var(--shadow)}
        .log-calendar-cell{position:relative;transition:background .16s ease,box-shadow .16s ease}
        .log-calendar-cell:not(.is-empty):hover{z-index:1;box-shadow:inset 0 0 0 1px var(--border-2);background:var(--panel-2)!important}
        .log-calendar-cell.is-today::before{content:"";position:absolute;inset:0 auto 0 0;width:2px;background:var(--blue);box-shadow:0 0 16px var(--blue)}
        .log-day-number{transition:transform .16s ease}
        .log-calendar-cell:hover .log-day-number{transform:scale(1.08)}
        .log-detail-backdrop,.log-modal-backdrop{animation:logBackdrop .18s ease both;backdrop-filter:blur(4px)}
        .log-detail-sheet{animation:logSlideIn .28s cubic-bezier(.2,.8,.2,1) both;scrollbar-width:thin;scrollbar-color:var(--border-2) transparent}
        .log-modal-card{animation:logModalIn .24s cubic-bezier(.2,.8,.2,1) both}
        .log-detail-header::after{content:"";position:absolute;left:16px;right:16px;bottom:-1px;height:1px;background:linear-gradient(90deg,transparent,var(--blue-border),transparent)}
        .log-detail-hero{transition:border-color .18s ease,box-shadow .18s ease}
        .log-detail-hero:hover{border-color:var(--border-2)!important;box-shadow:0 12px 30px var(--shadow)}
        .log-day-group{animation:logFadeUp .32s cubic-bezier(.2,.8,.2,1) both}
        .spin{animation:logSpin .8s linear infinite}
        .log-card:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
        .log-main::-webkit-scrollbar,.log-detail::-webkit-scrollbar{width:8px;height:8px}
        .log-main::-webkit-scrollbar-thumb,.log-detail::-webkit-scrollbar-thumb{background:var(--border-2);border-radius:99px}
        .log-calendar-shell{isolation:isolate}
        button svg{vertical-align:middle}
        @media(max-width:920px){
          .log-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}
          .log-main{padding:12px!important}
          .log-header{padding-left:60px!important}
          .log-title-copy{min-width:0!important;flex:1}
          .log-title-copy p{display:none}
          .log-view-tabs{order:3;flex-basis:100%}
          .log-header-actions{margin-left:auto}
          .log-operational-strip{overflow-x:auto;flex-wrap:nowrap!important;scrollbar-width:none}
          .log-operational-strip::-webkit-scrollbar{display:none}
          .log-operational-strip>span[style*="flex: 1"]{display:none}
          .log-filters{align-items:stretch!important}
          .log-filter-advanced{grid-template-columns:repeat(2,minmax(0,1fr))!important}
          .log-detail-backdrop{padding:0!important}
          .log-detail{width:100%!important;border-radius:0!important;border:0!important}
          .log-transport-grid{grid-template-columns:repeat(3,1fr)!important}
          .log-stop{grid-template-columns:70px 1fr 34px!important}
          .log-stop input:nth-of-type(2),.log-stop input:nth-of-type(3){grid-column:2/3}
          .log-cost-grid{grid-template-columns:1fr!important}
        }
        @media(max-width:620px){
          .log-two{grid-template-columns:1fr!important}
          .log-kpis{grid-template-columns:1fr 1fr!important}
          .log-card{grid-template-columns:minmax(0,1fr)!important}
          .log-card>span:last-child{display:flex!important;align-items:center!important;justify-content:space-between!important;justify-items:initial!important;flex-wrap:wrap!important}
          .log-transport-grid{grid-template-columns:repeat(2,1fr)!important}
          .log-filter-advanced{grid-template-columns:1fr!important}
          .log-header{gap:9px!important;padding-top:8px!important;padding-bottom:8px!important}
          .log-title-copy h1{font-size:15px!important}
          .log-title-icon{width:34px!important;height:34px!important}
          .log-production-button span{display:none}
          .log-manual-button span,.log-export-button span{display:none}
          .log-manual-button,.log-export-button{width:36px!important;padding:0!important;justify-content:center!important}
          .log-primary-action span{display:none}
          .log-primary-action{width:36px!important;padding:0!important;justify-content:center!important}
          .log-calendar-top{min-height:60px!important}
          .log-month-summary{display:none}
          .log-weather span:last-child{display:none}
        }
        @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
      `}</style>
      <div style={{ flexShrink: 0, width: isMobile ? 0 : undefined, overflow: "visible" }}><Sidebar profile={profile} signOut={signOut} /></div>
      <main style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header className="log-header" style={{ flexShrink: 0, minHeight: 72, padding: "10px 22px", borderBottom: `1px solid ${C.border}`, background: C.topbar, backdropFilter: "blur(20px)", display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap", boxShadow: "0 7px 28px var(--shadow)" }}>
          <div className="log-title-icon" style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: `linear-gradient(145deg, ${C.blueL}, ${C.cyanL})`, border: `1px solid ${C.blueB}`, color: C.blue, boxShadow: "inset 0 1px 0 rgba(255,255,255,.12), 0 8px 22px var(--shadow)" }}><Route size={19} /></div>
          <div className="log-title-copy" style={{ minWidth: 190 }}><h1 style={{ margin: 0, color: C.text, fontSize: 17, fontWeight: 950, letterSpacing: "-.01em" }}>Logística y movimientos</h1><p style={{ margin: "3px 0 0", color: C.dim, fontSize: 11.5 }}>Coordinación de transportes, recursos y documentación.</p></div>
          <nav className="log-view-tabs" style={{ display: "flex", gap: 3, padding: 3, borderRadius: 11, border: `1px solid ${C.border}`, background: C.panel, overflowX: "auto" }}>{availableViews.map(({ id, label, icon: Icon }) => <button className={`log-tab${view === id ? " is-active" : ""}`} key={id} onClick={() => setView(id)} style={{ height: 32, padding: "0 11px", borderRadius: 8, border: `1px solid ${view === id ? C.border2 : "transparent"}`, background: view === id ? C.panelSolid : "transparent", color: view === id ? C.text : C.dim, cursor: "pointer", fontWeight: view === id ? 900 : 700, fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>{createElement(Icon, { size: 13 })}{label}</button>)}</nav>
          <div style={{ flex: 1 }} />
          <div className="log-header-actions" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {(role === "admin" || role === "tecnica") && <button className="log-soft-button log-production-button" onClick={() => window.location.assign("/calendario-produccion")} title="Abrir el calendario de producción anterior" style={{ height: 36, padding: "0 11px", borderRadius: 9, display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: "pointer", fontWeight: 850, fontSize: 10.5 }}><CalendarDays size={14} /><span>Producción anterior</span></button>}
            {isManager && <button className="log-soft-button log-manual-button" onClick={() => setManualModal(true)} title="Agregar movimiento manual" style={{ height: 36, padding: "0 11px", borderRadius: 9, display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--orange-border)", background: "var(--orange-soft)", color: C.orange, cursor: "pointer", fontWeight: 900, fontSize: 10.5 }}><Bike size={14} /><span>Movimiento manual</span></button>}
            {isManager && <div style={{ position: "relative" }}><button className="log-soft-button log-export-button" onClick={() => setExportOpen((open) => !open)} title="Exportar informe" style={{ height: 36, padding: "0 11px", borderRadius: 9, display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 900, fontSize: 10.5 }}><Download size={14} /><span>Exportar</span></button>{exportOpen && <div className="log-modal-card" style={{ position: "absolute", top: 42, right: 0, zIndex: 20, width: 238, padding: 7, borderRadius: 11, border: `1px solid ${C.border2}`, background: C.panelSolid, boxShadow: "0 18px 50px var(--shadow-strong)", display: "grid", gap: 4 }}><button onClick={() => { exportMovementsCsv(filtered, "filtrado"); setExportOpen(false); }} style={{ padding: "9px 10px", borderRadius: 8, border: 0, background: C.blueL, color: C.blue, cursor: "pointer", textAlign: "left", fontWeight: 900 }}><Download size={13} /> Exportar filtrado ({filtered.length})</button><button onClick={() => { exportMovementsCsv(rows, "completo"); setExportOpen(false); }} style={{ padding: "9px 10px", borderRadius: 8, border: 0, background: "transparent", color: C.muted, cursor: "pointer", textAlign: "left", fontWeight: 850 }}><Download size={13} /> Exportar todo ({rows.length})</button><small style={{ padding: "4px 7px", color: C.dim, lineHeight: 1.35 }}>CSV para Excel con fechas, proveedores, decisiones de unión y costos.</small></div>}</div>}
            <button className="log-icon-button" onClick={load} title="Actualizar" style={{ width: 36, height: 36, borderRadius: 9, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, background: C.panel, color: C.dim, cursor: "pointer" }}><RefreshCw className={loading ? "spin" : ""} size={15} /></button>
            {canRequest && <button className="log-primary-action" onClick={() => setRequestModal({ row: null })} style={{ height: 37, padding: "0 14px", borderRadius: 9, display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${C.blueB}`, background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`, color: "white", cursor: "pointer", fontWeight: 950, fontSize: 12 }}><Plus size={15} /><span>Solicitar movimiento</span></button>}
          </div>
        </header>

        <div className="log-main" style={{ flex: 1, overflowY: "auto", padding: 18 }}>
          <div className="log-workspace" style={{ width: "min(1480px,100%)", margin: "0 auto", display: "grid", gap: 12 }}>
            <section className="log-operational-strip log-view-enter" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: 7, borderRadius: 12, border: `1px solid ${C.border}`, background: C.topbarSoft, backdropFilter: "blur(14px)" }}>
              <MiniMetric label="Por coordinar" value={metrics.pending} tone="blue" icon={FileClock} />
              <MiniMetric label="Responde Técnica" value={metrics.proposals} tone="violet" icon={Clock3} />
              {metrics.accepted > 0 && <MiniMetric label="Confirma Compras" value={metrics.accepted} tone="cyan" icon={CheckCircle2} />}
              <MiniMetric label="Próximos 7 días" value={metrics.week} tone="green" icon={CalendarDays} />
              {metrics.urgent > 0 && <MiniMetric label="Urgentes" value={metrics.urgent} tone="red" icon={AlertTriangle} />}
              <span style={{ flex: 1 }} />
              <WeatherStrip weather={weather} />
            </section>

            <section className="log-filters log-view-enter" style={{ padding: 9, borderRadius: 13, background: C.panelSolid, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", boxShadow: "0 10px 28px var(--shadow)" }}>
                <div style={{ position: "relative", flex: "1 1 300px" }}><Search size={14} style={{ position: "absolute", left: 12, top: 12, color: query ? C.blue : C.dim, transition: "color .15s ease" }} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar carga, obra, proveedor, recorrido o solicitante..." style={{ ...FIELD, minHeight: 38, paddingLeft: 34, background: C.panel }} /></div>
                <select value={status} onChange={(event) => setStatus(event.target.value)} style={{ ...FIELD, width: 185 }}><option value="todos">Todos los estados</option>{Object.entries(ESTADOS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select>
                <select value={transport} onChange={(event) => setTransport(event.target.value)} style={{ ...FIELD, width: 150 }}><option value="todos">Todo transporte</option>{Object.entries(TRANSPORTES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select>
                <button onClick={() => setShowAdvancedFilters((open) => !open)} style={{ minHeight: 39, padding: "0 11px", borderRadius: 9, border: `1px solid ${showAdvancedFilters || advancedFilterCount ? C.violetB : C.border}`, background: showAdvancedFilters || advancedFilterCount ? C.violetL : C.panel, color: showAdvancedFilters || advancedFilterCount ? C.violet : C.dim, cursor: "pointer", fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 6 }}><SlidersHorizontal size={13} /> Más filtros{advancedFilterCount ? ` · ${advancedFilterCount}` : ""}</button>
                {hasAnyFilters && <button onClick={clearFilters} style={{ minHeight: 39, padding: "0 10px", borderRadius: 9, border: "1px solid transparent", background: "transparent", color: C.red, cursor: "pointer", fontWeight: 850 }}>Limpiar</button>}
                {showAdvancedFilters && <div className="log-filter-advanced log-enter" style={{ flexBasis: "100%", paddingTop: 9, borderTop: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "repeat(4,minmax(150px,1fr)) auto", gap: 8, alignItems: "end" }}><div><label style={LABEL}>Desde</label><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={FIELD} /></div><div><label style={LABEL}>Hasta</label><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} style={FIELD} /></div><div><label style={LABEL}>Obra / sector</label><select value={obraFilter} onChange={(event) => setObraFilter(event.target.value)} style={FIELD}><option value="todos">Todas</option>{filterOptions.obras.map((obra) => <option key={obra} value={obra}>{obra}</option>)}</select></div><div><label style={LABEL}>Proveedor</label><select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} style={FIELD}><option value="todos">Todos</option>{filterOptions.providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></div><div style={{ minHeight: 39, display: "flex", alignItems: "center", color: C.dim, fontFamily: C.mono, fontSize: 10.5 }}>{filtered.length} resultados</div></div>}
            </section>

            {error && <div style={{ padding: 13, borderRadius: 11, background: C.redL, border: `1px solid ${C.redB}`, color: C.red, fontSize: 12 }}><b>No se pudo abrir el nuevo calendario.</b><div style={{ marginTop: 4 }}>{error}</div><div style={{ marginTop: 5, color: C.muted }}>Aplicá la migración 20260803180000_calendario_logistica_operativa.sql en Supabase y reintentá.</div></div>}

            {loading ? <div className="log-view-enter" style={{ padding: 64, textAlign: "center", color: C.dim, border: `1px solid ${C.border}`, borderRadius: 16, background: C.panelSolid }}><span style={{ width: 42, height: 42, display: "grid", placeItems: "center", margin: "0 auto", borderRadius: 13, color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}` }}><RefreshCw size={19} className="spin" /></span><div style={{ marginTop: 11, color: C.muted, fontSize: 12, fontWeight: 850 }}>Preparando la agenda logística</div><div style={{ marginTop: 3, fontSize: 10.5 }}>Movimientos, clima y documentación.</div></div> : view === "calendario" ? (
              <div style={{ overflowX: "auto" }}><MonthView month={month} rows={filtered} milestones={milestones} weather={weather} mergeableIds={mergeableIds} onOpen={setSelected} onMonth={setMonth} /></div>
            ) : view === "costos" ? (
              <CostsView rows={filtered} />
            ) : view === "solicitudes" ? (
              <div className="log-view-enter" style={{ display: "grid", gap: 10 }}>{filtered.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map((row, index) => <MovementCard key={row.id} row={row} onOpen={setSelected} compact={isMobile} index={index} mergeHint={mergeableIds.has(row.id)} />)}{!filtered.length && <div style={{ padding: 48, textAlign: "center", color: C.dim, border: `1px dashed ${C.border2}`, borderRadius: 15, background: C.panel }}>No hay solicitudes con estos filtros.</div>}</div>
            ) : (
              <div className="log-view-enter" style={{ display: "grid", gap: 20 }}>
                {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateRows], groupIndex) => (
                  <section className="log-day-group" key={date} style={{ animationDelay: `${Math.min(groupIndex, 8) * 40}ms` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
                      <span style={{ minWidth: date === TODAY ? 48 : 0, padding: date === TODAY ? "5px 9px" : 0, borderRadius: 8, border: date === TODAY ? `1px solid ${C.blueB}` : 0, background: date === TODAY ? C.blueL : "transparent", color: date === TODAY ? C.blue : C.text, fontSize: 12, fontWeight: 950, textTransform: "capitalize" }}>{date === TODAY ? "Hoy" : fmtDate(date, true)}</span>
                      <span style={{ flex: 1, height: 1, background: C.border }} />
                      <span style={{ height: 23, minWidth: 23, padding: "0 7px", borderRadius: 99, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, display: "grid", placeItems: "center", fontFamily: C.mono, fontSize: 9.5 }}>{dateRows.movements.length + dateRows.legacy.length}</span>
                    </div>
                    <div style={{ display: "grid", gap: 7 }}>
                      {dateRows.movements.map((row, index) => <MovementCard key={row.id} row={row} onOpen={setSelected} compact={isMobile} index={index} mergeHint={mergeableIds.has(row.id)} />)}
                      {dateRows.legacy.map((row) => <LegacyEventCard key={`legacy-${row.id}`} row={row} compact={isMobile} />)}
                    </div>
                  </section>
                ))}
                {!Object.keys(groups).length && <div style={{ padding: 56, textAlign: "center", color: C.dim, border: `1px dashed ${C.border2}`, borderRadius: 13 }}><Truck size={26} style={{ marginBottom: 9 }} /><div style={{ color: C.text, fontWeight: 900 }}>No hay movimientos próximos</div><div style={{ fontSize: 11.5, marginTop: 4 }}>Probá cambiar los filtros o creá una solicitud.</div></div>}
              </div>
            )}
          </div>
        </div>
      </main>

      {requestModal && <RequestModal row={requestModal.row} rows={rows} obras={obras} profile={profile} onClose={() => setRequestModal(null)} onSaved={closeAndReload} />}
      {manualModal && <ManualMovementModal obras={obras} profile={profile} onClose={() => setManualModal(false)} onSaved={closeAndReload} />}
      {selected && <DetailPanel row={selected} rows={rows} profile={profile} isManager={isManager} onClose={() => setSelected(null)} onReload={load} onEdit={() => { setRequestModal({ row: selected }); setSelected(null); }} onCoordinate={(mode) => setCoordination({ row: selected, mode })} />}
      {coordination && <CoordinationModal row={coordination.row} mode={coordination.mode} profile={profile} onClose={() => setCoordination(null)} onSaved={closeAndReload} />}
    </div>
  );
}
