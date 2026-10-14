/* ═══════════════════════════════════════════════════════════════
   Configurador · olas
   Mar de verdad: suma de olas de Gerstner (las crestas se afilan y los
   valles se abren, como en el agua real). Las mismas olas mueven la malla
   del agua en el shader y mecen el barco, así flota sobre lo que se ve.
   Escala: 1 unidad ≈ 1,36 m (LARGO = 10 es la eslora del K43).
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";

const G = 9.8 / 1.36; // gravedad en unidades de escena

/* Mar de fondo largo y olas cortas de viento, en direcciones distintas.
   largo: longitud de onda (unidades); alto: amplitud con mar calmo. */
export const OLAS = [
  { dir: [0.93, 0.36], largo: 29, alto: 0.13 },
  { dir: [0.31, -0.95], largo: 17, alto: 0.085 },
  { dir: [-0.62, 0.78], largo: 9.5, alto: 0.05 },
  { dir: [0.97, -0.24], largo: 5.6, alto: 0.03 },
  { dir: [-0.28, -0.96], largo: 3.4, alto: 0.017 },
  { dir: [0.71, 0.7], largo: 2.1, alto: 0.01 },
];
// Afilado de las crestas (0 = senoidal, 1 = cresta en punta).
export const AFILADO = 0.55;

/* Uniforms para el shader: (dirX, dirZ, k, amplitud) y la frecuencia. */
export function uniformsOlas() {
  return {
    olas: { value: OLAS.map(o => { const d = new THREE.Vector2(...o.dir).normalize(); return new THREE.Vector4(d.x, d.y, (2 * Math.PI) / o.largo, o.alto); }) },
    frecuencias: { value: OLAS.map(o => Math.sqrt(G * ((2 * Math.PI) / o.largo))) },
    tiempoOla: { value: 0 },
    fuerzaOla: { value: 1 },
  };
}

/* Altura del agua en (x, z) (aproximada: sin el corrimiento horizontal). */
export function alturaOla(x, z, t, fuerza) {
  let h = 0;
  for (let i = 0; i < OLAS.length; i++) {
    const o = OLAS[i];
    const l = Math.hypot(o.dir[0], o.dir[1]);
    const k = (2 * Math.PI) / o.largo;
    const w = Math.sqrt(G * k);
    h += o.alto * fuerza * Math.sin(k * ((o.dir[0] / l) * x + (o.dir[1] / l) * z) - w * t);
  }
  return h;
}

/* Vértice del agua: desplazamiento de Gerstner y su normal (se apaga lejos,
   donde la malla es rala y sólo haría titilar). */
export const OLAS_GLSL = /* glsl */`
  #define N_OLAS ${OLAS.length}
  uniform vec4 olas[ N_OLAS ];
  uniform float frecuencias[ N_OLAS ];
  uniform float tiempoOla;
  uniform float fuerzaOla;
  vec3 gerstner( vec2 p, float apagado, out vec3 normal ) {
    vec3 d = vec3( 0.0 );
    vec3 tx = vec3( 1.0, 0.0, 0.0 );
    vec3 tz = vec3( 0.0, 0.0, 1.0 );
    for ( int i = 0; i < N_OLAS; i++ ) {
      vec2 dir = olas[ i ].xy;
      float k = olas[ i ].z;
      float a = olas[ i ].w * fuerzaOla * apagado;
      float f = k * dot( dir, p ) - frecuencias[ i ] * tiempoOla;
      float q = ${AFILADO.toFixed(2)} / ( k * max( olas[ i ].w * fuerzaOla, 1e-4 ) * float( N_OLAS ) );
      q = min( q, 1.0 / ( k * max( a, 1e-4 ) * float( N_OLAS ) ) );
      float c = cos( f ), s = sin( f );
      d.x += q * a * dir.x * c;
      d.z += q * a * dir.y * c;
      d.y += a * s;
      float wa = k * a;
      tx += vec3( -q * dir.x * dir.x * wa * s, dir.x * wa * c, -q * dir.x * dir.y * wa * s );
      tz += vec3( -q * dir.x * dir.y * wa * s, dir.y * wa * c, -q * dir.y * dir.y * wa * s );
    }
    normal = normalize( cross( tz, tx ) );
    return d;
  }
`;

/* Malla del agua en el plano XY (Water la gira a horizontal): densa cerca
   del centro (que sigue a la cámara) y cada vez más rala hacia el horizonte. */
export function mallaAgua(n) {
  const A = 70, B = 4430;
  const g = u => Math.sign(u) * (A * Math.abs(u) + B * Math.abs(u) ** 4);
  const pos = new Float32Array((n + 1) * (n + 1) * 3);
  const uv = new Float32Array((n + 1) * (n + 1) * 2);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const k = j * (n + 1) + i;
    pos.set([g(i / n * 2 - 1), g(j / n * 2 - 1), 0], k * 3);
    uv.set([i / n, j / n], k * 2);
  }
  const idx = new Uint32Array(n * n * 6);
  let o = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    idx.set([a, b, d, a, d, c], o);
    o += 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array((n + 1) * (n + 1) * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return { geo, paso: (A * 2) / n };
}
