/* ═══════════════════════════════════════════════════════════════
   Recorrido 3D · pantalla
   Once estaciones con la cámara que viaja por el barco, números sobre
   cada punto y una vista interior (casco transparente) para lo que
   está bajo cubierta. Blanco y negro, en el tono del manual.
═══════════════════════════════════════════════════════════════ */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, Html, MeshReflectorMaterial, OrbitControls } from "@react-three/drei";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import * as THREE from "three";
import { ArrowLeft, ArrowRight, Check, Palette, X } from "lucide-react";
import { leerMovimientoReducido } from "@/components/ui/useReducedMotion";
import { planoDe, modelo3dDe } from "../unidad";
import { leerJson, guardarJson } from "../almacen";
import { LARGO, leerPlano, armarCasco, texturaPlano, cargarModelo, texturaTeca, texturaRoble, texturaFoto, prepararLienzo, coloresDelTono, materialDe, INTERIOR } from "./barco";
import { ESTACIONES } from "./estaciones";

const VISTOS_KEY = "ka_recorrido_vistos";
const pad = n => String(n).padStart(2, "0");

// Probador de colores y materiales: sólo para probar. Aparece en el servidor
// local, en el panel de los clientes del K43 tender (para probarlo ya
// montado) o agregando ?probar a la dirección; no guarda nada en la base.
const Probador3D = lazy(() => import("./Probador3D"));
// ka_probar lo anota unidad.js al entrar con ?probar: el manual reescribe la
// dirección al navegar entre capítulos y el parámetro se pierde.
const puedeProbar = (modelo) => {
  if (import.meta.env.DEV) return true;
  if (String(modelo || "").match(/(\d{2})/)?.[1] === "43") return true;
  try {
    return new URLSearchParams(window.location.search).has("probar") || sessionStorage.getItem("ka_probar") === "1";
  } catch {
    return false;
  }
};

const PALETAS = {
  dia:   { fondo: "#f4f4f2", casco: "#ffffff", linea: "#0b0b0b", plano: "#0b0b0b", suave: "#c9c9c4", agua: "#f4f4f2" },
  noche: { fondo: "#0b0b0b", casco: "#1b1b1b", linea: "#e9e9e6", plano: "#f2f2f0", suave: "#3a3a3a", agua: "#0b0b0b" },
};

function hayWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/* Puntos de la estación: los que dependen de un equipo del modelo real sólo
   aparecen si ese modelo lo tiene. */
function puntosDe(est, geo) {
  return est.puntos.filter(p => !p.soloAncla || geo?.anclas?.[p.ancla]);
}

/* Anota la estación como vista (en este dispositivo). */
function marcar(vistos, id) {
  if (vistos.has(id)) return vistos;
  const n = new Set(vistos).add(id);
  guardarJson(VISTOS_KEY, [...n]);
  return n;
}

/* Punto del barco en coordenadas de mundo. */
function ubicar(geo, { u, lado = 0, alto = 0, ancla }) {
  // Si el modelo real trae ese equipo, el punto va exactamente ahí.
  const a = ancla && geo.anclas?.[ancla];
  if (a) return [a[0], a[1] + geo.D * 0.12, a[2]];
  const s = geo.enU(u);
  return [s.x, s.cubierta + alto * geo.D, s.zc + lado * s.media];
}

