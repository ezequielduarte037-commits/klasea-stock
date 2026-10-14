import { useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Download, Inbox, Lock, RotateCcw, Search, ShoppingCart, Trash2 } from "lucide-react";
import { buscarObra, descargarCSV, fmtFecha, fmtNum, num } from "@/features/laminacion/obras";
import { Bloque, Estado, Mini, Tag, Vacio } from "@/features/laminacion/ui";
import { ESTADO_COMPRAS, destinosDePedido, itemPendiente, itemRecibido, obraDeCategoria, textoMailDePedido } from "../datos";

const FILTROS = [
  { k: "abiertos", label: "Abiertos", tono: "cian", es: (e) => e === "pendiente" || e === "parcial" },
  { k: "recibido", label: "Recibidos", tono: "verde", es: (e) => e === "recibido" },
  { k: "cerrado", label: "Cerrados sin completar", tono: "neutro", es: (e) => e === "cerrado" },
];

export default function ListaPedidos({
  pedidos, obras, estadoCompras, puedeGestionar, recienCreado,
  onCerrar, onReabrir, onEliminar, onEnviarACompras, onIrIngresos,
}) {
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
          {FILTROS.filter((f) => f.k !== "cerrado" || cuenta.cerrado > 0).map((f) => (
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
            const { obras: obrasPed, stock } = destinosDePedido(p.items);
            const compras = p.purchase_request_id ? ESTADO_COMPRAS[estadoCompras[p.purchase_request_id]] : null;
            const totalCant = p.items.reduce((s, it) => s + num(it.cantidad), 0);
            const recibidoCant = p.items.reduce((s, it) => s + itemRecibido(it), 0);
            const abiertoPedido = est.clave === "pendiente" || est.clave === "parcial";
            const preview = p.items.slice(0, 3).map((it) => `${it.descripcion} ×${fmtNum(it.cantidad)}`).join(" · ");
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
                      {obrasPed.map((o) => <Tag key={o} tono="azul">Obra {buscarObra(obras, o)?.codigo || o}</Tag>)}
                      {stock && <Tag tono="teal">Stock</Tag>}
                      {compras
                        ? <Estado tono={compras.tono} punto={false}>{compras.label}</Estado>
                        : !p.purchase_request_id && <Tag tono="neutro">No está en Compras</Tag>}
                    </div>
                    <div className="lam-orden-tit">{preview}{p.items.length > 3 ? "…" : ""}</div>
                    <div className="lam-orden-meta">
                      <span>{p.items.length} {p.items.length === 1 ? "material" : "materiales"} · {est.completos}/{est.total} recibidos</span>
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
                    {p.items.map((it) => {
                      const recibido = itemRecibido(it);
                      const pendiente = itemPendiente(it);
                      const obra = obraDeCategoria(it.categoria);
                      const estItem = !pendiente
                        ? (recibido >= num(it.cantidad) ? { label: "Recibido", tono: "verde" } : { label: "Cerrado", tono: "neutro" })
                        : est.clave === "cerrado" ? { label: recibido > 0 ? "Llegó una parte" : "No llegó", tono: "neutro" }
                        : recibido > 0 ? { label: "Parcial", tono: "violeta" } : { label: "Esperando", tono: "cian" };
                      return (
                        <div key={it.id} className="lam-item">
                          <div style={{ minWidth: 0 }}>
                            <div className="lam-item-nom">
                              {it.descripcion}
                              {!it.material_id && <span className="lam-tag" data-tono="violeta" style={{ marginLeft: 7 }}>Fuera del catálogo</span>}
                            </div>
                            <div className="lam-item-meta">
                              <span>Pedido <b>{fmtNum(it.cantidad)}</b> {it.unidad}</span>
                              {recibido > 0 && <span data-tono="verde">Llegó <b>{fmtNum(recibido)}</b></span>}
                              <span>{obra ? `Obra ${buscarObra(obras, obra)?.codigo || obra}` : "Stock"}</span>
                            </div>
                          </div>
                          <Estado tono={estItem.tono}>{estItem.label}</Estado>
                          <span />
                        </div>
                      );
                    })}
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
