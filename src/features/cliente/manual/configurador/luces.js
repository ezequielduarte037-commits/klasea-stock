/* ═══════════════════════════════════════════════════════════════
   Configurador · luces y espuma del casco
   Luces de navegación con sus sectores reales (roja a babor, verde a
   estribor: se ven sólo desde proa hasta 22,5° detrás del través; la de
   tope en todo el horizonte), luces de cortesía ubicadas sobre el modelo
   (se buscan el piso y la borda del cockpit con rayos) y el ancho del casco
   en la flotación (para la espuma del agua).
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";
import { LARGO } from "../recorrido/barco";

const suave = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* Sprite aditivo con color en HDR (intensidad > 1): el bloom de la escena
   hace el resplandor, como la lente de una cámara. pantalla: tamaño fijo en
   pantalla (un punto de luz se ve igual de cerca que de lejos). */
function sprite(mapa, color, escala, { intensidad = 1, pantalla = false } = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: mapa, color: new THREE.Color(color).multiplyScalar(intensidad), transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: !pantalla,
  }));
  s.scale.setScalar(escala);
  return s;
}

/* Una luz de navegación: el punto de la lámpara (casi blanco al centro, como
   se ve una luz roja muy fuerte) y un halo tenue del color de la luz. */
function foco(mapa, color, pos, { halo = 0.42 } = {}) {
  const g = new THREE.Group();
  g.position.set(...pos);
  const n = sprite(mapa, new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.5), 0.011, { intensidad: 28, pantalla: true });
  const h = sprite(mapa, color, halo, { intensidad: 2.4 });
  g.add(h, n);
  g.userData.partes = { n, h };
  return g;
}

/* Luces de navegación según las anclas del modelo. sector: "babor",
   "estribor" o "todo" (tope). */
export function crearNavegacion(modelo, mapa) {
  const a = modelo.anclas || {};
  const luces = [];
  if (a["nav-babor"]) luces.push({ sector: "babor", g: foco(mapa, "#ff2a1c", a["nav-babor"]) });
  if (a["nav-estribor"]) luces.push({ sector: "estribor", g: foco(mapa, "#19ff7a", a["nav-estribor"]) });
  if (a.tope) luces.push({ sector: "todo", g: foco(mapa, "#fff3df", a.tope, { halo: 0.5 }) });
  return luces;
}

/* Cuánto se ve cada luz desde la cámara (0 a 1). Proa +x, babor −z. */
export function visibilidad(sector, luz, camara) {
  if (sector === "todo") return 1;
  const dx = camara.x - luz.x, dz = camara.z - luz.z;
  // Marcación desde proa, positiva hacia babor.
  const b = THREE.MathUtils.radToDeg(Math.atan2(-dz, dx));
  const m = sector === "babor" ? b : -b;
  return suave(-4, 2, m) * (1 - suave(110, 116, m));
}

export function prenderNavegacion(luces, camara, intensidad) {
  const p = new THREE.Vector3();
  luces.forEach(({ sector, g }) => {
    g.getWorldPosition(p);
    const v = visibilidad(sector, p, camara.position) * intensidad;
    const { n, h } = g.userData.partes;
    n.material.opacity = v;
    h.material.opacity = v * 0.35;
    g.visible = v > 0.005;
  });
}

/* Luces de cortesía: LEDs bajos en la borda del cockpit (a unos 12 cm del
   piso) y en el espejo de popa sobre la planchada. Se ubican con rayos contra
   el modelo; si un rayo no encuentra lo esperado, ese LED no se pone. */
