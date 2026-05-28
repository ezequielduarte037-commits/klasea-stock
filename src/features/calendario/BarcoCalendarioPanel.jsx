import { C } from "@/theme";
/**
 * BarcoCalendarioPanel.jsx
 *
 * Panel de seguimiento de barcos 2026.
 * Muestra cada barco con su fecha de desmolde estimada/real y botada,
 * y permite marcar el estado del pedido de materiales asociado.
 *
 * Estados de pedido:
 *   sin_pedir         → todavía no se pidió
 *   pedido_enviado    → el pedido ya fue enviado al proveedor
 *   materiales_recibidos → los materiales llegaron
 *   finalizado        → barco entregado / no requiere más acción
 *
 * Tabla Supabase requerida: laminacion_barcos
 * (ver laminacion_barcos_migration.sql)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/supabaseClient";

// ── Paleta (igual al resto de la app) ────────────────────────────
// ── Estilos ───────────────────────────────────────────────────────
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
    fontWeight: 600,
    background: "rgba(0,0,0,0.3)",
    position: "sticky",
    top: 0,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "9px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
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
    color,
    border: `1px solid ${color}44`,
    fontFamily: C.sans,
    whiteSpace: "nowrap",
  }),
  btnSm: (color, fill = false) => ({
    border: `1px solid ${color}44`,
    background: fill ? color : `${color}18`,
    color: fill ? "#fff" : color,
    padding: "4px 11px",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
    fontFamily: C.sans,
    whiteSpace: "nowrap",
    transition: "opacity .15s",
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
};

// ── Helpers ───────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "—";
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T00:00:00") : new Date(d);
  return dt.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function diasHasta(dateStr) {
  if (!dateStr) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - hoy) / (1000 * 60 * 60 * 24));
}

// Usa desmolde_real si existe, si no desmolde_estimado
function fechaDesmolde(barco) {
  return barco.desmolde_real || barco.desmolde_estimado || null;
}

function urgenciaColor(dias) {
  if (dias === null) return C.t2;
  if (dias < 0)   return C.t2;      // ya pasó
  if (dias < 14)  return C.red;     // menos de 2 semanas
  if (dias < 30)  return C.orange;  // menos de 1 mes
  if (dias < 60)  return C.amber;   // menos de 2 meses
  return C.t1;
}

function urgenciaLabel(dias) {
  if (dias === null) return null;
  if (dias < 0)   return "Pasado";
  if (dias < 14)  return `${dias}d ⚡`;
  if (dias < 30)  return `${dias}d ⚠`;
  if (dias < 60)  return `${dias}d`;
  return `${Math.round(dias / 7)}sem`;
}

// ── Config de estados ────────────────────────────────────────────
const ESTADOS = [
  { key: "sin_pedir",            label: "Sin pedir",    color: C.t2,    icon: "○" },
  { key: "pedido_enviado",       label: "Pedido ✉",    color: C.blue,  icon: "📦" },
  { key: "materiales_recibidos", label: "Recibido ✓",  color: C.green, icon: "✅" },
  { key: "finalizado",           label: "Finalizado",  color: C.t2,    icon: "⬜" },
];

function estadoConfig(key) {
  return ESTADOS.find(e => e.key === key) ?? ESTADOS[0];
}

// ── Colores por modelo ────────────────────────────────────────────
const MODELO_COLORS = {
  K34: "#3b82f6",
  K37: "#a78bfa",
  K42: "#f59e0b",
  K43: "#10b981",
  K52: "#f43f5e",
};
function modeloColor(modelo) {
  return MODELO_COLORS[modelo] ?? C.t1;
}

// ── Fila de barco ────────────────────────────────────────────────
function FilaBarco({ barco, onCambiarEstado, guardando }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuPos, setMenuPos]         = useState({ top: 0, left: 0 });
  const [notaEdit, setNotaEdit]       = useState(false);
  const [nota, setNota]               = useState(barco.notas ?? "");
  const btnRef                        = useRef(null);
  const menuRef                       = useRef(null);

  // Sincroniza la nota local cuando cambia desde afuera (ej. realtime de Supabase)
  useEffect(() => {
    if (!notaEdit) setNota(barco.notas ?? "");
  }, [barco.notas, notaEdit]);

  // Cierra el dropdown al hacer click fuera de él
  useEffect(() => {
    if (!menuAbierto) return;
    function handleClickFuera(e) {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        btnRef.current  && !btnRef.current.contains(e.target)
      ) {
        setMenuAbierto(false);
      }
    }
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, [menuAbierto]);

  function abrirMenu() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setMenuAbierto(m => !m);
  }

  const desmolde  = fechaDesmolde(barco);
  const dias      = diasHasta(desmolde);
  const color     = urgenciaColor(dias);
  const label     = urgenciaLabel(dias);
  const est       = estadoConfig(barco.estado_pedido);
  const esReal    = !!barco.desmolde_real;
  const pasado    = dias !== null && dias < 0;
  const finalizado = barco.estado_pedido === "finalizado";

  return (
    <tr
      className="lam-row"
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.03)",
        opacity: finalizado || pasado ? 0.45 : 1,
        transition: "opacity .2s",
      }}
    >
      {/* Modelo */}
      <td style={S.td}>
        <span style={{
          display: "inline-block",
          padding: "2px 7px",
          borderRadius: 5,
          fontSize: 11,
          fontWeight: 800,
          background: modeloColor(barco.modelo) + "22",
          color: modeloColor(barco.modelo),
          border: `1px solid ${modeloColor(barco.modelo)}44`,
          fontFamily: C.mono,
        }}>
          {barco.modelo}
        </span>
      </td>

      {/* Número */}
      <td style={{ ...S.td, fontFamily: C.mono, fontWeight: 700, color: C.t0 }}>
        {barco.numero}
      </td>

      {/* Desmolde */}
      <td style={{ ...S.td }}>
        <div style={{ fontFamily: C.mono, fontSize: 13, color: esReal ? C.green : C.t1 }}>
          {fmtDate(desmolde)}
          {esReal && (
            <span style={{ fontSize: 10, color: C.green, marginLeft: 5, fontWeight: 700, letterSpacing: 0.5 }}>REAL</span>
          )}
          {!esReal && desmolde && (
            <span style={{ fontSize: 10, color: C.t2, marginLeft: 5, letterSpacing: 0.5 }}>EST</span>
          )}
        </div>
        {/* Días restantes */}
        {label && !pasado && (
          <div style={{ fontSize: 11, color, fontFamily: C.mono, marginTop: 2 }}>{label}</div>
        )}
        {pasado && (
          <div style={{ fontSize: 11, color: C.t2, fontFamily: C.sans, marginTop: 2 }}>ya pasó</div>
        )}
      </td>

      {/* Botada */}
      <td style={{ ...S.td, fontFamily: C.mono, fontSize: 12, color: C.t2 }}>
        {fmtDate(barco.botada)}
      </td>

      {/* Estado del pedido */}
      <td style={S.td}>
        <button
          ref={btnRef}
          onClick={abrirMenu}
          style={{
            border: `1px solid ${est.color}44`,
            background: `${est.color}18`,
            color: est.color,
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 12,
            fontFamily: C.sans,
            display: "flex",
            alignItems: "center",
            gap: 5,
            whiteSpace: "nowrap",
          }}
        >
          <span>{est.icon}</span>
          <span>{est.label}</span>
          <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
        </button>

        {menuAbierto && createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              zIndex: 9999,
              background: C.panelSolid2,
              border: `1px solid ${C.b0}`,
              borderRadius: 9,
              padding: 4,
              minWidth: 180,
              boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            }}
          >
            {ESTADOS.map(e => (
              <button
                key={e.key}
                disabled={guardando}
                onClick={() => {
                  onCambiarEstado(barco.id, e.key);
                  setMenuAbierto(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "7px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: barco.estado_pedido === e.key ? `${e.color}22` : "transparent",
                  color: barco.estado_pedido === e.key ? e.color : C.t1,
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: C.sans,
                  fontWeight: barco.estado_pedido === e.key ? 700 : 400,
                  textAlign: "left",
                }}
              >
                <span>{e.icon}</span>
                <span>{e.label}</span>
                {barco.estado_pedido === e.key && <span style={{ marginLeft: "auto", fontSize: 11 }}>✓</span>}
              </button>
            ))}
          </div>,
          document.body
        )}
      </td>

      {/* Fecha del pedido */}
      <td style={{ ...S.td, fontFamily: C.mono, fontSize: 12, color: C.t2 }}>
        {barco.fecha_pedido ? fmtDate(barco.fecha_pedido) : "—"}
      </td>

      {/* Notas */}
      <td style={{ ...S.td, maxWidth: 200 }}>
        {notaEdit ? (
          <div style={{ display: "flex", gap: 5 }}>
            <input
              autoFocus
              style={{ ...S.input, padding: "4px 8px", fontSize: 12 }}
              value={nota}
              onChange={e => setNota(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { onCambiarEstado(barco.id, barco.estado_pedido, nota); setNotaEdit(false); }
                if (e.key === "Escape") { setNota(barco.notas ?? ""); setNotaEdit(false); }
              }}
            />
            <button
              style={S.btnSm(C.green, true)}
              onClick={() => { onCambiarEstado(barco.id, barco.estado_pedido, nota); setNotaEdit(false); }}
            >✓</button>
          </div>
        ) : (
          <span
            style={{ color: nota ? C.t1 : C.t2, fontSize: 12, cursor: "pointer" }}
            onClick={() => setNotaEdit(true)}
            title="Clic para editar"
          >
            {nota || <span style={{ opacity: 0.3 }}>+ nota</span>}
          </span>
        )}
      </td>
    </tr>
  );
}

