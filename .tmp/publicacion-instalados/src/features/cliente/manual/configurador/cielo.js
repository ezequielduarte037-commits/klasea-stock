/* ═══════════════════════════════════════════════════════════════
   Configurador · cielo
   Cielos fotográficos reales (HDRI "puresky" de Poly Haven) a lo largo
   del día, preparados con scripts/cielos-hdri.mjs: la mitad de arriba de
   cada HDRI, normalizada y guardada como lineal/K. Una cúpula funde dos
   cielos según la hora (y un tercero si está nublado o llueve); del cielo
   salen el fondo, los reflejos del agua y del barco, el sol y la niebla.
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";

const RUTA = "/cielos/";
const K = 6;

/* Cielos del día, por hora. sol: hacia dónde queda el sol alrededor del
   barco (grados, 0 = proa, 90 = estribor): sale por proa a babor, al
   mediodía queda detrás de la cámara inicial y al atardecer cae detrás del
   barco, en cuadro. brillo: luminosidad de ese cielo (cada HDRI viene
   normalizado). */
export const CIELOS_HORA = [
  { id: "qwantani_dusk_2_puresky", h: 5.2, sol: -70, brillo: 0.32 },
  { id: "qwantani_sunrise_puresky", h: 6.5, sol: -50, brillo: 0.7 },
  { id: "qwantani_morning_puresky", h: 8.6, sol: -15, brillo: 0.95 },
  { id: "kloofendal_48d_partly_cloudy_puresky", h: 11.4, sol: 40, brillo: 1 },
  { id: "kloppenheim_05_puresky", h: 14.2, sol: 75, brillo: 1 },
  { id: "qwantani_late_afternoon_puresky", h: 16.8, sol: 125, brillo: 0.9 },
  { id: "kloppenheim_06_puresky", h: 18.6, sol: 200, brillo: 0.85 },
  { id: "qwantani_dusk_2_puresky", h: 19.6, sol: 215, brillo: 0.36 },
  { id: "qwantani_night_puresky", h: 21.2, sol: 235, brillo: 0.032 },
];
export const CIELOS_CLIMA = {
  nubes: { id: "kloofendal_overcast_puresky", sol: 60, brillo: 0.8 },
  lluvia: { id: "overcast_soil_puresky", sol: 60, brillo: 0.5 },
};

/* Los dos cielos de la hora y cuánto de cada uno. */
export function cielosDeHora(hora) {
  const L = CIELOS_HORA;
  if (hora <= L[0].h) return { a: L[0], b: L[0], t: 0 };
  if (hora >= L[L.length - 1].h) return { a: L[L.length - 1], b: L[L.length - 1], t: 0 };
  const i = L.findIndex((c, k) => hora >= c.h && hora < L[k + 1].h);
  const t = (hora - L[i].h) / (L[i + 1].h - L[i].h);
  return { a: L[i], b: L[i + 1], t: t * t * (3 - 2 * t) };
}

/* Carga el índice y las imágenes (1,6 MB entre todos). */
export async function cargarCielos() {
  const datos = await (await fetch(`${RUTA}cielos.json`)).json();
  const loader = new THREE.TextureLoader();
  const ids = [...new Set([...CIELOS_HORA.map(c => c.id), ...Object.values(CIELOS_CLIMA).map(c => c.id)])];
  const texturas = {};
  await Promise.all(ids.map(id => loader.loadAsync(`${RUTA}${id}.jpg`).then(t => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 4;
    texturas[id] = t;
  })));
  return { datos, texturas };
}

/* Dirección del sol (mundo) de un cielo: su elevación medida en el HDRI y
   el acimut que le toca alrededor del barco. */
export function solDe(cielo, datos) {
  const d = datos[cielo.id]?.sol || { elev: 30 };
  const e = THREE.MathUtils.degToRad(d.elev), a = THREE.MathUtils.degToRad(cielo.sol);
  return new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
}

/* Giro de la imagen para que su sol quede en cielo.sol. */
const giroDe = (cielo, datos) => THREE.MathUtils.degToRad(cielo.sol - (datos[cielo.id]?.sol?.az ?? 0));

