import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, ClipboardList, Inbox, Layers3, Loader2, Package, RefreshCw, Search, Trash2, Truck } from "lucide-react";
import { C } from "@/theme";
import {
  actualizarEstadoPedido, actualizarItemPedido, borrarPedido, fetchPedidosProduccion,
  ITEM_ESTADOS, PEDIDO_ESTADOS,
} from "@/features/produccion/comprasEtapasApi";
import { INPUT, num } from "@/features/produccion/comprasTokens";
import { EmptyState, EstadoSelect, Ghost, IconBtn, Kpi, Pill, Progreso } from "@/features/produccion/comprasUI";

// ─────────────────────────────────────────────────────────────────────────────
// Seguimiento de los pedidos de producción ya generados. Es la vista que usa el
// rol compras: acá no se configura nada, se gestiona el estado de cada item.
// ─────────────────────────────────────────────────────────────────────────────

function PedidoCard({ pedido, onReload, toast }) {
  const [open, setOpen] = useState(false);
  const items = pedido.items ?? [];
  const recibidos = items.filter((i) => i.estado === "recibido").length;
  const pct = items.length ? Math.round((recibidos / items.length) * 100) : 0;

  async function setItemEstado(item, estado) {
    try { await actualizarItemPedido(item.id, { estado }); onReload(); }
    catch (err) { toast?.error(err.message); }
  }
  async function setPedidoEstado(estado) {
    try { await actualizarEstadoPedido(pedido.id, estado); onReload(); }
    catch (err) { toast?.error(err.message); }
  }
  async function borrar() {
    if (!window.confirm(`¿Borrar el pedido "${pedido.titulo}"? No se puede deshacer.`)) return;
    try { await borrarPedido(pedido.id); onReload(); }
    catch (err) { toast?.error(err.message); }
  }

  return (
    <div className="ce-surface ce-card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px" }}>
        <IconBtn
          icon={ChevronRight}
          title={open ? "Contraer" : "Ver items"}
          onClick={() => setOpen((v) => !v)}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pedido.titulo}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <Progreso pct={pct} />
            <span style={{ color: C.dim, fontSize: 11.5 }}>
              {recibidos}/{items.length} recibidos · {new Date(pedido.created_at).toLocaleDateString("es-AR")}
            </span>
            {pedido.obra?.codigo && <Pill color={C.blue} soft={C.blueL} borde={C.blueB}>{pedido.obra.codigo}</Pill>}
            {pedido.proveedor && <Pill color={C.violet} soft={C.violetL} borde={C.violetB}><Truck size={10} /> {pedido.proveedor}</Pill>}
            {(pedido.etapas ?? []).length > 0 && (
              <Pill color={C.teal}>
                <Layers3 size={10} /> {pedido.etapas.length} {pedido.etapas.length === 1 ? "etapa" : "etapas"}
              </Pill>
            )}
          </div>
        </div>
        <EstadoSelect value={pedido.estado} options={PEDIDO_ESTADOS} onChange={setPedidoEstado} />
        <IconBtn icon={Trash2} title="Borrar pedido" tono="rojo" onClick={borrar} />
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 14px 12px", display: "grid", gap: 5 }}>
          {!items.length && <div style={{ color: C.dim, fontSize: 12.5 }}>Este pedido no tiene items.</div>}
          {items.map((it) => (
            <div
              key={it.id}
              className="ce-row"
              style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto auto", gap: 10, alignItems: "center", padding: "7px 9px", borderRadius: 10, border: `1px solid ${C.border}` }}
            >
              <span style={{ width: 26, height: 26, borderRadius: 7, display: "grid", placeItems: "center", background: C.panel2, color: C.dim, flexShrink: 0 }}>
                <Package size={13} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 680, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.descripcion}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 2, flexWrap: "wrap", alignItems: "center" }}>
                  {it.codigo && <span style={{ color: C.dim, fontSize: 10.5, fontFamily: C.mono }}>{it.codigo}</span>}
                  {it.origen_compra_etapa_nombre && <Pill color={C.violet} soft={C.violetL} borde={C.violetB}>{it.origen_compra_etapa_nombre}</Pill>}
                  {it.origen_etapa_nombre && <Pill color={C.blue} soft={C.blueL} borde={C.blueB}>Producción · {it.origen_etapa_nombre}</Pill>}
                  {it.origen_tarea_nombre && <Pill color={C.teal}>↳ {it.origen_tarea_nombre}</Pill>}
                </div>
              </div>
              <span style={{ color: C.dim, fontSize: 12, fontFamily: C.mono, whiteSpace: "nowrap" }}>{num(it.cantidad)} {it.unidad || "u"}</span>
              <EstadoSelect value={it.estado} options={ITEM_ESTADOS} onChange={(v) => setItemEstado(it, v)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PedidosTab({ toast, recargaExterna = 0 }) {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setPedidos(await fetchPedidosProduccion()); }
    catch (err) { toast?.error(err.message); }
    finally { setCargando(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar, recargaExterna]);

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (estado && p.estado !== estado) return false;
      if (!term) return true;
      const texto = `${p.titulo ?? ""} ${p.obra_codigo ?? ""} ${p.etapa_nombre ?? ""} ${p.proveedor ?? ""} ${(p.etapas ?? []).map((e) => e.nombre).join(" ")}`.toLowerCase();
      if (texto.includes(term)) return true;
      return (p.items ?? []).some((i) => `${i.descripcion ?? ""} ${i.codigo ?? ""}`.toLowerCase().includes(term));
    });
  }, [pedidos, q, estado]);

  const abiertos = pedidos.filter((p) => !["completo", "cancelado"].includes(p.estado)).length;
  const itemsPendientes = pedidos.reduce(
    (a, p) => a + (p.items ?? []).filter((i) => i.estado === "pendiente").length, 0
  );

  return (
    <div style={{ display: "grid", gap: 13, overflowY: "auto", height: "100%", alignContent: "start", paddingRight: 2 }}>
      <div className="ce-surface" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Kpi icon={ClipboardList} valor={pedidos.length} label="pedidos" color="var(--violet)" soft="var(--violet-soft)" borde="var(--violet-border)" />
          <Kpi icon={Inbox} valor={abiertos} label="abiertos" color="var(--amber)" soft="var(--amber-soft)" borde="var(--amber-border)" />
          <Kpi icon={Package} valor={itemsPendientes} label="items pendientes" color="var(--blue)" soft="var(--blue-soft)" borde="var(--blue-border)" />
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", minWidth: 190 }}>
            <Search size={14} color={C.dim} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar pedido, obra o material…"
              style={{ ...INPUT, padding: "8px 10px 8px 30px", fontSize: 12.5 }}
            />
          </div>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ ...INPUT, width: "auto", padding: "8px 10px", fontSize: 12.5, cursor: "pointer" }}>
            <option value="">Todos los estados</option>
            {PEDIDO_ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <Ghost icon={RefreshCw} onClick={cargar}>Refrescar</Ghost>
        </div>
      </div>

      {cargando && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.dim, fontSize: 13, padding: 6 }}>
          <Loader2 size={16} className="spin" /> Cargando pedidos…
        </div>
      )}

      {!cargando && !pedidos.length && (
        <EmptyState
          icon={Inbox}
          title="Todavía no hay pedidos de producción"
          subtitle="Los pedidos nacen de las etapas de compra de cada obra: elegí una obra, armá su etapa y generá el pedido."
          accent="#3b82f6"
        />
      )}

      {!cargando && pedidos.length > 0 && !visibles.length && (
        <EmptyState icon={Search} title="Sin resultados" subtitle="Ningún pedido coincide con la búsqueda o el estado elegido." accent="#3b82f6" />
      )}

      {!cargando && visibles.map((p) => <PedidoCard key={p.id} pedido={p} onReload={cargar} toast={toast} />)}
    </div>
  );
}
