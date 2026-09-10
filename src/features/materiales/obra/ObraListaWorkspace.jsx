import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Filter, ListFilter, MoreHorizontal, X } from "lucide-react";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { MaterialThumb } from "../MaterialExtras";
import { OBRA_PAGE_SIZE, obraPageNumbers, paginateObraGroups, toggleObraSelection, obraThemeScope } from "./obraListaPresentation";

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
    .obra-drawer { animation: obra-drawer-in 160ms ease-out; }
    @keyframes obra-drawer-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
    @media (prefers-reduced-motion: reduce) { .obra-workspace *, .obra-drawer { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
    @media (max-width: 899px), (pointer: coarse) { .obra-workspace button, .obra-workspace select, .obra-workspace input:not([type=checkbox]):not([type=file]) { min-height: 44px !important; } .obra-workspace input[type=checkbox] { width: 22px; height: 22px; } }
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
        <span style={{ fontSize: 11, fontWeight: 650, color: C.muted }}>{label}</span>
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
      style={{ display: "inline-flex", alignItems: "center", gap: 4, width: "100%", border: "none", background: "transparent", padding: "0 8px", minHeight: 32, color: activo ? C.blue : "inherit", font: "inherit", fontWeight: 650, cursor: "pointer" }}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <Filter size={11} style={{ flexShrink: 0, opacity: activo ? 1 : 0.45 }} />
      {activo && <span style={{ ...numberStyle, fontSize: 10, color: C.blue }}>{selected.size}</span>}
    </button>
    {panel}
  </>;
}

export function ObraStatusBadge({ status }) {
  return <span title={status.title || status.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: status.color, background: status.bg, border: `1px solid ${status.border}`, borderRadius: 5, fontSize: 11, fontWeight: 650, lineHeight: 1.2, padding: "3px 6px", whiteSpace: "nowrap" }}>{status.label}</span>;
}

function SelectionBox({ rows, selected, onToggle, label }) {
  const ref = useRef(null);
  const count = rows.filter((row) => selected.has(row.id)).length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && count < rows.length; }, [count, rows.length]);
  return <label style={{ minWidth: 32, minHeight: 32, display: "inline-grid", placeItems: "center", cursor: "pointer" }} title={label}>
    <input ref={ref} type="checkbox" aria-label={label} checked={rows.length > 0 && count === rows.length} disabled={!rows.length} onChange={onToggle} style={{ accentColor: C.blue, margin: 0 }} />
  </label>;
}

