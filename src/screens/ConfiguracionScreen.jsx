import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { createClient } from "@supabase/supabase-js";
import Sidebar from "../components/Sidebar";
import NotificacionesBell from "../components/NotificacionesBell";
import {
  User,
  Anchor,
  Wrench,
  Settings2,
  Key,
  X as XIcon,
  Zap,
  RefreshCcw,
  Gamepad2,
  Fuel,
  Droplets,
  Pencil,
  Link2,
  MapPin,
  Ship,
  CheckCircle2,
  Ticket,
  Phone,
  Crosshair,
  ExternalLink,
  AlertTriangle,
  Recycle // ← ESTA LÍNEA ES LA QUE FALTABA
} from "lucide-react";

function getAdminClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Falta VITE_SUPABASE_SERVICE_KEY en .env");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL QUE HAY QUE EJECUTAR UNA VEZ EN SUPABASE → SQL EDITOR
// ─────────────────────────────────────────────────────────────────────────────
//
//  -- 1. Crear cliente (auth + tabla clientes)
//  CREATE OR REPLACE FUNCTION crear_cliente_admin(
//    p_email        text,
//    p_password     text,
//    p_nombre       text,
//    p_modelo       text,
//    p_nombre_barco text DEFAULT NULL,
//    p_imagen       text DEFAULT NULL
//  ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
//  DECLARE v_uid uuid;
//  BEGIN
//    SELECT id INTO v_uid FROM auth.users WHERE email = p_email LIMIT 1;
//    IF v_uid IS NULL THEN
//      INSERT INTO auth.users (
//        instance_id, id, aud, role, email,
//        encrypted_password, email_confirmed_at, created_at, updated_at
//      ) VALUES (
//        '00000000-0000-0000-0000-000000000000'::uuid,
//        gen_random_uuid(), 'authenticated', 'authenticated', p_email,
//        crypt(p_password, gen_salt('bf')), now(), now(), now()
//      ) RETURNING id INTO v_uid;
//    END IF;
//    INSERT INTO clientes (id, nombre_completo, modelo_barco, nombre_barco, imagen_unidad)
//    VALUES (v_uid, p_nombre, p_modelo, p_nombre_barco, p_imagen)
//    ON CONFLICT (id) DO UPDATE SET
//      nombre_completo = EXCLUDED.nombre_completo,
//      modelo_barco    = EXCLUDED.modelo_barco,
//      nombre_barco    = EXCLUDED.nombre_barco,
//      imagen_unidad   = EXCLUDED.imagen_unidad;
//    RETURN v_uid;
//  END; $$;
//
//  -- 2. Cambiar contraseña de un cliente
//  CREATE OR REPLACE FUNCTION cambiar_password_cliente(p_uid uuid, p_password text)
//  RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
//  BEGIN
//    UPDATE auth.users
//    SET encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
//    WHERE id = p_uid;
//  END; $$;
//
//  -- 3. Borrar cliente (auth + tabla)
//  CREATE OR REPLACE FUNCTION borrar_cliente_admin(p_uid uuid)
//  RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
//  BEGIN
//    DELETE FROM clientes  WHERE id = p_uid;
//    DELETE FROM auth.users WHERE id = p_uid;
//  END; $$;
//
// ─────────────────────────────────────────────────────────────────────────────

const ROLES = ["admin","oficina","laminacion","muebles","panol","mecanica","electricidad"];
const ROLE_META = {
  admin:        { color:"#8888a8", label:"Admin"        },
  oficina:      { color:"#6878a0", label:"Oficina"      },
  laminacion:   { color:"#4a7888", label:"Laminación"   },
  muebles:      { color:"#788050", label:"Muebles"      },
  panol:        { color:"#507860", label:"Pañol"        },
  mecanica:     { color:"#786060", label:"Mecánica"     },
  electricidad: { color:"#a09060", label:"Electricidad" },
};

const SPEC_FIELDS = [
  { key:"combustible",  label:"Cap. combustible",   unit:"L",  tipo:"number", default:1200, desc:"Litros totales del tanque de gasoil" },
  { key:"agua",         label:"Cap. agua potable",  unit:"L",  tipo:"number", default:400,  desc:"Litros totales del tanque de agua" },
  { key:"tiene_grupo",  label:"Grupo electrógeno",  unit:"",   tipo:"bool",   default:true, desc:"Activa la sección de grupo en el panel" },
  { key:"tiene_mando",  label:"Mando electrónico",  unit:"",   tipo:"bool",   default:true, desc:"Activa la guía de joystick/mando" },
  { key:"tiene_aguas",  label:"Aguas negras",        unit:"",   tipo:"bool",   default:true, desc:"Activa la gestión de aguas negras" },
];

const Sx = {
  input: {
    background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)",
    color:"#f4f4f5", padding:"8px 12px", borderRadius:8, fontSize:13,
    width:"100%", outline:"none", fontFamily:"'Outfit',system-ui", boxSizing:"border-box",
  },
  btnPrimary: {
    border:"none", background:"rgba(255,255,255,0.92)", color:"#080c14",
    padding:"9px 20px", borderRadius:8, cursor:"pointer",
    fontWeight:700, fontSize:12, fontFamily:"'Outfit',system-ui",
  },
  btnSecondary: {
    border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.04)",
    color:"#a1a1aa", padding:"9px 16px", borderRadius:8, cursor:"pointer",
    fontSize:12, fontFamily:"'Outfit',system-ui",
  },
  btnOutline: {
    border:"1px solid rgba(255,255,255,0.08)", background:"transparent",
    color:"#71717a", padding:"6px 12px", borderRadius:7, cursor:"pointer",
    fontSize:11, fontFamily:"'Outfit',system-ui",
  },
  btnDanger: {
    border:"1px solid rgba(184,80,80,0.3)", background:"transparent",
    color:"#c07070", padding:"6px 12px", borderRadius:7, cursor:"pointer",
    fontSize:11, fontFamily:"'Outfit',system-ui",
  },
};

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:9, letterSpacing:2.2, color:"#71717a", display:"block",
        marginBottom:5, textTransform:"uppercase", fontFamily:"'Outfit',system-ui" }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize:9.5, color:"#52525b", marginTop:4 }}>{hint}</div>}
    </div>
  );
}

