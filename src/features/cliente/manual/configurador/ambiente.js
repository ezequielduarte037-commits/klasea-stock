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

/* Ruido de valor con mosaico perfecto (para que las texturas se repitan sin costura). */
function ruido(T, escalas, semilla = 1) {
  let s = semilla;
  const azar = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
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

/* Encaje de espuma (ruido celular): líneas blancas entre "burbujas", como
   la espuma que queda flotando detrás de un barco. Se repite sin costura. */
function encaje(T, celdas, semilla) {
  let s = semilla;
  const azar = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pts = Array.from({ length: celdas * celdas }, () => [azar(), azar()]);
  const out = new Float32Array(T * T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const fx = (x / T) * celdas, fy = (y / T) * celdas;
    const cx = Math.floor(fx), cy = Math.floor(fy);
    let f1 = 9, f2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j;
      const p = pts[((gy + celdas) % celdas) * celdas + ((gx + celdas) % celdas)];
      const d = Math.hypot(gx + p[0] - fx, gy + p[1] - fy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    out[y * T + x] = 1 - Math.min(1, (f2 - f1) / 0.22);
  }
  return out;
}

/* Ruido para la espuma del agua: rojo fino (burbujas y vetas), verde grueso
   (manchas), azul el encaje de espuma. Se repite sin costura. */
export function texturaRuido() {
  const T = 512;
  const fino = ruido(T, [[16, 1], [32, 0.8], [64, 0.55]], 5);
  const grueso = ruido(T, [[4, 1], [8, 0.6], [16, 0.35]], 9);
  const lazoA = encaje(T, 14, 3), lazoB = encaje(T, 34, 8);
  const tex = lienzo(T, ctx => {
    const img = ctx.createImageData(T, T);
    const estirar = v => Math.max(0, Math.min(1, (v - 0.5) * 2.2 + 0.5));
    for (let i = 0; i < T * T; i++) {
      img.data[i * 4] = Math.round(255 * estirar(fino[i]));
      img.data[i * 4 + 1] = Math.round(255 * estirar(grueso[i]));
      img.data[i * 4 + 2] = Math.round(255 * Math.min(1, Math.max(lazoA[i] ** 1.6, lazoB[i] ** 2.2 * 0.85)));
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/* Brillo redondo (luces, luna, charcos de luz). Caída suave como la de una
   luz real: un núcleo gaussiano más una cola larga que llega a cero sin
   borde (el degradé lineal de antes dejaba anillos y un canto visible). */
export function texturaBrillo() {
  const tex = lienzo(256, (ctx, T) => {
    const img = ctx.createImageData(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const r = Math.hypot(x + 0.5 - T / 2, y + 0.5 - T / 2) / (T / 2);
      const borde = Math.max(0, 1 - r);
      const a = (Math.exp(-r * r * 14) * 0.75 + 0.25 / (1 + (r * 7) ** 2)) * borde * borde;
      const o = (y * T + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(255 * Math.min(1, a));
    }
    ctx.putImageData(img, 0, 0);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
