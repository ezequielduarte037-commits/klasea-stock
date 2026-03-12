/**
 * PlanificacionView — v4 (redesign)
 * Props: obras, etapas, lProcs, ordenes, esGestion, onNuevaOC, onUpdateObra, onUpdateOCEstado
 * — Paleta y tipografía unificadas con ObrasScreen
 * — ObrasList rediseñada con mini-gantt y badges
 * — ObraDetalle con header hero, gantt expandido, tabs refinados
 * — CompraCard con stepper lineal, jerarquía clara
 * — FichaBarco con secciones tarjetiadas
 */
import { useMemo, useState, useEffect, useRef } from "react";

// ─── Paleta — idéntica a ObrasScreen ─────────────────────────────────────────
const C = {
  bg:    "#09090b",
  bg1:   "#0c0c10",
  bg2:   "#111116",
  bg3:   "#16161c",
  s0:    "rgba(255,255,255,0.025)",
  s1:    "rgba(255,255,255,0.05)",
  s2:    "rgba(255,255,255,0.08)",
  b0:    "rgba(255,255,255,0.07)",
  b1:    "rgba(255,255,255,0.12)",
  b2:    "rgba(255,255,255,0.22)",
  t0:    "#f4f4f5",
  t1:    "#a1a1aa",
  t2:    "#71717a",
  t3:    "#3f3f46",
  mono:  "'JetBrains Mono','IBM Plex Mono',monospace",
  sans:  "'Outfit',system-ui,sans-serif",
  blue:  "#3b82f6",  blueL: "rgba(59,130,246,0.10)",  blueB: "rgba(59,130,246,0.25)",
  amber: "#f59e0b",  amberL:"rgba(245,158,11,0.09)",  amberB:"rgba(245,158,11,0.25)",
  green: "#10b981",  greenL:"rgba(16,185,129,0.09)",  greenB:"rgba(16,185,129,0.25)",
  red:   "#ef4444",  redL:  "rgba(239,68,68,0.09)",   redB:  "rgba(239,68,68,0.25)",
  purple:"#8b5cf6",
  obra: {
    activa:    { dot:"#3b82f6", bg:"rgba(59,130,246,0.08)",  border:"rgba(59,130,246,0.2)",  label:"Activa"    },
    pausada:   { dot:"#f59e0b", bg:"rgba(245,158,11,0.08)",  border:"rgba(245,158,11,0.2)",  label:"Pausada"   },
    terminada: { dot:"#10b981", bg:"rgba(16,185,129,0.08)",  border:"rgba(16,185,129,0.2)",  label:"Terminada" },
    cancelada: { dot:"#ef4444", bg:"rgba(239,68,68,0.08)",   border:"rgba(239,68,68,0.2)",   label:"Cancelada" },
  },
  etapa: {
    pendiente:  { dot:"#3f3f46", bar:"rgba(255,255,255,0.04)", text:"#71717a" },
    en_curso:   { dot:"#3b82f6", bar:"rgba(59,130,246,0.25)",  text:"#60a5fa" },
    completado: { dot:"#10b981", bar:"rgba(16,185,129,0.25)",  text:"#34d399" },
    bloqueado:  { dot:"#ef4444", bar:"rgba(239,68,68,0.25)",   text:"#f87171" },
  },
  oc: {
    pendiente:  { dot:"#3f3f46", bg:"rgba(63,63,70,0.15)",    border:"rgba(63,63,70,0.3)",    label:"Pendiente"  },
    pedida:     { dot:"#3b82f6", bg:"rgba(59,130,246,0.10)",  border:"rgba(59,130,246,0.25)", label:"Pedido"     },
    aprobada:   { dot:"#f59e0b", bg:"rgba(245,158,11,0.10)",  border:"rgba(245,158,11,0.25)", label:"Aprobado"   },
    en_camino:  { dot:"#8b5cf6", bg:"rgba(139,92,246,0.10)",  border:"rgba(139,92,246,0.25)", label:"En camino"  },
    recibida:   { dot:"#10b981", bg:"rgba(16,185,129,0.10)",  border:"rgba(16,185,129,0.25)", label:"Recibido"   },
    cancelada:  { dot:"#ef4444", bg:"rgba(239,68,68,0.10)",   border:"rgba(239,68,68,0.25)",  label:"Cancelada"  },
  },
};

// ─── CSS global ───────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 3px; height: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.13); }
  input::placeholder, textarea::placeholder { color: ${C.t3} !important; }
  input:focus, textarea:focus, select:focus { border-color: rgba(59,130,246,0.4) !important; outline: none; }

  @keyframes fadeSlideUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeSlideIn  { from{opacity:0;transform:translateX(14px)} to{opacity:1;transform:translateX(0)} }
  @keyframes fadeIn       { from{opacity:0} to{opacity:1} }
  @keyframes expandDown   { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes rowSlide     { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
  @keyframes progressFill { from{width:0} }
  @keyframes shimmer      { 0%{background-position:-200% center} 100%{background-position:200% center} }
  @keyframes pulseDot     { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.55)} }
  @keyframes stepIn       { from{opacity:0;transform:scale(.8)} to{opacity:1;transform:scale(1)} }

  .pl-row   { transition: background .12s, border-left-color .12s; }
  .pl-row:hover { background: rgba(255,255,255,0.028) !important; }
  .pl-card  { transition: border-color .18s; }
  .pl-card:hover  { border-color: rgba(255,255,255,0.12) !important; }
  .pl-btn   { transition: opacity .13s, transform .1s, background .13s; }
  .pl-btn:hover   { opacity: .82 !important; }
  .pl-btn:active  { transform: scale(.97); }
  .pl-tab   { transition: color .14s, border-bottom-color .14s; }
  .pl-tab:hover:not(.active) { color: ${C.t1} !important; }