function Toggle({ on, onChange, disabled=false }) {
  return (
    <button type="button" disabled={disabled} onClick={onChange} style={{
      width:34, height:19, borderRadius:99, border:"none", flexShrink:0,
      background: on ? "rgba(160,160,180,0.5)" : "rgba(255,255,255,0.07)",
      position:"relative", cursor: disabled ? "not-allowed" : "pointer",
      transition:"background .2s", opacity: disabled ? 0.4 : 1,
    }}>
      <div style={{
        position:"absolute", top:3, left: on ? 16 : 3,
        width:13, height:13, borderRadius:"50%",
        background: on ? "#d0d0d0" : "#383838",
        transition:"left .18s, background .18s",
        boxShadow: on ? "0 1px 4px rgba(0,0,0,0.5)" : "none",
      }} />
    </button>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position:"fixed", bottom:28, right:28, zIndex:10000,
      padding:"11px 20px", borderRadius:9, fontSize:12,
      fontFamily:"'Outfit',system-ui",
      background: toast.ok ? "#091510" : "#150909",
      border:`1px solid ${toast.ok ? "rgba(60,140,80,0.5)" : "rgba(180,60,60,0.5)"}`,
      color: toast.ok ? "#70c080" : "#c07070",
      boxShadow:"0 8px 32px rgba(0,0,0,0.7)",
      animation:"toastIn .2s ease", letterSpacing:0.3,
    }}>{toast.text}</div>
  );
}

function Overlay({ onClose, children, maxWidth=500 }) {
  return (
    <div onClick={e => e.target===e.currentTarget && onClose()} style={{
      position:"fixed", inset:0, background:"rgba(9,9,11,0.88)",
      backdropFilter:"blur(40px) saturate(140%)", WebkitBackdropFilter:"blur(40px) saturate(140%)",
      display:"flex", justifyContent:"center", alignItems:"flex-start",
      zIndex:9999, padding:"40px 16px", overflowY:"auto",
    }}>
      <div style={{
        background:"rgba(6,10,22,0.97)", backdropFilter:"blur(60px)", WebkitBackdropFilter:"blur(60px)",
        border:"1px solid rgba(255,255,255,0.12)", borderRadius:16, padding:"26px 26px",
        width:"100%", maxWidth, animation:"slideUp .2s ease",
        fontFamily:"'Outfit',system-ui",
        boxShadow:"0 32px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
        {children}
      </div>
    </div>
  );
}

function ModalTitle({ title, sub, onClose }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
      <div>
        <div style={{ fontSize:15, color:"#f4f4f5", fontWeight:500 }}>{title}</div>
        {sub && <div style={{ fontSize:10, color:"#71717a", marginTop:3 }}>{sub}</div>}
      </div>
      <button onClick={onClose} style={{ background:"transparent", border:"none", color:"#71717a", cursor:"pointer", fontSize:20, padding:"2px 6px", lineHeight:1 }}>×</button>
    </div>
  );
}

function SelectorRoles({ value, onChange }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5 }}>
      {ROLES.map(r => {
        const rm  = ROLE_META[r] ?? { color:"#505050", label:r };
        const sel = value === r;
        return (
          <button key={r} type="button" onClick={() => onChange(r)} style={{
            padding:"9px 12px", borderRadius:7, cursor:"pointer", textAlign:"left",
            background: sel ? `${rm.color}14` : "rgba(255,255,255,0.02)",
            border:`1px solid ${sel ? rm.color+"40" : "rgba(255,255,255,0.06)"}`,
            color: sel ? rm.color : "#52525b",
            fontSize:11, fontFamily:"'Outfit',system-ui",
          }}>{rm.label}</button>
        );
      })}
    </div>
  );
}

// ─── MODAL: NUEVO / EDITAR USUARIO INTERNO ───────────────────────────────────
function ModalNuevoUsuario({ onClose, onSaved, flash }) {
  const [form, setForm] = useState({ username:"", password:"", role:"panol", is_admin:false });
  const [busy, setBusy] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  async function submit(e) {
    e.preventDefault();
    if (!form.username.trim() || !form.password) return flash(false,"Usuario y contraseña obligatorios.");
    setBusy(true);

    let adminCli;
    try { adminCli = getAdminClient(); }
    catch (err) { setBusy(false); return flash(false, err.message); }

    const email = `${form.username.trim().toLowerCase()}@klasea.local`;

    // Crear usuario via admin API (garantiza que el password quede bien hasheado)
    const { data: authData, error: authError } = await adminCli.auth.admin.createUser({
      email,
      password:      form.password,
      email_confirm: true,
      user_metadata: { username: form.username.trim() },
    });
    if (authError) { setBusy(false); return flash(false, "Error auth: " + authError.message); }
    const uid = authData.user.id;

    // Upsert profile con el rol correcto (el trigger puede poner otro por defecto)
    const { error: profError } = await adminCli.from("profiles").upsert(
      { id: uid, username: form.username.trim(), role: form.role, is_admin: form.is_admin },
      { onConflict: "id" }
    );
    if (profError) {
      await adminCli.auth.admin.deleteUser(uid);
      setBusy(false);
      return flash(false, "Error perfil: " + profError.message);
    }

    setBusy(false);
    flash(true, `Usuario ${form.username.toUpperCase()} creado.`);
    onSaved(); onClose();
  }
  return (
    <Overlay onClose={onClose} maxWidth={440}>
      <ModalTitle title="Nuevo usuario interno" sub="El usuario podrá ingresar sin confirmar email." onClose={onClose} />
      <form onSubmit={submit}>
        <Field label="Usuario"><input style={Sx.input} required autoFocus autoComplete="off" value={form.username} onChange={e=>set("username",e.target.value)} placeholder="nombre.apellido" /></Field>
        <Field label="Contraseña"><input type="password" style={Sx.input} required autoComplete="new-password" value={form.password} onChange={e=>set("password",e.target.value)} /></Field>
        <Field label="Rol"><SelectorRoles value={form.role} onChange={v=>set("role",v)} /></Field>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:8, marginBottom:20, marginTop:14 }}>
          <div>
            <div style={{ fontSize:12, color:"#a1a1aa" }}>Acceso de administrador</div>
            <div style={{ fontSize:9, color:"#52525b", marginTop:1 }}>Puede editar configuración y usuarios</div>
          </div>
          <Toggle on={form.is_admin} onChange={()=>set("is_admin",!form.is_admin)} />
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button type="submit" style={Sx.btnPrimary} disabled={busy}>{busy?"Creando…":"Crear usuario"}</button>
          <button type="button" style={Sx.btnSecondary} onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Overlay>
  );
}

