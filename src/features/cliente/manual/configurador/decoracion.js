/* ═══════════════════════════════════════════════════════════════
   Configurador · decoración del interior
   El modelo trae los muebles, pero no lo que tiene un barco equipado y
   habitado. Esto lo completa con código, siguiendo cómo son y cómo se
   ambientan los interiores reales (Klase A 42 HT y 43 Fly, Sessa C42,
   Azimut Atlantis 45):
   · Cocina: anafe de inducción de dos zonas, bacha de acero con grifería
     alta, cafetera y pava; una orquídea.
   · Comedor: la mesa puesta para dos (individual, plato, servilleta,
     cubiertos y copa), la botella y una frutera con manzanas verdes.
   · Camarote: camas tendidas con cubrecama acolchado ajustado, almohada con
     funda a rayas, y almohadón y pie de cama en el color de los almohadones
     elegidos; en los nichos de las cabeceras, libros, un difusor y un florero.
   · Baño: toallas de mano dobladas, jabonera y una planta. El botiquín es un
     espejo de verdad (Reflector).
   · La mesada de la cocina, de cuarzo pulido, refleja lo que tiene encima.
   · Tiras LED bajo las alacenas y el botiquín, con la luz que dejan en la
     pared y la mesada.
   · La pantalla del televisor, prendida.
   Cada objeto se arma en metros, apoyado en y = 0, y va a su lugar
   (unidad.js); al final se juntan en una malla por material (pocos dibujos
   por cuadro). Todo va en la capa 1 (fuera del reflejo del agua) y sólo se
   ve adentro.
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

// Metros → unidades de la escena (1 = 1,36 m).
const U = 1 / 1.36;

function generador(semilla) {
  let s = Math.max(1, Math.round(semilla));
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

const C = hex => new THREE.Color(hex);
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ─────────────── Geometría ─────────────── */

// Color por vértice (lineal, como lo usa el material): fijo o según la posición.
function pintar(geo, c) {
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  if (typeof c === "function") {
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i); c(p, col); col.toArray(arr, i * 3); }
  } else {
    col.set(c);
    for (let i = 0; i < pos.count; i++) col.toArray(arr, i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Coordenadas de textura en metros, proyectadas sobre el plano de cada cara
// (las texturas traen su escala: así la trama tiene el tamaño real).
function uvCaja(geo) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(a.sub(b));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k), y = pos.getY(i + k), z = pos.getZ(i + k), j = (i + k) * 2;
      if (ay >= ax && ay >= az) { uv[j] = x; uv[j + 1] = z; } else if (ax >= az) { uv[j] = z; uv[j + 1] = y; } else { uv[j] = x; uv[j + 1] = y; }
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Todas con los mismos atributos y sin índice, para poder juntarlas. Las que
// traen sus propias coordenadas de textura (uv) las conservan.
function preparar(geo, conservarUv = false) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) pintar(g, "#ffffff");
  if (!conservarUv || !g.attributes.uv) uvCaja(g);
  Object.keys(g.attributes).forEach(k => { if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k); });
  g.morphAttributes = {};
  return g;
}

// Pieza torneada: perfil [radio, altura] de abajo hacia arriba, por fuera y
// de vuelta por dentro (las normales quedan hacia afuera del sólido).
function torno(perfil, seg = 32) {
  return new THREE.LatheGeometry(perfil.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg);
}

// Superficie de una función (u, v) ∈ [0, 1]² → [x, y, z]. La cara de adelante
// es la de ∂v × ∂u; invertir la da vuelta. conUv: (u, v) como coordenadas.
function superficie(ni, nj, punto, { invertir = false, color = null, conUv = false } = {}) {
  const pos = [], cols = [], uvs = [];
  const c = new THREE.Color();
  for (let i = 0; i <= ni; i++) for (let j = 0; j <= nj; j++) {
    pos.push(...punto(i / ni, j / nj));
    if (color) { color(i / ni, j / nj, c); cols.push(c.r, c.g, c.b); }
    if (conUv) uvs.push(i / ni, j / nj);
  }
  const idx = [];
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
    const a = i * (nj + 1) + j, b = a + nj + 1, cc = a + 1, d = b + 1;
    if (invertir) idx.push(a, b, cc, cc, b, d); else idx.push(a, cc, b, cc, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (color) g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  if (conUv) g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function rectRedondeado(w, d, r) {
  const s = new THREE.Shape();
  const x0 = -w / 2, y0 = -d / 2, x1 = w / 2, y1 = d / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Tubo por una curva suave de puntos.
const tubo = (puntos, radio, seg = 24, lados = 6) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(puntos.map(p => new THREE.Vector3(...p))), seg, radio, lados, false);

// Una pieza: geometría, material y color (fijo o según la posición).
const pieza = (g, m, c, uv = false) => ({ g: c === undefined ? g : pintar(g, c), m, uv });
const mover = (piezas, matriz) => { piezas.forEach(p => p.g.applyMatrix4(matriz)); return piezas; };

/* ─────────────── Cocina ─────────────── */

// Anafe de inducción de dos zonas (52 × 29 cm): vidrio negro con la
// serigrafía de las zonas y los comandos táctiles al frente; sobresale
// apenas de la mesada.
function anafe() {
  const W = 0.52, D = 0.29, E = 0.006;
  const vidrio = new THREE.PlaneGeometry(W - 0.004, D - 0.004).rotateX(-Math.PI / 2).translate(0, E + 0.0002, 0);
  return [
    pieza(new RoundedBoxGeometry(W, E, D, 2, 0.0022).translate(0, E / 2, 0), "brillante", "#060708"),
    pieza(vidrio, "vitro", undefined, true),
  ];
}

// Bacha de acero de 34 × 28 cm y 17 de hondo, con su reborde y la grifería
// alta detrás. La cubeta se ve a través de la mesada por una plantilla: la
// boca marca la mesada (donde se ve) y la cubeta sólo se dibuja ahí.
function bacha() {
  const W = 0.34, D = 0.28, H = 0.17, R = 0.03;
  const boca = rectRedondeado(W, D, R);
  const out = [];
  out.push(pieza(new THREE.ShapeGeometry(boca, 8).rotateX(-Math.PI / 2).translate(0, 0.0006, 0), "mascara"));
  // La cubeta, vista por dentro: más oscura hacia el fondo.
  const cubeta = new THREE.ExtrudeGeometry(boca, { depth: H, bevelEnabled: false, curveSegments: 8 }).rotateX(Math.PI / 2);
  out.push(pieza(cubeta, "bacha", (p, c) => c.set("#e2e5e7").lerp(C("#7d8184"), suave(0, H, -p.y) * 0.75)));
  // Desagüe en el fondo, hacia atrás.
  out.push(pieza(new THREE.CircleGeometry(0.013, 20).rotateX(-Math.PI / 2).translate(0, -H + 0.0012, -0.05), "fondo", "#26282a"));
  out.push(pieza(new THREE.RingGeometry(0.013, 0.025, 24).rotateX(-Math.PI / 2).translate(0, -H + 0.001, -0.05), "fondo", "#d7dadc"));
  // Reborde de acero sobre la mesada (tapa la unión con la boca).
  const borde = rectRedondeado(W + 0.03, D + 0.03, R + 0.012);
  borde.holes.push(rectRedondeado(W - 0.004, D - 0.004, R - 0.002));
  const aro = new THREE.ExtrudeGeometry(borde, { depth: 0.0022, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1, curveSegments: 8 });
  out.push(pieza(aro.rotateX(-Math.PI / 2).translate(0, 0.0008, 0), "metal", "#c9ccce"));
  // Grifería monocomando de caño alto (cuello de cisne) con la palanca al costado.
  const zG = -(D / 2 + 0.04);
  const cromo = "#e9e9e9";
  out.push(pieza(new THREE.CylinderGeometry(0.023, 0.026, 0.05, 24).translate(0, 0.025, zG), "metal", cromo));
  out.push(pieza(tubo([[0, 0.04, zG], [0, 0.2, zG], [0, 0.275, zG + 0.012], [0, 0.302, zG + 0.06], [0, 0.288, zG + 0.11], [0, 0.258, zG + 0.124]], 0.0112, 40, 12), "metal", cromo));
  out.push(pieza(new THREE.CylinderGeometry(0.0128, 0.0122, 0.02, 16).translate(0, 0.249, zG + 0.124), "metal", "#cfcfcf"));
  out.push(pieza(new RoundedBoxGeometry(0.058, 0.011, 0.013, 2, 0.005).translate(0.038, 0.118, zG), "metal", cromo));
  return out;
}

// Cafetera de cápsulas negra con detalles cromados, y un pocillo en la
// bandeja (el frente mira a +z).
const PERFIL_POCILLO = [[0, 0], [0.021, 0], [0.023, 0.003], [0.029, 0.048], [0.0285, 0.05], [0.0265, 0.049], [0.0205, 0.006], [0, 0.006]];
function cafetera() {
  return [
    pieza(new RoundedBoxGeometry(0.15, 0.27, 0.3, 4, 0.024).translate(0, 0.135, 0), "brillante", "#141517"),
    pieza(new RoundedBoxGeometry(0.11, 0.012, 0.13, 2, 0.005).translate(0, 0.271, 0.06), "metal", "#d9d9d9"),
    pieza(new RoundedBoxGeometry(0.06, 0.03, 0.06, 2, 0.008).translate(0, 0.205, 0.165), "metal", "#cdcdcd"),
    pieza(new RoundedBoxGeometry(0.13, 0.014, 0.1, 2, 0.005).translate(0, 0.007, 0.185), "metal", "#bdbfc1"),
    pieza(torno(PERFIL_POCILLO, 28).translate(0, 0.014, 0.185), "brillante", "#f4f2ee"),
  ];
}

// Pava eléctrica de línea retro, crema, sobre su base (el pico mira a +x).
const PERFIL_PAVA = [[0, 0.018], [0.074, 0.018], [0.082, 0.028], [0.088, 0.07], [0.085, 0.13], [0.073, 0.18], [0.06, 0.202], [0.052, 0.21], [0.03, 0.214], [0, 0.215]];
function pava() {
  const crema = "#ece5d6";
  return [
    pieza(new THREE.CylinderGeometry(0.088, 0.09, 0.018, 36).translate(0, 0.009, 0), "brillante", "#26272a"),
    pieza(torno(PERFIL_PAVA, 40), "brillante", crema),
    pieza(new THREE.SphereGeometry(0.013, 16, 10).scale(1, 0.8, 1).translate(0, 0.222, 0), "metal", "#e3e3e3"),
    pieza(tubo([[0.066, 0.12, 0], [0.1, 0.15, 0], [0.122, 0.185, 0], [0.132, 0.2, 0]], 0.011, 16, 10), "brillante", crema),
    pieza(tubo([[-0.064, 0.19, 0], [-0.118, 0.182, 0], [-0.13, 0.14, 0], [-0.118, 0.085, 0], [-0.08, 0.06, 0]], 0.011, 24, 10), "brillante", crema),
  ];
}

/* ─────────────── Mesa ─────────────── */

// Copa de vino: el cristal (por fuera y por dentro) y el vino.
const PERFIL_COPA = [[0, 0], [0.034, 0], [0.0362, 0.0015], [0.0345, 0.003], [0.014, 0.0048], [0.0055, 0.008], [0.0032, 0.016], [0.003, 0.062], [0.0036, 0.082], [0.009, 0.0905], [0.021, 0.0975], [0.0325, 0.1075], [0.0405, 0.122], [0.0432, 0.14], [0.0418, 0.16], [0.0378, 0.18], [0.0338, 0.196],
  [0.0328, 0.1962], [0.0368, 0.18], [0.0408, 0.16], [0.0422, 0.14], [0.0395, 0.1225], [0.0315, 0.1085], [0.0198, 0.0988], [0.0075, 0.0925], [0, 0.0915]];
const PERFIL_VINO = [[0, 0.0925], [0.0072, 0.0935], [0.019, 0.0995], [0.0302, 0.109], [0.0378, 0.12], [0.039, 0.124], [0, 0.124]];
function copa({ vino = 1 } = {}) {
  const out = [pieza(torno(PERFIL_COPA, 36), "vidrio")];
  if (vino) {
    const g = torno(PERFIL_VINO, 36);
    if (vino !== 1) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, 0.0925 + (p.getY(i) - 0.0925) * vino); }
    out.push(pieza(g, "brillante", "#36040e"));
  }
  return out;
}

