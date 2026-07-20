import { C } from "@/theme";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Inbox,
  PackageCheck,
  PackagePlus,
  PackageOpen,
  Printer,
  RefreshCw,
  Search,
  Warehouse,
  X,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import {
  egresarMaterialesObra, fetchEnvios, fetchMaterialesEgreso, fetchObrasEgreso, fetchPanolCatalogMini, ingresarStockGeneral, ENVIO_ESTADO_META, ITEM_ESTADO_META, retiradoPorNombreCompletoError, resumenItems, SEDES_PANOL,
} from "@/features/panol/panolApi";
import PanolEnvioDetail from "@/features/panol/PanolEnvioDetail";
import EnviarAPanolModal from "@/features/panol/EnviarAPanolModal";
import CrearProductoTab from "@/features/panol/CrearProductoTab";
import ConsumiblesPanolTab from "@/features/panol/ConsumiblesPanolTab";
import SolicitudPanolPrintable from "@/features/panol/SolicitudPanolPrintable";
import { leerIngresosPendientes, borrarIngresoPendiente } from "@/features/panol/ingresosPendientes";
import StockWmsPanel from "@/features/panol/StockWmsPanel";
import StockPanolScreen from "@/features/panol/StockPanolScreen";
import { hasAdminAccess } from "@/lib/permissions";

const GLASS = {
  backdropFilter: "var(--glass-filter)",
  WebkitBackdropFilter: "var(--glass-filter)",
};

const STATE_FILTERS = [
  ["activos", "Por recibir"],
  ["enviado", "Enviados"],
  ["parcial", "Parciales"],
  ["recibido", "Recibidos"],
  ["todos", "Todos"],
];

const PRIO_FILTERS = [
  ["todas", "Todas"],
  ["urgente", "Urgente"],
  ["alta", "Alta"],
  ["media", "Media"],
  ["baja", "Baja"],
];
const PANOL_TAB_STORAGE_KEY = "klasea.panol.recepcion.tab";
const PANOL_TABS = new Set(["recepcion", "ingresar", "consumibles", "crear", "egresos"]);

function readStoredPanolTab() {
  if (typeof window === "undefined") return "recepcion";
  let value = window.localStorage.getItem(PANOL_TAB_STORAGE_KEY);
  if (value === "pendientes") value = "ingresar"; // migración del nombre viejo de la pestaña
  return PANOL_TABS.has(value) ? value : "recepcion";
}

const PRIO_META = {
  baja: { label: "Baja", color: C.dim },
  media: { label: "Media", color: C.blue },
  alta: { label: "Alta", color: C.amber },
  urgente: { label: "Urgente", color: C.red },
};

const SEGMENTS = [
  ["recibido", "recibidos"],
  ["parcial", "parciales"],
  ["falta_stock", "faltantes"],
  ["sin_info", "sin info"],
  ["rechazado", "rechazados"],
  ["pendiente", "pendientes"],
];

const CLOSED_ENVIO_STATES = new Set(["recibido", "cerrado", "cancelado"]);
const PRIORITY_WEIGHT = { urgente: 4, alta: 3, media: 2, baja: 1 };

function fmtFecha(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function rowSearchText(envio) {
  return [
    envio.titulo,
    envio.obra?.codigo,
    envio.destino,
    envio.sede,
    envio.prioridad,
    envio.estado,
    envio.observaciones,
  ].filter(Boolean).join(" ").toLowerCase();
}

function softBgFor(color) {
  if (color === C.blue) return C.blueL;
  if (color === C.amber) return C.amberL;
  if (color === C.green) return C.greenL;
  if (color === C.red) return C.redL;
  if (color === C.violet) return "var(--violet-soft)";
  return String(color || "").startsWith("#") ? `${color}14` : C.panel2;
}

function softBorderFor(color) {
  if (color === C.blue) return C.blueB;
  if (color === C.amber) return C.amberB;
  if (color === C.green) return C.greenB;
  if (color === C.red) return C.redB;
  if (color === C.violet) return "var(--violet-border)";
  return String(color || "").startsWith("#") ? `${color}38` : C.border;
}

function actionResumen(envio) {
  const resumen = resumenItems(envio.items || []);
  const parciales = resumen.by?.parcial || 0;
  const accion = (resumen.pendientes || 0) + parciales + (resumen.problemas || 0);
  const completoPorItems = resumen.total > 0 && accion === 0 && resumen.recibidos === resumen.total;
  return { ...resumen, parciales, accion, completoPorItems };
}

function needsReception(envio) {
  if (CLOSED_ENVIO_STATES.has(envio.estado)) return false;
  const r = actionResumen(envio);
  if (r.completoPorItems) return false;
  return r.total === 0 || r.accion > 0;
}

function compareReceptionPriority(a, b) {
  const ra = actionResumen(a);
  const rb = actionResumen(b);
  const problemDiff = (rb.problemas || 0) - (ra.problemas || 0);
  if (problemDiff) return problemDiff;
  const pendingDiff = (rb.accion || 0) - (ra.accion || 0);
  if (pendingDiff) return pendingDiff;
  const prioDiff = (PRIORITY_WEIGHT[b.prioridad] || 0) - (PRIORITY_WEIGHT[a.prioridad] || 0);
  if (prioDiff) return prioDiff;
  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
}

function iconBox(color, IconComponent) {
  const icon = IconComponent ? <IconComponent size={15} /> : null;
  return (
    <div style={{
      width: 30,
      height: 30,
      borderRadius: 9,
      display: "grid",
      placeItems: "center",
      flexShrink: 0,
      background: softBgFor(color),
      border: `1px solid ${softBorderFor(color)}`,
      color,
    }}>
      {icon}
    </div>
  );
}

function SelectFilter({ label, value, onChange, options }) {
  return (
    <label style={{ display: "grid", gap: 4, minWidth: 128 }}>
      <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: `1px solid ${C.border}`,
          background: C.panelSolid,
          color: C.text,
          padding: "8px 10px",
          borderRadius: 9,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 750,
          fontFamily: C.sans,
          outline: "none",
        }}
      >
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

function SmallButton({ children, onClick, title, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        border: `1px solid ${C.border}`,
        background: C.panelSolid,
        color: C.muted,
        borderRadius: 9,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        height: 36,
        minWidth: 36,
        display: "grid",
        placeItems: "center",
        fontSize: 12,
        fontFamily: C.sans,
      }}
    >
      {children}
    </button>
  );
}

function KpiCard({ icon: Icon, label, value, color, detail }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`,
      background: C.panelSolid,
      borderRadius: 12,
      padding: 13,
      display: "flex",
      alignItems: "center",
      gap: 10,
      minWidth: 0,
    }}>
      {iconBox(color, Icon)}
      <div style={{ minWidth: 0 }}>
        <div style={{ color, fontFamily: C.mono, fontSize: 21, lineHeight: 1, fontWeight: 850 }}>
          {value}
        </div>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 800, marginTop: 4 }}>
          {label}
        </div>
        {detail && <div style={{ color: C.dim, fontSize: 11, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail}</div>}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        background: active ? C.panelSolid : "transparent",
        color: active ? C.text : C.dim,
        borderRadius: 8,
        padding: "7px 11px",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 850,
        fontFamily: C.sans,
        boxShadow: active ? `inset 0 0 0 1px ${C.border}` : "none",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function ProgressSegments({ resumen, height = 7 }) {
  if (!resumen?.total) {
    return <div style={{ height, borderRadius: 99, background: C.panel2 }} />;
  }
  return (
    <div style={{
      height,
      borderRadius: 99,
      background: C.panel2,
      overflow: "hidden",
      display: "flex",
      border: `1px solid ${C.border}`,
    }}>
      {SEGMENTS.map(([estado]) => {
        const n = resumen.by?.[estado] || 0;
        if (!n) return null;
        const meta = ITEM_ESTADO_META[estado] || ITEM_ESTADO_META.pendiente;
        return (
          <div
            key={estado}
            title={`${meta.label}: ${n}`}
            style={{ width: `${(n / resumen.total) * 100}%`, background: meta.color, minWidth: n ? 3 : 0 }}
          />
        );
      })}
    </div>
  );
}

function StatusPill({ estado }) {
  const meta = ENVIO_ESTADO_META[estado] ?? { label: estado, color: C.dim };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      color: meta.color,
      background: `${meta.color}14`,
      border: `1px solid ${meta.color}3d`,
      borderRadius: 999,
      padding: "4px 9px",
      fontSize: 10,
      fontWeight: 850,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color }} />
      {meta.label}
    </span>
  );
}

function PriorityPill({ prioridad }) {
  const meta = PRIO_META[prioridad] ?? PRIO_META.media;
  return (
    <span style={{
      color: meta.color,
      fontSize: 11,
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

function DesktopRow({ envio, onOpen }) {
  const resumen = actionResumen(envio);
  const problemas = resumen.problemas || 0;
  const pendientes = resumen.pendientes || 0;
  const parciales = resumen.parciales || 0;
  const origen = envio.origen === "compra" ? "Compras" : "Manual";
  const pendienteTexto = [
    pendientes > 0 ? `${pendientes} pend.` : null,
    parciales > 0 ? `${parciales} parcial${parciales === 1 ? "" : "es"}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={() => onOpen(envio.id)}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1fr) 116px 116px minmax(190px, 240px) 120px 98px 34px",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        border: `1px solid ${problemas ? C.redB : C.border}`,
        background: problemas ? "var(--red-soft)" : C.panelSolid,
        borderRadius: 12,
        color: C.text,
        textAlign: "left",
        cursor: "pointer",
        fontFamily: C.sans,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{
            width: 7,
            height: 28,
            borderRadius: 99,
            background: ENVIO_ESTADO_META[envio.estado]?.color || C.dim,
            flexShrink: 0,
          }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {envio.titulo}
            </div>
            <div style={{ color: C.dim, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {envio.obra?.codigo ? `Obra ${envio.obra.codigo}` : envio.destino || "Sin obra/destino"} · pedido {origen}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <span style={{ color: C.dim, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>Sede</span>
        <span style={{ color: C.text, fontSize: 12, fontWeight: 800 }}>{envio.sede}</span>
      </div>

      <StatusPill estado={envio.estado} />

      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <ProgressSegments resumen={resumen} />
        <div style={{ display: "flex", gap: 8, color: C.dim, fontSize: 11, minWidth: 0 }}>
          <span style={{ color: C.green, fontWeight: 800 }}>{resumen.recibidos}/{resumen.total}</span>
          <span>recibidos</span>
          {pendienteTexto && <span>{pendienteTexto}</span>}
          {problemas > 0 && <span style={{ color: C.red, fontWeight: 850 }}>{problemas} problema{problemas === 1 ? "" : "s"}</span>}
        </div>
      </div>

      <PriorityPill prioridad={envio.prioridad} />

      <div style={{ color: C.dim, fontSize: 12, fontFamily: C.mono }}>{fmtFecha(envio.created_at)}</div>

      <ChevronRight size={18} style={{ color: C.dim, justifySelf: "end" }} />
    </button>
  );
}

function MobileCard({ envio, onOpen }) {
  const resumen = actionResumen(envio);
  const problemas = resumen.problemas || 0;
  const accion = resumen.accion || 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(envio.id)}
      style={{
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        background: problemas ? "var(--red-soft)" : C.panelSolid,
        border: `1px solid ${problemas ? C.redB : C.border}`,
        borderLeft: `4px solid ${ENVIO_ESTADO_META[envio.estado]?.color || C.dim}`,
        borderRadius: 12,
        padding: 13,
        display: "grid",
        gap: 10,
        fontFamily: C.sans,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 850, color: C.text, lineHeight: 1.2 }}>{envio.titulo}</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
            {envio.obra?.codigo ? `Obra ${envio.obra.codigo} · ` : ""}{envio.sede} · {fmtFecha(envio.created_at)}
          </div>
        </div>
        <StatusPill estado={envio.estado} />
      </div>
      <ProgressSegments resumen={resumen} />
      <div style={{ display: "flex", justifyContent: "space-between", color: C.dim, fontSize: 12 }}>
        <span><strong style={{ color: C.green }}>{resumen.recibidos}/{resumen.total}</strong> recibidos</span>
        {problemas > 0
          ? <span style={{ color: C.red, fontWeight: 850 }}>{problemas} problemas</span>
          : accion > 0 ? <span style={{ color: C.amber, fontWeight: 850 }}>{accion} por revisar</span> : <PriorityPill prioridad={envio.prioridad} />}
      </div>
    </button>
  );
}

