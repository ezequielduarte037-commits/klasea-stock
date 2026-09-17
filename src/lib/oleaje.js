// El oleaje de la marca: filas de líneas en perspectiva que ondulan como la
// superficie del agua. Lo usan el login, la intro al entrar y el Home.
//
// Canvas 2D a mano, sin three.js ni framer-motion: el login viaja en el bundle
// inicial —lo abre también el PDA del pañol— y cualquiera de las dos librerías
// pesa más que la pantalla entera.

/** Un color de palette.css tal como está aplicado en este momento. */
export function colorDelTema(variable, respaldo) {
  try {
    const valor = window.getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    return valor || respaldo;
  } catch {
    return respaldo;
  }
}

/** Ajusta el buffer del canvas a su tamaño en pantalla (hasta 2x) y devuelve ese tamaño en px CSS. */
export function ajustarCanvas(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ancho = Math.max(1, rect.width);
  const alto = Math.max(1, rect.height);
  canvas.width = Math.round(ancho * dpr);
  canvas.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ancho, alto };
}

/** Cualquier color CSS ("#7eb3ff", "rgb(…)") → [r, g, b]. El canvas lo normaliza. */
export function aRgb(ctx, color) {
  ctx.fillStyle = "#000000";
  ctx.fillStyle = color;
  const valor = String(ctx.fillStyle);
  if (valor[0] === "#") {
    const n = parseInt(valor.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const partes = valor.match(/[\d.]+/g) || [];
  return [Number(partes[0]) || 0, Number(partes[1]) || 0, Number(partes[2]) || 0];
}

export function rgba(rgb, alfa) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alfa})`;
}

/**
 * Un cuadro del oleaje: filas de líneas en perspectiva que ondulan como la
 * superficie del agua, con un reflejo de luz que titila sobre las crestas.
 *
 * o = { ancho, alto, t (segundos), linea [r,g,b], reflejo [r,g,b],
 *       horizonte (0 a 1 del alto), alfa, filas, dx, dy (paralaje en px) }
 */
export function dibujarOleaje(ctx, o) {
  const { ancho, alto } = o;
  const t = o.t || 0;
  const filas = o.filas || 28;
  const alfa = o.alfa == null ? 0.5 : o.alfa;
  const horizonte = alto * (o.horizonte == null ? 0.6 : o.horizonte) + (o.dy || 0);
  const profundidad = alto - horizonte;
  if (profundidad < 4 || ancho < 4 || alfa <= 0) return;

  const muestras = Math.min(140, Math.max(40, Math.round(ancho / 12)));
  const centro = ancho / 2 + (o.dx || 0);
  const escala = ancho * 0.42;
  const altura = profundidad * 0.06;

  // Las puntas de cada fila se desvanecen para que no corten en seco.
  const trazo = ctx.createLinearGradient(0, 0, ancho, 0);
  trazo.addColorStop(0, rgba(o.linea, 0));
  trazo.addColorStop(0.2, rgba(o.linea, 1));
  trazo.addColorStop(0.8, rgba(o.linea, 1));
  trazo.addColorStop(1, rgba(o.linea, 0));

  const xReflejo = ancho * 0.66 + (o.dx || 0) * 1.6;
  const reflejo = ctx.createLinearGradient(xReflejo - ancho * 0.16, 0, xReflejo + ancho * 0.16, 0);
  reflejo.addColorStop(0, rgba(o.reflejo, 0));
  reflejo.addColorStop(0.5, rgba(o.reflejo, 1));
  reflejo.addColorStop(1, rgba(o.reflejo, 0));

  ctx.lineJoin = "round";
  for (let i = 0; i < filas; i++) {
    // s vale 1 en la fila más cercana y tiende a 0 en el horizonte.
    const s = Math.pow(1 - i / (filas - 1), 1.7);
    if (s < 0.01) break;
    const z = 1 / s;
    const base = horizonte + profundidad * 1.06 * s;
    const amplitud = altura * s;
    const zoom = escala * Math.max(s, 0.06);

    ctx.beginPath();
    for (let k = 0; k <= muestras; k++) {
      const x = (k / muestras) * ancho;
      const wx = (x - centro) / zoom;
      const ola = Math.sin(wx * 1.15 + z * 0.5 + t * 0.85) * 0.6
        + Math.sin(wx * 2.4 - z * 0.3 + t * 0.55) * 0.22
        + Math.sin(wx * 0.5 + z * 0.85 + t * 0.4) * 0.5;
      const y = base - ola * amplitud;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    const lejania = Math.pow(s, 0.55);
    ctx.lineWidth = 0.45 + 1.05 * s;
    ctx.strokeStyle = trazo;
    ctx.globalAlpha = alfa * (0.08 + 0.92 * lejania) * (1 - Math.pow(s, 4) * 0.55);
    ctx.stroke();

    ctx.strokeStyle = reflejo;
    ctx.globalAlpha = alfa * 0.9 * (0.25 + 0.75 * lejania) * (0.35 + 0.65 * Math.abs(Math.sin(t * 1.1 + i * 0.8)));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
