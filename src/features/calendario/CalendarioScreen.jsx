import { C } from "@/theme";
/**
 * CalendarioScreen.jsx
 * Calendario de producción — Klase A Astillero
 *
 * Registro operativo de movimientos. Un evento existe porque alguien lo
 * coordinó: nada se genera automáticamente desde otras tablas. Lo que el
 * sistema hace es SUGERIR (desmoldes estimados sin evento) y AVISAR
 * (conflictos entre lo ya cargado).
 *
 * Un movimiento no es una línea de texto: es una coordinación. Desmolde,
 * traslado y botadura llevan checklist (grúa, camión, cuadrilla…) que se
 * guarda en la columna opcional `coordinacion` (jsonb). Si la columna no
 * existe todavía, todo sigue funcionando sin ella.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";

// ─── Tipos de movimiento ──────────────────────────────────────────────────────
// Cada tipo usa un par completo del theme (color + fondo suave + borde).
// Nada de hex con alfa concatenado: los tokens son variables CSS y
// `${C.blue}30` produce CSS inválido que el navegador descarta en silencio.
const TIPOS = {
  desmolde:         { label: "Desmolde",        color: C.blue,   soft: C.blueL,   border: C.blueB },
  traslado:         { label: "Traslado",        color: C.green,  soft: C.greenL,  border: C.greenB },
  botadura:         { label: "Botadura",        color: C.violet, soft: C.violetL, border: C.violetB },
  entrega:          { label: "Entrega",         color: C.cyan,   soft: C.cyanL,   border: C.cyanB },
  entrega_material: { label: "Entrega material", color: C.teal,  soft: C.tealL,   border: C.tealB },
  feriado:          { label: "Feriado",         color: C.red,    soft: C.redL,    border: C.redB },
  reunion:          { label: "Reunión",         color: C.purple, soft: C.violetL, border: C.violetB },
  otro:             { label: "Otro",            color: C.muted,  soft: C.panel2,  border: C.border },
};

// Tipos que implican mover recursos del astillero: llevan coordinación y
// entran en las reglas de conflicto (grúa única, cuadrilla única).
const TIPOS_OPERATIVOS = ["desmolde", "traslado", "botadura", "entrega"];

// Qué hay que coordinar para que el movimiento pueda hacerse. Son presets:
// el checklist arranca con estos ítems y se confirma de a uno.
const COORD_PRESETS = {
  desmolde: ["Grúa", "Camión del casco", "Cuadrilla"],
  traslado: ["Camión", "Chofer", "Permiso / horario"],
  botadura: ["Grúa", "Cuadrilla", "Remolque al agua"],
  entrega:  ["Documentación", "Transporte del cliente"],
};

// ─── Clima operativo ──────────────────────────────────────────────────────────
// Un desmolde con grúa depende del viento: el calendario muestra el pronóstico
// (Open-Meteo, sin API key) y avisa cuando un día con movimiento de grúa
// supera el límite de viento. Ubicación del astillero: San Fernando, PBA.
// Si el astillero se muda, se cambia acá.
const UBICACION = { lat: -34.44, lon: -58.56, nombre: "San Fernando" };
const VIENTO_LIMITE_GRUA = 30; // km/h

// Códigos WMO del pronóstico → ícono propio + etiqueta en criollo.
function climaInfo(code) {
  if (code === 0) return { icon: "sol", label: "Despejado" };
  if (code <= 2) return { icon: "sol-nube", label: "Algo nublado" };
  if (code === 3) return { icon: "nube", label: "Nublado" };
  if (code === 45 || code === 48) return { icon: "niebla", label: "Niebla" };
  if (code >= 51 && code <= 57) return { icon: "lluvia", label: "Llovizna" };
  if (code >= 61 && code <= 67) return { icon: "lluvia", label: "Lluvia" };
  if (code >= 80 && code <= 82) return { icon: "lluvia", label: "Chaparrones" };
  if (code >= 95) return { icon: "tormenta", label: "Tormenta" };
  return { icon: "nube", label: "Sin dato" };
}

const CLIMA_PATHS = {
  sol: <><circle cx="8" cy="8" r="3.2"/><path d="M8 1.2v1.8M8 13v1.8M1.2 8h1.8M13 8h1.8M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M12.8 3.2l-1.3 1.3M4.5 11.5l-1.3 1.3"/></>,
  "sol-nube": <><circle cx="5.4" cy="5.2" r="2.3"/><path d="M5.4 1v1.5M1 5.2h1.5M2.3 2.1l1.1 1.1"/><path d="M5.5 14.5h6.8a2.8 2.8 0 0 0 .7-5.5 3.8 3.8 0 0 0-7.3 1.2 2.4 2.4 0 0 0-.2 4.3z"/></>,
  nube: <path d="M4 13.5h8a3.2 3.2 0 0 0 .8-6.3 4.4 4.4 0 0 0-8.5 1.4A2.8 2.8 0 0 0 4 13.5z"/>,
  niebla: <path d="M3 5h10M1.8 8h12.4M3 11h10M5 14h6"/>,
  lluvia: <><path d="M4.5 11h7a2.9 2.9 0 0 0 .7-5.7 4 4 0 0 0-7.7 1.3A2.5 2.5 0 0 0 4.5 11z"/><path d="M5.5 12.5l-.8 2.2M9 12.5l-.8 2.2M12 12.5l-.8 2.2"/></>,
  tormenta: <><path d="M4.5 10.5h7a2.9 2.9 0 0 0 .7-5.7 4 4 0 0 0-7.7 1.3 2.5 2.5 0 0 0 0 4.4z"/><path d="M8.8 10.5L6.8 14h2.2l-1.2 3"/></>,
};

function ClimaIcon({ icon, size = 14, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      {CLIMA_PATHS[icon] ?? CLIMA_PATHS.nube}
    </svg>
  );
}

// ─── SQL para setups nuevos (se muestra si la tabla no existe) ────────────────
const SQL = `create table calendario_eventos (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  tipo         text not null default 'otro',
  titulo       text not null,
  obra         text,
  hora         text,
  notas        text,
  coordinacion jsonb not null default '[]'::jsonb,
  created_at   timestamptz default now()
);`;

// ─── Íconos inline (SVG hereda currentColor: sirve en claro y oscuro) ─────────
const I = {
  prev:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 3L5 8l5 5"/></svg>,
  next:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 3l5 5-5 5"/></svg>,
  plus:  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 2v12M2 8h12"/></svg>,
  close: <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>,
  clock: <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v4l2.5 2"/></svg>,
  trash: <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"/></svg>,
  warn:  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2L15 14H1L8 2z"/><path d="M8 6.5v3.5M8 12h.01"/></svg>,
  check: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 8.5l3.5 3.5 7.5-8"/></svg>,
  bulb:  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12.5a4.5 4.5 0 114 0c-.6.4-1 1-1 1.7H7c0-.7-.4-1.3-1-1.7z"/><path d="M7 15h2"/></svg>,
};

// ─── Fechas: TODO lo que depende de "ahora" vive a nivel módulo ───────────────
// react-hooks/purity prohíbe `new Date()` sin argumentos durante el render.
// Estas constantes se calculan una sola vez al cargar el módulo.
const DIAS_FULL  = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES_ES   = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function dateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
}
// Día de semana (0=domingo) de un "YYYY-MM-DD" sin pasar por el huso horario.
function dowOf(fecha) {
  const { y, m, d } = parseDate(fecha);
  return new Date(y, m, d).getDay();
}
function addDaysStr(fecha, n) {
  const { y, m, d } = parseDate(fecha);
  const dt = new Date(y, m, d + n);
  return dateStr(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
function diffDias(a, b) {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((new Date(pb.y, pb.m, pb.d) - new Date(pa.y, pa.m, pa.d)) / 86400000);
}
function fmtCorta(fecha) {
  const { m, d } = parseDate(fecha);
  return `${d}/${m + 1}`;
}
function fmtLarga(fecha) {
  const { m, d } = parseDate(fecha);
  return `${DIAS_FULL[dowOf(fecha)]} ${d} de ${MESES_ES[m].toLowerCase()}`;
}

const _ahora = new Date();
const HOY = dateStr(_ahora.getFullYear(), _ahora.getMonth(), _ahora.getDate());
const MANANA = addDaysStr(HOY, 1);
const HOY_YEAR = _ahora.getFullYear();
const HOY_MONTH = _ahora.getMonth();
// Lunes de la semana actual: referencia para "esta semana" y la vista semana.
const _lunes = new Date(_ahora.getFullYear(), _ahora.getMonth(), _ahora.getDate() - ((_ahora.getDay() + 6) % 7));
const SEMANA_ACTUAL_INICIO = dateStr(_lunes.getFullYear(), _lunes.getMonth(), _lunes.getDate());
const SEMANA_ACTUAL_FIN = addDaysStr(SEMANA_ACTUAL_INICIO, 6);

// ─── Coordinación: helpers ────────────────────────────────────────────────────
function coordDe(ev) {
  return Array.isArray(ev?.coordinacion) ? ev.coordinacion : [];
}
// null si el evento no tiene checklist (tipos sin coordinación o columna
// todavía no migrada): en ese caso no se muestra nada, no se asume nada.
function coordResumen(ev) {
  const items = coordDe(ev);
  if (!items.length) return null;
  const ok = items.filter((item) => item.ok).length;
  return { ok, total: items.length, completo: ok === items.length };
}
function presetCoordinacion(tipo) {
  return (COORD_PRESETS[tipo] ?? []).map((item) => ({ item, ok: false }));
}
function tituloAuto(form) {
  const t = TIPOS[form.tipo] ?? TIPOS.otro;
  return form.titulo.trim() || `${t.label}${form.obra.trim() ? ` ${form.obra.trim()}` : ""}`;
}

// ─── Átomos de UI ─────────────────────────────────────────────────────────────
// Puntitos de coordinación: relleno verde = confirmado, contorno cyan = falta.
// Se ve el estado de la coordinación SIN abrir el evento.
function CoordDots({ ev }) {
  const items = coordDe(ev);
  if (!items.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: 2.5, alignItems: "center", flexShrink: 0 }} title={`Coordinación: ${items.filter((i) => i.ok).length}/${items.length}`}>
      {items.map((item, idx) => (
        <span key={idx} style={{
          width: 5, height: 5, borderRadius: 99,
          background: item.ok ? C.green : "transparent",
          border: `1px solid ${item.ok ? C.green : C.cyan}`,
        }} />
      ))}
    </span>
  );
}

function EventBadge({ ev, onClick, compact }) {
  const t = TIPOS[ev.tipo] ?? TIPOS.otro;
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(ev); }}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: compact ? "2px 5px 2px 0" : "3px 7px 3px 0",
        borderRadius: 6, cursor: "pointer",
        background: t.soft,
        marginBottom: 3, overflow: "hidden", transition: "filter .12s",
      }}
      className="ev-badge"
      title={`${t.label}${ev.hora ? ` · ${ev.hora}` : ""}`}
    >
      {/* Muesca de color: el tipo se lee de costado, no pinta todo el pill */}
      <span style={{ width: 3, alignSelf: "stretch", background: t.color, flexShrink: 0, borderRadius: "3px 0 0 3px" }} />
      <span style={{ fontSize: 11, color: C.t0, fontWeight: 650, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.25, fontFamily: C.sans, flex: 1, minWidth: 0 }}>
        {ev.titulo}{ev.obra ? ` - ${ev.obra}` : ""}
      </span>
      <CoordDots ev={ev} />
      {ev.hora && !compact && (
        <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono, flexShrink: 0 }}>{ev.hora}</span>
      )}
    </div>
  );
}

