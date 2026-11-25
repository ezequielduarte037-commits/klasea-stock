import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  CreditCard,
  LayoutGrid,
  List,
  MapPin,
  MonitorUp,
  PackagePlus,
  RefreshCw,
  Save,
  ScanBarcode,
  ScanLine,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import { MaterialThumb } from "@/features/materiales/MaterialExtras";
import { C } from "@/theme";
import Cargando from "@/components/ui/Cargando";
import { CSS_STOCK } from "@/features/panol/stock/estilosStock";
import { CSS_MOSTRADOR } from "@/features/consumibles/mostrador/mostradorEstilos";
import { CSS_PANOL } from "@/features/panol/mostrador/estilosPanol";
import { FotoItem } from "@/features/consumibles/mostrador/Piezas";
import BarcodeScanner from "@/features/panol/BarcodeScanner";
import UbicacionPicker, { UbicacionChip } from "@/features/panol/UbicacionPicker";
import useNfcBridge from "@/features/panol/useNfcBridge";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { materialBarcodeList, materialBarcodeText } from "@/features/materiales/materialBarcodes";
import { materialMatchIsStrong, materialMatchScore, topMaterialMatches } from "@/features/panol/materialMatch";
import { buscarEmpleadoPorNfc, evaluarRetiro, normalizeNfcUid } from "@/features/rrhh/api";
import { fmtDate, rowCountsAsStock, rowDelta, rowHasRecordedEgreso, rowIsAnulado, rowIsInstalled, rowIsLocationChange, rowIsTransit, rowMovementAt } from "@/features/panol/panolMovimientos";
import { openEgresoDisplayWindow, publishEgresoDisplay, resetEgresoDisplay } from "@/features/panol/egresoDisplay";
import {
  crearEnvio,
  crearPanolCatalogMaterialParaEgreso,
  actualizarStockMinimoPanol,
  egresarProducto,
  egresarProductosCarrito,
  fetchMaterialesEgreso,
  fetchObrasEgreso,
  fetchPanolCatalogMini,
  fetchPanolCatalogFull,
  ingresarStockGeneral,
  liberarProductoAStock,
  marcarMovimientoAnulado,
  registrarCambioUbicacionMaterial,
  retiradoPorNombreCompletoError,
  DEVOLUCION_MOTIVOS,
  DEVOLUCION_NECESITA,
  DEVOLUCION_RESPONSABLE,
  registrarDevolucion,
  SEDES_PANOL,
  transferirProducto,
  fetchVerificacionesMaterial,
  PROBLEMA_LABEL,
  VERIFICACION_PROBLEMAS,
  verificarMaterial,
  vincularMovimientosAMaterial,
} from "@/features/panol/panolApi";
import { fetchCierresAbiertosPorObra } from "@/features/panol/obraCierreApi";
import { iniciarTrasladoSede, OTRA_SEDE_PANOL } from "@/features/panol/panolTrasladosSedeApi";
import {
  PANOL_CART_STORAGE_KEY,
  norm,
  groupMatchesCode,
  qty,
  fmtQty,
  rowSede,
  rowObraId,
  rowObraLabel,
  rowLocationKey,
  rowIsAdditional,
  rowTipoPedido,
  productKey,
  categoryLabel,
  defaultLocation,
  buildProductGroups,
  defaultEgresoQty,
  FALTA_CANTIDAD_EGRESO,
  faltaCantidad,
  renglonSinCantidad,
  cleanCartVariant,
  cartLineKey,
  cartBaseKey,
  availableForVariant,
  normalizeStoredCartItem,
  refreshCartRequirementMetadata,
  remainingCartVariants,
  additionalVariantCartItem,
  compactEgresoSourceRows,
  makeCartItem,
  egresoDisplayEmployee,
  egresoDisplayDestination,
  egresoDisplayItems,
  rowIsAsignacionStock,
  rowIsMovimientoEspejo,
  rowIsReasignacionSinObra,
  rowIsReasignacionRetirada,
  rowInHistory,
  rowEgresoKind,
  rowRecepcionOriginal,
  rowEgresoQuantity,
  necesitaReponer,
  nombreDeMovimiento,
  stockParaMinimo,
} from "@/features/panol/stockGrupos";

const LEDGER_STATES = ["en_panol", "recibido", "parcial", "egresado", "problema"];
const CATALOG_SEARCH_LIMIT = 12;
const PRODUCT_RENDER_BATCH = 80;
const EGRESO_VIEW_STORAGE_KEY = "klasea.panol.egresoView";
const STOCK_VIEW_STORAGE_KEY = "klasea.panol.stockView.v2";

function readStoredEgresoView() {
  if (typeof window === "undefined") return "egresar";
  const value = window.localStorage.getItem(EGRESO_VIEW_STORAGE_KEY);
  return value === "historial" ? "historial" : "egresar";
}

function readStoredStockView() {
  if (typeof window === "undefined") return "tarjetas";
  return window.localStorage.getItem(STOCK_VIEW_STORAGE_KEY) === "lista" ? "lista" : "tarjetas";
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function empleadoRetiroLabel(emp) {
  const nombre = String(emp?.nombre ?? "").trim();
  const dni = String(emp?.dni ?? "").trim();
  return [nombre, dni ? `(DNI ${dni})` : ""].filter(Boolean).join(" ");
}

function empleadoInitials(nombre) {
  const parts = String(nombre ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]).join("").toUpperCase() || "?";
}

function EmpleadoRetiroAvatar({ empleado, size = 44 }) {
  const foto = String(empleado?.foto_url ?? "").trim();
  return (
    <div style={{ width: size, height: size, borderRadius: 14, overflow: "hidden", border: `1px solid ${C.greenB}`, background: `linear-gradient(135deg, ${C.greenL}, ${C.blueL})`, color: C.green, display: "grid", placeItems: "center", flexShrink: 0, fontSize: 15, fontWeight: 700 }}>
      {foto ? <img src={foto} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : empleadoInitials(empleado?.nombre)}
    </div>
  );
}

function useRetiroNfc({ enabled, onEmpleado, toast }) {
  const [empleado, setEmpleado] = useState(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const resolver = useCallback(async (rawCode) => {
    const uid = normalizeNfcUid(rawCode);
    if (!uid) return;
    setCode(uid);
    setStatus("buscando");
    setError("");
    try {
      const emp = await buscarEmpleadoPorNfc(uid);
      if (!emp) {
        setEmpleado(null);
        setStatus("error");
        setError("Tarjeta sin empleado asignado.");
        toast?.warning?.("Tarjeta NFC sin empleado asignado en RRHH.");
        return;
      }
      if (emp.activo === false) {
        setEmpleado(null);
        setStatus("error");
        setError("Empleado inactivo.");
        toast?.warning?.("La tarjeta pertenece a un empleado inactivo.");
        return;
      }
      setEmpleado(emp);
      setStatus("ok");
      onEmpleado?.(empleadoRetiroLabel(emp));
      toast?.success?.(`Retira: ${emp.nombre}`);
    } catch (err) {
      setEmpleado(null);
      setStatus("error");
      setError(err.message || "No se pudo leer la tarjeta.");
      toast?.error?.(err.message || "No se pudo leer la tarjeta NFC.");
    }
  }, [onEmpleado, toast]);

  useKeyboardWedge({
    enabled,
    ignoreEditable: false,
    minLength: 4,
    timeoutMs: 65,
    onScan: resolver,
  });

  const bridge = useNfcBridge({
    enabled,
    onUid: resolver,
  });

  const clear = useCallback(() => {
    setEmpleado(null);
    setCode("");
    setStatus("idle");
    setError("");
  }, []);

  return { empleado, code, setCode, status, error, resolver, clear, bridge };
}

// Reglas de retiro: se consulta recién cuando ya se sabe quién retira, porque el
// veredicto depende de sus obras y su oficio. Si la migración todavía no está
// aplicada la API devuelve vacío y acá no se muestra nada.
function useReparosRetiro(empleadoId, materialIds) {
  // Se guarda junto con la consulta que lo produjo. Así no hace falta limpiar el
  // estado al cambiar de empleado o de carrito —cosa que el compilador de React
  // no deja hacer dentro del efecto— y nunca se muestra el veredicto de una
  // consulta que ya no corresponde.
  const [resultado, setResultado] = useState({ clave: "", filas: [] });
  const clave = empleadoId
    ? `${empleadoId}|${(materialIds || []).filter(Boolean).slice().sort().join(",")}`
    : "";

  useEffect(() => {
    if (!clave) return undefined;
    const ids = clave.split("|")[1];
    if (!ids) return undefined;
    let vigente = true;
    evaluarRetiro(empleadoId, ids.split(","))
      .then((filas) => {
        if (!vigente) return;
        setResultado({ clave, filas: filas.filter((f) => f.estado !== "ok" && f.estado !== "sin_datos") });
      })
      .catch(() => {
        if (vigente) setResultado({ clave, filas: [] });
      });
    return () => { vigente = false; };
  }, [clave, empleadoId]);

  return resultado.clave === clave ? resultado.filas : [];
}

function AvisoReparosRetiro({ empleado, reparos }) {
  if (!empleado || !reparos.length) return null;
  const motivos = [...new Set(reparos.map((r) => r.motivo).filter(Boolean))];
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${C.cyanB}`, background: C.cyanL, padding: "8px 10px", display: "grid", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.cyan, fontSize: 11.5, fontWeight: 700 }}>
        <AlertTriangle size={13} style={{ flexShrink: 0 }} />
        {empleado.nombre} retira {reparos.length} {reparos.length === 1 ? "material que no le corresponde" : "materiales que no le corresponden"}
      </div>
      {motivos.map((motivo) => (
        <div key={motivo} style={{ color: C.muted, fontSize: 11, lineHeight: 1.4 }}>· {motivo}</div>
      ))}
      <div style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.4 }}>
        Se puede confirmar igual. Queda registrado quién retiró y qué se llevó.
      </div>
    </div>
  );
}

function RetiroNfcBox({ nfc, onClear, compact = false, materialIds = [] }) {
  const reparos = useReparosRetiro(nfc.empleado?.id, materialIds);
  const border = nfc.empleado ? C.greenB : nfc.status === "error" ? C.redB : C.blueB;
  const bg = nfc.empleado ? C.greenL : nfc.status === "error" ? C.redL : C.blueL;
  const accent = nfc.empleado ? C.green : nfc.status === "error" ? C.red : C.blue;
  const bridge = nfc.bridge;
  const bridgeOk = bridge?.status === "connected";
  const bridgeLabel = bridgeOk
    ? "Lector NFC conectado"
    : bridge?.status === "connecting"
      ? "Conectando lector NFC"
      : "Lector NFC desconectado";
  const bridgeColor = bridgeOk ? C.green : bridge?.status === "connecting" ? C.blue : C.violet;
  return (
    <div style={{ border: `1px solid ${border}`, background: bg, borderRadius: 12, padding: compact ? 10 : 12, display: "grid", gap: compact ? 8 : 10 }}>
      <AvisoReparosRetiro empleado={nfc.empleado} reparos={reparos} />
      {nfc.empleado ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <EmpleadoRetiroAvatar empleado={nfc.empleado} size={compact ? 60 : 68} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.green, fontSize: 9.5, fontWeight: 750, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Persona validada</div>
            <div style={{ color: C.text, fontSize: compact ? 15 : 16, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nfc.empleado.nombre}</div>
            <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>DNI {nfc.empleado.dni || "-"}{nfc.empleado.sede ? ` · ${nfc.empleado.sede}` : ""}</div>
          </div>
          <button type="button" onClick={onClear} style={{ border: `1px solid ${C.greenB}`, background: C.panelSolid, color: C.green, borderRadius: 9, padding: "7px 9px", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: C.sans, flexShrink: 0 }}>
            Cambiar
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: C.panelSolid, border: `1px solid ${border}`, color: accent, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <CreditCard size={17} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.text, fontSize: 12.5, fontWeight: 750 }}>Identificar a quien retira</div>
            <div style={{ color: C.dim, fontSize: 10.5, marginTop: 1 }}>Apoyá la tarjeta en el lector.</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 22 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: bridgeColor, boxShadow: bridgeOk ? `0 0 0 3px ${C.greenL}` : "none", flexShrink: 0 }} />
        <span style={{ color: bridgeColor, fontSize: 10.5, fontWeight: 700 }}>{bridgeLabel}</span>
        {!bridgeOk && (
          <button type="button" onClick={bridge?.reconnect} style={{ marginLeft: "auto", border: "none", background: "transparent", color: bridgeColor, padding: "3px 0", cursor: "pointer", fontSize: 10.5, fontWeight: 700, fontFamily: C.sans }}>
            Reintentar
          </button>
        )}
      </div>

      {!nfc.empleado && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 7 }}>
          <input
            value={nfc.code}
            onChange={(event) => nfc.setCode(normalizeNfcUid(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                nfc.resolver(nfc.code);
              }
            }}
            placeholder="UID de tarjeta"
            style={{ background: C.panelSolid, border: `1px solid ${border}`, color: C.text, borderRadius: 9, padding: "8px 9px", fontSize: 12, fontFamily: C.mono, outline: "none", minWidth: 0 }}
          />
          <button type="button" onClick={() => nfc.resolver(nfc.code)} style={{ border: `1px solid ${border}`, background: C.panelSolid, color: accent, borderRadius: 9, padding: "8px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.sans }}>
            Validar
          </button>
          <button type="button" onClick={onClear} aria-label="Limpiar tarjeta" title="Limpiar" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.dim, borderRadius: 9, width: 34, minHeight: 34, display: "grid", placeItems: "center", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
      )}
      {nfc.status === "buscando" && <div style={{ color: C.blue, fontSize: 11 }}>Buscando empleado...</div>}
      {nfc.error && <div style={{ color: C.red, fontSize: 11 }}>{nfc.error}</div>}
    </div>
  );
}

function isToday(ts) {
  if (!ts) return false;
  return new Date(ts).toDateString() === new Date().toDateString();
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

function rowEgresoMeta(row) {
  const kind = rowEgresoKind(row);
  if (kind === "instalado") return { label: "Instalado", color: C.teal, tono: "teal" };
  if (kind === "asignacion") return { label: "Asignación", color: C.blue, tono: "azul" };
  if (kind === "reasignacion") return { label: "Reasignación", color: C.violet, tono: "violeta" };
  if (kind === "liberacion") return { label: "A stock", color: C.violet, tono: "violeta" };
  if (kind === "egreso_obra") return { label: "Asign. -> egreso", color: C.red, tono: "rojo" };
  if (kind === "reasignacion_egreso") return { label: "Reasig. -> egreso", color: C.violet, tono: "violeta" };
  return { label: "Egreso", color: C.red, tono: "rojo" };
}

function obraCodigoFromMap(id, obraById = null) {
  if (!id) return "";
  return obraById?.get?.(id)?.codigo || "";
}

function rowOrigenMovimientoLabel(row, obraById = null) {
  if (rowIsAsignacionStock(row)) {
    return row.obra_origen_id ? obraCodigoFromMap(row.obra_origen_id, obraById) || "obra" : (row.stock_sede ? `Stock ${row.stock_sede}` : "Stock");
  }
  if (rowIsReasignacionSinObra(row) || rowIsReasignacionRetirada(row)) return obraCodigoFromMap(row.obra_origen_id, obraById) || "obra";
  return rowObraLabel(row);
}

function rowDestinoMovimientoLabel(row, obraById = null) {
  if (rowEgresoKind(row) === "liberacion") return row.stock_sede ? `Stock general ${row.stock_sede}` : "Stock general";
  if (rowIsAsignacionStock(row)) {
    return obraCodigoFromMap(row.obra_id, obraById) || row.obra?.codigo || "obra";
  }
  if (rowIsReasignacionSinObra(row)) return row.sector_destino || "otro destino";
  if (rowIsReasignacionRetirada(row)) return obraCodigoFromMap(row.obra_id, obraById) || row.obra?.codigo || "obra";
  if (!row.egreso_destino_obra_id || row.egreso_destino_obra_id === rowObraId(row)) return "";
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
  return rowIsInstalled(row) ? "" : cleanHumanField(row.retirado_por || "");
}

function rowMovimientoUsuario(row) {
  if (rowIsInstalled(row)) return "";
  return cleanHumanField(row.egreso_por_nombre || row.egreso_actor?.username || row.created_by_nombre || row.created_by_actor?.username || row.egreso_por || row.created_by || "") || "sin registrar";
}

function rowSearchText(row) {
  const instalado = rowIsInstalled(row);
  return norm([
    row.descripcion,
    row.requisito_descripcion,
    row.opcion_asignada,
    row.codigo,
    row.codigo_barra,
    row.variante,
    materialBarcodeText(row),
    row.proveedor,
    row.rubro,
    row.categoria_nombre,
    rowObraLabel(row),
    rowSede(row),
    instalado ? "instalado" : row.estado,
    ...(instalado ? [] : [row.retirado_por, row.egreso_por_nombre, row.created_by_nombre]),
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

function providerLabel(row) {
  return row.proveedor || row.material?.proveedor || "";
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
    stockMinimo: material.stock_minimo ?? null,
    imagenUrl: material.imagen_url || null,
    notas: material.notas || null,
    verificacion: material.verificacion_estado || "pendiente",
    verificacionProblemas: material.verificacion_problemas || [],
    verificadoAt: material.verificado_at || null,
    verificacionNota: material.verificacion_nota || null,
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

function filterOptions(rows, getValue) {
  const values = new Set();
  for (const row of rows) {
    const value = String(getValue(row) || "").trim();
    if (value) values.add(value);
  }
  return [["todos", "Todos"], ...[...values].sort((a, b) => a.localeCompare(b, "es", { numeric: true })).map((value) => [value, value])];
}

function sortProductGroups(groups, orderBy) {
  if (orderBy === "estado") {
    const priority = { critico: 0, alerta: 1, sin_minimo: 2, ok: 3 };
    return [...groups].sort((a, b) => {
      const levelDiff = priority[stockLevel(a).key] - priority[stockLevel(b).key];
      if (levelDiff !== 0) return levelDiff;
      const deficitDiff = stockLevel(b).faltante - stockLevel(a).faltante;
      if (deficitDiff !== 0) return deficitDiff;
      return String(a.label || "").localeCompare(String(b.label || ""), "es", { numeric: true });
    });
  }
  // Orden de trabajo para la revisión: primero lo que nadie miró, y dentro de
  // eso lo que además le falta un dato, que es donde hay algo que hacer.
  if (orderBy === "sin_revisar") {
    const priority = { pendiente: 0, problema: 1, ok: 2 };
    const rank = (g) => priority[g.verificacion === "ok" || g.verificacion === "problema" ? g.verificacion : "pendiente"];
    return [...groups].sort((a, b) => {
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      const faltaA = (a.ubicacion ? 0 : 1) + (a.codigo ? 0 : 1);
      const faltaB = (b.ubicacion ? 0 : 1) + (b.codigo ? 0 : 1);
      if (faltaA !== faltaB) return faltaB - faltaA;
      return String(a.label || "").localeCompare(String(b.label || ""), "es", { numeric: true });
    });
  }
  if (orderBy === "alfabetico") {
    return [...groups].sort((a, b) => String(a.label || "").localeCompare(String(b.label || ""), "es", { numeric: true }));
  }
  if (orderBy !== "recientes") return groups;
  return [...groups].sort((a, b) => {
    const ta = new Date(a.updatedAt || 0).getTime();
    const tb = new Date(b.updatedAt || 0).getTime();
    if (tb !== ta) return tb - ta;
    return String(a.label || "").localeCompare(String(b.label || ""), "es", { numeric: true });
  });
}

// La etiqueta va DENTRO del control, no arriba: siete filtros con su rótulo
// encima suman una franja entera de encabezado que se paga en tarjetas visibles.
// Un filtro activo se marca en azul, así se ve cuál está aplicado sin leerlos.
function SelectFilter({ label, value, onChange, options }) {
  const activo = value !== undefined && value !== null
    && value !== (options?.[0]?.[0] ?? "todos");
  return (
    <label className={`stk-select${activo ? " is-activo" : ""}`}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  );
}

// Una sola forma de etiqueta para estado, obra, opción y marcas (clases de
// estilosStock.js). El tono sólo dice qué pide atención.
function Etiqueta({ tono = "", chica = false, title, icono: Icono, children }) {
  return (
    <span className={`stk-etiqueta${tono ? ` is-${tono}` : ""}${chica ? " is-chica" : ""}`} title={title}>
      {Icono && <Icono size={chica ? 10 : 11} aria-hidden="true" />}
      {children}
    </span>
  );
}

function MatrizEtiqueta({ chica = true }) {
  return <Etiqueta tono="violeta" chica={chica} title="Requisito de matriz: es genérico, no un producto concreto del estante.">Matriz</Etiqueta>;
}

function StateChip({ negative, imbalance = false, catalogOnly = false, transit = false, egresado = false, compact = false }) {
  if (compact && !egresado && !transit && !catalogOnly && !negative && !imbalance) return null;
  const tono = egresado || transit || catalogOnly ? "violeta" : negative ? "rojo" : imbalance ? "violeta" : "verde";
  const label = egresado ? "Egresado" : transit ? "Por recibir" : catalogOnly ? "Sin registro" : negative ? "A reconciliar" : imbalance ? "Ubicación a revisar" : "Disponible";
  return <Etiqueta tono={tono} chica={compact}>{label}</Etiqueta>;
}

function KindChip({ tipo = "estandar" }) {
  // Solo mostramos un chip de tipo cuando es "adicional" (lo pide el dueño de la obra).
  // El resto (estándar / stock general) es simplemente stock disponible en pañol —
  // el estado "Disponible" ya lo indica el StateChip, así que no metemos ruido.
  if (tipo !== "adicional") return null;
  return <Etiqueta tono="violeta">Adicional</Etiqueta>;
}

// Obras a las que hay stock asignado (ubicaciones con obra y saldo disponible).
function groupAsignaciones(group) {
  return (group?.locations || [])
    .filter((loc) => loc.obraId && loc.available > 0.0001)
    .map((loc) => ({ obraId: loc.obraId, label: loc.label, sede: loc.sede || "", available: loc.available, key: loc.key, obraEstado: loc.obraEstado || "" }));
}

// Chip que muestra a qué obra(s) está asignado el stock (reemplaza al confuso "Estándar").
function AsignadoChip({ asignaciones = [], compact = false }) {
  if (!asignaciones.length) return null;
  const terminada = asignaciones.some((asig) => asig.obraEstado === "terminada");
  if (compact && !terminada) return null;
  if (compact && terminada) return <Etiqueta tono="cian">Obra terminada</Etiqueta>;
  const label = asignaciones.length === 1
    ? `${terminada ? "Obra terminada" : "Asignado"} · ${asignaciones[0].label}`
    : `${terminada ? "Incluye obra terminada" : "Asignado"} · ${asignaciones.length} obras`;
  return <Etiqueta tono={terminada ? "cian" : "azul"} title={label}>{label}</Etiqueta>;
}

const TONO_NIVEL = { critico: "rojo", alerta: "violeta", ok: "verde", sin_minimo: "apagado" };

function stockLevel(group) {
  const raw = group?.stockMinimo;
  const configured = raw !== null && raw !== undefined && raw !== "";
  const minimum = configured ? Math.max(0, qty(raw, 0)) : null;
  // El mínimo es del stock libre: lo reservado para una obra no se puede dar a otra.
  const current = stockParaMinimo(group);
  if (group?.negativo || qty(group?.total, 0) < 0) {
    return { key: "critico", label: "Crítico", color: C.red, bg: C.redL, border: C.redB, minimum, configured, faltante: minimum == null ? Math.abs(current) : Math.max(0, minimum - current) };
  }
  if (!configured) {
    return { key: "sin_minimo", label: "Sin mínimo", color: C.dim, bg: C.panel2, border: C.border, minimum: null, configured: false, faltante: 0 };
  }
  if (minimum > 0 && current <= minimum * 0.5) {
    return { key: "critico", label: "Crítico", color: C.red, bg: C.redL, border: C.redB, minimum, configured: true, faltante: Math.max(0, minimum - current) };
  }
  if (minimum > 0 && current <= minimum) {
    return { key: "alerta", label: "Bajo", color: C.violet, bg: C.violetL, border: C.violetB, minimum, configured: true, faltante: Math.max(0, minimum - current) };
  }
  return { key: "ok", label: "OK", color: C.green, bg: C.greenL, border: C.greenB, minimum, configured: true, faltante: 0 };
}

function groupOperationalBuckets(group) {
  const buckets = new Set();
  const current = qty(group?.total, 0);
  const hasExistence = current > 0.0001;
  const needsReplenishment = necesitaReponer(group);
  const needsConcreteProduct = group?.esRequisito === true && (group.rows || []).some((row) => (
    rowCountsAsStock(row)
    && !row.opcion_material_id
    && (!row.requisito_material_id || row.material_id === row.requisito_material_id)
  ));

  if (hasExistence) buckets.add("existencia");
  if (needsReplenishment) buckets.add("reponer");
  if (group?.inTransit) buckets.add("en_camino");
  if (!group?.ubicacion && (hasExistence || needsReplenishment || group?.inTransit)) buckets.add("sin_ubicacion");
  if (group?.negativo || needsConcreteProduct) buckets.add("reconciliar");
  // Stock que sigue a nombre de una obra ya terminada: se libera o se devuelve.
  if ((group?.reservas || []).some((reserva) => reserva.obraEstado === "terminada")) buckets.add("sobrante");
  return { buckets, needsConcreteProduct, needsReplenishment };
}

function StockLevelChip({ group, compact = false, hideUnset = false }) {
  const level = stockLevel(group);
  if (hideUnset && level.key === "sin_minimo") return null;
  return <Etiqueta tono={TONO_NIVEL[level.key]} chica={compact}>{level.label}</Etiqueta>;
}

function MinimumEditor({ group, canEdit, onSave, draftEntry, onDraftChange }) {
  const initial = group.stockMinimo == null ? "" : String(group.stockMinimo);
  const draft = draftEntry?.text ?? initial;
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const normalizedDraft = draft.trim() === "" ? null : qty(draft, NaN);
  const normalizedCurrent = group.stockMinimo == null ? null : qty(group.stockMinimo, 0);
  const dirty = normalizedDraft !== normalizedCurrent;
  const valid = normalizedDraft === null || (Number.isFinite(normalizedDraft) && normalizedDraft >= 0);

  async function save() {
    if (!canEdit || !dirty || !valid || saving) return;
    setSaving(true);
    try {
      await onSave(group, normalizedDraft);
    } catch {
      // El panel padre ya muestra el error y conserva el valor anterior.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stk-minimo-editor" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <input
        className={`stk-minimo-input${!valid ? " is-error" : dirty || focused ? " is-editando" : ""}`}
        type="number"
        min="0"
        step="0.01"
        value={draft}
        disabled={!canEdit || saving}
        onChange={(event) => onDraftChange(group, event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          }
        }}
        aria-label={`Stock mínimo de ${group.label}`}
        title="Dejalo vacío para quitar el mínimo"
      />
      {canEdit && dirty && (
        <button type="button" className="stk-minimo-guardar" disabled={!valid || saving} onClick={save}>
          {saving ? "…" : "Guardar"}
        </button>
      )}
    </div>
  );
}

function OptionStockSummary({ group, compact = false, max = 3 }) {
  const opciones = Array.isArray(group?.opciones) ? group.opciones : [];
  if (!opciones.length) return null;
  const visibles = opciones.slice(0, max);
  return (
    <div className="stk-opciones">
      {visibles.map((opcion) => (
        <Etiqueta key={opcion.nombre} tono="violeta" chica={compact} title={`${opcion.nombre}: ${fmtQty(opcion.available)} ${group.unidad || "u"}`}>
          {opcion.nombre} · <b>{fmtQty(opcion.available)}</b>
        </Etiqueta>
      ))}
      {opciones.length > visibles.length && <span className="stk-faltan">+{opciones.length - visibles.length}</span>}
    </div>
  );
}

// Acción de la fila: Agregar al carrito, Recibir o Pedir reposición. Va como
// span con rol de botón porque la tarjeta entera ya es un botón.
function ProductPrimaryAction({ action, compact = false }) {
  if (!action?.onClick) return null;
  const Icon = action.Icon || ArrowUpRight;
  const isCompact = compact || action.compact;
  return (
    <span
      role="button"
      tabIndex={0}
      className={`stk-accion is-${action.tono || "azul"}${isCompact ? " is-icono" : ""}${isCompact && action.badge ? " con-cuenta is-puesto" : ""}`}
      title={action.title || action.label}
      aria-label={action.title || action.label}
      onClick={(event) => { event.stopPropagation(); action.onClick(); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          action.onClick();
        }
      }}
    >
      <Icon size={15} aria-hidden="true" />
      {!isCompact && action.label}
      {isCompact && action.badge && <b>{action.badge}</b>}
    </span>
  );
}

// memo: al agregar al carrito (o seleccionar) solo se re-renderizan las tarjetas
// afectadas, no las 300+ de la lista — el click se siente inmediato.
function ArchiveMatrixAction({ group, onArchive, compact = false }) {
  if (!group.esRequisito || !onArchive || group.verificacion === "ok") return null;
  return (
    <span
      role="button"
      tabIndex={0}
      className="stk-accion is-chica"
      onClick={(event) => {
        event.stopPropagation();
        onArchive(group);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onArchive(group);
        }
      }}
      title="Archivar este requisito de matriz. No borra el producto ni su historial."
    >
      <Archive size={11} aria-hidden="true" />
      {!compact && "Archivar"}
    </span>
  );
}

const ProductCard = memo(function ProductCard({ group, active, onOpen, canSeePrices = true, onAddToCart, onArchivarMatriz, primaryAction, inCart = false, dense = false, obraView = false }) {
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
  const level = stockLevel(group);
  // Fuera de la vista de obra la cifra grande es lo libre; lo reservado va aparte.
  const libre = qty(group.stockLibre ?? group.total, 0);
  const reservado = obraView ? 0 : qty(group.stockReservado, 0);
  const shownQty = obraView ? group.total : libre;
  const tonoCant = obraView
    ? (group.egresado ? "violeta" : group.negativo ? "rojo" : group.total > 0 ? "" : "cero")
    : (group.egresado ? "violeta" : group.negativo || level.key === "critico" ? "rojo" : level.key === "alerta" ? "violeta" : libre > 0 ? "" : "cero");
  // La rayita del costado sólo aparece cuando algo pide atención.
  const marca = group.negativo ? "rojo" : obraView ? "" : level.key === "critico" ? "rojo" : level.key === "alerta" ? "violeta" : "";
  const sinUbicacion = !group.ubicacion;
  const barcode = group.codigo_barra || materialBarcodeList(group.material)[0]?.codigo || group.codigos_barra?.[0]?.codigo || "";
  const codeLabel = group.codigo
    ? (barcode ? `${group.codigo} · CB ${barcode}` : group.codigo)
    : (barcode ? `CB ${barcode}` : "sin código");
  const cartAction = !primaryAction && onAddToCart && group.total > 0.0001
    ? { tono: "verde", Icon: ShoppingCart, compact: true, badge: "", label: "Agregar", title: inCart ? "Agregar una unidad más al carrito" : "Agregar una unidad al carrito", onClick: () => onAddToCart(group) }
    : null;
  const accion = primaryAction || cartAction;
  const clase = `stk-tarjeta${dense ? " is-densa" : ""}${active ? " is-activa" : ""}${marca ? ` is-${marca}` : ""}`;
  const cifra = (
    <span className={`stk-cant${tonoCant ? ` is-${tonoCant}` : ""}`} title={reservado > 0.0001 ? `Libre ${fmtQty(libre)} · reservado ${fmtQty(reservado)}` : undefined}>
      <strong>{fmtQty(shownQty)}</strong>
      <small>{obraView || dense ? group.unidad || "u" : `${group.unidad || "u"} libre`}</small>
      {reservado > 0.0001 && <span className="stk-res" title={reservasLabel(group)}>+{fmtQty(reservado)} res.</span>}
    </span>
  );

  // ── Variante DENSA (lista angosta con la ficha abierta) ──
  if (dense) {
    const asigs = groupAsignaciones(group);
    const estadoMini = group.egresado ? ["Egresado", "violeta"] : group.negativo ? ["Negativo", "rojo"] : group.locationImbalance ? ["Revisar ubicación", "violeta"] : group.inTransit ? ["Por recibir", "violeta"] : null;
    return (
      <button type="button" className={clase} onClick={() => onOpen(group.key)}>
        <div className="stk-tarjeta-cab is-densa">
          <span className="stk-nombre">{group.label}</span>
          {cifra}
        </div>
        <div className="stk-tarjeta-pie">
          {estadoMini && <Etiqueta tono={estadoMini[1]} chica>{estadoMini[0]}</Etiqueta>}
          {!obraView && <StockLevelChip group={group} compact hideUnset />}
          {asigs.length > 0 && <Etiqueta tono="azul" chica>{asigs.length === 1 ? asigs[0].label : `${asigs.length} obras`}</Etiqueta>}
          {group.tipoPedido === "adicional" && <Etiqueta tono="violeta" chica>Adicional</Etiqueta>}
          {group.esRequisito && <MatrizEtiqueta />}
          <span className="stk-tarjeta-texto">
            {group.ubicacion ? `${group.ubicacion} · ` : ""}{codeLabel !== "sin código" ? `${group.codigo || barcode} · ` : ""}{stockDetail}
          </span>
          <ArchiveMatrixAction group={group} onArchive={onArchivarMatriz} compact />
          {accion && <ProductPrimaryAction action={accion} compact />}
        </div>
        <OptionStockSummary group={group} compact max={1} />
      </button>
    );
  }

  return (
    <button type="button" className={clase} onClick={() => onOpen(group.key)}>
      {/* Foto + nombre (hasta 2 renglones) + lo libre. La miniatura va acá y no
          en una fila propia: cada fila extra se multiplica por toda la lista. */}
      <div className="stk-tarjeta-cab">
        <MaterialThumb material={{ imagen_url: group.imagenUrl, descripcion: group.label }} size={44} />
        <span className="stk-nombre">{group.label}</span>
        {cifra}
      </div>
      <div className="stk-tarjeta-etiquetas">
        <KindChip tipo={group.tipoPedido} />
        {group.esRequisito && <MatrizEtiqueta chica={false} />}
        {!obraView && <StockLevelChip group={group} hideUnset />}
        <AsignadoChip asignaciones={groupAsignaciones(group)} compact />
        <StateChip egresado={group.egresado} transit={group.inTransit} catalogOnly={group.catalogOnly} negative={group.negativo} imbalance={group.locationImbalance} compact />
        {sinUbicacion
          ? <Etiqueta tono="cian" icono={MapPin}>Sin ubicación</Etiqueta>
          : <UbicacionChip ubicacion={group.ubicacion} obs={group.ubicacion_obs} size="md" />}
        <ArchiveMatrixAction group={group} onArchive={onArchivarMatriz} />
      </div>
      {/* La opción asignada es dato operativo: siempre visible sin abrir. */}
      <OptionStockSummary group={group} max={2} />
      <div className="stk-tarjeta-pie">
        <span className="stk-tarjeta-texto">
          {codeLabel}{group.proveedor ? ` · ${group.proveedor}` : ""}{group.categorias.size ? ` · ${[...group.categorias][0]}` : ""}
          {canSeePrices && group.valueUsd > 0 ? ` · USD ${fmtQty(group.valueUsd)}` : ""}
        </span>
        {accion && <ProductPrimaryAction action={accion} />}
      </div>
      {active && (
        <div className="stk-tarjeta-pie">
          <span className="stk-tarjeta-texto">Depósito / obra · {stockDetail}{group.locations.length > 4 ? ` · +${group.locations.length - 4}` : ""}</span>
        </div>
      )}
    </button>
  );
});

// Grilla compartida por el encabezado y las filas. Una sola constante para que
// no se desalineen cuando se toca una y se olvida la otra.
const STOCK_ROW_COLS = "44px minmax(240px,2.4fr) 96px minmax(140px,1fr) 118px minmax(130px,.9fr) 116px 124px";
const STOCK_ROW_MIN = 1120;
const STOCK_ROW_COMPACT_COLS = "44px minmax(180px,2fr) 84px 76px minmax(110px,1fr) 52px";
const STOCK_ROW_COMPACT_MIN = 640;
const OBRA_ROW_COLS = "44px minmax(240px,2.4fr) 110px minmax(130px,1fr) 124px 124px";
const OBRA_ROW_MIN = 860;
const OBRA_ROW_COMPACT_COLS = "44px minmax(180px,2fr) 84px minmax(110px,1fr) 112px 52px";
const OBRA_ROW_COMPACT_MIN = 670;

const VERIF_META = {
  ok: { label: "Revisado", Icon: CheckCircle2, color: C.green, bg: C.greenL, border: C.greenB, tono: "verde" },
  problema: { label: "Problema", Icon: AlertTriangle, color: C.red, bg: C.redL, border: C.redB, tono: "rojo" },
  pendiente: { label: "Sin revisar", Icon: CircleDashed, color: C.dim, bg: "transparent", border: C.border, tono: "apagado" },
};

function VerificacionChip({ estado, compact = false }) {
  const meta = VERIF_META[estado] || VERIF_META.pendiente;
  return <Etiqueta tono={meta.tono} chica={compact} icono={meta.Icon} title={meta.label}>{meta.label}</Etiqueta>;
}

// En la tabla mostramos una sola señal operativa. El resto de los datos de
// control sigue disponible en la ficha, sin competir con la lectura del stock.
function ProductTableStatus({ group, obraView = false }) {
  const level = stockLevel(group);
  let meta;
  if (group.negativo || group.locationImbalance) {
    meta = { label: "A reconciliar", tono: "rojo" };
  } else if (group.egresado) {
    meta = { label: "Egresado", tono: "violeta" };
  } else if (group.verificacion === "problema") {
    meta = { label: "A revisar", tono: "rojo" };
  } else if (group.inTransit) {
    meta = { label: "En camino", tono: "azul" };
  } else if (obraView) {
    meta = qty(group.total, 0) > 0 ? { label: "Con saldo", tono: "verde" } : { label: "Sin saldo", tono: "apagado" };
  } else if (level.key === "critico") {
    meta = { label: "Crítico", tono: "rojo" };
  } else if (level.key === "alerta") {
    meta = { label: "Stock bajo", tono: "violeta" };
  } else if (!obraView && (group.reservas || []).length && group.reservas.every((reserva) => reserva.obraEstado === "terminada") && qty(group.stockLibre ?? group.total, 0) <= 0.0001) {
    meta = { label: "Sobrante", tono: "cian" };
  } else if (qty(group.stockLibre ?? group.total, 0) <= 0.0001 && qty(group.stockReservado, 0) > 0.0001) {
    // Está en el pañol pero todo tiene obra: no se le puede dar a otro barco.
    meta = { label: "Reservado", tono: "teal" };
  } else if (qty(group.total, 0) > 0) {
    meta = { label: "Disponible", tono: "verde" };
  } else {
    meta = { label: "Sin stock", tono: "apagado" };
  }
  return (
    <Etiqueta tono={meta.tono} title={group.verificacion === "pendiente" ? `${meta.label} · control pendiente` : meta.label}>
      {meta.label}
    </Etiqueta>
  );
}

function productListVariantIdentity(group) {
  const rawNames = (group.opciones || []).map((option) => option?.nombre);
  if (!rawNames.length && group.variantesEnStock instanceof Set) rawNames.push(...group.variantesEnStock);
  const names = [...new Set(rawNames
    .map((name) => String(name || "").trim())
    .filter((name) => name && norm(name) !== "standard" && norm(name) !== norm(group.label)))];
  if (names.length === 1 && !norm(group.label).includes(norm(names[0]))) {
    return { displayLabel: `${group.label} · ${names[0]}`, variantsMeta: "" };
  }
  if (names.length > 1) {
    return {
      displayLabel: group.label,
      variantsMeta: `${names.slice(0, 2).join(" · ")}${names.length > 2 ? ` · +${names.length - 2} modelos` : ""}`,
    };
  }
  return { displayLabel: group.label, variantsMeta: "" };
}

function reservasLabel(group) {
  return (group.reservas || [])
    .map((r) => `${r.label}: ${fmtQty(r.available)}${r.obraEstado === "terminada" ? " (obra terminada)" : ""}`)
    .join(" · ");
}

// Lo que está en pañol pero ya tiene dueño. Una obra terminada va en cian: es
// un sobrante que se puede liberar.
function ReservasCell({ group }) {
  const reservas = group.reservas || [];
  if (!reservas.length) return <span className="stk-vacio-celda">—</span>;
  const visibles = reservas.slice(0, 2);
  const resto = reservas.length - visibles.length;
  return (
    <div className="stk-reservas" title={reservasLabel(group)}>
      {visibles.map((r) => (
        <Etiqueta key={r.obraId} tono={r.obraEstado === "terminada" ? "cian" : "azul"}>
          {r.label} · <b>{fmtQty(r.available)}</b>
        </Etiqueta>
      ))}
      {resto > 0 && <span className="stk-faltan">+{resto}</span>}
    </div>
  );
}

const ProductStockRow = memo(function ProductStockRow({ group, active, onOpen, canEditMinimum, onSaveMinimum, minimumDraft, onMinimumDraftChange, onArchivarMatriz, primaryAction, compact = false, obraView = false }) {
  const level = stockLevel(group);
  const location = group.ubicacion || group.locations?.find((item) => item.available > 0)?.label || "";
  const categoria = [...(group.categorias || [])].filter(Boolean)[0] || "";
  const { displayLabel, variantsMeta } = productListVariantIdentity(group);
  // Lo que la revisión viene a completar. Se calcula acá y no en el detalle
  // porque el valor está en verlo sin abrir: así se elige a cuál entrar.
  const sinUbicacion = !group.ubicacion;
  const libre = qty(group.stockLibre ?? group.total, 0);
  const reservado = qty(group.stockReservado, 0);
  const reservasTitle = reservasLabel(group);
  const tonoLibre = libre < -0.0001 || level.key === "critico" ? "rojo" : libre > 0.0001 ? "" : "cero";
  const tonoFalta = TONO_NIVEL[level.key] === "rojo" || TONO_NIVEL[level.key] === "violeta" ? TONO_NIVEL[level.key] : "";

  return (
    <div
      className={`stk-fila${active ? " is-activa" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(group.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(group.key);
        }
      }}
      style={{
        minWidth: obraView ? (compact ? OBRA_ROW_COMPACT_MIN : OBRA_ROW_MIN) : (compact ? STOCK_ROW_COMPACT_MIN : STOCK_ROW_MIN),
        gridTemplateColumns: obraView ? (compact ? OBRA_ROW_COMPACT_COLS : OBRA_ROW_COLS) : (compact ? STOCK_ROW_COMPACT_COLS : STOCK_ROW_COLS),
      }}
    >
      {/* La foto es el primer filtro visual: reconocer la pieza sin leer.
          MaterialThumb ya trae el lightbox y frena la propagación del click. */}
      <MaterialThumb material={{ imagen_url: group.imagenUrl, descripcion: group.label }} size={44} />

      <div style={{ minWidth: 0 }}>
        {/* Si el producto se renombró, el nombre viejo queda a mano: es el
            que figura en los movimientos y en los papeles impresos de antes,
            y sin esto nadie entiende por qué no coinciden. */}
        <span
          className={`stk-nombre${group.labelHistorico ? " is-renombrado" : ""}`}
          title={group.labelHistorico ? `${displayLabel} · antes se llamaba: ${group.labelHistorico}` : displayLabel}
        >
          {displayLabel}
        </span>
        {/* Sin avisos de "falta código": nadie los va a completar y llenaban
            la tabla de rojo (03/11/2026). */}
        <div className="stk-sub">
          {variantsMeta && <span className="stk-variantes" title={`Modelos con stock: ${variantsMeta}`}>{variantsMeta}</span>}
          {group.codigo && <span className="stk-codigo" title={group.codigo}>{group.codigo}</span>}
          {group.proveedor && <span title={group.proveedor}>{group.proveedor}</span>}
          {categoria && <span title={categoria}>{categoria}</span>}
          {compact && group.esRequisito && <MatrizEtiqueta />}
          {compact && onArchivarMatriz && group.esRequisito && group.verificacion !== "ok" && <ArchiveMatrixAction group={group} onArchive={onArchivarMatriz} compact />}
        </div>
      </div>

      {obraView ? (
        <div className="stk-cant">
          <strong>{fmtQty(group.total)}</strong><small>{group.unidad || "u"}</small>
        </div>
      ) : (
        <div className={`stk-cant${tonoLibre ? ` is-${tonoLibre}` : ""}`} title="Libre: en el depósito, sin obra asignada">
          <strong>{fmtQty(libre)}</strong><small>{group.unidad || "u"}</small>
          {compact && reservado > 0.0001 && <span className="stk-res" title={reservasTitle}>+{fmtQty(reservado)} res.</span>}
        </div>
      )}

      {!obraView && !compact && <ReservasCell group={group} />}

      {obraView ? null : compact ? (
        <div className={`stk-faltan${level.faltante > 0 ? ` is-${tonoFalta}` : ""}`} title={level.configured ? `Mínimo ${fmtQty(level.minimum)} ${group.unidad || "u"}` : "Sin mínimo configurado"} style={{ paddingLeft: 0, fontSize: 14 }}>
          {level.faltante > 0 ? `−${fmtQty(level.faltante)}` : "—"}
        </div>
      ) : (
        <div className="stk-minimo">
          <MinimumEditor group={group} canEdit={canEditMinimum} onSave={onSaveMinimum} draftEntry={minimumDraft} onDraftChange={onMinimumDraftChange} />
          {level.faltante > 0 && (
            <span className={`stk-faltan${tonoFalta ? ` is-${tonoFalta}` : ""}`} title={`Faltan ${fmtQty(level.faltante)} ${group.unidad || "u"} para el mínimo`}>
              faltan {fmtQty(level.faltante)}
            </span>
          )}
        </div>
      )}

      <div className="stk-ubic">
        {sinUbicacion ? (
          <Etiqueta tono="cian" icono={MapPin}>Sin ubicación</Etiqueta>
        ) : (
          <>
            <div className="stk-ubic-lugar"><MapPin size={13} aria-hidden="true" />{location}</div>
            {group.ubicacion_obs && <div className="stk-ubic-obs">{group.ubicacion_obs}</div>}
          </>
        )}
      </div>

      {(!compact || obraView) && (
        <div className="stk-estado">
          <ProductTableStatus group={group} obraView={obraView} />
          {group.esRequisito && <MatrizEtiqueta />}
          {group.esRequisito && onArchivarMatriz && group.verificacion !== "ok" && <ArchiveMatrixAction group={group} onArchive={onArchivarMatriz} compact />}
        </div>
      )}

      <ProductPrimaryAction action={primaryAction} compact={compact} />
    </div>
  );
});

