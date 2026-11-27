import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Bike,
  CalendarDays,
  CalendarRange,
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
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import Cargando from "@/components/ui/Cargando";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";
import { cargarFeriadosAnio } from "@/features/rrhh/feriados";
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
  { id: "semana", label: "Semana", icon: CalendarRange },
  { id: "calendario", label: "Mes", icon: CalendarDays },
  { id: "solicitudes", label: "Solicitudes", icon: PackageOpen },
  { id: "costos", label: "Costos", icon: CircleDollarSign, managerOnly: true },
];

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CALENDAR_COLUMNS = "repeat(5,minmax(132px,1fr)) repeat(2,minmax(96px,.62fr))";
const ARCHIVO_CATEGORIAS = {
  ot: { label: "OT / plano", color: C.orange },
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

function startOfWeek(value) {
  const date = parseDate(value) || parseDate(TODAY);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
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

function fechaTitulo(value) {
  const date = parseDate(value);
  if (!date) return "Elegí la fecha";
  const text = date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fmtMoney(value, currency = "ARS") {
  if (value == null || value === "") return "Sin cargar";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value));
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

function workLabel(row) {
  const value = String(row?.obra || "").trim();
  if (!value) return "General ? sin obra";
  const obras = splitObrasValue(value);
  if (obras.length > 1) return `Obras ${obras.join(" + ")}`;
  return /^obra\b/i.test(value) ? value : `Obra ${value}`;
}

function splitObrasValue(value) {
  return String(value || "")
    .split(/\s*(?:\+|,|;|\n)\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rowMatchesObra(row, obra) {
  if (obra === "todos") return true;
  return splitObrasValue(row?.obra).some((item) => item === obra);
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
    <span className="log-state" style={{ color: ui.color }}>
      <i />
      {ui.label}
    </span>
  );
}

function TransportBadge({ row, compact = false }) {
  const type = transportsOf(row)[0]?.tipo;
  const ui = transportUi(type);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: ui.color, fontSize: compact ? 10.5 : 11.5, fontWeight: 700, minWidth: 0 }}>
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
        <span style={{ display: "block", color: C.text, fontFamily: C.mono, fontSize: 18, lineHeight: 1, fontWeight: 700 }}>{value}</span>
        <span style={{ display: "block", color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", marginTop: 5 }}>{label}</span>
        {hint && <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</span>}
      </span>
    </div>
  );
}

function LegacyEventCard({ row, compact = false }) {
  return (
    <div className={`log-row is-old${compact ? " is-compact" : ""}`}>
      {!compact && <span className="log-row-time">{cleanTime(row.hora) || "—"}</span>}
      <span style={{ minWidth: 0 }}>
        <span className="log-row-title">{row.titulo}</span>
        <span className="log-row-meta"><span>{row.obra ? `${row.obra} · ` : ""}{row.notas || "Movimiento registrado en el calendario anterior"}</span></span>
      </span>
      <span className="log-row-side"><span className="az-rotulo">Registro anterior</span></span>
    </div>
  );
}

function MovementCard({ row, onOpen, compact = false, index = 0, mergeHint = false }) {
  const type = transportsOf(row)[0]?.tipo;
  const ui = transportUi(type);
  const state = statusUi(row.estado);
  const shared = row.viaje_grupo_id;
  const separated = row.union_estado === "rechazada";
  return (
    <button type="button" className={`log-row log-enter${compact ? " is-compact" : ""}`} onClick={() => onOpen(row)} style={{ "--ev": state.color, "--tc": ui.color, "--ts": ui.soft, "--tb": ui.border, animationDelay: `${Math.min(index, 10) * 45}ms` }}>
      {!compact && (
        <span>
          <span className="log-row-time">{displayTime(row) || "—"}</span>
          <span className="log-row-date">{fmtDate(displayDate(row))}</span>
        </span>
      )}
      <span style={{ minWidth: 0 }}>
        <span className="log-row-title">
          <span className="log-row-icon"><TransportIcon type={type} size={15} /></span>
          {row.carga || row.titulo || "Movimiento"}
          {row.prioridad === "urgente" && <em className="log-flag is-red">Urgente</em>}
          {row.origen_manual && <em className="log-flag">Manual</em>}
        </span>
        <span className="log-row-meta">
          <span className="log-row-obra">{workLabel(row)}</span>
          <span style={{ color: ui.color }}><TransportIcon type={type} size={12} /> {transportSummary(row)}</span>
          <span><Truck size={12} /> {providerSummary(row)}</span>
          <span><UserRound size={12} /> {actorName(row.solicitante)}</span>
          <span className="log-row-ruta"><Route size={12} /> {routeLabel(row)}</span>
        </span>
        {compact && <span className="log-row-meta"><span>{fmtDate(displayDate(row), true)} · {displayTime(row) || "Sin hora"}</span></span>}
      </span>
      <span className="log-row-side">
        <StatusBadge status={row.estado} />
        {shared ? <span className="log-row-note" style={{ color: C.green }}><Merge size={12} /> Viaje unido</span> : mergeHint ? <span className="log-row-note" style={{ color: C.violet }}><Merge size={12} /> Posible unión</span> : separated ? <span className="log-row-note">Flete separado</span> : null}
      </span>
    </button>
  );
}

const FIELD = { width: "100%", minHeight: 40, borderRadius: 3, border: `1px solid ${C.border2}`, background: "transparent", color: C.text, padding: "8px 10px", outline: "none", fontFamily: C.sans, fontSize: 13.5 };
const LABEL = { display: "block", color: C.dim, fontSize: 10.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".18em", marginBottom: 7 };

function ModalShell({ eyebrow, title, subtitle, onClose, children, width = 720 }) {
  return (
    <div className="log-modal-backdrop" onMouseDown={onClose}>
      <div className="log-modal-card" onMouseDown={(event) => event.stopPropagation()} style={{ width }}>
        <div className="log-modal-head">
          <div style={{ minWidth: 0 }}>
            {eyebrow && <div className="az-rotulo">{eyebrow}</div>}
            <div className="log-modal-title">{title}</div>
            {subtitle && <div className="log-modal-sub">{subtitle}</div>}
          </div>
          <button type="button" className="log-btn is-icon is-ghost" onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function emptyStop(type, lugar = "") {
  return { tipo: type, lugar, direccion: "", recibe: "", telefono: "" };
}

function requestInitial(row, initialDate = "") {
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
    fechaSolicitada: row?.fecha_solicitada || initialDate || TODAY,
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

function RequestModal({ row, rows, obras, profile, initialDate = "", onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => requestInitial(row, initialDate));
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
    <ModalShell eyebrow={row ? "Editar solicitud" : "Solicitar movimiento"} title={fechaTitulo(form.fechaSolicitada)} subtitle="Compras coordina el transporte y confirma el horario." onClose={onClose} width={820}>
      <div style={{ padding: 18, overflowY: "auto", display: "grid", gap: 18 }}>
        <section>
          <label style={LABEL}>Plantillas rápidas</label>
          <div className="log-template-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7 }}>
            {PLANTILLAS.map((template) => {
              const active = form.plantillaCodigo === template.codigo;
              return (
                <button key={template.codigo} type="button" onClick={() => applyTemplate(template)} style={{ padding: "10px 11px", borderRadius: 3, textAlign: "left", background: active ? C.blueL : C.panel, border: `1px solid ${active ? C.blueB : C.border}`, color: active ? C.blue : C.text, cursor: "pointer", fontFamily: C.sans }}>
                  <b style={{ display: "block", fontSize: 12.5 }}>{template.nombre}</b>
                  <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 4, lineHeight: 1.3 }}>{template.detalle}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          <button type="button" onClick={() => setMode("traslado")} style={{ padding: 10, borderRadius: 3, border: `1px solid ${form.modalidad === "traslado" ? C.blueB : C.border}`, background: form.modalidad === "traslado" ? C.blueL : C.panel, color: form.modalidad === "traslado" ? C.blue : C.dim, cursor: "pointer", fontWeight: 600 }}><Route size={15} /> Traslado entre lugares</button>
          <button type="button" onClick={() => setMode("trabajo_en_sitio")} style={{ padding: 10, borderRadius: 3, border: `1px solid ${form.modalidad === "trabajo_en_sitio" ? C.violetB : C.border}`, background: form.modalidad === "trabajo_en_sitio" ? C.violetL : C.panel, color: form.modalidad === "trabajo_en_sitio" ? C.violet : C.dim, cursor: "pointer", fontWeight: 600 }}><MapPin size={15} /> Trabajo en un solo lugar</button>
        </section>

        <section>
          <label style={LABEL}>Transportes y cantidades *</label>
          <div className="log-transport-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 7 }}>
            {Object.entries(TRANSPORTES).map(([key, item]) => {
              const quantity = Number(form.transportes.find((resource) => resource.tipo === key)?.cantidad) || 0;
              const active = quantity > 0;
              return (
                <div key={key} style={{ minHeight: 74, padding: 8, borderRadius: 3, background: active ? item.soft : C.panel, border: `1px solid ${active ? item.border : C.border}`, color: active ? item.color : C.dim, fontFamily: C.sans }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 11.5, fontWeight: active ? 700 : 600 }}><Truck size={15} />{item.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 24px", gap: 4, alignItems: "center", marginTop: 9 }}>
                    <button type="button" onClick={() => changeTransport(key, -1)} disabled={!active} style={{ width: 24, height: 24, borderRadius: 3, border: `1px solid ${active ? item.border : C.border}`, background: C.panelSolid, color: active ? item.color : C.dim, cursor: active ? "pointer" : "default" }}>−</button>
                    <b style={{ textAlign: "center", fontFamily: C.mono, fontSize: 13 }}>{quantity}</b>
                    <button type="button" onClick={() => changeTransport(key, 1)} style={{ width: 24, height: 24, borderRadius: 3, border: `1px solid ${item.border}`, background: C.panelSolid, color: item.color, cursor: "pointer" }}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={LABEL}>Obra / sector</label>
            <input style={FIELD} list="logistica-obras" value={form.obra} onChange={(event) => set("obra", event.target.value)} />
            <datalist id="logistica-obras">{obras.map((obra) => <option key={obra.id} value={obra.codigo} />)}</datalist>
          </div>
          <div>
            <label style={LABEL}>{form.modalidad === "trabajo_en_sitio" ? "¿Qué trabajo se realiza? *" : "¿Qué se traslada? *"}</label>
            <input style={FIELD} value={form.carga} onChange={(event) => set("carga", event.target.value)} autoFocus />
          </div>
        </section>

        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ ...LABEL, marginBottom: 0 }}>{form.modalidad === "trabajo_en_sitio" ? "Lugar del trabajo" : "Recorrido"}</label>
            {form.modalidad === "traslado" && <button type="button" onClick={addStop} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.border}`, background: C.panel, color: C.blue, borderRadius: 3, padding: "6px 9px", cursor: "pointer", fontSize: 11.5, fontWeight: 600 }}><Plus size={13} /> Agregar parada</button>}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {form.paradas.map((stop, index) => (
              <div key={index} className="log-stop" style={{ display: "grid", gridTemplateColumns: "82px 1fr 1.35fr .85fr 34px", gap: 7, alignItems: "center", padding: 9, border: `1px solid ${C.border}`, borderRadius: 3, background: C.panel }}>
                <span style={{ color: form.modalidad === "trabajo_en_sitio" ? C.violet : index === 0 ? C.green : index === form.paradas.length - 1 ? C.blue : C.violet, fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{form.modalidad === "trabajo_en_sitio" ? "Lugar" : index === 0 ? "Origen" : index === form.paradas.length - 1 ? "Destino" : `Parada ${index}`}</span>
                <input style={{ ...FIELD, minHeight: 35 }} value={stop.lugar} onChange={(event) => updateStop(index, "lugar", event.target.value)} placeholder="Lugar" />
                <input style={{ ...FIELD, minHeight: 35 }} value={stop.direccion} onChange={(event) => updateStop(index, "direccion", event.target.value)} placeholder="Dirección" />
                <input style={{ ...FIELD, minHeight: 35 }} value={stop.recibe} onChange={(event) => updateStop(index, "recibe", event.target.value)} placeholder="Quién recibe" />
                <button type="button" disabled={form.paradas.length <= minStops} onClick={() => set("paradas", form.paradas.filter((_, idx) => idx !== index))} style={{ width: 32, height: 32, borderRadius: 3, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, background: "transparent", color: form.paradas.length <= minStops ? C.dim : C.red, cursor: form.paradas.length <= minStops ? "default" : "pointer", opacity: form.paradas.length <= minStops ? .35 : 1 }}><X size={14} /></button>
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
          <div style={{ display: "flex", gap: 9, padding: "10px 12px", borderRadius: 3, background: C.redL, border: `1px solid ${C.redB}`, color: C.red }}>
            <AlertTriangle size={17} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, lineHeight: 1.4 }}><b>Solicitud con menos de 48 horas.</b> Se enviará igual, marcada como urgente para que Compras pueda priorizarla.</div>
          </div>
        )}

        {suggestions.length > 0 && (
          <section style={{ padding: 12, borderRadius: 3, background: C.violetL, border: `1px solid ${C.violetB}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.violet, fontSize: 12, fontWeight: 600 }}><Merge size={15} /> Viajes que quizá se pueden aprovechar</div>
            <div style={{ color: C.dim, fontSize: 10.5, marginTop: 4 }}>Podés sugerir la unión. Compras revisará espacio y recorrido antes de aprobarla.</div>
            <div style={{ display: "grid", gap: 6, marginTop: 9 }}>
              {suggestions.map((candidate) => {
                const selected = form.viajeSugeridoId === candidate.id;
                return (
                  <button key={candidate.id} type="button" onClick={() => set("viajeSugeridoId", selected ? "" : candidate.id)} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", textAlign: "left", padding: "8px 10px", borderRadius: 3, background: selected ? C.panelSolid : "transparent", border: `1px solid ${selected ? C.violet : C.violetB}`, color: C.text, cursor: "pointer" }}>
                    <span style={{ minWidth: 0 }}><b style={{ fontSize: 12 }}>{movementHeadline(candidate)}</b><span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 3 }}>{fmtDate(displayDate(candidate))} · {candidate.obra || "Sin obra"} · {routeLabel(candidate)}</span></span>
                    <span style={{ color: C.violet, fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap" }}>{selected ? "Seleccionado" : "Sugerir unión"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <label style={LABEL}>Observaciones</label>
          <textarea style={{ ...FIELD, minHeight: 72, resize: "vertical" }} value={form.observaciones} onChange={(event) => set("observaciones", event.target.value)} />
        </section>
      </div>
      <div className="log-modal-foot">
        <button type="button" className="log-btn is-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="log-btn is-primary" disabled={!valid || saving} onClick={save}><Send size={14} /> {saving ? "Guardando…" : row ? "Guardar cambios" : "Enviar solicitud"}</button>
      </div>
    </ModalShell>
  );
}

function ManualMovementModal({ obras, profile, initialDate = "", onClose, onSaved }) {
  const toast = useToast();
  const manualFilesRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [manualFiles, setManualFiles] = useState([]);
  const [manualFileCategory, setManualFileCategory] = useState("ot");
  const [form, setForm] = useState({
    tipoTransporte: "motomensajeria",
    proveedor: "",
    carga: "",
    obras: [],
    fecha: initialDate || TODAY,
    hora: "09:00",
    modalidad: "traslado",
    paradas: [emptyStop("origen"), emptyStop("destino")],
    costo: "",
    moneda: "ARS",
    costoDetalle: "",
    observaciones: "",
  });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const [obraDraft, setObraDraft] = useState("");
  const requiredStops = form.modalidad === "trabajo_en_sitio" ? 1 : 2;
  const validStops = form.paradas.filter((stop) => String(stop.lugar || "").trim() || String(stop.direccion || "").trim());
  const valid = form.carga.trim() && form.fecha && validStops.length >= requiredStops;
  const type = transportUi(form.tipoTransporte);

  function setMode(modalidad) {
    setForm((current) => ({
      ...current,
      modalidad,
      paradas: modalidad === "trabajo_en_sitio" ? [emptyStop("lugar")] : [emptyStop("origen"), emptyStop("destino")],
    }));
  }

  function setStop(index, key, value) {
    setForm((current) => ({ ...current, paradas: current.paradas.map((stop, stopIndex) => stopIndex === index ? { ...stop, [key]: value } : stop) }));
  }

  function addDestination() {
    if (form.modalidad === "trabajo_en_sitio") return;
    setForm((current) => ({ ...current, paradas: [...current.paradas, emptyStop("destino")] }));
  }

  function removeStop(index) {
    if (form.paradas.length <= requiredStops) return;
    setForm((current) => ({ ...current, paradas: current.paradas.filter((_, stopIndex) => stopIndex !== index) }));
  }

  function stopLabel(index) {
    if (form.modalidad === "trabajo_en_sitio") return "Lugar del trabajo *";
    if (index === 0) return "Origen *";
    return form.paradas.length > 2 ? `Destino ${index} *` : "Destino *";
  }

  function addObra(value = obraDraft) {
    const obra = String(value || "").trim();
    if (!obra) return;
    setForm((current) => current.obras.some((item) => item.toLowerCase() === obra.toLowerCase())
      ? current
      : { ...current, obras: [...current.obras, obra] });
    setObraDraft("");
  }

  function removeObra(obra) {
    setForm((current) => ({ ...current, obras: current.obras.filter((item) => item !== obra) }));
  }

  function obraValueForSave() {
    return form.obras.length ? form.obras.join(" + ") : obraDraft.trim();
  }

  function setSelectedFiles(files) {
    setManualFiles(Array.from(files || []));
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const created = await crearMovimientoManualLogistica({ ...form, obra: obraValueForSave(), paradas: validStops }, profile);
      if (manualFiles.length) {
        await subirArchivosMovimiento(created.id, manualFiles, manualFileCategory, profile);
      }
      toast.success(manualFiles.length ? "Movimiento manual agregado con archivos." : "Movimiento manual agregado al calendario.");
      onSaved();
    } catch (error) {
      toast.error(error.message || "No se pudo agregar el movimiento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell eyebrow="Movimiento manual" title={fechaTitulo(form.fecha)} subtitle="Coordinado directamente por Compras: motomensajería, retiros, trámites o fletes." onClose={onClose} width={760}>
      <div style={{ padding: 18, display: "grid", gap: 14, overflowY: "auto" }}>
        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={LABEL}>Tipo de transporte</label><select value={form.tipoTransporte} onChange={(event) => set("tipoTransporte", event.target.value)} style={{ ...FIELD, color: type.color }}>{Object.entries(TRANSPORTES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></div>
          <div><label style={LABEL}>Proveedor / responsable</label><input value={form.proveedor} onChange={(event) => set("proveedor", event.target.value)} list="manual-proveedores-logistica" style={FIELD} /><datalist id="manual-proveedores-logistica">{type.proveedores.map((provider) => <option key={provider} value={provider} />)}</datalist></div>
        </section>
        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1.3fr .7fr", gap: 10 }}>
          <div><label style={LABEL}>Título / qué se realiza *</label><input autoFocus value={form.carga} onChange={(event) => set("carga", event.target.value)} style={FIELD} /></div>
          <div>
            <label style={LABEL}>Obras / sector</label>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 6 }}>
              <input
                value={obraDraft}
                onChange={(event) => setObraDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addObra();
                  }
                }}
                list="manual-obras-logistica"
                style={FIELD}
              />
              <button type="button" onClick={() => addObra()} style={{ minWidth: 38, borderRadius: 3, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, cursor: "pointer", display: "grid", placeItems: "center" }} title="Agregar obra">
                <Plus size={14} />
              </button>
            </div>
            <datalist id="manual-obras-logistica">{obras.map((obra) => <option key={obra.id} value={obra.codigo} />)}</datalist>
            {form.obras.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                {form.obras.map((obra) => (
                  <span key={obra} style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%", padding: "4px 7px", borderRadius: 999, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, fontFamily: C.mono, fontSize: 10.5, fontWeight: 600 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obra}</span>
                    <button type="button" onClick={() => removeObra(obra)} aria-label={`Quitar ${obra}`} style={{ border: 0, background: "transparent", color: C.blue, padding: 0, cursor: "pointer", display: "inline-flex" }}><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={LABEL}>Fecha *</label><input type="date" value={form.fecha} onChange={(event) => set("fecha", event.target.value)} style={FIELD} /></div>
          <div><label style={LABEL}>Hora</label><input type="time" value={form.hora} onChange={(event) => set("hora", event.target.value)} style={FIELD} /></div>
        </section>
        <section>
          <label style={LABEL}>Modalidad</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><button onClick={() => setMode("traslado")} style={{ padding: 9, borderRadius: 3, border: `1px solid ${form.modalidad === "traslado" ? C.blueB : C.border}`, background: form.modalidad === "traslado" ? C.blueL : C.panel, color: form.modalidad === "traslado" ? C.blue : C.dim, cursor: "pointer", fontWeight: 600 }}><Route size={14} /> Traslado</button><button onClick={() => setMode("trabajo_en_sitio")} style={{ padding: 9, borderRadius: 3, border: `1px solid ${form.modalidad === "trabajo_en_sitio" ? C.violetB : C.border}`, background: form.modalidad === "trabajo_en_sitio" ? C.violetL : C.panel, color: form.modalidad === "trabajo_en_sitio" ? C.violet : C.dim, cursor: "pointer", fontWeight: 600 }}><MapPin size={14} /> Un solo lugar</button></div>
        </section>
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <label style={{ ...LABEL, marginBottom: 0 }}>{form.modalidad === "trabajo_en_sitio" ? "Lugar" : "Recorrido"}</label>
            {form.modalidad === "traslado" && (
              <button type="button" onClick={addDestination} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 3, padding: "6px 9px", cursor: "pointer", fontSize: 11.5, fontWeight: 600 }}>
                <Plus size={13} /> Agregar destino
              </button>
            )}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {form.paradas.map((stop, index) => (
              <div key={`${stop.tipo}-${index}`} className="log-stop log-manual-stop" style={{ display: "grid", gridTemplateColumns: form.modalidad === "trabajo_en_sitio" ? "112px minmax(0,1fr) minmax(0,1.1fr)" : "92px minmax(0,1fr) minmax(0,1.1fr) 34px", gap: 7, alignItems: "center", padding: 9, border: `1px solid ${C.border}`, borderRadius: 3, background: C.panel }}>
                <span style={{ color: form.modalidad === "trabajo_en_sitio" ? C.violet : index === 0 ? C.green : C.blue, fontSize: 10, fontWeight: 600, textTransform: "uppercase", lineHeight: 1.2 }}>{stopLabel(index)}</span>
                <input value={stop.lugar} onChange={(event) => setStop(index, "lugar", event.target.value)} style={{ ...FIELD, minHeight: 35 }} placeholder="Lugar" />
                <input value={stop.direccion} onChange={(event) => setStop(index, "direccion", event.target.value)} style={{ ...FIELD, minHeight: 35 }} placeholder="Dirección" />
                {form.modalidad === "traslado" && (
                  <button type="button" disabled={form.paradas.length <= requiredStops} onClick={() => removeStop(index)} title="Quitar parada" style={{ width: 32, height: 32, borderRadius: 3, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, background: "transparent", color: form.paradas.length <= requiredStops ? C.dim : C.red, cursor: form.paradas.length <= requiredStops ? "default" : "pointer", opacity: form.paradas.length <= requiredStops ? .35 : 1 }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="log-two" style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 10 }}>
          <div><label style={LABEL}>Costo</label><input type="number" min="0" step="0.01" value={form.costo} onChange={(event) => set("costo", event.target.value)} style={FIELD} /></div>
          <div><label style={LABEL}>Moneda</label><select value={form.moneda} onChange={(event) => set("moneda", event.target.value)} style={FIELD}><option>ARS</option><option>USD</option></select></div>
        </section>
        <section style={{ padding: 11, borderRadius: 3, border: `1px solid ${C.border}`, background: C.panel }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <label style={{ ...LABEL, marginBottom: 0 }}>Archivos adjuntos</label>
            <span style={{ color: C.dim, fontSize: 9.5 }}>PDF, DXF, fotos, OT ? hasta 50 MB</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 7 }}>
            <select value={manualFileCategory} onChange={(event) => setManualFileCategory(event.target.value)} style={{ ...FIELD, height: 35 }}>{Object.entries(ARCHIVO_CATEGORIAS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select>
            <button type="button" onClick={() => manualFilesRef.current?.click()} style={{ minHeight: 35, borderRadius: 3, border: `1px dashed ${C.blueB}`, background: C.blueL, color: C.blue, cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <Paperclip size={14} /> {manualFiles.length ? `${manualFiles.length} archivo${manualFiles.length === 1 ? "" : "s"} seleccionado${manualFiles.length === 1 ? "" : "s"}` : "Adjuntar archivos"}
            </button>
            <input ref={manualFilesRef} type="file" multiple onChange={(event) => { setSelectedFiles(event.target.files); event.target.value = ""; }} style={{ display: "none" }} />
          </div>
          {manualFiles.length > 0 && (
            <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
              {manualFiles.map((file, index) => (
                <div key={`${file.name}-${file.size}-${index}`} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 3, border: `1px solid ${C.border}`, background: C.panelSolid }}>
                  <span style={{ minWidth: 0, color: C.text, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name} <small style={{ color: C.dim }}>{fmtFileSize(file.size)}</small></span>
                  <button type="button" onClick={() => setManualFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={{ border: 0, background: "transparent", color: C.red, cursor: "pointer", display: "inline-flex" }} title="Quitar archivo"><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </section>
        <div><label style={LABEL}>Detalle de costo / comprobante</label><input value={form.costoDetalle} onChange={(event) => set("costoDetalle", event.target.value)} style={FIELD} /></div>
        <div><label style={LABEL}>Observaciones</label><textarea value={form.observaciones} onChange={(event) => set("observaciones", event.target.value)} style={{ ...FIELD, minHeight: 68, resize: "vertical" }} /></div>
      </div>
      <div className="log-modal-foot"><button type="button" className="log-btn is-ghost" onClick={onClose}>Cancelar</button><button type="button" className="log-btn is-primary" disabled={!valid || saving} onClick={save}><Plus size={14} /> {saving ? "Guardando…" : "Agregar al calendario"}</button></div>
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
    <ModalShell eyebrow={mode === "confirm" ? "Confirmar movimiento" : "Proponer otra fecha"} title={row.carga || "Movimiento"} subtitle={`Solicitado por ${actorName(row.solicitante)}`} onClose={onClose} width={520}>
      <div style={{ padding: 18, display: "grid", gap: 14, overflowY: "auto" }}>
        <div>
          <label style={LABEL}>Proveedores por transporte *</label>
          <div style={{ display: "grid", gap: 7 }}>
            {resources.map((resource, index) => {
              const type = transportUi(resource.tipo);
              return (
                <div key={`${resource.tipo}-${index}`} style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr)", gap: 8, alignItems: "center", padding: 9, borderRadius: 3, border: `1px solid ${type.border}`, background: type.soft }}>
                  <b style={{ color: type.color, fontSize: 12 }}>{resource.cantidad} × {type.label}</b>
                  <div>
                    <input style={FIELD} list={`providers-${resource.tipo}-${index}`} value={resource.proveedor || ""} onChange={(event) => setProvider(index, event.target.value)} placeholder="Proveedor" />
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
        {mode === "propose" && <div style={{ padding: "9px 11px", borderRadius: 3, border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, fontSize: 11.5 }}>El solicitante deberá aceptar esta fecha. Después, Compras realizará la confirmación final del movimiento.</div>}
        <div><label style={LABEL}>Mensaje</label><textarea style={{ ...FIELD, minHeight: 68, resize: "vertical" }} value={message} onChange={(event) => setMessage(event.target.value)} /></div>
      </div>
      <div className="log-modal-foot">
        <button type="button" className="log-btn is-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="log-btn is-primary" disabled={!valid || saving} onClick={save}>{saving ? "Guardando…" : mode === "confirm" ? "Confirmar" : "Enviar propuesta"}</button>
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
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}><button onClick={onClose} style={{ width: 31, height: 31, display: "grid", placeItems: "center", borderRadius: 3, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, cursor: "pointer" }}><ArrowRight size={16} /></button><div><div style={{ fontSize: 13.5, fontWeight: 600 }}>Detalle del movimiento</div><div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>Registro #{String(row.id).slice(0, 8)}</div></div></div>
          <StatusBadge status={row.estado} />
        </div>

        <div style={{ padding: 18, display: "grid", gap: 18 }}>
          <section className="log-detail-hero" style={{ padding: 15, margin: "-2px -2px 0", borderRadius: 3, border: `1px solid ${C.border}`, background: `radial-gradient(circle at 100% 0%, ${transportUi(transportsOf(row)[0]?.tipo).soft}, transparent 48%), ${C.panel}` }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 7px", borderRadius: 3, color: transportUi(transportsOf(row)[0]?.tipo).color, background: transportUi(transportsOf(row)[0]?.tipo).soft, border: `1px solid ${transportUi(transportsOf(row)[0]?.tipo).border}`, fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em" }}><TransportIcon type={transportsOf(row)[0]?.tipo} size={11} /> {row.modalidad === "trabajo_en_sitio" ? "Trabajo en sitio" : "Traslado"}</span>
            {row.origen_manual && <span style={{ display: "inline-flex", marginLeft: 6, padding: "4px 7px", borderRadius: 3, color: C.orange, background: "var(--orange-soft)", border: "1px solid var(--orange-border)", fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em" }}>Carga manual</span>}
            <h2 style={{ margin: "10px 0 0", color: C.text, fontSize: 24, fontWeight: 300, lineHeight: 1.2 }}>{movementHeadline(row)}</h2>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10, color: C.dim, fontSize: 11.5 }}>
              {row.obra && <span style={{ color: C.blue, fontFamily: C.mono, fontWeight: 600 }}>{row.obra}</span>}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><UserRound size={13} /> Pedido por {actorName(row.solicitante)}</span>
              {row.prioridad === "urgente" && <span style={{ color: C.red, fontWeight: 600 }}>Urgente</span>}
            </div>
          </section>

          {row.estado === "fecha_propuesta" && own && (
            <section style={{ padding: 13, borderRadius: 3, background: C.violetL, border: `1px solid ${C.violetB}` }}>
              <div style={{ color: C.violet, fontSize: 12.5, fontWeight: 600 }}>Compras propuso {fmtDate(row.fecha_propuesta, true)} a las {cleanTime(row.hora_propuesta)}</div>
              {row.propuesta_mensaje && <div style={{ color: C.muted, fontSize: 11.5, marginTop: 6 }}>{row.propuesta_mensaje}</div>}
              <div style={{ display: "flex", gap: 7, marginTop: 11 }}>
                <button disabled={saving} onClick={() => action(() => responderFechaMovimiento(row, true, profile), "Fecha aceptada. Compras debe realizar la confirmación final.")} style={{ flex: 1, padding: 9, borderRadius: 3, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 600 }}><Check size={14} /> Aceptar fecha</button>
                <button disabled={saving} onClick={() => action(() => responderFechaMovimiento(row, false, profile), "Propuesta rechazada. Compras fue avisado.")} style={{ flex: 1, padding: 9, borderRadius: 3, border: `1px solid ${C.redB}`, background: C.redL, color: C.red, cursor: "pointer", fontWeight: 600 }}><X size={14} /> Rechazar</button>
              </div>
            </section>
          )}

          {row.estado === "fecha_aceptada" && (
            <section style={{ padding: 13, borderRadius: 3, background: C.cyanL, border: `1px solid ${C.cyanB}` }}>
              <div style={{ color: C.cyan, fontSize: 12.5, fontWeight: 600 }}>Fecha aceptada por Técnica</div>
              <div style={{ color: C.muted, fontSize: 11.5, marginTop: 5 }}>{fmtDate(row.fecha_propuesta, true)} a las {cleanTime(row.hora_propuesta) || "sin hora"}. Falta la confirmación definitiva de Compras.</div>
              {isManager && <button disabled={saving} onClick={() => action(() => confirmarFechaAceptadaMovimiento(row, profile), "Movimiento confirmado definitivamente.")} style={{ width: "100%", marginTop: 11, padding: 10, borderRadius: 3, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 600 }}><CheckCircle2 size={15} /> Confirmar movimiento</button>}
            </section>
          )}

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ padding: 11, borderRadius: 3, background: C.panel, border: `1px solid ${C.border}` }}><span style={LABEL}>Fecha solicitada</span><b style={{ color: C.text, fontFamily: C.mono, fontSize: 13 }}>{fmtDate(row.fecha_solicitada)} · {cleanTime(row.hora_solicitada) || "Sin hora"}</b></div>
            <div style={{ padding: 11, borderRadius: 3, background: C.panel, border: `1px solid ${C.border}` }}><span style={LABEL}>{row.estado === "fecha_propuesta" ? "Fecha propuesta" : row.estado === "fecha_aceptada" ? "Aceptada · falta Compras" : "Fecha confirmada"}</span><b style={{ color: row.estado === "fecha_aceptada" ? C.cyan : row.fecha_confirmada ? C.green : row.fecha_propuesta ? C.violet : C.dim, fontFamily: C.mono, fontSize: 13 }}>{row.fecha_confirmada || row.fecha_propuesta ? `${fmtDate(row.fecha_confirmada || row.fecha_propuesta)} · ${cleanTime(row.hora_confirmada || row.hora_propuesta) || "Sin hora"}` : "Pendiente"}</b></div>
          </section>

          <section>
            <span style={LABEL}>{row.modalidad === "trabajo_en_sitio" ? "Lugar del trabajo" : "Recorrido"}</span>
            <div style={{ display: "grid", gap: 0 }}>
              {(row.paradas || []).map((stop, index) => (
                <div key={index} style={{ position: "relative", display: "grid", gridTemplateColumns: "26px minmax(0,1fr)", gap: 9, paddingBottom: index < row.paradas.length - 1 ? 15 : 0 }}>
                  {index < row.paradas.length - 1 && <span style={{ position: "absolute", left: 12, top: 22, bottom: 0, width: 1, background: C.border2 }} />}
                  <span style={{ width: 25, height: 25, borderRadius: 3, display: "grid", placeItems: "center", color: index === 0 ? C.green : index === row.paradas.length - 1 ? C.blue : C.violet, background: C.panel, border: `1px solid ${C.border}` }}><MapPin size={13} /></span>
                  <span style={{ minWidth: 0 }}><b style={{ color: C.text, fontSize: 12.5 }}>{stop.lugar || stop.direccion || `Parada ${index + 1}`}</b>{stop.direccion && stop.lugar && <span style={{ display: "block", color: C.dim, fontSize: 11, marginTop: 2 }}>{stop.direccion}</span>}{stop.recibe && <span style={{ display: "block", color: C.muted, fontSize: 10.5, marginTop: 3 }}>Recibe: {stop.recibe}{stop.telefono ? ` · ${stop.telefono}` : ""}</span>}</span>
                </div>
              ))}
            </div>
          </section>

          {row.notas && <section><span style={LABEL}>Observaciones</span><div style={{ padding: 11, borderRadius: 3, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{row.notas}</div></section>}

          <section style={{ padding: 13, borderRadius: 3, background: C.panel, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: attachments.length ? 10 : 0 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.text, fontSize: 12.5, fontWeight: 600 }}><Paperclip size={14} /> Documentación <small style={{ color: C.dim, fontFamily: C.mono }}>{attachments.length}</small></span>
              <span style={{ color: C.dim, fontSize: 9.5 }}>Fotos, PDF y archivos · hasta 50 MB</span>
            </div>
            {!!attachments.length && <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              {attachments.map((file) => {
                const category = ARCHIVO_CATEGORIAS[file.categoria] || ARCHIVO_CATEGORIAS.otro;
                const isImage = String(file.mime_type || "").startsWith("image/");
                const canRemove = isManager || file.created_by === profile?.id;
                return (
                  <div key={file.id} style={{ minWidth: 0, padding: "8px 9px", borderRadius: 3, border: `1px solid ${C.border}`, background: C.panelSolid, display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 28, height: 28, borderRadius: 3, display: "grid", placeItems: "center", background: C.panel, color: category.color }}>{isImage ? <ImageIcon size={14} /> : <FileText size={14} />}</span>
                    <a href={file.url} target="_blank" rel="noreferrer" style={{ minWidth: 0, color: C.text, textDecoration: "none" }}><b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11.5 }}>{file.nombre}</b><small style={{ display: "block", color: C.dim, marginTop: 2 }}>{category.label}{fmtFileSize(file.size_bytes) ? ` · ${fmtFileSize(file.size_bytes)}` : ""}{file.autor?.username ? ` · ${file.autor.username}` : ""}</small></a>
                    {canRemove && <button disabled={saving} onClick={() => removeAttachment(file)} title="Eliminar archivo" style={{ width: 28, height: 28, borderRadius: 3, border: "1px solid transparent", background: "transparent", color: C.red, cursor: "pointer", display: "grid", placeItems: "center" }}><Trash2 size={13} /></button>}
                  </div>
                );
              })}
            </div>}
            <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 7 }}>
              <select value={attachmentCategory} onChange={(event) => setAttachmentCategory(event.target.value)} style={{ ...FIELD, height: 35 }}>{Object.entries(ARCHIVO_CATEGORIAS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select>
              <button disabled={uploading} onClick={() => fileInputRef.current?.click()} style={{ minHeight: 35, borderRadius: 3, border: `1px dashed ${uploading ? C.border : C.blueB}`, background: uploading ? C.panel : C.blueL, color: uploading ? C.dim : C.blue, cursor: uploading ? "default" : "pointer", fontWeight: 600 }}><Upload size={14} /> {uploading ? "Subiendo..." : "Adjuntar archivos"}</button>
              <input ref={fileInputRef} type="file" multiple onChange={uploadAttachments} style={{ display: "none" }} />
            </div>
          </section>

          {isManager && row.estado === "solicitado" && (
            <section style={{ display: "grid", gap: 7 }}>
              <button onClick={() => onCoordinate("confirm")} style={{ padding: 10, borderRadius: 3, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 600 }}><CheckCircle2 size={15} /> Confirmar fecha solicitada</button>
              <button onClick={() => onCoordinate("propose")} style={{ padding: 10, borderRadius: 3, border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, cursor: "pointer", fontWeight: 600 }}><Clock3 size={15} /> Proponer otra fecha</button>
            </section>
          )}

          {!!sharedRows.length && (
            <section style={{ padding: 13, borderRadius: 3, border: `1px solid ${C.greenB}`, background: C.greenL }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.green, fontSize: 12.5, fontWeight: 600 }}><Merge size={15} /> Transporte compartido confirmado</div>
              {row.union_decidido_at && <div style={{ color: C.dim, fontSize: 9.8, marginTop: 4 }}>Decidió {actorName(row.union_decidido_por_perfil)} · {new Date(row.union_decidido_at).toLocaleString("es-AR")}</div>}
              <div style={{ display: "grid", gap: 5, marginTop: 9 }}>{sharedRows.map((item) => <div key={item.id} style={{ padding: "7px 9px", borderRadius: 3, background: C.panel, border: `1px solid ${C.greenB}` }}><b style={{ display: "block", color: C.text, fontSize: 11.5 }}>{movementHeadline(item)}</b><small style={{ display: "block", color: C.dim, marginTop: 2 }}>{item.obra || "Sin obra"} · {routeLabel(item)}</small></div>)}</div>
            </section>
          )}

          {row.union_estado === "rechazada" && row.union_observacion && (
            <section style={{ padding: 12, borderRadius: 3, border: `1px solid ${C.border}`, background: C.panel }}>
              <div style={{ color: C.muted, fontSize: 11.5, fontWeight: 600 }}><Truck size={14} /> Transporte separado</div>
              <div style={{ color: C.dim, fontSize: 10.5, marginTop: 4 }}>{row.union_observacion}</div>
              {row.union_decidido_at && <div style={{ color: C.dim, fontSize: 9.5, marginTop: 5 }}>Decidió {actorName(row.union_decidido_por_perfil)} · {new Date(row.union_decidido_at).toLocaleString("es-AR")}</div>}
            </section>
          )}

          {isManager && candidates.length > 0 && !mergeCandidate && !["realizado", "cancelado"].includes(row.estado) && (
            <section style={{ padding: 13, borderRadius: 3, border: `1px solid ${C.violetB}`, background: `linear-gradient(135deg, ${C.violetL}, ${C.panel})` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}><span><b style={{ display: "block", color: C.violet, fontSize: 12.5 }}>Posible viaje compartido</b><small style={{ display: "block", color: C.dim, marginTop: 3 }}>Coinciden fecha y tipo de transporte. Revisá espacio y recorrido.</small></span><Merge size={17} color={C.violet} /></div>
              <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                {candidates.map((candidate) => (
                  <button key={candidate.id} disabled={saving} onClick={() => { setMergeCandidate(candidate); setMergeNote(""); }} style={{ padding: "10px 11px", borderRadius: 3, border: `1px solid ${C.violetB}`, background: C.panelSolid, color: C.text, cursor: "pointer", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 10, textAlign: "left" }}><span style={{ minWidth: 0 }}><b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11.8 }}>{movementHeadline(candidate)}</b><small style={{ display: "block", color: C.dim, marginTop: 4 }}>{fmtDate(displayDate(candidate), true)} · {candidate.obra || "Sin obra"} · {routeLabel(candidate)}</small></span><span style={{ color: C.violet, fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap" }}>Comparar <ChevronRight size={12} /></span></button>
                ))}
              </div>
            </section>
          )}

          {isManager && mergeCandidate && (
            <section className="log-enter" style={{ padding: 14, borderRadius: 3, border: `1px solid ${C.violetB}`, background: C.violetL }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}><span><b style={{ display: "block", color: C.violet, fontSize: 13 }}>Evaluar unión de transportes</b><small style={{ display: "block", color: C.muted, marginTop: 3 }}>Compras confirma si ambas cargas entran y el recorrido es compatible.</small></span><button onClick={() => setMergeCandidate(null)} style={{ width: 28, height: 28, borderRadius: 3, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, cursor: "pointer" }}><X size={13} /></button></div>
              <div style={{ display: "grid", gap: 7, marginTop: 11 }}>
                {[row, mergeCandidate].map((item, index) => <div key={item.id} style={{ padding: 11, borderRadius: 3, border: `1px solid ${index === 0 ? C.blueB : C.violetB}`, background: C.panelSolid }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><span style={{ color: index === 0 ? C.blue : C.violet, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em" }}>{index === 0 ? "Movimiento actual" : "Movimiento a combinar"}</span><span style={{ color: C.dim, fontFamily: C.mono, fontSize: 9.5 }}>{fmtDate(displayDate(item))} · {displayTime(item) || "Sin hora"}</span></div><b style={{ display: "block", color: C.text, fontSize: 12.5, marginTop: 6 }}>{movementHeadline(item)}</b><div style={{ display: "grid", gap: 3, color: C.dim, fontSize: 10.5, marginTop: 6 }}><span><b style={{ color: C.muted }}>Obra:</b> {item.obra || "Sin obra"}</span><span><b style={{ color: C.muted }}>Recorrido:</b> {routeLabel(item)}</span><span><b style={{ color: C.muted }}>Proveedor:</b> {providerSummary(item)}</span></div></div>)}
              </div>
              <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 3, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, fontSize: 10.5 }}><AlertTriangle size={13} color={C.violet} /> El sistema detecta la coincidencia; Compras debe validar capacidad física y horarios.</div>
              <textarea value={mergeNote} onChange={(event) => setMergeNote(event.target.value)} placeholder="Observación" style={{ ...FIELD, minHeight: 62, marginTop: 9, resize: "vertical" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 9 }}>
                <button disabled={saving} onClick={() => decideMerge(false)} style={{ padding: 10, borderRadius: 3, border: `1px solid ${C.border2}`, background: C.panel, color: C.muted, cursor: "pointer", fontWeight: 600 }}><Truck size={14} /> Pedir otro flete</button>
                <button disabled={saving} onClick={() => decideMerge(true)} style={{ padding: 10, borderRadius: 3, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 600 }}><Merge size={14} /> Aceptar unión</button>
              </div>
            </section>
          )}

          {isManager && (
            <section style={{ padding: 13, borderRadius: 3, background: C.panel, border: `1px solid ${C.border}` }}>
              <span style={LABEL}>Costo del movimiento</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 82px", gap: 7 }}><input type="number" min="0" step="0.01" style={FIELD} value={cost} onChange={(event) => setCost(event.target.value)} placeholder="Importe" /><select style={FIELD} value={currency} onChange={(event) => setCurrency(event.target.value)}><option>ARS</option><option>USD</option></select></div>
              <input style={{ ...FIELD, marginTop: 7 }} value={costDetail} onChange={(event) => setCostDetail(event.target.value)} placeholder="Detalle" />
              <button disabled={saving} onClick={() => action(() => guardarCostoMovimiento(row, { costo: cost, moneda: currency, detalle: costDetail }, profile), "Costo guardado.")} style={{ width: "100%", marginTop: 7, padding: 8, borderRadius: 3, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, cursor: "pointer", fontWeight: 600 }}><Banknote size={14} /> Guardar costo</button>
              {row.costo_updated_by && <div style={{ color: C.dim, fontSize: 10, marginTop: 7 }}>Última carga: {actorName(row.costo_por)}</div>}
            </section>
          )}

          <section style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {own && row.estado === "solicitado" && <button onClick={onEdit} style={{ padding: "8px 10px", borderRadius: 3, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: "pointer", fontWeight: 600 }}>Editar solicitud</button>}
            {isManager && row.estado === "confirmado" && <button disabled={saving} onClick={() => action(() => actualizarEstadoMovimiento(row, "realizado", profile), "Movimiento marcado como realizado.")} style={{ padding: "8px 10px", borderRadius: 3, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 600 }}>Marcar realizado</button>}
            {isManager && !["realizado", "cancelado"].includes(row.estado) && <button disabled={saving} onClick={() => action(() => actualizarEstadoMovimiento(row, "cancelado", profile), "Movimiento cancelado.")} style={{ padding: "8px 10px", borderRadius: 3, border: `1px solid ${C.redB}`, background: "transparent", color: C.red, cursor: "pointer", fontWeight: 600 }}>Cancelar movimiento</button>}
          </section>

          {isManager && (
            <section style={{ paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              {!deleteConfirm ? (
                <button disabled={saving} onClick={() => setDeleteConfirm(true)} style={{ padding: "8px 10px", borderRadius: 3, border: "1px solid transparent", background: "transparent", color: C.red, cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}><Trash2 size={14} /> Eliminar movimiento</button>
              ) : (
                <div style={{ padding: 12, borderRadius: 3, border: `1px solid ${C.redB}`, background: C.redL }}>
                  <div style={{ color: C.red, fontSize: 12.5, fontWeight: 600 }}>¿Eliminar definitivamente “{row.carga || row.titulo}”?</div>
                  <div style={{ marginTop: 4, color: C.muted, fontSize: 11 }}>Se eliminarán este movimiento y su historial. Esta acción no se puede deshacer.</div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 7, marginTop: 11 }}>
                    <button disabled={saving} onClick={() => setDeleteConfirm(false)} style={{ padding: "8px 11px", borderRadius: 3, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: "pointer", fontWeight: 600 }}>Conservar</button>
                    <button disabled={saving} onClick={removeMovement} style={{ padding: "8px 11px", borderRadius: 3, border: `1px solid ${C.redB}`, background: C.red, color: "white", cursor: saving ? "default" : "pointer", opacity: saving ? .55 : 1, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}><Trash2 size={14} /> {saving ? "Eliminando..." : "Sí, eliminar"}</button>
                  </div>
                </div>
              )}
            </section>
          )}

          <section>
            <button onClick={() => setHistoryOpen((value) => !value)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", border: 0, borderTop: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", fontWeight: 600 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><History size={14} /> Historial completo</span><span>{historyOpen ? "Ocultar" : `${history.length} cambios`}</span></button>
            {historyOpen && <div style={{ display: "grid", gap: 8, paddingTop: 5 }}>{history.map((item) => <div key={item.id} style={{ paddingLeft: 12, borderLeft: `2px solid ${statusUi(item.estado_nuevo).border}` }}><div style={{ color: C.text, fontSize: 11.5, fontWeight: 600 }}>{String(item.accion || "Cambio").replaceAll("_", " ")}</div><div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>{actorName(item.actor)} · {new Date(item.created_at).toLocaleString("es-AR")}</div></div>)}</div>}
          </section>
        </div>
      </aside>
    </div>
  );
}

function RainVeil({ probability = 0 }) {
  const drops = Number(probability) >= 70 ? 9 : 6;
  return (
    <span className="log-rain" aria-hidden="true">
      {Array.from({ length: drops }, (_, index) => (
        <i key={index} style={{ left: `${6 + ((index * 23) % 90)}%`, animationDelay: `-${(index * .31).toFixed(2)}s`, animationDuration: `${1.3 + (index % 3) * .25}s` }} />
      ))}
    </span>
  );
}

function DayWeather({ day }) {
  if (!day) return null;
  const raining = Number(day.rain) >= 40;
  const windy = Number(day.wind) >= 30;
  return (
    <span className={`log-wx${windy ? " is-wind" : raining ? " is-rain" : ""}`} title={`${weatherLabel(day.code)} · lluvia ${day.rain ?? 0}% · viento ${Math.round(day.wind)} km/h`}>
      {windy ? <Wind size={11} /> : raining ? <CloudRain size={11} /> : <CloudSun size={11} />}{Math.round(day.max)}°
    </span>
  );
}

function CalendarNav({ title, year, summary, todayLabel, onToday, onPrev, onNext, prevLabel, nextLabel }) {
  return (
    <div className="log-cal-head">
      <div style={{ minWidth: 0 }}>
        <h2 className="log-cal-title">{title}{year && <small>{year}</small>}</h2>
        {summary && <div className="az-rotulo" style={{ marginTop: 10 }}>{summary}</div>}
      </div>
      <div className="log-cal-nav">
        <button type="button" className="log-btn" onClick={onToday}>{todayLabel}</button>
        <button type="button" className="log-btn is-icon" aria-label={prevLabel} title={prevLabel} onClick={onPrev}><ChevronLeft size={16} /></button>
        <button type="button" className="log-btn is-icon" aria-label={nextLabel} title={nextLabel} onClick={onNext}><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

function summaryText(movements, legacy, holidays) {
  return [
    `${movements} movimiento${movements === 1 ? "" : "s"}`,
    legacy ? `${legacy} anterior${legacy === 1 ? "" : "es"}` : "",
    holidays ? `${holidays} feriado${holidays === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");
}

// Un clic en el espacio libre del día abre el pedido con esa fecha. Los
// movimientos y el botón de agregar paran el clic para no abrir dos cosas.
function dayClickProps(date, canCreate, onCreate) {
  if (!canCreate) return {};
  return {
    onClick: (event) => {
      if (event.target.closest("button, a")) return;
      onCreate(date);
    },
  };
}

function MonthView({ month, direction = 0, rows, milestones, weather, holidays, mergeableIds, onOpen, onMonth, onWeekOf, canCreateOn, createLabel, onCreate }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const weeks = Math.ceil((leading + daysInMonth) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, index) => {
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
  byDate.forEach((items) => items.sort((a, b) => displayTime(a).localeCompare(displayTime(b))));
  const milestoneMap = new Map();
  milestones.filter((row) => row.tipo !== "feriado").forEach((row) => {
    if (!milestoneMap.has(row.fecha)) milestoneMap.set(row.fecha, []);
    milestoneMap.get(row.fecha).push(row);
  });
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const visibleMovements = rows.filter((row) => displayDate(row)?.startsWith(monthKey)).length;
  const visibleMilestones = milestones.filter((row) => row.tipo !== "feriado" && row.fecha?.startsWith(monthKey)).length;
  const visibleHolidays = [...holidays.keys()].filter((date) => date.startsWith(monthKey)).length;

  return (
    <section className="log-view-enter">
      <CalendarNav
        title={MESES[monthIndex]}
        year={year}
        summary={summaryText(visibleMovements, visibleMilestones, visibleHolidays)}
        todayLabel="Hoy"
        onToday={() => onMonth(parseDate(TODAY))}
        onPrev={() => onMonth(new Date(year, monthIndex - 1, 1))}
        onNext={() => onMonth(new Date(year, monthIndex + 1, 1))}
        prevLabel="Mes anterior"
        nextLabel="Mes siguiente"
      />
      <div className="log-scroll-x">
        <div key={monthKey} className={`log-grid log-month log-slide${direction > 0 ? " from-right" : direction < 0 ? " from-left" : ""}`}>
          {DIAS.map((day, index) => <div key={day} className={`log-wd${index > 4 ? " is-weekend" : ""}`}>{day}</div>)}
          {cells.map((date, index) => {
            if (!date) return <div key={index} className={`log-day is-out${index % 7 > 4 ? " is-weekend" : ""}`} style={{ "--i": index }} />;
            const events = byDate.get(date) || [];
            const marks = milestoneMap.get(date) || [];
            const dayWeather = weather[date];
            const holiday = holidays.get(date);
            const weekend = index % 7 > 4;
            const canCreate = canCreateOn(date);
            const eventLimit = holiday ? 2 : 3;
            const visibleMarks = Math.max(0, eventLimit - events.length);
            const hidden = Math.max(0, events.length - eventLimit) + Math.max(0, marks.length - visibleMarks);
            return (
              <div
                key={date}
                className={`log-day${date === TODAY ? " is-today" : ""}${date < TODAY ? " is-past" : ""}${weekend ? " is-weekend" : ""}${holiday ? " is-holiday" : ""}${canCreate ? " can-add" : ""}`}
                title={holiday || undefined}
                style={{ "--i": index }}
                {...dayClickProps(date, canCreate, onCreate)}
              >
                {Number(dayWeather?.rain) >= 40 && <RainVeil probability={dayWeather.rain} />}
                <div className="log-day-top">
                  <span className="log-num">{parseDate(date).getDate()}</span>
                  <DayWeather day={dayWeather} />
                </div>
                {holiday && <div className="log-hol" title={holiday}>Feriado · {holiday}</div>}
                {events.slice(0, eventLimit).map((row, eventIndex) => {
                  const state = statusUi(row.estado);
                  const ui = transportUi(transportsOf(row)[0]?.tipo);
                  const risky = hasCrane(row) && Number(dayWeather?.wind) >= 30;
                  const canMerge = mergeableIds?.has(row.id);
                  return (
                    <button
                      type="button"
                      key={row.id}
                      className={`log-ev${risky ? " is-risk" : ""}${row.estado === "cancelado" ? " is-cancel" : ""}`}
                      style={{ "--tc": risky ? C.red : ui.color, "--ts": risky ? C.redL : ui.soft, "--st": state.color, "--d": `${Math.min(index * 14 + eventIndex * 40, 520) + 120}ms` }}
                      onClick={() => onOpen(row)}
                      title={`${movementHeadline(row)} · ${workLabel(row)} · ${routeLabel(row)} · ${state.label}${canMerge ? " · Posible unión" : ""}${risky ? " · Revisar viento" : ""}`}
                    >
                      <span className="log-ev-time"><i className="log-ev-dot" />{displayTime(row) || "—"}</span>
                      <span className="log-ev-title">{row.carga || row.titulo || "Movimiento"}</span>
                      <span className="log-ev-meta">
                        <b>{workLabel(row)}</b>
                        <span>{transportSummary(row)}</span>
                        {canMerge && <Merge size={10} color={C.violet} style={{ flexShrink: 0 }} />}
                      </span>
                    </button>
                  );
                })}
                {marks.slice(0, visibleMarks).map((mark) => <div className="log-old" key={mark.id} title={mark.notas || "Registro del calendario anterior"}>{cleanTime(mark.hora) ? `${cleanTime(mark.hora)} · ` : ""}{mark.titulo}{mark.obra ? ` · ${mark.obra}` : ""}</div>)}
                {hidden > 0 && <button type="button" className="log-more" onClick={() => onWeekOf(date)}>+{hidden} más</button>}
                {canCreate && <button type="button" className="log-add" onClick={() => onCreate(date)} aria-label={`${createLabel} para el ${fechaTitulo(date).toLowerCase()}`}><Plus size={12} /> {createLabel}</button>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WeekView({ weekStart, direction = 0, rows, milestones, weather, holidays, mergeableIds, onOpen, onWeek, canCreateOn, createLabel, onCreate }) {
  const dates = Array.from({ length: 7 }, (_, index) => dateAdd(weekStart, index));
  const weekEnd = dates[6];
  const byDate = new Map(dates.map((date) => [date, []]));
  rows.forEach((row) => {
    const date = displayDate(row);
    if (byDate.has(date)) byDate.get(date).push(row);
  });
  byDate.forEach((items) => items.sort((a, b) => displayTime(a).localeCompare(displayTime(b))));
  const legacyByDate = new Map(dates.map((date) => [date, []]));
  milestones.filter((row) => row.tipo !== "feriado").forEach((row) => {
    if (legacyByDate.has(row.fecha)) legacyByDate.get(row.fecha).push(row);
  });
  const total = [...byDate.values()].reduce((sum, items) => sum + items.length, 0);
  const legacyTotal = [...legacyByDate.values()].reduce((sum, items) => sum + items.length, 0);
  const holidayTotal = dates.filter((date) => holidays.has(date)).length;
  const startDate = parseDate(weekStart);
  const endDate = parseDate(weekEnd);
  const sameMonth = startDate.getMonth() === endDate.getMonth();
  const title = sameMonth
    ? `${startDate.getDate()} – ${endDate.getDate()} ${MESES[endDate.getMonth()]}`
    : `${startDate.getDate()} ${MESES[startDate.getMonth()].slice(0, 3)} – ${endDate.getDate()} ${MESES[endDate.getMonth()].slice(0, 3)}`;

  return (
    <section className="log-view-enter">
      <CalendarNav
        title={title}
        year={endDate.getFullYear()}
        summary={summaryText(total, legacyTotal, holidayTotal)}
        todayLabel="Esta semana"
        onToday={() => onWeek(startOfWeek(TODAY))}
        onPrev={() => onWeek(dateAdd(weekStart, -7))}
        onNext={() => onWeek(dateAdd(weekStart, 7))}
        prevLabel="Semana anterior"
        nextLabel="Semana siguiente"
      />
      <div className="log-scroll-x">
        <div key={weekStart} className={`log-grid log-week log-slide${direction > 0 ? " from-right" : direction < 0 ? " from-left" : ""}`}>
          {dates.map((date, index) => {
            const events = byDate.get(date) || [];
            const oldEvents = legacyByDate.get(date) || [];
            const dayWeather = weather[date];
            const holiday = holidays.get(date);
            const weekend = index > 4;
            const canCreate = canCreateOn(date);
            const day = parseDate(date);
            return (
              <section
                key={date}
                className={`log-day log-wcol${date === TODAY ? " is-today" : ""}${date < TODAY ? " is-past" : ""}${weekend ? " is-weekend" : ""}${holiday ? " is-holiday" : ""}${canCreate ? " can-add" : ""}`}
                style={{ "--i": index * 3 }}
                {...dayClickProps(date, canCreate, onCreate)}
              >
                {Number(dayWeather?.rain) >= 40 && <RainVeil probability={dayWeather.rain} />}
                <header className="log-wcol-head">
                  <span>
                    <span className="log-wcol-wd">{DIAS[index]}</span>
                    <span className="log-wcol-num">{day.getDate()}</span>
                  </span>
                  <DayWeather day={dayWeather} />
                </header>
                {holiday && <div className="log-hol" title={holiday}>Feriado · {holiday}</div>}
                {events.map((row, eventIndex) => {
                  const ui = transportUi(transportsOf(row)[0]?.tipo);
                  const state = statusUi(row.estado);
                  const risky = hasCrane(row) && Number(dayWeather?.wind) >= 30;
                  const canMerge = mergeableIds?.has(row.id);
                  return (
                    <button
                      type="button"
                      key={row.id}
                      className={`log-ev is-tall${risky ? " is-risk" : ""}${row.estado === "cancelado" ? " is-cancel" : ""}`}
                      style={{ "--tc": risky ? C.red : ui.color, "--ts": risky ? C.redL : ui.soft, "--st": state.color, "--d": `${120 + index * 45 + eventIndex * 60}ms` }}
                      onClick={() => onOpen(row)}
                      title={`${movementHeadline(row)} · ${workLabel(row)} · ${routeLabel(row)}${risky ? " · Revisar viento" : ""}`}
                    >
                      <span className="log-ev-time">{displayTime(row) || "—"}</span>
                      <span className="log-ev-state" style={{ color: state.color }}><i className="log-ev-dot" />{state.short}</span>
                      <span className="log-ev-title">{row.carga || row.titulo || "Movimiento"}</span>
                      <span className="log-ev-meta"><b>{workLabel(row)}</b>{canMerge && <Merge size={10} color={C.violet} style={{ flexShrink: 0 }} />}</span>
                      <span className="log-ev-meta" style={{ color: ui.color }}><TransportIcon type={transportsOf(row)[0]?.tipo} size={11} /><span>{transportSummary(row)}</span></span>
                      <span className="log-ev-meta"><Route size={11} /><span>{routeLabel(row)}</span></span>
                    </button>
                  );
                })}
                {oldEvents.map((row) => <div key={row.id} className="log-old" title={row.notas || "Registro del calendario anterior"}>{row.titulo}{row.obra ? ` · ${row.obra}` : ""}</div>)}
                {!events.length && !oldEvents.length && !canCreate && <div className="log-wcol-empty">Sin movimientos</div>}
                {canCreate && <button type="button" className="log-add" onClick={() => onCreate(date)} aria-label={`${createLabel} para el ${fechaTitulo(date).toLowerCase()}`}><Plus size={12} /> {createLabel}</button>}
              </section>
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
        <section style={{ borderRadius: 13, background: C.panelSolid, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 12.5, fontWeight: 700 }}>Detalle mensual</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  {["Fecha", "Movimiento", "Para qué / obra", "Proveedor", "Solicitado por", "Costo"].map((head) => (
                    <th key={head} style={{ padding: "9px 11px", textAlign: "left", color: C.dim, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".08em", borderBottom: `1px solid ${C.border}` }}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthRows.map((row) => {
                  // Un costo sin destino no se puede imputar. Si el flete tiene
                  // obra asignada se muestra esa; si no, la anotación, que es
                  // donde queda escrito para qué se usó. Cuando no hay ninguna
                  // de las dos, se dice — es un dato a completar, no un vacío.
                  const obra = String(row.obra || "").trim();
                  const nota = String(row.notas || row.costo_detalle || "").trim();
                  return (
                    <tr key={row.id}>
                      <td style={{ padding: 11, color: C.dim, fontFamily: C.mono, fontSize: 10.5, borderBottom: `1px solid ${C.border}` }}>{fmtDate(displayDate(row))}</td>
                      <td style={{ padding: 11, color: C.text, fontSize: 11.5, fontWeight: 650, borderBottom: `1px solid ${C.border}` }}>{row.carga}</td>
                      <td style={{ padding: 11, borderBottom: `1px solid ${C.border}`, maxWidth: 220 }}>
                        {obra ? (
                          <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}>{obra}</span>
                        ) : nota ? (
                          <span title={nota} style={{ display: "block", color: C.muted, fontSize: 11, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nota}</span>
                        ) : (
                          <span style={{ color: C.dim, fontSize: 10.5, fontStyle: "italic" }}>Sin asignar</span>
                        )}
                      </td>
                      <td style={{ padding: 11, color: C.muted, fontSize: 11, borderBottom: `1px solid ${C.border}` }}>{providerSummary(row)}</td>
                      <td style={{ padding: 11, color: C.muted, fontSize: 11, borderBottom: `1px solid ${C.border}` }}>{actorName(row.solicitante)}</td>
                      <td style={{ padding: 11, color: C.green, fontFamily: C.mono, fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>{fmtMoney(row.costo, row.moneda)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
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

// La lluvia de los días se mueve mientras alguien usa la PC; después de un rato
// quieto se pausa, porque la pantalla queda abierta todo el día.
function useInactivo(ms) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), ms);
    const wake = () => {
      window.clearTimeout(timer);
      setIdle(false);
      timer = window.setTimeout(() => setIdle(true), ms);
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((name) => window.addEventListener(name, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, wake));
    };
  }, [ms]);
  return idle;
}

export default function LogisticaCalendarioScreen({ profile }) {
  const { isMobile } = useResponsive(920);
  const role = profile?.is_admin ? "admin" : profile?.role;
  const isManager = role === "admin" || role === "compras";
  const canRequest = role === "admin" || role === "tecnica" || role === "administracion";
  const [rows, setRows] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [weather, setWeather] = useState({});
  const [officialHolidays, setOfficialHolidays] = useState(() => new Map());
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
  const [weekStartDate, setWeekStartDate] = useState(() => startOfWeek(TODAY));
  const [monthDir, setMonthDir] = useState(0);
  const [weekDir, setWeekDir] = useState(0);
  const idle = useInactivo(20000);
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
      if (obraFilter !== "todos" && !rowMatchesObra(row, obraFilter)) return false;
      if (providerFilter !== "todos" && !transportsOf(row).some((item) => item.proveedor === providerFilter) && row.proveedor_logistico !== providerFilter) return false;
      if (!term) return true;
      const haystack = [row.carga, row.titulo, row.obra, transportSummary(row, true), row.notas, actorName(row.solicitante), routeLabel(row)].join(" ").toLowerCase();
      return term.split(/\s+/).every((word) => haystack.includes(word));
    });
  }, [dateFrom, dateTo, obraFilter, providerFilter, query, rows, status, transport]);

  const filterOptions = useMemo(() => ({
    obras: [...new Set(rows.flatMap((row) => splitObrasValue(row.obra)))].sort((a, b) => a.localeCompare(b, "es")),
    providers: [...new Set(rows.flatMap((row) => transportsOf(row).map((item) => item.proveedor)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
  }), [rows]);
  const advancedFilterCount = [dateFrom, dateTo, obraFilter !== "todos", providerFilter !== "todos"].filter(Boolean).length;
  const hasAnyFilters = !!query || status !== "todos" || transport !== "todos" || advancedFilterCount > 0;
  const holidays = useMemo(() => {
    const combined = new Map(officialHolidays);
    milestones
      .filter((row) => row.tipo === "feriado" && row.fecha)
      .forEach((row) => combined.set(row.fecha, row.titulo || "Feriado"));
    return combined;
  }, [milestones, officialHolidays]);

  const agendaFrom = dateFrom || TODAY;
  const agendaRows = useMemo(() => filtered
    .filter((row) => row.estado !== "cancelado" && displayDate(row) >= agendaFrom)
    .sort((a, b) => `${displayDate(a)}${displayTime(a)}`.localeCompare(`${displayDate(b)}${displayTime(b)}`)), [agendaFrom, filtered]);
  const lastAgendaDate = agendaRows.length ? displayDate(agendaRows.at(-1)) : agendaFrom;
  const agendaHolidayEnd = dateTo || `${lastAgendaDate.slice(0, 4)}-12-31`;
  const firstHolidayYear = view === "semana" ? Number(weekStartDate.slice(0, 4))
    : view === "agenda" ? Number(agendaFrom.slice(0, 4)) : month.getFullYear();
  const lastHolidayYear = view === "semana" ? Number(dateAdd(weekStartDate, 6).slice(0, 4))
    : view === "agenda" ? Number(agendaHolidayEnd.slice(0, 4)) : firstHolidayYear;

  useEffect(() => {
    if (view !== "agenda" && view !== "semana" && view !== "calendario") return;
    let alive = true;
    const firstYear = Math.max(2016, firstHolidayYear);
    if (lastHolidayYear - firstYear > 100) return;
    for (let year = firstYear; year <= lastHolidayYear; year += 1) {
      // Cada año se carga por su cuenta para las semanas que cruzan Año Nuevo.
      cargarFeriadosAnio(year).then((list) => {
        if (!alive) return;
        setOfficialHolidays((current) => {
          const next = new Map(current);
          for (const day of list) {
            if (day.tipo === "feriado") next.set(day.fecha, day.nombre);
          }
          return next;
        });
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [firstHolidayYear, lastHolidayYear, view]);

  const groups = useMemo(() => {
    const acc = {};
    agendaRows.forEach((row) => {
      const key = displayDate(row);
      (acc[key] ||= { movements: [], legacy: [] }).movements.push(row);
    });
    if (status === "todos" && transport === "todos" && obraFilter === "todos" && providerFilter === "todos") {
      const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      milestones.filter((row) => row.tipo !== "feriado" && row.fecha >= agendaFrom && (!dateTo || row.fecha <= dateTo)).forEach((row) => {
        const haystack = [row.titulo, row.obra, row.notas, row.tipo].join(" ").toLowerCase();
        if (words.length && !words.every((word) => haystack.includes(word))) return;
        (acc[row.fecha] ||= { movements: [], legacy: [] }).legacy.push(row);
      });
      for (const [date, holiday] of holidays) {
        if (date < agendaFrom || date > agendaHolidayEnd) continue;
        const label = `feriado ${holiday.toLowerCase()}`;
        if (words.every((word) => label.includes(word))) acc[date] ||= { movements: [], legacy: [] };
      }
    }
    return acc;
  }, [agendaFrom, agendaHolidayEnd, agendaRows, dateTo, holidays, milestones, obraFilter, providerFilter, query, status, transport]);
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
  const transportCounts = rows.reduce((acc, row) => {
    if (row.estado === "cancelado") return acc;
    new Set(transportsOf(row).map((item) => item.tipo)).forEach((tipo) => { acc[tipo] = (acc[tipo] || 0) + 1; });
    return acc;
  }, {});

  function goMonth(next) {
    setMonthDir(Math.sign(next.getFullYear() * 12 + next.getMonth() - (month.getFullYear() * 12 + month.getMonth())));
    setMonth(next);
  }

  function goWeek(next) {
    setWeekDir(Math.sign(next.localeCompare(weekStartDate)));
    setWeekStartDate(next);
  }
  const createLabel = canRequest ? "Solicitar" : "Agregar";
  const canCreateOn = (date) => canRequest ? date >= TODAY : isManager;

  function createOn(date) {
    if (canRequest) setRequestModal({ row: null, date });
    else if (isManager) setManualModal({ date });
  }


  return (
    <div className={`logistics-root${idle ? " is-quieto" : ""}`} style={{ position: "absolute", inset: 0, display: "flex", background: C.bg, color: C.text, fontFamily: C.sans, overflow: "hidden" }}>
      <style>{LOG_CSS}</style>
      <main className="log-main">
        <header className="log-bar">
          <h1 className="log-bar-title"><span className="log-grad">Logística</span></h1>
          <nav className="log-tabs" aria-label="Vistas">
            {availableViews.map(({ id, label }) => <button type="button" key={id} className={`az-tab${view === id ? " is-active" : ""}`} aria-selected={view === id} onClick={() => setView(id)}>{label}</button>)}
          </nav>
          <div className="log-actions">
            {(role === "admin" || role === "tecnica") && <button type="button" className="log-btn is-icon log-hide-sm" aria-label="Calendario de producción anterior" onClick={() => window.location.assign("/calendario-produccion")} title="Abrir el calendario de producción anterior"><CalendarDays size={15} /></button>}
            {isManager && <button type="button" className={`log-btn${canRequest ? "" : " is-primary"}`} onClick={() => setManualModal({ date: "" })} title="Agregar un movimiento coordinado por Compras"><Bike size={15} /><span className="log-label">Movimiento manual</span></button>}
            {isManager && (
              <div style={{ position: "relative" }}>
                <button type="button" className="log-btn" onClick={() => setExportOpen((open) => !open)} title="Exportar informe"><Download size={15} /><span className="log-label">Exportar</span></button>
                {exportOpen && (
                  <div className="log-menu">
                    <button type="button" onClick={() => { exportMovementsCsv(filtered, "filtrado"); setExportOpen(false); }}><Download size={14} /> Exportar filtrado <b>{filtered.length}</b></button>
                    <button type="button" onClick={() => { exportMovementsCsv(rows, "completo"); setExportOpen(false); }}><Download size={14} /> Exportar todo <b>{rows.length}</b></button>
                    <small>CSV para Excel con fechas, proveedores, decisiones de unión y costos.</small>
                  </div>
                )}
              </div>
            )}
            <button type="button" className="log-btn is-icon log-hide-xs" onClick={load} title="Actualizar" aria-label="Actualizar"><RefreshCw className={loading ? "spin" : ""} size={15} /></button>
            {canRequest && <button type="button" className="log-btn is-primary" onClick={() => setRequestModal({ row: null, date: "" })}><Plus size={16} /><span className="log-label">Solicitar movimiento</span><span className="log-label-short">Solicitar</span></button>}
          </div>
        </header>
        <div className="log-workspace">
          <section className="log-filters">
            <label className="az-buscar log-buscar"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" aria-label="Buscar carga, obra, proveedor, recorrido o solicitante" /></label>
            <div className="log-chips" role="group" aria-label="Transporte">
              {Object.entries(TRANSPORTES).map(([key, item]) => {
                const active = transport === key;
                const count = transportCounts[key] || 0;
                if (!count && !active) return null;
                return (
                  <button type="button" key={key} className={`log-chip${active ? " is-active" : ""}`} style={{ "--tc": item.color, "--ts": item.soft, "--tb": item.border }} aria-pressed={active} onClick={() => setTransport(active ? "todos" : key)}>
                    <TransportIcon type={key} size={13} />{item.label}<b>{count}</b>
                  </button>
                );
              })}
            </div>
            <select className="log-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Estado"><option value="todos">Todos los estados</option>{Object.entries(ESTADOS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select>
            <button type="button" className={`log-btn is-ghost${showAdvancedFilters || advancedFilterCount ? " is-on" : ""}`} onClick={() => setShowAdvancedFilters((open) => !open)}><SlidersHorizontal size={14} /> Más filtros{advancedFilterCount ? ` · ${advancedFilterCount}` : ""}</button>
            {hasAnyFilters && <button type="button" className="log-btn is-ghost is-danger" onClick={clearFilters}>Limpiar</button>}
            {showAdvancedFilters && (
              <div className="log-filter-advanced log-enter">
                <div><label style={LABEL}>Desde</label><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={FIELD} /></div>
                <div><label style={LABEL}>Hasta</label><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} style={FIELD} /></div>
                <div><label style={LABEL}>Obra / sector</label><select value={obraFilter} onChange={(event) => setObraFilter(event.target.value)} style={FIELD}><option value="todos">Todas</option>{filterOptions.obras.map((obra) => <option key={obra} value={obra}>{obra}</option>)}</select></div>
                <div><label style={LABEL}>Proveedor</label><select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} style={FIELD}><option value="todos">Todos</option>{filterOptions.providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></div>
                <div className="az-rotulo" style={{ alignSelf: "center" }}>{filtered.length} resultados</div>
              </div>
            )}
          </section>

          {error && <div className="log-error"><b>No se pudo abrir el calendario.</b><div style={{ marginTop: 4 }}>{error}</div></div>}

          {loading && !rows.length ? <Cargando texto="Trayendo movimientos…" /> : view === "calendario" ? (
            <MonthView month={month} rows={filtered} milestones={milestones} weather={weather} holidays={holidays} mergeableIds={mergeableIds} onOpen={setSelected} direction={monthDir} onMonth={goMonth} onWeekOf={(date) => { setWeekDir(0); setWeekStartDate(startOfWeek(date)); setView("semana"); }} canCreateOn={canCreateOn} createLabel={createLabel} onCreate={createOn} />
          ) : view === "semana" ? (
            <WeekView weekStart={weekStartDate} rows={filtered} milestones={milestones} weather={weather} holidays={holidays} mergeableIds={mergeableIds} onOpen={setSelected} direction={weekDir} onWeek={goWeek} canCreateOn={canCreateOn} createLabel={createLabel} onCreate={createOn} />
          ) : view === "costos" ? (
            <CostsView rows={filtered} />
          ) : view === "solicitudes" ? (
            <div className="log-view-enter log-list">
              {[...filtered].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map((row, index) => <MovementCard key={row.id} row={row} onOpen={setSelected} compact={isMobile} index={index} mergeHint={mergeableIds.has(row.id)} />)}
              {!filtered.length && <div className="log-empty">No hay solicitudes con estos filtros.</div>}
            </div>
          ) : (
            <div className="log-view-enter log-agenda">
              {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateRows], groupIndex) => {
                const holiday = holidays.get(date);
                const count = dateRows.movements.length + dateRows.legacy.length;
                return (
                  <section className="log-day-group" key={date} style={{ animationDelay: `${Math.min(groupIndex, 8) * 40}ms` }}>
                    <div className="log-day-group-head">
                      <span className={`log-day-group-date${date === TODAY ? " is-today" : ""}`}>{date === TODAY ? "Hoy" : fechaTitulo(date)}</span>
                      {holiday && <span className="log-hol" title={holiday}>Feriado · {holiday}</span>}
                      <span className="log-day-group-line" />
                      {count > 0 && <span className="az-rotulo">{count}</span>}
                      {canCreateOn(date) && <button type="button" className="log-btn is-ghost is-sm" onClick={() => createOn(date)}><Plus size={13} /> {createLabel}</button>}
                    </div>
                    <div className="log-list">
                      {dateRows.movements.map((row, index) => <MovementCard key={row.id} row={row} onOpen={setSelected} compact={isMobile} index={index} mergeHint={mergeableIds.has(row.id)} />)}
                      {dateRows.legacy.map((row) => <LegacyEventCard key={`legacy-${row.id}`} row={row} compact={isMobile} />)}
                    </div>
                  </section>
                );
              })}
              {!Object.keys(groups).length && <div className="log-empty"><Truck size={24} /><div>No hay movimientos próximos</div></div>}
            </div>
          )}
        </div>
      </main>

      {requestModal && <RequestModal row={requestModal.row} initialDate={requestModal.date || ""} rows={rows} obras={obras} profile={profile} onClose={() => setRequestModal(null)} onSaved={closeAndReload} />}
      {manualModal && <ManualMovementModal obras={obras} profile={profile} initialDate={manualModal.date || ""} onClose={() => setManualModal(false)} onSaved={closeAndReload} />}
      {selected && <DetailPanel row={selected} rows={rows} profile={profile} isManager={isManager} onClose={() => setSelected(null)} onReload={load} onEdit={() => { setRequestModal({ row: selected }); setSelected(null); }} onCoordinate={(mode) => setCoordination({ row: selected, mode })} />}
      {coordination && <CoordinationModal row={coordination.row} mode={coordination.mode} profile={profile} onClose={() => setCoordination(null)} onSaved={closeAndReload} />}
    </div>
  );
}

const LOG_CSS = `
@keyframes logFadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes logSlideIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
@keyframes logModalIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes logBackdrop{from{opacity:0}to{opacity:1}}
@keyframes logSpin{to{transform:rotate(360deg)}}
.logistics-root{--log-ease:cubic-bezier(.22,1,.36,1)}
.logistics-root .log-main{flex:1;min-width:0;height:100%;overflow-y:auto;padding:0 32px 48px}
.logistics-root .log-workspace{width:min(1480px,100%);margin:0 auto;display:grid;gap:22px}
.logistics-root .log-view-enter,.logistics-root .log-enter,.logistics-root .log-day-group{animation:logFadeUp .38s var(--log-ease) both}
.logistics-root .spin{animation:logSpin .8s linear infinite}
.logistics-root button svg{vertical-align:middle;flex-shrink:0}

/* Botones */
.logistics-root .log-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;padding:0 14px;border:1px solid var(--border-2);border-radius:3px;background:transparent;color:var(--muted);font:inherit;font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer;transition:color .2s ease,border-color .2s ease,background-color .2s ease,opacity .2s ease}
.logistics-root .log-btn:hover:not(:disabled){color:var(--text);border-color:var(--border-3);background:var(--panel)}
.logistics-root .log-btn.is-ghost{border-color:transparent}
.logistics-root .log-btn.is-ghost:hover:not(:disabled){border-color:transparent;background:var(--panel-2)}
.logistics-root .log-btn.is-on{color:var(--violet)}
.logistics-root .log-btn.is-danger{color:var(--red)}
.logistics-root .log-btn.is-primary{background:var(--text);border-color:var(--text);color:var(--bg);font-weight:600}
.logistics-root .log-btn.is-primary:hover:not(:disabled){background:var(--text);border-color:var(--text);color:var(--bg);opacity:.86}
.logistics-root .log-btn.is-icon{width:38px;padding:0}
.logistics-root .log-btn.is-sm{height:30px;padding:0 10px;font-size:12px}
.logistics-root .log-btn:disabled{opacity:.4;cursor:default}

/* Encabezado */
.logistics-root .log-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.logistics-root .log-menu{position:absolute;top:44px;right:0;z-index:20;width:250px;padding:6px;border:1px solid var(--border-2);border-radius:3px;background:var(--panel-solid);box-shadow:0 18px 50px var(--shadow-strong);display:grid;gap:2px;animation:logModalIn .2s var(--log-ease) both}
.logistics-root .log-menu button{display:flex;align-items:center;gap:8px;padding:9px 10px;border:0;border-radius:2px;background:transparent;color:var(--text);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.logistics-root .log-menu button:hover{background:var(--panel-2)}
.logistics-root .log-menu button b{margin-left:auto;color:var(--dim);font-weight:400;font-variant-numeric:tabular-nums}
.logistics-root .log-menu small{padding:6px 10px 4px;color:var(--dim);font-size:11.5px;line-height:1.4}

/* Pestañas y filtros */
.logistics-root .log-tabs{overflow-x:auto;scrollbar-width:none;flex-wrap:nowrap}
.logistics-root .log-tabs::-webkit-scrollbar{display:none}
.logistics-root .log-filters{display:flex;align-items:flex-end;gap:12px 18px;flex-wrap:wrap;margin-top:-6px}
.logistics-root .log-buscar{flex:1 1 280px}
.logistics-root .log-select{height:40px;min-width:150px;padding:0 4px 0 0;border:0;border-bottom:1px solid var(--border-2);border-radius:0;background:transparent;color:var(--text);font:inherit;font-size:13.5px;font-weight:400;outline:none;cursor:pointer}
.logistics-root .log-select:focus{border-bottom-color:var(--text)}
/* El tema claro pinta todos los campos de blanco con !important; el :not(#…) le gana sin tocar la regla general. */
.logistics-root .log-buscar>input:not(#log-sin-caja),.logistics-root .log-select:not(#log-sin-caja){background:transparent!important}
.logistics-root .log-filter-advanced{flex-basis:100%;display:grid;grid-template-columns:repeat(4,minmax(150px,1fr)) auto;gap:12px;align-items:end;padding-top:14px;border-top:1px solid var(--border)}
.logistics-root .log-error{padding:14px 16px;border:1px solid var(--red-border);border-left:2px solid var(--red);border-radius:3px;color:var(--red);font-size:13px}
.logistics-root .log-empty{display:grid;justify-items:center;gap:10px;padding:56px 20px;border:1px dashed var(--border-2);border-radius:3px;color:var(--dim);font-size:13.5px;text-align:center}

/* Calendario */
.logistics-root .log-cal-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.logistics-root .log-cal-title{margin:0;font-size:26px;font-weight:300;line-height:1;letter-spacing:.14em;text-transform:uppercase;color:var(--text)}
.logistics-root .log-cal-title small{margin-left:14px;font-size:inherit;color:var(--dim);font-variant-numeric:tabular-nums}
.logistics-root .log-cal-nav{display:flex;align-items:center;gap:6px}
.logistics-root .log-scroll-x{overflow-x:auto}
.logistics-root .log-grid{display:grid;border-top:1px solid var(--border);border-left:1px solid var(--border)}
.logistics-root .log-month{grid-template-columns:repeat(5,minmax(130px,1fr)) repeat(2,minmax(100px,.7fr));min-width:860px}
.logistics-root .log-week{grid-template-columns:repeat(5,minmax(160px,1fr)) repeat(2,minmax(130px,.75fr));min-width:1100px}
.logistics-root .log-wd{padding:12px 10px 10px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);color:var(--dim);font-size:10.5px;font-weight:500;letter-spacing:.2em;text-transform:uppercase}
.logistics-root .log-day{position:relative;min-width:0;min-height:132px;padding:8px 8px 36px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:4px;transition:background-color .2s ease}
.logistics-root .log-day.is-weekend{background:var(--panel)}
.logistics-root .log-day.is-out{background:transparent;background-image:repeating-linear-gradient(135deg,transparent 0 9px,var(--panel) 9px 10px)}
.logistics-root .log-day.can-add{cursor:pointer}
.logistics-root .log-day.can-add:hover{background:var(--panel-2)}
.logistics-root .log-day.is-today{box-shadow:inset 0 2px 0 var(--text)}
.logistics-root .log-day-top{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:26px;margin-bottom:2px}
.logistics-root .log-num{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;color:var(--muted);font-size:14px;font-weight:400;font-variant-numeric:tabular-nums}
.logistics-root .log-day.is-past .log-num{color:var(--dim);opacity:.7}
.logistics-root .log-day.is-holiday .log-num{color:var(--red)}
.logistics-root .log-day.is-today .log-num{background:var(--text);color:var(--bg);font-weight:600;opacity:1}
.logistics-root .log-wx{display:inline-flex;align-items:center;gap:3px;color:var(--dim);font-size:11px;font-variant-numeric:tabular-nums}
.logistics-root .log-wx.is-wind{color:var(--red)}
.logistics-root .log-wx.is-rain{color:var(--cyan)}
.logistics-root .log-hol{min-width:0;color:var(--red);font-size:10.5px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.logistics-root .log-ev{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:baseline;gap:1px 7px;width:100%;padding:5px 7px 6px 8px;border:0;border-left:2px solid var(--ev,var(--border-2));border-radius:2px;background:var(--panel-2);color:var(--text);font:inherit;text-align:left;cursor:pointer;transition:background-color .2s ease}
.logistics-root .log-ev:hover{background:var(--panel-3)}
.logistics-root .log-ev.is-risk{background:var(--red-soft)}
.logistics-root .log-ev-time{color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.logistics-root .log-ev-title{min-width:0;font-size:12.5px;font-weight:500;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.logistics-root .log-ev-meta{grid-column:2;min-width:0;display:flex;align-items:center;gap:5px;color:var(--dim);font-size:10.5px;line-height:1.3;white-space:nowrap;overflow:hidden}
.logistics-root .log-ev-meta>span{overflow:hidden;text-overflow:ellipsis}
.logistics-root .log-ev-meta b{flex-shrink:0;color:var(--blue);font-weight:500}
.logistics-root .log-ev-state{justify-self:end;font-size:10px;font-weight:500;letter-spacing:.08em;text-transform:uppercase}
.logistics-root .log-ev.is-tall{grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;padding:9px 10px 10px 11px}
.logistics-root .log-ev.is-tall .log-ev-title{grid-column:1/-1;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:13px}
.logistics-root .log-ev.is-tall .log-ev-meta{grid-column:1/-1}
.logistics-root .log-old{min-width:0;padding:3px 7px;border-left:2px dashed var(--border-2);color:var(--dim);font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.logistics-root .log-more{align-self:flex-start;padding:2px 0;border:0;background:transparent;color:var(--blue);font:inherit;font-size:11.5px;cursor:pointer}
.logistics-root .log-more:hover{text-decoration:underline}
.logistics-root .log-add{position:absolute;left:8px;right:8px;bottom:7px;height:24px;display:flex;align-items:center;gap:5px;padding:0 7px;border:1px dashed var(--border-3);border-radius:2px;background:transparent;color:var(--muted);font:inherit;font-size:11.5px;opacity:0;cursor:pointer;transition:opacity .2s ease,color .2s ease,border-color .2s ease}
.logistics-root .log-day:hover .log-add,.logistics-root .log-add:focus-visible{opacity:1}
.logistics-root .log-add:hover{color:var(--text);border-color:var(--text)}
@media (hover:none){.logistics-root .log-add{opacity:1;border-color:var(--border-2)}}
.logistics-root .log-wcol{min-height:470px;padding:14px 10px 44px;gap:7px}
.logistics-root .log-wcol-head{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;padding-bottom:12px;margin-bottom:4px;border-bottom:1px solid var(--border)}
.logistics-root .log-wcol-wd{display:block;color:var(--dim);font-size:10.5px;font-weight:500;letter-spacing:.2em;text-transform:uppercase}
.logistics-root .log-wcol-num{display:block;margin-top:6px;color:var(--text);font-size:30px;font-weight:300;line-height:1;font-variant-numeric:tabular-nums}
.logistics-root .log-wcol.is-past .log-wcol-num{color:var(--dim)}
.logistics-root .log-wcol.is-holiday .log-wcol-num{color:var(--red)}
.logistics-root .log-wcol.is-today .log-wcol-num{color:var(--blue)}
.logistics-root .log-wcol .log-add{position:static;flex-shrink:0;height:30px;margin-top:2px;opacity:.55;border-color:var(--border-2)}
.logistics-root .log-wcol:hover .log-add{opacity:1}
.logistics-root .log-wcol{padding-bottom:14px}
.logistics-root .log-wcol-empty{padding:18px 0;color:var(--dim);font-size:12px;text-align:center}

/* Agenda y solicitudes */
.logistics-root .log-agenda{display:grid;gap:28px}
.logistics-root .log-list{display:grid;gap:8px}
.logistics-root .log-day-group-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;min-height:30px}
.logistics-root .log-day-group-date{color:var(--text);font-size:13px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}
.logistics-root .log-day-group-date.is-today{color:var(--blue)}
.logistics-root .log-day-group-line{flex:1;height:1px;background:var(--border)}
.logistics-root .log-row{display:grid;grid-template-columns:84px minmax(0,1fr) auto;gap:20px;align-items:center;width:100%;padding:14px 18px 14px 16px;border:1px solid var(--border);border-left:2px solid var(--ev,var(--border-2));border-radius:3px;background:transparent;color:var(--text);font:inherit;text-align:left;cursor:pointer;transition:background-color .2s ease,border-color .2s ease}
.logistics-root button.log-row:hover{background:var(--panel);border-top-color:var(--border-3);border-right-color:var(--border-3);border-bottom-color:var(--border-3)}
.logistics-root .log-row.is-old{border-left-style:dashed;cursor:default}
.logistics-root .log-row.is-compact{grid-template-columns:minmax(0,1fr);gap:10px}
.logistics-root .log-row-time{display:block;font-size:24px;font-weight:300;line-height:1;font-variant-numeric:tabular-nums}
.logistics-root .log-row-date{display:block;margin-top:6px;color:var(--dim);font-size:11px;font-variant-numeric:tabular-nums}
.logistics-root .log-row-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:15px;font-weight:500;line-height:1.3}
.logistics-root .log-row-meta{display:flex;align-items:center;flex-wrap:wrap;gap:4px 16px;margin-top:7px;color:var(--dim);font-size:12px}
.logistics-root .log-row-meta>span{display:inline-flex;align-items:center;gap:5px;min-width:0}
.logistics-root .log-row-obra{color:var(--blue)}
.logistics-root .log-row-ruta{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.logistics-root .log-row-side{display:grid;justify-items:end;gap:7px}
.logistics-root .log-row.is-compact .log-row-side{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap}
.logistics-root .log-row-note{display:inline-flex;align-items:center;gap:5px;color:var(--dim);font-size:11.5px}
.logistics-root .log-flag{font-style:normal;color:var(--dim);font-size:10.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase}
.logistics-root .log-flag.is-red{color:var(--red)}
.logistics-root .log-state{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:500;white-space:nowrap}
.logistics-root .log-state i{width:6px;height:6px;border-radius:50%;background:currentColor}

/* Diálogos y detalle */
.logistics-root .log-modal-backdrop{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:12px;background:var(--overlay-strong);animation:logBackdrop .18s ease both}
.logistics-root .log-modal-card{max-width:100%;max-height:94vh;overflow:hidden;display:flex;flex-direction:column;background:var(--panel-solid);border:1px solid var(--border-2);border-radius:4px;box-shadow:0 24px 80px var(--shadow-strong);animation:logModalIn .26s var(--log-ease) both}
.logistics-root .log-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 22px 16px;border-bottom:1px solid var(--border)}
.logistics-root .log-modal-title{margin-top:8px;color:var(--text);font-size:22px;font-weight:300;line-height:1.2;letter-spacing:.01em}
.logistics-root .log-modal-sub{margin-top:5px;color:var(--dim);font-size:12.5px}
.logistics-root .log-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 22px;border-top:1px solid var(--border)}
.logistics-root .log-detail-backdrop{animation:logBackdrop .18s ease both}
.logistics-root .log-detail-sheet{animation:logSlideIn .3s var(--log-ease) both;border-radius:4px!important;scrollbar-width:thin;scrollbar-color:var(--border-2) transparent}

@media(max-width:920px){
  .logistics-root .log-main{padding:0 14px 32px}
  .logistics-root .log-hide-sm{display:none}
  .logistics-root .log-actions .log-label{display:none}
  .logistics-root .log-actions .log-btn:not(.is-primary){width:42px;padding:0}
  .logistics-root .log-btn{height:42px}
  .logistics-root .log-filter-advanced{grid-template-columns:repeat(2,minmax(0,1fr))}
  .logistics-root .log-detail-backdrop{padding:0!important}
  .logistics-root .log-detail{width:100%!important;border-radius:0!important;border:0!important}
  .logistics-root .log-transport-grid{grid-template-columns:repeat(3,1fr)!important}
  .logistics-root .log-stop{grid-template-columns:70px 1fr 34px!important}
  .logistics-root .log-stop input:nth-of-type(2),.logistics-root .log-stop input:nth-of-type(3){grid-column:2/3}
  .logistics-root .log-manual-stop{grid-template-columns:82px minmax(0,1fr) 34px!important}
  .logistics-root .log-manual-stop input:nth-of-type(1),.logistics-root .log-manual-stop input:nth-of-type(2){grid-column:2/3}
  .logistics-root .log-manual-stop button{grid-column:3/4;grid-row:1/3}
  .logistics-root .log-cost-grid{grid-template-columns:1fr!important}
}
@media(max-width:640px){
  .logistics-root .log-actions .log-btn.is-primary .log-label{display:inline}
  .logistics-root .log-two{grid-template-columns:1fr!important}
  .logistics-root .log-transport-grid{grid-template-columns:repeat(2,1fr)!important}
  .logistics-root .log-filter-advanced{grid-template-columns:1fr}
  .logistics-root .log-select{flex:1 1 140px;min-width:0}
  .logistics-root .log-cal-title{font-size:21px}
  .logistics-root .log-modal-backdrop{place-items:end stretch;padding:0}
  .logistics-root .log-modal-card{width:100%!important;max-height:92vh;border-radius:6px 6px 0 0;padding-bottom:env(safe-area-inset-bottom)}
}

/* ── Segunda pasada: color y movimiento ── */
/* Barra única: título, vistas y acciones en un renglón */
.logistics-root .log-bar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:28px;min-height:60px;padding:0 32px;border-bottom:1px solid var(--border);background:var(--topbar);-webkit-backdrop-filter:var(--glass-filter);backdrop-filter:var(--glass-filter)}
.logistics-root .log-bar-title{margin:0;flex-shrink:0;font-size:19px;font-weight:300;letter-spacing:.18em;text-transform:uppercase;line-height:1}
.logistics-root .log-bar .log-tabs{flex:1;min-width:0;display:flex;align-self:stretch;gap:26px;overflow-x:auto;scrollbar-width:none}
.logistics-root .log-bar .log-tabs::-webkit-scrollbar{display:none}
.logistics-root .log-bar .az-tab{min-height:60px}
.logistics-root .log-bar .log-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
@keyframes logSlideFromRight{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}
@keyframes logSlideFromLeft{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}
@keyframes logCellIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes logPop{from{opacity:0;transform:translateY(6px) scale(.96)}to{opacity:1;transform:none}}
@keyframes logRing{0%{box-shadow:0 0 0 0 var(--blue-border)}100%{box-shadow:0 0 0 12px transparent}}
@keyframes logRain{0%{transform:translate3d(0,-20px,0) rotate(12deg);opacity:0}15%{opacity:.5}80%{opacity:.3}100%{transform:translate3d(-16px,150px,0) rotate(12deg);opacity:0}}
@keyframes logGrad{from{background-position:0% 50%}to{background-position:100% 50%}}

/* Portada con el agua de la marca */
.logistics-root .log-main{padding:0 0 48px}
.logistics-root .log-workspace{padding:22px 32px 0}
.logistics-root .log-grad{background:var(--brand-grad);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation:logGrad 2.4s var(--log-ease) both}
.logistics-root .log-btn.is-primary{background:var(--brand-grad);border-color:transparent;color:var(--inverse-text);box-shadow:0 8px 24px var(--blue-soft)}
.logistics-root .log-btn.is-primary:hover:not(:disabled){background:var(--brand-grad);border-color:transparent;color:var(--inverse-text);opacity:1;transform:translateY(-1px);box-shadow:0 12px 30px var(--blue-border)}
.logistics-root .log-btn.is-primary:active:not(:disabled){transform:translateY(0) scale(.98)}
.logistics-root .log-btn{transition:color .2s ease,border-color .2s ease,background-color .2s ease,opacity .2s ease,transform .2s var(--log-ease),box-shadow .2s ease}
.logistics-root .log-btn:not(.is-ghost):not(.is-primary){background:var(--topbar-soft);-webkit-backdrop-filter:var(--glass-filter);backdrop-filter:var(--glass-filter)}

/* Números con su color */

/* Pestañas con subrayado de la marca que crece */
.logistics-root .log-tabs .az-tab::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--brand-grad);transform:scaleX(0);transform-origin:left;transition:transform .4s var(--log-ease)}
.logistics-root .log-tabs .az-tab.is-active::after{height:2px;background:var(--brand-grad);transform:scaleX(1)}

/* Transportes como fichas de color (también filtran) */
.logistics-root .log-chips{flex-basis:100%;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px 0}
.logistics-root .log-chips::-webkit-scrollbar{display:none}
.logistics-root .log-chip{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px;flex-shrink:0;border:1px solid var(--border);border-radius:99px;background:transparent;color:var(--muted);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;transition:background-color .2s ease,border-color .2s ease,color .2s ease,transform .2s var(--log-ease)}
.logistics-root .log-chip svg{color:var(--tc)}
.logistics-root .log-chip b{color:var(--dim);font-weight:400;font-variant-numeric:tabular-nums}
.logistics-root .log-chip:hover{border-color:var(--tb);color:var(--text);transform:translateY(-1px)}
.logistics-root .log-chip.is-active{background:var(--ts);border-color:var(--tb);color:var(--tc)}
.logistics-root .log-chip.is-active b{color:var(--tc)}

/* El mes y la semana entran deslizándose hacia donde fuiste */
.logistics-root .log-slide.from-right{animation:logSlideFromRight .45s var(--log-ease) both}
.logistics-root .log-slide.from-left{animation:logSlideFromLeft .45s var(--log-ease) both}
.logistics-root .log-slide .log-day{animation:logCellIn .45s var(--log-ease) both;animation-delay:calc(var(--i,0) * 12ms)}
.logistics-root .log-wd.is-weekend{color:var(--violet)}
.logistics-root .log-day>*:not(.log-rain){position:relative;z-index:1}
.logistics-root .log-day.is-today{background:radial-gradient(circle at 18% 0%,var(--blue-soft),transparent 75%);box-shadow:inset 0 2px 0 var(--blue)}
.logistics-root .log-day.is-today .log-num{background:var(--brand-grad);color:var(--inverse-text);animation:logRing 1.4s .5s ease-out 2}
.logistics-root .log-day.can-add:hover{background:var(--panel-2)}
.logistics-root .log-day.is-today.can-add:hover{background:radial-gradient(circle at 18% 0%,var(--blue-soft),var(--panel-2) 75%)}
.logistics-root .log-day.is-holiday{background:linear-gradient(160deg,var(--red-soft),transparent 55%)}
.logistics-root .log-add{transform:translateY(5px);transition:opacity .25s ease,transform .3s var(--log-ease),color .2s ease,border-color .2s ease,background-color .2s ease}
.logistics-root .log-day:hover .log-add,.logistics-root .log-add:focus-visible{transform:none}
.logistics-root .log-add:hover{background:var(--blue-soft);border-color:var(--blue-border);color:var(--blue)}

/* Movimientos: color del transporte, punto del estado */
.logistics-root .log-ev{border-left:3px solid var(--tc,var(--border-2));background:var(--ts,var(--panel-2));animation:logPop .4s var(--log-ease) both;animation-delay:var(--d,0ms);transition:background-color .2s ease,transform .2s var(--log-ease),box-shadow .2s ease}
.logistics-root .log-ev:hover{background:var(--ts,var(--panel-2));transform:translateY(-1px);box-shadow:0 8px 20px var(--shadow)}
.logistics-root .log-ev-time{display:inline-flex;align-items:center;gap:5px;color:var(--tc,var(--muted));font-weight:500}
.logistics-root .log-ev-dot{display:inline-block;width:6px;height:6px;flex-shrink:0;border-radius:50%;background:var(--st,currentColor)}
.logistics-root .log-ev-state{display:inline-flex;align-items:center;gap:5px}
.logistics-root .log-ev-state .log-ev-dot{background:currentColor}
.logistics-root .log-ev.is-cancel{opacity:.55}
.logistics-root .log-ev.is-cancel .log-ev-title{text-decoration:line-through}
.logistics-root .log-wcol.is-today{background:linear-gradient(180deg,var(--blue-soft),transparent 45%)}
.logistics-root .log-wcol.is-today .log-wcol-head{border-bottom-color:var(--blue-border)}
.logistics-root .log-wcol.is-today .log-wcol-num{background:var(--brand-grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.logistics-root .log-wcol.is-today .log-wcol-wd{color:var(--blue)}

/* Lluvia en los días con más de 40 %: se pausa cuando nadie usa la PC */
.logistics-root .log-rain{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;opacity:.6}
.logistics-root .log-rain i{position:absolute;top:-18px;width:1px;height:14px;border-radius:99px;background:linear-gradient(to bottom,transparent,var(--cyan));transform:rotate(12deg);animation:logRain 1.5s linear infinite}
.logistics-root.is-quieto .log-rain i,.logistics-root.is-quieto .log-grad{animation-play-state:paused}

/* Agenda: ícono del transporte en color */
.logistics-root .log-row-icon{width:30px;height:30px;flex-shrink:0;display:grid;place-items:center;border:1px solid var(--tb,var(--border));border-radius:3px;background:var(--ts,var(--panel));color:var(--tc,var(--muted));transition:transform .25s var(--log-ease)}
.logistics-root button.log-row:hover .log-row-icon{transform:scale(1.08) rotate(-4deg)}
.logistics-root .log-row{transition:background-color .2s ease,border-color .2s ease,transform .25s var(--log-ease),box-shadow .25s ease}
.logistics-root button.log-row:hover{transform:translateX(3px);box-shadow:0 10px 26px var(--shadow)}
.logistics-root .log-row-time{color:var(--text)}
.logistics-root .log-day-group-date.is-today{background:var(--brand-grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}

@media(max-width:920px){
  .logistics-root .log-workspace{padding:16px 14px 0}
}

.logistics-root .log-label-short{display:none}
@media(max-width:1360px){
  .logistics-root .log-bar .log-actions .log-btn:not(.is-primary) .log-label{display:none}
  .logistics-root .log-bar .log-actions .log-btn:not(.is-primary){width:38px;padding:0}
}
@media(max-width:1100px){
  .logistics-root .log-bar{position:static;flex-wrap:wrap;gap:0 10px;min-height:0;padding:12px 14px 0}
  .logistics-root .log-bar-title{font-size:16px;letter-spacing:.16em}
  .logistics-root .log-bar .log-actions{margin-left:auto}
  .logistics-root .log-bar .log-tabs{order:3;flex-basis:100%;gap:22px;margin-top:8px}
  .logistics-root .log-bar .az-tab{min-height:44px}
}
@media(max-width:640px){
  .logistics-root .log-hide-xs{display:none}
  .logistics-root .log-actions .log-btn.is-primary .log-label{display:none}
  .logistics-root .log-actions .log-btn.is-primary .log-label-short{display:inline}
}

.logistics-root .log-filters{align-items:center;margin-top:0}
.logistics-root .log-filters .log-chips{flex:0 1 auto;min-width:0}
.logistics-root .log-filters .log-buscar{flex:1 1 220px}
@media(max-width:920px){.logistics-root .log-filters .log-chips{flex-basis:100%;order:-1}}
`;
