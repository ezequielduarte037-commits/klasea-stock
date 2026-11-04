import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, Copy, FileSpreadsheet, Minus, PackageCheck, Pencil, Plus, RefreshCw, Search, Send, ShoppingCart, Sparkles, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { descargarXlsx } from "@/features/compras/xlsx";
import { fetchCatalogo, fmtCantidad, fmtPesos, indexarCodigos, normalizarCodigo } from "@/features/consumibles/api";
import { claveDia, coincideBusqueda, compararNatural, unidadEnTexto } from "../conteo/conteoCalculos";
import { armarPedidoSugerido, necesitaReponer } from "../stock/reposicion";
import FotoConsumible from "../FotoConsumible";
import { conPlazoLectura } from "../lecturas";
import {
  agregarAlCarrito, cambiarCantidad, cerrarPedido, confirmarPedido, corregirPedido, fetchPedidos,
  obtenerCarrito, quitarRenglon, reabrirPedido, vaciarCarrito,
} from "./pedidosApi";
import {
  ETIQUETA_ESTADO, PROVEEDOR_POR_DEFECTO, cantidadTexto, estadoDePedido, filasExcel,
  renglonDesdeItem, renglonesParaMostrar, textoWhatsApp, totalDePedido,
} from "./pedidosLogica";
import { CSS_PEDIDOS } from "./pedidosEstilos";
import { useVerPrecios } from "../verPrecios";

/**
 * Pedidos — el pañol arma el pedido a Rebollar (u otro proveedor) como en un
 * almacén: todos los productos a la vista, como en Stock, y se van tocando los
 * que hacen falta. No depende del stock mínimo. El carrito es uno por sede y
 * proveedor y lo comparte todo el pañol. Al confirmarlo queda como pedido
 * hecho, se manda por WhatsApp o Excel, y cuando llega la mercadería Ingresos
 * lo recibe con los renglones cargados.
 */