const EGRESO_STATE_FILTERS = [
  ["por_egresar", "Por egresar"],
  ["egresados", "Egresados"],
  ["todos", "Todos"],
];

function egresoEstadosForFilter(filter) {
  if (filter === "egresados") return ["egresado"];
  if (filter === "todos") return ["en_panol", "recibido", "parcial", "problema", "egresado"];
  return ["en_panol", "recibido", "parcial", "problema"];
}

function materialSearchText(row) {
  return [
    row.descripcion,
    row.codigo,
    row.proveedor,
    row.rubro,
    row.categoria_nombre,
    row.categoria,
    row.estado,
    row.obra?.codigo,
    row.panol_envio?.titulo,
    row.panol_envio?.sede,
    row.panol_envio?.destino,
    row.egreso_nota,
    row.stock_sede,
    row.stock_nota,
    row.retirado_por,
    row.sector_destino,
  ].filter(Boolean).join(" ").toLowerCase();
}

function materialEstadoMeta(estado) {
  if (estado === "en_panol") return { label: "En pañol", color: C.blue, bg: C.blueL, border: C.blueB };
  if (estado === "recibido") return { label: "Recibido", color: C.green, bg: C.greenL, border: C.greenB };
  if (estado === "parcial") return { label: "Parcial", color: C.violet, bg: "var(--violet-soft)", border: "var(--violet-border)" };
  if (estado === "egresado") return { label: "Egresado", color: C.dim, bg: C.panel2, border: C.border };
  if (estado === "problema" || estado === "falta_stock" || estado === "sin_info" || estado === "rechazado") return { label: "Problema", color: C.red, bg: C.redL, border: C.redB };
  if (estado === "comprado" || estado === "pedido") return { label: "Comprado", color: C.amber, bg: C.amberL, border: C.amberB };
  return { label: "Pendiente", color: C.dim, bg: C.panel2, border: C.border };
}

function MaterialEstadoPill({ estado }) {
  const meta = materialEstadoMeta(estado);
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: meta.color,
      background: meta.bg,
      border: `1px solid ${meta.border}`,
      borderRadius: 999,
      padding: "4px 9px",
      fontSize: 10,
      fontWeight: 900,
      textTransform: "uppercase",
      letterSpacing: 0.55,
      whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

function materialCantidad(row) {
  const qty = row.cantidad ?? "";
  const unit = row.unidad || "";
  return [qty, unit].filter((v) => String(v).trim()).join(" ") || "-";
}

function numericCantidad(value) {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function materialDisponible(row) {
  const qty = numericCantidad(row?.cantidad);
  return qty != null && qty > 0 ? qty : 1;
}

function isStockGeneral(row) {
  return !row?.obra?.id && !row?.obra_id;
}

function normalizarLineaLabel(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const compact = value.toUpperCase().replace(/\s+/g, "");
  if (/^K?\d+/.test(compact)) return `K${compact.replace(/^K/, "").match(/\d+/)?.[0]}`;
  if (compact.startsWith("ANTAGO")) return "ANTAGO";
  if (compact.startsWith("H")) return "H";
  return value;
}

function lineaFromCodigo(codigo) {
  const value = String(codigo || "").trim().toUpperCase();
  const match = value.match(/^K?(\d{2,3})/);
  if (match) return `K${match[1]}`;
  if (value.startsWith("ANTAGO")) return "ANTAGO";
  if (value.startsWith("H")) return "H";
  return "";
}

function materialLineaLabel(row) {
  if (isStockGeneral(row)) return row.stock_sede ? `Stock ${row.stock_sede}` : "General";
  return normalizarLineaLabel(row.obra?.linea_nombre)
    || normalizarLineaLabel(row.obra?.modelo)
    || lineaFromCodigo(row.obra?.codigo)
    || lineaFromCodigo(row.panol_envio?.destino)
    || "Sin linea";
}

function materialLineaKey(row) {
  return materialLineaLabel(row).toLowerCase().replace(/\s+/g, "-");
}

function lineColor(index) {
  return [C.blue, C.violet, C.green, C.amber, C.teal, C.indigo][index % 6] || C.blue;
}

function materialObraKey(row) {
  if (isStockGeneral(row)) return `stock-${String(row.stock_sede || "general").toLowerCase()}`;
  return row.obra?.id || row.obra_id || "sin-obra";
}

function materialObraLabel(row) {
  if (isStockGeneral(row)) return row.stock_sede ? `Stock ${row.stock_sede}` : "Stock general";
  return row.obra?.codigo || row.panol_envio?.destino || "Sin obra";
}

function buildEgresoObraGroups(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = materialObraKey(row);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: materialObraLabel(row),
        linea: materialLineaLabel(row),
        lineaKey: materialLineaKey(row),
        rows: [],
        disponibles: 0,
        egresados: 0,
        sedes: new Set(),
        updatedAt: null,
      });
    }
    const group = map.get(key);
    group.rows.push(row);
    if (row.estado === "egresado") group.egresados += 1;
    else group.disponibles += 1;
    if (row.panol_envio?.sede || row.stock_sede) group.sedes.add(row.panol_envio?.sede || row.stock_sede);
    const ts = row.egreso_at || row.updated_at;
    if (ts && (!group.updatedAt || new Date(ts) > new Date(group.updatedAt))) group.updatedAt = ts;
  }
  return [...map.values()].sort((a, b) => {
    if (b.disponibles !== a.disponibles) return b.disponibles - a.disponibles;
    return a.label.localeCompare(b.label, "es", { numeric: true });
  });
}

function buildEgresoLineGroups(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = materialLineaKey(row);
    if (!map.has(key)) {
      map.set(key, { key, label: materialLineaLabel(row), rows: [], obras: new Set(), disponibles: 0, egresados: 0 });
    }
    const group = map.get(key);
    group.rows.push(row);
    group.obras.add(materialObraKey(row));
    if (row.estado === "egresado") group.egresados += 1;
    else group.disponibles += 1;
  }
  return [...map.values()].sort((a, b) => {
    if (b.disponibles !== a.disponibles) return b.disponibles - a.disponibles;
    return a.label.localeCompare(b.label, "es", { numeric: true });
  });
}

function EgresoObraCard({ group, onOpen, active = false, isMobile = false }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(group.key)}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(160px, 1fr) 86px 86px 24px",
        alignItems: "center",
        gap: 10,
        border: `1px solid ${active ? C.blueB : group.disponibles ? C.greenB : C.border}`,
        background: active ? C.blueL : group.disponibles ? C.greenL : C.panelSolid,
        borderRadius: 10,
        padding: "11px 12px",
        color: C.text,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: C.sans,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 950, color: C.text, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {group.label}
        </div>
        <div style={{ color: C.dim, fontSize: 11, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {group.linea} · {group.sedes.size ? [...group.sedes].join(" / ") : "Sin pañol vinculado"} · {group.rows.length} items
        </div>
      </div>
      <div>
        <div style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8 }}>Pañol</div>
        <div style={{ color: C.green, fontFamily: C.mono, fontSize: 17, fontWeight: 900 }}>{group.disponibles}</div>
      </div>
      <div>
        <div style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8 }}>Egr.</div>
        <div style={{ color: C.text, fontFamily: C.mono, fontSize: 17, fontWeight: 900 }}>{group.egresados}</div>
      </div>
      <ChevronRight size={18} style={{ color: C.dim, justifySelf: isMobile ? "start" : "end" }} />
    </button>
  );
}

