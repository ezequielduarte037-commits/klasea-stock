import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronRight, DollarSign, Inbox, Plus, RefreshCw, Scale, ScanLine, ShipWheel, Warehouse, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { C } from "@/theme";
import StockWmsPanel from "@/features/panol/StockWmsPanel";
import MapaPanolTab from "@/features/panol/MapaPanolTab";
import PanolRetirosDashboard from "@/features/panol/PanolRetirosDashboard";
import DevolucionesPanel from "@/features/panol/DevolucionesPanel";
import { canonicalPanolSede, crearObraExterna, DEVOLUCION_MOTIVOS, DEVOLUCION_NECESITA, DEVOLUCION_RESPONSABLE, fetchMaterialesEgreso, fetchObrasEgreso, fetchPanolMaterialCreations, registrarDevolucion } from "@/features/panol/panolApi";
import { fmtDate, rowMovementAt, rowIsAnulado } from "@/features/panol/panolMovimientos";
import { MODELOS, norm } from "@/features/materiales/materialesParser";
import { hasAdminAccess } from "@/lib/permissions";

const GLASS = {
  backdropFilter: "var(--glass-filter)",
  WebkitBackdropFilter: "var(--glass-filter)",
};

const LEDGER_STATES = ["en_panol", "recibido", "parcial", "egresado", "problema"];
const IN_STOCK_STATES = new Set(["en_panol", "recibido", "parcial"]);
const RECEIVED_STATES = new Set(["recibido", "parcial"]);
const DIRECT_STOCK_SOURCES = new Set(["stock_general", "remito", "transferencia_ingreso", "ajuste_ingreso"]);
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

