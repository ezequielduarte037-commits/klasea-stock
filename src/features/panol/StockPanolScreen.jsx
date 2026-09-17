import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, BarChart3, ChevronDown, ChevronRight, DollarSign, Inbox, List, Map as MapIcon, Plus, RefreshCw, Search, ShipWheel, SlidersHorizontal, Warehouse, X } from "lucide-react";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { C } from "@/theme";
import StockWmsPanel from "@/features/panol/StockWmsPanel";
import MapaPanolTab from "@/features/panol/MapaPanolTab";
import PanolRetirosDashboard from "@/features/panol/PanolRetirosDashboard";
import DevolucionesPanel from "@/features/panol/DevolucionesPanel";
import NormalizacionIngresosPanel from "@/features/panol/NormalizacionIngresosPanel";
import { canonicalPanolSede, crearObraExterna, DEVOLUCION_MOTIVOS, DEVOLUCION_NECESITA, DEVOLUCION_RESPONSABLE, fetchConsumibleIds, fetchMaterialesEgreso, fetchObrasEgreso, fetchPanolInTransitInventory, fetchPanolReplenishmentCatalog, registrarDevolucion, sinConsumibles } from "@/features/panol/panolApi";
import { fmtDate, rowDelta, rowHasRecordedEgreso, rowIsAnulado, rowIsTransit, rowMovementAt, rowSource } from "@/features/panol/panolMovimientos";
import { fetchCierresAbiertosPorObra } from "@/features/panol/obraCierreApi";
import { ListaSobrantesObraPanel } from "@/features/panol/SobrantesObraScreen";
import { MODELOS, norm } from "@/features/materiales/materialesParser";
import { hasAdminAccess } from "@/lib/permissions";

const GLASS = {
  backdropFilter: "var(--glass-filter)",
  WebkitBackdropFilter: "var(--glass-filter)",
};

const LEDGER_STATES = ["en_panol", "recibido", "parcial", "egresado", "problema"];
const LINEA_FALLBACK = "OTROS";

// ─── Helpers (replican la lógica local de StockWmsPanel sin importarla) ────────

function qty(v, fb = 0) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fb;
}