// ══════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════
export default function BarcoCalendarioPanel() {
  const [open, setOpen]           = useState(true);
  const [barcos, setBarcos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [guardando, setGuardando] = useState(null); // id del barco que se está guardando
  const [err, setErr]             = useState("");

  // Filtros
  const [filtroModelo, setFiltroModelo] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [soloActivos, setSoloActivos]   = useState(true);
  const [busqueda, setBusqueda]         = useState("");
  const [vistaAgrupada, setVistaAgrupada] = useState(false);

  async function cargar() {
    setLoading(true);
    const { data, error } = await supabase
      .from("laminacion_barcos")
      .select("*")
      .order("desmolde_estimado", { ascending: true, nullsLast: true });
    if (error) { setErr("Error cargando barcos: " + error.message); }
    else { setBarcos(data ?? []); }
    setLoading(false);
  }

  // Recarga silenciosa para realtime (sin mostrar spinner)
  async function recargarSilencioso() {
    const { data, error } = await supabase
      .from("laminacion_barcos")
      .select("*")
      .order("desmolde_estimado", { ascending: true, nullsLast: true });
    if (!error) setBarcos(data ?? []);
  }

  useEffect(() => {
    cargar();
    const ch = supabase.channel("rt-barcos")
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_barcos" }, recargarSilencioso)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function cambiarEstado(id, nuevoEstado, notas) {
    setGuardando(id);
    const update = { estado_pedido: nuevoEstado };
    if (notas !== undefined) update.notas = notas;
    if (nuevoEstado === "pedido_enviado") {
      const barco = barcos.find(b => b.id === id);
      if (!barco?.fecha_pedido) {
        const hoy = new Date();
        update.fecha_pedido = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
      }
    }
    try {
      const { error } = await supabase.from("laminacion_barcos").update(update).eq("id", id);
      if (error) { setErr("Error guardando: " + error.message); return; }
      setBarcos(prev => prev.map(b => b.id === id ? { ...b, ...update } : b));
    } catch (e) {
      setErr("Error de conexión: " + e.message);
    } finally {
      setGuardando(null);
    }
  }

  // ── Modelos únicos ────────────────────────────────────────────
  const modelos = useMemo(() => [...new Set(barcos.map(b => b.modelo))].sort(), [barcos]);

  // ── Barcos filtrados ──────────────────────────────────────────
  const barcosFiltrados = useMemo(() => {
    let rows = [...barcos];

    if (soloActivos) {
      // Ocultar los que ya pasaron su desmolde Y están finalizados
      rows = rows.filter(b => {
        const dias = diasHasta(fechaDesmolde(b));
        if (b.estado_pedido === "finalizado") return false;
        // Mostrar igual los pasados si no están finalizados (puede que aún falte gestión)
        return true;
      });
    }

    if (filtroModelo !== "todos") {
      rows = rows.filter(b => b.modelo === filtroModelo);
    }
    if (filtroEstado !== "todos") {
      rows = rows.filter(b => b.estado_pedido === filtroEstado);
    }
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      rows = rows.filter(b =>
        b.numero.toLowerCase().includes(q) ||
        b.modelo.toLowerCase().includes(q) ||
        (b.notas ?? "").toLowerCase().includes(q)
      );
    }

    // Ordenar: sin desmolde al final, luego por fecha
    return rows.sort((a, b) => {
      const da = fechaDesmolde(a);
      const db = fechaDesmolde(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
  }, [barcos, soloActivos, filtroModelo, filtroEstado, busqueda]);

  // ── KPIs ──────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const activos = barcos.filter(b => b.estado_pedido !== "finalizado");
    return {
      sinPedir:    activos.filter(b => b.estado_pedido === "sin_pedir").length,
      pedidos:     activos.filter(b => b.estado_pedido === "pedido_enviado").length,
      recibidos:   activos.filter(b => b.estado_pedido === "materiales_recibidos").length,
      urgentes:    activos.filter(b => {
        const d = diasHasta(fechaDesmolde(b));
        return d !== null && d >= 0 && d < 30 && b.estado_pedido === "sin_pedir";
      }).length,
    };
  }, [barcos]);

  // ── Grupos para vista agrupada ────────────────────────────────
  const grupos = useMemo(() => {
    const map = {};
    barcosFiltrados.forEach(b => {
      if (!map[b.modelo]) map[b.modelo] = [];
      map[b.modelo].push(b);
    });
    return Object.entries(map).sort();
  }, [barcosFiltrados]);

  return (
    <div style={S.section}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={S.header} onClick={() => setOpen(o => !o)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Dot de alerta */}
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: kpis.urgentes > 0 ? C.red : kpis.sinPedir > 0 ? C.amber : C.green,
            boxShadow: `0 0 8px ${kpis.urgentes > 0 ? C.red : kpis.sinPedir > 0 ? C.amber : C.green}`,
          }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: C.t0, fontFamily: C.sans }}>
            🚢 Barcos 2026
          </span>
          {kpis.urgentes > 0 && (
            <span style={S.badge(C.red)}>
              ⚡ {kpis.urgentes} urgente{kpis.urgentes !== 1 ? "s" : ""} sin pedir
            </span>
          )}
          {kpis.sinPedir > 0 && kpis.urgentes === 0 && (
            <span style={S.badge(C.amber)}>
              {kpis.sinPedir} sin pedir
            </span>
          )}
          <span style={{ fontSize: 12, color: C.t2, fontFamily: C.sans }}>
            {kpis.pedidos > 0 && `${kpis.pedidos} pedido${kpis.pedidos !== 1 ? "s" : ""} en curso`}
            {kpis.recibidos > 0 && ` · ${kpis.recibidos} recibido${kpis.recibidos !== 1 ? "s" : ""}`}
          </span>
        </div>
        <span style={{ color: C.t2, fontSize: 14 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={S.body}>

          {err && (
            <div style={{ padding: "12px 20px", color: C.red, fontSize: 13, fontFamily: C.sans }}>
              {err}
            </div>
          )}

          {/* ── KPI bar ─────────────────────────────────────────── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0,
            borderBottom: `1px solid ${C.b0}`,
          }}>
            {[
              { label: "Sin pedir",  val: kpis.sinPedir,  color: C.amber },
              { label: "Pedidos",    val: kpis.pedidos,   color: C.blue  },
              { label: "Recibidos",  val: kpis.recibidos, color: C.green },
              { label: "Urgentes",   val: kpis.urgentes,  color: C.red   },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                padding: "12px 20px",
                borderRight: `1px solid ${C.b0}`,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}>
                <span style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{val}</span>
                <span style={{ fontSize: 11, color: C.t2, textTransform: "uppercase", letterSpacing: 1.1, fontFamily: C.sans }}>{label}</span>
              </div>
            ))}
          </div>

          {/* ── Toolbar ─────────────────────────────────────────── */}
          <div style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: `1px solid ${C.b0}`,
            flexWrap: "wrap",
          }} onClick={e => e.stopPropagation()}>

            {/* Filtro modelo */}
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {["todos", ...modelos].map(m => (
                <button
                  key={m}
                  style={{
                    border: `1px solid ${filtroModelo === m ? (modeloColor(m) || C.blue) + "88" : "transparent"}`,
                    background: filtroModelo === m ? (modeloColor(m) || C.blue) + "22" : "transparent",
                    color: filtroModelo === m ? (modeloColor(m) || C.blue) : C.t2,
                    padding: "4px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: filtroModelo === m ? 700 : 400,
                    fontSize: 13,
                    fontFamily: C.sans,
                  }}
                  onClick={() => setFiltroModelo(m)}
                >
                  {m === "todos" ? "Todos" : m}
                </button>
              ))}
            </div>

            {/* Filtro estado */}
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${C.b0}`,
                color: C.t1,
                padding: "5px 10px",
                borderRadius: 7,
                fontSize: 13,
                fontFamily: C.sans,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="todos">Todos los estados</option>
              {ESTADOS.map(e => (
                <option key={e.key} value={e.key}>{e.label}</option>
              ))}
            </select>

            {/* Buscar */}
            <input
              style={{ ...S.input, width: 160, padding: "5px 10px" }}
              placeholder="Buscar número…"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />

            {/* Toggle solo activos */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: C.t1, fontFamily: C.sans }}>
              <input
                type="checkbox"
                checked={soloActivos}
                onChange={e => setSoloActivos(e.target.checked)}
                style={{ accentColor: C.blue }}
              />
              Ocultar finalizados
            </label>

            {/* Toggle vista */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: C.t1, fontFamily: C.sans, marginLeft: "auto" }}>
              <input
                type="checkbox"
                checked={vistaAgrupada}
                onChange={e => setVistaAgrupada(e.target.checked)}
                style={{ accentColor: C.blue }}
              />
              Agrupar por modelo
            </label>

            <button onClick={cargar} style={{
              border: `1px solid ${C.b0}`,
              background: "transparent",
              color: C.t2,
              padding: "5px 12px",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 13,
              fontFamily: C.sans,
            }}>
              ↺
            </button>
          </div>

          {/* ── Loading ─────────────────────────────────────────── */}
          {loading && (
            <div style={{ padding: "24px 20px", color: C.t2, fontSize: 13, fontFamily: C.sans }}>
              Cargando barcos…
            </div>
          )}

          {/* ── Tabla ───────────────────────────────────────────── */}
          {!loading && (
            <div style={{ overflowX: "auto" }}>
              {!vistaAgrupada ? (
                // Vista plana
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={S.th}>Modelo</th>
                      <th style={S.th}>Barco</th>
                      <th style={S.th}>Desmolde</th>
                      <th style={S.th}>Botada</th>
                      <th style={S.th}>Estado pedido</th>
                      <th style={S.th}>Pedido el</th>
                      <th style={S.th}>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barcosFiltrados.map(b => (
                      <FilaBarco
                        key={b.id}
                        barco={b}
                        onCambiarEstado={cambiarEstado}
                        guardando={guardando === b.id}
                      />
                    ))}
                    {barcosFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ ...S.td, textAlign: "center", padding: "32px", color: C.t2 }}>
                          Sin barcos {filtroModelo !== "todos" || filtroEstado !== "todos" ? "para los filtros aplicados" : "cargados"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                // Vista agrupada por modelo
                <div>
                  {grupos.map(([modelo, barcosGrupo]) => (
                    <div key={modelo}>
                      {/* Header de grupo */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 16px 6px",
                        borderBottom: `1px solid ${C.b0}`,
                        background: "rgba(0,0,0,0.2)",
                      }}>
                        <span style={{
                          padding: "2px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 800,
                          background: modeloColor(modelo) + "22",
                          color: modeloColor(modelo),
                          border: `1px solid ${modeloColor(modelo)}44`,
                          fontFamily: C.mono,
                        }}>
                          {modelo}
                        </span>
                        <span style={{ fontSize: 12, color: C.t2, fontFamily: C.sans }}>
                          {barcosGrupo.length} barco{barcosGrupo.length !== 1 ? "s" : ""}
                        </span>
                        {/* Mini KPI del grupo */}
                        {(() => {
                          const sinPedir = barcosGrupo.filter(b => b.estado_pedido === "sin_pedir").length;
                          const urgentes = barcosGrupo.filter(b => {
                            const d = diasHasta(fechaDesmolde(b));
                            return d !== null && d >= 0 && d < 30 && b.estado_pedido === "sin_pedir";
                          }).length;
                          return urgentes > 0 ? (
                            <span style={S.badge(C.red)}>⚡ {urgentes} urgente{urgentes !== 1 ? "s" : ""}</span>
                          ) : sinPedir > 0 ? (
                            <span style={S.badge(C.amber)}>{sinPedir} sin pedir</span>
                          ) : (
                            <span style={S.badge(C.green)}>✓ al día</span>
                          );
                        })()}
                      </div>

                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ ...S.th, width: 0, padding: 0 }} />
                            <th style={S.th}>Barco</th>
                            <th style={S.th}>Desmolde</th>
                            <th style={S.th}>Botada</th>
                            <th style={S.th}>Estado pedido</th>
                            <th style={S.th}>Pedido el</th>
                            <th style={S.th}>Notas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {barcosGrupo.map(b => (
                            <FilaBarco
                              key={b.id}
                              barco={{ ...b, _hideModelo: true }}
                              onCambiarEstado={cambiarEstado}
                              guardando={guardando === b.id}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Leyenda ─────────────────────────────────────────── */}
          <div style={{
            padding: "10px 16px 0",
            fontSize: 11,
            color: C.t2,
            fontFamily: C.sans,
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}>
            <span>EST = fecha estimada · REAL = desmolde confirmado</span>
            <span>⚡ &lt;14 días · ⚠ &lt;30 días</span>
            <span>Clic en el estado para cambiar · Clic en la nota para editar</span>
          </div>
        </div>
      )}
    </div>
  );
}
