// Hornea las mesadas de cuarzo Purastone del configurador (public/textures/purastone).
// Fuente: la foto de cada placa de la línea PURA en purastone.com (las *_PR de
// https://purastone.com/cdn/shop/files/, sin ?width= para bajarlas en su tamaño original).
//   npm i --no-save sharp
//   node scripts/purastone-mesadas.mjs carpeta [salida]
//     → <id>.jpg: la placa hecha textura repetible, en su tamaño real
//       <id>-m.jpg: la muestra del botón
// La foto se empareja (luz despareja de la sesión de fotos), se lleva al brillo de
// una mesada real (las fotos de catálogo vienen con el blanco quemado) y se hace
// repetible con cortes de mínima diferencia (image quilting, Efros y Freeman 2001):
// el borde derecho se superpone con el izquierdo y se corta por donde las dos fotos
// más se parecen, con un fundido de pocos píxeles; después lo mismo arriba y abajo.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

/* m: metros que cubre el ancho de la foto, medidos por el grano y las vetas en las
   fotos de ambientes de Purastone. fondo: brillo de la piedra (mediana, sRGB).
   aplanar: cuánto se corrige la luz despareja de la foto. muestra: qué parte de la
   textura se ve en el botón. */
const COLORES = [
  { id: "blanco-nube", foto: "Blanco_Nube_PC3P00P201_PR.webp", m: 0.4, fondo: 236, muestra: 0.35 },
  { id: "blanco-paloma", foto: "Blanco_Paloma_PC3P09P201__PR.webp", m: 0.4, fondo: 232, muestra: 0.35 },
  { id: "statuarietto", foto: "Statuarietto_PC3P15P20J_PR.webp", m: 1, fondo: 230, aplanar: 1, muestra: 0.6 },
  { id: "estatuario-venato", foto: "Estatuario_Venato_PC3P34P12J_PR.webp", m: 1.6, fondo: 234, muestra: 0.5 },
  { id: "calacatta-dor", foto: "Calacatta_Dor_PC3P48L20J_PR_77ae32a9-af83-48fd-a2c8-b21fca9697ac.jpg", m: 1.8, fondo: 238, muestra: 0.45 },
  { id: "crema-pisa", foto: "Crema_Pisa_PC3P11P201_PR.webp", m: 0.4, muestra: 0.35 },
  { id: "concrete-dark", foto: "Concrete_Dark_PC3P02L20J_PR.webp", m: 1, muestra: 0.5 },
  { id: "nero-marquina", foto: "Negro_Marquina_PC3P22P20J_PR.webp", m: 1.5, muestra: 0.5 },
];
const SOLAPE = 0.2; // parte de la foto que se superpone para cada corte
const FUNDIDO = 3;  // píxeles de fundido a cada lado del corte
const MUESTRA = 96;

const [, , carpeta, salida = "public/textures/purastone"] = process.argv;
const solo = process.env.SOLO?.split(",");

