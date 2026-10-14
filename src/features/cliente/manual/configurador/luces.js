/* ═══════════════════════════════════════════════════════════════
   Configurador · luces y espuma del casco
   Luces de navegación con sus sectores reales (roja a babor, verde a
   estribor: se ven sólo desde proa hasta 22,5° detrás del través; la de
   tope en todo el horizonte), luces de cortesía ubicadas sobre el modelo
   (se buscan el piso y la borda del cockpit con rayos) y la espuma donde
   el casco toca el agua.
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";
import { LARGO } from "../recorrido/barco";

const suave = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* Sprite aditivo con color en HDR (intensidad > 1): el bloom de la escena
   hace el resplandor, como la lente de una cámara. pantalla: tamaño fijo en
   pantalla (un punto de luz se ve igual de cerca que de lejos). */
function sprite(mapa, color, escala, { intensidad = 1, pantalla = false } = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: mapa, color: new THREE.Color(color).multiplyScalar(intensidad), transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: !pantalla,
  }));
  s.scale.setScalar(escala);
  return s;
}

/* Una luz de navegación: el punto de la lámpara (casi blanco al centro, como
   se ve una luz roja muy fuerte) y un halo tenue del color de la luz. */
function foco(mapa, color, pos, { halo = 0.42 } = {}) {
  const g = new THREE.Group();
  g.position.set(...pos);
  const n = sprite(mapa, new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.5), 0.011, { intensidad: 28, pantalla: true });
  const h = sprite(mapa, color, halo, { intensidad: 2.4 });
  g.add(h, n);
  g.userData.partes = { n, h };
  return g;
}

/* Luces de navegación según las anclas del modelo. sector: "babor",
   "estribor" o "todo" (tope). */
export function crearNavegacion(modelo, mapa) {
  const a = modelo.anclas || {};
  const luces = [];
  if (a["nav-babor"]) luces.push({ sector: "babor", g: foco(mapa, "#ff2a1c", a["nav-babor"]) });
  if (a["nav-estribor"]) luces.push({ sector: "estribor", g: foco(mapa, "#19ff7a", a["nav-estribor"]) });
  if (a.tope) luces.push({ sector: "todo", g: foco(mapa, "#fff3df", a.tope, { halo: 0.5 }) });
  return luces;
}

/* Cuánto se ve cada luz desde la cámara (0 a 1). Proa +x, babor −z. */
export function visibilidad(sector, luz, camara) {
  if (sector === "todo") return 1;
  const dx = camara.x - luz.x, dz = camara.z - luz.z;
  // Marcación desde proa, positiva hacia babor.
  const b = THREE.MathUtils.radToDeg(Math.atan2(-dz, dx));
  const m = sector === "babor" ? b : -b;
  return suave(-4, 2, m) * (1 - suave(110, 116, m));
}

export function prenderNavegacion(luces, camara, intensidad) {
  const p = new THREE.Vector3();
  luces.forEach(({ sector, g }) => {
    g.getWorldPosition(p);
    const v = visibilidad(sector, p, camara.position) * intensidad;
    const { n, h } = g.userData.partes;
    n.material.opacity = v;
    h.material.opacity = v * 0.35;
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

  for (let u = 0.27; u <= 0.5; u += 0.032) {
    const s = modelo.enU(u);
    [-1, 1].forEach(lado => {
      const yp = piso(s.x, lado * s.media * 0.5, s.cubierta);
      if (yp == null) return;
      const y = yp + 0.09;
      rayo.set(new THREE.Vector3(s.x, y, lado * s.media * 0.2), new THREE.Vector3(0, 0, lado));
      const h = rayo.intersectObjects(piezas, false).find(i => Math.abs(normalDe(i).z) > 0.5);
      if (!h || h.distance > s.media * 1.1) return;
      leds.push({ pos: [h.point.x, y, h.point.z - lado * 0.012], piso: yp, lado });
    });
  }

  // Espejo de popa: tres LEDs justo sobre la planchada, mirando hacia atrás.
  const popa = modelo.enU(0.02);
  const yPlanchada = piso(popa.x, 0, popa.cubierta + 0.5);
  if (yPlanchada != null) {
    [-0.55, 0, 0.55].forEach(z => {
      rayo.set(new THREE.Vector3(-LARGO, yPlanchada + 0.06, z), new THREE.Vector3(1, 0, 0));
      const h = rayo.intersectObjects(piezas, false).find(i => normalDe(i).x < -0.5 && i.point.y > yPlanchada);
      if (h && h.point.x < 0) leds.push({ pos: [h.point.x - 0.012, yPlanchada + 0.06, h.point.z], piso: yPlanchada, lado: 0 });
    });
  }
  return leds;
}

/* Cada LED: un punto cálido y el charco de luz que deja en el piso. */
export function crearCortesia(leds, mapa) {
  const grupo = new THREE.Group();
  const charcos = [];
  const puntos = [];
  leds.forEach(({ pos, piso, lado }) => {
    const p = sprite(mapa, "#ffd9a8", 0.006, { intensidad: 14, pantalla: true });
    p.position.set(...pos);
    const h = sprite(mapa, "#ffb862", 0.16, { intensidad: 2 });
    h.position.set(...pos);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: mapa, color: new THREE.Color("#ffbf73").multiplyScalar(1.3), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    }));
    c.rotation.x = -Math.PI / 2;
    // El charco cae delante del LED, hacia el centro del barco (o hacia popa en el espejo).
    if (lado) c.position.set(pos[0], piso + 0.004, pos[2] - lado * 0.2);
    else c.position.set(pos[0] - 0.2, piso + 0.004, pos[2]);
    c.scale.set(lado ? 0.7 : 0.55, lado ? 0.45 : 0.6, 1);
    grupo.add(c, h, p);
    puntos.push(p, h);
    charcos.push(c);
  });
  return { grupo, puntos, charcos };
}

