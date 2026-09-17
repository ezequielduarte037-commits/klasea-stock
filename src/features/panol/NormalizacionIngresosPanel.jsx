import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronRight, CircleDotDashed, ExternalLink, PackageCheck, PackageSearch, Plus, RefreshCw, Search, Sparkles, Trash2, X } from "lucide-react";
import { C } from "@/theme";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { buscarCatalogoParaEstandarizacion, fetchPanolNormalizationQueue, guardarNormalizacionPorLinea, vincularMovimientosAMaterial } from "@/features/panol/panolApi";
import { fmtDate, rowDelta, rowMovementAt, rowSource } from "@/features/panol/panolMovimientos";
import { fetchCategorias, fetchProveedores } from "@/features/materiales/api";
import { norm } from "@/features/materiales/materialesParser";

const FIELD = {
  width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`,
  background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 10px",
  outline: "none", fontFamily: C.sans, fontSize: 12.5,
};

const STATUS_META = {
  pendiente: { label: "Pendientes", singular: "Pendiente", color: C.cyan, bg: C.cyanL, border: C.cyanB },
  estandar: { label: "Estándar", singular: "Estándar", color: C.blue, bg: C.blueL, border: C.blueB },
  puntual: { label: "Puntuales", singular: "Puntual", color: C.violet, bg: C.violetL, border: C.violetB },
};

function qty(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmtQty(value) {
  return Number(Math.round(qty(value) * 100) / 100).toLocaleString("es-AR");
}

function modeloDeObra(obra = {}) {
  return String(obra.modelo || obra.linea_nombre || obra.codigo?.split("-")[0] || "")
    .trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^K/, "");
}

function normalizacionEnLinea(material, modelo) {
  const cleanModel = String(modelo || "").replace(/^K/i, "");
  return (material?.normalizaciones || []).find((row) => String(row.modelo || "").replace(/^K/i, "") === cleanModel) || null;
}

function esEstandarEnLinea(material, modelo) {
  const cleanModel = String(modelo || "").replace(/^K/i, "");
  return (material?.modelos_estandar || []).some((row) => String(row.modelo || "").replace(/^K/i, "") === cleanModel);
}

function estadoEnLinea(material, modelo) {
  const decision = normalizacionEnLinea(material, modelo)?.decision;
  if (decision === "estandar" || decision === "puntual") return decision;
  if (esEstandarEnLinea(material, modelo)) return "estandar";
  // Compatibilidad con decisiones puntuales de la primera versión, que eran
  // globales y no guardaban una fila por modelo.
  if (material?.revisado === true && !(material.modelos_estandar || []).length) return "puntual";
  return "pendiente";
}

function originLabel(value) {
  const source = String(value || "manual").toLowerCase();
  const labels = {
    remito: "Remito", conteo: "Conteo", conteo_fisico: "Conteo físico",
    manual: "Carga manual", addon_obra: "Adicional de obra", egreso: "Egreso",
    stock: "Stock", stock_general: "Stock general", ajuste_ingreso: "Ajuste de ingreso",
    transferencia_ingreso: "Transferencia", reclasificacion_ingreso: "Reclasificación",
  };
  return labels[source] || source.replaceAll("_", " ");
}

function evidenceFor(materialId, rows, obraById) {
  const ingresos = rows
    .filter((row) => row.material_id === materialId && rowDelta(row) > 0)
    .map((row) => {
      const obra = row.obra || obraById.get(row.obra_id) || null;
      return {
        row, obra,
        obraId: obra?.id || row.obra_id || "",
        obraCodigo: obra?.codigo || row.obra_codigo || "",
        linea: modeloDeObra(obra || { codigo: row.obra_codigo }),
        fecha: rowMovementAt(row),
        cantidad: Math.abs(rowDelta(row)),
      };
    })
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  const obras = new Map();
  const lineas = new Set();
  let cantidad = 0;
  for (const ingreso of ingresos) {
    cantidad += ingreso.cantidad;
    if (ingreso.obraId) obras.set(ingreso.obraId, ingreso.obra || { id: ingreso.obraId, codigo: ingreso.obraCodigo || "Obra" });
    if (ingreso.linea) lineas.add(ingreso.linea);
  }
  return {
    ingresos, cantidad, obras: [...obras.values()],
    lineas: [...lineas].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    ultimo: ingresos[0]?.fecha || null,
  };
}

function evidenceInScope(evidence, lineFilter, workFilter) {
  const ingresos = (evidence?.ingresos || []).filter((entry) => {
    if (lineFilter && entry.linea !== lineFilter) return false;
    return workFilter === "todas" || entry.obraId === workFilter;
  });
  const obras = new Map();
  let cantidad = 0;
  for (const ingreso of ingresos) {
    cantidad += ingreso.cantidad;
    if (ingreso.obraId) obras.set(ingreso.obraId, ingreso.obra || { id: ingreso.obraId, codigo: ingreso.obraCodigo || "Obra" });
  }
  return { ingresos, obras: [...obras.values()], cantidad, ultimo: ingresos[0]?.fecha || null };
}

function KpiChip({ label, value, meta, active, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={{ minHeight: 28, display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${active ? meta.border : C.border}`, background: active ? meta.bg : C.panelSolid, color: active ? meta.color : C.dim, borderRadius: 999, padding: "3px 8px", cursor: "pointer", fontFamily: C.sans, fontSize: 10, fontWeight: 700 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: meta.color }} />
      {label} <span style={{ fontFamily: C.mono }}>{value}</span>
    </button>
  );
}

