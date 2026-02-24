import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// ─── PALETA ──────────────────────────────────────────────────────────────────
const C = {
  bg:   "#09090b",
  s0:   "rgba(255,255,255,0.03)",
  s1:   "rgba(255,255,255,0.06)",
  b0:   "rgba(255,255,255,0.08)",
  b1:   "rgba(255,255,255,0.15)",
  t0:   "#f4f4f5",
  t1:   "#a1a1aa",
  t2:   "#71717a",
  mono: "'JetBrains Mono', 'IBM Plex Mono', monospace",
  sans: "'Outfit', system-ui, sans-serif",
  primary: "#3b82f6",
  amber:   "#f59e0b",
  green:   "#10b981",
  red:     "#ef4444",
};
const GLASS = {
  backdropFilter: "blur(32px) saturate(130%)",
  WebkitBackdropFilter: "blur(32px) saturate(130%)",
};
const INP = {
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`,
  color: C.t0, padding: "9px 12px", borderRadius: 8, fontSize: 12,
  outline: "none", width: "100%", fontFamily: "'Outfit', system-ui",
};

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("es-AR"); } catch { return String(d); }
}
function fmtTS(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-AR");
}

const ESTADOS = [
  { value: "pedido",   label: "Pedido",      color: C.amber,   bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)"  },
  { value: "transito", label: "En tránsito", color: C.primary, bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)"  },
  { value: "recibido", label: "Recibido ✅",  color: C.green,   bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)"  },
];

const ESTADO_META = Object.fromEntries(ESTADOS.map(e => [e.value, e]));

const filterBtn = (active) => ({
  border: active ? `1px solid ${C.b1}` : "1px solid rgba(255,255,255,0.04)",
  background: active ? C.s1 : "transparent",
  color: active ? C.t0 : C.t2,
  padding: "3px 11px", borderRadius: 5, cursor: "pointer",
  fontSize: 10, fontFamily: "'Outfit', system-ui", whiteSpace: "nowrap",
});

export default function PedidosScreen({ profile, signOut }) {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [pedidos,  setPedidos]  = useState([]);
  const [fEstado,  setFEstado]  = useState("todos");
  const [q,        setQ]        = useState("");
  const [materiales, setMateriales] = useState([]);

  const [nuevo, setNuevo] = useState({ proveedor: "", numero: "", nota: "" });
  const [pedidoSel, setPedidoSel] = useState(null);
  const [items,     setItems]     = useState([]);

  const [itemNuevo, setItemNuevo] = useState({ materialId: "", descripcion: "", cantidad: "", unidad: "u" });

  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return pedidos.filter(p => {
      if (fEstado !== "todos" && p.estado !== fEstado) return false;
      if (!qq) return true;
      const t = `${p.proveedor || ""} ${p.numero || ""} ${p.nota || ""}`.toLowerCase();
      return t.includes(qq);
    });
  }, [pedidos, fEstado, q]);

  async function cargarPedidos() {
    setError(""); setLoading(true);
    const { data, error } = await supabase
      .from("pedidos").select("*")
      .order("fecha_pedido", { ascending: false })
      .order("creado_en",    { ascending: false });
    if (error) { setError(error.message); setLoading(false); return; }
    setPedidos(data ?? []); setLoading(false);
  }

  async function cargarMateriales() {
    const { data, error } = await supabase.from("materiales").select("id,nombre,unidad_medida").order("nombre");
    if (!error) setMateriales(data ?? []);
  }

  async function cargarItems(pedidoId) {
    const { data, error } = await supabase.from("pedido_items").select("*").eq("pedido_id", pedidoId).order("creado_en");
    if (error) { setError(error.message); return; }
    setItems(data ?? []);
  }

  useEffect(() => {
    cargarPedidos(); cargarMateriales();
    const ch = supabase.channel("rt-pedidos")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" },      () => cargarPedidos())
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_items" }, () => { if (pedidoSel?.id) cargarItems(pedidoSel.id); })
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoSel?.id]);

  async function crearPedido(e) {
    e.preventDefault(); setError("");
    if (!nuevo.proveedor.trim()) return setError("Proveedor es obligatorio.");
    const { data: auth } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const userId = auth?.user?.id ?? null;
    const { data, error } = await supabase.from("pedidos")
      .insert({ proveedor: nuevo.proveedor.trim(), numero: nuevo.numero.trim() || null, nota: nuevo.nota.trim() || null, estado: "pedido", creado_por: userId })
      .select("*").single();
    if (error) return setError(error.message);
    setNuevo({ proveedor: "", numero: "", nota: "" });
    await cargarPedidos();
    setPedidoSel(data);
    await cargarItems(data.id);
  }

  function onPickMaterial(materialId) {
    const m = materiales.find(x => x.id === materialId);
    setItemNuevo(s => ({ ...s, materialId, descripcion: m?.nombre || s.descripcion, unidad: m?.unidad_medida || s.unidad }));
  }

  async function agregarItem(e) {
    e.preventDefault(); setError("");
    if (!pedidoSel?.id) return setError("Seleccioná un pedido.");
    if (!itemNuevo.descripcion.trim()) return setError("Descripción obligatoria.");
    const cant = num(itemNuevo.cantidad);
    if (cant <= 0) return setError("Cantidad inválida.");
    const { error } = await supabase.from("pedido_items").insert({
      pedido_id: pedidoSel.id, material_id: itemNuevo.materialId || null,
      descripcion: itemNuevo.descripcion.trim(), cantidad: cant, unidad: itemNuevo.unidad || "u",
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
    const patch  = { estado };
    if (estado === "recibido") patch.recibido_por = userId;
    const { error } = await supabase.from("pedidos").update(patch).eq("id", pedidoId);
    if (error) return setError(error.message);
    await cargarPedidos();
    if (pedidoSel?.id === pedidoId) {
      const actualizado = pedidos.find(p => p.id === pedidoId) ?? pedidoSel;
      setPedidoSel({ ...actualizado, estado });
    }
  }

  // Estadísticas topbar
  const statPedido   = pedidos.filter(p => p.estado === "pedido").length;
  const statTransito = pedidos.filter(p => p.estado === "transito").length;
  const statRecibido = pedidos.filter(p => p.estado === "recibido").length;

  // Chips de estado
  const EstadoChip = ({ estado }) => {
    const m = ESTADO_META[estado] ?? { color: C.t2, bg: C.s0, border: C.b0, label: estado };
    return (
      <span style={{
        fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700,
        padding: "2px 8px", borderRadius: 5,
        background: m.bg, color: m.color, border: `1px solid ${m.border}`,
      }}>
        {m.label}
      </span>
    );
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.t0, fontFamily: C.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        select option { background: #0f0f12; color: #a1a1aa; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        input:focus, select:focus, textarea:focus { border-color: rgba(59,130,246,0.35) !important; outline: none; }
        button:not([disabled]):hover { opacity: 0.8; }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
            radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%);
        }
        .ped-row:hover { background: rgba(255,255,255,0.025) !important; }
        .item-row:hover { background: rgba(255,255,255,0.02) !important; }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

          {/* ── TOPBAR ── */}
          <div style={{
            height: 50, background: "rgba(12,12,14,0.92)", ...GLASS,
            borderBottom: `1px solid ${C.b0}`, padding: "0 18px",
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t0 }}>Pedidos</div>
              <div style={{ fontSize: 9, color: C.t2, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 1 }}>
                Gestión de proveedores
              </div>
            </div>

            {[
              { label: "Pedido",    val: statPedido,   color: C.amber   },
              { label: "Tránsito",  val: statTransito, color: C.primary },
              { label: "Recibido",  val: statRecibido, color: C.green   },
            ].map(s => (
              <div key={s.label} style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
                borderRadius: 7, background: C.s0, border: `1px solid ${C.b0}`,
                borderLeft: `2px solid ${s.color}`,
              }}>
                <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</span>
                <span style={{ fontSize: 8, color: C.t1, letterSpacing: 1.5, textTransform: "uppercase" }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* ── FILTERBAR ── */}
          <div style={{
            height: 36, background: "rgba(12,12,14,0.85)", ...GLASS,
            borderBottom: `1px solid ${C.b0}`, padding: "0 18px",
            display: "flex", alignItems: "center", gap: 4, flexShrink: 0, overflowX: "auto",
          }}>
            <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", flexShrink: 0 }}>Estado</span>
            <button style={filterBtn(fEstado === "todos")} onClick={() => setFEstado("todos")}>Todos</button>
            {ESTADOS.map(e => (
              <button key={e.value} style={filterBtn(fEstado === e.value)} onClick={() => setFEstado(e.value)}>{e.label}</button>
            ))}
            <div style={{ flex: 1 }} />
            <input
              style={{
                background: "transparent", border: "none",
                color: C.t0, fontSize: 11, fontFamily: C.sans,
                outline: "none", width: 240,
              }}
              placeholder="⌕  Buscar proveedor / nº / nota…"
              value={q} onChange={e => setQ(e.target.value)}
            />
          </div>

          {/* ── CONTENT ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
            <div style={{ width: "min(1200px,100%)", margin: "0 auto" }}>

              {error && (
                <div style={{
                  padding: "10px 14px", borderRadius: 8, marginBottom: 14,
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                  color: C.red, fontSize: 12,
                }}>
                  {error}
                </div>
              )}

              {/* ── Top split: nuevo pedido + filtro ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>

                {/* Nuevo pedido */}
                <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 10, color: C.t2, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
                    Nuevo pedido
                  </div>
                  <form onSubmit={crearPedido}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <input style={INP} placeholder="Proveedor *" value={nuevo.proveedor}
                        onChange={e => setNuevo(s => ({ ...s, proveedor: e.target.value }))} />
                      <input style={INP} placeholder="Nº pedido / remito" value={nuevo.numero}
                        onChange={e => setNuevo(s => ({ ...s, numero: e.target.value }))} />
                    </div>
                    <input style={{ ...INP, marginBottom: 10 }} placeholder="Nota (opcional)" value={nuevo.nota}
                      onChange={e => setNuevo(s => ({ ...s, nota: e.target.value }))} />
                    <button type="submit" style={{
                      border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)",
                      color: "#60a5fa", padding: "8px 18px", borderRadius: 8, cursor: "pointer",
                      fontSize: 12, fontWeight: 600, fontFamily: C.sans,
                    }}>
                      + Crear pedido
                    </button>
                  </form>
                </div>

                {/* Info */}
                <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 16,
                  display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontSize: 10, color: C.t2, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                    Ayuda
                  </div>
                  <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.6 }}>
                    Creá un pedido y abrilo para agregar items.<br />
                    Vinculá cada item a un material para que el Inventario muestre{" "}
                    <span style={{ fontFamily: C.mono, fontSize: 10, color: C.amber }}>PEDIDO</span>.
                  </div>
                </div>
              </div>

              {/* ── Listado ── */}
              <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
                {/* Table header */}
                <div style={{
                  display: "grid", gridTemplateColumns: "100px 1fr 120px 120px 100px",
                  gap: 10, padding: "10px 16px",
                  background: "rgba(0,0,0,0.3)",
                  borderBottom: `1px solid ${C.b0}`,
                }}>
                  {["Fecha", "Proveedor", "Nº", "Estado", "Acción"].map(h => (
                    <div key={h} style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>{h}</div>
                  ))}
                </div>

                {loading && (
                  <div style={{ padding: 20, textAlign: "center", color: C.t2, fontSize: 11, fontFamily: C.mono }}>
                    Cargando…
                  </div>
                )}

                {filtrados.map(p => (
                  <div key={p.id} className="ped-row" style={{
                    display: "grid", gridTemplateColumns: "100px 1fr 120px 120px 100px",
                    gap: 10, padding: "11px 16px",
                    borderBottom: `1px solid rgba(255,255,255,0.04)`,
                    alignItems: "center",
                  }}>
                    <div style={{ fontFamily: C.mono, fontSize: 10, color: C.t2 }}>{fmtDate(p.fecha_pedido)}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: C.t0 }}>{p.proveedor}</div>
                    <div style={{ fontSize: 11, color: C.t1 }}>{p.numero || "—"}</div>
                    <div><EstadoChip estado={p.estado} /></div>
                    <div>
                      <button
                        style={{
                          border: `1px solid ${C.b0}`, background: C.s0, color: C.t1,
                          padding: "5px 12px", borderRadius: 7, cursor: "pointer",
                          fontSize: 11, fontFamily: C.sans,
                        }}
                        onClick={async () => { setPedidoSel(p); await cargarItems(p.id); }}
                      >
                        Abrir
                      </button>
                    </div>
                  </div>
                ))}

                {!filtrados.length && !loading && (
                  <div style={{ padding: 30, textAlign: "center", color: C.t2, fontSize: 12 }}>
                    No hay pedidos.
                  </div>
                )}
              </div>

              {/* ── Detalle pedido seleccionado ── */}
              {pedidoSel && (
                <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 16 }}>
                  {/* Header detalle */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.t0 }}>
                        {pedidoSel.proveedor} {pedidoSel.numero ? `— ${pedidoSel.numero}` : ""}
                      </div>
                      <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>
                        Creado: {fmtTS(pedidoSel.creado_en)}
                        {pedidoSel.recibido_en && ` · Recibido: ${fmtTS(pedidoSel.recibido_en)}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button style={{
                        border: `1px solid ${C.b0}`, background: "transparent", color: C.t2,
                        padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans,
                      }} onClick={() => setPedidoSel(null)}>
                        Cerrar
                      </button>
                      {["pedido", "transito", "recibido"].map(est => {
                        const m = ESTADO_META[est];
                        return (
                          <button key={est} style={{
                            border: `1px solid ${m.border}`, background: m.bg, color: m.color,
                            padding: "5px 12px", borderRadius: 7, cursor: "pointer",
                            fontSize: 11, fontFamily: C.sans, fontWeight: 600,
                          }} onClick={() => cambiarEstado(pedidoSel.id, est)}>
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ borderTop: `1px solid ${C.b0}`, paddingTop: 14 }}>
                    <div style={{ fontSize: 10, color: C.t2, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
                      Items
                    </div>

                    {/* Formulario item */}
                    <form onSubmit={agregarItem}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <select style={INP} value={itemNuevo.materialId} onChange={e => onPickMaterial(e.target.value)}>
                          <option value="">(Opcional) Vincular a material…</option>
                          {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </select>
                        <input style={INP} placeholder="Descripción *" value={itemNuevo.descripcion}
                          onChange={e => setItemNuevo(s => ({ ...s, descripcion: e.target.value }))} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: 12 }}>
                        <input style={INP} placeholder="Cantidad" value={itemNuevo.cantidad}
                          onChange={e => setItemNuevo(s => ({ ...s, cantidad: e.target.value }))} />
                        <input style={INP} placeholder="Unidad (u, mt, kg…)" value={itemNuevo.unidad}
                          onChange={e => setItemNuevo(s => ({ ...s, unidad: e.target.value }))} />
                        <button type="submit" style={{
                          border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.1)",
                          color: "#60a5fa", padding: "9px 16px", borderRadius: 8,
                          cursor: "pointer", fontSize: 12, fontFamily: C.sans, whiteSpace: "nowrap",
                        }}>
                          + Agregar
                        </button>
                      </div>
                    </form>

                    {/* Lista de items */}
                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{
                        display: "grid", gridTemplateColumns: "1fr 80px 70px 80px 80px",
                        gap: 10, padding: "8px 12px",
                        borderBottom: `1px solid ${C.b0}`,
                      }}>
                        {["Descripción", "Cantidad", "Unidad", "Vinculado", "Acción"].map(h => (
                          <div key={h} style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>{h}</div>
                        ))}
                      </div>
                      {items.map(it => (
                        <div key={it.id} className="item-row" style={{
                          display: "grid", gridTemplateColumns: "1fr 80px 70px 80px 80px",
                          gap: 10, padding: "10px 12px",
                          borderBottom: `1px solid rgba(255,255,255,0.04)`,
                          alignItems: "center",
                        }}>
                          <div style={{ fontSize: 12, color: C.t0 }}>{it.descripcion}</div>
                          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.t1 }}>{num(it.cantidad)}</div>
                          <div style={{ fontSize: 11, color: C.t1 }}>{it.unidad}</div>
                          <div style={{ fontSize: 11, color: it.material_id ? C.green : C.t2 }}>
                            {it.material_id ? "✅" : "—"}
                          </div>
                          <div>
                            <button style={{
                              border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)",
                              color: C.red, padding: "3px 10px", borderRadius: 6,
                              cursor: "pointer", fontSize: 10, fontFamily: C.sans,
                            }} onClick={() => borrarItem(it.id)}>
                              Borrar
                            </button>
                          </div>
                        </div>
                      ))}
                      {!items.length && (
                        <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: C.t2 }}>
                          Sin items. Agregá uno arriba.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
