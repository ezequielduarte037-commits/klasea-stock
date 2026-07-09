import { C } from "@/theme";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Link2, MapPin, PackageSearch, ScanLine, Search } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { crearEnvio, crearPanolCatalogMaterial, fetchPanolCatalogMini, fetchRecepcionAvisosAbiertos, fetchRecepcionPedidoMatches, guardarUbicacionMaterial, marcarItems, SEDES_PANOL } from "@/features/panol/panolApi";
import { fetchProveedores, leerPresupuestoConIA, variantePrecio } from "@/features/materiales/api";
import ProveedorTipoBadge from "@/features/materiales/ProveedorTipoBadge";
import { proveedorMeta } from "@/features/materiales/proveedorMeta";
import { materialBarcodeList, materialBarcodeText, normalizeBarcode } from "@/features/materiales/materialBarcodes";
import { guardarIngresoPendiente, borrarIngresoPendiente } from "@/features/panol/ingresosPendientes";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import BarcodeScanner from "@/features/panol/BarcodeScanner";
import { UbicacionChip } from "@/features/panol/UbicacionPicker";
import { parseUbicacion } from "@/features/panol/ubicacionUtils";
import { PANOL_REFERENCE_LAYOUT, PANOL_ROOM_H, PANOL_ROOM_W, applyPanolReferenceLayout } from "@/features/panol/panolLayout";

const UNITS = ["unidad", "metro", "kg", "litro", "pies", "caja", "rollo", "par", "juego", "m2"];
const CURRENCIES = ["ARS", "USD"];

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

