/* ═══════════════════════════════════════════════════════════════
   Configurador · ambiente
   Sol, cielo y mar según la hora y el clima, y las texturas que se
   generan en el momento (nubes, estela, brillos). Sin descargas.
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";

const suave = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* Parámetros del cielo por clima (Sky de three: turbidez, Rayleigh, Mie). */
const CIELOS = {
  sol:    { turbidez: 1.6, rayleigh: 2.4, mie: 0.003, mieG: 0.86, nubes: 0.22, lluvia: 0, luz: 1, niebla: 0.0006, agua: "#0a3a52", ola: 2.2 },
  nubes:  { turbidez: 9, rayleigh: 2.6, mie: 0.02, mieG: 0.7, nubes: 0.85, lluvia: 0, luz: 0.42, niebla: 0.0035, agua: "#22363b", ola: 3.2 },
  lluvia: { turbidez: 16, rayleigh: 3.4, mie: 0.045, mieG: 0.62, nubes: 1, lluvia: 1, luz: 0.24, niebla: 0.009, agua: "#202a2a", ola: 4.6 },
};

/* Estado objetivo del ambiente. La escena interpola hacia él cuadro a cuadro,
   así cualquier cambio (hora o clima) es una transición, no un salto. */
export function ambiente(hora, clima) {
  const c = CIELOS[clima] || CIELOS.sol;
  // 6:00 sale el sol, 19:30 se pone; fuera de eso, bajo el horizonte.
  const t = (hora - 6) / 13.5;
  const elev = Math.max(-14, 62 * Math.sin(Math.PI * t) - 2);
  const azim = 100 + 170 * Math.min(1.15, Math.max(-0.15, t));
  const dia = suave(-6, 8, elev);
  const dorado = 1 - suave(4, 26, elev);
  const noche = 1 - suave(-10, -1, elev);
  return {
    elev, azim, dia, noche, dorado,
    ...c,
    // Intensidad y color del sol: naranja bajo, blanco alto.
    sol: dia * (2.4 * c.luz + 0.15),
    solColor: new THREE.Color("#fff4e6").lerp(new THREE.Color("#ff9b57"), dorado * 0.9),
    ambiente: 0.12 + noche * 0.3 + dia * (0.55 + (1 - c.luz) * 0.35),
    luna: noche * 1.1,
    niebla: c.niebla * (1 + noche * 0.6),
    nieblaColor: new THREE.Color(clima === "sol" ? "#bcd0de" : clima === "nubes" ? "#a8b1b6" : "#8a9397")
      .lerp(new THREE.Color("#e8b38d"), clima === "sol" ? dorado * 0.7 * dia : 0)
      .lerp(new THREE.Color("#0b1018"), noche),
    exposicion: 0.52 + noche * 0.3,
  };
}

/* Azar con semilla: el mismo dibujo en cada carga. */
function generador(semilla) {
  let s = semilla;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/* Ruido de valor con mosaico perfecto (para que las texturas se repitan sin costura). */
function ruido(T, escalas, semilla = 1) {
  const azar = generador(semilla);
  const campo = new Float32Array(T * T);
  let total = 0;
  escalas.forEach(([celdas, peso]) => {
    const g = Array.from({ length: celdas * celdas }, azar);
    const at = (x, y) => g[((y + celdas) % celdas) * celdas + ((x + celdas) % celdas)];
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const fx = (x / T) * celdas, fy = (y / T) * celdas;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const sx = fx - x0, sy = fy - y0;
      const ux = sx * sx * (3 - 2 * sx), uy = sy * sy * (3 - 2 * sy);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * ux;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * ux;
      campo[y * T + x] += (a + (b - a) * uy) * peso;
    }
    total += peso;
  });
  for (let i = 0; i < campo.length; i++) campo[i] /= total;
  return campo;
}

function lienzo(T, pintar) {
  const c = document.createElement("canvas");
  c.width = c.height = T;
  const ctx = c.getContext("2d");
  pintar(ctx, T);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* Ruido de valor que se repite cada `celdas` y se puede evaluar en cualquier
   punto (hace falta para torcer el dominio). */
function valor(celdas, semilla) {
  const azar = generador(semilla);
  const g = Float32Array.from({ length: celdas * celdas }, azar);
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const sx = x - x0, sy = y - y0;
    const ux = sx * sx * (3 - 2 * sx), uy = sy * sy * (3 - 2 * sy);
    const i0 = ((x0 % celdas) + celdas) % celdas, j0 = ((y0 % celdas) + celdas) % celdas;
    const i1 = (i0 + 1) % celdas, j1 = (j0 + 1) % celdas;
    const a = g[j0 * celdas + i0], b = g[j0 * celdas + i1], c = g[j1 * celdas + i0], d = g[j1 * celdas + i1];
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}

/* Octavas de ruido de valor en (u, v) ∈ [0, 1)², con mosaico perfecto. */
function octavas(escalas, semilla) {
  const capas = escalas.map(([celdas, peso], i) => ({ f: valor(celdas, semilla + i * 101), celdas, peso }));
  const total = escalas.reduce((s, [, p]) => s + p, 0);
  return (u, v) => {
    let s = 0;
    for (const c of capas) s += c.f(u * c.celdas, v * c.celdas) * c.peso;
    return s / total;
  };
}

/* Celdas (Voronoi) con mosaico: f1/f2 en (u, v), 0 en el centro de cada
   burbuja y 1 en el borde entre dos. */
function burbujas(n, semilla) {
  const azar = generador(semilla);
  const px = new Float32Array(n * n), py = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) { px[i] = 0.1 + 0.8 * azar(); py[i] = 0.1 + 0.8 * azar(); }
  return (u, v) => {
    const fx = u * n, fy = v * n;
    const cx = Math.floor(fx), cy = Math.floor(fy);
    let f1 = 99, f2 = 99;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j;
      const k = (((gy % n) + n) % n) * n + (((gx % n) + n) % n);
      const dx = gx + px[k] - fx, dy = gy + py[k] - fy;
      const d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return Math.sqrt(f1 / f2);
  };
}

