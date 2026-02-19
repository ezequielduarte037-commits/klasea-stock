import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import NotificacionesBell from "../components/NotificacionesBell";

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

const TABS  = ["Procesos", "Usuarios", "Sistema"];
const ROLES = ["admin", "oficina", "laminacion", "muebles", "panol", "mecanica", "electricidad"];

export default function ConfiguracionScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin || profile?.role === "admin";

  const [tab,      setTab]      = useState("Procesos");
  const [procesos, setProcesos] = useState([]);
  const [config,   setConfig]   = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState("");
  const [msg,      setMsg]      = useState("");

  const [editProc,  setEditProc]  = useState({});
  const [editConf,  setEditConf]  = useState({});

  const [showNuevoProc, setShowNuevoProc] = useState(false);
  const [formProc, setFormProc] = useState({
    nombre: "", orden: "", dias_esperados: "", color: "#888888",
    descripcion: "", area_responsable: "",
  });

  const [showNuevoUser, setShowNuevoUser] = useState(false);
  const [formUser,      setFormUser]      = useState({ username: "", password: "", role: "panol", is_admin: false });
  const [editUserModal, setEditUserModal] = useState(null);
  const [formEditUser,  setFormEditUser]  = useState({});

  function flash(ok, text) {
    if (ok) setMsg(text); else setErr(text);
    setTimeout(() => { setMsg(""); setErr(""); }, 3000);
  }

  async function cargar() {
    setLoading(true);
    const [r1, r2, r3] = await Promise.all([
      supabase.from("procesos").select("*").order("orden"),
      supabase.from("sistema_config").select("*").order("grupo").order("clave"),
      supabase.from("profiles").select("id,username,role,is_admin,created_at").order("username"),
    ]);
    setProcesos(r1.data ?? []);
    setConfig(r2.data ?? []);
    setUsuarios(r3.data ?? []);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, []);

  // ── PROCESOS ─────────────────────────────────────────────────
  async function guardarProceso(id) {
    const cambios = editProc[id];
    if (!cambios || !Object.keys(cambios).length) return;
    const { error } = await supabase.from("procesos").update(cambios).eq("id", id);
    if (error) flash(false, error.message);
    else {
      flash(true, "Proceso actualizado.");
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
      descripcion:      formProc.descripcion.trim() || null,
      area_responsable: formProc.area_responsable.trim() || null,
      genera_alertas:   true,
      activo:           true,
    });
    if (error) return flash(false, error.message);
    flash(true, `Proceso "${formProc.nombre}" creado.`);
    setFormProc({ nombre: "", orden: "", dias_esperados: "", color: "#888888", descripcion: "", area_responsable: "" });
    setShowNuevoProc(false);
    cargar();
  }

  async function moverProceso(id, dir) {
    const idx  = procesos.findIndex(p => p.id === id);
    const swap = procesos[idx + dir];
    if (!swap) return;
    const p = procesos[idx];
    await Promise.all([
      supabase.from("procesos").update({ orden: swap.orden }).eq("id", p.id),
      supabase.from("procesos").update({ orden: p.orden  }).eq("id", swap.id),
    ]);
    cargar();
  }

  async function eliminarProceso(id) {
    if (!window.confirm("¿Eliminar este proceso?")) return;
    await supabase.from("procesos").delete().eq("id", id);
    cargar();
  }

  // ── USUARIOS ─────────────────────────────────────────────────
  async function crearUsuario(e) {
    e.preventDefault();
    if (!formUser.username.trim() || !formUser.password) return flash(false, "Usuario y contraseña obligatorios.");
    const email = `${formUser.username.trim().toLowerCase()}@klasea.local`;
    const { data, error } = await supabase.auth.signUp({
      email, password: formUser.password,
      options: { data: { username: formUser.username.trim(), role: formUser.role }, emailRedirectTo: undefined },
    });
    if (error) return flash(false, "Error al crear: " + error.message);
    const userId = data?.user?.id;
    if (userId) {
      await supabase.from("profiles").upsert({
        id: userId, username: formUser.username.trim().toUpperCase(),
        role: formUser.role, is_admin: formUser.is_admin,
      }, { onConflict: "id" });
    }
    flash(true, `Usuario "${formUser.username.toUpperCase()}" creado.`);
    setShowNuevoUser(false);
    setFormUser({ username: "", password: "", role: "panol", is_admin: false });
    cargar();
  }

  async function guardarRolUsuario() {
    if (!editUserModal) return;
    const { error } = await supabase.from("profiles").update({
      role: formEditUser.role, is_admin: formEditUser.is_admin,
    }).eq("id", editUserModal.id);
    if (error) flash(false, error.message);
    else { flash(true, "Rol actualizado."); setEditUserModal(null); cargar(); }
  }

  // ── CONFIG SISTEMA ────────────────────────────────────────────
  async function guardarConfig(clave) {
    const valor = editConf[clave];
    if (valor === undefined) return;
    const { error } = await supabase.from("sistema_config")
      .update({ valor: String(valor), updated_at: new Date().toISOString() }).eq("clave", clave);
    if (error) flash(false, error.message);
    else {
      flash(true, "Guardado.");
      setEditConf(p => { const n = { ...p }; delete n[clave]; return n; });
      cargar();
    }
  }

  const configGrupos = useMemo(() => {
    const g = {};
    config.forEach(c => { if (!g[c.grupo]) g[c.grupo] = []; g[c.grupo].push(c); });
    return g;
  }, [config]);

  // ── ESTILOS ───────────────────────────────────────────────────
  const S = {
    page:    { background: "#000", minHeight: "100vh", color: "#b8b8b8", fontFamily: "Roboto, system-ui, Arial" },
    layout:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:    { padding: "24px 28px", overflowY: "auto" },
    content: { width: "min(1100px,100%)", margin: "0 auto" },

    card:    { border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, background: "#070707", padding: "18px 20px", marginBottom: 12 },
    input:   { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#d0d0d0", padding: "8px 12px", borderRadius: 10, fontSize: 13, width: "100%", outline: "none" },
    label:   { fontSize: 10, letterSpacing: 1.8, color: "#484848", display: "block", marginBottom: 5, textTransform: "uppercase" },

    btn:     { border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)", color: "#b0b0b0", padding: "7px 14px", borderRadius: 10, cursor: "pointer", fontSize: 12 },
    btnPrim: { border: "none", background: "#c8c8c8", color: "#000", padding: "8px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 },
    btnSm:   { border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#555", padding: "3px 8px", borderRadius: 7, cursor: "pointer", fontSize: 11 },
    btnDanger:{ border: "1px solid rgba(220,80,80,0.2)", background: "transparent", color: "#d06060", padding: "3px 8px", borderRadius: 7, cursor: "pointer", fontSize: 11 },

    th: { padding: "8px 12px", textAlign: "left", fontSize: 10, letterSpacing: 1.5, color: "#383838", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.05)", textTransform: "uppercase" },
    td: { padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,0.035)", verticalAlign: "middle" },

    tabBtn: (act) => ({
      border: act ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
      background: act ? "rgba(255,255,255,0.06)" : "transparent",
      color: act ? "#d0d0d0" : "#404040",
      padding: "7px 18px", borderRadius: 10, cursor: "pointer", fontSize: 12,
    }),

    toggle: (on) => ({
      width: 32, height: 18, borderRadius: 99,
      background: on ? "#b0b0b0" : "rgba(255,255,255,0.08)",
      position: "relative", cursor: "pointer", border: "none",
      transition: "background 0.18s", flexShrink: 0,
    }),
    toggleDot: (on) => ({
      position: "absolute", top: 3, left: on ? 15 : 3,
      width: 12, height: 12, borderRadius: "50%",
      background: on ? "#000" : "#3a3a3a",
      transition: "left 0.18s",
    }),

    roleBadge: (role) => {
      const colors = { admin: "#b0b0b0", oficina: "#7888a8", panol: "#608870", laminacion: "#507880", muebles: "#807850", mecanica: "#805050", electricidad: "#805030" };
      const c = colors[role] ?? "#585858";
      return { fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: `${c}14`, color: c, border: `1px solid ${c}28`, letterSpacing: 0.5 };
    },

    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "center", alignItems: "flex-start", zIndex: 9999, padding: "40px 20px", overflowY: "auto" },
    modal:   { background: "#090909", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: 26, width: "100%", maxWidth: 500 },
  };

  if (!isAdmin) {
    return (
      <div style={S.page}>
        <div style={S.layout}>
          <Sidebar profile={profile} signOut={signOut} />
          <main style={S.main}>
            <div style={{ ...S.card, textAlign: "center", padding: 60, color: "#282828" }}>
              Solo administradores pueden acceder.
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

            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 9, letterSpacing: 3, color: "#242424", marginBottom: 6, textTransform: "uppercase" }}>
                Sistema
              </div>
              <h1 style={{ fontFamily: "Montserrat, system-ui", fontSize: 22, margin: 0, color: "#d8d8d8", fontWeight: 700 }}>
                Configuración
              </h1>
            </div>

            {err && <div style={{ ...S.card, borderColor: "rgba(210,80,80,0.2)", color: "#d08080", marginBottom: 12 }}>{err}</div>}
            {msg && <div style={{ ...S.card, borderColor: "rgba(80,180,100,0.2)", color: "#80c890", marginBottom: 12 }}>{msg}</div>}

            <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
              {TABS.map(t => (
                <button key={t} style={S.tabBtn(tab === t)} onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>

            {loading ? (
              <div style={{ color: "#282828", fontSize: 13, padding: "30px 0" }}>Cargando…</div>
            ) : (
              <>

                {/* ══ PROCESOS ══════════════════════════════════════════ */}
                {tab === "Procesos" && (
                  <div style={S.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div>
                        <div style={{ color: "#d0d0d0", fontWeight: 600 }}>Etapas de producción</div>
                        <div style={{ fontSize: 11, color: "#484848", marginTop: 2 }}>
                          {procesos.length} etapas · nombre, área y días son editables inline
                        </div>
                      </div>
                      <button style={S.btnPrim} onClick={() => setShowNuevoProc(true)}>+ Nueva etapa</button>
                    </div>

                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={S.th}>Orden</th>
                          <th style={S.th}>Nombre</th>
                          <th style={S.th}>Área</th>
                          <th style={S.th}>Días est.</th>
                          <th style={S.th}>Alertas</th>
                          <th style={S.th}>Activo</th>
                          <th style={S.th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {procesos.map((p, idx) => {
                          const ed      = editProc[p.id] ?? {};
                          const changed = Object.keys(ed).length > 0;
                          return (
                            <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.3 }}>
                              <td style={S.td}>
                                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                                  <button style={S.btnSm} onClick={() => moverProceso(p.id, -1)} disabled={idx === 0}>↑</button>
                                  <span style={{ fontSize: 11, color: "#404040", minWidth: 18, textAlign: "center" }}>{p.orden}</span>
                                  <button style={S.btnSm} onClick={() => moverProceso(p.id, 1)} disabled={idx === procesos.length - 1}>↓</button>
                                </div>
                              </td>

                              <td style={S.td}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {p.color && <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, flexShrink: 0 }} />}
                                  <input
                                    style={{ ...S.input, width: 170, padding: "5px 8px", fontSize: 12 }}
                                    value={ed.nombre ?? p.nombre}
                                    onChange={e => setEditProc(prev => ({ ...prev, [p.id]: { ...prev[p.id], nombre: e.target.value } }))}
                                  />
                                </div>
                              </td>

                              <td style={S.td}>
                                <input
                                  style={{ ...S.input, width: 110, padding: "5px 8px", fontSize: 12 }}
                                  placeholder="—"
                                  value={ed.area_responsable ?? (p.area_responsable || "")}
                                  onChange={e => setEditProc(prev => ({ ...prev, [p.id]: { ...prev[p.id], area_responsable: e.target.value } }))}
                                />
                              </td>

                              <td style={S.td}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <input
                                    type="number" min="0" step="0.5"
                                    style={{ ...S.input, width: 52, padding: "5px 8px", fontSize: 12, textAlign: "right" }}
                                    value={ed.dias_esperados ?? (p.dias_esperados ?? "")}
                                    onChange={e => setEditProc(prev => ({ ...prev, [p.id]: { ...prev[p.id], dias_esperados: e.target.value } }))}
                                  />
                                  <span style={{ fontSize: 10, color: "#383838" }}>d</span>
                                </div>
                              </td>

                              <td style={S.td}>
                                <button
                                  style={S.toggle(ed.genera_alertas ?? p.genera_alertas)}
                                  onClick={() => setEditProc(prev => ({ ...prev, [p.id]: { ...prev[p.id], genera_alertas: !(ed.genera_alertas ?? p.genera_alertas) } }))}>
                                  <div style={S.toggleDot(ed.genera_alertas ?? p.genera_alertas)} />
                                </button>
                              </td>

                              <td style={S.td}>
                                <button style={S.toggle(p.activo)} onClick={() => toggleProceso(p.id, p.activo)}>
                                  <div style={S.toggleDot(p.activo)} />
                                </button>
                              </td>

                              <td style={S.td}>
                                <div style={{ display: "flex", gap: 5 }}>
                                  {changed && (
                                    <button style={{ ...S.btnPrim, fontSize: 11, padding: "4px 12px" }} onClick={() => guardarProceso(p.id)}>
                                      Guardar
                                    </button>
                                  )}
                                  <button style={S.btnDanger} onClick={() => eliminarProceso(p.id)}>×</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {!procesos.length && (
                          <tr><td colSpan={7} style={{ ...S.td, color: "#2a2a2a", textAlign: "center", padding: 24 }}>
                            Sin etapas. Creá la primera con el botón + Nueva etapa.
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ══ USUARIOS ══════════════════════════════════════════ */}
                {tab === "Usuarios" && (
                  <div style={S.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div>
                        <div style={{ color: "#d0d0d0", fontWeight: 600 }}>Usuarios del sistema</div>
                        <div style={{ fontSize: 11, color: "#484848", marginTop: 2 }}>{usuarios.length} usuarios</div>
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
                          <th style={S.th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {usuarios.map(u => (
                          <tr key={u.id}>
                            <td style={S.td}>
                              <div style={{ color: "#c8c8c8", fontWeight: 500, fontSize: 13 }}>{u.username}</div>
                              <div style={{ fontSize: 10, color: "#2a2a2a", marginTop: 1 }}>{u.id.slice(0, 8)}…</div>
                            </td>
                            <td style={S.td}><span style={S.roleBadge(u.role)}>{u.role}</span></td>
                            <td style={S.td}>
                              {u.is_admin
                                ? <span style={{ fontSize: 11, color: "#b0b0b0" }}>Admin</span>
                                : <span style={{ fontSize: 11, color: "#242424" }}>—</span>}
                            </td>
                            <td style={S.td}>
                              <span style={{ fontSize: 11, color: "#404040" }}>
                                {u.created_at ? new Date(u.created_at).toLocaleDateString("es-AR") : "—"}
                              </span>
                            </td>
                            <td style={S.td}>
                              <button style={S.btnSm} onClick={() => {
                                setEditUserModal(u);
                                setFormEditUser({ role: u.role, is_admin: u.is_admin });
                              }}>
                                Editar rol
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!usuarios.length && (
                          <tr><td colSpan={5} style={{ ...S.td, color: "#2a2a2a", textAlign: "center", padding: 24 }}>Sin usuarios.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ══ SISTEMA ═══════════════════════════════════════════ */}
                {tab === "Sistema" && (
                  Object.keys(configGrupos).length === 0 ? (
                    <div style={{ ...S.card, color: "#2a2a2a", textAlign: "center", padding: 30 }}>
                      Sin configuración. Ejecutá sistema_produccion.sql primero.
                    </div>
                  ) : (
                    Object.entries(configGrupos).map(([grupo, items]) => (
                      <div key={grupo} style={S.card}>
                        <div style={{ fontSize: 9, letterSpacing: 3, color: "#303030", marginBottom: 14, textTransform: "uppercase", fontWeight: 600 }}>
                          {grupo}
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <tbody>
                            {items.map(c => (
                              <tr key={c.clave}>
                                <td style={S.td}>
                                  <div style={{ color: "#b8b8b8", fontSize: 13 }}>{c.descripcion ?? c.clave}</div>
                                  <div style={{ fontSize: 10, color: "#2a2a2a", marginTop: 1 }}>{c.clave}</div>
                                </td>
                                <td style={{ ...S.td, width: 200 }}>
                                  <input
                                    style={{ ...S.input, padding: "6px 10px" }}
                                    value={editConf[c.clave] ?? c.valor}
                                    onChange={e => setEditConf(prev => ({ ...prev, [c.clave]: e.target.value }))}
                                  />
                                </td>
                                <td style={{ ...S.td, width: 90 }}>
                                  {editConf[c.clave] !== undefined ? (
                                    <button style={{ ...S.btnPrim, fontSize: 11, padding: "4px 12px" }} onClick={() => guardarConfig(c.clave)}>
                                      Guardar
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: 11, color: "#242424" }}>—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))
                  )
                )}

              </>
            )}
          </div>

          {/* ── MODAL NUEVO PROCESO ──────────────────────────────── */}
          {showNuevoProc && (
            <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowNuevoProc(false)}>
              <div style={S.modal}>
                <h2 style={{ margin: "0 0 20px", color: "#d8d8d8", fontSize: 15, fontFamily: "Montserrat, system-ui" }}>
                  Nueva etapa de producción
                </h2>
                <form onSubmit={crearProceso}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>Nombre *</label>
                    <input style={S.input} required placeholder="Ej: Electricidad"
                      value={formProc.nombre} onChange={e => setFormProc(f => ({ ...f, nombre: e.target.value }))} autoFocus />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={S.label}>Área responsable</label>
                      <input style={S.input} placeholder="Mecánica, Laminación…"
                        value={formProc.area_responsable} onChange={e => setFormProc(f => ({ ...f, area_responsable: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Días estimados</label>
                      <input type="number" min="0" step="0.5" style={S.input}
                        value={formProc.dias_esperados} onChange={e => setFormProc(f => ({ ...f, dias_esperados: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 60px", gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={S.label}>Descripción</label>
                      <input style={S.input} value={formProc.descripcion}
                        onChange={e => setFormProc(f => ({ ...f, descripcion: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Orden</label>
                      <input type="number" style={S.input} value={formProc.orden}
                        onChange={e => setFormProc(f => ({ ...f, orden: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={S.label}>Color</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="color" style={{ width: 32, height: 30, borderRadius: 6, border: "none", background: "none", cursor: "pointer" }}
                        value={formProc.color} onChange={e => setFormProc(f => ({ ...f, color: e.target.value }))} />
                      <input style={{ ...S.input, flex: 1 }} value={formProc.color}
                        onChange={e => setFormProc(f => ({ ...f, color: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={S.btnPrim}>Crear</button>
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
                <h2 style={{ margin: "0 0 4px", color: "#d8d8d8", fontSize: 15, fontFamily: "Montserrat, system-ui" }}>Nuevo usuario</h2>
                <div style={{ fontSize: 11, color: "#404040", marginBottom: 20 }}>Email: usuario@klasea.local</div>
                <form onSubmit={crearUsuario}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>Nombre de usuario *</label>
                    <input style={S.input} placeholder="ADMIN1, PANOL2…" required
                      value={formUser.username} onChange={e => setFormUser(f => ({ ...f, username: e.target.value }))} autoFocus />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>Contraseña *</label>
                    <input type="password" style={S.input} required
                      value={formUser.password} onChange={e => setFormUser(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                    <div>
                      <label style={S.label}>Rol</label>
                      <select style={S.input} value={formUser.role}
                        onChange={e => setFormUser(f => ({ ...f, role: e.target.value }))}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Permisos</label>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, cursor: "pointer" }}>
                        <button type="button" style={S.toggle(formUser.is_admin)}
                          onClick={() => setFormUser(f => ({ ...f, is_admin: !f.is_admin }))}>
                          <div style={S.toggleDot(formUser.is_admin)} />
                        </button>
                        <span style={{ fontSize: 12, color: "#808080" }}>Administrador</span>
                      </label>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#706040", marginBottom: 14, padding: "8px 12px", background: "rgba(190,150,50,0.05)", border: "1px solid rgba(190,150,50,0.12)", borderRadius: 8 }}>
                    Si Supabase requiere confirmación de email, activar el usuario desde el panel Auth.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={S.btnPrim}>Crear usuario</button>
                    <button type="button" style={S.btn} onClick={() => setShowNuevoUser(false)}>Cancelar</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ── MODAL EDITAR ROL ─────────────────────────────────── */}
          {editUserModal && (
            <div style={S.overlay} onClick={e => e.target === e.currentTarget && setEditUserModal(null)}>
              <div style={S.modal}>
                <h2 style={{ margin: "0 0 4px", color: "#d8d8d8", fontSize: 15, fontFamily: "Montserrat, system-ui" }}>Editar rol</h2>
                <div style={{ fontSize: 12, color: "#505050", marginBottom: 20 }}>{editUserModal.username}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                  <div>
                    <label style={S.label}>Rol</label>
                    <select style={S.input} value={formEditUser.role}
                      onChange={e => setFormEditUser(f => ({ ...f, role: e.target.value }))}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Administrador</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, cursor: "pointer" }}>
                      <button type="button" style={S.toggle(formEditUser.is_admin)}
                        onClick={() => setFormEditUser(f => ({ ...f, is_admin: !f.is_admin }))}>
                        <div style={S.toggleDot(formEditUser.is_admin)} />
                      </button>
                      <span style={{ fontSize: 12, color: "#808080" }}>Admin</span>
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

        </main>
      </div>
    </div>
  );
}
