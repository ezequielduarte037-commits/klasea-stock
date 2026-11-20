import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, History, Maximize2, Minimize2, RotateCcw, ScanBarcode, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { plegarMenu } from "@/lib/menuLateral";
import BarcodeScanner from "@/features/panol/BarcodeScanner";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { fetchObrasEgreso, fetchPanolCatalogFull } from "@/features/panol/panolApi";
import { obraCerrada } from "@/features/panol/mostrador/mostradorPanolLogica";
import { conTope } from "@/features/panol/mostrador/mostradorPanolApi";
import { CSS_PANOL } from "@/features/panol/mostrador/estilosPanol";
import { Hoja } from "@/features/panol/mostrador/CapasPanol";
import { CSS_MOSTRADOR } from "@/features/consumibles/mostrador/mostradorEstilos";
import TecladoNumerico from "@/features/consumibles/mostrador/TecladoNumerico";
import useRafagaLector from "@/features/consumibles/mostrador/useRafagaLector";
import { cantidadTipeada, fmtNum, normalizarTexto } from "@/features/consumibles/mostrador/mostradorLogica";
import {
  armarPedidos,
  buscarCatalogo,
  buscarRenglones,
  cambiarObra,
  cambiarVariante,
  cantidadDe,
  fijarCantidad,
  materialesPorCodigo,
  planDeIngreso,
  problemasDelCarrito,
  quitarLinea,
  refrescarCarrito,
  renglonesDeMaterial,
  renglonesPorCodigo,
  resumenDelIngreso,
  sumarCantidad,
  sumarRenglon,
  sumarSinFicha,
  sumarSinPedido,
  ultimaLinea,
} from "./ingresosLogica";
import { fetchPedidosEnCamino, fetchUltimosIngresos, guardarNovedad, registrarIngreso } from "./ingresosApi";
import {
  BotoneraIngreso, CarritoIngreso, ConfirmarIngreso, ElegirObra, ElegirRenglon, ListoIngreso,
  NovedadRenglon, PieConfirmar, SinFicha, UltimosIngresos,
} from "./PiezasIngreso";
import { CSS_INGRESO } from "./estilosIngreso";

/**
 * Mostrador de ingresos del pañol — el gemelo del de egresos.
 *
 *   1. MARCAR.    Los pedidos en camino son la botonera: elegir uno muestra lo
 *                 que falta llegar y tocar un renglón lo suma entero. El lector
 *                 va primero a los pedidos (lo que tiene renglón esperando no
 *                 entra dos veces) y, si no está en ninguno, entra sin pedido.
 *   2. CONFIRMAR. Lo que llega sin pedido pide el número de remito. Enter.
 *   3. LISTO.     Resumen unos segundos y vuelve a empezar.
 *
 * Lo que necesita más que eso (leer el remito con IA, repartir un renglón
 * entre obras, precios, novedades de un pedido) sigue en Pedidos y remitos.
 *
 * Sin cola sin conexión: panol_marcar_items y panol_crear_envio no son
 * idempotentes y un reintento podría ingresar dos veces.
 */

const FOCO_KEY = "klasea.panol.mostrador.foco";
const LISTO_MS = 4500;
const ENTERAS = new Set(["unidad", "unidades", "u", "un", "uni", "par", "pares", "juego", "juegos", "kit", "kits", "caja", "cajas", "rollo", "rollos"]);
const carritoKey = (sede) => `klasea:panol-ingreso-carrito.${sede}`;