function EgresoLineButton({ group, active, color, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "8px 1fr auto",
        alignItems: "center",
        gap: 9,
        border: `1px solid ${active ? `${color}66` : C.border}`,
        background: active ? softBgFor(color) : C.panelSolid,
        borderRadius: 10,
        padding: "9px 10px",
        color: active ? C.text : C.muted,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: C.sans,
      }}
    >
      <span style={{ width: 7, height: 26, borderRadius: 99, background: color }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</span>
        <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 2 }}>{group.obras.size} obras</span>
      </span>
      <span style={{ display: "grid", justifyItems: "end", gap: 1 }}>
        <span style={{ color: C.green, fontFamily: C.mono, fontSize: 15, fontWeight: 900 }}>{group.disponibles}</span>
        <span style={{ color: C.dim, fontSize: 10, fontWeight: 850 }}>pañol</span>
      </span>
    </button>
  );
}

function EgresoMaterialRow({ row, selected, canSelect, onToggle, onEgresar, busy, isMobile }) {
  const disabled = !canSelect || busy;
  const content = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {canSelect ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(row.id)}
            disabled={disabled}
            style={{ width: 15, height: 15, cursor: disabled ? "default" : "pointer", flexShrink: 0 }}
          />
        ) : <span style={{ width: 15, flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flexWrap: "wrap" }}>
            <span style={{ color: C.text, fontSize: 13.5, fontWeight: 900, lineHeight: 1.25 }}>{row.descripcion}</span>
            <MaterialEstadoPill estado={row.estado} />
          </div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.codigo || "sin código"}{row.proveedor ? ` · ${row.proveedor}` : ""}{row.rubro ? ` · ${row.rubro}` : ""}
          </div>
        </div>
      </div>

      {isMobile && <div style={{ display: "grid", gap: 3 }}>
        <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8 }}>Cantidad</span>
      </div>}
      <span style={{ color: C.text, fontFamily: C.mono, fontSize: 12, fontWeight: 900 }}>{materialCantidad(row)}</span>

      <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
        {isMobile && <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8 }}>Obra</span>}
        <span style={{ color: C.text, fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {materialObraLabel(row)}
        </span>
      </div>

      <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
        {isMobile && <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8 }}>Pañol</span>}
        <span style={{ color: C.text, fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.panol_envio?.sede || row.stock_sede || "-"}{row.panol_envio?.titulo ? ` · ${row.panol_envio.titulo}` : row.stock_nota ? ` · ${row.stock_nota}` : ""}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
        {canSelect ? (
          <button
            type="button"
            onClick={() => onEgresar([row.id])}
            disabled={disabled}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              border: `1px solid ${C.greenB}`,
              background: C.greenL,
              color: C.green,
              borderRadius: 9,
              padding: "8px 10px",
              cursor: disabled ? "default" : "pointer",
              opacity: disabled ? 0.55 : 1,
              fontSize: 12,
              fontWeight: 900,
              fontFamily: C.sans,
              whiteSpace: "nowrap",
            }}
          >
            <ArrowUpRight size={14} />
            Egresar
          </button>
        ) : (
          <span style={{ color: C.dim, fontSize: 12, fontFamily: C.mono }}>{fmtFecha(row.egreso_at || row.updated_at)}</span>
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: 12, display: "grid", gap: 11 }}>
        {content}
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(280px, 1fr) 112px 130px minmax(190px, 260px) 110px",
      alignItems: "center",
      gap: 12,
      borderBottom: `1px solid ${C.border}`,
      background: selected ? C.blueL : "transparent",
      padding: "6px 14px",
    }}>
      {content}
    </div>
  );
}

