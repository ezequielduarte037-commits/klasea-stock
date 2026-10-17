/* ═══════════════════════════════════════════════════════════════
   Configurador · pantalla
   El barco en el mar, para jugar: colores de casco, cubierta, teca y
   tapizados, hora del día y clima, balcones que se abren, luces y una
   navegación. Barra de vidrio abajo (Cámara · Clima · Abrir ·
   Configurar · Zarpar) y la elección queda guardada en este equipo.
═══════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import {
  Aperture, Cloud, CloudRain, Download, DoorOpen, LampCeiling, Lightbulb, Moon, Navigation, Palette, RotateCcw, Sailboat, Sofa, Sun, Sunrise, Video, Waves, X,
} from "lucide-react";
import { leerMovimientoReducido } from "@/components/ui/useReducedMotion";
import { leerJson, guardarJson } from "../almacen";
import { modelo3dDe, partesModelo } from "../unidad";
import { cargarModelo } from "../recorrido/barco";
import { cargarCielos } from "./cielo";
import { prepararMar } from "./ambiente";
import Escena from "./Escena";
import { CAPAS, CAPAS_EXTERIOR, CAPAS_INTERIOR, ESTILOS, AMBIENTES, ELECCION_INICIAL, VISTAS, CLIMAS, HORA_MIN, HORA_MAX, opcionDe, eleccionValida, textoHora } from "./opciones";

function hayWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const PESTANAS = [
  { id: "camara", t: "Cámara", i: Video },
  { id: "clima", t: "Clima", i: Sun },
  { id: "abrir", t: "Abrir", i: DoorOpen },
  { id: "interior", t: "Interior", i: Sofa },
  { id: "luces", t: "Luces", i: Lightbulb },
  { id: "color", t: "Configurar", i: Palette },
];

const LUCES = [
  { id: "navegacion", t: "Navegación", i: Navigation, d: "Roja a babor, verde a estribor y blanca de tope. Cada una se ve sólo desde su sector, como en el agua." },
  { id: "cortesia", t: "Cortesía", i: LampCeiling, d: "Tiras LED del hardtop y luces bajas en el cockpit y la popa." },
  { id: "agua", t: "Subacuáticas", i: Waves, d: "El agua de popa se ilumina desde abajo. Elegí el color." },
];
const APAGADAS = { navegacion: false, cortesia: false, agua: false };
// Colores de las luces subacuáticas (los LED marinos más comunes).
const COLORES_SUB = [
  { id: "blanco", t: "Blanco", c: "#e8f4ff" },
  { id: "azul", t: "Azul", c: "#2f8dff" },
  { id: "celeste", t: "Celeste", c: "#25d5ff" },
  { id: "rojo", t: "Rojo", c: "#ff2a3a" },
];

/* Los botones de una capa de color (con su nota, si tiene). */
function Muestras({ capa, eleccion, elegir }) {
  return (
    <>
      <div className="kx-cfg-muestras">
        {capa.ops.map((op, i) => (
          <button key={op.id} type="button" style={{ "--i": i, "--c": op.muestra || op.c }} aria-pressed={eleccion[capa.id] === op.id}
            onClick={() => elegir(capa.id, op.id)} aria-label={op.t}>
            <i /><span>{op.t}</span>
          </button>
        ))}
      </div>
      {capa.nota && <p className="kx-cfg-nota">{capa.nota}</p>}
    </>
  );
}

