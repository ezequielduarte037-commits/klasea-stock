/**
 * PedidosMaderaScreen.jsx
 *
 * Pantalla de pedidos de madera — Ally Yachts / Klase A
 *
 * Tablas que usa:
 * - materiales           (id, nombre, unidad_medida, stock_actual)
 * - movimientos          (id, material_id, delta, created_at, obra)
 * delta > 0 = ingreso / delta < 0 = egreso
 * - pedidos              (id, proveedor, numero, nota, estado, fecha_pedido, creado_en, creado_por, recibido_en, recibido_por)
 * - pedido_items         (id, pedido_id, material_id, descripcion, cantidad, unidad, nota_recepcion, creado_en)
 *
 * Tres tabs:
 * 1. Stock y sugerencias — tabla con consumo semanal, cobertura y cantidad a pedir
 * 2. Nuevo pedido        — arma el email igual que los mails históricos + registra el pedido
 * 3. Historial           — listado + detalle de pedidos anteriores con cambio de estado
 *
 * Integración:
 * - Mismo layout (Sidebar + grid) que PedidosScreen.jsx
 * - Misma paleta de colores
 * - Agregar a Sidebar y al router como cualquier otra screen
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// ── Paleta (igual que el resto del sistema) ───────────────────────
const C = {
  bg:      "#09090b",
  s0:      "rgba(255,255,255,0.03)",
  s1:      "rgba(255,255,255,0.06)",
  b0:      "rgba(255,255,255,0.08)",
  b1:      "rgba(255,255,255,0.15)",
  t0:      "#f4f4f5",
  t1:      "#a1a1aa",
  t2:      "#71717a",
  mono:    "'JetBrains Mono', 'IBM Plex Mono', monospace",
  sans:    "'Outfit', system-ui, sans-serif",
  primary: "#3b82f6",
  amber:   "#f59e0b",
  green:   "#10b981",
  red:     "#ef4444",
  orange:  "#f97316",
  violet:  "#8b5cf6",
  cyan:    "#06b6d4",
};

const GLASS = {
  backdropFilter: "blur(32px) saturate(130%)",
  WebkitBackdropFilter: "blur(32px) saturate(130%)",
};

const INP = {
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${C.b0}`,
  color: C.t0,
  padding: "9px 12px",
  borderRadius: 8,
  fontSize: 12,
  outline: "none",
  width: "100%",
  fontFamily: "'Outfit', system-ui",
  boxSizing: "border-box",
};

const ESTADOS = [
  { value: "pedido",   label: "Pedido",      color: C.amber,   bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)"  },
  { value: "transito", label: "En transito", color: C.primary, bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)"  },
  { value: "parcial",  label: "Parcial",     color: C.violet,  bg: "rgba(139,92,246,0.1)",  border: "rgba(139,92,246,0.25)"  },
  { value: "recibido", label: "Recibido",    color: C.green,   bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)"  },
];
const ESTADO_META = Object.fromEntries(ESTADOS.map(e => [e.value, e]));

// ── Helpers ───────────────────────────────────────────────────────
function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("es-AR");
}

function urgenciaColor(semanas) {
  if (semanas == null || semanas === Infinity) return C.t2;
  if (semanas <= 0) return C.red;
  if (semanas < 1)  return C.red;
  if (semanas < 2)  return C.orange;
  if (semanas < 4)  return C.amber;
  return C.green;
}

function urgenciaLabel(semanas) {
  if (semanas == null || semanas === Infinity) return "Sin consumo";
  if (semanas <= 0) return "Sin stock";
  if (semanas < 1)  return "Critico";
  if (semanas < 2)  return "Urgente";
  if (semanas < 4)  return "Atencion";
  return "OK";
}

// ── Cálculo de stats por material ─────────────────────────────────
// Ventana de 16 semanas igual que el SQL del sistema
const VENTANA_SEMANAS = 16;

function calcularStats(movimientos, materiales) {
  const ahora  = Date.now();
  const cutoff = ahora - VENTANA_SEMANAS * 7 * 24 * 3600 * 1000;

  return materiales.map(mat => {
    const todosMovs  = movimientos.filter(m => m.material_id === mat.id);
    const histMovs   = todosMovs.filter(m => new Date(m.created_at).getTime() >= cutoff);

    // Stock actual obtenido directamente de la tabla de materiales (Fuente de verdad pura, sin calcular sumas)
    const stockActual = num(mat.stock_actual);

    // Egresos en el periodo de observacion
    const egresos     = histMovs.filter(m => num(m.delta) < 0);
    const egresoTotal = egresos.reduce((s, m) => s + Math.abs(num(m.delta)), 0);

    if (egresoTotal === 0) return null; // sin historial de consumo → no sugerir

    // Semanas observadas (desde el primer movimiento del periodo hasta hoy)
    const fechas          = histMovs.map(m => new Date(m.created_at).getTime()).filter(Boolean);
    const primerMov       = fechas.length ? Math.min(...fechas) : ahora;
    const semanasObservadas = Math.max(1, (ahora - primerMov) / (7 * 24 * 3600 * 1000));

    const egresoSemanal   = egresoTotal / semanasObservadas;
    const semanasDeStock  = egresoSemanal > 0 ? stockActual / egresoSemanal : Infinity;

    // Agrupado semanal (lunes como inicio, ultimas 8 semanas)
    const porSemanaMap = {};
    egresos.forEach(m => {
      const d = new Date(m.created_at);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // retrocede al lunes
      const key = d.toISOString().slice(0, 10);
      porSemanaMap[key] = (porSemanaMap[key] ?? 0) + Math.abs(num(m.delta));
    });

    const porSemana = Object.entries(porSemanaMap)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 8)
      .map(([semana, cantidad]) => {
        const [, mo, d] = semana.split("-");
        return { semana, cantidad, label: `${d}/${mo}` };
      });

    return { mat, stockActual, egresoSemanal, egresoTotal, semanasDeStock, porSemana, semanasObservadas };
  }).filter(Boolean);
}

// ── Generador de texto de email (mismo formato que los mails históricos) ──
function generarEmailTexto({ obras, stockItems, destinatario }) {
  let txt = "";
  if (destinatario.trim()) txt += `${destinatario.trim()},\n\n`;
  txt += "te detallo las maderas requeridas:\n";

  obras.forEach(obra => {
    const items = obra.items.filter(it => it.descripcion.trim());
    if (!items.length) return;
    txt += `\n${obra.nombre || "Obra"}\n`;
    items.forEach(it => {
      const cant = it.cantidad ? `${it.cantidad} ` : "";
      txt += `- ${cant}${it.descripcion}\n`;
    });
    if (obra.destino.trim()) txt += `(Recibir en ${obra.destino.trim()})\n`;
  });

  const stockConItem = stockItems.filter(it => it.descripcion.trim());
  if (stockConItem.length > 0) {
    txt += "\nStock\n";
    stockConItem.forEach(it => {
      const cant = it.cantidad ? `${it.cantidad} ` : "";
      txt += `${cant}${it.descripcion}\n`;
    });
  }

  txt += "\nGracias,\nDavid";
  return txt;
}

// ══════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════
export default function PedidosMaderaScreen({ profile, signOut }) {
  const [tab,         setTab]         = useState("sugeridas"); // "sugeridas" | "pedido" | "historial"
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  // ── Data desde Supabase ──────────────────────────────────────
  const [materiales,   setMateriales]   = useState([]);
  const [movimientos,  setMovimientos]  = useState([]);
  const [pedidos,      setPedidos]      = useState([]);

  // Log para detectar si Supabase está mandando números negativos
  useEffect(() => {
    if (materiales.length > 0) {
      console.log("🔥 STOCK CRUDO DE SUPABASE:");
      materiales.forEach(m => {
        if (num(m.stock_actual) < 0) {
          console.warn(`¡ATENCION! El material ${m.nombre} tiene stock negativo en la base de datos: ${m.stock_actual}`);
        }
      });
    }
  }, [materiales]);

  // ── Tab 1: Sugeridas ──────────────────────────────────────────
  const [bufferSemanas, setBufferSemanas] = useState(4);
  const [soloUrgentes,  setSoloUrgentes]  = useState(false);
  const [qMat,          setQMat]          = useState("");
  const [expandedMat,   setExpandedMat]   = useState(null);

  // ── Tab 2: Nuevo pedido ───────────────────────────────────────
  // obras: array de { id, nombre, destino, items: [{id, descripcion, cantidad, unidad}] }
  const nuevoId = () => Math.random().toString(36).slice(2);
  const [obras,        setObras]        = useState([{ id: nuevoId(), nombre: "", destino: "", items: [] }]);
  const [stockItems,   setStockItems]   = useState([]);
  const [destinatario, setDestinatario] = useState("");
  const [copiado,      setCopiado]      = useState(false);
  const [guardando,    setGuardando]    = useState(false);

  // ── Tab 3: Historial ──────────────────────────────────────────
  const [fEstado,        setFEstado]        = useState("todos");
  const [pedidoSel,      setPedidoSel]      = useState(null);
  const [pedidoSelItems, setPedidoSelItems] = useState([]);

  // ── Carga inicial y realtime ──────────────────────────────────
  const cargar = useCallback(async () => {
    setError("");
    const [
      { data: mats,  error: e1 },
      { data: movs,  error: e2 },
      { data: peds,  error: e3 },
    ] = await Promise.all([
      supabase.from("materiales").select("id, nombre, unidad_medida, stock_actual"),
      supabase.from("movimientos").select("id, material_id, delta, created_at, obra"),
      supabase.from("pedidos")
        .select("*")
        .order("fecha_pedido", { ascending: false })
        .order("creado_en", { ascending: false }),
    ]);

    if (e1) { setError(e1.message); setLoading(false); return; }
    if (e2) { setError(e2.message); setLoading(false); return; }
    if (e3) { setError(e3.message); setLoading(false); return; }

    setMateriales(mats  ?? []);
    setMovimientos(movs ?? []);
    setPedidos(peds     ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
    const ch = supabase.channel("rt-madera")
      .on("postgres_changes", { event: "*", schema: "public", table: "materiales" },  cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "movimientos" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" },     cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [cargar]);

  // ── Stats calculadas ──────────────────────────────────────────
  const stats = useMemo(() => calcularStats(movimientos, materiales), [movimientos, materiales]);

  const statsOrdenadas = useMemo(() => {
    let rows = soloUrgentes
      ? stats.filter(r => r.semanasDeStock < bufferSemanas && r.semanasDeStock !== Infinity)
      : stats;
    if (qMat.trim()) {
      const q = qMat.trim().toLowerCase();
      rows = rows.filter(r => r.mat.nombre.toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => {
      const sa = a.semanasDeStock === Infinity ? 9999 : a.semanasDeStock;
      const sb = b.semanasDeStock === Infinity ? 9999 : b.semanasDeStock;
      return sa - sb;
    });
  }, [stats, soloUrgentes, qMat, bufferSemanas]);

  // Contadores para topbar
  const cntSinStock  = stats.filter(r => r.stockActual  <= 0).length;
  const cntCritico   = stats.filter(r => r.stockActual  >  0 && r.semanasDeStock < 1).length;
  const cntUrgente   = stats.filter(r => r.semanasDeStock >= 1 && r.semanasDeStock < 2).length;
  const cntPedidos   = pedidos.filter(p => p.estado === "pedido").length;
  const cntTransito  = pedidos.filter(p => p.estado === "transito").length;
  const cntActivos   = pedidos.filter(p => ["pedido","transito","parcial"].includes(p.estado)).length;

  // ── Pedido: helpers de edición ────────────────────────────────
  function addObra() {
    setObras(prev => [...prev, { id: nuevoId(), nombre: "", destino: "", items: [] }]);
  }

  function removeObra(obraId) {
    setObras(prev => prev.filter(o => o.id !== obraId));
  }

  function updateObra(obraId, field, val) {
    setObras(prev => prev.map(o => o.id === obraId ? { ...o, [field]: val } : o));
  }

  function addObraItem(obraId, mat) {
    setObras(prev => prev.map(o => o.id === obraId
      ? { ...o, items: [...o.items, { id: nuevoId(), descripcion: mat?.nombre ?? "", cantidad: "", unidad: mat?.unidad_medida ?? "" }] }
      : o));
  }

  function removeObraItem(obraId, itemId) {
    setObras(prev => prev.map(o => o.id === obraId
      ? { ...o, items: o.items.filter(it => it.id !== itemId) }
      : o));
  }

  function updateObraItem(obraId, itemId, field, val) {
    setObras(prev => prev.map(o => o.id === obraId
      ? { ...o, items: o.items.map(it => it.id === itemId ? { ...it, [field]: val } : it) }
      : o));
  }

  function addStockItem(mat) {
    setStockItems(prev => [...prev, { id: nuevoId(), descripcion: mat?.nombre ?? "", cantidad: "", unidad: mat?.unidad_medida ?? "" }]);
  }

  function removeStockItem(id) {
    setStockItems(prev => prev.filter(it => it.id !== id));
  }

  function updateStockItem(id, field, val) {
    setStockItems(prev => prev.map(it => it.id === id ? { ...it, [field]: val } : it));
  }

  // Agrega sugerencia del sistema al stock del pedido
  function agregarSugerencia(row) {
    const cant4 = Math.max(0, Math.ceil(row.egresoSemanal * 4) - Math.round(row.stockActual));
    if (cant4 <= 0) return;
    setStockItems(prev => {
      const yaExiste = prev.find(it => it.descripcion === row.mat.nombre);
      if (yaExiste) {
        return prev.map(it => it.descripcion === row.mat.nombre ? { ...it, cantidad: String(cant4) } : it);
      }
      return [...prev, { id: nuevoId(), descripcion: row.mat.nombre, cantidad: String(cant4), unidad: row.mat.unidad_medida ?? "" }];
    });
  }

  // ── Email ─────────────────────────────────────────────────────
  const emailText = useMemo(() => generarEmailTexto({ obras, stockItems, destinatario }), [obras, stockItems, destinatario]);

  function copiarEmail() {
    navigator.clipboard.writeText(emailText).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 2500);
    });
  }

  // Guarda el pedido en Supabase usando las mismas tablas que PedidosScreen
  async function registrarPedido() {
    setGuardando(true); setError("");
    try {
      const { data: auth } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      const userId = auth?.user?.id ?? null;

      const todosLosItems = [
        ...obras.flatMap(o => o.items
          .filter(it => it.descripcion.trim())
          .map(it => ({ ...it, nota: `Obra: ${o.nombre || "?"}` }))),
        ...stockItems
          .filter(it => it.descripcion.trim())
          .map(it => ({ ...it, nota: "Stock" })),
      ];

      if (todosLosItems.length === 0) {
        setError("Agregá al menos un item antes de registrar.");
        return;
      }

      const obraNames = obras
        .filter(o => o.nombre.trim() && o.items.some(it => it.descripcion.trim()))
        .map(o => o.nombre)
        .join(", ");

      const notaPedido = [
        obraNames           ? `Obras: ${obraNames}` : "",
        stockItems.some(it => it.descripcion.trim()) ? "Stock" : "",
      ].filter(Boolean).join(" + ") || "Pedido de madera";

      const { data: ped, error: e1 } = await supabase
        .from("pedidos")
        .insert({
          proveedor:    "Pendiente",
          nota:         notaPedido,
          estado:       "pedido",
          fecha_pedido: new Date().toISOString(), // FIX: campo requerido por la tabla
          creado_por:   userId,
        })
        .select("*")
        .single();
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("pedido_items").insert(
        todosLosItems.map(it => {
          const mat = materiales.find(m => m.nombre === it.descripcion);
          return {
            pedido_id:      ped.id,
            material_id:    mat?.id ?? null,
            descripcion:    it.descripcion.trim(),
            cantidad:       num(it.cantidad),
            unidad:         it.unidad || "u",
            // nota_recepcion se completa desde el panol al recibir
          };
        })
      );
      if (e2) throw e2;

      // Reset form
      setObras([{ id: nuevoId(), nombre: "", destino: "", items: [] }]);
      setStockItems([]);
      setDestinatario("");
      await cargar();
      setTab("historial");
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setGuardando(false);
    }
  }

  // ── Historial ─────────────────────────────────────────────────
  const pedidosFiltrados = useMemo(() =>
    fEstado === "todos" ? pedidos : pedidos.filter(p => p.estado === fEstado),
    [pedidos, fEstado]);

  async function abrirPedido(ped) {
    setPedidoSel(ped);
    const { data } = await supabase
      .from("pedido_items").select("*")
      .eq("pedido_id", ped.id).order("creado_en");
    setPedidoSelItems(data ?? []);
  }

  async function cambiarEstado(pedidoId, estado) {
    const { data: auth } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const userId  = auth?.user?.id ?? null;
    const patch   = { estado };
    if (estado === "recibido") { patch.recibido_por = userId; patch.recibido_en = new Date().toISOString(); }
    await supabase.from("pedidos").update(patch).eq("id", pedidoId);
    await cargar();
    if (pedidoSel?.id === pedidoId) setPedidoSel(prev => ({ ...prev, estado }));
  }

  // ── Estilos de botones reutilizables ─────────────────────────
  const tabBtn = (active) => ({
    border:     active ? `1px solid ${C.b1}` : "1px solid transparent",
    background: active ? C.s1 : "transparent",
    color:      active ? C.t0 : C.t2,
    padding:    "5px 14px", borderRadius: 6, cursor: "pointer",
    fontSize:   11, fontFamily: C.sans, fontWeight: active ? 600 : 400,
    position: "relative",
  });

  const filterBtn = (active) => ({
    border:     active ? `1px solid ${C.b1}` : "1px solid rgba(255,255,255,0.04)",
    background: active ? C.s1 : "transparent",
    color:      active ? C.t0 : C.t2,
    padding:    "3px 11px", borderRadius: 5, cursor: "pointer",
    fontSize:   10, fontFamily: C.sans, whiteSpace: "nowrap",
  });

  const btn = (color, filled = false) => ({
    border:     `1px solid ${color}55`,
    background: filled ? color : `${color}18`,
    color:      filled ? "#fff" : color,
    padding:    "8px 16px", borderRadius: 8, cursor: "pointer",
    fontWeight: 700, fontSize: 12, fontFamily: C.sans, whiteSpace: "nowrap",
  });

  const btnSm = (color) => ({
    border:     `1px solid ${color}44`,
    background: `${color}15`,
    color,
    padding:    "5px 12px", borderRadius: 6, cursor: "pointer",
    fontWeight: 700, fontSize: 11, fontFamily: C.sans, whiteSpace: "nowrap",
  });

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div style={{ background: C.bg, position: "fixed", inset: 0, overflow: "hidden", color: C.t0, fontFamily: C.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        select option { background: #0f0f12; color: #a1a1aa; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        input:focus, select:focus, textarea:focus { border-color: rgba(59,130,246,0.35) !important; }
        button:not([disabled]):hover { opacity: 0.82; }
        button[disabled] { opacity: 0.4; cursor: not-allowed; }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.06) 0%, transparent 65%),
            radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.03) 0%, transparent 55%);
        }
        .mat-row { transition: background 0.12s; }
        .mat-row:hover { background: rgba(255,255,255,0.025) !important; cursor: pointer; }
        .ped-row:hover { background: rgba(255,255,255,0.02) !important; }
        .item-row:hover { background: rgba(255,255,255,0.015) !important; }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "100%", overflow: "hidden", position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

          {/* ── TOPBAR ─────────────────────────────────────────── */}
          <div style={{ height: 50, background: "rgba(12,12,14,0.92)", ...GLASS, borderBottom: `1px solid ${C.b0}`, padding: "0 18px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t0 }}>Pedidos de Madera</div>
              <div style={{ fontSize: 9, color: C.t2, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 1 }}>
                Stock · Sugerencias · Ordenes
              </div>
            </div>
            {[
              { label: "Sin stock", val: cntSinStock,  color: C.red     },
              { label: "Criticos",  val: cntCritico,   color: C.orange  },
              { label: "Urgentes",  val: cntUrgente,   color: C.amber   },
              { label: "Pedidos",   val: cntPedidos,   color: C.primary },
              { label: "Transito",  val: cntTransito,  color: C.violet  },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, background: C.s0, border: `1px solid ${C.b0}`, borderLeft: `2px solid ${s.color}` }}>
                <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</span>
                <span style={{ fontSize: 8, color: C.t1, letterSpacing: 1.5, textTransform: "uppercase" }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* ── TAB BAR ────────────────────────────────────────── */}
          <div style={{ height: 38, background: "rgba(12,12,14,0.85)", ...GLASS, borderBottom: `1px solid ${C.b0}`, padding: "0 18px", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button style={tabBtn(tab === "sugeridas")} onClick={() => setTab("sugeridas")}>
              Stock y sugerencias
            </button>
            <button style={tabBtn(tab === "pedido")} onClick={() => setTab("pedido")}>
              Nuevo pedido
            </button>
            <button style={tabBtn(tab === "historial")} onClick={() => setTab("historial")}>
              Historial
              {cntActivos > 0 && (
                <span style={{ marginLeft: 6, background: C.amber + "30", color: C.amber, borderRadius: 99, padding: "0 6px", fontSize: 9, fontWeight: 700 }}>
                  {cntActivos}
                </span>
              )}
            </button>
          </div>

          {/* ── ERROR ──────────────────────────────────────────── */}
          {error && (
            <div style={{ margin: "8px 18px 0", padding: "8px 14px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: C.red, fontSize: 12, flexShrink: 0 }}>
              {error}
            </div>
          )}

          {/* ── CONTENT ────────────────────────────────────────── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
            <div style={{ width: "min(1350px,100%)", margin: "0 auto" }}>

              {/* ══════ TAB 1: STOCK Y SUGERENCIAS ══════════════ */}
              {tab === "sugeridas" && (
                <>
                  {/* Controles */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flexShrink: 0 }}>
                      Cobertura objetivo
                    </span>
                    {[2, 3, 4, 6, 8].map(n => (
                      <button key={n} style={filterBtn(bufferSemanas === n)} onClick={() => setBufferSemanas(n)}>
                        {n} sem
                      </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: C.t1, userSelect: "none" }}>
                      <input type="checkbox" checked={soloUrgentes} onChange={e => setSoloUrgentes(e.target.checked)} style={{ accentColor: C.amber }} />
                      Solo urgentes
                    </label>
                    <input
                      style={{ background: "transparent", border: "none", color: C.t0, fontSize: 11, fontFamily: C.sans, outline: "none", width: 220 }}
                      placeholder="Buscar material..."
                      value={qMat}
                      onChange={e => setQMat(e.target.value)}
                    />
                  </div>

                  {/* Tabla principal */}
                  <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, overflow: "hidden" }}>
                    {/* Header */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 90px 110px 110px 110px", gap: 8, padding: "10px 16px", background: "rgba(0,0,0,0.3)", borderBottom: `1px solid ${C.b0}` }}>
                      {["Material", "Stock", "Egreso/sem", "Cobertura", `Pedir ${bufferSemanas}s`, "Pedir 4s", "Estado"].map(h => (
                        <div key={h} style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>{h}</div>
                      ))}
                    </div>

                    {loading && (
                      <div style={{ padding: 24, textAlign: "center", color: C.t2, fontSize: 12, fontFamily: C.mono }}>
                        Cargando...
                      </div>
                    )}

                    {!loading && statsOrdenadas.length === 0 && (
                      <div style={{ padding: 24, textAlign: "center", color: C.t2, fontSize: 12 }}>
                        {soloUrgentes ? "No hay materiales urgentes con el filtro actual." : "No hay datos de consumo registrados."}
                      </div>
                    )}

                    {statsOrdenadas.map(row => {
                      const color   = urgenciaColor(row.semanasDeStock);
                      const isExp   = expandedMat === row.mat.id;
                      const cobN    = Math.max(0, Math.ceil(row.egresoSemanal * bufferSemanas) - Math.round(row.stockActual));
                      const cob4    = Math.max(0, Math.ceil(row.egresoSemanal * 4)             - Math.round(row.stockActual));
                      const semStr  = row.semanasDeStock === Infinity ? "inf" : row.semanasDeStock.toFixed(1);

                      return (
                        <div key={row.mat.id}>
                          <div
                            className="mat-row"
                            onClick={() => setExpandedMat(isExp ? null : row.mat.id)}
                            style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 90px 110px 110px 110px", gap: 8, padding: "11px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`, alignItems: "center", borderLeft: `3px solid ${color}` }}>

                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: C.t0 }}>{row.mat.nombre}</div>
                              <div style={{ fontSize: 10, color: C.t2 }}>{row.mat.unidad_medida}</div>
                            </div>
                            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: row.stockActual <= 0 ? C.red : C.t0 }}>
                              {Math.round(row.stockActual)}
                            </div>
                            <div style={{ fontFamily: C.mono, fontSize: 12, color: C.t1 }}>
                              {row.egresoSemanal.toFixed(1)} / sem
                            </div>
                            <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color }}>
                              {semStr} sem
                            </div>
                            <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700, color: cobN > 0 ? C.amber : C.t2 }}>
                              {cobN > 0 ? cobN : "—"}
                            </div>
                            <div style={{ fontFamily: C.mono, fontSize: 13, color: cob4 > 0 ? C.t1 : C.t2 }}>
                              {cob4 > 0 ? cob4 : "—"}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: color + "22", color, border: `1px solid ${color}44` }}>
                                {urgenciaLabel(row.semanasDeStock)}
                              </span>
                              <span style={{ color: C.t2, fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
                            </div>
                          </div>

                          {/* Detalle expandido */}
                          {isExp && (
                            <div style={{ padding: "12px 16px 16px", background: "rgba(255,255,255,0.01)", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                              <div style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
                                Consumo por semana (ultimas 8)
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                                {row.porSemana.length > 0 ? row.porSemana.map(s => (
                                  <div key={s.semana} style={{ border: `1px solid ${C.b0}`, borderRadius: 7, padding: "6px 10px", background: "rgba(255,255,255,0.02)", minWidth: 60, textAlign: "center" }}>
                                    <div style={{ fontSize: 9, color: C.t2, marginBottom: 3 }}>{s.label}</div>
                                    <div style={{ fontFamily: C.mono, fontSize: 13, color: s.cantidad > 0 ? C.t0 : C.t2, fontWeight: 700 }}>
                                      {s.cantidad > 0 ? s.cantidad : "—"}
                                    </div>
                                  </div>
                                )) : <span style={{ fontSize: 11, color: C.t2 }}>Sin egresos recientes.</span>}
                              </div>
                              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 11, color: C.t2 }}>
                                <span>Promedio: <span style={{ fontFamily: C.mono, color: C.t1 }}>{row.egresoSemanal.toFixed(2)}/sem</span></span>
                                <span>Ventana: <span style={{ fontFamily: C.mono, color: C.t1 }}>{row.semanasObservadas.toFixed(1)} sem</span></span>
                                <span>Para 4 sem: <span style={{ fontFamily: C.mono, color: C.amber }}>{Math.ceil(row.egresoSemanal * 4)} necesario</span></span>
                                <span>Para 6 sem: <span style={{ fontFamily: C.mono, color: C.amber }}>{Math.ceil(row.egresoSemanal * 6)} necesario</span></span>
                              </div>
                              {cobN > 0 && (
                                <button
                                  style={{ ...btnSm(C.amber), marginTop: 10 }}
                                  onClick={e => { e.stopPropagation(); agregarSugerencia(row); setTab("pedido"); }}>
                                  + Agregar {cobN} {row.mat.unidad_medida} al pedido
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {!loading && statsOrdenadas.length > 0 && (
                      <div style={{ padding: "8px 16px", fontSize: 9, color: C.t2, fontFamily: C.mono }}>
                        {statsOrdenadas.length} materiales · Formula: max(0, ceil(egreso/sem x {bufferSemanas}) - stock) · Click en fila para ver historial semanal
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ══════ TAB 2: NUEVO PEDIDO ══════════════════════ */}
              {tab === "pedido" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>

                  {/* Columna izquierda: editor */}
                  <div>

                    {/* Destinatario */}
                    <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                      <div style={{ fontSize: 10, color: C.t2, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Encabezado del email</div>
                      <input style={INP} placeholder="Destinatario (ej: David)" value={destinatario} onChange={e => setDestinatario(e.target.value)} />
                      <div style={{ fontSize: 10, color: C.t2, marginTop: 6 }}>Si lo deja vacio el email empieza directamente con el listado.</div>
                    </div>

                    {/* Obras */}
                    {obras.map((obra, idx) => (
                      <div key={obra.id} style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                          <div style={{ fontSize: 10, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flex: 1 }}>
                            Obra {idx + 1}
                          </div>
                          {obras.length > 1 && (
                            <button style={btnSm(C.red)} onClick={() => removeObra(obra.id)}>Quitar</button>
                          )}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                          <input style={INP} placeholder="Nombre de obra (ej: K52-24)" value={obra.nombre} onChange={e => updateObra(obra.id, "nombre", e.target.value)} />
                          <input style={INP} placeholder="Destino (ej: Chubut 2120)" value={obra.destino} onChange={e => updateObra(obra.id, "destino", e.target.value)} />
                        </div>

                        {/* Items de la obra */}
                        {obra.items.map(it => (
                          <div key={it.id} style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
                            <input style={INP} placeholder="Descripcion" value={it.descripcion} onChange={e => updateObraItem(obra.id, it.id, "descripcion", e.target.value)} />
                            <input style={INP} placeholder="Cant." type="number" value={it.cantidad} onChange={e => updateObraItem(obra.id, it.id, "cantidad", e.target.value)} />
                            <input style={INP} placeholder="Unidad" value={it.unidad} onChange={e => updateObraItem(obra.id, it.id, "unidad", e.target.value)} />
                            <button style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: C.red, padding: "9px 11px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontFamily: C.sans }} onClick={() => removeObraItem(obra.id, it.id)}>
                              x
                            </button>
                          </div>
                        ))}

                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <select style={{ ...INP, flex: 1 }} value="" onChange={e => { if (e.target.value) { addObraItem(obra.id, materiales.find(m => m.id === e.target.value)); } }}>
                            <option value="">+ Desde inventario...</option>
                            {materiales.map(m => (
                              <option key={m.id} value={m.id}>{m.nombre} (stock: {Math.round(num(m.stock_actual))})</option>
                            ))}
                          </select>
                          <button style={{ border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, padding: "9px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans, whiteSpace: "nowrap" }}
                            onClick={() => addObraItem(obra.id, null)}>
                            + Manual
                          </button>
                        </div>
                      </div>
                    ))}

                    <button
                      style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans, marginBottom: 12, width: "100%" }}
                      onClick={addObra}>
                      + Agregar otra obra
                    </button>

                    {/* Stock (reposicion) */}
                    <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                      <div style={{ fontSize: 10, color: C.t2, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
                        Stock — reposicion general
                      </div>

                      {stockItems.map(it => (
                        <div key={it.id} style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
                          <input style={INP} placeholder="Descripcion" value={it.descripcion} onChange={e => updateStockItem(it.id, "descripcion", e.target.value)} />
                          <input style={INP} placeholder="Cant." type="number" value={it.cantidad} onChange={e => updateStockItem(it.id, "cantidad", e.target.value)} />
                          <input style={INP} placeholder="Unidad" value={it.unidad} onChange={e => updateStockItem(it.id, "unidad", e.target.value)} />
                          <button style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: C.red, padding: "9px 11px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontFamily: C.sans }} onClick={() => removeStockItem(it.id)}>
                            x
                          </button>
                        </div>
                      ))}

                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <select style={{ ...INP, flex: 1 }} value="" onChange={e => { if (e.target.value) { addStockItem(materiales.find(m => m.id === e.target.value)); } }}>
                          <option value="">+ Desde inventario...</option>
                          {materiales.map(m => (
                            <option key={m.id} value={m.id}>{m.nombre} (stock: {Math.round(num(m.stock_actual))})</option>
                          ))}
                        </select>
                        <button style={{ border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, padding: "9px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans, whiteSpace: "nowrap" }}
                          onClick={() => addStockItem(null)}>
                          + Manual
                        </button>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={btn(C.green)} onClick={copiarEmail}>
                        {copiado ? "Copiado!" : "Copiar email"}
                      </button>
                      <button style={btn(C.primary)} onClick={registrarPedido} disabled={guardando}>
                        {guardando ? "Guardando..." : "Registrar pedido"}
                      </button>
                    </div>
                  </div>

                  {/* Columna derecha: preview + sugerencias del sistema */}
                  <div style={{ position: "sticky", top: 0 }}>
                    <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>Vista previa del email</div>
                        <button style={btnSm(C.green)} onClick={copiarEmail}>
                          {copiado ? "Copiado!" : "Copiar"}
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={emailText}
                        style={{ width: "100%", minHeight: 380, background: "rgba(0,0,0,0.35)", border: `1px solid ${C.b0}`, color: C.t0, fontFamily: C.mono, fontSize: 12, padding: 14, borderRadius: 10, resize: "vertical", outline: "none", lineHeight: 1.75 }}
                      />
                    </div>

                    {/* Sugerencias del sistema */}
                    {stats.filter(r => {
                      const cobN = Math.max(0, Math.ceil(r.egresoSemanal * 4) - Math.round(r.stockActual));
                      return cobN > 0;
                    }).length > 0 && (
                      <div style={{ background: C.s0, border: `1px solid ${C.amber}44`, borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 10, color: C.amber, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                          El sistema sugiere comprar
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {stats
                            .filter(r => {
                              const cobN = Math.max(0, Math.ceil(r.egresoSemanal * 4) - Math.round(r.stockActual));
                              return cobN > 0;
                            })
                            .sort((a, b) => a.semanasDeStock - b.semanasDeStock)
                            .slice(0, 12)
                            .map(r => {
                              const cobN = Math.max(0, Math.ceil(r.egresoSemanal * 4) - Math.round(r.stockActual));
                              const color = urgenciaColor(r.semanasDeStock);
                              return (
                                <button
                                  key={r.mat.id}
                                  style={{ border: `1px solid ${color}44`, background: `${color}15`, color, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.sans }}
                                  onClick={() => agregarSugerencia(r)}>
                                  + {r.mat.nombre} ({cobN} {r.mat.unidad_medida})
                                </button>
                              );
                            })}
                        </div>
                        <div style={{ fontSize: 10, color: C.t2, marginTop: 8 }}>
                          Haciendo click se agrega al Stock del pedido con la cantidad para 4 semanas de cobertura.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ══════ TAB 3: HISTORIAL ═════════════════════════ */}
              {tab === "historial" && (
                <>
                  {/* Filtros de estado */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                    <button style={filterBtn(fEstado === "todos")} onClick={() => setFEstado("todos")}>Todos</button>
                    {ESTADOS.map(e => (
                      <button key={e.value} style={filterBtn(fEstado === e.value)} onClick={() => setFEstado(e.value)}>
                        {e.label}
                      </button>
                    ))}
                  </div>

                  {/* Lista de pedidos */}
                  <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, overflow: "hidden", marginBottom: pedidoSel ? 12 : 0 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 120px 90px", gap: 10, padding: "10px 16px", background: "rgba(0,0,0,0.3)", borderBottom: `1px solid ${C.b0}` }}>
                      {["Fecha", "Proveedor", "Nota", "Estado", ""].map(h => (
                        <div key={h} style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>{h}</div>
                      ))}
                    </div>

                    {loading && (
                      <div style={{ padding: 20, textAlign: "center", color: C.t2, fontSize: 12, fontFamily: C.mono }}>Cargando...</div>
                    )}

                    {pedidosFiltrados.map(p => {
                      const m = ESTADO_META[p.estado] ?? { color: C.t2, bg: C.s0, border: C.b0, label: p.estado };
                      const isSelected = pedidoSel?.id === p.id;
                      return (
                        <div key={p.id} className="ped-row" style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 120px 90px", gap: 10, padding: "11px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`, alignItems: "center", background: isSelected ? "rgba(255,255,255,0.025)" : undefined }}>
                          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.t2 }}>
                            {fmtDate(p.fecha_pedido ?? p.creado_en)}
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 12, color: C.t0 }}>{p.proveedor}</div>
                          <div style={{ fontSize: 11, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nota || "—"}</div>
                          <div>
                            <span style={{ fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>
                              {m.label}
                            </span>
                          </div>
                          <button
                            style={{ border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans }}
                            onClick={() => isSelected ? setPedidoSel(null) : abrirPedido(p)}>
                            {isSelected ? "Cerrar" : "Abrir"}
                          </button>
                        </div>
                      );
                    })}

                    {!loading && pedidosFiltrados.length === 0 && (
                      <div style={{ padding: 28, textAlign: "center", color: C.t2, fontSize: 12 }}>
                        No hay pedidos con este filtro.
                      </div>
                    )}
                  </div>

                  {/* Detalle del pedido seleccionado */}
                  {pedidoSel && (
                    <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: C.t0 }}>
                            {pedidoSel.proveedor}{pedidoSel.numero ? ` — ${pedidoSel.numero}` : ""}
                          </div>
                          {pedidoSel.nota && <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>{pedidoSel.nota}</div>}
                          <div style={{ fontSize: 10, color: C.t2, marginTop: 3 }}>
                            Creado: {fmtDate(pedidoSel.creado_en)}
                            {pedidoSel.recibido_en ? ` · Recibido: ${fmtDate(pedidoSel.recibido_en)}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                          {ESTADOS.map(est => {
                            const m = ESTADO_META[est.value];
                            const isActive = pedidoSel.estado === est.value;
                            return (
                              <button key={est.value} style={{ border: `1px solid ${m.border}`, background: isActive ? m.bg : "transparent", color: isActive ? m.color : C.t2, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans, fontWeight: isActive ? 700 : 400 }}
                                onClick={() => cambiarEstado(pedidoSel.id, est.value)}>
                                {m.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Items del pedido */}
                      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px 80px 1fr", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.b0}` }}>
                          {["Descripcion", "Cantidad", "Unidad", "Vinculado", "Nota recepcion"].map(h => (
                            <div key={h} style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>{h}</div>
                          ))}
                        </div>
                        {pedidoSelItems.map(it => (
                          <div key={it.id} className="item-row" style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px 80px 1fr", gap: 10, padding: "9px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, alignItems: "center" }}>
                            <div style={{ fontSize: 12, color: C.t0 }}>{it.descripcion}</div>
                            <div style={{ fontFamily: C.mono, fontSize: 12, color: C.t1 }}>{num(it.cantidad)}</div>
                            <div style={{ fontSize: 11, color: C.t1 }}>{it.unidad}</div>
                            <div style={{ fontSize: 11, color: it.material_id ? C.green : C.t2 }}>
                              {it.material_id ? "si" : "—"}
                            </div>
                            <input
                              style={{ background: "transparent", border: `1px solid ${C.b0}`, color: C.t1, fontSize: 11, borderRadius: 6, padding: "4px 8px", fontFamily: C.sans, outline: "none", width: "100%" }}
                              placeholder="Ej: vinieron 3 de 5..."
                              defaultValue={it.nota_recepcion ?? ""}
                              onBlur={async e => {
                                const val = e.target.value.trim();
                                await supabase.from("pedido_items").update({ nota_recepcion: val || null }).eq("id", it.id);
                              }}
                            />
                          </div>
                        ))}
                        {!pedidoSelItems.length && (
                          <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: C.t2 }}>Sin items registrados.</div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}