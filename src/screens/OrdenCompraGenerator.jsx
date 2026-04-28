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
 *   onCrearPedido    — fn(materialId, cantidad, obs) — la misma que usás en ComprasSugeridasPanel
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

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
// Ej: "Resina 101"        → matchea "Resina 101 220l"       ✓
//     "Catalizador"       → matchea "Catalizador (Aperox)"  ✓
//     "airex h80 10mm"    → matchea "AIREX H80 10MM"        ✓
//     "Gel coat blanco"   → matchea "Gel coat blanco iso…"  ✓
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
      {aComprar === 0 && <span style={{ fontSize: 10, color: C.green }}>✓ cubierto</span>}
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
        placeholder="🔍 Buscar en inventario…"
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
        Sí ✓
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function OrdenCompraGenerator({ materiales = [], stockPorMaterial = {}, onCrearPedido }) {
  const [open, setOpen]                     = useState(true);
  const [plantillas, setPlantillas]         = useState([]);
  const [loadingP, setLoadingP]             = useState(true);
  const [plantillaId, setPlantillaId]       = useState("");
  const [plantillaLabel, setPlantillaLabel] = useState("");
  const [obraNumero, setObraNumero]         = useState("");
  const [desmolde, setDesmolde]             = useState("");
  const [items, setItems]                   = useState([]);
  const [loadingItems, setLoadingItems]     = useState(false);
  const [stockKeys, setStockKeys]           = useState(new Set());
  const [copiado, setCopiado]               = useState(false);
  const [vista, setVista]                   = useState("tabla");
  const [pedidosCreados, setPedidosCreados] = useState(new Set());
  const [creando, setCreando]               = useState(null);

  // { [_key]: material_id } — links manuales persistidos por plantilla en localStorage
  const [overrides, setOverrides] = useState({});

  // ── Cargar plantillas ────────────────────────────────────────
  useEffect(() => {
    supabase.from("laminacion_plantillas").select("id, modelo, label").order("label")
      .then(({ data }) => { setPlantillas(data ?? []); setLoadingP(false); });
  }, []);

  // ── Cargar overrides guardados cuando cambia la plantilla ────
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
      try {
        localStorage.setItem(`lam_mat_override_${plantillaId}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  // ── Aplicar plantilla ────────────────────────────────────────
  async function aplicarPlantilla(id) {
    setPlantillaId(id);
    setStockKeys(new Set());
    setItems([]);
    setPedidosCreados(new Set());
    if (!id) { setPlantillaLabel(""); return; }
    const p = plantillas.find(p => String(p.id) === String(id));
    setPlantillaLabel(p?.label ?? "");
    setLoadingItems(true);
    const { data } = await supabase
      .from("laminacion_plantilla_items").select("*")
      .eq("plantilla_id", id).order("orden");
    setItems((data ?? []).map(it => ({
      ...it,
      _key:       String(it.id),
      _cantEdit:  String(it.cantidad),
      _totalEdit: it.total != null ? String(it.total) : "",
    })));
    setLoadingItems(false);
  }

  function toggleStock(key) {
    setStockKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  function updateItem(key, field, value) {
    setItems(prev => prev.map(it => it._key === key ? { ...it, [field]: value } : it));
  }

  // ── Items enriquecidos: override manual > auto-match ─────────
  const itemsConStock = useMemo(() => items.map(it => {
    // 1. Override manual guardado
    const overrideMat = overrides[it._key]
      ? materiales.find(m => String(m.id) === String(overrides[it._key])) ?? null
      : null;

    // 2. Auto-match por nombre
    const { mat: autoMat, score, candidato } = matchMaterialScored(it.descripcion, materiales);

    const mat       = overrideMat ?? autoMat;
    const matchMode = overrideMat ? "manual" : autoMat ? "auto" : "none";

    const stockActual        = mat ? num(stockPorMaterial[mat.id] ?? 0) : null;
    const cantidadNecesaria  = num(it._cantEdit) || num(it.cantidad);
    const aComprar           = stockActual != null ? Math.max(0, cantidadNecesaria - stockActual) : null;

    return {
      ...it,
      _mat:               mat,
      _matchMode:         matchMode,
      _matchScore:        score,
      _candidato:         candidato,
      _stockActual:       stockActual,
      _cantidadNecesaria: cantidadNecesaria,
      _aComprar:          aComprar,
    };
  }), [items, materiales, stockPorMaterial, overrides]);

  const itemsNecesitanCompra = itemsConStock.filter(it =>
    it._mat && it._aComprar != null && it._aComprar > 0 && !stockKeys.has(it._key)
  );

  const sinMatch      = itemsConStock.filter(it => it._matchMode === "none").length;
  const enStockCount  = items.filter(it => stockKeys.has(it._key)).length;
  const totalFaltante = itemsNecesitanCompra.filter(it => !pedidosCreados.has(it._key)).length;

  async function crearPedidoItem(it) {
    if (!onCrearPedido || !it._mat) return;
    setCreando(it._key);
    try {
      const obs = `Generado desde plantilla ${plantillaLabel}${obraNumero ? ` — Obra ${obraNumero}` : ""}`;
      await onCrearPedido(it._mat.id, it._aComprar, obs);
      setPedidosCreados(prev => new Set([...prev, it._key]));
    } finally { setCreando(null); }
  }

  async function crearTodosLosPedidos() {
    for (const it of itemsNecesitanCompra) {
      if (pedidosCreados.has(it._key)) continue;
      await crearPedidoItem(it);
    }
  }

  const itemsParaEmail = useMemo(() =>
    items.map(it => ({
      ...it,
      cantidad: Number(it._cantEdit) || it.cantidad,
      total: it._totalEdit !== "" ? Number(it._totalEdit) : it.total,
    })),
    [items]
  );

  const emailText = useMemo(() =>
    generarEmail({ obraNumero, plantillaLabel, desmolde, items: itemsParaEmail, stockKeys }),
    [obraNumero, plantillaLabel, desmolde, itemsParaEmail, stockKeys]
  );

  function copiar() {
    navigator.clipboard.writeText(emailText).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 2200);
    });
  }

  return (
    <div style={S.section}>

      {/* ── Header ── */}
      <div style={S.header} onClick={() => setOpen(o => !o)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.t0, fontFamily: C.sans }}>Generador de Orden de Compra</span>
          {plantillaLabel && (
            <span style={{ background: `${C.blue}22`, color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
              {plantillaLabel}
            </span>
          )}
          {totalFaltante > 0 && (
            <span style={{ background: `${C.amber}22`, color: C.amber, border: `1px solid ${C.amber}44`, borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
              {totalFaltante} material{totalFaltante !== 1 ? "es" : ""} a pedir
            </span>
          )}
          {enStockCount > 0 && (
            <span style={{ background: `${C.cyan}18`, color: C.cyan, border: `1px solid ${C.cyan}33`, borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
              {enStockCount} en stock
            </span>
          )}
          {sinMatch > 0 && plantillaId && (
            <span style={{ background: `${C.red}18`, color: C.red, border: `1px solid ${C.red}33`, borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, fontFamily: C.sans }}>
              ⚠ {sinMatch} sin vincular
            </span>
          )}
        </div>
        <span style={{ color: C.t2, fontSize: 14 }}>{open ? "▲" : "▼"}</span>
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
              {/* ── Aviso de ítems sin vincular ── */}
              {sinMatch > 0 && (
                <div style={{ marginBottom: 14, padding: "10px 14px", background: `${C.red}0d`, border: `1px solid ${C.red}33`, borderRadius: 9, fontSize: 12, color: C.t1, fontFamily: C.sans }}>
                  <span style={{ color: C.red, fontWeight: 700 }}>⚠ {sinMatch} ítem{sinMatch !== 1 ? "s" : ""} sin vincular al inventario.</span>
                  {" "}Usá el selector debajo de cada uno para vincularlo manualmente. La selección se guarda automáticamente para esta plantilla.
                </div>
              )}

              {/* ── Tabs ── */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {["tabla", "email"].map(v => (
                  <button key={v} style={S.btn(vista === v ? C.blue : C.t2, vista === v)} onClick={() => setVista(v)}>
                    {v === "tabla" ? "✏️  Editar lista" : "📧  Vista email"}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                {onCrearPedido && totalFaltante > 0 && (
                  <button style={S.btn(C.violet, true)} onClick={crearTodosLosPedidos} disabled={creando !== null}>
                    {creando ? "Creando…" : `📦 Pedir los ${totalFaltante} materiales faltantes`}
                  </button>
                )}
              </div>

              {/* ── Vista tabla ── */}
              {vista === "tabla" && (
                <div style={{ border: `1px solid ${C.b0}`, borderRadius: 10, overflow: "auto", marginBottom: 16 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                        <th style={{ ...S.th, width: 36 }}>Stock<br />manual</th>
                        <th style={S.th}>Material</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Necesario</th>
                        <th style={S.th}>Bulto</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Total</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Stock actual</th>
                        <th style={{ ...S.th, textAlign: "center" }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsConStock.map(it => {
                        const enStock    = stockKeys.has(it._key);
                        const yaPedido   = pedidosCreados.has(it._key);
                        const puedeUndir = onCrearPedido && it._mat && it._aComprar > 0 && !yaPedido && !enStock;

                        const rowBg = yaPedido
                          ? "rgba(167,139,250,0.07)"
                          : enStock
                          ? "rgba(14,165,233,0.06)"
                          : it._matchMode === "none"
                          ? "rgba(255,69,58,0.04)"
                          : "transparent";

                        return (
                          <tr key={it._key} style={{ background: rowBg, opacity: enStock ? 0.55 : 1, transition: "all .15s" }}>

                            {/* Toggle stock manual */}
                            <td style={{ ...S.td, textAlign: "center" }}>
                              <button
                                title={enStock ? "Quitar de stock" : "Marcar como en stock"}
                                onClick={() => toggleStock(it._key)}
                                style={{ border: enStock ? `1px solid ${C.cyan}55` : `1px solid ${C.b0}`, background: enStock ? `${C.cyan}22` : "transparent", color: enStock ? C.cyan : C.t2, width: 26, height: 26, borderRadius: 6, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", transition: "all .15s" }}
                              >
                                {enStock ? "✓" : "·"}
                              </button>
                            </td>

                            {/* Nombre + estado del vínculo */}
                            <td style={{ ...S.td, fontWeight: 600, color: enStock ? C.t2 : C.t0, maxWidth: 280 }}>
                              {enStock  && <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: C.cyan,   border: `1px solid ${C.cyan}44`,   background: `${C.cyan}15`,   borderRadius: 4, padding: "1px 5px", marginRight: 7, fontWeight: 700 }}>STOCK</span>}
                              {yaPedido && <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: C.violet, border: `1px solid ${C.violet}44`, background: `${C.violet}15`, borderRadius: 4, padding: "1px 5px", marginRight: 7, fontWeight: 700 }}>PEDIDO ✓</span>}

                              {/* Nombre de la plantilla */}
                              {it.descripcion}

                              {/* ✅ Match automático */}
                              {it._matchMode === "auto" && (
                                <div style={{ fontSize: 10, color: C.green, marginTop: 3, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ opacity: 0.4 }}>↳</span>
                                  <span>{it._mat.nombre}</span>
                                  <span
                                    title="Cambiar vínculo"
                                    style={{ cursor: "pointer", color: C.t2, fontSize: 11, marginLeft: 2 }}
                                    onClick={e => { e.stopPropagation(); saveOverride(it._key, "__reset__"); }}
                                  >
                                    ✎
                                  </span>
                                </div>
                              )}

                              {/* 🔵 Override manual activo */}
                              {it._matchMode === "manual" && (
                                <div style={{ fontSize: 10, color: C.cyan, marginTop: 3, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ opacity: 0.4 }}>↳</span>
                                  <span>{it._mat.nombre}</span>
                                  <span
                                    title="Quitar vínculo manual"
                                    style={{ cursor: "pointer", color: C.t2, fontSize: 12, marginLeft: 2 }}
                                    onClick={e => { e.stopPropagation(); saveOverride(it._key, null); }}
                                  >
                                    ✕
                                  </span>
                                </div>
                              )}

                              {/* ❌ Sin match → picker */}
                              {(it._matchMode === "none" || overrides[it._key] === "__reset__") && (
                                <>
                                  {it._matchMode === "none" && (
                                    <div style={{ fontSize: 10, color: C.red, marginTop: 3 }}>⚠ sin match en inventario</div>
                                  )}
                                  <CandidatoBadge
                                    candidato={it._candidato}
                                    score={it._matchScore}
                                    onAceptar={matId => saveOverride(it._key, matId)}
                                  />
                                  <MaterialPicker
                                    materiales={materiales}
                                    value={""}
                                    onChange={matId => saveOverride(it._key, matId)}
                                  />
                                </>
                              )}
                            </td>

                            {/* Necesario (editable) */}
                            <td style={{ ...S.td, textAlign: "right" }}>
                              <input type="number" min="0" step="1"
                                style={{ ...S.input, width: 60, textAlign: "right", fontFamily: C.mono, fontSize: 12, padding: "4px 8px" }}
                                value={it._cantEdit}
                                onChange={e => updateItem(it._key, "_cantEdit", e.target.value)}
                              />
                            </td>

                            {/* Bulto */}
                            <td style={{ ...S.td, color: C.t1, fontFamily: C.mono, fontSize: 11 }}>{it.unidad}</td>

                            {/* Total (editable) */}
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

                            {/* Stock actual */}
                            <td style={{ ...S.td, textAlign: "right" }}>
                              <StockBadge stockActual={it._stockActual} cantidadNecesaria={it._cantidadNecesaria} />
                            </td>

                            {/* Acción */}
                            <td style={{ ...S.td, textAlign: "center" }}>
                              {yaPedido ? (
                                <span style={{ fontSize: 11, color: C.violet, fontFamily: C.sans }}>✓ creado</span>
                              ) : puedeUndir ? (
                                <button style={S.btnSm(C.violet, true)} disabled={creando === it._key} onClick={() => crearPedidoItem(it)}>
                                  {creando === it._key ? "…" : `📦 Pedir ${it._aComprar}`}
                                </button>
                              ) : it._aComprar === 0 && it._mat ? (
                                <span style={{ fontSize: 11, color: C.green, fontFamily: C.sans }}>✓ hay stock</span>
                              ) : it._matchMode === "none" ? (
                                <span style={{ fontSize: 11, color: C.red, fontFamily: C.sans }}>vinculá primero</span>
                              ) : (
                                <span style={{ fontSize: 11, color: C.t2, fontFamily: C.sans }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Leyenda */}
                  <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.b0}`, fontSize: 10, color: C.t2, fontFamily: C.sans, display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <span>· = marcar como en stock (excluye del email)</span>
                    <span>📦 = crear pedido descontando stock actual</span>
                    <span style={{ color: C.green }}>↳ verde = match automático</span>
                    <span style={{ color: C.cyan }}>↳ celeste = vínculo manual (guardado)</span>
                    <span style={{ color: C.red }}>⚠ rojo = sin vincular, seleccioná manualmente</span>
                  </div>
                </div>
              )}

              {/* ── Vista email ── */}
              {vista === "email" && (
                <textarea readOnly value={emailText}
                  style={{ width: "100%", minHeight: 340, background: "rgba(0,0,0,0.4)", border: `1px solid ${C.b0}`, color: C.t0, fontFamily: C.mono, fontSize: 12, padding: "16px", borderRadius: 10, resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.7, marginBottom: 16 }}
                />
              )}

              {/* ── Acciones principales ── */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button style={S.btn(C.green, true)} onClick={copiar}>
                  {copiado ? "✅ ¡Copiado!" : "📋 Copiar email"}
                </button>
                <button style={S.btn(C.amber)} onClick={() => setVista(v => v === "tabla" ? "email" : "tabla")}>
                  {vista === "tabla" ? "👁 Vista previa email" : "✏️ Volver a editar"}
                </button>
                <button style={S.btn(C.t2)} onClick={() => { if (window.confirm("¿Limpiar selección de stock?")) setStockKeys(new Set()); }}>
                  🔄 Limpiar stock marcado
                </button>
                <div style={{ flex: 1 }} />
                {enStockCount > 0 && (
                  <span style={{ fontSize: 11, color: C.cyan, fontFamily: C.sans }}>
                    {enStockCount} ítem{enStockCount !== 1 ? "s" : ""} en stock listados aparte
                  </span>
                )}
              </div>

              {/* ── Chips stock marcado ── */}
              {enStockCount > 0 && (
                <div style={{ marginTop: 16, border: `1px solid ${C.cyan}33`, background: `${C.cyan}0a`, borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 10, color: C.cyan, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: C.sans, fontWeight: 700 }}>En stock — no se compran</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {items.filter(it => stockKeys.has(it._key)).map(it => (
                      <span key={it._key} style={{ fontSize: 11, fontFamily: C.sans, background: `${C.cyan}18`, color: C.cyan, border: `1px solid ${C.cyan}33`, borderRadius: 6, padding: "3px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                        {it.descripcion}
                        <span style={{ cursor: "pointer", opacity: 0.7, fontSize: 13 }} onClick={() => toggleStock(it._key)} title="Quitar">×</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Resumen pedidos creados ── */}
              {pedidosCreados.size > 0 && (
                <div style={{ marginTop: 12, border: `1px solid ${C.violet}33`, background: `${C.violet}0a`, borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 10, color: C.violet, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: C.sans, fontWeight: 700 }}>
                    Pedidos creados en el sistema ({pedidosCreados.size})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {itemsConStock.filter(it => pedidosCreados.has(it._key)).map(it => (
                      <span key={it._key} style={{ fontSize: 11, fontFamily: C.sans, background: `${C.violet}18`, color: C.violet, border: `1px solid ${C.violet}33`, borderRadius: 6, padding: "3px 10px" }}>
                        {it.descripcion} — {it._aComprar} {it.total_unidad !== "unid" ? it.total_unidad : "unid"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
