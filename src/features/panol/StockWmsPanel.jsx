import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Inbox,
  PackageCheck,
  PackagePlus,
  RefreshCw,
  ScanLine,
  Search,
  Warehouse,
  X,
} from "lucide-react";
import { C } from "@/theme";
import BarcodeScanner from "@/features/panol/BarcodeScanner";
import UbicacionPicker, { UbicacionChip } from "@/features/panol/UbicacionPicker";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { materialBarcodeList, materialBarcodeText } from "@/features/materiales/materialBarcodes";
import { fmtDate, rowIsAnulado, rowMovementAt } from "@/features/panol/panolMovimientos";
import {
  crearEnvio,
  crearPanolCatalogMaterialParaEgreso,
  egresarProducto,
  fetchMaterialesEgreso,
  fetchObrasEgreso,
  fetchPanolCatalogMini,
  ingresarStockGeneral,
  marcarMovimientoAnulado,
  registrarCambioUbicacionMaterial,
  SEDES_PANOL,
  transferirProducto,
  vincularMovimientosAMaterial,
} from "@/features/panol/panolApi";

const LEDGER_STATES = ["en_panol", "recibido", "parcial", "egresado", "problema"];
const IN_STOCK_STATES = new Set(["en_panol", "recibido", "parcial"]);
const RECEIVED_STATES = new Set(["recibido", "parcial"]);
const DIRECT_STOCK_SOURCES = new Set(["stock_general", "remito", "transferencia_ingreso", "ajuste_ingreso"]);
const CATALOG_SEARCH_LIMIT = 12;
const EGRESO_VIEW_STORAGE_KEY = "klasea.panol.egresoView";

function readStoredEgresoView() {
  if (typeof window === "undefined") return "egresar";
  const value = window.localStorage.getItem(EGRESO_VIEW_STORAGE_KEY);
  return value === "historial" ? "historial" : "egresar";
}

function norm(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function codeKey(value = "") {
  return String(value ?? "").trim().toLowerCase();
}

function groupMatchesCode(group, code) {
  const clean = codeKey(code);
  if (!clean) return false;
  const candidates = [
    group.codigo,
    group.codigo_barra,
    group.material?.codigo,
    group.material?.codigo_barra,
    ...materialBarcodeList(group.material).map((row) => row.codigo),
    ...(group.rows || []).flatMap((row) => [row.codigo, row.codigo_barra]),
    ...(group.rows || []).flatMap((row) => materialBarcodeList(row).map((barcode) => barcode.codigo)),
  ];
  return candidates.some((value) => codeKey(value) === clean);
}

function qty(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function fmtQty(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return Number(Math.round(n * 100) / 100).toLocaleString("es-AR");
}

function isToday(ts) {
  if (!ts) return false;
  return new Date(ts).toDateString() === new Date().toDateString();
}

function rowSede(row) {
  return row.stock_sede || row.panol_envio?.sede || "";
}

function rowObraId(row) {
  return row.obra?.id || row.obra_id || "";
}

function rowObraLabel(row) {
  if (!rowObraId(row)) return rowSede(row) ? `Stock ${rowSede(row)}` : "Stock general";
  return row.obra?.codigo || row.panol_envio?.destino || "Sin obra";
}

function rowLocationKey(row) {
  // Bug 52-23: Si está por recibir pero tiene destino a obra, tratar de asignarlo a esa obra
  if (rowIsTransit(row) && !row.obra_id && row.panol_envio?.destino?.toLowerCase().includes("obra")) {
    // Asumimos que si no sabemos la obra exacta por ID, al menos el destino indica la intención.
    // Esto es un hack heurístico; lo ideal es que en StockWmsPanel filtremos mejor.
  }
  return `${rowSede(row) || "general"}::${rowObraId(row) || "stock"}`;
}

function obraScopeKey(obraId) {
  return `obra::${obraId}`;
}

function rowMatchesObraFilter(row, filterValue) {
  if (!filterValue || filterValue === "todas") return true;
  const value = String(filterValue);
  if (value.startsWith("obra::")) return rowObraId(row) === value.slice("obra::".length);
  return rowLocationKey(row) === value;
}

function rowIsAdditional(row) {
  return row.es_adicional === true || row.request?.es_adicional === true;
}

function rowTipoPedido(row) {
  let tipo = row.tipo_pedido || row.request?.tipo_pedido || (rowIsAdditional(row) ? "adicional" : "estandar");
  if (tipo === "estandar" && rowSede(row) === "Pampa") tipo = "stock";
  return tipo;
}

function productKey(row, fObra) {
  const identity = row.material_id || norm([row.codigo, row.descripcion].filter(Boolean).join(" ")) || row.id;
  // Si estamos en el maestro (fObra === "todas"), NO fragmentamos por tipo.
  if (fObra === "todas") return `all::${identity}`;
  return `${rowTipoPedido(row)}::${identity}`;
}

function rowSource(row) {
  return String(row.source || "").trim();
}

function rowIsEgreso(row) {
  const source = rowSource(row);
  return row.estado === "egresado" || source.startsWith("egreso") || source.startsWith("transferencia_egreso");
}

function rowIsLocationChange(row) {
  return rowSource(row) === "ajuste_ubicacion";
}

function rowIsDirectStock(row) {
  const source = rowSource(row);
  return DIRECT_STOCK_SOURCES.has(source) || source.startsWith("stock_") || source.startsWith("transferencia_ingreso");
}

function rowCountsAsStock(row) {
  if (rowIsLocationChange(row)) return false;
  if (!IN_STOCK_STATES.has(row.estado)) return false;
  const recepcion = String(row.recepcion_estado || "").trim();
  if (RECEIVED_STATES.has(recepcion)) return true;
  if (rowIsDirectStock(row)) return true;
  if (!recepcion && rowIsDirectStock(row)) return true;
  return false;
}

function rowIsTransit(row) {
  if (rowIsLocationChange(row)) return false;
  return IN_STOCK_STATES.has(row.estado) && !rowCountsAsStock(row);
}

function rowDelta(row) {
  if (rowCountsAsStock(row)) return qty(row.cantidad, 1);
  if (rowIsEgreso(row)) {
    return -Math.abs(qty(row.cantidad_egresada, qty(row.cantidad, 1)));
  }
  return 0;
}

function rowEgresoQuantity(row) {
  return Math.abs(rowDelta(row)) || Math.abs(qty(row.cantidad_egresada, qty(row.cantidad, 1)));
}

function rowUnitPriceUsd(row) {
  if (String(row.moneda || "").toUpperCase() !== "USD") return 0;
  return qty(row.precio_unitario, 0);
}

function rowSearchText(row) {
  return norm([
    row.descripcion,
    row.codigo,
    row.codigo_barra,
    materialBarcodeText(row),
    row.proveedor,
    row.rubro,
    row.categoria_nombre,
    rowObraLabel(row),
    rowSede(row),
    row.estado,
    row.retirado_por,
    row.egreso_nota,
    row.stock_nota,
    row.sector_destino,
    row.egreso_por,
    row.ubicacion,
    row.ubicacion_obs,
    rowIsAdditional(row) ? "adicional opcional extra" : "estandar base matriz",
    row.request?.title,
    row.request?.description,
  ].filter(Boolean).join(" "));
}

function categoryLabel(row) {
  return row.categoria_nombre || row.categoria || row.rubro || "";
}

function defaultLocation(defaultSede) {
  return {
    key: `${defaultSede || "general"}::stock`,
    label: defaultSede ? `Stock ${defaultSede}` : "Stock general",
    sede: defaultSede || "",
    obraId: "",
    available: 0,
    rows: [],
  };
}

function emptyCatalogGroup(material, defaultSede = "Pampa", esAdicional = false) {
  const location = defaultLocation(defaultSede);
  return {
    key: `catalog:${esAdicional ? "adicional" : "estandar"}:${material.id || norm(material.descripcion)}`,
    catalogOnly: true,
    manualOnly: !material.id,
    material,
    label: material.descripcion || "(sin descripcion)",
    codigo: material.codigo || "",
    codigo_barra: material.codigo_barra || "",
    proveedor: material.proveedor || "",
    unidad: material.unidad || material.unidad_medida || "unidad",
    total: 0,
    transitQty: 0,
    valueUsd: 0,
    rows: [],
    locations: [location],
    locationMap: new Map([[location.key, location]]),
    categorias: new Set(),
    sedes: new Set(defaultSede ? [defaultSede] : []),
    negativo: false,
    inTransit: false,
    esAdicional,
    updatedAt: null,
  };
}

function manualEgresoGroup(text, defaultSede = "Pampa", esAdicional = false) {
  const descripcion = String(text || "").trim();
  return emptyCatalogGroup({
    id: null,
    descripcion,
    codigo: "",
    proveedor: "",
    unidad: "unidad",
  }, defaultSede, esAdicional);
}

function buildProductGroups(rows = [], fObra = "todas") {
  const map = new Map();
  for (const row of rows) {
    const key = productKey(row, fObra);
    if (!map.has(key)) {
      const tipoPedido = rowTipoPedido(row);
      map.set(key, {
        key,
        material: {
          id: row.material_id || null,
          descripcion: row.descripcion || "",
          codigo: row.codigo || "",
          codigo_barra: row.codigo_barra || "",
          codigos_barra: row.codigos_barra || [],
          unidad: row.unidad || "unidad",
          proveedor: row.proveedor || "",
        },
        label: row.descripcion || "(sin descripcion)",
        codigo: row.codigo || "",
        codigo_barra: row.codigo_barra || "",
        codigos_barra: row.codigos_barra || [],
        proveedor: row.proveedor || "",
        unidad: row.unidad || "unidad",
        tipoPedido,
        ubicacion: row.ubicacion || null,
        ubicacion_obs: row.ubicacion_obs || null,
        total: 0,
        transitQty: 0,
        valueUsd: 0,
        hasEgreso: false,
        rows: [],
        locationMap: new Map(),
        categorias: new Set(),
        detalles: new Set(),
        sedes: new Set(),
        updatedAt: null,
      });
    }
    const group = map.get(key);
    if (!group.ubicacion && row.ubicacion) {
      group.ubicacion = row.ubicacion;
      group.ubicacion_obs = row.ubicacion_obs || null;
    }
    if (!group.codigo_barra && row.codigo_barra) {
      group.codigo_barra = row.codigo_barra;
      group.material.codigo_barra = row.codigo_barra;
    }
    if (row.codigos_barra?.length) {
      group.material.codigos_barra = [
        ...(group.material.codigos_barra || []),
        ...row.codigos_barra,
      ];
    }
    const delta = rowDelta(row);
    const locKey = rowLocationKey(row);
    if (!group.locationMap.has(locKey)) {
      group.locationMap.set(locKey, {
        key: locKey,
        label: rowObraLabel(row),
        sede: rowSede(row),
        obraId: rowObraId(row),
        available: 0,
        transitQty: 0,
        valueUsd: 0,
        rows: [],
      });
    }
    const location = group.locationMap.get(locKey);
    location.available += delta;
    location.valueUsd += delta * rowUnitPriceUsd(row);
    if (rowIsTransit(row)) {
      const transit = qty(row.cantidad, 1);
      location.transitQty += transit;
      group.transitQty += transit;
    }
    if (rowIsEgreso(row)) group.hasEgreso = true;
    location.rows.push(row);
    group.total += delta;
    group.valueUsd += delta * rowUnitPriceUsd(row);
    group.rows.push(row);
    if (rowSede(row)) group.sedes.add(rowSede(row));
    if (categoryLabel(row)) group.categorias.add(categoryLabel(row));
    [row.request?.description, row.request?.title, row.notas, row.recepcion_nota, row.stock_nota]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean)
      .slice(0, 3)
      .forEach((value) => group.detalles.add(value));
    const ts = row.egreso_at || row.recepcion_updated_at || row.updated_at || row.created_at;
    if (ts && (!group.updatedAt || new Date(ts) > new Date(group.updatedAt))) group.updatedAt = ts;
  }

  return [...map.values()].map((group) => {
    const locations = [...group.locationMap.values()]
      .sort((a, b) => b.available - a.available || a.label.localeCompare(b.label, "es", { numeric: true }));
    const hasPositiveStock = locations.some((loc) => loc.available > 0.0001);
    return {
      ...group,
      locations,
      egresado: group.hasEgreso && !hasPositiveStock && group.transitQty <= 0,
      negativo: group.total < 0 || locations.some((loc) => loc.available < 0),
      inTransit: group.transitQty > 0,
    };
  }).sort((a, b) => {
    if (a.negativo !== b.negativo) return a.negativo ? -1 : 1;
    if (Math.abs(b.total) !== Math.abs(a.total)) return Math.abs(b.total) - Math.abs(a.total);
    return a.label.localeCompare(b.label, "es", { numeric: true });
  });
}

function filterOptions(rows, getValue) {
  const values = new Set();
  for (const row of rows) {
    const value = String(getValue(row) || "").trim();
    if (value) values.add(value);
  }
  return [["todos", "Todos"], ...[...values].sort((a, b) => a.localeCompare(b, "es", { numeric: true })).map((value) => [value, value])];
}

function SelectFilter({ label, value, onChange, options }) {
  return (
    <label style={{ display: "grid", gap: 4, minWidth: 128 }}>
      <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12, fontWeight: 750, fontFamily: C.sans, outline: "none" }}
      >
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  );
}

