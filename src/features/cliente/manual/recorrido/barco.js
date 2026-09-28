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

/* Colores que el recorrido cambia según el tono del manual (día o noche): el
   "interior" genérico siempre y, en los modelos sin materiales propios
   (lineas, como el K64), la piel del casco. */
export function coloresDelTono(tono, lineas) {
  const noche = tono === "noche";
  return {
    interior: noche ? "#3a3a3a" : "#e8e6e1",
    ...(lineas ? { casco: noche ? "#1b1b1b" : "#ffffff" } : {}),
  };
}

/* Ajustes del lienzo, iguales en el recorrido y en el probador. */
export function prepararLienzo(gl) {
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.05;
  gl.localClippingEnabled = true;
  // El barco no se mueve ni la luz tampoco: la sombra se calcula una vez por
  // cambio de vista, no en cada cuadro.
  gl.shadowMap.autoUpdate = false;
}

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
export const INTERIOR = ["interior", "madera", "piso", "tela", "cojin", "techo", "piedra", "loza"];

/* El GLTFLoader limpia los nombres de los nodos ("ancla:vhf" queda "anclavhf");
   el original sigue en userData. */
const nombreGltf = o => o.userData?.name ?? o.name;

async function leerGlb(url) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return (await loader.loadAsync(url)).scene;
}

/* Mallas por nombre de acabado; los tapizados vienen sin normales y el
   sombreado suave se calcula acá. */
function piezasDe(raiz) {
  const piezas = {};
  raiz.traverse(o => {
    if (!o.isMesh) return;
    piezas[o.name || o.parent?.name] = o;
    if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
  });
  return piezas;
}

/* Mallas que no son un acabado propio sino parte de otro. */
export const MATERIAL_DE = { costado: "casco" };
export const materialDe = nombre => MATERIAL_DE[nombre] ?? nombre;

/* Cada superficie del .3dm llega como un parche suelto dentro de su malla.
   Arma los parches (union-find por vértices compartidos), le pasa a `datos`
   cada triángulo con sus tres vértices en coordenadas de mundo, y mueve a una
   malla nueva los parches que `elegir` acepta. */
function separarPiezas(malla, nombre, datos, elegir) {
  const g = malla.geometry;
  const idx = g.index?.array;
  if (!idx) return null;
  const pos = g.attributes.position;
  const padre = new Int32Array(pos.count);
  for (let i = 0; i < padre.length; i++) padre[i] = i;
  const raiz = x => { while (padre[x] !== x) { padre[x] = padre[padre[x]]; x = padre[x]; } return x; };
  for (let i = 0; i < idx.length; i += 3) {
    const a = raiz(idx[i]);
    const b = raiz(idx[i + 1]);
    if (a !== b) padre[a] = b;
    const c = raiz(idx[i + 2]);
    const r = raiz(b);
    if (c !== r) padre[c] = r;
  }
  const piezas = new Map();
  const vs = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < idx.length; i += 3) {
    const r = raiz(idx[i]);
    let p = piezas.get(r);
    if (!p) piezas.set(r, p = {});
    vs.forEach((v, k) => v.fromBufferAttribute(pos, idx[i + k]).applyMatrix4(malla.matrixWorld));
    datos(p, vs);
  }
  const nueva = [];
  const resto = [];
  for (let i = 0; i < idx.length; i += 3) {
    (elegir(piezas.get(raiz(idx[i]))) ? nueva : resto).push(idx[i], idx[i + 1], idx[i + 2]);
  }
  if (!nueva.length) return null;
  const Indices = idx.constructor;
  g.setIndex(new THREE.BufferAttribute(new Indices(resto), 1));
  const gn = new THREE.BufferGeometry();
  Object.entries(g.attributes).forEach(([n, atributo]) => gn.setAttribute(n, atributo));
  gn.setIndex(new THREE.BufferAttribute(new Indices(nueva), 1));
  const m = new THREE.Mesh(gn, malla.material);
  m.name = nombre;
  m.position.copy(malla.position);
  m.quaternion.copy(malla.quaternion);
  m.scale.copy(malla.scale);
  malla.parent.add(m);
  m.updateMatrixWorld(true);
  return m;
}

/* Almohadones sueltos del interior. En el .3dm están en la misma capa que
   colchones y respaldos, así que llegan todos como "tela" y quedaban del mismo
   gris, arrugados como piedras. Se reconocen por la forma: cada almohadón es una
   pieza suelta, chica y con mucho detalle; un colchón o un respaldo llega en
   parches grandes y lisos. Se pasan a una malla "cojin" con su propio acabado. */
function separarCojines(malla, escala) {
  const tam = new THREE.Vector3();
  return separarPiezas(malla, "cojin",
    (p, vs) => { p.tri = (p.tri || 0) + 1; p.caja ||= new THREE.Box3(); vs.forEach(v => p.caja.expandByPoint(v)); },
    // Más de 150 triángulos en menos de 60 cm (medidas reales del barco).
    p => p.tri >= 150 && Math.max(...p.caja.getSize(tam).toArray()) / escala <= 0.6);
}

/* Costado del casco. En el .3dm del K43 la parte de arriba del costado (la
   borda, hasta la línea de la cubierta) está en la capa de cubierta: al
   cambiarle el color al casco quedaba una franja blanca. Se pasan al casco los
   parches de la cubierta que miran hacia afuera y están en la manga del barco
   en ese punto; los que miran hacia adentro (el interior de la borda) o están
   más adentro (bañera, pasillos) siguen como cubierta. La manga se mide sólo
   con el casco: los balcones rebatibles vienen abiertos y sobresalen, y con
   ellos la borda de popa quedaba "adentro" y seguía blanca. */
