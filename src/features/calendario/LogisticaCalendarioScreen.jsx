import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
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
  Filter,
  History,
  MapPin,
  Merge,
  PackageOpen,
  Plus,
  RefreshCw,
  Route,
  Search,
  Send,
  Truck,
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
  crearSolicitudLogistica,
  guardarCostoMovimiento,
  listarHitosCalendario,
  listarMovimientosLogisticos,
  listarObrasActivas,
  proponerFechaMovimiento,
  responderFechaMovimiento,
} from "./calendarioLogisticaApi";

const TRANSPORTES = {
  flete: { label: "Flete", color: C.blue, soft: C.blueL, border: C.blueB, proveedores: ["Hugo", "Dani"] },
  camion: { label: "Camión", color: C.violet, soft: C.violetL, border: C.violetB, proveedores: ["Degiovani"] },
  hidrogrua: { label: "Hidrogrúa", color: C.teal, soft: C.tealL, border: C.tealB, proveedores: ["Hidrogrúas Flor"] },
  grua: { label: "Grúa", color: C.cyan, soft: C.cyanL, border: C.cyanB, proveedores: ["Grúas Delta", "Grúas Queco"] },
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

function sameTripCandidates(rows, draft, excludeId = null) {
  if (!draft?.fechaSolicitada || draft.modalidad === "trabajo_en_sitio") return [];
  const wanted = new Set(transportsOf(draft).map((item) => item.tipo));
  const requested = parseDate(draft.fechaSolicitada);
  return rows.filter((row) => {
    if (row.id === excludeId || row.estado === "cancelado" || row.estado === "realizado") return false;
    if (row.modalidad === "trabajo_en_sitio" || !transportsOf(row).some((item) => wanted.has(item.tipo))) return false;
    const date = parseDate(displayDate(row));
    return date && Math.abs((date - requested) / 86400000) <= 1;
  }).slice(0, 4);
}

function StatusBadge({ status }) {
  const ui = statusUi(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 25, padding: "0 9px", borderRadius: 999, background: ui.soft, border: `1px solid ${ui.border}`, color: ui.color, fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: ui.color }} />
      {ui.label}
    </span>
  );
}

function TransportBadge({ row, compact = false }) {
  const ui = transportUi(transportsOf(row)[0]?.tipo);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: ui.color, fontSize: compact ? 10.5 : 11.5, fontWeight: 850, minWidth: 0 }}>
      <Truck size={compact ? 12 : 14} />
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 31, padding: "0 10px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, whiteSpace: "nowrap" }}>
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
    <span title={`${weatherLabel(today.code)} · lluvia ${today.rain ?? 0}%`} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 31, padding: "0 10px", borderRadius: 9, border: `1px solid ${risky ? C.redB : C.cyanB}`, background: risky ? C.redL : C.cyanL, color: risky ? C.red : C.cyan, whiteSpace: "nowrap" }}>
      {Number(today.rain) >= 40 ? <CloudRain size={14} /> : <CloudSun size={14} />}
      <b style={{ fontFamily: C.mono, fontSize: 11.5 }}>{Math.round(today.max)}° / {Math.round(today.min)}°</b>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 850 }}><Wind size={12} /> {Math.round(today.wind)} km/h</span>
      <span style={{ color: C.dim, fontSize: 9.5 }}>San Fernando</span>
    </span>
  );
}

