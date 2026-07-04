import { C } from "@/theme";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Link2, PackageSearch, Search } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { crearEnvio, crearPanolCatalogMaterial, fetchPanolCatalogMini, fetchRecepcionPedidoMatches, marcarItems, SEDES_PANOL } from "@/features/panol/panolApi";
import { fetchProveedores, leerPresupuestoConIA } from "@/features/materiales/api";
import ProveedorTipoBadge from "@/features/materiales/ProveedorTipoBadge";
import { proveedorMeta } from "@/features/materiales/proveedorMeta";
import { materialBarcodeList, materialBarcodeText } from "@/features/materiales/materialBarcodes";
import { guardarIngresoPendiente, borrarIngresoPendiente } from "@/features/panol/ingresosPendientes";

const UNITS = ["unidad", "metro", "kg", "litro", "pies", "caja", "rollo", "par", "juego", "m2"];
const CURRENCIES = ["ARS", "USD"];

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
  return {
    material_id: material?.id || "",
    codigo: item.codigo || material?.codigo || "",
    codigo_barra: item.codigo_barra || material?.codigo_barra || materialBarcodeList(material)[0]?.codigo || "",
    unidad: item.unidad || material?.unidad || "unidad",
    proveedor: item.proveedor || material?.proveedor || "",
    precio_unitario: item.precio_unitario !== "" && item.precio_unitario != null ? item.precio_unitario : material?.precio_unitario ?? "",
    moneda: item.moneda || material?.moneda || "ARS",
    catalog_match_score: material?._score || null,
  };
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
    recepcion_estado: it.recepcion_estado ?? it.recepcionEstado ?? null,
    purchase_request_item_id: it.purchase_request_item_id ?? it.purchaseRequestItemId ?? null,
    panol_envio_item_id: it.panol_envio_item_id ?? it.panolEnvioItemId ?? null,
    obra_snapshot_item_id: it.obra_snapshot_item_id ?? it.obraSnapshotItemId ?? null,
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
    recepcion_estado: "recibido",
    purchase_request_item_id: match.purchase_request_item_id || (match.source === "compra" ? match.id : null),
    panol_envio_item_id: match.panol_envio_item_id || null,
    obra_snapshot_item_id: match.obra_snapshot_item_id || null,
    es_adicional: match.es_adicional ?? match.request?.es_adicional ?? null,
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
    <div style={{ display: "grid", gap: 5, padding: "0 7px 7px 7px" }}>
      <div style={{ display: "flex", gap: 7, alignItems: "center", minWidth: 0 }}>
        <span style={{ color: C.t2, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8, minWidth: 62 }}>Catalogo</span>
        {selected ? (
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0, color: C.green, fontSize: 11.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Conectado: {selected.descripcion}
              <span style={{ color: C.t2, fontWeight: 500 }}>{selected.codigo ? ` · ${selected.codigo}` : ""}{selected.proveedor ? ` · ${selected.proveedor}` : ""}</span>
            </div>
            <ProveedorTipoBadge meta={selectedMeta} compact />
            <button type="button" onClick={() => { setQ(""); onClear(); }} style={{ border: `1px solid ${C.b0}`, background: C.bg, color: C.t1, borderRadius: 7, padding: "5px 8px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: C.sans }}>
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar material del catalogo"
              style={inp({ flex: 1, minWidth: 0, padding: "6px 8px", fontSize: 11.5, background: C.bg })}
            />
            <button
              type="button"
              onClick={onCreate}
              disabled={creating || !String(item.descripcion || "").trim()}
              style={{ border: `1px solid ${C.amberB ?? C.b0}`, background: "rgba(245,158,11,0.08)", color: creating ? C.dim : C.amber, borderRadius: 7, padding: "6px 9px", fontSize: 11, fontWeight: 850, cursor: creating ? "default" : "pointer", fontFamily: C.sans, whiteSpace: "nowrap" }}
            >
              {creating ? "Creando..." : "Crear nuevo"}
            </button>
          </>
        )}
      </div>
      {!selected && results.length > 0 && (
        <div style={{ display: "grid", gap: 4, marginLeft: 69 }}>
          <div style={{ color: C.amber, fontSize: 10.5, fontWeight: 850 }}>
            Posibles coincidencias: elegí una para evitar duplicados.
          </div>
          {results.map((material) => {
            const meta = proveedorMeta(material.proveedor, proveedores);
            return (
              <button
                key={material.id}
                type="button"
                onClick={() => { onLink(material); setQ(""); }}
                style={{ display: "flex", justifyContent: "space-between", gap: 10, textAlign: "left", border: `1px solid ${C.b0}`, background: C.bg, color: C.t1, borderRadius: 7, padding: "5px 8px", cursor: "pointer", fontSize: 11.5, fontFamily: C.sans }}
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
        <div style={{ marginLeft: 69, color: C.t2, fontSize: 10.5 }}>
          Sin coincidencias claras. Podés crear un material nuevo.
        </div>
      )}
    </div>
  );
}

export default function EnviarAPanolModal({ open, onClose, prefill, showPrices = true, profile = null }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const isRemito = prefill?.origen === "remito" || prefill?.modo === "remito";
  const sedeLocked = lockedSedeForProfile(profile);
  const sedesDisponibles = sedeLocked ? [sedeLocked] : SEDES_PANOL;

  const [titulo, setTitulo] = useState("");
  const [sede, setSede] = useState("");
  const [obraId, setObraId] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState([]);
  const [obras, setObras] = useState([]);
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
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [selectedMatches, setSelectedMatches] = useState(() => new Set());
  const [dragMatch, setDragMatch] = useState(null);
  const [aiReading, setAiReading] = useState(false);
  const [creatingCatalogIndex, setCreatingCatalogIndex] = useState(null);
  const autoDraftIdRef = useRef(null);
  const lastAutosaveRef = useRef("");

  useEffect(() => {
    if (!open) return;
    setTitulo(prefill?.titulo || "");
    setSede(sedeLocked || prefill?.sede || "");
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
      setMatchesLoading(true);
      try {
        const rows = await fetchRecepcionPedidoMatches({ material: selectedMaterial, q: term, limit: 80, sede });
        if (alive) {
          setMatches(rows);
          setSelectedMatches((prev) => new Set([...prev].filter((id) => rows.some((row) => row.id === id))));
        }
      } catch {
        if (alive) setMatches([]);
      } finally {
        if (alive) setMatchesLoading(false);
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

  const obrasActivas = useMemo(() => {
    const rows = obras.filter((o) => !["terminada", "cancelada", "archivada"].includes(o.estado));
    return rows.length ? rows : obras;
  }, [obras]);

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
      recepcion_estado: isRemito ? "recibido" : null,
      purchase_request_item_id: null,
      obra_snapshot_item_id: null,
    })]);
  }

  function toggleMatch(matchId) {
    setSelectedMatches((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
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
      if (!aiItems.length) {
        toast.warning("La IA no detecto items.");
        return;
      }
      setItems((prev) => [...prev, ...(showPrices ? aiItems : aiItems.map(stripItemPrice))]);
      if (!titulo.trim() && data?.proveedor) setTitulo(`Remito ${data.proveedor}`);
      const suggested = aiItems.filter((item) => topCatalogMatches(catalogRows, item, 1).length).length;
      toast.success(`IA leyo ${aiItems.length} item${aiItems.length === 1 ? "" : "s"} - ${suggested} con sugerencia${suggested === 1 ? "" : "s"} de catalogo.`);
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
        ? "minmax(220px,1.35fr) 112px 76px 96px 142px 98px 78px 28px"
        : "minmax(220px,1.35fr) 112px 76px 96px 142px 28px"
      : showPrices
        ? "minmax(220px,1.6fr) 112px 76px 96px 98px 78px 28px"
        : "minmax(220px,1.6fr) 112px 76px 96px 28px";

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) closeModal(false); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--overlay-strong)", backdropFilter: "blur(6px)", display: "grid", placeItems: isMobile ? "end center" : "center", padding: isMobile ? 0 : 20, fontFamily: C.sans }}
    >
      <form onSubmit={submit} style={{ background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: isMobile ? "14px 14px 0 0" : 14, width: "100%", maxWidth: isMobile ? "100%" : 1240, maxHeight: isMobile ? "96vh" : "94vh", overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr auto", color: C.t0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{isRemito ? "Ingresar materiales" : "Enviar a Pañol"}</div>
          {prefill?.origen === "compra" && <span style={{ fontSize: 9, color: C.dim, background: "var(--panel-2)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>desde compra</span>}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => closeModal(false)} style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 18, padding: 4 }}>x</button>
        </div>

        <div style={{ overflowY: "auto", padding: 18, display: "grid", gap: 14 }}>
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

          <div>
            <span style={lbl}>Prioridad</span>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {[["baja", "Baja", C.dim], ["media", "Media", C.blue], ["alta", "Alta", C.amber], ["urgente", "Urgente", C.red]].map(([v, l, col]) => (
                <button key={v} type="button" onClick={() => setPrioridad(v)} style={{ border: `1px solid ${prioridad === v ? col + "66" : C.border}`, background: prioridad === v ? `${col}1c` : "transparent", color: prioridad === v ? col : C.dim, borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{ border: `1px solid ${C.b0}`, background: "var(--panel)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PackageSearch size={16} style={{ color: C.blue }} />
                <span style={{ color: C.t0, fontSize: 13, fontWeight: 900 }}>Catalogo y pedidos abiertos</span>
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${C.b0}`, background: C.bg, color: aiReading ? C.dim : C.violet, borderRadius: 8, padding: "7px 10px", cursor: aiReading ? "default" : "pointer", fontSize: 12, fontWeight: 850 }}>
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

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(220px, 0.9fr) minmax(320px, 1.1fr)", gap: 10, minHeight: 0 }}>
              <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.t2 }} />
                  <input
                    value={catalogQ}
                    onChange={(e) => setCatalogQ(e.target.value)}
                    placeholder="Buscar material para recepcionar"
                    style={inp({ paddingLeft: 32, background: C.bg, height: 36 })}
                  />
                </div>
                <div style={{ display: "grid", gap: 6, maxHeight: 184, overflowY: "auto", paddingRight: 2 }}>
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
                          borderRadius: 8,
                          padding: "8px 9px",
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: C.sans,
                        }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mat.descripcion}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, color: C.t2, fontSize: 10.5, marginTop: 2 }}>
                          <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {mat.codigo || "sin cod. item"}{barcode ? ` · CB ${barcode}` : ""}{mat.proveedor ? ` · ${mat.proveedor}` : ""}
                          </span>
                          <ProveedorTipoBadge meta={meta} compact />
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
                  style={{ border: `1px solid ${C.blueB}`, background: selectedMaterial ? "var(--blue-soft)" : C.bg, color: selectedMaterial ? C.blue : C.t2, borderRadius: 8, padding: "8px 10px", cursor: selectedMaterial ? "pointer" : "default", fontSize: 12, fontWeight: 850, fontFamily: C.sans }}
                >
                  Ingreso directo a stock
                </button>
              </div>

              <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span style={{ color: C.t2, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: 850 }}>Pedidos abiertos</span>
                  <button
                    type="button"
                    onClick={() => addMatches()}
                    disabled={selectedMatches.size === 0}
                    style={{ border: `1px solid ${C.greenB}`, background: selectedMatches.size ? C.greenL : C.bg, color: selectedMatches.size ? C.green : C.t2, borderRadius: 8, padding: "6px 9px", cursor: selectedMatches.size ? "pointer" : "default", fontSize: 11.5, fontWeight: 900, fontFamily: C.sans }}
                  >
                    <Link2 size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                    Recepcionar {selectedMatches.size || ""}
                  </button>
                </div>
                <div style={{ display: "grid", gap: 6, maxHeight: 224, overflowY: "auto", paddingRight: 2 }}>
                  {matchesLoading ? (
                    <div style={{ color: C.t2, fontSize: 12, padding: 18, textAlign: "center" }}>Buscando pedidos...</div>
                  ) : matches.length ? matches.map((match) => {
                    const checked = selectedMatches.has(match.id);
                    return (
                      <div
                        key={match.id}
                        draggable
                        onDragStart={() => setDragMatch(match)}
                        onDoubleClick={() => addMatches([match])}
                        style={{
                          border: `1px solid ${checked ? C.greenB : C.b0}`,
                          background: checked ? C.greenL : C.bg,
                          color: C.t0,
                          borderRadius: 9,
                          padding: 9,
                          display: "grid",
                          gridTemplateColumns: "18px minmax(0, 1fr) auto",
                          gap: 8,
                          alignItems: "start",
                          cursor: "grab",
                        }}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleMatch(match.id)} style={{ marginTop: 2 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: C.t0, fontSize: 12.5, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{match.description}</div>
                          <div style={{ color: C.t2, fontSize: 10.5, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {match.source_label ? `${match.source_label} · ` : ""}{match.obra_codigo} · {match.request_title}
                          </div>
                        </div>
                        <div style={{ color: C.t1, fontFamily: C.mono, fontSize: 11.5, fontWeight: 850, textAlign: "right" }}>
                          {match.quantity || "-"} {match.unit || ""}
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={{ color: C.t2, fontSize: 12, padding: 18, textAlign: "center", border: `1px dashed ${C.b0}`, borderRadius: 8 }}>Sin pedidos abiertos. Si llego igual, cargalo como ingreso directo a stock.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div
            onDragOver={(e) => { if (dragMatch) e.preventDefault(); }}
            onDrop={(e) => {
              if (!dragMatch) return;
              e.preventDefault();
              addMatches([dragMatch]);
              setDragMatch(null);
            }}
          >
            <span style={lbl}>Ítems - {items.length}</span>
            {items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                {!isMobile && (
                  <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 6, padding: "0 7px", fontSize: 9, color: C.t2, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 800 }}>
                    <span>Descripción</span><span>Cod. item</span><span>Cant.</span><span>Unidad</span>{isRemito && <span>Obra / stock</span>}{showPrices && <><span>Precio unit.</span><span>Moneda</span></>}<span />
                  </div>
                )}
                {items.map((it, i) => (
                  <div key={`${it.panol_envio_item_id || it.purchase_request_item_id || it.material_id || "manual"}-${i}`} style={{ background: "var(--panel)", border: `1px solid ${C.b0}`, borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 6, alignItems: "center", padding: "7px" }}>
                    <input value={it.descripcion} onChange={(e) => updateItem(i, { descripcion: e.target.value, material_id: "" })} placeholder="Descripción" style={inp({ padding: "6px 8px", fontSize: 12, gridColumn: isMobile ? "1 / -1" : undefined })} />
                    <input value={it.codigo || ""} onChange={(e) => updateItem(i, { codigo: e.target.value.toUpperCase(), material_id: "" })} placeholder="Cod. item" title="Codigo interno/proveedor. El codigo de barras se toma del material vinculado." style={inp({ padding: "6px 8px", fontSize: 12, fontFamily: C.mono })} />
                    <input value={it.cantidad || ""} onChange={(e) => updateItem(i, { cantidad: e.target.value })} placeholder="Cant." style={inp({ padding: "6px 8px", fontSize: 12 })} />
                    <select value={it.unidad || "unidad"} onChange={(e) => updateItem(i, { unidad: e.target.value })} style={inp({ padding: "6px 8px", fontSize: 12, background: C.panelSolid })}>
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    {isRemito && (
                      <select value={it.obra_id || obraId || ""} onChange={(e) => updateItem(i, { obra_id: e.target.value })} style={inp({ padding: "6px 8px", fontSize: 12, background: C.panelSolid })}>
                        <option value="">Stock general</option>
                        {obrasActivas.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}
                      </select>
                    )}
                    {showPrices && (
                      <>
                        <input value={it.precio_unitario || ""} onChange={(e) => updateItem(i, { precio_unitario: e.target.value })} placeholder="$ unit." style={inp({ padding: "6px 8px", fontSize: 12 })} />
                        <select value={it.moneda || "ARS"} onChange={(e) => updateItem(i, { moneda: e.target.value })} style={inp({ padding: "6px 8px", fontSize: 12, background: C.panelSolid })}>
                          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </>
                    )}
                    <button type="button" onClick={() => removeItem(i)} title="Quitar" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4, fontSize: 14 }}>x</button>
                    </div>
                    {isRemito && (
                      <CatalogLinkRow
                        item={it}
                        catalog={fullCatalog}
                        proveedores={proveedores}
                        creating={creatingCatalogIndex === i}
                        onLink={(material) => linkCatalogMaterial(i, material)}
                        onClear={() => updateItem(i, { material_id: "" })}
                        onCreate={() => createCatalogMaterialForItem(i)}
                      />
                    )}
                    {it.proveedor && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 7px 7px", color: C.t2, fontSize: 11, fontWeight: 750, minWidth: 0 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Proveedor: {it.proveedor}</span>
                        <ProveedorTipoBadge meta={proveedorMeta(it.proveedor, proveedores)} compact />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ border: `1px dashed ${C.border2 ?? C.b1}`, borderRadius: 9, padding: 10, background: "rgba(96,165,250,0.04)", display: "grid", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : showPrices ? "minmax(180px,1fr) 110px 80px 100px 96px 78px" : "minmax(180px,1fr) 110px 80px 100px", gap: 6 }}>
                <input value={nDesc} onChange={(e) => setNDesc(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} placeholder='Descripción o línea completa: "20 mtrs Antirruido"' style={inp({ padding: "7px 9px", fontSize: 12, gridColumn: isMobile ? "1 / -1" : undefined })} />
                <input value={nCode} onChange={(e) => setNCode(e.target.value.toUpperCase())} placeholder="Cod. item" title="Codigo interno/proveedor. Para codigo de barras, vinculalo al material del catalogo." style={inp({ padding: "7px 9px", fontSize: 12, fontFamily: C.mono })} />
                <input value={nCant} onChange={(e) => setNCant(e.target.value)} placeholder="Cant." style={inp({ padding: "7px 9px", fontSize: 12 })} />
                <select value={nUnit} onChange={(e) => setNUnit(e.target.value)} style={inp({ padding: "7px 9px", fontSize: 12, background: C.panelSolid })}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                {showPrices && (
                  <>
                    <input value={nPrice} onChange={(e) => setNPrice(e.target.value)} placeholder="Precio unit." style={inp({ padding: "7px 9px", fontSize: 12 })} />
                    <select value={nCurrency} onChange={(e) => setNCurrency(e.target.value)} style={inp({ padding: "7px 9px", fontSize: 12, background: C.panelSolid })}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={addItem} disabled={!nDesc.trim()} style={{ background: nDesc.trim() ? C.blue : "var(--panel-2)", color: nDesc.trim() ? "#fff" : C.dim, border: "none", borderRadius: 7, padding: "6px 12px", cursor: nDesc.trim() ? "pointer" : "default", fontSize: 12, fontWeight: 700, fontFamily: C.sans }}>+ Agregar ítem</button>
                <button type="button" onClick={() => setShowBulk((v) => !v)} style={{ background: "transparent", color: C.t2, border: `1px solid ${C.b0}`, borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>{showBulk ? "Cerrar lista" : "Pegar lista"}</button>
                <span style={{ color: C.t2, fontSize: 11 }}>Detecta cantidad, unidad y código final.</span>
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
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder="Notas para el pañolero" style={inp({ resize: "vertical", minHeight: 46 })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: isRemito ? "space-between" : "flex-end", padding: "12px 18px", borderTop: `1px solid ${C.border}`, background: "var(--panel)" }}>
          {isRemito && (
            <button
              type="button"
              disabled={saving || (!titulo.trim() && items.length === 0)}
              onClick={() => {
                const ok = persistDraftNow();
                if (ok) { toast.success("Guardado en pendientes."); onClose(false); }
                else toast.error("No se pudo guardar el pendiente.");
              }}
              style={{ border: `1px solid ${C.border}`, background: "var(--panel-2)", color: C.t1, borderRadius: 7, padding: "9px 16px", cursor: saving || (!titulo.trim() && items.length === 0) ? "default" : "pointer", opacity: saving || (!titulo.trim() && items.length === 0) ? 0.5 : 1, fontSize: 12, fontWeight: 750, fontFamily: C.sans }}
            >
              Guardar pendiente
            </button>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={() => closeModal(false)} style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.dim, borderRadius: 7, padding: "9px 16px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.sans }}>Cancelar</button>
          <button type="submit" disabled={saving || !titulo.trim() || items.length === 0} style={{ border: "none", background: saving || !titulo.trim() || !items.length ? "var(--panel-2)" : C.blue, color: saving || !titulo.trim() || !items.length ? C.dim : "#fff", borderRadius: 7, padding: "9px 16px", cursor: saving || !titulo.trim() || !items.length ? "default" : "pointer", fontSize: 12, fontWeight: 800, fontFamily: C.sans }}>{saving ? "Guardando..." : isRemito ? "Ingresar a stock" : "Enviar a Pañol"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
