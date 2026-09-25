/* ═══════════════════════════════════════════════════════════════
   Recorrido 3D · el barco
   No hay modelos 3D de las unidades, así que el casco se arma con el
   plano de cada modelo: se lee el contorno del PNG columna por columna
   (manga en cada punto de la eslora), se levanta un casco con pantoque
   y quilla, y el mismo plano se pega sobre la cubierta. Resultado: cada
   línea tiene su propia silueta y su distribución real vista desde arriba.

   Ejes: proa hacia +x, estribor hacia +z, arriba +y. Eslora = LARGO.
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";

export const LARGO = 10;

function cargarImagen(src) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = mal;
    img.src = src;
  });
}

function medianaMovil(arr, ventana) {
  const r = Math.floor(ventana / 2);
  return arr.map((_, i) => {
    const tramo = arr.slice(Math.max(0, i - r), i + r + 1).filter(v => v != null);
    if (!tramo.length) return null;
    tramo.sort((a, b) => a - b);
    return tramo[Math.floor(tramo.length / 2)];
  });
}

function promedioMovil(arr, ventana) {
  const r = Math.floor(ventana / 2);
  return arr.map((v, i) => {
    if (v == null) return null;
    const tramo = arr.slice(Math.max(0, i - r), i + r + 1).filter(x => x != null);
    return tramo.reduce((a, b) => a + b, 0) / tramo.length;
  });
}

/* Lee el plano y devuelve el contorno + un canvas con el plano ya orientado
   (proa a la izquierda), listo para usar de textura. */
export async function leerPlano(src, espejo) {
  const img = await cargarImagen(src);
  const W = 480;
  const H = Math.round((img.height * W) / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (espejo) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const arriba = new Array(W).fill(null);
  const abajo = new Array(W).fill(null);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (data[(y * W + x) * 4 + 3] > 40) {
        if (arriba[x] == null) arriba[x] = y;
        abajo[x] = y;
      }
    }
  }
  // La mediana saca banderitas, anclas y cotas que asoman del casco.
  const sup = promedioMovil(medianaMovil(arriba, 13), 9);
  const inf = promedioMovil(medianaMovil(abajo, 13), 9);
  const conCasco = sup.map((v, i) => (v != null && inf[i] - v > 3 ? i : null)).filter(v => v != null);
  const x0 = conCasco[0] ?? 0;
  const x1 = conCasco[conCasco.length - 1] ?? W - 1;
  const centros = conCasco.map(i => (sup[i] + inf[i]) / 2);
  const cy = centros.reduce((a, b) => a + b, 0) / Math.max(1, centros.length);
  // Para la textura, el plano en alta: a 480 px las líneas quedan borrosas.
  const alta = document.createElement("canvas");
  alta.width = Math.min(2048, img.width * 2);
  alta.height = Math.round((img.height * alta.width) / img.width);
  const actx = alta.getContext("2d");
  if (espejo) { actx.translate(alta.width, 0); actx.scale(-1, 1); }
  actx.drawImage(img, 0, 0, alta.width, alta.height);
  return { canvas: alta, W, H, x0, x1, cy, sup, inf };
}