/* Material de la cúpula: tres cielos (dos de la hora y el del clima). */
export function crearMaterialCielo() {
  const slot = () => ({ value: null });
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      mapaA: slot(), mapaB: slot(), mapaC: slot(),
      giro: { value: new THREE.Vector3() }, brillo: { value: new THREE.Vector3(1, 1, 1) },
      t: { value: 0 }, tc: { value: 0 }, fondo: { value: (90 + 11.25) / 180 },
    },
    vertexShader: `varying vec3 vDir;
      void main() {
        vDir = normalize( position );
        vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_Position = p.xyww;
      }`,
    fragmentShader: `uniform sampler2D mapaA; uniform sampler2D mapaB; uniform sampler2D mapaC;
      uniform vec3 giro; uniform vec3 brillo; uniform float t; uniform float tc; uniform float fondo;
      varying vec3 vDir;
      const float PI = 3.14159265;
      vec3 leer( sampler2D m, float g, vec3 d ) {
        // En el cenit atan(0, 0) no está definido (daba píxeles inválidos).
        float u = ( abs( d.x ) + abs( d.z ) < 1e-5 ? 0.0 : atan( d.z, d.x ) - g ) / ( 2.0 * PI ) + 0.5;
        float e = asin( clamp( d.y, -1.0, 1.0 ) );
        float v = 1.0 - clamp( ( 0.5 * PI - e ) / PI / fondo, 0.0, 0.999 );
        return texture2D( m, vec2( u, v ) ).rgb * ${K.toFixed(1)};
      }
      void main() {
        vec3 d = normalize( vDir );
        vec3 c = mix( leer( mapaA, giro.x, d ) * brillo.x, leer( mapaB, giro.y, d ) * brillo.y, t );
        if ( tc > 0.001 ) c = mix( c, leer( mapaC, giro.z, d ) * brillo.z, tc );
        gl_FragColor = vec4( max( c, vec3( 0.0 ) ), 1.0 );
        #include <colorspace_fragment>
      }`,
  });
}

/* Estado del cielo para una hora y un clima (lo que la escena interpola). */
export function estadoCielo(hora, clima, datos) {
  const { a, b, t } = cielosDeHora(hora);
  const c = CIELOS_CLIMA[clima] || null;
  return { a, b, t, c, tc: c ? 1 : 0, datos };
}

/* Aplica al material: texturas, giros, brillos y mezclas. */
export function aplicarCielo(material, { a, b, t, c }, tc, texturas, datos, cUltimo) {
  const u = material.uniforms;
  u.mapaA.value = texturas[a.id];
  u.mapaB.value = texturas[b.id];
  const cc = c || cUltimo;
  if (cc) u.mapaC.value = texturas[cc.id];
  u.giro.value.set(giroDe(a, datos), giroDe(b, datos), cc ? giroDe(cc, datos) : 0);
  u.brillo.value.set(a.brillo, b.brillo, cc ? cc.brillo : 1);
  u.t.value = t;
  u.tc.value = cc ? tc : 0;
}

/* Datos derivados para luces y niebla (mezcla de los cielos en juego). */
export function luzDelCielo({ a, b, t }, cc, tc, datos) {
  const items = [[a, (1 - t) * (1 - tc)], [b, t * (1 - tc)]];
  if (cc) items.push([cc, tc]);
  const dir = new THREE.Vector3(), horizonte = new THREE.Color(0, 0, 0), solColor = new THREE.Color(0, 0, 0);
  let fuerza = 0;
  items.forEach(([cielo, w]) => {
    if (w <= 0) return;
    const d = datos[cielo.id];
    dir.addScaledVector(solDe(cielo, datos), w);
    const h = d?.horizonte || [1, 1, 1];
    horizonte.r += h[0] * cielo.brillo * w; horizonte.g += h[1] * cielo.brillo * w; horizonte.b += h[2] * cielo.brillo * w;
    const s = d?.sol?.color || [1, 1, 1];
    const m = Math.max(...s, 1e-6);
    solColor.r += (s[0] / m) * w; solColor.g += (s[1] / m) * w; solColor.b += (s[2] / m) * w;
    // Sol nítido (fuerza alta) da luz directa fuerte; tras nubes o bruma, poca.
    const nitidez = THREE.MathUtils.clamp((Math.log10(Math.max(1, d?.sol?.fuerza ?? 1)) - 1.5) / 4, 0.08, 1);
    fuerza += cielo.brillo * nitidez * w;
  });
  dir.normalize();
  if (dir.y < 0.02) dir.y = 0.02;
  return { dir: dir.normalize(), horizonte, solColor, fuerza };
}
