import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import logoK from "../assets/logo-k.png";

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export default function AdminDashboard({ profile, signOut }) {
  const role = profile?.role ?? "oficina";
  const username = profile?.username ?? "—";

  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [q, setQ] = useState("");
  const [soloNoOk, setSoloNoOk] = useState(false);

  async function cargar() {
    setError("");
    const { data, error } = await supabase
      .from("materiales_kpi")
      .select("id,nombre,unidad_medida,stock_actual,stock_minimo,consumo_semanal,semanas_cobertura,estado,pedido_sugerido")
      .order("nombre", { ascending: true });

    if (error) return setError(error.message);
    setRows(data ?? []);
  }

  useEffect(() => {
    cargar();
    const ch = supabase
      .channel("rt-admin-materiales")
      .on("postgres_changes", { event: "*", schema: "public", table: "materiales" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const stats = useMemo(() => {
    const ok = rows.filter((r) => (r.estado || "").toUpperCase() === "OK").length;
    const at = rows.filter((r) => (r.estado || "").toUpperCase() === "ATENCION").length;
    const cr = rows.filter((r) => (r.estado || "").toUpperCase() === "CRITICO").length;
    return { ok, at, cr, total: rows.length };
  }, [rows]);

  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      const est = (r.estado || "").toUpperCase();
      if (soloNoOk && est === "OK") return false;
      if (!qq) return true;
      return (r.nombre || "").toLowerCase().includes(qq);
    });
  }, [rows, q, soloNoOk]);

  const listaCompra = useMemo(() => {
    return filtrados
      .filter((r) => num(r.pedido_sugerido) > 0)
      .map((r) => `${r.nombre} -> PEDIR: ${num(r.pedido_sugerido).toFixed(2)} ${r.unidad_medida || ""}`.trim());
  }, [filtrados]);

  function copiarListaCompra() {
    navigator.clipboard?.writeText(["LISTA DE COMPRA", ...listaCompra].join("\n"));
    setMsg("✅ Lista copiada");
    setTimeout(() => setMsg(""), 1500);
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
    meta: { fontSize: 12, opacity: 0.75 },

    card: { border: "1px solid #2a2a2a", borderRadius: 16, background: "#070707", padding: 16 },
    input: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#fff", padding: "10px 12px", borderRadius: 12, width: "100%" },
    btnGhost: { border: "1px solid #2a2a2a", background: "transparent", color: "#fff", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontWeight: 900 },
    chip: (active) => ({
      border: "1px solid #2a2a2a",
      background: active ? "#111" : "transparent",
      color: active ? "#fff" : "#bdbdbd",
      padding: "10px 12px",
      borderRadius: 999,
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12,
      letterSpacing: 0.6,
      whiteSpace: "nowrap",
      userSelect: "none",
    }),

    head: {
      display: "grid",
      gridTemplateColumns: "1.6fr 0.5fr 0.5fr 0.7fr 0.7fr 0.7fr 0.6fr",
      gap: 10,
      padding: "10px 0",
      borderBottom: "1px solid #2a2a2a",
      fontSize: 12,
      opacity: 0.8,
      textTransform: "uppercase",
    },
    row: (estado) => ({
      display: "grid",
      gridTemplateColumns: "1.6fr 0.5fr 0.5fr 0.7fr 0.7fr 0.7fr 0.6fr",
      gap: 10,
      padding: "12px 0",
      borderBottom: "1px solid #1e1e1e",
      alignItems: "center",
      background:
        estado === "CRITICO"
          ? "rgba(255,69,58,0.08)"
          : estado === "ATENCION"
          ? "rgba(255,214,10,0.07)"
          : "transparent",
    }),
    est: (estado) => ({
      fontWeight: 900,
      color: estado === "CRITICO" ? "#ff453a" : estado === "ATENCION" ? "#ffd60a" : "#30d158",
    }),
    bad: { marginTop: 10, color: "#ff453a", fontSize: 13 },
    ok: { marginTop: 10, color: "#30d158", fontSize: 13 },
    small: { fontSize: 12, opacity: 0.75 },
  };

  return (
    <div style={S.page}>
      <div style={S.layout}>
        <div style={S.sidebar}>
          <div style={S.brand}>
            <img src={logoK} alt="K" style={S.logoK} />
            <div style={S.brandText}>KLASE A</div>
          </div>

          <Link to="/admin" style={{ textDecoration: "none" }}>
            <button type="button" style={S.navBtn(true)}>Inventario</button>
          </Link>
          <Link to="/movimientos" style={{ textDecoration: "none" }}>
            <button type="button" style={S.navBtn(false)}>Movimientos</button>
          </Link>
          <Link to="/panol" style={{ textDecoration: "none" }}>
            <button type="button" style={S.navBtn(false)}>Operación</button>
          </Link>

          <div style={S.foot}>
            <div>Usuario: <b>{username}</b></div>
            <div>Rol: <b>{role}</b></div>
            <div style={{ marginTop: 8 }}>
              <button type="button" style={S.navBtn(false)} onClick={signOut}>Cerrar sesión</button>
            </div>
          </div>
        </div>

        <div style={S.main}>
          <div style={S.content}>
            <div style={S.topbar}>
              <div>
                <h2 style={S.title}>Inventario · Semáforo</h2>
                <div style={S.meta}>
                  Total: {stats.total} · OK: {stats.ok} ·{" "}
                  <span style={{ color: "#ffd60a", fontWeight: 900 }}>Atención: {stats.at}</span> ·{" "}
                  <span style={{ color: "#ff453a", fontWeight: 900 }}>Crítico: {stats.cr}</span>
                </div>
              </div>

              <button
                type="button"
                style={S.btnGhost}
                onClick={copiarListaCompra}
                disabled={listaCompra.length === 0}
                title="Copia líneas con pedido_sugerido > 0"
              >
                Copiar lista compra ({listaCompra.length})
              </button>
            </div>

            <div style={{ ...S.card, marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
                <input style={S.input} placeholder="Buscar material…" value={q} onChange={(e) => setQ(e.target.value)} />
                <div style={S.chip(soloNoOk)} onClick={() => setSoloNoOk((v) => !v)}>
                  {soloNoOk ? "Solo Atención/Crítico: ON" : "Solo Atención/Crítico: OFF"}
                </div>
              </div>

              {error && <div style={S.bad}>ERROR: {error}</div>}
              {msg && <div style={S.ok}>{msg}</div>}
            </div>

            <div style={S.card}>
              <div style={S.head}>
                <div>Material</div>
                <div>Stock</div>
                <div>Mín</div>
                <div>Cons/sem</div>
                <div>Sem cob</div>
                <div>Estado</div>
                <div>Pedir</div>
              </div>

              {filtrados.map((r) => {
                const est = (r.estado || "OK").toUpperCase();
                const stock = num(r.stock_actual);
                const min = num(r.stock_minimo);
                const cons = num(r.consumo_semanal);
                const cob =
                  r.semanas_cobertura === null || r.semanas_cobertura === undefined ? null : num(r.semanas_cobertura);
                const pedir = num(r.pedido_sugerido);

                return (
                  <div key={r.id} style={S.row(est)}>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 900 }}>{r.nombre}</div>
                      <div style={S.small}>{r.unidad_medida || "—"}</div>
                    </div>
                    <div style={{ fontWeight: 900 }}>{stock}</div>
                    <div>{min}</div>
                    <div>{cons.toFixed(2)}</div>
                    <div>{cob === null ? "—" : cob.toFixed(2)}</div>
                    <div style={S.est(est)}>{est}</div>
                    <div style={{ fontWeight: 900, color: pedir > 0 ? "#fff" : "#bdbdbd" }}>
                      {pedir.toFixed(2)}
                    </div>
                  </div>
                );
              })}

              {!filtrados.length && <div style={{ paddingTop: 12, opacity: 0.7 }}>No hay resultados.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