/* Plano recoloreado (líneas negras o blancas) para la cubierta. */
export function texturaPlano(plano, color) {
  const c = document.createElement("canvas");
  c.width = plano.canvas.width;
  c.height = plano.canvas.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(plano.canvas, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* Arma casco, cubierta y espejo de popa a partir del contorno. */
export function armarCasco(plano) {
  const { W, H, x0, x1, cy, sup, inf } = plano;
  const escala = LARGO / Math.max(1, x1 - x0);
  const N = 72;
  const D = LARGO * 0.075;           // puntal (altura de cubierta sobre el agua)
  const aro = [];                     // por sección: [cubiertaCentro, bandaEstribor, pantoqueE, quilla, pantoqueB, bandaBabor]
  const uvs = [];
  let mangaMax = 0;

  for (let i = 0; i <= N; i++) {
    const t = i / N;                  // 0 = proa, 1 = popa
    const px = x0 + (x1 - x0) * t;
    const col = Math.min(W - 1, Math.max(0, Math.round(px)));
    const s = sup[col] ?? cy;
    const f = inf[col] ?? cy;
    let media = ((f - s) / 2) * escala;
    if (i === 0) media = 0;           // la proa termina en punta
    mangaMax = Math.max(mangaMax, media);
    const zc = (cy - (s + f) / 2) * escala;
    const x = LARGO / 2 - t * LARGO;
    const u = 1 - t;                  // 0 popa … 1 proa
    const yd = D * (1 + 0.28 * u * u);                 // arrufo: sube hacia proa
    const yc = D * 0.16 + D * 0.5 * Math.max(0, u - 0.7);
    const quilla = u > 0.7 ? 1 - Math.pow((u - 0.7) / 0.3, 1.4) * 0.85 : 1;
    const yk = -D * 0.5 * quilla;
    aro.push([
      [x, yd, zc],
      [x, yd, zc + media],
      [x, yc, zc + media * 0.93],
      [x, yk, zc],
      [x, yc, zc - media * 0.93],
      [x, yd, zc - media],
    ]);
    // Coordenadas del PNG para la cubierta: centro, banda estribor (arriba en el plano), babor (abajo)
    const v = y => 1 - y / H;
    uvs.push([[px / W, v((s + f) / 2)], [px / W, v(s)], [px / W, v(f)]]);
  }

  const casco = new THREE.BufferGeometry();
  {
    const pos = [];
    const idx = [];
    aro.forEach(a => [1, 2, 3, 4, 5].forEach(k => pos.push(...a[k])));
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < 4; k++) {
        const a = i * 5 + k, b = a + 1, c = a + 5, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    // Espejo de popa
    const base = pos.length / 3;
    const ult = aro[N];
    const centro = [ult[0][0], (ult[0][1] + ult[3][1]) / 2, ult[0][2]];
    pos.push(...centro);
    [1, 2, 3, 4, 5, 0].forEach(k => pos.push(...ult[k]));
    for (let k = 0; k < 6; k++) idx.push(base, base + 1 + k, base + 1 + ((k + 1) % 6));
    casco.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    casco.setIndex(idx);
    casco.computeVertexNormals();
  }

  const cubierta = new THREE.BufferGeometry();
  {
    const pos = [];
    const uv = [];
    const idx = [];
    aro.forEach((a, i) => {
      pos.push(...a[5], ...a[0], ...a[1]);  // babor, centro, estribor
      const [c, e, b] = uvs[i];
      uv.push(...b, ...c, ...e);
    });
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < 2; k++) {
        const a = i * 3 + k, b = a + 1, c = a + 3, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    cubierta.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    cubierta.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    cubierta.setIndex(idx);
    cubierta.computeVertexNormals();
  }

  // Manga y altura de cubierta en cualquier punto (u: 0 popa … 1 proa)
  const enU = (u) => {
    const i = Math.round((1 - u) * N);
    const a = aro[Math.min(N, Math.max(0, i))];
    return { x: a[0][0], cubierta: a[0][1], media: Math.abs(a[1][2] - a[0][2]), zc: a[0][2] };
  };

  return { casco, cubierta, D, manga: mangaMax, enU };
}

/* ── Modelos 3D reales ──────────────────────────────────────────
   Exportados desde Rhino a .glb (ver scripts/rhino-a-glb.mjs). Vienen en
   metros, proa +x, estribor +z. Se escalan a LARGO y se arma el mismo
   perfil (enU) que el casco generado, así estaciones y puntos no cambian. */
/* Piezas que sólo se ven en la vista interior. */
export const INTERIOR = ["interior", "madera", "piso", "tela", "techo", "piedra", "loza"];

export async function cargarModelo({ url, lineas = false, corte: corteM = null }) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const raiz = gltf.scene;
  raiz.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(raiz);
  const tam = caja.getSize(new THREE.Vector3());
  const escala = LARGO / tam.x;
  // Flotación aproximada: el casco se sumerge ~0,9 m desde el punto más bajo.
  const flotacion = caja.min.y + 0.9;
  raiz.scale.setScalar(escala);
  raiz.position.set(-(caja.min.x + tam.x / 2) * escala, -flotacion * escala, 0);
  raiz.updateMatrixWorld(true);

  const piezas = {};
  const anclas = {};
  raiz.traverse(o => {
    if (o.isMesh) piezas[o.name || o.parent?.name] = o;
    else if (o.name?.startsWith("ancla:")) anclas[o.name.slice(6)] = o.getWorldPosition(new THREE.Vector3()).toArray();
  });
  // Altura del corte de la vista interior. Por orden: la que indique el modelo
  // (metros sobre la base del .3dm), 60 cm sobre el piso de los camarotes, o
  // tres cuartos de la altura del interior.
  const cajaDe = nombres => {
    const c = new THREE.Box3();
    nombres.forEach(n => { if (piezas[n]) c.expandByObject(piezas[n]); });
    return c.isEmpty() ? null : c;
  };
  const cajaInterior = cajaDe(INTERIOR);
  const cajaPiso = cajaDe(["piso"]);
  const corte = corteM != null
    ? (corteM - flotacion) * escala
    : cajaPiso ? cajaPiso.max.y + 0.6 * escala
    : cajaInterior ? cajaInterior.min.y + (cajaInterior.max.y - cajaInterior.min.y) * 0.74 : null;

  // Perfil: por franja de eslora, manga (máx |z|) y altura de borda (máx y del casco).
  const N = 60;
  const media = new Array(N + 1).fill(0);
  const borda = new Array(N + 1).fill(-Infinity);
  const v = new THREE.Vector3();
  ["casco", "cubierta"].forEach(nombre => {
    const m = piezas[nombre];
    if (!m) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const k = Math.round(((LARGO / 2 - v.x) / LARGO) * N);
      if (k < 0 || k > N) continue;
      media[k] = Math.max(media[k], Math.abs(v.z));
      if (nombre === "casco") borda[k] = Math.max(borda[k], v.y);
    }
  });
  for (let k = 0; k <= N; k++) if (!Number.isFinite(borda[k])) borda[k] = borda[k - 1] ?? 0;
  const D = Math.max(0.2, borda.reduce((a, b) => a + b, 0) / (N + 1));
  const enU = (u) => {
    const k = Math.min(N, Math.max(0, Math.round((1 - u) * N)));
    return { x: LARGO / 2 - (1 - u) * LARGO, cubierta: borda[k], media: Math.max(0.05, media[k]), zc: 0 };
  };
  const centroInterior = cajaInterior ? cajaInterior.getCenter(new THREE.Vector3()).toArray() : null;
  return { raiz, piezas, anclas, corte, centroInterior, D, manga: Math.max(...media), enU, real: true, lineas };
}

