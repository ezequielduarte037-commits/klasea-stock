import { useMemo, useState } from "react";
import { Boxes, Check, ChevronRight, Copy, Download, Inbox, Lock, RotateCcw, Search, Ship, ShoppingCart, Trash2, X } from "lucide-react";
import { buscarObra, descargarCSV, fmtFecha, fmtNum, num } from "@/features/laminacion/obras";
import { Bloque, Estado, Mini, Tag, Vacio } from "@/features/laminacion/ui";
import { ESTADO_COMPRAS, itemPendiente, itemRecibido, obraDeCategoria, porDestino, textoMailDePedido } from "../datos";

const FILTROS = [
  { k: "abiertos", label: "Abiertos", tono: "cian", es: (e) => e === "pendiente" || e === "parcial" },
  { k: "recibido", label: "Recibidos", tono: "verde", es: (e) => e === "recibido" },
  { k: "cerrado", label: "Cerrados sin completar", tono: "neutro", es: (e) => e === "cerrado" },
  { k: "cancelado", label: "Cancelados en Compras", tono: "rojo", es: (e) => e === "cancelado" },
];

export default function ListaPedidos({
  pedidos, obras, estadoCompras, puedeGestionar, recienCreado,
  onCerrar, onReabrir, onEliminar, onQuitarRenglon, onEnviarACompras, onIrIngresos,
}) {
  const nombreDestino = (obra) => (obra ? `Obra ${buscarObra(obras, obra)?.codigo || obra}` : "Stock");
  const [filtro, setFiltro] = useState("abiertos");
  const [q, setQ] = useState("");
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [limite, setLimite] = useState(25);
  const [copiado, setCopiado] = useState(null);

  const cuenta = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.k, pedidos.filter((p) => f.es(p.estadoVisto.clave)).length])), [pedidos]);

  const filtrados = useMemo(() => {
    const f = FILTROS.find((x) => x.k === filtro);
    let rows = f ? pedidos.filter((p) => f.es(p.estadoVisto.clave)) : pedidos;
    const qq = q.trim().toLowerCase();
    if (qq) {
      rows = rows.filter((p) => [p.nota, p.proveedor, fmtFecha(p.fecha_pedido), ...p.items.map((it) => `${it.descripcion} ${it.categoria || ""}`)]
        .filter(Boolean).join(" ").toLowerCase().includes(qq));
    }
    return rows;
  }, [pedidos, filtro, q]);

  // El recién mandado se ve abierto.
  const [visto, setVisto] = useState(null);
  if (recienCreado && recienCreado !== visto) {
    setVisto(recienCreado);
    setAbiertos((prev) => new Set(prev).add(recienCreado));
    if (filtro !== "abiertos" && filtro !== "todos") setFiltro("abiertos");
  }

  function alternar(id) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copiar(p) {
    navigator.clipboard.writeText(textoMailDePedido(p.items)).then(() => {
      setCopiado(p.id);
      setTimeout(() => setCopiado((c) => (c === p.id ? null : c)), 2200);
    });
  }

  function exportar() {
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    const filas = [];
    for (const p of filtrados) {
      for (const it of p.items) {
        filas.push({
          Fecha: fmtFecha(p.fecha_pedido || p.creado_en),
          Destino: obraDeCategoria(it.categoria) ? `Obra ${obraDeCategoria(it.categoria)}` : "Stock",
          Material: it.descripcion,
          Cantidad: num(it.cantidad),
          Unidad: it.unidad,
          Recibido: itemRecibido(it),
          Estado_pedido: p.estadoVisto.label,
          Compras: p.purchase_request_id ? (ESTADO_COMPRAS[estadoCompras[p.purchase_request_id]]?.label.replace("Compras: ", "") ?? "—") : "No enviado",
        });
      }
    }
    descargarCSV(filas, `pedidos_maderas_${hoy}.csv`);
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
          {FILTROS.filter((f) => !["cerrado", "cancelado"].includes(f.k) || cuenta[f.k] > 0).map((f) => (
            <button key={f.k} type="button" className={`lam-chip${filtro === f.k ? " on" : ""}`} data-tono={f.tono} onClick={() => { setFiltro(f.k); setLimite(25); }} aria-pressed={filtro === f.k}>
              <span className="pto" /> {f.label} <span className="n">{cuenta[f.k]}</span>
            </button>
          ))}
          <button type="button" className={`lam-chip${filtro === "todos" ? " on" : ""}`} onClick={() => { setFiltro("todos"); setLimite(25); }} aria-pressed={filtro === "todos"}>
            Todos <span className="n">{pedidos.length}</span>
          </button>
        </div>
        <div className="lam-sp" />
        <label className="lam-buscar">
          <Search size={15} />
          <input className="ui-input" value={q} onChange={(e) => { setQ(e.target.value); setLimite(25); }} placeholder="Material, obra, fecha…" aria-label="Buscar pedidos" />
        </label>
      </div>

      {!filtrados.length ? (
        <Vacio
          icono={Inbox}
          titulo={q ? "Ningún pedido coincide" : filtro === "abiertos" ? "No hay pedidos esperando" : "Sin pedidos con este filtro"}
          texto={!q && filtro === "abiertos" ? "Todo lo pedido ya llegó. Los nuevos se arman arriba." : undefined}
        />
      ) : (
        <div className="lam-ordenes" style={{ padding: 12 }}>
          {filtrados.slice(0, limite).map((p, i) => {
            const abierto = abiertos.has(p.id);
            const est = p.estadoVisto;
            const destinos = porDestino(p.items);
            const vivos = p.items.filter((it) => !it._cancelado);
            const compras = p.purchase_request_id ? ESTADO_COMPRAS[estadoCompras[p.purchase_request_id]] : null;
            const totalCant = vivos.reduce((s, it) => s + num(it.cantidad), 0);
            const recibidoCant = vivos.reduce((s, it) => s + itemRecibido(it), 0);
            const abiertoPedido = est.clave === "pendiente" || est.clave === "parcial";
            return (
              <article key={p.id} className={`lam-orden${abierto ? " abierta" : ""}`} style={{ "--i": Math.min(i, 10) }}>
                <div className="lam-orden-cab">
                  <button type="button" className="plegar" onClick={() => alternar(p.id)} aria-expanded={abierto} aria-label={abierto ? "Ocultar materiales" : "Ver materiales"}>
                    <ChevronRight size={16} style={{ transform: abierto ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <div className="lam-orden-l1">
                      <span className="lam-orden-ref">{fmtFecha(p.fecha_pedido || p.creado_en)}</span>
                      <Estado tono={est.tono}>{est.label}</Estado>
                      {compras
                        ? <Estado tono={compras.tono} punto={false}>{compras.label}</Estado>
                        : !p.purchase_request_id && <Tag tono="neutro">No está en Compras</Tag>}
                    </div>
                    {/* Qué va para cada destino, en su propia línea. */}
                    <div className="lam-orden-tit" style={{ display: "grid", gap: 3 }}>
                      {destinos.map((g) => {
                        const vivosG = g.items.filter((it) => !it._cancelado);
                        return (
                          <div key={g.clave} style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
                            <Tag tono={g.obra ? "azul" : "teal"}>{nombreDestino(g.obra)}</Tag>
                            <span style={{ fontSize: 13.5, minWidth: 0 }}>
                              {vivosG.length
                                ? `${vivosG.slice(0, 4).map((it) => `${it.descripcion} ×${fmtNum(it.cantidad)}`).join(" · ")}${vivosG.length > 4 ? "…" : ""}`
                                : <span style={{ color: "var(--dim)" }}>cancelado en Compras</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="lam-orden-meta">
                      {est.clave === "cancelado"
                        ? <span>{est.cancelados} {est.cancelados === 1 ? "material cancelado" : "materiales cancelados"} en Compras: no se espera nada</span>
                        : <span>{est.total} {est.total === 1 ? "material" : "materiales"} · {est.completos}/{est.total} recibidos</span>}
                      {est.cancelados > 0 && est.clave !== "cancelado" && <span style={{ color: "var(--red)" }}>{est.cancelados} cancelado{est.cancelados === 1 ? "" : "s"} en Compras</span>}
                      {p.recibido_en && est.clave === "recibido" && <span>cerrado el <span className="mono">{fmtFecha(p.recibido_en)}</span></span>}
                    </div>
                    {totalCant > 0 && <Mini pct={(recibidoCant / totalCant) * 100} style={{ maxWidth: 260, marginTop: 7 }} />}
                  </div>
                  <div className="lam-orden-acc">
                    {abiertoPedido && !p.purchase_request_id && puedeGestionar && (
                      <button type="button" className="ui-btn chico ui-btn-suave" title="Este pedido todavía no llegó a Compras" onClick={() => onEnviarACompras(p)}>
                        <ShoppingCart size={14} /> Mandar a Compras
                      </button>
                    )}
                    <button type="button" className="lam-btn-ic chico" title={copiado === p.id ? "Mail copiado" : "Copiar el mail de este pedido"} aria-label="Copiar el mail de este pedido" onClick={() => copiar(p)}>
                      {copiado === p.id ? <Check size={14} style={{ color: "var(--green)" }} /> : <Copy size={14} />}
                    </button>
                    {puedeGestionar && abiertoPedido && (
                      <button type="button" className="lam-btn-ic chico" title="Cerrar: lo que falta no va a llegar" aria-label="Cerrar el pedido" onClick={() => onCerrar(p)}>
                        <Lock size={14} />
                      </button>
                    )}
                    {puedeGestionar && est.clave === "cerrado" && (
                      <button type="button" className="lam-btn-ic chico" title="Reabrir: vuelve a Ingresos para recibir lo que falta" aria-label="Reabrir el pedido" onClick={() => onReabrir(p)}>
                        <RotateCcw size={14} />
                      </button>
                    )}
                    {puedeGestionar && (
                      <button type="button" className="lam-btn-ic chico peligro" title="Eliminar el pedido" aria-label="Eliminar el pedido" onClick={() => onEliminar(p)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {abierto && (
                  <div className="lam-orden-items">
                    {destinos.map((g) => (
                      <div key={g.clave}>
                        <div className="mad-sub-destino" data-tono={g.obra ? "azul" : "teal"}>
                          {g.obra ? <Ship size={13} /> : <Boxes size={13} />} {nombreDestino(g.obra)}
                        </div>
                        {g.items.map((it) => {
                          const recibido = itemRecibido(it);
                          const pendiente = itemPendiente(it);
                          const estItem = it._cancelado ? { label: "Cancelado en Compras", tono: "rojo" }
                            : !pendiente
                              ? (recibido >= num(it.cantidad) ? { label: "Recibido", tono: "verde" } : { label: "Cerrado", tono: "neutro" })
                              : est.clave === "cerrado" ? { label: recibido > 0 ? "Llegó una parte" : "No llegó", tono: "neutro" }
                                : recibido > 0 ? { label: "Parcial", tono: "violeta" } : { label: "Esperando", tono: "cian" };
                          // Se puede sacar lo que todavía no llegó nada.
                          const sePuedeSacar = puedeGestionar && abiertoPedido && pendiente && recibido <= 0;
                          return (
                            <div key={it.id} className={`lam-item${it._cancelado ? " cancelado" : ""}`}>
                              <div style={{ minWidth: 0 }}>
                                <div className="lam-item-nom">
                                  {it.descripcion}
                                  {!it.material_id && <span className="lam-tag" data-tono="violeta" style={{ marginLeft: 7 }}>Fuera del catálogo</span>}
                                </div>
                                <div className="lam-item-meta">
                                  <span>Pedido <b>{fmtNum(it.cantidad)}</b> {it.unidad}</span>
                                  {recibido > 0 && <span data-tono="verde">Llegó <b>{fmtNum(recibido)}</b></span>}
                                </div>
                              </div>
                              <Estado tono={estItem.tono}>{estItem.label}</Estado>
                              {sePuedeSacar ? (
                                <button type="button" className="lam-btn-ic chico peligro" title="Sacar del pedido (en Compras queda cancelado)" aria-label={`Sacar ${it.descripcion} del pedido`} onClick={() => onQuitarRenglon(p, it)}>
                                  <X size={14} />
                                </button>
                              ) : <span />}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
          {filtrados.length > limite && (
            <div className="lam-mas" style={{ padding: "4px 4px 0" }}>
              Mostrando {limite} de {filtrados.length}. <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => setLimite((n) => n + 25)}>Ver más</button>
            </div>
          )}
        </div>
      )}
    </Bloque>
  );
}