function separarCostado(cubierta, casco, escala) {
  const N = 80;
  const manga = new Float32Array(N + 1);
  const v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity;
  const recorrer = (m, fn) => {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) fn(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  };
  [casco, cubierta].forEach(m => recorrer(m, q => { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); }));
  const franja = x => Math.min(N, Math.max(0, Math.round(((x - x0) / Math.max(1e-6, x1 - x0)) * N)));
  recorrer(casco, q => { const k = franja(q.x); manga[k] = Math.max(manga[k], Math.abs(q.z)); });
  // Franjas sin casco (puntas): la vecina más cercana.
  for (let k = 1; k <= N; k++) if (!manga[k]) manga[k] = manga[k - 1];
  for (let k = N - 1; k >= 0; k--) if (!manga[k]) manga[k] = manga[k + 1];
  const margen = 0.12 * escala; // 12 cm reales
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  return separarPiezas(cubierta, "costado",
    (p, [a, b, c]) => {
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
      const area = n.length();
      if (!area) return;
      n.divideScalar(area);
      const cx = (a.x + b.x + c.x) / 3;
      const cz = (a.z + b.z + c.z) / 3;
      const lado = Math.sign(cz) || 1;
      const afuera = n.z * lado > 0.45 && Math.abs(n.y) < 0.9 && Math.abs(cz) >= manga[franja(cx)] - margen;
      p.total = (p.total || 0) + area;
      if (afuera) p.afuera = (p.afuera || 0) + area;
    },
    // Un parche entero o nada: triángulo por triángulo quedaban dientes.
    p => p.total > 0 && (p.afuera || 0) / p.total >= 0.5);
}

/* interior: .glb aparte con el interior solo (mismas coordenadas del .3dm).
   La vista interior pasa a ese modelo en lugar de cortar el exterior. */
export async function cargarModelo({ url, lineas = false, corte: corteM = null, interior: urlInterior = null }) {
  const [raiz, raizInterior] = await Promise.all([leerGlb(url), urlInterior ? leerGlb(urlInterior).catch(() => null) : null]);
  raiz.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(raiz);
  const tam = caja.getSize(new THREE.Vector3());
  const escala = LARGO / tam.x;
  // Flotación aproximada: el casco se sumerge ~0,9 m desde el punto más bajo.
  const flotacion = caja.min.y + 0.9;
  raiz.scale.setScalar(escala);
  raiz.position.set(-(caja.min.x + tam.x / 2) * escala, -flotacion * escala, 0);
  raiz.updateMatrixWorld(true);

  const piezas = piezasDe(raiz);
  const anclas = {};
  const anotarAnclas = r => r.traverse(o => {
    const n = nombreGltf(o);
    if (n?.startsWith("ancla:")) anclas[n.slice(6)] ??= o.getWorldPosition(new THREE.Vector3()).toArray();
  });
  anotarAnclas(raiz);
  let aparte = null;
  if (raizInterior) {
    raizInterior.scale.copy(raiz.scale);
    raizInterior.position.copy(raiz.position);
    raizInterior.updateMatrixWorld(true);
    raizInterior.visible = false;
    // Equipos del interior (baño, cocina, bajada): sus anclas vienen en este modelo.
    anotarAnclas(raizInterior);
    const c = new THREE.Box3().setFromObject(raizInterior);
    const piezasInterior = piezasDe(raizInterior);
    const cojin = piezasInterior.tela && separarCojines(piezasInterior.tela, escala);
    if (cojin) piezasInterior.cojin = cojin;
    aparte = { raiz: raizInterior, piezas: piezasInterior, centro: c.getCenter(new THREE.Vector3()).toArray() };
  }
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
  const centroInterior = aparte?.centro ?? (cajaInterior ? cajaInterior.getCenter(new THREE.Vector3()).toArray() : null);
  // Después del perfil, que mide casco y cubierta como vinieron. Sólo en los
  // modelos con materiales propios (el K43): el K64 va en blanco con contornos.
  if (!lineas && piezas.cubierta && piezas.casco) {
    const costado = separarCostado(piezas.cubierta, piezas.casco, escala);
    if (costado) piezas.costado = costado;
  }
  return { raiz, piezas, anclas, corte, centroInterior, D, manga: Math.max(...media), enU, real: true, lineas, aparte };
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

/* Roble de muebles y mamparos. La foto (grey_oak_veneer_01) es rosada y de veta
   casi invisible: de lejos el interior parecía cartón. Se lleva a un roble
   natural neutro y se le sube el contraste a la veta, conservando el dibujo de
   la foto. El color ya viene en la textura: el material va en blanco. */
export function texturaRoble(metros) {
  const T = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = T;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#b0a088";
  ctx.fillRect(0, 0, T, T);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / metros, 1 / metros);
  tex.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, T, T);
    const datos = ctx.getImageData(0, 0, T, T);
    const d = datos.data;
    let suma = 0;
    for (let i = 0; i < d.length; i += 4) suma += d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
    const media = suma / (d.length / 4);
    const base = [176, 160, 136];
    for (let i = 0; i < d.length; i += 4) {
      const veta = (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722 - media) * 2.6;
      d[i] = base[0] + veta;
      d[i + 1] = base[1] + veta * 0.96;
      d[i + 2] = base[2] + veta * 0.88;
    }
    ctx.putImageData(datos, 0, 0);
    tex.needsUpdate = true;
  };
  img.src = `${RUTA_TEX}grey_oak_veneer_01_diff.jpg`;
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