const PERFIL_BOTELLA = [[0, 0.004], [0.026, 0], [0.034, 0.001], [0.0372, 0.005], [0.0375, 0.012], [0.0375, 0.2], [0.0362, 0.212], [0.031, 0.226], [0.0225, 0.24], [0.0162, 0.253], [0.0148, 0.268], [0.0146, 0.292], [0.0158, 0.2935], [0.0158, 0.3015], [0.0148, 0.303], [0, 0.303]];
function botella() {
  // Etiqueta crema con una franja bordó y el bloque del texto.
  const etiqueta = new THREE.CylinderGeometry(0.0379, 0.0379, 0.085, 40, 17, true).translate(0, 0.115, 0);
  pintar(etiqueta, (p, c) => {
    if (p.y > 0.143 && p.y < 0.151) c.set("#6b1820");
    else if (p.y > 0.098 && p.y < 0.112 && Math.abs(p.x) < 0.03 && p.z > 0) c.set("#3a3330");
    else c.set("#ebe4d4");
  });
  return [
    pieza(torno(PERFIL_BOTELLA, 36), "brillante", "#0d1a12"),
    pieza(etiqueta, "mate"),
    pieza(new THREE.CylinderGeometry(0.0162, 0.0162, 0.043, 28).translate(0, 0.2835, 0), "metal", "#55161c"),
  ];
}

// Cubiertos de acero: el contorno (vista de arriba, largo en y desde la punta
// del mango) apenas extruido, acostado con la punta hacia -z.
function cubierto(forma) {
  const g = new THREE.ExtrudeGeometry(forma, { depth: 0.0018, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0003, bevelSegments: 1, curveSegments: 6 });
  return g.rotateX(-Math.PI / 2).translate(0, 0.0004, 0);
}
function tenedor() {
  const s = new THREE.Shape();
  const xs = [-0.0115, -0.0074, -0.0052, -0.0011, 0.0011, 0.0052, 0.0074, 0.0115];
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.0064, 0, 0.0058, 0.012);
  s.lineTo(0.0034, 0.098);
  s.quadraticCurveTo(0.0115, 0.11, 0.0115, 0.135);
  s.lineTo(xs[7], 0.19);
  // Los cuatro dientes: se baja y sube por cada ranura.
  for (let k = 6; k >= 1; k -= 2) { s.lineTo(xs[k], 0.19); s.lineTo(xs[k], 0.15); s.lineTo(xs[k - 1], 0.15); s.lineTo(xs[k - 1], 0.19); }
  s.lineTo(xs[0], 0.19);
  s.lineTo(-0.0115, 0.135);
  s.quadraticCurveTo(-0.0115, 0.11, -0.0034, 0.098);
  s.lineTo(-0.0058, 0.012);
  s.quadraticCurveTo(-0.0064, 0, 0, 0);
  return cubierto(s).translate(0, 0, 0.095);
}
function cuchillo() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.0068, 0, 0.0065, 0.012);
  s.lineTo(0.006, 0.098);
  s.lineTo(0.0075, 0.104);
  s.lineTo(0.0075, 0.2);
  s.quadraticCurveTo(0.0072, 0.215, 0, 0.215);
  s.quadraticCurveTo(-0.0085, 0.19, -0.0095, 0.13);
  s.lineTo(-0.0085, 0.104);
  s.lineTo(-0.006, 0.098);
  s.lineTo(-0.0065, 0.012);
  s.quadraticCurveTo(-0.0068, 0, 0, 0);
  return cubierto(s).translate(0, 0, 0.1075);
}

// Puesto en la mesa para el comensal del lado +z: individual de trama, plato
// playo, la servilleta de lino doblada a la izquierda con el tenedor encima,
// el cuchillo a la derecha y la copa servida arriba a la derecha, ya sobre la
// mesa.
const PERFIL_PLATO = [[0, 0], [0.085, 0], [0.09, 0.004], [0.1, 0.0065], [0.124, 0.0145], [0.134, 0.0175], [0.1335, 0.019], [0.123, 0.0165], [0.1, 0.0085], [0.09, 0.0075], [0, 0.0075]];
function puesto(d) {
  const out = [];
  out.push(pieza(new RoundedBoxGeometry(0.38, 0.003, 0.28, 2, 0.0012).translate(0, 0.0015, 0), "tela", d.individual || "#38393c"));
  out.push(pieza(torno(PERFIL_PLATO, 48).translate(0.01, 0.003, 0.01), "brillante", "#f6f5f1"));
  const lino = d.servilleta || "#e6e1d7";
  out.push(pieza(new RoundedBoxGeometry(0.075, 0.0045, 0.2, 3, 0.002).translate(-0.152, 0.00525, 0.012), "tela", lino));
  out.push(pieza(new RoundedBoxGeometry(0.069, 0.0045, 0.194, 3, 0.002).rotateY(0.015).translate(-0.151, 0.00975, 0.011), "tela", lino));
  const acero = "#d6d8da";
  out.push(pieza(tenedor().translate(-0.15, 0.012, 0.012), "metal", acero));
  out.push(pieza(cuchillo().translate(0.163, 0.003, 0.012), "metal", acero));
  out.push(...mover(copa({ vino: 0.55 }), new THREE.Matrix4().makeTranslation(0.13, 0, -0.185)));
  return out;
}