function ProductThumb({ material }) {
  if (material.imagen_url) return <img src={material.imagen_url} alt="" style={{ width: 42, height: 42, borderRadius: 9, objectFit: "contain", background: "#fff", border: `1px solid ${C.border}` }} />;
  return <span style={{ width: 42, height: 42, borderRadius: 9, display: "grid", placeItems: "center", background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}><PackageSearch size={18} /></span>;
}

function workStateLabel(state) {
  const labels = { activa: "activa", pausada: "pausada", terminada: "terminada" };
  return labels[String(state || "").toLowerCase()] || "";
}

function matrixLabel(matrix) {
  const line = String(matrix?.modelo || "").replace(/^K/i, "");
  const quantity = qty(matrix?.cantidad, 0);
  return `K${line || "—"}${quantity > 0 ? ` · ${fmtQty(quantity)} / barco` : ""}`;
}

function providerDraftsFor(material, providers) {
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const byName = new Map(providers.map((provider) => [norm(provider.nombre), provider]));
  const drafts = [];
  const seen = new Set();
  for (const row of material?.proveedores_lista || []) {
    const provider = byId.get(row.proveedor_id);
    if (!row.proveedor_id || seen.has(row.proveedor_id)) continue;
    seen.add(row.proveedor_id);
    const isCurrent = material?.proveedor_id === row.proveedor_id;
    drafts.push({
      proveedor_id: row.proveedor_id,
      nombre: provider?.nombre || (isCurrent && material?.proveedor) || "Proveedor asociado",
      precio: row.precio ?? (isCurrent ? material?.precio_unitario : "") ?? "",
      moneda: row.moneda || (isCurrent ? material?.moneda : "") || "ARS",
      denominacion_proveedor: row.denominacion_proveedor || "",
      codigo_proveedor: row.codigo_proveedor || "",
      componentes_pedido: Array.isArray(row.componentes_pedido) ? row.componentes_pedido : [],
    });
  }
  const current = byId.get(material?.proveedor_id) || byName.get(norm(material?.proveedor));
  if (current && !seen.has(current.id)) {
    drafts.push({
      proveedor_id: current.id,
      nombre: current.nombre,
      precio: material?.precio_unitario ?? "",
      moneda: material?.moneda || "ARS",
      denominacion_proveedor: "",
      codigo_proveedor: "",
      componentes_pedido: [],
    });
  }
  return drafts;
}

export default function NormalizacionIngresosPanel({ rows = [], obras = [], modelos = [], isMobile = false, onSaved, onOpenCatalog }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("pendiente");
  const [query, setQuery] = useState("");
  const [lineFilter, setLineFilter] = useState("");
  const [workFilter, setWorkFilter] = useState("todas");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState({ descripcion: "", alias: "", codigo: "", codigo_barra: "", unidad_medida: "unidad", categoria_id: "", notas: "", proveedores: [], cantidadVerificada: false, lineas: {} });
  const [catalogOptions, setCatalogOptions] = useState({ proveedores: [], categorias: [] });
  const [providerToAdd, setProviderToAdd] = useState("");
  const [confirmPuntual, setConfirmPuntual] = useState(false);
  const [catalogLinkOpen, setCatalogLinkOpen] = useState(false);
  const [catalogLinkScope, setCatalogLinkScope] = useState("todo");
  const [catalogLinkQuery, setCatalogLinkQuery] = useState("");
  const [catalogLinkResults, setCatalogLinkResults] = useState([]);
  const [catalogLinkLoading, setCatalogLinkLoading] = useState(false);
  const [linkingMaterialId, setLinkingMaterialId] = useState(null);

  const obraById = useMemo(() => new Map(obras.map((obra) => [obra.id, obra])), [obras]);
  const evidenceById = useMemo(() => {
    const map = new Map();
    for (const item of items) map.set(item.id, evidenceFor(item.id, rows, obraById));
    return map;
  }, [items, obraById, rows]);

  const recargar = useCallback(async ({ keepSelection = true } = {}) => {
    setLoading(true);
    setError("");
    try {
      const [data, proveedores, categorias] = await Promise.all([
        fetchPanolNormalizationQueue({ limit: 2000 }),
        fetchProveedores().catch(() => []),
        fetchCategorias().catch(() => []),
      ]);
      setItems(data);
      setCatalogOptions({ proveedores: proveedores.filter((provider) => provider.activo !== false), categorias });
      setSelectedId((current) => keepSelection && data.some((item) => item.id === current) ? current : null);
    } catch (err) {
      setError(err?.message || "No se pudo cargar la bandeja.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { recargar({ keepSelection: false }); }, [recargar]);

  const modelOptions = useMemo(() => {
    const set = new Set(modelos.map((modelo) => String(modelo || "").replace(/^K/i, "")).filter((modelo) => /^\d+$/.test(modelo)));
    for (const item of items) {
      for (const row of item.modelos_estandar || []) if (row.modelo) set.add(String(row.modelo).replace(/^K/i, ""));
      for (const row of item.normalizaciones || []) if (row.modelo) set.add(String(row.modelo).replace(/^K/i, ""));
    }
    for (const evidence of evidenceById.values()) for (const modelo of evidence.lineas) if (/^\d+$/.test(modelo)) set.add(modelo);
    return [...set].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }, [evidenceById, items, modelos]);

  useEffect(() => {
    if (!modelOptions.length) return;
    setLineFilter((current) => modelOptions.includes(current) ? current : modelOptions[0]);
  }, [modelOptions]);

  const workOptions = useMemo(() => obras
    .filter((obra) => modeloDeObra(obra) === lineFilter)
    .sort((a, b) => {
      const activeDiff = Number(String(b.estado).toLowerCase() === "activa") - Number(String(a.estado).toLowerCase() === "activa");
      return activeDiff || String(b.codigo || "").localeCompare(String(a.codigo || ""), "es", { numeric: true });
    }), [lineFilter, obras]);

  const scopedItems = useMemo(() => {
    if (!lineFilter) return [];
    return items.filter((item) => {
      const evidence = evidenceById.get(item.id);
      const decision = normalizacionEnLinea(item, lineFilter);
      const belongsToLine = evidence?.lineas.includes(lineFilter) || esEstandarEnLinea(item, lineFilter) || !!decision;
      if (!belongsToLine) return false;
      if (workFilter === "todas") return true;
      return evidence?.ingresos.some((entry) => entry.linea === lineFilter && entry.obraId === workFilter)
        || decision?.evidencia_obra_id === workFilter;
    });
  }, [evidenceById, items, lineFilter, workFilter]);

  const counts = useMemo(() => scopedItems.reduce((acc, item) => {
    acc[estadoEnLinea(item, lineFilter)] += 1;
    return acc;
  }, { pendiente: 0, estandar: 0, puntual: 0 }), [lineFilter, scopedItems]);

  const filtered = useMemo(() => {
    const needle = norm(query);
    return scopedItems.filter((item) => {
      if (estadoEnLinea(item, lineFilter) !== status) return false;
      if (!needle) return true;
      const evidence = evidenceById.get(item.id) || { obras: [] };
      return norm([item.descripcion, item.alias, item.codigo, item.codigo_barra, item.proveedor,
        ...evidence.obras.map((obra) => obra.codigo), `K${lineFilter}`].filter(Boolean).join(" ")).includes(needle);
    });
  }, [evidenceById, lineFilter, query, scopedItems, status]);

  const selected = items.find((item) => item.id === selectedId) || null;
  const selectedEvidence = selected ? evidenceById.get(selected.id) : null;
  const focusedEvidence = useMemo(() => evidenceInScope(selectedEvidence, lineFilter, workFilter), [lineFilter, selectedEvidence, workFilter]);
  const selectedDecision = selected ? normalizacionEnLinea(selected, lineFilter) : null;
  const selectedDecisionWork = selectedDecision?.evidencia_obra_id ? obraById.get(selectedDecision.evidencia_obra_id) : null;
  const selectedStatus = selected ? estadoEnLinea(selected, lineFilter) : "pendiente";
  const selectedLineActive = !!lineFilter && Object.prototype.hasOwnProperty.call(draft.lineas, lineFilter);
  const selectedWork = workFilter === "todas" ? null : obraById.get(workFilter) || null;
  const availableProviders = catalogOptions.proveedores.filter((provider) => !draft.proveedores.some((row) => row.proveedor_id === provider.id));
  const inheritedProviderNeedsMatch = !!selected?.proveedor && !draft.proveedores.some((row) => norm(row.nombre) === norm(selected.proveedor));
  const catalogLinkVisibleResults = useMemo(() => catalogLinkResults.filter((row) => (
    catalogLinkScope === "matriz" ? row.matrices?.length > 0 : true
  )), [catalogLinkResults, catalogLinkScope]);

  useEffect(() => {
    const term = String(catalogLinkQuery || "").trim();
    if (!catalogLinkOpen || !selected || term.length < 2) {
      setCatalogLinkResults([]);
      setCatalogLinkLoading(false);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCatalogLinkLoading(true);
      try {
        const results = await buscarCatalogoParaEstandarizacion(term);
        if (!cancelled) setCatalogLinkResults(results.filter((row) => row.id !== selected.id));
      } catch (searchError) {
        if (!cancelled) {
          setCatalogLinkResults([]);
          toast.error(searchError?.message || "No se pudo buscar en el catálogo.");
        }
      } finally {
        if (!cancelled) setCatalogLinkLoading(false);
      }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [catalogLinkOpen, catalogLinkQuery, selected?.id, toast]);

  function changeLine(nextLine) {
    setLineFilter(nextLine); setWorkFilter("todas"); setSelectedId(null); setConfirmPuntual(false);
  }

  function changeWork(nextWork) {
    setWorkFilter(nextWork); setSelectedId(null); setConfirmPuntual(false);
  }

  function selectItem(item) {
    const lineas = {};
    for (const row of item.modelos_estandar || []) lineas[String(row.modelo).replace(/^K/i, "")] = String(row.cantidad || 1);
    const decision = normalizacionEnLinea(item, lineFilter);
    if (decision?.decision === "estandar" && !lineas[lineFilter]) lineas[lineFilter] = String(decision.cantidad || 1);
    setSelectedId(item.id);
    setDraft({
      descripcion: item.descripcion || "",
      alias: item.alias || "",
      codigo: item.codigo || "",
      codigo_barra: item.codigo_barra || "",
      unidad_medida: item.unidad_medida || "unidad",
      categoria_id: item.categoria_id || "",
      notas: item.notas || "",
      proveedores: providerDraftsFor(item, catalogOptions.proveedores),
      cantidadVerificada: decision?.decision === "estandar" && decision?.cantidad_verificada === true,
      lineas,
    });
    setProviderToAdd("");
    setConfirmPuntual(false);
    setCatalogLinkOpen(false);
    setCatalogLinkQuery("");
    setCatalogLinkResults([]);
  }

  function toggleFocusedLine() {
    if (!lineFilter) return;
    setDraft((current) => {
      const lineas = { ...current.lineas };
      if (Object.prototype.hasOwnProperty.call(lineas, lineFilter)) delete lineas[lineFilter];
      else lineas[lineFilter] = "1";
      return { ...current, lineas, cantidadVerificada: false };
    });
    setConfirmPuntual(false);
  }

  async function guardar(decision) {
    if (!selected || !lineFilter || saving) return;
    if (!draft.descripcion.trim()) { toast.error("El producto necesita un nombre."); return; }
    const lineQuantity = qty(draft.lineas[lineFilter]);
    if (decision === "estandar" && (!selectedLineActive || lineQuantity <= 0)) {
      toast.error(`Activá K${lineFilter} e indicá la cantidad por barco.`); return;
    }
    if (decision === "puntual" && selectedLineActive && !confirmPuntual) {
      setConfirmPuntual(true); return;
    }

    const evidence = focusedEvidence.ingresos[0] || selectedEvidence?.ingresos.find((entry) => entry.linea === lineFilter) || null;
    setSaving(true);
    try {
      await guardarNormalizacionPorLinea({
        materialId: selected.id, descripcion: draft.descripcion.trim(), alias: draft.alias.trim(),
        modelo: lineFilter, decision, cantidad: decision === "estandar" ? lineQuantity : null,
        evidenciaObraId: selectedWork?.id || evidence?.obraId || null,
        evidenciaMovimientoId: evidence?.row?.id || null,
        codigo: draft.codigo,
        codigoBarra: draft.codigo_barra,
        unidadMedida: draft.unidad_medida,
        categoriaId: draft.categoria_id || null,
        notas: draft.notas,
        proveedores: draft.proveedores,
        cantidadVerificada: draft.cantidadVerificada,
      });
      setStatus(decision);
      await recargar();
      await onSaved?.();
      toast.success(decision === "estandar" ? `Producto aprobado como estándar en K${lineFilter}.` : `Producto marcado como puntual en K${lineFilter}.`);
    } catch (err) {
      toast.error(err?.message || "No se pudo guardar la decisión.");
    } finally {
      setSaving(false);
    }
  }

  async function vincularIngresoAlCatalogo(candidate) {
    if (!selected || candidate?.es_requisito || !candidate?.id || linkingMaterialId) return;
    const snapshotIds = focusedEvidence.ingresos.map((entry) => entry.row?.id).filter(Boolean);
    if (!snapshotIds.length) {
      toast.error("No hay ingresos visibles para vincular en este enfoque.");
      return;
    }
    setLinkingMaterialId(candidate.id);
    try {
      await vincularMovimientosAMaterial(snapshotIds, candidate.id);
      setCatalogLinkOpen(false);
      setCatalogLinkQuery("");
      setCatalogLinkResults([]);
      setSelectedId(null);
      await recargar({ keepSelection: false });
      await onSaved?.();
      toast.success(`${snapshotIds.length} ingreso${snapshotIds.length === 1 ? "" : "s"} quedó vinculado a “${candidate.descripcion}”. El nombre original de Pañol se conserva en el movimiento.`);
    } catch (linkError) {
      toast.error(linkError?.message || "No se pudo vincular el ingreso al producto elegido.");
    } finally {
      setLinkingMaterialId(null);
    }
  }

  function addProvider() {
    const provider = catalogOptions.proveedores.find((row) => row.id === providerToAdd);
    if (!provider || draft.proveedores.some((row) => row.proveedor_id === provider.id)) return;
    setDraft((current) => ({ ...current, proveedores: [...current.proveedores, { proveedor_id: provider.id, nombre: provider.nombre, precio: "", moneda: "ARS" }] }));
    setProviderToAdd("");
  }

  function updateProvider(providerId, patch) {
    setDraft((current) => ({ ...current, proveedores: current.proveedores.map((row) => row.proveedor_id === providerId ? { ...row, ...patch } : row) }));
  }

  function removeProvider(providerId) {
    setDraft((current) => ({ ...current, proveedores: current.proveedores.filter((row) => row.proveedor_id !== providerId) }));
  }

  return (
    <div className="norm-root" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", background: C.bg }}>
      <style>{`
        .norm-root .norm-toolbar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; flex-shrink:0; }
        @media (max-width: 899px) {
          .norm-root .norm-toolbar { flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; }
          .norm-root .norm-toolbar::-webkit-scrollbar { display:none; }
        }
      `}</style>
      <div className="norm-toolbar" style={{ minHeight: isMobile ? 44 : 40, padding: isMobile ? "6px 10px" : "5px 12px", borderBottom: `1px solid ${C.border}`, background: C.topbarSoft }}>
        <div title="Estandarización por línea y obra" style={{ display: "inline-flex", alignItems: "center", gap: 7, paddingRight: 4, color: C.text, whiteSpace: "nowrap" }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue, flexShrink: 0 }}><Sparkles size={13} /></span>
          <span style={{ fontSize: 12, fontWeight: 750 }}>Estandarizar</span>
        </div>
        <select aria-label="Línea enfocada" title="Línea enfocada" value={lineFilter} onChange={(event) => changeLine(event.target.value)} style={{ ...FIELD, width: isMobile ? 112 : 118, minHeight: isMobile ? 36 : 30, padding: "4px 7px", fontSize: 10.5, fontWeight: 700 }}>
          {!lineFilter && <option value="">Elegir línea</option>}
          {modelOptions.map((modelo) => <option key={modelo} value={modelo}>Línea K{modelo}</option>)}
        </select>
        <select aria-label="Obra de referencia" title="Obra de referencia" value={workFilter} onChange={(event) => changeWork(event.target.value)} disabled={!lineFilter} style={{ ...FIELD, width: isMobile ? "calc(100% - 236px)" : 220, minWidth: isMobile ? 138 : 180, minHeight: isMobile ? 36 : 30, padding: "4px 7px", fontSize: 10.5, opacity: lineFilter ? 1 : 0.55 }}>
          <option value="todas">Todas las obras de K{lineFilter || "—"}</option>
          {workOptions.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo}{workStateLabel(obra.estado) ? ` · ${workStateLabel(obra.estado)}` : ""}</option>)}
        </select>
        <span aria-hidden="true" style={{ width: 1, height: 22, background: C.border, margin: "0 2px" }} />
        {Object.entries(STATUS_META).map(([key, meta]) => <KpiChip key={key} label={meta.label} value={counts[key]} meta={meta} active={status === key} onClick={() => { setStatus(key); setSelectedId(null); }} />)}
        <div style={{ flex: "1 1 210px", minWidth: isMobile ? "100%" : 180, position: "relative", marginLeft: isMobile ? 0 : 4 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim, pointerEvents: "none" }} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, código o proveedor…" style={{ ...FIELD, minHeight: isMobile ? 36 : 30, padding: "4px 28px 4px 29px", fontSize: 10.5 }} />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda" style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: C.dim, padding: 5, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={12} /></button>}
        </div>
        <button type="button" onClick={() => recargar()} disabled={loading} aria-label="Actualizar bandeja" title="Actualizar bandeja" style={{ width: 30, height: 30, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 8, padding: 0, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, display: "grid", placeItems: "center", flexShrink: 0 }}><RefreshCw size={12} /></button>
      </div>

      {error ? (
        <div style={{ margin: 16, padding: 13, border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, fontSize: 12 }}>{error}</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(330px, 38%) minmax(0, 1fr)", overflow: "hidden" }}>
          <div style={{ minHeight: 0, overflowY: "auto", padding: 9, borderRight: isMobile ? "none" : `1px solid ${C.border}`, display: isMobile && selected ? "none" : "grid", alignContent: "start", gap: 5 }}>
            {loading ? (
              <Cargando texto="Buscando ingresos para revisar…" />
            ) : filtered.length === 0 ? (
              <div style={{ margin: 6, padding: "32px 18px", border: `1px dashed ${C.border}`, borderRadius: 12, textAlign: "center", color: C.dim }}>
                <Check size={24} color={status === "pendiente" ? C.green : C.dim} />
                <div style={{ color: C.text, fontSize: 13, fontWeight: 700, marginTop: 8 }}>{status === "pendiente" ? "Sin pendientes en este enfoque" : "Sin productos en esta vista"}</div>
                <div style={{ fontSize: 11, lineHeight: 1.45, marginTop: 4 }}>Probá con otra obra, estado o búsqueda.</div>
              </div>
            ) : filtered.map((item) => {
              const evidence = evidenceInScope(evidenceById.get(item.id), lineFilter, workFilter);
              const last = evidence.ingresos[0];
              const selectedRow = selectedId === item.id;
              const meta = STATUS_META[estadoEnLinea(item, lineFilter)];
              return (
                <button key={item.id} type="button" onClick={() => selectItem(item)} style={{ width: "100%", display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto", alignItems: "center", gap: 9, border: `1px solid ${selectedRow ? C.blueB : C.border}`, borderLeft: `3px solid ${selectedRow ? C.blue : meta.color}`, background: selectedRow ? C.blueL : C.panelSolid, color: C.text, borderRadius: 10, padding: "8px 9px", cursor: "pointer", textAlign: "left", fontFamily: C.sans }}>
                  <ProductThumb material={item} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion || "Sin nombre"}</span>
                    <span style={{ display: "block", color: C.dim, fontSize: 10.25, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.codigo || "sin código"}{item.proveedor ? ` · ${item.proveedor}` : ""}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, color: C.dim, fontSize: 9.5, flexWrap: "wrap" }}>
                      <span style={{ color: C.blue, fontWeight: 700 }}>K{lineFilter}</span>
                      <span>{evidence.ingresos.length} ingreso{evidence.ingresos.length === 1 ? "" : "s"}</span>
                      {last && <><span style={{ color: C.text, fontFamily: C.mono, fontWeight: 700 }}>{last.obraCodigo || "Stock general"}</span><span>{fmtDate(last.fecha)}</span></>}
                    </span>
                  </span>
                  <ChevronRight size={13} style={{ color: selectedRow ? C.blue : C.dim }} />
                </button>
              );
            })}
          </div>

          <section style={{ minWidth: 0, minHeight: 0, display: isMobile && !selected ? "none" : "flex", flexDirection: "column", overflow: "hidden" }}>
            {!selected ? (
              <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
                <div style={{ maxWidth: 380, textAlign: "center", color: C.dim }}><CircleDotDashed size={29} /><div style={{ color: C.text, fontSize: 14, fontWeight: 750, marginTop: 9 }}>Elegí un producto de K{lineFilter || "—"}</div><div style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 4 }}>Vas a ver cada ingreso con su fecha y barco antes de tomar la decisión.</div></div>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 12 : "14px 18px 26px" }}>
                  {isMobile && <button type="button" onClick={() => setSelectedId(null)} style={{ border: "none", background: "transparent", color: C.blue, padding: "4px 0 10px", cursor: "pointer", fontSize: 11.5, fontWeight: 700 }}>← Volver a la bandeja</button>}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                    <ProductThumb material={selected} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        <span style={{ color: C.text, fontSize: 15, fontWeight: 750 }}>{selected.descripcion}</span>
                        <span style={{ color: STATUS_META[selectedStatus].color, background: STATUS_META[selectedStatus].bg, border: `1px solid ${STATUS_META[selectedStatus].border}`, borderRadius: 999, padding: "2px 7px", fontSize: 9.5, fontWeight: 700 }}>{STATUS_META[selectedStatus].singular} en K{lineFilter}</span>
                      </div>
                      <div style={{ color: C.dim, fontSize: 10.5, marginTop: 3 }}>{originLabel(selected.origen)} · alta de catálogo {fmtDate(selected.created_at)}{selected.proveedor ? ` · ${selected.proveedor}` : ""}</div>
                    </div>
                    <button type="button" onClick={() => onOpenCatalog?.(selected.id)} title="Abrir ficha completa" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.blue, borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700 }}><ExternalLink size={12} /> Ficha</button>
                  </div>

                  <div style={{ marginTop: 15, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.5fr) minmax(190px,1fr)", gap: 10 }}>
                    <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7 }}>Nombre claro del producto</span><input value={draft.descripcion} onChange={(event) => setDraft((current) => ({ ...current, descripcion: event.target.value }))} style={FIELD} /></label>
                    <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7 }}>Alias de búsqueda</span><input value={draft.alias} onChange={(event) => setDraft((current) => ({ ...current, alias: event.target.value }))} placeholder="Cómo lo llama el taller" style={FIELD} /></label>
                  </div>

                  <section style={{ marginTop: 10, border: `1px solid ${catalogLinkOpen ? C.cyanB : C.border}`, background: catalogLinkOpen ? C.cyanL : C.panelSolid, borderRadius: 11, overflow: "hidden" }}>
                    <button type="button" onClick={() => setCatalogLinkOpen((current) => !current)} aria-expanded={catalogLinkOpen} style={{ width: "100%", minHeight: 42, padding: "8px 11px", border: "none", background: "transparent", color: C.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, textAlign: "left", fontFamily: C.sans }}>
                      <span style={{ width: 25, height: 25, display: "grid", placeItems: "center", borderRadius: 7, color: C.cyan, background: C.cyanL, border: `1px solid ${C.cyanB}`, flexShrink: 0 }}><Search size={13} /></span>
                      <span style={{ minWidth: 0, flex: 1 }}><span style={{ display: "block", fontSize: 11.5, fontWeight: 750 }}>Vincular con catálogo o lista matriz</span><span style={{ display: "block", color: C.dim, fontSize: 9.75, marginTop: 1 }}>Buscá el producto real aunque Pañol lo haya ingresado con otro nombre.</span></span>
                      <ChevronDown size={13} style={{ color: C.cyan, transform: catalogLinkOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }} />
                    </button>
                    {catalogLinkOpen && (
                      <div style={{ borderTop: `1px solid ${C.cyanB}`, padding: 10, display: "grid", gap: 8, background: C.panelSolid }}>
                        <div style={{ color: C.dim, fontSize: 10, lineHeight: 1.45 }}>
                          Pañol lo registró como <strong style={{ color: C.text }}>“{selected.descripcion}”</strong>. Al vincularlo, ese texto queda en el movimiento y el stock pasa a usar el producto elegido.
                        </div>
                        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                          {[ ["todo", "Catálogo completo"], ["matriz", "En listas matriz"] ].map(([value, label]) => {
                            const active = catalogLinkScope === value;
                            return <button key={value} type="button" onClick={() => setCatalogLinkScope(value)} aria-pressed={active} style={{ minHeight: 27, border: `1px solid ${active ? C.cyanB : C.border}`, background: active ? C.cyanL : C.panel2, color: active ? C.cyan : C.dim, borderRadius: 7, padding: "4px 8px", cursor: "pointer", fontFamily: C.sans, fontSize: 9.75, fontWeight: 700 }}>{label}</button>;
                          })}
                          <div style={{ flex: "1 1 200px", minWidth: 160, position: "relative" }}>
                            <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.dim, pointerEvents: "none" }} />
                            <input autoFocus value={catalogLinkQuery} onChange={(event) => setCatalogLinkQuery(event.target.value)} placeholder="Buscar por nombre, alias o código…" style={{ ...FIELD, minHeight: 31, padding: "5px 9px 5px 28px", fontSize: 10.5 }} />
                          </div>
                        </div>
                        {String(catalogLinkQuery || "").trim().length < 2 ? (
                          <div style={{ padding: "9px 2px 2px", color: C.dim, fontSize: 10.25 }}>Escribí al menos dos letras para buscar entre todos los productos y las listas matriz.</div>
                        ) : catalogLinkLoading ? (
                          <div style={{ padding: "9px 2px 2px", color: C.dim, fontSize: 10.25 }}>Buscando equivalencias…</div>
                        ) : catalogLinkVisibleResults.length === 0 ? (
                          <div style={{ padding: "9px 2px 2px", color: C.dim, fontSize: 10.25 }}>No encontramos productos para esa búsqueda{catalogLinkScope === "matriz" ? " dentro de las listas matriz" : ""}.</div>
                        ) : (
                          <div style={{ display: "grid", gap: 5, maxHeight: 270, overflowY: "auto", paddingRight: 2 }}>
                            {catalogLinkVisibleResults.map((candidate) => {
                              const isRequirement = candidate.es_requisito === true;
                              const isLinking = linkingMaterialId === candidate.id;
                              return (
                                <div key={candidate.id} style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 9, padding: "7px 8px", display: "grid", gap: 5 }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                      <span style={{ color: C.text, fontSize: 10.75, fontWeight: 750 }}>{candidate.descripcion || "Sin nombre"}</span>
                                      {isRequirement && <span style={{ color: C.violet, background: C.violetL, border: `1px solid ${C.violetB}`, borderRadius: 999, padding: "1px 5px", fontSize: 8.5, fontWeight: 750 }}>REQUISITO</span>}
                                      {!isRequirement && <span style={{ color: C.green, background: C.greenL, border: `1px solid ${C.greenB}`, borderRadius: 999, padding: "1px 5px", fontSize: 8.5, fontWeight: 750 }}>PRODUCTO</span>}
                                    </div>
                                    <div style={{ color: C.dim, fontSize: 9.5, marginTop: 2 }}>{[candidate.codigo, candidate.alias, candidate.proveedor].filter(Boolean).join(" · ") || "Sin código ni alias"}</div>
                                  </div>
                                  {candidate.matrices?.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{candidate.matrices.slice(0, 5).map((matrix) => <span key={matrix.key} style={{ color: matrix.rol === "requisito" ? C.violet : C.blue, border: `1px solid ${matrix.rol === "requisito" ? C.violetB : C.blueB}`, background: matrix.rol === "requisito" ? C.violetL : C.blueL, borderRadius: 5, padding: "2px 5px", fontSize: 8.75, fontFamily: C.mono, fontWeight: 700 }}>{matrixLabel(matrix)}</span>)}</div>}
                                  {isRequirement ? (
                                    <span style={{ color: C.dim, fontSize: 9.5 }}>Es una necesidad de matriz; elegí un producto físico para vincular el stock.</span>
                                  ) : (
                                    <div style={{ display: "flex", justifyContent: "flex-end" }}><button type="button" onClick={() => vincularIngresoAlCatalogo(candidate)} disabled={!!linkingMaterialId} style={{ minHeight: 27, border: `1px solid ${C.cyanB}`, background: C.cyanL, color: C.cyan, borderRadius: 7, padding: "4px 7px", cursor: linkingMaterialId ? "default" : "pointer", opacity: linkingMaterialId && !isLinking ? 0.55 : 1, fontFamily: C.sans, fontSize: 9.5, fontWeight: 750 }}>{isLinking ? "Vinculando…" : `Vincular ${focusedEvidence.ingresos.length} ingreso${focusedEvidence.ingresos.length === 1 ? "" : "s"}`}</button></div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  <details style={{ marginTop: 10, border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 11, overflow: "hidden" }}>
                    <summary style={{ minHeight: 40, padding: "8px 11px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", listStyle: "none", color: C.text }}>
                      <ChevronDown size={13} style={{ color: C.blue, flexShrink: 0 }} />
                      <span style={{ fontSize: 11.5, fontWeight: 750 }}>Más datos del producto</span>
                      <span style={{ color: C.dim, fontSize: 9.75 }}>Opcional</span>
                      <span style={{ marginLeft: "auto", color: C.dim, fontSize: 9.5, textAlign: "right" }}>{draft.codigo || "sin código"} · {draft.proveedores.length} prov.</span>
                    </summary>
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: 11, display: "grid", gap: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,minmax(0,1fr)) minmax(130px,.7fr)", gap: 9 }}>
                        <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.25, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Código interno</span><input value={draft.codigo} onChange={(event) => setDraft((current) => ({ ...current, codigo: event.target.value }))} placeholder="Código o modelo" style={FIELD} /></label>
                        <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.25, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Código de barras</span><input value={draft.codigo_barra} onChange={(event) => setDraft((current) => ({ ...current, codigo_barra: event.target.value }))} placeholder="EAN / SKU del proveedor" style={FIELD} /></label>
                        <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.25, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Unidad</span><input value={draft.unidad_medida} onChange={(event) => setDraft((current) => ({ ...current, unidad_medida: event.target.value }))} placeholder="unidad, m, kg…" style={FIELD} /></label>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(180px,.8fr) minmax(0,1.4fr)", gap: 9 }}>
                        <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.25, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Rubro / categoría</span><select value={draft.categoria_id} onChange={(event) => setDraft((current) => ({ ...current, categoria_id: event.target.value }))} style={FIELD}><option value="">Sin categoría</option>{catalogOptions.categorias.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label>
                        <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.25, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Observaciones de catálogo</span><input value={draft.notas} onChange={(event) => setDraft((current) => ({ ...current, notas: event.target.value }))} placeholder="Medidas, calidad, equivalencias u otra aclaración" style={FIELD} /></label>
                      </div>

                      <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: 11 }}>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ minWidth: 190, flex: "1 1 230px" }}><div style={{ color: C.text, fontSize: 11.5, fontWeight: 750 }}>Proveedores y precios</div><div style={{ color: C.dim, fontSize: 9.75, marginTop: 2 }}>Podés asociar varios; el precio es opcional y propio de cada uno.</div></div>
                          <select aria-label="Proveedor para agregar" value={providerToAdd} onChange={(event) => setProviderToAdd(event.target.value)} style={{ ...FIELD, width: isMobile ? "100%" : 210, minHeight: 32, padding: "5px 8px" }}><option value="">Elegir proveedor…</option>{availableProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.nombre}</option>)}</select>
                          <button type="button" onClick={addProvider} disabled={!providerToAdd} style={{ minHeight: 32, border: `1px solid ${providerToAdd ? C.blueB : C.border}`, background: providerToAdd ? C.blueL : C.panel2, color: providerToAdd ? C.blue : C.dim, borderRadius: 8, padding: "6px 9px", cursor: providerToAdd ? "pointer" : "default", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: C.sans, fontSize: 10.5, fontWeight: 700 }}><Plus size={12} /> Agregar</button>
                        </div>
                        {inheritedProviderNeedsMatch && <div style={{ marginTop: 8, color: C.cyan, background: C.cyanL, border: `1px solid ${C.cyanB}`, borderRadius: 8, padding: "6px 8px", fontSize: 9.75 }}>El proveedor heredado “{selected.proveedor}” no coincide con uno registrado. Elegilo de la lista si corresponde.</div>}
                        {draft.proveedores.length ? (
                          <div style={{ marginTop: 8, display: "grid", gap: 5 }}>
                            {draft.proveedores.map((provider) => (
                              <div key={provider.proveedor_id} style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) 76px 30px" : "minmax(150px,1fr) minmax(105px,.45fr) 76px 30px", alignItems: "center", gap: 6, border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 9, padding: 6 }}>
                                <span title={provider.nombre} style={{ minWidth: 0, color: C.text, fontSize: 10.75, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", gridColumn: isMobile ? "1 / -1" : "auto" }}>{provider.nombre}</span>
                                <input type="number" min="0" step="0.01" value={provider.precio} onChange={(event) => updateProvider(provider.proveedor_id, { precio: event.target.value })} aria-label={`Precio de ${provider.nombre}`} placeholder="Precio" style={{ ...FIELD, minWidth: 0, padding: "5px 7px", fontFamily: C.mono, fontSize: 10.5 }} />
                                <select value={provider.moneda} onChange={(event) => updateProvider(provider.proveedor_id, { moneda: event.target.value })} aria-label={`Moneda de ${provider.nombre}`} style={{ ...FIELD, minWidth: 0, padding: "5px 6px", fontSize: 10 }}><option value="ARS">ARS</option><option value="USD">USD</option></select>
                                <button type="button" onClick={() => removeProvider(provider.proveedor_id)} aria-label={`Quitar ${provider.nombre}`} title="Quitar proveedor" style={{ width: 30, height: 30, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.dim, borderRadius: 7, padding: 0, cursor: "pointer", display: "grid", placeItems: "center" }}><Trash2 size={12} /></button>
                              </div>
                            ))}
                          </div>
                        ) : <div style={{ marginTop: 8, padding: "8px 9px", border: `1px dashed ${C.border}`, borderRadius: 8, color: C.dim, fontSize: 10 }}>Todavía no hay proveedores asociados.</div>}
                      </section>
                    </div>
                  </details>

                  <section style={{ marginTop: 14, border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 11, overflow: "hidden" }}>
                    <div style={{ padding: "9px 11px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div><div style={{ color: C.text, fontSize: 12, fontWeight: 750 }}>Ingresos de {selectedWork?.codigo || `la línea K${lineFilter}`}</div><div style={{ color: C.dim, fontSize: 10.25, marginTop: 2 }}>Fecha, obra y cantidad que respaldan esta revisión.</div></div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ color: C.dim, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 7, padding: "3px 7px", fontSize: 9.5, fontWeight: 700 }}>{focusedEvidence.ingresos.length} mov.</span>
                        <span style={{ color: C.green, background: C.greenL, border: `1px solid ${C.greenB}`, borderRadius: 7, padding: "3px 7px", fontFamily: C.mono, fontSize: 10.5, fontWeight: 750 }}>+{fmtQty(focusedEvidence.cantidad)} {selected.unidad_medida || "u"}</span>
                      </div>
                    </div>
                    {focusedEvidence.ingresos.length ? (
                      <div>
                        {focusedEvidence.ingresos.slice(0, 10).map((entry) => (
                          <div key={entry.row.id || `${entry.fecha}-${entry.obraId}`} style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) auto" : "105px minmax(110px,0.8fr) minmax(120px,1fr) auto", alignItems: "center", gap: 8, padding: "7px 11px", borderBottom: `1px solid ${C.border}`, color: C.dim, fontSize: 10.5 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><CalendarDays size={11} /> {fmtDate(entry.fecha)}</span>
                            <span style={{ color: C.text, fontFamily: C.mono, fontWeight: 700 }}>{entry.obraCodigo || "Stock general"}</span>
                            {!isMobile && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "capitalize" }}>{originLabel(rowSource(entry.row))}{entry.row.stock_sede ? ` · ${entry.row.stock_sede}` : ""}</span>}
                            <span style={{ color: C.green, fontFamily: C.mono, fontWeight: 750, textAlign: "right" }}>+{fmtQty(entry.cantidad)}</span>
                          </div>
                        ))}
                        {focusedEvidence.ingresos.length > 10 && (
                          <details style={{ padding: "7px 11px" }}>
                            <summary style={{ color: C.blue, fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>Ver {focusedEvidence.ingresos.length - 10} ingresos anteriores</summary>
                            <div style={{ display: "grid", gap: 3, marginTop: 6 }}>
                              {focusedEvidence.ingresos.slice(10).map((entry) => <div key={entry.row.id || `${entry.fecha}-${entry.obraId}`} style={{ display: "grid", gridTemplateColumns: "95px minmax(0,1fr) auto", gap: 8, padding: "5px 0", color: C.dim, fontSize: 10.25 }}><span>{fmtDate(entry.fecha)}</span><span>{entry.obraCodigo || "Stock general"} · {originLabel(rowSource(entry.row))}</span><span style={{ color: C.green, fontFamily: C.mono, fontWeight: 700 }}>+{fmtQty(entry.cantidad)}</span></div>)}
                            </div>
                          </details>
                        )}
                      </div>
                    ) : <div style={{ padding: "16px 11px", color: C.dim, fontSize: 11 }}>No hay ingresos visibles para esta combinación de línea y obra.</div>}
                  </section>

                  {selectedDecision && (
                    <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 7, color: C.dim, fontSize: 10.25 }}>
                      <Check size={12} color={STATUS_META[selectedDecision.decision]?.color || C.green} />
                      Última decisión: {fmtDate(selectedDecision.revisado_at)}{selectedDecisionWork?.codigo ? ` · referencia ${selectedDecisionWork.codigo}` : ""}
                    </div>
                  )}

                  <section style={{ marginTop: 14 }}>
                    <div><div style={{ color: C.text, fontSize: 12.5, fontWeight: 750 }}>¿Es estándar para la línea K{lineFilter}?</div><div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>Esta decisión afecta solamente a K{lineFilter}; las otras líneas quedan intactas.</div></div>
                    <div style={{ marginTop: 9, border: `1px solid ${selectedLineActive ? C.blueB : C.border}`, background: selectedLineActive ? C.blueL : C.panelSolid, borderRadius: 10, padding: 10, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto minmax(0,1fr) minmax(230px,.75fr)", gap: 10, alignItems: "center" }}>
                      <button type="button" onClick={toggleFocusedLine} aria-pressed={selectedLineActive} style={{ minHeight: 32, borderRadius: 8, border: `1px solid ${selectedLineActive ? C.blue : C.border}`, background: selectedLineActive ? C.blue : C.panel, color: selectedLineActive ? "#fff" : C.dim, padding: "6px 9px", display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 }}><span style={{ width: 17, height: 17, borderRadius: 5, display: "grid", placeItems: "center", border: `1px solid ${selectedLineActive ? "rgba(255,255,255,.55)" : C.border}` }}>{selectedLineActive && <Check size={11} />}</span> Línea K{lineFilter}</button>
                      <span style={{ color: C.dim, fontSize: 10.5 }}>{selectedLineActive ? "Se incorporará a la matriz estándar." : "Activala para incorporarla como estándar."}</span>
                      {selectedLineActive && <div style={{ display: "grid", gridTemplateColumns: "minmax(100px,1fr) auto", gap: 6, alignItems: "end" }}><label style={{ display: "grid", gap: 4, color: C.dim, fontSize: 9.25, fontWeight: 700 }}>Cantidad/barco<input type="number" min="0.01" step="0.01" value={draft.lineas[lineFilter]} onChange={(event) => setDraft((current) => ({ ...current, cantidadVerificada: false, lineas: { ...current.lineas, [lineFilter]: event.target.value } }))} style={{ ...FIELD, minWidth: 0, padding: "6px 8px", fontFamily: C.mono, fontSize: 11.5 }} /></label><button type="button" onClick={() => setDraft((current) => ({ ...current, cantidadVerificada: !current.cantidadVerificada }))} aria-pressed={draft.cantidadVerificada} title="Indica que esta cantidad fue revisada" style={{ minHeight: 31, border: `1px solid ${draft.cantidadVerificada ? C.greenB : C.border}`, background: draft.cantidadVerificada ? C.greenL : C.panelSolid, color: draft.cantidadVerificada ? C.green : C.dim, borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontFamily: C.sans, fontSize: 9.5, fontWeight: 700 }}><span style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${draft.cantidadVerificada ? C.green : C.border}`, display: "grid", placeItems: "center" }}>{draft.cantidadVerificada && <Check size={9} />}</span>{draft.cantidadVerificada ? "Verificada" : "Verificar"}</button></div>}
                    </div>
                    {(selected.modelos_estandar || []).some((row) => String(row.modelo).replace(/^K/i, "") !== lineFilter) && (
                      <div style={{ marginTop: 7, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap", color: C.dim, fontSize: 9.75 }}>
                        También figura como estándar en
                        {(selected.modelos_estandar || []).filter((row) => String(row.modelo).replace(/^K/i, "") !== lineFilter).map((row) => <span key={row.modelo} style={{ color: C.text, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 6px", fontFamily: C.mono, fontWeight: 700 }}>K{String(row.modelo).replace(/^K/i, "")}</span>)}
                      </div>
                    )}
                  </section>
                </div>

                <div style={{ padding: isMobile ? 11 : "10px 18px", borderTop: `1px solid ${confirmPuntual ? C.cyanB : C.border}`, background: confirmPuntual ? C.cyanL : C.topbarSoft, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 7, flexWrap: "wrap", flexShrink: 0 }}>
                  {confirmPuntual ? (
                    <>
                      <span style={{ color: C.cyan, fontSize: 11, fontWeight: 700, marginRight: "auto" }}>Se quitará de K{lineFilter}. Las demás líneas no cambian.</span>
                      <button type="button" onClick={() => setConfirmPuntual(false)} disabled={saving} style={{ minHeight: 34, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "7px 10px", cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: C.sans }}>Cancelar</button>
                      <button type="button" onClick={() => guardar("puntual")} disabled={saving} style={{ minHeight: 34, border: `1px solid ${C.cyanB}`, background: C.cyan, color: "#fff", borderRadius: 9, padding: "7px 11px", cursor: saving ? "default" : "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: C.sans }}>{saving ? "Guardando…" : `Confirmar puntual en K${lineFilter}`}</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => guardar("puntual")} disabled={saving} style={{ minHeight: 34, border: `1px solid ${C.violetB}`, background: C.violetL, color: C.violet, borderRadius: 9, padding: "7px 11px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, fontSize: 11.5, fontWeight: 700, fontFamily: C.sans }}>Dejar puntual en K{lineFilter}</button>
                      <button type="button" onClick={() => guardar("estandar")} disabled={saving || !selectedLineActive} style={{ minHeight: 34, border: `1px solid ${C.blueB}`, background: C.blue, color: "#fff", borderRadius: 9, padding: "7px 12px", cursor: saving || !selectedLineActive ? "default" : "pointer", opacity: saving || !selectedLineActive ? 0.5 : 1, fontSize: 11.5, fontWeight: 700, fontFamily: C.sans, display: "inline-flex", alignItems: "center", gap: 6 }}><PackageCheck size={13} /> {saving ? "Guardando…" : `Guardar K${lineFilter} como estándar`}</button>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
