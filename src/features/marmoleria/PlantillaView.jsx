import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Plus, X, Check, Pencil, Trash2, Info, Layers } from "lucide-react";
import { T, PANEL, EYEBROW, INP, INP_SM, TXT, ICON_BTN, uniqueSorted } from "./marmShared";

// ── PLANTILLA DE LÍNEA ────────────────────────────────────────────
export default function PlantillaView({
  linea, plantillaLinea, loading, esAdmin, isMobile,
  onBack, onAdd, onEdit, onDelete,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ pieza:"", sector:"", opcional:false });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ pieza:"", sector:"", opcional:false });
  const addInputRef = useRef(null);

  useEffect(() => {
    if (showAdd) setTimeout(() => addInputRef.current?.focus(), 0);
  }, [showAdd]);

  // El contenedor monta este componente con key={linea.id}: al cambiar de
  // línea el estado local (formularios) se reinicia solo.

  const sectores = useMemo(() => uniqueSorted(plantillaLinea.map(p => p.sector)), [plantillaLinea]);

  const porSector = useMemo(() => {
    const map = {};
    plantillaLinea.forEach(p => {
      if (!map[p.sector]) map[p.sector] = [];
      map[p.sector].push(p);
    });
    return map;
  }, [plantillaLinea]);

  const submitAdd = () => {
    onAdd(form);
    setForm(f => ({ ...f, pieza:"" }));
  };

  return (
    <div className="mrm-view" style={{ padding: isMobile ? "14px 14px" : "20px 24px", maxWidth:980 }}>
      <button onClick={onBack} className="mrm-btn-ghost" style={{
        display:"inline-flex", alignItems:"center", gap:5, border:"1px solid var(--border)",
        background:"transparent", color:"var(--muted)", padding:"5px 11px", borderRadius:8,
        cursor:"pointer", fontFamily:T.sans, fontSize:12, marginBottom:14,
      }}>
        <ChevronLeft size={14} /> Marmolería
      </button>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:12, flexWrap:"wrap" }}>
        <div>
          <div style={{ ...EYEBROW, marginBottom:5 }}>Plantilla de línea</div>
          <h1 style={{ margin:0, fontSize:18, fontWeight:700, color:"var(--text)", letterSpacing:-0.3 }}>
            {linea?.nombre}
            <span style={{ fontWeight:400, color:"var(--dim)", fontSize:14 }}> — {plantillaLinea.length} piezas</span>
          </h1>
        </div>
        {esAdmin && (
          <button className="mrm-btn-ghost" onClick={() => { setShowAdd(v => !v); setEditId(null); }} style={{
            display:"flex", alignItems:"center", gap:6, flexShrink:0,
            border:`1px solid ${showAdd ? "var(--red-border)" : "var(--blue-border)"}`,
            background: showAdd ? "var(--red-soft)" : "var(--blue-soft)",
            color: showAdd ? "var(--red)" : "var(--blue)",
            padding:"7px 14px", borderRadius:8, cursor:"pointer", fontFamily:T.sans, fontSize:12, fontWeight:700,
          }}>
            {showAdd ? <X size={13} /> : <Plus size={13} />}
            {showAdd ? "Cancelar" : "Agregar pieza"}
          </button>
        )}
      </div>

      {/* Aviso de propósito */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"10px 14px", marginBottom:14,
        background:"var(--blue-soft)", border:"1px solid var(--blue-border)", borderRadius:10 }}>
        <Info size={14} style={{ color:"var(--blue)", flexShrink:0, marginTop:1 }} />
        <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>
          Esta plantilla define las piezas que recibirán <strong style={{ color:"var(--text)" }}>los nuevos barcos</strong> de la línea {linea?.nombre}.
          Los cambios no modifican barcos ya creados.
        </div>
      </div>

      <datalist id="marm-sectores-plantilla">
        {sectores.map((s) => <option key={s} value={s} />)}
      </datalist>

      {/* Panel agregar */}
      {showAdd && esAdmin && (
        <div style={{ ...PANEL, padding:16, marginBottom:14, animation:"mrmFade .2s ease" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:12, flexWrap:"wrap" }}>
            <div>
              <div style={{ ...EYEBROW, marginBottom:4, letterSpacing:1.2 }}>Nueva pieza en plantilla {linea?.nombre}</div>
              <div style={{ fontSize:12, color:"var(--dim)" }}>Podés pegar varias piezas, una por línea.</div>
            </div>
            <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", flexShrink:0, color:"var(--muted)", fontSize:12, userSelect:"none" }}>
              <input type="checkbox" checked={form.opcional}
                onChange={e => setForm(f=>({...f, opcional:e.target.checked}))}
                style={{ accentColor:"var(--blue)", width:13, height:13 }} />
              Opcional
            </label>
          </div>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(260px,1fr) 220px", gap:10, alignItems:"start" }}>
            <div>
              <textarea ref={addInputRef} style={TXT} placeholder={"Nombre de la pieza\nEj: Mesada cockpit\nEj: Tapa bacha cockpit"}
                value={form.pieza}
                onChange={e => setForm(f=>({...f, pieza:e.target.value}))}
                onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submitAdd(); }} />
              <div style={{ marginTop:6, color:"var(--dim)", fontSize:11 }}>Ctrl + Enter para agregar. Separá varias piezas con Enter o punto y coma.</div>
            </div>
            <div>
              <input style={INP} list="marm-sectores-plantilla" placeholder="Sector: Cockpit, Baños, Cocina..."
                value={form.sector}
                onChange={e => setForm(f=>({...f, sector:e.target.value}))}
                onKeyDown={e => e.key === "Enter" && submitAdd()} />
              {sectores.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
                  {sectores.slice(0, 8).map((s) => (
                    <button key={s} type="button" className="mrm-sector-chip"
                      onClick={() => setForm(f=>({...f, sector:s}))}
                      style={{ border:"1px solid var(--border)", background:"var(--panel)", color:"var(--muted)", borderRadius:99, padding:"4px 9px", cursor:"pointer", fontSize:11, fontFamily:T.sans, transition:"all 0.12s" }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:12, flexWrap:"wrap" }}>
            <button onClick={submitAdd} style={{
              border:"1px solid var(--blue-border)", background:"var(--blue-soft)",
              color:"var(--blue)", padding:"8px 18px", borderRadius:8, cursor:"pointer", fontFamily:T.sans, fontSize:13, fontWeight:700,
            }}>Agregar y seguir</button>
            <button type="button" className="mrm-btn-ghost" onClick={() => setForm({ pieza:"", sector:"", opcional:false })} style={{
              border:"1px solid var(--border)", background:"transparent", color:"var(--dim)", padding:"8px 12px", borderRadius:8, cursor:"pointer", fontFamily:T.sans, fontSize:12,
            }}>Limpiar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:"center", padding:40, fontSize:12, color:"var(--dim)", letterSpacing:1.2, textTransform:"uppercase", fontFamily:T.mono }}>Cargando…</div>
      ) : plantillaLinea.length === 0 ? (
        <div style={{ ...PANEL, textAlign:"center", padding:"56px 32px", color:"var(--dim)", borderStyle:"dashed" }}>
          <Layers size={26} style={{ opacity:0.4, marginBottom:10 }} />
          <div style={{ fontSize:12, letterSpacing:1.2, textTransform:"uppercase", fontFamily:T.mono, marginBottom:14 }}>Plantilla vacía</div>
          {esAdmin && (
            <button onClick={() => setShowAdd(true)} style={{
              border:"1px solid var(--blue-border)", background:"var(--blue-soft)",
              color:"var(--blue)", padding:"8px 20px", borderRadius:8, cursor:"pointer", fontFamily:T.sans, fontSize:13, fontWeight:700,
              display:"inline-flex", alignItems:"center", gap:6,
            }}><Plus size={13} /> Agregar primera pieza</button>
          )}
        </div>
      ) : (
        <div className="mrm-scroll" style={{ ...PANEL, overflowX: isMobile ? "auto" : "hidden", overflowY:"hidden" }}>
          <div className="mrm-table">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 160px 80px 64px",
              gap:12, padding:"8px 16px", borderBottom:"1px solid var(--border)", background:"var(--panel-solid-2)" }}>
              {["Pieza","Sector","Opcional",""].map((h,i) => (
                <div key={i} style={{ fontSize:10, letterSpacing:1.1, textTransform:"uppercase", color:"var(--dim)", fontWeight:700, fontFamily:T.mono }}>{h}</div>
              ))}
            </div>

            {Object.entries(porSector).map(([sector, rows]) => (
              <div key={sector}>
                <div style={{ padding:"7px 16px", background:"var(--panel)", borderBottom:"1px solid var(--border)",
                  display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:10, letterSpacing:1.2, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", fontFamily:T.mono }}>{sector}</span>
                  <span style={{ fontSize:10, color:"var(--dim)", fontFamily:T.mono }}>({rows.length})</span>
                </div>

                {rows.map(p => {
                  const isEditing = editId === p.id;
                  return (
                    <div key={p.id} className="mrm-row" style={{
                      display:"grid", gridTemplateColumns:"1fr 160px 80px 64px",
                      gap:12, alignItems:"center", padding:"9px 16px",
                      borderBottom:"1px solid var(--border)",
                      background: isEditing ? "var(--blue-soft)" : "transparent",
                    }}>
                      {isEditing ? (
                        <>
                          <input autoFocus style={{ ...INP_SM, fontSize:13 }}
                            value={editForm.pieza}
                            onChange={e => setEditForm(f=>({...f, pieza:e.target.value}))}
                            onKeyDown={e => e.key === "Enter" && (onEdit(p.id, editForm), setEditId(null))}
                            placeholder="Nombre de la pieza" />
                          <input style={{ ...INP_SM, fontSize:12 }} list="marm-sectores-plantilla"
                            value={editForm.sector}
                            onChange={e => setEditForm(f=>({...f, sector:e.target.value}))}
                            onKeyDown={e => e.key === "Enter" && (onEdit(p.id, editForm), setEditId(null))}
                            placeholder="Sector" />
                          <label style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer", color:"var(--muted)", fontSize:12 }}>
                            <input type="checkbox" checked={editForm.opcional}
                              onChange={e => setEditForm(f=>({...f, opcional:e.target.checked}))}
                              style={{ accentColor:"var(--blue)", width:13, height:13 }} />
                            Opc
                          </label>
                          <div style={{ display:"flex", gap:4, justifyContent:"flex-end" }}>
                            <button onClick={() => { onEdit(p.id, editForm); setEditId(null); }} title="Guardar" style={{
                              border:"1px solid var(--blue-border)", background:"var(--blue-soft)",
                              color:"var(--blue)", padding:"4px 9px", borderRadius:7, cursor:"pointer", fontFamily:T.sans,
                              display:"inline-flex", alignItems:"center" }}><Check size={13} /></button>
                            <button onClick={() => setEditId(null)} title="Cancelar" className="mrm-btn-ghost" style={{
                              border:"1px solid var(--border)", background:"transparent",
                              color:"var(--dim)", padding:"4px 9px", borderRadius:7, cursor:"pointer",
                              display:"inline-flex", alignItems:"center" }}><X size={13} /></button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ color:"var(--text)", fontSize:13, fontWeight:500 }}>{p.pieza}</div>
                          <div style={{ color:"var(--dim)", fontSize:12, fontFamily:T.mono }}>{p.sector}</div>
                          <div>
                            {p.opcional ? (
                              <span style={{ fontSize:10, letterSpacing:1, textTransform:"uppercase",
                                padding:"2px 8px", borderRadius:99, background:"var(--panel)",
                                color:"var(--dim)", border:"1px solid var(--border)" }}>Opcional</span>
                            ) : (
                              <span style={{ fontSize:10, color:"var(--border-2)" }}>—</span>
                            )}
                          </div>
                          <div style={{ display:"flex", gap:2, justifyContent:"flex-end" }}>
                            {esAdmin && (
                              <>
                                <button className="mrm-icon-btn" title="Editar pieza" style={ICON_BTN}
                                  onClick={() => { setEditId(p.id); setEditForm({ pieza:p.pieza, sector:p.sector, opcional:!!p.opcional }); setShowAdd(false); }}>
                                  <Pencil size={13} /></button>
                                <button className="mrm-icon-btn mrm-del-btn" title="Quitar de plantilla" style={ICON_BTN}
                                  onClick={() => onDelete(p.id)}>
                                  <Trash2 size={13} /></button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
