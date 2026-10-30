import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileScan, PackageCheck, Plus, RefreshCw, ScanLine, Trash2, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  anularMovimiento,
  fetchCatalogo,
  fetchMovimientos,
  fmtCantidad,
  fmtPesos,
  guardarConfig,
  indexarCodigos,
  normalizarCodigo,
  insertarMovimientos,
} from "@/features/consumibles/api";
import { DIA_MS, coincideBusqueda, unidadEnTexto } from "../conteo/conteoCalculos";
import { actualizarLinea, agregarAlRemito, agruparIngresos, calcularLinea, cambiosDeConfig, remitoRepetido, totalRemito } from "./ingresoCalculos";
import { CSS_INGRESOS } from "./ingresosEstilos";
import { prepararIngreso } from "./ingresoRegistro";
import { conPlazoLectura } from "../lecturas";
import { leerPresupuestoConIA } from "@/features/materiales/api";
import { incorporarLecturaRemito, lineaDesdeRenglonRemito } from "./remitoIA";
import { useSearchParams } from "react-router-dom";
import { fetchPedidos } from "../pedidos/pedidosApi";
import { lineasDePedidoRecibido, pedidosPorRecibir } from "./pedidoRecibido";
import { useVerPrecios } from "../verPrecios";
import ScannerRemito from "./ScannerRemito";
import { archiveScannerFile } from "@/features/panol/scannerBridge";

/**
 * Ingresos — cargar un remito del proveedor (el primero, de Rebollar, llega el
 * martes 13 o miércoles 14/10/2026).
 *
 * Número de remito → escanear o buscar cada producto → cantidad como viene
 * (cajas × unidades por caja = unidades de stock) → costo (por defecto el de
 * la config, editable) → Confirmar. Lo que se carga queda como borrador en el
 * equipo hasta confirmar, por si se corta la luz o se cierra la pestaña.
 *
 * Si un producto viene en cajas y la config no lo sabía, se puede recordar
 * (unidad de compra y factor) para la próxima y para el pedido sugerido.
 *
 * Si lo que llegó es de un pedido hecho en la pestaña Pedidos, "Recibir" carga
 * lo que falta de cada renglón. Cada ingreso queda enganchado a su renglón
 * (pedido_item_id), así el pedido sabe qué llegó y qué falta.
 */

const BORRADOR_KEY = "klasea.consumibles.ingreso.borrador";
const VACIO = { remito: "", proveedor: "Rebollar", nota: "", lineas: [], pedidoId: null, pedidoTitulo: null, sinEmparejar: [], escaneos: [] };

function leerBorrador(sede) {
  try {
    const b = JSON.parse(window.localStorage.getItem(`${BORRADOR_KEY}.${sede}`) || "null");
    return b && Array.isArray(b.lineas) ? { ...VACIO, ...b } : VACIO;
  } catch {
    return VACIO;
  }
}

function escribirBorrador(sede, b) {
  try {
    const vacio = !b.remito && !b.nota && !b.lineas.length && !b.sinEmparejar?.length && !b.escaneos?.length;
    if (vacio) window.localStorage.removeItem(`${BORRADOR_KEY}.${sede}`);
    else window.localStorage.setItem(`${BORRADOR_KEY}.${sede}`, JSON.stringify(b));
    return true;
  } catch { return false; }
}

const fechaHora = (iso) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function IngresosTab({ sede }) {
  return <Ingresos key={sede} sede={sede} />;
}

