/* ═══════════════════════════════════════════════════════════════
   Configurador · escena
   Mar y cielo de verdad (Water y Sky de three), nubes, lluvia y
   estrellas, el barco con sus colores, balcones que se rebaten y una
   navegación con estela. Todo cambia con transiciones: cada cuadro se
   acerca un poco al estado pedido.
═══════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { Water } from "three/examples/jsm/objects/Water.js";
import { leerMovimientoReducido } from "@/components/ui/useReducedMotion";
import { LARGO, abrirBalcones, texturaTeca, materialDe } from "../recorrido/barco";
import { crearMateriales } from "../recorrido/acabados";
import { CAPAS, VISTAS, opcionDe } from "./opciones";
import { ambiente, texturaNubes, texturaEspuma, texturaEstela, texturaBrillo } from "./ambiente";
import { crearNavegacion, prenderNavegacion, ubicarCortesia, crearCortesia, prenderCortesia, crearEspumaCasco } from "./luces";

// Azar con semilla: estrellas y gotas siempre en el mismo lugar.
function azar(semilla) {
  let s = semilla;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

const chico = () => typeof window !== "undefined" && window.innerWidth < 900;
// Velocidad de crucero en unidades de escena por segundo (≈ 22 nudos en un 43').
const CRUCERO = 9.5;

export default function Escena({ modelo, eleccion, vista, hora, clima, balcones, luces, navegando, indicador, intro, subir = 0 }) {
  const objetivo = useMemo(() => ambiente(hora, clima), [hora, clima]);
  // Estado compartido entre el mundo y el barco (velocidad, factor de noche).
  const comun = useRef({ vel: 0, noche: 0, dia: 1 });
  return (
    <>
      <Mundo objetivo={objetivo} comun={comun} />
      <Barco modelo={modelo} eleccion={eleccion} balcones={balcones} luces={luces} navegando={navegando} comun={comun} indicador={indicador} />
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.07}
        minDistance={LARGO * 0.22} maxDistance={LARGO * 4} maxPolarAngle={Math.PI / 2 - 0.05} />
      <Camara modelo={modelo} vista={vista} intro={intro} subir={subir} />
    </>
  );
}

/* ─────────────── Cielo, mar, nubes, lluvia, estrellas ─────────────── */
function Mundo({ objetivo, comun }) {
  const get = useThree(st => st.get);
  const obj = useMemo(() => {
    const cielo = new Sky();
    cielo.scale.setScalar(4500);
    const cieloEnv = new Sky();
    const escenaEnv = new THREE.Scene();
    escenaEnv.add(cieloEnv);

    const normales = new THREE.TextureLoader().load("/textures/recorrido/waternormals.jpg", t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
    const res = chico() ? 512 : 1024;
    const agua = new Water(new THREE.PlaneGeometry(9000, 9000), {
      textureWidth: res, textureHeight: res, waterNormals: normales,
      sunDirection: new THREE.Vector3(0, 1, 0), sunColor: 0xffffff, waterColor: 0x06222c, distortionScale: 2.2, fog: true,
    });
    agua.rotation.x = -Math.PI / 2;
    // El barco no se mueve: navegar es correr el dibujo del agua hacia atrás.
    agua.material.uniforms.avance = { value: new THREE.Vector2() };
    agua.material.fragmentShader = agua.material.fragmentShader
      .replace("uniform float size;", "uniform float size;\nuniform vec2 avance;")
      .replace("getNoise( worldPosition.xz * size )", "getNoise( ( worldPosition.xz + avance ) * size )")
      // Menos espejo y más color de mar (el original refleja como un lago quieto).
      .replace("float rf0 = 0.3;", "float rf0 = reflejo;")
      .replace("uniform vec3 waterColor;", "uniform vec3 waterColor;\nuniform float reflejo;\nuniform float oleaje;")
      // Mar de fondo: dos trenes de olas largas que inclinan la superficie (el
      // reflejo del cielo se ondula en franjas anchas, como en mar abierto).
      .replace("vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );", `
        vec2 sp = worldPosition.xz + avance;
        vec2 d1 = vec2( 0.92, 0.39 ), d2 = vec2( 0.28, -0.96 ), d3 = vec2( -0.6, 0.8 );
        vec2 g = d1 * 0.9 * cos( dot( sp, d1 ) * 0.23 + time * 1.3 )
          + d2 * 0.55 * cos( dot( sp, d2 ) * 0.37 + time * 1.7 )
          + d3 * 0.3 * cos( dot( sp, d3 ) * 0.61 + time * 2.3 );
        vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) + vec3( g.x, 0.0, g.y ) * oleaje );`);
    agua.material.uniforms.reflejo = { value: 0.1 };
    agua.material.uniforms.oleaje = { value: 0.25 };
    agua.material.uniforms.size.value = 4;

    const texNubes = texturaNubes();
    const nubes = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        mapa: { value: texNubes }, cobertura: { value: 0.2 }, color: { value: new THREE.Color("#ffffff") },
        corrimiento: { value: new THREE.Vector2() },
      },
      vertexShader: `varying vec2 vUv; varying float vD;
        void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vD = length(w.xz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D mapa; uniform float cobertura; uniform vec3 color; uniform vec2 corrimiento;
        varying vec2 vUv; varying float vD;
        void main() {
          float n = texture2D(mapa, vUv * 5.0 + corrimiento).a * 0.7 + texture2D(mapa, vUv * 13.0 - corrimiento * 1.7).a * 0.3;
          float a = smoothstep(1.0 - cobertura, 1.25 - cobertura * 0.6, n);
          a *= 1.0 - smoothstep(1400.0, 4200.0, vD);
          gl_FragColor = vec4(color * (0.82 + n * 0.25), a * 0.92);
        }`,
    }));
    nubes.rotation.x = Math.PI / 2;
    nubes.position.y = 260;

    // Estrellas en la media esfera de arriba.
    const r = azar(11);
    const N = 1400;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const az = r() * Math.PI * 2, el = Math.asin(r() * 0.98 + 0.02);
      pos.set([Math.cos(el) * Math.cos(az) * 3000, Math.sin(el) * 3000, Math.cos(el) * Math.sin(az) * 3000], i * 3);
    }
    const geoEst = new THREE.BufferGeometry();
    geoEst.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const estrellas = new THREE.Points(geoEst, new THREE.PointsMaterial({ color: "#ffffff", size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));

    const brillo = texturaBrillo();
    const luna = new THREE.Sprite(new THREE.SpriteMaterial({ map: brillo, color: "#e9eef7", transparent: true, opacity: 0, fog: false, depthWrite: false }));
    luna.scale.setScalar(150);

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

    const sol = new THREE.DirectionalLight("#ffffff", 2);
    const lunaLuz = new THREE.DirectionalLight("#9fb3ff", 0);
    const hemi = new THREE.HemisphereLight("#dfe9f2", "#29363c", 0.6);

    const pmrem = new THREE.PMREMGenerator(get().gl);
    return { cielo, cieloEnv, escenaEnv, agua, normales, nubes, texNubes, estrellas, luna, brillo, lluvia, sol, lunaLuz, hemi, pmrem, env: null };
  }, [get]);

  // Estado actual (interpolado) del ambiente.
  const act = useRef(null);
  const vivo = useRef(null);
  useEffect(() => { vivo.current = { obj, objetivo, comun }; }, [obj, objetivo, comun]);

  useEffect(() => {
    const { scene: escena } = get();
    const niebla = new THREE.FogExp2("#cfdbe3", 0.001);
    escena.fog = niebla;
    escena.background = null;
    return () => {
      escena.fog = null;
      escena.environment = null;
      obj.env?.dispose();
      obj.pmrem.dispose();
      obj.agua.geometry.dispose(); obj.agua.material.dispose(); obj.normales.dispose();
      obj.nubes.geometry.dispose(); obj.nubes.material.dispose(); obj.texNubes.dispose();
      obj.estrellas.geometry.dispose(); obj.estrellas.material.dispose();
      obj.luna.material.dispose(); obj.brillo.dispose();
      obj.lluvia.geometry.dispose(); obj.lluvia.material.dispose();
      obj.cielo.material.dispose(); obj.cieloEnv.material.dispose();
    };
  }, [get, obj]);

  useFrame(({ scene: escena, gl, clock }, dt) => {
    if (!vivo.current) return;
    const { obj: o, objetivo: meta } = vivo.current;
    const c = vivo.current.comun.current;
    const k = 1 - Math.exp(-dt * 1.8);
    if (!act.current) act.current = { ...meta, solColor: meta.solColor.clone(), nieblaColor: meta.nieblaColor.clone(), aguaColor: new THREE.Color(meta.agua), ultimoEnv: -1, envElev: null, envTurb: null };
    const a = act.current;
    ["elev", "azim", "dia", "noche", "dorado", "turbidez", "rayleigh", "mie", "mieG", "nubes", "lluvia", "sol", "ambiente", "luna", "niebla", "exposicion", "ola"]
      .forEach(n => { a[n] += (meta[n] - a[n]) * k; });
    a.solColor.lerp(meta.solColor, k);
    a.nieblaColor.lerp(meta.nieblaColor, k);
    a.aguaColor.lerp(new THREE.Color(meta.agua), k);
    c.noche = a.noche;
    c.dia = a.dia;

    const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - a.elev), THREE.MathUtils.degToRad(a.azim));
    [o.cielo, o.cieloEnv].forEach(s => {
      const u = s.material.uniforms;
      u.turbidity.value = a.turbidez;
      u.rayleigh.value = a.rayleigh;
      u.mieCoefficient.value = a.mie;
      u.mieDirectionalG.value = a.mieG;
      u.sunPosition.value.copy(dir);
    });

    // Reflejos: se regeneran cuando el cielo cambió lo suficiente (y no más de ~3 por segundo).
    const t = clock.elapsedTime;
    if (t - a.ultimoEnv > 0.33 && (a.envElev === null || Math.abs(a.envElev - a.elev) > 0.35 || Math.abs(a.envTurb - a.turbidez) > 0.3)) {
      const nuevo = o.pmrem.fromScene(o.escenaEnv).texture;
      o.env?.dispose();
      o.env = nuevo;
      escena.environment = nuevo;
      a.ultimoEnv = t;
      a.envElev = a.elev;
      a.envTurb = a.turbidez;
    }
    escena.environmentIntensity = 0.25 + a.dia * 0.55;

    o.sol.position.copy(dir).multiplyScalar(60);
    o.sol.intensity = a.sol;
    o.sol.color.copy(a.solColor);
    const dirLuna = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(a.azim + 160));
    o.lunaLuz.position.copy(dirLuna).multiplyScalar(60);
    o.lunaLuz.intensity = a.luna;
    o.luna.position.copy(dirLuna).multiplyScalar(2600);
    o.luna.material.opacity = a.noche * (1 - a.nubes * 0.7);
    o.hemi.intensity = a.ambiente;

    const u = o.agua.material.uniforms;
    u.time.value += dt * (0.55 + c.vel * 0.04);
    u.sunDirection.value.copy(dir);
    u.sunColor.value.copy(a.solColor).multiplyScalar(a.dia * (0.35 + a.sol * 0.3) + a.noche * 0.15);
    u.waterColor.value.copy(a.aguaColor).multiplyScalar(0.35 + a.dia * 0.65);
    u.distortionScale.value = a.ola;
    u.oleaje.value = 0.12 + a.ola * 0.05;
    u.avance.value.x += c.vel * dt;

    const un = o.nubes.material.uniforms;
    un.cobertura.value = a.nubes;
    un.color.value.set("#ffffff").lerp(a.solColor, a.dorado * 0.6).multiplyScalar(0.18 + a.dia * 0.82 * (1 - a.lluvia * 0.45));
    un.corrimiento.value.x += dt * (0.004 + c.vel * 0.0006);

    o.estrellas.material.opacity = a.noche * (1 - a.nubes * 0.85);

    o.lluvia.material.opacity = a.lluvia * 0.5;
    if (a.lluvia > 0.02) {
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

    escena.fog.color.copy(a.nieblaColor);
    escena.fog.density = a.niebla;
    gl.toneMappingExposure = a.exposicion;
  });

  return (
    <>
      <primitive object={obj.cielo} />
      <primitive object={obj.agua} />
      <primitive object={obj.nubes} />
      <primitive object={obj.estrellas} />
      <primitive object={obj.luna} />
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
    Object.entries(modelo.piezas).forEach(([nombre, m]) => { m.material = mats.lista[materialDe(nombre)] || mats.lista.detalle; });
    // El interior va adentro del casco: se ve por ventanas y parabrisas (sin
    // él, el barco se veía hueco, "transparente"). Va en la capa 1, que la
    // cámara del reflejo del agua no dibuja: no suma costo al reflejo.
    if (modelo.aparte) {
      Object.entries(modelo.aparte.piezas).forEach(([nombre, m]) => { m.material = mats.lista[materialDe(nombre)] || mats.lista.detalle; });
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
    const espuma = texturaEspuma();
    espuma.repeat.set(5, 1.6);
    const forma = texturaEstela();
    const largo = LARGO * 3.4;
    const estela = new THREE.Mesh(
      new THREE.PlaneGeometry(largo, LARGO * 1.5),
      new THREE.MeshBasicMaterial({ map: forma, alphaMap: espuma, transparent: true, opacity: 0, depthWrite: false, color: "#e9f1f3", toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    );
    // u = 0 en la popa: el plano se da vuelta para que la V abra hacia atrás.
    estela.rotation.set(-Math.PI / 2, 0, Math.PI);
    estela.position.set(-LARGO / 2 - largo / 2 + LARGO * 0.08, 0.06, 0);
    estela.renderOrder = 2;
    // Espuma a los costados del casco (bigotes de proa) mientras navega.
    const costado = new THREE.Mesh(
      new THREE.PlaneGeometry(LARGO * 1.05, LARGO * 0.5),
      new THREE.MeshBasicMaterial({ map: forma, alphaMap: espuma, transparent: true, opacity: 0, depthWrite: false, color: "#e9f1f3", toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    );
    costado.rotation.set(-Math.PI / 2, 0, Math.PI);
    costado.position.set(0.1, 0.07, 0);
    costado.renderOrder = 2;

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
    return { espuma, forma, estela, costado, brillo, subacuaticas, luzPopa, techo, espejo, cortesia, navegacion, espumaCasco };
  }, [modelo]);
  useEffect(() => () => {
    const e = extras;
    const mallas = [e.estela, e.costado, ...e.subacuaticas, ...e.cortesia.charcos];
    if (e.espumaCasco) {
      mallas.push(e.espumaCasco.malla, e.espumaCasco.sombra);
      e.espumaCasco.forma.dispose();
      e.espumaCasco.formaSombra.dispose();
    }
    mallas.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
    e.cortesia.puntos.forEach(s => s.material.dispose());
    e.navegacion.forEach(({ g }) => g.children.forEach(s => s.material.dispose()));
    [e.espuma, e.forma, e.brillo].forEach(t => t.dispose());
  }, [extras]);

  // Colores elegidos → color objetivo de cada material (y la textura que corresponda).
  const metas = useRef({});
  useEffect(() => {
    CAPAS.forEach(capa => {
      const op = opcionDe(capa.id, eleccion[capa.id]);
      const m = mats.lista[capa.grupo];
      if (!m || !op) return;
      metas.current[capa.grupo] = new THREE.Color(op.c);
      if (capa.id === "teca") {
        const mapa = mats.tex(`teca-${op.teca}`, () => texturaTeca(op.teca));
        if (m.map !== mapa) { m.map = mapa; m.needsUpdate = true; }
      }
      if (capa.id === "tapizado") {
        const mapa = op.tex ? mats.tex("fabric_leather_02-c-0.8", () => null) : null;
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
    e.estela.material.opacity = Math.min(1, f * 1.3);
    e.costado.material.opacity = f * 0.75;
    e.espuma.offset.x -= dt * c.vel * 0.14;
    e.estela.visible = e.costado.visible = f > 0.01;
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
    if (e.espumaCasco) {
      const m = e.espumaCasco.malla.material;
      m.opacity = 0.45 + f * 0.45;
      m.color.setScalar(0.25 + 0.75 * c.dia);
    }

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
      {extras.espumaCasco && <primitive object={extras.espumaCasco.malla} />}
      <primitive object={extras.estela} />
      <primitive object={extras.costado} />
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
