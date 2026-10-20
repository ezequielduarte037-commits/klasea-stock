import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Copy, FileSpreadsheet, PackageCheck, Plus, RefreshCw, ScanLine, Send, ShoppingCart, Sparkles, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { descargarXlsx } from "@/features/compras/xlsx";
import { fetchCatalogo, fmtCantidad, fmtPesos, indexarCodigos, normalizarCodigo } from "@/features/consumibles/api";
import { claveDia, coincideBusqueda } from "../conteo/conteoCalculos";
import { armarPedidoSugerido } from "../stock/reposicion";
import FotoConsumible from "../FotoConsumible";
import { conPlazoLectura } from "../lecturas";
import {
  agregarAlCarrito, cambiarCantidad, cerrarPedido, confirmarPedido, fetchPedidos,
  obtenerCarrito, quitarRenglon, reabrirPedido, vaciarCarrito,
} from "./pedidosApi";
import {
  ETIQUETA_ESTADO, PROVEEDOR_POR_DEFECTO, cantidadTexto, estadoDePedido, filasExcel,
  renglonesParaMostrar, textoWhatsApp, totalDePedido,
} from "./pedidosLogica";
import { CSS_PEDIDOS } from "./pedidosEstilos";

/**
 * Pedidos — el pañol arma el pedido a Rebollar (u otro proveedor) como un
 * carrito: cualquier producto, en cualquier momento, sin depender del stock
 * mínimo. El carrito es uno por sede y proveedor y lo comparte todo el pañol.
 * Al confirmarlo queda como pedido hecho, se manda por WhatsApp o Excel, y
 * cuando llega la mercadería Ingresos lo recibe con los renglones cargados.
 */

const TONO = { esperando: "azul", parcial: "violeta", completo: "verde" };
const fechaHora = (iso) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const archivo = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
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

export default function PedidosTab({ sede }) {
  return <Pedidos key={sede} sede={sede} />;
}

