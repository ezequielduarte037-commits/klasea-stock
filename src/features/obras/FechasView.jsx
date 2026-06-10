import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";

/**
 * FechasView — Seguimiento de pedidos/eventos en base a la fecha de desmolde.
 *
 * Filas = TODOS los barcos en producción (produccion_obras), agrupados por
 * línea/modelo (token del código: H, 37, 42, 43, 52, 55…).
 *
 * El desmolde (estimado y real) vive en produccion_obras y se edita acá mismo.
 * Se usa el real si está cargado; si no, el estimado.
 *
 * Cada "evento" (madera muebles, motor, grupo, etc.) ocurre a X semanas del
 * desmolde — antes o después. Esos offsets viven en `fechas_offsets`, por línea,
 * con un default '*'. Editables desde la UI.
 *
 *   fecha_evento = desmolde + semanas * 7 días
 */

// ── Eventos rastreables (orden = columnas de la matriz) ──────────────────────
const EVENTOS = [
  { key: "madera_muebles", label: "Madera muebles",    short: "Madera" },
  { key: "teca",           label: "Teca",              short: "Teca" },
  { key: "herreria",       label: "Herrería",          short: "Herrería" },
  { key: "muebles",        label: "Muebles",           short: "Muebles" },
  { key: "mampara",        label: "Mampara ducha",     short: "Mampara" },
  { key: "parabrisas",     label: "Parabrisas",        short: "Parabrisas" },
  { key: "vidrios",        label: "Vidrios Mercoglass", short: "Vidrios" },
  { key: "motor",          label: "Motor",             short: "Motor" },
  { key: "grupo",          label: "Grupo",             short: "Grupo" },
  { key: "tanques",        label: "Tanques",           short: "Tanques" },
  { key: "baterias",       label: "Baterías",          short: "Baterías" },
];

// Orden de columnas reordenable (drag & drop). Se guarda local así cada uno lo
// acomoda a su gusto; aplica a TODOS los barcos (todas las tablas comparten el orden).
const ALL_KEYS = EVENTOS.map((e) => e.key);
const ORDER_LS_KEY = "fechas_col_order_v1";
function loadColOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_LS_KEY) || "[]");
    const valid = Array.isArray(saved) ? saved.filter((k) => ALL_KEYS.includes(k)) : [];
    const missing = ALL_KEYS.filter((k) => !valid.includes(k)); // eventos nuevos se agregan al final
    return [...valid, ...missing];
  } catch { return [...ALL_KEYS]; }
}

