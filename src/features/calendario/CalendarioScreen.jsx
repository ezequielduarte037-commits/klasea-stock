import { C } from "@/theme";
/**
 * CalendarioScreen.jsx
 * Calendario de producción — Klase A Astillero
 * Movimientos: Desmolde · Traslado · Botadura · Entrega · Feriado · Otro
 *
 * Registro operativo de movimientos de producción.
 */
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/supabaseClient";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";

// ─── Design tokens ────────────────────────────────────────────────────────────
// ─── Event types ──────────────────────────────────────────────────────────────
const TIPOS = {
  desmolde:        { label: "Desmolde",         color: "#60a5fa" },
  traslado:        { label: "Traslado",          color: "#34d399" },
  botadura:        { label: "Botadura",          color: "#818cf8" },
  entrega:         { label: "Entrega",           color: "#67e8f9" },
  entrega_material:{ label: "Entrega material",  color: "#fbbf24" },
  feriado:         { label: "Feriado",           color: "#f87171" },
  reunion:         { label: "Reunión",           color: "#c084fc" },
  otro:            { label: "Otro",              color: "var(--muted)" },
};

// ─── SQL setup ────────────────────────────────────────────────────────────────
const SQL = `create table calendario_eventos (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  tipo        text not null default 'otro',
  titulo      text not null,
  obra        text,
  hora        text,
  notas       text,
  created_at  timestamptz default now()
);`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
  prev:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 3L5 8l5 5"/></svg>,
  next:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 3l5 5-5 5"/></svg>,
  plus:  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 2v12M2 8h12"/></svg>,
  close: <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>,
  clock: <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v4l2.5 2"/></svg>,
  trash: <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"/></svg>,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DIAS_FULL = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MESES_ES  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function dateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
}
function today() {
  const n = new Date();
  return dateStr(n.getFullYear(), n.getMonth(), n.getDate());
}

// ─── EventBadge ───────────────────────────────────────────────────────────────
function EventBadge({ ev, onClick, compact }) {
  const t = TIPOS[ev.tipo] ?? TIPOS.otro;
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(ev); }}
      style={{
        display: "flex", alignItems: "flex-start", gap: 5,
        padding: compact ? "2px 5px" : "3px 7px",
        borderRadius: 5, cursor: "pointer",
        background: `${t.color}18`, border: `1px solid ${t.color}35`,
        marginBottom: 2, overflow: "hidden", transition: "background .12s",
      }}
      className="ev-badge"
    >
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: t.color, flexShrink: 0, marginTop: 4.5 }}/>
      <span style={{ fontSize: 11, color: t.color, fontWeight: 700, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.2, fontFamily: C.sans }}>
        {ev.titulo}{ev.obra ? ` - ${ev.obra}` : ""}
      </span>
      {ev.hora && !compact && (
        <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono, flexShrink: 0, marginTop: 1 }}>{ev.hora}</span>
      )}
    </div>
  );
}