// Fila del stock maestro con el mismo dibujo que el mostrador de egresos: foto,
// nombre, ubicación en código y los saldos a la derecha.
const FilaMaestro = memo(function FilaMaestro({ group, active, onOpen, primaryAction }) {
  const level = stockLevel(group);
  const { displayLabel, variantsMeta } = productListVariantIdentity(group);
  const categoria = [...(group.categorias || [])].filter(Boolean)[0] || "";
  const libre = qty(group.stockLibre ?? group.total, 0);
  const reservado = qty(group.stockReservado, 0);
  const reservas = group.reservas || [];
  const soloTerminadas = reservas.length > 0 && reservas.every((reserva) => reserva.obraEstado === "terminada");
  const tonoLibre = libre < -0.0001 || level.key === "critico" ? "rojo" : level.key === "alerta" ? "violeta" : libre > 0.0001 ? "verde" : "cero";
  const tonoMin = level.key === "critico" ? "rojo" : level.key === "alerta" ? "violeta" : "";
  return (
    <div
      className={`mst-res stk-mres${active ? " is-activa" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(group.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(group.key);
        }
      }}
    >
      <span className="mst-res-foto"><FotoItem zoom item={{ descripcion: group.label, imagenUrl: group.imagenUrl }} /></span>
      <span className="mst-res-texto">
        <span className="mst-res-nombre" title={group.labelHistorico ? `${displayLabel} · antes se llamaba: ${group.labelHistorico}` : displayLabel}>{displayLabel}</span>
        <span className="mst-res-sub stk-mres-sub">
          {group.ubicacion
            ? <span className="mpn-ubic" title={group.ubicacion_obs || "Estantería"}>{group.ubicacion}</span>
            : <span className="stk-sin-ubic">Sin ubicación</span>}
          {group.codigo && <span className="mst-num">{group.codigo}</span>}
          {group.proveedor && <span>{group.proveedor}</span>}
          {categoria && <span>{categoria}</span>}
          {variantsMeta && <span className="is-violeta">{variantsMeta}</span>}
          {group.inTransit && <span className="is-violeta">en camino</span>}
          {group.esRequisito && <span className="is-violeta">matriz</span>}
          {group.negativo && <span className="is-rojo">a reconciliar</span>}
        </span>
      </span>
      {/* A qué obras está asignado, en el lugar que sobra de la fila: las que
          no entran pasan a un renglón que queda oculto (no se cortan a medias). */}
      {reservas.length > 0 && (
        <span className="stk-mres-asig" title={reservasLabel(group)}>
          {[...reservas].sort((x, y) => qty(y.available, 0) - qty(x.available, 0)).map((reserva) => (
            <span key={reserva.obraId || reserva.label} className={`stk-asig${reserva.obraEstado === "terminada" ? " is-terminada" : ""}`}>
              {reserva.label} <b>{fmtQty(reserva.available)}</b>
            </span>
          ))}
        </span>
      )}
      <span className="stk-mres-fin">
        <span className={`mpn-saldo stk-libre is-${tonoLibre}`} title="Libre: en el depósito, sin obra asignada">Libre <span className="mst-num">{fmtQty(libre)}</span></span>
        {/* Con una sola obra ya se lee en su pastilla; con varias, el total. */}
        {reservado > 0.0001 && reservas.length > 1 && (
          <span className={`mpn-saldo stk-obras${soloTerminadas ? " is-terminada" : ""}`} title={reservasLabel(group)}>
            {reservas.length} obras <span className="mst-num">{fmtQty(reservado)}</span>
          </span>
        )}
        <span className={`stk-mres-min${tonoMin ? ` is-${tonoMin}` : ""}`}>
          {level.configured ? (level.faltante > 0 ? `mín ${fmtQty(level.minimum)} · faltan ${fmtQty(level.faltante)}` : `mín ${fmtQty(level.minimum)}`) : ""}
        </span>
        <ProductPrimaryAction action={primaryAction} compact />
      </span>
    </div>
  );
});

function LocationButton({ location, active, onClick, cierre, enCarrito = 0 }) {
  const terminada = location.obraEstado === "terminada";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`stk-donde${active ? " is-activa" : ""}${location.available < 0 ? " is-negativo" : ""}${enCarrito ? " is-en-carrito" : ""}`}
    >
      <span className="stk-donde-texto">
        <span><strong className={location.obraId ? "mst-num" : undefined}>{location.label}</strong> <span>· {location.sede || "Sin sede"}{terminada ? " · obra terminada" : ""}</span></span>
        {terminada && (
          <small>
            {cierre?.id ? (
              <Link to={`/sobrantes-obra/${cierre.id}`} onClick={(event) => event.stopPropagation()}>Ir al cierre de materiales</Link>
            ) : "Reservado a obra terminada · no es stock libre"}
          </small>
        )}
        {location.porVariante?.length > 0 && (
          <small className="is-violeta">
            {location.porVariante.map((pv) => `${pv.variante}: ${fmtQty(pv.available)}${pv.transitQty > 0 ? ` (+${fmtQty(pv.transitQty)} por recibir)` : ""}`).join(" · ")}
          </small>
        )}
        {location.transitQty > 0 && <small className="is-violeta">por recibir {fmtQty(location.transitQty)}</small>}
      </span>
      <span className="stk-donde-cant">
        <strong className="mst-num">{fmtQty(location.available)}</strong>
        {enCarrito ? <small className="mst-num">×{fmtQty(enCarrito)}</small> : null}
      </span>
    </button>
  );
}

function KardexRow({ row, onRevert, busy, obraById, onDevolucion }) {
  const delta = rowDelta(row);
  const isLocation = rowIsLocationChange(row);
  const instalado = rowIsInstalled(row);
  const isOut = row.estado === "egresado" && !instalado;
  const isAssignment = rowIsAsignacionStock(row);
  const isLiberacion = rowEgresoKind(row) === "liberacion";
  const isTransit = rowIsTransit(row);
  const egresoMeta = rowEgresoMeta(row);
  const displayedDelta = isOut && rowHasRecordedEgreso(row) ? -rowEgresoQuantity(row) : delta;
  const label = isLocation ? "Ubicación" : isAssignment || instalado || isOut ? egresoMeta.label : isTransit ? "Tránsito" : row.estado === "problema" ? "Problema" : "Ingreso";
  const tonoEtiqueta = isLocation ? "azul" : isAssignment || instalado || isOut ? (egresoMeta.tono || "violeta") : isTransit ? "violeta" : row.estado === "problema" ? "rojo" : "verde";
  const tonoDelta = instalado ? "teal" : isLiberacion ? "violeta" : displayedDelta < 0 ? "rojo" : displayedDelta > 0 ? "verde" : "apagado";
  const { nombre: descripcion, historico: descripcionHistorica } = nombreDeMovimiento(row);
  const variante = String(row.variante || "").trim();
  const ruta = (isOut || isAssignment) ? rowMovimientoRuta(row, obraById) : `${rowObraLabel(row)} · ${rowSede(row) || "Sin sede"}`;
  const retira = rowMovimientoRetira(row);
  const recepcion = rowRecepcionOriginal(row);
  const usuario = rowMovimientoUsuario(row);
  const nota = String(row.egreso_nota || row.notas || "").replace(/\[anulado\]/gi, "").trim();
  // Guard B: deshabilitar Revertir si ya contiene "[anulado]" en notas
  const yaAnulado = rowIsAnulado(row);
  return (
    <article className="stk-mov">
      <div className="stk-mov-cab">
        <div className="stk-mov-titulo">
          <Etiqueta tono={yaAnulado ? "apagado" : tonoEtiqueta} chica>{yaAnulado ? "Anulado" : label}</Etiqueta>
          <span
            className={descripcionHistorica ? "stk-nombre is-renombrado" : undefined}
            title={descripcionHistorica ? `${descripcion} · en este movimiento figura como: ${descripcionHistorica}` : undefined}
            style={descripcionHistorica ? { fontSize: 13.5, display: "inline" } : undefined}
          >
            {descripcion}
          </span>
          {row.codigo && <span className="stk-codigo" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--dim)" }}>{row.codigo}</span>}
        </div>
        <span className={`stk-mov-delta is-${tonoDelta}`}>
          {instalado ? fmtQty(rowEgresoQuantity(row)) : isLiberacion ? `←${fmtQty(rowEgresoQuantity(row))}` : `${displayedDelta > 0 ? "+" : ""}${fmtQty(displayedDelta)}`} {row.unidad || ""}
        </span>
      </div>
      <div className="stk-mov-ruta">{ruta}</div>
      <div className="stk-mov-datos">
        <span>{fmtDate(rowMovementAt(row))}</span>
        {variante && <span>Variante: {variante}</span>}
        {retira && <span>Retira: {retira}</span>}
        {recepcion && <span>Ingreso original · +{fmtQty(recepcion.cantidad)} {row.unidad || "u"} · {fmtDate(recepcion.fecha)}</span>}
        {usuario && <span>Usuario: {usuario}</span>}
      </div>
      {nota && <div className="stk-mov-nota">{nota}</div>}
      {/* Revertir y devolver son cosas distintas y conviven:
            · Revertir  — el movimiento no debió existir. Se deshace.
            · Devolución — el movimiento estuvo bien, el material salió de
              verdad, pero volvió fallado. Es un evento nuevo, no un deshacer. */}
      {(delta !== 0 || (isOut && !isLiberacion && !yaAnulado && onDevolucion)) && (
        <div className="stk-mov-botones">
          {delta !== 0 && (
            <button
              type="button"
              className="ui-btn ui-btn-fantasma"
              onClick={() => onRevert?.(row)}
              disabled={busy || yaAnulado}
              title={yaAnulado ? "Este movimiento ya fue anulado" : "El movimiento fue un error: deshacerlo"}
            >
              {yaAnulado ? "Anulado" : "Revertir"}
            </button>
          )}
          {isOut && !isLiberacion && !yaAnulado && onDevolucion && (
            <button
              type="button"
              className="ui-btn ui-btn-peligro"
              onClick={() => onDevolucion(row)}
              disabled={busy}
              title="Salió bien pero el operario lo devolvió fallado"
            >
              Generar devolución
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function EgresosHistoryView({ rows, loading, obras, isMobile, onOpenProduct }) {
  const obraById = useMemo(() => new Map((obras || []).map((obra) => [obra.id, obra])), [obras]);
  const totals = useMemo(() => {
    const unidades = rows.reduce((sum, row) => sum + (rowIsInstalled(row) ? 0 : rowEgresoQuantity(row)), 0);
    const hoy = rows.filter((row) => isToday(rowMovementAt(row))).length;
    const materiales = new Set(rows.map((row) => row.material_id || norm([row.codigo, row.descripcion].filter(Boolean).join(" ")) || row.id));
    return { unidades, hoy, materiales: materiales.size };
  }, [rows]);

  function destinoLabel(row) {
    if (rowIsInstalled(row)) return rowObraLabel(row);
    const destinoObra = rowDestinoMovimientoLabel(row, obraById);
    if (destinoObra) return destinoObra;
    if (row.sector_destino) return row.sector_destino;
    return "Salida / consumo";
  }

  function detalleLabel(row) {
    const variante = String(row.variante || "").trim();
    const usuario = rowMovimientoUsuario(row);
    return [
      variante ? `Variante: ${variante}` : "",
      rowMovimientoRetira(row) ? `Retira: ${rowMovimientoRetira(row)}` : "",
      usuario ? `Usuario: ${usuario}` : "",
      row.egreso_nota || row.notas || "",
    ]
      .filter(Boolean)
      .join(" - ");
  }

  return (
    <section style={{ minHeight: 0, minWidth: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.text, fontSize: 15, fontWeight: 750 }}>Historial de movimientos</div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Egresos, asignaciones, reasignaciones e instalaciones.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ border: `1px solid ${C.border}`, background: C.bg, color: C.text, borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 700 }}>{rows.length} movimientos</span>
          <span style={{ border: `1px solid ${C.border}`, background: C.bg, color: C.text, borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 700 }}>{fmtQty(totals.unidades)} unidades</span>
          <span style={{ border: `1px solid ${C.border}`, background: C.bg, color: C.text, borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 700 }}>{totals.materiales} productos</span>
          <span style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 700 }}>{totals.hoy} hoy</span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "grid", gap: 8, alignContent: "start" }}>
        {loading ? (
          <div style={{ padding: 8 }}><Cargando texto="Cargando movimientos…" /></div>
        ) : rows.length ? rows.map((row) => {
          const detalle = detalleLabel(row);
          const qtyOut = rowEgresoQuantity(row);
          const tipoMeta = rowEgresoMeta(row);
          const isAssignment = rowIsAsignacionStock(row);
          const qtyPrefix = rowIsInstalled(row) ? "" : rowEgresoKind(row) === "liberacion" ? "←" : isAssignment ? "→" : "−";
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
                <div style={{ color: tipoMeta.color, fontSize: 11, fontWeight: 750 }}>{tipoMeta.label}</div>
                <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>{fmtDate(rowMovementAt(row))}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descripcion || "(sin descripcion)"}</div>
                <div style={{ color: C.dim, fontSize: 10.5, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.codigo || "sin codigo"}{row.proveedor ? ` - ${row.proveedor}` : ""}</div>
                <button
                  type="button"
                  onClick={() => onOpenProduct?.(row)}
                  style={{ marginTop: 6, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 8, padding: "5px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}
                >
                  Ver producto
                </button>
              </div>
              <div>
                <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Cantidad</div>
                <div style={{ color: tipoMeta.color, fontFamily: C.mono, fontSize: 13.5, fontWeight: 750 }}>{qtyPrefix}{fmtQty(qtyOut)} {row.unidad || ""}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Origen</div>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rowOrigenMovimientoLabel(row, obraById)}</div>
                <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>{rowSede(row) || "Sin sede"}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Destino</div>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{destinoLabel(row)}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Detalle</div>
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

function openEgresoDisplay(toast) {
  const popup = openEgresoDisplayWindow();
  if (!popup) toast?.warning?.("El navegador bloqueó la pantalla. Habilitá las ventanas emergentes para KlaseA.");
}

function EgresoBatchPanel({ group, selectedLocation, obras, sedeLocked, canReceive, onDone, toast, cart, setCart }) {
  const [cantidad, setCantidad] = useState(defaultEgresoQty(selectedLocation));
  const [variante, setVariante] = useState("");
  const [variantAdderKey, setVariantAdderKey] = useState("");
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
    setVariante("");
    setCantidad(defaultEgresoQty(selectedLocation));
    setSede(sedeLocked || selectedLocation?.sede || "Pampa");
  }, [group?.key, selectedLocation, sedeLocked]);

  useEffect(() => {
    setCodigoLibre(group?.codigo || "");
    setUnidadLibre(group?.unidad || "unidad");
  }, [group?.key, group?.codigo, group?.unidad]);

  const isCatalogOnly = !!group?.catalogOnly;
  const variantOptions = [...new Set([
    ...(Array.isArray(group?.variantes) ? group.variantes : []),
    ...(selectedLocation?.porVariante || []).map((row) => cleanCartVariant(row.variante)),
  ].filter(Boolean))];
  const availableActual = availableForVariant(selectedLocation, variante);
  const cantidadNum = qty(cantidad, 0);
  const willGoNegative = !!group && cantidadNum > availableActual;
  const transitOnly = !!group && !isCatalogOnly && availableActual <= 0 && (selectedLocation?.transitQty || 0) > 0;
  const obrasActivas = obras.filter((obra) => !["terminada", "cancelada", "archivada"].includes(obra.estado));
  const totalLineas = cart.length;
  const totalUnidades = cart.reduce((sum, item) => sum + qty(item.cantidad, 0), 0);
  const retiradoError = movementKind === "transferir" ? "" : retiradoPorNombreCompletoError(retiradoPor);
  const retiroNfc = useRetiroNfc({ enabled: canReceive && movementKind !== "transferir", onEmpleado: setRetiradoPor, toast });

  useEffect(() => {
    if (!cart.length) return;
    // La re-asignación también se muestra: el material se está moviendo y el
    // que mira la pantalla tiene que poder ver a qué obra va. Lo que cambia es
    // que no hay tarjeta ni firma, y la pantalla lo dice con todas las letras.
    const reasignando = movementKind === "transferir";
    publishEgresoDisplay({
      mode: reasignando ? "reasignacion" : "retiro",
      status: saving ? "processing" : !reasignando && retiroNfc.empleado ? "identified" : "draft",
      items: egresoDisplayItems(cart, obras, destinoObraId),
      employee: egresoDisplayEmployee(retiroNfc.empleado),
      retiredBy: retiradoPor,
      destination: egresoDisplayDestination(cart, obras, destinoObraId, sectorDestino),
      sector: sectorDestino,
      note: nota,
      totalLines: cart.length,
      totalUnits: cart.reduce((sum, item) => sum + qty(item.cantidad, 0), 0),
      error: "",
      completedAt: null,
    });
  }, [cart, destinoObraId, movementKind, nota, obras, retiradoPor, retiroNfc.empleado, saving, sectorDestino]);

  function addCurrentToCart() {
    if (!group || transitOnly) return;
    if (faltaCantidad(cantidad)) {
      toast.warning(FALTA_CANTIDAD_EGRESO);
      return;
    }
    if (isCatalogOnly || willGoNegative) {
      toast.warning("No hay stock suficiente. Registrá primero el ingreso o la recepción física.");
      return;
    }
    const item = makeCartItem(group, selectedLocation, {
      cantidad,
      sede: sedeLocked || sede,
      codigo: codigoLibre,
      unidad: unidadLibre,
      variante,
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

  function updateCartItemVariant(key, nextVariant) {
    const target = cart.find((item) => item.key === key);
    if (!target) return;
    const cleanVariant = cleanCartVariant(nextVariant);
    const nextKey = cartLineKey(cartBaseKey(target), cleanVariant);
    if (nextKey !== key && cart.some((item) => item.key === nextKey)) {
      toast.warning(`La variante ${cleanVariant || "sin especificar"} ya esta agregada.`);
      return;
    }
    const available = availableForVariant({ available: target.locationAvailable, porVariante: target.porVariante }, cleanVariant);
    setCart((prev) => prev.map((item) => item.key === key ? {
      ...item,
      key: nextKey,
      baseKey: cartBaseKey(item),
      variante: cleanVariant,
      available,
      cantidad: defaultEgresoQty({ available }),
    } : item));
  }
  function updateCartItemProduct(key, productoMaterialId) {
    setCart((prev) => prev.map((item) => item.key === key ? {
      ...item,
      productoMaterialId,
      variante: "",
    } : item));
  }

  function addAnotherVariant(item, nextVariant) {
    if (!nextVariant) return;
    const nextItem = additionalVariantCartItem(item, nextVariant);
    if (cart.some((row) => row.key === nextItem.key)) {
      toast.warning(`La variante ${nextVariant} ya esta agregada.`);
      return;
    }
    setCart((prev) => [...prev, nextItem]);
    setVariantAdderKey("");
  }

  function removeCartItem(key) {
    setCart((prev) => prev.filter((item) => item.key !== key));
  }

  async function submitBatch() {
    if (!canReceive || !cart.length) return;
    const sinProducto = cart.find((item) => item.esRequisito && !item.productoMaterialId);
    if (sinProducto) {
      toast.warning(`${sinProducto.label}: elegí el producto concreto antes de confirmar.`);
      return;
    }
    const sinCantidad = renglonSinCantidad(cart);
    if (sinCantidad) {
      toast.warning(`${sinCantidad.label}: ${FALTA_CANTIDAD_EGRESO.toLowerCase()}`);
      return;
    }
    const sinStock = cart.find((item) => item.catalogOnly || qty(item.cantidad, 0) > qty(item.available, 0) + 0.0001);
    if (sinStock) {
      toast.warning(`${sinStock.label}: no hay stock suficiente. Corregí la cantidad o registrá el ingreso primero.`);
      return;
    }
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
      if (movementKind === "transferir") {
        for (const item of cart) {
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
            variante: item.variante || null,
            productoMaterialId: item.productoMaterialId || null,
          });
        }
      } else {
        await egresarProductosCarrito({
          items: cart,
          destinoObraId,
          retiradoPor,
          sectorDestino,
          nota: egresoNota,
        });
      }
      toast.success(`${cart.length} producto${cart.length === 1 ? "" : "s"} ${movementKind === "transferir" ? "asignado" : "egresado"}${cart.length === 1 ? "" : "s"}.`);
      // Confirmado el movimiento, la pantalla vuelve enseguida a "esperando el
      // próximo retiro". Dejarla mostrando lo que se acaba de cerrar confunde
      // al que llega después: ve materiales en pantalla y cree que son los
      // suyos. Se limpia en el origen y no con un timer de la pantalla, así
      // tampoco queda un movimiento viejo guardado si la pantalla estaba
      // cerrada.
      resetEgresoDisplay();
      setCart([]);
      setDestinoObraId("");
      setRetiradoPor("");
      retiroNfc.clear();
      setSectorDestino("");
      setNota("");
      await onDone?.();
    } catch (error) {
      if (movementKind !== "transferir") {
        publishEgresoDisplay({
          status: "error",
          error: error.message || "No se pudo registrar el egreso.",
        });
      }
      toast.error(error.message || "No se pudo registrar el egreso.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 13, fontWeight: 750 }}>Egreso multiple</div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Agregá varios productos y confirmalos juntos. Sólo se puede retirar stock físicamente recibido.</div>
        </div>
        <button type="button" onClick={() => openEgresoDisplay(toast)} title="Abrir la pantalla que ve la persona que retira" style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 9, padding: "7px 9px", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: C.sans, whiteSpace: "nowrap" }}>
          <MonitorUp size={14} /> Pantalla
        </button>
      </div>

      {group ? (
        <div style={{ border: `1px solid ${C.border}`, background: C.bg, borderRadius: 10, padding: 10, display: "grid", gap: 8 }}>
          <div style={{ color: C.text, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</div>
          {!isCatalogOnly && (
            <div style={{ color: C.dim, fontSize: 11 }}>{selectedLocation?.label || "Stock general"} · disponible {fmtQty(availableActual)}</div>
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
          {variantOptions.length > 0 && (
            <label style={{ display: "grid", gap: 5 }}>
              <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Variante</span>
              <select
                value={variante}
                onChange={(event) => {
                  const nextVariant = event.target.value;
                  setVariante(nextVariant);
                  setCantidad(defaultEgresoQty({ available: availableForVariant(selectedLocation, nextVariant) }));
                }}
                style={{ background: C.panelSolid, border: `1px solid ${variante ? "rgba(139,92,246,0.45)" : C.border}`, color: variante ? C.violet : C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", cursor: "pointer", fontWeight: variante ? 700 : 500 }}
              >
                <option value="">Sin variante especificada</option>
                {variantOptions.map((value) => {
                  const available = availableForVariant(selectedLocation, value);
                  return <option key={value} value={value}>{value} - disponible {fmtQty(available)}</option>;
                })}
              </select>
            </label>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 5 }}>
              <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Cantidad</span>
              <input type="number" min="0.01" step="any" placeholder="Cantidad" value={cantidad} onChange={(event) => setCantidad(event.target.value)} style={{ background: C.panelSolid, border: `1px solid ${willGoNegative ? C.redB : C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.mono, outline: "none" }} />
            </label>
            <button type="button" onClick={addCurrentToCart} disabled={!canReceive || transitOnly || isCatalogOnly || willGoNegative} style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 9, padding: "10px 12px", cursor: !canReceive || transitOnly || isCatalogOnly || willGoNegative ? "default" : "pointer", opacity: !canReceive || transitOnly || isCatalogOnly || willGoNegative ? 0.55 : 1, fontSize: 12, fontWeight: 750, fontFamily: C.sans }}>
              Agregar
            </button>
          </div>
          {transitOnly && (
            <div style={{ border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, borderRadius: 10, padding: "8px 9px", fontSize: 12, lineHeight: 1.35 }}>
              Este material está por recibir. Todavía no puede egresarse: pañol debe confirmar primero la recepción física.
            </div>
          )}
          {willGoNegative && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, padding: "8px 9px", fontSize: 12, lineHeight: 1.35 }}>
              <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>Stock insuficiente: disponible {fmtQty(availableActual)}. Corregí la cantidad o registrá el ingreso primero.</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: 12, color: C.dim, fontSize: 12, textAlign: "center" }}>Busca y elegi un producto para sumarlo al egreso.</div>
      )}

      <div style={{ border: `1px solid ${C.border}`, background: C.bg, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "9px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span style={{ color: C.text, fontSize: 12.5, fontWeight: 750 }}>Seleccionados</span>
          <span style={{ color: C.dim, fontSize: 11 }}>{totalLineas} {totalLineas === 1 ? "renglon" : "renglones"} · {fmtQty(totalUnidades)} unidades</span>
        </div>
        <div style={{ display: "grid", maxHeight: 220, overflowY: "auto" }}>
          {cart.length ? cart.map((item) => (
            <div key={item.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 84px 28px", gap: 8, alignItems: "center", padding: "9px 10px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.locationLabel}{item.sede ? ` · ${item.sede}` : ""}{item.catalogOnly ? " · sin registro digital" : ""}
                </div>
                {item.esRequisito && (
                  <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                    <select
                      value={item.productoMaterialId || ""}
                      onChange={(event) => updateCartItemProduct(item.key, event.target.value)}
                      style={{ background: item.productoMaterialId ? C.greenL : C.violetL, border: `1px solid ${item.productoMaterialId ? C.greenB : C.violetB}`, color: item.productoMaterialId ? C.green : C.violet, borderRadius: 8, padding: "5px 7px", fontSize: 11, fontFamily: C.sans, outline: "none", width: "100%", cursor: "pointer", fontWeight: 700 }}
                    >
                      <option value="">Elegir producto concreto…</option>
                      {(item.productosCompatibles || []).map((producto) => (
                        <option key={producto.id} value={producto.id}>{producto.descripcion}{producto.codigo ? ` · ${producto.codigo}` : ""}</option>
                      ))}
                    </select>
                  </div>
                )}
                {!item.esRequisito && item.variantes?.length > 0 && (
                  <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                    <select
                      value={item.variante || ""}
                      onChange={(event) => updateCartItemVariant(item.key, event.target.value)}
                      style={{ background: C.panelSolid, border: `1px solid ${item.variante ? "rgba(139,92,246,0.45)" : C.border}`, color: item.variante ? C.violet : C.text, borderRadius: 8, padding: "4px 7px", fontSize: 11, fontFamily: C.sans, outline: "none", width: "100%", cursor: "pointer", fontWeight: item.variante ? 700 : 500 }}
                    >
                      <option value="">Variante: sin especificar</option>
                      {item.variantes.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    {remainingCartVariants(item, cart).length > 0 && (variantAdderKey === item.key ? (
                      <select
                        autoFocus
                        defaultValue=""
                        onBlur={() => setVariantAdderKey("")}
                        onChange={(event) => addAnotherVariant(item, event.target.value)}
                        style={{ background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue, borderRadius: 8, padding: "4px 7px", fontSize: 10.5, fontFamily: C.sans, outline: "none", width: "100%", cursor: "pointer", fontWeight: 700 }}
                      >
                        <option value="">Elegir otra variante...</option>
                        {remainingCartVariants(item, cart).map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    ) : (
                      <button type="button" onClick={() => setVariantAdderKey(item.key)} style={{ justifySelf: "start", border: "none", background: "transparent", color: C.blue, padding: "2px 0", fontSize: 10.5, fontWeight: 700, fontFamily: C.sans, cursor: "pointer" }}>
                        + Agregar otra variante
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input type="number" min="0.01" step="any" placeholder="Cant." value={item.cantidad} onChange={(event) => updateCartItem(item.key, { cantidad: event.target.value })} style={{ background: C.panelSolid, border: `1px solid ${qty(item.cantidad, 0) > item.available ? C.redB : C.border}`, color: C.text, borderRadius: 8, padding: "8px 7px", fontSize: 12, fontFamily: C.mono, outline: "none", minWidth: 0 }} />
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
        <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Tipo de movimiento</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <button type="button" onClick={() => setMovementKind("consumir")} style={{ border: `1px solid ${movementKind === "consumir" ? C.greenB : C.border}`, background: movementKind === "consumir" ? C.greenL : C.panel, color: movementKind === "consumir" ? C.green : C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: C.sans }}>Consumir en obra</button>
          <button type="button" onClick={() => setMovementKind("transferir")} style={{ border: `1px solid ${movementKind === "transferir" ? C.blueB : C.border}`, background: movementKind === "transferir" ? C.blueL : C.panel, color: movementKind === "transferir" ? C.blue : C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: C.sans }}>Asignar a obra</button>
        </div>
      </div>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{movementKind === "transferir" ? "Asignar a la obra" : "Reasignar a obra"}</span>
        <select value={destinoObraId} onChange={(event) => setDestinoObraId(event.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }}>
          <option value="">{movementKind === "transferir" ? "Elegir obra" : "Sin reasignar"}</option>
          {obrasActivas.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
        </select>
      </label>
      {movementKind !== "transferir" && (
        <RetiroNfcBox nfc={retiroNfc} onClear={() => { retiroNfc.clear(); setRetiradoPor(""); }} compact materialIds={group?.material?.id ? [group.material.id] : []} />
      )}
      <label style={{ display: "grid", gap: 4 }}>
        <input value={retiradoPor} onChange={(event) => setRetiradoPor(event.target.value)} placeholder="Nombre y apellido de quien retira" style={{ background: C.bg, border: `1px solid ${retiradoError && retiradoPor.trim() ? C.redB : C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }} />
        {retiradoError && <span style={{ color: C.violet, fontSize: 10.5, lineHeight: 1.3 }}>Obligatorio para egresos: nombre y apellido, no solo DNI ni un apellido.</span>}
        {!retiradoError && !retiroNfc.empleado && <span style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.3 }}>La tarjeta es opcional por ahora: con nombre y apellido alcanza.</span>}
      </label>
      <input value={sectorDestino} onChange={(event) => setSectorDestino(event.target.value)} placeholder="Sector / uso / entrega" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }} />
      <input value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Observacion / detalle del egreso" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }} />

      <div style={{ display: "flex", gap: 8 }}>
        {cart.length > 0 && (
          <button type="button" onClick={() => { setCart([]); resetEgresoDisplay(); }} disabled={saving} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 10, padding: "10px 12px", cursor: saving ? "default" : "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.sans }}>
            Vaciar
          </button>
        )}
        <button type="button" onClick={submitBatch} disabled={saving || !canReceive || cart.length === 0} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 750, cursor: saving || !canReceive || cart.length === 0 ? "default" : "pointer", opacity: saving || !canReceive || cart.length === 0 ? 0.6 : 1, fontFamily: C.sans }}>
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
    setCantidad(action === "ingresar" ? "1" : defaultEgresoQty({ available }));
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
  const willGoNegative = (action === "egresar" || action === "trasladar") && cantidadNum > (selectedLocation?.available || 0);
  const insufficientStock = (action === "egresar" || action === "asignar" || action === "trasladar")
    && (isCatalogOnly || cantidadNum > (selectedLocation?.available || 0) + 0.0001);
  const transitOnly = (action === "egresar" || action === "trasladar") && !isCatalogOnly && (selectedLocation?.available || 0) <= 0 && (selectedLocation?.transitQty || 0) > 0;
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
  const retiroNfc = useRetiroNfc({ enabled: canReceive && action === "egresar", onEmpleado: setRetiradoPor, toast });

  async function submit() {
    if (!canReceive) return;
    if (!group) {
      toast.warning("Elegí un producto.");
      return;
    }
    if (faltaCantidad(cantidad)) {
      toast.warning(action === "ingresar" ? "Poné la cantidad que entra." : FALTA_CANTIDAD_EGRESO);
      return;
    }
    if (insufficientStock || transitOnly) {
      toast.warning("No hay stock suficiente. Registrá primero el ingreso o la recepción física.");
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
    if (action === "trasladar" && (!selectedLocation?.sede || !OTRA_SEDE_PANOL[selectedLocation.sede])) {
      toast.warning("Elegí una ubicación con sede de origen.");
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
          sourceRows: compactEgresoSourceRows(selectedLocation),
        });
        toast.success("Egreso registrado.");
      } else if (action === "trasladar") {
        const origen = selectedLocation.sede;
        const destino = OTRA_SEDE_PANOL[origen];
        await iniciarTrasladoSede({
          materialId: group.material?.id,
          cantidad,
          sedeOrigen: origen,
          sedeDestino: destino,
          obraId: selectedLocation.obraId || null,
          nota,
          variante: varianteEgreso || null,
        });
        toast.success(`Traslado iniciado: ${origen} → ${destino}. Confirmá la llegada en «Entre sedes».`);
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
        await ingresarStockGeneral({ material: group.material, cantidad, sede: sedeLocked || sede, obraId: selectedLocation?.obraId || null, nota: ingresoNota, esAdicional: group.esAdicional });
        toast.success("Ingreso de ajuste registrado.");
      }
      setDestinoObraId("");
      setRetiradoPor("");
      retiroNfc.clear();
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
    <div className="stk-bloque" style={{ gap: 12 }}>
      <div>
        <div className="stk-dialogo-titulo">{action === "egresar" ? "Egresar material" : action === "ingresar" ? "Ingresar ajuste" : action === "trasladar" ? "Trasladar entre sedes" : "Asignar stock"}</div>
        {action === "ingresar" && <div className="stk-dialogo-sub">Destino: {selectedLocation?.obraId ? selectedLocation.label : `Stock ${sedeLocked || sede}`}</div>}
        <div className="stk-dialogo-sub">{action === "egresar" ? "Cantidad, destino y receptor en un solo paso." : "Movimiento registrado en kardex."}</div>
      </div>
      {isCatalogOnly && (
        <div className="stk-faltan is-violeta" style={{ paddingLeft: 0, whiteSpace: "normal" }}>Sin stock recibido: registrá el ingreso físico antes de intentar un egreso.</div>
      )}
      <div className="ui-seg" role="group" aria-label="Tipo de movimiento">
        <button type="button" aria-pressed={action === "egresar"} onClick={() => setAction("egresar")} disabled={mode === "egreso"}>Egreso</button>
        {mode !== "egreso" && !isCatalogOnly && (
          <button type="button" aria-pressed={action === "asignar"} onClick={() => setAction("asignar")}>{asignarLabel}</button>
        )}
        {mode !== "egreso" && !isCatalogOnly && (
          <button type="button" aria-pressed={action === "trasladar"} onClick={() => setAction("trasladar")}>Trasladar sede</button>
        )}
        {mode !== "egreso" && (
          <button type="button" aria-pressed={action === "ingresar"} onClick={() => setAction("ingresar")}>Ingreso</button>
        )}
      </div>

      {(action === "egresar" || action === "asignar" || action === "trasladar") && !isCatalogOnly && (
        <label className="stk-campo">
          <span>{action === "asignar" ? "Depósito / stock a asignar" : "Depósito / obra origen"}</span>
          <select value={selectedLocation?.key || ""} onChange={(event) => setSelectedLocationKey(event.target.value)} className="ui-input">
            {group.locations.map((loc) => <option key={loc.key} value={loc.key}>{loc.label} · {fmtQty(loc.available)}</option>)}
          </select>
        </label>
      )}

      {/* Selector de variante al egresar/asignar cuando el producto tiene variantes */}
      {(action === "egresar" || action === "asignar" || action === "trasladar") && group.variantes?.length > 0 && (
        <label className="stk-campo">
          <span>Variante {action === "egresar" ? "a egresar" : "a asignar"}</span>
          <select value={varianteEgreso} onChange={(event) => setVarianteEgreso(event.target.value)} className="ui-input" style={{ borderColor: varianteEgreso ? C.violet : C.border }}>
            <option value="">— Sin especificar —</option>
            {group.variantes.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      )}

      {action === "asignar" && (
        <label className="stk-campo">
          <span>{originIsObra ? "Mover a" : "Asignar a la obra"}</span>
          <select value={destinoObraId} onChange={(event) => setDestinoObraId(event.target.value)} className="ui-input" style={{ borderColor: destinoObraId ? C.blueB : C.border }}>
            <option value="">Elegir destino</option>
            {originIsObra && <option value="__stock__">Pasar a stock (liberar)</option>}
            {obrasActivas.filter((obra) => obra.id !== selectedLocation?.obraId).map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
          </select>
        </label>
      )}

      {action === "trasladar" && selectedLocation?.sede && (
        <div className="stk-nota-cian" style={{ borderColor: "var(--blue-border)", background: "var(--blue-soft)", color: "var(--text)" }}>
          <strong>{selectedLocation.sede} → {OTRA_SEDE_PANOL[selectedLocation.sede]}</strong>
          {selectedLocation.obraId && <span> · La obra no cambia.</span>}
          <div>Al despachar, sale de {selectedLocation.sede} y queda en tránsito. Sólo entra en {OTRA_SEDE_PANOL[selectedLocation.sede]} cuando allí confirmen la llegada.</div>
        </div>
      )}

      {action === "egresar" && isCatalogOnly && !sedeLocked && (
        <SelectFilter label="Sede origen" value={sede} onChange={setSede} options={SEDES_PANOL.map((item) => [item, item])} />
      )}

      {action === "egresar" && isCatalogOnly && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
          <input value={codigoLibre} onChange={(event) => setCodigoLibre(event.target.value)} placeholder="Codigo / barra" className="ui-input" />
          <input value={unidadLibre} onChange={(event) => setUnidadLibre(event.target.value)} placeholder="Unidad" className="ui-input" />
        </div>
      )}

      {action === "ingresar" && !sedeLocked && (
        <SelectFilter label="Sede destino" value={sede} onChange={setSede} options={SEDES_PANOL.map((item) => [item, item])} />
      )}

      {action === "ingresar" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={proveedor} onChange={(event) => setProveedor(event.target.value)} placeholder="Proveedor" className="ui-input" />
          <input value={remito} onChange={(event) => setRemito(event.target.value)} placeholder="Nro. remito" className="ui-input" />
          <input value={factura} onChange={(event) => setFactura(event.target.value)} placeholder="Factura" className="ui-input" />
          <input value={sectorDestino} onChange={(event) => setSectorDestino(event.target.value)} placeholder="Posicion / ubicacion" className="ui-input" />
        </div>
      )}

      <label className="stk-campo">
        <span>Cantidad</span>
        <input type="number" min="0.01" step="any" placeholder="Cantidad" value={cantidad} onChange={(event) => setCantidad(event.target.value)} className="ui-input" style={{ borderColor: willGoNegative ? C.redB : C.border, fontVariantNumeric: "tabular-nums", fontSize: 17 }} />
      </label>

      {transitOnly && (
        <div className="stk-nota-violeta">
          Esta linea esta en transito y todavia no fue recibida por pañol. No cuenta como stock cargado.
        </div>
      )}

      {!transitOnly && willGoNegative && (
        <div className="stk-aviso" style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "var(--red)" }}>
          <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>Stock insuficiente: disponible {fmtQty(selectedLocation?.available || 0)}. Corregí la cantidad o registrá el ingreso primero.</span>
        </div>
      )}

      {action === "egresar" && (
        <>
          <label className="stk-campo">
            <span>Obra a la que va</span>
            <select value={destinoObraId} onChange={(event) => setDestinoObraId(event.target.value)} className="ui-input" style={{ borderColor: !destinoObraId && !selectedLocation?.obraId ? C.violetB : C.border }}>
              <option value="">Sin obra (mantenimiento, río, etc.)</option>
              {obrasActivas.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
            </select>
            {!destinoObraId && !selectedLocation?.obraId && (
              <span className="stk-faltan is-violeta" style={{ paddingLeft: 0, whiteSpace: "normal" }}>Sin obra: es obligatorio detallar abajo a dónde va.</span>
            )}
          </label>
          <RetiroNfcBox nfc={retiroNfc} onClear={() => { retiroNfc.clear(); setRetiradoPor(""); }} compact materialIds={group?.material?.id ? [group.material.id] : []} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="stk-campo" style={{ gap: 4 }}>
              <input value={retiradoPor} onChange={(event) => setRetiradoPor(event.target.value)} placeholder="Nombre y apellido de quien retira" className="ui-input" style={{ borderColor: retiradoError && retiradoPor.trim() ? C.redB : C.border }} />
              {retiradoError && <span className="stk-faltan is-violeta" style={{ paddingLeft: 0, whiteSpace: "normal" }}>Obligatorio: nombre y apellido.</span>}
              {!retiradoError && !retiroNfc.empleado && <span className="stk-faltan" style={{ paddingLeft: 0, whiteSpace: "normal", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>La tarjeta es opcional por ahora: con nombre y apellido alcanza.</span>}
            </label>
            <input value={sectorDestino} onChange={(event) => setSectorDestino(event.target.value)} placeholder="Sector / uso" className="ui-input" />
          </div>
        </>
      )}

      <input value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Observación (opcional)" className="ui-input" />

      {(() => {
        const disabled = saving || !canReceive || transitOnly || insufficientStock || (action === "asignar" && !destinoObraId);
        return (
          <button type="button" className={`ui-btn ${action === "egresar" ? "stk-carrito" : "ui-btn-primario"}`} onClick={submit} disabled={disabled} style={{ minHeight: 44 }}>
            {action === "egresar" ? <ArrowUpRight size={15} /> : action === "trasladar" ? <Truck size={15} /> : <PackagePlus size={15} />}
            {saving ? "Registrando..." : action === "egresar" ? "Confirmar egreso" : action === "trasladar" ? "Despachar a la otra sede" : action === "ingresar" ? "Confirmar ingreso" : destinoObraId === "__stock__" ? "Pasar a stock" : originIsObra ? "Confirmar reasignación" : "Confirmar asignación"}
          </button>
        );
      })()}
    </div>
  );
}

// Panel de revisión del maestro. Es el lugar donde el pañolero, con la pieza en
// la mano, arregla lo que está mal y lo deja marcado.
//
// Va en dos pasos y no en uno: primero se corrigen los datos, y recién si algo
// no cierra se abre el bloque del problema. Antes había un botón "Tiene un
// problema" al lado de un campo de texto suelto, y no se entendía qué había que
// escribir ahí ni qué pasaba después de apretarlo.
// Un requisito de matriz ya revisado deja de ser algo que buscar en el estante:
// no es una pieza, es el enunciado de una necesidad. Mientras se hace la
// revision fisica se van archivando, y la lista queda solo con lo que se puede
// agarrar con la mano.
function esMatrizArchivada(group) {
  return group?.esRequisito === true && group?.verificacion === "ok";
}

function VerificacionPanel({ group, canEdit, onDone, toast }) {
  const materialId = group?.material?.id || null;
  const [descripcion, setDescripcion] = useState(group?.label || "");
  const [ubicacion, setUbicacion] = useState(group?.ubicacion || "");
  const [ubicacionObs, setUbicacionObs] = useState(group?.ubicacion_obs || "");
  const [nota, setNota] = useState(group?.verificacionNota || "");
  const [problemas, setProblemas] = useState(() => [...(group?.verificacionProblemas || [])]);
  const [contada, setContada] = useState("");
  const [abrirProblema, setAbrirProblema] = useState(() => (group?.verificacionProblemas || []).length > 0);
  const [guardando, setGuardando] = useState("");
  const [historial, setHistorial] = useState([]);
  const [verHistorial, setVerHistorial] = useState(false);

  const estado = group?.verificacion === "ok" || group?.verificacion === "problema" ? group.verificacion : "pendiente";
  const meta = VERIF_META[estado];
  const sistema = qty(group?.total, 0);
  const contadaNum = contada === "" ? null : Number(contada);
  const difiere = contadaNum !== null && Number.isFinite(contadaNum) && Math.abs(contadaNum - sistema) > 0.0001;

  useEffect(() => {
    if (!verHistorial || !materialId) return;
    fetchVerificacionesMaterial(materialId).then(setHistorial).catch(() => setHistorial([]));
  }, [verHistorial, materialId]);

  // Si al contar aparece una diferencia, el problema ya quedó identificado: se
  // tilda solo, para que nadie tenga que acordarse de marcarlo.
  function cambiarContada(valor) {
    setContada(valor);
    const num = valor === "" ? null : Number(valor);
    const hayDiferencia = num !== null && Number.isFinite(num) && Math.abs(num - sistema) > 0.0001;
    if (hayDiferencia) {
      setAbrirProblema(true);
      setProblemas((prev) => (prev.includes("cantidad") ? prev : [...prev, "cantidad"]));
    }
  }

  function toggleProblema(clave) {
    setProblemas((prev) => (prev.includes(clave) ? prev.filter((x) => x !== clave) : [...prev, clave]));
  }

  async function guardar(nuevoEstado) {
    if (!materialId) {
      toast?.warning?.("Este renglón no está vinculado al catálogo, no se puede revisar.");
      return;
    }
    setGuardando(nuevoEstado);
    try {
      await verificarMaterial(materialId, nuevoEstado, {
        nota: nota.trim() || null,
        ubicacion: ubicacion.trim() || null,
        ubicacionObs,
        descripcion: descripcion.trim() || null,
        problemas: nuevoEstado === "problema" ? problemas : [],
        cantidadContada: contada,
        cantidadSistema: sistema,
      });
      toast?.success?.(
        nuevoEstado === "ok" ? "Producto revisado y correcto."
          : nuevoEstado === "problema" ? "Queda marcado con problema."
            : "Vuelve a la lista de sin revisar.",
      );
      setVerHistorial(false);
      await onDone?.();
    } catch (error) {
      toast?.error?.(error.message || "No se pudo guardar la revisión.");
    } finally {
      setGuardando("");
    }
  }

  // Sin permiso se muestra el estado pero no los controles. Devolver null hacía
  // que el bloque desapareciera y no hubiera forma de saber si faltaba permiso
  // o si el módulo estaba roto.
  if (!canEdit) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: "9px 12px" }}>
        <ShieldCheck size={14} style={{ color: C.dim, flexShrink: 0 }} />
        <span style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>Revisión del maestro</span>
        <VerificacionChip estado={estado} />
        <span style={{ color: C.dim, fontSize: 11 }}>Tu usuario no puede revisar productos.</span>
      </div>
    );
  }

  const campo = { width: "100%", minWidth: 0, boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12.5, fontFamily: C.sans, outline: "none" };
  const rotulo = { color: C.dim, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 };
  const paso = { width: 18, height: 18, borderRadius: 999, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue, fontSize: 10, fontWeight: 750, flexShrink: 0 };

  return (
    // SIN overflow:hidden. El contenedor del detalle es un grid, y un ítem de
    // grid con overflow:hidden aporta 0 a la altura de su fila: la fila colapsaba
    // a 2px —los dos bordes— y el panel quedaba renderizado en el DOM pero
    // recortado a nada, sin dejar rastro de por qué. Medido en el navegador:
    // con overflow hidden la fila da 2px; sin él, 413px.
    // Las esquinas del encabezado se redondean a mano, que es lo único que el
    // overflow estaba resolviendo.
    <div style={{
      border: `1px solid ${estado === "pendiente" ? C.blueB : meta.border}`,
      background: C.panelSolid,
      borderRadius: 12,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "9px 12px", borderBottom: `1px solid ${C.border}`,
        borderRadius: "11px 11px 0 0",
        background: estado === "pendiente" ? C.blueL : meta.bg === "transparent" ? C.panel : meta.bg,
      }}>
        <ShieldCheck size={14} style={{ color: estado === "pendiente" ? C.blue : meta.color, flexShrink: 0 }} />
        <span style={{ color: C.text, fontSize: 12.5, fontWeight: 750 }}>Revisión del maestro</span>
        <VerificacionChip estado={estado} />
        <button type="button" onClick={() => setVerHistorial((v) => !v)}
          style={{ marginLeft: "auto", border: "none", background: "transparent", color: C.blue, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: C.sans, padding: 0 }}>
          {verHistorial ? "Ocultar historial" : "Ver historial"}
        </button>
      </div>

      <div style={{ padding: 12, display: "grid", gap: 11 }}>
        {!materialId && (
          <div style={{ border: `1px solid ${C.violetB}`, background: C.violetL, borderRadius: 9, padding: "8px 10px", color: C.text, fontSize: 11.5, lineHeight: 1.45 }}>
            Este renglón todavía no está vinculado al catálogo, así que no se puede
            revisar. Creá la ficha desde <b>Ubicación física del producto</b>, más abajo.
          </div>
        )}

        {estado !== "pendiente" && (
          <div style={{ color: C.dim, fontSize: 11, lineHeight: 1.45 }}>
            Última revisión: {group.verificadoAt ? new Date(group.verificadoAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "sin fecha"}
            {group.verificacionNota ? ` · ${group.verificacionNota}` : ""}
          </div>
        )}

        {/* PASO 1 — los datos de la ficha */}
        <div style={{ display: "grid", gap: 9 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={paso}>1</span>
            <span style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>Corregí la ficha con el producto en la mano</span>
          </div>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span style={rotulo}>Descripción · tiene que alcanzar para reconocerlo</span>
            <input value={descripcion} size={1} onChange={(event) => setDescripcion(event.target.value)}
              placeholder="Ej: Bisagra codo 18 + base con clip" style={campo} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", gap: 8 }}>
            <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <span style={rotulo}>Ubicación</span>
              <input value={ubicacion} size={1} onChange={(event) => setUbicacion(event.target.value)}
                placeholder="Ej: Estante C3"
                style={{ ...campo, borderColor: ubicacion.trim() ? C.border : C.redB }} />
            </label>
            <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <span style={rotulo}>Dónde está exactamente</span>
              <input value={ubicacionObs} size={1} onChange={(event) => setUbicacionObs(event.target.value)}
                placeholder="Ej: afuera, contra el portón" style={campo} />
            </label>
          </div>

          {/* Contar es opcional, pero es lo que convierte la revisión en un dato:
              sin el número, "la cantidad no cierra" no se puede discutir. */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <span style={rotulo}>¿Cuántos contaste? (opcional)</span>
              <input value={contada} size={1} inputMode="decimal" onChange={(event) => cambiarContada(event.target.value)}
                placeholder="Dejalo vacío si no contaste"
                style={{ ...campo, fontFamily: C.mono, borderColor: difiere ? C.redB : C.border }} />
            </label>
            <div style={{ paddingBottom: 8, whiteSpace: "nowrap", color: difiere ? C.red : C.dim, fontSize: 11.5, fontWeight: difiere ? 700 : 650 }}>
              {difiere
                ? `Sistema ${fmtQty(sistema)} · difiere en ${fmtQty(Math.abs(contadaNum - sistema))}`
                : `Sistema dice ${fmtQty(sistema)} ${group.unidad || "u"}`}
            </div>
          </div>
        </div>

        {/* PASO 2 — el veredicto */}
        <div style={{ display: "grid", gap: 9, borderTop: `1px solid ${C.border}`, paddingTop: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={paso}>2</span>
            <span style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>¿Quedó bien?</span>
          </div>

          {!abrirProblema ? (
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <button type="button" onClick={() => guardar("ok")} disabled={!!guardando}
                style={{ flex: "1 1 190px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 9, padding: "10px 12px", cursor: guardando ? "default" : "pointer", fontSize: 12.5, fontWeight: 750, fontFamily: C.sans, opacity: guardando ? 0.6 : 1 }}>
                <CheckCircle2 size={14} /> {guardando === "ok" ? "Guardando…" : "Sí, guardar y marcar revisado"}
              </button>
              <button type="button" onClick={() => setAbrirProblema(true)} disabled={!!guardando}
                style={{ flex: "1 1 150px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, borderRadius: 9, padding: "10px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: C.sans }}>
                <AlertTriangle size={14} /> No, hay algo mal
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 9, border: `1px solid ${C.redB}`, background: C.redL, borderRadius: 10, padding: 10 }}>
              <div style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>¿Qué está mal? Marcá todo lo que corresponda</div>
              <div style={{ display: "grid", gap: 5 }}>
                {VERIFICACION_PROBLEMAS.map(([clave, label, ayuda]) => {
                  const on = problemas.includes(clave);
                  return (
                    <button key={clave} type="button" onClick={() => toggleProblema(clave)}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 8, textAlign: "left",
                        border: `1px solid ${on ? C.redB : C.border}`,
                        background: on ? C.panelSolid : "transparent",
                        borderRadius: 9, padding: "7px 9px", cursor: "pointer", fontFamily: C.sans, minWidth: 0,
                      }}>
                      <span style={{
                        width: 15, height: 15, flexShrink: 0, marginTop: 1, borderRadius: 4,
                        border: `1px solid ${on ? C.red : C.border2}`, background: on ? C.red : "transparent",
                        display: "grid", placeItems: "center", color: "#fff", fontSize: 10, fontWeight: 750, lineHeight: 1,
                      }}>{on ? "✓" : ""}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", color: on ? C.red : C.text, fontSize: 12, fontWeight: 700 }}>{label}</span>
                        <span style={{ display: "block", color: C.dim, fontSize: 10.5, lineHeight: 1.35, marginTop: 1 }}>{ayuda}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
                <span style={rotulo}>
                  {problemas.includes("otro") ? "Detalle · obligatorio porque elegiste Otro" : "Detalle (opcional)"}
                </span>
                <input value={nota} size={1} onChange={(event) => setNota(event.target.value)}
                  placeholder="Ej: la etiqueta dice SC4348 pero la caja tiene SC4348E" style={campo} />
              </label>

              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <button type="button" onClick={() => guardar("problema")} disabled={!!guardando || !problemas.length}
                  style={{ flex: "1 1 190px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px solid ${C.redB}`, background: problemas.length ? C.red : C.panel, color: problemas.length ? "#fff" : C.dim, borderRadius: 9, padding: "10px 12px", cursor: guardando || !problemas.length ? "default" : "pointer", fontSize: 12.5, fontWeight: 750, fontFamily: C.sans, opacity: guardando ? 0.6 : 1 }}>
                  <AlertTriangle size={14} />
                  {guardando === "problema"
                    ? "Guardando…"
                    : problemas.length
                      ? `Guardar con ${problemas.length} problema${problemas.length === 1 ? "" : "s"}`
                      : "Elegí qué está mal"}
                </button>
                <button type="button" onClick={() => { setAbrirProblema(false); setProblemas([]); }} disabled={!!guardando}
                  style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 9, padding: "10px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.sans }}>
                  Estaba bien
                </button>
              </div>
            </div>
          )}

          {estado !== "pendiente" && (
            <button type="button" onClick={() => guardar("pendiente")} disabled={!!guardando}
              style={{ justifySelf: "start", border: "none", background: "transparent", color: C.dim, fontSize: 11, fontWeight: 650, cursor: "pointer", fontFamily: C.sans, textDecoration: "underline", padding: 0 }}>
              Deshacer la revisión y volver a dejarlo pendiente
            </button>
          )}
        </div>

        {verHistorial && (
          <div style={{ display: "grid", gap: 6, borderTop: `1px solid ${C.border}`, paddingTop: 11 }}>
            <span style={rotulo}>Revisiones anteriores</span>
            {historial.length === 0 ? (
              <div style={{ color: C.dim, fontSize: 11.5 }}>Todavía no se revisó nunca.</div>
            ) : historial.map((fila) => (
              <div key={fila.id} style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 9, padding: "7px 9px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <VerificacionChip estado={fila.estado} compact />
                  <span style={{ color: C.dim, fontSize: 10.5, fontFamily: C.mono }}>
                    {new Date(fila.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </span>
                  {fila.autor_nombre && <span style={{ color: C.dim, fontSize: 10.5 }}>· {fila.autor_nombre}</span>}
                  {fila.cantidad_contada != null && (
                    <span style={{ color: C.dim, fontSize: 10.5, fontFamily: C.mono }}>
                      · contó {fmtQty(fila.cantidad_contada)}{fila.cantidad_sistema != null ? ` / sistema ${fmtQty(fila.cantidad_sistema)}` : ""}
                    </span>
                  )}
                </div>
                {(fila.problemas || []).length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                    {fila.problemas.map((clave) => (
                      <span key={clave} style={{ color: C.red, border: `1px solid ${C.redB}`, background: C.redL, borderRadius: 6, padding: "1px 6px", fontSize: 9.5, fontWeight: 700 }}>
                        {PROBLEMA_LABEL[clave] || clave}
                      </span>
                    ))}
                  </div>
                )}
                {fila.nota && <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.4, marginTop: 4 }}>{fila.nota}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductDetail({ group, isMobile, obras, sedeLocked, canReceive, canCreateCatalog = false, mode, onDone, toast, setSelectedKey, cart, setCart, onOpenCatalog, cierresByObra, accion = null, minimo = null }) {
  const initialLocationKey = group
    ? (group.locations.find((loc) => loc.available > 0) || group.locations[0] || defaultLocation(sedeLocked || "Pampa")).key
    : "";
  const [selectedLocationKey, setSelectedLocationKey] = useState(initialLocationKey);
  const [reconcilingKey, setReconcilingKey] = useState(null);
  const [revertingId, setRevertingId] = useState(null);
  const [reversalTarget, setReversalTarget] = useState(null);
  const [devolucionTarget, setDevolucionTarget] = useState(null);
  const [devolucionBusy, setDevolucionBusy] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [creatingLocationMaterial, setCreatingLocationMaterial] = useState(false);
  // Toggle C: ocultar filas ya anuladas en el kardex
  const [ocultarAnulados, setOcultarAnulados] = useState(false);
  const [detailTab, setDetailTab] = useState("resumen");
  const [actionOpen, setActionOpen] = useState(false);
  const obraById = useMemo(() => new Map((obras || []).map((obra) => [obra.id, obra])), [obras]);

  if (!group) {
    if (mode === "egreso") {
      return (
        <section style={{ minHeight: 0, minWidth: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid }}>
            <div style={{ color: C.text, fontSize: 17, fontWeight: 750 }}>Egreso multiple</div>
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
          <div style={{ color: C.text, fontSize: 17, fontWeight: 750 }}>Elegí un producto</div>
          <div style={{ color: C.dim, fontSize: 13, lineHeight: 1.45, marginTop: 6 }}>Buscá primero. El detalle muestra saldo por obra/sede, kardex y acciones en un solo lugar.</div>
        </div>
      </section>
    );
  }

  const selectedLocation = group.locations.find((loc) => loc.key === selectedLocationKey) || group.locations[0] || defaultLocation(sedeLocked || "Pampa");
  const sortedRows = group.rows
    .filter((row) => !rowIsMovimientoEspejo(row))
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
    // Crear la ficha es dar de alta un producto: pañol no lo hace (sí Técnica y Compras).
    if (!canReceive || !canCreateCatalog || creatingLocationMaterial) return;
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
  const locationEditor = group.material?.id ? (
    <UbicacionPicker
      materialId={group.material.id}
      ubicacion={group.ubicacion}
      ubicacionObs={group.ubicacion_obs}
      toast={toast}
      label="Ubicacion fisica del producto"
      onSaved={handleLocationSaved}
    />
  ) : (
    <div className="stk-bloque">
      <div className="stk-rotulo">Ubicación física del producto</div>
      <div className="stk-texto">
        {canCreateCatalog
          ? "Este producto todavía no está vinculado al catálogo. Creá la ficha para poder asignarle estantería, verlo en el mapa y dejar los cambios en el kardex."
          : "Este producto todavía no tiene ficha en el catálogo. Técnica la crea o lo vincula desde Stock → Movimientos → Productos a crear; después se le asigna la estantería."}
      </div>
      {canCreateCatalog && (
        <button type="button" className="ui-btn ui-btn-suave" style={{ justifySelf: "start" }} onClick={crearFichaParaUbicacion} disabled={creatingLocationMaterial}>
          <PackagePlus size={15} aria-hidden="true" />
          {creatingLocationMaterial ? "Creando…" : "Crear ficha y ubicar"}
        </button>
      )}
    </div>
  );

  function renderLocationSection(collapsible = false) {
    if (!canReceive) return null;
    if (collapsible) {
      return (
        <details className="stk-bloque" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <summary style={{ listStyle: "none", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13.5, fontWeight: 500 }}>
            <MapPin size={14} color={C.blue} aria-hidden="true" />
            <span style={{ flex: 1 }}>Ubicación y estantería</span>
            {group.ubicacion ? <UbicacionChip ubicacion={group.ubicacion} obs={group.ubicacion_obs} /> : <span className="stk-faltan">Sin ubicar</span>}
          </summary>
          <div style={{ paddingTop: 10 }}>{locationEditor}</div>
        </details>
      );
    }
    return <div className="stk-bloque" style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>{locationEditor}</div>;
  }

  // Suma una unidad desde esa ubicación, como tocar un saldo en el mostrador.
  function sumarAlCarrito(location) {
    if (!location || !(location.available > 0.0001)) {
      toast?.warning?.(`${group.label}: no hay stock recibido para agregar.`);
      return;
    }
    const item = makeCartItem(group, location, {
      cantidad: Math.min(1, location.available),
      sede: sedeLocked || location.sede,
      codigo: group.codigo,
      unidad: group.unidad,
    });
    const currentQty = qty(cart.find((row) => row.key === item.key)?.cantidad, 0);
    if (currentQty >= item.available - 0.0001) {
      toast?.warning?.(`${group.label}: ya agregaste todo el stock disponible.`);
      return;
    }
    setCart((current) => {
      const exists = current.some((row) => row.key === item.key);
      if (!exists) return [...current, item];
      return current.map((row) => row.key === item.key
        ? { ...row, cantidad: String(Math.min(qty(row.cantidad, 0) + 1, item.available)) }
        : row);
    });
    toast?.success?.(`+1 ${group.label} al carrito`);
  }

  function enCarritoDesde(location) {
    const base = `${group.key}::${location.key}`;
    return cart.filter((row) => row.baseKey === base).reduce((sum, row) => sum + qty(row.cantidad, 0), 0);
  }

  const categoriaDet = [...(group.categorias || [])].filter(Boolean)[0] || "";
  const libreDet = qty(group.stockLibre ?? group.total, 0);
  const reservadoDet = qty(group.stockReservado, 0);
  const nivelDet = stockLevel(group);
  const transitoDet = qty(group.transitQty, 0);
  const verResumen = mode === "egreso" || (!actionOpen && detailTab === "resumen");
  const puedeSumar = canReceive && mode !== "egreso";
  // Lo que pide atención, en una sola línea arriba de los saldos.
  const avisoNivel = nivelDet.key === "critico" || nivelDet.key === "alerta"
    ? `${nivelDet.label}: faltan ${fmtQty(nivelDet.faltante)} para el mínimo`
    : "";
  const avisoTexto = [avisoNivel, !group.ubicacion ? "sin ubicación" : ""].filter(Boolean).join(" · ");
  const tonoAviso = nivelDet.key === "critico" ? " is-rojo" : nivelDet.key === "alerta" ? "" : " is-cian";
  const etiquetaAccion = !accion ? "" : accion.tono === "verde"
    ? `Agregar al carrito${accion.badge ? ` · hay ${accion.badge}` : ""}`
    : accion.tono === "violeta"
      ? `Pedir reposición${nivelDet.faltante > 0 ? ` · faltan ${fmtQty(nivelDet.faltante)}` : ""}`
      : accion.label;
  const IconoAccion = accion?.Icon || ArrowUpRight;
  const enlaces = [
    ["movimientos", `Movimientos`, sortedRows.length],
    ["control", "Control y ubicación"],
  ];

  return (
    <section className="stk-ficha" aria-label={`Ficha de ${group.label}`}>
      <div className="stk-ficha-cab">
        <div className="stk-ficha-fila">
          <span className="mst-res-foto"><FotoItem zoom item={{ descripcion: group.label, imagenUrl: group.imagenUrl }} /></span>
          <div style={{ minWidth: 0 }}>
            <h2 className="stk-ficha-titulo">{group.label}</h2>
            <div className="stk-ficha-meta">
              <span className="mst-num">{detCode}</span>
              {group.proveedor && <span>{group.proveedor}</span>}
              {categoriaDet && <span>{categoriaDet}</span>}
            </div>
          </div>
          {isMobile ? (
            <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => setSelectedKey(null)}>
              <ArrowLeft size={15} aria-hidden="true" /> Lista
            </button>
          ) : (
            <button type="button" className="stk-cerrar" onClick={() => setSelectedKey(null)} title="Cerrar" aria-label="Cerrar la ficha">
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="stk-ficha-cuerpo">
        {verResumen && (
          <>
            <div className="stk-cajas">
              {reservadoDet > 0.0001 ? (
                <>
                  <div className="stk-caja"><span>Libre</span><strong className={libreDet < -0.0001 || nivelDet.key === "critico" ? "is-rojo" : ""}>{fmtQty(libreDet)}</strong></div>
                  <div className="stk-caja"><span>En obras</span><strong className="is-azul">{fmtQty(reservadoDet)}</strong></div>
                </>
              ) : (
                <div className="stk-caja"><span>En pañol</span><strong className={group.negativo || nivelDet.key === "critico" ? "is-rojo" : ""}>{fmtQty(group.total)}</strong></div>
              )}
              <div className="stk-caja">
                <span>Mínimo</span>
                {minimo?.onSave && group.material?.id
                  ? <div className="stk-minimo"><MinimumEditor group={group} canEdit={minimo.canEdit} onSave={minimo.onSave} draftEntry={minimo.draft} onDraftChange={minimo.onDraftChange} /></div>
                  : <strong>{nivelDet.configured ? fmtQty(nivelDet.minimum) : "—"}</strong>}
              </div>
              {transitoDet > 0.0001 && <div className="stk-caja"><span>En camino</span><strong className="is-violeta">{fmtQty(transitoDet)}</strong></div>}
            </div>

            {avisoTexto && <div className={`mst-aviso${tonoAviso}`}><AlertTriangle size={15} aria-hidden="true" /><span className="mst-aviso-texto"><strong>{avisoTexto.charAt(0).toUpperCase() + avisoTexto.slice(1)}</strong></span></div>}

            {(group.tipoPedido === "adicional" || groupAsignaciones(group).length > 0 || (group.opciones || []).length > 0 || group.egresado || group.locationImbalance || group.catalogOnly) && (
              <div className="stk-ficha-etiquetas">
                <KindChip tipo={group.tipoPedido} />
                <AsignadoChip asignaciones={groupAsignaciones(group)} />
                <StateChip egresado={group.egresado} transit={false} negative={false} imbalance={group.locationImbalance} catalogOnly={group.catalogOnly} compact />
                <OptionStockSummary group={group} max={6} />
              </div>
            )}

            <div className="mst-bloque">
              <div className="mst-bloque-titulo">
                ¿De dónde sale?
                {puedeSumar && <span className="stk-pista">tocá para sumar al carrito</span>}
              </div>
              <div className="stk-dondes">
                {group.locations.map((loc) => (
                  <LocationButton
                    key={loc.key}
                    location={loc}
                    active={selectedLocation?.key === loc.key}
                    enCarrito={enCarritoDesde(loc)}
                    onClick={() => { setSelectedLocationKey(loc.key); if (puedeSumar) sumarAlCarrito(loc); }}
                    cierre={cierresByObra?.get?.(loc.obraId) || null}
                  />
                ))}
              </div>
            </div>

            {group.esAdicional && detalleAdicional.length > 0 && (
              <div className="mst-bloque">
                <div className="mst-bloque-titulo" style={{ color: "var(--violet)" }}>Detalle del adicional</div>
                {detalleAdicional.map((detalle) => <div key={detalle} className="stk-texto" style={{ color: "var(--text)" }}>{detalle}</div>)}
              </div>
            )}

            {negativeLocations.length > 0 && (
              <div className={`stk-aviso${group.negativo ? "" : " is-violeta"}`}>
                <div className="stk-aviso-titulo">{group.negativo ? "Pendiente de reconciliar" : "Distribución por obra a revisar"}</div>
                {!group.negativo && <div className="stk-texto">El stock total alcanza, pero parte quedó registrada en otra obra o ubicación. Reasignalo desde una ubicación con saldo; no cargues un ingreso nuevo.</div>}
                {negativeLocations.map((loc) => (
                  <div key={loc.key} className="stk-aviso-fila">
                    <div style={{ minWidth: 0 }}>
                      <div className="stk-saldo-nombre">{loc.label}</div>
                      <div className={`stk-faltan ${group.negativo ? "is-rojo" : "is-violeta"}`} style={{ paddingLeft: 0 }}>{group.negativo ? "faltan" : "desbalance"} {fmtQty(Math.abs(loc.available))} {group.unidad}</div>
                    </div>
                    {group.negativo && (
                      <button type="button" className="ui-btn ui-btn-peligro" onClick={() => ingresarFaltante(loc)} disabled={reconcilingKey === loc.key}>
                        {reconcilingKey === loc.key ? "Cargando…" : "Cargar ingreso faltante"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {mode !== "egreso" && (
              <div className="stk-ficha-links">
                {enlaces.map(([key, label, cuenta]) => (
                  <button key={key} type="button" onClick={() => { setActionOpen(false); setDetailTab(key); }}>
                    {label}{cuenta ? <span className="mst-num"> {fmtQty(cuenta)}</span> : null}
                  </button>
                ))}
                {group.material?.id && onOpenCatalog && (
                  <button type="button" onClick={() => onOpenCatalog(group.material.id)}>Ficha del catálogo</button>
                )}
              </div>
            )}
          </>
        )}

        {mode !== "egreso" && !verResumen && !actionOpen && (
          <div className="mst-bloque-titulo">
            {detailTab === "movimientos" ? "Movimientos" : "Control y ubicación"}
            <button type="button" onClick={() => setDetailTab("resumen")}>Volver</button>
          </div>
        )}

        {mode !== "egreso" && !actionOpen && detailTab === "control" && (
          <VerificacionPanel group={group} canEdit={canReceive} onDone={onDone} toast={toast} />
        )}

        {mode !== "egreso" && !actionOpen && detailTab === "control" && renderLocationSection()}

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
        ) : actionOpen ? (
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
        ) : null}

        {mode === "egreso" && renderLocationSection(true)}

        {(mode === "egreso" || (!actionOpen && detailTab === "movimientos")) && (
          <div className="stk-bloque">
            <div className="stk-bloque-cab">
              <div className="stk-rotulo">Kardex</div>
              <button type="button" className={`stk-pastilla${ocultarAnulados ? " is-activa" : ""}`} onClick={() => setOcultarAnulados((v) => !v)} aria-pressed={ocultarAnulados}>
                {ocultarAnulados ? "Mostrar anulados" : "Ocultar anulados"}
              </button>
            </div>
            {visibleKardexRows.length ? (
              <div className="stk-kardex">
                {visibleKardexRows.map((row) => (
                  <KardexRow
                    key={row.id}
                    row={row}
                    onRevert={(movimiento) => { setReversalTarget(movimiento); setReversalReason(""); }}
                    busy={revertingId === row.id}
                    obraById={obraById}
                    onDevolucion={(movimiento) => setDevolucionTarget({ row: movimiento, cantidad: String(Math.abs(rowDelta(movimiento)) || ""), motivo: "defectuoso", detalle: "", necesita: "esperando_reposicion", responsable: "sin_definir" })}
                  />
                ))}
              </div>
            ) : (
              <div className="stk-texto" style={{ padding: "8px 0" }}>
                {(ocultarAnulados && sortedRows.length) ? "Todos los movimientos están anulados. Desactivá el filtro para verlos." : "Producto sin movimientos todavía. Registrá un ingreso o una recepción antes de egresarlo."}
              </div>
            )}
          </div>
        )}
      </div>

      {mode !== "egreso" && canReceive && (
        <div className="mst-car-pie">
          {actionOpen ? (
            <button type="button" className="ui-btn" style={{ minHeight: 44 }} onClick={() => { setActionOpen(false); setDetailTab("resumen"); }}>
              <ArrowLeft size={15} aria-hidden="true" /> Volver a la ficha
            </button>
          ) : (
            <>
              {accion?.onClick && (
                <button type="button" className={`mst-btn-grande${accion.tono === "verde" ? " is-verde" : accion.tono === "violeta" ? " is-violeta" : ""}`} onClick={accion.onClick} title={accion.title || etiquetaAccion}>
                  <IconoAccion size={18} aria-hidden="true" /> {etiquetaAccion}
                </button>
              )}
              <div className="stk-pie-dos">
                <button type="button" className="ui-btn" onClick={() => setActionOpen(true)}>Registrar movimiento</button>
                <button type="button" className="ui-btn" onClick={() => { setActionOpen(false); setDetailTab("control"); }}>
                  <MapPin size={15} aria-hidden="true" /> {group.ubicacion ? "Cambiar ubicación" : "Ubicar en estante"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Devolución: el operario probó el material y volvió fallado. No vuelve a
          stock — queda apartado y Compras decide si se repara o se reclama. */}
      {devolucionTarget && (
        <div className="stk-capa" role="dialog" aria-modal="true" aria-label="Generar devolución">
          <div className="stk-dialogo" style={{ width: "min(500px, 100%)" }}>
            <div className="stk-dialogo-cab">
              <div>
                <div className="stk-dialogo-titulo">Generar devolución</div>
                <div className="stk-dialogo-sub">
                  {devolucionTarget.row.descripcion || group.label}
                  {devolucionTarget.row.retirado_por ? ` · lo retiró ${devolucionTarget.row.retirado_por}` : ""}
                </div>
              </div>
              <button type="button" className="stk-cerrar" onClick={() => setDevolucionTarget(null)} aria-label="Cerrar"><X size={16} aria-hidden="true" /></button>
            </div>

            <div className="stk-dialogo-cuerpo">
              <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 10 }}>
                <label className="stk-campo">
                  <span>Cantidad</span>
                  <input
                    className="ui-input"
                    value={devolucionTarget.cantidad}
                    onChange={(e) => setDevolucionTarget((p) => ({ ...p, cantidad: e.target.value }))}
                    inputMode="decimal"
                    size={1}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  />
                </label>
                <label className="stk-campo">
                  <span>Motivo</span>
                  <select
                    className="ui-input"
                    value={devolucionTarget.motivo}
                    onChange={(e) => setDevolucionTarget((p) => ({ ...p, motivo: e.target.value }))}
                  >
                    {DEVOLUCION_MOTIVOS.map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
                  </select>
                </label>
              </div>

              <label className="stk-campo">
                <span>Qué le pasa</span>
                <input
                  className="ui-input"
                  value={devolucionTarget.detalle}
                  onChange={(e) => setDevolucionTarget((p) => ({ ...p, detalle: e.target.value }))}
                  size={1}
                />
              </label>

              <div className="stk-campo">
                <span>Qué necesita</span>
                <div className="stk-opciones-boton">
                  {DEVOLUCION_NECESITA.map(([valor, label]) => (
                    <button key={valor} type="button" className={`ui-btn${devolucionTarget.necesita === valor ? " is-activo" : ""}`} aria-pressed={devolucionTarget.necesita === valor} onClick={() => setDevolucionTarget((p) => ({ ...p, necesita: valor }))}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Una rotura nuestra también se registra: el material salió y no
                  vuelve al stock. Lo que cambia es que no se le puede reclamar
                  al proveedor, y de eso depende el total del reclamo. */}
              <div className="stk-campo">
                <span>De quién fue</span>
                <div className="stk-opciones-boton">
                  {DEVOLUCION_RESPONSABLE.map(([valor, label]) => (
                    <button key={valor} type="button" className={`ui-btn${devolucionTarget.responsable === valor ? " is-activo" : ""}`} aria-pressed={devolucionTarget.responsable === valor} onClick={() => setDevolucionTarget((p) => ({ ...p, responsable: valor }))}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="stk-nota-cian">
                Queda apartado, <b>no vuelve al stock</b>. Se avisa a Compras para que definan si
                se manda a reparar o se reclama la reposición, y la obra queda con esa cantidad pendiente.
              </div>
            </div>

            <div className="stk-dialogo-pie">
              <button type="button" className="ui-btn" onClick={() => setDevolucionTarget(null)}>Cancelar</button>
              <button
                type="button"
                className="ui-btn ui-btn-peligro"
                disabled={devolucionBusy}
                onClick={async () => {
                  setDevolucionBusy(true);
                  try {
                    await registrarDevolucion({
                      snapshotId: devolucionTarget.row.id,
                      cantidad: devolucionTarget.cantidad,
                      motivo: devolucionTarget.motivo,
                      detalle: devolucionTarget.detalle || null,
                      necesita: devolucionTarget.necesita,

                      responsable: devolucionTarget.responsable,
                    });
                    setDevolucionTarget(null);
                    toast?.success?.("Devolución registrada. Compras fue avisado.");
                    onDone?.();
                  } catch (error) {
                    toast?.error?.(error.message || "No se pudo registrar la devolución.");
                  } finally {
                    setDevolucionBusy(false);
                  }
                }}
              >
                {devolucionBusy ? "Registrando…" : "Registrar devolución"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reversalTarget && (
        <div className="stk-capa" role="dialog" aria-modal="true" aria-label="Revertir movimiento">
          <div className="stk-dialogo">
            <div className="stk-dialogo-cab">
              <div>
                <div className="stk-dialogo-titulo">Revertir movimiento</div>
                <div className="stk-dialogo-sub">
                  {reversalTarget.descripcion || group.label} · {fmtQty(Math.abs(rowDelta(reversalTarget)))} {reversalTarget.unidad || group.unidad}
                </div>
              </div>
              <button
                type="button"
                className="stk-cerrar"
                onClick={() => { setReversalTarget(null); setReversalReason(""); }}
                disabled={revertingId === reversalTarget.id}
                aria-label="Cerrar"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="stk-dialogo-cuerpo">
              <div className="stk-nota-violeta">
                Esto crea el movimiento inverso y deja marcado el original como anulado. El motivo queda en el kardex.
              </div>
              <label className="stk-campo">
                <span>Motivo de reversión</span>
                <textarea
                  className="ui-input"
                  value={reversalReason}
                  onChange={(event) => setReversalReason(event.target.value)}
                  rows={4}
                />
              </label>
            </div>
            <div className="stk-dialogo-pie">
              <button
                type="button"
                className="ui-btn"
                onClick={() => { setReversalTarget(null); setReversalReason(""); }}
                disabled={revertingId === reversalTarget.id}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-peligro"
                onClick={() => revertirMovimiento(reversalTarget, reversalReason)}
                disabled={revertingId === reversalTarget.id || !reversalReason.trim()}
              >
                {revertingId === reversalTarget.id ? "Revirtiendo…" : "Confirmar reversión"}
              </button>
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
  const [variantAdderKey, setVariantAdderKey] = useState("");
  const [destinoObraId, setDestinoObraId] = useState("");
  const [retiradoPor, setRetiradoPor] = useState("");
  const [sectorDestino, setSectorDestino] = useState("");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);

  const obrasActivas = obras.filter((obra) => !["terminada", "cancelada", "archivada"].includes(obra.estado));
  const obraCodigo = (id) => obras.find((o) => o.id === id)?.codigo || "obra";
  const totalUnidades = cart.reduce((sum, item) => sum + qty(item.cantidad, 0), 0);
  const retiradoError = movementKind === "consumir" ? retiradoPorNombreCompletoError(retiradoPor) : "";
  const retiroNfc = useRetiroNfc({ enabled: canReceive && movementKind === "consumir" && cart.length > 0, onEmpleado: setRetiradoPor, toast });

  useEffect(() => {
    if (!cart.length) return;
    const reasignando = movementKind === "transferir";
    publishEgresoDisplay({
      mode: reasignando ? "reasignacion" : "retiro",
      status: saving ? "processing" : !reasignando && retiroNfc.empleado ? "identified" : "draft",
      items: egresoDisplayItems(cart, obras, destinoObraId),
      employee: egresoDisplayEmployee(retiroNfc.empleado),
      retiredBy: retiradoPor,
      destination: egresoDisplayDestination(cart, obras, destinoObraId, sectorDestino),
      sector: sectorDestino,
      note: nota,
      totalLines: cart.length,
      totalUnits: cart.reduce((sum, item) => sum + qty(item.cantidad, 0), 0),
      error: "",
      completedAt: null,
    });
  }, [cart, destinoObraId, movementKind, nota, obras, retiradoPor, retiroNfc.empleado, saving, sectorDestino]);

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
  function updateCartItemVariant(key, nextVariant) {
    const target = cart.find((item) => item.key === key);
    if (!target) return;
    const cleanVariant = cleanCartVariant(nextVariant);
    const nextKey = cartLineKey(cartBaseKey(target), cleanVariant);
    if (nextKey !== key && cart.some((item) => item.key === nextKey)) {
      toast.warning(`La variante ${cleanVariant || "sin especificar"} ya esta agregada.`);
      return;
    }
    const available = availableForVariant({ available: target.locationAvailable, porVariante: target.porVariante }, cleanVariant);
    setCart((prev) => prev.map((item) => item.key === key ? {
      ...item,
      key: nextKey,
      baseKey: cartBaseKey(item),
      variante: cleanVariant,
      available,
      cantidad: defaultEgresoQty({ available }),
    } : item));
  }
  function updateCartItemProduct(key, productoMaterialId) {
    setCart((prev) => prev.map((item) => item.key === key ? {
      ...item,
      productoMaterialId,
      variante: "",
    } : item));
  }
  function addAnotherVariant(item, nextVariant) {
    if (!nextVariant) return;
    const nextItem = additionalVariantCartItem(item, nextVariant);
    if (cart.some((row) => row.key === nextItem.key)) {
      toast.warning(`La variante ${nextVariant} ya esta agregada.`);
      return;
    }
    setCart((prev) => [...prev, nextItem]);
    setVariantAdderKey("");
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
    const sinProducto = cart.find((item) => item.esRequisito && !item.productoMaterialId);
    if (sinProducto) {
      toast.warning(`${sinProducto.label}: elegí el producto concreto antes de confirmar.`);
      return;
    }
    const sinCantidad = renglonSinCantidad(cart);
    if (sinCantidad) {
      toast.warning(`${sinCantidad.label}: ${FALTA_CANTIDAD_EGRESO.toLowerCase()}`);
      return;
    }
    const sinStock = cart.find((item) => item.catalogOnly || qty(item.cantidad, 0) > qty(item.available, 0) + 0.0001);
    if (sinStock) {
      toast.warning(`${sinStock.label}: no hay stock suficiente. Corregí la cantidad o registrá el ingreso primero.`);
      return;
    }
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
      if (movementKind === "transferir") {
        for (const item of cart) {
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
            variante: item.variante || null,
            productoMaterialId: item.productoMaterialId || null,
          });
        }
      } else {
        await egresarProductosCarrito({
          items: cart,
          destinoObraId,
          retiradoPor,
          sectorDestino,
          nota: egresoNota,
        });
      }
      toast.success(`${cart.length} producto${cart.length === 1 ? "" : "s"} ${movementKind === "transferir" ? "asignado" : "egresado"}${cart.length === 1 ? "" : "s"}.`);
      // Ver la nota del otro confirmar: la pantalla se limpia en el origen,
      // apenas se cierra el movimiento, sea retiro o re-asignación.
      resetEgresoDisplay();
      setCart([]);
      setDestinoObraId("");
      setRetiradoPor("");
      retiroNfc.clear();
      setSectorDestino("");
      setNota("");
      await onDone?.();
    } catch (error) {
      // "No tiene stock disponible" casi nunca es un error del que está
      // operando: es que otro se llevó la última unidad mientras este tenía el
      // carrito abierto. La pantalla seguía mostrando la cantidad vieja, así
      // que se refresca sola y se dice lo que pasó en criollo.
      const seLoLlevaronAntes = /no tiene stock disponible/i.test(String(error?.message || ""));
      const mensaje = seLoLlevaronAntes
        ? "Ese material ya no está disponible: alguien lo retiró mientras tenías el carrito abierto. Actualicé la pantalla; fijate las cantidades antes de reintentar."
        : (error.message || "No se pudo registrar el movimiento.");
      if (movementKind === "consumir") {
        publishEgresoDisplay({ status: "error", error: mensaje });
      }
      toast.error(mensaje);
      if (seLoLlevaronAntes) await onDone?.();
    } finally {
      setSaving(false);
    }
  }

  const inp = { background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 };
  const invalidStockItem = cart.find((item) => item.catalogOnly || qty(item.cantidad, 0) > qty(item.available, 0) + 0.0001);
  const unresolvedProductItem = cart.find((item) => item.esRequisito && !item.productoMaterialId);
  const disabled = saving || !canReceive || !cart.length || !!invalidStockItem || !!unresolvedProductItem || (movementKind === "transferir" && !destinoObraId);

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
    if (window.confirm("Guardado ✓. ¿Vaciar el carrito actual para empezar otro?")) {
      setCart([]);
      resetEgresoDisplay();
    }
  }
  function cargarGuardado(saved) {
    if (cart.length && !window.confirm(`¿Reemplazar el carrito actual (${cart.length} ítems) por "${saved.nombre}" (${saved.items.length} ítems)?`)) return;
    setCart(saved.items.map(normalizeStoredCartItem));
    toast?.success?.(`Carrito "${saved.nombre}" cargado.`);
  }
  function borrarGuardado(saved) {
    if (!window.confirm(`¿Borrar el carrito guardado "${saved.nombre}"?`)) return;
    setSavedCarts((prev) => prev.filter((s) => s.id !== saved.id));
  }

  return (
    <div style={{ position: "fixed", right: isMobile ? 8 : 16, bottom: isMobile ? 74 : 84, width: isMobile ? "calc(100vw - 16px)" : 470, maxHeight: "78vh", zIndex: 80, display: "flex", flexDirection: "column", borderRadius: 18, overflow: "hidden", border: `1px solid ${C.border}`, background: "var(--panel)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", boxShadow: "0 30px 70px -18px rgba(0,0,0,0.55)" }}>
      {/* Header sólido: sobrio, sin gradiente */}
      <div style={{ padding: "13px 16px", background: C.greenL, borderBottom: `1px solid ${C.greenB}`, display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: C.green, color: "var(--inverse-text)", flexShrink: 0 }}>
          <ShoppingCart size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 15.5, fontWeight: 700, lineHeight: 1.1 }}>Carrito de pañol</div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{cart.length} {cart.length === 1 ? "renglón" : "renglones"} · {fmtQty(totalUnidades)} unidades</div>
        </div>
        <button type="button" onClick={() => openEgresoDisplay(toast)} title="Abrir la pantalla que ve la persona que retira" className="ui-btn" style={{ minHeight: 28, height: 28, padding: "0 9px", fontSize: 11 }}>
          <MonitorUp size={13} /> Pantalla
        </button>
        {cart.length > 0 && setSavedCarts && (
          <button type="button" onClick={guardarCarrito} title="Guardar este carrito con nombre para retomarlo después" className="ui-btn" style={{ minHeight: 28, height: 28, padding: "0 10px", fontSize: 11 }}>
            <Save size={13} /> Guardar
          </button>
        )}
        <button type="button" onClick={onClose} title="Cerrar" className="ui-btn ui-btn-icono" style={{ width: 28, minHeight: 28, height: 28 }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 13, display: "grid", gap: 13, alignContent: "start" }}>
        {/* Carritos guardados: cargar / borrar */}
        {savedCarts.length > 0 && (
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 750, color: C.dim, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Carritos guardados</div>
            <div style={{ display: "grid", gap: 5 }}>
              {savedCarts.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.panelSolid }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.nombre}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>{s.items.length} ítem{s.items.length === 1 ? "" : "s"} · {new Date(s.savedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</div>
                  </div>
                  <button type="button" onClick={() => cargarGuardado(s)} style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: C.sans, flexShrink: 0 }}>
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
              <span style={{ fontSize: 10.5, fontWeight: 750, color: g.color, textTransform: "uppercase", letterSpacing: 0.7 }}>{g.label}</span>
              <span style={{ fontSize: 10.5, color: C.dim }}>· {g.items.length} ítem{g.items.length === 1 ? "" : "s"}</span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {g.items.map((item) => {
                const excede = !item.catalogOnly && qty(item.cantidad, 0) > item.available;
                return (
                  <div key={item.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 84px 28px", gap: 8, alignItems: "center", padding: "8px 10px", border: `1px solid ${excede ? C.violetB : C.border}`, borderRadius: 10, background: C.panelSolid }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.text, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                      <div style={{ color: excede ? C.violet : C.dim, fontSize: 10.5, marginTop: 1 }}>
                        {item.catalogOnly ? "sin stock recibido" : `disponible ${fmtQty(item.available)} ${item.unidad || ""}`}{excede ? " · cantidad excedida" : ""}
                      </div>
                      {item.esRequisito && (
                        <div style={{ display: "grid", gap: 4, marginTop: 5 }}>
                          <select
                            value={item.productoMaterialId || ""}
                            onChange={(event) => updateCartItemProduct(item.key, event.target.value)}
                            style={{ ...inp, width: "100%", padding: "6px 7px", fontSize: 11, cursor: "pointer", color: item.productoMaterialId ? C.green : C.violet, borderColor: item.productoMaterialId ? C.greenB : C.violetB, background: item.productoMaterialId ? C.greenL : C.violetL, fontWeight: 700 }}
                          >
                            <option value="">Elegir producto concreto…</option>
                            {(item.productosCompatibles || []).map((producto) => (
                              <option key={producto.id} value={producto.id}>
                                {producto.descripcion}{producto.codigo ? ` · ${producto.codigo}` : ""}
                              </option>
                            ))}
                          </select>
                          {!item.productosCompatibles?.length && (
                            <span style={{ color: C.red, fontSize: 10.5, lineHeight: 1.3 }}>No hay productos compatibles configurados. Revisalo en Materiales.</span>
                          )}
                        </div>
                      )}
                      {!item.esRequisito && item.variantes?.length > 0 && (
                        <div style={{ display: "grid", gap: 4, marginTop: 5 }}>
                          <select
                            value={item.variante || ""}
                            onChange={(event) => updateCartItemVariant(item.key, event.target.value)}
                            style={{ ...inp, width: "100%", padding: "5px 7px", fontSize: 11, cursor: "pointer", color: item.variante ? C.violet : C.text, borderColor: item.variante ? "rgba(139,92,246,0.45)" : C.border, fontWeight: item.variante ? 700 : 500 }}
                          >
                            <option value="">Variante: sin especificar</option>
                            {item.variantes.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                          {remainingCartVariants(item, cart).length > 0 && (variantAdderKey === item.key ? (
                            <select
                              autoFocus
                              defaultValue=""
                              onBlur={() => setVariantAdderKey("")}
                              onChange={(event) => addAnotherVariant(item, event.target.value)}
                              style={{ ...inp, width: "100%", padding: "5px 7px", fontSize: 10.5, cursor: "pointer", color: C.blue, borderColor: C.blueB, background: C.blueL, fontWeight: 700 }}
                            >
                              <option value="">Elegir otra variante...</option>
                              {remainingCartVariants(item, cart).map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                          ) : (
                            <button type="button" onClick={() => setVariantAdderKey(item.key)} style={{ justifySelf: "start", border: "none", background: "transparent", color: C.blue, padding: "2px 0", fontSize: 10.5, fontWeight: 700, fontFamily: C.sans, cursor: "pointer" }}>
                              + Agregar otra variante
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input type="number" min="0.01" step="any" placeholder="Cant." value={item.cantidad} onChange={(event) => updateCartItem(item.key, { cantidad: event.target.value })} style={{ ...inp, fontFamily: C.mono, padding: "7px 8px", borderColor: excede ? C.violetB : C.border }} />
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
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: movementKind === "consumir" ? C.green : C.text, fontSize: 13, fontWeight: 750 }}><ArrowUpRight size={15} /> Egresar</div>
            <div style={{ fontSize: 10.5, color: C.dim, marginTop: 3 }}>Sale del pañol (consumo)</div>
          </button>
          <button type="button" onClick={() => setMovementKind("transferir")} style={{ border: `2px solid ${movementKind === "transferir" ? C.blue : C.border}`, background: movementKind === "transferir" ? C.blueL : C.panelSolid, borderRadius: 12, padding: "10px 12px", cursor: "pointer", textAlign: "left", fontFamily: C.sans }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: movementKind === "transferir" ? C.blue : C.text, fontSize: 13, fontWeight: 750 }}><RefreshCw size={15} /> Asignar</div>
            <div style={{ fontSize: 10.5, color: C.dim, marginTop: 3 }}>Queda en pañol, reservado a la obra</div>
          </button>
        </div>

        {/* Destino */}
        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ color: C.dim, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{movementKind === "transferir" ? "Asignar a la obra" : "Obra a la que va"}</span>
          <select value={destinoObraId} onChange={(event) => setDestinoObraId(event.target.value)} style={{ ...inp, cursor: "pointer", borderColor: movementKind === "transferir" && !destinoObraId ? C.violetB : C.border }}>
            <option value="">{movementKind === "transferir" ? "Elegir obra…" : "Cada ítem sale a su obra asignada (stock libre: detallar)"}</option>
            {obrasActivas.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
          </select>
        </label>

        {/* Qué va a pasar */}
        <div style={{ border: `1px dashed ${cruzados.length ? C.violetB : C.blueB}`, background: cruzados.length ? C.violetL : C.blueL, borderRadius: 11, padding: "9px 11px" }}>
          <div style={{ fontSize: 10, fontWeight: 750, color: cruzados.length ? C.violet : C.blue, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Qué va a pasar</div>
          <div style={{ display: "grid", gap: 4 }}>
            {preview.slice(0, 6).map((p) => (
              <div key={p.key} style={{ fontSize: 11, lineHeight: 1.35, color: p.warn ? C.violet : C.text }}>
                <span style={{ fontWeight: 700 }}>{p.warn ? "⚠ " : ""}{p.label}</span>
                <span style={{ color: p.warn ? C.violet : C.dim }}> — {p.det}</span>
              </div>
            ))}
            {preview.length > 6 && <div style={{ fontSize: 10.5, color: C.dim }}>… y {preview.length - 6} más</div>}
          </div>
          {cruzados.length > 0 && (
            <div style={{ fontSize: 10.5, color: C.violet, fontWeight: 700, marginTop: 6 }}>
              ⚠ {cruzados.length} ítem{cruzados.length === 1 ? " está" : "s están"} asignado{cruzados.length === 1 ? "" : "s"} a otra obra: se pide confirmación al confirmar.
            </div>
          )}
        </div>

        {/* Datos del retiro */}
        {movementKind === "consumir" && (
          <RetiroNfcBox nfc={retiroNfc} onClear={() => { retiroNfc.clear(); setRetiradoPor(""); }} materialIds={cart.map((item) => item.material_id || item.materialId).filter(Boolean)} />
        )}
        <div style={{ display: "grid", gridTemplateColumns: movementKind === "consumir" ? "1fr 1fr" : "1fr", gap: 8 }}>
          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <input value={retiradoPor} onChange={(event) => setRetiradoPor(event.target.value)} placeholder="Nombre y apellido de quien retira" style={{ ...inp, borderColor: retiradoError && retiradoPor.trim() ? C.redB : C.border }} />
            {retiradoError && <span style={{ color: C.violet, fontSize: 10.5, lineHeight: 1.3 }}>Obligatorio: nombre y apellido.</span>}
            {!retiradoError && !retiroNfc.empleado && <span style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.3 }}>La tarjeta es opcional por ahora: con nombre y apellido alcanza.</span>}
          </label>
          {movementKind === "consumir" && <input value={sectorDestino} onChange={(event) => setSectorDestino(event.target.value)} placeholder="Sector / uso" style={inp} />}
        </div>
        <input value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Observación (obligatoria si algo sale sin obra)" style={inp} />
        </>)}
      </div>

      {/* Footer */}
      <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={() => { setCart([]); resetEgresoDisplay(); }} disabled={saving} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 11, padding: "11px 14px", cursor: saving ? "default" : "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: C.sans }}>
          Vaciar
        </button>
        <button type="button" onClick={submitBatch} disabled={disabled} className={disabled ? "ui-btn" : movementKind === "transferir" ? "ui-btn ui-btn-primario" : "ui-btn"} style={{ flex: 1, border: disabled ? undefined : movementKind === "transferir" ? undefined : `1px solid ${C.greenB}`, background: disabled ? undefined : movementKind === "transferir" ? undefined : C.green, color: disabled ? undefined : movementKind === "transferir" ? undefined : "var(--inverse-text)", borderRadius: 11, padding: "12px 14px", fontSize: 13.5, fontWeight: 700 }}>
          {movementKind === "transferir" ? <RefreshCw size={16} /> : <ArrowUpRight size={16} />}
          {saving ? "Registrando…" : movementKind === "transferir" ? `Asignar todo (${cart.length})` : `Confirmar egreso (${cart.length})`}
        </button>
      </div>
    </div>
  );
}

export default function StockWmsPanel({ sedeLocked = null, isMobile = false, toast, mode = "stock", canReceive = true, canCreateCatalog = false, canSeePrices = true, initialFObra = "todas", initialScope = "todos", initialQuery = "", initialMaterialId = "", onOpenCatalog, onReceiveStock, onRegisterPendingProduct, onRequestReplenishment, onStockChange, stockMaster = false, tableWorkspace = false, showCatalogInventory = false, sharedRows = null, sharedObras = null, sharedTransitRows = null, sharedReplenishmentCatalog = null, sharedLoading = false, faltaObras = null, onOpenFaltas }) {
  const searchInputRef = useRef(null);
  const productListRef = useRef(null);
  const navegar = useNavigate();
  // El maestro arranca en la botonera (bandejas y obras), como el mostrador.
  // Si viene con un producto, una búsqueda o una bandeja puntual, va directo.
  const [inicio, setInicio] = useState(() => stockMaster && !initialQuery && !initialMaterialId && initialScope !== "reconciliar");
  const loadMoreRef = useRef(null);
  const [rows, setRows] = useState(() => Array.isArray(sharedRows) ? sharedRows : []);
  const [catalogRows, setCatalogRows] = useState([]);
  const [transitRows, setTransitRows] = useState(() => Array.isArray(sharedTransitRows) ? sharedTransitRows : []);
  const [replenishmentCatalog, setReplenishmentCatalog] = useState(() => Array.isArray(sharedReplenishmentCatalog) ? sharedReplenishmentCatalog : []);
  const [obras, setObras] = useState(() => Array.isArray(sharedObras) ? sharedObras : []);
  const [cierresByObra, setCierresByObra] = useState(() => new Map());
  const [loading, setLoading] = useState(() => sharedLoading || !Array.isArray(sharedRows));
  const [q, setQ] = useState(initialQuery || "");
  const [focusedMaterialId, setFocusedMaterialId] = useState(initialMaterialId || "");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [fSede, setFSede] = useState(sedeLocked || "todas");
  const [fObra, setFObra] = useState(initialFObra);
  const [fCategoria, setFCategoria] = useState("todos");
  const [fProveedor, setFProveedor] = useState("todos");
  const [kindScope, setKindScope] = useState("todos");
  const [scope, setScope] = useState(stockMaster && initialScope === "todos" ? "existencia" : tableWorkspace && initialFObra !== "todas" && initialScope === "todos" ? "con_saldo" : initialScope);
  const [verifScope, setVerifScope] = useState("todos");
  const [verArchivados, setVerArchivados] = useState(false);
  const [orderBy, setOrderBy] = useState(showCatalogInventory || stockMaster ? "estado" : "default");
  const [renderLimit, setRenderLimit] = useState(PRODUCT_RENDER_BATCH);
  const [minimumListOrder, setMinimumListOrder] = useState(null);
  const [minimumDrafts, setMinimumDrafts] = useState({});
  const [savingMinimums, setSavingMinimums] = useState(false);
  const minimumSavingRef = useRef(false);
  const changeMinimumDraft = useCallback((group, text) => {
    const id = group.material?.id;
    if (!id) return;
    const value = text.trim() === "" ? null : qty(text, NaN);
    const current = group.stockMinimo == null ? null : qty(group.stockMinimo, 0);
    const valid = value === null || (Number.isFinite(value) && value >= 0);
    setMinimumDrafts((prev) => {
      const next = { ...prev };
      if (valid && value === current) delete next[id];
      else next[id] = { group, text, value, valid };
      return next;
    });
  }, []);
  // En el celular la tabla (más de 1.000 px) obliga a scrollear de costado:
  // arranca en tarjetas, que entran enteras.
  const [stockView, setStockView] = useState(() => {
    if (!(stockMaster || tableWorkspace)) return readStoredStockView();
    return typeof window !== "undefined" && window.innerWidth < 760 ? "tarjetas" : "lista";
  });
  const [egresoView, setEgresoView] = useState(() => readStoredEgresoView());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [catalogMatches, setCatalogMatches] = useState([]);
  const [creating, setCreating] = useState(false);
  const [draftGroup, setDraftGroup] = useState(null);
  const stockManagement = stockMaster || showCatalogInventory || tableWorkspace;
  const streamlinedToolbar = stockMaster || tableWorkspace;
  const obraScoped = fObra !== "todas";
  const canArchiveMatrix = canReceive && (stockMaster || obraScoped);
  // Carrito PERSISTENTE (localStorage): si estás egresando y surge otra cosa,
  // el carrito queda guardado y te espera — sobrevive recargas y cambios de pantalla.
  // Se limpia solo al confirmar el movimiento o al tocar "Vaciar".
  const [cart, setCart] = useState(() => {
    try {
      const raw = window.localStorage.getItem(PANOL_CART_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeStoredCartItem) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try {
      if (cart.length) window.localStorage.setItem(PANOL_CART_STORAGE_KEY, JSON.stringify(cart));
      else window.localStorage.removeItem(PANOL_CART_STORAGE_KEY);
    } catch { /* almacenamiento lleno o bloqueado: seguimos sin persistir */ }
  }, [cart]);
  // Un carrito puede haber quedado guardado antes de que cargara la metadata
  // requisito -> productos. Al hidratarlo con el stock actual evitamos que un
  // renglon viejo llegue al RPC sin selector ni producto concreto.
  useEffect(() => {
    setCart((current) => refreshCartRequirementMetadata(current, rows));
  }, [rows]);
  const [cartOpen, setCartOpen] = useState(false); // drawer flotante (modos stock/por obra)
  // Carritos GUARDADOS con nombre (además del actual): para pausar un egreso a
  // medio armar cuando surge otra cosa, y retomarlo después.
  const [savedCarts, setSavedCarts] = useState(() => {
    try {
      const raw = window.localStorage.getItem("klasea:panol-carritos-guardados");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.map((saved) => ({ ...saved, items: Array.isArray(saved?.items) ? saved.items.map(normalizeStoredCartItem) : [] }))
        : [];
    } catch { return []; }
  });
  useEffect(() => {
    try {
      if (savedCarts.length) window.localStorage.setItem("klasea:panol-carritos-guardados", JSON.stringify(savedCarts));
      else window.localStorage.removeItem("klasea:panol-carritos-guardados");
    } catch { /* almacenamiento bloqueado: seguimos sin persistir */ }
  }, [savedCarts]);
  const cartGroupKeys = useMemo(() => new Set(cart.map((it) => it.groupKey)), [cart]);
  const cartGroupQuantity = useMemo(() => {
    const map = new Map();
    for (const item of cart) map.set(item.groupKey, (map.get(item.groupKey) || 0) + qty(item.cantidad, 0));
    return map;
  }, [cart]);

  // Agregado rápido al carrito: suma una unidad desde la ubicación principal.
  // El drawer no se abre solo para que se puedan seleccionar varios productos
  // sin que un overlay interrumpa la lista.
  // useCallback: identidad estable para que las tarjetas memoizadas no se
  // re-rendericen todas en cada cambio de estado del panel.
  const quickAddToCart = useCallback((group) => {
    if (!canReceive) return;
    const loc = (group.locations || []).find((l) => l.available > 0.0001);
    if (!loc) {
      toast?.warning?.(`${group.label}: no hay stock recibido para egresar.`);
      return;
    }
    const item = makeCartItem(group, loc, {
      cantidad: Math.min(1, loc.available),
      sede: sedeLocked || loc.sede,
      codigo: group.codigo,
      unidad: group.unidad,
    });
    const currentQty = qty(cart.find((row) => row.key === item.key)?.cantidad, 0);
    if (currentQty >= item.available - 0.0001) {
      toast?.warning?.(`${group.label}: ya agregaste todo el stock disponible.`);
      return;
    }
    setCart((prev) => {
      const exists = prev.find((row) => row.key === item.key);
      if (!exists) return [...prev, item];
      return prev.map((row) => row.key === item.key
        ? { ...row, cantidad: String(Math.min(qty(row.cantidad, 0) + 1, item.available)) }
        : row);
    });
    toast?.success?.(`+1 ${group.label} al carrito`);
  }, [canReceive, cart, sedeLocked, toast]);

  const primaryActionFor = useCallback((group) => {
    if (!stockMaster && !tableWorkspace) return null;
    const hasStock = Number(group?.total || 0) > 0.0001;
    const shouldReceive = group?.buckets?.has("en_camino") && (scope === "en_camino" || !hasStock);
    const shouldReplenish = group?.buckets?.has("reponer") && (scope === "reponer" || (!hasStock && !shouldReceive));

    if (shouldReceive && onReceiveStock) {
      return {
        label: "Recibir",
        title: "Abrir los avisos pendientes de recepción",
        Icon: PackagePlus,
        tono: "azul",
        color: C.blue,
        border: C.blueB,
        background: C.blueL,
        onClick: () => onReceiveStock(group),
      };
    }
    if (shouldReplenish && onRequestReplenishment) {
      return {
        label: "Pedir reposición",
        title: "Crear un pedido interno de reposición",
        Icon: ShoppingCart,
        tono: "violeta",
        color: C.violet,
        border: C.violetB,
        background: C.violetL,
        onClick: () => onRequestReplenishment(group),
      };
    }
    if (hasStock && canReceive) {
      const inCartQty = cartGroupQuantity.get(group.key) || 0;
      return {
        label: inCartQty > 0 ? `+1 · ${fmtQty(inCartQty)} u` : "Agregar",
        title: inCartQty > 0 ? `${fmtQty(inCartQty)} ${group.unidad || "u"} en el carrito. Agregar una más` : "Agregar una unidad al carrito",
        Icon: ShoppingCart,
        compact: true,
        badge: inCartQty > 0 ? fmtQty(inCartQty) : "",
        tono: "verde",
        color: C.green,
        border: C.greenB,
        background: C.greenL,
        onClick: () => quickAddToCart(group),
      };
    }
    if (group?.buckets?.has("en_camino") && onReceiveStock) {
      return {
        label: "Recibir",
        Icon: PackagePlus,
        tono: "azul",
        color: C.blue,
        border: C.blueB,
        background: C.blueL,
        onClick: () => onReceiveStock(group),
      };
    }
    if (group?.buckets?.has("reponer") && onRequestReplenishment) {
      return {
        label: "Pedir reposición",
        Icon: ShoppingCart,
        tono: "violeta",
        color: C.violet,
        border: C.violetB,
        background: C.violetL,
        onClick: () => onRequestReplenishment(group),
      };
    }
    return null;
  }, [canReceive, cartGroupQuantity, onReceiveStock, onRequestReplenishment, quickAddToCart, scope, stockMaster, tableWorkspace]);

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
    if (typeof window !== "undefined") window.localStorage.setItem(STOCK_VIEW_STORAGE_KEY, stockView);
  }, [stockView]);

  useEffect(() => {
    setFObra(initialFObra || "todas");
  }, [initialFObra]);

  useEffect(() => {
    setQ(initialQuery || "");
    setFocusedMaterialId(initialMaterialId || "");
  }, [initialMaterialId, initialQuery]);

  // Refresh SILENCIOSO: el spinner de "Cargando" solo aparece la primera vez.
  // Los refresh posteriores (tras un egreso/asignación) actualizan los datos por
  // detrás sin blanquear la pantalla — se siente instantáneo.
  const hasLoadedRef = useRef(false);
  const cargar = useCallback(async ({ force = false } = {}) => {
    // StockPanolScreen ya carga el ledger para sus KPIs, movimientos y vista por
    // obra. Reutilizar ese snapshot evita pedir e hidratar miles de filas otra
    // vez al entrar a Stock maestro o a una obra.
    if (!force && sharedLoading) {
      if (!hasLoadedRef.current) setLoading(true);
      return;
    }
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const sede = sedeLocked || (fSede !== "todas" ? fSede : null);
      const useSharedSnapshot = !force && Array.isArray(sharedRows) && Array.isArray(sharedObras);
      const [stockRows, obraRows, catalog, pendingRows, replenishRows, cierresMap] = await Promise.all([
        useSharedSnapshot ? Promise.resolve(sharedRows) : fetchMaterialesEgreso({ sede, estados: LEDGER_STATES }),
        useSharedSnapshot ? Promise.resolve(sharedObras) : fetchObrasEgreso().catch(() => []),
        // El maestro sólo muestra el código principal. Los códigos alternativos
        // siguen cargándose en recepción/escaneo, donde sí son necesarios.
        showCatalogInventory ? fetchPanolCatalogFull({ includeAdditionalBarcodes: false }).catch(() => []) : Promise.resolve([]),
        Array.isArray(sharedTransitRows) ? Promise.resolve(sharedTransitRows) : Promise.resolve([]),
        Array.isArray(sharedReplenishmentCatalog) ? Promise.resolve(sharedReplenishmentCatalog) : Promise.resolve([]),
        fetchCierresAbiertosPorObra().catch(() => new Map()),
      ]);
      setRows(stockRows);
      setObras(obraRows);
      setCatalogRows(catalog);
      setTransitRows(pendingRows);
      setReplenishmentCatalog(replenishRows);
      setCierresByObra(cierresMap);
      hasLoadedRef.current = true;
    } catch (error) {
      toast.error(error.message || "No se pudo cargar el stock.");
    } finally {
      setLoading(false);
    }
  }, [fSede, sedeLocked, sharedLoading, sharedObras, sharedReplenishmentCatalog, sharedRows, sharedTransitRows, showCatalogInventory, toast]);

  const refreshAfterMovement = useCallback(async () => {
    // La vista por obra, sus contadores y Movimientos viven en el componente
    // padre. Refrescar sólo este panel deja allí el ledger anterior.
    await Promise.all([cargar({ force: true }), onStockChange?.()]);
  }, [cargar, onStockChange]);

  useEffect(() => { cargar(); }, [cargar]);

  const inventoryRows = useMemo(
    () => stockMaster ? [...rows, ...transitRows] : rows,
    [rows, stockMaster, transitRows],
  );

  const baseFilteredRows = useMemo(() => {
    const term = norm(q);
    let filtered = inventoryRows;
    if (focusedMaterialId) {
      filtered = filtered.filter((row) => row.material_id === focusedMaterialId || row.requisito_material_id === focusedMaterialId);
    }
    if (term) {
      filtered = filtered.filter((row) => materialMatchScore({
        ...row,
        notas: [row.notas, row.stock_nota, row.egreso_nota, row.sector_destino].filter(Boolean).join(" "),
      }, q) >= 42 || rowSearchText(row).includes(term));
    }
    if (fSede !== "todas") filtered = filtered.filter((row) => norm(rowSede(row)) === norm(fSede));
    if (fObra !== "todas") filtered = filtered.filter((row) => rowMatchesObraFilter(row, fObra));
    if (fCategoria !== "todos") filtered = filtered.filter((row) => categoryLabel(row) === fCategoria);
    return filtered;
  }, [inventoryRows, q, fObra, fCategoria, fSede, focusedMaterialId]);

  // La agrupación del maestro es la parte más costosa con cientos de filas.
  // Se calcula una sola vez para el alcance "Todos" y se reutiliza tanto en
  // los contadores como en la lista, en lugar de recorrer el ledger dos veces.
  const allKindGroups = useMemo(() => buildProductGroups(baseFilteredRows, fObra), [baseFilteredRows, fObra]);
  const kindCounts = useMemo(() => {
    const groups = fProveedor === "todos"
      ? allKindGroups
      : allKindGroups.filter((group) => norm(group.proveedor) === norm(fProveedor));
    return {
      todos: groups.length,
      stock: groups.filter((group) => group.tipoPedido === "stock").length,
      estandar: groups.filter((group) => group.tipoPedido === "estandar").length,
      adicional: groups.filter((group) => group.tipoPedido === "adicional").length,
    };
  }, [allKindGroups, fProveedor]);

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

  const categoriaOptions = useMemo(() => filterOptions(inventoryRows, categoryLabel), [inventoryRows]);
  const proveedorOptions = useMemo(
    () => filterOptions([...inventoryRows, ...replenishmentCatalog, ...catalogRows], providerLabel),
    [catalogRows, inventoryRows, replenishmentCatalog],
  );
  const scanRows = useMemo(() => {
    let filtered = rows;
    if (fObra !== "todas") filtered = filtered.filter((row) => rowMatchesObraFilter(row, fObra));
    if (fCategoria !== "todos") filtered = filtered.filter((row) => categoryLabel(row) === fCategoria);
    if (kindScope === "stock") filtered = filtered.filter((row) => rowTipoPedido(row) === "stock");
    if (kindScope === "estandar") filtered = filtered.filter((row) => rowTipoPedido(row) === "estandar");
    if (kindScope === "adicional") filtered = filtered.filter((row) => rowTipoPedido(row) === "adicional");
    return filtered;
  }, [rows, fObra, fCategoria, kindScope]);
  const scanGroups = useMemo(
    () => buildProductGroups(scanRows, fObra).filter((group) => fProveedor === "todos" || norm(group.proveedor) === norm(fProveedor)),
    [fObra, fProveedor, scanRows],
  );

  const productGroupsBase = useMemo(() => {
    const stockGroups = (kindScope === "todos" ? allKindGroups : buildProductGroups(searchedRows, fObra))
      .filter((group) => fProveedor === "todos" || norm(group.proveedor) === norm(fProveedor));
    if (stockMaster) {
      const stockedIds = new Set(stockGroups.map((group) => group.material?.id).filter(Boolean));
      const term = norm(q);
      const policyOnly = (fObra === "todas" && ["todos", "stock"].includes(kindScope) ? replenishmentCatalog : [])
        .filter((material) => !stockedIds.has(material.id))
        .filter((material) => !focusedMaterialId || material.id === focusedMaterialId)
        .filter((material) => !term || materialMatchScore(material, q) >= 42)
        .filter(() => fCategoria === "todos")
        .filter((material) => fProveedor === "todos" || norm(providerLabel(material)) === norm(fProveedor))
        .map((material) => {
          const group = emptyCatalogGroup(material, sedeLocked || (fSede !== "todas" ? fSede : "Pampa"));
          group.catalogOnly = false;
          group.replenishmentOnly = true;
          group.tipoPedido = "stock";
          return group;
        });
      return [...stockGroups, ...policyOnly]
        .map((group) => ({ ...group, ...groupOperationalBuckets(group) }))
        .filter((group) => group.buckets.size > 0 || (focusedMaterialId && group.material?.id === focusedMaterialId));
    }
    if (!showCatalogInventory || fObra !== "todas" || !["todos", "stock"].includes(kindScope)) return stockGroups;
    const stockedIds = new Set(stockGroups.map((group) => group.material?.id).filter(Boolean));
    const term = norm(q);
    const categoryById = new Map();
    rows.forEach((row) => {
      const category = categoryLabel(row);
      if (row.categoria_id && category) categoryById.set(row.categoria_id, category);
    });
    const catalogOnly = catalogRows
      .filter((material) => !stockedIds.has(material.id))
      .filter((material) => !term || materialMatchScore(material, q) >= 42)
      .filter((material) => fProveedor === "todos" || norm(providerLabel(material)) === norm(fProveedor))
      .map((material) => {
        const group = emptyCatalogGroup(material, sedeLocked || (fSede !== "todas" ? fSede : "Pampa"));
        const category = categoryById.get(material.categoria_id) || "";
        group.tipoPedido = "stock";
        group.categorias = new Set(category ? [category] : []);
        return group;
      })
      .filter((group) => fCategoria === "todos" || group.categorias.has(fCategoria));
    return [...stockGroups, ...catalogOnly];
  }, [allKindGroups, catalogRows, fCategoria, fObra, fProveedor, fSede, focusedMaterialId, kindScope, q, replenishmentCatalog, rows, searchedRows, sedeLocked, showCatalogInventory, stockMaster]);
  const obraViewCounts = useMemo(() => {
    const groups = verArchivados ? productGroupsBase : productGroupsBase.filter((group) => !esMatrizArchivada(group));
    return {
      con_saldo: groups.filter((group) => group.total > 0.0001).length,
      egresados: groups.filter((group) => group.egresado).length,
      negativos: groups.filter((group) => group.negativo).length,
      todos: groups.length,
    };
  }, [productGroupsBase, verArchivados]);
  const stockLevelCounts = useMemo(() => {
    const counts = { critico: 0, alerta: 0, ok: 0, sin_minimo: 0 };
    productGroupsBase.forEach((group) => { counts[stockLevel(group).key] += 1; });
    return counts;
  }, [productGroupsBase]);
  // Cuántos van y cuántos faltan de la revisión, sobre lo que hay cargado.
  const verifCounts = useMemo(() => {
    const counts = { todos: productGroupsBase.length, pendiente: 0, ok: 0, problema: 0, sin_datos: 0 };
    productGroupsBase.forEach((group) => {
      counts[group.verificacion === "ok" ? "ok" : group.verificacion === "problema" ? "problema" : "pendiente"] += 1;
      if (!group.ubicacion || !group.codigo) counts.sin_datos += 1;
    });
    return counts;
  }, [productGroupsBase]);

  const archivarMatriz = useCallback(async (group) => {
    const materialId = group?.material?.id;
    if (!materialId) {
      toast?.warning?.("Este renglón no está vinculado al catálogo.");
      return;
    }
    try {
      // Se reusa la revisión que ya existe en vez de inventar un estado nuevo:
      // archivar ES el resultado de revisarlo y confirmar que no es stock.
      await verificarMaterial(materialId, "ok", {
        nota: "Requisito de matriz: no es un producto físico del pañol.",
      });
      toast?.success?.("Archivado. Sale de la lista operativa.");
      await cargar({ force: true });
    } catch (error) {
      toast?.error?.(error.message || "No se pudo archivar.");
    }
  }, [cargar, toast]);

  const matrizArchivadas = useMemo(
    () => productGroupsBase.filter(esMatrizArchivada).length,
    [productGroupsBase],
  );

  // Los que todavía ensucian la lista. Van a seguir apareciendo a medida que se
  // carguen matrices nuevas, así que hacerlo de a uno no escala.
  const matrizPendientes = useMemo(
    () => productGroupsBase.filter((group) => group.esRequisito === true && group.verificacion !== "ok" && group.material?.id),
    [productGroupsBase],
  );

  const [archivandoLote, setArchivandoLote] = useState(false);
  const archivarTodaLaMatriz = useCallback(async () => {
    if (!matrizPendientes.length || archivandoLote) return;
    const total = matrizPendientes.length;
    if (!window.confirm(
      `¿Archivar ${total} requisito${total === 1 ? "" : "s"} de matriz?

`
      + "Salen de la lista operativa pero no se borran: siguen en el catálogo, en las "
      + "matrices de los modelos y en el historial. Se pueden volver a mostrar cuando quieras.",
    )) return;
    setArchivandoLote(true);
    let hechos = 0;
    const errores = [];
    try {
      // De a cinco: treinta y tres llamadas en paralelo es una forma rápida de
      // que la base empiece a rechazarlas.
      for (let i = 0; i < matrizPendientes.length; i += 5) {
        const tanda = matrizPendientes.slice(i, i + 5);
        const resultados = await Promise.allSettled(tanda.map((group) => verificarMaterial(group.material.id, "ok", {
          nota: "Requisito de matriz: no es un producto físico del pañol.",
        })));
        resultados.forEach((r, indice) => {
          if (r.status === "fulfilled") hechos += 1;
          else errores.push(tanda[indice].label);
        });
      }
      if (errores.length) {
        toast?.warning?.(`Archivé ${hechos} de ${total}. No pude con: ${errores.slice(0, 3).join(", ")}${errores.length > 3 ? "…" : ""}`);
      } else {
        toast?.success?.(`${hechos} requisito${hechos === 1 ? "" : "s"} archivado${hechos === 1 ? "" : "s"}. La lista queda con lo que se puede agarrar del estante.`);
      }
      await cargar({ force: true });
    } finally {
      setArchivandoLote(false);
    }
  }, [archivandoLote, cargar, matrizPendientes, toast]);

  const filteredProductGroups = useMemo(() => {
    const withDraft = draftGroup && norm(q) && norm(draftGroup.label).includes(norm(q))
      ? [draftGroup, ...productGroupsBase.filter((group) => group.key !== draftGroup.key)]
      : productGroupsBase;
    // La revisión es una dimensión aparte del nivel de stock: se puede querer
    // "lo crítico que además nadie revisó", así que se aplica encima.
    const conVerif = verifScope === "todos" ? withDraft : withDraft.filter((group) => {
      if (verifScope === "sin_datos") return !group.ubicacion || !group.codigo;
      const estado = group.verificacion === "ok" || group.verificacion === "problema" ? group.verificacion : "pendiente";
      return estado === verifScope;
    });
    // Se ocultan solo cuando no hay un filtro de revision puesto: si alguien
    // pide ver "Revisados", los archivados son justamente lo que busca.
    const base = (stockMaster || obraScoped) && !verArchivados && verifScope === "todos"
      ? conVerif.filter((group) => !esMatrizArchivada(group))
      : conVerif;
    // Un producto abierto puntualmente (por ejemplo "Ver producto" desde el
    // conteo) se muestra aunque no entre en la bandeja: un faltante del conteo
    // suele quedar en 0 y "Con stock" lo escondía.
    if (stockMaster && !focusedMaterialId && ["existencia", "reponer", "en_camino", "sin_ubicacion", "reconciliar", "sobrante"].includes(scope)) {
      return sortProductGroups(base.filter((group) => group.buckets?.has(scope)), orderBy);
    }
    if (tableWorkspace && scope === "con_saldo") return sortProductGroups(base.filter((group) => group.total > 0.0001), orderBy);
    if (tableWorkspace && scope === "egresados") return sortProductGroups(base.filter((group) => group.egresado), orderBy);
    if (scope === "sin_ubicacion") return sortProductGroups(base.filter((group) => !group.ubicacion), orderBy);
    if (scope === "negativos") {
      const negatives = base.filter((group) => group.negativo || (stockMaster && group.needsConcreteProduct));
      if (draftGroup && selectedKey === draftGroup.key && !negatives.some((group) => group.key === draftGroup.key)) {
        return [draftGroup, ...sortProductGroups(negatives, orderBy)];
      }
      return sortProductGroups(negatives, orderBy);
    }
    if (["critico", "alerta", "ok", "sin_minimo"].includes(scope)) {
      return sortProductGroups(base.filter((group) => stockLevel(group).key === scope), orderBy);
    }
    return sortProductGroups(base, orderBy);
  }, [draftGroup, focusedMaterialId, obraScoped, orderBy, productGroupsBase, q, scope, selectedKey, stockMaster, tableWorkspace, verArchivados, verifScope]);

  const minimumFilterKey = JSON.stringify([fCategoria, fObra, fProveedor, fSede, kindScope, orderBy, q, scope, stockView, verArchivados, verifScope, selectedKey]);
  useEffect(() => { setMinimumListOrder(null); }, [minimumFilterKey]);
  const productGroups = useMemo(() => {
    if (minimumListOrder?.filterKey !== minimumFilterKey) return filteredProductGroups;
    // Guardar un mínimo cambia el nivel de stock, pero no debe mover la fila
    // que se está editando ni quitarla del filtro «Sin mínimo» a mitad de carga.
    // El orden y los filtros se vuelven a aplicar al cambiar de vista o filtro.
    const byKey = new Map([...productGroupsBase, ...filteredProductGroups].map((group) => [group.key, group]));
    const pinned = new Set(minimumListOrder.keys);
    return [
      ...minimumListOrder.keys.map((key) => byKey.get(key)).filter(Boolean),
      ...filteredProductGroups.filter((group) => !pinned.has(group.key)),
    ];
  }, [filteredProductGroups, minimumFilterKey, minimumListOrder, productGroupsBase]);

  // Renderizar cientos de tarjetas a la vez bloqueaba el hilo principal varios
  // segundos. Los cálculos y contadores siguen usando el conjunto completo;
  // sólo el DOM se entrega en bloques para que la pantalla responda enseguida.
  const renderedProductGroups = useMemo(
    () => productGroups.slice(0, renderLimit),
    [productGroups, renderLimit],
  );
  const hiddenProductCount = Math.max(0, productGroups.length - renderedProductGroups.length);

  useEffect(() => {
    setRenderLimit(PRODUCT_RENDER_BATCH);
  }, [fCategoria, fObra, fProveedor, fSede, kindScope, orderBy, q, scope, stockView, verArchivados, verifScope]);

  // La lista se entrega en tandas para no congelar la pantalla, pero cargar la
  // tanda siguiente no debe depender de que alguien descubra un botón al final.
  // Al acercarse al pie se amplía sola; el botón queda además como respaldo.
  useEffect(() => {
    const target = loadMoreRef.current;
    const root = productListRef.current;
    if (!target || !root || hiddenProductCount <= 0 || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setRenderLimit((current) => Math.min(current + PRODUCT_RENDER_BATCH, productGroups.length));
    }, { root, rootMargin: "280px 0px", threshold: 0.01 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hiddenProductCount, productGroups.length]);

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
    if (!focusedMaterialId || selectedKey || !productGroups.length) return;
    const focused = productGroups.find((group) => group.material?.id === focusedMaterialId || group.rows?.some((row) => row.material_id === focusedMaterialId || row.requisito_material_id === focusedMaterialId));
    if (focused) setSelectedKey(focused.key);
  }, [focusedMaterialId, productGroups, selectedKey]);

  useEffect(() => {
    // Solo resetear si los datos ya cargaron, para que initialFObra no se pierda antes de que lleguen las rows
    if (fObra !== "todas" && rows.length > 0 && !obraOptions.some(([key]) => key === fObra)) setFObra("todas");
  }, [fObra, obraOptions, rows]);

  useEffect(() => {
    if (fCategoria !== "todos" && !categoriaOptions.some(([key]) => key === fCategoria)) setFCategoria("todos");
  }, [fCategoria, categoriaOptions]);

  useEffect(() => {
    if (fProveedor !== "todos" && !proveedorOptions.some(([key]) => key === fProveedor)) setFProveedor("todos");
  }, [fProveedor, proveedorOptions]);

  useEffect(() => {
    let alive = true;
    const term = q.trim();
    if (stockMaster || term.length < 2) {
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
  }, [q, productGroupsBase, stockMaster]);

  const obrasBotonera = useMemo(() => {
    if (!stockMaster) return [];
    const nombres = new Map(obraOptions);
    const porObra = new Map();
    for (const group of allKindGroups) {
      for (const loc of group.locations || []) {
        if (!loc.obraId || !(loc.available > 0.0001)) continue;
        const key = obraScopeKey(loc.obraId);
        const actual = porObra.get(key) || { productos: new Set(), terminada: false };
        actual.productos.add(group.key);
        if (loc.obraEstado === "terminada") actual.terminada = true;
        porObra.set(key, actual);
      }
    }
    return [...porObra.entries()]
      .map(([key, dato]) => ({ key, label: nombres.get(key) || "Obra", productos: dato.productos.size, terminada: dato.terminada }))
      .sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true }));
  }, [allKindGroups, obraOptions, stockMaster]);

  const kpis = useMemo(() => {
    if (stockMaster) {
      // Las bandejas cuentan lo mismo que muestra la lista: sin los requisitos
      // de matriz archivados (salvo que se pidan ver).
      const visibles = verArchivados ? productGroupsBase : productGroupsBase.filter((group) => !esMatrizArchivada(group));
      const count = (bucket) => visibles.filter((group) => group.buckets?.has(bucket)).length;
      return {
        productos: count("existencia"),
        unidades: fmtQty(productGroupsBase.reduce((sum, group) => sum + Math.max(0, group.total || 0), 0)),
        negativos: count("reconciliar"),
        sinUbicacion: count("sin_ubicacion"),
        transito: fmtQty(productGroupsBase.filter((group) => group.buckets?.has("en_camino")).reduce((sum, group) => sum + group.transitQty, 0)),
        reponer: count("reponer"),
        sobrantes: count("sobrante"),
        enCamino: count("en_camino"),
        valorUsd: fmtQty(productGroupsBase.reduce((sum, group) => sum + Math.max(0, group.valueUsd || 0), 0)),
        hoy: 0,
      };
    }
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
  }, [fObra, productGroupsBase, rows, stockMaster, verArchivados]);

  async function createFromSearch() {
    const desc = q.trim();
    if (!desc) return;
    if (!canCreateCatalog) {
      toast.warning("Solo un administrador puede crear materiales nuevos desde egresos.");
      return;
    }
    const catalog = catalogRows.length ? catalogRows : await fetchPanolCatalogFull();
    const candidates = topMaterialMatches(catalog, desc, 6, 42);
    const strong = candidates.find((material) => materialMatchIsStrong(material._score));
    if (strong) {
      selectCatalogMaterial(strong);
      toast.warning(`Ya existe un producto compatible: "${strong.descripcion}". Lo seleccione para evitar un duplicado.`);
      return;
    }
    if (candidates.length) {
      const list = candidates.slice(0, 4).map((material) => `- ${material.descripcion}`).join("\n");
      const shouldCreate = window.confirm(`Hay productos parecidos en el catalogo:\n\n${list}\n\n¿Crear igualmente "${desc}"?`);
      if (!shouldCreate) return;
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

  const saveStockMinimum = useCallback(async (group, value, { silent = false } = {}) => {
    const materialId = group?.material?.id;
    try {
      await actualizarStockMinimoPanol(materialId, value);
      const list = productListRef.current;
      const top = list?.scrollTop;
      const left = list?.scrollLeft;
      setMinimumListOrder({ filterKey: minimumFilterKey, keys: productGroups.map((item) => item.key) });
      setRows((prev) => prev.map((row) => row.material_id === materialId ? { ...row, stock_minimo: value } : row));
      setCatalogRows((prev) => prev.map((material) => material.id === materialId ? { ...material, stock_minimo: value } : material));
      setReplenishmentCatalog((prev) => prev.map((material) => material.id === materialId ? { ...material, stock_minimo: value } : material));
      setMinimumDrafts((prev) => {
        if (prev[materialId]?.value !== value) return prev;
        const next = { ...prev };
        delete next[materialId];
        return next;
      });
      requestAnimationFrame(() => {
        if (list?.isConnected) { list.scrollTop = top; list.scrollLeft = left; }
      });
      if (!silent) toast?.success?.(value == null ? "Stock mínimo quitado." : `Stock mínimo guardado: ${fmtQty(value)} ${group.unidad || "u"}.`);
    } catch (error) {
      if (!silent) toast?.error?.(error.message || "No se pudo guardar el stock mínimo.");
      throw error;
    }
  }, [minimumFilterKey, productGroups, toast]);

  const saveSingleMinimum = useCallback(async (group, value) => {
    if (minimumSavingRef.current) return;
    minimumSavingRef.current = true;
    setSavingMinimums(true);
    try { await saveStockMinimum(group, value); }
    finally { minimumSavingRef.current = false; setSavingMinimums(false); }
  }, [saveStockMinimum]);

  const pendingMinimums = Object.values(minimumDrafts);
  const invalidMinimums = pendingMinimums.some((entry) => !entry.valid);
  async function saveAllMinimums() {
    if (minimumSavingRef.current || !pendingMinimums.length || invalidMinimums) return;
    minimumSavingRef.current = true;
    setSavingMinimums(true);
    let saved = 0;
    const failures = [];
    try {
      for (const entry of pendingMinimums) {
        try { await saveStockMinimum(entry.group, entry.value, { silent: true }); saved += 1; }
        catch (error) { failures.push(`${entry.group.label}: ${error.message || "No se pudo guardar"}`); }
      }
      if (failures.length) toast?.error?.(`${saved} guardados. ${failures.length} quedaron pendientes: ${failures.join("; ")}`);
      else toast?.success?.(`${saved} mínimos guardados.`);
    } finally {
      minimumSavingRef.current = false;
      setSavingMinimums(false);
    }
  }

  function selectCatalogMaterial(material) {
    const group = emptyCatalogGroup(material, defaultSede, kindScope === "adicional");
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
      if (mode === "egreso") toast?.warning?.("No está en stock. Podés identificarlo en el catálogo, pero primero hay que registrar su ingreso.");
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

  const defaultOrder = showCatalogInventory || stockMaster ? "estado" : "default";
  const advancedFilterCount = [
    verifScope !== "todos",
    orderBy !== defaultOrder,
    kindScope !== "todos",
    fObra !== initialFObra,
    fCategoria !== "todos",
    fProveedor !== "todos",
    !sedeLocked && fSede !== "todas",
  ].filter(Boolean).length;
  const compactStockTable = stockManagement && hasSelectedProduct;

  function clearAdvancedFilters() {
    setVerifScope("todos");
    setOrderBy(defaultOrder);
    setKindScope("todos");
    setFObra(initialFObra || "todas");
    setFCategoria("todos");
    setFProveedor("todos");
    if (!sedeLocked) setFSede("todas");
  }

  // Las bandejas de trabajo son pestañas de texto con su cuenta, como en
  // Pedidos y Remitos. Conteo de hoy y Falta para obras viven en sus pestañas
  // de arriba (con la cuenta al lado), así cada número se muestra una vez.
  const filtros = stockMaster ? [
    ["existencia", "Con stock", kpis.productos, ""],
    ["reponer", "Reponer", kpis.reponer || 0, "alerta"],
    ["sin_ubicacion", "Sin ubicación", kpis.sinUbicacion, "cian"],
    ["sobrante", "Sobrantes", kpis.sobrantes, "cian"],
    ["reconciliar", "Diferencias", kpis.negativos, "aviso"],
    ["en_camino", "En camino", kpis.enCamino, "azul"],
    ["todos", "Todos", obraViewCounts.todos, ""],
  ] : tableWorkspace ? [
    ["con_saldo", "Con saldo", obraViewCounts.con_saldo, ""],
    ["egresados", "Egresados", obraViewCounts.egresados, ""],
    ...(obraViewCounts.negativos ? [["negativos", "A reconciliar", obraViewCounts.negativos, "alerta"]] : []),
    ["todos", "Todos", obraViewCounts.todos, ""],
  ] : showCatalogInventory ? [
    ["todos", "Todos", productGroupsBase.length, ""],
    ["critico", "Críticos", stockLevelCounts.critico, "alerta"],
    ["alerta", "Bajos", stockLevelCounts.alerta, "aviso"],
    ["ok", "Correctos", stockLevelCounts.ok, ""],
    ["sin_minimo", "Sin mínimo", stockLevelCounts.sin_minimo, ""],
  ] : null;

  const vistaLista = stockManagement && stockView === "lista";
  const columnas = tableWorkspace ? (compactStockTable ? OBRA_ROW_COMPACT_COLS : OBRA_ROW_COLS) : (compactStockTable ? STOCK_ROW_COMPACT_COLS : STOCK_ROW_COLS);
  const anchoMinimo = tableWorkspace ? (compactStockTable ? OBRA_ROW_COMPACT_MIN : OBRA_ROW_MIN) : (compactStockTable ? STOCK_ROW_COMPACT_MIN : STOCK_ROW_MIN);
  const unidadesEnCarrito = cart.reduce((sum, item) => sum + qty(item.cantidad, 0), 0);
  const avanceRevision = verifCounts.todos ? {
    ok: Math.round((verifCounts.ok / verifCounts.todos) * 100),
    problema: Math.round((verifCounts.problema / verifCounts.todos) * 100),
  } : { ok: 0, problema: 0 };

  const panelFiltros = (!streamlinedToolbar || filtersOpen) ? (
          <div id="stock-advanced-filters" className="stk-avanzados">
            {!streamlinedToolbar && !showCatalogInventory && <SelectFilter label="Estado" value={scope} onChange={setScope} options={[
              ["todos", "Todos"],
              ["negativos", "A reconciliar"],
              ["sin_ubicacion", `Sin ubicación${kpis.sinUbicacion ? ` (${kpis.sinUbicacion})` : ""}`],
            ]} />}
            {stockManagement && (
              <SelectFilter label="Revisión" value={verifScope} onChange={setVerifScope} options={[
                ["todos", `Todos (${verifCounts.todos})`],
                ["pendiente", `Sin revisar (${verifCounts.pendiente})`],
                ["problema", `Con problema (${verifCounts.problema})`],
                ["ok", `Revisados (${verifCounts.ok})`],
                ["sin_datos", `Sin ubicación o código (${verifCounts.sin_datos})`],
              ]} />
            )}
            <SelectFilter label="Orden" value={orderBy} onChange={setOrderBy} options={[
              ...(stockManagement ? [...(!tableWorkspace ? [["estado", "Estado de stock"]] : []), ["sin_revisar", "Sin revisar primero"], ["alfabetico", "Alfabético"]] : []),
              ["default", tableWorkspace ? "Mayor saldo primero" : "Stock primero"],
              ["recientes", "Más recientes"],
            ]} />
            <SelectFilter label="Tipo" value={kindScope} onChange={setKindScope} options={[["todos", `Todos (${kindCounts.todos})`], ["stock", `Stock pañol (${kindCounts.stock})`], ["estandar", `Asignado a obra (${kindCounts.estandar})`], ["adicional", `Adicionales (${kindCounts.adicional})`]]} />
            <SelectFilter label="Obra" value={fObra} onChange={setFObra} options={obraOptions} />
            <SelectFilter label="Categoría" value={fCategoria} onChange={setFCategoria} options={categoriaOptions} />
            <SelectFilter label="Proveedor" value={fProveedor} onChange={setFProveedor} options={proveedorOptions} />
            {!sedeLocked && <SelectFilter label="Sede" value={fSede} onChange={setFSede} options={[["todas", "Todas"], ...SEDES_PANOL.map((sede) => [sede, sede])]} />}
            {streamlinedToolbar && advancedFilterCount > 0 && (
              <button type="button" className="stk-limpiar" onClick={clearAdvancedFilters}>Limpiar filtros</button>
            )}

            {/* El avance de la revisión contesta otra pregunta que el nivel de
                stock: va con los filtros, no en la bandeja. */}
            {stockManagement && verifCounts.todos > 0 && (
              <div className="stk-revision">
                <ShieldCheck size={14} style={{ color: "var(--blue)" }} aria-hidden="true" />
                <span className="stk-rotulo">Revisión</span>
                <span className="stk-revision-barra" aria-hidden="true">
                  <i className="is-ok" style={{ width: `${avanceRevision.ok}%` }} />
                  <i className="is-problema" style={{ width: `${avanceRevision.problema}%` }} />
                </span>
                <b>{fmtQty(verifCounts.ok + verifCounts.problema)} / {fmtQty(verifCounts.todos)}</b>
                {[
                  ["pendiente", `${fmtQty(verifCounts.pendiente)} sin revisar`, ""],
                  ["problema", `${fmtQty(verifCounts.problema)} con problema`, "rojo"],
                  ["ok", `${fmtQty(verifCounts.ok)} ok`, "verde"],
                ].map(([key, label, tono]) => (
                  <button key={key} type="button" className={`stk-pastilla${tono ? ` is-${tono}` : ""}${verifScope === key ? " is-activa" : ""}`} aria-pressed={verifScope === key} onClick={() => setVerifScope(verifScope === key ? "todos" : key)}>
                    <i aria-hidden="true" />{label}
                  </button>
                ))}
                {canArchiveMatrix && matrizPendientes.length > 0 && (
                  <button type="button" className="stk-pastilla is-violeta" onClick={archivarTodaLaMatriz} disabled={archivandoLote} title="Los requisitos de matriz no son piezas del estante. Archivarlos los saca de la lista sin borrarlos.">
                    <Archive size={12} aria-hidden="true" />{archivandoLote ? "Archivando…" : `Archivar ${matrizPendientes.length} de matriz`}
                  </button>
                )}
                {!obraScoped && matrizArchivadas > 0 && (
                  <button type="button" className={`stk-pastilla is-violeta${verArchivados ? " is-activa" : ""}`} aria-pressed={verArchivados} onClick={() => setVerArchivados((v) => !v)} title="Requisitos de matriz ya revisados. Están fuera de la lista para no confundirlos con productos.">
                    {matrizArchivadas} de matriz archivados
                  </button>
                )}
              </div>
            )}
          </div>
  ) : null;

  const estilos = (
    <>
      <style href="klasea-stock-mostrador" precedence="default">{CSS_MOSTRADOR}</style>
      <style href="klasea-stock-mostrador-panol" precedence="default">{CSS_PANOL}</style>
      <style href="klasea-panol-stock" precedence="default">{CSS_STOCK}</style>
    </>
  );

  // ── Stock maestro: mismo dibujo que el mostrador de egresos ──
  if (stockMaster) {
    const enInicio = inicio && !q.trim() && !focusedMaterialId;
    const bandejasMaestro = [
      ["existencia", "Con stock", kpis.productos, "productos en el pañol", ""],
      ["reponer", "Reponer", kpis.reponer || 0, "libre en su mínimo o menos", "rojo"],
      ["sin_ubicacion", "Sin ubicación", kpis.sinUbicacion, "para ubicar en el mapa", "cian"],
      ["reconciliar", "Diferencias", kpis.negativos, "a reconciliar", "violeta"],
      ["en_camino", "En camino", kpis.enCamino, "por recibir", "azul"],
      ["sobrante", "Sobrantes", kpis.sobrantes, "de obras terminadas", "cian"],
      ["todos", "Todo el stock", obraViewCounts.todos, "con y sin saldo", ""],
    ];
    const bandejaActual = bandejasMaestro.find(([key]) => key === scope);
    const obraActual = fObra !== "todas" ? (obraOptions.find(([key]) => key === fObra)?.[1] || "Obra") : "";
    const elegirBandeja = (key) => { setVerifScope("todos"); setScope(key); setInicio(false); };
    const elegirObra = (key) => { setFObra(key); setVerifScope("todos"); setScope("existencia"); setInicio(false); };
    const volverAlInicio = () => { setInicio(true); setFObra("todas"); setQ(""); setFocusedMaterialId(""); setSelectedKey(null); setScope("existencia"); };
    const titulo = q.trim()
      ? "Resultados"
      : focusedMaterialId ? "Producto" : (bandejaActual?.[1] || "Productos");
    const mostrarLista = !(isMobile && hasSelectedProduct);
    const carritoFirmar = canReceive && cart.length > 0;

    return (
      <div className={`stk-root mst mpn stk-mst${isMobile ? " is-angosto" : ""}`}>
        {estilos}
        <div className="mst-barra">
          <div className="mst-lector">
            <ScanBarcode size={20} className="mst-lector-icono" aria-hidden="true" />
            <input
              ref={searchInputRef}
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setFocusedMaterialId("");
                // Buscar desde la botonera mira todo el stock, no una bandeja.
                if (enInicio && event.target.value.trim()) setScope("todos");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  applyScanCode(q);
                }
              }}
              placeholder={isMobile ? "Código, nombre o ubicación" : "Pasá el código o buscá por nombre, código o ubicación"}
              aria-label="Código del lector o búsqueda"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            {q ? (
              <button type="button" className="mst-lector-limpiar" onClick={() => { setQ(""); setFocusedMaterialId(""); searchInputRef.current?.focus(); }} aria-label="Borrar la búsqueda">
                <X size={15} />
              </button>
            ) : !isMobile ? (
              <span className="mst-lector-estado" aria-hidden="true">
                <i />
                <span className="is-listo">Lector listo</span>
                <span className="is-perdido">Clic acá para escanear</span>
              </span>
            ) : null}
          </div>
          <div className="mst-estados">
            <button
              type="button"
              className={`mst-icono-btn stk-con-cuenta${filtersOpen || advancedFilterCount ? " is-activo" : ""}`}
              onClick={() => setFiltersOpen((value) => !value)}
              aria-expanded={filtersOpen}
              aria-controls="stock-advanced-filters"
              aria-label="Filtros"
              title="Filtros: revisión, orden, tipo, obra, categoría y proveedor"
            >
              <SlidersHorizontal size={16} />
              {advancedFilterCount > 0 && <span className="stk-num">{advancedFilterCount}</span>}
            </button>
            <button type="button" className="mst-icono-btn" onClick={() => setScannerOpen(true)} aria-label="Escanear con la cámara" title="Escanear con la cámara">
              <ScanLine size={16} />
            </button>
          </div>
          <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={(code) => { setScannerOpen(false); applyScanCode(code); }} />
        </div>

        <div className="mst-cuerpo">
          {mostrarLista && (
            <div ref={productListRef} className="mst-col mst-col-botonera">
              {panelFiltros && <div className="stk-filtros-mst">{panelFiltros}</div>}

              {enInicio ? (
                <>
                  <section aria-label="Bandejas de trabajo">
                    <div className="mst-titulo-seccion">¿Qué querés revisar?</div>
                    <div className="stk-bandejas-mst">
                      {bandejasMaestro.slice(0, 6).map(([key, label, count, sub, tono]) => (
                        <button key={key} type="button" className={`stk-bandeja${tono && count ? ` is-${tono}` : ""}`} onClick={() => elegirBandeja(key)}>
                          <span className="mst-num">{fmtQty(count)}</span>
                          <strong>{label}</strong>
                          <small>{sub}</small>
                        </button>
                      ))}
                      {faltaObras && onOpenFaltas && (
                        <button type="button" className={`stk-bandeja${faltaObras.productos ? " is-rojo" : ""}`} onClick={onOpenFaltas}>
                          <span className="mst-num">{fmtQty(faltaObras.productos)}</span>
                          <strong>Falta para obras</strong>
                          <small>{faltaObras.atrasados ? `${fmtQty(faltaObras.atrasados)} ya atrasados` : "no alcanza para las próximas"}</small>
                        </button>
                      )}
                      {bandejasMaestro.slice(6).map(([key, label, count, sub]) => (
                        <button key={key} type="button" className="stk-bandeja" onClick={() => elegirBandeja(key)}>
                          <span className="mst-num">{fmtQty(count)}</span>
                          <strong>{label}</strong>
                          <small>{sub}</small>
                        </button>
                      ))}
                    </div>
                  </section>
                  {obrasBotonera.length > 0 && (
                    <section aria-label="Stock de cada obra">
                      <div className="mst-titulo-seccion">O mirá lo de una obra</div>
                      <div className="mst-obras">
                        {obrasBotonera.map((obra) => (
                          <button key={obra.key} type="button" className="mst-obra mpn-obra-tile" onClick={() => elegirObra(obra.key)} style={obra.terminada ? { opacity: 0.75 } : undefined}>
                            <strong>{obra.label}</strong>
                            <span className="mpn-obra-cuenta">{obra.productos === 1 ? "1 producto" : `${fmtQty(obra.productos)} productos`}{obra.terminada ? " · obra terminada" : ""}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <>
                  <section aria-label="Bandejas">
                    <div className="mpn-riel" role="group" aria-label="Bandejas">
                      <button type="button" className="mpn-origen" onClick={volverAlInicio} aria-label="Volver a la botonera" title="Volver a la botonera">
                        <ArrowLeft size={15} aria-hidden="true" />{!isMobile && "Inicio"}
                      </button>
                      {obraActual && (
                        <button type="button" className="mpn-origen is-elegido" onClick={() => setFObra("todas")} title="Quitar el filtro de obra">
                          <strong>{obraActual}</strong><X size={13} aria-hidden="true" />
                        </button>
                      )}
                      {bandejasMaestro.map(([key, label, count, , tono]) => {
                        const activa = scope === key && verifScope === "todos" && !focusedMaterialId;
                        return (
                          <button key={key} type="button" className={`mpn-origen is-libre${activa ? " is-elegido" : ""}`} aria-pressed={activa} onClick={() => elegirBandeja(key)}>
                            <strong>{label}</strong>
                            <span className={`mst-num${tono && count && !activa ? ` stk-tono-${tono}` : ""}`}>{fmtQty(count)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section aria-label={titulo}>
                    <div className="mst-titulo-seccion">
                      {q.trim() ? <Search size={12} aria-hidden="true" /> : null}
                      {titulo} <span className="mst-num">{fmtQty(productGroups.length)}</span>
                      {obraActual ? <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>· en {obraActual}</span> : null}
                    </div>
                    {loading ? (
                      <Cargando texto="Cargando el stock…" />
                    ) : productGroups.length ? (
                      <>
                        <div className="mst-resultados">
                          {renderedProductGroups.map((group) => (
                            <FilaMaestro key={group.key} group={group} active={selectedKey === group.key} onOpen={setSelectedKey} primaryAction={primaryActionFor(group)} />
                          ))}
                        </div>
                        {hiddenProductCount > 0 && (
                          <div className="stk-mas">
                            <button ref={loadMoreRef} type="button" className="ui-btn" onClick={() => setRenderLimit((current) => Math.min(current + PRODUCT_RENDER_BATCH, productGroups.length))}>
                              Mostrar {Math.min(PRODUCT_RENDER_BATCH, hiddenProductCount)} más · quedan {fmtQty(hiddenProductCount)}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="mst-vacio">
                        {q.trim() ? `Nada coincide con «${q.trim()}» en esta bandeja.` : "No hay productos en esta bandeja."}
                        {q.trim() && scope !== "todos" && (
                          <div style={{ marginTop: 10 }}>
                            <button type="button" className="ui-btn" onClick={() => elegirBandeja("todos")}>Buscar en todo el stock</button>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          )}

          {hasSelectedProduct ? (
            <ProductDetail
              key={selectedGroup.key}
              group={selectedGroup}
              isMobile={isMobile}
              obras={obras}
              sedeLocked={sedeLocked}
              canReceive={canReceive}
              canCreateCatalog={canCreateCatalog}
              mode={mode}
              onDone={refreshAfterMovement}
              toast={toast}
              setSelectedKey={setSelectedKey}
              cart={cart}
              setCart={setCart}
              onOpenCatalog={onOpenCatalog}
              cierresByObra={cierresByObra}
              accion={primaryActionFor(selectedGroup)}
              minimo={canReceive ? { canEdit: !savingMinimums, onSave: saveSingleMinimum, draft: minimumDrafts[selectedGroup.material?.id], onDraftChange: changeMinimumDraft } : null}
            />
          ) : !isMobile ? (
            <aside className="mst-col mst-col-carrito" aria-label="Producto y carrito">
              <div className="mst-car-cab"><span className="mst-car-titulo">Producto</span></div>
              <div className="mst-car-lista">
                <div className="mst-car-vacio">
                  <strong>Todavía no elegiste nada</strong>
                  Pasá un producto por el lector o entrá a una bandeja. Acá vas a ver dónde está, cuánto hay en cada obra y qué hacer con él.
                </div>
              </div>
              {canReceive && (cart.length > 0 || savedCarts.length > 0) && (
                <div className="mst-car-pie">
                  <div className="mst-bloque-titulo">
                    Carrito <span className="mst-num">{cart.length}</span>
                    <button type="button" onClick={() => setCartOpen(true)}>Ver y editar</button>
                  </div>
                  {cart.slice(0, 4).map((item) => (
                    <div key={item.key} className="stk-car-fila">
                      <span className="mst-num">{fmtQty(item.cantidad)}</span>
                      <span>{item.label}</span>
                      <small className={item.obraId ? "mst-num" : undefined}>{item.locationLabel}</small>
                    </div>
                  ))}
                  {cart.length > 4 && <div className="stk-car-fila"><small>y {cart.length - 4} más</small></div>}
                  {cart.length ? (
                    <button type="button" className="mst-btn-grande" onClick={() => navegar("/egresos-panol")}>
                      Firmar en el mostrador
                    </button>
                  ) : (
                    <button type="button" className="ui-btn" onClick={() => setCartOpen(true)}>
                      {savedCarts.length === 1 ? "1 carrito pausado" : `${savedCarts.length} carritos pausados`}
                    </button>
                  )}
                </div>
              )}
            </aside>
          ) : null}
        </div>

        {isMobile && carritoFirmar && !hasSelectedProduct && (
          <div className="mst-barra-firmar">
            <button type="button" className="mst-btn-grande" onClick={() => navegar("/egresos-panol")}>
              Carrito · {cart.length} · firmar en el mostrador
            </button>
          </div>
        )}

        {canReceive && cartOpen && (cart.length > 0 || savedCarts.length > 0) && (
          <CartDrawer
            cart={cart}
            setCart={setCart}
            obras={obras}
            canReceive={canReceive}
            onDone={async () => { setCartOpen(false); await refreshAfterMovement(); }}
            toast={toast}
            isMobile={isMobile}
            onClose={() => setCartOpen(false)}
            savedCarts={savedCarts}
            setSavedCarts={setSavedCarts}
          />
        )}
      </div>
    );
  }

  return (
    <div className="stk-root mst mpn">
      {estilos}

      <div className="stk-barra">
        <div className="stk-barra-fila">
          <label className="stk-buscar">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchInputRef}
              value={q}
              aria-label={stockMaster ? "Buscar producto, código o ubicación" : "Escanear o buscar producto"}
              onChange={(event) => { setQ(event.target.value); setFocusedMaterialId(""); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  applyScanCode(q);
                }
              }}
              placeholder={stockMaster ? "Buscar producto, código o ubicación" : mode === "egreso" ? "Escanear o buscar código o producto" : "Buscar código, producto, obra o proveedor"}
              title="Acepta lector USB/PC: escanea y confirma con Enter o Tab"
            />
            {q && (
              <button type="button" onClick={() => { setQ(""); setFocusedMaterialId(""); }} title="Limpiar la búsqueda" aria-label="Limpiar la búsqueda">
                <X size={15} />
              </button>
            )}
          </label>

          <div className="stk-acciones">
            {stockManagement && !tableWorkspace && canReceive && (pendingMinimums.length > 0 || savingMinimums) && (
              <button type="button" className="ui-btn stk-guardar" onClick={saveAllMinimums} disabled={savingMinimums || !pendingMinimums.length || invalidMinimums} title={invalidMinimums ? "Revisá los mínimos: deben ser números mayores o iguales a cero" : "Guardar todos los mínimos modificados"}>
                <Save size={15} aria-hidden="true" /> {savingMinimums ? "Guardando…" : `Guardar mínimos${pendingMinimums.length ? ` (${pendingMinimums.length})` : ""}`}
              </button>
            )}
            {obraScoped && matrizArchivadas > 0 && (
              <button type="button" className={`ui-btn${verArchivados ? " is-activo" : ""}`} onClick={() => setVerArchivados((value) => !value)} aria-pressed={verArchivados} title="Mostrar u ocultar requisitos de matriz archivados en esta obra">
                <Archive size={14} aria-hidden="true" /> {matrizArchivadas} archivado{matrizArchivadas === 1 ? "" : "s"}
              </button>
            )}
            {canShowHistory && !streamlinedToolbar && (
              <div className="ui-seg" role="group" aria-label="Egresar o ver historial">
                {[
                  ["egresar", mode === "egreso" ? "Egresar" : "Stock"],
                  ["historial", `Historial (${historyRows.length})`],
                ].map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={egresoView === key} onClick={() => setEgresoView(key)}>{label}</button>
                ))}
              </div>
            )}
            {canReceive && !streamlinedToolbar && (
              <button type="button" className="ui-btn" onClick={() => openEgresoDisplay(toast)} title="Abrir la pantalla para la persona que retira">
                <MonitorUp size={15} aria-hidden="true" />{!isMobile && "Pantalla de retiro"}
              </button>
            )}
            {streamlinedToolbar && (
              <button
                type="button"
                className={`ui-btn${filtersOpen || advancedFilterCount ? " is-activo" : ""}`}
                onClick={() => setFiltersOpen((value) => !value)}
                aria-expanded={filtersOpen}
                aria-controls="stock-advanced-filters"
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
                Filtros
                {advancedFilterCount > 0 && <span className="stk-num">{advancedFilterCount}</span>}
              </button>
            )}
            <button type="button" className={`ui-btn${isMobile ? " ui-btn-icono" : ""}`} onClick={() => setScannerOpen(true)} title="Escanear con la cámara" aria-label="Escanear con la cámara">
              <ScanLine size={16} aria-hidden="true" />{!isMobile && "Escanear"}
            </button>
            {canReceive && (cart.length > 0 || savedCarts.length > 0) && (
              <button
                type="button"
                className={`ui-btn stk-carrito${cartOpen ? " is-abierto" : ""}`}
                onClick={() => setCartOpen((value) => !value)}
                aria-expanded={cartOpen}
                title={cart.length ? `${cart.length} productos · ${fmtQty(unidadesEnCarrito)} unidades` : `${savedCarts.length} carritos guardados`}
              >
                {cart.length ? <ShoppingCart size={15} aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
                {!isMobile && "Carrito"}
                <span className="stk-num" aria-label={cart.length ? `${cart.length} productos en el carrito` : `${savedCarts.length} carritos guardados`}>
                  {cart.length || savedCarts.length}
                </span>
              </button>
            )}
            {stockManagement && (
              <div className="ui-seg" role="group" aria-label="Ver como">
                <button type="button" aria-pressed={stockView === "lista"} onClick={() => setStockView("lista")} title="Ver como lista" aria-label="Ver como lista"><List size={15} aria-hidden="true" /></button>
                <button type="button" aria-pressed={stockView === "tarjetas"} onClick={() => setStockView("tarjetas")} title="Ver como tarjetas" aria-label="Ver como tarjetas"><LayoutGrid size={15} aria-hidden="true" /></button>
              </div>
            )}
            <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={(code) => { setScannerOpen(false); applyScanCode(code); }} />
          </div>
        </div>

        {panelFiltros}

        {filtros && (
          <div className="stk-filtros" role="tablist" aria-label={tableWorkspace ? "Ver stock o egresos de la obra" : "Bandejas de trabajo"}>
            {filtros.map(([key, label, count, tono]) => {
              const activo = scope === key && (!stockMaster || verifScope === "todos");
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  className={`stk-filtro${activo ? " is-activo" : ""}${tono && count ? ` is-${tono}` : ""}`}
                  onClick={() => {
                    if (stockMaster) setVerifScope("todos");
                    if (tableWorkspace) setSelectedKey(null);
                    setScope(showCatalogInventory && !stockMaster && !tableWorkspace && scope === key ? "todos" : key);
                  }}
                >
                  {label}<small>{fmtQty(count)}</small>
                </button>
              );
            })}
            {tableWorkspace && <span className="stk-filtros-nota">Los egresados no cuentan como stock disponible.</span>}
          </div>
        )}
      </div>

      {canShowHistory && egresoView === "historial" ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: isMobile ? 12 : "14px 28px 18px", display: "grid" }}>
          <EgresosHistoryView rows={historyRows} loading={loading} obras={obras} isMobile={isMobile} onOpenProduct={openProductFromHistory} />
        </div>
      ) : (
        <div className={`stk-cuerpo${hasSelectedProduct && !isMobile ? " con-ficha" : ""}`}>
          {/* En el celular, con un producto abierto la ficha ocupa todo: el
              botón "Lista" de la ficha vuelve. En la PC conviven lado a lado. */}
          {!(isMobile && hasSelectedProduct) && (
            <section ref={productListRef} className={`stk-lista${vistaLista ? "" : " is-tarjetas"}`} aria-label={tableWorkspace ? "Stock de la obra" : "Stock maestro"}>
              {vistaLista && !loading && productGroups.length > 0 && (
                <div className="stk-tabla-cab" style={{ minWidth: anchoMinimo, gridTemplateColumns: columnas }}>
                  <span />
                  <span>Producto</span>
                  <span className="is-der">{tableWorkspace ? "En obra" : "Libre"}</span>
                  {tableWorkspace ? (
                    <>
                      <span>Ubicación</span>
                      <span>Estado</span>
                      <span />
                    </>
                  ) : compactStockTable ? (
                    <>
                      <span>Faltante</span>
                      <span>Ubicación</span>
                      <span />
                    </>
                  ) : (
                    <>
                      <span>Reservado</span>
                      <span>Mínimo</span>
                      <span>Ubicación</span>
                      <span>Estado</span>
                      <span />
                    </>
                  )}
                </div>
              )}
              {loading ? (
                <div style={{ gridColumn: "1 / -1" }}><Cargando texto="Cargando el stock…" /></div>
              ) : productGroups.length ? (
                <>
                  {renderedProductGroups.map((group) => {
                    const primaryAction = primaryActionFor(group);
                    return vistaLista
                      ? <ProductStockRow key={group.key} group={group} active={selectedKey === group.key} onOpen={setSelectedKey} canEditMinimum={canReceive && !savingMinimums} onSaveMinimum={saveSingleMinimum} minimumDraft={minimumDrafts[group.material?.id]} onMinimumDraftChange={changeMinimumDraft} onArchivarMatriz={canArchiveMatrix ? archivarMatriz : undefined} primaryAction={primaryAction} compact={compactStockTable} obraView={tableWorkspace} />
                      : <ProductCard key={group.key} group={group} active={selectedKey === group.key} onOpen={setSelectedKey} canSeePrices={canSeePrices} onAddToCart={canReceive ? quickAddToCart : undefined} onArchivarMatriz={canArchiveMatrix ? archivarMatriz : undefined} primaryAction={primaryAction} inCart={cartGroupKeys.has(group.key)} dense={!isMobile && hasSelectedProduct} obraView={tableWorkspace} />;
                  })}
                  {hiddenProductCount > 0 && (
                    <div className="stk-mas" style={vistaLista ? { minWidth: anchoMinimo } : undefined}>
                      <button
                        ref={loadMoreRef}
                        type="button"
                        className="ui-btn"
                        onClick={() => setRenderLimit((current) => Math.min(current + PRODUCT_RENDER_BATCH, productGroups.length))}
                      >
                        Mostrar {Math.min(PRODUCT_RENDER_BATCH, hiddenProductCount)} más · quedan {fmtQty(hiddenProductCount)}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="stk-vacio">
                  <strong>{tableWorkspace && scope === "egresados" ? "No hay egresos para estos filtros" : "No hay stock para estos filtros"}</strong>
                  {q.trim() ? (stockMaster ? "Probá con menos palabras o abrí el Catálogo maestro desde el menú." : "Probá con menos palabras, o buscalo abajo en el catálogo completo.") : "Cambiá la bandeja o los filtros para ver más productos."}
                </div>
              )}

              {!stockMaster && q.trim().length >= 2 && (
                <div className="stk-bloque" style={{ gridColumn: "1 / -1", marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                  <div>
                    <div className="stk-rotulo">Catálogo completo</div>
                    <div className="stk-texto" style={{ marginTop: 4 }}>Usá el catálogo para identificar el producto. Si no tiene stock, primero registrá su ingreso o recepción física.</div>
                  </div>
                  {catalogMatches.map((mat) => (
                    <button key={mat.id} type="button" className="stk-saldo" onClick={() => selectCatalogMaterial(mat)}>
                      <span style={{ minWidth: 0 }}>
                        <span className="stk-saldo-nombre">{mat.descripcion}</span>
                        <span className="stk-saldo-sub">{mat.codigo || "sin código"} · sin stock cargado</span>
                      </span>
                    </button>
                  ))}
                  {!catalogMatches.length && <div className="stk-texto">No hay coincidencias en el catálogo.</div>}
                  {!canCreateCatalog && canReceive && onRegisterPendingProduct ? (
                    <button type="button" className="ui-btn ui-btn-suave" style={{ justifySelf: "start" }} onClick={() => onRegisterPendingProduct(q.trim())}>
                      Registrar producto pendiente
                    </button>
                  ) : (
                    <button type="button" className="ui-btn ui-btn-suave" style={{ justifySelf: "start" }} onClick={createFromSearch} disabled={creating || !canCreateCatalog}>
                      {!canCreateCatalog ? "Crear nuevo requiere administrador" : creating ? "Creando…" : `Crear "${q.trim()}" en el catálogo`}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {hasSelectedProduct && (
            <ProductDetail
              key={selectedGroup.key}
              group={selectedGroup}
              isMobile={isMobile}
              obras={obras}
              sedeLocked={sedeLocked}
              canReceive={canReceive}
              canCreateCatalog={canCreateCatalog}
              mode={mode}
              onDone={refreshAfterMovement}
              toast={toast}
              setSelectedKey={setSelectedKey}
              cart={cart}
              setCart={setCart}
              onOpenCatalog={onOpenCatalog}
              cierresByObra={cierresByObra}
              accion={primaryActionFor(selectedGroup)}
            />
          )}
        </div>
      )}

      {/* El acceso vive en la barra superior: no tapa el pie del detalle ni la lista. */}
      {canReceive && cartOpen && (cart.length > 0 || savedCarts.length > 0) && (
        <CartDrawer
          cart={cart}
          setCart={setCart}
          obras={obras}
          canReceive={canReceive}
          onDone={async () => { setCartOpen(false); await refreshAfterMovement(); }}
          toast={toast}
          isMobile={isMobile}
          onClose={() => setCartOpen(false)}
          savedCarts={savedCarts}
          setSavedCarts={setSavedCarts}
        />
      )}
    </div>
  );
}
