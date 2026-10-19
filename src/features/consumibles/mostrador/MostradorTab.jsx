import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, History, Maximize2, Minimize2, MonitorUp, Nfc, Plug, RotateCcw, Scale, ScanBarcode, WifiOff, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { useBalanza } from "@/hooks/useBalanza";
import { plegarMenu } from "@/lib/menuLateral";
import useNfcBridge from "@/features/panol/useNfcBridge";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { openEgresoDisplayWindow, publishEgresoDisplay, resetEgresoDisplay } from "@/features/panol/egresoDisplay";
import { vincularCodigo } from "@/features/panol/kioscoApi";
import { buscarEmpleadoPorNfc, normalizeNfcUid } from "@/features/rrhh/api";
import { guardarPesoUnitarioDirecto } from "@/features/materiales/api";
import {
  anularMovimiento,
  armarFilasRetiro,
  fetchCatalogo,
  fetchObrasActivas,
  indexarCodigos,
  normalizarCodigo,
  nuevoId,
  obrasDeEmpleado,
  piezasDesdeGramos,
  rangoDeHoyArgentina,
} from "@/features/consumibles/api";
import { altaExterno, enviarFilas, fetchEmpleadosMostrador, fetchExternos, fetchFilasPorIds, fetchHoyMostrador, fetchMasRetirados, guardarDatosMostrador, leerDatosMostrador } from "./mostradorApi";
import {
  agregarAlCarrito,
  agregarCodigoAlCatalogo,
  aplicarStockLocal,
  armarFilasDevolucion,
  datosParaRetiro,
  armarPantallaOperario,
  buscarEnCatalogo,
  cantidadTipeada,
  cantidadesDeHoy,
  destinoInicial,
  elegirFavoritos,
  conTimeout,
  evaluarCupo,
  fijarCanje,
  fijarCantidad,
  fijarPeso,
  notasDelRetiro,
  normalizarTexto,
  obrasVigentes,
  pareceUidTarjeta,
  problemasDelCarrito,
  quitarLinea,
  resumenDelRegistro,
  retirosPendientesDe,
  sumarCantidad,
  textoDestino,
} from "./mostradorLogica";
import { consultaVigente, crearOperacion, limpiarCanjes, puedeEditar, reconciliarHoy, recuperarOperacion, tokenConsulta, transicionControl } from "./operacionesMostrador";
import { AUTO_CONFIRMAR_MS, CSS_MOSTRADOR, LISTO_MS } from "./mostradorEstilos";
import useColaSinConexion from "./useColaSinConexion";
import useRafagaLector from "./useRafagaLector";
import AnularMovimiento from "./AnularMovimiento";
import Botonera from "./Botonera";
import Carrito, { PieFirmar } from "./Carrito";
import CodigoDesconocido from "./CodigoDesconocido";
import ColaSinConexion, { ChipCola } from "./ColaSinConexion";
import Firma from "./Firma";
import Listo from "./Listo";
import PesoBalanza from "./PesoBalanza";
import TecladoNumerico from "./TecladoNumerico";
import UltimosMovimientos from "./UltimosMovimientos";
import HojaMovimiento from "../conteo/Hoja";
import EditarMovimiento from "../movimientos/EditarMovimiento";

/**
 * Mostrador de consumibles — la caja tipo ferretería del pañol.
 *
 * Desde el 13/10 todo lo que sale del pañol pasa por acá, y un retiro común
 * tiene que quedar en menos de 15 segundos: si tarda más, en la primera cola
 * el pañolero lo saltea. Por eso el camino corto no tiene clics:
 *
 *   1. MARCAR.    El lector agrega al carrito (el mismo código suma 1). La
 *                 botonera y la búsqueda son para lo que no tiene código.
 *   2. FIRMAR.    Se apoya la tarjeta: identifica y firma. Con una sola obra
 *                 en RRHH, se carga ahí y se confirma solo a los 3 s.
 *   3. LISTO.     Resumen unos segundos y vuelve a empezar solo.
 *
 * El orden importa (lo explica EgresoConsumiblesScreen): primero se ve qué se
 * lleva, después quién. Una tarjeta apoyada mientras se marca pasa directo a
 * firmar con esa persona.
 *
 * El foco no se puede perder: el lector USB es un teclado que escribe donde
 * esté el foco. El campo del lector lo recupera solo, las teclas sueltas se
 * redirigen a él, y los demás campos reconocen la ráfaga del lector y la
 * mandan acá (useRafagaLector). En la firma, el foco queda en el panel para
 * que el lector de tarjetas que escribe como teclado no tipee en un input.
 *
 * Sin red no se frena: el retiro se guarda en este equipo con sus ids y se
 * reintenta cada 20 s (useColaSinConexion). La lógica que decide (carrito,
 * cupo, filas, cola) está en mostradorLogica.js, con pruebas.
 */

const CARRITO_KEY = "klasea.consumibles.mostrador.carrito";
const FOCO_KEY = "klasea.consumibles.mostrador.foco";
const INFO_VACIA = { cargando: false, hoy: [], verificadas: [], obras: [], errorHoy: "", errorObras: "", desde: null, hasta: null };
const ENTERAS = new Set(["unidad", "unidades", "u", "un", "uni", "par", "pares", "rollo", "rollos", "caja", "cajas"]);

// Lo que estaba en el carrito sobrevive a un F5 (media hora): no se vuelve a marcar todo.
function restaurarCarrito(sede) {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(`${CARRITO_KEY}.${sede}`) || window.sessionStorage.getItem(CARRITO_KEY) || "null");
    if (!v || !Array.isArray(v.carrito) || (v.sede && v.sede !== sede)) return { id: nuevoId(), carrito: [], modo: "retiro" };
    // La clave anterior mezclaba las sedes. Se migra una vez, sin dejar un
    // borrador viejo que reaparezca después de confirmar y limpiar el nuevo.
    if (!window.sessionStorage.getItem(`${CARRITO_KEY}.${sede}`)) {
      window.sessionStorage.setItem(`${CARRITO_KEY}.${sede}`, JSON.stringify(v));
      window.sessionStorage.removeItem(CARRITO_KEY);
    }
    return { ...v, id: v.id || nuevoId(), modo: v.modo === "devolucion" ? "devolucion" : "retiro" };
  } catch {
    return { id: nuevoId(), carrito: [], modo: "retiro" };
  }
}

function leerFoco() {
  try { return window.localStorage.getItem(FOCO_KEY) === "1"; } catch { return false; }
}

