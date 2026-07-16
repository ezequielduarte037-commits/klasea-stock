import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  MapPin,
  PackagePlus,
  RefreshCw,
  Save,
  ScanLine,
  Search,
  ShoppingCart,
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
  liberarProductoAStock,
  marcarMovimientoAnulado,
  registrarCambioUbicacionMaterial,
  retiradoPorNombreCompletoError,
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

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
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
  // Adicional de una obra
  if (rowIsAdditional(row) || row.tipo_pedido === "adicional" || row.request?.tipo_pedido === "adicional") return "adicional";
  // Stock pañol = stock general SIN obra asignada (conteo físico, ingreso general,
  // transferencias a stock). Estándar = reservado/asignado a una obra puntual.
  // Antes se clasificaba por sede (Pampa=stock), lo cual no tenía sentido.
  if (!rowObraId(row)) return "stock";
  return "estandar";
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
  return !!row.egreso_destino_obra_id || row.estado === "egresado" || source.startsWith("egreso") || source.startsWith("transferencia_egreso");
}

function rowIsAsignacionStock(row) {
  return rowSource(row) === "transferencia_ingreso";
}

function rowIsAsignacionMirrorOut(row) {
  const label = String(row.tipo_label || "").toLowerCase();
  return rowSource(row) === "transferencia_egreso" && !label.includes("liber");
}

function rowInHistory(row) {
  return rowIsAsignacionStock(row) || (rowIsEgreso(row) && !rowIsAsignacionMirrorOut(row));
}

function rowEgresoKind(row) {
  const source = rowSource(row);
  if (rowIsAsignacionStock(row)) {
    return row.obra_origen_id ? "reasignacion" : "asignacion";
  }
  if (row.egreso_destino_obra_id || source.startsWith("transferencia_egreso")) {
    return rowObraId(row) ? "reasignacion_egreso" : "egreso_obra";
  }
  return "egreso";
}

function rowEgresoMeta(row) {
  const kind = rowEgresoKind(row);
  if (kind === "asignacion") return { label: "Asignación", color: C.blue };
  if (kind === "reasignacion") return { label: "Reasignación", color: C.violet };
  if (kind === "egreso_obra") return { label: "Asign. -> egreso", color: C.red };
  if (kind === "reasignacion_egreso") return { label: "Reasig. -> egreso", color: C.violet };
  return { label: "Egreso", color: C.red };
}

function obraCodigoFromMap(id, obraById = null) {
  if (!id) return "";
  return obraById?.get?.(id)?.codigo || "";
}

function rowOrigenMovimientoLabel(row, obraById = null) {
  if (rowIsAsignacionStock(row)) {
    return row.obra_origen_id ? obraCodigoFromMap(row.obra_origen_id, obraById) || "obra" : (row.stock_sede ? `Stock ${row.stock_sede}` : "Stock");
  }
  return rowObraLabel(row);
}

function rowDestinoMovimientoLabel(row, obraById = null) {
  if (rowIsAsignacionStock(row)) {
    return obraCodigoFromMap(row.obra_id, obraById) || row.obra?.codigo || "obra";
  }
  if (!row.egreso_destino_obra_id) return "";
  const destino = obraById?.get?.(row.egreso_destino_obra_id) || row.egreso_destino_obra || null;
  return destino?.codigo || "obra";
}

function rowMovimientoRuta(row, obraById = null) {
  const destino = rowDestinoMovimientoLabel(row, obraById);
  if (destino) return `${rowOrigenMovimientoLabel(row, obraById)} -> ${destino}`;
  if (row.sector_destino) return row.sector_destino;
  return rowObraLabel(row);
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
    row.variante,
    materialBarcodeText(row),
    row.proveedor,
    row.rubro,
    row.categoria_nombre,
    rowObraLabel(row),
    rowSede(row),
    row.estado,
    row.retirado_por,
    row.egreso_por_nombre,
    row.created_by_nombre,
    row.egreso_nota,
    row.stock_nota,
    row.sector_destino,
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

// El tipo del grupo se decide por el STOCK DISPONIBLE, no por el primer renglón
// (que podía ser un tránsito suelto y forzaba "Estándar"). Si hay stock general
// disponible → Stock pañol; si el stock disponible está reservado a obra → Estándar.
function groupTipoFromStock(group) {
  const stockRows = (group.rows || []).filter((r) => rowCountsAsStock(r));
  const rowsUse = stockRows.length ? stockRows : (group.rows || []);
  if (rowsUse.some((r) => rowIsAdditional(r))) return "adicional";
  if (rowsUse.some((r) => !rowObraId(r))) return "stock";
  if (rowsUse.some((r) => rowObraId(r))) return "estandar";
  return group.tipoPedido || "estandar";
}

// "Solo por recibir": no tiene stock real, solo tránsito (ej. recepciones que
// quedaron colgadas). Van al fondo del maestro para no molestar.
function isTransitOnly(group) {
  return group.total <= 0.0001 && group.transitQty > 0 && !group.negativo;
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
        variantes: Array.isArray(row.variantes) ? row.variantes.map((v) => (v && typeof v === "object" ? v.nombre : String(v || ""))).filter(Boolean) : [],
        variantesEnStock: new Set(),
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
    if ((!group.variantes || !group.variantes.length) && Array.isArray(row.variantes) && row.variantes.length) {
      group.variantes = row.variantes.map((v) => (v && typeof v === "object" ? v.nombre : String(v || ""))).filter(Boolean);
    }
    const varChosen = String(row.variante || "").trim();
    if (varChosen) group.variantesEnStock.add(varChosen);
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
        variantMap: new Map(),
        rows: [],
      });
    }
    const location = group.locationMap.get(locKey);
    location.available += delta;
    location.valueUsd += delta * rowUnitPriceUsd(row);
    // Desglose por variante dentro de este depósito/obra (Samsung: 10 · LG: 10)
    const vName = String(row.variante || "").trim();
    if (!location.variantMap.has(vName)) location.variantMap.set(vName, { available: 0, transitQty: 0 });
    const vAgg = location.variantMap.get(vName);
    vAgg.available += delta;
    if (rowIsTransit(row)) {
      const transit = qty(row.cantidad, 1);
      location.transitQty += transit;
      group.transitQty += transit;
      vAgg.transitQty += transit;
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
      .map((loc) => ({
        ...loc,
        porVariante: [...loc.variantMap.entries()]
          .filter(([name, agg]) => name && (Math.abs(agg.available) > 0.0001 || agg.transitQty > 0))
          .map(([name, agg]) => ({ variante: name, available: agg.available, transitQty: agg.transitQty }))
          .sort((a, b) => b.available - a.available),
      }))
      .sort((a, b) => b.available - a.available || a.label.localeCompare(b.label, "es", { numeric: true }));
    const hasPositiveStock = locations.some((loc) => loc.available > 0.0001);
    return {
      ...group,
      tipoPedido: groupTipoFromStock(group),
      locations,
      egresado: group.hasEgreso && !hasPositiveStock && group.transitQty <= 0,
      negativo: group.total < 0 || locations.some((loc) => loc.available < 0),
      inTransit: group.transitQty > 0,
    };
  }).sort((a, b) => {
    // Los "solo por recibir" (sin stock real) van al fondo.
    const at = isTransitOnly(a) ? 1 : 0;
    const bt = isTransitOnly(b) ? 1 : 0;
    if (at !== bt) return at - bt;
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

function sortProductGroups(groups, orderBy) {
  if (orderBy !== "recientes") return groups;
  return [...groups].sort((a, b) => {
    const ta = new Date(a.updatedAt || 0).getTime();
    const tb = new Date(b.updatedAt || 0).getTime();
    if (tb !== ta) return tb - ta;
    return String(a.label || "").localeCompare(String(b.label || ""), "es", { numeric: true });
  });
}

function SelectFilter({ label, value, onChange, options }) {
  return (
    <label style={{ display: "grid", gap: 4, minWidth: 112, flex: "1 1 132px", maxWidth: 220 }}>
      <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: "100%", minWidth: 0, background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12, fontWeight: 750, fontFamily: C.sans, outline: "none" }}
      >
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  );
}