const FILTROS = [
  { key: "todos", label: "Todos" },
  { key: "proveedor", label: "De este proveedor" },
  { key: "bajo", label: "Debajo del mínimo" },
  { key: "carrito", label: "En el carrito" },
];
const TANDA = 120;
const TONO = { esperando: "azul", parcial: "violeta", completo: "verde" };
const fechaHora = (iso) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const archivo = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const mismoProveedor = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

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
  const verPrecios = useVerPrecios();
  const toast = useToast();
  const confirmar = useConfirm();
  const [, setParams] = useSearchParams();
  const buscarRef = useRef(null);
  const carritoRef = useRef(null);

  const [catalogo, setCatalogo] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [recibidos, setRecibidos] = useState(() => new Map());
  const [conIngresos, setConIngresos] = useState(() => new Set());
  const [error, setError] = useState("");
  const [proveedor, setProveedor] = useState(PROVEEDOR_POR_DEFECTO);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [rubro, setRubro] = useState("");
  const [tope, setTope] = useState(TANDA);
  const [ocupado, setOcupado] = useState(false);
  const [tocando, setTocando] = useState(() => new Set()); // materiales con un cambio en curso
  const [nota, setNota] = useState("");
  const [abierto, setAbierto] = useState(null);
  const [editando, setEditando] = useState(null);

  const cargarPedidos = useCallback(async () => {
    const r = await fetchPedidos(sede, { conHistorial: true });
    setPedidos(r.pedidos);
    setRecibidos(r.recibidos);
    setConIngresos(r.conIngresos);
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
  const rubros = useMemo(() => [...new Set((catalogo ?? []).map((i) => i.rubro).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [catalogo]);

  const carrito = pedidos.find((p) => p.estado === "borrador" && mismoProveedor(p.proveedor, proveedor)) ?? null;
  const otrosCarritos = pedidos.filter((p) => p.estado === "borrador" && p !== carrito && (p.items ?? []).length);
  const lineas = useMemo(() => (carrito ? renglonesParaMostrar(carrito, porId) : []), [carrito, porId]);
  const enCarrito = useMemo(() => new Map(lineas.map((l) => [l.material_id, l])), [lineas]);
  const { total, sinCosto } = totalDePedido(lineas);
  const hechos = pedidos.filter((p) => p.estado !== "borrador");

  const stockDe = (i) => i.stockPorSede?.[sede]?.stock ?? null;
  const pasa = useCallback((i, key) => {
    if (key === "proveedor") return mismoProveedor(i.config?.proveedor_nombre, proveedor);
    if (key === "bajo") return necesitaReponer({ stock: i.stockPorSede?.[sede]?.stock ?? 0, minimo: i.stockMinimo });
    if (key === "carrito") return enCarrito.has(i.id);
    return true;
  }, [proveedor, sede, enCarrito]);
  const cuentas = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.key, (catalogo ?? []).filter((i) => pasa(i, f.key)).length])), [catalogo, pasa]);
  const visibles = useMemo(() => (catalogo ?? [])
    .filter((i) => pasa(i, filtro) && (!rubro || i.rubro === rubro) && coincideBusqueda(i, busqueda))
    .sort((a, b) => compararNatural(a.descripcion, b.descripcion)), [catalogo, filtro, rubro, busqueda, pasa]);

  // Cambios del carrito: se ven al toque y se guardan atrás.
  const aplicarRenglon = (pedidoId, renglon) => setPedidos((prev) => prev.map((p) => (p.id !== pedidoId ? p : {
    ...p,
    items: (p.items ?? []).some((r) => r.id === renglon.id)
      ? p.items.map((r) => (r.id === renglon.id ? renglon : r))
      : [...(p.items ?? []), renglon],
  })));
  const sacarRenglon = (renglonId) => setPedidos((prev) => prev.map((p) => ({ ...p, items: (p.items ?? []).filter((r) => r.id !== renglonId) })));

  const conMaterial = async (materialId, fn) => {
    if (tocando.has(materialId)) return;
    setTocando((s) => new Set(s).add(materialId));
    try {
      await fn();
    } catch (e) {
      toast.error(e?.message || "No se pudo guardar el carrito.");
      await cargarPedidos().catch(() => {});
    } finally {
      setTocando((s) => { const n = new Set(s); n.delete(materialId); return n; });
    }
  };

  const asegurarCarrito = async () => {
    if (carrito) return carrito;
    const c = await obtenerCarrito(sede, proveedor);
    setPedidos((prev) => (prev.some((p) => p.id === c.id) ? prev : [c, ...prev]));
    return c;
  };

  const sumar = (item, cantidad = 1) => conMaterial(item.id, async () => {
    const c = await asegurarCarrito();
    const renglon = await agregarAlCarrito(c.id, item, cantidad);
    aplicarRenglon(c.id, renglon);
  });

  const fijar = (linea, cantidad) => conMaterial(linea.material_id, async () => {
    if (!(cantidad > 0)) {
      await quitarRenglon(linea.id);
      sacarRenglon(linea.id);
      return;
    }
    const renglon = await cambiarCantidad(linea.id, cantidad);
    aplicarRenglon(carrito.id, renglon);
  });

  // El lector 2D escribe el código y manda Enter: si es un código, suma uno.
  const onBuscarEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const porCodigo = indice.get(normalizarCodigo(busqueda));
    if (porCodigo) {
      sumar(porCodigo);
      toast.success(`${porCodigo.descripcion}: sumado al carrito.`);
      setBusqueda("");
    } else if (visibles.length === 1) {
      sumar(visibles[0]);
      setBusqueda("");
    }
  };

  const sumarSugeridos = async () => {
    const sugeridas = armarPedidoSugerido(catalogo ?? [], sede)
      .filter((g) => mismoProveedor(g.proveedor, proveedor))
      .flatMap((g) => g.lineas)
      .filter((l) => !enCarrito.has(l.materialId) && l.unidadesCompra > 0);
    if (!sugeridas.length) {
      toast.info(`Ningún producto de ${proveedor} está en su mínimo o por debajo (o ya están en el carrito).`);
      return;
    }
    setOcupado(true);
    try {
      const c = await asegurarCarrito();
      for (const l of sugeridas) aplicarRenglon(c.id, await agregarAlCarrito(c.id, porId.get(l.materialId), l.unidadesCompra));
      toast.success(`${sugeridas.length} ${sugeridas.length === 1 ? "producto sumado" : "productos sumados"} desde el stock mínimo.`);
    } catch (e) {
      toast.error(e?.message || "No se pudieron sumar.");
      await cargarPedidos().catch(() => {});
    } finally {
      setOcupado(false);
    }
  };

  const vaciar = async () => {
    const ok = await confirmar({ title: "¿Vaciar el carrito?", message: `Se sacan los ${lineas.length} productos del pedido a ${proveedor}.`, confirmLabel: "Vaciar", tone: "danger" });
    if (!ok) return;
    setOcupado(true);
    try {
      await vaciarCarrito(carrito.id);
      setPedidos((prev) => prev.map((p) => (p.id === carrito.id ? { ...p, items: [] } : p)));
    } catch (e) {
      toast.error(e?.message || "No se pudo vaciar.");
    } finally {
      setOcupado(false);
    }
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
      filas: filasExcel(renglones, { conPrecios: verPrecios }).map((fila, i) => (i === 0 ? fila.map((v) => ({ v, s: { fuente: { b: true }, fondo: "E8EEF8" } })) : fila)),
    }]);
  };

  const confirmarCarrito = async () => {
    if (!carrito || !lineas.length) return;
    const ok = await confirmar({
      title: `¿Confirmar el pedido a ${proveedor}?`,
      message: `${lineas.length} ${lineas.length === 1 ? "producto" : "productos"} para el pañol ${sede}${verPrecios && total > 0 ? `, ${fmtPesos(total)} sin IVA estimado` : ""}. Queda como pedido hecho y se copia el texto para mandarlo por WhatsApp. Cuando llegue, se recibe desde Ingresos.`,
      confirmLabel: "Confirmar pedido",
    });
    if (!ok) return;
    setOcupado(true);
    try {
      const hecho = await confirmarPedido(carrito.id, nota);
      setNota("");
      const copiado = await copiar(textoWhatsApp({ pedido: hecho, renglones: renglonesParaMostrar(hecho, porId) }));
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
        <Cargando texto="Trayendo los productos…" />
      </div>
    );
  }

  return (
    <div className="ped">
      <style href="klasea-cns-pedidos" precedence="default">{CSS_PEDIDOS}</style>

      <div className="ped-barra">
        <label className="ped-barra-prov">
          <span className="ped-dim">Pedido a</span>
          <select className="ui-input" value={proveedor} onChange={(e) => setProveedor(e.target.value)} aria-label="Proveedor">
            {proveedores.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <button type="button" className="ui-btn" onClick={sumarSugeridos} disabled={ocupado} title="Suma los productos de este proveedor que están en su mínimo o por debajo">
          <Sparkles size={15} /> Sumar los que faltan
        </button>
        <button type="button" className="ui-btn ui-btn-icono" onClick={() => cargar().catch(() => toast.error("No se pudo actualizar."))} aria-label="Actualizar" title="Actualizar" disabled={!!editando}>
          <RefreshCw size={16} />
        </button>
        {otrosCarritos.length > 0 && (
          <span className="ped-dim ped-otros">También hay carrito para {otrosCarritos.map((p) => `${p.proveedor} (${p.items.length})`).join(", ")}</span>
        )}
      </div>

      <div className="ped-armado">
        <section className="ped-catalogo" aria-label="Productos para pedir">
          <div className="ped-filtros">
            <div className="ped-chips" role="group" aria-label="Filtro">
              {FILTROS.map((f) => (
                <button key={f.key} type="button" className={`ped-chip${filtro === f.key ? " is-activa" : ""}`} aria-pressed={filtro === f.key} onClick={() => { setFiltro(f.key); setTope(TANDA); }}>
                  {f.key === "proveedor" ? `De ${proveedor}` : f.label} <span className="ped-num">{cuentas[f.key]}</span>
                </button>
              ))}
            </div>
            <div className="ped-buscar">
              <Search size={16} className="ped-buscar-ico" />
              <input
                ref={buscarRef}
                className="ui-input"
                type="search"
                value={busqueda}
                placeholder="Buscar o escanear: nombre, código o código de Rebollar"
                autoComplete="off"
                enterKeyHint="search"
                onChange={(e) => { setBusqueda(e.target.value); setTope(TANDA); }}
                onKeyDown={onBuscarEnter}
                aria-label="Buscar producto o código"
              />
              {busqueda && <button type="button" className="ped-buscar-x" onClick={() => setBusqueda("")} aria-label="Borrar la búsqueda"><X size={15} /></button>}
            </div>
            <select className="ui-input ped-rubro" value={rubro} onChange={(e) => { setRubro(e.target.value); setTope(TANDA); }} aria-label="Rubro">
              <option value="">Todos los rubros</option>
              {rubros.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <ul className="ped-productos ui-card">
            {visibles.slice(0, tope).map((i) => {
              const linea = enCarrito.get(i.id);
              const stock = stockDe(i);
              const bajo = necesitaReponer({ stock: stock ?? 0, minimo: i.stockMinimo });
              const r = linea ?? renglonDesdeItem(i, 1);
              const ocupadoItem = tocando.has(i.id);
              return (
                <li key={i.id} className={`ped-prod${linea ? " is-elegido" : ""}`}>
                  <button type="button" className="ped-prod-info" onClick={() => !linea && sumar(i)} disabled={ocupadoItem || !!linea} title={linea ? undefined : "Sumar al carrito"}>
                    <FotoConsumible item={i} size={40} />
                    <span className="ped-prod-txt">
                      <span className="ped-prod-desc">{i.descripcion}</span>
                      <span className="ped-prod-meta">
                        {[i.codigoEtiqueta, i.config?.proveedor_codigo ? `Cód. ${i.config.proveedor_codigo}` : null, i.rubro].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                  <span className="ped-prod-stock" title={`Stock en ${sede}`}>
                    {stock == null
                      ? <span className="ped-dim">sin contar</span>
                      : <><b className={`ped-num${bajo ? " is-bajo" : ""}`}>{fmtCantidad(stock)}</b> <small className="ped-dim">{unidadEnTexto(i.unidad, stock)}</small></>}
                    {i.stockMinimo ? <small className="ped-dim"> · mín. {fmtCantidad(i.stockMinimo)}</small> : null}
                  </span>
                  {linea ? (
                    <span className="ped-paso" aria-label={`Cantidad de ${i.descripcion} en el carrito`}>
                      <button type="button" className="ui-btn ui-btn-icono" onClick={() => fijar(linea, Number(linea.cantidad) - 1)} disabled={ocupadoItem} aria-label="Uno menos"><Minus size={15} /></button>
                      <CantidadEditable linea={linea} disabled={ocupadoItem} onFijar={(n) => fijar(linea, n)} />
                      <button type="button" className="ui-btn ui-btn-icono" onClick={() => fijar(linea, Number(linea.cantidad) + 1)} disabled={ocupadoItem} aria-label="Uno más"><Plus size={15} /></button>
                      <small className="ped-dim ped-paso-u">{r.unidad_compra}{r.factor > 1 ? ` x${fmtCantidad(r.factor)}` : ""}</small>
                    </span>
                  ) : (
                    <button type="button" className="ui-btn ped-sumar" onClick={() => sumar(i)} disabled={ocupadoItem}>
                      <Plus size={15} /> Pedir
                      <small className="ped-dim">{r.unidad_compra}{r.factor > 1 ? ` x${fmtCantidad(r.factor)}` : ""}</small>
                    </button>
                  )}
                </li>
              );
            })}
            {!visibles.length && <li className="ped-sin">No hay productos con este filtro.</li>}
          </ul>
          {visibles.length > tope && (
            <button type="button" className="ui-btn ped-mas" onClick={() => setTope((t) => t + TANDA)}>
              Mostrar más ({visibles.length - tope} restantes)
            </button>
          )}
        </section>

        <aside ref={carritoRef} className="ped-carrito ui-card" aria-label="Carrito del pedido">
          <header className="ped-carrito-cab">
            <h2><ShoppingCart size={17} /> Carrito · {proveedor}</h2>
            <span className="ped-dim">{lineas.length} {lineas.length === 1 ? "producto" : "productos"}</span>
          </header>
          {lineas.length === 0 ? (
            <p className="ped-vacio">Tocá los productos de la lista para sumarlos. Con el lector, escaneá la etiqueta en el buscador.</p>
          ) : (
            <ul className="ped-lineas">
              {lineas.map((l) => (
                <li key={l.id} className="ped-linea">
                  <span className="ped-linea-txt">
                    <span>{l.descripcion}</span>
                    <small className="ped-dim">{l.unidad_compra || l.unidad}{l.factor > 1 ? ` x${fmtCantidad(l.factor)}` : ""}{!verPrecios ? "" : l.subtotal != null ? ` · ${fmtPesos(l.subtotal)}` : " · sin precio"}</small>
                  </span>
                  <CantidadEditable linea={l} disabled={ocupado || tocando.has(l.material_id)} onFijar={(n) => fijar(l, n)} />
                  <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => fijar(l, 0)} disabled={tocando.has(l.material_id)} aria-label={`Sacar ${l.descripcion}`} title="Sacar del carrito"><X size={15} /></button>
                </li>
              ))}
            </ul>
          )}
          {lineas.length > 0 && (
            <div className="ped-carrito-pie">
              {verPrecios && <div className="ped-total">
                {total > 0 ? <><b className="ped-num">{fmtPesos(total)}</b> <span className="ped-dim">sin IVA estimado</span></> : <span className="ped-dim">Sin precios cargados</span>}
                {sinCosto > 0 && total > 0 && <span className="ped-dim"> · {sinCosto} sin precio</span>}
              </div>}
              <input className="ui-input" value={nota} maxLength={200} placeholder="Nota para el pedido (opcional)" onChange={(e) => setNota(e.target.value)} aria-label="Nota del pedido" />
              <button type="button" className="ui-btn ui-btn-primario ped-confirmar" onClick={confirmarCarrito} disabled={ocupado || tocando.size > 0 || !!editando}><Send size={15} /> Confirmar pedido</button>
              <div className="ped-carrito-btns">
                <button type="button" className="ui-btn" onClick={() => copiarWhatsApp(carrito, lineas)}><Copy size={15} /> Copiar</button>
                <button type="button" className="ui-btn ui-btn-fantasma" onClick={vaciar} disabled={ocupado}>Vaciar</button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {lineas.length > 0 && (
        <button type="button" className="ped-flotante ui-btn ui-btn-primario" onClick={() => carritoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          <ShoppingCart size={16} /> Ver carrito · {lineas.length}{verPrecios && total > 0 ? ` · ${fmtPesos(total)}` : ""}
        </button>
      )}

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
              const enEdicion = editando === p.id;
              const editable = p.estado === "pedido" && !renglones.some((r) => conIngresos.has(r.id));
              const pendientes = renglones.filter((r) => !r.completo).length;
              return (
                <li key={p.id} className="ped-item ui-card">
                  <button type="button" className="ped-item-cab" onClick={() => setAbierto(exp ? null : p.id)} aria-expanded={exp} disabled={!!editando}>
                    {exp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span className="ped-item-tit">
                      <span>Pedido N° <span className="ped-num">{p.numero}</span> · {p.proveedor}</span>
                      <small>{fechaHora(p.pedido_at || p.created_at)} · {renglones.length} {renglones.length === 1 ? "producto" : "productos"}{verPrecios && totalP > 0 ? ` · ${fmtPesos(totalP)} sin IVA` : ""}{estado === "parcial" ? ` · faltan ${pendientes}` : ""}</small>
                    </span>
                    <span className="ui-chip ped-estado" data-tono={TONO[estado]}>{estado === "completo" ? <Check size={13} /> : null}{ETIQUETA_ESTADO[estado] ?? estado}</span>
                  </button>
                  {exp && enEdicion && (
                    <EditarPedido
                      key={p.id} pedido={p} renglones={renglones} catalogo={catalogo}
                      onCancelar={() => setEditando(null)}
                      onGuardar={async (version, items, notaEditada) => {
                        const cambios = await corregirPedido(p.id, version, items, notaEditada);
                        setPedidos((prev) => prev.map((actual) => actual.id === p.id ? { ...actual, ...cambios } : actual));
                        setEditando(null);
                        toast.success(`Pedido N° ${p.numero} actualizado.`);
                      }}
                    />
                  )}
                  {exp && !enEdicion && (
                    <div className="ped-item-cuerpo">
                      <table className="ped-tabla">
                        <thead>
                          <tr><th>Producto</th><th className="is-num">Pedido</th><th className="is-num">Llegó</th>{verPrecios && <th className="is-num">Subtotal</th>}</tr>
                        </thead>
                        <tbody>
                          {renglones.map((r) => (
                            <tr key={r.id}>
                              <td>{r.descripcion}{r.codigoProveedor ? <span className="ped-dim"> · {r.codigoProveedor}</span> : null}</td>
                              <td className="is-num ped-num">{cantidadTexto(r)}</td>
                              <td className={`is-num ped-num ${r.completo ? "is-ok" : r.recibido > 0 ? "is-falta" : "ped-dim"}`}>{fmtCantidad(r.recibido)}</td>
                              {verPrecios && <td className="is-num ped-num">{r.subtotal == null ? "—" : fmtPesos(r.subtotal)}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {p.nota && <p className="ped-dim" style={{ margin: "10px 0 0", fontSize: 13 }}>Nota: {p.nota}</p>}
                      <div className="ped-acciones">
                        {editable && (
                          <button type="button" className="ui-btn" onClick={() => setEditando(p.id)} disabled={ocupado}><Pencil size={15} /> Editar pedido</button>
                        )}
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

function EditarPedido({ pedido, renglones, catalogo, onCancelar, onGuardar }) {
  const [version] = useState(pedido.updated_at);
  const [originales] = useState(() => new Map(renglones.map((r) => [r.material_id, r])));
  const [filas, setFilas] = useState(() => renglones.map((r) => ({ ...r, cantidad: String(r.cantidad) })));
  const [nota, setNota] = useState(pedido.nota ?? "");
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const ids = new Set(filas.map((r) => r.material_id));
  const sugerencias = busqueda.trim().length < 2 ? [] : catalogo
    .filter((i) => !ids.has(i.id) && coincideBusqueda(i, busqueda))
    .slice(0, 8);

  const agregar = (item) => {
    const fila = originales.get(item.id) ?? { ...renglonDesdeItem(item), descripcion: item.descripcion };
    setFilas((prev) => [...prev, { ...fila, cantidad: String(fila.cantidad) }]);
    setBusqueda("");
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (guardando) return;
    const items = filas.map(({ material_id, cantidad, unidad_compra, factor, costo_compra_ars }) => ({
      material_id, cantidad: Number(cantidad.trim().replace(",", ".")), unidad_compra, factor, costo_compra_ars,
    }));
    if (!items.length || items.some((r) => !Number.isFinite(r.cantidad) || r.cantidad <= 0)) {
      setError("Dejá al menos un producto y cargá cantidades mayores a cero.");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      await onGuardar(version, items, nota);
    } catch (err) {
      setError(err.message || "No se pudo guardar la corrección.");
      setGuardando(false);
    }
  };

  return (
    <form className="ped-item-cuerpo" aria-label={`Editar pedido N° ${pedido.numero}`} onSubmit={guardar}>
      <p className="ped-dim" style={{ margin: "4px 0 10px", fontSize: 13 }}>
        Corregí las cantidades, los productos o la nota. Si ya lo enviaste al proveedor, podés volver a copiar el pedido corregido.
      </p>
      <ul className="ped-lineas" style={{ marginBottom: 10 }}>
        {filas.map((r) => (
          <li className="ped-linea" key={r.material_id}>
            <span className="ped-linea-txt">
              {r.descripcion}
              <small className="ped-dim">{r.unidad_compra || r.unidad}{r.factor > 1 ? ` x${fmtCantidad(r.factor)}` : ""}</small>
            </span>
            <input
              className="ui-input ped-num" style={{ width: 90, textAlign: "right" }} inputMode="decimal"
              aria-label={`Cantidad de ${r.descripcion}`} value={r.cantidad} disabled={guardando}
              onChange={(e) => setFilas((prev) => prev.map((l) => l.material_id === r.material_id ? { ...l, cantidad: e.target.value } : l))}
            />
            <button type="button" className="ui-btn ui-btn-icono ui-btn-fantasma" aria-label={`Quitar ${r.descripcion}`} disabled={guardando}
              onClick={() => setFilas((prev) => prev.filter((l) => l.material_id !== r.material_id))}><X size={15} /></button>
          </li>
        ))}
      </ul>
      <div className="ped-buscar" style={{ marginBottom: 8 }}>
        <Search size={16} className="ped-buscar-ico" />
        <input
          type="search" className="ui-input" placeholder="Buscar un producto para agregar" aria-label="Buscar un producto para agregar"
          value={busqueda} disabled={guardando} onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        />
      </div>
      {busqueda.trim().length >= 2 && (
        <ul className="ped-lineas" style={{ marginBottom: 8 }}>
          {sugerencias.map((i) => (
            <li className="ped-linea" key={i.id}>
              <span className="ped-linea-txt">{i.descripcion}<small className="ped-dim">{i.codigoEtiqueta}</small></span>
              <button type="button" className="ui-btn" onClick={() => agregar(i)} disabled={guardando}><Plus size={15} /> Agregar</button>
            </li>
          ))}
          {!sugerencias.length && <li className="ped-linea ped-dim">No hay productos para agregar con esa búsqueda.</li>}
        </ul>
      )}
      <input
        className="ui-input" style={{ width: "100%", boxSizing: "border-box" }}
        aria-label="Nota del pedido" placeholder="Nota para el pedido (opcional)" maxLength={200}
        value={nota} disabled={guardando} onChange={(e) => setNota(e.target.value)}
      />
      {error && <p role="alert" style={{ color: "var(--red)", marginBottom: 0 }}>{error}</p>}
      <div className="ped-acciones">
        <button type="submit" className="ui-btn ui-btn-primario" disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
        <button type="button" className="ui-btn ui-btn-fantasma" onClick={onCancelar} disabled={guardando}>Cancelar</button>
      </div>
    </form>
  );
}

/** La cantidad del carrito, editable a mano (se guarda al salir del campo). */
function CantidadEditable({ linea, disabled, onFijar }) {
  // Se monta de nuevo cuando cambia la cantidad guardada (la key la incluye).
  return <CampoCantidad key={`${linea.id}-${linea.cantidad}`} linea={linea} disabled={disabled} onFijar={onFijar} />;
}

function CampoCantidad({ linea, disabled, onFijar }) {
  const [valor, setValor] = useState(String(linea.cantidad));
  const guardar = async () => {
    const texto = valor.trim();
    const n = /^\d+(?:[.,]\d+)?$/.test(texto) ? Number(texto.replace(",", ".")) : NaN;
    if (Number.isFinite(n) && n !== Number(linea.cantidad)) await onFijar(n);
    setValor(String(linea.cantidad));
  };
  return (
    <input
      className="ui-input ped-num ped-paso-n"
      inputMode="decimal"
      value={valor}
      disabled={disabled}
      aria-label={`Cantidad de ${linea.descripcion}`}
      title="Editar cantidad · Enter para guardar"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValor(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}
