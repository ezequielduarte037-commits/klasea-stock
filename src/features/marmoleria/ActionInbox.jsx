import { Inbox, ChevronRight } from "lucide-react";
import { T, PANEL, EYEBROW } from "./marmShared";

// ── BANDEJA DE ACCIONES PRIORITARIAS ──────────────────────────────
// Responde: ¿qué hay que hacer ahora? Cada ítem es accionable con un toque.
const INBOX_FILTERS = [
  { key:"todas",    label:"Todas" },
  { key:"pedir",    label:"Pedir" },
  { key:"rehacer",  label:"Rehacer" },
  { key:"demorada", label:"Demoradas" },
  { key:"proximo",  label:"Próximas" },
];

function InboxItem({ item }) {
  return (
    <div className="mrm-card" onClick={item.onOpen} style={{
      ...PANEL,
      padding:"10px 11px",
      cursor:"pointer", display:"flex", alignItems:"center", gap:9,
    }}>
      <span style={{ color:item.color, display:"flex", flexShrink:0, opacity:0.85 }}>{item.icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:600, color:"var(--text)", lineHeight:1.3,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {item.titulo}
        </div>
        <div style={{ fontSize:11, color:"var(--dim)", marginTop:2, lineHeight:1.35,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {item.detalle}
        </div>
      </div>
      {item.meta && (
        <span style={{ fontFamily:T.mono, fontSize:11, fontWeight:700, color:item.color, flexShrink:0 }}>
          {item.meta}
        </span>
      )}
      <ChevronRight size={13} style={{ color:"var(--dim)", flexShrink:0 }} />
    </div>
  );
}

export default function ActionInbox({ items, filter, onFilterChange, counts }) {
  const filtrados = filter === "todas" ? items : items.filter(i => i.kind === filter);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <div style={{ padding:"14px 14px 9px", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
        <div style={{ ...EYEBROW }}>Pendientes</div>
        <span style={{ minWidth:22, height:22, padding:"0 7px", borderRadius:99, display:"inline-flex", alignItems:"center", justifyContent:"center",
          border:"1px solid var(--border)", background:"var(--panel)", color:"var(--muted)", fontSize:11, fontWeight:700, fontFamily:T.mono }}>
          {items.length}
        </span>
      </div>

      <div style={{ display:"flex", gap:4, padding:"0 14px 10px", overflowX:"auto", flexShrink:0 }}>
        {INBOX_FILTERS.map(f => {
          const n = f.key === "todas" ? items.length : (counts[f.key] ?? 0);
          const active = filter === f.key;
          if (f.key !== "todas" && n === 0 && !active) return null;
          return (
            <button key={f.key} onClick={() => onFilterChange(f.key)} className={active ? undefined : "mrm-chip-btn"} style={{
              border: active ? "1px solid var(--border-2)" : "1px solid var(--border)",
              background: active ? "var(--panel-2)" : "transparent",
              color: active ? "var(--text)" : "var(--dim)",
              padding:"3px 9px", borderRadius:7, cursor:"pointer", fontSize:10,
              fontWeight: active ? 700 : 400, fontFamily:T.sans, transition:"all 0.12s",
              whiteSpace:"nowrap",
            }}>
              {f.label}{n > 0 ? ` ${n}` : ""}
            </button>
          );
        })}
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"2px 12px 12px", display:"flex", flexDirection:"column", gap:6 }}>
        {items.length === 0 ? (
          <div style={{ ...PANEL, borderStyle:"dashed", textAlign:"center", padding:"28px 18px", color:"var(--dim)" }}>
            <Inbox size={20} style={{ opacity:0.45, marginBottom:7 }} />
            <div style={{ fontSize:12, lineHeight:1.5 }}>
              Sin acciones pendientes
            </div>
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign:"center", padding:"24px 14px", fontSize:11, color:"var(--dim)" }}>
            Sin ítems en esta categoría
          </div>
        ) : (
          filtrados.map(item => <InboxItem key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