function StateChip({ negative, catalogOnly = false, transit = false, egresado = false, compact = false }) {
  if (compact && !egresado && !transit && !catalogOnly && !negative) return null;
  const color = egresado ? C.red : transit ? C.amber : catalogOnly ? C.amber : negative ? C.red : C.green;
  const border = egresado ? C.redB : transit ? C.amberB : catalogOnly ? C.amberB : negative ? C.redB : C.greenB;
  const background = egresado ? C.redL : transit ? C.amberL : catalogOnly ? C.amberL : negative ? C.redL : C.greenL;
  const label = egresado ? "Egresado" : transit ? "Por recibir" : catalogOnly ? "Sin registro" : negative ? "A reconciliar" : "Disponible";
  return (
    <span style={{
      color,
      border: `1px solid ${border}`,
      background,
      borderRadius: 999,
      padding: compact ? "2px 7px" : "3px 8px",
      fontSize: compact ? 9.5 : 10,
      fontWeight: 950,
      textTransform: "uppercase",
      letterSpacing: compact ? 0.35 : 0.6,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function KindChip({ tipo = "estandar" }) {
  // Solo mostramos un chip de tipo cuando es "adicional" (lo pide el dueño de la obra).
  // El resto (estándar / stock general) es simplemente stock disponible en pañol —
  // el estado "Disponible" ya lo indica el StateChip, así que no metemos ruido.
  if (tipo !== "adicional") return null;
  const color = C.violet, background = "rgba(124,58,237,0.10)", border = "rgba(124,58,237,0.26)", label = "Adicional";
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

// Obras a las que hay stock asignado (ubicaciones con obra y saldo disponible).
function groupAsignaciones(group) {
  return (group?.locations || [])
    .filter((loc) => loc.obraId && loc.available > 0.0001)
    .map((loc) => ({ obraId: loc.obraId, label: loc.label, sede: loc.sede || "", available: loc.available, key: loc.key }));
}

// Chip que muestra a qué obra(s) está asignado el stock (reemplaza al confuso "Estándar").
function AsignadoChip({ asignaciones = [], compact = false }) {
  if (!asignaciones.length) return null;
  if (compact) return null;
  const label = asignaciones.length === 1
    ? `Asignado · ${asignaciones[0].label}`
    : `Asignado · ${asignaciones.length} obras`;
  return (
    <span style={{
      color: C.blue,
      border: `1px solid ${C.blueB}`,
      background: C.blueL,
      borderRadius: 999,
      padding: "3px 9px",
      fontSize: 10,
      fontWeight: 950,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      whiteSpace: "nowrap",
      maxWidth: 180,
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}>
      {label}
    </span>
  );
}

// memo: al agregar al carrito (o seleccionar) solo se re-renderizan las tarjetas
// afectadas, no las 300+ de la lista — el click se siente inmediato.
const ProductCard = memo(function ProductCard({ group, active, onOpen, canSeePrices = true, onAddToCart, inCart = false, dense = false }) {
  const [cartHover, setCartHover] = useState(false);
  const [hover, setHover] = useState(false);
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
  const sinUbicacion = !group.ubicacion;
  const barcode = group.codigo_barra || materialBarcodeList(group.material)[0]?.codigo || group.codigos_barra?.[0]?.codigo || "";
  const codeLabel = group.codigo
    ? (barcode ? `${group.codigo} · CB ${barcode}` : group.codigo)
    : (barcode ? `CB ${barcode}` : "sin código");

  // ── Variante DENSA (lista angosta con detalle abierto): 2 líneas, micro-chips ──
  if (dense) {
    const asigs = groupAsignaciones(group);
    const estadoMini = group.egresado ? ["EGRESADO", C.red] : group.negativo ? ["NEGATIVO", C.red] : group.inTransit ? ["POR RECIBIR", C.amber] : null;
    const micro = (label, color) => (
      <span style={{ fontSize: 8.5, fontWeight: 950, color, border: `1px solid ${color}44`, background: `${color}12`, borderRadius: 999, padding: "0 5px", flexShrink: 0, whiteSpace: "nowrap", lineHeight: "13px" }}>{label}</span>
    );
    return (
      <button
        type="button"
        onClick={() => onOpen(group.key)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4, border: `1px solid ${active || hover ? C.blueB : group.negativo ? C.redB : C.border}`, background: active ? C.blueL : hover ? "rgba(59,130,246,0.06)" : C.panelSolid, borderRadius: 9, padding: "7px 9px", cursor: "pointer", color: C.text, textAlign: "left", fontFamily: C.sans, minWidth: 0, transform: hover && !active ? "translateX(2px)" : "none", transition: "border-color .12s, background .12s, transform .12s" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</span>
          <span style={{ color: qtyColor, fontFamily: C.mono, fontSize: 14, fontWeight: 950, flexShrink: 0 }}>
            {fmtQty(group.total)}<span style={{ color: C.dim, fontSize: 9, fontWeight: 800, marginLeft: 3 }}>{group.unidad || "u"}</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
          {estadoMini && micro(estadoMini[0], estadoMini[1])}
          {asigs.length > 0 && micro(asigs.length === 1 ? asigs[0].label : `${asigs.length} OBRAS`, C.blue)}
          {group.tipoPedido === "adicional" && micro("ADIC", C.violet)}
          <span style={{ flex: 1, minWidth: 0, color: C.dim, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {group.ubicacion ? `${group.ubicacion} · ` : ""}{codeLabel !== "sin código" ? `${group.codigo || barcode} · ` : ""}{stockDetail}
          </span>
          {onAddToCart && group.total > 0.0001 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onAddToCart(group); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onAddToCart(group); } }}
              onMouseEnter={() => setCartHover(true)}
              onMouseLeave={() => setCartHover(false)}
              title={inCart ? "Ya está en el carrito · click para actualizar" : "Agregar al carrito"}
              style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 24, height: 19, borderRadius: 999, border: `1px solid ${inCart || cartHover ? C.greenB : C.border}`, background: inCart || cartHover ? C.greenL : "transparent", color: inCart || cartHover ? C.green : C.dim, cursor: "pointer", transition: "color .12s, border-color .12s, background .12s" }}
            >
              <ShoppingCart size={11} />
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(group.key)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        border: `1px solid ${active || hover ? C.blueB : group.negativo ? C.redB : C.border}`,
        background: active ? C.blueL : group.negativo ? C.redL : hover ? "rgba(59,130,246,0.06)" : C.panelSolid,
        borderRadius: 11,
        padding: "9px 10px",
        cursor: "pointer",
        color: C.text,
        textAlign: "left",
        fontFamily: C.sans,
        transform: hover && !active ? "translateY(-2px)" : "none",
        boxShadow: hover && !active ? "0 8px 20px -10px rgba(0,0,0,0.25)" : "none",
        transition: "border-color .12s, background .12s, transform .12s, box-shadow .12s",
      }}
    >
      {/* Fila 1: nombre completo (hasta 2 líneas) + disponible */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <span style={{ flex: 1, minWidth: 0, color: C.text, fontSize: 13, fontWeight: 900, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: active ? 2 : 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{group.label}</span>
        <div style={{ display: "grid", justifyItems: "end", gap: 1, flexShrink: 0 }}>
          <span style={{ color: qtyColor, fontFamily: C.mono, fontSize: 17, fontWeight: 950, lineHeight: 1 }}>{fmtQty(group.total)}</span>
          <span style={{ color: C.dim, fontSize: 8, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.5 }}>{group.unidad || "u"}</span>
        </div>
      </div>
      {/* Fila 2: badges + ubicación / sin ubicación */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <KindChip tipo={group.tipoPedido} />
        <AsignadoChip asignaciones={groupAsignaciones(group)} compact />
        <StateChip egresado={group.egresado} transit={group.inTransit} catalogOnly={group.catalogOnly} negative={group.negativo} compact />
        {sinUbicacion ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.amber, background: C.amberL, border: `1px solid ${C.amberB}`, borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 900 }}>
            <MapPin size={11} /> Sin ubicación
          </span>
        ) : (
          <UbicacionChip ubicacion={group.ubicacion} obs={group.ubicacion_obs} />
        )}
      </div>
      {/* Variantes del producto (resaltadas las que están en stock) */}
      {active && group.variantes?.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 8.5, color: C.dim, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6 }}>Variantes</span>
          {group.variantes.slice(0, 8).map((v) => {
            const enStock = group.variantesEnStock?.has?.(v);
            return (
              <span key={v} style={{ fontSize: 10, fontWeight: 850, color: C.violet, background: enStock ? "rgba(139,92,246,0.16)" : "transparent", border: `1px solid ${enStock ? "rgba(139,92,246,0.42)" : C.border}`, borderRadius: 999, padding: "1px 7px" }}>{v}</span>
            );
          })}
        </div>
      )}
      {/* Fila 3: meta (código · proveedor · rubro · valor) */}
      <div style={{ color: C.dim, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {codeLabel}{group.proveedor ? ` · ${group.proveedor}` : ""}{group.categorias.size ? ` · ${[...group.categorias][0]}` : ""}
        {canSeePrices && group.valueUsd > 0 ? ` · USD ${fmtQty(group.valueUsd)}` : ""}
      </div>
      {/* Fila 4: depósito / obra */}
      {active && <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ color: C.dim, fontSize: 8.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.7, flexShrink: 0 }}>Depósito/obra</span>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, fontWeight: 700, color: group.egresado || group.negativo ? C.red : C.t1 }}>
          {stockDetail}{group.locations.length > 4 ? ` · +${group.locations.length - 4}` : ""}
        </span>
      </div>}
      {/* Quick-add al carrito: chip sutil, no invade la tarjeta */}
      {onAddToCart && group.total > 0.0001 && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onAddToCart(group); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onAddToCart(group); } }}
          onMouseEnter={() => setCartHover(true)}
          onMouseLeave={() => setCartHover(false)}
          title={inCart ? "Ya está en el carrito · click para actualizar" : "Agregar al carrito"}
          style={{
            alignSelf: "flex-end", display: "inline-flex", alignItems: "center", gap: 5,
            border: `1px solid ${inCart || cartHover ? C.greenB : C.border}`,
            background: inCart || cartHover ? C.greenL : "transparent",
            color: inCart || cartHover ? C.green : C.dim,
            borderRadius: 999, padding: "2px 9px", fontSize: 10.5, fontWeight: 850, cursor: "pointer",
            transform: cartHover ? "scale(1.06)" : "none",
            transition: "color .12s, border-color .12s, background .12s, transform .12s",
          }}
        >
          <ShoppingCart size={11} /> {cartHover && !inCart ? "+ Agregar" : inCart ? "En carrito" : "Carrito"}
        </span>
      )}
    </button>
  );
});

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
        {location.porVariante?.length > 0 && (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {location.porVariante.map((pv) => (
              <span key={pv.variante} style={{ fontSize: 10, fontWeight: 850, color: C.violet, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 999, padding: "1px 7px" }}>
                {pv.variante}: {fmtQty(pv.available)}{pv.transitQty > 0 ? ` (+${fmtQty(pv.transitQty)} por recibir)` : ""}
              </span>
            ))}
          </span>
        )}
        {location.transitQty > 0 && (
          <span style={{ display: "block", color: C.amber, fontSize: 10.5, marginTop: 2 }}>por recibir {fmtQty(location.transitQty)}</span>
        )}
      </span>
      <span style={{ color: location.available < 0 ? C.red : C.green, fontFamily: C.mono, fontSize: 14, fontWeight: 950 }}>{fmtQty(location.available)}</span>
    </button>
  );
}