// Manzana verde: más ancha arriba, con el hoyuelo del cabo, algo de sol en un
// costado y el cabito.
function manzana(az) {
  const r = 0.036;
  const g = new THREE.SphereGeometry(r, 20, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = y / r;
    const ancho = 1 + 0.06 * t;
    const hoyo = t > 0 ? 0.3 * Math.pow(t, 9) : 0.16 * Math.pow(-t, 9);
    p.setXYZ(i, x * ancho, y * 0.9 - Math.sign(t) * hoyo * r, z * ancho);
  }
  g.computeVertexNormals();
  const verde = C("#93b53c"), sol = C("#c6b84a");
  const f = az() * 6;
  pintar(g, (q, c) => c.copy(verde).lerp(sol, 0.4 * suave(-0.2, 0.9, Math.sin(Math.atan2(q.z, q.x) + f))));
  const cabo = tubo([[0, r * 0.6, 0], [0.002, r * 0.95, 0.001], [0.005, r * 1.15, 0.002]], 0.0016, 6, 5);
  return [pieza(g, "satinado"), pieza(cabo, "mate", "#5a4630")];
}

// Frutera de loza con manzanas verdes.
const PERFIL_FRUTERA = [[0, 0], [0.05, 0], [0.0525, 0.003], [0.075, 0.012], [0.098, 0.027], [0.114, 0.045], [0.121, 0.06], [0.1205, 0.0645], [0.1175, 0.065], [0.1135, 0.0615], [0.1075, 0.048], [0.092, 0.031], [0.07, 0.0175], [0.045, 0.0105], [0, 0.009]];
function frutera(d, az) {
  const out = [pieza(torno(PERFIL_FRUTERA, 48), "brillante", "#f2efe9")];
  const lugares = [[0.046, 0.044, 0.004], [-0.03, 0.046, 0.043], [-0.035, 0.047, -0.041], [0.018, 0.048, -0.06], [0.052, 0.051, 0.054], [0.003, 0.094, 0.004]];
  for (const [x, y, z] of lugares) {
    const m = new THREE.Matrix4().makeRotationY(az() * Math.PI * 2)
      .premultiply(new THREE.Matrix4().makeRotationZ((az() - 0.5) * 0.5))
      .premultiply(new THREE.Matrix4().makeTranslation(x, y, z));
    out.push(...mover(manzana(az), m));
  }
  return out;
}

/* ─────────────── Libros ─────────────── */

const TAPAS = ["#33414a", "#c2b297", "#e1dacb", "#7d8a78", "#8c4a3a", "#23272a", "#b8aa95", "#5d6670"];

// Libro acostado: tapas, lomo (en -x) y el bloque de hojas apenas adentro.
function libro(w, d, h, tapa) {
  const t = 0.0024;
  const caja = (sx, sy, sz, x, y, r) => new RoundedBoxGeometry(sx, sy, sz, 2, r).translate(x, y, 0);
  return [
    pieza(caja(w, t, d, 0, t / 2, 0.0008), "mate", tapa),
    pieza(caja(w, t, d, 0, h - t / 2, 0.0008), "mate", tapa),
    pieza(caja(0.004, h, d, -w / 2 + 0.002, h / 2, 0.0015), "mate", tapa),
    pieza(caja(w - 0.007, h - 2 * t + 0.0004, d - 0.006, 0.0005, h / 2, 0.0005), "mate", "#ece4d3"),
  ];
}

// Dos libros acostados, uno sobre otro.
function libros(d, az) {
  const out = [];
  let y = 0;
  [[0.2, 0.26, 0.026, 0], [0.17, 0.23, 0.022, 3]].forEach(([w, dd, h, k], i) => {
    const giro = (az() - 0.5) * 0.25, dx = (az() - 0.5) * 0.02, dz = (az() - 0.5) * 0.02;
    out.push(...mover(libro(w, dd, h, TAPAS[(k + (d.tapas || 0)) % TAPAS.length]), new THREE.Matrix4().makeRotationY(giro).premultiply(new THREE.Matrix4().makeTranslation(dx, y, dz + i * 0.004))));
    y += h;
  });
  return out;
}

// Libros parados en una repisa: los lomos alineados en z = 0 mirando a +z;
// el último, inclinado sobre los demás.
function estante(d, az) {
  const out = [];
  const parado = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0));
  let x = 0;
  const n = d.n || 6;
  for (let i = 0; i < n; i++) {
    const alto = 0.19 + az() * 0.05, ancho = 0.13 + az() * 0.04, grueso = 0.014 + az() * 0.026;
    // El último se inclina sobre los demás: gira sobre su canto de abajo
    // del lado de los otros, con la punta de arriba tocando al anterior.
    const ang = i === n - 1 ? 0.26 : 0;
    const x0 = x + alto * Math.sin(ang);
    const m = parado.clone().premultiply(new THREE.Matrix4().makeTranslation(x0 + grueso, alto / 2, -ancho / 2));
    if (ang) m.premultiply(new THREE.Matrix4().makeTranslation(-x0, 0, 0)).premultiply(new THREE.Matrix4().makeRotationZ(ang)).premultiply(new THREE.Matrix4().makeTranslation(x0, 0, 0));
    out.push(...mover(libro(ancho, alto, grueso, TAPAS[(i * 3 + (d.tapas || 0)) % TAPAS.length]), m));
    x = x0 + grueso + 0.0015;
  }
  return out;
}

/* ─────────────── Plantas ─────────────── */

const PERFIL_MACETA = [[0, 0.004], [0.044, 0], [0.05, 0.002], [0.056, 0.03], [0.06, 0.1], [0.062, 0.122], [0.0612, 0.1265], [0.0585, 0.127], [0.0565, 0.12], [0.0545, 0.1], [0, 0.1]];

// Hoja de orquídea: ancha, carnosa, plegada en V y arqueada hacia afuera.
function hojaOrquidea(largo, ancho, caida, giro, alto) {
  const oscuro = C("#26431d"), medio = C("#3b6629"), base = C("#7c8a3a");
  const g = superficie(14, 6, (t, s) => {
    const w = ancho * Math.sqrt(Math.max(0, 1 - ((t - 0.42) / 0.58) ** 2)) * (0.6 + 0.4 * Math.min(1, t * 4));
    const lado = (s * 2 - 1) * w / 2;
    const d = largo * t;
    const h = largo * (0.42 * t - caida * t * t) + Math.abs(s * 2 - 1) * w * 0.22 * (1 - 0.5 * t);
    return [d, h, lado];
  }, {
    color: (t, s, c) => {
      const centro = 1 - Math.abs(s * 2 - 1);
      c.copy(oscuro).lerp(medio, 0.25 + 0.5 * centro * centro).lerp(base, suave(0.15, 0, t) * 0.8);
    },
  });
  return g.rotateY(giro).translate(0, alto, 0);
}

// Flor de phalaenopsis mirando a +z: tres sépalos, dos pétalos anchos, el
// labelo fucsia y amarillo y la columna.
function flor(escala) {
  const out = [];
  const blanco = C("#fbfaf6"), rubor = C("#f0d3dc");
  const parte = ({ ang, largo, ancho, copa: cp, labelo = false }) => {
    const g = superficie(6, 5, (l, a) => {
      const s = a * 2 - 1;
      const hw = ancho / 2 * Math.sqrt(Math.max(0, 1 - (2 * l - 1) ** 2 * 0.9)) * (0.35 + 0.65 * suave(0, 0.35, l));
      return [s * hw, l * largo, cp * largo * (l * l * 0.6 + s * s * 0.5)];
    }, {
      color: (l, a, c) => {
        if (labelo) c.set("#b23268").lerp(C("#e7c13e"), suave(0.45, 0.05, l));
        else c.copy(blanco).lerp(rubor, suave(0.3, 0, l) * 0.8);
      },
    });
    return g.rotateZ(THREE.MathUtils.degToRad(ang - 90));
  };
  [
    { ang: 90, largo: 0.034, ancho: 0.017, copa: 0.16 },
    { ang: 218, largo: 0.032, ancho: 0.016, copa: 0.16 },
    { ang: 322, largo: 0.032, ancho: 0.016, copa: 0.16 },
    { ang: 16, largo: 0.036, ancho: 0.038, copa: 0.1 },
    { ang: 164, largo: 0.036, ancho: 0.038, copa: 0.1 },
  ].forEach(p => out.push(pieza(parte(p), "petalo")));
  out.push(pieza(parte({ ang: 270, largo: 0.019, ancho: 0.013, copa: 0.55, labelo: true }).translate(0, 0, 0.004), "petalo"));
  out.push(pieza(new THREE.SphereGeometry(0.0042, 8, 6).scale(1, 1.3, 1).translate(0, 0.003, 0.005), "petalo", "#f4ecd0"));
  return mover(out, new THREE.Matrix4().makeScale(escala, escala, escala));
}

