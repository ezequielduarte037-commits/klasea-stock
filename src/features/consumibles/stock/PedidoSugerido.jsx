import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, FileSpreadsheet, Plus, Send, ShoppingCart, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { descargarXlsx } from "@/features/compras/xlsx";
import { fmtCantidad, fmtPesos } from "@/features/consumibles/api";
import { claveDia, coincideBusqueda } from "../conteo/conteoCalculos";
import { armarPedidoConExtras, conUnidadesDeCompra, filasExcel, textoWhatsApp, totalDePedido } from "./reposicion";
import { mandarPedidoACompras } from "./stockApi";
import FotoConsumible from "../FotoConsumible";

/**
 * Pedido de consumibles: lo que está en el mínimo o por debajo (sugerido), más
 * cualquier producto que se sume a mano, en unidades de compra y redondeado al
 * lote. Las cantidades se pueden retocar y un renglón se puede sacar antes de
 * confirmar. Sale por WhatsApp (texto), Excel o como pedido a Compras; cuando
 * llega la mercadería, Ingresos lo recibe con los renglones ya cargados.
 */

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sin permiso de portapapeles (http o navegador viejo): el método de siempre.
    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

const archivo = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function PedidoSugerido({ catalogo, sede, conMinimo, onVerProducto, onVerSinMinimo }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [cantidades, setCantidades] = useState(() => new Map()); // materialId → unidades de compra
  const [fuera, setFuera] = useState(() => new Set());
  const [extras, setExtras] = useState(() => new Map()); // materialId → unidades de compra pedidas a mano
  const [busqueda, setBusqueda] = useState("");
  const [enviando, setEnviando] = useState(null);
  const [enviados, setEnviados] = useState(() => new Map()); // proveedor → id del pedido

  const grupos = useMemo(() => armarPedidoConExtras(catalogo, sede, extras).map((g) => ({
    ...g,
    lineas: g.lineas.map((l) => {
      const conCantidad = cantidades.has(l.materialId) ? conUnidadesDeCompra(l, cantidades.get(l.materialId)) : l;
      return fuera.has(l.materialId) ? { ...conCantidad, unidadesCompra: 0, subtotal: null, fuera: true } : conCantidad;
    }),
  })), [catalogo, sede, extras, cantidades, fuera]);

  const yaEnPedido = useMemo(() => new Set(grupos.flatMap((g) => g.lineas.map((l) => l.materialId))), [grupos]);
  const resultados = useMemo(() => {
    const q = busqueda.trim();
    if (!q) return [];
    return (catalogo ?? []).filter((i) => !yaEnPedido.has(i.id) && coincideBusqueda(i, q)).slice(0, 8);
  }, [busqueda, catalogo, yaEnPedido]);

  const sumar = (item) => {
    setExtras((prev) => new Map(prev).set(item.id, 1));
    setBusqueda("");
  };
  const quitarExtra = (id) => {
    setExtras((prev) => { const n = new Map(prev); n.delete(id); return n; });
    setCantidades((prev) => { const n = new Map(prev); n.delete(id); return n; });
  };

  const cambiarCantidad = (id, v) => setCantidades((prev) => new Map(prev).set(id, v));
  const alternar = (id) => setFuera((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const copiarWhatsApp = async (g) => {
    const ok = await copiar(textoWhatsApp(g, { sede }));
    if (ok) toast.success("Copiado. Pegalo en WhatsApp.");
    else toast.error("No se pudo copiar.");
  };

  const bajarExcel = (g) => {
    descargarXlsx(`pedido-${archivo(g.proveedor)}-${archivo(sede)}-${claveDia(new Date())}.xlsx`, [{
      nombre: "Pedido",
      anchos: [16, 46, 10, 16, 16, 9, 9, 9, 16, 14],
      congelar: { fila: 1, col: 0 },
      filas: filasExcel(g).map((fila, i) => (i === 0 ? fila.map((v) => ({ v, s: { fuente: { b: true }, fondo: "E8EEF8" } })) : fila)),
    }]);
  };

  const mandar = async (g) => {
    const lineas = g.lineas.filter((l) => l.unidadesCompra > 0);
    const ok = await confirmar({
      title: "¿Mandar el pedido a Compras?",
      message: `${lineas.length} ${lineas.length === 1 ? "producto" : "productos"}${g.sinProveedor ? " sin proveedor asignado" : ` de ${g.proveedor}`}, para el pañol ${sede}. Compras recibe el aviso.`,
      confirmLabel: "Mandar a Compras",
    });
    if (!ok) return;
    setEnviando(g.proveedor);
    try {
      const pedido = await mandarPedidoACompras({ grupo: g, sede });
      setEnviados((prev) => new Map(prev).set(g.proveedor, pedido.id));
      toast.success("Pedido creado en Compras.");
    } catch (err) {
      toast.error(`No se pudo crear el pedido: ${err.message || err}`);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="stk-pedido">
      <section className="stk-agregar ui-card" aria-label="Sumar un producto al pedido">
        <label className="stk-agregar-lbl" htmlFor="stk-agregar-q">Pedir otro producto <span className="stk-dim">(no hace falta que esté en el mínimo)</span></label>
        <input id="stk-agregar-q" className="ui-input" value={busqueda} autoComplete="off" placeholder="Buscá por nombre o código" onChange={(e) => setBusqueda(e.target.value)} />
        {resultados.length > 0 && (
          <ul className="stk-agregar-res" role="listbox" aria-label="Productos encontrados">
            {resultados.map((r) => (
              <li key={r.id}>
                <button type="button" className="stk-agregar-op" onClick={() => sumar(r)}>
                  <Plus size={16} />
                  <span>{r.descripcion}<small className="stk-dim">{[r.codigoEtiqueta, r.config?.proveedor_nombre].filter(Boolean).join(" · ")}</small></span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!conMinimo && (
          <p className="stk-dim stk-agregar-nota">
            Todavía no hay mínimos cargados, así que no hay productos sugeridos.{" "}
            <button type="button" className="ui-btn ui-btn-fantasma" onClick={onVerSinMinimo}>Cargar mínimos</button>
          </p>
        )}
      </section>
      {!grupos.length && (
        <div className="stk-vacio ui-card">
          <ShoppingCart size={26} />
          <h3>{conMinimo ? "No hace falta pedir nada" : "El pedido está vacío"}</h3>
          <p>{conMinimo ? `Ningún producto con mínimo cargado está en su mínimo o por debajo en ${sede}. ` : ""}Buscá arriba lo que quieras pedir.</p>
        </div>
      )}
      {grupos.map((g) => {
        const { total, sinCosto } = totalDePedido(g.lineas);
        const activos = g.lineas.filter((l) => l.unidadesCompra > 0).length;
        const pedidoId = enviados.get(g.proveedor);
        return (
          <section key={g.proveedor} className="stk-grupo ui-card">
            <header className="stk-grupo-cab">
              <div className="stk-grupo-tit">
                <h3>{g.proveedor}</h3>
                <span className="stk-dim">
                  {activos} {activos === 1 ? "producto" : "productos"}
                  {total > 0 && <> · <span className="stk-num">{fmtPesos(total)}</span> sin IVA</>}
                  {sinCosto > 0 && <> · {sinCosto} sin precio</>}
                </span>
              </div>
              <div className="stk-grupo-acciones">
                <button type="button" className="ui-btn" onClick={() => copiarWhatsApp(g)} disabled={!activos}><Copy size={15} /> Copiar para WhatsApp</button>
                <button type="button" className="ui-btn" onClick={() => bajarExcel(g)} disabled={!activos}><FileSpreadsheet size={15} /> Excel</button>
                {pedidoId ? (
                  <Link className="ui-btn ui-btn-suave" to={`/compras?open=${pedidoId}`}>Ver el pedido en Compras</Link>
                ) : (
                  <button type="button" className="ui-btn ui-btn-primario" onClick={() => mandar(g)} disabled={!activos || enviando != null}>
                    <Send size={15} /> {enviando === g.proveedor ? "Mandando…" : "Mandar a Compras"}
                  </button>
                )}
              </div>
            </header>
            {g.sinProveedor && <p className="stk-aviso">Estos productos no tienen proveedor en su configuración. Se pueden pedir igual; Compras elige a quién.</p>}
            <div className="stk-ped-tabla" role="table" aria-label={`Pedido a ${g.proveedor}`}>
              <div className="stk-ped-fila is-cab" role="row">
                <span role="columnheader" />
                <span role="columnheader">Producto</span>
                <span role="columnheader" className="is-num">Stock / mín.</span>
                <span role="columnheader" className="is-num">Faltan</span>
                <span role="columnheader" className="is-num">Pedir</span>
                <span role="columnheader" className="is-num">Costo u.</span>
                <span role="columnheader" className="is-num">Subtotal</span>
              </div>
              {g.lineas.map((l) => (
                <div key={l.materialId} className={`stk-ped-fila${l.fuera ? " is-fuera" : ""}`} role="row">
                  <span role="cell" className="stk-ped-check">
                    {l.manual ? (
                      <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => quitarExtra(l.materialId)} aria-label={`Sacar ${l.descripcion} del pedido`} title="Sacar del pedido"><X size={15} /></button>
                    ) : (
                      <input type="checkbox" checked={!l.fuera} onChange={() => alternar(l.materialId)} aria-label={`Incluir ${l.descripcion}`} />
                    )}
                  </span>
                  <span role="cell" className="stk-ped-prod">
                    <button type="button" className="stk-prod" onClick={() => onVerProducto(l.materialId)}>
                      <FotoConsumible item={l} />
                      <span className="stk-prod-texto">
                        <span className="stk-prod-desc">{l.descripcion}</span>
                        <span className="stk-prod-meta">{[l.codigoProveedor ? `Cód. ${l.codigoProveedor}` : "Sin código de proveedor", l.codigoEtiqueta].filter(Boolean).join(" · ")}</span>
                      </span>
                    </button>
                  </span>
                  <span role="cell" className="is-num stk-num" data-lbl="Stock / mín.">
                    {l.sinContar ? <span className="stk-dim">sin contar</span> : <span className={l.stock < 0 ? "is-negativo" : ""}>{fmtCantidad(l.stock)}</span>} / {l.minimo ? fmtCantidad(l.minimo) : "—"}
                  </span>
                  <span role="cell" className="is-num stk-num" data-lbl="Faltan">{l.manual ? <span className="stk-dim">a mano</span> : <>{fmtCantidad(l.reponer)} <small>{l.unidad}</small></>}</span>
                  <span role="cell" className="is-num" data-lbl="Pedir">
                    <input
                      className="ui-input stk-input stk-num"
                      inputMode="numeric"
                      value={l.fuera ? "" : String(l.unidadesCompra)}
                      disabled={l.fuera}
                      aria-label={`Unidades de compra de ${l.descripcion}`}
                      onChange={(e) => cambiarCantidad(l.materialId, e.target.value.replace(/\D/g, ""))}
                    />
                    <small className="stk-ped-unidad">
                      {l.unidadCompra || l.unidad}{l.factor > 1 ? ` x${fmtCantidad(l.factor)} = ${fmtCantidad(l.cantidadEntrega)}` : ""}
                    </small>
                  </span>
                  <span role="cell" className="is-num stk-num" data-lbl="Costo u.">{l.costoCompra == null ? "—" : fmtPesos(l.costoCompra)}</span>
                  <span role="cell" className="is-num stk-num stk-ped-sub" data-lbl="Subtotal">{l.subtotal == null ? "—" : fmtPesos(l.subtotal)}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