function LegacyEventCard({ row, compact = false }) {
  return (
    <div style={{ width: "100%", padding: compact ? "9px 11px" : "11px 14px", display: "grid", gridTemplateColumns: compact ? "minmax(0,1fr)" : "76px minmax(0,1fr) auto", gap: 12, alignItems: "center", background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.amber}`, borderRadius: 11 }}>
      {!compact && <span style={{ textAlign: "center", paddingRight: 12, borderRight: `1px solid ${C.border}` }}><b style={{ display: "block", color: C.text, fontFamily: C.mono, fontSize: 15 }}>{cleanTime(row.hora) || "—"}</b><small style={{ color: C.dim, fontSize: 9.5 }}>{fmtDate(row.fecha)}</small></span>}
      <span style={{ minWidth: 0 }}><b style={{ display: "block", color: C.text, fontSize: 12.5 }}>{row.titulo}</b><span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 4 }}>{row.obra ? `${row.obra} · ` : ""}{row.notas || "Movimiento registrado en el calendario anterior"}</span></span>
      <span style={{ color: C.amber, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", whiteSpace: "nowrap" }}>Registro anterior</span>
    </div>
  );
}

function MovementCard({ row, onOpen, compact = false }) {
  const ui = transportUi(transportsOf(row)[0]?.tipo);
  const shared = row.viaje_grupo_id;
  return (
    <button type="button" className="log-card" onClick={() => onOpen(row)} style={{ width: "100%", textAlign: "left", padding: compact ? "10px 12px" : "13px 15px", display: "grid", gridTemplateColumns: compact ? "minmax(0,1fr) auto" : "76px minmax(0,1fr) auto", gap: 13, alignItems: "center", background: C.panelSolid, border: `1px solid ${C.border}`, borderLeft: `3px solid ${ui.color}`, borderRadius: 12, color: C.text, cursor: "pointer", fontFamily: C.sans }}>
      {!compact && (
        <span style={{ textAlign: "center", paddingRight: 12, borderRight: `1px solid ${C.border}` }}>
          <span style={{ display: "block", color: C.text, fontFamily: C.mono, fontSize: 17, fontWeight: 900 }}>{displayTime(row) || "—"}</span>
          <span style={{ display: "block", color: C.dim, fontSize: 10, marginTop: 3 }}>{fmtDate(displayDate(row))}</span>
        </span>
      )}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ color: C.text, fontSize: 13.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{row.carga || row.titulo}</span>
          {row.prioridad === "urgente" && <span style={{ color: C.red, fontSize: 9.5, fontWeight: 950, textTransform: "uppercase" }}>Urgente</span>}
          {shared && <span title="Viaje compartido" style={{ display: "inline-flex", color: C.violet }}><Merge size={13} /></span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, minWidth: 0 }}>
          <TransportBadge row={row} compact />
          {row.obra && <span style={{ color: C.blue, fontFamily: C.mono, fontSize: 10.5, fontWeight: 800 }}>· {row.obra}</span>}
          <span style={{ color: C.dim, fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {routeLabel(row)}</span>
        </span>
        {compact && <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 5 }}>{fmtDate(displayDate(row), true)} · {displayTime(row) || "Sin hora"}</span>}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusBadge status={row.estado} />
        <ChevronRight size={16} color={C.dim} />
      </span>
    </button>
  );
}

const FIELD = { width: "100%", minHeight: 39, borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, color: C.text, padding: "8px 10px", outline: "none", fontFamily: C.sans, fontSize: 13 };
const LABEL = { display: "block", color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 5 };

function ModalShell({ title, subtitle, onClose, children, width = 720 }) {
  return (
    <div className="log-modal-backdrop" onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 12000, background: "var(--overlay-strong)", display: "grid", placeItems: "center", padding: 12 }}>
      <div onMouseDown={(event) => event.stopPropagation()} style={{ width, maxWidth: "100%", maxHeight: "94vh", overflow: "hidden", display: "flex", flexDirection: "column", background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 16, boxShadow: "0 24px 80px var(--shadow-strong)" }}>
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
            <div style={{ display: "grid", gap: 6, marginTop: 9 }}>
              {suggestions.map((candidate) => {
                const selected = form.viajeSugeridoId === candidate.id;
                return (
                  <button key={candidate.id} type="button" onClick={() => set("viajeSugeridoId", selected ? "" : candidate.id)} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", textAlign: "left", padding: "8px 10px", borderRadius: 9, background: selected ? C.panelSolid : "transparent", border: `1px solid ${selected ? C.violet : C.violetB}`, color: C.text, cursor: "pointer" }}>
                    <span style={{ minWidth: 0 }}><b style={{ fontSize: 12 }}>{candidate.carga}</b><span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 3 }}>{fmtDate(displayDate(candidate))} · {routeLabel(candidate)}</span></span>
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
        {mode === "propose" && <div style={{ padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, fontSize: 11.5 }}>La persona que hizo la solicitud deberá aceptar esta fecha antes de que el movimiento quede confirmado.</div>}
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
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cost, setCost] = useState(row.costo ?? "");
  const [currency, setCurrency] = useState(row.moneda || "ARS");
  const [costDetail, setCostDetail] = useState(row.costo_detalle || "");
  const own = row.created_by === profile?.id;
  const candidates = sameTripCandidates(rows, { transportes: transportsOf(row), modalidad: row.modalidad, fechaSolicitada: displayDate(row) }, row.id);

  useEffect(() => {
    let alive = true;
    cargarHistorialMovimiento(row.id).then((data) => { if (alive) setHistory(data); }).catch(() => {});
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

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 11000, background: "var(--overlay)", display: "flex", justifyContent: "flex-end" }}>
      <aside onMouseDown={(event) => event.stopPropagation()} className="log-detail" style={{ width: 500, maxWidth: "100%", height: "100%", overflowY: "auto", background: C.panelSolid, borderLeft: `1px solid ${C.border2}`, boxShadow: "-20px 0 70px var(--shadow-strong)", color: C.text }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: C.topbar, backdropFilter: "blur(18px)", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}><button onClick={onClose} style={{ width: 31, height: 31, display: "grid", placeItems: "center", borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, cursor: "pointer" }}><ArrowRight size={16} /></button><div><div style={{ fontSize: 13.5, fontWeight: 950 }}>Detalle del movimiento</div><div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>Registro #{String(row.id).slice(0, 8)}</div></div></div>
          <StatusBadge status={row.estado} />
        </div>

        <div style={{ padding: 18, display: "grid", gap: 18 }}>
          <section>
            <TransportBadge row={row} />
            <h2 style={{ margin: "8px 0 0", color: C.text, fontSize: 22, lineHeight: 1.2 }}>{row.carga || row.titulo}</h2>
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
                <button disabled={saving} onClick={() => action(() => responderFechaMovimiento(row, true, profile), "Fecha aceptada. Movimiento confirmado.")} style={{ flex: 1, padding: 9, borderRadius: 9, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 950 }}><Check size={14} /> Aceptar</button>
                <button disabled={saving} onClick={() => action(() => responderFechaMovimiento(row, false, profile), "Propuesta rechazada. Compras fue avisado.")} style={{ flex: 1, padding: 9, borderRadius: 9, border: `1px solid ${C.redB}`, background: C.redL, color: C.red, cursor: "pointer", fontWeight: 950 }}><X size={14} /> Rechazar</button>
              </div>
            </section>
          )}

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ padding: 11, borderRadius: 10, background: C.panel, border: `1px solid ${C.border}` }}><span style={LABEL}>Fecha solicitada</span><b style={{ color: C.text, fontFamily: C.mono, fontSize: 13 }}>{fmtDate(row.fecha_solicitada)} · {cleanTime(row.hora_solicitada) || "Sin hora"}</b></div>
            <div style={{ padding: 11, borderRadius: 10, background: C.panel, border: `1px solid ${C.border}` }}><span style={LABEL}>{row.estado === "fecha_propuesta" ? "Fecha propuesta" : "Fecha confirmada"}</span><b style={{ color: row.fecha_confirmada || row.fecha_propuesta ? C.green : C.dim, fontFamily: C.mono, fontSize: 13 }}>{row.fecha_confirmada || row.fecha_propuesta ? `${fmtDate(row.fecha_confirmada || row.fecha_propuesta)} · ${cleanTime(row.hora_confirmada || row.hora_propuesta) || "Sin hora"}` : "Pendiente"}</b></div>
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

          {isManager && row.estado === "solicitado" && (
            <section style={{ display: "grid", gap: 7 }}>
              <button onClick={() => onCoordinate("confirm")} style={{ padding: 10, borderRadius: 10, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 950 }}><CheckCircle2 size={15} /> Confirmar fecha solicitada</button>
              <button onClick={() => onCoordinate("propose")} style={{ padding: 10, borderRadius: 10, border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, cursor: "pointer", fontWeight: 950 }}><Clock3 size={15} /> Proponer otra fecha</button>
            </section>
          )}

          {isManager && candidates.length > 0 && !["realizado", "cancelado"].includes(row.estado) && (
            <section>
              <span style={LABEL}>Posibles viajes compartidos</span>
              <div style={{ display: "grid", gap: 6 }}>
                {candidates.map((candidate) => (
                  <button key={candidate.id} disabled={saving} onClick={() => action(() => agruparMovimientos(row, candidate, profile), "Movimientos agrupados en el mismo viaje.")} style={{ padding: "9px 10px", borderRadius: 9, border: `1px solid ${C.violetB}`, background: row.viaje_sugerido_id === candidate.id ? C.violetL : C.panel, color: C.text, cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10, textAlign: "left" }}><span><b style={{ fontSize: 11.5 }}>{candidate.carga}</b><small style={{ display: "block", color: C.dim, marginTop: 3 }}>{fmtDate(displayDate(candidate))} · {routeLabel(candidate)}</small></span><span style={{ color: C.violet, fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap" }}><Merge size={12} /> Compartir</span></button>
                ))}
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

          <section>
            <button onClick={() => setHistoryOpen((value) => !value)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", border: 0, borderTop: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", fontWeight: 900 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><History size={14} /> Historial completo</span><span>{historyOpen ? "Ocultar" : `${history.length} cambios`}</span></button>
            {historyOpen && <div style={{ display: "grid", gap: 8, paddingTop: 5 }}>{history.map((item) => <div key={item.id} style={{ paddingLeft: 12, borderLeft: `2px solid ${statusUi(item.estado_nuevo).border}` }}><div style={{ color: C.text, fontSize: 11.5, fontWeight: 850 }}>{String(item.accion || "Cambio").replaceAll("_", " ")}</div><div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>{actorName(item.actor)} · {new Date(item.created_at).toLocaleString("es-AR")}</div></div>)}</div>}
          </section>
        </div>
      </aside>
    </div>
  );
}

function MonthView({ month, rows, milestones, weather, onOpen, onMonth }) {
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

  return (
    <section style={{ background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ height: 52, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}` }}>
        <button onClick={() => onMonth(new Date(year, monthIndex - 1, 1))} style={{ width: 31, height: 31, display: "grid", placeItems: "center", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: "pointer" }}><ChevronLeft size={15} /></button>
        <strong style={{ color: C.text, fontSize: 14 }}>{MESES[monthIndex]} {year}</strong>
        <button onClick={() => onMonth(new Date(year, monthIndex + 1, 1))} style={{ width: 31, height: 31, display: "grid", placeItems: "center", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: "pointer" }}><ChevronRight size={15} /></button>
      </div>
      <div className="log-calendar" style={{ minWidth: 760 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `1px solid ${C.border}` }}>{DIAS.map((day) => <div key={day} style={{ padding: "8px 10px", color: C.dim, fontSize: 9.5, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".1em", textAlign: "center" }}>{day}</div>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
          {cells.map((date, index) => {
            const events = date ? byDate.get(date) || [] : [];
            const marks = date ? milestoneMap.get(date) || [] : [];
            const dayWeather = date ? weather[date] : null;
            return (
              <div key={index} style={{ minHeight: 112, padding: 7, borderRight: index % 7 !== 6 ? `1px solid ${C.border}` : 0, borderBottom: index < 35 ? `1px solid ${C.border}` : 0, background: date === TODAY ? C.blueL : date ? "transparent" : C.panel }}>
                {date && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: date === TODAY ? C.blue : C.dim, fontFamily: C.mono, fontSize: 10.5, fontWeight: 900, marginBottom: 6 }}><span>{parseDate(date).getDate()}</span>{dayWeather && <span title={`${weatherLabel(dayWeather.code)} · viento ${Math.round(dayWeather.wind)} km/h`} style={{ display: "inline-flex", alignItems: "center", gap: 3, color: Number(dayWeather.wind) >= 30 ? C.red : C.dim, fontSize: 8.5 }}><CloudSun size={10} />{Math.round(dayWeather.max)}°</span>}</div>}
                {events.slice(0, 3).map((row) => { const ui = transportUi(transportsOf(row)[0]?.tipo); const risky = hasCrane(row) && Number(dayWeather?.wind) >= 30; return <button key={row.id} onClick={() => onOpen(row)} title={`${row.carga}${risky ? " · Revisar viento" : ""}`} style={{ width: "100%", display: "block", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4, padding: "4px 6px", borderRadius: 6, border: `1px solid ${risky ? C.redB : ui.border}`, background: risky ? C.redL : ui.soft, color: risky ? C.red : ui.color, cursor: "pointer", fontSize: 9.5, fontWeight: 850 }}>{displayTime(row) || "—"} · {row.carga}</button>; })}
                {events.length > 3 && <div style={{ color: C.dim, fontSize: 9.5 }}>+{events.length - 3} movimientos</div>}
                {marks.slice(0, Math.max(1, 3 - events.length)).map((mark) => <div key={mark.id} title={mark.notas || "Registro del calendario anterior"} style={{ marginTop: 4, padding: "3px 5px", borderRadius: 5, border: `1px solid ${C.amberB}`, background: C.amberL, color: C.amber, fontSize: 8.8, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>◆ {cleanTime(mark.hora) ? `${cleanTime(mark.hora)} · ` : ""}{mark.titulo}{mark.obra ? ` · ${mark.obra}` : ""}</div>)}
                {marks.length > Math.max(1, 3 - events.length) && <div style={{ color: C.amber, fontSize: 8.5, marginTop: 3 }}>+{marks.length - Math.max(1, 3 - events.length)} anteriores</div>}
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
  const [month, setMonth] = useState(() => parseDate(TODAY));
  const [selected, setSelected] = useState(null);
  const [requestModal, setRequestModal] = useState(null);
  const [coordination, setCoordination] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const from = dateAdd(TODAY, -120);
      const to = dateAdd(TODAY, 365);
      const [movementRows, oldEvents, activeWorks] = await Promise.all([
        listarMovimientosLogisticos({ desde: from, hasta: to }),
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
      if (status !== "todos" && row.estado !== status) return false;
      if (transport !== "todos" && !transportsOf(row).some((item) => item.tipo === transport)) return false;
      if (!term) return true;
      const haystack = [row.carga, row.titulo, row.obra, transportSummary(row, true), row.notas, actorName(row.solicitante), routeLabel(row)].join(" ").toLowerCase();
      return term.split(/\s+/).every((word) => haystack.includes(word));
    });
  }, [query, rows, status, transport]);

  const upcoming = useMemo(() => filtered.filter((row) => row.estado !== "cancelado" && displayDate(row) >= TODAY).sort((a, b) => `${displayDate(a)}${displayTime(a)}`.localeCompare(`${displayDate(b)}${displayTime(b)}`)), [filtered]);
  const groups = useMemo(() => {
    const acc = {};
    upcoming.forEach((row) => {
      const key = displayDate(row);
      (acc[key] ||= { movements: [], legacy: [] }).movements.push(row);
    });
    if (status === "todos" && transport === "todos") {
      const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      milestones.filter((row) => row.fecha >= TODAY).forEach((row) => {
        const haystack = [row.titulo, row.obra, row.notas, row.tipo].join(" ").toLowerCase();
        if (words.length && !words.every((word) => haystack.includes(word))) return;
        (acc[row.fecha] ||= { movements: [], legacy: [] }).legacy.push(row);
      });
    }
    return acc;
  }, [milestones, query, status, transport, upcoming]);
  const metrics = useMemo(() => ({
    pending: rows.filter((row) => row.estado === "solicitado").length,
    proposals: rows.filter((row) => row.estado === "fecha_propuesta").length,
    week: rows.filter((row) => !["cancelado", "realizado"].includes(row.estado) && displayDate(row) >= TODAY && displayDate(row) <= dateAdd(TODAY, 7)).length,
    urgent: rows.filter((row) => row.prioridad === "urgente" && !["cancelado", "realizado"].includes(row.estado)).length,
  }), [rows]);

  function closeAndReload() {
    setRequestModal(null);
    setCoordination(null);
    load();
  }

  const availableViews = VISTAS.filter((item) => !item.managerOnly || isManager);

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", background: C.bg, color: C.text, fontFamily: C.sans, overflow: "hidden" }}>
      <style>{`
        *,*::before,*::after{box-sizing:border-box}
        .log-card{transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease}
        .log-card:hover{transform:translateY(-1px);border-color:var(--border-2)!important;box-shadow:0 10px 28px var(--shadow)}
        .log-card:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
        button svg{vertical-align:middle}
        @media(max-width:920px){
          .log-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}
          .log-main{padding:12px!important}
          .log-header{padding-left:60px!important}
          .log-filters{align-items:stretch!important}
          .log-detail{width:100%!important}
          .log-transport-grid{grid-template-columns:repeat(3,1fr)!important}
          .log-stop{grid-template-columns:70px 1fr 34px!important}
          .log-stop input:nth-of-type(2),.log-stop input:nth-of-type(3){grid-column:2/3}
          .log-cost-grid{grid-template-columns:1fr!important}
        }
        @media(max-width:620px){
          .log-two{grid-template-columns:1fr!important}
          .log-kpis{grid-template-columns:1fr 1fr!important}
          .log-card{grid-template-columns:minmax(0,1fr)!important}
          .log-card>span:last-child{justify-content:space-between!important}
          .log-transport-grid{grid-template-columns:repeat(2,1fr)!important}
        }
        @media(prefers-reduced-motion:reduce){.log-card{transition:none!important}}
      `}</style>
      <div style={{ flexShrink: 0, width: isMobile ? 0 : undefined, overflow: "visible" }}><Sidebar profile={profile} signOut={signOut} /></div>
      <main style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header className="log-header" style={{ flexShrink: 0, minHeight: 68, padding: "10px 22px", borderBottom: `1px solid ${C.border}`, background: C.topbar, backdropFilter: "blur(18px)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}><Route size={19} /></div>
          <div style={{ minWidth: 180 }}><h1 style={{ margin: 0, color: C.text, fontSize: 17, fontWeight: 950 }}>Logística y movimientos</h1><p style={{ margin: "3px 0 0", color: C.dim, fontSize: 11.5 }}>Solicitudes, coordinación, agenda y costos de transporte.</p></div>
          <nav style={{ display: "flex", gap: 3, padding: 3, borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel, overflowX: "auto" }}>{availableViews.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setView(id)} style={{ height: 32, padding: "0 10px", borderRadius: 7, border: `1px solid ${view === id ? C.border2 : "transparent"}`, background: view === id ? C.panelSolid : "transparent", color: view === id ? C.text : C.dim, cursor: "pointer", fontWeight: view === id ? 900 : 700, fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>{createElement(Icon, { size: 13 })}{label}</button>)}</nav>
          <div style={{ flex: 1 }} />
          {(role === "admin" || role === "tecnica") && <button onClick={() => window.location.assign("/calendario-produccion")} title="Abrir el calendario de producción anterior" style={{ height: 36, padding: "0 11px", borderRadius: 9, display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: "pointer", fontWeight: 850, fontSize: 10.5 }}><CalendarDays size={14} /> Producción anterior</button>}
          <button onClick={load} title="Actualizar" style={{ width: 36, height: 36, borderRadius: 9, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, background: C.panel, color: C.dim, cursor: "pointer" }}><RefreshCw size={15} /></button>
          {canRequest && <button onClick={() => setRequestModal({ row: null })} style={{ height: 37, padding: "0 14px", borderRadius: 9, display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, cursor: "pointer", fontWeight: 950, fontSize: 12 }}><Plus size={15} /> Solicitar movimiento</button>}
        </header>

        <div className="log-main" style={{ flex: 1, overflowY: "auto", padding: 18 }}>
          <div style={{ width: "min(1480px,100%)", margin: "0 auto", display: "grid", gap: 14 }}>
            <section className="log-operational-strip" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <MiniMetric label="Por coordinar" value={metrics.pending} tone="blue" icon={FileClock} />
              <MiniMetric label="A confirmar" value={metrics.proposals} tone="violet" icon={Clock3} />
              <MiniMetric label="Próximos 7 días" value={metrics.week} tone="green" icon={CalendarDays} />
              {metrics.urgent > 0 && <MiniMetric label="Urgentes" value={metrics.urgent} tone="red" icon={AlertTriangle} />}
              <span style={{ flex: 1 }} />
              <WeatherStrip weather={weather} />
            </section>

            {view !== "costos" && (
              <section className="log-filters" style={{ padding: 10, borderRadius: 12, background: C.panelSolid, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: "1 1 260px" }}><Search size={14} style={{ position: "absolute", left: 11, top: 11, color: C.dim }} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar carga, obra, proveedor, recorrido o solicitante..." style={{ ...FIELD, paddingLeft: 32 }} /></div>
                <span style={{ color: C.dim, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 850 }}><Filter size={13} /> Filtros</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)} style={{ ...FIELD, width: 185 }}><option value="todos">Todos los estados</option>{Object.entries(ESTADOS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select>
                <select value={transport} onChange={(event) => setTransport(event.target.value)} style={{ ...FIELD, width: 150 }}><option value="todos">Todo transporte</option>{Object.entries(TRANSPORTES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select>
              </section>
            )}

            {error && <div style={{ padding: 13, borderRadius: 11, background: C.redL, border: `1px solid ${C.redB}`, color: C.red, fontSize: 12 }}><b>No se pudo abrir el nuevo calendario.</b><div style={{ marginTop: 4 }}>{error}</div><div style={{ marginTop: 5, color: C.muted }}>Aplicá la migración 20260803180000_calendario_logistica_operativa.sql en Supabase y reintentá.</div></div>}

            {loading ? <div style={{ padding: 50, textAlign: "center", color: C.dim }}><RefreshCw size={20} className="spin" /><div style={{ marginTop: 9, fontSize: 12 }}>Cargando logística...</div></div> : view === "calendario" ? (
              <div style={{ overflowX: "auto" }}><MonthView month={month} rows={filtered} milestones={milestones} weather={weather} onOpen={setSelected} onMonth={setMonth} /></div>
            ) : view === "costos" ? (
              <CostsView rows={rows} />
            ) : view === "solicitudes" ? (
              <div style={{ display: "grid", gap: 8 }}>{filtered.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map((row) => <MovementCard key={row.id} row={row} onOpen={setSelected} compact={isMobile} />)}{!filtered.length && <div style={{ padding: 48, textAlign: "center", color: C.dim, border: `1px dashed ${C.border2}`, borderRadius: 13 }}>No hay solicitudes con estos filtros.</div>}</div>
            ) : (
              <div style={{ display: "grid", gap: 18 }}>
                {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateRows]) => (
                  <section key={date}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ color: date === TODAY ? C.blue : C.text, fontSize: 12.5, fontWeight: 950, textTransform: "capitalize" }}>{date === TODAY ? "Hoy" : fmtDate(date, true)}</span>
                      <span style={{ flex: 1, height: 1, background: C.border }} />
                      <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 10 }}>{dateRows.movements.length + dateRows.legacy.length}</span>
                    </div>
                    <div style={{ display: "grid", gap: 7 }}>
                      {dateRows.movements.map((row) => <MovementCard key={row.id} row={row} onOpen={setSelected} compact={isMobile} />)}
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
      {selected && <DetailPanel row={selected} rows={rows} profile={profile} isManager={isManager} onClose={() => setSelected(null)} onReload={load} onEdit={() => { setRequestModal({ row: selected }); setSelected(null); }} onCoordinate={(mode) => setCoordination({ row: selected, mode })} />}
      {coordination && <CoordinationModal row={coordination.row} mode={coordination.mode} profile={profile} onClose={() => setCoordination(null)} onSaved={closeAndReload} />}
    </div>
  );
}