function ModalEditarUsuario({ usuario, onClose, onSaved, flash }) {
  const [form, setForm] = useState({ role:usuario.role, is_admin:usuario.is_admin });
  const [busy, setBusy] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  async function guardar() {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ role:form.role, is_admin:form.is_admin }).eq("id",usuario.id);
    setBusy(false);
    if (error) return flash(false,error.message);
    flash(true,"Permisos actualizados."); onSaved(); onClose();
  }
  async function eliminar() {
    if (!window.confirm(`¿Eliminar a ${usuario.username} permanentemente?`)) return;
    const { error } = await supabase.rpc("borrar_usuario_admin",{ p_user_id:usuario.id });
    if (error) return flash(false,"Error: "+error.message);
    flash(true,"Usuario eliminado."); onSaved(); onClose();
  }
  return (
    <Overlay onClose={onClose} maxWidth={400}>
      <ModalTitle title="Editar permisos" sub={usuario.username} onClose={onClose} />
      <Field label="Rol"><SelectorRoles value={form.role} onChange={v=>set("role",v)} /></Field>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:8, marginBottom:22, marginTop:14 }}>
        <div>
          <div style={{ fontSize:12, color:"#a1a1aa" }}>Acceso de administrador</div>
          <div style={{ fontSize:9, color:"#52525b", marginTop:1 }}>Configuración, usuarios y sistema</div>
        </div>
        <Toggle on={form.is_admin} onChange={()=>set("is_admin",!form.is_admin)} />
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button style={Sx.btnPrimary} onClick={guardar} disabled={busy}>{busy?"Guardando…":"Guardar"}</button>
        <button style={Sx.btnSecondary} onClick={onClose}>Cancelar</button>
        <div style={{ flex:1 }} />
        <button style={Sx.btnDanger} onClick={eliminar}>Eliminar</button>
      </div>
    </Overlay>
  );
}

