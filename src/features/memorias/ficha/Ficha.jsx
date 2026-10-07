// Ficha de la memoria de un barco: una hoja con cada definición a la vista.
// Tocando una se abre el panel para elegir (con opciones que tienen sentido
// para ese campo) y desde ahí se recorre lo que falta. Cada cambio se guarda
// solo y sólo con lo que cambió, así dos personas pueden cargar a la vez.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Armchair, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ClipboardCopy, Copy, FileSpreadsheet,
  Check, PackagePlus, Palette, Pencil, Printer, Radio, Settings2, Ship, Sofa, Tent, UserRound, X,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import MemoriaSelector from "../MemoriaSelector";
import { familiasShowroom, seleccionesShowroom } from "../acabados";
import {
  SECCIONES, avanceDe, cambioDeSerie, cuenta, datosDeFila, datosDeSemilla, estaDefinido, haceCuanto, modeloDeObra,
  textoDeMemoria, tonoDeAvance,
} from "../campos";
import { DECISIONES } from "../decisiones";
import { guardarCambios, traerExclusionesObra } from "../memoriasApi";
import { imprimirMemoria } from "../imprimir";
import { Barra } from "../ui";
import { Definicion, Equipo } from "./Tarjetas";
import Elegir from "./Elegir";
import Adicionales from "./Adicionales";
import OpcionesLinea from "./OpcionesLinea";
import Cambios from "./Cambios";
import CopiarDeBarco from "./CopiarDeBarco";
import CambioSerie from "./CambioSerie";

const ASPECTO = {
  cliente: { Icon: UserRound, tono: "azul" },
  casco: { Icon: Ship, tono: "cian" },
  interior: { Icon: Sofa, tono: "teal" },
  tapiceria: { Icon: Armchair, tono: "violeta" },
  loneria: { Icon: Tent, tono: "azul" },
  electronica: { Icon: Radio, tono: "cian" },
  equipos: { Icon: Settings2, tono: "verde" },
  adicionales: { Icon: PackagePlus, tono: "violeta" },
};

const ESPERA_GUARDADO = 700;
const SE_ELIGEN = new Set(["opciones", "lleva", "ambientes", "lista"]);

