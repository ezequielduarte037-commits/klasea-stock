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
      textAlign: "left",
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid #2a2a2a",
      background: active ? "#111" : "transparent",
      color: active ? "#fff" : "#bdbdbd",
      cursor: "pointer",
      marginTop: 8,
      fontWeight: 800,
    }),
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

  return (
    <div style={S.page}>
      <div style={S.layout}>
        {/* SIDEBAR */}
        <div style={S.sidebar}>
          <div style={S.brand}>
            <img src={logoK} alt="K" style={S.logoK} />
            <div style={S.brandText}>KLASE A</div>
          </div>

          <Link to="/panol" style={{ textDecoration: "none" }}>
            <button type="button" style={S.navBtn(true)}>Operación</button>
          </Link>

          {(role === "admin" || role === "oficina") && (
            <>
              <Link to="/admin" style={{ textDecoration: "none" }}>
                <button type="button" style={S.navBtn(false)}>Inventario</button>
              </Link>

              <Link to="/movimientos" style={{ textDecoration: "none" }}>
                <button type="button" style={S.navBtn(false)}>Movimientos</button>
              </Link>
            </>
          )}

          <div style={S.foot}>
            <div>Usuario: <b>{username}</b></div>
            <div>Rol: <b>{role}</b></div>
            <div style={{ marginTop: 8 }}>
              <button type="button" style={S.navBtn(false)} onClick={signOut}>Cerrar sesión</button>
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div style={S.main}>
          <div style={S.content}>
            <div style={S.topbar}>
              <h2 style={S.title}>Operación</h2>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={S.btnTop(modo === "EGRESO")} onClick={() => setModo("EGRESO")}>RETIRAR</button>
                <button type="button" style={S.btnTop(modo === "INGRESO")} onClick={() => setModo("INGRESO")}>INGRESAR</button>
              </div>
            </div>

            <div style={S.grid}>
              <form style={S.card} onSubmit={confirmar}>
                <div style={S.row}>
                  <div style={S.label}>MATERIAL</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <input style={S.input} placeholder="Buscar material..." value={q} onChange={(e) => setQ(e.target.value)} />
                    <select style={S.select} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
                      {filtrados.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre} · stock {num(m.stock_actual)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ✅ CANTIDAD + botones */}
                <div style={S.row}>
                  <div style={S.label}>CANTIDAD</div>
                  <div style={S.qtyWrap}>
                    <input
                      style={S.input}
                      placeholder="Ingresá cantidad"
                      value={cantidad}
                      onChange={(e) => {
                        setCantidad(e.target.value);
                        setCantidadRevisada(true);
                      }}
                      onBlur={() => setCantidadRevisada(true)}
                      inputMode="numeric"
                    />

                    <div style={S.qtyBtns}>
                      <button type="button" style={S.qtyBtn} onClick={() => ajustarCantidad(-5)}>-5</button>
                      <button type="button" style={S.qtyBtn} onClick={() => ajustarCantidad(-1)}>-1</button>
                      <button type="button" style={S.qtyBtn} onClick={() => ajustarCantidad(+1)}>+1</button>
                      <button type="button" style={S.qtyBtn} onClick={() => ajustarCantidad(+5)}>+5</button>
                    </div>

                    {!cantidadRevisada && (
                      <div style={S.warn}>⚠ Revisá la cantidad antes de confirmar.</div>
                    )}
                  </div>
                </div>

                <div style={S.row}>
                  <div style={S.label}>OBRA</div>
                  <input style={S.input} placeholder="Ej: K43-01" value={obra} onChange={(e) => setObra(e.target.value)} />
                </div>

                {modo === "EGRESO" ? (
                  <>
                    <div style={S.row}>
                      <div style={S.label}>RETIRA</div>
                      <input style={S.input} value={retira} onChange={(e) => setRetira(e.target.value)} />
                    </div>
                    <div style={S.row}>
                      <div style={S.label}>PAÑOL</div>
                      <input style={S.input} value={entrega} onChange={(e) => setEntrega(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <>
                    <div style={S.row}>
                      <div style={S.label}>PROVEEDOR</div>
                      <input style={S.input} value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
                    </div>
                    <div style={S.row}>
                      <div style={S.label}>RECIBE</div>
                      <input style={S.input} value={recibe} onChange={(e) => setRecibe(e.target.value)} />
                    </div>
                  </>
                )}

                <div style={S.row}>
                  <div style={S.label}>OBS</div>
                  <input style={S.input} value={obs} onChange={(e) => setObs(e.target.value)} />
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  <button type="submit" style={S.btn}>
                    {modo === "EGRESO" ? "CONFIRMAR EGRESO" : "CONFIRMAR INGRESO"}
                  </button>
                  <button type="button" style={S.btn} onClick={limpiar}>LIMPIAR</button>
                </div>

                {msg && <div style={S.ok}>{msg}</div>}
                {err && <div style={S.bad}>ERROR: {err}</div>}
              </form>

              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontFamily: "Montserrat, system-ui, Arial", color: "#fff", fontWeight: 900 }}>
                    Últimos movimientos
                  </div>
                  {(role === "admin" || role === "oficina") && (
                    <Link to="/movimientos" style={{ color: "#bdbdbd", textDecoration: "none", fontSize: 12 }}>
                      ver todo →
                    </Link>
                  )}
                </div>

                <div style={{ marginTop: 10 }}>
                  {movs.map((m) => {
                    const tipo = num(m.delta) >= 0 ? "ING" : "EGR";
                    const abs = Math.abs(num(m.delta));
                    const obsTxt = m.obs_ui ?? "";
                    return (
                      <div key={m.id} style={S.movRow}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <div style={{ color: "#fff", fontWeight: 900 }}>
                            {m.material_nombre || "—"}
                          </div>
                          <span style={S.pill(tipo)}>{tipo} {abs}</span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                          {fmt(m.created_at)} · Obra {m.obra || "—"}
                        </div>
                        {obsTxt && (
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                            Obs: {obsTxt}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!movs.length && <div style={{ opacity: 0.7, marginTop: 10 }}>Sin movimientos todavía.</div>}
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
