import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import NotificacionesBell from "../components/NotificacionesBell";

// ─── utils ────────────────────────────────────────────────────────────────────
const num = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

const ROLES = ["admin", "oficina", "laminacion", "muebles", "panol", "mecanica", "electricidad"];

const ROLE_META = {
  admin:        { color: "#8888a8", accent: "#5a5a80", label: "Admin"         },
  oficina:      { color: "#6878a0", accent: "#485878", label: "Oficina"       },
  laminacion:   { color: "#4a7888", accent: "#345868", label: "Laminación"    },
  muebles:      { color: "#788050", accent: "#585830", label: "Muebles"       },
  panol:        { color: "#507860", accent: "#385848", label: "Pañol"         },
  mecanica:     { color: "#786060", accent: "#584040", label: "Mecánica"      },
  electricidad: { color: "#7a7050", accent: "#5a5030", label: "Electricidad"  },
};

const COLOR_PRESETS = [
  "#5a7a9a", "#6a8a5a", "#9a7a4a", "#7a5a9a",
  "#9a5858", "#4a8878", "#8a7848", "#607090",
];

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

// Drag-and-drop list
function DragList({ items, onReorder, renderItem }) {
  const dragging = useRef(null);
  const [overIdx, setOverIdx] = useState(null);

  const handleDragStart = (i) => { dragging.current = i; };
  const handleDragOver  = (e, i) => { e.preventDefault(); setOverIdx(i); };
  const handleDrop      = (e, i) => {
    e.preventDefault();
    if (dragging.current === null || dragging.current === i) { setOverIdx(null); return; }
    const next = [...items];
    const [moved] = next.splice(dragging.current, 1);
    next.splice(i, 0, moved);
    dragging.current = null;
    setOverIdx(null);
    onReorder(next);
  };

  return (
    <div>
      {items.map((item, i) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => handleDragStart(i)}
          onDragOver={e => handleDragOver(e, i)}
          onDrop={e => handleDrop(e, i)}
          onDragEnd={() => { dragging.current = null; setOverIdx(null); }}
          style={{
            opacity: dragging.current === i ? 0.2 : 1,
            borderTop: overIdx === i && dragging.current !== i
              ? "2px solid rgba(200,200,200,0.3)"
              : "2px solid transparent",
          }}
        >
          {renderItem(item, i)}
        </div>
      ))}
    </div>
  );
}

