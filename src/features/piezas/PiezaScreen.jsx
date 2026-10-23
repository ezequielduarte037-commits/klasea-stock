/* ═══════════════════════════════════════════════════════════════
   Visor de piezas · pantalla pública (/pieza/:token)
   Para mandar por link a quien tiene que ver una pieza en 3D desde el
   celular (un laminador, un proveedor): sin cuenta, directo a la pieza.
   El token es el nombre del .glb en public/piezas; ver
   scripts/pieza-a-glb.mjs para sumar una.
═══════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { CircleHelp, Layers, RotateCcw, Ruler, Scissors, X } from "lucide-react";
import LogoK from "@/components/ui/LogoK";
import BrandLoader from "@/components/ui/BrandLoader";
import VisorPieza from "./VisorPieza";
import { VISTA_DEL_CORTE, bajarPieza, cajaDe, leerPieza, mm, tokenValido } from "./pieza";

// El three.js del proyecto dibuja sólo con WebGL 2 (sin él, el lienzo no arranca).
function hayWebGL2() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

const VISTAS = [
  { id: "tres", t: "3D" },
  { id: "arriba", t: "Arriba" },
  { id: "abajo", t: "Abajo" },
  { id: "frente", t: "Frente" },
  { id: "atras", t: "Atrás" },
  { id: "costado", t: "Costado" },
];
const EJES = [
  { id: "largo", t: "Largo" },
  { id: "ancho", t: "Ancho" },
  { id: "alto", t: "Alto" },
];
const ERRORES = {
  link: "Este link no es válido. Pedíselo de nuevo a quien te lo mandó.",
  "no-encontrada": "No encontramos esta pieza. Puede que el link esté incompleto o que la hayan reemplazado: pedíselo de nuevo a quien te lo mandó.",
  webgl: "Este navegador no puede mostrar modelos 3D. Probá abrir el link con Chrome o Safari actualizados.",
  red: "No se pudo bajar la pieza. Revisá la conexión y volvé a intentar.",
};
const tactil = () => { try { return window.matchMedia("(pointer: coarse)").matches; } catch { return true; } };

export default function PiezaScreen() {
  const { token } = useParams();
  const [webgl] = useState(hayWebGL2);
  const [estado, setEstado] = useState(() => (
    !tokenValido(token) ? { fase: "error", motivo: "link" }
      : !webgl ? { fase: "error", motivo: "webgl" }
        : { fase: "cargando", avance: 0 }
  ));
  const [pieza, setPieza] = useState(null);
  const [visibles, setVisibles] = useState(() => new Set());
  const [pedido, setPedido] = useState({ vista: "tres", n: 0 });
  const [modo, setModo] = useState(null);
  const [corte, setCorte] = useState({ eje: "largo", t: 0.5 });
  const [puntos, setPuntos] = useState([]);
  const [hoja, setHoja] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [pista, setPista] = useState(true);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!tokenValido(token) || !webgl) return undefined;
    let vivo = true;
    bajarPieza(token, avance => { if (vivo) setEstado({ fase: "cargando", avance }); })
      .then(leerPieza)
      .then(p => {
        if (!vivo) return;
        setPieza(p);
        setVisibles(new Set(p.partes.filter(x => x.visible !== false).map(x => x.id)));
        setEstado({ fase: "lista" });
      })
      .catch(e => { if (vivo) setEstado({ fase: "error", motivo: e.message === "no-encontrada" ? "no-encontrada" : "red" }); });
    return () => { vivo = false; };
  }, [token, intento, webgl]);

  // Al salir de la pantalla se liberan mallas y materiales de la placa de video.
  useEffect(() => () => {
    pieza?.raiz.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  }, [pieza]);

  useEffect(() => {
    if (!pieza) return undefined;
    const antes = document.title;
    document.title = `${pieza.meta.titulo} ${pieza.meta.modelo || ""} · Klase A`.replace(/\s+·/, " ·");
    return () => { document.title = antes; };
  }, [pieza]);

  // La pista de los gestos se va sola a los 6 s (o al tocar la pieza).
  useEffect(() => {
    if (estado.fase !== "lista") return undefined;
    const t = window.setTimeout(() => setPista(false), 6000);
    return () => window.clearTimeout(t);
  }, [estado.fase]);

  const caja = useMemo(() => (pieza ? cajaDe(pieza.partes, visibles) : null), [pieza, visibles]);
  const medidas = caja && !caja.isEmpty() ? caja.getSize(new THREE.Vector3()) : null;
  const ir = vista => setPedido(p => ({ vista, n: p.n + 1 }));

  function cambiarModo(m) {
    const nuevo = modo === m ? null : m;
    setModo(nuevo);
    setPuntos([]);
    if (nuevo === "corte") ir(VISTA_DEL_CORTE[corte.eje]);
  }
  function elegirEje(eje) {
    setCorte(c => ({ ...c, eje }));
    ir(VISTA_DEL_CORTE[eje]);
  }
  const alternar = id => setVisibles(v => {
    const n = new Set(v);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const agregarPunto = p => setPuntos(ps => (ps.length >= 2 ? [p] : [...ps, p]));

  // Dónde está el corte, contado desde un extremo de la pieza.
  const posicionCorte = () => {
    if (!caja) return "";
    const tam = caja.getSize(new THREE.Vector3());
    if (corte.eje === "largo") return `a ${mm(tam.x * corte.t)} de proa`;
    if (corte.eje === "alto") return `a ${mm(tam.y * (1 - corte.t))} del piso`;
    const desdeCentro = (0.5 - corte.t) * tam.z;
    return Math.abs(desdeCentro) < 0.0005 ? "en el centro" : `a ${mm(Math.abs(desdeCentro))} del centro, ${desdeCentro > 0 ? "a estribor" : "a babor"}`;
  };

  if (estado.fase === "error") {
    return (
      <div className="pieza-root">
        <style>{CSS}</style>
        <div className="pieza-glow" />
        <div className="pieza-aviso" role="alert">
          <LogoK size={34} titulo="Klase A" />
          <div className="pieza-eyebrow">Klase A · Pieza 3D</div>
          <p>{ERRORES[estado.motivo]}</p>
          {estado.motivo === "red" && (
            <button type="button" className="ui-btn ui-btn-primario" onClick={() => { setEstado({ fase: "cargando", avance: 0 }); setIntento(i => i + 1); }}>
              Reintentar
            </button>
          )}
        </div>
      </div>
    );
  }

  if (estado.fase === "cargando") {
    return (
      <div className="pieza-root">
        <style>{CSS}</style>
        <div className="pieza-glow" />
        <BrandLoader label={`Cargando la pieza · ${Math.round(estado.avance * 100)} %`} />
      </div>
    );
  }

  const { meta, partes } = pieza;
  return (
    <div className="pieza-root">
      <style>{CSS}</style>
      <div className="pieza-glow" />
      <div className="pieza-lienzo" aria-label={`${meta.titulo} en 3D`} onPointerDown={() => setPista(false)}>
        <Canvas dpr={[1, 1.75]} shadows frameloop="demand" gl={{ antialias: true, alpha: true }} camera={{ fov: 35, near: 0.02, far: 400, position: [6, 4, 7] }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NeutralToneMapping;
            gl.toneMappingExposure = 1;
            gl.localClippingEnabled = true;
            gl.shadowMap.autoUpdate = false;
          }}>
          <VisorPieza pieza={pieza} visibles={visibles} pedido={pedido} modo={modo} corte={corte} puntos={puntos} onPunto={agregarPunto} />
        </Canvas>
      </div>

      <header className="pieza-cabeza">
        <div className="pieza-marca">
          <LogoK size={30} titulo="Klase A" />
          <div>
            <div className="pieza-eyebrow">Klase A · Pieza 3D</div>
            <h1>{meta.titulo}{meta.modelo && <span> {meta.modelo}</span>}</h1>
            {meta.codigo && <div className="pieza-codigo">{meta.codigo}</div>}
            {medidas && (
              <div className="pieza-tam" title="Largo × ancho × alto de lo que está a la vista">
                {mm(medidas.x).replace(" mm", "")} × {mm(medidas.z).replace(" mm", "")} × {mm(medidas.y)}
              </div>
            )}
          </div>
        </div>
        <button type="button" className="ui-btn ui-btn-icono pieza-flotante" aria-label="Cómo se usa" aria-expanded={ayuda} onClick={() => setAyuda(a => !a)}>
          {ayuda ? <X size={17} /> : <CircleHelp size={17} />}
        </button>
      </header>

      {ayuda && (
        <div className="pieza-ayuda">
          {tactil() ? (
            <ul>
              <li><b>Girar</b> arrastrá con un dedo</li>
              <li><b>Acercar</b> pellizcá con dos dedos</li>
              <li><b>Mover</b> arrastrá con dos dedos</li>
              <li><b>Centrar</b> doble toque sobre la pieza</li>
            </ul>
          ) : (
            <ul>
              <li><b>Girar</b> arrastrá con el botón izquierdo</li>
              <li><b>Acercar</b> la ruedita del mouse</li>
              <li><b>Mover</b> arrastrá con el botón derecho</li>
              <li><b>Centrar</b> doble clic sobre la pieza</li>
            </ul>
          )}
          <p>Largo × ancho × alto en milímetros, de las partes que estén a la vista.</p>
        </div>
      )}

      <div className="pieza-dock">
        {pista && !modo && <div className="pieza-pista">{tactil() ? "Un dedo gira · dos dedos acercan y mueven" : "Arrastrá para girar · ruedita para acercar"}</div>}
        {modo === "medir" && (
          <div className="pieza-contexto" aria-live="polite">
            {puntos.length < 2 ? (
              <span>{puntos.length === 0 ? "Tocá un punto de la pieza" : "Tocá el segundo punto"}</span>
            ) : (
              <>
                <span>Distancia <b className="pieza-num">{mm(puntos[0].distanceTo(puntos[1]))}</b></span>
                <button type="button" className="ui-btn pieza-chico" onClick={() => setPuntos([])}>Borrar</button>
              </>
            )}
          </div>
        )}
        {modo === "corte" && (
          <div className="pieza-contexto pieza-corte">
            <div className="pieza-segmentos" role="radiogroup" aria-label="Dirección del corte">
              {EJES.map(e => (
                <button key={e.id} type="button" role="radio" aria-checked={corte.eje === e.id} className={corte.eje === e.id ? "is-activo" : ""} onClick={() => elegirEje(e.id)}>{e.t}</button>
              ))}
            </div>
            <input type="range" min="0" max="1" step="0.002" value={corte.t} aria-label="Posición del corte" onChange={e => setCorte(c => ({ ...c, t: +e.target.value }))} />
            <span className="pieza-num pieza-donde">{posicionCorte()}</span>
          </div>
        )}
        <div className="pieza-vistas" role="toolbar" aria-label="Vistas">
          {VISTAS.map(v => (
            <button key={v.id} type="button" className={`pieza-chip${pedido.vista === v.id ? " is-activo" : ""}`} onClick={() => ir(v.id)}>{v.t}</button>
          ))}
        </div>
        <div className="pieza-herramientas">
          <button type="button" className="ui-btn" onClick={() => setHoja(true)}><Layers size={16} /> Partes</button>
          <button type="button" className={`ui-btn${modo === "medir" ? " ui-btn-suave" : ""}`} aria-pressed={modo === "medir"} onClick={() => cambiarModo("medir")}><Ruler size={16} /> Medir</button>
          <button type="button" className={`ui-btn${modo === "corte" ? " ui-btn-suave" : ""}`} aria-pressed={modo === "corte"} onClick={() => cambiarModo("corte")}><Scissors size={16} /> Corte</button>
          <button type="button" className="ui-btn ui-btn-icono" aria-label="Volver a la vista inicial" onClick={() => { setModo(null); setPuntos([]); ir("tres"); }}><RotateCcw size={16} /></button>
        </div>
      </div>

      {hoja && (
        <div className="pieza-velo" onClick={() => setHoja(false)}>
          <div className="pieza-hoja" role="dialog" aria-label="Partes de la pieza" onClick={e => e.stopPropagation()}>
            <div className="pieza-hoja-cabeza">
              <div>
                <div className="pieza-eyebrow">Partes</div>
                <div className="pieza-hoja-titulo">Qué se ve</div>
              </div>
              <button type="button" className="ui-btn ui-btn-icono ui-btn-fantasma" aria-label="Cerrar" onClick={() => setHoja(false)}><X size={18} /></button>
            </div>
            <div className="pieza-lista">
              {partes.map(p => (
                <button key={p.id} type="button" role="switch" aria-checked={visibles.has(p.id)} className="pieza-parte" onClick={() => alternar(p.id)}>
                  <span className="pieza-muestra" style={{ background: p.color, opacity: p.opacidad != null ? 0.7 : 1 }} />
                  <span className="pieza-parte-nombre">{p.nombre}</span>
                  <span className="pieza-interruptor" aria-hidden="true"><i /></span>
                </button>
              ))}
            </div>
            <button type="button" className="ui-btn" style={{ width: "100%" }} onClick={() => setVisibles(new Set(partes.map(p => p.id)))}>Mostrar todas</button>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
  .pieza-root {
    position: fixed; inset: 0; overflow: hidden;
    background: var(--bg); color: var(--text);
    font-family: 'Outfit', system-ui, sans-serif;
    -webkit-user-select: none; user-select: none;
  }
  .pieza-root .pieza-glow {
    position: absolute; top: -20%; left: 50%; transform: translateX(-50%);
    width: 820px; height: 520px; border-radius: 50%; pointer-events: none;
    background: radial-gradient(ellipse, var(--glow-a) 0%, transparent 70%);
  }
  .pieza-root .pieza-lienzo {
    position: absolute; inset: 0; touch-action: none;
    background: radial-gradient(ellipse 120% 90% at 50% 46%, var(--visor-centro) 0%, var(--visor-borde) 100%);
  }
  .pieza-root .pieza-eyebrow {
    font-size: 10.5px; font-weight: 650; letter-spacing: .14em; text-transform: uppercase; color: var(--dim);
  }
  .pieza-root .pieza-num { font-family: 'JetBrains Mono', monospace; font-weight: 500; }

  .pieza-root .pieza-cabeza {
    position: absolute; top: 0; left: 0; right: 0; z-index: 2;
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
    padding: calc(env(safe-area-inset-top) + 14px) 16px 28px;
    background: linear-gradient(to bottom, var(--home-fade-strong), transparent);
    pointer-events: none;
  }
  .pieza-root .pieza-marca { display: flex; align-items: flex-start; gap: 11px; }
  .pieza-root .pieza-marca h1 { margin: 3px 0 0; font-size: 22px; font-weight: 700; line-height: 1.1; letter-spacing: -.01em; }
  .pieza-root .pieza-marca h1 span { color: var(--dim); font-weight: 500; }
  .pieza-root .pieza-codigo { margin-top: 4px; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--muted); }
  .pieza-root .pieza-tam {
    display: inline-flex; margin-top: 8px; padding: 4px 9px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--panel);
    font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--muted);
  }
  .pieza-root .pieza-flotante { pointer-events: auto; background: var(--topbar-soft); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter); }

  .pieza-root .pieza-ayuda {
    position: absolute; z-index: 3; right: 16px; top: calc(env(safe-area-inset-top) + 60px);
    width: min(300px, calc(100vw - 32px)); padding: 14px 16px; border-radius: 14px;
    border: 1px solid var(--border-2); background: var(--panel-solid); box-shadow: var(--elev-2);
    font-size: 13.5px; color: var(--muted);
    animation: piezaEntra .22s cubic-bezier(.22,1,.36,1) both;
  }
  .pieza-root .pieza-ayuda ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
  .pieza-root .pieza-ayuda b { display: inline-block; min-width: 64px; color: var(--text); font-weight: 600; }
  .pieza-root .pieza-ayuda p { margin: 11px 0 0; font-size: 12px; color: var(--dim); line-height: 1.45; }

  .pieza-root .pieza-dock {
    position: absolute; z-index: 2; left: 12px; right: 12px; bottom: calc(env(safe-area-inset-bottom) + 12px);
    max-width: 560px; margin: 0 auto; display: grid; gap: 8px;
  }
  .pieza-root .pieza-pista {
    justify-self: center; padding: 7px 13px; border-radius: 999px;
    background: var(--topbar-soft); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter);
    border: 1px solid var(--border); font-size: 12.5px; color: var(--muted);
    animation: piezaEntra .4s cubic-bezier(.22,1,.36,1) both;
  }
  .pieza-root .pieza-contexto,
  .pieza-root .pieza-vistas,
  .pieza-root .pieza-herramientas {
    border: 1px solid var(--border); border-radius: 16px;
    background: var(--topbar-soft); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter);
    box-shadow: var(--elev-2);
  }
  .pieza-root .pieza-contexto {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    min-height: 50px; padding: 6px 8px 6px 14px; font-size: 14px; color: var(--muted);
    animation: piezaEntra .25s cubic-bezier(.22,1,.36,1) both;
  }
  .pieza-root .pieza-contexto b { color: var(--text); font-size: 15px; }
  .pieza-root .pieza-chico { min-height: 36px; }
  .pieza-root .pieza-corte { flex-wrap: wrap; padding: 8px 12px 10px; }
  .pieza-root .pieza-corte input[type="range"] { flex: 1 1 100%; order: 3; accent-color: var(--cyan); height: 30px; margin: 0; }
  .pieza-root .pieza-donde { font-size: 12px; color: var(--muted); }
  .pieza-root .pieza-segmentos { display: inline-flex; padding: 3px; border-radius: 11px; background: var(--panel); border: 1px solid var(--border); }
  .pieza-root .pieza-segmentos button {
    min-height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent;
    color: var(--muted); font: inherit; font-size: 13px; font-weight: 600;
  }
  .pieza-root .pieza-segmentos button.is-activo { background: var(--panel-3); color: var(--text); }

  .pieza-root .pieza-vistas {
    display: flex; gap: 6px; padding: 6px; overflow-x: auto; scrollbar-width: none;
    -webkit-mask-image: linear-gradient(to right, transparent 0, #000 10px, #000 calc(100% - 14px), transparent 100%);
    mask-image: linear-gradient(to right, transparent 0, #000 10px, #000 calc(100% - 14px), transparent 100%);
  }
  .pieza-root .pieza-vistas::-webkit-scrollbar { display: none; }
  .pieza-root .pieza-chip {
    flex: 0 0 auto; min-height: 38px; padding: 0 15px; border-radius: 11px;
    border: 1px solid transparent; background: transparent; color: var(--muted);
    font: inherit; font-size: 13.5px; font-weight: 600; white-space: nowrap;
    transition: background-color .15s, color .15s, border-color .15s;
  }
  .pieza-root .pieza-chip.is-activo { background: var(--panel-3); border-color: var(--border-2); color: var(--text); }
  .pieza-root .pieza-herramientas { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 6px; padding: 6px; }
  .pieza-root .pieza-herramientas .ui-btn { min-height: 42px; padding: 0 10px; }

  /* Celular acostado: vistas y herramientas en una sola fila. */
  @media (orientation: landscape) and (max-height: 520px) {
    .pieza-root .pieza-cabeza { padding-top: calc(env(safe-area-inset-top) + 10px); }
    .pieza-root .pieza-marca h1 { font-size: 19px; }
    .pieza-root .pieza-dock {
      max-width: 860px; grid-template-columns: minmax(0, 1fr) auto; align-items: end;
      left: calc(env(safe-area-inset-left) + 12px); right: calc(env(safe-area-inset-right) + 12px);
    }
    .pieza-root .pieza-pista,
    .pieza-root .pieza-contexto { grid-column: 1 / -1; }
    .pieza-root .pieza-herramientas { grid-template-columns: repeat(3, auto) auto; }
  }

  .pieza-root .pieza-medida {
    padding: 5px 10px; border-radius: 999px; white-space: nowrap; pointer-events: none;
    background: var(--panel-solid); border: 1px solid var(--cyan-border); color: var(--text);
    font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 500; box-shadow: var(--elev-1);
  }

  .pieza-root .pieza-velo {
    position: absolute; inset: 0; z-index: 4; background: var(--overlay);
    display: flex; align-items: flex-end; justify-content: center;
    animation: piezaVelo .2s ease both;
  }
  .pieza-root .pieza-hoja {
    width: 100%; max-width: 480px; max-height: 78%; overflow-y: auto;
    padding: 16px 16px calc(env(safe-area-inset-bottom) + 16px);
    border-radius: 18px 18px 0 0; border: 1px solid var(--border-2); border-bottom: 0;
    background: var(--panel-solid); box-shadow: var(--elev-2);
    animation: piezaSube .32s cubic-bezier(.22,1,.36,1) both;
  }
  @media (min-width: 641px) {
    .pieza-root .pieza-velo { align-items: center; }
    .pieza-root .pieza-hoja { border-radius: 18px; border-bottom: 1px solid var(--border-2); padding-bottom: 16px; }
  }
  .pieza-root .pieza-hoja-cabeza { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; }
  .pieza-root .pieza-hoja-titulo { margin-top: 3px; font-size: 18px; font-weight: 650; }
  .pieza-root .pieza-lista { display: grid; gap: 4px; margin-bottom: 12px; }
  .pieza-root .pieza-parte {
    display: flex; align-items: center; gap: 12px; min-height: 50px; padding: 0 12px;
    border: 1px solid transparent; border-radius: 12px; background: transparent; color: var(--text);
    font: inherit; font-size: 15px; text-align: left;
  }
  .pieza-root .pieza-parte:hover { background: var(--panel); }
  .pieza-root .pieza-muestra { width: 20px; height: 20px; border-radius: 6px; border: 1px solid var(--border-2); flex: 0 0 auto; }
  .pieza-root .pieza-parte-nombre { flex: 1; }
  .pieza-root .pieza-parte[aria-checked="false"] .pieza-parte-nombre { color: var(--dim); }
  .pieza-root .pieza-interruptor {
    position: relative; width: 40px; height: 24px; border-radius: 999px; flex: 0 0 auto;
    background: var(--panel-3); border: 1px solid var(--border-2); transition: background-color .18s, border-color .18s;
  }
  .pieza-root .pieza-interruptor i {
    position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
    background: var(--dim); transition: transform .2s cubic-bezier(.22,1,.36,1), background-color .18s;
  }
  .pieza-root .pieza-parte[aria-checked="true"] .pieza-interruptor { background: var(--blue-soft); border-color: var(--blue-border); }
  .pieza-root .pieza-parte[aria-checked="true"] .pieza-interruptor i { transform: translateX(16px); background: var(--blue); }

  .pieza-root .pieza-aviso {
    position: relative; z-index: 1; max-width: 380px; margin: 0 auto; padding: 0 24px;
    min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center;
  }
  .pieza-root .pieza-aviso p { margin: 0 0 6px; font-size: 15px; line-height: 1.5; color: var(--muted); }

  @keyframes piezaEntra { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes piezaSube { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes piezaVelo { from { opacity: 0; } to { opacity: 1; } }
`;