function fmtQty(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return "0";
  return Number(Math.round(n * 100) / 100).toLocaleString("es-AR");
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function rowObraId(row) { return row.obra?.id || row.obra_id || ""; }
function rowIsAdditional(row) { return row.es_adicional === true || row.request?.es_adicional === true; }
function rowTipoPedido(row) {
  if (rowIsAdditional(row) || row.tipo_pedido === "adicional" || row.request?.tipo_pedido === "adicional") return "adicional";
  // Stock pañol = stock general sin obra asignada; Estándar = asignado a una obra.
  if (!rowObraId(row)) return "stock";
  return "estandar";
}

function lineaKeyFromObra(obra = {}) {
  const normalizeLine = (value) => {
    const raw = String(value || "").trim().toUpperCase();
    if (!raw) return "";
    const numeric = raw.match(/^K?(\d+)$/);
    return numeric ? numeric[1] : raw;
  };
  const modelo = normalizeLine(obra.modelo || obra.linea_nombre);
  if (modelo) return modelo;
  const prefix = String(obra.codigo || "").trim().toUpperCase().split("-")[0];
  return normalizeLine(prefix) || LINEA_FALLBACK;
}

function lineaLabel(key) {
  if (key === LINEA_FALLBACK) return "Sin línea";
  const raw = String(key || "").trim().toUpperCase();
  if (/^\d+$/.test(raw)) return `K${raw}`;
  return raw.charAt(0) + raw.slice(1).toLowerCase();
}

/**
 * Calcula estadísticas de stock y costo para un conjunto de filas de una obra.
 */
function calcObraStats(obraRows) {
  const productMap = new Map();
  for (const row of obraRows) {
    const tipo = rowTipoPedido(row);
    const key = tipo + "::" + (row.material_id || row.descripcion || row.id || "?");
    if (!productMap.has(key)) productMap.set(key, { total: 0, tipo, transit: 0 });
    const g = productMap.get(key);
    g.total += rowDelta(row);
    if (rowIsTransit(row)) g.transit += qty(row.cantidad, 1);
  }
  let itemsStock = 0, itemsStd = 0, itemsAdd = 0, negativos = 0, costoUsdStock = 0, costoUsdStd = 0, costoUsdAdd = 0;
  for (const [, g] of productMap) {
    if (g.total > 0) { 
      if (g.tipo === "adicional") itemsAdd++; 
      else if (g.tipo === "stock") itemsStock++;
      else itemsStd++; 
    }
    if (g.total < 0) negativos++;
  }
  for (const row of obraRows) {
    if (row.estado === "egresado" && String(row.moneda || "").toUpperCase() === "USD") {
      if (rowSource(row).startsWith("transferencia")) continue;
      const cost = Math.abs(rowDelta(row)) * qty(row.precio_unitario, 0);
      const tipo = rowTipoPedido(row);
      if (tipo === "adicional") costoUsdAdd += cost;
      else if (tipo === "stock") costoUsdStock += cost;
      else costoUsdStd += cost;
    }
  }
  return { itemsStock, itemsStd, itemsAdd, negativos, costoUsdStock, costoUsdStd, costoUsdAdd };
}

// ─── Sub-componentes UI ────────────────────────────────────────────────────────

function StatMini({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.dim, fontWeight: 650, textTransform: "uppercase", letterSpacing: 0.5, lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 750, color: color || C.text, lineHeight: 1.25, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Breadcrumb({ items }) {
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {i > 0 && <ChevronRight size={12} style={{ color: C.dim, flexShrink: 0 }} />}
          {item.onClick ? (
            <button
              type="button"
              onClick={item.onClick}
              style={{ background: "none", border: "none", cursor: "pointer", color: C.blue, fontSize: 13, fontWeight: 600, padding: "2px 0", fontFamily: C.sans }}
            >
              {item.label}
            </button>
          ) : (
            <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// Caja de ícono coloreada (usada en GlobalKpiBar y LineaCard)
function IconBox({ color, children }) {
  return (
    <div style={{ width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", color, background: `${color}14`, border: `1px solid ${color}33`, flexShrink: 0 }}>
      {children}
    </div>
  );
}

function GlobalKpiBar({ rows, consumidoUsd = 0, onSelectScope }) {
  const kpis = useMemo(() => {
    const productMap = new Map();
    for (const row of rows) {
      const key = (rowIsAdditional(row) ? "add" : "std") + "::" + (row.material_id || row.descripcion || row.id || "?");
      if (!productMap.has(key)) productMap.set(key, { total: 0 });
      const g = productMap.get(key);
      g.total += rowDelta(row);
    }
    let enStock = 0, negativos = 0;
    for (const [, g] of productMap) {
      if (g.total > 0) enStock++;
      if (g.total < 0) negativos++;
    }
    return { enStock, negativos };
  }, [rows]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
      {[
        ["existencia", "En stock", kpis.enStock, C.green],
        ["reconciliar", "A reconciliar", kpis.negativos, kpis.negativos ? C.red : C.dim],
      ].map(([scope, label, value, color]) => (
        <button
          key={scope}
          type="button"
          onClick={() => onSelectScope?.(scope)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            border: `1px solid ${color}44`, background: `${color}0d`, color,
            borderRadius: 999, padding: "5px 9px", cursor: "pointer",
            fontSize: 10.5, fontWeight: 700, fontFamily: C.sans,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
          {label} <span style={{ fontFamily: C.mono }}>{value}</span>
        </button>
      ))}
      {consumidoUsd > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.dim, fontSize: 10.5, padding: "5px 8px" }}>
          <DollarSign size={12} style={{ color: C.green }} /> Consumido USD <b style={{ color: C.text, fontFamily: C.mono }}>{fmtQty(consumidoUsd)}</b>
        </span>
      )}
      <span style={{ color: C.dim, fontSize: 10.5, marginLeft: "auto" }}>
        Abrí Stock maestro para ver reposición, tránsito y ubicaciones.
      </span>
    </div>
  );
}

function LineaCard({ codigo, stats, onClick, canSeePrices = true, maxCostoUsd = 0 }) {
  const hasNeg = stats.negativos > 0;
  const accent = hasNeg ? C.red : C.blue;
  const isExternal = !/^K\d+$/i.test(String(codigo || ""));
  const shortCode = isExternal ? String(codigo || "").slice(0, 1) : String(codigo || "").replace(/^K/i, "");
  const [hover, setHover] = useState(false);
  // Barra comparativa: proporción del consumo de esta línea vs. la línea que más consumió.
  const share = canSeePrices && maxCostoUsd > 0 && stats.costoUsd > 0
    ? Math.max(0.04, Math.min(1, stats.costoUsd / maxCostoUsd))
    : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", textAlign: "left", cursor: "pointer", padding: 0, overflow: "hidden",
        border: `1px solid ${hover ? C.blueB : hasNeg ? C.redB : C.border}`,
        borderRadius: 18,
        background: `linear-gradient(140deg, ${accent}${hover ? "22" : "14"} 0%, transparent 52%), var(--panel)`,
        ...GLASS,
        display: "flex", flexDirection: "column",
        transform: hover ? "translateY(-4px)" : "none",
        transition: "transform .2s cubic-bezier(.25,.8,.25,1), box-shadow .2s, border-color .2s, background .2s",
        boxShadow: hover
          ? `0 18px 40px -16px ${accent}66`
          : "0 1px 2px rgba(0,0,0,0.04), 0 10px 26px -16px rgba(0,0,0,0.16)",
      }}
    >
      {/* Watermark del modelo */}
      <div aria-hidden style={{ position: "absolute", right: -8, top: -18, fontFamily: C.mono, fontSize: 96, fontWeight: 750, color: accent, opacity: hover ? 0.12 : 0.07, lineHeight: 1, pointerEvents: "none", userSelect: "none", transition: "opacity .2s" }}>
        {codigo}
      </div>
      <div style={{ height: 4, background: `linear-gradient(90deg, ${accent}, ${accent}22)` }} />
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 13, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, display: "grid", placeItems: "center", color: "#fff", fontWeight: 750, fontSize: 17, fontFamily: C.mono, flexShrink: 0, background: hasNeg ? "linear-gradient(135deg, #f87171, #ef4444)" : "linear-gradient(135deg, #60a5fa, #3b82f6)", boxShadow: hasNeg ? "0 4px 12px rgba(239,68,68,0.3)" : "0 4px 12px rgba(59,130,246,0.3)" }}>
            {shortCode}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: C.dim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2 }}>{isExternal ? "Barcos externos · solo stock" : "Línea de producción"}</div>
            <div style={{ fontFamily: C.mono, fontSize: 23, fontWeight: 750, color: C.text, lineHeight: 1.05 }}>{codigo}</div>
          </div>
          <div style={{ flex: 1 }} />
          <ChevronRight size={18} style={{ color: hover ? C.blue : C.dim, flexShrink: 0, transition: "color .2s", transform: hover ? "translateX(3px)" : "none" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <StatMini label="Obras" value={stats.totalObras} />
          <StatMini label="Activas" value={stats.obrasActivas} color={C.green} />
          <StatMini label="Negativos" value={stats.negativos} color={hasNeg ? C.red : C.dim} />
        </div>
        {share > 0 ? (
          <div title="Consumido en egresos (solo precios USD) comparado con la línea que más consumió">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: C.dim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Consumo USD</span>
              <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 750, color: C.green }}>USD {fmtQty(stats.costoUsd)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: "var(--panel-2, rgba(127,127,127,0.14))", overflow: "hidden" }}>
              <div style={{ width: `${share * 100}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #34d399, #10b981)", transition: "width .4s ease" }} />
            </div>
          </div>
        ) : (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 9 }}>
            <span style={{ fontSize: 11, color: C.dim, fontWeight: 650 }}>{stats.totalObras ? "Ver obras →" : "Sin obras con stock"}</span>
          </div>
        )}
      </div>
    </button>
  );
}

function ObraCard({ obra, stats, onClick, canSeePrices = true }) {
  const hasNeg = stats.negativos > 0;
  const consumido = (stats.costoUsdStd || 0) + (stats.costoUsdAdd || 0) + (stats.costoUsdStock || 0);
  const [hover, setHover] = useState(false);
  const estadoColors = {
    activa: C.green, terminada: C.dim, pausada: C.violet,
    cancelada: C.red, archivada: C.dim,
  };
  const estadoColor = estadoColors[obra.estado] || C.dim;
  const isActiva = obra.estado === "activa";
  // Acento visual: rojo si hay negativos, azul para activas, gris para el resto.
  const accent = hasNeg ? C.red : isActiva ? C.blue : C.dim;
  const totalItems = (stats.itemsStock || 0) + (stats.itemsStd || 0) + (stats.itemsAdd || 0);
  const seg = (n) => (totalItems > 0 ? `${(n / totalItems) * 100}%` : "0%");
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", textAlign: "left", cursor: "pointer", overflow: "hidden",
        border: `1px solid ${hover ? C.blueB : hasNeg ? C.redB : C.border}`,
        borderRadius: 16,
        background: `linear-gradient(140deg, ${accent}${hover ? "1e" : "10"} 0%, transparent 55%), var(--panel)`,
        ...GLASS,
        padding: 0, display: "flex", flexDirection: "column",
        opacity: isActiva || hasNeg || hover ? 1 : 0.82,
        transform: hover ? "translateY(-3px)" : "none",
        transition: "transform .18s ease, box-shadow .18s, border-color .18s, opacity .18s",
        boxShadow: hover ? `0 16px 36px -14px ${accent}5a` : "0 1px 2px rgba(0,0,0,0.04), 0 8px 22px -14px rgba(0,0,0,0.14)",
      }}
    >
      {/* Watermark del código */}
      <div aria-hidden style={{ position: "absolute", right: -4, top: -12, fontFamily: C.mono, fontSize: 64, fontWeight: 750, color: accent, opacity: hover ? 0.1 : 0.06, lineHeight: 1, pointerEvents: "none", userSelect: "none", whiteSpace: "nowrap", transition: "opacity .2s" }}>
        {obra.codigo}
      </div>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${accent}, ${accent}22)`, flexShrink: 0 }} />
      <div style={{ padding: "13px 15px", display: "flex", flexDirection: "column", gap: 11, position: "relative", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: C.mono, fontSize: 17, fontWeight: 750, color: C.text, lineHeight: 1.1 }}>{obra.codigo}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{obra.linea_nombre || `Linea ${lineaLabel(lineaKeyFromObra(obra))}`}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 650, color: estadoColor, border: `1px solid ${estadoColor}33`, background: `${estadoColor}11`, borderRadius: 6, padding: "2px 7px", textTransform: "uppercase" }}>
              {obra.estado}
            </span>
            <ChevronRight size={14} style={{ color: hover ? C.blue : C.dim, transition: "color .18s, transform .18s", transform: hover ? "translateX(3px)" : "none" }} />
          </div>
        </div>

        {totalItems > 0 || hasNeg ? (
          <>
            {/* Composición del stock: verde libre · azul asignado · violeta adicional */}
            {totalItems > 0 && (
              <div style={{ display: "flex", height: 7, borderRadius: 999, overflow: "hidden", background: "var(--panel-2, rgba(127,127,127,0.14))" }}>
                {stats.itemsStock > 0 && <div style={{ width: seg(stats.itemsStock), background: "linear-gradient(90deg, #34d399, #10b981)" }} title={`Stock libre: ${stats.itemsStock}`} />}
                {stats.itemsStd > 0 && <div style={{ width: seg(stats.itemsStd), background: "linear-gradient(90deg, #60a5fa, #3b82f6)" }} title={`Asignado: ${stats.itemsStd}`} />}
                {stats.itemsAdd > 0 && <div style={{ width: seg(stats.itemsAdd), background: "linear-gradient(90deg, #a78bfa, #8b5cf6)" }} title={`Adicional: ${stats.itemsAdd}`} />}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              <StatMini label="Stock" value={stats.itemsStock} color={C.green} />
              <StatMini label="Asignado" value={stats.itemsStd} color={C.blue} />
              <StatMini label="Adicional" value={stats.itemsAdd} color={C.violet} />
              <StatMini label="Neg." value={stats.negativos} color={hasNeg ? C.red : C.dim} />
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: C.dim, padding: "8px 0 2px" }}>Sin ítems en pañol todavía.</div>
        )}

        {canSeePrices && consumido > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: "auto" }}>
            <span style={{ fontSize: 10.5, color: C.dim, fontWeight: 650 }}>Consumido (egresos USD)</span>
            <span style={{ fontFamily: C.mono, fontSize: 12.5, fontWeight: 750, color: C.green, whiteSpace: "nowrap" }}>USD {fmtQty(consumido)}</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "maestro", label: "Inventario" },
  { key: "obra", label: "Por obra" },
  { key: "movimientos", label: "Movimientos" },
  { key: "sobrantes", label: "Sobrantes de obra" },
];

// ─── Panel de movimientos (historial general: ingresos y egresos) ──────────────
const MOV_INP = { background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12.5, fontFamily: C.sans, outline: "none" };

function movDestino(row) {
  return row.obra?.codigo || (row.stock_sede ? `Stock ${row.stock_sede}` : "Stock general");
}

function rowIsAsignacionStock(row) {
  return rowSource(row) === "transferencia_ingreso" && !rowHasRecordedEgreso(row);
}

function rowIsAsignacionMirrorOut(row) {
  const label = String(row.tipo_label || "").toLowerCase();
  return rowSource(row) === "transferencia_egreso" && !label.includes("liber");
}

