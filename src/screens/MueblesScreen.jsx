import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
// 1. Importamos el Sidebar
import Sidebar from "../components/Sidebar";

const ESTADOS = ["No enviado", "Parcial", "Completo", "Rehacer"];

export default function MueblesScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin;
  
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [lineas, setLineas] = useState([]);
  const [lineaId, setLineaId] = useState("");
  const [lineaNombre, setLineaNombre] = useState("");

  const [unidades, setUnidades] = useState([]);
  const [unidadId, setUnidadId] = useState("");
  const [unidadCodigo, setUnidadCodigo] = useState("");

  const [rows, setRows] = useState([]);
  const [savingObsId, setSavingObsId] = useState(null);

  // ======= UI: Crear Línea / Unidad =======
  const [showAddLinea, setShowAddLinea] = useState(false);
  const [newLineaNombre, setNewLineaNombre] = useState("");
  const [copyFromLineaId, setCopyFromLineaId] = useState(""); // opcional

  const [showAddUnidad, setShowAddUnidad] = useState(false);
  const [newUnidadCodigo, setNewUnidadCodigo] = useState("");

  async function cargarLineas() {
    setErr("");
    const { data, error } = await supabase
      .from("prod_lineas")
      .select("id,nombre")
      .eq("activa", true)
      .order("nombre");

    if (error) return setErr(error.message);

    setLineas(data ?? []);
    if (!lineaId && data?.length) {
      setLineaId(data[0].id);
      setLineaNombre(data[0].nombre);
    }
  }

  async function cargarUnidades(lid) {
    if (!lid) return;
    setErr("");
    const { data, error } = await supabase
      .from("prod_unidades")
      .select("id,codigo")
      .eq("linea_id", lid)
      .eq("activa", true)
      .order("codigo");

    if (error) return setErr(error.message);

    setUnidades(data ?? []);
    if (!unidadId && data?.length) {
      setUnidadId(data[0].id);
      setUnidadCodigo(data[0].codigo);
    }
  }

  async function cargarChecklist(uid) {
    if (!uid) return;
    setErr("");
    setMsg("");

    const { data, error } = await supabase
      .from("prod_unidad_checklist")
      .select(`
        id, estado, obs,
        prod_muebles ( nombre, sector )
      `)
      .eq("unidad_id", uid);

    if (error) return setErr(error.message);

    const mapped = (data ?? []).map((x) => ({
      id: x.id,
      estado: x.estado,
      obs: x.obs ?? "",
      mueble: x.prod_muebles?.nombre ?? "",
      sector: x.prod_muebles?.sector ?? "",
    }));

    mapped.sort(
      (a, b) =>
        (a.sector || "").localeCompare(b.sector || "") ||
        (a.mueble || "").localeCompare(b.mueble || "")
    );

    setRows(mapped);
  }

  useEffect(() => {
    if (!isAdmin) return;
    cargarLineas();
  }, [isAdmin]);

  useEffect(() => {
    if (!lineaId) return;
    setUnidadId("");
    setUnidadCodigo("");
    setRows([]);
    cargarUnidades(lineaId);
  }, [lineaId]);

  useEffect(() => {
    if (!unidadId) return;
    cargarChecklist(unidadId);
  }, [unidadId]);

  const pct = useMemo(() => {
    if (!rows.length) return 0;
    const ok = rows.filter((r) => r.estado === "Completo").length;
    return Math.round((ok / rows.length) * 100);
  }, [rows]);

  async function setEstado(rowId, estado) {
    setErr("");
    const { error } = await supabase
      .from("prod_unidad_checklist")
      .update({ estado })
      .eq("id", rowId);

    if (error) return setErr(error.message);

    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, estado } : r)));
  }

  async function saveObs(rowId, obs) {
    setErr("");
    setSavingObsId(rowId);
    const { error } = await supabase
      .from("prod_unidad_checklist")
      .update({ obs })
      .eq("id", rowId);
    setSavingObsId(null);
    if (error) return setErr(error.message);
  }

  async function createLinea() {
    setErr("");
    setMsg("");
    const nombre = String(newLineaNombre || "").trim().toUpperCase();
    if (!nombre) return setErr("Poné un nombre de línea (ej: K55).");

    const { data: ins, error: e1 } = await supabase
      .from("prod_lineas")
      .insert([{ nombre, activa: true }])
      .select("id,nombre")
      .single();

    if (e1) return setErr(e1.message);

    if (copyFromLineaId) {
      const { data: src, error: e2 } = await supabase
        .from("prod_linea_muebles")
        .select("mueble_id")
        .eq("linea_id", copyFromLineaId);

      if (e2) return setErr(e2.message);

      if (src?.length) {
        const payload = src.map((r) => ({
          linea_id: ins.id,
          mueble_id: r.mueble_id,
        }));
        const { error: e3 } = await supabase.from("prod_linea_muebles").insert(payload);
        if (e3) return setErr(e3.message);
      }
    }

    setMsg(`Línea creada: ${nombre}`);
    setShowAddLinea(false);
    setNewLineaNombre("");
    setCopyFromLineaId("");
    await cargarLineas();
    setLineaId(ins.id);
    setLineaNombre(ins.nombre);
  }

  async function createUnidad() {
    setErr("");
    setMsg("");
    if (!lineaId) return setErr("No hay línea seleccionada.");
    const codigo = String(newUnidadCodigo || "").trim();
    if (!codigo) return setErr("Poné un código (ej: K52-24).");

    const { data: u, error: e1 } = await supabase
      .from("prod_unidades")
      .insert([{ linea_id: lineaId, codigo, activa: true }])
      .select("id,codigo")
      .single();

    if (e1) return setErr(e1.message);

    const { data: plantilla, error: e2 } = await supabase
      .from("prod_linea_muebles")
      .select("mueble_id")
      .eq("linea_id", lineaId);

    if (e2) return setErr(e2.message);

    if (!plantilla?.length) {
      setMsg(`Unidad creada (${codigo}). OJO: la línea no tiene plantilla de muebles todavía.`);
    } else {
      const payload = plantilla.map((r) => ({
        unidad_id: u.id,
        mueble_id: r.mueble_id,
        estado: "No enviado",
      }));
      const { error: e3 } = await supabase.from("prod_unidad_checklist").insert(payload);
      if (e3) return setErr(e3.message);
      setMsg(`Unidad creada: ${codigo} (checklist generado)`);
    }

    setShowAddUnidad(false);
    setNewUnidadCodigo("");
    await cargarUnidades(lineaId);
    setUnidadId(u.id);
    setUnidadCodigo(u.codigo);
  }

  const S = {
    page: { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout: { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    
    // Sacamos sidebar, brand, logo, navBtn...
    
    main: { padding: 18 },
    card: { border: "1px solid #2a2a2a", borderRadius: 16, background: "#070707", padding: 14, marginBottom: 12 },
    tabs: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
    tab: (on) => ({
      padding: "8px 12px", borderRadius: 999, border: "1px solid #2a2a2a",
      background: on ? "#111" : "transparent", color: on ? "#fff" : "#bbb", cursor: "pointer", fontWeight: 900,
    }),
    grid: { display: "grid", gridTemplateColumns: "260px 1fr", gap: 12 },
    unitBtn: (on) => ({
      width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 12, border: "1px solid #2a2a2a",
      background: on ? "#111" : "transparent", color: on ? "#fff" : "#bbb", cursor: "pointer", fontWeight: 900, marginBottom: 8,
    }),
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 12, opacity: 0.75, padding: "10px 8px", borderBottom: "1px solid #1d1d1d" },
    td: { padding: "10px 8px", borderBottom: "1px solid #111", verticalAlign: "top" },
    select: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#fff", padding: "8px 10px", borderRadius: 10, width: "100%" },
    input: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#fff", padding: "8px 10px", borderRadius: 10, width: "100%" },
    small: { fontSize: 12, opacity: 0.75 },
    badge: { fontSize: 12, opacity: 0.75, marginTop: 4 },
    btn: { padding: "8px 10px", borderRadius: 12, border: "1px solid #2a2a2a", background: "#111", color: "#fff", cursor: "pointer", fontWeight: 900 },
    btnGhost: { padding: "8px 10px", borderRadius: 12, border: "1px solid #2a2a2a", background: "transparent", color: "#bbb", cursor: "pointer", fontWeight: 900 },
    row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  };

  if (!isAdmin) {
    return (
      <div style={S.page}>
        <div style={{ padding: 20 }}>
          <h2 style={{ color: "#fff", margin: 0 }}>Acceso restringido</h2>
          <p style={S.small}>Este módulo es solo para Admin.</p>
          {/* Estilo simple para volver, ya que borramos S.navBtn */}
          <Link to="/panol" style={{ color: "#fff", textDecoration: "underline" }}>Volver</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.layout}>
        
        {/* 3. Sidebar inteligente */}
        <Sidebar profile={profile} signOut={signOut} />

        <main style={S.main}>
          {err ? <div style={{ ...S.card, borderColor: "#5a1d1d", color: "#ffbdbd" }}>{err}</div> : null}
          {msg ? <div style={{ ...S.card, borderColor: "#1d5a2b", color: "#bfffd0" }}>{msg}</div> : null}

          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, color: "#fff" }}>Checklist Muebles</h2>
                <div style={S.small}>Excel style: Línea → Unidad → Estado</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={S.small}>Unidad: <b style={{ color: "#fff" }}>{unidadCodigo || "—"}</b></div>
                <div style={S.small}>Completitud: <b style={{ color: "#fff" }}>{pct}%</b></div>
              </div>
            </div>

            <div style={{ ...S.row, marginTop: 10, justifyContent: "space-between" }}>
              <div style={S.tabs}>
                {lineas.map((l) => (
                  <button
                    key={l.id}
                    style={S.tab(l.id === lineaId)}
                    onClick={() => {
                      setLineaId(l.id);
                      setLineaNombre(l.nombre);
                    }}
                  >
                    {l.nombre}
                  </button>
                ))}
              </div>

              <button style={S.btn} onClick={() => setShowAddLinea((v) => !v)}>
                + Agregar línea
              </button>
            </div>

            {showAddLinea && (
              <div style={{ marginTop: 12, ...S.row }}>
                <input
                  style={{ ...S.input, maxWidth: 220 }}
                  placeholder="K55"
                  value={newLineaNombre}
                  onChange={(e) => setNewLineaNombre(e.target.value)}
                />

                <select
                  style={{ ...S.select, maxWidth: 280 }}
                  value={copyFromLineaId}
                  onChange={(e) => setCopyFromLineaId(e.target.value)}
                >
                  <option value="">(opcional) Copiar plantilla desde…</option>
                  {lineas.map((l) => (
                    <option key={l.id} value={l.id}>{l.nombre}</option>
                  ))}
                </select>

                <button style={S.btn} onClick={createLinea}>Crear</button>
                <button style={S.btnGhost} onClick={() => setShowAddLinea(false)}>Cancelar</button>

                <div style={S.small}>
                  Tip: si copiás desde K52, tu nueva línea arranca con checklist listo.
                </div>
              </div>
            )}
          </div>

          <div style={S.grid}>
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 900, color: "#fff" }}>
                  Unidades {lineaNombre ? `(${lineaNombre})` : ""}
                </div>

                <button
                  style={S.btn}
                  onClick={() => setShowAddUnidad((v) => !v)}
                  disabled={!lineaId}
                >
                  + Agregar barco
                </button>
              </div>

              {showAddUnidad && (
                <div style={{ marginTop: 10, ...S.row }}>
                  <input
                    style={S.input}
                    placeholder={lineaNombre ? `${lineaNombre}-24` : "K52-24"}
                    value={newUnidadCodigo}
                    onChange={(e) => setNewUnidadCodigo(e.target.value)}
                  />
                  <button style={S.btn} onClick={createUnidad}>Crear</button>
                  <button style={S.btnGhost} onClick={() => setShowAddUnidad(false)}>Cancelar</button>
                  <div style={S.small}>
                    Esto genera el checklist automáticamente con la plantilla de la línea.
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                {unidades.map((u) => (
                  <button
                    key={u.id}
                    style={S.unitBtn(u.id === unidadId)}
                    onClick={() => {
                      setUnidadId(u.id);
                      setUnidadCodigo(u.codigo);
                    }}
                  >
                    {u.codigo}
                  </button>
                ))}
              </div>

              {!unidades.length ? <div style={S.small}>No hay unidades cargadas.</div> : null}
            </div>

            <div style={S.card}>
              <div style={{ fontWeight: 900, color: "#fff", marginBottom: 10 }}>
                {unidadCodigo ? `Muebles – ${unidadCodigo}` : "Elegí una unidad"}
              </div>

              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Mueble</th>
                    <th style={S.th}>Sector</th>
                    <th style={S.th}>Estado</th>
                    <th style={S.th}>Obs</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td style={S.td}>
                        <b style={{ color: "#fff" }}>{r.mueble}</b>
                      </td>
                      <td style={S.td}>{r.sector || "—"}</td>
                      <td style={S.td}>
                        <select
                          style={S.select}
                          value={r.estado}
                          onChange={(e) => setEstado(r.id, e.target.value)}
                        >
                          {ESTADOS.map((x) => (
                            <option key={x} value={x}>{x}</option>
                          ))}
                        </select>
                        {savingObsId === r.id ? <div style={S.badge}>guardando…</div> : null}
                      </td>
                      <td style={S.td}>
                        <input
                          style={S.input}
                          value={r.obs}
                          placeholder="..."
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((p) => (p.id === r.id ? { ...p, obs: e.target.value } : p))
                            )
                          }
                          onBlur={() => saveObs(r.id, r.obs)}
                        />
                      </td>
                    </tr>
                  ))}

                  {!rows.length ? (
                    <tr>
                      <td style={S.td} colSpan={4}>
                        <span style={S.small}>
                          {unidadCodigo
                            ? "No hay checklist para esta unidad (posible: la línea no tiene plantilla)."
                            : "Seleccioná una unidad."}
                        </span>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              {unidadCodigo && !rows.length ? (
                <div style={{ marginTop: 10, ...S.small }}>
                  Si esta unidad quedó sin checklist, es porque la línea no tiene plantilla.
                  Solución rápida: creá la línea copiando desde otra, o decime y agregamos un editor de plantilla.
                </div>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}