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
  sol:    { turbidez: 2.2, rayleigh: 1.1, mie: 0.004, mieG: 0.82, nubes: 0.22, lluvia: 0, luz: 1, niebla: 0.0009, agua: "#0e3a48", ola: 2.2 },
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
    nieblaColor: new THREE.Color(clima === "sol" ? "#cfdbe3" : clima === "nubes" ? "#a8b1b6" : "#8a9397")
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

/* Nubes: blanco con alfa de ruido fractal. "cobertura" sube en nublado. */
export function texturaNubes() {
  return lienzo(512, (ctx, T) => {
    const n = ruido(T, [[4, 1], [8, 0.55], [16, 0.3], [32, 0.15]], 7);
    const img = ctx.createImageData(T, T);
    for (let i = 0; i < n.length; i++) {
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.round(255 * n[i]);
    }
    ctx.putImageData(img, 0, 0);
  });
}

/* Espuma: manchas blancas de ruido fino, para la estela (se desplaza). */
export function texturaEspuma() {
  return lienzo(256, (ctx, T) => {
    const n = ruido(T, [[8, 1], [16, 0.7], [32, 0.5], [64, 0.3]], 3);
    const img = ctx.createImageData(T, T);
    for (let i = 0; i < n.length; i++) {
      // Nunca transparente del todo: la espuma es un manto con manchas más densas.
      const v = 0.4 + 0.6 * Math.max(0, Math.min(1, (n[i] - 0.3) * 2.6));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.round(255 * v);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}

/* Forma de la estela vista desde arriba: una V que se abre y se apaga hacia
   atrás. u: a lo largo (0 popa del barco → 1 lejos), v: a lo ancho. */
export function texturaEstela() {
  const tex = lienzo(256, (ctx, T) => {
    const img = ctx.createImageData(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const u = x / T, v = (y / T) * 2 - 1;
      const abre = 0.16 + u * 0.84;
      const borde = Math.abs(Math.abs(v) - abre * 0.92);
      const centro = Math.max(0, 1 - Math.abs(v) / (0.14 + u * 0.32)) * Math.pow(1 - u, 1.4) * 1.5;
      const brazo = Math.max(0, 1 - borde / (0.05 + u * 0.08)) * (1 - u * 0.85);
      const a = Math.min(1, centro + brazo * 0.8) * suave(0, 0.04, u) * (Math.abs(v) < abre ? 1 : 0.4);
      const k = (y * T + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(255 * a);
    }
    ctx.putImageData(img, 0, 0);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* Brillo redondo (luces subacuáticas, luna, luz de tope). */
export function texturaBrillo() {
  const tex = lienzo(128, (ctx, T) => {
    const g = ctx.createRadialGradient(T / 2, T / 2, 0, T / 2, T / 2, T / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, T, T);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