function KpiCard({ icon, label, value, detail, color }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 10, padding: "11px 12px", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", color, background: `${color}14`, border: `1px solid ${color}33`, flexShrink: 0 }}>
        {createElement(icon, { size: 15 })}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color, fontFamily: C.mono, fontSize: 18, fontWeight: 950, lineHeight: 1 }}>{value}</div>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 900, marginTop: 4 }}>{label}</div>
        <div style={{ color: C.dim, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</div>
      </div>
    </div>
  );
}

function StateChip({ negative, catalogOnly = false, transit = false, egresado = false }) {
  const color = egresado ? C.red : transit ? C.amber : catalogOnly ? C.amber : negative ? C.red : C.green;
  const border = egresado ? C.redB : transit ? C.amberB : catalogOnly ? C.amberB : negative ? C.redB : C.greenB;
  const background = egresado ? C.redL : transit ? C.amberL : catalogOnly ? C.amberL : negative ? C.redL : C.greenL;
  return (
    <span style={{
      color,
      border: `1px solid ${border}`,
      background,
      borderRadius: 999,
      padding: "3px 8px",
      fontSize: 10,
      fontWeight: 950,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      whiteSpace: "nowrap",
    }}>
      {egresado ? "Egresado" : transit ? "Por recibir" : catalogOnly ? "Sin registro digital" : negative ? "A reconciliar" : "Disponible"}
    </span>
  );
}