// ─── MODAL: NUEVO / EDITAR CLIENTE ───────────────────────────────────────────
function ModalCliente({ cliente, modelos, onClose, onSaved, flash }) {
  const esNuevo = !cliente;
  const [form, setForm] = useState({
    username:     cliente?.username          ?? "",
    password:     "",
    nombre:       cliente?.nombre_completo   ?? "",
    modelo:       cliente?.modelo_barco      ?? modelos[0]?.modelo_barco ?? "",
    nombre_barco: cliente?.nombre_barco      ?? "",
    imagen:       cliente?.imagen_unidad     ?? "",
    obra_id:      cliente?.obra_id           ?? "",
  });
  const [busy,          setBusy]          = useState(false);
  const [obras,        setObras]        = useState([]);
  const [obrasLoaded,  setObrasLoaded]  = useState(false);

  // ── Estado para crear nueva obra inline ──────────────────────────
  const [showNuevaObra, setShowNuevaObra] = useState(false);
  const [nuevaObraNum,  setNuevaObraNum]  = useState("");
  const [creandoObra,   setCreandoObra]   = useState(false);
  const [obraErr,       setObraErr]       = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Carga obras — tabla: id, codigo, activo (sin columna de línea)
  const cargarObras = async () => {
    try {
      const { data } = await supabase
        .from("obras")
        .select("id, codigo, activo")
        .eq("activo", true)
        .order("codigo");
      if (!data) { setObrasLoaded(true); return; }
      const flat = data.map(o => ({ id: o.id, codigo: o.codigo }));
      setObras(flat);
    } catch { /* no bloquear */ }
    setObrasLoaded(true);
  };
  useEffect(() => { cargarObras(); }, []);

  // Crear nueva obra inline — solo codigo (la tabla no tiene numero ni linea)
  async function crearObra() {
    if (!nuevaObraNum.trim()) { setObraErr("El código de obra es obligatorio."); return; }
    setCreandoObra(true); setObraErr("");
    const { data, error } = await supabase
      .from("obras").insert({ codigo: nuevaObraNum.trim(), activo: true }).select().single();
    if (error) { setObraErr("Error: " + error.message); setCreandoObra(false); return; }
    await cargarObras();
    set("obra_id", data.id);
    setShowNuevaObra(false);
    setNuevaObraNum("");
    setCreandoObra(false);
  }

  const obrasFiltradas = obras;
  const obraSeleccionada = obras.find(o => o.id === form.obra_id);

  async function submit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return flash(false, "El nombre es obligatorio.");
    if (esNuevo && !form.username.trim()) return flash(false, "El usuario es obligatorio.");
    if (esNuevo && !form.password) return flash(false, "La contraseña es obligatoria.");
    setBusy(true);

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const obraIdValido = form.obra_id && UUID_RE.test(form.obra_id) ? form.obra_id : null;

    if (esNuevo) {
      // ── Crear usuario auth con adminClient ────────────────────────
      let adminCli;
      try { adminCli = getAdminClient(); }
      catch (err) { setBusy(false); return flash(false, err.message); }

      const email = `${form.username.trim().toLowerCase()}@klasea.local`;
      const { data: authData, error: authError } = await adminCli.auth.admin.createUser({
        email,
        password:      form.password,
        email_confirm: true,
      });
      if (authError) { setBusy(false); return flash(false, "Error auth: " + authError.message); }
      const uid = authData.user.id;

      // ── FIX ROL: usar adminClient para saltear RLS en profiles ────
      // El trigger crea el perfil con el rol por defecto (panol, etc).
      // Con el service role podemos sobreescribirlo sin que RLS lo bloquee.
      const { error: profError } = await adminCli
        .from("profiles")
        .upsert({ id: uid, username: form.username.trim(), role: "cliente", is_admin: false },
                 { onConflict: "id" });
      if (profError) {
        // Si falla el upsert, al menos intentar un update directo
        await adminCli.from("profiles").update({ role: "cliente", is_admin: false }).eq("id", uid);
      }

      // ── Insertar en tabla clientes ────────────────────────────────
      const { error: dbError } = await supabase.from("clientes").insert({
        id:              uid,
        nombre_completo: form.nombre.trim(),
        modelo_barco:    form.modelo || "",
        nombre_barco:    form.nombre_barco.trim() || null,
        imagen_unidad:   form.imagen.trim() || null,
        obra_id:         obraIdValido,
      });
      if (dbError) {
        await adminCli.auth.admin.deleteUser(uid);
        setBusy(false);
        return flash(false, "Error DB clientes: " + dbError.message);
      }

      // ── Sincronizar a postventa_flota ─────────────────────────────
      const { error: flotaError } = await supabase.from("postventa_flota").insert({
        cliente_id:        uid,
        nombre_barco:      form.nombre_barco.trim() || form.nombre.trim(),
        propietario:       form.nombre.trim(),
        obra_id:           obraIdValido,
        ubicacion_general: "",
        latitud:           null,
        longitud:          null,
      });
      if (flotaError) flash(false, "Advertencia Post-Venta: " + flotaError.message);

      flash(true, `Cliente ${form.nombre} creado. Rol: cliente ✓`);

    } else {
      // ── Editar cliente existente ──────────────────────────────────
      const upd = {
        nombre_completo: form.nombre.trim(),
        modelo_barco:    form.modelo,
        nombre_barco:    form.nombre_barco.trim() || null,
        imagen_unidad:   form.imagen.trim() || null,
        obra_id:         obraIdValido,
      };
      const { error } = await supabase.from("clientes").update(upd).eq("id", cliente.id);
      if (error) { setBusy(false); return flash(false, error.message); }

      // Sincronizar postventa_flota — buscar por cliente_id (vínculo directo)
      const { data: flotaEx } = await supabase
        .from("postventa_flota").select("id").eq("cliente_id", cliente.id).maybeSingle();
      if (flotaEx) {
        await supabase.from("postventa_flota").update({
          nombre_barco: form.nombre_barco.trim() || form.nombre.trim(),
          propietario:  form.nombre.trim(),
          obra_id:      obraIdValido,
        }).eq("id", flotaEx.id);
      }

      // Cambiar contraseña si se ingresó
      if (form.password) {
        try {
          const adminCli = getAdminClient();
          const { error: pwErr } = await adminCli.auth.admin.updateUserById(
            cliente.id, { password: form.password }
          );
          if (pwErr) { setBusy(false); return flash(false, "Error contraseña: " + pwErr.message); }
        } catch(err) { setBusy(false); return flash(false, err.message); }
      }

      flash(true, "Cliente actualizado.");
    }

    setBusy(false); onSaved(); onClose();
  }

  return (
    <Overlay onClose={onClose} maxWidth={560}>
      <ModalTitle
        title={esNuevo ? "Nuevo cliente" : `Editar — ${cliente.nombre_completo}`}
        sub={esNuevo
          ? "Se crea con rol cliente y se agrega automáticamente a Post-Venta."
          : "Los cambios se reflejan en el panel del cliente y en Post-Venta."}
        onClose={onClose}
      />
      <form onSubmit={submit}>
        {/* Credenciales */}
        {esNuevo && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Field label="Usuario" hint="Con este nombre + contraseña ingresa al panel">
              <input
                style={{ ...Sx.input, fontFamily:"'JetBrains Mono',monospace" }}
                required autoFocus autoComplete="off" spellCheck={false}
                value={form.username}
                onChange={e => set("username", e.target.value.toLowerCase().replace(/[\s@]/g, ""))}
                placeholder="juan.garcia"
              />
            </Field>
            <Field label="Contraseña inicial">
              <input style={Sx.input} type="password" required autoComplete="new-password"
                value={form.password} onChange={e => set("password", e.target.value)}
                placeholder="Mínimo 6 caracteres" />
            </Field>
          </div>
        )}
        {!esNuevo && (
          <Field label="Nueva contraseña" hint="Dejá vacío para no cambiarla.">
            <input style={Sx.input} type="password" autoComplete="new-password"
              value={form.password} onChange={e => set("password", e.target.value)}
              placeholder="Nueva contraseña (opcional)" />
          </Field>
        )}

        <Field label="Nombre completo del propietario">
          <input style={Sx.input} required value={form.nombre}
            onChange={e => set("nombre", e.target.value)} placeholder="Juan García" />
        </Field>

        {/* ── Obra ─────────────────────────────────────────────────── */}
        <div style={{ margin:"4px 0 16px", padding:"14px 16px", borderRadius:10, background:"rgba(59,130,246,0.04)", border:"1px solid rgba(59,130,246,0.15)" }}>
          {/* Header con botón nueva obra */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:9, letterSpacing:2.5, color:"#4a7aaa", textTransform:"uppercase", fontWeight:600 }}>
              Vinculación a obra <span style={{ color:"#3a5070", fontWeight:400, letterSpacing:0 }}>(opcional)</span>
            </div>
            <button
              type="button"
              onClick={() => { setShowNuevaObra(s => !s); setObraErr(""); }}
              style={{
                fontSize:10, padding:"3px 10px", borderRadius:6, cursor:"pointer",
                border: showNuevaObra ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.1)",
                background: showNuevaObra ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)",
                color: showNuevaObra ? "#93c5fd" : "#71717a",
                fontFamily:"'Outfit',system-ui",
              }}
            >
              {showNuevaObra ? <><XIcon size={10} style={{marginRight:4}}/> Cancelar</> : "+ Nueva obra"}
            </button>
          </div>

          {/* Formulario inline nueva obra */}
          {showNuevaObra && (
            <div style={{ padding:"12px 14px", borderRadius:9, background:"rgba(59,130,246,0.06)", border:"1px solid rgba(59,130,246,0.2)", marginBottom:14 }}>
              <div style={{ fontSize:9, letterSpacing:2, color:"#4a7aaa", textTransform:"uppercase", marginBottom:10, fontWeight:600 }}>Crear nueva obra</div>
              {obraErr && (
                <div style={{ fontSize:11, color:"#c07070", padding:"6px 10px", borderRadius:7, background:"rgba(180,60,60,0.1)", border:"1px solid rgba(180,60,60,0.2)", marginBottom:10 }}>{obraErr}</div>
              )}
              {/* Número de obra */}
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:9, letterSpacing:2, color:"#71717a", display:"block", marginBottom:5, textTransform:"uppercase" }}>Código de obra *</label>
                <input
                  style={{ ...Sx.input, fontFamily:"'JetBrains Mono',monospace" }}
                  value={nuevaObraNum}
                  onChange={e => setNuevaObraNum(e.target.value)}
                  placeholder="Ej: OBR-0037"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={crearObra}
                disabled={creandoObra}
                style={{ ...Sx.btnPrimary, fontSize:11, padding:"7px 16px" }}
              >
                {creandoObra ? "Creando…" : "Crear y seleccionar"}
              </button>
            </div>
          )}

          {/* Selector de obra — sin el filtro de línea si no hay líneas */}
          {!obrasLoaded ? (
            <div style={{ fontSize:11, color:"#52525b" }}>Cargando obras…</div>
          ) : obras.length === 0 && !showNuevaObra ? (
            <div style={{ fontSize:11, color:"#52525b", fontStyle:"italic" }}>
              No hay obras cargadas todavía. Usá "+ Nueva obra" para crear una.
            </div>
          ) : !showNuevaObra ? (
            <>
              <Field label="Código de obra">
                <select
                  style={{
                    ...Sx.input,
                    borderColor: form.obra_id ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.08)",
                    color: form.obra_id ? "#93c5fd" : "#71717a",
                  }}
                  value={form.obra_id}
                  onChange={e => set("obra_id", e.target.value)}
                >
                  <option value="">— Sin asignar —</option>
                  {obras.map(o => (
                    <option key={o.id} value={o.id}>{o.codigo}</option>
                  ))}
                </select>
              </Field>
              {obraSeleccionada && (
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6, padding:"7px 12px", borderRadius:8, background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.2)" }}>
                  <span style={{ fontSize:12, color:"#93c5fd", fontWeight:600 }}>Obra {obraSeleccionada.codigo}</span>
                  <div style={{ flex:1 }} />
                  <span style={{ fontSize:9, color:"#3a5a7a", fontFamily:"'JetBrains Mono',monospace" }}>tickets vinculados automáticamente</span>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Nombre del barco + Modelo — modelo solo si hay más de uno configurado */}
        <div style={{ display:"grid", gridTemplateColumns: modelos.length > 1 ? "1fr 1fr" : "1fr", gap:10 }}>
          {modelos.length > 1 && (
            <Field label="Modelo de barco">
              <select style={Sx.input} value={form.modelo} onChange={e => set("modelo", e.target.value)}>
                {modelos.map(m => <option key={m.id} value={m.modelo_barco}>{m.modelo_barco}</option>)}
              </select>
            </Field>
          )}
          <Field label="Nombre del barco">
            <input style={Sx.input} value={form.nombre_barco}
              onChange={e => set("nombre_barco", e.target.value)} placeholder="LIBERTAD" />
          </Field>
        </div>

        <Field label="URL foto del barco" hint="Aparece en el banner del panel del cliente.">
          <input style={Sx.input} value={form.imagen}
            onChange={e => set("imagen", e.target.value)} placeholder="https://..." />
        </Field>

        {esNuevo && (
          <div style={{ padding:"9px 14px", borderRadius:8, background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.2)", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
            <Ship size={16} color="#6ee7b7"/>
            <span style={{ fontSize:11, color:"#6ee7b7" }}>
              Al crear el cliente se agrega automáticamente a <strong>Post-Venta</strong>. Completá la ubicación GPS desde allí.
            </span>
          </div>
        )}

        <div style={{ display:"flex", gap:8, marginTop:6 }}>
          <button type="submit" style={Sx.btnPrimary} disabled={busy}>
            {busy ? "Guardando…" : esNuevo ? "Crear cliente" : "Guardar cambios"}
          </button>
          <button type="button" style={Sx.btnSecondary} onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Overlay>
  );
}

