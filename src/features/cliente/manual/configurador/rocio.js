/* ═══════════════════════════════════════════════════════════════
   Configurador · rocío
   El agua que levanta el casco al planear: la "cortina" de gotas que sale
   de la ola de proa hacia los costados y cae, y una neblina blanda que el
   viento de la marcha arrastra hacia popa (también detrás del espejo).
   Las gotas se mueven en el procesador (pocas y baratas) y se dibujan como
   puntos suaves que toman la luz del momento; a contraluz el rocío brilla,
   como en el mar.
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";
import { anchoFlotacion } from "./luces";

const G = 9.8 / 1.36; // gravedad en unidades de escena

const VERTICE = /* glsl */`
  attribute vec4 datos; // edad (0 a 1), tamaño, opacidad, tipo (0 gota, 1 neblina)
  uniform float escala;
  uniform vec3 sol;
  uniform vec3 luz;
  varying float vAlfa;
  varying float vTipo;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mv;
    float edad = datos.x;
    // La neblina se abre al envejecer; las gotas casi no cambian.
    float crece = datos.w > 0.5 ? 0.6 + 1.8 * edad : 1.0 + 0.5 * edad;
    gl_PointSize = max( datos.y * crece * escala / max( -mv.z, 0.1 ), 1.0 );
    vAlfa = datos.z * smoothstep( 0.0, 0.08, edad ) * ( 1.0 - smoothstep( 0.5, 1.0, edad ) );
    // Contraluz: las gotitas dispersan la luz del sol hacia adelante.
    vec3 alOjo = normalize( ( modelMatrix * vec4( position, 1.0 ) ).xyz - cameraPosition );
    float contraluz = pow( max( dot( alOjo, sol ), 0.0 ), 8.0 );
    vColor = luz * ( 0.8 + 2.4 * contraluz );
    vTipo = datos.w;
    if ( vAlfa < 0.002 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
  }
`;

const FRAGMENTO = /* glsl */`
  varying float vAlfa;
  varying float vTipo;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot( c, c );
    if ( r2 > 1.0 ) discard;
    // La neblina sin borde (una campana que llega a cero); la gota, un punto suave.
    float a = vTipo > 0.5 ? ( exp( -r2 * 5.0 ) - 0.0067 ) / 0.9933 : 1.0 - smoothstep( 0.1, 1.0, r2 );
    gl_FragColor = vec4( vColor, vAlfa * a );
  }
`;

