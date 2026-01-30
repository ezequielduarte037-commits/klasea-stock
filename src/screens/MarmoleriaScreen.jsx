import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
// 1. Importamos la Pieza de Lego
import Sidebar from "../components/Sidebar";

const ESTADOS = ["En proceso", "Proceso finalizado", "Reenviado", "No se va a usar"];

export default function MarmoleriaScreen({ profile, signOut }) {
  const isAdmin = !!profile?.is_admin;
  // El username ya no lo usamos acá para el sidebar, pero lo dejamos por si querés mostrarlo en otro lado
  const username = profile?.username ?? "—";

  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState("todos");

  const [form, setForm] = useState({
    unidad: "",
    fecha_envio: "",
    tipo_plantilla: "",
    color: "",
    sector: "",
    cantidad: 1,
    estado: "En proceso",
    fecha_regreso: "",
    observaciones: "",
    foto_ref: "",
  });

  async function cargar() {
    setError("");
    const { data, error } = await supabase
      .from("marmoleria_envios")
      .select("*")
      .order("fecha_envio", { ascending: false })
      .order("creado_en", { ascending: false });

    if (error) setError(error.message);
    else setRows(data ?? []);
  }

  useEffect(() => {
    cargar();
    const ch = supabase
      .channel("rt-marmoleria")
      .on("postgres_changes", { event: "*", schema: "public", table: "marmoleria_envios" }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fEstado !== "todos" && r.estado !== fEstado) return false;
      if (!qq) return true;
      const t = `${r.unidad} ${r.tipo_plantilla} ${r.color || ""} ${r.sector || ""} ${r.observaciones || ""}`.toLowerCase();
      return t.includes(qq);
    });
  }, [rows, q, fEstado]);

  async function crear(e) {
    e.preventDefault();
    setError("");

    if (!form.unidad.trim()) return setError("Unidad es obligatoria (ej: 37-28)");
    if (!form.fecha_envio) return setError("Fecha envío es obligatoria");
    if (!form.tipo_plantilla.trim()) return setError("Tipo plantilla es obligatorio");
    if (!form.sector.trim()) return setError("Sector es obligatorio");
    if (!Number(form.cantidad) || Number(form.cantidad) <= 0) return setError("Cantidad inválida");

    const { data: auth } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const userId = auth?.user?.id ?? null;

    const payload = {
      unidad: form.unidad.trim(),
      fecha_envio: form.fecha_envio,
      tipo_plantilla: form.tipo_plantilla.trim(),
      color: form.color.trim() || null,
      sector: form.sector.trim(),
      cantidad: Number(form.cantidad),
      estado: form.estado,
      fecha_regreso: form.fecha_regreso || null,
      observaciones: form.observaciones.trim() || null,
      foto_ref: form.foto_ref.trim() || null,
      creado_por: userId,
    };

    const { error } = await supabase.from("marmoleria_envios").insert(payload);
    if (error) return setError(error.message);

    setForm({
      unidad: "",
      fecha_envio: "",
      tipo_plantilla: "",
      color: "",
      sector: "",
      cantidad: 1,
      estado: "En proceso",
      fecha_regreso: "",
      observaciones: "",
      foto_ref: "",
    });
    cargar();
  }

  async function setEstado(id, estado) {
    setError("");
    const patch = { estado };

    // si finaliza y no tiene fecha_regreso, setear hoy (opcional)
    if (estado === "Proceso finalizado") {
      patch.fecha_regreso = new Date().toISOString().slice(0, 10);
    }
    const { error } = await supabase.from("marmoleria_envios").update(patch).eq("id", id);
    if (error) setError(error.message);
    else cargar();
  }

  const S = {
    page: { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    
    // Mantenemos Grid
    layout: { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },

    main: { padding: 18, display: "flex", justifyContent: "center" },
    content: { width: "min(1200px, 100%)" },
    
    card: { border: "1px solid #2a2a2a", borderRadius: 16, background: "#070707", padding: 16, marginBottom: 12 },
    input: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#eaeaea", padding: "10px 12px", borderRadius: 12, width: "100%", outline: "none" },
    row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
    row3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
    btn: { border: "1px solid #2a2a2a", background: "#111", color: "#fff", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontWeight: 900 },
    btnGhost: { border: "1px solid #2a2a2a", background: "transparent", color: "#d0d0d0", padding: "8px 10px", borderRadius: 12, cursor: "pointer", fontWeight: 900 },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 12, opacity: 0.75, padding: "10px 8px", borderBottom: "1px solid #1d1d1d" },
    td: { padding: "10px 8px", borderBottom: "1px solid #111", verticalAlign: "top" },
    small: { fontSize: 12, opacity: 0.75 },
    
    // Estilos de Sidebar y navBtn eliminados (ya están en el componente)
  };

  if (!isAdmin) {
    return (
      <div style={S.page}>
        <div style={{ padding: 20 }}>
          <h2 style={{ color: "#fff", margin: 0 }}>Acceso restringido</h2>
          <p style={S.small}>Este módulo es solo para Admin.</p>
          <Link to="/panol" style={{ color: "#fff", textDecoration: "underline" }}>Volver</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.layout}>
        
        {/* 3. Reemplazamos aside por Sidebar */}
        <Sidebar profile={profile} signOut={signOut} />

        <main style={S.main}>
          <div style={S.content}>
            {error ? <div style={{ ...S.card, borderColor: "#5a1d1d", color: "#ffbdbd" }}>{error}</div> : null}

            <div style={S.card}>
              <h2 style={{ margin: 0, color: "#fff" }}>Marmolería (plantillas / recepción)</h2>
              <div style={{ marginTop: 10, ...S.row3 }}>
                <input style={S.input} placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
                <select style={S.input} value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                  <option value="todos">Todos</option>
                  {ESTADOS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
                <button style={S.btn} onClick={cargar}>Refrescar</button>
              </div>
            </div>

            <div style={S.card}>
              <h3 style={{ marginTop: 0, color: "#fff" }}>Nuevo envío</h3>
              <form onSubmit={crear}>
                <div style={S.row3}>
                  <input style={S.input} placeholder="Unidad (ej: 37-28)" value={form.unidad} onChange={(e) => setForm(s => ({ ...s, unidad: e.target.value }))} />
                  <input style={S.input} type="date" value={form.fecha_envio} onChange={(e) => setForm(s => ({ ...s, fecha_envio: e.target.value }))} />
                  <input style={S.input} placeholder="Sector (Cocina/Cockpit/Baño...)" value={form.sector} onChange={(e) => setForm(s => ({ ...s, sector: e.target.value }))} />
                </div>

                <div style={{ ...S.row2, marginTop: 10 }}>
                  <input style={S.input} placeholder="Tipo plantilla (ej: Mesada y anafe)" value={form.tipo_plantilla} onChange={(e) => setForm(s => ({ ...s, tipo_plantilla: e.target.value }))} />
                  <input style={S.input} placeholder="Color" value={form.color} onChange={(e) => setForm(s => ({ ...s, color: e.target.value }))} />
                </div>

                <div style={{ ...S.row3, marginTop: 10 }}>
                  <input style={S.input} type="number" step="0.01" placeholder="Cantidad" value={form.cantidad} onChange={(e) => setForm(s => ({ ...s, cantidad: e.target.value }))} />
                  <select style={S.input} value={form.estado} onChange={(e) => setForm(s => ({ ...s, estado: e.target.value }))}>
                    {ESTADOS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                  <input style={S.input} type="date" value={form.fecha_regreso} onChange={(e) => setForm(s => ({ ...s, fecha_regreso: e.target.value }))} />
                </div>

                <div style={{ marginTop: 10 }}>
                  <input style={S.input} placeholder="Observaciones" value={form.observaciones} onChange={(e) => setForm(s => ({ ...s, observaciones: e.target.value }))} />
                </div>

                <div style={{ marginTop: 10 }}>
                  <input style={S.input} placeholder="Foto (texto o URL)" value={form.foto_ref} onChange={(e) => setForm(s => ({ ...s, foto_ref: e.target.value }))} />
                </div>

                <div style={{ marginTop: 10 }}>
                  <button style={S.btn} type="submit">Crear</button>
                </div>
              </form>
            </div>

            <div style={S.card}>
              <h3 style={{ marginTop: 0, color: "#fff" }}>Registro</h3>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Unidad</th>
                    <th style={S.th}>Envío</th>
                    <th style={S.th}>Tipo</th>
                    <th style={S.th}>Color</th>
                    <th style={S.th}>Sector</th>
                    <th style={S.th}>Cant</th>
                    <th style={S.th}>Estado</th>
                    <th style={S.th}>Regreso</th>
                    <th style={S.th}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((r) => (
                    <tr key={r.id}>
                      <td style={S.td}><b style={{ color: "#fff" }}>{r.unidad}</b></td>
                      <td style={S.td}>{r.fecha_envio}</td>
                      <td style={S.td}>{r.tipo_plantilla}</td>
                      <td style={S.td}>{r.color || "—"}</td>
                      <td style={S.td}>{r.sector}</td>
                      <td style={S.td}>{r.cantidad}</td>
                      <td style={S.td}>{r.estado}</td>
                      <td style={S.td}>{r.fecha_regreso || "—"}</td>
                      <td style={S.td}>
                        <button style={S.btnGhost} onClick={() => setEstado(r.id, "En proceso")}>En proceso</button>{" "}
                        <button style={S.btnGhost} onClick={() => setEstado(r.id, "Reenviado")}>Reenviado</button>{" "}
                        <button style={S.btnGhost} onClick={() => setEstado(r.id, "Proceso finalizado")}>Recibido ✅</button>
                      </td>
                    </tr>
                  ))}
                  {!filtrados.length ? (
                    <tr><td style={S.td} colSpan={9}><span style={S.small}>Sin resultados.</span></td></tr>
                  ) : null}
                </tbody>
              </table>
              <div style={{ marginTop: 10, ...S.small }}>
                Tip: el botón “Recibido ✅” marca “Proceso finalizado” y setea fecha_regreso a hoy si estaba vacío.
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}