// Tipo de movimiento con detalle: ingreso / egreso / asignación / reasignación / a stock.
const MOV_KIND = {
  ingreso:      { label: "Ingreso",      color: C.green,  sign: "+" },
  egreso:       { label: "Egreso",       color: C.red,    sign: "−" },
  solicitud:    { label: "Retiro solicitud", color: C.red, sign: "−" },
  asignacion:   { label: "Asignación",   color: C.blue,   sign: "→" },
  reasignacion: { label: "Reasignación", color: C.violet, sign: "→" },
  asignacion_egreso:   { label: "Asign. -> egreso", color: C.red,    sign: "−" },
  reasignacion_egreso: { label: "Reasig. -> egreso", color: C.violet, sign: "−" },
  liberacion:   { label: "A stock",      color: C.violet,  sign: "←" },
  consumible:   { label: "Consumible",   color: C.violet, sign: "−" },
};
const MOV_INTERNAL = new Set(["asignacion", "reasignacion", "asignacion_egreso", "reasignacion_egreso", "liberacion"]);
// Movimientos donde el material efectivamente salió del pañol hacia una persona.
// Sólo estos pueden volver fallados: un ingreso o una asignación interna, no.
const MOV_SALIDA = new Set(["egreso", "solicitud", "asignacion_egreso", "reasignacion_egreso", "consumible"]);

function rowMovementKind(row) {
  const src = rowSource(row);
  const label = String(row.tipo_label || "").toLowerCase();
  // Mover algo a la obra donde ya estaba no es una reasignación: es un egreso
  // comun. Aparecia como "REASIGNACION 52-23 -> 52-23", un movimiento que no
  // mueve nada de lugar y que no habia forma de entender leyendolo.
  // Se evalua acá y no sólo al guardar para que los ya registrados tambien se
  // lean bien.
  const destinoRedundante = row.egreso_destino_obra_id
    && row.obra_id
    && row.egreso_destino_obra_id === row.obra_id;
  if (destinoRedundante) return "egreso";
  if (src === "solicitud_consumible_retiro") return "consumible";
  if (src === "egreso_solicitud") return "solicitud";
  if (rowIsAsignacionStock(row)) return row.obra_origen_id ? "reasignacion" : "asignacion";
  if (row.egreso_destino_obra_id) return row.obra_id ? "reasignacion_egreso" : "asignacion_egreso";
  if (src === "transferencia_egreso") {
    if (label.includes("liber")) return "liberacion";
    return row.obra_id ? "reasignacion_egreso" : "asignacion_egreso";
  }
  if (rowHasRecordedEgreso(row)) return "egreso";
  return "ingreso";
}

function cleanHumanField(value) {
  return isUuidLike(value) ? "" : value;
}

function rowMovimientoRetira(row) {
  return cleanHumanField(row.retirado_por || "");
}

function rowMovimientoUsuario(row) {
  return cleanHumanField(row.egreso_por_nombre || row.egreso_actor?.username || row.created_by_nombre || row.created_by_actor?.username || row.egreso_por || row.created_by || "");
}

function movDetalleDestino(row, kind, obraById) {
  const codigo = (id) => (id ? (obraById?.get?.(id)?.codigo || null) : null);
  if (kind === "solicitud") {
    const origen = row.stock_sede ? `Stock ${row.stock_sede}` : "Stock";
    const destino = codigo(row.egreso_destino_obra_id) || row.sector_destino || "Sin obra";
    return `${origen} → ${destino}`;
  }
  if (kind === "asignacion" || kind === "reasignacion") {
    const origen = row.obra_origen_id ? (codigo(row.obra_origen_id) || "obra") : (row.stock_sede ? `Stock ${row.stock_sede}` : "Stock");
    const destino = codigo(row.obra_id) || row.obra?.codigo || "obra";
    return `${origen} → ${destino}`;
  }
  if (kind === "asignacion_egreso" || kind === "reasignacion_egreso") {
    const origen = row.obra_id ? (codigo(row.obra_id) || "obra") : (row.stock_sede ? `Stock ${row.stock_sede}` : "Stock");
    const destino = codigo(row.egreso_destino_obra_id) || "obra";
    return `${origen} → ${destino}`;
  }
  if (kind === "liberacion") {
    return `${codigo(row.obra_id) || row.obra?.codigo || "obra"} → stock`;
  }
  return movDestino(row);
}

function MovKpi({ label, value, detail, color }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 999, padding: "5px 9px", minWidth: 0, display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 750, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10.5, color: C.text, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 9.5, color: C.dim }}>{detail}</span>
    </div>
  );
}

function MovRow({ m, obraById, onDevolucion, isMobile = false }) {
  const meta = MOV_KIND[m.kind] || MOV_KIND.ingreso;
  const col = m.anulado ? C.dim : meta.color;
  const detalle = String(m.row.egreso_nota || m.row.stock_nota || m.row.notas || "").replace(/\[anulado\]/gi, "").trim();
  const esSalida = MOV_SALIDA.has(m.kind);
  const desc = m.row.descripcion || "(sin descripción)";
  const variant = String(m.row.variante || "").trim();
  const retira = rowMovimientoRetira(m.row);
  const usuario = rowMovimientoUsuario(m.row) || "sin registrar";
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr) auto" : "108px minmax(0, 1fr) auto", gap: isMobile ? 8 : 12, alignItems: "start", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.panelSolid, opacity: m.anulado ? 0.55 : 1 }}>
      <span style={{ width: "fit-content", fontSize: 9.5, fontWeight: 750, color: col, background: C.panel, border: `1px solid ${col}`, borderRadius: 999, padding: "3px 7px", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>{m.anulado ? "Anulado" : meta.label}</span>
      <div style={{ minWidth: 0, gridColumn: isMobile ? "1 / -1" : "auto", gridRow: isMobile ? 2 : "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.3, overflowWrap: "anywhere" }}>{desc}</div>
        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: "3px 9px", color: C.dim, fontSize: 10.5, lineHeight: 1.35 }}>
          <span>{fmtDate(m.fecha)}</span>
          {m.row.codigo && <span style={{ fontFamily: C.mono }}>{m.row.codigo}</span>}
          <span>{movDetalleDestino(m.row, m.kind, obraById)}</span>
          {variant && <span>Variante: {variant}</span>}
          {retira && <span>Retira: {retira}</span>}
          <span>Usuario: {usuario}</span>
          {detalle && <span style={{ color: C.muted }}>{detalle}</span>}
        </div>
      </div>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, whiteSpace: "nowrap", gridColumn: isMobile ? 2 : "auto", gridRow: isMobile ? 1 : "auto" }}>
        <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 750, color: col }}>{meta.sign}{fmtQty(m.cant)} {m.row.unidad || ""}</span>
        {/* Distinto de revertir: revertir deshace un movimiento que no debió
            existir; esto registra que salió bien y volvió fallado. */}
        {esSalida && !m.anulado && onDevolucion && (
          <button
            type="button"
            onClick={() => onDevolucion(m.row)}
            title="Salió bien pero el operario lo devolvió fallado"
            style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 8, minHeight: 30, padding: "5px 9px", cursor: "pointer", fontSize: 10.5, fontWeight: 700, fontFamily: C.sans }}
          >
            {isMobile ? "Devolver" : "Generar devolución"}
          </button>
        )}
      </span>
    </div>
  );
}

