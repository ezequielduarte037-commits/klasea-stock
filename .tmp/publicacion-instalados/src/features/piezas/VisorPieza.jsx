/* ═══════════════════════════════════════════════════════════════
   Visor de piezas · la escena
   La pieza apoyada en un piso con su sombra y una grilla de medio
   metro, con la cámara que gira, acerca y se mueve con los dedos.
   Vistas rápidas, medir entre dos puntos y un corte que dibuja el
   perfil de la pieza.
═══════════════════════════════════════════════════════════════ */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Grid, Html, Line, OrbitControls } from "@react-three/drei";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as THREE from "three";
import { leerMovimientoReducido } from "@/components/ui/useReducedMotion";
import { cajaDe, perfilDelCorte, mm } from "./pieza";

// Hacia dónde queda la cámara en cada vista, mirando al centro de la pieza.
const VISTAS = {
  tres: [0.78, 0.55, 0.95],
  arriba: [0, 1, 0],
  abajo: [0, -1, 0],
  frente: [1, 0.1, 0],
  atras: [-1, 0.1, 0],
  costado: [0, 0.1, 1],
};
const visible = o => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
const colorToken = (nombre, otro) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || otro;

/* Plano del corte: deja lo que está detrás (hacia popa, babor o abajo) y saca
   lo que tapa el perfil desde la vista del corte. */
function planoDelCorte(caja, { eje, t }) {
  if (eje === "largo") return new THREE.Plane(new THREE.Vector3(-1, 0, 0), THREE.MathUtils.lerp(caja.max.x, caja.min.x, t));
  if (eje === "ancho") return new THREE.Plane(new THREE.Vector3(0, 0, -1), THREE.MathUtils.lerp(caja.max.z, caja.min.z, t));
  return new THREE.Plane(new THREE.Vector3(0, -1, 0), THREE.MathUtils.lerp(caja.max.y, caja.min.y, t));
}

// Parte de la pantalla que dejan libre el encabezado y los controles.
const UTIL_ALTO = 0.64, UTIL_ANCHO = 0.9;

/* Cámara y objetivo para ver toda la caja desde una vista: la distancia a la
   que entran sus ocho esquinas. Desde arriba o desde abajo, la pieza a lo
   largo de la pantalla: con el celular parado la proa va arriba; apaisado, a
   la izquierda. */
function encuadre(camara, aspecto, caja, vista) {
  const objetivo = caja.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(...VISTAS[vista]);
  if (vista === "arriba" || vista === "abajo") {
    const parado = aspecto < 1;
    dir.add(parado ? new THREE.Vector3(vista === "arriba" ? -0.004 : 0.004, 0, 0) : new THREE.Vector3(0, 0, -0.004));
  }
  dir.normalize();
  const x = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
  const y = dir.clone().cross(x);
  const tv = Math.tan(THREE.MathUtils.degToRad(camara.fov) / 2) * UTIL_ALTO;
  const th = Math.tan(THREE.MathUtils.degToRad(camara.fov) / 2) * aspecto * UTIL_ANCHO;
  const v = new THREE.Vector3();
  let distancia = 0;
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? caja.max.x : caja.min.x, i & 2 ? caja.max.y : caja.min.y, i & 4 ? caja.max.z : caja.min.z).sub(objetivo);
    const atras = v.dot(dir);
    distancia = Math.max(distancia, Math.abs(v.dot(x)) / th + atras, Math.abs(v.dot(y)) / tv + atras);
  }
  return { objetivo, esfera: new THREE.Spherical().setFromVector3(dir.multiplyScalar(distancia)) };
}

/* Luz de estudio para los reflejos (sin descargar ningún HDR). */
function Ambiente() {
  const get = useThree(st => st.get);
  useEffect(() => {
    const { gl, scene: escena, invalidate } = get();
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    escena.environment = env;
    escena.environmentIntensity = 0.85;
    invalidate();
    return () => { escena.environment = null; env.dispose(); pmrem.dispose(); };
  }, [get]);
  return null;
}

