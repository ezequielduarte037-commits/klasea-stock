import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
// 1. Importamos la Pieza de Lego
import Sidebar from "../components/Sidebar";

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
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

export default function MovimientosScreen({ profile, signOut }) {
  // El rol y username ahora se manejan visualmente en el Sidebar, 
  // pero mantenemos profile aquí para pasárselo.
  
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  async function cargar() {
    setErr("");

    const r = await supabase
      .from("movimientos_ui")
      .select("id,created_at,delta,obra,usuario,entregado_por,proveedor,recibe,obs_ui,material_nombre")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!r.error) {
      setRows(r.data ?? []);
      return;
    }

    // Fallback a tabla original si no existe la vista
    const r2 = await supabase
      .from("movimientos")
      .select("id,created_at,delta,obra,usuario,entregado_por,proveedor,recibe,obs,material_id")
      .order("created_at", { ascending: false })
      .limit(200);

    if (r2.error) return setErr(r2.error.message);

    const mats = await supabase.from("materiales").select("id,nombre");
    const map = new Map((mats.data ?? []).map((m) => [m.id, m.nombre]));

    setRows(
      (r2.data ?? []).map((m) => ({
        ...m,
        obs_ui: m.obs ?? null,
        material_nombre: map.get(m.material_id) ?? "—",
      }))
    );
  }

  useEffect(() => {
    cargar();
    const ch = supabase
      .channel("rt-movs")
      .on("postgres_changes", { event: "*", schema: "public", table: "movimientos" }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);


  function exportarMovimientos() {
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    const filas = filtrados.map(r => ({
      Fecha:         new Date(r.created_at).toLocaleDateString("es-AR"),
      Hora:          new Date(r.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      Tipo:          num(r.delta) >= 0 ? "Ingreso" : "Egreso",
      Material:      r.material_nombre ?? "—",
      Cantidad:      Math.abs(num(r.delta)),
      Obra:          r.obra ?? "—",
      Persona:       r.usuario ?? r.proveedor ?? "—",
      Panol:         r.entregado_por ?? r.recibe ?? "—",
      Observaciones: r.obs_ui ?? "—",
    }));
    descargarCSV(filas, `movimientos_maderas_${hoy}.csv`);
  }

  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const s = [r.material_nombre, r.obra, r.usuario, r.proveedor, r.entregado_por, r.recibe, r.obs_ui]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return s.includes(qq);
    });
  }, [rows, q]);

  // 2. Limpiamos estilos (sacamos sidebar, brand, logoK, navBtn, foot)
  const S = {
    page: { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    
    // Grid intacto
    layout: { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },

    main: { padding: 18, display: "flex", justifyContent: "center" },
    content: { width: "min(1300px, 100%)" },

    title: { fontFamily: "Montserrat, system-ui, Arial", fontSize: 20, margin: 0, color: "#fff" },
    card: { border: "1px solid #2a2a2a", borderRadius: 16, background: "#070707", padding: 16 },
    input: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#fff", padding: "12px 14px", borderRadius: 12, width: "100%", outline: "none" },

    tableWrap: { marginTop: 14, border: "1px solid #2a2a2a", borderRadius: 14, overflow: "hidden" },
    head: {
      display: "grid",
      gridTemplateColumns: "170px 1.25fr 90px 110px 170px 110px 1fr",
      gap: 10,
      padding: "12px 14px",
      background: "#060606",
      borderBottom: "1px solid #1d1d1d",
      fontSize: 11,
      opacity: 0.8,
      textTransform: "uppercase",
    },
    row: {
      display: "grid",
      gridTemplateColumns: "170px 1.25fr 90px 110px 170px 110px 1fr",
      gap: 10,
      padding: "14px 14px",
      borderBottom: "1px solid #151515",
      alignItems: "center",
    },
    delta: (d) => ({ fontWeight: 900, color: d >= 0 ? "#30d158" : "#ff453a" }),
    mat: { color: "#fff", fontWeight: 900 },
    muted: { fontSize: 12, opacity: 0.75 },
    bad: { marginTop: 10, color: "#ff453a", fontSize: 13 },
  };

  return (
    <div style={S.page}>
      <div style={S.layout}>
        
        {/* 3. Reemplazamos el div del sidebar viejo por el componente Sidebar */}
        <Sidebar profile={profile} signOut={signOut} />

        <div style={S.main}>
          <div style={S.content}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h2 style={{ ...S.title, margin: 0 }}>Movimientos</h2>
              <button
                onClick={exportarMovimientos}
                disabled={!filtrados.length}
                style={{
                  border: filtrados.length ? "1px solid rgba(48,209,88,0.28)" : "1px solid #2a2a2a",
                  background: filtrados.length ? "rgba(48,209,88,0.07)" : "transparent",
                  color: filtrados.length ? "#a6ffbf" : "#444",
                  padding: "7px 16px", borderRadius: 10, cursor: filtrados.length ? "pointer" : "not-allowed",
                  fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
                }}
                title={filtrados.length !== rows.length ? `Exporta ${filtrados.length} registros filtrados` : `Exporta los ${rows.length} registros`}
              >
                ↓ CSV
                <span style={{ fontSize: 10, opacity: 0.7 }}>
                  {filtrados.length !== rows.length ? `${filtrados.length} filtrados` : `${rows.length} registros`}
                </span>
              </button>
            </div>

            <div style={{ ...S.card, marginTop: 12 }}>
              <input
                style={S.input}
                placeholder="Buscar por material / obra / persona / pañol / proveedor..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              {err && <div style={S.bad}>ERROR: {err}</div>}

              <div style={S.tableWrap}>
                <div style={S.head}>
                  <div>FECHA</div>
                  <div>MATERIAL</div>
                  <div>DELTA</div>
                  <div>OBRA</div>
                  <div>PERSONA/PROV</div>
                  <div>PAÑOL</div>
                  <div>OBS</div>
                </div>

                {filtrados.slice(0, 200).map((r) => {
                  const d = num(r.delta);
                  const personaProv = r.usuario || r.proveedor || "—";
                  const panol = r.entregado_por || r.recibe || "—";
                  const obs = r.obs_ui || "—";

                  return (
                    <div key={r.id} style={S.row}>
                      <div style={S.muted}>{fmt(r.created_at)}</div>
                      <div style={S.mat}>{r.material_nombre || "—"}</div>
                      <div style={S.delta(d)}>{d}</div>
                      <div style={S.muted}>{r.obra || "—"}</div>
                      <div style={S.muted}>{personaProv}</div>
                      <div style={S.muted}>{panol}</div>
                      <div style={S.muted}>{obs}</div>
                    </div>
                  );
                })}

                {!filtrados.length && <div style={{ padding: 14, opacity: 0.7 }}>No hay movimientos.</div>}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}