export default function Configurador({ modelo, onCerrar }) {
  // Las líneas sin modelo 3D propio ven el K43 como referencia.
  const propio = modelo3dDe(modelo);
  const cfg = propio || modelo3dDe("K43");
  const nombre = propio ? partesModelo(modelo).base : "K43";
  const clave = `ka_config_${nombre}`;
  const [guardado] = useState(() => leerJson(clave, null));

  const [geo, setGeo] = useState(null);
  const [cielos, setCielos] = useState(null);
  const [error, setError] = useState(() => (hayWebGL() ? null : "webgl"));
  const [pestana, setPestana] = useState(null);
  const [vista, setVista] = useState("tres");
  const [eleccion, setEleccion] = useState(() => ({ ...ELECCION_INICIAL, ...eleccionValida(guardado?.eleccion) }));
  const [capa, setCapa] = useState("estilos");
  const [capaInterior, setCapaInterior] = useState("ambientes");
  // Adentro: el lugar del interior desde donde se mira (null = afuera).
  const [adentro, setAdentro] = useState(null);
  const [velo, setVelo] = useState(false);
  const fundido = useRef(null);
  const [hora, setHora] = useState(() => guardado?.hora ?? 18.6);
  const [clima, setClima] = useState(() => guardado?.clima ?? "sol");
  const [balcones, setBalcones] = useState(false);
  const [luces, setLuces] = useState(APAGADAS);
  const [colorSub, setColorSub] = useState(() => guardado?.colorSub ?? "azul");
  const [navegando, setNavegando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const indicador = useRef(null);
  // Alto del panel abierto: la vista sube esa mitad para que el barco no quede tapado.
  const [altoPanel, setAltoPanel] = useState(0);
  const observador = useRef(null);
  // Estable (useCallback): una ref nueva en cada render la desconectaba y
  // reconectaba sin parar, y la imagen temblaba con el panel abierto.
  const medirPanel = useCallback(el => {
    observador.current?.disconnect();
    if (!el) return;
    observador.current = new ResizeObserver(([e]) => setAltoPanel(e.contentRect.height));
    observador.current.observe(el);
  }, []);
  const tres = useRef(null);
  // La escena deja acá su forma de dibujar un cuadro (con resplandor y tone mapping).
  const dibujar = useRef(null);
  const [intro] = useState(() => !leerMovimientoReducido());

  useEffect(() => {
    if (error) return undefined;
    let vivo = true;
    // El barco y los cielos (fotos reales, 1,6 MB) llegan juntos; mientras
    // tanto se dibujan las texturas del mar (espuma, burbujas).
    Promise.all([cargarModelo(cfg), cargarCielos(), prepararMar()])
      .then(([m, c]) => { if (vivo) { setCielos(c); setGeo(m); } })
      .catch(() => { if (vivo) setError("modelo"); });
    return () => { vivo = false; };
  }, [cfg, error]);

  useEffect(() => { guardarJson(clave, { eleccion, hora, clima, colorSub }); }, [clave, eleccion, hora, clima, colorSub]);

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") (pestana ? setPestana(null) : onCerrar()); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pestana, onCerrar]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Rótulo grande abajo a la izquierda: lo último que se tocó.
  const avisar = (eyebrow, t) => setAviso(a => ({ eyebrow, t, k: (a?.k ?? 0) + 1 }));

  const elegir = (capaId, opId) => {
    setEleccion(e => ({ ...e, [capaId]: opId }));
    const c = CAPAS.find(x => x.id === capaId);
    avisar(c.t, opcionDe(capaId, opId).t);
  };
  // Los estilos cambian el exterior y los ambientes el interior: cada uno
  // conserva lo elegido del otro lado.
  const aplicarEstilo = est => { setEleccion(e => ({ ...e, ...est.e })); avisar("Estilo", est.t); };
  const aplicarAmbiente = amb => { setEleccion(e => ({ ...e, ...amb.e })); avisar("Ambiente", amb.t); };

  // Entrar, salir o cambiar de lugar adentro: la pantalla se funde a negro,
  // la cámara salta y vuelve a aparecer (no atraviesa paredes).
  const conFundido = cambio => {
    clearTimeout(fundido.current);
    if (leerMovimientoReducido()) { cambio(); return; }
    setVelo(true);
    fundido.current = setTimeout(() => {
      cambio();
      fundido.current = setTimeout(() => setVelo(false), 380);
    }, 320);
  };
  useEffect(() => () => clearTimeout(fundido.current), []);
  const irLugar = lugar => {
    if (navegando) setNavegando(false);
    conFundido(() => setAdentro(lugar.id));
    avisar("Interior", lugar.t);
  };
  const salir = (vistaNueva = "tres") => conFundido(() => { setAdentro(null); setVista(vistaNueva); });
  const irVista = v => {
    if (adentro) salir(v.id); else setVista(v.id);
    avisar("Cámara", v.t);
  };
  const abrirBalcones = () => {
    const nuevo = !balcones;
    setBalcones(nuevo);
    if (adentro) salir("balcones"); else setVista("balcones");
    avisar("Balcones", nuevo ? "Abiertos" : "Cerrados");
  };
  // De noche, para navegar van las luces de navegación (como manda el reglamento).
  const prender = (id, valor) => setLuces(l => ({ ...l, [id]: valor }));
  const cambiarLuz = luz => {
    const nuevo = !luces[luz.id];
    prender(luz.id, nuevo);
    avisar(luz.t, nuevo ? "Encendidas" : "Apagadas");
    if (nuevo && !noche) setHora(20.6);
  };
  const zarpar = () => {
    const nuevo = !navegando;
    setNavegando(nuevo);
    if (nuevo) {
      setBalcones(false);
      if (adentro) salir("popa"); else setVista("popa");
      setPestana(null);
      if (noche) prender("navegacion", true);
    }
    avisar(nuevo ? "Zarpando" : "Fondeado", nuevo ? "Rumbo al horizonte" : "Motores en neutro");
  };

  // Foto: el cuadro actual con la firma de la marca abajo.
  const foto = () => {
    const t = tres.current;
    if (!t) return;
    if (dibujar.current) dibujar.current();
    else t.gl.render(t.scene, t.camera);
    const src = t.gl.domElement;
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(src, 0, 0);
    const s = c.width / 1440;
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = `500 ${Math.round(16 * s)}px Outfit, system-ui, sans-serif`;
    ctx.letterSpacing = `${Math.round(6 * s)}px`;
    ctx.fillText("KLASE A", 40 * s, c.height - 46 * s);
    ctx.font = `300 ${Math.round(13 * s)}px Outfit, system-ui, sans-serif`;
    ctx.letterSpacing = `${Math.round(2 * s)}px`;
    ctx.fillText(`${nombre} · MARCANDO TENDENCIA`, 40 * s, c.height - 24 * s);
    c.toBlob(b => {
      if (!b) return;
      const url = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Klase-A-${nombre}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
    avisar("Foto", "Guardada en descargas");
  };

  const restablecer = () => {
    setEleccion(ELECCION_INICIAL); setHora(18.6); setClima("sol"); setBalcones(false); setLuces(APAGADAS); setNavegando(false);
    if (adentro) salir(); else setVista("tres");
    avisar("Configurador", "Como sale de fábrica");
  };

  const noche = hora < 6.3 || hora > 19.6;
  const tieneBalcones = !!geo?.balcones?.length;
  // El interior se recorre en los modelos que traen su interior y sus lugares.
  const lugares = geo?.aparte && cfg.pov ? cfg.pov : null;
  const lugar = lugares?.find(l => l.id === adentro) || null;
  const pestanas = PESTANAS.filter(p => p.id !== "interior" || lugares);
  const tocarPestana = id => {
    if (id === "interior" && !adentro && lugares) { irLugar(lugares[0]); setPestana(id); return; }
    setPestana(pestana === id ? null : id);
  };

  return (
    <div className="kx-cfg" role="dialog" aria-modal="true" aria-label={`Configurador ${nombre}`}>
      <div className="kx-cfg-lienzo">
        {error ? (
          <div className="kx-cfg-aviso">
            <p>{error === "webgl"
              ? "Este dispositivo no puede mostrar gráficos 3D."
              : "No pudimos cargar el modelo. Probá de nuevo en un rato."}</p>
          </div>
        ) : !geo ? (
          <div className="kx-cfg-aviso"><span className="kx-eyebrow">Preparando el configurador</span><i className="kx-rec-carga" /></div>
        ) : (
          <Canvas dpr={[1, 1.75]} shadows="soft" camera={{ fov: 32, near: 0.5, far: 5000, position: [-20, 12, 26] }} gl={{ antialias: true }}
            onCreated={({ gl, scene, camera }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 0.55;
              tres.current = { gl, scene, camera };
            }}>
            <Escena modelo={geo} cielos={cielos} eleccion={eleccion} vista={vista} hora={hora} clima={clima}
              balcones={balcones} luces={luces} navegando={navegando} indicador={indicador} intro={intro} renderRef={dibujar}
              colorSubacuatica={(COLORES_SUB.find(c => c.id === colorSub) || COLORES_SUB[1]).c}
              adentro={lugar} plafones={cfg.plafones} decoracion={cfg.decoracion}
              subir={pestana ? altoPanel / 2 + 24 : 0} />
          </Canvas>
        )}
        <div className="kx-cfg-velo" data-activo={velo} aria-hidden />
      </div>

      {/* Entrada: nombre del modelo, se va solo. */}
      {geo && intro && (
        <div className="kx-cfg-intro" aria-hidden>
          <span className="kx-eyebrow">Configurador · Marcando tendencia</span>
          <strong><span>{nombre}</span></strong>
        </div>
      )}

      <header className="kx-cfg-top">
        <span className="kx-marca-k">KLASE A</span>
        <span className="kx-eyebrow kx-solo-ancho" style={{ marginLeft: 18 }}>Configurador · {nombre}{propio ? "" : " (referencia)"}</span>
        <div className="kx-cfg-acciones">
          <button type="button" className="kx-cfg-redondo" onClick={restablecer} aria-label="Volver a la configuración de fábrica" title="Restablecer"><RotateCcw size={16} strokeWidth={1.5} /></button>
          <button type="button" className="kx-cfg-redondo" onClick={foto} disabled={!geo} aria-label="Guardar foto" title="Guardar foto"><Download size={16} strokeWidth={1.5} /></button>
          <button type="button" className="kx-cfg-redondo" onClick={onCerrar} aria-label="Cerrar el configurador"><X size={18} strokeWidth={1.5} /></button>
        </div>
      </header>

      {/* Rótulo de lo último elegido y velocímetro */}
      <div className="kx-cfg-rotulo" aria-live="polite">
        {aviso && (
          <div key={aviso.k}>
            <span className="kx-eyebrow">{aviso.eyebrow}</span>
            <strong>{aviso.t}</strong>
          </div>
        )}
      </div>
      <div className="kx-cfg-velocidad" data-activo={navegando} aria-hidden={!navegando}>
        <strong ref={indicador}>0</strong><span>nudos</span>
      </div>

      {geo && (
        <div className="kx-cfg-abajo">
          {pestana && (
            <section className="kx-cfg-panel" key={pestana} ref={medirPanel} aria-label={pestanas.find(p => p.id === pestana)?.t}>
              {pestana === "camara" && (
                <div className="kx-cfg-chips">
                  {VISTAS.filter(v => v.id !== "balcones" || tieneBalcones).map((v, i) => (
                    <button key={v.id} type="button" style={{ "--i": i }} aria-pressed={vista === v.id} onClick={() => irVista(v)}>{v.t}</button>
                  ))}
                </div>
              )}

              {pestana === "clima" && (
                <div className="kx-cfg-clima">
                  <div className="kx-cfg-climas">
                    {CLIMAS.map((c, i) => {
                      const Icono = c.id === "sol" ? (noche ? Moon : Sun) : c.id === "nubes" ? Cloud : CloudRain;
                      return (
                        <button key={c.id} type="button" style={{ "--i": i }} aria-pressed={clima === c.id}
                          onClick={() => { setClima(c.id); avisar("Clima", c.id === "sol" && noche ? "Despejado" : c.t); }}>
                          <Icono size={22} strokeWidth={1.25} /><span>{c.id === "sol" && noche ? "Despejado" : c.t}</span>
                        </button>
                      );
                    })}
                  </div>
                  <label className="kx-cfg-hora">
                    <span className="kx-eyebrow">Hora</span>
                    <strong>{textoHora(hora)}</strong>
                    <Sunrise size={15} strokeWidth={1.5} aria-hidden />
                    <input type="range" min={HORA_MIN} max={HORA_MAX} step={0.05} value={hora}
                      onChange={e => setHora(+e.target.value)} aria-label="Hora del día" />
                    <Moon size={15} strokeWidth={1.5} aria-hidden />
                  </label>
                  <div className="kx-cfg-momentos">
                    {[["Amanecer", 6.5], ["Mediodía", 12.6], ["Atardecer", 18.6], ["Noche", 21.2]].map(([t, h]) => (
                      <button key={t} type="button" onClick={() => { setHora(h); avisar("Hora", t); }}>{t}</button>
                    ))}
                  </div>
                </div>
              )}

              {pestana === "abrir" && (
                <div className="kx-cfg-tarjetas">
                  {tieneBalcones && (
                    <button type="button" className="kx-cfg-tarjeta" aria-pressed={balcones} onClick={abrirBalcones} style={{ "--i": 0 }}>
                      <Aperture size={20} strokeWidth={1.25} />
                      <span><strong>Balcones de popa</strong><small>Se rebaten a los costados y suman cubierta junto al agua.</small></span>
                      <i aria-hidden />
                    </button>
                  )}
                  {!tieneBalcones && <p className="kx-cfg-nada">Este modelo no tiene partes que se abran.</p>}
                </div>
              )}

              {pestana === "luces" && (
                <div className="kx-cfg-luces">
                <div className="kx-cfg-tarjetas">
                  {LUCES.map((luz, i) => {
                    const Icono = luz.i;
                    return (
                      <button key={luz.id} type="button" className="kx-cfg-tarjeta" aria-pressed={luces[luz.id]} style={{ "--i": i }} onClick={() => cambiarLuz(luz)}>
                        <Icono size={20} strokeWidth={1.25} />
                        <span><strong>{luz.t}</strong><small>{luz.d}</small></span>
                        <i aria-hidden />
                      </button>
                    );
                  })}
                </div>
                <div className="kx-cfg-sub" role="radiogroup" aria-label="Color de las luces subacuáticas">
                  <span className="kx-eyebrow">Subacuáticas</span>
                  {COLORES_SUB.map(c => (
                    <button key={c.id} type="button" role="radio" aria-checked={colorSub === c.id} style={{ "--c": c.c }}
                      onClick={() => { setColorSub(c.id); prender("agua", true); avisar("Subacuáticas", c.t); if (!noche) setHora(20.6); }}>
                      <i aria-hidden />{c.t}
                    </button>
                  ))}
                </div>
                </div>
              )}

              {pestana === "interior" && lugares && (
                <div className="kx-cfg-config">
                  <div className="kx-cfg-chips kx-cfg-lugares" role="group" aria-label="Lugares del interior">
                    {lugares.map((l, i) => (
                      <button key={l.id} type="button" style={{ "--i": i }} aria-pressed={adentro === l.id} onClick={() => irLugar(l)}>{l.t}</button>
                    ))}
                    <button type="button" className="kx-cfg-salir" style={{ "--i": lugares.length }} onClick={() => { salir(); setPestana(null); avisar("Cámara", "Exterior"); }}>Exterior</button>
                  </div>
                  <div className="kx-cfg-capas" role="tablist">
                    {[{ id: "ambientes", t: "Ambientes" }, ...CAPAS_INTERIOR].map(c => (
                      <button key={c.id} type="button" role="tab" aria-selected={capaInterior === c.id} onClick={() => setCapaInterior(c.id)}>{c.t}</button>
                    ))}
                  </div>
                  {capaInterior === "ambientes" ? (
                    <div className="kx-cfg-estilos" key="ambientes">
                      {AMBIENTES.map((amb, i) => {
                        const activo = CAPAS_INTERIOR.every(c => amb.e[c.id] === eleccion[c.id]);
                        return (
                          <button key={amb.id} type="button" style={{ "--i": i }} aria-pressed={activo} onClick={() => aplicarAmbiente(amb)}>
                            <span className="kx-cfg-mini">
                              {["tela", "mesada", "madera", "cojin"].map(id => {
                                const op = opcionDe(id, amb.e[id]);
                                return <i key={id} style={{ background: op.muestra || op.c }} />;
                              })}
                            </span>
                            <strong>{amb.t}</strong>
                            <small>{amb.d}</small>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Muestras key={capaInterior} capa={CAPAS.find(c => c.id === capaInterior)} eleccion={eleccion} elegir={elegir} />
                  )}
                </div>
              )}

              {pestana === "color" && (
                <div className="kx-cfg-config">
                  <div className="kx-cfg-capas" role="tablist">
                    {[{ id: "estilos", t: "Estilos" }, ...CAPAS_EXTERIOR].map(c => (
                      <button key={c.id} type="button" role="tab" aria-selected={capa === c.id} onClick={() => setCapa(c.id)}>{c.t}</button>
                    ))}
                  </div>
                  {capa === "estilos" ? (
                    <div className="kx-cfg-estilos" key="estilos">
                      {ESTILOS.map((est, i) => {
                        const activo = CAPAS_EXTERIOR.every(c => (est.e[c.id] ?? ELECCION_INICIAL[c.id]) === eleccion[c.id]);
                        return (
                          <button key={est.id} type="button" style={{ "--i": i }} aria-pressed={activo} onClick={() => aplicarEstilo(est)}>
                            <span className="kx-cfg-mini">
                              {["casco", "cubierta", "teca", "tapizado"].map(id => {
                                const op = opcionDe(id, est.e[id]);
                                return <i key={id} style={{ background: op.muestra || op.c }} />;
                              })}
                            </span>
                            <strong>{est.t}</strong>
                            <small>{est.d}</small>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Muestras key={capa} capa={CAPAS.find(c => c.id === capa)} eleccion={eleccion} elegir={elegir} />
                  )}
                </div>
              )}
            </section>
          )}

          <nav className="kx-cfg-dock" aria-label="Configurador">
            {pestanas.map(p => {
              const Icono = p.i;
              return (
                <button key={p.id} type="button" aria-expanded={pestana === p.id} data-dentro={p.id === "interior" && !!adentro}
                  onClick={() => tocarPestana(p.id)}>
                  <Icono size={16} strokeWidth={1.5} /><span>{p.t}</span>
                </button>
              );
            })}
            <button type="button" className="kx-cfg-zarpar" aria-pressed={navegando} onClick={zarpar}>
              <Sailboat size={16} strokeWidth={1.5} /><span>{navegando ? "Detener" : "Zarpar"}</span>
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
