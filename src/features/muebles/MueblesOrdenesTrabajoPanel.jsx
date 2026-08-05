import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Boxes,
  Check,
  Copy,
  FilePenLine,
  Layers3,
  Link2,
  PackagePlus,
  Plus,
  Save,
  Search,
  Trash2,
  RotateCcw,
  X,
} from "lucide-react";
import { C } from "@/theme";
import {
  discardMueblesOrdenTrabajoOverride,
  fetchMueblesMaterialCandidates,
  fetchMueblesOtScopes,
  MUEBLES_OT_TYPES,
  saveMueblesOrdenTrabajo,
} from "./mueblesOrdenesTrabajoApi";
import { herrajesForModelo, templateEnchapadoForModelo } from "./EnchapadoView";

const field = {
  width: "100%",
  minHeight: 36,
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${C.b0}`,
  background: C.s0,
  color: C.t0,
  font: `500 12px ${C.sans}`,
  outline: "none",
};

const miniLabel = {
  display: "block",
  marginBottom: 5,
  color: C.t2,
  fontSize: 9,
  fontWeight: 850,
  letterSpacing: 1,
  textTransform: "uppercase",
};

function emptyDraft(tipo) {
  return {
    tipo,
    numero_ot: "",
    titulo: MUEBLES_OT_TYPES[tipo].title,
    notas: "",
    config: {},
    items: [],
  };
}

function modelKey(modelo) {
  const value = String(modelo || "").trim().toUpperCase();
  return value.startsWith("K") ? value.split("-")[0] : `K${value.split("-")[0]}`;
}

function historicalDraft(tipo, modelo) {
  const key = modelKey(modelo);
  if (tipo === "herrajes") {
    const kit = herrajesForModelo(key) || [];
    return {
      ...emptyDraft(tipo),
      titulo: `Kit de herrajes ${key}`,
      notas: "Kit base definido para la línea de producción.",
      items: kit.map((item) => ({
        localId: crypto.randomUUID(),
        material_id: null,
        obra_snapshot_id: null,
        descripcion: item.name || "",
        codigo: "",
        cantidad: typeof item.q === "number" ? item.q : null,
        cantidad_texto: String(item.q ?? ""),
        unidad: String(item.q ?? "").toLowerCase().includes("m") ? "metro" : "unidad",
        notas: "",
        detalle: { fuente_inicial: "kit_historico" },
        origen: "manual",
      })),
    };
  }

  const template = templateEnchapadoForModelo(key);
  if (!template) return emptyDraft(tipo);
  return {
    ...emptyDraft(tipo),
    titulo: `OT de maderas ${key}`,
    notas: "Preparación de chapas y tablones para carpintero de banco.",
    config: {
      placas: [...(template.placas || [])],
      tablones: { ...(template.tablones || {}) },
    },
    items: (template.items || []).map((item) => ({
      localId: crypto.randomUUID(),
      material_id: null,
      obra_snapshot_id: null,
      descripcion: item.material || "",
      codigo: item.id || "",
      cantidad: null,
      cantidad_texto: "",
      unidad: "unidad",
      notas: "",
      detalle: {
        medidas: item.medidas || "",
        caras: item.caras || "",
        veta: item.veta || "",
        fuente_inicial: "ot_enchapado_historica",
      },
      origen: "manual",
    })),
  };
}

function toDraft(order, tipo, fallback = null) {
  if (!order) return fallback || emptyDraft(tipo);
  const storedItems = order.items || [];
  const useHistoricalItems = storedItems.length === 0 && (fallback?.items?.length || 0) > 0;
  const storedConfig = order.config && typeof order.config === "object" ? order.config : {};
  return {
    ...emptyDraft(tipo),
    ...(fallback || {}),
    ...order,
    numero_ot: order.numero_ot || "",
    notas: order.notas || "",
    config: Object.keys(storedConfig).length ? storedConfig : (fallback?.config || {}),
    items: (useHistoricalItems ? fallback.items : storedItems).map((item) => ({
      ...item,
      cantidad_texto: item.cantidad_texto ?? item.cantidad ?? "",
      detalle: item.detalle && typeof item.detalle === "object" ? item.detalle : {},
      localId: item.id || crypto.randomUUID(),
    })),
  };
}

function sourceLabel(item) {
  if (item.origen === "matriz_obra") return "Lista de obra";
  if (item.origen === "matriz_linea") return "Matriz de línea";
  return "Manual";
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function MueblesOrdenesTrabajoPanel({
  loteId,
  lineaId,
  obraCodigo,
  modelo,
  canEdit = false,
  externalOpen = null,
  onExternalClose,
  templateOnly = false,
  lineOptions = [],
  onLineChange,
}) {
  const modelLabel = String(modelo || "").replace(/^K/i, "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [scope, setScope] = useState(templateOnly ? "linea" : "obra");
  const [activeType, setActiveType] = useState("maderas");
  const [drafts, setDrafts] = useState({
    linea: { maderas: emptyDraft("maderas"), herrajes: emptyDraft("herrajes") },
    obra: { maderas: emptyDraft("maderas"), herrajes: emptyDraft("herrajes") },
  });
  const [overrideTypes, setOverrideTypes] = useState(new Set());
  const [candidates, setCandidates] = useState([]);
  const [obra, setObra] = useState(null);
  const [search, setSearch] = useState("");
  const [showCandidates, setShowCandidates] = useState(false);
  const [summary, setSummary] = useState({ linea: 0, obra: 0 });
  const modalOpen = externalOpen == null ? open : externalOpen;

  function closeModal() {
    if (externalOpen != null) onExternalClose?.();
    else setOpen(false);
  }

  async function loadWorkspace() {
    if (!lineaId) return;
    setLoading(true);
    setError("");
    try {
      const [ordersByScope, candidateResult] = await Promise.all([
        fetchMueblesOtScopes({ loteId, lineaId }),
        fetchMueblesMaterialCandidates({ obraCodigo, modelo }),
      ]);
      const defaultDrafts = {
        maderas: historicalDraft("maderas", modelo),
        herrajes: historicalDraft("herrajes", modelo),
      };
      const lineDrafts = {
        maderas: toDraft(ordersByScope.linea.find((row) => row.tipo === "maderas"), "maderas", defaultDrafts.maderas),
        herrajes: toDraft(ordersByScope.linea.find((row) => row.tipo === "herrajes"), "herrajes", defaultDrafts.herrajes),
      };
      const overrides = new Set(ordersByScope.obra.map((row) => row.tipo));
      const obraDrafts = Object.fromEntries(Object.keys(MUEBLES_OT_TYPES).map((tipo) => {
        const override = ordersByScope.obra.find((row) => row.tipo === tipo);
        const base = override ? toDraft(override, tipo) : toDraft(lineDrafts[tipo], tipo);
        return [tipo, { ...base, inherited: !override }];
      }));
      setDrafts({ linea: lineDrafts, obra: obraDrafts });
      setOverrideTypes(overrides);
      setSummary({
        linea: lineDrafts.maderas.items.length + lineDrafts.herrajes.items.length,
        obra: ordersByScope.obra.reduce((total, order) => total + (order.items?.length || 0), 0),
      });
      setCandidates(candidateResult.candidates || []);
      setObra(candidateResult.obra || null);
    } catch (loadError) {
      setError(loadError.message || "No se pudieron cargar las OT de Muebles.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    if (!lineaId) return undefined;
    fetchMueblesOtScopes({ loteId, lineaId })
      .then((ordersByScope) => {
        if (!active) return;
        setSummary({
          linea: ordersByScope.linea.reduce((total, order) => total + (order.items?.length || 0), 0),
          obra: ordersByScope.obra.reduce((total, order) => total + (order.items?.length || 0), 0),
        });
        setOverrideTypes(new Set(ordersByScope.obra.map((row) => row.tipo)));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [lineaId, loteId]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    if (templateOnly) setScope("linea");
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    loadWorkspace();
    return () => { document.body.style.overflow = previous; };
    // Cada apertura debe refrescar matriz y OT; los parámetros ya identifican el proceso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, lineaId, loteId, templateOnly]);

  const draft = drafts[scope][activeType];
  const isInherited = scope === "obra" && !overrideTypes.has(activeType);
  const fieldsEditable = canEdit && !isInherited;
  const selectedKeys = useMemo(() => new Set(draft.items.map((item) => (
    item.material_id ? `material:${item.material_id}` : `text:${normalize(item.descripcion)}`
  ))), [draft.items]);
  const filteredCandidates = useMemo(() => {
    const terms = normalize(search).split(/\s+/).filter(Boolean);
    return candidates.filter((item) => {
      if (scope === "linea" && item.origen === "matriz_obra") return false;
      const key = item.material_id ? `material:${item.material_id}` : `text:${normalize(item.descripcion)}`;
      if (selectedKeys.has(key)) return false;
      const haystack = normalize(`${item.descripcion} ${item.codigo || ""} ${item.proveedor || ""} ${item.rubro || ""} ${item.notas || ""}`);
      return terms.every((term) => haystack.includes(term));
    }).slice(0, 80);
  }, [candidates, scope, search, selectedKeys]);

  function patchDraft(patch) {
    setSaved(false);
    setDrafts((previous) => ({
      ...previous,
      [scope]: {
        ...previous[scope],
        [activeType]: { ...previous[scope][activeType], ...patch },
      },
    }));
  }

  function patchItem(localId, patch) {
    patchDraft({
      items: draft.items.map((item) => item.localId === localId ? { ...item, ...patch } : item),
    });
  }

  function patchItemDetail(localId, key, value) {
    patchDraft({
      items: draft.items.map((item) => item.localId === localId
        ? { ...item, detalle: { ...(item.detalle || {}), [key]: value } }
        : item),
    });
  }

  function patchConfig(key, value) {
    patchDraft({ config: { ...(draft.config || {}), [key]: value } });
  }

  function addCandidate(candidate) {
    patchDraft({
      items: [...draft.items, {
        localId: crypto.randomUUID(),
        material_id: candidate.material_id || null,
        obra_snapshot_id: candidate.obra_snapshot_id || null,
        descripcion: candidate.descripcion || "",
        codigo: candidate.codigo || "",
        cantidad: candidate.cantidad ?? "",
        cantidad_texto: String(candidate.cantidad ?? ""),
        unidad: candidate.unidad || "unidad",
        notas: "",
        detalle: {},
        origen: candidate.origen || "matriz_linea",
      }],
    });
  }

  function addManual() {
    patchDraft({
      items: [...draft.items, {
        localId: crypto.randomUUID(),
        material_id: null,
        obra_snapshot_id: null,
        descripcion: "",
        codigo: "",
        cantidad: "",
        cantidad_texto: "",
        unidad: "unidad",
        notas: "",
        detalle: activeType === "maderas" ? { medidas: "", caras: "", veta: "" } : {},
        origen: "manual",
      }],
    });
  }

  function startOverride() {
    setOverrideTypes((previous) => new Set([...previous, activeType]));
    setDrafts((previous) => ({
      ...previous,
      obra: {
        ...previous.obra,
        [activeType]: { ...previous.obra[activeType], inherited: false, id: null },
      },
    }));
    setSaved(false);
  }

  async function discardOverride() {
    if (!overrideTypes.has(activeType)) return;
    if (!window.confirm(`¿Volver a usar la plantilla K${modelLabel} para ${MUEBLES_OT_TYPES[activeType].short}? La personalización de ${obraCodigo} se descartará.`)) return;
    setSaving(true);
    setError("");
    try {
      await discardMueblesOrdenTrabajoOverride({ loteId, tipo: activeType });
      setSaved(true);
      await loadWorkspace();
    } catch (discardError) {
      setError(discardError.message || "No se pudo volver a la plantilla de línea.");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!fieldsEditable) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await saveMueblesOrdenTrabajo({
        scope,
        loteId,
        lineaId,
        tipo: activeType,
        numeroOt: draft.numero_ot,
        titulo: draft.titulo,
        notas: draft.notas,
        config: draft.config,
        items: draft.items,
      });
      if (scope === "obra") setOverrideTypes((previous) => new Set([...previous, activeType]));
      setSaved(true);
      await loadWorkspace();
    } catch (saveError) {
      setError(saveError.message || "No se pudo guardar la OT.");
    } finally {
      setSaving(false);
    }
  }

  function openScope(nextScope) {
    setScope(nextScope);
    setActiveType("maderas");
    setSaved(false);
    setOpen(true);
  }

  const trigger = (
    <div style={{ margin: "0 0 14px", padding: "11px", borderRadius: 10, border: `1px solid ${C.tealB}`, background: `color-mix(in srgb, ${C.teal} 5%, ${C.s0})` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 9, alignItems: "center", minWidth: 0 }}>
          <span style={{ width: 29, height: 29, borderRadius: 8, display: "grid", placeItems: "center", color: C.teal, background: C.tealL, border: `1px solid ${C.tealB}`, flexShrink: 0 }}>
            <Link2 size={14} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.t0, fontSize: 11.5, fontWeight: 850 }}>OT de materiales · Oberti</div>
            <div style={{ color: C.t2, fontSize: 9.5, marginTop: 2 }}>
              Plantilla K{modelLabel}: {summary.linea} ítems · {overrideTypes.size ? `${summary.obra} ítems personalizados en ${obraCodigo}` : `${obraCodigo} usa la plantilla`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={() => openScope("linea")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, cursor: "pointer", fontSize: 10, fontWeight: 850 }}>
            <Layers3 size={13} /> {canEdit ? `Editar plantilla K${modelLabel}` : `Ver plantilla K${modelLabel}`}
          </button>
          <button type="button" onClick={() => openScope("obra")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.tealB}`, background: C.tealL, color: C.teal, cursor: "pointer", fontSize: 10, fontWeight: 850 }}>
            <FilePenLine size={13} /> {overrideTypes.size ? `Editar OT ${obraCodigo}` : `Revisar OT ${obraCodigo}`}
          </button>
        </div>
      </div>
    </div>
  );

  if (!modalOpen) return templateOnly ? null : trigger;

  const modal = (
    <div onMouseDown={(event) => event.target === event.currentTarget && closeModal()} style={{ position: "fixed", inset: 0, zIndex: 140, display: "grid", placeItems: "center", padding: 18, background: "rgba(8,12,20,.66)", backdropFilter: "blur(8px)" }}>
      <div role="dialog" aria-modal="true" aria-label="OT de materiales para Oberti" style={{ width: "min(1080px, 100%)", maxHeight: "min(850px, calc(100vh - 36px))", display: "flex", flexDirection: "column", borderRadius: 16, border: `1px solid ${C.b1}`, background: C.bg1, boxShadow: "0 30px 90px rgba(0,0,0,.38)", overflow: "hidden" }}>
        <style>{`
          .muebles-ot-grid { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr); gap:12px; min-height:0; }
          .muebles-ot-row { display:grid; gap:7px; align-items:start; }
          .muebles-ot-row-herraje { grid-template-columns:92px minmax(190px,1.35fr) minmax(140px,1fr) 32px; }
          .muebles-ot-row-madera { grid-template-columns:58px minmax(150px,1.2fr) minmax(110px,.9fr) 88px minmax(100px,.8fr) minmax(130px,1fr) 32px; }
          @media(max-width:800px){ .muebles-ot-grid{grid-template-columns:1fr}.muebles-ot-row-herraje,.muebles-ot-row-madera{grid-template-columns:1fr 1fr}.muebles-ot-wide{grid-column:1/-1}.muebles-ot-delete{grid-column:2;justify-self:end}.muebles-ot-modal-body{padding:12px!important}.muebles-ot-head{align-items:flex-start!important}.muebles-ot-head-copy{display:none} }
        `}</style>
        <header className="muebles-ot-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "15px 17px", borderBottom: `1px solid ${C.b0}`, background: C.s1 }}>
          <div style={{ display: "flex", gap: 11, alignItems: "center", minWidth: 0 }}>
            <span style={{ width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 10, color: C.teal, background: C.tealL, border: `1px solid ${C.tealB}`, flexShrink: 0 }}><FilePenLine size={17} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.t0, fontSize: 15, fontWeight: 900 }}>{scope === "linea" ? `Plantilla de OT · K${modelLabel}` : `OT particular · ${obraCodigo}`}</div>
              <div className="muebles-ot-head-copy" style={{ color: C.t2, fontSize: 10.5, marginTop: 3 }}>{scope === "linea" ? "Base para todas las obras de la línea" : `Obra ${obraCodigo} · proveedor Oberti`}</div>
            </div>
          </div>
          <button type="button" onClick={closeModal} aria-label="Cerrar" style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 9, border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, cursor: "pointer" }}><X size={16} /></button>
        </header>

        <div className="muebles-ot-modal-body" style={{ padding: 16, overflow: "auto" }}>
          {templateOnly && (
            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={miniLabel}>Línea de producción</span>
              <select value={lineaId || ""} onChange={(event) => onLineChange?.(event.target.value)} style={{ ...field, maxWidth: 320, fontWeight: 800 }}>
                {lineOptions.map((line) => <option key={line.id} value={line.id}>{line.nombre}</option>)}
              </select>
              <span style={{ display: "block", marginTop: 5, color: C.t2, fontSize: 9.5 }}>Elegí la línea y después editá Maderas o Kit de herrajes.</span>
            </label>
          )}

          {!templateOnly && <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginBottom: 12 }}>
            <button type="button" onClick={() => { setScope("linea"); setSaved(false); setShowCandidates(false); }} style={{ padding: "10px 11px", borderRadius: 10, border: `1px solid ${scope === "linea" ? C.tealB : C.b0}`, background: scope === "linea" ? C.tealL : C.s1, color: scope === "linea" ? C.teal : C.t1, textAlign: "left", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 900 }}><Layers3 size={14} /> Plantilla K{modelLabel}</div>
              <div style={{ marginTop: 3, color: C.t2, fontSize: 9.5 }}>Se aplica como base a todas las obras K{modelLabel}.</div>
            </button>
            <button type="button" onClick={() => { setScope("obra"); setSaved(false); setShowCandidates(false); }} style={{ padding: "10px 11px", borderRadius: 10, border: `1px solid ${scope === "obra" ? C.tealB : C.b0}`, background: scope === "obra" ? C.tealL : C.s1, color: scope === "obra" ? C.teal : C.t1, textAlign: "left", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 900 }}><FilePenLine size={14} /> Obra {obraCodigo}</div>
              <div style={{ marginTop: 3, color: C.t2, fontSize: 9.5 }}>{overrideTypes.size ? `${overrideTypes.size} OT personalizada${overrideTypes.size === 1 ? "" : "s"}.` : `Actualmente hereda la plantilla K${modelLabel}.`}</div>
            </button>
          </div>}

          <div style={{ display: "flex", gap: 5, padding: 4, marginBottom: 12, width: "fit-content", borderRadius: 10, border: `1px solid ${C.b0}`, background: C.s1 }}>
            {Object.entries(MUEBLES_OT_TYPES).map(([key, meta]) => (
              <button key={key} type="button" onClick={() => { setActiveType(key); setShowCandidates(false); setSearch(""); setSaved(false); }} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 11px", borderRadius: 7, border: `1px solid ${activeType === key ? C.tealB : "transparent"}`, background: activeType === key ? C.s0 : "transparent", color: activeType === key ? C.t0 : C.t2, cursor: "pointer", fontSize: 11, fontWeight: 800 }}>
                {key === "maderas" ? <Boxes size={13} /> : <PackagePlus size={13} />}
                {meta.short}
                <span style={{ color: activeType === key ? C.teal : C.t3, fontFamily: C.mono, fontSize: 9 }}>{drafts[scope][key].items.length}</span>
              </button>
            ))}
          </div>

          {error && <div style={{ marginBottom: 11, padding: "9px 11px", borderRadius: 9, color: C.red, background: C.redL, border: `1px solid ${C.redB}`, fontSize: 11 }}>{error}</div>}
          {saved && <div style={{ marginBottom: 11, padding: "9px 11px", borderRadius: 9, color: C.green, background: C.greenL, border: `1px solid ${C.greenB}`, fontSize: 11, display: "flex", gap: 7, alignItems: "center" }}><Check size={13} /> OT guardada y registrada en el historial.</div>}
          {isInherited && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 11, padding: "10px 11px", borderRadius: 10, color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}`, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900 }}>Esta obra usa la plantilla K{modelLabel}</div>
              <div style={{ marginTop: 3, color: C.t2, fontSize: 9.5 }}>Los campos están bloqueados para evitar cambios accidentales en una sola obra.</div>
            </div>
            {canEdit && <button type="button" onClick={startOverride} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.blueB}`, background: C.s0, color: C.blue, cursor: "pointer", fontSize: 10, fontWeight: 900 }}><Copy size={13} /> Personalizar {MUEBLES_OT_TYPES[activeType].short} para {obraCodigo}</button>}
          </div>}

          {loading ? <div style={{ padding: 70, color: C.t2, textAlign: "center", fontSize: 12 }}>Cargando OT y lista de materiales…</div> : (
            <div className="muebles-ot-grid">
              <section style={{ minWidth: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(140px,.4fr) minmax(220px,1fr)", gap: 9, marginBottom: 10 }}>
                  <label><span style={miniLabel}>Número de OT</span><input disabled={!fieldsEditable} value={draft.numero_ot} onChange={(event) => patchDraft({ numero_ot: event.target.value })} placeholder="Ej. OT-MOB-55-2" style={field} /></label>
                  <label><span style={miniLabel}>Título</span><input disabled={!fieldsEditable} value={draft.titulo} onChange={(event) => patchDraft({ titulo: event.target.value })} style={field} /></label>
                </div>
                <label><span style={miniLabel}>Indicaciones generales</span><textarea disabled={!fieldsEditable} value={draft.notas} onChange={(event) => patchDraft({ notas: event.target.value })} placeholder={activeType === "maderas" ? "Preparación, medidas, veta, terminación…" : "Armado del kit, embalaje, identificación…"} rows={2} style={{ ...field, resize: "vertical" }} /></label>

                {activeType === "maderas" && <div style={{ marginTop: 10, padding: 10, borderRadius: 11, border: `1px solid ${C.b0}`, background: C.s1 }}>
                  <div style={{ color: C.t0, fontSize: 11, fontWeight: 850, marginBottom: 8 }}>Material base de la OT</div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) 100px 100px", gap: 8 }}>
                    <label>
                      <span style={miniLabel}>Placas y terciados</span>
                      <textarea disabled={!fieldsEditable} value={(draft.config?.placas || []).join("\n")} onChange={(event) => patchConfig("placas", event.target.value.split("\n").map((row) => row.trim()).filter(Boolean))} rows={3} placeholder="Una descripción por línea" style={{ ...field, resize: "vertical" }} />
                    </label>
                    <label><span style={miniLabel}>Tablones lenga</span><input disabled={!fieldsEditable} value={draft.config?.tablones?.lenga ?? ""} onChange={(event) => patchConfig("tablones", { ...(draft.config?.tablones || {}), lenga: event.target.value })} style={field} /></label>
                    <label><span style={miniLabel}>Tablones okumé</span><input disabled={!fieldsEditable} value={draft.config?.tablones?.okume ?? ""} onChange={(event) => patchConfig("tablones", { ...(draft.config?.tablones || {}), okume: event.target.value })} style={field} /></label>
                  </div>
                </div>}

                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", margin: "14px 0 8px" }}>
                  <div>
                    <div style={{ color: C.t0, fontSize: 12, fontWeight: 850 }}>Ítems de la OT</div>
                    <div style={{ color: C.t2, fontSize: 9.5, marginTop: 2 }}>Cada vínculo conserva su origen para poder rastrearlo.</div>
                  </div>
                  {fieldsEditable && <button type="button" onClick={addManual} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 9px", borderRadius: 8, border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, cursor: "pointer", fontSize: 10, fontWeight: 800 }}><Plus size={12} /> Manual</button>}
                </div>

                <div style={{ display: "grid", gap: 7 }}>
                  {draft.items.length === 0 && <div style={{ padding: "30px 16px", borderRadius: 11, border: `1px dashed ${C.b1}`, background: C.s1, color: C.t2, textAlign: "center", fontSize: 11 }}>Todavía no hay materiales en esta OT. Agregalos desde la lista vinculada.</div>}
                  {draft.items.map((item) => activeType === "maderas" ? (
                    <div className="muebles-ot-row muebles-ot-row-madera" key={item.localId} style={{ padding: 9, borderRadius: 10, border: `1px solid ${C.b0}`, background: C.s1 }}>
                      <label><span style={miniLabel}>Ítem</span><input disabled={!fieldsEditable} value={item.codigo || ""} onChange={(event) => patchItem(item.localId, { codigo: event.target.value })} placeholder="A" style={field} /></label>
                      <label className="muebles-ot-wide"><span style={miniLabel}>{sourceLabel(item)}</span><input disabled={!fieldsEditable} value={item.descripcion} onChange={(event) => patchItem(item.localId, { descripcion: event.target.value })} placeholder="Material" style={field} /></label>
                      <label><span style={miniLabel}>Medidas</span><input disabled={!fieldsEditable} value={item.detalle?.medidas || ""} onChange={(event) => patchItemDetail(item.localId, "medidas", event.target.value)} placeholder="160 × 220 cm" style={field} /></label>
                      <label><span style={miniLabel}>Caras</span><input disabled={!fieldsEditable} value={item.detalle?.caras || ""} onChange={(event) => patchItemDetail(item.localId, "caras", event.target.value)} placeholder="1 cara" style={field} /></label>
                      <label><span style={miniLabel}>Veta</span><input disabled={!fieldsEditable} value={item.detalle?.veta || ""} onChange={(event) => patchItemDetail(item.localId, "veta", event.target.value)} placeholder="A lo largo" style={field} /></label>
                      <label className="muebles-ot-wide"><span style={miniLabel}>Hojas / indicación</span><input disabled={!fieldsEditable} value={item.notas || ""} onChange={(event) => patchItem(item.localId, { notas: event.target.value })} placeholder="Detalle para imprimir" style={field} /></label>
                      {fieldsEditable && <button className="muebles-ot-delete" type="button" onClick={() => patchDraft({ items: draft.items.filter((row) => row.localId !== item.localId) })} aria-label={`Quitar ${item.descripcion || "ítem"}`} style={{ width: 32, height: 36, marginTop: 19, display: "grid", placeItems: "center", borderRadius: 8, border: `1px solid ${C.redB}`, background: C.redL, color: C.red, cursor: "pointer" }}><Trash2 size={13} /></button>}
                    </div>
                  ) : (
                    <div className="muebles-ot-row muebles-ot-row-herraje" key={item.localId} style={{ padding: 9, borderRadius: 10, border: `1px solid ${C.b0}`, background: C.s1 }}>
                      <label><span style={miniLabel}>Cantidad</span><input disabled={!fieldsEditable} value={item.cantidad_texto ?? item.cantidad ?? ""} onChange={(event) => patchItem(item.localId, { cantidad_texto: event.target.value, cantidad: event.target.value })} placeholder="Ej. 4 o 1,5 m" style={field} /></label>
                      <label className="muebles-ot-wide"><span style={miniLabel}>{sourceLabel(item)}</span><input disabled={!fieldsEditable} value={item.descripcion} onChange={(event) => patchItem(item.localId, { descripcion: event.target.value })} placeholder="Herraje" style={field} /></label>
                      <label className="muebles-ot-wide"><span style={miniLabel}>Detalle</span><input disabled={!fieldsEditable} value={item.notas || ""} onChange={(event) => patchItem(item.localId, { notas: event.target.value })} placeholder="Medida, código o indicación" style={field} /></label>
                      {fieldsEditable && <button className="muebles-ot-delete" type="button" onClick={() => patchDraft({ items: draft.items.filter((row) => row.localId !== item.localId) })} aria-label={`Quitar ${item.descripcion || "ítem"}`} style={{ width: 32, height: 36, marginTop: 19, display: "grid", placeItems: "center", borderRadius: 8, border: `1px solid ${C.redB}`, background: C.redL, color: C.red, cursor: "pointer" }}><Trash2 size={13} /></button>}
                    </div>
                  ))}
                </div>
              </section>

              <aside style={{ minWidth: 0, padding: 11, borderRadius: 12, border: `1px solid ${C.b0}`, background: C.s1, alignSelf: "start", position: "sticky", top: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5 }}><Link2 size={14} color={C.teal} /><div style={{ color: C.t0, fontSize: 11.5, fontWeight: 850 }}>Lista vinculada</div></div>
                <div style={{ color: C.t2, fontSize: 9.5, lineHeight: 1.45, marginBottom: 10 }}>
                  {scope === "linea"
                    ? `Catálogo estándar de la matriz K${modelLabel}.`
                    : obra
                      ? `Materiales de la obra ${obra.codigo}, completados con la matriz K${modelLabel}.`
                      : `No se encontró la obra ${obraCodigo}; se muestra la matriz K${modelLabel}.`}
                </div>
                <div style={{ padding: "8px 9px", marginBottom: 9, borderRadius: 8, color: C.teal, background: C.tealL, border: `1px solid ${C.tealB}`, fontSize: 9.5, lineHeight: 1.4 }}>
                  Sólo referencia: los cambios de esta OT no alteran la lista, Compras ni el stock.
                </div>
                {fieldsEditable && <button type="button" onClick={() => setShowCandidates((value) => !value)} style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.tealB}`, background: C.tealL, color: C.teal, cursor: "pointer", fontSize: 10.5, fontWeight: 850 }}><PackagePlus size={13} /> Agregar desde materiales</button>}

                {showCandidates && <div style={{ marginTop: 9 }}>
                  <div style={{ position: "relative", marginBottom: 7 }}>
                    <Search size={13} style={{ position: "absolute", left: 9, top: 10, color: C.t2 }} />
                    <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar material, código, proveedor…" style={{ ...field, paddingLeft: 29 }} />
                  </div>
                  <div style={{ display: "grid", gap: 5, maxHeight: 330, overflow: "auto" }}>
                    {filteredCandidates.map((candidate) => (
                      <button type="button" key={candidate.key} onClick={() => addCandidate(candidate)} style={{ padding: "8px 9px", borderRadius: 8, border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, textAlign: "left", cursor: "pointer" }}>
                        <div style={{ fontSize: 10.5, fontWeight: 800, lineHeight: 1.25 }}>{candidate.descripcion}</div>
                        <div style={{ color: C.t2, fontSize: 8.8, marginTop: 3 }}>{[candidate.codigo, candidate.sourceLabel, candidate.proveedor, candidate.cantidad ? `${candidate.cantidad} ${candidate.unidad}` : ""].filter(Boolean).join(" · ")}</div>
                      </button>
                    ))}
                    {!filteredCandidates.length && <div style={{ padding: 18, color: C.t2, textAlign: "center", fontSize: 10 }}>No hay más coincidencias para agregar.</div>}
                  </div>
                </div>}
              </aside>
            </div>
          )}
        </div>

        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: `1px solid ${C.b0}`, background: C.s1 }}>
          <div style={{ color: C.t2, fontSize: 9.5 }}>{draft.items.length} ítems · {scope === "linea" ? `plantilla K${modelLabel}` : isInherited ? `heredados de K${modelLabel}` : `personalizados para ${obraCodigo}`} · Oberti</div>
          <div style={{ display: "flex", gap: 7 }}>
            {scope === "obra" && overrideTypes.has(activeType) && canEdit && <button type="button" disabled={saving} onClick={discardOverride} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 11px", borderRadius: 8, border: `1px solid ${C.b0}`, background: C.s0, color: C.t2, cursor: saving ? "wait" : "pointer", fontSize: 10.5, fontWeight: 800 }}><RotateCcw size={13} /> Volver a plantilla</button>}
            <button type="button" onClick={closeModal} style={{ padding: "8px 11px", borderRadius: 8, border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, cursor: "pointer", fontSize: 10.5, fontWeight: 800 }}>Cerrar</button>
            {fieldsEditable && <button type="button" disabled={saving || loading} onClick={save} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.teal}`, background: C.teal, color: "white", cursor: saving || loading ? "wait" : "pointer", opacity: saving || loading ? .65 : 1, fontSize: 10.5, fontWeight: 850 }}><Save size={13} /> {saving ? "Guardando…" : scope === "linea" ? `Guardar plantilla ${MUEBLES_OT_TYPES[activeType].short}` : `Guardar OT ${obraCodigo}`}</button>}
          </div>
        </footer>
      </div>
    </div>
  );

  return <>{templateOnly ? null : trigger}{createPortal(modal, document.body)}</>;
}