`;

// ─── Utils ────────────────────────────────────────────────────────────────────
const num  = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const rnd  = v => Math.round(num(v));
const fmtD = d => d ? new Date(d+"T12:00:00").toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit",year:"2-digit"}) : "—";
const fmtS = d => d ? new Date(d+"T12:00:00").toLocaleDateString("es-AR",{day:"2-digit",month:"short"}) : null;
const diasDesde = f => f ? Math.max(0,Math.floor((Date.now()-new Date(f+"T12:00:00"))/86400000)) : null;

function sumarDias(s, n) {
  if (!s) return null;
  const d = new Date(s+"T12:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10);
}
function diffDias(s) {
  if (!s) return null;
  return Math.round((new Date(s+"T12:00:00")-Date.now())/86400000);
}
function acumDias(procs) {
  let a = 0;
  return [...procs].sort((x,y) => (x.orden??0)-(y.orden??0))
    .map(p => { const d = a; a += rnd(p.dias_estimados); return {...p, diaInicio: d}; });
}

const VAGA = /^(pedir\s*(hoy|ya|ahora|urgente|en\s*\d+\s*d[ií]as?)?|sin\s*desc(ripci[oó]n)?|tbd|pendiente|-)\s*$/i;
function limpiarDesc(s) {
  return s.trim().replace(/\.$/, "").replace(/\.\s*(El|La|Los|Las)\s+\w+\s+est[aá]\s+en[^.]+\./gi, "").trim();
}
function parseItems(raw) {
  if (!raw?.trim()) return [];
  const partes = raw.split(/\s*\(\d+\)\s+/).filter(Boolean);
  const proc = s => {
    const c = limpiarDesc(s);
    const ci = c.indexOf(":");
    if (ci > 0 && ci < 35 && /^[A-ZÁÉÍÓÚÑ\s\-]+$/.test(c.slice(0,ci).trim())) {
      const rawDesc = c.slice(ci+1).trim();
      return { titulo: c.slice(0,ci).trim(), desc: VAGA.test(rawDesc) ? null : rawDesc };
    }
    return { titulo: null, desc: VAGA.test(c) ? null : c };
  };
  return (partes.length > 1 ? partes.map(proc) : [proc(raw)]).filter(it => it.titulo || it.desc);
}

function textoTiming({ oc, done, fechaLimite, fechaBase, diasPrev, diaInicio }) {
  if (done) return null;
  if (oc) {
    const p = [];
    if (oc.fecha_pedido)           p.push(`Pedido: ${fmtS(oc.fecha_pedido)}`);
    if (oc.fecha_estimada_entrega) p.push(`Entrega est.: ${fmtS(oc.fecha_estimada_entrega)}`);
    if (oc.fecha_recepcion)        p.push(`Recibido: ${fmtS(oc.fecha_recepcion)}`);
    return p.join("  ·  ") || null;
  }
  const plur = n => n === 1 ? "día" : "días";
  const df = diffDias(fechaLimite);
  if (fechaLimite && df !== null) {
    if (df < 0)   return `Atrasado ${-df} ${plur(-df)} — límite era el ${fmtS(fechaLimite)}`;
    if (df === 0) return `Límite hoy — gestionar de inmediato`;
    if (df <= 7)  return `Gestionar en ${df} ${plur(df)} — límite ${fmtS(fechaLimite)}`;
    return `Gestionar antes del ${fmtD(fechaLimite)} — en ${df} días`;
  }
  if (diasPrev > 0 && fechaBase) {
    const fb = diffDias(fechaBase);
    if (fb !== null && fb > 0) {
      const diasParaPedir = fb - diasPrev;
      return diasParaPedir > 0
        ? `Gestionar en ~${diasParaPedir} ${plur(diasParaPedir)} (${diasPrev}d antes del inicio)`
        : `Gestionar ahora — etapa en ${fb} ${plur(fb)}, requiere ${diasPrev}d de anticipación`;
    }
    return `Gestionar ${diasPrev} ${plur(diasPrev)} antes del inicio de etapa`;
  }
  if (fechaBase) {
    const fb = diffDias(fechaBase);
    if (fb !== null && fb > 0)  return `Etapa prevista para el ${fmtD(fechaBase)} — en ${fb} días`;
    if (fb !== null && fb <= 0) return `Gestionar al completar la etapa anterior`;
  }
  if (diaInicio > 0) return `Al completar la etapa anterior (+${diaInicio}d desde inicio)`;
  return "Al inicio de la obra";
}

// ─── Átomos ───────────────────────────────────────────────────────────────────
const Dot = ({ color, glow = false, pulse = false, size = 7 }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    background: color,
    boxShadow: glow ? `0 0 6px ${color}80` : "none",
    animation: pulse ? "pulseDot 2s ease-in-out infinite" : "none",
  }}/>
);

const Chip = ({ label, color, bg, border }) => (
  <span style={{
    display:"inline-flex", alignItems:"center",
    fontSize: 9, padding: "2px 8px", borderRadius: 99,
    background: bg, color, border: `1px solid ${border}`,
    fontFamily: C.mono, fontWeight: 700,
    letterSpacing: "0.08em", textTransform: "uppercase",
    whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.7,
  }}>{label}</span>
);

function ProgressBar({ value, color, height = 3, shimmer = false }) {
  return (
    <div style={{ height, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{
        height: "100%",
        width: `${Math.min(100, Math.max(0, value))}%`,
        background: shimmer
          ? `linear-gradient(90deg, ${color}60, ${color}, ${color}60)`
          : `linear-gradient(90deg, ${color}70, ${color})`,
        backgroundSize: shimmer ? "200% 100%" : undefined,
        animation: shimmer ? "shimmer 2s linear infinite, progressFill .7s ease both" : "progressFill .7s ease both",
        borderRadius: 99,
        transition: "width .6s cubic-bezier(.4,0,.2,1)",
      }}/>
    </div>
  );
}

function Btn({ children, onClick, variant = "ghost", sm = false, disabled = false, type = "button", style: sx = {} }) {
  const V = {
    ghost:   { bg:"transparent",      color:C.t1,    border:`1px solid ${C.b1}` },
    primary: { bg:C.blueL,            color:"#60a5fa", border:`1px solid ${C.blueB}` },
    green:   { bg:C.greenL,           color:"#34d399", border:`1px solid ${C.greenB}` },
    amber:   { bg:C.amberL,           color:"#fbbf24", border:`1px solid ${C.amberB}` },
    danger:  { bg:C.redL,             color:"#f87171", border:`1px solid ${C.redB}` },
    solid:   { bg:C.blue,             color:"#fff",    border:"none" },
  };
  const v = V[variant] ?? V.ghost;
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="pl-btn" style={{
      padding: sm ? "4px 11px" : "6px 16px",
      fontSize: sm ? 11 : 12,
      fontFamily: C.sans, fontWeight: 500,
      background: v.bg, color: v.color, border: v.border,
      borderRadius: 7, cursor: disabled ? "default" : "pointer",
      opacity: disabled ? .4 : 1, outline: "none",
      ...sx,
    }}>{children}</button>
  );
}

const INP = {
  width: "100%", background: C.s0, border: `1px solid ${C.b0}`,
  color: C.t0, padding: "8px 12px", borderRadius: 8,
  fontSize: 12, outline: "none", fontFamily: C.sans,
  transition: "border-color .15s",
};

// ─── GANTT BAR ────────────────────────────────────────────────────────────────
function GanttBar({ etapas, lProcs, obra, height = 32 }) {
  const procs = useMemo(() =>
    acumDias(lProcs.filter(p => p.linea_id === obra.linea_id)),
  [lProcs, obra.linea_id]);

  const totalDias = useMemo(() =>
    procs.reduce((s,p) => s + rnd(p.dias_estimados), 0) || 1,
  [procs]);

  const diasActual = diasDesde(obra.fecha_inicio) ?? 0;
  const pctActual  = Math.min(100, (diasActual / totalDias) * 100);

  const getEst = proc => {
    const et = etapas.find(e =>
      e.obra_id === obra.id && (e.linea_proceso_id === proc.id || e.nombre === proc.nombre)
    );
    return et?.estado ?? "pendiente";
  };

  const SEG_COLOR = {
    completado: C.green,
    en_curso:   C.blue,
    bloqueado:  C.red,
    pendiente:  C.t3,
  };

  if (!procs.length) return (
    <div style={{
      height, borderRadius: 8, background: C.s0,
      border: `1px solid ${C.b0}`,
      display: "flex", alignItems: "center", paddingLeft: 14,
    }}>
      <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono, letterSpacing: 2, textTransform: "uppercase" }}>
        Sin procesos configurados
      </span>
    </div>
  );

  return (
    <div style={{ position: "relative" }}>
      {/* Segmentos */}
      <div style={{
        display: "flex", height, borderRadius: 8,
        overflow: "hidden", gap: 1.5,
        background: C.bg3, border: `1px solid ${C.b0}`,
      }}>
        {procs.map(proc => {
          const est    = getEst(proc);
          const pct    = (rnd(proc.dias_estimados) / totalDias) * 100;
          const col    = SEG_COLOR[est] ?? C.t3;
          const active = est === "en_curso";
          const done   = est === "completado";
          return (
            <div key={proc.id}
              title={`${proc.nombre} · ${rnd(proc.dias_estimados)}d · ${est}`}
              style={{
                width: `${pct}%`, minWidth: 2, flexShrink: 0,
                background: done
                  ? `linear-gradient(90deg, ${col}80, ${col})`
                  : active
                  ? col
                  : `${col}22`,
                position: "relative", overflow: "hidden",
                transition: "background .3s",
              }}>
              {active && (
                <div style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                  animation: "shimmer 2.2s ease-in-out infinite",
                  backgroundSize: "200% 100%",
                }}/>
              )}
            </div>
          );
        })}
      </div>

      {/* Marcador día actual */}
      {obra.estado === "activa" && obra.fecha_inicio && (
        <div style={{
          position: "absolute", top: -4, bottom: -4,
          left: `${pctActual}%`,
          width: 2, background: C.blue,
          boxShadow: `0 0 8px ${C.blue}99`,
          borderRadius: 1, transform: "translateX(-50%)", zIndex: 2,
          animation: "fadeIn .4s ease both",
        }}>
          <div style={{
            position: "absolute", bottom: "calc(100% + 5px)", left: "50%",
            transform: "translateX(-50%)",
            fontFamily: C.mono, fontSize: 8, color: C.blue,
            whiteSpace: "nowrap", background: C.bg2,
            padding: "2px 6px", borderRadius: 5,
            border: `1px solid ${C.blueB}`,
          }}>
            día {diasActual}
          </div>
        </div>
      )}

      {/* Labels */}
      <div style={{ display: "flex", marginTop: 5, gap: 1.5 }}>
        {procs.map(proc => {
          const pct    = (rnd(proc.dias_estimados) / totalDias) * 100;
          const est    = getEst(proc);
          const active = est === "en_curso";
          const done   = est === "completado";
          return (
            <div key={proc.id} style={{ width: `${pct}%`, minWidth: 2, flexShrink: 0, overflow: "hidden" }}>
              {pct > 6 && (
                <span style={{
                  fontSize: 9, fontFamily: C.sans,
                  color: active ? C.blue : done ? C.green : C.t2,
                  whiteSpace: "nowrap", overflow: "hidden",
                  textOverflow: "ellipsis", display: "block",
                  fontWeight: active ? 600 : 400,
                  letterSpacing: 0.2,
                }}>{proc.nombre}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mini Gantt (lista izquierda) ─────────────────────────────────────────────
function MiniGantt({ obra, etapas, procs }) {
  const totalD = procs.reduce((s,p) => s + rnd(p.dias_estimados), 0) || 1;
  const diasA  = diasDesde(obra.fecha_inicio) ?? 0;
  const pctA   = Math.min(100, (diasA / totalD) * 100);
  const getEst = p => {
    const e = etapas.find(e => e.linea_proceso_id === p.id || e.nombre === p.nombre);
    return e?.estado ?? "pendiente";
  };
  const COL = { completado: C.green, en_curso: C.blue, bloqueado: C.red, pendiente: C.t3 };
  if (!procs.length) return null;
  return (
    <div style={{ position: "relative", marginTop: 6 }}>
      <div style={{
        display: "flex", height: 4, borderRadius: 99,
        overflow: "hidden", gap: 1, background: C.s0,
      }}>
        {procs.map(p => {
          const est  = getEst(p);
          const done = est === "completado";
          const act  = est === "en_curso";
          return (
            <div key={p.id} style={{
              width: `${(rnd(p.dias_estimados)/totalD)*100}%`,
              minWidth: 2, flexShrink: 0,
              background: done
                ? `linear-gradient(90deg, ${COL[est]}80, ${COL[est]})`
                : act
                ? COL[est]
                : `${COL[est]}30`,
              transition: "background .3s",
            }}/>
          );
        })}
      </div>
      {obra.estado === "activa" && obra.fecha_inicio && (
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: `${pctA}%`,
          width: 1.5, background: C.blue, borderRadius: 1,
          transform: "translateX(-50%)", boxShadow: `0 0 4px ${C.blue}`,
        }}/>
      )}
    </div>
  );
}

// ─── Lista izquierda ──────────────────────────────────────────────────────────
function ObrasList({ obras, etapas, lProcs, ordenes, selectedId, onSelect, filtro, setFiltro, busqueda, setBusqueda }) {
  return (
    <div style={{
      width: 264, flexShrink: 0,
      background: C.bg1,
      borderRight: `1px solid ${C.b0}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Search */}
      <div style={{ padding: "12px 12px 8px", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <span style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            fontSize: 11, color: C.t2, pointerEvents: "none", lineHeight: 1,
          }}>⌕</span>
          <input
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar código…"
            style={{ ...INP, paddingLeft: 28, fontSize: 11 }}
          />
        </div>
      </div>

      {/* Filtros */}
      <div style={{
        display: "flex", gap: 3, padding: "0 12px 10px", flexShrink: 0,
      }}>
        {[["todos","Todas"],["activa","Activas"],["pausada","Pausadas"],["terminada","Terminadas"]].map(([v, l]) => {
          const a = filtro === v;
          const oC = C.obra[v] ?? null;
          return (
            <button key={v} type="button" onClick={() => setFiltro(v)} className="pl-btn" style={{
              padding: "3px 9px", borderRadius: 5, cursor: "pointer",
              fontSize: 10, fontFamily: C.sans, fontWeight: a ? 600 : 400,
              background: a ? (oC ? oC.bg : C.s2) : "transparent",
              color: a ? (oC ? oC.dot : C.t0) : C.t2,
              border: a ? `1px solid ${oC ? oC.border : C.b1}` : `1px solid ${C.b0}`,
            }}>{l}</button>
          );
        })}
      </div>

      <div style={{ height: 1, background: C.b0, flexShrink: 0 }}/>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {obras.length === 0 && (
          <div style={{ padding: "48px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 24, color: C.t3, marginBottom: 8 }}>◎</div>
            <div style={{ fontSize: 12, color: C.t2, fontFamily: C.sans }}>Sin obras</div>
          </div>
        )}
        {obras.map((o, idx) => {
          const sel   = o.id === selectedId;
          const eO    = etapas.filter(e => e.obra_id === o.id);
          const pend  = eO.filter(e =>
            e.genera_orden_compra && e.estado !== "completado" &&
            !ordenes.some(oc => oc.obra_id === o.id && (oc.etapa_id === e.id || oc.etapa_nombre === e.nombre))
          ).length;
          const actEt = eO.find(e => e.estado === "en_curso");
          const dias  = diasDesde(o.fecha_inicio);
          const oC    = C.obra[o.estado] ?? C.obra.activa;
          const procs = lProcs.filter(p => p.linea_id === o.linea_id).sort((a,b) => (a.orden??0)-(b.orden??0));
          const comp  = eO.filter(e => e.estado === "completado").length;
          const pct   = eO.length ? Math.round(comp / eO.length * 100) : 0;

          return (
            <div
              key={o.id}
              className="pl-row"
              onClick={() => onSelect(o.id)}
              style={{
                padding: "11px 14px",
                background: sel ? `${oC.dot}0d` : "transparent",
                borderLeft: `3px solid ${sel ? oC.dot : pend > 0 ? C.amber : "transparent"}`,
                borderBottom: `1px solid ${C.b0}`,
                cursor: "pointer",
                animation: `rowSlide .22s ${idx * 0.04}s both`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Dot color={oC.dot} size={6} glow={o.estado === "activa"} pulse={o.estado === "activa"}/>
                  <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: sel ? oC.dot : C.t0 }}>
                    {o.codigo}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {pend > 0 && (
                    <span style={{
                      fontSize: 9, fontFamily: C.mono, fontWeight: 700,
                      color: C.amber, background: C.amberL,
                      border: `1px solid ${C.amberB}`,
                      padding: "1px 6px", borderRadius: 99,
                    }}>{pend}</span>
                  )}
                  <span style={{ fontFamily: C.mono, fontSize: 10, color: oC.dot }}>{pct}%</span>
                </div>
              </div>

              {o.linea_nombre && (
                <div style={{ fontSize: 10, color: C.t2, fontFamily: C.sans, marginBottom: 5 }}>
                  {o.linea_nombre}
                </div>
              )}

              <MiniGantt obra={o} etapas={eO} procs={procs}/>

              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 5 }}>
                {dias !== null && o.estado === "activa" && (
                  <span style={{ fontSize: 9, fontFamily: C.mono, color: C.blue }}>
                    día {dias}
                  </span>
                )}
                {actEt && (
                  <span style={{
                    fontSize: 9, color: C.t2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    flex: 1,
                  }}>{actEt.nombre}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Ficha editable del barco ─────────────────────────────────────────────────
function FichaBarco({ obra, onUpdateObra }) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({});

  function abrirEdicion() {
    setForm({
      motor_marca:      obra.motor_marca      ?? "",
      motor_modelo:     obra.motor_modelo     ?? "",
      grupo_marca:      obra.grupo_marca      ?? "",
      grupo_modelo:     obra.grupo_modelo     ?? "",
      muebles_estilo:   obra.muebles_estilo   ?? "",
      muebles_color:    obra.muebles_color    ?? "",
      muebles_tapizado: obra.muebles_tapizado ?? "",
      mesadas_color:    obra.mesadas_color    ?? "",
      opcionales:       obra.opcionales       ?? "",
      cocina_desc:      obra.cocina_desc      ?? "",
      bano_desc:        obra.bano_desc        ?? "",
      cockpit_desc:     obra.cockpit_desc     ?? "",
      tiene_fly:        obra.tiene_fly        ?? false,
      fly_desc:         obra.fly_desc         ?? "",
    });
    setEditing(true);
  }

  async function guardar() {
    setSaving(true);
    const payload = {};
    Object.entries(form).forEach(([k,v]) => { payload[k] = typeof v === "boolean" ? v : (v.trim() || null); });
    await onUpdateObra(obra.id, payload);
    setSaving(false);
    setEditing(false);
  }

  const set      = (k, v) => setForm(f => ({...f, [k]: v}));
  const motorStr = [obra.motor_marca, obra.motor_modelo].filter(Boolean).join(" · ");
  const grupoStr = [obra.grupo_marca, obra.grupo_modelo].filter(Boolean).join(" · ");
  const hasFly   = editing ? form.tiene_fly : (obra.tiene_fly ?? false);

  const SectionHeader = ({ label, color }) => (
    <div style={{
      fontSize: 8, fontFamily: C.mono, color: color ?? C.t2,
      textTransform: "uppercase", letterSpacing: 2.5,
      marginBottom: 10, fontWeight: 600,
    }}>{label}</div>
  );

  const StaticField = ({ label, value }) => (
    <div>
      <div style={{ fontSize: 9, color: C.t2, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, color: value ? C.t0 : C.t2, fontFamily: C.sans }}>
        {value || <span style={{ fontStyle: "italic", color: C.t3 }}>Sin definir</span>}
      </div>
    </div>
  );

  const EditField = ({ k, label, placeholder }) => (
    <div>
      <div style={{ fontSize: 9, color: C.t1, fontFamily: C.sans, marginBottom: 4 }}>{label}</div>
      <input style={INP} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder}/>
    </div>
  );

  const EditArea = ({ k, label, placeholder }) => (
    <div>
      <div style={{ fontSize: 9, color: C.t1, fontFamily: C.sans, marginBottom: 4 }}>{label}</div>
      <textarea style={{...INP, resize: "vertical", minHeight: 60}} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder}/>
    </div>
  );

  const zonas = [
    { key:"cocina_desc",  label:"Cocina",   color:C.amber },
    { key:"bano_desc",    label:"Baño",     color:C.blue },
    { key:"cockpit_desc", label:"Cockpit",  color:C.green },
    ...(hasFly ? [{ key:"fly_desc", label:"Fly", color:C.purple }] : []),
  ];

  const hasData = motorStr || grupoStr || obra.muebles_estilo || obra.muebles_color || obra.mesadas_color || obra.opcionales;

  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header de sección */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t0 }}>Ficha técnica del barco</div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>Configuración de materiales y equipamiento</div>
        </div>
        {!editing
          ? <Btn sm onClick={abrirEdicion}>Editar ficha</Btn>
          : <div style={{ display: "flex", gap: 6 }}>
              <Btn sm onClick={() => setEditing(false)}>Cancelar</Btn>
              <Btn sm variant="primary" onClick={guardar} disabled={saving}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </Btn>
            </div>
        }
      </div>

      {!editing ? (
        !hasData ? (
          <div style={{
            padding: "40px 20px", textAlign: "center",
            border: `1px dashed ${C.b1}`, borderRadius: 10,
            animation: "fadeIn .3s ease both",
          }}>
            <div style={{ fontSize: 24, color: C.t3, marginBottom: 10 }}>⊡</div>
            <div style={{ fontSize: 13, color: C.t1, marginBottom: 4 }}>Sin datos técnicos</div>
            <div style={{ fontSize: 11, color: C.t2, marginBottom: 16 }}>Cargá la configuración de materiales y equipamiento</div>
            <Btn sm onClick={abrirEdicion}>+ Completar ficha</Btn>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fadeSlideUp .25s ease both" }}>

            {/* Mecánica */}
            {(motorStr || grupoStr) && (
              <div style={{
                background: C.s0, border: `1px solid ${C.b0}`,
                borderRadius: 10, padding: "14px 16px",
                borderTop: `2px solid ${C.blue}`,
              }}>
                <SectionHeader label="Mecánica" color={C.blue}/>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {motorStr && <StaticField label="Motor" value={motorStr}/>}
                  {grupoStr && <StaticField label="Grupo electrógeno" value={grupoStr}/>}
                </div>
              </div>
            )}

            {/* Muebles */}
            {(obra.muebles_estilo || obra.muebles_color || obra.muebles_tapizado || obra.mesadas_color) && (
              <div style={{
                background: C.s0, border: `1px solid ${C.b0}`,
                borderRadius: 10, padding: "14px 16px",
                borderTop: `2px solid ${C.amber}`,
              }}>
                <SectionHeader label="Muebles & Terminaciones" color={C.amber}/>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 12 }}>
                  {obra.muebles_estilo   && <StaticField label="Estilo / Madera" value={obra.muebles_estilo}/>}
                  {obra.muebles_color    && <StaticField label="Color muebles"   value={obra.muebles_color}/>}
                  {obra.muebles_tapizado && <StaticField label="Tapizado"         value={obra.muebles_tapizado}/>}
                  {obra.mesadas_color    && <StaticField label="Color mesadas"    value={obra.mesadas_color}/>}
                </div>
              </div>
            )}

            {/* Zonas */}
            {zonas.some(z => obra[z.key]) && (
              <div style={{
                background: C.s0, border: `1px solid ${C.b0}`,
                borderRadius: 10, padding: "14px 16px",
                borderTop: `2px solid ${C.green}`,
              }}>
                <SectionHeader label="Desglose por zona" color={C.green}/>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
                  {zonas.filter(z => obra[z.key]).map(z => (
                    <div key={z.key} style={{
                      background: `${z.color}08`, borderRadius: 8, padding: "10px 12px",
                      border: `1px solid ${z.color}20`, borderLeft: `3px solid ${z.color}`,
                      animation: "fadeSlideUp .3s ease both",
                    }}>
                      <div style={{ fontSize: 9, fontFamily: C.mono, color: z.color, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 5, fontWeight: 700 }}>
                        {z.label}
                      </div>
                      <div style={{ fontSize: 12, color: C.t1, fontFamily: C.sans, lineHeight: 1.55 }}>{obra[z.key]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Opcionales */}
            {obra.opcionales && (
              <div style={{
                background: C.s0, border: `1px solid ${C.b0}`,
                borderRadius: 10, padding: "14px 16px",
                borderTop: `2px solid ${C.purple}`,
              }}>
                <SectionHeader label="Opcionales / Extras" color={C.purple}/>
                <div style={{ fontSize: 12, color: C.t1, fontFamily: C.sans, lineHeight: 1.6 }}>{obra.opcionales}</div>
              </div>
            )}
          </div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeSlideUp .2s ease both" }}>
          {/* Mecánica */}
          <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "14px 16px" }}>
            <SectionHeader label="Mecánica"/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <EditField k="motor_marca"  label="Motor — Marca"    placeholder="Iveco, Volvo, Yanmar…"/>
              <EditField k="motor_modelo" label="Motor — Modelo"   placeholder="450, D4-300, 4BTA…"/>
              <EditField k="grupo_marca"  label="Grupo — Marca"    placeholder="Kohler, Onan…"/>
              <EditField k="grupo_modelo" label="Grupo — Modelo"   placeholder="9 kva, 6.5 kva…"/>
            </div>
          </div>

          {/* Muebles */}
          <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "14px 16px" }}>
            <SectionHeader label="Muebles & Terminaciones"/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <EditField k="muebles_estilo"   label="Estilo / Madera"   placeholder="Roble, Wengué, Blanco…"/>
              <EditField k="muebles_color"    label="Color muebles"     placeholder="Natural, Oscuro, Blanqueado…"/>
              <EditField k="muebles_tapizado" label="Tapizado"          placeholder="Cuero marrón, tela gris…"/>
              <EditField k="mesadas_color"    label="Color mesadas"     placeholder="Blanco, Mármol, Negro…"/>
            </div>
          </div>

          {/* Opcionales */}
          <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "14px 16px" }}>
            <EditArea k="opcionales" label="Opcionales / Extras" placeholder="GPS, autopiloto, aire acondicionado, TV, bow thruster…"/>
          </div>

          {/* Zonas */}
          <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "14px 16px" }}>
            <SectionHeader label="Desglose por zona"/>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <EditArea k="cocina_desc"  label="Cocina"  placeholder="Mesada: mármol blanco. Bachas: inox. Canilla: Cisal inox…"/>
              <EditArea k="bano_desc"    label="Baño"    placeholder="Mesada: mármol negro. Sanitario: Roca. Ducha: mampara…"/>
              <EditArea k="cockpit_desc" label="Cockpit" placeholder="Tapizado asientos: cuero beige. Alfombra: gris. Madera: teca…"/>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: C.t1, fontFamily: C.sans, padding: "6px 0" }}>
                <input type="checkbox" checked={form.tiene_fly} onChange={e => set("tiene_fly", e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: C.purple, cursor: "pointer" }}/>
                Incluye Fly
              </label>
              {form.tiene_fly && <EditArea k="fly_desc" label="Fly" placeholder="Tapizado asientos fly: cuero gris. Consola fly: fibra de vidrio…"/>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OC Stepper ───────────────────────────────────────────────────────────────
const OC_STEPS = [
  { k:"pendiente", label:"Pendiente", icon:"○" },
  { k:"pedida",    label:"Pedido",    icon:"→" },
  { k:"aprobada",  label:"Aprobado",  icon:"✓" },
  { k:"recibida",  label:"Recibido",  icon:"⊠" },
];

function OCStepperInline({ oc, onUpdateOCEstado }) {
  const curI = OC_STEPS.findIndex(s => s.k === (oc?.estado ?? "pendiente"));
  const next = OC_STEPS[curI + 1];

  return (
    <div style={{
      background: C.s0, border: `1px solid ${C.b0}`,
      borderRadius: 9, overflow: "hidden",
    }}>
      <div style={{
        padding: "6px 12px",
        borderBottom: `1px solid ${C.b0}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 8, fontFamily: C.mono, color: C.t2, textTransform: "uppercase", letterSpacing: 2 }}>
          Estado del pedido
        </span>
        {next && onUpdateOCEstado && (
          <Btn sm variant="green" onClick={e => { e.stopPropagation(); onUpdateOCEstado(oc.id, next.k); }}>
            Marcar como {next.label}
          </Btn>
        )}
      </div>
      <div style={{ display: "flex", padding: "10px 12px", gap: 0 }}>
        {OC_STEPS.map((st, idx) => {
          const past   = idx < curI;
          const active = idx === curI;
          const ahead  = idx > curI;
          const clr    = past || active ? C.green : C.t3;

          return (
            <div key={st.k} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              gap: 5, position: "relative",
            }}>
              {/* Connector line */}
              {idx > 0 && (
                <div style={{
                  position: "absolute", top: 11, right: "50%", left: "-50%",
                  height: 2, borderRadius: 1,
                  background: past || active ? `linear-gradient(90deg, ${C.green}60, ${C.green})` : C.t3,
                  zIndex: 0,
                }}/>
              )}

              {/* Circle */}
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: active ? C.green : past ? C.greenL : "transparent",
                border: `2px solid ${active ? C.green : past ? C.green : C.t3}`,
                color: active ? "#fff" : past ? C.green : C.t3,
                fontSize: past || active ? 11 : 10, fontWeight: 700,
                position: "relative", zIndex: 1,
                animation: active ? "stepIn .3s ease both" : undefined,
                transition: "all .2s",
                flexShrink: 0,
              }}>
                {past ? "✓" : active ? st.icon : idx + 1}
              </div>

              <div style={{
                fontSize: 9, color: clr, fontFamily: C.sans,
                fontWeight: active ? 600 : 400, textAlign: "center",
              }}>{st.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Datos de OC ─────────────────────────────────────────────────────────────
function OCDataGrid({ oc }) {
  const fields = [
    { l:"N° OC",        v: oc.numero_oc },
    { l:"Proveedor",    v: oc.proveedor },
    { l:"Fecha pedido", v: fmtD(oc.fecha_pedido) },
    { l:"Entrega est.", v: fmtD(oc.fecha_estimada_entrega) },
    { l:"Recepción",    v: fmtD(oc.fecha_recepcion) },
    { l:"Monto est.",   v: oc.monto_estimado != null ? `$${num(oc.monto_estimado).toLocaleString("es-AR")}` : null },
    { l:"Monto real",   v: oc.monto_real    != null ? `$${num(oc.monto_real).toLocaleString("es-AR")}`    : null },
  ].filter(x => x.v && x.v !== "—");

  if (!fields.length && !oc.notas) return null;

  return (
    <div style={{
      background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 9,
      padding: "12px 14px",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))",
        gap: 12, marginBottom: oc.notas ? 12 : 0,
      }}>
        {fields.map(x => (
          <div key={x.l}>
            <div style={{ fontSize: 8, fontFamily: C.mono, color: C.t2, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 2 }}>{x.l}</div>
            <div style={{ fontSize: 12, color: C.t0, fontFamily: C.sans }}>{x.v}</div>
          </div>
        ))}
      </div>
      {oc.notas && (
        <>
          <div style={{ height: 1, background: C.b0, margin: "10px 0" }}/>
          <div>
            <div style={{ fontSize: 8, fontFamily: C.mono, color: C.t2, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Notas</div>
            <div style={{ fontSize: 12, color: C.t1, fontFamily: C.sans, lineHeight: 1.55 }}>{oc.notas}</div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Compra Card ──────────────────────────────────────────────────────────────
function CompraCard({ etapa, diaInicio, obra, oc, onNuevaOC, onUpdateOCEstado }) {
  const [open, setOpen] = useState(false);

  const done      = etapa.estado === "completado";
  const diasPrev  = rnd(etapa.orden_compra_dias_previo ?? 0);
  const fechaBase = etapa.fecha_inicio ?? sumarDias(obra.fecha_inicio, diaInicio);
  const fechaLimCalc = diasPrev > 0 ? sumarDias(fechaBase, -diasPrev) : null;
  const fechaLimite  = oc?.fecha_limite_pedido ?? fechaLimCalc;
  const df = diffDias(fechaLimite);

  const vencido = !done && !oc && df !== null && df < 0;
  const urgente = !done && !oc && df !== null && df >= 0 && df <= 10;

  // Color accent
  const accentColor =
    done                      ? C.green :
    oc?.estado === "recibida" ? C.green :
    oc                        ? C.blue  :
    vencido                   ? C.red   :
    urgente                   ? C.amber :
    C.t3;

  const accentBg =
    done                      ? C.greenL :
    oc?.estado === "recibida" ? C.greenL :
    oc                        ? C.blueL  :
    vencido                   ? C.redL   :
    urgente                   ? C.amberL :
    C.s0;

  const accentBorder =
    done                      ? C.greenB :
    oc?.estado === "recibida" ? C.greenB :
    oc                        ? C.blueB  :
    vencido                   ? C.redB   :
    urgente                   ? C.amberB :
    C.b0;

  const statusLabel =
    done                      ? "Completado" :
    oc?.estado === "recibida" ? "Recibido"   :
    oc?.estado === "pedida"   ? "Pedido"     :
    oc?.estado === "aprobada" ? "Aprobado"   :
    oc                        ? "OC emitida" :
    vencido                   ? "Atrasado"   :
    urgente                   ? "Urgente"    :
    "Pendiente";

  const timing = textoTiming({ oc, done, fechaLimite, fechaBase, diasPrev, diaInicio });
  const items  = parseItems(etapa.orden_compra_descripcion);

  return (
    <div className="pl-card" style={{
      borderRadius: 9,
      border: `1px solid ${accentBorder}`,
      background: accentBg,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen(x => !x)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "11px 14px", cursor: "pointer",
          borderLeft: `3px solid ${accentColor}`,
        }}
      >
        <Dot color={accentColor} glow={!done && !oc} pulse={urgente || vencido} size={7}/>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: timing ? 2 : 0 }}>
            <span style={{
              fontSize: 13, fontWeight: 600, fontFamily: C.sans,
              color: done ? C.t1 : C.t0,
            }}>{etapa.nombre}</span>
            <span style={{
              fontSize: 9, fontFamily: C.mono, color: C.t2,
              padding: "1px 6px", background: C.s0,
              border: `1px solid ${C.b0}`, borderRadius: 4,
            }}>+{diaInicio}d</span>
          </div>
          {timing && (
            <div style={{
              fontSize: 11, color: vencido ? C.red : urgente && !oc ? C.amber : C.t2,
              fontFamily: C.sans, lineHeight: 1.4,
            }}>{timing}</div>
          )}
        </div>

        <Chip label={statusLabel} color={accentColor} bg={`${accentColor}15`} border={`${accentColor}30`}/>

        {!done && !oc && onNuevaOC && (
          <Btn sm variant="amber" onClick={e => {
            e.stopPropagation();
            onNuevaOC({
              obra_id: obra.id, obra_codigo: obra.codigo,
              etapa_id: etapa.id, etapa_nombre: etapa.nombre,
              linea_nombre: obra.linea_nombre,
              tipo: etapa.orden_compra_tipo ?? "compra",
              descripcion: etapa.orden_compra_descripcion ?? null,
              monto_estimado: etapa.orden_compra_monto_estimado ?? null,
              dias_previo_aviso: etapa.orden_compra_dias_previo ?? 7,
            });
          }}>+ Crear OC</Btn>
        )}

        <div style={{
          fontSize: 8, color: C.t2, flexShrink: 0,
          transition: "transform .2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }}>▼</div>
      </div>

      {/* Expandido */}
      {open && (
        <div style={{
          borderTop: `1px solid ${accentBorder}`,
          padding: "14px",
          display: "flex", flexDirection: "column", gap: 12,
          animation: "expandDown .18s ease both",
        }}>
          {/* Items de descripción */}
          {items.length > 0 && (
            <div style={{
              background: C.s0, borderRadius: 8, padding: "12px 14px",
              border: `1px solid ${C.b0}`,
              display: "flex", flexDirection: "column", gap: 9,
            }}>
              {items.map((it, i) => (
                <div key={i} style={{
                  paddingBottom: i < items.length - 1 ? 8 : 0,
                  borderBottom: i < items.length - 1 ? `1px solid ${C.b0}` : "none",
                }}>
                  {it.titulo && (
                    <div style={{
                      fontSize: 8, fontFamily: C.mono, color: accentColor,
                      letterSpacing: 2, textTransform: "uppercase", marginBottom: 3, fontWeight: 700,
                    }}>{it.titulo}</div>
                  )}
                  {it.desc && (
                    <div style={{ fontSize: 12, color: C.t1, fontFamily: C.sans, lineHeight: 1.6 }}>
                      {it.desc}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Monto estimado sin OC */}
          {!oc && etapa.orden_compra_monto_estimado && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 12px", background: C.s0,
              border: `1px solid ${C.b0}`, borderRadius: 8,
            }}>
              <span style={{ fontSize: 9, color: C.t2, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: 1.5 }}>Monto est.</span>
              <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.amber }}>
                ${num(etapa.orden_compra_monto_estimado).toLocaleString("es-AR")}
              </span>
            </div>
          )}

          {/* Stepper + datos OC */}
          {oc && (
            <>
              <OCStepperInline oc={oc} onUpdateOCEstado={onUpdateOCEstado}/>
              <OCDataGrid oc={oc}/>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sección de compras ───────────────────────────────────────────────────────
function ComprasSection({ obra, etapasObra, lProcsLinea, ordenes, onNuevaOC, onUpdateOCEstado }) {
  const procsConDias = useMemo(() => acumDias(lProcsLinea), [lProcsLinea]);

  const compras = useMemo(() => etapasObra
    .filter(e => e.genera_orden_compra)
    .map(e => {
      const proc = procsConDias.find(p => p.id === e.linea_proceso_id || p.nombre === e.nombre);
      const oc   = ordenes.find(o => o.obra_id === obra.id && (o.etapa_id === e.id || o.etapa_nombre === e.nombre));
      return { etapa: e, diaInicio: proc?.diaInicio ?? 0, oc };
    })
    .sort((a,b) => a.diaInicio - b.diaInicio),
  [etapasObra, procsConDias, ordenes, obra]);

  const sinOC = compras.filter(c => !c.oc && c.etapa.estado !== "completado").length;
  const conOC = compras.filter(c => !!c.oc).length;
  const done  = compras.filter(c => c.etapa.estado === "completado").length;

  if (!compras.length) return (
    <div style={{ padding: "48px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 24, color: C.t3, marginBottom: 8 }}>◎</div>
      <div style={{ fontSize: 13, color: C.t1, marginBottom: 4 }}>Sin compras configuradas</div>
      <div style={{ fontSize: 11, color: C.t2 }}>Esta obra no tiene etapas que generen órdenes de compra</div>
    </div>
  );

  return (
    <div style={{ padding: "16px 20px", animation: "fadeSlideUp .25s .04s ease both" }}>
      {/* Summary strip */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap",
      }}>
        {sinOC > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 7,
            background: C.amberL, border: `1px solid ${C.amberB}`,
          }}>
            <Dot color={C.amber} size={5} pulse/>
            <span style={{ fontSize: 10, color: C.amber, fontFamily: C.sans, fontWeight: 600 }}>
              {sinOC} sin gestionar
            </span>
          </div>
        )}
        {conOC > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 7,
            background: C.blueL, border: `1px solid ${C.blueB}`,
          }}>
            <Dot color={C.blue} size={5}/>
            <span style={{ fontSize: 10, color: C.blue, fontFamily: C.sans, fontWeight: 600 }}>
              {conOC} con OC
            </span>
          </div>
        )}
        {done > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 7,
            background: C.greenL, border: `1px solid ${C.greenB}`,
          }}>
            <Dot color={C.green} size={5}/>
            <span style={{ fontSize: 10, color: C.green, fontFamily: C.sans, fontWeight: 600 }}>
              {done} completadas
            </span>
          </div>
        )}
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {compras.map((c, i) => (
          <div key={c.etapa.id} style={{ animation: `fadeSlideUp .2s ${i * 0.05}s ease both` }}>
            <CompraCard
              etapa={c.etapa} diaInicio={c.diaInicio}
              obra={obra} oc={c.oc}
              onNuevaOC={onNuevaOC} onUpdateOCEstado={onUpdateOCEstado}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Detalle obra (panel derecho) ─────────────────────────────────────────────
function ObraDetalle({ obra, etapas, lProcs, ordenes, onNuevaOC, onUpdateObra, onUpdateOCEstado }) {
  const [tab, setTab] = useState("compras");
  const prevId = useRef(obra.id);
  useEffect(() => {
    if (prevId.current !== obra.id) { setTab("compras"); prevId.current = obra.id; }
  }, [obra.id]);

  const etapasO   = useMemo(() => etapas.filter(e => e.obra_id === obra.id), [etapas, obra.id]);
  const procsL    = useMemo(() => lProcs.filter(p => p.linea_id === obra.linea_id).sort((a,b) => (a.orden??0)-(b.orden??0)), [lProcs, obra.linea_id]);

  const comp      = etapasO.filter(e => e.estado === "completado").length;
  const total     = etapasO.length;
  const pct       = total ? Math.round(comp / total * 100) : 0;
  const actEt     = etapasO.find(e => e.estado === "en_curso");
  const dias      = diasDesde(obra.fecha_inicio);
  const totalDias = procsL.reduce((s,p) => s + rnd(p.dias_estimados), 0) || 1;
  const oC        = C.obra[obra.estado] ?? C.obra.activa;

  const pendCompras = etapasO.filter(e =>
    e.genera_orden_compra && e.estado !== "completado" &&
    !ordenes.some(oc => oc.obra_id === obra.id && (oc.etapa_id === e.id || oc.etapa_nombre === e.nombre))
  ).length;

  const TABS = [
    { id:"compras", label:"Compras",   badge: pendCompras > 0 ? pendCompras : null },
    { id:"ficha",   label:"Ficha técnica", badge: null },
  ];

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      overflow: "hidden",
      background: C.bg,
      animation: "fadeSlideIn .22s ease both",
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: "18px 22px 0",
        background: C.bg1,
        borderBottom: `1px solid ${C.b0}`,
        flexShrink: 0,
      }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 16 }}>
          {/* Left: meta */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Dot color={oC.dot} size={8} glow pulse={obra.estado === "activa"}/>
              <span style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color: oC.dot, letterSpacing: ".01em" }}>
                {obra.codigo}
              </span>
              {obra.linea_nombre && (
                <Chip label={obra.linea_nombre} color={C.t1} bg={C.s1} border={C.b1}/>
              )}
              <Chip label={oC.label} color={oC.dot} bg={oC.bg} border={oC.border}/>
            </div>
            {obra.descripcion && (
              <div style={{ fontSize: 12, color: C.t1, fontFamily: C.sans, marginBottom: 10, maxWidth: 420 }}>
                {obra.descripcion}
              </div>
            )}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {obra.fecha_inicio && (
                <div>
                  <div style={{ fontSize: 8, fontFamily: C.mono, color: C.t2, textTransform: "uppercase", letterSpacing: 2, marginBottom: 2 }}>Inicio</div>
                  <div style={{ fontSize: 12, color: C.t0, fontFamily: C.sans }}>{fmtD(obra.fecha_inicio)}</div>
                </div>
              )}
              {dias !== null && obra.estado === "activa" && (
                <div>
                  <div style={{ fontSize: 8, fontFamily: C.mono, color: C.t2, textTransform: "uppercase", letterSpacing: 2, marginBottom: 2 }}>Día actual</div>
                  <div style={{ fontSize: 12, color: C.blue, fontFamily: C.mono, fontWeight: 700 }}>{dias} / {totalDias}</div>
                </div>
              )}
              {actEt && (
                <div>
                  <div style={{ fontSize: 8, fontFamily: C.mono, color: C.t2, textTransform: "uppercase", letterSpacing: 2, marginBottom: 2 }}>En curso</div>
                  <div style={{ fontSize: 12, color: C.t0, fontFamily: C.sans }}>{actEt.nombre}</div>
                </div>
              )}
              {obra.fecha_fin_estimada && (
                <div>
                  <div style={{ fontSize: 8, fontFamily: C.mono, color: C.t2, textTransform: "uppercase", letterSpacing: 2, marginBottom: 2 }}>Entrega est.</div>
                  <div style={{ fontSize: 12, color: C.t0, fontFamily: C.sans }}>{fmtD(obra.fecha_fin_estimada)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Right: progress ring area */}
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{
              fontFamily: C.mono, fontSize: 28, fontWeight: 700, lineHeight: 1,
              color: pct === 100 ? C.green : C.t0,
              animation: "fadeSlideUp .4s ease both",
              marginBottom: 6,
            }}>{pct}%</div>
            <div style={{ width: 100, marginBottom: 4 }}>
              <ProgressBar value={pct} color={pct === 100 ? C.green : oC.dot} height={5} shimmer={obra.estado === "activa"}/>
            </div>
            <div style={{ fontSize: 10, color: C.t2, fontFamily: C.sans }}>
              {comp}/{total} etapas
            </div>
          </div>
        </div>

        {/* Gantt bar */}
        <div style={{ marginBottom: 16 }}>
          <GanttBar etapas={etapasO} lProcs={procsL} obra={obra}/>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map(t => {
            const a = tab === t.id;
            return (
              <button key={t.id} type="button"
                className={`pl-tab${a ? " active" : ""}`}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "9px 16px", background: "transparent", border: "none",
                  borderBottom: `2px solid ${a ? C.blue : "transparent"}`,
                  cursor: "pointer", fontFamily: C.sans, fontSize: 12,
                  fontWeight: a ? 600 : 400,
                  color: a ? C.blue : C.t2,
                  display: "flex", alignItems: "center", gap: 7,
                }}>
                {t.label}
                {t.badge !== null && (
                  <span style={{
                    fontSize: 9, fontFamily: C.mono, fontWeight: 700,
                    background: C.amberL, border: `1px solid ${C.amberB}`,
                    color: C.amber, padding: "1px 6px", borderRadius: 99,
                    animation: "fadeIn .3s ease both",
                  }}>{t.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido scrollable */}
      <div key={`${obra.id}-${tab}`} style={{ flex: 1, overflowY: "auto" }}>
        {tab === "compras" && (
          <ComprasSection
            obra={obra} etapasObra={etapasO} lProcsLinea={procsL}
            ordenes={ordenes} onNuevaOC={onNuevaOC} onUpdateOCEstado={onUpdateOCEstado}
          />
        )}
        {tab === "ficha" && (
          <FichaBarco obra={obra} onUpdateObra={onUpdateObra}/>
        )}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function Vacio() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
      <div style={{ textAlign: "center", animation: "fadeSlideUp .4s ease both" }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: C.s0, border: `1px solid ${C.b1}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, color: C.t3, margin: "0 auto 16px",
        }}>◎</div>
        <div style={{ fontSize: 14, color: C.t0, fontFamily: C.sans, fontWeight: 500, marginBottom: 6 }}>
          Seleccioná una obra
        </div>
        <div style={{ fontSize: 12, color: C.t2, fontFamily: C.sans }}>
          para ver su planificación y compras
        </div>
      </div>
    </div>
  );
}

// ─── Principal ────────────────────────────────────────────────────────────────
export default function PlanificacionView({
  obras, etapas, lProcs = [], ordenes,
  esGestion, onNuevaOC, onUpdateObra, onUpdateOCEstado,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [filtro,     setFiltro]     = useState("activa");
  const [busqueda,   setBusqueda]   = useState("");

  const obrasFilt = useMemo(() =>
    obras
      .filter(o => {
        if (filtro !== "todos" && o.estado !== filtro) return false;
        if (busqueda && !(o.codigo ?? "").toLowerCase().includes(busqueda.toLowerCase())) return false;
        return true;
      })
      .sort((a,b) => {
        const ord = { activa:0, pausada:1, terminada:2 };
        return ((ord[a.estado]??3) - (ord[b.estado]??3)) ||
          new Date(b.fecha_inicio ?? 0) - new Date(a.fecha_inicio ?? 0);
      }),
  [obras, filtro, busqueda]);

  const selectedObra = useMemo(() => {
    const inFilt = obrasFilt.find(o => o.id === selectedId);
    const target = inFilt ?? obrasFilt[0];
    return target ? obras.find(o => o.id === target.id) : null;
  }, [selectedId, obrasFilt, obras]);

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", background: C.bg, fontFamily: C.sans, color: C.t0 }}>
      <style>{CSS}</style>
      <ObrasList
        obras={obrasFilt} etapas={etapas} lProcs={lProcs} ordenes={ordenes}
        selectedId={selectedObra?.id ?? null}
        onSelect={setSelectedId}
        filtro={filtro} setFiltro={setFiltro}
        busqueda={busqueda} setBusqueda={setBusqueda}
      />
      {selectedObra
        ? <ObraDetalle
            obra={selectedObra} etapas={etapas} lProcs={lProcs} ordenes={ordenes}
            onNuevaOC={onNuevaOC} onUpdateObra={onUpdateObra} onUpdateOCEstado={onUpdateOCEstado}
          />
        : <Vacio/>
      }
    </div>
  );
}
