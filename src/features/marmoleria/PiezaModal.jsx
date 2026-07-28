import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { T, ESTADO_META, PRIORIDADES } from "./marmShared";

// ── MODAL DETALLE PIEZA ───────────────────────────────────────────
export default function PiezaModal({ pieza, onClose, onSave }) {
  const [form, setForm] = useState({
    fecha_envio:   pieza.fecha_envio   ?? "",
    fecha_regreso: pieza.fecha_regreso ?? "",
    observaciones: pieza.observaciones ?? "",
    foto_ref:      pieza.foto_ref      ?? "",
    prioridad:     pieza.prioridad     ?? "Media",
  });

  // Cierre con Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const estadoMeta = ESTADO_META[pieza.estado] ?? ESTADO_META["Pendiente"];

  const S = {
    overlay: {
      position:"fixed", inset:0, zIndex:1000,
      background:"var(--overlay)",
      backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:16,
    },
    card: {
      background:"var(--panel-solid)",
      border:"1px solid var(--border-2)",
      borderRadius:14, padding:"20px 22px", width:"min(500px,100%)",
      maxHeight:"88vh", overflowY:"auto", position:"relative",
      boxShadow:"0 24px 64px var(--shadow-strong)",
      color:"var(--text)", fontFamily:T.sans,
    },
    label: {
      fontSize:10, letterSpacing:1.2, color:"var(--dim)", display:"block",
      marginBottom:5, textTransform:"uppercase", fontWeight:700, fontFamily:T.mono,
    },
    input: {
      background:"var(--panel)", border:"1px solid var(--border)",
      color:"var(--text)", padding:"8px 11px", borderRadius:8, width:"100%", fontSize:13,
      outline:"none", boxSizing:"border-box", fontFamily:T.sans,
    },
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.card} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Encabezado */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:4 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
              <span style={{ fontSize:10, color:"var(--dim)", letterSpacing:1.2, textTransform:"uppercase", fontWeight:700, fontFamily:T.mono }}>
                {pieza.codigo_barco ? `${pieza.codigo_barco} · ` : ""}{pieza.sector}
              </span>
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:99, fontWeight:700, textTransform:"uppercase", letterSpacing:0.8,
                background:estadoMeta.bg, color:estadoMeta.color, border:`1px solid ${estadoMeta.border}` }}>
                {pieza.estado}
              </span>
              {pieza.opcional && (
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:99, color:"var(--dim)",
                  border:"1px solid var(--border)", textTransform:"uppercase", letterSpacing:0.8 }}>Opcional</span>
              )}
            </div>
            <h2 style={{ margin:0, color:"var(--text)", fontFamily:T.sans, fontSize:17, fontWeight:700, lineHeight:1.3 }}>
              {pieza.pieza}
            </h2>
          </div>
          <button onClick={onClose} title="Cerrar (Esc)" className="mrm-icon-btn" style={{
            flexShrink:0, background:"var(--panel)", border:"1px solid var(--border)",
            color:"var(--muted)", width:30, height:30, borderRadius:8,
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Prioridad + fechas */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:16 }}>
          <div>
            <label style={S.label}>Prioridad</label>
            <select style={S.input} value={form.prioridad} onChange={e => setForm(f=>({...f,prioridad:e.target.value}))}>
              {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Fecha envío</label>
            <input style={S.input} type="date"
              value={form.fecha_envio} onChange={e => setForm(f=>({...f,fecha_envio:e.target.value}))} />
          </div>
          <div>
            <label style={S.label}>Fecha regreso</label>
            <input style={S.input} type="date"
              value={form.fecha_regreso} onChange={e => setForm(f=>({...f,fecha_regreso:e.target.value}))} />
          </div>
        </div>

        <div style={{ marginTop:14 }}>
          <label style={S.label}>Observaciones</label>
          <textarea style={{ ...S.input, minHeight:72, resize:"vertical", lineHeight:1.45 }} placeholder="Notas, aclaraciones..."
            value={form.observaciones} onChange={e => setForm(f=>({...f,observaciones:e.target.value}))} />
        </div>

        <div style={{ marginTop:14 }}>
          <label style={S.label}>Foto / Referencia</label>
          <input style={S.input} placeholder="URL o descripción de foto"
            value={form.foto_ref} onChange={e => setForm(f=>({...f,foto_ref:e.target.value}))} />
        </div>

        {form.foto_ref && form.foto_ref.startsWith("http") && (
          <img src={form.foto_ref} loading="lazy" alt="" style={{ width:"100%", borderRadius:10, marginTop:10, maxHeight:200, objectFit:"contain", background:"var(--panel-2)", border:"1px solid var(--border)" }} />
        )}

        {/* Acciones */}
        <div style={{ display:"flex", gap:8, marginTop:20 }}>
          <button onClick={onClose} className="mrm-btn-ghost" style={{
            flex:"0 0 auto", padding:"10px 16px", borderRadius:9, cursor:"pointer", fontSize:13,
            border:"1px solid var(--border)", background:"transparent", color:"var(--muted)", fontFamily:T.sans,
          }}>
            Cancelar
          </button>
          <button onClick={() => { onSave(pieza.id, form); onClose(); }} style={{
            flex:1, padding:"10px 16px", borderRadius:9, cursor:"pointer", fontSize:13, fontWeight:700,
            border:"none", background:"var(--inverse-bg)", color:"var(--inverse-text)", fontFamily:T.sans,
            display:"flex", alignItems:"center", justifyContent:"center", gap:7,
          }}>
            <Check size={14} /> Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
