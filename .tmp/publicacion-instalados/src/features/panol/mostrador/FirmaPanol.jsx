import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, MessageSquarePlus, Nfc, Search, ShieldAlert, TriangleAlert, UserRound, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { SECTORES } from "@/features/panol/solicitudesPanolApi";
import CampoTexto from "@/features/consumibles/mostrador/CampoTexto";
import { Avatar } from "@/features/consumibles/mostrador/Piezas";
import { fmtNum, normalizarTexto } from "@/features/consumibles/mostrador/mostradorLogica";
import { buscarPersonas, hayStockLibre, obraCerrada, productoElegido, totalUnidades } from "./mostradorPanolLogica";

/**
 * Paso 2. En un retiro: quién se lo lleva (la tarjeta identifica y firma; sin
 * tarjeta, de la lista de RRHH; si no está, nombre y apellido a mano) y a qué
 * se carga. En una asignación no firma nadie: sólo se elige la obra.
 *
 * El foco queda en el panel (no en un campo) para que el lector de tarjetas
 * que escribe como teclado no tipee el UID adentro de un input. Enter confirma.
 */
export default function FirmaPanol({
  modo,
  cart = [],
  obras = [],
  lineas = [],
  persona,
  aMano,
  onAMano,
  nombreLibre,
  onNombreLibre,
  errorNombre,
  empleados = [],
  onElegirPersona,
  onQuitarPersona,
  lectorEstado,
  obrasPersona = [],
  cargandoObras = false,
  reparos = [],
  destino,
  onDestino,
  nota,
  onNota,
  problemas = [],
  guardando = false,
  errorOperacion = "",
  textoBoton,
  puedeConfirmar,
  onConfirmar,
  onVolver,
  onRafaga,
}) {
  const asignar = modo === "asignar";
  const raizRef = useRef(null);
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState("");
  const [conNota, setConNota] = useState(Boolean(nota));

  useEffect(() => {
    raizRef.current?.focus({ preventScroll: true });
  }, [persona?.id]);

  const candidatos = useMemo(() => buscarPersonas(empleados, texto), [empleados, texto]);
  const porId = useMemo(() => new Map(lineas.map((l) => [l.key, l])), [lineas]);

  function elegirPersona(emp) {
    setBuscando(false);
    setTexto("");
    onElegirPersona(emp);
  }

  function alTeclear(e) {
    if (e.defaultPrevented || guardando) return;
    if (e.key === "Escape") { e.preventDefault(); onVolver(); return; }
    if (e.key === "Enter" && e.target === e.currentTarget && puedeConfirmar) {
      e.preventDefault();
      onConfirmar();
    }
  }

  const sinIdentificar = !asignar && !persona && !aMano;

  return (
    <div
      ref={raizRef}
      className="mst-firma"
      role="dialog"
      aria-modal="true"
      aria-label={asignar ? "Asignar a una obra" : "Firmar el retiro"}
      tabIndex={-1}
      onKeyDown={alTeclear}
    >
      <div className="mst-firma-cab">
        <button type="button" className="ui-btn" disabled={guardando} onClick={onVolver} aria-label="Agregar o editar productos">
          <ArrowLeft size={15} /> <span className="mpn-largo">Agregar o editar productos</span><span className="mpn-corto">Productos</span>
        </button>
        <h2>{asignar ? "¿A qué obra se reserva?" : persona ? `Firmado con ${persona.metodo === "nfc" ? "tarjeta" : "nombre"}` : "Firmá el retiro"}</h2>
        <span className="mst-num" style={{ fontSize: 15, fontWeight: 700, color: asignar ? "var(--teal)" : "var(--blue)" }}>
          {fmtNum(totalUnidades(cart))}
        </span>
      </div>

      <div className="mst-firma-cuerpo">
        <div className="mst-firma-main">
          {errorOperacion ? (
            <div className="mst-aviso is-rojo" role="alert">
              <TriangleAlert size={16} />
              <div className="mst-aviso-texto">
                <strong>No se registró</strong>
                <span>{errorOperacion}</span>
              </div>
            </div>
          ) : null}

          <fieldset disabled={guardando} style={{ display: "contents", border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {!asignar ? (
              <Quien
                persona={persona}
                aMano={aMano}
                onAMano={onAMano}
                nombreLibre={nombreLibre}
                onNombreLibre={onNombreLibre}
                errorNombre={errorNombre}
                buscando={buscando}
                setBuscando={setBuscando}
                texto={texto}
                setTexto={setTexto}
                candidatos={candidatos}
                elegirPersona={elegirPersona}
                onQuitarPersona={onQuitarPersona}
                lectorEstado={lectorEstado}
                raizRef={raizRef}
                onRafaga={onRafaga}
              />
            ) : null}

            {!asignar && persona && reparos.length ? (
              <div className="mst-aviso is-cian">
                <ShieldAlert size={17} />
                <div className="mst-aviso-texto">
                  <strong>{reparos.length === 1 ? "Retira un material que no le corresponde" : `Retira ${reparos.length} materiales que no le corresponden`}</strong>
                  {[...new Set(reparos.map((r) => r.motivo).filter(Boolean))].map((m) => <span key={m}>{m}</span>)}
                  <span style={{ color: "var(--dim)" }}>Se puede confirmar igual: queda registrado quién lo retiró.</span>
                </div>
              </div>
            ) : null}

            {asignar || persona || aMano ? (
              <Destino
                asignar={asignar}
                cart={cart}
                obras={obras}
                obrasPersona={obrasPersona}
                cargandoObras={cargandoObras}
                destino={destino}
                onDestino={onDestino}
                onRafaga={onRafaga}
              />
            ) : null}

            {!sinIdentificar ? (
              conNota ? (
                <div className="mst-bloque">
                  <label className="mst-bloque-titulo" htmlFor="mpn-nota">Observación (opcional)</label>
                  <CampoTexto id="mpn-nota" value={nota} onChange={onNota} onRafaga={onRafaga} maxLength={200} autoFocus
                    onEnter={(e) => { e.preventDefault(); raizRef.current?.focus(); }}
                    placeholder="Para la cubierta, lo pidió el encargado…" />
                </div>
              ) : (
                <button type="button" className="ui-btn ui-btn-fantasma" style={{ justifySelf: "start" }} onClick={() => setConNota(true)}>
                  <MessageSquarePlus size={15} /> Agregar una observación
                </button>
              )
            ) : null}

            {problemas.length ? (
              <div className="mst-aviso is-cian">
                <TriangleAlert size={16} />
                <div className="mst-aviso-texto">
                  {problemas.map((p) => <span key={`${p.key}-${p.tipo}`}>{p.texto}</span>)}
                  <button type="button" className="ui-btn" style={{ justifySelf: "start" }} onClick={onVolver}>Volver al carrito</button>
                </div>
              </div>
            ) : null}

            <div className="mst-confirmar">
              <button
                type="button"
                className={`mst-btn-grande${asignar ? " is-asignar" : " is-verde"}`}
                disabled={!puedeConfirmar}
                onClick={() => onConfirmar()}
              >
                {guardando ? <LoaderCircle size={19} className="mst-gira" /> : <Check size={19} />}
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{textoBoton}</span>
                {puedeConfirmar ? <span className="mst-tecla" aria-hidden="true">Enter</span> : null}
              </button>
            </div>
          </fieldset>
        </div>

        <aside className="mst-firma-aside" aria-label={asignar ? "Lo que se asigna" : "Lo que se lleva"}>
          <div className="mst-firma-aside-cab">
            <span className="mst-bloque-titulo" style={{ flex: 1 }}>{asignar ? "Se asigna" : "Se lleva"}</span>
            <span style={{ fontSize: 12, color: "var(--dim)" }}>{cart.length === 1 ? "1 producto" : `${cart.length} productos`}</span>
          </div>
          <div style={{ padding: "0 16px 8px" }}>
            <button type="button" className="ui-btn" style={{ width: "100%" }} disabled={guardando} onClick={onVolver}>Agregar o editar productos</button>
          </div>
          {cart.map((l) => {
            const ruta = porId.get(l.key);
            return (
              <div key={l.key} className="mpn-linea-firma">
                <div className="mpn-linea-firma-fila">
                  <span className="mst-num" style={asignar ? { color: "var(--teal)" } : undefined}>{fmtNum(l.cantidad)}</span>
                  <span>
                    {l.label}
                    {l.variante ? <small style={{ color: "var(--dim)" }}> · {l.variante}</small> : null}
                    {productoElegido(l) ? <small style={{ color: "var(--dim)" }}> · {productoElegido(l)}</small> : null}
                  </span>
                  <small style={{ color: "var(--dim)" }}>{l.unidad}</small>
                </div>
                {ruta ? (
                  <div className={`mpn-ruta${ruta.reasigna ? " is-reasigna" : ""}${ruta.sinObra ? " is-sin-obra" : ""}`}>
                    <strong>{ruta.origen}</strong>
                    {ruta.destino && ruta.destino !== ruta.origen ? <>→ <strong>{ruta.destino}</strong></> : null}
                    {ruta.reasigna ? <span>· se reasigna</span> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

function Quien({ persona, aMano, onAMano, nombreLibre, onNombreLibre, errorNombre, buscando, setBuscando, texto, setTexto, candidatos, elegirPersona, onQuitarPersona, lectorEstado, raizRef, onRafaga }) {
  if (persona) {
    return (
      <div className="mst-persona">
        <Avatar persona={persona} />
        <div className="mst-persona-texto">
          <div className="mst-persona-nombre">{persona.nombre}</div>
          <div className="mst-persona-sub">
            {persona.dni ? <span>DNI <span className="mst-num">{persona.dni}</span></span> : null}
            <span>{persona.metodo === "nfc" ? "con tarjeta" : "sin tarjeta"}</span>
            {persona.sede ? <span>{persona.sede}</span> : null}
          </div>
        </div>
        <button type="button" className="ui-btn" onClick={onQuitarPersona}>
          <X size={14} /> No es
        </button>
      </div>
    );
  }

  if (aMano) {
    return (
      <div className="mst-bloque">
        <div className="mst-bloque-titulo">
          No está en RRHH: nombre y apellido
          <button type="button" onClick={() => { onAMano(false); raizRef.current?.focus(); }}>Mejor la tarjeta</button>
        </div>
        <CampoTexto value={nombreLibre} onChange={onNombreLibre} onRafaga={onRafaga} autoFocus maxLength={80}
          onEnter={(e) => { e.preventDefault(); raizRef.current?.focus(); }}
          placeholder="Ej.: Gómez Carlos" aria-label="Nombre y apellido de quien retira" />
        {errorNombre && nombreLibre.trim() ? <div style={{ fontSize: 12, color: "var(--violet)" }}>{errorNombre}</div> : null}
        <div style={{ fontSize: 12, color: "var(--dim)" }}>Queda registrado como firmado sin tarjeta.</div>
      </div>
    );
  }

  return (
    <>
      <div className="mst-tarjeta">
        <div className="mst-tarjeta-icono"><Nfc size={34} /></div>
        <div style={{ minWidth: 0 }}>
          <h3>Apoyá la tarjeta en el lector</h3>
          <p>{lectorEstado === "connected" ? "Lector de tarjetas listo." : "No encuentro el puente del lector. Si el lector escribe como teclado, pasala igual."}</p>
        </div>
      </div>

      {buscando ? (
        <div className="mst-bloque">
          <div className="mst-bloque-titulo">
            Sin tarjeta: nombre o DNI
            <button type="button" onClick={() => { setBuscando(false); setTexto(""); raizRef.current?.focus(); }}>Mejor la tarjeta</button>
          </div>
          <div style={{ position: "relative" }}>
            <Search size={15} aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--dim)" }} />
            <CampoTexto
              value={texto}
              onChange={setTexto}
              onRafaga={onRafaga}
              onEnter={(e) => { e.preventDefault(); if (candidatos[0]) elegirPersona(candidatos[0]); }}
              placeholder="Apellido, nombre o DNI"
              aria-label="Buscar a la persona"
              style={{ paddingLeft: 34 }}
              autoFocus
            />
          </div>
          {candidatos.length ? (
            <div className="mst-personas">
              {candidatos.map((emp, i) => (
                <button key={emp.id} type="button" className={`mst-persona-res${i === 0 ? " is-activa" : ""}`} onClick={() => elegirPersona(emp)}>
                  <span>{emp.nombre}</span>
                  <small className="mst-num">{emp.dni ? `DNI ${emp.dni}` : ""}</small>
                  <small>{emp.sede || ""}</small>
                </button>
              ))}
            </div>
          ) : texto.trim() ? (
            <div className="mst-vacio" style={{ padding: 12 }}>Nadie coincide en RRHH.</div>
          ) : null}
          <button type="button" className="ui-btn" style={{ justifySelf: "start", borderStyle: "dashed" }} onClick={() => { setBuscando(false); onAMano(true, texto); }}>
            <UserRound size={15} /> No está en RRHH: escribir nombre y apellido
          </button>
        </div>
      ) : (
        <button type="button" className="ui-btn" style={{ justifySelf: "start", minHeight: 44, borderStyle: "dashed" }} onClick={() => setBuscando(true)}>
          <UserRound size={15} /> No tiene tarjeta: buscar por nombre o DNI
        </button>
      )}
    </>
  );
}

/**
 * A qué se carga. El RPC recibe un solo destino para todo el carrito:
 *   - "Cada uno a su obra": lo asignado sale a su obra; lo de stock libre, al sector.
 *   - Una obra: todo se carga ahí; lo de otra obra se reasigna (se marca en la lista).
 */
function Destino({ asignar, cart, obras, obrasPersona, cargandoObras, destino, onDestino, onRafaga }) {
  const [otra, setOtra] = useState(false);
  const [filtro, setFiltro] = useState("");
  const libre = hayStockLibre(cart);
  const propias = [...new Set(cart.filter((l) => l.obraId).map((l) => l.obraId))];
  const codigo = (id) => obras.find((o) => o.id === id)?.codigo || "obra";
  const activas = obras.filter((o) => !obraCerrada(o));
  const deLaPersona = obrasPersona.filter((o) => !obraCerrada(o));
  const elegida = destino?.obraId || null;
  const mostrarTodas = asignar || otra || (elegida && !deLaPersona.some((o) => o.id === elegida));
  const q = normalizarTexto(filtro);
  const visibles = q ? activas.filter((o) => normalizarTexto(`${o.codigo} ${o.linea_nombre || ""}`).includes(q)) : activas;

  const elegirObra = (id) => onDestino({ obraId: id, sector: null, comentario: "" });
  const cadaUno = () => onDestino({ obraId: null, sector: destino?.sector ?? null, comentario: destino?.comentario ?? "" });

  if (asignar) {
    return (
      <div className="mst-bloque mpn-asignar">
        <div className="mst-bloque-titulo">
          Queda en el pañol, reservado a
          {activas.length > 12 ? (
            <input className="ui-input mpn-filtro-obras" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar obra" aria-label="Buscar obra" style={{ marginLeft: "auto", minHeight: 34, textTransform: "none", letterSpacing: 0 }} />
          ) : null}
        </div>
        <div className="mst-opciones">
          {visibles.map((o) => (
            <button key={o.id} type="button" className={`mst-opcion is-mono${elegida === o.id ? " is-elegida" : ""}`} aria-pressed={elegida === o.id} onClick={() => elegirObra(o.id)}>
              {o.codigo}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mst-bloque">
        <div className="mst-bloque-titulo">
          Se carga a
          {!mostrarTodas ? <button type="button" onClick={() => setOtra(true)}>Otra obra</button> : deLaPersona.length || propias.length ? <button type="button" onClick={() => { setOtra(false); setFiltro(""); }}>Volver a sus obras</button> : null}
        </div>
        {cargandoObras ? <Cargando compacto texto="Buscando sus obras…" /> : null}
        <div className="mst-obras">
          {propias.length ? (
            <button type="button" className={`mpn-destino-opcion${destino && !elegida ? " is-elegida" : ""}`} aria-pressed={Boolean(destino && !elegida)} onClick={cadaUno}>
              <strong>{propias.length === 1 && !libre ? codigo(propias[0]) : "Cada uno a su obra"}</strong>
              <span>{propias.length === 1 && !libre ? "Donde ya está asignado" : `${propias.map(codigo).join(", ")}${libre ? " · stock libre al sector" : ""}`}</span>
            </button>
          ) : null}
          {deLaPersona.map((o) => (
            <button key={o.id} type="button" className={`mst-obra${elegida === o.id ? " is-elegida" : ""}`} aria-pressed={elegida === o.id} onClick={() => elegirObra(o.id)}>
              <strong>{o.codigo}</strong>
              <span>{propias.length && propias.some((p) => p !== o.id) ? "Su obra · reasigna lo de otra" : "Su obra en RRHH"}</span>
            </button>
          ))}
        </div>
        {mostrarTodas ? (
          <>
            {activas.length > 12 ? (
              <input className="ui-input mpn-filtro-obras" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar obra" aria-label="Buscar obra" />
            ) : null}
            <div className="mst-opciones">
              {visibles.map((o) => (
                <button key={o.id} type="button" className={`mst-opcion is-mono${elegida === o.id ? " is-elegida" : ""}`} aria-pressed={elegida === o.id} onClick={() => elegirObra(o.id)}>
                  {o.codigo}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {elegida && propias.some((p) => p !== elegida) ? (
          <div style={{ fontSize: 12.5, color: "var(--violet)" }}>
            Lo asignado a {propias.filter((p) => p !== elegida).map(codigo).join(", ")} se reasigna a {codigo(elegida)}.
          </div>
        ) : null}
      </div>

      {libre && !elegida ? (
        <div className="mst-bloque">
          <div className="mst-bloque-titulo">Lo de stock libre, ¿para qué sector?</div>
          <div className="mst-opciones">
            {SECTORES.map((s) => (
              <button key={s} type="button" className={`mst-opcion${destino?.sector === s ? " is-elegida" : ""}`} aria-pressed={destino?.sector === s}
                onClick={() => onDestino({ obraId: null, sector: s, comentario: destino?.comentario ?? "" })}>
                {s}
              </button>
            ))}
          </div>
          {destino?.sector === "Otro" ? (
            <div style={{ display: "grid", gap: 6 }}>
              <label className="mst-bloque-titulo" htmlFor="mpn-otro">¿Para qué o para quién es?</label>
              <CampoTexto id="mpn-otro" value={destino.comentario ?? ""} onChange={(v) => onDestino({ ...destino, comentario: v })} onRafaga={onRafaga} maxLength={160} autoFocus
                placeholder="Mantenimiento del galpón, visita de proveedor…" />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
