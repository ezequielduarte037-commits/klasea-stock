/**
 * OrdenCompraGenerator.jsx
 *
 * Generador de Órdenes de Compra con:
 *  - Plantillas por modelo de obra (desde Supabase)
 *  - Marcado de ítems en stock
 *  - Comparación con stock actual del inventario
 *  - Botón para crear pedido directo en laminacion_pedidos
 *  - Generación de texto de email listo para copiar
 *
 * CAMBIOS v2:
 *  - matchMaterialScored: matching por palabras (Jaccard) + strip de paréntesis
 *  - MaterialPicker: dropdown inline para ítems sin match automático
 *  - Overrides manuales persistidos en localStorage por plantilla
 *
 * PROPS:
 *   materiales       — array de laminacion_materiales (ya lo tenés en LaminacionScreen)
 *   stockPorMaterial — objeto { [material_id]: cantidad } (ya lo tenés)
 *   onCrearOrden     — fn(items, meta) — items: [{material_id,cantidad,descripcion}], meta: {plantillaLabel,obraNumero,ordenRef}
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Package, Plus, Trash2, X, RotateCcw, Download, AlertTriangle, ChevronDown, ChevronRight, FileText, ClipboardList, Search, Copy, Eye, Edit2 } from "lucide-react";

import { supabase } from "@/supabaseClient";

// ── Paleta ───────────────────────────────────────────────────────
const C = {
  card:   "rgba(255,255,255,0.03)",
  b0:     "rgba(255,255,255,0.08)",
  t0:     "#f4f4f5",
  t1:     "#a1a1aa",
  t2:     "#52525b",
  red:    "#ff453a",
  amber:  "#ffbe35",
  green:  "#30d158",
  blue:   "#3b82f6",
  cyan:   "#0ea5e9",
  violet: "#a78bfa",
  mono:   "'JetBrains Mono', monospace",
  sans:   "'Outfit', system-ui",
};

const S = {
  section: { border: `1px solid ${C.b0}`, borderRadius: 14, background: C.card, marginBottom: 20, overflow: "hidden" },
  header:  { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${C.b0}`, cursor: "pointer", userSelect: "none" },
  label:   { fontSize: 10, color: C.t2, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: C.sans, marginBottom: 5, display: "block" },
  input:   { background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`, color: C.t0, padding: "8px 11px", borderRadius: 8, fontSize: 12, fontFamily: C.sans, outline: "none", width: "100%", boxSizing: "border-box" },
  select:  { background: "rgba(255,255,255,0.06)", border: `1px solid ${C.b0}`, color: C.t0, padding: "6px 9px", borderRadius: 7, fontSize: 11, fontFamily: C.sans, outline: "none", width: "100%", boxSizing: "border-box", cursor: "pointer" },
  btn:   (color, fill = false) => ({ border: `1px solid ${color}55`, background: fill ? color : `${color}18`, color: fill ? "#fff" : color, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: C.sans, whiteSpace: "nowrap" }),
  btnSm: (color, fill = false) => ({ border: `1px solid ${color}44`, background: fill ? color : `${color}15`, color: fill ? "#fff" : color, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: C.sans, whiteSpace: "nowrap" }),
  th: { textAlign: "left", fontSize: 9, color: C.t2, padding: "9px 12px", textTransform: "uppercase", letterSpacing: 2, fontFamily: C.sans, fontWeight: 600 },
  td: { padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.025)", verticalAlign: "middle", fontSize: 12, fontFamily: C.sans },
};

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

function fmtLinea(item) {
  if (!item.total || item.total_unidad === "unid") return `${item.cantidad} ${item.descripcion}`;
  return `${item.cantidad} x ${item.unidad} ${item.descripcion} ---------- ${item.total} ${item.total_unidad}`;
}

function fmtFechaLocal(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function generarEmail({ obraNumero, plantillaLabel, desmolde, items, stockKeys }) {
  const nombreObra  = obraNumero?.trim() || plantillaLabel || "Obra";
  const desmoldeStr = desmolde ? ` (Fecha estimada de desmolde ${fmtFechaLocal(desmolde)})` : "";
  const aComprar = items.filter(it => !stockKeys.has(it._key));
  const enStock  = items.filter(it =>  stockKeys.has(it._key));
  let txt = `Agus,\n\nte detallo los materiales requeridos:\n\nObra ${nombreObra}${desmoldeStr}\n\n`;
  aComprar.forEach(it => { txt += fmtLinea(it) + "\n"; });
  if (enStock.length > 0) {
    txt += `\nRemarcado en celeste los materiales en stock que no son necesario comprar.\n\nStock:\n`;
    enStock.forEach(it => { txt += fmtLinea(it) + "\n"; });
  }
  txt += `\nGracias,`;
  return txt;
}

// ════════════════════════════════════════════════════════════════
// MATCHING POR PALABRAS (Jaccard)
// Maneja: distinto case, paréntesis opcionales, abreviaciones
// Ej: "Resina 101"         matchea "Resina 101 220l"       
//     "Catalizador"        matchea "Catalizador (Aperox)"  
//     "airex h80 10mm"     matchea "AIREX H80 10MM"        
//     "Gel coat blanco"    matchea "Gel coat blanco iso…"  
// ════════════════════════════════════════════════════════════════
function normStr(s) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")       // quita contenido entre paréntesis
    .replace(/[^a-z0-9\s]/g, " ")   // quita guiones, puntos, etc.
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardScore(a, b) {
  const wa = new Set(a.split(" ").filter(w => w.length > 1));
  const wb = new Set(b.split(" ").filter(w => w.length > 1));
  if (!wa.size && !wb.size) return 0;
  const intersection = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Devuelve { mat, score, candidato }
 *  mat:       el mejor match si supera el umbral, o null
 *  score:     score del mejor match (0–1)
 *  candidato: el mejor material encontrado aunque no supere el umbral
 */
