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
   pantalla (un punto de luz se ve igual de cerca que de lejos). adelanto:
   corre la comparación de profundidad hacia la cámara sin cambiar posición ni
   tamaño en pantalla, para que el fanal o la borda donde apoya no recorten el
   halo a mitad de camino. */
function sprite(mapa, color, escala, { intensidad = 1, pantalla = false, adelanto = 0.05 } = {}) {
  const mat = new THREE.SpriteMaterial({
    map: mapa, color: new THREE.Color(color).multiplyScalar(intensidad), transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: !pantalla,
  });
  if (adelanto > 0) {
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace(
        "gl_Position = projectionMatrix * mvPosition;",
        `float dVista = length( mvPosition.xyz );
        float tiro = max( scale.x, scale.y ) * 0.55 + ${adelanto.toFixed(3)};
        mvPosition.xyz *= max( 0.05, ( dVista - tiro ) / max( dVista, 1e-4 ) );
        gl_Position = projectionMatrix * mvPosition;`,
      );
    };
    mat.customProgramCacheKey = () => `sprite-luz-${adelanto}`;
  }
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(escala);
  return s;
}

/* Una luz de navegación: el punto de la lámpara (casi blanco al centro, como
   se ve una luz muy fuerte), un halo intermedio saturado y un velo tenue del
   color del filtro. El núcleo tiene ancho suficiente en pantalla para no
   parpadear al mecerse el barco. */
function foco(mapa, color, pos, { halo = 0.36 } = {}) {
  const g = new THREE.Group();
  g.position.set(...pos);
  const c = new THREE.Color(color);
  const n = sprite(mapa, c.clone().lerp(new THREE.Color("#ffffff"), 0.7), 0.018, { intensidad: 3.4, pantalla: true, adelanto: 0.06 });
  const m = sprite(mapa, c.clone().lerp(new THREE.Color("#ffffff"), 0.22), halo * 0.42, { intensidad: 2.6, adelanto: 0.04 });
  const h = sprite(mapa, c, halo, { intensidad: 1.5, adelanto: 0.03 });
  g.add(h, m, n);
  g.userData.partes = { n, m, h };
  return g;
}

/* Luces de navegación según las anclas del modelo. sector: "babor",
   "estribor" o "todo" (tope). */
export function crearNavegacion(modelo, mapa) {
  const a = modelo.anclas || {};
  const luces = [];
  if (a["nav-babor"]) luces.push({ sector: "babor", g: foco(mapa, "#ff2618", a["nav-babor"], { halo: 0.34 }) });
  if (a["nav-estribor"]) luces.push({ sector: "estribor", g: foco(mapa, "#14ff74", a["nav-estribor"], { halo: 0.34 }) });
  if (a.tope) luces.push({ sector: "todo", g: foco(mapa, "#fff3df", a.tope, { halo: 0.4 }) });
  return luces;
}

/* Cuánto se ve cada luz desde la cámara (0 a 1). Proa +x, babor −z. */
export function visibilidad(sector, luz, camara) {
  if (sector === "todo") return 1;
  const dx = camara.x - luz.x, dz = camara.z - luz.z;
  // Marcación desde proa, positiva hacia babor (corte reglamentario a 112,5°).
  const b = THREE.MathUtils.radToDeg(Math.atan2(-dz, dx));
  const m = sector === "babor" ? b : -b;
  const dentro = suave(-3, 1.8, m) * (1 - suave(110, 115, m));
  const eje = Math.max(0, 1 - Math.abs(m - 42) / 58);
  return dentro * (0.86 + 0.14 * eje * eje);
}

