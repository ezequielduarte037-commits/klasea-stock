/* ═══════════════════════════════════════════════════════════════
   Configurador · escena
   Mar de verdad (Water de three) bajo cielos fotográficos (cielo.js), lluvia y
   estrellas, el barco con sus colores, balcones que se rebaten y una
   navegación con estela. Todo cambia con transiciones: cada cuadro se
   acerca un poco al estado pedido.
═══════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as THREE from "three";
import { leerMovimientoReducido } from "@/components/ui/useReducedMotion";
import { LARGO, abrirBalcones, texturaTeca, materialDe } from "../recorrido/barco";
import { crearMateriales } from "../recorrido/acabados";
import { CAPAS, VISTAS, opcionDe } from "./opciones";
import { ambiente, texturaBrillo, texturaRuido } from "./ambiente";
import { alturaOla } from "./olas";
import { crearAgua } from "./agua";
import { crearEstela } from "./estela";
import { texturaInterior } from "./interior";
import { CIELOS_CLIMA, cielosDeHora, crearMaterialCielo, aplicarCielo, luzDelCielo } from "./cielo";
import { crearNavegacion, prenderNavegacion, ubicarCortesia, crearCortesia, prenderCortesia, iluminarConCortesia, anchoFlotacion, texturaAncho } from "./luces";
import { crearRocio } from "./rocio";
import { crearDecoracion } from "./decoracion";

// Azar con semilla: estrellas y gotas siempre en el mismo lugar.
function azar(semilla) {
  let s = semilla;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

const chico = () => typeof window !== "undefined" && window.innerWidth < 900;
// Velocidad de crucero en unidades de escena por segundo (≈ 22 nudos en un 43').
const CRUCERO = 9.5;

/* adentro: el lugar del interior desde donde se mira ({ ojo, mira }), o null
   afuera. plafones: dónde van las luces del interior. decoracion: lo que se
   arma adentro (objetos, tiras LED, espejo; ver decoracion.js). */
export default function Escena({ modelo, cielos, eleccion, vista, hora, clima, balcones, luces, navegando, indicador, intro, subir = 0, renderRef, colorSubacuatica = "#2f8dff", adentro = null, plafones = null, decoracion = null }) {
  // Estado compartido entre el mundo y el barco (velocidad, factor de noche).
  const comun = useRef({ vel: 0, noche: 0, dia: 1, fuerzaOla: 1, tiempoOla: 0, avanceX: 0, colorSub: new THREE.Color("#2f8dff"), luzEspuma: new THREE.Color(1, 1, 1), sol: new THREE.Vector3(0, 1, 0) });
  useEffect(() => { comun.current.colorSub.set(colorSubacuatica); }, [colorSubacuatica]);
  useEffect(() => { comun.current.adentro = !!adentro; }, [adentro]);
  return (
    <>
      <Mundo modelo={modelo} hora={hora} clima={clima} cielos={cielos} comun={comun} />
      <Barco modelo={modelo} eleccion={eleccion} balcones={balcones} luces={luces} navegando={navegando} comun={comun} indicador={indicador} plafones={plafones} decoracion={decoracion} />
      {/* Adentro la cámara queda parada en un lugar y se mira alrededor:
          arrastrar gira la vista (como mover la cabeza), sin zoom. */}
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.07}
        enableZoom={!adentro} rotateSpeed={adentro ? -0.32 : 1}
        minDistance={adentro ? 0.05 : LARGO * 0.22} maxDistance={adentro ? 0.05 : LARGO * 4}
        minPolarAngle={adentro ? Math.PI * 0.18 : 0} maxPolarAngle={adentro ? Math.PI * 0.82 : Math.PI / 2 - 0.05} />
      <Camara modelo={modelo} vista={vista} intro={intro} subir={subir} adentro={adentro} />
      <Efectos renderRef={renderRef} comun={comun} />
    </>
  );
}

/* ─────────────── Imagen final ─────────────── */
/* Se dibuja en HDR y recién al final pasa por el tone mapping: así lo que
   brilla de verdad (luces, destellos del sol en el agua, el sol mismo) se
   abre en un resplandor suave, como en una cámara. renderRef.current queda
   apuntando a esta función (para la foto). */
