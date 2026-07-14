import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Inbox, RefreshCw, Warehouse } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { C } from "@/theme";
import StockWmsPanel from "@/features/panol/StockWmsPanel";
import MapaPanolTab from "@/features/panol/MapaPanolTab";
import { fetchMaterialesEgreso, fetchObrasEgreso } from "@/features/panol/panolApi";
import { fmtDate, rowMovementAt, rowIsAnulado } from "@/features/panol/panolMovimientos";
import { MODELOS, norm } from "@/features/materiales/materialesParser";

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
  if (row.estado === "egresado" && (src.startsWith("egreso") || src.startsWith("transferencia_egreso"))) {
    return -Math.abs(qty(row.cantidad_egresada, qty(row.cantidad, 1)));
  }
  return 0;
}

function lineaKeyFromObra(obra = {}) {
  const modelo = String(obra.modelo || "").trim().toUpperCase();
  if (modelo) return modelo;
  const match = String(obra.codigo || "").trim().toUpperCase().match(/^([A-Z]*\d+)/);
  return match?.[1] || LINEA_FALLBACK;
}

function lineaLabel(key) {
  return key === LINEA_FALLBACK ? "Sin linea" : key;
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

function GlobalKpiBar({ rows }) {
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
        <IconBox color={C.amber}><Inbox size={14} /></IconBox>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 17, fontWeight: 950, color: C.amber, lineHeight: 1 }}>{kpis.transito}</div>
          <div style={{ color: C.text, fontSize: 11, fontWeight: 800, marginTop: 3 }}>Por recibir</div>
          <div style={{ color: C.dim, fontSize: 10, marginTop: 1 }}>en tránsito</div>
        </div>
      </div>
    </div>
  );
}

function LineaCard({ codigo, stats, onClick }) {
  const hasNeg = stats.negativos > 0;
  const accent = hasNeg ? C.red : C.blue;
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left", cursor: "pointer", padding: 0, overflow: "hidden",
        border: `1px solid ${hover ? C.blueB : hasNeg ? C.redB : C.border}`,
        borderRadius: 18, background: C.panelSolid,
        display: "flex", flexDirection: "column",
        transform: hover ? "translateY(-4px)" : "none",
        transition: "transform .2s cubic-bezier(.25,.8,.25,1), box-shadow .2s, border-color .2s",
        boxShadow: hover
          ? "0 18px 36px -16px rgba(0,0,0,0.28)"
          : "0 1px 2px rgba(0,0,0,0.04), 0 10px 26px -16px rgba(0,0,0,0.16)",
      }}
    >
      <div style={{ height: 4, background: `linear-gradient(90deg, ${accent}, ${accent}55)` }} />
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, display: "grid", placeItems: "center", color: "#fff", fontWeight: 950, fontSize: 17, fontFamily: C.mono, flexShrink: 0, background: hasNeg ? "linear-gradient(135deg, #f87171, #ef4444)" : "linear-gradient(135deg, #60a5fa, #3b82f6)", boxShadow: hasNeg ? "0 4px 12px rgba(239,68,68,0.3)" : "0 4px 12px rgba(59,130,246,0.3)" }}>
            {codigo}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: C.dim, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1.2 }}>Línea de producción</div>
            <div style={{ fontFamily: C.mono, fontSize: 23, fontWeight: 950, color: C.text, lineHeight: 1.05 }}>K{codigo}</div>
          </div>
          <div style={{ flex: 1 }} />
          <ChevronRight size={18} style={{ color: hover ? C.blue : C.dim, flexShrink: 0, transition: "color .2s" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <StatMini label="Obras" value={stats.totalObras} />
          <StatMini label="Activas" value={stats.obrasActivas} color={C.green} />
          <StatMini label="Negativos" value={stats.negativos} color={hasNeg ? C.red : C.dim} />
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 9 }}>
          <span style={{ fontSize: 11, color: C.dim, fontWeight: 750 }}>{stats.totalObras ? "Ver obras →" : "Sin obras con stock"}</span>
        </div>
      </div>
    </button>
  );
}

