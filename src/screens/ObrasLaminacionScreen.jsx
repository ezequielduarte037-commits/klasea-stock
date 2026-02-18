import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR");
}

const ESTADO_STYLE = {
  activa:     { bg: "rgba(48,209,88,0.12)",  color: "#30d158", border: "rgba(48,209,88,0.3)"  },
  pausada:    { bg: "rgba(255,214,10,0.12)", color: "#ffd60a", border: "rgba(255,214,10,0.3)" },
  terminada:  { bg: "rgba(120,120,120,0.12)",color: "#888",    border: "rgba(120,120,120,0.3)"},
};

export default function ObrasLaminacionScreen({ profile, signOut }) {
  const role    = profile?.role ?? "invitado";
  const isAdmin = !!profile?.is_admin;
  const esGestion = isAdmin || role === "admin" || role === "oficina";

  // ── DATA ──────────────────────────────────────────────────
  const [obras,      setObras]      = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [obraMats,   setObraMats]   = useState([]); // laminacion_obra_materiales
  const [movimientos,setMovimientos]= useState([]);

  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");
  const [msg,     setMsg]     = useState("");

  // ── UI STATE ──────────────────────────────────────────────
  const [obraSelId, setObraSelId] = useState(null);
  const [q,         setQ]         = useState("");

  // Formulario nueva obra
  const [showNuevaObra,    setShowNuevaObra]    = useState(false);
  const [formObra,         setFormObra]         = useState({
    nombre: "", descripcion: "", estado: "activa",
    fecha_inicio: new Date().toISOString().slice(0,10), fecha_fin: "",
  });

  // Editar cantidad necesaria inline
  const [editNec, setEditNec] = useState({}); // { [obra_id + material_id]: value }
  const [savingNec, setSavingNec] = useState(false);

  // ── CARGA ─────────────────────────────────────────────────
  async function cargar() {
    setLoading(true);
    setErr("");
    const [r1, r2, r3, r4] = await Promise.all([
      supabase.from("laminacion_obras").select("*").order("created_at", { ascending: false }),
      supabase.from("laminacion_materiales").select("*").order("nombre"),
      supabase.from("laminacion_obra_materiales").select("*"),
      supabase.from("laminacion_movimientos")
        .select("material_id, tipo, cantidad, obra")
        .not("obra", "is", null),
    ]);
    if (r1.error) return setErr(r1.error.message);
    setObras(r1.data ?? []);
    setMateriales(r2.data ?? []);
    setObraMats(r3.data ?? []);
    setMovimientos(r4.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
    const ch = supabase.channel("rt-obras-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_obras" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_obra_materiales" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_movimientos" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ── OBRA SELECCIONADA ─────────────────────────────────────
  const obraSel = useMemo(() => obras.find(o => o.id === obraSelId), [obras, obraSelId]);

  // ── CALCULAR TABLA POR OBRA ───────────────────────────────
  // Para cada material: necesario, ingresado, egresado, falta_ingresar, falta_usar
  const tablaObra = useMemo(() => {
    if (!obraSel) return [];

    // Materiales configurados para esta obra
    const configMats = obraMats.filter(om => om.obra_id === obraSel.id);

    // Materiales que tienen movimientos en esta obra (aunque no estén configurados)
    const matsConMovs = new Set(
      movimientos
        .filter(m => (m.obra ?? "").trim().toLowerCase() === obraSel.nombre.trim().toLowerCase())
        .map(m => m.material_id)
    );

    // Unión: configurados + los que tienen movimientos
    const matIdsSet = new Set([
      ...configMats.map(cm => cm.material_id),
      ...matsConMovs,
    ]);

    return Array.from(matIdsSet).map(matId => {
      const mat   = materiales.find(m => m.id === matId);
      const config = configMats.find(cm => cm.material_id === matId);
      const necesario = num(config?.cantidad_necesaria ?? 0);

      const movsObra = movimientos.filter(m =>
        m.material_id === matId &&
        (m.obra ?? "").trim().toLowerCase() === obraSel.nombre.trim().toLowerCase()
      );

      const ingresado = movsObra
        .filter(m => m.tipo === "ingreso")
        .reduce((s, m) => s + num(m.cantidad), 0);

      const egresado = movsObra
        .filter(m => m.tipo === "egreso")
        .reduce((s, m) => s + num(m.cantidad), 0);

      const faltaIngresar = Math.max(0, necesario - ingresado);
      const faltaUsar     = Math.max(0, necesario - egresado);
      const sobrante      = Math.max(0, ingresado - necesario);

      // Alertas
      const alertaCritica = necesario > 0 && faltaIngresar > necesario * 0.5;
      const alertaMedia   = necesario > 0 && faltaIngresar > 0;

      return {
        matId, mat,
        necesario, ingresado, egresado,
        faltaIngresar, faltaUsar, sobrante,
        alertaCritica, alertaMedia,
        configId: config?.id ?? null,
      };
    }).filter(r => r.mat) // descartar materiales borrados
      .sort((a, b) => (a.mat?.nombre ?? "").localeCompare(b.mat?.nombre ?? ""));
  }, [obraSel, obraMats, movimientos, materiales]);

  // ── RESUMEN ALERTAS POR OBRA (para la lista) ──────────────
  const alertasPorObra = useMemo(() => {
    const map = {};
    obras.forEach(o => {
      const configMats = obraMats.filter(om => om.obra_id === o.id);
      const criticas = configMats.filter(cm => {
        const necesario = num(cm.cantidad_necesaria);
        if (!necesario) return false;
        const ingresado = movimientos
          .filter(m => m.material_id === cm.material_id && m.tipo === "ingreso" &&
            (m.obra ?? "").trim().toLowerCase() === o.nombre.trim().toLowerCase())
          .reduce((s, m) => s + num(m.cantidad), 0);
        return ingresado < necesario * 0.5;
      }).length;
      const pendientes = configMats.filter(cm => {
        const necesario = num(cm.cantidad_necesaria);
        if (!necesario) return false;
        const ingresado = movimientos
          .filter(m => m.material_id === cm.material_id && m.tipo === "ingreso" &&
            (m.obra ?? "").trim().toLowerCase() === o.nombre.trim().toLowerCase())
          .reduce((s, m) => s + num(m.cantidad), 0);
        return ingresado < necesario;
      }).length;
      map[o.id] = { criticas, pendientes };
    });
    return map;
  }, [obras, obraMats, movimientos]);

  // ── CREAR OBRA ────────────────────────────────────────────
  async function crearObra(e) {
    e.preventDefault();
    if (!formObra.nombre.trim()) return setErr("El nombre de la obra es obligatorio.");
    const { error } = await supabase.from("laminacion_obras").insert({
      nombre:      formObra.nombre.trim().toUpperCase(),
      descripcion: formObra.descripcion.trim() || null,
      estado:      formObra.estado,
      fecha_inicio: formObra.fecha_inicio || null,
      fecha_fin:   formObra.fecha_fin || null,
    });
    if (error) return setErr(error.message);
    setMsg(`✅ Obra ${formObra.nombre.toUpperCase()} creada.`);
    setFormObra({ nombre: "", descripcion: "", estado: "activa",
      fecha_inicio: new Date().toISOString().slice(0,10), fecha_fin: "" });
    setShowNuevaObra(false);
    await cargar();
  }

  // ── CAMBIAR ESTADO OBRA ───────────────────────────────────
  async function cambiarEstado(obraId, nuevoEstado) {
    const upd = { estado: nuevoEstado };
    if (nuevoEstado === "terminada") upd.fecha_fin = new Date().toISOString().slice(0,10);
    const { error } = await supabase.from("laminacion_obras").update(upd).eq("id", obraId);
    if (error) setErr(error.message);
    else await cargar();
  }

  // ── GUARDAR CANTIDAD NECESARIA ────────────────────────────
  async function guardarNecesaria(obraId, matId, configId, valor) {
    setSavingNec(true);
    const cantidad = num(valor);
    let error;
    if (configId) {
      ({ error } = await supabase.from("laminacion_obra_materiales")
        .update({ cantidad_necesaria: cantidad })
        .eq("id", configId));
    } else {
      ({ error } = await supabase.from("laminacion_obra_materiales")
        .insert({ obra_id: obraId, material_id: matId, cantidad_necesaria: cantidad }));
    }
    setSavingNec(false);
    if (error) setErr(error.message);
    else await cargar();
  }

  // ── OBRAS FILTRADAS ───────────────────────────────────────
  const obrasFiltradas = useMemo(() => {
    const qq = q.toLowerCase();
    if (!qq) return obras;
    return obras.filter(o =>
      o.nombre.toLowerCase().includes(qq) ||
      (o.descripcion ?? "").toLowerCase().includes(qq)
    );
  }, [obras, q]);

  // ── ESTILOS ───────────────────────────────────────────────
  const S = {
    page:    { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:    { padding: 20, overflow: "auto" },
    content: { width: "min(1400px, 100%)", margin: "0 auto" },

    card:    { border: "1px solid #1e1e1e", borderRadius: 14, background: "#070707", padding: 16, marginBottom: 14 },
    input:   { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#fff", padding: "9px 12px", borderRadius: 10, width: "100%", fontSize: 13 },
    label:   { fontSize: 10, letterSpacing: 1.5, opacity: 0.5, display: "block", marginBottom: 4 },
    btn:     { border: "1px solid #2a2a2a", background: "#111", color: "#fff", padding: "9px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 },
    btnPrimary: { border: "1px solid rgba(255,255,255,0.15)", background: "#fff", color: "#000", padding: "9px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 900, fontSize: 13 },
    small:   { fontSize: 11, opacity: 0.45 },

    split:   { display: "grid", gridTemplateColumns: "320px 1fr", gap: 14, alignItems: "start" },

    obraCard: (sel) => ({
      border: sel ? "1px solid #444" : "1px solid #1a1a1a",
      borderRadius: 12, background: sel ? "#111" : "#080808",
      padding: "12px 14px", cursor: "pointer", marginBottom: 8,
      transition: "all 0.12s",
    }),

    estadoBadge: (estado) => {
      const st = ESTADO_STYLE[estado] ?? ESTADO_STYLE.activa;
      return {
        display: "inline-block", padding: "2px 8px", borderRadius: 999,
        fontSize: 10, fontWeight: 700, letterSpacing: 1,
        background: st.bg, color: st.color,
        border: `1px solid ${st.border}`,
      };
    },

    alertBadge: (tipo) => ({
      display: "inline-block", marginLeft: 6,
      padding: "2px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700,
      background: tipo === "critica" ? "rgba(255,69,58,0.15)" : "rgba(255,214,10,0.12)",
      color:      tipo === "critica" ? "#ff453a" : "#ffd60a",
      border:     tipo === "critica" ? "1px solid rgba(255,69,58,0.3)" : "1px solid rgba(255,214,10,0.3)",
    }),

    // Tabla Excel
    th: { padding: "8px 12px", textAlign: "left", fontSize: 10, letterSpacing: 1.5, opacity: 0.5, fontWeight: 700, borderBottom: "1px solid #1a1a1a", whiteSpace: "nowrap" },
    td: { padding: "9px 12px", fontSize: 13, borderBottom: "1px solid #111" },

    progBar: (pct) => ({
      height: 4, borderRadius: 99, background: "#1a1a1a", width: "100%", overflow: "hidden",
      position: "relative",
    }),
    progFill: (pct) => ({
      position: "absolute", left: 0, top: 0, height: "100%",
      width: `${Math.min(100, pct)}%`,
      background: pct >= 100 ? "#30d158" : pct >= 50 ? "#ffd60a" : "#ff453a",
      borderRadius: 99,
      transition: "width 0.4s ease",
    }),
  };

  // ── RENDER ────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={S.main}>
          <div style={S.content}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h1 style={{ fontFamily: "Montserrat, system-ui, Arial", fontSize: 20, margin: 0, color: "#fff" }}>
                  Obras · Laminación
                </h1>
                <div style={S.small}>Control por línea de producción · Materiales necesarios · Alertas</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {esGestion && (
                  <button style={S.btn} onClick={() => setShowNuevaObra(v => !v)}>
                    {showNuevaObra ? "✕ Cancelar" : "+ Nueva obra"}
                  </button>
                )}
                <button style={S.btn} onClick={cargar}>↻ Refrescar</button>
              </div>
            </div>

            {err && <div style={{ ...S.card, borderColor: "#5a1d1d", color: "#ffbdbd", marginBottom: 10 }}>{err}</div>}
            {msg && <div style={{ ...S.card, borderColor: "#1d5a2d", color: "#a6ffbf", marginBottom: 10 }}>{msg}</div>}

            {/* Formulario nueva obra */}
            {showNuevaObra && esGestion && (
              <div style={S.card}>
                <h3 style={{ margin: "0 0 14px", color: "#fff" }}>Nueva obra</h3>
                <form onSubmit={crearObra}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={S.label}>Nombre / Código</label>
                      <input style={S.input} placeholder="Ej: K37" required
                        value={formObra.nombre} onChange={e => setFormObra(f => ({ ...f, nombre: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Descripción</label>
                      <input style={S.input} placeholder="Ej: Klase 37 – Casco 3"
                        value={formObra.descripcion} onChange={e => setFormObra(f => ({ ...f, descripcion: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Estado</label>
                      <select style={S.input} value={formObra.estado} onChange={e => setFormObra(f => ({ ...f, estado: e.target.value }))}>
                        <option value="activa">Activa</option>
                        <option value="pausada">Pausada</option>
                        <option value="terminada">Terminada</option>
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Fecha inicio</label>
                      <input style={S.input} type="date"
                        value={formObra.fecha_inicio} onChange={e => setFormObra(f => ({ ...f, fecha_inicio: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Fecha fin (est.)</label>
                      <input style={S.input} type="date"
                        value={formObra.fecha_fin} onChange={e => setFormObra(f => ({ ...f, fecha_fin: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <button type="submit" style={S.btnPrimary}>Crear obra</button>
                  </div>
                </form>
              </div>
            )}

            {loading ? (
              <div style={{ ...S.card, textAlign: "center", opacity: 0.5 }}>Cargando obras…</div>
            ) : (
              <div style={S.split}>

                {/* ── LISTA DE OBRAS ── */}
                <div>
                  <div style={{ marginBottom: 10 }}>
                    <input style={S.input} placeholder="Buscar obra…" value={q} onChange={e => setQ(e.target.value)} />
                  </div>
                  {obrasFiltradas.length === 0 && (
                    <div style={{ ...S.card, opacity: 0.5, textAlign: "center" }}>Sin obras. Creá la primera arriba.</div>
                  )}
                  {obrasFiltradas.map(o => {
                    const alerts = alertasPorObra[o.id] ?? { criticas: 0, pendientes: 0 };
                    const sel = obraSelId === o.id;
                    return (
                      <div key={o.id} style={S.obraCard(sel)} onClick={() => setObraSelId(sel ? null : o.id)}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, fontFamily: "Montserrat, system-ui" }}>
                              {o.nombre}
                            </div>
                            {o.descripcion && <div style={{ ...S.small, marginTop: 2 }}>{o.descripcion}</div>}
                          </div>
                          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <span style={S.estadoBadge(o.estado)}>{o.estado.toUpperCase()}</span>
                            {alerts.criticas > 0 && (
                              <span style={S.alertBadge("critica")}>⚠ {alerts.criticas} crítico{alerts.criticas > 1 ? "s" : ""}</span>
                            )}
                            {alerts.pendientes > 0 && alerts.criticas === 0 && (
                              <span style={S.alertBadge("media")}>● {alerts.pendientes} faltante{alerts.pendientes > 1 ? "s" : ""}</span>
                            )}
                          </div>
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 14, fontSize: 11, opacity: 0.5 }}>
                          {o.fecha_inicio && <span>Inicio: {fmtDate(o.fecha_inicio)}</span>}
                          {o.fecha_fin    && <span>Fin est.: {fmtDate(o.fecha_fin)}</span>}
                        </div>

                        {/* Acciones de estado */}
                        {sel && esGestion && (
                          <div style={{ marginTop: 10, display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                            {o.estado !== "activa"    && <button style={{ ...S.btn, fontSize: 11, padding: "5px 10px" }} onClick={() => cambiarEstado(o.id, "activa")}>▶ Activar</button>}
                            {o.estado !== "pausada"   && <button style={{ ...S.btn, fontSize: 11, padding: "5px 10px" }} onClick={() => cambiarEstado(o.id, "pausada")}>⏸ Pausar</button>}
                            {o.estado !== "terminada" && <button style={{ ...S.btn, fontSize: 11, padding: "5px 10px" }} onClick={() => cambiarEstado(o.id, "terminada")}>✓ Terminar</button>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── DETALLE OBRA ── */}
                <div>
                  {!obraSel ? (
                    <div style={{ ...S.card, textAlign: "center", opacity: 0.4, padding: 40 }}>
                      Seleccioná una obra para ver el detalle de materiales
                    </div>
                  ) : (
                    <div style={S.card}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <div>
                          <h2 style={{ margin: 0, color: "#fff", fontFamily: "Montserrat, system-ui", fontSize: 18 }}>
                            {obraSel.nombre}
                          </h2>
                          {obraSel.descripcion && <div style={{ ...S.small, marginTop: 2 }}>{obraSel.descripcion}</div>}
                        </div>
                        <span style={S.estadoBadge(obraSel.estado)}>{obraSel.estado.toUpperCase()}</span>
                      </div>

                      {/* Resumen rápido */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                        {[
                          { label: "Materiales", val: tablaObra.length, color: "#fff" },
                          { label: "Completos",  val: tablaObra.filter(r => r.faltaIngresar === 0 && r.necesario > 0).length, color: "#30d158" },
                          { label: "Pendientes", val: tablaObra.filter(r => r.faltaIngresar > 0).length,  color: "#ffd60a" },
                          { label: "Críticos",   val: tablaObra.filter(r => r.alertaCritica).length, color: "#ff453a" },
                        ].map(({ label, val, color }) => (
                          <div key={label} style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 4 }}>{label.toUpperCase()}</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: "Montserrat, system-ui" }}>{val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Tabla Excel-style */}
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th style={S.th}>MATERIAL</th>
                              <th style={{ ...S.th, textAlign: "right" }}>NECESARIO</th>
                              <th style={{ ...S.th, textAlign: "right" }}>INGRESADO</th>
                              <th style={{ ...S.th, textAlign: "right" }}>EGRESADO</th>
                              <th style={{ ...S.th, textAlign: "right" }}>FALTA INGRESAR</th>
                              <th style={{ ...S.th, textAlign: "right" }}>FALTA USAR</th>
                              <th style={{ ...S.th, textAlign: "center" }}>PROGRESO</th>
                              {esGestion && <th style={S.th}>NECESARIO (editar)</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {tablaObra.length === 0 && (
                              <tr>
                                <td colSpan={8} style={{ ...S.td, textAlign: "center", opacity: 0.45 }}>
                                  Sin materiales. Cargá ingresos o egresos con el nombre de esta obra para que aparezcan aquí.
                                </td>
                              </tr>
                            )}
                            {tablaObra.map(r => {
                              const pct = r.necesario > 0 ? (r.ingresado / r.necesario) * 100 : 0;
                              const rowColor = r.alertaCritica ? "rgba(255,69,58,0.04)"
                                             : r.alertaMedia   ? "rgba(255,214,10,0.03)"
                                             : "transparent";
                              const editKey = obraSel.id + r.matId;
                              const editVal = editNec[editKey] ?? "";

                              return (
                                <tr key={r.matId} style={{ background: rowColor }}>
                                  {/* Material */}
                                  <td style={S.td}>
                                    <div style={{ fontWeight: 600, color: "#fff" }}>{r.mat.nombre}</div>
                                    <div style={{ fontSize: 10, opacity: 0.4 }}>{r.mat.unidad}</div>
                                  </td>
                                  {/* Necesario */}
                                  <td style={{ ...S.td, textAlign: "right", color: "#bbb" }}>
                                    {r.necesario > 0 ? r.necesario : <span style={{ opacity: 0.3 }}>—</span>}
                                  </td>
                                  {/* Ingresado */}
                                  <td style={{ ...S.td, textAlign: "right", color: "#30d158", fontWeight: 600 }}>
                                    {r.ingresado > 0 ? r.ingresado : <span style={{ opacity: 0.3 }}>0</span>}
                                  </td>
                                  {/* Egresado */}
                                  <td style={{ ...S.td, textAlign: "right", color: "#ff6b6b" }}>
                                    {r.egresado > 0 ? r.egresado : <span style={{ opacity: 0.3 }}>0</span>}
                                  </td>
                                  {/* Falta ingresar */}
                                  <td style={{ ...S.td, textAlign: "right" }}>
                                    {r.faltaIngresar > 0 ? (
                                      <span style={{
                                        fontWeight: 700,
                                        color: r.alertaCritica ? "#ff453a" : "#ffd60a",
                                      }}>
                                        {r.faltaIngresar}
                                      </span>
                                    ) : r.necesario > 0 ? (
                                      <span style={{ color: "#30d158", fontWeight: 700 }}>✓</span>
                                    ) : (
                                      <span style={{ opacity: 0.3 }}>—</span>
                                    )}
                                  </td>
                                  {/* Falta usar */}
                                  <td style={{ ...S.td, textAlign: "right" }}>
                                    {r.faltaUsar > 0 ? (
                                      <span style={{ color: "#aaa" }}>{r.faltaUsar}</span>
                                    ) : r.necesario > 0 ? (
                                      <span style={{ color: "#30d158", fontWeight: 700 }}>✓</span>
                                    ) : (
                                      <span style={{ opacity: 0.3 }}>—</span>
                                    )}
                                  </td>
                                  {/* Barra de progreso */}
                                  <td style={{ ...S.td, minWidth: 100 }}>
                                    {r.necesario > 0 ? (
                                      <div>
                                        <div style={S.progBar(pct)}>
                                          <div style={S.progFill(pct)} />
                                        </div>
                                        <div style={{ textAlign: "center", fontSize: 10, opacity: 0.5, marginTop: 2 }}>
                                          {Math.min(100, Math.round(pct))}%
                                        </div>
                                      </div>
                                    ) : (
                                      <span style={{ opacity: 0.25, fontSize: 11 }}>sin planif.</span>
                                    )}
                                  </td>
                                  {/* Editar necesario */}
                                  {esGestion && (
                                    <td style={S.td}>
                                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                        <input
                                          style={{ ...S.input, width: 80, padding: "5px 8px", textAlign: "right" }}
                                          type="number" min="0" step="0.01"
                                          placeholder={r.necesario || "0"}
                                          value={editVal}
                                          onChange={e => setEditNec(prev => ({ ...prev, [editKey]: e.target.value }))}
                                        />
                                        {editVal !== "" && (
                                          <button
                                            style={{ ...S.btn, padding: "5px 10px", fontSize: 11 }}
                                            disabled={savingNec}
                                            onClick={() => {
                                              guardarNecesaria(obraSel.id, r.matId, r.configId, editVal);
                                              setEditNec(prev => { const n = { ...prev }; delete n[editKey]; return n; });
                                            }}
                                          >
                                            ✓
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Tip */}
                      {tablaObra.some(r => r.necesario === 0) && esGestion && (
                        <div style={{ marginTop: 12, fontSize: 11, opacity: 0.4 }}>
                          💡 Los materiales sin planificar aparecen porque tienen movimientos registrados con esta obra.
                          Ingresá la cantidad necesaria en la columna "NECESARIO (editar)" para activar el seguimiento.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
