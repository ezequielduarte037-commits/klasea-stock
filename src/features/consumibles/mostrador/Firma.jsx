import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, HardHat, LoaderCircle, Nfc, Search, ShieldAlert, Split, TriangleAlert, UserRound, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { SECTORES } from "@/features/panol/solicitudesPanolApi";
import CampoTexto from "./CampoTexto";
import { agruparRetirosDeHoy, faltaComentarioOtro, fmtNum, normalizarTexto, puedeRepartir, totalUnidades } from "./mostradorLogica";
import { Avatar } from "./Piezas";

/**
 * Paso 2: la firma. Apoyar la tarjeta identifica y firma. Acá se ve quién es,
 * lo que ya se llevó hoy y adónde se carga:
 *   - con una sola obra en RRHH, ahí, sin preguntar (y si no falta nada, se
 *     confirma solo a los 3 s: el pañolero puede cortarlo tocando la pantalla);
 *   - con varias, un botón por obra o "Repartir entre las N" (hasta 4): tocarlo
 *     confirma; si figura en muchas (cuadrillas asignadas a todas), se elige una;
 *   - sin obra, se elige una obra activa o un sector.
 * Pasarse del cupo no bloquea: pide quién autoriza.
 * Un externo (herrero, vidriero) se da de alta acá si no está en RRHH, y su
 * retiro pide quién del astillero lo autoriza.
 *
 * El foco queda en el panel (no en un campo) para que el lector de tarjetas
 * que escribe como teclado no termine tipeando el UID adentro de un input.
 */