export function ubicarCortesia(modelo) {
  const piezas = ["teca", "cubierta", "casco", "costado"].map(n => modelo.piezas[n]).filter(Boolean);
  const pisos = ["teca", "cubierta"].map(n => modelo.piezas[n]).filter(Boolean);
  if (!piezas.length) return [];
  modelo.raiz.updateMatrixWorld(true);
  const rayo = new THREE.Raycaster();
  const normal = new THREE.Vector3();
  const normalDe = h => normal.copy(h.face.normal).transformDirection(h.object.matrixWorld);
  const leds = [];

  // Piso: el más bajo con cara hacia arriba, por encima del agua y bajo la borda.
  const piso = (x, z, borda) => {
    rayo.set(new THREE.Vector3(x, borda + 3, z), new THREE.Vector3(0, -1, 0));
    const h = rayo.intersectObjects(pisos, false)
      .filter(i => i.point.y > 0.08 && i.point.y < borda - 0.08 && Math.abs(normalDe(i).y) > 0.7);
    return h.length ? h[h.length - 1].point.y : null;
  };

  for (let u = 0.27; u <= 0.5; u += 0.032) {
    const s = modelo.enU(u);
    [-1, 1].forEach(lado => {
      const yp = piso(s.x, lado * s.media * 0.5, s.cubierta);
      if (yp == null) return;
      const y = yp + 0.09;
      rayo.set(new THREE.Vector3(s.x, y, lado * s.media * 0.2), new THREE.Vector3(0, 0, lado));
      const h = rayo.intersectObjects(piezas, false).find(i => Math.abs(normalDe(i).z) > 0.5);
      // Sólo en la borda (no en asientos o muebles más adentro).
      if (!h || h.distance > s.media * 1.1 || Math.abs(h.point.z) < s.media * 0.78) return;
      leds.push({ pos: [h.point.x, y, h.point.z - lado * 0.012], piso: yp, lado });
    });
  }

  // Espejo de popa: tres LEDs justo sobre la planchada, mirando hacia atrás.
  const popa = modelo.enU(0.03);
  rayo.set(new THREE.Vector3(popa.x, 6, 0), new THREE.Vector3(0, -1, 0));
  const golpes = rayo.intersectObjects(pisos, false).filter(i => i.point.y > 0.08 && normalDe(i).y > 0.7);
  const yPlanchada = golpes.length ? golpes[golpes.length - 1].point.y : null;
  if (yPlanchada != null) {
    [-0.55, 0, 0.55].forEach(z => {
      rayo.set(new THREE.Vector3(-LARGO, yPlanchada + 0.06, z), new THREE.Vector3(1, 0, 0));
      const h = rayo.intersectObjects(piezas, false).find(i => Math.abs(normalDe(i).x) > 0.5 && i.point.y > yPlanchada);
      if (h && h.point.x < 0) leds.push({ pos: [h.point.x - 0.012, yPlanchada + 0.06, h.point.z], piso: yPlanchada, lado: 0 });
    });
  }
  return leds;
}

/* Luces de cortesía como en un render: el LED es una pieza emisiva chica en
   la borda (el resplandor lo da el bloom) y su luz ilumina las superficies de
   verdad, dentro del material (teca, gelcoat, tapizados), con forma de cono
   hacia el piso. Las tiras LED del hardtop iluminan el cockpit desde arriba.
   Todo se calcula en coordenadas del barco (se mueve con él). */
export const MAX_LUCES = 24;

