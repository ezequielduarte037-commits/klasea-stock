import { C } from "@/theme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, ClipboardPaste, Link2, MapPin, PackageSearch, RotateCcw, ScanLine, Search } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { crearEnvio, crearPanolCatalogMaterial, fetchMaterialesEgreso, fetchPanolCatalogFull, fetchPanolCatalogMini, fetchRecepcionAvisosAbiertos, guardarUbicacionMaterial, invalidatePanolCatalogFullCache, marcarItems, SEDES_PANOL } from "@/features/panol/panolApi";
import { fetchProveedores, leerPresupuestoConIA, normalizeUnidadMedida } from "@/features/materiales/api";
import ProveedorTipoBadge from "@/features/materiales/ProveedorTipoBadge";
import { proveedorMeta } from "@/features/materiales/proveedorMeta";
import { materialBarcodeList, normalizeBarcode } from "@/features/materiales/materialBarcodes";
import { materialMatchIsStrong, materialMatchScore } from "@/features/panol/materialMatch";
import { borrarIngresoPendiente, guardarIngresoPendiente, leerIngresosPendientes, olvidarIngresoPendiente } from "@/features/panol/ingresosPendientes";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import BarcodeScanner from "@/features/panol/BarcodeScanner";
import { UbicacionChip } from "@/features/panol/UbicacionPicker";
import { parseUbicacion } from "@/features/panol/ubicacionUtils";
import { PANOL_REFERENCE_LAYOUT, PANOL_ROOM_H, PANOL_ROOM_W, applyPanolReferenceLayout } from "@/features/panol/panolLayout";
import { normalizeProductSpecs, productSpecEntries } from "@/features/materiales/especificacionesProducto";

const EMPTY_ARR = [];
const UNITS = ["unidad", "metro", "kg", "litro", "pies", "caja", "rollo", "par", "juego", "m2"];
const CURRENCIES = ["ARS", "USD"];
const STOCK_LEDGER_STATES = ["en_panol", "recibido", "parcial", "egresado", "problema"];
const STOCK_IN_STATES = new Set(["en_panol", "recibido", "parcial"]);
const STOCK_RECEIVED_STATES = new Set(["recibido", "parcial"]);
const STOCK_DIRECT_SOURCES = new Set(["stock_general", "remito", "transferencia_ingreso", "ajuste_ingreso"]);

function stockQty(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function fmtStockQty(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return Number(Math.round(n * 100) / 100).toLocaleString("es-AR");
}

function stockRowSource(row) {
  return String(row?.source || "").trim();
}

function stockRowIsLocationChange(row) {
  return stockRowSource(row) === "ajuste_ubicacion";
}

function stockRowIsDirectStock(row) {
  const source = stockRowSource(row);
  return STOCK_DIRECT_SOURCES.has(source) || source.startsWith("stock_") || source.startsWith("transferencia_ingreso");
}

function stockRowCountsAsAvailable(row) {
  if (stockRowIsLocationChange(row)) return false;
  if (!STOCK_IN_STATES.has(row?.estado)) return false;
  const recepcion = String(row?.recepcion_estado || "").trim();
  return STOCK_RECEIVED_STATES.has(recepcion) || stockRowIsDirectStock(row);
}

function stockRowIsEgreso(row) {
  const source = stockRowSource(row);
  return !!row?.egreso_destino_obra_id || row?.estado === "egresado" || source.startsWith("egreso") || source.startsWith("transferencia_egreso");
}

function stockRowDelta(row) {
  if (stockRowCountsAsAvailable(row)) return stockQty(row.cantidad, 1);
  if (stockRowIsEgreso(row)) return -Math.abs(stockQty(row.cantidad_egresada, stockQty(row.cantidad, 1)));
  return 0;
}

function buildStockByMaterial(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.material_id) continue;
    const delta = stockRowDelta(row);
    if (!delta) continue;
    const sede = row.panol_envio?.sede || row.stock_sede || "Sin sede";
    const current = map.get(row.material_id) || {
      total: 0,
      unidad: row.unidad || "unidad",
      sedes: new Map(),
    };
    current.total += delta;
    if (!current.unidad && row.unidad) current.unidad = row.unidad;
    current.sedes.set(sede, (current.sedes.get(sede) || 0) + delta);
    map.set(row.material_id, current);
  }
  return map;
}

function materialStockInfo(material, stockByMaterial) {
  if (!material?.id) return null;
  const stock = stockByMaterial?.get?.(material.id);
  return stock || { total: 0, unidad: material.unidad || "unidad", sedes: new Map() };
}

