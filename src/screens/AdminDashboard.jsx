import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import logoK from "../assets/logo-k.png";

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export default function AdminDashboard({ profile, signOut }) {
  const username = profile?.username ?? "—";

  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [q, setQ] = useState("");
  const [soloNoOk, setSoloNoOk] = useState(false);

  async function cargar() {
    setError("");
    const { data, error } = await supabase
      .from("materiales_kpi_pedidos")
      .select(
        "id,nombre,unidad_medida,stock_actual,stock_minimo,consumo_semanal,semanas_cobertura,estado,pedido_sugerido,pedido_pendiente,estado_ui"
      )
      .order("nombre", { ascending: true });

    if (error) return setError(error.message);
    setRows(data ?? []);
  }

  useEffect(() => {
    cargar();
    const ch = supabase
      .channel("rt-admin-materiales")
      .on("postgres_changes", { event: "*", schema: "public", table: "materiales" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_items" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const stats = useMemo(() => {
    const st = (r) => String(r.estado_ui || r.estado || "").toUpperCase();
    const ok = rows.filter((r) => st(r) === "OK").length;
    const at = rows.filter((r) => st(r) === "ATENCION").length;
    const cr = rows.filter((r) => st(r) === "CRITICO").length;
    const pe = rows.filter((r) => st(r) === "PEDIDO").length;
    return { ok, at, cr, pe, total: rows.length };
  }, [rows]);

  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      const est = String(r.estado_ui || r.estado || "").toUpperCase();
      if (soloNoOk && est === "OK") return false;
      if (!qq) return true;
      return (r.nombre || "").toLowerCase().includes(qq);
    });
  }, [rows, q, soloNoOk]);

  // Lista de compra: NO incluir lo ya pedido (pedido_pendiente = true)
  const listaCompra = useMemo(() => {
    return filtrados
      .filter((r) => num(r.pedido_sugerido) > 0)
      .filter((r) => !r.pedido_pendiente)
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
      display: "block",
      textDecoration: "none",
    }),
    foot: { position: "absolute", left: 18, right: 18, bottom: 18, opacity: 0.85, fontSize: 12 },

    main: { padding: 18, display: "flex", justifyContent: "center" },
    content: { width: "min(1200px, 100%)" },

    topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 },
    title: { fontFamily: "Montserrat, system-ui, Arial", fontSize: 20, margin: 0, color: "#fff" },
    meta: { fontSize: 12, opacity: 0.75 },

    card: { border: "1px solid #2a2a2a", borderRadius: 16, background: "#070707", padding: 16, marginBottom: 12 },
    input: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#eaeaea", padding: "10px 12px", borderRadius: 12, width: "100%", outline: "none" },
    btn: { border: "1px solid #2a2a2a", background: "#111", color: "#fff", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontWeight: 900 },
    btnGhost: { border: "1px solid #2a2a2a", background: "transparent", color: "#d0d0d0", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontWeight: 900 },

    grid4: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 },
    stat: (bg) => ({ padding: 12, borderRadius: 14, border: "1px solid #2a2a2a", background: bg, color: "#fff" }),

    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 12, opacity: 0.75, padding: "10px 8px", borderBottom: "1px solid #1d1d1d" },
    td: { padding: "10px 8px", borderBottom: "1px solid #111", verticalAlign: "top" },

    pill: (st) => {
      const s = String(st || "").toUpperCase();
      const bg =
        s === "OK" ? "#0b2512" :
        s === "ATENCION" ? "#2a1f00" :
        s === "CRITICO" ? "#2a0b0b" :
        s === "PEDIDO" ? "#13224a" :
        "#111";
      const fg =
        s === "OK" ? "#a6ffbf" :
        s === "ATENCION" ? "#ffe7a6" :
        s === "CRITICO" ? "#ffbdbd" :
        s === "PEDIDO" ? "#b5c8ff" :
        "#fff";
      return { display: "inline-block", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 900, border: "1px solid #2a2a2a", background: bg, color: fg };
    },
  };

  return (
    <div style={S.page}>
      <div style={S.layout}>
        <aside style={S.sidebar}>
          <div style={S.brand}>
            <img src={logoK} alt="K" style={S.logoK} />
            <div style={S.brandText}>KLASE A</div>
          </div>

          <Link to="/panol" style={S.navBtn(false)}>Operación (Pañol)</Link>
          <Link to="/admin" style={S.navBtn(true)}>Inventario (Admin)</Link>
          <Link to="/movimientos" style={S.navBtn(false)}>Movimientos</Link>
          <Link to="/pedidos" style={S.navBtn(false)}>Pedidos</Link>

          <div style={S.foot}>
            <div><b>Usuario:</b> {username}</div>
            <div style={{ marginTop: 10 }}>
              <button style={S.btnGhost} onClick={signOut}>Cerrar sesión</button>
            </div>
          </div>
        </aside>

        <main style={S.main}>
          <div style={S.content}>
            <div style={S.topbar}>
              <div>
                <h1 style={S.title}>Inventario (Admin)</h1>
                <div style={S.meta}>Semáforo + pedido sugerido + estado “PEDIDO” si ya fue ordenado.</div>
              </div>
              <button style={S.btn} onClick={cargar}>Refrescar</button>
            </div>

            {error ? <div style={{ ...S.card, borderColor: "#5a1d1d", color: "#ffbdbd" }}>{error}</div> : null}
            {msg ? <div style={{ ...S.card, borderColor: "#1d5a2d", color: "#a6ffbf" }}>{msg}</div> : null}

            <div style={S.card}>
              <div style={S.grid4}>
                <div style={S.stat("#0b2512")}><div style={{ opacity: 0.8, fontSize: 12 }}>OK</div><div style={{ fontSize: 22, fontWeight: 900 }}>{stats.ok}</div></div>
                <div style={S.stat("#2a1f00")}><div style={{ opacity: 0.8, fontSize: 12 }}>ATENCIÓN</div><div style={{ fontSize: 22, fontWeight: 900 }}>{stats.at}</div></div>
                <div style={S.stat("#2a0b0b")}><div style={{ opacity: 0.8, fontSize: 12 }}>CRÍTICO</div><div style={{ fontSize: 22, fontWeight: 900 }}>{stats.cr}</div></div>
                <div style={S.stat("#13224a")}><div style={{ opacity: 0.8, fontSize: 12 }}>PEDIDO</div><div style={{ fontSize: 22, fontWeight: 900 }}>{stats.pe}</div></div>
              </div>
            </div>

            <div style={S.card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 220px", gap: 10, alignItems: "center" }}>
                <input
                  style={S.input}
                  placeholder="Buscar material…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <label style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", opacity: 0.9 }}>
                  <input type="checkbox" checked={soloNoOk} onChange={(e) => setSoloNoOk(e.target.checked)} />
                  Solo no OK
                </label>
                <button style={S.btn} onClick={copiarListaCompra} disabled={!listaCompra.length}>
                  Copiar lista compra ({listaCompra.length})
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Material</th>
                      <th style={S.th}>Estado</th>
                      <th style={S.th}>Stock</th>
                      <th style={S.th}>Mínimo</th>
                      <th style={S.th}>Consumo semanal</th>
                      <th style={S.th}>Semanas cobertura</th>
                      <th style={S.th}>Pedido sugerido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((r) => {
                      const st = r.estado_ui || r.estado;
                      return (
                        <tr key={r.id}>
                          <td style={S.td}><b style={{ color: "#fff" }}>{r.nombre}</b><div style={{ opacity: 0.7, fontSize: 12 }}>{r.unidad_medida || ""}</div></td>
                          <td style={S.td}><span style={S.pill(st)}>{String(st || "").toUpperCase()}</span></td>
                          <td style={S.td}>{num(r.stock_actual).toFixed(2)}</td>
                          <td style={S.td}>{num(r.stock_minimo).toFixed(2)}</td>
                          <td style={S.td}>{num(r.consumo_semanal).toFixed(2)}</td>
                          <td style={S.td}>{num(r.semanas_cobertura).toFixed(2)}</td>
                          <td style={S.td}>
                            {r.pedido_pendiente ? (
                              <span style={{ fontWeight: 900, color: "#b5c8ff" }}>YA PEDIDO</span>
                            ) : (
                              num(r.pedido_sugerido) > 0 ? <b style={{ color: "#fff" }}>{num(r.pedido_sugerido).toFixed(2)}</b> : "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!filtrados.length ? (
                      <tr><td style={S.td} colSpan={7}>Sin resultados.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