function KindChip({ tipo = "estandar" }) {
  let color = C.blue, background = C.blueL, border = C.blueB, label = "Estándar";
  if (tipo === "adicional") {
    color = C.violet;
    background = "rgba(124,58,237,0.10)";
    border = "rgba(124,58,237,0.26)";
    label = "Adicional";
  } else if (tipo === "stock") {
    color = C.green;
    background = C.greenL;
    border = C.greenB;
    label = "Stock pañol";
  }
  return (
    <span style={{
      color,
      border: `1px solid ${border}`,
      background,
      borderRadius: 999,
      padding: "3px 8px",
      fontSize: 10,
      fontWeight: 950,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function ProductCard({ group, active, onOpen, isMobile }) {
  const breakdown = group.locations
    .filter((loc) => Math.abs(loc.available) > 0.0001)
    .slice(0, 4)
    .map((loc) => `${loc.label}: ${fmtQty(loc.available)}`)
    .join(" - ");
  const transitBreakdown = group.locations
    .filter((loc) => loc.transitQty > 0)
    .slice(0, 2)
    .map((loc) => `${loc.label}: ${fmtQty(loc.transitQty)}`)
    .join(" - ");
  const stockDetail = breakdown || (transitBreakdown ? `Por recibir ${transitBreakdown}` : group.egresado ? "Egresado - sin saldo" : "Sin stock cargado");
  const qtyColor = group.total < 0 || group.egresado ? C.red : C.green;
  return (
    <button
      type="button"
      onClick={() => onOpen(group.key)}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 150px 116px 24px",
        alignItems: "center",
        gap: 10,
        border: `1px solid ${active ? C.blueB : group.negativo ? C.redB : C.border}`,
        background: active ? C.blueL : group.negativo ? C.redL : C.panelSolid,
        borderRadius: 8,
        padding: "9px 12px",
        cursor: "pointer",
        color: C.text,
        textAlign: "left",
        fontFamily: C.sans,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
          <span style={{ color: C.text, fontSize: 13.5, fontWeight: 950, lineHeight: 1.25, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</span>
          <KindChip tipo={group.tipoPedido} />
          {group.egresado && <StateChip egresado />}
          {(group.negativo || group.catalogOnly) && <StateChip negative={group.negativo} catalogOnly={group.catalogOnly} />}
          {group.inTransit && <StateChip transit />}
          <UbicacionChip ubicacion={group.ubicacion} obs={group.ubicacion_obs} />
        </div>
        <div style={{ color: C.dim, fontSize: 11, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {group.codigo || "sin codigo"}{group.proveedor ? ` - ${group.proveedor}` : ""}{group.categorias.size ? ` - ${[...group.categorias][0]}` : ""}
        </div>
        {group.valueUsd > 0 && (
          <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>Valor USD {fmtQty(group.valueUsd)}</div>
        )}
        <div style={{ display: "none" }}>
          {stockDetail}{group.locations.length > 4 ? ` - +${group.locations.length - 4}` : ""}
        </div>
      </div>
      <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <span style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Deposito / obra</span>
        <span style={{ color: group.egresado || group.negativo ? C.red : C.t1, fontSize: 11.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {stockDetail}{group.locations.length > 4 ? ` - +${group.locations.length - 4}` : ""}
        </span>
      </div>
      <div style={{ display: "grid", justifyItems: isMobile ? "start" : "end", gap: 3 }}>
        <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8 }}>Disponible</span>
        <span style={{ color: qtyColor, fontFamily: C.mono, fontSize: 17, fontWeight: 950 }}>{fmtQty(group.total)}</span>
      </div>
      <ArrowUpRight size={16} style={{ color: C.dim, transform: "rotate(45deg)", justifySelf: isMobile ? "start" : "end" }} />
    </button>
  );
}

function LocationButton({ location, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? C.blueB : location.available < 0 ? C.redB : C.border}`,
        background: active ? C.blueL : location.available < 0 ? C.redL : C.panelSolid,
        color: C.text,
        borderRadius: 10,
        padding: "9px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        cursor: "pointer",
        fontFamily: C.sans,
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{location.label}</span>
        <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 2 }}>{location.sede || "Sin sede"}</span>
        {location.transitQty > 0 && (
          <span style={{ display: "block", color: C.amber, fontSize: 10.5, marginTop: 2 }}>por recibir {fmtQty(location.transitQty)}</span>
        )}
      </span>
      <span style={{ color: location.available < 0 ? C.red : C.green, fontFamily: C.mono, fontSize: 14, fontWeight: 950 }}>{fmtQty(location.available)}</span>
    </button>
  );
}

function KardexRow({ row, onRevert, busy }) {
  const delta = rowDelta(row);
  const isLocation = rowIsLocationChange(row);
  const isOut = row.estado === "egresado";
  const isTransit = rowIsTransit(row);
  const label = isLocation ? "Ubicacion" : isTransit ? "Transito" : isOut ? "Egreso" : row.estado === "problema" ? "Problema" : "Ingreso";
  const labelColor = isLocation ? C.blue : isTransit ? C.amber : isOut ? C.red : C.green;
  // Guard B: deshabilitar Revertir si ya contiene "[anulado]" en notas
  const yaAnulado = rowIsAnulado(row);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "74px minmax(0, 1fr) 86px 68px", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: labelColor, fontSize: 11, fontWeight: 950 }}>{label}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: C.text, fontSize: 12.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rowObraLabel(row)} · {rowSede(row) || "Sin sede"}</span>
        <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fmtDate(row.egreso_at || row.recepcion_updated_at || row.updated_at || row.created_at)}{row.retirado_por ? ` · ${row.retirado_por}` : ""}{row.egreso_nota || row.notas ? ` · ${row.egreso_nota || row.notas}` : ""}
        </span>
      </span>
      <span style={{ color: delta < 0 ? C.red : delta > 0 ? C.green : C.dim, fontFamily: C.mono, fontSize: 12.5, fontWeight: 950, textAlign: "right" }}>
        {delta > 0 ? "+" : ""}{fmtQty(delta)}
      </span>
      {delta !== 0 ? (
        <button
          type="button"
          onClick={() => onRevert?.(row)}
          disabled={busy || yaAnulado}
          title={yaAnulado ? "Este movimiento ya fue anulado" : "Revertir movimiento"}
          style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.dim, borderRadius: 8, padding: "6px 7px", cursor: (busy || yaAnulado) ? "default" : "pointer", fontSize: 10.5, fontWeight: 850, fontFamily: C.sans, opacity: (busy || yaAnulado) ? 0.45 : 1 }}
        >
          {yaAnulado ? "Anulado" : "Revertir"}
        </button>
      ) : <span />}
    </div>
  );
}

function EgresosHistoryView({ rows, loading, obras, isMobile, onOpenProduct }) {
  const obraById = useMemo(() => new Map((obras || []).map((obra) => [obra.id, obra])), [obras]);
  const totals = useMemo(() => {
    const unidades = rows.reduce((sum, row) => sum + rowEgresoQuantity(row), 0);
    const hoy = rows.filter((row) => isToday(rowMovementAt(row))).length;
    const materiales = new Set(rows.map((row) => row.material_id || norm([row.codigo, row.descripcion].filter(Boolean).join(" ")) || row.id));
    return { unidades, hoy, materiales: materiales.size };
  }, [rows]);

  function destinoLabel(row) {
    const destinoObra = row.egreso_destino_obra_id ? obraById.get(row.egreso_destino_obra_id) : null;
    if (destinoObra?.codigo) return `Transferido a ${destinoObra.codigo}`;
    if (row.egreso_destino_obra_id) return "Transferido a obra";
    if (row.sector_destino) return row.sector_destino;
    return "Salida / consumo";
  }

  function detalleLabel(row) {
    return [row.retirado_por ? `Retira: ${row.retirado_por}` : "", row.egreso_nota || row.notas || ""]
      .filter(Boolean)
      .join(" - ");
  }

  return (
    <section style={{ minHeight: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>Historial de egresos</div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Movimientos ya registrados, filtrados por busqueda, sede, obra y categoria.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ border: `1px solid ${C.border}`, background: C.bg, color: C.text, borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 900 }}>{rows.length} egresos</span>
          <span style={{ border: `1px solid ${C.border}`, background: C.bg, color: C.text, borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 900 }}>{fmtQty(totals.unidades)} unidades</span>
          <span style={{ border: `1px solid ${C.border}`, background: C.bg, color: C.text, borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 900 }}>{totals.materiales} productos</span>
          <span style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 900 }}>{totals.hoy} hoy</span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "grid", gap: 8, alignContent: "start" }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: C.dim, fontSize: 12, fontWeight: 850 }}>Cargando egresos...</div>
        ) : rows.length ? rows.map((row) => {
          const detalle = detalleLabel(row);
          const qtyOut = rowEgresoQuantity(row);
          return (
            <div
              key={row.id}
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "92px minmax(220px, 1.5fr) 92px minmax(150px, 1fr) minmax(150px, 1fr) minmax(180px, 1fr)",
                gap: isMobile ? 6 : 12,
                alignItems: "center",
                border: `1px solid ${C.border}`,
                background: C.panelSolid,
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <div>
                <div style={{ color: C.red, fontSize: 11, fontWeight: 950 }}>Egreso</div>
                <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>{fmtDate(rowMovementAt(row))}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descripcion || "(sin descripcion)"}</div>
                <div style={{ color: C.dim, fontSize: 10.5, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.codigo || "sin codigo"}{row.proveedor ? ` - ${row.proveedor}` : ""}</div>
                <button
                  type="button"
                  onClick={() => onOpenProduct?.(row)}
                  style={{ marginTop: 6, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 8, padding: "5px 8px", cursor: "pointer", fontSize: 11, fontWeight: 900, fontFamily: C.sans }}
                >
                  Ver producto
                </button>
              </div>
              <div>
                <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Cantidad</div>
                <div style={{ color: C.red, fontFamily: C.mono, fontSize: 13.5, fontWeight: 950 }}>-{fmtQty(qtyOut)} {row.unidad || ""}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Origen</div>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rowObraLabel(row)}</div>
                <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>{rowSede(row) || "Sin sede"}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Destino</div>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{destinoLabel(row)}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Detalle</div>
                <div style={{ color: detalle ? C.text : C.dim, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detalle || "Sin nota"}</div>
              </div>
            </div>
          );
        }) : (
          <div style={{ padding: 28, border: `1px dashed ${C.border}`, borderRadius: 10, color: C.dim, textAlign: "center", fontSize: 13 }}>
            Todavia no hay egresos para estos filtros.
          </div>
        )}
      </div>
    </section>
  );
}

function defaultEgresoQty(location) {
  const available = qty(location?.available, 0);
  return String(available > 0 ? Number(available.toFixed(2)) : 1);
}

function makeCartItem(group, location, { cantidad, sede, codigo, unidad } = {}) {
  const isCatalogOnly = !!group?.catalogOnly;
  const itemSede = isCatalogOnly ? sede : (location?.sede || sede);
  const lineKey = `${group.key}::${isCatalogOnly ? itemSede || "general" : location?.key || "stock"}`;
  return {
    key: lineKey,
    groupKey: group.key,
    label: group.label,
    material: group.material,
    codigo: isCatalogOnly ? String(codigo || "").trim() : group.codigo,
    unidad: isCatalogOnly ? String(unidad || group.unidad || "unidad").trim() : group.unidad,
    cantidad: String(cantidad || defaultEgresoQty(location)),
    sede: itemSede || "",
    obraId: isCatalogOnly ? null : (location?.obraId || null),
    locationLabel: isCatalogOnly ? (itemSede ? `Stock ${itemSede}` : "Sin registro digital") : (location?.label || "Stock general"),
    available: qty(location?.available, 0),
    catalogOnly: isCatalogOnly,
    transferable: !isCatalogOnly,
    esAdicional: !!group.esAdicional,
  };
}

function EgresoBatchPanel({ group, selectedLocation, obras, sedeLocked, canReceive, onDone, toast, cart, setCart }) {
  const [cantidad, setCantidad] = useState(defaultEgresoQty(selectedLocation));
  const [sede, setSede] = useState(sedeLocked || selectedLocation?.sede || "Pampa");
  const [codigoLibre, setCodigoLibre] = useState(group?.codigo || "");
  const [unidadLibre, setUnidadLibre] = useState(group?.unidad || "unidad");
  const [destinoObraId, setDestinoObraId] = useState("");
  const [movementKind, setMovementKind] = useState("consumir");
  const [retiradoPor, setRetiradoPor] = useState("");
  const [sectorDestino, setSectorDestino] = useState("");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCantidad(defaultEgresoQty(selectedLocation));
    setSede(sedeLocked || selectedLocation?.sede || "Pampa");
  }, [group?.key, selectedLocation, sedeLocked]);

  useEffect(() => {
    setCodigoLibre(group?.codigo || "");
    setUnidadLibre(group?.unidad || "unidad");
  }, [group?.key, group?.codigo, group?.unidad]);

  const isCatalogOnly = !!group?.catalogOnly;
  const cantidadNum = qty(cantidad, 0);
  const projected = (selectedLocation?.available || 0) - cantidadNum;
  const willGoNegative = !!group && cantidadNum > (selectedLocation?.available || 0);
  const transitOnly = !!group && !isCatalogOnly && (selectedLocation?.available || 0) <= 0 && (selectedLocation?.transitQty || 0) > 0;
  const obrasActivas = obras.filter((obra) => !["terminada", "cancelada", "archivada"].includes(obra.estado));
  const totalLineas = cart.length;
  const totalUnidades = cart.reduce((sum, item) => sum + qty(item.cantidad, 0), 0);

  function addCurrentToCart() {
    if (!group || cantidadNum <= 0 || transitOnly) return;
    const item = makeCartItem(group, selectedLocation, {
      cantidad,
      sede: sedeLocked || sede,
      codigo: codigoLibre,
      unidad: unidadLibre,
    });
    setCart((prev) => {
      const exists = prev.find((row) => row.key === item.key);
      if (!exists) return [...prev, item];
      return prev.map((row) => row.key === item.key ? { ...row, ...item } : row);
    });
  }

  function updateCartItem(key, patch) {
    setCart((prev) => prev.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  function removeCartItem(key) {
    setCart((prev) => prev.filter((item) => item.key !== key));
  }

  async function submitBatch() {
    if (!canReceive || !cart.length) return;
    if (movementKind === "transferir" && !destinoObraId) {
      toast.warning("Elegí la obra destino para transferir.");
      return;
    }
    setSaving(true);
    try {
      const egresoNota = [
        sectorDestino.trim() ? `Destino: ${sectorDestino.trim()}` : "",
        nota.trim(),
      ].filter(Boolean).join(" · ");
      for (const item of cart) {
        if (movementKind === "transferir") {
          await transferirProducto({
            material: item.material,
            descripcion: item.label,
            codigo: item.codigo,
            unidad: item.unidad,
            cantidad: item.cantidad,
            sede: item.sede,
            obraOrigenId: item.obraId,
            obraDestinoId: destinoObraId,
            nota: egresoNota,
            retiradoPor,
            esAdicional: item.esAdicional,
          });
          continue;
        }
        await egresarProducto({
          material: item.material,
          descripcion: item.label,
          codigo: item.codigo,
          unidad: item.unidad,
          cantidad: item.cantidad,
          sede: item.sede,
          obraId: item.obraId,
          destinoObraId,
          retiradoPor,
          sectorDestino,
          nota: egresoNota,
          esAdicional: item.esAdicional,
        });
      }
      toast.success(`${cart.length} producto${cart.length === 1 ? "" : "s"} ${movementKind === "transferir" ? "transferido" : "egresado"}${cart.length === 1 ? "" : "s"}.`);
      setCart([]);
      setDestinoObraId("");
      setRetiradoPor("");
      setSectorDestino("");
      setNota("");
      await onDone?.();
    } catch (error) {
      toast.error(error.message || "No se pudo registrar el egreso.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
      <div>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>Egreso multiple</div>
        <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Agrega varios productos y confirma todo junto. Si no hay stock, queda negativo para reconciliar.</div>
      </div>

      {group ? (
        <div style={{ border: `1px solid ${C.border}`, background: C.bg, borderRadius: 10, padding: 10, display: "grid", gap: 8 }}>
          <div style={{ color: C.text, fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</div>
          {!isCatalogOnly && (
            <div style={{ color: C.dim, fontSize: 11 }}>{selectedLocation?.label || "Stock general"} · disponible {fmtQty(selectedLocation?.available || 0)}</div>
          )}
          {isCatalogOnly && !sedeLocked && (
            <SelectFilter label="Sede origen" value={sede} onChange={setSede} options={SEDES_PANOL.map((item) => [item, item])} />
          )}
          {isCatalogOnly && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
              <input value={codigoLibre} onChange={(event) => setCodigoLibre(event.target.value)} placeholder="Codigo / barra" style={{ background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 }} />
              <input value={unidadLibre} onChange={(event) => setUnidadLibre(event.target.value)} placeholder="Unidad" style={{ background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 }} />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 5 }}>
              <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>Cantidad</span>
              <input type="number" min="0.01" step="any" value={cantidad} onChange={(event) => setCantidad(event.target.value)} style={{ background: C.panelSolid, border: `1px solid ${willGoNegative ? C.redB : C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.mono, outline: "none" }} />
            </label>
            <button type="button" onClick={addCurrentToCart} disabled={!canReceive || cantidadNum <= 0} style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 9, padding: "10px 12px", cursor: !canReceive || cantidadNum <= 0 ? "default" : "pointer", opacity: !canReceive || cantidadNum <= 0 ? 0.55 : 1, fontSize: 12, fontWeight: 950, fontFamily: C.sans }}>
              Agregar
            </button>
          </div>
          {transitOnly && (
            <div style={{ border: `1px solid ${C.amberB}`, background: C.amberL, color: C.amber, borderRadius: 10, padding: "8px 9px", fontSize: 12, lineHeight: 1.35 }}>
              Este material está por recibir (aún no lo recepcionó pañol). Podés egresarlo igual: queda negativo para reconciliar cuando cargues el ingreso.
            </div>
          )}
          {willGoNegative && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, padding: "8px 9px", fontSize: 12, lineHeight: 1.35 }}>
              <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>Este producto quedara negativo ({fmtQty(projected)}).</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: 12, color: C.dim, fontSize: 12, textAlign: "center" }}>Busca y elegi un producto para sumarlo al egreso.</div>
      )}

      <div style={{ border: `1px solid ${C.border}`, background: C.bg, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "9px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span style={{ color: C.text, fontSize: 12.5, fontWeight: 950 }}>Seleccionados</span>
          <span style={{ color: C.dim, fontSize: 11 }}>{totalLineas} productos · {fmtQty(totalUnidades)} unidades</span>
        </div>
        <div style={{ display: "grid", maxHeight: 220, overflowY: "auto" }}>
          {cart.length ? cart.map((item) => (
            <div key={item.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 84px 28px", gap: 8, alignItems: "center", padding: "9px 10px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.locationLabel}{item.sede ? ` · ${item.sede}` : ""}{item.catalogOnly ? " · sin registro digital" : ""}
                </div>
              </div>
              <input type="number" min="0.01" step="any" value={item.cantidad} onChange={(event) => updateCartItem(item.key, { cantidad: event.target.value })} style={{ background: C.panelSolid, border: `1px solid ${qty(item.cantidad, 0) > item.available ? C.redB : C.border}`, color: C.text, borderRadius: 8, padding: "8px 7px", fontSize: 12, fontFamily: C.mono, outline: "none", minWidth: 0 }} />
              <button type="button" onClick={() => removeCartItem(item.key)} title="Quitar" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.dim, borderRadius: 8, width: 28, height: 28, display: "grid", placeItems: "center", cursor: "pointer" }}>
                <X size={13} />
              </button>
            </div>
          )) : (
            <div style={{ color: C.dim, fontSize: 12, padding: 14, textAlign: "center" }}>Todavia no agregaste productos.</div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>Tipo de movimiento</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <button type="button" onClick={() => setMovementKind("consumir")} style={{ border: `1px solid ${movementKind === "consumir" ? C.greenB : C.border}`, background: movementKind === "consumir" ? C.greenL : C.panel, color: movementKind === "consumir" ? C.green : C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: C.sans }}>Consumir en obra</button>
          <button type="button" onClick={() => setMovementKind("transferir")} style={{ border: `1px solid ${movementKind === "transferir" ? C.blueB : C.border}`, background: movementKind === "transferir" ? C.blueL : C.panel, color: movementKind === "transferir" ? C.blue : C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: C.sans }}>Transferir a obra</button>
        </div>
      </div>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>{movementKind === "transferir" ? "Obra destino" : "Reasignar a obra"}</span>
        <select value={destinoObraId} onChange={(event) => setDestinoObraId(event.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }}>
          <option value="">{movementKind === "transferir" ? "Elegir obra" : "Sin reasignar"}</option>
          {obrasActivas.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
        </select>
      </label>
      <input value={retiradoPor} onChange={(event) => setRetiradoPor(event.target.value)} placeholder="Receptor / DNI" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }} />
      <input value={sectorDestino} onChange={(event) => setSectorDestino(event.target.value)} placeholder="Sector / uso / entrega" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }} />
      <input value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Observacion / detalle del egreso" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }} />

      <div style={{ display: "flex", gap: 8 }}>
        {cart.length > 0 && (
          <button type="button" onClick={() => setCart([])} disabled={saving} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 10, padding: "10px 12px", cursor: saving ? "default" : "pointer", fontSize: 12, fontWeight: 900, fontFamily: C.sans }}>
            Vaciar
          </button>
        )}
        <button type="button" onClick={submitBatch} disabled={saving || !canReceive || cart.length === 0} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 950, cursor: saving || !canReceive || cart.length === 0 ? "default" : "pointer", opacity: saving || !canReceive || cart.length === 0 ? 0.6 : 1, fontFamily: C.sans }}>
          <ArrowUpRight size={15} />
          {saving ? "Registrando..." : `Confirmar ${movementKind === "transferir" ? "transferencia" : "egreso"} (${cart.length})`}
        </button>
      </div>
    </div>
  );
}

