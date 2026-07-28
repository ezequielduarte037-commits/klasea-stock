import { ChevronLeft, History, Database } from "lucide-react";
import { T, PANEL, EYEBROW, ESTADO_META, fmtFecha } from "./marmShared";

// ── HISTORIAL DE ENVÍOS ───────────────────────────────────────────
export default function HistorialView({ historialEnvios, loading, isMobile, onBack, onShowSQL }) {
  return (
    <div className="mrm-view" style={{ padding: isMobile ? "14px 14px" : "20px 24px", maxWidth:1100 }}>
      <button onClick={onBack} className="mrm-btn-ghost" style={{
        display:"inline-flex", alignItems:"center", gap:5, border:"1px solid var(--border)",
        background:"transparent", color:"var(--muted)", padding:"5px 11px", borderRadius:8,
        cursor:"pointer", fontFamily:T.sans, fontSize:12, marginBottom:14,
      }}>
        <ChevronLeft size={14} /> Marmolería
      </button>

      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:12, marginBottom:16, flexWrap:"wrap" }}>
        <div>
          <div style={{ ...EYEBROW, marginBottom:5 }}>Registro</div>
          <h1 style={{ margin:0, fontSize:18, fontWeight:700, color:"var(--text)", letterSpacing:-0.3 }}>Historial de envíos</h1>
          <p style={{ color:"var(--dim)", fontSize:12, margin:"4px 0 0" }}>
            Todas las plantillas enviadas desde que empezaste a usar el programa
            {historialEnvios.length > 0 && <> — <strong style={{ color:"var(--muted)" }}>{historialEnvios.length} registros</strong></>}
          </p>
        </div>
        <button className="mrm-btn-ghost" onClick={onShowSQL} style={{
          display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:8, cursor:"pointer",
          border:"1px solid var(--border)", background:"var(--panel)", color:"var(--muted)",
          fontFamily:T.mono, fontSize:12, transition:"all 0.15s",
        }}>
          <Database size={12} /> Ver SQL
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:60, fontSize:12, color:"var(--dim)", letterSpacing:1.2, textTransform:"uppercase", fontFamily:T.mono }}>
          Cargando historial…
        </div>
      ) : historialEnvios.length === 0 ? (
        <div style={{ ...PANEL, textAlign:"center", padding:"56px 32px", color:"var(--dim)", borderStyle:"dashed" }}>
          <History size={26} style={{ opacity:0.4, marginBottom:10 }} />
          <div style={{ fontSize:12, letterSpacing:1.2, textTransform:"uppercase", fontFamily:T.mono }}>
            Sin registros — los envíos con fecha aparecerán aquí
          </div>
        </div>
      ) : (
        <div className="mrm-scroll" style={{ ...PANEL, overflowX: isMobile ? "auto" : "hidden", overflowY:"hidden" }}>
          <div className="mrm-table">
            <div style={{ display:"grid", gridTemplateColumns:"90px 120px 1fr 110px 110px 120px",
              gap:10, padding:"8px 16px", borderBottom:"1px solid var(--border)", background:"var(--panel-solid-2)" }}>
              {["Barco","Sector","Pieza / Color","F. envío","F. regreso","Estado"].map((h,i) => (
                <div key={i} style={{ fontSize:10, letterSpacing:1.1, textTransform:"uppercase", color:"var(--dim)", fontWeight:700, fontFamily:T.mono }}>{h}</div>
              ))}
            </div>
            {historialEnvios.map((p, idx) => {
              const m = ESTADO_META[p.estado] ?? ESTADO_META["Pendiente"];
              return (
                <div key={idx} className="mrm-row" style={{
                  display:"grid", gridTemplateColumns:"90px 120px 1fr 110px 110px 120px",
                  gap:10, alignItems:"center", padding:"9px 16px",
                  borderBottom:"1px solid var(--border)",
                }}>
                  <div style={{ fontFamily:T.mono, fontSize:13, fontWeight:700, color:"var(--text)" }}>{p.codigo_barco}</div>
                  <div style={{ fontSize:12, color:"var(--dim)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.sector}</div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, color:"var(--text)", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.pieza}</div>
                    {p.color && <div style={{ fontSize:11, color:"var(--dim)", marginTop:1 }}>{p.color}</div>}
                  </div>
                  <div style={{ fontFamily:T.mono, fontSize:12, color:"var(--muted)" }}>{fmtFecha(p.fecha_envio)}</div>
                  <div style={{ fontFamily:T.mono, fontSize:12, color:"var(--dim)" }}>{fmtFecha(p.fecha_regreso)}</div>
                  <div>
                    <span style={{ fontSize:10, letterSpacing:0.8, textTransform:"uppercase", padding:"3px 8px",
                      borderRadius:99, fontWeight:700, background:m.bg, color:m.color, border:`1px solid ${m.border === "transparent" ? "var(--border)" : m.border}` }}>
                      {p.estado}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