// Orquídea blanca en maceta de loza: hojas, raíces aéreas, dos varas con
// flores y pimpollos, y el tutor de caña.
function orquidea(d, az) {
  const out = [pieza(torno(PERFIL_MACETA, 40), "brillante", "#f3f1ec")];
  // Corteza de pino con algo de musgo.
  const corteza = new THREE.CircleGeometry(0.0555, 28, 0, Math.PI * 2);
  corteza.rotateX(-Math.PI / 2).translate(0, 0.117, 0);
  const pc = corteza.attributes.position;
  for (let i = 1; i < pc.count; i++) pc.setY(i, 0.117 + (az() - 0.4) * 0.006);
  corteza.computeVertexNormals();
  out.push(pieza(corteza, "mate", (p, c) => c.set(az() < 0.2 ? "#5d6335" : az() < 0.5 ? "#4a3322" : "#6b4a30")));
  [[0.2, 0.2, 0.07, 0.62], [3.35, 0.22, 0.072, 0.7], [1.1, 0.17, 0.062, 0.6], [4.3, 0.19, 0.066, 0.66], [5.6, 0.15, 0.058, 0.55]]
    .forEach(([giro, largo, ancho, caida], i) => out.push(pieza(hojaOrquidea(largo, ancho, caida, giro, 0.118 + i * 0.004), "hoja")));
  // Raíces aéreas plateadas que asoman por el borde.
  [[0.9, 1], [4.0, 0.8]].forEach(([a, k]) => {
    const c = Math.cos(a), s = Math.sin(a);
    const g = tubo([[c * 0.02, 0.12, s * 0.02], [c * 0.055, 0.135, s * 0.055], [c * 0.07, 0.115, s * 0.07], [c * 0.075, 0.08 * k, s * 0.078]], 0.0024, 16, 5);
    out.push(pieza(g, "satinado", (p, col) => col.set("#a9ad9f").lerp(C("#6f8f3a"), suave(0.1, 0.075, p.y))));
  });
  // Tutor de caña.
  out.push(pieza(new THREE.CylinderGeometry(0.0017, 0.0017, 0.3, 6).translate(0.006, 0.25, 0.008), "satinado", "#c2ab82"));
  // Varas: una se arquea hacia +x, más alta; la otra hacia -x.
  const varas = [
    { p: [[0.004, 0.11, 0.004], [0.006, 0.2, 0.006], [0.008, 0.3, 0.008], [0.02, 0.385, 0.012], [0.06, 0.44, 0.02], [0.11, 0.458, 0.03], [0.16, 0.448, 0.04], [0.2, 0.42, 0.046]], flores: 6, desde: 0.5 },
    { p: [[0.012, 0.11, -0.008], [0.01, 0.2, -0.01], [0.002, 0.29, -0.006], [-0.03, 0.352, 0.0], [-0.075, 0.377, 0.01], [-0.12, 0.372, 0.02], [-0.155, 0.352, 0.03]], flores: 4, desde: 0.52 },
  ];
  const v = new THREE.Vector3();
  varas.forEach(({ p, flores, desde }) => {
    const curva = new THREE.CatmullRomCurve3(p.map(q => new THREE.Vector3(...q)));
    out.push(pieza(new THREE.TubeGeometry(curva, 48, 0.0021, 6, false), "hoja", "#4e5530"));
    const total = flores + 2;
    for (let k = 0; k < total; k++) {
      const u = desde + (0.985 - desde) * (k / (total - 1));
      curva.getPointAt(u, v);
      if (k >= flores) {
        // Pimpollos en la punta.
        const r = k === flores ? 0.0085 : 0.0065;
        out.push(pieza(new THREE.SphereGeometry(r, 10, 8).scale(1, 1, 1.3).translate(v.x, v.y - 0.006, v.z + 0.004), "petalo", "#e3e9c9"));
        continue;
      }
      // Cada flor mira al frente (+z), un poco hacia abajo, alternando lados.
      const lado = k % 2 ? 1 : -1;
      const frente = new THREE.Vector3(lado * 0.3 + (az() - 0.5) * 0.2, -0.25 - az() * 0.1, 1).normalize();
      const arriba = new THREE.Vector3(0, 1, 0).sub(frente.clone().multiplyScalar(frente.y)).normalize();
      const derecha = new THREE.Vector3().crossVectors(arriba, frente);
      const base = new THREE.Matrix4().makeBasis(derecha, arriba, frente);
      base.premultiply(new THREE.Matrix4().makeRotationAxis(frente, (az() - 0.5) * 0.4));
      const pos = v.clone().add(frente.clone().multiplyScalar(0.012)).add(new THREE.Vector3(0, -0.014, 0));
      const escala = 1 - 0.28 * (k / Math.max(1, flores - 1));
      out.push(...mover(flor(escala), base.premultiply(new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z))));
      // El cabito que la une a la vara.
      out.push(pieza(tubo([[v.x, v.y, v.z], [pos.x, pos.y + 0.004, pos.z - 0.004]], 0.0012, 4, 5), "hoja", "#5d6436"));
    }
  });
  return out;
}

// Pilea en una maceta chica: hojas redondas sobre tallos finos.
const PERFIL_MACETITA = [[0, 0.003], [0.036, 0], [0.04, 0.003], [0.042, 0.06], [0.0412, 0.066], [0.039, 0.066], [0.038, 0.058], [0, 0.058]];
function planta(d, az) {
  const out = [pieza(torno(PERFIL_MACETITA, 36), "satinado", "#ebe7df")];
  out.push(pieza(new THREE.CircleGeometry(0.037, 20).rotateX(-Math.PI / 2).translate(0, 0.06, 0), "mate", "#3b2c22"));
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + az() * 0.5;
    const dist = 0.03 + az() * 0.04, alto = 0.035 + az() * 0.05;
    const c = Math.cos(a), s = Math.sin(a);
    const fin = [c * dist, 0.06 + alto, s * dist];
    out.push(pieza(tubo([[c * 0.005, 0.06, s * 0.005], [c * dist * 0.4, 0.06 + alto * 0.75, s * dist * 0.4], fin], 0.0012, 8, 4), "hoja", "#6e8a45"));
    const r = 0.018 + az() * 0.009;
    const normal = new THREE.Vector3(c * 0.55, 1, s * 0.55).normalize();
    const g = new THREE.CircleGeometry(r, 14);
    g.applyMatrix4(new THREE.Matrix4().lookAt(new THREE.Vector3(), normal, new THREE.Vector3(0, 0, 1)));
    // Un poco cóncava, como las hojas de verdad.
    const pg = g.attributes.position;
    for (let i = 0; i < pg.count; i++) {
      const q = new THREE.Vector3().fromBufferAttribute(pg, i);
      q.addScaledVector(normal, (q.lengthSq() / (r * r)) * 0.003);
      pg.setXYZ(i, q.x, q.y, q.z);
    }
    g.computeVertexNormals();
    g.translate(...fin);
    out.push(pieza(g, "hoja", k % 3 ? "#4f7c35" : "#5f8d3e"));
  }
  return out;
}

// Florero rojo con dos ramas de eucalipto.
const PERFIL_FLORERO = [[0, 0.003], [0.035, 0], [0.042, 0.004], [0.058, 0.04], [0.064, 0.08], [0.06, 0.115], [0.044, 0.148], [0.028, 0.17], [0.0225, 0.188], [0.0235, 0.198], [0.026, 0.2], [0.0245, 0.2015], [0.02, 0.198], [0.0185, 0.188], [0, 0.17]];
function florero(d, az) {
  const out = [pieza(torno(PERFIL_FLORERO, 40), "brillante", "#9a2224")];
  const v = new THREE.Vector3();
  [[0.6, 0.06, 0.29], [3.3, 0.07, 0.275]].forEach(([a, abre, alto]) => {
    const c = Math.cos(a), s = Math.sin(a);
    const curva = new THREE.CatmullRomCurve3([[0, 0.17, 0], [c * abre * 0.25, 0.215, s * abre * 0.25], [c * abre * 0.65, 0.255, s * abre * 0.65], [c * abre, alto, s * abre]].map(p => new THREE.Vector3(...p)));
    out.push(pieza(new THREE.TubeGeometry(curva, 20, 0.0014, 5, false), "hoja", "#6a6650"));
    for (let k = 0; k < 6; k++) {
      curva.getPointAt(Math.min(0.36 + k * 0.12, 1), v);
      const r = 0.0125 - k * 0.0011;
      for (const lado of [-1, 1]) {
        const giro = a + lado * (Math.PI / 2) + k * 0.7;
        const normal = new THREE.Vector3(Math.cos(giro) * 0.4, 0.5 + az() * 0.4, Math.sin(giro) * 0.4).normalize();
        const g = new THREE.CircleGeometry(r, 12);
        g.applyMatrix4(new THREE.Matrix4().lookAt(new THREE.Vector3(), normal, new THREE.Vector3(0, 0, 1)));
        g.translate(v.x + Math.cos(giro) * r * 0.85, v.y + 0.002, v.z + Math.sin(giro) * r * 0.85);
        out.push(pieza(g, "hoja", k % 2 ? "#8fa392" : "#9aac9b"));
      }
    }
  });
  return out;
}

