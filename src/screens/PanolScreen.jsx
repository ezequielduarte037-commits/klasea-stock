import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import logoK from "../assets/logo-k.png";

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default function PanolScreen({ profile, signOut }) {
  const role = profile?.role ?? "panol";
  const isAdmin = !!profile?.is_admin;
  const username = profile?.username ?? "—";

  const [modo, setModo] = useState("EGRESO"); // EGRESO / INGRESO
  const [materiales, setMateriales] = useState([]);
  const [movs, setMovs] = useState([]);

  const [q, setQ] = useState("");
  const [materialId, setMaterialId] = useState("");

  // ✅ cantidad arranca vacía para obligar a tocarla
  const [cantidad, setCantidad] = useState("");
  // ✅ flag anti-olvido: si no tocaron cantidad, no deja confirmar
  const [cantidadRevisada, setCantidadRevisada] = useState(false);

  const [obra, setObra] = useState("");
  const [retira, setRetira] = useState("");
  const [entrega, setEntrega] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [recibe, setRecibe] = useState("");
  const [obs, setObs] = useState("");

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function cargarMateriales() {
    const { data, error } = await supabase
      .from("materiales")
      .select("id,nombre,categoria,unidad_medida,stock_actual,stock_minimo")
      .order("nombre", { ascending: true });

    if (error) return setErr(error.message);
    setMateriales(data ?? []);
    if (!materialId && (data ?? []).length) setMaterialId(data[0].id);
  }

  async function cargarMovs() {
    const r = await supabase
      .from("movimientos_ui")
      .select("id,created_at,delta,obra,usuario,entregado_por,proveedor,recibe,obs_ui,material_nombre")
      .order("created_at", { ascending: false })
      .limit(12);

    if (!r.error) {
      setMovs(r.data ?? []);
      return;
    }

    const r2 = await supabase
      .from("movimientos")
      .select("id,created_at,delta,obra,usuario,entregado_por,proveedor,recibe,obs,material_id")
      .order("created_at", { ascending: false })
      .limit(12);

    if (r2.error) return setErr(r2.error.message);

    const mats = await supabase.from("materiales").select("id,nombre");
    const map = new Map((mats.data ?? []).map((m) => [m.id, m.nombre]));
    setMovs(
      (r2.data ?? []).map((m) => ({
        ...m,
        obs_ui: m.obs ?? null,
        material_nombre: map.get(m.material_id) ?? "—",
      }))
    );
  }

  useEffect(() => {
    cargarMateriales();
    cargarMovs();

    const ch1 = supabase
      .channel("rt-pan-materiales")
      .on("postgres_changes", { event: "*", schema: "public", table: "materiales" }, cargarMateriales)
      .subscribe();

    const ch2 = supabase
      .channel("rt-pan-movs")
      .on("postgres_changes", { event: "*", schema: "public", table: "movimientos" }, cargarMovs)
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return materiales;
    return materiales.filter((m) => {
      const a = (m.nombre ?? "").toLowerCase();
      const b = (m.categoria ?? "").toLowerCase();
      return a.includes(qq) || b.includes(qq);
    });
  }, [q, materiales]);

  const sel = useMemo(() => materiales.find((m) => m.id === materialId), [materialId, materiales]);

  function limpiar() {
    setCantidad("");
    setCantidadRevisada(false);
    setObra("");
    setRetira("");
    setEntrega("");
    setProveedor("");
    setRecibe("");
    setObs("");
    setMsg("");
    setErr("");
  }

  function ajustarCantidad(delta) {
    const actual = cantidad === "" ? 0 : num(cantidad);
    const nuevo = Math.max(0, actual + delta);
    setCantidad(String(nuevo));
    setCantidadRevisada(true);
  }

  async function confirmar(e) {
    e?.preventDefault?.();
    setErr("");
    setMsg("");

    if (!materialId) return setErr("Seleccioná un material.");
    if (!obra.trim()) return setErr("Obra obligatoria.");

    // ✅ anti-olvido de cantidad
    if (!cantidadRevisada) return setErr("Revisá la cantidad (tocá el campo o usá + / -).");
    if (cantidad === "" || num(cantidad) <= 0) return setErr("Cantidad inválida.");

    // ✅ si es 1, pregunta confirmación (clásico olvido)
    if (num(cantidad) === 1) {
      const ok = window.confirm("Cantidad = 1. ¿Confirmás que es correcto?");
      if (!ok) return;
    }

    if (modo === "EGRESO") {
      if (!retira.trim()) return setErr("Falta nombre de quien retira.");
      if (!entrega.trim()) return setErr("Falta empleado de pañol (entrega).");
    } else {
      if (!proveedor.trim()) return setErr("Falta proveedor.");
      if (!recibe.trim()) return setErr("Falta quien recibe (pañol).");
    }

    const delta = modo === "EGRESO" ? -Math.abs(num(cantidad)) : Math.abs(num(cantidad));

    // RPC si existe
    const rpc = await supabase.rpc("registrar_movimiento", {
      p_material_id: materialId,
      p_delta: delta,
      p_obra: obra.trim(),
      p_usuario: modo === "EGRESO" ? retira.trim() : null,
      p_entregado_por: modo === "EGRESO" ? entrega.trim() : null,
      p_proveedor: modo === "INGRESO" ? proveedor.trim() : null,
      p_recibe: modo === "INGRESO" ? recibe.trim() : null,
      p_obs: obs.trim() || null,
    });

    if (!rpc.error) {
      setMsg("✅ Movimiento registrado");
      limpiar();
      await cargarMateriales();
      await cargarMovs();
      return;
    }

    // fallback
    const nuevoStock = num(sel?.stock_actual) + delta;

    const up = await supabase.from("materiales").update({ stock_actual: nuevoStock }).eq("id", materialId);
    if (up.error) return setErr("No pude actualizar stock: " + up.error.message);

    const ins = await supabase.from("movimientos").insert({
      material_id: materialId,
      delta,
      obra: obra.trim(),
      usuario: modo === "EGRESO" ? retira.trim() : null,
      entregado_por: modo === "EGRESO" ? entrega.trim() : null,
      proveedor: modo === "INGRESO" ? proveedor.trim() : null,
      recibe: modo === "INGRESO" ? recibe.trim() : null,
      obs: obs.trim() || null,
    });
    if (ins.error) return setErr("No pude guardar movimiento: " + ins.error.message);

    setMsg("✅ Movimiento registrado");
    limpiar();
    await cargarMateriales();
    await cargarMovs();
  }

  const S = {
    page: { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout: { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    sidebar: { borderRight: "1px solid #2a2a2a", padding: 18, background: "#050505", position: "relative" },
    brand: { display: "flex", alignItems: "center", gap: 12, marginBottom: 18 },
    logoK: { width: 28, height: 28, objectFit: "contain", opacity: 0.95 },
    brandText: { fontFamily: "Montserrat, system-ui, Arial", fontWeight: 900, letterSpacing: 3, color: "#fff" },

    navBtn: (active) => ({
      width: "100%",
      display: "block",
      textAlign: "left",
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid #2a2a2a",
      background: active ? "#111" : "transparent",
      color: active ? "#fff" : "#bdbdbd",
      cursor: "pointer",
      marginTop: 8,
      fontWeight: 800,
      textDecoration: "none",
    }),

    groupTitle: {
      marginTop: 10,
      marginBottom: 6,
      fontSize: 12,
      opacity: 0.7,
      fontWeight: 900,
      letterSpacing: 1,
    },

    foot: { position: "absolute", left: 18, right: 18, bottom: 18, opacity: 0.85, fontSize: 12 },

    main: { padding: 18, display: "flex", justifyContent: "center" },
    content: { width: "min(1200px, 100%)" },

    topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 },
    title: { fontFamily: "Montserrat, system-ui, Arial", fontSize: 20, margin: 0, color: "#fff" },

    grid: { display: "grid", gridTemplateColumns: "1fr 420px", gap: 14, alignItems: "start" },
    card: { border: "1px solid #2a2a2a", borderRadius: 16, background: "#070707", padding: 16 },

    row: { display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "center", marginTop: 10 },
    label: { fontSize: 12, opacity: 0.75, letterSpacing: 1.2 },
    input: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#fff", padding: "10px 12px", borderRadius: 12, width: "100%" },
    select: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#fff", padding: "10px 12px", borderRadius: 12, width: "100%" },

    btnTop: (active) => ({
      border: "1px solid #2a2a2a",
      background: active ? "#111" : "transparent",
      color: active ? "#fff" : "#bdbdbd",
      padding: "10px 16px",
      borderRadius: 999,
      cursor: "pointer",
      fontWeight: 900,
      letterSpacing: 1,
    }),
    btn: { border: "1px solid #2a2a2a", background: "#111", color: "#fff", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontWeight: 900 },

    qtyWrap: { display: "grid", gridTemplateColumns: "1fr", gap: 8 },
    qtyBtns: { display: "flex", gap: 8, flexWrap: "wrap" },
    qtyBtn: {
      border: "1px solid #2a2a2a",
      background: "transparent",
      color: "#fff",
      padding: "8px 10px",
      borderRadius: 12,
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12,
      opacity: 0.9,
    },

    warn: {
      marginTop: 10,
      padding: 10,
      borderRadius: 12,
      border: "1px solid rgba(255,214,10,0.35)",
      background: "rgba(255,214,10,0.10)",
      color: "#ffeaa6",
      fontSize: 13,
    },

    ok: { marginTop: 10, color: "#30d158", fontSize: 13 },
    bad: { marginTop: 10, color: "#ff453a", fontSize: 13 },

    movRow: { padding: "10px 0", borderBottom: "1px solid #1e1e1e" },
    pill: (tipo) => ({
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      border: "1px solid #2a2a2a",
      background: tipo === "ING" ? "rgba(48,209,88,0.12)" : "rgba(255,69,58,0.10)",
      color: tipo === "ING" ? "#30d158" : "#ff453a",
      fontWeight: 900,
      fontSize: 12,
    }),
  };

  // Solo admin/oficina ven los submódulos de maderas (Inventario/Movimientos/Pedidos)
  const puedeVerAdminMaderas = role === "admin" || role === "oficina" || isAdmin;

  return (
    <div style={S.page}>
      <div style={S.layout}>
        {/* SIDEBAR */}
        <aside style={S.sidebar}>
          <div style={S.brand}>
            <img src={logoK} alt="K" style={S.logoK} />
            <div style={S.brandText}>KLASE A</div>
          </div>

          {/* ===== MADERAS ===== */}
          <div style={S.groupTitle}>MADERAS</div>
          <Link to="/panol" style={S.navBtn(true)}>Operación</Link>

          {puedeVerAdminMaderas && (
            <>
              <Link to="/admin" style={S.navBtn(false)}>Inventario</Link>
              <Link to="/movimientos" style={S.navBtn(false)}>Movimientos</Link>
              <Link to="/pedidos" style={S.navBtn(false)}>Pedidos</Link>
            </>
          )}

          {/* ===== PRODUCCIÓN (solo admin) ===== */}
          {isAdmin && (
            <>
              <div style={{ ...S.groupTitle, marginTop: 16 }}>PRODUCCIÓN</div>
              <Link to="/marmoleria" style={S.navBtn(false)}>Marmolería</Link>
            </>
          )}

          <div style={S.foot}>
            <div>Usuario: <b>{username}</b></div>
            <div>Rol: <b>{role}</b></div>
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                style={{ ...S.navBtn(false), cursor: "pointer" }}
                onClick={signOut}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main style={S.main}>
          <div style={S.content}>
            <div style={S.topbar}>
              <h2 style={S.title}>Operación</h2>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={S.btnTop(modo === "EGRESO")} onClick={() => setModo("EGRESO")}>
                  EGRESO
                </button>
                <button type="button" style={S.btnTop(modo === "INGRESO")} onClick={() => setModo("INGRESO")}>
                  INGRESO
                </button>
              </div>
            </div>

            <div style={S.grid}>
              {/* FORM */}
              <div style={S.card}>
                <div style={S.row}>
                  <div style={S.label}>Buscar</div>
                  <input style={S.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material..." />
                </div>

                <div style={S.row}>
                  <div style={S.label}>Material</div>
                  <select style={S.select} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
                    {filtrados.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={S.row}>
                  <div style={S.label}>Obra</div>
                  <input style={S.input} value={obra} onChange={(e) => setObra(e.target.value)} placeholder="Ej: K37 / K55 / Taller..." />
                </div>

                {modo === "EGRESO" ? (
                  <>
                    <div style={S.row}>
                      <div style={S.label}>Retira</div>
                      <input style={S.input} value={retira} onChange={(e) => setRetira(e.target.value)} placeholder="Nombre" />
                    </div>
                    <div style={S.row}>
                      <div style={S.label}>Entrega</div>
                      <input style={S.input} value={entrega} onChange={(e) => setEntrega(e.target.value)} placeholder="Empleado de pañol" />
                    </div>
                  </>
                ) : (
                  <>
                    <div style={S.row}>
                      <div style={S.label}>Proveedor</div>
                      <input style={S.input} value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Proveedor" />
                    </div>
                    <div style={S.row}>
                      <div style={S.label}>Recibe</div>
                      <input style={S.input} value={recibe} onChange={(e) => setRecibe(e.target.value)} placeholder="Empleado de pañol" />
                    </div>
                  </>
                )}

                <div style={S.row}>
                  <div style={S.label}>Cantidad</div>
                  <div style={S.qtyWrap}>
                    <input
                      style={S.input}
                      value={cantidad}
                      onChange={(e) => {
                        setCantidad(e.target.value);
                        setCantidadRevisada(true);
                      }}
                      placeholder="Ej: 2 / 1.5 / 10"
                    />
                    <div style={S.qtyBtns}>
                      <button type="button" style={S.qtyBtn} onClick={() => ajustarCantidad(-10)}>-10</button>
                      <button type="button" style={S.qtyBtn} onClick={() => ajustarCantidad(-1)}>-1</button>
                      <button type="button" style={S.qtyBtn} onClick={() => ajustarCantidad(+1)}>+1</button>
                      <button type="button" style={S.qtyBtn} onClick={() => ajustarCantidad(+10)}>+10</button>
                    </div>

                    {!cantidadRevisada && (
                      <div style={S.warn}>⚠️ Revisá la cantidad antes de confirmar (para evitar olvidos).</div>
                    )}
                  </div>
                </div>

                <div style={S.row}>
                  <div style={S.label}>Obs</div>
                  <input style={S.input} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
                </div>

                <div style={{ marginTop: 14 }}>
                  <button type="button" style={S.btn} onClick={confirmar}>
                    Confirmar
                  </button>

                  {msg ? <div style={S.ok}>{msg}</div> : null}
                  {err ? <div style={S.bad}>{err}</div> : null}
                </div>
              </div>

              {/* MOVIMIENTOS */}
              <div style={S.card}>
                <h3 style={{ marginTop: 0, color: "#fff" }}>Últimos movimientos</h3>

                {movs.map((m) => {
                  const tipo = num(m.delta) >= 0 ? "ING" : "EGR";
                  return (
                    <div key={m.id} style={S.movRow}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 900, color: "#fff" }}>{m.material_nombre}</div>
                        <div style={S.pill(tipo)}>{tipo}</div>
                      </div>

                      <div style={{ opacity: 0.85, marginTop: 6, fontSize: 13 }}>
                        <div><b>Delta:</b> {m.delta}</div>
                        <div><b>Obra:</b> {m.obra}</div>
                        {m.usuario ? <div><b>Retira:</b> {m.usuario}</div> : null}
                        {m.entregado_por ? <div><b>Entrega:</b> {m.entregado_por}</div> : null}
                        {m.proveedor ? <div><b>Proveedor:</b> {m.proveedor}</div> : null}
                        {m.recibe ? <div><b>Recibe:</b> {m.recibe}</div> : null}
                        {m.obs_ui ? <div><b>Obs:</b> {m.obs_ui}</div> : null}
                        <div style={{ opacity: 0.7 }}><b>Fecha:</b> {fmt(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })}

                {!movs.length ? <div style={{ opacity: 0.75 }}>Sin movimientos.</div> : null}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
