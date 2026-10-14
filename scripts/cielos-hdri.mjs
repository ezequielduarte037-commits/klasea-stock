// Cielos del configurador: HDRI "puresky" de Poly Haven (CC0) → JPG livianos.
// De cada HDRI 4K se guarda sólo la mitad de arriba (abajo va el mar) más
// 11° bajo el horizonte, normalizada (mediana del cielo = 1) y codificada
// como lineal/K en sRGB (K = 6: el sol queda recortado en 6, lo justo para
// el resplandor). También se mide la dirección y el color del sol y el color
// del horizonte (para la niebla) → public/cielos/cielos.json.
//   npm i --no-save sharp   (además de three, que ya está)
//   node scripts/cielos-hdri.mjs carpetaTemporal id1 id2 ...
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import sharp from "sharp";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const [tmp, ...ids] = process.argv.slice(2);
const K = 6;
const SALIDA = "public/cielos";
fs.mkdirSync(SALIDA, { recursive: true });
const indice = fs.existsSync(`${SALIDA}/cielos.json`) ? JSON.parse(fs.readFileSync(`${SALIDA}/cielos.json`, "utf8")) : {};
const srgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

for (const id of ids) {
  const archivo = `${tmp}/${id}_4k.hdr`;
  if (!fs.existsSync(archivo)) execFileSync("curl", ["-s", "-o", archivo, `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/${id}_4k.hdr`]);
  const b = fs.readFileSync(archivo);
  const l = new RGBELoader(); l.setDataType(THREE.FloatType);
  const { width: W, height: H, data } = l.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const elevDe = fila => 90 - (fila + 0.5) / H * 180;
  const filas = Math.round(H * (90 + 11.25) / 180);
  const lum = i => data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  // mediana del cielo entre 5° y 60°
  const muestras = [];
  for (let y = 0; y < filas; y += 4) { const e = elevDe(y); if (e < 5 || e > 60) continue; for (let x = 0; x < W; x += 8) muestras.push(lum((y * W + x) * 4)); }
  muestras.sort((a, b) => a - b);
  const escala = 1 / Math.max(1e-6, muestras[Math.floor(muestras.length / 2)]);
  // sol: el píxel más brillante sobre −5°
  let max = -1, sx = 0, sy = 0;
  for (let y = 0; y < filas; y++) { if (elevDe(y) < -5) break; for (let x = 0; x < W; x++) { const v = lum((y * W + x) * 4); if (v > max) { max = v; sx = x; sy = y; } } }
  const elevSol = elevDe(sy), azSol = ((sx + 0.5) / W - 0.5) * 360;
  const promedio = (cond) => { const c = [0, 0, 0]; let n = 0; for (let y = 0; y < filas; y += 2) for (let x = 0; x < W; x += 4) { if (!cond(x, y)) continue; const i = (y * W + x) * 4; c[0] += data[i]; c[1] += data[i + 1]; c[2] += data[i + 2]; n++; } return c.map(v => +(v / Math.max(1, n) * escala).toFixed(4)); };
  const horizonte = promedio((x, y) => { const e = elevDe(y); return e >= 0 && e < 4; });
  const cenit = promedio((x, y) => elevDe(y) > 60);
  const cerca = (x, y) => { const e = elevDe(y), a = ((x + 0.5) / W - 0.5) * 360; let d = Math.abs(a - azSol); d = Math.min(d, 360 - d); return Math.abs(e - elevSol) < 2.5 && d < 2.5 / Math.max(0.2, Math.cos(e * Math.PI / 180)); };
  const solColor = promedio(cerca);
  // imagen: lineal/K en sRGB
  const out = Buffer.alloc(W * filas * 3);
  for (let y = 0; y < filas; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, o = (y * W + x) * 3;
    for (let k = 0; k < 3; k++) out[o + k] = Math.round(255 * srgb(Math.min(1, Math.max(0, data[i + k] * escala / K))));
  }
  await sharp(out, { raw: { width: W, height: filas, channels: 3 } }).jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: "4:4:4" }).toFile(`${SALIDA}/${id}.jpg`);
  await sharp(out, { raw: { width: W, height: filas, channels: 3 } }).resize(800).jpeg().toFile(`${tmp}/${id}_prev.jpg`);
  fs.unlinkSync(archivo);
  const tam = fs.statSync(`${SALIDA}/${id}.jpg`).size;
  indice[id] = { sol: { elev: +elevSol.toFixed(2), az: +azSol.toFixed(2), color: solColor, fuerza: +(max * escala).toFixed(1) }, horizonte, cenit, filas, ancho: W };
  console.log(id, "escala", escala.toExponential(2), "sol", elevSol.toFixed(1), azSol.toFixed(1), "fuerza", (max * escala).toFixed(0), "horizonte", horizonte, (tam / 1e6).toFixed(2), "MB");
}
fs.writeFileSync(`${SALIDA}/cielos.json`, JSON.stringify(indice, null, 1));
