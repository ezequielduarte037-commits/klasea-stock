/* ═══════════════════════════════════════════════════════════════
   Configurador · interior
   Texturas de las terminaciones de adentro que se arman en el momento (se
   crean al elegirlas y quedan guardadas):
   · Mármoles: vetas que siguen las curvas de un ruido con el dominio
     torcido, como la piedra real (no rayas parejas), con nubes de fondo y
     vetas finas. Se repiten sin costura cada 1,2 m.
   · Maderas: el roble del recorrido en otros tonos (barco.js).
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";
import { texturaRoble } from "../recorrido/barco";

const T = 512;

function generador(semilla) {
  let s = semilla;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/* Ruido de valor que se repite cada `n` celdas en (u, v) ∈ [0, 1). */
function ruido(n, semilla) {
  const azar = generador(semilla);
  const g = Float32Array.from({ length: n * n }, azar);
  return (u, v) => {
    const x = u * n, y = v * n;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const sx = x - x0, sy = y - y0;
    const ux = sx * sx * (3 - 2 * sx), uy = sy * sy * (3 - 2 * sy);
    const i0 = ((x0 % n) + n) % n, j0 = ((y0 % n) + n) % n;
    const i1 = (i0 + 1) % n, j1 = (j0 + 1) % n;
    const a = g[j0 * n + i0], b = g[j0 * n + i1], c = g[j1 * n + i0], d = g[j1 * n + i1];
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}

function octavas(escalas, semilla) {
  const capas = escalas.map((n, i) => ({ f: ruido(n, semilla + i * 131), peso: 1 / (i + 1) ** 0.9 }));
  const total = capas.reduce((s, c) => s + c.peso, 0);
  return (u, v) => { let s = 0; for (const c of capas) s += c.f(u, v) * c.peso; return s / total; };
}

// Colores en sRGB, como van al lienzo.
const color = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* fondo: color base; nube: cuánto varía; veta/fina: color de las vetas
   gruesas y finas; ancho: grosor de la veta gruesa (con un halo difuso
   alrededor); fuerza: cuánto se nota; vetas: cuántas cruzan cada tramo;
   torsion: cuánto serpentean. */
const MARMOLES = {
  carrara: { fondo: "#e8e7e3", nube: 0.05, veta: "#8f959b", fina: "#a9aeb3", ancho: 0.05, fuerza: 0.6, finas: 0.22, vetas: 2, torsion: 0.38, halo: 0.3, semilla: 3 },
  calacatta: { fondo: "#f2efe9", nube: 0.03, veta: "#7d7466", fina: "#b9a27a", ancho: 0.07, fuerza: 0.85, finas: 0.15, vetas: 1, torsion: 0.34, halo: 0.35, semilla: 11 },
  nero: { fondo: "#151618", nube: 0.08, veta: "#e4e2dd", fina: "#7d7e80", ancho: 0.03, fuerza: 0.9, finas: 0.35, vetas: 2, torsion: 0.4, halo: 0.18, semilla: 7 },
};

function marmol(tipo) {
  const p = MARMOLES[tipo];
  const fondo = color(p.fondo), veta = color(p.veta), fina = color(p.fina);
  const torcerA = octavas([2, 4, 8], p.semilla), torcerB = octavas([2, 4, 8], p.semilla + 50);
  const quiebre = octavas([24, 48, 96], p.semilla + 300);
  const gruesa = octavas([2, 4, 8, 16], p.semilla + 100);
  const finas = octavas([4, 8, 16, 32], p.semilla + 150);
  const nubes = octavas([2, 4, 8], p.semilla + 200);
  const presencia = octavas([2, 3, 6], p.semilla + 250);
  return (u, v, out) => {
    const qu = u + (torcerA(u, v) - 0.5) * p.torsion, qv = v + (torcerB(u, v) - 0.5) * p.torsion;
    // Las vetas corren en diagonal (como se corta la piedra) y serpentean
    // con el ruido; van por donde el campo cruza la mitad, con bordes quebrados.
    const campo = 0.5 + 0.21 * Math.sin(2 * Math.PI * (p.vetas * qu + qv)) + (gruesa(qu, qv) - 0.5) * 0.95 + (quiebre(u, v) - 0.5) * 0.07;
    const g = 1 - Math.abs(2 * (campo - Math.floor(campo)) - 1);
    const f = 1 - Math.abs(2 * finas(qu * 1.2 + 0.2, qv * 1.2) - 1);
    const pres = suave(0.3, 0.75, presencia(u, v));
    const nucleo = suave(1 - p.ancho, 1, g) ** 1.4;
    const halo = suave(1 - p.ancho * 5, 1, g) ** 2 * p.halo;
    const vg = Math.min(1, nucleo + halo) * p.fuerza * (0.25 + 0.75 * pres);
    const vf = suave(1 - p.ancho * 0.3, 1, f) * p.finas * pres;
    const n = 1 + (nubes(u, v) - 0.5) * 2 * p.nube;
    for (let k = 0; k < 3; k++) {
      let c = fondo[k] * n;
      c += (fina[k] - c) * vf;
      c += (veta[k] - c) * vg;
      out[k] = c;
    }
  };
}

/* Cuarzo grafito: gris parejo con grano fino claro y oscuro. */
function grafito() {
  const base = color("#55575a");
  const grano = ruido(256, 31), grano2 = ruido(181, 37), nubes = octavas([2, 4], 41);
  return (u, v, out) => {
    const a = grano(u, v), b = grano2(u, v);
    const claro = suave(0.82, 0.92, a) * 0.55, oscuro = suave(0.8, 0.92, b) * 0.35;
    const n = 1 + (nubes(u, v) - 0.5) * 0.08;
    for (let k = 0; k < 3; k++) out[k] = base[k] * n * (1 - oscuro) + (210 - base[k]) * claro;
  };
}

function lienzoTextura(pintar, metros) {
  const c = document.createElement("canvas");
  c.width = c.height = T;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(T, T);
  const px = [0, 0, 0];
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    pintar(x / T, y / T, px);
    const o = (y * T + x) * 4;
    img.data[o] = Math.max(0, Math.min(255, px[0]));
    img.data[o + 1] = Math.max(0, Math.min(255, px[1]));
    img.data[o + 2] = Math.max(0, Math.min(255, px[2]));
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Las UV del modelo vienen en metros.
  tex.repeat.set(1 / metros, 1 / metros);
  tex.anisotropy = 8;
  return tex;
}

/* clave: "marmol-carrara", "marmol-grafito", "roble-nogal"… */
export function texturaInterior(clave) {
  const [tipo, variante] = clave.split("-");
  if (tipo === "roble") return texturaRoble(0.6, variante);
  if (variante === "grafito") return lienzoTextura(grafito(), 0.5);
  return lienzoTextura(marmol(variante), 1.2);
}