export default function Firma({
  modo,
  carrito = [],
  porId,
  persona,
  info,
  obrasActivas = [],
  destino,
  destinoTexto,
  onDestino,
  onElegirYConfirmar,
  excedidos = [],
  autorizaCupo,
  onAutorizaCupo,
  problemas = [],
  guardando,
  operacion,
  sinPersistir,
  errorOperacion,
  onContinuarOperacion,
  onAbrirCola,
  onSeguirConOtro,
  autoConfirmando,
  onCortarAuto,
  onConfirmar,
  onVolver,
  onQuitarPersona,
  empleados = [],
  onElegirPersona,
  lectorEstado,
  notaDevolucion,
  onNotaDevolucion,
  onRafaga,
  empresasExternas = [],
  onAltaExterno,
}) {
  const devolucion = modo === "devolucion";
  const [altaExterno, setAltaExterno] = useState(false);
  const raizRef = useRef(null);
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState("");
  const [cambiando, setCambiando] = useState(false);

  // Cada vez que cambia la persona, el foco vuelve al panel: Enter confirma y
  // el lector de tarjetas puede leer de nuevo.
  useEffect(() => {
    raizRef.current?.focus({ preventScroll: true });
  }, [persona?.id]);

  const hoy = useMemo(() => agruparRetirosDeHoy(info?.hoy ?? [], porId), [info?.hoy, porId]);
  const enCupo = useMemo(() => new Set(excedidos.map((e) => e.materialId)), [excedidos]);
  const obras = info?.obras ?? [];

  const candidatos = useMemo(() => {
    const q = normalizarTexto(texto);
    if (!q) return [];
    const digitos = q.replace(/\D/g, "");
    const palabras = q.split(" ");
    return empleados
      .filter((e) => (digitos.length >= 3 && String(e.dni ?? "").includes(digitos))
        || palabras.every((p) => normalizarTexto(e.nombre).includes(p)))
      .slice(0, 8);
  }, [empleados, texto]);

  const pideAutorizacion = excedidos.length > 0 || (!devolucion && Boolean(persona?.externo));
  const faltaAutorizar = pideAutorizacion && !String(autorizaCupo || "").trim();
  const bloqueado = guardando || Boolean(operacion) || info?.cargando || problemas.length > 0 || faltaAutorizar;
  const faltaComentario = !devolucion && faltaComentarioOtro(destino);
  const puedeConfirmar = devolucion
    ? !bloqueado
    : Boolean(persona) && Boolean(destino) && !faltaComentario && !bloqueado;

  function elegirPersona(emp) {
    setBuscando(false);
    setAltaExterno(false);
    setTexto("");
    onElegirPersona(emp);
  }

  function alTeclear(e) {
    if (e.defaultPrevented || guardando || operacion) return;
    if (e.key === "Escape") { e.preventDefault(); onVolver(); return; }
    if (e.key === "Enter" && e.target === e.currentTarget && puedeConfirmar) {
      e.preventDefault();
      onConfirmar();
    }
  }

  const textoBoton = guardando
    ? "Registrando…"
    : devolucion
      ? (persona ? "Registrar la devolución" : "Registrar sin nombre")
      : !persona
        ? "Falta la tarjeta"
        : !destino
          ? "Elegí la obra o el sector"
          : faltaComentario
            ? "Escribí para qué es"
          : faltaAutorizar
            ? "Falta quién autoriza"
            : `Confirmar · ${destinoTexto}`;

  return (
    <div
      ref={raizRef}
      className="mst-firma"
      role="dialog"
      aria-modal="true"
      aria-label={devolucion ? "Registrar la devolución" : "Firmar el retiro"}
      tabIndex={-1}
      onKeyDown={alTeclear}
      onPointerDown={() => onCortarAuto?.()}
    >
      <div className="mst-firma-cab">
        <button type="button" className="ui-btn" disabled={guardando || Boolean(operacion)} onClick={onVolver}>
          <ArrowLeft size={15} /> Seguir marcando
        </button>
        <h2>{devolucion ? "¿Quién lo devuelve?" : persona ? "Firmado con " + (persona.metodo === "nfc" ? "tarjeta" : "nombre") : "Firmá el retiro"}</h2>
        <span className="mst-num" style={{ fontSize: 15, fontWeight: 700, color: devolucion ? "var(--teal)" : "var(--blue)" }}>
          {fmtNum(totalUnidades(carrito))}
        </span>
      </div>

      <div className="mst-firma-cuerpo">
        <div className="mst-firma-main">
          {errorOperacion || operacion ? (
            <div className="mst-aviso is-cian" role="alert">
              <TriangleAlert size={16} />
              <div className="mst-aviso-texto">
                <strong>{sinPersistir ? "Todavía no se guardó en este equipo" : operacion ? "Operación conservada" : "Falta completar el registro"}</strong>
                <span>{errorOperacion || "Conservamos las filas originales y sus ids."}</span>
                {operacion ? (
                  <div className="mst-fila">
                    {!["rechazado", "vencido"].includes(operacion.estado) ? <button type="button" className="ui-btn ui-btn-primario" disabled={guardando} onClick={onContinuarOperacion}>Continuar el cierre</button> : null}
                    <button type="button" className="ui-btn" disabled={guardando} onClick={onAbrirCola}>Revisar la cola</button>
                    <button type="button" className="ui-btn" disabled={guardando || sinPersistir} onClick={onSeguirConOtro}>Conservar para revisar y atender al próximo</button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <fieldset disabled={guardando || Boolean(operacion)} style={{ display: "contents", border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {!persona ? (
            <>
              <div className="mst-tarjeta">
                <div className="mst-tarjeta-icono"><Nfc size={34} /></div>
                <div style={{ minWidth: 0 }}>
                  <h3>{devolucion ? "Si tiene tarjeta, que la apoye" : "Apoyá la tarjeta en el lector"}</h3>
                  <p>
                    {lectorEstado === "connected"
                      ? "Lector de tarjetas listo."
                      : "No encuentro el puente del lector. Si el lector escribe como teclado, pasala igual."}
                  </p>
                </div>
              </div>

              {buscando || info?.errorTarjeta ? (
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
                          <small>{emp.externo ? `Externo · ${emp.empresa}` : emp.sede || ""}</small>
                        </button>
                      ))}
                    </div>
                  ) : texto.trim() ? (
                    <div className="mst-vacio" style={{ padding: 12 }}>Nadie coincide en RRHH.</div>
                  ) : null}
                  {!devolucion && onAltaExterno ? (altaExterno ? (
                    <AltaExterno
                      texto={texto}
                      empresas={empresasExternas}
                      onRafaga={onRafaga}
                      onAlta={onAltaExterno}
                      onListo={elegirPersona}
                      onCancelar={() => setAltaExterno(false)}
                    />
                  ) : (
                    <button type="button" className="ui-btn" style={{ justifySelf: "start", borderStyle: "dashed" }} onClick={() => setAltaExterno(true)}>
                      <HardHat size={15} /> No es del astillero (herrero, vidriero…): darlo de alta
                    </button>
                  )) : null}
                  <div style={{ fontSize: 12, color: "var(--dim)" }}>Queda registrado como firmado sin tarjeta.</div>
                </div>
              ) : (
                <button type="button" className="ui-btn" style={{ justifySelf: "start", minHeight: 44, borderStyle: "dashed" }} onClick={() => setBuscando(true)}>
                  <UserRound size={15} /> No tiene tarjeta: buscar por nombre o DNI
                </button>
              )}
            </>
          ) : (
            <div className="mst-persona">
              <Avatar persona={persona} />
              <div className="mst-persona-texto">
                <div className="mst-persona-nombre">{persona.nombre}</div>
                <div className="mst-persona-sub">
                  {persona.dni ? <span>DNI <span className="mst-num">{persona.dni}</span></span> : null}
                  <span>{persona.metodo === "nfc" ? "con tarjeta" : "sin tarjeta"}</span>
                  {persona.externo ? <span className="mst-externo">Externo · {persona.empresa}</span> : persona.sede ? <span>{persona.sede}</span> : null}
                </div>
              </div>
              <button type="button" className="ui-btn" onClick={onQuitarPersona}>
                <X size={14} /> No es
              </button>
            </div>
          )}

          {persona && !devolucion ? (
            <div className="mst-bloque">
              <div className="mst-bloque-titulo">Hoy ya se llevó</div>
              {info?.cargando ? (
                <Cargando compacto texto="Mirando lo de hoy…" />
              ) : info?.errorHoy ? (
                <div style={{ fontSize: 12.5, color: "var(--dim)" }}>No se pudo verificar lo de hoy. Los productos con cupo requieren autorización.</div>
              ) : hoy.length ? (
                <div className="mst-hoy">
                  {hoy.map((h) => (
                    <span key={h.materialId} className={`mst-hoy-item${enCupo.has(h.materialId) ? " is-cupo" : ""}`}>
                      <span className="mst-num">{fmtNum(h.cantidad)}</span> {h.descripcion}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Nada todavía.</div>
              )}
            </div>
          ) : null}

          {excedidos.length && !devolucion ? (
            <div className="mst-aviso">
              <ShieldAlert size={17} />
              <div className="mst-aviso-texto">
                <strong>{excedidos.some((e) => e.incierto) ? "Hace falta autorizar el cupo sin verificar" : "Se pasa del cupo diario"}</strong>
                {excedidos.map((e) => (
                  <span key={e.materialId}>
                    {e.descripcion}: cupo <span className="mst-num">{fmtNum(e.cupo)}</span>, hoy <span className="mst-num">{fmtNum(e.ya)}</span> + <span className="mst-num">{fmtNum(e.enCarrito)}</span>
                  </span>
                ))}
                {/* Con un externo, el mismo «quién autoriza» de abajo cubre el cupo. */}
                {persona?.externo ? <span>La autorización del externo cubre también el cupo.</span> : (
                  <CampoTexto
                    value={autorizaCupo}
                    onChange={onAutorizaCupo}
                    onRafaga={onRafaga}
                    onEnter={(e) => { e.preventDefault(); raizRef.current?.focus(); }}
                    placeholder="¿Quién autoriza?"
                    aria-label="Quién autoriza pasarse del cupo"
                  />
                )}
              </div>
            </div>
          ) : null}

          {persona?.externo && !devolucion ? (
            <div className="mst-aviso is-externo">
              <HardHat size={17} />
              <div className="mst-aviso-texto">
                <strong>No es del astillero: ¿quién lo autoriza?</strong>
                <span>Va como costo de la obra y queda sumado a {persona.empresa}.</span>
                <CampoTexto
                  value={autorizaCupo}
                  onChange={onAutorizaCupo}
                  onRafaga={onRafaga}
                  onEnter={(e) => { e.preventDefault(); raizRef.current?.focus(); }}
                  placeholder="Encargado o jefe de obra que lo autoriza"
                  aria-label="Quién del astillero autoriza el retiro del externo"
                />
              </div>
            </div>
          ) : null}

          {persona || devolucion ? (
            <Destino
              devolucion={devolucion}
              cargando={Boolean(persona) && info?.cargando}
              errorObras={info?.errorObras}
              obras={obras}
              obrasActivas={obrasActivas}
              destino={destino}
              cambiando={cambiando}
              onCambiar={setCambiando}
              onDestino={onDestino}
              onElegirYConfirmar={onElegirYConfirmar}
              onRafaga={onRafaga}
              bloqueado={bloqueado}
            />
          ) : null}

          {devolucion ? (
            <div className="mst-bloque">
              <label className="mst-bloque-titulo" htmlFor="mst-nota-dev">Nota (opcional)</label>
              <CampoTexto id="mst-nota-dev" value={notaDevolucion} onChange={onNotaDevolucion} onRafaga={onRafaga} placeholder="Sobró de la obra, vuelve la herramienta…" />
            </div>
          ) : null}

          {problemas.length ? (
            <div className="mst-aviso is-cian">
              <TriangleAlert size={16} />
              <div className="mst-aviso-texto">
                {problemas.map((p) => <span key={`${p.key}-${p.tipo}`}>{p.texto}</span>)}
                <button type="button" className="ui-btn" style={{ justifySelf: "start" }} onClick={onVolver}>Volver a marcar</button>
              </div>
            </div>
          ) : null}

          <div className="mst-confirmar">
            {autoConfirmando ? (
              <>
                <div className="mst-auto" aria-hidden="true"><i /></div>
                <div className="mst-auto-texto">
                  Se confirma solo en 3 segundos.
                  <button type="button" onClick={onCortarAuto}>Esperá</button>
                </div>
              </>
            ) : null}
            <button
              type="button"
              className={`mst-btn-grande${devolucion ? " is-devolucion" : " is-verde"}`}
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

        <aside className="mst-firma-aside" aria-label="Lo que se lleva">
          <div className="mst-firma-aside-cab">
            <span className="mst-bloque-titulo" style={{ flex: 1 }}>{devolucion ? "Vuelve" : "Se lleva"}</span>
            <span style={{ fontSize: 12, color: "var(--dim)" }}>{carrito.length === 1 ? "1 producto" : `${carrito.length} productos`}</span>
          </div>
          {carrito.map((l) => {
            const item = porId.get(l.materialId);
            return (
              <div key={l.key} className={`mst-resumen-fila${devolucion ? " is-devolucion" : ""}`}>
                <span className="mst-num">{l.cantidad > 0 ? fmtNum(l.cantidad) : "—"}</span>
                <span>
                  {item?.descripcion ?? "Consumible"}
                  {l.gramos ? <small> · <span className="mst-num">{fmtNum(l.gramos)}</span> g</small> : null}
                  {l.canje === "sin_usado" ? <small> · sin el usado</small> : null}
                  {item?.formaEntrega === "prestamo" ? <small> · préstamo</small> : null}
                </span>
                <small>{item?.unidad ?? ""}</small>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

function Destino({ devolucion, cargando, errorObras, obras, obrasActivas, destino, cambiando, onCambiar, onDestino, onElegirYConfirmar, onRafaga, bloqueado }) {
  const esObra = (id) => destino?.tipo === "obra" && destino.obraId === id;

  if (cargando) {
    return (
      <div className="mst-bloque">
        <div className="mst-bloque-titulo">Se carga a</div>
        <Cargando compacto texto="Buscando sus obras…" />
      </div>
    );
  }

  if (devolucion) {
    if (!obras.length) return null;
    return (
      <div className="mst-bloque">
        <div className="mst-bloque-titulo">¿De qué obra vuelve?</div>
        <div className="mst-opciones">
          {obras.map((o) => (
            <button key={o.id} type="button" className={`mst-opcion is-mono${esObra(o.id) ? " is-elegida" : ""}`} onClick={() => onDestino({ tipo: "obra", obraId: o.id })}>
              {o.codigo}
            </button>
          ))}
          <button type="button" className={`mst-opcion${!destino ? " is-elegida" : ""}`} onClick={() => onDestino(null)}>Sin obra</button>
        </div>
      </div>
    );
  }

  // Una sola obra: se carga ahí sin preguntar.
  if (obras.length === 1 && !cambiando && esObra(obras[0].id)) {
    const o = obras[0];
    return (
      <div className="mst-bloque">
        <div className="mst-bloque-titulo">
          Se carga a
          <button type="button" onClick={() => onCambiar(true)}>Otra obra o sector</button>
        </div>
        <div className="mst-destino-fijo">
          <strong>{o.codigo}</strong>
          <span>{o.descripcion || "Su obra en RRHH"}</span>
        </div>
      </div>
    );
  }

  // Figura en muchas obras (cuadrillas asignadas a todas): se elige una, sin repartir.
  if (obras.length > 1 && !puedeRepartir(obras) && !cambiando) {
    return (
      <div className="mst-bloque">
        <div className="mst-bloque-titulo">
          Figura en {obras.length} obras: ¿para cuál es?
          <button type="button" onClick={() => onCambiar(true)}>Otra obra o sector</button>
        </div>
        <div className="mst-opciones">
          {obras.map((o) => (
            <button key={o.id} type="button" className={`mst-opcion is-mono${esObra(o.id) ? " is-elegida" : ""}`} onClick={() => onElegirYConfirmar({ tipo: "obra", obraId: o.id })} title={o.descripcion || ""}>
              {o.codigo}
            </button>
          ))}
        </div>
        {bloqueado ? <div style={{ fontSize: 12, color: "var(--dim)" }}>Tocar una la deja elegida; confirmá cuando esté todo.</div> : null}
      </div>
    );
  }

  // Varias obras: tocar una confirma (o la deja elegida si falta autorizar algo).
  if (obras.length > 1 && !cambiando) {
    const repartiendo = destino?.tipo === "repartir";
    return (
      <div className="mst-bloque">
        <div className="mst-bloque-titulo">
          ¿Para qué obra es?
          <button type="button" onClick={() => onCambiar(true)}>Otra obra o sector</button>
        </div>
        <div className="mst-obras">
          {obras.map((o) => (
            <button key={o.id} type="button" className={`mst-obra${esObra(o.id) ? " is-elegida" : ""}`} onClick={() => onElegirYConfirmar({ tipo: "obra", obraId: o.id })}>
              <strong>{o.codigo}</strong>
              <span>{o.descripcion || "Obra asignada"}</span>
            </button>
          ))}
          <button
            type="button"
            className={`mst-obra is-repartir${repartiendo ? " is-elegida" : ""}`}
            onClick={() => onElegirYConfirmar({ tipo: "repartir", obraIds: obras.map((o) => o.id) })}
          >
            <strong><Split size={15} style={{ verticalAlign: "-2px" }} /> Repartir entre las {obras.length}</strong>
            <span>Partes iguales</span>
          </button>
        </div>
        {bloqueado ? <div style={{ fontSize: 12, color: "var(--dim)" }}>Tocar una la deja elegida; confirmá cuando esté todo.</div> : null}
      </div>
    );
  }

  // Sin obra en RRHH (o eligiendo otra): cualquier obra activa o un sector.
  return (
    <div className="mst-bloque">
      <div className="mst-bloque-titulo">
        {obras.length ? "Otra obra o sector" : errorObras ? "No se pudieron ver sus obras: elegí" : "No tiene obra asignada en RRHH: elegí"}
        {obras.length ? <button type="button" onClick={() => onCambiar(false)}>Volver a sus obras</button> : null}
      </div>
      <div className="mst-opciones">
        {obrasActivas.map((o) => (
          <button key={o.id} type="button" className={`mst-opcion is-mono${esObra(o.id) ? " is-elegida" : ""}`} onClick={() => onDestino({ tipo: "obra", obraId: o.id })} title={o.descripcion || ""}>
            {o.codigo}
          </button>
        ))}
      </div>
      <div className="mst-bloque-titulo" style={{ marginTop: 4 }}>Sector</div>
      <div className="mst-opciones">
        {SECTORES.map((s) => (
          <button key={s} type="button" className={`mst-opcion${destino?.tipo === "sector" && destino.sector === s ? " is-elegida" : ""}`} onClick={() => onDestino({ tipo: "sector", sector: s, comentario: destino?.comentario ?? "" })}>
            {s}
          </button>
        ))}
      </div>
      {/* "Otro" a secas no dice nada después: se escribe para qué o para quién. */}
      {destino?.tipo === "sector" && destino.sector === "Otro" ? (
        <div style={{ display: "grid", gap: 6 }}>
          <label className="mst-bloque-titulo" htmlFor="mst-otro-comentario">¿Para qué o para quién es?</label>
          <CampoTexto
            id="mst-otro-comentario"
            value={destino.comentario ?? ""}
            onChange={(v) => onDestino({ ...destino, comentario: v })}
            onRafaga={onRafaga}
            maxLength={160}
            autoFocus
            placeholder="Ej.: mantenimiento del galpón, visita de proveedor…"
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Alta de un externo: apellido y nombre, empresa (las que ya hay se sugieren)
 * y DNI si lo tiene a mano. Queda en RRHH como contratista que no ficha; RRHH
 * completa el resto después.
 */
function AltaExterno({ texto = "", empresas = [], onRafaga, onAlta, onListo, onCancelar }) {
  const soloNumeros = /^\d[\d.\s]*$/.test(texto.trim());
  const [nombre, setNombre] = useState(soloNumeros ? "" : texto.trim());
  const [empresa, setEmpresa] = useState("");
  const [dni, setDni] = useState(soloNumeros ? texto.replace(/\D/g, "") : "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const listaId = "mst-empresas-externas";

  async function enviar() {
    if (enviando) return;
    if (nombre.trim().length < 3) { setError("Escribí el apellido y el nombre."); return; }
    if (empresa.trim().length < 2) { setError("Escribí la empresa (o quién lo manda)."); return; }
    setEnviando(true);
    setError("");
    try {
      const emp = await onAlta({ nombre: nombre.trim(), empresa: empresa.trim(), dni: dni.trim() });
      onListo(emp);
    } catch (e) {
      setError(e?.message || "No se pudo dar de alta.");
      setEnviando(false);
    }
  }

  const alEnter = (e) => { e.preventDefault(); enviar(); };
  return (
    <div className="mst-alta-externo">
      <div className="mst-bloque-titulo">Externo: no está en RRHH</div>
      <label className="mst-etiqueta" htmlFor="mst-ext-nombre">Apellido y nombre</label>
      <CampoTexto id="mst-ext-nombre" value={nombre} onChange={setNombre} onRafaga={onRafaga} onEnter={alEnter} autoFocus maxLength={80} placeholder="Ej.: Gómez Carlos" />
      <label className="mst-etiqueta" htmlFor="mst-ext-empresa">Empresa o quién lo manda</label>
      <CampoTexto id="mst-ext-empresa" value={empresa} onChange={setEmpresa} onRafaga={onRafaga} onEnter={alEnter} list={listaId} maxLength={80} placeholder="Ej.: Herrería Gómez, Vidrios del Sur" />
      <datalist id={listaId}>{empresas.map((x) => <option key={x.id ?? x.nombre} value={x.nombre} />)}</datalist>
      <label className="mst-etiqueta" htmlFor="mst-ext-dni">DNI (si lo tiene a mano)</label>
      <CampoTexto id="mst-ext-dni" value={dni} onChange={setDni} onRafaga={onRafaga} onEnter={alEnter} inputMode="numeric" maxLength={12} placeholder="Opcional" />
      {error ? <div className="mst-error">{error}</div> : null}
      <div className="mst-fila">
        <button type="button" className="ui-btn" onClick={onCancelar} disabled={enviando}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn-primario" onClick={enviar} disabled={enviando}>
          {enviando ? <LoaderCircle size={15} className="mst-gira" /> : <Check size={15} />} Darlo de alta y seguir
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--dim)" }}>Queda en RRHH como externo que no ficha. Si vuelve, se lo busca por nombre.</div>
    </div>
  );
}
