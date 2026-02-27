import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

const TABS = ["Stock", "Ingresos", "Egresos", "Pedidos"];

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtDate(ts) {
  if (!ts) return "—";
  // Fechas solo-fecha (YYYY-MM-DD) se parsean como UTC midnight por JS.
  // Agregamos T00:00:00 SIN 'Z' para que las tome como hora local (Argentina UTC-3)
  // y no muestre el día anterior.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(ts)
    ? new Date(ts + "T00:00:00")
    : new Date(ts);
  return d.toLocaleDateString("es-AR");
}

// Fecha de hoy en hora LOCAL (evita que UTC-3 dé el día siguiente al usar toISOString)
function hoyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTs(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-AR");
}

// ── EXPORT UTIL ─────────────────────────────────────────────────
function descargarCSV(filas, nombre) {
  if (!filas.length) return;
  const encabezado = Object.keys(filas[0]);
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    encabezado.map(escape).join(","),
    ...filas.map(row => encabezado.map(k => escape(row[k])).join(",")),
  ].join("\n");
  // BOM UTF-8 para que Excel abra acentos correctamente
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: nombre });
  a.click();
  URL.revokeObjectURL(url);
}

export default function LaminacionScreen({ profile, signOut }) {
  const location = useLocation();
  const role = profile?.role ?? "invitado";
  const isAdmin = !!profile?.is_admin;
  const puedeCargar = isAdmin || role === "admin" || role === "panol";

  // Tabs disponibles según rol: pañol solo ve Ingresos y Egresos
  const esPanol = role === "panol" && !isAdmin;
  const tabsDisponibles = esPanol
    ? ["Ingresos", "Egresos"]
    : ["Stock", "Ingresos", "Egresos", "Movimientos", "Pedidos"];

  function tabFromSearch(search) {
    const t = new URLSearchParams(search).get("tab");
    if (tabsDisponibles.includes(t)) return t;
    return tabsDisponibles[0]; // default: Stock para gestión, Ingresos para pañol
  }
  const [tab, setTab] = useState(() => tabFromSearch(location.search));

  // Sincronizar tab cuando el usuario navega desde el Sidebar
  useEffect(() => {
    setTab(tabFromSearch(location.search));
  }, [location.search]);
  const [materiales, setMateriales] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [showNuevoMaterial, setShowNuevoMaterial] = useState(false);

  const [formIngreso, setFormIngreso] = useState({
    material_id: "", cantidad: "",
    fecha: hoyLocal(),
    proveedor: "", obra: "", observaciones: "",
  });
  const [formEgreso, setFormEgreso] = useState({
    material_id: "", cantidad: "",
    fecha: hoyLocal(),
    destino: "", nombre_persona: "", observaciones: "",
  });
  const [formPedido, setFormPedido] = useState({ material_id: "", cantidad: "", observaciones: "" });
  const [formMaterial, setFormMaterial] = useState({ nombre: "", categoria: "", unidad: "unidad", stock_minimo: 0 });

  // ── Estado específico del tab Movimientos ────────────────────
  const [qMov,        setQMov]        = useState("");
  const [filtroTipo,  setFiltroTipo]  = useState("todos");   // todos | ingreso | egreso
  const [filtroMatId, setFiltroMatId] = useState("");        // "" = todos
  const [movSort,     setMovSort]     = useState("fecha_desc"); // fecha_desc | fecha_asc

  async function cargarMateriales() {
    const { data } = await supabase.from("laminacion_materiales").select("*").order("nombre");
    setMateriales(data ?? []);
  }
  async function cargarMovimientos() {
    const { data } = await supabase
      .from("laminacion_movimientos")
      .select("*, laminacion_materiales(nombre, unidad)")
      .order("created_at", { ascending: false })
      .limit(500);
    setMovimientos(data ?? []);
  }
  async function cargarPedidos() {
    const { data } = await supabase
      .from("laminacion_pedidos")
      .select("*, laminacion_materiales(nombre, unidad)")
      .order("created_at", { ascending: false });
    setPedidos(data ?? []);
  }
  async function cargar() {
    setErr("");
    await Promise.all([cargarMateriales(), cargarMovimientos(), cargarPedidos()]);
  }

  useEffect(() => {
    cargar();
    const ch = supabase
      .channel("rt-laminacion")
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_movimientos" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_pedidos" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_materiales" }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const stockPorMaterial = useMemo(() => {
    const map = {};
    for (const m of materiales) map[m.id] = 0;
    for (const mv of movimientos) {
      if (!mv.material_id) continue;
      const delta = mv.tipo === "ingreso" ? num(mv.cantidad) : -num(mv.cantidad);
      map[mv.material_id] = (map[mv.material_id] ?? 0) + delta;
    }
    return map;
  }, [materiales, movimientos]);

  const stockRows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return materiales
      .map(m => ({
        ...m,
        stock: num(stockPorMaterial[m.id]),
        estado: (stockPorMaterial[m.id] ?? 0) <= 0 ? "CRITICO"
          : (stockPorMaterial[m.id] ?? 0) <= num(m.stock_minimo) ? "ATENCION"
          : "OK",
      }))
      .filter(m => !qq || m.nombre.toLowerCase().includes(qq));
  }, [materiales, stockPorMaterial, q]);

  const movFiltrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return movimientos;
    return movimientos.filter(m => {
      const t = [m.laminacion_materiales?.nombre, m.proveedor, m.nombre_persona, m.destino, m.obra, m.observaciones]
        .filter(Boolean).join(" ").toLowerCase();
      return t.includes(qq);
    });
  }, [movimientos, q]);

  // Filtrado específico del tab Movimientos (independiente del buscador global)
  const movimientosFiltrados = useMemo(() => {
    let rows = [...movimientos];
    // Filtro tipo
    if (filtroTipo !== "todos") rows = rows.filter(m => m.tipo === filtroTipo);
    // Filtro material
    if (filtroMatId) rows = rows.filter(m => m.material_id === filtroMatId);
    // Búsqueda texto
    const qq = qMov.trim().toLowerCase();
    if (qq) rows = rows.filter(m => {
      const t = [
        m.laminacion_materiales?.nombre,
        m.proveedor, m.destino, m.nombre_persona, m.obra, m.observaciones,
        m.tipo,
      ].filter(Boolean).join(" ").toLowerCase();
      return t.includes(qq);
    });
    // Orden
    rows.sort((a, b) => {
      const da = new Date(a.fecha || a.created_at).getTime();
      const db = new Date(b.fecha || b.created_at).getTime();
      return movSort === "fecha_asc" ? da - db : db - da;
    });
    return rows;
  }, [movimientos, filtroTipo, filtroMatId, qMov, movSort]);

  // Stats de movimientos
  const movStats = useMemo(() => ({
    total:     movimientos.length,
    ingresos:  movimientos.filter(m => m.tipo === "ingreso").length,
    egresos:   movimientos.filter(m => m.tipo === "egreso").length,
    enFiltro:  movimientosFiltrados.length,
  }), [movimientos, movimientosFiltrados]);

  // ── Funciones de exportación ────────────────────────────────────
  function exportarMovimientos(soloFiltrados = true) {
    const datos = soloFiltrados ? movimientosFiltrados : movimientos;
    const filas = datos.map(m => ({
      Fecha:        m.fecha || m.created_at
                      ? new Date(m.fecha || m.created_at).toLocaleDateString("es-AR")
                      : "—",
      Hora:         m.created_at
                      ? new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
                      : "—",
      Tipo:         m.tipo === "ingreso" ? "Ingreso" : "Egreso",
      Material:     m.laminacion_materiales?.nombre ?? "—",
      Cantidad:     m.tipo === "ingreso" ? m.cantidad : -m.cantidad,
      Unidad:       m.laminacion_materiales?.unidad ?? "—",
      Proveedor:    m.tipo === "ingreso" ? (m.proveedor ?? "—") : "—",
      Destino:      m.tipo === "egreso"  ? (m.destino  ?? "—") : "—",
      Persona:      m.nombre_persona ?? "—",
      Obra:         m.obra ?? "—",
      Observaciones: m.observaciones ?? "—",
    }));
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    const sufijo = soloFiltrados && movStats.enFiltro !== movStats.total ? "_filtrado" : "";
    descargarCSV(filas, `movimientos_laminacion${sufijo}_${hoy}.csv`);
  }

  function exportarStock() {
    const filas = materiales.map(m => ({
      Material:       m.nombre,
      Categoria:      m.categoria ?? "—",
      Unidad:         m.unidad ?? "—",
      Stock_actual:   m.stock ?? 0,
      Stock_minimo:   m.stock_minimo ?? 0,
      Estado:         m.estado ?? "—",
    }));
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    descargarCSV(filas, `stock_laminacion_${hoy}.csv`);
  }

  function exportarPedidos() {
    const filas = pedidosFiltrados.map(p => ({
      Fecha:         new Date(p.created_at).toLocaleDateString("es-AR"),
      Material:      p.laminacion_materiales?.nombre ?? "—",
      Unidad:        p.laminacion_materiales?.unidad  ?? "—",
      Cantidad:      p.cantidad,
      Estado:        p.estado,
      Observaciones: p.observaciones ?? "—",
    }));
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    descargarCSV(filas, `pedidos_laminacion_${hoy}.csv`);
  }

  const pedidosFiltrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return pedidos;
    return pedidos.filter(p => {
      const t = [p.laminacion_materiales?.nombre, p.estado, p.observaciones]
        .filter(Boolean).join(" ").toLowerCase();
      return t.includes(qq);
    });
  }, [pedidos, q]);

  function flash(m) { setMsg(m); setTimeout(() => setMsg(""), 2500); }

  async function getUserId() {
    const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    return data?.user?.id ?? null;
  }

  async function crearIngreso(e) {
    e.preventDefault();
    if (!formIngreso.material_id) return setErr("Seleccioná un material");
    if (!formIngreso.cantidad || num(formIngreso.cantidad) <= 0) return setErr("Cantidad inválida");
    setErr("");
    const userId = await getUserId();
    const { error } = await supabase.from("laminacion_movimientos").insert({
      material_id: formIngreso.material_id,
      tipo: "ingreso",
      cantidad: num(formIngreso.cantidad),
      fecha: formIngreso.fecha,
      proveedor: formIngreso.proveedor.trim() || null,
      obra: formIngreso.obra.trim() || null,
      observaciones: formIngreso.observaciones.trim() || null,
      creado_por: userId,
    });
    if (error) return setErr(error.message);
    flash("✅ Ingreso registrado");
    setFormIngreso(f => ({ ...f, cantidad: "", proveedor: "", obra: "", observaciones: "" }));
    cargar();
  }

  async function crearEgreso(e) {
    e.preventDefault();
    if (!formEgreso.material_id) return setErr("Seleccioná un material");
    if (!formEgreso.cantidad || num(formEgreso.cantidad) <= 0) return setErr("Cantidad inválida");
    setErr("");
    const userId = await getUserId();
    const { error } = await supabase.from("laminacion_movimientos").insert({
      material_id: formEgreso.material_id,
      tipo: "egreso",
      cantidad: num(formEgreso.cantidad),
      fecha: formEgreso.fecha,
      destino: formEgreso.destino.trim() || null,
      nombre_persona: formEgreso.nombre_persona.trim() || null,
      observaciones: formEgreso.observaciones.trim() || null,
      creado_por: userId,
    });
    if (error) return setErr(error.message);
    flash("✅ Egreso registrado");
    setFormEgreso(f => ({ ...f, cantidad: "", destino: "", nombre_persona: "", observaciones: "" }));
    cargar();
  }

  async function crearPedido(e) {
    e.preventDefault();
    if (!formPedido.material_id) return setErr("Seleccioná un material");
    if (!formPedido.cantidad || num(formPedido.cantidad) <= 0) return setErr("Cantidad inválida");
    setErr("");
    const userId = await getUserId();
    const { error } = await supabase.from("laminacion_pedidos").insert({
      material_id: formPedido.material_id,
      cantidad: num(formPedido.cantidad),
      estado: "pendiente",
      solicitado_por: userId,
      observaciones: formPedido.observaciones.trim() || null,
    });
    if (error) return setErr(error.message);
    flash("✅ Pedido creado");
    setFormPedido({ material_id: "", cantidad: "", observaciones: "" });
    cargar();
  }

  async function setEstadoPedido(id, estado) {
    const { error } = await supabase.from("laminacion_pedidos").update({ estado }).eq("id", id);
    if (error) setErr(error.message);
    else cargar();
  }

  async function crearMaterial(e) {
    e.preventDefault();
    if (!formMaterial.nombre.trim()) return setErr("Nombre es obligatorio");
    setErr("");
    const { error } = await supabase.from("laminacion_materiales").insert({
      nombre: formMaterial.nombre.trim(),
      categoria: formMaterial.categoria.trim() || null,
      unidad: formMaterial.unidad.trim() || "unidad",
      stock_minimo: num(formMaterial.stock_minimo),
    });
    if (error) return setErr(error.message);
    flash("✅ Material creado");
    setFormMaterial({ nombre: "", categoria: "", unidad: "unidad", stock_minimo: 0 });
    setShowNuevoMaterial(false);
    cargar();
  }

  const S = {
    page: { background: "#09090b", minHeight: "100vh", color: "#f4f4f5", fontFamily: "'Outfit', system-ui, sans-serif" },
    layout: { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main: { padding: 18, display: "flex", justifyContent: "center" },
    content: { width: "min(1300px, 100%)" },
    card: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, background: "rgba(255,255,255,0.03)", padding: 16, marginBottom: 12 },
    input: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#f4f4f5", padding: "9px 12px", borderRadius: 8, width: "100%", outline: "none", fontSize: 13, boxSizing: "border-box", fontFamily: "'Outfit', system-ui" },
    select: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#f4f4f5", padding: "9px 12px", borderRadius: 8, width: "100%", outline: "none", fontSize: 13, boxSizing: "border-box", fontFamily: "'Outfit', system-ui" },
    btn: { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "#f4f4f5", padding: "9px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Outfit', system-ui" },
    btnPrimary: { border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Outfit', system-ui" },
    btnSmall: (color) => ({ border: `1px solid ${color}40`, background: `${color}15`, color, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 11, marginRight: 4, fontFamily: "'Outfit', system-ui" }),
    row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
    row3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 9, color: "#71717a", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", textTransform: "uppercase", letterSpacing: 2 },
    td: { padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "middle", fontSize: 12 },
    small: { fontSize: 11, color: "#71717a" },
    label: { display: "block", fontSize: 9, color: "#71717a", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 },
    tab: (active) => ({
      padding: "6px 14px", borderRadius: 7,
      border: active ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.04)",
      background: active ? "rgba(255,255,255,0.08)" : "transparent",
      color: active ? "#f4f4f5" : "#71717a",
      cursor: "pointer", fontWeight: active ? 600 : 400, fontSize: 11, fontFamily: "'Outfit', system-ui",
    }),
    pillStock: (st) => {
      const cfg = { OK: ["rgba(16,185,129,0.1)","#10b981"], ATENCION: ["rgba(245,158,11,0.1)","#f59e0b"], CRITICO: ["rgba(239,68,68,0.1)","#ef4444"] }[st] || ["rgba(255,255,255,0.05)","#a1a1aa"];
      return { display: "inline-block", padding: "2px 9px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: cfg[0], color: cfg[1] };
    },
    btnExport: {
      border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)",
      color: "#a1a1aa", padding: "6px 14px", borderRadius: 8,
      cursor: "pointer", fontWeight: 600, fontSize: 11,
      display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'Outfit', system-ui",
    },
    pillPedido: (st) => {
      const cfg = { pendiente: ["rgba(245,158,11,0.1)","#f59e0b"], entregado: ["rgba(16,185,129,0.1)","#10b981"], cancelado: ["rgba(239,68,68,0.1)","#ef4444"] }[st] || ["rgba(255,255,255,0.05)","#a1a1aa"];
      return { display: "inline-block", padding: "2px 9px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: cfg[0], color: cfg[1] };
    },
  };

  const matOptions = materiales.map(m => (
    <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>
  ));

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        select option { background: #0f0f12; color: #a1a1aa; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        input:focus, select:focus, textarea:focus { border-color: rgba(59,130,246,0.35) !important; outline: none; }
        button:not([disabled]):hover { opacity: 0.8; }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
            radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%);
        }
        .lam-row:hover td { background: rgba(255,255,255,0.02) !important; }
      `}</style>
      <div className="bg-glow" />
      <div style={{ ...S.layout, position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <main style={S.main}>
          <div style={S.content}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <h1 style={{ fontFamily: "'Outfit', system-ui", fontSize: 18, margin: 0, color: "#f4f4f5", fontWeight: 700 }}>
                  Laminación
                </h1>
                <div style={S.small}>{esPanol ? "Ingresos · Egresos" : "Control de stock · Ingresos · Egresos · Pedidos"}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {isAdmin && (
                  <button style={S.btn} onClick={() => setShowNuevoMaterial(v => !v)}>
                    {showNuevoMaterial ? "✕ Cancelar" : "+ Nuevo material"}
                  </button>
                )}
                <button style={S.btn} onClick={cargar}>Refrescar</button>
              </div>
            </div>

            {err && <div style={{ ...S.card, borderColor: "#5a1d1d", color: "#ffbdbd" }}>{err}</div>}
            {msg && <div style={{ ...S.card, borderColor: "#1d5a2d", color: "#a6ffbf" }}>{msg}</div>}

            {/* Nuevo material */}
            {showNuevoMaterial && isAdmin && (
              <div style={S.card}>
                <h3 style={{ marginTop: 0, color: "#f4f4f5" }}>Nuevo material</h3>
                <form onSubmit={crearMaterial}>
                  <div style={S.row3}>
                    <div>
                      <label style={S.label}>Nombre</label>
                      <input style={S.input} placeholder="Ej: Mat 300"
                        value={formMaterial.nombre} onChange={e => setFormMaterial(f => ({ ...f, nombre: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Categoría</label>
                      <input style={S.input} placeholder="Telas / Resinas / Núcleos / Gel coats..."
                        value={formMaterial.categoria} onChange={e => setFormMaterial(f => ({ ...f, categoria: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Unidad</label>
                      <input style={S.input} placeholder="unidad / kg / m / l"
                        value={formMaterial.unidad} onChange={e => setFormMaterial(f => ({ ...f, unidad: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "flex-end" }}>
                    <div style={{ width: 200 }}>
                      <label style={S.label}>Stock mínimo</label>
                      <input style={S.input} type="number" step="0.01" value={formMaterial.stock_minimo}
                        onChange={e => setFormMaterial(f => ({ ...f, stock_minimo: e.target.value }))} />
                    </div>
                    <button type="submit" style={S.btnPrimary}>Crear material</button>
                  </div>
                </form>
              </div>
            )}

            {/* Buscador + Tabs */}
            <div style={S.card}>
              <input style={S.input} placeholder="Buscar material, proveedor, persona, obra, destino..."
                value={q} onChange={e => setQ(e.target.value)} />
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                {tabsDisponibles.map(t => (
                  <button key={t} style={S.tab(tab === t)} onClick={() => { setTab(t); setQ(""); }}>
                    {t}
                    {t === "Pedidos" && pedidos.filter(p => p.estado === "pendiente").length > 0 && (
                      <span style={{ marginLeft: 6, background: "#ffe7a6", color: "#000", borderRadius: 999, padding: "1px 6px", fontSize: 10, fontWeight: 900 }}>
                        {pedidos.filter(p => p.estado === "pendiente").length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ===== TAB STOCK ===== */}
            {tab === "Stock" && (
              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <h3 style={{ margin: 0, color: "#f4f4f5" }}>
                    Stock actual
                    <span style={{ ...S.small, marginLeft: 8 }}>({stockRows.length} materiales)</span>
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ color: "#a6ffbf", fontSize: 12 }}>● OK: {stockRows.filter(r => r.estado === "OK").length}</span>
                    <span style={{ color: "#ffe7a6", fontSize: 12 }}>● Atención: {stockRows.filter(r => r.estado === "ATENCION").length}</span>
                    <span style={{ color: "#ffbdbd", fontSize: 12 }}>● Crítico: {stockRows.filter(r => r.estado === "CRITICO").length}</span>
                    <button onClick={exportarStock} disabled={!stockRows.length} style={S.btnExport}>
                      ↓ CSV
                    </button>
                  </div>
                </div>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Material</th>
                      <th style={S.th}>Categoría</th>
                      <th style={S.th}>Stock actual</th>
                      <th style={S.th}>Mínimo</th>
                      <th style={S.th}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockRows.map(m => (
                      <tr key={m.id}>
                        <td style={S.td}>
                          <b style={{ color: "#f4f4f5" }}>{m.nombre}</b>
                          <div style={S.small}>{m.unidad}</div>
                        </td>
                        <td style={S.td}><span style={S.small}>{m.categoria || "—"}</span></td>
                        <td style={S.td}>
                          <b style={{
                            fontSize: 16,
                            color: m.stock <= 0 ? "#ff453a" : m.stock <= num(m.stock_minimo) ? "#ffd60a" : "#30d158"
                          }}>
                            {m.stock % 1 === 0 ? m.stock : m.stock.toFixed(2)}
                          </b>
                        </td>
                        <td style={S.td}><span style={S.small}>{num(m.stock_minimo)}</span></td>
                        <td style={S.td}><span style={S.pillStock(m.estado)}>{m.estado}</span></td>
                      </tr>
                    ))}
                    {!stockRows.length && (
                      <tr>
                        <td style={S.td} colSpan={5}>
                          <span style={S.small}>
                            {materiales.length === 0
                              ? "Sin materiales cargados. Usá '+ Nuevo material' o ejecutá el SQL de inicialización en Supabase."
                              : "Sin resultados para la búsqueda."}
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ===== TAB INGRESOS ===== */}
            {tab === "Ingresos" && (
              <>
                {puedeCargar && (
                  <div style={S.card}>
                    <h3 style={{ marginTop: 0, color: "#f4f4f5" }}>Registrar ingreso</h3>
                    <form onSubmit={crearIngreso}>
                      <div style={S.row3}>
                        <div>
                          <label style={S.label}>Material</label>
                          <select style={S.select} value={formIngreso.material_id}
                            onChange={e => setFormIngreso(f => ({ ...f, material_id: e.target.value }))}>
                            <option value="">— Seleccionar —</option>
                            {matOptions}
                          </select>
                        </div>
                        <div>
                          <label style={S.label}>Cantidad</label>
                          <input style={S.input} type="number" step="0.01" placeholder="0"
                            value={formIngreso.cantidad}
                            onChange={e => setFormIngreso(f => ({ ...f, cantidad: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Fecha</label>
                          <input style={S.input} type="date" value={formIngreso.fecha}
                            onChange={e => setFormIngreso(f => ({ ...f, fecha: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ ...S.row3, marginTop: 10 }}>
                        <div>
                          <label style={S.label}>Proveedor</label>
                          <input style={S.input} placeholder="ADS / Plaquimet / Del Bajo / Riedel..."
                            value={formIngreso.proveedor}
                            onChange={e => setFormIngreso(f => ({ ...f, proveedor: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Obra / Destino</label>
                          <input style={S.input} placeholder="STOCK / H167 / 37-26..."
                            value={formIngreso.obra}
                            onChange={e => setFormIngreso(f => ({ ...f, obra: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Observaciones</label>
                          <input style={S.input} placeholder="Nº de remito, lote, etc."
                            value={formIngreso.observaciones}
                            onChange={e => setFormIngreso(f => ({ ...f, observaciones: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button type="submit" style={S.btnPrimary}>+ Registrar ingreso</button>
                      </div>
                    </form>
                  </div>
                )}

                <div style={S.card}>
                  <h3 style={{ marginTop: 0, color: "#f4f4f5" }}>
                    Historial de ingresos
                    <span style={{ ...S.small, marginLeft: 8 }}>
                      ({movFiltrados.filter(m => m.tipo === "ingreso").length})
                    </span>
                  </h3>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Fecha</th>
                        <th style={S.th}>Material</th>
                        <th style={S.th}>Cantidad</th>
                        <th style={S.th}>Proveedor</th>
                        <th style={S.th}>Obra</th>
                        <th style={S.th}>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movFiltrados.filter(m => m.tipo === "ingreso").map(m => (
                        <tr key={m.id}>
                          <td style={S.td}>
                            <span style={S.small}>{fmtDate(m.fecha || m.created_at)}</span>
                            {m.created_at && (
                              <div style={{ fontSize: 10, color: "#555", marginTop: 2, fontFamily: "monospace" }}>
                                {new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            )}
                          </td>
                          <td style={S.td}>
                            <b style={{ color: "#f4f4f5" }}>{m.laminacion_materiales?.nombre ?? "—"}</b>
                            <div style={S.small}>{m.laminacion_materiales?.unidad}</div>
                          </td>
                          <td style={S.td}><b style={{ color: "#30d158", fontSize: 15 }}>+{num(m.cantidad)}</b></td>
                          <td style={S.td}><span style={S.small}>{m.proveedor || "—"}</span></td>
                          <td style={S.td}><span style={S.small}>{m.obra || "—"}</span></td>
                          <td style={S.td}><span style={S.small}>{m.observaciones || "—"}</span></td>
                        </tr>
                      ))}
                      {!movFiltrados.filter(m => m.tipo === "ingreso").length && (
                        <tr><td style={S.td} colSpan={6}><span style={S.small}>Sin ingresos registrados.</span></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ===== TAB EGRESOS ===== */}
            {tab === "Egresos" && (
              <>
                {puedeCargar && (
                  <div style={S.card}>
                    <h3 style={{ marginTop: 0, color: "#f4f4f5" }}>Registrar egreso</h3>
                    <form onSubmit={crearEgreso}>
                      <div style={S.row3}>
                        <div>
                          <label style={S.label}>Material</label>
                          <select style={S.select} value={formEgreso.material_id}
                            onChange={e => setFormEgreso(f => ({ ...f, material_id: e.target.value }))}>
                            <option value="">— Seleccionar —</option>
                            {matOptions}
                          </select>
                        </div>
                        <div>
                          <label style={S.label}>Cantidad</label>
                          <input style={S.input} type="number" step="0.01" placeholder="0"
                            value={formEgreso.cantidad}
                            onChange={e => setFormEgreso(f => ({ ...f, cantidad: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Fecha</label>
                          <input style={S.input} type="date" value={formEgreso.fecha}
                            onChange={e => setFormEgreso(f => ({ ...f, fecha: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ ...S.row3, marginTop: 10 }}>
                        <div>
                          <label style={S.label}>Destino / Barco</label>
                          <input style={S.input} placeholder="H167 / 37-26 / CHUBUT / OTROS..."
                            value={formEgreso.destino}
                            onChange={e => setFormEgreso(f => ({ ...f, destino: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Persona que retira</label>
                          <input style={S.input} placeholder="Nombre del operario..."
                            value={formEgreso.nombre_persona}
                            onChange={e => setFormEgreso(f => ({ ...f, nombre_persona: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Observaciones</label>
                          <input style={S.input} placeholder="SE TOMO DE STOCK / SE TOMO DE H167..."
                            value={formEgreso.observaciones}
                            onChange={e => setFormEgreso(f => ({ ...f, observaciones: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button type="submit" style={S.btnPrimary}>— Registrar egreso</button>
                      </div>
                    </form>
                  </div>
                )}

                <div style={S.card}>
                  <h3 style={{ marginTop: 0, color: "#f4f4f5" }}>
                    Historial de egresos
                    <span style={{ ...S.small, marginLeft: 8 }}>
                      ({movFiltrados.filter(m => m.tipo === "egreso").length})
                    </span>
                  </h3>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Fecha</th>
                        <th style={S.th}>Material</th>
                        <th style={S.th}>Cantidad</th>
                        <th style={S.th}>Persona</th>
                        <th style={S.th}>Destino</th>
                        <th style={S.th}>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movFiltrados.filter(m => m.tipo === "egreso").map(m => (
                        <tr key={m.id}>
                          <td style={S.td}>
                            <span style={S.small}>{fmtDate(m.fecha || m.created_at)}</span>
                            {m.created_at && (
                              <div style={{ fontSize: 10, color: "#555", marginTop: 2, fontFamily: "monospace" }}>
                                {new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            )}
                          </td>
                          <td style={S.td}>
                            <b style={{ color: "#f4f4f5" }}>{m.laminacion_materiales?.nombre ?? "—"}</b>
                            <div style={S.small}>{m.laminacion_materiales?.unidad}</div>
                          </td>
                          <td style={S.td}><b style={{ color: "#ff453a", fontSize: 15 }}>-{num(m.cantidad)}</b></td>
                          <td style={S.td}><span style={S.small}>{m.nombre_persona || "—"}</span></td>
                          <td style={S.td}><span style={S.small}>{m.destino || "—"}</span></td>
                          <td style={S.td}><span style={S.small}>{m.observaciones || "—"}</span></td>
                        </tr>
                      ))}
                      {!movFiltrados.filter(m => m.tipo === "egreso").length && (
                        <tr><td style={S.td} colSpan={6}><span style={S.small}>Sin egresos registrados.</span></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ===== TAB MOVIMIENTOS ===== */}
            {tab === "Movimientos" && (
              <>
                {/* ── Stats bar ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
                  {[
                    { label: "Total registros", val: movStats.total,    color: "#a0aabe" },
                    { label: "Ingresos",         val: movStats.ingresos, color: "#30d158" },
                    { label: "Egresos",          val: movStats.egresos,  color: "#ff453a" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{
                      ...S.card, marginBottom: 0, padding: "12px 16px",
                      borderLeft: `3px solid ${color}55`,
                      display: "flex", alignItems: "center", gap: 12,
                    }}>
                      <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{val}</span>
                      <span style={{ ...S.small, letterSpacing: 1 }}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* ── Buscador y filtros ── */}
                <div style={{ ...S.card, marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {/* Búsqueda */}
                    <div style={{ flex: "1 1 220px", position: "relative" }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.35, fontSize: 14, pointerEvents: "none" }}>⌕</span>
                      <input
                        style={{ ...S.input, paddingLeft: 34, fontSize: 13 }}
                        placeholder="Buscar material, persona, obra, proveedor…"
                        value={qMov}
                        onChange={e => setQMov(e.target.value)}
                      />
                    </div>

                    {/* Filtro tipo */}
                    <div style={{ display: "flex", gap: 4 }}>
                      {[
                        { val: "todos",   label: "Todos"    },
                        { val: "ingreso", label: "↑ Ing",   color: "#30d158" },
                        { val: "egreso",  label: "↓ Egr",   color: "#ff453a" },
                      ].map(({ val, label, color }) => (
                        <button key={val} onClick={() => setFiltroTipo(val)} style={{
                          padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600,
                          border: filtroTipo === val
                            ? `1px solid ${color ?? "rgba(255,255,255,0.15)"}`
                            : "1px solid rgba(255,255,255,0.04)",
                          background: filtroTipo === val
                            ? color ? `${color}18` : "rgba(255,255,255,0.06)"
                            : "transparent",
                          color: filtroTipo === val ? (color ?? "#f4f4f5") : "#71717a",
                          fontFamily: "'Outfit', system-ui",
                        }}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Filtro material */}
                    <select
                      value={filtroMatId}
                      onChange={e => setFiltroMatId(e.target.value)}
                      style={{ ...S.select, flex: "1 1 180px", maxWidth: 220, fontSize: 13 }}
                    >
                      <option value="">Todos los materiales</option>
                      {materiales.map(m => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>

                    {/* Orden fecha */}
                    <button onClick={() => setMovSort(s => s === "fecha_desc" ? "fecha_asc" : "fecha_desc")} style={{
                      ...S.btn, padding: "8px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5,
                      color: "#aaa", flexShrink: 0,
                    }}>
                      {movSort === "fecha_desc" ? "↓ Más reciente" : "↑ Más antiguo"}
                    </button>

                    {/* Reset filtros */}
                    {(qMov || filtroTipo !== "todos" || filtroMatId) && (
                      <button onClick={() => { setQMov(""); setFiltroTipo("todos"); setFiltroMatId(""); }}
                        style={{ ...S.btn, padding: "8px 12px", fontSize: 12, color: "#888", flexShrink: 0 }}>
                        ✕ Limpiar
                      </button>
                    )}
                    <button onClick={exportarMovimientos} disabled={!movimientosFiltrados.length} style={{ ...S.btnExport, flexShrink: 0 }}>
                      ↓ Exportar CSV
                    </button>
                  </div>

                  {/* Resultado del filtro */}
                  {movStats.enFiltro !== movStats.total && (
                    <div style={{ marginTop: 10, fontSize: 11, color: "#666" }}>
                      Mostrando <strong style={{ color: "#aaa" }}>{movStats.enFiltro}</strong> de {movStats.total} registros
                    </div>
                  )}

                  {/* ── Exportar ── */}
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1a1a1a", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "#444", letterSpacing: 1.5, textTransform: "uppercase", marginRight: 2 }}>Exportar</span>
                    <button
                      onClick={() => exportarMovimientos(true)}
                      disabled={movimientosFiltrados.length === 0}
                      style={{
                        border: movimientosFiltrados.length > 0 ? "1px solid rgba(48,209,88,0.28)" : "1px solid #2a2a2a",
                        background: movimientosFiltrados.length > 0 ? "rgba(48,209,88,0.07)" : "transparent",
                        color: movimientosFiltrados.length > 0 ? "#a6ffbf" : "#444",
                        padding: "7px 14px", borderRadius: 10, cursor: movimientosFiltrados.length > 0 ? "pointer" : "not-allowed",
                        fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      ↓ CSV
                      <span style={{ fontSize: 10, opacity: 0.7 }}>
                        {movStats.enFiltro !== movStats.total
                          ? `${movStats.enFiltro} filtrados`
                          : `${movStats.total} registros`}
                      </span>
                    </button>
                    {movStats.enFiltro !== movStats.total && (
                      <button
                        onClick={() => exportarMovimientos(false)}
                        style={{
                          border: "1px solid #2a2a2a", background: "transparent",
                          color: "#666", padding: "7px 14px", borderRadius: 10,
                          cursor: "pointer", fontSize: 12, fontWeight: 700,
                        }}
                      >
                        ↓ CSV completo ({movStats.total})
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Tabla ── */}
                <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ ...S.table, fontSize: 13, minWidth: 700 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #1e1e1e" }}>
                          {[
                            { key: "fecha",    label: "Fecha"            },
                            { key: "tipo",     label: "Tipo"             },
                            { key: "material", label: "Material"         },
                            { key: "cantidad", label: "Cantidad"         },
                            { key: "origen",   label: "Proveedor / Dest" },
                            { key: "persona",  label: "Persona"          },
                            { key: "obra",     label: "Obra"             },
                            { key: "obs",      label: "Obs"              },
                          ].map(col => (
                            <th key={col.key} style={{
                              ...S.th, padding: "12px 14px",
                              background: "rgba(0,0,0,0.4)",
                              position: "sticky", top: 0,
                              whiteSpace: "nowrap",
                            }}>
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {movimientosFiltrados.map((m, idx) => {
                          const esIngreso = m.tipo === "ingreso";
                          return (
                            <tr key={m.id} style={{
                              borderBottom: "1px solid #111",
                              background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)",
                              transition: "background 0.1s",
                            }}>
                              <td style={{ ...S.td, padding: "10px 14px", whiteSpace: "nowrap", color: "#888", fontFamily: "monospace", fontSize: 12 }}>
                                {fmtDate(m.fecha || m.created_at)}
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px" }}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: 1,
                                  background: esIngreso ? "rgba(48,209,88,0.1)" : "rgba(255,69,58,0.09)",
                                  color: esIngreso ? "#30d158" : "#ff453a",
                                  border: esIngreso ? "1px solid rgba(48,209,88,0.22)" : "1px solid rgba(255,69,58,0.22)",
                                }}>
                                  {esIngreso ? "↑" : "↓"} {esIngreso ? "ING" : "EGR"}
                                </span>
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px" }}>
                                <span style={{ color: "#e0e0e0", fontWeight: 500 }}>
                                  {m.laminacion_materiales?.nombre ?? <span style={{ opacity: 0.3 }}>—</span>}
                                </span>
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px", whiteSpace: "nowrap" }}>
                                <span style={{
                                  fontFamily: "monospace", fontSize: 13, fontWeight: 700,
                                  color: esIngreso ? "#30d158" : "#ff453a",
                                }}>
                                  {esIngreso ? "+" : "−"}{m.cantidad}
                                </span>
                                <span style={{ fontSize: 11, color: "#555", marginLeft: 4 }}>
                                  {m.laminacion_materiales?.unidad ?? ""}
                                </span>
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px", maxWidth: 160 }}>
                                <span style={{ color: "#aaa", fontSize: 12 }}>
                                  {esIngreso ? (m.proveedor || <span style={{ opacity: 0.25 }}>—</span>) : (m.destino || <span style={{ opacity: 0.25 }}>—</span>)}
                                </span>
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px" }}>
                                <span style={{ color: "#aaa", fontSize: 12 }}>{m.nombre_persona || <span style={{ opacity: 0.25 }}>—</span>}</span>
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px" }}>
                                {m.obra
                                  ? <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "#ccc", fontSize: 11, fontFamily: "monospace" }}>{m.obra}</span>
                                  : <span style={{ opacity: 0.2, fontSize: 12 }}>—</span>
                                }
                              </td>
                              <td style={{ ...S.td, padding: "10px 14px", maxWidth: 180 }}>
                                <span style={{ color: "#666", fontSize: 11, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {m.observaciones || <span style={{ opacity: 0.2 }}>—</span>}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {movimientosFiltrados.length === 0 && (
                      <div style={{ padding: "40px 20px", textAlign: "center" }}>
                        <div style={{ fontSize: 13, color: "#444", letterSpacing: 1 }}>
                          {movimientos.length === 0
                            ? "Sin movimientos registrados"
                            : "Sin resultados · probá cambiando los filtros"}
                        </div>
                        {(qMov || filtroTipo !== "todos" || filtroMatId) && (
                          <button onClick={() => { setQMov(""); setFiltroTipo("todos"); setFiltroMatId(""); }}
                            style={{ marginTop: 12, ...S.btn, fontSize: 12 }}>
                            Limpiar filtros
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ===== TAB PEDIDOS ===== */}
            {tab === "Pedidos" && (
              <>
                {puedeCargar && (
                  <div style={S.card}>
                    <h3 style={{ marginTop: 0, color: "#f4f4f5" }}>Nuevo pedido</h3>
                    <form onSubmit={crearPedido}>
                      <div style={S.row3}>
                        <div>
                          <label style={S.label}>Material</label>
                          <select style={S.select} value={formPedido.material_id}
                            onChange={e => setFormPedido(f => ({ ...f, material_id: e.target.value }))}>
                            <option value="">— Seleccionar —</option>
                            {matOptions}
                          </select>
                        </div>
                        <div>
                          <label style={S.label}>Cantidad</label>
                          <input style={S.input} type="number" step="0.01" placeholder="0"
                            value={formPedido.cantidad}
                            onChange={e => setFormPedido(f => ({ ...f, cantidad: e.target.value }))} />
                        </div>
                        <div>
                          <label style={S.label}>Observaciones</label>
                          <input style={S.input} placeholder="Urgente, para barco X, ref. anterior..."
                            value={formPedido.observaciones}
                            onChange={e => setFormPedido(f => ({ ...f, observaciones: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button type="submit" style={S.btnPrimary}>Crear pedido</button>
                      </div>
                    </form>
                  </div>
                )}

                <div style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ margin: 0, color: "#f4f4f5" }}>Pedidos</h3>
                    <button onClick={exportarPedidos} disabled={!pedidosFiltrados.length} style={S.btnExport}>
                      ↓ Exportar CSV
                    </button>
                  </div>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Fecha</th>
                        <th style={S.th}>Material</th>
                        <th style={S.th}>Cantidad</th>
                        <th style={S.th}>Estado</th>
                        <th style={S.th}>Observaciones</th>
                        <th style={S.th}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosFiltrados.map(p => (
                        <tr key={p.id}>
                          <td style={S.td}><span style={S.small}>{fmtTs(p.created_at)}</span></td>
                          <td style={S.td}>
                            <b style={{ color: "#f4f4f5" }}>{p.laminacion_materiales?.nombre ?? "—"}</b>
                            <div style={S.small}>{p.laminacion_materiales?.unidad}</div>
                          </td>
                          <td style={S.td}>{num(p.cantidad)}</td>
                          <td style={S.td}><span style={S.pillPedido(p.estado)}>{p.estado}</span></td>
                          <td style={S.td}><span style={S.small}>{p.observaciones || "—"}</span></td>
                          <td style={S.td}>
                            {p.estado === "pendiente" && (isAdmin || role === "admin" || role === "oficina") && (
                              <>
                                <button style={S.btnSmall("#30d158")} onClick={() => setEstadoPedido(p.id, "entregado")}>
                                  ✅ Entregado
                                </button>
                                <button style={S.btnSmall("#ff453a")} onClick={() => setEstadoPedido(p.id, "cancelado")}>
                                  Cancelar
                                </button>
                              </>
                            )}
                            {p.estado !== "pendiente" && (isAdmin || role === "admin") && (
                              <button style={S.btnSmall("#ffd60a")} onClick={() => setEstadoPedido(p.id, "pendiente")}>
                                Reabrir
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!pedidosFiltrados.length && (
                        <tr><td style={S.td} colSpan={6}><span style={S.small}>Sin pedidos registrados.</span></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