/* Texturas fotográficas (Poly Haven, CC0) en public/textures/recorrido.
   Las UV del .glb vienen en metros, proyectadas por caja: "metros" es cuánto
   mide de lado la imagen en el barco. */
const RUTA_TEX = "/textures/recorrido/";
export function texturaFoto(nombre, metros, { color = true } = {}) {
  const tex = new THREE.TextureLoader().load(`${RUTA_TEX}${nombre}.jpg`);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / metros, 1 / metros);
  tex.anisotropy = 8;
  return tex;
}

/* Teca de cubierta: la veta real del roble cortada en tablas de 10 cm, cada
   una con su tono, y las juntas negras de calafateo. 1 textura = 1 m. */
export function texturaTeca() {
  const T = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = T;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#b8895c";
  ctx.fillRect(0, 0, T, T);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    // La veta de la foto es vertical: se gira para que corra a lo largo de la tabla.
    const rot = document.createElement("canvas");
    rot.width = rot.height = T;
    const r = rot.getContext("2d");
    r.translate(T, 0);
    r.rotate(Math.PI / 2);
    r.drawImage(img, 0, 0, T, T);
    let semilla = 5;
    const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
    const tabla = T / 10;
    for (let f = 0; f < 10; f++) {
      const y = f * tabla;
      const desde = Math.floor(azar() * (T - tabla));
      ctx.drawImage(rot, 0, desde, T, tabla, 0, y, T, tabla);
      ctx.fillStyle = `rgba(${azar() > 0.5 ? "120,70,30" : "255,225,180"},${0.06 + azar() * 0.1})`;
      ctx.fillRect(0, y, T, tabla);
      ctx.fillStyle = "#23201d";
      ctx.fillRect(0, y, T, 6);
      ctx.fillRect(Math.floor(azar() * T), y, 6, tabla);
    }
    tex.needsUpdate = true;
  };
  img.src = `${RUTA_TEX}oak_veneer_01_diff.jpg`;
  return tex;
}