// ── Helpers de fecha ─────────────────────────────────────────────────────────
const MS_DIA = 86400000;
const iso = (s) => (s ? String(s).slice(0, 10) : "");
function parseISO(s) {
  if (!s) return null;
  const d = new Date(iso(s) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}
function addSemanas(date, semanas) {
  if (!date) return null;
  return new Date(date.getTime() + Number(semanas) * 7 * MS_DIA);
}
function diasHasta(date) {
  if (!date) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - hoy.getTime()) / MS_DIA);
}
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtFecha(date) {
  if (!date) return "—";
  return `${String(date.getDate()).padStart(2, "0")} ${MESES[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;
}

// Token de línea desde el código: "H175"→"H", "52-21"→"52", "K52-30"→"52"
function lineToken(codigo) {
  let s = String(codigo ?? "").trim().toUpperCase().replace(/^K/, "");
  if (!s) return "—";
  if (/^[A-Z]/.test(s)) { const m = s.match(/^[A-Z]+/); return m ? m[0] : s; }
  return s.split(/[-\s/]/)[0] || s;
}
function normModelo(m) { return String(m ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^K/, ""); }

function tokenSort(a, b) {
  const na = /^\d/.test(a), nb = /^\d/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (!na && !nb) return a.localeCompare(b);
  return na ? 1 : -1; // letras (H) antes que números
}

function colorPorDias(dias) {
  if (dias === null) return { fg: C.t3, bg: "transparent", label: "" };
  if (dias < 0)   return { fg: C.t3,    bg: "transparent",           label: "pasó" };
  if (dias < 14)  return { fg: C.red,   bg: "rgba(239,68,68,0.12)",  label: "ya" };
  if (dias < 30)  return { fg: C.amber, bg: "rgba(245,158,11,0.10)", label: "pronto" };
  return { fg: C.green, bg: "transparent", label: "" };
}

export default function FechasView({ obras = [], lineas = [], esGestion = false, onUpdateObra }) {
  const { isMobile } = useResponsive();
  const [offsets, setOffsets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editor, setEditor] = useState(false);
  const [buffer, setBuffer] = useState({});          // edición de offsets
  const [desmoldes, setDesmoldes] = useState({});     // overlay optimista: id -> {desmolde_estimado, desmolde_real}
  const [order, setOrder] = useState(loadColOrder);   // orden de columnas (drag)
  const [dragKey, setDragKey] = useState(null);       // columna que se está arrastrando
  const savingRef = useRef(false);

  // lista de eventos en el orden elegido por el usuario
  const eventos = useMemo(
    () => order.map((k) => EVENTOS.find((e) => e.key === k)).filter(Boolean), [order]);

  function moveCol(fromKey, toKey) {
    if (!fromKey || fromKey === toKey) return;
    setOrder((prev) => {
      const arr = prev.filter((k) => k !== fromKey);
      const idx = arr.indexOf(toKey);
      arr.splice(idx < 0 ? arr.length : idx, 0, fromKey);
      try { localStorage.setItem(ORDER_LS_KEY, JSON.stringify(arr)); } catch { /* noop */ }
      return arr;
    });
  }
  function resetCols() {
    try { localStorage.removeItem(ORDER_LS_KEY); } catch { /* noop */ }
    setOrder([...ALL_KEYS]);
  }

  async function cargarOffsets() {
    const { data, error } = await supabase.from("fechas_offsets").select("*");
    if (error) setErr("Error cargando offsets: " + error.message); else setOffsets(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    cargarOffsets();
    const ch = supabase.channel("rt-fechas")
      .on("postgres_changes", { event: "*", schema: "public", table: "fechas_offsets" }, async () => {
        if (savingRef.current) return;
        const { data } = await supabase.from("fechas_offsets").select("*");
        setOffsets(data ?? []);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // Cuando llega data fresca del padre, descarto el overlay (ya está persistido)
  useEffect(() => { setDesmoldes({}); }, [obras]);

  const colorLinea = useMemo(() => {
    const m = {}; lineas.forEach(l => { m[l.id] = l.color; }); return m;
  }, [lineas]);

  const filas = useMemo(() => obras
    .filter(o => o.estado !== "terminada")
    .map(o => ({
      id: o.id,
      codigo: o.codigo || "—",
      token: lineToken(o.codigo),
      color: colorLinea[o.linea_id] || C.t2,
      desmolde_estimado: o.desmolde_estimado || null,
      desmolde_real: o.desmolde_real || null,
    })), [obras, colorLinea]);

  // aplica overlay optimista y resuelve desmolde efectivo
  function withDesmolde(f) {
    const ov = desmoldes[f.id] || {};
    const est = "desmolde_estimado" in ov ? ov.desmolde_estimado : f.desmolde_estimado;
    const real = "desmolde_real" in ov ? ov.desmolde_real : f.desmolde_real;
    return { est, real, efectivo: real || est || null };
  }

  const grupos = useMemo(() => {
    const map = {};
    filas.forEach(f => { (map[f.token] ??= []).push(f); });
    Object.values(map).forEach(arr => arr.sort((a, b) =>
      (a.desmolde_real || a.desmolde_estimado || "9999").localeCompare(b.desmolde_real || b.desmolde_estimado || "9999")));
    return Object.entries(map).sort((a, b) => tokenSort(a[0], b[0]));
  }, [filas]);

  const tokens = useMemo(() => grupos.map(([t]) => t), [grupos]);

  // ── Offsets ──────────────────────────────────────────────────────────────────
  function getOffset(eventoKey, token) {
    const exact = offsets.find(o => o.evento_key === eventoKey && o.modelo === token);
    if (exact) return Number(exact.semanas);
    const norm = offsets.find(o => o.evento_key === eventoKey && o.modelo !== "*" && normModelo(o.modelo) === normModelo(token));
    if (norm) return Number(norm.semanas);
    const def = offsets.find(o => o.evento_key === eventoKey && o.modelo === "*");
    return def ? Number(def.semanas) : null;
  }
  function getExactOffset(eventoKey, modelo) {
    const r = offsets.find(o => o.evento_key === eventoKey && o.modelo === modelo);
    return r ? String(r.semanas) : "";
  }
  async function commitOffset(eventoKey, modelo, raw) {
    const trimmed = String(raw ?? "").trim().replace(",", ".");
    savingRef.current = true;
    try {
      if (trimmed === "") {
        await supabase.from("fechas_offsets").delete().eq("evento_key", eventoKey).eq("modelo", modelo);
        setOffsets(prev => prev.filter(o => !(o.evento_key === eventoKey && o.modelo === modelo)));
        return;
      }
      const semanas = Number(trimmed);
      if (Number.isNaN(semanas)) return;
      await supabase.from("fechas_offsets").upsert(
        { evento_key: eventoKey, modelo, semanas, updated_at: new Date().toISOString() },
        { onConflict: "evento_key,modelo" });
      setOffsets(prev => [...prev.filter(o => !(o.evento_key === eventoKey && o.modelo === modelo)),
        { evento_key: eventoKey, modelo, semanas }]);
    } catch (e) { setErr("Error guardando: " + (e?.message || e)); }
    finally { setTimeout(() => { savingRef.current = false; }, 400); }
  }

  // ── Desmolde (editable en produccion_obras) ──────────────────────────────────
  function setDesmolde(obraId, field, value) {
    const val = value || null;
    setDesmoldes(prev => ({ ...prev, [obraId]: { ...prev[obraId], [field]: val } }));
    if (onUpdateObra) onUpdateObra(obraId, { [field]: val });
    else supabase.from("produccion_obras").update({ [field]: val }).eq("id", obraId);
  }

  // ── Estilos ──────────────────────────────────────────────────────────────────
  const th = {
    padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.t2,
    textTransform: "uppercase", letterSpacing: 0.6, borderBottom: `1px solid ${C.b1}`,
    whiteSpace: "nowrap", position: "sticky", top: 0, background: C.s1, zIndex: 1,
  };
  const td = {
    padding: "6px 10px", fontSize: 12.5, color: C.t1, borderBottom: `1px solid ${C.b0}`,
    whiteSpace: "nowrap", fontFamily: C.mono,
  };
  const dateInput = {
    width: 124, padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.b1}`,
    background: "var(--date-input-bg, var(--bg))", color: C.t0, fontFamily: C.mono, fontSize: 12, colorScheme: "var(--input-color-scheme, dark)",
  };

  const rootStyle = { fontFamily: C.sans, flex: 1, minHeight: 0, overflowY: "auto",
    padding: isMobile ? 12 : "16px 18px" };

  if (loading) return <div style={rootStyle}><div style={{ color: C.t2 }}>Cargando fechas…</div></div>;

  return (
    <div style={rootStyle}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.t0 }}>Fechas</div>
          <div style={{ fontSize: 12, color: C.t2, marginTop: 2 }}>
            Cuándo pedir o hacer cada cosa, según el desmolde de cada barco. Se usa el real si está cargado, si no el estimado.
            <span style={{ color: C.t3 }}> · Arrastrá los encabezados (⠿) para reordenar las columnas.</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {order.join() !== ALL_KEYS.join() && (
          <button type="button" onClick={resetCols} title="Restaurar el orden original de columnas" style={{
            padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
            fontFamily: C.sans, border: `1px solid ${C.b1}`, background: C.s1, color: C.t2 }}>
            ↺ Orden original
          </button>
        )}
        {esGestion && (
          <button type="button" onClick={() => setEditor(e => !e)} style={{
            padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
            fontFamily: C.sans, border: `1px solid ${editor ? C.blue : C.b1}`,
            background: editor ? "rgba(59,130,246,0.12)" : C.s1, color: editor ? C.blue : C.t1 }}>
            {editor ? "Cerrar configuración" : "Configurar tiempos"}
          </button>
        )}
      </div>

      {err && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.12)",
          border: `1px solid ${C.red}`, color: C.red, fontSize: 12.5, marginBottom: 12 }}>{err}</div>
      )}

      {/* ── Editor de offsets ─────────────────────────────────────── */}
      {editor && esGestion && (
        <div style={{ border: `1px solid ${C.b1}`, borderRadius: 12, background: C.s0, padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.t0, marginBottom: 4 }}>
            Tiempos por evento (en semanas respecto al desmolde)
          </div>
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 12 }}>
            Valor <b style={{ color: C.red }}>negativo = antes</b> del desmolde ·
            <b style={{ color: C.green }}> positivo = después</b>. La columna
            <b style={{ color: C.t1 }}> Todas</b> aplica por defecto; una línea puntual la pisa.
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={{ ...th, left: 0, zIndex: 2 }}>Evento</th>
                  <th style={{ ...th, textAlign: "center" }}>Todas</th>
                  {tokens.map(t => <th key={t} style={{ ...th, textAlign: "center" }}>{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {eventos.map(ev => (
                  <tr key={ev.key}>
                    <td style={{ ...td, fontFamily: C.sans, color: C.t0, fontWeight: 600,
                      position: "sticky", left: 0, background: C.s0 }}>{ev.label}</td>
                    {["*", ...tokens].map(modelo => {
                      const bk = `${ev.key}|${modelo}`;
                      const val = bk in buffer ? buffer[bk] : getExactOffset(ev.key, modelo);
                      return (
                        <td key={modelo} style={{ ...td, textAlign: "center", padding: "4px 6px" }}>
                          <input
                            type="number" step="0.5" inputMode="numeric" value={val}
                            placeholder={modelo === "*" ? "—" : ""}
                            onChange={e => setBuffer(b => ({ ...b, [bk]: e.target.value }))}
                            onBlur={e => { commitOffset(ev.key, modelo, e.target.value);
                              setBuffer(b => { const n = { ...b }; delete n[bk]; return n; }); }}
                            style={{ width: 56, textAlign: "center", padding: "5px 4px", borderRadius: 6,
                              border: `1px solid ${C.b1}`, background: C.bg, color: C.t0, fontFamily: C.mono, fontSize: 12.5 }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Leyenda ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12, fontSize: 11.5, color: C.t2 }}>
        <Legend color={C.red}   text="Ya / en menos de 14 días" />
        <Legend color={C.amber} text="Pronto (menos de 30 días)" />
        <Legend color={C.green} text="Con tiempo" />
        <Legend color={C.t3}    text="Ya pasó" />
      </div>

      {filas.length === 0 && (
        <div style={{ padding: 30, color: C.t2 }}>No hay barcos en producción cargados.</div>
      )}

      {/* ── Matriz por línea ──────────────────────────────────────── */}
      {grupos.map(([token, lista]) => (
        <div key={token} style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: lista[0]?.color || C.t2 }} />
            <span style={{ fontSize: 13.5, fontWeight: 800, color: C.t0 }}>Línea {token}</span>
            <span style={{ fontSize: 11.5, color: C.t2 }}>{lista.length} barco{lista.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ overflowX: "auto", border: `1px solid ${C.b1}`, borderRadius: 12 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 920 }}>
              <thead>
                <tr>
                  <th style={{ ...th, left: 0, zIndex: 2, minWidth: 78 }}>Barco</th>
                  <th style={th}>Desmolde est.</th>
                  <th style={th}>Desmolde real</th>
                  {eventos.map(ev => (
                    <th key={ev.key}
                      draggable
                      onDragStart={() => setDragKey(ev.key)}
                      onDragEnd={() => setDragKey(null)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); moveCol(dragKey, ev.key); setDragKey(null); }}
                      title="Arrastrá para reordenar la columna"
                      style={{ ...th, textAlign: "center", cursor: "grab", userSelect: "none",
                        opacity: dragKey === ev.key ? 0.4 : 1,
                        background: dragKey && dragKey !== ev.key ? "rgba(34,211,238,0.10)" : th.background }}>
                      <span style={{ color: C.t3, marginRight: 3, fontSize: 9, letterSpacing: -1 }}>⠿</span>
                      {isMobile ? ev.short : ev.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(f => {
                  const { est, real, efectivo } = withDesmolde(f);
                  const desm = parseISO(efectivo);
                  return (
                    <tr key={f.id}>
                      <td style={{ ...td, fontWeight: 700, color: C.t0, position: "sticky", left: 0, background: C.bg }}>{f.codigo}</td>
                      {/* Desmolde estimado */}
                      <td style={td}>
                        {esGestion
                          ? <input type="date" value={iso(est)} onChange={e => setDesmolde(f.id, "desmolde_estimado", e.target.value)} style={dateInput} />
                          : <span style={{ color: est ? C.t1 : C.t3 }}>{fmtFecha(parseISO(est))}</span>}
                      </td>
                      {/* Desmolde real */}
                      <td style={td}>
                        {esGestion
                          ? <input type="date" value={iso(real)} onChange={e => setDesmolde(f.id, "desmolde_real", e.target.value)}
                              style={{ ...dateInput, borderColor: real ? "rgba(16,185,129,0.4)" : C.b1 }} />
                          : <span style={{ color: real ? C.green : C.t3 }}>{fmtFecha(parseISO(real))}</span>}
                      </td>
                      {eventos.map(ev => {
                        const off = getOffset(ev.key, f.token);
                        if (off === null || !desm) {
                          return <td key={ev.key} style={{ ...td, textAlign: "center", color: C.t3 }}>—</td>;
                        }
                        const fecha = addSemanas(desm, off);
                        const dias = diasHasta(fecha);
                        const col = colorPorDias(dias);
                        return (
                          <td key={ev.key} style={{ ...td, textAlign: "center", color: col.fg, background: col.bg,
                            fontWeight: dias !== null && dias >= 0 && dias < 30 ? 700 : 500 }}
                            title={`${ev.label}: ${off > 0 ? "+" : ""}${off} sem · ${col.label || ""}`}>
                            {fmtFecha(fecha)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function Legend({ color, text }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}80` }} />
      {text}
    </span>
  );
}