function matchMaterialScored(descripcion, materiales) {
  if (!materiales?.length) return { mat: null, score: 0, candidato: null };

  const desc = normStr(descripcion);
  let best = null, bestScore = 0;

  for (const mat of materiales) {
    const matNorm = normStr(mat.nombre);
    let score = 0;

    if (desc === matNorm) {
      score = 1.0;
    } else if (matNorm.length > 2 && desc.includes(matNorm)) {
      score = 0.9;
    } else if (desc.length > 2 && matNorm.includes(desc)) {
      score = 0.85;
    } else {
      score = jaccardScore(desc, matNorm);
    }

    if (score > bestScore) { bestScore = score; best = mat; }
  }

  const THRESHOLD = 0.45;
  return {
    mat:       bestScore >= THRESHOLD ? best : null,
    score:     bestScore,
    candidato: best,
  };
}

// ── Badge de stock ───────────────────────────────────────────────
function StockBadge({ stockActual, cantidadNecesaria }) {
  if (stockActual == null) return <span style={{ color: C.t2, fontSize: 11 }}>—</span>;
  const aComprar = Math.max(0, cantidadNecesaria - stockActual);
  const color = aComprar === 0 ? C.green : aComprar < cantidadNecesaria ? C.amber : C.red;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
      <span style={{ fontFamily: C.mono, fontSize: 12, color, fontWeight: 700 }}>{stockActual}</span>
      {aComprar > 0 && <span style={{ fontSize: 10, color, fontFamily: C.mono }}>faltan {aComprar}</span>}
      {aComprar === 0 && <span style={{ fontSize: 10, color: C.green }}> cubierto</span>}
    </div>
  );
}

// ── Picker manual de material ────────────────────────────────────
function MaterialPicker({ materiales, value, onChange }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return materiales;
    return materiales.filter(m => m.nombre.toLowerCase().includes(term));
  }, [q, materiales]);

  return (
    <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 4 }}>
      <input
        style={{ ...S.input, padding: "4px 8px", fontSize: 11, width: 200, background: "rgba(255,69,58,0.06)", border: `1px solid ${C.red}44` }}
        placeholder=" Buscar en inventario…"
        value={q}
        onChange={e => setQ(e.target.value)}
        onClick={e => e.stopPropagation()}
      />
      <select
        style={{ ...S.select, width: 200, background: "rgba(255,69,58,0.06)", border: `1px solid ${C.red}44`, color: value ? C.t0 : C.t2 }}
        value={value ?? ""}
        onChange={e => { onChange(e.target.value || null); setQ(""); }}
        onClick={e => e.stopPropagation()}
      >
        <option value="">— sin vincular —</option>
        {filtered.map(m => (
          <option key={m.id} value={m.id}>{m.nombre}</option>
        ))}
      </select>
    </div>
  );
}