function ObraCard({ obra, stats, onClick }) {
  const hasNeg = stats.negativos > 0;
  const [hover, setHover] = useState(false);
  const estadoColors = {
    activa: C.green, terminada: C.dim, pausada: C.amber,
    cancelada: C.red, archivada: C.dim,
  };
  const estadoColor = estadoColors[obra.estado] || C.dim;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left", cursor: "pointer",
        border: `1px solid ${hover ? C.blueB : hasNeg ? C.redB : C.border}`,
        borderRadius: 16, background: hasNeg ? C.redL : C.panelSolid,
        padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
        transform: hover ? "translateY(-3px)" : "none",
        transition: "transform .18s ease, box-shadow .18s, border-color .18s",
        boxShadow: hover ? "0 14px 30px -14px rgba(0,0,0,0.26)" : "0 1px 2px rgba(0,0,0,0.04), 0 8px 22px -14px rgba(0,0,0,0.14)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 950, color: C.text }}>{obra.codigo}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>{obra.linea_nombre || `Linea ${lineaLabel(lineaKeyFromObra(obra))}`}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: estadoColor, border: `1px solid ${estadoColor}33`, background: `${estadoColor}11`, borderRadius: 6, padding: "2px 7px", textTransform: "uppercase" }}>
            {obra.estado}
          </span>
          <ChevronRight size={14} style={{ color: C.dim }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, background: C.bg, borderRadius: 10, padding: "8px 10px" }}>
        <StatMini label="Stock" value={stats.itemsStock} color={C.green} />
        <StatMini label="Estándar" value={stats.itemsStd} color={C.blue} />
        <StatMini label="Adicional" value={stats.itemsAdd} color={C.violet} />
        <StatMini label="Neg." value={stats.negativos} color={hasNeg ? C.red : C.dim} />
      </div>
    </button>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "obra", label: "Por obra" },
  { key: "maestro", label: "Stock maestro" },
  { key: "movimientos", label: "Movimientos" },
  { key: "reconciliar", label: "A reconciliar" },
  { key: "mapa", label: "Mapa" },
];

// ─── Panel de movimientos (historial general: ingresos y egresos) ──────────────
const MOV_INP = { background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12.5, fontFamily: C.sans, outline: "none" };

function movDestino(row) {
  return row.obra?.codigo || (row.stock_sede ? `Stock ${row.stock_sede}` : "Stock general");
}

// Tipo de movimiento con detalle: ingreso / egreso / asignación / reasignación / a stock.
const MOV_KIND = {
  ingreso:      { label: "Ingreso",      color: C.green,  sign: "+" },
  egreso:       { label: "Egreso",       color: C.red,    sign: "−" },
  asignacion:   { label: "Asignación",   color: C.blue,   sign: "→" },
  reasignacion: { label: "Reasignación", color: C.violet, sign: "→" },
  liberacion:   { label: "A stock",      color: C.amber,  sign: "←" },
};
const MOV_INTERNAL = new Set(["asignacion", "reasignacion", "liberacion"]);

function rowMovementKind(row) {
  const src = rowSource(row);
  const label = String(row.tipo_label || "").toLowerCase();
  if (src === "transferencia_egreso") {
    if (label.includes("liber")) return "liberacion";
    return row.obra_id ? "reasignacion" : "asignacion";
  }
  if (row.estado === "egresado" || src.startsWith("egreso")) return "egreso";
  return "ingreso";
}

function movDetalleDestino(row, kind, obraById) {
  const codigo = (id) => (id ? (obraById?.get?.(id)?.codigo || null) : null);
  if (kind === "asignacion" || kind === "reasignacion") {
    const origen = row.obra_id ? (codigo(row.obra_id) || "obra") : "stock";
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

function MovRow({ m, obraById }) {
  const meta = MOV_KIND[m.kind] || MOV_KIND.ingreso;
  const col = m.anulado ? C.dim : meta.color;
  const detalle = String(m.row.egreso_nota || m.row.stock_nota || m.row.notas || "").replace(/\[anulado\]/gi, "").trim();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "84px 1fr auto", gap: 10, alignItems: "center", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.panelSolid, opacity: m.anulado ? 0.55 : 1 }}>
      <span style={{ fontSize: 10, fontWeight: 950, color: col, textTransform: "uppercase", letterSpacing: 0.3 }}>{m.anulado ? "Anulado" : meta.label}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.row.descripcion || "(sin descripción)"}{m.row.codigo ? ` · ${m.row.codigo}` : ""}</div>
        <div style={{ fontSize: 11, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {fmtDate(m.fecha)} · {movDetalleDestino(m.row, m.kind, obraById)}{m.row.retirado_por || m.row.egreso_por ? ` · ${m.row.retirado_por || m.row.egreso_por}` : ""}{detalle ? ` · ${detalle}` : ""}
        </div>
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 950, color: col, whiteSpace: "nowrap" }}>{meta.sign}{fmtQty(m.cant)} {m.row.unidad || ""}</span>
    </div>
  );
}