export function crearCortesia(leds, modelo) {
  const grupo = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.052, 0.016);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), side: THREE.DoubleSide });
  const luces = [];
  const adelante = new THREE.Vector3(0, 0, 1);
  leds.forEach(({ pos, lado }) => {
    // Hacia dónde alumbra: abajo y hacia el centro (o hacia popa en el espejo).
    const dir = (lado ? new THREE.Vector3(0, -0.6, -lado) : new THREE.Vector3(-0.8, -0.6, 0)).normalize();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.quaternion.setFromUnitVectors(adelante, new THREE.Vector3(dir.x, 0, dir.z).normalize());
    grupo.add(m);
    luces.push({ pos: new THREE.Vector3(...pos), dir, alcance: lado ? 1.0 : 1.3, cono: 0.1, fuerza: lado ? 1.6 : 2 });
  });
  // Tiras del hardtop: dos líneas de luces hacia abajo, una a cada lado del eje.
  const led = modelo.anclas?.led;
  if (led) {
    [-1, 1].forEach(k => [-0.75, -0.25, 0.25, 0.75].forEach(f => {
      luces.push({
        pos: new THREE.Vector3(led[0] + f * LARGO * 0.1, led[1] - 0.04, led[2] + k * 0.3),
        dir: new THREE.Vector3(0, -1, 0), alcance: 2.6, cono: -0.1, fuerza: 0.55,
      });
    }));
  }
  const usadas = luces.slice(0, MAX_LUCES);
  const uniforms = {
    luzPos: { value: Array.from({ length: MAX_LUCES }, (_, i) => (usadas[i] ? new THREE.Vector4(...usadas[i].pos.toArray(), usadas[i].alcance) : new THREE.Vector4())) },
    luzDir: { value: Array.from({ length: MAX_LUCES }, (_, i) => (usadas[i] ? new THREE.Vector4(...usadas[i].dir.toArray(), usadas[i].cono) : new THREE.Vector4())) },
    luzFuerza: { value: Array.from({ length: MAX_LUCES }, (_, i) => usadas[i]?.fuerza ?? 0) },
    luzN: { value: usadas.length },
    cortesia: { value: 0 },
    colorCortesia: { value: new THREE.Color("#ffc58a") },
    // Del mundo al barco (el barco se mece): se actualiza cada cuadro.
    alBarco: { value: new THREE.Matrix4() },
  };
  return { grupo, geo, mat, uniforms };
}

/* Inyecta la luz de cortesía en un material estándar o físico. */
export function iluminarConCortesia(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPosMundoCort;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvPosMundoCort = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vPosMundoCort;
        uniform vec4 luzPos[ ${MAX_LUCES} ];
        uniform vec4 luzDir[ ${MAX_LUCES} ];
        uniform float luzFuerza[ ${MAX_LUCES} ];
        uniform int luzN;
        uniform float cortesia;
        uniform vec3 colorCortesia;
        uniform mat4 alBarco;`)
      .replace("#include <opaque_fragment>", `
        if ( cortesia > 0.001 ) {
          vec3 pB = ( alBarco * vec4( vPosMundoCort, 1.0 ) ).xyz;
          vec3 nB = normalize( mat3( alBarco ) * ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
          float total = 0.0;
          for ( int i = 0; i < ${MAX_LUCES}; i++ ) {
            if ( i >= luzN ) break;
            vec3 L = pB - luzPos[ i ].xyz;
            // Sólo del lado hacia donde mira el LED: la luz no atraviesa la
            // borda (en las costuras del casco se filtraba hacia afuera).
            vec3 hacia = vec3( luzDir[ i ].x, 0.0, luzDir[ i ].z );
            if ( dot( hacia, hacia ) > 0.01 && dot( L, normalize( hacia ) ) < -0.004 ) continue;
            float d = length( L );
            vec3 Ld = L / max( d, 1e-4 );
            float alc = luzPos[ i ].w;
            float cono = smoothstep( luzDir[ i ].w, luzDir[ i ].w + 0.55, dot( Ld, luzDir[ i ].xyz ) );
            float r0 = alc * 0.16;
            float caida = 1.0 / ( 1.0 + ( d * d ) / ( r0 * r0 ) ) * ( 1.0 - smoothstep( alc * 0.55, alc, d ) );
            float lambert = max( dot( nB, -Ld ), 0.0 );
            total += cono * caida * lambert * luzFuerza[ i ];
          }
          outgoingLight += diffuseColor.rgb * colorCortesia * total * cortesia * 7.0;
        }
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => "cortesia";
  material.needsUpdate = true;
}

export function prenderCortesia(c, intensidad, barco) {
  c.uniforms.cortesia.value = intensidad;
  if (barco) c.uniforms.alBarco.value.copy(barco.matrixWorld).invert();
  // El LED: blanco cálido intenso (el bloom lo abre apenas).
  c.mat.color.set("#ffd7a6").multiplyScalar(intensidad * 9);
  c.grupo.visible = intensidad > 0.005;
}

/* Ancho del casco en la flotación, franja por franja a lo largo de la eslora
   (lo usan la sombra del casco y la espuma del agua). */
export function anchoFlotacion(modelo) {
  const mallas = ["casco", "costado", "fondo"].map(n => modelo.piezas[n]).filter(Boolean);
  if (!mallas.length) return null;
  modelo.raiz.updateMatrixWorld(true);
  const N = 256;
  const x0 = -LARGO / 2 - 0.2, x1 = LARGO / 2 + 0.2;
  const ancho = new Float32Array(N);
  const v = new THREE.Vector3();
  mallas.forEach(m => {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (Math.abs(v.y) > 0.06) continue;
      const k = Math.round(((v.x - x0) / (x1 - x0)) * (N - 1));
      if (k >= 0 && k < N) ancho[k] = Math.max(ancho[k], Math.abs(v.z));
    }
  });
  // Suavizado (los vértices caen salteados) y huecos rellenos.
  const liso = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    let m = 0;
    for (let j = -3; j <= 3; j++) m = Math.max(m, ancho[Math.min(N - 1, Math.max(0, k + j))]);
    liso[k] = m;
  }
  const max = Math.max(...liso);
  if (!max) return null;
  // Popa: donde empieza el casco desde atrás; su manga ahí abre la estela.
  const kPopa = liso.findIndex(w => w > max * 0.2);
  const popa = x0 + (kPopa / (N - 1)) * (x1 - x0);
  const mangaPopa = liso[Math.min(N - 1, kPopa + 4)];
  return { liso, N, x0, x1, max, popa, mangaPopa };
}