export default function Ficha({ ficha, anterior, siguiente, filas, columnas, perfiles, onFilaGuardada, onVolver, onAbrir }) {
  const { obra, fila, campos, linea } = ficha;
  const toast = useToast();
  const confirmar = useConfirm();

  // ── Guardado automático ───────────────────────────────────────────────────
  const [cambios, setCambios] = useState({});
  const [guardado, setGuardado] = useState({ tipo: "ok" });
  const cambiosRef = useRef({});
  const filaRef = useRef(fila);
  const enVuelo = useRef(false);
  const timer = useRef(null);
  const avisoSinLugar = useRef(false);

  useEffect(() => { if (!enVuelo.current) filaRef.current = fila; }, [fila]);

  const guardar = useCallback(async () => {
    clearTimeout(timer.current);
    if (enVuelo.current) { timer.current = setTimeout(() => void guardar(), 400); return; }
    const lote = cambiosRef.current;
    if (!Object.keys(lote).length) return;
    enVuelo.current = true;
    setGuardado({ tipo: "guardando" });
    try {
      const { fila: nueva, sinLugar, recortado } = await guardarCambios({ obra, fila: filaRef.current, cambios: lote, columnas });
      if (recortado) {
        toast.info(`Por ahora el piso del cockpit quedó como “${recortado.guardado || "sin definir"}”: el detalle (“${recortado.original}”) se va a poder guardar cuando se aplique la actualización de Memorias.`);
      }
      filaRef.current = nueva;
      onFilaGuardada(nueva);
      const resto = { ...cambiosRef.current };
      for (const [k, v] of Object.entries(lote)) if (Object.is(resto[k], v) || sinLugar.includes(k)) delete resto[k];
      cambiosRef.current = resto;
      setCambios(resto);
      setGuardado({ tipo: Object.keys(resto).length ? "pendiente" : "ok", cuando: Date.now() });
      if (sinLugar.length && !avisoSinLugar.current) {
        avisoSinLugar.current = true;
        toast.info("Las notas de algunos campos se van a poder guardar cuando se aplique la actualización de la base de Memorias.");
      }
    } catch (e) {
      setGuardado({ tipo: "error", mensaje: e?.message || "No se pudo guardar." });
    } finally {
      enVuelo.current = false;
      if (Object.keys(cambiosRef.current).length) timer.current = setTimeout(() => void guardar(), ESPERA_GUARDADO);
    }
  }, [obra, columnas, onFilaGuardada, toast]);

  const cambiarVarios = useCallback((obj) => {
    cambiosRef.current = { ...cambiosRef.current, ...obj };
    setCambios(cambiosRef.current);
    setGuardado({ tipo: "pendiente" });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void guardar(), ESPERA_GUARDADO);
  }, [guardar]);
  const cambiar = useCallback((key, valor) => cambiarVarios({ [key]: valor }), [cambiarVarios]);

  // Al salir de la ficha (volver, otro barco) se guarda lo que quedó pendiente.
  const alSalir = useRef(null);
  useEffect(() => { alSalir.current = { obra, columnas, onFilaGuardada }; });
  useEffect(() => {
    const pendientes = cambiosRef;
    const reloj = timer;
    const actual = filaRef;
    const props = alSalir;
    return () => {
      clearTimeout(reloj.current);
      const lote = pendientes.current;
      const p = props.current;
      if (p && Object.keys(lote).length) {
        void guardarCambios({ obra: p.obra, fila: actual.current, cambios: lote, columnas: p.columnas })
          .then(({ fila: nueva }) => p.onFilaGuardada(nueva))
          .catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (guardado.tipo !== "pendiente" && guardado.tipo !== "guardando") return undefined;
    const avisar = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [guardado.tipo]);

  // ── Datos a la vista ──────────────────────────────────────────────────────
  const datos = useMemo(() => ({ ...datosDeFila(fila), ...cambios }), [fila, cambios]);
  const avance = useMemo(() => avanceDe(campos, datos), [campos, datos]);
  const puedeNota = useCallback((key) => columnas.has(`${key}_obs`) || columnas.has("extras"), [columnas]);
  const tono = tonoDeAvance(avance.pct);

  const deSemilla = useMemo(() => {
    if (!ficha.semilla) return {};
    const todo = datosDeSemilla(ficha.semilla, campos);
    return Object.fromEntries(Object.entries(todo).filter(([k, v]) => {
      if (k.endsWith("_obs")) return puedeNota(k.slice(0, -4)) && !String(datos[k] || "").trim();
      const campo = campos.find((c) => c.key === k);
      return campo && !estaDefinido(campo, datos[k]) && v !== null;
    }));
  }, [ficha.semilla, campos, datos, puedeNota]);
  const nSemilla = Object.keys(deSemilla).filter((k) => !k.endsWith("_obs")).length;

  // ── Índice y "siguiente pendiente" ───────────────────────────────────────
  // El alto del encabezado fijo cambia con el ancho (una o dos filas): se mide
  // para que el índice y los saltos queden justo debajo.
  const cabRef = useRef(null);
  const [altoCab, setAltoCab] = useState(130);
  useEffect(() => {
    const el = cabRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setAltoCab(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [activa, setActiva] = useState("cliente");
  useEffect(() => {
    const raiz = document.querySelector(".mem-vista");
    if (!raiz || typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver((entradas) => {
      const visible = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiva(visible.target.dataset.seccion);
    }, { root: raiz, rootMargin: `-${altoCab + 10}px 0px -55% 0px` });
    document.querySelectorAll(".mem-seccion[data-seccion]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [altoCab]);

  function irASeccion(key) {
    document.getElementById(`mem-sec-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Materiales de serie que se sacaron de la lista de esta obra (Materiales).
  const [excluidos, setExcluidos] = useState(() => new Set());
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      const set = await traerExclusionesObra(obra.id);
      if (vivo) setExcluidos(set);
    }, 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [obra.id]);

  // ── Panel para elegir ────────────────────────────────────────────────────
  const elegibles = useMemo(() => campos.filter((c) => SE_ELIGEN.has(c.tipo)), [campos]);
  const [abierto, setAbierto] = useState(null);
  const campoAbierto = elegibles.find((c) => c.key === abierto) || null;
  const iAbierto = campoAbierto ? elegibles.indexOf(campoAbierto) : -1;
  const faltanElegir = elegibles.filter((c) => cuenta(c) && !estaDefinido(c, datos[c.key]));

  function irA(campo) {
    const el = document.getElementById(`mem-campo-${campo.key}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (SE_ELIGEN.has(campo.tipo)) { setAbierto(campo.key); return; }
    setTimeout(() => el?.querySelector("input, button")?.focus({ preventScroll: true }), 350);
  }

  // Lo siguiente sin definir después del campo abierto (vuelve a empezar al final).
  function siguienteSinDefinir() {
    const lista = faltanElegir.filter((c) => c.key !== abierto);
    if (!lista.length) { setAbierto(null); return; }
    const despues = lista.find((c) => elegibles.indexOf(c) > iAbierto) || lista[0];
    irA(despues);
  }

  function completarLoQueFalta() {
    const primero = avance.faltan[0];
    if (primero) irA(primero);
  }

  // ── Acciones ─────────────────────────────────────────────────────────────
  const [copiando, setCopiando] = useState(false);
  const [cambiandoSerie, setCambiandoSerie] = useState(null);
  const campoSerie = campos.find((c) => c.key === cambiandoSerie) || null;

  function irAAdicionales() {
    setCambiandoSerie(null);
    document.getElementById("mem-sec-adicionales")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => document.querySelector(".mem-adic-buscar input")?.focus({ preventScroll: true }), 450);
  }
  const [showroom, setShowroom] = useState(false);
  const familias = useMemo(() => familiasShowroom(new Set(campos.map((c) => c.key))), [campos]);

  function copiarTexto() {
    navigator.clipboard?.writeText(textoDeMemoria(obra, campos, datos))
      .then(() => toast.success("Memoria copiada como texto."))
      .catch(() => toast.error("No se pudo copiar."));
  }

  async function traerSemilla() {
    const ok = await confirmar({
      title: "Traer datos de la planilla vieja",
      message: `Se completan ${nSemilla} campo${nSemilla === 1 ? "" : "s"} vacío${nSemilla === 1 ? "" : "s"} con lo que había en el Excel de memorias. No se pisa nada de lo cargado.`,
      confirmLabel: "Traer datos",
    });
    if (ok) cambiarVarios(deSemilla);
  }

  const quien = fila?.updated_by ? perfiles.get(fila.updated_by) : null;
  const estadoGuardado = guardado.tipo === "guardando" || guardado.tipo === "pendiente"
    ? { tono: "cian", texto: "Guardando…" }
    : guardado.tipo === "error"
      ? { tono: "rojo", texto: "No se guardó" }
      : fila?.updated_at
        ? guardado.cuando
          ? { tono: "verde", texto: `Guardado ${haceCuanto(guardado.cuando)}` }
          : { tono: "verde", texto: `Última vez ${haceCuanto(fila.updated_at)}${quien ? ` · ${quien}` : ""}` }
        : { tono: "neutro", texto: "Todavía sin datos" };

  const cliente = [datos.propietario, datos.nombre_barco && `“${datos.nombre_barco}”`].filter(Boolean).join(" · ");

  const herramientas = (
    <>
      <button type="button" className="ui-btn chico" onClick={() => setCopiando(true)} title="Completar lo vacío con lo de otro barco"><Copy size={14} /> Copiar de otro barco</button>
      <button type="button" className="ui-btn chico" onClick={() => setShowroom(true)} title="Elegir acabados con el cliente"><Palette size={14} /> Showroom</button>
      <button type="button" className="ui-btn chico" onClick={copiarTexto} title="Copiar como texto"><ClipboardCopy size={14} /> <span className="txt">Copiar texto</span></button>
      <button type="button" className="ui-btn chico" onClick={() => void imprimirMemoria({ obra, linea, campos, datos, excluidos, actualizada: fila?.updated_at, quien })} title="Imprimir la hoja para el pizarrón"><Printer size={14} /> <span className="txt">Imprimir</span></button>
    </>
  );

  const indice = SECCIONES.map((s) => {
    const propios = campos.filter((c) => c.seccion === s.key && cuenta(c));
    const hechos = propios.filter((c) => estaDefinido(c, datos[c.key])).length;
    const lleno = propios.length > 0 && hechos === propios.length;
    return (
      <button key={s.key} type="button" className={`mem-indice-op${activa === s.key ? " on" : ""}`} onClick={() => irASeccion(s.key)}>
        <span className={`pto${lleno ? " lleno" : hechos ? " medio" : ""}`} />
        {s.label}
        {propios.length > 0 && <span className="n">{hechos}/{propios.length}</span>}
      </button>
    );
  });

  return (
    <>
      <header className="mem-ficha-cab" ref={cabRef}>
        <div className="mem-ficha-cab-in">
          <div className="mem-ficha-fila">
            <button type="button" className="mem-volver" onClick={onVolver} aria-label="Volver a Memorias"><ArrowLeft size={15} /> <span className="txt">Memorias</span></button>
            <div className="mem-ficha-tit">
              <span className="cod">{obra.codigo}</span>
              <span className="mem-linea">{linea}</span>
              {cliente && <span className="cli">{cliente}</span>}
            </div>
            <div className="mem-sp" />
            <div className="mem-acciones">
              <span className="mem-herr-cab">{herramientas}</span>
              <span style={{ display: "inline-flex", gap: 4 }}>
                <button type="button" className="mem-btn-ic" disabled={!anterior} onClick={() => onAbrir(anterior.obra.codigo)} title={anterior ? `Anterior: ${anterior.obra.codigo}` : ""} aria-label="Barco anterior"><ChevronLeft size={17} /></button>
                <button type="button" className="mem-btn-ic" disabled={!siguiente} onClick={() => onAbrir(siguiente.obra.codigo)} title={siguiente ? `Siguiente: ${siguiente.obra.codigo}` : ""} aria-label="Barco siguiente"><ChevronRight size={17} /></button>
              </span>
            </div>
          </div>
          <div className="mem-avance">
            <Barra pct={avance.pct} tono={tono} />
            <span className="mem-avance-txt"><b>{avance.hechos}</b> de <b>{avance.total}</b> definidos</span>
            {avance.faltan.length > 0 ? (
              <button type="button" className="ui-btn chico" data-tono="azul" onClick={completarLoQueFalta}>
                Completar lo que falta <ArrowRight size={14} />
              </button>
            ) : (
              <span className="mem-estado" data-tono="verde">Memoria completa</span>
            )}
            <span className="mem-sp" />
            <span className="mem-guardado" data-tono={estadoGuardado.tono} title={guardado.mensaje || ""}><i />{estadoGuardado.texto}</span>
          </div>
          <nav className="mem-indice-cab" aria-label="Secciones">{indice}</nav>
        </div>
      </header>

      <div className="mem-ficha" style={{ "--mem-cab": `${altoCab}px` }}>
        <nav className="mem-indice" aria-label="Secciones">
          {indice}
          <div className="mem-indice-sep" />
          <div className="mem-indice-pie">
            <span>Se guarda solo, campo por campo.</span>
            <Link className="mem-link" to={`/memorias/viva?obra=${encodeURIComponent(obra.codigo)}`}>Trazabilidad con la matriz (beta)</Link>
          </div>
        </nav>

        <div className="mem-secciones">
          {guardado.tipo === "error" && (
            <div className="mem-aviso" data-tono="rojo">
              <span className="txt">No se pudo guardar: {guardado.mensaje}<small>Los cambios siguen en pantalla.</small></span>
              <button type="button" className="ui-btn chico" onClick={() => void guardar()}>Reintentar</button>
            </div>
          )}
          {nSemilla > 0 && (
            <div className="mem-aviso" data-tono="cian">
              <FileSpreadsheet size={18} />
              <span className="txt">
                La planilla Excel de memorias tiene {nSemilla} dato{nSemilla === 1 ? "" : "s"} de {obra.codigo} que no están cargados acá.
                <small>Se completan sólo los campos vacíos.</small>
              </span>
              <button type="button" className="ui-btn chico" data-tono="cian" onClick={() => void traerSemilla()}>Traer datos</button>
            </div>
          )}

          {SECCIONES.map((s) => {
            const propios = campos.filter((c) => c.seccion === s.key);
            const { Icon, tono: tonoSec } = ASPECTO[s.key];
            const cuentan = propios.filter(cuenta);
            const hechos = cuentan.filter((c) => estaDefinido(c, datos[c.key])).length;
            if (!propios.length && s.key !== "adicionales") return null;
            return (
              <section key={s.key} id={`mem-sec-${s.key}`} data-seccion={s.key} className="mem-seccion" data-tono={tonoSec}>
                <div className="mem-seccion-cab">
                  <span className="ic"><Icon size={16} /></span>
                  <h2>{s.label}</h2>
                  {cuentan.length > 0 && <span className="cuenta">{hechos}/{cuentan.length}</span>}
                  {s.usan.length > 0 && <span className="usan">Lo usan <b>{s.usan.join(" · ")}</b></span>}
                </div>
                {s.key === "equipos" ? (
                  <SeccionEquipos campos={propios} datos={datos} puedeNota={puedeNota} cambiar={cambiar} obra={obra} linea={linea} excluidos={excluidos} onCambioSerie={setCambiandoSerie} />
                ) : s.key === "cliente" ? (
                  <div className="mem-cliente">
                    {propios.map((c) => (
                      <label key={c.key} className="mem-cliente-campo" id={`mem-campo-${c.key}`}>
                        <span>{c.label}</span>
                        <input className="ui-input" value={datos[c.key] || ""} onChange={(e) => cambiar(c.key, e.target.value)} placeholder={DECISIONES[c.key]?.placeholder || ""} autoComplete="off" />
                      </label>
                    ))}
                  </div>
                ) : s.key === "adicionales" ? (
                  <>
                    <label className="mem-notas" id="mem-campo-adicionales">
                      <span>Lo que pidió el cliente aparte</span>
                      <textarea
                        className="ui-input"
                        rows={3}
                        value={datos.adicionales || ""}
                        onChange={(e) => cambiar("adicionales", e.target.value)}
                        placeholder="Griferías negras, sin parrilla en el cockpit, luces bajo agua, heladera 12 V…"
                      />
                    </label>
                    <Adicionales obra={obra} notas={datos.adicionales} />
                  </>
                ) : (
                  <div className="mem-defs">
                    {propios.map((c) => (
                      <Definicion key={c.key} campo={c} valor={datos[c.key]} nota={datos[`${c.key}_obs`]} linea={linea} onAbrir={() => setAbierto(c.key)} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {fila?.id && <Cambios memoriaId={fila.id} actualizada={fila.updated_at} campos={campos} />}
          <div className="mem-herr-pie">{herramientas}</div>
        </div>
      </div>

      {campoAbierto && (
        <Elegir
          campo={campoAbierto}
          seccion={SECCIONES.find((s) => s.key === campoAbierto.seccion)?.label || ""}
          valor={datos[campoAbierto.key]}
          nota={datos[`${campoAbierto.key}_obs`]}
          puedeNota={puedeNota(campoAbierto.key)}
          linea={linea}
          matrizLinea={ficha.matrizLinea}
          posicion={iAbierto + 1}
          total={elegibles.length}
          faltan={faltanElegir.filter((c) => c.key !== abierto).length}
          onValor={(v) => cambiar(campoAbierto.key, v)}
          onNota={(v) => cambiar(`${campoAbierto.key}_obs`, v)}
          onCerrar={() => setAbierto(null)}
          onAnterior={() => irA(elegibles[iAbierto - 1])}
          onSiguiente={() => irA(elegibles[iAbierto + 1])}
          onSiguientePendiente={siguienteSinDefinir}
        />
      )}

      {campoSerie && (
        <CambioSerie
          campo={campoSerie}
          linea={linea}
          cambio={datos[`${campoSerie.key}_obs`]}
          puedeNota={puedeNota(campoSerie.key)}
          onCambio={(v) => cambiar(`${campoSerie.key}_obs`, v)}
          onCerrar={() => setCambiandoSerie(null)}
          onIrAdicionales={irAAdicionales}
        />
      )}

      {copiando && (
        <CopiarDeBarco
          ficha={ficha}
          datos={datos}
          filas={filas}
          puedeNota={puedeNota}
          onCerrar={() => setCopiando(false)}
          onCopiar={(fuente) => {
            cambiarVarios(fuente.cambios);
            setCopiando(false);
            toast.success(`${fuente.n} dato${fuente.n === 1 ? "" : "s"} copiado${fuente.n === 1 ? "" : "s"} de ${fuente.codigo}.`);
          }}
        />
      )}

      {showroom && (
        <div className="mem-showroom">
          <button type="button" className="ui-btn chico mem-showroom-cerrar" onClick={() => setShowroom(false)}>Volver a la memoria</button>
          <MemoriaSelector
            familias={familias}
            initialSelecciones={seleccionesShowroom(familias, datos)}
            onToggle={(campo, nombre) => cambiar(campo, nombre ?? "")}
            onConfirm={() => { setShowroom(false); toast.success("Acabados cargados en la memoria."); }}
            titulo={`Acabados del ${obra.codigo}`}
            subtitulo="Tocá una familia para ver las muestras. Cada elección queda en la memoria descriptiva."
          />
        </div>
      )}
    </>
  );
}

function SeccionEquipos({ campos, datos, puedeNota, cambiar, obra, linea, excluidos, onCambioSerie }) {
  // Lo que ya viene de serie no se pregunta, y lo que es opción de la línea se
  // elige una sola vez, abajo, en las opciones (que cambian la lista de la obra).
  const deSerie = campos.filter((c) => c.serie);
  const preguntar = campos.filter((c) => !c.serie && !c.opcion);
  const propios = preguntar.filter((c) => !c.extra);
  const extras = preguntar.filter((c) => c.extra);
  const extrasConDato = extras.filter((c) => datos[c.key] === true || datos[c.key] === false);
  const [verTodos, setVerTodos] = useState(false);
  const visibles = [...propios, ...(verTodos ? extras : extrasConDato)];
  const ocultos = extras.length - (verTodos ? extras.length : extrasConDato.length);
  return (
    <>
      {deSerie.length > 0 && (
        <div className="mem-serie">
          <div className="mem-serie-cab">
            <b>Viene de serie en la {linea}</b>
            <small>Lo trae la matriz: no se pregunta ni sale en la hoja impresa. Tocá uno sólo si en este barco cambia (ej.: un faro más grande).</small>
          </div>
          <div className="mem-chips-elegir">
            {deSerie.map((c) => {
              const cambio = cambioDeSerie(c, datos);
              const fuera = (c.serieId && excluidos.has(c.serieId)) || /^\s*no lleva\s*$/i.test(cambio || "");
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`mem-serie-op${fuera ? " fuera" : cambio ? " cambia" : ""}`}
                  title={fuera ? `${obra.codigo} no lo lleva` : cambio ? `Cambia: ${cambio}` : `${c.serie}. Tocá si cambia en este barco.`}
                  onClick={() => onCambioSerie(c.key)}
                >
                  {fuera ? <X size={12} /> : cambio ? <Pencil size={12} /> : <Check size={12} />}
                  {c.label}{cambio && !fuera ? <span className="cambio">· {cambio}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {visibles.length > 0 && <div className="mem-equipos">
        {visibles.map((c) => (
          <Equipo
            key={c.key}
            campo={c}
            valor={datos[c.key]}
            nota={datos[`${c.key}_obs`]}
            puedeNota={puedeNota(c.key)}
            onValor={(v) => cambiar(c.key, v)}
            onNota={(v) => cambiar(`${c.key}_obs`, v)}
          />
        ))}
      </div>}
      {ocultos > 0 && (
        <div className="mem-mas">
          <button type="button" className="mem-link" onClick={() => setVerTodos(true)}>
            + Otros equipos ({extras.filter((c) => !extrasConDato.includes(c)).map((c) => c.label.toLowerCase()).slice(0, 3).join(", ")}{ocultos > 3 ? "…" : ""})
          </button>
        </div>
      )}
      <OpcionesLinea obra={obra} modelo={modeloDeObra(obra)} linea={linea} datos={datos} />
    </>
  );
}