function MetricPill({ label, value, color, soft, border, onClick, activo }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7, height: 30,
        padding: "0 10px", borderRadius: 999,
        background: activo || !onClick ? soft : "transparent",
        border: `1px solid ${activo || !onClick ? border : C.b0}`,
        color, flexShrink: 0, cursor: onClick ? "pointer" : "default", fontFamily: C.sans,
      }}
    >
      <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 850 }}>{value}</span>
      <span style={{ fontSize: 10, color: C.t2, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800 }}>{label}</span>
    </Tag>
  );
}

function FilterChip({ active, label, count, color, soft, border, onClick }) {
  return (
    <button onClick={onClick} style={{
      height: 30, display: "inline-flex", alignItems: "center", gap: 7,
      padding: "0 10px", borderRadius: 999,
      border: `1px solid ${active ? border : C.b0}`,
      background: active ? soft : "transparent",
      color: active ? color : C.t2,
      cursor: "pointer", fontSize: 12, fontWeight: active ? 850 : 650,
      fontFamily: C.sans, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: color, opacity: active ? 1 : 0.65 }} />
      {label}
      <span style={{ fontFamily: C.mono, fontSize: 11, color: active ? color : C.t2 }}>{count}</span>
    </button>
  );
}

// ─── EventModal: la pantalla crítica ──────────────────────────────────────────
// Todo se carga a mano, así que el alta tiene que costar segundos:
// · fecha y tipo vienen precargados según dónde se hizo clic
// · el título se autogenera (tipo + obra) si se deja vacío
// · la hora tiene presets de un toque
// · la coordinación es un checklist inline, no texto libre en notas
function EventModal({ ev, preset, fechaDefault, obrasConocidas, onClose, onSave, onDelete, esAdmin }) {
  const isNew = !ev?.id;
  const tipoInicial = ev?.tipo ?? preset?.tipo ?? "desmolde";
  const [form, setForm] = useState(() => ({
    fecha: ev?.fecha ?? preset?.fecha ?? fechaDefault ?? HOY,
    tipo: tipoInicial,
    titulo: ev?.titulo ?? preset?.titulo ?? "",
    obra: ev?.obra ?? preset?.obra ?? "",
    hora: ev?.hora ?? preset?.hora ?? "",
    notas: ev?.notas ?? "",
    coordinacion: coordDe(ev).length ? coordDe(ev) : presetCoordinacion(tipoInicial),
  }));
  const f = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const ok = Boolean(form.fecha);

  const cambiarTipo = (tipo) => setForm((p) => ({
    ...p,
    tipo,
    // El checklist es del tipo: si cambia el tipo, cambian los recursos.
    coordinacion: presetCoordinacion(tipo),
  }));

  const LBL = { fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: C.t2, display: "block", marginBottom: 5, fontWeight: 700 };
  const INP = { background: C.s0, border: `1px solid ${C.b0}`, color: C.t0, padding: "8px 10px", borderRadius: 7, fontSize: 13, outline: "none", width: "100%", fontFamily: C.sans, boxSizing: "border-box" };
  const t = TIPOS[form.tipo] ?? TIPOS.otro;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "var(--overlay-strong)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 14, padding: "22px 22px 18px", width: 460, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.t0 }}>{isNew ? "Nuevo movimiento" : "Editar movimiento"}</div>
          <button onClick={onClose} style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.close}</button>
        </div>

        {/* 1 toque: tipo */}
        <div style={{ marginBottom: 12 }}>
          <label style={LBL}>Tipo</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {Object.entries(TIPOS).map(([key, tt]) => (
              <button key={key} onClick={() => cambiarTipo(key)} style={{
                padding: "5px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: C.sans, transition: "all .12s",
                background: form.tipo === key ? tt.soft : "transparent",
                border: `1px solid ${form.tipo === key ? tt.border : C.b0}`,
                color: form.tipo === key ? tt.color : C.t2,
                fontWeight: form.tipo === key ? 700 : 400,
              }}>{tt.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 11 }}>
          {/* 2 toques: obra + fecha/hora. El título es opcional. */}
          <div>
            <label style={LBL}>Obra / Unidad</label>
            <input style={INP} list="cal-obras" value={form.obra} onChange={(e) => f("obra", e.target.value)} placeholder="K37-39, K52-23…" autoFocus={isNew} />
            <datalist id="cal-obras">
              {obrasConocidas.map((o) => <option key={o} value={o} />)}
            </datalist>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={LBL}>Fecha *</label>
              <input style={INP} type="date" value={form.fecha} onChange={(e) => f("fecha", e.target.value)} />
            </div>
            <div>
              <label style={LBL}>Hora</label>
              <input style={INP} type="time" value={form.hora} onChange={(e) => f("hora", e.target.value)} />
              <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                {["08:00", "09:30", "13:00"].map((h) => (
                  <button key={h} onClick={() => f("hora", h)} style={{
                    flex: 1, padding: "3px 0", borderRadius: 5, cursor: "pointer", fontSize: 10.5, fontFamily: C.mono,
                    background: form.hora === h ? t.soft : C.s0,
                    border: `1px solid ${form.hora === h ? t.border : C.b0}`,
                    color: form.hora === h ? t.color : C.t2,
                  }}>{h}</button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label style={LBL}>Título <span style={{ color: C.t3, textTransform: "none", letterSpacing: 0 }}>(vacío = {tituloAuto(form)})</span></label>
            <input style={INP} value={form.titulo} onChange={(e) => f("titulo", e.target.value)} placeholder={tituloAuto({ ...form, titulo: "" })} />
          </div>

          {/* Coordinación: qué hace falta para que esto pueda pasar. */}
          {form.coordinacion.length > 0 && (
            <div>
              <label style={LBL}>Coordinación</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {form.coordinacion.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => f("coordinacion", form.coordinacion.map((c, i) => i === idx ? { ...c, ok: !c.ok } : c))}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "5px 10px", borderRadius: 6, cursor: "pointer",
                      fontSize: 12, fontFamily: C.sans, fontWeight: item.ok ? 700 : 400,
                      background: item.ok ? C.greenL : "transparent",
                      border: `1px solid ${item.ok ? C.greenB : C.cyanB}`,
                      color: item.ok ? C.green : C.cyan,
                    }}
                  >
                    <span style={{
                      width: 13, height: 13, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: item.ok ? C.green : "transparent",
                      border: `1px solid ${item.ok ? C.green : C.cyan}`,
                      color: "#fff",
                    }}>{item.ok ? I.check : null}</span>
                    {item.item}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={LBL}>Notas</label>
            <textarea style={{ ...INP, height: 56, resize: "vertical", lineHeight: 1.5 }} value={form.notas} onChange={(e) => f("notas", e.target.value)} placeholder="Detalles para consultar después…" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "space-between" }}>
          {!isNew && esAdmin && (
            <button onClick={() => onDelete(ev.id)} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${C.redB}`, color: C.red, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>
              {I.trash} Eliminar
            </button>
          )}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button onClick={onClose} style={{ padding: "8px 16px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: C.sans }}>Cancelar</button>
            <button onClick={() => ok && onSave({ ...form, titulo: tituloAuto(form) })} disabled={!ok}
              style={{ padding: "8px 22px", background: ok ? C.blueL : C.s0, border: `1px solid ${ok ? C.blueB : C.b0}`, color: ok ? C.blue : C.t2, borderRadius: 8, cursor: ok ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700, fontFamily: C.sans, opacity: ok ? 1 : 0.5 }}>
              {isNew ? "Guardar movimiento" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DayDetail: detalle contextual del día seleccionado ───────────────────────
// La coordinación se confirma desde acá con un toque, sin abrir el modal.
function DayDetail({ fecha, eventos, conflictos, feriadoNombre, climaDia, onAdd, onEdit, onToggleCoord, esAdmin, isMobile, onClose }) {
  if (!fecha) return null;
  const { y, m, d } = parseDate(fecha);
  const evs = eventos
    .filter((e) => e.fecha === fecha)
    .sort((a, b) => ((a.hora || "99") > (b.hora || "99") ? 1 : -1));

  const panel = (
    <div style={{
      width: isMobile ? "min(88vw, 340px)" : 300, flexShrink: 0,
      borderLeft: `1px solid ${C.b0}`, display: "flex", flexDirection: "column",
      height: "100%", background: C.panelSolid,
    }}>
      <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${C.b0}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: feriadoNombre ? C.red : C.t2, marginBottom: 4, fontWeight: 800 }}>
              {DIAS_FULL[dowOf(fecha)]}{feriadoNombre ? ` · ${feriadoNombre}` : ""}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: C.t0, fontFamily: C.mono, lineHeight: 1 }}>{d}</span>
              <span style={{ fontSize: 12, color: C.t2 }}>{MESES_ES[m]} {y}</span>
              {fecha === HOY && <span style={{ fontSize: 10, color: C.blue, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Hoy</span>}
            </div>
          </div>
          {isMobile && (
            <button onClick={onClose} style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.close}</button>
          )}
        </div>
        {climaDia && (
          <div style={{
            marginTop: 10, padding: "8px 10px", borderRadius: 9,
            background: climaDia.viento >= VIENTO_LIMITE_GRUA ? C.redL : C.s0,
            border: `1px solid ${climaDia.viento >= VIENTO_LIMITE_GRUA ? C.redB : C.b0}`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ color: climaDia.viento >= VIENTO_LIMITE_GRUA ? C.red : C.cyan, display: "inline-flex" }}>
              <ClimaIcon icon={climaInfo(climaDia.code).icon} size={22} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 750, color: C.t0 }}>
                {climaInfo(climaDia.code).label} · {Math.round(climaDia.tmax)}°/{Math.round(climaDia.tmin)}°
              </div>
              <div style={{ fontSize: 10, color: climaDia.viento >= VIENTO_LIMITE_GRUA ? C.red : C.t2, marginTop: 1, fontWeight: climaDia.viento >= VIENTO_LIMITE_GRUA ? 800 : 400 }}>
                Viento {Math.round(climaDia.viento)} km/h{climaDia.viento >= VIENTO_LIMITE_GRUA ? " · fuerte para grúa" : ""}
                {climaDia.lluvia != null ? ` · lluvia ${climaDia.lluvia}%` : ""}
              </div>
            </div>
          </div>
        )}
        {conflictos.length > 0 && (
          <div style={{ marginTop: 10, padding: "7px 9px", borderRadius: 8, background: C.redL, border: `1px solid ${C.redB}`, display: "grid", gap: 3 }}>
            {conflictos.map((c) => (
              <div key={c.key} style={{ display: "flex", gap: 6, alignItems: "flex-start", color: C.red, fontSize: 11, lineHeight: 1.35 }}>
                <span style={{ flexShrink: 0, marginTop: 1 }}>{I.warn}</span> {c.texto}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {evs.length === 0 ? (
          <div style={{ fontSize: 12, color: C.t2, paddingTop: 8 }}>Sin movimientos</div>
        ) : evs.map((ev) => {
          const t = TIPOS[ev.tipo] ?? TIPOS.otro;
          const coord = coordDe(ev);
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
                <span style={{ fontSize: 11, color: t.color, background: t.soft, border: `1px solid ${t.border}`, padding: "1px 7px", borderRadius: 4 }}>{t.label}</span>
                {ev.obra && <span style={{ fontSize: 11, color: C.t2, background: C.s1, padding: "1px 7px", borderRadius: 4, fontFamily: C.mono }}>{ev.obra}</span>}
              </div>
              {/* Checklist de coordinación: un toque confirma (grúa lista, etc.) */}
              {coord.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 7 }}>
                  {coord.map((item, idx) => (
                    <button
                      key={idx}
                      disabled={!esAdmin}
                      onClick={(e) => { e.stopPropagation(); onToggleCoord(ev, idx); }}
                      title={esAdmin ? (item.ok ? "Marcar pendiente" : "Confirmar") : item.item}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "3px 8px", borderRadius: 5, fontSize: 10.5, fontFamily: C.sans,
                        cursor: esAdmin ? "pointer" : "default",
                        fontWeight: item.ok ? 700 : 400,
                        background: item.ok ? C.greenL : "transparent",
                        border: `1px solid ${item.ok ? C.greenB : C.cyanB}`,
                        color: item.ok ? C.green : C.cyan,
                      }}
                    >
                      {item.ok ? I.check : null}{item.item}
                    </button>
                  ))}
                </div>
              )}
              {ev.notas && <div style={{ fontSize: 12, color: C.t2, marginTop: 6, lineHeight: 1.4 }}>{ev.notas}</div>}
            </div>
          );
        })}
      </div>

      {esAdmin && (
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.b0}` }}>
          <button onClick={() => onAdd(fecha)} style={{ width: "100%", padding: "8px", background: C.s1, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {I.plus} Agregar movimiento
          </button>
        </div>
      )}
    </div>
  );

  // En el celular el detalle es una hoja que tapa la agenda; en escritorio
  // convive al lado del calendario.
  if (!isMobile) return panel;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2500, background: "var(--overlay-strong)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ height: "100%" }}>{panel}</div>
    </div>
  );
}

