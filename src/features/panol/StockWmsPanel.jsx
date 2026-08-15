import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
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
  ScanLine,
  Search,
  ShieldCheck,
  ShoppingCart,
  Warehouse,
  X,
} from "lucide-react";
import { MaterialThumb } from "@/features/materiales/MaterialExtras";
import { C } from "@/theme";
import BarcodeScanner from "@/features/panol/BarcodeScanner";
import UbicacionPicker, { UbicacionChip } from "@/features/panol/UbicacionPicker";
import useNfcBridge from "@/features/panol/useNfcBridge";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { materialBarcodeList, materialBarcodeText } from "@/features/materiales/materialBarcodes";
import { materialMatchIsStrong, materialMatchScore, topMaterialMatches } from "@/features/panol/materialMatch";
import { buscarEmpleadoPorNfc, evaluarRetiro, normalizeNfcUid } from "@/features/rrhh/api";
import { fmtDate, rowCountsAsStock, rowDelta, rowIsAnulado, rowIsEgreso, rowIsLocationChange, rowIsTransit, rowMovementAt, rowSource } from "@/features/panol/panolMovimientos";
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

const LEDGER_STATES = ["en_panol", "recibido", "parcial", "egresado", "problema"];
const CATALOG_SEARCH_LIMIT = 12;
const PRODUCT_RENDER_BATCH = 80;
const EGRESO_VIEW_STORAGE_KEY = "klasea.panol.egresoView";
const STOCK_VIEW_STORAGE_KEY = "klasea.panol.stockView.v2";
const PANOL_CART_STORAGE_KEY = "klasea:panol-carrito.v2";

function readStoredEgresoView() {
  if (typeof window === "undefined") return "egresar";
  const value = window.localStorage.getItem(EGRESO_VIEW_STORAGE_KEY);
  return value === "historial" ? "historial" : "egresar";
}

function readStoredStockView() {
  if (typeof window === "undefined") return "tarjetas";
  return window.localStorage.getItem(STOCK_VIEW_STORAGE_KEY) === "lista" ? "lista" : "tarjetas";
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
    <div style={{ width: size, height: size, borderRadius: 14, overflow: "hidden", border: `1px solid ${C.greenB}`, background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(59,130,246,0.14))", color: C.green, display: "grid", placeItems: "center", flexShrink: 0, fontSize: 15, fontWeight: 950 }}>
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
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.cyan, fontSize: 11.5, fontWeight: 900 }}>
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
            <div style={{ color: C.green, fontSize: 9.5, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Persona validada</div>
            <div style={{ color: C.text, fontSize: compact ? 15 : 16, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nfc.empleado.nombre}</div>
            <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>DNI {nfc.empleado.dni || "-"}{nfc.empleado.sede ? ` · ${nfc.empleado.sede}` : ""}</div>
          </div>
          <button type="button" onClick={onClear} style={{ border: `1px solid ${C.greenB}`, background: C.panelSolid, color: C.green, borderRadius: 9, padding: "7px 9px", cursor: "pointer", fontSize: 11, fontWeight: 900, fontFamily: C.sans, flexShrink: 0 }}>
            Cambiar
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: C.panelSolid, border: `1px solid ${border}`, color: accent, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <CreditCard size={17} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.text, fontSize: 12.5, fontWeight: 950 }}>Identificar a quien retira</div>
            <div style={{ color: C.dim, fontSize: 10.5, marginTop: 1 }}>Apoyá la tarjeta en el lector.</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 22 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: bridgeColor, boxShadow: bridgeOk ? `0 0 0 3px ${C.greenL}` : "none", flexShrink: 0 }} />
        <span style={{ color: bridgeColor, fontSize: 10.5, fontWeight: 900 }}>{bridgeLabel}</span>
        {!bridgeOk && (
          <button type="button" onClick={bridge?.reconnect} style={{ marginLeft: "auto", border: "none", background: "transparent", color: bridgeColor, padding: "3px 0", cursor: "pointer", fontSize: 10.5, fontWeight: 900, fontFamily: C.sans }}>
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
          <button type="button" onClick={() => nfc.resolver(nfc.code)} style={{ border: `1px solid ${border}`, background: C.panelSolid, color: accent, borderRadius: 9, padding: "8px 10px", cursor: "pointer", fontSize: 12, fontWeight: 900, fontFamily: C.sans }}>
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
          stock_minimo: row.stock_minimo ?? null,
          imagen_url: row.imagen_url || null,
          notas: row.notas || null,
          es_requisito: row.es_requisito === true,
        },
        imagenUrl: row.imagen_url || null,
        notas: row.notas || null,
        verificacion: row.verificacion_estado || "pendiente",
        verificacionProblemas: row.verificacion_problemas || [],
        verificadoAt: row.verificado_at || null,
        verificacionNota: row.verificacion_nota || null,
        label: row.descripcion || "(sin descripcion)",
        codigo: row.codigo || "",
        codigo_barra: row.codigo_barra || "",
        codigos_barra: row.codigos_barra || [],
        proveedor: row.proveedor || "",
        unidad: row.unidad || "unidad",
        stockMinimo: row.stock_minimo ?? null,
        tipoPedido,
        variantes: Array.isArray(row.variantes) ? row.variantes.map((v) => (v && typeof v === "object" ? v.nombre : String(v || ""))).filter(Boolean) : [],
        esRequisito: row.es_requisito === true,
        productosCompatibles: Array.isArray(row.productos_compatibles) ? row.productos_compatibles : [],
        variantesEnStock: new Set(),
        opcionMap: new Map(),
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
    if (group.stockMinimo == null && row.stock_minimo != null) {
      group.stockMinimo = row.stock_minimo;
      group.material.stock_minimo = row.stock_minimo;
    }
    if (!group.ubicacion && row.ubicacion) {
      group.ubicacion = row.ubicacion;
      group.ubicacion_obs = row.ubicacion_obs || null;
    }
    if (!group.imagenUrl && row.imagen_url) {
      group.imagenUrl = row.imagen_url;
      group.material.imagen_url = row.imagen_url;
    }
    // Entre varias filas del mismo producto gana la que ya fue revisada: el
    // estado vive en la ficha, no en el renglón de stock.
    if (group.verificacion === "pendiente" && row.verificacion_estado && row.verificacion_estado !== "pendiente") {
      group.verificacion = row.verificacion_estado;
      group.verificacionProblemas = row.verificacion_problemas || [];
      group.verificadoAt = row.verificado_at || null;
      group.verificacionNota = row.verificacion_nota || null;
    }
    if (!group.codigo_barra && row.codigo_barra) {
      group.codigo_barra = row.codigo_barra;
      group.material.codigo_barra = row.codigo_barra;
    }
    if ((!group.variantes || !group.variantes.length) && Array.isArray(row.variantes) && row.variantes.length) {
      group.variantes = row.variantes.map((v) => (v && typeof v === "object" ? v.nombre : String(v || ""))).filter(Boolean);
    }
    if (row.es_requisito === true) {
      group.esRequisito = true;
      group.material.es_requisito = true;
      if ((!group.productosCompatibles || !group.productosCompatibles.length) && Array.isArray(row.productos_compatibles)) {
        group.productosCompatibles = row.productos_compatibles;
      }
    }
    const varChosen = String(row.opcion_asignada || row.variante || "").trim();
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
    // Desglose por opción dentro de este depósito/obra. `opcion_asignada`
    // cubre los productos concretos nuevos y `variante` conserva los registros
    // históricos (Samsung: 10 · LG: 10).
    const vName = String(row.opcion_asignada || row.variante || "").trim();
    if (!location.variantMap.has(vName)) location.variantMap.set(vName, { available: 0, transitQty: 0 });
    const vAgg = location.variantMap.get(vName);
    vAgg.available += delta;
    if (!group.opcionMap.has(vName)) group.opcionMap.set(vName, { available: 0, transitQty: 0 });
    const optionAgg = group.opcionMap.get(vName);
    optionAgg.available += delta;
    if (rowIsTransit(row)) {
      const transit = qty(row.cantidad, 1);
      location.transitQty += transit;
      group.transitQty += transit;
      vAgg.transitQty += transit;
      optionAgg.transitQty += transit;
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
      opciones: [...group.opcionMap.entries()]
        .filter(([name, agg]) => name && (Math.abs(agg.available) > 0.0001 || agg.transitQty > 0))
        .map(([name, agg]) => ({ nombre: name, available: agg.available, transitQty: agg.transitQty }))
        .sort((a, b) => b.available - a.available || a.nombre.localeCompare(b.nombre, "es", { numeric: true })),
      tipoPedido: groupTipoFromStock(group),
      locations,
      egresado: group.hasEgreso && !hasPositiveStock && group.transitQty <= 0,
      negativo: group.total < -0.0001,
      locationImbalance: group.total >= -0.0001 && locations.some((loc) => loc.available < -0.0001),
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
    <label style={{
      display: "flex", alignItems: "center", gap: 6, minWidth: 0,
      flex: "1 1 148px", maxWidth: 230, height: 32,
      padding: "0 8px 0 9px", borderRadius: 8,
      border: `1px solid ${activo ? C.blueB : C.border}`,
      background: activo ? C.blueL : C.panelSolid,
    }}>
      <span style={{ color: activo ? C.blue : C.dim, fontSize: 9, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0 }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: C.text, padding: 0, fontSize: 11.5, fontWeight: 800, fontFamily: C.sans, outline: "none", cursor: "pointer" }}
      >
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  );
}

function StateChip({ negative, imbalance = false, catalogOnly = false, transit = false, egresado = false, compact = false }) {
  if (compact && !egresado && !transit && !catalogOnly && !negative && !imbalance) return null;
  const color = egresado ? C.red : transit ? C.violet : catalogOnly ? C.violet : negative ? C.red : imbalance ? C.violet : C.green;
  const border = egresado ? C.redB : transit ? C.violetB : catalogOnly ? C.violetB : negative ? C.redB : imbalance ? C.violetB : C.greenB;
  const background = egresado ? C.redL : transit ? C.violetL : catalogOnly ? C.violetL : negative ? C.redL : imbalance ? C.violetL : C.greenL;
  const label = egresado ? "Egresado" : transit ? "Por recibir" : catalogOnly ? "Sin registro" : negative ? "A reconciliar" : imbalance ? "Ubicación a revisar" : "Disponible";
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

function stockLevel(group) {
  const raw = group?.stockMinimo;
  const configured = raw !== null && raw !== undefined && raw !== "";
  const minimum = configured ? Math.max(0, qty(raw, 0)) : null;
  const current = qty(group?.total, 0);
  if (group?.negativo || current < 0) {
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

const REPLENISHMENT_RECENT_MONTHS = 6;

function groupOperationalBuckets(group) {
  const buckets = new Set();
  const current = qty(group?.total, 0);
  const minimum = group?.stockMinimo == null || group.stockMinimo === "" ? null : Math.max(0, qty(group.stockMinimo, 0));
  const recentCutoff = new Date();
  recentCutoff.setMonth(recentCutoff.getMonth() - REPLENISHMENT_RECENT_MONTHS);
  const recentlyMoved = !!group?.updatedAt && new Date(group.updatedAt) >= recentCutoff;
  const hasExistence = current > 0.0001;
  const atConfiguredMinimum = current >= -0.0001 && minimum != null && minimum > 0 && current <= minimum + 0.0001;
  const recentlyDepleted = current >= -0.0001 && current <= 0.0001 && recentlyMoved;
  const needsReplenishment = atConfiguredMinimum || recentlyDepleted;
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
  return { buckets, needsConcreteProduct, recentlyMoved, needsReplenishment };
}

function StockLevelChip({ group, compact = false, hideUnset = false }) {
  const level = stockLevel(group);
  if (hideUnset && level.key === "sin_minimo") return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: level.color, border: `1px solid ${level.border}`, background: level.bg, borderRadius: 999, padding: compact ? "2px 7px" : "3px 8px", fontSize: compact ? 9 : 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.45, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: level.color, boxShadow: level.key === "sin_minimo" ? "none" : `0 0 0 3px ${level.color}18` }} />
      {level.label}
    </span>
  );
}

