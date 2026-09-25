/* ═══════════════════════════════════════════════════════════════
   Recorrido 3D · pantalla
   Once estaciones con la cámara que viaja por el barco, números sobre
   cada punto y una vista interior (casco transparente) para lo que
   está bajo cubierta. Blanco y negro, en el tono del manual.
═══════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, Html, MeshReflectorMaterial, OrbitControls } from "@react-three/drei";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as THREE from "three";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { leerMovimientoReducido } from "@/components/ui/useReducedMotion";
import { planoDe, modelo3dDe } from "../unidad";
import { leerJson, guardarJson } from "../almacen";
import { LARGO, leerPlano, armarCasco, texturaPlano, cargarModelo, texturaTeca, texturaFoto, INTERIOR } from "./barco";
import { ESTACIONES } from "./estaciones";

const VISTOS_KEY = "ka_recorrido_vistos";
const pad = n => String(n).padStart(2, "0");

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
  const est = ESTACIONES[idx];
  const interior = interiorManual ?? est.interior;
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
            onCreated={({ gl }) => { gl.toneMapping = THREE.NeutralToneMapping; gl.toneMappingExposure = 1.05; gl.localClippingEnabled = true; }}>
            <Escena plano={plano} pal={pal} est={est} interior={interior} abierto={abierto} onPunto={setAbierto} />
          </Canvas>
        )}
      </div>

      <header className="kx-rec-top">
        <span className="kx-marca-k">KLASE A</span>
        <span className="kx-eyebrow kx-solo-ancho" style={{ marginLeft: 18 }}>Recorrido 3D · {modelo || "Klase A"}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
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
      <color attach="background" args={[pal.fondo]} />
      <fog attach="fog" args={[pal.fondo, LARGO * 1.6, LARGO * 4]} />
      <ambientLight intensity={pal === PALETAS.noche ? 0.55 : 0.85} />
      <hemisphereLight args={["#ffffff", "#cfd4d6", 0.55]} />
      <directionalLight position={[6, 12, 8]} intensity={1.15} />
      <directionalLight position={[-8, 5, -6]} intensity={0.35} />
      {geo.real
        ? <BarcoReal modelo={geo} pal={pal} interior={interior} />
        : <BarcoPlano geo={geo} plano={fuente.plano} pal={pal} interior={interior} />}
      <Agua pal={pal} />
      <Estudio />
      {puntosDe(est, geo).map((p, i) => (
        <Punto key={`${est.id}-${p.t}`} n={i + 1} pos={ubicar(geo, p)} p={p} abierto={abierto === i} onClick={() => onPunto(abierto === i ? null : i)} />
      ))}
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08}
        minDistance={LARGO * 0.35} maxDistance={LARGO * 2.4} maxPolarAngle={Math.PI / 2 - 0.04} />
      <Camara geo={geo} est={est} interior={interior} />
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
  vidrios:  { color: "#1a2025", metalness: 0.6, roughness: 0.06 },
  // Cuero caramelo afuera (como en el render), lana espigada gris topo adentro.
  tapizado: { color: "#efe4d8", roughness: 0.55, tex: "fabric_leather_02", relieve: "fabric_leather_02", m: 0.8, clearcoat: 0.15, clearcoatRoughness: 0.5 },
  almohadon: { color: "#f2eee7", roughness: 0.95, relieve: "poly_wool_herringbone", m: 0.25, sheen: 0.6 },
  detalle:  { color: "#3a3a3a", roughness: 0.4 },
  // Interior (según los renders): roble gris rosado, piso de tablas claras,
  // camas y sillones crema, cielorraso blanco, mesada de piedra y loza.
  madera:   { color: "#ffffff", roughness: 0.5, tex: "grey_oak_veneer_01", relieve: "grey_oak_veneer_01", m: 0.6 },
  piso:     { color: "#ffffff", roughness: 0.55, tex: "laminate_floor_02", relieve: "laminate_floor_02", m: 1.6, adelante: true },
  tela:     { color: "#ffffff", roughness: 0.95, tex: "poly_wool_herringbone", relieve: "poly_wool_herringbone", m: 0.35, sheen: 0.5 },
  techo:    { color: "#f6f4f0", roughness: 0.8 },
  piedra:   { color: "#ffffff", roughness: 0.3, tex: "marble_01", relieve: "marble_01", m: 1.2, clearcoat: 0.3 },
  loza:     { color: "#f7f7f5", roughness: 0.15, clearcoat: 0.6 },
  interior: { color: "#ebe8e3", roughness: 0.75 },
};

/* Modelo real. En la vista interior no se vuelve transparente: se corta como
   un plano de arquitectura (todo lo que está arriba de los camarotes se va),
   con una transición que baja el corte de a poco. */