function Ingresos({ sede }) {
  const verPrecios = useVerPrecios();
  const toast = useToast();
  const confirmar = useConfirm();
  const buscarRef = useRef(null);
  const enviandoRef = useRef(false);

  const [catalogo, setCatalogo] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [borrador, setBorrador] = useState(() => leerBorrador(sede));
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(null); // lote expandido en el historial
  const [anulando, setAnulando] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [pedidos, setPedidos] = useState([]); // pedidos al proveedor con algo por llegar
  const [params, setParams] = useSearchParams();
  const pedidoPedido = params.get("pedido");

  const cargarHistorial = useCallback(async () => {
    const filas = await fetchMovimientos({
      sede,
      tipos: ["ingreso"],
      desde: new Date(Date.now() - 120 * DIA_MS).toISOString(),
      incluirAnulados: true,
      limite: 3000,
    });
    setHistorial(filas);
  }, [sede]);

  const cargar = useCallback(async () => {
    const [cat] = await conPlazoLectura(Promise.all([fetchCatalogo({ sede }), cargarHistorial()]));
    setCatalogo(cat);
    // Sin pedidos se carga el remito a mano como siempre: si esta lectura falla no frena el ingreso.
    fetchPedidos(sede)
      .then(({ pedidos: lista, recibidos }) => setPedidos(pedidosPorRecibir(lista, recibidos)))
      .catch(() => setPedidos([]));
    setErrorCarga("");
  }, [sede, cargarHistorial]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        await cargar();
      } catch (err) {
        if (vivo) setErrorCarga(err.message || String(err));
      }
    })();
    return () => { vivo = false; };
  }, [cargar]);

  useEffect(() => { escribirBorrador(sede, borrador); }, [sede, borrador]);

  const indice = useMemo(() => indexarCodigos(catalogo ?? []), [catalogo]);
  const resultados = useMemo(() => {
    const q = busqueda.trim();
    if (!q || !catalogo) return [];
    return catalogo.filter((i) => coincideBusqueda(i, q)).slice(0, 8);
  }, [busqueda, catalogo]);
  const grupos = useMemo(() => agruparIngresos(historial ?? []), [historial]);
  const repetido = remitoRepetido(grupos, borrador.remito);
  const { total, sinCosto, validas } = totalRemito(borrador.lineas);

  const cambiar = (cambio) => setBorrador((b) => ({ ...b, ...cambio }));
  const cambiarLinea = (key, cambio) => setBorrador((b) => ({ ...b, lineas: b.lineas.map((l) => (l.key === key ? actualizarLinea(l, cambio) : l)) }));
  const quitarLinea = (key) => setBorrador((b) => ({ ...b, lineas: b.lineas.filter((l) => l.key !== key) }));

  // Remito leído por IA: lo emparejado entra solo; lo dudoso queda en esta lista
  // hasta que alguien elige el producto o lo descarta.
  const [leyendo, setLeyendo] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [errorLectura, setErrorLectura] = useState("");
  const lecturaRef = useRef(false);
  const sinEmparejar = borrador.sinEmparejar || [];
  const setSinEmparejar = (cambio) => setBorrador((b) => ({ ...b, sinEmparejar: typeof cambio === "function" ? cambio(b.sinEmparejar || []) : cambio }));
  const archivoRemitoRef = useRef(null);
  const ocupado = leyendo || capturando;

  const leerRemito = async (archivo, escaneo = null) => {
    if (!archivo || lecturaRef.current || guardando || borrador.envio) return;
    if (escaneo && borrador.escaneos?.includes(escaneo.id)) {
      toast.warning("Ese escaneo ya está cargado en este borrador.");
      return;
    }
    lecturaRef.current = true;
    setLeyendo(true);
    setErrorLectura("");
    try {
      const leido = await leerPresupuestoConIA({ file: archivo, tipoEsperado: "remito", proveedor: borrador.proveedor || "Rebollar" });
      // No se toca el borrador hasta tener una lectura completa y poder guardarla.
      const { borrador: siguiente, cantidad, cargados } = incorporarLecturaRemito(borrador, leido, catalogo ?? [], escaneo);
      if (!escribirBorrador(sede, siguiente)) throw new Error("No se pudo guardar la lectura en esta PC. Liberá espacio y reintentá; el escaneo sigue en Pendientes.");
      setBorrador(siguiente);
      const dudas = cantidad - cargados;
      toast.success(`Remito leído: ${cargados} de ${cantidad} renglones cargados${dudas ? `, ${dudas} para revisar` : ""}. Revisá cantidades antes de confirmar.`);
    } catch (e) {
      const mensaje = e?.message || "No se pudo leer el remito.";
      setErrorLectura(mensaje);
      toast.error(mensaje);
    } finally {
      lecturaRef.current = false;
      setLeyendo(false);
      if (archivoRemitoRef.current) archivoRemitoRef.current.value = "";
    }
  };

  const resolverRenglon = (idx, item) => {
    const x = sinEmparejar[idx];
    if (item) {
      setBorrador((b) => ({ ...b, lineas: [...b.lineas, lineaDesdeRenglonRemito(item, x.renglon)] }));
    }
    setSinEmparejar((l) => l.filter((_, k) => k !== idx));
  };

  // Recibir un pedido: sus renglones entran ya cargados, con lo que se pidió.
  // Quien recibe sólo corrige lo que llegó distinto y escribe el n° de remito.
  const recibirPedido = async (pedido) => {
    if (ocupado || guardando || borrador.envio) return;
    if (borrador.pedidoId === pedido.id) return;
    if (borrador.lineas.length || borrador.remito || sinEmparejar.length) {
      const ok = await confirmar({
        title: "¿Reemplazar lo que está cargado?",
        message: "Hay un remito a medio cargar. Si recibís este pedido se reemplaza.",
        confirmLabel: "Recibir el pedido",
        tone: "danger",
      });
      if (!ok) return;
    }
    const { lineas, sinCatalogo } = lineasDePedidoRecibido(pedido, catalogo ?? []);
    if (!lineas.length) {
      toast.warning("No pudimos cargar ningún renglón de ese pedido: los productos no están en el catálogo.");
      return;
    }
    setBorrador({
      ...VACIO,
      proveedor: pedido.proveedor || borrador.proveedor,
      lineas,
      pedidoId: pedido.id,
      pedidoTitulo: `Pedido N° ${pedido.numero}`,
    });
    setSinEmparejar([]);
    if (sinCatalogo) toast.warning(`${sinCatalogo} ${sinCatalogo === 1 ? "renglón no está" : "renglones no están"} en el catálogo y no se cargaron.`);
  };

  // Desde Pedidos ("Recibir en Ingresos") llega con ?pedido=: se abre solo.
  useEffect(() => {
    if (!pedidoPedido || !catalogo) return;
    const pedido = pedidos.find((p) => p.id === pedidoPedido);
    if (!pedido) return;
    setParams((prev) => { const n = new URLSearchParams(prev); n.delete("pedido"); return n; }, { replace: true });
    recibirPedido(pedido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoPedido, pedidos, catalogo]);

  const agregar = (item) => {
    setBorrador((b) => ({ ...b, lineas: agregarAlRemito(b.lineas, item) }));
    setBusqueda("");
    buscarRef.current?.focus();
  };

  // El lector 2D escribe el código y manda Enter.
  const onBuscarEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const codigo = normalizarCodigo(busqueda);
    const porCodigo = codigo ? indice.get(codigo) : null;
    if (porCodigo) agregar(porCodigo);
    else if (resultados.length === 1) agregar(resultados[0]);
    else if (!resultados.length && busqueda.trim()) toast.warning(`No encontramos «${busqueda.trim()}». Si es nuevo, dalo de alta en Catálogo o en Conteo.`);
  };

  const confirmarIngreso = async () => {
    if (enviandoRef.current || guardando || ocupado || lecturaRef.current) return;
    if (sinEmparejar.length) {
      toast.warning("Resolvé o descartá los renglones para revisar antes de confirmar.");
      return;
    }
    if (borrador.lineas.some((l) => l.presentacionPendiente)) {
      toast.warning("Elegí si la cantidad del remito viene por unidad o en cajas en los renglones marcados.");
      return;
    }
    const invalidas = borrador.lineas.filter((l) => !calcularLinea(l).valida);
    if (!validas) {
      toast.warning("Agregá al menos un producto con su cantidad.");
      return;
    }
    if (invalidas.length) {
      toast.warning(`Revisá ${invalidas.length === 1 ? "una línea" : `${invalidas.length} líneas`}: falta la cantidad o cuántas trae cada caja.`);
      return;
    }
    enviandoRef.current = true;
    setGuardando(true);
    try {
    if (repetido && !borrador.envio) {
      const ok = await confirmar({
        title: "Ese remito ya se cargó",
        message: `El remito ${repetido.remito} se cargó el ${fechaHora(repetido.fecha)}. Si lo cargás de nuevo, el stock entra dos veces.`,
        confirmLabel: "Cargarlo igual",
        tone: "danger",
      });
      if (!ok) return;
    }
    const ok = borrador.envio || await confirmar({
      title: "¿Confirmar el ingreso?",
      message: `${validas} ${validas === 1 ? "producto" : "productos"}${borrador.remito.trim() ? ` del remito ${borrador.remito.trim()}` : " sin número de remito"} entran al stock de ${sede}.${verPrecios && total > 0 ? ` Total ${fmtPesos(total)} sin IVA.` : ""}`,
      confirmLabel: "Confirmar ingreso",
    });
    if (!ok) return;

      const envio = prepararIngreso(borrador, sede);
      const pendiente = { ...borrador, envio };
      if (!escribirBorrador(sede, pendiente)) throw new Error("El equipo no pudo guardar el remito para reintentar. Liberá espacio antes de confirmar.");
      setBorrador(pendiente);
      await insertarMovimientos(envio.filas);

      // Recién con el stock confirmado se archiva el original en esta PC.
      const archivos = await Promise.allSettled((borrador.escaneos || []).map(archiveScannerFile));
      if (archivos.some((r) => r.status === "rejected")) toast.warning("El ingreso se guardó, pero algún original sigue en Pendientes del escáner. No vuelvas a ingresarlo.");

      // Lo que se aprendió del remito (viene en cajas de N) queda para la próxima.
      const aprender = borrador.lineas.map((l) => [l.materialId, cambiosDeConfig(l)]).filter(([, c]) => c);
      const fallidos = [];
      for (const [id, cambios] of aprender) {
        try { await guardarConfig(id, cambios); } catch { fallidos.push(id); }
      }

      toast.success(`Ingreso cargado: ${validas} ${validas === 1 ? "producto" : "productos"} en ${sede}.${borrador.pedidoId ? " El pedido quedó al día." : ""}`);
      if (fallidos.length) toast.warning("No se pudo recordar cómo vienen algunas cajas; cargalo en Catálogo.");
      const limpio = { ...VACIO, proveedor: borrador.proveedor };
      // Si falla limpiar el borrador, quedan los mismos ids: tampoco duplica al volver.
      escribirBorrador(sede, limpio);
      setBorrador(limpio);
      await cargar().catch(() => toast.warning("El ingreso se guardó. No pudimos actualizar la pantalla; tocá Actualizar."));
    } catch (err) {
      toast.error(`No pudimos confirmar el ingreso: ${err.message || err}. Reintentá desde este mismo remito.`);
    } finally {
      enviandoRef.current = false;
      setGuardando(false);
    }
  };

  const descartar = async () => {
    const ok = await confirmar({ title: "¿Descartar lo cargado?", message: "Se borra el borrador de este remito.", confirmLabel: "Descartar", tone: "danger" });
    if (ok) setBorrador({ ...VACIO, proveedor: borrador.proveedor });
  };

  const anularCarga = async (g) => {
    if (!motivo.trim()) {
      toast.warning("Escribí por qué se anula.");
      return;
    }
    setGuardando(true);
    try {
      for (const f of g.filas.filter((x) => !x.anulado_at)) await anularMovimiento(f.id, motivo);
      toast.success("Ingreso anulado. El stock ya se corrigió.");
      setAnulando(null);
      setMotivo("");
      await cargar();
    } catch (err) {
      toast.error(`No se pudo anular todo: ${err.message || err}`);
      await cargarHistorial().catch(() => {});
    } finally {
      setGuardando(false);
    }
  };

  if (errorCarga && !catalogo) {
    return (
      <div className="ing ing-root">
        <style href="klasea-cns-ingresos" precedence="default">{CSS_INGRESOS}</style>
        <div className="ing-vacio ui-card">
          <p>No se pudo traer el catálogo.</p>
          <p className="ing-dim">{errorCarga}</p>
          <button type="button" className="ui-btn ui-btn-primario" onClick={() => cargar().catch((e) => setErrorCarga(e.message))}>Probar de nuevo</button>
        </div>
      </div>
    );
  }
  if (!catalogo) {
    return (
      <div className="ing ing-root">
        <style href="klasea-cns-ingresos" precedence="default">{CSS_INGRESOS}</style>
        <Cargando texto="Trayendo el catálogo…" />
      </div>
    );
  }

  return (
    <div className="ing ing-root">
      <style href="klasea-cns-ingresos" precedence="default">{CSS_INGRESOS}</style>

      <div className="ing-grilla">
        <section className="ing-carga ui-card" aria-label="Cargar un remito">
          <header className="ing-cab">
            <h2><PackageCheck size={18} /> Cargar un remito</h2>
            <span className="ing-dim">Entra al stock de {sede}</span>
          </header>

          {pedidos.length > 0 && !borrador.pedidoId && (
            <div className="ing-pedidos" role="region" aria-label="Pedidos en camino">
              <h3>Pedidos en camino ({pedidos.length})</h3>
              <p className="ing-dim">Si lo que llegó es de un pedido, recibilo y los productos ya vienen cargados.</p>
              <ul>
                {pedidos.map((p) => (
                  <li key={p.id}>
                    <div className="ing-pedido-txt">
                      <strong>Pedido N° {p.numero} · {p.proveedor}</strong>
                      <small className="ing-dim">{fechaHora(p.pedido_at || p.created_at)} · {p.items.length} {p.items.length === 1 ? "producto" : "productos"} por recibir</small>
                    </div>
                    <button type="button" className="ui-btn ui-btn-primario" onClick={() => recibirPedido(p)} disabled={ocupado || guardando || !!borrador.envio}>
                      <PackageCheck size={16} /> Recibir
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {borrador.pedidoId && (
            <p className="ing-pedido-activo" role="status">
              Recibiendo el {borrador.pedidoTitulo || "pedido"}{borrador.proveedor ? ` · ${borrador.proveedor}` : ""}. Corregí lo que llegó distinto: lo que falte queda pendiente en el pedido.
            </p>
          )}

          <ScannerRemito sede={sede} disabled={ocupado || guardando || !!borrador.envio} cargados={borrador.escaneos || []} onLeer={leerRemito} onOcupado={setCapturando} />
          <div className="ing-ia">
            <button type="button" className="ui-btn" disabled={ocupado || guardando || !!borrador.envio} onClick={() => archivoRemitoRef.current?.click()}>
              <FileScan size={17} /> {leyendo ? "Leyendo el remito…" : "Leer remito con IA"}
            </button>
            <span className="ing-dim">Foto o PDF del remito: los productos se cargan solos por su código de Rebollar.</span>
            <input ref={archivoRemitoRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => leerRemito(e.target.files?.[0])} />
          </div>
          {errorLectura && <p className="ing-alerta" role="alert">{errorLectura}</p>}

          <fieldset disabled={ocupado || guardando || !!borrador.envio} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          {sinEmparejar.length > 0 && (
            <div className="ing-revisar" role="region" aria-label="Renglones del remito para revisar">
              <h3>Para revisar ({sinEmparejar.length})</h3>
              <p className="ing-dim">La IA los leyó pero no está claro qué producto son. Elegí el que corresponde o descartalo.</p>
              <ul>
                {sinEmparejar.map((x, idx) => (
                  <li key={`${x.renglon.codigo}-${x.renglon.descripcion}-${idx}`}>
                    <div className="ing-revisar-txt">
                      <strong>{x.renglon.descripcion || "Sin descripción"}</strong>
                      <small className="ing-dim">{[x.renglon.codigo ? `Cód. ${x.renglon.codigo}` : null, x.renglon.cantidad != null ? `Cant. ${fmtCantidad(x.renglon.cantidad)}` : null].filter(Boolean).join(" · ")}</small>
                    </div>
                    <div className="ing-revisar-opciones">
                      {x.candidatos.map((c) => (
                        <button key={c.id} type="button" className="ui-btn ui-btn-suave" onClick={() => resolverRenglon(idx, c)}>{c.descripcion}</button>
                      ))}
                      <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => { setBusqueda(x.renglon.codigo || x.renglon.descripcion); buscarRef.current?.focus(); }}>Buscar otro</button>
                      <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => resolverRenglon(idx, null)}>Descartar</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {borrador.envio && <p className="ing-alerta" role="status">Este remito tiene un envío por confirmar. Reintentá: se conservan los mismos renglones y no se duplica el stock.</p>}
          <div className="ing-datos">
            <label className="ing-campo">
              <span className="ing-lbl">N° de remito</span>
              <input className="ui-input ing-num" value={borrador.remito} placeholder="0001-00012345" maxLength={40} onChange={(e) => cambiar({ remito: e.target.value })} />
            </label>
            <label className="ing-campo">
              <span className="ing-lbl">Proveedor</span>
              <input className="ui-input" value={borrador.proveedor} maxLength={80} onChange={(e) => cambiar({ proveedor: e.target.value })} />
            </label>
          </div>
          {repetido && (
            <p className="ing-alerta">Ese número de remito ya se cargó el {fechaHora(repetido.fecha)}. Revisá que no sea el mismo.</p>
          )}

          <div className="ing-buscar">
            <ScanLine size={18} className="ing-buscar-ico" />
            <input
              ref={buscarRef}
              className="ui-input"
              value={busqueda}
              placeholder="Escaneá o buscá un producto"
              autoComplete="off"
              enterKeyHint="search"
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={onBuscarEnter}
              aria-label="Escaneá o buscá un producto"
            />
            {busqueda && <button type="button" className="ing-buscar-x" onClick={() => setBusqueda("")} aria-label="Borrar"><X size={16} /></button>}
          </div>
          {resultados.length > 0 && (
            <ul className="ing-resultados" role="listbox" aria-label="Productos encontrados">
              {resultados.map((r) => (
                <li key={r.id}>
                  <button type="button" className="ing-resultado" onClick={() => agregar(r)}>
                    <Plus size={16} />
                    <span className="ing-resultado-txt">
                      <span>{r.descripcion}</span>
                      <small className="ing-dim">{[r.codigoEtiqueta, r.config?.proveedor_codigo ? `Cód. ${r.config.proveedor_codigo}` : null, r.rubro].filter(Boolean).join(" · ")}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {borrador.lineas.length === 0 ? (
            <p className="ing-vacio-lineas">Todavía no hay productos. Escaneá la etiqueta o escribí el nombre.</p>
          ) : (
            <ul className="ing-lineas">
              {borrador.lineas.map((l) => (
                <LineaIngreso key={l.key} linea={l} onCambiar={(c) => cambiarLinea(l.key, c)} onQuitar={() => quitarLinea(l.key)} />
              ))}
            </ul>
          )}

          <label className="ing-campo ing-nota">
            <span className="ing-lbl">Nota <span className="ing-dim">(opcional)</span></span>
            <input className="ui-input" value={borrador.nota} maxLength={200} placeholder="Ej.: faltaron 2 cajas, vienen el jueves" onChange={(e) => cambiar({ nota: e.target.value })} />
          </label>

          </fieldset>
          <footer className="ing-pie">
            <div className="ing-total">
              <span className="ing-num">{validas}</span> {validas === 1 ? "producto" : "productos"}
              {verPrecios && total > 0 && <> · <b className="ing-num">{fmtPesos(total)}</b> sin IVA</>}
              {verPrecios && sinCosto > 0 && <span className="ing-dim"> · {sinCosto} sin costo</span>}
            </div>
            <div className="ing-pie-btns">
              {(borrador.lineas.length > 0 || borrador.remito || sinEmparejar.length > 0) && (
                <button type="button" className="ui-btn ui-btn-fantasma" onClick={descartar} disabled={ocupado || guardando || !!borrador.envio}>Descartar</button>
              )}
              <button type="button" className="ui-btn ui-btn-primario" onClick={confirmarIngreso} disabled={ocupado || guardando || !validas || sinEmparejar.length > 0}>
                <PackageCheck size={17} /> {guardando ? "Cargando…" : borrador.envio ? "Reintentar el ingreso" : "Confirmar ingreso"}
              </button>
            </div>
          </footer>
        </section>

        <section className="ing-historial" aria-label="Ingresos anteriores">
          <header className="ing-cab">
            <h2>Ingresos anteriores</h2>
            <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => cargarHistorial().catch(() => toast.error("No se pudo actualizar."))} aria-label="Actualizar" title="Actualizar">
              <RefreshCw size={16} />
            </button>
          </header>
          {historial == null ? (
            <Cargando compacto />
          ) : grupos.length === 0 ? (
            <p className="ing-dim">Todavía no se cargó ningún ingreso en {sede}.</p>
          ) : (
            <ul className="ing-grupos">
              {grupos.map((g) => {
                const exp = abierto === g.lote;
                return (
                  <li key={g.lote} className={`ing-grupo ui-card${g.anulado ? " is-anulado" : ""}`}>
                    <button type="button" className="ing-grupo-cab" onClick={() => setAbierto(exp ? null : g.lote)} aria-expanded={exp}>
                      {exp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span className="ing-grupo-tit">
                        <span>{g.remito ? <>Remito <span className="ing-num">{g.remito}</span></> : "Sin n° de remito"}</span>
                        <small className="ing-dim">{fechaHora(g.fecha)} · {g.filas.length} {g.filas.length === 1 ? "producto" : "productos"}{g.nota ? ` · ${g.nota}` : ""}</small>
                      </span>
                      <span className="ing-num ing-grupo-total">{g.anulado ? "Anulado" : verPrecios && g.total > 0 ? fmtPesos(g.total) : ""}</span>
                    </button>
                    {exp && (
                      <div className="ing-grupo-cuerpo">
                        <ul className="ing-grupo-filas">
                          {g.filas.map((f) => (
                            <li key={f.id} className={f.anulado_at ? "is-anulado" : ""}>
                              <span className="ing-grupo-desc">{f.material?.descripcion || "Producto"}</span>
                              <span className="ing-num">+{fmtCantidad(f.cantidad)}</span>
                              {verPrecios && <span className="ing-num ing-dim">{f.costo_unitario_ars != null ? `${fmtPesos(f.costo_unitario_ars)} c/u` : "sin costo"}</span>}
                            </li>
                          ))}
                        </ul>
                        {g.filas.find((f) => f.anulado_at)?.anulado_motivo && (
                          <p className="ing-anulado-motivo">Anulado: {g.filas.find((f) => f.anulado_at).anulado_motivo}</p>
                        )}
                        {!g.anulado && (anulando === g.lote ? (
                          <div className="ing-anular">
                            <input className="ui-input" value={motivo} autoFocus maxLength={200} placeholder="¿Por qué se anula? Ej.: se cargó en la sede equivocada" onChange={(e) => setMotivo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") anularCarga(g); }} />
                            <div className="ing-anular-btns">
                              <button type="button" className="ui-btn" onClick={() => { setAnulando(null); setMotivo(""); }} disabled={guardando}>Cancelar</button>
                              <button type="button" className="ui-btn ui-btn-peligro" onClick={() => anularCarga(g)} disabled={guardando || !motivo.trim()}>Anular este ingreso</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" className="ui-btn ui-btn-fantasma ing-anular-btn" onClick={() => { setAnulando(g.lote); setMotivo(""); }}>
                            <Trash2 size={14} /> Anular este ingreso
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function LineaIngreso({ linea, onCambiar, onQuitar }) {
  // Sin precios el costo no se ve ni se edita: queda el de la lista vigente.
  const verPrecios = useVerPrecios();
  const c = calcularLinea(linea);
  const unidadCompra = linea.unidadCompra || "caja";
  return (
    <li className={`ing-linea${c.valida ? "" : " is-incompleta"}`}>
      <div className="ing-linea-cab">
        <div className="ing-linea-tit">
          <span className="ing-linea-desc">{linea.descripcion}</span>
          <small className="ing-dim">{[linea.codigoEtiqueta, linea.codigoProveedor ? `Cód. ${linea.codigoProveedor}` : null, linea.pedidoCantidad != null ? `Pedido: ${fmtCantidad(linea.pedidoCantidad)}` : null].filter(Boolean).join(" · ")}</small>
          {linea.lecturaRemito && <small className="ing-dim">Leído del remito: {linea.lecturaRemito.cantidad != null ? fmtCantidad(linea.lecturaRemito.cantidad) : "sin cantidad"}{linea.lecturaRemito.unidad ? ` ${linea.lecturaRemito.unidad}` : ""}</small>}
        </div>
        <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={onQuitar} aria-label={`Quitar ${linea.descripcion}`}><X size={17} /></button>
      </div>

      <div className="ing-linea-cant">
        <label className="ing-campo ing-campo-cant">
          <span className="ing-lbl">Cantidad{linea.presentacionPendiente ? " del remito" : ` de ${linea.porCaja ? unidadCompra : linea.unidad}`}</span>
          <input className="ui-input ing-num" inputMode="decimal" value={linea.cantidad} onChange={(e) => onCambiar({ cantidad: e.target.value.replace(/[^\d.,]/g, "") })} />
        </label>
        <div className="ing-seg" role="radiogroup" aria-label="Cómo viene">
          <button type="button" role="radio" aria-checked={!linea.presentacionPendiente && !linea.porCaja} className={!linea.presentacionPendiente && !linea.porCaja ? "is-activa" : ""} onClick={() => onCambiar({ porCaja: false })}>
            Por {linea.unidad}
          </button>
          <button type="button" role="radio" aria-checked={!linea.presentacionPendiente && linea.porCaja} className={!linea.presentacionPendiente && linea.porCaja ? "is-activa" : ""} onClick={() => onCambiar({ porCaja: true })}>
            En cajas o paquetes
          </button>
        </div>
      </div>

      {linea.presentacionPendiente && <p className="ing-alerta" role="status">Elegí si la cantidad leída corresponde a {unidadEnTexto(linea.unidad, 2)} o a cajas / paquetes antes de confirmar.</p>}

      {linea.porCaja && (
        <div className="ing-linea-caja">
          <label className="ing-campo">
            <span className="ing-lbl">Viene en</span>
            <input className="ui-input" value={linea.unidadCompra} maxLength={20} placeholder="caja" onChange={(e) => onCambiar({ unidadCompra: e.target.value })} />
          </label>
          <label className="ing-campo">
            <span className="ing-lbl">{unidadEnTexto(linea.unidad, 2)} por {unidadCompra}</span>
            <input className="ui-input ing-num" inputMode="decimal" value={linea.factor} placeholder="100" onChange={(e) => onCambiar({ factor: e.target.value.replace(/[^\d.,]/g, "") })} />
          </label>
          {cambiosDeConfig({ ...linea, recordar: true }) && (
            <label className="ing-recordar">
              <input type="checkbox" checked={linea.recordar} onChange={(e) => onCambiar({ recordar: e.target.checked })} />
              Recordar para la próxima
            </label>
          )}
        </div>
      )}

      <div className="ing-linea-pie">
        <span className="ing-equivale">
          {c.valida
            ? <>Entran <b className="ing-num">{fmtCantidad(c.cantidadEntrega)}</b> {unidadEnTexto(linea.unidad, c.cantidadEntrega)}{linea.porCaja ? <span className="ing-dim"> ({fmtCantidad(linea.cantidad)} × {fmtCantidad(c.factor)})</span> : null}</>
            : <span className="ing-falta">{linea.presentacionPendiente ? "Falta elegir cómo viene" : linea.porCaja && !(Number(String(linea.factor).replace(",", ".")) > 0) ? `Falta cuántas trae cada ${unidadCompra}` : "Falta la cantidad"}</span>}
        </span>
        {verPrecios && <label className="ing-campo ing-campo-costo">
          <span className="ing-lbl">$ por {linea.porCaja ? unidadCompra : linea.unidad} <span className="ing-dim">sin IVA</span></span>
          <input className="ui-input ing-num" inputMode="decimal" value={linea.costo} placeholder="—" onChange={(e) => onCambiar({ costo: e.target.value.replace(/[^\d.,]/g, "") })} />
        </label>}
        {verPrecios && c.subtotal != null && <span className="ing-subtotal ing-num">{fmtPesos(c.subtotal)}</span>}
      </div>
    </li>
  );
}