function ProductActionPanel({ group, selectedLocation, setSelectedLocationKey, obras, sedeLocked, canReceive, mode, onDone, toast }) {
  const [action, setAction] = useState(mode === "egreso" ? "egresar" : "egresar");
  const [cantidad, setCantidad] = useState("1");
  const [sede, setSede] = useState(sedeLocked || selectedLocation?.sede || "Pampa");
  const [destinoObraId, setDestinoObraId] = useState("");
  const [retiradoPor, setRetiradoPor] = useState("");
  const [sectorDestino, setSectorDestino] = useState("");
  const [nota, setNota] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [remito, setRemito] = useState("");
  const [factura, setFactura] = useState("");
  const [codigoLibre, setCodigoLibre] = useState(group?.codigo || "");
  const [unidadLibre, setUnidadLibre] = useState(group?.unidad || "unidad");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const available = selectedLocation?.available || 0;
    setCantidad(action === "egresar" ? String(available > 0 ? Number(available.toFixed(2)) : 1) : "1");
    setSede(sedeLocked || selectedLocation?.sede || "Pampa");
  }, [action, selectedLocation, sedeLocked]);

  useEffect(() => {
    setCodigoLibre(group?.codigo || "");
    setUnidadLibre(group?.unidad || "unidad");
  }, [group?.key, group?.codigo, group?.unidad]);

  const isCatalogOnly = !!group?.catalogOnly;
  const cantidadNum = qty(cantidad, 0);
  const movementSede = action === "egresar" && isCatalogOnly ? (sedeLocked || sede) : (selectedLocation?.sede || sede);
  const projected = (selectedLocation?.available || 0) - cantidadNum;
  const willGoNegative = action === "egresar" && cantidadNum > (selectedLocation?.available || 0);
  const transitOnly = action === "egresar" && !isCatalogOnly && (selectedLocation?.available || 0) <= 0 && (selectedLocation?.transitQty || 0) > 0;
  const obrasActivas = obras.filter((obra) => !["terminada", "cancelada", "archivada"].includes(obra.estado));
  const ingresoNota = [
    proveedor.trim() ? `Proveedor: ${proveedor.trim()}` : "",
    remito.trim() ? `Remito: ${remito.trim()}` : "",
    factura.trim() ? `Factura: ${factura.trim()}` : "",
    sectorDestino.trim() ? `Ubicacion: ${sectorDestino.trim()}` : "",
    nota.trim(),
  ].filter(Boolean).join(" · ");
  const egresoNota = [
    sectorDestino.trim() ? `Destino: ${sectorDestino.trim()}` : "",
    nota.trim(),
  ].filter(Boolean).join(" · ");

  async function submit() {
    if (!canReceive) return;
    if (!group) {
      toast.warning("Elegí un producto.");
      return;
    }
    setSaving(true);
    try {
      if (action === "egresar") {
        await egresarProducto({
          material: group.material,
          descripcion: group.label,
          codigo: isCatalogOnly ? codigoLibre : group.codigo,
          unidad: isCatalogOnly ? unidadLibre : group.unidad,
          cantidad,
          sede: movementSede,
          obraId: selectedLocation?.obraId || null,
          destinoObraId,
          retiradoPor,
          sectorDestino,
          nota: egresoNota,
          esAdicional: group.esAdicional,
        });
        toast.success(willGoNegative ? "Egreso registrado. Queda a reconciliar con stock negativo." : "Egreso registrado.");
      } else {
        await ingresarStockGeneral({ material: group.material, cantidad, sede: sedeLocked || sede, nota: ingresoNota, esAdicional: group.esAdicional });
        toast.success("Ingreso de ajuste registrado.");
      }
      setDestinoObraId("");
      setRetiradoPor("");
      setSectorDestino("");
      setNota("");
      setProveedor("");
      setRemito("");
      setFactura("");
      await onDone?.();
    } catch (error) {
      toast.error(error.message || "No se pudo registrar el movimiento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
      <div>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>Movimiento de pañol</div>
        <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
          {isCatalogOnly ? "Producto del catalogo completo sin registro digital: el egreso queda como negativo a reconciliar." : "Ingreso, egreso o ajuste sobre el stock cargado."}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setAction("egresar")} disabled={mode === "egreso"} style={{ border: `1px solid ${action === "egresar" ? C.greenB : C.border}`, background: action === "egresar" ? C.greenL : C.panel, color: action === "egresar" ? C.green : C.text, borderRadius: 9, padding: "7px 10px", fontSize: 12, fontWeight: 900, cursor: mode === "egreso" ? "default" : "pointer", fontFamily: C.sans }}>Egreso / ajuste -</button>
        {mode !== "egreso" && (
          <button type="button" onClick={() => setAction("ingresar")} style={{ border: `1px solid ${action === "ingresar" ? C.blueB : C.border}`, background: action === "ingresar" ? C.blueL : C.panel, color: action === "ingresar" ? C.blue : C.text, borderRadius: 9, padding: "7px 10px", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: C.sans }}>Ingreso / ajuste +</button>
        )}
      </div>

      {action === "egresar" && !isCatalogOnly && (
        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>Deposito / obra origen</span>
          <select value={selectedLocation?.key || ""} onChange={(event) => setSelectedLocationKey(event.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }}>
            {group.locations.map((loc) => <option key={loc.key} value={loc.key}>{loc.label} · {fmtQty(loc.available)}</option>)}
          </select>
        </label>
      )}

      {action === "egresar" && isCatalogOnly && !sedeLocked && (
        <SelectFilter label="Sede origen" value={sede} onChange={setSede} options={SEDES_PANOL.map((item) => [item, item])} />
      )}

      {action === "egresar" && isCatalogOnly && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
          <input value={codigoLibre} onChange={(event) => setCodigoLibre(event.target.value)} placeholder="Codigo / barra" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 }} />
          <input value={unidadLibre} onChange={(event) => setUnidadLibre(event.target.value)} placeholder="Unidad" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 }} />
        </div>
      )}

      {action === "ingresar" && !sedeLocked && (
        <SelectFilter label="Sede destino" value={sede} onChange={setSede} options={SEDES_PANOL.map((item) => [item, item])} />
      )}

      {action === "ingresar" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={proveedor} onChange={(event) => setProveedor(event.target.value)} placeholder="Proveedor" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 }} />
          <input value={remito} onChange={(event) => setRemito(event.target.value)} placeholder="Nro. remito" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 }} />
          <input value={factura} onChange={(event) => setFactura(event.target.value)} placeholder="Factura" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 }} />
          <input value={sectorDestino} onChange={(event) => setSectorDestino(event.target.value)} placeholder="Posicion / ubicacion" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 }} />
        </div>
      )}

      <label style={{ display: "grid", gap: 5 }}>
        <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>Cantidad</span>
        <input type="number" min="0.01" step="any" value={cantidad} onChange={(event) => setCantidad(event.target.value)} style={{ background: C.bg, border: `1px solid ${willGoNegative ? C.redB : C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.mono, outline: "none" }} />
      </label>

      {transitOnly && (
        <div style={{ border: `1px solid ${C.amberB}`, background: C.amberL, color: C.amber, borderRadius: 10, padding: "9px 10px", fontSize: 12, lineHeight: 1.35 }}>
          Esta linea esta en transito y todavia no fue recibida por pañol. No cuenta como stock cargado.
        </div>
      )}

      {!transitOnly && willGoNegative && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, padding: "9px 10px", fontSize: 12, lineHeight: 1.35 }}>
          <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>Esto dejará stock negativo ({fmtQty(projected)}). Queda marcado para reconciliar cargando el ingreso faltante.</span>
        </div>
      )}

      {action === "egresar" && (
        <>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>Reasignar a obra</span>
            <select value={destinoObraId} onChange={(event) => setDestinoObraId(event.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }}>
              <option value="">Sin reasignar</option>
              {obrasActivas.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
            </select>
          </label>
          <input value={retiradoPor} onChange={(event) => setRetiradoPor(event.target.value)} placeholder="Receptor / DNI" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }} />
          <input value={sectorDestino} onChange={(event) => setSectorDestino(event.target.value)} placeholder="Sector / uso / entrega" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }} />
        </>
      )}

      <input value={nota} onChange={(event) => setNota(event.target.value)} placeholder={action === "ingresar" ? "Observacion / motivo de ingreso" : "Observacion / detalle del egreso"} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }} />

      <button type="button" onClick={submit} disabled={saving || !canReceive || cantidadNum <= 0 || transitOnly} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, border: `1px solid ${action === "egresar" ? C.greenB : C.blueB}`, background: action === "egresar" ? C.greenL : C.blueL, color: action === "egresar" ? C.green : C.blue, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 950, cursor: saving || !canReceive || cantidadNum <= 0 || transitOnly ? "default" : "pointer", opacity: saving || !canReceive || cantidadNum <= 0 || transitOnly ? 0.6 : 1, fontFamily: C.sans }}>
        {action === "egresar" ? <ArrowUpRight size={15} /> : <PackagePlus size={15} />}
        {saving ? "Registrando..." : action === "egresar" ? "Confirmar egreso" : "Confirmar ingreso"}
      </button>
    </div>
  );
}

function ProductDetail({ group, isMobile, obras, sedeLocked, canReceive, mode, onDone, toast, setSelectedKey, cart, setCart }) {
  const initialLocationKey = group
    ? (group.locations.find((loc) => loc.available > 0) || group.locations[0] || defaultLocation(sedeLocked || "Pampa")).key
    : "";
  const [selectedLocationKey, setSelectedLocationKey] = useState(initialLocationKey);
  const [reconcilingKey, setReconcilingKey] = useState(null);
  const [revertingId, setRevertingId] = useState(null);
  const [reversalTarget, setReversalTarget] = useState(null);
  const [reversalReason, setReversalReason] = useState("");
  const [creatingLocationMaterial, setCreatingLocationMaterial] = useState(false);
  // Toggle C: ocultar filas ya anuladas en el kardex
  const [ocultarAnulados, setOcultarAnulados] = useState(false);

  if (!group) {
    if (mode === "egreso") {
      return (
        <section style={{ minHeight: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid }}>
            <div style={{ color: C.text, fontSize: 17, fontWeight: 950 }}>Egreso multiple</div>
            <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>Busca productos a la izquierda y agregalos a esta lista.</div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "grid", gap: 12, alignContent: "start" }}>
            <EgresoBatchPanel
              group={null}
              selectedLocation={defaultLocation(sedeLocked || "Pampa")}
              obras={obras}
              sedeLocked={sedeLocked}
              canReceive={canReceive}
              onDone={onDone}
              toast={toast}
              cart={cart}
              setCart={setCart}
            />
          </div>
        </section>
      );
    }
    return (
      <section style={{ minHeight: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <Warehouse size={36} style={{ color: C.blue, marginBottom: 10 }} />
          <div style={{ color: C.text, fontSize: 17, fontWeight: 950 }}>Elegí un producto</div>
          <div style={{ color: C.dim, fontSize: 13, lineHeight: 1.45, marginTop: 6 }}>Buscá primero. El detalle muestra saldo por obra/sede, kardex y acciones en un solo lugar.</div>
        </div>
      </section>
    );
  }

  const selectedLocation = group.locations.find((loc) => loc.key === selectedLocationKey) || group.locations[0] || defaultLocation(sedeLocked || "Pampa");
  const sortedRows = [...group.rows].sort((a, b) => new Date(b.egreso_at || b.updated_at || b.created_at || 0) - new Date(a.egreso_at || a.updated_at || a.created_at || 0));
  const negativeLocations = group.locations.filter((loc) => loc.available < 0);
  const visibleKardexRows = ocultarAnulados ? sortedRows.filter((row) => !rowIsAnulado(row)) : sortedRows;
  const detalleAdicional = [...(group.detalles || [])]
    .map((value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);

  async function ingresarFaltante(location) {
    if (!location || location.available >= 0) return;
    const cantidad = Math.abs(location.available);
    const sede = location.sede || sedeLocked || "Pampa";
    setReconcilingKey(location.key);
    try {
      const nota = `Reconciliacion de stock negativo: ${group.label}`;
      if (location.obraId) {
        await crearEnvio({
          titulo: `Reconciliacion ${group.label}`.slice(0, 120),
          sede,
          prioridad: "media",
          obraId: location.obraId,
          destino: location.label,
          observaciones: nota,
          origen: "remito",
          items: [{
            descripcion: group.label,
            codigo: group.codigo || null,
            cantidad: String(cantidad),
            unidad: group.unidad || "unidad",
            material_id: group.material?.id || null,
            obra_id: location.obraId,
            recepcion_estado: "recibido",
            es_adicional: group.esAdicional,
          }],
        });
      } else {
        await ingresarStockGeneral({ material: group.material, cantidad, sede, nota, esAdicional: group.esAdicional });
      }
      toast.success("Ingreso faltante cargado.");
      await onDone?.();
    } catch (error) {
      toast.error(error.message || "No se pudo cargar el ingreso faltante.");
    } finally {
      setReconcilingKey(null);
    }
  }

  async function revertirMovimiento(row, motivoReversion = "") {
    const delta = rowDelta(row);
    if (!delta) return;
    const motivo = String(motivoReversion || "").trim();
    if (!motivo) {
      toast.warning("Escribí el motivo de reversión.");
      return;
    }
    const cantidad = Math.abs(delta);
    const sede = rowSede(row) || sedeLocked || "Pampa";
    const obraId = rowObraId(row) || null;
    const material = {
      id: row.material_id || null,
      descripcion: row.descripcion || group.label,
      codigo: row.codigo || group.codigo || "",
      unidad: row.unidad || group.unidad || "unidad",
    };
    setRevertingId(row.id);
    try {
      const nota = `[anulado] Revierte movimiento ${row.id} - Motivo reversion: ${motivo}`;
      if (delta > 0) {
        await egresarProducto({
          material,
          descripcion: material.descripcion,
          codigo: material.codigo,
          unidad: material.unidad,
          cantidad,
          sede,
          obraId,
          nota,
          retiradoPor: "Anulacion",
          esAdicional: rowIsAdditional(row),
        });
      } else if (obraId) {
        await crearEnvio({
          titulo: `Anulacion ${material.descripcion}`.slice(0, 120),
          sede,
          prioridad: "media",
          obraId,
          destino: rowObraLabel(row),
          observaciones: nota,
          origen: "remito",
          items: [{
            descripcion: material.descripcion,
            codigo: material.codigo || null,
            cantidad: String(cantidad),
            unidad: material.unidad,
            material_id: material.id,
            obra_id: obraId,
            recepcion_estado: "recibido",
            es_adicional: rowIsAdditional(row),
          }],
        });
      } else {
        await ingresarStockGeneral({ material, cantidad, sede, nota, esAdicional: rowIsAdditional(row) });
      }
      await marcarMovimientoAnulado(row.id, nota).catch(() => null);
      setReversalTarget(null);
      setReversalReason("");
      toast.success("Movimiento revertido.");
      await onDone?.();
    } catch (error) {
      toast.error(error.message || "No se pudo revertir el movimiento.");
    } finally {
      setRevertingId(null);
    }
  }

  async function handleLocationSaved(ubicacionNueva, ubicacionObs) {
    try {
      await registrarCambioUbicacionMaterial(
        {
          ...group.material,
          descripcion: group.material?.descripcion || group.label,
          codigo: group.material?.codigo || group.codigo,
          unidad: group.material?.unidad || group.unidad,
          proveedor: group.material?.proveedor || group.proveedor,
        },
        {
          ubicacionAnterior: group.ubicacion,
          ubicacionNueva,
          ubicacionObs,
          sede: selectedLocation?.sede || sedeLocked || "Pampa",
          obraId: selectedLocation?.obraId || null,
          esAdicional: group.esAdicional,
        },
      );
    } catch (error) {
      toast.warning(error.message || "Ubicacion guardada, pero no se pudo registrar en el kardex.");
    } finally {
      await onDone?.();
    }
  }

  async function crearFichaParaUbicacion() {
    if (!canReceive || creatingLocationMaterial) return;
    setCreatingLocationMaterial(true);
    try {
      const created = await crearPanolCatalogMaterialParaEgreso({
        descripcion: group.label,
        codigo: group.codigo,
        unidad: group.unidad || "unidad",
        proveedor: group.proveedor || "",
      });
      await vincularMovimientosAMaterial(group.rows.map((row) => row.id), created.id);
      toast.success("Ficha creada. Ahora podes asignar la estanteria.");
      await onDone?.();
      const prefix = group.key.includes("::") ? group.key.split("::")[0] : "all";
      setSelectedKey(`${prefix}::${created.id}`);
    } catch (error) {
      toast.error(error.message || "No se pudo crear la ficha para ubicar el producto.");
    } finally {
      setCreatingLocationMaterial(false);
    }
  }

  return (
    <section style={{ minHeight: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ color: C.text, fontSize: 17, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</div>
            <KindChip tipo={group.tipoPedido} />
            <StateChip negative={group.negativo} catalogOnly={group.catalogOnly} />
            {group.inTransit && <StateChip transit />}
            <UbicacionChip ubicacion={group.ubicacion} obs={group.ubicacion_obs} size="md" />
          </div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>{group.codigo || "sin codigo"} · disponible {fmtQty(group.total)} {group.unidad}</div>
        </div>
        {isMobile && <button type="button" onClick={() => setSelectedKey(null)} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.text, borderRadius: 8, padding: "7px 9px", fontSize: 12, fontWeight: 850 }}>Lista</button>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "grid", gap: 12, alignContent: "start" }}>
        <div>
          <div style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>Saldos por deposito / obra</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: 7 }}>
            {group.locations.map((loc) => (
              <LocationButton key={loc.key} location={loc} active={selectedLocation?.key === loc.key} onClick={() => setSelectedLocationKey(loc.key)} />
            ))}
          </div>
        </div>

        {canReceive && (
          <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: "10px 12px" }}>
            {group.material?.id ? (
              <UbicacionPicker
                materialId={group.material.id}
                ubicacion={group.ubicacion}
                ubicacionObs={group.ubicacion_obs}
                toast={toast}
                label="Ubicacion fisica del producto"
                onSaved={handleLocationSaved}
              />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <div>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>Ubicacion fisica del producto</div>
                  <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.4, marginTop: 3 }}>
                    Este producto todavia no esta vinculado al catalogo. Crea la ficha para poder asignarle estanteria, verlo en el mapa y dejar futuros cambios en el kardex.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={crearFichaParaUbicacion}
                  disabled={creatingLocationMaterial}
                  style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 9, padding: "8px 11px", cursor: creatingLocationMaterial ? "default" : "pointer", opacity: creatingLocationMaterial ? 0.65 : 1, fontSize: 12, fontWeight: 950, fontFamily: C.sans }}
                >
                  <PackagePlus size={14} />
                  {creatingLocationMaterial ? "Creando..." : "Crear ficha y ubicar"}
                </button>
              </div>
            )}
          </div>
        )}

        {group.esAdicional && detalleAdicional.length > 0 && (
          <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: "10px 12px", display: "grid", gap: 6 }}>
            <div style={{ color: C.violet, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: 1 }}>Detalle del adicional</div>
            {detalleAdicional.map((detalle) => (
              <div key={detalle} style={{ color: C.text, fontSize: 12.5, lineHeight: 1.45 }}>{detalle}</div>
            ))}
          </div>
        )}

        {negativeLocations.length > 0 && (
          <div style={{ border: `1px solid ${C.redB}`, background: C.redL, borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
            <div style={{ color: C.red, fontSize: 12.5, fontWeight: 950 }}>Pendiente de reconciliar</div>
            {negativeLocations.map((loc) => (
              <div key={loc.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loc.label}</div>
                  <div style={{ color: C.red, fontFamily: C.mono, fontSize: 11, fontWeight: 900 }}>faltan {fmtQty(Math.abs(loc.available))} {group.unidad}</div>
                </div>
                <button type="button" onClick={() => ingresarFaltante(loc)} disabled={reconcilingKey === loc.key} style={{ border: `1px solid ${C.redB}`, background: C.panelSolid, color: C.red, borderRadius: 9, padding: "8px 10px", cursor: reconcilingKey === loc.key ? "default" : "pointer", fontSize: 12, fontWeight: 950, fontFamily: C.sans, opacity: reconcilingKey === loc.key ? 0.65 : 1 }}>
                  {reconcilingKey === loc.key ? "Cargando..." : "Cargar ingreso faltante"}
                </button>
              </div>
            ))}
          </div>
        )}

        {mode === "egreso" ? (
          <EgresoBatchPanel
            group={group}
            selectedLocation={selectedLocation}
            obras={obras}
            sedeLocked={sedeLocked}
            canReceive={canReceive}
            onDone={onDone}
            toast={toast}
            cart={cart}
            setCart={setCart}
          />
        ) : (
          <ProductActionPanel
            group={group}
            selectedLocation={selectedLocation}
            setSelectedLocationKey={setSelectedLocationKey}
            obras={obras}
            sedeLocked={sedeLocked}
            canReceive={canReceive}
            mode={mode}
            onDone={onDone}
            toast={toast}
          />
        )}

        <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1 }}>Kardex</div>
            <button
              type="button"
              onClick={() => setOcultarAnulados((v) => !v)}
              style={{ border: `1px solid ${C.border}`, background: ocultarAnulados ? C.blueL : C.panelSolid, color: ocultarAnulados ? C.blue : C.dim, borderRadius: 7, padding: "3px 8px", cursor: "pointer", fontSize: 10, fontWeight: 850, fontFamily: C.sans }}
            >
              {ocultarAnulados ? "Mostrar anulados" : "Ocultar anulados"}
            </button>
          </div>
          {visibleKardexRows.length ? visibleKardexRows.map((row) => (
            <KardexRow
              key={row.id}
              row={row}
              onRevert={(movimiento) => { setReversalTarget(movimiento); setReversalReason(""); }}
              busy={revertingId === row.id}
            />
          )) : (
            <div style={{ color: C.dim, fontSize: 12, padding: "12px 0" }}>
              {(ocultarAnulados && sortedRows.length) ? "Todos los movimientos están anulados. Desactivá el filtro para verlos." : "Producto sin movimientos todavía. Podés egresarlo igual y quedará como negativo a reconciliar."}
            </div>
          )}
        </div>
      </div>
      {reversalTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,23,42,0.38)", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ width: "min(520px, 100%)", border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, boxShadow: "0 24px 70px rgba(15,23,42,0.22)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Revertir movimiento</div>
                <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
                  {reversalTarget.descripcion || group.label} · {fmtQty(Math.abs(rowDelta(reversalTarget)))} {reversalTarget.unidad || group.unidad}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setReversalTarget(null); setReversalReason(""); }}
                disabled={revertingId === reversalTarget.id}
                style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 8, width: 30, height: 30, cursor: revertingId === reversalTarget.id ? "default" : "pointer", fontSize: 16, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: 16, display: "grid", gap: 10 }}>
              <div style={{ border: `1px solid ${C.amberB}`, background: C.amberL, color: C.amber, borderRadius: 10, padding: "9px 10px", fontSize: 12, lineHeight: 1.4 }}>
                Esto crea el movimiento inverso y deja marcado el original como anulado. El motivo queda en el kardex.
              </div>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1 }}>Motivo de reversión</span>
                <textarea
                  value={reversalReason}
                  onChange={(event) => setReversalReason(event.target.value)}
                  placeholder="Ej: carga duplicada, el producto estaba roto, se reemplazó por un adicional, se asignó a otra obra..."
                  rows={4}
                  style={{ resize: "vertical", minHeight: 92, background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: "10px 11px", fontSize: 13, fontFamily: C.sans, outline: "none", lineHeight: 1.45 }}
                />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => { setReversalTarget(null); setReversalReason(""); }}
                  disabled={revertingId === reversalTarget.id}
                  style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.text, borderRadius: 10, padding: "9px 12px", cursor: revertingId === reversalTarget.id ? "default" : "pointer", fontSize: 12, fontWeight: 900, fontFamily: C.sans }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => revertirMovimiento(reversalTarget, reversalReason)}
                  disabled={revertingId === reversalTarget.id || !reversalReason.trim()}
                  style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, padding: "9px 12px", cursor: revertingId === reversalTarget.id || !reversalReason.trim() ? "default" : "pointer", opacity: revertingId === reversalTarget.id || !reversalReason.trim() ? 0.58 : 1, fontSize: 12, fontWeight: 950, fontFamily: C.sans }}
                >
                  {revertingId === reversalTarget.id ? "Revirtiendo..." : "Confirmar reversión"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function StockWmsPanel({ sedeLocked = null, isMobile = false, toast, mode = "stock", canReceive = true, canCreateCatalog = false, initialFObra = "todas", initialScope = "todos" }) {
  const searchInputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [fSede, setFSede] = useState(sedeLocked || "todas");
  const [fObra, setFObra] = useState(initialFObra);
  const [fCategoria, setFCategoria] = useState("todos");
  const [kindScope, setKindScope] = useState("todos");
  const [scope, setScope] = useState(initialScope);
  const [egresoView, setEgresoView] = useState(() => readStoredEgresoView());
  const [selectedKey, setSelectedKey] = useState(null);
  const [catalogMatches, setCatalogMatches] = useState([]);
  const [creating, setCreating] = useState(false);
  const [draftGroup, setDraftGroup] = useState(null);
  const [cart, setCart] = useState([]);

  const defaultSede = sedeLocked || (fSede !== "todas" ? fSede : "Pampa");
  const canShowHistory = mode === "egreso" || fObra !== "todas";

  useEffect(() => {
    const timer = setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [mode]);

  useEffect(() => {
    if (!canShowHistory) setEgresoView("egresar");
  }, [canShowHistory]);

  useEffect(() => {
    if (canShowHistory && typeof window !== "undefined") {
      window.localStorage.setItem(EGRESO_VIEW_STORAGE_KEY, egresoView);
    }
  }, [canShowHistory, egresoView]);

  useEffect(() => {
    setFObra(initialFObra || "todas");
  }, [initialFObra]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const sede = sedeLocked || (fSede !== "todas" ? fSede : null);
      const [stockRows, obraRows] = await Promise.all([
        fetchMaterialesEgreso({ sede, estados: LEDGER_STATES }),
        fetchObrasEgreso().catch(() => []),
      ]);
      setRows(stockRows);
      setObras(obraRows);
    } catch (error) {
      toast.error(error.message || "No se pudo cargar el stock.");
    } finally {
      setLoading(false);
    }
  }, [fSede, sedeLocked, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const baseFilteredRows = useMemo(() => {
    const term = norm(q);
    let filtered = rows;
    if (term) filtered = filtered.filter((row) => rowSearchText(row).includes(term));
    if (fObra !== "todas") filtered = filtered.filter((row) => rowMatchesObraFilter(row, fObra));
    if (fCategoria !== "todos") filtered = filtered.filter((row) => categoryLabel(row) === fCategoria);
    return filtered;
  }, [rows, q, fObra, fCategoria]);

  const kindCounts = useMemo(() => {
    const groups = buildProductGroups(baseFilteredRows, fObra);
    return {
      todos: groups.length,
      stock: groups.filter((group) => group.tipoPedido === "stock").length,
      estandar: groups.filter((group) => group.tipoPedido === "estandar").length,
      adicional: groups.filter((group) => group.tipoPedido === "adicional").length,
    };
  }, [baseFilteredRows, fObra]);

  const searchedRows = useMemo(() => {
    if (kindScope === "stock") return baseFilteredRows.filter((row) => rowTipoPedido(row) === "stock");
    if (kindScope === "estandar") return baseFilteredRows.filter((row) => rowTipoPedido(row) === "estandar");
    if (kindScope === "adicional") return baseFilteredRows.filter((row) => rowTipoPedido(row) === "adicional");
    return baseFilteredRows;
  }, [baseFilteredRows, kindScope]);

  const obraOptions = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const obraId = rowObraId(row);
      const key = obraId ? obraScopeKey(obraId) : rowLocationKey(row);
      if (!map.has(key)) map.set(key, rowObraLabel(row));
    }
    for (const obra of obras) {
      if (obra?.id && !map.has(obraScopeKey(obra.id))) map.set(obraScopeKey(obra.id), obra.codigo || "Obra sin codigo");
    }
    return [["todas", "Todas"], ...[...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "es", { numeric: true }))];
  }, [obras, rows]);

  const categoriaOptions = useMemo(() => filterOptions(rows, categoryLabel), [rows]);
  const scanRows = useMemo(() => {
    let filtered = rows;
    if (fObra !== "todas") filtered = filtered.filter((row) => rowMatchesObraFilter(row, fObra));
    if (fCategoria !== "todos") filtered = filtered.filter((row) => categoryLabel(row) === fCategoria);
    if (kindScope === "stock") filtered = filtered.filter((row) => rowTipoPedido(row) === "stock");
    if (kindScope === "estandar") filtered = filtered.filter((row) => rowTipoPedido(row) === "estandar");
    if (kindScope === "adicional") filtered = filtered.filter((row) => rowTipoPedido(row) === "adicional");
    return filtered;
  }, [rows, fObra, fCategoria, kindScope]);
  const scanGroups = useMemo(() => buildProductGroups(scanRows, fObra), [scanRows, fObra]);

  const productGroupsBase = useMemo(() => buildProductGroups(searchedRows, fObra), [searchedRows, fObra]);
  const productGroups = useMemo(() => {
    const withDraft = draftGroup && norm(q) && norm(draftGroup.label).includes(norm(q))
      ? [draftGroup, ...productGroupsBase.filter((group) => group.key !== draftGroup.key)]
      : productGroupsBase;
    if (scope !== "negativos") return withDraft;
    const negatives = withDraft.filter((group) => group.negativo);
    if (draftGroup && selectedKey === draftGroup.key && !negatives.some((group) => group.key === draftGroup.key)) {
      return [draftGroup, ...negatives];
    }
    return negatives;
  }, [draftGroup, productGroupsBase, q, scope, selectedKey]);

  const historyRows = useMemo(
    () => searchedRows
      .filter((row) => rowIsEgreso(row))
      .sort((a, b) => new Date(rowMovementAt(b) || 0) - new Date(rowMovementAt(a) || 0)),
    [searchedRows],
  );

  const selectedGroup = useMemo(
    () => productGroups.find((group) => group.key === selectedKey) || null,
    [productGroups, selectedKey],
  );

  useEffect(() => {
    if (selectedKey && !productGroups.some((group) => group.key === selectedKey)) setSelectedKey(null);
  }, [productGroups, selectedKey]);

  useEffect(() => {
    // Solo resetear si los datos ya cargaron, para que initialFObra no se pierda antes de que lleguen las rows
    if (fObra !== "todas" && rows.length > 0 && !obraOptions.some(([key]) => key === fObra)) setFObra("todas");
  }, [fObra, obraOptions, rows]);

  useEffect(() => {
    if (fCategoria !== "todos" && !categoriaOptions.some(([key]) => key === fCategoria)) setFCategoria("todos");
  }, [fCategoria, categoriaOptions]);

  useEffect(() => {
    let alive = true;
    const term = q.trim();
    if (term.length < 2) {
      setCatalogMatches([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const rows = await fetchPanolCatalogMini({ q: term, limit: CATALOG_SEARCH_LIMIT });
        if (!alive) return;
        const stockedIds = new Set(productGroupsBase.map((group) => group.material.id).filter(Boolean));
        setCatalogMatches(rows.filter((mat) => !stockedIds.has(mat.id)).slice(0, CATALOG_SEARCH_LIMIT));
      } catch {
        if (alive) setCatalogMatches([]);
      }
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, productGroupsBase]);

  const kpis = useMemo(() => {
    const allGroups = buildProductGroups(rows, fObra);
    const totalUnits = allGroups.reduce((sum, group) => sum + group.total, 0);
    const negativos = allGroups.filter((group) => group.negativo).length;
    const transito = allGroups.reduce((sum, group) => sum + group.transitQty, 0);
    const valorUsd = allGroups.reduce((sum, group) => sum + Math.max(0, group.valueUsd || 0), 0);
    const today = rows.filter((row) => isToday(row.egreso_at || row.recepcion_updated_at || row.updated_at || row.created_at)).length;
    return {
      productos: allGroups.filter((group) => group.total > 0).length,
      unidades: fmtQty(totalUnits),
      negativos,
      transito: fmtQty(transito),
      valorUsd: fmtQty(valorUsd),
      hoy: today,
    };
  }, [rows, fObra]);

  async function createFromSearch() {
    const desc = q.trim();
    if (!desc) return;
    if (!canCreateCatalog) {
      toast.warning("Solo un administrador puede crear materiales nuevos desde egresos.");
      return;
    }
    setCreating(true);
    try {
      const created = await crearPanolCatalogMaterialParaEgreso({ descripcion: desc, unidad: "unidad" });
      const group = emptyCatalogGroup(created, defaultSede, kindScope === "adicional");
      setDraftGroup(group);
      setSelectedKey(group.key);
      toast.success("Material creado en catalogo. Ya podés registrar el egreso.");
    } catch (error) {
      toast.error(error.message || "No se pudo crear el material.");
    } finally {
      setCreating(false);
    }
  }

  function selectCatalogMaterial(material) {
    const group = emptyCatalogGroup(material, defaultSede, kindScope === "adicional");
    setDraftGroup(group);
    setSelectedKey(group.key);
  }

  function selectManualMaterial() {
    const desc = q.trim();
    if (!desc) return;
    const group = manualEgresoGroup(desc, defaultSede, kindScope === "adicional");
    setDraftGroup(group);
    setSelectedKey(group.key);
  }

  function applyScanCode(rawCode) {
    const code = String(rawCode || "").trim();
    if (!code) return;
    setQ(code);
    const exact = scanGroups.find((group) => groupMatchesCode(group, code));
    if (exact) {
      setSelectedKey(exact.key);
      toast?.success?.(`${mode === "egreso" ? "Listo para egresar" : "Producto detectado"}: ${exact.label}`);
    } else {
      setSelectedKey(null);
      if (mode === "egreso") toast?.warning?.("No esta en stock. Buscando en catalogo para egresarlo igual.");
    }
    setTimeout(() => searchInputRef.current?.focus(), 60);
  }

  function openProductFromHistory(row) {
    const search = row.codigo || row.descripcion || "";
    setScope("todos");
    setKindScope("todos");
    setQ(search);
    setSelectedKey(productKey(row, fObra));
    setEgresoView("egresar");
    setTimeout(() => searchInputRef.current?.focus(), 60);
  }

  useKeyboardWedge({
    enabled: !scannerOpen,
    onScan: applyScanCode,
  });

  return (
    <>
      <div style={{ background: C.topbarSoft, borderBottom: `1px solid ${C.border}`, padding: isMobile ? "10px 12px" : "10px 18px", display: "grid", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 320px", minWidth: isMobile ? "100%" : 320 }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
            <input
              ref={searchInputRef}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  applyScanCode(q);
                }
              }}
              placeholder={mode === "egreso" ? "Escanear o buscar codigo / producto..." : "Escanear o buscar codigo, producto, obra, proveedor..."}
              title="Acepta lector USB/PC: escanea y confirma con Enter o Tab"
              style={{ width: "100%", boxSizing: "border-box", background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, padding: "9px 34px", borderRadius: 10, fontSize: 13, fontFamily: C.sans, outline: "none" }}
            />
            {q && (
              <button type="button" onClick={() => setQ("")} title="Limpiar" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "grid", placeItems: "center", padding: 4 }}>
                <X size={14} />
              </button>
            )}
          </div>
          <button type="button" onClick={() => setScannerOpen(true)} title="Escanear con la cámara" style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 10, padding: "9px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 850, fontFamily: C.sans, flexShrink: 0 }}>
            <ScanLine size={16} />{!isMobile && <span>Escanear</span>}
          </button>
          <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={(code) => { setScannerOpen(false); applyScanCode(code); }} />
          {canShowHistory && (
            <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 10, padding: 3, gap: 3, flexShrink: 0 }}>
              {[
                ["egresar", mode === "egreso" ? "Egresar" : "Stock"],
                ["historial", `Historial (${historyRows.length})`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEgresoView(key)}
                  style={{
                    border: `1px solid ${egresoView === key ? C.blueB : "transparent"}`,
                    background: egresoView === key ? C.blueL : "transparent",
                    color: egresoView === key ? C.blue : C.text,
                    borderRadius: 8,
                    padding: "7px 10px",
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: "pointer",
                    fontFamily: C.sans,
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <SelectFilter label="Vista" value={scope} onChange={setScope} options={[["todos", "Todos"], ["negativos", "A reconciliar"]]} />
          <SelectFilter label="Tipo" value={kindScope} onChange={setKindScope} options={[["todos", `Todos (${kindCounts.todos})`], ["stock", `Stock pañol (${kindCounts.stock})`], ["estandar", `Estándar (${kindCounts.estandar})`], ["adicional", `Adicionales (${kindCounts.adicional})`]]} />
          <SelectFilter label="Obra / stock" value={fObra} onChange={setFObra} options={obraOptions} />
          <SelectFilter label="Categoria" value={fCategoria} onChange={setFCategoria} options={categoriaOptions} />
          {!sedeLocked && <SelectFilter label="Sede" value={fSede} onChange={setFSede} options={[["todas", "Todas"], ...SEDES_PANOL.map((sede) => [sede, sede])]} />}
          <button type="button" onClick={cargar} disabled={loading} title="Actualizar" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 10, padding: "9px 10px", cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, display: "grid", placeItems: "center" }}>
            <RefreshCw size={15} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(6, minmax(120px, 1fr))", gap: 8 }}>
          <KpiCard icon={Warehouse} label="Productos en stock" value={kpis.productos} detail="saldo positivo" color={C.blue} />
          <KpiCard icon={PackageCheck} label="Unidades totales" value={kpis.unidades} detail="ingresos menos egresos" color={C.green} />
          <KpiCard icon={AlertTriangle} label="A reconciliar" value={kpis.negativos} detail="productos con negativo" color={kpis.negativos ? C.red : C.dim} />
          <KpiCard icon={Inbox} label="Por recibir" value={kpis.transito} detail="no cuenta como stock" color={C.amber} />
          <KpiCard icon={PackagePlus} label="Valor stock USD" value={kpis.valorUsd} detail="solo precios USD" color={C.green} />
          <KpiCard icon={Inbox} label="Movimientos hoy" value={kpis.hoy} detail={sedeLocked || (fSede === "todas" ? "todas las sedes" : fSede)} color={C.violet} />
        </div>
      </div>

      {canShowHistory && egresoView === "historial" ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: isMobile ? 12 : "14px 18px 18px", display: "grid" }}>
          <EgresosHistoryView rows={historyRows} loading={loading} obras={obras} isMobile={isMobile} onOpenProduct={openProductFromHistory} />
        </div>
      ) : (
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: isMobile ? 12 : "14px 18px 18px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(360px, 480px) minmax(420px, 1fr)", gap: 12 }}>
        <section style={{ minHeight: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>{mode === "egreso" ? "Egreso sobre stock real" : "Stock maestro"}</div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{productGroups.length} productos visibles · stock cargado calculado por kardex</div>
            </div>
          </div>
          <div style={{ padding: 8, display: "grid", gap: 7, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 30, textAlign: "center", color: C.dim, fontSize: 12, fontWeight: 850 }}>Cargando stock...</div>
            ) : productGroups.length ? (
              productGroups.map((group) => (
                <ProductCard key={group.key} group={group} active={selectedKey === group.key} onOpen={setSelectedKey} isMobile={isMobile} />
              ))
            ) : (
              <div style={{ padding: 22, border: `1px dashed ${C.border}`, borderRadius: 10, color: C.dim, textAlign: "center", fontSize: 13 }}>
                No hay stock para estos filtros.
              </div>
            )}

            {q.trim().length >= 2 && (
              <div style={{ border: `1px dashed ${C.blueB}`, background: C.blueL, borderRadius: 10, padding: 10, display: "grid", gap: 7 }}>
                <div>
                  <div style={{ color: C.text, fontSize: 12.5, fontWeight: 900 }}>Catalogo completo</div>
                  <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Si no aparece en stock, elegilo del catalogo y egresalo igual. El saldo queda negativo para reconciliar.</div>
                </div>
                {catalogMatches.map((mat) => (
                  <button key={mat.id} type="button" onClick={() => selectCatalogMaterial(mat)} style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 10px", textAlign: "left", cursor: "pointer", fontFamily: C.sans }}>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 900 }}>{mat.descripcion}</span>
                    <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 2 }}>{mat.codigo || "sin codigo"} - sin stock cargado</span>
                  </button>
                ))}
                {!catalogMatches.length && (
                  <div style={{ color: C.dim, fontSize: 12, padding: "4px 2px" }}>No hay coincidencias en el catalogo.</div>
                )}
                {canReceive && (
                  <button type="button" onClick={selectManualMaterial} style={{ border: `1px solid ${C.greenB}`, background: C.panelSolid, color: C.green, borderRadius: 9, padding: "8px 10px", cursor: "pointer", fontSize: 12, fontWeight: 950, fontFamily: C.sans, textAlign: "left" }}>
                    Egresar "{q.trim()}" sin stock virtual
                  </button>
                )}
                <button type="button" onClick={createFromSearch} disabled={creating || !canCreateCatalog} style={{ border: `1px solid ${canCreateCatalog ? C.blueB : C.border}`, background: C.panelSolid, color: canCreateCatalog ? C.blue : C.dim, borderRadius: 9, padding: "8px 10px", cursor: creating || !canCreateCatalog ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 950, fontFamily: C.sans }}>
                  {!canCreateCatalog ? "Crear nuevo requiere administrador" : creating ? "Creando..." : `Crear "${q.trim()}" en catalogo`}
                </button>
              </div>
            )}
          </div>
        </section>

        <ProductDetail
          key={selectedGroup?.key || "empty"}
          group={selectedGroup}
          isMobile={isMobile}
          obras={obras}
          sedeLocked={sedeLocked}
          canReceive={canReceive}
          mode={mode}
          onDone={cargar}
          toast={toast}
          setSelectedKey={setSelectedKey}
          cart={cart}
          setCart={setCart}
        />
      </div>
      )}
    </>
  );
}