function MovimientosPanel({ rows = [], obras = [], isMobile = false }) {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [sedeF, setSedeF] = useState("todas");
  const [incluirAnulados, setIncluirAnulados] = useState(false);

  const obraById = useMemo(() => new Map((obras || []).map((o) => [o.id, o])), [obras]);

  const movimientos = useMemo(() => rows
    .map((r) => {
      const kind = rowMovementKind(r);
      const isOut = kind === "egreso";
      const cant = (isOut || MOV_INTERNAL.has(kind)) ? Math.abs(qty(r.cantidad_egresada, qty(r.cantidad, 1))) : qty(r.cantidad, 1);
      return { row: r, kind, cant, delta: rowDelta(r), fecha: rowMovementAt(r), anulado: rowIsAnulado(r) };
    })
    // Ocultar el "espejo" de las transferencias (el ingreso mirror): la acción ya se ve en el egreso.
    .filter((m) => rowSource(m.row) !== "transferencia_ingreso")
    .filter((m) => m.delta !== 0 || m.row.estado === "egresado")
    .filter((m) => {
      if (!incluirAnulados && m.anulado) return false;
      if (tipo === "traspasos") { if (!MOV_INTERNAL.has(m.kind)) return false; }
      else if (tipo !== "todos" && m.kind !== tipo) return false;
      if (sedeF !== "todas" && (m.row.stock_sede || "") !== sedeF) return false;
      if (desde && (!m.fecha || new Date(m.fecha) < new Date(`${desde}T00:00:00`))) return false;
      if (hasta && (!m.fecha || new Date(m.fecha) > new Date(`${hasta}T23:59:59`))) return false;
      if (q.trim()) {
        const t = norm(q);
        const hay = norm([m.row.descripcion, m.row.codigo, movDetalleDestino(m.row, m.kind, obraById), m.row.retirado_por, m.row.egreso_por, m.row.egreso_nota, m.row.stock_nota, m.row.notas].filter(Boolean).join(" "));
        if (!hay.includes(t)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0)), [rows, q, tipo, sedeF, desde, hasta, incluirAnulados, obraById]);

  const kpis = useMemo(() => {
    let ing = 0, egr = 0, tras = 0, uIn = 0, uOut = 0;
    for (const m of movimientos) {
      if (m.kind === "egreso") { egr += 1; uOut += m.cant; }
      else if (m.kind === "ingreso") { ing += 1; uIn += m.cant; }
      else { tras += 1; }
    }
    return { ing, egr, tras, uIn, uOut };
  }, [movimientos]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 12 : "16px 18px 28px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <MovKpi label="Ingresos" value={kpis.ing} detail={`${fmtQty(kpis.uIn)} u`} color={C.green} />
        <MovKpi label="Egresos" value={kpis.egr} detail={`${fmtQty(kpis.uOut)} u`} color={C.red} />
        <MovKpi label="Traspasos" value={kpis.tras} detail="asig/reasig/stock" color={C.blue} />
        <MovKpi label="Movimientos" value={movimientos.length} detail="filtrados" color={C.violet} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, código, obra, quién..." style={{ ...MOV_INP, flex: "1 1 240px", minWidth: 200 }} />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={MOV_INP}>
          <option value="todos">Todos</option>
          <option value="ingreso">Ingresos</option>
          <option value="egreso">Egresos</option>
          <option value="traspasos">Traspasos (todos)</option>
          <option value="asignacion">Asignaciones</option>
          <option value="reasignacion">Reasignaciones</option>
          <option value="liberacion">A stock (liberar)</option>
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
      {movimientos.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 12 }}>Sin movimientos con esos filtros.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {movimientos.slice(0, 500).map((m) => <MovRow key={m.row.id} m={m} obraById={obraById} />)}
          {movimientos.length > 500 && <div style={{ textAlign: "center", color: C.dim, fontSize: 12, padding: 10 }}>Mostrando 500 de {movimientos.length}. Afiná los filtros (fecha/producto) para ver el resto.</div>}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function StockPanolScreen({ profile, signOut, embedded = false, mode = "stock" }) {
  // 1180px: en tablet (sidebar 280px + panel de 2 columnas ~830px) el layout de escritorio
  // desbordaba y "rompía" la pantalla. Por debajo de 1180 usamos el layout apilado.
  const { isMobile } = useResponsive(1180);
  const toast = useToast();

  const role = profile?.role;
  const isAdmin = !!profile?.is_admin || role === "admin";
  const isManager = isAdmin || role === "compras";
  const userSede = profile?.sede || null;
  const sedeLocked = role === "panol" && (userSede === "Pampa" || userSede === "Chubut") ? userSede : null;
  const canReceive = isManager || role === "panol";
  const canSeePrices = role !== "panol"; // el pañol no ve precios ni costos

  // ── Navegación ──
  const [tab, setTab] = useState("obra");
  const [selLinea, setSelLinea] = useState(null); // e.g. "37"
  const [selObraId, setSelObraId] = useState(null);

  // ── Datos ──
  const [rows, setRows] = useState([]);
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const sede = sedeLocked || null;
      const [stockRows, obraRows] = await Promise.all([
        fetchMaterialesEgreso({ sede, estados: LEDGER_STATES }),
        fetchObrasEgreso().catch(() => []),
      ]);
      setRows(stockRows);
      setObras(obraRows);
    } catch (e) {
      toast.error(e.message || "No se pudo cargar el stock.");
    } finally {
      setLoading(false);
    }
  }, [sedeLocked, toast]);

  useEffect(() => { cargar(); }, [cargar]);

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
            padding: isMobile ? "12px 12px 12px 54px" : "16px 18px",
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}>
              <Warehouse size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: C.text, lineHeight: 1.1 }}>Stock de pañol</div>
              <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1.1, textTransform: "uppercase", marginTop: 4, fontWeight: 750 }}>
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
          <div style={{ background: C.topbarSoft, borderBottom: `1px solid ${C.border}`, padding: "0 18px", display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => handleTabChange(t.key)}
                style={{
                  padding: "10px 16px", cursor: "pointer", fontSize: 13, fontFamily: C.sans,
                  fontWeight: tab === t.key ? 800 : 500,
                  color: tab === t.key ? C.text : C.dim,
                  background: "transparent", border: "none",
                  borderBottom: `2px solid ${tab === t.key ? C.blue : "transparent"}`,
                  marginBottom: -1, transition: "color .15s, border-color .15s",
                }}
              >
                {t.label}
              </button>
            ))}
            {embedded && <div style={{ marginLeft: "auto", alignSelf: "center" }}>{refreshBtn}</div>}
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
                </div>
                <StockWmsPanel
                  key={`obra-${selObraId}`}
                  {...wmsProps}
                  initialFObra={selObraLocationKey}
                />
              </div>
            )}

            {/* ── TAB: Por obra — Level 2 (obras de la línea) ── */}
            {tab === "obra" && selLinea && !selObraId && (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <div style={{ padding: "16px 18px 32px" }}>
                  <Breadcrumb items={[
                    { label: "Líneas", onClick: () => setSelLinea(null) },
                    { label: `Linea ${lineaLabel(selLinea)}` },
                  ]} />
                  {loading ? (
                    <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13 }}>Cargando...</div>
                  ) : (obrasByLinea.get(selLinea) || []).length === 0 ? (
                    <div style={{ padding: "44px 24px", textAlign: "center", color: C.dim, border: `1px dashed ${C.border}`, borderRadius: 14, background: C.panel, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 46, height: 46, borderRadius: 13, display: "grid", placeItems: "center", background: C.panelSolid, border: `1px solid ${C.border}`, color: C.dim }}>
                        <Inbox size={22} />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>No hay obras con stock en la linea {lineaLabel(selLinea)}</div>
                      <div style={{ fontSize: 12 }}>Cuando compras envíe materiales a una obra de esta línea, van a aparecer acá.</div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
                      {(obrasByLinea.get(selLinea) || []).map(obra => (
                        <ObraCard
                          key={obra.id}
                          obra={obra}
                          stats={obraStatsMap.get(obra.id) || { itemsStd: 0, itemsAdd: 0, negativos: 0, costoUsdStd: 0, costoUsdAdd: 0 }}
                          onClick={() => setSelObraId(obra.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB: Por obra — Level 1 (líneas) ── */}
            {tab === "obra" && !selLinea && !selObraId && (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <div style={{ padding: "18px 18px 32px" }}>
                  <GlobalKpiBar rows={rows} />
                  {loading ? (
                    <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13 }}>Cargando stock...</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                      {lineasVisibles.map(linea => (
                        <LineaCard
                          key={linea}
                          codigo={lineaLabel(linea)}
                          stats={lineaStats[linea] || { totalObras: 0, obrasActivas: 0, negativos: 0, costoUsd: 0 }}
                          onClick={() => setSelLinea(linea)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB: Stock maestro ── */}
            {tab === "maestro" && (
              <StockWmsPanel key="maestro" {...wmsProps} />
            )}

            {/* ── TAB: Movimientos (historial general de ingresos/egresos) ── */}
            {tab === "movimientos" && (
              <MovimientosPanel rows={rows} obras={obras} isMobile={isMobile} />
            )}

            {/* ── TAB: A reconciliar ── */}
            {tab === "reconciliar" && (
              <StockWmsPanel key="reconciliar" {...wmsProps} initialScope="negativos" />
            )}

            {tab === "mapa" && (
              <MapaPanolTab isMobile={isMobile} toast={toast} canEdit={isManager} />
            )}
          </div>
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