export default function Recorrido3D({ modelo, tono, onCerrar }) {
  const [idx, setIdx] = useState(0);
  const [interiorManual, setInteriorManual] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [plano, setPlano] = useState(null);
  const [error, setError] = useState(() => (hayWebGL() ? null : "webgl"));
  const [vistos, setVistos] = useState(() => marcar(new Set(leerJson(VISTOS_KEY, [])), ESTACIONES[0].id));
  const [probando, setProbando] = useState(false);
  const [conProbador] = useState(() => puedeProbar(modelo));
  const est = ESTACIONES[idx];
  const interior = interiorManual ?? est.interior;
  // Con un modelo interior aparte, el cambio de vista pasa por un fundido:
  // la pantalla se vela, se cambia de modelo y se revela.
  const [vista, setVista] = useState(interior);
  const [velo, setVelo] = useState(false);
  const conVelo = plano?.tipo === "real" && !!plano.modelo.aparte;
  useEffect(() => {
    if (!conVelo || vista === interior) return undefined;
    const quieto = leerMovimientoReducido();
    const a = setTimeout(() => setVelo(true), 0);
    const b = setTimeout(() => { setVista(interior); setVelo(false); }, quieto ? 0 : 340);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [conVelo, interior, vista]);
  const enEscena = conVelo ? vista : interior;
  const pal = PALETAS[tono === "noche" ? "noche" : "dia"];

  useEffect(() => {
    if (error) return undefined;
    let vivo = true;
    const { src, espejo } = planoDe(modelo);
    const conPlano = () => leerPlano(src, espejo)
      .then(p => { if (vivo) setPlano({ tipo: "plano", plano: p }); })
      .catch(() => { if (vivo) setError("plano"); });
    // Si la línea tiene modelo 3D real se usa ese; si falla, el casco del plano.
    const cfg = modelo3dDe(modelo);
    if (cfg) cargarModelo(cfg).then(m => { if (vivo) setPlano({ tipo: "real", modelo: m }); }).catch(conPlano);
    else conPlano();
    return () => { vivo = false; };
  }, [modelo, error]);

  const ir = (n) => {
    const i = Math.max(0, Math.min(ESTACIONES.length - 1, n));
    setIdx(i);
    setVistos(prev => marcar(prev, ESTACIONES[i].id));
    setAbierto(null);
    setInteriorManual(null);
  };

  useEffect(() => {
    const onKey = (e) => {
      // Con el probador abierto las teclas son suyas.
      if (probando) return;
      if (e.key === "Escape") onCerrar();
      if (e.key === "ArrowRight") ir(idx + 1);
      if (e.key === "ArrowLeft") ir(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const ultima = idx === ESTACIONES.length - 1;
  const puntos = puntosDe(est, plano?.tipo === "real" ? plano.modelo : null);

  // El probador reemplaza al recorrido (un solo lienzo 3D a la vez).
  if (probando) {
    return (
      <Suspense fallback={<div className="kx-rec"><div className="kx-rec-aviso"><span className="kx-eyebrow">Preparando el probador</span><i className="kx-rec-carga" /></div></div>}>
        <Probador3D modelo={modelo} tono={tono} onCerrar={() => setProbando(false)} />
      </Suspense>
    );
  }

  return (
    <div className="kx-rec" role="dialog" aria-modal="true" aria-label="Recorrido 3D">
      <div className="kx-rec-lienzo">
        {error ? (
          <div className="kx-rec-aviso">
            <p className="kx-p">{error === "webgl"
              ? "Este dispositivo no puede mostrar gráficos 3D. El recorrido se puede leer igual, estación por estación."
              : "No pudimos cargar el plano de tu modelo. El recorrido se puede leer igual, estación por estación."}</p>
          </div>
        ) : !plano ? (
          <div className="kx-rec-aviso"><span className="kx-eyebrow">Preparando el modelo</span><i className="kx-rec-carga" /></div>
        ) : (
          <Canvas dpr={[1, 1.75]} camera={{ fov: 30, near: 0.1, far: 200, position: [9, 5, 9] }} gl={{ antialias: true }}
            shadows={plano.tipo === "real" && plano.modelo.aparte ? "soft" : false}
            onCreated={({ gl }) => prepararLienzo(gl)}>
            <Escena plano={plano} pal={pal} est={est} interior={enEscena} abierto={abierto} onPunto={setAbierto} />
          </Canvas>
        )}
        {conVelo && <div className="kx-rec-velo" data-activo={velo} aria-hidden />}
      </div>

      <header className="kx-rec-top">
        <span className="kx-marca-k">KLASE A</span>
        <span className="kx-eyebrow kx-solo-ancho" style={{ marginLeft: 18 }}>Recorrido 3D · {modelo || "Klase A"}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {!error && conProbador && (
            <button type="button" className="kx-rec-interruptor" onClick={() => setProbando(true)} title="Probar colores y materiales (sólo para pruebas)">
              <Palette size={14} strokeWidth={1.5} aria-hidden />Probar
            </button>
          )}
          {!error && (
            <button type="button" className="kx-rec-interruptor" role="switch" aria-checked={interior} onClick={() => setInteriorManual(!interior)}>
              <i aria-hidden />Vista interior
            </button>
          )}
          <button type="button" className="kx-redondo" aria-label="Cerrar recorrido" onClick={onCerrar}><X size={18} strokeWidth={1.5} /></button>
        </div>
      </header>

      <aside className="kx-rec-panel" key={est.id}>
        <div className="kx-eyebrow">Estación {pad(idx + 1)} / {pad(ESTACIONES.length)}</div>
        <h2 className="kx-rec-t">{est.titulo}</h2>
        <p className="kx-p">{est.bajada}</p>
        <ol className="kx-rec-pasos">
          {est.pasos.map((p, i) => (
            <li key={p} style={{ "--i": i }}>
              <span className="kx-mono">{pad(i + 1)}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
        {puntos.length > 0 && (
          <div className="kx-rec-refs">
            <div className="kx-eyebrow" style={{ marginBottom: 8 }}>En el barco</div>
            {puntos.map((p, i) => (
              <div key={p.t}>
                <button type="button" className="kx-rec-ref" aria-pressed={abierto === i} onClick={() => setAbierto(abierto === i ? null : i)}>
                  <b>{i + 1}</b>{p.t}
                </button>
                {abierto === i && <p className="kx-rec-ref-d">{p.d}</p>}
              </div>
            ))}
            <p className="kx-ayuda" style={{ marginTop: 12 }}>Las ubicaciones son de referencia y pueden variar según la unidad.</p>
          </div>
        )}
      </aside>

      <nav className="kx-rec-pie" aria-label="Estaciones">
        <button type="button" className="kx-redondo" aria-label="Estación anterior" disabled={idx === 0} onClick={() => ir(idx - 1)}>
          <ArrowLeft size={18} strokeWidth={1.5} />
        </button>
        <ol className="kx-rec-chips">
          {ESTACIONES.map((e, i) => (
            <li key={e.id}>
              <button type="button" aria-current={i === idx ? "step" : undefined} data-visto={vistos.has(e.id) ? "1" : "0"} onClick={() => ir(i)}>
                <span className="kx-mono">{pad(i + 1)}</span>{e.nav}
              </button>
            </li>
          ))}
        </ol>
        {ultima ? (
          <button type="button" className="kx-btn kx-btn-chico" onClick={onCerrar}><Check size={15} strokeWidth={1.5} /> Terminar</button>
        ) : (
          <button type="button" className="kx-redondo" aria-label="Estación siguiente" onClick={() => ir(idx + 1)} style={{ background: "var(--kx-fg)", color: "var(--kx-bg)" }}>
            <ArrowRight size={18} strokeWidth={1.5} />
          </button>
        )}
      </nav>
    </div>
  );
}

/* ─────────────── Escena ─────────────── */
function Escena({ plano: fuente, pal, est, interior, abierto, onPunto }) {
  const geo = useMemo(() => (fuente.tipo === "real" ? fuente.modelo : armarCasco(fuente.plano)), [fuente]);

  return (
    <>
      <Luces pal={pal} sombra={!!geo.aparte} />
      {geo.real
        ? <BarcoReal modelo={geo} pal={pal} interior={interior} />
        : <BarcoPlano geo={geo} plano={fuente.plano} pal={pal} interior={interior} />}
      {/* En la vista interior el agua se desmonta (no alcanza con ocultarla: el
          reflejo sigue recortando todo lo que está bajo la flotación, y ahí está
          el camarote de popa). */}
      {!interior && <Agua pal={pal} />}
      <Estudio />
      <Oclusion activa={interior && !!geo.aparte} />
      {puntosDe(est, geo).map((p, i) => (
        <Punto key={`${est.id}-${p.t}`} n={i + 1} pos={ubicar(geo, p)} p={p} abierto={abierto === i} onClick={() => onPunto(abierto === i ? null : i)} />
      ))}
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08}
        minDistance={LARGO * 0.12} maxDistance={LARGO * 2.4} maxPolarAngle={Math.PI / 2 - 0.04} />
      <Camara geo={geo} est={est} interior={interior} />
    </>
  );
}

/* Fondo, niebla y luces: las mismas en el recorrido y en el probador. La
   sombra sólo se prende con interior aparte (K43): en el resto no aporta y
   cuesta memoria y shaders más pesados, sobre todo en el celular. */
function Luces({ pal, sombra }) {
  return (
    <>
      <color attach="background" args={[pal.fondo]} />
      <fog attach="fog" args={[pal.fondo, LARGO * 1.6, LARGO * 4]} />
      <ambientLight intensity={pal === PALETAS.noche ? 0.55 : 0.85} />
      <hemisphereLight args={["#ffffff", "#cfd4d6", 0.55]} />
      {/* La luz principal da sombra sólo sobre el interior aparte (K43): los
          mamparos y los muebles se apoyan en el piso en vez de flotar. */}
      <directionalLight position={[6, 12, 8]} intensity={1.15} castShadow={sombra}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-radius={4}
        shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6}
        shadow-camera-near={1} shadow-camera-far={40} />
      <directionalLight position={[-8, 5, -6]} intensity={0.35} />
    </>
  );
}

/* Escena del probador (Probador3D): el mismo barco, luces, agua y oclusión
   que el recorrido, sin estaciones ni puntos. alCrearMateriales recibe los
   materiales por acabado para poder cambiarlos en vivo. children va justo
   después del barco: sus efectos corren después de que el barco retoca los
   colores del tono, en la misma pasada. */
export function EscenaProbador({ modelo, tono, interior, agua, oclusion, alCrearMateriales, children }) {
  const pal = PALETAS[tono === "noche" ? "noche" : "dia"];
  return (
    <>
      <Luces pal={pal} sombra={!!modelo.aparte} />
      <BarcoReal modelo={modelo} pal={pal} interior={interior} alCrearMateriales={alCrearMateriales} />
      {children}
      {!interior && agua && <Agua pal={pal} />}
      <Estudio />
      <Oclusion activa={interior && oclusion && !!modelo.aparte} />
    </>
  );
}

function BarcoPlano({ geo, plano, pal, interior }) {
  const textura = useMemo(() => texturaPlano(plano, pal.plano), [plano, pal.plano]);
  useEffect(() => () => textura.dispose(), [textura]);
  useEffect(() => () => { geo.casco.dispose(); geo.cubierta.dispose(); }, [geo]);
  return <Barco geo={geo} textura={textura} pal={pal} interior={interior} />;
}

/* Luz de estudio para los reflejos (sin descargar ningún HDR). */
function Estudio() {
  const get = useThree(st => st.get);
  useEffect(() => {
    const { gl, scene: escena } = get();
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    escena.environment = env;
    escena.environmentIntensity = 0.55;
    return () => { escena.environment = null; env.dispose(); pmrem.dispose(); };
  }, [get]);
  return null;
}

/* Oclusión ambiental (GTAO) en la vista interior: oscurece los rincones, el
   encuentro de mamparos y piso y lo que queda debajo de colchones y almohadones.
   Sin ella el interior, iluminado parejo desde arriba, se veía chato, como un
   plano de CAD. Sólo con el interior aparte (K43): el corte del K64 es un plano
   de recorte, y la pasada de normales del GTAO no lo respeta. */
function Oclusion({ activa }) {
  const gl = useThree(st => st.gl);
  const escena = useThree(st => st.scene);
  const camara = useThree(st => st.camera);
  const size = useThree(st => st.size);
  const chico = size.width < 900;
  const efecto = useMemo(() => {
    // Destino con MSAA: al dibujar en un render target se pierde el antialias del lienzo.
    const destino = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(gl, destino);
    const ao = new GTAOPass(escena, camara, 1, 1);
    // Radio en unidades de la escena (LARGO = 10 es la eslora): unos 50 cm reales.
    ao.updateGtaoMaterial({ radius: 0.38, distanceExponent: 1.5, thickness: 2, scale: 1.35, samples: chico ? 8 : 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: chico ? 8 : 16 });
    ao.blendIntensity = 0.95;
    const pasadas = [new RenderPass(escena, camara), ao, new OutputPass()];
    pasadas.forEach(p => composer.addPass(p));
    return { composer, pasadas };
  }, [gl, escena, camara, chico]);
  useEffect(() => {
    efecto.composer.setPixelRatio(gl.getPixelRatio());
    efecto.composer.setSize(size.width, size.height);
  }, [efecto, gl, size]);
  useEffect(() => () => {
    efecto.pasadas.forEach(p => p.dispose?.());
    efecto.composer.dispose();
  }, [efecto]);
  // Prioridad 1: desde acá se dibuja cada cuadro (R3F deja de hacerlo solo).
  const compensado = useRef({ clave: "", color: null });
  useFrame(({ scene }, dt) => {
    if (!activa) {
      gl.render(escena, camara);
      return;
    }
    // Dibujado directo, el fondo no pasa por el tone mapping; con el
    // composer sí (lo aplica el OutputPass a toda la imagen). Se le da el
    // color que, después del tone mapping, vuelve a ser el fondo de siempre.
    const fondo = scene.background;
    if (fondo?.isColor) {
      const clave = `${fondo.getHexString()}|${gl.toneMappingExposure}`;
      if (compensado.current.clave !== clave) compensado.current = { clave, color: fondoCompensado(fondo, gl.toneMappingExposure) };
      scene.background = compensado.current.color;
    }
    efecto.composer.render(dt);
    scene.background = fondo;
  }, 1);
  return null;
}

/* NeutralToneMapping de three, la misma cuenta que el shader, sobre un color
   lineal. */
function tonoNeutro([r0, g0, b0], exposicion) {
  let [r, g, b] = [r0 * exposicion, g0 * exposicion, b0 * exposicion];
  const x = Math.min(r, g, b);
  const corrimiento = x < 0.08 ? x - 6.25 * x * x : 0.04;
  r -= corrimiento; g -= corrimiento; b -= corrimiento;
  const pico = Math.max(r, g, b);
  const inicio = 0.8 - 0.04;
  if (pico < inicio) return [r, g, b];
  const d = 1 - inicio;
  const nuevo = 1 - (d * d) / (pico + d - inicio);
  const desatura = 1 - 1 / (0.15 * (pico - nuevo) + 1);
  return [r, g, b].map(v => v * (nuevo / pico) * (1 - desatura) + nuevo * desatura);
}

/* El color de entrada que, pasado por el tone mapping, da el fondo pedido. */
function fondoCompensado(fondo, exposicion) {
  const meta = [fondo.r, fondo.g, fondo.b];
  let c = meta.slice();
  for (let i = 0; i < 80; i++) {
    const t = tonoNeutro(c, exposicion);
    c = c.map((v, k) => Math.max(0, v + (meta[k] - t[k]) * 1.2));
  }
  return new THREE.Color(c[0], c[1], c[2]);
}

/* Modelo real exportado de Rhino. Cada pieza trae el nombre de su acabado
   (casco, fondo, cubierta, teca, cromo, negro, vidrios, tapizado, detalle,
   interior). */
// tex: textura de color; relieve: mapa de normales (foto); m: metros por imagen.
const ACABADOS = {
  casco:    { color: "#ffffff", roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2 },
  cubierta: { color: "#f6f6f3", roughness: 0.6 },
  fondo:    { color: "#2a2c2e", roughness: 0.85 },
  teca:     { color: "#ffffff", roughness: 0.72, tex: "teca", relieve: "oak_veneer_01", m: 1, adelante: true },
  cromo:    { color: "#e4e4e4", metalness: 1, roughness: 0.16 },
  negro:    { color: "#2f3235", roughness: 0.32, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 },
  // Vidrio y acrílico: transmisión real, ahumado como en los renders.
  vidrios:  { color: "#b7c0c6", roughness: 0.03, transmission: 0.9, thickness: 0.03, ior: 1.5, atenuacion: "#0e1316", clearcoat: 1, clearcoatRoughness: 0.03 },
  // Cuero caramelo afuera (como en el render), lana espigada gris topo adentro.
  tapizado: { color: "#efe4d8", roughness: 0.55, tex: "fabric_leather_02", relieve: "fabric_leather_02", m: 0.8, clearcoat: 0.15, clearcoatRoughness: 0.5 },
  almohadon: { color: "#f2eee7", roughness: 0.95, relieve: "poly_wool_herringbone", m: 0.25, sheen: 0.6 },
  // Posavasos: acrílico gris humo, pulido.
  acrilico: { color: "#8e959a", roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04 },
  detalle:  { color: "#3a3a3a", roughness: 0.4 },
  // Interior: roble natural neutro con la veta marcada y barniz satinado,
  // piso de tablas, camas y sillones en lana gris, cielorraso blanco, mesada
  // de piedra y loza.
  madera:   { color: "#ffffff", roughness: 0.46, tex: "roble", relieve: "grey_oak_veneer_01", m: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.32 },
  piso:     { color: "#d8c2aa", roughness: 0.55, tex: "laminate_floor_02", relieve: "laminate_floor_02", m: 1.6, adelante: true },
  tela:     { color: "#a9a298", roughness: 0.95, tex: "poly_wool_herringbone", relieve: "poly_wool_herringbone", m: 0.35, sheen: 0.5, n: 1 },
  // Almohadones sueltos de camas y sillones: lino claro, como afuera.
  cojin:    { color: "#ece6dc", roughness: 0.95, relieve: "poly_wool_herringbone", m: 0.2, sheen: 0.8, n: 0.5 },
  techo:    { color: "#f6f4f0", roughness: 0.8 },
  // Mesada: cuarzo blanco liso (la foto de mármol se repetía como baldosas).
  piedra:   { color: "#f2f0ec", roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.1 },
  loza:     { color: "#f7f7f5", roughness: 0.15, clearcoat: 0.6 },
  interior: { color: "#ebe8e3", roughness: 0.75 },
  // Forro del casco en el modelo interior: tapizado claro, liso.
  forro:    { color: "#efece7", roughness: 0.9 },
};

/* Modelo real. En la vista interior no se vuelve transparente: se corta como
   un plano de arquitectura (todo lo que está arriba de los camarotes se va),
   con una transición que baja el corte de a poco. */
function BarcoReal({ modelo, pal, interior, alCrearMateriales }) {
  const noche = pal === PALETAS.noche;
  const mats = useMemo(() => {
    const texturas = {};
    const tex = (clave, crear) => (texturas[clave] ||= crear());
    const plano = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
    const lista = Object.fromEntries(Object.entries(ACABADOS).map(([nombre, a]) => {
      const m = a.m ?? 1;
      const mapa = a.tex === "teca" ? tex("teca", texturaTeca)
        : a.tex === "roble" ? tex(`roble-${m}`, () => texturaRoble(m))
        : a.tex ? tex(`${a.tex}-c-${m}`, () => texturaFoto(`${a.tex}_diff`, m)) : null;
      const normales = a.relieve ? tex(`${a.relieve}-n-${m}`, () => texturaFoto(`${a.relieve}_nor`, m, { color: false })) : null;
      return [nombre, new THREE.MeshPhysicalMaterial({
        color: a.color, roughness: a.roughness ?? 0.5, metalness: a.metalness ?? 0,
        clearcoat: a.clearcoat ?? 0, clearcoatRoughness: a.clearcoatRoughness ?? 0,
        sheen: a.sheen ?? 0, sheenRoughness: 0.8, sheenColor: new THREE.Color("#ffffff"),
        transmission: a.transmission ?? 0, thickness: a.thickness ?? 0, ior: a.ior ?? 1.5,
        attenuationColor: new THREE.Color(a.atenuacion ?? "#ffffff"), attenuationDistance: a.atenuacion ? 0.012 : Infinity,
        map: mapa, normalMap: normales, normalScale: new THREE.Vector2(a.n ?? 0.6, a.n ?? 0.6),
        side: THREE.DoubleSide, clippingPlanes: [plano], clipShadows: true,
        // Teca y piso van apoyados sobre otra superficie: se adelantan apenas
        // (de más, atravesaban el casco y se veían como líneas en el costado).
        polygonOffset: true, polygonOffsetFactor: a.adelante ? -1 : 1, polygonOffsetUnits: a.adelante ? -1 : 1,
      })];
    }));
    const linea = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5, clippingPlanes: [plano] });
    const lineaDentro = new THREE.LineBasicMaterial({ color: "#3b332c", transparent: true, opacity: 0.45, clippingPlanes: [plano] });
    return { lista, linea, lineaDentro, texturas, plano };
  }, []);
  useEffect(() => () => {
    Object.values(mats.lista).forEach(m => m.dispose());
    mats.linea.dispose();
    mats.lineaDentro.dispose();
    Object.values(mats.texturas).forEach(t => t.dispose());
  }, [mats]);

  useEffect(() => {
    const extras = [];
    const todas = [
      ...Object.entries(modelo.piezas).map(([nombre, m]) => [nombre, m, INTERIOR.includes(nombre)]),
      ...Object.entries(modelo.aparte?.piezas ?? {}).map(([nombre, m]) => [nombre, m, true]),
    ];
    const delInterior = new Set(Object.values(modelo.aparte?.piezas ?? {}));
    todas.forEach(([nombre, m, dentro]) => {
      m.material = mats.lista[materialDe(nombre)] || mats.lista.detalle;
      if (delInterior.has(m) && nombre !== "vidrios") m.castShadow = m.receiveShadow = true;
      // El interior lleva contornos finos siempre: en la vista en corte separan
      // camas, muebles y pisos como en un plano.
      // Los almohadones son arrugados: con contornos quedaban rayados.
      if ((!modelo.lineas && !dentro) || nombre === "vidrios" || nombre === "cojin") return;
      const bordes = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, dentro ? 35 : 32), dentro ? mats.lineaDentro : mats.linea);
      m.add(bordes);
      extras.push(bordes);
    });
    return () => extras.forEach(b => { b.removeFromParent(); b.geometry.dispose(); });
  }, [modelo, mats]);

  useEffect(() => {
    mats.linea.color.set(pal.linea);
    // Sin materiales propios (K64) la piel del casco también toma el tono del manual.
    Object.entries(coloresDelTono(noche ? "noche" : "dia", modelo.lineas))
      .forEach(([nombre, color]) => mats.lista[nombre].color.set(color));
  }, [pal, noche, mats, modelo]);

  // Para el probador: los materiales por acabado, ya con el tono del manual.
  useEffect(() => { alCrearMateriales?.(mats.lista); }, [mats, alCrearMateriales]);

  // useFrame lee por ref: el corte se anima fuera del render de React.
  const vivo = useRef(null);
  useEffect(() => { vivo.current = { mats, modelo, interior }; }, [mats, modelo, interior]);

  useFrame(({ gl }, dt) => {
    if (!vivo.current) return;
    const { mats, modelo, interior } = vivo.current;
    const tope = modelo.D * 8;
    // Con interior aparte no hay corte: se muestra un modelo u otro (el
    // cambio lo tapa el fundido de la pantalla).
    if (modelo.aparte) {
      mats.plano.constant = tope;
      // La sombra se recalcula cuando cambia lo que está a la vista.
      if (modelo.aparte.raiz.visible !== interior) gl.shadowMap.needsUpdate = true;
      modelo.raiz.visible = !interior;
      modelo.aparte.raiz.visible = interior;
      INTERIOR.forEach(n => { if (modelo.piezas[n]) modelo.piezas[n].visible = false; });
      return;
    }
    const meta = interior && modelo.corte != null ? modelo.corte : tope;
    const actual = Math.min(mats.plano.constant, tope);
    mats.plano.constant = actual + (meta - actual) * Math.min(1, dt * 4);
    const verDentro = mats.plano.constant < tope * 0.98;
    INTERIOR.forEach(n => { if (modelo.piezas[n]) modelo.piezas[n].visible = verDentro; });
  });

  return (
    <group>
      {/* Sin volúmenes de referencia: en el modelo real caerían sobre los
          camarotes. Cuando el .3dm traiga motores y tanques, aparecen solos. */}
      <primitive object={modelo.raiz} />
      {modelo.aparte && <primitive object={modelo.aparte.raiz} />}
    </group>
  );
}

function Barco({ geo, textura, pal, interior }) {
  const cascoMat = useRef(null);
  const cubiertaMat = useRef(null);
  // El casco se desvanece (no salta) al pasar a la vista interior.
  useFrame((_, dt) => {
    const meta = interior ? 0.1 : 1;
    [cascoMat.current, cubiertaMat.current].forEach(m => {
      if (!m) return;
      m.opacity += (meta - m.opacity) * Math.min(1, dt * 6);
      m.depthWrite = m.opacity > 0.95;
    });
  });
  const cabina = geo.enU(0.51);
  const techo = geo.enU(0.43);
  return (
    <group>
      <mesh geometry={geo.casco}>
        <meshStandardMaterial ref={cascoMat} color={pal.casco} roughness={0.42} metalness={0.05} transparent side={THREE.DoubleSide} />
        <Edges threshold={22} color={pal.linea} />
      </mesh>
      <mesh geometry={geo.cubierta}>
        <meshStandardMaterial ref={cubiertaMat} color={pal.casco} roughness={0.6} transparent side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geo.cubierta} renderOrder={2}>
        <meshBasicMaterial map={textura} transparent opacity={0.8} depthWrite={false} polygonOffset polygonOffsetFactor={-2} side={THREE.DoubleSide} />
      </mesh>

      {/* Volúmenes de referencia: cabina de vidrio y hardtop */}
      <mesh position={[cabina.x, cabina.cubierta + geo.D * 0.36, cabina.zc]}>
        <boxGeometry args={[LARGO * 0.26, geo.D * 0.72, cabina.media * 1.5]} />
        <meshStandardMaterial color={pal.casco} transparent opacity={0.1} depthWrite={false} />
        <Edges color={pal.linea} />
      </mesh>
      <mesh position={[techo.x, techo.cubierta + geo.D * 1.2, techo.zc]}>
        <boxGeometry args={[LARGO * 0.24, geo.D * 0.06, techo.media * 1.8]} />
        <meshStandardMaterial color={pal.casco} roughness={0.5} transparent opacity={interior ? 0.15 : 1} depthWrite={!interior} />
        <Edges color={pal.linea} />
      </mesh>

    </group>
  );
}


/* El reflejo se dibuja con una cámara espejada, que ve la escena invertida de
   izquierda a derecha. Pero toma la proyección de la cámara principal, que en
   escritorio va corrida (filmOffset) para dejar el barco a la derecha del
   panel: espejada, queda corrida para el otro lado. Así el agua de la
   izquierda leía fuera de la imagen del reflejo y estiraba su borde en franjas
   de colores. Este paso da vuelta el corrimiento justo antes de que el reflejo
   copie la proyección, y lo vuelve a su lugar justo después. Va antes y
   después del material en el árbol para que sus useFrame corran en ese orden. */
function InvertirCorrimiento() {
  useFrame(({ camera }) => {
    const e = camera.projectionMatrix.elements;
    e[8] = -e[8];
  });
  return null;
}

/* Agua: espejo mate que refleja el casco (el barco "flota") y se pierde en
   la niebla. Tapa lo sumergido, así la obra viva no se ve. */
function Agua({ pal }) {
  const noche = pal === PALETAS.noche;
  const chico = typeof window !== "undefined" && window.innerWidth < 900;
  return (
    <>
      <InvertirCorrimiento />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[LARGO * 10, LARGO * 10]} />
        <MeshReflectorMaterial
          color={noche ? "#0b0d0e" : "#e3e8ea"}
          resolution={chico ? 512 : 1024}
          blur={[400, 120]}
          mixBlur={1}
          mixStrength={noche ? 1.2 : 0.7}
          mirror={0.6}
          roughness={0.85}
          metalness={0.2}
          depthScale={0.8}
          minDepthThreshold={0.3}
          maxDepthThreshold={1.2}
        />
      </mesh>
      <InvertirCorrimiento />
    </>
  );
}