function StockGeneralModal({ open, onClose, onDone, sedeLocked, isMobile, toast, egresoRapido = false, obras = [] }) {
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(null);
  const [cantidad, setCantidad] = useState("1");
  const [sede, setSede] = useState(sedeLocked || "Pampa");
  const [nota, setNota] = useState("");
  const [retiradoPor, setRetiradoPor] = useState("");
  const [sectorDestino, setSectorDestino] = useState("");
  const [destinoObraId, setDestinoObraId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const obrasActivas = obras.filter((obra) => !["terminada", "cancelada", "archivada"].includes(obra.estado));

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await fetchPanolCatalogMini({ q, limit: 80 });
        if (alive) setCatalog(rows);
      } catch {
        if (alive) setCatalog([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setCatalog([]);
    setSelected(null);
    setCantidad("1");
    setSede(sedeLocked || "Pampa");
    setNota("");
    setRetiradoPor("");
    setSectorDestino("");
    setDestinoObraId("");
  }, [open, sedeLocked]);

  if (!open) return null;
  const retiradoError = egresoRapido ? retiradoPorNombreCompletoError(retiradoPor) : "";

  async function submit() {
    if (!selected) {
      toast.warning("Elegí un material.");
      return;
    }
    if (egresoRapido && retiradoError) {
      toast.warning(retiradoError);
      return;
    }
    setSaving(true);
    try {
      const snapshotId = await ingresarStockGeneral({ material: selected, cantidad, sede: sedeLocked || sede, nota });
      if (egresoRapido) {
        await egresarMaterialesObra([snapshotId], {
          nota,
          retiradoPor,
          sectorDestino,
          destinoObraId,
          cantidades: { [snapshotId]: cantidad },
        });
      }
      toast.success(egresoRapido ? "Egreso rapido registrado." : "Stock general ingresado.");
      onDone?.();
      onClose();
    } catch (error) {
      toast.error(error.message || "No se pudo ingresar el stock.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.58)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ position: "relative", width: "100%", maxWidth: 660, maxHeight: "86vh", overflow: "hidden", background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: "0 24px 48px rgba(0,0,0,0.4)", display: "grid", gridTemplateRows: "auto 1fr auto" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, background: C.bg2, display: "flex", alignItems: "center", gap: 10 }}>
          <PackagePlus size={18} style={{ color: C.blue }} />
          <div style={{ color: C.text, fontSize: 17, fontWeight: 950 }}>{egresoRapido ? "Egreso rapido" : "Ingreso a stock general"}</div>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={20} /></button>
        </div>

        <div style={{ padding: 18, overflowY: "auto", display: "grid", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material del catalogo" style={{ width: "100%", boxSizing: "border-box", background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, padding: "10px 36px", borderRadius: 10, fontSize: 13, fontFamily: C.sans, outline: "none" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 180px", gap: 12 }}>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: C.panel }}>
              <div style={{ maxHeight: 280, overflowY: "auto", display: "grid", gap: 0 }}>
                {loading ? (
                  <div style={{ color: C.dim, padding: 22, textAlign: "center", fontSize: 12, fontWeight: 850 }}>Cargando...</div>
                ) : catalog.length ? catalog.map((mat) => {
                  const active = selected?.id === mat.id;
                  return (
                    <button key={mat.id} type="button" onClick={() => { setSelected(mat); setQ(mat.descripcion); }} style={{ border: "none", borderBottom: `1px solid ${C.border}`, background: active ? C.blueL : "transparent", color: C.text, padding: "10px 12px", cursor: "pointer", textAlign: "left", fontFamily: C.sans }}>
                      <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mat.descripcion}</div>
                      <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>{mat.codigo || "sin codigo"}{mat.proveedor ? ` · ${mat.proveedor}` : ""}</div>
                    </button>
                  );
                }) : (
                  <div style={{ color: C.dim, padding: 24, textAlign: "center", fontSize: 13 }}>Sin resultados</div>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
              <label style={{ display: "grid", gap: 5 }}>
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase" }}>Cantidad</span>
                <input type="number" step="any" min="0.01" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: "10px 11px", fontSize: 13, fontFamily: C.mono, outline: "none" }} />
              </label>
              {!sedeLocked && (
                <label style={{ display: "grid", gap: 5 }}>
                  <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase" }}>Sede</span>
                  <select value={sede} onChange={(e) => setSede(e.target.value)} style={{ background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: "10px 11px", fontSize: 13, fontFamily: C.sans, outline: "none" }}>
                    {SEDES_PANOL.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              )}
              <label style={{ display: "grid", gap: 5 }}>
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase" }}>Nota</span>
                <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={4} placeholder="Remito, proveedor, ubicacion..." style={{ background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: "10px 11px", fontSize: 13, fontFamily: C.sans, outline: "none", resize: "vertical" }} />
              </label>
              {egresoRapido && (
                <>
                  <label style={{ display: "grid", gap: 5 }}>
                    <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase" }}>Retirado por</span>
                    <input value={retiradoPor} onChange={(e) => setRetiradoPor(e.target.value)} placeholder="Nombre y apellido de quien retira" style={{ background: C.panelSolid, border: `1px solid ${retiradoError && retiradoPor.trim() ? C.redB : C.border}`, color: C.text, borderRadius: 10, padding: "10px 11px", fontSize: 13, fontFamily: C.sans, outline: "none" }} />
                    {retiradoError && <span style={{ color: C.amber, fontSize: 10.5, lineHeight: 1.3 }}>Obligatorio: nombre y apellido.</span>}
                  </label>
                  <label style={{ display: "grid", gap: 5 }}>
                    <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase" }}>Destino</span>
                    <input value={sectorDestino} onChange={(e) => setSectorDestino(e.target.value)} placeholder="Sector / uso" style={{ background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: "10px 11px", fontSize: 13, fontFamily: C.sans, outline: "none" }} />
                  </label>
                  <label style={{ display: "grid", gap: 5 }}>
                    <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase" }}>Obra destino</span>
                    <select value={destinoObraId} onChange={(e) => setDestinoObraId(e.target.value)} style={{ background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: "10px 11px", fontSize: 13, fontFamily: C.sans, outline: "none" }}>
                      <option value="">Sin obra</option>
                      {obrasActivas.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.border}`, background: C.bg2, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ border: `1px solid ${C.border}`, background: C.bg1, color: C.text, borderRadius: 10, padding: "9px 13px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, fontWeight: 850, fontFamily: C.sans }}>Cancelar</button>
          <button type="button" onClick={submit} disabled={saving || !selected} style={{ border: `1px solid ${C.blueB}`, background: selected ? C.blueL : C.panel2, color: selected ? C.blue : C.dim, borderRadius: 10, padding: "9px 13px", cursor: saving || !selected ? "default" : "pointer", opacity: saving ? 0.7 : 1, fontWeight: 950, fontFamily: C.sans }}>
            {saving ? "Guardando..." : egresoRapido ? "Registrar egreso" : "Ingresar stock"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EgresoModalV2({
  isOpen,
  onClose,
  onConfirm,
  busy,
  nota,
  setNota,
  retiradoPor,
  setRetiradoPor,
  sectorDestino,
  setSectorDestino,
  destinoObraId,
  setDestinoObraId,
  cantidadesEgreso,
  setCantidadEgreso,
  targetRows,
  obras,
  count,
}) {
  if (!isOpen) return null;
  const retiradoError = retiradoPorNombreCompletoError(retiradoPor);
  const obrasActivas = obras.filter((obra) => !["terminada", "cancelada", "archivada"].includes(obra.estado));
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ position: "relative", background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 620, overflow: "hidden", boxShadow: "0 24px 48px rgba(0,0,0,0.4)" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, background: C.bg2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.text, fontFamily: C.sans }}>Confirmar egreso</div>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={20} /></button>
        </div>
        <div style={{ padding: 24, display: "grid", gap: 16, maxHeight: "68vh", overflowY: "auto" }}>
          <div style={{ color: C.text, fontSize: 14, fontFamily: C.sans, opacity: 0.9 }}>
            Vas a egresar <strong style={{ color: C.text, fontWeight: 900 }}>{count}</strong> material{count === 1 ? "" : "es"}.
          </div>

          <div style={{ border: `1px solid ${C.border}`, background: C.bg, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "9px 12px", color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1, borderBottom: `1px solid ${C.border}` }}>Cantidades</div>
            <div style={{ display: "grid" }}>
              {targetRows.map((row) => {
                const available = materialDisponible(row);
                const canPartial = available > 1;
                return (
                  <div key={row.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 96px", gap: 10, alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.text, fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descripcion}</div>
                      <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{materialObraLabel(row)} · disponible {materialCantidad(row)}</div>
                    </div>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      max={available}
                      value={cantidadesEgreso[row.id] ?? available}
                      onChange={(e) => setCantidadEgreso(row.id, e.target.value)}
                      disabled={!canPartial || busy}
                      title={canPartial ? "Cantidad a egresar" : "Cantidad completa"}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        border: `1px solid ${C.border}`,
                        background: canPartial ? C.panelSolid : C.panel2,
                        color: C.text,
                        borderRadius: 9,
                        padding: "8px 9px",
                        fontSize: 12,
                        fontFamily: C.mono,
                        outline: "none",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 1, fontFamily: C.sans }}>Retirado por</span>
            <input value={retiradoPor} onChange={(e) => setRetiradoPor(e.target.value)} placeholder="Nombre y apellido de quien retira" style={{ background: C.bg, border: `1px solid ${retiradoError && retiradoPor.trim() ? C.redB : C.border2}`, color: C.text, padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none", fontFamily: C.sans }} />
            {retiradoError && <span style={{ color: C.amber, fontSize: 11, lineHeight: 1.3 }}>Obligatorio: nombre y apellido, no solo DNI ni un apellido.</span>}
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 1, fontFamily: C.sans }}>Sector / destino</span>
            <input value={sectorDestino} onChange={(e) => setSectorDestino(e.target.value)} placeholder="Ej: carpinteria, obra en sitio" style={{ background: C.bg, border: `1px solid ${C.border2}`, color: C.text, padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none", fontFamily: C.sans }} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 1, fontFamily: C.sans }}>Reasignar a obra</span>
            <select value={destinoObraId} onChange={(e) => setDestinoObraId(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border2}`, color: C.text, padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none", fontFamily: C.sans }}>
              <option value="">Mantener obra / stock</option>
              {obrasActivas.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 1, fontFamily: C.sans }}>Observaciones</span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota opcional" style={{ background: C.bg, border: `1px solid ${C.border2}`, color: C.text, padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none", fontFamily: C.sans }} />
          </label>
        </div>
        <div style={{ padding: "16px 24px", background: C.bg2, borderTop: `1px solid ${C.border}`, display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg1, color: C.text, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: C.sans }}>Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={busy} style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, fontWeight: 900, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, display: "flex", alignItems: "center", gap: 8, fontFamily: C.sans }}>
            <ArrowUpRight size={16} />
            {busy ? "Procesando..." : "Confirmar egreso"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EgresosWorkspace({
  isMobile,
  loading,
  lineGroups,
  allLineGroup,
  fLinea,
  setFLinea,
  obraGroups,
  selectedObraKey,
  selectedGroup,
  openObra,
  visibles,
  selected,
  canReceive,
  toggle,
  toggleAll,
  allSelected,
  selectableIds,
  selectedIds,
  openEgresoModal,
  busy,
  clearObra,
}) {
  const panel = {
    minHeight: 0,
    border: `1px solid ${C.border}`,
    background: C.panel,
    borderRadius: 12,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };
  const panelHead = {
    padding: "12px 13px",
    borderBottom: `1px solid ${C.border}`,
    background: C.panelSolid,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  };
  const title = { color: C.text, fontSize: 13, fontWeight: 950 };
  const sub = { color: C.dim, fontSize: 11, marginTop: 2 };

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
      padding: isMobile ? 12 : "14px 18px 18px",
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "180px 240px minmax(420px, 1fr)",
      gap: 12,
    }}>
      <section style={panel}>
        <div style={panelHead}>
          <div>
            <div style={title}>Líneas</div>
            <div style={sub}>{allLineGroup.obras.size} obras con movimiento</div>
          </div>
        </div>
        <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
          <EgresoLineButton group={allLineGroup} active={fLinea === "todas"} color={C.blue} onClick={() => setFLinea("todas")} />
          {lineGroups.map((group, index) => (
            <EgresoLineButton
              key={group.key}
              group={group}
              active={fLinea === group.key}
              color={lineColor(index + 1)}
              onClick={() => setFLinea(group.key)}
            />
          ))}
        </div>
      </section>

      <section style={panel}>
        <div style={panelHead}>
          <div>
            <div style={title}>Obras</div>
            <div style={sub}>{obraGroups.length} visibles · ordenadas por pendientes</div>
          </div>
          {selectedObraKey && (
            <button type="button" onClick={clearObra} title="Limpiar selección" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", display: "flex", padding: 4 }}>
              <X size={18} />
            </button>
          )}
        </div>
        <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 22, color: C.dim, textAlign: "center", fontSize: 12, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>
              Cargando...
            </div>
          ) : obraGroups.length === 0 ? (
            <div style={{ padding: 26, border: `1px dashed ${C.border2}`, borderRadius: 10, color: C.dim, textAlign: "center", fontSize: 13 }}>
              No hay obras para estos filtros.
            </div>
          ) : (
            obraGroups.map((group) => (
              <EgresoObraCard
                key={group.key}
                group={group}
                active={selectedObraKey === group.key}
                onOpen={openObra}
                isMobile={isMobile}
              />
            ))
          )}
        </div>
      </section>

      <section style={panel}>
        <div style={panelHead}>
          {selectedGroup ? (
            <>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ color: C.text, fontSize: 17, fontWeight: 950, fontFamily: C.mono }}>{selectedGroup.label}</div>
                  <span style={{ color: C.violet, background: "var(--violet-soft)", border: "1px solid var(--violet-border)", borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 900 }}>
                    {selectedGroup.linea}
                  </span>
                </div>
                <div style={sub}>
                  {selectedGroup.disponibles} en pañol · {selectedGroup.egresados} egresados · {selectedGroup.rows.length} items
                </div>
              </div>
              <button type="button" onClick={clearObra} style={{ border: `1px solid ${C.border}`, background: C.panelSolid2, color: C.muted, borderRadius: 8, padding: "7px 9px", cursor: "pointer", fontSize: 12, fontWeight: 850, fontFamily: C.sans }}>
                Obras
              </button>
            </>
          ) : (
            <div>
              <div style={title}>Detalle de egreso</div>
              <div style={sub}>Elegí una obra para ver sus items recepcionados.</div>
            </div>
          )}
        </div>

        {selectedGroup ? (
          <>
            {canReceive && (
              <div style={{ borderBottom: `1px solid ${C.border}`, padding: 12, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", background: C.panelSolid2 }}>
                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={!selectableIds.length || busy}
                  style={{
                    border: `1px solid ${allSelected ? C.greenB : C.border}`,
                    background: allSelected ? C.greenL : C.panelSolid,
                    color: allSelected ? C.green : C.muted,
                    borderRadius: 10,
                    padding: "9px 12px",
                    cursor: !selectableIds.length || busy ? "default" : "pointer",
                    opacity: !selectableIds.length || busy ? 0.55 : 1,
                    fontSize: 12,
                    fontWeight: 850,
                    fontFamily: C.sans,
                    transition: "all 0.2s",
                  }}
                >
                  {allSelected ? "Quitar selección" : "Seleccionar todos"}
                </button>
                <button
                  type="button"
                  onClick={() => openEgresoModal(selectedIds)}
                  disabled={!selectedIds.length || busy}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    border: `1px solid ${C.greenB}`,
                    background: C.greenL,
                    color: C.green,
                    borderRadius: 10,
                    padding: "9px 14px",
                    cursor: !selectedIds.length || busy ? "default" : "pointer",
                    opacity: !selectedIds.length || busy ? 0.55 : 1,
                    fontSize: 13,
                    fontWeight: 900,
                    fontFamily: C.sans,
                    whiteSpace: "nowrap",
                    transition: "all 0.2s",
                  }}
                >
                  <ArrowUpRight size={16} />
                  Egresar {selectedIds.length || ""}
                </button>
              </div>
            )}
            {!isMobile && (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(230px, 1fr) 86px 112px minmax(150px, 210px) 96px", gap: 10, padding: "9px 14px", color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, background: C.bg1 }}>
                <span>Material</span>
                <span>Cantidad</span>
                <span>Obra</span>
                <span>Pañol</span>
                <span />
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {visibles.length === 0 ? (
                <div style={{ padding: 30, border: `1px dashed ${C.border2}`, borderRadius: 10, color: C.dim, textAlign: "center", fontSize: 13 }}>
                  No hay materiales para esta obra.
                </div>
              ) : (
                visibles.map((row) => (
                  <EgresoMaterialRow
                    key={row.id}
                    row={row}
                    selected={selected.has(row.id)}
                    canSelect={canReceive && row.estado !== "egresado"}
                    onToggle={toggle}
                    onEgresar={openEgresoModal}
                    busy={busy}
                    isMobile={isMobile}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, minHeight: 220, display: "grid", placeItems: "center", padding: 18 }}>
            <div style={{ maxWidth: 360, textAlign: "center", color: C.dim }}>
              <PackageCheck size={34} style={{ color: C.blue, marginBottom: 10 }} />
              <div style={{ color: C.text, fontSize: 16, fontWeight: 900 }}>Seleccioná una obra</div>
              <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>
                Primero filtrá por línea de producción y después entrá a la obra para egresar solo sus items en pañol.
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function EgresosMaterialesPanel({ sedeLocked, canReceive, isMobile, toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fSede, setFSede] = useState(sedeLocked || "todas");
  const [fEstado, setFEstado] = useState("por_egresar");
  const [fLinea, setFLinea] = useState("todas");
  const [selectedObraKey, setSelectedObraKey] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [obras, setObras] = useState([]);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  
  const [fRubro, setFRubro] = useState("todos");
  const [fProveedor, setFProveedor] = useState("todos");

  // Modal y campos nuevos
  const [egresoModalOpen, setEgresoModalOpen] = useState(false);
  const [egresoTargetIds, setEgresoTargetIds] = useState([]);
  const [nota, setNota] = useState("");
  const [retiradoPor, setRetiradoPor] = useState("");
  const [sectorDestino, setSectorDestino] = useState("");
  const [destinoObraId, setDestinoObraId] = useState("");
  const [cantidadesEgreso, setCantidadesEgreso] = useState({});
  
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const sede = sedeLocked || (fSede !== "todas" ? fSede : null);
      const estados = egresoEstadosForFilter(fEstado);
      setRows(await fetchMaterialesEgreso({ sede, estados }));
    } catch (e) {
      toast.error(e.message || "No se pudieron cargar los materiales.");
    } finally {
      setLoading(false);
    }
  }, [fEstado, fSede, sedeLocked, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    fetchObrasEgreso()
      .then(setObras)
      .catch(() => setObras([]));
  }, []);

  useEffect(() => {
    setSelectedObraKey(null);
    setSelected(new Set());
  }, [fEstado, fSede, fLinea, sedeLocked]);

  const rubros = useMemo(() => {
    const s = new Set();
    for (const r of rows) if (r.rubro) s.add(r.rubro);
    return ["todos", ...[...s].sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const proveedores = useMemo(() => {
    const s = new Set();
    for (const r of rows) if (r.proveedor) s.add(r.proveedor);
    return ["todos", ...[...s].sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const searchedRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let filtered = rows;
    if (term) filtered = filtered.filter((row) => materialSearchText(row).includes(term));
    if (fRubro !== "todos") filtered = filtered.filter((r) => r.rubro === fRubro);
    if (fProveedor !== "todos") filtered = filtered.filter((r) => r.proveedor === fProveedor);
    
    return [...filtered].sort((a, b) => {
      if (a.estado === "egresado" && b.estado !== "egresado") return 1;
      if (a.estado !== "egresado" && b.estado === "egresado") return -1;
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });
  }, [rows, q, fRubro, fProveedor]);

  const lineGroups = useMemo(() => buildEgresoLineGroups(searchedRows), [searchedRows]);
  const allLineGroup = useMemo(() => {
    const obras = new Set();
    let disponibles = 0;
    let egresados = 0;
    for (const row of searchedRows) {
      obras.add(materialObraKey(row));
      if (row.estado === "egresado") egresados += 1;
      else disponibles += 1;
    }
    return { key: "todas", label: "Todas", obras, disponibles, egresados };
  }, [searchedRows]);
  const lineFilteredRows = useMemo(
    () => (fLinea === "todas" ? searchedRows : searchedRows.filter((row) => materialLineaKey(row) === fLinea)),
    [searchedRows, fLinea],
  );
  const obraGroups = useMemo(() => buildEgresoObraGroups(lineFilteredRows), [lineFilteredRows]);
  const selectedGroup = useMemo(
    () => obraGroups.find((group) => group.key === selectedObraKey) || null,
    [obraGroups, selectedObraKey],
  );
  const visibles = useMemo(() => selectedGroup?.rows ?? [], [selectedGroup]);

  useEffect(() => {
    if (fLinea !== "todas" && !lineGroups.some((group) => group.key === fLinea)) {
      setFLinea("todas");
      setSelectedObraKey(null);
    }
  }, [fLinea, lineGroups]);

  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(visibles.filter((row) => row.estado !== "egresado").map((row) => row.id));
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibles]);

  const selectableIds = useMemo(
    () => visibles.filter((row) => row.estado !== "egresado").map((row) => row.id),
    [visibles],
  );
  const selectedIds = useMemo(() => [...selected].filter((id) => selectableIds.includes(id)), [selected, selectableIds]);
  const egresoTargetRows = useMemo(
    () => rows.filter((row) => egresoTargetIds.includes(row.id)),
    [rows, egresoTargetIds],
  );
  const allSelected = selectableIds.length > 0 && selectedIds.length === selectableIds.length;

  const setCantidadEgreso = useCallback((id, value) => {
    setCantidadesEgreso((prev) => ({ ...prev, [id]: value }));
  }, []);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const openObra = (key) => {
    setSelectedObraKey(key);
    setSelected(new Set());
    setNota("");
    setDestinoObraId("");
    setCantidadesEgreso({});
  };

  const openEgresoModal = (ids) => {
    const clean = ids.filter(Boolean);
    const defaults = {};
    for (const row of rows) {
      if (clean.includes(row.id)) defaults[row.id] = String(materialDisponible(row));
    }
    setEgresoTargetIds(clean);
    setCantidadesEgreso(defaults);
    setDestinoObraId("");
    setEgresoModalOpen(true);
  };

  const confirmEgreso = async () => {
    const clean = egresoTargetIds.filter(Boolean);
    if (!clean.length || !canReceive) return;
    const retiradoError = retiradoPorNombreCompletoError(retiradoPor);
    if (retiradoError) {
      toast.warning(retiradoError);
      return;
    }
    setBusy(true);
    try {
      const cantidades = Object.fromEntries(
        Object.entries(cantidadesEgreso)
          .filter(([id]) => clean.includes(id))
          .map(([id, value]) => [id, String(value || "").trim()]),
      );
      const count = await egresarMaterialesObra(clean, { nota, retiradoPor, sectorDestino, destinoObraId, cantidades });
      toast.success(`${count || clean.length} item${(count || clean.length) === 1 ? "" : "s"} egresado${(count || clean.length) === 1 ? "" : "s"}.`);
      setSelected(new Set());
      setNota("");
      setRetiradoPor("");
      setSectorDestino("");
      setDestinoObraId("");
      setCantidadesEgreso({});
      setEgresoModalOpen(false);
      await cargar();
    } catch (e) {
      toast.error(e.message || "No se pudo egresar el material.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{
        background: C.topbarSoft,
        ...GLASS,
        borderBottom: `1px solid ${C.border}`,
        padding: isMobile ? "10px 12px" : "10px 18px",
        display: "grid",
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 260px", minWidth: isMobile ? "100%" : 260 }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar obra, material, proveedor, pañol..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: C.panelSolid,
                border: `1px solid ${C.border}`,
                color: C.text,
                padding: "9px 34px",
                borderRadius: 10,
                fontSize: 13,
                fontFamily: C.sans,
                outline: "none",
              }}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                title="Limpiar"
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: C.dim,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  padding: 4,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <SelectFilter label="Estado" value={fEstado} onChange={setFEstado} options={EGRESO_STATE_FILTERS} />
          <SelectFilter label="Rubro" value={fRubro} onChange={setFRubro} options={rubros.map(r => [r, r === "todos" ? "Todos" : r])} />
          <SelectFilter label="Proveedor" value={fProveedor} onChange={setFProveedor} options={proveedores.map(p => [p, p === "todos" ? "Todos" : p])} />
          {!sedeLocked && (
            <SelectFilter label="Sede" value={fSede} onChange={setFSede} options={[["todas", "Todas"], ...SEDES_PANOL.map((s) => [s, s])]} />
          )}
          {canReceive && (
            <button
              type="button"
              onClick={() => setStockModalOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                border: `1px solid ${C.blueB}`,
                background: C.blueL,
                color: C.blue,
                borderRadius: 10,
                padding: "9px 12px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 900,
                fontFamily: C.sans,
                whiteSpace: "nowrap",
              }}
            >
              <PackagePlus size={15} />
              Egreso rapido
            </button>
          )}
          <SmallButton onClick={cargar} disabled={loading} title="Actualizar egresos">
            <RefreshCw size={15} />
          </SmallButton>
        </div>
      </div>

      <EgresosWorkspace
        isMobile={isMobile}
        loading={loading}
        lineGroups={lineGroups}
        allLineGroup={allLineGroup}
        fLinea={fLinea}
        setFLinea={setFLinea}
        obraGroups={obraGroups}
        selectedObraKey={selectedObraKey}
        selectedGroup={selectedGroup}
        openObra={openObra}
        visibles={visibles}
        selected={selected}
        canReceive={canReceive}
        toggle={toggle}
        toggleAll={toggleAll}
        allSelected={allSelected}
        selectableIds={selectableIds}
        selectedIds={selectedIds}
        openEgresoModal={openEgresoModal}
        busy={busy}
        clearObra={() => { setSelectedObraKey(null); setSelected(new Set()); }}
      />

      <EgresoModalV2
        isOpen={egresoModalOpen}
        onClose={() => setEgresoModalOpen(false)}
        onConfirm={confirmEgreso}
        busy={busy}
        nota={nota}
        setNota={setNota}
        retiradoPor={retiradoPor}
        setRetiradoPor={setRetiradoPor}
        sectorDestino={sectorDestino}
        setSectorDestino={setSectorDestino}
        destinoObraId={destinoObraId}
        setDestinoObraId={setDestinoObraId}
        cantidadesEgreso={cantidadesEgreso}
        setCantidadEgreso={setCantidadEgreso}
        targetRows={egresoTargetRows}
        obras={obras}
        count={egresoTargetIds.length}
      />
      <StockGeneralModal
        open={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
        onDone={cargar}
        sedeLocked={sedeLocked}
        isMobile={isMobile}
        toast={toast}
        egresoRapido
        obras={obras}
      />
    </>
  );
}

const STOCK_REAL_ESTADOS = ["en_panol", "recibido", "parcial"];

function normalizeStockKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, " ")
    .trim();
}

function stockMaterialKey(row) {
  return row.material_id || normalizeStockKey([row.codigo, row.descripcion].filter(Boolean).join(" ")) || row.id;
}

function isStockDisponible(row) {
  return STOCK_REAL_ESTADOS.includes(row.estado);
}

function stockCategoriaLabel(row) {
  return row.categoria_nombre || row.categoria || "";
}

function filterOptions(rows = [], getLabel) {
  const values = new Set();
  for (const row of rows) {
    const label = String(getLabel(row) || "").trim();
    if (label) values.add(label);
  }
  return [["todos", "Todos"], ...[...values].sort((a, b) => a.localeCompare(b, "es", { numeric: true })).map((label) => [label, label])];
}

function buildStockMaterialGroups(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = stockMaterialKey(row);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: row.descripcion || "(sin descripcion)",
        codigo: row.codigo || "",
        proveedor: row.proveedor || "",
        rows: [],
        obras: new Set(),
        obraLabels: new Set(),
        lineas: new Set(),
        sedes: new Set(),
        unidades: new Set(),
        rubros: new Set(),
        categorias: new Set(),
        disponibles: 0,
        faltantes: 0,
        egresados: 0,
        cantidadDisponible: 0,
        updatedAt: null,
      });
    }
    const group = map.get(key);
    group.rows.push(row);
    group.obras.add(materialObraKey(row));
    group.obraLabels.add(materialObraLabel(row));
    group.lineas.add(materialLineaLabel(row));
    if (row.panol_envio?.sede || row.stock_sede) group.sedes.add(row.panol_envio?.sede || row.stock_sede);
    if (row.unidad) group.unidades.add(row.unidad);
    if (row.rubro) group.rubros.add(row.rubro);
    if (stockCategoriaLabel(row)) group.categorias.add(stockCategoriaLabel(row));
    if (isStockDisponible(row)) {
      group.disponibles += 1;
      group.cantidadDisponible += numericCantidad(row.cantidad) ?? 1;
    }
    const ts = row.egreso_at || row.recepcion_updated_at || row.updated_at || row.created_at;
    if (ts && (!group.updatedAt || new Date(ts) > new Date(group.updatedAt))) group.updatedAt = ts;
  }
  return [...map.values()].sort((a, b) => {
    if (b.disponibles !== a.disponibles) return b.disponibles - a.disponibles;
    if (b.faltantes !== a.faltantes) return b.faltantes - a.faltantes;
    return a.label.localeCompare(b.label, "es", { numeric: true });
  });
}