function leerJson(clave, porDefecto) {
  try {
    const v = JSON.parse(window.localStorage.getItem(clave) || "null");
    return v ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardarJson(clave, valor, vacio) {
  try {
    if (vacio) window.localStorage.removeItem(clave);
    else window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch { /* almacenamiento lleno o bloqueado: sigue sin persistir */ }
}

const esEditable = (el) => {
  const tag = String(el?.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || Boolean(el?.isContentEditable);
};

export default function MostradorIngresos({ sede, profile }) {
  const toast = useToast();
  const raizRef = useRef(null);
  const campoRef = useRef(null);

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [envios, setEnvios] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [obras, setObras] = useState([]);
  const [ultimos, setUltimos] = useState([]);
  const [errorCarga, setErrorCarga] = useState("");
  const [refrescando, setRefrescando] = useState(false);

  // ── Estado del mostrador ──────────────────────────────────────────────────
  const [paso, setPaso] = useState("marcar"); // marcar | confirmar | listo
  const [cart, setCart] = useState(() => {
    const v = leerJson(carritoKey(sede), []);
    return Array.isArray(v) ? v : [];
  });
  const [pedidoId, setPedidoId] = useState(null);
  const [texto, setTexto] = useState("");
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const [capa, setCapa] = useState(null);
  const [camara, setCamara] = useState(false);
  const [referencia, setReferencia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardandoNovedad, setGuardandoNovedad] = useState(false);
  const [errorOperacion, setErrorOperacion] = useState("");
  const [listo, setListo] = useState(null);
  const [foco, setFoco] = useState(() => leerJson(FOCO_KEY, false) === true);
  const [ancho, setAncho] = useState(1200);
  const [esTactil] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches));

  const cartRef = useRef(cart);
  const pasoRef = useRef(paso);
  const capaRef = useRef(capa);
  const guardandoRef = useRef(false);
  const textoRef = useRef("");
  const busquedaTimerRef = useRef(null);
  const vivoRef = useRef(true);

  useEffect(() => { cartRef.current = cart; }, [cart]);
  useEffect(() => { pasoRef.current = paso; capaRef.current = capa; });
  useEffect(() => {
    vivoRef.current = true;
    return () => {
      vivoRef.current = false;
      window.clearTimeout(busquedaTimerRef.current);
    };
  }, []);

  const angosto = ancho < 820;
  const amplio = ancho >= 1240;

  function aplicarCarrito(siguiente) {
    cartRef.current = siguiente;
    setCart(siguiente);
  }

  // ── Carga ─────────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    try {
      const [lista, ult] = await Promise.all([
        conTope(fetchPedidosEnCamino(sede), 25_000, "Los pedidos tardaron demasiado en llegar."),
        fetchUltimosIngresos(sede).catch(() => null),
      ]);
      if (!vivoRef.current) return;
      setEnvios(lista);
      if (ult) setUltimos(ult);
      setErrorCarga("");
    } catch (e) {
      if (vivoRef.current) setErrorCarga(e?.message || "No se pudieron traer los pedidos.");
    } finally {
      if (vivoRef.current) setRefrescando(false);
    }
  }, [sede]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    let vivo = true;
    fetchObrasEgreso().then((o) => { if (vivo) setObras(o || []); }).catch(() => {});
    fetchPanolCatalogFull().then((c) => { if (vivo) setCatalogo(c || []); }).catch(() => { if (vivo) setCatalogo([]); });
    return () => { vivo = false; };
  }, []);

  // Con el carrito vacío, cada 5 minutos se refrescan los pedidos (lo que mandó Compras).
  useEffect(() => {
    const reloj = window.setInterval(() => {
      if (pasoRef.current === "marcar" && !capaRef.current && !cartRef.current.length && !guardandoRef.current) cargar();
    }, 5 * 60_000);
    return () => window.clearInterval(reloj);
  }, [cargar]);

  useEffect(() => {
    const el = raizRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entrada]) => setAncho(Math.round(entrada.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { plegarMenu(foco ? true : null); }, [foco]);
  useEffect(() => () => plegarMenu(null), []);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const pedidos = useMemo(() => armarPedidos(envios ?? []), [envios]);
  const obrasVigentes = useMemo(() => obras.filter((o) => !obraCerrada(o)), [obras]);
  const buscando = Boolean(textoBusqueda.trim()) && cantidadTipeada(textoBusqueda) == null;
  const pedidosBusqueda = useMemo(() => (pedidoId ? pedidos.filter((p) => p.id === pedidoId) : pedidos), [pedidos, pedidoId]);
  const renglonesHallados = useMemo(() => (buscando ? buscarRenglones(pedidosBusqueda, textoBusqueda) : []), [buscando, pedidosBusqueda, textoBusqueda]);
  const catalogoHallado = useMemo(() => (buscando && catalogo ? buscarCatalogo(catalogo, textoBusqueda) : []), [buscando, catalogo, textoBusqueda]);
  const enCarrito = useMemo(() => new Map(cart.map((l) => [l.key, cantidadDe(l)])), [cart]);
  const problemas = useMemo(() => problemasDelCarrito(cart, referencia), [cart, referencia]);
  const problemasMarcar = problemas.filter((p) => p.key !== "referencia");

  // Si el pedido elegido se terminó de recibir (acá o en otro equipo), se suelta.
  useEffect(() => {
    if (pedidoId && envios && !pedidos.some((p) => p.id === pedidoId)) setPedidoId(null);
  }, [pedidoId, pedidos, envios]);

  // Con cada lectura de los pedidos, el carrito se pone al día.
  useEffect(() => {
    if (!envios) return;
    const siguiente = refrescarCarrito(cartRef.current, pedidos);
    if (siguiente !== cartRef.current) aplicarCarrito(siguiente);
  }, [envios, pedidos]);

  useEffect(() => { guardarJson(carritoKey(sede), cart, !cart.length); }, [cart, sede]);

  // ── El campo del lector ───────────────────────────────────────────────────
  const cambiarTexto = useCallback((v) => {
    textoRef.current = v;
    setTexto(v);
    window.clearTimeout(busquedaTimerRef.current);
    if (!v.trim()) {
      setTextoBusqueda("");
      setResaltado(0);
      return;
    }
    busquedaTimerRef.current = window.setTimeout(() => {
      setTextoBusqueda(v);
      setResaltado(0);
    }, 160);
  }, []);

  const enfocarCampo = useCallback(() => {
    if (esTactil || pasoRef.current !== "marcar" || capaRef.current) return;
    campoRef.current?.focus({ preventScroll: true });
  }, [esTactil]);

  useEffect(() => {
    if (paso !== "marcar" || capa) return undefined;
    const t = window.setTimeout(enfocarCampo, 40);
    return () => window.clearTimeout(t);
  }, [paso, capa, enfocarCampo]);

  function alPerderFoco() {
    window.setTimeout(() => {
      const activo = document.activeElement;
      if (!activo || activo === document.body || (raizRef.current?.contains(activo) && !esEditable(activo))) enfocarCampo();
    }, 150);
  }

  function retenerFoco(e) {
    if (document.activeElement === campoRef.current && e.target.closest?.("button")) e.preventDefault();
  }

  // ── Marcar ────────────────────────────────────────────────────────────────
  const editable = () => !guardandoRef.current && pasoRef.current !== "listo";

  function avisarSumado(nombre) {
    if (pasoRef.current === "confirmar") toast.info(`Sumado: ${nombre}`);
  }

  /** Tocar un renglón: entra todo lo que falta. */
  function tocarRenglon(r) {
    if (!editable()) return;
    aplicarCarrito(sumarRenglon(cartRef.current, r));
    avisarSumado(r.descripcion);
  }

  function todoElPedido(p) {
    if (!editable()) return;
    let c = cartRef.current;
    for (const r of p.renglones) c = sumarRenglon(c, r);
    aplicarCarrito(c);
    toast.success(`${p.titulo}: ${p.renglones.length === 1 ? "1 renglón" : `${p.renglones.length} renglones`} al carrito. Corregí lo que no vino.`);
  }

  /**
   * Un producto del catálogo (leído o elegido). Si tiene un renglón esperando,
   * entra en ese pedido; si hay más de uno, se pregunta. Si no, sin pedido.
   */
  function entraMaterial(material, { cantidad = 1, desdeLector = false } = {}) {
    if (!editable()) return;
    if (material.es_consumible) { setCapa({ tipo: "sinFicha", consumible: material }); return; }
    let candidatos = renglonesDeMaterial(pedidos, material.id);
    if (pedidoId) {
      const delPedido = candidatos.filter((r) => r.envioId === pedidoId);
      if (delPedido.length) candidatos = delPedido;
    }
    // Los que todavía no se completaron en el carrito van primero.
    const pendientes = candidatos.filter((r) => (enCarritoDe(r) < (r.falta ?? 1)));
    if (pendientes.length === 1 || (candidatos.length === 1)) {
      const r = pendientes[0] || candidatos[0];
      aplicarCarrito(sumarRenglon(cartRef.current, r, cantidad));
      avisarSumado(r.descripcion);
      return;
    }
    if (candidatos.length > 1) {
      setCapa({ tipo: "renglon", titulo: material.descripcion, renglones: pendientes.length ? pendientes : candidatos, material, cantidad });
      return;
    }
    aplicarCarrito(sumarSinPedido(cartRef.current, material, { cantidad }));
    avisarSumado(material.descripcion);
    if (!desdeLector) cambiarTexto("");
  }

  function enCarritoDe(r) {
    const l = cartRef.current.find((x) => x.key === `r:${r.id}`);
    return l ? cantidadDe(l) : 0;
  }

  function procesarCodigo(crudo) {
    const codigo = String(crudo ?? "").trim();
    if (!codigo || guardandoRef.current) return;
    if (pasoRef.current === "listo") empezarDeNuevo();
    // 1. ¿Un renglón esperando con ese código?
    let renglones = renglonesPorCodigo(pedidos, codigo);
    if (pedidoId && renglones.some((r) => r.envioId === pedidoId)) renglones = renglones.filter((r) => r.envioId === pedidoId);
    const pendientes = renglones.filter((r) => enCarritoDe(r) < (r.falta ?? 1));
    if (pendientes.length === 1 || renglones.length === 1) {
      const r = pendientes[0] || renglones[0];
      aplicarCarrito(sumarRenglon(cartRef.current, r, 1));
      avisarSumado(r.descripcion);
      return;
    }
    if (renglones.length > 1) {
      setCapa({ tipo: "renglon", titulo: renglones[0].descripcion, renglones: pendientes.length ? pendientes : renglones, cantidad: 1 });
      return;
    }
    // 2. ¿Un producto del catálogo?
    if (!catalogo) { toast.info("Todavía estoy trayendo el catálogo. Probá de nuevo en un momento."); return; }
    const materiales = materialesPorCodigo(catalogo, codigo).filter((m) => !m.es_requisito && m.activo !== false);
    if (materiales.length) {
      if (materiales.length > 1) toast.warning(`El código ${codigo} está en ${materiales.length} productos: sumé ${materiales[0].descripcion}.`);
      entraMaterial(materiales[0], { desdeLector: true });
      return;
    }
    // 3. No está: entra sin ficha.
    setCapa({ tipo: "sinFicha", codigo });
  }

  const lectorCampo = useRafagaLector({
    onRafaga: (codigo, previo) => {
      cambiarTexto(previo);
      procesarCodigo(codigo);
    },
    onEnter: (e, valor) => {
      e.preventDefault();
      alEnterCampo(valor);
    },
  });
  const registrarTecla = lectorCampo.registrar;

  function alEnterCampo(valor) {
    if (!editable()) return;
    const v = String(valor || "").trim();
    if (!v) {
      if (cartRef.current.length) irAConfirmar();
      return;
    }
    const n = cantidadTipeada(v);
    if (n != null) {
      cambiarTexto("");
      const l = ultimaLinea(cartRef.current);
      if (l) aplicarCarrito(fijarCantidad(cartRef.current, l.key, n));
      return;
    }
    const usarResaltado = textoBusqueda === valor;
    const idx = usarResaltado ? resaltado : 0;
    const renglones = usarResaltado ? renglonesHallados : buscarRenglones(pedidosBusqueda, v);
    const mats = usarResaltado ? catalogoHallado : catalogo ? buscarCatalogo(catalogo, v) : [];
    // Un código exacto va por el camino del lector.
    if (renglonesPorCodigo(pedidos, v).length || (catalogo && materialesPorCodigo(catalogo, v).length)) {
      cambiarTexto("");
      procesarCodigo(v);
      return;
    }
    if (idx < renglones.length) { tocarRenglon(renglones[idx]); cambiarTexto(""); return; }
    const m = mats[idx - renglones.length];
    if (m) { entraMaterial(m); return; }
    cambiarTexto("");
    procesarCodigo(v);
  }

  const totalResultados = renglonesHallados.length + catalogoHallado.length;

  function alTeclearCampo(e) {
    if (buscando && totalResultados && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setResaltado((i) => Math.max(0, Math.min(totalResultados - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
      return;
    }
    if (e.key === "Escape" && texto) cambiarTexto("");
    lectorCampo.onKeyDown(e);
  }

  // Una tecla suelta se manda al campo del lector: ningún escaneo se pierde.
  useEffect(() => {
    function alTeclear(e) {
      if (guardandoRef.current || capaRef.current) return;
      const p = pasoRef.current;
      if (p !== "marcar" && p !== "listo") return;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === " ") return;
      if (esEditable(e.target) || !raizRef.current?.isConnected) return;
      e.preventDefault();
      if (p === "listo") empezarRef.current?.();
      registrarTecla(e.key);
      cambiarTexto(`${textoRef.current}${e.key}`);
      campoRef.current?.focus({ preventScroll: true });
    }
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, [registrarTecla, cambiarTexto]);

  // En la confirmación (foco en el panel) el lector escribe como teclado.
  useKeyboardWedge({
    enabled: paso === "confirmar" && !capa && !guardando && !cart.some((l) => l.tipo !== "pedido"),
    minLength: 4,
    timeoutMs: 65,
    onScan: (codigo) => { procesarCodigo(codigo); },
  });

  // ── Confirmar ─────────────────────────────────────────────────────────────
  function irAConfirmar() {
    if (!editable() || !cartRef.current.length) return;
    const lista = problemasDelCarrito(cartRef.current, "x").filter((p) => p.key !== "referencia");
    if (lista.length) { toast.warning(lista[0].texto); return; }
    campoRef.current?.blur();
    setErrorOperacion("");
    setPaso("confirmar");
  }

  function volverAMarcar() {
    if (guardandoRef.current) return;
    setPaso("marcar");
  }

  async function confirmar() {
    if (guardandoRef.current) return;
    const items = cartRef.current;
    if (!items.length || problemasDelCarrito(items, referencia).length) return;
    guardandoRef.current = true;
    setGuardando(true);
    setErrorOperacion("");
    const plan = planDeIngreso(items, { sede, referencia });
    try {
      await registrarIngreso({ ...plan, actor: profile });
      if (!vivoRef.current) return;
      const resumen = resumenDelIngreso(items, { obras, sede, referencia });
      if (plan.crear && plan.crear.items.some((i) => !i.material_id)) {
        toast.info("Lo que entró sin ficha queda para Técnica en «Productos a crear».");
      }
      aplicarCarrito([]);
      setListo(resumen);
      setPaso("listo");
      setRefrescando(true);
      cargar();
    } catch (err) {
      if (!vivoRef.current) return;
      // Puede haber quedado una parte: se recarga y el carrito se pone al día
      // solo (lo recibido queda frenado para no recibirlo dos veces).
      const msg = err?.message || "No se pudo registrar el ingreso.";
      setErrorOperacion(`${msg} Actualicé los pedidos: revisá el carrito antes de volver a confirmar.`);
      toast.error(msg);
      setRefrescando(true);
      cargar();
    } finally {
      guardandoRef.current = false;
      if (vivoRef.current) setGuardando(false);
    }
  }

  function empezarDeNuevo() {
    if (guardandoRef.current) return;
    setReferencia("");
    setErrorOperacion("");
    setListo(null);
    setCapa(null);
    cambiarTexto("");
    pasoRef.current = "marcar";
    setPaso("marcar");
  }
  const empezarRef = useRef(empezarDeNuevo);
  useEffect(() => { empezarRef.current = empezarDeNuevo; });

  useEffect(() => {
    if (paso !== "listo") return undefined;
    const t = window.setTimeout(() => empezarRef.current?.(), LISTO_MS);
    return () => window.clearTimeout(t);
  }, [paso]);

  // ── Otras acciones ────────────────────────────────────────────────────────
  function vaciar() {
    aplicarCarrito([]);
    empezarDeNuevo();
    enfocarCampo();
  }

  function refrescar() {
    if (guardandoRef.current) return;
    setRefrescando(true);
    cargar();
  }

  function alternarFoco() {
    const siguiente = !foco;
    guardarJson(FOCO_KEY, siguiente, false);
    setFoco(siguiente);
  }

  function elegirPedido(id) {
    setPedidoId(id);
    // Cada pedido arranca arriba: si no, queda el scroll de la lista anterior.
    const col = raizRef.current?.querySelector(".mst-col-botonera");
    if (col) col.scrollTop = 0;
    setResaltado(0);
    enfocarCampo();
  }

  async function registrarNovedad(renglon, { estado, nota }) {
    if (guardandoNovedad) return;
    setGuardandoNovedad(true);
    try {
      const r = await guardarNovedad({ renglon, estado, nota });
      if (!vivoRef.current) return;
      // Lo rechazado deja de esperarse: si estaba en el carrito, sale.
      if (estado === "rechazado") aplicarCarrito(quitarLinea(cartRef.current, `r:${renglon.id}`));
      setCapa(null);
      toast.success(estado
        ? `${renglon.descripcion}: ${estado === "pendiente" ? "vuelve a esperarse" : "novedad guardada"}.${r.comentado ? "" : " No se pudo dejar el mensaje en el pedido."}`
        : "Mensaje enviado al pedido.");
      setRefrescando(true);
      cargar();
    } catch (err) {
      if (vivoRef.current) toast.error(err?.message || "No se pudo guardar la novedad.");
    } finally {
      if (vivoRef.current) setGuardandoNovedad(false);
    }
  }

  // ── Capas ─────────────────────────────────────────────────────────────────
  let capaVista = null;
  if (capa?.tipo === "novedad") {
    capaVista = (
      <NovedadRenglon
        key={capa.renglon.id}
        renglon={capa.renglon}
        sede={sede}
        guardando={guardandoNovedad}
        onGuardar={(datos) => registrarNovedad(capa.renglon, datos)}
        onCerrar={() => { if (!guardandoNovedad) setCapa(null); }}
        onRafaga={(c) => { setCapa(null); procesarCodigo(c); }}
      />
    );
  } else if (capa?.tipo === "teclado") {
    const l = cart.find((x) => x.key === capa.key);
    if (l) {
      capaVista = (
        <TecladoNumerico
          key={l.key}
          titulo={l.label}
          unidad={`${l.unidad || ""}${l.tipo === "pedido" && l.falta != null ? ` · faltan ${fmtNum(l.falta)}` : ""}`}
          valorInicial={cantidadDe(l)}
          decimales={!ENTERAS.has(normalizarTexto(l.unidad))}
          onListo={(n) => { aplicarCarrito(n > 0 ? fijarCantidad(cartRef.current, l.key, n) : quitarLinea(cartRef.current, l.key)); setCapa(null); }}
          onCerrar={() => setCapa(null)}
          onRafaga={(c) => { setCapa(null); procesarCodigo(c); }}
        />
      );
    }
  } else if (capa?.tipo === "renglon") {
    capaVista = (
      <ElegirRenglon
        titulo={capa.titulo}
        renglones={capa.renglones}
        sede={sede}
        onElegir={(r) => { setCapa(null); aplicarCarrito(sumarRenglon(cartRef.current, r, capa.cantidad ?? null)); }}
        onSinPedido={capa.material ? () => { setCapa(null); aplicarCarrito(sumarSinPedido(cartRef.current, capa.material, { cantidad: capa.cantidad || 1 })); } : null}
        onCerrar={() => setCapa(null)}
      />
    );
  } else if (capa?.tipo === "obra") {
    const l = cart.find((x) => x.key === capa.key);
    capaVista = (
      <ElegirObra
        obras={obrasVigentes}
        sede={sede}
        actual={l?.obraId || null}
        onElegir={(obraId) => { setCapa(null); aplicarCarrito(cambiarObra(cartRef.current, capa.key, obraId)); }}
        onCerrar={() => setCapa(null)}
        onRafaga={(c) => { setCapa(null); procesarCodigo(c); }}
      />
    );
  } else if (capa?.tipo === "sinFicha") {
    capaVista = (
      <SinFicha
        codigo={capa.codigo || ""}
        descripcionInicial={capa.descripcion || ""}
        consumible={capa.consumible || null}
        onEntrar={(descripcion) => {
          setCapa(null);
          aplicarCarrito(sumarSinFicha(cartRef.current, { descripcion, codigo: capa.codigo || "" }));
          cambiarTexto("");
        }}
        onBuscar={() => { setCapa(null); cambiarTexto(""); window.setTimeout(() => campoRef.current?.focus(), 30); }}
        onCerrar={() => setCapa(null)}
        onRafaga={(c) => { setCapa(null); procesarCodigo(c); }}
      />
    );
  } else if (capa?.tipo === "ultimos") {
    capaVista = (
      <Hoja titulo="Últimos ingresos" chica={false} onCerrar={() => setCapa(null)}>
        <div style={{ margin: "-16px -18px" }}>
          <UltimosIngresos items={ultimos} sede={sede} />
        </div>
      </Hoja>
    );
  }

  const cargando = !envios && !errorCarga;

  return (
    <div
      ref={raizRef}
      className={`mst mpn ing${amplio ? " is-ancho" : ""}${angosto ? " is-angosto" : ""}`}
      onMouseDown={retenerFoco}
      onKeyDownCapture={(e) => { if (guardandoRef.current) { e.preventDefault(); e.stopPropagation(); } }}
    >
      <style>{CSS_MOSTRADOR}</style>
      <style>{CSS_PANOL}</style>
      <style>{CSS_INGRESO}</style>

      <div className="mst-barra">
        <div className="mst-lector">
          <ScanBarcode size={20} className="mst-lector-icono" aria-hidden="true" />
          <input
            ref={campoRef}
            disabled={guardando || cargando}
            value={texto}
            onChange={(e) => cambiarTexto(e.target.value)}
            onKeyDown={alTeclearCampo}
            onPaste={lectorCampo.onPaste}
            onBlur={alPerderFoco}
            placeholder={angosto ? "Código o nombre" : "Pasá el código o buscá por nombre · x5 cambia la cantidad"}
            aria-label="Código del lector o búsqueda"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
          />
          {texto ? (
            <button type="button" className="mst-lector-limpiar" onClick={() => { cambiarTexto(""); enfocarCampo(); }} aria-label="Borrar la búsqueda">
              <X size={15} />
            </button>
          ) : !esTactil ? (
            <span className="mst-lector-estado" aria-hidden="true">
              <i />
              <span className="is-listo">Lector listo</span>
              <span className="is-perdido">Clic acá para escanear</span>
            </span>
          ) : null}
        </div>

        <div className="mst-estados">
          {esTactil || angosto ? (
            <button type="button" className="mst-icono-btn" onClick={() => setCamara(true)} aria-label="Escanear con la cámara" title="Escanear con la cámara">
              <Camera size={16} />
            </button>
          ) : null}
          {!amplio ? (
            <button type="button" className="mst-icono-btn" onClick={() => setCapa({ tipo: "ultimos" })} aria-label="Últimos ingresos" title="Últimos ingresos">
              <History size={16} />
            </button>
          ) : null}
          {!angosto ? (
            <button type="button" className={`mst-icono-btn${foco ? " is-activo" : ""}`} onClick={alternarFoco} aria-pressed={foco} aria-label="Modo foco" title={foco ? "Volver a mostrar el menú" : "Plegar el menú lateral"}>
              {foco ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          ) : null}
          <button type="button" className="mst-icono-btn" onClick={refrescar} aria-label="Actualizar" title="Actualizar los pedidos">
            <RotateCcw size={16} className={refrescando ? "mst-gira" : ""} />
          </button>
        </div>
      </div>

      <div className="mst-cuerpo">
        <div className="mst-col mst-col-botonera">
          {errorCarga ? (
            <div className="mst-error" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1 }}>{errorCarga}</span>
              <button type="button" className="ui-btn" onClick={refrescar}>Reintentar</button>
            </div>
          ) : null}
          {cargando ? <Cargando texto="Abriendo el mostrador…" /> : null}
          {envios ? (
            <fieldset disabled={guardando} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "contents" }}>
              <BotoneraIngreso
                pedidos={pedidos}
                pedidoId={pedidoId}
                onPedido={elegirPedido}
                buscando={buscando}
                texto={textoBusqueda}
                renglones={renglonesHallados}
                catalogo={catalogoHallado}
                catalogoListo={Boolean(catalogo)}
                resaltado={resaltado}
                onResaltar={setResaltado}
                enCarrito={enCarrito}
                sede={sede}
                onRenglon={(r) => { tocarRenglon(r); if (buscando) cambiarTexto(""); }}
                onTodoElPedido={todoElPedido}
                onMaterial={(m) => entraMaterial(m)}
                onSinFicha={(descripcion) => setCapa({ tipo: "sinFicha", descripcion })}
                onNovedad={(renglon) => setCapa({ tipo: "novedad", renglon })}
              />
            </fieldset>
          ) : null}
        </div>

        <div className="mst-col mst-col-carrito">
          <fieldset disabled={guardando} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "contents" }}>
            <CarritoIngreso
              cart={cart}
              obras={obras}
              sede={sede}
              problemas={problemasMarcar}
              onSumar={(key, d) => aplicarCarrito(sumarCantidad(cartRef.current, key, d))}
              onTeclado={(key) => setCapa({ tipo: "teclado", key })}
              onQuitar={(key) => aplicarCarrito(quitarLinea(cartRef.current, key))}
              onObra={(key) => setCapa({ tipo: "obra", key })}
              onVariante={(key, v) => aplicarCarrito(cambiarVariante(cartRef.current, key, v))}
              onVaciar={vaciar}
              onConfirmar={irAConfirmar}
            />
          </fieldset>
        </div>

        {amplio ? (
          <div className="mst-col mst-col-movs">
            <UltimosIngresos items={ultimos} sede={sede} onActualizar={refrescar} cargando={refrescando} />
          </div>
        ) : null}
      </div>

      {angosto && cart.length ? (
        <div className="mst-barra-firmar">
          <PieConfirmar cart={cart} problemas={problemasMarcar} onConfirmar={irAConfirmar} />
        </div>
      ) : null}

      {paso === "confirmar" ? (
        <ConfirmarIngreso
          cart={cart}
          sede={sede}
          obras={obras}
          referencia={referencia}
          onReferencia={setReferencia}
          problemas={problemas}
          guardando={guardando}
          error={errorOperacion}
          onConfirmar={confirmar}
          onVolver={volverAMarcar}
          onRafaga={procesarCodigo}
        />
      ) : null}

      {paso === "listo" && listo ? <ListoIngreso resumen={listo} sede={sede} onSiguiente={empezarDeNuevo} /> : null}

      {capaVista}

      <BarcodeScanner open={camara} onClose={() => setCamara(false)} onScan={(c) => { setCamara(false); procesarCodigo(c); }} />
    </div>
  );
}
