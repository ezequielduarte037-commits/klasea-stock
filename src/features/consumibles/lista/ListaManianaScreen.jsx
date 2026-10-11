import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, BookmarkPlus, Check, ClipboardList, Loader2, Minus, Plus,
  RotateCcw, Search, Send, Trash2, X,
} from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import PageHeader from "@/components/ui/PageHeader";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { SECTORES } from "@/features/panol/solicitudesPanolApi";
import { borrarSolicitud, enviarLista, enviarSolicitud, fetchConsumibles, fetchMisListas, fetchObrasActivas } from "./listaApi";
import {
  buscarConsumibles, diaRetiroDefault, esTarde, etiquetaDia, fechaAR, fmtCant,
  fold, fraseRetiro, guardarBorrador, guardarPlantillas, itemsConsumibles,
  leerBorrador, leerPlantillas, listaParaRepetir, masPedidos, mensajeError,
  nuevoId, opcionesRetiro, partirSector, resolverContraCatalogo, sedePanol, sumarDias,
} from "./listaLib";

// Carril planificado: el encargado arma desde el celular, hasta las 15, lo que
// su cuadrilla retira a las 7. Tiene que ser más rápido que el papel, con una
// mano, así que el destino se resume en una línea apenas está elegido y lo que
// se repite (ayer, plantilla, lo más pedido) está a un toque.

const CONOCIDOS = new Set(SECTORES.filter((s) => s !== "Otro"));
const SEDES = ["Pampa", "Chubut"];

const ESTADOS = {
  enviada: "Enviada",
  preparando: "Preparando",
  listo: "Lista",
  entregado: "Entregada",
  cancelado: "Cancelada",
  borrador: "Sin enviar",
};