// ── Sugerencia de candidato cercano (debajo del umbral) ──────────
function CandidatoBadge({ candidato, score, onAceptar }) {
  if (!candidato || score < 0.2) return null;
  return (
    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, color: C.amber, fontFamily: C.sans }}>
        ¿Es "{candidato.nombre}"?
      </span>
      <button
        style={{ ...S.btnSm(C.amber), padding: "2px 8px", fontSize: 10 }}
        onClick={e => { e.stopPropagation(); onAceptar(candidato.id); }}
      >
        Sí 
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function OrdenCompraGenerator({ materiales = [], stockPorMaterial = {}, onCrearOrden }) {
  const [open, setOpen]                     = useState(true);
  const [plantillas, setPlantillas]         = useState([]);
  const [loadingP, setLoadingP]             = useState(true);
  const [plantillaId, setPlantillaId]       = useState("");
  const [plantillaLabel, setPlantillaLabel] = useState("");
  const [obraNumero, setObraNumero]         = useState("");
  const [desmolde, setDesmolde]             = useState("");
  const [items, setItems]                   = useState([]);
  const [loadingItems, setLoadingItems]     = useState(false);
  const [stockKeys, setStockKeys]           = useState(new Set());   // para email
  const [selectedKeys, setSelectedKeys]     = useState(new Set());   // para pedido
  const [extraKeys, setExtraKeys]           = useState(new Set());   // items marcados como extra
  const [copiado, setCopiado]               = useState(false);
  const [vista, setVista]                   = useState("tabla");
  const [pedidosCreados, setPedidosCreados] = useState(new Set());
  const [creando, setCreando]               = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);

  // Ítems extra libres
  const [extraItems, setExtraItems]         = useState([]);
  const [extraMat, setExtraMatId]           = useState("");
  const [extraCant, setExtraCant]           = useState("");
  const [extraQ, setExtraQ]                 = useState("");

  // { [_key]: material_id } — overrides manuales
  const [overrides, setOverrides] = useState({});

  // ── Cargar plantillas ────────────────────────────────────────
  useEffect(() => {
    supabase.from("laminacion_plantillas").select("id, modelo, label").order("label")
      .then(({ data }) => { setPlantillas(data ?? []); setLoadingP(false); });
  }, []);

  useEffect(() => {
    if (!plantillaId) { setOverrides({}); return; }
    try {
      const saved = localStorage.getItem(`lam_mat_override_${plantillaId}`);
      setOverrides(saved ? JSON.parse(saved) : {});
    } catch { setOverrides({}); }
  }, [plantillaId]);

  function saveOverride(key, matId) {
    setOverrides(prev => {
      const next = { ...prev };
      if (matId) next[key] = matId;
      else delete next[key];
      try { localStorage.setItem(`lam_mat_override_${plantillaId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // ── Aplicar plantilla ── todos seleccionados por defecto ─────
  async function aplicarPlantilla(id) {
    setPlantillaId(id);
    setStockKeys(new Set());
    setSelectedKeys(new Set());
    setItems([]);
    setPedidosCreados(new Set());
    setExtraItems([]);
    if (!id) { setPlantillaLabel(""); return; }
    const p = plantillas.find(p => String(p.id) === String(id));
    setPlantillaLabel(p?.label ?? "");
    setLoadingItems(true);
    const { data } = await supabase
      .from("laminacion_plantilla_items").select("*")
      .eq("plantilla_id", id).order("orden");
    const loaded = (data ?? []).map(it => ({
      ...it,
      _key:       String(it.id),
      _cantEdit:  String(it.cantidad),
      _totalEdit: it.total != null ? String(it.total) : "",
    }));
    setItems(loaded);
    setSelectedKeys(new Set(loaded.map(it => it._key)));
    setLoadingItems(false);
  }

  function toggleStock(key) {
    setStockKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  function toggleSelected(key) {
    setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  function toggleTodos(total) {
    if (selectedKeys.size === total) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(itemsConStock.map(it => it._key)));
  }

  function toggleExtra(key) {
    setExtraKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  function updateItem(key, field, value) {
    setItems(prev => prev.map(it => it._key === key ? { ...it, [field]: value } : it));
  }

  // ── Extras ───────────────────────────────────────────────────
  function agregarExtra() {
    if (!extraMat || !extraCant || num(extraCant) <= 0) return;
    const uid = `extra-${Date.now()}`;
    setExtraItems(prev => [...prev, { uid, material_id: extraMat, cantidad: num(extraCant) }]);
    setExtraMatId(""); setExtraCant(""); setExtraQ("");
  }
  function quitarExtra(uid) { setExtraItems(prev => prev.filter(e => e.uid !== uid)); }

  // ── Items enriquecidos ───────────────────────────────────────
  const itemsConStock = useMemo(() => items.map(it => {
    const overrideMat = overrides[it._key]
      ? materiales.find(m => String(m.id) === String(overrides[it._key])) ?? null : null;
    const { mat: autoMat, score, candidato } = matchMaterialScored(it.descripcion, materiales);
    const mat       = overrideMat ?? autoMat;
    const matchMode = overrideMat ? "manual" : autoMat ? "auto" : "none";
    const stockActual       = mat ? num(stockPorMaterial[mat.id] ?? 0) : null;
    const cantidadNecesaria = num(it._cantEdit) || num(it.cantidad);
    const aComprar          = stockActual != null ? Math.max(0, cantidadNecesaria - stockActual) : null;
    return { ...it, _mat: mat, _matchMode: matchMode, _matchScore: score, _candidato: candidato,
      _stockActual: stockActual, _cantidadNecesaria: cantidadNecesaria, _aComprar: aComprar };
  }), [items, materiales, stockPorMaterial, overrides]);

  const sinMatch     = itemsConStock.filter(it => it._matchMode === "none").length;
  const enStockCount = items.filter(it => stockKeys.has(it._key)).length;

  // Qué va al pedido
  const itemsAGenerar = useMemo(() => {
    const dePlantilla = itemsConStock.filter(it =>
      selectedKeys.has(it._key) && it._mat && !pedidosCreados.has(it._key)
    );
    const deExtras = extraItems
      .filter(e => !pedidosCreados.has(e.uid) && e.material_id)
      // String() en ambos lados para evitar type mismatch int vs string
      .map(e => ({ ...e, _mat: materiales.find(m => String(m.id) === String(e.material_id)) ?? null }));
    // NO filtramos por _mat aquí — el insert solo necesita material_id
    return { dePlantilla, deExtras, total: dePlantilla.length + deExtras.length };
  }, [itemsConStock, selectedKeys, extraItems, materiales, pedidosCreados]);

  // ── Ejecutar: una sola orden con todos los ítems ────────────
  async function _ejecutar() {
    if (!onCrearOrden) return;
    setShowConfirm(false);
    setCreando(true);
    // Generar ordenRef único: OC-YYYYMMDD-XXXX
    const now  = new Date();
    const ymd  = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const ordenRef = `OC-${ymd}-${rand}`;
    const items = [
      ...itemsAGenerar.dePlantilla.map(it => ({
        material_id: it._mat.id,
        cantidad:    it._cantidadNecesaria,
        descripcion: it.descripcion,
        categoria:   extraKeys.has(it._key) ? "extra" : "estándar",
      })),
      ...itemsAGenerar.deExtras.map(e => ({
        material_id: e.material_id,
        cantidad:    e.cantidad,
        descripcion: e._mat?.nombre ?? "Extra",
        categoria:   "extra",
      })),
    ];
    try {
      await onCrearOrden(items, { plantillaLabel, obraNumero, ordenRef });
      // Marcar todos como creados
      setPedidosCreados(prev => new Set([
        ...prev,
        ...itemsAGenerar.dePlantilla.map(it => it._key),
        ...itemsAGenerar.deExtras.map(e => e.uid),
      ]));
    } finally { setCreando(false); }
  }

  // ── Email ────────────────────────────────────────────────────
  const itemsParaEmail = useMemo(() =>
    items.map(it => ({ ...it, cantidad: Number(it._cantEdit) || it.cantidad,
      total: it._totalEdit !== "" ? Number(it._totalEdit) : it.total })), [items]);

  const emailText = useMemo(() =>
    generarEmail({ obraNumero, plantillaLabel, desmolde, items: itemsParaEmail, stockKeys }),
    [obraNumero, plantillaLabel, desmolde, itemsParaEmail, stockKeys]);

  function copiar() {
    navigator.clipboard.writeText(emailText).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 2200);
    });
  }

  const matFiltrados = useMemo(() => {
    const q = extraQ.trim().toLowerCase();
    return q ? materiales.filter(m => m.nombre.toLowerCase().includes(q)) : materiales;
  }, [materiales, extraQ]);

  return (
    <div style={S.section}>

      {/* ── Header ── */}
      <div style={S.header} onClick={() => setOpen(o => !o)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16 }}></span>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.t0, fontFamily: C.sans }}>Generador de Orden de Compra</span>
          {plantillaLabel && (
            <span style={{ background: `${C.blue}22`, color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
              {plantillaLabel}
            </span>
          )}
          {selectedKeys.size > 0 && (
            <span style={{ background: `${C.violet}22`, color: C.violet, border: `1px solid ${C.violet}44`, borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
              {selectedKeys.size} seleccionados
            </span>
          )}
          {extraItems.length > 0 && (
            <span style={{ background: `${C.amber}18`, color: C.amber, border: `1px solid ${C.amber}33`, borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
              {extraItems.length} extras
            </span>
          )}
          {sinMatch > 0 && plantillaId && (
            <span style={{ background: `${C.red}18`, color: C.red, border: `1px solid ${C.red}33`, borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
               {sinMatch} sin vincular
            </span>
          )}
        </div>
        <span style={{ color: C.t2, fontSize: 14 }}>{open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</span>
      </div>

      {open && (
        <div style={{ padding: "18px 20px" }}>

          {/* ── Config ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
            <div>
              <label style={S.label}>Modelo de obra</label>
              <select style={{ ...S.select, padding: "8px 11px", fontSize: 12 }} value={plantillaId} onChange={e => aplicarPlantilla(e.target.value)} disabled={loadingP}>
                <option value="">{loadingP ? "Cargando…" : "— Seleccionar modelo —"}</option>
                {plantillas.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Número de obra (ej: K52-25)</label>
              <input style={S.input} placeholder={plantillaLabel || "K52-25"} value={obraNumero} onChange={e => setObraNumero(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Fecha estimada de desmolde</label>
              <input style={S.input} type="date" value={desmolde} onChange={e => setDesmolde(e.target.value)} />
            </div>
          </div>

          {!plantillaId && !loadingItems && (
            <div style={{ padding: "32px 0", textAlign: "center", color: C.t2, fontSize: 13, fontFamily: C.sans }}>
              Seleccioná un modelo de obra para cargar la plantilla de materiales.
            </div>
          )}
          {loadingItems && (
            <div style={{ padding: "24px 0", textAlign: "center", color: C.t2, fontSize: 12, fontFamily: C.sans }}>Cargando materiales…</div>
          )}

          {!loadingItems && plantillaId && items.length > 0 && (
            <>
              {sinMatch > 0 && (
                <div style={{ marginBottom: 14, padding: "10px 14px", background: `${C.red}0d`, border: `1px solid ${C.red}33`, borderRadius: 9, fontSize: 12, color: C.t1, fontFamily: C.sans }}>
                  <span style={{ color: C.red, fontWeight: 700 }}> {sinMatch} ítem{sinMatch !== 1 ? "s" : ""} sin vincular al inventario.</span>
                  {" "}Usá el selector debajo de cada uno para vincularlo.
                </div>
              )}

              {/* ── Tabs ── */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                {["tabla", "email"].map(v => (
                  <button key={v} style={S.btn(vista === v ? C.blue : C.t2, vista === v)} onClick={() => setVista(v)}>
                    {v === "tabla" ? "Editar lista" : "Vista email"}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                {onCrearOrden && itemsAGenerar.total > 0 && (
                  <button style={S.btn(C.violet, true)} onClick={() => setShowConfirm(true)} disabled={creando}>
                    {creando ? "Generando…" : `Generar pedido (${itemsAGenerar.total} ítems)`}
                  </button>
                )}
              </div>

              {/* ── Vista tabla ── */}
              {vista === "tabla" && (
                <div style={{ border: `1px solid ${C.b0}`, borderRadius: 10, overflow: "auto", marginBottom: 16 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                        <th style={{ ...S.th, width: 38, textAlign: "center" }}>
                          <button
                            title="Seleccionar / deseleccionar todos"
                            onClick={() => toggleTodos(itemsConStock.length)}
                            style={{ border: `1px solid ${C.b0}`, background: selectedKeys.size === itemsConStock.length ? `${C.violet}25` : "transparent", color: selectedKeys.size === itemsConStock.length ? C.violet : C.t2, width: 22, height: 22, borderRadius: 5, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}
                          >
                            {selectedKeys.size === itemsConStock.length ? "" : ""}
                          </button>
                        </th>
                        <th style={S.th}>Material</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Cantidad</th>
                        <th style={S.th}>Bulto</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Total</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Stock actual</th>
                        <th style={{ ...S.th, width: 46, textAlign: "center" }}>Email stock</th>
                        <th style={{ ...S.th, width: 46, textAlign: "center" }}>Extra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsConStock.map(it => {
                        const seleccionado = selectedKeys.has(it._key);
                        const enStock      = stockKeys.has(it._key);
                        const yaPedido     = pedidosCreados.has(it._key);
                        const rowBg = yaPedido ? "rgba(167,139,250,0.07)"
                          : seleccionado ? "rgba(167,139,250,0.035)" : "transparent";

                        return (
                          <tr key={it._key} style={{ background: rowBg, opacity: yaPedido ? 0.6 : 1, transition: "all .15s" }}>
                            <td style={{ ...S.td, textAlign: "center" }}>
                              {yaPedido ? (
                                <span style={{ color: C.violet, fontSize: 14 }}></span>
                              ) : (
                                <button
                                  title={seleccionado ? "Quitar del pedido" : "Incluir en el pedido"}
                                  onClick={() => toggleSelected(it._key)}
                                  style={{ border: seleccionado ? `1px solid ${C.violet}55` : `1px solid ${C.b0}`, background: seleccionado ? `${C.violet}22` : "transparent", color: seleccionado ? C.violet : C.t2, width: 26, height: 26, borderRadius: 6, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", transition: "all .15s" }}
                                >
                                  {seleccionado ? "" : ""}
                                </button>
                              )}
                            </td>

                            <td style={{ ...S.td, fontWeight: 600, color: seleccionado ? C.t0 : C.t2, maxWidth: 280 }}>
                              {yaPedido && <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: C.violet, border: `1px solid ${C.violet}44`, background: `${C.violet}15`, borderRadius: 4, padding: "1px 5px", marginRight: 7, fontWeight: 700 }}>PEDIDO </span>}
                              {enStock && <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: C.cyan, border: `1px solid ${C.cyan}44`, background: `${C.cyan}15`, borderRadius: 4, padding: "1px 5px", marginRight: 7, fontWeight: 700 }}>STOCK EMAIL</span>}
                              {it.descripcion}
                              {it._matchMode === "auto" && (
                                <div style={{ fontSize: 10, color: C.green, marginTop: 3, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ opacity: 0.4 }}></span><span>{it._mat.nombre}</span>
                                  <span title="Cambiar vínculo" style={{ cursor: "pointer", color: C.t2, fontSize: 11, marginLeft: 2 }} onClick={e => { e.stopPropagation(); saveOverride(it._key, "__reset__"); }}></span>
                                </div>
                              )}
                              {it._matchMode === "manual" && (
                                <div style={{ fontSize: 10, color: C.cyan, marginTop: 3, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ opacity: 0.4 }}></span><span>{it._mat.nombre}</span>
                                  <span title="Quitar vínculo" style={{ cursor: "pointer", color: C.t2, fontSize: 12, marginLeft: 2 }} onClick={e => { e.stopPropagation(); saveOverride(it._key, null); }}></span>
                                </div>
                              )}
                              {(it._matchMode === "none" || overrides[it._key] === "__reset__") && (
                                <>
                                  {it._matchMode === "none" && <div style={{ fontSize: 10, color: C.red, marginTop: 3 }}> sin match en inventario</div>}
                                  <CandidatoBadge candidato={it._candidato} score={it._matchScore} onAceptar={matId => saveOverride(it._key, matId)} />
                                  <MaterialPicker materiales={materiales} value={""} onChange={matId => saveOverride(it._key, matId)} />
                                </>
                              )}
                            </td>

                            <td style={{ ...S.td, textAlign: "right" }}>
                              <input type="number" min="0" step="1"
                                style={{ ...S.input, width: 60, textAlign: "right", fontFamily: C.mono, fontSize: 12, padding: "4px 8px" }}
                                value={it._cantEdit}
                                onChange={e => updateItem(it._key, "_cantEdit", e.target.value)}
                              />
                            </td>
                            <td style={{ ...S.td, color: C.t1, fontFamily: C.mono, fontSize: 11 }}>{it.unidad}</td>
                            <td style={{ ...S.td, textAlign: "right" }}>
                              {it.total_unidad === "unid"
                                ? <span style={{ fontFamily: C.mono, color: C.t2, fontSize: 11 }}>—</span>
                                : <input type="number" min="0" step="1"
                                    style={{ ...S.input, width: 72, textAlign: "right", fontFamily: C.mono, fontSize: 12, padding: "4px 8px" }}
                                    value={it._totalEdit}
                                    onChange={e => updateItem(it._key, "_totalEdit", e.target.value)}
                                  />
                              }
                            </td>
                            <td style={{ ...S.td, textAlign: "right" }}>
                              <StockBadge stockActual={it._stockActual} cantidadNecesaria={it._cantidadNecesaria} />
                            </td>
                            <td style={{ ...S.td, textAlign: "center" }}>
                              <button
                                title={enStock ? "Quitar de stock email" : "Marcar como en stock (email)"}
                                onClick={() => toggleStock(it._key)}
                                style={{ border: enStock ? `1px solid ${C.cyan}55` : `1px solid ${C.b0}`, background: enStock ? `${C.cyan}22` : "transparent", color: enStock ? C.cyan : C.t2, width: 24, height: 24, borderRadius: 5, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", transition: "all .15s" }}
                              >
                                {enStock ? "" : ""}
                              </button>
                            </td>
                            <td style={{ ...S.td, textAlign: "center" }}>
                              <button
                                title={extraKeys.has(it._key) ? "Quitar marca extra" : "Marcar como material extra"}
                                onClick={() => toggleExtra(it._key)}
                                style={{ border: extraKeys.has(it._key) ? `1px solid ${C.amber}55` : `1px solid ${C.b0}`, background: extraKeys.has(it._key) ? `${C.amber}22` : "transparent", color: extraKeys.has(it._key) ? C.amber : C.t2, width: 24, height: 24, borderRadius: 5, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", transition: "all .15s", fontWeight: 700 }}
                              >
                                {extraKeys.has(it._key) ? "E" : ""}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.b0}`, fontSize: 10, color: C.t2, fontFamily: C.sans, display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <span style={{ color: C.violet }}> violeta = incluido en el pedido</span>
                    <span> = excluido del pedido (deseleccioná los que no querés pedir)</span>
                    <span style={{ color: C.cyan }}>STOCK EMAIL = se lista aparte en el email, no se compra</span>
                  </div>
                </div>
              )}

              {/* ── Vista email ── */}
              {vista === "email" && (
                <textarea readOnly value={emailText}
                  style={{ width: "100%", minHeight: 340, background: "rgba(0,0,0,0.4)", border: `1px solid ${C.b0}`, color: C.t0, fontFamily: C.mono, fontSize: 12, padding: "16px", borderRadius: 10, resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.7, marginBottom: 16 }}
                />
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
                <button style={S.btn(C.green, true)} onClick={copiar}>
                  {copiado ? "Copiado" : <><Copy size={12} style={{marginRight:4}}/>Copiar email</>}
                </button>
                <button style={S.btn(C.amber)} onClick={() => setVista(v => v === "tabla" ? "email" : "tabla")}>
                  {vista === "tabla" ? "Vista previa email" : "Volver a editar"}
                </button>
                <button style={S.btn(C.t2)} onClick={() => { if (window.confirm("¿Limpiar stock email?")) setStockKeys(new Set()); }}>
                   Limpiar stock email
                </button>
              </div>
            </>
          )}

          {/* ══ PANEL EXTRAS ══════════════════════════════════════ */}
          <div style={{ border: `1px solid ${C.amber}33`, borderRadius: 12, background: `${C.amber}06`, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.amber, fontFamily: C.sans, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span></span> Agregar ítems al pedido
              <span style={{ fontSize: 11, fontWeight: 400, color: C.t2 }}>— Repair, gelcoats, pintura, o cualquier material extra</span>
            </div>

            {extraItems.length > 0 && (
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {extraItems.map(e => {
                  const mat = materiales.find(m => String(m.id) === String(e.material_id));
                  const yaPedido = pedidosCreados.has(e.uid);
                  return (
                    <div key={e.uid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: yaPedido ? `${C.violet}10` : `${C.amber}0d`, border: `1px solid ${yaPedido ? C.violet : C.amber}33`, borderRadius: 8 }}>
                      {yaPedido && <span style={{ fontSize: 11, color: C.violet, fontWeight: 700 }}> PEDIDO</span>}
                      <span style={{ flex: 1, fontSize: 13, color: C.t0, fontFamily: C.sans, fontWeight: 600 }}>{mat?.nombre ?? "—"}</span>
                      <span style={{ fontFamily: C.mono, fontSize: 13, color: C.amber, fontWeight: 700 }}>{e.cantidad}</span>
                      <span style={{ fontSize: 11, color: C.t2 }}>{mat?.unidad}</span>
                      {!yaPedido && (
                        <button onClick={() => quitarExtra(e.uid)} style={{ border: `1px solid ${C.red}44`, background: `${C.red}12`, color: C.red, borderRadius: 6, cursor: "pointer", padding: "3px 9px", fontSize: 11, fontFamily: C.sans, fontWeight: 700 }}></button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px auto", gap: 8, alignItems: "end" }}>
              <div>
                <label style={S.label}>Material</label>
                <input
                  style={{ ...S.input, marginBottom: 4 }}
                  placeholder=" Filtrar…"
                  value={extraQ}
                  onChange={e => { setExtraQ(e.target.value); setExtraMatId(""); }}
                />
                <select
                  style={S.select}
                  value={extraMat}
                  onChange={e => { setExtraMatId(e.target.value); setExtraQ(e.target.options[e.target.selectedIndex]?.text ?? ""); }}
                >
                  <option value="">— Seleccionar —</option>
                  {matFiltrados.map(m => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Cantidad</label>
                <input
                  style={S.input} type="number" step="0.01" min="0.01"
                  placeholder="0" value={extraCant}
                  onChange={e => setExtraCant(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && agregarExtra()}
                />
              </div>
              <div>
                <button
                  style={{ ...S.btn(C.amber, !!extraMat && !!extraCant && num(extraCant) > 0), height: 36, opacity: (!extraMat || !extraCant || num(extraCant) <= 0) ? 0.4 : 1 }}
                  onClick={agregarExtra}
                  disabled={!extraMat || !extraCant || num(extraCant) <= 0}
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>

          {/* ── Resumen pedidos creados ── */}
          {pedidosCreados.size > 0 && (
            <div style={{ border: `1px solid ${C.violet}33`, background: `${C.violet}0a`, borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, color: C.violet, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: C.sans, fontWeight: 700 }}>
                Pedidos generados en el sistema ({pedidosCreados.size})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[
                  ...itemsConStock.filter(it => pedidosCreados.has(it._key)).map(it => ({
                    label: `${it.descripcion} — ${it._cantidadNecesaria} ${it.unidad}`, key: it._key,
                  })),
                  ...extraItems.filter(e => pedidosCreados.has(e.uid)).map(e => {
                    const mat = materiales.find(m => String(m.id) === String(e.material_id));
                    return { label: `${mat?.nombre ?? "—"} — ${e.cantidad} ${mat?.unidad ?? ""}`, key: e.uid };
                  }),
                ].map(({ label, key }) => (
                  <span key={key} style={{ fontSize: 11, fontFamily: C.sans, background: `${C.violet}18`, color: C.violet, border: `1px solid ${C.violet}33`, borderRadius: 6, padding: "3px 10px" }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal de confirmación ────────────────────────────────── */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(5px)" }}>
          <div style={{ background: "#111113", border: `1px solid ${C.b0}`, borderRadius: 16, padding: 28, width: "min(580px, 94vw)", maxHeight: "85vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.65)" }}>
            <h3 style={{ margin: "0 0 4px", color: C.t0, fontSize: 16, fontFamily: C.sans }}>Confirmar generación de pedidos</h3>
            <p style={{ margin: "0 0 18px", color: C.t1, fontSize: 12, fontFamily: C.sans }}>
              Se van a crear los siguientes ítems en el sistema. El pañolero los verá en "Pedidos pendientes".
            </p>

            {(plantillaLabel || obraNumero) && (
              <div style={{ marginBottom: 14, padding: "8px 12px", background: `${C.blue}12`, border: `1px solid ${C.blue}33`, borderRadius: 8, fontSize: 11, color: C.blue, fontFamily: C.sans }}>
                {plantillaLabel && <span>Plantilla: <b>{plantillaLabel}</b></span>}
                {obraNumero && <span style={{ marginLeft: 10 }}> Obra: <b>{obraNumero}</b></span>}
              </div>
            )}

            <div style={{ border: `1px solid ${C.b0}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.025)" }}>
                    <th style={{ ...S.th, padding: "8px 14px" }}>Material</th>
                    <th style={{ ...S.th, padding: "8px 14px", textAlign: "right" }}>Cantidad</th>
                    <th style={{ ...S.th, padding: "8px 14px", textAlign: "right" }}>Stock actual</th>
                    <th style={{ ...S.th, padding: "8px 14px" }}>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsAGenerar.dePlantilla.map(it => {
                    const esExtra = extraKeys.has(it._key);
                    return (
                    <tr key={it._key} style={{ borderTop: `1px solid rgba(255,255,255,0.04)`, background: esExtra ? `${C.amber}06` : "transparent" }}>
                      <td style={{ ...S.td, padding: "9px 14px", fontWeight: 600, color: C.t0 }}>
                        {esExtra && <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: C.amber, border: `1px solid ${C.amber}44`, background: `${C.amber}18`, borderRadius: 4, padding: "1px 6px", marginRight: 6 }}>Extra</span>}
                        {it.descripcion}
                        <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>{it._mat?.nombre}</div>
                      </td>
                      <td style={{ ...S.td, padding: "9px 14px", textAlign: "right", fontFamily: C.mono, color: C.violet, fontWeight: 700, fontSize: 13 }}>
                        {it._cantidadNecesaria} <span style={{ fontSize: 10, color: C.t2, fontWeight: 400 }}>{it.unidad}</span>
                      </td>
                      <td style={{ ...S.td, padding: "9px 14px", textAlign: "right", fontFamily: C.mono, color: it._stockActual > 0 ? C.green : C.red, fontSize: 12 }}>
                        {it._stockActual ?? "—"}
                      </td>
                      <td style={{ ...S.td, padding: "9px 14px", fontSize: 10, color: C.t2 }}>Plantilla</td>
                    </tr>
                  );
                  })}
                  {itemsAGenerar.deExtras.map(e => {
                    const mat = e._mat;
                    const st  = mat ? num(stockPorMaterial[mat.id] ?? 0) : null;
                    return (
                      <tr key={e.uid} style={{ borderTop: `1px solid rgba(255,255,255,0.04)`, background: `${C.amber}06` }}>
                        <td style={{ ...S.td, padding: "9px 14px", fontWeight: 600, color: C.t0 }}>{mat?.nombre ?? "—"}</td>
                        <td style={{ ...S.td, padding: "9px 14px", textAlign: "right", fontFamily: C.mono, color: C.amber, fontWeight: 700, fontSize: 13 }}>
                          {e.cantidad} <span style={{ fontSize: 10, color: C.t2, fontWeight: 400 }}>{mat?.unidad}</span>
                        </td>
                        <td style={{ ...S.td, padding: "9px 14px", textAlign: "right", fontFamily: C.mono, color: st > 0 ? C.green : C.red, fontSize: 12 }}>
                          {st ?? "—"}
                        </td>
                        <td style={{ ...S.td, padding: "9px 14px", fontSize: 10, color: C.amber, fontWeight: 700 }}>Extra</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ padding: "10px 14px", background: `${C.violet}0d`, border: `1px solid ${C.violet}22`, borderRadius: 8, fontSize: 12, color: C.t1, fontFamily: C.sans, marginBottom: 20 }}>
               Se van a generar <b style={{ color: C.violet }}>{itemsAGenerar.total} pedido{itemsAGenerar.total !== 1 ? "s" : ""}</b> en el sistema
              {itemsAGenerar.dePlantilla.length > 0 && ` — ${itemsAGenerar.dePlantilla.length} de plantilla`}
              {itemsAGenerar.deExtras.length > 0 && ` + ${itemsAGenerar.deExtras.length} extra${itemsAGenerar.deExtras.length !== 1 ? "s" : ""}`}.
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                style={{ border: `1px solid ${C.b0}`, background: "rgba(255,255,255,0.04)", color: C.t1, padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: C.sans }}
                onClick={() => setShowConfirm(false)}
              >
                Cancelar
              </button>
              <button style={S.btn(C.violet, true)} onClick={_ejecutar} disabled={creando}>
                {creando ? "Generando…" : `Confirmar y generar`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
