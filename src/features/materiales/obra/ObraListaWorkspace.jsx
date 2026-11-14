import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Filter, MoreHorizontal, X } from "lucide-react";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { MaterialThumb } from "../MaterialExtras";
import { coincideProveedor, nombresProveedor } from "../proveedorNombre";
import { compararEtiquetaGrupo, paginateObraGroups, rubroDeFila, toggleObraSelection, obraThemeScope } from "./obraListaPresentation";

const button = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px solid ${C.border}`, borderRadius: 6, background: C.panelSolid, color: C.text, minHeight: 32, padding: "5px 9px", fontFamily: C.sans, fontSize: 12, cursor: "pointer", transition: "background 150ms ease, border-color 150ms ease" };
const muted = { color: C.muted, fontSize: 12 };
const numberStyle = { fontFamily: C.mono, fontVariantNumeric: "tabular-nums", textAlign: "right", whiteSpace: "nowrap" };

// Local aliases also cover existing children without changing the global palette.

export function ObraWorkspaceStyles() {
  return <style>{`
    .obra-workspace :is(button,input,select,textarea,a,[tabindex]):focus-visible { outline: 2px solid var(--blue) !important; outline-offset: 2px; }
    .obra-workspace button:disabled { cursor: default !important; opacity: .5; }
    .obra-workspace button:not(:disabled):hover { filter: brightness(.97); border-color: var(--blue-border); }
    .obra-workspace .obra-data-row:hover { background: var(--panel-2) !important; }
    .obra-workspace .obra-filtro-opcion:hover { background: var(--panel-2); }
    .obra-workspace .obra-filtro-solo { opacity: 0; transition: opacity 120ms ease; }
    .obra-workspace .obra-filtro-opcion:hover .obra-filtro-solo,
    .obra-workspace .obra-filtro-solo:focus-visible { opacity: 1; }
    .obra-workspace .obra-data-row:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; background: var(--blue-soft) !important; }
    .obra-workspace .obra-scroll { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
    .obra-workspace .obra-chips { scrollbar-width: none; -webkit-mask-image: linear-gradient(90deg, #000 92%, transparent); mask-image: linear-gradient(90deg, #000 92%, transparent); }
    .obra-workspace .obra-chips::-webkit-scrollbar { display: none; }
    .obra-workspace .obra-data-row { transition: background 140ms ease; }
    .obra-workspace .obra-index-item { transition: background 150ms ease, color 150ms ease, transform 150ms ease; }
    .obra-workspace .obra-index-item:active { transform: translateX(2px); }
    .obra-workspace .obra-page-content, .obra-workspace .obra-detail-content { animation: obra-content-in 150ms ease-out; }
    @keyframes obra-content-in { from { opacity: .55; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
    .materiales-page-body:has(.obra-workspace) { padding: 12px 24px 18px !important; }
    .materiales-page-body:has(.obra-workspace) .materiales-page-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 16px; margin-bottom: 8px !important; }
    .materiales-page-body:has(.obra-workspace) .materiales-page-heading h1 { font-size: 20px !important; line-height: 1.2; }
    .materiales-page-body:has(.obra-workspace) .materiales-page-heading > div { font-size: 11px !important; margin-top: 0 !important; }
    .materiales-page-body:has(.obra-workspace) .materiales-page-tabs { margin-bottom: 8px !important; }
    .materiales-page-body:has(.obra-workspace) .materiales-tabbar { padding: 3px; }
    .materiales-page-body:has(.obra-workspace) .materiales-tab { min-height: 30px; padding: 0 12px; font-size: 12px; }
    @media (max-width: 899px) {
      .materiales-page-body:has(.obra-workspace) { padding: 10px 12px 18px !important; }
      .materiales-page-body:has(.obra-workspace) .materiales-tab { min-height: 44px; }
    }
    .obra-material-editor { container-type: inline-size; }
    .obra-material-editor :is(div,span,input,select,textarea) { min-width: 0; }
    .obra-material-editor :is(input,select,textarea) { max-width: 100%; box-sizing: border-box; }
    .obra-material-editor .material-editor-pair { grid-template-columns: minmax(0,.8fr) minmax(0,1.2fr) !important; }
    .obra-material-editor .material-editor-fields { grid-template-columns: repeat(4,minmax(0,1fr)) !important; }
    .obra-material-editor .material-links-row { grid-template-columns: minmax(0,1fr) minmax(0,1.4fr) minmax(0,1fr) auto !important; }
    .obra-material-editor .material-barcode-row { grid-template-columns: repeat(auto-fit,minmax(min(140px,100%),1fr)) !important; }
    @container (max-width: 560px) {
      .obra-material-editor .material-editor-pair { grid-template-columns: minmax(0,1fr) !important; }
      .obra-material-editor .material-editor-fields, .obra-material-editor .material-links-row { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
    }
    .obra-workspace .obra-selbar { animation: obra-fade-in 160ms cubic-bezier(.22,1,.36,1); }
    @keyframes obra-fade-in { from { opacity: 0; } to { opacity: 1; } }
    .obra-workspace .obra-chips > * { flex-shrink: 0; }
    .obra-drawer { animation: obra-drawer-in 160ms ease-out; }
    @keyframes obra-drawer-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
    @media (prefers-reduced-motion: reduce) { .obra-workspace *, .obra-drawer { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
    .obra-table-narrow .obra-selection { min-width: 44px !important; min-height: 44px !important; }
    @media (max-width: 899px), (pointer: coarse) {
      .obra-workspace button, .obra-workspace select, .obra-workspace input:not([type=checkbox]):not([type=file]) { min-height: 44px !important; }
      .obra-workspace input[type=checkbox] { width: 22px; height: 22px; }
      .obra-workspace .obra-pagination button, .obra-drawer button { min-width: 44px; }
      .obra-workspace .obra-filtro-solo { opacity: 1; }
    }
  `}</style>;
}

/**
 * Filtro de columna, como el de una planilla: se hace clic en el encabezado y
 * se tildan los valores que se quieren ver.
 *
 * Las opciones salen de lo que la columna muestra realmente, no de una tabla
 * aparte: si en pantalla dice "Parcial", en el filtro dice "Parcial".
 *
 * El panel va con position:fixed porque el encabezado vive adentro de un
 * contenedor con overflow y si no queda recortado.
 */
export function ObraColumnFilter({ label, options, selected, onChange, align = "left" }) {
  const [open, setOpen] = useState(false);
  const [caja, setCaja] = useState(null);
  const botonRef = useRef(null);
  const panelRef = useRef(null);
  const activo = selected.size > 0;

  useEffect(() => {
    if (!open) return undefined;
    const afuera = (event) => {
      if (panelRef.current?.contains(event.target) || botonRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    // En captura y cortando la propagación: si no, el Escape también cierra el
    // detalle que pueda estar abierto detrás.
    const escape = (event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); botonRef.current?.focus(); } };
    const mover = () => setOpen(false);
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", mover);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", mover);
    };
  }, [open]);

  function abrir() {
    const r = botonRef.current?.getBoundingClientRect();
    if (r) setCaja({ top: r.bottom + 4, left: r.left, right: window.innerWidth - r.right });
    setOpen((v) => !v);
  }
  function alternar(value) {
    const next = new Set(selected);
    next.has(value) ? next.delete(value) : next.add(value);
    onChange(next);
  }

  const total = options.reduce((sum, o) => sum + o.count, 0);
  const panel = open && caja ? createPortal(
    <div ref={panelRef} role="dialog" aria-label={`Filtrar por ${label}`} className="obra-workspace" style={{
      position: "fixed", top: caja.top, ...(align === "right" ? { right: caja.right } : { left: caja.left }),
      zIndex: 60, minWidth: 210, maxWidth: 280, background: C.panelSolid, border: `1px solid ${C.border}`,
      borderRadius: 8, boxShadow: "0 14px 40px var(--shadow)", padding: 6, fontFamily: C.sans,
      // Va por portal al body: no hereda el color de la tabla, hay que decirlo.
      color: C.text,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "3px 6px 6px" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{label}</span>
        <button type="button" onClick={() => onChange(new Set())} disabled={!activo} style={{ ...button, minHeight: 24, padding: "2px 7px", fontSize: 11, border: "none", background: "transparent", color: activo ? C.blue : C.muted }}>Todos</button>
      </div>
      <div className="obra-scroll" style={{ maxHeight: 260, overflowY: "auto" }}>
        {options.map((o) => {
          const marcado = selected.has(o.value);
          return <div key={o.value} className="obra-filtro-opcion" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, cursor: "pointer" }}>
              <input type="checkbox" checked={marcado} onChange={() => alternar(o.value)} style={{ accentColor: C.blue, margin: 0 }} />
              {o.color && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 3, background: o.color, flexShrink: 0 }} />}
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{o.label}</span>
            </label>
            <span style={{ ...numberStyle, fontSize: 11, color: C.muted }}>{o.count.toLocaleString("es-AR")}</span>
            <button type="button" className="obra-filtro-solo" onClick={() => onChange(new Set([o.value]))} title={`Ver sólo ${o.label}`} style={{ border: "none", background: "transparent", color: C.blue, fontSize: 10.5, cursor: "pointer", padding: "0 2px", fontFamily: C.sans }}>sólo</button>
          </div>;
        })}
        {!options.length && <div style={{ padding: "14px 8px", textAlign: "center", ...muted, fontSize: 11 }}>Nada para filtrar.</div>}
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, padding: "6px 6px 2px", ...muted, fontSize: 11 }}>
        {activo ? `${options.filter((o) => selected.has(o.value)).reduce((s, o) => s + o.count, 0).toLocaleString("es-AR")} de ${total.toLocaleString("es-AR")}` : `${total.toLocaleString("es-AR")} ítems`}
      </div>
    </div>, document.body) : null;

  return <>
    <button ref={botonRef} type="button" onClick={abrir} aria-haspopup="dialog" aria-expanded={open}
      title={activo ? `${label}: ${[...selected].join(", ")}` : `Filtrar por ${label}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, width: "100%", border: "none", background: "transparent", padding: "0 8px", minHeight: 32, color: activo ? C.blue : "inherit", font: "inherit", fontWeight: 600, cursor: "pointer" }}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <Filter size={11} style={{ flexShrink: 0, opacity: activo ? 1 : 0.45 }} />
      {activo && <span style={{ ...numberStyle, fontSize: 10, color: C.blue }}>{selected.size}</span>}
    </button>
    {panel}
  </>;
}

export function ObraStatusBadge({ status }) {
  return <span title={status.title || status.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: status.color, background: status.bg, border: `1px solid ${status.border}`, borderRadius: 5, fontSize: 11, fontWeight: 600, lineHeight: 1.2, padding: "3px 6px", whiteSpace: "nowrap" }}>{status.label}</span>;
}

function SelectionBox({ rows, selected, onToggle, label }) {
  const ref = useRef(null);
  const count = rows.filter((row) => selected.has(row.id)).length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && count < rows.length; }, [count, rows.length]);
  return <label className="obra-selection" style={{ minWidth: 32, minHeight: 32, display: "inline-grid", placeItems: "center", cursor: "pointer" }} title={label}>
    <input ref={ref} type="checkbox" aria-label={label} checked={rows.length > 0 && count === rows.length} disabled={!rows.length} onChange={onToggle} style={{ accentColor: C.blue, margin: 0 }} />
  </label>;
}

const LOTE_FILAS = 200;

function SortHeader({ label, k, orden, onOrden, align = "left", title }) {
  const activo = orden?.key === k;
  return <button type="button" onClick={() => onOrden(activo ? (orden.dir > 0 ? { key: k, dir: -1 } : { key: "", dir: 1 }) : { key: k, dir: 1 })}
    aria-sort={activo ? (orden.dir > 0 ? "ascending" : "descending") : "none"} title={title || `Ordenar por ${label.toLowerCase()}`}
    style={{ display: "inline-flex", alignItems: "center", gap: 3, width: "100%", justifyContent: align === "right" ? "flex-end" : "flex-start", border: "none", background: "transparent", padding: 0, minHeight: 30, font: "inherit", color: activo ? C.blue : "inherit", cursor: "pointer" }}>
    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    {activo ? (orden.dir > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
  </button>;
}

/**
 * La lista de una obra como planilla: una fila por material, columnas que se
 * ordenan, filtro de Estado en el encabezado y el resumen al pie. Sin páginas:
 * se van dibujando de a 200 a medida que se baja, así una obra de 700 ítems
 * abre rápido y se puede tildar todo lo filtrado de un clic.
 */
export function ObraListaTable({ groups, allRows, visibleRows = [], filterKey, rubro, onRubro, proveedor, onProveedor, selected, onSelectionChange, getRowView, onOpen, detailId, onImageUploaded, estadoOpciones = [], estadosSel = new Set(), onEstados = () => {}, orden, onOrden = () => {}, valorizacion, accionesSeleccion }) {
  const { isMobile } = useResponsive();
  const containerRef = useRef(null);
  const gridRef = useRef(null);
  const scrollRef = useRef(null);
  const [width, setWidth] = useState(1200);
  const [listHeight, setListHeight] = useState(600);
  const [indexMode, setIndexMode] = useState("rubro");
  const [limiteState, setLimiteState] = useState({ key: filterKey, n: LOTE_FILAS });
  const [closedGroups, setClosedGroups] = useState(() => new Set());
  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setWidth(rect.width);
      const gridTop = gridRef.current?.getBoundingClientRect().top ?? rect.top;
      setListHeight(Math.max(360, window.innerHeight - gridTop - 18));
    };
    const observer = new ResizeObserver(measure);
    if (containerRef.current) { observer.observe(containerRef.current); observer.observe(containerRef.current.parentElement); }
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const narrow = isMobile || width < 860;
  const phone = width < 560;
  // En el celular la lista corre con la página en vez de tener su propia caja
  // con scroll: con el encabezado de la obra arriba quedaban ~300 px para
  // renglones (cinco ítems) y había que arrastrar en dos lugares distintos.
  const flujo = narrow;
  const finRef = useRef(null);
  const compact = width < 1120;
  const limite = limiteState.key === filterKey ? limiteState.n : LOTE_FILAS;
  const plano = groups.length === 1 && groups[0].plano;
  const recorte = useMemo(() => paginateObraGroups(groups, 1, limite), [groups, limite]);
  const indexEntries = useMemo(() => {
    const counts = new Map();
    allRows.forEach((row) => {
      if (indexMode === "rubro" && !coincideProveedor(row.proveedor, proveedor)) return;
      if (indexMode === "proveedor" && rubro && rubroDeFila(row) !== rubro) return;
      const proveedoresFila = nombresProveedor(row.proveedor);
      const names = indexMode === "proveedor" ? (proveedoresFila.length ? proveedoresFila : ["Sin proveedor"]) : [rubroDeFila(row)];
      for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts].sort(([a], [b]) => compararEtiquetaGrupo(a, b));
  }, [allRows, indexMode, proveedor, rubro]);
  const indexValue = indexMode === "rubro" ? rubro : proveedor;
  const onIndexChange = indexMode === "rubro" ? onRubro : onProveedor;
  const indexTotal = allRows.filter((row) => indexMode === "proveedor" ? (!rubro || rubroDeFila(row) === rubro) : coincideProveedor(row.proveedor, proveedor)).length;
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [filterKey]);
  // Con la lista corriendo en la página no hay onScroll propio: el próximo
  // tramo se dibuja cuando el aviso del final se acerca a la pantalla.
  const hayMas = recorte.end < recorte.total;
  useEffect(() => {
    if (!flujo || !hayMas || !finRef.current) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimiteState({ key: filterKey, n: limite + LOTE_FILAS });
    }, { rootMargin: "600px 0px" });
    observer.observe(finRef.current);
    return () => observer.disconnect();
  }, [flujo, hayMas, filterKey, limite]);
  function onScroll(event) {
    const el = event.currentTarget;
    if (recorte.end < recorte.total && el.scrollTop + el.clientHeight > el.scrollHeight - 600) setLimiteState({ key: filterKey, n: limite + LOTE_FILAS });
  }
  function selectRows(rows) { onSelectionChange((current) => toggleObraSelection(current, rows)); }
  function toggleGroup(label) { setClosedGroups((current) => { const next = new Set(current); next.has(label) ? next.delete(label) : next.add(label); return next; }); }
  function onRowKey(event, row) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") { event.preventDefault(); onOpen(row, event.currentTarget); }
    if (event.key === " ") { event.preventDefault(); selectRows([row]); }
    if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const elements = [...scrollRef.current.querySelectorAll(".obra-data-row")];
      const current = elements.indexOf(event.currentTarget);
      const next = event.key === "Home" ? 0 : event.key === "End" ? elements.length - 1 : current + (event.key === "ArrowDown" ? 1 : -1);
      elements[Math.max(0, Math.min(elements.length - 1, next))]?.focus();
    }
  }
  const tildadosVisibles = visibleRows.reduce((n, row) => n + (selected.has(row.id) ? 1 : 0), 0);
  const tildadosFuera = selected.size - tildadosVisibles;
  // Columnas: ☐ · Material · Proveedor · Nec. · Rec. · Entr. · Falta · Estado · Precio · ⋯
  const columns = phone ? "40px minmax(0,1fr) 92px 40px"
    : narrow ? "40px minmax(0,1fr) 64px 92px 40px"
      : compact ? "34px minmax(200px,1fr) 70px 54px 54px 60px 96px 30px"
        : "34px minmax(220px,1fr) minmax(110px,170px) 76px 58px 58px 62px 96px 92px 30px";
  const cell = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", padding: "0 8px" };
  const num = { ...cell, ...numberStyle };
  const sub = { display: "block", fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 };
  const indexItem = (name, count) => <button key={name || "__todos"} className="obra-index-item" type="button" aria-pressed={indexValue === name} onClick={() => onIndexChange(name)}
    style={{ ...button, display: "flex", justifyContent: "space-between", gap: 10, textAlign: "left", width: narrow ? "auto" : "100%", flexShrink: 0, borderColor: narrow && indexValue !== name ? C.border : "transparent", background: indexValue === name ? C.blueL : "transparent", color: indexValue === name ? C.blue : C.muted, padding: narrow ? "4px 10px" : "6px 8px", marginBottom: narrow ? 0 : 1, borderRadius: narrow ? 999 : 6 }}>
    <span title={name} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: indexValue === name ? C.blue : C.text }}>{name || (indexMode === "rubro" ? "Todos los rubros" : "Todos")}</span><span style={{ ...numberStyle, fontSize: 10.5, color: indexValue === name ? C.blue : C.muted }}>{count.toLocaleString("es-AR")}</span>
  </button>;
  const modoIndice = <select aria-label="Índice de la lista" value={indexMode} onChange={(event) => setIndexMode(event.target.value)} style={{ ...button, width: narrow ? "auto" : "100%", flexShrink: 0, marginBottom: narrow ? 0 : 6, fontWeight: 600, background: C.panelSolid }}><option value="rubro">Rubros</option><option value="proveedor">Proveedores</option></select>;
  const index = narrow
    ? <nav aria-label="Filtrar por rubro o proveedor" className="obra-chips" style={{ display: "flex", gap: 5, alignItems: "center", overflowX: "auto", padding: "8px 8px", borderBottom: `1px solid ${C.border}` }}>{modoIndice}{[["", indexTotal], ...indexEntries].map(([name, count]) => indexItem(name, count))}</nav>
    : <nav aria-label="Filtrar por rubro o proveedor" className="obra-scroll" style={{ padding: "8px 6px", overflowY: "auto", minHeight: 0, borderRight: `1px solid ${C.border}`, background: C.panel }}>
      {modoIndice}
      {(indexMode === "rubro" ? proveedor : rubro) && <button type="button" onClick={() => indexMode === "rubro" ? onProveedor("") : onRubro("")} style={{ ...button, width: "100%", marginBottom: 6, color: C.blue, fontSize: 11 }} title="Quitar el otro filtro"><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{indexMode === "rubro" ? proveedor : rubro}</span><X size={12} /></button>}
      {[["", indexTotal], ...indexEntries].map(([name, count]) => indexItem(name, count))}
    </nav>;
  const header = <div role="row" style={{ display: "grid", gridTemplateColumns: columns, alignItems: "center", minHeight: 34, position: "sticky", top: 0, zIndex: 2, background: C.panelSolid, borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: 11, fontWeight: 500, letterSpacing: 0.2 }}>
    <div role="columnheader"><SelectionBox rows={visibleRows} selected={selected} onToggle={() => selectRows(visibleRows)} label={`Tildar todo lo filtrado (${visibleRows.length} ítems)`} /></div>
    <div role="columnheader" style={cell}><SortHeader label="Material" k="material" orden={orden} onOrden={onOrden} /></div>
    {!compact && <div role="columnheader" style={cell}><SortHeader label="Proveedor" k="proveedor" orden={orden} onOrden={onOrden} /></div>}
    {!narrow && <div role="columnheader" style={cell}><SortHeader label="Nec." k="necesario" orden={orden} onOrden={onOrden} align="right" title="Necesario para la obra" /></div>}
    {!narrow && <><div role="columnheader" style={{ ...cell, textAlign: "right" }} title="Recibido en pañol">Rec.</div><div role="columnheader" style={{ ...cell, textAlign: "right" }} title="Entregado a la obra">Entr.</div></>}
    {!phone && <div role="columnheader" style={cell}><SortHeader label="Falta" k="falta" orden={orden} onOrden={onOrden} align="right" title="Lo que le falta al barco: necesario menos entregado" /></div>}
    <div role="columnheader" style={{ ...cell, padding: 0 }}><ObraColumnFilter label="Estado" options={estadoOpciones} selected={estadosSel} onChange={onEstados} align="right" /></div>
    {!compact && <div role="columnheader" style={cell}><SortHeader label="Precio" k="precio" orden={orden} onOrden={onOrden} align="right" title="Precio unitario" /></div>}
    <div role="columnheader" aria-label="Detalle" />
  </div>;
  const fila = (row) => {
    const view = getRowView(row);
    const active = selected.has(row.id);
    const subtexto = [
      plano && !rubro ? row.rubro : "",
      compact ? (row.proveedor || "Sin proveedor") : "",
      narrow ? `${view.necesarioCorto} ${view.unidadCorta}`.trim() : "",
      view.origin,
    ].filter(Boolean).join(" · ");
    return <div key={row.id} role="row" tabIndex={0} className="obra-data-row" data-row-id={row.id} aria-selected={active} onKeyDown={(event) => onRowKey(event, row)} onDoubleClick={(event) => { if (!event.target.closest("button,input,a,select")) onOpen(row, event.currentTarget); }}
      style={{ display: "grid", gridTemplateColumns: columns, alignItems: "center", minHeight: narrow ? 52 : 38, background: active ? C.blueL : detailId === row.id ? C.panel : "transparent", borderBottom: `1px solid ${C.border}`, cursor: "default" }}>
      <div role="cell"><SelectionBox rows={[row]} selected={selected} onToggle={() => selectRows([row])} label={`Tildar ${row.descripcion}`} /></div>
      <div role="cell" style={{ ...cell, display: "flex", alignItems: "center", gap: 8, padding: "3px 6px" }}>
        <MaterialThumb material={view.imageMaterial} size={narrow ? 36 : 24} fallbackLabel={row.rubro?.slice(0, 1) || "M"} uploadMaterial={view.uploadMaterial} onUploaded={onImageUploaded} />
        <button type="button" onClick={(event) => onOpen(row, event.currentTarget)} style={{ display: "block", border: "none", background: "transparent", color: C.text, padding: 0, textAlign: "left", minWidth: 0, flex: 1, cursor: "pointer", fontFamily: C.sans, lineHeight: 1.3 }} title={[row.descripcion, row.codigo, view.issue].filter(Boolean).join(" · ")}>
          {/* En el celular el nombre va en dos renglones: cortado en 20 letras no
              se distingue "Buje de bronce 75x4…" de "Buje de bronce 90x…". */}
          <span style={narrow
            ? { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden", fontSize: 12.5, fontWeight: 500, overflowWrap: "anywhere" }
            : { display: "block", fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descripcion}</span>
          {(subtexto || view.issue) && <span style={sub}>{view.issue && <span style={{ color: C.red }}>{view.issue}{subtexto ? " · " : ""}</span>}{subtexto}</span>}
          {view.stockLibre && <span style={{ ...sub, color: C.green }} title={view.stockLibre.title}>{view.stockLibre.texto}</span>}
        </button>
      </div>
      {!compact && <div role="cell" title={row.proveedor} style={{ ...cell, whiteSpace: "nowrap", color: row.proveedor ? C.muted : C.dim }}>{row.proveedor || "—"}</div>}
      {!narrow && <div role="cell" style={num} title={view.quantityTitle}>{view.necesarioCorto} <span style={{ color: C.dim, fontFamily: C.sans, fontSize: 10.5 }}>{view.unidadCorta}</span></div>}
      {!narrow && <><div role="cell" style={{ ...num, color: view.cant.panol ? C.muted : C.dim }}>{view.cant.panol ? view.received : "·"}</div><div role="cell" style={{ ...num, color: view.cant.entregado ? C.muted : C.dim }}>{view.cant.entregado ? view.delivered : "·"}</div></>}
      {!phone && <div role="cell" style={{ ...num, color: view.falta ? view.faltaColor : C.dim, fontWeight: view.falta ? 600 : 400 }} title={view.faltaTitle}>{view.falta ? view.faltaTexto : "·"}</div>}
      <div role="cell" style={{ ...cell, padding: "0 4px" }}><ObraStatusBadge status={view.status} /></div>
      {!compact && <div role="cell" title={row.precio?.text} style={{ ...num, fontSize: 11, color: row.precio?.amount ? C.muted : C.dim }}>{row.precio?.amount ? row.precio.text : "—"}</div>}
      <div role="cell"><button type="button" title="Abrir detalle" aria-label={`Detalle de ${row.descripcion}`} onClick={(event) => onOpen(row, event.currentTarget)} style={{ ...button, borderColor: "transparent", padding: 4, minWidth: narrow ? 40 : 26, minHeight: narrow ? 40 : 30, background: "transparent", color: C.muted }}><MoreHorizontal size={15} /></button></div>
    </div>;
  };
  const barraSeleccion = selected.size > 0 && <div role="region" aria-label="Acciones sobre lo tildado" className={flujo ? "obra-selbar obra-chips" : "obra-selbar"} style={{ zIndex: 5, boxSizing: "border-box", ...(flujo ? { position: "sticky", bottom: 0, overflowX: "auto", flexWrap: "nowrap", borderRadius: 0, borderWidth: "1px 0 0", paddingBottom: "max(7px, env(safe-area-inset-bottom))" } : { position: "absolute", left: "50%", bottom: 48, transform: "translateX(-50%)", width: "max-content", maxWidth: "calc(100% - 20px)", flexWrap: "wrap", borderRadius: 10 }), display: "flex", alignItems: "center", gap: 6, padding: "7px 8px 7px 12px", background: C.panelSolid, border: `1px solid ${C.blueB}`, boxShadow: "0 14px 40px var(--shadow)" }}>
    <strong style={{ fontWeight: 600, fontSize: 12.5, color: C.text, marginRight: 4, whiteSpace: "nowrap" }}>{tildadosVisibles.toLocaleString("es-AR")} {tildadosVisibles === 1 ? "tildado" : "tildados"}</strong>
    {tildadosFuera > 0 && <span style={{ ...muted, fontSize: 11, whiteSpace: "nowrap" }} title="Lo tildado que quedó afuera del filtro no entra en las acciones.">+{tildadosFuera} fuera del filtro</span>}
    {accionesSeleccion}
    <button type="button" onClick={() => onSelectionChange(new Set())} aria-label="Quitar selección" title="Quitar selección" style={{ ...button, background: "transparent", borderColor: "transparent", color: C.muted }}><X size={14} /></button>
  </div>;
  // overflow "clip" y no "hidden": "hidden" convierte la caja en el contenedor
  // del sticky y el encabezado y el pie dejan de quedar pegados a la pantalla.
  return <div ref={containerRef} className={narrow ? "obra-table-narrow" : undefined} data-testid="obra-lista" style={{ position: "relative", minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 10, overflow: flujo ? "clip" : "hidden", background: C.panelSolid }}>
    {narrow && index}
    <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "176px minmax(0,1fr)", height: flujo ? "auto" : listHeight, minHeight: flujo ? 0 : 360 }}>
      {!narrow && index}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <div ref={scrollRef} onScroll={flujo ? undefined : onScroll} className="obra-scroll" style={{ overflow: flujo ? "visible" : "auto", flex: 1, minHeight: 0 }}>
          <div key={filterKey} className="obra-page-content" role="table" aria-label="Materiales de la obra" aria-rowcount={recorte.total} style={{ minWidth: narrow ? 0 : 640, fontSize: 12 }}>
            {header}
            {recorte.groups.map((group) => <Fragment key={group.label}>
              {!plano && <div role="row" style={{ display: "flex", alignItems: "center", minHeight: 32, background: C.panel, borderBottom: `1px solid ${C.border}` }}>
                <SelectionBox rows={group.allRows} selected={selected} onToggle={() => selectRows(group.allRows)} label={`Tildar ${group.label} (${group.allRows.length} ítems)`} />
                <button type="button" aria-expanded={!closedGroups.has(group.label)} onClick={() => toggleGroup(group.label)} style={{ ...button, minHeight: 30, border: "none", background: "transparent", flex: 1, justifyContent: "flex-start", minWidth: 0 }}>
                  {closedGroups.has(group.label) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{group.label}</span><span style={muted}>· {group.allRows.length}</span>
                </button>
              </div>}
              {!closedGroups.has(group.label) && group.rows.map(fila)}
            </Fragment>)}
          </div>
          {recorte.end < recorte.total && <div ref={finRef} style={{ padding: 14, textAlign: "center", ...muted }}>Mostrando {recorte.end.toLocaleString("es-AR")} de {recorte.total.toLocaleString("es-AR")} · seguí bajando</div>}
          {!recorte.total && <div style={{ padding: 36, textAlign: "center", color: C.muted }}>No hay ítems con esos filtros.</div>}
        </div>
        {flujo && barraSeleccion}
        {!(flujo && barraSeleccion) && <div className={narrow ? "obra-chips" : undefined} style={{ display: "flex", flexWrap: narrow ? "nowrap" : "wrap", overflowX: narrow ? "auto" : "visible", whiteSpace: "nowrap", gap: "4px 6px", alignItems: "center", padding: "6px 10px", borderTop: `1px solid ${C.border}`, background: C.panelSolid, fontSize: 11.5, ...(flujo ? { position: "sticky", bottom: 0, zIndex: 3, paddingBottom: "max(6px, env(safe-area-inset-bottom))" } : {}) }}>
          <span data-testid="obra-page-range" style={{ ...muted, fontVariantNumeric: "tabular-nums", marginRight: 4 }}>{recorte.total.toLocaleString("es-AR")} {recorte.total === 1 ? "ítem" : "ítems"}</span>
          {estadoOpciones.map((op) => {
            const on = estadosSel.size === 1 && estadosSel.has(op.value);
            return <button key={op.value} type="button" aria-pressed={on} onClick={() => onEstados(on ? new Set() : new Set([op.value]))} title={on ? "Ver todos los estados" : `Ver sólo ${op.label}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${on ? "var(--border-2)" : "transparent"}`, background: on ? "var(--panel-2)" : "transparent", borderRadius: 6, padding: "2px 7px", minHeight: 26, color: on ? C.text : C.muted, font: "inherit", cursor: "pointer" }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 2, background: op.color }} />{op.label}<span style={{ ...numberStyle, color: on ? C.text : C.muted }}>{op.count.toLocaleString("es-AR")}</span>
            </button>;
          })}
          <span style={{ flex: 1 }} />
          {valorizacion?.texto && !phone && <span style={{ ...muted, fontSize: 11 }} title="Suma sólo lo que tiene precio cargado: con ítems sin precio el total de la obra es mayor.">Valorizado <span style={{ ...numberStyle, color: C.text }}>{valorizacion.texto}</span> · {valorizacion.conPrecio} % con precio</span>}
        </div>}
      </div>
    </div>
    {!flujo && barraSeleccion}
  </div>;
}

