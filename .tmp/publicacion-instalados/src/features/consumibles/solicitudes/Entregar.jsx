import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleCheck, LoaderCircle, Nfc, Search, TriangleAlert, UserRound, UserX, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import useNfcBridge from "@/features/panol/useNfcBridge";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { buscarEmpleadoPorNfc, normalizeNfcUid } from "@/features/rrhh/api";
import useRafagaLector from "../mostrador/useRafagaLector";
import { conTimeout, pareceUidTarjeta } from "../mostrador/mostradorLogica";
import { Hoja } from "./Hojas";
import { Avatar } from "./Piezas";
import { entregarSolicitud, mensajeError } from "./solicitudesApi";
import {
  avisosParaEntregar,
  buscarPersonas,
  destinoSolicitud,
  problemasParaEntregar,
  sugerirPersona,
  textoResultadoEntrega,
} from "./solicitudesLogica";

/**
 * ENTREGAR: quien retira apoya la tarjeta y se confirma. Sin tarjeta, se
 * busca por nombre o DNI en RRHH (queda "sin tarjeta"); si no figura en RRHH,
 * se escribe el nombre (queda "manual"). Si la solicitud dice quién retira y
 * es una sola persona de RRHH, se sugiere.
 *
 * El foco queda en el panel (no en un campo) para que el lector de tarjetas
 * que escribe como teclado no tipee el UID adentro de un input. El RPC es
 * idempotente: un reintento después de perder la respuesta no registra dos veces.
 */