function BarcoReal({ modelo, pal, interior }) {
  const noche = pal === PALETAS.noche;
  const mats = useMemo(() => {
    const texturas = {};
    const tex = (clave, crear) => (texturas[clave] ||= crear());
    const plano = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
    const lista = Object.fromEntries(Object.entries(ACABADOS).map(([nombre, a]) => {
      const m = a.m ?? 1;
      const mapa = a.tex === "teca" ? tex("teca", texturaTeca)
        : a.tex ? tex(`${a.tex}-c-${m}`, () => texturaFoto(`${a.tex}_diff`, m)) : null;
      const normales = a.relieve ? tex(`${a.relieve}-n-${m}`, () => texturaFoto(`${a.relieve}_nor`, m, { color: false })) : null;
      return [nombre, new THREE.MeshPhysicalMaterial({
        color: a.color, roughness: a.roughness ?? 0.5, metalness: a.metalness ?? 0,
        clearcoat: a.clearcoat ?? 0, clearcoatRoughness: a.clearcoatRoughness ?? 0,
        sheen: a.sheen ?? 0, sheenRoughness: 0.8, sheenColor: new THREE.Color("#ffffff"),
        map: mapa, normalMap: normales, normalScale: new THREE.Vector2(0.6, 0.6),
        side: THREE.DoubleSide, clippingPlanes: [plano], clipShadows: true,
        // Teca y piso van apoyados sobre otra superficie: se adelantan apenas
        // (de más, atravesaban el casco y se veían como líneas en el costado).
        polygonOffset: true, polygonOffsetFactor: a.adelante ? -1 : 1, polygonOffsetUnits: a.adelante ? -1 : 1,
      })];
    }));
    const linea = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5, clippingPlanes: [plano] });
    return { lista, linea, texturas, plano };
  }, []);
  useEffect(() => () => {
    Object.values(mats.lista).forEach(m => m.dispose());
    mats.linea.dispose();
    Object.values(mats.texturas).forEach(t => t.dispose());
  }, [mats]);

  useEffect(() => {
    const extras = [];
    Object.entries(modelo.piezas).forEach(([nombre, m]) => {
      m.material = mats.lista[nombre] || mats.lista.detalle;
      if (!modelo.lineas || nombre === "vidrios") return;
      const bordes = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, INTERIOR.includes(nombre) ? 40 : 32), mats.linea);
      m.add(bordes);
      extras.push(bordes);
    });
    return () => extras.forEach(b => { b.removeFromParent(); b.geometry.dispose(); });
  }, [modelo, mats]);

  useEffect(() => {
    mats.linea.color.set(pal.linea);
    mats.lista.interior.color.set(noche ? "#3a3a3a" : "#e8e6e1");
    // Sin materiales propios (K64): la piel toma el tono del manual.
    if (modelo.lineas) mats.lista.casco.color.set(pal.casco);
  }, [pal, noche, mats, modelo]);

  // useFrame lee por ref: el corte se anima fuera del render de React.
  const vivo = useRef(null);
  useEffect(() => { vivo.current = { mats, modelo, interior }; }, [mats, modelo, interior]);

  useFrame((_, dt) => {
    if (!vivo.current) return;
    const { mats, modelo, interior } = vivo.current;
    const tope = modelo.D * 8;
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


/* Agua: espejo mate que refleja el casco (el barco "flota") y se pierde en
   la niebla. Tapa lo sumergido, así la obra viva no se ve. */
function Agua({ pal }) {
  const noche = pal === PALETAS.noche;
  const chico = typeof window !== "undefined" && window.innerWidth < 900;
  return (
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
    const { az, el, dist } = planta ? { az: est.cam.az, el: 62, dist: 0.78 } : anclado && est.camAncla ? est.camAncla : est.cam;
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
