import { useEffect, useState } from "react";
import { X, Check, Copy, Info } from "lucide-react";
import { T, EYEBROW, SQL_HISTORIAL, SQL_POR_BARCO } from "./marmShared";

// ── MODAL CONSULTAS SQL ───────────────────────────────────────────
export default function SqlModal({ onClose }) {
  const [sqlCopiado, setSqlCopiado] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"var(--overlay)",
      backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
      onClick={onClose}>
      <div style={{ background:"var(--panel-solid)", border:"1px solid var(--border-2)",
        borderRadius:14, padding:"22px 24px", width:"min(680px,100%)", maxHeight:"88vh", overflowY:"auto",
        position:"relative", boxShadow:"0 24px 64px var(--shadow-strong)",
        color:"var(--text)", fontFamily:T.sans }}
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <button onClick={onClose} title="Cerrar (Esc)" className="mrm-icon-btn" style={{
          position:"absolute", top:14, right:14,
          background:"var(--panel)", border:"1px solid var(--border)",
          color:"var(--muted)", width:30, height:30, borderRadius:8,
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <X size={14} />
        </button>

        <div style={{ ...EYEBROW, marginBottom:5 }}>Supabase SQL Editor</div>
        <h2 style={{ margin:"0 0 4px", fontSize:17, fontWeight:700, color:"var(--text)", fontFamily:T.sans }}>Consultas SQL</h2>
        <p style={{ margin:"0 0 18px", fontSize:12, color:"var(--dim)" }}>
          Copiá estas queries y corrélas en el <strong style={{ color:"var(--muted)" }}>SQL Editor</strong> de tu proyecto Supabase
        </p>

        {[
          { title:"Historial completo por pieza", sql: SQL_HISTORIAL },
          { title:"Resumen por barco", sql: SQL_POR_BARCO },
        ].map(({ title, sql }) => (
          <div key={title} style={{ marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
              <span style={{ fontSize:12, fontWeight:700, color:"var(--muted)" }}>{title}</span>
              <button onClick={() => { navigator.clipboard.writeText(sql); setSqlCopiado(title); setTimeout(() => setSqlCopiado(""), 2000); }}
                className={sqlCopiado === title ? undefined : "mrm-btn-ghost"}
                style={{
                  border:"1px solid var(--border)", background:"var(--panel)",
                  color: sqlCopiado === title ? "var(--green)" : "var(--muted)", padding:"4px 12px", borderRadius:7,
                  cursor:"pointer", fontSize:11, fontFamily:T.mono,
                  display:"inline-flex", alignItems:"center", gap:5, transition:"color 0.2s",
                }}>
                {sqlCopiado === title ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
              </button>
            </div>
            <pre style={{ margin:0, padding:"13px 15px", background:"var(--panel-solid-2)",
              border:"1px solid var(--border)", borderRadius:9, overflowX:"auto",
              fontSize:12, color:"var(--cyan)", fontFamily:T.mono,
              lineHeight:1.65, whiteSpace:"pre" }}>
              {sql}
            </pre>
          </div>
        ))}

        <div style={{ marginTop:6, padding:"10px 14px", background:"var(--blue-soft)",
          border:"1px solid var(--blue-border)", borderRadius:9, fontSize:11, color:"var(--muted)",
          display:"flex", alignItems:"center", gap:8 }}>
          <Info size={13} style={{ color:"var(--blue)", flexShrink:0 }} />
          <span>
            Las tablas son: <code style={{ fontFamily:T.mono }}>marm_lineas</code>, <code style={{ fontFamily:T.mono }}>marm_unidades</code>, <code style={{ fontFamily:T.mono }}>marm_unidad_piezas</code>
          </span>
        </div>
      </div>
    </div>
  );
}