function MinimumEditor({ group, canEdit, onSave }) {
  const initial = group.stockMinimo == null ? "" : String(group.stockMinimo);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft(group.stockMinimo == null ? "" : String(group.stockMinimo));
  }, [group.stockMinimo]);
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
    <div onClick={(event) => event.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <input
        type="number"
        min="0"
        step="0.01"
        value={draft}
        disabled={!canEdit || saving}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          }
        }}
        placeholder="Sin definir"
        title="Dejalo vacío para quitar el mínimo"
        style={{ width: 88, minWidth: 0, boxSizing: "border-box", border: `1px solid ${!valid ? C.redB : dirty ? C.blueB : C.border}`, background: C.panelSolid, color: C.text, borderRadius: 8, padding: "6px 7px", fontFamily: C.mono, fontSize: 11.5, fontWeight: 850, outline: "none", opacity: canEdit ? 1 : 0.72 }}
      />
      {canEdit && dirty && (
        <button type="button" disabled={!valid || saving} onClick={save} style={{ border: `1px solid ${valid ? C.greenB : C.border}`, background: valid ? C.greenL : C.panel2, color: valid ? C.green : C.dim, borderRadius: 7, padding: "6px 7px", cursor: valid && !saving ? "pointer" : "not-allowed", fontSize: 10, fontWeight: 900 }}>
          {saving ? "..." : "Guardar"}
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
    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", minWidth: 0 }}>
      <span style={{ color: C.dim, fontSize: compact ? 8.5 : 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.65, flexShrink: 0 }}>
        {opciones.length === 1 ? "Opción" : "Opciones"}
      </span>
      {visibles.map((opcion) => (
        <span
          key={opcion.nombre}
          title={`${opcion.nombre}: ${fmtQty(opcion.available)} ${group.unidad || "u"}`}
          style={{ maxWidth: compact ? 180 : 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.violet, background: C.violetL, border: `1px solid ${C.violetB}`, borderRadius: 999, padding: compact ? "1px 6px" : "2px 8px", fontSize: compact ? 9.5 : 10.5, fontWeight: 850 }}
        >
          {opcion.nombre} · {fmtQty(opcion.available)}
        </span>
      ))}
      {opciones.length > visibles.length && (
        <span style={{ color: C.dim, fontSize: compact ? 9 : 10, fontWeight: 900 }}>+{opciones.length - visibles.length}</span>
      )}
    </div>
  );
}

function ProductPrimaryAction({ action, compact = false }) {
  if (!action?.onClick) return null;
  const Icon = action.Icon || ArrowUpRight;
  return (
    <span
      role="button"
      tabIndex={0}
      title={action.title || action.label}
      onClick={(event) => { event.stopPropagation(); action.onClick(); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          action.onClick();
        }
      }}
      style={{
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: compact ? 0 : 5,
        minWidth: compact ? 26 : 0,
        height: compact ? 24 : 26,
        border: `1px solid ${action.border}`,
        background: action.background,
        color: action.color,
        borderRadius: 8,
        padding: compact ? "0 6px" : "0 9px",
        fontSize: 10.5,
        fontWeight: 900,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={compact ? 12 : 13} />
      {!compact && action.label}
    </span>
  );
}

// memo: al agregar al carrito (o seleccionar) solo se re-renderizan las tarjetas
// afectadas, no las 300+ de la lista — el click se siente inmediato.
const ProductCard = memo(function ProductCard({ group, active, onOpen, canSeePrices = true, onAddToCart, primaryAction, inCart = false, dense = false }) {
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
  const level = stockLevel(group);
  const qtyColor = group.egresado ? C.red : level.configured || group.negativo ? level.color : group.total > 0 ? C.green : C.dim;
  const sinUbicacion = !group.ubicacion;
  const barcode = group.codigo_barra || materialBarcodeList(group.material)[0]?.codigo || group.codigos_barra?.[0]?.codigo || "";
  const codeLabel = group.codigo
    ? (barcode ? `${group.codigo} · CB ${barcode}` : group.codigo)
    : (barcode ? `CB ${barcode}` : "sin código");

  // ── Variante DENSA (lista angosta con detalle abierto): 2 líneas, micro-chips ──
  if (dense) {
    const asigs = groupAsignaciones(group);
    const estadoMini = group.egresado ? ["EGRESADO", C.red] : group.negativo ? ["NEGATIVO", C.red] : group.locationImbalance ? ["REVISAR UBIC.", C.violet] : group.inTransit ? ["POR RECIBIR", C.violet] : null;
    const micro = (label, color) => (
      <span style={{ fontSize: 8.5, fontWeight: 950, color, border: `1px solid ${color}44`, background: `${color}12`, borderRadius: 999, padding: "0 5px", flexShrink: 0, whiteSpace: "nowrap", lineHeight: "13px" }}>{label}</span>
    );
    return (
      <button
        type="button"
        onClick={() => onOpen(group.key)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4, borderStyle: "solid", borderTopColor: active || hover ? C.blueB : level.border, borderRightColor: active || hover ? C.blueB : level.border, borderBottomColor: active || hover ? C.blueB : level.border, borderLeftColor: level.color, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 3, background: active ? C.blueL : hover ? "rgba(59,130,246,0.06)" : C.panelSolid, borderRadius: 9, padding: "7px 9px", cursor: "pointer", color: C.text, textAlign: "left", fontFamily: C.sans, minWidth: 0, transition: "border-color .12s, background .12s" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</span>
          <span style={{ color: qtyColor, fontFamily: C.mono, fontSize: 14, fontWeight: 950, flexShrink: 0 }}>
            {fmtQty(group.total)}<span style={{ color: C.dim, fontSize: 9, fontWeight: 800, marginLeft: 3 }}>{group.unidad || "u"}</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
          {estadoMini && micro(estadoMini[0], estadoMini[1])}
          <StockLevelChip group={group} compact hideUnset />
          {asigs.length > 0 && micro(asigs.length === 1 ? asigs[0].label : `${asigs.length} OBRAS`, C.blue)}
          {group.tipoPedido === "adicional" && micro("ADIC", C.violet)}
          <span style={{ flex: 1, minWidth: 0, color: C.dim, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {group.ubicacion ? `${group.ubicacion} · ` : ""}{codeLabel !== "sin código" ? `${group.codigo || barcode} · ` : ""}{stockDetail}
          </span>
          {primaryAction ? (
            <ProductPrimaryAction action={primaryAction} compact />
          ) : onAddToCart && group.total > 0.0001 && (
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
        <OptionStockSummary group={group} compact max={1} />
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
        borderStyle: "solid",
        borderTopColor: active || hover ? C.blueB : level.border,
        borderRightColor: active || hover ? C.blueB : level.border,
        borderBottomColor: active || hover ? C.blueB : level.border,
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 3,
        borderLeftColor: level.color,
        background: active ? C.blueL : level.key === "critico" ? C.redL : level.key === "alerta" ? C.violetL : hover ? "rgba(59,130,246,0.06)" : C.panelSolid,
        borderRadius: 11,
        padding: "9px 10px",
        cursor: "pointer",
        color: C.text,
        textAlign: "left",
        fontFamily: C.sans,
        // Hover sutil: sólo borde + fondo. El translateY con sombra fuerte hacía
        // "saltar" la lista al recorrerla con el mouse.
        boxShadow: hover && !active ? "0 4px 12px -8px rgba(0,0,0,0.18)" : "none",
        transition: "border-color .12s, background .12s, box-shadow .12s",
      }}
    >
      {/* Fila 1: foto + nombre completo (hasta 2 líneas) + disponible.
          La miniatura va acá y no en una fila propia: en una grilla de tarjetas
          cada fila extra se multiplica por todo lo que entra en pantalla. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <MaterialThumb material={{ imagen_url: group.imagenUrl, descripcion: group.label }} size={40} />
        <span style={{ flex: 1, minWidth: 0, color: C.text, fontSize: 13, fontWeight: 900, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{group.label}</span>
        <div style={{ display: "grid", justifyItems: "end", gap: 1, flexShrink: 0 }}>
          <span style={{ color: qtyColor, fontFamily: C.mono, fontSize: 17, fontWeight: 950, lineHeight: 1 }}>{fmtQty(group.total)}</span>
          <span style={{ color: C.dim, fontSize: 8, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.5 }}>{group.unidad || "u"}</span>
        </div>
      </div>
      {/* Fila 2: badges + ubicación / sin ubicación */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <VerificacionChip estado={group.verificacion} compact />
        <KindChip tipo={group.tipoPedido} />
        <StockLevelChip group={group} hideUnset />
        <AsignadoChip asignaciones={groupAsignaciones(group)} compact />
        <StateChip egresado={group.egresado} transit={group.inTransit} catalogOnly={group.catalogOnly} negative={group.negativo} imbalance={group.locationImbalance} compact />
        {sinUbicacion ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.violet, background: C.violetL, border: `1px solid ${C.violetB}`, borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 900 }}>
            <MapPin size={11} /> Sin ubicación
          </span>
        ) : (
          <UbicacionChip ubicacion={group.ubicacion} obs={group.ubicacion_obs} />
        )}
      </div>
      {/* La opción asignada es dato operativo: siempre visible sin abrir. */}
      <OptionStockSummary group={group} max={2} />
      {/* Fila 3: meta (código · proveedor · rubro · valor) + carrito inline.
          El chip de carrito va EN la misma fila: una fila propia le sumaba ~24px
          a cada card y con 300 productos eso es media pantalla menos de lista. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, color: C.dim, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {codeLabel}{group.proveedor ? ` · ${group.proveedor}` : ""}{group.categorias.size ? ` · ${[...group.categorias][0]}` : ""}
          {canSeePrices && group.valueUsd > 0 ? ` · USD ${fmtQty(group.valueUsd)}` : ""}
        </span>
        {primaryAction ? (
          <ProductPrimaryAction action={primaryAction} />
        ) : onAddToCart && group.total > 0.0001 && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onAddToCart(group); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onAddToCart(group); } }}
            onMouseEnter={() => setCartHover(true)}
            onMouseLeave={() => setCartHover(false)}
            title={inCart ? "Ya está en el carrito · click para actualizar" : "Agregar al carrito"}
            style={{
              flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
              border: `1px solid ${inCart || cartHover ? C.greenB : C.border}`,
              background: inCart || cartHover ? C.greenL : "transparent",
              color: inCart || cartHover ? C.green : C.dim,
              borderRadius: 999, padding: "2px 9px", fontSize: 10.5, fontWeight: 850, cursor: "pointer",
              transition: "color .12s, border-color .12s, background .12s",
            }}
          >
            <ShoppingCart size={11} /> {cartHover && !inCart ? "+ Agregar" : inCart ? "En carrito" : "Carrito"}
          </span>
        )}
      </div>
      {/* Fila 4: depósito / obra */}
      {active && <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ color: C.dim, fontSize: 8.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.7, flexShrink: 0 }}>Depósito/obra</span>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, fontWeight: 700, color: group.egresado || group.negativo ? C.red : C.t1 }}>
          {stockDetail}{group.locations.length > 4 ? ` · +${group.locations.length - 4}` : ""}
        </span>
      </div>}
    </button>
  );
});

// Grilla compartida por el encabezado y las filas. Una sola constante para que
// no se desalineen cuando se toca una y se olvida la otra.
const STOCK_ROW_COLS = "48px minmax(230px,2.1fr) 82px 116px 84px minmax(130px,1.1fr) 104px 116px";
const STOCK_ROW_MIN = 1010;

const VERIF_META = {
  ok: { label: "Revisado", Icon: CheckCircle2, color: C.green, bg: C.greenL, border: C.greenB },
  problema: { label: "Problema", Icon: AlertTriangle, color: C.red, bg: C.redL, border: C.redB },
  pendiente: { label: "Sin revisar", Icon: CircleDashed, color: C.dim, bg: "transparent", border: C.border },
};