function normSearch(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVariantList(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,\n;/]+/);
  const seen = new Set();
  return raw
    .flatMap((item) => String(item || "").split(/\s*\/\s*/))
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = normSearch(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function materialVariants(material) {
  return normalizeVariantList(material?.variantes);
}

function cleanNumber(value = "") {
  const raw = String(value || "").trim().replace(",", ".");
  if (!raw) return "";
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : raw;
}

function catalogScore(material, queryItem = {}) {
  const q = normSearch(queryItem.descripcion || queryItem.description || queryItem);
  if (!q) return 0;
  const desc = normSearch(material.descripcion);
  const code = normSearch(material.codigo);
  const barcode = normSearch(materialBarcodeText(material));
  const proveedor = normSearch(material.proveedor);
  const text = [desc, code, barcode, proveedor].filter(Boolean).join(" ");
  const queryCode = normSearch(queryItem.codigo || queryItem.code || "");
  if (queryCode && code && queryCode === code) return 110;
  if (queryCode && barcode && barcode.includes(queryCode)) return 108;
  if (desc === q) return 100;
  if (desc && (desc.includes(q) || q.includes(desc))) return 82;
  const words = q.split(" ").filter((word) => word.length > 2);
  const shared = words.filter((word) => text.includes(word)).length;
  if (words.length && shared === words.length) return 76;
  if (shared >= 3) return 68;
  if (shared >= 2) return 58;
  return 0;
}

function topCatalogMatches(catalog = [], queryItem = {}, limit = 8) {
  return [...catalog]
    .map((material) => ({ material, score: catalogScore(material, queryItem) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (a.material.descripcion || "").localeCompare(b.material.descripcion || "", "es"))
    .slice(0, limit)
    .map((row) => ({ ...row.material, _score: row.score }));
}

function itemPatchFromMaterial(material, item = {}) {
  const variants = materialVariants(material);
  const currentVariant = String(item.variante || "").trim();
  return {
    material_id: material?.id || "",
    codigo: item.codigo || material?.codigo || "",
    codigo_barra: item.codigo_barra || material?.codigo_barra || materialBarcodeList(material)[0]?.codigo || "",
    unidad: item.unidad || material?.unidad || "unidad",
    proveedor: item.proveedor || material?.proveedor || "",
    precio_unitario: item.precio_unitario !== "" && item.precio_unitario != null ? item.precio_unitario : material?.precio_unitario ?? "",
    moneda: item.moneda || material?.moneda || "ARS",
    ubicacion: item.ubicacion || material?.ubicacion || null,
    ubicacion_obs: item.ubicacion_obs || material?.ubicacion_obs || "",
    variante: currentVariant && variants.some((variant) => normSearch(variant) === normSearch(currentVariant)) ? currentVariant : "",
    catalog_match_score: material?._score || null,
  };
}

function isMissingVariantColumn(error) {
  const msg = String(error?.message || "").toLowerCase();
  return error?.code === "42703" || (msg.includes("column") && msg.includes("variante"));
}

function draftHasContent(payload = {}) {
  return !!(
    String(payload.titulo || "").trim()
    || String(payload.observaciones || "").trim()
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
  };
}

function CatalogLinkRow({ item, catalog = [], proveedores = [], onLink, onClear, onCreate, creating = false }) {
  const [q, setQ] = useState("");
  const selected = catalog.find((material) => material.id === item.material_id);
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
            <button
              type="button"
              onClick={onCreate}
              disabled={creating || !String(item.descripcion || "").trim()}
              style={{ border: `1px solid ${C.amberB ?? C.b0}`, background: "rgba(245,158,11,0.08)", color: creating ? C.dim : C.amber, borderRadius: 7, padding: "7px 10px", fontSize: 11.5, fontWeight: 850, cursor: creating ? "default" : "pointer", fontFamily: C.sans, whiteSpace: "nowrap" }}
            >
              {creating ? "Creando..." : "Crear nuevo"}
            </button>
          </>
        )}
      </div>
      {!selected && results.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginLeft: 81 }}>
          <div style={{ color: C.amber, fontSize: 11, fontWeight: 850 }}>
            Posibles coincidencias: elegí una para evitar duplicados.
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
                </span>
              </button>
            );
          })}
        </div>
      )}
      {!selected && q.trim() && results.length === 0 && (
        <div style={{ marginLeft: 81, color: C.t2, fontSize: 11 }}>
          Sin coincidencias claras. Podés crear un material nuevo.
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
        <rect x={105} y={PANOL_ROOM_H - 34} width={285} height={12} fill={C.amber} rx={5} opacity={0.8} />
        <rect x={485} y={PANOL_ROOM_H - 34} width={195} height={12} fill="#38bdf8" rx={5} opacity={0.8} />
        <rect x={1542} y={PANOL_ROOM_H - 34} width={275} height={12} fill={C.amber} rx={5} opacity={0.8} />
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

function ItemVariantRow({ item, material = null, onChange }) {
  const variants = materialVariants(material);
  const current = String(item.variante || "");
  // Al elegir una variante, si tiene precio cargado se autocompleta el del ítem.
  const pickVariant = (variant) => {
    const p = variantePrecio(material, variant);
    onChange?.(p ? { variante: variant, precio_unitario: p.amount, moneda: p.moneda } : { variante: variant });
  };
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "center", padding: "0 10px 10px 10px", minWidth: 0, flexWrap: "wrap" }}>
      <span style={{ color: C.t2, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8, minWidth: 72 }}>Variante</span>
      <input
        value={current}
        onChange={(e) => onChange?.({ variante: e.target.value })}
        placeholder={variants.length ? "Marca/modelo comprado" : "Ej: Samsung, LG, Webasto"}
        style={inp({ flex: "0 1 260px", minWidth: 170, padding: "8px 10px", fontSize: 12.5, background: C.panelSolid })}
        title="Marca/modelo que se compró para este barco"
      />
      {variants.length > 0 && (
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
          {variants.slice(0, 8).map((variant) => {
            const active = normSearch(current) === normSearch(variant);
            return (
              <button
                key={variant}
                type="button"
                onClick={() => pickVariant(variant)}
                style={{
                  border: `1px solid ${active ? C.blue : C.b0}`,
                  background: active ? "var(--blue-soft)" : C.bg,
                  color: active ? C.blue : C.t1,
                  borderRadius: 999,
                  padding: "5px 8px",
                  fontSize: 11,
                  fontWeight: 850,
                  cursor: "pointer",
                  fontFamily: C.sans,
                }}
              >
                {variant}
              </button>
            );
          })}
        </div>
      )}
      <span style={{ color: C.t2, fontSize: 11.5, minWidth: 0 }}>
        Queda guardada en la lista fija de la obra.
      </span>
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
  const isCompraNotice = prefill?.origen === "compra";
  const isObraNotice = prefill?.origen === "obra_matriz";
  const needsCatalogLink = isRemito || isCompraNotice || isObraNotice;
  const sedeLocked = lockedSedeForProfile(profile);
  const sedesDisponibles = sedeLocked ? [sedeLocked] : SEDES_PANOL;

  const [titulo, setTitulo] = useState("");
  const [sede, setSede] = useState("");
  const [obraId, setObraId] = useState("");
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
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [matches, setMatches] = useState([]);
  const [selectedMatches, setSelectedMatches] = useState(() => new Set());
  const [dragMatch, setDragMatch] = useState(null);
  const [aiReading, setAiReading] = useState(false);
  const [creatingCatalogIndex, setCreatingCatalogIndex] = useState(null);
  const [scanCode, setScanCode] = useState("");
  const [scanFlashMat, setScanFlashMat] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchTab, setSearchTab] = useState("materiales"); // "materiales" | "avisos"
  const [avisos, setAvisos] = useState([]);
  const [avisosLoading, setAvisosLoading] = useState(false);
  const [expandedAviso, setExpandedAviso] = useState(null);
  const [scanChoice, setScanChoice] = useState(null); // { material, options } cuando el escaneo es ambiguo
  const autoDraftIdRef = useRef(null);
  const lastAutosaveRef = useRef("");
  const scanInputRef = useRef(null);

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
    setSelectedMaterial(null);
    setMatches([]);
    setSelectedMatches(new Set());
    setDragMatch(null);
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
      fetchPanolCatalogMini({ q: "", limit: 5000 }),
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
    if (!open) return undefined;
    const term = selectedMaterial?.descripcion || catalogQ;
    if (!selectedMaterial && term.trim().length < 3) {
      setMatches([]);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const rows = await fetchRecepcionPedidoMatches({ material: selectedMaterial, q: term, limit: 80, sede });
        if (alive) {
          setMatches(rows);
          setSelectedMatches((prev) => new Set([...prev].filter((id) => rows.some((row) => row.id === id))));
        }
      } catch {
        if (alive) setMatches([]);
      }
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, selectedMaterial, catalogQ, sede]);

  useEffect(() => {
    if (!open || !isRemito || saving) return undefined;
    const payload = { titulo, sede, obraId, prioridad, observaciones, items };
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
  }, [open, isRemito, saving, titulo, sede, obraId, prioridad, observaciones, items, prefill?.draftId]);

  useEffect(() => {
    if (!open || !isRemito) return undefined;
    const handler = () => {
      const payload = { titulo, sede, obraId, prioridad, observaciones, items };
      if (!draftHasContent(payload)) return;
      const id = guardarIngresoPendiente(payload, autoDraftIdRef.current || prefill?.draftId || null);
      if (id) autoDraftIdRef.current = id;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [open, isRemito, titulo, sede, obraId, prioridad, observaciones, items, prefill?.draftId]);

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

  const avisosAgrupados = useMemo(() => {
    const byReq = new Map();
    for (const m of avisos) {
      const key = m.request_id || m.request_title || "sin";
      if (!byReq.has(key)) byReq.set(key, { key, request_id: m.request_id, request_title: m.request_title, obra_codigo: m.obra_codigo, linea_nombre: m.linea_nombre, items: [] });
      byReq.get(key).items.push(m);
    }
    // Si hay obra seleccionada arriba, se muestran SOLO los avisos de esa obra.
    const grupos = [...byReq.values()];
    const filtrados = obraId ? grupos.filter((g) => g.items.some((it) => it.obra_id === obraId)) : grupos;
    return filtrados.sort((a, b) => String(b.request_id ?? "").localeCompare(String(a.request_id ?? "")));
  }, [avisos, obraId]);

  const addedPedidoIds = useMemo(() => {
    const s = new Set();
    for (const it of items) {
      if (it.purchase_request_item_id) s.add(it.purchase_request_item_id);
      if (it.panol_envio_item_id) s.add(it.panol_envio_item_id);
    }
    return s;
  }, [items]);
  const avisoItemAdded = (m) => addedPedidoIds.has(m.panol_envio_item_id) || addedPedidoIds.has(m.purchase_request_item_id);

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

  async function getCatalogForMatching() {
    if (fullCatalog.length) return fullCatalog;
    const rows = await fetchPanolCatalogMini({ q: "", limit: 5000 });
    setFullCatalog(rows);
    return rows;
  }

  function persistDraftNow() {
    if (!isRemito) return null;
    const payload = { titulo, sede, obraId, prioridad, observaciones, items };
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

  async function rememberSnapshotVariants(sourceItems) {
    const updates = sourceItems
      .filter((item) => Object.prototype.hasOwnProperty.call(item, "variante"))
      .map((item) => {
        const query = supabase
          .from("panol_obra_materiales_snapshot")
          .update({ variante: String(item.variante || "").trim() || null });
        if (item.obra_snapshot_item_id) return query.eq("id", item.obra_snapshot_item_id);
        if (item.purchase_request_item_id) return query.eq("purchase_request_item_id", item.purchase_request_item_id);
        return null;
      })
      .filter(Boolean);
    if (!updates.length) return;
    const results = await Promise.all(updates);
    const error = results.find((result) => result.error)?.error;
    if (!error) return;
    if (isMissingVariantColumn(error)) {
      toast.warning("El envio se creo, pero falta correr el SQL de variante por obra.");
      return;
    }
    toast.warning(error.message || "El envio se creo, pero no se pudo guardar la variante de obra.");
  }

  function closeModal(saved = false) {
    if (!saved && isRemito) persistDraftNow();
    onClose(saved);
  }

  function linkCatalogMaterial(index, material) {
    if (!material) return;
    setItems((prev) => prev.map((it, idx) => (idx === index ? { ...it, ...itemPatchFromMaterial(material, it) } : it)));
  }

  async function createCatalogMaterialForItem(index) {
    const item = items[index];
    if (!item?.descripcion?.trim()) {
      toast.warning("Cargá una descripción antes de crear el material.");
      return null;
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
      if (item.material_id || !String(item.descripcion || "").trim()) {
        prepared.push(item);
        continue;
      }
      // Si hay un match FUERTE con el catálogo, se vincula solo (evita duplicado) sin bloquear.
      // Si no, se crea el ítem nuevo. Cualquier duplicado dudoso lo resuelve la pestaña de duplicados.
      const [best] = topCatalogMatches(catalogRows, item, 1);
      if (best && (best._score || 0) >= 70) {
        prepared.push({ ...item, ...itemPatchFromMaterial(best, item) });
        continue;
      }
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
      toast.success(`${createdRows.length} material${createdRows.length === 1 ? "" : "es"} nuevo${createdRows.length === 1 ? "" : "s"} en catálogo para revisar.`);
    }
    return prepared;
  }

  function addCatalogMaterial(material = selectedMaterial) {
    if (!material) return;
    setItems((prev) => [...prev, showPrices ? {
      descripcion: material.descripcion,
      codigo: material.codigo || "",
      codigo_barra: material.codigo_barra || materialBarcodeList(material)[0]?.codigo || "",
      cantidad: "1",
      unidad: material.unidad || "unidad",
      precio_unitario: material.precio_unitario ?? "",
      moneda: material.moneda || "ARS",
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
    } : stripItemPrice({
      descripcion: material.descripcion,
      codigo: material.codigo || "",
      codigo_barra: material.codigo_barra || materialBarcodeList(material)[0]?.codigo || "",
      cantidad: "1",
      unidad: material.unidad || "unidad",
      precio_unitario: "",
      moneda: "ARS",
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
    })]);
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

    // 4) Código desconocido → lo dejo en el alta rápida para cargarlo a mano
    setNCode(code);
    scanBeep(300, 200);
    toast.warning(`Código ${code} no está en el catálogo. Cargalo a mano (te dejé el código puesto).`);
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

  function addMatches(targets = matches.filter((match) => selectedMatches.has(match.id))) {
    if (!targets.length) return;
    const next = targets.map((match) => matchToItem(match, selectedMaterial));
    setItems((prev) => [...prev, ...(showPrices ? next : next.map(stripItemPrice))]);
    setSelectedMatches(new Set());
    toast.success(`${targets.length} item${targets.length === 1 ? "" : "s"} de pedido marcado${targets.length === 1 ? "" : "s"} para recepcionar.`);
  }

  async function readRemitoWithAI(file) {
    if (!file) return;
    setAiReading(true);
    try {
      const data = await leerPresupuestoConIA({ file });
      const catalogRows = await getCatalogForMatching();
      const aiItems = (data?.items || data?.lineas || [])
        .map((it) => normalizeItem({
          descripcion: it.descripcion || it.description || it.nombre || "",
          codigo: it.codigo || it.code || "",
          cantidad: it.cantidad ?? it.quantity ?? "",
          unidad: it.unidad || it.unit || "unidad",
          precio_unitario: it.precio_unitario ?? it.precio ?? "",
          moneda: it.moneda || "ARS",
          obra_id: obraId || "",
          proveedor: data?.proveedor || "",
          recepcion_estado: isRemito ? "recibido" : null,
        }))
        .filter((it) => it.descripcion);
      const hydratedItems = aiItems.map((item) => {
        const [best] = topCatalogMatches(catalogRows, item, 1);
        return best && (best._score || 0) >= 70 ? { ...item, ...itemPatchFromMaterial(best, item) } : item;
      });
      if (!hydratedItems.length) {
        toast.warning("La IA no detecto items.");
        return;
      }
      setItems((prev) => [...prev, ...(showPrices ? hydratedItems : hydratedItems.map(stripItemPrice))]);
      if (!titulo.trim() && data?.proveedor) setTitulo(`Remito ${data.proveedor}`);
      const suggested = hydratedItems.filter((item) => item.material_id).length;
      toast.success(`IA leyo ${hydratedItems.length} item${hydratedItems.length === 1 ? "" : "s"} - ${suggested} vinculado${suggested === 1 ? "" : "s"} al catalogo.`);
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
    setSaving(true);
    try {
      const preparedItems = await ensureCatalogLinksForItems(items);
      setItems(preparedItems);
      try {
        await rememberTouchedLocations(preparedItems);
      } catch (locationError) {
        toast.warning(locationError.message || "El ingreso sigue, pero no se pudo guardar la ubicacion habitual.");
      }
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
        items: preparedItems.map((it) => {
          const precio = showPrices ? normalizePriceForDb(it.precio_unitario) : null;
          return {
            ...it,
            obra_id: it.obra_id || obraId || null,
            codigo: String(it.codigo || "").trim().toUpperCase() || null,
            precio_unitario: precio,
            moneda: precio ? it.moneda || "ARS" : null,
            recepcion_estado: isRemito ? "recibido" : it.recepcion_estado || null,
          };
        }),
      });
      await rememberSnapshotVariants(preparedItems);
      for (const linked of linkedRecepcionItems) {
        await marcarItems([linked.id], "recibido", { cantidadRecibida: linked.cantidad || null });
      }
      toast.success(`${isRemito ? "Materiales ingresados" : `Envío a Pañol ${sede} creado`} · ${preparedItems.length} ítem${preparedItems.length > 1 ? "s" : ""}`);
      const draftId = autoDraftIdRef.current || prefill?.draftId;
      if (draftId) borrarIngresoPendiente(draftId);
      closeModal(true);
    } catch (err) {
      toast.error(err.message || "No se pudo crear el envío.");
    } finally {
      setSaving(false);
    }
  }

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
  const catalogListHeight = ingresoDesktop ? 278 : 184;
  const matchesListHeight = ingresoDesktop ? 318 : 224;

  return (
    <div
      onClick={embedded ? undefined : (e) => { if (e.target === e.currentTarget) closeModal(false); }}
      style={embedded
        ? { height: "100%", minHeight: 0, display: "grid", justifyItems: "center", fontFamily: C.sans }
        : { position: "fixed", inset: 0, zIndex: 9999, background: "var(--overlay-strong)", backdropFilter: "blur(6px)", display: "grid", placeItems: isMobile ? "end center" : "center", padding: isMobile ? 0 : ingresoDesktop ? 14 : 20, fontFamily: C.sans }}
    >
      <form onSubmit={submit} style={embedded
        ? { background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 12, width: "100%", maxWidth: isMobile ? "100%" : modalMaxWidth, height: "100%", maxHeight: "100%", overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", color: C.t0 }
        : { background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: isMobile ? "14px 14px 0 0" : 16, width: "100%", maxWidth: isMobile ? "100%" : modalMaxWidth, height: isMobile ? "96vh" : modalHeight, maxHeight: isMobile ? "96vh" : "calc(100vh - 28px)", overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", color: C.t0, boxShadow: "0 24px 80px rgba(15,23,42,0.24)" }}>
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
                    readRemitoWithAI(file);
                  }}
                  style={{ display: "none" }}
                />
              </label>
            </div>

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
                    const active = selectedMaterial?.id === mat.id;
                    const meta = proveedorMeta(mat.proveedor, proveedores);
                    const barcode = materialBarcodeList(mat)[0]?.codigo || "";
                    return (
                      <button
                        key={mat.id}
                        type="button"
                        onClick={() => { setSelectedMaterial(mat); setCatalogQ(mat.descripcion); }}
                        style={{
                          border: `1px solid ${active ? C.blueB : C.b0}`,
                          background: active ? "var(--blue-soft)" : C.bg,
                          color: C.t0,
                          borderRadius: 9,
                          padding: ingresoDesktop ? "10px 11px" : "8px 9px",
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: C.sans,
                        }}
                      >
                        <div style={{ fontSize: ingresoDesktop ? 13.3 : 12.5, fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mat.descripcion}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, color: C.t2, fontSize: ingresoDesktop ? 11.2 : 10.5, marginTop: 3 }}>
                          <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {mat.codigo || "sin cod. item"}{barcode ? ` · CB ${barcode}` : ""}{mat.proveedor ? ` · ${mat.proveedor}` : ""}
                          </span>
                          <ProveedorTipoBadge meta={meta} compact />
                          <UbicacionChip ubicacion={mat.ubicacion} obs={mat.ubicacion_obs} />
                        </div>
                      </button>
                    );
                  }) : (
                    <div style={{ color: C.t2, fontSize: 12, padding: 12, textAlign: "center", border: `1px dashed ${C.b0}`, borderRadius: 8 }}>Sin resultados</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => addCatalogMaterial()}
                  disabled={!selectedMaterial}
                  style={{ border: `1px solid ${C.blueB}`, background: selectedMaterial ? "var(--blue-soft)" : C.bg, color: selectedMaterial ? C.blue : C.t2, borderRadius: 8, padding: ingresoDesktop ? "10px 12px" : "8px 10px", cursor: selectedMaterial ? "pointer" : "default", fontSize: ingresoDesktop ? 12.5 : 12, fontWeight: 850, fontFamily: C.sans }}
                >
                  Agregar desde catalogo
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8, minWidth: 0, maxHeight: matchesListHeight, overflowY: "auto", paddingRight: 2 }}>
                {avisosLoading ? (
                  <div style={{ color: C.t2, fontSize: 12, padding: 18, textAlign: "center" }}>Cargando avisos...</div>
                ) : avisosAgrupados.length ? avisosAgrupados.map((av) => {
                  const abierto = expandedAviso === av.key;
                  const pendientes = av.items.filter((m) => !avisoItemAdded(m));
                  const agregados = av.items.length - pendientes.length;
                  return (
                    <div key={av.key} style={{ border: `1px solid ${abierto ? C.blueB : C.b0}`, borderRadius: 10, background: C.bg }}>
                      <div role="button" tabIndex={0} onClick={() => setExpandedAviso(abierto ? null : av.key)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 11px", cursor: "pointer" }}>
                        <span style={{ color: C.t2, fontSize: 12, width: 12, flexShrink: 0 }}>{abierto ? "▾" : "▸"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: ingresoDesktop ? 13.2 : 12.5, fontWeight: 900, color: C.t0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{av.request_title || "Pedido sin título"}</div>
                          <div style={{ fontSize: 11, color: C.t2, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{av.obra_codigo}{av.linea_nombre ? ` · ${av.linea_nombre}` : ""} · {av.items.length} ítem{av.items.length === 1 ? "" : "s"}{agregados ? ` · ${agregados} agregados` : ""}</div>
                        </div>
                        {pendientes.length === 0 && <span style={{ color: C.green, fontSize: 12, fontWeight: 900, flexShrink: 0 }}>✓ completo</span>}
                      </div>
                      {abierto && (
                        <div style={{ display: "grid", gap: 6, padding: "0 10px 10px" }}>
                          {av.items.map((m) => {
                            const added = avisoItemAdded(m);
                            return (
                              <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", padding: "8px 9px", border: `1px solid ${added ? C.greenB : C.b0}`, background: added ? C.greenL : "var(--panel)", borderRadius: 8 }}>
                                <div style={{ minWidth: 0, fontSize: 12.5, fontWeight: 750, color: C.t0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.description}</div>
                                <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.t1, whiteSpace: "nowrap" }}>{m.quantity || "-"} {m.unit || ""}</div>
                                {added
                                  ? <span style={{ color: C.green, fontSize: 13, fontWeight: 900, padding: "0 4px" }}>✓</span>
                                  : <button type="button" onClick={() => agregarPedidoItem(m)} style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 7, padding: "5px 11px", cursor: "pointer", fontSize: 11.5, fontWeight: 850, fontFamily: C.sans }}>Agregar</button>}
                              </div>
                            );
                          })}
                          <button type="button" onClick={() => pendientes.forEach(agregarPedidoItem)} disabled={pendientes.length === 0} style={{ justifySelf: "start", border: `1px solid ${C.greenB}`, background: pendientes.length ? C.greenL : C.bg, color: pendientes.length ? C.green : C.t2, borderRadius: 7, padding: "6px 12px", cursor: pendientes.length ? "pointer" : "default", fontSize: 12, fontWeight: 850, fontFamily: C.sans }}>Agregar todos los pendientes ({pendientes.length})</button>
                        </div>
                      )}
                    </div>
                  );
                }) : (
                  <div style={{ color: C.t2, fontSize: 12, padding: 18, textAlign: "center", border: `1px dashed ${C.b0}`, borderRadius: 8 }}>{obraId ? "No hay avisos de recepción para la obra seleccionada." : "No hay avisos de recepción abiertos. Escaneá el producto o cargalo como ingreso directo."}</div>
                )}
              </div>
            )}
          </div>

          <div
            style={isRemito ? { border: `1px solid ${C.b0}`, background: "rgba(96,165,250,0.035)", borderRadius: 14, padding: ingresoDesktop ? 16 : 10, display: "grid", gap: 10 } : undefined}
            onDragOver={(e) => { if (dragMatch) e.preventDefault(); }}
            onDrop={(e) => {
              if (!dragMatch) return;
              e.preventDefault();
              addMatches([dragMatch]);
              setDragMatch(null);
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <div>
                <span style={{ ...lbl, marginBottom: 3, fontSize: ingresoDesktop ? 11 : lbl.fontSize }}>Productos a ingresar</span>
                <div style={{ color: C.t2, fontSize: ingresoDesktop ? 12.5 : 11.5 }}>
                  {isCompraNotice
                    ? "Confirmá el material del catálogo y la variante comprada antes de avisar a pañol."
                    : isObraNotice
                      ? "Confirma el material del catalogo y la variante/marca que va a llevar esta obra."
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
                  const linkedMaterial = fullCatalog.find((material) => material.id === it.material_id) || null;
                  return (
                  <div key={`${it.panol_envio_item_id || it.purchase_request_item_id || it.material_id || "manual"}-${i}`} style={{ background: "var(--panel)", border: `1px solid ${scanFlashMat && it.material_id === scanFlashMat ? C.greenB : C.b0}`, borderRadius: 10, overflow: "hidden", transition: "border-color .25s, box-shadow .25s", boxShadow: scanFlashMat && it.material_id === scanFlashMat ? `0 0 0 2px ${C.greenL}` : "none" }}>
                    <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, alignItems: "center", padding: "10px" }}>
                    <input value={it.descripcion} onChange={(e) => updateItem(i, { descripcion: e.target.value, material_id: "", variante: "" })} placeholder="Descripción" style={inp({ padding: "8px 10px", fontSize: 13, gridColumn: isMobile ? "1 / -1" : undefined })} />
                    <input value={it.codigo || ""} onChange={(e) => updateItem(i, { codigo: e.target.value.toUpperCase(), material_id: "", variante: "" })} placeholder="Cod. item" title="Codigo interno/proveedor. El codigo de barras se toma del material vinculado." style={inp({ padding: "8px 10px", fontSize: 13, fontFamily: C.mono })} />
                    <input value={it.cantidad || ""} onChange={(e) => updateItem(i, { cantidad: e.target.value })} placeholder="Cant." style={inp({ padding: "8px 10px", fontSize: 13 })} />
                    <select value={it.unidad || "unidad"} onChange={(e) => updateItem(i, { unidad: e.target.value })} style={inp({ padding: "8px 10px", fontSize: 13, background: C.panelSolid })}>
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
                        creating={creatingCatalogIndex === i}
                        onLink={(material) => linkCatalogMaterial(i, material)}
                        onClear={() => updateItem(i, { material_id: "", variante: "" })}
                        onCreate={() => createCatalogMaterialForItem(i)}
                      />
                    )}
                    {needsCatalogLink && (
                      <ItemVariantRow
                        item={it}
                        material={linkedMaterial}
                        onChange={(patch) => updateItem(i, patch)}
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
                    {it.proveedor && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 7px 7px", color: C.t2, fontSize: 11, fontWeight: 750, minWidth: 0 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Proveedor: {it.proveedor}</span>
                        <ProveedorTipoBadge meta={proveedorMeta(it.proveedor, proveedores)} compact />
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
