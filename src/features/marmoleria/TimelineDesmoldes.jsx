import { CalendarClock } from "lucide-react";
import { T, PANEL, EYEBROW, fmtFecha, bucketMeta, DESMOLDE_BUCKETS } from "./marmShared";

function HitoCard({ row, stats, onOpen }) {
  const bucket = bucketMeta(row.bucket);
  const diasLabel = row.dias > 0 ? `${row.dias}d` : row.dias === 0 ? "Hoy" : `${Math.abs(row.dias)}d atrás`;

  return (
    <div
      className="mrm-card"
      onClick={onOpen}
      style={{ ...PANEL, width:230, padding:"11px 12px", cursor:"pointer", flexShrink:0 }}
    >
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:9 }}>
        <span style={{ fontFamily:T.mono, fontSize:13, fontWeight:700, color:"var(--text)" }}>
          {row.barco}
          <span style={{ fontWeight:400, fontSize:10, color:"var(--dim)" }}> · {row.linea}</span>
        </span>
        <span style={{
          padding:"2px 6px", borderRadius:6, whiteSpace:"nowrap",
          border:`1px solid ${bucket.border}`, background:bucket.bg, color:bucket.color,
          fontSize:10, fontWeight:700,
        }}>
          {row.bucket === "ahora" ? `Pedir · ${diasLabel}` : bucket.label}
        </span>
      </div>

      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:10 }}>
        <span style={{ fontSize:11, color:"var(--dim)" }}>Plantillas estimadas</span>
        <span style={{
          fontFamily:T.mono, fontSize:12, fontWeight:700,
          color:row.tieneTemplates ? "var(--green)" : "var(--text)",
        }}>
          {fmtFecha(row.estStr)}
        </span>
      </div>

      <div style={{
        marginTop:6, paddingTop:6, borderTop:"1px solid var(--border)",
        display:"flex", alignItems:"center", gap:6,
        color:"var(--dim)", fontSize:10, whiteSpace:"nowrap", overflow:"hidden",
      }}>
        <span>Desmolde {fmtFecha(row.desmolde)}</span>
        <span>·</span>
        <span>{stats?.primerEnvio ? `Enviado ${fmtFecha(stats.primerEnvio)}` : "Sin envío"}</span>
        {stats?.total > 0 && (
          <>
            <span>·</span>
            <span>{stats.pct}% recibido</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function TimelineDesmoldes({
  rows, flotaPorCodigo, onOpenBoat, bucketFilter, onBucketFilter,
}) {
  const filtrados = bucketFilter === "todos" ? rows : rows.filter(r => r.bucket === bucketFilter);
  const counts = {};
  rows.forEach(r => { counts[r.bucket] = (counts[r.bucket] ?? 0) + 1; });

  return (
    <section>
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        gap:12, marginBottom:10, flexWrap:"wrap",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <CalendarClock size={14} style={{ color:"var(--muted)" }} />
          <span style={EYEBROW}>Próximos desmoldes</span>
        </div>

        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
          {[{ key:"todos", label:"Todos" }, ...DESMOLDE_BUCKETS].map(option => {
            const count = option.key === "todos" ? rows.length : (counts[option.key] ?? 0);
            const active = bucketFilter === option.key;
            if (option.key !== "todos" && count === 0 && !active) return null;

            return (
              <button
                key={option.key}
                onClick={() => onBucketFilter(option.key)}
                className={active ? undefined : "mrm-chip-btn"}
                style={{
                  padding:"2px 8px", borderRadius:6, cursor:"pointer", whiteSpace:"nowrap",
                  border:active ? `1px solid ${option.border ?? "var(--border-2)"}` : "1px solid var(--border)",
                  background:active ? (option.bg ?? "var(--panel-2)") : "transparent",
                  color:active ? (option.color ?? "var(--text)") : "var(--dim)",
                  fontFamily:T.sans, fontSize:10, fontWeight:active ? 700 : 400,
                }}
              >
                {option.label}{count > 0 ? ` ${count}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div style={{
          ...PANEL, padding:"18px", borderStyle:"dashed",
          color:"var(--dim)", fontSize:11, textAlign:"center",
        }}>
          Sin hitos en esta categoría
        </div>
      ) : (
        <div className="mrm-scroll" style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
          {filtrados.map(row => (
            <HitoCard
              key={row.barco}
              row={row}
              stats={flotaPorCodigo[row.barco]}
              onOpen={() => onOpenBoat(row.barco)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
