import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Boxes, ChevronRight, ClipboardList, Inbox, Layers, Loader2, Package,
  PackageSearch, Plus, RefreshCw, Search, Ship, Trash2, X,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { fetchPanolCatalogMini } from "@/features/panol/panolApi";
import {
  actualizarEstadoPedido,
  actualizarItemPedido,
  actualizarMaterialReceta,
  agregarMaterialReceta,
  borrarPedido,
  fetchEtapasModelo,
  fetchMaterialesDeModelo,
  fetchModelos,
  fetchObras,
  fetchPedidosActivosDeObra,
  fetchPedidosProduccion,
  fetchRecetaPorProcesos,
  generarPedidoPorEtapa,
  ITEM_ESTADOS,
  PEDIDO_ESTADOS,
  quitarMaterialReceta,
} from "@/features/produccion/comprasEtapasApi";

/* ── tokens visuales ──────────────────────────────────────────────────────── */
const GRAD_VIOLET = "linear-gradient(135deg,#8b5cf6 0%,#6366f1 55%,#3b82f6 100%)";
const GRAD_BLUE = "linear-gradient(135deg,#3b82f6 0%,#2563eb 100%)";
const GLOW_VIOLET = "0 8px 22px -8px rgba(124,92,246,.55)";
const GLOW_BLUE = "0 6px 16px -6px rgba(37,99,235,.5)";

