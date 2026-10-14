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
import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { leerMovimientoReducido } from "@/components/ui/useReducedMotion";
import { LARGO, abrirBalcones, texturaTeca, materialDe } from "../recorrido/barco";
import { crearMateriales } from "../recorrido/acabados";
import { CAPAS, VISTAS, opcionDe } from "./opciones";
import { ambiente, texturaEspuma, texturaBrillo, texturaRuido } from "./ambiente";
import { CIELOS_CLIMA, cielosDeHora, crearMaterialCielo, aplicarCielo, luzDelCielo } from "./cielo";
import { crearNavegacion, prenderNavegacion, ubicarCortesia, crearCortesia, prenderCortesia, crearEspumaCasco, anchoFlotacion, texturaAncho } from "./luces";

// Azar con semilla: estrellas y gotas siempre en el mismo lugar.
function azar(semilla) {
  let s = semilla;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

const chico = () => typeof window !== "undefined" && window.innerWidth < 900;
// Velocidad de crucero en unidades de escena por segundo (≈ 22 nudos en un 43').
const CRUCERO = 9.5;

export default function Escena({ modelo, cielos, eleccion, vista, hora, clima, balcones, luces, navegando, indicador, intro, subir = 0, renderRef }) {
  // Estado compartido entre el mundo y el barco (velocidad, factor de noche).
  const comun = useRef({ vel: 0, noche: 0, dia: 1 });
  return (
    <>
      <Mundo modelo={modelo} hora={hora} clima={clima} cielos={cielos} comun={comun} />
      <Barco modelo={modelo} eleccion={eleccion} balcones={balcones} luces={luces} navegando={navegando} comun={comun} indicador={indicador} />
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.07}
        minDistance={LARGO * 0.22} maxDistance={LARGO * 4} maxPolarAngle={Math.PI / 2 - 0.05} />
      <Camara modelo={modelo} vista={vista} intro={intro} subir={subir} />
      <Efectos renderRef={renderRef} />
    </>
  );
}

/* ─────────────── Imagen final ─────────────── */
/* Se dibuja en HDR y recién al final pasa por el tone mapping: así lo que
   brilla de verdad (luces, destellos del sol en el agua, el sol mismo) se
   abre en un resplandor suave, como en una cámara. renderRef.current queda
   apuntando a esta función (para la foto). */