function ModalPasswordCliente({ cliente, onClose, flash }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (pw.length < 6) return flash(false,"Mínimo 6 caracteres.");
    setBusy(true);
    const { error } = await supabase.rpc("cambiar_password_cliente",{ p_uid:cliente.id, p_password:pw });
    setBusy(false);
    if (error) return flash(false,"Error: "+error.message);
    flash(true,`Contraseña de ${cliente.nombre_completo} actualizada.`);
    onClose();
  }
  return (
    <Overlay onClose={onClose} maxWidth={380}>
      <ModalTitle title="Cambiar contraseña" sub={`${cliente.nombre_completo} · ${cliente.modelo_barco}`} onClose={onClose} />
      <form onSubmit={submit}>
        <Field label="Nueva contraseña">
          <input style={Sx.input} type="password" autoFocus required autoComplete="new-password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Nueva contraseña…" />
        </Field>
        <div style={{ display:"flex", gap:8 }}>
          <button type="submit" style={Sx.btnPrimary} disabled={busy}>{busy?"Guardando…":"Actualizar"}</button>
          <button type="button" style={Sx.btnSecondary} onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Overlay>
  );
}

// ─── MODAL: NUEVO / EDITAR MODELO ────────────────────────────────────────────
function ModalModelo({ modelo, onClose, onSaved, flash }) {
  const esNuevo = !modelo;
  const initSpecs = () => {
    const base = {};
    SPEC_FIELDS.forEach(f => { base[f.key] = f.default; });
    return modelo?.caracteristicas ? { ...base, ...modelo.caracteristicas } : base;
  };
  const [nombre, setNombre] = useState(modelo?.modelo_barco ?? "");
  const [specs,  setSpecs]  = useState(initSpecs);
  const [busy,   setBusy]   = useState(false);
  const setS = (k,v) => setSpecs(s=>({...s,[k]:v}));
  async function submit(e) {
    e.preventDefault();
    if (!nombre.trim()) return flash(false,"El nombre del modelo es obligatorio.");
    setBusy(true);
    if (esNuevo) {
      const { error } = await supabase.from("modelo_configuracion").insert({ modelo_barco:nombre.trim().toUpperCase(), caracteristicas:specs });
      if (error) { setBusy(false); return flash(false,"Error: "+error.message); }
      flash(true,`Modelo ${nombre.toUpperCase()} creado.`);
    } else {
      const { error } = await supabase.from("modelo_configuracion").update({ modelo_barco:nombre.trim().toUpperCase(), caracteristicas:specs }).eq("id",modelo.id);
      if (error) { setBusy(false); return flash(false,error.message); }
      flash(true,"Modelo actualizado.");
    }
    setBusy(false); onSaved(); onClose();
  }
  return (
    <Overlay onClose={onClose} maxWidth={520}>
      <ModalTitle
        title={esNuevo ? "Nuevo modelo de barco" : `Editar — ${modelo.modelo_barco}`}
        sub="Estas especificaciones aparecen en el panel del cliente (calculadora, guías técnicas)."
        onClose={onClose}
      />
      <form onSubmit={submit}>
        <Field label="Nombre del modelo (ej: K43, K37)">
          <input style={Sx.input} required autoFocus value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="K43" />
        </Field>
        <div style={{ fontSize:9, letterSpacing:2.5, color:"#52525b", textTransform:"uppercase", margin:"20px 0 10px" }}>
          Especificaciones técnicas
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {SPEC_FIELDS.map(f => (
            <div key={f.key} style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"12px 16px", borderRadius:9,
              background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)",
            }}>
              <div>
                <div style={{ fontSize:12, color:"#d4d4d8" }}>{f.label}{f.unit && <span style={{ color:"#52525b", marginLeft:4 }}>({f.unit})</span>}</div>
                <div style={{ fontSize:9.5, color:"#52525b", marginTop:2 }}>{f.desc}</div>
              </div>
              <div style={{ flexShrink:0, marginLeft:20 }}>
                {f.tipo === "bool" ? (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:10, color: specs[f.key] ? "#707080" : "#383838", minWidth:14 }}>
                      {specs[f.key] ? "Sí" : "No"}
                    </span>
                    <Toggle on={!!specs[f.key]} onChange={()=>setS(f.key,!specs[f.key])} />
                  </div>
                ) : (
                  <input
                    type="number" min="0"
                    style={{ ...Sx.input, width:110, textAlign:"right", fontFamily:"'JetBrains Mono',monospace", padding:"7px 10px" }}
                    value={specs[f.key] ?? f.default}
                    onChange={e=>setS(f.key,Number(e.target.value))}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:8, marginTop:20 }}>
          <button type="submit" style={Sx.btnPrimary} disabled={busy}>
            {busy ? "Guardando…" : esNuevo ? "Crear modelo" : "Guardar cambios"}
          </button>
          <button type="button" style={Sx.btnSecondary} onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Overlay>
  );
}