const input = {
  width: "100%", boxSizing: "border-box", background: C.panelSolid,
  border: `1px solid ${C.border}`, color: C.text, borderRadius: 10,
  padding: "9px 11px", fontSize: 13, fontFamily: C.sans, outline: "none",
};
const LBL = { fontSize: 10, color: C.dim, fontWeight: 850, letterSpacing: 0.7, textTransform: "uppercase" };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const tint = (hex, a) => {
  const h = String(hex || "#64748b").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a / 100})`;
};

/* ── estado vacío atractivo (icono grande semitransparente + copy) ────────── */
function EmptyState({ icon, title, subtitle, accent = "#8b5cf6" }) {
  const Icon = icon;
  return (
    <div style={{
      display: "grid", placeItems: "center", textAlign: "center", gap: 7, padding: "44px 22px",
      background: `radial-gradient(120% 100% at 50% 0%, ${tint(accent, 7)}, transparent 70%), ${C.panel}`,
      border: `1px dashed ${C.border2}`, borderRadius: 18,
    }}>
      <div style={{
        width: 66, height: 66, borderRadius: 20, display: "grid", placeItems: "center", marginBottom: 2,
        background: `linear-gradient(145deg, ${tint(accent, 18)}, ${tint(accent, 5)})`,
        border: `1px solid ${tint(accent, 22)}`, color: accent,
      }}>
        <Icon size={30} strokeWidth={1.6} style={{ opacity: 0.92 }} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 850, color: C.text }}>{title}</div>
      <div style={{ fontSize: 12.5, color: C.dim, maxWidth: 360, lineHeight: 1.55 }}>{subtitle}</div>
    </div>
  );
}

/* ── selector de estado (chip-dropdown) ───────────────────────────────────── */
function EstadoSelect({ value, options, onChange, disabled }) {
  const st = options.find((o) => o.value === value) || options[0];
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "4px 9px", borderRadius: 8, fontSize: 11, fontWeight: 800, letterSpacing: 0.2,
        border: `1px solid ${st.color}40`, background: `${st.color}16`, color: st.color,
        cursor: disabled ? "default" : "pointer", outline: "none",
        boxShadow: `inset 0 0 0 1px ${st.color}0d`,
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value} style={{ color: "#111", background: "#fff" }}>{o.label}</option>)}
    </select>
  );
}

/* ── modal Spotlight para elegir un material del catálogo ─────────────────── */
// Se monta sólo cuando está abierto (el padre hace `{picker && <MaterialPickerModal/>}`),
// así arranca con q vacío sin necesitar un effect que resetee estado.
// Si `matriz` tiene materiales, el selector filtra LOCALMENTE sobre la matriz del modelo
// (lo que el barco realmente lleva). Si no hay matriz, cae al buscador del catálogo.
function MaterialPickerModal({ onClose, onPick, yaEnReceta, matriz }) {
  const desdeMatriz = Array.isArray(matriz) && matriz.length > 0;
  const [q, setQ] = useState("");
  const [serverRows, setServerRows] = useState([]);
  const [loading, setLoading] = useState(!desdeMatriz);
  const boxRef = useRef(null);

  useEffect(() => {
    if (desdeMatriz) return undefined; // en modo matriz no consultamos el server
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetchPanolCatalogMini({ q, limit: 40 });
        if (alive) setServerRows(res ?? []);
      } catch { if (alive) setServerRows([]); }
      finally { if (alive) setLoading(false); }
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q, desdeMatriz]);

  // El filtrado sobre la matriz es sincrónico (useMemo) para no meter setState en effect.
  const rows = useMemo(() => {
    if (!desdeMatriz) return serverRows;
    const term = q.trim().toLowerCase();
    if (!term) return matriz;
    return matriz.filter((m) => `${m.descripcion} ${m.codigo} ${m.proveedor}`.toLowerCase().includes(term));
  }, [desdeMatriz, matriz, serverRows, q]);

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === boxRef.current) onClose(); }}
      ref={boxRef}
      className="ce-scrim"
      style={{
        position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "center",
        alignItems: "flex-start", padding: "12vh 16px 16px",
        background: "rgba(8,8,12,0.44)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        className="ce-spot"
        style={{
          width: "min(600px, 100%)", maxHeight: "72vh", display: "flex", flexDirection: "column", overflow: "hidden",
          background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 18,
          boxShadow: "0 32px 70px -20px var(--shadow-strong), 0 8px 24px -12px var(--shadow)",
        }}
      >
        {/* barra de búsqueda grande tipo Spotlight */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 12px 6px 18px", borderBottom: `1px solid ${C.border}` }}>
          <Search size={20} color={C.dim} style={{ flexShrink: 0 }} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={desdeMatriz ? "Buscar en la matriz del modelo…" : "Buscar en el catálogo completo…"}
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 16, fontWeight: 600, fontFamily: C.sans, padding: "14px 0" }}
          />
          {desdeMatriz && <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 850, color: C.violet, background: C.violetL, border: `1px solid ${C.violetB}`, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>Matriz del modelo</span>}
          <button type="button" onClick={onClose} className="ce-close" style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, border: "none", background: C.panel2, color: C.dim, cursor: "pointer" }}><X size={16} /></button>
        </div>

        <div style={{ overflowY: "auto", padding: 8, minHeight: 120 }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, color: C.dim, padding: "34px 14px", fontSize: 13 }}>
              <Loader2 size={16} className="spin" /> Buscando en el catálogo…
            </div>
          )}
          {!loading && !rows.length && (
            <div style={{ display: "grid", placeItems: "center", gap: 8, textAlign: "center", padding: "30px 14px", color: C.dim }}>
              <PackageSearch size={38} strokeWidth={1.5} style={{ opacity: 0.4 }} />
              <div style={{ fontSize: 13, fontWeight: 700 }}>Sin resultados</div>
              <div style={{ fontSize: 12 }}>Probá con otra palabra o parte del código.</div>
            </div>
          )}
          {!loading && rows.map((m) => {
            const ya = yaEnReceta?.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                disabled={ya}
                onClick={() => onPick(m)}
                style={{
                  width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 11,
                  padding: "10px 11px", borderRadius: 11, border: `1px solid ${ya ? C.greenB : "transparent"}`,
                  background: ya ? C.greenL : "transparent", cursor: ya ? "default" : "pointer", marginBottom: 3,
                  transition: "background .13s ease",
                }}
                onMouseEnter={(e) => { if (!ya) e.currentTarget.style.background = C.panel2; }}
                onMouseLeave={(e) => { if (!ya) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: "grid", placeItems: "center", background: ya ? C.greenL : C.panel, color: ya ? C.green : C.dim, border: `1px solid ${ya ? C.greenB : C.border}` }}>
                  <Package size={16} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: C.text, fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.descripcion}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                    {m.codigo && <span style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>{m.codigo}</span>}
                    {m.proveedor && <span style={{ color: C.dim, fontSize: 11 }}>· {m.proveedor}</span>}
                    <span style={{ color: C.dim, fontSize: 11 }}>· {m.unidad}</span>
                  </div>
                </div>
                {ya
                  ? <span style={{ flexShrink: 0, color: C.green, fontSize: 11, fontWeight: 800 }}>✓ Ya está</span>
                  : <span style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 8, background: tint("#3b82f6", 14), color: C.blue }}><Plus size={15} /></span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── una etapa del modelo con su receta ───────────────────────────────────── */
function EtapaRecetaCard({ etapa, materiales, matriz, onReload, toast }) {
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const color = etapa.color || "#64748b";
  const yaEnReceta = useMemo(() => new Set(materiales.map((m) => m.material_id)), [materiales]);

  async function pick(m) {
    try {
      // Si viene de la matriz, arrancamos con la cantidad que el modelo ya define en su BOM.
      await agregarMaterialReceta(etapa.id, m, { cantidad: num(m.cantidad) || 1, unidad: m.unidad });
      setPicker(false);
      setOpen(true); // abrir la etapa para que se vea el material recién agregado
      onReload();
    } catch (err) { toast?.error(err.message || "No se pudo agregar."); }
  }
  async function setCant(row, val) {
    try { await actualizarMaterialReceta(row.id, { cantidad: val }); onReload(); }
    catch (err) { toast?.error(err.message); }
  }
  async function quitar(row) {
    try { await quitarMaterialReceta(row.id); onReload(); }
    catch (err) { toast?.error(err.message); }
  }

  return (
    <div className="ce-surface ce-card" style={{ overflow: "hidden" }}>
      {/* Encabezado: el "+ Agregar" va SIEMPRE visible acá, no escondido tras desplegar. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* barra de acento vertical con gradiente del color de la etapa */}
        <div style={{ alignSelf: "stretch", width: 4, flexShrink: 0, background: `linear-gradient(to bottom, ${color}, ${tint(color, 35)})` }} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: "12px 6px 12px 10px", background: "transparent", border: "none", cursor: "pointer" }}
        >
          <ChevronRight size={16} color={C.dim} style={{ flexShrink: 0, transition: "transform .2s cubic-bezier(.4,0,.2,1)", transform: open ? "rotate(90deg)" : "none" }} />
          <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, display: "grid", placeItems: "center", background: tint(color, 15), border: `1px solid ${tint(color, 24)}`, color }}>
            <Layers size={15} />
          </span>
          <div style={{ fontWeight: 800, color: C.text, fontSize: 14, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{etapa.nombre}</div>
        </button>
        <span style={{
          flexShrink: 0, fontSize: 11, fontWeight: 850, minWidth: 24, textAlign: "center",
          color: materiales.length ? C.blue : C.dim,
          background: materiales.length ? C.blueL : C.panel,
          border: `1px solid ${materiales.length ? C.blueB : C.border}`, borderRadius: 999, padding: "3px 9px",
        }}>
          {materiales.length}
        </span>
        <button
          type="button"
          onClick={() => { setOpen(true); setPicker(true); }}
          className="ce-cta"
          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: GRAD_BLUE, color: "#fff", borderRadius: 9, padding: "7px 13px", marginRight: 12, cursor: "pointer", fontSize: 12.5, fontWeight: 800, boxShadow: GLOW_BLUE }}
        >
          <Plus size={15} /> Agregar
        </button>
      </div>

      {open && (
        <div style={{ padding: "10px 14px 14px", borderTop: `1px solid ${C.border}`, background: `linear-gradient(180deg, ${tint(color, 4)}, transparent 60px)` }}>
          {materiales.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.dim, fontSize: 12.5, padding: "6px 2px" }}>
              <PackageSearch size={20} strokeWidth={1.6} style={{ opacity: 0.5, flexShrink: 0 }} />
              <span>Sin materiales todavía. Tocá <b style={{ color: C.blue }}>+ Agregar</b> para cargar lo que lleva esta etapa.</span>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 5 }}>
              {materiales.map((row) => (
                <div key={row.id} className="ce-row" style={{ display: "grid", gridTemplateColumns: "auto 1fr 90px auto 30px", gap: 9, alignItems: "center", padding: "7px 9px", borderRadius: 10, border: `1px solid ${C.border}` }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, display: "grid", placeItems: "center", background: C.panel2, color: C.dim, flexShrink: 0 }}><Package size={13} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.material?.descripcion || "—"}</div>
                    {row.material?.codigo && <div style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>{row.material.codigo}</div>}
                  </div>
                  <input
                    value={row.cantidad ?? ""}
                    inputMode="decimal"
                    onChange={(e) => setCant(row, e.target.value)}
                    style={{ ...input, padding: "6px 9px", fontSize: 12, fontFamily: C.mono, textAlign: "right", borderRadius: 8 }}
                  />
                  <span style={{ color: C.dim, fontSize: 12, minWidth: 40 }}>{row.unidad || row.material?.unidad_medida || "u"}</span>
                  <button type="button" title="Quitar" onClick={() => quitar(row)} className="ce-ghost" style={{ width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 8, border: "none", background: "transparent", color: C.red, cursor: "pointer" }}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {picker && <MaterialPickerModal onClose={() => setPicker(false)} onPick={pick} yaEnReceta={yaEnReceta} matriz={matriz} />}
    </div>
  );
}

/* ── TAB 1: Recetas (config Ingeniería/Técnica) ───────────────────────────── */
function RecetaTab({ isMobile, toast }) {
  const [modelos, setModelos] = useState([]);
  const [modeloId, setModeloId] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [receta, setReceta] = useState([]);
  const [matriz, setMatriz] = useState([]); // materiales del modelo (BOM) para el selector
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchModelos().then((m) => {
      setModelos(m);
      setModeloId((cur) => cur ?? m[0]?.id ?? null);
    }).catch(() => setModelos([]));
  }, []);

  const cargarModelo = useCallback(async (id) => {
    if (!id) { setEtapas([]); setReceta([]); setMatriz([]); return; }
    setLoading(true);
    try {
      const nombre = modelos.find((m) => m.id === id)?.nombre || "";
      const es = await fetchEtapasModelo(id);
      const rec = await fetchRecetaPorProcesos(es.map((e) => e.id));
      const mats = await fetchMaterialesDeModelo(nombre);
      setEtapas(es);
      setReceta(rec);
      setMatriz(mats);
    } catch (err) { toast?.error(err.message); }
    finally { setLoading(false); }
  }, [toast, modelos]);

  useEffect(() => { cargarModelo(modeloId); }, [modeloId, cargarModelo]);

  const matDeEtapa = useCallback((etapaId) => receta.filter((r) => r.linea_proceso_id === etapaId), [receta]);
  const modeloActual = modelos.find((m) => m.id === modeloId);
  const totalMat = receta.length;

  return (
    <div style={{ display: "flex", gap: 16, height: "100%", minHeight: 0, flexDirection: isMobile ? "column" : "row" }}>
      {/* modelos */}
      <div className="ce-surface" style={{ width: isMobile ? "auto" : 216, flexShrink: 0, padding: 10, overflowY: "auto", maxHeight: isMobile ? 120 : "100%" }}>
        <div style={{ ...LBL, padding: "4px 8px 8px" }}>Modelos</div>
        <div style={{ display: isMobile ? "flex" : "grid", gap: 5, flexWrap: "wrap" }}>
          {modelos.map((m) => {
            const active = m.id === modeloId;
            const mc = m.color || "#7c93ff";
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModeloId(m.id)}
                className={active ? "" : "ce-model"}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 11, textAlign: "left",
                  border: `1px solid ${active ? tint(mc, 42) : "transparent"}`,
                  background: active ? `linear-gradient(135deg, ${tint(mc, 20)}, ${tint(mc, 6)})` : "transparent",
                  color: active ? C.text : C.dim, cursor: "pointer", fontWeight: 800, fontSize: 13,
                  boxShadow: active ? `0 3px 12px -5px ${tint(mc, 45)}` : "none",
                  transition: "all .15s ease",
                }}
              >
                <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, display: "grid", placeItems: "center", background: active ? tint(mc, 24) : C.panel, color: mc, border: `1px solid ${active ? tint(mc, 30) : C.border}` }}>
                  <Ship size={14} />
                </span>
                {m.nombre}
              </button>
            );
          })}
        </div>
      </div>

      {/* etapas + receta */}
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", display: "grid", gap: 11, alignContent: "start", paddingRight: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>Receta de {modeloActual?.nombre || "—"}</div>
          <div style={{ fontSize: 12, color: C.dim }}>
            {matriz.length > 0
              ? `elegís de la matriz del modelo · ${matriz.length} materiales`
              : "el modelo no tiene matriz — elegís del catálogo"}
          </div>
          {totalMat > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: C.violet, background: C.violetL, border: `1px solid ${C.violetB}`, borderRadius: 999, padding: "3px 11px" }}>
              {totalMat} {totalMat === 1 ? "material cargado" : "materiales cargados"}
            </span>
          )}
        </div>
        {loading && <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.dim, fontSize: 13, padding: 6 }}><Loader2 size={16} className="spin" /> Cargando receta…</div>}
        {!loading && !etapas.length && (
          <EmptyState
            icon={Layers}
            title="Este modelo todavía no tiene etapas"
            subtitle="Armá primero las etapas del proceso en Obras → ⚙ de la línea. Después volvés acá y les cargás los materiales."
            accent="#8b5cf6"
          />
        )}
        {!loading && etapas.map((e) => (
          <EtapaRecetaCard key={e.id} etapa={e} materiales={matDeEtapa(e.id)} matriz={matriz} onReload={() => cargarModelo(modeloId)} toast={toast} />
        ))}
      </div>
    </div>
  );
}

/* ── panel de generación: obra → etapas → generar ─────────────────────────── */
function GenerarPanel({ onGenerado, toast }) {
  const [obras, setObras] = useState([]);
  const [obraId, setObraId] = useState("");
  const [etapas, setEtapas] = useState([]);
  const [receta, setReceta] = useState([]);
  const [existentes, setExistentes] = useState({}); // linea_proceso_id -> pedido
  const [busy, setBusy] = useState(null);

  useEffect(() => { fetchObras().then(setObras).catch(() => setObras([])); }, []);

  const obra = obras.find((o) => o.id === obraId);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!obra?.linea_id) { setEtapas([]); setReceta([]); setExistentes({}); return; }
      try {
        const es = await fetchEtapasModelo(obra.linea_id);
        const rec = await fetchRecetaPorProcesos(es.map((e) => e.id));
        const pedidosObra = await fetchPedidosActivosDeObra(obra.id);
        const ex = {};
        for (const p of pedidosObra) if (!ex[p.linea_proceso_id]) ex[p.linea_proceso_id] = p;
        if (alive) { setEtapas(es); setReceta(rec); setExistentes(ex); }
      } catch { if (alive) { setEtapas([]); setReceta([]); setExistentes({}); } }
    }
    load();
    return () => { alive = false; };
  }, [obra]);

  async function generar(etapa) {
    const yaTiene = existentes[etapa.id];
    if (yaTiene && !window.confirm(`Ya hay un pedido para "${etapa.nombre}" de este casco (${yaTiene.estado}).\n\n¿Generar otro igual?`)) return;
    setBusy(etapa.id);
    try {
      const { cantidad } = await generarPedidoPorEtapa(obra, etapa);
      toast?.success(`Pedido generado: ${cantidad} ${cantidad === 1 ? "material" : "materiales"} de "${etapa.nombre}".`);
      setExistentes((prev) => ({ ...prev, [etapa.id]: { estado: "pendiente" } }));
      onGenerado?.();
    } catch (err) { toast?.error(err.message || "No se pudo generar el pedido."); }
    finally { setBusy(null); }
  }

  const countRec = (etapaId) => receta.filter((r) => r.linea_proceso_id === etapaId).length;

  return (
    <div className="ce-surface" style={{ padding: 16, background: `radial-gradient(140% 120% at 100% 0%, ${tint("#8b5cf6", 7)}, transparent 55%), var(--panel-solid)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: GRAD_VIOLET, color: "#fff", boxShadow: GLOW_VIOLET }}>
          <Ship size={17} />
        </span>
        <div>
          <div style={{ fontWeight: 900, color: C.text, fontSize: 14.5 }}>Generar pedido de una etapa</div>
          <div style={{ fontSize: 11.5, color: C.dim }}>Elegí un casco y disparás el pedido de los materiales de esa etapa.</div>
        </div>
      </div>
      <div style={{ maxWidth: 440, marginBottom: 14 }}>
        <label style={LBL}>Casco en producción</label>
        <select value={obraId} onChange={(e) => setObraId(e.target.value)} style={{ ...input, cursor: "pointer", marginTop: 5 }}>
          <option value="">— Elegí un casco —</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>{o.codigo || o.descripcion || o.id.slice(0, 8)}{o.linea_nombre ? ` · ${o.linea_nombre}` : ""}</option>
          ))}
        </select>
      </div>

      {!obra && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.dim, fontSize: 12.5, padding: "10px 12px", borderRadius: 12, background: C.panel, border: `1px dashed ${C.border2}` }}>
          <Ship size={18} strokeWidth={1.6} style={{ opacity: 0.5 }} /> Elegí un casco arriba para ver sus etapas y generar el pedido.
        </div>
      )}
      {obra && !etapas.length && <div style={{ color: C.dim, fontSize: 13 }}>Este casco no tiene un modelo con etapas asociado.</div>}

      {obra && etapas.length > 0 && (
        <div style={{ display: "grid", gap: 7 }}>
          {etapas.map((e) => {
            const n = countRec(e.id);
            const ya = existentes[e.id];
            const ec = e.color || "#64748b";
            return (
              <div key={e.id} className="ce-row" style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.border}` }}>
                <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, display: "grid", placeItems: "center", background: tint(ec, 15), border: `1px solid ${tint(ec, 24)}`, color: ec }}>
                  <Layers size={15} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 13.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.nombre}</div>
                  <div style={{ color: n ? C.dim : C.red, fontSize: 11, fontWeight: n ? 500 : 700 }}>{n ? `${n} ${n === 1 ? "material" : "materiales"} en la receta` : "sin receta cargada"}</div>
                </div>
                {ya && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: C.green, background: C.greenL, border: `1px solid ${C.greenB}`, borderRadius: 999, padding: "3px 10px" }}>✓ Generado</span>}
                <button
                  type="button"
                  disabled={!n || busy === e.id}
                  onClick={() => generar(e)}
                  className="ce-cta"
                  style={{
                    flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 10, padding: "9px 15px",
                    border: "none", cursor: !n || busy === e.id ? "default" : "pointer", fontSize: 12.5, fontWeight: 850,
                    background: !n ? C.panel2 : GRAD_VIOLET, color: !n ? C.dim : "#fff",
                    boxShadow: !n ? "none" : GLOW_VIOLET,
                  }}
                >
                  {busy === e.id ? <Loader2 size={14} className="spin" /> : <ClipboardList size={14} />}
                  {ya ? "Generar de nuevo" : "Generar pedido"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── una tarjeta de pedido de producción ──────────────────────────────────── */
function PedidoCard({ pedido, onReload, toast }) {
  const [open, setOpen] = useState(false);
  const items = pedido.items ?? [];
  const recibidos = items.filter((i) => i.estado === "recibido").length;
  const pct = items.length ? Math.round((recibidos / items.length) * 100) : 0;

  async function setItemEstado(item, estado) {
    try { await actualizarItemPedido(item.id, { estado }); onReload(); }
    catch (err) { toast?.error(err.message); }
  }
  async function setPedidoEstado(estado) {
    try { await actualizarEstadoPedido(pedido.id, estado); onReload(); }
    catch (err) { toast?.error(err.message); }
  }
  async function borrar() {
    if (!window.confirm(`¿Borrar el pedido "${pedido.titulo}"? No se puede deshacer.`)) return;
    try { await borrarPedido(pedido.id); onReload(); }
    catch (err) { toast?.error(err.message); }
  }

  return (
    <div className="ce-surface ce-card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px" }}>
        <button type="button" onClick={() => setOpen((v) => !v)} className="ce-ghost" style={{ flexShrink: 0, width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 8, border: "none", background: C.panel, cursor: "pointer" }}>
          <ChevronRight size={16} color={C.dim} style={{ transition: "transform .2s cubic-bezier(.4,0,.2,1)", transform: open ? "rotate(90deg)" : "none" }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pedido.titulo}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <div style={{ width: 84, height: 5, borderRadius: 999, background: C.panel2, overflow: "hidden", flexShrink: 0 }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: pct === 100 ? C.green : GRAD_BLUE, transition: "width .3s ease" }} />
            </div>
            <div style={{ color: C.dim, fontSize: 11.5 }}>
              {recibidos}/{items.length} recibidos · {new Date(pedido.created_at).toLocaleDateString("es-AR")}
            </div>
          </div>
        </div>
        <EstadoSelect value={pedido.estado} options={PEDIDO_ESTADOS} onChange={setPedidoEstado} />
        <button type="button" title="Borrar" onClick={borrar} className="ce-ghost" style={{ flexShrink: 0, width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 8, border: "none", background: "transparent", color: C.dim, cursor: "pointer" }}><Trash2 size={15} /></button>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 14px 12px", display: "grid", gap: 5 }}>
          {items.map((it) => (
            <div key={it.id} className="ce-row" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 10, alignItems: "center", padding: "7px 9px", borderRadius: 10, border: `1px solid ${C.border}` }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, display: "grid", placeItems: "center", background: C.panel2, color: C.dim, flexShrink: 0 }}><Package size={13} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.descripcion}</div>
                {it.codigo && <span style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>{it.codigo}</span>}
              </div>
              <span style={{ color: C.dim, fontSize: 12, fontFamily: C.mono }}>{num(it.cantidad)} {it.unidad || "u"}</span>
              <EstadoSelect value={it.estado} options={ITEM_ESTADOS} onChange={(v) => setItemEstado(it, v)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── TAB 2: Pedidos (generar + seguimiento) ───────────────────────────────── */
function PedidosTab({ toast }) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try { setPedidos(await fetchPedidosProduccion()); }
    catch (err) { toast?.error(err.message); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div style={{ display: "grid", gap: 16, overflowY: "auto", height: "100%", alignContent: "start", paddingRight: 2 }}>
      <GenerarPanel onGenerado={cargar} toast={toast} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>Pedidos de producción</div>
        {pedidos.length > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: C.dim, background: C.panel2, borderRadius: 999, padding: "3px 10px" }}>{pedidos.length}</span>}
        <button type="button" onClick={cargar} className="ce-ghost" style={{ marginLeft: "auto", border: `1px solid ${C.border}`, background: C.panelSolid, color: C.dim, borderRadius: 9, padding: "6px 11px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
          <RefreshCw size={13} /> Refrescar
        </button>
      </div>
      {loading && <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.dim, fontSize: 13, padding: 6 }}><Loader2 size={16} className="spin" /> Cargando pedidos…</div>}
      {!loading && !pedidos.length && (
        <EmptyState
          icon={Inbox}
          title="Todavía no hay pedidos de producción"
          subtitle="Generá el primero arriba: elegí un casco y una etapa que tenga receta cargada."
          accent="#3b82f6"
        />
      )}
      {!loading && pedidos.map((p) => <PedidoCard key={p.id} pedido={p} onReload={cargar} toast={toast} />)}
    </div>
  );
}

/* ── pantalla ─────────────────────────────────────────────────────────────── */
export default function ComprasEtapasScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  // El rol compras entra sólo a gestionar los pedidos generados; no configura recetas
  // (eso es de Ingeniería/Técnica). Por eso abre directo en Pedidos y sin la pestaña Recetas.
  const soloPedidos = profile?.role === "compras";
  const [tab, setTab] = useState(soloPedidos ? "pedidos" : "recetas");
  const pad = isMobile ? 14 : 26;

  const TABS = [
    ...(soloPedidos ? [] : [{ id: "recetas", label: "Recetas por etapa", icon: Boxes }]),
    { id: "pedidos", label: "Pedidos de producción", icon: ClipboardList },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", overflow: "hidden", background: C.bg, color: C.t0, fontFamily: C.sans }}>
      <style>{`
        .spin{animation:spin 1s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes ce-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes ce-pop{from{opacity:0;transform:scale(.96) translateY(-6px)}to{opacity:1;transform:none}}
        @keyframes ce-scrim{from{opacity:0}to{opacity:1}}
        .ce-surface{background:var(--panel-solid);border:1px solid var(--border);border-radius:14px;box-shadow:0 1px 2px var(--shadow)}
        .ce-card{transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s ease,border-color .18s ease;animation:ce-fade .28s ease both}
        .ce-card:hover{transform:translateY(-2px);box-shadow:0 14px 30px -14px var(--shadow-strong),0 4px 12px -6px var(--shadow);border-color:var(--border-2)}
        .ce-cta{transition:transform .16s ease,filter .16s ease}
        .ce-cta:hover:not(:disabled){transform:translateY(-2px);filter:brightness(1.09)}
        .ce-cta:active:not(:disabled){transform:translateY(0);filter:brightness(.97)}
        .ce-seg{transition:all .2s cubic-bezier(.4,0,.2,1)}
        .ce-seg:hover{color:var(--text)}
        .ce-model:hover{background:var(--panel-2)!important;color:var(--text)}
        .ce-row{background:var(--panel);transition:background .14s ease,border-color .14s ease}
        .ce-row:hover{background:var(--panel-2)}
        .ce-ghost:hover{background:var(--panel-2);color:var(--text)}
        .ce-close:hover{background:var(--panel-3);color:var(--text)}
        .ce-spot{animation:ce-pop .22s cubic-bezier(.34,1.1,.5,1) both}
        .ce-scrim{animation:ce-scrim .18s ease both}
      `}</style>
      <div style={{ width: isMobile ? 0 : 280, height: "100vh", flexShrink: 0 }}>
        <Sidebar profile={profile} signOut={signOut} />
      </div>
      <main style={{ position: "relative", minWidth: 0, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* glow ambiental sutil (no lava el modo claro: opacidad muy baja) */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(1100px 360px at 22% -8%, ${tint("#8b5cf6", 9)}, transparent 70%)` }} />
        <header style={{ position: "relative", padding: `${isMobile ? 15 : 22}px ${pad}px 0`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, display: "grid", placeItems: "center", background: GRAD_VIOLET, color: "#fff", flexShrink: 0, boxShadow: GLOW_VIOLET }}>
              <Layers size={22} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950, color: C.text, letterSpacing: -0.2 }}>Compras por etapa</div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>{soloPedidos ? "Pedidos de materiales generados por etapa de producción, para gestionar su compra." : "Recetas de materiales por etapa de cada modelo y pedidos de producción por casco."}</div>
            </div>
          </div>

          {/* Segmented control tipo macOS/iOS — se oculta si hay una sola pestaña (rol compras) */}
          {TABS.length > 1 && (
          <div style={{ display: "inline-flex", gap: 4, marginTop: 18, padding: 4, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 13, boxShadow: "inset 0 1px 2px var(--shadow)" }}>
            {TABS.map((t) => {
              const active = tab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="ce-seg"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 800, whiteSpace: "nowrap",
                    background: active ? C.panelSolid : "transparent",
                    color: active ? C.violet : C.dim,
                    boxShadow: active ? "0 2px 6px -2px var(--shadow), 0 1px 2px var(--shadow)" : "none",
                  }}
                >
                  <Icon size={15} /> {isMobile && t.id === "pedidos" ? "Pedidos" : t.label}
                </button>
              );
            })}
          </div>
          )}
        </header>
        <div style={{ position: "relative", flex: 1, minHeight: 0, padding: `16px ${pad}px ${pad}px` }}>
          {tab === "recetas" ? <RecetaTab isMobile={isMobile} toast={toast} /> : <PedidosTab toast={toast} />}
        </div>
      </main>
    </div>
  );
}