function Efectos({ renderRef, comun }) {
  const gl = useThree(st => st.gl);
  const escena = useThree(st => st.scene);
  const camara = useThree(st => st.camera);
  const size = useThree(st => st.size);
  const efecto = useMemo(() => {
    // MSAA en el destino: al dibujar en un render target se pierde el antialias del lienzo.
    // Con plantilla (stencil): la bacha de la cocina se ve a través de la mesada.
    const destino = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true });
    const composer = new EffectComposer(gl, destino);
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 3.2);
    // Transición gradual en el umbral del bloom: evita que luces chicas parpadeen
    // al cruzar un píxel cuando el barco se mece sobre las olas.
    bloom.highPassUniforms.smoothWidth.value = 1.2;
    // Antes del resplandor se limpian píxeles inválidos (NaN o infinito): el
    // bloom los agrandaba en cuadraditos negros al mover la cámara.
    const limpiar = new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }",
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main() {
          vec4 c = texture2D( tDiffuse, vUv );
          if ( any( isnan( c ) ) || any( isinf( c ) ) ) c = vec4( 0.0, 0.0, 0.0, 1.0 );
          gl_FragColor = clamp( c, 0.0, 60.0 );
        }`,
    });
    // Oclusión ambiental (sólo adentro): oscurece rincones, el encuentro de
    // muebles y piso y lo que queda bajo colchones y almohadones. Sin ella el
    // interior, iluminado parejo, se veía chato, como un plano de CAD.
    const ao = new GTAOPass(escena, camara, 1, 1);
    // Radio en unidades de la escena: unos 50 cm reales.
    ao.updateGtaoMaterial({ radius: 0.36, distanceExponent: 1.5, thickness: 2, scale: 1.3, samples: chico() ? 8 : 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: chico() ? 8 : 16 });
    ao.blendIntensity = 0.9;
    ao.enabled = false;
    // El mar no cuenta para la oclusión (adentro se recorta en el shader del
    // agua, que el pase de normales no usa: si no, tapaba el piso). Tampoco
    // el vidrio, las luces de las tiras LED ni el espejo (sinAo): se verían
    // como sólidos opacos.
    const fuera = { agua: null, sinAo: null };
    const dibujarAo = ao.render.bind(ao);
    ao.render = (...args) => {
      const ocultos = [fuera.agua, fuera.sinAo].filter(Boolean);
      const antes = ocultos.map(o => o.visible);
      ocultos.forEach(o => { o.visible = false; });
      dibujarAo(...args);
      ocultos.forEach((o, i) => { o.visible = antes[i]; });
    };
    const pasadas = [new RenderPass(escena, camara), ao, limpiar, bloom, new OutputPass()];
    pasadas.forEach(p => composer.addPass(p));
    return { composer, pasadas, bloom, ao, fuera };
  }, [gl, escena, camara]);
  useEffect(() => {
    const pr = gl.getPixelRatio();
    efecto.composer.setPixelRatio(pr);
    efecto.composer.setSize(size.width, size.height);
  }, [efecto, gl, size]);
  useEffect(() => {
    if (renderRef) renderRef.current = () => efecto.composer.render();
    return () => {
      if (renderRef) renderRef.current = null;
      efecto.pasadas.forEach(p => p.dispose?.());
      efecto.composer.dispose();
    };
  }, [efecto, renderRef]);
  // Prioridad 1: desde acá se dibuja cada cuadro (R3F deja de hacerlo solo).
  const vivo = useRef(null);
  useEffect(() => { vivo.current = { efecto, comun }; }, [efecto, comun]);
  useFrame((_, dt) => {
    const v = vivo.current;
    if (!v) return;
    const c = v.comun.current;
    v.efecto.ao.enabled = !!c.adentro;
    v.efecto.fuera.agua = c.agua;
    v.efecto.fuera.sinAo = c.sinAo;
    v.efecto.composer.render(dt);
  }, 1);
  return null;
}

/* ─────────────── Cielo, mar, lluvia, estrellas ─────────────── */
function Mundo({ modelo, hora, clima, cielos, comun }) {
  const get = useThree(st => st.get);
  const obj = useMemo(() => {
    // Cúpula con los cielos fotográficos. La misma va en la escena de los
    // reflejos (de ahí salen la luz ambiente y lo que reflejan casco y cromados).
    const matCielo = crearMaterialCielo();
    const seguir = function (r, sc, camara) { this.matrixWorld.makeTranslation(camara.position.x, camara.position.y, camara.position.z); };
    const cupula = (radio) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(radio, 64, 32), matCielo);
      m.frustumCulled = false;
      m.onBeforeRender = seguir;
      m.renderOrder = -10;
      return m;
    };
    const domo = cupula(10);
    const domoEnv = cupula(10);
    const escenaEnv = new THREE.Scene();
    escenaEnv.add(domoEnv);
    // El mar en los reflejos: abajo agua, arriba cielo.
    const marEnv = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshBasicMaterial({ color: "#0e3a48" }));
    marEnv.rotation.x = -Math.PI / 2;
    marEnv.position.y = -3;
    escenaEnv.add(marEnv);

    const gl = get().gl;
    const normales = new THREE.TextureLoader().load("/textures/recorrido/waternormals.jpg", t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
    // Filtrado anisotrópico: sin él, mirando el mar de costado el relieve se
    // promediaba en franjas borrosas (el agua se veía "barrida").
    normales.anisotropy = gl.capabilities.getMaxAnisotropy();
    // El casco en la flotación: la espuma y la estela nacen de su forma real.
    const flot = anchoFlotacion(modelo) || { x0: -LARGO / 2, x1: LARGO / 2, max: LARGO * 0.15, popa: -LARGO / 2, mangaPopa: LARGO * 0.12 };
    const anchoTex = flot.liso ? texturaAncho(flot) : null;
    const ruidoTex = texturaRuido();
    const estela = crearEstela(gl, flot, ruidoTex, anchoTex, { chico: chico() });
    const agua = crearAgua({ normales, ruido: ruidoTex, flot, anchoTex, estela, chico: chico() });

    // Estrellas en la media esfera de arriba (el cielo de noche las trae
    // finitas; éstas las marcan un poco más).
    const r = azar(11);
    const N = 1400;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const az = r() * Math.PI * 2, el = Math.asin(r() * 0.98 + 0.02);
      pos.set([Math.cos(el) * Math.cos(az) * 3000, Math.sin(el) * 3000, Math.cos(el) * Math.sin(az) * 3000], i * 3);
    }
    const geoEst = new THREE.BufferGeometry();
    geoEst.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const estrellas = new THREE.Points(geoEst, new THREE.PointsMaterial({ color: "#ffffff", size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));

    // Lluvia: segmentos que caen en una caja alrededor del barco.
    const G = 2600;
    const gotas = new Float32Array(G * 6);
    for (let i = 0; i < G; i++) {
      const x = (r() - 0.5) * 70, y = r() * 34, z = (r() - 0.5) * 70;
      gotas.set([x, y, z, x + 0.12, y + 0.7, z], i * 6);
    }
    const geoLl = new THREE.BufferGeometry();
    geoLl.setAttribute("position", new THREE.BufferAttribute(gotas, 3));
    const lluvia = new THREE.LineSegments(geoLl, new THREE.LineBasicMaterial({ color: "#d4dde2", transparent: true, opacity: 0, fog: false, depthWrite: false }));
    lluvia.frustumCulled = false;

    // Sol con sombra: el hardtop sombrea el cockpit y el casco el agua.
    const sol = new THREE.DirectionalLight("#ffffff", 2);
    sol.castShadow = true;
    sol.shadow.mapSize.setScalar(chico() ? 1024 : 2048);
    Object.assign(sol.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 20, far: 110 });
    sol.shadow.bias = -0.0004;
    sol.shadow.normalBias = 0.03;
    sol.shadow.radius = 3;
    const lunaLuz = new THREE.DirectionalLight("#9fb3ff", 0);
    const hemi = new THREE.HemisphereLight("#dfe9f2", "#29363c", 0.2);

    const pmrem = new THREE.PMREMGenerator(gl);
    // Adentro la luz de ambiente es la de una habitación clara (paredes y
    // techo blancos que rebotan la luz), no la del cielo abierto.
    const sala = new RoomEnvironment();
    const envInterior = pmrem.fromScene(sala, 0.04).texture;
    sala.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
    return { matCielo, domo, domoEnv, escenaEnv, marEnv, agua, normales, anchoTex, ruidoTex, estela, estrellas, lluvia, sol, lunaLuz, hemi, pmrem, envInterior, env: null };
  }, [get, modelo]);

  // Estado actual (interpolado): la hora corre hacia la elegida como un
  // time-lapse, pasando por los cielos intermedios.
  const act = useRef(null);
  const vivo = useRef(null);
  useEffect(() => { vivo.current = { obj, hora, clima, cielos, comun }; }, [obj, hora, clima, cielos, comun]);

  useEffect(() => {
    const { scene: escena } = get();
    escena.fog = new THREE.FogExp2("#cfdbe3", 0.0008);
    escena.background = null;
    return () => {
      escena.fog = null;
      escena.environment = null;
      obj.env?.dispose();
      obj.envInterior.dispose();
      obj.pmrem.dispose();
      obj.agua.geometry.dispose(); obj.agua.material.dispose(); obj.normales.dispose();
      obj.anchoTex?.dispose(); obj.ruidoTex.dispose(); obj.estela.dispose();
      obj.estrellas.geometry.dispose(); obj.estrellas.material.dispose();
      obj.lluvia.geometry.dispose(); obj.lluvia.material.dispose();
      obj.domo.geometry.dispose(); obj.domoEnv.geometry.dispose(); obj.matCielo.dispose();
      obj.marEnv.geometry.dispose(); obj.marEnv.material.dispose();
    };
  }, [get, obj]);

  useFrame(({ scene: escena, gl, clock, camera }, dt) => {
    if (!vivo.current) return;
    const { obj: o, hora: metaHora, clima: metaClima, cielos: cs } = vivo.current;
    const c = vivo.current.comun.current;
    const k = 1 - Math.exp(-dt * 1.6);
    if (!act.current) act.current = { hora: metaHora, tc: CIELOS_CLIMA[metaClima] ? 1 : 0, cUltimo: CIELOS_CLIMA[metaClima] || null, amb: ambiente(metaHora, metaClima), ultimoEnv: -1, envClave: "" };
    const a = act.current;
    a.hora += (metaHora - a.hora) * k;
    if (Math.abs(metaHora - a.hora) < 0.002) a.hora = metaHora;
    const cClima = CIELOS_CLIMA[metaClima] || null;
    if (cClima) a.cUltimo = cClima;
    a.tc += ((cClima ? 1 : 0) - a.tc) * k;
    // Lo demás del ambiente (noche, lluvia, olas, niebla) sigue a la hora actual.
    const meta = ambiente(a.hora, metaClima);
    ["dia", "noche", "lluvia", "ola", "niebla", "exposicion"].forEach(n => { a.amb[n] += (meta[n] - a.amb[n]) * k; });
    const m = a.amb;
    c.noche = m.noche;
    c.dia = m.dia;

    const hc = cielosDeHora(a.hora);
    aplicarCielo(o.matCielo, hc, a.tc, cs.texturas, cs.datos, a.cUltimo);
    const luz = luzDelCielo(hc, a.cUltimo, a.tc, cs.datos);

    // Azul del mar visto desde arriba (el resto del brillo lo pone el reflejo del cielo).
    const agua = new THREE.Color("#14506e").multiplyScalar(0.1 + 0.9 * m.dia * (1 - a.tc * 0.35));
    // Reflejos: se regeneran cuando el cielo cambió (no más de ~3 por segundo).
    const t = clock.elapsedTime;
    const clave = `${a.hora.toFixed(2)}|${a.tc.toFixed(2)}`;
    if (t - a.ultimoEnv > 0.33 && clave !== a.envClave) {
      o.marEnv.material.color.copy(agua).multiplyScalar(1.4).add(luz.horizonte.clone().multiplyScalar(0.12));
      const nuevo = o.pmrem.fromScene(o.escenaEnv).texture;
      o.env?.dispose();
      o.env = nuevo;
      a.ultimoEnv = t;
      a.envClave = clave;
    }
    // Adentro el cielo ilumina menos (entra por las ventanas): así se notan
    // los plafones y los rincones no quedan chatos.
    escena.environment = c.adentro ? o.envInterior : o.env;
    escena.environmentIntensity = c.adentro ? 0.55 + 0.3 * m.dia : 1;
    c.agua = o.agua;

    o.sol.position.copy(luz.dir).multiplyScalar(60);
    o.sol.intensity = luz.fuerza * 3.4;
    o.sol.color.copy(luz.solColor);
    o.lunaLuz.position.copy(luz.dir).multiplyScalar(60);
    o.lunaLuz.intensity = m.noche * 0.55;
    o.hemi.intensity = 0.08 + 0.12 * m.dia;

    const u = o.agua.material.uniforms;
    u.time.value += dt * (0.55 + c.vel * 0.04);
    u.sunDirection.value.copy(luz.dir);
    u.sunColor.value.copy(luz.solColor).multiplyScalar(luz.fuerza * 1.3 * (1 - m.noche));
    u.waterColor.value.copy(agua);
    // Olas: más altas con nublado y lluvia; espuma en las crestas con viento.
    const fuerzaOla = m.ola / 2.2;
    u.fuerzaOla.value = fuerzaOla;
    u.tiempoOla.value = clock.elapsedTime;
    u.crestas.value = THREE.MathUtils.clamp((fuerzaOla - 1.15) / 1.1, 0, 1);
    u.oleaje.value = 0.95 + (fuerzaOla - 1) * 0.25;
    u.colorSSS.value.set("#1f8a7c").multiplyScalar(0.25 + luz.fuerza * 0.55);
    c.fuerzaOla = fuerzaOla;
    c.tiempoOla = clock.elapsedTime;
    c.avanceX = u.avance.value.x;
    // La malla del agua sigue a la cámara (en pasos de su grilla, para que no "nade").
    const paso = o.agua.userData.paso;
    o.agua.position.set(Math.round(camera.position.x / paso) * paso, 0, Math.round(camera.position.z / paso) * paso);
    u.avance.value.x += c.vel * dt;
    u.velocidad.value = c.vel / CRUCERO;
    // La estela: el agua se lleva la espuma a la misma velocidad que corre.
    o.estela.actualizar(dt, c.vel, c.vel / CRUCERO, u.avance.value);
    u.estelaTex.value = o.estela.textura;
    u.estelaDesfase.value = o.estela.desfase;
    u.subacuatica.value = c.subacuatica || 0;
    // Dentro del barco no hay agua: se ve el piso de los camarotes.
    u.adentro.value = c.adentro ? 1 : 0;
    // Misma intensidad aparente en todos los colores (el blanco encandilaba).
    const lumSub = c.colorSub.r * 0.2126 + c.colorSub.g * 0.7152 + c.colorSub.b * 0.0722;
    u.colorSub.value.copy(c.colorSub).multiplyScalar(Math.min(1, 0.32 / Math.max(lumSub, 0.05)));
    // La espuma toma la luz del momento: blanca de día, apagada de noche.
    // Casi blanca: sólo un toque del color de la luz (si no, al atardecer quedaba rosada, como sucia).
    const le = u.luzEspuma.value.copy(luz.horizonte).multiplyScalar(0.45).add(luz.solColor.clone().multiplyScalar(luz.fuerza * 0.9)).addScalar(0.015);
    const lum = le.r * 0.2126 + le.g * 0.7152 + le.b * 0.0722;
    le.lerp(new THREE.Color(lum, lum, lum * 1.03), 0.88).multiplyScalar(1.15);
    // Con el sol bajo la espuma igual queda clara: la ilumina todo el cielo y
    // sus grumos reciben al sol de costado.
    const lumCielo = luz.horizonte.r * 0.2126 + luz.horizonte.g * 0.7152 + luz.horizonte.b * 0.0722;
    const minimo = lumCielo * 0.8 * (1 - m.noche);
    if (lum * 1.15 < minimo) le.multiplyScalar(minimo / Math.max(lum * 1.15, 1e-3));
    // El rocío del barco toma la misma luz.
    c.luzEspuma.copy(le);
    c.sol.copy(luz.dir);
    // Agua aireada: turquesa lechoso con la luz del momento.
    u.colorAireada.value.set("#4fb8b0").multiplyScalar(0.05 + 0.5 * m.dia * (1 - a.tc * 0.3));

    o.estrellas.material.opacity = m.noche * (1 - a.tc) * 0.6;

    o.lluvia.material.opacity = m.lluvia * 0.45;
    if (m.lluvia > 0.02) {
      const p = o.lluvia.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 2) {
        let y = p.getY(i) - dt * 26;
        let x = p.getX(i) - dt * (3 + c.vel);
        if (y < -1) y += 35;
        if (x < -35) x += 70;
        p.setXYZ(i, x, y, p.getZ(i));
        p.setXYZ(i + 1, x + 0.12 + c.vel * 0.02, y + 0.7, p.getZ(i));
      }
      p.needsUpdate = true;
    }

    // La niebla toma el color del horizonte del cielo: el mar se funde con él.
    escena.fog.color.copy(luz.horizonte).multiplyScalar(0.92);
    escena.fog.density = m.niebla;
    // Adentro, la curva neutra (colores fieles, como un render de interiorismo).
    gl.toneMapping = c.adentro ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = c.adentro ? 0.9 : 0.5 + m.noche * 0.35;
  });

  return (
    <>
      <primitive object={obj.domo} />
      <primitive object={obj.agua} />
      <primitive object={obj.estrellas} />
      <primitive object={obj.lluvia} />
      <primitive object={obj.sol} />
      <primitive object={obj.lunaLuz} />
      <primitive object={obj.hemi} />
    </>
  );
}

/* Spots embutidos en el techo del interior: se busca con rayos dónde hay un
   ambiente (piso con techo encima, a la altura de una persona o de un
   camarote) y ahí va un aro de luz cada medio metro. Todos en una sola
   malla instanciada (un dibujo). */
function crearSpots(modelo) {
  const geo = new THREE.CircleGeometry(0.024, 20).rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: "#000000", side: THREE.DoubleSide, toneMapped: false });
  const lugares = [];
  const ap = modelo.aparte;
  if (ap) {
    ap.raiz.updateMatrixWorld(true);
    modelo.raiz.updateMatrixWorld(true);
    // El techo del salón es la cara de abajo de la cubierta (modelo exterior).
    const mallas = [];
    [ap.raiz, modelo.raiz].forEach(r => r.traverse(o => { if (o.isMesh && (o.name || "") !== "vidrios") mallas.push(o); }));
    const pisos = mallas.filter(m => m.name === "piso");
    const caja = new THREE.Box3().setFromObject(ap.raiz);
    // Las caras del Rhino vienen orientadas de cualquier manera: los rayos
    // tienen que pegar de los dos lados.
    const lados = mallas.map(m => [m, m.material.side]);
    mallas.forEach(m => { m.material.side = THREE.DoubleSide; });
    const rayo = new THREE.Raycaster();
    // El interior va en la capa 1 (fuera del reflejo del agua).
    rayo.layers.enableAll();
    const abajo = new THREE.Vector3(0, -1, 0), arriba = new THREE.Vector3(0, 1, 0);
    for (let x = caja.min.x + 0.35; x <= caja.max.x - 0.3; x += 0.5) {
      for (let z = -0.6; z <= 0.61; z += 0.6) {
        rayo.set(new THREE.Vector3(x, caja.max.y + 1, z), abajo);
        const piso = rayo.intersectObjects(pisos, false)[0];
        if (!piso) continue;
        rayo.set(piso.point.clone().add(new THREE.Vector3(0, 0.05, 0)), arriba);
        const techo = rayo.intersectObjects(mallas, false)[0];
        const alto = techo ? techo.point.y - piso.point.y : 0;
        // De pie (salón, cocina) o un camarote bajo; si hay un mueble encima, nada.
        if (alto > 0.62 && alto < 1.8) lugares.push(techo.point.clone().add(new THREE.Vector3(0, -0.004, 0)));
      }
    }
    lados.forEach(([m, lado]) => { m.material.side = lado; });
  }
  const malla = new THREE.InstancedMesh(geo, mat, Math.max(1, lugares.length));
  malla.count = lugares.length;
  lugares.forEach((p, i) => malla.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  malla.frustumCulled = false;
  malla.visible = false;
  malla.layers.set(1);
  return { malla, geo, mat };
}

/* ─────────────── Barco ─────────────── */
function Barco({ modelo, eleccion, balcones, luces, navegando, comun, indicador, plafones, decoracion }) {
  const mats = useMemo(() => {
    const m = crearMateriales();
    // Con el reflejo del mar ya hay dos pasadas por cuadro: el vidrio va como
    // transparencia común (la transmisión sumaría una tercera).
    Object.assign(m.lista.vidrios, { transmission: 0, transparent: true, opacity: 0.74 });
    // Paneles y muebles del interior: laca blanca satinada, como en los renders
    // del astillero (el gris de antes apagaba los ambientes).
    m.lista.interior.color.set("#f3f0eb");
    m.lista.interior.roughness = 0.42;
    m.lista.vidrios.color.set("#151b1f");
    // Contornos de los modelos sin materiales (K64): grafito suave sobre el blanco.
    m.linea.color.set("#2a2d30");
    m.linea.opacity = 0.35;
    return m;
  }, []);
  useEffect(() => () => mats.dispose(), [mats]);
  // Cada pieza con el material de su acabado (el costado va como casco, los
  // balcones como su grupo). Sin contornos: acá manda el material.
  const get = useThree(st => st.get);
  useEffect(() => {
    Object.entries(modelo.piezas).forEach(([nombre, m]) => {
      m.material = mats.lista[materialDe(nombre)] || mats.lista.detalle;
      // Sombras del sol: todo el exterior las da y las recibe (el vidrio sólo las recibe).
      m.castShadow = materialDe(nombre) !== "vidrios";
      m.receiveShadow = true;
    });
    // El interior va adentro del casco: se ve por ventanas y parabrisas (sin
    // él, el barco se veía hueco, "transparente"). Va en la capa 1, que la
    // cámara del reflejo del agua no dibuja: no suma costo al reflejo.
    if (modelo.aparte) {
      Object.entries(modelo.aparte.piezas).forEach(([nombre, m]) => {
        m.material = mats.lista[materialDe(nombre)] || mats.lista.detalle;
        m.receiveShadow = true;
      });
      modelo.aparte.raiz.visible = true;
      modelo.aparte.raiz.traverse(o => o.layers.set(1));
      get().camera.layers.enable(1);
    }
    // Forro: una copia del casco 1,6 cm hacia adentro con el mismo material.
    // Las superficies del Rhino no están soldadas en las costuras y por las
    // micro-rendijas se veía el cielo (una línea de puntitos al mover la
    // cámara); ahora detrás de cada rendija hay casco.
    const forros = ["casco", "costado"].map(n => modelo.piezas[n]).filter(Boolean).map(m => {
      const geo = m.geometry.clone();
      const pos = geo.attributes.position;
      m.updateMatrixWorld(true);
      const d = 0.012 / m.matrixWorld.getMaxScaleOnAxis();
      // Corrimiento sólo horizontal, hacia el eje del barco: siguiendo las
      // normales, las caras que vienen invertidas del Rhino lo sacaban hacia
      // afuera (piezas en proa, una placa sobre la plataforma de baño).
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        if (Math.abs(z) > d * 2) pos.setZ(i, z - Math.sign(z) * d);
      }
      const f = new THREE.Mesh(geo, m.material);
      f.receiveShadow = true;
      m.add(f);
      return f;
    }).filter(Boolean);
    const quitarForros = () => forros.forEach(f => { f.removeFromParent(); f.geometry.dispose(); });
    if (modelo.lineas) {
      const extras = Object.values(modelo.piezas).map(m => {
        const b = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 32), mats.linea);
        m.add(b);
        return b;
      });
      return () => { extras.forEach(b => { b.removeFromParent(); b.geometry.dispose(); }); quitarForros(); };
    }
    return quitarForros;
  }, [modelo, mats, get]);

  const extras = useMemo(() => {
    // Estela, espuma, sombra del casco y brillo subacuático van dentro del
    // agua (Mundo); acá quedan las luces del barco.
    const brillo = texturaBrillo();
    const luzPopa = new THREE.PointLight("#3fd6ff", 0, LARGO * 0.6, 1.6);
    luzPopa.position.set(-LARGO / 2 - 0.4, 0.15, 0);

    // Cortesía: LEDs bajos en la borda y en el espejo de popa y las tiras
    // del hardtop; su luz se calcula dentro de los materiales del barco.
    const cortesia = crearCortesia(ubicarCortesia(modelo), modelo);
    const navegacion = crearNavegacion(modelo, brillo);
    const rocio = crearRocio(modelo, { chico: chico() });
    // Plafones del interior: luz cálida que sólo se prende en la vista
    // interior (están siempre, apagados, para no recompilar los materiales).
    const interior = (plafones || []).map(p => {
      const l = new THREE.PointLight("#ffd9b3", 0, 2.8, 2);
      l.position.set(...p);
      return l;
    });
    const spots = crearSpots(modelo);
    // Lo que hace habitado al interior (objetos, tiras LED, espejo, pantalla):
    // se arma la primera vez que se entra, tapado por el fundido; así no
    // demora la carga del configurador.
    const deco = { datos: decoracion, actual: null };
    return { brillo, luzPopa, cortesia, navegacion, rocio, interior, spots, deco };
  }, [modelo, plafones, decoracion]);
  useEffect(() => {
    ["teca", "cubierta", "casco", "tapizado", "almohadon", "negro", "detalle", "acrilico", "cromo", "piedra", "madera"]
      .forEach(n => { if (mats.lista[n]) iluminarConCortesia(mats.lista[n], extras.cortesia.uniforms); });
    if (mats.lista.led) {
      mats.lista.led.polygonOffset = true;
      mats.lista.led.polygonOffsetFactor = -1;
      mats.lista.led.polygonOffsetUnits = -2;
    }
  }, [mats, extras]);
  useEffect(() => () => {
    const e = extras;
    e.cortesia.geo.dispose();
    e.cortesia.halos?.forEach(({ m }) => m.material.dispose());
    e.rocio.geo.dispose();
    e.rocio.mat.dispose();
    e.cortesia.mat.dispose();
    e.navegacion.forEach(({ g }) => g.children.forEach(s => s.material.dispose()));
    e.brillo.dispose();
    e.spots.geo.dispose();
    e.spots.mat.dispose();
    if (e.deco.actual) { e.deco.actual.grupo.removeFromParent(); e.deco.actual.dispose(); }
  }, [extras]);

  // Colores elegidos → color objetivo de cada material (y la textura que corresponda).
  const metas = useRef({});
  useEffect(() => {
    CAPAS.forEach(capa => {
      const op = opcionDe(capa.id, eleccion[capa.id]);
      const m = mats.lista[capa.grupo];
      if (!m || !op) return;
      // La teca, los mármoles y las maderas traen el color en la textura (cada
      // variante es otra textura): el material va en blanco y el color de la
      // opción es sólo para el botón. "lisa": sin foto, manda el color.
      let mapa;
      if (capa.id === "teca") mapa = mats.tex(`teca-${op.teca}`, () => texturaTeca(op.teca));
      else if (op.textura === "lisa") mapa = null;
      else if (op.textura) mapa = mats.tex(op.textura, () => texturaInterior(op.textura));
      metas.current[capa.grupo] = new THREE.Color(mapa ? "#ffffff" : op.c);
      if (mapa !== undefined && m.map !== mapa) { m.map = mapa; m.needsUpdate = true; }
    });
  }, [eleccion, mats]);

  const grupo = useRef(null);
  const vivo = useRef(null);
  useEffect(() => { vivo.current = { modelo, mats, balcones, luces, navegando, extras, comun, indicador }; }, [modelo, mats, balcones, luces, navegando, extras, comun, indicador]);
  const apertura = useRef(balcones ? 1 : 0);
  const boya = useRef({ alto: 0, cabeceo: 0, rolido: 0 });

  useFrame((st, dt) => {
    const { clock, camera } = st;
    if (!vivo.current || !grupo.current) return;
    const v = vivo.current;
    const k = 1 - Math.exp(-dt * 4);
    Object.entries(metas.current).forEach(([g, color]) => v.mats.lista[g]?.color.lerp(color, k));

    // Balcones: suben o bajan con una curva suave (~1,6 s).
    const metaAp = v.balcones ? 1 : 0;
    const paso = dt / 1.6;
    apertura.current = metaAp > apertura.current ? Math.min(metaAp, apertura.current + paso) : Math.max(metaAp, apertura.current - paso);
    const x = apertura.current;
    abrirBalcones(v.modelo, x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

    // Navegación: acelera y frena de a poco; la proa sube con la velocidad.
    const c = v.comun.current;
    const metaVel = v.navegando ? CRUCERO : 0;
    c.vel += (metaVel - c.vel) * (1 - Math.exp(-dt * (v.navegando ? 0.45 : 0.7)));
    const f = c.vel / CRUCERO;
    const t = clock.elapsedTime;
    // Adentro el barco queda quieto (la cámara está parada en el piso).
    const e = v.extras;
    const fx = e.fx ||= { agua: 0, nav: 0, cort: 0, int: 0 };
    fx.int += ((c.adentro ? 1 : 0) - fx.int) * (c.adentro ? 1 : k);
    const libre = 1 - fx.int;
    // Al planear la proa sube pero la popa no se hunde: el barco gira sobre la
    // popa y sube entero (antes giraba sobre el centro y la planchada quedaba
    // bajo el agua).
    // Flota sobre las mismas olas que se ven: se mide el agua en proa, popa
    // y los dos costados y el casco sigue esa superficie, con inercia (un
    // barco de 10 t no copia cada ola chica).
    // (junto al casco el agua se calma: 0,6 de la ola, igual que en el shader)
    const ola = (x, z) => alturaOla(x + c.avanceX, z, c.tiempoOla, c.fuerzaOla) * 0.6;
    const hProa = ola(LARGO * 0.4, 0), hPopa = ola(-LARGO * 0.42, 0);
    const hBabor = ola(0, -LARGO * 0.14), hEstribor = ola(0, LARGO * 0.14);
    const b = boya.current;
    const kb = 1 - Math.exp(-dt * 1.4);
    b.alto += ((hProa + hPopa + hBabor + hEstribor) / 4 - b.alto) * kb;
    b.cabeceo += (Math.atan2(hProa - hPopa, LARGO * 0.82) * 0.85 - b.cabeceo) * kb;
    b.rolido += (Math.atan2(hBabor - hEstribor, LARGO * 0.28) * 0.8 - b.rolido) * kb;
    const quieto = (1 - f * 0.6) * libre;
    // Al planear la proa sube pero la popa no se hunde: gira sobre la popa.
    const cabeceo = b.cabeceo * quieto + f * 0.045 + Math.sin(t * 1.9) * 0.003 * f;
    grupo.current.rotation.z = cabeceo;
    grupo.current.position.y = b.alto * quieto + Math.max(0, f * 0.045) * (LARGO / 2) + f * 0.05 + Math.sin(t * 2.4) * 0.008 * f;
    grupo.current.rotation.x = b.rolido * quieto;

    // Luces: se encienden y apagan con un fundido corto; de día casi no se notan.
    const L = v.luces;
    const nivel = prendida => (prendida ? 0.3 + 0.7 * c.noche : 0);
    fx.agua += (nivel(L.agua) - fx.agua) * k;
    fx.nav += (nivel(L.navegacion) - fx.nav) * k;
    fx.cort += (nivel(L.cortesia) - fx.cort) * k;
    c.subacuatica = fx.agua;
    // Rocío: puntos con tamaño en pantalla (píxeles por unidad a distancia 1).
    const escala = (st.size.height * st.viewport.dpr * camera.projectionMatrix.elements[5]) / 2;
    e.rocio.actualizar(Math.min(dt, 0.1), f, c.luzEspuma, c.sol, escala);
    e.luzPopa.intensity = fx.agua * 6;
    e.luzPopa.color.copy(c.colorSub);
    prenderNavegacion(e.navegacion, camera, fx.nav);
    prenderCortesia(e.cortesia, fx.cort, grupo.current, camera);
    const led = v.mats.lista.led;
    if (led) { led.emissive.set("#ffd6a4"); led.emissiveIntensity = fx.cort * 2.6; }
    // Plafones del interior: suaves de día (entra luz por las ventanas), más de noche.
    e.interior.forEach(l => { l.intensity = fx.int * (0.35 + 1.1 * c.noche); });
    // Los spots del techo: prendidos adentro (blanco cálido; el resplandor los abre).
    e.spots.mat.color.set("#fff1dc").multiplyScalar(fx.int * (5 + 7 * c.noche));
    e.spots.malla.visible = fx.int > 0.01;
    // Desde adentro los vidrios se ven claros (afuera van ahumados): por las
    // ventanas se ve el mar y el cielo.
    const vidrios = v.mats.lista.vidrios;
    if (vidrios) vidrios.opacity = 0.74 - 0.52 * fx.int;
    // Decoración: sólo adentro; el pie de cama y el almohadón siguen el color
    // de los almohadones elegidos.
    if (c.adentro && e.deco.datos && !e.deco.actual) {
      e.deco.actual = crearDecoracion(e.deco.datos, { chico: chico() });
      grupo.current.add(e.deco.actual.grupo);
    }
    const deco = e.deco.actual;
    if (deco) {
      const lienzo = st.gl.domElement;
      deco.actualizar({ int: fx.int, noche: c.noche, acento: v.mats.lista.cojin?.color, agua: c.agua, ancho: lienzo.width, alto: lienzo.height });
    }
    c.sinAo = deco?.efimeros || null;

    if (v.indicador?.current) {
      const nudos = (c.vel / v.modelo.raiz.scale.x) * 1.944;
      const txt = String(Math.round(nudos));
      if (v.indicador.current.textContent !== txt) v.indicador.current.textContent = txt;
    }
  });

  return (
    <>
      <group ref={grupo}>
        <primitive object={modelo.raiz} />
        {modelo.aparte && <primitive object={modelo.aparte.raiz} />}
        <primitive object={extras.cortesia.grupo} />
        {extras.navegacion.map(({ g }, i) => <primitive key={`n${i}`} object={g} />)}
        {extras.interior.map((l, i) => <primitive key={`p${i}`} object={l} />)}
        <primitive object={extras.spots.malla} />
      </group>
      <primitive object={extras.luzPopa} />
      <primitive object={extras.rocio.puntos} />
    </>
  );
}

/* ─────────────── Cámara ─────────────── */
/* Viaja a la vista elegida; si nadie toca nada un rato, gira sola alrededor
   del barco, como en un salón de exposición. Adentro se para en el lugar
   elegido, a la altura de los ojos, con un lente más abierto (como se ve un
   ambiente estando en él). Los cambios de adentro a afuera van tapados por
   un fundido de la pantalla: la cámara salta, no atraviesa paredes. */
function Camara({ modelo, vista, intro, subir, adentro }) {
  const get = useThree(st => st.get);
  const corrimiento = useRef({ actual: 0, meta: 0 });
  useEffect(() => { corrimiento.current.meta = subir; }, [subir]);
  const viaje = useRef(null);
  const quieto = useRef(0);
  const primera = useRef(true);
  const estabaAdentro = useRef(false);

  useEffect(() => {
    const { camera } = get();
    // Adentro hay muebles a centímetros: el plano cercano baja (y el lejano,
    // para no perder precisión de profundidad).
    camera.near = adentro ? 0.02 : 0.5;
    camera.far = adentro ? 900 : 5000;
    camera.updateProjectionMatrix();
  }, [adentro, get]);

  useEffect(() => {
    const { camera, controls } = get();
    if (adentro) {
      const ojo = new THREE.Vector3(...adentro.ojo);
      const dir = new THREE.Vector3(...adentro.mira).sub(ojo).normalize();
      camera.position.copy(ojo);
      controls?.target.copy(ojo).addScaledVector(dir, 0.05);
      controls?.update();
      viaje.current = null;
      quieto.current = 0;
      estabaAdentro.current = true;
      return;
    }
    const v = VISTAS.find(x => x.id === vista) || VISTAS[0];
    const a = v.foco.ancla && modelo.anclas?.[v.foco.ancla];
    const s = modelo.enU(v.foco.u);
    const foco = a ? new THREE.Vector3(...a) : new THREE.Vector3(s.x, s.cubierta + (v.foco.alto ?? 0) * modelo.D, 0);
    const r = v.dist * LARGO * Math.max(1, 1.25 / camera.aspect);
    const az = THREE.MathUtils.degToRad(v.az), el = THREE.MathUtils.degToRad(v.el);
    const destino = foco.clone().add(new THREE.Vector3(r * Math.cos(el) * Math.cos(az), r * Math.sin(el), r * Math.cos(el) * Math.sin(az)));
    // Entrada: desde lejos y alto, girando hacia la primera vista.
    const entrada = primera.current && intro;
    if (entrada) camera.position.copy(foco).add(new THREE.Vector3(-LARGO * 2.2, LARGO * 1.1, LARGO * 2.6));
    primera.current = false;
    // Saliendo del interior (tapado por el fundido) va directo a la vista.
    const salto = estabaAdentro.current;
    estabaAdentro.current = false;
    viaje.current = {
      desde: camera.position.clone(), hasta: destino,
      desdeT: entrada ? foco.clone() : controls?.target?.clone() ?? foco.clone(), hastaT: foco,
      t: leerMovimientoReducido() || salto ? 1 : 0, dur: entrada ? 3.6 : 2,
    };
    if (salto) { camera.position.copy(destino); controls?.target.copy(foco); }
    quieto.current = 0;
  }, [vista, modelo, get, intro, adentro]);

  useEffect(() => {
    const { controls } = get();
    if (!controls) return undefined;
    const tocar = () => { quieto.current = 0; controls.autoRotate = false; viaje.current = null; };
    // Tocar los paneles también cuenta: el barco no se pone a girar mientras
    // alguien elige colores.
    const usar = () => { quieto.current = 0; controls.autoRotate = false; };
    controls.addEventListener("start", tocar);
    window.addEventListener("pointerdown", usar);
    return () => { controls.removeEventListener("start", tocar); window.removeEventListener("pointerdown", usar); };
  });

  useFrame(({ camera, controls, size }, dt) => {
    if (!controls) return;
    // Lente: adentro, abierto como la vista de una persona (en un celular
    // parado se abre más, para que entre el ambiente de lado a lado).
    const fov = estabaAdentro.current
      ? THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(36)) / camera.aspect)), 64, 84)
      : 32;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // La imagen se corre hacia arriba (sin mover la cámara) cuando hay un panel abierto.
    const c = corrimiento.current;
    const antes = c.actual;
    c.actual += (c.meta - c.actual) * (1 - Math.exp(-dt * 5));
    if (Math.abs(c.actual - antes) > 0.05 || (c.actual !== 0 && !camera.view)) {
      camera.setViewOffset(size.width, size.height, 0, c.actual, size.width, size.height);
    }
    const v = viaje.current;
    if (v) {
      v.t = Math.min(1, v.t + dt / v.dur);
      const k = v.t < 0.5 ? 4 * v.t ** 3 : 1 - (-2 * v.t + 2) ** 3 / 2;
      camera.position.lerpVectors(v.desde, v.hasta, k);
      controls.target.lerpVectors(v.desdeT, v.hastaT, k);
      if (v.t >= 1) viaje.current = null;
    } else {
      quieto.current += dt;
      controls.autoRotate = quieto.current > 14 && !leerMovimientoReducido() && !estabaAdentro.current;
      controls.autoRotateSpeed = 0.35;
    }
    controls.update();
  });
  return null;
}