/* El mismo ancho como textura de una fila (para el shader del agua). */
export function texturaAncho(a) {
  const datos = new Uint8Array(a.N * 4);
  for (let k = 0; k < a.N; k++) datos.set([Math.round((a.liso[k] / a.max) * 255), 0, 0, 255], k * 4);
  const t = new THREE.DataTexture(datos, a.N, 1, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/* Rocío de proa al navegar: gotas que el casco despide hacia los costados y
   atrás donde corta el agua. Se simulan en el procesador (pocas, baratas). */
export function crearRocio(modelo, mapa) {
  const N = 520;
  const a = anchoFlotacion(modelo);
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
  const mat = new THREE.PointsMaterial({ map: mapa, size: 0.32, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
  const puntos = new THREE.Points(geo, mat);
  puntos.frustumCulled = false;
  const ancho = x => {
    if (!a) return LARGO * 0.14;
    const k = Math.round(((x - a.x0) / (a.x1 - a.x0)) * (a.N - 1));
    return a.liso[Math.min(a.N - 1, Math.max(0, k))];
  };
  const p = Array.from({ length: N }, () => ({ vida: 0, dur: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  let semilla = 3;
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  const G = 9.8 / 1.36;
  function actualizar(dt, f, brillo) {
    const nuevas = f > 0.05 ? Math.floor(N * 1.4 * dt * f) + (azar() < N * 1.4 * dt * f % 1 ? 1 : 0) : 0;
    let creadas = 0;
    for (let i = 0; i < N; i++) {
      const q = p[i];
      if (q.vida <= 0) {
        if (creadas >= nuevas) { col[i * 4 + 3] = 0; continue; }
        creadas++;
        const lado = azar() < 0.5 ? -1 : 1;
        q.x = -0.4 + azar() * 2.6;
        q.z = lado * (ancho(q.x) + 0.04);
        q.y = 0.04;
        q.vx = -(0.6 + azar() * 2.2) * f;
        q.vz = lado * (1.2 + azar() * 2.4) * f;
        q.vy = (0.9 + azar() * 1.8) * f;
        q.dur = q.vida = 0.45 + azar() * 0.7;
      }
      q.vida -= dt;
      q.vy -= G * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0) q.vida = 0;
      pos[i * 3] = q.x; pos[i * 3 + 1] = q.y; pos[i * 3 + 2] = q.z;
      const t = 1 - Math.max(0, q.vida) / q.dur;
      col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = brillo;
      col[i * 4 + 3] = q.vida > 0 ? Math.sin(Math.PI * Math.min(1, t * 1.6)) * 0.55 : 0;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    puntos.visible = f > 0.03;
  }
  return { puntos, geo, mat, actualizar };
}