function Efectos({ renderRef }) {
  const gl = useThree(st => st.gl);
  const escena = useThree(st => st.scene);
  const camara = useThree(st => st.camera);
  const size = useThree(st => st.size);
  const efecto = useMemo(() => {
    // MSAA en el destino: al dibujar en un render target se pierde el antialias del lienzo.
    const destino = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(gl, destino);
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 3.2);
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
    const pasadas = [new RenderPass(escena, camara), limpiar, bloom, new OutputPass()];
    pasadas.forEach(p => composer.addPass(p));
    return { composer, pasadas, bloom };
  }, [gl, escena, camara]);
  useEffect(() => {
    const pr = gl.getPixelRatio();
    efecto.composer.setPixelRatio(pr);
    efecto.composer.setSize(size.width, size.height);
    // El resplandor no necesita resolución completa.
    efecto.bloom.setSize(size.width * pr / 2, size.height * pr / 2);
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
  useFrame((_, dt) => efecto.composer.render(dt), 1);
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

    const normales = new THREE.TextureLoader().load("/textures/recorrido/waternormals.jpg", t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
    const res = chico() ? 512 : 1024;
    const agua = new Water(new THREE.PlaneGeometry(9000, 9000), {
      textureWidth: res, textureHeight: res, waterNormals: normales,
      sunDirection: new THREE.Vector3(0, 1, 0), sunColor: 0xffffff, waterColor: 0x06222c, distortionScale: 2.2, fog: true,
    });
    agua.rotation.x = -Math.PI / 2;
    // Recibe la sombra del barco (Water ya trae la máscara de sombras).
    agua.receiveShadow = true;
    // El barco no se mueve: navegar es correr el dibujo del agua hacia atrás.
    agua.material.uniforms.avance = { value: new THREE.Vector2() };
    agua.material.fragmentShader = agua.material.fragmentShader
      .replace("uniform float size;", "uniform float size;\nuniform vec2 avance;")
      .replace("getNoise( worldPosition.xz * size )", "getNoise( ( worldPosition.xz + avance ) * size )")
      // Menos espejo y más color de mar (el original refleja como un lago quieto).
      .replace("float rf0 = 0.3;", "float rf0 = reflejo;")
      .replace("uniform vec3 waterColor;", "uniform vec3 waterColor;\nuniform float reflejo;\nuniform float oleaje;")
      // Mar de fondo: trenes de olas largas que inclinan la superficie (el
      // reflejo del cielo se ondula en franjas anchas, como en mar abierto).
      .replace("vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );", `
        vec2 sp = worldPosition.xz + avance;
        vec2 d1 = vec2( 0.92, 0.39 ), d2 = vec2( 0.28, -0.96 ), d3 = vec2( -0.6, 0.8 );
        vec2 g = d1 * 0.9 * cos( dot( sp, d1 ) * 0.23 + time * 1.3 )
          + d2 * 0.55 * cos( dot( sp, d2 ) * 0.37 + time * 1.7 )
          + d3 * 0.3 * cos( dot( sp, d3 ) * 0.61 + time * 2.3 );
        vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) + vec3( g.x, 0.0, g.y ) * oleaje );`)
      // Destellos del sol más finos e intensos (el bloom los hace brillar).
      .replace("sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );",
        "sunLight( surfaceNormal, eyeDirection, 380.0, 7.0, 0.5, diffuseLight, specularLight );")
      // Cerca de la cámara el agua deja ver un poco de color (turquesa en
      // las caras de las olas); lejos manda el reflejo del cielo.
      .replace("vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;",
        "vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor * ( 1.0 + vec3( 0.25, 0.9, 0.75 ) * ( 1.0 - smoothstep( 6.0, 45.0, distance ) ) * ( 0.5 + 0.5 * surfaceNormal.x ) );");
    // Espuma dentro del agua (no planos pegados encima): contacto con el
    // casco, ola de proa, agua blanca detrás de la popa y los brazos de la
    // estela en V. Usa el ancho real del casco en la flotación y se mueve con
    // el agua; la superficie se pica donde hay espuma.
    const flot = anchoFlotacion(modelo) || { x0: -LARGO / 2, x1: LARGO / 2, max: LARGO * 0.15, popa: -LARGO / 2, mangaPopa: LARGO * 0.12 };
    const anchoTex = flot.liso ? texturaAncho(flot) : null;
    const ruidoTex = texturaRuido();
    Object.assign(agua.material.uniforms, {
      ruidoEspuma: { value: ruidoTex }, anchoCasco: { value: anchoTex },
      cascoX0: { value: flot.x0 }, cascoX1: { value: flot.x1 }, anchoMax: { value: anchoTex ? flot.max : 0 },
      popa: { value: flot.popa }, mangaPopa: { value: flot.mangaPopa },
      velocidad: { value: 0 }, luzEspuma: { value: new THREE.Color(1, 1, 1) }, desenfoque: { value: 0 },
    });
    agua.material.fragmentShader = agua.material.fragmentShader
      .replace("uniform vec2 avance;", `uniform vec2 avance;
        uniform sampler2D ruidoEspuma; uniform sampler2D anchoCasco;
        uniform float cascoX0; uniform float cascoX1; uniform float anchoMax; uniform float popa; uniform float mangaPopa;
        uniform float velocidad; uniform vec3 luzEspuma; uniform float desenfoque;`)
      // Desenfoque de movimiento: a velocidad el agua cercana se ve barrida en
      // el sentido de la marcha (varias muestras del relieve a lo largo de x).
      .replace("vec4 noise = getNoise( ( worldPosition.xz + avance ) * size );", `vec2 uvAgua = ( worldPosition.xz + avance ) * size;
        vec4 noise = getNoise( uvAgua );
        if ( desenfoque > 0.001 ) {
          vec2 paso = vec2( desenfoque * size, 0.0 );
          noise = ( noise + getNoise( uvAgua + paso ) + getNoise( uvAgua - paso ) + getNoise( uvAgua + paso * 2.0 ) + getNoise( uvAgua - paso * 2.0 ) ) / 5.0;
          noise.xz *= 1.0 + desenfoque * 1.2;
        }`)
      .replace("vec3 outgoingLight = albedo;", "vec3 outgoingLight = mix( mix( albedo, luzEspuma * vec3( 0.42, 0.62, 0.6 ), aireada * 0.32 ), luzEspuma * ( 0.72 + 0.28 * rC ), espuma * 0.94 );");
    agua.material.fragmentShader = agua.material.fragmentShader.replace(
      "+ vec3( g.x, 0.0, g.y ) * oleaje );", `+ vec3( g.x, 0.0, g.y ) * oleaje );
        vec2 bp = worldPosition.xz;
        vec2 fp = bp + avance;
        float az = abs( bp.y );
        float fx = ( bp.x - cascoX0 ) / ( cascoX1 - cascoX0 );
        float wC = ( anchoMax > 0.0 && fx > 0.0 && fx < 1.0 ) ? texture2D( anchoCasco, vec2( fx, 0.5 ) ).r * anchoMax : 0.0;
        float rA = texture2D( ruidoEspuma, fp * 0.16 + vec2( time * 0.012, 0.0 ) ).g;
        float rB = texture2D( ruidoEspuma, fp * 0.55 - vec2( 0.0, time * 0.025 ) ).r;
        float rC = texture2D( ruidoEspuma, fp * 1.7 + vec2( time * 0.04 ) ).r;
        // Vetas: el agua revuelta se estira en el sentido de la marcha.
        float rV = texture2D( ruidoEspuma, fp * vec2( 0.09, 0.85 ) + vec2( 0.0, time * 0.02 ) ).r;
        float ruido = rA * 0.4 + rB * 0.35 + rC * 0.25;
        float proa = smoothstep( 0.42, 0.8, fx );
        float banda = 0.09 + velocidad * ( 0.18 + 0.5 * proa );
        float dC = az - wC;
        float contacto = wC > 0.02 ? ( 1.0 - smoothstep( 0.0, banda, dC ) ) * step( -0.06, dC ) : 0.0;
        contacto *= 0.5 + 0.6 * velocidad;
        float dx = popa - bp.x;
        float centro = 0.0, brazo = 0.0, turbio = 0.0;
        if ( dx > 0.0 && velocidad > 0.01 ) {
          // Agua de hélice: casi la manga de la popa, blanca al salir y
          // rompiéndose en vetas a medida que queda atrás.
          float abre = mangaPopa * 0.85 + dx * 0.05;
          centro = exp( -dx / 16.0 ) * ( 1.0 - smoothstep( abre * 0.35, abre, az ) ) * smoothstep( 0.0, 0.35, dx );
          centro *= mix( 1.0, 0.35 + 0.9 * rV, smoothstep( 1.0, 8.0, dx ) );
          // Brazos de la V (ángulo de Kelvin, ~19°): olas con espuma sólo en las crestas.
          float lineaV = mangaPopa * 0.95 + dx * 0.34;
          brazo = exp( -dx / 26.0 ) * ( 1.0 - smoothstep( 0.0, 0.18 + dx * 0.02, abs( az - lineaV ) ) );
          // Agua revuelta desde el mismo espejo de popa (rompe el reflejo del casco).
          turbio = exp( -dx / 14.0 ) * ( 1.0 - smoothstep( abre * 0.45, abre * 1.15, az ) ) * velocidad;
          centro *= velocidad;
          brazo *= velocidad;
        }
        float mascara = clamp( contacto + centro * 1.9, 0.0, 1.8 );
        float espuma = smoothstep( 0.42, 0.85, mascara * ( 0.3 + ruido * 1.05 ) )
          + smoothstep( 0.62, 0.85, brazo * ( 0.25 + rB * 0.95 ) ) * 0.75;
        espuma = clamp( espuma, 0.0, 1.0 );
        // Agua aireada (turquesa lechoso) bajo la estela.
        float aireada = clamp( turbio * 1.3 + centro * 0.6 + brazo * 0.35 + contacto * 0.3, 0.0, 1.0 );
        surfaceNormal = normalize( surfaceNormal + vec3( rB - 0.5, 0.0, rC - 0.5 ) * 1.8 * clamp( centro + brazo * 0.7 + contacto * 0.4, 0.0, 1.0 ) );`);
    agua.material.fragmentShader = agua.material.fragmentShader
      // El reflejo del cielo un poco más tenue: el mar abierto es más oscuro que el cielo que refleja.
      // En el agua revuelta de la estela el reflejo se rompe.
      .replace("vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight", "reflectionSample * 0.8 * ( 1.0 - aireada * 0.75 ) + reflectionSample * specularLight");
    agua.material.uniforms.reflejo = { value: 0.1 };
    agua.material.uniforms.oleaje = { value: 0.25 };
    agua.material.uniforms.size.value = 4;

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

    const pmrem = new THREE.PMREMGenerator(get().gl);
    return { matCielo, domo, domoEnv, escenaEnv, marEnv, agua, normales, anchoTex, ruidoTex, estrellas, lluvia, sol, lunaLuz, hemi, pmrem, env: null };
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
      obj.pmrem.dispose();
      obj.agua.geometry.dispose(); obj.agua.material.dispose(); obj.normales.dispose();
      obj.anchoTex?.dispose(); obj.ruidoTex.dispose();
      obj.estrellas.geometry.dispose(); obj.estrellas.material.dispose();
      obj.lluvia.geometry.dispose(); obj.lluvia.material.dispose();
      obj.domo.geometry.dispose(); obj.domoEnv.geometry.dispose(); obj.matCielo.dispose();
      obj.marEnv.geometry.dispose(); obj.marEnv.material.dispose();
    };
  }, [get, obj]);

  useFrame(({ scene: escena, gl, clock }, dt) => {
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

    const agua = new THREE.Color("#0b3b50").multiplyScalar(0.12 + 0.88 * m.dia * (1 - a.tc * 0.35));
    // Reflejos: se regeneran cuando el cielo cambió (no más de ~3 por segundo).
    const t = clock.elapsedTime;
    const clave = `${a.hora.toFixed(2)}|${a.tc.toFixed(2)}`;
    if (t - a.ultimoEnv > 0.33 && clave !== a.envClave) {
      o.marEnv.material.color.copy(agua).multiplyScalar(1.4).add(luz.horizonte.clone().multiplyScalar(0.12));
      const nuevo = o.pmrem.fromScene(o.escenaEnv).texture;
      o.env?.dispose();
      o.env = nuevo;
      escena.environment = nuevo;
      a.ultimoEnv = t;
      a.envClave = clave;
    }
    escena.environmentIntensity = 1;

    o.sol.position.copy(luz.dir).multiplyScalar(60);
    o.sol.intensity = luz.fuerza * 3.4;
    o.sol.color.copy(luz.solColor);
    o.lunaLuz.position.copy(luz.dir).multiplyScalar(60);
    o.lunaLuz.intensity = m.noche * 0.55;
    o.hemi.intensity = 0.08 + 0.12 * m.dia;

    const u = o.agua.material.uniforms;
    u.time.value += dt * (0.55 + c.vel * 0.04);
    u.sunDirection.value.copy(luz.dir);
    u.sunColor.value.copy(luz.solColor).multiplyScalar(luz.fuerza * 1.3 + m.noche * 0.1);
    u.waterColor.value.copy(agua);
    u.distortionScale.value = m.ola;
    u.oleaje.value = 0.12 + m.ola * 0.05;
    u.avance.value.x += c.vel * dt;
    u.velocidad.value = c.vel / CRUCERO;
    u.desenfoque.value = (c.vel / CRUCERO) * 0.22;
    // La espuma toma la luz del momento: blanca de día, apagada de noche.
    // Casi blanca: sólo un toque del color de la luz (si no, al atardecer quedaba rosada, como sucia).
    const le = u.luzEspuma.value.copy(luz.horizonte).multiplyScalar(0.45).add(luz.solColor.clone().multiplyScalar(luz.fuerza * 0.9)).addScalar(0.015);
    const lum = le.r * 0.2126 + le.g * 0.7152 + le.b * 0.0722;
    le.lerp(new THREE.Color(lum, lum, lum * 1.03), 0.75);

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
    gl.toneMappingExposure = 0.5 + m.noche * 0.35;
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

/* ─────────────── Barco ─────────────── */
function Barco({ modelo, eleccion, balcones, luces, navegando, comun, indicador }) {
  const mats = useMemo(() => {
    const m = crearMateriales();
    // Con el reflejo del mar ya hay dos pasadas por cuadro: el vidrio va como
    // transparencia común (la transmisión sumaría una tercera).
    Object.assign(m.lista.vidrios, { transmission: 0, transparent: true, opacity: 0.74 });
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
    if (modelo.lineas) {
      const extras = Object.values(modelo.piezas).map(m => {
        const b = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 32), mats.linea);
        m.add(b);
        return b;
      });
      return () => extras.forEach(b => { b.removeFromParent(); b.geometry.dispose(); });
    }
    return undefined;
  }, [modelo, mats, get]);

  const extras = useMemo(() => {
    // La estela y la espuma van dentro del agua (Mundo); acá queda la sombra
    // del casco sobre el agua.
    const espuma = texturaEspuma();

    const brillo = texturaBrillo();
    const subacuaticas = [-1, 1].map(lado => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        map: brillo, color: "#36cfff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(-LARGO / 2 - 0.25, 0.08, lado * LARGO * 0.06);
      m.scale.set(LARGO * 0.42, LARGO * 0.3, 1);
      m.renderOrder = 3;
      return m;
    });
    const luzPopa = new THREE.PointLight("#3fd6ff", 0, LARGO * 0.6, 1.6);
    luzPopa.position.set(-LARGO / 2 - 0.4, 0.15, 0);

    // Cortesía: las tiras LED del hardtop iluminan el cockpit desde arriba,
    // LEDs bajos en la borda y en el espejo de popa.
    const led = modelo.anclas?.led || modelo.anclas?.timon || [-LARGO * 0.1, 1.8, 0];
    const techo = [-1, 1].map(k => {
      const l = new THREE.PointLight("#ffc98c", 0, LARGO * 0.42, 1.7);
      l.position.set(led[0] + k * LARGO * 0.09, led[1] - 0.12, led[2]);
      return l;
    });
    const espejo = new THREE.PointLight("#ffc98c", 0, LARGO * 0.25, 1.8);
    espejo.position.set(-LARGO / 2 + 0.1, 0.45, 0);
    const cortesia = crearCortesia(ubicarCortesia(modelo), brillo);
    const navegacion = crearNavegacion(modelo, brillo);
    const espumaCasco = crearEspumaCasco(modelo, espuma);
    return { espuma, brillo, subacuaticas, luzPopa, techo, espejo, cortesia, navegacion, espumaCasco };
  }, [modelo]);
  useEffect(() => () => {
    const e = extras;
    const mallas = [...e.subacuaticas, ...e.cortesia.charcos];
    if (e.espumaCasco) {
      mallas.push(e.espumaCasco.malla, e.espumaCasco.sombra);
      e.espumaCasco.forma.dispose();
      e.espumaCasco.formaSombra.dispose();
    }
    mallas.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
    e.cortesia.puntos.forEach(s => s.material.dispose());
    e.navegacion.forEach(({ g }) => g.children.forEach(s => s.material.dispose()));
    [e.espuma, e.brillo].forEach(t => t.dispose());
  }, [extras]);

  // Colores elegidos → color objetivo de cada material (y la textura que corresponda).
  const metas = useRef({});
  useEffect(() => {
    CAPAS.forEach(capa => {
      const op = opcionDe(capa.id, eleccion[capa.id]);
      const m = mats.lista[capa.grupo];
      if (!m || !op) return;
      // La teca trae el color en la textura (cada variante es otra textura):
      // el color de la muestra es sólo para el botón.
      metas.current[capa.grupo] = new THREE.Color(capa.id === "teca" ? "#ffffff" : op.c);
      if (capa.id === "teca") {
        const mapa = mats.tex(`teca-${op.teca}`, () => texturaTeca(op.teca));
        if (m.map !== mapa) { m.map = mapa; m.needsUpdate = true; }
      }
    });
  }, [eleccion, mats]);

  const grupo = useRef(null);
  const vivo = useRef(null);
  useEffect(() => { vivo.current = { modelo, mats, balcones, luces, navegando, extras, comun, indicador }; }, [modelo, mats, balcones, luces, navegando, extras, comun, indicador]);
  const apertura = useRef(balcones ? 1 : 0);

  useFrame(({ clock, camera }, dt) => {
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
    // Al planear la proa sube pero la popa no se hunde: el barco gira sobre la
    // popa y sube entero (antes giraba sobre el centro y la planchada quedaba
    // bajo el agua).
    // Parado, el mar de fondo lo mece: sube y baja, cabecea y rola, con
    // frecuencias que no coinciden (así nunca se repite igual).
    const quieto = 1 - f * 0.6;
    const cabeceo = (Math.sin(t * 0.5 + 0.4) * 0.008 + Math.sin(t * 0.93) * 0.004) * quieto + f * 0.045 + Math.sin(t * 1.9) * 0.003 * f;
    grupo.current.rotation.z = cabeceo;
    grupo.current.position.y = (Math.sin(t * 0.62) * 0.035 + Math.sin(t * 1.07 + 1.3) * 0.015) * quieto
      + Math.max(0, cabeceo - 0.012) * (LARGO / 2) + f * 0.05 + Math.sin(t * 2.4) * 0.008 * f;
    grupo.current.rotation.x = (Math.sin(t * 0.41) * 0.018 + Math.sin(t * 0.77 + 2.1) * 0.008) * quieto;

    const e = v.extras;
    // Luces: se encienden y apagan con un fundido corto; de día casi no se notan.
    const L = v.luces;
    const nivel = prendida => (prendida ? 0.3 + 0.7 * c.noche : 0);
    const fx = e.fx ||= { agua: 0, nav: 0, cort: 0 };
    fx.agua += (nivel(L.agua) - fx.agua) * k;
    fx.nav += (nivel(L.navegacion) - fx.nav) * k;
    fx.cort += (nivel(L.cortesia) - fx.cort) * k;
    e.subacuaticas.forEach(m => { m.material.opacity = fx.agua * 0.9; });
    e.luzPopa.intensity = fx.agua * 6;
    prenderNavegacion(e.navegacion, camera, fx.nav);
    prenderCortesia(e.cortesia, fx.cort);
    e.techo.forEach(l => { l.intensity = fx.cort * 3.2; });
    e.espejo.intensity = fx.cort * 1.6;
    const led = v.mats.lista.led;
    if (led) { led.emissive.set("#ffd2a0"); led.emissiveIntensity = fx.cort * 2.4; }

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
        {extras.techo.map((l, i) => <primitive key={i} object={l} />)}
        <primitive object={extras.espejo} />
        <primitive object={extras.cortesia.grupo} />
        {extras.navegacion.map(({ g }, i) => <primitive key={`n${i}`} object={g} />)}
      </group>
      {extras.espumaCasco && <primitive object={extras.espumaCasco.sombra} />}
      {extras.subacuaticas.map((m, i) => <primitive key={i} object={m} />)}
      <primitive object={extras.luzPopa} />
    </>
  );
}

/* ─────────────── Cámara ─────────────── */
/* Viaja a la vista elegida; si nadie toca nada un rato, gira sola alrededor
   del barco, como en un salón de exposición. */
function Camara({ modelo, vista, intro, subir }) {
  const get = useThree(st => st.get);
  const corrimiento = useRef({ actual: 0, meta: 0 });
  useEffect(() => { corrimiento.current.meta = subir; }, [subir]);
  const viaje = useRef(null);
  const quieto = useRef(0);
  const primera = useRef(true);

  useEffect(() => {
    const { camera, controls } = get();
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
    viaje.current = {
      desde: camera.position.clone(), hasta: destino,
      desdeT: entrada ? foco.clone() : controls?.target?.clone() ?? foco.clone(), hastaT: foco,
      t: leerMovimientoReducido() ? 1 : 0, dur: entrada ? 3.6 : 2,
    };
    quieto.current = 0;
  }, [vista, modelo, get, intro]);

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
      controls.autoRotate = quieto.current > 14 && !leerMovimientoReducido();
      controls.autoRotateSpeed = 0.35;
    }
    controls.update();
  });
  return null;
}
