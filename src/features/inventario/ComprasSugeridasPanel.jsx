import { C } from "@/theme";
/**
 * ComprasSugeridasPanel.jsx
 *
 * Dos modos de cálculo:
 *
 * 1. "Por rotación"  — basado en consumo histórico real del galpón.
 *                      Calcula egreso promedio semanal y sugiere comprar para cubrir N semanas.
 *                      Funciona aunque las obras no tengan materiales configurados.
 *
 * 2. "Por obras"     — réplica de la hoja "General" del excel.
 *                      Mira laminacion_obra_materiales vs egresos reales por obra activa.
 *                      Requiere que las obras tengan los materiales configurados.
 *
 * PROPS:
 *   materiales       — array de laminacion_materiales
 *   movimientos      — array de laminacion_movimientos (con created_at)
 *   stockPorMaterial — { [material_id]: cantidad }
 *   onCrearPedido    — fn(materialId, cantidad, obs)
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T00:00:00") : new Date(d);
  return dt.toLocaleDateString("es-AR");
}

// ── Paleta ───────────────────────────────────────────────────────
const S = {
  section: {
    border: `1px solid ${C.b0}`,
    borderRadius: 14,
    background: C.card,
    marginBottom: 16,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: `1px solid ${C.b0}`,
    cursor: "pointer",
    userSelect: "none",
  },
  body: { padding: "0 0 12px" },
  th: {
    textAlign: "left",
    fontSize: 10,
    color: C.t2,
    padding: "10px 12px",
    textTransform: "uppercase",
    letterSpacing: 1.3,
    fontFamily: C.sans,
  },
  td: {
    padding: "9px 12px",
    borderBottom: `1px solid rgba(255,255,255,0.03)`,
    verticalAlign: "middle",
    fontSize: 13,
    fontFamily: C.sans,
  },
  badge: (color) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 700,
    background: color + "22",
    color: color,
    border: `1px solid ${color}44`,
    fontFamily: C.sans,
  }),
  btnSmall: (color, fill = false) => ({
    border: `1px solid ${color}44`,
    background: fill ? color : `${color}18`,
    color: fill ? "#fff" : color,
    padding: "4px 10px",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
    fontFamily: C.sans,
    whiteSpace: "nowrap",
  }),
  modeBtn: (active) => ({
    border: `1px solid ${active ? C.blue + "88" : "transparent"}`,
    background: active ? `${C.blue}22` : "transparent",
    color: active ? C.blue : C.t2,
    padding: "5px 14px",
    borderRadius: 7,
    cursor: "pointer",
    fontWeight: active ? 700 : 400,
    fontSize: 13,
    fontFamily: C.sans,
    transition: "all .15s",
  }),
  input: {
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${C.b0}`,
    color: C.t0,
    padding: "7px 10px",
    borderRadius: 7,
    fontSize: 13,
    fontFamily: C.sans,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  progressBar: {
    height: 4,
    borderRadius: 99,
    background: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    marginTop: 4,
    position: "relative",
    width: "100%",
  },
};

// ── Helpers ──────────────────────────────────────────────────────
function urgenciaRotacion(semanasDeStock, buffer, sinHistorial) {
  if (sinHistorial)                   return { label: "Sin historial", color: C.t2 };
  if (semanasDeStock === 0)           return { label: "Sin stock",  color: C.red };
  if (semanasDeStock < 1)             return { label: "Crítico",    color: C.red };
  if (semanasDeStock < buffer * 0.5)  return { label: "Urgente",    color: C.orange };
  if (semanasDeStock < buffer)        return { label: "Atención",   color: C.amber };
  return                                     { label: "OK",         color: C.green };
}

function SemanasBar({ semanas, buffer }) {
  const pct   = Math.min(1, semanas / (buffer * 1.5));
  const color = semanas < 1 ? C.red : semanas < buffer * 0.5 ? C.orange : semanas < buffer ? C.amber : C.green;
  return (
    <div style={{ width: 80 }}>
      <div style={S.progressBar}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${pct * 100}%`, background: color, borderRadius: 99, transition: "width .4s" }} />
      </div>
      <div style={{ fontSize: 11, color, fontFamily: C.mono, marginTop: 3 }}>
        {semanas === Infinity ? "∞" : semanas.toFixed(1)} sem
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// FILA — Modo "Por obras" (lógica original)
// ══════════════════════════════════════════════════════════════════
function FilaSugerida({ row, onCrearPedido }) {
  const [expanded, setExpanded] = useState(false);
  const [obs, setObs]           = useState("");
  const [editCant, setEditCant] = useState(String(row.aComprar));

  useEffect(() => { setEditCant(String(row.aComprar)); }, [row.aComprar]);

  const urgencia = row.aComprar > row.faltaUsarTotal * 0.7 ? "alta" : row.aComprar > 0 ? "media" : "ok";
  const urgColor = urgencia === "alta" ? C.red : urgencia === "media" ? C.amber : C.green;

  return (
    <>
      <tr style={{ cursor: "pointer", borderBottom: `1px solid rgba(255,255,255,0.03)` }}
        onClick={() => setExpanded(e => !e)} className="lam-row">
        <td style={S.td}>
          <div style={{ fontWeight: 600, color: C.t0 }}>{row.mat.nombre}</div>
          <div style={{ fontSize: 11, color: C.t2 }}>{row.mat.unidad ?? "unidad"}</div>
        </td>
        <td style={{ ...S.td, fontFamily: C.mono, fontWeight: 700, color: urgColor, fontSize: 15 }}>
          {row.aComprar}
        </td>
        <td style={{ ...S.td, fontFamily: C.mono, color: row.stockActual < 5 ? C.red : C.t1 }}>
          {row.stockActual}
        </td>
        <td style={{ ...S.td, fontFamily: C.mono, color: C.t1 }}>{row.faltaUsarTotal}</td>
        <td style={S.td}>
          <span style={S.badge(urgColor)}>
            {urgencia === "alta" ? "Alta" : urgencia === "media" ? "Media" : "OK"}
          </span>
        </td>
        <td style={{ ...S.td, color: C.t2, fontSize: 12 }}>
          {row.detalle.length} {row.detalle.length === 1 ? "obra" : "obras"}
          <span style={{ marginLeft: 6 }}>{expanded ? "▲" : "▼"}</span>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={6} style={{ padding: "0 12px 12px", background: "rgba(255,255,255,0.015)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 8, marginTop: 10, marginBottom: 14 }}>
              {row.detalle.map(d => {
                const pct = d.necesario > 0 ? d.egresado / d.necesario : 0;
                return (
                  <div key={d.obra} style={{ border: `1px solid ${C.b0}`, borderRadius: 9, padding: "10px 12px", background: "rgba(255,255,255,0.02)" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.t0, marginBottom: 4 }}>{d.obra}</div>
                    <div style={{ fontSize: 12, color: C.t2 }}>
                      Necesario: <span style={{ color: C.t1, fontFamily: C.mono }}>{d.necesario}</span>
                      {" · "}Egresado: <span style={{ color: C.t1, fontFamily: C.mono }}>{d.egresado}</span>
                      {" · "}Falta: <span style={{ color: C.amber, fontFamily: C.mono }}>{d.faltaUsar}</span>
                    </div>
                    <div style={S.progressBar}>
                      <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(100, pct * 100)}%`, background: pct >= 1 ? C.green : C.blue, borderRadius: 99, transition: "width .4s" }} />
                    </div>
                    {d.desmolde && <div style={{ fontSize: 11, color: C.t2, marginTop: 5 }}>Desmolde est.: {fmtDate(d.desmolde)}</div>}
                  </div>
                );
              })}
            </div>
            {onCrearPedido && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: `1px solid ${C.b0}`, paddingTop: 10 }}>
                <span style={{ fontSize: 12, color: C.t2, marginRight: 4 }}>Crear pedido:</span>
                <input style={{ ...S.input, width: 90 }} type="number" step="0.01" min="1"
                  value={editCant} onChange={e => setEditCant(e.target.value)} placeholder="Cant." />
                <input style={{ ...S.input, flex: 1, minWidth: 180 }}
                  placeholder="Observaciones…" value={obs} onChange={e => setObs(e.target.value)} />
                <button style={{ ...S.btnSmall(C.blue, true), padding: "7px 16px", fontSize: 13 }}
                  onClick={() => {
                    const cant = num(editCant); if (!cant) return;
                    onCrearPedido(row.mat.id, cant, obs || `Compra sugerida (obras) - ${row.detalle.map(d => d.obra).join(", ")}`);
                    setExpanded(false);
                  }}>
                  + Crear pedido
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
// FILA — Modo "Por rotación"
// ══════════════════════════════════════════════════════════════════
function FilaRotacion({ row, buffer, onCrearPedido }) {
  const [expanded, setExpanded] = useState(false);
  const [obs, setObs]           = useState("");
  const [editCant, setEditCant] = useState(String(row.aComprar));

  useEffect(() => { setEditCant(String(row.aComprar)); }, [row.aComprar]);

  const { label, color } = urgenciaRotacion(row.semanasDeStock, buffer, row.sinHistorial);

  return (
    <>
      <tr style={{ cursor: "pointer", borderBottom: `1px solid rgba(255,255,255,0.03)` }}
        onClick={() => setExpanded(e => !e)} className="lam-row">
        <td style={S.td}>
          <div style={{ fontWeight: 600, color: C.t0 }}>{row.mat.nombre}</div>
          <div style={{ fontSize: 11, color: C.t2 }}>{row.mat.unidad ?? "unidad"}</div>
        </td>
        <td style={{ ...S.td, fontFamily: C.mono, fontWeight: 700, color, fontSize: 15 }}>
          {row.sinHistorial ? <span style={{ fontSize: 12, color: C.t2 }}>—</span> : row.aComprar}
        </td>
        <td style={{ ...S.td, fontFamily: C.mono, color: row.stockActual <= 0 ? C.red : row.stockActual < 5 ? C.orange : C.t1 }}>
          {row.stockActual}
        </td>
        <td style={{ ...S.td, fontFamily: C.mono, color: row.sinHistorial ? C.t2 : C.t1 }}>
          {row.sinHistorial ? "—" : row.egresoSemanal.toFixed(1)}
        </td>
        <td style={S.td}>
          {row.sinHistorial
            ? <span style={{ fontSize: 12, color: C.t2, fontFamily: C.sans }}>—</span>
            : <SemanasBar semanas={row.semanasDeStock} buffer={buffer} />}
        </td>
        <td style={S.td}>
          <span style={S.badge(color)}>{label}</span>
        </td>
        <td style={{ ...S.td, color: C.t2, fontSize: 12, textAlign: "center" }}>
          {expanded ? "▲" : "▼"}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} style={{ padding: "0 12px 14px", background: "rgba(255,255,255,0.015)" }}>

            {/* Historial semanal */}
            <div style={{ marginTop: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.t2, letterSpacing: 1.1, textTransform: "uppercase", fontFamily: C.sans, marginBottom: 8 }}>
                Consumo semanal histórico
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {row.porSemana.slice(0, 12).map(s => (
                  <div key={s.semana} style={{ border: `1px solid ${C.b0}`, borderRadius: 7, padding: "6px 10px", background: "rgba(255,255,255,0.02)", minWidth: 80 }}>
                    <div style={{ fontSize: 11, color: C.t2, marginBottom: 3 }}>{s.semanaLabel}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 14, color: s.cantidad > 0 ? C.t0 : C.t2, fontWeight: s.cantidad > 0 ? 700 : 400 }}>
                      {s.cantidad > 0 ? `−${s.cantidad}` : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resumen del cálculo */}
            <div style={{ fontSize: 12, color: C.t2, fontFamily: C.sans, marginBottom: 12, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: `1px solid ${C.b0}`, display: "flex", gap: 20, flexWrap: "wrap" }}>
              <span><span style={{ color: C.t1 }}>Promedio/sem:</span> <span style={{ fontFamily: C.mono, color: C.t0 }}>{row.egresoSemanal.toFixed(2)}</span></span>
              <span><span style={{ color: C.t1 }}>Stock actual:</span> <span style={{ fontFamily: C.mono, color: row.stockActual <= 0 ? C.red : C.t0 }}>{row.stockActual}</span></span>
              <span><span style={{ color: C.t1 }}>Buffer:</span> <span style={{ fontFamily: C.mono, color: C.blue }}>{buffer} sem</span></span>
              <span><span style={{ color: C.t1 }}>Objetivo:</span> <span style={{ fontFamily: C.mono, color: C.t0 }}>{Math.ceil(row.egresoSemanal * buffer)}</span></span>
              <span><span style={{ color: C.t1 }}>Sugerido comprar:</span> <span style={{ fontFamily: C.mono, color, fontWeight: 700 }}>{row.aComprar}</span></span>
            </div>

            {/* Crear pedido */}
            {onCrearPedido && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: `1px solid ${C.b0}`, paddingTop: 10 }}>
                <span style={{ fontSize: 12, color: C.t2, marginRight: 4 }}>Crear pedido:</span>
                <input style={{ ...S.input, width: 90 }} type="number" step="1" min="1"
                  value={editCant} onChange={e => setEditCant(e.target.value)} placeholder="Cant." />
                <input style={{ ...S.input, flex: 1, minWidth: 180 }}
                  placeholder="Observaciones (proveedor, urgencia…)" value={obs} onChange={e => setObs(e.target.value)} />
                <button style={{ ...S.btnSmall(C.blue, true), padding: "7px 16px", fontSize: 13 }}
                  onClick={() => {
                    const cant = num(editCant); if (!cant) return;
                    onCrearPedido(row.mat.id, cant, obs || `Reposición por rotación — ${row.egresoSemanal.toFixed(1)} u/sem, ${buffer} sem buffer`);
                    setExpanded(false);
                  }}>
                  + Crear pedido
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════
export default function ComprasSugeridasPanel({ materiales, movimientos, stockPorMaterial, onCrearPedido }) {
  const [modo, setModo]                         = useState("rotacion"); // "rotacion" | "obras"
  const [open, setOpen]                         = useState(true);
  const [soloConNecesidad, setSoloConNecesidad] = useState(true);
  const [qFiltro, setQFiltro]                   = useState("");
  const [bufferSemanas, setBufferSemanas]       = useState(3);

  // ── Datos modo obras ──────────────────────────────────────────
  const [obras, setObras]       = useState([]);
  const [obraMats, setObraMats] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: o }, { data: om }] = await Promise.all([
        supabase.from("laminacion_obras").select("id, nombre, estado, fecha_desmolde_estimada").eq("estado", "activa"),
        supabase.from("laminacion_obra_materiales").select("obra_id, material_id, cantidad_necesaria"),
      ]);
      setObras(o ?? []);
      setObraMats(om ?? []);
      setLoading(false);
    }
    load();
    const ch = supabase.channel("cs-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_obras" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_obra_materiales" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ── Cálculo modo obras ────────────────────────────────────────
  const comprasPorObras = useMemo(() => {
    if (!materiales.length || !obras.length) return [];
    return materiales.map(mat => {
      const stockActual = num(stockPorMaterial?.[mat.id] ?? 0);
      let faltaUsarTotal = 0;
      const detalle = [];
      obras.forEach(obra => {
        const config   = obraMats.find(om => om.obra_id === obra.id && om.material_id === mat.id);
        const necesario = num(config?.cantidad_necesaria ?? 0);
        if (necesario === 0) return;
        const egresado = movimientos
          .filter(m => m.material_id === mat.id && m.tipo === "egreso" &&
            (m.obra ?? "").trim().toLowerCase() === obra.nombre.trim().toLowerCase())
          .reduce((s, m) => s + num(m.cantidad), 0);
        const faltaUsar = Math.max(0, necesario - egresado);
        if (faltaUsar > 0 || egresado > 0 || necesario > 0) {
          faltaUsarTotal += faltaUsar;
          detalle.push({ obra: obra.nombre, necesario, egresado, faltaUsar, desmolde: obra.fecha_desmolde_estimada ?? null });
        }
      });
      return { mat, faltaUsarTotal, stockActual, aComprar: Math.max(0, faltaUsarTotal - stockActual), detalle };
    });
  }, [materiales, obras, obraMats, movimientos, stockPorMaterial]);

  // ── Cálculo modo rotación ─────────────────────────────────────
  const comprasPorRotacion = useMemo(() => {
    if (!materiales.length) return [];

    // Rango de observación: desde el movimiento más antiguo hasta hoy
    const ahora      = Date.now();
    const fechas     = movimientos.map(m => new Date(m.created_at).getTime()).filter(Boolean);
    const primerMov  = fechas.length ? Math.min(...fechas) : ahora;
    const semanasObservadas = Math.max(1, (ahora - primerMov) / (7 * 24 * 3600 * 1000));

    return materiales.map(mat => {
      const stockActual = num(stockPorMaterial?.[mat.id] ?? 0);
      const egresos     = movimientos.filter(m => m.material_id === mat.id && m.tipo === "egreso");
      const egresoTotal = egresos.reduce((s, m) => s + num(m.cantidad), 0);

      // Si no hay historial, igual lo incluimos con sinHistorial=true
      const sinHistorial = egresoTotal === 0;

      // Agrupar por semana (lunes como inicio)
      const porSemanaMap = {};
      egresos.forEach(m => {
        const d = new Date(m.created_at);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // retroceder al lunes
        const key = d.toISOString().slice(0, 10);
        porSemanaMap[key] = (porSemanaMap[key] ?? 0) + num(m.cantidad);
      });

      const porSemana = Object.entries(porSemanaMap)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([semana, cantidad]) => {
          const [y, m, d] = semana.split("-");
          return { semana, cantidad, semanaLabel: `${d}/${m}` };
        });

      const egresoSemanal  = sinHistorial ? 0 : egresoTotal / semanasObservadas;
      const semanasDeStock = sinHistorial
        ? (stockActual > 0 ? Infinity : 0)
        : (egresoSemanal > 0 ? stockActual / egresoSemanal : Infinity);
      const objetivo       = sinHistorial ? 0 : Math.ceil(egresoSemanal * bufferSemanas);
      const aComprar       = sinHistorial ? 0 : Math.max(0, objetivo - stockActual);

      return { mat, stockActual, egresoSemanal, egresoTotal, semanasDeStock, aComprar, porSemana, sinHistorial };
    });
  }, [materiales, movimientos, stockPorMaterial, bufferSemanas]);

  // ── Filas filtradas ───────────────────────────────────────────
  const filasFiltradas = useMemo(() => {
    const base = modo === "obras" ? comprasPorObras : comprasPorRotacion;
    let rows   = soloConNecesidad
      ? base.filter(r => r.aComprar > 0 || (r.sinHistorial && r.stockActual <= 0))
      : base;
    if (qFiltro.trim()) {
      const q = qFiltro.trim().toLowerCase();
      rows = rows.filter(r => r.mat.nombre.toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => b.aComprar - a.aComprar);
  }, [modo, comprasPorObras, comprasPorRotacion, soloConNecesidad, qFiltro]);

  const totalUrgentes = (modo === "obras" ? comprasPorObras : comprasPorRotacion).filter(r => r.aComprar > 0).length;

  return (
    <div style={S.section}>

      {/* ── Header ── */}
      <div style={S.header} onClick={() => setOpen(o => !o)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: totalUrgentes > 0 ? C.amber : C.green, boxShadow: `0 0 8px ${totalUrgentes > 0 ? C.amber : C.green}` }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: C.t0, fontFamily: C.sans }}>Compras Sugeridas</span>
          {totalUrgentes > 0 && (
            <span style={{ background: C.amber + "22", color: C.amber, border: `1px solid ${C.amber}44`, borderRadius: 999, padding: "1px 8px", fontSize: 12, fontWeight: 900, fontFamily: C.sans }}>
              {totalUrgentes} material{totalUrgentes !== 1 ? "es" : ""}
            </span>
          )}
          <span style={{ fontSize: 12, color: C.t2, fontFamily: C.sans }}>
            {modo === "rotacion" ? "rotación histórica" : loading ? "cargando…" : `${obras.length} obra${obras.length !== 1 ? "s" : ""} activa${obras.length !== 1 ? "s" : ""}`}
          </span>
        </div>
        <span style={{ color: C.t2, fontSize: 14 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={S.body}>

          {/* ── Toolbar ── */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.b0}`, flexWrap: "wrap" }}
            onClick={e => e.stopPropagation()}>

            {/* Toggle modo */}
            <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.b0}`, borderRadius: 9, padding: 3 }}>
              <button style={S.modeBtn(modo === "rotacion")} onClick={() => setModo("rotacion")}>Por rotación</button>
              <button style={S.modeBtn(modo === "obras")}    onClick={() => setModo("obras")}>Por obras</button>
            </div>

            {/* Buffer (solo rotación) */}
            {modo === "rotacion" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: C.t2, fontFamily: C.sans }}>Cobertura objetivo:</span>
                {[2, 3, 4, 6].map(n => (
                  <button key={n}
                    style={{ ...S.btnSmall(bufferSemanas === n ? C.blue : C.t2, bufferSemanas === n), padding: "3px 10px" }}
                    onClick={() => setBufferSemanas(n)}>
                    {n} sem
                  </button>
                ))}
              </div>
            )}

            <input
              style={{ ...S.input, width: 200, marginLeft: "auto" }}
              placeholder="Buscar material…"
              value={qFiltro}
              onChange={e => setQFiltro(e.target.value)}
            />

            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: C.t1, fontFamily: C.sans }}>
              <input type="checkbox" checked={soloConNecesidad} onChange={e => setSoloConNecesidad(e.target.checked)} style={{ accentColor: C.blue }} />
              Solo los que hay que comprar
            </label>
          </div>

          {/* ── Loading ── */}
          {loading && modo === "obras" ? (
            <div style={{ padding: "24px 20px", color: C.t2, fontSize: 13, fontFamily: C.sans }}>Calculando necesidades…</div>
          ) : (
            <>
              {/* Vacío */}
              {filasFiltradas.length === 0 && soloConNecesidad && (
                <div style={{ padding: "20px 20px", color: C.green, fontSize: 14, fontFamily: C.sans }}>
                  {modo === "obras"
                    ? "Stock suficiente para todas las obras activas."
                    : `Todos los materiales tienen cobertura para más de ${bufferSemanas} semanas.`}
                </div>
              )}

              {/* Tabla rotación */}
              {modo === "rotacion" && filasFiltradas.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={S.th}>Material</th>
                      <th style={{ ...S.th, color: C.amber }}>A comprar</th>
                      <th style={S.th}>Stock actual</th>
                      <th style={S.th}>Consumo / sem</th>
                      <th style={S.th}>Cobertura</th>
                      <th style={S.th}>Estado</th>
                      <th style={S.th} />
                    </tr>
                  </thead>
                  <tbody>
                    {filasFiltradas.map(row => (
                      <FilaRotacion key={row.mat.id} row={row} buffer={bufferSemanas} onCrearPedido={onCrearPedido} />
                    ))}
                  </tbody>
                </table>
              )}

              {/* Tabla obras */}
              {modo === "obras" && filasFiltradas.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={S.th}>Material</th>
                      <th style={{ ...S.th, color: C.amber }}>A comprar</th>
                      <th style={S.th}>Stock actual</th>
                      <th style={S.th}>Demanda activa</th>
                      <th style={S.th}>Urgencia</th>
                      <th style={S.th}>Obras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasFiltradas.map(row => (
                      <FilaSugerida key={row.mat.id} row={row} onCrearPedido={onCrearPedido} />
                    ))}
                  </tbody>
                </table>
              )}

              {/* Footer */}
              <div style={{ padding: "10px 16px 0", fontSize: 11, color: C.t2, fontFamily: C.sans }}>
                {modo === "rotacion" ? (
                  <>Fórmula: <span style={{ fontFamily: C.mono }}>A comprar = max(0, ⌈consumo/sem × {bufferSemanas}⌉ − stock)</span>{" · "}Consumo calculado sobre todo el historial disponible.{" · "}Hacé click en cada fila para ver el detalle.</>
                ) : (
                  <>Fórmula: <span style={{ fontFamily: C.mono }}>A comprar = max(0, Σ FaltaUsar obras activas − stock)</span>{" · "}Requiere obras con materiales configurados en el sistema.</>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