function stockDisponibleLabel(group) {
  if (group.unidades.size === 1) {
    const unit = [...group.unidades][0];
    return `${Number(group.cantidadDisponible.toFixed(2))} ${unit}`;
  }
  return `${group.disponibles} mov.`;
}

function StockMaterialGroupCard({ group, active, onOpen, isMobile }) {
  const tags = [...group.categorias, ...group.rubros].slice(0, 2).join(" · ");
  const destinos = [...group.obraLabels].slice(0, 3).join(" · ");
  const sedes = [...group.sedes].join(" / ") || "-";
  return (
    <button
      type="button"
      onClick={() => onOpen(group.key)}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 108px 108px 24px",
        gap: 10,
        alignItems: "center",
        border: `1px solid ${active ? C.blueB : group.disponibles ? C.greenB : C.border}`,
        background: active ? C.blueL : C.panelSolid,
        borderRadius: 10,
        padding: "11px 12px",
        color: C.text,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: C.sans,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13.5, fontWeight: 950, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {group.label}
        </div>
        <div style={{ color: C.dim, fontSize: 11, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {group.codigo || "sin codigo"}{group.proveedor ? ` · ${group.proveedor}` : ""}{tags ? ` · ${tags}` : ""}
        </div>
        <div style={{ color: C.t1, fontSize: 11.5, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {destinos || "Sin asignacion"}{group.obras.size > 3 ? ` · +${group.obras.size - 3}` : ""}
        </div>
      </div>
      <div>
        <div style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 0.8, textTransform: "uppercase" }}>Stock</div>
        <div style={{ color: group.disponibles ? C.green : C.dim, fontFamily: C.mono, fontSize: 14, fontWeight: 950 }}>{stockDisponibleLabel(group)}</div>
      </div>
      <div>
        <div style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 0.8, textTransform: "uppercase" }}>Sede</div>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sedes}</div>
      </div>
      <ChevronRight size={18} style={{ color: C.dim, justifySelf: isMobile ? "start" : "end" }} />
    </button>
  );
}