export default function ListaManianaScreen({ profile }) {
  const uid = profile?.id || "";
  const sedePerfil = sedePanol(profile?.sede);
  const toastApi = useToast();
  const toastRef = useRef(toastApi);
  toastRef.current = toastApi;
  const confirmar = useConfirm();

  const [vista, setVista] = useState("armar");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [avisoObras, setAvisoObras] = useState("");
  const [avisoListas, setAvisoListas] = useState("");
  const [intento, setIntento] = useState(0);
  const [hidratado, setHidratado] = useState(false);
  const [catalogo, setCatalogo] = useState([]);
  const [obras, setObras] = useState([]);
  const [listas, setListas] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [modo, setModo] = useState("obra");
  const [obraId, setObraId] = useState("");
  const [sector, setSector] = useState("");
  const [sectorOtro, setSectorOtro] = useState("");
  const [sede, setSede] = useState("");
  const [fechaRetiro, setFechaRetiro] = useState(() => diaRetiroDefault(fechaAR()));
  const [tarea, setTarea] = useState("");
  const [carrito, setCarrito] = useState([]);
  const [editandoDestino, setEditandoDestino] = useState(true);
  const [q, setQ] = useState("");
  const [hoja, setHoja] = useState(null);
  const [nombrePlantilla, setNombrePlantilla] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [accionId, setAccionId] = useState(null);
  const [abiertaId, setAbiertaId] = useState(null);
  const [marca, setMarca] = useState(() => Date.now());

  const enviandoRef = useRef(false);
  const fechaRef = useRef(null);
  const scrollRef = useRef(null);
  const busquedaRef = useRef(null);

  const hoy = useMemo(() => fechaAR(new Date(marca)), [marca]);
  const tarde = useMemo(() => esTarde(new Date(marca)), [marca]);

  useEffect(() => {
    const id = window.setInterval(() => setMarca(Date.now()), 60000);
    const alVolver = () => {
      if (document.visibilityState === "visible") setMarca(Date.now());
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  useEffect(() => {
    if (!uid) return undefined;
    let vivo = true;
    const draft = leerBorrador(uid) || {};
    const plantillasLocal = leerPlantillas(uid);

    (async () => {
      const [matsR, obrasR, listasR] = await Promise.allSettled([
        fetchConsumibles(),
        fetchObrasActivas(),
        fetchMisListas(),
      ]);
      if (!vivo) return;

      if (matsR.status === "rejected") {
        setError(mensajeError(matsR.reason));
        setCargando(false);
        return;
      }

      const mats = matsR.value;
      const obrasActivas = obrasR.status === "fulfilled" ? obrasR.value : [];
      const mias = listasR.status === "fulfilled" ? listasR.value : [];
      if (!mats.length) {
        setError("No hay consumibles marcados en el catálogo.");
        setCargando(false);
        return;
      }

      const sectorDraft = partirSector(draft.sector || "", CONOCIDOS);
      let proxModo = draft.modo === "sector" || draft.modo === "obra" ? draft.modo : "";
      let proxObra = draft.obraId || "";
      let proxSector = sectorDraft.sector;
      let proxOtro = sectorDraft.sectorOtro;
      let proxSede = SEDES.includes(draft.sede) ? draft.sede : (sedePerfil || "");
      const hoyCarga = fechaAR();
      let proxFecha = draft.fechaRetiro && draft.fechaRetiro >= hoyCarga
        ? draft.fechaRetiro
        : diaRetiroDefault(hoyCarga);
      const proxTarea = typeof draft.tarea === "string" ? draft.tarea : "";
      const proxCarrito = resolverContraCatalogo(draft.carrito, mats).ok;

      // El destino sugerido es el de la última lista, no el de "ayer": si el
      // viernes pidió para el K55 y el lunes abre de nuevo, tiene que seguir
      // en el K55 aunque ayer (domingo) no haya mandado nada.
      const ultima = mias.find((l) => l.estado !== "cancelado" && (l.obraId || l.sector));
      const draftTieneDestino = (proxModo === "obra" && proxObra) || (proxModo === "sector" && proxSector);
      if (!draftTieneDestino && ultima) {
        if (ultima.obraId && obrasActivas.some((o) => o.id === ultima.obraId)) {
          proxModo = "obra";
          proxObra = ultima.obraId;
        } else if (ultima.sector) {
          proxModo = "sector";
          const partido = partirSector(ultima.sector, CONOCIDOS);
          proxSector = partido.sector;
          proxOtro = partido.sectorOtro;
        }
        if (!proxSede && SEDES.includes(ultima.sede)) proxSede = ultima.sede;
      }
      if (!proxModo) proxModo = "obra";

      const obrasFallaron = obrasR.status === "rejected";
      const obraOk = obrasActivas.some((o) => o.id === proxObra);
      const destinoOk = proxModo === "sector" ? Boolean(proxSector) : (!obrasFallaron && obraOk);
      const sedeOk = SEDES.includes(proxSede);

      setCatalogo(mats);
      setObras(obrasActivas);
      setListas(mias);
      setPlantillas(plantillasLocal);
      setModo(proxModo);
      setObraId(obraOk || obrasFallaron ? proxObra : "");
      setSector(proxSector);
      setSectorOtro(proxOtro);
      setSede(proxSede);
      setFechaRetiro(proxFecha);
      setTarea(proxTarea);
      setCarrito(proxCarrito);
      setEditandoDestino(!(destinoOk && sedeOk));
      setAvisoObras(obrasR.status === "rejected"
        ? "No pude cargar las obras. Mientras tanto podés pedir por sector."
        : "");
      setAvisoListas(listasR.status === "rejected"
        ? "No pude leer tus listas anteriores. Podés armar esta igual."
        : "");
      setError("");
      setHidratado(true);
      setCargando(false);
    })();

    return () => { vivo = false; };
  }, [uid, sedePerfil, intento]);

  const sectorEfectivo = sector === "Otro" ? (sectorOtro.trim() || "Otro") : sector;
  const obra = obras.find((o) => o.id === obraId) || null;
  const sedeOk = SEDES.includes(sede);
  const destinoOk = modo === "sector" ? Boolean(sector) : Boolean(obra);
  const completo = sedeOk && destinoOk;

  useEffect(() => {
    if (!hidratado || !uid) return;
    guardarBorrador(uid, {
      modo,
      obraId,
      sector: sectorEfectivo,
      sede,
      fechaRetiro,
      tarea,
      carrito: carrito.map((it) => ({
        materialId: it.materialId,
        descripcion: it.descripcion,
        codigo: it.codigo,
        unidad: it.unidad,
        cantidad: it.cantidad,
      })),
    });
  }, [hidratado, uid, modo, obraId, sector, sectorEfectivo, sede, fechaRetiro, tarea, carrito]);

  const refrescarListas = useCallback(async () => {
    if (!uid) return;
    try {
      setListas(await fetchMisListas());
    } catch {
      /* se queda con lo último que se vio */
    }
  }, [uid]);

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible" && hidratado) refrescarListas();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [hidratado, refrescarListas]);

  const opciones = useMemo(() => opcionesRetiro(hoy), [hoy]);
  const repetir = useMemo(() => listaParaRepetir(listas, hoy), [listas, hoy]);
  const frecuentes = useMemo(() => masPedidos(listas, catalogo), [listas, catalogo]);
  const busqueda = useMemo(() => buscarConsumibles(catalogo, q), [catalogo, q]);
  const enCarrito = useMemo(() => new Map(carrito.map((it) => [it.materialId, it])), [carrito]);
  const abiertas = listas.filter((l) => l.estado === "enviada" || l.estado === "preparando" || l.estado === "listo").length;

  const ayuda = !destinoOk
    ? (modo === "sector" ? "Elegí el sector." : "Elegí la obra.")
    : !sedeOk
      ? "Elegí de qué pañol sale."
      : fechaRetiro < hoy
        ? "Esa fecha ya pasó."
        : !carrito.length
          ? "Sumá al menos un consumible."
          : tarde
            ? `Llega tarde: la preparan a la mañana. Retiro ${fraseRetiro(fechaRetiro, hoy)}.`
            : `La retiran ${fraseRetiro(fechaRetiro, hoy)} a las 7.`;

  const puedeEnviar = completo && fechaRetiro >= hoy && carrito.length > 0 && !enviando;

  function incorporar(m, delta = 1) {
    setCarrito((prev) => {
      const i = prev.findIndex((x) => x.materialId === m.id);
      if (i < 0) {
        return [...prev, {
          materialId: m.id,
          descripcion: m.descripcion,
          codigo: m.codigo || "",
          unidad: m.unidad || "",
          cantidad: Math.max(1, Math.min(9999, delta)),
        }];
      }
      const next = prev.slice();
      next[i] = { ...next[i], cantidad: Math.min(9999, next[i].cantidad + delta) };
      return next;
    });
    if (completo) setEditandoDestino(false);
  }

  function fijarCantidad(id, cantidad, quitarEnCero) {
    if (cantidad < 1) {
      if (quitarEnCero) setCarrito((prev) => prev.filter((it) => it.materialId !== id));
      return;
    }
    setCarrito((prev) => prev.map((it) => (
      it.materialId === id ? { ...it, cantidad: Math.min(9999, cantidad) } : it
    )));
  }

  function quitar(id) {
    setCarrito((prev) => prev.filter((it) => it.materialId !== id));
  }

  async function aplicarItems(crudos, nombreTarea) {
    const { ok, faltan } = resolverContraCatalogo(crudos, catalogo);
    if (!ok.length) {
      toastRef.current.error(faltan
        ? "Esos consumibles ya no están en el catálogo."
        : "Esa lista no tiene consumibles.");
      return;
    }
    if (carrito.length) {
      const si = await confirmar({
        title: "¿Reemplazar lo que armaste?",
        message: "Pisa los consumibles de esta lista. La obra y el día siguen como están.",
        confirmLabel: "Reemplazar",
      });
      if (!si) return;
    }
    setCarrito(ok);
    if (nombreTarea) setTarea(nombreTarea);
    if (faltan) toastRef.current.warning(`${faltan} ya no están y quedaron afuera.`);
    if (completo) setEditandoDestino(false);
  }

  function repetirLista() {
    if (!repetir) return;
    aplicarItems(itemsConsumibles(repetir.lista), repetir.lista.tarea || "");
  }

  function guardarConNombre(nombre) {
    const limpio = String(nombre || "").trim().replace(/\s+/g, " ").slice(0, 40);
    if (!limpio) return;
    if (!carrito.length) {
      toastRef.current.warning("Sumá consumibles antes de guardar la plantilla.");
      return;
    }
    const items = carrito.map((it) => ({ materialId: it.materialId, cantidad: it.cantidad }));
    const ya = plantillas.find((p) => fold(p.nombre) === fold(limpio));
    const next = ya
      ? plantillas.map((p) => (p.id === ya.id ? { ...p, nombre: limpio, items } : p))
      : [{ id: nuevoId(), nombre: limpio, items }, ...plantillas].slice(0, 20);
    setPlantillas(next);
    guardarPlantillas(uid, next);
    setTarea(limpio);
    setNombrePlantilla("");
    setHoja(null);
    toastRef.current.success(ya ? "Plantilla actualizada." : "Plantilla guardada en este celular.");
  }

  async function borrarPlantilla(p) {
    const si = await confirmar({
      title: `¿Borrar “${p.nombre}”?`,
      message: "La plantilla queda sólo en este celular. Borrarla no toca las listas ya enviadas.",
      confirmLabel: "Borrar",
      tone: "danger",
    });
    if (!si) return;
    const next = plantillas.filter((x) => x.id !== p.id);
    setPlantillas(next);
    guardarPlantillas(uid, next);
  }

  function abrirFecha() {
    const el = fechaRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.click();
    } catch {
      el.click();
    }
  }

  async function enviar() {
    if (enviandoRef.current) return;
    if (!puedeEnviar) {
      toastRef.current.warning(ayuda);
      if (!completo) setEditandoDestino(true);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toastRef.current.warning("Estás sin señal. La lista queda en el celular: reintentá cuando vuelva.");
      return;
    }

    const { ok, faltan } = resolverContraCatalogo(carrito, catalogo);
    if (!ok.length) {
      setCarrito([]);
      toastRef.current.error("Esos consumibles ya no están en el catálogo.");
      return;
    }
    if (faltan) {
      setCarrito(ok);
      toastRef.current.warning(`${faltan} ya no están en el catálogo y no se mandan.`);
    }

    const llegaTarde = esTarde();
    enviandoRef.current = true;
    setEnviando(true);
    try {
      const creada = await enviarLista({
        cabecera: {
          obra_id: modo === "obra" ? obra.id : null,
          obra_texto: modo === "obra" ? (obra.codigo || obra.descripcion || null) : null,
          sector: modo === "sector" ? sectorEfectivo : null,
          sede_origen: sede,
          fecha_pedido: fechaAR(),
          fecha_retiro: fechaRetiro,
          solicita: profile?.username || (modo === "obra" ? "" : "Encargado"),
          tarea: tarea.trim() || null,
          observaciones: llegaTarde ? "Llegó después de las 15. Prepararla a la mañana." : null,
        },
        items: ok,
      });
      setCarrito([]);
      setTarea("");
      setQ("");
      toastRef.current.success(llegaTarde
        ? `Lista N° ${creada.numero} enviada. Quedó para preparar a la mañana.`
        : `Lista N° ${creada.numero} enviada. La retiran ${fraseRetiro(fechaRetiro, fechaAR())} a las 7.`);
      setVista("enviadas");
      scrollRef.current?.scrollTo(0, 0);
      await refrescarListas();
    } catch (err) {
      toastRef.current.error(mensajeError(err));
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  async function anular(lista) {
    const si = await confirmar({
      title: `¿Anular la N° ${lista.numero}?`,
      message: "Pañol todavía no la tomó. Si la anulás, no la preparan.",
      confirmLabel: "Anular",
      tone: "danger",
    });
    if (!si) return;
    setAccionId(lista.id);
    try {
      await borrarSolicitud(lista.id);
      setListas((prev) => prev.filter((l) => l.id !== lista.id));
      toastRef.current.success("Lista anulada.");
    } catch (err) {
      toastRef.current.error(mensajeError(err));
    } finally {
      setAccionId(null);
    }
  }

  async function reenviar(lista) {
    setAccionId(lista.id);
    try {
      await enviarSolicitud(lista.id);
      toastRef.current.success(`Lista N° ${lista.numero} enviada.`);
      await refrescarListas();
    } catch (err) {
      toastRef.current.error(mensajeError(err));
    } finally {
      setAccionId(null);
    }
  }

  function irA(proxima) {
    setVista(proxima);
    scrollRef.current?.scrollTo(0, 0);
    if (proxima === "enviadas") refrescarListas();
  }

  const resumenDestino = modo === "sector"
    ? (sector ? sectorEfectivo : "Elegí el sector")
    : (obra ? (obra.codigo || obra.descripcion) : "Elegí la obra");
  const resumenExtra = [sedeOk ? sede : "Elegí el pañol", etiquetaDia(fechaRetiro, hoy)].join(" · ");
  const mostrarForm = !completo || editandoDestino;
  const fechaFuera = !opciones.includes(fechaRetiro);

  return (
    <div className={`lm-root${hoja ? " is-hoja" : ""}`}>
      <style>{CSS}</style>

      <PageHeader
        icon={ClipboardList}
        eyebrow="Consumibles"
        title="Para mañana"
        subtitle="La armás hoy y la retiran a las 7, sin cola."
      >
        <div className="ui-tabs" role="tablist" aria-label="Lista de consumibles">
          <button type="button" role="tab" className="ui-tab" aria-selected={vista === "armar"} onClick={() => irA("armar")}>
            Armar
          </button>
          <button type="button" role="tab" className="ui-tab" aria-selected={vista === "enviadas"} onClick={() => irA("enviadas")}>
            Enviadas{abiertas ? ` ${abiertas}` : ""}
          </button>
        </div>
      </PageHeader>

      {vista === "armar" && tarde && !cargando && !error && (
        <div className="lm-tarde" role="status">
          <div className="lm-tarde-inner">
            <AlertTriangle size={18} aria-hidden="true" />
            <p>Pasaron las 15. Pañol la prepara a la mañana. Igual la podés mandar.</p>
          </div>
        </div>
      )}

      {cargando && <Cargando llenar texto="Abriendo tu lista…" />}

      {!cargando && error && (
        <div className="lm-scroll">
          <div className="lm-cuerpo">
            <div className="lm-vacio">
              <ClipboardList size={22} aria-hidden="true" />
              <strong>No se pudo abrir la lista</strong>
              <p>{error}</p>
              <button type="button" className="ui-btn ui-btn-primario" onClick={() => { setError(""); setCargando(true); setIntento((n) => n + 1); }}>
                Reintentar
              </button>
            </div>
          </div>
        </div>
      )}

      {!cargando && !error && (
        <div className="lm-scroll" ref={scrollRef}>
          <div className="lm-cuerpo">
            {vista === "armar" ? (
              <>
                {mostrarForm ? (
                  <section className="lm-card" aria-label="Destino y día">
                    <div className="lm-seg-grupo" role="group" aria-label="Para quién es">
                      <button type="button" className={modo === "obra" ? "lm-seg is-on" : "lm-seg"} aria-pressed={modo === "obra"} onClick={() => setModo("obra")}>Obra</button>
                      <button type="button" className={modo === "sector" ? "lm-seg is-on" : "lm-seg"} aria-pressed={modo === "sector"} onClick={() => setModo("sector")}>Sector</button>
                    </div>

                    {modo === "obra" ? (
                      <button type="button" className="lm-elegir" onClick={() => setHoja("obra")}>
                        <span>
                          <small>Obra</small>
                          <strong>{obra ? (obra.codigo || obra.descripcion) : "Elegí la obra"}</strong>
                          {obra?.descripcion && obra.codigo && obra.descripcion !== obra.codigo
                            ? <em>{obra.descripcion}</em>
                            : null}
                        </span>
                        <Search size={18} aria-hidden="true" />
                      </button>
                    ) : (
                      <div className="lm-carril-wrap">
                        <div className="lm-carril" role="group" aria-label="Sector">
                          {SECTORES.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className={sector === s ? "lm-chip is-on" : "lm-chip"}
                              aria-pressed={sector === s}
                              onClick={() => setSector(s)}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {modo === "sector" && sector === "Otro" && (
                      <input
                        className="ui-input"
                        value={sectorOtro}
                        onChange={(e) => setSectorOtro(e.target.value.slice(0, 40))}
                        placeholder="Cuál sector"
                        aria-label="Cuál sector"
                        maxLength={40}
                      />
                    )}

                    {avisoObras && modo === "obra" && <p className="lm-nota">{avisoObras}</p>}

                    <div>
                      <div className="lm-etiqueta">Sale de</div>
                      <div className="lm-seg-grupo" role="group" aria-label="Pañol">
                        {SEDES.map((s) => (
                          <button key={s} type="button" className={sede === s ? "lm-seg is-on" : "lm-seg"} aria-pressed={sede === s} onClick={() => setSede(s)}>{s}</button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="lm-etiqueta">Día de retiro</div>
                      <div className="lm-carril-wrap">
                        <div className="lm-carril" role="group" aria-label="Día de retiro">
                          {opciones.map((iso) => (
                            <button
                              key={iso}
                              type="button"
                              className={fechaRetiro === iso ? "lm-chip is-on" : "lm-chip"}
                              aria-pressed={fechaRetiro === iso}
                              onClick={() => setFechaRetiro(iso)}
                            >
                              {etiquetaDia(iso, hoy)}
                            </button>
                          ))}
                          {fechaFuera && (
                            <button type="button" className="lm-chip is-on" aria-pressed="true" onClick={abrirFecha}>
                              {etiquetaDia(fechaRetiro, hoy)}
                            </button>
                          )}
                          <button type="button" className="lm-chip" onClick={abrirFecha}>Otro día</button>
                        </div>
                      </div>
                      <input
                        ref={fechaRef}
                        className="lm-fecha-nativa"
                        type="date"
                        value={fechaRetiro}
                        min={hoy}
                        max={sumarDias(hoy, 60)}
                        onChange={(e) => { if (e.target.value) setFechaRetiro(e.target.value); }}
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                    </div>

                    <label className="lm-campo">
                      <span className="lm-etiqueta">Tarea, si hace falta</span>
                      <input
                        className="ui-input"
                        value={tarea}
                        onChange={(e) => setTarea(e.target.value.slice(0, 80))}
                        placeholder="Ej: lijar cubierta"
                        maxLength={80}
                      />
                    </label>

                    {completo && (
                      <button type="button" className="ui-btn ui-btn-suave lm-bloque" onClick={() => { setEditandoDestino(false); busquedaRef.current?.focus(); }}>
                        Listo, a los consumibles
                      </button>
                    )}
                  </section>
                ) : (
                  <button type="button" className="lm-resumen" onClick={() => setEditandoDestino(true)}>
                    <span>
                      <strong>{resumenDestino}</strong>
                      <small>{resumenExtra}</small>
                    </span>
                    <em>Cambiar</em>
                  </button>
                )}

                {avisoListas && <p className="lm-nota">{avisoListas}</p>}

                {(repetir || plantillas.length > 0) && (
                  <div className="lm-carril-wrap is-pagina">
                    <div className="lm-carril" aria-label="Atajos">
                      {repetir && (
                        <button type="button" className="lm-chip" onClick={repetirLista}>
                          <RotateCcw size={16} aria-hidden="true" />
                          {repetir.deAyer ? "Repetir la de ayer" : "Repetir la última"}
                        </button>
                      )}
                      {plantillas.map((p) => (
                        <button key={p.id} type="button" className="lm-chip" onClick={() => aplicarItems(p.items, p.nombre)}>
                          <span className="lm-chip-nombre">{p.nombre}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="lm-buscar">
                  <Search size={18} className="lm-buscar-icono" aria-hidden="true" />
                  <input
                    ref={busquedaRef}
                    className="ui-input"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && busqueda.items[0]) {
                        e.preventDefault();
                        incorporar(busqueda.items[0]);
                      }
                    }}
                    placeholder="Buscar consumible…"
                    aria-label="Buscar consumible"
                    enterKeyHint="search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {q && (
                    <button type="button" className="lm-buscar-x" onClick={() => { setQ(""); busquedaRef.current?.focus(); }} aria-label="Borrar búsqueda">
                      <X size={18} />
                    </button>
                  )}
                </div>

                {q.trim() ? (
                  busqueda.corto ? (
                    <p className="lm-nota">Escribí al menos dos letras.</p>
                  ) : busqueda.items.length === 0 ? (
                    <p className="lm-nota">Nada con ese nombre. Probá con otra palabra o con el código.</p>
                  ) : (
                    <div className="lm-card lm-lista-add">
                      {busqueda.items.map((m) => (
                        <FilaConsumible
                          key={m.id}
                          material={m}
                          enLista={enCarrito.get(m.id)}
                          onSumar={() => incorporar(m)}
                          onCantidad={(n) => fijarCantidad(m.id, n, true)}
                        />
                      ))}
                      {busqueda.total > busqueda.items.length && (
                        <p className="lm-mas-resultados">Hay más. Afiná el nombre.</p>
                      )}
                    </div>
                  )
                ) : frecuentes.length > 0 ? (
                  <div>
                    <div className="lm-etiqueta">Los que más pedís</div>
                    <div className="lm-carril-wrap is-pagina">
                      <div className="lm-carril">
                        {frecuentes.map((m) => {
                          const puesto = enCarrito.get(m.id);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              className={puesto ? "lm-chip is-on" : "lm-chip"}
                              onClick={() => (puesto ? fijarCantidad(m.id, puesto.cantidad + 1, false) : incorporar(m))}
                            >
                              <span className="lm-chip-nombre">{m.descripcion}</span>
                              {puesto ? <b>{puesto.cantidad}</b> : <Plus size={15} aria-hidden="true" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="lm-nota">Buscá por nombre. Cuando mandes un par de listas, acá aparecen los que más pedís.</p>
                )}

                {carrito.length > 0 && (
                  <section className="lm-card" aria-label="Tu lista">
                    <div className="lm-etiqueta">Tu lista · {carrito.length}</div>
                    {carrito.map((it) => (
                      <div className="lm-item" key={it.materialId}>
                        <div className="lm-item-txt">
                          <strong className="lm-nombre">{it.descripcion}</strong>
                          {(it.codigo || it.unidad) && (
                            <span className="lm-meta">{[it.codigo, it.unidad].filter(Boolean).join(" · ")}</span>
                          )}
                        </div>
                        <div className="lm-item-acciones">
                          <Cantidad valor={it.cantidad} onChange={(n) => fijarCantidad(it.materialId, n, false)} />
                          <button type="button" className="lm-icono lm-icono-peligro" onClick={() => quitar(it.materialId)} aria-label={`Quitar ${it.descripcion}`}>
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="ui-btn lm-bloque"
                      onClick={() => { setNombrePlantilla(tarea.trim()); setHoja("plantilla"); }}
                    >
                      <BookmarkPlus size={16} aria-hidden="true" />
                      Guardar como plantilla
                    </button>
                  </section>
                )}
              </>
            ) : (
              listas.length === 0 ? (
                <div className="lm-vacio">
                  <ClipboardList size={22} aria-hidden="true" />
                  <strong>Todavía no mandaste ninguna</strong>
                  <p>Armala y pañol la deja lista para las 7.</p>
                  <button type="button" className="ui-btn ui-btn-primario" onClick={() => irA("armar")}>Armar la de mañana</button>
                </div>
              ) : (
                listas.map((lista) => (
                  <TarjetaLista
                    key={lista.id}
                    lista={lista}
                    hoy={hoy}
                    abierta={abiertaId === lista.id}
                    ocupada={accionId === lista.id}
                    onToggle={() => setAbiertaId((id) => (id === lista.id ? null : lista.id))}
                    onAnular={() => anular(lista)}
                    onReenviar={() => reenviar(lista)}
                  />
                ))
              )
            )}
          </div>
        </div>
      )}

      {!cargando && !error && vista === "armar" && (
        <footer className="lm-pie">
          <div className="lm-pie-inner">
            <p className="lm-ayuda" aria-live="polite">{ayuda}</p>
            <button type="button" className="ui-btn ui-btn-primario lm-enviar" disabled={!puedeEnviar} onClick={enviar}>
              {enviando ? <Loader2 size={18} className="lm-gira" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
              {enviando ? "Enviando…" : carrito.length ? `Enviar · ${carrito.length} ${carrito.length === 1 ? "ítem" : "ítems"}` : "Enviar lista"}
            </button>
          </div>
        </footer>
      )}

      {hoja === "obra" && (
        <Hoja titulo="Elegí la obra" onClose={() => setHoja(null)}>
          <ElegirObra
            obras={obras}
            listas={listas}
            obraId={obraId}
            onElegir={(o) => { setObraId(o.id); setModo("obra"); setHoja(null); }}
          />
        </Hoja>
      )}

      {hoja === "plantilla" && (
        <Hoja
          titulo="Plantilla"
          onClose={() => setHoja(null)}
          pie={(
            <button type="button" className="ui-btn ui-btn-primario lm-bloque" disabled={!nombrePlantilla.trim() || !carrito.length} onClick={() => guardarConNombre(nombrePlantilla)}>
              {plantillas.some((p) => fold(p.nombre) === fold(nombrePlantilla.trim())) ? "Actualizar plantilla" : "Guardar plantilla"}
            </button>
          )}
        >
          <form onSubmit={(e) => { e.preventDefault(); guardarConNombre(nombrePlantilla); }}>
            <label className="lm-campo">
              <span className="lm-etiqueta">Nombre de la tarea</span>
              <input
                className="ui-input"
                value={nombrePlantilla}
                onChange={(e) => setNombrePlantilla(e.target.value.slice(0, 40))}
                placeholder="Ej: lijado de casco"
                aria-label="Nombre de la plantilla"
                maxLength={40}
                autoFocus
              />
            </label>
          </form>
          {plantillas.length > 0 && (
            <div className="lm-plantillas">
              <div className="lm-etiqueta">En este celular</div>
              {plantillas.map((p) => (
                <div className="lm-plantilla" key={p.id}>
                  <button type="button" className="lm-plantilla-nombre" onClick={() => { setHoja(null); aplicarItems(p.items, p.nombre); }}>
                    {p.nombre}
                    <small>{p.items.length} {p.items.length === 1 ? "ítem" : "ítems"}</small>
                  </button>
                  <button type="button" className="lm-icono lm-icono-peligro" onClick={() => borrarPlantilla(p)} aria-label={`Borrar plantilla ${p.nombre}`}>
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="lm-nota">Queda en este teléfono. Otro celular no la ve.</p>
        </Hoja>
      )}
    </div>
  );
}

function FilaConsumible({ material, enLista, onSumar, onCantidad }) {
  const meta = [material.codigo, material.unidad].filter(Boolean).join(" · ");
  if (!enLista) {
    return (
      <button type="button" className="lm-fila" onClick={onSumar}>
        <span className="lm-fila-txt">
          <strong className="lm-nombre">{material.descripcion}</strong>
          {meta && <span className="lm-meta">{meta}</span>}
        </span>
        <span className="lm-mas" aria-hidden="true"><Plus size={20} /></span>
      </button>
    );
  }
  return (
    <div className="lm-fila">
      <span className="lm-fila-txt">
        <strong className="lm-nombre">{material.descripcion}</strong>
        {meta && <span className="lm-meta">{meta}</span>}
      </span>
      <Cantidad valor={enLista.cantidad} onChange={onCantidad} permiteCero />
    </div>
  );
}

function Cantidad({ valor, onChange, permiteCero = false }) {
  const n = Number(valor) || 1;
  return (
    <div className="lm-step">
      <button type="button" className="lm-step-btn" onClick={() => onChange(n - 1)} disabled={!permiteCero && n <= 1} aria-label="Restar uno">
        <Minus size={18} />
      </button>
      <input
        className="lm-cant"
        inputMode="numeric"
        aria-label="Cantidad"
        value={valor}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
          if (!raw) return;
          onChange(Number(raw));
        }}
      />
      <button type="button" className="lm-step-btn" onClick={() => onChange(Math.min(9999, n + 1))} disabled={n >= 9999} aria-label="Sumar uno">
        <Plus size={18} />
      </button>
    </div>
  );
}

function ElegirObra({ obras, listas, obraId, onElegir }) {
  const [q, setQ] = useState("");
  const needle = fold(q);
  const recientes = useMemo(() => {
    const ids = [];
    for (const l of listas) {
      if (l.obraId && !ids.includes(l.obraId)) ids.push(l.obraId);
    }
    return ids.map((id) => obras.find((o) => o.id === id)).filter(Boolean).slice(0, 3);
  }, [listas, obras]);
  const filtradas = useMemo(() => {
    const base = needle
      ? obras.filter((o) => fold(`${o.codigo || ""} ${o.descripcion || ""}`).includes(needle))
      : obras;
    return [...base].sort((a, b) => String(a.codigo || a.descripcion || "").localeCompare(String(b.codigo || b.descripcion || ""), "es", { numeric: true }));
  }, [obras, needle]);

  return (
    <>
      <div className="lm-hoja-busca">
        <input
          className="ui-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre o código de la obra"
          aria-label="Buscar obra"
          autoFocus
          autoComplete="off"
        />
      </div>
      {!needle && recientes.length > 0 && (
        <div className="lm-obras">
          <div className="lm-etiqueta">Últimas</div>
          {recientes.map((o) => (
            <BotonObra key={`r-${o.id}`} obra={o} on={o.id === obraId} onElegir={onElegir} />
          ))}
        </div>
      )}
      <div className="lm-obras">
        {!needle && recientes.length > 0 && <div className="lm-etiqueta">Todas</div>}
        {filtradas.length === 0 && <p className="lm-nota">{needle ? "Ninguna obra con ese nombre." : "No hay obras activas."}</p>}
        {filtradas.map((o) => (
          <BotonObra key={o.id} obra={o} on={o.id === obraId} onElegir={onElegir} />
        ))}
      </div>
    </>
  );
}

function BotonObra({ obra, on, onElegir }) {
  return (
    <button type="button" className={on ? "lm-obra-op is-on" : "lm-obra-op"} onClick={() => onElegir(obra)}>
      <span>
        <strong>{obra.codigo || "Sin código"}</strong>
        {obra.descripcion && obra.descripcion !== obra.codigo && <small>{obra.descripcion}</small>}
      </span>
      {on && <Check size={18} aria-hidden="true" />}
    </button>
  );
}

function TarjetaLista({ lista, hoy, abierta, ocupada, onToggle, onAnular, onReenviar }) {
  const titulo = lista.obraCodigo || lista.obraNombre || lista.obraTexto || lista.sector || "Sin destino";
  const sub = lista.obraCodigo && lista.obraNombre && lista.obraNombre !== lista.obraCodigo
    ? lista.obraNombre
    : (lista.sede ? `Pañol ${lista.sede}` : "");
  const tarde = /prepararla a la mañana/i.test(lista.observaciones || "");
  const puedeAnular = lista.estado === "enviada" || lista.estado === "borrador";
  const retiro = lista.fechaRetiro ? etiquetaDia(lista.fechaRetiro, hoy) : "sin día";

  return (
    <article className="lm-card lm-enviada">
      <button type="button" className="lm-enviada-cab" onClick={onToggle} aria-expanded={abierta}>
        <span className="lm-enviada-top">
          <b className="lm-num">N° {lista.numero}</b>
          <span className="lm-pastilla" data-estado={lista.estado}>{ESTADOS[lista.estado] || lista.estado}</span>
        </span>
        <strong className="lm-nombre">{titulo}</strong>
        <span className="lm-meta">
          {sub ? `${sub} · ` : ""}Retiro {retiro} · {lista.items.length} {lista.items.length === 1 ? "ítem" : "ítems"}
          {tarde ? " · a la mañana" : ""}
          {lista.tarea ? ` · ${lista.tarea}` : ""}
        </span>
      </button>
      {abierta && (
        <div className="lm-enviada-items">
          {lista.items.length === 0 && <p className="lm-nota">Esta lista no tiene ítems.</p>}
          {lista.items.map((it) => (
            <div className="lm-enviada-item" key={it.id}>
              <span>{it.descripcion}</span>
              <b>{fmtCant(it.cantidad)}{it.unidad ? ` ${it.unidad}` : ""}</b>
            </div>
          ))}
          {lista.estado === "borrador" && lista.items.length > 0 && (
            <button type="button" className="ui-btn ui-btn-primario lm-bloque" disabled={ocupada} onClick={onReenviar}>
              {ocupada ? "Enviando…" : "Mandar a pañol"}
            </button>
          )}
          {puedeAnular && (
            <button type="button" className="ui-btn ui-btn-peligro lm-bloque" disabled={ocupada} onClick={onAnular}>
              {ocupada ? "Anulando…" : "Anular"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function Hoja({ titulo, onClose, children, pie = null }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="lm-hoja-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{HOJA_CSS}</style>
      <div className="lm-hoja" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="lm-hoja-barra" aria-hidden="true" />
        <div className="lm-hoja-cab">
          <strong>{titulo}</strong>
          <button type="button" className="lm-icono" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="lm-hoja-cuerpo">{children}</div>
        {pie && <div className="lm-hoja-pie">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}

const CSS = `
.lm-root {
  position: absolute;
  top: 0; right: 0; bottom: 0; left: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
  color: var(--text);
  font-family: 'Outfit', system-ui, sans-serif;
}
.lm-root button { font-family: inherit; }
.lm-root.is-hoja .lm-scroll { overflow: hidden; }
.lm-root .lm-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.lm-root .lm-cuerpo {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 14px 16px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.lm-root .lm-tarde {
  flex-shrink: 0;
  background: var(--cyan-soft);
  border-bottom: 1px solid var(--cyan-border);
  color: var(--text);
}
.lm-root .lm-tarde-inner {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 10px 16px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.lm-root .lm-tarde svg { color: var(--cyan); flex-shrink: 0; margin-top: 1px; }
.lm-root .lm-tarde p { margin: 0; font-size: 13.5px; font-weight: 500; line-height: 1.35; }
.lm-root .lm-card {
  background: var(--panel-solid);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--elev-1);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lm-root .lm-etiqueta {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 650;
  color: var(--dim);
}
.lm-root .lm-card > div > .lm-etiqueta { margin-bottom: 6px; }
.lm-root .lm-seg-grupo {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: var(--panel-2);
  border: 1px solid var(--border);
}
.lm-root .lm-seg {
  flex: 1;
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: var(--dim);
  font-size: 15px;
  font-weight: 600;
}
.lm-root .lm-seg.is-on {
  background: var(--blue-soft);
  border-color: var(--blue-border);
  color: var(--blue);
}
.lm-root .lm-elegir, .lm-root .lm-resumen {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 14px;
  border: 1px solid var(--border-2);
  background: var(--panel);
  color: var(--text);
  text-align: left;
}
.lm-root .lm-elegir span, .lm-root .lm-resumen span { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.lm-root .lm-elegir small, .lm-root .lm-resumen small { font-size: 12px; font-weight: 600; color: var(--dim); }
.lm-root .lm-elegir strong, .lm-root .lm-resumen strong {
  font-size: 16px; font-weight: 650; line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lm-root .lm-elegir em { font-style: normal; font-size: 12.5px; font-weight: 500; color: var(--muted); }
.lm-root .lm-elegir svg { color: var(--dim); flex-shrink: 0; }
.lm-root .lm-resumen em { font-style: normal; font-size: 13px; font-weight: 650; color: var(--blue); }
.lm-root .lm-carril-wrap { position: relative; }
.lm-root .lm-carril {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-right: 18px;
}
.lm-root .lm-carril::-webkit-scrollbar { display: none; }
.lm-root .lm-carril > * { flex-shrink: 0; }
.lm-root .lm-carril-wrap::after {
  content: "";
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 22px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, var(--panel-solid));
}
.lm-root .lm-carril-wrap.is-pagina::after {
  background: linear-gradient(90deg, transparent, var(--bg));
}
.lm-root .lm-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  font-size: 14px;
  font-weight: 600;
}
.lm-root .lm-chip.is-on {
  background: var(--blue-soft);
  border-color: var(--blue-border);
  color: var(--blue);
}
.lm-root .lm-chip b {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 600;
}
.lm-root .lm-chip-nombre {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lm-root .lm-campo { display: flex; flex-direction: column; }
.lm-root .lm-nota { margin: 0; font-size: 13px; font-weight: 500; line-height: 1.4; color: var(--dim); }
.lm-root .lm-fecha-nativa {
  position: absolute;
  width: 1px; height: 1px;
  opacity: 0;
  pointer-events: none;
}
.lm-root .lm-buscar { position: relative; }
.lm-root .lm-buscar-icono {
  position: absolute;
  left: 12px; top: 50%;
  transform: translateY(-50%);
  color: var(--dim);
  pointer-events: none;
}
.lm-root .lm-buscar .ui-input { padding-left: 40px; padding-right: 44px; }
.lm-root .lm-buscar-x {
  position: absolute;
  right: 2px; top: 50%;
  transform: translateY(-50%);
  width: 44px; height: 44px; min-height: 44px;
  border: 0; border-radius: 10px;
  background: transparent;
  color: var(--muted);
  display: grid; place-items: center;
}
.lm-root .lm-nombre {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--text);
}
.lm-root .lm-meta {
  display: block;
  margin-top: 2px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 500;
  color: var(--dim);
}
.lm-root .lm-fila, .lm-root .lm-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  min-height: 52px;
  padding: 8px 2px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  text-align: left;
}
.lm-root .lm-lista-add .lm-fila:last-child, .lm-root .lm-card .lm-item:last-of-type { border-bottom: 0; }
.lm-root .lm-fila-txt, .lm-root .lm-item-txt { flex: 1 1 150px; min-width: 0; }
.lm-root .lm-mas {
  width: 44px; height: 44px;
  flex-shrink: 0;
  display: grid; place-items: center;
  border-radius: 12px;
  background: var(--blue-soft);
  color: var(--blue);
}
.lm-root .lm-item-acciones { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.lm-root .lm-step {
  display: flex;
  align-items: center;
  border: 1px solid var(--border-2);
  border-radius: 12px;
  background: var(--panel);
}
.lm-root .lm-step-btn {
  width: 44px; height: 44px; min-height: 44px;
  border: 0; border-radius: 12px;
  background: transparent;
  color: var(--text);
  display: grid; place-items: center;
}
.lm-root .lm-step-btn:disabled { color: var(--subtle); }
.lm-root .lm-cant {
  width: 48px; height: 44px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  padding: 0;
}
.lm-root .lm-icono {
  width: 44px; height: 44px; min-height: 44px;
  padding: 0;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  display: grid; place-items: center;
  flex-shrink: 0;
}
.lm-root .lm-icono-peligro {
  color: var(--red);
  background: var(--red-soft);
  border-color: var(--red-border);
}
.lm-root .lm-bloque { width: 100%; min-height: 44px; }
.lm-root .lm-mas-resultados { margin: 4px 2px 0; font-size: 12.5px; color: var(--dim); font-weight: 500; }
.lm-root .lm-pie {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  background: var(--topbar);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
}
.lm-root .lm-pie-inner { width: 100%; max-width: 640px; margin: 0 auto; }
.lm-root .lm-ayuda { margin: 0 0 8px; font-size: 13px; font-weight: 500; color: var(--muted); line-height: 1.35; }
.lm-root .lm-enviar { width: 100%; min-height: 48px; font-size: 16px; font-weight: 650; border-radius: 14px; }
.lm-root .lm-gira { animation: lm-giro .7s linear infinite; }
@keyframes lm-giro { to { transform: rotate(360deg); } }
.lm-root .lm-vacio {
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 28px 16px;
  text-align: center;
  border: 1px dashed var(--border-2);
  border-radius: 16px;
  color: var(--dim);
}
.lm-root .lm-vacio strong { color: var(--text); font-size: 16px; font-weight: 700; }
.lm-root .lm-vacio p { margin: 0 0 6px; max-width: 280px; font-size: 13.5px; line-height: 1.4; }
.lm-root .lm-enviada { padding: 0; gap: 0; }
.lm-root .lm-enviada-cab {
  width: 100%;
  min-height: 72px;
  padding: 12px;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.lm-root .lm-enviada-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.lm-root .lm-num {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--dim);
}
.lm-root .lm-pastilla {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
}
.lm-root .lm-pastilla[data-estado="enviada"] { color: var(--violet); background: var(--violet-soft); border-color: var(--violet-border); }
.lm-root .lm-pastilla[data-estado="preparando"] { color: var(--cyan); background: var(--cyan-soft); border-color: var(--cyan-border); }
.lm-root .lm-pastilla[data-estado="listo"] { color: var(--blue); background: var(--blue-soft); border-color: var(--blue-border); }
.lm-root .lm-pastilla[data-estado="entregado"] { color: var(--green); background: var(--green-soft); border-color: var(--green-border); }
.lm-root .lm-pastilla[data-estado="cancelado"] { color: var(--red); background: var(--red-soft); border-color: var(--red-border); }
.lm-root .lm-enviada-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px 12px;
  border-top: 1px solid var(--border);
}
.lm-root .lm-enviada-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-top: 8px;
  font-size: 13.5px;
  font-weight: 500;
}
.lm-root .lm-enviada-item span { min-width: 0; }
.lm-root .lm-enviada-item b {
  flex-shrink: 0;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 600;
  font-size: 12.5px;
}
@media (min-width: 900px) {
  .lm-root .lm-cuerpo { padding: 18px 8px 32px; }
}
`;

const HOJA_CSS = `
.lm-hoja-fondo {
  position: fixed;
  top: 0; right: 0; bottom: 0; left: 0;
  z-index: 400;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 8vh 16px 16px;
  background: var(--overlay);
}
.lm-hoja {
  width: min(520px, 100%);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--panel-solid);
  border: 1px solid var(--border-2);
  border-radius: 18px;
  box-shadow: var(--elev-2);
  color: var(--text);
  font-family: 'Outfit', system-ui, sans-serif;
  animation: lm-hoja-entra .22s cubic-bezier(.22,1,.36,1);
}
.lm-hoja button { font-family: inherit; }
.lm-hoja-barra { display: none; }
.lm-hoja-cab {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 8px 16px;
}
.lm-hoja-cab strong { flex: 1; font-size: 17px; font-weight: 700; }
.lm-hoja-cuerpo { flex: 1; min-height: 0; overflow: auto; padding: 4px 14px 16px; }
.lm-hoja-pie {
  flex-shrink: 0;
  padding: 10px 14px calc(12px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
}
.lm-hoja .lm-hoja-busca {
  position: sticky;
  top: 0;
  z-index: 1;
  padding-bottom: 8px;
  background: var(--panel-solid);
}
.lm-hoja .lm-etiqueta { margin: 8px 0 6px; font-size: 12px; font-weight: 650; color: var(--dim); }
.lm-hoja .lm-nota { margin: 8px 0 0; font-size: 13px; color: var(--dim); font-weight: 500; }
.lm-hoja .lm-campo { display: flex; flex-direction: column; }
.lm-hoja .lm-obras, .lm-hoja .lm-plantillas { display: flex; flex-direction: column; gap: 6px; }
.lm-hoja .lm-obra-op, .lm-hoja .lm-plantilla-nombre {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  text-align: left;
}
.lm-hoja .lm-obra-op span, .lm-hoja .lm-plantilla-nombre { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.lm-hoja .lm-obra-op strong, .lm-hoja .lm-plantilla-nombre { font-size: 15px; font-weight: 650; }
.lm-hoja .lm-obra-op small, .lm-hoja .lm-plantilla-nombre small { font-size: 12.5px; font-weight: 500; color: var(--dim); }
.lm-hoja .lm-obra-op.is-on { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); }
.lm-hoja .lm-obra-op svg { flex-shrink: 0; }
.lm-hoja .lm-plantilla { display: flex; align-items: center; gap: 8px; }
.lm-hoja .lm-icono {
  width: 44px; height: 44px; min-height: 44px;
  padding: 0; border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  display: grid; place-items: center;
  flex-shrink: 0;
}
.lm-hoja .lm-icono-peligro { color: var(--red); background: var(--red-soft); border-color: var(--red-border); }
.lm-hoja .lm-bloque { width: 100%; min-height: 48px; }
@keyframes lm-hoja-entra { from { opacity: 0; transform: translateY(8px); } }
@keyframes lm-hoja-sube { from { transform: translateY(100%); } }
@media (max-width: 640px) {
  .lm-hoja-fondo { align-items: flex-end; padding: 0; }
  .lm-hoja {
    width: 100%;
    max-height: 92vh;
    border-radius: 20px 20px 0 0;
    border-bottom: 0;
    animation: lm-hoja-sube .26s cubic-bezier(.22,1,.36,1);
  }
  .lm-hoja-barra {
    display: block;
    width: 36px; height: 4px;
    margin: 8px auto 0;
    border-radius: 999px;
    background: var(--border-2);
  }
}
`;
