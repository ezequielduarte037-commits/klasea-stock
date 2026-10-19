import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpFromLine, Camera, History, Maximize2, Minimize2, MonitorUp, Nfc, RotateCcw, ScanBarcode, Warehouse, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { plegarMenu } from "@/lib/menuLateral";
import BarcodeScanner from "@/features/panol/BarcodeScanner";
import useNfcBridge from "@/features/panol/useNfcBridge";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { openEgresoDisplayWindow, publishEgresoDisplay, resetEgresoDisplay } from "@/features/panol/egresoDisplay";
import {
  egresarProductosCarrito,
  fetchConsumibleIds,
  fetchMaterialesEgreso,
  fetchObrasEgreso,
  retiradoPorNombreCompletoError,
  sinConsumibles,
  transferirProducto,
} from "@/features/panol/panolApi";
import { PANOL_CART_STORAGE_KEY, normalizeStoredCartItem, refreshCartRequirementMetadata } from "@/features/panol/stockGrupos";
import { buscarEmpleadoPorNfc, evaluarRetiro, normalizeNfcUid } from "@/features/rrhh/api";
import { obrasDeEmpleado } from "@/features/consumibles/api";
import { CSS_MOSTRADOR } from "@/features/consumibles/mostrador/mostradorEstilos";
import TecladoNumerico from "@/features/consumibles/mostrador/TecladoNumerico";
import useRafagaLector from "@/features/consumibles/mostrador/useRafagaLector";
import { cantidadTipeada, fmtNum, normalizarTexto, pareceUidTarjeta } from "@/features/consumibles/mostrador/mostradorLogica";
import {
  agregarVariante,
  buscarGrupos,
  cambiarVariante,
  cantidadDe,
  destinoSugerido,
  elegirProducto,
  enSede,
  etiquetaPersona,
  faltaEnDestino,
  fijarCantidad,
  gruposDeOrigen,
  gruposEgresables,
  gruposPorCodigo,
  lineasConDestino,
  notaDelEgreso,
  obraCerrada,
  pantallaOperario,
  problemasDelCarrito,
  quitarLinea,
  refrescarCarrito,
  resumenDelMovimiento,
  rielDeOrigenes,
  sumarAlCarrito,
  sumarCantidad,
  textoDestino,
  ubicacionParaSumar,
  ultimaLinea,
} from "./mostradorPanolLogica";
import { conTope, fetchPersonasRetiro } from "./mostradorPanolApi";
import { CSS_PANOL, LISTO_PANOL_MS } from "./estilosPanol";
import BotoneraPanol from "./BotoneraPanol";
import CarritoPanol, { PieFirmarPanol } from "./CarritoPanol";
import FirmaPanol from "./FirmaPanol";
import ListoPanol from "./ListoPanol";
import UltimosPanol from "./UltimosPanol";
import { CodigoNoEncontrado, DeDondeSale, Hoja, Pausados } from "./CapasPanol";

/**
 * Mostrador de egresos del stock de pañol — los ítems de los barcos.
 *
 * El mismo camino corto que el mostrador de consumibles:
 *
 *   1. MARCAR.  El lector (o tocar el saldo) suma al carrito. Las obras con
 *               material son la botonera: elegir una muestra lo suyo y define
 *               de dónde sale lo que se escanea.
 *   2. FIRMAR.  La tarjeta identifica y firma; después, a qué se carga. Sin
 *               confirmación automática: estos son materiales de una obra y
 *               se confirma con Enter.
 *   3. LISTO.   Resumen unos segundos y vuelve a empezar.
 *
 * "Asignar a obra" es el otro modo: el material queda en el pañol reservado a
 * una obra. No firma nadie.
 *
 * El stock es la misma cuenta del stock maestro (stockGrupos + panolMovimientos)
 * y el egreso usa los mismos RPC que el carrito de stock: egresarProductosCarrito
 * y transferirProducto. Sin cola sin conexión: esos RPC no son idempotentes y un
 * reintento podría duplicar un egreso.
 */

const LEDGER_STATES = ["en_panol", "recibido", "parcial", "egresado", "problema"];
const PAUSADOS_KEY = "klasea:panol-carritos-guardados";
const FOCO_KEY = "klasea.panol.mostrador.foco";
const ENTERAS = new Set(["unidad", "unidades", "u", "un", "uni", "par", "pares", "juego", "juegos", "kit", "kits", "caja", "cajas", "rollo", "rollos"]);

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

