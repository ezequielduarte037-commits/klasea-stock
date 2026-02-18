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
  return new Date(ts).toLocaleDateString("es-AR");
}

function fmtTs(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-AR");
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
    fecha: new Date().toISOString().slice(0, 10),
    proveedor: "", obra: "", observaciones: "",
  });
  const [formEgreso, setFormEgreso] = useState({
    material_id: "", cantidad: "",
    fecha: new Date().toISOString().slice(0, 10),
    destino: "", nombre_persona: "", observaciones: "",
  });
  const [formPedido, setFormPedido] = useState({ material_id: "", cantidad: "", observaciones: "" });
  const [formMaterial, setFormMaterial] = useState({ nombre: "", categoria: "", unidad: "unidad", stock_minimo: 0 });

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
    page: { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout: { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main: { padding: 18, display: "flex", justifyContent: "center" },
    content: { width: "min(1300px, 100%)" },
    card: { border: "1px solid #2a2a2a", borderRadius: 16, background: "#070707", padding: 16, marginBottom: 12 },
    input: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#eaeaea", padding: "10px 12px", borderRadius: 12, width: "100%", outline: "none", fontSize: 14, boxSizing: "border-box" },
    select: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#eaeaea", padding: "10px 12px", borderRadius: 12, width: "100%", outline: "none", fontSize: 14, boxSizing: "border-box" },
    btn: { border: "1px solid #2a2a2a", background: "#111", color: "#fff", padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 900, fontSize: 13 },
    btnPrimary: { border: "1px solid rgba(255,255,255,0.2)", background: "#fff", color: "#000", padding: "10px 18px", borderRadius: 12, cursor: "pointer", fontWeight: 900, fontSize: 13 },
    btnSmall: (color) => ({ border: `1px solid ${color}40`, background: `${color}18`, color, padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 11, marginRight: 4 }),
    row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
    row3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 11, opacity: 0.65, padding: "10px 8px", borderBottom: "1px solid #1d1d1d", textTransform: "uppercase", letterSpacing: 1 },
    td: { padding: "10px 8px", borderBottom: "1px solid #0f0f0f", verticalAlign: "middle", fontSize: 13 },
    small: { fontSize: 12, opacity: 0.65 },
    label: { display: "block", fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 },
    tab: (active) => ({
      padding: "9px 16px", borderRadius: 12, border: "1px solid #2a2a2a",
      background: active ? "#fff" : "transparent",
      color: active ? "#000" : "#bdbdbd",
      cursor: "pointer", fontWeight: 800, fontSize: 13,
    }),
    pillStock: (st) => {
      const cfg = { OK: ["#0b2512", "#a6ffbf"], ATENCION: ["#2a1f00", "#ffe7a6"], CRITICO: ["#2a0b0b", "#ffbdbd"] }[st] || ["#111", "#fff"];
      return { display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 900, background: cfg[0], color: cfg[1] };
    },
    pillPedido: (st) => {
      const cfg = { pendiente: ["#2a1f00", "#ffe7a6"], entregado: ["#0b2512", "#a6ffbf"], cancelado: ["#2a0b0b", "#ffbdbd"] }[st] || ["#111", "#fff"];
      return { display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 900, background: cfg[0], color: cfg[1] };
    },
  };

  const matOptions = materiales.map(m => (
    <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>
  ));

  return (
    <div style={S.page}>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />

        <main style={S.main}>
          <div style={S.content}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <h1 style={{ fontFamily: "Montserrat, system-ui, Arial", fontSize: 20, margin: 0, color: "#fff" }}>
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
                <h3 style={{ marginTop: 0, color: "#fff" }}>Nuevo material</h3>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ margin: 0, color: "#fff" }}>
                    Stock actual
                    <span style={{ ...S.small, marginLeft: 8 }}>({stockRows.length} materiales)</span>
                  </h3>
                  <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
                    <span style={{ color: "#a6ffbf" }}>● OK: {stockRows.filter(r => r.estado === "OK").length}</span>
                    <span style={{ color: "#ffe7a6" }}>● Atención: {stockRows.filter(r => r.estado === "ATENCION").length}</span>
                    <span style={{ color: "#ffbdbd" }}>● Crítico: {stockRows.filter(r => r.estado === "CRITICO").length}</span>
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
                          <b style={{ color: "#fff" }}>{m.nombre}</b>
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
                    <h3 style={{ marginTop: 0, color: "#fff" }}>Registrar ingreso</h3>
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
                  <h3 style={{ marginTop: 0, color: "#fff" }}>
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
                          <td style={S.td}><span style={S.small}>{fmtDate(m.fecha || m.created_at)}</span></td>
                          <td style={S.td}>
                            <b style={{ color: "#fff" }}>{m.laminacion_materiales?.nombre ?? "—"}</b>
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
                    <h3 style={{ marginTop: 0, color: "#fff" }}>Registrar egreso</h3>
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
                  <h3 style={{ marginTop: 0, color: "#fff" }}>
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
                          <td style={S.td}><span style={S.small}>{fmtDate(m.fecha || m.created_at)}</span></td>
                          <td style={S.td}>
                            <b style={{ color: "#fff" }}>{m.laminacion_materiales?.nombre ?? "—"}</b>
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
              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ margin: 0, color: "#fff" }}>
                    Movimientos
                    <span style={{ ...S.small, marginLeft: 8 }}>({movimientos.length} registros)</span>
                  </h3>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                        {["Fecha","Tipo","Material","Cantidad","Proveedor / Destino","Persona","Obra","Obs"].map(h => (
                          <th key={h} style={{ ...S.label, padding: "6px 10px", textAlign: "left", fontWeight: 700 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {movimientos
                        .filter(m => {
                          const qq = q.toLowerCase();
                          if (!qq) return true;
                          return [
                            m.laminacion_materiales?.nombre,
                            m.proveedor, m.destino, m.nombre_persona, m.obra, m.observaciones
                          ].some(v => (v ?? "").toLowerCase().includes(qq));
                        })
                        .map(m => {
                          const esIngreso = m.tipo === "ingreso";
                          return (
                            <tr key={m.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                              <td style={{ padding: "8px 10px", opacity: 0.7 }}>{fmtDate(m.fecha || m.created_at)}</td>
                              <td style={{ padding: "8px 10px" }}>
                                <span style={{
                                  padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                                  background: esIngreso ? "rgba(48,209,88,0.12)" : "rgba(255,69,58,0.10)",
                                  color: esIngreso ? "#30d158" : "#ff453a",
                                  border: esIngreso ? "1px solid rgba(48,209,88,0.25)" : "1px solid rgba(255,69,58,0.25)",
                                }}>
                                  {esIngreso ? "ING" : "EGR"}
                                </span>
                              </td>
                              <td style={{ padding: "8px 10px", color: "#fff", fontWeight: 500 }}>{m.laminacion_materiales?.nombre ?? "—"}</td>
                              <td style={{ padding: "8px 10px" }}>{m.cantidad} {m.laminacion_materiales?.unidad ?? ""}</td>
                              <td style={{ padding: "8px 10px", opacity: 0.8 }}>{esIngreso ? (m.proveedor ?? "—") : (m.destino ?? "—")}</td>
                              <td style={{ padding: "8px 10px", opacity: 0.8 }}>{m.nombre_persona ?? "—"}</td>
                              <td style={{ padding: "8px 10px", opacity: 0.8 }}>{m.obra ?? "—"}</td>
                              <td style={{ padding: "8px 10px", opacity: 0.6 }}>{m.observaciones ?? "—"}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {movimientos.length === 0 && (
                    <div style={{ padding: 20, opacity: 0.5, textAlign: "center" }}>Sin movimientos registrados.</div>
                  )}
                </div>
              </div>
            )}

            {/* ===== TAB PEDIDOS ===== */}
            {tab === "Pedidos" && (
              <>
                {puedeCargar && (
                  <div style={S.card}>
                    <h3 style={{ marginTop: 0, color: "#fff" }}>Nuevo pedido</h3>
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
                  <h3 style={{ marginTop: 0, color: "#fff" }}>Pedidos</h3>
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
                            <b style={{ color: "#fff" }}>{p.laminacion_materiales?.nombre ?? "—"}</b>
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