function StockAssignmentRow({ row, isMobile }) {
  const source = row.panol_envio?.titulo || row.stock_nota || row.notas || "";
  const tags = [stockCategoriaLabel(row), row.rubro].filter(Boolean).join(" · ");
  const side = (
    <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
      {isMobile && <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8 }}>Origen</span>}
      <span style={{ color: C.text, fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {row.panol_envio?.sede || row.stock_sede || "-"}{source ? ` · ${source}` : ""}
      </span>
    </div>
  );

  const content = (
    <>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {materialObraLabel(row)}
        </div>
        <div style={{ color: C.dim, fontSize: 11, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {materialLineaLabel(row)}{tags ? ` · ${tags}` : ""}{row.retirado_por ? ` · retiro ${row.retirado_por}` : ""}
        </div>
      </div>
      <MaterialEstadoPill estado={row.estado} />
      <span style={{ color: C.text, fontFamily: C.mono, fontSize: 12, fontWeight: 900 }}>{materialCantidad(row)}</span>
      {side}
      <span style={{ color: C.dim, fontSize: 12, fontFamily: C.mono, textAlign: isMobile ? "left" : "right" }}>{fmtFecha(row.egreso_at || row.updated_at)}</span>
    </>
  );

  if (isMobile) {
    return (
      <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        {content}
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(160px, 1fr) 106px 92px minmax(170px, 240px) 78px",
      gap: 12,
      alignItems: "center",
      borderBottom: `1px solid ${C.border}`,
      padding: "9px 14px",
    }}>
      {content}
    </div>
  );
}

export function StockTotalPanel({ sedeLocked, isMobile, toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fSede, setFSede] = useState(sedeLocked || "todas");
  const [fObra, setFObra] = useState("todas");
  const [fCategoria, setFCategoria] = useState("todos");
  const [selectedKey, setSelectedKey] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const sede = sedeLocked || (fSede !== "todas" ? fSede : null);
      setRows(await fetchMaterialesEgreso({ sede, estados: STOCK_REAL_ESTADOS }));
    } catch (e) {
      toast.error(e.message || "No se pudo cargar el stock.");
    } finally {
      setLoading(false);
    }
  }, [fSede, sedeLocked, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const searchedRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let filtered = rows;
    if (term) filtered = filtered.filter((row) => materialSearchText(row).includes(term));
    return filtered;
  }, [rows, q]);

  const obraOptions = useMemo(() => {
    const map = new Map();
    for (const row of searchedRows) {
      const key = materialObraKey(row);
      if (!map.has(key)) map.set(key, materialObraLabel(row));
    }
    return [["todas", "Todas"], ...[...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "es", { numeric: true }))];
  }, [searchedRows]);

  const obraFilteredRows = useMemo(
    () => (fObra === "todas" ? searchedRows : searchedRows.filter((row) => materialObraKey(row) === fObra)),
    [searchedRows, fObra],
  );

  const categoriaOptions = useMemo(() => filterOptions(obraFilteredRows, stockCategoriaLabel), [obraFilteredRows]);

  const filteredRows = useMemo(
    () => {
      let filtered = obraFilteredRows;
      if (fCategoria !== "todos") filtered = filtered.filter((row) => stockCategoriaLabel(row) === fCategoria);
      return filtered;
    },
    [obraFilteredRows, fCategoria],
  );

  const materialGroups = useMemo(() => buildStockMaterialGroups(filteredRows), [filteredRows]);
  const selectedGroup = useMemo(
    () => materialGroups.find((group) => group.key === selectedKey) || null,
    [materialGroups, selectedKey],
  );

  const stockKpis = useMemo(() => {
    let unidades = 0;
    const destinos = new Set();
    for (const row of filteredRows) {
      unidades += numericCantidad(row.cantidad) ?? 1;
      destinos.add(materialObraKey(row));
    }
    return { materiales: materialGroups.length, unidades: Number(unidades.toFixed(2)), destinos: destinos.size, movimientos: filteredRows.length };
  }, [filteredRows, materialGroups.length]);

  useEffect(() => {
    if (fObra !== "todas" && !obraOptions.some(([key]) => key === fObra)) {
      setFObra("todas");
    }
  }, [fObra, obraOptions]);

  useEffect(() => {
    if (fCategoria !== "todos" && !categoriaOptions.some(([key]) => key === fCategoria)) {
      setFCategoria("todos");
    }
  }, [fCategoria, categoriaOptions]);

  useEffect(() => {
    if (selectedKey && !materialGroups.some((group) => group.key === selectedKey)) {
      setSelectedKey(null);
    }
  }, [materialGroups, selectedKey]);

  return (
    <>
      <div style={{
        background: C.topbarSoft,
        ...GLASS,
        borderBottom: `1px solid ${C.border}`,
        padding: isMobile ? "10px 12px" : "10px 18px",
        display: "grid",
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 260px", minWidth: isMobile ? "100%" : 260 }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar material, obra, codigo, proveedor..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: C.panelSolid,
                border: `1px solid ${C.border}`,
                color: C.text,
                padding: "9px 34px",
                borderRadius: 10,
                fontSize: 13,
                fontFamily: C.sans,
                outline: "none",
              }}
            />
            {q && (
              <button type="button" onClick={() => setQ("")} title="Limpiar" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "grid", placeItems: "center", padding: 4 }}>
                <X size={14} />
              </button>
            )}
          </div>

          <SelectFilter label="Obra" value={fObra} onChange={setFObra} options={obraOptions} />
          <SelectFilter label="Categoria" value={fCategoria} onChange={setFCategoria} options={categoriaOptions} />
          {!sedeLocked && (
            <SelectFilter label="Sede" value={fSede} onChange={setFSede} options={[["todas", "Todas"], ...SEDES_PANOL.map((s) => [s, s])]} />
          )}
          <SmallButton onClick={cargar} disabled={loading} title="Actualizar stock">
            <RefreshCw size={15} />
          </SmallButton>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(120px, 1fr))", gap: 8 }}>
          <KpiCard icon={Warehouse} label="Productos" value={stockKpis.materiales} color={C.blue} detail="agrupados por catálogo" />
          <KpiCard icon={PackageCheck} label="Disponible" value={stockKpis.unidades} color={C.green} detail="suma de cantidades" />
          <KpiCard icon={Inbox} label="Destinos" value={stockKpis.destinos} color={C.teal} detail="obras + stock general" />
          <KpiCard icon={PackageOpen} label="Movimientos" value={stockKpis.movimientos} color={C.violet} detail={sedeLocked || (fSede === "todas" ? "todas las sedes" : fSede)} />
        </div>
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        padding: isMobile ? 12 : "14px 18px 18px",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(330px, 420px) minmax(420px, 1fr)",
        gap: 12,
      }}>
        <section style={{ minHeight: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 13px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>Stock total</div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Solo stock disponible: en pañol, recibido o parcial.</div>
            </div>
          </div>
          <div style={{ padding: 8, display: "grid", gap: 7, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 28, color: C.dim, textAlign: "center", fontSize: 12, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>Cargando stock...</div>
            ) : materialGroups.length === 0 ? (
              <div style={{ padding: 30, border: `1px dashed ${C.border2}`, borderRadius: 10, color: C.dim, textAlign: "center", fontSize: 13 }}>
                Todavia no hay stock para estos filtros.
              </div>
            ) : materialGroups.map((group) => (
              <StockMaterialGroupCard
                key={group.key}
                group={group}
                active={selectedGroup?.key === group.key}
                onOpen={setSelectedKey}
                isMobile={isMobile}
              />
            ))}
          </div>
        </section>

        <section style={{ minHeight: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 13px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            {selectedGroup ? (
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 17, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedGroup.label}</div>
                <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>
                  {stockDisponibleLabel(selectedGroup)} disponible · {selectedGroup.obras.size} destino{selectedGroup.obras.size === 1 ? "" : "s"}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>Detalle por material</div>
                <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Entra a un material para ver obra, linea, estado y origen.</div>
              </div>
            )}
          </div>

          {selectedGroup ? (
            <>
              {!isMobile && (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) 106px 92px minmax(170px, 240px) 78px", gap: 12, padding: "9px 14px", color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, background: C.bg1 }}>
                  <span>Obra / stock</span>
                  <span>Estado</span>
                  <span>Cantidad</span>
                  <span>Origen</span>
                  <span>Fecha</span>
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                {selectedGroup.rows.map((row) => (
                  <StockAssignmentRow key={row.id} row={row} isMobile={isMobile} />
                ))}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, minHeight: 220, display: "grid", placeItems: "center", padding: 18 }}>
              <div style={{ maxWidth: 360, textAlign: "center", color: C.dim }}>
                <Warehouse size={34} style={{ color: C.blue, marginBottom: 10 }} />
                <div style={{ color: C.text, fontSize: 16, fontWeight: 900 }}>Elegi un material</div>
                <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>
                  Esta vista muestra el stock real que se fue cargando en recepcion, ingresos directos y egresos.
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default function RecepcionPanolScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();


  const role = profile?.role;
  const isAdmin = hasAdminAccess(profile);
  const isManager = isAdmin || role === "compras";
  const userSede = profile?.sede || null;
  const sedeLocked = role === "panol" && (userSede === "Pampa" || userSede === "Chubut") ? userSede : null;
  const canReceive = isManager || role === "panol";

  const [envios, setEnvios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [ingresoKey, setIngresoKey] = useState(0); // bump → remonta el form inline de ingreso (reset/retomar)
  const [fSede, setFSede] = useState(sedeLocked || "todas");
  const [fEstado, setFEstado] = useState("activos");
  const [fPrio, setFPrio] = useState("todas");
  const [q, setQ] = useState("");
  const [tab, setTabState] = useState(() => readStoredPanolTab());
  const [solicitudOpen, setSolicitudOpen] = useState(false);
  const setTab = useCallback((nextTab) => {
    const requested = nextTab === "pendientes" ? "ingresar" : nextTab;
    const value = PANOL_TABS.has(requested) ? requested : "recepcion";
    setTabState(value);
    if (typeof window !== "undefined") window.localStorage.setItem(PANOL_TAB_STORAGE_KEY, value);
  }, []);
  const [modalPrefill, setModalPrefill] = useState(null);
  const [pendientes, setPendientes] = useState(() => leerIngresosPendientes());
  const refreshPendientes = useCallback(() => setPendientes(leerIngresosPendientes()), []);
  // Identidad estable: si fuera un objeto inline, cualquier re-render del padre
  // (p. ej. un toast) reiniciaría el form del modal y borraría los ítems cargados.
  const modalPrefillEstable = useMemo(
    () => modalPrefill || { origen: "remito", modo: "remito", sede: sedeLocked || "Pampa" },
    [modalPrefill, sedeLocked],
  );

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const sede = sedeLocked || (fSede !== "todas" ? fSede : null);
      setEnvios(await fetchEnvios({ sede }));
    } catch (e) {
      toast.error(e.message || "No se pudieron cargar los pedidos.");
    } finally {
      setLoading(false);
    }
  }, [sedeLocked, fSede, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    let rows = envios;
    if (fEstado === "activos") rows = rows.filter(needsReception);
    else if (fEstado !== "todos") rows = rows.filter((e) => e.estado === fEstado);
    if (fPrio !== "todas") rows = rows.filter((e) => e.prioridad === fPrio);
    const term = q.trim().toLowerCase();
    if (term) rows = rows.filter((e) => rowSearchText(e).includes(term));
    return [...rows].sort(compareReceptionPriority);
  }, [envios, fEstado, fPrio, q]);

  const kpis = useMemo(() => {
    let pendientes = 0;
    let parciales = 0;
    let problemas = 0;
    let recibidos = 0;
    let accionItems = 0;
    for (const e of envios) {
      const r = actionResumen(e);
      pendientes += r.pendientes;
      parciales += r.parciales;
      problemas += r.problemas;
      accionItems += r.accion;
      if (e.estado === "recibido" || r.completoPorItems) recibidos += 1;
    }
    const activos = envios.filter(needsReception).length;
    return { total: envios.length, activos, pendientes, problemas, recibidos, parciales, accionItems };
  }, [envios]);

  // El aviso flotante de pendientes ahora vive en NotificacionesBell global.

  const shell = (children) => (
    <div style={{ background: C.bg, position: "fixed", inset: 0, overflow: "hidden", color: C.text, fontFamily: C.sans }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", height: "100%", overflow: "hidden" }}>
        <Sidebar profile={profile} signOut={signOut} />
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );

  if (sel) {
    return shell(
      <PanolEnvioDetail
        envioId={sel}
        profile={profile}
        canReceive={canReceive}
        isManager={isManager}
        onBack={() => { setSel(null); cargar(); }}
      />,
    );
  }

  return shell(
    <>
      <div style={{
        background: C.topbar,
        ...GLASS,
        borderBottom: `1px solid ${C.border}`,
        padding: isMobile ? "12px 12px 12px 54px" : "16px 18px",
        display: "grid",
        gap: 14,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {iconBox(C.blue, Warehouse)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: C.text, lineHeight: 1.1 }}>Recepción y egresos</div>
            <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1.1, textTransform: "uppercase", marginTop: 4, fontWeight: 750 }}>
              {sedeLocked ? `Pañol ${sedeLocked}` : "Bandeja operativa · Pampa y Chubut"}
            </div>
          </div>
          <div style={{ display: "inline-flex", gap: 3, padding: 3, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 11 }}>
            <TabButton active={tab === "recepcion"} onClick={() => setTab("recepcion")}>Recepción</TabButton>
            <TabButton active={tab === "ingresar"} onClick={() => { refreshPendientes(); setTab("ingresar"); }}>
              Ingresar{pendientes.length > 0 ? ` (${pendientes.length})` : ""}
            </TabButton>
            <TabButton active={tab === "consumibles"} onClick={() => setTab("consumibles")}>Consumibles</TabButton>
            <TabButton active={tab === "crear"} onClick={() => setTab("crear")}>Crear producto</TabButton>
            <TabButton active={tab === "egresos"} onClick={() => setTab("egresos")}>Egresos</TabButton>
          </div>
          <button
            type="button"
            onClick={() => setSolicitudOpen(true)}
            title="Imprimir solicitud manual para panol"
            style={{
              border: `1px solid ${C.blueB}`,
              background: C.blueL,
              color: C.blue,
              borderRadius: 10,
              padding: "9px 12px",
              minHeight: 36,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 900,
              fontFamily: C.sans,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              whiteSpace: "nowrap",
            }}
          >
            <Printer size={15} />
            Imprimible
          </button>
          {tab === "recepcion" && (
            <SmallButton onClick={cargar} disabled={loading} title="Actualizar">
              <RefreshCw size={15} />
            </SmallButton>
          )}
        </div>

        {tab === "recepcion" && (
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, minmax(130px, 1fr))",
            gap: 10,
          }}>
            <KpiCard icon={Clock3} label="Por revisar" value={kpis.activos} color={C.amber} detail={`${kpis.accionItems} items abiertos`} />
            <KpiCard icon={PackageOpen} label="Pendientes" value={kpis.pendientes} color={C.violet} detail="sin recibir" />
            <KpiCard icon={AlertTriangle} label="Novedades" value={kpis.problemas} color={C.red} detail="faltantes / sin info" />
            <KpiCard icon={Inbox} label="Pedidos" value={kpis.total} color={C.blue} detail={`${filtrados.length} visibles`} />
            <KpiCard icon={PackageCheck} label="Completados" value={kpis.recibidos} color={C.green} detail="no molestan" />
          </div>
        )}
      </div>

      {tab === "recepcion" ? (
        <>
      <div style={{
        background: C.topbarSoft,
        ...GLASS,
        borderBottom: `1px solid ${C.border}`,
        padding: isMobile ? "10px 12px" : "10px 18px",
        display: "grid",
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 260px", minWidth: isMobile ? "100%" : 260 }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar pedido, obra, destino, sede..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: C.panelSolid,
                border: `1px solid ${C.border}`,
                color: C.text,
                padding: "9px 34px",
                borderRadius: 10,
                fontSize: 13,
                fontFamily: C.sans,
                outline: "none",
              }}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                title="Limpiar"
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: C.dim,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  padding: 4,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <SelectFilter label="Estado" value={fEstado} onChange={setFEstado} options={STATE_FILTERS} />
          <SelectFilter label="Prioridad" value={fPrio} onChange={setFPrio} options={PRIO_FILTERS} />

          {!sedeLocked && (
            <SelectFilter label="Sede" value={fSede} onChange={setFSede} options={[["todas", "Todas"], ...SEDES_PANOL.map((s) => [s, s])]} />
          )}
        </div>

        {!loading && kpis.activos > 0 && (
          <button
            type="button"
            onClick={() => setFEstado("activos")}
            style={{
              width: "100%",
              border: `1px solid ${C.amberB}`,
              background: "var(--amber-soft)",
              color: C.text,
              borderRadius: 12,
              padding: isMobile ? "10px 12px" : "9px 12px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: C.sans,
            }}
          >
            <AlertTriangle size={16} style={{ color: C.amber, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.muted }}>
              Hay <strong style={{ color: C.text }}>{kpis.activos}</strong> pedido{kpis.activos === 1 ? "" : "s"} pendiente{kpis.activos === 1 ? "" : "s"} de recepción para revisar
              {kpis.problemas > 0 && <span style={{ color: C.red, fontWeight: 850 }}> · {kpis.problemas} novedad{kpis.problemas === 1 ? "" : "es"}</span>}.
            </span>
            {fEstado !== "activos" && <span style={{ color: C.amber, fontSize: 11, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.7 }}>Ver pendientes</span>}
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {!isMobile && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 1fr) 116px 116px minmax(190px, 240px) 120px 98px 34px",
            gap: 12,
            padding: "11px 32px 9px",
            borderBottom: `1px solid ${C.border}`,
            background: C.bg,
            color: C.dim,
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: 1.1,
            textTransform: "uppercase",
            flexShrink: 0,
          }}>
            <span>Pedido</span>
            <span>Sede</span>
            <span>Estado</span>
            <span>Recepción</span>
            <span>Prioridad</span>
            <span>Fecha</span>
            <span />
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 12 : "12px 18px 18px" }}>
          {loading ? (
            <div style={{ padding: 44, textAlign: "center", color: C.dim, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 800 }}>
              Cargando pedidos...
            </div>
          ) : filtrados.length === 0 ? (
            <div style={{
              margin: "18px auto",
              maxWidth: 520,
              border: `1px dashed ${C.border2}`,
              borderRadius: 14,
              padding: "42px 22px",
              textAlign: "center",
              color: C.dim,
              background: C.panel,
            }}>
              <CheckCircle2 size={34} style={{ color: C.green, marginBottom: 10 }} />
              <div style={{ fontSize: 16, fontWeight: 850, color: C.text }}>
                {fEstado === "activos" ? "Todo al día en recepción" : "No hay pedidos para este filtro"}
              </div>
              <div style={{ fontSize: 13, marginTop: 6 }}>
                {fEstado === "activos"
                  ? "Los pedidos ya recibidos quedan guardados en el filtro Recibidos."
                  : isManager ? "Podes crear un pedido nuevo o cambiar los filtros." : "Cuando compras envie algo a tu pañol, aparece acá."}
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {filtrados.map((envio) => (
                isMobile
                  ? <MobileCard key={envio.id} envio={envio} onOpen={setSel} />
                  : <DesktopRow key={envio.id} envio={envio} onOpen={setSel} />
              ))}
            </div>
          )}
        </div>
      </div>

        </>
      ) : tab === "egresos" ? (
        <StockPanolScreen embedded mode="egreso" profile={profile} />
      ) : tab === "consumibles" ? (
        <ConsumiblesPanolTab isMobile={isMobile} toast={toast} sedeLocked={sedeLocked} canReceive={canReceive} isAdmin={isAdmin} />
      ) : tab === "crear" ? (
        <CrearProductoTab isMobile={isMobile} toast={toast} />
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* Tira de borradores para retomar (solo si hay) */}
          {pendientes.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "8px 12px" : "8px 18px", borderBottom: `1px solid ${C.border}`, background: C.topbarSoft, ...GLASS, overflowX: "auto", flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: C.dim, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap", flexShrink: 0 }}>
                Borradores ({pendientes.length}):
              </span>
              {pendientes.map((d) => {
                const nItems = Array.isArray(d.items) ? d.items.length : 0;
                return (
                  <div key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 5px 4px 11px", border: `1px solid ${C.blueB}`, background: "var(--blue-soft)", borderRadius: 999, flexShrink: 0 }}>
                    <button type="button" title="Retomar este borrador"
                      onClick={() => {
                        setModalPrefill({ origen: "remito", modo: "remito", draftId: d.id, titulo: d.titulo, sede: d.sede, obraId: d.obraId, prioridad: d.prioridad, observaciones: d.observaciones, items: d.items });
                        setIngresoKey((k) => k + 1);
                      }}
                      style={{ border: "none", background: "transparent", color: C.blue, cursor: "pointer", fontSize: 12.5, fontWeight: 850, fontFamily: C.sans, whiteSpace: "nowrap", padding: 0 }}>
                      {d.titulo?.trim() || "(sin referencia)"} · {nItems} ít{nItems === 1 ? "em" : "ems"}
                    </button>
                    <button type="button" title="Borrar borrador"
                      onClick={() => { borrarIngresoPendiente(d.id); refreshPendientes(); }}
                      style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "grid", placeItems: "center", padding: 2, flexShrink: 0 }}>
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {/* Form de ingreso inline (reemplaza al modal) */}
          <div style={{ flex: 1, minHeight: 0 }}>
            {canReceive ? (
              <EnviarAPanolModal
                key={ingresoKey}
                open
                embedded
                profile={profile}
                prefill={modalPrefillEstable}
                showPrices={isAdmin}
                onClose={(saved) => { setModalPrefill(null); setIngresoKey((k) => k + 1); refreshPendientes(); if (saved) cargar(); }}
              />
            ) : (
              <div style={{ padding: "40px 20px", textAlign: "center", color: C.dim, fontSize: 13 }}>
                No tenés permisos para ingresar materiales.
              </div>
            )}
          </div>
        </div>
      )}
      <SolicitudPanolPrintable open={solicitudOpen} onClose={() => setSolicitudOpen(false)} />
    </>,
  );
}