export function crearRocio(modelo, { chico = false } = {}) {
  const a = anchoFlotacion(modelo);
  const ancho = x => {
    if (!a) return 1.3;
    const k = Math.round(((x - a.x0) / (a.x1 - a.x0)) * (a.N - 1));
    return a.liso[Math.min(a.N - 1, Math.max(0, k))];
  };
  const popa = a ? a.popa : -4.4, manga = a ? a.mangaPopa : 1.3;
  const NG = chico ? 1000 : 2600; // gotas
  const NN = chico ? 90 : 200; // neblina
  const N = NG + NN;
  const pos = new Float32Array(N * 3);
  const datos = new Float32Array(N * 4);
  const v = new Float32Array(N * 3);
  const vida = new Float32Array(N), dur = new Float32Array(N);
  for (let i = NG; i < N; i++) datos[i * 4 + 3] = 1;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("datos", new THREE.BufferAttribute(datos, 4).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { escala: { value: 400 }, sol: { value: new THREE.Vector3(0, 1, 0) }, luz: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: VERTICE, fragmentShader: FRAGMENTO,
    transparent: true, depthWrite: false,
  });
  const puntos = new THREE.Points(geo, mat);
  puntos.frustumCulled = false;
  puntos.renderOrder = 2;

  let semilla = 7;
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  let pendG = 0, pendN = 0;
  let libreG = 0, libreN = NG;

  // Gota de la cortina: sale de la ola de proa, hacia afuera y arriba.
  function gota(i, f) {
    const lado = azar() < 0.5 ? -1 : 1;
    const x = -0.4 + 3.0 * Math.sqrt(azar());
    pos[i * 3] = x;
    pos[i * 3 + 1] = 0.02 + azar() * 0.08;
    pos[i * 3 + 2] = lado * (ancho(x) + 0.03);
    v[i * 3] = -(1 + azar() * 2.5) * f;
    v[i * 3 + 1] = (0.8 + azar() * 2.2) * f;
    v[i * 3 + 2] = lado * (1.6 + azar() * 3.2) * f;
    dur[i] = vida[i] = 0.4 + azar() * 0.8;
    // Gotitas de 1 a 5 cm: de cerca se ven sueltas; de lejos, una cortina.
    datos[i * 4 + 1] = 0.01 + azar() * azar() * 0.035;
    datos[i * 4 + 2] = 0.3 + azar() * 0.45;
  }
  // Neblina: junto a la cortina y detrás del espejo de popa.
  function neblina(i, f) {
    if (azar() < 0.3) {
      pos[i * 3] = popa - azar() * 1.5;
      pos[i * 3 + 1] = 0.1 + azar() * 0.3;
      pos[i * 3 + 2] = (azar() - 0.5) * 2 * manga;
      v[i * 3] = -(3 + azar() * 3) * f;
      v[i * 3 + 1] = 0.3 + azar() * 0.6;
      v[i * 3 + 2] = (azar() - 0.5) * 0.8;
    } else {
      const lado = azar() < 0.5 ? -1 : 1;
      const x = -0.5 + azar() * 3;
      pos[i * 3] = x;
      pos[i * 3 + 1] = 0.05 + azar() * 0.25;
      pos[i * 3 + 2] = lado * (ancho(x) + 0.15 + azar() * 0.3);
      v[i * 3] = -(2 + azar() * 2) * f;
      v[i * 3 + 1] = (0.3 + azar() * 0.6) * f;
      v[i * 3 + 2] = lado * (0.8 + azar()) * f;
    }
    dur[i] = vida[i] = 1 + azar() * 1.5;
    datos[i * 4 + 1] = 0.5 + azar() * 0.9;
    datos[i * 4 + 2] = 0.012 + azar() * 0.02;
  }

  // dt: segundos; f: velocidad (0 a 1); luz: color de la luz (como la espuma);
  // sol: dirección del sol; escala: píxeles por unidad a distancia 1.
  function actualizar(dt, f, luz, sol, escala) {
    mat.uniforms.luz.value.copy(luz);
    mat.uniforms.sol.value.copy(sol);
    mat.uniforms.escala.value = escala;
    const viento = -9.5 * f; // el aire, visto desde el barco, corre hacia popa
    // Ritmo para que, a velocidad de crucero, estén casi todas en el aire.
    pendG += f > 0.08 ? NG * 1.2 * f * dt : 0;
    pendN += f > 0.08 ? NN * 0.55 * f * dt : 0;
    // Nacen las que tocan (en ronda: se reusan las más viejas).
    for (let k = 0; pendG >= 1 && k < NG; k++, pendG--) { gota(libreG, f); libreG = (libreG + 1) % NG; }
    for (let k = 0; pendN >= 1 && k < NN; k++, pendN--) { neblina(libreN, f); libreN = libreN + 1 >= N ? NG : libreN + 1; }
    pendG = Math.min(pendG, 1);
    pendN = Math.min(pendN, 1);
    const aireG = 1 - Math.exp(-dt / 0.6), aireN = 1 - Math.exp(-dt / 0.35);
    let vivas = 0;
    for (let i = 0; i < N; i++) {
      if (vida[i] <= 0) { datos[i * 4] = 1; continue; }
      vivas++;
      vida[i] -= dt;
      const neb = i >= NG;
      v[i * 3] += (viento - v[i * 3]) * (neb ? aireN : aireG);
      v[i * 3 + 1] -= G * (neb ? 0.06 : 1) * dt;
      v[i * 3 + 2] *= Math.exp(-dt / (neb ? 0.8 : 1.2));
      pos[i * 3] += v[i * 3] * dt;
      pos[i * 3 + 1] += v[i * 3 + 1] * dt;
      pos[i * 3 + 2] += v[i * 3 + 2] * dt;
      // La gota que vuelve al agua se termina.
      if (!neb && pos[i * 3 + 1] < -0.02) vida[i] = 0;
      datos[i * 4] = vida[i] > 0 ? 1 - vida[i] / dur[i] : 1;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.datos.needsUpdate = true;
    puntos.visible = vivas > 0;
  }
  return { puntos, geo, mat, actualizar };
}