const esEditable = (el) => {
  const tag = String(el?.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || Boolean(el?.isContentEditable);
};

export default function MostradorTab({ sede }) {
  const toast = useToast();
  const balanza = useBalanza();
  const raizRef = useRef(null);
  const campoRef = useRef(null);

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [catalogo, setCatalogo] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [ranking, setRanking] = useState([]);
  const [obrasActivas, setObrasActivas] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  // Externos (herreros, vidrieros): empresa por persona, para pedir quién autoriza.
  const [externos, setExternos] = useState(() => ({ empresas: [], porEmpleado: new Map() }));
  const externosRef = useRef(externos);
  useEffect(() => { externosRef.current = externos; }, [externos]);
  const [recarga, setRecarga] = useState(0);
  const [refrescando, setRefrescando] = useState(false);
  const [versionMovs, setVersionMovs] = useState(0);

  // ── Estado del mostrador ──────────────────────────────────────────────────
  const [inicial] = useState(() => restaurarCarrito(sede));
  const [modo, setModo] = useState(inicial.modo);
  const [paso, setPaso] = useState("marcar"); // marcar | firmar | listo
  const [carrito, setCarrito] = useState(inicial.carrito);
  const [texto, setTexto] = useState("");
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const [capa, setCapa] = useState(null); // teclado | peso | desconocido | anular | cola | movimientos
  const [persona, setPersona] = useState(inicial.persona ?? null);
  const [infoPersona, setInfoPersona] = useState(() => inicial.persona ? { ...INFO_VACIA, errorHoy: "Volvé a verificar lo de hoy.", errorObras: "Elegí el destino manualmente." } : INFO_VACIA);
  const [destino, setDestino] = useState(inicial.destino ?? null);
  const [destinoAuto, setDestinoAuto] = useState(false);
  const [autorizaCupo, setAutorizaCupo] = useState(inicial.autorizaCupo ?? "");
  const [notaDevolucion, setNotaDevolucion] = useState(inicial.notaDevolucion ?? "");
  const [guardando, setGuardando] = useState(false);
  const [corrigiendoMovimiento, setCorrigiendoMovimiento] = useState(false);
  const [autoConfirmar, setAutoConfirmar] = useState(false);
  const [listo, setListo] = useState(null);
  const [operacion, setOperacion] = useState(null);
  const [sinPersistir, setSinPersistir] = useState(false);
  const [recuperado, setRecuperado] = useState(false);
  const [errorOperacion, setErrorOperacion] = useState("");
  const [foco, setFoco] = useState(leerFoco);
  const [ancho, setAncho] = useState(1200);
  const [enLinea, setEnLinea] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const [esTactil] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches));

  const estadoRef = useRef({ paso: "marcar", capa: null, carritoVacio: true });
  const controlRef = useRef({ carritoId: inicial.id, pedido: 0, paso: "marcar", guardando: false, operacionId: null, auto: false });
  const carritoRef = useRef(inicial.carrito);
  const vivoRef = useRef(true);
  const textoRef = useRef("");
  const busquedaTimerRef = useRef(null);
  const autoTimerRef = useRef(null);
  const confirmarRef = useRef(null);
  const empezarRef = useRef(null);
  const publicadoRef = useRef("");
  const operacionesRef = useRef([]);

  const devolucion = modo === "devolucion";
  const angosto = ancho < 820;
  const amplio = ancho >= 1240;

  useEffect(() => {
    estadoRef.current = { paso, capa, carritoVacio: carrito.length === 0 };
  });

  const cola = useColaSinConexion({
    enviar: (filas) => enviarFilas(filas, { timeoutMs: 15_000 }),
    consultar: fetchFilasPorIds,
    onEnviado: () => setVersionMovs((v) => v + 1),
  });
  useEffect(() => { operacionesRef.current = cola.operaciones; }, [cola.operaciones]);
  useEffect(() => {
    const actual = cola.operaciones.find((e) => e.id === operacion?.id);
    if (actual) setOperacion(actual);
  }, [cola.operaciones, operacion?.id]);
  useEffect(() => {
    vivoRef.current = true;
    return () => {
      vivoRef.current = false;
      controlRef.current.pedido += 1;
      window.clearTimeout(autoTimerRef.current);
      window.clearTimeout(busquedaTimerRef.current);
    };
  }, []);

  // ── Carga ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    const cache = leerDatosMostrador(sede);
    if (cache.catalogo) setCatalogo(cache.catalogo);
    conTimeout(fetchCatalogo({ sede }), 7000, "No se pudo abrir el catálogo a tiempo.")
      .then((cat) => {
        if (!vivo) return;
        const pendientes = operacionesRef.current.filter((e) => e.estado !== "enviado").flatMap((e) => e.filas).filter((f) => f.sede === sede);
        setCatalogo(aplicarStockLocal(cat, pendientes));
        setErrorCarga("");
        guardarDatosMostrador(sede, { catalogo: cat });
      })
      .catch((e) => { if (vivo) setErrorCarga(cache.catalogo ? "Sin red: usando el catálogo guardado en este equipo." : e?.message || "No se pudo abrir el catálogo."); })
      .finally(() => { if (vivo) setRefrescando(false); });
    return () => { vivo = false; };
  }, [sede, recarga]);

  useEffect(() => {
    let vivo = true;
    const cache = leerDatosMostrador(sede);
    setObrasActivas(cache.obras ?? []);
    setEmpleados(cache.empleados ?? []);
    if (cache.externos) setExternos({ empresas: cache.externos.empresas ?? [], porEmpleado: new Map(cache.externos.personas ?? []) });
    Promise.allSettled([conTimeout(fetchMasRetirados({ sede }), 7000), conTimeout(fetchObrasActivas(), 7000), conTimeout(fetchEmpleadosMostrador(), 7000), conTimeout(fetchExternos(), 7000)]).then(([r, o, e, x]) => {
      if (!vivo) return;
      if (r.status === "fulfilled") setRanking(r.value);
      if (o.status === "fulfilled") setObrasActivas(o.value);
      if (e.status === "fulfilled") setEmpleados(e.value);
      if (x.status === "fulfilled") setExternos(x.value);
      guardarDatosMostrador(sede, {
        ...(o.status === "fulfilled" ? { obras: o.value } : {}),
        ...(e.status === "fulfilled" ? { empleados: e.value } : {}),
        ...(x.status === "fulfilled" ? { externos: { empresas: x.value.empresas, personas: [...x.value.porEmpleado] } } : {}),
      });
    });
    return () => { vivo = false; };
  }, [sede, recarga]);

  useEffect(() => {
    if (cola.cargando || cola.error || recuperado) return;
    const guardada = recuperarOperacion(cola.operaciones, inicial.id, sede);
    if (guardada?.finalizada) {
      // La marca durable manda aunque F5 haya ocurrido antes de quitar el
      // sessionStorage. Ese borrador nunca puede volver a generar otros ids.
      try { window.sessionStorage.removeItem(`${CARRITO_KEY}.${sede}`); } catch { /* la marca impide restaurarlo */ }
      controlRef.current = transicionControl(controlRef.current, { tipo: "empezar", id: nuevoId() });
      carritoRef.current = [];
      setCarrito([]); setPersona(null); setDestino(null); setAutorizaCupo(""); setNotaDevolucion("");
    } else if (guardada) {
      controlRef.current = { ...controlRef.current, carritoId: guardada.borradorId, operacionId: guardada.id, paso: "firmar", auto: false };
      setOperacion(guardada);
      const foto = guardada.borrador ?? {};
      carritoRef.current = foto.carrito ?? [];
      setCarrito(carritoRef.current); setModo(guardada.tipo); setPersona(foto.persona ?? null);
      setDestino(foto.destino ?? null); setAutorizaCupo(foto.autorizaCupo ?? ""); setNotaDevolucion(foto.notaDevolucion ?? "");
      setPaso("firmar");
      setErrorOperacion("Recuperamos la operación original. Continuá el cierre con los mismos ids o revisala en la cola.");
    }
    setRecuperado(true);
  }, [cola.cargando, cola.error, cola.operaciones, inicial.id, recuperado, sede]);

  // Con el carrito vacío, cada 5 minutos se refresca el stock (conteos y
  // retiros de otros equipos). Con algo marcado no se toca nada.
  useEffect(() => {
    const reloj = window.setInterval(() => {
      const e = estadoRef.current;
      if (e.paso === "marcar" && !e.capa && e.carritoVacio) setRecarga((n) => n + 1);
    }, 5 * 60_000);
    return () => window.clearInterval(reloj);
  }, []);

  useEffect(() => {
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // El ancho real de la pestaña (con el menú abierto es bastante menos que la ventana).
  useEffect(() => {
    const el = raizRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entrada]) => setAncho(Math.round(entrada.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!recuperado || controlRef.current.operacionId || controlRef.current.paso === "listo") return;
    try {
      if (carrito.length) window.sessionStorage.setItem(`${CARRITO_KEY}.${sede}`, JSON.stringify({ id: controlRef.current.carritoId, sede, carrito, modo, persona, destino, autorizaCupo, notaDevolucion, guardadoAt: Date.now() }));
      else window.sessionStorage.removeItem(`${CARRITO_KEY}.${sede}`);
    } catch { /* modo privado: no se guarda */ }
  }, [carrito, modo, persona, destino, autorizaCupo, notaDevolucion, sede, recuperado]);

  // Modo foco: el menú lateral se pliega mientras el mostrador lo pida.
  useEffect(() => { plegarMenu(foco ? true : null); }, [foco]);
  useEffect(() => () => plegarMenu(null), []);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const porId = useMemo(() => new Map((catalogo ?? []).map((i) => [i.id, i])), [catalogo]);
  const indice = useMemo(() => indexarCodigos(catalogo ?? []), [catalogo]);
  const popularidad = useMemo(() => new Map(ranking.map((r, i) => [r.materialId, Math.max(0, 9 - Math.floor(i / 4))])), [ranking]);
  const favoritos = useMemo(() => elegirFavoritos(catalogo ?? [], ranking, 24), [catalogo, ranking]);
  const resultados = useMemo(
    () => (textoBusqueda.trim() && !cantidadTipeada(textoBusqueda) ? buscarEnCatalogo(catalogo ?? [], textoBusqueda, { max: 40, popularidad }) : []),
    [catalogo, textoBusqueda, popularidad],
  );
  const enCarrito = useMemo(() => new Map(carrito.map((l) => [l.materialId, l.cantidad])), [carrito]);
  const empleadosPorUid = useMemo(
    () => new Map(empleados.filter((e) => e.nfc_uid).map((e) => [normalizeNfcUid(e.nfc_uid), e])),
    [empleados],
  );
  const obrasPorId = useMemo(
    () => new Map([...obrasActivas, ...infoPersona.obras].map((o) => [o.id, o])),
    [obrasActivas, infoPersona.obras],
  );
  const problemas = useMemo(() => problemasDelCarrito(carrito, porId, modo), [carrito, porId, modo]);
  const filasLocalesHoy = useMemo(() => retirosPendientesDe(cola.operaciones, persona?.id, infoPersona.desde ?? rangoDeHoyArgentina().desde, infoPersona.hasta ?? rangoDeHoyArgentina().hasta),
    [cola.operaciones, persona?.id, infoPersona.desde, infoPersona.hasta]);
  const hoyReconciliado = useMemo(() => reconciliarHoy(infoPersona.hoy, [{ filas: filasLocalesHoy }], infoPersona.verificadas), [infoPersona.hoy, infoPersona.verificadas, filasLocalesHoy]);
  const hoyMap = useMemo(
    () => cantidadesDeHoy(hoyReconciliado), [hoyReconciliado],
  );
  const excedidos = useMemo(
    () => (!devolucion && persona ? evaluarCupo(carrito, porId, hoyMap, { incierto: Boolean(infoPersona.errorHoy) }) : []),
    [devolucion, persona, carrito, porId, hoyMap, infoPersona.errorHoy],
  );
  const destinoTexto = textoDestino(destino, obrasPorId);
  const bloqueadoFirma = guardando || Boolean(operacion) || infoPersona.cargando || problemas.length > 0
    || ((excedidos.length > 0 || (persona?.externo && !devolucion)) && !autorizaCupo.trim());
  const empleadosConEmpresa = useMemo(
    () => empleados.map((e) => (externos.porEmpleado.has(e.id) ? { ...e, empresa: externos.porEmpleado.get(e.id), externo: true } : e)),
    [empleados, externos],
  );

  // ── La pantalla del operario (/pantalla-egreso) ───────────────────────────
  useEffect(() => {
    if (paso === "listo") return;
    let datos = null;
    if (!devolucion && carrito.length) {
      const conPersona = paso === "firmar" && persona;
      datos = armarPantallaOperario({
        carrito,
        porId,
        sede,
        persona: conPersona ? persona : null,
        destinoTexto: conPersona ? destinoTexto : "",
        estado: guardando ? "processing" : conPersona ? "identified" : "draft",
      });
    }
    const firma = datos ? JSON.stringify(datos) : "idle";
    if (firma === publicadoRef.current) return;
    publicadoRef.current = firma;
    if (datos) publishEgresoDisplay(datos);
    else resetEgresoDisplay();
  }, [carrito, porId, sede, persona, destinoTexto, guardando, devolucion, paso]);
  useEffect(() => () => { resetEgresoDisplay(); }, []);

  // ── El campo del lector ───────────────────────────────────────────────────
  // La búsqueda espera 160 ms quieta: el lector escribe el código entero en
  // menos que eso, así la botonera no parpadea con resultados de medio código.
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
    if (esTactil) return;
    const e = { paso: controlRef.current.paso, capa: estadoRef.current.capa, carritoVacio: carritoRef.current.length === 0 };
    if (e.paso !== "marcar" || e.capa) return;
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

  // ── Marcar ────────────────────────────────────────────────────────────────
  function cortarAuto() {
    window.clearTimeout(autoTimerRef.current);
    controlRef.current = transicionControl(controlRef.current, { tipo: "cortar" });
    setAutoConfirmar(false);
  }

  function editable() { return recuperado && puedeEditar(controlRef.current); }

  function modificarCarrito(cambiar) {
    if (!editable()) return;
    cortarAuto();
    const siguiente = limpiarCanjes(cambiar(carritoRef.current), modo);
    if (!siguiente.length) { empezarDeNuevo(); return; }
    carritoRef.current = siguiente;
    setCarrito(siguiente);
  }

  function marcar(item, { cantidad = 1 } = {}) {
    if (!editable()) return;
    const ahora = Date.now();
    modificarCarrito((c) => agregarAlCarrito(c, item, { cantidad, ahora }));
    if (item.formaEntrega === "peso") setCapa({ tipo: "peso", key: item.id });
  }

  async function procesarCodigo(crudo) {
    if (!editable()) return;
    const k = normalizarCodigo(crudo);
    if (!k) return;
    const item = indice.get(k);
    if (item) {
      marcar(item);
      if (estadoRef.current.paso === "firmar") toast.info(`Sumado: ${item.descripcion}`);
      return;
    }
    // ¿Una tarjeta en un lector que escribe como teclado?
    const uid = normalizeNfcUid(k);
    if (empleadosPorUid.has(uid)) {
      alLeerTarjeta(uid, empleadosPorUid.get(uid));
      return;
    }
    // En la firma lo que no es producto casi seguro es una tarjeta, aunque el
    // lector mande el UID en un formato raro.
    if (pareceUidTarjeta(uid) || estadoRef.current.paso === "firmar") {
      await alLeerTarjeta(uid, null, k);
      return;
    }
    setCapa({ tipo: "desconocido", codigo: k });
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
      if (carrito.length) irAFirmar();
      return;
    }
    const item = indice.get(normalizarCodigo(v));
    if (item) { cambiarTexto(""); marcar(item); return; }
    const n = cantidadTipeada(v);
    if (n != null) {
      cambiarTexto("");
      if (carrito.length) modificarCarrito((c) => (c.length ? fijarCantidad(c, c[0].key, n) : c));
      return;
    }
    const encontrados = buscarEnCatalogo(catalogo ?? [], v, { max: 40, popularidad });
    if (encontrados.length) {
      marcar(encontrados[textoBusqueda === valor ? Math.min(resaltado, encontrados.length - 1) : 0]);
      return;
    }
    cambiarTexto("");
    procesarCodigo(v);
  }

  function alTeclearCampo(e) {
    if (resultados.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setResaltado((i) => Math.max(0, Math.min(resultados.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
      return;
    }
    if (e.key === "Escape" && texto) cambiarTexto("");
    lectorCampo.onKeyDown(e);
  }

  // Una tecla suelta (el foco quedó en un botón, o en la pantalla de listo)
  // se manda al campo del lector: ningún escaneo se pierde.
  useEffect(() => {
    function alTeclear(e) {
      if (controlRef.current.guardando || (!puedeEditar(controlRef.current) && controlRef.current.paso !== "listo")) return;
      const { paso: p, capa: c } = estadoRef.current;
      if (c || (p !== "marcar" && p !== "listo")) return;
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

  // Con el foco en el campo, tocar un botón no se lo lleva: el próximo
  // escaneo tiene que caer en el campo.
  function retenerFoco(e) {
    if (document.activeElement === campoRef.current && e.target.closest?.("button")) e.preventDefault();
  }

  function elegirDeBotonera(item) {
    marcar(item);
  }

  // ── Firmar ────────────────────────────────────────────────────────────────
  function irAFirmar() {
    if (!editable()) return;
    if (!carrito.length) return;
    if (problemas.length) {
      const p = problemas[0];
      toast.warning(p.texto);
      if (p.tipo === "cantidad" && porId.get(p.key)?.formaEntrega === "peso") setCapa({ tipo: "peso", key: p.key });
      return;
    }
    campoRef.current?.blur();
    cortarAuto();
    controlRef.current = transicionControl(controlRef.current, { tipo: "paso", paso: "firmar" });
    setPaso("firmar");
  }

  function volverAMarcar() {
    if (!editable()) return;
    cortarAuto();
    controlRef.current = transicionControl(controlRef.current, { tipo: "paso", paso: "marcar" });
    setInfoPersona((info) => ({ ...info, cargando: false, errorHoy: info.cargando ? "La lectura fue cancelada. Confirmá con autorización." : info.errorHoy }));
    setPaso("marcar");
  }

  /** Persona provisoria: se conserva la firma y RRHH/Técnica revisan el alta. */
  async function darDeAltaExterno({ nombre, empresa, dni }) {
    const emp = await conTimeout(altaExterno({ id: nuevoId(), nombre, empresa, dni, sede }), 10000, "La red no contestó a tiempo. Probá de nuevo.");
    if (emp.activo === false) throw new Error(`${emp.nombre} figura dado de baja en RRHH.`);
    setEmpleados((prev) => (prev.some((e) => e.id === emp.id) ? prev : [...prev, emp]));
    if (emp.externo) {
      setExternos((prev) => ({
        empresas: prev.empresas.some((x) => x.nombre === emp.empresa) ? prev.empresas : [...prev.empresas, { id: null, nombre: emp.empresa }],
        porEmpleado: new Map(prev.porEmpleado).set(emp.id, emp.empresa),
      }));
    }
    return emp;
  }

  function quitarPersona() {
    if (!editable()) return;
    controlRef.current = transicionControl(controlRef.current, { tipo: "tarjeta" });
    cortarAuto();
    setPersona(null);
    setInfoPersona(INFO_VACIA);
    setDestino(null);
    setDestinoAuto(false);
    setAutorizaCupo("");
    setAutoConfirmar(false);
  }

  function identificar(emp, metodo, uid = null) {
    if (!editable()) return;
    cortarAuto();
    controlRef.current = transicionControl(controlRef.current, { tipo: "identificar", auto: metodo === "nfc" && !devolucion });
    const consulta = tokenConsulta(controlRef.current);
    const { desde, hasta } = rangoDeHoyArgentina();
    const empresaExterna = externosRef.current.porEmpleado.get(emp.id) ?? (emp.externo ? emp.empresa : null);
    setPersona({
      id: emp.id,
      nombre: emp.nombre,
      dni: emp.dni ?? null,
      fotoUrl: emp.foto_url ?? "",
      sede: emp.sede ?? "",
      empresa: empresaExterna ?? null,
      externo: externosRef.current.porEmpleado.has(emp.id) || emp.externo === true,
      provisorio: emp.provisorio === true,
      metodo,
      uid,
      carritoId: controlRef.current.carritoId,
    });
    setInfoPersona({ ...INFO_VACIA, cargando: true, desde, hasta });
    setDestino(null);
    setDestinoAuto(false);
    setAutorizaCupo("");
    setAutoConfirmar(metodo === "nfc" && !devolucion);
    campoRef.current?.blur();
    setPaso("firmar");

    const sinRed = () => Promise.reject(new Error("Sin conexión: elegí el destino manualmente."));
    Promise.allSettled([
      devolucion ? Promise.resolve({ hoy: [], verificadas: [] }) : navigator.onLine === false ? sinRed() : conTimeout(fetchHoyMostrador(emp.id, operacionesRef.current), 7000),
      navigator.onLine === false ? sinRed() : conTimeout(obrasDeEmpleado(emp.id), 7000),
    ]).then(([h, o]) => {
      if (!vivoRef.current || !consultaVigente(controlRef.current, consulta)) return;
      // obrasDeEmpleado trae también obras terminadas: se filtran acá.
      const obras = o.status === "fulfilled" ? obrasVigentes(o.value) : [];
      setInfoPersona((prev) => ({
        ...prev,
        cargando: false,
        hoy: h.status === "fulfilled" ? h.value.hoy : [],
        verificadas: h.status === "fulfilled" ? h.value.verificadas : [],
        obras,
        errorHoy: h.status === "rejected" ? (h.reason?.message || "sin conexión") : "",
        errorObras: o.status === "rejected" ? (o.reason?.message || "sin conexión") : "",
      }));
      const d = destinoInicial(obras);
      setDestino((prev) => prev ?? d);
      setDestinoAuto(Boolean(d) && h.status === "fulfilled" && o.status === "fulfilled");
    });
  }

  async function alLeerTarjeta(raw, conocido = null, codigoDesconocido = null) {
    if (!editable()) return;
    const uid = normalizeNfcUid(raw);
    if (!uid) return;
    if (persona?.uid !== uid) cortarAuto();
    const e = { paso: controlRef.current.paso, capa: estadoRef.current.capa, carritoVacio: carritoRef.current.length === 0 };
    if (e.capa) { toast.info("Cerrá la ventana abierta y volvé a apoyar la tarjeta."); return; }
    if (e.paso === "listo" || (e.paso === "marcar" && e.carritoVacio)) {
      toast.info("Primero pasá lo que se lleva: la tarjeta va al final, para firmar.");
      return;
    }
    if (e.paso === "firmar" && persona?.uid === uid) return;
    // Se corta en el mismo evento, sin esperar el próximo render: el timer de
    // A no puede dispararse mientras la tarjeta de B está buscando respuesta.
    quitarPersona();
    const consulta = tokenConsulta(controlRef.current);
    let emp = conocido ?? (navigator.onLine === false ? empleadosPorUid.get(uid) : null);
    if (!emp) {
      try {
        emp = await conTimeout(buscarEmpleadoPorNfc(uid), 7000, "No se pudo identificar la tarjeta a tiempo. Elegí por nombre o DNI.");
        if (!vivoRef.current || !consultaVigente(controlRef.current, consulta)) return;
      } catch (err) {
        if (!vivoRef.current || !consultaVigente(controlRef.current, consulta)) return;
        // Sin red: la lista de RRHH que ya estaba en memoria alcanza para saber quién es.
        emp = empleadosPorUid.get(uid) ?? null;
        if (!emp) {
          controlRef.current = transicionControl(controlRef.current, { tipo: "paso", paso: "firmar" });
          setPaso("firmar"); setInfoPersona({ ...INFO_VACIA, errorTarjeta: err?.message || "Elegí por nombre o DNI." });
          toast.info("No se pudo leer la tarjeta: elegí por nombre o DNI."); return;
        }
      }
    }
    if (!vivoRef.current || !consultaVigente(controlRef.current, consulta)) return;
    if (!emp) {
      if (codigoDesconocido) setCapa({ tipo: "desconocido", codigo: codigoDesconocido });
      else toast.warning(`La tarjeta ${uid} no tiene a nadie asignado en RRHH.`);
      return;
    }
    if (emp.activo === false) { toast.warning(`${emp.nombre} figura inactivo en RRHH.`); return; }
    identificar(emp, "nfc", uid);
  }

  const nfc = useNfcBridge({ enabled: true, onUid: (uid) => alLeerTarjeta(uid) });

  // En la firma el foco está en el panel: el lector de tarjetas (o el de
  // códigos, si se olvidaron de algo) escribe como teclado y lo toma este hook.
  useKeyboardWedge({
    enabled: paso === "firmar" && !capa && !guardando && !operacion && recuperado,
    minLength: 4,
    timeoutMs: 65,
    onScan: (codigo) => { procesarCodigo(codigo); },
  });

  function elegirYConfirmar(dest) {
    if (!editable()) return;
    setDestino(dest);
    setDestinoAuto(false);
    cortarAuto();
    if (!bloqueadoFirma) confirmar(dest);
  }

  // ── Confirmar ─────────────────────────────────────────────────────────────
  async function confirmar(destinoForzado) {
    if (!recuperado || capa || controlRef.current.guardando || controlRef.current.paso !== "firmar") return;
    const carritoId = controlRef.current.carritoId;
    const vigente = () => vivoRef.current && controlRef.current.carritoId === carritoId && controlRef.current.guardando && controlRef.current.paso === "firmar";
    if (!operacion && (!editable() || infoPersona.cargando || problemas.length)) return;
    if (!operacion && !devolucion && (!persona || persona.carritoId !== carritoId)) {
      toast.warning("Volvé a identificar a quien retira."); return;
    }
    cortarAuto();
    controlRef.current = { ...controlRef.current, guardando: true, pedido: controlRef.current.pedido + 1, auto: false };
    setGuardando(true);
    setErrorOperacion("");
    try {
      let original = operacion;
      if (!original) {
        const dest = destinoForzado === undefined ? destino : destinoForzado;
        const empleado = persona ? { id: persona.id, nombre: persona.nombre, dni: persona.dni } : null;
        const metodoFirma = persona?.metodo === "nfc" ? "nfc" : "sin_tarjeta";
        let cupoActual = excedidos;
        if (!devolucion && carrito.some((l) => Number(porId.get(l.materialId)?.config?.cupo_diario) > 0)) {
          const operacionesActuales = await cola.leer();
          if (!vigente()) return;
          let lectura = { hoy: [], verificadas: [] };
          let incierto = false;
          try {
            if (navigator.onLine === false) throw new Error("Sin conexión.");
            lectura = await conTimeout(fetchHoyMostrador(persona.id, operacionesActuales), 7000, "No se pudo verificar el cupo a tiempo.");
          }
          catch { incierto = true; }
          if (!vigente()) return;
          const rango = rangoDeHoyArgentina();
          const locales = retirosPendientesDe(operacionesActuales, persona.id, rango.desde, rango.hasta);
          cupoActual = evaluarCupo(carrito, porId, cantidadesDeHoy(reconciliarHoy(lectura.hoy, [{ filas: locales }], lectura.verificadas)), { incierto });
          setInfoPersona((i) => ({ ...i, ...rango, ...lectura, errorHoy: incierto ? "No se pudo verificar el cupo. Hace falta autorización." : "" }));
        }
        const lote = nuevoId();
        const datos = devolucion ? null : datosParaRetiro({ carrito, porId, empleado, metodoFirma, sede, lote, destino: dest, excedidos: cupoActual, autorizaCupo, externo: Boolean(persona?.externo) });
        const filas = devolucion
          ? armarFilasDevolucion({ carrito, porId, empleado, metodoFirma, sede, lote, obraId: dest?.tipo === "obra" ? dest.obraId : null, nota: notaDevolucion }, { nuevoId })
          : notasDelRetiro(armarFilasRetiro(datos), datos);
        const destTxt = textoDestino(dest, obrasPorId);
        original = crearOperacion({ id: lote, borradorId: carritoId, tipo: modo, filas, creadoAt: new Date().toISOString(),
          resumen: resumenDelRegistro({ tipo: modo, carrito, porId, persona, destinoTexto: destTxt }),
          borrador: { carrito, persona, destino: dest, autorizaCupo, notaDevolucion } });
        // Desde acá el intento conserva sus ids incluso si falla el disco. No
        // puede corregirse ni volver a generar otro lote por un error de red.
        controlRef.current = transicionControl(controlRef.current, { tipo: "persistida", id: original.id });
        setSinPersistir(true);
        setOperacion(original);
      }
      const guardada = await cola.encolar(original);
      if (!vigente()) return;
      setSinPersistir(false);
      controlRef.current.operacionId = guardada.id;
      setOperacion(guardada);
      const resultado = await cola.procesar(guardada.id);
      if (!vigente()) return;
      setOperacion(resultado);
      if (["rechazado", "vencido"].includes(resultado.estado)) {
        setErrorOperacion(resultado.error || "Revisá la operación en la cola antes de regularizarla.");
        return;
      }
      const terminada = await cola.finalizar(resultado.id, () => window.sessionStorage.removeItem(`${CARRITO_KEY}.${sede}`));
      if (!vigente()) return;
      // La marca durable se confirma primero. Sacar el borrador antes de Listo
      // evita que los cuatro segundos del resumen puedan duplicar el retiro.
      carritoRef.current = [];
      setCarrito([]);
      if (!guardada.finalizada) setCatalogo((c) => c ? aplicarStockLocal(c, terminada.filas) : c);
      const resumen = { ...terminada.resumen, sinConexion: terminada.estado !== "enviado", estadoEnvio: terminada.estado };
      setListo(resumen);
      controlRef.current = transicionControl(controlRef.current, { tipo: "terminar" });
      setPaso("listo");
      setVersionMovs((v) => v + 1);
      if (terminada.tipo === "retiro") {
        publicadoRef.current = "complete";
        publishEgresoDisplay(armarPantallaOperario({ carrito: terminada.borrador.carrito, porId, sede, persona: terminada.borrador.persona,
          destinoTexto: resumen.destino, estado: "complete", ahoraIso: terminada.creadoAt }));
      }
    } catch (err) {
      if (!vigente()) return;
      const textoError = err?.message || String(err);
      setErrorOperacion(textoError);
      toast.error(textoError);
    } finally {
      if (vivoRef.current && controlRef.current.carritoId === carritoId) {
        controlRef.current = transicionControl(controlRef.current, { tipo: "error" });
        setGuardando(false);
      }
    }
  }

  function empezarDeNuevo() {
    if (controlRef.current.guardando || (controlRef.current.operacionId && controlRef.current.paso !== "listo")) return;
    cortarAuto();
    controlRef.current = transicionControl(controlRef.current, { tipo: "empezar", id: nuevoId() });
    estadoRef.current = { paso: "marcar", capa: null, carritoVacio: true };
    carritoRef.current = [];
    setCarrito([]);
    setPersona(null);
    setInfoPersona(INFO_VACIA);
    setDestino(null);
    setDestinoAuto(false);
    setAutorizaCupo("");
    setNotaDevolucion("");
    setOperacion(null);
    setSinPersistir(false);
    setErrorOperacion("");
    setCapa(null);
    cambiarTexto("");
    setListo(null);
    setPaso("marcar");
    try { window.sessionStorage.removeItem(`${CARRITO_KEY}.${sede}`); } catch { /* se vuelve a intentar en el efecto */ }
  }

  async function seguirConOtroCarrito() {
    if (!operacion || sinPersistir || controlRef.current.guardando) return;
    const id = operacion.id;
    controlRef.current.guardando = true;
    setGuardando(true);
    try {
      await cola.finalizar(id, () => window.sessionStorage.removeItem(`${CARRITO_KEY}.${sede}`));
      if (!vivoRef.current || controlRef.current.operacionId !== id) return;
      controlRef.current = { ...controlRef.current, guardando: false, paso: "listo" };
      empezarDeNuevo();
    } catch (err) { toast.error(err?.message || "No se pudo conservar la operación."); }
    finally { controlRef.current.guardando = false; if (vivoRef.current) setGuardando(false); }
  }

  useEffect(() => {
    confirmarRef.current = confirmar;
    empezarRef.current = empezarDeNuevo;
  });

  // Tarjeta + una sola obra + nada pendiente: se confirma solo. Cualquier
  // toque en la pantalla de firma lo corta.
  const autoListo = paso === "firmar" && !devolucion && autoConfirmar && persona?.metodo === "nfc"
    && !infoPersona.cargando && destinoAuto && destino?.tipo === "obra" && !bloqueadoFirma && !capa;
  useEffect(() => {
    if (!autoListo) return undefined;
    const consulta = tokenConsulta(controlRef.current);
    autoTimerRef.current = window.setTimeout(() => {
      if (controlRef.current.auto && consultaVigente(controlRef.current, consulta)) confirmarRef.current?.();
    }, AUTO_CONFIRMAR_MS);
    return () => window.clearTimeout(autoTimerRef.current);
  }, [autoListo]);

  useEffect(() => {
    if (paso !== "listo") return undefined;
    const t = window.setTimeout(() => empezarRef.current?.(), LISTO_MS);
    return () => window.clearTimeout(t);
  }, [paso]);

  // ── Otras acciones ────────────────────────────────────────────────────────
  function cambiarModo(m) {
    if (!editable()) return;
    if (m === modo) return;
    quitarPersona();
    cortarAuto();
    carritoRef.current = m === "devolucion" ? limpiarCanjes(carritoRef.current, m)
      : carritoRef.current.map((l) => ({ ...l, canje: porId.get(l.materialId)?.formaEntrega === "canje" ? "trajo_usado" : null, autorizaCanje: "" }));
    setCarrito(carritoRef.current);
    controlRef.current = transicionControl(controlRef.current, { tipo: "paso", paso: "marcar" });
    setModo(m);
    setPaso("marcar");
  }

  async function vincular(item) {
    if (!editable()) return;
    const codigo = capa?.codigo;
    const consulta = tokenConsulta(controlRef.current);
    try {
      const k = await vincularCodigo({ materialId: item.id, codigo });
      if (!vivoRef.current || !consultaVigente(controlRef.current, consulta)) return;
      setCatalogo((c) => (c ? agregarCodigoAlCatalogo(c, item.id, k) : c));
      setCapa(null);
      marcar(item);
      toast.success(`Código vinculado a ${item.descripcion}.`);
    } catch (err) {
      if (!vivoRef.current || !consultaVigente(controlRef.current, consulta)) return;
      toast.error(err?.message || "No se pudo vincular el código.");
    }
  }

  async function anularFilas(filas, motivo) {
    const hechas = [];
    try {
      for (const f of filas) {
        await anularMovimiento(f.id, motivo);
        hechas.push(f);
      }
      setCapa(null);
      toast.success(hechas.length === 1 ? "Movimiento anulado." : `${hechas.length} movimientos anulados.`);
    } finally {
      if (hechas.length) {
        setCatalogo((c) => (c ? aplicarStockLocal(c, hechas.map((f) => ({ material_id: f.material_id, cantidad: -Number(f.cantidad) }))) : c));
      }
      setVersionMovs((v) => v + 1);
    }
  }

  function refrescar() {
    if (controlRef.current.guardando) return;
    setRefrescando(true);
    setRecarga((n) => n + 1);
    setVersionMovs((v) => v + 1);
    cola.intentar();
  }

  function alternarFoco() {
    const siguiente = !foco;
    try { window.localStorage.setItem(FOCO_KEY, siguiente ? "1" : "0"); } catch { /* sin almacenamiento */ }
    setFoco(siguiente);
  }

  function abrirPantallaOperario() {
    if (!openEgresoDisplayWindow()) toast.warning("El navegador bloqueó la ventana. Habilitá las ventanas emergentes para KlaseA.");
  }

  const alRafagaEnCapa = (codigo) => {
    if (!editable()) return;
    setCapa(null);
    procesarCodigo(codigo);
  };

  // ── Capas ─────────────────────────────────────────────────────────────────
  let capaVista = null;
  if (capa?.tipo === "teclado") {
    const l = carrito.find((x) => x.key === capa.key);
    const item = porId.get(capa.key);
    if (l && item) {
      const decimales = item.formaEntrega === "fraccionado" || !ENTERAS.has(normalizarTexto(item.unidad));
      capaVista = (
        <TecladoNumerico
          key={l.key}
          titulo={item.descripcion}
          unidad={item.unidad}
          valorInicial={l.cantidad}
          decimales={decimales}
          onListo={(n) => { modificarCarrito((c) => fijarCantidad(c, capa.key, n)); setCapa(null); }}
          onCerrar={() => setCapa(null)}
          onRafaga={alRafagaEnCapa}
        />
      );
    }
  } else if (capa?.tipo === "peso") {
    const l = carrito.find((x) => x.key === capa.key);
    const item = porId.get(capa.key);
    if (l && item) {
      capaVista = (
        <PesoBalanza
          key={l.key}
          item={item}
          linea={l}
          balanza={balanza}
          piezasDesdeGramos={piezasDesdeGramos}
          onGuardarReferencia={async (pesoUnitarioG) => {
            const guardado = await guardarPesoUnitarioDirecto(item.id, pesoUnitarioG);
            const actualizarReferencia = (producto) => producto.id === item.id
              ? { ...producto, pesoUnitarioG:Number(guardado.peso_unitario_g), pesoCalibradoAt:guardado.peso_calibrado_at }
              : producto;
            setCatalogo((actual) => actual?.map(actualizarReferencia));
            // El catálogo en pantalla ya incluye retiros locales pendientes;
            // actualizar solo la referencia en la copia base evita descontarlos dos veces al recargar.
            const cache = leerDatosMostrador(sede);
            if (cache.catalogo) guardarDatosMostrador(sede, { catalogo:cache.catalogo.map(actualizarReferencia) });
          }}
          onAplicar={(v) => { modificarCarrito((c) => fijarPeso(c, capa.key, v)); setCapa(null); }}
          onCerrar={() => setCapa(null)}
          onRafaga={alRafagaEnCapa}
        />
      );
    }
  } else if (capa?.tipo === "desconocido") {
    capaVista = (
      <CodigoDesconocido
        codigo={capa.codigo}
        catalogo={catalogo ?? []}
        popularidad={popularidad}
        onVincular={vincular}
        onDescartar={() => setCapa(null)}
        onRafaga={alRafagaEnCapa}
      />
    );
  } else if (capa?.tipo === "anular") {
    capaVista = (
      <AnularMovimiento grupo={capa.grupo} onAnular={anularFilas} onCerrar={() => setCapa(null)} />
    );
  } else if (capa?.tipo === "editarMovimiento") {
    capaVista = (
      <HojaMovimiento abierta clase="mst" ancho={600} titulo="Editar cantidades o agregar productos" onCerrar={corrigiendoMovimiento ? undefined : () => setCapa(null)}>
        <EditarMovimiento fila={capa.grupo.activas[0]} toast={toast} onOcupado={setCorrigiendoMovimiento} onCancelar={() => setCapa(null)} onListo={() => { setCapa(null); setVersionMovs((v) => v + 1); setRecarga((v) => v + 1); }} />
      </HojaMovimiento>
    );
  } else if (capa?.tipo === "cola") {
    capaVista = (
      <ColaSinConexion cola={cola.cola} enviando={cola.enviando} onReintentar={cola.intentar} onRevisar={cola.revisar} onCerrar={() => setCapa(null)} />
    );
  } else if (capa?.tipo === "movimientos") {
    capaVista = (
      <div className="mst-capa" onMouseDown={(e) => { if (e.target === e.currentTarget) setCapa(null); }}>
        <div className="mst-hoja" role="dialog" aria-modal="true" aria-label="Últimos movimientos" style={{ maxWidth: 460, height: "100%" }} onKeyDown={(e) => { if (e.key === "Escape") setCapa(null); }}>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <UltimosMovimientos
              sede={sede}
              version={versionMovs}
              pendientes={cola.cola.length}
              onAbrirCola={() => setCapa({ tipo: "cola" })}
              onAnular={(grupo) => setCapa({ tipo: "anular", grupo })}
              onEditar={(grupo) => setCapa({ tipo: "editarMovimiento", grupo })}
            />
          </div>
          <div className="mst-hoja-pie">
            <button type="button" className="ui-btn" onClick={() => setCapa(null)}>Cerrar</button>
          </div>
        </div>
      </div>
    );
  }

  const carritoProps = {
    carrito,
    porId,
    modo,
    persona,
    problemas,
    onSumar: (key, delta) => modificarCarrito((c) => sumarCantidad(c, key, delta)),
    onTeclado: (key) => { if (editable()) setCapa({ tipo: "teclado", key }); },
    onQuitar: (key) => modificarCarrito((c) => quitarLinea(c, key)),
    onPeso: (key) => { if (editable()) setCapa({ tipo: "peso", key }); },
    onCanje: (key, trajoUsado) => modificarCarrito((c) => fijarCanje(c, key, { trajoUsado })),
    onAutorizaCanje: (key, autoriza) => modificarCarrito((c) => fijarCanje(c, key, { trajoUsado: false, autoriza })),
    onVaciar: () => { if (editable()) empezarDeNuevo(); enfocarCampo(); },
    onQuitarPersona: quitarPersona,
    onFirmar: irAFirmar,
    onRafaga: procesarCodigo,
  };

  return (
    <div ref={raizRef} className={`mst${amplio ? " is-ancho" : ""}${angosto ? " is-angosto" : ""}`} onMouseDown={retenerFoco}
      onKeyDownCapture={(e) => { if (controlRef.current.guardando) { e.preventDefault(); e.stopPropagation(); } }}
      onClickCapture={(e) => { if (controlRef.current.guardando) { e.preventDefault(); e.stopPropagation(); } }}>
      <style>{CSS_MOSTRADOR}</style>

      <div className="mst-barra">
        <div className="mst-modos" role="group" aria-label="Qué se registra">
          <button type="button" disabled={!recuperado || guardando || Boolean(operacion)} className={`mst-modo${!devolucion ? " is-activo" : ""}`} aria-pressed={!devolucion} onClick={() => cambiarModo("retiro")}>
            <ArrowUpFromLine size={15} aria-hidden="true" /> Retiro
          </button>
          <button type="button" disabled={!recuperado || guardando || Boolean(operacion)} className={`mst-modo is-devolucion${devolucion ? " is-activo" : ""}`} aria-pressed={devolucion} onClick={() => cambiarModo("devolucion")}>
            <ArrowDownToLine size={15} aria-hidden="true" /> Devolución
          </button>
        </div>

        <div className={`mst-lector${devolucion ? " is-devolucion" : ""}`}>
          <ScanBarcode size={20} className="mst-lector-icono" aria-hidden="true" />
          <input
            ref={campoRef}
            disabled={!recuperado || guardando || Boolean(operacion)}
            value={texto}
            onChange={(e) => cambiarTexto(e.target.value)}
            onKeyDown={alTeclearCampo}
            onPaste={lectorCampo.onPaste}
            onBlur={alPerderFoco}
            placeholder={devolucion ? "Pasá lo que vuelve o buscá por nombre" : "Pasá el código o buscá por nombre · x5 cambia la cantidad"}
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
          {!enLinea ? (
            <span className="mst-chip is-error" title="Sin conexión: los retiros se guardan en este equipo">
              <WifiOff size={13} /><span className="mst-chip-texto">Sin red</span>
            </span>
          ) : null}
          <ChipCola cola={cola.cola} enviando={cola.enviando} onAbrir={() => setCapa({ tipo: "cola" })} />
          {balanza.soportado ? (
            balanza.conectado ? (
              <span className="mst-chip is-ok" title="Balanza conectada"><Scale size={13} /><span className="mst-chip-texto">Balanza</span></span>
            ) : (
              <button type="button" className="mst-chip" onClick={() => balanza.conectar()} title="Conectar la balanza (la primera vez pide elegir el puerto)">
                <Plug size={13} /><span className="mst-chip-texto">Balanza</span>
              </button>
            )
          ) : null}
          <button
            type="button"
            className={`mst-chip${nfc.status === "connected" ? " is-ok" : ""}`}
            onClick={nfc.reconnect}
            title={nfc.status === "connected" ? "Lector de tarjetas conectado" : "No encuentro el puente del lector de tarjetas (ws://127.0.0.1:17777). Tocá para reintentar."}
          >
            <Nfc size={13} /><span className="mst-chip-texto">{nfc.status === "connected" ? "Tarjetas" : "Sin lector"}</span>
          </button>
          {!amplio ? (
            <button type="button" className="mst-icono-btn" onClick={() => setCapa({ tipo: "movimientos" })} aria-label="Últimos movimientos" title="Últimos movimientos">
              <History size={16} />
            </button>
          ) : null}
          <button type="button" className="mst-icono-btn" onClick={abrirPantallaOperario} aria-label="Abrir la pantalla del operario" title="Pantalla para el que retira">
            <MonitorUp size={16} />
          </button>
          {!angosto ? (
            <button type="button" className={`mst-icono-btn${foco ? " is-activo" : ""}`} onClick={alternarFoco} aria-pressed={foco} aria-label="Modo foco" title={foco ? "Volver a mostrar el menú" : "Plegar el menú lateral"}>
              {foco ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          ) : null}
          <button type="button" className="mst-icono-btn" onClick={refrescar} aria-label="Actualizar" title="Actualizar stock y movimientos">
            <RotateCcw size={16} className={refrescando ? "mst-gira" : ""} />
          </button>
        </div>
      </div>

      {!recuperado ? <Cargando compacto texto="Recuperando las operaciones del equipo…" /> : null}
      {cola.error ? <div className="mst-error" role="alert">{cola.error} Conservá el carrito; no entregues hasta guardar el registro.</div> : null}

      <div className="mst-cuerpo">
        <div className="mst-col mst-col-botonera">
          {errorCarga ? (
            <div className="mst-error" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1 }}>{errorCarga}</span>
              <button type="button" className="ui-btn" onClick={refrescar}>Reintentar</button>
            </div>
          ) : null}
          {!catalogo && !errorCarga ? <Cargando texto="Abriendo el mostrador…" /> : null}
          {catalogo ? (
            <fieldset disabled={!recuperado || guardando || Boolean(operacion)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "contents" }}>
            <Botonera
              favoritos={favoritos}
              resultados={resultados}
              buscando={Boolean(textoBusqueda.trim()) && !cantidadTipeada(textoBusqueda)}
              texto={textoBusqueda}
              resaltado={resaltado}
              enCarrito={enCarrito}
              modo={modo}
              onElegir={elegirDeBotonera}
              onResaltar={setResaltado}
            />
            </fieldset>
          ) : null}
        </div>

        <div className="mst-col mst-col-carrito">
          <fieldset disabled={!recuperado || guardando || Boolean(operacion)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "contents" }}>
          <Carrito {...carritoProps} />
          </fieldset>
        </div>

        {amplio ? (
          <div className="mst-col mst-col-movs">
            <UltimosMovimientos
              sede={sede}
              version={versionMovs}
              pendientes={cola.cola.length}
              onAbrirCola={() => setCapa({ tipo: "cola" })}
              onAnular={(grupo) => setCapa({ tipo: "anular", grupo })}
              onEditar={(grupo) => setCapa({ tipo: "editarMovimiento", grupo })}
            />
          </div>
        ) : null}
      </div>

      {angosto && carrito.length ? (
        <div className="mst-barra-firmar">
          <PieFirmar carrito={carrito} problemas={problemas} modo={modo} persona={persona} onFirmar={irAFirmar} />
        </div>
      ) : null}

      {paso === "firmar" ? (
        <Firma
          modo={modo}
          carrito={carrito}
          porId={porId}
          persona={persona}
          info={{ ...infoPersona, hoy: hoyReconciliado }}
          edicionCarrito={carritoProps}
          obrasActivas={obrasActivas}
          destino={destino}
          destinoTexto={destinoTexto}
          onDestino={(d) => { if (!editable()) return; setDestino(d); setDestinoAuto(false); cortarAuto(); }}
          onElegirYConfirmar={elegirYConfirmar}
          excedidos={excedidos}
          autorizaCupo={autorizaCupo}
          onAutorizaCupo={(v) => { if (editable()) setAutorizaCupo(v); }}
          problemas={problemas}
          guardando={guardando}
          operacion={operacion}
          sinPersistir={sinPersistir}
          errorOperacion={errorOperacion}
          onContinuarOperacion={() => confirmar()}
          onAbrirCola={() => setCapa({ tipo: "cola" })}
          onSeguirConOtro={seguirConOtroCarrito}
          autoConfirmando={autoListo}
          onCortarAuto={cortarAuto}
          onConfirmar={() => confirmar()}
          onVolver={volverAMarcar}
          onQuitarPersona={quitarPersona}
          empleados={empleadosConEmpresa}
          onElegirPersona={(emp) => identificar(emp, "sin_tarjeta")}
          empresasExternas={externos.empresas}
          onAltaExterno={darDeAltaExterno}
          lectorEstado={nfc.status}
          notaDevolucion={notaDevolucion}
          onNotaDevolucion={(v) => { if (editable()) setNotaDevolucion(v); }}
          onRafaga={procesarCodigo}
        />
      ) : null}

      {paso === "listo" && listo ? <Listo resumen={listo} onSiguiente={empezarDeNuevo} /> : null}

      {capaVista}
    </div>
  );
}