function MovimientosPanel({ rows = [], obras = [], isMobile = false, consumiblesOcultos = 0 }) {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [sedeF, setSedeF] = useState("todas");
  const [incluirAnulados, setIncluirAnulados] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [renderLimit, setRenderLimit] = useState(120);
  const [devolucion, setDevolucion] = useState(null);
  const [devolucionBusy, setDevolucionBusy] = useState(false);
  const toastMov = useToast();

  const obraById = useMemo(() => new Map((obras || []).map((o) => [o.id, o])), [obras]);

  const movimientos = useMemo(() => {
    const ledger = rows
    .map((r) => {
      const kind = rowMovementKind(r);
      const outgoing = Math.abs(qty(r.cantidad_egresada, 0)) || Math.abs(qty(r.cantidad, 1));
      const incoming = Math.abs(qty(r.cantidad, 1));
      const cant = ["egreso", "solicitud", "asignacion_egreso", "reasignacion_egreso", "liberacion", "consumible"].includes(kind) ? outgoing : incoming;
      return { key: `stock:${r.id}`, row: r, kind, cant, delta: rowDelta(r), fecha: rowMovementAt(r), anulado: rowIsAnulado(r) };
    })
    // Ocultar el espejo negativo de las asignaciones: la acción se ve como asignación azul.
    .filter((m) => !rowIsAsignacionMirrorOut(m.row))
    .filter((m) => m.delta !== 0 || rowHasRecordedEgreso(m.row) || m.kind === "consumible" || MOV_INTERNAL.has(m.kind));
    return ledger
    .filter((m) => {
      if (!incluirAnulados && m.anulado) return false;
      if (tipo === "traspasos") { if (!MOV_INTERNAL.has(m.kind)) return false; }
      else if (tipo !== "todos" && m.kind !== tipo) return false;
      if (sedeF !== "todas" && (m.row.stock_sede || "") !== sedeF) return false;
      if (desde && (!m.fecha || new Date(m.fecha) < new Date(`${desde}T00:00:00`))) return false;
      if (hasta && (!m.fecha || new Date(m.fecha) > new Date(`${hasta}T23:59:59`))) return false;
      if (q.trim()) {
        const t = norm(q);
        const destino = movDetalleDestino(m.row, m.kind, obraById);
        const hay = norm([m.row.descripcion, m.row.codigo, m.row.variante, destino, m.row.proveedor, m.row.origen, m.row.retirado_por, m.row.egreso_por_nombre, m.row.created_by_nombre, m.row.egreso_nota, m.row.stock_nota, m.row.notas].filter(Boolean).join(" "));
        if (!hay.includes(t)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }, [rows, q, tipo, sedeF, desde, hasta, incluirAnulados, obraById]);

  const kpis = useMemo(() => {
    let ing = 0, egr = 0, tras = 0, uIn = 0, uOut = 0;
    for (const m of movimientos) {
      if (m.kind === "egreso" || m.kind === "solicitud") { egr += 1; uOut += m.cant; }
      else if (m.kind === "ingreso") { ing += 1; uIn += m.cant; }
      else { tras += 1; }
    }
    return { ing, egr, tras, uIn, uOut };
  }, [movimientos]);

  const advancedFilterCount = [sedeF !== "todas", desde, hasta, incluirAnulados].filter(Boolean).length;

  useEffect(() => { setRenderLimit(120); }, [q, tipo, sedeF, desde, hasta, incluirAnulados]);

  const retirosDashboard = useMemo(() => {
    if (!showStats) return [];
    const physicalKinds = new Set(["egreso", "solicitud", "asignacion_egreso", "reasignacion_egreso", "consumible"]);
    return movimientos
      .filter((movement) => physicalKinds.has(movement.kind) && !movement.anulado)
      .map((movement) => {
        const row = movement.row;
        const destinationId = row.egreso_destino_obra_id || row.obra_id || "";
        const obra = destinationId
          ? (obraById.get(destinationId)?.codigo || row.obra?.codigo || "Sin obra")
          : (row.sector_destino || "Sin obra");
        return {
          id: movement.key,
          fecha: movement.fecha,
          cantidad: movement.cant,
          unidad: row.unidad || "unidad",
          material: row.descripcion || "Sin descripción",
          persona: rowMovimientoRetira(row) || "Sin identificar",
          obra,
          tipo: movement.kind,
        };
      });
  }, [movimientos, obraById, showStats]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 12 : "16px 18px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 750 }}>Historial operativo</div>
          <div style={{ color: C.dim, fontSize: 10.5, marginTop: 1 }}>{movimientos.length} movimientos con los filtros actuales</div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <button
            type="button"
            className="stock-workspace-control"
            onClick={() => setShowAdvanced((value) => !value)}
            aria-expanded={showAdvanced}
            style={{ minHeight: isMobile ? 44 : 34, border: `1px solid ${showAdvanced || advancedFilterCount ? C.blueB : C.border}`, background: showAdvanced || advancedFilterCount ? C.blueL : C.panelSolid, color: showAdvanced || advancedFilterCount ? C.blue : C.text, borderRadius: 9, padding: "6px 9px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, fontFamily: C.sans }}
          >
            <SlidersHorizontal size={13} aria-hidden="true" /> Más filtros
            {advancedFilterCount > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 4px", borderRadius: 999, display: "grid", placeItems: "center", background: C.blue, color: "#fff", fontFamily: C.mono, fontSize: 9.5 }}>{advancedFilterCount}</span>}
          </button>
          <button
            type="button"
            className="stock-workspace-control"
            onClick={() => setShowStats((value) => !value)}
            aria-expanded={showStats}
            style={{ minHeight: isMobile ? 44 : 34, border: `1px solid ${showStats ? C.violetB : C.border}`, background: showStats ? C.violetL : C.panelSolid, color: showStats ? C.violet : C.text, borderRadius: 9, padding: "6px 9px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, fontFamily: C.sans }}
          >
            <BarChart3 size={13} aria-hidden="true" /> Resumen <ChevronDown size={12} aria-hidden="true" style={{ transform: showStats ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </button>
        </div>
      </div>
      {consumiblesOcultos > 0 && (
        <div style={{ marginBottom: 9, color: C.dim, fontSize: 10.5 }}>
          Los consumibles siguen en su circuito propio. <a href="/recepcion-panol?tab=consumibles" style={{ color: C.violet, fontWeight: 700, textDecoration: "none" }}>Ver {consumiblesOcultos} movimientos de consumibles</a>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input className="stock-workspace-control" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, código, obra, quién..." style={{ ...MOV_INP, flex: "1 1 240px", minWidth: 200 }} />
        <select className="stock-workspace-control" value={tipo} onChange={(e) => setTipo(e.target.value)} style={MOV_INP}>
          <option value="todos">Todos</option>
          <option value="ingreso">Ingresos</option>
          <option value="egreso">Egresos</option>
          <option value="solicitud">Retiros por solicitud</option>
          <option value="traspasos">Traspasos (todos)</option>
          <option value="asignacion">Asignaciones</option>
          <option value="reasignacion">Reasignaciones</option>
          <option value="liberacion">A stock (liberar)</option>
        </select>
        {(q || tipo !== "todos" || sedeF !== "todas" || desde || hasta || incluirAnulados) && (
          <button type="button" onClick={() => { setQ(""); setTipo("todos"); setSedeF("todas"); setDesde(""); setHasta(""); setIncluirAnulados(false); }} style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 11.5, fontWeight: 650, textDecoration: "underline" }}>Limpiar</button>
        )}
      </div>
      {showAdvanced && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "-4px 0 12px", padding: "9px 10px", border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 10, alignItems: "center" }}>
          <select className="stock-workspace-control" value={sedeF} onChange={(e) => setSedeF(e.target.value)} style={MOV_INP}>
            <option value="todas">Todas las sedes</option>
            <option value="Pampa">Pampa</option>
            <option value="Chubut">Chubut</option>
          </select>
          <label style={{ fontSize: 10.5, color: C.dim, display: "inline-flex", gap: 5, alignItems: "center", fontWeight: 650 }}>Desde<input className="stock-workspace-control" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={MOV_INP} /></label>
          <label style={{ fontSize: 10.5, color: C.dim, display: "inline-flex", gap: 5, alignItems: "center", fontWeight: 650 }}>Hasta<input className="stock-workspace-control" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={MOV_INP} /></label>
          <label style={{ minHeight: isMobile ? 44 : 34, fontSize: 11, color: C.dim, display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={incluirAnulados} onChange={(e) => setIncluirAnulados(e.target.checked)} /> Ver anulados</label>
        </div>
      )}
      {showStats && (
        <div style={{ marginBottom: 12, display: "grid", gap: 9 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <MovKpi label="Ingresos" value={kpis.ing} detail={`${fmtQty(kpis.uIn)} u`} color={C.green} />
            <MovKpi label="Egresos" value={kpis.egr} detail={`${fmtQty(kpis.uOut)} u`} color={C.red} />
            <MovKpi label="Traspasos" value={kpis.tras} detail="internos" color={C.blue} />
            <MovKpi label="Total" value={movimientos.length} detail="filtrados" color={C.violet} />
          </div>
          <PanolRetirosDashboard rows={retirosDashboard} isMobile={isMobile} />
        </div>
      )}
      {movimientos.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 12 }}>Sin movimientos con esos filtros.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {movimientos.slice(0, renderLimit).map((m) => (
            <MovRow key={m.key} m={m} obraById={obraById} isMobile={isMobile}
              onDevolucion={(row) => setDevolucion({ row, cantidad: String(Math.abs(Number(row.cantidad) || 0) || ""), motivo: "defectuoso", detalle: "", necesita: "esperando_reposicion", responsable: "sin_definir" })} />
          ))}
          {movimientos.length > renderLimit && (
            <button type="button" className="stock-workspace-control" onClick={() => setRenderLimit((value) => Math.min(value + 120, movimientos.length))} style={{ minHeight: 38, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.blue, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: C.sans }}>
              Mostrar {Math.min(120, movimientos.length - renderLimit)} más · quedan {movimientos.length - renderLimit}
            </button>
          )}
        </div>
      )}

      {devolucion && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(15,23,42,0.42)", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ width: "min(500px, 100%)", border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, boxShadow: "0 24px 70px rgba(15,23,42,0.25)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ color: C.text, fontSize: 16, fontWeight: 750 }}>Generar devolución</div>
              <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
                {devolucion.row.descripcion}
                {devolucion.row.retirado_por ? ` · lo retiró ${devolucion.row.retirado_por}` : ""}
              </div>
            </div>

            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 10 }}>
                <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
                  <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Cantidad</span>
                  <input value={devolucion.cantidad} inputMode="decimal" size={1}
                    onChange={(e) => setDevolucion((p) => ({ ...p, cantidad: e.target.value }))}
                    style={{ width: "100%", minWidth: 0, boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.mono, outline: "none" }} />
                </label>
                <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
                  <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Motivo</span>
                  <select value={devolucion.motivo}
                    onChange={(e) => setDevolucion((p) => ({ ...p, motivo: e.target.value }))}
                    style={{ width: "100%", minWidth: 0, boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.sans, outline: "none" }}>
                    {DEVOLUCION_MOTIVOS.map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
                  </select>
                </label>
              </div>

              <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Qué le pasa</span>
                <input value={devolucion.detalle} placeholder="Ej: vino con la rosca pasada" size={1}
                  onChange={(e) => setDevolucion((p) => ({ ...p, detalle: e.target.value }))}
                  style={{ width: "100%", minWidth: 0, boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.sans, outline: "none" }} />
              </label>

              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Qué necesita</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DEVOLUCION_NECESITA.map(([valor, label]) => {
                    const on = devolucion.necesita === valor;
                    return (
                      <button key={valor} type="button"
                        onClick={() => setDevolucion((p) => ({ ...p, necesita: valor }))}
                        style={{
                          padding: "7px 12px", borderRadius: 9, cursor: "pointer",
                          border: `1px solid ${on ? C.blueB : C.border}`,
                          background: on ? C.blueL : C.panel,
                          color: on ? C.blue : C.muted,
                          fontSize: 12, fontWeight: on ? 700 : 650, fontFamily: C.sans,
                        }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Una rotura nuestra también se registra: el material salió y no
                  vuelve al stock. Lo que cambia es que no se le puede reclamar
                  al proveedor, y de eso depende el total del reclamo. */}
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>De quién fue</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DEVOLUCION_RESPONSABLE.map(([valor, label]) => {
                    const on = devolucion.responsable === valor;
                    return (
                      <button key={valor} type="button"
                        onClick={() => setDevolucion((p) => ({ ...p, responsable: valor }))}
                        style={{
                          padding: "7px 12px", borderRadius: 9, cursor: "pointer",
                          border: `1px solid ${on ? C.blueB : C.border}`,
                          background: on ? C.blueL : C.panel,
                          color: on ? C.blue : C.muted,
                          fontSize: 12, fontWeight: on ? 700 : 650, fontFamily: C.sans,
                        }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ border: `1px solid ${C.cyanB}`, background: C.cyanL, borderRadius: 10, padding: "9px 11px", color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                Esto <b>no deshace el egreso</b>: el material salió de verdad. Queda apartado sin volver al
                stock, se avisa a Compras para que definan reparación o reposición, y la obra queda con esa
                cantidad pendiente.
              </div>
            </div>

            <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setDevolucion(null)}
                style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.muted, borderRadius: 9, padding: "8px 14px", cursor: "pointer", fontSize: 12, fontWeight: 650, fontFamily: C.sans }}>
                Cancelar
              </button>
              <button type="button" disabled={devolucionBusy}
                onClick={async () => {
                  setDevolucionBusy(true);
                  try {
                    await registrarDevolucion({
                      snapshotId: devolucion.row.id,
                      cantidad: devolucion.cantidad,
                      motivo: devolucion.motivo,
                      detalle: devolucion.detalle || null,
                      necesita: devolucion.necesita,
                      responsable: devolucion.responsable,
                    });
                    setDevolucion(null);
                    toastMov?.success?.("Devolución registrada. Compras fue avisado.");
                  } catch (error) {
                    toastMov?.error?.(error.message || "No se pudo registrar la devolución.");
                  } finally {
                    setDevolucionBusy(false);
                  }
                }}
                style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 9, padding: "8px 16px", cursor: devolucionBusy ? "default" : "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.sans, opacity: devolucionBusy ? 0.6 : 1 }}>
                {devolucionBusy ? "Registrando…" : "Registrar devolución"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

function NuevaObraExternaModal({ onClose, onCreated }) {
  const [modelo, setModelo] = useState("HUNTER");
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const cleanCode = String(codigo || "").trim().toUpperCase();
  const finalCode = cleanCode
    ? (cleanCode.startsWith(modelo) ? cleanCode : `${modelo}-${cleanCode}`)
    : `${modelo}-…`;
  const fieldStyle = {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    border: `1px solid ${C.border}`,
    background: C.panel,
    color: C.text,
    borderRadius: 10,
    padding: "10px 11px",
    fontSize: 13,
    fontFamily: C.sans,
    outline: "none",
  };

  async function submit(event) {
    event.preventDefault();
    if (!cleanCode || busy) return;
    setBusy(true);
    setError("");
    try {
      const obra = await crearObraExterna({ codigo: cleanCode, modelo, descripcion });
      onCreated(obra);
    } catch (err) {
      setError(err?.message || "No se pudo crear el barco.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.48)", backdropFilter: "blur(5px)", display: "grid", placeItems: "center", padding: 16 }}
    >
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="nueva-obra-externa-titulo" style={{ width: "min(470px, 100%)", border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 16, boxShadow: "0 24px 70px rgba(15,23,42,0.28)", overflow: "hidden" }}>
        <div style={{ padding: "15px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", gap: 11 }}>
          <div style={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 10, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue }}>
            <ShipWheel size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="nueva-obra-externa-titulo" style={{ color: C.text, fontSize: 16, fontWeight: 750 }}>Nuevo barco externo</div>
            <div style={{ color: C.dim, fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>Se podrá usar en ingresos, egresos y movimientos de Pañol. No crea matriz ni planificación de producción.</div>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} disabled={busy} style={{ border: "none", background: "transparent", color: C.dim, padding: 4, cursor: busy ? "default" : "pointer", display: "grid", placeItems: "center" }}><X size={17} /></button>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 13 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Tipo de barco</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              {["HUNTER", "ANTAGO"].map((option) => {
                const selected = modelo === option;
                return (
                  <button key={option} type="button" onClick={() => setModelo(option)} style={{ border: `1px solid ${selected ? C.blueB : C.border}`, background: selected ? C.blueL : C.panel, color: selected ? C.blue : C.muted, borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: C.sans }}>
                    {option === "HUNTER" ? "Hunter" : "Antago"}
                  </button>
                );
              })}
            </div>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Código o identificación *</span>
            <input autoFocus required value={codigo} onChange={(event) => setCodigo(event.target.value)} placeholder="Ej.: 01, CLIENTE-5 o HUNTER-01" style={{ ...fieldStyle, fontFamily: C.mono, textTransform: "uppercase" }} />
            <span style={{ color: C.dim, fontSize: 10.5 }}>Se guardará como <b style={{ color: C.text, fontFamily: C.mono }}>{finalCode}</b></span>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Detalle opcional</span>
            <input value={descripcion} onChange={(event) => setDescripcion(event.target.value)} placeholder="Cliente, procedencia o referencia" style={fieldStyle} />
          </label>

          {error && <div style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, padding: "9px 11px", fontSize: 11.5 }}>{error}</div>}
        </div>

        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.muted, borderRadius: 9, padding: "8px 13px", cursor: busy ? "default" : "pointer", fontSize: 12, fontWeight: 650, fontFamily: C.sans }}>Cancelar</button>
          <button type="submit" disabled={busy || !cleanCode} style={{ border: `1px solid ${C.blueB}`, background: C.blue, color: "#fff", borderRadius: 9, padding: "8px 14px", cursor: busy || !cleanCode ? "default" : "pointer", opacity: busy || !cleanCode ? 0.55 : 1, fontSize: 12, fontWeight: 700, fontFamily: C.sans, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} /> {busy ? "Creando…" : "Crear barco"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function StockPanolScreen({ profile, signOut, embedded = false, mode = "stock", screenTitle = "", screenSubtitle = "" }) {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = embedded ? "" : (searchParams.get("tab") || "");
  const requestedView = embedded ? "" : (searchParams.get("view") || "");
  const requestedMaterialId = embedded ? "" : (searchParams.get("material") || "");
  const requestedQuery = embedded ? "" : (searchParams.get("q") || "");
  const normalizedRequestedTab = requestedTab === "mapa" || requestedTab === "reconciliar"
    ? "maestro"
    : requestedTab === "devoluciones" || requestedTab === "normalizacion"
      ? "movimientos"
      : requestedTab;
  // 1180px: en tablet (sidebar 280px + panel de 2 columnas ~830px) el layout de escritorio
  // desbordaba y "rompía" la pantalla. Por debajo de 1180 usamos el layout apilado.
  const { isMobile } = useResponsive(1180);
  const toast = useToast();

  const role = profile?.role;
  const isAdmin = hasAdminAccess(profile);
  const isManager = isAdmin || role === "compras";
  const canNormalize = isAdmin || ["compras", "tecnica"].includes(role);
  const userSede = canonicalPanolSede(profile?.sede);
  const sedeLocked = role === "panol" && userSede ? userSede : null;
  const canReceive = isManager || role === "panol";
  const canSeePrices = role !== "panol"; // el pañol no ve precios ni costos

  // ── Navegación ──
  const [tab, setTab] = useState(() => TABS.some((entry) => entry.key === normalizedRequestedTab) ? normalizedRequestedTab : "maestro");
  const [inventoryView, setInventoryView] = useState(() => requestedTab === "mapa" || requestedView === "mapa" ? "mapa" : "lista");
  const [movimientosView, setMovimientosView] = useState(() => requestedTab === "devoluciones" ? "devoluciones" : requestedTab === "normalizacion" ? "normalizacion" : "todos");
  const [maestroScope, setMaestroScope] = useState(() => requestedTab === "reconciliar" ? "reconciliar" : "existencia");
  const [selLinea, setSelLinea] = useState(null); // e.g. "37"
  const [selObraId, setSelObraId] = useState(null);
  const [obraQuery, setObraQuery] = useState("");
  const [soloActivas, setSoloActivas] = useState(true); // las obras cerradas quedan fuera hasta pedirlas
  const [showNuevaObraExterna, setShowNuevaObraExterna] = useState(false);

  // ── Datos ──
  const [rows, setRows] = useState([]);
  // Los consumibles corren por su propio apartado: acá se usan para sacarlos
  // del stock maestro y del historial general.
  const [consumibleIds, setConsumibleIds] = useState(() => new Set());
  const [obras, setObras] = useState([]);
  const [cierresByObra, setCierresByObra] = useState(() => new Map());
  const [transitRows, setTransitRows] = useState([]);
  const [replenishmentCatalog, setReplenishmentCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [obrasLoading, setObrasLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    setObrasLoading(true);
    try {
      const sede = sedeLocked || null;
      // El ledger y el índice de consumibles alcanzan para pintar Stock maestro.
      // Obras, tránsito y reposición arrancan a la vez pero se hidratan después,
      // sin mantener bloqueada toda la pantalla.
      const obrasPromise = fetchObrasEgreso().catch(() => []);
      const cierresPromise = fetchCierresAbiertosPorObra().catch(() => new Map());
      const transitPromise = fetchPanolInTransitInventory().catch(() => []);
      const replenishmentPromise = fetchPanolReplenishmentCatalog().catch(() => []);
      const [stockRows, consumibles] = await Promise.all([
        fetchMaterialesEgreso({ sede, estados: LEDGER_STATES }),
        fetchConsumibleIds().catch(() => new Set()),
      ]);
      setRows(stockRows);
      setConsumibleIds(consumibles);
      setLoading(false);

      const [obraRows, cierresMap] = await Promise.all([obrasPromise, cierresPromise]);
      setObras(obraRows);
      setCierresByObra(cierresMap);
      setObrasLoading(false);

      const [transitInventory, replenishmentRows] = await Promise.all([
        transitPromise,
        replenishmentPromise,
      ]);
      setTransitRows(transitInventory);
      setReplenishmentCatalog(replenishmentRows);
    } catch (e) {
      toast.error(e.message || "No se pudo cargar el stock.");
    } finally {
      setLoading(false);
      setObrasLoading(false);
    }
  }, [sedeLocked, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (embedded) return;
    if (requestedTab === "mapa" || requestedView === "mapa") setInventoryView("mapa");
    else if (normalizedRequestedTab === "maestro") setInventoryView("lista");
    if (requestedTab === "reconciliar") setMaestroScope("reconciliar");
    if (requestedTab === "devoluciones") setMovimientosView("devoluciones");
    else if (requestedTab === "normalizacion" && canNormalize) setMovimientosView("normalizacion");
    if (!TABS.some((entry) => entry.key === normalizedRequestedTab) || normalizedRequestedTab === tab) return;
    setTab(normalizedRequestedTab);
  }, [canNormalize, embedded, normalizedRequestedTab, requestedTab, requestedView, tab]);

  // ── Índice: filas agrupadas por obraId ──
  const rowsByObraId = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const id = rowObraId(row);
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(row);
    }
    return map;
  }, [rows]);

  // ── Obras agrupadas por modelo/línea ──
  const lineasVisibles = useMemo(() => {
    const found = new Set(obras.map(lineaKeyFromObra));
    const preferred = MODELOS
      .map((modelo) => String(modelo || "").trim().toUpperCase())
      .filter((modelo) => found.has(modelo));
    const preferredSet = new Set(preferred);
    const rest = [...found]
      .filter((linea) => linea && linea !== LINEA_FALLBACK && !preferredSet.has(linea))
      .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    return found.has(LINEA_FALLBACK) ? [...preferred, ...rest, LINEA_FALLBACK] : [...preferred, ...rest];
  }, [obras]);

  const obrasByLinea = useMemo(() => {
    const map = new Map();
    for (const linea of lineasVisibles) map.set(linea, []);
    for (const obra of obras) {
      // obra.modelo suele venir null; derivamos del código ("52-23" → "52")
      const linea = lineaKeyFromObra(obra);
      if (!map.has(linea)) map.set(linea, []);
      map.get(linea).push(obra);
    }
    for (const [, lineaObras] of map) {
      lineaObras.sort((a, b) => String(a.codigo || "").localeCompare(String(b.codigo || ""), "es", { numeric: true }));
    }
    return map;
  }, [lineasVisibles, obras]);

  // ── Estadísticas por obra ──
  const obraStatsMap = useMemo(() => {
    const map = new Map();
    for (const obra of obras) map.set(obra.id, calcObraStats(rowsByObraId.get(obra.id) || []));
    return map;
  }, [obras, rowsByObraId]);

  const obrasResumen = useMemo(() => {
    let activas = 0, inactivas = 0, conStock = 0, conAlertas = 0;
    for (const obra of obras) {
      const activa = !["terminada", "cancelada", "archivada"].includes(obra.estado);
      if (activa) activas += 1;
      else inactivas += 1;
      const stats = obraStatsMap.get(obra.id) || {};
      const totalItems = (stats.itemsStock || 0) + (stats.itemsStd || 0) + (stats.itemsAdd || 0);
      if (totalItems > 0) conStock += 1;
      if (Number(stats.negativos || 0) > 0) conAlertas += 1;
    }
    return { activas, inactivas, conStock, conAlertas };
  }, [obraStatsMap, obras]);

  const obraGroupsVisibles = useMemo(() => {
    const query = norm(obraQuery);
    return lineasVisibles.map((linea) => {
      const lineaObras = (obrasByLinea.get(linea) || []).filter((obra) => {
        const activa = !["terminada", "cancelada", "archivada"].includes(obra.estado);
        if (soloActivas && !activa) return false;
        if (!query) return true;
        return norm([obra.codigo, obra.linea_nombre, lineaLabel(linea)].filter(Boolean).join(" ")).includes(query);
      });
      return { linea, obras: lineaObras };
    }).filter((group) => group.obras.length > 0);
  }, [obraQuery, lineasVisibles, obrasByLinea, soloActivas]);

  // Filtro por obra completa para pre-filtrar StockWmsPanel al hacer drill-down.
  const selObraLocationKey = useMemo(() => {
    if (!selObraId) return null;
    return `obra::${selObraId}`;
  }, [selObraId]);

  const selObra = useMemo(() => obras.find(o => o.id === selObraId) || null, [obras, selObraId]);

  // ── Cambio de tab resetea la navegación ──
  function handleTabChange(key) {
    setTab(key);
    if (!embedded) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("tab", key);
      if (key !== "maestro") nextParams.delete("view");
      setSearchParams(nextParams, { replace: true });
    }
  }

  function handleInventoryView(view) {
    setInventoryView(view);
    if (!embedded) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("tab", "maestro");
      if (view === "mapa") nextParams.set("view", "mapa");
      else nextParams.delete("view");
      setSearchParams(nextParams, { replace: true });
    }
  }

  function handleMovimientosView(view) {
    setMovimientosView(view);
    if (embedded) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", view === "devoluciones" ? "devoluciones" : view === "normalizacion" ? "normalizacion" : "movimientos");
    nextParams.delete("view");
    setSearchParams(nextParams, { replace: true });
  }

  // Lo que ve el stock maestro y el historial: todo menos los consumibles.
  // "Por obra" no se toca: adentro de un barco los consumibles van con el
  // resto, separados por su rubro.
  const rowsSinConsumibles = useMemo(() => sinConsumibles(rows, consumibleIds), [rows, consumibleIds]);
  const consumiblesOcultos = rows.length - rowsSinConsumibles.length;

  const wmsProps = {
    sedeLocked,
    isMobile,
    toast,
    mode,
    canReceive,
    canCreateCatalog: isManager,
    canSeePrices,
    sharedRows: rows,
    sharedObras: obras,
    sharedTransitRows: transitRows,
    sharedReplenishmentCatalog: replenishmentCatalog,
    sharedLoading: loading,
    onReceiveStock: (group) => {
      const transitRow = (group?.rows || []).find((row) => rowIsTransit(row));
      const params = new URLSearchParams({ tab: "recepcion" });
      if (transitRow?.panol_envio_id) params.set("envio", transitRow.panol_envio_id);
      const materialId = transitRow?.material_id || transitRow?.requisito_material_id || group?.material?.id;
      if (materialId) params.set("material", materialId);
      if (transitRow?.panol_envio_item_id) params.set("item", transitRow.panol_envio_item_id);
      nav(`/recepcion-panol?${params.toString()}`);
    },
    onRequestReplenishment: (group) => {
      const materialId = group?.material?.id || group?.material_id || "";
      const params = new URLSearchParams();
      if (materialId) params.set("material", materialId);
      if (group?.label) params.set("q", group.label);
      nav(`/scan-pedido${params.size ? `?${params.toString()}` : ""}`);
    },
    onOpenCatalog: (materialId) => {
      if (materialId) nav(`/catalogo-maestro?material=${materialId}`);
      else nav("/catalogo-maestro");
    },
  };
  const refreshBtn = (
    <button type="button" onClick={cargar} disabled={loading} title="Actualizar" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 10, padding: 8, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, display: "grid", placeItems: "center", flexShrink: 0 }}>
      <RefreshCw size={15} />
    </button>
  );

  const body = (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          <style>{`
            @keyframes stkNav{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
            .stock-primary-tab:focus-visible,.stock-view-toggle:focus-visible,.stock-workspace-control:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
            @media (prefers-reduced-motion:reduce){.stock-workspace-content{animation:none!important}}
          `}</style>

          {/* ── Header (solo pantalla completa) ── */}
          {!embedded && (
          <div style={{
            background: C.topbar, ...GLASS, borderBottom: `1px solid ${C.border}`,
            padding: isMobile ? "6px 10px" : "6px 14px",
            display: "flex", alignItems: "center", gap: 9, flexShrink: 0,
          }}>
            <div style={{ width: 27, height: 27, borderRadius: 8, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}>
              <Warehouse size={14} />
            </div>
            {/* Título y bajada en la misma línea. La bajada explica de qué va la
                pantalla: se lee una vez y después sólo ocupa alto útil. */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>{screenTitle || "Stock de pañol"}</div>
              <div style={{ fontSize: 9.5, color: C.dim, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 650 }}>
                {screenSubtitle || (sedeLocked ? `Pañol ${sedeLocked}` : "Stock real por obra, proveedor, rubro y categoría")}
              </div>
            </div>
            <button
              type="button"
              onClick={cargar}
              disabled={loading}
              title="Actualizar"
              style={{ width: 29, height: 29, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 8, padding: 0, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, display: "grid", placeItems: "center", flexShrink: 0 }}
            >
              <RefreshCw size={13} />
            </button>
          </div>
          )}

          {/* ── Tabs ── */}
          <div style={{ minHeight: 36, background: C.topbarSoft, borderBottom: `1px solid ${C.border}`, padding: isMobile ? "0 8px" : "0 14px", display: "flex", alignItems: "stretch", gap: 2, flexShrink: 0, overflowX: "auto" }}>
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                className="stock-primary-tab"
                onClick={() => handleTabChange(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                style={{
                  minHeight: isMobile ? 40 : 35, padding: isMobile ? "7px 12px" : "5px 12px", cursor: "pointer", fontSize: 11.5, fontFamily: C.sans,
                  fontWeight: tab === t.key ? 700 : 600,
                  color: tab === t.key ? C.text : C.dim,
                  background: "transparent", border: "none",
                  borderBottom: `2px solid ${tab === t.key ? C.blue : "transparent"}`,
                  marginBottom: -1, transition: "color .15s, border-color .15s",
                  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                }}
              >
                {t.label}
                {t.key === "sobrantes" && cierresByObra.size > 0 && (
                  <span style={{
                    minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999,
                    background: C.cyanL, border: `1px solid ${C.cyanB}`, color: C.cyan,
                    fontSize: 10, fontWeight: 750, display: "inline-grid", placeItems: "center", fontFamily: C.mono,
                  }}>
                    {cierresByObra.size}
                  </span>
                )}
              </button>
            ))}
            <div style={{ marginLeft: "auto", alignSelf: "center", display: "flex", alignItems: "center", gap: 8, paddingLeft: 12 }}>
              {tab === "maestro" && (
                <div role="group" aria-label="Vista del inventario" style={{ display: "inline-flex", gap: 2, padding: 3, border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 9 }}>
                  {[
                    ["lista", List, "Lista"],
                    ["mapa", MapIcon, "Mapa"],
                  ].map(([key, Icon, label]) => {
                    const active = inventoryView === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        className="stock-view-toggle"
                        onClick={() => handleInventoryView(key)}
                        aria-pressed={active}
                        style={{ minHeight: isMobile ? 44 : 30, minWidth: isMobile ? 44 : "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px solid ${active ? C.blueB : "transparent"}`, background: active ? C.blueL : "transparent", color: active ? C.blue : C.dim, borderRadius: 7, padding: "4px 9px", cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: C.sans, whiteSpace: "nowrap" }}
                      >
                        {createElement(Icon, { size: 13 })} {!isMobile && label}
                      </button>
                    );
                  })}
                </div>
              )}
              {embedded && refreshBtn}
            </div>
          </div>

          {/* ── Área de contenido ── */}
          <div className="stock-workspace-content" key={`nav-${tab}-${inventoryView}`} style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", animation: "stkNav .22s ease-out" }}>

            {/* ── TAB: Por obra — selector persistente + inventario de la obra ── */}
            {tab === "obra" && (
              <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "284px minmax(0, 1fr)", background: C.bg }}>
                <aside
                  aria-label="Selector de obras"
                  style={{
                    minHeight: 0,
                    display: isMobile && selObra ? "none" : "flex",
                    flexDirection: "column",
                    borderRight: isMobile ? "none" : `1px solid ${C.border}`,
                    background: C.panel,
                  }}
                >
                  <div style={{ padding: "12px 12px 10px", borderBottom: `1px solid ${C.border}`, display: "grid", gap: 9, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div style={{ color: C.text, fontSize: 13.5, fontWeight: 750 }}>Obras</div>
                        <div style={{ color: C.dim, fontSize: 10.5, marginTop: 1 }}>{obrasResumen.activas} activas · {obrasResumen.conStock} con stock</div>
                      </div>
                      <button
                        type="button"
                        className="stock-workspace-control"
                        aria-pressed={!soloActivas}
                        onClick={() => setSoloActivas((value) => !value)}
                        style={{ minHeight: isMobile ? 44 : 30, border: `1px solid ${!soloActivas ? C.violetB : C.border}`, background: !soloActivas ? C.violetL : C.panelSolid, color: !soloActivas ? C.violet : C.dim, borderRadius: 999, padding: "4px 9px", cursor: "pointer", fontSize: 10.5, fontWeight: 700, fontFamily: C.sans, whiteSpace: "nowrap" }}
                      >
                        {soloActivas ? `Ver inactivas (${obrasResumen.inactivas})` : "Ocultar inactivas"}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      <span style={{ color: C.green, background: C.greenL, border: `1px solid ${C.greenB}`, borderRadius: 999, padding: "2px 7px", fontSize: 9.5, fontWeight: 700 }}>{obrasResumen.activas} activas</span>
                      {obrasResumen.conAlertas > 0 && <span style={{ color: C.red, background: C.redL, border: `1px solid ${C.redB}`, borderRadius: 999, padding: "2px 7px", fontSize: 9.5, fontWeight: 700 }}>{obrasResumen.conAlertas} a reconciliar</span>}
                    </div>
                    <div style={{ position: "relative" }}>
                      <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.dim, pointerEvents: "none" }} />
                      <input
                        className="stock-workspace-control"
                        value={obraQuery}
                        onChange={(event) => setObraQuery(event.target.value)}
                        aria-label="Buscar obra"
                        placeholder="Buscar obra…"
                        style={{ width: "100%", boxSizing: "border-box", minHeight: isMobile ? 44 : 34, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "7px 34px 7px 30px", outline: "none", fontFamily: C.sans, fontSize: 12 }}
                      />
                      {obraQuery && (
                        <button type="button" className="stock-workspace-control" onClick={() => setObraQuery("")} title="Limpiar búsqueda" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: isMobile ? 36 : 26, height: isMobile ? 36 : 26, border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "grid", placeItems: "center", borderRadius: 6 }}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <div aria-label="Composición de stock por obra" style={{ display: "flex", alignItems: "center", gap: 9, color: C.dim, fontSize: 9.5 }}>
                      {[[C.green, "Stock"], [C.blue, "Asignado"], [C.violet, "Adicional"]].map(([color, label]) => (
                        <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: color }} />{label}</span>
                      ))}
                    </div>
                  </div>

                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 7px 12px" }}>
                    {obrasLoading ? (
                      <div style={{ padding: "28px 12px", textAlign: "center", color: C.dim, fontSize: 12 }}>Cargando obras…</div>
                    ) : obraGroupsVisibles.length === 0 ? (
                      <div style={{ margin: 5, padding: "24px 12px", textAlign: "center", color: C.dim, border: `1px dashed ${C.border}`, borderRadius: 10, display: "grid", justifyItems: "center", gap: 8 }}>
                        <Inbox size={20} />
                        <span style={{ fontSize: 11.5 }}>No hay obras para esos filtros.</span>
                      </div>
                    ) : obraGroupsVisibles.map(({ linea, obras: lineaObras }) => (
                      <section key={linea} style={{ marginBottom: 10 }}>
                        <div style={{ padding: "4px 8px 5px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ color: C.dim, fontSize: 9.5, fontWeight: 750, textTransform: "uppercase", letterSpacing: 0.9 }}>Línea {lineaLabel(linea)}</span>
                          <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 9.5 }}>{lineaObras.length}</span>
                        </div>
                        <div style={{ display: "grid", gap: 3 }}>
                          {lineaObras.map((obra) => {
                            const selected = obra.id === selObraId;
                            const stats = obraStatsMap.get(obra.id) || {};
                            const totalItems = (stats.itemsStock || 0) + (stats.itemsStd || 0) + (stats.itemsAdd || 0);
                            const hasIssue = Number(stats.negativos || 0) > 0;
                            const activa = !["terminada", "cancelada", "archivada"].includes(obra.estado);
                            const stockPart = totalItems ? ((stats.itemsStock || 0) / totalItems) * 100 : 0;
                            const stdPart = totalItems ? ((stats.itemsStd || 0) / totalItems) * 100 : 0;
                            const addPart = Math.max(0, 100 - stockPart - stdPart);
                            return (
                              <button
                                key={obra.id}
                                type="button"
                                className="stock-workspace-control"
                                aria-current={selected ? "page" : undefined}
                                onClick={() => { setSelLinea(linea); setSelObraId(obra.id); }}
                                style={{ width: "100%", minHeight: isMobile ? 56 : 54, border: `1px solid ${selected ? C.blueB : "transparent"}`, borderLeft: `3px solid ${selected ? C.blue : hasIssue ? C.red : activa ? C.green : C.border2}`, background: selected ? C.blueL : "transparent", color: selected ? C.blue : C.text, borderRadius: 9, padding: "7px 8px", cursor: "pointer", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 8, textAlign: "left", fontFamily: C.sans, opacity: activa ? 1 : 0.72 }}
                              >
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: C.mono, fontSize: 12, fontWeight: 750 }}>{obra.codigo}</span>
                                    <span style={{ flexShrink: 0, color: activa ? C.green : C.dim, border: `1px solid ${activa ? C.greenB : C.border}`, background: activa ? C.greenL : C.panelSolid, borderRadius: 999, padding: "1px 5px", fontSize: 8.5, fontWeight: 700, textTransform: "uppercase" }}>{obra.estado || "sin estado"}</span>
                                  </span>
                                  <span title={`Stock ${stats.itemsStock || 0} · Asignado ${stats.itemsStd || 0} · Adicional ${stats.itemsAdd || 0}`} style={{ display: "flex", height: 4, marginTop: 7, overflow: "hidden", borderRadius: 999, background: C.panel2 }}>
                                    {stockPart > 0 && <span style={{ width: `${stockPart}%`, background: C.green }} />}
                                    {stdPart > 0 && <span style={{ width: `${stdPart}%`, background: C.blue }} />}
                                    {addPart > 0 && totalItems > 0 && <span style={{ width: `${addPart}%`, background: C.violet }} />}
                                  </span>
                                </span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: hasIssue ? C.red : selected ? C.blue : C.dim, fontFamily: C.mono, fontSize: 10.5, fontWeight: 700 }}>
                                  {hasIssue && <span title={`${stats.negativos} ítems a reconciliar`} style={{ width: 6, height: 6, borderRadius: 999, background: C.red }} />}
                                  <span title={`${totalItems} productos con saldo`}>{totalItems}</span>
                                  <ChevronRight size={12} />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>

                  {(isAdmin || role === "panol") && (
                    <div style={{ padding: 9, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                      <button type="button" className="stock-workspace-control" onClick={() => setShowNuevaObraExterna(true)} style={{ width: "100%", minHeight: isMobile ? 44 : 34, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 9, padding: "7px 9px", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: C.sans, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <Plus size={13} /> Nuevo Hunter / Antago
                      </button>
                    </div>
                  )}
                </aside>

                <section style={{ minWidth: 0, minHeight: 0, display: isMobile && !selObra ? "none" : "flex", flexDirection: "column", background: C.bg }}>
                  {selObra && selObraLocationKey ? (() => {
                    const stats = obraStatsMap.get(selObraId) || {};
                    const consumido = (stats.costoUsdStd || 0) + (stats.costoUsdAdd || 0) + (stats.costoUsdStock || 0);
                    const estadoColors = { activa: C.green, terminada: C.dim, pausada: C.violet, cancelada: C.red, archivada: C.dim };
                    const estadoColor = estadoColors[selObra.estado] || C.dim;
                    return (
                      <>
                        <div style={{ minHeight: 58, padding: isMobile ? "8px 12px" : "8px 18px", borderBottom: `1px solid ${C.border}`, background: C.panel, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
                          {isMobile && (
                            <button type="button" className="stock-workspace-control" onClick={() => setSelObraId(null)} style={{ minHeight: 44, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
                              Volver a obras
                            </button>
                          )}
                          <div style={{ minWidth: 150 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 750, color: C.text }}>{selObra.codigo}</span>
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: estadoColor, border: `1px solid ${estadoColor}33`, background: `${estadoColor}11`, borderRadius: 6, padding: "2px 6px", textTransform: "uppercase" }}>{selObra.estado}</span>
                              {selObra.estado === "terminada" && cierresByObra.get(selObra.id) && (
                                <Link
                                  to={`/sobrantes-obra/${cierresByObra.get(selObra.id).id}`}
                                  style={{ color: C.cyan, fontSize: 11, fontWeight: 700, textDecoration: "none" }}
                                >
                                  Cierre de materiales
                                </Link>
                              )}
                            </div>
                            <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>Línea {lineaLabel(selLinea || lineaKeyFromObra(selObra))}</div>
                          </div>
                          <div style={{ display: "flex", gap: isMobile ? 12 : 18, marginLeft: isMobile ? 0 : "auto", alignItems: "center", flexWrap: "wrap" }}>
                            <StatMini label="Stock" value={stats.itemsStock ?? 0} color={C.green} />
                            <StatMini label="Asignado" value={stats.itemsStd ?? 0} color={C.blue} />
                            <StatMini label="Adicional" value={stats.itemsAdd ?? 0} color={C.violet} />
                            <StatMini label="A reconciliar" value={stats.negativos ?? 0} color={stats.negativos ? C.red : C.dim} />
                            {canSeePrices && consumido > 0 && <StatMini label="Consumido USD" value={fmtQty(consumido)} color={C.green} />}
                          </div>
                        </div>
                        <StockWmsPanel key={`obra-${selObraId}`} {...wmsProps} tableWorkspace initialFObra={selObraLocationKey} />
                      </>
                    );
                  })() : (
                    <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
                      <div style={{ maxWidth: 360, textAlign: "center", display: "grid", justifyItems: "center", gap: 9 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 14, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}><ShipWheel size={22} /></div>
                        <div style={{ color: C.text, fontSize: 15, fontWeight: 750 }}>Elegí una obra</div>
                        <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.45 }}>Seleccioná un barco de la columna izquierda para consultar su stock sin perder el contexto.</div>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ── TAB: Inventario ── */}
            {tab === "maestro" && inventoryView === "lista" && (
              <StockWmsPanel
                key={`maestro-${requestedMaterialId || "todos"}-${maestroScope}`}
                {...wmsProps}
                sharedRows={rowsSinConsumibles}
                stockMaster
                initialScope={maestroScope}
                initialQuery={requestedQuery}
                initialMaterialId={requestedMaterialId}
              />
            )}

            {tab === "maestro" && inventoryView === "mapa" && (
              <MapaPanolTab isMobile={isMobile} toast={toast} canEdit={isManager} />
            )}

            {/* ── TAB: Movimientos (historial general de ingresos/egresos) ── */}
            {tab === "movimientos" && (
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ minHeight: isMobile ? 42 : 36, padding: isMobile ? "3px 8px" : "3px 14px", borderBottom: `1px solid ${C.border}`, background: C.topbarSoft, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <div role="group" aria-label="Tipo de movimiento" style={{ display: "inline-flex", gap: 2, padding: 2, border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 8 }}>
                    {[
                      ["todos", "Historial"],
                      ...(canNormalize ? [["normalizacion", "Estandarización"]] : []),
                      ["devoluciones", "Devoluciones"],
                    ].map(([key, label]) => {
                      const active = movimientosView === key;
                      return (
                        <button key={key} type="button" onClick={() => handleMovimientosView(key)} aria-pressed={active} style={{ minHeight: isMobile ? 36 : 27, border: `1px solid ${active ? C.blueB : "transparent"}`, background: active ? C.blueL : "transparent", color: active ? C.blue : C.dim, borderRadius: 6, padding: "3px 9px", cursor: "pointer", fontSize: 10.5, fontWeight: 700, fontFamily: C.sans }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {movimientosView === "devoluciones" ? (
                  <DevolucionesPanel isMobile={isMobile} />
                ) : movimientosView === "normalizacion" && canNormalize ? (
                  <NormalizacionIngresosPanel
                    rows={rowsSinConsumibles}
                    obras={obras}
                    modelos={lineasVisibles}
                    isMobile={isMobile}
                    onSaved={cargar}
                    onOpenCatalog={(materialId) => nav(`/catalogo-maestro?material=${materialId}`)}
                  />
                ) : (
                  <MovimientosPanel rows={rowsSinConsumibles} obras={obras} isMobile={isMobile} consumiblesOcultos={consumiblesOcultos} />
                )}
              </div>
            )}

            {tab === "sobrantes" && (
              <ListaSobrantesObraPanel profile={profile} signOut={signOut} embedded />
            )}
          </div>
          {showNuevaObraExterna && (
            <NuevaObraExternaModal
              onClose={() => setShowNuevaObraExterna(false)}
              onCreated={async (obra) => {
                setShowNuevaObraExterna(false);
                await cargar();
                setTab("obra");
                setSelLinea(lineaKeyFromObra(obra));
                setSelObraId(obra.id);
                toast.success(`${obra.codigo} ya está disponible para ingresos y egresos.`);
              }}
            />
          )}
        </div>
  );

  if (embedded) return body;

  return (
    <div style={{ background: C.bg, position: "absolute", inset: 0, overflow: "hidden", color: C.text, fontFamily: C.sans }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", height: "100%", overflow: "hidden" }}>
        {body}
      </div>
    </div>
  );
}