export function prenderCortesia(c, intensidad) {
  c.puntos.forEach((s, i) => { s.material.opacity = intensidad * (i % 2 ? 0.3 : 1); });
  c.charcos.forEach(m => { m.material.opacity = intensidad * 0.7; });
  c.grupo.visible = intensidad > 0.005;
}

/* Espuma donde el casco toca el agua: se mide el ancho del casco en la
   flotación, franja por franja, y se pinta un borde blanco suave alrededor. */
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

export function crearEspumaCasco(modelo, espuma) {
  const a = anchoFlotacion(modelo);
  if (!a) return null;
  const { liso, N, x0, x1, max: maxAncho } = a;
  const alto = maxAncho * 2 + 1.2;
  const W = 512, H = 160;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H);
  // Segundo lienzo: la sombra del casco sobre el agua (más oscura pegada al
  // casco y se abre hacia afuera). Es lo que hace que el barco "apoye".
  const cs = document.createElement("canvas");
  cs.width = W; cs.height = H;
  const ctxS = cs.getContext("2d");
  const imgS = ctxS.createImageData(W, H);
  for (let px = 0; px < W; px++) {
    const k = Math.round((px / (W - 1)) * (N - 1));
    const w = liso[k];
    for (let py = 0; py < H; py++) {
      const z = Math.abs((py / (H - 1) - 0.5) * alto);
      // Pegada al casco y un poco hacia afuera; nada adentro del casco.
      const d = z - w;
      const a = w > 0.02 ? Math.max(0, 1 - Math.abs(d - 0.04) / 0.16) * (d > -0.02 ? 1 : 0) : 0;
      const o = (py * W + px) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(255 * a);
      // Sombra: hacia los extremos (proa y popa) se apaga con el ancho.
      const sAlfa = w > 0.02 ? Math.exp(-Math.max(0, d) / 0.3) * Math.min(1, w / 0.6) : 0;
      imgS.data[o + 3] = Math.round(255 * 0.5 * sAlfa);
    }
  }
  ctx.putImageData(img, 0, 0);
  ctxS.putImageData(imgS, 0, 0);
  const formaSombra = new THREE.CanvasTexture(cs);
  const sombra = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, alto), new THREE.MeshBasicMaterial({
    map: formaSombra, color: "#000000", transparent: true, opacity: 0.55, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }));
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.set((x0 + x1) / 2, 0.04, 0);
  sombra.renderOrder = 1;
  const forma = new THREE.CanvasTexture(c);
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, alto), new THREE.MeshBasicMaterial({
    map: forma, alphaMap: espuma, transparent: true, opacity: 0.5, depthWrite: false, color: "#e9f1f3",
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }));
  malla.rotation.x = -Math.PI / 2;
  malla.position.set((x0 + x1) / 2, 0.05, 0);
  malla.renderOrder = 2;
  return { malla, forma, sombra, formaSombra };
}
