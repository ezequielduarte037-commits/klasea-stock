import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Ban, Camera, CheckCheck, CircleCheck, Clock3, LoaderCircle, PackageCheck, Play, Printer, RotateCcw,
  Pencil, Sparkles, TriangleAlert, Undo2, X, Zap,
} from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useAhora } from "@/hooks/useAhora";
import { fmtCantidad, hoyArgentina, normalizarCodigo } from "@/features/consumibles/api";
import {
  SECTORES, actualizarItem, actualizarSolicitud, agregarItemLibre, agregarItemsDesdeCatalogo,
  cambiarEstadoSolicitud, marcarTodosPreparados, quitarItem,
} from "@/features/panol/solicitudesPanolApi";
import { leerFotoConIA, subirFoto } from "@/features/panol/solicitudesFotosApi";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { normalizeNfcUid } from "@/features/rrhh/api";
import { conPlazoLectura } from "../lecturas";
import { pareceUidTarjeta } from "../mostrador/mostradorLogica";
import Cabecera from "./Cabecera";
import Entregar from "./Entregar";
import { DeshacerEntrega } from "./Hojas";
import CapaImpresion from "./Impresion";
import { Agregar, Libre, Renglon } from "./Renglones";
import { prepararFotoHoja } from "./fotoHoja";
import { agregarRenglon, elegirProducto, fetchDetalle, mensajeError } from "./solicitudesApi";
import {
  ESTADOS_ACTIVOS, ESTADO_TEXTO, cabeceraDesdeLectura, clasificarRenglones, codigoVisible, etiquetaOrigen,
  fechaHoraCorta, llegoTarde, problemasParaEntregar, repartirLectura, resumenItems,
} from "./solicitudesLogica";

const redondear = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

const filaDesdeItem = (item, cantidad) => ({
  id: item.id,
  descripcion: item.descripcion,
  codigo: codigoVisible(item) || null,
  cantidad,
  unidad: item.unidad || null,
  es_consumible: true,
});

const TONO_ESTADO = { enviada: "is-violeta", preparando: "is-cian", listo: "is-azul", entregado: "is-verde", cancelado: "is-rojo" };

/**
 * Una solicitud abierta: datos, renglones en el orden del recorrido por el
 * pañol, agregar con el lector o leyendo la foto de la hoja, y las acciones
 * según el estado (preparar → lista para retirar → entregar con tarjeta).
 *
 * Los cambios se ven al instante y se guardan atrás (la cantidad, con una
 * pausa corta para no mandar un guardado por cada +). Antes de entregar,
 * imprimir o cambiar de estado se terminan de guardar.
 */
