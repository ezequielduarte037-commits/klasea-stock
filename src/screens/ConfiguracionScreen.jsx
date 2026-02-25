import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import NotificacionesBell from "../components/NotificacionesBell";

// ─── utils ────────────────────────────────────────────────────────────────────
const ROLES = ["admin", "oficina", "laminacion", "muebles", "panol", "mecanica", "electricidad"];

const ROLE_META = {
  admin:        { color: "#8888a8", label: "Admin"         },
  oficina:      { color: "#6878a0", label: "Oficina"       },
  laminacion:   { color: "#4a7888", label: "Laminación"    },
  muebles:      { color: "#788050", label: "Muebles"       },
  panol:        { color: "#507860", label: "Pañol"         },
  mecanica:     { color: "#786060", label: "Mecánica"      },
  electricidad: { color: "#a09060", label: "Electricidad"  },
};

// ─── sub-components ───────────────────────────────────────────────────────────
function Toggle({ on, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      style={{
        width: 34, height: 19, borderRadius: 99, border: "none", flexShrink: 0,
        background: on ? "rgba(160,160,180,0.5)" : "rgba(255,255,255,0.07)",
        position: "relative", cursor: disabled ? "not-allowed" : "pointer",
        transition: "background .2s", opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{
        position: "absolute",
        top: 3, left: on ? 16 : 3,
        width: 13, height: 13, borderRadius: "50%",
        background: on ? "#d0d0d0" : "#383838",
        transition: "left .18s, background .18s",
        boxShadow: on ? "0 1px 4px rgba(0,0,0,0.5)" : "none",
      }} />
    </button>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 10000,
      padding: "11px 20px", borderRadius: 9, fontSize: 12,
      fontFamily: "'Outfit', system-ui",
      background: toast.ok ? "#091510" : "#150909",
      border: `1px solid ${toast.ok ? "rgba(60,140,80,0.5)" : "rgba(180,60,60,0.5)"}`,
      color: toast.ok ? "#70c080" : "#c07070",
      boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
      animation: "toastIn .2s ease",
      letterSpacing: 0.3,
    }}>
      {toast.text}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function ConfiguracionScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin || profile?.role === "admin";

  const [tab,      setTab]      = useState("usuarios");
  const [config,   setConfig]   = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);

  // ── usuarios state ────────────────────────────────────────────
  const [showNewUser,   setShowNewUser]   = useState(false);
  const [newUser,       setNewUser]       = useState({ username: "", password: "", role: "panol", is_admin: false });
  const [editUserModal, setEditUserModal] = useState(null);
  const [formEditUser,  setFormEditUser]  = useState({});

  // ── sistema state ─────────────────────────────────────────────
  const [editConf, setEditConf] = useState({});

  function flash(ok, text) {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3000);
  }

  // ── carga ─────────────────────────────────────────────────────
  async function cargar() {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      supabase.from("sistema_config").select("*").order("grupo").order("clave"),
      supabase.from("profiles").select("id,username,role,is_admin,created_at").order("username"),
    ]);
    setConfig(r1.data ?? []);
    setUsuarios(r2.data ?? []);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, []);

  // ── usuarios actions ──────────────────────────────────────────
  async function crearUsuario(e) {
    e.preventDefault();
    if (!newUser.username.trim() || !newUser.password)
      return flash(false, "Usuario y contraseña obligatorios.");

    const { error } = await supabase.rpc("crear_usuario_admin", {
      p_username: newUser.username.trim(),
      p_password: newUser.password,
      p_role:     newUser.role,
      p_is_admin: newUser.is_admin,
    });

    if (error) return flash(false, "Error: " + error.message);
    flash(true, `Usuario ${newUser.username.toUpperCase()} creado.`);
    setShowNewUser(false);
    setNewUser({ username: "", password: "", role: "panol", is_admin: false });
    cargar();
  }

  async function guardarRolUsuario() {
    if (!editUserModal) return;
    const { error } = await supabase.from("profiles")
      .update({ role: formEditUser.role, is_admin: formEditUser.is_admin })
      .eq("id", editUserModal.id);
    if (error) return flash(false, error.message);
    flash(true, "Permisos actualizados.");
    setEditUserModal(null);
    cargar();
  }

  async function eliminarUsuario(id) {
    if (!window.confirm("¿Seguro que querés eliminar este usuario permanentemente?")) return;
    const { error } = await supabase.rpc("borrar_usuario_admin", { p_user_id: id });
    if (error) return flash(false, "Error al eliminar: " + error.message);
    flash(true, "Usuario eliminado.");
    setEditUserModal(null);
    cargar();
  }

  // ── sistema actions ───────────────────────────────────────────
  async function guardarConfig(clave) {
    const valor = editConf[clave];
    if (valor === undefined) return;
    const { error } = await supabase.from("sistema_config")
      .update({ valor: String(valor), updated_at: new Date().toISOString() })
      .eq("clave", clave);
    if (error) return flash(false, error.message);
    flash(true, "Guardado.");
    setEditConf(p => { const n = { ...p }; delete n[clave]; return n; });
    cargar();
  }

  const configGrupos = useMemo(() => {
    const g = {};
    config.forEach(c => { if (!g[c.grupo]) g[c.grupo] = []; g[c.grupo].push(c); });
    return g;
  }, [config]);

  const stats = useMemo(() => ({
    usuariosTotal: usuarios.length,
    admins:        usuarios.filter(u => u.is_admin).length,
  }), [usuarios]);

  // ─── render ───────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div style={{ background: "#09090b", minHeight: "100vh", display: "grid", gridTemplateColumns: "280px 1fr" }}>
        <Sidebar profile={profile} signOut={signOut} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a", fontSize: 12, letterSpacing: 1 }}>
          Solo administradores pueden acceder.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#09090b", minHeight: "100vh", color: "#a1a1aa", fontFamily: "'Outfit', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        button:focus-visible { outline: 1px solid rgba(255,255,255,0.2); outline-offset: 2px; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: rgba(59,130,246,0.35) !important; }
        select option { background: #0f0f12; color: #a1a1aa; }
        @keyframes toastIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        button:not([disabled]):hover { opacity: 0.8; }
        .bg-glow { position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background: radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
                      radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%); }
        .role-card:hover { border-color: rgba(255,255,255,0.1) !important; }
        .cfg-row:hover td { background: rgba(255,255,255,0.012); }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />
        <NotificacionesBell profile={profile} />
        <Toast toast={toast} />

        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

          {/* ── TOPBAR ── */}
          <div style={{
            height: 50, flexShrink: 0, display: "flex", alignItems: "stretch",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(12,12,14,0.92)",
            backdropFilter: "blur(32px) saturate(130%)",
            WebkitBackdropFilter: "blur(32px) saturate(130%)",
            paddingLeft: 28,
          }}>
            {[
              { id: "usuarios", label: "Usuarios" },
              { id: "sistema",  label: "Sistema"  },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                height: "100%", padding: "0 18px",
                border: "none", background: "transparent", cursor: "pointer",
                fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase",
                color: tab === t.id ? "#f4f4f5" : "#52525b",
                borderBottom: tab === t.id ? "2px solid rgba(59,130,246,0.6)" : "2px solid transparent",
                fontWeight: tab === t.id ? 500 : 400,
                transition: "color .15s, border-color .15s",
                fontFamily: "'Outfit', system-ui",
                marginBottom: -1,
              }}>
                {t.label}
              </button>
            ))}

            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 20 }}>
              {[
                { n: stats.usuariosTotal, label: "usuarios", c: "#3b82f6" },
                { n: stats.admins,        label: "admins",   c: "#f59e0b" },
              ].map(({ n, label, c }) => (
                <div key={label} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", borderRadius: 7,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                  borderLeft: `2px solid ${c}`,
                }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, color: c, lineHeight: 1 }}>{n}</span>
                  <span style={{ fontSize: 8, color: "#71717a", letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── CONTENT ── */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
            {loading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a", fontSize: 12 }}>
                Cargando…
              </div>
            ) : (
              <>
                {/* ══════════════ TAB: USUARIOS ══════════════ */}
                {tab === "usuarios" && (
                  <div style={{ flex: 1, overflow: "auto", padding: "22px 28px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#f4f4f5", fontWeight: 500 }}>Usuarios del sistema</div>
                        <div style={{ fontSize: 10, color: "#71717a", marginTop: 3 }}>
                          {usuarios.length} usuarios · {stats.admins} administrador{stats.admins !== 1 ? "es" : ""}
                        </div>
                      </div>
                      <button onClick={() => setShowNewUser(true)} style={Sx.btnPrimary}>
                        + Nuevo usuario
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                      {usuarios.map(u => {
                        const rm       = ROLE_META[u.role] ?? { color: "#505050", label: u.role };
                        const initials = (u.username ?? "?").slice(0, 2).toUpperCase();
                        return (
                          <div key={u.id} className="role-card" style={{
                            border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
                            background: "rgba(255,255,255,0.02)", padding: "14px 16px",
                            display: "flex", flexDirection: "column", gap: 11,
                            transition: "border-color .15s",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{
                                width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                                background: `${rm.color}18`, border: `1px solid ${rm.color}30`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: 12, fontWeight: 600, color: rm.color,
                              }}>
                                {initials}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: "#f4f4f5", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'JetBrains Mono', monospace" }}>
                                  {u.username}
                                </div>
                                <div style={{ fontSize: 9, color: "#52525b", marginTop: 2 }}>{u.id.slice(0, 8)}…</div>
                              </div>
                              {u.is_admin && (
                                <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(130,130,160,0.12)", color: "#7070a0", border: "1px solid rgba(130,130,160,0.18)", letterSpacing: 0.5, textTransform: "uppercase", flexShrink: 0 }}>
                                  Admin
                                </span>
                              )}
                            </div>

                            <div style={{
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                              padding: "7px 10px", borderRadius: 7,
                              background: `${rm.color}0d`, border: `1px solid ${rm.color}20`,
                            }}>
                              <span style={{ fontSize: 10, color: rm.color, letterSpacing: 0.8, textTransform: "uppercase" }}>{rm.label}</span>
                              {u.created_at && (
                                <span style={{ fontSize: 9, color: "#52525b" }}>
                                  {new Date(u.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => { setEditUserModal(u); setFormEditUser({ role: u.role, is_admin: u.is_admin }); }}
                              style={{ ...Sx.btnOutline, width: "100%", textAlign: "center" }}
                            >
                              Editar permisos
                            </button>
                          </div>
                        );
                      })}
                      {!usuarios.length && (
                        <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "40px 0", color: "#71717a", fontSize: 12 }}>
                          Sin usuarios.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ══════════════ TAB: SISTEMA ══════════════ */}
                {tab === "sistema" && (
                  <div style={{ flex: 1, overflow: "auto", padding: "22px 28px" }}>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 13, color: "#f4f4f5", fontWeight: 500 }}>Parámetros del sistema</div>
                      <div style={{ fontSize: 10, color: "#71717a", marginTop: 3 }}>Los cambios se aplican de inmediato</div>
                    </div>

                    {Object.keys(configGrupos).length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px 0", color: "#71717a", fontSize: 12 }}>
                        Sin configuración. Ejecutá el SQL de sistema_produccion primero.
                      </div>
                    ) : Object.entries(configGrupos).map(([grupo, items]) => (
                      <div key={grupo} style={{ marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
                        <div style={{ padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)" }}>
                          <span style={{ fontSize: 9, letterSpacing: 3, color: "#71717a", textTransform: "uppercase", fontWeight: 600 }}>{grupo}</span>
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <tbody>
                            {items.map((c, ci) => {
                              const isDirty = editConf[c.clave] !== undefined;
                              const isBool  = c.tipo === "boolean";
                              const isNum   = c.tipo === "number";
                              const curVal  = editConf[c.clave] ?? c.valor;
                              return (
                                <tr key={c.clave} className="cfg-row" style={{ borderBottom: ci < items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                  <td style={{ padding: "14px 18px", verticalAlign: "middle", width: "50%" }}>
                                    <div style={{ fontSize: 12, color: "#a1a1aa" }}>{c.descripcion ?? c.clave}</div>
                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#52525b", marginTop: 3, letterSpacing: 0.5 }}>{c.clave}</div>
                                  </td>
                                  <td style={{ padding: "14px 18px", verticalAlign: "middle" }}>
                                    {isBool ? (
                                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <Toggle on={curVal === "true"} onChange={() => setEditConf(p => ({ ...p, [c.clave]: curVal === "true" ? "false" : "true" }))} />
                                        <span style={{ fontSize: 11, color: curVal === "true" ? "#707080" : "#282828" }}>
                                          {curVal === "true" ? "Activado" : "Desactivado"}
                                        </span>
                                      </div>
                                    ) : (
                                      <input
                                        type={isNum ? "number" : "text"}
                                        style={{ ...Sx.input, maxWidth: 200, padding: "7px 10px", ...(isNum ? { fontFamily: "'JetBrains Mono', monospace" } : {}) }}
                                        value={curVal}
                                        onChange={e => setEditConf(p => ({ ...p, [c.clave]: e.target.value }))}
                                      />
                                    )}
                                  </td>
                                  <td style={{ padding: "14px 18px", verticalAlign: "middle", textAlign: "right", width: 110 }}>
                                    {isDirty ? (
                                      <button onClick={() => guardarConfig(c.clave)} style={Sx.btnPrimary}>Guardar</button>
                                    ) : (
                                      <span style={{ fontSize: 10, color: "#71717a" }}>—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ══════════════ MODAL: NUEVO USUARIO ══════════════ */}
        {showNewUser && (
          <Overlay onClose={() => setShowNewUser(false)} maxWidth={440}>
            <div style={{ fontSize: 15, color: "#f4f4f5", fontWeight: 500, marginBottom: 4 }}>Nuevo usuario</div>
            <div style={{ fontSize: 10, color: "#71717a", marginBottom: 22 }}>
              El usuario podrá ingresar sin confirmar email.
            </div>

            <form onSubmit={crearUsuario}>
              <Field label="Usuario">
                <input
                  style={Sx.input} required autoFocus autoComplete="off"
                  value={newUser.username}
                  onChange={e => setNewUser(f => ({ ...f, username: e.target.value }))}
                  placeholder="nombre.apellido"
                />
              </Field>
              <Field label="Contraseña">
                <input
                  type="password" style={Sx.input} required autoComplete="new-password"
                  value={newUser.password}
                  onChange={e => setNewUser(f => ({ ...f, password: e.target.value }))}
                />
              </Field>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 9, letterSpacing: 2.2, color: "#71717a", display: "block", marginBottom: 8, textTransform: "uppercase" }}>Rol</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                  {ROLES.map(r => {
                    const rm  = ROLE_META[r] ?? { color: "#505050", label: r };
                    const sel = newUser.role === r;
                    return (
                      <button key={r} type="button" onClick={() => setNewUser(f => ({ ...f, role: r }))}
                        style={{
                          padding: "9px 12px", borderRadius: 7, cursor: "pointer", textAlign: "left",
                          background: sel ? `${rm.color}14` : "rgba(255,255,255,0.02)",
                          border: `1px solid ${sel ? rm.color + "40" : "rgba(255,255,255,0.06)"}`,
                          color: sel ? rm.color : "#52525b",
                          fontSize: 11, fontFamily: "'Outfit', system-ui",
                        }}>
                        {rm.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#a1a1aa" }}>Acceso de administrador</div>
                  <div style={{ fontSize: 9, color: "#52525b", marginTop: 1 }}>Puede editar configuración y usuarios</div>
                </div>
                <Toggle on={newUser.is_admin} onChange={() => setNewUser(f => ({ ...f, is_admin: !f.is_admin }))} />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={Sx.btnPrimary}>Crear usuario</button>
                <button type="button" style={Sx.btnSecondary} onClick={() => setShowNewUser(false)}>Cancelar</button>
              </div>
            </form>
          </Overlay>
        )}

        {/* ══════════════ MODAL: EDITAR ROL ══════════════ */}
        {editUserModal && (
          <Overlay onClose={() => setEditUserModal(null)} maxWidth={400}>
            <div style={{ fontSize: 15, color: "#f4f4f5", fontWeight: 500, marginBottom: 4 }}>Permisos de acceso</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#71717a", marginBottom: 22 }}>
              {editUserModal.username}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 9, letterSpacing: 2.2, color: "#71717a", display: "block", marginBottom: 8, textTransform: "uppercase" }}>Rol</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                {ROLES.map(r => {
                  const rm  = ROLE_META[r] ?? { color: "#505050", label: r };
                  const sel = formEditUser.role === r;
                  return (
                    <button key={r} type="button" onClick={() => setFormEditUser(f => ({ ...f, role: r }))}
                      style={{
                        padding: "9px 12px", borderRadius: 7, cursor: "pointer", textAlign: "left",
                        background: sel ? `${rm.color}14` : "rgba(255,255,255,0.02)",
                        border: `1px solid ${sel ? rm.color + "40" : "rgba(255,255,255,0.06)"}`,
                        color: sel ? rm.color : "#52525b",
                        fontSize: 11, fontFamily: "'Outfit', system-ui",
                      }}>
                      {rm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 12, color: "#a1a1aa" }}>Acceso de administrador</div>
                <div style={{ fontSize: 9, color: "#52525b", marginTop: 1 }}>Configuración, usuarios y sistema</div>
              </div>
              <Toggle on={formEditUser.is_admin ?? false} onChange={() => setFormEditUser(f => ({ ...f, is_admin: !f.is_admin }))} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button style={Sx.btnPrimary} onClick={guardarRolUsuario}>Guardar cambios</button>
              <button style={Sx.btnSecondary} onClick={() => setEditUserModal(null)}>Cancelar</button>
              <div style={{ flex: 1 }} />
              <button style={{ ...Sx.btnOutline, color: "#c07070", borderColor: "rgba(184,80,80,0.3)" }} onClick={() => eliminarUsuario(editUserModal.id)}>
                Eliminar
              </button>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 9, letterSpacing: 2.2, color: "#71717a", display: "block", marginBottom: 5, textTransform: "uppercase", fontFamily: "'Outfit', system-ui" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Overlay({ onClose, children, maxWidth = 500 }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(9,9,11,0.88)", backdropFilter: "blur(40px) saturate(140%)", WebkitBackdropFilter: "blur(40px) saturate(140%)", display: "flex", justifyContent: "center", alignItems: "flex-start", zIndex: 9999, padding: "40px 16px", overflowY: "auto" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "rgba(6,10,22,0.96)", backdropFilter: "blur(60px)", WebkitBackdropFilter: "blur(60px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "26px 26px", width: "100%", maxWidth, animation: "slideUp .2s ease", fontFamily: "'Outfit', system-ui", boxShadow: "0 32px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
        {children}
      </div>
    </div>
  );
}

const Sx = {
  input: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    color: "#f4f4f5", padding: "8px 12px", borderRadius: 8, fontSize: 13,
    width: "100%", outline: "none", fontFamily: "'Outfit', system-ui",
  },
  btnPrimary: {
    border: "none", background: "rgba(255,255,255,0.92)", color: "#080c14", padding: "9px 20px",
    borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Outfit', system-ui",
  },
  btnSecondary: {
    border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
    color: "#a1a1aa", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "'Outfit', system-ui",
  },
  btnOutline: {
    border: "1px solid rgba(255,255,255,0.08)", background: "transparent",
    color: "#71717a", padding: "6px 10px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: "'Outfit', system-ui",
  },
};