function Pedidos({ sede }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [, setParams] = useSearchParams();
  const buscarRef = useRef(null);

  const [catalogo, setCatalogo] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [recibidos, setRecibidos] = useState(() => new Map());
  const [error, setError] = useState("");
  const [proveedor, setProveedor] = useState(PROVEEDOR_POR_DEFECTO);
  const [busqueda, setBusqueda] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [nota, setNota] = useState("");
  const [abierto, setAbierto] = useState(null);

  const cargarPedidos = useCallback(async () => {
    const r = await fetchPedidos(sede);
    setPedidos(r.pedidos);
    setRecibidos(r.recibidos);
  }, [sede]);

  const cargar = useCallback(async () => {
    const [cat] = await conPlazoLectura(Promise.all([fetchCatalogo({ sede }), cargarPedidos()]));
    setCatalogo(cat);
    setError("");
  }, [sede, cargarPedidos]);

  useEffect(() => {
    let vivo = true;
    cargar().catch((e) => { if (vivo) setError(e.message || String(e)); });
    return () => { vivo = false; };
  }, [cargar]);

  const porId = useMemo(() => new Map((catalogo ?? []).map((i) => [i.id, i])), [catalogo]);
  const indice = useMemo(() => indexarCodigos(catalogo ?? []), [catalogo]);
  const proveedores = useMemo(() => {
    const set = new Set([PROVEEDOR_POR_DEFECTO]);
    for (const i of catalogo ?? []) {
      const p = String(i.config?.proveedor_nombre || "").trim();
      if (p) set.add(p);
    }
    for (const p of pedidos) if (p.estado === "borrador") set.add(p.proveedor);
    return [...set].sort((a, b) => (a === PROVEEDOR_POR_DEFECTO ? -1 : b === PROVEEDOR_POR_DEFECTO ? 1 : a.localeCompare(b, "es")));
  }, [catalogo, pedidos]);

  const carrito = pedidos.find((p) => p.estado === "borrador" && p.proveedor.toLowerCase() === proveedor.toLowerCase()) ?? null;
  const otrosCarritos = pedidos.filter((p) => p.estado === "borrador" && p !== carrito && (p.items ?? []).length);
  const lineas = useMemo(() => (carrito ? renglonesParaMostrar(carrito, porId) : []), [carrito, porId]);
  const { total, sinCosto } = totalDePedido(lineas);
  const hechos = pedidos.filter((p) => p.estado !== "borrador");

  const enCarrito = useMemo(() => new Set(lineas.map((l) => l.material_id)), [lineas]);
  const resultados = useMemo(() => {
    const q = busqueda.trim();
    if (!q || !catalogo) return [];
    return catalogo.filter((i) => coincideBusqueda(i, q)).slice(0, 8);
  }, [busqueda, catalogo]);

  const conCarrito = async (fn) => {
    setOcupado(true);
    try {
      const c = carrito ?? await obtenerCarrito(sede, proveedor);
      await fn(c);
      await cargarPedidos();
    } catch (e) {
      toast.error(e?.message || "No se pudo guardar el pedido.");
      await cargarPedidos().catch(() => {});
    } finally {
      setOcupado(false);
    }
  };

  const sumar = (item) => {
    setBusqueda("");
    buscarRef.current?.focus();
    return conCarrito((c) => agregarAlCarrito(c.id, item, 1));
  };

  // El lector 2D escribe el código y manda Enter.
  const onBuscarEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const porCodigo = indice.get(normalizarCodigo(busqueda));
    if (porCodigo) sumar(porCodigo);
    else if (resultados.length === 1) sumar(resultados[0]);
    else if (!resultados.length && busqueda.trim()) toast.warning(`No encontramos «${busqueda.trim()}».`);
  };

  const sumarSugeridos = () => conCarrito(async (c) => {
    const mismo = (p) => String(p || "").toLowerCase() === proveedor.toLowerCase();
    const sugeridas = armarPedidoSugerido(catalogo ?? [], sede)
      .filter((g) => mismo(g.proveedor))
      .flatMap((g) => g.lineas)
      .filter((l) => !enCarrito.has(l.materialId) && l.unidadesCompra > 0);
    if (!sugeridas.length) {
      toast.info(`Ningún producto de ${proveedor} está en su mínimo o por debajo (o ya están en el carrito).`);
      return;
    }
    for (const l of sugeridas) await agregarAlCarrito(c.id, porId.get(l.materialId), l.unidadesCompra);
    toast.success(`${sugeridas.length} ${sugeridas.length === 1 ? "producto sumado" : "productos sumados"} desde el stock mínimo.`);
  });

  const guardarCantidad = async (linea, valor) => {
    const n = Number(String(valor).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      toast.warning("La cantidad tiene que ser mayor a cero. Para sacarlo, tocá la X.");
      return false;
    }
    if (n === Number(linea.cantidad)) return true;
    setOcupado(true);
    try {
      await cambiarCantidad(linea.id, n);
      await cargarPedidos();
      return true;
    } catch (e) {
      toast.error(e?.message || "No se pudo cambiar la cantidad.");
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const quitar = (linea) => conCarrito(() => quitarRenglon(linea.id));

  const vaciar = async () => {
    const ok = await confirmar({ title: "¿Vaciar el carrito?", message: `Se sacan los ${lineas.length} productos del pedido a ${proveedor}.`, confirmLabel: "Vaciar", tone: "danger" });
    if (ok) conCarrito((c) => vaciarCarrito(c.id));
  };

  const copiarWhatsApp = async (pedido, renglones) => {
    const ok = await copiar(textoWhatsApp({ pedido, renglones }));
    if (ok) toast.success("Copiado. Pegalo en WhatsApp.");
    else toast.error("No se pudo copiar.");
  };

  const bajarExcel = (pedido, renglones) => {
    descargarXlsx(`pedido-${pedido.numero ?? ""}-${archivo(pedido.proveedor)}-${archivo(pedido.sede)}-${claveDia(new Date())}.xlsx`, [{
      nombre: "Pedido",
      anchos: [16, 46, 10, 18, 16, 16, 14],
      congelar: { fila: 1, col: 0 },
      filas: filasExcel(renglones).map((fila, i) => (i === 0 ? fila.map((v) => ({ v, s: { fuente: { b: true }, fondo: "E8EEF8" } })) : fila)),
    }]);
  };

  const confirmarCarrito = async () => {
    if (!carrito || !lineas.length) return;
    const ok = await confirmar({
      title: `¿Confirmar el pedido a ${proveedor}?`,
      message: `${lineas.length} ${lineas.length === 1 ? "producto" : "productos"} para el pañol ${sede}${total > 0 ? `, ${fmtPesos(total)} sin IVA estimado` : ""}. Queda como pedido hecho y se copia el texto para mandarlo por WhatsApp. Cuando llegue, se recibe desde Ingresos.`,
      confirmLabel: "Confirmar pedido",
    });
    if (!ok) return;
    setOcupado(true);
    try {
      const hecho = await confirmarPedido(carrito.id, nota);
      setNota("");
      const renglones = renglonesParaMostrar(hecho, porId);
      const copiado = await copiar(textoWhatsApp({ pedido: hecho, renglones }));
      toast.success(`Pedido N° ${hecho.numero} confirmado.${copiado ? " El texto para WhatsApp ya está copiado." : ""}`);
      setAbierto(hecho.id);
      await cargarPedidos();
    } catch (e) {
      toast.error(e?.message || "No se pudo confirmar el pedido.");
    } finally {
      setOcupado(false);
    }
  };

  const cerrar = async (pedido) => {
    const ok = await confirmar({
      title: `¿Dar por cerrado el pedido N° ${pedido.numero}?`,
      message: "Lo que falta no se espera más y el pedido deja de aparecer en Ingresos. Si al final llega, se puede volver a abrir.",
      confirmLabel: "Cerrar pedido",
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await cerrarPedido(pedido.id);
      await cargarPedidos();
    } catch (e) {
      toast.error(e?.message || "No se pudo cerrar el pedido.");
    } finally {
      setOcupado(false);
    }
  };

  const reabrir = async (pedido) => {
    setOcupado(true);
    try {
      await reabrirPedido(pedido.id);
      await cargarPedidos();
    } catch (e) {
      toast.error(e?.message || "No se pudo volver a abrir el pedido.");
    } finally {
      setOcupado(false);
    }
  };

  const recibirEnIngresos = (pedido) => setParams((prev) => {
    const n = new URLSearchParams(prev);
    n.set("tab", "ingresos");
    n.set("pedido", pedido.id);
    return n;
  });

  if (error && !catalogo) {
    return (
      <div className="ped">
        <style href="klasea-cns-pedidos" precedence="default">{CSS_PEDIDOS}</style>
        <div className="ui-card" style={{ padding: 24, textAlign: "center" }}>
          <p>No se pudieron traer los pedidos.</p>
          <p className="ped-dim">{error}</p>
          <button type="button" className="ui-btn ui-btn-primario" onClick={() => cargar().catch((e) => setError(e.message))}>Probar de nuevo</button>
        </div>
      </div>
    );
  }
  if (!catalogo) {
    return (
      <div className="ped">
        <style href="klasea-cns-pedidos" precedence="default">{CSS_PEDIDOS}</style>
        <Cargando texto="Trayendo los pedidos…" />
      </div>
    );
  }

  return (
    <div className="ped">
      <style href="klasea-cns-pedidos" precedence="default">{CSS_PEDIDOS}</style>

      <section className="ped-carrito ui-card" aria-label="Carrito del pedido">
        <header className="ped-cab">
          <h2><ShoppingCart size={18} /> Carrito para {proveedor}</h2>
          <div className="ped-cab-der">
            <select className="ui-input ped-prov" value={proveedor} onChange={(e) => setProveedor(e.target.value)} aria-label="Proveedor">
              {proveedores.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button type="button" className="ui-btn" onClick={sumarSugeridos} disabled={ocupado} title="Suma los productos de este proveedor que están en su mínimo o por debajo">
              <Sparkles size={15} /> Sumar los que faltan
            </button>
            <button type="button" className="ui-btn ui-btn-icono" onClick={() => cargar().catch(() => toast.error("No se pudo actualizar."))} aria-label="Actualizar" title="Actualizar">
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        {otrosCarritos.length > 0 && (
          <p className="ped-dim" style={{ margin: "10px 16px 0", fontSize: 13 }}>
            También hay carrito abierto para {otrosCarritos.map((p) => `${p.proveedor} (${p.items.length})`).join(", ")}.
          </p>
        )}

        <div className="ped-buscar">
          <ScanLine size={18} className="ped-buscar-ico" />
          <input
            ref={buscarRef}
            className="ui-input"
            value={busqueda}
            placeholder="Escaneá o buscá un producto para pedir"
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={onBuscarEnter}
            aria-label="Escaneá o buscá un producto para pedir"
          />
        </div>
        {resultados.length > 0 && (
          <ul className="ped-res" role="listbox" aria-label="Productos encontrados">
            {resultados.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => sumar(r)} disabled={ocupado}>
                  <Plus size={16} />
                  <FotoConsumible item={r} size={30} />
                  <span className="ped-res-txt">
                    <span>{r.descripcion}{enCarrito.has(r.id) ? <span className="ped-dim"> · ya está, suma 1</span> : null}</span>
                    <small>{[r.codigoEtiqueta, r.config?.proveedor_codigo ? `Cód. ${r.config.proveedor_codigo}` : null, r.config?.proveedor_nombre].filter(Boolean).join(" · ")}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {lineas.length === 0 ? (
          <p className="ped-vacio">El carrito está vacío. Buscá o escaneá lo que haga falta: no tiene que estar en el mínimo.</p>
        ) : (
          <ul className="ped-lineas">
            {lineas.map((l) => (
              <LineaCarrito key={`${l.id}-${l.cantidad}`} linea={l} ocupado={ocupado} onGuardar={(v) => guardarCantidad(l, v)} onQuitar={() => quitar(l)} />
            ))}
          </ul>
        )}

        {lineas.length > 0 && (
          <>
            <div className="ped-nota">
              <input className="ui-input" value={nota} maxLength={200} placeholder="Nota para el pedido (opcional). Ej.: entregar en Chubut antes del jueves" onChange={(e) => setNota(e.target.value)} aria-label="Nota del pedido" />
            </div>
            <footer className="ped-pie">
              <span className="ped-total">
                <b className="ped-num">{lineas.length}</b> {lineas.length === 1 ? "producto" : "productos"}
                {total > 0 && <> · <b className="ped-num">{fmtPesos(total)}</b> sin IVA</>}
                {sinCosto > 0 && <span className="ped-dim"> · {sinCosto} sin precio</span>}
              </span>
              <button type="button" className="ui-btn ui-btn-fantasma" onClick={vaciar} disabled={ocupado}>Vaciar</button>
              <button type="button" className="ui-btn" onClick={() => copiarWhatsApp(carrito, lineas)} disabled={ocupado}><Copy size={15} /> Copiar</button>
              <button type="button" className="ui-btn ui-btn-primario" onClick={confirmarCarrito} disabled={ocupado}><Send size={15} /> Confirmar pedido</button>
            </footer>
          </>
        )}
      </section>

      <section className="ped-hechos" aria-label="Pedidos hechos">
        <h2>Pedidos hechos</h2>
        {hechos.length === 0 ? (
          <p className="ped-dim">Todavía no se confirmó ningún pedido en {sede}.</p>
        ) : (
          <ul className="ped-lista">
            {hechos.map((p) => {
              const estado = estadoDePedido(p, recibidos);
              const renglones = renglonesParaMostrar(p, porId, recibidos);
              const { total: totalP } = totalDePedido(renglones);
              const exp = abierto === p.id;
              const pendientes = renglones.filter((r) => !r.completo).length;
              return (
                <li key={p.id} className="ped-item ui-card">
                  <button type="button" className="ped-item-cab" onClick={() => setAbierto(exp ? null : p.id)} aria-expanded={exp}>
                    {exp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span className="ped-item-tit">
                      <span>Pedido N° <span className="ped-num">{p.numero}</span> · {p.proveedor}</span>
                      <small>{fechaHora(p.pedido_at || p.created_at)} · {renglones.length} {renglones.length === 1 ? "producto" : "productos"}{totalP > 0 ? ` · ${fmtPesos(totalP)} sin IVA` : ""}{estado === "parcial" ? ` · faltan ${pendientes}` : ""}</small>
                    </span>
                    <span className="ui-chip ped-estado" data-tono={TONO[estado]}>{ETIQUETA_ESTADO[estado] ?? estado}</span>
                  </button>
                  {exp && (
                    <div className="ped-item-cuerpo">
                      <table className="ped-tabla">
                        <thead>
                          <tr><th>Producto</th><th className="is-num">Pedido</th><th className="is-num">Llegó</th><th className="is-num">Subtotal</th></tr>
                        </thead>
                        <tbody>
                          {renglones.map((r) => (
                            <tr key={r.id}>
                              <td>{r.descripcion}{r.codigoProveedor ? <span className="ped-dim"> · {r.codigoProveedor}</span> : null}</td>
                              <td className="is-num ped-num">{cantidadTexto(r)}</td>
                              <td className={`is-num ped-num ${r.completo ? "is-ok" : r.recibido > 0 ? "is-falta" : "ped-dim"}`}>{fmtCantidad(r.recibido)}</td>
                              <td className="is-num ped-num">{r.subtotal == null ? "—" : fmtPesos(r.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {p.nota && <p className="ped-dim" style={{ margin: "10px 0 0", fontSize: 13 }}>Nota: {p.nota}</p>}
                      <div className="ped-acciones">
                        {p.estado === "pedido" && estado !== "completo" && (
                          <button type="button" className="ui-btn ui-btn-primario" onClick={() => recibirEnIngresos(p)}><PackageCheck size={15} /> Recibir en Ingresos</button>
                        )}
                        <button type="button" className="ui-btn" onClick={() => copiarWhatsApp(p, renglones)}><Copy size={15} /> Copiar para WhatsApp</button>
                        <button type="button" className="ui-btn" onClick={() => bajarExcel(p, renglones)}><FileSpreadsheet size={15} /> Excel</button>
                        {p.estado === "pedido" && estado !== "completo" && (
                          <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => cerrar(p)} disabled={ocupado}>Dar por cerrado</button>
                        )}
                        {p.estado === "cerrado" && (
                          <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => reabrir(p)} disabled={ocupado}>Volver a abrir</button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function LineaCarrito({ linea, ocupado, onGuardar, onQuitar }) {
  // Se monta de nuevo cuando la cantidad guardada cambia (la key la incluye).
  const [valor, setValor] = useState(String(linea.cantidad));
  const guardar = async () => {
    const ok = await onGuardar(valor);
    if (!ok) setValor(String(linea.cantidad));
  };
  return (
    <li className="ped-linea">
      <FotoConsumible item={linea.item ?? linea} size={40} />
      <span className="ped-linea-txt">
        <span>{linea.descripcion}</span>
        <small>{[linea.codigoEtiqueta, linea.codigoProveedor ? `Cód. ${linea.codigoProveedor}` : null].filter(Boolean).join(" · ")}</small>
      </span>
      <span className="ped-cant">
        <input
          className="ui-input ped-num"
          inputMode="decimal"
          value={valor}
          disabled={ocupado}
          aria-label={`Cantidad de ${linea.descripcion}`}
          onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
          onBlur={guardar}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        />
        <small>{linea.unidad_compra}{linea.factor > 1 ? ` x${fmtCantidad(linea.factor)}` : ""}</small>
      </span>
      <span className="ped-sub ped-num">{linea.subtotal == null ? <span className="ped-dim">sin precio</span> : fmtPesos(linea.subtotal)}</span>
      <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={onQuitar} disabled={ocupado} aria-label={`Sacar ${linea.descripcion}`} title="Sacar del carrito"><X size={16} /></button>
    </li>
  );
}