export function ObraListaTable({ groups, allRows, filterKey, rubro, onRubro, proveedor, onProveedor, selected, onSelectionChange, getRowView, onOpen, detailId, onImageUploaded, estadoOpciones = [], estadosSel = new Set(), onEstados = () => {} }) {
  const { isMobile } = useResponsive();
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const [width, setWidth] = useState(1200);
  const [listHeight, setListHeight] = useState(600);
  const [indexMode, setIndexMode] = useState("rubro");
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const [closedGroups, setClosedGroups] = useState(() => new Set());
  const [indexOpen, setIndexOpen] = useState(false);
  const [jump, setJump] = useState("");
  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setWidth(rect.width);
      setListHeight(Math.max(360, window.innerHeight - rect.top - 22));
    };
    const observer = new ResizeObserver(measure);
    if (containerRef.current) { observer.observe(containerRef.current); observer.observe(containerRef.current.parentElement); }
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const narrow = isMobile || width < 760;
  const compact = width < 1100;
  const pagination = useMemo(() => paginateObraGroups(groups, pageState.key === filterKey ? pageState.page : 1), [groups, pageState, filterKey]);
  const pageRows = useMemo(() => pagination.groups.flatMap((group) => group.rows), [pagination.groups]);
  const indexEntries = useMemo(() => {
    const counts = new Map();
    allRows.forEach((row) => {
      if (indexMode === "rubro" && proveedor && row.proveedor !== proveedor) return;
      if (indexMode === "proveedor" && rubro && row.rubro !== rubro) return;
      const name = row[indexMode] || (indexMode === "rubro" ? "Sin rubro" : "Sin proveedor");
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [allRows, indexMode, proveedor, rubro]);
  const indexValue = indexMode === "rubro" ? rubro : proveedor;
  const onIndexChange = indexMode === "rubro" ? onRubro : onProveedor;
  const indexTotal = indexEntries.reduce((sum, [, count]) => sum + count, 0);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [pagination.page, filterKey]);
  function changePage(page) { setPageState({ key: filterKey, page }); setJump(""); }
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
  const columns = narrow ? "34px minmax(120px,1fr) 80px 94px 30px" : compact ? "34px minmax(180px,1fr) 86px 78px 78px 100px 32px" : "34px minmax(190px,1fr) 125px 86px 78px 78px 94px 100px 32px";
  const cell = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", padding: "0 8px" };
  const index = <nav aria-label="Filtrar la obra por rubro o proveedor" className="obra-scroll" style={{ padding: "8px 6px", overflowY: "auto", minHeight: 0, maxHeight: narrow ? 280 : undefined, borderRight: narrow ? "none" : `1px solid ${C.border}`, background: C.panel }}>
    <select aria-label="Índice de la lista" value={indexMode} onChange={(event) => setIndexMode(event.target.value)} style={{ ...button, width: "100%", marginBottom: 8, fontWeight: 650, background: C.panelSolid }}><option value="rubro">Rubros</option><option value="proveedor">Proveedores</option></select>
    {(indexMode === "rubro" ? proveedor : rubro) && <button type="button" onClick={() => indexMode === "rubro" ? onProveedor("") : onRubro("")} style={{ ...button, width: "100%", marginBottom: 6, color: C.blue, fontSize: 10 }} title="Quitar el otro filtro"><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{indexMode === "rubro" ? proveedor : rubro}</span><X size={12} /></button>}
    {[["", indexTotal], ...indexEntries].map(([name, count]) => <button key={name} className="obra-index-item" type="button" aria-pressed={indexValue === name} onClick={() => { onIndexChange(name); setIndexOpen(false); }} style={{ ...button, display: "flex", justifyContent: "space-between", gap: 10, textAlign: "left", width: "100%", borderColor: "transparent", background: indexValue === name ? C.blueL : "transparent", color: indexValue === name ? C.blue : C.text, padding: "8px", marginBottom: 2 }}>
      <span title={name} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name || "Todos los ítems"}</span><span style={{ ...numberStyle, fontSize: 11, color: indexValue === name ? C.blue : C.muted }}>{count.toLocaleString("es-AR")}</span>
    </button>)}
  </nav>;
  return <div ref={containerRef} data-testid="obra-lista" style={{ minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", background: C.panelSolid }}>
    {narrow && <button type="button" onClick={() => setIndexOpen(!indexOpen)} aria-expanded={indexOpen} style={{ ...button, margin: 8 }}><ListFilter size={14} />{indexValue || (indexMode === "rubro" ? "Rubros" : "Proveedores")}<ChevronDown size={14} /></button>}
    {narrow && indexOpen && index}
    <div style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "184px minmax(0,1fr)", height: listHeight, minHeight: 360 }}>
      {!narrow && index}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <div ref={scrollRef} className="obra-scroll" style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
          <div key={`${filterKey}:${pagination.page}`} className="obra-page-content" role="table" aria-label="Materiales de la obra" aria-rowcount={pagination.total} style={{ minWidth: narrow ? 0 : 620, fontSize: 12 }}>
            <div role="row" style={{ display: "grid", gridTemplateColumns: columns, alignItems: "center", minHeight: 38, position: "sticky", top: 0, zIndex: 2, background: C.panelSolid, borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: 11, fontWeight: 650 }}>
              <div role="columnheader"><SelectionBox rows={pageRows} selected={selected} onToggle={() => selectRows(pageRows)} label={`Seleccionar página (${pageRows.length} ítems)`} /></div>
              <div role="columnheader" style={cell}>Material</div>
              {!narrow && !compact && <div role="columnheader" style={cell}>Proveedor</div>}
              <div role="columnheader" style={{ ...cell, textAlign: "right" }}>Necesario</div>
              {!narrow && <><div role="columnheader" style={{ ...cell, textAlign: "right" }}>Recibido</div><div role="columnheader" style={{ ...cell, textAlign: "right" }}>Entregado</div></>}
              {!narrow && !compact && <div role="columnheader" style={{ ...cell, textAlign: "right" }}>Precio unit.</div>}
              <div role="columnheader" style={{ ...cell, padding: 0 }}>
                <ObraColumnFilter label="Estado" options={estadoOpciones} selected={estadosSel} onChange={onEstados} align="right" />
              </div><div role="columnheader" aria-label="Detalle" />
            </div>
            {pagination.groups.map((group) => <Fragment key={group.label}>
              <div role="row" style={{ display: "flex", alignItems: "center", minHeight: 34, background: C.panel, borderBottom: `1px solid ${C.border}` }}>
                <SelectionBox rows={group.allRows} selected={selected} onToggle={() => selectRows(group.allRows)} label={`Seleccionar grupo ${group.label} (${group.allRows.length} ítems filtrados)`} />
                <button type="button" aria-expanded={!closedGroups.has(group.label)} onClick={() => toggleGroup(group.label)} style={{ ...button, border: "none", background: "transparent", flex: 1, justifyContent: "flex-start", minWidth: 0 }}>
                  {closedGroups.has(group.label) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 650 }}>{group.label}</strong><span style={muted}>· {group.allRows.length}</span>
                </button>
              </div>
              {!closedGroups.has(group.label) && group.rows.map((row) => {
                const view = getRowView(row);
                const active = selected.has(row.id);
                return <div key={row.id} role="row" tabIndex={0} className="obra-data-row" data-row-id={row.id} aria-selected={active} onKeyDown={(event) => onRowKey(event, row)} onDoubleClick={(event) => { if (!event.target.closest("button,input,a,select")) onOpen(row, event.currentTarget); }} style={{ display: "grid", gridTemplateColumns: columns, alignItems: "center", minHeight: narrow ? 56 : 42, background: active ? C.blueL : detailId === row.id ? C.panel : "transparent", borderBottom: `1px solid ${C.border}`, cursor: "default" }}>
                  <div role="cell"><SelectionBox rows={[row]} selected={selected} onToggle={() => selectRows([row])} label={`Seleccionar ${row.descripcion}`} /></div>
                  <div role="cell" style={{ ...cell, display: "flex", alignItems: "center", gap: 8, padding: "4px 6px" }}>
                    <MaterialThumb material={view.imageMaterial} size={narrow ? 32 : 28} fallbackLabel={row.rubro?.slice(0, 1) || "M"} uploadMaterial={view.uploadMaterial} onUploaded={onImageUploaded} />
                    <button type="button" onClick={(event) => onOpen(row, event.currentTarget)} style={{ display: "block", border: "none", background: "transparent", color: C.text, padding: 0, textAlign: "left", minWidth: 0, flex: 1, cursor: "pointer", fontFamily: C.sans, lineHeight: 1.3 }} title={[row.descripcion, row.codigo, view.issue].filter(Boolean).join(" · ")}>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descripcion}</span>
                      {(view.origin || view.issue || (compact && row.proveedor)) && <span style={{ display: "block", color: view.issue ? C.red : C.muted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[view.origin, view.issue || (compact ? row.proveedor : "")].filter(Boolean).join(" · ")}</span>}
                    </button>
                  </div>
                  {!narrow && !compact && <div role="cell" title={row.proveedor} style={{ ...cell, color: C.muted, whiteSpace: "nowrap" }}>{row.proveedor || "Sin proveedor"}</div>}
                  <div role="cell" style={{ ...cell, ...numberStyle }} title={view.quantityTitle}>{view.needed}</div>
                  {!narrow && <><div role="cell" style={{ ...cell, ...numberStyle, color: C.muted }}>{view.received}</div><div role="cell" style={{ ...cell, ...numberStyle, color: C.muted }}>{view.delivered}</div></>}
                  {!narrow && !compact && <div role="cell" title={row.precio?.text} style={{ ...cell, ...numberStyle, fontSize: 11, color: row.precio?.amount ? C.muted : C.violet }}>{row.precio?.amount ? row.precio.text : "Sin precio"}</div>}
                  <div role="cell" style={{ ...cell, padding: "0 4px" }}><ObraStatusBadge status={view.status} /></div>
                  <div role="cell"><button type="button" title="Abrir detalle" aria-label={`Detalle de ${row.descripcion}`} onClick={(event) => onOpen(row, event.currentTarget)} style={{ ...button, borderColor: "transparent", padding: 4, minWidth: 28, background: "transparent" }}><MoreHorizontal size={15} /></button></div>
                </div>;
              })}
            </Fragment>)}
          </div>
          {!pagination.total && <div style={{ padding: 36, textAlign: "center", color: C.muted }}>No hay ítems con esos filtros.</div>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderTop: `1px solid ${C.border}`, background: C.panelSolid }}>
          <span aria-live="polite" data-testid="obra-page-range" style={{ ...muted, fontVariantNumeric: "tabular-nums" }}>{pagination.start.toLocaleString("es-AR")}–{pagination.end.toLocaleString("es-AR")} de {pagination.total.toLocaleString("es-AR")} · {OBRA_PAGE_SIZE} por página</span>
          <nav aria-label="Páginas de materiales" style={{ display: "flex", gap: 3, alignItems: "center" }}>
            <button type="button" aria-label="Página anterior" disabled={pagination.page === 1} onClick={() => changePage(pagination.page - 1)} style={button}><ChevronLeft size={14} /></button>
            {obraPageNumbers(pagination.page, pagination.pageCount).map((page, index, pages) => <Fragment key={page}>{index > 0 && page - pages[index - 1] > 1 && <span style={muted}>…</span>}<button type="button" aria-label={`Página ${page}`} aria-current={page === pagination.page ? "page" : undefined} onClick={() => changePage(page)} style={{ ...button, background: page === pagination.page ? C.blueL : "transparent", color: page === pagination.page ? C.blue : C.muted }}>{page}</button></Fragment>)}
            <button type="button" aria-label="Página siguiente" disabled={pagination.page === pagination.pageCount} onClick={() => changePage(pagination.page + 1)} style={button}><ChevronRight size={14} /></button>
            {!narrow && <form onSubmit={(event) => { event.preventDefault(); if (jump) changePage(Number(jump)); }}><input type="number" min={1} max={pagination.pageCount} value={jump} onChange={(event) => setJump(event.target.value)} aria-label="Ir a página" placeholder="Ir a…" style={{ ...button, boxSizing: "border-box", width: 65, padding: "5px" }} /></form>}
          </nav>
        </div>
      </div>
    </div>
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
    <div style={{ padding: "10px 18px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><span style={{ ...muted, fontSize: 10, letterSpacing: 1 }}>DETALLE DEL ÍTEM</span><div style={{ display: "flex", gap: 5 }}><button type="button" disabled={!onPrevious} onClick={onPrevious} aria-label="Ítem anterior" style={button}><ChevronLeft size={14} /></button><button type="button" disabled={!onNext} onClick={onNext} aria-label="Ítem siguiente" style={button}><ChevronRight size={14} /></button><button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar detalle" style={button}><X size={16} /></button></div></div>
      <h2 id="obra-detail-title" style={{ margin: "0 0 8px", fontSize: 19, lineHeight: 1.3, fontWeight: 650 }}>{row.descripcion}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><ObraStatusBadge status={view.status} /><span style={muted}>{obraLabel}</span></div>
      <div role="tablist" aria-label="Detalle del material" style={{ display: "flex", gap: 20 }}>{[["resumen", "Resumen"], ["compras", "Compras"], ["mas", "Más"]].map(([key, label], index, tabs) => <button id={`obra-tab-${key}`} aria-controls={`obra-tabpanel-${key}`} key={key} type="button" role="tab" tabIndex={tab === key ? 0 : -1} aria-selected={tab === key} onClick={() => onTab(key)} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length][0]; onTab(next); document.getElementById(`obra-tab-${next}`)?.focus(); }} style={{ ...button, border: "none", borderBottom: `2px solid ${tab === key ? C.blue : "transparent"}`, borderRadius: 0, padding: "10px 0", background: "transparent", color: tab === key ? C.blue : C.muted }}>{label}</button>)}</div>
    </div>
    <div key={`${row.id}:${tab}`} role="tabpanel" id={`obra-tabpanel-${tab}`} aria-labelledby={`obra-tab-${tab}`} className="obra-scroll obra-detail-content" style={{ flex: 1, overflowY: "auto", minWidth: 0, minHeight: 0, padding: editing ? 20 : 18 }}>{renderContent(row, tab)}</div>
    <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, background: C.panelSolid }}>{footer}<div style={{ ...muted, fontSize: 10, textAlign: "right", marginTop: 6 }}>Esc · Cerrar</div></div>
  </aside>, document.body);
}