function rowSource(row) { return String(row.source || "").trim(); }
function rowIsDirectStock(row) {
  const s = rowSource(row);
  return DIRECT_STOCK_SOURCES.has(s) || s.startsWith("stock_") || s.startsWith("transferencia_ingreso");
}
function rowCountsAsStock(row) {
  if (!IN_STOCK_STATES.has(row.estado)) return false;
  const rec = String(row.recepcion_estado || "").trim();
  return RECEIVED_STATES.has(rec) || rowIsDirectStock(row);
}
function rowDelta(row) {
  if (rowCountsAsStock(row)) return qty(row.cantidad, 1);
  const src = rowSource(row);
  if (src.startsWith("egreso") || src.startsWith("transferencia_egreso") || src === "conteo_fisico_reversion") {
    return -Math.abs(qty(row.cantidad_egresada, qty(row.cantidad, 1)));
  }
  return 0;
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
    if (IN_STOCK_STATES.has(row.estado) && !rowCountsAsStock(row)) g.transit += qty(row.cantidad, 1);
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
      <div style={{ fontSize: 10, color: C.dim, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 950, color: color || C.text, lineHeight: 1.25, marginTop: 2 }}>{value}</div>
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
              style={{ background: "none", border: "none", cursor: "pointer", color: C.blue, fontSize: 13, fontWeight: 700, padding: "2px 0", fontFamily: C.sans }}
            >
              {item.label}
            </button>
          ) : (
            <span style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{item.label}</span>
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

function GlobalKpiBar({ rows, consumidoUsd = 0 }) {
  const kpis = useMemo(() => {
    const productMap = new Map();
    for (const row of rows) {
      const key = (rowIsAdditional(row) ? "add" : "std") + "::" + (row.material_id || row.descripcion || row.id || "?");
      if (!productMap.has(key)) productMap.set(key, { total: 0, transit: 0 });
      const g = productMap.get(key);
      g.total += rowDelta(row);
      if (IN_STOCK_STATES.has(row.estado) && !rowCountsAsStock(row)) g.transit += qty(row.cantidad, 1);
    }
    let enStock = 0, negativos = 0, transito = 0;
    for (const [, g] of productMap) {
      if (g.total > 0) enStock++;
      if (g.total < 0) negativos++;
      transito += g.transit;
    }
    return { enStock, negativos, transito: fmtQty(transito) };
  }, [rows]);

  const kpiStyle = { border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, minWidth: 0 };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 20 }}>
      <div style={kpiStyle}>
        <IconBox color={C.blue}><Warehouse size={14} /></IconBox>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 17, fontWeight: 950, color: C.blue, lineHeight: 1 }}>{kpis.enStock}</div>
          <div style={{ color: C.text, fontSize: 11, fontWeight: 800, marginTop: 3 }}>Productos en stock</div>
          <div style={{ color: C.dim, fontSize: 10, marginTop: 1 }}>saldo positivo</div>
        </div>
      </div>
      <div style={kpiStyle}>
        <IconBox color={kpis.negativos ? C.red : C.dim}><AlertTriangle size={14} /></IconBox>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 17, fontWeight: 950, color: kpis.negativos ? C.red : C.dim, lineHeight: 1 }}>{kpis.negativos}</div>
          <div style={{ color: C.text, fontSize: 11, fontWeight: 800, marginTop: 3 }}>A reconciliar</div>
          <div style={{ color: C.dim, fontSize: 10, marginTop: 1 }}>saldo negativo</div>
        </div>
      </div>
      <div style={kpiStyle}>
        <IconBox color={C.violet}><Inbox size={14} /></IconBox>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 17, fontWeight: 950, color: C.violet, lineHeight: 1 }}>{kpis.transito}</div>
          <div style={{ color: C.text, fontSize: 11, fontWeight: 800, marginTop: 3 }}>Por recibir</div>
          <div style={{ color: C.dim, fontSize: 10, marginTop: 1 }}>en tránsito</div>
        </div>
      </div>
      {consumidoUsd > 0 && (
        <div style={kpiStyle}>
          <IconBox color={C.green}><DollarSign size={14} /></IconBox>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 17, fontWeight: 950, color: C.green, lineHeight: 1 }}>{fmtQty(consumidoUsd)}</div>
            <div style={{ color: C.text, fontSize: 11, fontWeight: 800, marginTop: 3 }}>Consumido USD</div>
            <div style={{ color: C.dim, fontSize: 10, marginTop: 1 }}>egresos valorizados</div>
          </div>
        </div>
      )}
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
      <div aria-hidden style={{ position: "absolute", right: -8, top: -18, fontFamily: C.mono, fontSize: 96, fontWeight: 950, color: accent, opacity: hover ? 0.12 : 0.07, lineHeight: 1, pointerEvents: "none", userSelect: "none", transition: "opacity .2s" }}>
        {codigo}
      </div>
      <div style={{ height: 4, background: `linear-gradient(90deg, ${accent}, ${accent}22)` }} />
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 13, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, display: "grid", placeItems: "center", color: "#fff", fontWeight: 950, fontSize: 17, fontFamily: C.mono, flexShrink: 0, background: hasNeg ? "linear-gradient(135deg, #f87171, #ef4444)" : "linear-gradient(135deg, #60a5fa, #3b82f6)", boxShadow: hasNeg ? "0 4px 12px rgba(239,68,68,0.3)" : "0 4px 12px rgba(59,130,246,0.3)" }}>
            {shortCode}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: C.dim, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1.2 }}>{isExternal ? "Barcos externos · solo stock" : "Línea de producción"}</div>
            <div style={{ fontFamily: C.mono, fontSize: 23, fontWeight: 950, color: C.text, lineHeight: 1.05 }}>{codigo}</div>
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
              <span style={{ fontSize: 10, color: C.dim, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6 }}>Consumo USD</span>
              <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 950, color: C.green }}>USD {fmtQty(stats.costoUsd)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: "var(--panel-2, rgba(127,127,127,0.14))", overflow: "hidden" }}>
              <div style={{ width: `${share * 100}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #34d399, #10b981)", transition: "width .4s ease" }} />
            </div>
          </div>
        ) : (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 9 }}>
            <span style={{ fontSize: 11, color: C.dim, fontWeight: 750 }}>{stats.totalObras ? "Ver obras →" : "Sin obras con stock"}</span>
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
      <div aria-hidden style={{ position: "absolute", right: -4, top: -12, fontFamily: C.mono, fontSize: 64, fontWeight: 950, color: accent, opacity: hover ? 0.1 : 0.06, lineHeight: 1, pointerEvents: "none", userSelect: "none", whiteSpace: "nowrap", transition: "opacity .2s" }}>
        {obra.codigo}
      </div>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${accent}, ${accent}22)`, flexShrink: 0 }} />
      <div style={{ padding: "13px 15px", display: "flex", flexDirection: "column", gap: 11, position: "relative", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: C.mono, fontSize: 17, fontWeight: 950, color: C.text, lineHeight: 1.1 }}>{obra.codigo}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{obra.linea_nombre || `Linea ${lineaLabel(lineaKeyFromObra(obra))}`}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: estadoColor, border: `1px solid ${estadoColor}33`, background: `${estadoColor}11`, borderRadius: 6, padding: "2px 7px", textTransform: "uppercase" }}>
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
            <span style={{ fontSize: 10.5, color: C.dim, fontWeight: 750 }}>Consumido (egresos USD)</span>
            <span style={{ fontFamily: C.mono, fontSize: 12.5, fontWeight: 950, color: C.green, whiteSpace: "nowrap" }}>USD {fmtQty(consumido)}</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "obra", label: "Por obra" },
  { key: "maestro", label: "Stock maestro" },
  { key: "movimientos", label: "Movimientos" },
  { key: "devoluciones", label: "Devoluciones" },
  { key: "reconciliar", label: "A reconciliar" },
  { key: "mapa", label: "Mapa" },
];

// ─── Panel de movimientos (historial general: ingresos y egresos) ──────────────
const MOV_INP = { background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12.5, fontFamily: C.sans, outline: "none" };

function movDestino(row) {
  return row.obra?.codigo || (row.stock_sede ? `Stock ${row.stock_sede}` : "Stock general");
}

function rowIsAsignacionStock(row) {
  return rowSource(row) === "transferencia_ingreso";
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
  creacion:     { label: "Producto creado", color: C.blue, sign: "" },
};
const MOV_INTERNAL = new Set(["asignacion", "reasignacion", "asignacion_egreso", "reasignacion_egreso", "liberacion"]);
// Movimientos donde el material efectivamente salió del pañol hacia una persona.
// Sólo estos pueden volver fallados: un ingreso o una asignación interna, no.
const MOV_SALIDA = new Set(["egreso", "solicitud", "asignacion_egreso", "reasignacion_egreso", "consumible"]);