function VerificacionChip({ estado, compact = false }) {
  const meta = VERIF_META[estado] || VERIF_META.pendiente;
  const Icon = meta.Icon;
  return (
    <span title={meta.label} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      color: meta.color, border: `1px solid ${meta.border}`, background: meta.bg,
      borderRadius: 999, padding: compact ? "2px 7px" : "3px 9px",
      fontSize: compact ? 9 : 10, fontWeight: 950, whiteSpace: "nowrap",
    }}>
      <Icon size={compact ? 10 : 11} style={{ flexShrink: 0 }} />
      {meta.label}
    </span>
  );
}

// Un dato que falta y hace falta. Se muestra como etiqueta en la fila porque el
// objetivo de la revisión es justamente que estas etiquetas desaparezcan.
function FaltaChip({ children }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      color: C.red, border: `1px dashed ${C.redB}`, background: C.redL,
      borderRadius: 6, padding: "1px 6px", fontSize: 9.5, fontWeight: 900, whiteSpace: "nowrap",
    }}>
      falta {children}
    </span>
  );
}

const ProductStockRow = memo(function ProductStockRow({ group, active, onOpen, canEditMinimum, onSaveMinimum, primaryAction }) {
  const [hover, setHover] = useState(false);
  const level = stockLevel(group);
  const location = group.ubicacion || group.locations?.find((item) => item.available > 0)?.label || "";
  const categoria = [...(group.categorias || [])].filter(Boolean)[0] || "";
  // Lo que la revisión viene a completar. Se calcula acá y no en el detalle
  // porque el valor está en verlo sin abrir: así se elige a cuál entrar.
  const sinUbicacion = !group.ubicacion;
  const sinCodigo = !group.codigo;
  const descripcionPobre = String(group.label || "").trim().length < 12;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(group.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(group.key);
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        minWidth: STOCK_ROW_MIN,
        display: "grid",
        gridTemplateColumns: STOCK_ROW_COLS,
        alignItems: "center",
        gap: 12,
        padding: "9px 12px",
        borderBottom: `1px solid ${C.border}`,
        borderLeft: `3px solid ${active ? C.blue : level.color}`,
        background: active ? C.blueL : hover ? C.panel : C.panelSolid,
        color: C.text,
        cursor: "pointer",
        outline: "none",
        transition: "background .12s, box-shadow .12s",
        boxShadow: hover && !active ? `inset 0 0 0 1px ${C.border2}` : "none",
      }}
    >
      {/* La foto es el primer filtro visual: reconocer la pieza sin leer.
          MaterialThumb ya trae el lightbox y frena la propagación del click. */}
      <MaterialThumb material={{ imagen_url: group.imagenUrl, descripcion: group.label }} size={42} />

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ color: C.text, fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {group.label}
          </span>
          <StockLevelChip group={group} compact hideUnset />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
          <span style={{ color: C.dim, fontSize: 10.5, fontFamily: C.mono }}>{group.codigo || "sin código"}</span>
          {group.proveedor && <span style={{ color: C.dim, fontSize: 10.5 }}>· {group.proveedor}</span>}
          {categoria && <span style={{ color: C.dim, fontSize: 10.5 }}>· {categoria}</span>}
          {sinCodigo && <FaltaChip>código</FaltaChip>}
          {descripcionPobre && <FaltaChip>descripción</FaltaChip>}
        </div>
        <div style={{ marginTop: 5 }}><OptionStockSummary group={group} compact max={2} /></div>
      </div>

      <div>
        <div style={{ color: level.color, fontFamily: C.mono, fontSize: 15, fontWeight: 950 }}>{fmtQty(group.total)}</div>
        <div style={{ color: C.dim, fontSize: 9.5 }}>{group.unidad || "u"}</div>
      </div>

      <MinimumEditor group={group} canEdit={canEditMinimum} onSave={onSaveMinimum} />

      <div>
        <div style={{ color: level.faltante > 0 ? level.color : C.dim, fontFamily: C.mono, fontSize: 13, fontWeight: 900 }}>
          {level.faltante > 0 ? fmtQty(level.faltante) : "—"}
        </div>
        <div style={{ color: C.dim, fontSize: 9.5 }}>{level.faltante > 0 ? "para el mínimo" : "sin faltante"}</div>
      </div>

      <div style={{ minWidth: 0 }}>
        {sinUbicacion ? <FaltaChip>ubicación</FaltaChip> : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: C.text, fontSize: 11.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <MapPin size={11} style={{ color: C.dim, flexShrink: 0 }} />
              {location}
            </div>
            {group.ubicacion_obs && (
              <div style={{ color: C.dim, fontSize: 10, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {group.ubicacion_obs}
              </div>
            )}
          </>
        )}
      </div>

      {/* El tipo de problema se lee desde la lista: es lo que permite decidir a
          cuál entrar sin abrirlos de a uno. */}
      <div style={{ minWidth: 0 }}>
        <VerificacionChip estado={group.verificacion} compact />
        {group.verificacion === "problema" && (group.verificacionProblemas || []).length > 0 && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 3 }}>
            {group.verificacionProblemas.slice(0, 2).map((clave) => (
              <span key={clave} style={{ color: C.red, border: `1px solid ${C.redB}`, background: C.redL, borderRadius: 5, padding: "0 5px", fontSize: 9, fontWeight: 900, whiteSpace: "nowrap" }}>
                {PROBLEMA_LABEL[clave] || clave}
              </span>
            ))}
            {group.verificacionProblemas.length > 2 && (
              <span style={{ color: C.dim, fontSize: 9, fontWeight: 900 }}>+{group.verificacionProblemas.length - 2}</span>
            )}
          </div>
        )}
      </div>

      <ProductPrimaryAction action={primaryAction} />
    </div>
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
                Opción · {pv.variante}: {fmtQty(pv.available)}{pv.transitQty > 0 ? ` (+${fmtQty(pv.transitQty)} por recibir)` : ""}
              </span>
            ))}
          </span>
        )}
        {location.transitQty > 0 && (
          <span style={{ display: "block", color: C.violet, fontSize: 10.5, marginTop: 2 }}>por recibir {fmtQty(location.transitQty)}</span>
        )}
      </span>
      <span style={{ color: location.available < 0 ? C.red : C.green, fontFamily: C.mono, fontSize: 14, fontWeight: 950 }}>{fmtQty(location.available)}</span>
    </button>
  );
}

function KardexRow({ row, onRevert, busy, obraById, onDevolucion }) {
  const delta = rowDelta(row);
  const isLocation = rowIsLocationChange(row);
  const isOut = row.estado === "egresado";
  const isAssignment = rowIsAsignacionStock(row);
  const isTransit = rowIsTransit(row);
  const egresoMeta = rowEgresoMeta(row);
  const label = isLocation ? "Ubicacion" : isAssignment ? egresoMeta.label : isTransit ? "Transito" : isOut ? egresoMeta.label : row.estado === "problema" ? "Problema" : "Ingreso";
  const labelColor = isLocation ? C.blue : isAssignment ? egresoMeta.color : isTransit ? C.violet : isOut ? egresoMeta.color : C.green;
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
    <div style={{ display: "grid", gridTemplateColumns: "74px minmax(0, 1fr) 86px 150px", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
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
      {/* Revertir y devolver son cosas distintas y conviven:
            · Revertir  — el movimiento no debió existir. Se deshace.
            · Devolución — el movimiento estuvo bien, el material salió de
              verdad, pero volvió fallado. Es un evento nuevo, no un deshacer. */}
      <span style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        {delta !== 0 && (
          <button
            type="button"
            onClick={() => onRevert?.(row)}
            disabled={busy || yaAnulado}
            title={yaAnulado ? "Este movimiento ya fue anulado" : "El movimiento fue un error: deshacerlo"}
            style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.dim, borderRadius: 8, padding: "6px 7px", cursor: (busy || yaAnulado) ? "default" : "pointer", fontSize: 10.5, fontWeight: 850, fontFamily: C.sans, opacity: (busy || yaAnulado) ? 0.45 : 1 }}
          >
            {yaAnulado ? "Anulado" : "Revertir"}
          </button>
        )}
        {isOut && !yaAnulado && onDevolucion && (
          <button
            type="button"
            onClick={() => onDevolucion(row)}
            disabled={busy}
            title="Salió bien pero el operario lo devolvió fallado"
            style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 8, padding: "6px 7px", cursor: busy ? "default" : "pointer", fontSize: 10.5, fontWeight: 900, fontFamily: C.sans, opacity: busy ? 0.45 : 1 }}
          >
            Generar devolución
          </button>
        )}
      </span>
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

function cleanCartVariant(value) {
  return String(value || "").trim();
}

function cartVariantKey(value) {
  const variant = cleanCartVariant(value).toLocaleLowerCase("es");
  return encodeURIComponent(variant || "sin-especificar");
}

function cartLineKey(baseKey, variante = "") {
  return `${baseKey}::variante:${cartVariantKey(variante)}`;
}

function cartBaseKey(item) {
  if (item?.baseKey) return item.baseKey;
  return String(item?.key || "").split("::variante:")[0];
}

function availableForVariant(location, variante = "") {
  const variant = cleanCartVariant(variante);
  if (!variant) return qty(location?.available, 0);
  const match = (location?.porVariante || []).find((row) => cleanCartVariant(row.variante).toLocaleLowerCase("es") === variant.toLocaleLowerCase("es"));
  return qty(match?.available, 0);
}

function normalizeStoredCartItem(item) {
  const baseKey = cartBaseKey(item);
  const variante = cleanCartVariant(item?.variante);
  return {
    ...item,
    baseKey,
    key: cartLineKey(baseKey, variante),
    variante,
    locationAvailable: qty(item?.locationAvailable, qty(item?.available, 0)),
    porVariante: Array.isArray(item?.porVariante) ? item.porVariante : [],
    esRequisito: item?.esRequisito === true,
    productosCompatibles: Array.isArray(item?.productosCompatibles) ? item.productosCompatibles : [],
    productoMaterialId: item?.productoMaterialId || "",
  };
}

function refreshCartRequirementMetadata(cart = [], stockRows = []) {
  if (!cart.length || !stockRows.length) return cart;

  const metaByMaterialId = new Map();
  for (const row of stockRows) {
    if (!row?.material_id) continue;
    const current = metaByMaterialId.get(row.material_id);
    const compatibles = Array.isArray(row.productos_compatibles) ? row.productos_compatibles : [];
    if (!current || compatibles.length > current.productosCompatibles.length) {
      metaByMaterialId.set(row.material_id, {
        esRequisito: row.es_requisito === true,
        productosCompatibles: compatibles,
      });
    } else if (row.es_requisito === true && !current.esRequisito) {
      metaByMaterialId.set(row.material_id, { ...current, esRequisito: true });
    }
  }

  let changed = false;
  const next = cart.map((item) => {
    const materialId = item?.material?.id || item?.material_id || item?.materialId || null;
    const meta = materialId ? metaByMaterialId.get(materialId) : null;
    if (!meta) return item;

    const compatibles = meta.productosCompatibles;
    const selectedStillValid = compatibles.some((producto) => producto.id === item.productoMaterialId);
    const productoMaterialId = selectedStillValid
      ? item.productoMaterialId
      : (compatibles.length === 1 ? compatibles[0].id : "");
    const materialNeedsUpdate = item?.material?.es_requisito !== meta.esRequisito;
    const compatiblesChanged = JSON.stringify(item.productosCompatibles || []) !== JSON.stringify(compatibles);
    if (
      item.esRequisito === meta.esRequisito
      && item.productoMaterialId === productoMaterialId
      && !materialNeedsUpdate
      && !compatiblesChanged
    ) return item;

    changed = true;
    return {
      ...item,
      esRequisito: meta.esRequisito,
      productosCompatibles: compatibles,
      productoMaterialId,
      material: item.material ? { ...item.material, es_requisito: meta.esRequisito } : item.material,
    };
  });
  return changed ? next : cart;
}