function Punto({ n, pos, p, abierto, onClick }) {
  return (
    <Html position={pos} center zIndexRange={[30, 0]}>
      <div className="kx-rec-punto-w">
        <button type="button" className="kx-rec-punto" aria-expanded={abierto} aria-label={p.t} onClick={onClick}>{n}</button>
        {abierto && (
          <div className="kx-rec-tip" role="note">
            <strong>{p.t}</strong>
            <span>{p.d}</span>
          </div>
        )}
      </div>
    </Html>
  );
}

/* La cámara viaja a cada estación y después queda libre para girar. */
function Camara({ geo, est, interior }) {
  const get = useThree(st => st.get);
  const ancho = useThree(st => st.size.width);
  const viaje = useRef(null);

  // En escritorio el panel ocupa la izquierda: se corre el centro óptico
  // para que el barco quede en el espacio libre de la derecha.
  useEffect(() => {
    const cam = get().camera;
    const panel = ancho > 900 ? Math.min(420, ancho * 0.38) + 40 : 0;
    cam.filmOffset = -(panel / 2 / ancho) * cam.getFilmWidth();
    cam.updateProjectionMatrix();
  }, [get, ancho]);

  useEffect(() => {
    const { camera, controls } = get();
    // Vista interior en un modelo real: arriba de los camarotes, mirando hacia abajo.
    const planta = interior && geo.centroInterior;
    const foco = planta ? new THREE.Vector3(...geo.centroInterior)
      : est.foco ? new THREE.Vector3(...ubicar(geo, est.foco)) : new THREE.Vector3(0, geo.D * 0.6, 0);
    // Si el foco es un equipo del modelo real, la cámara se acerca a él.
    const anclado = est.foco?.ancla && geo.anclas?.[est.foco.ancla];
    const { az, el, dist } = planta ? { az: 90, el: 72, dist: 1.3 } : anclado && est.camAncla ? est.camAncla : est.cam;
    // En pantallas angostas el campo horizontal es chico: alejar la cámara.
    const r = dist * LARGO * Math.max(1, 1.3 / camera.aspect);
    const a = THREE.MathUtils.degToRad(az);
    const e = THREE.MathUtils.degToRad(el);
    const destino = foco.clone().add(new THREE.Vector3(r * Math.cos(e) * Math.cos(a), r * Math.sin(e), r * Math.cos(e) * Math.sin(a)));
    const desdeTarget = controls?.target?.clone() ?? new THREE.Vector3();
    viaje.current = {
      desde: camera.position.clone(), hasta: destino,
      desdeT: desdeTarget, hastaT: foco,
      t: leerMovimientoReducido() ? 1 : 0,
    };
  }, [est, geo, get, interior]);

  useFrame(({ camera, controls }, dt) => {
    const v = viaje.current;
    if (!v || !controls) return;
    v.t = Math.min(1, v.t + dt / 1.6);
    const k = 1 - Math.pow(1 - v.t, 3);
    camera.position.lerpVectors(v.desde, v.hasta, k);
    controls.target.lerpVectors(v.desdeT, v.hastaT, k);
    controls.update();
    if (v.t >= 1) viaje.current = null;
  });
  return null;
}
