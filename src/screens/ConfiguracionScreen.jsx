import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import NotificacionesBell from "../components/NotificacionesBell";

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

const TABS = ["Procesos", "Usuarios", "Procedimientos", "Sistema"];

const ROLES = ["admin", "oficina", "laminacion", "muebles", "panol", "mecanica", "electricidad"];

export default function ConfiguracionScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin || profile?.role === "admin";

  const [tab,            setTab]            = useState("Procesos");
  const [procesos,       setProcesos]       = useState([]);
  const [config,         setConfig]         = useState([]);
  const [procedimientos, setProcedimientos] = useState([]);
  const [usuarios,       setUsuarios]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [err,            setErr]            = useState("");
  const [msg,            setMsg]            = useState("");

  // Edición inline procesos
  const [editProc,  setEditProc]  = useState({});
  const [editConf,  setEditConf]  = useState({});

  // Modal nuevo proceso
  const [showNuevoProc, setShowNuevoProc] = useState(false);
  const [formProc, setFormProc] = useState({ nombre: "", orden: "", dias_esperados: "", color: "#30d158", icono: "⚙️", descripcion: "", area_responsable: "" });

  // Modal nuevo procedimiento
  const [showNuevoProced, setShowNuevoProced] = useState(false);
  const [formProced, setFormProced] = useState({ titulo: "", descripcion: "", contenido: "", proceso_id: "", rol_visible: "todos", orden: "" });
  const [pasosProced, setPasosProced] = useState([""]);

  // Modal nuevo usuario
  const [showNuevoUser, setShowNuevoUser] = useState(false);
  const [formUser, setFormUser] = useState({ username: "", password: "", role: "panol", is_admin: false });
  const [editUserModal, setEditUserModal] = useState(null);
  const [formEditUser,  setFormEditUser]  = useState({});

  async function cargar() {
    setLoading(true);
    const [r1, r2, r3, r4] = await Promise.all([
      supabase.from("procesos").select("*").order("orden"),
      supabase.from("sistema_config").select("*").order("grupo").order("clave"),
      supabase.from("procedimientos").select("*, procesos(nombre)").order("orden"),
      supabase.from("profiles").select("id,username,role,is_admin,created_at").order("username"),
    ]);
    setProcesos(r1.data ?? []);
    setConfig(r2.data ?? []);
    setProcedimientos(r3.data ?? []);
    setUsuarios(r4.data ?? []);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, []);

  function flash(ok, text) {
    if (ok) setMsg(text); else setErr(text);
    setTimeout(() => { setMsg(""); setErr(""); }, 3500);
  }

  // ── PROCESOS ──────────────────────────────────────────────
  async function guardarProceso(id) {
    const cambios = editProc[id];
    if (!cambios || !Object.keys(cambios).length) return;
    const { error } = await supabase.from("procesos").update(cambios).eq("id", id);
    if (error) flash(false, error.message);
    else {
      flash(true, "✅ Proceso actualizado.");
      setEditProc(p => { const n = { ...p }; delete n[id]; return n; });
      cargar();
    }
  }

  async function toggleProceso(id, activo) {
    await supabase.from("procesos").update({ activo: !activo }).eq("id", id);
    cargar();
  }

  async function crearProceso(e) {
    e.preventDefault();
    if (!formProc.nombre.trim()) return flash(false, "El nombre es obligatorio.");
    const { error } = await supabase.from("procesos").insert({
      nombre:           formProc.nombre.trim(),
      orden:            num(formProc.orden),
      dias_esperados:   num(formProc.dias_esperados),
      color:            formProc.color,
      icono:            formProc.icono,
      descripcion:      formProc.descripcion.trim() || null,
      area_responsable: formProc.area_responsable.trim() || null,
      genera_alertas:   true,
      activo:           true,
    });
    if (error) return flash(false, error.message);
    flash(true, `✅ Proceso "${formProc.nombre}" creado.`);
    setFormProc({ nombre: "", orden: "", dias_esperados: "", color: "#30d158", icono: "⚙️", descripcion: "", area_responsable: "" });
    setShowNuevoProc(false);
    cargar();
  }

  async function moverProceso(id, dir) {
    const idx = procesos.findIndex(p => p.id === id);
    const swap = procesos[idx + dir];
    if (!swap) return;
    const p = procesos[idx];
    await Promise.all([
      supabase.from("procesos").update({ orden: swap.orden }).eq("id", p.id),
      supabase.from("procesos").update({ orden: p.orden }).eq("id", swap.id),
    ]);
    cargar();
  }

  // ── USUARIOS ──────────────────────────────────────────────
  async function crearUsuario(e) {
    e.preventDefault();
    if (!formUser.username.trim() || !formUser.password) return flash(false, "Usuario y contraseña obligatorios.");
    const email = `${formUser.username.trim().toLowerCase()}@klasea.local`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password: formUser.password,
      options: {
        data: { username: formUser.username.trim(), role: formUser.role },
        emailRedirectTo: undefined,
      },
    });
    if (error) return flash(false, "Error al crear: " + error.message);

    const userId = data?.user?.id;
    if (userId) {
      await supabase.from("profiles").upsert({
        id:       userId,
        username: formUser.username.trim().toUpperCase(),
        role:     formUser.role,
        is_admin: formUser.is_admin,
      }, { onConflict: "id" });
    }

    flash(true, `✅ Usuario "${formUser.username.toUpperCase()}" creado. Si el email requiere confirmación, activarlo desde Supabase Auth.`);
    setShowNuevoUser(false);
    setFormUser({ username: "", password: "", role: "panol", is_admin: false });
    cargar();
  }

  async function guardarRolUsuario() {
    if (!editUserModal) return;
    const { error } = await supabase.from("profiles").update({
      role:     formEditUser.role,
      is_admin: formEditUser.is_admin,
    }).eq("id", editUserModal.id);
    if (error) flash(false, error.message);
    else {
      flash(true, "✅ Rol actualizado.");
      setEditUserModal(null);
      cargar();
    }
  }

  // ── PROCEDIMIENTOS ────────────────────────────────────────
  async function crearProcedimiento(e) {
    e.preventDefault();
    const { error } = await supabase.from("procedimientos").insert({
      titulo:      formProced.titulo.trim(),
      descripcion: formProced.descripcion.trim() || null,
      contenido:   formProced.contenido.trim() || null,
      proceso_id:  formProced.proceso_id || null,
      rol_visible: [formProced.rol_visible],
      orden:       num(formProced.orden),
      activo:      true,
      pasos:       pasosProced.filter(p => p.trim()).map((texto, i) => ({ orden: i + 1, texto })),
    });
    if (error) return flash(false, error.message);
    flash(true, "✅ Procedimiento creado.");
    setFormProced({ titulo: "", descripcion: "", contenido: "", proceso_id: "", rol_visible: "todos", orden: "" });
    setPasosProced([""]);
    setShowNuevoProced(false);
    cargar();
  }

  async function toggleProcedimiento(id, activo) {
    await supabase.from("procedimientos").update({ activo: !activo }).eq("id", id);
    cargar();
  }

  // ── CONFIG SISTEMA ────────────────────────────────────────
  async function guardarConfig(clave) {
    const valor = editConf[clave];
    if (valor === undefined) return;
    const { error } = await supabase.from("sistema_config")
      .update({ valor: String(valor), updated_at: new Date().toISOString() })
      .eq("clave", clave);
    if (error) flash(false, error.message);
    else {
      flash(true, "✅ Configuración guardada.");
      setEditConf(p => { const n = { ...p }; delete n[clave]; return n; });
      cargar();
    }
  }

  const configGrupos = useMemo(() => {
    const g = {};
    config.forEach(c => { if (!g[c.grupo]) g[c.grupo] = []; g[c.grupo].push(c); });
    return g;
  }, [config]);

  // ── ESTILOS ───────────────────────────────────────────────
  const S = {
    page:    { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "-apple-system, 'Helvetica Neue', sans-serif" },
    layout:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:    { padding: "24px 28px", overflowY: "auto" },
    content: { width: "min(1100px, 100%)", margin: "0 auto" },

    card:    {
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      background: "rgba(255,255,255,0.025)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      padding: "18px 20px",
      marginBottom: 14,
    },
    input:   { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "8px 12px", borderRadius: 10, fontSize: 13, width: "100%", outline: "none" },
    textarea:{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "8px 12px", borderRadius: 10, fontSize: 13, width: "100%", resize: "vertical", minHeight: 80, outline: "none" },
    label:   { fontSize: 10, letterSpacing: 1.8, opacity: 0.4, display: "block", marginBottom: 5, textTransform: "uppercase", fontWeight: 600 },

    btn:     { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#fff", padding: "7px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 13, transition: "all 0.15s" },
    btnPrim: { border: "1px solid rgba(255,255,255,0.2)", background: "#fff", color: "#000", padding: "8px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 13 },
    btnSm:   { border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#888", padding: "4px 10px", borderRadius: 8, cursor: "pointer", fontSize: 11 },
    btnDanger:{ border: "1px solid rgba(255,69,58,0.3)", background: "transparent", color: "#ff453a", padding: "4px 10px", borderRadius: 8, cursor: "pointer", fontSize: 11 },

    th:      { padding: "8px 12px", textAlign: "left", fontSize: 10, letterSpacing: 1.5, opacity: 0.35, fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.05)", textTransform: "uppercase" },
    td:      { padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "middle" },

    tabBtn: (act) => ({
      border: act ? "1px solid rgba(255,255,255,0.15)" : "1px solid transparent",
      background: act ? "rgba(255,255,255,0.06)" : "transparent",
      color: act ? "#fff" : "rgba(255,255,255,0.4)",
      padding: "8px 18px", borderRadius: 10, cursor: "pointer",
      fontWeight: act ? 700 : 400, fontSize: 13, transition: "all 0.15s",
    }),
    toggle: (on) => ({
      width: 36, height: 20, borderRadius: 99,
      background: on ? "#30d158" : "rgba(255,255,255,0.08)",
      position: "relative", cursor: "pointer", border: "none",
      transition: "background 0.2s", flexShrink: 0,
    }),
    toggleDot: (on) => ({
      position: "absolute", top: 3, left: on ? 17 : 3,
      width: 14, height: 14, borderRadius: "50%",
      background: "#fff", transition: "left 0.2s",
    }),
    roleBadge: (role) => {
      const colors = { admin: "#ff453a", oficina: "#0a84ff", panol: "#30d158", laminacion: "#32ade6", muebles: "#ffd60a", mecanica: "#ff9f0a", electricidad: "#ff9f0a" };
      const c = colors[role] ?? "#888";
      return { fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: `${c}18`, color: c, border: `1px solid ${c}33` };
    },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", justifyContent: "center", alignItems: "flex-start", zIndex: 9999, padding: "40px 20px", overflowY: "auto" },
    modal:   { background: "rgba(10,10,10,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 28, width: "100%", maxWidth: 500, boxShadow: "0 30px 80px rgba(0,0,0,0.9)" },
  };

  if (!isAdmin) {
    return (
      <div style={S.page}>
        <div style={S.layout}>
          <Sidebar profile={profile} signOut={signOut} />
          <main style={S.main}>
            <div style={{ ...S.card, textAlign: "center", padding: 60, opacity: 0.4 }}>
              Solo administradores pueden acceder a Configuración.
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <NotificacionesBell profile={profile} />
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={S.main}>
          <div style={S.content}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.35, marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>Sistema</div>
                <h1 style={{ fontFamily: "Montserrat, system-ui", fontSize: 26, margin: 0, color: "#fff", fontWeight: 900, letterSpacing: -0.5 }}>
                  Configuración
                </h1>
              </div>
            </div>

            {err && <div style={{ ...S.card, borderColor: "rgba(255,69,58,0.3)", color: "#ff6b6b", background: "rgba(255,69,58,0.05)" }}>{err}</div>}
            {msg && <div style={{ ...S.card, borderColor: "rgba(48,209,88,0.3)", color: "#a6ffbf", background: "rgba(48,209,88,0.05)" }}>{msg}</div>}

            {/* Tabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 20, padding: "4px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", width: "fit-content" }}>
              {TABS.map(t => (
                <button key={t} style={S.tabBtn(tab === t)} onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>

            {loading ? (
              <div style={{ ...S.card, textAlign: "center", opacity: 0.4, padding: 40 }}>Cargando…</div>
            ) : (
              <>

                {/* ══ PROCESOS ══════════════════════════════════════════ */}
                {tab === "Procesos" && (
                  <div style={S.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Procesos de producción</div>
                        <div style={{ fontSize: 12, opacity: 0.45, marginTop: 2 }}>{procesos.length} procesos configurados · orden, duración y área son editables</div>
                      </div>
                      <button style={S.btnPrim} onClick={() => setShowNuevoProc(true)}>+ Nuevo proceso</button>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={S.th}>Orden</th>
                          <th style={S.th}>Proceso</th>
                          <th style={S.th}>Área</th>
                          <th style={S.th}>Días est.</th>
                          <th style={S.th}>Alertas</th>
                          <th style={S.th}>Estado</th>
                          <th style={S.th}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {procesos.map((p, idx) => {
                          const ed = editProc[p.id] ?? {};
                          const changed = Object.keys(ed).length > 0;
                          return (
                            <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.4 }}>
                              <td style={S.td}>
                                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                  <button style={{ ...S.btnSm, padding: "2px 6px" }} onClick={() => moverProceso(p.id, -1)} disabled={idx === 0}>↑</button>
                                  <span style={{ fontSize: 12, opacity: 0.6, minWidth: 20, textAlign: "center" }}>{p.orden}</span>
                                  <button style={{ ...S.btnSm, padding: "2px 6px" }} onClick={() => moverProceso(p.id, 1)} disabled={idx === procesos.length - 1}>↓</button>
                                </div>
                              </td>
                              <td style={S.td}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 16 }}>{p.icono}</span>
                                  <div>
                                    <input
                                      style={{ ...S.input, width: 180, padding: "5px 8px", fontSize: 12 }}
                                      value={ed.nombre ?? p.nombre}
                                      onChange={e => setEditProc(prev => ({ ...prev, [p.id]: { ...prev[p.id], nombre: e.target.value } }))}
                                    />
                                    {p.descripcion && <div style={{ fontSize: 10, opacity: 0.35, marginTop: 2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descripcion}</div>}
                                  </div>
                                </div>
                              </td>
                              <td style={S.td}>
                                <input
                                  style={{ ...S.input, width: 120, padding: "5px 8px", fontSize: 12 }}
                                  value={ed.area_responsable ?? (p.area_responsable || "")}
                                  onChange={e => setEditProc(prev => ({ ...prev, [p.id]: { ...prev[p.id], area_responsable: e.target.value } }))}
                                />
                              </td>
                              <td style={S.td}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <input
                                    type="number"
                                    style={{ ...S.input, width: 60, padding: "5px 8px", fontSize: 12 }}
                                    value={ed.dias_esperados ?? p.dias_esperados ?? ""}
                                    onChange={e => setEditProc(prev => ({ ...prev, [p.id]: { ...prev[p.id], dias_esperados: e.target.value } }))}
                                  />
                                  <span style={{ fontSize: 10, opacity: 0.4 }}>días</span>
                                </div>
                              </td>
                              <td style={S.td}>
                                <button style={S.toggle(ed.genera_alertas ?? p.genera_alertas)} onClick={() => setEditProc(prev => ({ ...prev, [p.id]: { ...prev[p.id], genera_alertas: !(ed.genera_alertas ?? p.genera_alertas) } }))}>
                                  <div style={S.toggleDot(ed.genera_alertas ?? p.genera_alertas)} />
                                </button>
                              </td>
                              <td style={S.td}>
                                <button style={S.toggle(p.activo)} onClick={() => toggleProceso(p.id, p.activo)}>
                                  <div style={S.toggleDot(p.activo)} />
                                </button>
                              </td>
                              <td style={S.td}>
                                {changed ? (
                                  <button style={{ ...S.btnPrim, fontSize: 11, padding: "5px 12px" }} onClick={() => guardarProceso(p.id)}>Guardar</button>
                                ) : (
                                  <span style={{ fontSize: 11, opacity: 0.25 }}>Sin cambios</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ══ USUARIOS ══════════════════════════════════════════ */}
                {tab === "Usuarios" && (
                  <div style={S.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Usuarios del sistema</div>
                        <div style={{ fontSize: 12, opacity: 0.45, marginTop: 2 }}>{usuarios.length} usuarios registrados</div>
                      </div>
                      <button style={S.btnPrim} onClick={() => setShowNuevoUser(true)}>+ Nuevo usuario</button>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={S.th}>Usuario</th>
                          <th style={S.th}>Rol</th>
                          <th style={S.th}>Admin</th>
                          <th style={S.th}>Creado</th>
                          <th style={S.th}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usuarios.map(u => (
                          <tr key={u.id}>
                            <td style={S.td}>
                              <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{u.username}</div>
                              <div style={{ fontSize: 10, opacity: 0.35, marginTop: 1 }}>{u.id.slice(0, 8)}…</div>
                            </td>
                            <td style={S.td}>
                              <span style={S.roleBadge(u.role)}>{u.role}</span>
                            </td>
                            <td style={S.td}>
                              {u.is_admin ? <span style={{ color: "#ffd60a", fontSize: 12 }}>⭐ Admin</span> : <span style={{ opacity: 0.3, fontSize: 12 }}>—</span>}
                            </td>
                            <td style={S.td}>
                              <span style={{ fontSize: 11, opacity: 0.45 }}>
                                {u.created_at ? new Date(u.created_at).toLocaleDateString("es-AR") : "—"}
                              </span>
                            </td>
                            <td style={S.td}>
                              <button style={S.btnSm} onClick={() => {
                                setEditUserModal(u);
                                setFormEditUser({ role: u.role, is_admin: u.is_admin });
                              }}>
                                ✏️ Editar rol
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!usuarios.length && (
                          <tr><td style={S.td} colSpan={5}>Sin usuarios.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ══ PROCEDIMIENTOS ════════════════════════════════════ */}
                {tab === "Procedimientos" && (
                  <div style={S.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Procedimientos / SOP</div>
                        <div style={{ fontSize: 12, opacity: 0.45, marginTop: 2 }}>{procedimientos.length} procedimientos · filtrados por rol en la app</div>
                      </div>
                      <button style={S.btnPrim} onClick={() => setShowNuevoProced(true)}>+ Nuevo</button>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={S.th}>Título</th>
                          <th style={S.th}>Proceso</th>
                          <th style={S.th}>Visible para</th>
                          <th style={S.th}>Pasos</th>
                          <th style={S.th}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {procedimientos.map(p => (
                          <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.4 }}>
                            <td style={S.td}>
                              <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{p.titulo}</div>
                              {p.descripcion && <div style={{ fontSize: 10, opacity: 0.4, marginTop: 1 }}>{p.descripcion.slice(0, 60)}…</div>}
                            </td>
                            <td style={S.td}>
                              <span style={{ fontSize: 11, opacity: 0.55 }}>{p.procesos?.nombre ?? "— General"}</span>
                            </td>
                            <td style={S.td}>
                              {(Array.isArray(p.rol_visible) ? p.rol_visible : [p.rol_visible]).map(r => (
                                <span key={r} style={{ ...S.roleBadge(r), marginRight: 4 }}>{r}</span>
                              ))}
                            </td>
                            <td style={S.td}>
                              <span style={{ fontSize: 11, opacity: 0.55 }}>
                                {Array.isArray(p.pasos) ? p.pasos.length : 0} pasos
                              </span>
                            </td>
                            <td style={S.td}>
                              <button style={S.toggle(p.activo)} onClick={() => toggleProcedimiento(p.id, p.activo)}>
                                <div style={S.toggleDot(p.activo)} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ══ SISTEMA ═══════════════════════════════════════════ */}
                {tab === "Sistema" && (
                  Object.entries(configGrupos).map(([grupo, items]) => (
                    <div key={grupo} style={S.card}>
                      <div style={{ fontSize: 10, letterSpacing: 2, opacity: 0.4, marginBottom: 14, textTransform: "uppercase", fontWeight: 700 }}>{grupo}</div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <tbody>
                          {items.map(c => (
                            <tr key={c.clave}>
                              <td style={S.td}>
                                <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{c.clave}</div>
                                {c.descripcion && <div style={{ fontSize: 10, opacity: 0.4, marginTop: 1 }}>{c.descripcion}</div>}
                              </td>
                              <td style={{ ...S.td, width: 200 }}>
                                <input
                                  style={{ ...S.input, padding: "6px 10px" }}
                                  value={editConf[c.clave] ?? c.valor}
                                  onChange={e => setEditConf(prev => ({ ...prev, [c.clave]: e.target.value }))}
                                />
                              </td>
                              <td style={{ ...S.td, width: 100 }}>
                                {editConf[c.clave] !== undefined ? (
                                  <button style={{ ...S.btnPrim, fontSize: 11, padding: "5px 12px" }} onClick={() => guardarConfig(c.clave)}>Guardar</button>
                                ) : (
                                  <span style={{ fontSize: 11, opacity: 0.3 }}>—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}

              </>
            )}
          </div>

          {/* ── MODAL NUEVO PROCESO ─────────────────────────────── */}
          {showNuevoProc && (
            <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowNuevoProc(false)}>
              <div style={S.modal}>
                <h2 style={{ margin: "0 0 20px", color: "#fff", fontSize: 16, fontFamily: "Montserrat, system-ui" }}>Nuevo proceso</h2>
                <form onSubmit={crearProceso}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 60px", gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={S.label}>Nombre *</label>
                      <input style={S.input} required value={formProc.nombre} onChange={e => setFormProc(f => ({ ...f, nombre: e.target.value }))} autoFocus />
                    </div>
                    <div>
                      <label style={S.label}>Ícono</label>
                      <input style={S.input} value={formProc.icono} onChange={e => setFormProc(f => ({ ...f, icono: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={S.label}>Área</label>
                      <input style={S.input} placeholder="Mecánica, Laminación…" value={formProc.area_responsable} onChange={e => setFormProc(f => ({ ...f, area_responsable: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Color</label>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="color" style={{ width: 36, height: 34, borderRadius: 8, border: "none", background: "none", cursor: "pointer" }} value={formProc.color} onChange={e => setFormProc(f => ({ ...f, color: e.target.value }))} />
                        <input style={{ ...S.input, flex: 1 }} value={formProc.color} onChange={e => setFormProc(f => ({ ...f, color: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label style={S.label}>Días est.</label>
                      <input type="number" style={S.input} value={formProc.dias_esperados} onChange={e => setFormProc(f => ({ ...f, dias_esperados: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10, marginBottom: 16 }}>
                    <div>
                      <label style={S.label}>Descripción</label>
                      <input style={S.input} value={formProc.descripcion} onChange={e => setFormProc(f => ({ ...f, descripcion: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Orden</label>
                      <input type="number" style={S.input} value={formProc.orden} onChange={e => setFormProc(f => ({ ...f, orden: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={S.btnPrim}>Crear proceso</button>
                    <button type="button" style={S.btn} onClick={() => setShowNuevoProc(false)}>Cancelar</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ── MODAL NUEVO USUARIO ──────────────────────────────── */}
          {showNuevoUser && (
            <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowNuevoUser(false)}>
              <div style={S.modal}>
                <h2 style={{ margin: "0 0 6px", color: "#fff", fontSize: 16, fontFamily: "Montserrat, system-ui" }}>Nuevo usuario</h2>
                <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 20 }}>El email se genera como usuario@klasea.local</div>
                <form onSubmit={crearUsuario}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>Nombre de usuario *</label>
                    <input style={S.input} placeholder="ADMIN1, PANOL2…" required value={formUser.username} onChange={e => setFormUser(f => ({ ...f, username: e.target.value }))} autoFocus />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>Contraseña *</label>
                    <input type="password" style={S.input} required value={formUser.password} onChange={e => setFormUser(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                    <div>
                      <label style={S.label}>Rol</label>
                      <select style={S.input} value={formUser.role} onChange={e => setFormUser(f => ({ ...f, role: e.target.value }))}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Permisos</label>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, cursor: "pointer" }}>
                        <button type="button" style={S.toggle(formUser.is_admin)} onClick={() => setFormUser(f => ({ ...f, is_admin: !f.is_admin }))}>
                          <div style={S.toggleDot(formUser.is_admin)} />
                        </button>
                        <span style={{ fontSize: 12 }}>Administrador</span>
                      </label>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 14, padding: "8px 12px", background: "rgba(255,214,10,0.05)", border: "1px solid rgba(255,214,10,0.15)", borderRadius: 8, color: "#ffd60a" }}>
                    ⚠️ Si Supabase requiere confirmación de email, el usuario debe activarse desde el panel Auth de Supabase.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={S.btnPrim}>Crear usuario</button>
                    <button type="button" style={S.btn} onClick={() => setShowNuevoUser(false)}>Cancelar</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ── MODAL EDITAR ROL USUARIO ─────────────────────────── */}
          {editUserModal && (
            <div style={S.overlay} onClick={e => e.target === e.currentTarget && setEditUserModal(null)}>
              <div style={S.modal}>
                <h2 style={{ margin: "0 0 4px", color: "#fff", fontSize: 16, fontFamily: "Montserrat, system-ui" }}>Editar rol</h2>
                <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 20 }}>{editUserModal.username}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                  <div>
                    <label style={S.label}>Rol</label>
                    <select style={S.input} value={formEditUser.role} onChange={e => setFormEditUser(f => ({ ...f, role: e.target.value }))}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Administrador</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, cursor: "pointer" }}>
                      <button type="button" style={S.toggle(formEditUser.is_admin)} onClick={() => setFormEditUser(f => ({ ...f, is_admin: !f.is_admin }))}>
                        <div style={S.toggleDot(formEditUser.is_admin)} />
                      </button>
                      <span style={{ fontSize: 12 }}>{formEditUser.is_admin ? "Sí" : "No"}</span>
                    </label>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={S.btnPrim} onClick={guardarRolUsuario}>Guardar</button>
                  <button style={S.btn} onClick={() => setEditUserModal(null)}>Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {/* ── MODAL NUEVO PROCEDIMIENTO ────────────────────────── */}
          {showNuevoProced && (
            <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowNuevoProced(false)}>
              <div style={S.modal}>
                <h2 style={{ margin: "0 0 20px", color: "#fff", fontSize: 16, fontFamily: "Montserrat, system-ui" }}>Nuevo procedimiento</h2>
                <form onSubmit={crearProcedimiento}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>Título *</label>
                    <input style={S.input} required value={formProced.titulo} onChange={e => setFormProced(f => ({ ...f, titulo: e.target.value }))} autoFocus />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={S.label}>Proceso</label>
                      <select style={S.input} value={formProced.proceso_id} onChange={e => setFormProced(f => ({ ...f, proceso_id: e.target.value }))}>
                        <option value="">— General —</option>
                        {procesos.map(p => <option key={p.id} value={p.id}>{p.icono} {p.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Visible para</label>
                      <select style={S.input} value={formProced.rol_visible} onChange={e => setFormProced(f => ({ ...f, rol_visible: e.target.value }))}>
                        <option value="todos">Todos</option>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>Descripción</label>
                    <input style={S.input} value={formProced.descripcion} onChange={e => setFormProced(f => ({ ...f, descripcion: e.target.value }))} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>Pasos</label>
                    {pasosProced.map((p, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                        <span style={{ width: 18, opacity: 0.3, fontSize: 11, flexShrink: 0 }}>{i + 1}.</span>
                        <input style={{ ...S.input, flex: 1 }} placeholder={`Paso ${i + 1}…`} value={p} onChange={e => { const n = [...pasosProced]; n[i] = e.target.value; setPasosProced(n); }} />
                        <button type="button" style={S.btnSm} onClick={() => setPasosProced(prev => prev.filter((_, j) => j !== i))}>✕</button>
                      </div>
                    ))}
                    <button type="button" style={{ ...S.btnSm, marginTop: 4 }} onClick={() => setPasosProced(p => [...p, ""])}>+ Paso</button>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button type="submit" style={S.btnPrim}>Crear</button>
                    <button type="button" style={S.btn} onClick={() => setShowNuevoProced(false)}>Cancelar</button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