/* ─────────────── Baño y aromas ─────────────── */

const PERFIL_JABONERA = [[0, 0.002], [0.03, 0], [0.034, 0.003], [0.0355, 0.012], [0.0355, 0.12], [0.033, 0.134], [0.026, 0.142], [0.0145, 0.146], [0.0135, 0.152], [0, 0.152]];
// Dosificador de loza mate con bomba cromada (el pico mira a +z).
function jabonera() {
  return [
    pieza(torno(PERFIL_JABONERA, 36), "satinado", "#d9d3c7"),
    pieza(new THREE.CylinderGeometry(0.0148, 0.0148, 0.012, 24).translate(0, 0.158, 0), "metal", "#e3e3e3"),
    pieza(new THREE.CylinderGeometry(0.0045, 0.0045, 0.024, 12).translate(0, 0.175, 0), "metal", "#e3e3e3"),
    pieza(new RoundedBoxGeometry(0.016, 0.013, 0.05, 2, 0.004).translate(0, 0.192, 0.012), "metal", "#e3e3e3"),
  ];
}

const PERFIL_FRASCO = [[0, 0.004], [0.034, 0], [0.038, 0.004], [0.039, 0.07], [0.034, 0.085], [0.016, 0.094], [0.0105, 0.1], [0.0105, 0.108], [0.0095, 0.108], [0.0095, 0.1], [0.0145, 0.093], [0.0325, 0.084], [0.0375, 0.07], [0.0365, 0.006], [0, 0.006]];
const PERFIL_ESENCIA = [[0, 0.0065], [0.0362, 0.0065], [0.0367, 0.045], [0, 0.045]];
// Difusor de varillas: frasco de vidrio, la esencia ámbar y las varillas.
function difusor(d, az) {
  const out = [
    pieza(torno(PERFIL_FRASCO, 36), "vidrio"),
    pieza(torno(PERFIL_ESENCIA, 36), "brillante", "#6b3d12"),
    pieza(new THREE.CylinderGeometry(0.0118, 0.0118, 0.014, 20).translate(0, 0.101, 0), "metal", "#2b2623"),
  ];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + az() * 0.4, abre = 0.1 + az() * 0.18;
    const largo = 0.19 + az() * 0.02;
    const g = new THREE.CylinderGeometry(0.0016, 0.0016, largo, 5).translate(0, largo / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)), abre));
    g.translate(Math.cos(a) * 0.004, 0.06, Math.sin(a) * 0.004);
    out.push(pieza(g, "mate", (p, c) => c.set("#3a2a1e").lerp(C("#7a6048"), suave(0.12, 0.16, p.y))));
  }
  return out;
}

/* ─────────────── Textiles ─────────────── */

// Toalla doblada (largo en x): caja de cantos redondeados por los dobleces,
// con la guarda tejida cerca de una punta, apenas más oscura.
function toalla(largo, ancho, alto, color) {
  const r = Math.min(alto * 0.45, 0.016);
  const out = [pieza(new RoundedBoxGeometry(largo, alto, ancho, 4, r).translate(0, alto / 2, 0), "tela", color)];
  const guarda = new RoundedBoxGeometry(0.022, alto + 0.0016, ancho + 0.0016, 3, r).translate(largo / 2 - 0.05, alto / 2, 0);
  out.push(pieza(guarda, "tela", new THREE.Color(color).multiplyScalar(0.88)));
  return out;
}

// Dos toallas de mano dobladas, una sobre otra (a lo largo de x).
function toallas() {
  return [
    ...toalla(0.3, 0.15, 0.034, "#f3f1ec"),
    ...mover(toalla(0.26, 0.13, 0.028, "#f3f1ec"), new THREE.Matrix4().makeRotationY(0.05).premultiply(new THREE.Matrix4().makeTranslation(-0.012, 0.034, 0.004))),
  ];
}

// Almohada o almohadón: dos caras infladas unidas por la costura, con las
// "orejas" de las puntas y algún bulto. Acostada: ancho en x, fondo en z; las
// coordenadas de textura (u a lo ancho) sirven para la funda a rayas.
function almohada(W, D, H, az) {
  const f1 = az() * 6, f2 = az() * 6;
  const forma = (u, w, lado) => {
    // Más puntos cerca de la costura (ahí cambia rápido la forma).
    const su = Math.sin((u - 0.5) * Math.PI), sw = Math.sin((w - 0.5) * Math.PI);
    const env = Math.pow(Math.max(0, (1 - su ** 4) * (1 - sw ** 4)), 0.55);
    const bulto = 1 + 0.06 * Math.sin(3.1 * su + f1) * Math.sin(2.3 * sw + f2);
    return [su * W / 2 * (1 - 0.07 * (1 - sw * sw)), lado * H / 2 * env * bulto, sw * D / 2 * (1 - 0.1 * (1 - su * su))];
  };
  const arriba = superficie(22, 15, (u, w) => forma(u, w, 1), { conUv: true });
  const abajo = superficie(22, 15, (u, w) => forma(u, w, -1), { invertir: true, conUv: true });
  return [arriba, abajo];
}

/* Un manto sobre el colchón (cubrecama o pie de cama), armado por su corte:
   baja por el lado del pasillo, envuelve el canto, cruza la cama y remata
   contra la pared. Marco de la cama: x desde la cabecera, el canto del
   pasillo en z = 0 y la cama hacia z = lado·A; y = 0 arriba del colchón.
   bajo: el manto que queda debajo (su espesor e inflado). pliegue: cuánto se
   ondula la caída; arrugas: cuánto la cara de arriba. */
function manto({ A, lado, x0, x1, T, D, bajo = null, inflado = 0, pliegue = 0, arrugas = 0.001, semilla = 3 }) {
  const az = generador(semilla);
  const f1 = az() * 6, f2 = az() * 6, f3 = az() * 6;
  const e = bajo ? bajo.T : 0;
  // Inflado: máximo en el medio, nada en los cantos (hasta donde empieza el remate).
  const hinch = (a, inf, hasta) => inf * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, a / hasta)))), 0.6);
  const fin = A - T;
  const hb = a => (bajo ? hinch(a, bajo.inflado || 0, A - bajo.T) : 0);
  // Las puntas (a lo largo de la cama) se redondean hasta el espesor cero.
  const d0 = Math.max(T, 0.012);
  const kFin = dist => (dist >= d0 ? 1 : Math.sqrt(Math.max(0, 1 - (1 - dist / d0) ** 2)));
  // Tramos del corte: caída, canto, arriba, remate y bajada a la pared.
  const N = { caida: 8, canto: 7, arriba: 18, remate: 4, pared: 2 };
  const n = N.caida + N.canto + N.arriba + N.remate + N.pared;
  const corte = (j, x, k) => {
    const grueso = T * k;
    if (j <= N.caida) {
      const b = -D * (1 - j / N.caida);
      const prof = (-b / D) ** 1.3;
      const onda = pliegue * k * prof * (Math.sin(2 * Math.PI * x / 0.16 + f2 + 0.6 * Math.sin(3 * x)) * 0.7 + 0.3 * Math.sin(2 * Math.PI * x / 0.07 + f3));
      return [-e - grueso - onda, b];
    }
    j -= N.caida;
    if (j <= N.canto) {
      const fi = Math.PI - (j / N.canto) * (Math.PI / 2);
      const r = e + grueso;
      return [r * Math.cos(fi), r * Math.sin(fi)];
    }
    j -= N.canto;
    if (j <= N.arriba) {
      const a = (j / N.arriba) * fin;
      const arruga = arrugas * k * Math.sin(9 * x + 4 * a + f1) * Math.sin(11 * a - 3 * x + f3) * suave(0, 0.05, a) * suave(fin, fin - 0.05, a);
      return [a, e + hb(a) + grueso + hinch(a, inflado, fin) * k + arruga];
    }
    j -= N.arriba;
    const y0 = e + hb(fin);
    if (j <= N.remate) {
      const fi = Math.PI / 2 - (j / N.remate) * (Math.PI / 2);
      return [fin + grueso * Math.cos(fi), y0 + grueso * Math.sin(fi)];
    }
    j -= N.remate;
    return [fin + grueso, y0 * (1 - j / N.pared)];
  };
  const nx = Math.max(8, Math.ceil((x1 - x0) / 0.028));
  return superficie(nx, n, (u, v) => {
    const x = x0 + (x1 - x0) * (1 - Math.cos(Math.PI * u)) / 2;
    const k = Math.min(kFin(x - x0), kFin(x1 - x));
    const [a, b] = corte(Math.round(v * n), x, k);
    return [x, b, lado * a];
  }, { invertir: lado < 0 });
}