function KardexRow({ row, onRevert, busy, obraById }) {
  const delta = rowDelta(row);
  const isLocation = rowIsLocationChange(row);
  const isOut = row.estado === "egresado";
  const isAssignment = rowIsAsignacionStock(row);
  const isTransit = rowIsTransit(row);
  const egresoMeta = rowEgresoMeta(row);
  const label = isLocation ? "Ubicacion" : isAssignment ? egresoMeta.label : isTransit ? "Transito" : isOut ? egresoMeta.label : row.estado === "problema" ? "Problema" : "Ingreso";
  const labelColor = isLocation ? C.blue : isAssignment ? egresoMeta.color : isTransit ? C.amber : isOut ? egresoMeta.color : C.green;
  const descripcion = row.descripcion || "(sin descripcion)";
  const codigo = row.codigo ? ` · ${row.codigo}` : "";
  const variante = String(row.variante || "").trim();
  const detalle = [
    fmtDate(rowMovementAt(row)),
    (isOut || isAssignment) ? rowMovimientoRuta(row, obraById) : `${rowObraLabel(row)} · ${rowSede(row) || "Sin sede"}`,
    variante ? `Variante: ${variante}` : "",
    rowMovimientoRetira(row) ? `Retira: ${rowMovimientoRetira(row)}` : "",
    `Usuario: ${rowMovimientoUsuario(row) || "sin registrar"}`,
    row.egreso_nota || row.notas || "",
  ].filter(Boolean).join(" · ");
  // Guard B: deshabilitar Revertir si ya contiene "[anulado]" en notas
  const yaAnulado = rowIsAnulado(row);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "74px minmax(0, 1fr) 86px 68px", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: labelColor, fontSize: 11, fontWeight: 950 }}>{label}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: C.text, fontSize: 12.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{descripcion}{codigo}</span>
        <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {detalle}
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
    const destinoObra = rowDestinoMovimientoLabel(row, obraById);
    if (destinoObra) return destinoObra;
    if (row.sector_destino) return row.sector_destino;
    return "Salida / consumo";
  }

  function detalleLabel(row) {
    const variante = String(row.variante || "").trim();
    return [
      variante ? `Variante: ${variante}` : "",
      rowMovimientoRetira(row) ? `Retira: ${rowMovimientoRetira(row)}` : "",
      `Usuario: ${rowMovimientoUsuario(row) || "sin registrar"}`,
      row.egreso_nota || row.notas || "",
    ]
      .filter(Boolean)
      .join(" - ");
  }

  return (
    <section style={{ minHeight: 0, minWidth: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>Historial de movimientos</div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Egresos, asignaciones y reasignaciones ya registradas.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ border: `1px solid ${C.border}`, background: C.bg, color: C.text, borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 900 }}>{rows.length} movimientos</span>
          <span style={{ border: `1px solid ${C.border}`, background: C.bg, color: C.text, borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 900 }}>{fmtQty(totals.unidades)} unidades</span>
          <span style={{ border: `1px solid ${C.border}`, background: C.bg, color: C.text, borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 900 }}>{totals.materiales} productos</span>
          <span style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 900 }}>{totals.hoy} hoy</span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "grid", gap: 8, alignContent: "start" }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: C.dim, fontSize: 12, fontWeight: 850 }}>Cargando movimientos...</div>
        ) : rows.length ? rows.map((row) => {
          const detalle = detalleLabel(row);
          const qtyOut = rowEgresoQuantity(row);
          const tipoMeta = rowEgresoMeta(row);
          const isAssignment = rowIsAsignacionStock(row);
          const qtyPrefix = isAssignment ? "→" : "-";
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
                <div style={{ color: tipoMeta.color, fontSize: 11, fontWeight: 950 }}>{tipoMeta.label}</div>
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
                <div style={{ color: tipoMeta.color, fontFamily: C.mono, fontSize: 13.5, fontWeight: 950 }}>{qtyPrefix}{fmtQty(qtyOut)} {row.unidad || ""}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Origen</div>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rowOrigenMovimientoLabel(row, obraById)}</div>
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
            Todavia no hay movimientos para estos filtros.
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
    variantes: Array.isArray(group.variantes) ? group.variantes : [],
    variante: "",
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
  const retiradoError = movementKind === "transferir" ? "" : retiradoPorNombreCompletoError(retiradoPor);

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
      toast.warning("Elegí la obra a la que asignar el stock.");
      return;
    }
    if (movementKind !== "transferir" && retiradoError) {
      toast.warning(retiradoError);
      return;
    }
    // Egreso sin obra: si hay ítems que salen sin obra, exigir observación + confirmar.
    if (movementKind !== "transferir" && !destinoObraId && cart.some((it) => !it.obraId)) {
      if (!nota.trim()) {
        toast.warning("Hay ítems sin obra. Escribí en la observación a dónde va el material (mantenimiento, obra del río, etc.).");
        return;
      }
      const ok = window.confirm(`¿Estás seguro? Hay ítems que salen SIN obra, con la observación:\n"${nota.trim()}"\n\n¿Confirmás el egreso?`);
      if (!ok) return;
    }
    setSaving(true);
    try {
      const egresoNota = [
        sectorDestino.trim() ? `Destino: ${sectorDestino.trim()}` : "",
        nota.trim(),
      ].filter(Boolean).join(" · ");
      for (const item of cart) {
        if (movementKind === "transferir") {
          // La RPC de transferencia no guarda variante: la dejamos explícita en la nota.
          await transferirProducto({
            material: item.material,
            descripcion: item.label,
            codigo: item.codigo,
            unidad: item.unidad,
            cantidad: item.cantidad,
            sede: item.sede,
            obraOrigenId: item.obraId,
            obraDestinoId: destinoObraId,
            nota: [egresoNota, item.variante ? `Variante: ${item.variante}` : ""].filter(Boolean).join(" · "),
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
          variante: item.variante || null,
        });
      }
      toast.success(`${cart.length} producto${cart.length === 1 ? "" : "s"} ${movementKind === "transferir" ? "asignado" : "egresado"}${cart.length === 1 ? "" : "s"}.`);
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
                {item.variantes?.length > 0 && (
                  <select
                    value={item.variante || ""}
                    onChange={(event) => updateCartItem(item.key, { variante: event.target.value })}
                    style={{ background: C.panelSolid, border: `1px solid ${item.variante ? "rgba(139,92,246,0.45)" : C.border}`, color: item.variante ? C.violet : C.text, borderRadius: 8, padding: "4px 7px", fontSize: 11, fontFamily: C.sans, outline: "none", marginTop: 4, width: "100%", cursor: "pointer", fontWeight: item.variante ? 850 : 500 }}
                  >
                    <option value="">Variante: sin especificar</option>
                    {item.variantes.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
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
          <button type="button" onClick={() => setMovementKind("transferir")} style={{ border: `1px solid ${movementKind === "transferir" ? C.blueB : C.border}`, background: movementKind === "transferir" ? C.blueL : C.panel, color: movementKind === "transferir" ? C.blue : C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: C.sans }}>Asignar a obra</button>
        </div>
      </div>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>{movementKind === "transferir" ? "Asignar a la obra" : "Reasignar a obra"}</span>
        <select value={destinoObraId} onChange={(event) => setDestinoObraId(event.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }}>
          <option value="">{movementKind === "transferir" ? "Elegir obra" : "Sin reasignar"}</option>
          {obrasActivas.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
        </select>
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <input value={retiradoPor} onChange={(event) => setRetiradoPor(event.target.value)} placeholder="Nombre y apellido de quien retira" style={{ background: C.bg, border: `1px solid ${retiradoError && retiradoPor.trim() ? C.redB : C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }} />
        {retiradoError && <span style={{ color: C.amber, fontSize: 10.5, lineHeight: 1.3 }}>Obligatorio para egresos: nombre y apellido, no solo DNI ni un apellido.</span>}
      </label>
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
          {saving ? "Registrando..." : `Confirmar ${movementKind === "transferir" ? "asignación" : "egreso"} (${cart.length})`}
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
  const [varianteEgreso, setVarianteEgreso] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const available = selectedLocation?.available || 0;
    setCantidad(action === "ingresar" ? "1" : String(available > 0 ? Number(available.toFixed(2)) : 1));
    setSede(sedeLocked || selectedLocation?.sede || "Pampa");
  }, [action, selectedLocation, sedeLocked]);

  useEffect(() => {
    setCodigoLibre(group?.codigo || "");
    setUnidadLibre(group?.unidad || "unidad");
    setVarianteEgreso("");
  }, [group?.key, group?.codigo, group?.unidad]);

  const isCatalogOnly = !!group?.catalogOnly;
  const cantidadNum = qty(cantidad, 0);
  const movementSede = action === "egresar" && isCatalogOnly ? (sedeLocked || sede) : (selectedLocation?.sede || sede);
  const projected = (selectedLocation?.available || 0) - cantidadNum;
  const willGoNegative = action === "egresar" && cantidadNum > (selectedLocation?.available || 0);
  const transitOnly = action === "egresar" && !isCatalogOnly && (selectedLocation?.available || 0) <= 0 && (selectedLocation?.transitQty || 0) > 0;
  const obrasActivas = obras.filter((obra) => !["terminada", "cancelada", "archivada"].includes(obra.estado));
  const originIsObra = !!selectedLocation?.obraId; // el stock origen ya está asignado a una obra
  const asignarLabel = originIsObra ? "Reasignar" : "Asignar a obra";
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
  const retiradoError = action === "egresar" ? retiradoPorNombreCompletoError(retiradoPor) : "";

  async function submit() {
    if (!canReceive) return;
    if (!group) {
      toast.warning("Elegí un producto.");
      return;
    }
    if (action === "asignar" && !destinoObraId) {
      toast.warning("Elegí la obra a la que asignar el stock.");
      return;
    }
    if (action === "egresar" && retiradoError) {
      toast.warning(retiradoError);
      return;
    }
    // Egreso sin obra: hay que aclarar a dónde va (mantenimiento, obra del río, etc.) y confirmar.
    if (action === "egresar" && !destinoObraId && !selectedLocation?.obraId) {
      if (!nota.trim()) {
        toast.warning("No seleccionaste obra. Escribí en la observación a dónde va el material (mantenimiento, obra del río, etc.).");
        return;
      }
      const ok = window.confirm(`¿Estás seguro? No seleccionaste obra de egreso.\n\nEl material sale SIN obra, con la observación:\n"${nota.trim()}"\n\n¿Confirmás el egreso?`);
      if (!ok) return;
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
          variante: varianteEgreso || null,
        });
        toast.success(willGoNegative ? "Egreso registrado. Queda a reconciliar con stock negativo." : "Egreso registrado.");
      } else if (action === "asignar") {
        const baseMov = {
          material: group.material,
          descripcion: group.label,
          codigo: group.codigo,
          unidad: group.unidad,
          cantidad,
          sede: movementSede,
          obraOrigenId: selectedLocation?.obraId || null,
          retiradoPor,
          nota: egresoNota,
          esAdicional: group.esAdicional,
          variante: varianteEgreso || null,
        };
        if (destinoObraId === "__stock__") {
          await liberarProductoAStock(baseMov);
          toast.success("Stock devuelto a stock general.");
        } else {
          await transferirProducto({ ...baseMov, obraDestinoId: destinoObraId });
          toast.success(originIsObra ? "Stock reasignado a la otra obra." : "Stock asignado a la obra (sigue en el pañol hasta el egreso).");
        }
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
    <div style={{ border: `1px solid ${action === "egresar" ? C.greenB : C.border}`, background: C.panelSolid, borderRadius: 12, padding: 13, display: "grid", gap: 11 }}>
      <div>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>{action === "egresar" ? "Egresar material" : action === "ingresar" ? "Ingresar ajuste" : "Asignar stock"}</div>
        <div style={{ color: C.dim, fontSize: 11.5, marginTop: 2 }}>{action === "egresar" ? "Cantidad, destino y receptor en un solo paso." : "Movimiento registrado en kardex."}</div>
      </div>
      {isCatalogOnly && (
        <div style={{ color: C.amber, fontSize: 11, lineHeight: 1.35 }}>Sin registro digital: el egreso queda negativo a reconciliar.</div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setAction("egresar")} disabled={mode === "egreso"} style={{ border: `1px solid ${action === "egresar" ? C.greenB : C.border}`, background: action === "egresar" ? C.greenL : C.panel, color: action === "egresar" ? C.green : C.text, borderRadius: 9, padding: "7px 12px", fontSize: 12, fontWeight: 900, cursor: mode === "egreso" ? "default" : "pointer", fontFamily: C.sans }}>Egreso</button>
        {mode !== "egreso" && !isCatalogOnly && (
          <button type="button" onClick={() => setAction("asignar")} style={{ border: `1px solid ${action === "asignar" ? C.blueB : C.border}`, background: action === "asignar" ? C.blueL : C.panel, color: action === "asignar" ? C.blue : C.text, borderRadius: 9, padding: "7px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: C.sans }}>{asignarLabel}</button>
        )}
        {mode !== "egreso" && (
          <button type="button" onClick={() => setAction("ingresar")} style={{ border: `1px solid ${action === "ingresar" ? C.blueB : C.border}`, background: action === "ingresar" ? C.blueL : C.panel, color: action === "ingresar" ? C.blue : C.text, borderRadius: 9, padding: "7px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: C.sans }}>Ingreso</button>
        )}
      </div>

      {(action === "egresar" || action === "asignar") && !isCatalogOnly && (
        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>{action === "asignar" ? "Depósito / stock a asignar" : "Deposito / obra origen"}</span>
          <select value={selectedLocation?.key || ""} onChange={(event) => setSelectedLocationKey(event.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }}>
            {group.locations.map((loc) => <option key={loc.key} value={loc.key}>{loc.label} · {fmtQty(loc.available)}</option>)}
          </select>
        </label>
      )}

      {/* Selector de variante al egresar/asignar cuando el producto tiene variantes */}
      {(action === "egresar" || action === "asignar") && group.variantes?.length > 0 && (
        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>Variante {action === "egresar" ? "a egresar" : "a asignar"}</span>
          <select value={varianteEgreso} onChange={(event) => setVarianteEgreso(event.target.value)} style={{ background: C.bg, border: `1px solid ${varianteEgreso ? C.violet : C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }}>
            <option value="">— Sin especificar —</option>
            {group.variantes.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      )}

      {action === "asignar" && (
        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>{originIsObra ? "Mover a" : "Asignar a la obra"}</span>
          <select value={destinoObraId} onChange={(event) => setDestinoObraId(event.target.value)} style={{ background: C.bg, border: `1px solid ${destinoObraId ? C.blueB : C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }}>
            <option value="">Elegir destino</option>
            {originIsObra && <option value="__stock__">Pasar a stock (liberar)</option>}
            {obrasActivas.filter((obra) => obra.id !== selectedLocation?.obraId).map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
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
        <span style={{ color: C.text, fontSize: 10.5, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.9 }}>Cantidad</span>
        <input type="number" min="0.01" step="any" value={cantidad} onChange={(event) => setCantidad(event.target.value)} style={{ background: C.bg, border: `1px solid ${willGoNegative ? C.redB : C.border}`, color: C.text, borderRadius: 9, padding: "10px 11px", fontSize: 16, fontWeight: 900, fontFamily: C.mono, outline: "none" }} />
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
            <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>Obra a la que va</span>
            <select value={destinoObraId} onChange={(event) => setDestinoObraId(event.target.value)} style={{ background: C.bg, border: `1px solid ${!destinoObraId && !selectedLocation?.obraId ? C.amberB : C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }}>
              <option value="">Sin obra (mantenimiento, río, etc.)</option>
              {obrasActivas.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
            </select>
            {!destinoObraId && !selectedLocation?.obraId && (
              <span style={{ color: C.amber, fontSize: 10.5 }}>Sin obra: es obligatorio detallar abajo a dónde va.</span>
            )}
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <input value={retiradoPor} onChange={(event) => setRetiradoPor(event.target.value)} placeholder="Nombre y apellido de quien retira" style={{ background: C.bg, border: `1px solid ${retiradoError && retiradoPor.trim() ? C.redB : C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 }} />
              {retiradoError && <span style={{ color: C.amber, fontSize: 10.5, lineHeight: 1.3 }}>Obligatorio: nombre y apellido.</span>}
            </label>
            <input value={sectorDestino} onChange={(event) => setSectorDestino(event.target.value)} placeholder="Sector / uso" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 }} />
          </div>
        </>
      )}

      <input value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Observación (opcional)" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }} />

      {(() => {
        const disabled = saving || !canReceive || cantidadNum <= 0 || transitOnly || (action === "asignar" && !destinoObraId);
        return (
          <button type="button" onClick={submit} disabled={disabled} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1px solid ${action === "egresar" ? C.greenB : C.blueB}`, background: action === "egresar" ? C.greenL : C.blueL, color: action === "egresar" ? C.green : C.blue, borderRadius: 10, padding: "12px 13px", fontSize: 14, fontWeight: 950, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1, fontFamily: C.sans }}>
            {action === "egresar" ? <ArrowUpRight size={15} /> : <PackagePlus size={15} />}
            {saving ? "Registrando..." : action === "egresar" ? "Confirmar egreso" : action === "ingresar" ? "Confirmar ingreso" : destinoObraId === "__stock__" ? "Pasar a stock" : originIsObra ? "Confirmar reasignación" : "Confirmar asignación"}
          </button>
        );
      })()}
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
  const obraById = useMemo(() => new Map((obras || []).map((obra) => [obra.id, obra])), [obras]);

  if (!group) {
    if (mode === "egreso") {
      return (
        <section style={{ minHeight: 0, minWidth: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
      <section style={{ minHeight: 0, minWidth: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <Warehouse size={36} style={{ color: C.blue, marginBottom: 10 }} />
          <div style={{ color: C.text, fontSize: 17, fontWeight: 950 }}>Elegí un producto</div>
          <div style={{ color: C.dim, fontSize: 13, lineHeight: 1.45, marginTop: 6 }}>Buscá primero. El detalle muestra saldo por obra/sede, kardex y acciones en un solo lugar.</div>
        </div>
      </section>
    );
  }

  const selectedLocation = group.locations.find((loc) => loc.key === selectedLocationKey) || group.locations[0] || defaultLocation(sedeLocked || "Pampa");
  const sortedRows = group.rows
    .filter((row) => !rowIsAsignacionMirrorOut(row))
    .sort((a, b) => new Date(b.egreso_at || b.updated_at || b.created_at || 0) - new Date(a.egreso_at || a.updated_at || a.created_at || 0));
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

  const detBarcode = group.codigo_barra || materialBarcodeList(group.material)[0]?.codigo || group.codigos_barra?.[0]?.codigo || "";
  const detCode = group.codigo
    ? (detBarcode ? `${group.codigo} · CB ${detBarcode}` : group.codigo)
    : (detBarcode ? `CB ${detBarcode}` : "sin código");
  return (
    <section style={{ minHeight: 0, minWidth: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ color: C.text, fontSize: 17, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</div>
            <KindChip tipo={group.tipoPedido} />
            <AsignadoChip asignaciones={groupAsignaciones(group)} />
            <StateChip egresado={group.egresado} transit={group.inTransit} negative={group.negativo} catalogOnly={group.catalogOnly} />
            <UbicacionChip ubicacion={group.ubicacion} obs={group.ubicacion_obs} size="md" />
          </div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>{detCode} · disponible {fmtQty(group.total)} {group.unidad}</div>
          {group.variantes?.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
              <span style={{ fontSize: 9, color: C.dim, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6 }}>Variantes</span>
              {group.variantes.map((v) => {
                const enStock = group.variantesEnStock?.has?.(v);
                return <span key={v} style={{ fontSize: 10.5, fontWeight: 850, color: C.violet, background: enStock ? "rgba(139,92,246,0.16)" : "transparent", border: `1px solid ${enStock ? "rgba(139,92,246,0.42)" : C.border}`, borderRadius: 999, padding: "2px 8px" }}>{v}{enStock ? " ✓" : ""}</span>;
              })}
            </div>
          )}
        </div>
        <button type="button" onClick={() => setSelectedKey(null)} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.text, borderRadius: 8, padding: "7px 9px", fontSize: 12, fontWeight: 850, cursor: "pointer", flexShrink: 0 }}>{isMobile ? "Lista" : "Cerrar"}</button>
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
              obraById={obraById}
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

// ─── Carrito flotante (stock maestro / por obra) ─────────────────────────────
// Junta ítems de distintos orígenes (stock libre / asignado a una obra) y los
// egresa o asigna en lote. Es EXPLÍCITO: agrupa por origen, muestra qué va a
// pasar con cada ítem, y pide confirmación si se toca algo asignado a otra obra.
function CartDrawer({ cart, setCart, obras, canReceive, onDone, toast, isMobile, onClose, savedCarts = [], setSavedCarts }) {
  const [movementKind, setMovementKind] = useState("consumir");
  const [destinoObraId, setDestinoObraId] = useState("");
  const [retiradoPor, setRetiradoPor] = useState("");
  const [sectorDestino, setSectorDestino] = useState("");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);

  const obrasActivas = obras.filter((obra) => !["terminada", "cancelada", "archivada"].includes(obra.estado));
  const obraCodigo = (id) => obras.find((o) => o.id === id)?.codigo || "obra";
  const totalUnidades = cart.reduce((sum, item) => sum + qty(item.cantidad, 0), 0);
  const retiradoError = movementKind === "consumir" ? retiradoPorNombreCompletoError(retiradoPor) : "";

  // Grupos por origen: stock libre primero, después cada obra asignada.
  const grupos = useMemo(() => {
    const map = new Map();
    for (const item of cart) {
      const key = item.obraId ? `obra:${item.obraId}` : `stock:${item.sede || "general"}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          obraId: item.obraId || null,
          label: item.obraId
            ? `Asignado a ${obras.find((o) => o.id === item.obraId)?.codigo || "obra"}`
            : `Stock libre${item.sede ? ` · ${item.sede}` : ""}`,
          color: item.obraId ? C.blue : C.green,
          items: [],
        });
      }
      map.get(key).items.push(item);
    }
    return [...map.values()].sort((a, b) => (a.obraId ? 1 : 0) - (b.obraId ? 1 : 0));
  }, [cart, obras]);

  function updateCartItem(key, patch) {
    setCart((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }
  function removeCartItem(key) {
    setCart((prev) => prev.filter((item) => item.key !== key));
  }

  // Ítems asignados a UNA obra que se van a imputar/mover a OTRA → confirmación explícita.
  const cruzados = destinoObraId
    ? cart.filter((it) => it.obraId && it.obraId !== destinoObraId)
    : [];

  const preview = cart.map((item) => {
    const origen = item.obraId ? obraCodigo(item.obraId) : `Stock${item.sede ? ` ${item.sede}` : ""}`;
    const varTxt = item.variante ? ` (${item.variante})` : "";
    const cantTxt = `${fmtQty(qty(item.cantidad, 0))} ${item.unidad || "u"}${varTxt}`;
    const cruzado = !!(item.obraId && destinoObraId && item.obraId !== destinoObraId);
    if (movementKind === "transferir") {
      return { key: item.key, label: item.label, det: `${cantTxt} · ${origen} → reservado a ${destinoObraId ? obraCodigo(destinoObraId) : "…"}`, warn: cruzado };
    }
    const dest = destinoObraId ? obraCodigo(destinoObraId) : (item.obraId ? obraCodigo(item.obraId) : "SIN obra (detallar abajo)");
    return { key: item.key, label: item.label, det: `${cantTxt} · sale de ${origen} → ${dest}`, warn: cruzado || (!destinoObraId && !item.obraId) };
  });

  async function submitBatch() {
    if (!canReceive || !cart.length || saving) return;
    if (movementKind === "transferir" && !destinoObraId) {
      toast.warning("Elegí la obra a la que asignar el stock.");
      return;
    }
    if (movementKind === "consumir" && retiradoError) {
      toast.warning(retiradoError);
      return;
    }
    if (movementKind === "consumir" && !destinoObraId && cart.some((it) => !it.obraId)) {
      if (!nota.trim()) {
        toast.warning("Hay ítems de stock libre sin obra. Escribí en la observación a dónde van (mantenimiento, obra del río, etc.).");
        return;
      }
      const ok = window.confirm(`¿Estás seguro? Hay ítems que salen SIN obra, con la observación:\n"${nota.trim()}"\n\n¿Confirmás el egreso?`);
      if (!ok) return;
    }
    if (cruzados.length) {
      const listado = cruzados.slice(0, 6).map((it) => `• ${it.label} (asignado a ${obraCodigo(it.obraId)})`).join("\n");
      const extra = cruzados.length > 6 ? `\n… y ${cruzados.length - 6} más` : "";
      const ok = window.confirm(
        movementKind === "transferir"
          ? `⚠ ${cruzados.length} ítem(s) ya están asignados a OTRA obra y se van a MOVER a ${obraCodigo(destinoObraId)}:\n\n${listado}${extra}\n\n¿Confirmás la reasignación?`
          : `⚠ ${cruzados.length} ítem(s) están asignados a OTRA obra y van a salir imputados a ${obraCodigo(destinoObraId)}:\n\n${listado}${extra}\n\n¿Confirmás?`,
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      const egresoNota = [
        sectorDestino.trim() ? `Destino: ${sectorDestino.trim()}` : "",
        nota.trim(),
      ].filter(Boolean).join(" · ");
      for (const item of cart) {
        if (movementKind === "transferir") {
          // La RPC de transferencia no guarda variante: la dejamos explícita en la nota.
          await transferirProducto({
            material: item.material,
            descripcion: item.label,
            codigo: item.codigo,
            unidad: item.unidad,
            cantidad: item.cantidad,
            sede: item.sede,
            obraOrigenId: item.obraId,
            obraDestinoId: destinoObraId,
            nota: [egresoNota, item.variante ? `Variante: ${item.variante}` : ""].filter(Boolean).join(" · "),
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
          variante: item.variante || null,
        });
      }
      toast.success(`${cart.length} producto${cart.length === 1 ? "" : "s"} ${movementKind === "transferir" ? "asignado" : "egresado"}${cart.length === 1 ? "" : "s"}.`);
      setCart([]);
      setDestinoObraId("");
      setRetiradoPor("");
      setSectorDestino("");
      setNota("");
      await onDone?.();
    } catch (error) {
      toast.error(error.message || "No se pudo registrar el movimiento.");
    } finally {
      setSaving(false);
    }
  }

  const inp = { background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 };
  const disabled = saving || !canReceive || !cart.length || (movementKind === "transferir" && !destinoObraId);

  // ── Carritos guardados con nombre ──
  function guardarCarrito() {
    if (!cart.length || !setSavedCarts) return;
    const ahora = new Date();
    const sugerido = `Carrito ${ahora.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
    const nombre = window.prompt("Nombre para guardar este carrito:", sugerido);
    if (nombre == null) return;
    const limpio = nombre.trim() || sugerido;
    setSavedCarts((prev) => [{ id: Date.now().toString(36), nombre: limpio, items: cart.map((it) => ({ ...it })), savedAt: ahora.toISOString() }, ...prev].slice(0, 20));
    toast?.success?.(`Carrito "${limpio}" guardado.`);
    if (window.confirm("Guardado ✓. ¿Vaciar el carrito actual para empezar otro?")) setCart([]);
  }
  function cargarGuardado(saved) {
    if (cart.length && !window.confirm(`¿Reemplazar el carrito actual (${cart.length} ítems) por "${saved.nombre}" (${saved.items.length} ítems)?`)) return;
    setCart(saved.items.map((it) => ({ ...it })));
    toast?.success?.(`Carrito "${saved.nombre}" cargado.`);
  }
  function borrarGuardado(saved) {
    if (!window.confirm(`¿Borrar el carrito guardado "${saved.nombre}"?`)) return;
    setSavedCarts((prev) => prev.filter((s) => s.id !== saved.id));
  }

  return (
    <div style={{ position: "fixed", right: isMobile ? 8 : 16, bottom: isMobile ? 74 : 84, width: isMobile ? "calc(100vw - 16px)" : 470, maxHeight: "78vh", zIndex: 80, display: "flex", flexDirection: "column", borderRadius: 18, overflow: "hidden", border: `1px solid ${C.border}`, background: "var(--panel)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", boxShadow: "0 30px 70px -18px rgba(0,0,0,0.55)" }}>
      {/* Header gradiente */}
      <div style={{ padding: "13px 16px", background: "linear-gradient(135deg, #10b981, #047857)", display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.22)", color: "#fff", flexShrink: 0 }}>
          <ShoppingCart size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontSize: 15.5, fontWeight: 950, lineHeight: 1.1 }}>Carrito de pañol</div>
          <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 11, marginTop: 2 }}>{cart.length} producto{cart.length === 1 ? "" : "s"} · {fmtQty(totalUnidades)} unidades</div>
        </div>
        {cart.length > 0 && setSavedCarts && (
          <button type="button" onClick={guardarCarrito} title="Guardar este carrito con nombre para retomarlo después" style={{ border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: 9, height: 28, padding: "0 10px", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, fontWeight: 900, fontFamily: C.sans }}>
            <Save size={13} /> Guardar
          </button>
        )}
        <button type="button" onClick={onClose} title="Cerrar" style={{ border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 9, width: 28, height: 28, display: "grid", placeItems: "center", cursor: "pointer" }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 13, display: "grid", gap: 13, alignContent: "start" }}>
        {/* Carritos guardados: cargar / borrar */}
        {savedCarts.length > 0 && (
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 950, color: C.dim, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Carritos guardados</div>
            <div style={{ display: "grid", gap: 5 }}>
              {savedCarts.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.panelSolid }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 850, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.nombre}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>{s.items.length} ítem{s.items.length === 1 ? "" : "s"} · {new Date(s.savedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</div>
                  </div>
                  <button type="button" onClick={() => cargarGuardado(s)} style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 900, fontFamily: C.sans, flexShrink: 0 }}>
                    Cargar
                  </button>
                  <button type="button" onClick={() => borrarGuardado(s)} title="Borrar guardado" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.dim, borderRadius: 8, width: 26, height: 26, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!cart.length && (
          <div style={{ padding: "16px 8px", textAlign: "center", color: C.dim, fontSize: 12, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
            El carrito está vacío. Agregá ítems desde la lista{savedCarts.length ? " o cargá uno guardado" : ""}.
          </div>
        )}

        {/* Ítems agrupados por origen */}
        {grupos.map((g) => (
          <div key={g.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: g.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, fontWeight: 950, color: g.color, textTransform: "uppercase", letterSpacing: 0.7 }}>{g.label}</span>
              <span style={{ fontSize: 10.5, color: C.dim }}>· {g.items.length} ítem{g.items.length === 1 ? "" : "s"}</span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {g.items.map((item) => {
                const excede = !item.catalogOnly && qty(item.cantidad, 0) > item.available;
                return (
                  <div key={item.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 84px 28px", gap: 8, alignItems: "center", padding: "8px 10px", border: `1px solid ${excede ? C.amberB : C.border}`, borderRadius: 10, background: C.panelSolid }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.text, fontSize: 12.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                      <div style={{ color: excede ? C.amber : C.dim, fontSize: 10.5, marginTop: 1 }}>
                        {item.catalogOnly ? "sin registro digital" : `disponible ${fmtQty(item.available)} ${item.unidad || ""}`}{excede ? " · queda negativo" : ""}
                      </div>
                      {item.variantes?.length > 0 && (
                        <select
                          value={item.variante || ""}
                          onChange={(event) => updateCartItem(item.key, { variante: event.target.value })}
                          style={{ ...inp, width: "100%", padding: "5px 7px", fontSize: 11, marginTop: 5, cursor: "pointer", color: item.variante ? C.violet : C.text, borderColor: item.variante ? "rgba(139,92,246,0.45)" : C.border, fontWeight: item.variante ? 850 : 500 }}
                        >
                          <option value="">Variante: sin especificar</option>
                          {item.variantes.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      )}
                    </div>
                    <input type="number" min="0.01" step="any" value={item.cantidad} onChange={(event) => updateCartItem(item.key, { cantidad: event.target.value })} style={{ ...inp, fontFamily: C.mono, padding: "7px 8px", borderColor: excede ? C.amberB : C.border }} />
                    <button type="button" onClick={() => removeCartItem(item.key)} title="Quitar" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.dim, borderRadius: 8, width: 28, height: 28, display: "grid", placeItems: "center", cursor: "pointer" }}>
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Acción: segmentado grande */}
        {cart.length > 0 && (<>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button type="button" onClick={() => setMovementKind("consumir")} style={{ border: `2px solid ${movementKind === "consumir" ? C.green : C.border}`, background: movementKind === "consumir" ? C.greenL : C.panelSolid, borderRadius: 12, padding: "10px 12px", cursor: "pointer", textAlign: "left", fontFamily: C.sans }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: movementKind === "consumir" ? C.green : C.text, fontSize: 13, fontWeight: 950 }}><ArrowUpRight size={15} /> Egresar</div>
            <div style={{ fontSize: 10.5, color: C.dim, marginTop: 3 }}>Sale del pañol (consumo)</div>
          </button>
          <button type="button" onClick={() => setMovementKind("transferir")} style={{ border: `2px solid ${movementKind === "transferir" ? C.blue : C.border}`, background: movementKind === "transferir" ? C.blueL : C.panelSolid, borderRadius: 12, padding: "10px 12px", cursor: "pointer", textAlign: "left", fontFamily: C.sans }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: movementKind === "transferir" ? C.blue : C.text, fontSize: 13, fontWeight: 950 }}><RefreshCw size={15} /> Asignar</div>
            <div style={{ fontSize: 10.5, color: C.dim, marginTop: 3 }}>Queda en pañol, reservado a la obra</div>
          </button>
        </div>

        {/* Destino */}
        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>{movementKind === "transferir" ? "Asignar a la obra" : "Obra a la que va"}</span>
          <select value={destinoObraId} onChange={(event) => setDestinoObraId(event.target.value)} style={{ ...inp, cursor: "pointer", borderColor: movementKind === "transferir" && !destinoObraId ? C.amberB : C.border }}>
            <option value="">{movementKind === "transferir" ? "Elegir obra…" : "Cada ítem sale a su obra asignada (stock libre: detallar)"}</option>
            {obrasActivas.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
          </select>
        </label>

        {/* Qué va a pasar */}
        <div style={{ border: `1px dashed ${cruzados.length ? C.amberB : C.blueB}`, background: cruzados.length ? C.amberL : C.blueL, borderRadius: 11, padding: "9px 11px" }}>
          <div style={{ fontSize: 10, fontWeight: 950, color: cruzados.length ? C.amber : C.blue, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Qué va a pasar</div>
          <div style={{ display: "grid", gap: 4 }}>
            {preview.slice(0, 6).map((p) => (
              <div key={p.key} style={{ fontSize: 11, lineHeight: 1.35, color: p.warn ? C.amber : C.text }}>
                <span style={{ fontWeight: 850 }}>{p.warn ? "⚠ " : ""}{p.label}</span>
                <span style={{ color: p.warn ? C.amber : C.dim }}> — {p.det}</span>
              </div>
            ))}
            {preview.length > 6 && <div style={{ fontSize: 10.5, color: C.dim }}>… y {preview.length - 6} más</div>}
          </div>
          {cruzados.length > 0 && (
            <div style={{ fontSize: 10.5, color: C.amber, fontWeight: 850, marginTop: 6 }}>
              ⚠ {cruzados.length} ítem{cruzados.length === 1 ? " está" : "s están"} asignado{cruzados.length === 1 ? "" : "s"} a otra obra: se pide confirmación al confirmar.
            </div>
          )}
        </div>

        {/* Datos del retiro */}
        <div style={{ display: "grid", gridTemplateColumns: movementKind === "consumir" ? "1fr 1fr" : "1fr", gap: 8 }}>
          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <input value={retiradoPor} onChange={(event) => setRetiradoPor(event.target.value)} placeholder="Nombre y apellido de quien retira" style={{ ...inp, borderColor: retiradoError && retiradoPor.trim() ? C.redB : C.border }} />
            {retiradoError && <span style={{ color: C.amber, fontSize: 10.5, lineHeight: 1.3 }}>Obligatorio: nombre y apellido.</span>}
          </label>
          {movementKind === "consumir" && <input value={sectorDestino} onChange={(event) => setSectorDestino(event.target.value)} placeholder="Sector / uso" style={inp} />}
        </div>
        <input value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Observación (obligatoria si algo sale sin obra)" style={inp} />
        </>)}
      </div>

      {/* Footer */}
      <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={() => setCart([])} disabled={saving} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 11, padding: "11px 14px", cursor: saving ? "default" : "pointer", fontSize: 12.5, fontWeight: 900, fontFamily: C.sans }}>
          Vaciar
        </button>
        <button type="button" onClick={submitBatch} disabled={disabled} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: "none", background: disabled ? C.panel2 : (movementKind === "transferir" ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "linear-gradient(135deg, #10b981, #047857)"), color: disabled ? C.dim : "#fff", borderRadius: 11, padding: "12px 14px", fontSize: 13.5, fontWeight: 950, cursor: disabled ? "default" : "pointer", fontFamily: C.sans, boxShadow: disabled ? "none" : "0 10px 24px -10px rgba(16,185,129,0.5)" }}>
          {movementKind === "transferir" ? <RefreshCw size={16} /> : <ArrowUpRight size={16} />}
          {saving ? "Registrando..." : movementKind === "transferir" ? `Asignar todo (${cart.length})` : `Confirmar egreso (${cart.length})`}
        </button>
      </div>
    </div>
  );
}

export default function StockWmsPanel({ sedeLocked = null, isMobile = false, toast, mode = "stock", canReceive = true, canCreateCatalog = false, canSeePrices = true, initialFObra = "todas", initialScope = "todos" }) {
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
  const [orderBy, setOrderBy] = useState("default");
  const [egresoView, setEgresoView] = useState(() => readStoredEgresoView());
  const [selectedKey, setSelectedKey] = useState(null);
  const [catalogMatches, setCatalogMatches] = useState([]);
  const [creating, setCreating] = useState(false);
  const [draftGroup, setDraftGroup] = useState(null);
  // Carrito PERSISTENTE (localStorage): si estás egresando y surge otra cosa,
  // el carrito queda guardado y te espera — sobrevive recargas y cambios de pantalla.
  // Se limpia solo al confirmar el movimiento o al tocar "Vaciar".
  const [cart, setCart] = useState(() => {
    try {
      const raw = window.localStorage.getItem("klasea:panol-carrito");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  useEffect(() => {
    try {
      if (cart.length) window.localStorage.setItem("klasea:panol-carrito", JSON.stringify(cart));
      else window.localStorage.removeItem("klasea:panol-carrito");
    } catch { /* almacenamiento lleno o bloqueado: seguimos sin persistir */ }
  }, [cart]);
  const [cartOpen, setCartOpen] = useState(false); // drawer flotante (modos stock/por obra)
  // Carritos GUARDADOS con nombre (además del actual): para pausar un egreso a
  // medio armar cuando surge otra cosa, y retomarlo después.
  const [savedCarts, setSavedCarts] = useState(() => {
    try {
      const raw = window.localStorage.getItem("klasea:panol-carritos-guardados");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  useEffect(() => {
    try {
      if (savedCarts.length) window.localStorage.setItem("klasea:panol-carritos-guardados", JSON.stringify(savedCarts));
      else window.localStorage.removeItem("klasea:panol-carritos-guardados");
    } catch { /* almacenamiento bloqueado: seguimos sin persistir */ }
  }, [savedCarts]);
  const cartGroupKeys = useMemo(() => new Set(cart.map((it) => it.groupKey)), [cart]);

  // Agregado rápido al carrito desde la tarjeta (modo egreso): toma el stock disponible
  // de la ubicación principal y lo suma al carrito, sin abrir el detalle.
  // useCallback: identidad estable para que las tarjetas memoizadas no se
  // re-rendericen todas en cada cambio de estado del panel.
  const quickAddToCart = useCallback((group) => {
    if (!canReceive) return;
    const loc = (group.locations || []).find((l) => l.available > 0.0001) || group.locations?.[0];
    if (!loc) return;
    const item = makeCartItem(group, loc, {
      cantidad: loc.available > 0 ? Number(loc.available.toFixed(2)) : 1,
      sede: sedeLocked || loc.sede,
      codigo: group.codigo,
      unidad: group.unidad,
    });
    setCart((prev) => {
      const exists = prev.find((r) => r.key === item.key);
      if (!exists) return [...prev, item];
      return prev.map((r) => r.key === item.key ? { ...r, ...item } : r);
    });
    toast?.success?.(`${group.label} → carrito`);
  }, [canReceive, sedeLocked, toast]);

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

  // Refresh SILENCIOSO: el spinner de "Cargando" solo aparece la primera vez.
  // Los refresh posteriores (tras un egreso/asignación) actualizan los datos por
  // detrás sin blanquear la pantalla — se siente instantáneo.
  const hasLoadedRef = useRef(false);
  const cargar = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const sede = sedeLocked || (fSede !== "todas" ? fSede : null);
      const [stockRows, obraRows] = await Promise.all([
        fetchMaterialesEgreso({ sede, estados: LEDGER_STATES }),
        fetchObrasEgreso().catch(() => []),
      ]);
      setRows(stockRows);
      setObras(obraRows);
      hasLoadedRef.current = true;
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
    if (scope === "sin_ubicacion") return sortProductGroups(withDraft.filter((group) => !group.ubicacion), orderBy);
    if (scope !== "negativos") return sortProductGroups(withDraft, orderBy);
    const negatives = withDraft.filter((group) => group.negativo);
    if (draftGroup && selectedKey === draftGroup.key && !negatives.some((group) => group.key === draftGroup.key)) {
      return [draftGroup, ...sortProductGroups(negatives, orderBy)];
    }
    return sortProductGroups(negatives, orderBy);
  }, [draftGroup, orderBy, productGroupsBase, q, scope, selectedKey]);

  const historyRows = useMemo(
    () => searchedRows
      .filter((row) => rowInHistory(row))
      .sort((a, b) => new Date(rowMovementAt(b) || 0) - new Date(rowMovementAt(a) || 0)),
    [searchedRows],
  );

  const selectedGroup = useMemo(
    () => productGroups.find((group) => group.key === selectedKey) || null,
    [productGroups, selectedKey],
  );
  const hasSelectedProduct = !!selectedGroup;

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
    const sinUbicacion = allGroups.filter((group) => !group.ubicacion).length;
    const transito = allGroups.reduce((sum, group) => sum + group.transitQty, 0);
    const valorUsd = allGroups.reduce((sum, group) => sum + Math.max(0, group.valueUsd || 0), 0);
    const today = rows.filter((row) => isToday(row.egreso_at || row.recepcion_updated_at || row.updated_at || row.created_at)).length;
    return {
      productos: allGroups.filter((group) => group.total > 0).length,
      unidades: fmtQty(totalUnits),
      negativos,
      sinUbicacion,
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
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", minWidth: 0 }}>
          <SelectFilter label="Vista" value={scope} onChange={setScope} options={[["todos", "Todos"], ["negativos", "A reconciliar"], ["sin_ubicacion", `Sin ubicación${kpis.sinUbicacion ? ` (${kpis.sinUbicacion})` : ""}`]]} />
          <SelectFilter label="Orden" value={orderBy} onChange={setOrderBy} options={[["default", "Stock primero"], ["recientes", "Mas recientes"]]} />
          <SelectFilter label="Tipo" value={kindScope} onChange={setKindScope} options={[["todos", `Todos (${kindCounts.todos})`], ["stock", `Stock pañol (${kindCounts.stock})`], ["estandar", `Asignado a obra (${kindCounts.estandar})`], ["adicional", `Adicionales (${kindCounts.adicional})`]]} />
          <SelectFilter label="Obra / stock" value={fObra} onChange={setFObra} options={obraOptions} />
          <SelectFilter label="Categoria" value={fCategoria} onChange={setFCategoria} options={categoriaOptions} />
          {!sedeLocked && <SelectFilter label="Sede" value={fSede} onChange={setFSede} options={[["todas", "Todas"], ...SEDES_PANOL.map((sede) => [sede, sede])]} />}
          <button type="button" onClick={cargar} disabled={loading} title="Actualizar" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 10, padding: "9px 10px", cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, display: "grid", placeItems: "center" }}>
            <RefreshCw size={15} />
          </button>
        </div>

      </div>

      {canShowHistory && egresoView === "historial" ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: isMobile ? 12 : "14px 18px 18px", display: "grid" }}>
          <EgresosHistoryView rows={historyRows} loading={loading} obras={obras} isMobile={isMobile} onOpenProduct={openProductFromHistory} />
        </div>
      ) : (
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: isMobile ? 12 : "12px 16px 16px", display: "grid", gridTemplateColumns: isMobile || !hasSelectedProduct ? "1fr" : "330px minmax(0, 1fr)", gap: 12 }}>
        {/* Lista compacta con detalle abierto: solo scroll vertical, nunca horizontal. */}
        <section style={{ minHeight: 0, minWidth: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>{mode === "egreso" ? "Elegir material para egresar" : "Stock maestro"}</div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{productGroups.length} productos visibles · click en un item para abrir egreso y kardex</div>
            </div>
          </div>
          <div style={{ padding: 8, display: "grid", gridTemplateColumns: !isMobile && !hasSelectedProduct ? "repeat(auto-fill, minmax(280px, 1fr))" : "1fr", gap: 7, overflowY: "auto", overflowX: "hidden" }}>
            {loading ? (
              <div style={{ padding: 30, textAlign: "center", color: C.dim, fontSize: 12, fontWeight: 850 }}>Cargando stock...</div>
            ) : productGroups.length ? (
              productGroups.map((group) => (
                <ProductCard key={group.key} group={group} active={selectedKey === group.key} onOpen={setSelectedKey} canSeePrices={canSeePrices} onAddToCart={canReceive ? quickAddToCart : undefined} inCart={cartGroupKeys.has(group.key)} dense={!isMobile && hasSelectedProduct} />
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

        {hasSelectedProduct && (
          <ProductDetail
            key={selectedGroup.key}
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
        )}
      </div>
      )}

      {/* ── Carrito flotante (stock maestro / por obra): juntar ítems y egresar/asignar en lote ── */}
      {mode !== "egreso" && (cart.length > 0 || savedCarts.length > 0) && (
        <>
          {cartOpen && (
            <CartDrawer
              cart={cart}
              setCart={setCart}
              obras={obras}
              canReceive={canReceive}
              onDone={async () => { setCartOpen(false); await cargar(); }}
              toast={toast}
              isMobile={isMobile}
              onClose={() => setCartOpen(false)}
              savedCarts={savedCarts}
              setSavedCarts={setSavedCarts}
            />
          )}
          {/* Corrido a la izquierda para no tapar la campanita de notificaciones (esquina inferior derecha) */}
          <button
            type="button"
            onClick={() => setCartOpen((v) => !v)}
            title="Carrito: egresar o asignar los ítems juntados"
            style={{
              position: "fixed", right: isMobile ? 70 : 88, bottom: isMobile ? 12 : 20, zIndex: 81,
              display: "inline-flex", alignItems: "center", gap: 8,
              border: "none", background: "linear-gradient(135deg, #10b981, #047857)", color: "#fff",
              borderRadius: 999, padding: "12px 18px", cursor: "pointer",
              fontSize: 13.5, fontWeight: 950, fontFamily: C.sans,
              boxShadow: "0 14px 34px -10px rgba(16,185,129,0.6)",
            }}
          >
            <ShoppingCart size={17} />
            Carrito
            <span title={cart.length ? `${cart.length} en el carrito` : `${savedCarts.length} guardado(s)`} style={{ fontFamily: C.mono, fontSize: 11.5, fontWeight: 950, background: "rgba(255,255,255,0.25)", borderRadius: 999, padding: "1px 8px" }}>
              {cart.length || `💾${savedCarts.length}`}
            </span>
          </button>
        </>
      )}
    </>
  );
}