/* Cada valor pasa a su percentil (0..1): así, en el shader, "cubrir el 30%
   con espuma" es cortar el dibujo en 0,7. */
function ecualizar(crudo) {
  let min = Infinity, max = -Infinity;
  for (const v of crudo) { if (v < min) min = v; if (v > max) max = v; }
  const B = 4096;
  const hist = new Float32Array(B);
  const bin = v => Math.min(B - 1, Math.floor(((v - min) / (max - min || 1)) * B));
  for (const v of crudo) hist[bin(v)]++;
  for (let i = 1; i < B; i++) hist[i] += hist[i - 1];
  const out = new Float32Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) out[i] = hist[bin(crudo[i])] / crudo.length;
  return out;
}

/* Texturas del mar (512², se repiten sin costura), todas en una:
   R ruido fino (burbujas, vetas), G manchas grandes, B el dibujo de la
   espuma y A un marmolado para el agua aireada.
   La espuma de verdad no es una red pareja (eso parecía vidrio roto): son
   grumos de encaje con agujeros de todos los tamaños. Sale de un ruido
   "de crestas" con el dominio torcido dos veces (forma de mármol), más
   burbujas grandes y chicas, ecualizado: cortado alto deja hilos sueltos,
   al medio encaje, bajo una sábana blanca con agujeritos. */
const T_MAR = 512;
let datosMar = null;
let promesaMar = null;

function* generarMar(T, out) {
  const fino = ruido(T, [[16, 1], [32, 0.8], [64, 0.55]], 5);
  const grueso = ruido(T, [[4, 1], [8, 0.6], [16, 0.35]], 9);
  const torcerA = [octavas([[2, 1], [4, 0.5], [8, 0.25]], 21), octavas([[2, 1], [4, 0.5], [8, 0.25]], 37)];
  const torcerB = [octavas([[3, 1], [6, 0.5], [12, 0.25]], 121), octavas([[3, 1], [6, 0.5], [12, 0.25]], 137)];
  const marmol = octavas([[3, 1], [6, 0.6], [12, 0.35], [24, 0.2]], 63);
  const nubes = octavas([[2, 1], [4, 0.7], [8, 0.4], [16, 0.2]], 211);
  const grandes = burbujas(13, 83), chicas = burbujas(30, 97);
  const espuma = new Float32Array(T * T), aire = new Float32Array(T * T);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const u = x / T, v = y / T;
      const ax = torcerA[0](u, v) - 0.5, ay = torcerA[1](u, v) - 0.5;
      const qx = u + ax * 0.22, qy = v + ay * 0.22;
      const bx = torcerB[0](qx, qy) - 0.5, by = torcerB[1](qx, qy) - 0.5;
      const sx = qx + bx * 0.16, sy = qy + by * 0.16;
      const crestas = 1 - Math.abs(2 * marmol(sx, sy) - 1);
      const b = grandes(sx + 0.31, sy + 0.17) ** 1.5;
      const c = chicas(u + bx * 0.05 + 0.53, v + by * 0.05 + 0.71);
      espuma[y * T + x] = crestas * 0.6 + b * 0.4 + c * 0.27;
      aire[y * T + x] = nubes(sx * 0.7 + 0.2, sy * 0.7 + 0.4);
    }
    if (y % 24 === 23) yield;
  }
  const e = ecualizar(espuma), a = ecualizar(aire);
  const estirar = v => Math.max(0, Math.min(1, (v - 0.5) * 2.2 + 0.5));
  for (let i = 0; i < T * T; i++) {
    out[i * 4] = Math.round(255 * estirar(fino[i]));
    out[i * 4 + 1] = Math.round(255 * estirar(grueso[i]));
    out[i * 4 + 2] = Math.round(255 * e[i]);
    out[i * 4 + 3] = Math.round(255 * a[i]);
  }
}

/* Se calcula de a partes mientras carga el barco (sin trabar la página). */
export function prepararMar() {
  if (!promesaMar) {
    promesaMar = (async () => {
      const out = new Uint8Array(T_MAR * T_MAR * 4);
      const pasos = generarMar(T_MAR, out);
      while (!pasos.next().done) await new Promise(r => setTimeout(r, 0));
      datosMar = out;
    })();
  }
  return promesaMar;
}

export function texturaRuido() {
  if (!datosMar) {
    const out = new Uint8Array(T_MAR * T_MAR * 4);
    const pasos = generarMar(T_MAR, out);
    while (!pasos.next().done);
    datosMar = out;
  }
  const tex = new THREE.DataTexture(datosMar, T_MAR, T_MAR, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* Brillo redondo (luces, luna, charcos de luz). Caída suave como la de una
   luz real: un núcleo gaussiano concentrado más un halo de inversa al cuadrado
   que llega a cero con curva quíntica antes del borde (sin anillos ni cantos). */
export function texturaBrillo() {
  const tex = lienzo(256, (ctx, T) => {
    const img = ctx.createImageData(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const r = Math.hypot(x + 0.5 - T / 2, y + 0.5 - T / 2) / (T / 2);
      if (r >= 1) continue;
      const u = 1 - r;
      const borde = u * u * u * (u * (u * 6 - 15) + 10);
      const a = (Math.exp(-r * r * 18) * 0.72 + 0.28 / (1 + r * r * 22)) * borde;
      const o = (y * T + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(255 * Math.min(1, a));
    }
    ctx.putImageData(img, 0, 0);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