function remainingCartVariants(item, cart = []) {
  const baseKey = cartBaseKey(item);
  const used = new Set(
    cart
      .filter((row) => cartBaseKey(row) === baseKey)
      .map((row) => cleanCartVariant(row.variante).toLocaleLowerCase("es"))
      .filter(Boolean),
  );
  return (item?.variantes || []).filter((variant) => !used.has(cleanCartVariant(variant).toLocaleLowerCase("es")));
}

function additionalVariantCartItem(item, variante) {
  const cleanVariant = cleanCartVariant(variante);
  const available = availableForVariant({ available: item.locationAvailable, porVariante: item.porVariante }, cleanVariant);
  const baseKey = cartBaseKey(item);
  return {
    ...item,
    key: cartLineKey(baseKey, cleanVariant),
    baseKey,
    variante: cleanVariant,
    available,
    cantidad: defaultEgresoQty({ available }),
  };
}

function compactEgresoSourceRows(location) {
  return (location?.rows || []).map((row) => ({
    id: row.id,
    material_id: row.material_id || null,
    requisito_material_id: row.requisito_material_id || null,
    cantidad: row.cantidad,
    cantidad_egresada: row.cantidad_egresada,
    estado: row.estado,
    recepcion_estado: row.recepcion_estado,
    source: row.source,
    variante: row.variante || "",
    opcion_asignada: row.opcion_asignada || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }));
}

function makeCartItem(group, location, { cantidad, sede, codigo, unidad, variante = "" } = {}) {
  const isCatalogOnly = !!group?.catalogOnly;
  const itemSede = isCatalogOnly ? sede : (location?.sede || sede);
  const baseKey = `${group.key}::${isCatalogOnly ? itemSede || "general" : location?.key || "stock"}`;
  const cleanVariant = cleanCartVariant(variante);
  const variantAvailable = availableForVariant(location, cleanVariant);
  const variantes = [...new Set([
    ...(Array.isArray(group.variantes) ? group.variantes : []),
    ...(location?.porVariante || []).map((row) => cleanCartVariant(row.variante)),
  ].filter(Boolean))];
  return {
    key: cartLineKey(baseKey, cleanVariant),
    baseKey,
    groupKey: group.key,
    label: group.label,
    material: group.material,
    codigo: isCatalogOnly ? String(codigo || "").trim() : group.codigo,
    unidad: isCatalogOnly ? String(unidad || group.unidad || "unidad").trim() : group.unidad,
    cantidad: String(cantidad || defaultEgresoQty({ available: variantAvailable })),
    sede: itemSede || "",
    obraId: isCatalogOnly ? null : (location?.obraId || null),
    locationLabel: isCatalogOnly ? (itemSede ? `Stock ${itemSede}` : "Sin registro digital") : (location?.label || "Stock general"),
    available: variantAvailable,
    locationAvailable: qty(location?.available, 0),
    porVariante: Array.isArray(location?.porVariante) ? location.porVariante.map((row) => ({ ...row })) : [],
    catalogOnly: isCatalogOnly,
    transferable: !isCatalogOnly,
    esAdicional: !!group.esAdicional,
    variantes,
    variante: cleanVariant,
    esRequisito: group.esRequisito === true,
    productosCompatibles: Array.isArray(group.productosCompatibles) ? group.productosCompatibles : [],
    productoMaterialId: "",
    sourceRows: compactEgresoSourceRows(location),
  };
}

function egresoDisplayEmployee(empleado) {
  if (!empleado) return null;
  return {
    name: String(empleado.nombre || "").trim(),
    dni: String(empleado.dni || "").trim(),
    photoUrl: String(empleado.foto_url || "").trim(),
    sede: String(empleado.sede || "").trim(),
  };
}

function egresoDisplayDestination(cart = [], obras = [], destinoObraId = "", sectorDestino = "") {
  const selected = obras.find((obra) => obra.id === destinoObraId)?.codigo;
  if (selected) return selected;
  const assigned = [...new Set(
    cart
      .map((item) => obras.find((obra) => obra.id === item.obraId)?.codigo)
      .filter(Boolean),
  )];
  if (assigned.length) return assigned.join(", ");
  return String(sectorDestino || "").trim() || "Destino a confirmar";
}

