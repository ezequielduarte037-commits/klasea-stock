import { useMemo, useRef, useState, useEffect } from "react";
import {
  ChevronLeft, X, Pencil, Trash2, Plus, Check, Search, Send,
  CheckCircle2, AlertTriangle, Layers,
} from "lucide-react";
import {
  T, PANEL, EYEBROW, INP, INP_SM, TXT, ICON_BTN, ESTADOS, ESTADO_META,
  PRIORIDAD_META, estadoSelectStyle, fmtFecha, pct,
} from "./marmShared";

// ── DETALLE CONTEXTUAL DEL BARCO (checklist operativo) ────────────
export default function BoatDetail({
  unidad, lineaNombre, piezas, loading, err,
  esAdmin, isMobile,
  onBack, onClose, onVerPlantilla,
  onRenameUnidad, onDeleteUnidad,
  onSetEstado, onOpenPieza, onDeletePieza,
  onCambiarColorSector, onAddPieza, onAddPiezaPlantilla,
  sectoresSugeridos,
}) {
  const [q, setQ] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [showAddPieza, setShowAddPieza] = useState(false);
  const [formPieza, setFormPieza] = useState({ pieza:"", sector:"" });
  const [renaming, setRenaming] = useState(false);
  const [renameCodigo, setRenameCodigo] = useState("");
  const addPiezaInputRef = useRef(null);

  // El contenedor monta este componente con key={unidad.id}: al cambiar de
  // barco el estado local (filtros, formularios) se reinicia solo.

  useEffect(() => {
    if (showAddPieza) setTimeout(() => addPiezaInputRef.current?.focus(), 0);
  }, [showAddPieza]);

  const porcentaje = useMemo(() => pct(piezas), [piezas]);
  const pctColor = porcentaje === 100 ? "var(--green)" : porcentaje > 0 ? "var(--blue)" : "var(--dim)";

  const stats = useMemo(() => ({
    total:     piezas.filter(p => p.estado !== "No lleva").length,
    recibido:  piezas.filter(p => p.estado === "Recibido").length,
    rehacer:   piezas.filter(p => p.estado === "Rehacer").length,
  }), [piezas]);

  const porSector = useMemo(() => {
    let rows = piezas;
    if (filtroEstado !== "todos") rows = rows.filter(p => p.estado === filtroEstado);
    const qq = q.toLowerCase();
    if (qq) rows = rows.filter(p =>
      p.pieza.toLowerCase().includes(qq) ||
      p.sector.toLowerCase().includes(qq) ||
      (p.color ?? "").toLowerCase().includes(qq)
    );
    const map = {};
    rows.forEach(p => {
      if (!map[p.sector]) map[p.sector] = [];
      map[p.sector].push(p);
    });
    return map;
  }, [piezas, filtroEstado, q]);

  const submitAdd = (tambienPlantilla) => {
    const handler = tambienPlantilla ? onAddPiezaPlantilla : onAddPieza;
    handler(formPieza);
    setFormPieza(f => ({ ...f, pieza:"" }));
  };

  const confirmRename = () => { onRenameUnidad(unidad.id, renameCodigo); setRenaming(false); };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", background:"var(--bg)" }}>

      {/* Encabezado contextual */}
      <div style={{ flexShrink:0, borderBottom:"1px solid var(--border)", background:"var(--topbar-soft)",
        backdropFilter:"var(--glass-filter)", WebkitBackdropFilter:"var(--glass-filter)",
        padding:"10px 16px", display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={onBack} className="mrm-btn-ghost" title="Volver a la flota" style={{
          display:"flex", alignItems:"center", gap:5, border:"1px solid var(--border)",
          background:"transparent", color:"var(--muted)", padding:"5px 10px", borderRadius:8,
          cursor:"pointer", fontFamily:T.sans, fontSize:12,
        }}>
          <ChevronLeft size={14} /> {isMobile ? "Flota" : ""}
        </button>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ fontSize:10, color:"var(--dim)", letterSpacing:1.2, textTransform:"uppercase", fontFamily:T.mono }}>
            {lineaNombre} · Checklist
          </div>
          {renaming ? (
            <span style={{ display:"inline-flex", gap:4, alignItems:"center", marginTop:2 }}>
              <input autoFocus style={{ ...INP_SM, width:130, padding:"3px 8px", fontFamily:T.mono }}
                value={renameCodigo} onChange={e => setRenameCodigo(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenaming(false); }} />
              <button className="mrm-icon-btn" style={ICON_BTN} onClick={confirmRename} title="Guardar"><Check size={13} /></button>
              <button className="mrm-icon-btn" style={ICON_BTN} onClick={() => setRenaming(false)} title="Cancelar"><X size={13} /></button>
            </span>
          ) : (
            <div style={{ fontSize:16, fontWeight:800, color:"var(--text)", fontFamily:T.mono, lineHeight:1.2 }}>
              {unidad.codigo}
            </div>
          )}
        </div>
        <button onClick={onVerPlantilla} className="mrm-icon-btn" style={ICON_BTN} title={`Ver plantilla de ${lineaNombre}`}>
          <Layers size={14} />
        </button>
        {esAdmin && !renaming && (
          <>
            <button className="mrm-icon-btn" style={ICON_BTN} title="Renombrar barco"
              onClick={() => { setRenaming(true); setRenameCodigo(unidad.codigo); }}><Pencil size={13} /></button>
            <button className="mrm-icon-btn mrm-del-btn" style={ICON_BTN} title="Eliminar barco"
              onClick={() => onDeleteUnidad(unidad.id)}><Trash2 size={13} /></button>
          </>
        )}
        {!isMobile && (
          <button onClick={onClose} className="mrm-icon-btn" style={ICON_BTN} title="Cerrar detalle"><X size={14} /></button>
        )}
      </div>

      {/* Cuerpo */}
      <div style={{ flex:1, overflowY:"auto", padding: isMobile ? "12px 12px" : "14px 16px" }}>

        {err && (
          <div style={{ padding:"9px 13px", borderRadius:9, background:"var(--red-soft)",
            border:"1px solid var(--red-border)", color:"var(--red)", fontSize:13, marginBottom:12,
            display:"flex", alignItems:"center", gap:8 }}>
            <AlertTriangle size={14} /> {err}
          </div>
        )}

        {/* Avance + filtros */}
        <div style={{ ...PANEL, padding:"12px 14px", marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:8 }}>
            <div style={{ fontSize:12, color:"var(--dim)" }}>
              <span style={{ color:"var(--text)", fontWeight:700 }}>{stats.recibido}</span> de {stats.total} recibidas
              {stats.rehacer > 0 && <span style={{ color:"var(--red)", fontWeight:700 }}> · {stats.rehacer} a rehacer</span>}
            </div>
            <span style={{ fontFamily:T.mono, fontSize:17, fontWeight:800, color:pctColor }}>
              {porcentaje}<span style={{ fontSize:11, opacity:0.55 }}>%</span>
            </span>
          </div>
          <div style={{ height:5, background:"var(--panel-2)", borderRadius:99, overflow:"hidden", marginBottom:11 }}>
            <div style={{ height:"100%", width:`${porcentaje}%`,
              background: porcentaje === 100 ? "var(--green)" : "var(--blue)",
              borderRadius:99, transition:"width .45s ease" }} />
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
            {["todos", ...ESTADOS].map(e => {
              const m = ESTADO_META[e];
              const active = filtroEstado === e;
              return (
                <button key={e} onClick={() => setFiltroEstado(e)} className={active ? undefined : "mrm-chip-btn"} style={{
                  border: active ? `1px solid ${(m?.border && m.border !== "transparent") ? m.border : "var(--border-2)"}` : "1px solid var(--border)",
                  background: active ? (m?.bg ?? "var(--panel-2)") : "transparent",
                  color: active ? (m?.color ?? "var(--text)") : "var(--dim)",
                  padding:"3px 10px", borderRadius:99, cursor:"pointer", fontSize:11, fontWeight: active ? 700 : 400,
                  whiteSpace:"nowrap", fontFamily:T.sans, transition:"all 0.12s",
                }}>{e === "todos" ? "Todas" : e}</button>
              );
            })}
          </div>
          <div style={{ position:"relative", marginTop:8 }}>
            <Search size={13} style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:"var(--dim)", pointerEvents:"none" }} />
            <input style={{ ...INP_SM, paddingLeft:28 }} placeholder="Buscar pieza, sector o color…"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {esAdmin && (
            <button onClick={() => setShowAddPieza(v => !v)} className="mrm-btn-ghost" style={{
              marginTop:8, width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
              border:`1px dashed ${showAddPieza ? "var(--red-border)" : "var(--border-2)"}`,
              background: showAddPieza ? "var(--red-soft)" : "transparent",
              color: showAddPieza ? "var(--red)" : "var(--muted)",
              padding:"7px", borderRadius:8, cursor:"pointer", fontFamily:T.sans, fontSize:12, fontWeight:600,
            }}>
              {showAddPieza ? <X size={13} /> : <Plus size={13} />}
              {showAddPieza ? "Cancelar" : "Agregar pieza extra"}
            </button>
          )}
        </div>

        {/* Panel agregar pieza */}
        {showAddPieza && esAdmin && (
          <div style={{ ...PANEL, padding:13, marginBottom:12, animation:"mrmFade .2s ease" }}>
            <div style={{ ...EYEBROW, marginBottom:4, letterSpacing:1.2 }}>Agregar pieza extra</div>
            <div style={{ fontSize:12, color:"var(--dim)", marginBottom:10 }}>Cargá una o varias piezas y elegí el sector.</div>
            <textarea ref={addPiezaInputRef} style={{ ...TXT, marginBottom:8 }}
              placeholder={"Nombre de la pieza\nEj: Mesada cockpit\nEj: Zócalo cockpit"}
              value={formPieza.pieza}
              onChange={e => setFormPieza(f=>({...f,pieza:e.target.value}))}
              onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submitAdd(false); }} />
            <input style={INP} list="marm-sectores-barco" placeholder="Sector: Cockpit, Baños..."
              value={formPieza.sector}
              onChange={e => setFormPieza(f=>({...f,sector:e.target.value}))}
              onKeyDown={e => e.key === "Enter" && submitAdd(false)} />
            <datalist id="marm-sectores-barco">
              {sectoresSugeridos.map((s) => <option key={s} value={s} />)}
            </datalist>
            {sectoresSugeridos.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:7 }}>
                {sectoresSugeridos.slice(0, 8).map((s) => (
                  <button key={s} type="button" className="mrm-sector-chip"
                    onClick={() => setFormPieza(f=>({...f, sector:s}))}
                    style={{ border:"1px solid var(--border)", background:"var(--panel)", color:"var(--muted)", borderRadius:99, padding:"3px 8px", cursor:"pointer", fontSize:11, fontFamily:T.sans, transition:"all 0.12s" }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display:"flex", gap:7, marginTop:11, flexWrap:"wrap" }}>
              <button onClick={() => submitAdd(false)} style={{ border:"1px solid var(--blue-border)", background:"var(--blue-soft)", color:"var(--blue)", padding:"7px 14px", borderRadius:8, cursor:"pointer", fontFamily:T.sans, fontSize:12, fontWeight:700 }}>
                Solo a este barco
              </button>
              <button onClick={() => submitAdd(true)} className="mrm-btn-ghost" style={{ border:"1px solid var(--border)", background:"transparent", color:"var(--muted)", padding:"7px 12px", borderRadius:8, cursor:"pointer", fontFamily:T.sans, fontSize:12 }}>
                También a plantilla
              </button>
            </div>
          </div>
        )}

        {/* Sectores */}
        {loading ? (
          <div style={{ textAlign:"center", padding:36, fontSize:12, color:"var(--dim)", letterSpacing:1.2, textTransform:"uppercase", fontFamily:T.mono }}>Cargando…</div>
        ) : Object.keys(porSector).length === 0 ? (
          <div style={{ textAlign:"center", padding:"44px 0", fontSize:11, color:"var(--dim)", letterSpacing:1.2, textTransform:"uppercase", fontFamily:T.mono }}>
            {q || filtroEstado !== "todos" ? "Sin resultados para el filtro" : "Checklist vacío"}
          </div>
        ) : (
          Object.entries(porSector).map(([sector, rows]) => {
            const recib   = rows.filter(p => p.estado === "Recibido").length;
            const activas = rows.filter(p => p.estado !== "No lleva").length;
            const colorSector = rows[0]?.color || "";
            const sectorCompleto = recib === activas && activas > 0;
            return (
              <div key={sector} style={{ ...PANEL, marginBottom:12, overflow:"hidden" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8,
                  padding:"9px 13px", background:"var(--panel-solid-2)", borderBottom:"1px solid var(--border)", flexWrap:"wrap" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0, flexWrap:"wrap" }}>
                    <span style={{ fontSize:10, letterSpacing:1.2, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", fontFamily:T.mono }}>{sector}</span>
                    {esAdmin ? (
                      <input defaultValue={colorSector} placeholder="Material…"
                        style={{ background:"var(--panel)", border:"1px solid var(--border)",
                          color:"var(--muted)", padding:"3px 8px", borderRadius:7, fontSize:11, outline:"none", width:140, fontFamily:T.sans }}
                        onBlur={e => { if (e.target.value !== colorSector) onCambiarColorSector(sector, e.target.value); }}
                        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                        title="Enter para aplicar a todo el sector" />
                    ) : (
                      colorSector && <span style={{ fontSize:11, color:"var(--dim)" }}>{colorSector}</span>
                    )}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:7, flexShrink:0 }}>
                    {sectorCompleto && <CheckCircle2 size={12} style={{ color:"var(--green)" }} />}
                    <div style={{ width:48, height:4, background:"var(--panel-3)", borderRadius:99, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${activas ? recib/activas*100 : 0}%`,
                        background: sectorCompleto ? "var(--green)" : "var(--blue)",
                        borderRadius:99, transition:"width 0.4s" }}/>
                    </div>
                    <span style={{ fontSize:10, color:"var(--dim)", fontFamily:T.mono }}>{recib}/{activas}</span>
                  </div>
                </div>

                {rows.map(p => {
                  const meta    = ESTADO_META[p.estado] ?? ESTADO_META["Pendiente"];
                  const prio    = PRIORIDAD_META[p.prioridad] || PRIORIDAD_META["Media"];
                  const noLleva = p.estado === "No lleva";
                  const esRehacer = p.estado === "Rehacer";
                  return (
                    <div key={p.id} className="mrm-row" style={{
                      padding:"9px 13px", borderBottom:"1px solid var(--border)",
                      borderLeft: esRehacer ? "3px solid var(--red)" : "3px solid transparent",
                      opacity: noLleva ? 0.45 : 1,
                    }}>
                      <div style={{ cursor:"pointer", minWidth:0, marginBottom:7 }} onClick={() => onOpenPieza(p)}>
                        <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
                          <span style={{ width:6, height:6, borderRadius:"50%", background:meta.color, flexShrink:0 }} />
                          <span style={{ color: p.estado === "Recibido" ? "var(--dim)" : "var(--text)", fontSize:13, fontWeight:600 }}>
                            {p.pieza}
                          </span>
                          {(p.prioridad === "Alta" || p.prioridad === "Urgente") && (
                            <span style={{ fontSize:9, letterSpacing:0.8, textTransform:"uppercase", padding:"1px 7px",
                              borderRadius:99, fontWeight:800, background:prio.bg, color:prio.color, border:`1px solid ${prio.border}` }}>
                              {p.prioridad}
                            </span>
                          )}
                          {p.opcional && (
                            <span style={{ fontSize:9, letterSpacing:0.8, color:"var(--dim)", fontFamily:T.mono,
                              padding:"1px 6px", borderRadius:99, border:"1px solid var(--border)", textTransform:"uppercase" }}>Opc</span>
                          )}
                        </div>
                        {(p.fecha_envio || p.fecha_regreso || p.color || p.observaciones) && (
                          <div style={{ fontSize:11, color:"var(--dim)", marginTop:3, paddingLeft:13, display:"flex", gap:11, flexWrap:"wrap", alignItems:"center" }}>
                            {p.color && <span>{p.color}</span>}
                            {p.fecha_envio && (
                              <span style={{ fontFamily:T.mono, display:"inline-flex", alignItems:"center", gap:4 }}>
                                <Send size={10} /> {fmtFecha(p.fecha_envio)}
                              </span>
                            )}
                            {p.fecha_regreso && (
                              <span style={{ fontFamily:T.mono, display:"inline-flex", alignItems:"center", gap:4, color:"var(--green)" }}>
                                <CheckCircle2 size={10} /> {fmtFecha(p.fecha_regreso)}
                              </span>
                            )}
                            {p.observaciones && <span style={{ fontStyle:"italic" }}>{p.observaciones}</span>}
                          </div>
                        )}
                      </div>
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        <select style={{ ...estadoSelectStyle(p.estado), flex:1, maxWidth:"none" }} value={p.estado}
                          onChange={e => onSetEstado(p.id, e.target.value)}
                          onClick={e => e.stopPropagation()}>
                          {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                        <button className="mrm-icon-btn" style={ICON_BTN} title="Editar detalle"
                          onClick={() => onOpenPieza(p)}><Pencil size={13} /></button>
                        {esAdmin && (
                          <button className="mrm-icon-btn mrm-del-btn" style={ICON_BTN} title="Quitar pieza"
                            onClick={() => onDeletePieza(p.id)}><Trash2 size={13} /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
