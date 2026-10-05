import { useMemo, useState } from "react";
import { Check, ChevronRight, Download, Inbox, RotateCcw, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { agruparPorOrden, buscarObra, descargarCSV, esDestinoStock, fmtFecha, fmtNum, num } from "../obras";
import { Bloque, Estado, Mini, Tag, Vacio } from "../ui";

const ESTADO_ITEM = {
  pendiente: { label: "Pendiente", tono: "cian" },
  entregado: { label: "Entregado", tono: "verde" },
  cancelado: { label: "Cancelado", tono: "rojo" },
};

// Datos para escalar a Compras un pedido viejo que no se mandó.
function prefilledCompras(grupo, stockLabel) {
  const pend = grupo.items.filter((p) => p.estado === "pendiente");
  const estandar = pend.filter((p) => p.categoria !== "extra");
  const extra = pend.filter((p) => p.categoria === "extra");
  const label = grupo.ref.startsWith("__manual_") ? "" : (grupo.label ? `${grupo.label}\n` : "");
  const obraFromItems = pend.map((p) => String(p.obra_destino || "").trim()).find((dest) => dest && !esDestinoStock(dest));
  const obraFromLabel = grupo.label?.match(/Obra\s+([A-Z]?\d+(?:-\d+)?)/i)?.[1];
  const obraDestino = obraFromItems || obraFromLabel || "";
  const defaultDestination = obraDestino ? (/^Obra\s+/i.test(obraDestino) ? obraDestino : `Obra ${obraDestino}`) : "";
  const items = pend.map((p) => {
    const esExtra = p.categoria === "extra";
    return {
      material_id: p.material_id || null,
      laminacionPedidoId: p.id,
      catalogSource: "laminacion",
      category: p.categoria || "estándar",
      isExtra: esExtra,
      description: p.laminacion_materiales?.nombre || "Material",
      quantity: p.cantidad || 1,
      unit: p.laminacion_materiales?.unidad || "unidad",
      destination: esExtra ? stockLabel : defaultDestination,
      notes: esExtra ? `EXTRA - Enviar a ${stockLabel}` : "",
    };
  });
  let desc = "";
  if (label) desc += `${grupo.ref} — ${label}\n`;
  if (estandar.length) {
    desc += `\nMateriales:\n`;
    desc += estandar.map((p) => `  • ${p.laminacion_materiales?.nombre || "Material"}: ${p.cantidad} ${p.laminacion_materiales?.unidad || ""}`).join("\n");
  }
  if (extra.length) {
    desc += `\n\nExtra:\n`;
    desc += extra.map((p) => `  • ${p.laminacion_materiales?.nombre || "Material"}: ${p.cantidad} ${p.laminacion_materiales?.unidad || ""}`).join("\n");
  }
  return {
    title: grupo.ref.startsWith("__manual_") ? "Pedido manual — Laminación" : `${grupo.ref} — Laminación`,
    description: desc,
    items,
    defaultDestination,
    priority: extra.length ? "alta" : "media",
    origen: "laminacion",
    source: "laminacion",
    source_ref: grupo.ref,
    sourceLabel: "Laminación",
  };
}

export default function ListaPedidos({ sede, pedidos, obras, stockLabel, puedeGestionar, onEstadoPedido, onEliminarPedido, onEliminarOrden, onEnviarACompras, onIrIngresos }) {
  const [filtro, setFiltro] = useState("pendiente");
  const [q, setQ] = useState("");
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [limite, setLimite] = useState(25);

  // Los archivados sólo se ven en Ingresos → Archivados.
  const vigentes = useMemo(() => pedidos.filter((p) => !p.archivado_at), [pedidos]);
  const cuenta = useMemo(() => ({
    pendiente: vigentes.filter((p) => p.estado === "pendiente").length,
    entregado: vigentes.filter((p) => p.estado === "entregado").length,
    cancelado: vigentes.filter((p) => p.estado === "cancelado").length,
  }), [vigentes]);

  const filtrados = useMemo(() => {
    let rows = vigentes;
    if (filtro !== "todos") rows = rows.filter((p) => p.estado === filtro);
    const qq = q.trim().toLowerCase();
    if (qq) {
      rows = rows.filter((p) => [p.laminacion_materiales?.nombre, p.estado, p.observaciones, p.obra_destino]
        .filter(Boolean).join(" ").toLowerCase().includes(qq));
    }
    return rows;
  }, [vigentes, filtro, q]);

  const grupos = useMemo(() => agruparPorOrden(filtrados), [filtrados]);

  function alternar(ref) {
    setAbiertas((prev) => { const n = new Set(prev); if (n.has(ref)) n.delete(ref); else n.add(ref); return n; });
  }

  function exportar() {
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    descargarCSV(filtrados.map((p) => ({
      Fecha: new Date(p.created_at).toLocaleDateString("es-AR"),
      Orden: (p.observaciones ?? "").match(/^(OC-\d{8}-[A-Z0-9]+)/)?.[1] ?? "manual",
      Destino: p.obra_destino ?? "—",
      Material: p.laminacion_materiales?.nombre ?? "—",
      Unidad: p.laminacion_materiales?.unidad ?? "—",
      Cantidad: p.cantidad,
      Recibido: num(p.cantidad_recibida),
      Estado: p.estado,
      Observaciones: p.observaciones ?? "—",
    })), `pedidos_laminacion_${sede}_${hoy}.csv`);
  }

  return (
    <Bloque
      icono={Inbox}
      tono="azul"
      titulo="Pedidos hechos"
      texto={<>Lo que llega se recibe en <button type="button" className="ui-btn chico ui-btn-fantasma" style={{ minHeight: 24, padding: "0 6px", verticalAlign: "baseline" }} onClick={onIrIngresos}>Ingresos</button> y ahí suma al stock.</>}
      der={<button type="button" className="ui-btn chico ui-btn-fantasma" onClick={exportar} disabled={!filtrados.length}><Download size={14} /> CSV</button>}
      sinPad
    >
      <div className="lam-filtros" style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
        <div className="lam-scroll-x">
          {[["pendiente", "Abiertos"], ["entregado", "Entregados"], ["cancelado", "Cancelados"], ["todos", "Todos"]].map(([k, label]) => (
            <button key={k} type="button" className={`lam-chip${filtro === k ? " on" : ""}`} data-tono={ESTADO_ITEM[k]?.tono} onClick={() => { setFiltro(k); setLimite(25); }}>
              {ESTADO_ITEM[k] && <span className="pto" />} {label} <span className="n">{k === "todos" ? vigentes.length : cuenta[k]}</span>
            </button>
          ))}
        </div>
        <div className="lam-sp" />
        <label className="lam-buscar">
          <Search size={15} />
          <input className="ui-input" value={q} onChange={(e) => { setQ(e.target.value); setLimite(25); }} placeholder="Obra, material, orden…" aria-label="Buscar pedidos" />
        </label>
      </div>

      {!grupos.length ? (
        <Vacio icono={Inbox} titulo={q || filtro !== "todos" ? "Ningún pedido con este filtro" : "Sin pedidos registrados"} />
      ) : (
        <div className="lam-ordenes" style={{ padding: 12 }}>
          {grupos.slice(0, limite).map((grupo, i) => {
            const abierta = abiertas.has(grupo.ref);
            const pendientes = grupo.items.filter((p) => p.estado === "pendiente").length;
            const entregados = grupo.items.filter((p) => p.estado === "entregado").length;
            const esManual = grupo.ref.startsWith("__manual_");
            const destino = grupo.items.map((p) => p.obra_destino).find((d) => d && !esDestinoStock(d))
              || grupo.items.map((p) => p.obra_destino).find(Boolean);
            const obra = buscarObra(obras, destino);
            const extras = grupo.items.filter((p) => p.categoria === "extra").length;
            const enCompras = grupo.items.some((p) => p.purchase_request_item_id);
            const estado = pendientes > 0
              ? { label: `${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}`, tono: "cian" }
              : entregados === grupo.items.length ? { label: "Completo", tono: "verde" } : { label: "Cerrado", tono: "neutro" };
            return (
              <article key={grupo.ref} className={`lam-orden${abierta ? " abierta" : ""}`} style={{ "--i": Math.min(i, 10) }}>
                <div className="lam-orden-cab">
                  <button type="button" className="plegar" onClick={() => alternar(grupo.ref)} aria-expanded={abierta} aria-label={abierta ? "Ocultar materiales" : "Ver materiales"}>
                    <ChevronRight size={16} style={{ transform: abierta ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <div className="lam-orden-l1">
                      <span className="lam-orden-ref">{esManual ? "Manual" : grupo.ref}</span>
                      {obra ? <Tag tono="azul">Obra {obra.codigo}</Tag> : destino ? <Tag tono="neutro">{destino}</Tag> : null}
                      <Estado tono={estado.tono}>{estado.label}</Estado>
                      {extras > 0 && <Tag tono="cian">{extras} extra{extras !== 1 ? "s" : ""}</Tag>}
                      {pendientes > 0 && enCompras && <Tag tono="verde">En Compras</Tag>}
                    </div>
                    {!esManual && <div className="lam-orden-tit">{grupo.label}</div>}
                    <div className="lam-orden-meta">
                      <span>{grupo.items.length} {grupo.items.length === 1 ? "material" : "materiales"} · {entregados}/{grupo.items.length} entregados</span>
                      <span className="mono">{fmtFecha(grupo.createdAt)}</span>
                    </div>
                    <Mini pct={(entregados / Math.max(1, grupo.items.length)) * 100} style={{ maxWidth: 260, marginTop: 7 }} />
                  </div>
                  <div className="lam-orden-acc">
                    {pendientes > 0 && !enCompras && (
                      <button type="button" className="ui-btn chico ui-btn-suave" title="Este pedido todavía no llegó a Compras" onClick={() => onEnviarACompras(prefilledCompras(grupo, stockLabel))}>
                        <ShoppingCart size={14} /> Mandar a Compras
                      </button>
                    )}
                    {puedeGestionar && (
                      <button type="button" className="lam-btn-ic chico peligro" title="Eliminar la orden completa" aria-label="Eliminar orden" onClick={() => onEliminarOrden(grupo.items)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {abierta && (
                  <div className="lam-orden-items">
                    {grupo.items.map((p) => {
                      const est = ESTADO_ITEM[p.estado] ?? { label: p.estado, tono: "neutro" };
                      const recibido = num(p.cantidad_recibida);
                      return (
                        <div key={p.id} className="lam-item" style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto" }}>
                          <div style={{ minWidth: 0 }}>
                            <div className="lam-item-nom">
                              {p.laminacion_materiales?.nombre ?? "—"}
                              {p.categoria === "extra" && <span className="lam-tag" data-tono="cian" style={{ marginLeft: 7 }}>Extra</span>}
                            </div>
                            <div className="lam-item-meta">
                              <span>Pedido <b>{fmtNum(p.cantidad)}</b> {p.laminacion_materiales?.unidad}</span>
                              {recibido > 0 && p.estado === "pendiente" && <span data-tono="verde">Llegó <b>{fmtNum(recibido)}</b></span>}
                            </div>
                          </div>
                          <Estado tono={est.tono}>{est.label}</Estado>
                          {puedeGestionar ? (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              {p.estado === "pendiente" ? (
                                <>
                                  <button type="button" className="ui-btn chico ui-btn-fantasma" title="Marcar como entregado sin sumar stock" onClick={() => onEstadoPedido(p.id, "entregado")}><Check size={13} /> Entregado</button>
                                  <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => onEstadoPedido(p.id, "cancelado")}><X size={13} /> Cancelar</button>
                                </>
                              ) : (
                                <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => onEstadoPedido(p.id, "pendiente")}><RotateCcw size={13} /> Reabrir</button>
                              )}
                              <button type="button" className="lam-btn-ic chico peligro" aria-label="Eliminar material del pedido" onClick={() => onEliminarPedido(p)}><Trash2 size={13} /></button>
                            </div>
                          ) : <span />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
          {grupos.length > limite && (
            <div className="lam-mas" style={{ padding: "4px 4px 0" }}>
              Mostrando {limite} de {grupos.length} órdenes. <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => setLimite((n) => n + 25)}>Ver más</button>
            </div>
          )}
        </div>
      )}
    </Bloque>
  );
}
