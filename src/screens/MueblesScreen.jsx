import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
// Importamos el Sidebar
import Sidebar from "../components/Sidebar";

const ESTADOS = ["No enviado", "Parcial", "Completo", "Rehacer"];

export default function MueblesScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin;
  
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // ESTADOS PRINCIPALES
  const [lineas, setLineas] = useState([]);
  const [lineaId, setLineaId] = useState("");
  const [lineaNombre, setLineaNombre] = useState("");

  const [unidades, setUnidades] = useState([]);
  const [unidadId, setUnidadId] = useState("");
  const [unidadCodigo, setUnidadCodigo] = useState("");

  const [rows, setRows] = useState([]); // Checklist del barco
  const [savingObsId, setSavingObsId] = useState(null);

  // ======= NUEVO: MODO EDITOR DE PLANTILLA =======
  const [modoEdicion, setModoEdicion] = useState(false); // false = ver barco / true = editar plantilla
  const [plantilla, setPlantilla] = useState([]); // lista de muebles de la línea
  const [newMueble, setNewMueble] = useState({ nombre: "", sector: "" });

  // ======= UI: Crear Línea / Unidad =======
  const [showAddLinea, setShowAddLinea] = useState(false);
  const [newLineaNombre, setNewLineaNombre] = useState("");
  const [copyFromLineaId, setCopyFromLineaId] = useState(""); 

  const [showAddUnidad, setShowAddUnidad] = useState(false);
  const [newUnidadCodigo, setNewUnidadCodigo] = useState("");

  // ---------------------------------------------------------
  // CARGAS
  // ---------------------------------------------------------

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
    // Al cambiar de línea, reseteamos la unidad seleccionada
    setUnidadId("");
    setUnidadCodigo("");
    setRows([]);
    
    // Si hay unidades, seleccionamos la primera (opcional, o dejar que elija)
    if (data?.length) {
      setUnidadId(data[0].id);
      setUnidadCodigo(data[0].codigo);
    }
  }

  async function cargarChecklist(uid) {
    if (!uid) return;
    setErr("");
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

    mapped.sort((a, b) => 
      (a.sector || "").localeCompare(b.sector || "") || 
      (a.mueble || "").localeCompare(b.mueble || "")
    );

    setRows(mapped);
  }

  // --- NUEVO: Cargar la plantilla (muebles base) de la línea ---
  async function cargarPlantilla(lid) {
    if (!lid) return;
    const { data, error } = await supabase
      .from("prod_linea_muebles")
      .select(`
        id,
        prod_muebles ( id, nombre, sector )
      `)
      .eq("linea_id", lid);

    if (error) return setErr("Error cargando plantilla: " + error.message);

    const lista = (data ?? []).map((x) => ({
      link_id: x.id, // id de la relación
      mueble_id: x.prod_muebles?.id,
      nombre: x.prod_muebles?.nombre,
      sector: x.prod_muebles?.sector
    }));
    
    // Ordenar por sector
    lista.sort((a, b) => (a.sector || "").localeCompare(b.sector || ""));
    setPlantilla(lista);
  }

  // ---------------------------------------------------------
  // EFECTOS
  // ---------------------------------------------------------

  useEffect(() => {
    if (isAdmin) cargarLineas();
  }, [isAdmin]);

  useEffect(() => {
    if (lineaId) {
      cargarUnidades(lineaId);
      if (modoEdicion) cargarPlantilla(lineaId);
    }
  }, [lineaId, modoEdicion]);

  useEffect(() => {
    if (unidadId && !modoEdicion) {
      cargarChecklist(unidadId);
    }
  }, [unidadId, modoEdicion]);

  // ---------------------------------------------------------
  // ACCIONES
  // ---------------------------------------------------------

  const pct = useMemo(() => {
    if (!rows.length) return 0;
    const ok = rows.filter((r) => r.estado === "Completo").length;
    return Math.round((ok / rows.length) * 100);
  }, [rows]);

  async function setEstado(rowId, estado) {
    setErr("");
    const { error } = await supabase.from("prod_unidad_checklist").update({ estado }).eq("id", rowId);
    if (error) return setErr(error.message);
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, estado } : r)));
  }

  async function saveObs(rowId, obs) {
    setErr("");
    setSavingObsId(rowId);
    const { error } = await supabase.from("prod_unidad_checklist").update({ obs }).eq("id", rowId);
    setSavingObsId(null);
    if (error) return setErr(error.message);
  }

  // --- NUEVO: Agregar mueble a la línea ---
  async function agregarMuebleAPlantilla(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (!lineaId) return setErr("No hay línea seleccionada.");
    if (!newMueble.nombre.trim()) return setErr("Nombre del mueble obligatorio.");
    if (!newMueble.sector.trim()) return setErr("Sector obligatorio.");

    // 1. Crear el mueble en la tabla global `prod_muebles`
    // (Ojo: si ya existe uno igual, esto crea uno nuevo. Simplificamos para no complicar el selector)
    const { data: m, error: e1 } = await supabase
      .from("prod_muebles")
      .insert({ 
        nombre: newMueble.nombre.trim(), 
        sector: newMueble.sector.trim() 
      })
      .select()
      .single();

    if (e1) return setErr("Error creando mueble: " + e1.message);

    // 2. Vincularlo a la línea en `prod_linea_muebles`
    const { error: e2 } = await supabase
      .from("prod_linea_muebles")
      .insert({
        linea_id: lineaId,
        mueble_id: m.id
      });

    if (e2) return setErr("Error vinculando mueble: " + e2.message);

    setMsg("✅ Mueble agregado a la plantilla.");
    setNewMueble({ nombre: "", sector: "" });
    cargarPlantilla(lineaId);
  }

  // --- Crear Línea y Unidad (Igual que antes) ---
  async function createLinea() {
    // ... (Lógica idéntica a la anterior)
    setErr(""); setMsg("");
    const nombre = String(newLineaNombre || "").trim().toUpperCase();
    if (!nombre) return setErr("Nombre inválido.");

    const { data: ins, error: e1 } = await supabase.from("prod_lineas").insert([{ nombre, activa: true }]).select().single();
    if (e1) return setErr(e1.message);

    if (copyFromLineaId) {
      const { data: src } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id", copyFromLineaId);
      if (src?.length) {
        const payload = src.map((r) => ({ linea_id: ins.id, mueble_id: r.mueble_id }));
        await supabase.from("prod_linea_muebles").insert(payload);
      }
    }
    setMsg(`Línea ${nombre} creada.`);
    setShowAddLinea(false);
    setNewLineaNombre("");
    cargarLineas();
  }

  async function createUnidad() {
    setErr(""); setMsg("");
    if (!lineaId) return setErr("Seleccioná línea.");
    const codigo = String(newUnidadCodigo || "").trim();
    if (!codigo) return setErr("Código inválido.");

    const { data: u, error: e1 } = await supabase.from("prod_unidades").insert([{ linea_id: lineaId, codigo, activa: true }]).select().single();
    if (e1) return setErr(e1.message);

    const { data: plantilla } = await supabase.from("prod_linea_muebles").select("mueble_id").eq("linea_id", lineaId);
    if (!plantilla?.length) {
      setMsg(`Unidad ${codigo} creada VACÍA (la línea no tiene muebles cargados en la plantilla).`);
    } else {
      const payload = plantilla.map((r) => ({ unidad_id: u.id, mueble_id: r.mueble_id, estado: "No enviado" }));
      await supabase.from("prod_unidad_checklist").insert(payload);
      setMsg(`Unidad ${codigo} creada y checklist generado.`);
    }
    setShowAddUnidad(false);
    setNewUnidadCodigo("");
    cargarUnidades(lineaId);
  }

  const S = {
    page: { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout: { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main: { padding: 18 },
    card: { border: "1px solid #2a2a2a", borderRadius: 16, background: "#070707", padding: 14, marginBottom: 12 },
    tabs: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" },
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
    btnConfig: (on) => ({
      padding: "8px 10px", borderRadius: 12, border: "1px solid #2a2a2a",
      background: on ? "#2a1f00" : "transparent", color: on ? "#ffd60a" : "#666", 
      cursor: "pointer", fontWeight: 900, marginLeft: "auto"
    }),
    row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  };

  if (!isAdmin) {
    return (
      <div style={S.page}>
        <div style={{ padding: 20 }}>
          <h2 style={{ color: "#fff", margin: 0 }}>Acceso restringido</h2>
          <Link to="/panol" style={{ color: "#fff", textDecoration: "underline" }}>Volver</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />

        <main style={S.main}>
          {err ? <div style={{ ...S.card, borderColor: "#5a1d1d", color: "#ffbdbd" }}>{err}</div> : null}
          {msg ? <div style={{ ...S.card, borderColor: "#1d5a2b", color: "#bfffd0" }}>{msg}</div> : null}

          {/* === SELECTOR DE LÍNEA Y CONFIGURACIÓN === */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, color: "#fff" }}>
                  {modoEdicion ? `Editando Plantilla: ${lineaNombre}` : "Producción Muebles"}
                </h2>
                <div style={S.small}>
                  {modoEdicion 
                    ? "Agregá los muebles base. Los barcos NUEVOS heredarán esta lista." 
                    : "Seguimiento de estado por barco."}
                </div>
              </div>
            </div>

            <div style={{ ...S.row, marginTop: 10 }}>
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

              {/* Botón para abrir el editor de plantilla */}
              {lineaId && (
                <button 
                  style={S.btnConfig(modoEdicion)} 
                  onClick={() => setModoEdicion(!modoEdicion)}
                  title="Editar muebles base de la línea"
                >
                  {modoEdicion ? "Cerrar Editor" : "⚙️ Editar Plantilla"}
                </button>
              )}

              <button style={S.btn} onClick={() => setShowAddLinea(!showAddLinea)}>+ Línea</button>
            </div>

            {/* Modal crear línea */}
            {showAddLinea && (
              <div style={{ marginTop: 12, ...S.row }}>
                <input style={{ ...S.input, maxWidth: 150 }} placeholder="Nombre (K55)" value={newLineaNombre} onChange={(e) => setNewLineaNombre(e.target.value)} />
                <select style={{ ...S.select, maxWidth: 200 }} value={copyFromLineaId} onChange={(e) => setCopyFromLineaId(e.target.value)}>
                  <option value="">(Opcional) Copiar de...</option>
                  {lineas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
                <button style={S.btn} onClick={createLinea}>Crear</button>
              </div>
            )}
          </div>

          {/* === VISTA 1: EDITOR DE PLANTILLA (Si tocaste el engranaje) === */}
          {modoEdicion ? (
            <div style={S.card}>
              <h3 style={{ marginTop: 0, color: "#ffd60a" }}>Muebles Base (Plantilla {lineaNombre})</h3>
              
              {/* Formulario para agregar mueble */}
              <div style={{ ...S.row, background: "#111", padding: 10, borderRadius: 12, marginBottom: 14 }}>
                <input 
                  style={{ ...S.input, flex: 1 }} 
                  placeholder="Nombre del mueble (Ej: Bajo Mesada)" 
                  value={newMueble.nombre} 
                  onChange={e => setNewMueble({...newMueble, nombre: e.target.value})} 
                />
                <input 
                  style={{ ...S.input, width: 150 }} 
                  placeholder="Sector (Ej: Cocina)" 
                  value={newMueble.sector} 
                  onChange={e => setNewMueble({...newMueble, sector: e.target.value})} 
                />
                <button style={S.btn} onClick={agregarMuebleAPlantilla}>Agregar</button>
              </div>

              {/* Lista actual */}
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Mueble</th>
                    <th style={S.th}>Sector</th>
                  </tr>
                </thead>
                <tbody>
                  {plantilla.map(p => (
                    <tr key={p.link_id}>
                      <td style={S.td}><b style={{color: "#fff"}}>{p.nombre}</b></td>
                      <td style={S.td}>{p.sector}</td>
                    </tr>
                  ))}
                  {!plantilla.length && <tr><td colSpan={2} style={S.td}>No hay muebles definidos para esta línea.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            /* === VISTA 2: CHECKLIST POR UNIDAD (Lo que ya tenías) === */
            <div style={S.grid}>
              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontWeight: 900, color: "#fff" }}>Unidades</div>
                  <button style={S.btn} onClick={() => setShowAddUnidad(!showAddUnidad)} disabled={!lineaId}>+ Barco</button>
                </div>

                {showAddUnidad && (
                  <div style={{ marginBottom: 10, ...S.row }}>
                    <input style={S.input} placeholder={`${lineaNombre}-XX`} value={newUnidadCodigo} onChange={(e) => setNewUnidadCodigo(e.target.value)} />
                    <button style={S.btn} onClick={createUnidad}>OK</button>
                  </div>
                )}

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
                {!unidades.length && <div style={S.small}>Sin unidades.</div>}
              </div>

              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontWeight: 900, color: "#fff" }}>{unidadCodigo || "Seleccioná barco"}</div>
                  <div style={S.small}>{unidadId ? `Progreso: ${pct}%` : ""}</div>
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
                        <td style={S.td}><b style={{ color: "#fff" }}>{r.mueble}</b></td>
                        <td style={S.td}>{r.sector}</td>
                        <td style={S.td}>
                          <select style={S.select} value={r.estado} onChange={(e) => setEstado(r.id, e.target.value)}>
                            {ESTADOS.map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                          {savingObsId === r.id && <div style={S.badge}>...</div>}
                        </td>
                        <td style={S.td}>
                          <input style={S.input} value={r.obs} onChange={(e) => setRows(prev => prev.map(p => p.id === r.id ? { ...p, obs: e.target.value } : p))} onBlur={() => saveObs(r.id, r.obs)} />
                        </td>
                      </tr>
                    ))}
                    {unidadId && !rows.length && (
                      <tr><td colSpan={4} style={S.td}>Este barco no tiene checklist generado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}