// ─── MonthView: la pantalla principal ─────────────────────────────────────────
// Celdas-tarjeta con aire (gap, no rejilla de hairlines), feriados con su
// nombre, glifo de clima en cada día con pronóstico, y el viento en rojo
// cuando supera el límite de grúa. Escaneo rápido primero, detalle después.
function MonthView({ year, month, eventos, selDate, onSelectDate, onAddOnDate, fechasConflicto, feriadosInfo, clima }) {
  const firstDay    = new Date(year, month, 1);
  const startDow    = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push({ d: daysInPrev - startDow + 1 + i, current: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, current: true });
  for (let i = 1; i <= 42 - cells.length; i++) cells.push({ d: i, current: false });

  // Construido de una, sin mutar un Map que escapa del useMemo (regla del
  // compilador de React).
  const evByDate = useMemo(() => {
    const fechas = [...new Set(eventos.map((e) => e.fecha))];
    return Object.fromEntries(fechas.map((f) => [f, eventos.filter((e) => e.fecha === f)]));
  }, [eventos]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "10px 12px 12px", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, flexShrink: 0 }}>
        {DIAS_SHORT.map((d, i) => (
          <div key={d} style={{
            padding: "2px 4px", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
            color: i >= 5 ? C.t3 : C.t2, fontWeight: 800,
          }}>{d}</div>
        ))}
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridTemplateRows: "repeat(6,1fr)", gap: 6, overflow: "hidden" }}>
        {cells.map((cell, idx) => {
          const fStr      = cell.current ? dateStr(year, month, cell.d) : null;
          const isToday   = fStr === HOY;
          const isSel     = fStr === selDate;
          const dayEvs    = fStr ? (evByDate[fStr] ?? []) : [];
          const feriado   = fStr ? feriadosInfo.get(fStr) : null;
          const climaDia  = fStr ? clima[fStr] : null;
          const hayConflicto = fStr ? fechasConflicto.has(fStr) : false;
          const dow       = idx % 7;
          const vientoFuerte = climaDia && climaDia.viento >= VIENTO_LIMITE_GRUA;

          return (
            <div key={idx} onClick={() => cell.current && onSelectDate(fStr)}
              style={{
                borderRadius: 10,
                border: `1px solid ${isSel ? C.blueB : hayConflicto ? C.redB : C.b0}`,
                padding: "6px 7px 5px",
                background: isSel
                  ? C.blueL
                  : feriado
                    ? C.redL
                    : cell.current
                      ? (dow >= 5 ? C.panel : C.panelSolid)
                      : "transparent",
                opacity: cell.current ? 1 : 0.35,
                cursor: cell.current ? "pointer" : "default",
                overflow: "hidden",
                display: "flex", flexDirection: "column",
                transition: "border-color .12s, background .12s",
              }}
              className={cell.current ? "cal-cell" : ""}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <div style={{
                  fontSize: 12, fontWeight: isToday ? 800 : 500, fontFamily: C.mono,
                  color: isToday ? "var(--bg)" : feriado ? C.red : dow >= 5 ? C.t2 : C.t1,
                  width: 21, height: 21, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isToday ? C.blue : "transparent",
                }}>{cell.d}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {hayConflicto && (
                    <span title="Conflicto: mirá el detalle del día" style={{ color: C.red, display: "inline-flex" }}>{I.warn}</span>
                  )}
                  {climaDia && (
                    <span
                      title={`${climaInfo(climaDia.code).label} · máx ${Math.round(climaDia.tmax)}° mín ${Math.round(climaDia.tmin)}° · viento ${Math.round(climaDia.viento)} km/h${climaDia.lluvia != null ? ` · lluvia ${climaDia.lluvia}%` : ""}`}
                      style={{ color: vientoFuerte ? C.red : C.t2, display: "inline-flex", alignItems: "center", gap: 3 }}
                    >
                      <ClimaIcon icon={climaInfo(climaDia.code).icon} size={13} />
                      {vientoFuerte && <span style={{ fontSize: 8.5, fontWeight: 900, fontFamily: C.mono }}>{Math.round(climaDia.viento)}</span>}
                    </span>
                  )}
                  {cell.current && (
                    <div className="cell-add" style={{ opacity: 0, transition: "opacity .12s" }}>
                      <button onClick={(e) => { e.stopPropagation(); onAddOnDate(fStr); }}
                        style={{ background: C.s1, border: `1px solid ${C.b0}`, color: C.t2, width: 16, height: 16, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                        <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M8 2v12M2 8h12"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {feriado && cell.current && (
                <div style={{
                  fontSize: 8.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                  color: C.red, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{feriado}</div>
              )}
              <div style={{ flex: 1, overflow: "hidden" }}>
                {dayEvs.slice(0, 3).map((ev) => <EventBadge key={ev.id} ev={ev} onClick={() => onSelectDate(fStr)} compact />)}
                {dayEvs.length > 3 && <div style={{ fontSize: 10, color: C.t2, paddingLeft: 4 }}>+{dayEvs.length - 3} más</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WeekView: la semana operativa, con hora a la vista ───────────────────────
function WeekView({ startOfWeek, eventos, selDate, onSelectDate, onAddOnDate, fechasConflicto, feriadosInfo }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    return { fStr: dateStr(d.getFullYear(), d.getMonth(), d.getDate()), d: d.getDate(), m: d.getMonth() };
  });

  const evByDate = useMemo(() => {
    const fechas = [...new Set(eventos.map((e) => e.fecha))];
    return Object.fromEntries(fechas.map((f) => [f, eventos.filter((e) => e.fecha === f)]));
  }, [eventos]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", flex: 1 }}>
        {days.map((day, i) => {
          const dayEvs    = (evByDate[day.fStr] ?? []).sort((a, b) => ((a.hora || "99") > (b.hora || "99") ? 1 : -1));
          const isToday   = day.fStr === HOY;
          const isSel     = day.fStr === selDate;
          const feriado   = feriadosInfo.get(day.fStr);
          const hayConflicto = fechasConflicto.has(day.fStr);
          return (
            <div key={day.fStr} onClick={() => onSelectDate(day.fStr)}
              style={{
                borderRight: `1px solid ${C.b0}`, borderBottom: `1px solid ${C.b0}`,
                cursor: "pointer",
                background: isSel ? C.blueL : feriado ? C.redL : "transparent",
                display: "flex", flexDirection: "column", transition: "background .12s",
              }}
              className="cal-cell"
            >
              <div style={{ padding: "10px 10px 6px", borderBottom: `1px solid ${C.b0}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: feriado ? C.red : C.t2, display: "flex", alignItems: "center", gap: 4 }}>
                    {DIAS_SHORT[i]} {hayConflicto && <span style={{ color: C.red, display: "inline-flex" }}>{I.warn}</span>}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: C.mono, color: isToday ? C.t0 : C.t1, lineHeight: 1.2 }}>{day.d}</div>
                  <div style={{ fontSize: 10, color: feriado ? C.red : C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>
                    {feriado ?? MESES_ES[day.m].slice(0, 3)}
                  </div>
                </div>
                <div className="cell-add" style={{ opacity: 0, transition: "opacity .12s" }}>
                  <button onClick={(e) => { e.stopPropagation(); onAddOnDate(day.fStr); }}
                    style={{ background: C.s1, border: `1px solid ${C.b0}`, color: C.t2, width: 20, height: 20, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M8 2v12M2 8h12"/></svg>
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, padding: "6px 8px", overflowY: "auto" }}>
                {dayEvs.map((ev) => <EventBadge key={ev.id} ev={ev} onClick={() => onSelectDate(day.fStr)} compact={false} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TimelineView: la vista que faltaba ───────────────────────────────────────
// Una obra dura ~18 semanas post-desmolde: la vista mes no alcanza para
// planificar botaduras. Acá cada fila es una unidad operativa (obra) y las
// columnas son semanas: se ve de un vistazo qué se mueve, cuándo, y qué se
// superpone. Los feriados sombrean la columna entera.
const TIMELINE_SEMANAS = 15;

function TimelineView({ year, month, eventos, selDate, onSelectDate, onOpenEvent, feriadosInfo }) {
  // La ventana arranca el lunes de la semana del 1° del mes anterior y cubre
  // TIMELINE_SEMANAS semanas (más de 3 meses de horizonte).
  const inicio = useMemo(() => {
    const base = new Date(year, month - 1, 1);
    const lunes = new Date(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7));
    return dateStr(lunes.getFullYear(), lunes.getMonth(), lunes.getDate());
  }, [year, month]);
  const totalDias = TIMELINE_SEMANAS * 7;
  const fin = addDaysStr(inicio, totalDias - 1);

  const semanas = useMemo(() => (
    Array.from({ length: TIMELINE_SEMANAS }, (_, w) => addDaysStr(inicio, w * 7))
  ), [inicio]);

  const visibles = useMemo(() => (
    eventos.filter((e) => e.fecha >= inicio && e.fecha <= fin)
  ), [eventos, inicio, fin]);

  const obras = useMemo(() => (
    [...new Set(visibles.map((e) => (e.obra || "").trim()).filter(Boolean))].sort()
  ), [visibles]);

  const feriados = useMemo(() => {
    const deEventos = visibles.filter((e) => e.tipo === "feriado").map((e) => e.fecha);
    const deApi = [...feriadosInfo.keys()].filter((f) => f >= inicio && f <= fin);
    return [...new Set([...deEventos, ...deApi])];
  }, [visibles, feriadosInfo, inicio, fin]);

  const filas = useMemo(() => {
    const keys = [...obras];
    if (visibles.some((e) => !(e.obra || "").trim())) keys.push("");
    return keys.map((obra) => [obra, visibles.filter((e) => ((e.obra || "").trim()) === obra)]);
  }, [obras, visibles]);

  const pos = (fecha) => (diffDias(inicio, fecha) / totalDias) * 100;
  const hoyEnRango = HOY >= inicio && HOY <= fin;

  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      <div style={{ minWidth: 940 }}>
        {/* Header de semanas */}
        <div style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr)", borderBottom: `1px solid ${C.b0}`, position: "sticky", top: 0, background: C.panelSolid, zIndex: 2 }}>
          <div style={{ padding: "8px 12px", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.t2, fontWeight: 800, borderRight: `1px solid ${C.b0}`, display: "flex", alignItems: "center" }}>
            Obra · {fmtCorta(inicio)} → {fmtCorta(fin)}
          </div>
          <div style={{ position: "relative", height: 34 }}>
            {semanas.map((sem, w) => (
              <div key={sem} style={{
                position: "absolute", left: `${(w / TIMELINE_SEMANAS) * 100}%`, top: 0, bottom: 0,
                borderLeft: `1px solid ${C.b0}`, padding: "9px 0 0 5px",
                fontSize: 9.5, color: sem <= HOY && addDaysStr(sem, 6) >= HOY ? C.blue : C.t2,
                fontFamily: C.mono, fontWeight: sem <= HOY && addDaysStr(sem, 6) >= HOY ? 800 : 400,
                whiteSpace: "nowrap",
              }}>
                {fmtCorta(sem)}
              </div>
            ))}
          </div>
        </div>

        {/* Filas por obra */}
        {filas.length === 0 ? (
          <div style={{ padding: "40px 20px", color: C.t2, fontSize: 12.5, textAlign: "center" }}>
            No hay movimientos en la ventana {fmtCorta(inicio)} – {fmtCorta(fin)}.
          </div>
        ) : filas.map(([obra, evs]) => (
          <div key={obra || "__general"} style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr)", borderBottom: `1px solid ${C.b0}` }}>
            <div style={{
              padding: "0 12px", borderRight: `1px solid ${C.b0}`, display: "flex", alignItems: "center",
              fontFamily: C.mono, fontSize: 11.5, fontWeight: 800, color: obra ? C.t0 : C.t2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              position: "sticky", left: 0, background: C.panelSolid, zIndex: 1,
            }}>
              {obra || "General"}
            </div>
            <div style={{ position: "relative", height: 42 }}>
              {/* Separadores de semana */}
              {semanas.slice(1).map((sem, w) => (
                <div key={sem} style={{ position: "absolute", left: `${((w + 1) / TIMELINE_SEMANAS) * 100}%`, top: 0, bottom: 0, borderLeft: `1px solid ${C.b0}` }} />
              ))}
              {/* Feriados sombrean la columna */}
              {feriados.map((f) => (
                <div key={f} title={`Feriado ${fmtCorta(f)}`} style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: `${pos(f)}%`, width: `${100 / totalDias}%`,
                  background: C.redL,
                }} />
              ))}
              {/* Línea de hoy */}
              {hoyEnRango && (
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pos(HOY)}%`, borderLeft: `1.5px solid ${C.blue}`, opacity: 0.7 }} />
              )}
              {/* Día seleccionado */}
              {selDate >= inicio && selDate <= fin && (
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pos(selDate)}%`, width: `${100 / totalDias}%`, background: C.blueL }} />
              )}
              {/* Marcadores */}
              {evs.map((ev) => {
                const t = TIPOS[ev.tipo] ?? TIPOS.otro;
                const r = coordResumen(ev);
                return (
                  <button
                    key={ev.id}
                    onClick={() => { onSelectDate(ev.fecha); onOpenEvent(ev); }}
                    title={`${t.label} · ${ev.titulo}${ev.hora ? ` · ${ev.hora}` : ""} · ${fmtLarga(ev.fecha)}${r ? `\nCoordinación ${r.ok}/${r.total}` : ""}`}
                    style={{
                      position: "absolute", top: "50%", transform: "translate(-50%,-50%)",
                      left: `${pos(ev.fecha)}%`,
                      width: 14, height: 14, borderRadius: ev.tipo === "feriado" ? 3 : "50%",
                      background: t.color,
                      border: `2px solid ${r && !r.completo ? C.cyan : "transparent"}`,
                      boxShadow: r && !r.completo ? `0 0 0 2px ${C.cyanL}` : "none",
                      cursor: "pointer", padding: 0,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Leyenda mínima */}
        <div style={{ display: "flex", gap: 14, padding: "8px 12px", color: C.t2, fontSize: 10.5, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${C.cyan}`, background: "transparent" }} /> coordinación incompleta
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, background: C.redL, borderRadius: 2 }} /> feriado
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 1.5, height: 12, background: C.blue }} /> hoy
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── AgendaView: la vista del celular ─────────────────────────────────────────
// En el taller se consulta desde el teléfono: una lista de lo que viene,
// agrupada por día, con targets grandes. Nada de grilla de 7 columnas.
function AgendaView({ eventos, onOpenEvent, onAddOnDate, esAdmin }) {
  const proximos = useMemo(() => (
    eventos
      .filter((e) => e.fecha >= HOY)
      .sort((a, b) => (a.fecha > b.fecha ? 1 : a.fecha < b.fecha ? -1 : ((a.hora || "99") > (b.hora || "99") ? 1 : -1)))
      .slice(0, 60)
  ), [eventos]);

  const grupos = useMemo(() => {
    const fechas = [...new Set(proximos.map((e) => e.fecha))];
    return fechas.map((f) => [f, proximos.filter((e) => e.fecha === f)]);
  }, [proximos]);

  const rotulo = (fecha) => {
    if (fecha === HOY) return "Hoy";
    if (fecha === MANANA) return "Mañana";
    return `${DIAS_SHORT[(dowOf(fecha) + 6) % 7]} ${fmtCorta(fecha)}`;
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 90px" }}>
      {grupos.length === 0 && (
        <div style={{ padding: "40px 20px", color: C.t2, fontSize: 12.5, textAlign: "center" }}>
          No hay movimientos cargados desde hoy en adelante.
        </div>
      )}
      {grupos.map(([fecha, evs]) => {
        const esFeriado = evs.some((e) => e.tipo === "feriado");
        return (
          <div key={fecha} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                color: fecha === HOY ? C.blue : esFeriado ? C.red : C.t1,
              }}>
                {rotulo(fecha)}
              </span>
              <span style={{ flex: 1, height: 1, background: C.b0 }} />
              {esAdmin && (
                <button onClick={() => onAddOnDate(fecha)} aria-label={`Agregar movimiento el ${fmtCorta(fecha)}`}
                  style={{ background: C.s1, border: `1px solid ${C.b0}`, color: C.t2, width: 22, height: 22, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M8 2v12M2 8h12"/></svg>
                </button>
              )}
            </div>
            {evs.map((ev) => {
              const t = TIPOS[ev.tipo] ?? TIPOS.otro;
              return (
                <button key={ev.id} onClick={() => onOpenEvent(ev)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                    padding: "10px 12px", marginBottom: 6, borderRadius: 10, cursor: "pointer",
                    background: C.s0, border: `1px solid ${C.b0}`, borderLeft: `3px solid ${t.color}`,
                    fontFamily: C.sans,
                  }}>
                  <span style={{ width: 40, flexShrink: 0, fontFamily: C.mono, fontSize: 12, color: ev.hora ? C.t0 : C.t3, fontWeight: 700 }}>
                    {ev.hora || "—"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 650, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.titulo}
                    </span>
                    <span style={{ display: "block", fontSize: 10.5, color: t.color, marginTop: 1 }}>
                      {t.label}{ev.obra ? ` · ${ev.obra}` : ""}
                    </span>
                  </span>
                  <CoordDots ev={ev} />
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────
export default function CalendarioScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const isAdmin = hasAdminAccess(profile);
  const role    = profile?.role ?? "invitado";
  const esAdmin = isAdmin || role === "admin" || role === "oficina";

  const [year,  setYear]  = useState(HOY_YEAR);
  const [month, setMonth] = useState(HOY_MONTH);
  const [view,  setView]  = useState(() => (typeof window !== "undefined" && window.innerWidth < 860 ? "agenda" : "mes"));
  const [weekStart, setWeekStart] = useState(() => {
    const { y, m, d } = parseDate(SEMANA_ACTUAL_INICIO);
    return new Date(y, m, d);
  });
  const [eventos,    setEventos]    = useState([]);
  const [selDate,    setSelDate]    = useState(HOY);
  const [detailOpen, setDetailOpen] = useState(false);
  const [modal,      setModal]      = useState(null); // { ev, preset, fecha }
  const [loading,    setLoading]    = useState(true);
  const [dbErr,      setDbErr]      = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [busqueda,   setBusqueda]   = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [buscando,   setBuscando]   = useState(false);
  const [barcos,     setBarcos]     = useState([]);
  const [descartadas, setDescartadas] = useState(() => new Set());
  // Feriados argentinos (nolaborables) y pronóstico (Open-Meteo): datos
  // objetivos del calendario, no compromisos — se muestran, no se cargan
  // como eventos. Si alguna API falla, la pantalla sigue sin ellos.
  const [feriadosApi, setFeriadosApi] = useState(() => new Map());
  const [clima,       setClima]       = useState({});

  // Búsqueda en historial (debounce). El setState vive dentro del timeout:
  // sincrónico en el cuerpo del efecto rompe react-hooks/set-state-in-effect.
  useEffect(() => {
    const term = busqueda.trim();
    if (!term) return;
    const timeoutId = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase
        .from("calendario_eventos")
        .select("*")
        .or(`titulo.ilike.%${term}%,obra.ilike.%${term}%,notas.ilike.%${term}%`)
        .order("fecha", { ascending: false })
        .limit(15);
      setResultadosBusqueda(data || []);
      setBuscando(false);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [busqueda]);

  async function cargar() {
    setLoading(true);
    const from = dateStr(year, month - 1, 1);
    // La ventana del timeline necesita ~4 meses hacia adelante.
    const lastDay = new Date(year, month + 4, 0);
    const to = dateStr(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate());
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

  // Carga inicial y recarga al cambiar el mes. Los setState van DESPUÉS del
  // await: llamarlos sincrónicamente dentro del efecto rompe
  // react-hooks/set-state-in-effect. Por eso acá no se toca `loading`
  // (arranca en true) y la navegación entre meses recarga en silencio.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const from = dateStr(year, month - 1, 1);
      const lastDay = new Date(year, month + 4, 0);
      const to = dateStr(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate());
      const { data, error } = await supabase
        .from("calendario_eventos")
        .select("*")
        .gte("fecha", from)
        .lte("fecha", to)
        .order("fecha")
        .order("hora");
      if (!vivo) return;
      if (error) {
        if (error.code === "42P01") { setDbErr(true); }
        else { console.error("[Calendario]", error.message); }
        setLoading(false);
        return;
      }
      setEventos(data ?? []);
      setLoading(false);
    })();
    return () => { vivo = false; };
  }, [year, month]);

  // Barcos sólo para SUGERIR: jamás se crea un evento solo desde acá.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase
        .from("laminacion_barcos")
        .select("id, modelo, numero, desmolde_estimado, desmolde_real");
      if (!error && vivo) setBarcos(data ?? []);
    })();
    return () => { vivo = false; };
  }, []);

  // Feriados nacionales del año en curso y el siguiente (para diciembre).
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const anios = [HOY_YEAR, HOY_YEAR + 1];
        const listas = await Promise.all(
          anios.map((anio) => fetch(`https://nolaborables.com.ar/api/v2/feriados/${anio}`).then((r) => r.json())),
        );
        if (!vivo) return;
        const mapa = new Map();
        listas.forEach((lista, idx) => {
          (Array.isArray(lista) ? lista : []).forEach((f) => {
            if (typeof f?.dia !== "number" || typeof f?.mes !== "number") return;
            const fecha = `${anios[idx]}-${String(f.mes).padStart(2, "0")}-${String(f.dia).padStart(2, "0")}`;
            mapa.set(fecha, f.motivo || "Feriado");
          });
        });
        setFeriadosApi(mapa);
      } catch { /* sin feriados de API: quedan los cargados a mano */ }
    })();
    return () => { vivo = false; };
  }, []);

  // Pronóstico a 16 días del astillero. Lo importante para producción es el
  // viento (grúa) y la lluvia (traslados).
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${UBICACION.lat}&longitude=${UBICACION.lon}`
          + "&daily=weathercode,temperature_2m_max,temperature_2m_min,windspeed_10m_max,precipitation_probability_max"
          + "&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=16";
        const j = await fetch(url).then((r) => r.json());
        if (!vivo || !j?.daily?.time) return;
        const obj = {};
        j.daily.time.forEach((fecha, i) => {
          obj[fecha] = {
            code: j.daily.weathercode[i],
            tmax: j.daily.temperature_2m_max[i],
            tmin: j.daily.temperature_2m_min[i],
            viento: j.daily.windspeed_10m_max[i],
            lluvia: j.daily.precipitation_probability_max?.[i] ?? null,
          };
        });
        setClima(obj);
      } catch { /* sin clima: la pantalla funciona igual */ }
    })();
    return () => { vivo = false; };
  }, []);

  const eventosFiltrados = useMemo(() => (
    filtroTipo === "todos" ? eventos : eventos.filter((e) => e.tipo === filtroTipo)
  ), [eventos, filtroTipo]);

  const countsByType = useMemo(() => {
    const counts = {};
    eventos.forEach((e) => { counts[e.tipo] = (counts[e.tipo] || 0) + 1; });
    return counts;
  }, [eventos]);

  // Feriados: los nacionales de la API + los cargados a mano (estos últimos
  // pisan al de la API si caen el mismo día, porque pueden ser del astillero).
  const feriadosInfo = useMemo(() => {
    const mapa = new Map(feriadosApi);
    eventos.filter((e) => e.tipo === "feriado").forEach((e) => mapa.set(e.fecha, e.titulo || "Feriado"));
    return mapa;
  }, [feriadosApi, eventos]);

  // ── Conflictos: se avisa sobre lo ya cargado, no se inventa nada ──────────
  const conflictos = useMemo(() => {
    const list = [];
    const fechas = [...new Set(eventos.map((e) => e.fecha))];
    fechas.forEach((fecha) => {
      const evs = eventos.filter((e) => e.fecha === fecha);
      // La grúa es una: dos desmoldes/botaduras el mismo día no se pueden.
      const grua = evs.filter((e) => e.tipo === "desmolde" || e.tipo === "botadura");
      if (grua.length >= 2) {
        list.push({
          key: `grua-${fecha}`, fecha,
          texto: `${grua.length} movimientos de grúa el ${fmtCorta(fecha)} (${grua.map((e) => (TIPOS[e.tipo] ?? TIPOS.otro).label).join(" + ")})`,
        });
      }
      evs.filter((e) => TIPOS_OPERATIVOS.includes(e.tipo)).forEach((e) => {
        if (feriadosInfo.has(fecha)) {
          list.push({ key: `fer-${e.id}`, fecha, texto: `${(TIPOS[e.tipo] ?? TIPOS.otro).label} "${e.titulo}" cae en feriado (${feriadosInfo.get(fecha)})` });
        } else if ([0, 6].includes(dowOf(fecha))) {
          list.push({ key: `finde-${e.id}`, fecha, texto: `${(TIPOS[e.tipo] ?? TIPOS.otro).label} "${e.titulo}" cae en fin de semana` });
        }
        // Viento: la grúa no se pelea con el pronóstico.
        const climaDia = clima[fecha];
        if (climaDia && climaDia.viento >= VIENTO_LIMITE_GRUA) {
          list.push({ key: `viento-${e.id}`, fecha, texto: `Viento ${Math.round(climaDia.viento)} km/h el ${fmtCorta(fecha)}: fuerte para ${(TIPOS[e.tipo] ?? TIPOS.otro).label.toLowerCase()} "${e.titulo}"` });
        }
      });
    });
    // La cuadrilla es una: mismo tipo en días corridos hay que mirarlo dos veces.
    ["desmolde", "botadura", "traslado"].forEach((tipo) => {
      const fs = [...new Set(eventos.filter((e) => e.tipo === tipo).map((e) => e.fecha))].sort();
      for (let i = 1; i < fs.length; i++) {
        if (diffDias(fs[i - 1], fs[i]) === 1) {
          list.push({
            key: `cua-${tipo}-${fs[i]}`, fecha: fs[i],
            texto: `${(TIPOS[tipo] ?? TIPOS.otro).label} en días corridos (${fmtCorta(fs[i - 1])} y ${fmtCorta(fs[i])}): ¿alcanza la cuadrilla?`,
          });
        }
      }
    });
    return list.sort((a, b) => (a.fecha > b.fecha ? 1 : -1));
  }, [eventos, feriadosInfo, clima]);

  const fechasConflicto = useMemo(() => new Set(conflictos.map((c) => c.fecha)), [conflictos]);
  const conflictosDelDia = useMemo(() => conflictos.filter((c) => c.fecha === selDate), [conflictos, selDate]);

  // ── Sugerencias: estimaciones que nadie convirtió en compromiso todavía ────
  const sugerencias = useMemo(() => barcos
    .filter((b) => b.desmolde_estimado && !b.desmolde_real)
    .filter((b) => b.desmolde_estimado >= HOY && diffDias(HOY, b.desmolde_estimado) <= 60)
    .filter((b) => !descartadas.has(b.id))
    .filter((b) => {
      const tag = `${b.modelo}-${b.numero}`.toLowerCase();
      return !eventos.some((e) => e.tipo === "desmolde"
        && `${e.obra || ""} ${e.titulo || ""}`.toLowerCase().includes(tag));
    })
    .sort((a, b) => (a.desmolde_estimado > b.desmolde_estimado ? 1 : -1))
    .slice(0, 3), [barcos, eventos, descartadas]);

  const obrasConocidas = useMemo(() => {
    const deEventos = eventos.map((e) => (e.obra || "").trim()).filter(Boolean);
    const deBarcos = barcos.map((b) => `${b.modelo}-${b.numero}`);
    return [...new Set([...deEventos, ...deBarcos])].sort();
  }, [eventos, barcos]);

  const stats = useMemo(() => ({
    semana: eventos.filter((e) => e.fecha >= SEMANA_ACTUAL_INICIO && e.fecha <= SEMANA_ACTUAL_FIN && e.tipo !== "feriado").length,
    sinCoordinar: eventos.filter((e) => e.fecha >= HOY && TIPOS_OPERATIVOS.includes(e.tipo) && coordDe(e).some((item) => !item.ok)).length,
  }), [eventos]);

  // ── Acciones ────────────────────────────────────────────────────────────────
  async function guardar(form) {
    const esNuevo = !modal?.ev?.id;
    const payload = {
      fecha: form.fecha,
      tipo: form.tipo,
      titulo: form.titulo,
      obra: form.obra.trim() || null,
      hora: form.hora || null,
      notas: form.notas.trim() || null,
      coordinacion: form.coordinacion,
    };
    let error;
    if (esNuevo) ({ error } = await supabase.from("calendario_eventos").insert(payload));
    else ({ error } = await supabase.from("calendario_eventos").update(payload).eq("id", modal.ev.id));
    // La columna coordinacion puede no existir todavía: se reintenta sin
    // ella y el evento se guarda igual. La coordinación es una mejora, no
    // un requisito para que el calendario funcione.
    if (error && (error.code === "42703" || /coordinacion/i.test(error.message || ""))) {
      const { coordinacion: _omitida, ...sinCoord } = payload;
      if (esNuevo) ({ error } = await supabase.from("calendario_eventos").insert(sinCoord));
      else ({ error } = await supabase.from("calendario_eventos").update(sinCoord).eq("id", modal.ev.id));
    }
    if (error) { alert(error.message); return; }
    setModal(null);
    cargar();
  }

  async function eliminar(id) {
    if (!window.confirm("¿Eliminar este movimiento?")) return;
    await supabase.from("calendario_eventos").delete().eq("id", id);
    setModal(null);
    cargar();
  }

  // Confirmar un ítem de coordinación desde el detalle, sin abrir el modal.
  // Optimista: se pinta primero y, si el servidor falla, se recarga la verdad.
  async function toggleCoord(ev, idx) {
    const nueva = coordDe(ev).map((item, i) => (i === idx ? { ...item, ok: !item.ok } : item));
    setEventos((prev) => prev.map((e) => (e.id === ev.id ? { ...e, coordinacion: nueva } : e)));
    const { error } = await supabase.from("calendario_eventos").update({ coordinacion: nueva }).eq("id", ev.id);
    if (error) cargar();
  }

  function prevMonth() { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); }
  function prevWeek()  { setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }); }
  function nextWeek()  { setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }); }
  function goToday() {
    setYear(HOY_YEAR);
    setMonth(HOY_MONTH);
    const { y, m, d } = parseDate(SEMANA_ACTUAL_INICIO);
    setWeekStart(new Date(y, m, d));
    setSelDate(HOY);
  }
  function irAFecha(fecha) {
    const { y, m } = parseDate(fecha);
    setYear(y);
    setMonth(m);
    setSelDate(fecha);
    if (isMobile) setDetailOpen(true);
  }
  function seleccionarFecha(fecha) {
    setSelDate(fecha);
    if (isMobile) setDetailOpen(true);
  }
  function abrirEvento(ev) {
    if (esAdmin) setModal({ ev, fecha: ev.fecha });
    else seleccionarFecha(ev.fecha);
  }

  const weekLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const sm = weekStart.getMonth();
    const em = end.getMonth();
    if (sm === em) return `${weekStart.getDate()}–${end.getDate()} ${MESES_ES[sm]} ${weekStart.getFullYear()}`;
    return `${weekStart.getDate()} ${MESES_ES[sm].slice(0, 3)} – ${end.getDate()} ${MESES_ES[em].slice(0, 3)} ${end.getFullYear()}`;
  }, [weekStart]);

  const btnSt = (active) => ({
    padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: C.sans,
    background: active ? C.s2 : "transparent",
    border: `1px solid ${active ? C.b1 : "transparent"}`,
    color: active ? C.t0 : C.t2, transition: "all .12s",
  });

  const vistaActual = isMobile && view === "semana" ? "agenda" : view;
  const opcionesVista = isMobile
    ? [["agenda", "Agenda"], ["mes", "Mes"], ["timeline", "Timeline"]]
    : [["mes", "Mes"], ["timeline", "Timeline"], ["semana", "Semana"]];

  if (dbErr) return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, display: "flex", fontFamily: C.sans }}>
      <div style={{ flexShrink: 0, width: isMobile ? 0 : undefined, overflow: "visible" }}>
        <Sidebar profile={profile} signOut={signOut} />
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ background: C.redL, border: `1px solid ${C.redB}`, borderRadius: 12, padding: 28, maxWidth: 560 }}>
          <div style={{ fontSize: 13, color: C.red, fontWeight: 600, marginBottom: 10 }}>Falta crear la tabla en Supabase</div>
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
        .cal-cell:hover { background: var(--panel) !important; }
        .cal-cell:hover .cell-add { opacity: 1 !important; }
        .ev-badge:hover { filter: brightness(1.15); }
        .day-ev:hover { background: var(--panel) !important; }
        @media (prefers-reduced-motion: reduce) {
          .cal-cell, .ev-badge, .day-ev { transition: none !important; }
        }
      `}</style>

      <div style={{ flexShrink: 0, width: isMobile ? 0 : undefined, overflow: "visible" }}>
        <Sidebar profile={profile} signOut={signOut} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* TOPBAR */}
        <div style={{ minHeight: 52, flexShrink: 0, borderBottom: `1px solid ${C.b0}`, display: "flex", alignItems: "center", gap: isMobile ? 8 : 14, padding: isMobile ? "6px 12px 6px 52px" : "0 24px", background: C.topbar, backdropFilter: "blur(20px)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={vistaActual === "semana" ? prevWeek : prevMonth} aria-label="Anterior" style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, width: 28, height: 28, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.prev}</button>
            <button onClick={vistaActual === "semana" ? nextWeek : nextMonth} aria-label="Siguiente" style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, width: 28, height: 28, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.next}</button>
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, color: C.t0, fontFamily: C.mono, minWidth: isMobile ? 0 : 200 }}>
            {vistaActual === "semana" ? weekLabel : `${MESES_ES[month]} ${year}`}
          </div>

          <button onClick={goToday} style={{ ...btnSt(false), border: `1px solid ${C.b0}`, color: C.t1 }}>Hoy</button>

          <div style={{ display: "flex", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 7, padding: 2, gap: 2 }}>
            {opcionesVista.map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} style={{ ...btnSt(vistaActual === k), padding: "4px 12px", border: vistaActual === k ? `1px solid ${C.b1}` : "1px solid transparent" }}>{l}</button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {!isMobile && (
            <div style={{ position: "relative", display: "flex", alignItems: "center", zIndex: 4000 }}>
              <svg style={{ position: "absolute", left: 10, color: C.t2 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="Buscar historial..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t0, padding: "6px 12px 6px 30px", borderRadius: 8, fontSize: 13, outline: "none", width: 220, fontFamily: C.sans }} />
              {busqueda.trim() && (
                <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, width: 300, background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 10px 25px var(--shadow-strong, rgba(0,0,0,0.5))", maxHeight: 350, overflowY: "auto" }}>
                  {buscando ? (
                    <div style={{ padding: 12, fontSize: 12, color: C.t2, textAlign: "center" }}>Buscando...</div>
                  ) : resultadosBusqueda.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 12, color: C.t2, textAlign: "center" }}>No se encontraron movimientos</div>
                  ) : (
                    resultadosBusqueda.map((ev) => {
                      const t = TIPOS[ev.tipo] ?? TIPOS.otro;
                      return (
                        <button key={ev.id} onClick={() => { setBusqueda(""); irAFecha(ev.fecha); }}
                          style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${C.b0}`, display: "flex", gap: 8, alignItems: "flex-start", background: "transparent", border: 0, cursor: "pointer", fontFamily: C.sans }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.color, marginTop: 4, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 13, color: C.t0, fontWeight: 500 }}>{ev.titulo}</div>
                            <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{fmtLarga(ev.fecha)} {ev.obra ? `· ${ev.obra}` : ""}</div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
          {esAdmin && (
            <button onClick={() => setModal({ ev: null, fecha: selDate })}
              style={{ padding: "7px 14px", background: C.s1, border: `1px solid ${C.b1}`, color: C.t0, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 6 }}>
              {I.plus} Movimiento
            </button>
          )}
        </div>

        {/* FRANJA DE CONFLICTOS: avisa sobre lo que alguien ya cargó. */}
        {conflictos.length > 0 && (
          <div style={{
            flexShrink: 0, borderBottom: `1px solid ${C.redB}`, background: C.redL,
            padding: "6px 16px", display: "flex", gap: 10, alignItems: "center", overflowX: "auto",
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.red, fontSize: 11, fontWeight: 850, textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>
              {I.warn} {conflictos.length} conflicto{conflictos.length !== 1 ? "s" : ""}
            </span>
            {conflictos.slice(0, 4).map((c) => (
              <button key={c.key} onClick={() => irAFecha(c.fecha)}
                style={{
                  flexShrink: 0, padding: "3px 10px", borderRadius: 999, cursor: "pointer",
                  background: "transparent", border: `1px solid ${C.redB}`, color: C.red,
                  fontSize: 11, fontFamily: C.sans,
                }}>
                {c.texto}
              </button>
            ))}
            {conflictos.length > 4 && (
              <span style={{ color: C.red, fontSize: 11, flexShrink: 0 }}>+{conflictos.length - 4} más</span>
            )}
          </div>
        )}

        {/* FRANJA DE SUGERENCIAS: estimaciones sin compromiso cargado. Nunca
            crea nada sola: "Cargar" abre el alta normal con los datos llenos,
            y la aceptación explícita es lo que lo convierte en compromiso. */}
        {esAdmin && sugerencias.length > 0 && (
          <div style={{
            flexShrink: 0, borderBottom: `1px solid ${C.cyanB}`, background: C.cyanL,
            padding: "6px 16px", display: "flex", gap: 10, alignItems: "center", overflowX: "auto",
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.cyan, fontSize: 11, fontWeight: 850, textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>
              {I.bulb} Sugerencias
            </span>
            {sugerencias.map((b) => (
              <span key={b.id} style={{
                flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 8,
                padding: "3px 6px 3px 10px", borderRadius: 999,
                border: `1px solid ${C.cyanB}`, color: C.cyan, fontSize: 11,
              }}>
                {b.modelo}-{b.numero} figura con desmolde estimado el {fmtCorta(b.desmolde_estimado)} y no hay evento cargado
                <button
                  onClick={() => setModal({ ev: null, preset: { tipo: "desmolde", obra: `${b.modelo}-${b.numero}`, fecha: b.desmolde_estimado } })}
                  style={{ padding: "2px 10px", borderRadius: 999, cursor: "pointer", background: C.cyan, border: "none", color: "var(--bg)", fontSize: 11, fontWeight: 800, fontFamily: C.sans }}>
                  Cargar
                </button>
                <button onClick={() => setDescartadas((prev) => new Set(prev).add(b.id))} aria-label="Descartar sugerencia"
                  style={{ background: "transparent", border: "none", color: C.cyan, cursor: "pointer", display: "flex", padding: 2 }}>
                  {I.close}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* MÉTRICAS + FILTROS */}
        <div style={{
          flexShrink: 0, borderBottom: `1px solid ${C.b0}`, background: C.panelSolid,
          padding: "8px 16px", display: "flex", gap: 10, alignItems: "center", overflowX: "auto",
        }}>
          <MetricPill label="Esta semana" value={stats.semana} color={C.blue} soft={C.blueL} border={C.blueB} />
          <MetricPill label="Por coordinar" value={stats.sinCoordinar} color={stats.sinCoordinar ? C.cyan : C.green} soft={stats.sinCoordinar ? C.cyanL : C.greenL} border={stats.sinCoordinar ? C.cyanB : C.greenB} />
          <MetricPill label="Conflictos" value={conflictos.length} color={conflictos.length ? C.red : C.green} soft={conflictos.length ? C.redL : C.greenL} border={conflictos.length ? C.redB : C.greenB} />
          {clima[HOY] && (
            <span
              title={`${UBICACION.nombre}: ${climaInfo(clima[HOY].code).label} · viento ${Math.round(clima[HOY].viento)} km/h${clima[HOY].lluvia != null ? ` · lluvia ${clima[HOY].lluvia}%` : ""}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px",
                borderRadius: 999, flexShrink: 0, fontFamily: C.sans,
                border: `1px solid ${clima[HOY].viento >= VIENTO_LIMITE_GRUA ? C.redB : C.b0}`,
                background: clima[HOY].viento >= VIENTO_LIMITE_GRUA ? C.redL : "transparent",
                color: clima[HOY].viento >= VIENTO_LIMITE_GRUA ? C.red : C.t1,
              }}
            >
              <ClimaIcon icon={climaInfo(clima[HOY].code).icon} size={14} />
              <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 800 }}>
                {Math.round(clima[HOY].tmax)}°/{Math.round(clima[HOY].tmin)}°
              </span>
              <span style={{ fontSize: 10, fontWeight: 700 }}>
                {Math.round(clima[HOY].viento)} km/h{clima[HOY].viento >= VIENTO_LIMITE_GRUA ? " ⚠" : ""}
              </span>
            </span>
          )}
          <span style={{ width: 1, alignSelf: "stretch", background: C.b0, flexShrink: 0 }} />
          <FilterChip active={filtroTipo === "todos"} label="Todos" count={eventos.length} color={C.t2} soft={C.panel2} border={C.border2} onClick={() => setFiltroTipo("todos")} />
          {Object.entries(TIPOS).map(([k, t]) => (
            <FilterChip
              key={k}
              active={filtroTipo === k}
              label={t.label}
              count={countsByType[k] || 0}
              color={t.color}
              soft={t.soft}
              border={t.border}
              onClick={() => setFiltroTipo(filtroTipo === k ? "todos" : k)}
            />
          ))}
        </div>

        {/* BODY */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {loading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, fontSize: 13 }}>Cargando…</div>
            ) : vistaActual === "mes" ? (
              <MonthView year={year} month={month} eventos={eventosFiltrados} selDate={selDate} onSelectDate={seleccionarFecha} onAddOnDate={(fecha) => setModal({ ev: null, fecha })} fechasConflicto={fechasConflicto} feriadosInfo={feriadosInfo} clima={clima} />
            ) : vistaActual === "semana" ? (
              <WeekView startOfWeek={weekStart} eventos={eventosFiltrados} selDate={selDate} onSelectDate={seleccionarFecha} onAddOnDate={(fecha) => setModal({ ev: null, fecha })} fechasConflicto={fechasConflicto} feriadosInfo={feriadosInfo} />
            ) : vistaActual === "agenda" ? (
              <AgendaView eventos={eventosFiltrados} onOpenEvent={abrirEvento} onAddOnDate={(fecha) => setModal({ ev: null, fecha })} esAdmin={esAdmin} />
            ) : (
              <TimelineView year={year} month={month} eventos={eventosFiltrados} selDate={selDate} onSelectDate={setSelDate} onOpenEvent={abrirEvento} feriadosInfo={feriadosInfo} />
            )}
          </div>

          {!isMobile && (
            <DayDetail
              fecha={selDate}
              eventos={eventosFiltrados}
              conflictos={conflictosDelDia}
              feriadoNombre={feriadosInfo.get(selDate)}
              climaDia={clima[selDate]}
              onAdd={(fecha) => setModal({ ev: null, fecha })}
              onEdit={(ev) => setModal({ ev, fecha: ev.fecha })}
              onToggleCoord={toggleCoord}
              esAdmin={esAdmin}
              isMobile={false}
            />
          )}
        </div>
      </div>

      {isMobile && detailOpen && (
        <DayDetail
          fecha={selDate}
          eventos={eventosFiltrados}
          conflictos={conflictosDelDia}
          feriadoNombre={feriadosInfo.get(selDate)}
          climaDia={clima[selDate]}
          onAdd={(fecha) => { setDetailOpen(false); setModal({ ev: null, fecha }); }}
          onEdit={(ev) => { setDetailOpen(false); setModal({ ev, fecha: ev.fecha }); }}
          onToggleCoord={toggleCoord}
          esAdmin={esAdmin}
          isMobile
          onClose={() => setDetailOpen(false)}
        />
      )}

      {modal && (
        <EventModal
          ev={modal.ev}
          preset={modal.preset}
          fechaDefault={modal.fecha}
          obrasConocidas={obrasConocidas}
          onClose={() => setModal(null)}
          onSave={guardar}
          onDelete={eliminar}
          esAdmin={esAdmin}
        />
      )}
    </div>
  );
}