// Cama tendida como en los camarotes de los astilleros: cubrecama acolchado
// ajustado, que baja derecho por el lado del pasillo; almohada con funda a
// rayas contra la cabecera, almohadón delante y un pie de cama, los dos en el
// color de los almohadones elegidos.
function cama(d) {
  const L = d.largo / U, A = d.ancho / U, lado = d.lado || 1;
  const sem = d.semilla || 5;
  const az = generador(sem);
  const out = [];
  const colcha = { T: 0.02, inflado: 0.005 };
  out.push(pieza(manto({ A, lado, x0: 0, x1: L, T: colcha.T, D: 0.082, inflado: colcha.inflado, semilla: sem + 1 }), "colcha", "#f6f4f0"));
  // El pie de cama queda en la parte de la cama que se ve desde la puerta.
  out.push(pieza(manto({ A, lado, x0: L - 1.18, x1: L - 0.8, T: 0.011, D: 0.095, bajo: colcha, pliegue: 0.003, arrugas: 0.0015, semilla: sem + 2 }), "acento"));
  // Almohada apoyada contra la cabecera y el almohadón delante, un poco girado.
  const base = colcha.T + colcha.inflado;
  const apoyar = (W, Dp, H, inclina, x, y, z, giro) => {
    const [g1, g2] = almohada(W, Dp, H, az);
    const m = new THREE.Matrix4().makeRotationY(Math.PI / 2)
      .premultiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 + inclina))
      .premultiply(new THREE.Matrix4().makeRotationY(giro))
      .premultiply(new THREE.Matrix4().makeTranslation(x, y + base, z));
    return [g1.applyMatrix4(m), g2.applyMatrix4(m)];
  };
  const centro = lado * A / 2;
  apoyar(0.62, 0.42, 0.15, 0.36, 0.1, 0.228, centro, 0).forEach(g => out.push(pieza(g, "funda", undefined, true)));
  apoyar(0.42, 0.42, 0.13, 0.56, 0.235, 0.182, centro - lado * 0.035, lado * 0.16).forEach(g => out.push(pieza(g, "acento")));
  return out;
}

const KIT = { anafe, bacha, cafetera, pava, puesto, botella, frutera, libros, estante, orquidea, planta, florero, jabonera, difusor, toallas, cama };

/* ─────────────── Materiales ─────────────── */

// Relieve a partir de un mapa de alturas que se repite (para las telas).
function relieve(N, altura, fuerza, metros) {
  const alto = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) alto[y * N + x] = altura(x / N, y / N);
  const datos = new Uint8Array(N * N * 4);
  const h = (x, y) => alto[((y + N) % N) * N + ((x + N) % N)];
  const n = new THREE.Vector3();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    n.set(-(h(x + 1, y) - h(x - 1, y)) * fuerza, -(h(x, y + 1) - h(x, y - 1)) * fuerza, 1).normalize();
    const o = (y * N + x) * 4;
    datos[o] = (n.x * 0.5 + 0.5) * 255; datos[o + 1] = (n.y * 0.5 + 0.5) * 255; datos[o + 2] = (n.z * 0.5 + 0.5) * 255; datos[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(datos, N, N);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / metros, 1 / metros);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// Trama de tela: hilos cruzados y fibra fina, en mosaico de 5 cm.
function texturaTejido() {
  const az = generador(17);
  return relieve(128, (u, v) => 0.5 + 0.28 * Math.sin(2 * Math.PI * 16 * u) * Math.sin(2 * Math.PI * 16 * v) + 0.3 * (az() - 0.5), 1.5, 0.05);
}

// Cubrecama acolchado: rombos de 10 cm cosidos en las diagonales, inflados
// entre las costuras, con la trama fina encima (mosaico de 20 cm).
function texturaAcolchado() {
  const az = generador(23);
  return relieve(256, (u, v) => {
    const a = (u + v) * 2, b = (u - v) * 2 + 8;
    const fa = a - Math.floor(a), fb = b - Math.floor(b);
    const inflado = Math.pow(Math.sin(Math.PI * fa) * Math.sin(Math.PI * fb), 0.45);
    return inflado * 0.9 + 0.07 * Math.sin(2 * Math.PI * 64 * u) * Math.sin(2 * Math.PI * 64 * v) + 0.05 * (az() - 0.5);
  }, 2.6, 0.2);
}

// Funda de almohada blanca con tres rayas finas gris azulado en el medio.
function texturaFunda() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 8;
  const x = c.getContext("2d");
  x.fillStyle = "#f7f6f2";
  x.fillRect(0, 0, 512, 8);
  x.fillStyle = "#8d9aa6";
  [0.43, 0.5, 0.57].forEach(u => x.fillRect(u * 512 - 3, 0, 6, 8));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Vidrio del anafe: negro, con la serigrafía de las dos zonas y los comandos
// táctiles al frente (abajo en la imagen).
function texturaAnafe() {
  const c = document.createElement("canvas");
  c.width = 520; c.height = 290;
  const x = c.getContext("2d");
  x.fillStyle = "#0b0c0d";
  x.fillRect(0, 0, c.width, c.height);
  const zona = (cx, cy, r) => {
    x.strokeStyle = "rgba(160,165,170,0.55)";
    x.lineWidth = 2.4;
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 1.2;
    x.beginPath(); x.arc(cx, cy, r * 0.58, 0, Math.PI * 2); x.stroke();
  };
  zona(150, 128, 96);
  zona(378, 128, 78);
  x.fillStyle = "rgba(170,175,180,0.6)";
  for (let i = 0; i < 9; i++) x.fillRect(196 + i * 15, 258, 8, 2.5);
  [150, 378].forEach(cx => { x.beginPath(); x.arc(cx, 259, 5, 0, Math.PI * 2); x.fill(); });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// La pantalla del televisor, prendida: la imagen de la casa (un atardecer en
// el mar con el logo de Klase A) dentro del marco negro fino del monitor, más
// ancho abajo. Mientras baja la imagen, negra.
function texturaPantalla() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 608;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#050607";
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 12, 12, 1000, 563);
    tex.needsUpdate = true;
  };
  img.src = "/textures/interior/tv.jpg";
  return tex;
}

// Orden de dibujo de la bacha: primero la boca (marca la plantilla), después
// la cubeta y el desagüe, sólo donde la boca quedó marcada.
const ORDEN = { mascara: 10, bacha: 11, fondo: 12 };