function StockActualBadge({ material, stockByMaterial, sede = "", compact = false }) {
  const stock = materialStockInfo(material, stockByMaterial);
  if (!stock) return null;
  const total = stockQty(stock.total, 0);
  const unidad = stock.unidad || material?.unidad || "unidad";
  const labelSede = sede ? `Stock ${sede}` : "Stock actual";
  const color = total < 0 ? C.red : total > 0 ? C.green : C.t2;
  const bg = total < 0 ? C.redL : total > 0 ? C.greenL : C.bg;
  const border = total < 0 ? C.redB : total > 0 ? C.greenB : C.b0;
  return (
    <span
      title={`${labelSede}: ${fmtStockQty(total)} ${unidad}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        border: `1px solid ${border}`,
        background: bg,
        color,
        borderRadius: 999,
        padding: compact ? "3px 7px" : "4px 9px",
        fontSize: compact ? 10.5 : 11.5,
        fontWeight: 900,
        whiteSpace: "nowrap",
        lineHeight: 1,
      }}
    >
      {labelSede}: <span style={{ fontFamily: C.mono }}>{fmtStockQty(total)}</span> {unidad}
    </span>
  );
}

// Feedback sonoro del escaneo (agudo = ok, grave = error). Silencioso si falla.
function scanBeep(frequency = 880, duration = 90) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = 0.05;
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close?.(); }, duration);
  } catch { /* sin audio */ }
}

const UNIT_ALIASES = {
  u: "unidad", un: "unidad", uni: "unidad", unid: "unidad", unidad: "unidad", unidades: "unidad", uds: "unidad",
  m: "metro", mt: "metro", mts: "metro", mtr: "metro", mtrs: "metro", metro: "metro", metros: "metro",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg",
  l: "litro", lt: "litro", lts: "litro", litro: "litro", litros: "litro",
  pie: "pies", pies: "pies",
  caja: "caja", cajas: "caja",
  rollo: "rollo", rollos: "rollo",
  par: "par", pares: "par",
  juego: "juego", juegos: "juego",
  m2: "m2", "m²": "m2",
};

const inp = (over) => ({
  width: "100%",
  border: `1px solid ${C.b0}`,
  borderRadius: 7,
  background: "var(--panel)",
  color: C.t0,
  padding: "8px 11px",
  fontSize: 13,
  fontFamily: C.sans,
  outline: "none",
  boxSizing: "border-box",
  ...over,
});

const lbl = {
  color: C.t2,
  fontSize: 10,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  fontWeight: 750,
  marginBottom: 6,
  display: "block",
};

function normKey(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.]/g, "");
}

function cleanNumber(value = "") {
  const raw = String(value || "").trim().replace(",", ".");
  if (!raw) return "";
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : raw;
}

function catalogScore(material, queryItem = {}) {
  return materialMatchScore(material, queryItem);
}

function topCatalogMatches(catalog = [], queryItem = {}, limit = 8) {
  return [...catalog]
    .filter((material) => material?.es_requisito !== true)
    .map((material) => ({ material, score: catalogScore(material, queryItem) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (a.material.descripcion || "").localeCompare(b.material.descripcion || "", "es"))
    .slice(0, limit)
    .map((row) => ({ ...row.material, _score: row.score }));
}

// Cuando se vincula un renglon al catalogo, la unidad del producto tiene que
// ganarle al "unidad" que trae por defecto todo renglon nuevo. Antes la
// condicion era `item.unidad || material.unidad`, y como "unidad" nunca es
// vacio el catalogo jamas se aplicaba: la cadena de 6mm, que en el catalogo
// esta en metro, entraba como 50 unidades. Lo que el usuario elige a mano
// (unidad_touched) sigue mandando sobre todo lo demas.
function unidadDeItemYMaterial(item = {}, material = null) {
  if (item.unidad_touched && item.unidad) return item.unidad;
  const propia = String(item.unidad || "").trim();
  if (propia && propia !== "unidad") return propia;
  return material?.unidad || propia || "unidad";
}

function itemPatchFromMaterial(material, item = {}) {
  return {
    material_id: material?.id || "",
    requisito_material_id: item.requisito_material_id || item.material_id || null,
    codigo: item.codigo || material?.codigo || "",
    codigo_barra: item.codigo_barra || material?.codigo_barra || materialBarcodeList(material)[0]?.codigo || "",
    unidad: unidadDeItemYMaterial(item, material),
    proveedor: item.proveedor || material?.proveedor || "",
    precio_unitario: item.precio_unitario !== "" && item.precio_unitario != null ? item.precio_unitario : material?.precio_unitario ?? "",
    moneda: item.moneda || material?.moneda || "ARS",
    ubicacion: item.ubicacion || material?.ubicacion || null,
    ubicacion_obs: item.ubicacion_obs || material?.ubicacion_obs || "",
    variante: "",
    catalog_match_score: material?._score || null,
  };
}

function isMissingVariantColumn(error) {
  const msg = String(error?.message || "").toLowerCase();
  return error?.code === "42703" || (msg.includes("column") && msg.includes("variante"));
}

// Que cuenta como "hay algo que perder". El titulo solo no: escribir una
// referencia y salir dejaba un borrador de 0 items imposible de retomar, y
// volver a tipearlo cuesta menos que verlo colgado arriba para siempre.
function draftHasContent(payload = {}) {
  return !!(
    String(payload.observaciones || "").trim()
    || (Array.isArray(payload.items) && payload.items.some((item) => String(item.descripcion || item.codigo || item.cantidad || "").trim()))
  );
}

function normalizePriceForDb(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let clean = raw.replace(/[$\s]/g, "").replace(/[^\d,.-]/g, "");
  if (!clean) return null;
  if (clean.includes(",")) clean = clean.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) clean = clean.replace(/\./g, "");
  return clean;
}

function detectCode(rest = "") {
  const match = String(rest).match(/\s+([A-ZÑ]{1,5}\d[A-Z0-9-]{2,})$/i);
  if (!match) return { codigo: "", descripcion: rest.trim() };
  return {
    codigo: match[1].toUpperCase(),
    descripcion: rest.slice(0, match.index).trim(),
  };
}

function parsePanolLine(line = "") {
  const original = String(line || "").trim();
  if (!original) return null;

  // Formato columnar (remito/lista de proveedor):
  //   "Descripción | Código | Cantidad | Unidad | $Precio"
  // Tolerante al orden y a columnas faltantes (mínimo: descripción). Acepta
  // separador "|" o tabulación, y precio en formato argentino ($39.372,46).
  if (/[|\t]/.test(original)) {
    const parts = original.split(/\s*[|\t]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      let descripcion = parts[0];
      let codigo = "";
      let cantidad = "";
      let unidad = "unidad";
      let precio = "";
      for (const p of parts.slice(1)) {
        const np = normKey(p);
        // precio: tiene $ o pinta de número con miles/decimales argentinos
        if (!precio && (/[$]/.test(p) || /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(p) || /^\d+,\d{1,2}$/.test(p))) {
          precio = normalizePriceForDb(p) || "";
          continue;
        }
        if (unidad === "unidad" && UNIT_ALIASES[np]) { unidad = UNIT_ALIASES[np]; continue; }
        if (!cantidad && /^\d+(?:[.,]\d+)?$/.test(p)) { cantidad = cleanNumber(p); continue; }
        // código: alfanumérico con letras y números (ej C1161/2FU, VAE3/4J)
        if (!codigo && /[a-z]/i.test(p) && /\d/.test(p)) { codigo = p.toUpperCase(); continue; }
        // cualquier sobrante se suma a la descripción
        descripcion = `${descripcion} ${p}`.trim();
      }
      return {
        descripcion,
        codigo,
        cantidad,
        unidad,
        precio_unitario: precio,
        moneda: "ARS",
        purchase_request_item_id: null,
      };
    }
  }

  let text = original.replace(/\s+/g, " ");

  let cantidad = "";
  let unidad = "unidad";
  const qty = text.match(/^(\d+(?:[,.]\d+)?)\s+(.*)$/);
  if (qty) {
    cantidad = cleanNumber(qty[1]);
    text = qty[2].trim();

    const maybeUnit = text.match(/^([a-zA-ZáéíóúÁÉÍÓÚñÑ².]+)\b\s*(.*)$/);
    if (maybeUnit) {
      const unit = UNIT_ALIASES[normKey(maybeUnit[1])];
      if (unit) {
        unidad = unit;
        text = maybeUnit[2].trim();
      }
    }
  }

  const coded = detectCode(text);
  return {
    descripcion: coded.descripcion || text,
    codigo: coded.codigo,
    cantidad,
    unidad,
    precio_unitario: "",
    moneda: "ARS",
    purchase_request_item_id: null,
  };
}

function normalizeItem(it) {
  const parsed = parsePanolLine(it.descripcion ?? it.description ?? "");
  return {
    descripcion: parsed?.descripcion || it.descripcion || it.description || "",
    codigo: it.codigo ?? it.code ?? parsed?.codigo ?? "",
    codigo_barra: it.codigo_barra ?? it.barcode ?? it.codigoBarra ?? "",
    cantidad: it.cantidad ?? it.quantity ?? parsed?.cantidad ?? "",
    unidad: it.unidad ?? it.unit ?? parsed?.unidad ?? "unidad",
    precio_unitario: it.precio_unitario ?? it.precioUnitario ?? "",
    moneda: it.moneda || "ARS",
    obra_id: it.obra_id ?? it.obraId ?? "",
    material_id: it.material_id ?? it.materialId ?? "",
    requisito_material_id: it.requisito_material_id ?? it.requisitoMaterialId ?? "",
    proveedor: it.proveedor ?? "",
    rubro: it.rubro ?? "",
    ubicacion: it.ubicacion ?? it.ubicacionHabitual ?? "",
    ubicacion_obs: it.ubicacion_obs ?? it.ubicacionObs ?? "",
    ubicacion_touched: it.ubicacion_touched ?? false,
    recepcion_estado: it.recepcion_estado ?? it.recepcionEstado ?? null,
    purchase_request_item_id: it.purchase_request_item_id ?? it.purchaseRequestItemId ?? null,
    panol_envio_item_id: it.panol_envio_item_id ?? it.panolEnvioItemId ?? null,
    obra_snapshot_item_id: it.obra_snapshot_item_id ?? it.obraSnapshotItemId ?? null,
    variante: it.variante ?? it.variant ?? "",
    especificaciones: normalizeProductSpecs(it.especificaciones),
  };
}

function stripItemPrice(item) {
  return { ...item, precio_unitario: "", moneda: "ARS" };
}

function lockedSedeForProfile(profile) {
  const role = String(profile?.role || "").toLowerCase();
  if (role !== "panol") return null;
  const sede = String(profile?.sede || "").trim();
  if (sede === "Pampa" || sede === "Chubut") return sede;
  return null;
}

function matchToItem(match, material = null) {
  return {
    descripcion: match.description || material?.descripcion || "",
    codigo: material?.codigo || "",
    codigo_barra: material?.codigo_barra || materialBarcodeList(material)[0]?.codigo || "",
    cantidad: match.quantity || "",
    unidad: match.unit || material?.unidad || "unidad",
    precio_unitario: material?.precio_unitario ?? "",
    moneda: material?.moneda || "ARS",
    obra_id: match.obra_id || "",
    material_id: material?.id || match.material_id || "",
    proveedor: material?.proveedor || "",
    ubicacion: material?.ubicacion || "",
    ubicacion_obs: material?.ubicacion_obs || "",
    ubicacion_touched: false,
    recepcion_estado: "recibido",
    purchase_request_item_id: match.purchase_request_item_id || (match.source === "compra" ? match.id : null),
    panol_envio_item_id: match.panol_envio_item_id || null,
    obra_snapshot_item_id: match.obra_snapshot_item_id || null,
    es_adicional: match.es_adicional ?? match.request?.es_adicional ?? null,
    variante: match.variante || "",
    especificaciones: normalizeProductSpecs(match.especificaciones),
  };
}

function CatalogLinkRow({ item, catalog = [], proveedores = [], stockByMaterial = new Map(), sede = "", onLink, onClear, onCreate, creating = false }) {
  const [q, setQ] = useState("");
  const currentMaterial = catalog.find((material) => material.id === item.material_id);
  const linkedRequirement = currentMaterial?.es_requisito === true ? currentMaterial : null;
  const selected = linkedRequirement ? null : currentMaterial;
  const selectedMeta = useMemo(() => proveedorMeta(selected?.proveedor, proveedores), [selected?.proveedor, proveedores]);
  const results = useMemo(() => {
    const query = q.trim() ? { descripcion: q } : item;
    return selected ? [] : topCatalogMatches(catalog, query, 6);
  }, [catalog, item, q, selected]);
  return (
    <div style={{ display: "grid", gap: 7, padding: "0 10px 10px 10px" }}>
      <div style={{ display: "flex", gap: 9, alignItems: "center", minWidth: 0 }}>
        <span style={{ color: C.t2, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8, minWidth: 72 }}>Catalogo</span>
        {selected ? (
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0, color: C.green, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Conectado: {selected.descripcion}
              <span style={{ color: C.t2, fontWeight: 500 }}>{selected.codigo ? ` · ${selected.codigo}` : ""}{selected.proveedor ? ` · ${selected.proveedor}` : ""}</span>
            </div>
            <ProveedorTipoBadge meta={selectedMeta} compact />
            <StockActualBadge material={selected} stockByMaterial={stockByMaterial} sede={sede} compact />
            <UbicacionChip ubicacion={selected.ubicacion} obs={selected.ubicacion_obs} />
            <button type="button" onClick={() => { setQ(""); onClear(); }} style={{ border: `1px solid ${C.b0}`, background: C.bg, color: C.t1, borderRadius: 7, padding: "6px 9px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: C.sans }}>
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar material del catalogo"
              style={inp({ flex: 1, minWidth: 0, padding: "8px 10px", fontSize: 12.5, background: C.bg })}
            />
            {onCreate ? (
              <button
                type="button"
                onClick={onCreate}
                disabled={creating || !String(item.descripcion || "").trim()}
                style={{ border: `1px solid ${C.violetB ?? C.b0}`, background: C.violetL, color: creating ? C.dim : C.violet, borderRadius: 7, padding: "7px 10px", fontSize: 11.5, fontWeight: 850, cursor: creating ? "default" : "pointer", fontFamily: C.sans, whiteSpace: "nowrap" }}
              >
                {creating ? "Creando..." : "Crear nuevo"}
              </button>
            ) : (
              <span style={{ color: C.violet, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>↳ Creá el producto en la pestaña “Crear producto”</span>
            )}
          </>
        )}
      </div>
      {linkedRequirement && (
        <div style={{ marginLeft: 81, border: `1px solid ${C.cyanB}`, background: C.cyanL, color: C.cyan, borderRadius: 8, padding: "8px 10px", fontSize: 11.5, fontWeight: 800 }}>
          “{linkedRequirement.descripcion}” es una necesidad genérica. Elegí abajo el producto real que se compró o recibió.
        </div>
      )}
      {/* Sin esto, un ítem que no vincula no dice NADA y es imposible saber si el
          catálogo no lo tiene o si lo tiene pero el parecido no alcanzó. */}
      {!selected && results.length === 0 && (
        <div style={{ marginLeft: 81, color: C.t2, fontSize: 11.5 }}>
          No hay nada parecido en el catálogo.{onCreate ? " Se crea nuevo al guardar." : " Creá el producto y volvé."}
        </div>
      )}
      {!selected && results.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginLeft: 81 }}>
          <div style={{ color: C.violet, fontSize: 11, fontWeight: 850 }}>
            Posibles coincidencias: elegí una para evitar duplicados.
            {results[0]?._score < 88 && (
              <span style={{ color: C.t2, fontWeight: 600 }}>
                {" "}El mejor parecido da {results[0]._score} y hacen falta 88 para vincular solo.
              </span>
            )}
          </div>
          {results.map((material) => {
            const meta = proveedorMeta(material.proveedor, proveedores);
            return (
              <button
                key={material.id}
                type="button"
                onClick={() => { onLink(material); setQ(""); }}
                style={{ display: "flex", justifyContent: "space-between", gap: 10, textAlign: "left", border: `1px solid ${C.b0}`, background: C.bg, color: C.t1, borderRadius: 7, padding: "7px 9px", cursor: "pointer", fontSize: 12.3, fontFamily: C.sans }}
              >
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{material.descripcion}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.t2, whiteSpace: "nowrap" }}>
                  <span>{material.codigo || material.proveedor || `${material._score}%`}</span>
                  <ProveedorTipoBadge meta={meta} compact />
                  <StockActualBadge material={material} stockByMaterial={stockByMaterial} sede={sede} compact />
                </span>
              </button>
            );
          })}
        </div>
      )}
      {!selected && q.trim() && results.length === 0 && (
        <div style={{ marginLeft: 81, color: C.t2, fontSize: 11 }}>
          {onCreate ? "Sin coincidencias claras. Podés crear un material nuevo." : "No está en el catálogo. Crealo en la pestaña “Crear producto” y después ingresalo."}
        </div>
      )}
    </div>
  );
}

function MiniMapaUbicacion({ selectedCode = "", onPick = null }) {
  const code = String(selectedCode || "").trim().toUpperCase();
  const selectedLayout = PANOL_REFERENCE_LAYOUT[code] || null;
  const shelves = Object.entries(PANOL_REFERENCE_LAYOUT);
  return (
    <div style={{ border: `1px solid ${C.b0}`, background: C.bg, borderRadius: 12, padding: 10, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: C.t2, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8 }}>Preview pañol</span>
        <span style={{ color: selectedLayout ? C.blue : C.t2, fontSize: 12, fontWeight: 900, fontFamily: C.mono }}>{selectedLayout ? code : "Sin estanteria"}</span>
      </div>
      <svg viewBox={`0 0 ${PANOL_ROOM_W} ${PANOL_ROOM_H}`} style={{ width: "100%", height: "auto", display: "block", maxHeight: 170 }}>
        <rect x={0} y={0} width={PANOL_ROOM_W} height={PANOL_ROOM_H} rx={18} fill="rgba(148,163,184,0.08)" stroke="rgba(148,163,184,0.35)" strokeWidth={18} />
        <rect x={105} y={PANOL_ROOM_H - 34} width={285} height={12} fill={C.violet} rx={5} opacity={0.8} />
        <rect x={485} y={PANOL_ROOM_H - 34} width={195} height={12} fill="#38bdf8" rx={5} opacity={0.8} />
        <rect x={1542} y={PANOL_ROOM_H - 34} width={275} height={12} fill={C.violet} rx={5} opacity={0.8} />
        {shelves.map(([shelfCode, layout]) => {
          const active = shelfCode === code;
          const zone = shelfCode.charAt(0);
          const color = zone === "A" ? "#3b82f6" : zone === "B" ? "#8b5cf6" : zone === "C" ? "#06b6d4" : zone === "D" ? "#10b981" : zone === "E" ? "#f59e0b" : zone === "F" ? "#ec4899" : zone === "G" ? "#84cc16" : zone === "H" ? "#f97316" : zone === "I" ? "#14b8a6" : zone === "J" ? "#6366f1" : zone === "K" ? "#a855f7" : zone === "P" ? "#ef4444" : "#eab308";
          return (
            <g key={shelfCode} onClick={() => onPick?.(shelfCode)} style={{ cursor: onPick ? "pointer" : "default" }}>
              <rect
                x={layout.x_cm}
                y={layout.y_cm}
                width={layout.w_cm}
                height={layout.h_cm}
                rx={9}
                fill={active ? `${color}55` : "rgba(148,163,184,0.18)"}
                stroke={active ? color : "rgba(100,116,139,0.42)"}
                strokeWidth={active ? 13 : 4}
              />
              {(active || layout.w_cm >= 100 || layout.h_cm >= 140) && (
                <text x={layout.x_cm + layout.w_cm / 2} y={layout.y_cm + layout.h_cm / 2 + 12} textAnchor="middle" fontSize={active ? 46 : 34} fontWeight={950} fill={active ? color : "rgba(71,85,105,0.55)"} fontFamily={C.sans}>
                  {shelfCode}
                </text>
              )}
            </g>
          );
        })}
        {selectedLayout && (
          <circle cx={selectedLayout.x_cm + selectedLayout.w_cm / 2} cy={selectedLayout.y_cm + selectedLayout.h_cm / 2} r={Math.max(42, Math.min(78, Math.max(selectedLayout.w_cm, selectedLayout.h_cm) / 2))} fill="none" stroke={C.blue} strokeWidth={8} strokeDasharray="18 14" opacity={0.9} />
        )}
      </svg>
    </div>
  );
}

// Reparto de un ingreso entre varias obras (ej: 3 plotters → 1 a cada obra).
// Solo para ingresos directos (sin pedido vinculado).
function ItemObrasRow({ item, obras = [], multiObra = false, onChange }) {
  const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
  const total = num(item.cantidad);
  const dist = Array.isArray(item.distribucion) ? item.distribucion : null;

  // Una unidad no se reparte, pero igual hay que decir a qué obra va. Antes esto
  // devolvía null y en un aviso de cuatro obras el renglón de una sola unidad se
  // iba al barco del encabezado sin que hubiera forma de cambiarlo. En un aviso
  // de una obra sola no aparece: sería repetir el encabezado en cada renglón.
  if (total <= 1) {
    if (!multiObra) return null;
    const elegida = (dist || []).find((d) => d.obra_id && num(d.cantidad) > 0)?.obra_id || "";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 10px 10px", minWidth: 0, flexWrap: "wrap" }}>
        <span style={{ color: C.t2, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8, minWidth: 72 }}>Obra</span>
        <select
          value={elegida}
          onChange={(e) => onChange({
            distribucion: e.target.value ? [{ obra_id: e.target.value, cantidad: String(total || 1) }] : null,
          })}
          style={inp({ padding: "7px 9px", fontSize: 12.5, background: C.panelSolid, width: "auto", minWidth: 190 })}
        >
          <option value="">La obra del aviso</option>
          {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}
        </select>
        {!elegida && <span style={{ color: C.t2, fontSize: 11 }}>elegí a qué barco va esta unidad</span>}
      </div>
    );
  }

  if (!dist) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 10px 10px", minWidth: 0, flexWrap: "wrap" }}>
        <span style={{ color: C.t2, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8, minWidth: 72 }}>Obras</span>
        <button type="button" onClick={() => onChange({ distribucion: [{ obra_id: item.obra_id || "", cantidad: String(total) }] })}
          style={{ border: `1px solid ${C.blueB}`, background: "var(--blue-soft)", color: C.blue, borderRadius: 8, padding: "6px 11px", cursor: "pointer", fontSize: 11.5, fontWeight: 850, fontFamily: C.sans }}>
          Repartir entre varias obras
        </button>
        <span style={{ color: C.t2, fontSize: 11 }}>si estas {total} unidades van a obras distintas</span>
      </div>
    );
  }

  const asignado = dist.reduce((s, d) => s + num(d.cantidad), 0);
  const resto = Math.round((total - asignado) * 100) / 100;
  const okColor = asignado === total ? C.green : asignado > total ? C.red : C.violet;
  const setRow = (idx, patch) => onChange({ distribucion: dist.map((d, k) => (k === idx ? { ...d, ...patch } : d)) });
  const addRow = () => onChange({ distribucion: [...dist, { obra_id: "", cantidad: resto > 0 ? String(resto) : "" }] });
  const removeRow = (idx) => { const next = dist.filter((_, k) => k !== idx); onChange({ distribucion: next.length ? next : null }); };
  // El caso comun es "lo mismo para cada obra": 24 pistones entre 4 obras. El
  // resto de la division va a la primera para que la suma cierre exacta y no
  // quede un sobrante que despues nadie sabe donde imputar.
  const conObra = dist.filter((d) => d.obra_id);
  const repartirIgual = () => {
    if (!conObra.length) return;
    const base = Math.floor((total / conObra.length) * 100) / 100;
    let asignadoIgual = 0;
    const partes = dist.map((d) => {
      if (!d.obra_id) return { ...d, cantidad: "" };
      asignadoIgual += base;
      return { ...d, cantidad: String(base) };
    });
    const sobra = Math.round((total - asignadoIgual) * 100) / 100;
    if (sobra > 0) {
      const primera = partes.findIndex((d) => d.obra_id);
      if (primera >= 0) partes[primera] = { ...partes[primera], cantidad: String(Math.round((base + sobra) * 100) / 100) };
    }
    onChange({ distribucion: partes });
  };

  return (
    <div style={{ display: "grid", gap: 6, padding: "0 10px 10px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: C.t2, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8 }}>Reparto por obra</span>
        <span style={{ color: okColor, fontSize: 11.5, fontWeight: 850 }}>
          asignado {asignado} / {total}
          {resto > 0 ? ` · resto ${resto} → ${item.obra_id ? "obra por defecto" : "stock general"}` : asignado > total ? " · te pasaste" : " ✓"}
        </span>
        {conObra.length > 1 && (
          <button type="button" onClick={repartirIgual}
            style={{ border: `1px solid ${C.blueB}`, background: "var(--blue-soft)", color: C.blue, borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontSize: 11, fontWeight: 850, fontFamily: C.sans }}>
            Partes iguales
          </button>
        )}
        <button type="button" onClick={() => onChange({ distribucion: null })} style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>quitar reparto</button>
      </div>
      {dist.map((d, k) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 92px 28px", gap: 6, alignItems: "center" }}>
          <select value={d.obra_id || ""} onChange={(e) => setRow(k, { obra_id: e.target.value })} style={inp({ padding: "7px 9px", fontSize: 12.5, background: C.panelSolid })}>
            <option value="">Stock general</option>
            {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}
          </select>
          <input value={d.cantidad ?? ""} onChange={(e) => setRow(k, { cantidad: e.target.value })} inputMode="decimal" placeholder="Cant." style={inp({ padding: "7px 9px", fontSize: 12.5 })} />
          <button type="button" onClick={() => removeRow(k)} title="Quitar" style={{ border: "none", background: "transparent", color: C.red, cursor: "pointer", fontSize: 15 }}>×</button>
        </div>
      ))}
      <button type="button" onClick={addRow} style={{ justifySelf: "start", border: `1px solid ${C.b0}`, background: C.bg, color: C.blue, borderRadius: 7, padding: "5px 11px", cursor: "pointer", fontSize: 11.5, fontWeight: 800, fontFamily: C.sans }}>+ Agregar obra</button>
    </div>
  );
}

function ItemLocationRow({ item, material = null, estanterias = [], onChange, isMobile = false }) {
  const effectiveUbicacion = item.ubicacion || material?.ubicacion || "";
  const effectiveObs = item.ubicacion_obs || material?.ubicacion_obs || "";
  const parsed = parseUbicacion(effectiveUbicacion);
  const cod = parsed.afuera ? "AFUERA" : parsed.cod;
  const nivel = parsed.nivel ? String(parsed.nivel) : "";
  const selEst = estanterias.find((est) => est.codigo === cod) || null;
  const nivelesCount = Array.isArray(selEst?.niveles_cm) ? selEst.niveles_cm.length : 0;
  const hasCatalogDefault = !!material?.ubicacion;
  const changed = item.ubicacion_touched;
  const showPreview = !!cod && cod !== "AFUERA" && (changed || !hasCatalogDefault);
  const helper = changed
    ? "Se guardara como ubicacion habitual de este producto."
    : hasCatalogDefault
      ? "Recordada del catalogo."
      : material?.id
        ? "Elegila una vez y queda recordada."
        : "Se guardara cuando el item quede vinculado al catalogo.";
  const field = {
    background: C.bg,
    border: `1px solid ${C.b0}`,
    color: C.t0,
    borderRadius: 7,
    padding: "8px 10px",
    fontSize: 12.5,
    fontFamily: C.sans,
    outline: "none",
    minWidth: 0,
  };
  const setLocation = (nextCod, nextNivel = nivel, nextObs = effectiveObs) => {
    const value = !nextCod ? "" : nextCod === "AFUERA" ? "AFUERA" : (nextNivel ? `${nextCod}-${nextNivel}` : nextCod);
    onChange({ ubicacion: value, ubicacion_obs: nextObs, ubicacion_touched: true });
  };
  return (
    <div style={{ display: "grid", gap: 8, padding: "0 10px 10px 10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "72px minmax(160px, 0.8fr) minmax(128px, 0.55fr) minmax(220px, 1fr) auto", gap: 9, alignItems: "center" }}>
        <span style={{ color: C.t2, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <MapPin size={11} /> Ubic.
        </span>
        <select
          value={cod}
          onChange={(event) => setLocation(event.target.value, "")}
          style={{ ...field, cursor: "pointer" }}
        >
          <option value="">Sin ubicar</option>
          <option value="AFUERA">Afuera del pañol</option>
          {estanterias.map((est) => <option key={est.codigo} value={est.codigo}>{est.codigo}</option>)}
        </select>
        {cod && cod !== "AFUERA" && nivelesCount > 0 ? (
          <select value={nivel} onChange={(event) => setLocation(cod, event.target.value)} style={{ ...field, cursor: "pointer" }}>
            <option value="">Estante</option>
            {Array.from({ length: nivelesCount }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>{i + 1}º estante</option>
            ))}
          </select>
        ) : (
          <span style={{ display: isMobile ? "none" : "block" }} />
        )}
        <input
          value={effectiveObs}
          onChange={(event) => onChange({ ubicacion: effectiveUbicacion, ubicacion_obs: event.target.value, ubicacion_touched: true })}
          placeholder={cod === "AFUERA" ? "Donde queda fisicamente" : "Obs. de ubicacion"}
          style={field}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: isMobile ? "flex-start" : "flex-end", minWidth: 0 }}>
          <UbicacionChip ubicacion={effectiveUbicacion} obs={effectiveObs} />
          {hasCatalogDefault && changed && (
            <button type="button" onClick={() => onChange({ ubicacion: material.ubicacion || "", ubicacion_obs: material.ubicacion_obs || "", ubicacion_touched: false })} style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, borderRadius: 7, padding: "6px 8px", cursor: "pointer", fontSize: 11, fontWeight: 800, fontFamily: C.sans, whiteSpace: "nowrap" }}>
              Usar habitual
            </button>
          )}
        </div>
      </div>
      <div style={{ marginLeft: isMobile ? 0 : 81, color: changed ? C.green : C.t2, fontSize: 11, fontWeight: changed ? 800 : 500 }}>
        {helper}
      </div>
      {showPreview && (
        <div style={{ marginLeft: isMobile ? 0 : 81 }}>
          <MiniMapaUbicacion selectedCode={cod} onPick={(shelfCode) => setLocation(shelfCode, "")} />
        </div>
      )}
    </div>
  );
}

export default function EnviarAPanolModal({ open, onClose, prefill, showPrices = true, profile = null, embedded = false }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const isRemito = prefill?.origen === "remito" || prefill?.modo === "remito";
  // Queda guardado en el borrador para poder retomarlo en el modo correcto.
  const modoDraft = isRemito ? "remito" : "aviso";
  const isCompraNotice = prefill?.origen === "compra";
  const isObraNotice = prefill?.origen === "obra_matriz";
  // Vincular al catálogo sirve en TODOS los modos: es lo que evita duplicados y lo
  // que le permite a Pañol saber qué producto es. Antes estaba limitado a remito /
  // aviso de compra / matriz de obra, pero el botón "Leer remito" está disponible
  // siempre: en un envío normal la IA cargaba 20 ítems con coincidencias y la fila
  // para elegirlas no se renderizaba, así que no había forma de vincularlos.
  const needsCatalogLink = true;
  const sedeLocked = lockedSedeForProfile(profile);
  const sedesDisponibles = sedeLocked ? [sedeLocked] : SEDES_PANOL;

  const [titulo, setTitulo] = useState("");
  const [sede, setSede] = useState("");
  const [obraId, setObraId] = useState("");
  // Obras extra del aviso. Una compra que llega junta suele ir a varias obras;
  // se eligen una sola vez acá arriba y cada renglon despues solo pide cuanto
  // va a cada una.
  const [obrasExtra, setObrasExtra] = useState([]);
  const [prioridad, setPrioridad] = useState("media");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState([]);
  const [obras, setObras] = useState([]);
  const [estanterias, setEstanterias] = useState([]);
  const [saving, setSaving] = useState(false);

  const [nDesc, setNDesc] = useState("");
  const [nCode, setNCode] = useState("");
  const [nCant, setNCant] = useState("");
  const [nUnit, setNUnit] = useState("unidad");
  const [nPrice, setNPrice] = useState("");
  const [nCurrency, setNCurrency] = useState("ARS");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [catalogQ, setCatalogQ] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [fullCatalog, setFullCatalog] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  // Multi-selección del catálogo: Map id→material. Acumula entre búsquedas para
  // agregar varios de una (tildar y después "Agregar N" abajo).
  const [checkedCatalog, setCheckedCatalog] = useState(() => new Map());
  const [aiReading, setAiReading] = useState(false);
  const [textoIa, setTextoIa] = useState("");
  const [pegarAbierto, setPegarAbierto] = useState(false);
  // Borrador que quedo de una carga anterior. Se ofrece al abrir: antes se
  // guardaba igual, pero solo se podia retomar desde Pañol → Ingresar, asi que
  // el que cargaba desde Compras lo daba por perdido.
  const [borradorPrevio, setBorradorPrevio] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiProveedorId, setAiProveedorId] = useState("");
  const [aiMoneda, setAiMoneda] = useState("");
  const [creatingCatalogIndex, setCreatingCatalogIndex] = useState(null);
  const [scanCode, setScanCode] = useState("");
  const [scanFlashMat, setScanFlashMat] = useState(null);
  const [avisoFocusMat, setAvisoFocusMat] = useState(null); // último producto escaneado/elegido, resaltado en los avisos
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchTab, setSearchTab] = useState("materiales"); // "materiales" | "avisos"
  const [avisoQ, setAvisoQ] = useState("");
  const [avisos, setAvisos] = useState([]);
  const [avisosLoading, setAvisosLoading] = useState(false);
  const [expandedAviso, setExpandedAviso] = useState(null);
  const [scanChoice, setScanChoice] = useState(null); // { material, options } cuando el escaneo es ambiguo
  // El cierre por click en el fondo tenía una trampa cara: al borrar un renglón,
  // el elemento desaparece entre el mousedown y el mouseup y el navegador le
  // atribuye el click al ancestro que quedó — el fondo. Resultado: borrabas una
  // línea y el modal se cerraba solo, con todo lo cargado adentro.
  // Con esto sólo cierra si el click EMPEZÓ en el fondo.
  const clickArrancoEnElFondo = useRef(false);
  const autoDraftIdRef = useRef(null);
  const lastAutosaveRef = useRef("");
  const scanInputRef = useRef(null);
  const itemsSectionRef = useRef(null);
  const stockByMaterial = useMemo(() => buildStockByMaterial(stockRows), [stockRows]);

  useEffect(() => {
    if (!open) return;
    setTitulo(prefill?.titulo || "");
    // Solo el pañolero (sedeLocked) arranca con sede fija. Compras/admin/otros deben
    // elegirla a mano en cada aviso → evita mandar a la sede equivocada por defecto.
    setSede(sedeLocked || "");
    setObraId(prefill?.obraId || "");
    setPrioridad(prefill?.prioridad || "media");
    setObservaciones(prefill?.observaciones || "");
    const nextItems = Array.isArray(prefill?.items) ? prefill.items.map(normalizeItem) : [];
    setItems(showPrices ? nextItems : nextItems.map(stripItemPrice));
    setNDesc("");
    setNCode("");
    setNCant("");
    setNUnit("unidad");
    setNPrice("");
    setNCurrency("ARS");
    setBulkText("");
    setShowBulk(false);
    setCatalogQ("");
    setCatalog([]);
    setFullCatalog([]);
    setStockRows([]);
    setSelectedMaterial(null);
    setCheckedCatalog(new Map());
    setAvisoFocusMat(null);
    setAvisoQ("");
    setAiSummary(null);
    setAiProveedorId("");
    setAiMoneda("");
    autoDraftIdRef.current = prefill?.draftId || null;
    lastAutosaveRef.current = "";
    supabase
      .from("produccion_obras")
      .select("id,codigo,estado")
      .order("codigo")
      .then(({ data }) => setObras(data ?? []))
      .catch(() => {});
    supabase
      .from("panol_estanterias")
      .select("codigo,niveles_cm")
      .eq("activo", true)
      .order("codigo")
      .then(({ data, error }) => { if (!error) setEstanterias(applyPanolReferenceLayout(data ?? [])); })
      .catch(() => setEstanterias([]));
  }, [open, prefill, showPrices, sedeLocked]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    Promise.allSettled([
      fetchPanolCatalogFull(),
      fetchProveedores(),
    ])
      .then(([catalogResult, proveedoresResult]) => {
        if (!alive) return;
        setFullCatalog(catalogResult.status === "fulfilled" ? catalogResult.value : []);
        setProveedores(proveedoresResult.status === "fulfilled" ? proveedoresResult.value ?? [] : []);
    });
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    fetchMaterialesEgreso({ sede: sede || null, estados: STOCK_LEDGER_STATES })
      .then((rows) => {
        if (alive) setStockRows(rows ?? []);
      })
      .catch(() => {
        if (alive) setStockRows([]);
      });
    return () => { alive = false; };
  }, [open, sede]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const timer = setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const rows = await fetchPanolCatalogMini({ q: catalogQ, limit: 60 });
        if (alive) setCatalog(rows);
      } catch {
        if (alive) setCatalog([]);
      } finally {
        if (alive) setCatalogLoading(false);
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, catalogQ]);

  useEffect(() => {
    // Antes esto era solo para el remito. El aviso a panol no guardaba nada, asi
    // que cualquier cierre accidental se llevaba puesto todo lo cargado.
    if (!open || saving) return undefined;
    const payload = { titulo, sede, obraId, prioridad, observaciones, items, modo: modoDraft };
    if (!draftHasContent(payload)) return undefined;
    const serialized = JSON.stringify(payload);
    if (serialized === lastAutosaveRef.current) return undefined;
    const timer = setTimeout(() => {
      const id = guardarIngresoPendiente(payload, autoDraftIdRef.current || prefill?.draftId || null);
      if (id) {
        autoDraftIdRef.current = id;
        lastAutosaveRef.current = serialized;
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [open, isRemito, modoDraft, saving, titulo, sede, obraId, prioridad, observaciones, items, prefill?.draftId]);

  // El autoguardado de arriba tiene 900ms de debounce y su cleanup cancela el
  // timer pendiente. Si el componente se desmonta dentro de esa ventana (cambio
  // de pestaña, navegación, retomar otro borrador) lo último cargado se perdía.
  // Este ref guarda siempre el payload vigente para poder volcarlo sin debounce.
  const draftPayloadRef = useRef(null);
  useEffect(() => {
    draftPayloadRef.current = open
      ? { titulo, sede, obraId, prioridad, observaciones, items, modo: modoDraft, draftId: prefill?.draftId || null }
      : null;
  }, [open, titulo, sede, obraId, prioridad, observaciones, items, modoDraft, prefill?.draftId]);

  useEffect(() => {
    const flush = () => {
      const payload = draftPayloadRef.current;
      if (!payload || !draftHasContent(payload)) return;
      const { draftId, ...draft } = payload;
      const id = guardarIngresoPendiente(draft, autoDraftIdRef.current || draftId || null);
      if (id) autoDraftIdRef.current = id;
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    // Cierre de la pestaña del navegador, navegación interna y desmontaje: en los
    // tres casos el borrador queda escrito antes de que el componente muera.
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, []);

  // Al abrir, si quedó algo cargado de la vez anterior se ofrece retomarlo. El
  // borrador ya se guardaba solo, pero únicamente se podía recuperar desde
  // Pañol → Ingresar: el que cargaba desde Compras lo daba por perdido.
  useEffect(() => {
    if (!open) return;
    // Si ya venís retomando uno, o el formulario viene con ítems del pedido de
    // compra, ofrecer otro borrador sería ruido.
    if (prefill?.draftId || prefill?.items?.length) return;
    try {
      const mio = leerIngresosPendientes().find((d) => (d.modo || "remito") === modoDraft);
      if (mio) setBorradorPrevio(mio);
    } catch { /* sin borrador se sigue igual */ }
    // Sólo al abrir: después el autoguardado escribe su propio borrador y no hay
    // que ofrecerlo de vuelta mientras se está cargando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function retomarBorrador() {
    const d = borradorPrevio;
    if (!d) return;
    setTitulo(d.titulo || "");
    if (d.sede) setSede(d.sede);
    setObraId(d.obraId || "");
    if (d.prioridad) setPrioridad(d.prioridad);
    setObservaciones(d.observaciones || "");
    setItems(Array.isArray(d.items) ? d.items : []);
    autoDraftIdRef.current = d.id;
    setBorradorPrevio(null);
    toast.success("Borrador retomado.");
  }

  // Todos los avisos/pedidos de compra abiertos, para la pestaña "Avisos de recepción"
  useEffect(() => {
    if (!open || !isRemito) return undefined;
    let alive = true;
    setAvisosLoading(true);
    fetchRecepcionAvisosAbiertos({ sede: sedeLocked || null, limit: 1000 })
      .then((rows) => { if (alive) setAvisos(rows); })
      .catch(() => { if (alive) setAvisos([]); })
      .finally(() => { if (alive) setAvisosLoading(false); });
    return () => { alive = false; };
  }, [open, isRemito, sedeLocked]);

  // Al elegir la obra por defecto arriba, si hay un aviso de esa obra lo abre para marcar.
  useEffect(() => {
    if (!obraId || !avisos.length) return;
    const match = avisos.find((a) => a.obra_id === obraId);
    if (match) { setSearchTab("avisos"); setExpandedAviso(match.request_id || match.request_title || null); }
  }, [obraId, avisos]);

  // Escaneo: foco inicial en el campo (flujo scan-first) + lector global (keyboard wedge)
  useEffect(() => {
    if (!open || !isRemito) return undefined;
    const t = setTimeout(() => scanInputRef.current?.focus(), 90);
    return () => clearTimeout(t);
  }, [open, isRemito]);

  useKeyboardWedge({ enabled: open && isRemito && !scannerOpen && !scanChoice, onScan: (code) => processScan(code) });

  const obrasActivas = useMemo(() => {
    const rows = obras.filter((o) => !["terminada", "cancelada", "archivada"].includes(o.estado));
    return rows.length ? rows : obras;
  }, [obras]);

  // Producto real del catálogo detrás de un ítem de aviso (el aviso guarda el
  // texto libre del pedido; el pañolero necesita ver qué producto es).
  const catalogById = useMemo(() => new Map(fullCatalog.map((m) => [m.id, m])), [fullCatalog]);
  const productoDeAviso = useCallback(
    (m) => catalogById.get(m.material_id) || catalogById.get(m.requisito_material_id) || null,
    [catalogById],
  );

  const avisosAgrupados = useMemo(() => {
    const byReq = new Map();
    for (const m of avisos) {
      const key = m.request_id || m.request_title || "sin";
      if (!byReq.has(key)) byReq.set(key, { key, request_id: m.request_id, request_title: m.request_title, obra_codigo: m.obra_codigo, linea_nombre: m.linea_nombre, items: [] });
      byReq.get(key).items.push(m);
    }
    // Un aviso repartido entre varias obras mostraba la del primer renglón y
    // escondía el resto: el pañolero veía "52-24" en algo que también iba al
    // 52-23 y no tenía forma de saber cuál renglón era de cuál.
    for (const grupo of byReq.values()) {
      const codigos = [...new Set(grupo.items.map((it) => it.obra_codigo).filter(Boolean))];
      grupo.obras_codigos = codigos;
      if (codigos.length > 1) grupo.obra_codigo = codigos.join(" · ");
    }
    // Si hay obra seleccionada arriba, se muestran SOLO los avisos de esa obra.
    const grupos = [...byReq.values()];
    const filtrados = obraId ? grupos.filter((g) => g.items.some((it) => it.obra_id === obraId)) : grupos;
    return filtrados.sort((a, b) => String(b.request_id ?? "").localeCompare(String(a.request_id ?? "")));
  }, [avisos, obraId]);

  // Buscador propio de la pestaña de avisos: filtra por título del pedido, obra,
  // descripción del ítem y también por el producto del catálogo al que apunta.
  const avisosVisibles = useMemo(() => {
    const term = avisoQ.trim().toLowerCase();
    if (!term) return avisosAgrupados;
    const matchItem = (m) => {
      const prod = catalogById.get(m.material_id) || catalogById.get(m.requisito_material_id) || null;
      return [m.description, m.obra_codigo, m.request_title, prod?.descripcion, prod?.codigo]
        .filter(Boolean).join(" ").toLowerCase().includes(term);
    };
    return avisosAgrupados
      .map((av) => ({ ...av, items: av.items.filter(matchItem) }))
      .filter((av) => av.items.length
        || `${av.request_title || ""} ${av.obra_codigo || ""}`.toLowerCase().includes(term));
  }, [avisosAgrupados, avisoQ, catalogById]);

  const addedPedidoIds = useMemo(() => {
    const s = new Set();
    for (const it of items) {
      if (it.purchase_request_item_id) s.add(it.purchase_request_item_id);
      if (it.panol_envio_item_id) s.add(it.panol_envio_item_id);
    }
    return s;
  }, [items]);
  const avisoItemAdded = (m) => addedPedidoIds.has(m.panol_envio_item_id) || addedPedidoIds.has(m.purchase_request_item_id);

  // Renglones que se estan por cargar a mano y que YA vienen en un aviso abierto
  // de la misma obra: es el caso que duplica stock. Se calcula mientras se carga
  // para poder avisarlo a tiempo, no recien al apretar Guardar.
  const duplicadosConAvisos = useMemo(() => {
    if (!isRemito || !obraId) return EMPTY_ARR;
    const esperando = new Set(
      avisos
        .filter((a) => a.obra_id === obraId && !avisoItemAdded(a))
        .map((a) => a.material_id || a.requisito_material_id)
        .filter(Boolean),
    );
    if (!esperando.size) return EMPTY_ARR;
    // El renglon ya vinculado a un aviso no duplica nada: es justamente el que
    // se esta recepcionando.
    return items.filter((it) => it.material_id && !it.panol_envio_item_id && esperando.has(it.material_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRemito, obraId, avisos, items, addedPedidoIds]);

  // Índice material → avisos abiertos donde aparece. Es lo que permite que al
  // buscar o escanear un producto se vea en qué aviso está esperando.
  const avisosPorMaterial = useMemo(() => {
    const byMat = new Map();
    for (const m of avisos) {
      const key = m.material_id || m.requisito_material_id;
      if (!key) continue;
      if (!byMat.has(key)) byMat.set(key, []);
      byMat.get(key).push(m);
    }
    return byMat;
  }, [avisos]);

  // Material bajo foco (recién escaneado o tildado en el catálogo): se resalta en
  // los avisos para que se vea dónde está esperando ese producto.
  const focusMaterialId = avisoFocusMat || selectedMaterial?.id || null;
  const avisosDelFoco = focusMaterialId ? (avisosPorMaterial.get(focusMaterialId) || EMPTY_ARR) : EMPTY_ARR;
  const avisosDelFocoPendientes = avisosDelFoco.filter((m) => !avisoItemAdded(m));

  if (!open) return null;

  function resetQuickAdd() {
    setNDesc("");
    setNCode("");
    setNCant("");
    setNUnit("unidad");
    setNPrice("");
    setNCurrency("ARS");
  }

  function addItem() {
    const base = parsePanolLine(nDesc);
    const descripcion = (base?.descripcion || nDesc).trim();
    if (!descripcion) {
      toast.warning("Cargá una descripción.");
      return;
    }
    setItems((prev) => [...prev, {
      descripcion,
      codigo: (nCode || base?.codigo || "").trim().toUpperCase(),
      cantidad: nCant.trim() || base?.cantidad || "",
      unidad: nUnit !== "unidad" ? nUnit : base?.unidad || "unidad",
      precio_unitario: showPrices ? nPrice.trim() : "",
      moneda: showPrices ? nCurrency : "ARS",
      obra_id: obraId || "",
      material_id: selectedMaterial?.id || "",
      proveedor: selectedMaterial?.proveedor || "",
      ubicacion: selectedMaterial?.ubicacion || "",
      ubicacion_obs: selectedMaterial?.ubicacion_obs || "",
      ubicacion_touched: false,
      variante: "",
      recepcion_estado: isRemito ? "recibido" : null,
      purchase_request_item_id: null,
      obra_snapshot_item_id: null,
    }]);
    resetQuickAdd();
  }

  function addBulk() {
    const parsed = bulkText
      .split("\n")
      .map(parsePanolLine)
      .filter(Boolean);
    if (!parsed.length) return;
    const next = parsed.map((item) => ({
      ...item,
      obra_id: obraId || "",
      variante: "",
      recepcion_estado: isRemito ? "recibido" : null,
    }));
    setItems((prev) => [...prev, ...(showPrices ? next : next.map(stripItemPrice))]);
    setBulkText("");
    setShowBulk(false);
    const withCode = parsed.filter((it) => it.codigo).length;
    toast.success(`${parsed.length} ítems agregados · ${withCode} código${withCode === 1 ? "" : "s"} detectado${withCode === 1 ? "" : "s"}`);
  }

  function removeItem(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(i, patch) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  // Las obras del aviso: la principal primero, después las agregadas. Sin memo
  // a propósito: son dos o tres elementos y memorizarlo cuesta más que armarlo.
  const obrasDelAviso = [obraId, ...obrasExtra].filter(Boolean);

  // Al elegir una segunda obra, cada renglon que se pueda repartir arranca con
  // las obras ya puestas y las cantidades en blanco. Asi el que carga solo
  // completa numeros en vez de volver a elegir obra por renglon.
  function sembrarReparto(obrasIds) {
    if (obrasIds.length < 2) return;
    setItems((prev) => prev.map((it) => {
      const puedeRepartirse = !it.purchase_request_item_id && !it.panol_envio_item_id && !it.obra_snapshot_item_id;
      if (!puedeRepartirse || Array.isArray(it.distribucion)) return it;
      return { ...it, distribucion: obrasIds.map((id) => ({ obra_id: id, cantidad: "" })) };
    }));
  }

  function agregarObraExtra(id) {
    if (!id || id === obraId || obrasExtra.includes(id)) return;
    const siguiente = [...obrasExtra, id];
    setObrasExtra(siguiente);
    sembrarReparto([obraId, ...siguiente].filter(Boolean));
  }

  function quitarObraExtra(id) {
    const siguiente = obrasExtra.filter((x) => x !== id);
    setObrasExtra(siguiente);
    // El reparto ya cargado no se toca: si alguien puso cantidades y saca la
    // obra de arriba, borrarselas seria peor que dejarlas a la vista.
  }

  async function getCatalogForMatching() {
    if (fullCatalog.length) return fullCatalog;
    const rows = await fetchPanolCatalogFull();
    setFullCatalog(rows);
    return rows;
  }

  function persistDraftNow() {
    const payload = { titulo, sede, obraId, prioridad, observaciones, items, modo: modoDraft };
    if (!draftHasContent(payload)) return null;
    const id = guardarIngresoPendiente(payload, autoDraftIdRef.current || prefill?.draftId || null);
    if (id) {
      autoDraftIdRef.current = id;
      lastAutosaveRef.current = JSON.stringify(payload);
    }
    return id;
  }

  async function rememberTouchedLocations(sourceItems) {
    const updates = [];
    const patchByMaterial = new Map();
    for (const item of sourceItems) {
      if (!item.material_id || !item.ubicacion_touched) continue;
      if (patchByMaterial.has(item.material_id)) continue;
      const patch = {
        ubicacion: item.ubicacion || null,
        ubicacionObs: item.ubicacion_obs || null,
      };
      patchByMaterial.set(item.material_id, patch);
      updates.push(guardarUbicacionMaterial(item.material_id, patch));
    }
    if (!updates.length) return;
    await Promise.all(updates);
    setFullCatalog((prev) => prev.map((material) => {
      const patch = patchByMaterial.get(material.id);
      if (!patch) return material;
      return { ...material, ubicacion: patch.ubicacion || null, ubicacion_obs: patch.ubicacionObs || null };
    }));
  }

  async function rememberSnapshotProducts(sourceItems) {
    const updates = sourceItems
      .filter((item) => item.obra_snapshot_item_id && item.requisito_material_id && item.material_id)
      .filter((item) => item.requisito_material_id !== item.material_id)
      .map((item) => supabase.rpc("panol_asignar_producto_snapshot", {
        p_snapshot_id: item.obra_snapshot_item_id,
        p_producto_material_id: item.material_id,
        p_origen: "panol",
      }));
    if (!updates.length) return;
    const results = await Promise.all(updates);
    const error = results.find((result) => result.error)?.error;
    if (!error) return;
    if (isMissingVariantColumn(error) || String(error.message || "").toLowerCase().includes("function")) {
      throw new Error("Falta aplicar la migración de productos por obra antes de continuar.");
    }
    throw new Error(error.message || "No se pudo guardar el producto concreto de la obra.");
  }

  function closeModal(saved = false) {
    if (saved) {
      // El ingreso ya se guardó y su borrador se borró: hay que apagar el volcado
      // de desmontaje, si no lo resucita como borrador apenas se remonta el form.
      draftPayloadRef.current = null;
    } else {
      // Vale para las dos formas: si cerraste sin guardar, lo cargado queda como
      // borrador y se retoma despues.
      persistDraftNow();
    }
    onClose(saved);
  }

  function linkCatalogMaterial(index, material) {
    if (!material) return;
    setItems((prev) => prev.map((it, idx) => (idx === index ? { ...it, ...itemPatchFromMaterial(material, it) } : it)));
  }

  async function createCatalogMaterialForItem(index) {
    const item = items[index];
    const desc = String(item?.descripcion || "").trim();
    if (!desc) {
      toast.warning("Cargá una descripción antes de crear el material.");
      return null;
    }
    if (desc.length < 4) {
      toast.warning("Descripción muy corta. Agregá marca, medida o modelo (ej: \"Caja ducha 800 GPH\").");
      return null;
    }
    // ¿Ya existe uno parecido? → ofrecer usar ese en vez de duplicar (evita "Caja de ducha" vs "Caja ducha 800 gph").
    const [best] = topCatalogMatches(fullCatalog, item, 1);
    if (best && (best._score || 0) >= 42) {
      const usar = window.confirm(
        `⚠ Puede que este material YA EXISTA en el catálogo:\n\n"${best.descripcion}"${best.codigo ? ` · ${best.codigo}` : ""}\n\n• Aceptar = usar ESE (recomendado, evita duplicados)\n• Cancelar = crear "${desc}" igual`,
      );
      if (usar) {
        linkCatalogMaterial(index, best);
        toast.success(`Vinculado a "${best.descripcion}".`);
        return best;
      }
    } else if (desc.length < 6) {
      const ok = window.confirm(`La descripción "${desc}" es muy escueta. Conviene agregar marca / medida / modelo para no duplicar más adelante.\n\n¿Crear igual?`);
      if (!ok) return null;
    }
    setCreatingCatalogIndex(index);
    try {
      const created = await crearPanolCatalogMaterial({
        descripcion: item.descripcion,
        codigo: item.codigo,
        unidad: item.unidad,
        proveedor: item.proveedor,
        precio_unitario: item.precio_unitario,
        moneda: item.moneda,
        ubicacion: item.ubicacion || null,
        ubicacion_obs: item.ubicacion_obs || null,
      });
      setFullCatalog((prev) => [created, ...prev.filter((mat) => mat.id !== created.id)]);
      invalidatePanolCatalogFullCache(); // el cache de sesión debe traer el nuevo la próxima
      linkCatalogMaterial(index, created);
      toast.success("Material creado en el catálogo para revisar.");
      return created;
    } catch (err) {
      toast.error(err.message || "No se pudo crear el material en catálogo.");
      return null;
    } finally {
      setCreatingCatalogIndex(null);
    }
  }

  async function ensureCatalogLinksForItems(sourceItems) {
    let catalogRows = await getCatalogForMatching();
    const createdRows = [];
    const prepared = [];
    for (const item of sourceItems) {
      const currentMaterial = catalogRows.find((material) => material.id === item.material_id) || null;
      if (currentMaterial?.es_requisito === true) {
        throw new Error(`Elegí el producto concreto para “${item.descripcion || currentMaterial.descripcion}” antes de continuar.`);
      }
      if ((item.material_id && currentMaterial) || !String(item.descripcion || "").trim()) {
        prepared.push(item);
        continue;
      }
      // Si hay un match FUERTE con el catálogo, se vincula solo (evita duplicado) sin bloquear.
      const [best] = topCatalogMatches(catalogRows, item, 1);
      if (best && materialMatchIsStrong(best._score)) {
        prepared.push({ ...item, ...itemPatchFromMaterial(best, item) });
        continue;
      }
      // Sin un match fuerte, el item se crea en catalogo y queda marcado para revisar.
      const created = await crearPanolCatalogMaterial({
        descripcion: item.descripcion,
        codigo: item.codigo,
        unidad: item.unidad,
        proveedor: item.proveedor,
        precio_unitario: item.precio_unitario,
        moneda: item.moneda,
        ubicacion: item.ubicacion || null,
        ubicacion_obs: item.ubicacion_obs || null,
      });
      catalogRows = [created, ...catalogRows];
      createdRows.push(created);
      prepared.push({ ...item, ...itemPatchFromMaterial(created, item) });
    }
    if (createdRows.length) {
      setFullCatalog(catalogRows);
      invalidatePanolCatalogFullCache(); // el cache de sesión debe traer los nuevos la próxima
      toast.success(`${createdRows.length} material${createdRows.length === 1 ? "" : "es"} nuevo${createdRows.length === 1 ? "" : "s"} en catálogo para revisar.`);
    }
    return prepared;
  }

  function buildCatalogItem(material) {
    const base = {
      descripcion: material.descripcion,
      codigo: material.codigo || "",
      codigo_barra: material.codigo_barra || materialBarcodeList(material)[0]?.codigo || "",
      cantidad: "1",
      unidad: material.unidad || "unidad",
      precio_unitario: showPrices ? (material.precio_unitario ?? "") : "",
      moneda: showPrices ? (material.moneda || "ARS") : "ARS",
      obra_id: obraId || "",
      material_id: material.id,
      proveedor: material.proveedor || "",
      ubicacion: material.ubicacion || "",
      ubicacion_obs: material.ubicacion_obs || "",
      ubicacion_touched: false,
      variante: "",
      recepcion_estado: isRemito ? "recibido" : null,
      purchase_request_item_id: null,
      obra_snapshot_item_id: null,
    };
    return showPrices ? base : stripItemPrice(base);
  }

  function addCatalogMaterial(material = selectedMaterial) {
    if (!material) return;
    setItems((prev) => [...prev, buildCatalogItem(material)]);
  }

  function toggleCheckedCatalog(material) {
    setCheckedCatalog((prev) => {
      const next = new Map(prev);
      if (next.has(material.id)) next.delete(material.id);
      else next.set(material.id, material);
      return next;
    });
  }

  // Agrega todos los tildados (o el seleccionado, si no hay tildados) a la lista de abajo.
  function addCheckedCatalogMaterials() {
    const chosen = [...checkedCatalog.values()];
    if (!chosen.length) {
      addCatalogMaterial();
      return;
    }
    setItems((prev) => [...prev, ...chosen.map((m) => buildCatalogItem(m))]);
    setCheckedCatalog(new Map());
    setSelectedMaterial(null);
  }

  function bumpItemQty(idx, by = 1) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const actual = Number(String(it.cantidad ?? "").replace(",", ".")) || 0;
      return { ...it, cantidad: String(actual + by) };
    }));
  }

  function flashMaterial(matId) {
    if (!matId) return;
    setScanFlashMat(matId);
    // El borde parpadea 1,3s, pero el resaltado en los avisos queda hasta el
    // próximo escaneo: si no, el pañolero no llega a ver en qué aviso cayó.
    setAvisoFocusMat(matId);
    setTimeout(() => setScanFlashMat((cur) => (cur === matId ? null : cur)), 1300);
  }

  // Escanear = buscar el producto en los avisos de recepción abiertos y marcarlo ahí
  // (abriendo el aviso). Si no está en ningún aviso, ingreso directo. Nunca clickear ni borrar.
  function processScan(rawCode) {
    if (!isRemito) return;
    const code = normalizeBarcode(rawCode);
    if (!code) return;
    setScanCode("");
    setTimeout(() => scanInputRef.current?.focus(), 40);

    const material = fullCatalog.find((m) =>
      materialBarcodeList(m).some((b) => normalizeBarcode(b.codigo) === code)
      || (m.codigo && normalizeBarcode(m.codigo) === code));

    // 1) ¿Ya está en la lista? Ítem de aviso → aviso "ya marcado"; ingreso directo → +1
    const existingIdx = items.findIndex((it) =>
      (material && it.material_id === material.id)
      || (it.codigo_barra && normalizeBarcode(it.codigo_barra) === code)
      || (it.codigo && normalizeBarcode(it.codigo) === code));
    if (existingIdx >= 0) {
      const it = items[existingIdx];
      flashMaterial(it.material_id);
      if (it.panol_envio_item_id || it.purchase_request_item_id) {
        toast.success(`Ya marcado · ${it.descripcion || "ítem"}`);
      } else {
        bumpItemQty(existingIdx, 1);
        toast.success(`+1 · ${it.descripcion || "ítem"}`);
      }
      scanBeep(900, 80);
      return;
    }

    if (material) {
      // 2) ¿Está en algún aviso de recepción abierto? Si hay obra seleccionada, solo
      //    esa obra. Si queda 1 → se marca; si hay varios → se pregunta a cuál asignar.
      const enAvisos = avisos.filter((a) => a.material_id === material.id && !avisoItemAdded(a));
      const candidatos = obraId ? enAvisos.filter((a) => a.obra_id === obraId) : enAvisos;
      const nAvisos = new Set(candidatos.map((a) => a.request_id)).size;
      if (candidatos.length && nAvisos === 1) {
        const elegido = candidatos[0];
        agregarPedidoItem(elegido);
        setSearchTab("avisos");
        setExpandedAviso(elegido.request_id || elegido.request_title || null);
        flashMaterial(material.id);
        toast.success(`Recepcionado del aviso · ${elegido.description || material.descripcion}`);
        scanBeep(900, 80);
        return;
      }
      if (candidatos.length && nAvisos > 1) {
        // Ambiguo → preguntar a qué aviso/obra asignar este producto
        setScanChoice({ material, options: candidatos });
        scanBeep(600, 120);
        return;
      }
      // 3) No está en ningún aviso (para el contexto) → ingreso directo desde el catálogo
      addCatalogMaterial(material);
      flashMaterial(material.id);
      toast.success(`Ingreso directo · ${material.descripcion}`);
      scanBeep(760, 90);
      return;
    }

    // 4) Código desconocido → no se crea al vuelo; hay que crear el producto primero.
    setNCode(code);
    scanBeep(300, 200);
    toast.warning(`Código ${code} no está en el catálogo. Creá el producto en la pestaña “Crear producto” y volvé a escanear.`);
  }

  // Agregar (marcar) un ítem de un aviso sin escanear: lo vincula al catálogo si puede.
  function agregarPedidoItem(m) {
    if (!m) return;
    const dupe = (m.purchase_request_item_id && items.some((it) => it.purchase_request_item_id === m.purchase_request_item_id))
      || (m.panol_envio_item_id && items.some((it) => it.panol_envio_item_id === m.panol_envio_item_id));
    if (dupe) return;
    const linked = fullCatalog.find((mm) => mm.id === m.material_id) || null;
    const nuevo = matchToItem(m, linked);
    setItems((prev) => [...prev, showPrices ? nuevo : stripItemPrice(nuevo)]);
  }

  // Lee un remito (foto o PDF) o directamente el texto pegado. Muchos pedidos
  // llegan por mail o WhatsApp: sacarles una captura para que la IA los lea era
  // dar una vuelta al pedo si el texto ya se puede copiar.
  async function readRemitoWithAI({ file = null, text = "" } = {}) {
    const texto = String(text || "").trim();
    if (!file && !texto) return;
    setAiReading(true);
    try {
      const proveedorElegido = proveedores.find((proveedor) => proveedor.id === aiProveedorId);
      const proveedorHint = proveedorElegido?.nombre || "";
      const data = await leerPresupuestoConIA({
        ...(texto ? { text: texto } : { file }),
        proveedor: proveedorHint,
        moneda: aiMoneda,
      });
      const catalogRows = await getCatalogForMatching();
      const aiItems = (data?.items || data?.lineas || [])
        .map((it) => normalizeItem({
          descripcion: it.descripcion || it.description || it.nombre || "",
          codigo: it.codigo || it.code || "",
          cantidad: it.cantidad ?? it.quantity ?? "",
          // El remito escribe "m.", "UN", "mts"; el select sólo acepta la lista
          // canónica. Sin normalizar, "m" no matcheaba ninguna opción y la fila
          // se mostraba como "unidad": 100 metros de cable entraban como 100 unidades.
          unidad: normalizeUnidadMedida(it.unidad || it.unit, "unidad"),
          precio_unitario: it.precio_unitario ?? it.precio ?? "",
          moneda: String(it.moneda || data?.moneda || aiMoneda || "ARS").toUpperCase() === "USD" ? "USD" : "ARS",
          obra_id: obraId || "",
          proveedor: proveedorHint || data?.proveedor || "",
          recepcion_estado: isRemito ? "recibido" : null,
        }))
        .filter((it) => it.descripcion);
      // Se guarda si hubo candidatos aunque no alcanzaran el umbral: no es lo mismo
      // "el catálogo no lo tiene" (producto nuevo, se crea al guardar) que "lo tiene
      // pero el parecido quedó corto" (hay que elegir a mano). Antes las dos cosas
      // se mostraban igual, como "0% de detección", y parecía que la IA había fallado.
      let conSugerencia = 0;
      const hydratedItems = aiItems.map((item) => {
        const [best] = topCatalogMatches(catalogRows, item, 1);
        if (best && materialMatchIsStrong(best._score)) return { ...item, ...itemPatchFromMaterial(best, item) };
        if (best) conSugerencia += 1;
        return item;
      });
      if (!hydratedItems.length) {
        toast.warning("La IA no detecto items.");
        return;
      }
      setItems((prev) => [...prev, ...(showPrices ? hydratedItems : hydratedItems.map(stripItemPrice))]);
      if (!titulo.trim() && (proveedorHint || data?.proveedor)) setTitulo(`Remito ${proveedorHint || data.proveedor}`);
      const suggested = hydratedItems.filter((item) => item.material_id).length;
      const linkedPercent = Math.round((suggested / hydratedItems.length) * 100);
      const nuevos = hydratedItems.length - suggested - conSugerencia;
      const currencies = hydratedItems.reduce((counts, item) => {
        const currency = item.moneda === "USD" ? "USD" : "ARS";
        counts[currency] = (counts[currency] || 0) + 1;
        return counts;
      }, {});
      setAiSummary({ detected: hydratedItems.length, linked: suggested, linkedPercent, conSugerencia, nuevos, currencies });
      toast.success(`IA leyo ${hydratedItems.length} item${hydratedItems.length === 1 ? "" : "s"} - ${suggested} vinculado${suggested === 1 ? "" : "s"} al catalogo.`);
      if (texto) setTextoIa("");
      window.setTimeout(() => itemsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (err) {
      toast.error(err.message || "No se pudo leer el remito.");
    } finally {
      setAiReading(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.warning("Cargá un título.");
      return;
    }
    if (!SEDES_PANOL.includes(sede)) {
      toast.warning("Elegí una sede.");
      return;
    }
    if (sedeLocked && sede !== sedeLocked) {
      toast.warning(`Tu usuario solo puede cargar materiales en ${sedeLocked}.`);
      return;
    }
    if (items.length === 0) {
      toast.warning("Agregá al menos un ítem.");
      return;
    }
    // El reparto por obra no puede superar la cantidad del ítem.
    const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
    const sobreAsignado = items.find((it) => Array.isArray(it.distribucion) && it.distribucion.reduce((s, d) => s + num(d.cantidad), 0) > num(it.cantidad) + 0.001);
    if (sobreAsignado) {
      toast.warning(`Repartiste más unidades de las que hay en "${sobreAsignado.descripcion || "un ítem"}". Ajustá el reparto por obra.`);
      return;
    }
    // Solo frena si de verdad se esta por cargar DOS VECES el mismo producto:
    // uno que ya viene esperando en un aviso de esta obra. Preguntar por
    // cualquier pendiente de la obra hacia saltar el cartel en cada ingreso, y
    // cancelarlo abortaba el guardado sin decir nada.
    if (duplicadosConAvisos.length) {
      const nombres = duplicadosConAvisos.slice(0, 4).map((it) => it.descripcion || "un ítem").join(", ");
      const n = duplicadosConAvisos.length;
      const ok = window.confirm(
        `${n === 1 ? "Este producto ya está" : `Estos ${n} productos ya están`} esperando en Recepción para esta obra:\n\n`
        + `${nombres}${n > 4 ? ` y ${n - 4} más` : ""}\n\n`
        + `Si es el mismo material, marcalo en la pestaña "Avisos de recepción" en vez de cargarlo de nuevo: si no, entra dos veces al stock.\n\n¿Guardar igual?`,
      );
      if (!ok) {
        // Sin este aviso, Cancelar se veia igual que un boton roto.
        toast.warning("No se guardó nada. Marcá lo que llegó en la pestaña «Avisos de recepción».");
        setSearchTab("avisos");
        return;
      }
    }
    setSaving(true);
    try {
      const preparedItems = await ensureCatalogLinksForItems(items);
      setItems(preparedItems);
      try {
        await rememberTouchedLocations(preparedItems);
      } catch (locationError) {
        toast.warning(locationError.message || "El ingreso sigue, pero no se pudo guardar la ubicacion habitual.");
      }
      // Primero se fija el producto concreto en la obra. Así el trigger que
      // crea el ítem de Pañol ya copia el SKU correcto y nunca el requisito.
      await rememberSnapshotProducts(preparedItems);
      const linkedRecepcionItems = preparedItems
        .map((it) => ({
          id: it.panol_envio_item_id,
          cantidad: String(it.cantidad || "").trim(),
        }))
        .filter((it) => it.id);
      await crearEnvio({
        titulo: titulo.trim(),
        sede,
        prioridad,
        obraId: obraId || null,
        observaciones: observaciones.trim() || null,
        origen: isRemito ? "remito" : prefill?.origen || "manual",
        purchaseRequestId: prefill?.purchaseRequestId || null,
        purchaseLogId: prefill?.purchaseLogId || null,
        items: preparedItems.flatMap((it) => {
          const precio = showPrices ? normalizePriceForDb(it.precio_unitario) : null;
          const base = {
            ...it,
            codigo: String(it.codigo || "").trim().toUpperCase() || null,
            precio_unitario: precio,
            moneda: precio ? it.moneda || "ARS" : null,
            recepcion_estado: isRemito ? "recibido" : it.recepcion_estado || null,
          };
          delete base.distribucion;
          const total = num(it.cantidad);
          const soloDirecto = !it.purchase_request_item_id && !it.panol_envio_item_id && !it.obra_snapshot_item_id;
          const dist = soloDirecto && Array.isArray(it.distribucion)
            ? it.distribucion.map((d) => ({ obra_id: d.obra_id || null, cantidad: num(d.cantidad) })).filter((d) => d.cantidad > 0)
            : [];
          if (dist.length) {
            // Un ítem de envío por cada obra del reparto; el resto va a la obra por defecto / stock general.
            const partes = dist.map((d) => ({ ...base, obra_id: d.obra_id, cantidad: String(d.cantidad) }));
            const resto = Math.round((total - dist.reduce((s, d) => s + d.cantidad, 0)) * 100) / 100;
            if (resto > 0) partes.push({ ...base, obra_id: it.obra_id || obraId || null, cantidad: String(resto) });
            return partes;
          }
          return [{ ...base, obra_id: it.obra_id || obraId || null }];
        }),
      });
      for (const linked of linkedRecepcionItems) {
        await marcarItems([linked.id], "recibido", { cantidadRecibida: linked.cantidad || null });
      }
      toast.success(`${isRemito ? "Materiales ingresados" : `Envío a Pañol ${sede} creado`} · ${preparedItems.length} ítem${preparedItems.length > 1 ? "s" : ""}`);
      const draftId = autoDraftIdRef.current || prefill?.draftId;
      if (draftId) olvidarIngresoPendiente(draftId);
      closeModal(true);
    } catch (err) {
      toast.error(err.message || "No se pudo crear el envío.");
    } finally {
      setSaving(false);
    }
  }

  // Por que el boton de guardar esta apagado. Sin esto el pañolero lo aprieta,
  // no pasa nada y da por hecho que el sistema no anda.
  const faltaParaGuardar = saving
    ? ""
    : !titulo.trim() && !items.length
      ? "Falta el título y al menos un ítem"
      : !titulo.trim()
        ? "Falta el título arriba"
        : !items.length
          ? "Agregá al menos un ítem"
          : "";

  const gridCols = isMobile
    ? "1fr 92px"
    : isRemito
      ? showPrices
        ? "minmax(320px,1.65fr) 140px 100px 122px 190px 124px 92px 34px"
        : "minmax(320px,1.65fr) 140px 100px 122px 190px 34px"
      : showPrices
        ? "minmax(220px,1.6fr) 112px 76px 96px 98px 78px 28px"
        : "minmax(220px,1.6fr) 112px 76px 96px 28px";
  const ubicadosCount = items.filter((item) => item.ubicacion).length;
  const ingresoDesktop = isRemito && !isMobile;
  const modalMaxWidth = ingresoDesktop ? 1580 : 1240;
  const modalHeight = ingresoDesktop ? "calc(100vh - 28px)" : undefined;
  const bodyPadding = isMobile ? 14 : ingresoDesktop ? 22 : 18;
  const bodyGap = ingresoDesktop ? 18 : 14;
  // Una fila mas cuando se ofrece el borrador, si no el cuerpo pierde la suya.
  const filasDelForm = borradorPrevio ? "auto auto minmax(0, 1fr) auto" : "auto minmax(0, 1fr) auto";
  const catalogListHeight = ingresoDesktop ? 278 : 184;
  const matchesListHeight = ingresoDesktop ? 318 : 224;

  return (
    <div
      onMouseDown={embedded ? undefined : (e) => { clickArrancoEnElFondo.current = e.target === e.currentTarget; }}
      onClick={embedded ? undefined : (e) => {
        const cerrar = clickArrancoEnElFondo.current && e.target === e.currentTarget;
        clickArrancoEnElFondo.current = false;
        if (!cerrar) return;
        // Un click al costado no puede llevarse veinte minutos de carga sin
        // preguntar. Queda guardado igual, pero hay que decirlo: si no, se
        // cierra la pantalla y uno lo da por perdido.
        if (draftHasContent({ titulo, observaciones, items })) {
          const ok = window.confirm(
            "¿Cerrar sin enviar?\n\nLo cargado queda guardado como borrador y te lo va a ofrecer cuando vuelvas a abrir esta pantalla.\n\n¿Cerrar igual?",
          );
          if (!ok) return;
        }
        closeModal(false);
      }}
      style={embedded
        ? { height: "100%", minHeight: 0, display: "grid", justifyItems: "center", fontFamily: C.sans }
        : { position: "fixed", inset: 0, zIndex: 9999, background: "var(--overlay-strong)", backdropFilter: "blur(6px)", display: "grid", placeItems: isMobile ? "end center" : "center", padding: isMobile ? 0 : ingresoDesktop ? 14 : 20, fontFamily: C.sans }}
    >
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          // Enter en cualquier input mandaba el ingreso entero. Cargando 40
          // renglones a mano, un Enter de mas guardaba un aviso de 1 item y no
          // habia forma de volver atras: quedaba creado y habia que empezar de
          // nuevo. Solo guarda el boton Guardar.
          if (e.key !== "Enter" || e.shiftKey) return;
          const tag = e.target?.tagName;
          if (tag === "TEXTAREA" || tag === "BUTTON") return;
          e.preventDefault();
        }}
        style={embedded
        ? { background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 12, width: "100%", maxWidth: isMobile ? "100%" : modalMaxWidth, height: "100%", maxHeight: "100%", overflow: "hidden", display: "grid", gridTemplateRows: filasDelForm, color: C.t0 }
        : { background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: isMobile ? "14px 14px 0 0" : 16, width: "100%", maxWidth: isMobile ? "100%" : modalMaxWidth, height: isMobile ? "96vh" : modalHeight, maxHeight: isMobile ? "96vh" : "calc(100vh - 28px)", overflow: "hidden", display: "grid", gridTemplateRows: filasDelForm, color: C.t0, boxShadow: "0 24px 80px rgba(15,23,42,0.24)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: ingresoDesktop ? "18px 22px" : "16px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{isRemito ? "Ingresar materiales" : "Enviar a Pañol"}</div>
          {prefill?.origen === "compra" && <span style={{ fontSize: 9, color: C.dim, background: "var(--panel-2)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>desde compra</span>}
          {isRemito && (
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginLeft: 4 }}>
              <span style={{ border: `1px solid ${C.b0}`, background: C.bg, color: C.t1, borderRadius: 999, padding: "5px 10px", fontSize: 11.5, fontWeight: 850 }}>{items.length} item{items.length === 1 ? "" : "s"}</span>
              <span style={{ border: `1px solid ${ubicadosCount === items.length && items.length ? C.greenB : C.b0}`, background: ubicadosCount === items.length && items.length ? C.greenL : C.bg, color: ubicadosCount === items.length && items.length ? C.green : C.t2, borderRadius: 999, padding: "5px 10px", fontSize: 11.5, fontWeight: 850 }}>{ubicadosCount}/{items.length || 0} ubicados</span>
            </div>
          )}
          <div style={{ flex: 1 }} />
          {!embedded && <button type="button" onClick={() => closeModal(false)} style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 18, padding: 4 }}>x</button>}
        </div>

        {borradorPrevio && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", background: "var(--blue-soft)", borderBottom: `1px solid ${C.blueB}`, flexWrap: "wrap" }}>
            <RotateCcw size={15} style={{ color: C.blue, flexShrink: 0 }} />
            <span style={{ color: C.t1, fontSize: 12.5, fontWeight: 750, minWidth: 0 }}>
              Quedó algo a medio cargar:{" "}
              <strong style={{ color: C.t0 }}>{borradorPrevio.titulo?.trim() || "sin referencia"}</strong>
              {" · "}{Array.isArray(borradorPrevio.items) ? borradorPrevio.items.length : 0} ítem
              {(Array.isArray(borradorPrevio.items) ? borradorPrevio.items.length : 0) === 1 ? "" : "s"}
            </span>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={retomarBorrador}
              style={{ border: "none", background: C.blue, color: "#fff", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontSize: 12, fontWeight: 900, fontFamily: C.sans, whiteSpace: "nowrap" }}>
              Retomar
            </button>
            <button type="button"
              onClick={() => {
                // A la papelera, no al vacío: descartar de más no puede costar la carga.
                borrarIngresoPendiente(borradorPrevio.id);
                setBorradorPrevio(null);
                toast.success("Borrador a la papelera. Está en Pañol → Ingresar si lo necesitás.");
              }}
              style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.dim, borderRadius: 8, padding: "7px 11px", cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: C.sans, whiteSpace: "nowrap" }}>
              Descartar
            </button>
          </div>
        )}

        <div style={{ overflowY: "auto", padding: bodyPadding, display: "grid", gap: bodyGap, minHeight: 0 }}>
          <div>
            <span style={lbl}>{isRemito ? "Referencia / proveedor" : "Título"}</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={isRemito ? 'Ej: "Materiales electricidad K37"' : 'Ej: "Sanitarios K52-25"'} required style={inp()} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            <div>
              <span style={lbl}>Sede destino{!sede && !sedeLocked ? " · elegí una" : ""}</span>
              <div style={{ display: "flex", gap: 6 }}>
                {sedesDisponibles.map((s) => {
                  const active = sede === s;
                  const label = s === "Chubut" ? "Chubut 2120" : s === "Pampa" ? "Pampa 1050" : s;
                  return (
                    <button key={s} type="button" onClick={() => setSede(s)} style={{ flex: 1, padding: "11px 10px", borderRadius: 9, cursor: "pointer", fontSize: 13.5, fontWeight: 850, fontFamily: C.sans, border: `1.5px solid ${active ? C.primary : C.b0}`, background: active ? "rgba(96,165,250,0.14)" : "transparent", color: active ? C.primary : C.t1 }}>{label}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <span style={lbl}>{isRemito ? "Obra por defecto" : "Obra (opcional)"}</span>
              <select value={obraId} onChange={(e) => setObraId(e.target.value)} style={inp({ background: C.panelSolid, cursor: "pointer" })}>
                <option value="">- Sin obra -</option>
                {obrasActivas.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}
              </select>

              {/* Varias obras en un mismo aviso: la compra llega en una caja y se
                  reparte. Se eligen acá una vez y cada renglón después sólo pide
                  cuánto va a cada una. */}
              {obraId && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                  {obrasExtra.map((id) => {
                    const obra = obrasActivas.find((o) => o.id === id);
                    return (
                      <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.blueB}`, background: "var(--blue-soft)", color: C.primary, borderRadius: 999, padding: "3px 6px 3px 10px", fontSize: 12, fontWeight: 850 }}>
                        {obra?.codigo || "obra"}
                        <button type="button" onClick={() => quitarObraExtra(id)} title="Quitar del aviso"
                          style={{ border: "none", background: "transparent", color: C.primary, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}>×</button>
                      </span>
                    );
                  })}
                  <select value="" onChange={(e) => agregarObraExtra(e.target.value)}
                    style={inp({ background: C.panelSolid, cursor: "pointer", width: "auto", padding: "5px 8px", fontSize: 12 })}>
                    <option value="">+ Sumar otra obra</option>
                    {obrasActivas
                      .filter((o) => o.id !== obraId && !obrasExtra.includes(o.id))
                      .map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}
                  </select>
                </div>
              )}
              {obrasDelAviso.length > 1 && (
                <div style={{ color: C.t2, fontSize: 11, marginTop: 5, lineHeight: 1.35 }}>
                  Aviso para {obrasDelAviso.length} obras. En cada renglón poné cuánto va a cada una.
                </div>
              )}
            </div>
          </div>

          <div style={{ border: `1px solid ${C.b0}`, background: "var(--panel)", borderRadius: 14, padding: ingresoDesktop ? 16 : 12, display: "grid", gap: ingresoDesktop ? 14 : 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PackageSearch size={16} style={{ color: C.blue }} />
                <span style={{ color: C.t0, fontSize: ingresoDesktop ? 14.5 : 13, fontWeight: 900 }}>Buscar material y pedidos a recepcionar</span>
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${C.b0}`, background: C.bg, color: aiReading ? C.dim : C.violet, borderRadius: 8, padding: ingresoDesktop ? "9px 12px" : "7px 10px", cursor: aiReading ? "default" : "pointer", fontSize: ingresoDesktop ? 12.5 : 12, fontWeight: 850 }}>
                <Bot size={14} />
                {aiReading ? "Leyendo..." : "Leer remito"}
                <input
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  disabled={aiReading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    readRemitoWithAI({ file });
                  }}
                  style={{ display: "none" }}
                />
              </label>
              {/* Muchos pedidos llegan por mail o WhatsApp: si el texto ya se
                  puede copiar, sacarle una foto para que la IA lo lea es dar una
                  vuelta al pedo. */}
              <button type="button" onClick={() => setPegarAbierto((v) => !v)} disabled={aiReading}
                title="Pegar el texto de un mail, un WhatsApp o una lista y que la IA lo lea"
                style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${pegarAbierto ? C.violetB : C.b0}`, background: pegarAbierto ? "var(--violet-soft, rgba(139,92,246,0.12))" : C.bg, color: aiReading ? C.dim : C.violet, borderRadius: 8, padding: ingresoDesktop ? "9px 12px" : "7px 10px", cursor: aiReading ? "default" : "pointer", fontSize: ingresoDesktop ? 12.5 : 12, fontWeight: 850, fontFamily: C.sans }}>
                <ClipboardPaste size={14} />
                Pegar texto
              </button>
            </div>

            {pegarAbierto && (
              <div style={{ display: "grid", gap: 8 }}>
                <textarea
                  value={textoIa}
                  onChange={(e) => setTextoIa(e.target.value)}
                  disabled={aiReading}
                  rows={6}
                  placeholder={"Pegá acá el pedido como venga:\n\n2 chapas inox 1.5mm\n10 mts cable 2x2.5\n1 bomba de achique Rule 800\n\nO el texto de un mail o un WhatsApp, tal cual."}
                  style={inp({ padding: "10px 12px", fontSize: 13, resize: "vertical", minHeight: 118, fontFamily: C.sans, lineHeight: 1.5 })}
                />
                <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => readRemitoWithAI({ text: textoIa })} disabled={aiReading || !textoIa.trim()}
                    style={{ border: "none", background: aiReading || !textoIa.trim() ? "var(--panel-2)" : C.violet, color: aiReading || !textoIa.trim() ? C.dim : "#fff", borderRadius: 8, padding: "9px 15px", cursor: aiReading || !textoIa.trim() ? "default" : "pointer", fontSize: 12.5, fontWeight: 900, fontFamily: C.sans }}>
                    {aiReading ? "Leyendo…" : "Leer el texto"}
                  </button>
                  {textoIa.trim() && !aiReading && (
                    <button type="button" onClick={() => setTextoIa("")}
                      style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: C.sans, textDecoration: "underline" }}>
                      Limpiar
                    </button>
                  )}
                  <span style={{ color: C.t2, fontSize: 11.5 }}>
                    Los ítems se agregan abajo; el catálogo se vincula solo cuando encuentra el producto.
                  </span>
                </div>
              </div>
            )}

            {/* "Leer remito" está disponible en todos los modos, pero fuera del modo
                remito lo que se guarda es un AVISO: los ítems quedan con
                recepcion_estado null y NO son stock hasta que Pañol los reciba.
                Sin este cartel uno carga 20 ítems de un remito real, guarda, y
                después el egreso falla con "Disponible 0" sin explicación. */}
            {!isRemito && items.length > 0 && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 10px", border: `1px solid ${C.cyanB}`, background: C.cyanL, borderRadius: 9, color: C.t1, fontSize: 12, fontWeight: 700 }}>
                <PackageSearch size={14} style={{ color: C.cyan, flexShrink: 0, marginTop: 1 }} />
                <span>
                  Esto crea un <strong>aviso a Pañol</strong>, no ingresa stock: los ítems no se pueden egresar
                  hasta que Pañol los marque recibidos en Recepción. Si el material <strong>ya está físicamente
                  en el pañol</strong>, cargalo desde <strong>Pañol → Ingresar</strong>.
                </span>
              </div>
            )}

            {isRemito && (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) auto", gap: 10, padding: ingresoDesktop ? "11px 12px" : "9px 10px", border: `1px solid ${C.b0}`, borderRadius: 10, background: C.bg }}>
                <div>
                  <span style={{ ...lbl, marginBottom: 5 }}>Proveedor del remito</span>
                  <select value={aiProveedorId} onChange={(e) => setAiProveedorId(e.target.value)} style={inp({ background: C.panelSolid, cursor: "pointer", height: ingresoDesktop ? 40 : 36 })}>
                    <option value="">Detectar en el documento</option>
                    {proveedores.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <span style={{ ...lbl, marginBottom: 5 }}>Moneda</span>
                  <div style={{ display: "flex", gap: 5 }}>
                    {[['', 'Detectar'], ['ARS', 'ARS'], ['USD', 'USD']].map(([value, label]) => {
                      const active = aiMoneda === value;
                      const isUsd = value === 'USD';
                      return <button key={value || 'auto'} type="button" onClick={() => setAiMoneda(value)} style={{ border: `1px solid ${active ? (isUsd ? C.blueB : C.greenB) : C.b0}`, background: active ? (isUsd ? C.blueL : value === 'ARS' ? C.greenL : C.panelSolid) : C.panelSolid, color: active ? (isUsd ? C.blue : value === 'ARS' ? C.green : C.t1) : C.t2, borderRadius: 7, minWidth: label === 'Detectar' ? 76 : 52, height: ingresoDesktop ? 40 : 36, padding: "0 9px", cursor: "pointer", fontSize: 11.5, fontWeight: 850, fontFamily: C.sans }}>{label}</button>;
                    })}
                  </div>
                </div>
              </div>
            )}

            {aiSummary && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", border: `1px solid ${aiSummary.linkedPercent >= 70 ? C.greenB : C.violetB}`, background: aiSummary.linkedPercent >= 70 ? C.greenL : C.violetL, borderRadius: 9, color: C.t1, fontSize: 12, fontWeight: 750 }}>
                <Bot size={14} style={{ color: aiSummary.linkedPercent >= 70 ? C.green : C.violet, flexShrink: 0 }} />
                <span>
                  IA leyó <strong>{aiSummary.detected}</strong> ítems.
                  {" "}<strong>{aiSummary.linked}</strong> vinculados solos
                  {aiSummary.conSugerencia > 0 ? <>, <strong>{aiSummary.conSugerencia}</strong> con coincidencias para elegir abajo</> : null}
                  {aiSummary.nuevos > 0 ? <>, <strong>{aiSummary.nuevos}</strong> sin nada parecido en el catálogo (se crean al guardar)</> : null}.
                  {aiSummary.currencies?.ARS ? <> {" "}<strong>ARS {aiSummary.currencies.ARS}</strong></> : null}{aiSummary.currencies?.ARS && aiSummary.currencies?.USD ? " · " : null}{aiSummary.currencies?.USD ? <><strong>USD {aiSummary.currencies.USD}</strong></> : null}
                </span>
              </div>
            )}

            {isRemito && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                  <ScanLine size={16} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.green }} />
                  <input
                    ref={scanInputRef}
                    value={scanCode}
                    onChange={(e) => setScanCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); processScan(scanCode); } }}
                    placeholder="Escaneá el código — recepciona del pedido; si no hay, ingreso directo"
                    style={inp({ paddingLeft: 38, height: ingresoDesktop ? 44 : 38, fontSize: ingresoDesktop ? 14 : 13, border: `1.5px solid ${C.greenB}`, background: C.bg, fontWeight: 700 })}
                  />
                </div>
                <button type="button" onClick={() => setScannerOpen(true)} title="Escanear con la cámara"
                  style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 9, padding: ingresoDesktop ? "0 16px" : "0 12px", height: ingresoDesktop ? 44 : 38, cursor: "pointer", fontSize: 13, fontWeight: 850, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", flexShrink: 0 }}>
                  <ScanLine size={16} /> {!isMobile && "Cámara"}
                </button>
              </div>
            )}

            <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.b0}`, marginTop: 2 }}>
              {[["materiales", "Materiales"], ["avisos", `Avisos de recepción${avisosAgrupados.length ? ` (${avisosAgrupados.length})` : ""}`]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setSearchTab(k)} style={{ border: "none", background: "transparent", color: searchTab === k ? C.blue : C.t2, borderBottom: `2px solid ${searchTab === k ? C.blue : "transparent"}`, padding: "8px 12px", cursor: "pointer", fontSize: 13, fontWeight: 850, fontFamily: C.sans, marginBottom: -1 }}>{l}</button>
              ))}
            </div>

            {searchTab === "materiales" ? (
              <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.t2 }} />
                  <input
                    value={catalogQ}
                    onChange={(e) => setCatalogQ(e.target.value)}
                    placeholder="Buscar material para recepcionar"
                    style={inp({ paddingLeft: 36, background: C.bg, height: ingresoDesktop ? 42 : 36, fontSize: ingresoDesktop ? 13.5 : 13 })}
                  />
                </div>
                <div style={{ display: "grid", gap: 7, maxHeight: catalogListHeight, overflowY: "auto", paddingRight: 2 }}>
                  {catalogLoading ? (
                    <div style={{ color: C.t2, fontSize: 12, padding: 12, textAlign: "center" }}>Cargando...</div>
                  ) : catalog.length ? catalog.map((mat) => {
                    const checked = checkedCatalog.has(mat.id);
                    const meta = proveedorMeta(mat.proveedor, proveedores);
                    const barcode = materialBarcodeList(mat)[0]?.codigo || "";
                    // ¿Este producto está esperando en algún aviso de recepción?
                    const enAvisos = (avisosPorMaterial.get(mat.id) || EMPTY_ARR).filter((m) => !avisoItemAdded(m));
                    const obrasAviso = [...new Set(enAvisos.map((m) => m.obra_codigo).filter(Boolean))];
                    return (
                      <button
                        key={mat.id}
                        type="button"
                        onClick={() => { toggleCheckedCatalog(mat); setSelectedMaterial(mat); }}
                        style={{
                          border: `1px solid ${checked ? C.blueB : C.b0}`,
                          background: checked ? "var(--blue-soft)" : C.bg,
                          color: C.t0,
                          borderRadius: 9,
                          padding: ingresoDesktop ? "10px 11px" : "8px 9px",
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: C.sans,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <span aria-hidden style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${checked ? C.blue : C.b1}`, background: checked ? C.blue : "transparent", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 900, lineHeight: 1 }}>
                          {checked ? "✓" : ""}
                        </span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: "block", fontSize: ingresoDesktop ? 13.3 : 12.5, fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mat.descripcion}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, color: C.t2, fontSize: ingresoDesktop ? 11.2 : 10.5, marginTop: 3 }}>
                            <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {mat.codigo || "sin cod. item"}{barcode ? ` · CB ${barcode}` : ""}{mat.proveedor ? ` · ${mat.proveedor}` : ""}
                            </span>
                            <ProveedorTipoBadge meta={meta} compact />
                            <UbicacionChip ubicacion={mat.ubicacion} obs={mat.ubicacion_obs} />
                            <StockActualBadge material={mat} stockByMaterial={stockByMaterial} sede={sede} compact />
                            {enAvisos.length > 0 && (
                              <span
                                title={`Esperando en ${enAvisos.length} ítem${enAvisos.length === 1 ? "" : "s"} de aviso · ${obrasAviso.join(", ")}`}
                                style={{ border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, borderRadius: 999, padding: "3px 7px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap", flexShrink: 0 }}
                              >
                                En aviso{obrasAviso.length === 1 ? ` · ${obrasAviso[0]}` : ` · ${enAvisos.length}`}
                              </span>
                            )}
                            {catalogQ.trim() && mat._score >= 88 && (
                              <span style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 999, padding: "3px 7px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" }}>
                                Coincidencia
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  }) : (
                    <div style={{ color: C.t2, fontSize: 12, padding: 12, textAlign: "center", border: `1px dashed ${C.b0}`, borderRadius: 8 }}>Sin resultados</div>
                  )}
                </div>
                {/* El producto que buscaste/escaneaste, y en qué aviso está esperando.
                    Se puede recepcionar directo desde acá sin ir a la pestaña de avisos. */}
                {avisosDelFocoPendientes.length > 0 && (
                  <div style={{ border: `1px solid ${C.violetB}`, background: C.violetL, borderRadius: 10, padding: 9, display: "grid", gap: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.violet, fontSize: 11.5, fontWeight: 900 }}>
                      <PackageSearch size={14} style={{ flexShrink: 0 }} />
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {(selectedMaterial?.descripcion || catalogById.get(focusMaterialId)?.descripcion || "Este producto")} está en {avisosDelFocoPendientes.length} aviso{avisosDelFocoPendientes.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {avisosDelFocoPendientes.map((m) => (
                      <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", background: "var(--panel)", border: `1px solid ${C.b0}`, borderRadius: 8, padding: "7px 9px" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: C.t0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.obra_codigo}{m.es_adicional ? " · adicional" : ""}</div>
                          <div style={{ fontSize: 10.5, color: C.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.request_title}</div>
                        </div>
                        <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.t1, whiteSpace: "nowrap" }}>{m.quantity || "-"} {m.unit || ""}</div>
                        <button type="button" onClick={() => agregarPedidoItem(m)} style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 7, padding: "5px 11px", cursor: "pointer", fontSize: 11.5, fontWeight: 850, fontFamily: C.sans, whiteSpace: "nowrap" }}>
                          Recepcionar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addCheckedCatalogMaterials}
                  disabled={checkedCatalog.size === 0 && !selectedMaterial}
                  style={{ border: `1px solid ${C.blueB}`, background: (checkedCatalog.size || selectedMaterial) ? "var(--blue-soft)" : C.bg, color: (checkedCatalog.size || selectedMaterial) ? C.blue : C.t2, borderRadius: 8, padding: ingresoDesktop ? "10px 12px" : "8px 10px", cursor: (checkedCatalog.size || selectedMaterial) ? "pointer" : "default", fontSize: ingresoDesktop ? 12.5 : 12, fontWeight: 850, fontFamily: C.sans }}
                >
                  {checkedCatalog.size ? `Agregar ${checkedCatalog.size} tildado${checkedCatalog.size === 1 ? "" : "s"}` : "Agregar desde catalogo"}
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.t2 }} />
                  <input
                    value={avisoQ}
                    onChange={(e) => setAvisoQ(e.target.value)}
                    placeholder="Buscar en los avisos: producto, código, obra o pedido"
                    style={inp({ paddingLeft: 36, background: C.bg, height: ingresoDesktop ? 42 : 36, fontSize: ingresoDesktop ? 13.5 : 13 })}
                  />
                </div>
                <div style={{ display: "grid", gap: 8, minWidth: 0, maxHeight: matchesListHeight, overflowY: "auto", paddingRight: 2 }}>
                {avisosLoading ? (
                  <div style={{ color: C.t2, fontSize: 12, padding: 18, textAlign: "center" }}>Cargando avisos...</div>
                ) : avisosVisibles.length ? avisosVisibles.map((av) => {
                  const abierto = expandedAviso === av.key;
                  const pendientes = av.items.filter((m) => !avisoItemAdded(m));
                  const agregados = av.items.length - pendientes.length;
                  // Si el producto escaneado/buscado está en este aviso, se marca el grupo
                  // para que no haya que abrir uno por uno buscando dónde cae.
                  const tieneFoco = Boolean(focusMaterialId) && av.items.some((m) => (m.material_id || m.requisito_material_id) === focusMaterialId);
                  const completo = pendientes.length === 0;
                  return (
                    <div key={av.key} style={{ border: `1px solid ${tieneFoco ? C.violetB : abierto ? C.blueB : C.b0}`, borderLeft: `3px solid ${completo ? C.green : tieneFoco ? C.violet : C.blueB}`, borderRadius: 10, background: tieneFoco ? C.violetL : C.bg }}>
                      <div role="button" tabIndex={0} onClick={() => setExpandedAviso(abierto ? null : av.key)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 11px", cursor: "pointer" }}>
                        <span style={{ color: C.t2, fontSize: 12, width: 12, flexShrink: 0 }}>{abierto ? "▾" : "▸"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <span style={{ fontSize: ingresoDesktop ? 13.4 : 12.6, fontWeight: 900, color: C.t0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{av.obra_codigo || "Sin obra"}</span>
                            {tieneFoco && <span style={{ border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap", flexShrink: 0 }}>Acá está</span>}
                          </div>
                          <div style={{ fontSize: 11.5, color: C.t1, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {av.request_title || "Pedido sin título"}{av.linea_nombre ? ` · ${av.linea_nombre}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {completo
                            ? <span style={{ color: C.green, fontSize: 11.5, fontWeight: 900 }}>✓ completo</span>
                            : <span style={{ border: `1px solid ${C.b0}`, background: "var(--panel)", color: C.t1, borderRadius: 999, padding: "3px 8px", fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap" }}>
                                {pendientes.length} por recibir{agregados ? ` · ${agregados} ✓` : ""}
                              </span>}
                        </div>
                      </div>
                      {abierto && (
                        <div style={{ display: "grid", gap: 6, padding: "0 10px 10px" }}>
                          {av.items.map((m) => {
                            const added = avisoItemAdded(m);
                            const prod = productoDeAviso(m);
                            const esFoco = Boolean(focusMaterialId) && (m.material_id || m.requisito_material_id) === focusMaterialId;
                            const barcode = prod ? materialBarcodeList(prod)[0]?.codigo || "" : "";
                            return (
                              <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", padding: "8px 9px", border: `1px solid ${added ? C.greenB : esFoco ? C.violetB : C.b0}`, background: added ? C.greenL : esFoco ? C.violetL : "var(--panel)", borderRadius: 8 }}>
                                <div style={{ minWidth: 0 }}>
                                  {/* El producto del catálogo primero: es lo que el pañolero
                                      tiene en la mano. El texto del pedido queda de referencia. */}
                                  <div style={{ fontSize: 12.8, fontWeight: 850, color: C.t0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {prod?.descripcion || m.description || "Ítem sin descripción"}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, marginTop: 3, fontSize: 10.8, color: C.t2 }}>
                                    {prod ? (
                                      <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {prod.codigo || "sin cod. item"}{barcode ? ` · CB ${barcode}` : ""}
                                      </span>
                                    ) : (
                                      <span style={{ border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap", flexShrink: 0 }}>
                                        Sin producto vinculado
                                      </span>
                                    )}
                                    {prod && <UbicacionChip ubicacion={prod.ubicacion} obs={prod.ubicacion_obs} />}
                                    {/* La obra del renglón, sólo cuando el aviso va a
                                        varias: si no, repetiría la del encabezado en
                                        cada línea sin aportar nada. Sin esto no se
                                        puede decidir cuál recibir si llega una sola. */}
                                    {av.obras_codigos?.length > 1 && m.obra_codigo && (
                                      <span style={{ border: `1px solid ${C.blueB}`, background: "var(--blue-soft)", color: C.primary, borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap", flexShrink: 0 }}>
                                        {m.obra_codigo}
                                      </span>
                                    )}
                                    {m.es_adicional && <span style={{ color: C.violet, fontWeight: 850, whiteSpace: "nowrap", flexShrink: 0 }}>adicional</span>}
                                    {m.variante && <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>· {m.variante}</span>}
                                  </div>
                                  {prod && m.description && prod.descripcion !== m.description && (
                                    <div style={{ fontSize: 10.5, color: C.t2, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      Pedido: {m.description}
                                    </div>
                                  )}
                                </div>
                                <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.t1, whiteSpace: "nowrap" }}>{m.quantity || "-"} {m.unit || ""}</div>
                                {added
                                  ? <span style={{ color: C.green, fontSize: 13, fontWeight: 900, padding: "0 4px" }}>✓</span>
                                  : <button type="button" onClick={() => agregarPedidoItem(m)} style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 7, padding: "5px 11px", cursor: "pointer", fontSize: 11.5, fontWeight: 850, fontFamily: C.sans, whiteSpace: "nowrap" }}>Recibir</button>}
                              </div>
                            );
                          })}
                          <button type="button" onClick={() => pendientes.forEach(agregarPedidoItem)} disabled={pendientes.length === 0} style={{ justifySelf: "start", border: `1px solid ${C.greenB}`, background: pendientes.length ? C.greenL : C.bg, color: pendientes.length ? C.green : C.t2, borderRadius: 7, padding: "6px 12px", cursor: pendientes.length ? "pointer" : "default", fontSize: 12, fontWeight: 850, fontFamily: C.sans }}>Recibir todos los pendientes ({pendientes.length})</button>
                        </div>
                      )}
                    </div>
                  );
                }) : (
                  <div style={{ color: C.t2, fontSize: 12, padding: 18, textAlign: "center", border: `1px dashed ${C.b0}`, borderRadius: 8 }}>
                    {avisoQ.trim()
                      ? "Ningún aviso coincide con esa búsqueda."
                      : obraId
                        ? "No hay avisos de recepción para la obra seleccionada."
                        : "No hay avisos de recepción abiertos. Escaneá el producto o cargalo como ingreso directo."}
                  </div>
                )}
                </div>
              </div>
            )}
          </div>

          <div
            ref={itemsSectionRef}
            style={isRemito ? { border: `1px solid ${C.b0}`, background: "rgba(96,165,250,0.035)", borderRadius: 14, padding: ingresoDesktop ? 16 : 10, display: "grid", gap: 10 } : undefined}
          >
            {duplicadosConAvisos.length > 0 && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 10px", border: `1px solid ${C.violetB}`, background: C.violetL, borderRadius: 9, color: C.t1, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                <PackageSearch size={14} style={{ color: C.violet, flexShrink: 0, marginTop: 1 }} />
                <span style={{ minWidth: 0 }}>
                  {duplicadosConAvisos.length === 1 ? "Este producto ya está" : `Estos ${duplicadosConAvisos.length} productos ya están`}{" "}
                  esperando en un aviso de esta obra:{" "}
                  <strong>{duplicadosConAvisos.slice(0, 4).map((it) => it.descripcion).join(" · ")}</strong>
                  {duplicadosConAvisos.length > 4 && ` y ${duplicadosConAvisos.length - 4} más`}.{" "}
                  <button type="button" onClick={() => { setSearchTab("avisos"); }}
                    style={{ border: "none", background: "transparent", color: C.violet, cursor: "pointer", fontSize: 12, fontWeight: 900, fontFamily: C.sans, textDecoration: "underline", padding: 0 }}>
                    Marcalos ahí
                  </button>{" "}
                  en vez de cargarlos de nuevo, o entran dos veces al stock.
                </span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <div>
                <span style={{ ...lbl, marginBottom: 3, fontSize: ingresoDesktop ? 11 : lbl.fontSize }}>Productos a ingresar</span>
                <div style={{ color: C.t2, fontSize: ingresoDesktop ? 12.5 : 11.5 }}>
                  {isCompraNotice
                    ? "Confirmá el producto real del catálogo antes de avisar a pañol."
                    : isObraNotice
                      ? "Confirmá qué producto real del catálogo va a llevar esta obra."
                      : "Vincula cada producto al catalogo y asignale estanteria. La ubicacion queda recordada para proximos ingresos."}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ border: `1px solid ${C.b0}`, background: C.bg, color: C.t1, borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 850 }}>{items.length} item{items.length === 1 ? "" : "s"}</span>
                {isRemito && <span style={{ border: `1px solid ${ubicadosCount === items.length && items.length ? C.greenB : C.b0}`, background: ubicadosCount === items.length && items.length ? C.greenL : C.bg, color: ubicadosCount === items.length && items.length ? C.green : C.t2, borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 850 }}>{ubicadosCount}/{items.length || 0} ubicados</span>}
              </div>
            </div>
            {items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                {!isMobile && (
                  <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, padding: "0 10px", fontSize: 9.5, color: C.t2, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 800 }}>
                    <span>Descripción</span><span>Cod. item</span><span>Cant.</span><span>Unidad</span>{isRemito && <span>Obra / stock</span>}{showPrices && <><span>Precio unit.</span><span>Moneda</span></>}<span />
                  </div>
                )}
                {items.map((it, i) => {
                  const linkedCandidate = fullCatalog.find((material) => material.id === it.material_id) || null;
                  const linkedMaterial = linkedCandidate?.es_requisito === true ? null : linkedCandidate;
                  const itemSpecs = productSpecEntries(it.especificaciones);
                  return (
                  <div key={`${it.panol_envio_item_id || it.purchase_request_item_id || it.material_id || "manual"}-${i}`} style={{ background: "var(--panel)", border: `1px solid ${scanFlashMat && it.material_id === scanFlashMat ? C.greenB : C.b0}`, borderRadius: 10, overflow: "hidden", transition: "border-color .25s, box-shadow .25s", boxShadow: scanFlashMat && it.material_id === scanFlashMat ? `0 0 0 2px ${C.greenL}` : "none" }}>
                    <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, alignItems: "center", padding: "10px" }}>
                    <input value={it.descripcion} onChange={(e) => updateItem(i, { descripcion: e.target.value, material_id: "", variante: "" })} placeholder="Descripción" style={inp({ padding: "8px 10px", fontSize: 13, gridColumn: isMobile ? "1 / -1" : undefined })} />
                    <input value={it.codigo || ""} onChange={(e) => updateItem(i, { codigo: e.target.value.toUpperCase(), material_id: "", variante: "" })} placeholder="Cod. item" title="Codigo interno/proveedor. El codigo de barras se toma del material vinculado." style={inp({ padding: "8px 10px", fontSize: 13, fontFamily: C.mono })} />
                    <input value={it.cantidad || ""} onChange={(e) => updateItem(i, { cantidad: e.target.value })} placeholder="Cant." style={inp({ padding: "8px 10px", fontSize: 13 })} />
                    <select value={it.unidad || "unidad"} onChange={(e) => updateItem(i, { unidad: e.target.value, unidad_touched: true })} style={inp({ padding: "8px 10px", fontSize: 13, background: C.panelSolid })}>
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    {isRemito && (
                      <select value={it.obra_id || obraId || ""} onChange={(e) => updateItem(i, { obra_id: e.target.value })} style={inp({ padding: "8px 10px", fontSize: 13, background: C.panelSolid })}>
                        <option value="">Stock general</option>
                        {obrasActivas.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}
                      </select>
                    )}
                    {showPrices && (
                      <>
                        <input value={it.precio_unitario || ""} onChange={(e) => updateItem(i, { precio_unitario: e.target.value })} placeholder="$ unit." style={inp({ padding: "8px 10px", fontSize: 13 })} />
                        <select value={it.moneda || "ARS"} onChange={(e) => updateItem(i, { moneda: e.target.value })} style={inp({ padding: "8px 10px", fontSize: 13, background: C.panelSolid })}>
                          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </>
                    )}
                    <button type="button" onClick={() => removeItem(i)} title="Quitar" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4, fontSize: 14 }}>x</button>
                    </div>
                    {needsCatalogLink && (
                      <CatalogLinkRow
                        item={it}
                        catalog={fullCatalog}
                        proveedores={proveedores}
                        stockByMaterial={stockByMaterial}
                        sede={sede}
                        creating={creatingCatalogIndex === i}
                        onLink={(material) => linkCatalogMaterial(i, material)}
                        onClear={() => updateItem(i, { material_id: "", variante: "" })}
                        onCreate={isRemito ? undefined : () => createCatalogMaterialForItem(i)}
                      />
                    )}
                    {isRemito && (
                      <ItemLocationRow
                        item={it}
                        material={linkedMaterial}
                        estanterias={estanterias}
                        isMobile={isMobile}
                        onChange={(patch) => updateItem(i, patch)}
                      />
                    )}
                    {/* El reparto existia solo en el ingreso de remito. En el aviso
                        a Panol no aparecia, y por eso una compra para cuatro obras
                        obligaba a cargar cuatro avisos iguales. La imputacion es
                        por item, asi que un aviso puede llevar material de varias
                        obras sin problema. */}
                    {!it.purchase_request_item_id && !it.panol_envio_item_id && !it.obra_snapshot_item_id && (
                      <ItemObrasRow item={it} obras={obrasActivas} multiObra={obrasDelAviso.length > 1} onChange={(patch) => updateItem(i, patch)} />
                    )}
                    {it.proveedor && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 7px 7px", color: C.t2, fontSize: 11, fontWeight: 750, minWidth: 0 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Proveedor: {it.proveedor}</span>
                        <ProveedorTipoBadge meta={proveedorMeta(it.proveedor, proveedores)} compact />
                      </div>
                    )}
                    {itemSpecs.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", padding: "0 7px 8px" }}>
                        {itemSpecs.map((specification) => (
                          <span key={specification.key} style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 999, padding: "2px 7px", fontSize: 9.5, fontWeight: 800 }}>
                            {specification.label}: {specification.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            <div style={{ border: `1px dashed ${C.border2 ?? C.b1}`, borderRadius: 11, padding: ingresoDesktop ? 14 : 10, background: "rgba(96,165,250,0.04)", display: "grid", gap: ingresoDesktop ? 10 : 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : showPrices ? "minmax(260px,1fr) 130px 96px 120px 116px 88px" : "minmax(260px,1fr) 130px 96px 120px", gap: ingresoDesktop ? 8 : 6 }}>
                <input value={nDesc} onChange={(e) => setNDesc(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} placeholder='Descripción o línea completa: "20 mtrs Antirruido"' style={inp({ padding: "9px 11px", fontSize: 13, gridColumn: isMobile ? "1 / -1" : undefined })} />
                <input value={nCode} onChange={(e) => setNCode(e.target.value.toUpperCase())} placeholder="Cod. item" title="Codigo interno/proveedor. Para codigo de barras, vinculalo al material del catalogo." style={inp({ padding: "9px 11px", fontSize: 13, fontFamily: C.mono })} />
                <input value={nCant} onChange={(e) => setNCant(e.target.value)} placeholder="Cant." style={inp({ padding: "9px 11px", fontSize: 13 })} />
                <select value={nUnit} onChange={(e) => setNUnit(e.target.value)} style={inp({ padding: "9px 11px", fontSize: 13, background: C.panelSolid })}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                {showPrices && (
                  <>
                    <input value={nPrice} onChange={(e) => setNPrice(e.target.value)} placeholder="Precio unit." style={inp({ padding: "9px 11px", fontSize: 13 })} />
                    <select value={nCurrency} onChange={(e) => setNCurrency(e.target.value)} style={inp({ padding: "9px 11px", fontSize: 13, background: C.panelSolid })}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={addItem} disabled={!nDesc.trim()} style={{ background: nDesc.trim() ? C.blue : "var(--panel-2)", color: nDesc.trim() ? "#fff" : C.dim, border: "none", borderRadius: 8, padding: "8px 14px", cursor: nDesc.trim() ? "pointer" : "default", fontSize: 12.5, fontWeight: 800, fontFamily: C.sans }}>+ Agregar ítem</button>
                <button type="button" onClick={() => setShowBulk((v) => !v)} style={{ background: "transparent", color: C.t2, border: `1px solid ${C.b0}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 12.5, fontFamily: C.sans }}>{showBulk ? "Cerrar lista" : "Pegar lista"}</button>
                <span style={{ color: C.t2, fontSize: 11.5 }}>Detecta cantidad, unidad y código final.</span>
              </div>
              {showBulk && (
                <div style={{ display: "grid", gap: 6 }}>
                  <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={7} placeholder={"Un ítem por línea. Texto libre o columnas separadas por |:\n\nDescripción | Código | Cant | Unidad | $Precio\nCODO MACHO HEMBRA 2 FUND | C1162FU | 2 | UNI | $39.372,46\nVALVULA ESFERICA 3/4 JULON | VAE3/4J | 2 | UNI | $6.552,45\n\n20 mtrs Antirruido\n1 INODORO Ovalado I14388"} style={inp({ resize: "vertical", fontFamily: C.mono, fontSize: 12 })} />
                  <button type="button" onClick={addBulk} style={{ justifySelf: "start", background: C.blue, color: "#fff", border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.sans }}>
                    Analizar y agregar {bulkText.split("\n").map((l) => l.trim()).filter(Boolean).length || ""} ítems
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <span style={lbl}>Observaciones (opcional)</span>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder="Notas para el pañolero" style={inp({ resize: "vertical", minHeight: ingresoDesktop ? 58 : 46, fontSize: ingresoDesktop ? 13 : 12 })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: isRemito ? "space-between" : "flex-end", padding: ingresoDesktop ? "14px 22px" : "12px 18px", borderTop: `1px solid ${C.border}`, background: "var(--panel)" }}>
          {isRemito && (
            <button
              type="button"
              disabled={saving || (!titulo.trim() && items.length === 0)}
              onClick={() => {
                const ok = persistDraftNow();
                if (ok) { toast.success("Guardado en pendientes."); onClose(false); }
                else toast.error("No se pudo guardar el pendiente.");
              }}
              style={{ border: `1px solid ${C.border}`, background: "var(--panel-2)", color: C.t1, borderRadius: 8, padding: ingresoDesktop ? "11px 18px" : "9px 16px", cursor: saving || (!titulo.trim() && items.length === 0) ? "default" : "pointer", opacity: saving || (!titulo.trim() && items.length === 0) ? 0.5 : 1, fontSize: ingresoDesktop ? 12.5 : 12, fontWeight: 800, fontFamily: C.sans }}
            >
              Guardar pendiente
            </button>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {faltaParaGuardar && (
            <span style={{ color: C.t2, fontSize: 11.5, fontWeight: 750, textAlign: "right" }}>{faltaParaGuardar}</span>
          )}
          <button type="button" onClick={() => closeModal(false)} style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.dim, borderRadius: 8, padding: ingresoDesktop ? "11px 18px" : "9px 16px", cursor: "pointer", fontSize: ingresoDesktop ? 12.5 : 12, fontWeight: 700, fontFamily: C.sans }}>Cancelar</button>
          <button type="submit" disabled={saving || !titulo.trim() || items.length === 0} style={{ border: "none", background: saving || !titulo.trim() || !items.length ? "var(--panel-2)" : C.blue, color: saving || !titulo.trim() || !items.length ? C.dim : "#fff", borderRadius: 8, padding: ingresoDesktop ? "11px 18px" : "9px 16px", cursor: saving || !titulo.trim() || !items.length ? "default" : "pointer", fontSize: ingresoDesktop ? 12.5 : 12, fontWeight: 850, fontFamily: C.sans }}>{saving ? "Guardando..." : isRemito ? "Ingresar a stock" : "Enviar a Pañol"}</button>
          </div>
        </div>
      </form>
      {scannerOpen && (
        <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={(code) => processScan(code)} />
      )}

      {scanChoice && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "var(--overlay-strong)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 16, fontFamily: C.sans }}
          onClick={(e) => { if (e.target === e.currentTarget) { setScanChoice(null); setTimeout(() => scanInputRef.current?.focus(), 40); } }}>
          <div style={{ background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 440, maxHeight: "80vh", overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", boxShadow: "0 24px 80px rgba(15,23,42,0.24)" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14.5, fontWeight: 900, color: C.t0 }}>¿A qué aviso asignás este producto?</div>
              <div style={{ fontSize: 12, color: C.t2, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{scanChoice.material.descripcion} · aparece en {new Set(scanChoice.options.map((o) => o.request_id)).size} avisos</div>
            </div>
            <div style={{ overflowY: "auto", padding: 12, display: "grid", gap: 8 }}>
              {scanChoice.options.map((op) => (
                <button key={op.id} type="button"
                  onClick={() => {
                    agregarPedidoItem(op);
                    setSearchTab("avisos");
                    setExpandedAviso(op.request_id || op.request_title || null);
                    flashMaterial(scanChoice.material.id);
                    toast.success(`Recepcionado del aviso · ${op.request_title || scanChoice.material.descripcion}`);
                    scanBeep(900, 80);
                    setScanChoice(null);
                    setTimeout(() => scanInputRef.current?.focus(), 40);
                  }}
                  style={{ border: `1px solid ${C.b0}`, background: C.bg, borderRadius: 10, padding: "11px 12px", cursor: "pointer", textAlign: "left", fontFamily: C.sans }}>
                  <div style={{ fontSize: 13.5, fontWeight: 850, color: C.t0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{op.obra_codigo}{op.linea_nombre ? ` · ${op.linea_nombre}` : ""}</div>
                  <div style={{ fontSize: 11.5, color: C.t2, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{op.request_title} · {op.quantity || "-"} {op.unit || ""}</div>
                </button>
              ))}
            </div>
            <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
              <button type="button"
                onClick={() => {
                  addCatalogMaterial(scanChoice.material);
                  flashMaterial(scanChoice.material.id);
                  toast.success(`Ingreso directo · ${scanChoice.material.descripcion}`);
                  scanBeep(760, 90);
                  setScanChoice(null);
                  setTimeout(() => scanInputRef.current?.focus(), 40);
                }}
                style={{ border: `1px solid ${C.b0}`, background: "var(--panel-2)", color: C.t1, borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 800, fontFamily: C.sans }}>
                Ingreso directo (sin aviso)
              </button>
              <button type="button" onClick={() => { setScanChoice(null); setTimeout(() => scanInputRef.current?.focus(), 40); }}
                style={{ border: "none", background: "transparent", color: C.dim, borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 750, fontFamily: C.sans }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
