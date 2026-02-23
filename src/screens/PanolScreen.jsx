import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// --- FUNCIONES AUXILIARES ---
function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-AR");
}


// ── CSV Export ──────────────────────────────────────────────────
function descargarCSV(filas, nombre) {
  if (!filas.length) return;
  const cols = Object.keys(filas[0]);
  const esc  = v => {
    const s = v == null ? "" : String(v);
    return (s.includes(",") || s.includes('"') || s.includes("\n"))
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.map(esc).join(","), ...filas.map(r => cols.map(k => esc(r[k])).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: nombre }).click();
  URL.revokeObjectURL(url);
}

export default function PanolScreen({ profile, signOut }) {
  // ESTADOS DE LA PANTALLA
  const [modo, setModo] = useState("EGRESO"); // EGRESO / INGRESO
  const [materiales, setMateriales] = useState([]);
  const [movs, setMovs] = useState([]);

  const [q, setQ] = useState("");
  const [materialId, setMaterialId] = useState("");

  // ESTADOS DEL FORMULARIO
  const [cantidad, setCantidad] = useState("");
  const [cantidadRevisada, setCantidadRevisada] = useState(false); // Anti-olvido

  const [obra, setObra] = useState("");
  const [retira, setRetira] = useState("");
  const [entrega, setEntrega] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [recibe, setRecibe] = useState("");
  const [obs, setObs] = useState("");

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // --- CARGA DE DATOS ---
  async function cargarMateriales() {
    const { data, error } = await supabase
      .from("materiales")
      .select("id,nombre,categoria,unidad_medida,stock_actual,stock_minimo")
      .order("nombre", { ascending: true });

    if (error) return setErr(error.message);
    setMateriales(data ?? []);
    
    // Solo setear inicial si no hay nada seleccionado
    if (!materialId && (data ?? []).length) {
      setMaterialId(data[0].id);
    }
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

    // Fallback
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

  // --- EFECTOS ---
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

  // --- LÓGICA DE FILTRADO Y AUTO-SELECCIÓN (EL FIX) ---
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

  // FIX: Lógica de auto-selección protegida
  useEffect(() => {
    if (filtrados.length > 0) {
      // Chequeamos si el material seleccionado sigue estando visible en la lista filtrada
      const sigueSiendoValido = filtrados.find(m => m.id === materialId);
      
      // SOLO si desapareció de la lista (porque filtré algo distinto), saltamos al primero.
      // Si sigue estando (ej: refresh de stock), NO tocamos nada.
      if (!sigueSiendoValido) {
        setMaterialId(filtrados[0].id);
      }
    }
  }, [filtrados, materialId]); // Importante: dependencia materialId para que la comparación sea fresca


  // ── Estado y funciones de exportación ─────────────────────────
  const [exportando, setExportando] = useState(false);

  async function exportarStockMaderas() {
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    const filas = materiales.map(m => ({
      Material:      m.nombre,
      Categoria:     m.categoria ?? "—",
      Unidad:        m.unidad_medida ?? "—",
      Stock_actual:  num(m.stock_actual),
      Stock_minimo:  num(m.stock_minimo),
      Estado:        num(m.stock_actual) <= 0 ? "CRÍTICO"
                       : num(m.stock_actual) <= num(m.stock_minimo) ? "ATENCIÓN"
                       : "OK",
    }));
    descargarCSV(filas, `stock_maderas_${hoy}.csv`);
  }

  async function exportarMovimientosMaderas() {
    setExportando(true);
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    // Traer todos los movimientos sin el límite de 12
    const r = await supabase
      .from("movimientos_ui")
      .select("id,created_at,delta,obra,usuario,entregado_por,proveedor,recibe,obs_ui,material_nombre")
      .order("created_at", { ascending: false });
    const datos = r.data ?? movs;
    const mats = await supabase.from("materiales").select("id,nombre");
    const matMap = new Map((mats.data ?? []).map(m => [m.id, m.nombre]));
    const filas = datos.map(m => ({
      Fecha:         new Date(m.created_at).toLocaleDateString("es-AR"),
      Hora:          new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      Tipo:          num(m.delta) >= 0 ? "Ingreso" : "Egreso",
      Material:      m.material_nombre ?? matMap.get(m.material_id) ?? "—",
      Cantidad:      Math.abs(num(m.delta)),
      Obra:          m.obra ?? "—",
      Persona:       m.usuario ?? "—",
      Panol:         m.entregado_por ?? m.recibe ?? "—",
      Proveedor:     m.proveedor ?? "—",
      Observaciones: m.obs_ui ?? "—",
    }));
    descargarCSV(filas, `movimientos_maderas_${hoy}.csv`);
    setExportando(false);
  }

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
    if (!cantidadRevisada) return setErr("Revisá la cantidad.");
    if (cantidad === "" || num(cantidad) <= 0) return setErr("Cantidad inválida.");

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

    // RPC
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
      setMsg(`✅ Movimiento OK: ${sel?.nombre}`);
      limpiar();
      await cargarMateriales();
      await cargarMovs();
      return;
    }

    // Fallback manual
    const nuevoStock = num(sel?.stock_actual) + delta;
    const up = await supabase.from("materiales").update({ stock_actual: nuevoStock }).eq("id", materialId);
    if (up.error) return setErr("Error stock: " + up.error.message);

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
    if (ins.error) return setErr("Error guardar: " + ins.error.message);

    setMsg(`✅ Movimiento OK: ${sel?.nombre}`);
    limpiar();
    await cargarMateriales();
    await cargarMovs();
  }

  // --- ESTILOS ---
  const S = {
    page: { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout: { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
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
      border: "1px solid #2a2a2a", background: "transparent", color: "#fff",
      padding: "8px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 900, fontSize: 12, opacity: 0.9,
    },
    warn: { marginTop: 6, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#666", fontSize: 11 },
    ok: { marginTop: 10, color: "#30d158", fontSize: 13 },
    bad: { marginTop: 10, color: "#ff453a", fontSize: 13 },

    movRow: { padding: "10px 0", borderBottom: "1px solid #1e1e1e" },
    pill: (tipo) => ({
      display: "inline-block", padding: "4px 10px", borderRadius: 999, border: "1px solid #2a2a2a",
      background: tipo === "ING" ? "rgba(48,209,88,0.12)" : "rgba(255,69,58,0.10)",
      color: tipo === "ING" ? "#30d158" : "#ff453a", fontWeight: 900, fontSize: 12,
    }),
  };

  return (
    <div style={S.page}>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={S.main}>
          <div style={S.content}>
            <div style={S.topbar}>
              <div>
                <h2 style={S.title}>Operación</h2>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>Pañol · Maderas</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button" onClick={exportarStockMaderas}
                  style={{ ...S.btn, fontSize: 12, padding: "8px 14px", color: "#a6ffbf", borderColor: "rgba(48,209,88,0.25)", background: "rgba(48,209,88,0.07)" }}
                  title="Exporta el stock actual de todos los materiales"
                >
                  ↓ Stock CSV
                </button>
                <button
                  type="button" onClick={exportarMovimientosMaderas} disabled={exportando}
                  style={{ ...S.btn, fontSize: 12, padding: "8px 14px", color: "#b5c8ff", borderColor: "rgba(100,150,255,0.25)", background: "rgba(100,150,255,0.07)" }}
                  title="Exporta todos los movimientos históricos"
                >
                  {exportando ? "Exportando…" : "↓ Movimientos CSV"}
                </button>
                <div style={{ width: 1, height: 24, background: "#2a2a2a" }} />
                <button type="button" style={S.btnTop(modo === "EGRESO")} onClick={() => setModo("EGRESO")}>EGRESO</button>
                <button type="button" style={S.btnTop(modo === "INGRESO")} onClick={() => setModo("INGRESO")}>INGRESO</button>
              </div>
            </div>

            <div style={S.grid}>
              {/* FORMULARIO */}
              <div style={S.card}>
                <div style={S.row}>
                  <div style={S.label}>Buscar</div>
                  <input style={S.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej: Fibro..." />
                </div>
                <div style={S.row}>
                  <div style={S.label}>Material</div>
                  <div style={{ width: "100%" }}>
                    <select style={S.select} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
                      {filtrados.map((m) => (<option key={m.id} value={m.id}>{m.nombre}</option>))}
                    </select>
                    {/* CONFIRMACIÓN VISUAL */}
                    <div style={{ fontSize: 11, color: "#30d158", marginTop: 4, textAlign: "right" }}>
                       {sel ? `Seleccionado: ${sel.nombre}` : "—"}
                    </div>
                  </div>
                </div>
                <div style={S.row}>
                  <div style={S.label}>Obra</div>
                  <input style={S.input} value={obra} onChange={(e) => setObra(e.target.value)} placeholder="Ej: K37..." />
                </div>

                {modo === "EGRESO" ? (
                  <>
                    <div style={S.row}>
                      <div style={S.label}>Retira</div>
                      <input style={S.input} value={retira} onChange={(e) => setRetira(e.target.value)} />
                    </div>
                    <div style={S.row}>
                      <div style={S.label}>Entrega</div>
                      <input style={S.input} value={entrega} onChange={(e) => setEntrega(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <>
                    <div style={S.row}>
                      <div style={S.label}>Proveedor</div>
                      <input style={S.input} value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
                    </div>
                    <div style={S.row}>
                      <div style={S.label}>Recibe</div>
                      <input style={S.input} value={recibe} onChange={(e) => setRecibe(e.target.value)} />
                    </div>
                  </>
                )}

                <div style={S.row}>
                  <div style={S.label}>Cantidad</div>
                  <div style={S.qtyWrap}>
                    <input style={S.input} value={cantidad} onChange={(e) => { setCantidad(e.target.value); setCantidadRevisada(true); }} placeholder="Ej: 2" />
                    <div style={S.qtyBtns}>
                      <button type="button" style={S.qtyBtn} onClick={() => ajustarCantidad(-10)}>-10</button>
                      <button type="button" style={S.qtyBtn} onClick={() => ajustarCantidad(-1)}>-1</button>
                      <button type="button" style={S.qtyBtn} onClick={() => ajustarCantidad(+1)}>+1</button>
                      <button type="button" style={S.qtyBtn} onClick={() => ajustarCantidad(+10)}>+10</button>
                    </div>
                    {!cantidadRevisada && <div style={S.warn}>Revisá la cantidad antes de confirmar</div>}
                  </div>
                </div>

                <div style={S.row}>
                  <div style={S.label}>Obs</div>
                  <input style={S.input} value={obs} onChange={(e) => setObs(e.target.value)} />
                </div>

                <div style={{ marginTop: 14 }}>
                  <button type="button" style={S.btn} onClick={confirmar}>Confirmar</button>
                  {msg && <div style={S.ok}>{msg}</div>}
                  {err && <div style={S.bad}>{err}</div>}
                </div>
              </div>

              {/* LISTA */}
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
                        <div><b>Delta:</b> {m.delta} | <b>Obra:</b> {m.obra}</div>
                        {m.usuario && <div><b>Retira:</b> {m.usuario}</div>}
                        <div style={{ opacity: 0.7 }}><b>Fecha:</b> {fmt(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}