function crearMateriales() {
  const tejido = texturaTejido(), acolchado = texturaAcolchado();
  const rayas = texturaFunda(), vitro = texturaAnafe(), pantalla = texturaPantalla();
  const tela = {
    vertexColors: true, roughness: 0.92, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color("#ffffff"),
    normalMap: tejido, normalScale: new THREE.Vector2(0.35, 0.35), side: THREE.DoubleSide,
  };
  const plantilla = { stencilWrite: true, stencilRef: 1 };
  const lista = {
    mate: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }),
    satinado: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }),
    brillante: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.2 }),
    tela: new THREE.MeshPhysicalMaterial(tela),
    colcha: new THREE.MeshPhysicalMaterial({ ...tela, normalMap: acolchado, normalScale: new THREE.Vector2(0.9, 0.9) }),
    funda: new THREE.MeshPhysicalMaterial({ ...tela, vertexColors: false, map: rayas }),
    // El pie de cama y el almohadón: el color de los almohadones elegidos.
    acento: new THREE.MeshPhysicalMaterial({ ...tela, color: new THREE.Color("#d3c4ab") }),
    hoja: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3, side: THREE.DoubleSide }),
    petalo: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.6, sheen: 0.8, sheenRoughness: 0.4, sheenColor: new THREE.Color("#ffffff"), side: THREE.DoubleSide }),
    // Vidrio fino sin pasada de transmisión: no tiene color propio, sólo
    // refleja (más en los bordes, por Fresnel) y oscurece apenas lo de atrás.
    vidrio: new THREE.MeshPhysicalMaterial({
      color: "#000000", roughness: 0.03, metalness: 0, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.8,
      transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }),
    vitro: new THREE.MeshPhysicalMaterial({ map: vitro, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03 }),
    // Vidrio negro que refleja; la imagen es luz propia.
    pantalla: new THREE.MeshPhysicalMaterial({ color: "#020304", roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, emissive: "#ffffff", emissiveMap: pantalla, emissiveIntensity: 1 }),
    // La boca de la bacha marca la plantilla donde la mesada se ve (pasa la
    // prueba de profundidad); no pinta nada.
    mascara: new THREE.MeshBasicMaterial({ ...plantilla, colorWrite: false, depthWrite: false, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }),
    // Cubeta y desagüe: sólo donde quedó marcada la boca, por encima de la
    // mesada (sin prueba de profundidad: la cubeta vista por dentro es convexa
    // y no se tapa a sí misma).
    bacha: new THREE.MeshStandardMaterial({ ...plantilla, vertexColors: true, metalness: 0.85, roughness: 0.32, side: THREE.BackSide, depthTest: false, depthWrite: false, stencilFunc: THREE.EqualStencilFunc }),
    fondo: new THREE.MeshStandardMaterial({ ...plantilla, vertexColors: true, metalness: 0.9, roughness: 0.25, depthTest: false, depthWrite: false, stencilFunc: THREE.EqualStencilFunc }),
  };
  return { lista, texturas: [tejido, acolchado, rayas, vitro, pantalla] };
}

/* ─────────────── Tiras LED ─────────────── */

// Luz de la tira (3000 K) en lineal.
const LUZ_LED = new THREE.Color().setRGB(1, 0.71, 0.45);

const LAVADO_VERTICE = /* glsl */`
  attribute float luz;
  attribute float base;
  varying float vLuz;
  varying float vBase;
  void main() {
    vLuz = luz;
    vBase = base;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;
// Factor que multiplica lo que ya está dibujado: la sombra del mueble (base)
// más la luz de la tira.
const LAVADO_FRAGMENTO = /* glsl */`
  uniform vec3 color;
  varying float vLuz;
  varying float vBase;
  void main() { gl_FragColor = vec4( vec3( vBase ) + color * vLuz, 1.0 ); }
`;

/* La luz que deja una tira en una superficie (origen o, lados u y v): en cada
   punto se suma la de toda la tira (ángulo de llegada, apertura del perfil
   hacia abajo, distancia al cuadrado). Además el mueble de arriba hace
   sombra (las luces del techo no llegan debajo): sombra es cuánto oscurece;
   sombraV, en cuánto se va aclarando a lo largo de v (la mesada, hacia el
   frente). Los bordes de la superficie vuelven a no cambiar nada en unos
   centímetros. */
function lavado({ o, u, v, fu = 0.035, fv = [0, 0], sombra = 0.28, sombraV = 0 }, muestras, paso, ref) {
  const O = new THREE.Vector3(...o), Ux = new THREE.Vector3(...u), Vy = new THREE.Vector3(...v);
  const normal = new THREE.Vector3().crossVectors(Ux, Vy).normalize();
  const medio = muestras[Math.floor(muestras.length / 2)];
  if (normal.dot(medio.clone().sub(O)) < 0) normal.negate();
  const lu = Ux.length(), lv = Vy.length();
  const nx = Math.max(8, Math.ceil(lu / 0.02)), ny = Math.max(6, Math.ceil(lv / 0.012));
  const pos = [], luz = [], base = [], idx = [];
  const P = new THREE.Vector3(), dd = new THREE.Vector3();
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
    P.copy(O).addScaledVector(Ux, i / nx).addScaledVector(Vy, j / ny);
    let E = 0;
    for (const S of muestras) {
      dd.subVectors(S, P);
      const r2 = dd.lengthSq() + 0.0004, r = Math.sqrt(r2);
      const llega = Math.max(0, normal.dot(dd) / r);
      const sale = Math.max(0, dd.y / r);
      E += llega * (0.15 + 0.85 * sale) / r2;
    }
    E *= paso;
    const di = Math.min(i / nx, 1 - i / nx) * lu;
    const borde = (fu ? suave(0, fu, di) : 1) * (fv[0] ? suave(0, fv[0], (j / ny) * lv) : 1) * (fv[1] ? suave(0, fv[1], (1 - j / ny) * lv) : 1);
    const osc = sombra * (sombraV ? 1 - suave(0, sombraV, (j / ny) * lv) : 1);
    luz.push(Math.min(4, E / ref) * borde);
    base.push(1 - osc * borde);
    pos.push(P.x, P.y, P.z);
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const a = i * (ny + 1) + j, b = a + ny + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("luz", new THREE.Float32BufferAttribute(luz, 1));
  g.setAttribute("base", new THREE.Float32BufferAttribute(base, 1));
  g.setIndex(idx);
  return g;
}

function crearLeds(leds) {
  const matLavado = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0, 0, 0) } },
    vertexShader: LAVADO_VERTICE, fragmentShader: LAVADO_FRAGMENTO,
    // Multiplica lo que ya hay: destino · (sombra + luz).
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  const matTira = new THREE.MeshBasicMaterial({ color: "#000000" });
  const mallas = [];
  for (const led of leds) {
    const puntos = led.tira.map(p => new THREE.Vector3(...p));
    const muestras = [];
    let largo = 0;
    for (let k = 0; k < puntos.length - 1; k++) {
      const a = puntos[k], b = puntos[k + 1], l = a.distanceTo(b);
      const m = Math.max(1, Math.ceil(l / 0.008));
      for (let s = 0; s < m; s++) muestras.push(a.clone().lerp(b, (s + 0.5) / m));
      largo += l;
      // La tira: un perfil fino que brilla.
      const tira = new THREE.Mesh(new THREE.BoxGeometry(l, 0.004, 0.011), matTira);
      tira.position.copy(a).lerp(b, 0.5);
      tira.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      mallas.push(tira);
    }
    const paso = largo / muestras.length;
    // Referencia: un punto 0,3 abajo del medio de la tira, mirando arriba.
    const medio = muestras[Math.floor(muestras.length / 2)];
    const Pref = medio.clone().add(new THREE.Vector3(0, -0.3, 0));
    let ref = 0;
    for (const S of muestras) { const d = S.clone().sub(Pref); const r2 = d.lengthSq() + 0.0004, r = Math.sqrt(r2); ref += (d.y / r) * (0.15 + 0.85 * d.y / r) / r2; }
    ref *= paso;
    for (const s of led.banos) mallas.push(new THREE.Mesh(lavado(s, muestras, paso, ref), matLavado));
  }
  return { mallas, matLavado, matTira };
}

/* ─────────────── Espejo ─────────────── */

const ESPEJO = {
  name: "Espejo",
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    void main() {
      vUv = textureMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    varying vec4 vUv;
    void main() {
      gl_FragColor = vec4( texture2DProj( tDiffuse, vUv ).rgb * color, 1.0 );
    }
  `,
};

/* ─────────────── Reflejo de la mesada ─────────────── */

/* El cuarzo pulido refleja lo que tiene encima (la pava, la cafetera, las
   alacenas), como en las fotos del barco. Es un Reflector con la forma de la
   cara de arriba de la mesada, apenas adelante de ella: mezcla el reflejo con
   lo que hay según el ángulo (Fresnel: 4 % de frente, casi todo al ras) y un
   poco borroso (la piedra no es un espejo). */