const aLineal = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const aSrgb = v => { v = Math.min(1, Math.max(0, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); };
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

async function leer(f) {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = new Float32Array(info.width * info.height * 3);
  for (let i = 0; i < d.length; i++) d[i] = aLineal[data[i]];
  return { W: info.width, H: info.height, d };
}

const luminancia = ({ W, H, d }) => Float32Array.from({ length: W * H }, (_, i) => 0.2126 * d[i * 3] + 0.7152 * d[i * 3 + 1] + 0.0722 * d[i * 3 + 2]);

// Desenfoque de caja (tres pasadas ≈ gaussiano), con los bordes repetidos.
function desenfocar(src, W, H, r) {
  let a = Float32Array.from(src), b = new Float32Array(W * H);
  const pasada = (ent, sal, largo, cant, paso, salto) => {
    for (let j = 0; j < cant; j++) {
      const base = j * salto;
      const px = i => ent[base + Math.min(largo - 1, Math.max(0, i)) * paso];
      let s = 0;
      for (let i = -r; i <= r; i++) s += px(i);
      for (let i = 0; i < largo; i++) {
        sal[base + i * paso] = s / (2 * r + 1);
        s += px(i + r + 1) - px(i - r);
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    pasada(a, b, W, H, 1, W);
    pasada(b, a, H, W, W, 1);
  }
  return a;
}

// La luz de la sesión de fotos (más clara arriba, más oscura en un rincón) se saca
// dividiendo por la luminancia muy desenfocada.
function aplanar(img, fuerza) {
  const { W, H, d } = img;
  const B = desenfocar(luminancia(img), W, H, Math.round(W / 8));
  const media = B.reduce((s, v) => s + v, 0) / B.length;
  for (let i = 0; i < W * H; i++) {
    const k = (media / B[i]) ** fuerza;
    for (let c = 0; c < 3; c++) d[i * 3 + c] *= k;
  }
}

function exponer(img, fondo) {
  const Y = luminancia(img).sort();
  const k = aLineal[fondo] / Y[Math.floor(Y.length / 2)];
  for (let i = 0; i < img.d.length; i++) img.d[i] *= k;
  return k;
}

/* Camino de corte de mínimo error, de arriba abajo por la franja de solape (una
   columna por fila, moviéndose a lo sumo un píxel), que termina donde empezó: al
   repetir la textura hacia el otro lado el corte también empalma. */
function cortePeriodico(err, w, n, margen) {
  const lo = margen, hi = w - 1 - margen;
  const costo = new Float32Array(n * w), desde = new Int8Array(n * w);
  let mejor = Infinity, camino = null;
  for (let s = lo; s <= hi; s += 2) {
    costo.fill(Infinity, 0, w);
    costo[s] = err[s];
    for (let y = 1; y < n; y++) {
      const f = y * w, p = f - w;
      for (let x = lo; x <= hi; x++) {
        let m = costo[p + x], dx = 0;
        if (x > lo && costo[p + x - 1] < m) { m = costo[p + x - 1]; dx = -1; }
        if (x < hi && costo[p + x + 1] < m) { m = costo[p + x + 1]; dx = 1; }
        costo[f + x] = m + err[f + x];
        desde[f + x] = dx;
      }
    }
    for (let x = Math.max(lo, s - 1); x <= Math.min(hi, s + 1); x++) {
      const c = costo[(n - 1) * w + x];
      if (c >= mejor) continue;
      mejor = c;
      camino = new Int16Array(n);
      camino[n - 1] = x;
      for (let y = n - 1; y > 0; y--) camino[y - 1] = camino[y] + desde[y * w + camino[y]];
    }
  }
  return camino;
}

/* Repetible de izquierda a derecha: la textura es la foto sin su franja derecha, y
   la franja izquierda se arma con la derecha (que sigue al final de la textura)
   hasta el corte y con la propia (que sigue hacia adentro) después. */
function costuraH({ W, H, d }) {
  const w = Math.round(W * SOLAPE), W2 = W - w;
  const err = new Float32Array(H * w);
  for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) {
    let e = 0;
    for (let c = 0; c < 3; c++) e += (Math.sqrt(d[(y * W + W2 + x) * 3 + c]) - Math.sqrt(d[(y * W + x) * 3 + c])) ** 2;
    err[y * w + x] = e;
  }
  const corte = cortePeriodico(err, w, H, FUNDIDO + 1);
  const out = new Float32Array(W2 * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W2; x++) {
    const o = (y * W2 + x) * 3, i = (y * W + x) * 3;
    const t = x >= w ? 1 : suave(corte[y] - FUNDIDO, corte[y] + FUNDIDO, x);
    for (let c = 0; c < 3; c++) out[o + c] = t === 1 ? d[i + c] : d[(y * W + W2 + x) * 3 + c] * (1 - t) + d[i + c] * t;
  }
  return { W: W2, H, d: out };
}

function transponer({ W, H, d }) {
  const o = new Float32Array(d.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) o[(x * H + y) * 3 + c] = d[(y * W + x) * 3 + c];
  return { W: H, H: W, d: o };
}

const aBytes = ({ d }) => Uint8Array.from(d, aSrgb);
const crudo = img => sharp(Buffer.from(aBytes(img)), { raw: { width: img.W, height: img.H, channels: 3 } });

fs.mkdirSync(salida, { recursive: true });
for (const col of COLORES) {
  if (solo && !solo.includes(col.id)) continue;
  let img = await leer(path.join(carpeta, col.foto));
  const W0 = img.W, H0 = img.H;
  if (col.aplanar) aplanar(img, col.aplanar);
  const k = col.fondo ? exponer(img, col.fondo) : 1;
  img = transponer(costuraH(transponer(costuraH(img))));
  const metros = [col.m * img.W / W0, col.m * (H0 / W0) * img.H / H0];
  await crudo(img).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(salida, `${col.id}.jpg`));
  const lado = Math.round(Math.min(img.W, img.H) * col.muestra);
  await crudo(img).extract({ left: Math.round((img.W - lado) / 2), top: Math.round((img.H - lado) / 2), width: lado, height: lado })
    .resize(MUESTRA, MUESTRA, { kernel: "lanczos3" }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(salida, `${col.id}-m.jpg`));
  const kb = fs.statSync(path.join(salida, `${col.id}.jpg`)).size / 1024;
  console.log(`${col.id}: ${img.W}x${img.H} px, ${metros.map(v => v.toFixed(3)).join(" x ")} m, brillo x${k.toFixed(3)}, ${kb.toFixed(0)} KB`);
}