export default function Entregar({ solicitud, items = [], empleados = [], cargandoEmpleados = false, uidInicial = null, onCerrar, onEntregada }) {
  const panelRef = useRef(null);
  const [persona, setPersona] = useState(null); // { empleado, metodo, nfcUid, nombre, dni }
  const [modo, setModo] = useState("tarjeta"); // tarjeta | buscar | manual
  const [texto, setTexto] = useState("");
  const [manual, setManual] = useState({ nombre: "", dni: "" });
  const [leyendo, setLeyendo] = useState(Boolean(uidInicial));
  const [errorTarjeta, setErrorTarjeta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const enviandoRef = useRef(false);
  const lecturaRef = useRef(0);

  // El foco en el panel (no en la X ni en un campo): Enter confirma y el
  // lector de tarjetas que escribe como teclado no tipea adentro de un input.
  useEffect(() => {
    if (!resultado) panelRef.current?.focus({ preventScroll: true });
  }, [persona, resultado]);

  const porUid = useMemo(
    () => new Map(empleados.filter((e) => e.nfc_uid).map((e) => [normalizeNfcUid(e.nfc_uid), e])),
    [empleados],
  );
  const problemas = useMemo(() => problemasParaEntregar(solicitud, items), [solicitud, items]);
  const avisos = useMemo(() => avisosParaEntregar(items), [items]);
  const sugerencia = useMemo(() => sugerirPersona(solicitud, empleados), [solicitud, empleados]);
  const candidatos = useMemo(() => buscarPersonas(empleados, texto), [empleados, texto]);
  const renglones = items.filter((i) => i.material_id && (Number(i.cantidad) || 0) > 0 && i.estado !== "faltante").length;

  /** Busca a quién pertenece la tarjeta: primero en memoria, después en la base. */
  async function resolverTarjeta(uidCrudo) {
    const uid = normalizeNfcUid(uidCrudo);
    if (!uid) return { error: "No se leyó la tarjeta. Apoyala de nuevo." };
    const local = porUid.get(uid);
    if (local) return { persona: { empleado: local, metodo: "nfc", nfcUid: uid } };
    try {
      const emp = await conTimeout(buscarEmpleadoPorNfc(uid), 7000, "No se pudo identificar la tarjeta a tiempo. Buscala por nombre o DNI.");
      if (!emp) return { error: "Esa tarjeta no está asignada a nadie en RRHH. Buscá a la persona por nombre o DNI." };
      return { persona: { empleado: emp, metodo: "nfc", nfcUid: uid } };
    } catch (e) {
      return { error: mensajeError(e, "No se pudo identificar la tarjeta.") };
    }
  }

  function aplicarLectura(n, res) {
    if (n !== lecturaRef.current) return; // llegó otra tarjeta mientras tanto
    setLeyendo(false);
    if (res.persona) {
      setPersona(res.persona);
      setErrorTarjeta("");
      setModo("tarjeta");
      setTexto("");
      panelRef.current?.focus({ preventScroll: true });
    } else {
      setErrorTarjeta(res.error);
    }
  }

  function leerTarjeta(uid) {
    if (resultado || enviandoRef.current) return;
    const n = ++lecturaRef.current;
    setLeyendo(true);
    setErrorTarjeta("");
    resolverTarjeta(uid).then((res) => aplicarLectura(n, res));
  }

  // La tarjeta que abrió la hoja (se pasó con el lector antes de tocar Entregar).
  useEffect(() => {
    if (!uidInicial) return undefined;
    const n = ++lecturaRef.current;
    let vivo = true;
    resolverTarjeta(uidInicial).then((res) => { if (vivo) aplicarLectura(n, res); });
    return () => { vivo = false; };
    // Solo al abrir: las lecturas siguientes llegan por el lector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nfc = useNfcBridge({ enabled: !resultado, onUid: leerTarjeta });
  useKeyboardWedge({ enabled: !resultado, onScan: leerTarjeta, minLength: 4 });

  // En el buscador por nombre, una ráfaga del lector es una tarjeta, no texto.
  const rafaga = useRafagaLector({
    onRafaga: (codigo, previo) => {
      setTexto(previo ?? "");
      if (pareceUidTarjeta(normalizeNfcUid(codigo))) leerTarjeta(codigo);
    },
    onEnter: (e) => {
      e.preventDefault();
      if (candidatos[0]) elegirDeRrhh(candidatos[0]);
    },
  });

  function elegirDeRrhh(emp) {
    setPersona({ empleado: emp, metodo: "sin_tarjeta", nfcUid: null });
    setModo("tarjeta");
    setTexto("");
    setErrorTarjeta("");
    panelRef.current?.focus({ preventScroll: true });
  }

  function usarManual() {
    const nombre = manual.nombre.trim();
    if (!nombre) return;
    setPersona({ empleado: null, metodo: "manual", nfcUid: null, nombre, dni: manual.dni.trim() || null });
    setModo("tarjeta");
    panelRef.current?.focus({ preventScroll: true });
  }

  const puedeConfirmar = Boolean(persona) && !problemas.length && !enviando && !resultado;

  async function confirmar() {
    if (enviandoRef.current || !puedeConfirmar) return;
    enviandoRef.current = true;
    setEnviando(true);
    setError("");
    try {
      const res = await entregarSolicitud({
        solicitudId: solicitud.id,
        empleado: persona.empleado,
        nombre: persona.nombre ?? null,
        dni: persona.dni ?? null,
        metodo: persona.metodo,
        nfcUid: persona.nfcUid,
      });
      setResultado(res ?? { ok: true });
      onEntregada?.(res ?? { ok: true }, persona);
    } catch (e) {
      setError(`${mensajeError(e, "No se pudo registrar la entrega.")} Si ya se había registrado, reintentar no la duplica.`);
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  function alTeclear(e) {
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && e.target === e.currentTarget) {
      e.preventDefault();
      if (resultado) onCerrar();
      else confirmar();
    }
  }

  const nombrePersona = persona?.empleado?.nombre || persona?.nombre || "";

  if (resultado) {
    return (
      <Hoja titulo={`N° ${solicitud.numero} entregada`} onCerrar={onCerrar} panelRef={panelRef} onKeyDown={alTeclear}>
        <div className="sol-aviso is-verde" role="status">
          <CircleCheck size={20} />
          <div className="sol-aviso-texto">
            <strong>{resultado.ya_entregada ? "Ya estaba entregada" : "Entregada"}</strong>
            <span>{textoResultadoEntrega(resultado, { nombre: nombrePersona })}</span>
          </div>
        </div>
        <div className="sol-hoja-acciones">
          <button type="button" className="ui-btn ui-btn-primario" style={{ minHeight: 44 }} onClick={onCerrar} autoFocus>Listo</button>
        </div>
      </Hoja>
    );
  }

  return (
    <Hoja
      titulo={`Entregar N° ${solicitud.numero}`}
      subtitulo={`${renglones === 1 ? "1 renglón" : `${renglones} renglones`} · ${destinoSolicitud(solicitud)}`}
      bloqueada={enviando}
      onCerrar={onCerrar}
      panelRef={panelRef}
      onKeyDown={alTeclear}
    >
      <button type="button" className="ui-btn" disabled={enviando} onClick={onCerrar}>Editar cantidades o agregar productos</button>
      {problemas.length ? (
        <div className="sol-aviso is-rojo" role="alert">
          <TriangleAlert size={17} />
          <div className="sol-aviso-texto">
            <strong>Así no se puede entregar</strong>
            {problemas.map((p) => <span key={p.tipo}>{p.texto}</span>)}
          </div>
        </div>
      ) : null}
      {avisos.length && !problemas.length ? (
        <div className="sol-aviso is-cian">
          <TriangleAlert size={16} />
          <div className="sol-aviso-texto">{avisos.map((a) => <span key={a}>{a}</span>)}</div>
        </div>
      ) : null}

      {persona ? (
        <div className="sol-persona">
          <Avatar persona={persona.empleado ?? { nombre: persona.nombre }} />
          <div className="sol-persona-texto">
            <strong>{nombrePersona}</strong>
            <small>
              {[
                persona.empleado?.dni || persona.dni ? `DNI ${persona.empleado?.dni || persona.dni}` : null,
                persona.metodo === "nfc" ? "con tarjeta" : persona.metodo === "sin_tarjeta" ? "sin tarjeta" : "no figura en RRHH",
              ].filter(Boolean).join(" · ")}
            </small>
          </div>
          <button type="button" className="ui-btn" style={{ minHeight: 44 }} disabled={enviando} onClick={() => setPersona(null)}>
            <X size={14} /> No es
          </button>
        </div>
      ) : (
        <>
          <div className="sol-tarjeta-nfc">
            {leyendo ? <LoaderCircle size={32} className="sol-gira" /> : <Nfc size={32} />}
            <div style={{ minWidth: 0 }}>
              <h4>{leyendo ? "Leyendo la tarjeta…" : "Que apoye la tarjeta en el lector"}</h4>
              <p>
                {nfc.status === "connected"
                  ? "Lector de tarjetas listo."
                  : "No encuentro el puente del lector. Si el lector escribe como teclado, pasala igual."}
              </p>
            </div>
          </div>
          {errorTarjeta ? (
            <div className="sol-aviso is-rojo" role="alert"><UserX size={16} /><div className="sol-aviso-texto">{errorTarjeta}</div></div>
          ) : null}

          {sugerencia?.persona && modo === "tarjeta" ? (
            <div className="sol-aviso is-cian">
              <UserRound size={16} />
              <div className="sol-aviso-texto">
                <span>La solicitud dice que {sugerencia.campo === "retira" ? "retira" : "la pidió"} <strong>{sugerencia.texto}</strong>.</span>
                <button type="button" className="ui-btn ui-btn-suave" style={{ justifySelf: "start", minHeight: 44 }} onClick={() => elegirDeRrhh(sugerencia.persona)}>
                  Es {sugerencia.persona.nombre}, sin tarjeta
                </button>
              </div>
            </div>
          ) : sugerencia?.texto && modo === "tarjeta" ? (
            <div className="sol-muted" style={{ fontSize: 13 }}>
              La solicitud dice que {sugerencia.campo === "retira" ? "retira" : "la pidió"} <strong>{sugerencia.texto}</strong>.
            </div>
          ) : null}

          {modo === "buscar" ? (
            <div className="sol-bloque">
              <div className="sol-bloque-titulo">
                Sin tarjeta: nombre o DNI
                <span className="sol-espacio" />
                <button type="button" className="sol-enlace" onClick={() => { setModo("tarjeta"); setTexto(""); panelRef.current?.focus(); }}>Mejor la tarjeta</button>
              </div>
              <div className="sol-buscar">
                <Search size={15} aria-hidden="true" />
                <input
                  className="ui-input"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={rafaga.onKeyDown}
                  onPaste={rafaga.onPaste}
                  placeholder="Apellido, nombre o DNI"
                  aria-label="Buscar a la persona en RRHH"
                  autoFocus
                />
              </div>
              {cargandoEmpleados && !empleados.length ? <Cargando compacto texto="Trayendo la lista de RRHH…" /> : null}
              {candidatos.length ? (
                <div className="sol-personas">
                  {candidatos.map((emp, i) => (
                    <button key={emp.id} type="button" className={`sol-persona-res${i === 0 ? " is-activa" : ""}`} onClick={() => elegirDeRrhh(emp)}>
                      <span>{emp.nombre}</span>
                      <small className="sol-num">{emp.dni ? `DNI ${emp.dni}` : emp.sede || ""}</small>
                    </button>
                  ))}
                </div>
              ) : texto.trim() && empleados.length ? (
                <div className="sol-muted" style={{ fontSize: 13 }}>
                  Nadie coincide en RRHH.{" "}
                  <button type="button" className="sol-enlace" onClick={() => { setManual({ nombre: texto.trim(), dni: "" }); setModo("manual"); }}>No figura: escribir el nombre</button>
                </div>
              ) : null}
            </div>
          ) : modo === "manual" ? (
            <div className="sol-bloque">
              <div className="sol-bloque-titulo">
                No figura en RRHH
                <span className="sol-espacio" />
                <button type="button" className="sol-enlace" onClick={() => setModo("buscar")}>Volver a buscar</button>
              </div>
              <div className="sol-cabecera">
                <label className="sol-campo">
                  <span>Nombre y apellido</span>
                  <input className="ui-input" value={manual.nombre} maxLength={120} onChange={(e) => setManual((m) => ({ ...m, nombre: e.target.value }))} autoFocus />
                </label>
                <label className="sol-campo">
                  <span>DNI (si lo tiene a mano)</span>
                  <input className="ui-input sol-num" inputMode="numeric" value={manual.dni} maxLength={12} onChange={(e) => setManual((m) => ({ ...m, dni: e.target.value.replace(/\D/g, "") }))} />
                </label>
              </div>
              <button type="button" className="ui-btn ui-btn-suave" style={{ justifySelf: "start", minHeight: 44 }} disabled={!manual.nombre.trim()} onClick={usarManual}>
                Entrega a {manual.nombre.trim() || "…"}
              </button>
            </div>
          ) : (
            <button type="button" className="ui-btn" style={{ justifySelf: "start", minHeight: 44, borderStyle: "dashed" }} onClick={() => setModo("buscar")}>
              <UserRound size={15} /> No tiene tarjeta: buscar por nombre o DNI
            </button>
          )}
        </>
      )}

      {error ? <div className="sol-aviso is-rojo" role="alert"><TriangleAlert size={16} /><div className="sol-aviso-texto">{error}</div></div> : null}

      <button type="button" className="sol-btn-grande is-verde" disabled={!puedeConfirmar} onClick={confirmar}>
        {enviando ? <LoaderCircle size={19} className="sol-gira" /> : <Check size={19} />}
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {enviando ? "Registrando…" : problemas.length ? "Resolvé lo de arriba" : persona ? `Entregar a ${nombrePersona}` : "Falta quién retira"}
        </span>
        {puedeConfirmar ? <span className="sol-tecla" aria-hidden="true">Enter</span> : null}
      </button>
    </Hoja>
  );
}