// ─── PANTALLA PRINCIPAL ───────────────────────────────────────────────────────
export default function ConfiguracionScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin || profile?.role === "admin";
  const TABS = [
    { id:"usuarios", label:"Personal",   icon:<User size={12}/>  },
    { id:"clientes", label:"Clientes",   icon:<Ship size={12}/> },
    { id:"modelos",  label:"Modelos",    icon:<Wrench size={12}/> },
    { id:"sistema",  label:"Sistema",    icon:<Settings2 size={12}/> },
  ];
  const [tab,      setTab]      = useState("usuarios");
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [modelos,  setModelos]  = useState([]);
  const [config,   setConfig]   = useState([]);
  const [editConf, setEditConf] = useState({});
  const [mNuevoUser,   setMNuevoUser]   = useState(false);
  const [mEditUser,    setMEditUser]    = useState(null);
  const [mCliente,     setMCliente]     = useState(null);
  const [mPwCliente,   setMPwCliente]   = useState(null);
  const [mModelo,      setMModelo]      = useState(null);

  function flash(ok, text) {
    setToast({ ok, text });
    setTimeout(()=>setToast(null), 3500);
  }

  async function cargar() {
    setLoading(true);
    const [r1,r2,r3,r4] = await Promise.all([
      supabase.from("profiles").select("id,username,role,is_admin,created_at").order("username"),
      supabase.from("clientes").select("*, obras(id, codigo)").order("nombre_completo"),
      supabase.from("modelo_configuracion").select("*").order("modelo_barco"),
      supabase.from("sistema_config").select("*").order("grupo").order("clave"),
    ]);
    setUsuarios(r1.data ?? []);
    setClientes(r2.data ?? []);
    setModelos(r3.data  ?? []);
    setConfig(r4.data   ?? []);
    setLoading(false);
  }
  useEffect(()=>{ cargar(); }, []);

  async function guardarConfig(clave) {
    const valor = editConf[clave];
    if (valor === undefined) return;
    const { error } = await supabase.from("sistema_config")
      .update({ valor:String(valor), updated_at:new Date().toISOString() })
      .eq("clave", clave);
    if (error) return flash(false, error.message);
    flash(true,"Guardado.");
    setEditConf(p=>{ const n={...p}; delete n[clave]; return n; });
    cargar();
  }

  async function eliminarCliente(c) {
    if (!window.confirm(`¿Eliminar a ${c.nombre_completo} y su acceso al sistema?`)) return;
    // Eliminar también de postventa_flota (vínculo por cliente_id)
    await supabase.from("postventa_flota").delete().eq("cliente_id", c.id);
    const { error } = await supabase.rpc("borrar_cliente_admin",{ p_uid:c.id });
    if (error) return flash(false,"Error: "+error.message);
    flash(true,`${c.nombre_completo} eliminado.`);
    cargar();
  }

  async function eliminarModelo(m) {
    const enUso = clientes.filter(c=>c.modelo_barco===m.modelo_barco).length;
    if (enUso > 0) return flash(false,`${enUso} cliente(s) usan este modelo. Reasignálos primero.`);
    if (!window.confirm(`¿Eliminar el modelo ${m.modelo_barco}?`)) return;
    const { error } = await supabase.from("modelo_configuracion").delete().eq("id",m.id);
    if (error) return flash(false,error.message);
    flash(true,`Modelo ${m.modelo_barco} eliminado.`); cargar();
  }

  const configGrupos = useMemo(()=>{
    const g = {};
    config.forEach(c=>{ if(!g[c.grupo]) g[c.grupo]=[]; g[c.grupo].push(c); });
    return g;
  },[config]);

  const stats = useMemo(()=>({
    personal:  usuarios.length,
    clientes:  clientes.length,
    modelos:   modelos.length,
  }),[usuarios,clientes,modelos]);

  if (!isAdmin) {
    return (
      <div style={{ background:"#09090b", position:"fixed", inset:0, overflow:"hidden", display:"grid", gridTemplateColumns:"280px 1fr" }}>
        <Sidebar profile={profile} signOut={signOut} />
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", color:"#71717a", fontSize:12, letterSpacing:1 }}>
          Solo administradores pueden acceder.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:"#09090b", position:"fixed", inset:0, overflow:"hidden", color:"#a1a1aa", fontFamily:"'Outfit',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:99px;}
        button:focus-visible{outline:1px solid rgba(255,255,255,0.2);outline-offset:2px;}
        input:focus,select:focus,textarea:focus{outline:none;border-color:rgba(59,130,246,0.35)!important;}
        select option{background:#0f0f12;color:#a1a1aa;}
        @keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        button:not([disabled]):hover{opacity:0.8;}
        .bg-glow{position:fixed;inset:0;pointer-events:none;z-index:0;
          background:radial-gradient(ellipse 70% 38% at 50% -6%,rgba(59,130,246,0.07) 0%,transparent 65%),
                     radial-gradient(ellipse 40% 28% at 92% 88%,rgba(245,158,11,0.02) 0%,transparent 55%);}
        .hrow:hover{background:rgba(255,255,255,0.025)!important;}
        .hcard:hover{border-color:rgba(255,255,255,0.1)!important;}
      `}</style>
      <div className="bg-glow" />
      <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", height:"100%", overflow:"hidden", position:"relative", zIndex:1 }}>
        <Sidebar profile={profile} signOut={signOut} />
        <NotificacionesBell profile={profile} />
        <Toast toast={toast} />
        <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden" }}>
          {/* ── TOPBAR ── */}
          <div style={{
            height:50, flexShrink:0, display:"flex", alignItems:"stretch",
            borderBottom:"1px solid rgba(255,255,255,0.08)",
            background:"rgba(12,12,14,0.92)",
            backdropFilter:"blur(32px) saturate(130%)",
            WebkitBackdropFilter:"blur(32px) saturate(130%)",
            paddingLeft:24,
          }}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                height:"100%", padding:"0 20px", border:"none", background:"transparent",
                cursor:"pointer", fontSize:11, letterSpacing:1.4, textTransform:"uppercase",
                color: tab===t.id ? "#f4f4f5" : "#52525b",
                borderBottom: tab===t.id ? "2px solid rgba(59,130,246,0.6)" : "2px solid transparent",
                fontWeight: tab===t.id ? 500 : 400,
                transition:"color .15s, border-color .15s",
                fontFamily:"'Outfit',system-ui", marginBottom:-1, whiteSpace:"nowrap",
                display:"flex", alignItems:"center", gap:7,
              }}>
                <span style={{ opacity: tab===t.id ? 1 : 0.5, display:"flex" }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
            <div style={{ flex:1 }} />
            <div style={{ display:"flex", alignItems:"center", gap:8, paddingRight:20 }}>
              {[
                { n:stats.personal, l:"personal", c:"#3b82f6" },
                { n:stats.clientes, l:"clientes", c:"#10b981" },
                { n:stats.modelos,  l:"modelos",  c:"#f59e0b" },
              ].map(({n,l,c})=>(
                <div key={l} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:7, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderLeft:`2px solid ${c}` }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:15, fontWeight:700, color:c, lineHeight:1 }}>{n}</span>
                  <span style={{ fontSize:8, color:"#71717a", letterSpacing:1.5, textTransform:"uppercase" }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── CONTENIDO ── */}
          <div style={{ flex:1, overflow:"hidden", display:"flex" }}>
            {loading ? (
              <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#71717a", fontSize:12 }}>Cargando…</div>
            ) : (
              <>
                {/* ══════ TAB: PERSONAL ══════ */}
                {tab==="usuarios" && (
                  <div style={{ flex:1, overflow:"auto", padding:"22px 28px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                      <div>
                        <div style={{ fontSize:13, color:"#f4f4f5", fontWeight:500 }}>Personal del astillero</div>
                        <div style={{ fontSize:10, color:"#71717a", marginTop:3 }}>{usuarios.length} usuario{usuarios.length!==1?"s":""} · {usuarios.filter(u=>u.is_admin).length} admin{usuarios.filter(u=>u.is_admin).length!==1?"s":""}</div>
                      </div>
                      <button style={Sx.btnPrimary} onClick={()=>setMNuevoUser(true)}>+ Nuevo usuario</button>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:8 }}>
                      {usuarios.map(u=>{
                        const rm = ROLE_META[u.role] ?? { color:"#505050", label:u.role };
                        return (
                          <div key={u.id} className="hcard" style={{ border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, background:"rgba(255,255,255,0.02)", padding:"14px 16px", display:"flex", flexDirection:"column", gap:10, transition:"border-color .15s" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <div style={{ width:38, height:38, borderRadius:"50%", flexShrink:0, background:`${rm.color}18`, border:`1px solid ${rm.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:600, color:rm.color }}>
                                {(u.username??"?").slice(0,2).toUpperCase()}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, color:"#f4f4f5", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"'JetBrains Mono',monospace" }}>{u.username}</div>
                                <div style={{ fontSize:9, color:"#52525b", marginTop:2 }}>{u.id.slice(0,8)}…</div>
                              </div>
                              {u.is_admin && <span style={{ fontSize:8, padding:"2px 6px", borderRadius:4, background:"rgba(130,130,160,0.12)", color:"#7070a0", border:"1px solid rgba(130,130,160,0.18)", letterSpacing:0.5, textTransform:"uppercase", flexShrink:0 }}>Admin</span>}
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 10px", borderRadius:7, background:`${rm.color}0d`, border:`1px solid ${rm.color}20` }}>
                              <span style={{ fontSize:10, color:rm.color, letterSpacing:0.8, textTransform:"uppercase" }}>{rm.label}</span>
                              {u.created_at && <span style={{ fontSize:9, color:"#52525b" }}>{new Date(u.created_at).toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit",year:"2-digit"})}</span>}
                            </div>
                            <button style={{ ...Sx.btnOutline, width:"100%", textAlign:"center" }} onClick={()=>setMEditUser(u)}>Editar permisos</button>
                          </div>
                        );
                      })}
                      {!usuarios.length && <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"40px 0", color:"#71717a", fontSize:12 }}>Sin usuarios.</div>}
                    </div>
                  </div>
                )}

                {/* ══════ TAB: CLIENTES ══════ */}
                {tab==="clientes" && (
                  <div style={{ flex:1, overflow:"auto", padding:"22px 28px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      <div>
                        <div style={{ fontSize:13, color:"#f4f4f5", fontWeight:500 }}>Propietarios de embarcaciones</div>
                        <div style={{ fontSize:10, color:"#71717a", marginTop:3 }}>
                          Acceden al panel en <span style={{ fontFamily:"'JetBrains Mono',monospace", color:"#52525b" }}>/mi-panel</span>. Al crearlos aparecen automáticamente en Post-Venta.
                        </div>
                      </div>
                      <button style={Sx.btnPrimary} onClick={()=>setMCliente("nuevo")}>+ Nuevo cliente</button>
                    </div>
                    {clientes.length===0 ? (
                      <div style={{ textAlign:"center", padding:"60px 0", color:"#52525b", fontSize:12 }}>Sin clientes registrados. Creá el primero con "+ Nuevo cliente".</div>
                    ) : (
                      <div style={{ border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, overflow:"hidden", marginTop:16 }}>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 90px 110px 130px 160px", gap:0, padding:"8px 18px", background:"rgba(255,255,255,0.015)", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                          {["Propietario","Obra","Modelo","Barco","Acciones"].map(h=>(
                            <div key={h} style={{ fontSize:8, letterSpacing:2, color:"#52525b", textTransform:"uppercase" }}>{h}</div>
                          ))}
                        </div>
                        {clientes.map((c,i)=>(
                          <div key={c.id} className="hrow" style={{ display:"grid", gridTemplateColumns:"1fr 90px 110px 130px 160px", alignItems:"center", padding:"12px 18px", borderBottom: i<clientes.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none", background:"rgba(255,255,255,0.01)", transition:"background .12s" }}>
                            <div>
                              <div style={{ fontSize:13, color:"#f4f4f5", fontWeight:500 }}>{c.nombre_completo}</div>
                              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#52525b", marginTop:2 }}>{c.username ?? c.id.slice(0,10)}</div>
                            </div>
                            <div>
                              {c.obras ? (
                                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#93c5fd", fontWeight:700 }}>{c.obras.codigo}</span>
                              ) : (
                                <span style={{ fontSize:10, color:"#3a3a52" }}>Sin obra</span>
                              )}
                            </div>
                            <div>
                              {c.modelo_barco && (
                                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:5, background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)", color:"#f59e0b" }}>{c.modelo_barco}</span>
                              )}
                            </div>
                            <div style={{ fontSize:12, color:"#71717a" }}>{c.nombre_barco || "—"}</div>
                            <div style={{ display:"flex", gap:5 }}>
                              <button style={{ ...Sx.btnOutline, fontSize:10, padding:"4px 10px" }} onClick={()=>setMCliente(c)}>Editar</button>
                              <button style={{ ...Sx.btnOutline, fontSize:10, padding:"4px 8px", color:"#7070a0", display:"flex", alignItems:"center", gap:4 }} onClick={()=>setMPwCliente(c)}><Key size={10}/>PW</button>
                              <button style={{ ...Sx.btnDanger, fontSize:10, padding:"4px 8px", display:"flex", alignItems:"center" }} onClick={()=>eliminarCliente(c)}><XIcon size={10}/></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ══════ TAB: MODELOS ══════ */}
                {tab==="modelos" && (
                  <div style={{ flex:1, overflow:"auto", padding:"22px 28px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      <div>
                        <div style={{ fontSize:13, color:"#f4f4f5", fontWeight:500 }}>Modelos de embarcación</div>
                        <div style={{ fontSize:10, color:"#71717a", marginTop:3 }}>Las specs que configurás acá aparecen en la calculadora y guías técnicas del panel del cliente.</div>
                      </div>
                      <button style={Sx.btnPrimary} onClick={()=>setMModelo("nuevo")}>+ Nuevo modelo</button>
                    </div>
                    {modelos.length===0 ? (
                      <div style={{ textAlign:"center", padding:"60px 0", color:"#52525b", fontSize:12 }}>Sin modelos. Creá el primero con "+ Nuevo modelo".</div>
                    ) : (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:10, marginTop:16 }}>
                        {modelos.map(m=>{
                          const c = m.caracteristicas ?? {};
                          const clientesConModelo = clientes.filter(x=>x.modelo_barco===m.modelo_barco).length;
                          return (
                            <div key={m.id} className="hcard" style={{ border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, background:"rgba(255,255,255,0.02)", padding:"18px 20px", transition:"border-color .15s" }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                                <div>
                                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:700, color:"#f4f4f5", letterSpacing:-0.5 }}>{m.modelo_barco}</div>
                                  <div style={{ fontSize:9.5, color:"#52525b", marginTop:3 }}>{clientesConModelo} cliente{clientesConModelo!==1?"s":""} asignados</div>
                                </div>
                                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                                  {c.tiene_grupo && <span title="Grupo electrógeno" style={{ color:"#a0a0c0", display:"flex" }}><Zap size={13}/></span>}
                                  {c.tiene_aguas && <span title="Aguas negras" style={{ color:"#60a090", display:"flex" }}><Recycle size={13}/></span>}
                                  {c.tiene_mando && <span title="Mando electrónico" style={{ color:"#7090c0", display:"flex" }}><Gamepad2 size={13}/></span>}
                                </div>
                              </div>
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:14 }}>
                                {[
                                  { ico:<Fuel size={10}/>,     label:"Combustible", val:`${c.combustible??"-"} L` },
                                  { ico:<Droplets size={10}/>, label:"Agua",        val:`${c.agua??"-"} L` },
                                ].map(s=>(
                                  <div key={s.label} style={{ padding:"8px 12px", borderRadius:7, background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.05)" }}>
                                    <div style={{ fontSize:8.5, color:"#52525b", textTransform:"uppercase", letterSpacing:1, marginBottom:3, display:"flex", alignItems:"center", gap:4 }}><span style={{ opacity:0.6, display:"flex" }}>{s.ico}</span>{s.label}</div>
                                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:"#a1a1aa" }}>{s.val}</div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ display:"flex", gap:6 }}>
                                <button style={{ ...Sx.btnOutline, flex:1, textAlign:"center", display:"flex", alignItems:"center", justifyContent:"center", gap:5 }} onClick={()=>setMModelo(m)}><Pencil size={10}/>Editar specs</button>
                                <button style={{ ...Sx.btnDanger, display:"flex", alignItems:"center" }} onClick={()=>eliminarModelo(m)}><XIcon size={11}/></button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ══════ TAB: SISTEMA ══════ */}
                {tab==="sistema" && (
                  <div style={{ flex:1, overflow:"auto", padding:"22px 28px" }}>
                    <div style={{ marginBottom:20 }}>
                      <div style={{ fontSize:13, color:"#f4f4f5", fontWeight:500 }}>Parámetros del sistema</div>
                      <div style={{ fontSize:10, color:"#71717a", marginTop:3 }}>Los cambios se aplican de inmediato</div>
                    </div>
                    {Object.keys(configGrupos).length===0 ? (
                      <div style={{ textAlign:"center", padding:"40px 0", color:"#71717a", fontSize:12 }}>Sin configuración. Ejecutá el SQL de sistema_config primero.</div>
                    ) : Object.entries(configGrupos).map(([grupo,items])=>(
                      <div key={grupo} style={{ marginBottom:10, border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, background:"rgba(255,255,255,0.02)", overflow:"hidden" }}>
                        <div style={{ padding:"10px 18px", borderBottom:"1px solid rgba(255,255,255,0.05)", background:"rgba(255,255,255,0.015)" }}>
                          <span style={{ fontSize:9, letterSpacing:3, color:"#71717a", textTransform:"uppercase", fontWeight:600 }}>{grupo}</span>
                        </div>
                        <table style={{ width:"100%", borderCollapse:"collapse" }}>
                          <tbody>
                            {items.map((c,ci)=>{
                              const isDirty = editConf[c.clave]!==undefined;
                              const isBool  = c.tipo==="boolean";
                              const isNum   = c.tipo==="number";
                              const curVal  = editConf[c.clave] ?? c.valor;
                              return (
                                <tr key={c.clave} className="hrow" style={{ borderBottom: ci<items.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                  <td style={{ padding:"14px 18px", width:"50%" }}>
                                    <div style={{ fontSize:12, color:"#a1a1aa" }}>{c.descripcion??c.clave}</div>
                                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#52525b", marginTop:3 }}>{c.clave}</div>
                                  </td>
                                  <td style={{ padding:"14px 18px" }}>
                                    {isBool ? (
                                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                        <Toggle on={curVal==="true"} onChange={()=>setEditConf(p=>({...p,[c.clave]:curVal==="true"?"false":"true"}))} />
                                        <span style={{ fontSize:11, color:curVal==="true"?"#707080":"#282828" }}>{curVal==="true"?"Activado":"Desactivado"}</span>
                                      </div>
                                    ):(
                                      <input
                                        type={isNum?"number":"text"}
                                        style={{ ...Sx.input, maxWidth:200, padding:"7px 10px", ...(isNum?{fontFamily:"'JetBrains Mono',monospace"}:{}) }}
                                        value={curVal}
                                        onChange={e=>setEditConf(p=>({...p,[c.clave]:e.target.value}))}
                                      />
                                    )}
                                  </td>
                                  <td style={{ padding:"14px 18px", textAlign:"right", width:110 }}>
                                    {isDirty
                                      ? <button onClick={()=>guardarConfig(c.clave)} style={Sx.btnPrimary}>Guardar</button>
                                      : <span style={{ fontSize:10, color:"#71717a" }}>—</span>
                                    }
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

        {/* ══════════════════ MODALES ══════════════════ */}
        {mNuevoUser && <ModalNuevoUsuario onClose={()=>setMNuevoUser(false)} onSaved={cargar} flash={flash} />}
        {mEditUser  && <ModalEditarUsuario usuario={mEditUser} onClose={()=>setMEditUser(null)} onSaved={cargar} flash={flash} />}
        {mCliente   && <ModalCliente cliente={mCliente==="nuevo"?null:mCliente} modelos={modelos} onClose={()=>setMCliente(null)} onSaved={cargar} flash={flash} />}
        {mPwCliente && <ModalPasswordCliente cliente={mPwCliente} onClose={()=>setMPwCliente(null)} flash={flash} />}
        {mModelo    && <ModalModelo modelo={mModelo==="nuevo"?null:mModelo} onClose={()=>setMModelo(null)} onSaved={cargar} flash={flash} />}
      </div>
    </div>
  );
}