export default function MostradorPanol({ sede, sedeFija = false }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const raizRef = useRef(null);
  const campoRef = useRef(null);

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState(null);
  const [obras, setObras] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [errorCarga, setErrorCarga] = useState("");
  const [refrescando, setRefrescando] = useState(false);

  // ── Estado del mostrador ──────────────────────────────────────────────────
  const [modo, setModo] = useState("retiro"); // retiro | asignar
  const [paso, setPaso] = useState("marcar"); // marcar | firmar | listo
  const [cart, setCart] = useState(() => {
    const v = leerJson(PANOL_CART_STORAGE_KEY, []);
    return Array.isArray(v) ? v.map(normalizeStoredCartItem) : [];
  });
  const [pausados, setPausados] = useState(() => {
    const v = leerJson(PAUSADOS_KEY, []);
    return Array.isArray(v) ? v.map((p) => ({ ...p, items: Array.isArray(p?.items) ? p.items.map(normalizeStoredCartItem) : [] })) : [];
  });
  const [origen, setOrigen] = useState(null);
  const [texto, setTexto] = useState("");
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const [capa, setCapa] = useState(null); // teclado | donde | desconocido | pausados | movimientos
  const [camara, setCamara] = useState(false);
  const [persona, setPersona] = useState(null);
  const [aMano, setAMano] = useState(false);
  const [nombreLibre, setNombreLibre] = useState("");
  const [obrasPersona, setObrasPersona] = useState([]);
  const [cargandoObras, setCargandoObras] = useState(false);
  const [reparos, setReparos] = useState([]);
  const [destino, setDestino] = useState(null);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorOperacion, setErrorOperacion] = useState("");
  const [listo, setListo] = useState(null);
  const [foco, setFoco] = useState(() => leerJson(FOCO_KEY, false) === true);
  const [ancho, setAncho] = useState(1200);
  const [esTactil] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches));

  const cartRef = useRef(cart);
  const pasoRef = useRef(paso);
  const capaRef = useRef(capa);
  const guardandoRef = useRef(false);
  const destinoTocadoRef = useRef(false);
  const consultaRef = useRef(0);
  const textoRef = useRef("");
  const busquedaTimerRef = useRef(null);
  const publicadoRef = useRef("");
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

  const asignar = modo === "asignar";
  const angosto = ancho < 820;
  const amplio = ancho >= 1240;

  function aplicarCarrito(siguiente) {
    cartRef.current = siguiente;
    setCart(siguiente);
  }

  // ── Carga ─────────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    try {
      const [filas, consumibles] = await Promise.all([
        conTope(fetchMaterialesEgreso({ sede: sedeFija ? sede : null, estados: LEDGER_STATES }), 25_000, "El stock tardó demasiado en llegar."),
        fetchConsumibleIds().catch(() => new Set()),
      ]);
      if (!vivoRef.current) return;
      // Los consumibles salen por su propio mostrador.
      setRows(sinConsumibles(filas, consumibles));
      setErrorCarga("");
    } catch (e) {
      if (vivoRef.current) setErrorCarga(e?.message || "No se pudo traer el stock.");
    } finally {
      if (vivoRef.current) setRefrescando(false);
    }
  }, [sede, sedeFija]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    let vivo = true;
    Promise.allSettled([fetchObrasEgreso(), fetchPersonasRetiro()]).then(([o, e]) => {
      if (!vivo) return;
      if (o.status === "fulfilled") setObras(o.value);
      if (e.status === "fulfilled") setEmpleados(e.value);
    });
    return () => { vivo = false; };
  }, []);

  // Con el carrito vacío, cada 5 minutos se refresca el stock (lo que entregó
  // otro equipo). Con algo marcado no se toca nada.
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
  const grupos = useMemo(() => (rows ? gruposEgresables(rows) : []), [rows]);
  const gruposSede = useMemo(() => enSede(grupos, sede), [grupos, sede]);
  const riel = useMemo(() => rielDeOrigenes(gruposSede, obras), [gruposSede, obras]);
  const ubicaciones = useMemo(() => new Map(grupos.map((g) => [g.key, g.ubicacion])), [grupos]);
  const empleadosPorUid = useMemo(
    () => new Map(empleados.filter((e) => e.nfc_uid).map((e) => [normalizeNfcUid(e.nfc_uid), e])),
    [empleados],
  );
  const buscando = Boolean(textoBusqueda.trim()) && cantidadTipeada(textoBusqueda) == null;
  const productos = useMemo(() => {
    const base = origen ? gruposDeOrigen(gruposSede, origen) : gruposSede;
    if (buscando) return buscarGrupos(base, textoBusqueda);
    if (!origen) return [];
    return [...base].sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true }));
  }, [buscando, gruposSede, origen, textoBusqueda]);
  const enCarrito = useMemo(() => {
    const m = new Map();
    for (const l of cart) m.set(l.baseKey, (m.get(l.baseKey) ?? 0) + cantidadDe(l));
    return m;
  }, [cart]);
  const problemas = useMemo(() => problemasDelCarrito(cart), [cart]);
  const lineas = useMemo(() => lineasConDestino(cart, destino, obras, modo), [cart, destino, obras, modo]);
  const destinoTexto = textoDestino(cart, destino, obras, modo);
  const retiradoPor = persona ? etiquetaPersona(persona) : aMano ? nombreLibre.trim() : "";
  const errorNombre = aMano ? retiradoPorNombreCompletoError(nombreLibre) : "";
  const falta = asignar
    ? faltaEnDestino(cart, destino, "asignar", obras)
    : !persona && !aMano ? "Falta la tarjeta"
      : aMano && errorNombre ? "Falta nombre y apellido"
        : faltaEnDestino(cart, destino, "retiro", obras);
  const reasignados = lineas.filter((l) => l.reasigna).length;
  const puedeConfirmar = !guardando && cart.length > 0 && !problemas.length && !falta;
  const textoBoton = guardando
    ? "Registrando…"
    : problemas.length ? "Revisá el carrito"
      : falta || (asignar
        ? `Asignar a ${destinoTexto}`
        : `Confirmar · ${destinoTexto || "sin obra"}${reasignados ? ` · reasigna ${reasignados}` : ""}`);

  // El carrito puede venir guardado (o del stock maestro): con cada lectura se
  // ponen al día los saldos y los productos compatibles de los requisitos.
  useEffect(() => {
    if (!rows) return;
    const siguiente = refrescarCarrito(refreshCartRequirementMetadata(cartRef.current, rows), grupos, { sede: sedeFija ? sede : "todas" });
    if (siguiente !== cartRef.current) aplicarCarrito(siguiente);
  }, [rows, grupos, sede, sedeFija]);

  useEffect(() => { guardarJson(PANOL_CART_STORAGE_KEY, cart, !cart.length); }, [cart]);
  useEffect(() => { guardarJson(PAUSADOS_KEY, pausados, !pausados.length); }, [pausados]);

  // Lo que no le corresponde retirar (por obra u oficio): se avisa, no se frena.
  const materialIds = useMemo(() => [...new Set(cart.map((l) => l.material?.id).filter(Boolean))].sort().join(","), [cart]);
  useEffect(() => {
    if (!persona?.id || asignar || !materialIds) return undefined;
    let vigente = true;
    evaluarRetiro(persona.id, materialIds.split(","))
      .then((filas) => { if (vigente) setReparos(filas.filter((f) => f.estado !== "ok" && f.estado !== "sin_datos")); })
      .catch(() => { if (vigente) setReparos([]); });
    return () => { vigente = false; setReparos([]); };
  }, [persona?.id, materialIds, asignar]);

  // ── La pantalla del que retira (/pantalla-egreso) ─────────────────────────
  useEffect(() => {
    if (paso === "listo") return;
    let datos = null;
    if (cart.length) {
      const identificado = paso === "firmar" && Boolean(retiradoPor) && !errorNombre;
      datos = pantallaOperario({
        modo,
        cart,
        obras,
        destino: paso === "firmar" ? destino : null,
        persona: paso === "firmar" ? persona : null,
        retiradoPor: paso === "firmar" ? retiradoPor : "",
        estado: guardando ? "processing" : identificado && !asignar ? "identified" : "draft",
        nota,
      });
    }
    const firma = datos ? JSON.stringify(datos) : "idle";
    if (firma === publicadoRef.current) return;
    publicadoRef.current = firma;
    if (datos) publishEgresoDisplay(datos);
    else resetEgresoDisplay();
  }, [paso, cart, obras, destino, persona, retiradoPor, errorNombre, guardando, modo, asignar, nota]);
  useEffect(() => () => { resetEgresoDisplay(); }, []);

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
    // El lector escribe el código entero en menos de esto: la lista no
    // parpadea con resultados de medio código.
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

  // Con el foco en el campo, tocar un botón no se lo lleva: el próximo
  // escaneo tiene que caer en el campo.
  function retenerFoco(e) {
    if (document.activeElement === campoRef.current && e.target.closest?.("button")) e.preventDefault();
  }

  // ── Marcar ────────────────────────────────────────────────────────────────
  const editable = () => !guardandoRef.current && pasoRef.current !== "listo";

  function marcar(grupo, ubicacion = null) {
    if (!editable()) return;
    const loc = ubicacion ?? ubicacionParaSumar(grupo, origen);
    if (!loc) { setCapa({ tipo: "donde", grupo }); return; }
    const r = sumarAlCarrito(cartRef.current, grupo, loc, { sede });
    if (r.cart !== cartRef.current) aplicarCarrito(r.cart);
    if (r.tope != null) toast.info(`${grupo.label}: hay ${fmtNum(r.tope)} ${grupo.unidad || ""} y ya están en el carrito.`);
    else if (pasoRef.current === "firmar") toast.info(`Sumado: ${grupo.label}`);
  }

  async function procesarCodigo(crudo) {
    const codigo = String(crudo ?? "").trim();
    if (!codigo || guardandoRef.current) return;
    if (pasoRef.current === "listo") empezarDeNuevo();
    const uid = normalizeNfcUid(codigo);
    if (empleadosPorUid.has(uid)) { alLeerTarjeta(uid, empleadosPorUid.get(uid)); return; }
    const encontrados = gruposPorCodigo(gruposSede, codigo);
    if (encontrados.length) {
      if (encontrados.length > 1) toast.warning(`El código ${codigo} está en ${encontrados.length} productos: sumé ${encontrados[0].label}.`);
      marcar(encontrados[0]);
      return;
    }
    // En la firma, lo que no es producto casi seguro es una tarjeta.
    if (pareceUidTarjeta(uid) || pasoRef.current === "firmar") { alLeerTarjeta(uid, null, codigo); return; }
    const otra = gruposPorCodigo(grupos, codigo)[0];
    setCapa({ tipo: "desconocido", codigo, otraSede: otra?.conSaldo.find((l) => normalizarTexto(l.sede) !== normalizarTexto(sede))?.sede || "" });
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
      if (cartRef.current.length) irAFirmar();
      return;
    }
    const n = cantidadTipeada(v);
    if (n != null) {
      cambiarTexto("");
      const l = ultimaLinea(cartRef.current);
      if (!l) return;
      const tope = Math.min(n, l.available ?? n);
      if (tope < n) toast.info(`${l.label}: hay ${fmtNum(l.available)}.`);
      aplicarCarrito(fijarCantidad(cartRef.current, l.key, tope));
      return;
    }
    if (gruposPorCodigo(gruposSede, v).length) { cambiarTexto(""); procesarCodigo(v); return; }
    const base = origen ? gruposDeOrigen(gruposSede, origen) : gruposSede;
    const encontrados = buscarGrupos(base, v);
    if (encontrados.length) {
      marcar(encontrados[textoBusqueda === valor ? Math.min(resaltado, encontrados.length - 1) : 0]);
      return;
    }
    cambiarTexto("");
    procesarCodigo(v);
  }

  function alTeclearCampo(e) {
    if (productos.length && buscando && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setResaltado((i) => Math.max(0, Math.min(productos.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
      return;
    }
    if (e.key === "Escape" && texto) cambiarTexto("");
    lectorCampo.onKeyDown(e);
  }

  // Una tecla suelta (el foco quedó en un botón, o en la pantalla de listo)
  // se manda al campo del lector: ningún escaneo se pierde.
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

  // ── Firmar ────────────────────────────────────────────────────────────────
  function irAFirmar() {
    if (!editable() || !cartRef.current.length) return;
    const lista = problemasDelCarrito(cartRef.current);
    if (lista.length) {
      toast.warning(lista[0].texto);
      return;
    }
    campoRef.current?.blur();
    if (!destinoTocadoRef.current) setDestino(asignar ? null : destinoSugerido(cartRef.current, obrasPersona));
    setErrorOperacion("");
    setPaso("firmar");
  }

  function volverAMarcar() {
    if (guardandoRef.current) return;
    setPaso("marcar");
  }

  function quitarPersona() {
    consultaRef.current += 1;
    setPersona(null);
    setAMano(false);
    setNombreLibre("");
    setObrasPersona([]);
    setCargandoObras(false);
    if (!destinoTocadoRef.current) setDestino(null);
  }

  function identificar(emp, metodo, uid = null) {
    const consulta = ++consultaRef.current;
    setPersona({ id: emp.id, nombre: emp.nombre, dni: emp.dni ?? null, fotoUrl: emp.foto_url ?? "", sede: emp.sede ?? "", metodo, uid });
    setAMano(false);
    setNombreLibre("");
    setObrasPersona([]);
    setCargandoObras(true);
    conTope(obrasDeEmpleado(emp.id), 7000)
      .then((lista) => {
        if (!vivoRef.current || consulta !== consultaRef.current) return;
        const vigentes = lista.filter((o) => !obraCerrada(o));
        setObrasPersona(vigentes);
        if (!destinoTocadoRef.current) setDestino(destinoSugerido(cartRef.current, vigentes));
      })
      .catch(() => { /* sin sus obras se elige a mano */ })
      .finally(() => { if (vivoRef.current && consulta === consultaRef.current) setCargandoObras(false); });
    if (pasoRef.current === "marcar") irAFirmar();
  }

  async function alLeerTarjeta(raw, conocido = null, codigoCrudo = null) {
    const uid = normalizeNfcUid(raw);
    if (!uid || guardandoRef.current) return;
    if (capaRef.current) { toast.info("Cerrá la ventana abierta y volvé a apoyar la tarjeta."); return; }
    if (asignar) { toast.info("Para asignar a una obra no hace falta tarjeta."); return; }
    if (pasoRef.current === "listo" || (pasoRef.current === "marcar" && !cartRef.current.length)) {
      toast.info("Primero pasá lo que se lleva: la tarjeta va al final, para firmar.");
      return;
    }
    if (persona?.uid === uid) { if (pasoRef.current === "marcar") irAFirmar(); return; }
    let emp = conocido;
    if (!emp) {
      try {
        emp = await conTope(buscarEmpleadoPorNfc(uid), 7000, "No se pudo identificar la tarjeta a tiempo.");
      } catch {
        emp = empleadosPorUid.get(uid) ?? null;
        if (!emp) {
          toast.info("No se pudo leer la tarjeta: elegí por nombre o DNI.");
          if (pasoRef.current === "marcar") irAFirmar();
          return;
        }
      }
    }
    if (!vivoRef.current) return;
    if (!emp) {
      if (codigoCrudo && pasoRef.current === "marcar") setCapa({ tipo: "desconocido", codigo: codigoCrudo, otraSede: "" });
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
    enabled: paso === "firmar" && !capa && !guardando,
    minLength: 4,
    timeoutMs: 65,
    onScan: (codigo) => { procesarCodigo(codigo); },
  });

  function elegirDestino(d) {
    destinoTocadoRef.current = true;
    setDestino(d);
  }

  // ── Confirmar ─────────────────────────────────────────────────────────────
  async function confirmarMovimiento() {
    if (guardandoRef.current || !puedeConfirmar) return;
    const items = cartRef.current;
    const destinoActual = destino;
    const { sectorDestino, nota: notaFinal } = notaDelEgreso(destinoActual, nota);
    guardandoRef.current = true;
    setGuardando(true);
    setErrorOperacion("");
    try {
      if (asignar) {
        const hechos = [];
        try {
          for (const item of items) {
            await transferirProducto({
              material: item.material,
              descripcion: item.label,
              codigo: item.codigo,
              unidad: item.unidad,
              cantidad: item.cantidad,
              sede: item.sede,
              obraOrigenId: item.obraId,
              obraDestinoId: destinoActual.obraId,
              nota: [notaFinal, item.variante ? `Variante: ${item.variante}` : ""].filter(Boolean).join(" · "),
              retiradoPor: "",
              esAdicional: item.esAdicional,
              variante: item.variante || null,
              productoMaterialId: item.productoMaterialId || null,
            });
            hechos.push(item.key);
          }
        } catch (err) {
          // Cada renglón es un RPC aparte: lo que ya se asignó sale del carrito
          // para que reintentar no lo asigne dos veces.
          if (hechos.length) {
            aplicarCarrito(cartRef.current.filter((l) => !hechos.includes(l.key)));
            throw new Error(`Se asignaron ${hechos.length} de ${items.length}. ${err?.message || ""}`.trim());
          }
          throw err;
        }
      } else {
        await egresarProductosCarrito({
          items,
          destinoObraId: destinoActual?.obraId || null,
          retiradoPor,
          sectorDestino,
          nota: notaFinal,
        });
      }
      if (!vivoRef.current) return;
      const resumen = resumenDelMovimiento({
        modo,
        cart: items,
        quien: asignar ? "" : retiradoPor.replace(/\s*\(DNI [^)]*\)$/, ""),
        metodo: persona?.metodo || "a_mano",
        destinoTexto: textoDestino(items, destinoActual, obras, modo),
      });
      publicadoRef.current = "complete";
      publishEgresoDisplay(pantallaOperario({
        modo, cart: items, obras, destino: destinoActual, persona, retiradoPor, nota, estado: "complete", completedAt: new Date().toISOString(),
      }));
      aplicarCarrito([]);
      setListo(resumen);
      setPaso("listo");
      setRefrescando(true);
      cargar();
    } catch (err) {
      if (!vivoRef.current) return;
      // "No tiene stock disponible" casi nunca es un error de quien opera: otro
      // se llevó la última unidad mientras el carrito estaba abierto.
      const seLoLlevaron = /no tiene stock disponible/i.test(String(err?.message || ""));
      const mensaje = seLoLlevaron
        ? "Ese material ya no está disponible: alguien lo retiró mientras tanto. Actualicé el stock; revisá las cantidades."
        : err?.message || "No se pudo registrar el movimiento.";
      setErrorOperacion(mensaje);
      toast.error(mensaje);
      if (!asignar) publishEgresoDisplay({ status: "error", error: mensaje });
      if (seLoLlevaron) { setRefrescando(true); cargar(); }
    } finally {
      guardandoRef.current = false;
      if (vivoRef.current) setGuardando(false);
    }
  }

  function empezarDeNuevo() {
    if (guardandoRef.current) return;
    consultaRef.current += 1;
    destinoTocadoRef.current = false;
    setPersona(null);
    setAMano(false);
    setNombreLibre("");
    setObrasPersona([]);
    setCargandoObras(false);
    setReparos([]);
    setDestino(null);
    setNota("");
    setErrorOperacion("");
    setListo(null);
    setCapa(null);
    cambiarTexto("");
    pasoRef.current = "marcar";
    setPaso("marcar");
    publicadoRef.current = "";
    resetEgresoDisplay();
  }
  const empezarRef = useRef(empezarDeNuevo);
  useEffect(() => { empezarRef.current = empezarDeNuevo; });

  useEffect(() => {
    if (paso !== "listo") return undefined;
    const t = window.setTimeout(() => empezarRef.current?.(), LISTO_PANOL_MS);
    return () => window.clearTimeout(t);
  }, [paso]);

  // ── Otras acciones ────────────────────────────────────────────────────────
  function cambiarModo(m) {
    if (m === modo || guardandoRef.current) return;
    destinoTocadoRef.current = false;
    setDestino(null);
    setModo(m);
    setPaso("marcar");
  }

  function vaciar() {
    aplicarCarrito([]);
    empezarDeNuevo();
    enfocarCampo();
  }

  function pausar() {
    if (!cartRef.current.length) return;
    const ahora = new Date();
    const cuando = `${ahora.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    const nombre = `${persona?.nombre || (origen && riel.find((r) => r.key === origen)?.codigo) || "Retiro"} · ${cuando}`;
    // Se copian ahora: el carrito se vacía antes de que corra el actualizador.
    const items = cartRef.current.map((it) => ({ ...it }));
    setPausados((prev) => [{ id: Date.now().toString(36), nombre, items, savedAt: ahora.toISOString() }, ...prev].slice(0, 20));
    aplicarCarrito([]);
    empezarDeNuevo();
    toast.success(`Pausado: ${nombre}. Lo retomás desde "Pausados".`);
  }

  async function retomar(p) {
    if (cartRef.current.length) {
      const ok = await confirmar({ title: "¿Reemplazar el carrito?", message: `Lo que está marcado (${cartRef.current.length} productos) se pierde. Si lo querés guardar, pausalo antes.`, confirmLabel: "Reemplazar", tone: "danger" });
      if (!ok) return;
    }
    aplicarCarrito(p.items.map(normalizeStoredCartItem));
    setPausados((prev) => prev.filter((x) => x.id !== p.id));
    setCapa(null);
    empezarDeNuevo();
    cargar();
  }

  async function borrarPausado(p) {
    const ok = await confirmar({ title: "¿Borrar el retiro pausado?", message: p.nombre, confirmLabel: "Borrar", tone: "danger" });
    if (ok) setPausados((prev) => prev.filter((x) => x.id !== p.id));
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

  function abrirPantallaOperario() {
    if (!openEgresoDisplayWindow()) toast.warning("El navegador bloqueó la ventana. Habilitá las ventanas emergentes para KlaseA.");
  }

  function cambiarOrigen(o) {
    setOrigen(o);
    setResaltado(0);
    enfocarCampo();
  }

  const carritoProps = {
    cart,
    obras,
    modo,
    persona: asignar ? null : persona,
    problemas,
    ubicacionDe: (k) => ubicaciones.get(k),
    pausados: pausados.length,
    onSumar: (key, delta) => aplicarCarrito(sumarCantidad(cartRef.current, key, delta)),
    onTeclado: (key) => setCapa({ tipo: "teclado", key }),
    onQuitar: (key) => aplicarCarrito(quitarLinea(cartRef.current, key)),
    onTodo: (key) => {
      const l = cartRef.current.find((x) => x.key === key);
      if (l) aplicarCarrito(fijarCantidad(cartRef.current, key, l.available));
    },
    onVariante: (key, v) => {
      const r = cambiarVariante(cartRef.current, key, v);
      if (r.error) toast.warning(r.error);
      else aplicarCarrito(r.cart);
    },
    onOtraVariante: (key, v) => {
      const r = agregarVariante(cartRef.current, key, v);
      if (r.error) toast.warning(r.error);
      else aplicarCarrito(r.cart);
    },
    onProducto: (key, id) => aplicarCarrito(elegirProducto(cartRef.current, key, id)),
    onVaciar: vaciar,
    onPausar: pausar,
    onVerPausados: () => setCapa({ tipo: "pausados" }),
    onQuitarPersona: quitarPersona,
    onFirmar: irAFirmar,
  };

  // ── Capas ─────────────────────────────────────────────────────────────────
  let capaVista = null;
  if (capa?.tipo === "teclado") {
    const l = cart.find((x) => x.key === capa.key);
    if (l) {
      capaVista = (
        <TecladoNumerico
          key={l.key}
          titulo={l.label}
          unidad={`${l.unidad || ""} · hay ${fmtNum(l.available)}`}
          valorInicial={cantidadDe(l)}
          decimales={!ENTERAS.has(normalizarTexto(l.unidad))}
          onListo={(n) => { aplicarCarrito(n > 0 ? fijarCantidad(cartRef.current, l.key, n) : quitarLinea(cartRef.current, l.key)); setCapa(null); }}
          onCerrar={() => setCapa(null)}
          onRafaga={(c) => { setCapa(null); procesarCodigo(c); }}
        />
      );
    }
  } else if (capa?.tipo === "donde") {
    capaVista = (
      <DeDondeSale
        grupo={capa.grupo}
        origenElegido={origen}
        onElegir={(loc) => { setCapa(null); marcar(capa.grupo, loc); }}
        onCerrar={() => setCapa(null)}
      />
    );
  } else if (capa?.tipo === "desconocido") {
    capaVista = (
      <CodigoNoEncontrado
        codigo={capa.codigo}
        sede={sede}
        otraSede={capa.otraSede}
        onBuscar={() => { setCapa(null); cambiarTexto(""); window.setTimeout(() => campoRef.current?.focus(), 30); }}
        onCerrar={() => setCapa(null)}
      />
    );
  } else if (capa?.tipo === "pausados") {
    capaVista = (
      <Pausados pausados={pausados} hayCarrito={cart.length > 0} onRetomar={retomar} onBorrar={borrarPausado} onCerrar={() => setCapa(null)} />
    );
  } else if (capa?.tipo === "movimientos") {
    capaVista = (
      <Hoja titulo="Últimos movimientos" chica={false} onCerrar={() => setCapa(null)}>
        <div style={{ margin: "-16px -18px" }}>
          <UltimosPanol rows={rows ?? []} obras={obras} sede={sede} />
        </div>
      </Hoja>
    );
  }

  const cargando = !rows && !errorCarga;

  return (
    <div
      ref={raizRef}
      className={`mst mpn${amplio ? " is-ancho" : ""}${angosto ? " is-angosto" : ""}`}
      onMouseDown={retenerFoco}
      onKeyDownCapture={(e) => { if (guardandoRef.current) { e.preventDefault(); e.stopPropagation(); } }}
    >
      <style>{CSS_MOSTRADOR}</style>
      <style>{CSS_PANOL}</style>

      <div className="mst-barra">
        <div className="mst-modos" role="group" aria-label="Qué se registra">
          <button type="button" disabled={guardando} className={`mst-modo${!asignar ? " is-activo" : ""}`} aria-pressed={!asignar} onClick={() => cambiarModo("retiro")}>
            <ArrowUpFromLine size={15} aria-hidden="true" /> Retiro
          </button>
          <button type="button" disabled={guardando} className={`mst-modo is-asignar${asignar ? " is-activo" : ""}`} aria-pressed={asignar} onClick={() => cambiarModo("asignar")}>
            <Warehouse size={15} aria-hidden="true" /> {angosto ? "Asignar" : "Asignar a obra"}
          </button>
        </div>

        <div className={`mst-lector${asignar ? " is-asignar" : ""}`}>
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
          {/* En el celular no hay lector de tarjetas ni segunda pantalla. */}
          {!asignar && !angosto ? (
            <button
              type="button"
              className={`mst-chip${nfc.status === "connected" ? " is-ok" : ""}`}
              onClick={nfc.reconnect}
              title={nfc.status === "connected" ? "Lector de tarjetas conectado" : "No encuentro el puente del lector de tarjetas (ws://127.0.0.1:17777). Tocá para reintentar."}
            >
              <Nfc size={13} /><span className="mst-chip-texto">{nfc.status === "connected" ? "Tarjetas" : "Sin lector"}</span>
            </button>
          ) : null}
          {!amplio ? (
            <button type="button" className="mst-icono-btn" onClick={() => setCapa({ tipo: "movimientos" })} aria-label="Últimos movimientos" title="Últimos movimientos">
              <History size={16} />
            </button>
          ) : null}
          {!angosto ? (
            <button type="button" className="mst-icono-btn" onClick={abrirPantallaOperario} aria-label="Abrir la pantalla del operario" title="Pantalla para el que retira">
              <MonitorUp size={16} />
            </button>
          ) : null}
          {!angosto ? (
            <button type="button" className={`mst-icono-btn${foco ? " is-activo" : ""}`} onClick={alternarFoco} aria-pressed={foco} aria-label="Modo foco" title={foco ? "Volver a mostrar el menú" : "Plegar el menú lateral"}>
              {foco ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          ) : null}
          <button type="button" className="mst-icono-btn" onClick={refrescar} aria-label="Actualizar" title="Actualizar el stock">
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
          {rows ? (
            <fieldset disabled={guardando} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "contents" }}>
              <BotoneraPanol
                riel={riel}
                origen={origen}
                onOrigen={cambiarOrigen}
                buscando={buscando}
                texto={textoBusqueda}
                productos={productos}
                resaltado={resaltado}
                onResaltar={setResaltado}
                enCarrito={enCarrito}
                onMarcar={(g, l) => marcar(g, l)}
                onBuscarTodo={() => cambiarOrigen(null)}
              />
            </fieldset>
          ) : null}
        </div>

        <div className="mst-col mst-col-carrito">
          <fieldset disabled={guardando} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "contents" }}>
            <CarritoPanol {...carritoProps} />
          </fieldset>
        </div>

        {amplio ? (
          <div className="mst-col mst-col-movs">
            <UltimosPanol rows={rows ?? []} obras={obras} sede={sede} onActualizar={refrescar} />
          </div>
        ) : null}
      </div>

      {angosto && cart.length ? (
        <div className="mst-barra-firmar">
          <PieFirmarPanol cart={cart} problemas={problemas} modo={modo} persona={asignar ? null : persona} onFirmar={irAFirmar} />
        </div>
      ) : null}

      {paso === "firmar" ? (
        <FirmaPanol
          modo={modo}
          cart={cart}
          obras={obras}
          lineas={lineas}
          persona={persona}
          aMano={aMano}
          onAMano={(v, sugerido = "") => {
            setAMano(v);
            if (v) setNombreLibre(/^\d/.test(sugerido.trim()) ? "" : sugerido.trim());
          }}
          nombreLibre={nombreLibre}
          onNombreLibre={setNombreLibre}
          errorNombre={errorNombre}
          empleados={empleados}
          onElegirPersona={(emp) => identificar(emp, "sin_tarjeta")}
          onQuitarPersona={quitarPersona}
          lectorEstado={nfc.status}
          obrasPersona={obrasPersona}
          cargandoObras={cargandoObras}
          reparos={reparos}
          destino={destino}
          onDestino={elegirDestino}
          nota={nota}
          onNota={setNota}
          problemas={problemas}
          guardando={guardando}
          errorOperacion={errorOperacion}
          textoBoton={textoBoton}
          puedeConfirmar={puedeConfirmar}
          onConfirmar={confirmarMovimiento}
          onVolver={volverAMarcar}
          onRafaga={procesarCodigo}
        />
      ) : null}

      {paso === "listo" && listo ? <ListoPanol resumen={listo} onSiguiente={empezarDeNuevo} /> : null}

      {capaVista}

      <BarcodeScanner open={camara} onClose={() => setCamara(false)} onScan={(c) => { setCamara(false); procesarCodigo(c); }} />
    </div>
  );
}