function rowMovementKind(row) {
  const src = rowSource(row);
  const label = String(row.tipo_label || "").toLowerCase();
  if (src === "solicitud_consumible_retiro") return "consumible";
  if (src === "egreso_solicitud") return "solicitud";
  if (rowIsAsignacionStock(row)) return row.obra_origen_id ? "reasignacion" : "asignacion";
  if (row.egreso_destino_obra_id) return row.obra_id ? "reasignacion_egreso" : "asignacion_egreso";
  if (src === "transferencia_egreso") {
    if (label.includes("liber")) return "liberacion";
    return row.obra_id ? "reasignacion_egreso" : "asignacion_egreso";
  }
  if (row.estado === "egresado" || src.startsWith("egreso")) return "egreso";
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
    <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 10, padding: "8px 12px", minWidth: 108 }}>
      <div style={{ fontFamily: C.mono, fontSize: 17, fontWeight: 950, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.text, fontWeight: 800, marginTop: 3 }}>{label}</div>
      <div style={{ fontSize: 10, color: C.dim }}>{detail}</div>
    </div>
  );
}

function MovRow({ m, obraById, onDevolucion }) {
  const meta = MOV_KIND[m.kind] || MOV_KIND.ingreso;
  const col = m.anulado ? C.dim : meta.color;
  const detalle = String(m.row.egreso_nota || m.row.stock_nota || m.row.notas || "").replace(/\[anulado\]/gi, "").trim();
  const isCreation = m.kind === "creacion";
  const esSalida = MOV_SALIDA.has(m.kind);
  const desc = m.row.descripcion || "(sin descripción)";
  const code = m.row.codigo ? ` · ${m.row.codigo}` : "";
  const variant = String(m.row.variante || "").trim();
  const retira = rowMovimientoRetira(m.row);
  const usuario = rowMovimientoUsuario(m.row) || "sin registrar";
  const creationDetail = [
    fmtDate(m.fecha),
    "Catálogo completo",
    `Usuario: ${usuario}`,
    m.row.proveedor || null,
    m.row.origen ? `origen ${m.row.origen}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "84px 1fr auto", gap: 10, alignItems: "center", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.panelSolid, opacity: m.anulado ? 0.55 : 1 }}>
      <span style={{ fontSize: 10, fontWeight: 950, color: col, textTransform: "uppercase", letterSpacing: 0.3 }}>{m.anulado ? "Anulado" : meta.label}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{desc}{code}</div>
        <div style={{ fontSize: 11, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {isCreation ? creationDetail : `${fmtDate(m.fecha)} · ${movDetalleDestino(m.row, m.kind, obraById)}${variant ? ` · Variante: ${variant}` : ""}${retira ? ` · Retira: ${retira}` : ""}${usuario ? ` · Usuario: ${usuario}` : ""}${detalle ? ` · ${detalle}` : ""}`}
        </div>
      </div>
      <span style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 950, color: col }}>{isCreation ? "Nuevo" : `${meta.sign}${fmtQty(m.cant)} ${m.row.unidad || ""}`}</span>
        {/* Distinto de revertir: revertir deshace un movimiento que no debió
            existir; esto registra que salió bien y volvió fallado. */}
        {esSalida && !m.anulado && onDevolucion && (
          <button
            type="button"
            onClick={() => onDevolucion(m.row)}
            title="Salió bien pero el operario lo devolvió fallado"
            style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 8, padding: "5px 9px", cursor: "pointer", fontSize: 10.5, fontWeight: 900, fontFamily: C.sans }}
          >
            Generar devolución
          </button>
        )}
      </span>
    </div>
  );
}

function MovimientosPanel({ rows = [], obras = [], materialCreations = [], isMobile = false }) {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [sedeF, setSedeF] = useState("todas");
  const [incluirAnulados, setIncluirAnulados] = useState(false);
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
    .filter((m) => m.delta !== 0 || m.row.estado === "egresado" || m.kind === "consumible" || MOV_INTERNAL.has(m.kind));
    const creations = (materialCreations || []).map((row) => ({
      key: `creacion:${row.id}`,
      row,
      kind: "creacion",
      cant: 0,
      delta: 0,
      fecha: row.created_at,
      anulado: false,
    }));
    return [...ledger, ...creations]
    .filter((m) => {
      if (!incluirAnulados && m.anulado) return false;
      if (tipo === "traspasos") { if (!MOV_INTERNAL.has(m.kind)) return false; }
      else if (tipo !== "todos" && m.kind !== tipo) return false;
      if (sedeF !== "todas" && (m.row.stock_sede || "") !== sedeF) return false;
      if (desde && (!m.fecha || new Date(m.fecha) < new Date(`${desde}T00:00:00`))) return false;
      if (hasta && (!m.fecha || new Date(m.fecha) > new Date(`${hasta}T23:59:59`))) return false;
      if (q.trim()) {
        const t = norm(q);
        const destino = m.kind === "creacion" ? "catalogo completo producto creado" : movDetalleDestino(m.row, m.kind, obraById);
        const hay = norm([m.row.descripcion, m.row.codigo, m.row.variante, destino, m.row.proveedor, m.row.origen, m.row.retirado_por, m.row.egreso_por_nombre, m.row.created_by_nombre, m.row.egreso_nota, m.row.stock_nota, m.row.notas].filter(Boolean).join(" "));
        if (!hay.includes(t)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }, [rows, materialCreations, q, tipo, sedeF, desde, hasta, incluirAnulados, obraById]);

  const kpis = useMemo(() => {
    let ing = 0, egr = 0, tras = 0, cre = 0, consumibles = 0, uIn = 0, uOut = 0;
    for (const m of movimientos) {
      if (m.kind === "egreso" || m.kind === "solicitud") { egr += 1; uOut += m.cant; }
      else if (m.kind === "consumible") { consumibles += 1; }
      else if (m.kind === "ingreso") { ing += 1; uIn += m.cant; }
      else if (m.kind === "creacion") { cre += 1; }
      else { tras += 1; }
    }
    return { ing, egr, tras, cre, consumibles, uIn, uOut };
  }, [movimientos]);

  const retirosDashboard = useMemo(() => {
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
  }, [movimientos, obraById]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 12 : "16px 18px 28px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <MovKpi label="Ingresos" value={kpis.ing} detail={`${fmtQty(kpis.uIn)} u`} color={C.green} />
        <MovKpi label="Egresos" value={kpis.egr} detail={`${fmtQty(kpis.uOut)} u`} color={C.red} />
        <MovKpi label="Consumibles" value={kpis.consumibles} detail="sin impacto stock" color={C.violet} />
        <MovKpi label="Traspasos" value={kpis.tras} detail="asig/reasig/stock" color={C.blue} />
        <MovKpi label="Productos" value={kpis.cre} detail="creados" color={C.blue} />
        <MovKpi label="Movimientos" value={movimientos.length} detail="filtrados" color={C.violet} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, código, obra, quién..." style={{ ...MOV_INP, flex: "1 1 240px", minWidth: 200 }} />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={MOV_INP}>
          <option value="todos">Todos</option>
          <option value="ingreso">Ingresos</option>
          <option value="egreso">Egresos</option>
          <option value="solicitud">Retiros por solicitud</option>
          <option value="consumible">Consumibles retirados</option>
          <option value="traspasos">Traspasos (todos)</option>
          <option value="asignacion">Asignaciones</option>
          <option value="reasignacion">Reasignaciones</option>
          <option value="liberacion">A stock (liberar)</option>
          <option value="creacion">Productos creados</option>
        </select>
        <select value={sedeF} onChange={(e) => setSedeF(e.target.value)} style={MOV_INP}>
          <option value="todas">Todas las sedes</option>
          <option value="Pampa">Pampa</option>
          <option value="Chubut">Chubut</option>
        </select>
        <label style={{ fontSize: 10.5, color: C.dim, display: "inline-flex", gap: 5, alignItems: "center", fontWeight: 800 }}>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={MOV_INP} /></label>
        <label style={{ fontSize: 10.5, color: C.dim, display: "inline-flex", gap: 5, alignItems: "center", fontWeight: 800 }}>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={MOV_INP} /></label>
        <label style={{ fontSize: 11, color: C.dim, display: "inline-flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={incluirAnulados} onChange={(e) => setIncluirAnulados(e.target.checked)} /> ver anulados</label>
        {(q || tipo !== "todos" || sedeF !== "todas" || desde || hasta) && (
          <button type="button" onClick={() => { setQ(""); setTipo("todos"); setSedeF("todas"); setDesde(""); setHasta(""); }} style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 11.5, fontWeight: 750, textDecoration: "underline" }}>Limpiar</button>
        )}
      </div>
      <PanolRetirosDashboard rows={retirosDashboard} isMobile={isMobile} />
      {movimientos.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 12 }}>Sin movimientos con esos filtros.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {movimientos.slice(0, 500).map((m) => (
            <MovRow key={m.key} m={m} obraById={obraById}
              onDevolucion={(row) => setDevolucion({ row, cantidad: String(Math.abs(Number(row.cantidad) || 0) || ""), motivo: "defectuoso", detalle: "", necesita: "esperando_reposicion", responsable: "sin_definir" })} />
          ))}
          {movimientos.length > 500 && <div style={{ textAlign: "center", color: C.dim, fontSize: 12, padding: 10 }}>Mostrando 500 de {movimientos.length}. Afiná los filtros (fecha/producto) para ver el resto.</div>}
        </div>
      )}

      {devolucion && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(15,23,42,0.42)", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ width: "min(500px, 100%)", border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, boxShadow: "0 24px 70px rgba(15,23,42,0.25)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Generar devolución</div>
              <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
                {devolucion.row.descripcion}
                {devolucion.row.retirado_por ? ` · lo retiró ${devolucion.row.retirado_por}` : ""}
              </div>
            </div>

            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 10 }}>
                <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
                  <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Cantidad</span>
                  <input value={devolucion.cantidad} inputMode="decimal" size={1}
                    onChange={(e) => setDevolucion((p) => ({ ...p, cantidad: e.target.value }))}
                    style={{ width: "100%", minWidth: 0, boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.mono, outline: "none" }} />
                </label>
                <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
                  <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Motivo</span>
                  <select value={devolucion.motivo}
                    onChange={(e) => setDevolucion((p) => ({ ...p, motivo: e.target.value }))}
                    style={{ width: "100%", minWidth: 0, boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.sans, outline: "none" }}>
                    {DEVOLUCION_MOTIVOS.map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
                  </select>
                </label>
              </div>

              <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Qué le pasa</span>
                <input value={devolucion.detalle} placeholder="Ej: vino con la rosca pasada" size={1}
                  onChange={(e) => setDevolucion((p) => ({ ...p, detalle: e.target.value }))}
                  style={{ width: "100%", minWidth: 0, boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.sans, outline: "none" }} />
              </label>

              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Qué necesita</span>
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
                          fontSize: 12, fontWeight: on ? 900 : 750, fontFamily: C.sans,
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
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>De quién fue</span>
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
                          fontSize: 12, fontWeight: on ? 900 : 750, fontFamily: C.sans,
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
                style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.muted, borderRadius: 9, padding: "8px 14px", cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: C.sans }}>
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
                style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 9, padding: "8px 16px", cursor: devolucionBusy ? "default" : "pointer", fontSize: 12, fontWeight: 900, fontFamily: C.sans, opacity: devolucionBusy ? 0.6 : 1 }}>
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
            <div id="nueva-obra-externa-titulo" style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Nuevo barco externo</div>
            <div style={{ color: C.dim, fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>Se podrá usar en ingresos, egresos y movimientos de Pañol. No crea matriz ni planificación de producción.</div>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} disabled={busy} style={{ border: "none", background: "transparent", color: C.dim, padding: 4, cursor: busy ? "default" : "pointer", display: "grid", placeItems: "center" }}><X size={17} /></button>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 13 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Tipo de barco</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              {["HUNTER", "ANTAGO"].map((option) => {
                const selected = modelo === option;
                return (
                  <button key={option} type="button" onClick={() => setModelo(option)} style={{ border: `1px solid ${selected ? C.blueB : C.border}`, background: selected ? C.blueL : C.panel, color: selected ? C.blue : C.muted, borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 900, fontFamily: C.sans }}>
                    {option === "HUNTER" ? "Hunter" : "Antago"}
                  </button>
                );
              })}
            </div>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Código o identificación *</span>
            <input autoFocus required value={codigo} onChange={(event) => setCodigo(event.target.value)} placeholder="Ej.: 01, CLIENTE-5 o HUNTER-01" style={{ ...fieldStyle, fontFamily: C.mono, textTransform: "uppercase" }} />
            <span style={{ color: C.dim, fontSize: 10.5 }}>Se guardará como <b style={{ color: C.text, fontFamily: C.mono }}>{finalCode}</b></span>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Detalle opcional</span>
            <input value={descripcion} onChange={(event) => setDescripcion(event.target.value)} placeholder="Cliente, procedencia o referencia" style={fieldStyle} />
          </label>

          {error && <div style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, padding: "9px 11px", fontSize: 11.5 }}>{error}</div>}
        </div>

        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.muted, borderRadius: 9, padding: "8px 13px", cursor: busy ? "default" : "pointer", fontSize: 12, fontWeight: 800, fontFamily: C.sans }}>Cancelar</button>
          <button type="submit" disabled={busy || !cleanCode} style={{ border: `1px solid ${C.blueB}`, background: C.blue, color: "#fff", borderRadius: 9, padding: "8px 14px", cursor: busy || !cleanCode ? "default" : "pointer", opacity: busy || !cleanCode ? 0.55 : 1, fontSize: 12, fontWeight: 900, fontFamily: C.sans, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} /> {busy ? "Creando…" : "Crear barco"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function StockPanolScreen({ profile, signOut, embedded = false, mode = "stock" }) {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = embedded ? "" : (searchParams.get("tab") || "");
  // 1180px: en tablet (sidebar 280px + panel de 2 columnas ~830px) el layout de escritorio
  // desbordaba y "rompía" la pantalla. Por debajo de 1180 usamos el layout apilado.
  const { isMobile } = useResponsive(1180);
  const toast = useToast();

  const role = profile?.role;
  const isAdmin = hasAdminAccess(profile);
  const isManager = isAdmin || role === "compras";
  const userSede = canonicalPanolSede(profile?.sede);
  const sedeLocked = role === "panol" && userSede ? userSede : null;
  const canReceive = isManager || role === "panol";
  const canSeePrices = role !== "panol"; // el pañol no ve precios ni costos

  // ── Navegación ──
  const [tab, setTab] = useState(() => TABS.some((entry) => entry.key === requestedTab) ? requestedTab : "obra");
  const [selLinea, setSelLinea] = useState(null); // e.g. "37"
  const [selObraId, setSelObraId] = useState(null);
  const [soloActivas, setSoloActivas] = useState(false); // filtro nivel 2 (obras de la línea)
  const [showNuevaObraExterna, setShowNuevaObraExterna] = useState(false);

  // ── Datos ──
  const [rows, setRows] = useState([]);
  const [obras, setObras] = useState([]);
  const [materialCreations, setMaterialCreations] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const sede = sedeLocked || null;
      const [stockRows, obraRows, creationRows] = await Promise.all([
        fetchMaterialesEgreso({ sede, estados: LEDGER_STATES }),
        fetchObrasEgreso().catch(() => []),
        fetchPanolMaterialCreations().catch(() => []),
      ]);
      setRows(stockRows);
      setObras(obraRows);
      setMaterialCreations(creationRows);
    } catch (e) {
      toast.error(e.message || "No se pudo cargar el stock.");
    } finally {
      setLoading(false);
    }
  }, [sedeLocked, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (embedded || !TABS.some((entry) => entry.key === requestedTab) || requestedTab === tab) return;
    setTab(requestedTab);
    setSelLinea(null);
    setSelObraId(null);
  }, [embedded, requestedTab, tab]);

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

  // ── Estadísticas por línea ──
  const lineaStats = useMemo(() => {
    const result = {};
    for (const linea of lineasVisibles) {
      const lineaObras = obrasByLinea.get(linea) || [];
      const statsList = lineaObras.map(o => calcObraStats(rowsByObraId.get(o.id) || []));
      result[linea] = {
        totalObras: lineaObras.length,
        obrasActivas: lineaObras.filter(o => !["terminada", "cancelada", "archivada"].includes(o.estado)).length,
        negativos: statsList.reduce((s, st) => s + st.negativos, 0),
        costoUsd: statsList.reduce((s, st) => s + st.costoUsdStd + st.costoUsdAdd, 0),
      };
    }
    return result;
  }, [lineasVisibles, obrasByLinea, rowsByObraId]);

  // ── Estadísticas por obra ──
  const obraStatsMap = useMemo(() => {
    const map = new Map();
    for (const obra of obras) map.set(obra.id, calcObraStats(rowsByObraId.get(obra.id) || []));
    return map;
  }, [obras, rowsByObraId]);

  // ── Señales globales: negativos (badge en la pestaña) + consumido USD total ──
  const globalExtras = useMemo(() => {
    let consumidoUsd = 0;
    const productMap = new Map();
    for (const row of rows) {
      const key = (rowIsAdditional(row) ? "add" : "std") + "::" + (row.material_id || row.descripcion || row.id || "?");
      productMap.set(key, (productMap.get(key) || 0) + rowDelta(row));
      if (row.estado === "egresado" && String(row.moneda || "").toUpperCase() === "USD" && !rowSource(row).startsWith("transferencia")) {
        consumidoUsd += Math.abs(rowDelta(row)) * qty(row.precio_unitario, 0);
      }
    }
    let negativos = 0;
    for (const [, total] of productMap) if (total < 0) negativos++;
    return { consumidoUsd, negativos };
  }, [rows]);

  // Filtro por obra completa para pre-filtrar StockWmsPanel al hacer drill-down.
  const selObraLocationKey = useMemo(() => {
    if (!selObraId) return null;
    return `obra::${selObraId}`;
  }, [selObraId]);

  const selObra = useMemo(() => obras.find(o => o.id === selObraId) || null, [obras, selObraId]);

  // ── Cambio de tab resetea la navegación ──
  function handleTabChange(key) {
    setTab(key);
    setSelLinea(null);
    setSelObraId(null);
    if (!embedded) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("tab", key);
      setSearchParams(nextParams, { replace: true });
    }
  }

  const wmsProps = { sedeLocked, isMobile, toast, mode, canReceive, canCreateCatalog: isManager, canSeePrices };
  const isLevel3 = tab === "obra" && selObraId != null;

  const refreshBtn = (
    <button type="button" onClick={cargar} disabled={loading} title="Actualizar" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 10, padding: 8, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, display: "grid", placeItems: "center", flexShrink: 0 }}>
      <RefreshCw size={15} />
    </button>
  );

  const body = (
        <div style={{ display: "flex", flexDirection: "column", height: embedded ? "100%" : "100vh", overflow: "hidden" }}>
          <style>{"@keyframes stkNav{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}"}</style>

          {/* ── Header (solo pantalla completa) ── */}
          {!embedded && (
          <div style={{
            background: C.topbar, ...GLASS, borderBottom: `1px solid ${C.border}`,
            padding: isMobile ? "9px 12px 9px 54px" : "10px 18px",
            display: "flex", alignItems: "center", gap: 11, flexShrink: 0,
          }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}>
              <Warehouse size={16} />
            </div>
            {/* Título y bajada en la misma línea. La bajada explica de qué va la
                pantalla: se lee una vez y después sólo ocupa alto útil. */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: C.text, lineHeight: 1.1 }}>Stock de pañol</div>
              <div style={{ fontSize: 10.5, color: C.dim, letterSpacing: 0.9, textTransform: "uppercase", fontWeight: 750 }}>
                {sedeLocked ? `Pañol ${sedeLocked}` : "Stock real por obra, proveedor, rubro y categoría"}
              </div>
            </div>
            <button
              type="button"
              onClick={cargar}
              disabled={loading}
              title="Actualizar"
              style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 10, padding: 8, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, display: "grid", placeItems: "center", flexShrink: 0 }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          )}

          {/* ── Tabs ── */}
          <div style={{ background: C.topbarSoft, borderBottom: `1px solid ${C.border}`, padding: "0 18px", display: "flex", alignItems: "center", gap: 2, flexShrink: 0, overflowX: "auto" }}>
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => handleTabChange(t.key)}
                style={{
                  padding: "8px 14px", cursor: "pointer", fontSize: 12.5, fontFamily: C.sans,
                  fontWeight: tab === t.key ? 800 : 500,
                  color: tab === t.key ? C.text : C.dim,
                  background: "transparent", border: "none",
                  borderBottom: `2px solid ${tab === t.key ? C.blue : "transparent"}`,
                  marginBottom: -1, transition: "color .15s, border-color .15s",
                  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                }}
              >
                {t.label}
                {t.key === "reconciliar" && globalExtras.negativos > 0 && (
                  <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 950, color: "#fff", background: C.red, borderRadius: 999, padding: "1px 6px", lineHeight: 1.4 }}>
                    {globalExtras.negativos}
                  </span>
                )}
              </button>
            ))}
            {/* Acceso a las herramientas de balanza (calibración de peso por pieza). */}
            <div style={{ marginLeft: "auto", alignSelf: "center", display: "flex", alignItems: "center", gap: 8, paddingLeft: 12 }}>
              <button
                type="button"
                onClick={() => nav("/balanza/calibrar")}
                title="Cargar el peso por pieza de los consumibles usando la balanza"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                  border: `1px solid ${C.border}`, background: C.panel, color: C.violet,
                  borderRadius: 999, padding: "6px 13px", cursor: "pointer", fontSize: 12, fontWeight: 850,
                }}
              >
                <Scale size={14} /> Balanza
              </button>
              <button
                type="button"
                onClick={() => nav("/scan-pedido")}
                title="Pantalla del colector: escanear productos y pedir reposición a compras"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                  border: `1px solid ${C.border}`, background: C.panel, color: C.blue,
                  borderRadius: 999, padding: "6px 13px", cursor: "pointer", fontSize: 12, fontWeight: 850,
                }}
              >
                <ScanLine size={14} /> Colector
              </button>
              {embedded && refreshBtn}
            </div>
          </div>

          {/* ── Área de contenido ── */}
          <div key={`nav-${tab}-${selLinea || ""}-${selObraId || ""}`} style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", animation: "stkNav .28s ease-out" }}>

            {/* ── TAB: Por obra — Level 3 (drill-down a obra) ── */}
            {tab === "obra" && isLevel3 && selObraLocationKey && (
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "10px 18px 0", flexShrink: 0 }}>
                  <Breadcrumb items={[
                    { label: "Líneas", onClick: () => { setSelLinea(null); setSelObraId(null); } },
                    { label: `Linea ${lineaLabel(selLinea)}`, onClick: () => setSelObraId(null) },
                    { label: selObra?.codigo || selObraId },
                  ]} />
                  {selObra && (() => {
                    const st = obraStatsMap.get(selObraId) || {};
                    const consumido = (st.costoUsdStd || 0) + (st.costoUsdAdd || 0) + (st.costoUsdStock || 0);
                    const estadoColors = { activa: C.green, terminada: C.dim, pausada: C.violet, cancelada: C.red, archivada: C.dim };
                    const estadoColor = estadoColors[selObra.estado] || C.dim;
                    return (
                      <div style={{ margin: "0 0 10px", padding: "9px 14px", border: `1px solid ${C.border}`, borderRadius: 12, background: C.panelSolid, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 950, color: C.text }}>{selObra.codigo}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, color: estadoColor, border: `1px solid ${estadoColor}33`, background: `${estadoColor}11`, borderRadius: 6, padding: "2px 7px", textTransform: "uppercase" }}>{selObra.estado}</span>
                        {selObra.linea_nombre && <span style={{ fontSize: 11, color: C.dim }}>{selObra.linea_nombre}</span>}
                        <div style={{ display: "flex", gap: 16, marginLeft: "auto", alignItems: "center", flexWrap: "wrap" }}>
                          <StatMini label="Stock" value={st.itemsStock ?? 0} color={C.green} />
                          <StatMini label="Asignado" value={st.itemsStd ?? 0} color={C.blue} />
                          <StatMini label="Adicional" value={st.itemsAdd ?? 0} color={C.violet} />
                          <StatMini label="Neg." value={st.negativos ?? 0} color={st.negativos ? C.red : C.dim} />
                          {canSeePrices && consumido > 0 && <StatMini label="Consumido USD" value={fmtQty(consumido)} color={C.green} />}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <StockWmsPanel
                  key={`obra-${selObraId}`}
                  {...wmsProps}
                  initialFObra={selObraLocationKey}
                />
              </div>
            )}

            {/* ── TAB: Por obra — Level 2 (obras de la línea) ── */}
            {tab === "obra" && selLinea && !selObraId && (() => {
              const todas = obrasByLinea.get(selLinea) || [];
              const activas = todas.filter(o => !["terminada", "cancelada", "archivada"].includes(o.estado));
              const visiblesObras = soloActivas ? activas : todas;
              return (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <div style={{ padding: "16px 18px 32px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <Breadcrumb items={[
                      { label: "Líneas", onClick: () => setSelLinea(null) },
                      { label: `Linea ${lineaLabel(selLinea)}` },
                    ]} />
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <span style={{ fontSize: 11, color: C.dim, fontWeight: 750 }}>{todas.length} obras · {activas.length} activas</span>
                      {todas.length !== activas.length && (
                        <button
                          type="button"
                          onClick={() => setSoloActivas(v => !v)}
                          style={{ border: `1px solid ${soloActivas ? C.greenB : C.border}`, background: soloActivas ? C.greenL : C.panelSolid, color: soloActivas ? C.green : C.dim, borderRadius: 999, padding: "4px 11px", cursor: "pointer", fontSize: 11, fontWeight: 850, fontFamily: C.sans }}
                        >
                          {soloActivas ? "✓ " : ""}Solo activas
                        </button>
                      )}
                    </div>
                  </div>
                  {loading ? (
                    <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13 }}>Cargando...</div>
                  ) : visiblesObras.length === 0 ? (
                    <div style={{ padding: "44px 24px", textAlign: "center", color: C.dim, border: `1px dashed ${C.border}`, borderRadius: 14, background: C.panel, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 46, height: 46, borderRadius: 13, display: "grid", placeItems: "center", background: C.panelSolid, border: `1px solid ${C.border}`, color: C.dim }}>
                        <Inbox size={22} />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{todas.length ? "No hay obras activas en esta línea" : `No hay obras con stock en la linea ${lineaLabel(selLinea)}`}</div>
                      <div style={{ fontSize: 12 }}>{todas.length ? "Sacá el filtro “Solo activas” para ver el resto." : "Cuando compras envíe materiales a una obra de esta línea, van a aparecer acá."}</div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
                      {visiblesObras.map(obra => (
                        <ObraCard
                          key={obra.id}
                          obra={obra}
                          stats={obraStatsMap.get(obra.id) || { itemsStock: 0, itemsStd: 0, itemsAdd: 0, negativos: 0, costoUsdStd: 0, costoUsdAdd: 0 }}
                          onClick={() => setSelObraId(obra.id)}
                          canSeePrices={canSeePrices}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              );
            })()}

            {/* ── TAB: Por obra — Level 1 (líneas) ── */}
            {tab === "obra" && !selLinea && !selObraId && (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <div style={{ padding: "18px 18px 32px" }}>
                  <GlobalKpiBar rows={rows} consumidoUsd={canSeePrices ? globalExtras.consumidoUsd : 0} />
                  <div style={{ margin: "2px 0 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 950, color: C.text }}>Barcos por línea</div>
                      <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>Entrá a una línea para ver el stock de cada barco.</div>
                    </div>
                    {(isAdmin || role === "panol") && (
                      <button
                        type="button"
                        onClick={() => setShowNuevaObraExterna(true)}
                        style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 9, padding: "7px 11px", cursor: "pointer", fontSize: 11.5, fontWeight: 900, fontFamily: C.sans, display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        <Plus size={14} /> Nuevo Hunter / Antago
                      </button>
                    )}
                  </div>
                  {loading ? (
                    <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13 }}>Cargando stock...</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
                      {(() => {
                        const maxCostoUsd = Math.max(0, ...lineasVisibles.map(l => lineaStats[l]?.costoUsd || 0));
                        return lineasVisibles.map(linea => (
                          <LineaCard
                            key={linea}
                            codigo={lineaLabel(linea)}
                            stats={lineaStats[linea] || { totalObras: 0, obrasActivas: 0, negativos: 0, costoUsd: 0 }}
                            onClick={() => setSelLinea(linea)}
                            canSeePrices={canSeePrices}
                            maxCostoUsd={maxCostoUsd}
                          />
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB: Stock maestro ── */}
            {tab === "maestro" && (
              <StockWmsPanel key="maestro" {...wmsProps} showCatalogInventory />
            )}

            {/* ── TAB: Movimientos (historial general de ingresos/egresos) ── */}
            {tab === "movimientos" && (
              <MovimientosPanel rows={rows} obras={obras} materialCreations={materialCreations} isMobile={isMobile} />
            )}

            {tab === "devoluciones" && (
              <DevolucionesPanel isMobile={isMobile} />
            )}

            {/* ── TAB: A reconciliar ── */}
            {tab === "reconciliar" && (
              <StockWmsPanel key="reconciliar" {...wmsProps} initialScope="negativos" />
            )}

            {tab === "mapa" && (
              <MapaPanolTab isMobile={isMobile} toast={toast} canEdit={isManager} />
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
    <div style={{ background: C.bg, position: "fixed", inset: 0, overflow: "hidden", color: C.text, fontFamily: C.sans }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", height: "100%", overflow: "hidden" }}>
        <Sidebar profile={profile} signOut={signOut} />
        {body}
      </div>
    </div>
  );
}