export default function Detalle({
  solicitudId, sede, catalogo, porId, indice, obras = [], empleados = [], cargandoEmpleados = false,
  pedirEmpleados, puedeOperar, angosto, pulso = 0, onVolver, onCambio, onSalio,
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const ahora = useAhora(60 * 1000);
  const hoyIso = hoyArgentina(ahora);

  const [datos, setDatos] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [version, setVersion] = useState(0);
  const [hoja, setHoja] = useState(null); // { tipo: "entregar", uid } | { tipo: "deshacer" }
  const [trabajo, setTrabajo] = useState(null);
  const [resolviendo, setResolviendo] = useState(null); // id del renglón escrito a mano
  const [ia, setIa] = useState(null); // "subiendo" | "leyendo"
  const [resumenIA, setResumenIA] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [estrecho, setEstrecho] = useState(false);

  const raizRef = useRef(null);
  const buscarRef = useRef(null);
  const archivoRef = useRef(null);
  const datosRef = useRef(null);
  const timers = useRef(new Map());
  const enVuelo = useRef(0);
  const altas = useRef(new Map());
  const ocupadoRef = useRef(false);

  useEffect(() => { datosRef.current = datos; }, [datos]);

  // ── Carga ────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Con cambios sin guardar no se recarga: pisaría lo que se está escribiendo.
    if (timers.current.size || enVuelo.current) return undefined;
    let vivo = true;
    conPlazoLectura(fetchDetalle(solicitudId))
      .then((d) => {
        if (!vivo) return;
        if (!d?.solicitud) { setErrorCarga("La solicitud ya no existe o tu usuario no la puede ver."); return; }
        setDatos(d);
        setErrorCarga("");
      })
      .catch((e) => { if (vivo) setErrorCarga(mensajeError(e, "No se pudo abrir la solicitud.")); });
    return () => { vivo = false; };
  }, [solicitudId, version, pulso]);

  // Lo que quedó escrito sin guardar se guarda igual al cerrar el detalle.
  useEffect(() => {
    const pendientes = timers.current;
    return () => {
      for (const p of [...pendientes.values()]) { clearTimeout(p.timer); p.correr(); }
    };
  }, []);

  // El detalle mide su propio ancho: con el menú abierto y la bandeja al lado
  // puede quedar angosto aunque la ventana sea grande.
  useEffect(() => {
    const el = raizRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const obs = new ResizeObserver(([e]) => setEstrecho(e.contentRect.width < 640));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Impresión: la capa se monta, se espera a las fuentes y se abre el diálogo.
  useEffect(() => {
    if (!trabajo) return undefined;
    let vivo = true;
    (document.fonts?.ready ?? Promise.resolve()).then(() => {
      window.requestAnimationFrame(() => { if (vivo) window.print(); });
    });
    return () => { vivo = false; };
  }, [trabajo]);
  useEffect(() => {
    const fin = () => setTrabajo(null);
    window.addEventListener("afterprint", fin);
    return () => window.removeEventListener("afterprint", fin);
  }, []);

  const s = datos?.solicitud ?? null;
  const items = useMemo(() => datos?.items ?? [], [datos]);
  const fotos = datos?.fotos ?? [];
  const { libres, deObra, consumibles } = useMemo(() => clasificarRenglones(items, porId), [items, porId]);
  const resumen = useMemo(() => resumenItems(items), [items]);
  const cantidades = useMemo(() => new Map(items.filter((i) => i.material_id).map((i) => [i.material_id, i.cantidad])), [items]);
  const problemas = useMemo(() => problemasParaEntregar(s, items), [s, items]);
  const activa = Boolean(s && ESTADOS_ACTIVOS.includes(s.estado));
  const editable = Boolean(puedeOperar && activa);
  const libreResolviendo = libres.find((l) => l.id === resolviendo) ?? null;

  // ── Guardado ─────────────────────────────────────────────────────────────
  const recargar = () => setVersion((v) => v + 1);

  async function guardar(fn, textoError) {
    enVuelo.current += 1;
    try {
      await fn();
      onCambio?.();
      return true;
    } catch (e) {
      toast.error(mensajeError(e, textoError));
      return false;
    } finally {
      enVuelo.current -= 1;
    }
  }

  // Si falló, se vuelve a lo que dice la base. Se recarga después de bajar el
  // contador: con algo en vuelo la carga se saltea para no pisar cambios.
  async function guardarOVolver(fn, textoError) {
    const ok = await guardar(fn, textoError);
    if (!ok) recargar();
    return ok;
  }

  function programar(clave, fn) {
    const t = timers.current;
    const previo = t.get(clave);
    if (previo) clearTimeout(previo.timer);
    const correr = () => { t.delete(clave); return guardarOVolver(fn, "No se pudo guardar el cambio."); };
    t.set(clave, { timer: setTimeout(correr, 600), correr });
  }

  async function guardarPendientes() {
    const lista = [...timers.current.values()];
    for (const p of lista) clearTimeout(p.timer);
    await Promise.all([...lista.map((p) => p.correr()), ...altas.current.values()]);
  }

  function cambiarItems(fn) {
    setDatos((d) => (d ? { ...d, items: fn(d.items) } : d));
  }

  function cambiarSolicitud(patch) {
    setDatos((d) => (d ? { ...d, solicitud: { ...d.solicitud, ...patch } } : d));
  }

  const renglonDe = (materialId) => datosRef.current?.items.find((i) => i.material_id === materialId) ?? null;

  // ── Renglones ────────────────────────────────────────────────────────────
  function cambiarCantidad(r, cantidad) {
    const n = redondear(cantidad);
    if (!(n > 0)) return;
    cambiarItems((lista) => lista.map((i) => (i.id === r.id ? { ...i, cantidad: n } : i)));
    programar(`cant-${r.id}`, () => actualizarItem(r.id, { cantidad: n }));
  }

  function alternarListo(r) {
    const listo = r.estado === "preparado" || r.estado === "reemplazado";
    const estado = listo ? "pendiente" : "preparado";
    cambiarItems((lista) => lista.map((i) => (i.id === r.id ? { ...i, estado } : i)));
    guardarOVolver(() => actualizarItem(r.id, { estado }), "No se pudo marcar el renglón.");
    // Tildar el primero es empezar a preparar: no hace falta tocar otro botón.
    if (!listo && datosRef.current?.solicitud?.estado === "enviada") cambiarEstado("preparando");
  }

  function quitar(r) {
    const clave = `cant-${r.id}`;
    const p = timers.current.get(clave);
    if (p) { clearTimeout(p.timer); timers.current.delete(clave); }
    cambiarItems((lista) => lista.filter((i) => i.id !== r.id));
    if (resolviendo === r.id) setResolviendo(null);
    guardarOVolver(() => quitarItem(r.id), "No se pudo quitar el renglón.");
  }

  /** Agrega un producto (o le suma si ya estaba). Devuelve la fila. */
  async function agregar(item, cantidad = 1) {
    if (!s) return null;
    const enCurso = altas.current.get(item.id);
    const recien = enCurso ? await enCurso : null;
    const existente = renglonDe(item.id) ?? recien;
    if (existente) {
      cambiarCantidad(existente, (Number(existente.cantidad) || 0) + cantidad);
      toast.info(`${item.descripcion}: ahora ${fmtCantidad((Number(existente.cantidad) || 0) + cantidad)}`);
      return existente;
    }
    const promesa = (async () => {
      enVuelo.current += 1;
      try {
        const orden = Math.max(-1, ...(datosRef.current?.items ?? []).map((i) => Number(i.orden) || 0)) + 1;
        const fila = await agregarRenglon(s.id, item, cantidad, orden);
        setDatos((d) => (d ? { ...d, items: [...d.items, fila] } : d));
        onCambio?.();
        return fila;
      } catch (e) {
        toast.error(mensajeError(e, "No se pudo agregar el producto."));
        return null;
      } finally {
        enVuelo.current -= 1;
        altas.current.delete(item.id);
      }
    })();
    altas.current.set(item.id, promesa);
    return promesa;
  }

  async function resolver(libre, item) {
    setResolviendo(null);
    const existente = renglonDe(item.id);
    if (existente && existente.id !== libre.id) {
      // Ya estaba ese producto: se suma ahí y el escrito a mano se va.
      const cantidad = redondear((Number(existente.cantidad) || 0) + (Number(libre.cantidad) || 0));
      cambiarItems((lista) => lista.filter((i) => i.id !== libre.id).map((i) => (i.id === existente.id ? { ...i, cantidad } : i)));
      const ok = await guardarOVolver(async () => {
        await actualizarItem(existente.id, { cantidad });
        await quitarItem(libre.id);
      }, "No se pudo elegir el producto.");
      if (ok) toast.success(`Sumado a ${item.descripcion}: ${fmtCantidad(cantidad)}`);
      return;
    }
    cambiarItems((lista) => lista.map((i) => (i.id === libre.id
      ? { ...i, material_id: item.id, descripcion: item.descripcion, codigo: codigoVisible(item), unidad: item.unidad, material: { id: item.id, es_consumible: true, ubicacion: item.ubicacion } }
      : i)));
    const ok = await guardarOVolver(() => elegirProducto(libre, item), "No se pudo elegir el producto.");
    if (ok) recargar();
  }

  function elegirDelBuscador(item) {
    if (libreResolviendo) resolver(libreResolviendo, item);
    else agregar(item);
  }

  function empezarAResolver(libre) {
    setResolviendo(libre.id);
    window.requestAnimationFrame(() => {
      buscarRef.current?.focus({ preventScroll: true });
      buscarRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  // El lector, con el foco fuera de los campos: un código del catálogo se
  // agrega (o resuelve el renglón elegido); una tarjeta abre la entrega.
  function alEscanear(codigo) {
    const item = indice?.get(normalizarCodigo(codigo));
    if (item) { elegirDelBuscador(item); return; }
    if (pareceUidTarjeta(normalizeNfcUid(codigo))) { abrirEntregar(codigo); return; }
    toast.warning(`El código ${codigo} no está en el catálogo de consumibles.`);
  }
  useKeyboardWedge({ enabled: editable && !hoja && !ia, onScan: alEscanear });

  // ── Estado de la solicitud ───────────────────────────────────────────────
  async function cambiarEstado(estado, textoOk = null) {
    const actual = datosRef.current?.solicitud;
    if (!actual || ocupadoRef.current || actual.estado === estado) return false;
    ocupadoRef.current = true;
    setOcupado(true);
    try {
      cambiarSolicitud({ estado });
      const ok = await guardarOVolver(() => cambiarEstadoSolicitud(actual.id, estado), "No se pudo cambiar el estado.");
      if (ok && textoOk) toast.success(textoOk);
      return ok;
    } finally {
      ocupadoRef.current = false;
      setOcupado(false);
    }
  }

  async function marcarTodo() {
    await guardarPendientes();
    cambiarItems((lista) => lista.map((i) => (i.estado === "pendiente" ? { ...i, estado: "preparado" } : i)));
    const ok = await guardarOVolver(() => marcarTodosPreparados(s.id), "No se pudieron marcar los renglones.");
    if (ok && datosRef.current?.solicitud?.estado === "enviada") await cambiarEstado("preparando");
    return ok;
  }

  async function pasarALista() {
    await guardarPendientes();
    if (resumen.pendientes > 0) {
      const si = await confirm({
        title: "Quedan renglones sin tildar",
        message: `${resumen.pendientes === 1 ? "Queda 1 sin tildar" : `Quedan ${resumen.pendientes} sin tildar`}. ¿Los marco listos y la paso a "Lista para retirar"?`,
        confirmLabel: "Marcar y pasar",
      });
      if (!si) return;
      if (!(await marcarTodo())) return;
    }
    if (libres.length) {
      const si = await confirm({
        title: "Hay renglones escritos a mano",
        message: "No se va a poder entregar hasta elegir el producto de cada uno. ¿La paso igual?",
        confirmLabel: "Pasar igual",
      });
      if (!si) return;
    }
    await cambiarEstado("listo", `N° ${s.numero} lista para retirar.`);
  }

  async function cancelar() {
    const si = await confirm({
      title: `¿Cancelar la N° ${s.numero}?`,
      message: "No se entrega nada y sale de la bandeja. Se puede reabrir desde Todas.",
      confirmLabel: "Cancelar la solicitud",
      cancelLabel: "Volver",
      tone: "danger",
    });
    if (si) await cambiarEstado("cancelado", `N° ${s.numero} cancelada.`);
  }

  function guardarCabecera(patch) {
    const local = { ...patch };
    if ("obra_id" in patch) local.obra = obras.find((o) => o.id === patch.obra_id) ?? null;
    cambiarSolicitud(local);
    guardarOVolver(() => actualizarSolicitud(s.id, patch), "No se pudieron guardar los datos.");
  }

  async function cambiarSede(nueva) {
    if (!nueva || nueva === s.sede_origen) return;
    if (nueva !== sede) {
      const si = await confirm({
        title: `¿Pasarla al pañol ${nueva}?`,
        message: `Deja de verse en la bandeja de ${sede} y la prepara ${nueva}.`,
        confirmLabel: `Pasar a ${nueva}`,
      });
      if (!si) return;
      const ok = await guardar(() => actualizarSolicitud(s.id, { sede_origen: nueva }), "No se pudo cambiar el pañol.");
      if (ok) { toast.success(`N° ${s.numero} pasó al pañol ${nueva}.`); onSalio?.(); }
      return;
    }
    guardarCabecera({ sede_origen: nueva });
  }

  // ── Entregar, deshacer, imprimir ─────────────────────────────────────────
  async function abrirEntregar(uid = null) {
    if (!s || !activa || !puedeOperar) return;
    await guardarPendientes();
    pedirEmpleados?.();
    setHoja({ tipo: "entregar", uid: typeof uid === "string" ? uid : null });
  }

  function cerrarHoja() {
    setHoja(null);
  }

  function alEntregar() {
    recargar();
    onCambio?.();
  }

  function alDeshacer(res) {
    setHoja(null);
    toast.success(res?.no_estaba_entregada
      ? "No estaba entregada."
      : `Entrega deshecha: ${Number(res?.anulados) === 1 ? "se anuló 1 retiro" : `se anularon ${Number(res?.anulados) || 0} retiros`}. Volvió a "Lista para retirar".`);
    recargar();
    onCambio?.();
  }

  async function imprimir() {
    await guardarPendientes();
    const d = datosRef.current;
    if (!d?.solicitud) return;
    const cl = clasificarRenglones(d.items, porId);
    setTrabajo({
      solicitud: d.solicitud,
      renglones: cl.consumibles,
      libres: cl.libres,
      sede: d.solicitud.sede_origen || sede,
      impresoEn: fechaHoraCorta(new Date()),
    });
  }

  // ── Leer la hoja con IA ──────────────────────────────────────────────────
  async function leerHoja(archivo) {
    if (archivoRef.current) archivoRef.current.value = "";
    if (!archivo || !s) return;
    setResumenIA(null);
    setIa("subiendo");
    let foto = null;
    try {
      // La foto se guarda siempre primero: es el respaldo del papel aunque la IA falle.
      foto = await subirFoto(s.id, await prepararFotoHoja(archivo), { orden: fotos.length });
      setDatos((d) => (d ? { ...d, fotos: [...d.fotos, foto] } : d));
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo subir la foto."));
      setIa(null);
      return;
    }
    try {
      setIa("leyendo");
      const lectura = await leerFotoConIA(foto, { obras: obras.map((o) => o.codigo).filter(Boolean) });
      await guardarPendientes();
      const actuales = new Set((datosRef.current?.items ?? []).filter((i) => i.material_id).map((i) => i.material_id));
      const r = repartirLectura(lectura?.items ?? [], catalogo ?? [], actuales);
      if (r.nuevos.length) await agregarItemsDesdeCatalogo(s.id, r.nuevos.map((n) => filaDesdeItem(n.item, n.cantidad)));
      for (const d of r.dudosos) await agregarItemLibre(s.id, { ...d, es_consumible: true });
      const patch = cabeceraDesdeLectura(lectura?.cabecera, datosRef.current?.solicitud ?? s, { obras, sectores: SECTORES });
      if (Object.keys(patch).length) await actualizarSolicitud(s.id, patch);
      const leidos = r.nuevos.length + r.dudosos.length + r.yaEstaban;
      if (!leidos) toast.warning("La IA no encontró renglones en la foto. Probá con una más derecha y con luz, o cargalos a mano.");
      else setResumenIA({ nuevos: r.nuevos.length, dudosos: r.dudosos.length, yaEstaban: r.yaEstaban, cabecera: Object.keys(patch).length > 0 });
    } catch (e) {
      toast.error(`${mensajeError(e, "No se pudo leer la hoja.")} La foto quedó guardada: cargá los renglones a mano.`);
    } finally {
      setIa(null);
      recargar();
      onCambio?.();
    }
  }

  // ── Vista ────────────────────────────────────────────────────────────────
  const clase = `sol-detalle${estrecho || angosto ? " is-angosto" : ""}`;

  if (!datos) {
    return (
      <section ref={raizRef} className={clase} aria-label="Solicitud">
        <div className="sol-detalle-barra">
          {angosto ? <button type="button" className="ui-btn" style={{ minHeight: 44 }} onClick={onVolver}><ArrowLeft size={16} /> Bandeja</button> : null}
          <span className="sol-espacio" style={{ flex: 1 }} />
          {!angosto ? <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" aria-label="Cerrar" onClick={onVolver}><X size={18} /></button> : null}
        </div>
        {errorCarga ? (
          <div className="sol-detalle-vacio">
            <div>
              <p>{errorCarga}</p>
              <button type="button" className="ui-btn" onClick={recargar}>Reintentar</button>
            </div>
          </div>
        ) : <Cargando llenar texto="Abriendo la solicitud…" />}
      </section>
    );
  }

  const tarde = activa && llegoTarde(s);
  const listos = consumibles.filter((r) => r.estado === "preparado" || r.estado === "reemplazado").length;

  return (
    <section ref={raizRef} className={clase} aria-label={`Solicitud N° ${s.numero}`}>
      <div className="sol-detalle-barra">
        {angosto ? <button type="button" className="ui-btn ui-btn-icono" style={{ width: 44, minHeight: 44 }} aria-label="Volver a la bandeja" onClick={onVolver}><ArrowLeft size={18} /></button> : null}
        <div className="sol-detalle-titulo">
          <h2 className="sol-num">N° {s.numero}</h2>
          <span className={`sol-tag ${TONO_ESTADO[s.estado] ?? ""}`}>{ESTADO_TEXTO[s.estado] ?? s.estado}</span>
          {s.prioridad === "urgente" ? <span className="sol-tag is-rojo"><Zap size={11} /> urgente</span> : null}
          {!estrecho && !angosto ? <span className="sol-tag">{etiquetaOrigen(s.origen)}</span> : null}
        </div>
        <button type="button" className="ui-btn" style={{ minHeight: 44 }} onClick={imprimir} aria-label="Imprimir la hoja de preparación">
          <Printer size={16} />{estrecho || angosto ? null : " Imprimir"}
        </button>
        {editable ? (
          <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" style={{ width: 44, minHeight: 44 }} aria-label="Cancelar la solicitud" title="Cancelar la solicitud" disabled={ocupado} onClick={cancelar}>
            <Ban size={17} />
          </button>
        ) : null}
        {!angosto ? <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" style={{ width: 44, minHeight: 44 }} aria-label="Cerrar" onClick={onVolver}><X size={18} /></button> : null}
      </div>

      <div className="sol-detalle-scroll">
        {s.estado === "entregado" ? (
          <div className="sol-entregada">
            <CircleCheck size={22} />
            <div style={{ minWidth: 0 }}>
              <strong>Entregada a {s.retirado_por_nombre || "—"}</strong>
              <div className="sol-muted" style={{ fontSize: 13 }}>
                {[s.retirado_at ? fechaHoraCorta(s.retirado_at) : null, s.retirado_metodo === "nfc" ? "con tarjeta" : "sin tarjeta", s.retirado_por_dni ? `DNI ${s.retirado_por_dni}` : null].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
        ) : null}
        {s.estado === "cancelado" ? (
          <div className="sol-aviso is-rojo"><Ban size={16} /><div className="sol-aviso-texto"><strong>Cancelada</strong><span>No se entrega. Si fue un error, reabrila.</span></div></div>
        ) : null}
        {!puedeOperar ? (
          <div className="sol-aviso"><TriangleAlert size={16} /><div className="sol-aviso-texto">Solo lectura: tu usuario no prepara ni entrega solicitudes.</div></div>
        ) : null}
        {activa && !s.sede_origen ? (
          <div className="sol-aviso">
            <TriangleAlert size={16} />
            <div className="sol-aviso-texto">
              <strong>No dice de qué pañol sale</strong>
              <span>Sin sede no se puede entregar.</span>
              {editable ? (
                <div className="sol-fila" style={{ flexWrap: "wrap" }}>
                  {["Chubut", "Pampa"].map((x) => (
                    <button key={x} type="button" className={`ui-btn${x === sede ? " ui-btn-suave" : ""}`} style={{ minHeight: 44 }} onClick={() => cambiarSede(x)}>Es de {x}</button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {deObra.length ? (
          <div className="sol-aviso">
            <TriangleAlert size={16} />
            <div className="sol-aviso-texto">
              <strong>Trae materiales de obra: se entregan desde Solicitudes de materiales</strong>
              <span>{deObra.map((r) => `${fmtCantidad(r.cantidad)} ${r.unidad || ""} ${r.descripcion}`.replace(/\s+/g, " ").trim()).join(" · ")}</span>
              <Link to="/solicitudes-panol">Abrir Solicitudes de materiales</Link>
            </div>
          </div>
        ) : null}
        {tarde ? (
          <div className="sol-aviso is-cian"><Clock3 size={16} /><div className="sol-aviso-texto">Llegó después de las 15: se prepara a la mañana.</div></div>
        ) : null}

        <Cabecera solicitud={s} obras={obras} editable={editable} hoyIso={hoyIso} onGuardar={guardarCabecera} onCambiarSede={cambiarSede} />

        {editable ? (
          <div className="sol-bloque">
            <div className="sol-bloque-titulo">
              {libreResolviendo ? "Elegir producto" : "Agregar"}
              <span className="sol-espacio" />
              <button
                type="button"
                className="ui-btn ui-btn-suave"
                style={{ minHeight: 40, textTransform: "none", letterSpacing: 0 }}
                disabled={Boolean(ia) || !catalogo}
                onClick={() => archivoRef.current?.click()}
                title={!catalogo ? "Esperá a que cargue el catálogo" : undefined}
              >
                {ia ? <LoaderCircle size={15} className="sol-gira" /> : <Camera size={15} />}
                {ia === "subiendo" ? "Subiendo la foto…" : ia === "leyendo" ? "Leyendo la hoja…" : "Leer la hoja con IA"}
              </button>
              <input ref={archivoRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => leerHoja(e.target.files?.[0])} />
            </div>
            <Agregar
              catalogo={catalogo}
              porCodigo={(texto) => indice?.get(normalizarCodigo(texto)) ?? null}
              resolviendo={libreResolviendo}
              onElegir={elegirDelBuscador}
              onCancelarResolver={() => setResolviendo(null)}
              inputRef={buscarRef}
              deshabilitado={!catalogo}
              cantidades={cantidades}
            />
            {resumenIA ? (
              <div className="sol-aviso is-verde" role="status">
                <Sparkles size={16} />
                <div className="sol-aviso-texto">
                  <strong>Hoja leída</strong>
                  <span>
                    {[
                      `${resumenIA.nuevos === 1 ? "1 producto cargado" : `${resumenIA.nuevos} productos cargados`}`,
                      resumenIA.dudosos ? `${resumenIA.dudosos} para revisar` : null,
                      resumenIA.yaEstaban ? `${resumenIA.yaEstaban} ya estaban` : null,
                      resumenIA.cabecera ? "se completaron datos vacíos" : null,
                    ].filter(Boolean).join(" · ")}. Revisá las cantidades contra el papel.
                  </span>
                </div>
                <button type="button" className="sol-quitar" aria-label="Cerrar el aviso" onClick={() => setResumenIA(null)}><X size={15} /></button>
              </div>
            ) : null}
            {fotos.length ? (
              <div className="sol-fotos" aria-label="Fotos del papel">
                {fotos.map((f) => (
                  <a key={f.id} href={f.url} target="_blank" rel="noreferrer" title={f.nombre || "Foto del papel"}>
                    <img src={f.url} alt="Foto del papel" loading="lazy" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : fotos.length ? (
          <div className="sol-fotos" aria-label="Fotos del papel">
            {fotos.map((f) => (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt="Foto del papel" loading="lazy" /></a>
            ))}
          </div>
        ) : null}

        {libres.length ? (
          <div className="sol-bloque" style={{ borderColor: "var(--violet-border)" }}>
            <div className="sol-bloque-titulo" style={{ color: "var(--violet)" }}>
              Para revisar <span className="sol-num">{libres.length}</span>
            </div>
            <div className="sol-muted" style={{ fontSize: 13 }}>
              Escritos a mano o leídos con dudas. Elegí el producto del catálogo de cada uno: así no se puede entregar.
            </div>
            {libres.map((r) => (
              <Libre
                key={r.id}
                r={r}
                catalogo={catalogo ?? []}
                editable={editable}
                buscando={resolviendo === r.id}
                onElegir={(item) => resolver(r, item)}
                onBuscar={() => empezarAResolver(r)}
                onCantidad={(n) => cambiarCantidad(r, n)}
                onQuitar={() => quitar(r)}
              />
            ))}
          </div>
        ) : null}

        <div className="sol-bloque">
          <div className="sol-bloque-titulo">
            Renglones
            <span className="sol-espacio" />
            {consumibles.length ? (
              <span style={{ textTransform: "none", letterSpacing: 0, fontSize: 12.5 }}>
                <span className="sol-num">{listos}</span> de <span className="sol-num">{consumibles.length}</span> listos · por ubicación
              </span>
            ) : null}
          </div>
          {consumibles.length ? (
            <div className="sol-renglones">
              {consumibles.map((r) => (
                <Renglon
                  key={r.id}
                  r={r}
                  editable={editable}
                  mostrarStock={activa}
                  onCantidad={(n) => cambiarCantidad(r, n)}
                  onListo={() => alternarListo(r)}
                  onQuitar={() => quitar(r)}
                />
              ))}
            </div>
          ) : (
            <div className="sol-vacio" style={{ padding: 16 }}>
              {editable ? "Todavía no tiene productos. Escaneá, buscá o leé la foto de la hoja." : "Sin productos del catálogo."}
            </div>
          )}
        </div>
      </div>

      {puedeOperar ? (
        <div className="sol-detalle-pie">
          {s.estado === "enviada" ? (
            <>
              <span className="sol-dim" style={{ fontSize: 13 }}>Llegó {fechaHoraCorta(s.created_at)}</span>
              <span className="sol-espacio" />
              <button type="button" className="sol-btn-grande" disabled={ocupado} onClick={() => cambiarEstado("preparando")}>
                <Play size={18} /> Empezar a preparar
              </button>
            </>
          ) : s.estado === "preparando" ? (
            <>
              {resumen.pendientes > 0 ? (
                <button type="button" className="ui-btn" style={{ minHeight: 44 }} disabled={ocupado} onClick={marcarTodo}>
                  <CheckCheck size={16} /> Marcar todo listo
                </button>
              ) : null}
              <button type="button" className="ui-btn ui-btn-fantasma" style={{ minHeight: 44 }} disabled={ocupado} onClick={() => abrirEntregar()}>
                Entregar ahora
              </button>
              <span className="sol-espacio" />
              <button type="button" className="sol-btn-grande" disabled={ocupado} onClick={pasarALista}>
                <PackageCheck size={18} /> Lista para retirar
              </button>
            </>
          ) : s.estado === "listo" ? (
            <>
              <button type="button" className="ui-btn ui-btn-fantasma" style={{ minHeight: 44 }} disabled={ocupado} onClick={() => cambiarEstado("preparando")}>
                <RotateCcw size={15} /> Volver a preparar
              </button>
              <span className="sol-espacio" />
              <button type="button" className="sol-btn-grande is-verde" disabled={ocupado} onClick={() => abrirEntregar()} title={problemas.length ? problemas[0].texto : undefined}>
                <PackageCheck size={19} /> ENTREGAR
              </button>
            </>
          ) : s.estado === "entregado" ? (
            <>
              <button type="button" className="ui-btn ui-btn-primario" style={{ minHeight: 44 }} onClick={() => setHoja({ tipo: "deshacer", corregir: true })}>
                <Pencil size={16} /> Corregir cantidades o agregar
              </button>
              <span className="sol-espacio" />
              <button type="button" className="ui-btn ui-btn-peligro" style={{ minHeight: 44 }} onClick={() => setHoja({ tipo: "deshacer" })}>
                <Undo2 size={16} /> Deshacer entrega
              </button>
            </>
          ) : s.estado === "cancelado" ? (
            <>
              <span className="sol-espacio" />
              <button type="button" className="ui-btn" style={{ minHeight: 44 }} disabled={ocupado} onClick={() => cambiarEstado("preparando", `N° ${s.numero} reabierta.`)}>
                <RotateCcw size={15} /> Reabrir
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {hoja?.tipo === "entregar" ? (
        <Entregar
          solicitud={s}
          items={items}
          empleados={empleados}
          cargandoEmpleados={cargandoEmpleados}
          uidInicial={hoja.uid}
          onCerrar={cerrarHoja}
          onEntregada={alEntregar}
        />
      ) : null}
      {hoja?.tipo === "deshacer" ? <DeshacerEntrega solicitud={s} corregir={hoja.corregir} onCerrar={cerrarHoja} onHecho={alDeshacer} /> : null}
      {trabajo ? <CapaImpresion trabajo={trabajo} /> : null}
    </section>
  );
}