function egresoDisplayItems(cart = [], obras = [], destinoObraId = "") {
  const selectedDestination = obras.find((obra) => obra.id === destinoObraId)?.codigo || "";
  return cart.map((item) => ({
    key: item.key,
    label: item.label,
    quantity: qty(item.cantidad, 0),
    unit: item.unidad || "u",
    variant: item.variante || "",
    origin: item.locationLabel || (item.sede ? `Stock ${item.sede}` : "Pañol"),
    destination: selectedDestination || obras.find((obra) => obra.id === item.obraId)?.codigo || "",
  }));
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
    if (!group || cantidadNum <= 0 || transitOnly) return;
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
          <div style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>Egreso multiple</div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Agregá varios productos y confirmalos juntos. Sólo se puede retirar stock físicamente recibido.</div>
        </div>
        <button type="button" onClick={() => openEgresoDisplay(toast)} title="Abrir la pantalla que ve la persona que retira" style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 9, padding: "7px 9px", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, fontWeight: 900, fontFamily: C.sans, whiteSpace: "nowrap" }}>
          <MonitorUp size={14} /> Pantalla
        </button>
      </div>

      {group ? (
        <div style={{ border: `1px solid ${C.border}`, background: C.bg, borderRadius: 10, padding: 10, display: "grid", gap: 8 }}>
          <div style={{ color: C.text, fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</div>
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
              <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>Variante</span>
              <select
                value={variante}
                onChange={(event) => {
                  const nextVariant = event.target.value;
                  setVariante(nextVariant);
                  setCantidad(defaultEgresoQty({ available: availableForVariant(selectedLocation, nextVariant) }));
                }}
                style={{ background: C.panelSolid, border: `1px solid ${variante ? "rgba(139,92,246,0.45)" : C.border}`, color: variante ? C.violet : C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", cursor: "pointer", fontWeight: variante ? 850 : 500 }}
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
              <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>Cantidad</span>
              <input type="number" min="0.01" step="any" value={cantidad} onChange={(event) => setCantidad(event.target.value)} style={{ background: C.panelSolid, border: `1px solid ${willGoNegative ? C.redB : C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.mono, outline: "none" }} />
            </label>
            <button type="button" onClick={addCurrentToCart} disabled={!canReceive || cantidadNum <= 0 || transitOnly || isCatalogOnly || willGoNegative} style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 9, padding: "10px 12px", cursor: !canReceive || cantidadNum <= 0 || transitOnly || isCatalogOnly || willGoNegative ? "default" : "pointer", opacity: !canReceive || cantidadNum <= 0 || transitOnly || isCatalogOnly || willGoNegative ? 0.55 : 1, fontSize: 12, fontWeight: 950, fontFamily: C.sans }}>
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
          <span style={{ color: C.text, fontSize: 12.5, fontWeight: 950 }}>Seleccionados</span>
          <span style={{ color: C.dim, fontSize: 11 }}>{totalLineas} {totalLineas === 1 ? "renglon" : "renglones"} · {fmtQty(totalUnidades)} unidades</span>
        </div>
        <div style={{ display: "grid", maxHeight: 220, overflowY: "auto" }}>
          {cart.length ? cart.map((item) => (
            <div key={item.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 84px 28px", gap: 8, alignItems: "center", padding: "9px 10px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.locationLabel}{item.sede ? ` · ${item.sede}` : ""}{item.catalogOnly ? " · sin registro digital" : ""}
                </div>
                {item.esRequisito && (
                  <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                    <select
                      value={item.productoMaterialId || ""}
                      onChange={(event) => updateCartItemProduct(item.key, event.target.value)}
                      style={{ background: item.productoMaterialId ? C.greenL : C.violetL, border: `1px solid ${item.productoMaterialId ? C.greenB : C.violetB}`, color: item.productoMaterialId ? C.green : C.violet, borderRadius: 8, padding: "5px 7px", fontSize: 11, fontFamily: C.sans, outline: "none", width: "100%", cursor: "pointer", fontWeight: 850 }}
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
                      style={{ background: C.panelSolid, border: `1px solid ${item.variante ? "rgba(139,92,246,0.45)" : C.border}`, color: item.variante ? C.violet : C.text, borderRadius: 8, padding: "4px 7px", fontSize: 11, fontFamily: C.sans, outline: "none", width: "100%", cursor: "pointer", fontWeight: item.variante ? 850 : 500 }}
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
                        style={{ background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue, borderRadius: 8, padding: "4px 7px", fontSize: 10.5, fontFamily: C.sans, outline: "none", width: "100%", cursor: "pointer", fontWeight: 850 }}
                      >
                        <option value="">Elegir otra variante...</option>
                        {remainingCartVariants(item, cart).map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    ) : (
                      <button type="button" onClick={() => setVariantAdderKey(item.key)} style={{ justifySelf: "start", border: "none", background: "transparent", color: C.blue, padding: "2px 0", fontSize: 10.5, fontWeight: 900, fontFamily: C.sans, cursor: "pointer" }}>
                        + Agregar otra variante
                      </button>
                    ))}
                  </div>
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
          <button type="button" onClick={() => { setCart([]); resetEgresoDisplay(); }} disabled={saving} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 10, padding: "10px 12px", cursor: saving ? "default" : "pointer", fontSize: 12, fontWeight: 900, fontFamily: C.sans }}>
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
  const willGoNegative = action === "egresar" && cantidadNum > (selectedLocation?.available || 0);
  const insufficientStock = (action === "egresar" || action === "asignar")
    && (isCatalogOnly || cantidadNum > (selectedLocation?.available || 0) + 0.0001);
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
  const retiroNfc = useRetiroNfc({ enabled: canReceive && action === "egresar", onEmpleado: setRetiradoPor, toast });

  async function submit() {
    if (!canReceive) return;
    if (!group) {
      toast.warning("Elegí un producto.");
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
    <div style={{ border: `1px solid ${action === "egresar" ? C.greenB : C.border}`, background: C.panelSolid, borderRadius: 12, padding: 13, display: "grid", gap: 11 }}>
      <div>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>{action === "egresar" ? "Egresar material" : action === "ingresar" ? "Ingresar ajuste" : "Asignar stock"}</div>
        <div style={{ color: C.dim, fontSize: 11.5, marginTop: 2 }}>{action === "egresar" ? "Cantidad, destino y receptor en un solo paso." : "Movimiento registrado en kardex."}</div>
      </div>
      {isCatalogOnly && (
        <div style={{ color: C.violet, fontSize: 11, lineHeight: 1.35 }}>Sin stock recibido: registrá el ingreso físico antes de intentar un egreso.</div>
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
        <div style={{ border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, borderRadius: 10, padding: "9px 10px", fontSize: 12, lineHeight: 1.35 }}>
          Esta linea esta en transito y todavia no fue recibida por pañol. No cuenta como stock cargado.
        </div>
      )}

      {!transitOnly && willGoNegative && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, padding: "9px 10px", fontSize: 12, lineHeight: 1.35 }}>
          <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>Stock insuficiente: disponible {fmtQty(selectedLocation?.available || 0)}. Corregí la cantidad o registrá el ingreso primero.</span>
        </div>
      )}

      {action === "egresar" && (
        <>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>Obra a la que va</span>
            <select value={destinoObraId} onChange={(event) => setDestinoObraId(event.target.value)} style={{ background: C.bg, border: `1px solid ${!destinoObraId && !selectedLocation?.obraId ? C.violetB : C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }}>
              <option value="">Sin obra (mantenimiento, río, etc.)</option>
              {obrasActivas.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
            </select>
            {!destinoObraId && !selectedLocation?.obraId && (
              <span style={{ color: C.violet, fontSize: 10.5 }}>Sin obra: es obligatorio detallar abajo a dónde va.</span>
            )}
          </label>
          <RetiroNfcBox nfc={retiroNfc} onClear={() => { retiroNfc.clear(); setRetiradoPor(""); }} compact materialIds={group?.material?.id ? [group.material.id] : []} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <input value={retiradoPor} onChange={(event) => setRetiradoPor(event.target.value)} placeholder="Nombre y apellido de quien retira" style={{ background: C.bg, border: `1px solid ${retiradoError && retiradoPor.trim() ? C.redB : C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 }} />
              {retiradoError && <span style={{ color: C.violet, fontSize: 10.5, lineHeight: 1.3 }}>Obligatorio: nombre y apellido.</span>}
              {!retiradoError && !retiroNfc.empleado && <span style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.3 }}>La tarjeta es opcional por ahora: con nombre y apellido alcanza.</span>}
            </label>
            <input value={sectorDestino} onChange={(event) => setSectorDestino(event.target.value)} placeholder="Sector / uso" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none", minWidth: 0 }} />
          </div>
        </>
      )}

      <input value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Observación (opcional)" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontFamily: C.sans, outline: "none" }} />

      {(() => {
        const disabled = saving || !canReceive || cantidadNum <= 0 || transitOnly || insufficientStock || (action === "asignar" && !destinoObraId);
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

// Panel de revisión del maestro. Es el lugar donde el pañolero, con la pieza en
// la mano, arregla lo que está mal y lo deja marcado.
//
// Va en dos pasos y no en uno: primero se corrigen los datos, y recién si algo
// no cierra se abre el bloque del problema. Antes había un botón "Tiene un
// problema" al lado de un campo de texto suelto, y no se entendía qué había que
// escribir ahí ni qué pasaba después de apretarlo.
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
        <span style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>Revisión del maestro</span>
        <VerificacionChip estado={estado} />
        <span style={{ color: C.dim, fontSize: 11 }}>Tu usuario no puede revisar productos.</span>
      </div>
    );
  }

  const campo = { width: "100%", minWidth: 0, boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "8px 10px", fontSize: 12.5, fontFamily: C.sans, outline: "none" };
  const rotulo = { color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 };
  const paso = { width: 18, height: 18, borderRadius: 999, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue, fontSize: 10, fontWeight: 950, flexShrink: 0 };

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
        <span style={{ color: C.text, fontSize: 12.5, fontWeight: 950 }}>Revisión del maestro</span>
        <VerificacionChip estado={estado} />
        <button type="button" onClick={() => setVerHistorial((v) => !v)}
          style={{ marginLeft: "auto", border: "none", background: "transparent", color: C.blue, fontSize: 11, fontWeight: 850, cursor: "pointer", fontFamily: C.sans, padding: 0 }}>
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
            <span style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>Corregí la ficha con el producto en la mano</span>
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
            <div style={{ paddingBottom: 8, whiteSpace: "nowrap", color: difiere ? C.red : C.dim, fontSize: 11.5, fontWeight: difiere ? 900 : 750 }}>
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
            <span style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>¿Quedó bien?</span>
          </div>

          {!abrirProblema ? (
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <button type="button" onClick={() => guardar("ok")} disabled={!!guardando}
                style={{ flex: "1 1 190px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 9, padding: "10px 12px", cursor: guardando ? "default" : "pointer", fontSize: 12.5, fontWeight: 950, fontFamily: C.sans, opacity: guardando ? 0.6 : 1 }}>
                <CheckCircle2 size={14} /> {guardando === "ok" ? "Guardando…" : "Sí, guardar y marcar revisado"}
              </button>
              <button type="button" onClick={() => setAbrirProblema(true)} disabled={!!guardando}
                style={{ flex: "1 1 150px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, borderRadius: 9, padding: "10px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 900, fontFamily: C.sans }}>
                <AlertTriangle size={14} /> No, hay algo mal
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 9, border: `1px solid ${C.redB}`, background: C.redL, borderRadius: 10, padding: 10 }}>
              <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>¿Qué está mal? Marcá todo lo que corresponda</div>
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
                        display: "grid", placeItems: "center", color: "#fff", fontSize: 10, fontWeight: 950, lineHeight: 1,
                      }}>{on ? "✓" : ""}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", color: on ? C.red : C.text, fontSize: 12, fontWeight: 900 }}>{label}</span>
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
                  style={{ flex: "1 1 190px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px solid ${C.redB}`, background: problemas.length ? C.red : C.panel, color: problemas.length ? "#fff" : C.dim, borderRadius: 9, padding: "10px 12px", cursor: guardando || !problemas.length ? "default" : "pointer", fontSize: 12.5, fontWeight: 950, fontFamily: C.sans, opacity: guardando ? 0.6 : 1 }}>
                  <AlertTriangle size={14} />
                  {guardando === "problema"
                    ? "Guardando…"
                    : problemas.length
                      ? `Guardar con ${problemas.length} problema${problemas.length === 1 ? "" : "s"}`
                      : "Elegí qué está mal"}
                </button>
                <button type="button" onClick={() => { setAbrirProblema(false); setProblemas([]); }} disabled={!!guardando}
                  style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 9, padding: "10px 12px", cursor: "pointer", fontSize: 12, fontWeight: 850, fontFamily: C.sans }}>
                  Estaba bien
                </button>
              </div>
            </div>
          )}

          {estado !== "pendiente" && (
            <button type="button" onClick={() => guardar("pendiente")} disabled={!!guardando}
              style={{ justifySelf: "start", border: "none", background: "transparent", color: C.dim, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: C.sans, textDecoration: "underline", padding: 0 }}>
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
                      <span key={clave} style={{ color: C.red, border: `1px solid ${C.redB}`, background: C.redL, borderRadius: 6, padding: "1px 6px", fontSize: 9.5, fontWeight: 900 }}>
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

function ProductDetail({ group, isMobile, obras, sedeLocked, canReceive, mode, onDone, toast, setSelectedKey, cart, setCart, onOpenCatalog }) {
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
  );

  function renderLocationSection(collapsible = false) {
    if (!canReceive) return null;
    if (collapsible) {
      return (
        <details style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 11, overflow: "hidden" }}>
          <summary style={{ listStyle: "none", padding: "9px 11px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: C.text, fontSize: 12, fontWeight: 900 }}>
            <MapPin size={14} color={C.blue} />
            <span style={{ flex: 1 }}>Ubicacion y estanteria</span>
            {group.ubicacion ? <UbicacionChip ubicacion={group.ubicacion} obs={group.ubicacion_obs} /> : <span style={{ color: C.dim, fontSize: 10.5, fontWeight: 700 }}>Sin ubicar</span>}
          </summary>
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 12px" }}>{locationEditor}</div>
        </details>
      );
    }
    return <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: "10px 12px" }}>{locationEditor}</div>;
  }

  return (
    <section style={{ minHeight: 0, minWidth: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ color: C.text, fontSize: 17, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</div>
            <KindChip tipo={group.tipoPedido} />
            <AsignadoChip asignaciones={groupAsignaciones(group)} />
            <StateChip egresado={group.egresado} transit={group.inTransit} negative={group.negativo} imbalance={group.locationImbalance} catalogOnly={group.catalogOnly} />
            <UbicacionChip ubicacion={group.ubicacion} obs={group.ubicacion_obs} size="md" />
          </div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>{detCode} · disponible {fmtQty(group.total)} {group.unidad}</div>
          <div style={{ marginTop: 6 }}><OptionStockSummary group={group} max={6} /></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          {group.material?.id && onOpenCatalog && (
            <button type="button" onClick={() => onOpenCatalog(group.material.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 8, padding: "7px 9px", fontSize: 11.5, fontWeight: 900, cursor: "pointer", fontFamily: C.sans }}>
              <ArrowUpRight size={13} />{!isMobile && "Ver ficha del producto"}
            </button>
          )}
          <button type="button" onClick={() => setSelectedKey(null)} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.text, borderRadius: 8, padding: "7px 9px", fontSize: 12, fontWeight: 850, cursor: "pointer" }}>{isMobile ? "Lista" : "Cerrar"}</button>
        </div>
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


        {/* Sin la guarda de catalogOnly: escondía el panel en casos que no
            valía la pena adivinar, y desaparecer sin decir nada es peor que
            aparecer deshabilitado. Cuando no se puede revisar, el panel lo
            explica adentro. */}
        {mode !== "egreso" && (
          <VerificacionPanel group={group} canEdit={canReceive} onDone={onDone} toast={toast} />
        )}

        {mode !== "egreso" && renderLocationSection()}

        {group.esAdicional && detalleAdicional.length > 0 && (
          <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: "10px 12px", display: "grid", gap: 6 }}>
            <div style={{ color: C.violet, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: 1 }}>Detalle del adicional</div>
            {detalleAdicional.map((detalle) => (
              <div key={detalle} style={{ color: C.text, fontSize: 12.5, lineHeight: 1.45 }}>{detalle}</div>
            ))}
          </div>
        )}

        {negativeLocations.length > 0 && (
          <div style={{ border: `1px solid ${group.negativo ? C.redB : C.violetB}`, background: group.negativo ? C.redL : C.violetL, borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
            <div style={{ color: group.negativo ? C.red : C.violet, fontSize: 12.5, fontWeight: 950 }}>{group.negativo ? "Pendiente de reconciliar" : "Distribución por obra a revisar"}</div>
            {!group.negativo && <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.4 }}>El stock total alcanza, pero parte quedó registrada en otra obra o ubicación. Reasignalo desde una ubicación con saldo; no cargues un ingreso nuevo.</div>}
            {negativeLocations.map((loc) => (
              <div key={loc.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loc.label}</div>
                  <div style={{ color: group.negativo ? C.red : C.violet, fontFamily: C.mono, fontSize: 11, fontWeight: 900 }}>{group.negativo ? "faltan" : "desbalance"} {fmtQty(Math.abs(loc.available))} {group.unidad}</div>
                </div>
                {group.negativo && <button type="button" onClick={() => ingresarFaltante(loc)} disabled={reconcilingKey === loc.key} style={{ border: `1px solid ${C.redB}`, background: C.panelSolid, color: C.red, borderRadius: 9, padding: "8px 10px", cursor: reconcilingKey === loc.key ? "default" : "pointer", fontSize: 12, fontWeight: 950, fontFamily: C.sans, opacity: reconcilingKey === loc.key ? 0.65 : 1 }}>
                  {reconcilingKey === loc.key ? "Cargando..." : "Cargar ingreso faltante"}
                </button>}
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

        {mode === "egreso" && renderLocationSection(true)}

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
              onDevolucion={(movimiento) => setDevolucionTarget({ row: movimiento, cantidad: String(Math.abs(rowDelta(movimiento)) || ""), motivo: "defectuoso", detalle: "", necesita: "esperando_reposicion", responsable: "sin_definir" })}
            />
          )) : (
            <div style={{ color: C.dim, fontSize: 12, padding: "12px 0" }}>
              {(ocultarAnulados && sortedRows.length) ? "Todos los movimientos están anulados. Desactivá el filtro para verlos." : "Producto sin movimientos todavía. Registrá un ingreso o una recepción antes de egresarlo."}
            </div>
          )}
        </div>
      </div>
      {/* Devolución: el operario probó el material y volvió fallado. No vuelve a
          stock — queda apartado y Compras decide si se repara o se reclama. */}
      {devolucionTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,23,42,0.38)", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ width: "min(500px, 100%)", border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, boxShadow: "0 24px 70px rgba(15,23,42,0.22)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Generar devolución</div>
              <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
                {devolucionTarget.row.descripcion || group.label}
                {devolucionTarget.row.retirado_por ? ` · lo retiró ${devolucionTarget.row.retirado_por}` : ""}
              </div>
            </div>

            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 10 }}>
                <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
                  <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Cantidad</span>
                  <input
                    value={devolucionTarget.cantidad}
                    onChange={(e) => setDevolucionTarget((p) => ({ ...p, cantidad: e.target.value }))}
                    inputMode="decimal"
                    size={1}
                    style={{ width: "100%", minWidth: 0, boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.mono, outline: "none" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
                  <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Motivo</span>
                  <select
                    value={devolucionTarget.motivo}
                    onChange={(e) => setDevolucionTarget((p) => ({ ...p, motivo: e.target.value }))}
                    style={{ width: "100%", minWidth: 0, boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.sans, outline: "none" }}
                  >
                    {DEVOLUCION_MOTIVOS.map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
                  </select>
                </label>
              </div>

              <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Qué le pasa</span>
                <input
                  value={devolucionTarget.detalle}
                  onChange={(e) => setDevolucionTarget((p) => ({ ...p, detalle: e.target.value }))}
                  placeholder="Ej: vino con la rosca pasada"
                  size={1}
                  style={{ width: "100%", minWidth: 0, boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.sans, outline: "none" }}
                />
              </label>

              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Qué necesita</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DEVOLUCION_NECESITA.map(([valor, label]) => {
                    const on = devolucionTarget.necesita === valor;
                    return (
                      <button key={valor} type="button"
                        onClick={() => setDevolucionTarget((p) => ({ ...p, necesita: valor }))}
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
                    const on = devolucionTarget.responsable === valor;
                    return (
                      <button key={valor} type="button"
                        onClick={() => setDevolucionTarget((p) => ({ ...p, responsable: valor }))}
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
                Queda apartado, <b>no vuelve al stock</b>. Se avisa a Compras para que definan si
                se manda a reparar o se reclama la reposición, y la obra queda con esa cantidad pendiente.
              </div>
            </div>

            <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setDevolucionTarget(null)}
                style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.muted, borderRadius: 9, padding: "8px 14px", cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: C.sans }}>
                Cancelar
              </button>
              <button
                type="button"
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
                style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 9, padding: "8px 16px", cursor: devolucionBusy ? "default" : "pointer", fontSize: 12, fontWeight: 900, fontFamily: C.sans, opacity: devolucionBusy ? 0.6 : 1 }}
              >
                {devolucionBusy ? "Registrando…" : "Registrar devolución"}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div style={{ border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, borderRadius: 10, padding: "9px 10px", fontSize: 12, lineHeight: 1.4 }}>
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
      if (movementKind === "consumir") {
        publishEgresoDisplay({
          status: "error",
          error: error.message || "No se pudo registrar el movimiento.",
        });
      }
      toast.error(error.message || "No se pudo registrar el movimiento.");
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
      <div style={{ padding: "13px 16px", background: "#059669", display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.22)", color: "#fff", flexShrink: 0 }}>
          <ShoppingCart size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontSize: 15.5, fontWeight: 950, lineHeight: 1.1 }}>Carrito de pañol</div>
          <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 11, marginTop: 2 }}>{cart.length} {cart.length === 1 ? "renglon" : "renglones"} · {fmtQty(totalUnidades)} unidades</div>
        </div>
        <button type="button" onClick={() => openEgresoDisplay(toast)} title="Abrir la pantalla que ve la persona que retira" style={{ border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: 9, height: 28, padding: "0 9px", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, fontWeight: 900, fontFamily: C.sans }}>
          <MonitorUp size={13} /> Pantalla
        </button>
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
                  <div key={item.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 84px 28px", gap: 8, alignItems: "center", padding: "8px 10px", border: `1px solid ${excede ? C.violetB : C.border}`, borderRadius: 10, background: C.panelSolid }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.text, fontSize: 12.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                      <div style={{ color: excede ? C.violet : C.dim, fontSize: 10.5, marginTop: 1 }}>
                        {item.catalogOnly ? "sin stock recibido" : `disponible ${fmtQty(item.available)} ${item.unidad || ""}`}{excede ? " · cantidad excedida" : ""}
                      </div>
                      {item.esRequisito && (
                        <div style={{ display: "grid", gap: 4, marginTop: 5 }}>
                          <select
                            value={item.productoMaterialId || ""}
                            onChange={(event) => updateCartItemProduct(item.key, event.target.value)}
                            style={{ ...inp, width: "100%", padding: "6px 7px", fontSize: 11, cursor: "pointer", color: item.productoMaterialId ? C.green : C.violet, borderColor: item.productoMaterialId ? C.greenB : C.violetB, background: item.productoMaterialId ? C.greenL : C.violetL, fontWeight: 850 }}
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
                            style={{ ...inp, width: "100%", padding: "5px 7px", fontSize: 11, cursor: "pointer", color: item.variante ? C.violet : C.text, borderColor: item.variante ? "rgba(139,92,246,0.45)" : C.border, fontWeight: item.variante ? 850 : 500 }}
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
                              style={{ ...inp, width: "100%", padding: "5px 7px", fontSize: 10.5, cursor: "pointer", color: C.blue, borderColor: C.blueB, background: C.blueL, fontWeight: 850 }}
                            >
                              <option value="">Elegir otra variante...</option>
                              {remainingCartVariants(item, cart).map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                          ) : (
                            <button type="button" onClick={() => setVariantAdderKey(item.key)} style={{ justifySelf: "start", border: "none", background: "transparent", color: C.blue, padding: "2px 0", fontSize: 10.5, fontWeight: 900, fontFamily: C.sans, cursor: "pointer" }}>
                              + Agregar otra variante
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input type="number" min="0.01" step="any" value={item.cantidad} onChange={(event) => updateCartItem(item.key, { cantidad: event.target.value })} style={{ ...inp, fontFamily: C.mono, padding: "7px 8px", borderColor: excede ? C.violetB : C.border }} />
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
          <select value={destinoObraId} onChange={(event) => setDestinoObraId(event.target.value)} style={{ ...inp, cursor: "pointer", borderColor: movementKind === "transferir" && !destinoObraId ? C.violetB : C.border }}>
            <option value="">{movementKind === "transferir" ? "Elegir obra…" : "Cada ítem sale a su obra asignada (stock libre: detallar)"}</option>
            {obrasActivas.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}</option>)}
          </select>
        </label>

        {/* Qué va a pasar */}
        <div style={{ border: `1px dashed ${cruzados.length ? C.violetB : C.blueB}`, background: cruzados.length ? C.violetL : C.blueL, borderRadius: 11, padding: "9px 11px" }}>
          <div style={{ fontSize: 10, fontWeight: 950, color: cruzados.length ? C.violet : C.blue, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Qué va a pasar</div>
          <div style={{ display: "grid", gap: 4 }}>
            {preview.slice(0, 6).map((p) => (
              <div key={p.key} style={{ fontSize: 11, lineHeight: 1.35, color: p.warn ? C.violet : C.text }}>
                <span style={{ fontWeight: 850 }}>{p.warn ? "⚠ " : ""}{p.label}</span>
                <span style={{ color: p.warn ? C.violet : C.dim }}> — {p.det}</span>
              </div>
            ))}
            {preview.length > 6 && <div style={{ fontSize: 10.5, color: C.dim }}>… y {preview.length - 6} más</div>}
          </div>
          {cruzados.length > 0 && (
            <div style={{ fontSize: 10.5, color: C.violet, fontWeight: 850, marginTop: 6 }}>
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
        <button type="button" onClick={() => { setCart([]); resetEgresoDisplay(); }} disabled={saving} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 11, padding: "11px 14px", cursor: saving ? "default" : "pointer", fontSize: 12.5, fontWeight: 900, fontFamily: C.sans }}>
          Vaciar
        </button>
        <button type="button" onClick={submitBatch} disabled={disabled} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: "none", background: disabled ? C.panel2 : (movementKind === "transferir" ? "#2563eb" : "#059669"), color: disabled ? C.dim : "#fff", borderRadius: 11, padding: "12px 14px", fontSize: 13.5, fontWeight: 950, cursor: disabled ? "default" : "pointer", fontFamily: C.sans, boxShadow: disabled ? "none" : "0 8px 20px -9px rgba(5,150,105,0.5)" }}>
          {movementKind === "transferir" ? <RefreshCw size={16} /> : <ArrowUpRight size={16} />}
          {saving ? "Registrando..." : movementKind === "transferir" ? `Asignar todo (${cart.length})` : `Confirmar egreso (${cart.length})`}
        </button>
      </div>
    </div>
  );
}

export default function StockWmsPanel({ sedeLocked = null, isMobile = false, toast, mode = "stock", canReceive = true, canCreateCatalog = false, canSeePrices = true, initialFObra = "todas", initialScope = "todos", initialQuery = "", initialMaterialId = "", onOpenCatalog, onReceiveStock, onRequestReplenishment, stockMaster = false, showCatalogInventory = false, sharedRows = null, sharedObras = null, sharedTransitRows = null, sharedReplenishmentCatalog = null, sharedLoading = false }) {
  const searchInputRef = useRef(null);
  const [rows, setRows] = useState(() => Array.isArray(sharedRows) ? sharedRows : []);
  const [catalogRows, setCatalogRows] = useState([]);
  const [transitRows, setTransitRows] = useState(() => Array.isArray(sharedTransitRows) ? sharedTransitRows : []);
  const [replenishmentCatalog, setReplenishmentCatalog] = useState(() => Array.isArray(sharedReplenishmentCatalog) ? sharedReplenishmentCatalog : []);
  const [obras, setObras] = useState(() => Array.isArray(sharedObras) ? sharedObras : []);
  const [loading, setLoading] = useState(() => sharedLoading || !Array.isArray(sharedRows));
  const [q, setQ] = useState(initialQuery || "");
  const [focusedMaterialId, setFocusedMaterialId] = useState(initialMaterialId || "");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [fSede, setFSede] = useState(sedeLocked || "todas");
  const [fObra, setFObra] = useState(initialFObra);
  const [fCategoria, setFCategoria] = useState("todos");
  const [kindScope, setKindScope] = useState("todos");
  const [scope, setScope] = useState(stockMaster && initialScope === "todos" ? "existencia" : initialScope);
  const [verifScope, setVerifScope] = useState("todos");
  const [orderBy, setOrderBy] = useState(showCatalogInventory || stockMaster ? "estado" : "default");
  const [renderLimit, setRenderLimit] = useState(PRODUCT_RENDER_BATCH);
  const [stockView, setStockView] = useState(() => readStoredStockView());
  const [egresoView, setEgresoView] = useState(() => readStoredEgresoView());
  const [selectedKey, setSelectedKey] = useState(null);
  const [catalogMatches, setCatalogMatches] = useState([]);
  const [creating, setCreating] = useState(false);
  const [draftGroup, setDraftGroup] = useState(null);
  const stockManagement = stockMaster || showCatalogInventory;
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

  // Agregado rápido al carrito desde la tarjeta (modo egreso): toma el stock disponible
  // de la ubicación principal y lo suma al carrito, sin abrir el detalle.
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
      cantidad: loc.available > 0 ? Number(loc.available.toFixed(2)) : 1,
      sede: sedeLocked || loc.sede,
      codigo: group.codigo,
      unidad: group.unidad,
    });
    setCart((prev) => {
      const exists = prev.find((row) => row.key === item.key);
      if (!exists) return [...prev, item];
      return prev.map((row) => row.key === item.key ? { ...row, ...item } : row);
    });
    setCartOpen(true);
    toast?.success?.(`${group.label} → carrito`);
  }, [canReceive, sedeLocked, toast]);

  const primaryActionFor = useCallback((group) => {
    if (!stockMaster) return null;
    const hasStock = Number(group?.total || 0) > 0.0001;
    const shouldReceive = group?.buckets?.has("en_camino") && (scope === "en_camino" || !hasStock);
    const shouldReplenish = group?.buckets?.has("reponer") && (scope === "reponer" || (!hasStock && !shouldReceive));

    if (shouldReceive && onReceiveStock) {
      return {
        label: "Recibir",
        title: "Abrir los avisos pendientes de recepción",
        Icon: PackagePlus,
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
        color: C.violet,
        border: C.violetB,
        background: C.violetL,
        onClick: () => onRequestReplenishment(group),
      };
    }
    if (hasStock && canReceive) {
      const alreadyInCart = cartGroupKeys.has(group.key);
      return {
        label: alreadyInCart ? "En carrito" : "Egresar",
        title: alreadyInCart ? "Actualizar el producto en el carrito" : "Agregar al egreso",
        Icon: ArrowUpRight,
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
        color: C.violet,
        border: C.violetB,
        background: C.violetL,
        onClick: () => onRequestReplenishment(group),
      };
    }
    return null;
  }, [canReceive, cartGroupKeys, onReceiveStock, onRequestReplenishment, quickAddToCart, scope, stockMaster]);

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
      const [stockRows, obraRows, catalog, pendingRows, replenishRows] = await Promise.all([
        useSharedSnapshot ? Promise.resolve(sharedRows) : fetchMaterialesEgreso({ sede, estados: LEDGER_STATES }),
        useSharedSnapshot ? Promise.resolve(sharedObras) : fetchObrasEgreso().catch(() => []),
        // El maestro sólo muestra el código principal. Los códigos alternativos
        // siguen cargándose en recepción/escaneo, donde sí son necesarios.
        showCatalogInventory ? fetchPanolCatalogFull({ includeAdditionalBarcodes: false }).catch(() => []) : Promise.resolve([]),
        Array.isArray(sharedTransitRows) ? Promise.resolve(sharedTransitRows) : Promise.resolve([]),
        Array.isArray(sharedReplenishmentCatalog) ? Promise.resolve(sharedReplenishmentCatalog) : Promise.resolve([]),
      ]);
      setRows(stockRows);
      setObras(obraRows);
      setCatalogRows(catalog);
      setTransitRows(pendingRows);
      setReplenishmentCatalog(replenishRows);
      hasLoadedRef.current = true;
    } catch (error) {
      toast.error(error.message || "No se pudo cargar el stock.");
    } finally {
      setLoading(false);
    }
  }, [fSede, sedeLocked, sharedLoading, sharedObras, sharedReplenishmentCatalog, sharedRows, sharedTransitRows, showCatalogInventory, toast]);

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

  const categoriaOptions = useMemo(() => filterOptions(inventoryRows, categoryLabel), [inventoryRows]);
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

  const productGroupsBase = useMemo(() => {
    const stockGroups = buildProductGroups(searchedRows, fObra);
    if (stockMaster) {
      const stockedIds = new Set(stockGroups.map((group) => group.material?.id).filter(Boolean));
      const term = norm(q);
      const policyOnly = (fObra === "todas" && ["todos", "stock"].includes(kindScope) ? replenishmentCatalog : [])
        .filter((material) => !stockedIds.has(material.id))
        .filter((material) => !focusedMaterialId || material.id === focusedMaterialId)
        .filter((material) => !term || materialMatchScore(material, q) >= 42)
        .filter(() => fCategoria === "todos")
        .map((material) => {
          const group = emptyCatalogGroup(material, sedeLocked || (fSede !== "todas" ? fSede : "Pampa"));
          group.catalogOnly = false;
          group.replenishmentOnly = true;
          group.tipoPedido = "stock";
          return group;
        });
      return [...stockGroups, ...policyOnly]
        .map((group) => ({ ...group, ...groupOperationalBuckets(group) }))
        .filter((group) => group.buckets.size > 0);
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
      .map((material) => {
        const group = emptyCatalogGroup(material, sedeLocked || (fSede !== "todas" ? fSede : "Pampa"));
        const category = categoryById.get(material.categoria_id) || "";
        group.tipoPedido = "stock";
        group.categorias = new Set(category ? [category] : []);
        return group;
      })
      .filter((group) => fCategoria === "todos" || group.categorias.has(fCategoria));
    return [...stockGroups, ...catalogOnly];
  }, [catalogRows, fCategoria, fObra, fSede, focusedMaterialId, kindScope, q, replenishmentCatalog, rows, searchedRows, sedeLocked, showCatalogInventory, stockMaster]);
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

  const productGroups = useMemo(() => {
    const withDraft = draftGroup && norm(q) && norm(draftGroup.label).includes(norm(q))
      ? [draftGroup, ...productGroupsBase.filter((group) => group.key !== draftGroup.key)]
      : productGroupsBase;
    // La revisión es una dimensión aparte del nivel de stock: se puede querer
    // "lo crítico que además nadie revisó", así que se aplica encima.
    const base = verifScope === "todos" ? withDraft : withDraft.filter((group) => {
      if (verifScope === "sin_datos") return !group.ubicacion || !group.codigo;
      const estado = group.verificacion === "ok" || group.verificacion === "problema" ? group.verificacion : "pendiente";
      return estado === verifScope;
    });
    if (stockMaster && ["existencia", "reponer", "en_camino", "sin_ubicacion", "reconciliar"].includes(scope)) {
      return sortProductGroups(base.filter((group) => group.buckets?.has(scope)), orderBy);
    }
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
  }, [draftGroup, orderBy, productGroupsBase, q, scope, selectedKey, stockMaster, verifScope]);

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
  }, [fCategoria, fObra, fSede, kindScope, orderBy, q, scope, stockView, verifScope]);

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

  const kpis = useMemo(() => {
    if (stockMaster) {
      const count = (bucket) => productGroupsBase.filter((group) => group.buckets?.has(bucket)).length;
      return {
        productos: count("existencia"),
        unidades: fmtQty(productGroupsBase.reduce((sum, group) => sum + Math.max(0, group.total || 0), 0)),
        negativos: count("reconciliar"),
        sinUbicacion: count("sin_ubicacion"),
        transito: fmtQty(productGroupsBase.filter((group) => group.buckets?.has("en_camino")).reduce((sum, group) => sum + group.transitQty, 0)),
        reponer: count("reponer"),
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
  }, [fObra, productGroupsBase, rows, stockMaster]);

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

  const saveStockMinimum = useCallback(async (group, value) => {
    const materialId = group?.material?.id;
    try {
      await actualizarStockMinimoPanol(materialId, value);
      setRows((prev) => prev.map((row) => row.material_id === materialId ? { ...row, stock_minimo: value } : row));
      setCatalogRows((prev) => prev.map((material) => material.id === materialId ? { ...material, stock_minimo: value } : material));
      toast?.success?.(value == null ? "Stock mínimo quitado." : `Stock mínimo guardado: ${fmtQty(value)} ${group.unidad || "u"}.`);
    } catch (error) {
      toast?.error?.(error.message || "No se pudo guardar el stock mínimo.");
      throw error;
    }
  }, [toast]);

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

  return (
    <>
      <div style={{ background: C.topbarSoft, borderBottom: `1px solid ${C.border}`, padding: isMobile ? "8px 12px" : "8px 18px", display: "grid", gap: 7, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 320px", minWidth: isMobile ? "100%" : 320 }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
            <input
              ref={searchInputRef}
              value={q}
              onChange={(event) => { setQ(event.target.value); setFocusedMaterialId(""); }}
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
              <button type="button" onClick={() => { setQ(""); setFocusedMaterialId(""); }} title="Limpiar" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "grid", placeItems: "center", padding: 4 }}>
                <X size={14} />
              </button>
            )}
          </div>
          <button type="button" onClick={() => setScannerOpen(true)} title="Escanear con la cámara" style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 10, padding: "9px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 850, fontFamily: C.sans, flexShrink: 0 }}>
            <ScanLine size={16} />{!isMobile && <span>Escanear</span>}
          </button>
          {canReceive && (
            <button type="button" onClick={() => openEgresoDisplay(toast)} title="Abrir la pantalla para la persona que retira" style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 10, padding: "9px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 850, fontFamily: C.sans, flexShrink: 0 }}>
              <MonitorUp size={16} />{!isMobile && <span>Pantalla de retiro</span>}
            </button>
          )}
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
          <SelectFilter label="Estado" value={scope} onChange={setScope} options={stockMaster ? [
            ["existencia", `Hay (${kpis.productos})`],
            ["reponer", `Reponer (${kpis.reponer || 0})`],
            ["en_camino", `En camino (${productGroupsBase.filter((group) => group.buckets?.has("en_camino")).length})`],
            ["sin_ubicacion", `Sin ubicación (${kpis.sinUbicacion})`],
            ["reconciliar", `A reconciliar (${kpis.negativos})`],
            ["todos", `Todo operativo (${productGroupsBase.length})`],
          ] : [
            ["todos", "Todos"],
            ...(showCatalogInventory ? [
              ["critico", `Críticos (${stockLevelCounts.critico})`],
              ["alerta", `Bajos (${stockLevelCounts.alerta})`],
              ["ok", `OK (${stockLevelCounts.ok})`],
              ["sin_minimo", `Sin mínimo (${stockLevelCounts.sin_minimo})`],
            ] : []),
            ["negativos", "A reconciliar"],
            ["sin_ubicacion", `Sin ubicación${kpis.sinUbicacion ? ` (${kpis.sinUbicacion})` : ""}`],
          ]} />
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
            ...(stockManagement ? [["estado", "Estado de stock"], ["sin_revisar", "Sin revisar primero"], ["alfabetico", "Alfabético"]] : []),
            ["default", "Stock primero"],
            ["recientes", "Más recientes"],
          ]} />
          <SelectFilter label="Tipo" value={kindScope} onChange={setKindScope} options={[["todos", `Todos (${kindCounts.todos})`], ["stock", `Stock pañol (${kindCounts.stock})`], ["estandar", `Asignado a obra (${kindCounts.estandar})`], ["adicional", `Adicionales (${kindCounts.adicional})`]]} />
          <SelectFilter label="Obra / stock" value={fObra} onChange={setFObra} options={obraOptions} />
          <SelectFilter label="Categoria" value={fCategoria} onChange={setFCategoria} options={categoriaOptions} />
          {!sedeLocked && <SelectFilter label="Sede" value={fSede} onChange={setFSede} options={[["todas", "Todas"], ...SEDES_PANOL.map((sede) => [sede, sede])]} />}
          <button type="button" onClick={cargar} disabled={loading} title="Actualizar" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 10, padding: "9px 10px", cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, display: "grid", placeItems: "center" }}>
            <RefreshCw size={15} />
          </button>
        </div>

        {stockMaster && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minHeight: 30 }}>
            {[
              ["existencia", "Hay", kpis.productos, C.green, C.greenL, C.greenB],
              ["reponer", "Reponer", kpis.reponer || 0, C.red, C.redL, C.redB],
              ["en_camino", "En camino", productGroupsBase.filter((group) => group.buckets?.has("en_camino")).length, C.blue, C.blueL, C.blueB],
              ["sin_ubicacion", "Sin ubicación", kpis.sinUbicacion, C.violet, C.violetL, C.violetB],
              ["reconciliar", "A reconciliar", kpis.negativos, C.red, C.redL, C.redB],
            ].map(([key, label, count, color, background, border]) => {
              const active = scope === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScope(active ? "todos" : key)}
                  aria-pressed={active}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    border: `1px solid ${active ? color : border}`,
                    background: active ? background : C.panelSolid,
                    color: active ? color : C.text,
                    borderRadius: 999,
                    padding: "5px 10px",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 900,
                    fontFamily: C.sans,
                    whiteSpace: "nowrap",
                    boxShadow: active ? `0 0 0 2px ${background}` : "none",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: color, flexShrink: 0 }} />
                  {label}
                  <span style={{ fontFamily: C.mono, color, fontWeight: 950 }}>{count}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setScope("todos")}
              style={{
                border: "none",
                background: "transparent",
                color: scope === "todos" ? C.blue : C.dim,
                padding: "5px 7px",
                cursor: "pointer",
                fontSize: 10.5,
                fontWeight: 850,
                fontFamily: C.sans,
              }}
            >
              Ver todo operativo ({productGroupsBase.length})
            </button>
            <span style={{ marginLeft: "auto", color: C.dim, fontSize: 10.5, whiteSpace: "nowrap" }}>
              Un producto puede aparecer en más de una señal.
            </span>
          </div>
        )}

        {/* La banda histórica de niveles queda disponible para otros usos del
            panel, pero el Stock maestro trabaja con las cubetas operativas. */}
        {showCatalogInventory && !stockMaster && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 6 }}>
            {[
              ["critico", "Críticos", stockLevelCounts.critico, C.red, C.redL, C.redB],
              ["alerta", "Bajos", stockLevelCounts.alerta, C.violet, C.violetL, C.violetB],
              ["ok", "Correctos", stockLevelCounts.ok, C.green, C.greenL, C.greenB],
              ["sin_minimo", "Sin mínimo", stockLevelCounts.sin_minimo, C.dim, C.panel2, C.border],
            ].map(([key, label, count, color, background, border]) => (
              <button key={key} type="button" title="Filtrar por nivel de stock" onClick={() => setScope(scope === key ? "todos" : key)} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${scope === key ? color : border}`, background: scope === key ? background : C.panelSolid, color, borderRadius: 999, padding: "3px 9px", cursor: "pointer", fontSize: 10.5, fontWeight: 900, fontFamily: C.sans, whiteSpace: "nowrap" }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
                {label} <span style={{ fontFamily: C.mono }}>{count}</span>
              </button>
            ))}

            {verifCounts.todos > 0 && (
              <>
                <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 2px" }} />
                <ShieldCheck size={13} style={{ color: C.blue, flexShrink: 0 }} />
                <span style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.7, whiteSpace: "nowrap" }}>Revisión</span>
                <div style={{ flex: "0 1 120px", minWidth: 70, height: 5, borderRadius: 99, background: C.panel2, overflow: "hidden", display: "flex" }}>
                  <span style={{ width: `${Math.round((verifCounts.ok / verifCounts.todos) * 100)}%`, background: C.green, transition: "width .3s ease" }} />
                  <span style={{ width: `${Math.round((verifCounts.problema / verifCounts.todos) * 100)}%`, background: C.red, transition: "width .3s ease" }} />
                </div>
                <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11.5, fontWeight: 950, flexShrink: 0 }}>
                  {verifCounts.ok + verifCounts.problema}/{verifCounts.todos}
                </span>
                {[
                  ["pendiente", `${verifCounts.pendiente} sin revisar`, C.dim, C.border],
                  ["problema", `${verifCounts.problema} con problema`, C.red, C.redB],
                  ["ok", `${verifCounts.ok} ok`, C.green, C.greenB],
                ].map(([key, label, color, border]) => (
                  <button key={key} type="button" onClick={() => setVerifScope(verifScope === key ? "todos" : key)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      border: `1px solid ${verifScope === key ? color : border}`,
                      background: verifScope === key ? `color-mix(in srgb, ${color} 12%, transparent)` : C.panelSolid,
                      color, borderRadius: 999, padding: "3px 9px", cursor: "pointer",
                      fontSize: 10.5, fontWeight: 900, fontFamily: C.sans, whiteSpace: "nowrap",
                    }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
                    {label}
                  </button>
                ))}
              </>
            )}

            <span title="Rojo: hasta 50% del mínimo · Violeta: hasta el mínimo · Verde: por encima"
              style={{ marginLeft: "auto", color: C.dim, fontSize: 10.5, cursor: "help", whiteSpace: "nowrap" }}>
              ¿Qué significan los colores?
            </span>
          </div>
        )}

      </div>

      {canShowHistory && egresoView === "historial" ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: isMobile ? 12 : "14px 18px 18px", display: "grid" }}>
          <EgresosHistoryView rows={historyRows} loading={loading} obras={obras} isMobile={isMobile} onOpenProduct={openProductFromHistory} />
        </div>
      ) : (
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: isMobile ? 12 : "12px 16px 16px", display: "grid", gridTemplateColumns: isMobile || !hasSelectedProduct ? "1fr" : "330px minmax(0, 1fr)", gap: 12 }}>
        {/* En mobile, con un producto abierto el detalle ocupa TODO: apilados se
            peleaban la altura y el detalle quedaba cortado. El botón "Lista" del
            detalle vuelve a la lista. En desktop conviven lado a lado. */}
        {!(isMobile && hasSelectedProduct) && (
        <section style={{ minHeight: 0, minWidth: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Título y ayuda en una sola línea: eran dos y el subtítulo repetía
              algo que se aprende la primera vez que hacés click. */}
          <div style={{ padding: "7px 12px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
              <div style={{ color: C.text, fontSize: 13.5, fontWeight: 950 }}>{mode === "egreso" ? "Elegir material para egresar" : "Stock maestro"}</div>
              <div style={{ color: C.dim, fontSize: 11 }}>
                {productGroups.length} resultados{hiddenProductCount ? ` · mostrando ${renderedProductGroups.length}` : ""} · {stockManagement && stockView === "lista" ? "editá los mínimos en la columna" : "click para egreso y kardex"}
              </div>
            </div>
            {stockManagement && (
              <div style={{ display: "inline-flex", gap: 3, padding: 3, borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel }}>
                <button type="button" onClick={() => setStockView("lista")} title="Ver como lista" style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${stockView === "lista" ? C.blueB : "transparent"}`, background: stockView === "lista" ? C.blueL : "transparent", color: stockView === "lista" ? C.blue : C.dim, borderRadius: 7, padding: "5px 8px", cursor: "pointer", fontSize: 10.5, fontWeight: 900, fontFamily: C.sans }}>
                  <List size={13} /> {!isMobile && "Lista"}
                </button>
                <button type="button" onClick={() => setStockView("tarjetas")} title="Ver como tarjetas" style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${stockView === "tarjetas" ? C.blueB : "transparent"}`, background: stockView === "tarjetas" ? C.blueL : "transparent", color: stockView === "tarjetas" ? C.blue : C.dim, borderRadius: 7, padding: "5px 8px", cursor: "pointer", fontSize: 10.5, fontWeight: 900, fontFamily: C.sans }}>
                  <LayoutGrid size={13} /> {!isMobile && "Tarjetas"}
                </button>
              </div>
            )}
          </div>
          <div style={{ padding: stockManagement && stockView === "lista" ? 0 : 8, display: "grid", gridTemplateColumns: !isMobile && !hasSelectedProduct && (!stockManagement || stockView === "tarjetas") ? "repeat(auto-fill, minmax(280px, 1fr))" : "1fr", gap: stockManagement && stockView === "lista" ? 0 : 7, overflowY: "auto", overflowX: stockManagement && stockView === "lista" ? "auto" : "hidden" }}>
            {stockManagement && stockView === "lista" && !loading && productGroups.length > 0 && (
              <div style={{ minWidth: STOCK_ROW_MIN, position: "sticky", top: 0, zIndex: 2, display: "grid", gridTemplateColumns: STOCK_ROW_COLS, gap: 12, padding: "7px 12px", borderBottom: `1px solid ${C.border}`, background: C.topbarSoft, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", color: C.dim, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>
                <span />
                <span>Producto</span>
                <span>Stock</span>
                <span>Mínimo</span>
                <span>Faltante</span>
                <span>Ubicación</span>
                <span>Revisión</span>
                <span>Acción</span>
              </div>
            )}
            {loading ? (
              <>
                <style>{`@keyframes stkSkel { 0%,100% { opacity: .45 } 50% { opacity: .9 } }`}</style>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 11, padding: "9px 10px", display: "grid", gap: 8, animation: `stkSkel 1.3s ease-in-out ${i * 0.12}s infinite` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ width: `${58 - (i % 3) * 9}%`, height: 12, borderRadius: 6, background: C.panel2 }} />
                      <span style={{ width: 42, height: 16, borderRadius: 6, background: C.panel2 }} />
                    </div>
                    <span style={{ width: `${34 + (i % 2) * 14}%`, height: 9, borderRadius: 6, background: C.panel2 }} />
                  </div>
                ))}
              </>
            ) : productGroups.length ? (
              <>
                {renderedProductGroups.map((group) => {
                  const primaryAction = primaryActionFor(group);
                  return stockManagement && stockView === "lista"
                    ? <ProductStockRow key={group.key} group={group} active={selectedKey === group.key} onOpen={setSelectedKey} canEditMinimum={canReceive} onSaveMinimum={saveStockMinimum} primaryAction={primaryAction} />
                    : <ProductCard key={group.key} group={group} active={selectedKey === group.key} onOpen={setSelectedKey} canSeePrices={canSeePrices} onAddToCart={canReceive ? quickAddToCart : undefined} primaryAction={primaryAction} inCart={cartGroupKeys.has(group.key)} dense={!isMobile && hasSelectedProduct} />;
                })}
                {hiddenProductCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setRenderLimit((current) => current + PRODUCT_RENDER_BATCH)}
                    style={{
                      gridColumn: "1 / -1",
                      minWidth: stockManagement && stockView === "lista" ? STOCK_ROW_MIN : 0,
                      border: `1px solid ${C.blueB}`,
                      background: C.blueL,
                      color: C.blue,
                      borderRadius: stockManagement && stockView === "lista" ? 0 : 10,
                      padding: "10px 14px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 900,
                      fontFamily: C.sans,
                    }}
                  >
                    Mostrar {Math.min(PRODUCT_RENDER_BATCH, hiddenProductCount)} más · quedan {hiddenProductCount}
                  </button>
                )}
              </>
            ) : (
              <div style={{ padding: "26px 18px", border: `1px dashed ${C.border}`, borderRadius: 10, textAlign: "center", display: "grid", justifyItems: "center", gap: 8 }}>
                <Warehouse size={26} style={{ color: C.dim, opacity: 0.7 }} />
                <div style={{ color: C.text, fontSize: 13, fontWeight: 850 }}>No hay stock para estos filtros</div>
                <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.4, maxWidth: 250 }}>
                  {q.trim() ? (stockMaster ? "Probá con menos palabras o abrí el Catálogo maestro desde el menú." : "Probá con menos palabras, o buscalo abajo en el catálogo completo.") : "Cambiá los filtros de tipo, obra o categoría para ver más productos."}
                </div>
              </div>
            )}

            {!stockMaster && q.trim().length >= 2 && (
              <div style={{ border: `1px dashed ${C.blueB}`, background: C.blueL, borderRadius: 10, padding: 10, display: "grid", gap: 7 }}>
                <div>
                  <div style={{ color: C.text, fontSize: 12.5, fontWeight: 900 }}>Catalogo completo</div>
                  <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Usá el catálogo para identificar el producto. Si no tiene stock, primero registrá su ingreso o recepción física.</div>
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
                <button type="button" onClick={createFromSearch} disabled={creating || !canCreateCatalog} style={{ border: `1px solid ${canCreateCatalog ? C.blueB : C.border}`, background: C.panelSolid, color: canCreateCatalog ? C.blue : C.dim, borderRadius: 9, padding: "8px 10px", cursor: creating || !canCreateCatalog ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 950, fontFamily: C.sans }}>
                  {!canCreateCatalog ? "Crear nuevo requiere administrador" : creating ? "Creando..." : `Crear "${q.trim()}" en catalogo`}
                </button>
              </div>
            )}
          </div>
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
            mode={mode}
            onDone={cargar}
            toast={toast}
            setSelectedKey={setSelectedKey}
            cart={cart}
            setCart={setCart}
            onOpenCatalog={onOpenCatalog}
          />
        )}
      </div>
      )}

      {/* ── Carrito flotante (stock maestro / por obra): juntar ítems y egresar/asignar en lote ── */}
      {canReceive && (cart.length > 0 || savedCarts.length > 0) && (
        <>
          {cartOpen && (
            <CartDrawer
              cart={cart}
              setCart={setCart}
              obras={obras}
              canReceive={canReceive}
              onDone={async () => { setCartOpen(false); await cargar({ force: true }); }}
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
              border: "none", background: "#059669", color: "#fff",
              borderRadius: 999, padding: "12px 18px", cursor: "pointer",
              fontSize: 13.5, fontWeight: 950, fontFamily: C.sans,
              boxShadow: "0 10px 26px -8px rgba(5,150,105,0.55)",
            }}
          >
            <ShoppingCart size={17} />
            Carrito
            <span title={cart.length ? `${cart.length} producto(s) · ${fmtQty(cart.reduce((sum, it) => sum + qty(it.cantidad, 0), 0))} unidades` : `${savedCarts.length} guardado(s)`} style={{ fontFamily: C.mono, fontSize: 11.5, fontWeight: 950, background: "rgba(255,255,255,0.25)", borderRadius: 999, padding: "1px 8px" }}>
              {cart.length ? `${cart.length} · ${fmtQty(cart.reduce((sum, it) => sum + qty(it.cantidad, 0), 0))} u` : `💾${savedCarts.length}`}
            </span>
          </button>
        </>
      )}
    </>
  );
}
