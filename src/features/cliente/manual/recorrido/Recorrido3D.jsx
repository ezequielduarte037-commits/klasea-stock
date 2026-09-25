/* ═══════════════════════════════════════════════════════════════
   Recorrido 3D · pantalla
   Once estaciones con la cámara que viaja por el barco, números sobre
   cada punto y una vista interior (casco transparente) para lo que
   está bajo cubierta. Blanco y negro, en el tono del manual.
═══════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Edges, Html, OrbitControls } from "@react-three/drei";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as THREE from "three";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { leerMovimientoReducido } from "@/components/ui/useReducedMotion";
import { planoDe, modelo3dDe } from "../unidad";
import { leerJson, guardarJson } from "../almacen";
import { LARGO, leerPlano, armarCasco, texturaPlano, cargarModelo, texturaTeca } from "./barco";
import { ESTACIONES, SISTEMAS } from "./estaciones";

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

/* Anota la estación como vista (en este dispositivo). */
function marcar(vistos, id) {
  if (vistos.has(id)) return vistos;
  const n = new Set(vistos).add(id);
  guardarJson(VISTOS_KEY, [...n]);
  return n;
}

/* Punto del barco en coordenadas de mundo. */
function ubicar(geo, { u, lado = 0, alto = 0 }) {
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
            onCreated={({ gl }) => { gl.toneMapping = THREE.NeutralToneMapping; gl.toneMappingExposure = 1.05; }}>
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
        {est.puntos.length > 0 && (
          <div className="kx-rec-refs">
            <div className="kx-eyebrow" style={{ marginBottom: 8 }}>En el barco</div>
            {est.puntos.map((p, i) => (
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
      <directionalLight position={[6, 12, 8]} intensity={1.15} />
      <directionalLight position={[-8, 5, -6]} intensity={0.35} />
      {geo.real
        ? <BarcoReal modelo={geo} pal={pal} interior={interior} activos={est.sistemas} />
        : <BarcoPlano geo={geo} plano={fuente.plano} pal={pal} interior={interior} activos={est.sistemas} />}
      <Agua pal={pal} />
      <Estudio />
      <ContactShadows position={[0, 0.02, 0]} scale={LARGO * 1.8} far={geo.D * 3} blur={2.6} opacity={pal === PALETAS.noche ? 0.6 : 0.32} resolution={512} frames={1} />
      {est.puntos.map((p, i) => (
        <Punto key={`${est.id}-${p.t}`} n={i + 1} pos={ubicar(geo, p)} p={p} abierto={abierto === i} onClick={() => onPunto(abierto === i ? null : i)} />
      ))}
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08}
        minDistance={LARGO * 0.35} maxDistance={LARGO * 2.4} maxPolarAngle={Math.PI / 2 - 0.04} />
      <Camara geo={geo} est={est} />
    </>
  );
}

function BarcoPlano({ geo, plano, pal, interior, activos }) {
  const textura = useMemo(() => texturaPlano(plano, pal.plano), [plano, pal.plano]);
  useEffect(() => () => textura.dispose(), [textura]);
  useEffect(() => () => { geo.casco.dispose(); geo.cubierta.dispose(); }, [geo]);
  return <Barco geo={geo} textura={textura} pal={pal} interior={interior} activos={activos} />;
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
   interior). En la vista interior la piel se vuelve casi transparente y
   aparecen camarotes, mamparos y muebles. */
const ACABADOS = {
  casco:    { color: "#f8f8f6", roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06 },
  cubierta: { color: "#f0f0ec", roughness: 0.55 },
  fondo:    { color: "#242424", roughness: 0.85 },
  teca:     { color: "#ffffff", roughness: 0.72, teca: true },
  cromo:    { color: "#e2e2e2", metalness: 1, roughness: 0.14 },
  negro:    { color: "#0d0d0d", roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.1 },
  vidrios:  { color: "#12161a", metalness: 0.5, roughness: 0.04, opacidad: 0.8 },
  tapizado: { color: "#ece8e0", roughness: 0.92 },
  detalle:  { color: "#3a3a3a", roughness: 0.4 },
  interior: { color: "#e4e4e0", roughness: 0.7, opacidad: 0.92 },
};

function BarcoReal({ modelo, pal, interior, activos }) {
  const noche = pal === PALETAS.noche;
  const mats = useMemo(() => {
    const teca = texturaTeca();
    const lista = Object.fromEntries(Object.entries(ACABADOS).map(([nombre, a]) => {
      const m = new THREE.MeshPhysicalMaterial({
        color: a.color, roughness: a.roughness ?? 0.5, metalness: a.metalness ?? 0,
        clearcoat: a.clearcoat ?? 0, clearcoatRoughness: a.clearcoatRoughness ?? 0,
        map: a.teca ? teca : null, transparent: true, opacity: a.opacidad ?? 1,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: nombre === "interior" ? 2 : 1,
      });
      m.userData.base = a.opacidad ?? 1;
      return [nombre, m];
    }));
    const linea = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 });
    return { lista, linea, teca };
  }, []);
  useEffect(() => () => {
    Object.values(mats.lista).forEach(m => m.dispose());
    mats.linea.dispose();
    mats.teca.dispose();
  }, [mats]);

  useEffect(() => {
    const extras = [];
    Object.entries(modelo.piezas).forEach(([nombre, m]) => {
      m.material = mats.lista[nombre] || mats.lista.detalle;
      m.renderOrder = nombre === "interior" ? 0 : 1;
      if (!modelo.lineas || nombre === "vidrios") return;
      const bordes = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, nombre === "interior" ? 40 : 32), mats.linea);
      m.add(bordes);
      extras.push(bordes);
    });
    return () => extras.forEach(b => { b.removeFromParent(); b.geometry.dispose(); });
  }, [modelo, mats]);

  useEffect(() => {
    mats.linea.color.set(pal.linea);
    mats.lista.interior.color.set(noche ? "#2a2a2a" : "#e4e4e0");
    // Sin materiales propios (K64): la piel toma el tono del manual.
    if (modelo.lineas) mats.lista.casco.color.set(pal.casco);
  }, [pal, noche, mats, modelo]);

  // useFrame lee por ref: los materiales se animan fuera del render de React.
  const vivo = useRef(null);
  useEffect(() => { vivo.current = { mats, piezas: modelo.piezas, interior }; }, [mats, modelo, interior]);

  useFrame((_, dt) => {
    if (!vivo.current) return;
    const { mats, piezas, interior } = vivo.current;
    const k = Math.min(1, dt * 6);
    Object.entries(mats.lista).forEach(([nombre, m]) => {
      if (nombre === "interior") return;
      const meta = m.userData.base * (interior ? 0.07 : 1);
      m.opacity += (meta - m.opacity) * k;
      m.depthWrite = m.opacity > 0.95;
    });
    mats.linea.opacity += ((interior ? 0.28 : 0.55) - mats.linea.opacity) * k;
    const dentro = piezas.interior;
    if (dentro) dentro.visible = interior || mats.lista.casco.opacity < 0.97;
  });

  return (
    <group>
      <primitive object={modelo.raiz} />
      {interior && SISTEMAS.filter(s => activos.includes(s.id)).map(sis => (
        <Sistema key={sis.id} geo={modelo} sis={sis} pal={pal} activo />
      ))}
    </group>
  );
}

