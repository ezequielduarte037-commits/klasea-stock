import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import NotificacionesBell from "../components/NotificacionesBell";

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function fmtDate(d) { if (!d) return "—"; return new Date(d + "T00:00:00").toLocaleDateString("es-AR"); }

const ESTADO_STYLE = {
  activa:    { bg: "rgba(48,209,88,0.1)",   color: "#30d158", border: "rgba(48,209,88,0.25)"   },
  pausada:   { bg: "rgba(255,214,10,0.1)",  color: "#ffd60a", border: "rgba(255,214,10,0.25)"  },
  terminada: { bg: "rgba(100,100,100,0.1)", color: "#888",    border: "rgba(100,100,100,0.25)" },
};

export default function ObrasLaminacionScreen({ profile, signOut }) {
  const role      = profile?.role ?? "invitado";
  const isAdmin   = !!profile?.is_admin;
  const esGestion = isAdmin || role === "admin" || role === "oficina";

  const [obras,       setObras]       = useState([]);
  const [materiales,  setMateriales]  = useState([]);
  const [obraMats,    setObraMats]    = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [err,         setErr]         = useState("");
  const [msg,         setMsg]         = useState("");

  const [obraSelId,     setObraSelId]     = useState(null);
  const [q,             setQ]             = useState("");
  const [showNuevaObra, setShowNuevaObra] = useState(false);
  const [formObra,      setFormObra]      = useState({
    nombre: "", descripcion: "", estado: "activa",
    fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin: "",
  });
  const [editNec,   setEditNec]   = useState({});
  const [savingNec, setSavingNec] = useState(false);

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
    if (r1.error) { setErr(r1.error.message); setLoading(false); return; }
    setObras(r1.data ?? []);
    setMateriales(r2.data ?? []);
    setObraMats(r3.data ?? []);
    setMovimientos(r4.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
    const ch = supabase.channel("rt-obras-lam")
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_obras" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_obra_materiales" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_movimientos" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const obraSel = useMemo(() => obras.find(o => o.id === obraSelId), [obras, obraSelId]);

  // ── TABLA DE MATERIALES ────────────────────────────────────
  // FIX: muestra TODOS los materiales siempre.
  // Si no tiene fila en obra_materiales → cantidad_necesaria = 0, configId = null
  const tablaObra = useMemo(() => {
    if (!obraSel) return [];

    const configMats = obraMats.filter(om => om.obra_id === obraSel.id);

    // Usamos TODOS los materiales (no solo los configurados)
    return materiales.map(mat => {
      const config    = configMats.find(cm => cm.material_id === mat.id);
      const necesario = num(config?.cantidad_necesaria ?? 0);

      const movsObra = movimientos.filter(m =>
        m.material_id === mat.id &&
        (m.obra ?? "").trim().toLowerCase() === obraSel.nombre.trim().toLowerCase()
      );
      const ingresado  = movsObra.filter(m => m.tipo === "ingreso").reduce((s, m) => s + num(m.cantidad), 0);
      const egresado   = movsObra.filter(m => m.tipo === "egreso").reduce((s, m) => s + num(m.cantidad), 0);
      const faltaIngresar = Math.max(0, necesario - ingresado);
      const faltaUsar     = Math.max(0, necesario - egresado);
      const sobrante      = Math.max(0, ingresado - necesario);
      const alertaCritica = necesario > 0 && faltaIngresar > necesario * 0.5;
      const alertaMedia   = necesario > 0 && faltaIngresar > 0;

      return {
        matId: mat.id, mat,
        necesario, ingresado, egresado,
        faltaIngresar, faltaUsar, sobrante,
        alertaCritica, alertaMedia,
        configId: config?.id ?? null,
        tieneActividad: ingresado > 0 || egresado > 0 || necesario > 0,
      };
    }).sort((a, b) => {
      // Primero los que tienen actividad, luego alfabético
      if (a.tieneActividad && !b.tieneActividad) return -1;
      if (!a.tieneActividad && b.tieneActividad) return 1;
      return (a.mat?.nombre ?? "").localeCompare(b.mat?.nombre ?? "");
    });
  }, [obraSel, obraMats, movimientos, materiales]);

  // ── SINCRONIZAR MATERIALES (para obras viejas sin plantilla) ──
  async function sincronizarMateriales(obraId) {
    setSyncing(true);
    const plantilla = materiales
      .filter(mat => !obraMats.some(om => om.obra_id === obraId && om.material_id === mat.id))
      .map(mat => ({ obra_id: obraId, material_id: mat.id, cantidad_necesaria: 0 }));

    if (!plantilla.length) {
      setMsg("✅ Esta obra ya tiene todos los materiales sincronizados.");
      setSyncing(false);
      return;
    }
    const { error } = await supabase.from("laminacion_obra_materiales").insert(plantilla);
    if (error) setErr(error.message);
    else setMsg(`✅ ${plantilla.length} materiales sincronizados.`);
    setSyncing(false);
    await cargar();
  }

  // ── ALERTAS POR OBRA ───────────────────────────────────────
  const alertasPorObra = useMemo(() => {
    const map = {};
    obras.forEach(o => {
      const configMats = obraMats.filter(om => om.obra_id === o.id);
      const criticas = configMats.filter(cm => {
        const nec = num(cm.cantidad_necesaria);
        if (!nec) return false;
        const ing = movimientos
          .filter(m => m.material_id === cm.material_id && m.tipo === "ingreso" &&
            (m.obra ?? "").trim().toLowerCase() === o.nombre.trim().toLowerCase())
          .reduce((s, m) => s + num(m.cantidad), 0);
        return ing < nec * 0.5;
      }).length;
      const pendientes = configMats.filter(cm => {
        const nec = num(cm.cantidad_necesaria);
        if (!nec) return false;
        const ing = movimientos
          .filter(m => m.material_id === cm.material_id && m.tipo === "ingreso" &&
            (m.obra ?? "").trim().toLowerCase() === o.nombre.trim().toLowerCase())
          .reduce((s, m) => s + num(m.cantidad), 0);
        return ing < nec;
      }).length;
      map[o.id] = { criticas, pendientes };
    });
    return map;
  }, [obras, obraMats, movimientos]);

  // ── CREAR OBRA ─────────────────────────────────────────────
  async function crearObra(e) {
    e.preventDefault();
    if (!formObra.nombre.trim()) return setErr("El nombre es obligatorio.");

    const { data: obraData, error: errObra } = await supabase
      .from("laminacion_obras")
      .insert({
        nombre:       formObra.nombre.trim().toUpperCase(),
        descripcion:  formObra.descripcion.trim() || null,
        estado:       formObra.estado,
        fecha_inicio: formObra.fecha_inicio || null,
        fecha_fin:    formObra.fecha_fin || null,
      })
      .select().single();
    if (errObra) return setErr(errObra.message);

    // Crear plantilla completa de materiales
    const plantilla = materiales.map(mat => ({
      obra_id: obraData.id, material_id: mat.id, cantidad_necesaria: 0,
    }));
    if (plantilla.length) {
      await supabase.from("laminacion_obra_materiales").insert(plantilla);
    }

    setMsg(`✅ Obra ${obraData.nombre} creada con ${materiales.length} materiales.`);
    setShowNuevaObra(false);
    setFormObra({ nombre: "", descripcion: "", estado: "activa", fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin: "" });
    await cargar();
  }

  // ── CAMBIAR ESTADO ─────────────────────────────────────────
  async function cambiarEstado(obraId, nuevoEstado) {
    const upd = { estado: nuevoEstado };
    if (nuevoEstado === "terminada") upd.fecha_fin = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("laminacion_obras").update(upd).eq("id", obraId);
    if (error) setErr(error.message);
    else await cargar();
  }

  // ── GUARDAR CANTIDAD NECESARIA ─────────────────────────────
  async function guardarNecesaria(obraId, matId, configId, valor) {
    setSavingNec(true);
    const cantidad = num(valor);
    let error;
    if (configId) {
      ({ error } = await supabase.from("laminacion_obra_materiales")
        .update({ cantidad_necesaria: cantidad }).eq("id", configId));
    } else {
      ({ error } = await supabase.from("laminacion_obra_materiales")
        .insert({ obra_id: obraId, material_id: matId, cantidad_necesaria: cantidad }));
    }
    setSavingNec(false);
    if (error) setErr(error.message);
    else await cargar();
  }

  const obrasFiltradas = useMemo(() => {
    const qq = q.toLowerCase();
    if (!qq) return obras;
    return obras.filter(o => o.nombre.toLowerCase().includes(qq) || (o.descripcion ?? "").toLowerCase().includes(qq));
  }, [obras, q]);

  // ── ESTILOS ────────────────────────────────────────────────
  const S = {
    page:    { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "-apple-system, 'Helvetica Neue', sans-serif" },
    layout:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:    { padding: "20px 24px", overflow: "auto" },
    content: { width: "min(1500px,100%)", margin: "0 auto" },
    card:    { border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, background: "rgba(255,255,255,0.02)", padding: 16, marginBottom: 12 },
    input:   { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "8px 12px", borderRadius: 10, fontSize: 13, outline: "none" },
    label:   { fontSize: 10, letterSpacing: 1.5, opacity: 0.4, display: "block", marginBottom: 4, textTransform: "uppercase" },
    btn:     { border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#fff", padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 13 },
    btnPrim: { border: "1px solid rgba(255,255,255,0.2)", background: "#fff", color: "#000", padding: "8px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 13 },
    btnSm:   { border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#888", padding: "4px 10px", borderRadius: 7, cursor: "pointer", fontSize: 11 },
    small:   { fontSize: 11, opacity: 0.45 },
    split:   { display: "grid", gridTemplateColumns: "320px 1fr", gap: 14, alignItems: "start" },
    obraCard: (sel) => ({
      border: sel ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.05)",
      borderRadius: 12, background: sel ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.01)",
      padding: "12px 14px", cursor: "pointer", marginBottom: 7, transition: "all 0.15s",
    }),
    estadoBadge: (est) => {
      const st = ESTADO_STYLE[est] ?? ESTADO_STYLE.activa;
      return { display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.border}` };
    },
    alertBadge: (tipo) => ({
      display: "inline-block", padding: "2px 7px", borderRadius: 99, fontSize: 10, fontWeight: 700,
      background: tipo === "critica" ? "rgba(255,69,58,0.12)" : "rgba(255,214,10,0.1)",
      color:      tipo === "critica" ? "#ff453a" : "#ffd60a",
      border:     tipo === "critica" ? "1px solid rgba(255,69,58,0.25)" : "1px solid rgba(255,214,10,0.25)",
    }),
    th: { padding: "8px 12px", textAlign: "left", fontSize: 10, letterSpacing: 1.5, opacity: 0.4, fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.05)", whiteSpace: "nowrap", textTransform: "uppercase" },
    td: { padding: "9px 12px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.03)" },
    progBar: () => ({ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.06)", width: "100%", overflow: "hidden", position: "relative" }),
    progFill: (pct) => ({ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100, pct)}%`, background: pct >= 100 ? "#30d158" : pct >= 50 ? "#ffd60a" : "#ff453a", borderRadius: 99, transition: "width 0.4s ease" }),
  };

  return (
    <div style={S.page}>
      <NotificacionesBell profile={profile} />
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={S.main}>
          <div style={S.content}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.3, marginBottom: 5, textTransform: "uppercase", fontWeight: 600 }}>Producción</div>
                <h1 style={{ fontFamily: "Montserrat, system-ui", fontSize: 24, margin: 0, color: "#fff", fontWeight: 900, letterSpacing: -0.5 }}>
                  Obras · Laminación
                </h1>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {esGestion && <button style={S.btnPrim} onClick={() => setShowNuevaObra(v => !v)}>{showNuevaObra ? "✕ Cancelar" : "+ Nueva obra"}</button>}
                <button style={S.btn} onClick={cargar}>↻</button>
              </div>
            </div>

            {err && <div style={{ ...S.card, borderColor: "rgba(255,69,58,0.3)", color: "#ff6b6b", background: "rgba(255,69,58,0.05)" }}>{err}</div>}
            {msg && <div style={{ ...S.card, borderColor: "rgba(48,209,88,0.3)", color: "#a6ffbf", background: "rgba(48,209,88,0.05)" }}>{msg}</div>}

            {/* Form nueva obra */}
            {showNuevaObra && esGestion && (
              <div style={S.card}>
                <h3 style={{ margin: "0 0 14px", color: "#fff", fontSize: 14 }}>Nueva obra</h3>
                <form onSubmit={crearObra}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr", gap: 12 }}>
                    <div><label style={S.label}>Código *</label><input style={{ ...S.input, width: "100%" }} placeholder="43-12" required value={formObra.nombre} onChange={e => setFormObra(f => ({ ...f, nombre: e.target.value }))} /></div>
                    <div><label style={S.label}>Descripción</label><input style={{ ...S.input, width: "100%" }} placeholder="Klase 43 – Casco 12" value={formObra.descripcion} onChange={e => setFormObra(f => ({ ...f, descripcion: e.target.value }))} /></div>
                    <div><label style={S.label}>Estado</label>
                      <select style={{ ...S.input, width: "100%" }} value={formObra.estado} onChange={e => setFormObra(f => ({ ...f, estado: e.target.value }))}>
                        <option value="activa">Activa</option>
                        <option value="pausada">Pausada</option>
                        <option value="terminada">Terminada</option>
                      </select>
                    </div>
                    <div><label style={S.label}>Inicio</label><input style={{ ...S.input, width: "100%" }} type="date" value={formObra.fecha_inicio} onChange={e => setFormObra(f => ({ ...f, fecha_inicio: e.target.value }))} /></div>
                    <div><label style={S.label}>Fin est.</label><input style={{ ...S.input, width: "100%" }} type="date" value={formObra.fecha_fin} onChange={e => setFormObra(f => ({ ...f, fecha_fin: e.target.value }))} /></div>
                  </div>
                  <button type="submit" style={{ ...S.btnPrim, marginTop: 14 }}>Crear obra</button>
                </form>
              </div>
            )}

            {loading ? (
              <div style={{ ...S.card, textAlign: "center", opacity: 0.4, padding: 40 }}>Cargando…</div>
            ) : (
              <div style={S.split}>

                {/* ── LISTA OBRAS ── */}
                <div>
                  <input style={{ ...S.input, width: "100%", marginBottom: 10 }} placeholder="Buscar obra…" value={q} onChange={e => setQ(e.target.value)} />
                  {obrasFiltradas.length === 0 && (
                    <div style={{ ...S.card, opacity: 0.4, textAlign: "center" }}>Sin obras.</div>
                  )}
                  {obrasFiltradas.map(o => {
                    const al  = alertasPorObra[o.id] ?? { criticas: 0, pendientes: 0 };
                    const sel = obraSelId === o.id;
                    // Cuántos materiales tiene configurados (con cantidad > 0)
                    const planificados = obraMats.filter(om => om.obra_id === o.id && num(om.cantidad_necesaria) > 0).length;
                    const sinPlantilla = !obraMats.some(om => om.obra_id === o.id);

                    return (
                      <div key={o.id} style={S.obraCard(sel)} onClick={() => setObraSelId(sel ? null : o.id)}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, fontFamily: "Montserrat, system-ui" }}>{o.nombre}</div>
                            {o.descripcion && <div style={{ ...S.small, marginTop: 2 }}>{o.descripcion}</div>}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                            <span style={S.estadoBadge(o.estado)}>{o.estado.toUpperCase()}</span>
                            {al.criticas > 0 && <span style={S.alertBadge("critica")}>⚠ {al.criticas} crítico{al.criticas > 1 ? "s" : ""}</span>}
                            {sinPlantilla && <span style={{ ...S.alertBadge("media"), fontSize: 9 }}>⚙ sin plantilla</span>}
                          </div>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.4 }}>
                          {planificados} materiales planificados
                          {o.fecha_inicio && <span> · {fmtDate(o.fecha_inicio)}</span>}
                        </div>

                        {/* Acciones */}
                        {sel && esGestion && (
                          <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                            {o.estado !== "activa"    && <button style={S.btnSm} onClick={() => cambiarEstado(o.id, "activa")}>▶ Activar</button>}
                            {o.estado !== "pausada"   && <button style={S.btnSm} onClick={() => cambiarEstado(o.id, "pausada")}>⏸ Pausar</button>}
                            {o.estado !== "terminada" && <button style={S.btnSm} onClick={() => cambiarEstado(o.id, "terminada")}>✓ Terminar</button>}
                            <button
                              style={{ ...S.btnSm, color: "#32ade6", borderColor: "rgba(50,173,230,0.3)" }}
                              disabled={syncing}
                              onClick={() => sincronizarMateriales(o.id)}
                            >
                              {syncing ? "…" : "⟳ Sincronizar materiales"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── DETALLE OBRA ── */}
                <div>
                  {!obraSel ? (
                    <div style={{ ...S.card, textAlign: "center", opacity: 0.3, padding: 60 }}>
                      Seleccioná una obra para ver sus materiales
                    </div>
                  ) : (
                    <div style={S.card}>
                      {/* Header obra seleccionada */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <div>
                          <h2 style={{ margin: 0, color: "#fff", fontSize: 18, fontFamily: "Montserrat, system-ui", fontWeight: 900 }}>{obraSel.nombre}</h2>
                          {obraSel.descripcion && <div style={{ ...S.small, marginTop: 3 }}>{obraSel.descripcion}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={S.estadoBadge(obraSel.estado)}>{obraSel.estado.toUpperCase()}</span>
                          <div style={{ fontSize: 11, opacity: 0.4 }}>
                            {tablaObra.filter(r => r.necesario > 0).length} planificados · {tablaObra.filter(r => r.tieneActividad).length} con actividad
                          </div>
                        </div>
                      </div>

                      {/* Resumen stats */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
                        {[
                          { label: "Total materiales", val: tablaObra.length, color: "#888" },
                          { label: "Planificados",     val: tablaObra.filter(r => r.necesario > 0).length, color: "#0a84ff" },
                          { label: "Completos",        val: tablaObra.filter(r => r.necesario > 0 && r.faltaIngresar === 0).length, color: "#30d158" },
                          { label: "Críticos",         val: tablaObra.filter(r => r.alertaCritica).length, color: "#ff453a" },
                        ].map(({ label, val, color }) => (
                          <div key={label} style={{ background: `${color}10`, border: `1px solid ${color}20`, borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: 9, opacity: 0.5, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: "Montserrat, system-ui" }}>{val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Tabla completa de materiales */}
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th style={S.th}>Material</th>
                              <th style={{ ...S.th, textAlign: "right" }}>Necesario</th>
                              <th style={{ ...S.th, textAlign: "right" }}>Ingresado</th>
                              <th style={{ ...S.th, textAlign: "right" }}>Egresado</th>
                              <th style={{ ...S.th, textAlign: "right" }}>Falta ingr.</th>
                              <th style={{ ...S.th, textAlign: "right" }}>Falta usar</th>
                              <th style={{ ...S.th, textAlign: "center" }}>Progreso</th>
                              {esGestion && <th style={S.th}>Editar nec.</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {tablaObra.map(r => {
                              const pct     = r.necesario > 0 ? (r.ingresado / r.necesario) * 100 : 0;
                              const rowBg   = r.alertaCritica ? "rgba(255,69,58,0.04)"
                                            : r.alertaMedia   ? "rgba(255,214,10,0.025)"
                                            : r.tieneActividad && r.necesario === 0 ? "rgba(50,173,230,0.03)"
                                            : "transparent";
                              const editKey = obraSel.id + r.matId;
                              const editVal = editNec[editKey] ?? "";

                              return (
                                <tr key={r.matId} style={{ background: rowBg }}>
                                  <td style={S.td}>
                                    <div style={{ fontWeight: r.tieneActividad ? 600 : 400, color: r.tieneActividad ? "#fff" : "rgba(255,255,255,0.45)" }}>
                                      {r.mat.nombre}
                                    </div>
                                    <div style={{ fontSize: 10, opacity: 0.35 }}>{r.mat.unidad}</div>
                                  </td>
                                  <td style={{ ...S.td, textAlign: "right", color: "#bbb" }}>
                                    {r.necesario > 0 ? r.necesario : <span style={{ opacity: 0.2 }}>—</span>}
                                  </td>
                                  <td style={{ ...S.td, textAlign: "right", color: r.ingresado > 0 ? "#30d158" : "rgba(255,255,255,0.2)", fontWeight: r.ingresado > 0 ? 600 : 400 }}>
                                    {r.ingresado > 0 ? r.ingresado : "0"}
                                  </td>
                                  <td style={{ ...S.td, textAlign: "right", color: r.egresado > 0 ? "#ff6b6b" : "rgba(255,255,255,0.2)" }}>
                                    {r.egresado > 0 ? r.egresado : "0"}
                                  </td>
                                  <td style={{ ...S.td, textAlign: "right" }}>
                                    {r.faltaIngresar > 0 ? (
                                      <span style={{ fontWeight: 700, color: r.alertaCritica ? "#ff453a" : "#ffd60a" }}>{r.faltaIngresar}</span>
                                    ) : r.necesario > 0 ? (
                                      <span style={{ color: "#30d158", fontWeight: 700 }}>✓</span>
                                    ) : (
                                      <span style={{ opacity: 0.2 }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ ...S.td, textAlign: "right" }}>
                                    {r.faltaUsar > 0 ? (
                                      <span style={{ color: "#aaa" }}>{r.faltaUsar}</span>
                                    ) : r.necesario > 0 ? (
                                      <span style={{ color: "#30d158", fontWeight: 700 }}>✓</span>
                                    ) : (
                                      <span style={{ opacity: 0.2 }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ ...S.td, minWidth: 100 }}>
                                    {r.necesario > 0 ? (
                                      <div>
                                        <div style={S.progBar()}>
                                          <div style={S.progFill(pct)} />
                                        </div>
                                        <div style={{ textAlign: "center", fontSize: 10, opacity: 0.4, marginTop: 2 }}>{Math.min(100, Math.round(pct))}%</div>
                                      </div>
                                    ) : (
                                      <span style={{ opacity: 0.2, fontSize: 11 }}>sin planif.</span>
                                    )}
                                  </td>
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
                                            }}>✓</button>
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

                      <div style={{ marginTop: 12, fontSize: 11, opacity: 0.35 }}>
                        💡 Los materiales en gris aún no tienen actividad ni planificación. Usá "Editar nec." para establecer la cantidad necesaria.
                      </div>
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
