import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, Pencil, Search, Table2 } from "lucide-react";
import {
  ESTADO_META, EYEBROW, INP_SM, PANEL, PRIORIDAD_META, T, fmtFecha,
} from "./marmShared";

const FILTROS = [
  { key:"todos", label:"Todas" },
  { key:"Enviado", label:"Enviadas" },
  { key:"Rehacer", label:"A rehacer" },
];

export default function GeneralView({ dashboard, isMobile, onBack, onOpenPieza }) {
  const [query, setQuery] = useState("");
  const [estado, setEstado] = useState("todos");

  const counts = useMemo(() => ({
    todos:dashboard.length,
    Enviado:dashboard.filter(pieza => pieza.estado === "Enviado").length,
    Rehacer:dashboard.filter(pieza => pieza.estado === "Rehacer").length,
  }), [dashboard]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return dashboard.filter(pieza => {
      if (estado !== "todos" && pieza.estado !== estado) return false;
      if (!normalizedQuery) return true;

      return [
        pieza.codigo_barco, pieza.pieza, pieza.sector, pieza.color,
      ].some(value => String(value ?? "").toLowerCase().includes(normalizedQuery));
    });
  }, [dashboard, estado, query]);

  return (
    <div className="mrm-view" style={{ padding:isMobile ? "16px 12px 24px" : "20px 24px 28px" }}>
      <button
        onClick={onBack}
        className="mrm-btn-ghost"
        style={{
          display:"inline-flex", alignItems:"center", gap:5,
          marginBottom:14, padding:"5px 11px", borderRadius:8, cursor:"pointer",
          border:"1px solid var(--border)", background:"transparent",
          color:"var(--muted)", fontFamily:T.sans, fontSize:12,
        }}
      >
        <ChevronLeft size={14} /> Marmolería
      </button>

      <div style={{
        display:"flex", alignItems:"flex-start", justifyContent:"space-between",
        gap:16, marginBottom:16, flexWrap:"wrap",
      }}>
        <div>
          <div style={{ ...EYEBROW, marginBottom:4 }}>Planilla general</div>
          <h1 style={{ margin:0, color:"var(--text)", fontSize:18, fontWeight:700, letterSpacing:-0.3 }}>
            Envíos en seguimiento
          </h1>
          <p style={{ margin:"4px 0 0", color:"var(--dim)", fontSize:12 }}>
            Todas las piezas enviadas o marcadas para rehacer.
          </p>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
          {FILTROS.map(filtro => {
            const active = estado === filtro.key;
            const count = counts[filtro.key] ?? 0;
            const color = filtro.key === "Rehacer" && count > 0 ? "var(--red)" : active ? "var(--text)" : "var(--dim)";

            return (
              <button
                key={filtro.key}
                onClick={() => setEstado(filtro.key)}
                className={active ? undefined : "mrm-chip-btn"}
                style={{
                  display:"inline-flex", alignItems:"center", gap:5,
                  padding:"5px 9px", borderRadius:7, cursor:"pointer",
                  border:active ? "1px solid var(--border-2)" : "1px solid var(--border)",
                  background:active ? "var(--panel-2)" : "transparent",
                  color, fontFamily:T.sans, fontSize:11, fontWeight:active ? 700 : 500,
                }}
              >
                {filtro.key === "Rehacer" && count > 0
                  ? <AlertTriangle size={11} />
                  : filtro.key === "Enviado" ? <CheckCircle2 size={11} /> : <Table2 size={11} />}
                {filtro.label} {count}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ position:"relative", maxWidth:420, marginBottom:12 }}>
        <Search
          size={13}
          style={{
            position:"absolute", left:10, top:"50%", transform:"translateY(-50%)",
            color:"var(--dim)", pointerEvents:"none",
          }}
        />
        <input
          style={{ ...INP_SM, paddingLeft:30 }}
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Buscar barco, pieza, sector o color…"
        />
      </div>

      {dashboard.length === 0 ? (
        <div style={{
          ...PANEL, padding:"46px 24px", borderStyle:"dashed",
          color:"var(--dim)", fontSize:12, textAlign:"center",
        }}>
          No hay piezas en seguimiento.
        </div>
      ) : rows.length === 0 ? (
        <div style={{
          ...PANEL, padding:"32px 20px", borderStyle:"dashed",
          color:"var(--dim)", fontSize:12, textAlign:"center",
        }}>
          No hay resultados para esta búsqueda.
        </div>
      ) : (
        <div className="mrm-scroll" style={{ ...PANEL, overflowX:"auto", overflowY:"hidden" }}>
          <div className="mrm-table" style={{ minWidth:760 }}>
            <div style={{
              display:"grid", gridTemplateColumns:"92px minmax(220px,1.6fr) 110px 112px 108px 34px",
              gap:12, padding:"9px 14px", borderBottom:"1px solid var(--border)",
              background:"var(--panel)",
            }}>
              {["Barco", "Pieza / sector", "Prioridad", "Fecha envío", "Estado", ""].map(label => (
                <div key={label} style={EYEBROW}>{label}</div>
              ))}
            </div>

            {rows.map(pieza => {
              const prioridad = PRIORIDAD_META[pieza.prioridad] ?? PRIORIDAD_META.Media;
              const estadoMeta = ESTADO_META[pieza.estado] ?? ESTADO_META.Pendiente;

              return (
                <div
                  key={pieza.id}
                  className="mrm-row"
                  style={{
                    display:"grid", gridTemplateColumns:"92px minmax(220px,1.6fr) 110px 112px 108px 34px",
                    gap:12, alignItems:"center", minHeight:52,
                    padding:"9px 14px", borderBottom:"1px solid var(--border)",
                  }}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:7, minWidth:0 }}>
                    <span style={{ width:6, height:6, borderRadius:"50%", background:estadoMeta.color, flexShrink:0 }} />
                    <span style={{ overflow:"hidden", textOverflow:"ellipsis", fontFamily:T.mono, color:"var(--text)", fontSize:12, fontWeight:700 }}>
                      {pieza.codigo_barco}
                    </span>
                  </div>

                  <div style={{ minWidth:0 }}>
                    <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"var(--text)", fontSize:13, fontWeight:600 }}>
                      {pieza.pieza}
                    </div>
                    <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"var(--dim)", fontSize:11, marginTop:2 }}>
                      {pieza.sector}{pieza.color ? ` · ${pieza.color}` : ""}
                    </div>
                  </div>

                  <div>
                    <span style={{
                      display:"inline-flex", padding:"3px 7px", borderRadius:6,
                      border:`1px solid ${prioridad.border}`, background:prioridad.bg, color:prioridad.color,
                      fontSize:10, fontWeight:700,
                    }}>
                      {pieza.prioridad || "Media"}
                    </span>
                  </div>

                  <div style={{ color:"var(--muted)", fontFamily:T.mono, fontSize:11 }}>
                    {fmtFecha(pieza.fecha_envio)}
                  </div>

                  <div>
                    <span style={{
                      display:"inline-flex", padding:"3px 7px", borderRadius:6,
                      border:`1px solid ${estadoMeta.border}`, background:estadoMeta.bg, color:estadoMeta.color,
                      fontSize:10, fontWeight:700,
                    }}>
                      {pieza.estado}
                    </span>
                  </div>

                  <button
                    onClick={() => onOpenPieza(pieza)}
                    className="mrm-icon-btn"
                    title="Editar pieza"
                    style={{
                      width:28, height:28, padding:0, border:"1px solid transparent",
                      borderRadius:7, background:"transparent", color:"var(--dim)", cursor:"pointer",
                      display:"inline-flex", alignItems:"center", justifyContent:"center",
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