function Barco({ geo, textura, pal, interior, activos }) {
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

      {interior && SISTEMAS.map(sis => (
        <Sistema key={sis.id} geo={geo} sis={sis} pal={pal} activo={activos.includes(sis.id)} />
      ))}
    </group>
  );
}

function Sistema({ geo, sis, pal, activo }) {
  const s = geo.enU(sis.u);
  const w = LARGO * sis.largo;
  const h = geo.D * sis.h;
  const y = s.cubierta + sis.alto * geo.D;
  const piezas = sis.doble
    ? [s.zc + sis.lado * s.media, s.zc - sis.lado * s.media]
    : [s.zc + sis.lado * s.media];
  return piezas.map((z, i) => (
    <mesh key={i} position={[s.x, y, z]}>
      <boxGeometry args={[w, h, s.media * sis.ancho]} />
      <meshStandardMaterial color={activo ? pal.linea : pal.casco} transparent opacity={activo ? 0.9 : 0.25} depthWrite={false} />
      <Edges color={activo ? pal.linea : pal.suave} />
    </mesh>
  ));
}

/* Agua: plano apenas translúcido (lo sumergido se ve atenuado) y una
   retícula fina que se pierde en la niebla. */
function Agua({ pal }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} renderOrder={1}>
        <planeGeometry args={[LARGO * 8, LARGO * 8]} />
        <meshBasicMaterial color={pal.agua} transparent opacity={0.72} depthWrite={false} />
      </mesh>
      <gridHelper args={[LARGO * 8, 40, pal.suave, pal.suave]} position={[0, 0.002, 0]}>
        <lineBasicMaterial attach="material" color={pal.suave} transparent opacity={0.45} />
      </gridHelper>
    </group>
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
function Camara({ geo, est }) {
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
    const foco = est.foco ? new THREE.Vector3(...ubicar(geo, est.foco)) : new THREE.Vector3(0, geo.D * 0.6, 0);
    const { az, el, dist } = est.cam;
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
  }, [est, geo, get]);

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