export function ObraItemDrawer({ row, view, obraLabel, tab, onTab, onClose, onPrevious, onNext, suspendEscape, editing, renderContent, footer }) {
  const { isMobile } = useResponsive();
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    function onKey(event) {
      const nestedDialog = [...document.querySelectorAll('[role="dialog"]')].some((element) => element !== panelRef.current && element.getClientRects().length && Number(getComputedStyle(element).zIndex) > 4000);
      if (event.key === "Escape" && !event.defaultPrevented && !suspendEscape && !nestedDialog) { event.preventDefault(); onClose(); }
      if (event.key === "Tab" && isMobile && !suspendEscape && !nestedDialog) {
        const elements = [...panelRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type="hidden"]):not([type="file"]),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter((element) => element.getClientRects().length);
        const first = elements[0]; const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isMobile, suspendEscape]);
  return createPortal(<aside ref={panelRef} role="dialog" aria-modal={isMobile || undefined} aria-labelledby="obra-detail-title" className="obra-workspace obra-drawer" style={{ ...obraThemeScope, position: "fixed", top: isMobile ? 0 : 56, right: 0, bottom: 0, width: isMobile ? "100%" : editing ? "min(820px, 82vw)" : "min(600px, 58vw)", boxSizing: "border-box", zIndex: 4000, background: C.panelSolid, borderLeft: `1px solid ${C.border}`, boxShadow: "-12px 0 40px color-mix(in srgb, var(--text) 8%, transparent)", display: "flex", flexDirection: "column", color: C.text, fontFamily: C.sans }}>
    <div style={{ padding: isMobile ? "max(10px, env(safe-area-inset-top)) 18px 0" : "10px 18px 0", flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        {isMobile
          ? <button ref={closeRef} type="button" onClick={onClose} style={{ ...button, minHeight: 44 }}><ChevronLeft size={16} />Volver a la lista</button>
          : <span style={{ ...muted, fontSize: 10, letterSpacing: 1 }}>DETALLE DEL ÍTEM</span>}
        <div style={{ display: "flex", gap: 5 }}>
          <button type="button" disabled={!onPrevious} onClick={onPrevious} aria-label="Ítem anterior" style={button}><ChevronLeft size={14} /></button>
          <button type="button" disabled={!onNext} onClick={onNext} aria-label="Ítem siguiente" style={button}><ChevronRight size={14} /></button>
          {!isMobile && <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar detalle" style={button}><X size={16} /></button>}
        </div>
      </div>
      <h2 id="obra-detail-title" style={{ margin: "0 0 8px", fontSize: 19, lineHeight: 1.3, fontWeight: 600, overflowWrap: "anywhere" }}>{row.descripcion}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><ObraStatusBadge status={view.status} /><span style={muted}>{obraLabel}</span></div>
      <div role="tablist" aria-label="Detalle del material" style={{ display: "flex", gap: 20 }}>{[["resumen", "Resumen"], ["compras", "Compras"], ["mas", "Más"]].map(([key, label], index, tabs) => <button id={`obra-tab-${key}`} aria-controls={`obra-tabpanel-${key}`} key={key} type="button" role="tab" tabIndex={tab === key ? 0 : -1} aria-selected={tab === key} onClick={() => onTab(key)} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length][0]; onTab(next); document.getElementById(`obra-tab-${next}`)?.focus(); }} style={{ ...button, border: "none", borderBottom: `2px solid ${tab === key ? C.blue : "transparent"}`, borderRadius: 0, padding: "10px 0", background: "transparent", color: tab === key ? C.blue : C.muted }}>{label}</button>)}</div>
    </div>
    <div key={`${row.id}:${tab}`} role="tabpanel" id={`obra-tabpanel-${tab}`} aria-labelledby={`obra-tab-${tab}`} className="obra-scroll obra-detail-content" style={{ flex: 1, overflowY: "auto", minWidth: 0, minHeight: 0, padding: editing ? 20 : 18 }}>{renderContent(row, tab)}</div>
    <div style={{ padding: "12px 16px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", flexShrink: 0, borderTop: `1px solid ${C.border}`, background: C.panelSolid }}>{footer}{!isMobile && <div style={{ ...muted, fontSize: 10, textAlign: "right", marginTop: 6 }}>Esc · Cerrar</div>}</div>
  </aside>, document.body);
}