export default function VisorPieza({ pieza, visibles, pedido, modo, corte, puntos, onPunto }) {
  const camera = useThree(st => st.camera);
  const get = useThree(st => st.get);
  const invalidate = useThree(st => st.invalidate);
  const controles = useRef(null);
  const animacion = useRef(null);
  const toque = useRef(null);
  const cajaTotal = useMemo(() => cajaDe(pieza.partes, new Set(pieza.partes.map(p => p.id))), [pieza]);
  const caja = useMemo(() => {
    const c = cajaDe(pieza.partes, visibles);
    return c.isEmpty() ? cajaTotal : c;
  }, [pieza, visibles, cajaTotal]);
  const radio = useMemo(() => cajaTotal.getBoundingSphere(new THREE.Sphere()).radius || 1, [cajaTotal]);

  // La escena se dibuja sólo cuando algo cambia (frameloop "demand") y la
  // sombra, sólo cuando cambian las partes o el corte: la pieza no se mueve.
  const redibujar = useCallback(() => {
    get().gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [get, invalidate]);

  // Partes a la vista.
  useEffect(() => {
    pieza.partes.forEach(p => p.objetos.forEach(o => { o.visible = visibles.has(p.id); }));
    redibujar();
  }, [pieza, visibles, redibujar]);

  // Corte: todas las superficies lo respetan (la grilla y el piso no).
  const plano = useMemo(() => (modo === "corte" ? planoDelCorte(caja, corte) : null), [modo, caja, corte]);
  useEffect(() => {
    pieza.raiz.traverse(o => { if (o.material) o.material.clippingPlanes = plano ? [plano] : null; });
    redibujar();
  }, [pieza, plano, redibujar]);
  // El perfil cuesta más que el recorte: sigue al deslizador apenas después.
  const corteDiferido = useDeferredValue(corte);
  const perfil = useMemo(() => (modo === "corte" ? perfilDelCorte(pieza.partes, visibles, planoDelCorte(caja, corteDiferido)) : null),
    [pieza, visibles, modo, caja, corteDiferido]);
  const cian = useMemo(() => colorToken("--cyan", "#67e8f9"), []);
  // La grilla del piso, apenas marcada sobre el fondo de estudio.
  const grilla = useMemo(() => [colorToken("--visor-grilla", "#6a7079"), colorToken("--visor-grilla-fuerte", "#858b96")], []);

  // Vistas: la cámara viaja por la esfera alrededor de la pieza (sin pasar
  // por adentro), o salta si el sistema pide menos movimiento. Encuadra lo que
  // está a la vista, pero prender o apagar una parte no mueve la cámara.
  const cajaVista = useRef(caja);
  useEffect(() => { cajaVista.current = caja; }, [caja]);
  useEffect(() => {
    const c = controles.current;
    if (!c || !pedido) return;
    // El tamaño del lienzo del momento (al rotar el celular no se reencuadra solo).
    const { width, height } = get().size;
    const destino = encuadre(camera, width / Math.max(1, height), cajaVista.current, pedido.vista);
    const desde = new THREE.Spherical().setFromVector3(camera.position.clone().sub(c.target));
    let dTheta = destino.esfera.theta - desde.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    if (pedido.n === 0 || leerMovimientoReducido()) {
      c.target.copy(destino.objetivo);
      camera.position.setFromSpherical(destino.esfera).add(destino.objetivo);
      c.update();
      invalidate();
      return;
    }
    c.enableDamping = false;
    c.update();
    animacion.current = { inicio: performance.now(), desde, dTheta, hasta: destino.esfera, objetivo0: c.target.clone(), objetivo1: destino.objetivo };
    invalidate();
  }, [pedido, camera, get, invalidate]);

  useEffect(() => {
    const c = controles.current;
    if (!c) return undefined;
    // Si la persona agarra la pieza, la vista que estaba viajando se corta ahí.
    const cortar = () => { if (animacion.current) { animacion.current = null; c.enableDamping = true; } };
    c.addEventListener("start", cortar);
    return () => c.removeEventListener("start", cortar);
  }, []);

  useFrame(({ camera: cam, invalidate: otroCuadro }) => {
    const a = animacion.current, c = controles.current;
    // Plano cercano según la distancia: con uno fijo y chico, las superficies
    // que el .3dm trae a un milímetro una de otra titilaban de lejos.
    if (c) {
      const cerca = THREE.MathUtils.clamp(cam.position.distanceTo(c.target) * 0.04, 0.005, 2);
      if (Math.abs(cam.near - cerca) > cerca * 0.2) {
        cam.near = cerca;
        cam.far = cerca * 2500;
        cam.updateProjectionMatrix();
      }
    }
    if (!a || !c) return;
    const k = Math.min(1, (performance.now() - a.inicio) / 550);
    const e = 1 - (1 - k) ** 3;
    const esfera = new THREE.Spherical(
      THREE.MathUtils.lerp(a.desde.radius, a.hasta.radius, e),
      THREE.MathUtils.lerp(a.desde.phi, a.hasta.phi, e),
      a.desde.theta + a.dTheta * e,
    );
    c.target.lerpVectors(a.objetivo0, a.objetivo1, e);
    camera.position.setFromSpherical(esfera).add(c.target);
    c.update();
    if (k === 1) { animacion.current = null; c.enableDamping = true; } else otroCuadro();
  });

  // Un toque mide (en modo medir); dos toques seguidos centran la cámara ahí.
  function tocar(e) {
    if (e.delta > 8) return;
    const hit = e.intersections.find(i => visible(i.object));
    if (!hit) return;
    e.stopPropagation();
    const ahora = performance.now(), ultimo = toque.current;
    const doble = ultimo && ahora - ultimo.t < 320 && hit.point.distanceTo(ultimo.p) < radio * 0.05;
    toque.current = doble ? null : { t: ahora, p: hit.point.clone() };
    if (modo === "medir" && !doble) { onPunto(hit.point.clone()); return; }
    if (!doble) return;
    const c = controles.current;
    const desde = new THREE.Spherical().setFromVector3(camera.position.clone().sub(c.target));
    const hasta = desde.clone();
    hasta.radius = Math.max(radio * 0.35, desde.radius * 0.6);
    c.enableDamping = false;
    c.update();
    animacion.current = { inicio: performance.now(), desde, dTheta: 0, hasta, objetivo0: c.target.clone(), objetivo1: hit.point.clone() };
    invalidate();
  }

  const r = radio;
  return (
    <>
      <Ambiente />
      <hemisphereLight args={["#ffffff", "#7d828c", 0.55]} />
      <directionalLight position={[r * 1.1, r * 2.2, r * 0.9]} intensity={1.7} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-left={-r * 1.3} shadow-camera-right={r * 1.3} shadow-camera-top={r * 1.3} shadow-camera-bottom={-r * 1.3}
        shadow-camera-near={0.1} shadow-camera-far={r * 6} />
      <directionalLight position={[-r, r * 0.6, -r * 1.2]} intensity={0.45} />
      <primitive object={pieza.raiz} onClick={tocar} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]} receiveShadow>
        <planeGeometry args={[r * 10, r * 10]} />
        <shadowMaterial transparent opacity={0.22} />
      </mesh>
      <Grid infiniteGrid cellSize={0.1} sectionSize={0.5} cellThickness={0.5} sectionThickness={0.9}
        cellColor={grilla[0]} sectionColor={grilla[1]} fadeDistance={r * 6} fadeStrength={2} followCamera={false} />
      {perfil?.length > 0 && <Line points={perfil} segments color={cian} lineWidth={2.5} />}
      {puntos.map((p, i) => (
        <mesh key={i} position={p} renderOrder={10}>
          <sphereGeometry args={[r * 0.012, 16, 12]} />
          <meshBasicMaterial color={cian} depthTest={false} />
        </mesh>
      ))}
      {puntos.length === 2 && (
        <>
          <Line points={puntos} color={cian} lineWidth={2.5} depthTest={false} renderOrder={10} />
          <Html position={puntos[0].clone().lerp(puntos[1], 0.5)} center zIndexRange={[20, 0]}>
            <div className="pieza-medida">{mm(puntos[0].distanceTo(puntos[1]))}</div>
          </Html>
        </>
      )}
      {/* Con el celular parado la pieza entera queda a casi 7 radios. */}
      <OrbitControls ref={controles} makeDefault enableDamping dampingFactor={0.09}
        minDistance={r * 0.08} maxDistance={r * 14} />
    </>
  );
}