const MESADA = {
  name: "ReflejoMesada",
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vMundo;
    varying vec3 vNormal;
    void main() {
      vUv = textureMatrix * vec4( position, 1.0 );
      vec4 mundo = modelMatrix * vec4( position, 1.0 );
      vMundo = mundo.xyz;
      vNormal = normalize( mat3( modelMatrix ) * vec3( 0.0, 0.0, 1.0 ) );
      gl_Position = projectionMatrix * viewMatrix * mundo;
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    varying vec4 vUv;
    varying vec3 vMundo;
    varying vec3 vNormal;
    void main() {
      vec2 p = vUv.xy / vUv.w;
      vec2 d = 1.5 / vec2( textureSize( tDiffuse, 0 ) );
      vec3 r = 0.25 * ( texture2D( tDiffuse, p + d ).rgb + texture2D( tDiffuse, p - d ).rgb
        + texture2D( tDiffuse, p + vec2( d.x, - d.y ) ).rgb + texture2D( tDiffuse, p + vec2( - d.x, d.y ) ).rgb );
      float c = clamp( dot( normalize( cameraPosition - vMundo ), vNormal ), 0.0, 1.0 );
      gl_FragColor = vec4( r * color, 0.04 + 0.96 * pow( 1.0 - c, 5.0 ) );
    }
  `,
};

/* La cara de arriba de la mesada: las caras de la malla de piedra que miran
   hacia arriba a la altura y (en el marco del barco, base), en el plano del
   Reflector (x, −z). Los vértices se llevan de a uno: el modelo viene
   cuantizado (enteros de 16 bits entre −1 y 1) y no admite otras medidas. */
function caraMesada(piedra, base, y) {
  const rel = new THREE.Matrix4();
  for (let o = piedra; o && o !== base; o = o.parent) { if (o.matrixAutoUpdate) o.updateMatrix(); rel.premultiply(o.matrix); }
  const { index: I, attributes: { position: P } } = piedra.geometry;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const pos = [];
  for (let i = 0, n = I ? I.count : P.count; i < n; i += 3) {
    v.forEach((p, k) => p.fromBufferAttribute(P, I ? I.getX(i + k) : i + k).applyMatrix4(rel));
    const normal = e1.subVectors(v[1], v[0]).cross(e2.subVectors(v[2], v[0]));
    if (normal.lengthSq() < 1e-14 || Math.abs(normal.normalize().y) < 0.999) continue;
    if (v.some(p => Math.abs(p.y - y) > 0.003)) continue;
    v.forEach(p => pos.push(p.x, -p.z, 0));
  }
  if (!pos.length) return null;
  const cara = new THREE.BufferGeometry();
  cara.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return cara;
}

/* Lo que no entra en un reflejo (el mar, la bacha, el otro reflejo): se
   oculta mientras se dibuja. */
function sinEnElReflejo(reflector, ocultos) {
  const reflejar = reflector.onBeforeRender;
  reflector.onBeforeRender = function (renderer, ...resto) {
    const lista = ocultos().filter(Boolean);
    const antes = lista.map(o => o.visible);
    lista.forEach(o => { o.visible = false; });
    reflejar.call(this, renderer, ...resto);
    lista.forEach((o, i) => { o.visible = antes[i]; });
  };
}

/* ─────────────── Conjunto ─────────────── */

/* datos: { objetos: [{ q, p, r, … }], leds, espejo, pantalla, mesada }
   (unidad.js). piedra: la malla de las mesadas del modelo; base: el grupo
   del barco, donde va la decoración. Devuelve el grupo (en la capa 1), lo que
   no va en la oclusión ambiental (vidrio, luces, reflejos) y actualizar(…)
   para cada cuadro. El lienzo donde se dibuja necesita plantilla (stencil)
   para la bacha. */
export function crearDecoracion(datos, { chico = false, piedra = null, base = null } = {}) {
  const { lista: mats, texturas } = crearMateriales();
  const porMaterial = {};
  const m4 = new THREE.Matrix4(), giro = new THREE.Quaternion(), arriba = new THREE.Vector3(0, 1, 0);
  for (const d of datos.objetos || []) {
    const hacer = KIT[d.q];
    if (!hacer) continue;
    const piezas = hacer(d, generador(d.semilla || 7));
    giro.setFromAxisAngle(arriba, THREE.MathUtils.degToRad(d.r || 0));
    m4.compose(new THREE.Vector3(...d.p), giro, new THREE.Vector3(U, U, U));
    for (const { g, m, uv } of piezas) {
      const lista = preparar(g, uv);
      lista.applyMatrix4(m4);
      (porMaterial[m] ||= []).push(lista);
    }
  }
  const grupo = new THREE.Group();
  const efimeros = new THREE.Group();
  // La bacha usa la plantilla: no la ve el reflejo del espejo (que no tiene).
  const conPlantilla = [];
  for (const [m, geos] of Object.entries(porMaterial)) {
    const geo = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    if (!geo) continue;
    const malla = new THREE.Mesh(geo, mats[m]);
    malla.receiveShadow = true;
    if (ORDEN[m]) { malla.renderOrder = ORDEN[m]; conPlantilla.push(malla); }
    (m === "vidrio" ? efimeros : grupo).add(malla);
  }

  const leds = crearLeds(datos.leds || []);
  leds.mallas.forEach(m => efimeros.add(m));

  let espejo = null;
  if (datos.espejo) {
    const e = datos.espejo;
    const lado = chico ? 640 : 1280;
    espejo = new Reflector(new THREE.PlaneGeometry(e.ancho, e.alto), {
      textureWidth: lado, textureHeight: Math.round(lado * 0.6), clipBias: 0.001, multisample: chico ? 2 : 4,
      // Plata sobre vidrio: refleja ~88 %, con el verdecito del vidrio.
      color: new THREE.Color().setRGB(0.85, 0.885, 0.87), shader: ESPEJO,
    });
    espejo.position.set(...e.c);
    espejo.lookAt(new THREE.Vector3(...e.c).add(new THREE.Vector3(...e.n)));
    // El reflejo ve el interior (capa 1) y el exterior.
    espejo.camera.layers.enableAll();
    efimeros.add(espejo);
  }
  // La mesada de la cocina refleja (no en celulares: es dibujar el interior
  // otra vez). Va 3 mm por encima: así el plano del reflejo deja abajo a la
  // misma mesada (en su plano se colaba en el reflejo). Se dibuja después de
  // las luces de las tiras y no tapa la boca de la bacha (la plantilla).
  let reflejo = null;
  const cara = datos.mesada && piedra && !chico ? caraMesada(piedra, base, datos.mesada.y) : null;
  if (cara) {
    reflejo = new Reflector(cara, { textureWidth: 512, textureHeight: 512, multisample: 0, shader: MESADA, color: new THREE.Color(1, 1, 1) });
    reflejo.position.set(0, datos.mesada.y + 0.003 * U, 0);
    reflejo.rotation.x = -Math.PI / 2;
    reflejo.camera.layers.enableAll();
    Object.assign(reflejo.material, {
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
    });
    reflejo.renderOrder = 13;
    efimeros.add(reflejo);
  }
  const estado = { agua: null, ancho: 0, alto: 0 };
  // El mar no entra en los reflejos (no se ve desde el baño ni desde la
  // mesada y es caro), ni la bacha de la cocina (su plantilla no existe ahí),
  // ni un reflejo en el otro.
  if (espejo) sinEnElReflejo(espejo, () => [estado.agua, reflejo, ...conPlantilla]);
  if (reflejo) sinEnElReflejo(reflejo, () => [estado.agua, espejo, ...conPlantilla]);

  if (datos.pantalla) {
    const p = datos.pantalla;
    const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(p.ancho, p.alto), mats.pantalla);
    const n = new THREE.Vector3(...p.n).normalize();
    pantalla.position.set(...p.c).addScaledVector(n, 0.002);
    pantalla.lookAt(pantalla.position.clone().add(n));
    grupo.add(pantalla);
  }

  grupo.add(efimeros);
  grupo.traverse(o => o.layers.set(1));
  grupo.visible = false;

  // int: cuánto se está adentro (0 a 1); noche: 0 a 1; acento: el color de los
  // almohadones; agua: la malla del mar; ancho/alto: el lienzo en píxeles.
  function actualizar({ int, noche, acento, agua, ancho, alto }) {
    grupo.visible = int > 0.01;
    if (!grupo.visible) return;
    if (acento) mats.acento.color.copy(acento);
    // De día la luz de la ventana tapa la de las tiras: casi no tiñen.
    leds.matLavado.uniforms.color.value.copy(LUZ_LED).multiplyScalar(int * (0.35 + 2.15 * noche));
    leds.matTira.color.copy(LUZ_LED).multiplyScalar(int * (3 + 5 * noche));
    estado.agua = agua;
    // Los reflejos con la resolución de la pantalla (si no, se ven borrosos;
    // el de la mesada, a la mitad: igual va un poco borroso).
    if (ancho && (ancho !== estado.ancho || alto !== estado.alto)) {
      estado.ancho = ancho; estado.alto = alto;
      const k = chico ? 0.7 : 0.85;
      espejo?.getRenderTarget().setSize(Math.round(ancho * k), Math.round(alto * k));
      reflejo?.getRenderTarget().setSize(Math.round(ancho / 2), Math.round(alto / 2));
    }
  }

  function dispose() {
    grupo.traverse(o => { if (o.isMesh && o !== espejo && o !== reflejo) o.geometry.dispose(); });
    Object.values(mats).forEach(m => m.dispose());
    texturas.forEach(t => t.dispose());
    leds.matLavado.dispose();
    leds.matTira.dispose();
    if (espejo) { espejo.geometry.dispose(); espejo.dispose(); }
    if (reflejo) { reflejo.geometry.dispose(); reflejo.dispose(); }
  }

  return { grupo, efimeros, actualizar, dispose };
}