const _posNav = new THREE.Vector3();
export function prenderNavegacion(luces, camara, intensidad) {
  luces.forEach(({ sector, g }) => {
    g.getWorldPosition(_posNav);
    const v = visibilidad(sector, _posNav, camara.position) * intensidad;
    const { n, m, h } = g.userData.partes;
    n.material.opacity = v;
    if (m) m.material.opacity = v * 0.45;
    h.material.opacity = v * 0.24;
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

  for (let u = 0.275; u <= 0.5; u += 0.055) {
    const s = modelo.enU(u);
    [-1, 1].forEach(lado => {
      // Se mide el piso en el pasillo lateral (en el centro están la mesa y los sillones).
      const yp = piso(s.x, lado * s.media * 0.72, s.cubierta) ?? piso(s.x, lado * s.media * 0.5, s.cubierta);
      if (yp == null) return;
      const y = yp + 0.09;
      rayo.set(new THREE.Vector3(s.x, y, lado * s.media * 0.2), new THREE.Vector3(0, 0, lado));
      // Se filtran muebles centrales y esquinas curvas: sólo la cara plana interior de la borda.
      const h = rayo.intersectObjects(piezas, false)
        .find(i => Math.abs(normalDe(i).z) > 0.9 && Math.abs(i.point.z) >= s.media * 0.78 && Math.abs(i.point.z) <= s.media * 0.96);
      if (!h) return;
      const n = normalDe(h);
      const sg = Math.sign(-lado * n.z) || 1;
      leds.push({
        pos: [h.point.x, y, h.point.z - lado * 0.012],
        normal: [n.x * sg, n.y * sg, n.z * sg],
        piso: yp,
        lado,
      });
    });
  }

  // Espejo de popa: tres LEDs justo sobre la planchada, mirando hacia atrás.
  const popa = modelo.enU(0.03);
  rayo.set(new THREE.Vector3(popa.x, 6, 0), new THREE.Vector3(0, -1, 0));
  const golpes = rayo.intersectObjects(pisos, false).filter(i => i.point.y > 0.08 && normalDe(i).y > 0.7);
  const yPlanchada = golpes.length ? golpes[golpes.length - 1].point.y : null;
  if (yPlanchada != null) {
    [-0.55, 0, 0.55].forEach(z => {
      rayo.set(new THREE.Vector3(-LARGO, yPlanchada + 0.065, z), new THREE.Vector3(1, 0, 0));
      const h = rayo.intersectObjects(piezas, false).find(i => Math.abs(normalDe(i).x) > 0.5 && i.point.y > yPlanchada);
      if (h && h.point.x < 0) {
        const n = normalDe(h);
        const sg = n.x > 0 ? -1 : 1;
        leds.push({
          pos: [h.point.x - 0.012, yPlanchada + 0.065, h.point.z],
          normal: [n.x * sg, n.y * sg, n.z * sg],
          piso: yPlanchada,
          lado: 0,
        });
      }
    });
  }
  return leds;
}

/* Luces de cortesía como en un render: cada aplique combina una lente tipo
   cápsula alineada con la inclinación real de la borda y un halo óptico suave
   (sprite con adelanto de profundidad que no se clava en la pared y se apaga
   al mirarlo de atrás), mientras su luz baña el piso y los asientos dentro del
   material sin saturar las texturas ni marcar aristas.
   Todo se calcula en coordenadas del barco (se mueve con él). */
export const MAX_LUCES = 24;

export function crearCortesia(leds, modelo) {
  const grupo = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.095, 0.055);
  const matBase = new THREE.ShaderMaterial({
    uniforms: {
      uInt: { value: 0 },
      uNucleo: { value: new THREE.Color("#fffaf2") },
      uHalo: { value: new THREE.Color("#ffbe76") },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        // Escala mínima en pantalla: evita que de lejos el diodo quede más
        // chico que un píxel y titile al mecerse el barco sobre las olas.
        vec4 mvCentro = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        float dVista = length( mvCentro.xyz );
        float esc = max( 1.0, dVista * 0.14 );
        vec4 mvPosition = modelViewMatrix * vec4( position * esc, 1.0 );
        mvPosition.xyz *= max( 0.05, ( dVista - 0.04 * esc ) / max( dVista, 1e-4 ) );
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uInt;
      uniform vec3 uNucleo;
      uniform vec3 uHalo;
      void main() {
        // Cápsula horizontal amplia (siempre >= 4 px en pantalla, sin sub-píxel).
        vec2 p = vec2( max( abs( vUv.x ) - 0.24, 0.0 ) / 0.76, vUv.y );
        float r = length( p );
        if ( r >= 1.0 ) discard;
        float u = 1.0 - r;
        float borde = u * u * u * ( u * ( u * 6.0 - 15.0 ) + 10.0 );
        float diodo = exp( -( p.x * p.x * 3.6 + p.y * p.y * 4.2 ) );
        float halo = exp( -r * r * 1.8 ) * ( 0.92 - 0.14 * vUv.y );
        vec3 col = ( uNucleo * diodo * 3.1 + uHalo * halo * 1.35 ) * borde * uInt;
        float alfa = clamp( ( diodo + halo * 0.7 ) * borde * min( 1.0, uInt * 1.4 ), 0.0, 1.0 );
        gl_FragColor = vec4( col, alfa );
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  const luces = [];
  const halos = [];
  const arriba = new THREE.Vector3(0, 1, 0);
  const ejeX = new THREE.Vector3();
  const ejeY = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  leds.forEach(({ pos, normal, lado }) => {
    const nPared = (normal ? new THREE.Vector3(...normal) : (lado ? new THREE.Vector3(0, 0, -lado) : new THREE.Vector3(-1, 0, 0))).normalize();
    const dir = (lado ? new THREE.Vector3(0, -0.55, -lado) : new THREE.Vector3(-0.84, -0.55, 0)).normalize();
    // Orientación ortonormal apoyada sobre el plano real de la borda (con su inclinación vertical).
    ejeX.crossVectors(arriba, nPared).normalize();
    ejeY.crossVectors(nPared, ejeX).normalize();
    rot.makeBasis(ejeX, ejeY, nPared);
    const m = new THREE.Mesh(geo, matBase.clone());
    m.position.set(...pos);
    m.quaternion.setFromRotationMatrix(rot);
    grupo.add(m);
    halos.push({ m, n: nPared });
    luces.push({ pos: new THREE.Vector3(...pos), dir, alcance: lado ? 1.15 : 1.35, cono: 0.08, fuerza: lado ? 0.95 : 1.15, zmax: 1.35 });
  });
  // Tiras del hardtop: dos líneas continuas de luz hacia abajo (babor y estribor).
  // En `cono` negativo guardamos la semilongitud real de la tira (0,88 unidades)
  // para evaluar cada tira entera de una sola vez, sin sumar focos superpuestos.
  const led = modelo.anclas?.led;
  if (led) {
    const semiTira = 0.88;
    [-1, 1].forEach(k => {
      luces.push({
        pos: new THREE.Vector3(led[0], led[1] - 0.05, led[2] + k * 0.3),
        dir: new THREE.Vector3(0, -1, 0), alcance: 2.5, cono: -semiTira, fuerza: 0.52, zmax: 1.34,
      });
    });
  }
  const usadas = luces.slice(0, MAX_LUCES);
  const uniforms = {
    luzPos: { value: Array.from({ length: MAX_LUCES }, (_, i) => (usadas[i] ? new THREE.Vector4(...usadas[i].pos.toArray(), usadas[i].alcance) : new THREE.Vector4())) },
    luzDir: { value: Array.from({ length: MAX_LUCES }, (_, i) => (usadas[i] ? new THREE.Vector4(...usadas[i].dir.toArray(), usadas[i].cono) : new THREE.Vector4())) },
    luzFuerza: { value: Array.from({ length: MAX_LUCES }, (_, i) => usadas[i]?.fuerza ?? 0) },
    luzZmax: { value: Array.from({ length: MAX_LUCES }, (_, i) => usadas[i]?.zmax ?? 0) },
    luzN: { value: usadas.length },
    cortesia: { value: 0 },
    colorCortesia: { value: new THREE.Color("#ffc994") },
    // Del mundo al barco (el barco se mece): se actualiza cada cuadro.
    alBarco: { value: new THREE.Matrix4() },
  };
  return { grupo, geo, mat: matBase, halos, uniforms };
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
        uniform float luzZmax[ ${MAX_LUCES} ];
        uniform int luzN;
        uniform float cortesia;
        uniform vec3 colorCortesia;
        uniform mat4 alBarco;`)
      .replace("#include <opaque_fragment>", `
        if ( cortesia > 0.001 ) {
          vec3 pB = ( alBarco * vec4( vPosMundoCort, 1.0 ) ).xyz;
          // Se usa la normal geométrica (sin el mapa de relieve de la teca ni
          // del cuero): a ángulo rasante el relieve convertía la veta en ruido.
          vec3 nGeom = normalize( mat3( alBarco ) * ( vec4( nonPerturbedNormal, 0.0 ) * viewMatrix ).xyz );
          float totalCort = 0.0;
          for ( int i = 0; i < ${MAX_LUCES}; i++ ) {
            if ( i >= luzN ) break;
            float zLim = 1.0 - smoothstep( luzZmax[ i ] - 0.05, luzZmax[ i ] + 0.01, abs( pB.z ) );
            if ( zLim <= 0.001 ) continue;
            vec3 L = pB - luzPos[ i ].xyz;
            float alc = luzPos[ i ].w;
            float semi = -luzDir[ i ].w;
            if ( semi > 0.001 ) {
              // Tira continua del hardtop: sólo ilumina hacia abajo (dentro del
              // cockpit y sobre la cubierta, sin atravesar el piso hacia la cabina).
              float bajoTecho = smoothstep( -0.06, -0.26, L.y ) * smoothstep( 0.32, 0.48, pB.y );
              if ( bajoTecho <= 0.001 ) continue;
              L.x -= clamp( L.x, -semi, semi );
              float d2 = dot( L, L );
              if ( d2 >= alc * alc ) continue;
              float d = sqrt( d2 );
              vec3 Ld = L / max( d, 1e-4 );
              float u = d / alc;
              float ventana = ( 1.0 - u * u ) * ( 1.0 - u * u );
              float abajo = max( 0.0, -Ld.y );
              float cono = smoothstep( 0.18, 0.78, abajo );
              float r0 = alc * 0.42;
              float caida = ventana / ( 1.0 + d2 / ( r0 * r0 ) );
              // Iluminación envuelta suave: evita pliegues negros en almohadones
              // y manchas oscuras en las uniones de la cubierta.
              float nl = clamp( dot( nGeom, -Ld ), 0.0, 1.0 );
              float env = 0.32 + 0.68 * max( ( dot( nGeom, -Ld ) + 0.35 ) / 1.35, 0.0 );
              totalCort += cono * caida * mix( nl, env, 0.65 ) * bajoTecho * zLim * luzFuerza[ i ];
            } else {
              // Aplique bajo de cortesía: proyecta un abanico elíptico suave
              // hacia adelante y abajo sobre el piso, sin cortar la pared.
              vec2 hacia = normalize( luzDir[ i ].xz );
              vec2 Lxz = L.xz;
              float xf = dot( Lxz, hacia );
              if ( xf <= -0.01 || L.y > 0.015 ) continue;
              float xs = Lxz.x * hacia.y - Lxz.y * hacia.x;
              // Nace suave desde el zócalo hacia afuera (sin borde duro ni mancha
              // pegada a la pared) y sólo debajo del aplique.
              float frente = smoothstep( -0.005, 0.085, xf );
              float debajo = smoothstep( 0.01, -0.038, L.y );
              // Abanico ancho y suave sobre los tablones de teca.
              float elipse2 = ( ( xf - 0.14 ) * ( xf - 0.14 ) ) / ( alc * alc * 0.22 )
                + ( xs * xs ) / ( ( 0.16 + xf * 0.52 ) * ( 0.16 + xf * 0.52 ) )
                + ( ( L.y + 0.085 ) * ( L.y + 0.085 ) ) * 3.5;
              float u = clamp( length( L ) / alc, 0.0, 1.0 );
              float ventana = ( 1.0 - u * u ) * ( 1.0 - u * u );
              float caida = exp( -elipse2 * 1.45 ) * ventana;
              float orient = 0.55 + 0.45 * clamp( nGeom.y, 0.0, 1.0 );
              totalCort += frente * debajo * caida * orient * zLim * luzFuerza[ i ];
            }
          }
          // Compresión suave de altas luces sobre las superficies: la madera y
          // los tapizados se ven iluminados con calidez pero nunca se queman
          // ni disparan el bloom por su cuenta.
          float luzSuave = totalCort / ( 1.0 + totalCort * 0.55 );
          outgoingLight += diffuseColor.rgb * colorCortesia * luzSuave * cortesia * 3.2;
        }
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => "cortesia-v4";
  material.needsUpdate = true;
}

const _posHalo = new THREE.Vector3();
const _normHalo = new THREE.Vector3();
export function prenderCortesia(c, intensidad, barco, camara) {
  c.uniforms.cortesia.value = intensidad;
  if (barco) {
    barco.updateMatrixWorld();
    c.uniforms.alBarco.value.copy(barco.matrixWorld).invert();
  }
  if (c.halos) {
    c.halos.forEach(({ m, n }) => {
      let vis = 1;
      if (camara) {
        m.getWorldPosition(_posHalo);
        _normHalo.copy(n);
        if (barco) _normHalo.transformDirection(barco.matrixWorld);
        const vx = camara.position.x - _posHalo.x;
        const vy = camara.position.y - _posHalo.y;
        const vz = camara.position.z - _posHalo.z;
        const d = Math.hypot(vx, vy, vz) || 1;
        const cos = (vx * _normHalo.x + vy * _normHalo.y + vz * _normHalo.z) / d;
        vis = suave(0.0, 0.25, cos);
      }
      if (m.material.uniforms?.uInt) m.material.uniforms.uInt.value = intensidad * vis;
      m.visible = intensidad * vis > 0.005;
    });
  }
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