// ─── EventModal ───────────────────────────────────────────────────────────────
function EventModal({ ev, fechaDefault, onClose, onSave, onDelete, esAdmin }) {
  const isNew = !ev?.id;
  const [form, setForm] = useState({
    fecha:  ev?.fecha  ?? fechaDefault ?? today(),
    tipo:   ev?.tipo   ?? "desmolde",
    titulo: ev?.titulo ?? "",
    obra:   ev?.obra   ?? "",
    hora:   ev?.hora   ?? "",
    notas:  ev?.notas  ?? "",
  });
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const ok = form.titulo.trim() && form.fecha;

  const LBL = { fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: C.t2, display: "block", marginBottom: 5, fontWeight: 700 };
  const INP = { background: C.s0, border: `1px solid ${C.b0}`, color: C.t0, padding: "7px 10px", borderRadius: 7, fontSize: 13, outline: "none", width: "100%", fontFamily: C.sans, boxSizing: "border-box" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "var(--overlay-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 26, width: 420, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.t0 }}>{isNew ? "Nuevo movimiento" : "Editar movimiento"}</div>
          <button onClick={onClose} style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.close}</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={LBL}>Tipo de movimiento</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {Object.entries(TIPOS).map(([key, t]) => (
              <button key={key} onClick={() => f("tipo", key)} style={{
                padding: "5px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: C.sans, transition: "all .12s",
                background: form.tipo === key ? `${t.color}22` : "transparent",
                border: `1px solid ${form.tipo === key ? t.color + "55" : C.b0}`,
                color: form.tipo === key ? t.color : C.t2,
                fontWeight: form.tipo === key ? 600 : 400,
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={LBL}>Título *</label>
            <input style={INP} value={form.titulo} onChange={e => f("titulo", e.target.value)} placeholder="Ej: Traslado K52-25 a cabina" autoFocus />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={LBL}>Fecha *</label>
              <input style={{ ...INP, colorScheme: "var(--input-color-scheme, dark)" }} type="date" value={form.fecha} onChange={e => f("fecha", e.target.value)} />
            </div>
            <div>
              <label style={LBL}>Hora</label>
              <input style={INP} type="time" value={form.hora} onChange={e => f("hora", e.target.value)} />
            </div>
          </div>
          <div>
            <label style={LBL}>Obra / Unidad</label>
            <input style={INP} value={form.obra} onChange={e => f("obra", e.target.value)} placeholder="K37-39, K52-23…" />
          </div>
          <div>
            <label style={LBL}>Notas / observaciones</label>
            <textarea style={{ ...INP, height: 74, resize: "vertical", lineHeight: 1.6 }} value={form.notas} onChange={e => f("notas", e.target.value)} placeholder="Datos importantes para consultar después…" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "space-between" }}>
          {!isNew && esAdmin && (
            <button onClick={() => onDelete(ev.id)} style={{ padding: "8px 14px", background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "rgba(239,68,68,0.65)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>
              {I.trash} Eliminar
            </button>
          )}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button onClick={onClose} style={{ padding: "8px 16px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: C.sans }}>Cancelar</button>
            <button onClick={() => ok && onSave(form)} disabled={!ok}
              style={{ padding: "8px 22px", background: ok ? "rgba(59,130,246,0.14)" : C.s0, border: `1px solid ${ok ? "rgba(59,130,246,0.35)" : C.b0}`, color: ok ? "#60a5fa" : C.t2, borderRadius: 8, cursor: ok ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600, fontFamily: C.sans, opacity: ok ? 1 : 0.5 }}>
              {isNew ? "Guardar movimiento" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DayDetail ────────────────────────────────────────────────────────────────
function DayDetail({ fecha, eventos, onAdd, onEdit, esAdmin }) {
  if (!fecha) return null;
  const { y, m, d } = parseDate(fecha);
  const evs = eventos.filter(e => e.fecha === fecha).sort((a, b) => (a.hora || "99") > (b.hora || "99") ? 1 : -1);

  return (
    <div style={{ width: 300, flexShrink: 0, borderLeft: `1px solid ${C.b0}`, display: "flex", flexDirection: "column", height: "100%", background: C.panelSolid }}>
      <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${C.b0}` }}>
        <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: C.t2, marginBottom: 8, fontWeight: 800 }}>Detalle del día</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: C.t2, marginBottom: 4 }}>{DIAS_FULL[(new Date(y, m, d)).getDay()]}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.t0, fontFamily: C.mono, lineHeight: 1 }}>{d}</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 3 }}>{MESES_ES[m]} {y}</div>
          </div>
          <div style={{ padding: "7px 9px", borderRadius: 9, background: C.s1, border: `1px solid ${C.b0}`, textAlign: "center" }}>
            <div style={{ fontFamily: C.mono, color: C.blue, fontWeight: 850, fontSize: 16 }}>{evs.length}</div>
            <div style={{ color: C.t2, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>mov.</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {evs.length === 0 ? (
          <div style={{ fontSize: 12, color: C.t2, paddingTop: 8 }}>Sin movimientos</div>
        ) : evs.map(ev => {
          const t = TIPOS[ev.tipo] ?? TIPOS.otro;
          return (
            <div key={ev.id} onClick={() => onEdit(ev)}
              style={{ background: C.s0, border: `1px solid ${C.b0}`, borderLeft: `3px solid ${t.color}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, cursor: "pointer", transition: "background .12s" }}
              className="day-ev"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.t0 }}>{ev.titulo}</div>
                {ev.hora && (
                  <div style={{ fontSize: 11, color: C.t2, fontFamily: C.mono, flexShrink: 0, display: "flex", alignItems: "center", gap: 3 }}>
                    {I.clock} {ev.hora}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: t.color, background: `${t.color}18`, padding: "1px 7px", borderRadius: 4 }}>{t.label}</span>
                {ev.obra && <span style={{ fontSize: 11, color: C.t2, background: C.s1, padding: "1px 7px", borderRadius: 4, fontFamily: C.mono }}>{ev.obra}</span>}
              </div>
              {ev.notas && <div style={{ fontSize: 12, color: C.t2, marginTop: 5, lineHeight: 1.4 }}>{ev.notas}</div>}
            </div>
          );
        })}
      </div>

      {esAdmin && (
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.b0}` }}>
          <button onClick={() => onAdd(fecha)} style={{ width: "100%", padding: "8px", background: C.s1, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {I.plus} Agregar movimiento
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Toolbar chips ────────────────────────────────────────────────────────────
function MetricPill({ label, value, color }) {
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      height: 30,
      padding: "0 10px",
      borderRadius: 999,
      background: `${color}10`,
      border: `1px solid ${color}30`,
      color,
      flexShrink: 0,
    }}>
      <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 850 }}>{value}</span>
      <span style={{ fontSize: 10, color: C.t2, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800 }}>{label}</span>
    </div>
  );
}

function FilterChip({ active, label, count, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      height: 30,
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      padding: "0 10px",
      borderRadius: 999,
      border: `1px solid ${active ? color + "55" : C.b0}`,
      background: active ? `${color}12` : "transparent",
      color: active ? color : C.t2,
      cursor: "pointer",
      fontSize: 12,
      fontWeight: active ? 850 : 650,
      fontFamily: C.sans,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: color, opacity: active ? 1 : 0.65 }} />
      {label}
      <span style={{ fontFamily: C.mono, fontSize: 11, color: active ? color : C.t2 }}>{count}</span>
    </button>
  );
}

// ─── MonthView ────────────────────────────────────────────────────────────────
function MonthView({ year, month, eventos, selDate, onSelectDate, onAddOnDate }) {
  const hoy = today();
  const firstDay    = new Date(year, month, 1);
  const startDow    = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push({ d: daysInPrev - startDow + 1 + i, current: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, current: true });
  for (let i = 1; i <= 42 - cells.length; i++) cells.push({ d: i, current: false });

  const evByDate = useMemo(() => {
    const map = {};
    eventos.forEach(e => { if (!map[e.fecha]) map[e.fecha] = []; map[e.fecha].push(e); });
    return map;
  }, [eventos]);

  const HDOW = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
        {HDOW.map(d => (
          <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: C.t2, fontWeight: 700, borderRight: `1px solid ${C.b0}` }}>{d}</div>
        ))}
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridTemplateRows: "repeat(6,1fr)", overflow: "hidden" }}>
        {cells.map((cell, idx) => {
          const fStr      = cell.current ? dateStr(year, month, cell.d) : null;
          const isToday   = fStr === hoy;
          const isSel     = fStr === selDate;
          const dayEvs    = fStr ? (evByDate[fStr] ?? []) : [];
          const isFeriado = dayEvs.some(e => e.tipo === "feriado");
          const dow       = idx % 7;

          return (
            <div key={idx} onClick={() => cell.current && onSelectDate(fStr)}
              style={{
                borderRight: `1px solid ${C.b0}`, borderBottom: `1px solid ${C.b0}`,
                padding: "6px 6px 4px",
                background: isSel ? "rgba(59,130,246,0.07)" : isToday ? "rgba(255,255,255,0.025)" : isFeriado ? "rgba(239,68,68,0.03)" : "transparent",
                cursor: cell.current ? "pointer" : "default",
                overflow: "hidden", transition: "background .12s",
                display: "flex", flexDirection: "column",
              }}
              className={cell.current ? "cal-cell" : ""}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <div style={{
                  fontSize: 12, fontWeight: isToday ? 700 : 400, fontFamily: isToday ? C.mono : C.sans,
                  color: !cell.current ? C.t2 + "40" : isToday ? C.t0 : isFeriado ? C.red + "99" : dow === 6 ? C.t2 : C.t1,
                  width: 20, height: 20, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isToday ? "var(--border)" : "transparent",
                  outline: isSel ? `1.5px solid rgba(59,130,246,0.5)` : "none",
                }}>{cell.d}</div>
                {cell.current && (
                  <div className="cell-add" style={{ opacity: 0, transition: "opacity .12s" }}>
                    <button onClick={e => { e.stopPropagation(); onAddOnDate(fStr); }}
                      style={{ background: C.s1, border: `1px solid ${C.b0}`, color: C.t2, width: 16, height: 16, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                      <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M8 2v12M2 8h12"/></svg>
                    </button>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                {dayEvs.slice(0, 3).map(ev => <EventBadge key={ev.id} ev={ev} onClick={() => onSelectDate(fStr)} compact />)}
                {dayEvs.length > 3 && <div style={{ fontSize: 10, color: C.t2, paddingLeft: 4 }}>+{dayEvs.length - 3} más</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WeekView ─────────────────────────────────────────────────────────────────
function WeekView({ year, month, startOfWeek, eventos, selDate, onSelectDate, onAddOnDate }) {
  const hoy = today();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    return { fStr: dateStr(d.getFullYear(), d.getMonth(), d.getDate()), d: d.getDate(), m: d.getMonth() };
  });

  const evByDate = useMemo(() => {
    const map = {};
    eventos.forEach(e => { if (!map[e.fecha]) map[e.fecha] = []; map[e.fecha].push(e); });
    return map;
  }, [eventos]);

  const HDOW = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", flex: 1 }}>
        {days.map((day, i) => {
          const dayEvs    = (evByDate[day.fStr] ?? []).sort((a, b) => (a.hora || "99") > (b.hora || "99") ? 1 : -1);
          const isToday   = day.fStr === hoy;
          const isSel     = day.fStr === selDate;
          const isFeriado = dayEvs.some(e => e.tipo === "feriado");
          return (
            <div key={day.fStr} onClick={() => onSelectDate(day.fStr)}
              style={{
                borderRight: `1px solid ${C.b0}`, borderBottom: `1px solid ${C.b0}`,
                cursor: "pointer",
                background: isSel ? "rgba(59,130,246,0.07)" : isToday ? "rgba(255,255,255,0.025)" : isFeriado ? "rgba(239,68,68,0.03)" : "transparent",
                display: "flex", flexDirection: "column", transition: "background .12s",
              }}
              className="cal-cell"
            >
              <div style={{ padding: "10px 10px 6px", borderBottom: `1px solid ${C.b0}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.t2 }}>{HDOW[i]}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: C.mono, color: isToday ? C.t0 : C.t1, lineHeight: 1.2 }}>{day.d}</div>
                  <div style={{ fontSize: 10, color: C.t2 }}>{MESES_ES[day.m].slice(0, 3)}</div>
                </div>
                <div className="cell-add" style={{ opacity: 0, transition: "opacity .12s" }}>
                  <button onClick={e => { e.stopPropagation(); onAddOnDate(day.fStr); }}
                    style={{ background: C.s1, border: `1px solid ${C.b0}`, color: C.t2, width: 20, height: 20, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M8 2v12M2 8h12"/></svg>
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, padding: "6px 8px", overflowY: "auto" }}>
                {dayEvs.map(ev => <EventBadge key={ev.id} ev={ev} onClick={() => onSelectDate(day.fStr)} compact={false} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CalendarioScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const isAdmin = hasAdminAccess(profile);
  const role    = profile?.role ?? "invitado";
  const esAdmin = isAdmin || role === "admin" || role === "oficina";

  const now = new Date();
  const [year,      setYear]      = useState(now.getFullYear());
  const [month,     setMonth]     = useState(now.getMonth());
  const [view,      setView]      = useState("month");
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow); return d;
  });
  const [eventos,    setEventos]   = useState([]);
  const [selDate,    setSelDate]   = useState(today());
  const [modal,      setModal]     = useState(null);
  const [loading,    setLoading]   = useState(true);
  const [dbErr,      setDbErr]     = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("todos");
    const [busqueda, setBusqueda] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (!busqueda.trim()) {
      setResultadosBusqueda([]);
      return;
    }
    const fetchSearch = async () => {
      setBuscando(true);
      const { data } = await supabase
        .from("calendario_eventos")
        .select("*")
        .or(`titulo.ilike.%${busqueda}%,obra.ilike.%${busqueda}%,notas.ilike.%${busqueda}%`)
        .order("fecha", { ascending: false })
        .limit(15);
      setResultadosBusqueda(data || []);
      setBuscando(false);
    };
    const timeoutId = setTimeout(fetchSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [busqueda]);

  async function cargar() {
    setLoading(true);
    const from    = dateStr(year, month - 1, 1);
    // last day of month+2: new Date(year, month+3, 0) gives the correct last day
    const lastDay = new Date(year, month + 3, 0);
    const to      = dateStr(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate());
    const { data, error } = await supabase
      .from("calendario_eventos")
      .select("*")
      .gte("fecha", from)
      .lte("fecha", to)
      .order("fecha")
      .order("hora");
    if (error) {
      if (error.code === "42P01") { setDbErr(true); }
      else { console.error("[Calendario]", error.message); }
      setLoading(false);
      return;
    }
    setEventos(data ?? []);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, [year, month]);

  const eventosFiltrados = useMemo(() => {
    if (filtroTipo === "todos") return eventos;
    return eventos.filter(e => e.tipo === filtroTipo);
  }, [eventos, filtroTipo]);

  const eventosMes = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
    return eventos.filter(e => e.fecha?.startsWith(prefix));
  }, [eventos, month, year]);

  const eventosDia = useMemo(() => eventos.filter(e => e.fecha === selDate), [eventos, selDate]);

  const countsByType = useMemo(() => {
    const counts = {};
    eventos.forEach(e => { counts[e.tipo] = (counts[e.tipo] || 0) + 1; });
    return counts;
  }, [eventos]);

  const proximosCompactos = useMemo(() =>
    [...eventosFiltrados]
      .filter(e => e.fecha >= today())
      .sort((a, b) => a.fecha > b.fecha ? 1 : a.fecha < b.fecha ? -1 : (a.hora || "99") > (b.hora || "99") ? 1 : -1)
      .slice(0, 4),
    [eventosFiltrados]
  );

  async function guardar(form) {
    const esNuevo = !modal?.ev?.id;
    if (esNuevo) {
      const { error } = await supabase.from("calendario_eventos").insert(form);
      if (error) return alert(error.message);
    } else {
      const { error } = await supabase.from("calendario_eventos").update(form).eq("id", modal.ev.id);
      if (error) return alert(error.message);
    }
    setModal(null);
    cargar();
  }

  async function eliminar(id) {
    if (!window.confirm("¿Eliminar este movimiento?")) return;
    await supabase.from("calendario_eventos").delete().eq("id", id);
    setModal(null);
    cargar();
  }

  function prevMonth() { month === 0 ? (setYear(y => y - 1), setMonth(11)) : setMonth(m => m - 1); }
  function nextMonth() { month === 11 ? (setYear(y => y + 1), setMonth(0)) : setMonth(m => m + 1); }
  function prevWeek()  { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }); }
  function nextWeek()  { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }); }
  function goToday() {
    const n = new Date();
    setYear(n.getFullYear()); setMonth(n.getMonth());
    const dow = (n.getDay() + 6) % 7;
    const ws  = new Date(n); ws.setDate(ws.getDate() - dow);
    setWeekStart(ws); setSelDate(today());
  }

  const weekLabel = useMemo(() => {
    const end = new Date(weekStart); end.setDate(end.getDate() + 6);
    const sm = weekStart.getMonth(), em = end.getMonth();
    if (sm === em) return `${weekStart.getDate()}–${end.getDate()} ${MESES_ES[sm]} ${weekStart.getFullYear()}`;
    return `${weekStart.getDate()} ${MESES_ES[sm].slice(0,3)} – ${end.getDate()} ${MESES_ES[em].slice(0,3)} ${end.getFullYear()}`;
  }, [weekStart]);

  const btnSt = active => ({
    padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: C.sans,
    background: active ? C.s2 : "transparent",
    border: `1px solid ${active ? C.b1 : "transparent"}`,
    color: active ? C.t0 : C.t2, transition: "all .12s",
  });

  if (dbErr) return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, display: "flex", fontFamily: C.sans }}>
      <div style={{ flexShrink: 0, width: isMobile ? 0 : undefined, overflow: "visible" }}>
        <Sidebar profile={profile} signOut={signOut} />
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.22)", borderRadius: 12, padding: 28, maxWidth: 560 }}>
          <div style={{ fontSize: 13, color: "#f87171", fontWeight: 600, marginBottom: 10 }}>Falta crear la tabla en Supabase</div>
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 12 }}>Andá a <strong style={{ color: C.t1 }}>Supabase → SQL Editor</strong> y ejecutá:</div>
          <pre style={{ background: C.panelSolid, border: `1px solid ${C.b0}`, borderRadius: 8, padding: 14, fontSize: 12, color: C.t1, overflowX: "auto", fontFamily: C.mono, lineHeight: 1.7 }}>{SQL}</pre>
          <button onClick={() => { setDbErr(false); cargar(); }} style={{ marginTop: 12, padding: "7px 18px", background: C.s1, border: `1px solid ${C.b0}`, color: C.t0, borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>Reintentar</button>
        </div>
      </div>
    </div>
  );

  return (
      <div style={{ position: "fixed", inset: 0, background: C.bg, color: C.t0, fontFamily: C.sans, display: "flex", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-thumb { background: var(--panel-2); border-radius: 99px; }
        input[type="date"], input[type="time"] { color-scheme: var(--input-color-scheme, dark); }
        .cal-cell:hover { background: rgba(255,255,255,0.025) !important; }
        .cal-cell:hover .cell-add { opacity: 1 !important; }
        .ev-badge:hover { background: var(--panel-2) !important; }
        .day-ev:hover { background: var(--panel) !important; }
        .prox-ev:hover { background: var(--panel) !important; }
      `}</style>

      <div style={{ flexShrink: 0, width: isMobile ? 0 : undefined, overflow: "visible" }}>
        <Sidebar profile={profile} signOut={signOut} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* TOPBAR */}
        <div style={{ height: 52, flexShrink: 0, borderBottom: `1px solid ${C.b0}`, display: "flex", alignItems: "center", gap: 14, padding: isMobile ? "0 12px 0 52px" : "0 24px", background: "var(--topbar)", backdropFilter: "blur(20px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={view === "month" ? prevMonth : prevWeek} style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, width: 28, height: 28, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.prev}</button>
            <button onClick={view === "month" ? nextMonth : nextWeek} style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, width: 28, height: 28, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.next}</button>
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, color: C.t0, fontFamily: C.mono, minWidth: 220 }}>
            {view === "month" ? `${MESES_ES[month]} ${year}` : weekLabel}
          </div>

          <button onClick={goToday} style={{ ...btnSt(false), border: `1px solid ${C.b0}`, color: C.t1 }}>Hoy</button>

          <div style={{ display: "flex", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 7, padding: 2, gap: 2 }}>
            {[["month","Mes"],["week","Semana"]].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} style={{ ...btnSt(view === k), padding: "4px 12px", border: view === k ? `1px solid ${C.b1}` : "1px solid transparent" }}>{l}</button>
            ))}
          </div>

          <div style={{ flex: 1 }}/>
                              <div style={{ position: "relative", display: "flex", alignItems: "center", zIndex: 4000 }}>
            <svg style={{ position: "absolute", left: 10, color: C.t2 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Buscar historial..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t0, padding: "6px 12px 6px 30px", borderRadius: 8, fontSize: 13, outline: "none", width: 220, fontFamily: C.sans }} />
            
            {busqueda.trim() && (
              <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, width: 300, background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 10px 25px rgba(0,0,0,0.5)", maxHeight: 350, overflowY: "auto" }}>
                {buscando ? (
                  <div style={{ padding: 12, fontSize: 12, color: C.t2, textAlign: "center" }}>Buscando...</div>
                ) : resultadosBusqueda.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12, color: C.t2, textAlign: "center" }}>No se encontraron movimientos</div>
                ) : (
                  resultadosBusqueda.map(ev => {
                    const t = TIPOS[ev.tipo] ?? TIPOS.otro;
                    const { y, m, d } = parseDate(ev.fecha);
                    return (
                      <div key={ev.id} style={{ padding: "10px 12px", borderBottom: `1px solid ${C.b0}`, display: "flex", gap: 8, alignItems: "flex-start", background: "transparent" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.color, marginTop: 4, flexShrink: 0 }}/>
                        <div>
                          <div style={{ fontSize: 13, color: C.t0, fontWeight: 500 }}>{ev.titulo}</div>
                          <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{d} {MESES_ES[m]} {y} {ev.obra ? `· ${ev.obra}` : ""}</div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
          {esAdmin && (
            <button onClick={() => setModal({ ev: null, fecha: selDate })}
              style={{ padding: "7px 14px", background: C.s1, border: `1px solid ${C.b1}`, color: C.t0, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 6 }}>
              {I.plus} Movimiento
            </button>
          )}
        </div>

        <div style={{
          flexShrink: 0,
          borderBottom: `1px solid ${C.b0}`,
          background: C.panelSolid,
          padding: "10px 18px",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "auto 1fr auto",
          gap: 12,
          alignItems: "center",
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <MetricPill label="Mes" value={eventosMes.length} color={C.blue} />
            <MetricPill label="Día" value={eventosDia.length} color={C.amber} />
            <MetricPill label="Rango" value={eventos.length} color={C.green} />
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", overflowX: "auto", paddingBottom: 1 }}>
            <FilterChip
              active={filtroTipo === "todos"}
              label="Todos"
              count={eventos.length}
              color={C.t2}
              onClick={() => setFiltroTipo("todos")}
            />
            {Object.entries(TIPOS).map(([k, t]) => (
              <FilterChip
                key={k}
                active={filtroTipo === k}
                label={t.label}
                count={countsByType[k] || 0}
                color={t.color}
                onClick={() => setFiltroTipo(filtroTipo === k ? "todos" : k)}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0, justifyContent: isMobile ? "flex-start" : "flex-end", overflow: "hidden" }}>
            <span style={{ fontSize: 10, color: C.t2, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800, flexShrink: 0 }}>Próximos</span>
            {proximosCompactos.length ? proximosCompactos.map((ev) => {
              const t = TIPOS[ev.tipo] ?? TIPOS.otro;
              const { m, d } = parseDate(ev.fecha);
              return (
                <button key={ev.id} onClick={() => { setSelDate(ev.fecha); setModal({ ev, fecha: ev.fecha }); }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    minWidth: 0,
                    maxWidth: 160,
                    padding: "5px 8px",
                    borderRadius: 999,
                    border: `1px solid ${t.color}33`,
                    background: `${t.color}10`,
                    color: t.color,
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 750,
                    fontFamily: C.sans,
                  }}>
                  <span style={{ fontFamily: C.mono, color: C.t2, flexShrink: 0 }}>{d}/{String(m + 1).padStart(2, "0")}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.titulo}</span>
                </button>
              );
            }) : (
              <span style={{ color: C.t2, fontSize: 12 }}>Sin próximos</span>
            )}
          </div>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Calendario */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {loading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, fontSize: 13 }}>Cargando…</div>
            ) : view === "month" ? (
              <MonthView year={year} month={month} eventos={eventosFiltrados} selDate={selDate} onSelectDate={setSelDate} onAddOnDate={fecha => setModal({ ev: null, fecha })} />
            ) : (
              <WeekView year={year} month={month} startOfWeek={weekStart} eventos={eventosFiltrados} selDate={selDate} onSelectDate={setSelDate} onAddOnDate={fecha => setModal({ ev: null, fecha })} />
            )}
          </div>

          {/* Panel día */}
          <DayDetail fecha={selDate} eventos={eventosFiltrados} onAdd={fecha => setModal({ ev: null, fecha })} onEdit={ev => setModal({ ev, fecha: ev.fecha })} esAdmin={esAdmin} />
        </div>
      </div>

      {modal && (
        <EventModal ev={modal.ev} fechaDefault={modal.fecha} onClose={() => setModal(null)} onSave={guardar} onDelete={eliminar} esAdmin={esAdmin} />
      )}
    </div>
  );
}