// Toast de notificaciones
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 10000,
      padding: "11px 20px", borderRadius: 9, fontSize: 12,
      fontFamily: "'IBM Plex Sans', system-ui",
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

  // ── data ──────────────────────────────────────────────────────
  const [tab,      setTab]      = useState("procesos");
  const [procesos, setProcesos] = useState([]);
  const [config,   setConfig]   = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);

  // ── procesos state ────────────────────────────────────────────
  const [selProcId,   setSelProcId]   = useState(null);
  const [editForm,    setEditForm]    = useState({});
  const [formDirty,   setFormDirty]   = useState(false);
  const [showNewProc, setShowNewProc] = useState(false);
  const [newProc,     setNewProc]     = useState({
    nombre: "", area_responsable: "", dias_esperados: "7",
    color: "#5a7a9a", descripcion: "",
  });

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

  // Sync edit form cuando cambia la selección de proceso
  useEffect(() => {
    if (!selProcId) return;
    const p = procesos.find(x => x.id === selProcId);
    if (!p) return;
    setEditForm({
      nombre:           p.nombre           ?? "",
      area_responsable: p.area_responsable ?? "",
      dias_esperados:   p.dias_esperados   ?? 0,
      color:            p.color            ?? "#5a7a9a",
      descripcion:      p.descripcion      ?? "",
      genera_alertas:   p.genera_alertas   ?? true,
      activo:           p.activo           ?? true,
    });
    setFormDirty(false);
  }, [selProcId]);   // procesos cambia tras cargar, no re-sync si editando

  // ── procesos actions ──────────────────────────────────────────
  function ef(key, val) {
    setEditForm(f => ({ ...f, [key]: val }));
    setFormDirty(true);
  }

  async function guardarProceso() {
    if (!selProcId) return;
    const { error } = await supabase.from("procesos").update({
      nombre:           editForm.nombre,
      area_responsable: editForm.area_responsable || null,
      dias_esperados:   num(editForm.dias_esperados),
      color:            editForm.color,
      descripcion:      editForm.descripcion || null,
      genera_alertas:   editForm.genera_alertas,
      activo:           editForm.activo,
    }).eq("id", selProcId);
    if (error) return flash(false, error.message);
    flash(true, "Etapa guardada.");
    setFormDirty(false);
    cargar();
  }

  async function crearProceso(e) {
    e.preventDefault();
    if (!newProc.nombre.trim()) return flash(false, "Nombre obligatorio.");
    const maxOrden = Math.max(0, ...procesos.map(p => p.orden ?? 0));
    const { data, error } = await supabase.from("procesos").insert({
      nombre:           newProc.nombre.trim(),
      area_responsable: newProc.area_responsable.trim() || null,
      dias_esperados:   num(newProc.dias_esperados),
      color:            newProc.color,
      descripcion:      newProc.descripcion.trim() || null,
      orden:            maxOrden + 1,
      genera_alertas:   true,
      activo:           true,
    }).select().single();
    if (error) return flash(false, error.message);
    flash(true, `Etapa "${newProc.nombre}" creada.`);
    setNewProc({ nombre: "", area_responsable: "", dias_esperados: "7", color: "#5a7a9a", descripcion: "" });
    setShowNewProc(false);
    await cargar();
    if (data?.id) setSelProcId(data.id);
  }

  async function reordenarProcesos(newList) {
    const updates = newList.map((p, i) =>
      supabase.from("procesos").update({ orden: i + 1 }).eq("id", p.id)
    );
    await Promise.all(updates);
    cargar();
  }

  async function eliminarProceso() {
    if (!selProcId) return;
    if (!window.confirm("¿Eliminar esta etapa permanentemente?")) return;
    await supabase.from("procesos").delete().eq("id", selProcId);
    setSelProcId(null);
    flash(true, "Etapa eliminada.");
    cargar();
  }

  // ── usuarios actions ──────────────────────────────────────────
  async function crearUsuario(e) {
    e.preventDefault();
    if (!newUser.username.trim() || !newUser.password)
      return flash(false, "Usuario y contraseña obligatorios.");
    const email = `${newUser.username.trim().toLowerCase()}@klasea.local`;
    const { data, error } = await supabase.auth.signUp({
      email, password: newUser.password,
      options: { data: { username: newUser.username.trim(), role: newUser.role } },
    });
    if (error) return flash(false, error.message);
    const uid = data?.user?.id;
    if (uid) {
      await supabase.from("profiles").upsert({
        id: uid,
        username: newUser.username.trim().toUpperCase(),
        role:     newUser.role,
        is_admin: newUser.is_admin,
      }, { onConflict: "id" });
    }
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

// ── usuarios actions ──────────────────────────────────────────
  async function crearUsuario(e) {
    e.preventDefault();
    if (!newUser.username.trim() || !newUser.password) {
      return flash(false, "Usuario y contraseña obligatorios.");
    }
    
    // Llamamos a la nueva función SQL secreta de creación de usuarios
    const { error } = await supabase.rpc("crear_usuario_admin", {
      p_username: newUser.username.trim(),
      p_password: newUser.password,
      p_role:     newUser.role,
      p_is_admin: newUser.is_admin
    });

    if (error) {
      console.error(error);
      return flash(false, "Error: " + error.message);
    }
    
    flash(true, `Usuario ${newUser.username.toUpperCase()} creado.`);
    setShowNewUser(false);
    setNewUser({ username: "", password: "", role: "panol", is_admin: false });
    cargar();
  }

  // ─── render ───────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div style={{ background: "#000", minHeight: "100vh", display: "grid", gridTemplateColumns: "280px 1fr" }}>
        <Sidebar profile={profile} signOut={signOut} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#252525", fontSize: 12, letterSpacing: 1 }}>
          Solo administradores pueden acceder.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "#000", minHeight: "100vh",
      color: "#b0b0b0",
      fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
      display: "grid", gridTemplateColumns: "280px 1fr",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 99px; }
        button:focus-visible { outline: 1px solid rgba(255,255,255,0.2); outline-offset: 2px; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: rgba(255,255,255,0.2) !important; }
        input[type=color] { padding: 0 2px; cursor: pointer; }
        select option { background: #0d0d0d; color: #c0c0c0; }
        @keyframes toastIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .proc-row:hover { background: rgba(255,255,255,0.025) !important; }
        .proc-row.sel   { background: rgba(255,255,255,0.045) !important; }
        .role-card:hover { border-color: rgba(255,255,255,0.1) !important; }
        .cfg-row:hover td { background: rgba(255,255,255,0.012); }
      `}</style>

      <Sidebar profile={profile} signOut={signOut} />
      <NotificacionesBell profile={profile} />
      <Toast toast={toast} />

      {/* ── right side ── */}
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

        {/* ── TOPBAR ── */}
        <div style={{
          height: 52, flexShrink: 0, display: "flex", alignItems: "stretch",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "#050505",
          paddingLeft: 28,
        }}>
          {/* Tabs */}
          {[
            { id: "procesos", label: "Etapas" },
            { id: "usuarios", label: "Usuarios" },
            { id: "sistema",  label: "Sistema"  },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                height: "100%", padding: "0 22px",
                border: "none", background: "transparent", cursor: "pointer",
                fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase",
                color: tab === t.id ? "#d0d0d0" : "#303030",
                borderBottom: tab === t.id
                  ? "2px solid rgba(200,200,200,0.55)"
                  : "2px solid transparent",
                fontWeight: tab === t.id ? 500 : 400,
                transition: "color .15s, border-color .15s",
                fontFamily: "'IBM Plex Sans', system-ui",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}

          {/* Stats — spacer then right side */}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 28, paddingRight: 28 }}>
            {[
              { n: stats.procsActivos,  label: "etapas",   c: "#508068" },
              { n: stats.usuariosTotal, label: "usuarios",  c: "#506880" },
              { n: stats.admins,        label: "admins",    c: "#806858" },
            ].map(({ n, label, c }) => (
              <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 600, color: c, lineHeight: 1 }}>{n}</span>
                <span style={{ fontSize: 9, color: "#242424", letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── CONTENT ── */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
          {loading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#1e1e1e", fontSize: 12 }}>
              Cargando…
            </div>
          ) : (
            <>

              {/* ════════════════════════════════════════════════════
                  TAB: ETAPAS — Split panel
              ════════════════════════════════════════════════════ */}
              {tab === "procesos" && (
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 340px", overflow: "hidden" }}>

                  {/* LEFT — lista drag-and-drop */}
                  <div style={{ overflow: "auto", padding: "22px 20px 22px 28px", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#c0c0c0", fontWeight: 500 }}>Etapas de producción</div>
                        <div style={{ fontSize: 10, color: "#343434", marginTop: 3 }}>
                          Arrastrá ⠿ para reordenar · clic para editar
                        </div>
                      </div>
                      <button
                        onClick={() => setShowNewProc(true)}
                        style={{ border: "none", background: "#b8b8b8", color: "#000", padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 11, letterSpacing: 0.5, fontFamily: "'IBM Plex Sans', system-ui" }}
                      >
                        + Nueva etapa
                      </button>
                    </div>

                    <DragList
                      items={procesos}
                      onReorder={reordenarProcesos}
                      renderItem={(p) => {
                        const isSel   = selProcId === p.id;
                        const barPct  = Math.round((num(p.dias_esperados) / maxDias) * 100);
                        const rm      = ROLE_META[p.area_responsable?.toLowerCase()];
                        return (
                          <div
                            className={`proc-row${isSel ? " sel" : ""}`}
                            onClick={() => setSelProcId(isSel ? null : p.id)}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "20px 4px 1fr auto",
                              gap: 10, alignItems: "center",
                              padding: "9px 12px", borderRadius: 8, marginBottom: 2,
                              cursor: "pointer", userSelect: "none",
                              background: isSel ? undefined : "transparent",
                              border: `1px solid ${isSel ? "rgba(255,255,255,0.1)" : "transparent"}`,
                              opacity: p.activo ? 1 : 0.28,
                              transition: "border-color .12s, background .12s",
                            }}
                          >
                            {/* drag handle */}
                            <span style={{ color: "#262626", fontSize: 14, cursor: "grab", textAlign: "center", lineHeight: 1 }}>⠿</span>

                            {/* color stripe */}
                            <div style={{ width: 3, height: 32, borderRadius: 2, background: p.color ?? "#3a3a3a", opacity: p.activo ? 0.7 : 0.3 }} />

                            {/* info */}
                            <div>
                              <div style={{ fontSize: 13, color: isSel ? "#e0e0e0" : "#888", fontWeight: isSel ? 500 : 400, lineHeight: 1.3 }}>
                                {p.nombre}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
                                {/* días bar */}
                                <div style={{ width: 80, height: 2, background: "#111", borderRadius: 99 }}>
                                  <div style={{ width: `${barPct}%`, height: "100%", background: p.color ?? "#444", borderRadius: 99, opacity: 0.55 }} />
                                </div>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#343434" }}>
                                  {p.dias_esperados ?? 0}d
                                </span>
                                {p.area_responsable && (
                                  <span style={{ fontSize: 9, color: rm?.color ?? "#343434", letterSpacing: 0.5 }}>
                                    {p.area_responsable}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* badges */}
                            <div style={{ display: "flex", gap: 4 }}>
                              {!p.activo && <Chip color="#583838" text="off" />}
                              {p.genera_alertas && <Chip color="#484868" text="alerta" />}
                            </div>
                          </div>
                        );
                      }}
                    />

                    {!procesos.length && (
                      <div style={{ textAlign: "center", padding: "40px 0", color: "#1e1e1e", fontSize: 12 }}>
                        Sin etapas. Creá la primera.
                      </div>
                    )}
                  </div>

                  {/* RIGHT — panel de edición */}
                  <div style={{ overflow: "auto", padding: "22px 28px 22px 20px" }}>
                    {!selProc ? (
                      <div style={{
                        height: "100%", display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        color: "#1c1c1c", gap: 10, textAlign: "center",
                      }}>
                        <div style={{ fontSize: 32, opacity: 0.4 }}>⠿</div>
                        <div style={{ fontSize: 12 }}>Seleccioná una etapa<br />para editarla</div>
                      </div>
                    ) : (
                      <div style={{ animation: "slideUp .18s ease" }}>
                        {/* Panel header */}
                        <div style={{
                          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                          marginBottom: 20, paddingBottom: 16,
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <div style={{ width: 4, height: 24, borderRadius: 2, background: editForm.color ?? "#3a3a3a" }} />
                            <div>
                              <div style={{ fontSize: 14, color: "#c8c8c8", fontWeight: 500 }}>{selProc.nombre}</div>
                              <div style={{ fontSize: 9, color: "#2a2a2a", marginTop: 2 }}>ID {selProc.id.slice(0, 8)}</div>
                            </div>
                          </div>
                          <button onClick={() => setSelProcId(null)} style={Sx.btnGhost}>×</button>
                        </div>

                        {/* Fields */}
                        <Field label="Nombre">
                          <input style={Sx.input} value={editForm.nombre ?? ""}
                            onChange={e => ef("nombre", e.target.value)} />
                        </Field>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10, marginBottom: 14 }}>
                          <Field label="Área responsable">
                            <input style={Sx.input} placeholder="Mecánica, Eléctrica…"
                              value={editForm.area_responsable ?? ""}
                              onChange={e => ef("area_responsable", e.target.value)} />
                          </Field>
                          <Field label="Días est.">
                            <input type="number" min="0" step="0.5" style={Sx.input}
                              value={editForm.dias_esperados ?? ""}
                              onChange={e => ef("dias_esperados", e.target.value)} />
                          </Field>
                        </div>

                        <Field label="Descripción">
                          <input style={Sx.input} placeholder="Notas opcionales…"
                            value={editForm.descripcion ?? ""}
                            onChange={e => ef("descripcion", e.target.value)} />
                        </Field>

                        <Field label="Color identificador">
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <input type="color"
                              style={{ width: 34, height: 32, borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)", background: "none", flexShrink: 0 }}
                              value={editForm.color ?? "#5a7a9a"}
                              onChange={e => ef("color", e.target.value)} />
                            <input style={{ ...Sx.input, flex: 1, minWidth: 80, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}
                              value={editForm.color ?? ""}
                              onChange={e => ef("color", e.target.value)} />
                            {COLOR_PRESETS.map(c => (
                              <div key={c}
                                onClick={() => ef("color", c)}
                                style={{
                                  width: 16, height: 16, borderRadius: 4, background: c, cursor: "pointer", flexShrink: 0,
                                  border: editForm.color === c ? "2px solid rgba(255,255,255,0.8)" : "2px solid transparent",
                                  transition: "border-color .12s",
                                }} />
                            ))}
                          </div>
                        </Field>

                        {/* Toggles */}
                        <div style={{
                          margin: "18px 0", padding: "12px 14px",
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.05)",
                          borderRadius: 9,
                        }}>
                          {[
                            { key: "activo",        label: "Etapa activa",              sub: "Visible en obras y reportes" },
                            { key: "genera_alertas", label: "Genera alertas de demora",  sub: "Notifica si supera días estimados" },
                          ].map(({ key, label, sub }) => (
                            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: key === "activo" ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                              <div>
                                <div style={{ fontSize: 12, color: "#808080" }}>{label}</div>
                                <div style={{ fontSize: 10, color: "#2e2e2e", marginTop: 2 }}>{sub}</div>
                              </div>
                              <Toggle on={editForm[key] ?? false} onChange={() => ef(key, !editForm[key])} />
                            </div>
                          ))}
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={guardarProceso}
                            disabled={!formDirty}
                            style={{
                              flex: 1, padding: "9px", borderRadius: 8, border: "none", cursor: formDirty ? "pointer" : "not-allowed",
                              background: formDirty ? "#b8b8b8" : "#111",
                              color: formDirty ? "#000" : "#2a2a2a",
                              fontWeight: 600, fontSize: 12, transition: "all .15s",
                              fontFamily: "'IBM Plex Sans', system-ui",
                            }}
                          >
                            {formDirty ? "Guardar cambios" : "Sin cambios"}
                          </button>
                          <button
                            onClick={eliminarProceso}
                            style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(180,60,60,0.25)", background: "transparent", color: "#904040", cursor: "pointer", fontSize: 12 }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════════════════════
                  TAB: USUARIOS — Card grid
              ════════════════════════════════════════════════════ */}
              {tab === "usuarios" && (
                <div style={{ flex: 1, overflow: "auto", padding: "22px 28px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 13, color: "#c0c0c0", fontWeight: 500 }}>Usuarios del sistema</div>
                      <div style={{ fontSize: 10, color: "#343434", marginTop: 3 }}>
                        {usuarios.length} usuarios · {stats.admins} administrador{stats.admins !== 1 ? "es" : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => setShowNewUser(true)}
                      style={{ border: "none", background: "#b8b8b8", color: "#000", padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 11, letterSpacing: 0.5, fontFamily: "'IBM Plex Sans', system-ui" }}
                    >
                      + Nuevo usuario
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                    {usuarios.map(u => {
                      const rm       = ROLE_META[u.role] ?? { color: "#505050", label: u.role };
                      const initials = (u.username ?? "?").slice(0, 2).toUpperCase();
                      return (
                        <div
                          key={u.id}
                          className="role-card"
                          style={{
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 10,
                            background: "#070707",
                            padding: "14px 16px",
                            display: "flex", flexDirection: "column", gap: 11,
                            transition: "border-color .15s",
                          }}
                        >
                          {/* Avatar + nombre */}
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                              background: `${rm.color}18`,
                              border: `1px solid ${rm.color}30`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: 12, fontWeight: 600, color: rm.color,
                            }}>
                              {initials}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: "#c0c0c0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'IBM Plex Mono', monospace" }}>
                                {u.username}
                              </div>
                              <div style={{ fontSize: 9, color: "#242424", marginTop: 2 }}>
                                {u.id.slice(0, 8)}…
                              </div>
                            </div>
                            {u.is_admin && (
                              <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(130,130,160,0.12)", color: "#7070a0", border: "1px solid rgba(130,130,160,0.18)", letterSpacing: 0.5, textTransform: "uppercase", flexShrink: 0 }}>
                                Admin
                              </span>
                            )}
                          </div>

                          {/* Rol badge */}
                          <div style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "7px 10px", borderRadius: 7,
                            background: `${rm.color}0d`, border: `1px solid ${rm.color}20`,
                          }}>
                            <span style={{ fontSize: 10, color: rm.color, letterSpacing: 0.8, textTransform: "uppercase" }}>
                              {rm.label}
                            </span>
                            {u.created_at && (
                              <span style={{ fontSize: 9, color: "#242424" }}>
                                {new Date(u.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                              </span>
                            )}
                          </div>

                          {/* Acción */}
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
                      <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "40px 0", color: "#1e1e1e", fontSize: 12 }}>
                        Sin usuarios.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════════════════════
                  TAB: SISTEMA
              ════════════════════════════════════════════════════ */}
              {tab === "sistema" && (
                <div style={{ flex: 1, overflow: "auto", padding: "22px 28px" }}>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, color: "#c0c0c0", fontWeight: 500 }}>Parámetros del sistema</div>
                    <div style={{ fontSize: 10, color: "#343434", marginTop: 3 }}>Los cambios se aplican de inmediato</div>
                  </div>

                  {Object.keys(configGrupos).length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#1e1e1e", fontSize: 12 }}>
                      Sin configuración. Ejecutá el SQL de sistema_produccion primero.
                    </div>
                  ) : Object.entries(configGrupos).map(([grupo, items]) => (
                    <div key={grupo} style={{ marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, background: "#070707", overflow: "hidden" }}>
                      {/* Grupo header */}
                      <div style={{ padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)" }}>
                        <span style={{ fontSize: 9, letterSpacing: 3, color: "#303030", textTransform: "uppercase", fontWeight: 600 }}>
                          {grupo}
                        </span>
                      </div>

                      <table className="cfg-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                        <tbody className="cfg-body">
                          {items.map((c, ci) => {
                            const isDirty = editConf[c.clave] !== undefined;
                            const isBool  = c.tipo === "boolean";
                            const isNum   = c.tipo === "number";
                            const curVal  = editConf[c.clave] ?? c.valor;

                            return (
                              <tr key={c.clave} className="cfg-row" style={{ borderBottom: ci < items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                {/* Descripción */}
                                <td style={{ padding: "14px 18px", verticalAlign: "middle", width: "50%" }}>
                                  <div style={{ fontSize: 12, color: "#989898" }}>{c.descripcion ?? c.clave}</div>
                                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "#242424", marginTop: 3, letterSpacing: 0.5 }}>
                                    {c.clave}
                                  </div>
                                </td>

                                {/* Control */}
                                <td style={{ padding: "14px 18px", verticalAlign: "middle" }}>
                                  {isBool ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                      <Toggle
                                        on={curVal === "true"}
                                        onChange={() => {
                                          const next = curVal === "true" ? "false" : "true";
                                          setEditConf(p => ({ ...p, [c.clave]: next }));
                                        }}
                                      />
                                      <span style={{ fontSize: 11, color: curVal === "true" ? "#707080" : "#282828" }}>
                                        {curVal === "true" ? "Activado" : "Desactivado"}
                                      </span>
                                    </div>
                                  ) : (
                                    <input
                                      type={isNum ? "number" : "text"}
                                      style={{ ...Sx.input, maxWidth: 200, padding: "7px 10px", ...(isNum ? { fontFamily: "'IBM Plex Mono', monospace" } : {}) }}
                                      value={curVal}
                                      onChange={e => setEditConf(p => ({ ...p, [c.clave]: e.target.value }))}
                                    />
                                  )}
                                </td>

                                {/* Guardar */}
                                <td style={{ padding: "14px 18px", verticalAlign: "middle", textAlign: "right", width: 110 }}>
                                  {isDirty ? (
                                    <button
                                      onClick={() => guardarConfig(c.clave)}
                                      style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: "#b8b8b8", color: "#000", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "'IBM Plex Sans', system-ui" }}
                                    >
                                      Guardar
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: 10, color: "#1e1e1e" }}>—</span>
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

      {/* ════════════════════════════════════════════════════════════
          MODAL: NUEVA ETAPA
      ════════════════════════════════════════════════════════════ */}
      {showNewProc && (
        <Overlay onClose={() => setShowNewProc(false)}>
          <div style={{ fontSize: 15, color: "#d0d0d0", fontWeight: 500, marginBottom: 4 }}>Nueva etapa</div>
          <div style={{ fontSize: 10, color: "#383838", marginBottom: 22 }}>Se agrega al final · editarla luego desde el panel</div>

          <form onSubmit={crearProceso}>
            <Field label="Nombre *">
              <input style={Sx.input} required placeholder="Ej: Electricidad" autoFocus
                value={newProc.nombre} onChange={e => setNewProc(f => ({ ...f, nombre: e.target.value }))} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 10, marginBottom: 14 }}>
              <Field label="Área responsable">
                <input style={Sx.input} placeholder="Mecánica, Laminación…"
                  value={newProc.area_responsable} onChange={e => setNewProc(f => ({ ...f, area_responsable: e.target.value }))} />
              </Field>
              <Field label="Días est.">
                <input type="number" min="0" step="0.5" style={Sx.input}
                  value={newProc.dias_esperados} onChange={e => setNewProc(f => ({ ...f, dias_esperados: e.target.value }))} />
              </Field>
            </div>
            <Field label="Descripción">
              <input style={Sx.input} value={newProc.descripcion}
                onChange={e => setNewProc(f => ({ ...f, descripcion: e.target.value }))} />
            </Field>
            <Field label="Color">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="color"
                  style={{ width: 34, height: 32, borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)", background: "none", flexShrink: 0 }}
                  value={newProc.color} onChange={e => setNewProc(f => ({ ...f, color: e.target.value }))} />
                {COLOR_PRESETS.map(c => (
                  <div key={c} onClick={() => setNewProc(f => ({ ...f, color: c }))}
                    style={{ width: 18, height: 18, borderRadius: 4, background: c, cursor: "pointer", flexShrink: 0, border: newProc.color === c ? "2px solid #fff" : "2px solid transparent" }} />
                ))}
              </div>
            </Field>
            <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
              <button type="submit" style={Sx.btnPrimary}>Crear etapa</button>
              <button type="button" style={Sx.btnSecondary} onClick={() => setShowNewProc(false)}>Cancelar</button>
            </div>
          </form>
        </Overlay>
      )}

      {/* ════════════════════════════════════════════════════════════
          MODAL: NUEVO USUARIO
      ════════════════════════════════════════════════════════════ */}
      {showNewUser && (
        <Overlay onClose={() => setShowNewUser(false)}>
          <div style={{ fontSize: 15, color: "#d0d0d0", fontWeight: 500, marginBottom: 4 }}>Nuevo usuario</div>
          <div style={{ fontSize: 10, color: "#383838", marginBottom: 22 }}>
            Email automático: usuario@klasea.local
          </div>

          <form onSubmit={crearUsuario}>
            <Field label="Nombre de usuario *">
              <input style={{ ...Sx.input, fontFamily: "'IBM Plex Mono', monospace" }} required placeholder="PANOL01"
                value={newUser.username} onChange={e => setNewUser(f => ({ ...f, username: e.target.value }))} autoFocus />
            </Field>
            <Field label="Contraseña *">
              <input type="password" style={Sx.input} required
                value={newUser.password} onChange={e => setNewUser(f => ({ ...f, password: e.target.value }))} />
            </Field>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 9, letterSpacing: 2.2, color: "#484848", display: "block", marginBottom: 8, textTransform: "uppercase" }}>Rol</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                {ROLES.map(r => {
                  const rm  = ROLE_META[r] ?? { color: "#505050", label: r };
                  const sel = newUser.role === r;
                  return (
                    <button key={r} type="button" onClick={() => setNewUser(f => ({ ...f, role: r }))}
                      style={{
                        padding: "8px 12px", borderRadius: 7, cursor: "pointer", textAlign: "left",
                        background: sel ? `${rm.color}14` : "rgba(255,255,255,0.02)",
                        border: `1px solid ${sel ? rm.color + "40" : "rgba(255,255,255,0.06)"}`,
                        color: sel ? rm.color : "#383838",
                        fontSize: 11, letterSpacing: 0.3,
                        transition: "all .12s",
                        fontFamily: "'IBM Plex Sans', system-ui",
                      }}>
                      {rm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preview */}
            {newUser.username && (() => {
              const rm = ROLE_META[newUser.role] ?? { color: "#505050", label: newUser.role };
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginBottom: 14, background: `${rm.color}0c`, border: `1px solid ${rm.color}20`, borderRadius: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${rm.color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: rm.color, fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>
                    {newUser.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: rm.color, fontFamily: "'IBM Plex Mono', monospace" }}>{newUser.username.toUpperCase()}</div>
                    <div style={{ fontSize: 9, color: "#383838" }}>{rm.label}{newUser.is_admin ? " · Admin" : ""}</div>
                  </div>
                </div>
              );
            })()}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "#707070" }}>Acceso de administrador</div>
                <div style={{ fontSize: 9, color: "#2a2a2a", marginTop: 1 }}>Puede editar configuración y usuarios</div>
              </div>
              <Toggle on={newUser.is_admin} onChange={() => setNewUser(f => ({ ...f, is_admin: !f.is_admin }))} />
            </div>

            <div style={{ fontSize: 10, color: "#524030", marginBottom: 16, padding: "8px 12px", background: "rgba(160,110,40,0.05)", border: "1px solid rgba(160,110,40,0.12)", borderRadius: 7 }}>
              Si Supabase requiere confirmación de email, activar el usuario desde el panel Auth.
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={Sx.btnPrimary}>Crear usuario</button>
              <button type="button" style={Sx.btnSecondary} onClick={() => setShowNewUser(false)}>Cancelar</button>
            </div>
          </form>
        </Overlay>
      )}

      {/* ════════════════════════════════════════════════════════════
          MODAL: EDITAR ROL
      ════════════════════════════════════════════════════════════ */}
      {editUserModal && (
        <Overlay onClose={() => setEditUserModal(null)} maxWidth={400}>
          <div style={{ fontSize: 15, color: "#d0d0d0", fontWeight: 500, marginBottom: 4 }}>Permisos de acceso</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#484848", marginBottom: 22 }}>
            {editUserModal.username}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 9, letterSpacing: 2.2, color: "#484848", display: "block", marginBottom: 8, textTransform: "uppercase" }}>Rol</label>
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
                      color: sel ? rm.color : "#383838",
                      fontSize: 11, transition: "all .12s",
                      fontFamily: "'IBM Plex Sans', system-ui",
                    }}>
                    {rm.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 12, color: "#707070" }}>Acceso de administrador</div>
              <div style={{ fontSize: 9, color: "#2a2a2a", marginTop: 1 }}>Configuración, usuarios y sistema</div>
            </div>
            <Toggle on={formEditUser.is_admin ?? false} onChange={() => setFormEditUser(f => ({ ...f, is_admin: !f.is_admin }))} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button style={Sx.btnPrimary} onClick={guardarRolUsuario}>Guardar cambios</button>
            <button style={Sx.btnSecondary} onClick={() => setEditUserModal(null)}>Cancelar</button>
          </div>
        </Overlay>
      )}

    </div>
  );
}

// ─── helpers de render ────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 9, letterSpacing: 2.2, color: "#484848", display: "block", marginBottom: 5, textTransform: "uppercase", fontFamily: "'IBM Plex Sans', system-ui" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Chip({ color, text }) {
  return (
    <span style={{
      fontSize: 8, padding: "2px 6px", borderRadius: 4, letterSpacing: 0.5,
      background: `${color}18`, color, border: `1px solid ${color}28`,
      textTransform: "uppercase", whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  );
}

function Overlay({ onClose, children, maxWidth = 500 }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(10px)", display: "flex", justifyContent: "center", alignItems: "flex-start", zIndex: 9999, padding: "40px 16px", overflowY: "auto" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#080808", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 26, width: "100%", maxWidth, animation: "slideUp .2s ease", fontFamily: "'IBM Plex Sans', system-ui" }}>
        {children}
      </div>
    </div>
  );
}

// ─── shared styles ────────────────────────────────────────────────────────────
const Sx = {
  input: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
    color: "#d0d0d0", padding: "8px 12px", borderRadius: 8, fontSize: 13,
    width: "100%", outline: "none", fontFamily: "'IBM Plex Sans', system-ui",
  },
  btnPrimary: {
    border: "none", background: "#b8b8b8", color: "#000", padding: "8px 20px",
    borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 12,
    fontFamily: "'IBM Plex Sans', system-ui",
  },
  btnSecondary: {
    border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)",
    color: "#909090", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12,
    fontFamily: "'IBM Plex Sans', system-ui",
  },
  btnOutline: {
    border: "1px solid rgba(255,255,255,0.07)", background: "transparent",
    color: "#505050", padding: "6px 10px", borderRadius: 7, cursor: "pointer", fontSize: 11,
    fontFamily: "'IBM Plex Sans', system-ui",
  },
  btnGhost: {
    border: "1px solid transparent", background: "transparent",
    color: "#404040", padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 14,
  },
};
