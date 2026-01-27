import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import logoK from "../assets/logo-k.png";

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return String(d);
  }
}
function fmtTS(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

const ESTADOS = [
  { value: "pedido", label: "Pedido" },
  { value: "transito", label: "En tránsito" },
  { value: "recibido", label: "Recibido ✅" },
];

export default function PedidosScreen({ profile, signOut }) {
  const username = profile?.username ?? "—";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pedidos, setPedidos] = useState([]);
  const [fEstado, setFEstado] = useState("todos");
  const [q, setQ] = useState("");

  const [materiales, setMateriales] = useState([]);

  const [nuevo, setNuevo] = useState({
    proveedor: "",
    numero: "",
    nota: "",
  });

  const [pedidoSel, setPedidoSel] = useState(null);
  const [items, setItems] = useState([]);

  const [itemNuevo, setItemNuevo] = useState({
    materialId: "",
    descripcion: "",
    cantidad: "",
    unidad: "u",
  });

  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (fEstado !== "todos" && p.estado !== fEstado) return false;
      if (!qq) return true;
      const t = `${p.proveedor || ""} ${p.numero || ""} ${p.nota || ""}`.toLowerCase();
      return t.includes(qq);
    });
  }, [pedidos, fEstado, q]);

  async function cargarPedidos() {
    setError("");
    setLoading(true);

    const { data, error } = await supabase
      .from("pedidos")
      .select("*")
      .order("fecha_pedido", { ascending: false })
      .order("creado_en", { ascending: false });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setPedidos(data ?? []);
    setLoading(false);
  }

  async function cargarMateriales() {
    // Para mapear items a material_id
    const { data, error } = await supabase
      .from("materiales")
      .select("id,nombre,unidad_medida")
      .order("nombre", { ascending: true });

    if (!error) setMateriales(data ?? []);
  }

  async function cargarItems(pedidoId) {
    const { data, error } = await supabase
      .from("pedido_items")
      .select("*")
      .eq("pedido_id", pedidoId)
      .order("creado_en", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }

    setItems(data ?? []);
  }

  useEffect(() => {
    cargarPedidos();
    cargarMateriales();

    const ch = supabase
      .channel("rt-pedidos")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => cargarPedidos())
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_items" }, (payload) => {
        if (pedidoSel?.id) cargarItems(pedidoSel.id);
      })
      .subscribe();

    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoSel?.id]);

  async function crearPedido(e) {
    e.preventDefault();
    setError("");

    if (!nuevo.proveedor.trim()) return setError("Proveedor es obligatorio.");

    const { data: auth } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const userId = auth?.user?.id ?? null;

    const { data, error } = await supabase
      .from("pedidos")
      .insert({
        proveedor: nuevo.proveedor.trim(),
        numero: nuevo.numero.trim() || null,
        nota: nuevo.nota.trim() || null,
        estado: "pedido",
        creado_por: userId,
      })
      .select("*")
      .single();

    if (error) return setError(error.message);

    setNuevo({ proveedor: "", numero: "", nota: "" });
    await cargarPedidos();
    setPedidoSel(data);
    await cargarItems(data.id);
  }

  function onPickMaterial(materialId) {
    const m = materiales.find((x) => x.id === materialId);
    setItemNuevo((s) => ({
      ...s,
      materialId,
      descripcion: m?.nombre || s.descripcion,
      unidad: m?.unidad_medida || s.unidad,
    }));
  }

  async function agregarItem(e) {
    e.preventDefault();
    setError("");

    if (!pedidoSel?.id) return setError("Seleccioná un pedido.");
    if (!itemNuevo.descripcion.trim()) return setError("Descripción obligatoria.");
    if (!String(itemNuevo.cantidad).trim()) return setError("Cantidad obligatoria.");

    const cant = num(itemNuevo.cantidad);
    if (cant <= 0) return setError("Cantidad inválida.");

    const { error } = await supabase.from("pedido_items").insert({
      pedido_id: pedidoSel.id,
      material_id: itemNuevo.materialId || null,
      descripcion: itemNuevo.descripcion.trim(),
      cantidad: cant,
      unidad: itemNuevo.unidad || "u",
    });

    if (error) return setError(error.message);

    setItemNuevo({ materialId: "", descripcion: "", cantidad: "", unidad: "u" });
    await cargarItems(pedidoSel.id);
  }

  async function borrarItem(itemId) {
    if (!confirm("¿Eliminar item?")) return;
    const { error } = await supabase.from("pedido_items").delete().eq("id", itemId);
    if (error) setError(error.message);
    else if (pedidoSel?.id) cargarItems(pedidoSel.id);
  }

  async function cambiarEstado(pedidoId, estado) {
    setError("");

    const { data: auth } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const userId = auth?.user?.id ?? null;

    const patch = { estado };

    // Auditoría al recibir
    if (estado === "recibido") patch.recibido_por = userId;

    const { error } = await supabase.from("pedidos").update(patch).eq("id", pedidoId);
    if (error) return setError(error.message);

    await cargarPedidos();
    if (pedidoSel?.id === pedidoId) {
      const actualizado = (pedidos.find((p) => p.id === pedidoId) ?? pedidoSel);
      setPedidoSel({ ...actualizado, estado });
    }
  }

  const S = {
    page: { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout: { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    sidebar: { borderRight: "1px solid #2a2a2a", padding: 18, background: "#050505", position: "relative" },
    brand: { display: "flex", alignItems: "center", gap: 12, marginBottom: 18 },
    logoK: { width: 28, height: 28, objectFit: "contain", opacity: 0.95 },
    brandText: { fontFamily: "Montserrat, system-ui, Arial", fontWeight: 900, letterSpacing: 3, color: "#fff" },
    navBtn: { width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 12, border: "1px solid #2a2a2a", background: "#111", color: "#fff", cursor: "pointer", marginTop: 8, fontWeight: 800, display: "block", textDecoration: "none" },
    navBtn2: { width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 12, border: "1px solid #2a2a2a", background: "transparent", color: "#bdbdbd", cursor: "pointer", marginTop: 8, fontWeight: 800, display: "block", textDecoration: "none" },
    foot: { position: "absolute", left: 18, right: 18, bottom: 18, opacity: 0.85, fontSize: 12 },
    main: { padding: 18, display: "flex", justifyContent: "center" },
    content: { width: "min(1200px, 100%)" },
    topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 },
    title: { fontFamily: "Montserrat, system-ui, Arial", fontSize: 20, margin: 0, color: "#fff" },
    card: { border: "1px solid #2a2a2a", borderRadius: 16, background: "#070707", padding: 16, marginBottom: 12 },
    input: { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#eaeaea", padding: "10px 12px", borderRadius: 12, width: "100%", outline: "none" },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
    btn: { border: "1px solid #2a2a2a", background: "#111", color: "#fff", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontWeight: 900 },
    btnGhost: { border: "1px solid #2a2a2a", background: "transparent", color: "#d0d0d0", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontWeight: 900 },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 12, opacity: 0.75, padding: "10px 8px", borderBottom: "1px solid #1d1d1d" },
    td: { padding: "10px 8px", borderBottom: "1px solid #111", verticalAlign: "top" },
    pill: (estado) => ({
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      border: "1px solid #2a2a2a",
      background:
        estado === "recibido" ? "#0b2512" :
        estado === "transito" ? "#13224a" :
        "#2a1f00",
      color:
        estado === "recibido" ? "#a6ffbf" :
        estado === "transito" ? "#b5c8ff" :
        "#ffe7a6",
    }),
    split: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    small: { fontSize: 12, opacity: 0.75 },
  };

  return (
    <div style={S.page}>
      <div style={S.layout}>
        <aside style={S.sidebar}>
          <div style={S.brand}>
            <img src={logoK} alt="K" style={S.logoK} />
            <div style={S.brandText}>KLASE A</div>
          </div>

          <Link to="/panol" style={S.navBtn2}>Operación (Pañol)</Link>
          <Link to="/admin" style={S.navBtn2}>Inventario (Admin)</Link>
          <Link to="/movimientos" style={S.navBtn2}>Movimientos</Link>
          <Link to="/pedidos" style={S.navBtn}>Pedidos</Link>

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
              <h1 style={S.title}>Pedidos</h1>
              <div style={S.small}>Crea pedidos y marcá “Recibido ✅” cuando lleguen.</div>
            </div>

            {error ? <div style={{ ...S.card, borderColor: "#5a1d1d", color: "#ffbdbd" }}>{error}</div> : null}

            <div style={S.split}>
              <div style={S.card}>
                <h3 style={{ marginTop: 0, color: "#fff" }}>Nuevo pedido</h3>
                <form onSubmit={crearPedido}>
                  <div style={S.row}>
                    <input
                      style={S.input}
                      placeholder="Proveedor (obligatorio)"
                      value={nuevo.proveedor}
                      onChange={(e) => setNuevo((s) => ({ ...s, proveedor: e.target.value }))}
                    />
                    <input
                      style={S.input}
                      placeholder="Nº pedido / remito (opcional)"
                      value={nuevo.numero}
                      onChange={(e) => setNuevo((s) => ({ ...s, numero: e.target.value }))}
                    />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <input
                      style={S.input}
                      placeholder="Nota (opcional)"
                      value={nuevo.nota}
                      onChange={(e) => setNuevo((s) => ({ ...s, nota: e.target.value }))}
                    />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button style={S.btn} type="submit">Crear pedido</button>
                  </div>
                </form>
              </div>

              <div style={S.card}>
                <h3 style={{ marginTop: 0, color: "#fff" }}>Buscar / filtrar</h3>
                <div style={S.row}>
                  <select
                    style={S.input}
                    value={fEstado}
                    onChange={(e) => setFEstado(e.target.value)}
                  >
                    <option value="todos">Todos</option>
                    {ESTADOS.map((x) => (
                      <option key={x.value} value={x.value}>{x.label}</option>
                    ))}
                  </select>
                  <input
                    style={S.input}
                    placeholder="Buscar (proveedor / nº / nota)"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <div style={{ marginTop: 10, ...S.small }}>
                  Tip: abrí un pedido y cargá items con material_id para que el Inventario muestre “PEDIDO”.
                </div>
              </div>
            </div>

            <div style={S.card}>
              <h3 style={{ marginTop: 0, color: "#fff" }}>Listado</h3>
              {loading ? <div style={S.small}>Cargando…</div> : null}

              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Fecha</th>
                    <th style={S.th}>Proveedor</th>
                    <th style={S.th}>Nº</th>
                    <th style={S.th}>Estado</th>
                    <th style={S.th}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((p) => (
                    <tr key={p.id}>
                      <td style={S.td}>{fmtDate(p.fecha_pedido)}</td>
                      <td style={S.td}><b style={{ color: "#fff" }}>{p.proveedor}</b></td>
                      <td style={S.td}>{p.numero || "—"}</td>
                      <td style={S.td}><span style={S.pill(p.estado)}>{p.estado}</span></td>
                      <td style={S.td}>
                        <button
                          style={S.btnGhost}
                          onClick={async () => {
                            setPedidoSel(p);
                            await cargarItems(p.id);
                          }}
                        >
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filtrados.length ? (
                    <tr><td style={S.td} colSpan={5}><span style={S.small}>No hay pedidos.</span></td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {pedidoSel ? (
              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div>
                    <h3 style={{ margin: 0, color: "#fff" }}>
                      Pedido: {pedidoSel.proveedor} {pedidoSel.numero ? `— ${pedidoSel.numero}` : ""}
                    </h3>
                    <div style={S.small}>
                      Estado: <b>{pedidoSel.estado}</b> · Creado: {fmtTS(pedidoSel.creado_en)} · Recibido: {fmtTS(pedidoSel.recibido_en)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={S.btnGhost} onClick={() => setPedidoSel(null)}>Cerrar</button>
                    <button style={S.btn} onClick={() => cambiarEstado(pedidoSel.id, "pedido")}>Pedido</button>
                    <button style={S.btn} onClick={() => cambiarEstado(pedidoSel.id, "transito")}>En tránsito</button>
                    <button style={S.btn} onClick={() => cambiarEstado(pedidoSel.id, "recibido")}>Recibido ✅</button>
                  </div>
                </div>

                <div style={{ marginTop: 12, borderTop: "1px solid #1d1d1d", paddingTop: 12 }}>
                  <h4 style={{ marginTop: 0, color: "#fff" }}>Items</h4>

                  <form onSubmit={agregarItem}>
                    <div style={S.row}>
                      <select
                        style={S.input}
                        value={itemNuevo.materialId}
                        onChange={(e) => onPickMaterial(e.target.value)}
                      >
                        <option value="">(Opcional) Vincular a material…</option>
                        {materiales.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>

                      <input
                        style={S.input}
                        placeholder="Descripción (obligatoria)"
                        value={itemNuevo.descripcion}
                        onChange={(e) => setItemNuevo((s) => ({ ...s, descripcion: e.target.value }))}
                      />
                    </div>

                    <div style={{ ...S.row, marginTop: 10 }}>
                      <input
                        style={S.input}
                        placeholder="Cantidad"
                        value={itemNuevo.cantidad}
                        onChange={(e) => setItemNuevo((s) => ({ ...s, cantidad: e.target.value }))}
                      />
                      <input
                        style={S.input}
                        placeholder="Unidad (u, mt, kg...)"
                        value={itemNuevo.unidad}
                        onChange={(e) => setItemNuevo((s) => ({ ...s, unidad: e.target.value }))}
                      />
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <button style={S.btn} type="submit">Agregar item</button>
                    </div>
                  </form>

                  <div style={{ marginTop: 12 }}>
                    <table style={S.table}>
                      <thead>
                        <tr>
                          <th style={S.th}>Descripción</th>
                          <th style={S.th}>Cant</th>
                          <th style={S.th}>Unidad</th>
                          <th style={S.th}>Vinculado</th>
                          <th style={S.th}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.id}>
                            <td style={S.td}>{it.descripcion}</td>
                            <td style={S.td}>{num(it.cantidad)}</td>
                            <td style={S.td}>{it.unidad}</td>
                            <td style={S.td}>{it.material_id ? "✅" : "—"}</td>
                            <td style={S.td}>
                              <button style={S.btnGhost} onClick={() => borrarItem(it.id)}>Eliminar</button>
                            </td>
                          </tr>
                        ))}
                        {!items.length ? (
                          <tr><td style={S.td} colSpan={5}><span style={S.small}>Sin items.</span></td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: 10, ...S.small }}>
                    Para que el Inventario muestre “PEDIDO”, vinculá el item a un material.
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
